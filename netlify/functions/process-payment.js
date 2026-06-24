/**
 * process-payment.js
 * Authorize.net Accept.js payment processor for FCP Sports.
 * Tokenizes card client-side, this function charges via Authorize.net API,
 * then upserts the contact into GHL with a "paid" tag.
 *
 * Env vars:
 *   AUTHNET_API_LOGIN         Authorize.net API Login ID
 *   AUTHNET_TRANSACTION_KEY   Authorize.net Transaction Key
 *   GHL_API_KEY               GoHighLevel API key
 *   GHL_LOCATION_ID           GoHighLevel location ID
 *   FCPSPORTS_SMTP_PASS       Office365 SMTP password for confirmation emails
 *   PAYMENT_ALERT_TO          Optional comma-separated alert recipients
 *   SKILLS_TRAINING_SCHEDULE_URL, PRIVATE_LESSON_SCHEDULE_URL, HOMESCHOOL_PE_SCHEDULE_URL
 */

const https = require("https");
const {
  createSchedulingFollowUpTask,
  getProgramNextStep,
  recordPaymentIssue,
  sendGenericConfirmationEmail,
  sendPaymentAlert,
} = require("./lib/checkout-reliability");
const {
  connectProgramRosterLedger,
  saveProgramRosterRecord,
} = require("./lib/program-roster-ledger");

const GHL_BASE = "https://services.leadconnectorhq.com";

function fullName(first, last) {
  return [first, last].filter(Boolean).join(" ").trim();
}

async function upsertPaidContact({ body, amount, transactionId }) {
  const ghlKey = process.env.GHL_API_KEY;
  const ghlLoc = process.env.GHL_LOCATION_ID;
  if (!ghlKey || !ghlLoc) return { ok: false, skipped: true };

  const ghlBody = {
    firstName: body.parentFirst || "",
    lastName: body.parentLast || "",
    email: body.email,
    phone: body.phone || "",
    locationId: ghlLoc,
    tags: ["fcpsports", "paid", body.program || "general-paid"],
    customFields: [
      { key: "athlete_name", field_value: body.athleteName || "" },
      { key: "program", field_value: body.programLabel || body.program || "" },
      { key: "payment_amount", field_value: "$" + Number(amount).toFixed(2) },
      { key: "transaction_id", field_value: transactionId },
    ],
  };

  const res = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + ghlKey,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify(ghlBody),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new Error(`GHL upsert failed: ${res.status} ${text.slice(0, 240)}`);
  return { ok: true, contactId: data?.contact?.id || data?.id || "", data };
}

exports.handler = async function (event) {
  const allowedOrigins = ["https://fcpsports.org", "https://www.fcpsports.org"];
  const origin = (event.headers || {}).origin || "";
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  let body = {};
  const requestId = event.headers?.["x-nf-request-id"] || event.headers?.["x-request-id"] || "";
  const issueContext = (extra) => Object.assign({
    flow: "generic-checkout",
    programId: body.program || "",
    programName: body.programLabel || body.program || "",
    email: body.email || "",
    parentName: fullName(body.parentFirst, body.parentLast),
    athleteName: body.athleteName || "",
    amount: body.amount || "",
    requestId,
  }, extra || {});

  async function recordIssue(extra, immediate) {
    const issue = issueContext(extra);
    await recordPaymentIssue(issue);
    if (immediate) await sendPaymentAlert(issue);
  }

  try {
    body = JSON.parse(event.body || "{}");

    // ── Promo code validation endpoint ──
    if (body.action === "validate-promo") {
      const PROGRAM_PRICES_CHECK = {
        "skills-training": 149,
        "private-lesson": 50,
        "homeschool-pe": 99,
      };
      const PROMO_CODES_CHECK = {
        "MILITARY20": { flatDiscount: 20, label: "$20 Military/DoD Discount" },
      };
      const basePrice = PROGRAM_PRICES_CHECK[body.program] || 0;
      const code = (body.promo || "").toUpperCase();
      const promo = PROMO_CODES_CHECK[code];
      if (promo && basePrice) {
        const final = Math.max(basePrice - (promo.flatDiscount || 0), 0);
        return { statusCode: 200, headers, body: JSON.stringify({ valid: true, label: promo.label, finalPrice: final }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false }) };
    }

    const {
      dataDescriptor, dataValue, amount,
      program, programLabel,
      parentFirst, parentLast, email, phone,
      athleteName, age, grade, notes, zip, promo
    } = body;

    // ── Server-side program prices (source of truth) ──
    const PROGRAM_PRICES = {
      "skills-training": 149,
      "private-lesson": 50,
      "homeschool-pe": 99,
    };

    // ── Server-side promo codes (source of truth) — $20 Military/DoD, one only ──
    const PROMO_CODES = {
      "MILITARY20": 20,
    };

    // ── Validate ──
    if (!dataDescriptor || !dataValue) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Card token missing. Please try again." }) };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required." }) };
    }
    if (!parentFirst || !parentLast) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Parent first and last name are required." }) };
    }
    if (!program || !PROGRAM_PRICES[program]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid program selected." }) };
    }

    // ── Calculate price server-side (ignore client amount) — flat $20 discounts ──
    let numAmount = PROGRAM_PRICES[program];
    const promoCode = (promo || "").toUpperCase();
    if (promoCode && PROMO_CODES[promoCode]) {
      numAmount = Math.max(numAmount - PROMO_CODES[promoCode], 0);
    }
    numAmount = Math.round(numAmount * 100) / 100;

    if (numAmount < 1 || numAmount > 10000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid amount." }) };
    }

    // ── Authorize.net credentials ──
    const apiLoginId = process.env.AUTHNET_API_LOGIN;
    const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;

    if (!apiLoginId || !transactionKey) {
      console.error("Missing Authorize.net credentials");
      await recordIssue({
        severity: "error",
        eventType: "system_error",
        statusCode: 500,
        error: "Missing Authorize.net credentials",
      }, true);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment system error. Call 850-961-2323." }) };
    }

    // ── Build Authorize.net request ──
    const orderDesc = (programLabel + " - " + athleteName).substring(0, 255);

    const txnRequest = {
      createTransactionRequest: {
        merchantAuthentication: {
          name: apiLoginId,
          transactionKey: transactionKey,
        },
        transactionRequest: {
          transactionType: "authCaptureTransaction",
          amount: numAmount.toFixed(2),
          payment: {
            opaqueData: {
              dataDescriptor: dataDescriptor,
              dataValue: dataValue,
            },
          },
          order: { description: orderDesc },
          customer: { email: email },
          billTo: {
            firstName: parentFirst || undefined,
            lastName: parentLast || undefined,
            zip: zip || undefined,
          },
          transactionSettings: {
            setting: [{ settingName: "emailCustomer", settingValue: "true" }],
          },
        },
      },
    };

    // ── Call Authorize.net ──
    const authnetHostname = process.env.AUTHNET_ENV === "sandbox"
      ? "apitest.authorize.net"
      : "api.authorize.net";
    let authResponse;
    try {
      authResponse = await new Promise((resolve, reject) => {
        const reqBody = JSON.stringify(txnRequest);
        const req = https.request(
          {
            hostname: authnetHostname,
            path: "/xml/v1/request.api",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(reqBody),
            },
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(data));
          }
        );
        req.on("error", reject);
        req.write(reqBody);
        req.end();
      });
    } catch (authErr) {
      console.error("Authorize.net network error:", authErr.message);
      await recordIssue({
        severity: "error",
        eventType: "processor_error",
        statusCode: 502,
        amount: numAmount.toFixed(2),
        error: authErr.message,
      }, true);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Payment processor unavailable. Please try again or call 850-961-2323." }) };
    }

    // Parse response (may have BOM)
    const cleanJson = authResponse.replace(/^\uFEFF/, "");
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error("Authorize.net parse error:", parseErr.message);
      await recordIssue({
        severity: "error",
        eventType: "processor_error",
        statusCode: 502,
        amount: numAmount.toFixed(2),
        error: "Authorize.net returned an unreadable response: " + parseErr.message,
      }, true);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Payment processor returned an unreadable response. Please call 850-961-2323." }) };
    }
    const txnResult = parsed.transactionResponse || {};
    const messages = parsed.messages || {};

    if (messages.resultCode !== "Ok" || (txnResult.responseCode && txnResult.responseCode !== "1")) {
      const errMsg =
        (txnResult.errors && txnResult.errors[0] && txnResult.errors[0].errorText) ||
        (messages.message && messages.message[0] && messages.message[0].text) ||
        "Payment declined.";

      // Duplicate transaction
      if (errMsg.includes("duplicate")) {
        await recordIssue({
          severity: "warning",
          eventType: "payment_failed",
          statusCode: 400,
          amount: numAmount.toFixed(2),
          error: errMsg,
        }, false);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "This looks like a duplicate charge. If you already paid, check your email for confirmation. Otherwise wait 2 minutes and try again.",
          }),
        };
      }

      console.error("Authorize.net error:", errMsg);
      await recordIssue({
        severity: "warning",
        eventType: "payment_failed",
        statusCode: 400,
        amount: numAmount.toFixed(2),
        error: errMsg,
      }, false);
      return { statusCode: 400, headers, body: JSON.stringify({ error: errMsg }) };
    }

    const transactionId = txnResult.transId || "";
    console.log("Payment success:", transactionId, numAmount, program);

    // ── Money-truth program ledger (independent of GHL; alerts on failure) ──
    try {
      connectProgramRosterLedger(event);
      await saveProgramRosterRecord({
        program,
        programLabel: programLabel || program,
        parentFirst,
        parentLast,
        email,
        phone,
        athleteName,
        amount: numAmount,
        transactionId,
        source: "checkout",
      });
      console.log("[process-payment] Program ledger written:", transactionId);
    } catch (ledgerErr) {
      console.error("[process-payment] Program ledger write FAILED:", ledgerErr.message);
      await recordIssue({
        severity: "error",
        eventType: "program_ledger_write_failed",
        statusCode: 200,
        amount: numAmount.toFixed(2),
        transactionId,
        error: ledgerErr.message,
      }, true);
    }

    const nextStep = getProgramNextStep(program);
    let contactId = "";

    // ── Upsert to GHL ──
    try {
      const upsert = await upsertPaidContact({ body, amount: numAmount, transactionId });
      contactId = upsert.contactId || "";
      if (upsert.skipped) {
        throw new Error("GHL credentials missing for paid checkout follow-up");
      }
    } catch (followErr) {
      console.error("GHL upsert failed (non-blocking):", followErr.message);
      await recordIssue({
        severity: "error",
        eventType: "paid_followup_failed",
        statusCode: 200,
        amount: numAmount.toFixed(2),
        transactionId,
        error: followErr.message,
      }, true);
    }

    try {
      const emailResult = await sendGenericConfirmationEmail({
        email,
        parentFirst,
        programId: program,
        programName: programLabel || program,
        athleteName,
        amount: numAmount,
        transactionId,
        nextStep,
      });
      if (emailResult.skipped) {
        throw new Error("Confirmation email skipped because FCPSPORTS_SMTP_PASS is missing");
      }
    } catch (emailErr) {
      console.error("Confirmation email failed (non-blocking):", emailErr.message);
      await recordIssue({
        severity: "error",
        eventType: "paid_followup_failed",
        statusCode: 200,
        amount: numAmount.toFixed(2),
        transactionId,
        contactId,
        error: emailErr.message,
      }, true);
    }

    try {
      if (contactId) {
        await createSchedulingFollowUpTask({
          contactId,
          programId: program,
          programName: programLabel || program,
          athleteName,
          parentName: fullName(parentFirst, parentLast),
          email,
          phone,
          amount: numAmount.toFixed(2),
          transactionId,
        });
      }
    } catch (taskErr) {
      console.error("GHL scheduling task failed (non-blocking):", taskErr.message);
      await recordIssue({
        severity: "error",
        eventType: "paid_followup_failed",
        statusCode: 200,
        amount: numAmount.toFixed(2),
        transactionId,
        contactId,
        error: taskErr.message,
      }, true);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transactionId: transactionId,
        amount: numAmount.toFixed(2),
        programId: program,
        nextStepUrl: nextStep.nextStepUrl,
        nextStepLabel: nextStep.nextStepLabel,
      }),
    };
  } catch (err) {
    console.error("process-payment error:", err);
    await recordIssue({
      severity: "error",
      eventType: "function_error",
      statusCode: 500,
      error: err.message,
    }, true);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error. Please try again or call 850-961-2323." }),
    };
  }
};
