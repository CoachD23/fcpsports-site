/**
 * register-youth-league.js
 * Handles FCP Sports Saturday Youth Basketball League registrations.
 *
 * 1. Upserts parent contact in GoHighLevel
 * 2. Applies tags + creates a detailed note
 * 3. Writes registration to Airtable "Youth_League_Registrations" table
 *
 * POST body (from multi-step form):
 *   parentEmail, parentFirst, parentLast, parentPhone, parentZip,
 *   referralCode, smsConsent, childFirst, childLast, childDob,
 *   division, divisionName, buddyRequest, emergencyName, emergencyPhone,
 *   medicalNotes, jerseySize, photoConsent, parentPledge,
 *   priceTier, priceAmount
 *
 * Env vars required:
 *   GHL_API_KEY        GoHighLevel Private Integration token
 *   GHL_LOCATION_ID    GHL sub-account location ID
 *   AIRTABLE_PAT       Airtable Personal Access Token
 *   AIRTABLE_BASE_ID   FCP Command Center base ID (appkMMHb5vEXfFvVe)
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const AIRTABLE_BASE = "https://api.airtable.com/v0";

/* --- Rate limiting --- */
const rateLimit = {};
const RATE_WINDOW = 60_000;
const RATE_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_WINDOW);
  if (rateLimit[ip].length >= RATE_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

/* --- Helpers --- */
function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
    "Content-Type": "application/json",
  };
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function json(obj) {
  return JSON.stringify(obj);
}

/* --- Main handler --- */
exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "https://fcpsports.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: json({ error: "Method not allowed" }) };
  }

  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers: cors, body: json({ error: "Too many requests. Please wait a moment." }) };
  }

  /* --- Parse & validate --- */
  let b;
  try {
    b = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: cors, body: json({ error: "Invalid request" }) };
  }

  /* --- Partial save (Step 1 lead capture) --- */
  if (b.partial) {
    const partialRequired = ["parentEmail", "parentFirst", "parentLast", "parentPhone", "parentZip"];
    for (const field of partialRequired) {
      if (!b[field] || !String(b[field]).trim()) {
        return { statusCode: 400, headers: cors, body: json({ error: `Missing: ${field}` }) };
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.parentEmail.trim())) {
      return { statusCode: 400, headers: cors, body: json({ error: "Invalid email" }) };
    }
    const hasGhlPartial = process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID;
    if (hasGhlPartial) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await fetch(`${GHL_BASE}/contacts/upsert`, {
          method: "POST",
          headers: ghlHeaders(),
          body: json({
            locationId: process.env.GHL_LOCATION_ID,
            firstName: b.parentFirst.trim(),
            lastName: b.parentLast.trim(),
            email: b.parentEmail.trim().toLowerCase(),
            phone: normalizePhone(b.parentPhone),
            postalCode: b.parentZip.trim(),
            tags: ["fcpsports", "youth-league-partial", `submitted-${today}`],
            source: "youth-league-partial",
          }),
        });
      } catch (e) {
        console.warn("[register-youth-league] Partial save GHL error:", e.message);
      }
    }
    console.log(`[register-youth-league] Partial lead: ${b.parentEmail}`);
    return { statusCode: 200, headers: cors, body: json({ ok: true }) };
  }

  const required = ["parentEmail", "parentFirst", "parentLast", "parentPhone", "parentZip",
    "childFirst", "childLast", "childDob", "division", "jerseySize",
    "emergencyName", "emergencyPhone"];

  for (const field of required) {
    if (!b[field] || !String(b[field]).trim()) {
      return { statusCode: 400, headers: cors, body: json({ error: `Missing required field: ${field}` }) };
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.parentEmail.trim())) {
    return { statusCode: 400, headers: cors, body: json({ error: "Invalid email address" }) };
  }

  const hasGhl = process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID;
  const hasAirtable = process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID;
  const hasAuthnet = process.env.AUTHNET_API_LOGIN && process.env.AUTHNET_TRANSACTION_KEY;

  if (!hasGhl && !hasAirtable) {
    console.error("[register-youth-league] No GHL or Airtable credentials configured");
    return { statusCode: 500, headers: cors, body: json({ error: "Registration system not configured" }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  let transactionId = null;
  let paymentStatus = "Pending";

  /* --- 0. Authorize.net: Charge card --- */
  if (hasAuthnet && b.payment && b.payment.dataValue) {
    try {
      const authnetPayload = {
        createTransactionRequest: {
          merchantAuthentication: {
            name: process.env.AUTHNET_API_LOGIN,
            transactionKey: process.env.AUTHNET_TRANSACTION_KEY,
          },
          transactionRequest: {
            transactionType: "authCaptureTransaction",
            amount: String(b.priceAmount),
            payment: {
              opaqueData: {
                dataDescriptor: b.payment.dataDescriptor,
                dataValue: b.payment.dataValue,
              },
            },
            order: {
              invoiceNumber: `YL-${Date.now().toString(36).toUpperCase()}`,
              description: `Youth League Summer 2026 — ${b.childFirst} ${b.childLast} (${b.divisionName || b.division})`,
            },
            customer: {
              email: b.parentEmail.trim().toLowerCase(),
            },
            billTo: {
              firstName: b.parentFirst.trim(),
              lastName: b.parentLast.trim(),
              zip: b.parentZip.trim(),
            },
          },
        },
      };

      const authnetUrl = (process.env.AUTHNET_ENV === "sandbox")
        ? "https://apitest.authorize.net/xml/v1/request.api"
        : "https://api.authorize.net/xml/v1/request.api";

      const payRes = await fetch(authnetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json(authnetPayload),
      });

      // Authorize.net returns 200 even on declines — check the response body
      const raw = await payRes.text();
      // Strip BOM if present
      const payData = JSON.parse(raw.replace(/^\uFEFF/, ""));

      const txResult = payData.transactionResponse;
      if (
        payData.messages?.resultCode === "Ok" &&
        txResult &&
        (txResult.responseCode === "1") // 1 = Approved
      ) {
        transactionId = txResult.transId;
        paymentStatus = "Paid";
        console.log(`[register-youth-league] Payment approved: $${b.priceAmount} txn=${transactionId}`);
      } else {
        const errMsg = txResult?.errors?.[0]?.errorText
          || payData.messages?.message?.[0]?.text
          || "Payment declined";
        console.error("[register-youth-league] Payment failed:", errMsg);
        return {
          statusCode: 402,
          headers: cors,
          body: json({ error: `Payment failed: ${errMsg}` }),
        };
      }
    } catch (err) {
      console.error("[register-youth-league] Authorize.net error:", err.message);
      return {
        statusCode: 502,
        headers: cors,
        body: json({ error: "Payment processing error. Please try again." }),
      };
    }
  }

  /* --- 1. GHL: Upsert contact --- */
  let contactId = null;
  if (hasGhl) {
    try {
      const contactPayload = {
        locationId: process.env.GHL_LOCATION_ID,
        firstName: b.parentFirst.trim(),
        lastName: b.parentLast.trim(),
        email: b.parentEmail.trim().toLowerCase(),
        phone: normalizePhone(b.parentPhone),
        address1: "",
        postalCode: b.parentZip.trim(),
        tags: [
          "fcpsports",
          "youth-league",
          "youth-league-summer-2026",
          `division-${b.division}`,
          `submitted-${today}`,
        ],
        source: "youth-league-registration",
      };

      const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders(),
        body: json(contactPayload),
      });

      if (upsertRes.ok) {
        const data = await upsertRes.json();
        contactId = data.contact?.id || data.id;
      } else {
        console.error("[register-youth-league] GHL upsert failed:", await upsertRes.text());
      }
    } catch (err) {
      console.error("[register-youth-league] GHL upsert error:", err.message);
    }

    /* --- 2. GHL: Create note --- */
    if (contactId) {
      const noteLines = [
        `YOUTH LEAGUE REGISTRATION — Summer 2026`,
        ``,
        `Player: ${b.childFirst} ${b.childLast}`,
        `DOB: ${b.childDob}`,
        `Division: ${b.divisionName || b.division}`,
        `Jersey Size: ${b.jerseySize}`,
        b.buddyRequest ? `Buddy Request: ${b.buddyRequest}` : null,
        ``,
        `Emergency: ${b.emergencyName} — ${b.emergencyPhone}`,
        b.medicalNotes ? `Medical Notes: ${b.medicalNotes}` : null,
        ``,
        `Pricing: $${b.priceAmount} (${b.priceTier})`,
        transactionId ? `Payment: PAID — Txn #${transactionId}` : `Payment: PENDING`,
        b.referralCode ? `Referral Code: ${b.referralCode}` : null,
        `SMS Consent: ${b.smsConsent ? "Yes" : "No"}`,
        `Photo Consent: ${b.photoConsent ? "Yes" : "No"}`,
        `Parental Pledge: Accepted`,
        ``,
        `Submitted: ${new Date().toISOString()}`,
      ].filter(Boolean).join("\n");

      await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(),
        body: json({ body: noteLines }),
      }).catch((e) => console.warn("[register-youth-league] Note failed:", e.message));
    }
  }

  /* --- 3. Airtable: Write registration --- */
  if (hasAirtable) {
    try {
      // Table: Youth_League_Registrations (create via Airtable UI or API)
      // Using table name — Airtable resolves it.
      const tableName = "Youth_League_Registrations";

      const fields = {
        "Parent Email": b.parentEmail.trim().toLowerCase(),
        "Parent First": b.parentFirst.trim(),
        "Parent Last": b.parentLast.trim(),
        "Parent Phone": b.parentPhone.trim(),
        "ZIP": b.parentZip.trim(),
        "Referral Code": b.referralCode || "",
        "SMS Consent": b.smsConsent || false,
        "Child First": b.childFirst.trim(),
        "Child Last": b.childLast.trim(),
        "Child DOB": b.childDob,
        "Division": b.divisionName || b.division,
        "Buddy Request": b.buddyRequest || "",
        "Emergency Name": b.emergencyName.trim(),
        "Emergency Phone": b.emergencyPhone.trim(),
        "Medical Notes": b.medicalNotes || "",
        "Jersey Size": b.jerseySize,
        "Photo Consent": b.photoConsent || false,
        "Price": b.priceAmount,
        "Price Tier": b.priceTier,
        "Payment Status": paymentStatus,
        "Transaction ID": transactionId || "",
        "Registered At": new Date().toISOString(),
        "GHL Contact ID": contactId || "",
      };

      const atRes = await fetch(
        `${AIRTABLE_BASE}/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`,
        {
          method: "POST",
          headers: airtableHeaders(),
          body: json({ fields, typecast: true }),
        }
      );

      if (!atRes.ok) {
        console.error("[register-youth-league] Airtable write failed:", await atRes.text());
      }
    } catch (err) {
      console.error("[register-youth-league] Airtable error:", err.message);
    }
  }

  console.log(
    `[register-youth-league] Registration: ${b.parentEmail} | ${b.childFirst} ${b.childLast} | ${b.division} | $${b.priceAmount}`
  );

  return {
    statusCode: 200,
    headers: cors,
    body: json({ ok: true }),
  };
};
