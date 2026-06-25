/**
 * worker-stats.js
 *
 * Least-privilege roster feed for the staff/worker page (/workers/). Returns
 * ONLY operational info — camper/client names, contact, camp/program, dates —
 * NO revenue, NO amounts, NO lead-management data. Gated by WORKER_PASSWORD
 * (ADMIN_PASSWORD also works so Lee can use either).
 *
 * POST { password }  ->  { ok, roster: [...] }
 */
const crypto = require("crypto");
const {
  connectCampRosterLedger,
  listCampRosterRecords,
} = require("./lib/camp-roster-ledger");
const {
  connectProgramRosterLedger,
  listProgramRosterRecords,
} = require("./lib/program-roster-ledger");
const { listLeagueRosterRecords } = require("./lib/league-roster");

function json(body, status) {
  return { statusCode: status || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function passwordValid(input) {
  if (!input) return false;
  const candidates = [process.env.WORKER_PASSWORD, process.env.ADMIN_PASSWORD].filter(Boolean);
  return candidates.some((stored) => {
    try {
      const a = Buffer.from(String(input).padEnd(64).slice(0, 64), "utf8");
      const b = Buffer.from(String(stored).padEnd(64).slice(0, 64), "utf8");
      return crypto.timingSafeEqual(a, b) && input === stored;
    } catch {
      return false;
    }
  });
}

exports.handler = async function (event) {
  connectCampRosterLedger(event);
  connectProgramRosterLedger(event);
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  const [camps, programs, leagues] = await Promise.all([
    listCampRosterRecords().catch(() => []),
    listProgramRosterRecords().catch(() => []),
    listLeagueRosterRecords().catch(() => []),
  ]);

  const roster = camps.map(function (r) {
    return {
      kind: "camp",
      campId: (r.camp && r.camp.id) || "",
      camp: (r.camp && r.camp.name) || "",
      dates: (r.camp && r.camp.dates) || "",
      session: (r.camp && r.camp.session) || "",
      parent: (r.parent && r.parent.name) || "",
      phone: (r.parent && r.parent.phone) || "",
      email: (r.parent && r.parent.email) || "",
      camper: (r.camper && r.camper.name) || "",
      grade: (r.camper && r.camper.grade) || "",
      status: (r.payment && r.payment.status) || "",
      transactionId: (r.payment && r.payment.transactionId) || "",
      signup_date: r.createdAt || r.updatedAt || "",
    };
  }).concat((programs || []).map(function (p) {
    return {
      kind: "program",
      program: p.program || "",
      label: p.programLabel || p.program || "",
      parent: p.parentName || "",
      phone: p.phone || "",
      email: p.email || "",
      camper: p.athleteName || "",
      status: p.status || "",
      transactionId: p.transactionId || "",
      signup_date: p.createdAt || p.updatedAt || "",
    };
  })).concat((leagues || []).map(function (l) {
    return {
      kind: "league",
      league: l.league || "Saturday League",
      division: l.division || "",
      parent: l.parent || "",
      phone: l.phone || "",
      email: l.email || "",
      camper: l.camper || "",
      status: l.status || "",
      transactionId: l.transactionId || "",
      signup_date: l.signup_date || "",
    };
  }));

  return json({ ok: true, roster: roster });
};
