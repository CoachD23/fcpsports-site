/**
 * submit-rental.js
 * Stores signed gym rental agreements in Airtable Documents_Signed table.
 * Optionally emails a copy to the renter.
 *
 * Env vars required:
 *   AIRTABLE_PAT           - Airtable Personal Access Token
 *   AIRTABLE_BASE_ID       - FCP Command Center base ID
 *   FCPSPORTS_SMTP_PASS    - Office 365 SMTP password for info@fcpsports.org
 */

const nodemailer = require("nodemailer");

const AIRTABLE_BASE = "https://api.airtable.com/v0";
const TABLE_ID = "tblnbYMOUjAtfb7HV"; // Documents_Signed

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
const RATE_LIMIT_MAX = 3;

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
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildRentalEmailHtml(data) {
  const courtLabel = data.courtOption === "full" ? "Full Court ($125/hr)" : "Half Court ($75/hr)";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #1a1a2e; padding: 24px; text-align: center;">
        <h1 style="color: #f5a623; margin: 0; font-size: 22px;">FCP SPORTS</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="color: #1a1a2e; margin-top: 0;">Gym Rental Agreement Confirmation</h2>
        <p>This confirms your gym rental agreement has been submitted and is pending review.</p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin-top: 0;"><strong>Renter:</strong> ${escHtml(data.renterName)}</p>
          ${data.organization ? `<p><strong>Organization:</strong> ${escHtml(data.organization)}</p>` : ""}
          <p><strong>Email:</strong> ${escHtml(data.renterEmail)}</p>
          <p><strong>Phone:</strong> ${escHtml(data.renterPhone)}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 12px 0;" />
          <p><strong>Event:</strong> ${escHtml(data.eventDescription)}</p>
          <p><strong>Date(s):</strong> ${escHtml(data.rentalDates)}</p>
          <p><strong>Time(s):</strong> ${escHtml(data.rentalTimes)}</p>
          <p><strong>Court:</strong> ${escHtml(courtLabel)}</p>
          <p><strong>Hours:</strong> ${data.hours}</p>
          <p><strong>Total:</strong> $${data.totalAmount.toFixed(2)}</p>
          <p><strong>Security Deposit:</strong> $250 (may be waived)</p>
          ${data.notes ? `<p><strong>Notes:</strong> ${escHtml(data.notes)}</p>` : ""}
          <p><strong>Date Signed:</strong> ${escHtml(data.signDate)}</p>
        </div>

        <h3 style="color: #1a1a2e;">Reminders</h3>
        <ul style="font-size: 13px; color: #555; line-height: 1.8;">
          <li>Certificate of Insurance ($1M General Liability, FCP Sports LLC as additional insured) must be provided at least 14 days before the rental date.</li>
          <li>Full payment is due prior to the rental date.</li>
          <li>A $250 security deposit is required (may be waived by management).</li>
          <li>A responsible adult (21+) must be on-site at all times during the rental.</li>
        </ul>

        <p style="font-size: 13px; color: #555;">FCP Sports will review your request and confirm your reservation. If you have questions, contact us at info@fcpsports.org or 850.961.2323.</p>

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
    console.error("[submit-rental] Missing env vars");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfigured" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      renterName, organization, renterEmail, renterPhone,
      eventDescription, rentalDates, rentalTimes,
      courtOption, hours, totalAmount, notes,
      signDate, signatureData, emailCopy,
    } = body;

    // Validate
    if (!renterName || renterName.trim().length < 2) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Renter name required" }) };
    }
    if (!renterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(renterEmail)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid email required" }) };
    }
    if (!renterPhone || renterPhone.replace(/\D/g, "").length < 10) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid phone required" }) };
    }
    if (!eventDescription) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Event description required" }) };
    }
    if (!rentalDates || !rentalTimes) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Rental dates and times required" }) };
    }
    if (!courtOption || !["full", "half"].includes(courtOption)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid court option required" }) };
    }
    if (!hours || hours < 1 || hours > 24) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Valid number of hours required" }) };
    }
    if (!signatureData || !signatureData.startsWith("data:image/png")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature required" }) };
    }
    if (signatureData.length > 500000) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature data too large" }) };
    }

    const courtLabel = courtOption === "full" ? "Full Court" : "Half Court";
    const docName = `Rental Agreement - ${renterName.trim()} - ${courtLabel} - ${rentalDates}`;

    // Build notes for Airtable
    const noteLines = [
      `Event: ${eventDescription}`,
      `Court: ${courtLabel}`,
      `Dates: ${rentalDates}`,
      `Times: ${rentalTimes}`,
      `Hours: ${hours}`,
      `Total: $${totalAmount}`,
      organization ? `Organization: ${organization}` : "",
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const record = {
      fields: {
        [FIELDS.Doc_Name]:       docName,
        [FIELDS.Doc_Type]:       "Rental Agreement",
        [FIELDS.Signed_Date]:    signDate || new Date().toISOString(),
        [FIELDS.IP_Address]:     clientIp,
        [FIELDS.Signature_Data]: signatureData,
        [FIELDS.Parent_Email]:   renterEmail.trim().toLowerCase(),
        [FIELDS.Parent_Phone]:   renterPhone.trim(),
        [FIELDS.Minor_Name]:     renterName.trim(),
        [FIELDS.Minor_DOB]:      noteLines,
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
      console.error("[submit-rental] Airtable error:", text);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save agreement" }) };
    }

    console.log(`[submit-rental] Saved: ${renterName.trim()} | ${courtLabel} | ${rentalDates}`);

    // Send email copy
    if (emailCopy && process.env.FCPSPORTS_SMTP_PASS) {
      try {
        const transport = createSmtpTransport();
        await transport.sendMail({
          from: '"FCP Sports" <info@fcpsports.org>',
          to: renterEmail.trim().toLowerCase(),
          subject: `Gym Rental Agreement — ${renterName.trim()}`,
          html: buildRentalEmailHtml({
            renterName: renterName.trim(),
            organization: organization?.trim(),
            renterEmail: renterEmail.trim(),
            renterPhone: renterPhone.trim(),
            eventDescription,
            rentalDates,
            rentalTimes,
            courtOption,
            hours,
            totalAmount,
            notes: notes?.trim(),
            signDate,
          }),
        });

        // Also notify FCP Sports
        await transport.sendMail({
          from: '"FCP Sports" <info@fcpsports.org>',
          to: "info@fcpsports.org",
          subject: `New Gym Rental Agreement — ${renterName.trim()} — ${rentalDates}`,
          html: buildRentalEmailHtml({
            renterName: renterName.trim(),
            organization: organization?.trim(),
            renterEmail: renterEmail.trim(),
            renterPhone: renterPhone.trim(),
            eventDescription,
            rentalDates,
            rentalTimes,
            courtOption,
            hours,
            totalAmount,
            notes: notes?.trim(),
            signDate,
          }),
        });

        console.log(`[submit-rental] Email sent to ${renterEmail} + info@fcpsports.org`);
      } catch (emailErr) {
        console.error("[submit-rental] Email failed:", emailErr.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[submit-rental] Error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
