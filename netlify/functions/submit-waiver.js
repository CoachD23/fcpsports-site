/**
 * submit-waiver.js
 * Stores signed participant waiver in Airtable Documents_Signed table.
 * Supports both adult (18+) and minor (parent/guardian signing) flows.
 * Optionally emails a copy of the signed waiver to the signer.
 *
 * POST body (minor):  { isMinor: true, parentEmail, parentPhone, minorName, minorDOB, signatureData, emailCopy }
 * POST body (adult):  { isMinor: false, adultName, adultDOB, adultEmail, signatureData, emailCopy }
 *
 * Env vars required:
 *   AIRTABLE_PAT           - Airtable Personal Access Token
 *   AIRTABLE_BASE_ID       - FCP Command Center base ID (appkMMHb5vEXfFvVe)
 *   FCPSPORTS_SMTP_PASS    - Office 365 SMTP password for info@fcpsports.org
 */

const nodemailer = require("nodemailer");

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

function createSmtpTransport() {
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: "info@fcpsports.org",
      pass: process.env.FCPSPORTS_SMTP_PASS,
    },
    tls: { ciphers: "SSLv3" },
  });
}

function buildWaiverEmailHtml(participantName, signedDate, isMinor, signerInfo) {
  const dateStr = new Date(signedDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const signerLine = isMinor
    ? `<p><strong>Parent/Guardian:</strong> ${signerInfo.parentName}</p><p><strong>Email:</strong> ${signerInfo.parentEmail}</p><p><strong>Phone:</strong> ${signerInfo.parentPhone}</p>`
    : `<p><strong>Email:</strong> ${signerInfo.adultEmail}</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center;">
        <h1 style="color: #f5a623; margin: 0; font-size: 22px;">FCP SPORTS</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="color: #1a1a2e; margin-top: 0;">Signed Waiver Confirmation</h2>
        <p>This confirms that the following waiver was signed on <strong>${dateStr}</strong>.</p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin-top: 0;"><strong>Participant:</strong> ${participantName}</p>
          ${signerLine}
          <p><strong>Date Signed:</strong> ${dateStr}</p>
        </div>
        <h3 style="color: #1a1a2e;">Waiver, Release & Assumption of Risk</h3>
        <div style="font-size: 12px; color: #555; line-height: 1.6;">
          <p><strong>ASSUMPTION OF RISK:</strong> I acknowledge that participation in basketball training, camps, leagues, open gym sessions, and related activities at FCP Sports involves inherent risks of physical injury including sprains, fractures, concussions, ligament tears, muscle strains, heat-related illness, and in rare cases, catastrophic injury or death. I voluntarily assume all such risks.</p>
          <p><strong>RELEASE OF LIABILITY:</strong> I hereby release, waive, discharge, and agree not to sue FCP Sports, its owners, officers, coaches, employees, volunteers, and agents from any and all claims arising out of participation in Activities, whether caused by negligence or otherwise.</p>
          <p><strong>MEDICAL AUTHORIZATION:</strong> In the event of an emergency, I authorize FCP Sports to secure medical treatment including transportation to a medical facility. I am financially responsible for any medical expenses incurred.</p>
          <p><strong>MEDIA RELEASE:</strong> I grant FCP Sports permission to use photographs, video recordings, and likenesses taken during Activities for promotional, educational, and marketing purposes without compensation.</p>
          <p><strong>RULES & CONDUCT:</strong> I agree to abide by all rules and instructions of FCP Sports coaching staff. FCP Sports reserves the right to dismiss any participant whose conduct is deemed unsafe or disruptive, without refund.</p>
          <p><strong>GOVERNING LAW:</strong> This waiver shall be governed by the laws of the State of Florida. Disputes shall be resolved in the courts of Okaloosa County, Florida.</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999;">FCP Sports &bull; Fort Walton Beach, FL &bull; 850.961.2323 &bull; info@fcpsports.org</p>
      </div>
    </div>`;
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
    const { isMinor, signatureData, emailCopy } = body;

    if (!signatureData || !signatureData.startsWith("data:image/png")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature required" }) };
    }

    const now = new Date().toISOString();
    let participantName, recipientEmail, record;

    if (isMinor) {
      const { parentName, parentEmail, parentPhone, minorName, minorDOB } = body;

      if (!parentName || parentName.trim().length < 2) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Parent/guardian name required" }) };
      }
      if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid parent email required" }) };
      }
      if (!parentPhone || parentPhone.replace(/\D/g, "").length < 10) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid phone number required" }) };
      }
      if (!minorName || minorName.trim().length < 2) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Participant name required" }) };
      }
      if (!minorDOB) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Date of birth required" }) };
      }

      participantName = minorName.trim();
      recipientEmail = parentEmail.trim().toLowerCase();

      const signerName = parentName.trim();

      record = {
        fields: {
          [FIELDS.Doc_Name]:       `Waiver - ${participantName} (signed by ${signerName})`,
          [FIELDS.Doc_Type]:       "Liability Waiver",
          [FIELDS.Signed_Date]:    now,
          [FIELDS.IP_Address]:     clientIp,
          [FIELDS.Signature_Data]: signatureData,
          [FIELDS.Parent_Email]:   recipientEmail,
          [FIELDS.Parent_Phone]:   parentPhone.trim(),
          [FIELDS.Minor_Name]:     participantName,
          [FIELDS.Minor_DOB]:      minorDOB,
        },
      };
    } else {
      const { adultName, adultDOB, adultEmail } = body;

      if (!adultName || adultName.trim().length < 2) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Full name required" }) };
      }
      if (!adultDOB) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Date of birth required" }) };
      }
      if (!adultEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adultEmail)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required" }) };
      }

      participantName = adultName.trim();
      recipientEmail = adultEmail.trim().toLowerCase();

      record = {
        fields: {
          [FIELDS.Doc_Name]:       `Waiver - ${participantName}`,
          [FIELDS.Doc_Type]:       "Liability Waiver",
          [FIELDS.Signed_Date]:    now,
          [FIELDS.IP_Address]:     clientIp,
          [FIELDS.Signature_Data]: signatureData,
          [FIELDS.Parent_Email]:   recipientEmail,
          [FIELDS.Minor_Name]:     participantName,
          [FIELDS.Minor_DOB]:      adultDOB,
        },
      };
    }

    // Save to Airtable
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

    console.log(`[submit-waiver] Waiver saved: ${participantName} | email: ${recipientEmail}`);

    // Send email copy if requested
    if (emailCopy && process.env.FCPSPORTS_SMTP_PASS) {
      try {
        const signerInfo = isMinor
          ? { parentName: body.parentName.trim(), parentEmail: recipientEmail, parentPhone: body.parentPhone }
          : { adultEmail: recipientEmail };

        const transport = createSmtpTransport();
        await transport.sendMail({
          from: '"FCP Sports" <info@fcpsports.org>',
          to: recipientEmail,
          subject: `Signed Waiver Confirmation — ${participantName}`,
          html: buildWaiverEmailHtml(participantName, now, isMinor, signerInfo),
        });
        console.log(`[submit-waiver] Email copy sent to ${recipientEmail}`);
      } catch (emailErr) {
        console.error("[submit-waiver] Email send failed:", emailErr.message);
        // Don't fail the request — waiver is already saved
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[submit-waiver] Error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
