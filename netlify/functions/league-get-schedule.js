/**
 * league-get-schedule.js
 * Returns games from Airtable, optionally filtered by season, division, and status.
 * Public endpoint — no auth required.
 *
 * Env vars required (set in Netlify dashboard):
 *   AIRTABLE_PAT     - Airtable Personal Access Token
 *   LEAGUE_BASE_ID   - Airtable base ID for league data
 *
 * Query params (all optional):
 *   ?season=fall-2026
 *   ?division=junior
 *   ?status=scheduled   (scheduled | final | cancelled)
 *
 * Sort order: Date ascending
 */

// ── Allowed origins for CORS ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://fcpsports.org',
  'https://www.fcpsports.org',
  'https://floridacoastalprep.com',
  'https://www.floridacoastalprep.com',
  'https://ops.floridacoastalprep.com',
];

function corsHeaders(requestOrigin) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

// ── Rate limiter (in-memory, per function instance) ──────────────────────────
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // max 30 requests per minute per IP

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

const VALID_STATUSES = new Set(['scheduled', 'final', 'cancelled']);

async function fetchGames(season, division, status) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const filterParts = [];

  if (season) filterParts.push(`{Season}="${season}"`);
  if (division) filterParts.push(`{Division}="${division}"`);
  if (status && VALID_STATUSES.has(status)) {
    filterParts.push(`{Status}="${status}"`);
  }

  const filterFormula =
    filterParts.length === 1
      ? filterParts[0]
      : filterParts.length > 1
      ? `AND(${filterParts.join(',')})`
      : '';

  const params = new URLSearchParams();
  if (filterFormula) params.set('filterByFormula', filterFormula);
  // Sort by Date ascending in Airtable
  params.set('sort[0][field]', 'Date');
  params.set('sort[0][direction]', 'asc');

  const url = `${AIRTABLE_BASE}/${baseId}/Games?${params.toString()}`;
  const records = [];
  let offset = null;

  do {
    const pageUrl = offset ? `${url}&offset=${offset}` : url;
    const res = await fetch(pageUrl, { headers: airtableHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable Games fetch ${res.status}: ${text}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}

exports.handler = async function (event) {
  const requestOrigin = event.headers['origin'] || '';
  const headers = corsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const clientIp =
    event.headers['x-forwarded-for']?.split(',')[0].trim() ||
    event.headers['client-ip'] ||
    'unknown';

  if (isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Too many requests' }),
    };
  }

  try {
    const { season = '', division = '', status = '' } = event.queryStringParameters || {};

    const normalizedStatus = status.trim().toLowerCase();
    if (normalizedStatus && !VALID_STATUSES.has(normalizedStatus)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}`,
        }),
      };
    }

    const records = await fetchGames(
      season.trim() || null,
      division.trim() || null,
      normalizedStatus || null
    );

    const games = records.map((r) => ({
      id: r.id,
      date: r.fields['Date'] || '',
      time: r.fields['Time'] || '',
      homeTeam: r.fields['HomeTeam'] || '',
      awayTeam: r.fields['AwayTeam'] || '',
      homeScore: r.fields['HomeScore'] !== undefined ? r.fields['HomeScore'] : null,
      awayScore: r.fields['AwayScore'] !== undefined ? r.fields['AwayScore'] : null,
      status: r.fields['Status'] || '',
      division: r.fields['Division'] || '',
      season: r.fields['Season'] || '',
      location: r.fields['Location'] || '',
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, games }),
    };
  } catch (err) {
    console.error('[league-get-schedule] Error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch schedule' }),
    };
  }
};
