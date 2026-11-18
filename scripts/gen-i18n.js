#!/usr/bin/env node
/* GMT-Optimizer translations: writes /es/…, /fr/…, /de/… copies of English pages.
   ===============================================================================
     node scripts/gen-i18n.js            build every page listed in locales/pages.json, all languages
     node scripts/gen-i18n.js --extract index.html   print the English text runs of a page (as JSON)
     node scripts/gen-i18n.js --missing  list text runs with no translation yet, per language
     node scripts/gen-i18n.js --check    exit 1 if a build would change any file (CI)
     node scripts/gen-i18n.js --prune    remove translations that no listed page uses any more

   English pages stay the source and stay where they are. For each listed page the generator:
     • splits the page into text runs (text plus inline markup, split at block elements) and looks each
       one up in locales/<lang>.json → { "strings": { "<English run>": "<translation>" } };
       a run with no translation stays English and is reported by --missing;
     • translates the useful attributes (meta description, og/twitter text, alt, title, aria-label,
       placeholder) and the string values of JSON-LD;
     • sets <html lang>, the canonical and og:url, and points internal links at the same language
       when that page exists in it;
     • writes the file at the same shape (/claim/index.html → /es/claim/index.html, /copilot.html →
       /es/copilot.html), so the new URLs behave like the English ones on GitHub Pages;
     • keeps an hreflang block (en/es/fr/de + x-default) up to date in the English page and every copy.
   No dependencies. The parser round-trips every page byte for byte (checked on each run).
*/
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SITE = 'https://gmt-optimizer.com';
const LANGS = ['es', 'fr', 'de'];
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------------------------------------------------------------- a tiny, lossless HTML parser
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
function parse(src) {
  const root = { type: 'root', children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let i = 0, m;
  const top = () => stack[stack.length - 1];
  const text = t => { if (t) top().children.push({ type: 'text', raw: t }); };
  while ((m = re.exec(src))) {
    text(src.slice(i, m.index)); i = re.lastIndex;
    if (m[0].startsWith('<!')) { top().children.push({ type: 'raw', raw: m[0] }); continue; }
    if (m[1]) {   // end tag
      const name = m[1].toLowerCase();
      let k = stack.length - 1; while (k > 0 && stack[k].name !== name) k--;
      if (k === 0) { top().children.push({ type: 'raw', raw: m[0] }); continue; }   // stray end tag: keep as-is
      while (stack.length - 1 > k) stack.pop();                                     // implicitly closed children
      stack.pop().end = m[0];
      continue;
    }
    const name = m[2].toLowerCase();
    const el = { type: 'el', name, start: m[0], attrsRaw: m[3] || '', children: [], end: '' };
    top().children.push(el);
    if (VOID.has(name) || m[4]) continue;
    if (RAW.has(name)) {   // raw text up to the matching end tag
      const close = new RegExp('</' + name + '\\s*>', 'ig'); close.lastIndex = i;
      const c = close.exec(src);
      const body = src.slice(i, c ? c.index : src.length);
      if (body) el.children.push({ type: 'text', raw: body, rawText: true });
      el.end = c ? c[0] : ''; i = c ? close.lastIndex : src.length; re.lastIndex = i;
      continue;
    }
    stack.push(el);
  }
  text(src.slice(i));
  return root;
}
const ser = n => n.type === 'root' ? n.children.map(ser).join('')
  : n.type === 'el' ? n.start + n.children.map(ser).join('') + n.end : n.raw;

const attr = (el, a) => { const m = el.start.match(new RegExp('\\s' + a + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] != null ? m[2] : m[3]) : null; };
function setAttr(el, a, v) {
  const r = new RegExp('(\\s' + a + '\\s*=\\s*)("[^"]*"|\'[^\']*\')', 'i');
  if (r.test(el.start)) el.start = el.start.replace(r, (x, p) => p + '"' + v.replace(/"/g, '&quot;') + '"');
  else el.start = el.start.replace(/^<([\w-]+)/, '<$1 ' + a + '="' + v.replace(/"/g, '&quot;') + '"');
}

// ---------------------------------------------------------------- text runs
// Inline elements stay inside a run (translators see "<a href=…>link</a>" in context). An inline element
// that contains a block element is treated as a block. Everything else breaks runs.
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'br', 'cite', 'code', 'data', 'em', 'i', 'kbd', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'wbr', 'img']);
const SKIP = new Set(['script', 'style', 'svg', 'noscript', 'code', 'pre', 'template', 'textarea']);
const hasBlock = n => n.type === 'el' && (!INLINE.has(n.name) || n.children.some(hasBlock));
const isInline = n => n.type === 'text' || (n.type === 'el' && INLINE.has(n.name) && !n.children.some(hasBlock));
const hasWords = s => /[A-Za-z]{2,}/.test(s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ''));
const notranslate = el => /\bnotranslate\b/.test(attr(el, 'class') || '') || attr(el, 'translate') === 'no';
function runs(node, out) {   // collects { parent, from, to } ranges of inline children holding words
  if (node.type !== 'el' && node.type !== 'root') return;
  if (node.type === 'el' && (SKIP.has(node.name) || notranslate(node))) return;
  const ch = node.children;
  let s = -1;
  const flush = e => {
    if (s < 0) return;
    const html = ch.slice(s, e).map(ser).join('');
    if (hasWords(html)) out.push({ parent: node, from: s, to: e });
    s = -1;
  };
  for (let k = 0; k < ch.length; k++) {
    if (isInline(ch[k]) && !(ch[k].type === 'el' && notranslate(ch[k]))) { if (s < 0) s = k; }
    else { flush(k); runs(ch[k], out); }
  }
  flush(ch.length);
}
// A run's key is its trimmed HTML with whitespace collapsed; the original leading/trailing space is kept.
const keyOf = html => html.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- attributes and JSON-LD
const META_TEXT = /^(description|og:title|og:description|og:image:alt|twitter:title|twitter:description|twitter:image:alt)$/;
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
function attrTargets(root, out) {
  (function walk(n) {
    if (n.type !== 'el') { if (n.children) n.children.forEach(walk); return; }
    if (n.name === 'meta') {
      const k = attr(n, 'name') || attr(n, 'property');
      if (k && META_TEXT.test(k) && hasWords(attr(n, 'content') || '')) out.push({ el: n, a: 'content' });
    }
    if (!SKIP.has(n.name) || n.name === 'svg') ATTRS.forEach(a => { const v = attr(n, a); if (v && hasWords(v)) out.push({ el: n, a }); });
    n.children.forEach(walk);
  })(root);
}
const LD_KEYS = /^(name|text|description|headline|alternateName|about)$/;
function ldStrings(obj, fn) {
  if (Array.isArray(obj)) return obj.map(x => ldStrings(x, fn));
  if (obj && typeof obj === 'object') { const o = {}; for (const k of Object.keys(obj)) o[k] = (typeof obj[k] === 'string' && LD_KEYS.test(k)) ? fn(obj[k]) : ldStrings(obj[k], fn); return o; }
  return obj;
}
function ldTargets(root, out) {
  (function walk(n) {
    if (n.type === 'el' && n.name === 'script' && /ld\+json/.test(attr(n, 'type') || '') && n.children[0]) out.push(n);
    if (n.children) n.children.forEach(walk);
  })(root);
}

// ---------------------------------------------------------------- pages, URLs, links
const PJ = JSON.parse(read('locales/pages.json'));
const pages = PJ.pages;                                              // English source files to mirror
const generated = PJ.generated || [];                               // written in every language by gen-pages.js
const noSitemap = new Set(PJ.noSitemap || []);
const DOM_PAGES = new Set(PJ.dom || []);           // pages translated at runtime by assets/i18n-dom.js (the console)
const urlOf = f => '/' + f.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');   // index.html → /, claim/index.html → /claim/, copilot.html → /copilot
const pretty = u => u === '/' ? '/' : u.replace(/\/$/, '');             // canonical style used on the site (no trailing slash)
const outFile = (lang, f) => lang + '/' + f;
const exists = new Set(pages.concat(generated).map(urlOf).map(pretty));
function localHref(lang, href) {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return href;
  const m = href.match(/^([^?#]*)(.*)$/), p = pretty(m[1].replace(/\.html$/, '') || '/');
  if (!exists.has(p)) return href;
  return '/' + lang + (p === '/' ? '/' : p + (m[1].endsWith('/') && p !== '/' ? '/' : '')) + m[2];
}
function alternatesHTML(f) {
  const u = pretty(urlOf(f));
  const href = l => SITE + (l === 'en' ? u : '/' + l + (u === '/' ? '/' : u));
  return '<!-- i18n:alternates (scripts/gen-i18n.js) -->\n' +
    ['en', ...LANGS].map(l => '<link rel="alternate" hreflang="' + l + '" href="' + href(l) + '">').join('\n') +
    '\n<link rel="alternate" hreflang="x-default" href="' + href('en') + '">\n<!-- /i18n:alternates -->';
}
function putAlternates(src, f) {
  const block = alternatesHTML(f);
  if (src.includes('<!-- i18n:alternates')) return src.replace(/<!-- i18n:alternates[\s\S]*?<!-- \/i18n:alternates -->/, block);
  return src.replace(/(<link rel="canonical"[^>]*>)/, '$1\n' + block);
}

// ---------------------------------------------------------------- build one page in one language
function build(f, lang, dict, missing) {
  let src = read(f);
  // <!-- LIVE:name --> blocks hold numbers gen-pages.js rewrites on every run; its es/fr/de versions live in
  // locales/live/<lang>/<name>.html. Swap them in after translating (placeholders keep them out of the lookup).
  const live = {};
  src = src.replace(/(<!-- LIVE:([\w-]+)[^>]*-->)[\s\S]*?(<!-- \/LIVE:\2 -->)/g, (m, open, name, close) => {
    const p = path.join(ROOT, 'locales/live', lang, name + '.html');
    if (!fs.existsSync(p)) return m;
    live[name] = fs.readFileSync(p, 'utf8');
    return open + '<!--i18n-live:' + name + '-->' + close;
  });
  const tree = parse(src);
  if (ser(tree) !== src) throw new Error('parser did not round-trip ' + f);
  const tr = s => {
    const k = keyOf(s);
    USED.add(k);
    if (Object.prototype.hasOwnProperty.call(dict, k)) return dict[k];
    missing.add(k); return s;
  };
  const rs = []; runs(tree, rs);
  // Last to first: replacing a run collapses its nodes into one, which would shift the indices of any later
  // run under the same parent.
  for (const r of rs.slice().reverse()) {
    const ch = r.parent.children, html = ch.slice(r.from, r.to).map(ser).join('');
    const lead = html.match(/^\s*/)[0], trail = html.match(/\s*$/)[0];
    let t = tr(html);
    if (t === html) continue;
    t = t.replace(/(\shref=")([^"]*)"/g, (m, p, h) => p + localHref(lang, h) + '"');   // links inside the run follow the language too
    ch.splice(r.from, r.to - r.from, { type: 'text', raw: lead + t + trail });
  }
  const at = []; attrTargets(tree, at);
  for (const { el, a } of at) { const v = attr(el, a); const t = tr(v); if (t !== v) setAttr(el, a, t); }
  const ld = []; ldTargets(tree, ld);
  for (const s of ld) {
    try { const j = JSON.parse(s.children[0].raw); s.children[0].raw = JSON.stringify(ldStrings(j, tr), null, 1) + '\n'; } catch (e) { /* leave invalid JSON-LD alone */ }
  }
  // <html lang>, canonical, og:url, internal links
  (function walk(n) {
    if (n.type === 'el') {
      if (n.name === 'html') setAttr(n, 'lang', lang);
      if (n.name === 'link' && attr(n, 'rel') === 'canonical') setAttr(n, 'href', SITE + '/' + lang + (pretty(urlOf(f)) === '/' ? '/' : pretty(urlOf(f))));
      if (n.name === 'meta' && attr(n, 'property') === 'og:url') setAttr(n, 'content', SITE + '/' + lang + (pretty(urlOf(f)) === '/' ? '/' : pretty(urlOf(f))));
      if (n.name === 'a') { const h = attr(n, 'href'); const l = localHref(lang, h); if (l !== h) setAttr(n, 'href', l); }
    }
    if (n.children) n.children.forEach(walk);
  })(tree);
  let out = ser(tree);
  // redirect stubs (/planner → /console?view=planner): meta refresh and location.replace targets follow the language
  out = out.replace(/(http-equiv="refresh" content="\d+;\s*url=)(\/[^"]*)"/g, (m, p, h) => p + localHref(lang, h) + '"')
           .replace(/(location\.replace\(')(\/[^']*)'/g, (m, p, h) => p + localHref(lang, h) + "'");
  out = out.replace(/<!--i18n-live:([\w-]+)-->/g, (m, name) => '\n' + live[name] + '\n  ');
  out = putAlternates(out, f);
  out = out.replace(/(<head[^>]*>)/, '$1\n<!-- Generated by scripts/gen-i18n.js from /' + f + '. Edit the English page or locales/' + lang + '.json, not this file. -->' +
    '\n<script src="/assets/i18n/' + lang + '.js?h=' + UI_HASH[lang] + '"></script>' +
    (DOM_PAGES.has(f) ? '\n<script src="/assets/i18n-dom.js?v=3"></script>' : ''));
  return out;
}

// ---------------------------------------------------------------- CLI
const arg = process.argv[2];
if (arg === '--extract') {
  const f = process.argv[3], tree = parse(read(f)); const rs = []; runs(tree, rs);
  const keys = new Set(rs.map(r => keyOf(r.parent.children.slice(r.from, r.to).map(ser).join(''))));
  const at = []; attrTargets(tree, at); at.forEach(({ el, a }) => keys.add(keyOf(attr(el, a))));
  const ld = []; ldTargets(tree, ld); ld.forEach(s => { try { ldStrings(JSON.parse(s.children[0].raw), v => (keys.add(keyOf(v)), v)); } catch (e) {} });
  console.log(JSON.stringify([...keys], null, 1));
  process.exit(0);
}
const USED = new Set();
// UI strings for JavaScript-drawn interfaces (account pages, chat, checker…): locales/<lang>.json "ui", keyed by the
// English text, compiled into assets/i18n/<lang>.js. Scripts call GMT_UI.t('English text', arg0, arg1…) with {0},{1}
// placeholders, and GMT_UI.L('/path') for same-language links. English pages never load this file.
const UI_HASH = {};
function uiFile(lang) {
  const J = JSON.parse(read('locales/' + lang + '.json')), d = J.ui || {}, dom = J.dom || {};
  return '/* Generated by scripts/gen-i18n.js from locales/' + lang + '.json "ui". Do not edit. */\n' +
    '(function(){var S=' + JSON.stringify(d) + ',P=' + JSON.stringify([...new Set(pages.concat(generated).map(urlOf).map(pretty))]) + ';\n' +
    'window.GMT_UI={lang:' + JSON.stringify(lang) + ',dom:' + JSON.stringify(dom) + ',t:function(s){var v=Object.prototype.hasOwnProperty.call(S,s)?S[s]:s,a=arguments;return v.replace(/\\{(\\d)\\}/g,function(m,i){return a[+i+1]!=null?a[+i+1]:m;});},\n' +
    'L:function(h){if(!h||h.charAt(0)!=="/"||h.charAt(1)==="/")return h;var m=h.match(/^([^?#]*)(.*)$/),p=m[1].replace(/\\/$/,"")||"/";return P.indexOf(p)>=0?"/"+' + JSON.stringify(lang) + '+(p==="/"?"/":p)+m[2]:h;}};})();\n';
}
for (const l of ['es', 'fr', 'de']) {
  const body = uiFile(l), dest = path.join(ROOT, 'assets/i18n/' + l + '.js');
  UI_HASH[l] = require('crypto').createHash('sha1').update(body).digest('hex').slice(0, 8);
  const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  if (prev !== body && !['--check', '--missing', '--prune', '--extract'].includes(process.argv[2])) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, body); }
  if (prev !== body && process.argv[2] === '--check') { console.log('assets/i18n/' + l + '.js out of date'); process.exitCode = 1; }
}
const dicts = Object.fromEntries(LANGS.map(l => [l, JSON.parse(read('locales/' + l + '.json')).strings]));
let changed = 0; const report = {};
for (const lang of LANGS) {
  const missing = new Set();
  for (const f of pages) {
    const out = build(f, lang, dicts[lang], missing);
    const dest = path.join(ROOT, outFile(lang, f));
    const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (prev !== out) { changed++; if (arg !== '--check' && arg !== '--missing' && arg !== '--prune') { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, out); } }
  }
  report[lang] = [...missing];
}
{   // the header/footer (assets/site-chrome.js) links to a translated page only when it exists
  const f = 'assets/site-chrome.js', src = read(f);
  const out = src.replace(/\/\* i18n:pages \*\/[\s\S]*?\/\* \/i18n:pages \*\//, '/* i18n:pages */' + JSON.stringify([...exists]) + '/* /i18n:pages */');
  if (out !== src) { changed++; if (arg !== '--check' && arg !== '--missing') fs.writeFileSync(path.join(ROOT, f), out); }
}
{   // sitemap: every translated URL, in a block this script owns
  const f = 'sitemap.xml', src = read(f);
  const today = new Date().toISOString().slice(0, 10);
  const prev = (src.match(/<!-- i18n:urls[\s\S]*?<!-- \/i18n:urls -->/) || [''])[0];
  const keepDate = u => ((prev.match(new RegExp('<loc>' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</loc><lastmod>([^<]+)')) || [])[1]) || today;
  const urls = LANGS.flatMap(l => pages.concat(generated).filter(pg => !noSitemap.has(pg)).map(pg => SITE + '/' + l + (pretty(urlOf(pg)) === '/' ? '/' : pretty(urlOf(pg)))));
  const block = '<!-- i18n:urls (scripts/gen-i18n.js) -->\n' + urls.map(u => '  <url><loc>' + u + '</loc><lastmod>' + keepDate(u) + '</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>').join('\n') + '\n  <!-- /i18n:urls -->';
  const out = prev ? src.replace(prev, block) : src.replace('</urlset>', '  ' + block + '\n</urlset>');
  if (out !== src) { changed++; if (arg !== '--check' && arg !== '--missing') fs.writeFileSync(path.join(ROOT, f), out); }
}
for (const f of pages) {   // the English source carries the same hreflang block
  const src = read(f), out = putAlternates(src, f);
  if (out !== src) { changed++; if (arg !== '--check' && arg !== '--missing') fs.writeFileSync(path.join(ROOT, f), out); }
}
if (arg === '--prune') {   // drop translations no listed page uses any more (e.g. text removed from an English page)
  for (const l of LANGS) {
    const f = 'locales/' + l + '.json', d = JSON.parse(read(f)), before = Object.keys(d.strings).length;
    d.strings = Object.fromEntries(Object.entries(d.strings).filter(([k]) => USED.has(k)));
    fs.writeFileSync(path.join(ROOT, f), JSON.stringify(d, null, 1) + '\n');
    console.log(l + ': pruned ' + (before - Object.keys(d.strings).length) + ' unused translation(s)');
  }
  process.exit(0);
}
if (arg === '--missing') { for (const l of LANGS) { console.log('## ' + l + ' (' + report[l].length + ' missing)'); report[l].forEach(k => console.log(JSON.stringify(k))); } process.exit(0); }
for (const l of LANGS) if (report[l].length) console.log(l + ': ' + report[l].length + ' text run(s) not translated yet (node scripts/gen-i18n.js --missing)');
if (arg === '--check') { console.log(changed ? changed + ' file(s) out of date' : 'translations in sync'); process.exit(changed ? 1 : 0); }
console.log('i18n: ' + pages.length + ' page(s) × ' + LANGS.length + ' languages, ' + changed + ' file(s) written');
