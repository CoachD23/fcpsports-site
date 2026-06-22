/**
 * training-reminders-cron.js  (scheduled — see netlify.toml)
 *
 * Fires the password-gated training-reminders endpoint in "daily" mode once a
 * day, using ADMIN_PASSWORD from env. The endpoint emails members whose 30-day
 * window renews tomorrow / today / lapsed 3 days ago — each once per cycle
 * (deduped), so this is safe to run daily.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

exports.handler = async function () {
  if (!process.env.ADMIN_PASSWORD) {
    console.error("[training-reminders-cron] ADMIN_PASSWORD missing — skipping");
    return { statusCode: 200, body: "skipped: no admin password" };
  }
  try {
    const res = await fetch("https://fcpsports.org/.netlify/functions/training-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, mode: "daily" }),
    });
    const text = await res.text();
    console.log("[training-reminders-cron]", res.status, text.slice(0, 400));
  } catch (err) {
    console.error("[training-reminders-cron] error:", err.message);
  }
  return { statusCode: 200, body: "ok" };
};
