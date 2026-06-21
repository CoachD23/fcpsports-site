/**
 * admin-backfill-programs.js  (one-time / manual)
 *
 * Migrates EXISTING paid program registrations (Skills, Private, Homeschool PE)
 * out of GoHighLevel and into the money-truth program-roster-ledger, so the
 * admin dashboard's "Registrations by Month" is fully ledger-backed instead of
 * showing those historical signups with a "· CRM" fallback tag.
 *
 * process-payment.js writes the ledger going forward; this catches the ones that
 * predate the ledger. Idempotent — safe to re-run (records keyed by email|program|date).
 *
 * POST { password }  ->  { ok, written, skipped, details }
 */
const crypto = require("crypto");
const {
  connectProgramRosterLedger,
  saveProgramRosterRecord,
} = require("./lib/program-roster-ledger");

const GHL_BASE = "https://services.leadconnectorhq.com";
const PROGRAM_TAGS = {
  "skills-training": { label: "Skills Training", price: 149 },
  "private-lesson": { label: "Private Lessons", price: 50 },
  "homeschool-pe": { label: "Homeschool PE", price: 99 },
};

function clean(v) { return String(v || "").trim(); }
function json(body, status) {
  return { statusCode: status || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function passwordValid(input) {
  const stored = process.env.ADMIN_PASSWORD;
  if (!stored || !input) return false;
  try {
    const a = Buffer.from(String(input).padEnd(64).slice(0, 64), "utf8");
    const b = Buffer.from(String(stored).padEnd(64).slice(0, 64), "utf8");
    return crypto.timingSafeEqual(a, b) && input === stored;
  } catch { return false; }
}
function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}
function contactName(c) {
  const n = [clean(c.firstName), clean(c.lastName)].filter(Boolean).join(" ");
  return n || clean(c.name || c.contactName) || clean(c.email);
}
function normalizePhone(v) {
  const d = clean(v).replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return d ? `+${d}` : "";
}

async function fetchByTag(tag) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${GHL_BASE}/contacts/search`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        page,
        pageLimit: 100,
        filters: [{ field: "tags", operator: "contains", value: tag }],
      }),
    });
    if (!res.ok) throw new Error(`GHL search ${tag} failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const batch = data.contacts || [];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

exports.handler = async function (event) {
  connectProgramRosterLedger(event);
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return json({ ok: false, error: "GHL not configured" }, 500);
  }
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  const written = [];
  const skipped = [];
  const seen = new Set();

  for (const tag of Object.keys(PROGRAM_TAGS)) {
    let contacts = [];
    try {
      contacts = await fetchByTag(tag);
    } catch (err) {
      skipped.push({ tag, reason: err.message });
      continue;
    }
    for (const c of contacts) {
      const tags = Array.isArray(c.tags) ? c.tags.map(clean) : [];
      const isPaid = tags.some((t) => t === "paid" || /^paid-/.test(t));
      const email = clean(c.email).toLowerCase();
      if (!isPaid || !email) { continue; }
      const dedupKey = `${tag}|${email}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const paidTag = tags.find((t) => /^paid-\d{4}-\d{2}-\d{2}$/.test(t));
      const createdAt = paidTag
        ? new Date(paidTag.replace("paid-", "") + "T12:00:00Z").toISOString()
        : clean(c.dateAdded) || new Date().toISOString();

      try {
        const rec = await saveProgramRosterRecord({
          program: tag,
          programLabel: PROGRAM_TAGS[tag].label,
          parentName: contactName(c),
          email,
          phone: normalizePhone(c.phone),
          athleteName: "",
          amount: PROGRAM_TAGS[tag].price,
          createdAt,
          source: "backfill-crm",
        });
        written.push({ program: tag, name: rec.parentName, email, date: createdAt.slice(0, 10) });
      } catch (err) {
        skipped.push({ email, tag, reason: err.message });
      }
    }
  }

  return json({ ok: true, written: written.length, skipped: skipped.length, details: { written, skipped } });
};
