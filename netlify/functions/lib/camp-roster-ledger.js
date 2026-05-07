const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "camp-roster-ledger";
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

function rosterStore() {
  return getStore(STORE_NAME);
}

function fallbackId(input) {
  const hash = crypto
    .createHash("sha256")
    .update([
      cleanEmail(input.parentEmail),
      clean(input.childFirst),
      clean(input.childLast),
      clean(input.camp || input.campId),
      clean(input.registeredAt || input.createdAt),
    ].join("|"))
    .digest("hex")
    .slice(0, 20);
  return `camp-${hash}`;
}

function registrationId(input) {
  const transactionId = clean(input.transactionId || input.payment?.transactionId);
  return transactionId ? `camp-txn-${transactionId}` : fallbackId(input);
}

function buildCampRosterRecord(input) {
  const campInput = input.camp && typeof input.camp === "object" ? input.camp : {};
  const parentInput = input.parent && typeof input.parent === "object" ? input.parent : {};
  const camperInput = input.camper && typeof input.camper === "object" ? input.camper : {};
  const emergencyInput = input.emergency && typeof input.emergency === "object" ? input.emergency : {};
  const paymentInput = input.payment && typeof input.payment === "object" ? input.payment : {};
  const attributionInput = input.attribution && typeof input.attribution === "object" ? input.attribution : {};
  const now = new Date().toISOString();
  const registeredAt = clean(input.registeredAt || input.paidAt || input.createdAt) || now;
  const transactionId = clean(input.transactionId || paymentInput.transactionId);
  const id = clean(input.id) || registrationId(input);
  const parentName = personName(input.parentFirst ?? parentInput.firstName, input.parentLast ?? parentInput.lastName, input.parentName || parentInput.name);
  const camperName = personName(input.childFirst ?? camperInput.firstName, input.childLast ?? camperInput.lastName, input.camperName || input.athleteName || camperInput.name);
  const amount = Number(input.priceAmount ?? input.amount ?? paymentInput.amount ?? 0) || 0;

  return {
    schemaVersion: 1,
    id,
    status: input.status || "active",
    source: clean(input.source) || "camp-registration",
    createdAt: clean(input.createdAt) || registeredAt,
    updatedAt: clean(input.updatedAt) || now,
    registeredAt,
    eventId: clean(input.eventId),
    camp: {
      id: clean(input.campId || campInput.id || input.camp),
      name: clean(input.campName || input.programName || campInput.name || input.campId || input.camp),
      dates: clean(input.campDates || input.dates || campInput.dates),
      startDate: clean(input.campStartDate || input.startDate || campInput.startDate),
      endDate: clean(input.campEndDate || input.endDate || campInput.endDate),
      session: clean(input.session || campInput.session),
    },
    parent: {
      firstName: clean(input.parentFirst ?? parentInput.firstName),
      lastName: clean(input.parentLast ?? parentInput.lastName),
      name: parentName,
      email: cleanEmail(input.parentEmail || input.email || parentInput.email),
      phone: clean(input.parentPhone || input.phone || parentInput.phone),
      zip: clean(input.parentZip || input.zip || parentInput.zip),
    },
    camper: {
      firstName: clean(input.childFirst ?? camperInput.firstName),
      lastName: clean(input.childLast ?? camperInput.lastName),
      name: camperName,
      dob: clean(input.childDob || camperInput.dob),
      grade: clean(input.childGrade || camperInput.grade),
      shirtSize: clean(input.shirtSize || camperInput.shirtSize),
    },
    emergency: {
      name: clean(input.emergencyName || emergencyInput.name),
      phone: clean(input.emergencyPhone || emergencyInput.phone),
    },
    medicalNotes: clean(input.medicalNotes),
    photoConsent: Boolean(input.photoConsent),
    payment: {
      status: clean(input.paymentStatus || paymentInput.status) || (transactionId ? "Paid" : ""),
      amount,
      priceTier: clean(input.priceTier || paymentInput.priceTier),
      promoApplied: clean(input.promoApplied || paymentInput.promoApplied),
      transactionId,
    },
    attribution: {
      source: clean(input.attributionSource || attributionInput.source || input.source),
      utmSource: clean(input.utm?.utm_source || input.utmSource || attributionInput.utmSource),
      utmMedium: clean(input.utm?.utm_medium || input.utmMedium || attributionInput.utmMedium),
      utmCampaign: clean(input.utm?.utm_campaign || input.utmCampaign || attributionInput.utmCampaign),
    },
    crm: {
      ghlContactId: clean(input.contactId || input.ghlContactId || input.crm?.ghlContactId),
    },
    moveHistory: Array.isArray(input.moveHistory) ? input.moveHistory : [],
    notes: clean(input.notes),
  };
}

function registrationKey(recordOrId) {
  const id = typeof recordOrId === "string" ? recordOrId : recordOrId.id;
  return `${REGISTRATION_PREFIX}${id}.json`;
}

async function saveCampRosterRecord(record, options = {}) {
  const store = options.store || rosterStore();
  const normalized = buildCampRosterRecord(record);
  await store.setJSON(registrationKey(normalized), normalized);
  return normalized;
}

async function getCampRosterRecord(id, options = {}) {
  const store = options.store || rosterStore();
  return store.get(registrationKey(id), { type: "json" });
}

async function listCampRosterRecords(options = {}) {
  const store = options.store || rosterStore();
  const result = await store.list({ prefix: REGISTRATION_PREFIX });
  const records = [];
  for (const blob of result.blobs || []) {
    try {
      const record = await store.get(blob.key, { type: "json" });
      if (record) records.push(record);
    } catch (err) {
      console.warn("[camp-roster-ledger] Failed to read roster record:", blob.key, err.message);
    }
  }
  return records;
}

function applyCampRosterMove(record, move) {
  const current = buildCampRosterRecord(record);
  const changedAt = clean(move.changedAt) || new Date().toISOString();
  const from = {
    campId: current.camp.id,
    campName: current.camp.name,
    campDates: current.camp.dates,
  };
  const to = {
    campId: clean(move.campId || move.toCampId),
    campName: clean(move.campName || move.toCampName),
    campDates: clean(move.campDates || move.toCampDates),
  };

  return {
    ...current,
    updatedAt: changedAt,
    camp: {
      ...current.camp,
      id: to.campId || current.camp.id,
      name: to.campName || current.camp.name,
      dates: to.campDates || current.camp.dates,
    },
    moveHistory: [
      ...(Array.isArray(current.moveHistory) ? current.moveHistory : []),
      {
        changedAt,
        reason: clean(move.reason),
        changedBy: clean(move.changedBy),
        from,
        to,
      },
    ],
  };
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function sourceBucket(record) {
  const source = clean(record.attribution?.utmSource || record.attribution?.source).toLowerCase();
  if (/instagram|ig/.test(source)) return "instagram";
  if (/facebook|fb/.test(source)) return "facebook";
  if (/google|adwords|youtube/.test(source)) return "google";
  return "direct";
}

function summarizeCampRosterRecords(records, options = {}) {
  const now = options.now || new Date();
  const today = dateOnly(now.toISOString());
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = dateOnly(weekAgo.toISOString());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = dateOnly(monthStart.toISOString());

  let total = 0;
  let todayCount = 0;
  let weekCount = 0;
  let revenueTotal = 0;
  let revenueToday = 0;
  const campMap = {};
  const recentRows = [];
  const utmMap = { instagram: 0, facebook: 0, google: 0, direct: 0 };

  for (const input of records || []) {
    const record = buildCampRosterRecord(input);
    if (record.status && !["active", "needs_review"].includes(record.status)) continue;

    const registeredDate = dateOnly(record.registeredAt || record.createdAt);
    const amount = Number(record.payment?.amount || 0) || 0;
    const campKey = record.camp.id || record.camp.name || "unknown";
    const campName = record.camp.name || record.camp.id || "Unknown Camp";
    const latestMove = record.moveHistory && record.moveHistory.length
      ? record.moveHistory[record.moveHistory.length - 1]
      : null;

    total++;
    if (registeredDate === today) {
      todayCount++;
      revenueToday += amount;
    }
    if (registeredDate >= weekAgoStr) weekCount++;
    if (registeredDate >= monthStartStr) revenueTotal += amount;

    if (!campMap[campKey]) {
      campMap[campKey] = {
        camp: campName,
        camp_id: record.camp.id,
        dates: record.camp.dates,
        count: 0,
        revenue: 0,
      };
    }
    campMap[campKey].count++;
    campMap[campKey].revenue += amount;

    utmMap[sourceBucket(record)]++;

    recentRows.push({
      date: registeredDate,
      parent: record.parent.name || "—",
      camper: record.camper.name || "—",
      camp: campName,
      camp_id: record.camp.id,
      dates: record.camp.dates,
      amount,
      status: record.status,
      transaction_id: record.payment.transactionId,
      moved_from: latestMove ? latestMove.from.campName : "",
      _ts: record.registeredAt || record.createdAt || "",
    });
  }

  recentRows.sort((a, b) => String(b._ts).localeCompare(String(a._ts)));

  const byCamp = Object.values(campMap)
    .map((camp) => ({ ...camp, revenue: Math.round(camp.revenue) }))
    .sort((a, b) => b.count - a.count || a.camp.localeCompare(b.camp));

  return {
    registrations: {
      total,
      today: todayCount,
      this_week: weekCount,
      revenue_total: Math.round(revenueTotal),
      revenue_today: Math.round(revenueToday),
    },
    by_camp: byCamp,
    recent: recentRows.slice(0, 10).map(({ _ts, ...row }) => row),
    utm_breakdown: utmMap,
  };
}

module.exports = {
  REGISTRATION_PREFIX,
  STORE_NAME,
  applyCampRosterMove,
  buildCampRosterRecord,
  getCampRosterRecord,
  listCampRosterRecords,
  registrationId,
  registrationKey,
  saveCampRosterRecord,
  summarizeCampRosterRecords,
};
