/**
 * register-inquiry.js
 * Full-detail inquiry form handler for FCP Sports.
 * Captures parent contact info + child details and upserts into GoHighLevel.
 *
 * POST body:
 *   parentFirstName  string  required
 *   parentLastName   string  optional
 *   email            string  required
 *   phone            string  optional
 *   childName        string  optional
 *   grade            string  optional  e.g. "K-2nd", "3rd-5th", "6th-8th", "9th-12th"
 *   program          string  optional  e.g. "Basketball League"
 *   message          string  optional
 *   tag              string  optional  GHL tag to apply (falls back to "general-inquiry")
 *   source           string  optional  page slug for tracking
 *
 * Env vars required:
 *   GHL_API_KEY      GoHighLevel Private Integration token
 *   GHL_LOCATION_ID  GHL sub-account location ID
 */

const ALLOWED_TAGS = new Set([
  "compete",
  "train",
  "camp-inquiry",
  "gym-rental-inquiry",
  "sponsor-inquiry",
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

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

exports.handler = async function (event) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://fcpsports.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: "Too many requests" }) };
  }

  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "GHL not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const {
    parentFirstName = "",
    parentLastName = "",
    email = "",
    phone = "",
    childName = "",
    grade = "",
    program = "",
    message = "",
    tag = "general-inquiry",
    source = "website",
  } = body;

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Valid email required" }) };
  }

  // Validate name
  if (!parentFirstName.trim()) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "First name required" }) };
  }

  // Support comma-separated tags from multi-select cards
  const rawTags = tag.split(",").map(t => t.trim()).filter(t => ALLOWED_TAGS.has(t));
  if (rawTags.length === 0) rawTags.push("general-inquiry");
  const tagsToApply = ["fcpsports", "general-inquiry", ...rawTags.filter(t => t !== "general-inquiry")];
  const safeTag = rawTags[0];

  try {
    // Upsert contact with full details
    const contactPayload = {
      locationId: process.env.GHL_LOCATION_ID,
      firstName: parentFirstName.trim(),
      lastName: parentLastName.trim(),
      email: email.trim().toLowerCase(),
    };

    if (phone.trim()) {
      // Normalize to E.164-ish — strip non-digits then prepend +1 if 10 digits
      const digits = phone.replace(/\D/g, "");
      contactPayload.phone = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    }

    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify(contactPayload),
    });

    if (!upsertRes.ok) {
      const text = await upsertRes.text();
      console.error("[register-inquiry] GHL upsert failed:", text);
      // Still return success to user — don't expose backend errors
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    const data = await upsertRes.json();
    const contactId = data.contact?.id || data.id;

    if (contactId) {
      // Apply tags (include daily submission tag for digest)
      const today = new Date().toISOString().slice(0, 10);
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ tags: [...tagsToApply, `submitted-${today}`] }),
      }).catch((e) => console.warn("[register-inquiry] Tag apply failed:", e.message));

      // Create a note with child + program details so staff can see it immediately
      const noteParts = [];
      if (childName.trim()) noteParts.push(`Child: ${childName.trim()}`);
      if (grade.trim()) noteParts.push(`Grade: ${grade.trim()}`);
      if (program.trim()) noteParts.push(`Program Interest: ${program.trim()}`);
      if (message.trim()) noteParts.push(`Message: ${message.trim()}`);
      noteParts.push(`Source: ${source}`);

      if (noteParts.length > 0) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
          method: "POST",
          headers: ghlHeaders(),
          body: JSON.stringify({ body: noteParts.join("\n") }),
        }).catch((e) => console.warn("[register-inquiry] Note creation failed:", e.message));
      }
    }

    // Gym rental and sponsor inquiries: email staff directly
    if ((safeTag === "gym-rental-inquiry" || safeTag === "sponsor-inquiry") && contactId) {
      const isSponsor = safeTag === "sponsor-inquiry";
      const subject = isSponsor ? "SPONSOR INQUIRY" : "GYM RENTAL INQUIRY";
      const emailBody = [
        `<h2>${subject}</h2>`,
        `<p><strong>Name:</strong> ${escHtml(parentFirstName.trim())} ${escHtml(parentLastName.trim())}</p>`,
        `<p><strong>Email:</strong> ${escHtml(email.trim())}</p>`,
        phone.trim() ? `<p><strong>Phone:</strong> ${escHtml(phone.trim())}</p>` : "",
        program.trim() ? `<p><strong>Program:</strong> ${escHtml(program.trim())}</p>` : "",
        message.trim() ? `<p><strong>Message:</strong> ${escHtml(message.trim())}</p>` : "",
        `<p><strong>Source:</strong> ${escHtml(source)}</p>`,
      ].filter(Boolean).join("");

      await fetch(`${GHL_BASE}/conversations/messages`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({
          type: "Email",
          contactId,
          subject,
          html: emailBody,
          emailTo: "info@fcpsports.org",
        }),
      }).catch((e) => console.warn("[register-inquiry] Staff email failed:", e.message));
    }

    console.log(`[register-inquiry] Lead: ${email} | tag: ${safeTag} | program: ${program} | source: ${source}`);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("[register-inquiry] Error:", err.message);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  }
};
