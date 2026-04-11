/**
 * camp-survey.js
 * Receives camp/league survey form submissions from the Facebook ad landing page.
 * Upserts contact in GHL, applies tags, and creates an opportunity in FCP Sports Leads pipeline.
 *
 * POST body: { name, email, phone, age, seasons[], times[], interests[] }
 *
 * Env vars required:
 *   GHL_API_KEY      - GoHighLevel Private Integration token
 *   GHL_LOCATION_ID  - GHL sub-account location ID
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const PIPELINE_ID = "YtrqQQ8kE2R3bZjnZxIK"; // FCP Sports Leads
const STAGE_ID = "c39fccaf-7441-4268-a426-6d602987693f"; // New Lead

const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) return true;
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

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "https://fcpsports.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: "Too many requests" }) };
  }

  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GHL not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { name = "", email = "", phone = "" } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required" }) };
  }

  const [firstName, ...rest] = (name || "").trim().split(" ");
  const lastName = rest.join(" ") || "";

  try {
    // 1. Upsert contact
    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        email: email.trim().toLowerCase(),
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone.trim() || undefined,
        source: "Facebook Ad - Camp Survey",
      }),
    });

    if (!upsertRes.ok) {
      console.error("[camp-survey] GHL upsert failed:", await upsertRes.text());
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const data = await upsertRes.json();
    const contactId = data.contact?.id || data.id;
    if (!contactId) {
      console.error("[camp-survey] No contactId in response");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // 2. Apply tags
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ tags: ["fcpsports", "camp-survey-lead", "source-facebook-ad"] }),
    }).catch((e) => console.warn("[camp-survey] Tag failed:", e.message));

    // 3. Always create opportunity — triggers GHL workflow to send emails
    const oppRes = await fetch(`${GHL_BASE}/opportunities/`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        pipelineId: PIPELINE_ID,
        pipelineStageId: STAGE_ID,
        locationId: process.env.GHL_LOCATION_ID,
        name: `${name.trim() || email} — Camp Survey`,
        contactId,
        monetaryValue: 0,
        status: "open",
        source: "Facebook Ad",
      }),
    });
    const oppStatus = oppRes.status;
    const oppText = await oppRes.text();
    if (!oppRes.ok) {
      console.error(`[camp-survey] Opportunity creation failed ${oppStatus}:`, oppText);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, _oppError: `${oppStatus}: ${oppText}` }) };
    } else {
      const oppData = JSON.parse(oppText);
      console.log(`[camp-survey] Opportunity created: ${oppData.opportunity?.id}`);
    }

    // 4. Add internal note
    await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ body: `Camp survey form submitted.\nName: ${name}\nPhone: ${phone}\nSource: Facebook Ad`, userId: "" }),
    }).catch((e) => console.warn("[camp-survey] Note failed:", e.message));

    console.log(`[camp-survey] Lead captured: ${email}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[camp-survey] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
