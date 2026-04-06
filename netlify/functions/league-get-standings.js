/**
 * league-get-standings.js
 * Returns sorted team standings from Airtable, optionally filtered by season/division.
 * Public endpoint — no auth required.
 *
 * Env vars required (set in Netlify dashboard):
 *   AIRTABLE_PAT     - Airtable Personal Access Token
 *   LEAGUE_BASE_ID   - Airtable base ID for league data
 *
 * Query params (all optional):
 *   ?season=fall-2026
 *   ?division=junior
 *
 * Sort order: W desc, then PF desc as tiebreaker
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

async function fetchAllTeams(season, division) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const filterParts = [];

  if (season) {
    filterParts.push(`{Season}="${season}"`);
  }
  if (division) {
    filterParts.push(`{Division}="${division}"`);
  }

  const filterFormula =
    filterParts.length === 1
      ? filterParts[0]
      : filterParts.length > 1
      ? `AND(${filterParts.join(',')})`
      : '';

  const params = new URLSearchParams();
  if (filterFormula) params.set('filterByFormula', filterFormula);
  params.set('fields[]', 'Name');
  params.set('fields[]', 'Division');
  params.set('fields[]', 'Season');
  params.set('fields[]', 'Coach');
  params.set('fields[]', 'W');
  params.set('fields[]', 'L');
  params.set('fields[]', 'PF');
  params.set('fields[]', 'PA');
  params.set('fields[]', 'Streak');

  const url = `${AIRTABLE_BASE}/${baseId}/Teams?${params.toString()}`;
  const records = [];
  let offset = null;

  do {
    const pageUrl = offset ? `${url}&offset=${offset}` : url;
    const res = await fetch(pageUrl, { headers: airtableHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable Teams fetch ${res.status}: ${text}`);
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
    const { season = '', division = '' } = event.queryStringParameters || {};

    const records = await fetchAllTeams(
      season.trim() || null,
      division.trim() || null
    );

    const standings = records
      .map((r) => ({
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
      }))
      .sort((a, b) => {
        if (b.w !== a.w) return b.w - a.w;
        return b.pf - a.pf;
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, standings }),
    };
  } catch (err) {
    console.error('[league-get-standings] Error:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch standings' }),
    };
  }
};
