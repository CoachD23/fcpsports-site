const {
  hasAlertBeenSent,
  listRecentPaymentIssues,
  markAlertSent,
  sendPaymentAlert,
} = require("./lib/checkout-reliability");

function json(body) {
  return JSON.stringify(body);
}

exports.handler = async function () {
  const headers = { "Content-Type": "application/json" };
  const windowMinutes = Number(process.env.PAYMENT_ALERT_WINDOW_MINUTES || 15);
  const threshold = Number(process.env.PAYMENT_ALERT_THRESHOLD || 3);
  const issues = await listRecentPaymentIssues(windowMinutes);

  const paymentFailures = issues.filter((issue) => issue.eventType === "payment_failed");
  const systemErrors = issues.filter((issue) => {
    if (!["system_error", "processor_error", "function_error", "paid_followup_failed"].includes(issue.eventType)) {
      return false;
    }
    return !(issue.eventType === "paid_followup_failed" && /Airtable write failed/i.test(issue.error || ""));
  });

  const bucket = new Date().toISOString().slice(0, 15).replace(/[-:T]/g, "");
  const alerts = [];

  if (paymentFailures.length >= threshold) {
    const key = `payment-failure-spike-${bucket}`;
    if (!(await hasAlertBeenSent(key))) {
      await sendPaymentAlert({
        severity: "warning",
        eventType: "payment_failure_spike",
        flow: "monitor",
        programName: "Multiple checkout flows",
        error: `${paymentFailures.length} payment failures in the last ${windowMinutes} minutes. Threshold is ${threshold}.\n\n` +
          paymentFailures.map((i) => `${i.timestamp} ${i.flow} ${i.programId || ""} ${i.email || ""}: ${i.error || ""}`).join("\n"),
      });
      await markAlertSent(key, { count: paymentFailures.length, windowMinutes });
      alerts.push(key);
    }
  }

  if (systemErrors.length > 0) {
    const key = `system-error-${bucket}`;
    if (!(await hasAlertBeenSent(key))) {
      await sendPaymentAlert({
        severity: "error",
        eventType: "system_error_detected",
        flow: "monitor",
        programName: "Checkout reliability",
        error: `${systemErrors.length} system/follow-up issue(s) in the last ${windowMinutes} minutes.\n\n` +
          systemErrors.map((i) => `${i.timestamp} ${i.eventType} ${i.flow} ${i.programId || ""} ${i.email || ""}: ${i.error || ""}`).join("\n"),
      });
      await markAlertSent(key, { count: systemErrors.length, windowMinutes });
      alerts.push(key);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: json({
      ok: true,
      checked: issues.length,
      paymentFailures: paymentFailures.length,
      systemErrors: systemErrors.length,
      alerts,
    }),
  };
};
