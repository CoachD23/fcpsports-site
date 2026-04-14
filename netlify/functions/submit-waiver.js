/**
 * submit-waiver.js
 * Stores signed participant waiver in Airtable Documents_Signed table.
 *
 * POST body: { parentEmail, parentPhone, minorName, minorDOB, signatureData }
 *
 * Env vars required:
 *   AIRTABLE_PAT           - Airtable Personal Access Token
 *   AIRTABLE_BASE_ID       - FCP Command Center base ID (appkMMHb5vEXfFvVe)
 */

const AIRTABLE_BASE = "https://api.airtable.com/v0";
const TABLE_ID = "tblnbYMOUjAtfb7HV"; // Documents_Signed

// Field IDs
const FIELDS = {
  Doc_Name:        "fldYZxC1DUgdQReDu",
  Doc_Type:        "fldZimEvFeYDHeMzr",
  Signed_Date:     "fldJAto0hA99BuZEy",
  IP_Address:      "fldtCAZsNvyk3D8P2",
  Signature_Data:  "fldtl9fuqg6m3aEgM",
  Parent_Email:    "fld21FiPlKQMcIPwD",
  Parent_Phone:    "fldFkPWcIQEUXXgWN",
  Minor_Name:      "fldjIx2VsznIUoP1z",
  Minor_DOB:       "fldjHXc59oFjEkqaC",
};

const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "https://fcpsports.org",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const clientIp = event.headers["x-forwarded-for"]?.split(",")[0].trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: "Too many requests" }) };
  }

  if (!process.env.AIRTABLE_PAT || !process.env.AIRTABLE_BASE_ID) {
    console.error("[submit-waiver] Missing AIRTABLE_PAT or AIRTABLE_BASE_ID");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { parentEmail, parentPhone, minorName, minorDOB, signatureData } = body;

    // Validate required fields
    if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid parent email required" }) };
    }
    if (!parentPhone || parentPhone.replace(/\D/g, "").length < 10) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid phone number required" }) };
    }
    if (!minorName || minorName.trim().length < 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Minor name required" }) };
    }
    if (!minorDOB) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Minor date of birth required" }) };
    }
    if (!signatureData || !signatureData.startsWith("data:image/png")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature required" }) };
    }

    const now = new Date().toISOString();

    const record = {
      fields: {
        [FIELDS.Doc_Name]:       `Waiver - ${minorName.trim()}`,
        [FIELDS.Doc_Type]:       "Liability Waiver",
        [FIELDS.Signed_Date]:    now,
        [FIELDS.IP_Address]:     clientIp,
        [FIELDS.Signature_Data]: signatureData,
        [FIELDS.Parent_Email]:   parentEmail.trim().toLowerCase(),
        [FIELDS.Parent_Phone]:   parentPhone.trim(),
        [FIELDS.Minor_Name]:     minorName.trim(),
        [FIELDS.Minor_DOB]:      minorDOB,
      },
    };

    const res = await fetch(`${AIRTABLE_BASE}/${process.env.AIRTABLE_BASE_ID}/${TABLE_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: [record], typecast: true }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[submit-waiver] Airtable error:", text);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save waiver" }) };
    }

    console.log(`[submit-waiver] Waiver saved: ${minorName.trim()} | parent: ${parentEmail}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[submit-waiver] Error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
