import { classify } from './agents.js';

const STATS_TTL = 60; // seconds
let statsCache = { at: 0, body: '' };

const today = () => new Date().toISOString().slice(0, 10);

function place(request) {
  const cf = request.cf || {};
  const country = /^[A-Z]{2}$/.test(cf.country || '') && cf.country !== 'T1' ? cf.country : 'XX';
  const region = typeof cf.regionCode === 'string' ? cf.regionCode.slice(0, 8) : '';
  return { country, region, regionName: typeof cf.region === 'string' ? cf.region : '' };
}

async function count(env, p, kind, agent) {
  await env.DB.prepare(
    `INSERT INTO visits (date, country, region, kind, agent, n) VALUES (?1, ?2, ?3, ?4, ?5, 1)
     ON CONFLICT (date, country, region, kind, agent) DO UPDATE SET n = n + 1`
  )
    .bind(today(), p.country, p.region, kind, agent)
    .run();
}

function json(data, init = {}) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

async function stats(env) {
  const now = Date.now();
  if (statsCache.body && now - statsCache.at < STATS_TTL * 1000) return statsCache.body;
  const [rows, totals, daily] = await env.DB.batch([
    // Every row, for the date slider.
    env.DB.prepare(
      `SELECT date, country, region, kind, agent, n FROM visits ORDER BY date`
    ),
    // Totals per country, region, kind and agent.
    env.DB.prepare(
      `SELECT country, region, kind, agent, SUM(n) AS n FROM visits
       GROUP BY country, region, kind, agent ORDER BY n DESC`
    ),
    // Totals per day and kind.
    env.DB.prepare(`SELECT date, kind, SUM(n) AS n FROM visits GROUP BY date, kind ORDER BY date`),
  ]);
  const body = JSON.stringify({
    updated: new Date(now).toISOString(),
    rows: rows.results.map((r) => [r.date, r.country, r.region, r.kind, r.agent, r.n]),
    totals: totals.results,
    daily: daily.results,
  });
  statsCache = { at: now, body };
  return body;
}

function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/stats') {
      if (request.method !== 'GET') return new Response(null, { status: 405 });
      return json(await stats(env), {
        headers: { 'cache-control': `public, max-age=${STATS_TTL}` },
      });
    }

    if (path === '/api/hello') {
      const p = place(request);
      const who = classify(request.headers.get('user-agent'));
      let counted = false;
      if (request.method === 'POST') {
        if (!sameOrigin(request, url)) return new Response(null, { status: 403 });
        // Requests that identify as machines are not counted as people.
        if (who.kind === 'human') {
          await count(env, p, 'human', '');
          statsCache.at = 0;
          counted = true;
        }
      } else if (request.method !== 'GET') {
        return new Response(null, { status: 405 });
      }
      return json(
        { country: p.country, region: p.region, regionName: p.regionName, kind: who.kind, counted },
        { headers: { 'cache-control': 'no-store' } }
      );
    }

    if (path.startsWith('/api/')) return json({ error: 'not found' }, { status: 404 });

    const res = await env.ASSETS.fetch(request);
    const type = res.headers.get('content-type') || '';
    if (request.method === 'GET' && res.ok && type.includes('text/html')) {
      const who = classify(request.headers.get('user-agent'));
      if (who.kind !== 'human') ctx.waitUntil(count(env, place(request), who.kind, who.agent).catch(() => {}));
    }
    return res;
  },
};
