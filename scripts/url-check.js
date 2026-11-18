#!/usr/bin/env node
/* URL check (Phase 8, LAUNCH.md gate G6): every URL frozen in URLS.md must answer the same way.
   ============================================================================================
     node scripts/url-check.js https://ringoshitoitsu1.github.io      (the preview)
     node scripts/url-check.js https://gmt-optimizer.com               (production, after the merge)
   Checks, per row of URLS.md:
     A/B/D/F  status code; for 301s the redirect target; "noindex" where the robots column says so
     C        200 + a meta refresh (old tool URLs that open a console view)
     E        404 (approved removals)
     G        /neon-miner/ 200 + meta refresh to /
     retired  rows marked "redirect page → `/x`": 200 + meta refresh to /x
   plus every URL in sitemap.xml (200, or 301 to its trailing-slash form for folder pages).
   On the preview host /CNAME is skipped (the preview build strips it on purpose).
   No dependencies; Node 18+ (global fetch). Exit code 1 on any failure. */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BASE)) { console.error('usage: node scripts/url-check.js <base-url>'); process.exit(2); }
const PREVIEW = !/gmt-optimizer\.com$/.test(new URL(BASE).host);
const md = fs.readFileSync(path.join(__dirname, '..', 'URLS.md'), 'utf8');

// ---- parse URLS.md into checks ----
const checks = [];
let section = '';
for (const line of md.split('\n')) {
  const h = line.match(/^## ([A-Z])\. /);
  if (h) { section = h[1]; continue; }
  const m = line.match(/^\| `(\/[^`]*)` \|([^|]*)\|([^|]*)\|([^|]*)\|/);
  if (!m || !/[A-G]/.test(section)) continue;
  const url = m[1], live = m[2].trim(), c3 = m[3].trim(), c4 = m[4].trim();
  if (section === 'E') { checks.push({ url, section, status: 404 }); continue; }
  const st = +(live.match(/^(\d{3})/) || [])[1];
  if (!st) continue;
  const c = { url, section, status: st };
  const to = live.match(/^30\d → `([^`]+)`/); if (to) c.location = to[1];
  const rp = live.match(/redirect page → `([^`]+)`/); if (rp) c.refresh = rp[1];
  if (section === 'C') c.refresh = c.refresh || '*';
  const robots = section === 'E' ? '' : c4;
  if (/noindex/.test(robots)) c.noindex = true;
  if (url === '/CNAME' && PREVIEW) continue;
  checks.push(c);
}
if (/## G\./.test(md)) checks.push({ url: '/neon-miner/', section: 'G', status: 200, refresh: '/' });

// ---- sitemap URLs (incl. the ES/FR/DE copies) ----
const sm = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');
const seen = new Set(checks.map(c => c.url));
for (const loc of sm.match(/<loc>[^<]+<\/loc>/g) || []) {
  const u = new URL(loc.slice(5, -6)).pathname;
  if (!seen.has(u)) { seen.add(u); checks.push({ url: u, section: 'sitemap', status: 'page' }); }
}

// ---- run ----
async function one(c) {
  const target = BASE + c.url;
  let r, body = '';
  try {
    r = await fetch(target, { redirect: 'manual', headers: { 'user-agent': 'gmt-optimizer-url-check' } });
    if (r.status === 200 && /html|text/.test(r.headers.get('content-type') || '')) body = await r.text();
  } catch (e) { return { c, ok: false, why: 'fetch failed: ' + e.message }; }
  const loc = r.headers.get('location') ? new URL(r.headers.get('location'), target).pathname : '';
  const why = [];
  if (c.status === 'page') {
    const ok = r.status === 200 || (r.status === 301 && loc === c.url + '/');
    if (!ok) why.push(`expected 200 (or 301 → ${c.url}/), got ${r.status}${loc ? ' → ' + loc : ''}`);
  } else {
    if (r.status !== c.status) why.push(`expected ${c.status}, got ${r.status}${loc ? ' → ' + loc : ''}`);
    if (c.location && loc !== c.location) why.push(`expected → ${c.location}, got → ${loc || '(none)'}`);
  }
  if (c.refresh && r.status === 200) {
    const mr = body.match(/http-equiv="refresh" content="\d+;\s*url=([^"]+)"/i);
    const got = mr ? new URL(mr[1], target).pathname : '';
    if (!mr) why.push('expected a meta refresh, found none');
    else if (c.refresh !== '*' && got !== c.refresh) why.push(`expected refresh → ${c.refresh}, got → ${got}`);
  }
  if (c.noindex && r.status === 200 && body && !/name="robots" content="[^"]*noindex/i.test(body)) why.push('expected noindex');
  return { c, ok: !why.length, why: why.join('; '), status: r.status };
}

(async () => {
  const results = [];
  const queue = checks.slice();
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) results.push(await one(queue.shift())); }));
  const bad = results.filter(r => !r.ok);
  const by = {};
  results.forEach(r => { by[r.c.section] = (by[r.c.section] || 0) + 1; });
  console.log(`url-check ${BASE}${PREVIEW ? ' (preview: /CNAME skipped)' : ''}: ${results.length} URLs`,
    Object.entries(by).map(([k, v]) => k + ':' + v).join(' '));
  bad.sort((a, b) => a.c.url.localeCompare(b.c.url)).forEach(r => console.log(`  FAIL [${r.c.section}] ${r.c.url}  ${r.why}`));
  console.log(bad.length ? `${bad.length} failure(s)` : 'all URLs answer as frozen in URLS.md');
  process.exit(bad.length ? 1 : 0);
})();
