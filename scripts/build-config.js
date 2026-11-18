#!/usr/bin/env node
/* Build step for data/config.json, the single source of every price, fee, rate and RINGO5 term.
   ============================================================================================
     node scripts/build-config.js          apply config to the site (idempotent; deploy runs it)
     node scripts/build-config.js --check  exit 1 if anything is out of date (CI / pre-commit)

   It:
   1. validates data/config.json (types, ranges, required keys), so a typo can't ship;
   2. writes the generated CONFIG block into assets/pricing.js (browser + Node read it from there);
   3. fills every  <x data-cfg="path.to.value" [data-cfg-fmt="date|pct|money4|int"]>…</x>  in the pages and the
      data-page template with the current value, so the HTML (what search engines read) carries real numbers;
   4. keeps calculator input defaults (staking APR, solo discount, Greedy growth) in step with the config.
*/
'use strict';
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');
const LIST = process.argv.includes('--list');   // print every phrase-rule match with context (audit)
const rel = f => path.join(ROOT, f);
const raw = JSON.parse(fs.readFileSync(rel('data/config.json'), 'utf8'));
const cfg = JSON.parse(JSON.stringify(raw)); delete cfg._readme;

// ---------- 1. validate ----------
const errs = [];
const get = p => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), cfg);
// derived.* values are computed, never typed: e.g. the coverage that holds the full token discount (18 × 20 = 360)
const num = (p, lo, hi) => { const v = get(p); if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) errs.push(`${p} must be a number in ${lo}..${hi} (got ${JSON.stringify(v)})`); };
const date = p => { const v = get(p); if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) errs.push(`${p} must be YYYY-MM-DD (got ${JSON.stringify(v)})`); };
['meta.updated', 'meta.ratesObserved', 'meta.pricesObserved'].forEach(date);
num('fees.electricityUsdPerKwh', 0, 1); num('fees.serviceUsdPerThDay', 0, 1); num('fees.btcToGmtConversion', 0, 0.5);
num('fees.usdToGmt', 0, 0.5); num('fees.nftHolderDiscount', 0, 0.5);
num('rates.stakingAprPct', 0, 200); num('rates.soloMiningDiscountPct', 0, 30); num('rates.clickStreakPct', 0, 30); num('rates.greedyGrowthWeeklyPct', 0, 10);
num('discount.coverageDaysPerPct', 1, 365); num('discount.tokenCapPct', 0, 100); num('discount.totalCapPct', 0, 100);
num('network.blockSubsidyBtc', 0, 50);
num('pricing.salePct', 0, 90); num('pricing.effBest', 1, 100); num('pricing.effBaseMax', 1, 100); num('pricing.minerCapTh', 1, 1e7);
num('referral.bonusThPct', 0, 100); num('referral.bonusThCap', 0, 1e6); num('referral.codeWindowDays', 0, 3650);
num('referral.vipMonths', 0, 120); num('referral.cardWindowDays', 0, 3650);
if (!/^[A-Z0-9]{3,20}$/.test(cfg.referral && cfg.referral.code || '')) errs.push('referral.code must be 3-20 capital letters/digits');
const tiers = get('pricing.thTiers15wList');
if (!Array.isArray(tiers) || tiers.length < 2 || tiers.some((t, i) => !(t.th > 0 && t.cpt > 0) || (i && t.th <= tiers[i - 1].th))) errs.push('pricing.thTiers15wList must be ascending {th, cpt} pairs');
else if (tiers[tiers.length - 1].th !== 5000) errs.push('pricing.thTiers15wList must end at the 5000 TH anchor');
const bands = get('pricing.effUpgradeBands');
if (!Array.isArray(bands) || bands.some((b, i) => !(b.upTo > 0 && b.step >= 0) || (i && b.upTo <= bands[i - 1].upTo))) errs.push('pricing.effUpgradeBands must be ascending {upTo, step}');
const vip = get('vipTiers');
if (!Array.isArray(vip) || vip.some((t, i) => typeof t.n !== 'string' || !(t.th >= 0) || !(t.d >= 0) || (i && t.th <= vip[i - 1].th))) errs.push('vipTiers must be ascending by th with n, th, veg, d');
if (errs.length) { console.error('data/config.json is invalid:\n  - ' + errs.join('\n  - ')); process.exit(1); }

cfg.derived = { fullCoverageDays: cfg.discount.coverageDaysPerPct * cfg.discount.tokenCapPct };

// ---------- formatting ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const trimNum = n => String(Math.round(n * 1e6) / 1e6);
const LOCALE = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };
const comma = (s, lang) => (LOCALE[lang] ? s.replace('.', ',') : s);   // decimal comma in es/fr/de
const FMT = {
  date: (v, lang) => LOCALE[lang]
    ? new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(v + 'T00:00:00Z'))
    : fmtDate(v),
  pct: (v, lang) => comma(trimNum(v * 100), lang),   // a fraction (0.0225) shown as percent digits ("2.25")
  money4: v => '$' + String(v),
  int: v => String(Math.round(v)),
  '': (v, lang) => (typeof v === 'number' ? comma(trimNum(v), lang) : String(v))
};
const langOf = f => (f.match(/^(es|fr|de)\//) || [])[1] || 'en';

const changed = [];
const write = (f, s) => { const p = rel(f); if (fs.readFileSync(p, 'utf8') !== s) { changed.push(f); if (!CHECK) fs.writeFileSync(p, s); } };

// ---------- 2. pricing.js generated block ----------
{
  const f = 'assets/pricing.js', s = fs.readFileSync(rel(f), 'utf8');
  const re = /(\/\* ===== CONFIG: generated[^\n]*\n)[\s\S]*?(\n\s*\/\* ===== END CONFIG ===== \*\/)/;
  if (!re.test(s)) { console.error('assets/pricing.js: CONFIG markers missing'); process.exit(1); }
  const body = '  const CONFIG = ' + JSON.stringify(cfg, null, 2).replace(/\n/g, '\n  ') + ';';
  write(f, s.replace(re, (m, a, b) => a + body + b));
}

// ---------- phrase rules: numbers inside known sentences, in any language, anywhere ----------
// For places a <span data-cfg> can't go: meta descriptions, JSON-LD, JS strings (co-pilot, embed i18n).
// Each rule's regex matches ONLY the number; the surrounding words decide what it is.
const PHRASES = [
  ['referral.bonusThPct', /(?<![\d.])\d+(?=\s?%\s*(?:bonus TH|bonus terahash|de TH en bonus|de TH extra|Bonus-TH))/g],
  ['referral.bonusThCap', /(?<=\b(?:up to|hasta|jusqu'à|jusqu&#39;à|jusqu’à|bis zu)\s)\d+(?=\s?TH\b)/g],
  ['referral.codeWindowDays', /(?<=\bwithin\s)\d+(?=\s+days of signing up)|(?<=\bless than\s)\d+(?=\s+days old)|(?<=\bmenos de\s)\d+(?=\s+días de antigüedad)|(?<=\bmoins de\s)\d+(?=\s+jours d'ancienneté)|(?<=\bjünger als\s)\d+(?=\s+Tage)|(?<=\bdentro de los\s)\d+(?=\s+días)|(?<=\bdans les\s)\d+(?=\s+jours suivant)|(?<=\binnerhalb von\s)\d+(?=\s+Tagen nach)/g],
  ['referral.cardWindowDays', /(?<=\bfirst\s)\d+(?=\s+days)|\d+(?=\s+premiers jours)|(?<=\bprimeros\s)\d+(?=\s+días)|(?<=\bersten\s)\d+(?=\s+Tagen)/g],
  ['referral.vipMonths', /(?<![\d.])\d+(?=\s+(?:months? of VIP Platinum|mois de VIP Platinum|mes de VIP Platinum|Monat VIP Platinum))/g],
  ['discount.coverageDaysPerPct', /(?<=\b[Ee]very (?:<b>)?)\d+(?=(?:<\/b>)?\s+days(?: of (?:fee )?coverage)?(?:<\/b>)?\s+(?:of coverage\s+)?is)|(?<=\b[Cc]ada (?:<b>)?)\d+(?=(?:<\/b>)?\s+días de cobertura)|(?<=\b[Cc]haque tranche de (?:<b>)?)\d+(?=(?:<\/b>)?\s+jours de couverture)|(?<=\b[Jj]e (?:<b>)?)\d+(?=(?:<\/b>)?\s+Tage Deckung)/g],
  ['derived.fullCoverageDays', /(?<=\bup to (?:<b>)?\d+%(?:<\/b>)? at (?:<b>)?)\d+(?= days)|(?<=%(?:<\/b>)? con (?:<b>)?)\d+(?= días)|(?<=%(?:<\/b>)? à (?:<b>)?)\d+(?= jours)|(?<=%(?:<\/b>)? bei (?:<b>)?)\d+(?= Tagen)/g],
  ['discount.tokenCapPct', /(?<=\b(?:up to|to) a )\d+(?=% cap)|(?<=\bup to (?:<b>)?)\d+(?=%(?:<\/b>)? at (?:<b>)?\d+ days)|(?<![\d.$+])\d+(?=%\s+(?:discount|fee discount|token discount|GMT discount|coverage discount))|(?<=\bhasta el (?:<b>)?)\d+(?=\s?%(?:<\/b>)? con (?:<b>)?\d+ días)|(?<=\bjusqu(?:'|’|&#39;)à (?:<b>)?)\d+(?=\s?%(?:<\/b>)? à (?:<b>)?\d+ jours)|(?<=\bbis zu (?:<b>)?)\d+(?=\s?%(?:<\/b>)? bei (?:<b>)?\d+ Tagen)/g],
];
const PHRASE_FILES = ['locales/es.json', 'locales/fr.json', 'locales/de.json', 'assets/copilot/en.js', 'assets/copilot/es.js', 'assets/copilot/fr.js', 'assets/copilot/de.js', 'assets/roi-embed.js', 'assets/quote.js', 'assets/market-check.js'];
const phraseHits = {};
function applyPhrases(f, s) {
  for (const [p, re] of PHRASES) {
    const v = String(get(p));
    s = s.replace(re, (m, ...a) => {
      const off = a[a.length - 2], src = a[a.length - 1];
      phraseHits[p] = (phraseHits[p] || 0) + 1;
      if (LIST) console.log(`  ${p.padEnd(26)} ${f}:${src.slice(0, off).split('\n').length}  …${src.slice(Math.max(0, off - 45), off).replace(/\s+/g, ' ')}[${m}]${src.slice(off + m.length, off + m.length + 35).replace(/\s+/g, ' ')}…`);
      return v;
    });
  }
  return s;
}

// ---------- 3 + 4. pages ----------
const ls = c => execSync(c, { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const pages = ls('git ls-files "*.html"').concat(ls('git ls-files --others --exclude-standard "*.html"'))
  .filter(f => !/^(neon-miner|gomining-calc)\//.test(f) && !/^(gomining-optimizer|gomining-vip-index|redesign-prototype|ob_research_dashboard)\.html$/.test(f))
  .concat(['scripts/gen-pages.js']);
const DATA_CFG = /(<([a-z0-9]+)\b[^>]*?\sdata-cfg="([a-zA-Z0-9_.]+)"(?:[^>]*?\sdata-cfg-fmt="([a-z0-9]*)")?[^>]*>)([^<]*)(<\/\2>)/g;
const INPUTS = [   // id="…" value="…" defaults the calculators start from
  ['inLockAPR', 'rates.stakingAprPct'], ['inMiningMode', 'rates.soloMiningDiscountPct'], ['inGreedyGrowth', 'rates.greedyGrowthWeeklyPct'],
  ['re-apr', 'rates.stakingAprPct'], ['mc-growth', 'rates.greedyGrowthWeeklyPct']
];
let filled = 0;
for (const f of pages) {
  let s = fs.readFileSync(rel(f), 'utf8'), o = s;
  s = s.replace(DATA_CFG, (m, open, tag, p, fmt, inner, close) => {
    if (inner.includes('${')) return m;   // generator template: its own ${…} fills it
    const v = get(p);
    if (v === undefined) { errs.push(`${f}: data-cfg="${p}" is not in config.json`); return m; }
    filled++;
    return open + (FMT[fmt || ''] || FMT[''])(v, langOf(f)) + close;
  });
  s = applyPhrases(f, s);
  for (const [id, p] of INPUTS) {
    s = s.replace(new RegExp(`(\\bid="${id}"[^>]*?\\svalue=")[^"]*(")`, 'g'), (m, a, b) => a + trimNum(get(p)) + b);
  }
  if (s !== o) write(f, s);
}
for (const f of PHRASE_FILES) { const s = fs.readFileSync(rel(f), 'utf8'); const t = applyPhrases(f, s); if (t !== s) write(f, t); }
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
if (!LIST) console.log('phrase rules: ' + Object.entries(phraseHits).map(([k, v]) => `${k} ×${v}`).join(', '));

if (CHECK) {
  if (changed.length) { console.error('out of date (run node scripts/build-config.js): ' + changed.join(', ')); process.exit(1); }
  console.log(`config in sync (${filled} data-cfg values across ${pages.length} files)`);
} else {
  console.log(`config applied: ${filled} data-cfg values; ${changed.length ? 'updated ' + changed.join(', ') : 'nothing to change'}`);
}
