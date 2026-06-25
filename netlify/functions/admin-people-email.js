/**
 * admin-people-email.js  (manual / password-gated)
 *
 * One-click re-engagement send from the People view. The dashboard collects the
 * currently-filtered recipients and posts them here in small batches (the client
 * chunks them so each call stays under the function timeout). Three audiences:
 *   winback  — "Past" payers (lapsed training / finished camps) → come back
 *   reengage — "Blocked" (card declined, never paid) → we fixed the checkout
 *   nurture  — "Leads" (never paid) → still interested?
 *
 * Sends from info@fcpsports.org via SMTP, BCCs info@ for the record, and dedupes
 * per (audience|email) so nobody gets the same note twice across batches/retries.
 *
 * POST { password, template, recipients:[{email,name,athlete}], dryRun }
 *   dryRun:true  -> returns the rendered subject/body preview, sends nothing
 *   dryRun:false -> sends this batch, returns { sent, skipped }
 */
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { connectLambda, getStore } = require("@netlify/blobs");

const MAX_BATCH = 25; // client chunks to ~10; this is a safety ceiling per call

function json(b, s) { return { statusCode: s || 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }; }
function clean(v) { return String(v == null ? "" : v).trim(); }
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
  return nodemailer.createTransport({ host: "smtp.office365.com", port: 587, secure: false, auth: { user: "info@fcpsports.org", pass: process.env.FCPSPORTS_SMTP_PASS } });
}

function render(template, name, athlete) {
  const first = clean(name).split(/\s+/)[0] || "there";
  const who = clean(athlete).split(/\s+/)[0];
  if (template === "winback") {
    const kid = who || "your athlete";
    const them = who ? "them" : "your athlete";
    return {
      subject: "We'd love to get " + kid + " back on the court",
      text: "Hi " + first + ",\n\nIt's been a little while since " + kid + " trained with us at FCP Sports, and we'd love to have " + them + " back this summer.\n\nCamps and skills training are running now — you can grab a spot here:\nhttps://fcpsports.org/programs/\n\nNot sure what fits? Just reply or call 850.961.2323 and we'll help you figure it out.\n\nHope to see you soon,\nFCP Sports",
    };
  }
  if (template === "reengage") {
    return {
      subject: "Still want to get your camper into camp this summer?",
      text: "Hi " + first + ",\n\nWe noticed you started a registration but the payment didn't go through — and that was on us, we just fixed a checkout glitch that was blocking some cards.\n\nIf you're still interested, the remaining summer weeks are open — grab a spot here:\nhttps://fcpsports.org/register/\n\nAny trouble at all, reply or call 850.961.2323 and we'll get your athlete signed up.\n\n— FCP Sports",
    };
  }
  return {
    subject: "Still thinking about FCP Sports?",
    text: "Hi " + first + ",\n\nThanks for checking out FCP Sports. If you're still looking to get your athlete into basketball this summer, our camps and skills training are open now:\nhttps://fcpsports.org/programs/\n\nHappy to answer any questions — just reply or call 850.961.2323.\n\n— FCP Sports",
  };
}

exports.handler = async function (event) {
  try { connectLambda(event); } catch { /* blobs auto-config */ }
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);

  const template = clean(body.template);
  if (!/^(winback|reengage|nurture)$/.test(template)) return json({ ok: false, error: "Unknown template" }, 400);

  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (recipients.length > MAX_BATCH) return json({ ok: false, error: "Batch too large (max " + MAX_BATCH + ")" }, 400);

  // Preview only — render against the first recipient (or a generic sample)
  if (body.dryRun) {
    const sample = recipients[0] || {};
    const msg = render(template, sample.name, sample.athlete);
    return json({ ok: true, dryRun: true, template, preview: msg, batchSize: recipients.length });
  }

  if (!process.env.FCPSPORTS_SMTP_PASS) return json({ ok: false, error: "SMTP not configured" }, 500);
  const sentStore = getStore("people-email-sent");
  const transporter = smtp();
  const sent = [], skipped = [];

  for (const r of recipients) {
    const email = clean(r.email).toLowerCase();
    if (!email || !/@/.test(email)) { skipped.push({ email: email, reason: "no valid email" }); continue; }
    const key = template + "|" + email.replace(/[^a-z0-9.@_-]/gi, "_");
    if (await sentStore.get(key).catch(() => null)) { skipped.push({ email: email, reason: "already sent" }); continue; }
    const msg = render(template, r.name, r.athlete);
    try {
      await transporter.sendMail({ from: '"FCP Sports" <info@fcpsports.org>', to: email, bcc: "info@fcpsports.org", subject: msg.subject, text: msg.text });
      await sentStore.set(key, new Date().toISOString());
      sent.push({ email: email });
    } catch (e) { skipped.push({ email: email, error: e.message }); }
  }

  return json({ ok: true, template, sentCount: sent.length, skippedCount: skipped.length, sent, skipped });
};
