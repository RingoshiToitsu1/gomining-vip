#!/usr/bin/env node
/* Weekly rate update — ONE command for the three platform rates that change every week.
   ===========================================================================
     node scripts/set-rates.js --apr 21.5                 staking APR only
     node scripts/set-rates.js --apr 21.5 --solo 1.30 --greedy 0.3347
     options: --date YYYY-MM-DD (default today)   --no-pages (skip gen-pages.js)

   Each rate is mirrored in several files (the console, the planner engine, the content-page
   widgets, the page generator) and they have drifted before — the ROI widget sat on a
   22.95% APR for two updates. This script is the only thing that should edit them. Every
   pattern must match exactly once or nothing is written. It also:
     - moves an old solo/greedy default into the PAST_DEFAULTS lists, so saved setups that
       were tracking it pick up the new rate (a value the user typed themselves is kept);
     - bumps the ?v= cache-buster of every script it touched, on every page that loads it;
     - writes api/rates.json, the public feed (CORS-open on GitHub Pages) that
       /assets/rates.js and other sites read, with a dated history;
     - regenerates the data pages (they print the APR) unless --no-pages.
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
const NEW = { apr: numArg('apr', 0, 200), solo: numArg('solo', 0, 30), greedy: numArg('greedy', 0, 10) };
const DATE = opt('date') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error('--date must be YYYY-MM-DD');
if (NEW.apr == null && NEW.solo == null && NEW.greedy == null && !flag('json-only')) {
  console.error('Nothing to set. Usage: node scripts/set-rates.js --apr 21.5 [--solo 1.3] [--greedy 0.3347] [--date YYYY-MM-DD] [--no-pages]');
  process.exit(1);
}

// ---- read the current values from their sources of truth ----
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const files = {};                                    // path -> edited text
const get = f => (files[f] != null ? files[f] : (files[f] = read(f)));
function cap(f, re) {
  const m = get(f).match(re);
  if (!m) throw new Error(`could not read current value from ${f} (${re})`);
  return m[1];
}
const CUR = {
  apr: cap('scripts/constants.js', /^const STAKING_APR\s*=\s*([\d.]+);/m),
  solo: cap('scripts/constants.js', /^const MINING_MODE\s*=\s*([\d.]+);/m),
  greedy: cap('assets/app.js', /^const GREEDY_GROWTH_DEFAULT='([\d.]+)';/m),
};

// Replace exactly one match of `re` in file `f`, via fn(match, ...groups) -> replacement.
const touched = new Set();
function sub(f, re, fn) {
  const s = get(f);
  const hits = s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
  if (!hits || hits.length !== 1) throw new Error(`${f}: expected exactly 1 match for ${re}, found ${hits ? hits.length : 0}`);
  const out = s.replace(re, fn);
  if (out !== s) { files[f] = out; touched.add(f); }
}
const pad = (v, w) => (v + ';').padEnd(w);           // keeps the aligned constant blocks aligned

// ---- staking APR ----
if (NEW.apr != null && NEW.apr !== CUR.apr) {
  const a = NEW.apr;
  sub('scripts/constants.js', /^const STAKING_APR\s*=.*$/m,
    () => `const STAKING_APR     = ${pad(a, 9)}// % — GMT locked-staking APR (observed ${DATE})`);
  sub('console/index.html', /id="inLockAPR" value="[\d.]+"/, () => `id="inLockAPR" value="${a}"`);
  for (const f of ['assets/quote.js', 'assets/roi-embed.js']) {
    sub(f, /const STAKE_APR0\s*=\s*[\d.]+;/, () => `const STAKE_APR0     = ${a};`);
    sub(f, /GMT locked-staking APR \(observed \d{4}-\d{2}-\d{2}\)/, () => `GMT locked-staking APR (observed ${DATE})`);
  }
  sub('assets/quote.js', /const APR = [\d.]+;\s*/, () => `const APR = ${pad(a, 9)}`);
  sub('assets/market-check.js', /const STAKE_APR\s*=\s*[\d.]+;\s*/, () => `const STAKE_APR        = ${pad(a, 9)}`);
  // The widgets seed their APR field from STAKE_APR0; the HTML value is a no-JS placeholder.
  for (const f of ['gomining-roi-calculator.html', 'is-gomining-worth-it.html', 'embed/index.html'])
    sub(f, /id="re-apr" ([^>]*?)value="[\d.]+"/, (m, mid) => `id="re-apr" ${mid}value="${a}"`);
}

// ---- solo mining discount ----
if (NEW.solo != null && NEW.solo !== CUR.solo) {
  const v = NEW.solo;
  sub('scripts/constants.js', /^const MINING_MODE\s*=.*$/m,
    () => `const MINING_MODE     = ${pad(v, 9)}// % — solo mining discount (observed ${DATE})`);
  sub('console/index.html', /id="inMiningMode" value="[\d.]+"/, () => `id="inMiningMode" value="${v}"`);
  sub('assets/app.js', /^const MINING_MODE_DEFAULT=[\d.]+;.*$/m, () => `const MINING_MODE_DEFAULT=${v};   // observed ${DATE}`);
  sub('assets/app.js', /^const MINING_MODE_PAST_DEFAULTS=\[([^\]]*)\];/m, (m, list) => {
    const xs = list.split(',').map(Number);
    if (!xs.includes(Number(CUR.solo))) xs.push(Number(CUR.solo));
    return `const MINING_MODE_PAST_DEFAULTS=[${xs.filter(x => x !== Number(v)).sort((p, q) => p - q).join(',')}];`;
  });
  for (const f of ['assets/quote.js', 'assets/roi-embed.js'])
    sub(f, /const MINING_MODE\s*=\s*[\d.]+;.*$/m,
      () => `const MINING_MODE    = ${pad(v, 9)}// % — solo mining discount (console inMiningMode, observed ${DATE})`);
}

// ---- Greedy Machine weekly growth ----
if (NEW.greedy != null && NEW.greedy !== CUR.greedy) {
  const g = NEW.greedy;
  // Old default joins the past list (as a quoted string — the console compares raw input text).
  const addPast = (list, sep) => {
    const xs = list.split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    if (!xs.includes(CUR.greedy)) xs.push(CUR.greedy);
    return xs.filter(x => x !== g).map(x => "'" + x + "'").join(sep);
  };
  sub('assets/app.js', /^const GREEDY_GROWTH_DEFAULT='[\d.]+';.*$/m, () => `const GREEDY_GROWTH_DEFAULT='${g}';   // observed ${DATE}`);
  sub('assets/app.js', /^const GREEDY_GROWTH_PAST_DEFAULTS=\[([^\]]*)\];/m, (m, list) => `const GREEDY_GROWTH_PAST_DEFAULTS=[${addPast(list, ',')}];`);
  sub('console/index.html', /id="inGreedyGrowth" value="[\d.]+"/, () => `id="inGreedyGrowth" value="${g}"`);
  sub('assets/market-check.js', /const GREEDY_GROWTH_DEFAULT = [\d.]+;\s*/, () => `const GREEDY_GROWTH_DEFAULT = ${pad(g, 37)}`);
  sub('assets/market-check.js', /const GREEDY_GROWTH_PAST_DEFAULTS = \[([^\]]*)\];/, (m, list) => `const GREEDY_GROWTH_PAST_DEFAULTS = [${addPast(list, ', ')}];`);
  sub('gomining-marketplace-checker.html', /id="mc-growth" ([^>]*?)value="[\d.]+"/, (m, mid) => `id="mc-growth" ${mid}value="${g}"`);
}

// ---- cache-busters: every page loading a script we changed gets its ?v= bumped ----
const scripts = [...touched].filter(f => f.startsWith('assets/') && f.endsWith('.js'));
if (scripts.length) {
  // The site's pages: top-level *.html plus <dir>/index.html (the repo root is a home
  // directory, so a recursive walk or `git ls-files` would sweep in unrelated projects).
  const pages = [];
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (e.isFile() && e.name.endsWith('.html')) pages.push(e.name);
    else if (e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, 'index.html'))) pages.push(e.name + '/index.html');
  }
  for (const js of scripts) {
    const name = js.replace(/^assets\//, '').replace(/\./g, '\\.');
    const re = new RegExp(`(/assets/${name}\\?v=)(\\d+)`, 'g');
    for (const p of pages) {
      const s = get(p);
      if (!re.test(s)) continue;
      re.lastIndex = 0;
      files[p] = s.replace(re, (m, pre, n) => pre + (Number(n) + 1));
      touched.add(p);
    }
  }
}

// ---- api/rates.json ----
const RATES = 'api/rates.json';
let feed = { history: [] };
try { feed = JSON.parse(read(RATES)); } catch (e) {}
const now = {
  stakingApr: Number(NEW.apr != null ? NEW.apr : CUR.apr),
  soloDiscount: Number(NEW.solo != null ? NEW.solo : CUR.solo),
  greedyGrowthWeekly: Number(NEW.greedy != null ? NEW.greedy : CUR.greedy),
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
  clickStreak: 3,
  unit: 'percent',
  updated: DATE,
  source: 'https://gmt-optimizer.com',
  notes: {
    stakingApr: 'GoMining veGMT locked-staking APR, %, read off the app',
    soloDiscount: 'solo mining (reward distribution) fee discount, %',
    greedyGrowthWeekly: 'Greedy Machine passive hashrate growth, % per week',
    clickStreak: 'fee discount for a 10+ day click streak, %',
  },
  history: hist.slice(0, 104),
};
fs.mkdirSync(path.join(ROOT, 'api'), { recursive: true });
files[RATES] = JSON.stringify(out, null, 2) + '\n';
touched.add(RATES);

// ---- write ----
for (const f of touched) fs.writeFileSync(path.join(ROOT, f), files[f]);
const changed = Object.keys(NEW).filter(k => NEW[k] != null && NEW[k] !== CUR[k]);
console.log(changed.length
  ? changed.map(k => `${k}: ${CUR[k]} -> ${NEW[k]}`).join('\n')
  : 'no rate changed (feed re-dated only)');
console.log('wrote ' + [...touched].sort().join(', '));

if (changed.includes('apr') && !flag('no-pages')) {
  console.log('regenerating data pages (they print the staking APR)…');
  execFileSync(process.execPath, [path.join(__dirname, 'gen-pages.js')], { cwd: ROOT, stdio: 'inherit' });
}
