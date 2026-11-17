#!/usr/bin/env node
/* Offer check (rule 8): the ended personal offers must not appear anywhere on the built site.
   ========================================================================================
     node scripts/offer-check.js            list every match with context; exit 1 if any
     node scripts/offer-check.js --quiet    counts only

   The only offer on the site is the RINGO5 bonus block (+5% TH up to 25 TH, 1 month of VIP
   Platinum+, GoMining Card cashback in the first 90 days). Everything below is the ended personal
   offer (10% cash back, funded / free first TH, "TH rebate") and must have zero matches, in every
   language. Scans every published file the deploy would ship (all non-hidden tracked files).
*/
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const QUIET = process.argv.includes('--quiet');

// Each entry: [label, regex]. Case-insensitive. Add translations as language versions are built.
const BANNED = [
  ['first terahash/TH on me', /first\s+(?:terahash|TH)\s+(?:is\s+)?on\s+me/i],
  ['10% cash back', /10\s?%\s*(?:personal\s+)?cash\s?-?back/i],
  ['5% back on upgrades', /5\s?%\s*back\s+on\s+upgrades/i],
  ['$10,000', /\$\s?10,000/],
  ['paid within 24 hours', /paid\s+within\s+24\s*h(?:ours|rs)?/i],
  ['claim free TH', /claim\s+(?:your\s+)?free\s+TH/i],
  ['fund your first TH', /fund(?:s|ed|ing)?\s+(?:your|my|their|the|a)?\s*first\s+(?:TH|terahash)/i],
  ['funded first TH', /funded[\s-]+(?:first[\s-]+)?(?:TH|terahash)/i],
  ['I/we will fund', /\b(?:I|we|I'll|we'll|I\s+will|we\s+will|team\s+will|team)\s+fund\b/i],
  ['TH rebate / rebate', /\brebates?\b/i],
  ['personal cash back', /\b(?:my|personal)\s+(?:\d+\s?%\s+)?cash\s?-?back\b/i],
  // Any cash back that isn't the GoMining Card cashback bonus (checked against the text around it).
  ['cash back (not the GoMining Card bonus)', /cash\s?-?back|remboursés?|de vuelta\b|reembolso/i, { unless: /card|karte|carte|tarjeta/i }],
  ['permanent % back', /(?:permanent|dauerhaft|en permanence|permanente)[^.<'"]{0,25}\d+\s?%|\d+\s?%[^.<'"]{0,25}(?:en permanence|permanente)\b/i],
  ['free offer / free setup (own offer)', /\bfree\s+(?:offer|setup|first\s+TH|TH\s+offer)\b/i],
  ['first TH free', /first\s+TH\s+(?:for\s+)?free/i],
  // es / fr / de equivalents (machine-translated forms the old copy could take)
  ['es: primer TH', /(?:financio|financiamos|te\s+pago)\s+tu\s+primer\s+TH|10\s?%\s+de\s+vuelta/i],
  ['fr: premier TH', /(?:je\s+finance|nous\s+finançons)\s+votre\s+premier\s+TH|10\s?%\s+(?:de\s+remboursement|remboursés)/i],
  ['de: erstes TH', /(?:ich\s+finanziere|wir\s+finanzieren)\s+(?:dein|ihr)\s+erstes\s+TH|10\s?%\s+Cashback/i]
];

const files = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n')
  .filter(f => !f.startsWith('.') && /\.(html|js|json|xml|txt|md|webmanifest|css|yml|yaml)$/i.test(f))
  .filter(f => !/^(AUDIT|URLS|SETUP|TRANSLATIONS|REVIEW|README)\.md$/i.test(f) && f !== 'scripts/offer-check.js');

let total = 0;
const per = {};
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [label, re, opt] of BANNED) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(s))) {
      if (opt && opt.unless && opt.unless.test(s.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40))) continue;
      total++; per[label] = (per[label] || 0) + 1;
      if (!QUIET) {
        const a = Math.max(0, m.index - 80), b = Math.min(s.length, m.index + m[0].length + 80);
        const line = s.slice(0, m.index).split('\n').length;
        console.log(`${f}:${line}  [${label}]  …${s.slice(a, b).replace(/\s+/g, ' ')}…`);
      }
    }
  }
}
console.log(`\noffer check: ${total} match${total === 1 ? '' : 'es'}` + (total ? ' — ' + Object.entries(per).map(([k, v]) => `${k} ×${v}`).join(', ') : ' — clean'));
process.exit(total ? 1 : 0);
