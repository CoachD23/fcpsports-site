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

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  });
}

async function searchContactsByTag(tag, pageLimit = 100) {
  return fetch(`${GHL_BASE}/contacts/search`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      page: 1,
      pageLimit,
      filters: [{ field: "tags", operator: "contains", value: tag }],
    }),
  });
}

async function searchContactsByTags(tags, pageLimit = 100) {
  const filters = tags.map((tag) => ({ field: "tags", operator: "contains", value: tag }));
  return fetch(`${GHL_BASE}/contacts/search`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify({
      locationId: process.env.GHL_LOCATION_ID,
      page: 1,
      pageLimit,
      filters,
    }),
  });
}

async function sendDailyDigest(transporter) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const digestRes = await searchContactsByTag(`submitted-${yesterday}`).catch(() => null);

  const totalRes = await searchContactsByTag("fcpsports", 1).catch(() => null);

  if (!digestRes || !digestRes.ok) return;

  const digestData = await digestRes.json();
  const leads = digestData.contacts || [];
  const totalData = totalRes && totalRes.ok ? await totalRes.json() : {};
  const totalCount = totalData.meta?.total ?? totalData.total ?? "?";

  console.log(`[day2] Digest: ${leads.length} new, ${totalCount} total`);

  const digestRows = leads.map(c => {
    const timeStr = new Date(c.dateAdded || c.createdAt).toLocaleString("en-US", {
      timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const tags = (c.tags || []).filter(t => t !== "fcpsports" && t !== "website-inquiry").join(", ");
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.firstName || "")} ${escHtml(c.lastName || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.email || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.phone || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(tags)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${timeStr} CT</td>
    </tr>`;
  }).join("");

  const digestHtml = `<h2 style="font-family:sans-serif;color:#060f22;margin:0 0 8px">FCP Sports — Daily Lead Digest</h2>
<p style="font-family:sans-serif;font-size:15px;margin:0 0 20px">
  <strong>${leads.length}</strong> new lead${leads.length !== 1 ? "s" : ""} in the last 24 hours &nbsp;|&nbsp;
  <strong>${totalCount}</strong> total all-time
</p>
${leads.length > 0
    ? `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%">
  <thead>
    <tr style="background:#060f22;color:#fff">
      <th style="padding:8px 12px;text-align:left">Name</th>
      <th style="padding:8px 12px;text-align:left">Email</th>
      <th style="padding:8px 12px;text-align:left">Phone</th>
      <th style="padding:8px 12px;text-align:left">Source / Tags</th>
      <th style="padding:8px 12px;text-align:left">Time (CT)</th>
    </tr>
  </thead>
  <tbody>${digestRows}</tbody>
</table>`
    : `<p style="font-family:sans-serif;color:#888">No new leads in the last 24 hours.</p>`}
<p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px">FCP Sports automated digest · fcpsports.org</p>`;

  // Count survey completions from yesterday
  const surveyRes = await searchContactsByTags(["camp-survey-part2-complete", `submitted-${yesterday}`], 1).catch(() => null);
  const surveyData = surveyRes && surveyRes.ok ? await surveyRes.json() : {};
  const surveyCount = surveyData.meta?.total ?? surveyData.total ?? (surveyData.contacts || []).length;

  const surveyLine = surveyCount > 0
    ? `<p style="font-family:sans-serif;font-size:15px;margin:4px 0 20px"><strong>${surveyCount}</strong> camp survey${surveyCount !== 1 ? "s" : ""} completed yesterday</p>`
    : `<p style="font-family:sans-serif;font-size:13px;color:#888;margin:4px 0 20px">No camp surveys completed yesterday.</p>`;

  try {
    await transporter.sendMail({
      from: '"FCP Sports" <info@fcpsports.org>',
      to: "info@floridacoastalprep.com",
      subject: `FCP Sports: ${leads.length} new lead${leads.length !== 1 ? "s" : ""} yesterday | ${totalCount} total`,
      html: digestHtml.replace('</h2>', `</h2>${surveyLine}`),
    });
    console.log(`[day2] Daily digest sent: ${leads.length} new, ${totalCount} total, ${surveyCount} surveys`);
  } catch (e) {
    console.error("[day2] Digest failed:", e.message);
  }
}

exports.handler = async function () {
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID || !process.env.FCPSPORTS_SMTP_PASS) {
    console.error("[day2] Missing env vars");
    return { statusCode: 500 };
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

  // Search GHL for contacts with camp-survey-lead tag
  const searchRes = await searchContactsByTag("camp-survey-lead").catch((e) => { console.error("[day2] Search failed:", e.message); return null; });

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

  // ── PASS 2: Reminder for anyone who got Email 2 but never completed Part 2 ──
  // Condition: camp-survey-day2-sent + NO camp-survey-part2-complete + NO camp-survey-reminder-sent + 48h+ since signup

  const reminderCutoff = Date.now() - 48 * 60 * 60 * 1000;
  const remindRes = await searchContactsByTag("camp-survey-day2-sent").catch((e) => { console.error("[day2] Reminder search failed:", e.message); return null; });

  if (!remindRes || !remindRes.ok) {
    console.error("[day2] Reminder GHL search error");
    return { statusCode: 200 };
  }

  const remindData = await remindRes.json();
  const remindContacts = remindData.contacts || [];
  console.log(`[day2] Found ${remindContacts.length} day2-sent contacts for reminder check`);

  let remindSent = 0;

  for (const contact of remindContacts) {
    const tags = contact.tags || [];

    // Skip if already completed Part 2
    if (tags.includes("camp-survey-part2-complete")) continue;

    // Skip if reminder already sent
    if (tags.includes("camp-survey-reminder-sent")) continue;

    // Skip if less than 48 hours since signup
    const createdAt = new Date(contact.dateAdded || contact.createdAt).getTime();
    if (createdAt > reminderCutoff) continue;

    const email = contact.email;
    if (!email) continue;

    const firstName = contact.firstName || "there";
    const part2Link = `https://fcpsports.org/camp-survey/details/?email=${encodeURIComponent(email.trim().toLowerCase())}`;

    try {
      await transporter.sendMail({
        from: '"FCP Sports" <info@fcpsports.org>',
        to: email,
        subject: "Just a reminder — quick question for you",
        html: `<p>Hey ${firstName},</p>
<p>Just a reminder — we still need a little info from you before we can send your pricing.</p>
<p>This is important to us — it helps us design the best camps and training for your athlete.</p>
<p>Takes 60 seconds:<br>
👉 <a href="${part2Link}">Click here to answer 3 quick questions</a></p>
<p>Thank you again for your time — we really appreciate it.<br><br>
FCP Sports<br>Fort Walton Beach, FL</p>`,
      });
      console.log(`[day2] Reminder sent to ${email}`);
      remindSent++;

      await fetch(`${GHL_BASE}/contacts/${contact.id}/tags`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ tags: ["camp-survey-reminder-sent"] }),
      }).catch((e) => console.warn("[day2] Reminder tag failed:", e.message));

    } catch (e) {
      console.error(`[day2] Reminder failed for ${email}:`, e.message);
    }
  }

  console.log(`[day2] Done — sent ${remindSent} reminder emails`);

  // ── PASS 3: Weekly Monday report — cold leads who never completed Part 2 ──
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isMorning = now.getUTCHours() === 13; // 9am ET = 1pm UTC

  if (isMonday && isMorning) {
  const coldRes = await searchContactsByTag("camp-survey-reminder-sent").catch(() => null);

  if (!coldRes || !coldRes.ok) return { statusCode: 200 };

  const coldData = await coldRes.json();
  const coldLeads = (coldData.contacts || []).filter(c => !(c.tags || []).includes("camp-survey-part2-complete"));

  console.log(`[day2] Weekly report: ${coldLeads.length} cold leads`);
  if (coldLeads.length === 0) return { statusCode: 200 };

  const rows = coldLeads.map(c => {
    const date = new Date(c.dateAdded || c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.firstName || "")} ${escHtml(c.lastName || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.email || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(c.phone || "")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${date}</td>
    </tr>`;
  }).join("");

  const reportHtml = `
<p>Here are the <strong>${coldLeads.length} camp survey lead${coldLeads.length !== 1 ? "s" : ""}</strong> who never completed Part 2:</p>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%">
  <thead>
    <tr style="background:#060f22;color:#fff">
      <th style="padding:8px 12px;text-align:left">Name</th>
      <th style="padding:8px 12px;text-align:left">Email</th>
      <th style="padding:8px 12px;text-align:left">Phone</th>
      <th style="padding:8px 12px;text-align:left">Signed Up</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<p style="margin-top:16px;font-size:13px;color:#888">These contacts have tag <code>camp-survey-reminder-sent</code> but not <code>camp-survey-part2-complete</code>.</p>`;

  try {
    await transporter.sendMail({
      from: '"FCP Sports" <info@fcpsports.org>',
      to: "info@fcpsports.org",
      subject: `Camp Survey — ${coldLeads.length} lead${coldLeads.length !== 1 ? "s" : ""} haven't completed Part 2`,
      html: reportHtml,
    });
    console.log("[day2] Weekly cold lead report sent");
  } catch (e) {
    console.error("[day2] Weekly report failed:", e.message);
  }
  } // end Monday report

  // ── PASS 4: Daily 8am digest to info@fcpsports.org ──
  // 8am EDT = 12pm UTC (daylight saving, March–November)
  if (now.getUTCHours() === 12) {
    await sendDailyDigest(transporter);
  }

  return { statusCode: 200 };
};

// Netlify scheduled function — runs every hour
module.exports.config = {
  schedule: "0 * * * *",
};
