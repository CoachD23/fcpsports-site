/**
 * register-camp.js
 * Handles FCP Sports basketball camp registrations.
 *
 * 1. Charges card via Authorize.net (Accept.js nonce → auth+capture)
 * 2. Upserts parent contact in GoHighLevel with UTM attribution
 * 3. Applies camp-specific tags + creates a registration note
 * 4. Writes registration to Airtable "Camp_Registrations" table
 * 5. Sends confirmation email via Office365 SMTP
 *
 * POST body (from 4-step form):
 *   camp, campName, campDates,
 *   parentEmail, parentFirst, parentLast, parentPhone, parentZip, smsConsent,
 *   childFirst, childLast, childDob, childGrade, shirtSize,
 *   emergencyName, emergencyPhone, medicalNotes,
 *   photoConsent, waiverAccepted, priceTier, priceAmount,
 *   promoApplied, utm, payment: { dataDescriptor, dataValue, cardholderName }
 *
 * Env vars required:
 *   GHL_API_KEY, GHL_LOCATION_ID           (GHL contact sync)
 *   AIRTABLE_PAT, AIRTABLE_BASE_ID          (registrations table)
 *   AUTHNET_API_LOGIN, AUTHNET_TRANSACTION_KEY (card charging)
 *   AUTHNET_ENV (optional: "sandbox" for testing)
 *   FCPSPORTS_SMTP_PASS                     (confirmation email)
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const AIRTABLE_BASE = "https://api.airtable.com/v0";
const nodemailer = require("nodemailer");

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

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}
function airtableHeaders() {
  return { Authorization: `Bearer ${process.env.AIRTABLE_PAT}`, "Content-Type": "application/json" };
}
function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}
function json(o) { return JSON.stringify(o); }

/* --- UTM → source resolver (same logic as capture-lead.js) --- */
function resolveSource(utm, fallback) {
  const s = (utm.utm_source || "").toLowerCase().trim();
  if (s === "instagram" || s === "ig") return "Instagram Ad";
  if (s === "facebook" || s === "fb") return "Facebook Ad";
  if (s === "google" || s === "youtube") return "Google Ad";
  if (s === "tiktok") return "TikTok Ad";
  if (s) return `${utm.utm_source} Ad`;
  if (utm.fbclid) return "Facebook Ad";
  if (utm.gclid) return "Google Ad";
  return fallback;
}

function createSmtp() {
  return nodemailer.createTransport({
    host: "smtp.office365.com", port: 587, secure: false,
    auth: { user: "info@fcpsports.org", pass: process.env.FCPSPORTS_SMTP_PASS },
  });
}

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "https://fcpsports.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: json({ error: "Method not allowed" }) };

  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) return { statusCode: 429, headers: cors, body: json({ error: "Too many requests" }) };

  let b;
  try { b = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers: cors, body: json({ error: "Invalid JSON" }) }; }

  const utm = b.utm || {};
  const source = resolveSource(utm, b.partial ? "camp-partial" : "camp-registration");

  /* ------------------------------------------------------------------ */
  /* PARTIAL LEAD — save contact only, no payment                        */
  /* ------------------------------------------------------------------ */
  if (b.partial === true) {
    if (!b.parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.parentEmail)) {
      return { statusCode: 400, headers: cors, body: json({ error: "Valid email required" }) };
    }
    if (process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID) {
      try {
        const att = {};
        if (utm.utm_source) att.utmSource = utm.utm_source;
        if (utm.utm_medium) att.utmMedium = utm.utm_medium;
        if (utm.utm_campaign) att.campaign = utm.utm_campaign;
        if (utm.referrer) att.referrer = utm.referrer;
        att.sessionSource = source;
        await fetch(`${GHL_BASE}/contacts/upsert`, {
          method: "POST",
          headers: ghlHeaders(),
          body: json({
            locationId: process.env.GHL_LOCATION_ID,
            email: b.parentEmail.trim().toLowerCase(),
            firstName: b.parentFirst,
            lastName: b.parentLast,
            phone: b.parentPhone ? normalizePhone(b.parentPhone) : undefined,
            postalCode: b.parentZip,
            source,
            attributionSource: att,
            tags: ["fcpsports", "camp-partial", `camp-${b.camp || "unknown"}`],
          }),
        });
      } catch (e) { console.warn("[register-camp] partial upsert failed:", e.message); }
    }
    return { statusCode: 200, headers: cors, body: json({ ok: true, partial: true }) };
  }

  /* ------------------------------------------------------------------ */
  /* FULL REGISTRATION — charge card + enroll                            */
  /* ------------------------------------------------------------------ */
  const required = ["camp", "parentEmail", "parentFirst", "parentLast", "parentPhone", "parentZip",
    "childFirst", "childLast", "childDob", "childGrade", "shirtSize",
    "emergencyName", "emergencyPhone", "priceAmount"];
  for (const f of required) {
    if (!b[f] || !String(b[f]).trim()) {
      return { statusCode: 400, headers: cors, body: json({ error: `Missing required field: ${f}` }) };
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.parentEmail.trim())) {
    return { statusCode: 400, headers: cors, body: json({ error: "Invalid email" }) };
  }

  const hasGhl = process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID;
  const hasAirtable = process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID;
  const hasAuthnet = process.env.AUTHNET_API_LOGIN && process.env.AUTHNET_TRANSACTION_KEY;

  if (!hasGhl && !hasAirtable) {
    console.error("[register-camp] No GHL or Airtable configured");
    return { statusCode: 500, headers: cors, body: json({ error: "Registration system not configured" }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  let transactionId = null;
  let paymentStatus = "Pending";

  /* --- 1. Charge card via Authorize.net --- */
  if (hasAuthnet && b.payment && b.payment.dataValue) {
    try {
      const payload = {
        createTransactionRequest: {
          merchantAuthentication: {
            name: process.env.AUTHNET_API_LOGIN,
            transactionKey: process.env.AUTHNET_TRANSACTION_KEY,
          },
          transactionRequest: {
            transactionType: "authCaptureTransaction",
            amount: String(b.priceAmount),
            payment: {
              opaqueData: { dataDescriptor: b.payment.dataDescriptor, dataValue: b.payment.dataValue },
            },
            order: {
              invoiceNumber: `CAMP-${Date.now().toString(36).toUpperCase()}`,
              description: `${b.campName || b.camp} — ${b.childFirst} ${b.childLast}`,
            },
            customer: { email: b.parentEmail.trim().toLowerCase() },
            billTo: {
              firstName: b.parentFirst.trim(),
              lastName: b.parentLast.trim(),
              zip: b.parentZip.trim(),
            },
          },
        },
      };

      const url = (process.env.AUTHNET_ENV === "sandbox")
        ? "https://apitest.authorize.net/xml/v1/request.api"
        : "https://api.authorize.net/xml/v1/request.api";
      const payRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: json(payload) });
      const raw = await payRes.text();
      const pd = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const tx = pd.transactionResponse;

      if (pd.messages?.resultCode === "Ok" && tx && tx.responseCode === "1") {
        transactionId = tx.transId;
        paymentStatus = "Paid";
        console.log(`[register-camp] Payment approved: $${b.priceAmount} txn=${transactionId}`);
      } else {
        const err = tx?.errors?.[0]?.errorText || pd.messages?.message?.[0]?.text || "Payment declined";
        console.error("[register-camp] Payment failed:", err);
        return { statusCode: 402, headers: cors, body: json({ error: `Payment failed: ${err}` }) };
      }
    } catch (e) {
      console.error("[register-camp] Authnet error:", e.message);
      return { statusCode: 500, headers: cors, body: json({ error: "Payment processor unavailable" }) };
    }
  } else {
    // No payment creds configured — bail out. Registration is meaningless without payment.
    console.error("[register-camp] Authorize.net not configured");
    return { statusCode: 500, headers: cors, body: json({ error: "Payment system not configured" }) };
  }

  /* --- 2. GHL: upsert parent contact + tag + note --- */
  if (hasGhl) {
    try {
      const att = {};
      if (utm.utm_source) att.utmSource = utm.utm_source;
      if (utm.utm_medium) att.utmMedium = utm.utm_medium;
      if (utm.utm_campaign) att.campaign = utm.utm_campaign;
      if (utm.utm_content) att.utmContent = utm.utm_content;
      if (utm.referrer) att.referrer = utm.referrer;
      att.sessionSource = source;

      const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders(),
        body: json({
          locationId: process.env.GHL_LOCATION_ID,
          email: b.parentEmail.trim().toLowerCase(),
          firstName: b.parentFirst.trim(),
          lastName: b.parentLast.trim(),
          phone: normalizePhone(b.parentPhone),
          postalCode: b.parentZip.trim(),
          source,
          attributionSource: att,
          tags: ["fcpsports", "camp-registered", `camp-${b.camp}`, `paid-${today}`,
                 b.promoApplied ? `promo-${b.promoApplied}` : null].filter(Boolean),
          customFields: [
            { key: "camp_week", field_value: b.campName || b.camp },
            { key: "camp_dates", field_value: b.campDates || "" },
            { key: "camper_name", field_value: `${b.childFirst} ${b.childLast}` },
            { key: "camper_grade", field_value: b.childGrade },
          ],
        }),
      });
      const up = await upsertRes.json();
      const contactId = up.contact?.id || up.id;

      if (contactId) {
        // Registration note
        const noteBody =
          `Camp Registration — ${b.campName || b.camp} (${b.campDates || ""})\n` +
          `Camper: ${b.childFirst} ${b.childLast}, DOB ${b.childDob}, Grade ${b.childGrade}\n` +
          `Shirt: ${b.shirtSize}\n` +
          `Emergency: ${b.emergencyName} — ${b.emergencyPhone}\n` +
          (b.medicalNotes ? `Medical: ${b.medicalNotes}\n` : "") +
          `Photo consent: ${b.photoConsent ? "Yes" : "No"}\n` +
          `Paid: $${b.priceAmount} (${b.priceTier})` +
          (transactionId ? ` — Authnet txn ${transactionId}` : "") +
          (b.promoApplied ? `\nPromo: ${b.promoApplied}` : "");

        await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
          method: "POST",
          headers: ghlHeaders(),
          body: json({ body: noteBody }),
        }).catch((e) => console.warn("[register-camp] note failed:", e.message));
      }
    } catch (e) {
      console.error("[register-camp] GHL sync failed:", e.message);
      // Non-fatal — payment is already captured
    }
  }

  /* --- 3. Airtable: write to Camp_Registrations --- */
  if (hasAirtable) {
    try {
      await fetch(`${AIRTABLE_BASE}/${process.env.AIRTABLE_BASE_ID}/Camp_Registrations`, {
        method: "POST",
        headers: airtableHeaders(),
        body: json({
          fields: {
            "Camp": b.campName || b.camp,
            "Camp ID": b.camp,
            "Camp Dates": b.campDates || "",
            "Parent First": b.parentFirst,
            "Parent Last": b.parentLast,
            "Parent Email": b.parentEmail.trim().toLowerCase(),
            "Parent Phone": normalizePhone(b.parentPhone),
            "Parent ZIP": b.parentZip,
            "Camper First": b.childFirst,
            "Camper Last": b.childLast,
            "Camper DOB": b.childDob,
            "Camper Grade": b.childGrade,
            "Shirt Size": b.shirtSize,
            "Emergency Name": b.emergencyName,
            "Emergency Phone": normalizePhone(b.emergencyPhone),
            "Medical Notes": b.medicalNotes || "",
            "Photo Consent": !!b.photoConsent,
            "Price Tier": b.priceTier || "",
            "Price Paid": Number(b.priceAmount),
            "Promo Applied": b.promoApplied || "",
            "Payment Status": paymentStatus,
            "Transaction ID": transactionId || "",
            "UTM Source": utm.utm_source || "",
            "UTM Medium": utm.utm_medium || "",
            "UTM Campaign": utm.utm_campaign || "",
            "Source": source,
            "Registered Date": today,
          },
        }),
      });
    } catch (e) {
      console.warn("[register-camp] Airtable write failed:", e.message);
    }
  }

  /* --- 4. Confirmation email --- */
  if (process.env.FCPSPORTS_SMTP_PASS) {
    try {
      const t = createSmtp();
      await t.sendMail({
        from: '"FCP Sports" <info@fcpsports.org>',
        to: b.parentEmail.trim().toLowerCase(),
        bcc: "info@fcpsports.org",
        subject: `Registration Confirmed — ${b.campName || b.camp}`,
        html: `<p>Hi ${b.parentFirst},</p>
<p><strong>${b.childFirst} ${b.childLast}</strong> is registered for <strong>${b.campName || b.camp}</strong> — ${b.campDates || ""}.</p>
<p><strong>Amount paid:</strong> $${b.priceAmount}${transactionId ? ` (txn ${transactionId})` : ""}</p>
<p><strong>What to bring:</strong> court shoes, athletic clothes, water bottle, packed lunch.</p>
<p>We'll send a reminder 48 hours before camp starts with arrival details.</p>
<p>Questions? Reply to this email or call 850.961.2323.</p>
<p>— FCP Sports, Fort Walton Beach</p>`,
      });
    } catch (e) {
      console.warn("[register-camp] Confirmation email failed:", e.message);
    }
  }

  return { statusCode: 200, headers: cors, body: json({ ok: true, transactionId }) };
};
