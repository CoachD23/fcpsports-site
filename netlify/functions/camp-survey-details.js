const GHL_BASE = "https://services.leadconnectorhq.com";

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { email = "", age = "", interest = "", times = [] } = body;
  if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email required" }) };

  try {
    // 1. Upsert contact to reliably get contact ID
    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({
        locationId: process.env.GHL_LOCATION_ID,
        email: email.trim().toLowerCase(),
      }),
    });
    const upsertData = await upsertRes.json();
    const cid = upsertData.contact?.id || upsertData.id;

    if (!cid) {
      console.error("[camp-survey-details] Could not resolve contact for", email);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // 2. Apply Part 2 tags
    const tags = ["camp-survey-part2-complete"];
    if (age)      tags.push(`age-${age}`);
    if (interest) tags.push(`interest-${interest}`);

    await fetch(`${GHL_BASE}/contacts/${cid}/tags`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ tags }),
    }).catch((e) => console.warn("[camp-survey-details] Tag failed:", e.message));

    // 3. Add internal note
    const note = [
      "Part 2 survey completed.",
      `Age range: ${age || "not provided"}`,
      `Interest: ${interest || "not provided"}`,
      `Best times: ${times.length ? times.join(", ") : "not provided"}`,
    ].join("\n");

    await fetch(`${GHL_BASE}/contacts/${cid}/notes`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify({ body: note }),
    }).catch((e) => console.warn("[camp-survey-details] Note failed:", e.message));

    // 4. Move opportunity to next stage if env var is set
    if (process.env.GHL_QUALIFIED_STAGE_ID) {
      const oppRes = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&contact_id=${cid}`,
        { headers: ghlHeaders() }
      ).then((r) => r.json()).catch(() => ({ opportunities: [] }));

      const opp = oppRes.opportunities?.[0];
      if (opp?.id) {
        await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
          method: "PUT",
          headers: ghlHeaders(),
          body: JSON.stringify({ stageId: process.env.GHL_QUALIFIED_STAGE_ID }),
        }).catch(() => {});
      }
    }

    console.log(`[camp-survey-details] Part 2 complete for ${email} | cid: ${cid} | tags: ${tags.join(",")}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("[camp-survey-details] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
