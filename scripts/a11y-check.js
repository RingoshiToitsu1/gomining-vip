#!/usr/bin/env node
/* Static accessibility check (LAUNCH.md gate G18) over the committed site pages (EN + ES/FR/DE). No browser:
   it reads the HTML as written, so content that scripts build at runtime is not covered (the screenshot passes are).
   Checks: <html lang>; one <h1> and the first heading is an h1; <img> has alt; form fields have a label
   (<label for>, wrapping <label>, aria-label or aria-labelledby, title, or placeholder as last resort);
   buttons and links have a name (text, aria-label or title); no duplicate ids.
     node scripts/a11y-check.js        exit 1 on any error (warnings are listed, not failing) */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const files = execSync("git ls-files '*.html'", { cwd: ROOT }).toString().split('\n')
  .filter(f => f && !/node_modules\/|^neon-miner\/|^tests\/|^locales\/|^gomining-calc\/|^ob_research_dashboard|^styleguide\//.test(f));
const strip = s => s.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const text = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;/g, 'x').trim();
const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '="([^"]*)"', 'i')); return m ? m[1] : null; };
const errors = [], warns = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/http-equiv="refresh"/i.test(raw)) continue;                       // redirect stubs
  const h = strip(raw);
  const E = msg => errors.push(f + ': ' + msg), W = msg => warns.push(f + ': ' + msg);
  if (!/<html[^>]*\slang="[a-z]{2}/i.test(raw)) E('<html> has no lang');
  const h1 = (h.match(/<h1[\s>]/gi) || []).length;
  if (h1 === 0) W('no <h1> in the HTML (may be built by script)'); else if (h1 > 1) W(h1 + ' <h1> elements');
  const firstH = (h.match(/<h([1-6])[\s>]/i) || [])[1];
  if (firstH && firstH !== '1' && h1) W('first heading is h' + firstH);
  for (const m of h.matchAll(/<img\b[^>]*>/gi)) if (attr(m[0], 'alt') === null) E('img without alt: ' + m[0].slice(0, 90));
  const labelsFor = new Set([...h.matchAll(/<label\b[^>]*\sfor="([^"]+)"/gi)].map(m => m[1]));
  for (const m of h.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const tag = m[0], type = (attr(tag, 'type') || '').toLowerCase();
    if (/^(hidden|submit|button|reset|image)$/.test(type)) continue;
    // not exposed to assistive tech: hidden attribute, aria-hidden, or a script-only state field (tabindex=-1 inside a hidden block)
    if (/\shidden(\s|>|=)/i.test(tag) || attr(tag, 'aria-hidden') === 'true') continue;
    // inside a block that is hidden from assistive tech (style display:none, hidden or aria-hidden="true")
    const pre = h.slice(Math.max(0, m.index - 1500), m.index);
    let hiddenBlock = false, depth = 0;
    const tags = [...pre.matchAll(/<(\/?)div\b([^>]*)>/gi)].reverse();
    for (const t of tags) {
      if (t[1]) { depth++; continue; }
      if (depth > 0) { depth--; continue; }
      if (/display:\s*none|\shidden(\s|>|=|$)|aria-hidden="true"/i.test(t[2])) { hiddenBlock = true; break; }
    }
    if (hiddenBlock) continue;
    const id = attr(tag, 'id');
    const before = h.slice(Math.max(0, m.index - 600), m.index);
    const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
    if ((id && labelsFor.has(id)) || wrapped || attr(tag, 'aria-label') || attr(tag, 'aria-labelledby') || attr(tag, 'title')) continue;
    if (attr(tag, 'placeholder')) W('field labelled only by placeholder: ' + tag.slice(0, 90)); else E('form field without a label: ' + tag.slice(0, 90));
  }
  for (const m of h.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const open = '<' + m[1] + m[2] + '>';
    if (m[1].toLowerCase() === 'a' && attr(open, 'href') === null) continue;
    const inner = m[3];
    const name = text(inner) || attr(open, 'aria-label') || attr(open, 'title') || [...inner.matchAll(/<img\b[^>]*>/gi)].map(i => attr(i[0], 'alt')).filter(Boolean).join('') || (/aria-label="[^"]+"/.test(inner) ? 'x' : '');
    if (!name) E(m[1] + ' without an accessible name: ' + open.slice(0, 90));
  }
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
  if (dup.length) E('duplicate ids: ' + dup.slice(0, 6).join(', '));
}
const show = (list, label) => { const by = {}; list.forEach(l => { const k = l.replace(/^[^:]+: /, '').replace(/:.*$/, ''); (by[k] = by[k] || []).push(l); });
  Object.entries(by).forEach(([k, v]) => { console.log(`  ${label} ${k} (${v.length})`); v.slice(0, process.env.A11Y_ALL ? 1e9 : 4).forEach(x => console.log('      ' + x.slice(0, 200))); }); };
console.log(`a11y-check: ${files.length} pages`);
show(errors, 'ERROR'); show(warns, 'warn ');
console.log(errors.length ? `${errors.length} error(s)` : 'no errors' + (warns.length ? `, ${warns.length} warning(s)` : ''));
process.exit(errors.length ? 1 : 0);
