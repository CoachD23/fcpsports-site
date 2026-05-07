/**
 * admin-stats.js
 * Password-protected camp dashboard data endpoint.
 *
 * POST { password: string }
 * Returns JSON with camp registration stats from the camp roster ledger + partial lead count from GHL.
 *
 * Env vars required:
 *   ADMIN_PASSWORD       — shared secret for dashboard access
 *   GHL_API_KEY          — GoHighLevel API v2 key
 *   GHL_LOCATION_ID      — GHL location/sub-account ID
 */

const crypto = require("crypto");
const {
  connectCampRosterLedger,
  listCampRosterRecords,
  summarizeCampRosterRecords,
} = require("./lib/camp-roster-ledger");

const GHL_BASE = "https://services.leadconnectorhq.com";

/* ── Rate limit (per IP, in-memory, max 3 attempts / 60s) ──── */
const rateLimit = {};
const RATE_WINDOW = 60_000;
const RATE_MAX = 3;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_WINDOW);
  if (rateLimit[ip].length >= RATE_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

/* ── Constant-time password comparison ─────────────────────── */
function passwordValid(input) {
  const stored = process.env.ADMIN_PASSWORD;
  if (!stored) return false;
  try {
    const a = Buffer.from(input.padEnd(64).slice(0, 64), "utf8");
    const b = Buffer.from(stored.padEnd(64).slice(0, 64), "utf8");
    return crypto.timingSafeEqual(a, b) && input === stored;
  } catch {
    return false;
  }
}

/* ── JSON helpers ───────────────────────────────────────────── */
function json(o, status) {
  return {
    statusCode: status || 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(o),
  };
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

/* ── GHL: count contacts with camp-partial tag ─────────────── */
async function fetchPartialLeadCount() {
  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  if (!key || !loc) return 0;

  try {
    const res = await fetch(`${GHL_BASE}/contacts/search`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: loc,
        page: 1,
        pageLimit: 1,
        filters: [{ field: "tags", operator: "contains", value: "camp-partial" }],
      }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total ?? data.meta?.total ?? (data.contacts ? data.contacts.length : 0);
  } catch {
    return 0;
  }
}

/* ── Main handler ───────────────────────────────────────────── */
exports.handler = async function (event, context) {
  connectCampRosterLedger(event);
  if (event.httpMethod !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Rate limit by IP
  const ip = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(ip)) {
    return json({ ok: false, error: "Too many attempts. Try again in a minute." }, 429);
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const { password } = body;
  if (!password || typeof password !== "string") {
    return json({ ok: false, error: "Password required." }, 401);
  }

  if (!passwordValid(password)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const ghlConfigured = !!(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);

  let ledgerError = "";
  const [records, partialLeads] = await Promise.all([
    listCampRosterRecords().catch((err) => {
      ledgerError = err.message;
      return [];
    }),
    ghlConfigured ? fetchPartialLeadCount() : Promise.resolve(0),
  ]);

  const summary = summarizeCampRosterRecords(records);
  summary.registrations.partial_leads = partialLeads;

  return json({
    ok: true,
    source: "camp-roster-ledger",
    note: ledgerError ? `Roster ledger unavailable: ${ledgerError}` : "",
    registrations: summary.registrations,
    by_camp: summary.by_camp,
    recent: summary.recent,
    utm_breakdown: summary.utm_breakdown,
  });
};
