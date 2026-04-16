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
 */

const https = require("https");

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

  try {
    const body = JSON.parse(event.body || "{}");

    // ── Promo code validation endpoint ──
    if (body.action === "validate-promo") {
      const PROGRAM_PRICES_CHECK = {
        "summer-day-camp": 149, "skills-training": 199, "private-lesson": 75,
        "youth-league": 125, "open-gym": 10, "girls-camp": 149,
      };
      const PROMO_CODES_CHECK = {
        "EARLYBIRD": { discount: 0.10, label: "10% Early Bird Discount" },
        "MILITARY": { discount: 0.15, label: "15% Military Discount" },
        "SIBLING": { discount: 0.10, label: "10% Sibling Discount" },
        "FCPFAMILY": { discount: 0.10, label: "10% FCP Family Discount" },
      };
      const basePrice = PROGRAM_PRICES_CHECK[body.program] || 0;
      const code = (body.promo || "").toUpperCase();
      const promo = PROMO_CODES_CHECK[code];
      if (promo && basePrice) {
        const final = Math.round(basePrice * (1 - promo.discount) * 100) / 100;
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
      "summer-day-camp": 149,
      "skills-training": 199,
      "private-lesson": 75,
      "youth-league": 125,
      "open-gym": 10,
      "girls-camp": 149,
    };

    // ── Server-side promo codes (source of truth) ──
    const PROMO_CODES = {
      "EARLYBIRD": 0.10,
      "MILITARY": 0.15,
      "SIBLING": 0.10,
      "FCPFAMILY": 0.10,
    };

    // ── Validate ──
    if (!dataDescriptor || !dataValue) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Card token missing. Please try again." }) };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required." }) };
    }
    if (!program || !PROGRAM_PRICES[program]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid program selected." }) };
    }

    // ── Calculate price server-side (ignore client amount) ──
    let numAmount = PROGRAM_PRICES[program];
    const promoCode = (promo || "").toUpperCase();
    if (promoCode && PROMO_CODES[promoCode]) {
      numAmount = numAmount * (1 - PROMO_CODES[promoCode]);
    }
    numAmount = Math.round(numAmount * 100) / 100; // avoid floating point

    if (numAmount < 1 || numAmount > 10000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid amount." }) };
    }

    // ── Authorize.net credentials ──
    const apiLoginId = process.env.AUTHNET_API_LOGIN;
    const transactionKey = process.env.AUTHNET_TRANSACTION_KEY;

    if (!apiLoginId || !transactionKey) {
      console.error("Missing Authorize.net credentials");
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
    const authResponse = await new Promise((resolve, reject) => {
      const reqBody = JSON.stringify(txnRequest);
      const req = https.request(
        {
          hostname: "api.authorize.net",
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

    // Parse response (may have BOM)
    const cleanJson = authResponse.replace(/^\uFEFF/, "");
    const parsed = JSON.parse(cleanJson);
    const txnResult = parsed.transactionResponse || {};
    const messages = parsed.messages || {};

    if (messages.resultCode !== "Ok" || (txnResult.responseCode && txnResult.responseCode !== "1")) {
      const errMsg =
        (txnResult.errors && txnResult.errors[0] && txnResult.errors[0].errorText) ||
        (messages.message && messages.message[0] && messages.message[0].text) ||
        "Payment declined.";

      // Duplicate transaction
      if (errMsg.includes("duplicate")) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: "This looks like a duplicate charge. If you already paid, check your email for confirmation. Otherwise wait 2 minutes and try again.",
          }),
        };
      }

      console.error("Authorize.net error:", errMsg);
      return { statusCode: 400, headers, body: JSON.stringify({ error: errMsg }) };
    }

    const transactionId = txnResult.transId || "";
    console.log("Payment success:", transactionId, numAmount, program);

    // ── Upsert to GHL ──
    try {
      const ghlKey = process.env.GHL_API_KEY;
      const ghlLoc = process.env.GHL_LOCATION_ID;
      if (ghlKey && ghlLoc) {
        const ghlBody = JSON.stringify({
          firstName: parentFirst || "",
          lastName: parentLast || "",
          email: email,
          phone: phone || "",
          locationId: ghlLoc,
          tags: ["paid", program || "fcpsports"],
          customFields: [
            { key: "athlete_name", field_value: athleteName || "" },
            { key: "program", field_value: programLabel || program || "" },
            { key: "payment_amount", field_value: "$" + numAmount.toFixed(2) },
            { key: "transaction_id", field_value: transactionId },
          ],
        });

        await new Promise((resolve) => {
          const req = https.request(
            {
              hostname: "services.leadconnectorhq.com",
              path: "/contacts/upsert",
              method: "POST",
              headers: {
                Authorization: "Bearer " + ghlKey,
                "Content-Type": "application/json",
                Version: "2021-07-28",
                "Content-Length": Buffer.byteLength(ghlBody),
              },
            },
            (res) => {
              let d = "";
              res.on("data", (c) => (d += c));
              res.on("end", () => {
                console.log("GHL upsert:", res.statusCode);
                resolve(d);
              });
            }
          );
          req.on("error", (e) => {
            console.error("GHL error:", e.message);
            resolve("");
          });
          req.write(ghlBody);
          req.end();
        });
      }
    } catch (ghlErr) {
      console.error("GHL upsert failed (non-blocking):", ghlErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transactionId: transactionId,
        amount: numAmount.toFixed(2),
      }),
    };
  } catch (err) {
    console.error("process-payment error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server error. Please try again or call 850-961-2323." }),
    };
  }
};
