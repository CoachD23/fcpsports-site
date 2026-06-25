/**
 * league-roster.js
 * Least-effort league roster feed. Saturday League registrations live in the
 * Airtable "Youth_League_Registrations" table (written by register-youth-league.js),
 * NOT in the camp/program ledgers. This reads the PAID ones so the admin dashboard
 * and coaches page can show league players alongside camps + training — closing the
 * "someone paid and no one knows" gap.
 *
 * Returns normalized records shaped like the other roster feeds:
 *   { kind:"league", league, division, camper, parent, email, phone,
 *     amount, status:"Paid", transactionId, signup_date }
 */
const AIRTABLE_BASE = "https://api.airtable.com/v0";
const TABLE = "Youth_League_Registrations";

// Airtable single-select fields come back as a {id,name} object via some clients
// and as a plain string via the REST API — normalize either to a string.
function sv(v) { return v == null ? "" : (typeof v === "object" ? String(v.name || "") : String(v)); }

async function listLeagueRosterRecords() {
  const pat = process.env.AIRTABLE_PAT;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!pat || !base) return [];
  const out = [];
  let offset = "";
  try {
    do {
      const url = `${AIRTABLE_BASE}/${base}/${encodeURIComponent(TABLE)}?pageSize=100` + (offset ? `&offset=${encodeURIComponent(offset)}` : "");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
      if (!res.ok) break;
      const data = await res.json();
      (data.records || []).forEach((rec) => {
        const f = rec.fields || {};
        if (!/paid/i.test(sv(f["Payment Status"]))) return; // paid players only
        const player = [sv(f["Child First"]), sv(f["Child Last"])].filter(Boolean).join(" ").trim();
        const parent = [sv(f["Parent First"]), sv(f["Parent Last"])].filter(Boolean).join(" ").trim();
        out.push({
          kind: "league",
          league: "Saturday League",
          division: sv(f["Division"]),
          camper: player,
          parent: parent,
          email: sv(f["Parent Email"]).toLowerCase(),
          phone: sv(f["Parent Phone"]),
          amount: Number(f["Price"]) || 0,
          status: "Paid",
          transactionId: sv(f["Transaction ID"]),
          signup_date: sv(f["Registered At"]).slice(0, 10),
        });
      });
      offset = data.offset || "";
    } while (offset);
  } catch (e) {
    // best-effort: leagues are optional context, never block the dashboard
    console.warn("[league-roster] read failed:", e.message);
  }
  return out;
}

module.exports = { listLeagueRosterRecords };
