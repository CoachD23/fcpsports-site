/**
 * league-submit-score.js
 * Admin-only endpoint to record final scores for a game, then recalculate
 * and persist standings for the affected season/division.
 *
 * Env vars required (set in Netlify dashboard):
 *   RECAP_ACCESS_CODE - Secret matched against X-Admin-Secret header
 *   AIRTABLE_PAT      - Airtable Personal Access Token
 *   LEAGUE_BASE_ID    - Airtable base ID for league data
 *
 * Request body (JSON):
 *   { gameId: string, homeScore: number, awayScore: number }
 *
 * Response:
 *   { ok: true, game: { ... }, standings: [...] }
 */

// ── Rate limiter (in-memory, per function instance) ──────────────────────────
const rateLimit = {};
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 score submissions per minute per IP

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

async function getGameById(gameId) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Games/${gameId}`, {
    headers: airtableHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable get game ${res.status}: ${text}`);
  }
  return res.json();
}

async function updateGameRecord(gameId, homeScore, awayScore) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Games/${gameId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({
      fields: {
        HomeScore: homeScore,
        AwayScore: awayScore,
        Status: 'final',
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update game ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchFinalGamesBySeasonDivision(season, division) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const filterParts = [`{Status}="final"`];
  if (season) filterParts.push(`{Season}="${season}"`);
  if (division) filterParts.push(`{Division}="${division}"`);

  const filterFormula =
    filterParts.length === 1 ? filterParts[0] : `AND(${filterParts.join(',')})`;

  const params = new URLSearchParams();
  params.set('filterByFormula', filterFormula);

  const url = `${AIRTABLE_BASE}/${baseId}/Games?${params.toString()}`;
  const records = [];
  let offset = null;

  do {
    const pageUrl = offset ? `${url}&offset=${offset}` : url;
    const res = await fetch(pageUrl, { headers: airtableHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable games fetch ${res.status}: ${text}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}

async function fetchTeamsBySeasonDivision(season, division) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const filterParts = [];
  if (season) filterParts.push(`{Season}="${season}"`);
  if (division) filterParts.push(`{Division}="${division}"`);

  const filterFormula =
    filterParts.length === 1
      ? filterParts[0]
      : filterParts.length > 1
      ? `AND(${filterParts.join(',')})`
      : '';

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
      throw new Error(`Airtable teams fetch ${res.status}: ${text}`);
    }
    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);

  return records;
}

async function updateTeamRecord(teamId, fields) {
  const baseId = process.env.LEAGUE_BASE_ID;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/Teams/${teamId}`, {
    method: 'PATCH',
    headers: airtableHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable update team ${teamId} ${res.status}: ${text}`);
  }
  return res.json();
}

function computeStreak(teamId, games) {
  // Sort games by Date descending to find current streak
  const teamGames = games
    .filter((g) => {
      const homeIds = g.fields['HomeTeamId'] || [];
      const awayIds = g.fields['AwayTeamId'] || [];
      return homeIds.includes(teamId) || awayIds.includes(teamId);
    })
    .sort((a, b) => {
      const da = new Date(a.fields['Date'] || 0);
      const db = new Date(b.fields['Date'] || 0);
      return db - da;
    });

  if (!teamGames.length) return '';

  let type = null;
  let count = 0;

  for (const game of teamGames) {
    const homeIds = game.fields['HomeTeamId'] || [];
    const isHome = homeIds.includes(teamId);
    const homeScore = Number(game.fields['HomeScore'] || 0);
    const awayScore = Number(game.fields['AwayScore'] || 0);

    const won = isHome ? homeScore > awayScore : awayScore > homeScore;
    const result = won ? 'W' : 'L';

    if (type === null) {
      type = result;
      count = 1;
    } else if (result === type) {
      count += 1;
    } else {
      break;
    }
  }

  return type ? `${type}${count}` : '';
}

async function recalculateStandings(season, division, allGames) {
  const teams = await fetchTeamsBySeasonDivision(season, division);

  // Build a map of teamId -> stats accumulator
  const statsMap = {};
  for (const team of teams) {
    statsMap[team.id] = { w: 0, l: 0, pf: 0, pa: 0 };
  }

  for (const game of allGames) {
    const homeIds = game.fields['HomeTeamId'] || [];
    const awayIds = game.fields['AwayTeamId'] || [];
    const homeScore = Number(game.fields['HomeScore'] || 0);
    const awayScore = Number(game.fields['AwayScore'] || 0);

    for (const homeId of homeIds) {
      if (statsMap[homeId]) {
        statsMap[homeId].pf += homeScore;
        statsMap[homeId].pa += awayScore;
        if (homeScore > awayScore) {
          statsMap[homeId].w += 1;
        } else {
          statsMap[homeId].l += 1;
        }
      }
    }

    for (const awayId of awayIds) {
      if (statsMap[awayId]) {
        statsMap[awayId].pf += awayScore;
        statsMap[awayId].pa += homeScore;
        if (awayScore > homeScore) {
          statsMap[awayId].w += 1;
        } else {
          statsMap[awayId].l += 1;
        }
      }
    }
  }

  // Persist updated stats to each team record and build standings array
  const updatePromises = teams.map((team) => {
    const stats = statsMap[team.id] || { w: 0, l: 0, pf: 0, pa: 0 };
    const streak = computeStreak(team.id, allGames);
    return updateTeamRecord(team.id, {
      W: stats.w,
      L: stats.l,
      PF: stats.pf,
      PA: stats.pa,
      Streak: streak,
    }).then((updated) => ({
      id: updated.id,
      name: updated.fields['Name'] || '',
      division: updated.fields['Division'] || '',
      season: updated.fields['Season'] || '',
      w: stats.w,
      l: stats.l,
      pf: stats.pf,
      pa: stats.pa,
      streak,
    }));
  });

  const standings = await Promise.all(updatePromises);

  return standings.sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    return b.pf - a.pf;
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
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
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;

    const { gameId, homeScore, awayScore } = JSON.parse(raw);

    if (!gameId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'gameId is required' }),
      };
    }
    if (homeScore === undefined || homeScore === null) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'homeScore is required' }),
      };
    }
    if (awayScore === undefined || awayScore === null) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'awayScore is required' }),
      };
    }

    const numericHome = Number(homeScore);
    const numericAway = Number(awayScore);

    if (isNaN(numericHome) || isNaN(numericAway)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'homeScore and awayScore must be numbers' }),
      };
    }

    // Fetch the original game to get season/division context
    const originalGame = await getGameById(gameId);
    const gameSeason = originalGame.fields['Season'] || '';
    const gameDivision = originalGame.fields['Division'] || '';

    // Update the game record with final scores
    const updatedGame = await updateGameRecord(gameId, numericHome, numericAway);

    // Fetch all final games for this season/division (includes the one just updated)
    const finalGames = await fetchFinalGamesBySeasonDivision(gameSeason, gameDivision);

    // Recalculate and persist standings
    const standings = await recalculateStandings(gameSeason, gameDivision, finalGames);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        game: {
          id: updatedGame.id,
          homeTeam: updatedGame.fields['HomeTeam'] || '',
          awayTeam: updatedGame.fields['AwayTeam'] || '',
          homeScore: updatedGame.fields['HomeScore'],
          awayScore: updatedGame.fields['AwayScore'],
          status: updatedGame.fields['Status'],
          season: updatedGame.fields['Season'] || '',
          division: updatedGame.fields['Division'] || '',
          date: updatedGame.fields['Date'] || '',
        },
        standings,
      }),
    };
  } catch (err) {
    console.error('[league-submit-score] Error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to submit score' }),
    };
  }
};
