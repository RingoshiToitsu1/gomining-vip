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
   Gate G16 (indexability, LAUNCH.md), blocking before and after launch:
     - no page is noindex (meta robots or X-Robots-Tag) unless it is on NOINDEX_OK below;
     - robots.txt has no "Disallow: /" line;
     - canonical / hreflang / og:url point at https://gmt-optimizer.com, never the preview host;
     - production only: robots.txt and 5 key pages fetched live and checked.
   The preview build stamps noindex on every page and Disallow: / in robots.txt by design, so against the
   preview G16 checks the BUILD (the committed files that production will serve) instead of the responses.
   No dependencies; Node 18+ (global fetch). Exit code 1 on any failure. */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(BASE)) { console.error('usage: node scripts/url-check.js <base-url>'); process.exit(2); }
const PREVIEW = !/gmt-optimizer\.com$/.test(new URL(BASE).host);
const ROOT = path.join(__dirname, '..');
const md = fs.readFileSync(path.join(ROOT, 'URLS.md'), 'utf8');

// Pages allowed to be noindex (G16). Everything else must be indexable.
//   owner's list: /odds, /styleguide, /carbon/ (gone, 404) and the retired redirect pages (noindex,follow);
//   already noindex on the live site today and unchanged: /quote, /statement, /edit, /embed, /chat,
//   /redesign-prototype; new account pages (login, signup, profile, settings, dashboard) and their ES/FR/DE copies.
const NOINDEX_OK = [/^\/odds(\/|$)/, /^\/styleguide(\/|$)/, /^\/carbon(\/|$)/,
  /^\/gomining-optimizer(\.html)?$/, /^\/gomining-vip-index(\.html)?$/, /^\/neon-miner(\/|$)/,
  /^\/(es\/|fr\/|de\/)?(quote|statement|edit|embed|chat|login|signup|profile|settings|dashboard)(\/|\.html|$)/,
  /^\/redesign-prototype(\.html)?$/];
const noindexOk = p => NOINDEX_OK.some(re => re.test(p));
const KEY_PAGES = ['/', '/console', '/gomining-roi-calculator', '/is-gomining-worth-it', '/es/'];
const PROD = 'https://gmt-optimizer.com';

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
  if (!PREVIEW && r.status === 200) {
    const xr = r.headers.get('x-robots-tag') || '';
    const meta = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(body);
    if ((meta || /noindex/i.test(xr)) && !noindexOk(c.url)) why.push('G16: noindex on a page that must be indexable' + (xr ? ' (X-Robots-Tag: ' + xr + ')' : ''));
  }
  return { c, ok: !why.length, why: why.join('; '), status: r.status };
}

// ---- G16: indexability ----
function headOf(html) { const i = html.search(/<\/head>/i); return i > 0 ? html.slice(0, i) : html.slice(0, 20000); }
function hostProblems(html, where) {
  const why = [];
  const h = headOf(html);
  for (const m of h.matchAll(/<link[^>]+rel="(canonical|alternate)"[^>]*>/gi)) {
    const href = (m[0].match(/href="([^"]+)"/) || [])[1];
    if (href && /^https?:/.test(href) && !href.startsWith(PROD + '/') && href !== PROD) why.push(m[1] + ' → ' + href);
  }
  const og = (h.match(/property="og:url" content="([^"]+)"/) || [])[1];
  if (og && !og.startsWith(PROD)) why.push('og:url → ' + og);
  if (/ringoshitoitsu1\.github\.io/.test(h.replace(/<meta name="robots"[^>]*>/g, ''))) why.push('preview host in <head>');
  return why.length ? 'G16 (' + where + '): ' + why.join(', ') : '';
}
async function g16() {
  const out = [];
  const push = (url, why) => out.push({ c: { url, section: 'G16' }, ok: !why, why: why || '' });
  if (PREVIEW) {
    // the build: every committed HTML page (the files production will serve) and robots.txt
    const files = require('child_process').execSync("git ls-files '*.html'", { cwd: ROOT }).toString().split('\n')
      .filter(f => f && !/node_modules\/|^tests\/|^locales\/|^gomining-calc\/|^ob_research_dashboard/.test(f));
    let n = 0;
    for (const f of files) {
      const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const url = '/' + f.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
      const why = [];
      if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(headOf(html)) && !noindexOk(url)) why.push('G16 (build): noindex on a page that must be indexable');
      const hp = hostProblems(html, 'build'); if (hp) why.push(hp);
      if (why.length) push(url, why.join('; ')); else n++;
    }
    out.push({ c: { url: '(build: ' + n + ' HTML files clean)', section: 'G16' }, ok: true });
    const rb = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
    push('/robots.txt (build)', /^\s*Disallow:\s*\/\s*$/mi.test(rb) ? 'G16: robots.txt contains "Disallow: /"' : '');
  } else {
    const r = await fetch(BASE + '/robots.txt'); const rb = await r.text();
    push('/robots.txt (live)', r.status !== 200 ? 'G16: robots.txt answered ' + r.status : /^\s*Disallow:\s*\/\s*$/mi.test(rb) ? 'G16: robots.txt contains "Disallow: /"' : '');
    for (const p of KEY_PAGES) {
      let res = await fetch(BASE + p, { redirect: 'follow', headers: { 'user-agent': 'gmt-optimizer-url-check' } });
      const html = await res.text(); const why = [];
      if (res.status !== 200) why.push('G16: key page answered ' + res.status);
      if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(headOf(html)) || /noindex/i.test(res.headers.get('x-robots-tag') || '')) why.push('G16: key page is noindex');
      if (!/rel="canonical"/.test(headOf(html))) why.push('G16: no canonical');
      if (!/hreflang="x-default"/.test(headOf(html))) why.push('G16: no hreflang block');
      const hp = hostProblems(html, 'live'); if (hp) why.push(hp);
      push(p + ' (key page)', why.join('; '));
    }
  }
  return out;
}

(async () => {
  const results = [];
  const queue = checks.slice();
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) results.push(await one(queue.shift())); }));
  results.push(...await g16());
  const bad = results.filter(r => !r.ok);
  const by = {};
  results.forEach(r => { by[r.c.section] = (by[r.c.section] || 0) + 1; });
  console.log(`url-check ${BASE}${PREVIEW ? ' (preview: /CNAME skipped)' : ''}: ${results.length} URLs`,
    Object.entries(by).map(([k, v]) => k + ':' + v).join(' '));
  bad.sort((a, b) => a.c.url.localeCompare(b.c.url)).forEach(r => console.log(`  FAIL [${r.c.section}] ${r.c.url}  ${r.why}`));
  console.log(bad.length ? `${bad.length} failure(s)` : 'all URLs answer as frozen in URLS.md');
  process.exit(bad.length ? 1 : 0);
})();
