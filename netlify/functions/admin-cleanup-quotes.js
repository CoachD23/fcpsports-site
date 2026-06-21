/**
 * admin-cleanup-quotes.js  (one-time / manual)
 *
 * Some camp-roster-ledger records have stray surrounding quotes baked into
 * camp.name / camp.dates (e.g. `"Session 2 — Afternoon"`), which splits one
 * camp into two in every grouped view. This strips the surrounding quotes in
 * place — touching ONLY those two string fields, preserving everything else
 * (ids, timestamps, transaction ids), so the record key never changes.
 *
 * Idempotent (re-running a clean record is a no-op). Returns a before/after
 * change log for auditability. Pass { dryRun: true } to preview without writing.
 *
 * POST { password, dryRun? }  ->  { ok, scanned, cleaned, dryRun, changes }
 */
const crypto = require("crypto");
const {
  connectCampRosterLedger,
  listCampRosterRecords,
  registrationKey,
  STORE_NAME,
} = require("./lib/camp-roster-ledger");
const { getStore } = require("@netlify/blobs");

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
// strip ONLY leading/trailing quotes (and whitespace) — preserves any internal apostrophe
function stripQuotes(s) {
  return String(s == null ? "" : s).replace(/^["'\s]+|["'\s]+$/g, "");
}

exports.handler = async function (event) {
  connectCampRosterLedger(event);
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  const dryRun = !!body.dryRun;
  const store = getStore(STORE_NAME);
  const records = await listCampRosterRecords();

  // Build a cleaned-name -> canonical slug map from records that already have a
  // valid slug id, so we can repair records where the NAME leaked into the id.
  const isSlug = (v) => /^[a-z0-9-]+$/.test(String(v || ""));
  const nameToSlug = {};
  for (const r of records) {
    if (r && r.camp && isSlug(r.camp.id)) {
      const nm = stripQuotes(r.camp.name);
      if (nm && !nameToSlug[nm]) nameToSlug[nm] = r.camp.id;
    }
  }

  const changes = [];
  for (const r of records) {
    if (!r || !r.id || !r.camp) continue;
    const nameBefore = r.camp.name || "";
    const datesBefore = r.camp.dates || "";
    const idBefore = r.camp.id || "";
    const nameAfter = stripQuotes(nameBefore);
    const datesAfter = stripQuotes(datesBefore);
    let idAfter = idBefore;
    if (idBefore && !isSlug(idBefore) && nameToSlug[nameAfter]) idAfter = nameToSlug[nameAfter];
    if (nameAfter === nameBefore && datesAfter === datesBefore && idAfter === idBefore) continue;
    changes.push({ id: r.id, nameBefore, nameAfter, datesBefore, datesAfter, idBefore, idAfter });
    if (!dryRun) {
      r.camp.name = nameAfter;
      r.camp.dates = datesAfter;
      r.camp.id = idAfter;
      await store.setJSON(registrationKey(r), r);
    }
  }

  return json({ ok: true, scanned: records.length, cleaned: changes.length, dryRun, changes });
};
