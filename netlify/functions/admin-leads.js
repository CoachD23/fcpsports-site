/**
 * admin-leads.js
 * Password-protected lead dashboard endpoint for the FCP Sports admin page.
 *
 * POST { password: string }
 * Returns recent GoHighLevel contacts tagged "fcpsports" with email/text contact fields.
 *
 * Env vars required:
 *   ADMIN_PASSWORD   — shared secret for dashboard access
 *   GHL_API_KEY      — GoHighLevel Private Integration token
 *   GHL_LOCATION_ID  — GHL sub-account location ID
 */

const crypto = require("crypto");

const GHL_BASE = "https://services.leadconnectorhq.com";
const RATE_WINDOW = 60_000;
const RATE_MAX = 10;
const rateLimit = {};
const PAGE_LIMIT = 100;
const MAX_PAGES = 3;

function json(body, status) {
  return {
    statusCode: status || 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_WINDOW);
  if (rateLimit[ip].length >= RATE_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

function passwordValid(input) {
  const stored = process.env.ADMIN_PASSWORD;
  if (!stored || typeof input !== "string") return false;
  try {
    const a = Buffer.from(input.padEnd(64).slice(0, 64), "utf8");
    const b = Buffer.from(stored.padEnd(64).slice(0, 64), "utf8");
    return crypto.timingSafeEqual(a, b) && input === stored;
  } catch {
    return false;
  }
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

function clean(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  const raw = clean(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.startsWith("+") ? raw : digits ? `+${digits}` : raw;
}

function contactName(contact) {
  const first = clean(contact.firstName || contact.first_name);
  const last = clean(contact.lastName || contact.last_name);
  return [first, last].filter(Boolean).join(" ") || clean(contact.name || contact.contactName) || clean(contact.email);
}

function classify(tags) {
  const joined = tags.join(" ").toLowerCase();
  if (/camp-registered|league-registered|paid-/.test(joined)) {
    return { bucket: "registered", interest: "Registered", needsFollowup: false };
  }
  if (/camp-partial|youth-league-partial/.test(joined)) {
    return { bucket: "partial", interest: /youth-league/.test(joined) ? "League partial" : "Camp partial", needsFollowup: true };
  }
  if (/mens-league-waitlist|waitlist/.test(joined)) {
    return { bucket: "waitlist", interest: "Waitlist", needsFollowup: true };
  }
  if (/league-inquiry/.test(joined)) {
    return { bucket: "inquiry", interest: "League inquiry", needsFollowup: true };
  }
  if (/camp-inquiry|camp-survey-lead/.test(joined)) {
    return { bucket: "inquiry", interest: /camp-survey-lead/.test(joined) ? "Camp survey" : "Camp inquiry", needsFollowup: true };
  }
  if (/gym-rental/.test(joined)) {
    return { bucket: "inquiry", interest: "Gym rental", needsFollowup: true };
  }
  if (/sponsor-inquiry/.test(joined)) {
    return { bucket: "inquiry", interest: "Sponsor inquiry", needsFollowup: true };
  }
  if (/homepage|stay-up-to-date|general-inquiry|youth-inquiry|skills-inquiry|train|compete/.test(joined)) {
    return { bucket: "inquiry", interest: "Website inquiry", needsFollowup: true };
  }
  return { bucket: "inquiry", interest: "Lead", needsFollowup: true };
}

function sourceFor(contact) {
  return clean(
    contact.source ||
      contact.attributionSource?.sessionSource ||
      contact.attributionSource?.utmSource ||
      contact.attributionSource?.campaign
  );
}

function normalizeContact(contact) {
  const tags = Array.isArray(contact.tags) ? contact.tags.filter(Boolean) : [];
  const classification = classify(tags);
  const id = clean(contact.id || contact.contactId);
  const createdAt = clean(contact.dateAdded || contact.createdAt || contact.created_at || contact.updatedAt);
  return {
    id,
    name: contactName(contact),
    first_name: clean(contact.firstName || contact.first_name),
    last_name: clean(contact.lastName || contact.last_name),
    email: clean(contact.email).toLowerCase(),
    phone: normalizePhone(contact.phone),
    source: sourceFor(contact),
    created_at: createdAt,
    tags,
    bucket: classification.bucket,
    interest: classification.interest,
    needs_followup: classification.needsFollowup,
    crm_url: id && process.env.GHL_LOCATION_ID
      ? `https://app.gohighlevel.com/v2/location/${process.env.GHL_LOCATION_ID}/contacts/detail/${id}`
      : "",
  };
}

async function fetchLeadPage(page) {
  const response = await fetch(`${GHL_BASE}/contacts/search`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      page,
      pageLimit: PAGE_LIMIT,
      filters: [{ field: "tags", operator: "contains", value: "fcpsports" }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GHL search failed (${response.status}): ${text.slice(0, 180)}`);
  }

  return response.json();
}

async function listLeads() {
  const contacts = [];
  let total = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchLeadPage(page);
    const batch = data.contacts || [];
    total = data.total ?? data.meta?.total ?? total;
    contacts.push(...batch);
    if (batch.length < PAGE_LIMIT || (total != null && contacts.length >= total)) break;
  }

  const byId = new Map();
  contacts.forEach((contact) => {
    const normalized = normalizeContact(contact);
    const key = normalized.id || normalized.email || normalized.phone;
    if (key) byId.set(key, normalized);
  });

  return {
    leads: Array.from(byId.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    total,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    return json({ ok: false, error: "Too many attempts. Try again in a minute." }, 429);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!passwordValid(body.password)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return json({ ok: false, error: "GHL not configured." }, 500);
  }

  try {
    const result = await listLeads();
    return json({
      ok: true,
      leads: result.leads,
      returned: result.leads.length,
      total: result.total,
      truncated: result.total != null ? result.leads.length < result.total : false,
    });
  } catch (err) {
    console.error("[admin-leads] Error:", err.message);
    return json({ ok: false, error: "Lead lookup failed." }, 502);
  }
};
