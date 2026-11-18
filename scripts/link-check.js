#!/usr/bin/env node
/* Internal link check (LAUNCH.md gate G17): every internal href/src in every committed site page (EN + ES/FR/DE)
   must resolve to a file GitHub Pages will serve, using its rules: /x → x.html or x/index.html, /x/ → x/index.html.
   Query strings and #fragments are ignored; external, mailto:, tel:, data: and javascript: links are skipped.
   Links built at runtime by scripts aren't seen (the URL check and screenshot passes cover those).
     node scripts/link-check.js          exit 1 on any broken link */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const files = execSync("git ls-files '*.html'", { cwd: ROOT }).toString().split('\n')
  .filter(f => f && !/node_modules\/|^neon-miner\/|^tests\/|^locales\/|^gomining-calc\//.test(f));
const exists = p => { try { return fs.statSync(path.join(ROOT, p)).isFile(); } catch (e) { return false; } };
function resolves(url) {
  let p = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (!p || p === '/') return exists('index.html');
  p = p.replace(/^\//, '');
  if (p.endsWith('/')) return exists(p + 'index.html');
  return exists(p) || exists(p + '.html') || exists(p + '/index.html');
}
const bad = [];
let n = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => /\bsrc=/.test(m.slice(0, m.indexOf('>'))) ? m.slice(0, m.indexOf('>') + 1) : '');
  const base = '/' + path.posix.dirname(f).replace(/^\.$/, '') + '/';
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    let u = m[1].trim();
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(u) || u.includes('${') || u.includes('{{')) continue;
    if (!u.startsWith('/')) u = path.posix.normalize(base.replace(/\/+/g, '/') + u);
    n++;
    if (!resolves(u)) bad.push(f + '  →  ' + m[1]);
  }
}
const uniq = [...new Set(bad)];
console.log(`link-check: ${files.length} pages, ${n} internal links`);
uniq.slice(0, 60).forEach(b => console.log('  BROKEN ' + b));
console.log(uniq.length ? `${uniq.length} broken link(s)` : 'no broken internal links');
process.exit(uniq.length ? 1 : 0);
