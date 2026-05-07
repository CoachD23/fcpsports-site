function clean(value) {
  return String(value || "").trim();
}

function transactionArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function isCampTransaction(transaction) {
  const invoice = clean(transaction.order?.invoiceNumber || transaction.invoiceNumber).toUpperCase();
  const description = clean(transaction.order?.description || transaction.description);
  return invoice.startsWith("CAMP-") || /^"?.+camp.+"?\s+—\s+.+/i.test(description);
}

function parseCampDescription(description) {
  const text = clean(description);
  const quoted = text.match(/^"([^"]+)"\s+—\s+(.+)$/);
  if (quoted) {
    return {
      campName: clean(quoted[1]),
      camperName: clean(quoted[2]),
    };
  }
  const match = text.match(/^(.+)\s+—\s+(.+)$/);
  if (!match) return { campName: text, camperName: "" };
  return {
    campName: clean(match[1]).replace(/^"|"$/g, ""),
    camperName: clean(match[2]),
  };
}

function transactionIdSet(records) {
  return new Set((records || [])
    .map((record) => clean(record.payment?.transactionId || record.transactionId))
    .filter(Boolean));
}

function findMissingCampTransactions(transactions, records) {
  const known = transactionIdSet(records);
  return (transactions || [])
    .filter(isCampTransaction)
    .filter((tx) => !known.has(clean(tx.transId || tx.transactionId)))
    .map((tx) => ({
      ...tx,
      transId: clean(tx.transId || tx.transactionId),
      parsed: parseCampDescription(tx.order?.description || tx.description),
    }));
}

function authnetUrl() {
  return process.env.AUTHNET_ENV === "sandbox"
    ? "https://apitest.authorize.net/xml/v1/request.api"
    : "https://api.authorize.net/xml/v1/request.api";
}

function merchantAuthentication() {
  return {
    name: process.env.AUTHNET_API_LOGIN,
    transactionKey: process.env.AUTHNET_TRANSACTION_KEY,
  };
}

async function authnetPost(payload) {
  const res = await fetch(authnetUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  const resultCode = data.messages?.resultCode;
  if (!res.ok || resultCode === "Error") {
    const message = data.messages?.message?.map((m) => m.text).join("; ") || `Authorize.net ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function normalizeTransaction(tx) {
  return {
    ...tx,
    transId: clean(tx.transId || tx.transactionId),
    order: {
      invoiceNumber: clean(tx.order?.invoiceNumber || tx.invoiceNumber),
      description: clean(tx.order?.description || tx.description),
    },
  };
}

async function fetchUnsettledTransactions() {
  const data = await authnetPost({
    getUnsettledTransactionListRequest: {
      merchantAuthentication: merchantAuthentication(),
    },
  });
  return transactionArray(data.transactions?.transaction || data.transactions)
    .map(normalizeTransaction);
}

async function fetchSettledTransactions(daysBack = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const batches = await authnetPost({
    getSettledBatchListRequest: {
      merchantAuthentication: merchantAuthentication(),
      includeStatistics: false,
      firstSettlementDate: start.toISOString(),
      lastSettlementDate: end.toISOString(),
    },
  });
  const batchList = transactionArray(batches.batchList?.batch || batches.batchList);
  const transactions = [];
  for (const batch of batchList) {
    const batchId = batch.batchId;
    if (!batchId) continue;
    const data = await authnetPost({
      getTransactionListRequest: {
        merchantAuthentication: merchantAuthentication(),
        batchId,
      },
    });
    transactions.push(...transactionArray(data.transactions?.transaction || data.transactions).map(normalizeTransaction));
  }
  return transactions;
}

async function fetchRecentCampTransactions(options = {}) {
  if (!process.env.AUTHNET_API_LOGIN || !process.env.AUTHNET_TRANSACTION_KEY) {
    return [];
  }
  const [unsettled, settled] = await Promise.all([
    fetchUnsettledTransactions().catch((err) => {
      console.warn("[camp-roster-reconciliation] Unsettled fetch failed:", err.message);
      return [];
    }),
    fetchSettledTransactions(options.daysBack || 7).catch((err) => {
      console.warn("[camp-roster-reconciliation] Settled fetch failed:", err.message);
      return [];
    }),
  ]);
  const byId = new Map();
  for (const tx of [...unsettled, ...settled]) {
    if (tx.transId && isCampTransaction(tx)) byId.set(tx.transId, tx);
  }
  return Array.from(byId.values());
}

module.exports = {
  fetchRecentCampTransactions,
  findMissingCampTransactions,
  isCampTransaction,
  parseCampDescription,
};
