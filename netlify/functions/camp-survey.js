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

  const { name = "", email = "", phone = "", age = "", seasons = [], times = [], interests = [], partial = false } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required" }) };
  }

  const [firstName, ...rest] = (name || "").trim().split(" ");
  const lastName = rest.join(" ") || "";

  try {
    // Partial capture: email only — upsert contact + tag, skip opportunity
    if (partial) {
      await fetch(`${GHL_BASE}/contacts/upsert`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
          locationId: process.env.GHL_LOCATION_ID,
          email: email.trim().toLowerCase(),
          source: "Facebook Ad - Camp Survey",
        }),
      }).then(async (r) => {
        const d = await r.json();
        const cid = d.contact?.id || d.id;
        if (cid) {
          await fetch(`${GHL_BASE}/contacts/${cid}/tags`, {
            method: "POST", headers: ghlHeaders(),
            body: JSON.stringify({ tags: ["fcpsports", "camp-survey-lead", "source-facebook-ad", "partial-lead"] }),
          }).catch(() => {});
        }
      }).catch(() => {});
      console.log(`[camp-survey] Partial lead captured: ${email}`);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // 1. Upsert contact (full submission)
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
    const tags = ["fcpsports", "camp-survey-lead", "source-facebook-ad"];
    if (interests.includes("camp")) tags.push("camp-inquiry");
    if (interests.includes("league")) tags.push("league-inquiry");

    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ tags }),
    }).catch((e) => console.warn("[camp-survey] Tag failed:", e.message));

    // 3. Create opportunity (only if contact is new to avoid duplicates)
    if (!data.contact?.id || data.new) {
      const oppNote = [
        `Age range: ${age}`,
        `Seasons: ${seasons.join(", ") || "not specified"}`,
        `Times: ${times.join(", ") || "not specified"}`,
        `Interests: ${interests.join(", ") || "not specified"}`,
        `Source: Facebook Ad — Camp Survey`,
      ].join("\n");

      await fetch(`${GHL_BASE}/opportunities/`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
          pipelineId: PIPELINE_ID,
          pipelineStageId: STAGE_ID,
          locationId: process.env.GHL_LOCATION_ID,
          name: `${name.trim()} — Camp Survey`,
          contactId,
          status: "open",
          source: "Facebook Ad",
          customFields: [],
        }),
      }).catch((e) => console.warn("[camp-survey] Opportunity creation failed:", e.message));

      // 4. Add internal note with survey answers
      await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ body: oppNote, userId: "" }),
      }).catch((e) => console.warn("[camp-survey] Note failed:", e.message));
    }

    console.log(`[camp-survey] Lead captured: ${email} | interests: ${interests.join(",")}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[camp-survey] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
