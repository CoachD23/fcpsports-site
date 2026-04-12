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
    if (!oppRes.ok) {
      console.error(`[camp-survey] Opportunity creation failed ${oppRes.status}:`, await oppRes.text());
    } else {
      const oppData = await oppRes.json();
      console.log(`[camp-survey] Opportunity created: ${oppData.opportunity?.id}`);
    }

    // 4. Add internal note
    await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ body: `Camp survey form submitted.\nName: ${name}\nPhone: ${phone}\nSource: Facebook Ad`, userId: "" }),
    }).catch((e) => console.warn("[camp-survey] Note failed:", e.message));

    // 5. Send Email 1 — confirmation
    const email1Body = `Hey ${firstName || "there"},

You're officially on the early bird list for FCP Sports camps and leagues in Fort Walton Beach.

We'll send you pricing and registration details before spots open to the public.

Talk soon,
Coach D
FCP Sports — floridacoastalprep.com`;

    const e1Res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        type: "Email",
        contactId,
        locationId: process.env.GHL_LOCATION_ID,
        subject: "You're on the early bird list",
        body: email1Body,
        fromEmail: "info@fcpsports.org",
        fromName: "FCP Sports",
      }),
    });
    if (!e1Res.ok) {
      console.error("[camp-survey] Email 1 failed:", await e1Res.text());
    } else {
      console.log("[camp-survey] Email 1 sent");
    }

    // 6. Send Email 2 — Part 2 link
    const email2Body = `Hey ${firstName || "there"},

Before I send over pricing, I want to make sure I point you to the right program.

Takes 60 seconds — just tell me about your athlete:
👉 https://fcpsports.org/camp-survey/details/?email=${encodeURIComponent(email.trim().toLowerCase())}

Talk soon,
Coach D
FCP Sports`;

    const e2Res = await fetch(`${GHL_BASE}/conversations/messages`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        type: "Email",
        contactId,
        locationId: process.env.GHL_LOCATION_ID,
        subject: "Quick question before we send your pricing",
        body: email2Body,
        fromEmail: "info@fcpsports.org",
        fromName: "FCP Sports",
      }),
    });
    if (!e2Res.ok) {
      console.error("[camp-survey] Email 2 failed:", await e2Res.text());
    } else {
      console.log("[camp-survey] Email 2 sent");
    }

    // 7. Add tag to mark emails sent
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ tags: ["camp-survey-email-sent"] }),
    }).catch((e) => console.warn("[camp-survey] Email-sent tag failed:", e.message));

    console.log(`[camp-survey] Lead captured: ${email}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[camp-survey] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
