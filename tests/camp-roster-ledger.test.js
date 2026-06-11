const assert = require("node:assert/strict");

const {
  buildCampRosterRecord,
  saveCampRosterRecord,
  summarizeCampRosterRecords,
  applyCampRosterMove,
} = require("../netlify/functions/lib/camp-roster-ledger");
const {
  findMissingCampTransactions,
  isCampTransaction,
  isPaidTransaction,
  parseCampDescription,
} = require("../netlify/functions/lib/camp-roster-reconciliation");

function fakeStore() {
  const data = new Map();
  return {
    data,
    async setJSON(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    async get(key, opts) {
      assert.equal(opts && opts.type, "json");
      return data.get(key) || null;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Array.from(data.keys())
          .filter((key) => !prefix || key.startsWith(prefix))
          .map((key) => ({ key })),
      };
    },
  };
}

async function run() {
  const paidAt = "2026-05-06T22:07:23.500Z";
  const record = buildCampRosterRecord({
    transactionId: "81599957095",
    eventId: "evt-jameson",
    paymentStatus: "Paid",
    registeredAt: paidAt,
    source: "camp-registration",
    camp: "summer-kickoff-2026",
    campName: "Summer Kickoff — Morning",
    campDates: "June 1 – 5, 2026",
    parentEmail: "andygiles529@hotmail.com",
    parentFirst: "Andrew",
    parentLast: "Giles",
    parentPhone: "8505550100",
    parentZip: "32566",
    childFirst: "Jameson",
    childLast: "Giles",
    childDob: "2019-01-24",
    childGrade: "2",
    shirtSize: "YS",
    emergencyName: "Breanna Giles",
    emergencyPhone: "8438123655",
    medicalNotes: "Asthma",
    photoConsent: true,
    priceAmount: 109,
    priceTier: "Camp registration",
    promoApplied: "SIBLING20,MILITARY20",
    utm: { utm_source: "google", utm_medium: "ppc" },
  });

  assert.equal(record.id, "camp-txn-81599957095");
  assert.equal(record.status, "active");
  assert.equal(record.camp.id, "summer-kickoff-2026");
  assert.equal(record.camper.name, "Jameson Giles");
  assert.equal(record.parent.email, "andygiles529@hotmail.com");
  assert.equal(record.payment.amount, 109);
  assert.deepEqual(record.moveHistory, []);

  const store = fakeStore();
  await saveCampRosterRecord(record, { store });
  assert.ok(store.data.has("registrations/camp-txn-81599957095.json"));

  const moved = applyCampRosterMove(record, {
    campId: "summer-s1-jun08",
    campName: "Session 1 — Morning",
    campDates: "June 8 – 12, 2026",
    reason: "Parent requested sibling same session",
    changedAt: "2026-05-06T23:15:17.651Z",
  });

  assert.equal(moved.camp.id, "summer-s1-jun08");
  assert.equal(moved.camp.name, "Session 1 — Morning");
  assert.equal(moved.moveHistory.length, 1);
  assert.equal(moved.moveHistory[0].from.campId, "summer-kickoff-2026");
  assert.equal(moved.moveHistory[0].to.campId, "summer-s1-jun08");

  const summary = summarizeCampRosterRecords([
    moved,
    buildCampRosterRecord({
      transactionId: "81599952624",
      registeredAt: "2026-05-06T22:03:59.110Z",
      source: "camp-registration",
      camp: "summer-s1-jun08",
      campName: "Session 1 — Morning",
      campDates: "June 8 – 12, 2026",
      parentEmail: "andygiles529@hotmail.com",
      parentFirst: "Andrew",
      parentLast: "Giles",
      childFirst: "Leia",
      childLast: "Giles",
      priceAmount: 129,
      promoApplied: "MILITARY20",
      utm: { utm_source: "google" },
    }),
    { ...record, id: "voided", status: "voided" },
  ], { now: new Date("2026-05-06T23:30:00Z") });

  assert.equal(summary.registrations.total, 2);
  assert.equal(summary.registrations.today, 2);
  assert.equal(summary.registrations.revenue_total, 238);
  assert.deepEqual(summary.by_camp, [
    {
      camp: "Session 1 — Morning",
      camp_id: "summer-s1-jun08",
      dates: "June 8 – 12, 2026",
      count: 2,
      revenue: 238,
    },
  ]);
  assert.equal(summary.recent[0].camper, "Jameson Giles");
  assert.equal(summary.recent[0].moved_from, "Summer Kickoff — Morning");
  assert.equal(summary.utm_breakdown.google, 2);

  assert.equal(isCampTransaction({
    transId: "1",
    transactionStatus: "settledSuccessfully",
    order: { invoiceNumber: "CAMP-ABC", description: "\"Session 1 — Morning\" — Leia Giles" },
  }), true);
  assert.equal(isPaidTransaction({ transactionStatus: "declined" }), false);
  assert.equal(isCampTransaction({
    transId: "declined",
    transactionStatus: "declined",
    order: { invoiceNumber: "CAMP-MPPK66J7", description: "\"Session 5 — Afternoon\" — Zoey Blando" },
  }), false);
  assert.equal(isCampTransaction({
    transId: "2",
    order: { invoiceNumber: "FCP-GENERIC", description: "Skills Training" },
  }), false);
  assert.deepEqual(parseCampDescription("\"Session 1 — Morning\" — Leia Giles"), {
    campName: "Session 1 — Morning",
    camperName: "Leia Giles",
  });

  const missing = findMissingCampTransactions([
    { transId: "81599952624", order: { invoiceNumber: "CAMP-MOULTWM5", description: "\"Session 1 — Morning\" — Leia Giles" } },
    { transId: "81599957095", order: { invoiceNumber: "CAMP-MOULYAEO", description: "\"Summer Kickoff — Morning\" — Jameson Giles" } },
    { transId: "81629273912", transactionStatus: "declined", order: { invoiceNumber: "CAMP-MPPK66J7", description: "\"Session 5 — Afternoon\" — Zoey Blando" } },
    { transId: "999", order: { invoiceNumber: "FCP-999", description: "Skills Training" } },
  ], [
    buildCampRosterRecord({ transactionId: "81599952624", camp: "summer-s1-jun08", childFirst: "Leia", childLast: "Giles" }),
  ]);
  assert.deepEqual(missing.map((tx) => tx.transId), ["81599957095"]);
}

run()
  .then(() => console.log("Camp roster ledger tests passed"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
