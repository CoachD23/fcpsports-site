const {
  buildCampRosterRecord,
  applyCampRosterMove,
  saveCampRosterRecord,
  listCampRosterRecords,
  summarizeCampRosterRecords,
  registrationKey,
  STORE_NAME,
} = require("../netlify/functions/lib/camp-roster-ledger");
const { spawnSync } = require("node:child_process");

const baseRecords = [
  {
    transactionId: "81599952624",
    registeredAt: "2026-05-06T22:03:59.110Z",
    source: "backfill-ghl-notes",
    attributionSource: "adwords Ad",
    camp: "summer-s1-jun08",
    campName: "Session 1 — Morning",
    campDates: "June 8 – 12, 2026",
    parentEmail: "andygiles529@hotmail.com",
    parentFirst: "Andrew",
    parentLast: "Giles",
    parentZip: "32566",
    childFirst: "Leia",
    childLast: "Giles",
    childDob: "2019-01-24",
    childGrade: "2",
    shirtSize: "YS",
    emergencyName: "Breanna Giles",
    emergencyPhone: "8438123655",
    photoConsent: true,
    priceAmount: 129,
    priceTier: "Camp registration",
    promoApplied: "MILITARY20",
    paymentStatus: "Paid",
    utm: { utm_source: "adwords", utm_medium: "ppc" },
  },
  {
    transactionId: "81599957095",
    registeredAt: "2026-05-06T22:07:23.500Z",
    source: "backfill-ghl-notes",
    attributionSource: "adwords Ad",
    camp: "summer-kickoff-2026",
    campName: "Summer Kickoff — Morning",
    campDates: "June 1 – 5, 2026",
    parentEmail: "andygiles529@hotmail.com",
    parentFirst: "Andrew",
    parentLast: "Giles",
    parentZip: "32566",
    childFirst: "Jameson",
    childLast: "Giles",
    childDob: "2019-01-24",
    childGrade: "2",
    shirtSize: "YS",
    emergencyName: "Breanna Giles",
    emergencyPhone: "8438123655",
    medicalNotes: "Asthma, rescue inhaler (albuterol) packed",
    photoConsent: true,
    priceAmount: 109,
    priceTier: "Camp registration",
    promoApplied: "SIBLING20,MILITARY20",
    paymentStatus: "Paid",
    utm: { utm_source: "adwords", utm_medium: "ppc" },
  },
  {
    transactionId: "81588757948",
    registeredAt: "2026-04-29T16:45:12.428Z",
    source: "backfill-ghl-notes",
    camp: "summer-s1-jun08",
    campName: "Session 1 — Morning",
    campDates: "June 8 – 12, 2026",
    parentEmail: "suzannehypnosis@gmail.com",
    parentFirst: "Suzanne",
    parentLast: "Bratton",
    parentPhone: "3343329266",
    childFirst: "Rowan",
    childLast: "Goodloe",
    childDob: "2016-09-02",
    childGrade: "4",
    shirtSize: "YM",
    emergencyName: "Suzanne Bratton",
    emergencyPhone: "3343329266",
    medicalNotes: "n/a",
    photoConsent: false,
    priceAmount: 129,
    priceTier: "Camp registration",
    promoApplied: "MILITARY20",
    paymentStatus: "Paid",
  },
  {
    transactionId: "81587629654",
    registeredAt: "2026-04-28T20:01:48.312Z",
    source: "backfill-ghl-notes",
    camp: "summer-s1-jun08",
    campName: "Session 1 — Morning",
    campDates: "June 8 – 12, 2026",
    parentEmail: "rebekahsteen@gmail.com",
    parentFirst: "Rebekah",
    parentLast: "Steen",
    childFirst: "Levi",
    childLast: "Steen",
    childDob: "2015-10-08",
    childGrade: "5",
    shirtSize: "AS",
    emergencyName: "Grant Steen",
    emergencyPhone: "3193214226",
    photoConsent: true,
    priceAmount: 149,
    priceTier: "Camp registration",
    paymentStatus: "Paid",
  },
  {
    transactionId: "81577868576",
    registeredAt: "2026-04-22T03:54:05.982Z",
    source: "backfill-ghl-notes",
    camp: "summer-s4-jul13",
    campName: "Summer Camp — Session 4",
    campDates: "July 13 – 17, 2026",
    parentEmail: "h.coss11@gmail.com",
    parentFirst: "Holland",
    parentLast: "Coss",
    parentPhone: "8509438181",
    childFirst: "Davi",
    childLast: "Heriquez",
    childDob: "2012-05-21",
    childGrade: "9",
    shirtSize: "AM",
    emergencyName: "Holland Coss",
    emergencyPhone: "8509438181",
    medicalNotes: "None",
    photoConsent: true,
    priceAmount: 149,
    priceTier: "Late registration",
    paymentStatus: "Paid",
  },
];

async function main() {
  const saved = [];
  for (const input of baseRecords) {
    let record = buildCampRosterRecord(input);
    if (input.transactionId === "81599957095") {
      record = applyCampRosterMove(record, {
        campId: "summer-s1-jun08",
        campName: "Session 1 — Morning",
        campDates: "June 8 – 12, 2026",
        reason: "Parent requested sibling same session",
        changedAt: "2026-05-06T23:15:17.651Z",
        changedBy: "FCP staff",
      });
    }
    if (input.transactionId === "81588757948") {
      record = applyCampRosterMove(record, {
        campId: "summer-prep-2026",
        campName: "Summer Prep Week — Morning",
        campDates: "June 15 – 18, 2026",
        reason: "Parent/staff requested switch from Session 1 Morning",
        changedAt: "2026-04-29T22:13:51.774Z",
        changedBy: "FCP staff",
      });
    }
    if (process.env.BACKFILL_VIA_NETLIFY_CLI === "1") {
      const result = spawnSync("npx", [
        "netlify",
        "blobs:set",
        STORE_NAME,
        registrationKey(record),
        JSON.stringify(record),
      ], { stdio: "inherit" });
      if (result.status !== 0) process.exit(result.status || 1);
      saved.push(record);
    } else {
      saved.push(await saveCampRosterRecord(record));
    }
  }

  const records = process.env.BACKFILL_VIA_NETLIFY_CLI === "1" ? saved : await listCampRosterRecords();
  const summary = summarizeCampRosterRecords(records, { now: new Date("2026-05-06T23:30:00Z") });
  console.log(JSON.stringify({
    saved: saved.map((r) => ({
      id: r.id,
      camper: r.camper.name,
      camp: r.camp.name,
      dates: r.camp.dates,
      moves: r.moveHistory.length,
    })),
    totalRecords: records.length,
    summary,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
