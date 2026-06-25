/**
 * training-reminders.js  (manual / password-gated)
 *
 * 30-day training renewal reminders. Each training payment = a 30-day window
 * (start = payment date). This emails the family a $149 re-up link as the window
 * closes. NO auto-charge — they pay via the link, which resets their 30 days.
 *
 * Modes:
 *   mode "daily"   — for the scheduled job: emails members whose window renews
 *                    tomorrow (soon), today, or lapsed 3 days ago.
 *   mode "catchup" — one-time backlog: emails anyone due within 7 days or expired.
 *
 * Dedup: each member gets each reminder type once per 30-day cycle (keyed by
 * email + start date + type), so re-running is safe.
 *
 * POST { password, mode?, dryRun? }  ->  { ok, members, sent, skipped }
 */
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { connectProgramRosterLedger, listProgramRosterRecords } = require("./lib/program-roster-ledger");
const { getStore } = require("@netlify/blobs");

const SENT_STORE = "training-reminders-sent";
const RATE = 149;
const PAY_LINKS = {
  "skills-training": "https://fcpsports.org/checkout/?program=skills-training",
  "private-lesson": "https://fcpsports.org/checkout/?program=private-lesson",
  "homeschool-pe": "https://fcpsports.org/checkout/?program=homeschool-pe",
};

function json(b, s) { return { statusCode: s || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function clean(v) { return String(v == null ? "" : v).trim(); }
function firstName(n) { return clean(n).split(/\s+/)[0] || "there"; }
function passwordValid(input) {
  const stored = process.env.ADMIN_PASSWORD;
  if (!stored || !input) return false;
  try {
    const a = Buffer.from(String(input).padEnd(64).slice(0, 64), "utf8");
    const b = Buffer.from(String(stored).padEnd(64).slice(0, 64), "utf8");
    return crypto.timingSafeEqual(a, b) && input === stored;
  } catch { return false; }
}
function smtp() {
  return nodemailer.createTransport({
    host: "smtp.office365.com", port: 587, secure: false,
    auth: { user: "info@fcpsports.org", pass: process.env.FCPSPORTS_SMTP_PASS },
  });
}
function todayUTC() { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function iso(d) { return d.toISOString().slice(0, 10); }
function niceDate(isoStr) { const d = new Date(isoStr + "T00:00:00Z"); return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }); }

function emailFor(type, m) {
  const first = firstName(m.parent);
  const who = clean(m.athlete).split(/\s+/)[0] || "your athlete";
  const when = niceDate(m.expiry);
  const link = PAY_LINKS[m.program] || PAY_LINKS["skills-training"];
  if (type === "today") {
    return {
      subject: `${who}'s training renews today`,
      text: `Hi ${first},\n\nToday is ${who}'s last covered training day. Renew for $${RATE} to keep their spot for the next 30 days:\n${link}\n\nReply to this email or call 850.961.2323 with any questions.\n\n— FCP Sports`,
    };
  }
  if (type === "lapsed") {
    return {
      subject: `$${RATE} due for ${who}'s training`,
      text: `Hi ${first},\n\n${who}'s 30-day training period renewed on ${when}, and since ${who} has kept training with us, the $${RATE} for this period is now due. You can take care of it here:\n${link}\n\nThat keeps ${who} going for the next 30 days — two sessions a week, 90 minutes each. Thanks so much for training with FCP Sports!\n\nQuestions? Just reply or call 850.961.2323.\n\n— FCP Sports`,
    };
  }
  // soon
  return {
    subject: `${who}'s training renews ${when}`,
    text: `Hi ${first},\n\n${who}'s 30 days of training are up on ${when}. To keep them on the court, renew for $${RATE} here:\n${link}\n\nThat covers the next 30 days — two sessions a week, 90 minutes each.\n\nQuestions? Just reply or call 850.961.2323.\n\n— FCP Sports`,
  };
}

async function computeMembers() {
  const records = await listProgramRosterRecords();
  const byKid = {};
  for (const r of records) {
    const email = clean(r.email).toLowerCase();
    const d = clean(r.createdAt).slice(0, 10);
    if (!email || !d) continue;
    const key = clean(r.athleteName || r.parentName).toLowerCase() + "|" + email;
    if (!byKid[key] || d > byKid[key]._start) { byKid[key] = Object.assign({}, r, { _start: d }); }
  }
  const today = todayUTC();
  return Object.keys(byKid).map((k) => {
    const r = byKid[k];
    const start = new Date(r._start + "T00:00:00Z");
    const exp = addDays(start, 30);
    return {
      athlete: clean(r.athleteName) || clean(r.parentName), parent: clean(r.parentName),
      email: clean(r.email).toLowerCase(), program: clean(r.program) || "skills-training",
      start: r._start, expiry: iso(exp), daysLeft: Math.round((exp - today) / 86400000),
    };
  });
}

exports.handler = async function (event) {
  connectProgramRosterLedger(event);
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  const dryRun = !!body.dryRun;
  const members = await computeMembers();

  // mode "one" — manual "Remind" button: email a single member their renewal note.
  if (body.mode === "one") {
    const email = clean(body.email).toLowerCase();
    if (!email) return json({ ok: false, error: "email required" }, 400);
    const want = clean(body.athlete).toLowerCase();
    const m = (want && members.find((x) => x.email === email && clean(x.athlete).toLowerCase() === want)) || members.find((x) => x.email === email);
    if (!m) return json({ ok: false, error: "No training member with that email" }, 404);
    const type = m.daysLeft < 0 ? "lapsed" : (m.daysLeft === 0 ? "today" : "soon");
    const msg = emailFor(type, m);
    if (dryRun) return json({ ok: true, mode: "one", dryRun: true, athlete: m.athlete, type, preview: msg });
    if (!process.env.FCPSPORTS_SMTP_PASS) return json({ ok: false, error: "SMTP not configured" }, 500);
    const store = getStore(SENT_STORE);
    const sentKey = `${m.email}|${m.start}|${type}`.replace(/[^a-z0-9|.@_-]/gi, "_");
    if (await store.get(sentKey).catch(() => null)) {
      return json({ ok: true, mode: "one", sentCount: 0, skipped: [{ athlete: m.athlete, reason: "already reminded this cycle" }] });
    }
    try {
      await smtp().sendMail({ from: '"FCP Sports" <info@fcpsports.org>', to: m.email, bcc: "info@fcpsports.org", subject: msg.subject, text: msg.text });
      await store.set(sentKey, new Date().toISOString());
      return json({ ok: true, mode: "one", sentCount: 1, athlete: m.athlete, type });
    } catch (e) { return json({ ok: false, error: e.message }, 500); }
  }

  const mode = body.mode === "catchup" ? "catchup" : "daily";

  const queue = [];
  for (const m of members) {
    let type = null;
    if (mode === "catchup") {
      if (m.daysLeft <= 0) type = "lapsed";
      else if (m.daysLeft <= 7) type = "soon";
    } else {
      if (m.daysLeft === 1) type = "soon";
      else if (m.daysLeft === 0) type = "today";
      else if (m.daysLeft === -3) type = "lapsed";
    }
    if (type) queue.push(Object.assign({}, m, { type }));
  }

  const store = getStore(SENT_STORE);
  const transporter = (!dryRun && process.env.FCPSPORTS_SMTP_PASS) ? smtp() : null;
  const sent = [], skipped = [];
  for (const m of queue) {
    const sentKey = `${m.email}|${m.start}|${m.type}`.replace(/[^a-z0-9|.@_-]/gi, "_");
    const already = await store.get(sentKey).catch(() => null);
    if (already) { skipped.push({ athlete: m.athlete, type: m.type, reason: "already sent this cycle" }); continue; }
    if (dryRun) { sent.push({ athlete: m.athlete, email: m.email, type: m.type, dryRun: true }); continue; }
    if (!transporter) { skipped.push({ athlete: m.athlete, reason: "SMTP not configured" }); continue; }
    const msg = emailFor(m.type, m);
    try {
      await transporter.sendMail({ from: '"FCP Sports" <info@fcpsports.org>', to: m.email, bcc: "info@fcpsports.org", subject: msg.subject, text: msg.text });
      await store.set(sentKey, new Date().toISOString());
      sent.push({ athlete: m.athlete, email: m.email, type: m.type });
    } catch (e) { skipped.push({ athlete: m.athlete, error: e.message }); }
  }

  return json({ ok: true, mode, dryRun, members: members.length, sentCount: sent.length, sent, skipped });
};
