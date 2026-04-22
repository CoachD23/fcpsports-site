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
                 b.promoApplied ? `promo-${b.promoApplied}` : null,
                 b.promoApplied === "SIBLING20" ? "sibling-discount" : null].filter(Boolean),
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
          (b.promoApplied ? `\nPromo: ${b.promoApplied}` : "") +
          (b.promoApplied === "SIBLING20" ? "\nSibling discount applied: $20 off" : "");

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
      const campName = b.campName || b.camp;
      const campDates = b.campDates || "";
      const txnLine = transactionId ? `<tr><td style="padding:6px 12px;color:#666666;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">Transaction ID</td><td style="padding:6px 12px;color:#0a1628;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">${transactionId}</td></tr>` : "";

      await t.sendMail({
        from: '"FCP Sports" <info@fcpsports.org>',
        to: b.parentEmail.trim().toLowerCase(),
        bcc: "info@fcpsports.org",
        subject: `Registration Confirmed — ${campName}`,
        text: `Hi ${b.parentFirst},\n\n${b.childFirst} ${b.childLast} is registered for ${campName}${campDates ? " — " + campDates : ""}.\n\nAmount paid: $${b.priceAmount}${transactionId ? ` (txn ${transactionId})` : ""}\n\nWHAT TO BRING\n- Court shoes\n- Athletic clothes\n- Water bottle\n- Packed lunch\n\nWHAT HAPPENS NEXT\n1. You'll get a reminder 48 hours before camp starts\n2. Day 1 arrival: 9:15 AM for 9:30 start\n3. Pick up: 2:00 PM\n\nQuestions? Reply to this email or call 850.961.2323.\ninfo@fcpsports.org | 33 Jet Drive NW, Fort Walton Beach, FL 32548\n\nView all camp details: https://fcpsports.org/camps/\n\n— FCP Sports`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background-color:#0a1628;padding:24px 32px;text-align:center;">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:28px;font-weight:800;letter-spacing:2px;color:#ffffff;">FCP</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:28px;font-weight:800;letter-spacing:2px;color:#f5a623;"> SPORTS</span>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background-color:#0a1628;padding:32px 32px 40px;text-align:center;border-bottom:4px solid #f5a623;">
            <div style="font-size:48px;line-height:1;">&#9989;</div>
            <h1 style="margin:16px 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:26px;font-weight:700;color:#ffffff;">You're Registered!</h1>
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#a0b0c8;">Hi ${b.parentFirst}, we've got ${b.childFirst} locked in. See you at camp!</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">

            <!-- Registration Details -->
            <h2 style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f5a623;">Registration Details</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
              <tr>
                <td style="padding:10px 12px;background-color:#f8f9fa;color:#666666;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:600;border-bottom:1px solid #e8e8e8;width:140px;">Camper</td>
                <td style="padding:10px 12px;background-color:#f8f9fa;color:#0a1628;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;border-bottom:1px solid #e8e8e8;">${b.childFirst} ${b.childLast}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#666666;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">Camp</td>
                <td style="padding:10px 12px;color:#0a1628;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:600;border-bottom:1px solid #e8e8e8;">${campName}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;background-color:#f8f9fa;color:#666666;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">Dates</td>
                <td style="padding:10px 12px;background-color:#f8f9fa;color:#0a1628;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">${campDates || "See confirmation details"}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;color:#666666;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #e8e8e8;">Amount Paid</td>
                <td style="padding:10px 12px;color:#0a1628;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;border-bottom:1px solid #e8e8e8;">$${b.priceAmount}</td>
              </tr>
              ${txnLine}
            </table>

            <!-- What to Bring -->
            <h2 style="margin:28px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f5a623;">What to Bring</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-radius:6px;border:1px solid #e8e8e8;">
              <tr><td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#0a1628;border-bottom:1px solid #e8e8e8;">&#x1F45F;&nbsp; Court shoes</td></tr>
              <tr><td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#0a1628;border-bottom:1px solid #e8e8e8;">&#x1F3C3;&nbsp; Athletic clothes</td></tr>
              <tr><td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#0a1628;border-bottom:1px solid #e8e8e8;">&#x1F4A7;&nbsp; Water bottle</td></tr>
              <tr><td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#0a1628;">&#x1F96A;&nbsp; Packed lunch</td></tr>
            </table>

            <!-- What Happens Next -->
            <h2 style="margin:28px 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#f5a623;">What Happens Next</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 12px;vertical-align:top;width:28px;">
                  <div style="width:24px;height:24px;background-color:#0a1628;border-radius:50%;text-align:center;line-height:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:700;color:#f5a623;">1</div>
                </td>
                <td style="padding:0 0 12px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333333;">You'll get a reminder 48 hours before camp starts</td>
              </tr>
              <tr>
                <td style="padding:0 0 12px;vertical-align:top;width:28px;">
                  <div style="width:24px;height:24px;background-color:#0a1628;border-radius:50%;text-align:center;line-height:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:700;color:#f5a623;">2</div>
                </td>
                <td style="padding:0 0 12px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333333;">Day 1 arrival: <strong>9:15 AM</strong> for a 9:30 start</td>
              </tr>
              <tr>
                <td style="padding:0;vertical-align:top;width:28px;">
                  <div style="width:24px;height:24px;background-color:#0a1628;border-radius:50%;text-align:center;line-height:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:700;color:#f5a623;">3</div>
                </td>
                <td style="padding:0 0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333333;">Pick up: <strong>2:00 PM</strong></td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td align="center">
                  <a href="https://fcpsports.org/camps/" style="display:inline-block;background-color:#f5a623;color:#0a1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;letter-spacing:0.5px;">View All Camp Details</a>
                </td>
              </tr>
            </table>

            <!-- Contact -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #e8e8e8;padding-top:24px;">
              <tr>
                <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#666666;padding-bottom:12px;">
                  Review our <a href="https://fcpsports.org/refund-policy/" style="color:#f5a623;text-decoration:none;">refund and cancellation policy</a>.
                </td>
              </tr>
              <tr>
                <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#666666;line-height:1.6;">
                  <strong style="color:#0a1628;">Questions?</strong> Reply to this email or reach us at:<br>
                  &#128222; <a href="tel:8509612323" style="color:#0a1628;text-decoration:none;">850.961.2323</a>&nbsp;&nbsp;
                  &#9993; <a href="mailto:info@fcpsports.org" style="color:#0a1628;text-decoration:none;">info@fcpsports.org</a><br>
                  33 Jet Drive NW, Fort Walton Beach, FL 32548
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#0a1628;padding:20px 32px;text-align:center;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding-bottom:12px;">
                  <a href="https://www.instagram.com/playfcpsports/" style="display:inline-block;margin:0 6px;"><img src="https://cdn-icons-png.flaticon.com/24/2111/2111463.png" width="24" height="24" alt="Instagram" style="border:0;display:block;"></a>
                  <a href="https://www.facebook.com/playfcpsports" style="display:inline-block;margin:0 6px;"><img src="https://cdn-icons-png.flaticon.com/24/5968/5968764.png" width="24" height="24" alt="Facebook" style="border:0;display:block;"></a>
                  <a href="https://x.com/playfcpsports" style="display:inline-block;margin:0 6px;"><img src="https://cdn-icons-png.flaticon.com/24/5969/5969020.png" width="24" height="24" alt="X" style="border:0;display:block;"></a>
                </td>
              </tr>
              <tr>
                <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#6080a0;line-height:1.6;">
                  &copy; 2025 FCP Sports &bull; 33 Jet Drive NW, Fort Walton Beach, FL 32548<br>
                  You received this because you registered for an FCP Sports camp.<br>
                  Questions? <a href="mailto:info@fcpsports.org" style="color:#f5a623;text-decoration:none;">Contact us</a> to unsubscribe from future emails.
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`,
      });
    } catch (e) {
      console.warn("[register-camp] Confirmation email failed:", e.message);
    }
  }

  return { statusCode: 200, headers: cors, body: json({ ok: true, transactionId }) };
};
