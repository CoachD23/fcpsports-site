/**
 * admin-failed-payments.js  (manual / password-gated)
 *
 * "Interested payers blocked by the system" — reads the payment-alerts store for
 * eventType "payment_failed" (declined/errored charges from camp + checkout),
 * dedupes by email, and EXCLUDES anyone who later paid successfully (on the camp
 * or program ledger). The remainder = people who tried to pay and never got
 * through. Read-only.
 *
 * POST { password }  ->  { ok, totalFailed, paidExcluded, blocked: [...] }
 */
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { getStore } = require("@netlify/blobs");
const { connectCampRosterLedger, listCampRosterRecords } = require("./lib/camp-roster-ledger");
const { connectProgramRosterLedger, listProgramRosterRecords } = require("./lib/program-roster-ledger");

function json(b, s) { return { statusCode: s || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function clean(v) { return String(v == null ? "" : v).trim(); }
function smtp() {
  return nodemailer.createTransport({ host: "smtp.office365.com", port: 587, secure: false, auth: { user: "info@fcpsports.org", pass: process.env.FCPSPORTS_SMTP_PASS } });
}
function reengageEmail(name) {
  const first = clean(name).split(/\s+/)[0] || "there";
  return {
    subject: "Still want to get your camper into camp this summer?",
    text: `Hi ${first},\n\nWe noticed you started a camp registration but the payment didn't go through — and that was on us, we just fixed a checkout glitch that was blocking some cards.\n\nIf you're still interested, the remaining summer weeks are open — grab a spot here:\nhttps://fcpsports.org/register/\n\nAny trouble at all, reply to this email or call 850.961.2323 and we'll get your athlete signed up.\n\n— FCP Sports`,
  };
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

exports.handler = async function (event) {
  connectCampRosterLedger(event);
  connectProgramRosterLedger(event);
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  // 1) failed charges from the payment-alerts store, deduped by email (latest attempt)
  const failed = {};
  const breakdown = {};
  let totalIssues = 0;
  try {
    const store = getStore("payment-alerts");
    const res = await store.list({ prefix: "issues/" });
    for (const blob of (res.blobs || [])) {
      let issue;
      try { issue = await store.get(blob.key, { type: "json" }); } catch { continue; }
      if (!issue) continue;
      totalIssues += 1;
      const et = clean(issue.eventType) || "(none)";
      breakdown[et] = (breakdown[et] || 0) + 1;
      if (issue.eventType !== "payment_failed") continue;
      const email = clean(issue.email).toLowerCase();
      if (!email) continue;
      const ts = clean(issue.timestamp);
      if (!failed[email]) failed[email] = { email, attempts: 0 };
      failed[email].attempts += 1;
      if (!failed[email].timestamp || ts > failed[email].timestamp) {
        failed[email].timestamp = ts;
        failed[email].parentName = clean(issue.parentName);
        failed[email].athleteName = clean(issue.athleteName);
        failed[email].program = clean(issue.programName || issue.programId || issue.camp || "");
        failed[email].amount = issue.amount || "";
        failed[email].error = clean(issue.error);
      }
    }
  } catch (err) {
    return json({ ok: false, error: "Could not read payment-alerts store: " + err.message }, 500);
  }

  // 2) emails that successfully paid (camp + program ledgers)
  const [campRecs, progRecs] = await Promise.all([
    listCampRosterRecords().catch(() => []),
    listProgramRosterRecords().catch(() => []),
  ]);
  const paid = new Set();
  campRecs.forEach((r) => {
    const e = clean(r.parent && r.parent.email).toLowerCase();
    const isPaid = (r.payment && r.payment.transactionId) || /paid/i.test((r.payment && r.payment.status) || "");
    if (e && isPaid) paid.add(e);
  });
  progRecs.forEach((r) => { const e = clean(r.email).toLowerCase(); if (e) paid.add(e); });

  // 3) failed AND never paid
  const blocked = Object.values(failed).filter((f) => !paid.has(f.email));
  blocked.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  // 4) optional send — to the store-blocked list OR an explicit recipients list
  //    (the Authnet-found declines come in via body.recipients). Always re-checks
  //    the paid roster and dedupes so nobody is emailed twice or after paying.
  if (body.send) {
    const recips = Array.isArray(body.recipients) && body.recipients.length
      ? body.recipients.map((r) => ({ email: clean(r.email).toLowerCase(), name: clean(r.name || r.parentName) }))
      : blocked.map((b) => ({ email: b.email, name: b.parentName }));
    const sentStore = getStore("failed-payment-reengage-sent");
    const transporter = (!body.dryRun && process.env.FCPSPORTS_SMTP_PASS) ? smtp() : null;
    const sent = [], skipped = [];
    for (const r of recips) {
      if (!r.email || !/@/.test(r.email)) { skipped.push({ email: r.email, reason: "no valid email" }); continue; }
      if (paid.has(r.email)) { skipped.push({ email: r.email, reason: "on paid roster" }); continue; }
      const k = r.email.replace(/[^a-z0-9.@_-]/gi, "_");
      if (await sentStore.get(k).catch(() => null)) { skipped.push({ email: r.email, reason: "already sent" }); continue; }
      if (body.dryRun) { sent.push({ email: r.email, name: r.name, dryRun: true }); continue; }
      if (!transporter) { skipped.push({ email: r.email, reason: "SMTP not configured" }); continue; }
      const msg = reengageEmail(r.name);
      try {
        await transporter.sendMail({ from: '"FCP Sports" <info@fcpsports.org>', to: r.email, bcc: "info@fcpsports.org", subject: msg.subject, text: msg.text });
        await sentStore.set(k, new Date().toISOString());
        sent.push({ email: r.email, name: r.name });
      } catch (e) { skipped.push({ email: r.email, error: e.message }); }
    }
    return json({ ok: true, mode: "send", dryRun: !!body.dryRun, sentCount: sent.length, sent, skipped });
  }

  return json({
    ok: true,
    storeTotalIssues: totalIssues,
    eventTypeBreakdown: breakdown,
    totalFailedContacts: Object.keys(failed).length,
    paidExcluded: Object.keys(failed).length - blocked.length,
    blockedCount: blocked.length,
    blocked,
  });
};
