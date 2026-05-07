const {
  hasAlertBeenSent,
  markAlertSent,
  recordPaymentIssue,
  sendPaymentAlert,
} = require("./lib/checkout-reliability");
const {
  connectCampRosterLedger,
  listCampRosterRecords,
} = require("./lib/camp-roster-ledger");
const {
  fetchRecentCampTransactions,
  findMissingCampTransactions,
} = require("./lib/camp-roster-reconciliation");

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  connectCampRosterLedger(event);
  if (!process.env.AUTHNET_API_LOGIN || !process.env.AUTHNET_TRANSACTION_KEY) {
    return json({ ok: true, skipped: true, reason: "Authorize.net not configured" });
  }

  const [records, transactions] = await Promise.all([
    listCampRosterRecords(),
    fetchRecentCampTransactions({ daysBack: Number(process.env.CAMP_ROSTER_RECONCILE_DAYS || 7) }),
  ]);
  const missing = findMissingCampTransactions(transactions, records);

  if (missing.length) {
    const ids = missing.map((tx) => tx.transId).sort();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const key = `camp-roster-missing-${date}-${ids.join("-")}`;
    if (!(await hasAlertBeenSent(key))) {
      const lines = missing.map((tx) => {
        const parsed = tx.parsed || {};
        const amount = tx.settleAmount || tx.authAmount || tx.amount || "";
        return `${tx.transId} ${parsed.campName || tx.order?.description || ""} ${parsed.camperName || ""}${amount ? ` $${amount}` : ""}`.trim();
      });
      const issue = {
        severity: "warning",
        eventType: "roster_reconciliation_missing",
        flow: "camp-registration",
        programName: "Camp roster ledger",
        statusCode: 200,
        error: `Authorize.net has ${missing.length} camp payment(s) missing from the roster ledger:\n${lines.join("\n")}`,
      };
      await recordPaymentIssue(issue);
      await sendPaymentAlert(issue);
      await markAlertSent(key, { ids });
    }
  }

  return json({
    ok: true,
    checkedTransactions: transactions.length,
    rosterRecords: records.length,
    missing: missing.map((tx) => ({
      transId: tx.transId,
      campName: tx.parsed?.campName || "",
      camperName: tx.parsed?.camperName || "",
      invoiceNumber: tx.order?.invoiceNumber || "",
    })),
  });
};
