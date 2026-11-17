#!/usr/bin/env node
/* Cache-buster bump for every asset changed since a base commit (default: the last pushed one).
     node scripts/bump-versions.js [base]
   Bumps ?v= on every reference in pages, scripts and the data-page template, and repeats until
   stable: an asset whose content changed only because a reference inside it was bumped (e.g.
   copilot.js loading copilot.css) gets bumped too, so no browser serves a stale chain. */
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sh = c => execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const base = process.argv[2] || '@{u}';
const files = sh('git ls-files "*.html" "assets/*.js" "scripts/gen-pages.js"').trim().split('\n')
  .concat(sh('git ls-files --others --exclude-standard "*.html" "assets/*.js"').trim().split('\n'))
  .filter(f => f && !/^neon-miner\//.test(f));
const RE = /\/assets\/([A-Za-z0-9._-]+\.(?:css|js))\?v=(\d+)/g;
const changed = () => new Set(sh(`git diff --name-only ${base} -- assets`).trim().split('\n')
  .concat(sh('git ls-files --others --exclude-standard assets').trim().split('\n'))
  .filter(Boolean).map(f => f.replace(/^assets\//, '')).filter(a => /\.(css|js)$/.test(a)));
const old = {};
for (const f of files) { let s; try { s = sh(`git show ${base}:${f}`); } catch (e) { continue; } for (const x of s.matchAll(RE)) old[x[1]] = Math.max(old[x[1]] || 0, +x[2]); }
let total = 0;
for (let pass = 0; pass < 6; pass++) {
  const ch = changed(); let n = 0;
  for (const f of files) {
    const p = path.join(ROOT, f), s = fs.readFileSync(p, 'utf8');
    const t = s.replace(RE, (m, a, v) => (ch.has(a) && +v <= (old[a] || 0)) ? (n++, `/assets/${a}?v=${(old[a] || 0) + 1}`) : m);
    if (t !== s) fs.writeFileSync(p, t);
  }
  total += n; if (!n) break;
}
console.log(`bumped ${total} reference(s) against ${base}`);
