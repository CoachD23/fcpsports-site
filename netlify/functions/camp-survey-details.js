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
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { email = "", age = "", interest = "", times = [] } = body;

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Email required" }) };
  }

  try {
    // Find contact by email
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search?locationId=${process.env.GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers: ghlHeaders() }
    );
    const searchData = await searchRes.json();
    const contact = searchData.contacts?.[0];

    if (!contact) {
      console.log(`[camp-survey-details] Contact not found for ${email} — creating`);
    }

    const contactId = contact?.id;

    // Build tags from responses
    const tags = ["camp-survey-part2-complete"];
    if (age)      tags.push(`age-${age}`);
    if (interest) tags.push(`interest-${interest}`);

    // Upsert with custom fields if contact exists, else create
    const upsertBody = {
      locationId: process.env.GHL_LOCATION_ID,
      email: email.trim().toLowerCase(),
    };

    await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(),
      body: JSON.stringify(upsertBody),
    }).then(async (r) => {
      const d = await r.json();
      const cid = d.contact?.id || d.id || contactId;
      if (!cid) return;

      // Add tags
      await fetch(`${GHL_BASE}/contacts/${cid}/tags`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ tags }),
      }).catch(() => {});

      // Add internal note with full survey answers
      const noteLines = [
        `Part 2 survey completed.`,
        `Age range: ${age || "not provided"}`,
        `Interest: ${interest || "not provided"}`,
        `Best times: ${times.length ? times.join(", ") : "not provided"}`,
      ];
      await fetch(`${GHL_BASE}/contacts/${cid}/notes`, {
        method: "POST",
        headers: ghlHeaders(),
        body: JSON.stringify({ body: noteLines.join("\n") }),
      }).catch(() => {});

      // Move opportunity to next stage if one exists
      const oppRes = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&contact_id=${cid}`,
        { headers: ghlHeaders() }
      ).then((r) => r.json()).catch(() => ({ opportunities: [] }));

      const opp = oppRes.opportunities?.[0];
      if (opp?.id) {
        // Move to "Qualified" stage — update this stage ID to match your pipeline
        await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
          method: "PUT",
          headers: ghlHeaders(),
          body: JSON.stringify({ stageId: process.env.GHL_QUALIFIED_STAGE_ID || opp.stageId }),
        }).catch(() => {});
      }
    });

    console.log(`[camp-survey-details] Part 2 complete for ${email}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("[camp-survey-details] Error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
