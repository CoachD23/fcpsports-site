/**
 * program-roster-ledger.js
 *
 * Money-truth ledger for NON-CAMP program registrations (Skills Training,
 * Private Lessons, Homeschool PE, Open Gym, Clinics) — the analogue of
 * camp-roster-ledger.js. process-payment.js writes a record here on every
 * successful charge, so the admin dashboard no longer depends on GoHighLevel
 * tags (which mis-tag and drop records). Keyed by transaction id, so re-writes
 * are idempotent.
 */
const crypto = require("crypto");
const { connectLambda, getStore } = require("@netlify/blobs");

const STORE_NAME = "program-roster-ledger";
const REGISTRATION_PREFIX = "registrations/";

function clean(value) {
  return String(value || "").trim();
}
function cleanEmail(value) {
  return clean(value).toLowerCase();
}
function personName(first, last, fallback) {
  return [clean(first), clean(last)].filter(Boolean).join(" ") || clean(fallback);
}

function programStore() {
  return getStore(STORE_NAME);
}

function connectProgramRosterLedger(event) {
  if (!event || !event.blobs) return;
  connectLambda(event);
}

function registrationId(input) {
  const transactionId = clean(input.transactionId);
  if (transactionId) return `program-txn-${transactionId}`;
  const hash = crypto
    .createHash("sha256")
    .update([cleanEmail(input.email), clean(input.program), clean(input.createdAt)].join("|"))
    .digest("hex")
    .slice(0, 20);
  return `program-${hash}`;
}

function registrationKey(recordOrId) {
  const id = typeof recordOrId === "string" ? recordOrId : recordOrId.id;
  return `${REGISTRATION_PREFIX}${id}.json`;
}

function buildProgramRosterRecord(input) {
  const now = new Date().toISOString();
  const transactionId = clean(input.transactionId);
  return {
    id: registrationId(input),
    kind: "program",
    createdAt: clean(input.createdAt) || now,
    updatedAt: now,
    source: clean(input.source) || "checkout",
    program: clean(input.program || input.programId),
    programLabel: clean(input.programLabel || input.program || input.programId),
    parentName: personName(input.parentFirst, input.parentLast, input.parentName),
    email: cleanEmail(input.email),
    phone: clean(input.phone),
    athleteName: clean(input.athleteName),
    amount: Number(input.amount ?? input.priceAmount ?? 0) || 0,
    transactionId,
    status: clean(input.status) || (transactionId ? "Paid" : ""),
  };
}

async function saveProgramRosterRecord(record, options = {}) {
  const store = options.store || programStore();
  const normalized = buildProgramRosterRecord(record);
  await store.setJSON(registrationKey(normalized), normalized);
  return normalized;
}

async function listProgramRosterRecords(options = {}) {
  const store = options.store || programStore();
  const result = await store.list({ prefix: REGISTRATION_PREFIX });
  const records = [];
  for (const blob of result.blobs || []) {
    try {
      const record = await store.get(blob.key, { type: "json" });
      if (record) records.push(record);
    } catch (err) {
      console.warn("[program-roster-ledger] Failed to read record:", blob.key, err.message);
    }
  }
  return records;
}

module.exports = {
  STORE_NAME,
  REGISTRATION_PREFIX,
  connectProgramRosterLedger,
  buildProgramRosterRecord,
  saveProgramRosterRecord,
  listProgramRosterRecords,
  registrationId,
};
