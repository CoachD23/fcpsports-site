/**
 * admin-training-audit.js  (manual / reconcile)
 *
 * Money-truth check for TRAINING payments (Skills / Private / Homeschool) over a
 * date range, straight from Authorize.net. Camps are skipped by their CAMP-
 * invoice prefix; everything else is detail-fetched and classified by its order
 * description. Use to confirm the program ledger isn't missing any training
 * signups (the same GHL gap that hid camp registrations).
 *
 * POST { password, from?, to? }  ->  { ok, from, to, training: [...] }
 */
const crypto = require("crypto");
const https = require("https");
const { connectProgramRosterLedger, saveProgramRosterRecord, STORE_NAME: PROGRAM_STORE, REGISTRATION_PREFIX: PROGRAM_PREFIX } = require("./lib/program-roster-ledger");
const { getStore } = require("@netlify/blobs");

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
function authnetUrl() {
  return process.env.AUTHNET_ENV === "sandbox"
    ? "https://apitest.authorize.net/xml/v1/request.api"
    : "https://api.authorize.net/xml/v1/request.api";
}
function merchantAuth() {
  return { name: process.env.AUTHNET_API_LOGIN, transactionKey: process.env.AUTHNET_TRANSACTION_KEY };
}
function authnetPost(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(authnetUrl());
    const req = https.request(
      { hostname: u.hostname, path: u.pathname, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve(JSON.parse(body.replace(/^﻿/, ""))); }
          catch (e) { reject(new Error("Authnet parse error: " + body.slice(0, 120))); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
async function chunked(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}
function classify(desc) {
  const d = clean(desc).toLowerCase();
  if (/skills training/.test(d)) return { program: "skills-training", label: "Skills Training" };
  if (/private/.test(d)) return { program: "private-lesson", label: "Private Lessons" };
  if (/homeschool/.test(d)) return { program: "homeschool-pe", label: "Homeschool PE" };
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  if (!passwordValid(body.password)) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!process.env.AUTHNET_API_LOGIN || !process.env.AUTHNET_TRANSACTION_KEY) return json({ ok: false, error: "Authnet not configured" }, 500);

  const from = clean(body.from) || "2026-05-01";
  const to = clean(body.to) || new Date().toISOString().slice(0, 10);

  // 1) settled batches — Authnet caps getSettledBatchList at 31 days, so chunk the range
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const windows = [];
  for (let ws = from; ws <= to;) { let we = addDays(ws, 30); if (we > to) we = to; windows.push([ws, we]); ws = addDays(we, 1); }
  const batchIds = [];
  const errors = [];
  for (const [ws, we] of windows) {
    const br = await authnetPost({
      getSettledBatchListRequest: { merchantAuthentication: merchantAuth(), firstSettlementDate: ws + "T00:00:00Z", lastSettlementDate: we + "T23:59:59Z" },
    }).catch((e) => ({ _err: e.message }));
    if (br._err) { errors.push(br._err); continue; }
    if (br.messages && br.messages.resultCode === "Error") errors.push((br.messages.message || []).map((m) => m.text).join("; "));
    (br.batchList || []).forEach((b) => { if (b.batchId) batchIds.push(b.batchId); });
  }

  // 2) list transactions per batch (parallel) + unsettled; tally SETTLED camps, keep settled non-camp candidates
  const candidates = [];
  const campTxns = [];
  let campCount = 0, campSum = 0;
  const isSettled = (s) => /settledSuccessfully|capturedPendingSettlement/i.test(s);
  const pushTxn = (t) => {
    const inv = clean(t.invoiceNumber);
    const status = clean(t.transactionStatus);
    const amt = Number(t.settleAmount || t.authAmount || 0) || 0;
    if (/^CAMP-/i.test(inv)) {
      if (isSettled(status)) { campCount++; campSum += amt; }
      campTxns.push({ transId: clean(t.transId), name: [clean(t.firstName), clean(t.lastName)].filter(Boolean).join(" "), amount: amt, date: clean(t.submitTimeUTC).slice(0, 10), status });
      return;
    }
    if (!isSettled(status)) return; // skip declined/errored non-camp — they never charged
    candidates.push({ transId: clean(t.transId), name: [clean(t.firstName), clean(t.lastName)].filter(Boolean).join(" "), amount: amt, date: clean(t.submitTimeUTC), status });
  };
  const lists = await chunked(batchIds, 6, (batchId) =>
    authnetPost({ getTransactionListRequest: { merchantAuthentication: merchantAuth(), batchId, paging: { limit: 1000, offset: 1 } } }).catch(() => ({}))
  );
  lists.forEach((r) => (r.transactions || []).forEach(pushTxn));
  const unResp = await authnetPost({ getUnsettledTransactionListRequest: { merchantAuthentication: merchantAuth() } }).catch(() => ({}));
  (unResp.transactions || []).forEach(pushTxn);

  // 3) detail-fetch candidates (parallel, chunked) and classify training
  const details = await chunked(candidates.filter((c) => c.transId), 6, (c) =>
    authnetPost({ getTransactionDetailsRequest: { merchantAuthentication: merchantAuth(), transId: c.transId } })
      .then((d) => ({ c, tx: d.transaction || {} }))
      .catch(() => ({ c, tx: {} }))
  );

  const training = [];
  details.forEach(({ c, tx }) => {
    const cls = classify(tx.order && tx.order.description);
    if (!cls) return;
    const date = clean(tx.submitTimeUTC || c.date).slice(0, 10);
    training.push({
      transId: c.transId,
      program: cls.program,
      label: cls.label,
      name: [clean(tx.billTo && tx.billTo.firstName), clean(tx.billTo && tx.billTo.lastName)].filter(Boolean).join(" ") || c.name,
      email: clean(tx.customer && tx.customer.email),
      amount: Number(tx.settleAmount || tx.authAmount || c.amount || 0) || 0,
      date,
      month: date.slice(0, 7),
      status: clean(tx.transactionStatus || c.status),
      description: clean(tx.order && tx.order.description),
    });
  });
  training.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Optional: rebuild the program ledger from this Authnet money-truth, with the
  // ATHLETE name pulled from the order description ("Skills Training - Kyle Daniels").
  let synced = 0;
  if (body.sync) {
    connectProgramRosterLedger(event);
    const store = getStore(PROGRAM_STORE);
    const existing = await store.list({ prefix: PROGRAM_PREFIX });
    for (const b of (existing.blobs || [])) { await store.delete(b.key); } // clear (avoid hash-key vs txn-key dupes)
    for (const t of training) {
      const athlete = t.description.includes(" - ") ? t.description.split(" - ").pop().trim() : "";
      await saveProgramRosterRecord({
        program: t.program, programLabel: t.label,
        parentName: t.name, email: t.email, phone: "",
        athleteName: athlete, amount: t.amount, transactionId: t.transId,
        createdAt: (t.date || "").slice(0, 10) + "T12:00:00Z",
        source: "authnet-sync",
      });
      synced++;
    }
  }

  const trainingSum = Math.round(training.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
  return json({ ok: true, from, to, windows: windows.length, batches: batchIds.length, candidatesChecked: candidates.length, camps: { count: campCount, sum: Math.round(campSum * 100) / 100 }, campTxns, trainingCount: training.length, trainingSum, synced, errors, training });
};
