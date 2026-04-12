/**
 * camp-survey-day2.js
 * Scheduled function — runs every hour.
 * Finds contacts tagged camp-survey-lead (but NOT camp-survey-day2-sent)
 * who signed up 24+ hours ago, sends Email 2, tags them done.
 *
 * Env vars required:
 *   GHL_API_KEY          - GoHighLevel Private Integration token
 *   GHL_LOCATION_ID      - GHL sub-account location ID
 *   FCPSPORTS_SMTP_PASS  - info@fcpsports.org Office 365 password
 */

const nodemailer = require("nodemailer");

const GHL_BASE = "https://services.leadconnectorhq.com";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
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

exports.handler = async function () {
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID || !process.env.FCPSPORTS_SMTP_PASS) {
    console.error("[day2] Missing env vars");
    return { statusCode: 500 };
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

  // Search GHL for contacts with camp-survey-lead tag
  const searchRes = await fetch(
    `${GHL_BASE}/contacts/?locationId=${process.env.GHL_LOCATION_ID}&tags=camp-survey-lead&limit=100`,
    { headers: ghlHeaders() }
  ).catch((e) => { console.error("[day2] Search failed:", e.message); return null; });

  if (!searchRes || !searchRes.ok) {
    console.error("[day2] GHL search error");
    return { statusCode: 200 };
  }

  const data = await searchRes.json();
  const contacts = data.contacts || [];
  console.log(`[day2] Found ${contacts.length} camp-survey-lead contacts`);

  const transporter = createSmtpTransport();
  let sent = 0;

  for (const contact of contacts) {
    const tags = contact.tags || [];

    // Skip if already sent day 2 email
    if (tags.includes("camp-survey-day2-sent")) continue;

    // Skip if signed up less than 24 hours ago
    const createdAt = new Date(contact.dateAdded || contact.createdAt).getTime();
    if (createdAt > cutoff) continue;

    // Skip if no email
    const email = contact.email;
    if (!email) continue;

    const firstName = contact.firstName || "there";
    const part2Link = `https://fcpsports.org/camp-survey/details/?email=${encodeURIComponent(email.trim().toLowerCase())}`;

    // Send Email 2
    try {
      await transporter.sendMail({
        from: '"FCP Sports" <info@fcpsports.org>',
        to: email,
        subject: "Quick question before we send your pricing",
        html: `<p>Hey ${firstName},</p>
<p>One quick question before we send your pricing — helps us point you to the right program.</p>
<p>Takes about 60 seconds:<br>
👉 <a href="${part2Link}">Click here to answer 3 quick questions</a></p>
<p>Talk soon,<br>FCP Sports<br>Fort Walton Beach, FL</p>`,
      });
      console.log(`[day2] Email 2 sent to ${email}`);
      sent++;

      // Tag contact so we don't send again
      await fetch(`${GHL_BASE}/contacts/${contact.id}/tags`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ tags: ["camp-survey-day2-sent"] }),
      }).catch((e) => console.warn("[day2] Tag failed:", e.message));

    } catch (e) {
      console.error(`[day2] Email 2 failed for ${email}:`, e.message);
    }
  }

  console.log(`[day2] Done — sent ${sent} day-2 emails`);
  return { statusCode: 200 };
};

// Netlify scheduled function — runs every hour
module.exports.config = {
  schedule: "0 * * * *",
};
