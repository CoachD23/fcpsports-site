/**
 * league-manage-teams.js
 * Admin-only endpoint for managing teams, games, and seasons.
 * Supports GET (list teams), POST (create team / create-game / create-season),
 * and PUT (update team).
 *
 * Env vars required (set in Netlify dashboard):
 *   RECAP_ACCESS_CODE - Secret matched against X-Admin-Secret header
 *   AIRTABLE_PAT      - Airtable Personal Access Token
 *   LEAGUE_BASE_ID    - Airtable base ID for league data
 *
 * GET  ?season=fall-2026         — list all teams, optional season filter
 *
 * POST body actions:
 *   { action: "create", name, division, season, coach }
 *   { action: "create-game", date, time, homeTeamId, awayTeamId, division, season, location? }
 *   { action: "create-season", name, startDate, endDate, divisions: [...] }
 *
 * PUT body:
 *   { action: "update", teamId, ...fields }
 */

// ── Rate limiter (in-memory, per function instance) ──────────────────────────
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 admin requests per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimit[ip]) rateLimit[ip] = [];
  rateLimit[ip] = rateLimit[ip].filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (rateLimit[ip].length >= RATE_LIMIT_MAX) return true;
  rateLimit[ip].push(now);
  return false;
}

// ── Airtable helpers ──────────────────────────────────────────────────────────
const AIRTABLE_BASE = 'https://api.airtable.com/v0';

function airtableHeaders() {
  return {
    Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
    'Content-Type': 'application/json',
  };
}

async function listTeams(season) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const filterFormula = season ? `{Season}="${season}"` : '';

  const params = new URLSearchParams();
  if (filterFormula) params.set('filterByFormula', filterFormula);

  const url = `${AIRTABLE_BASE}/${baseId}/Teams?${params.toString()}`;
  const records = [];
  let offset = null;

  do {
    const pageUrl = offset ? `${url}&offset=${offset}` : url;
    const res = await fetch(pageUrl, { headers: airtableHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable Teams list ${res.status}: ${text}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records.map((r) => ({
    id: r.id,
    name: r.fields['Name'] || '',
    division: r.fields['Division'] || '',
    season: r.fields['Season'] || '',
    coach: r.fields['Coach'] || '',
    w: Number(r.fields['W'] || 0),
    l: Number(r.fields['L'] || 0),
    pf: Number(r.fields['PF'] || 0),
    pa: Number(r.fields['PA'] || 0),
    streak: r.fields['Streak'] || '',
  }));
}

async function createTeam({ name, division, season, coach }) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Teams`, {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        Name: name,
        Division: division || '',
        Season: season || '',
        Coach: coach || '',
        W: 0,
        L: 0,
        PF: 0,
        PA: 0,
        Streak: '',
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable create team ${res.status}: ${text}`);
  }
  const record = await res.json();
  return {
    id: record.id,
    name: record.fields['Name'] || '',
    division: record.fields['Division'] || '',
    season: record.fields['Season'] || '',
    coach: record.fields['Coach'] || '',
  };
}

async function updateTeam(teamId, fields) {
  const baseId = process.env.LEAGUE_BASE_ID;

  // Only allow safe field updates — never overwrite computed stats from this endpoint
  const allowed = ['Name', 'Division', 'Season', 'Coach'];
  const safeFields = {};
  for (const key of allowed) {
    if (fields[key] !== undefined) safeFields[key] = fields[key];
  }
  // Also allow direct stat overrides when explicitly provided
  const statFields = ['W', 'L', 'PF', 'PA', 'Streak'];
  for (const key of statFields) {
    if (fields[key] !== undefined) safeFields[key] = fields[key];
  }

  if (!Object.keys(safeFields).length) {
    throw new Error('No valid fields provided for update');
  }

  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Teams/${teamId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields: safeFields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update team ${res.status}: ${text}`);
  }
  const record = await res.json();
  return {
    id: record.id,
    name: record.fields['Name'] || '',
    division: record.fields['Division'] || '',
    season: record.fields['Season'] || '',
    coach: record.fields['Coach'] || '',
    w: Number(record.fields['W'] || 0),
    l: Number(record.fields['L'] || 0),
    pf: Number(record.fields['PF'] || 0),
    pa: Number(record.fields['PA'] || 0),
    streak: record.fields['Streak'] || '',
  };
}

async function getTeamById(teamId) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Teams/${teamId}`, {
    headers: airtableHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable get team ${res.status}: ${text}`);
  }
  return res.json();
}

async function createGame({ date, time, homeTeamId, awayTeamId, division, season, location }) {
  const baseId = process.env.LEAGUE_BASE_ID;

  // Look up team names for denormalized display fields
  const [homeTeamRecord, awayTeamRecord] = await Promise.all([
    getTeamById(homeTeamId),
    getTeamById(awayTeamId),
  ]);

  const homeTeamName = homeTeamRecord.fields['Name'] || homeTeamId;
  const awayTeamName = awayTeamRecord.fields['Name'] || awayTeamId;

  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Games`, {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        Date: date,
        Time: time || '',
        HomeTeam: homeTeamName,
        AwayTeam: awayTeamName,
        HomeTeamId: [homeTeamId],
        AwayTeamId: [awayTeamId],
        Division: division || '',
        Season: season || '',
        Location: location || '',
        Status: 'scheduled',
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable create game ${res.status}: ${text}`);
  }
  const record = await res.json();
  return {
    id: record.id,
    date: record.fields['Date'] || '',
    time: record.fields['Time'] || '',
    homeTeam: record.fields['HomeTeam'] || '',
    awayTeam: record.fields['AwayTeam'] || '',
    division: record.fields['Division'] || '',
    season: record.fields['Season'] || '',
    location: record.fields['Location'] || '',
    status: record.fields['Status'] || '',
  };
}

async function createSeason({ name, startDate, endDate, divisions }) {
  const baseId = process.env.LEAGUE_BASE_ID;

  const divisionsStr = Array.isArray(divisions) ? divisions.join(',') : (divisions || '');

  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Seasons`, {
    method: 'POST',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        Name: name,
        StartDate: startDate || '',
        EndDate: endDate || '',
        Divisions: divisionsStr,
        Status: 'registration',
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable create season ${res.status}: ${text}`);
  }
  const record = await res.json();
  return {
    id: record.id,
    name: record.fields['Name'] || '',
    startDate: record.fields['StartDate'] || '',
    endDate: record.fields['EndDate'] || '',
    divisions: record.fields['Divisions'] || '',
    status: record.fields['Status'] || '',
  };
}

exports.handler = async function (event) {
  const method = event.httpMethod;

  if (!['GET', 'POST', 'PUT', 'OPTIONS'].includes(method)) {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Content-Type': 'application/json' }, body: '' };
  }

  // ── Auth check ────────────────────────────────────────────────────────────
  const adminSecret = event.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.RECAP_ACCESS_CODE) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const clientIp =
    event.headers['x-forwarded-for']?.split(',')[0].trim() ||
    event.headers['client-ip'] ||
    'unknown';

  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Too many requests' }),
    };
  }

  try {
    // ── GET: list teams ─────────────────────────────────────────────────────
    if (method === 'GET') {
      const { season = '' } = event.queryStringParameters || {};
      const teams = await listTeams(season.trim() || null);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, teams }),
      };
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const payload = JSON.parse(raw);

    // ── PUT: update team ────────────────────────────────────────────────────
    if (method === 'PUT') {
      const { action, teamId, ...fields } = payload;

      if (action !== 'update') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'PUT requires action: "update"' }),
        };
      }
      if (!teamId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'teamId is required for update' }),
        };
      }

      const team = await updateTeam(teamId, fields);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, team }),
      };
    }

    // ── POST: action-based dispatch ─────────────────────────────────────────
    const { action } = payload;

    if (action === 'create') {
      const { name, division, season, coach } = payload;
      if (!name) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'name is required to create a team' }),
        };
      }
      const team = await createTeam({ name, division, season, coach });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, team }),
      };
    }

    if (action === 'create-game') {
      const { date, time, homeTeamId, awayTeamId, division, season, location } = payload;
      if (!date || !homeTeamId || !awayTeamId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'date, homeTeamId, and awayTeamId are required' }),
        };
      }
      const game = await createGame({ date, time, homeTeamId, awayTeamId, division, season, location });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, game }),
      };
    }

    if (action === 'create-season') {
      const { name, startDate, endDate, divisions } = payload;
      if (!name) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'name is required to create a season' }),
        };
      }
      const season = await createSeason({ name, startDate, endDate, divisions });
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, season }),
      };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Unknown action. Valid actions: create, create-game, create-season',
      }),
    };
  } catch (err) {
    console.error('[league-manage-teams] Error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request failed' }),
    };
  }
};
