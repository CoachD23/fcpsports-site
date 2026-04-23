/**
 * send-recontact.js
 * Bulk email to 850 area code contacts from Recontact List - Cleaned.xlsx
 * Rate: 100 emails/minute (600ms delay)
 * Run: node scripts/send-recontact.js
 *
 * Env vars required (source ~/.fcp-secrets first):
 *   FCPSPORTS_SMTP_PASS
 */

const nodemailer = require("nodemailer");
const path = require("path");
const { execSync } = require("child_process");

// ── Load list via Python (xlsx parsing) ──
function loadList() {
  const script = `
import json, sys
try:
    import pandas as pd
except ImportError:
    sys.exit("pandas not found — run: pip3 install pandas openpyxl")

df = pd.read_excel("${path.resolve("/Users/fcp/Documents/Leads/Recontact List - Cleaned.xlsx")}")
df["area_code"] = df["Phone"].astype(str).str[:3]
local = df[df["area_code"] == "850"].copy()
local = local[local["Email"].notna() & (local["Email"].str.strip() != "")]
local = local.fillna("")
records = local[["Email","First Name","Last Name"]].rename(columns={"First Name":"first","Last Name":"last"}).to_dict("records")
print(json.dumps(records))
`;
  const result = execSync(`/opt/homebrew/bin/python3 -c '${script}'`, { encoding: "utf8" });
  return JSON.parse(result);
}

// ── SMTP ──
const SMTP_PASS = process.env.FCPSPORTS_SMTP_PASS;
if (!SMTP_PASS) {
  console.error("Missing FCPSPORTS_SMTP_PASS. Run: source ~/.fcp-secrets");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false,
  auth: { user: "info@fcpsports.org", pass: SMTP_PASS },
  tls: { ciphers: "SSLv3" },
});

function buildEmail(firstName) {
  const name = (firstName || "").trim() || "there";
  return {
    from: '"FCP Sports" <info@fcpsports.org>',
    subject: "Early Bird Access — Camps & Leagues in Fort Walton Beach",
    html: `<p>Hey ${name},</p>
<p>We're opening up early bird access to our upcoming camps and leagues right here in Fort Walton Beach.</p>
<p>Sign up free — takes 30 seconds:<br>
<a href="https://fcpsports.org/camp-survey/details/">Claim Your Spot</a></p>
<p>Talk soon,<br>FCP Sports<br>Fort Walton Beach, FL</p>`,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntil8amCT() {
  const now = new Date();
  // CT = UTC-5 (CST) or UTC-6 (CDT). April = CDT = UTC-5... wait, CDT = UTC-4, CST = UTC-6
  // April in Fort Walton Beach = CDT = UTC-4. 8am CDT = 12:00 UTC
  const target = new Date(now);
  target.setUTCHours(12, 0, 0, 0); // 8am CDT
  if (target <= now) return; // already past 8am, go now
  const ms = target - now;
  const mins = Math.round(ms / 60000);
  console.log(`Waiting ${mins} minutes until 8am CT...`);
  await sleep(ms);
  console.log("8am — starting send.");
}

async function run() {
  // await waitUntil8amCT();

  const contacts = loadList();
  console.log(`Loaded ${contacts.length} local (850) contacts`);

  let sent = 0;
  let failed = 0;
  const DELAY_MS = 3000; // 20/min = 1 every 3 seconds (~2.7 hours total)

  for (const contact of contacts) {
    const email = contact.Email?.trim().toLowerCase();
    if (!email) continue;

    const mail = buildEmail(contact.first);
    try {
      await transporter.sendMail({ ...mail, to: email });
      sent++;
      if (sent % 20 === 0) {
        console.log(`[${sent}/${contacts.length}] sent — ${failed} failed`);
      }
    } catch (e) {
      failed++;
      console.error(`FAIL ${email}: ${e.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Sent: ${sent} | Failed: ${failed} | Total: ${contacts.length}`);
}

run().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
