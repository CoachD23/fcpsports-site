/**
 * admin-stats.js
 * Password-protected camp dashboard data endpoint.
 *
 * POST { password: string }
 * Returns JSON with camp registration stats from Airtable + partial lead count from GHL.
 *
 * Env vars required:
 *   ADMIN_PASSWORD       — shared secret for dashboard access
 *   AIRTABLE_PAT         — Airtable personal access token
 *   AIRTABLE_BASE_ID     — Airtable base ID
 *   GHL_API_KEY          — GoHighLevel API v2 key
 *   GHL_LOCATION_ID      — GHL location/sub-account ID
 */

const crypto = require("crypto");

const GHL_BASE = "https://services.leadconnectorhq.com";
const AIRTABLE_BASE = "https://api.airtable.com/v0";
const TABLE_NAME = "Camp_Registrations";

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

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
    "Content-Type": "application/json",
  };
}
function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

/* ── Date helpers ───────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function monthStartStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/* ── Airtable: fetch all records ───────────────────────────── */
async function fetchAllAirtableRecords(baseId, tableName) {
  const pat = process.env.AIRTABLE_PAT;
  if (!pat || !baseId) return null; // not configured

  const records = [];
  let offset = null;

  do {
    const url = new URL(`${AIRTABLE_BASE}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);

    let res;
    try {
      res = await fetch(url.toString(), { headers: airtableHeaders() });
    } catch {
      return null; // network error
    }

    if (res.status === 404) return null; // table doesn't exist
    if (!res.ok) return null;

    const data = await res.json();
    if (data.records) records.push(...data.records);
    offset = data.offset || null;
  } while (offset);

  return records;
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

  // Check env config
  const airtableConfigured = !!(process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID);
  const ghlConfigured = !!(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID);

  if (!airtableConfigured) {
    // Return graceful empty stats
    return json({
      ok: true,
      note: "Airtable not configured",
      registrations: {
        total: 0,
        today: 0,
        this_week: 0,
        revenue_total: 0,
        revenue_today: 0,
        partial_leads: 0,
      },
      by_camp: [],
      recent: [],
      utm_breakdown: { instagram: 0, facebook: 0, google: 0, direct: 0 },
    });
  }

  // Fetch Airtable records and GHL count in parallel
  const [records, partialLeads] = await Promise.all([
    fetchAllAirtableRecords(process.env.AIRTABLE_BASE_ID, TABLE_NAME),
    ghlConfigured ? fetchPartialLeadCount() : Promise.resolve(0),
  ]);

  if (records === null) {
    return json({
      ok: true,
      note: "Airtable not configured or table not found",
      registrations: {
        total: 0,
        today: 0,
        this_week: 0,
        revenue_total: 0,
        revenue_today: 0,
        partial_leads: partialLeads,
      },
      by_camp: [],
      recent: [],
      utm_breakdown: { instagram: 0, facebook: 0, google: 0, direct: 0 },
    });
  }

  // Compute stats
  const today = todayStr();
  const weekAgo = weekAgoStr();
  const monthStart = monthStartStr();

  let total = 0;
  let todayCount = 0;
  let weekCount = 0;
  let revenueTotal = 0;
  let revenueToday = 0;

  const campMap = {}; // campName → { count, revenue }
  const utmMap = { instagram: 0, facebook: 0, google: 0, direct: 0 };
  const recentRows = [];

  records.forEach(function (rec) {
    const f = rec.fields || {};

    // Field name assumptions (adjust if Airtable field names differ):
    //   "Created Time" or "Registration Date" for date
    //   "Camp Name" or "Camp" for camp
    //   "Price Paid" or "Amount" for amount
    //   "Parent First Name", "Parent Last Name" for parent
    //   "Child First Name", "Child Last Name" for camper
    //   "UTM Source" for attribution

    const dateRaw = f["Registration Date"] || f["Created Time"] || rec.createdTime || "";
    const dateStr = dateRaw ? dateRaw.slice(0, 10) : "";
    const campName = f["Camp Name"] || f["Camp"] || "Unknown Camp";
    const amount = parseFloat(f["Price Paid"] || f["Amount"] || 0) || 0;
    const parentFirst = f["Parent First Name"] || f["Parent First"] || "";
    const parentLast = f["Parent Last Name"] || f["Parent Last"] || "";
    const childFirst = f["Child First Name"] || f["Child First"] || f["Camper First"] || "";
    const childLast = f["Child Last Name"] || f["Child Last"] || f["Camper Last"] || "";
    const utmSource = (f["UTM Source"] || f["utm_source"] || "direct").toLowerCase().trim();

    total++;

    if (dateStr === today) { todayCount++; revenueToday += amount; }
    if (dateStr >= weekAgo) weekCount++;
    if (dateStr >= monthStart) revenueTotal += amount;

    // By camp
    if (!campMap[campName]) campMap[campName] = { count: 0, revenue: 0 };
    campMap[campName].count++;
    campMap[campName].revenue += amount;

    // UTM attribution
    if (/instagram|ig/i.test(utmSource)) utmMap.instagram++;
    else if (/facebook|fb/i.test(utmSource)) utmMap.facebook++;
    else if (/google/i.test(utmSource)) utmMap.google++;
    else utmMap.direct++;

    // Recent rows (store all, sort + slice after)
    recentRows.push({
      date: dateStr,
      parent: [parentFirst, parentLast].filter(Boolean).join(" ") || "—",
      camper: [childFirst, childLast].filter(Boolean).join(" ") || "—",
      camp: campName,
      amount: amount,
      _ts: dateRaw,
    });
  });

  // Sort recent by date desc, take last 10
  recentRows.sort(function (a, b) { return b._ts > a._ts ? 1 : -1; });
  const recent = recentRows.slice(0, 10).map(function (r) {
    return { date: r.date, parent: r.parent, camper: r.camper, camp: r.camp, amount: r.amount };
  });

  // By camp array, sorted by count desc
  const byCamp = Object.keys(campMap)
    .map(function (k) { return { camp: k, count: campMap[k].count, revenue: Math.round(campMap[k].revenue) }; })
    .sort(function (a, b) { return b.count - a.count; });

  return json({
    ok: true,
    registrations: {
      total,
      today: todayCount,
      this_week: weekCount,
      revenue_total: Math.round(revenueTotal),
      revenue_today: Math.round(revenueToday),
      partial_leads: partialLeads,
    },
    by_camp: byCamp,
    recent,
    utm_breakdown: utmMap,
  });
};
