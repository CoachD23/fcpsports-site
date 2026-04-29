/**
 * capture-lead.js
 * Captures email from homepage and program inquiry forms.
 * Upserts contact in GoHighLevel and applies a program-specific tag.
 *
 * POST body: { email, tag, source, utm }
 *   tag    - e.g. "general-inquiry", "camp-inquiry", "gym-rental-inquiry"
 *   source - optional string for tracking (e.g. "exit-popup", "homepage")
 *   utm    - optional object: { utm_source, utm_medium, utm_campaign,
 *            utm_content, utm_term, gclid, fbclid, referrer }
 *            If utm.utm_source is present, the GHL source field will
 *            reflect it (e.g. "instagram" instead of generic "Facebook Ad").
 *
 * Env vars required:
 *   GHL_API_KEY      - GoHighLevel Private Integration token
 *   GHL_LOCATION_ID  - GHL sub-account location ID
 */

const ALLOWED_TAGS = new Set([
  "compete",
  "train",
  "skills-inquiry",
  "camp-inquiry",
  "league-inquiry",
  "mens-league-waitlist",
  "aau-inquiry",
  "youth-inquiry",
  "gym-rental",
  "gym-rental-inquiry",
  "homepage-lead",
  "general-inquiry",
]);

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

const GHL_BASE = "https://services.leadconnectorhq.com";
const nodemailer = require("nodemailer");

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: "info@fcpsports.org",
      pass: process.env.FCPSPORTS_SMTP_PASS,
    },
  });
}

// Tags that should trigger the camp/league email sequence
const CAMP_LEAGUE_TAGS = new Set([
  "camp-inquiry",
  "league-inquiry",
  "aau-inquiry",
  "youth-inquiry",
  "general-inquiry",
]);

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

  try {
    const { email, tag = "general-inquiry", source = "website", utm = {} } = JSON.parse(event.body || "{}");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required" }) };
    }

    // Only allow known tags to prevent tag pollution
    const safeTag = ALLOWED_TAGS.has(tag) ? tag : "general-inquiry";
    const tagsToApply = safeTag === "general-inquiry"
      ? ["fcpsports", "general-inquiry"]
      : ["fcpsports", safeTag, "general-inquiry"];

    // Compute channel-specific source from UTMs (Instagram vs Facebook vs Google etc)
    // Priority: utm_source > fbclid → facebook > gclid → google > fallback source
    let resolvedSource = source;
    const utmSource = (utm.utm_source || "").toLowerCase().trim();
    if (utmSource === "instagram" || utmSource === "ig") resolvedSource = "Instagram Ad";
    else if (utmSource === "facebook" || utmSource === "fb") resolvedSource = "Facebook Ad";
    else if (utmSource === "google" || utmSource === "youtube") resolvedSource = "Google Ad";
    else if (utmSource === "tiktok") resolvedSource = "TikTok Ad";
    else if (utmSource) resolvedSource = `${utm.utm_source} Ad`;
    else if (utm.fbclid) resolvedSource = "Facebook Ad";
    else if (utm.gclid) resolvedSource = "Google Ad";

    // Build attributionSource for GHL — tracked per contact
    const attributionSource = {};
    if (utm.utm_source) attributionSource.utmSource = String(utm.utm_source).slice(0, 100);
    if (utm.utm_medium) attributionSource.utmMedium = String(utm.utm_medium).slice(0, 100);
    if (utm.utm_campaign) attributionSource.campaign = String(utm.utm_campaign).slice(0, 100);
    if (utm.utm_content) attributionSource.utmContent = String(utm.utm_content).slice(0, 100);
    if (utm.utm_term) attributionSource.utmKeyword = String(utm.utm_term).slice(0, 100);
    if (utm.referrer) attributionSource.referrer = String(utm.referrer).slice(0, 200);
    attributionSource.sessionSource = source;

    // Upsert contact in GHL — include source + attribution on first insert
    const upsertPayload = {
      locationId: process.env.GHL_LOCATION_ID,
      email: email.trim().toLowerCase(),
      source: resolvedSource,
    };
    if (Object.keys(attributionSource).length > 0) {
      upsertPayload.attributionSource = attributionSource;
    }
    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify(upsertPayload),
    });

    if (!upsertRes.ok) {
      const text = await upsertRes.text();
      console.error("[capture-lead] GHL upsert failed:", text);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const data = await upsertRes.json();
    const contactId = data.contact?.id || data.id;

    if (contactId) {
      const today = new Date().toISOString().slice(0, 10);
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ tags: [...tagsToApply, `submitted-${today}`] }),
      }).catch((e) => console.warn("[capture-lead] Tag failed:", e.message));
    }

    console.log(`[capture-lead] Lead captured: ${email} | tag: ${safeTag} | source: ${resolvedSource} | utm: ${JSON.stringify(utm)}`);

    // Send confirmation email + enroll in day-2 sequence for camp/league tags
    if (CAMP_LEAGUE_TAGS.has(safeTag) && process.env.FCPSPORTS_SMTP_PASS) {
      // Also tag as camp-survey-lead so the day-2 scheduler picks them up
      if (contactId) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
          method: "POST",
          headers: ghlHeaders(),
          body: JSON.stringify({ tags: ["camp-survey-lead"] }),
        }).catch((e) => console.warn("[capture-lead] camp-survey-lead tag failed:", e.message));
      }

      // Send confirmation email immediately
      try {
        const transporter = createSmtpTransport();
        await transporter.sendMail({
          from: '"FCP Sports" <info@fcpsports.org>',
          to: email.trim().toLowerCase(),
          subject: "You're on the list — FCP Sports",
          html: `<p>Hey,</p>
<p>You're on the list! We'll keep you updated as new camps and leagues form here in Fort Walton Beach.</p>
<p>We're building something great — you'll hear from us before spots open to the public.</p>
<p>Talk soon,<br>FCP Sports<br>Fort Walton Beach, FL</p>`,
        });
        console.log(`[capture-lead] Confirmation email sent to ${email}`);
      } catch (e) {
        console.error("[capture-lead] Email failed:", e.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[capture-lead] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
