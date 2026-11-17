#!/usr/bin/env node
/* Weekly rate update — ONE command for the three platform rates that change every week.
   ===========================================================================
     node scripts/set-rates.js --apr 21.5                 staking APR only
     node scripts/set-rates.js --apr 21.5 --solo 1.30 --greedy 0.3347
     node scripts/set-rates.js --sale 20                  GoMining TH sale: 20% off TH (--sale 0 ends it)
     options: --date YYYY-MM-DD (default today)   --no-pages (skip gen-pages.js)

   Every value lives in data/config.json (the single source). This script edits it in place, then:
     - runs scripts/build-config.js (pricing.js block, page values, calculator defaults);
     - moves an old solo/greedy default into the PAST_DEFAULTS lists, so saved setups that
       were tracking it pick up the new rate (a value the user typed themselves is kept);
     - bumps ?v= on every changed asset (scripts/bump-versions.js, transitively);
     - writes api/rates.json, the public feed (CORS-open on GitHub Pages) that
       /assets/rates.js and other sites read, with a dated history;
     - regenerates the data pages (they print the APR and TH prices) unless --no-pages.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const flag = k => args.includes('--' + k);

function numArg(k, min, max) {
  const raw = opt(k);
  if (raw == null) return null;
  const v = Number(raw);
  if (!isFinite(v) || v < min || v > max) throw new Error(`--${k} ${raw}: expected a number in ${min}..${max}`);
  return raw.replace(/^0+(?=\d)/, '');   // keep the user's spelling ('0.3347'), it's matched as a string later
}
const NEW = { apr: numArg('apr', 0, 200), solo: numArg('solo', 0, 30), greedy: numArg('greedy', 0, 10), sale: numArg('sale', 0, 90) };
const DATE = opt('date') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error('--date must be YYYY-MM-DD');
if (NEW.apr == null && NEW.solo == null && NEW.greedy == null && NEW.sale == null && !flag('json-only')) {
  console.error('Nothing to set. Usage: node scripts/set-rates.js --apr 21.5 [--solo 1.3] [--greedy 0.3347] [--sale 20] [--date YYYY-MM-DD] [--no-pages]');
  process.exit(1);
}

// ---- the single source: data/config.json (edited in place, layout preserved) ----
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const files = {};                                    // path -> edited text
const get = f => (files[f] != null ? files[f] : (files[f] = read(f)));
const CFG_FILE = 'data/config.json';
const cfg = JSON.parse(get(CFG_FILE));
const CUR = {
  apr: String(cfg.rates.stakingAprPct),
  solo: String(cfg.rates.soloMiningDiscountPct),
  greedy: String(cfg.rates.greedyGrowthWeeklyPct),
  sale: String(cfg.pricing.salePct),
};
const touched = new Set();
// Replace exactly one match of `re` in file `f`, via fn(match, ...groups) -> replacement.
function sub(f, re, fn) {
  const s = get(f);
  const hits = s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  if (!hits || hits.length !== 1) throw new Error(`${f}: expected exactly 1 match for ${re}, found ${hits ? hits.length : 0}`);
  const out = s.replace(re, fn);
  if (out !== s) { files[f] = out; touched.add(f); }
}
const setJson = (key, v) => sub(CFG_FILE, new RegExp(`("${key}":\\s*)[^,\\n}]+`), (m, a) => a + v);
const rateChanged = [];

if (NEW.apr != null && NEW.apr !== CUR.apr) { setJson('stakingAprPct', NEW.apr); rateChanged.push('apr'); }

if (NEW.solo != null && NEW.solo !== CUR.solo) {
  setJson('soloMiningDiscountPct', NEW.solo); rateChanged.push('solo');
  // an old default saved in someone's setup is not their own number: remember it so it migrates
  sub('assets/app.js', /^const MINING_MODE_PAST_DEFAULTS=\[([^\]]*)\];/m, (m, list) => {
    const xs = list.split(',').map(Number);
    if (!xs.includes(Number(CUR.solo))) xs.push(Number(CUR.solo));
    return `const MINING_MODE_PAST_DEFAULTS=[${xs.filter(x => x !== Number(NEW.solo)).sort((p, q) => p - q).join(',')}];`;
  });
}

if (NEW.greedy != null && NEW.greedy !== CUR.greedy) {
  const g = NEW.greedy;
  setJson('greedyGrowthWeeklyPct', g); rateChanged.push('greedy');
  const addPast = (list, sep) => {
    const xs = list.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    if (!xs.includes(CUR.greedy)) xs.push(CUR.greedy);
    return xs.filter(x => x !== g).map(x => "'" + x + "'").join(sep);
  };
  sub('assets/app.js', /^const GREEDY_GROWTH_PAST_DEFAULTS=\[([^\]]*)\];/m, (m, list) => `const GREEDY_GROWTH_PAST_DEFAULTS=[${addPast(list, ',')}];`);
  sub('assets/market-check.js', /const GREEDY_GROWTH_PAST_DEFAULTS = \[([^\]]*)\];/, (m, list) => `const GREEDY_GROWTH_PAST_DEFAULTS = [${addPast(list, ', ')}];`);
}

// GoMining TH sale (% off every TH price; efficiency upgrades are not discounted)
if (NEW.sale != null && NEW.sale !== CUR.sale) { setJson('salePct', NEW.sale); rateChanged.push('sale'); }

// dates: rates observed today; the config as a whole updated today
if (rateChanged.some(k => k !== 'sale')) setJson('ratesObserved', `"${DATE}"`);
if (rateChanged.length) setJson('updated', `"${DATE}"`);

// ---- api/rates.json ----
const RATES = 'api/rates.json';
let feed = { history: [] };
try { feed = JSON.parse(read(RATES)); } catch (e) {}
const now = {
  stakingApr: Number(NEW.apr != null ? NEW.apr : CUR.apr),
  soloDiscount: Number(NEW.solo != null ? NEW.solo : CUR.solo),
  greedyGrowthWeekly: Number(NEW.greedy != null ? NEW.greedy : CUR.greedy),
  thSalePct: Number(NEW.sale != null ? NEW.sale : CUR.sale),
};
const hist = (feed.history || []).filter(h => h.date !== DATE);
hist.push(Object.assign({ date: DATE }, now));
hist.sort((p, q) => (p.date < q.date ? 1 : -1));       // newest first
const prev = hist[1] || null;
const out = {
  stakingApr: now.stakingApr,
  stakingAprPrevious: prev && prev.stakingApr != null ? prev.stakingApr : null,
  soloDiscount: now.soloDiscount,
  greedyGrowthWeekly: now.greedyGrowthWeekly,
  thSalePct: now.thSalePct,
  clickStreak: 3,
  unit: 'percent',
  updated: DATE,
  source: 'https://gmt-optimizer.com',
  notes: {
    stakingApr: 'GoMining veGMT locked-staking APR, %, read off the app',
    soloDiscount: 'solo mining (reward distribution) fee discount, %',
    greedyGrowthWeekly: 'Greedy Machine passive hashrate growth, % per week',
    thSalePct: 'GoMining promotional discount on TH prices (new miners and TH top-ups), %; 0 when no sale',
    clickStreak: 'fee discount for a 10+ day click streak, %',
  },
  history: hist.slice(0, 104),
};
fs.mkdirSync(path.join(ROOT, 'api'), { recursive: true });
files[RATES] = JSON.stringify(out, null, 2) + '\n';
touched.add(RATES);

// ---- write ----
for (const f of touched) fs.writeFileSync(path.join(ROOT, f), files[f]);
// apply the config to the site, then bump ?v= on everything that changed (transitively)
execFileSync(process.execPath, [path.join(__dirname, 'build-config.js')], { cwd: ROOT, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'bump-versions.js'), 'HEAD'], { cwd: ROOT, stdio: 'inherit' });
const changed = rateChanged;
console.log(changed.length
  ? changed.map(k => `${k}: ${CUR[k]} -> ${NEW[k]}`).join('\n')
  : 'no rate changed (feed re-dated only)');
console.log('wrote ' + [...touched].sort().join(', '));

if ((changed.includes('apr') || changed.includes('sale')) && !flag('no-pages')) {
  console.log('regenerating data pages (they print the staking APR and TH prices)…');
  execFileSync(process.execPath, [path.join(__dirname, 'gen-pages.js')], { cwd: ROOT, stdio: 'inherit' });
}
