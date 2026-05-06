const nodemailer = require("nodemailer");
const { getStore } = require("@netlify/blobs");

const GHL_BASE = "https://services.leadconnectorhq.com";
const DEFAULT_ALERT_TO = "info@fcpsports.org,coachdeforest@gmail.com";
const CONTACT_FALLBACK_URL = "https://fcpsports.org/contact/";
const CONTACT_PHONE = "850.961.2323";

const PROGRAM_NEXT_STEPS = {
  "skills-training": {
    env: "SKILLS_TRAINING_SCHEDULE_URL",
    label: "Schedule Training",
    copy: "Use the button below to schedule the next training step for your athlete.",
  },
  "private-lesson": {
    env: "PRIVATE_LESSON_SCHEDULE_URL",
    label: "Book Your Lesson",
    copy: "Use the button below to choose the best private lesson time.",
  },
  "homeschool-pe": {
    env: "HOMESCHOOL_PE_SCHEDULE_URL",
    label: "Schedule Homeschool PE",
    copy: "Use the button below to confirm your homeschool PE next step.",
  },
};

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function shouldSuppressAlert(email) {
  const e = cleanEmail(email);
  return e.endsWith("@example.com");
}

function alertRecipients() {
  return (process.env.PAYMENT_ALERT_TO || DEFAULT_ALERT_TO)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

function createSmtp() {
  if (!process.env.FCPSPORTS_SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: { user: "info@fcpsports.org", pass: process.env.FCPSPORTS_SMTP_PASS },
  });
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getProgramNextStep(programId) {
  const config = PROGRAM_NEXT_STEPS[programId] || {};
  const url = process.env[config.env] || CONTACT_FALLBACK_URL;
  return {
    nextStepUrl: url,
    nextStepLabel: config.label || "Schedule Next Step",
    nextStepCopy: config.copy || `Need help with next steps? Contact us at ${CONTACT_PHONE}.`,
    phone: CONTACT_PHONE,
    usedFallback: !process.env[config.env],
  };
}

function nextBusinessDayIso(now = new Date()) {
  const due = new Date(now);
  due.setDate(due.getDate() + 1);
  due.setHours(15, 0, 0, 0);
  while (due.getDay() === 0 || due.getDay() === 6) {
    due.setDate(due.getDate() + 1);
  }
  return due.toISOString();
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

async function postGhl(path, payload) {
  if (!process.env.GHL_API_KEY || !process.env.GHL_LOCATION_ID) {
    return { ok: false, skipped: true };
  }
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: "POST",
    headers: ghlHeaders(),
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) {
    throw new Error(`GHL ${path} failed: ${res.status} ${text.slice(0, 240)}`);
  }
  return { ok: true, data, text };
}

async function addGhlNote(contactId, body) {
  if (!contactId) return { ok: false, skipped: true };
  return postGhl(`/contacts/${encodeURIComponent(contactId)}/notes`, { body });
}

async function createGhlTask(contactId, payload) {
  if (!contactId) return { ok: false, skipped: true };
  return postGhl(`/contacts/${encodeURIComponent(contactId)}/tasks`, {
    title: payload.title,
    body: payload.body,
    dueDate: payload.dueDate || nextBusinessDayIso(),
    completed: false,
  });
}

function issuePayload(input) {
  return {
    timestamp: new Date().toISOString(),
    severity: input.severity || "error",
    eventType: input.eventType || "payment_issue",
    flow: input.flow || "unknown",
    programId: input.programId || "",
    programName: input.programName || input.programLabel || "",
    email: cleanEmail(input.email),
    parentName: input.parentName || "",
    athleteName: input.athleteName || "",
    amount: input.amount || "",
    statusCode: input.statusCode || "",
    transactionId: input.transactionId || "",
    contactId: input.contactId || "",
    requestId: input.requestId || "",
    error: input.error ? String(input.error).slice(0, 1200) : "",
  };
}

async function recordPaymentIssue(input) {
  const issue = issuePayload(input);
  if (shouldSuppressAlert(issue.email)) return { ok: true, suppressed: true };
  try {
    const store = getStore("payment-alerts");
    const bucket = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const random = Math.random().toString(36).slice(2, 10);
    await store.setJSON(`issues/${bucket}/${Date.now()}-${random}.json`, issue);
    return { ok: true, issue };
  } catch (err) {
    console.warn("[checkout-reliability] Blob issue write failed:", err.message);
    return { ok: false, error: err.message, issue };
  }
}

async function listRecentPaymentIssues(minutes = 15) {
  try {
    const store = getStore("payment-alerts");
    const result = await store.list({ prefix: "issues/" });
    const cutoff = Date.now() - minutes * 60 * 1000;
    const issues = [];
    for (const blob of result.blobs || []) {
      try {
        const issue = await store.get(blob.key, { type: "json" });
        if (issue && Date.parse(issue.timestamp) >= cutoff) issues.push(issue);
      } catch (err) {
        console.warn("[checkout-reliability] Blob issue read failed:", err.message);
      }
    }
    return issues;
  } catch (err) {
    console.warn("[checkout-reliability] Blob issue list failed:", err.message);
    return [];
  }
}

async function hasAlertBeenSent(key) {
  try {
    const store = getStore("payment-alerts");
    return !!(await store.get(`sent/${key}`, { type: "json" }));
  } catch (err) {
    console.warn("[checkout-reliability] Blob sent read failed:", err.message);
    return false;
  }
}

async function markAlertSent(key, payload) {
  try {
    const store = getStore("payment-alerts");
    await store.setJSON(`sent/${key}`, { timestamp: new Date().toISOString(), payload });
  } catch (err) {
    console.warn("[checkout-reliability] Blob sent write failed:", err.message);
  }
}

function alertSubject(input) {
  const severity = (input.severity || "error").toUpperCase();
  const type = input.eventType || "payment_issue";
  const flow = input.flow || "checkout";
  return `[${severity}] FCP Sports ${type} (${flow})`;
}

async function sendPaymentAlert(input) {
  const issue = issuePayload(input);
  if (shouldSuppressAlert(issue.email)) return { ok: true, suppressed: true };

  const subject = input.subject || alertSubject(issue);
  const lines = [
    `Event: ${issue.eventType}`,
    `Severity: ${issue.severity}`,
    `Flow: ${issue.flow}`,
    `Program: ${issue.programName || issue.programId || "unknown"}`,
    `Customer: ${issue.parentName || "unknown"} <${issue.email || "no email"}>`,
    issue.athleteName ? `Athlete: ${issue.athleteName}` : null,
    issue.amount ? `Amount: $${issue.amount}` : null,
    issue.statusCode ? `Status: ${issue.statusCode}` : null,
    issue.transactionId ? `Transaction: ${issue.transactionId}` : null,
    issue.requestId ? `Request ID: ${issue.requestId}` : null,
    issue.error ? `Error: ${issue.error}` : null,
    `Time: ${issue.timestamp}`,
  ].filter(Boolean);

  let emailResult = { ok: false, skipped: true };
  const smtp = createSmtp();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: '"FCP Sports Alerts" <info@fcpsports.org>',
        to: alertRecipients(),
        subject,
        text: lines.join("\n"),
        html: `<pre style="font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${htmlEscape(lines.join("\n"))}</pre>`,
      });
      emailResult = { ok: true };
    } catch (err) {
      console.warn("[checkout-reliability] Alert email failed:", err.message);
      emailResult = { ok: false, error: err.message };
    }
  }

  let ghlResult = { ok: false, skipped: true };
  if (issue.contactId) {
    try {
      const body = `FCP Sports payment alert\n\n${lines.join("\n")}`;
      await addGhlNote(issue.contactId, body);
      await createGhlTask(issue.contactId, {
        title: `Review FCP Sports payment issue: ${issue.programName || issue.programId || "checkout"}`,
        body,
      });
      ghlResult = { ok: true };
    } catch (err) {
      console.warn("[checkout-reliability] GHL alert write failed:", err.message);
      ghlResult = { ok: false, error: err.message };
    }
  }

  return { ok: emailResult.ok || ghlResult.ok, email: emailResult, ghl: ghlResult };
}

async function sendGenericConfirmationEmail(input) {
  const smtp = createSmtp();
  if (!smtp || !input.email) return { ok: false, skipped: true };

  const program = input.programName || input.programLabel || "FCP Sports Program";
  const next = input.nextStep || getProgramNextStep(input.programId);
  const amount = Number(input.amount || 0).toFixed(2);
  const subject = `Payment Confirmed - ${program}`;
  const name = input.parentFirst || "there";

  await smtp.sendMail({
    from: '"FCP Sports" <info@fcpsports.org>',
    to: cleanEmail(input.email),
    bcc: "info@fcpsports.org",
    subject,
    text:
      `Hi ${name},\n\n` +
      `Payment received for ${program}.\n\n` +
      `Athlete: ${input.athleteName || "N/A"}\n` +
      `Amount paid: $${amount}\n` +
      (input.transactionId ? `Transaction ID: ${input.transactionId}\n\n` : "\n") +
      `${next.nextStepCopy}\n${next.nextStepUrl}\n\n` +
      `Questions? Reply to this email or call ${CONTACT_PHONE}.\n\n` +
      "FCP Sports",
    html: `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#0a1628;padding:24px;text-align:center;">
          <span style="font-family:Arial,sans-serif;font-size:28px;font-weight:800;letter-spacing:2px;color:#fff;">FCP</span><span style="font-family:Arial,sans-serif;font-size:28px;font-weight:800;letter-spacing:2px;color:#f5a623;"> SPORTS</span>
        </td></tr>
        <tr><td style="padding:32px;font-family:Arial,sans-serif;color:#0a1628;">
          <h1 style="margin:0 0 10px;font-size:26px;">Payment Confirmed</h1>
          <p style="margin:0 0 24px;color:#526071;">Hi ${htmlEscape(name)}, your payment for <strong>${htmlEscape(program)}</strong> has been received.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e8ec;border-radius:6px;margin-bottom:24px;">
            <tr><td style="padding:10px 12px;color:#526071;">Athlete</td><td style="padding:10px 12px;font-weight:700;">${htmlEscape(input.athleteName || "N/A")}</td></tr>
            <tr><td style="padding:10px 12px;color:#526071;border-top:1px solid #e6e8ec;">Amount</td><td style="padding:10px 12px;font-weight:700;border-top:1px solid #e6e8ec;">$${amount}</td></tr>
            ${input.transactionId ? `<tr><td style="padding:10px 12px;color:#526071;border-top:1px solid #e6e8ec;">Transaction</td><td style="padding:10px 12px;font-weight:700;border-top:1px solid #e6e8ec;">${htmlEscape(input.transactionId)}</td></tr>` : ""}
          </table>
          <p style="margin:0 0 18px;color:#526071;line-height:1.5;">${htmlEscape(next.nextStepCopy)}</p>
          <p style="margin:0 0 26px;"><a href="${htmlEscape(next.nextStepUrl)}" style="display:inline-block;background:#f5a623;color:#0a1628;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:6px;">${htmlEscape(next.nextStepLabel)}</a></p>
          <p style="margin:0;color:#526071;font-size:13px;">Questions? Reply to this email or call <a href="tel:8509612323" style="color:#0a1628;text-decoration:none;">${CONTACT_PHONE}</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
  return { ok: true };
}

async function createSchedulingFollowUpTask(input) {
  if (!input.contactId) return { ok: false, skipped: true };
  const program = input.programName || input.programLabel || input.programId || "program";
  return createGhlTask(input.contactId, {
    title: `Confirm scheduling for paid ${program} customer`,
    body:
      `Paid FCP Sports customer needs scheduling confirmation.\n\n` +
      `Program: ${program}\n` +
      `Athlete: ${input.athleteName || ""}\n` +
      `Parent: ${input.parentName || ""}\n` +
      `Email: ${input.email || ""}\n` +
      `Phone: ${input.phone || ""}\n` +
      `Amount: $${input.amount || ""}\n` +
      `Transaction: ${input.transactionId || ""}`,
    dueDate: nextBusinessDayIso(),
  });
}

module.exports = {
  CONTACT_FALLBACK_URL,
  CONTACT_PHONE,
  DEFAULT_ALERT_TO,
  addGhlNote,
  createGhlTask,
  createSchedulingFollowUpTask,
  getProgramNextStep,
  hasAlertBeenSent,
  listRecentPaymentIssues,
  markAlertSent,
  nextBusinessDayIso,
  recordPaymentIssue,
  sendGenericConfirmationEmail,
  sendPaymentAlert,
  shouldSuppressAlert,
};
