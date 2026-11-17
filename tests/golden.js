#!/usr/bin/env node
/* Golden-output test: proves the calculators give the SAME numbers before and after a change.
   =========================================================================================
     node tests/golden.js            compare against tests/golden/*.json (exit 1 on any difference)
     node tests/golden.js --update   re-record the snapshots (only when a number is MEANT to change)

   Loads the real browser scripts (assets/pricing.js + the calculator) into a Node vm with a fake
   page, freezes market data (fixed BTC/GMT/difficulty; the network is blocked so the widgets use
   their built-in fallbacks), drives a spread of inputs, and snapshots every number they produce.
   Covers: the console engine (calc, planner, capital-for-income), the ROI calculator widget, and
   the marketplace checker. Text is compared after stripping tags and whitespace, so a restyle
   passes and a changed figure fails.
*/
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'golden');
const UPDATE = process.argv.includes('--update');
// GOLDEN_REV=<commit> runs every suite against the code at that commit (e.g. to prove a refactor changed nothing).
const REV = process.env.GOLDEN_REV;
const read = f => REV ? require('child_process').execSync(`git show ${REV}:${f}`, { cwd: ROOT, encoding: 'utf8' }) : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---------- fake page ----------
function makeDom(page) {
  // With a page, only ids that page really has exist (widgets branch on what is present).
  const allow = page ? new Set([...read(page).matchAll(/\sid="([^"]+)"/g)].map(m => m[1])) : null;
  const els = new Map();
  const listeners = new Map();
  const mkEl = id => {
    const el = {
      id, value: '', checked: false, hidden: false, disabled: false, innerHTML: '', textContent: '',
      style: {}, dataset: {}, className: '', children: [], options: [], offsetWidth: 0, offsetHeight: 0,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener(t, fn) { const k = id + '|' + t; (listeners.get(k) || listeners.set(k, []).get(k)).push(fn); },
      removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, hasAttribute: () => false,
      appendChild: c => c, insertBefore: c => c, removeChild() {}, remove() {}, append() {}, prepend() {},
      querySelector: () => null, querySelectorAll: () => [], closest: () => null, contains: () => false,
      focus() {}, blur() {}, click() {}, scrollIntoView() {}, scrollTo() {},
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }),
      getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }),
      insertAdjacentHTML() {}, animate: () => ({ finished: Promise.resolve(), cancel() {} })
    };
    return el;
  };
  const get = id => els.get(id) || els.set(id, mkEl(id)).get(id);
  const lookup = id => (allow && !allow.has(id) ? null : get(id));
  const document = {
    readyState: 'complete', documentElement: mkEl('html'), body: mkEl('body'), head: mkEl('head'),
    getElementById: lookup, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => mkEl(''), createElementNS: () => mkEl(''), createTextNode: () => mkEl(''),
    addEventListener() {}, removeEventListener() {}, currentScript: null, cookie: '', title: ''
  };
  const fire = (id, type = 'input') => (listeners.get(id + '|' + type) || []).forEach(fn => fn({ target: get(id) }));
  return { document, get, els, fire };
}

function makeCtx(dom) {
  const store = {};
  const ctx = {
    document: dom.document, console: { log() {}, warn() {}, error() {}, info() {} },
    Math, JSON, Date, Intl, URL, URLSearchParams, Promise, setTimeout: () => 0, clearTimeout() {},
    setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 }, navigator: { language: 'en-US', userAgent: 'node' },
    location: { search: '', pathname: '/', hash: '', href: 'https://gmt-optimizer.com/', origin: 'https://gmt-optimizer.com' },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, key: () => null, length: 0 },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: true, addEventListener() {}, addListener() {} }),
    IntersectionObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    ResizeObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    fetch: () => Promise.reject(new Error('network blocked in golden test')),
    AbortController: function () { return { signal: {}, abort() {} }; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    scrollTo() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, scrollY: 0
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
const run = (ctx, file) => vm.runInContext(read(file), ctx, { filename: file });
const flush = () => new Promise(r => setImmediate(r));

// Round every number so float noise below 1e-6 never fails the test.
function norm(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : String(x);
  if (Array.isArray(x)) return x.map(norm);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) { if (typeof x[k] !== 'function') o[k] = norm(x[k]); } return o; }
  return x;
}
const text = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 1. console engine ----------
function consoleSuite() {
  const dom = makeDom(), ctx = makeCtx(dom);
  run(ctx, 'assets/pricing.js');
  try { run(ctx, 'assets/app.js'); } catch (e) { /* UI wiring past the engine may need a real page; the engine is defined by then */ }
  vm.runInContext('S.btcPrice=90000;S.gmtPrice=0.30;S.satsPerTHDay=45;S.loaded=true;S.fxRate=1;', ctx);
  const set = (id, v) => { const el = dom.get(id); if (typeof v === 'boolean') el.checked = v; else el.value = String(v); };
  const base = { inTH: 0, inWTH: 15, inGMTLocked: 0, inGMTWallet: 0, inLockAPR: 18.87, inClickStreak: true, inPayGMT: true,
    inMiningMode: 1.09, inCostPerTH: 0, inCapital: 0, inGreedyTH: 0, inGreedyWth: 0, inInactiveTH: 0, inInactiveWth: 0,
    inContribAmt: 0, inContribFreq: 'monthly', inMpTH: 0, inMpGMT: 0, inMpWth: 0, inMpGreedy: false };
  const cases = [
    { name: 'new user, $1k', inCapital: 1000 },
    { name: 'new user, $10k', inCapital: 10000 },
    { name: '100 TH 15W no GMT', inTH: 100 },
    { name: '100 TH 15W 20% coverage', inTH: 100, inGMTLocked: 40000 },
    { name: '1000 TH 12W', inTH: 1000, inWTH: 12, inGMTLocked: 200000 },
    { name: '1000 TH 20W', inTH: 1000, inWTH: 20, inGMTLocked: 50000, inGMTWallet: 5000 },
    { name: '5000 TH 15W + $25k', inTH: 5000, inGMTLocked: 600000, inCapital: 25000 },
    { name: 'greedy 2400 of 3000 TH', inTH: 3000, inWTH: 15.2, inGreedyTH: 2400, inGreedyWth: 15, inGMTLocked: 300000, inCapital: 5000 },
    { name: 'no click, no payGMT', inTH: 250, inWTH: 18, inClickStreak: false, inPayGMT: false, inGMTLocked: 20000 },
    { name: 'inactive hashrate', inTH: 400, inInactiveTH: 100, inInactiveWth: 25, inGMTLocked: 60000 },
    { name: 'marketplace miner in plan', inTH: 50, inCapital: 3000, inMpTH: 200, inMpGMT: 7000, inMpWth: 20 }
  ];
  const out = {};
  for (const c of cases) {
    for (const [k, v] of Object.entries(Object.assign({}, base, c))) if (k !== 'name') set(k, v);
    const r = {};
    try { const i = vm.runInContext('inp()', ctx); r.inp = i; r.calc = vm.runInContext('calc(inp())', ctx); } catch (e) { r.calcError = e.message; }
    try { r.planner = vm.runInContext('solvePlannerAllocation(inp(), S.btcPrice, S.gmtPrice, dailyBTCperTH())', ctx); } catch (e) { r.plannerError = e.message; }
    try { r.monthlyFor10k = vm.runInContext('projectedMonthlyForCapital(10000)', ctx); } catch (e) { r.monthlyError = e.message; }
    out[c.name] = norm(r);
  }
  return out;
}

// ---------- 2. ROI calculator widget (TH mode on the guide pages, $ mode on /embed) ----------
async function roiSuite() {
  const out = {};
  const outIds = ['re-net', 're-net-sub', 're-cost', 're-cost-sub', 're-be', 're-be-sub', 're-disc', 're-disc-sub', 're-hint', 're-basis'];
  const pages = {
    'gomining-roi-calculator.html': [
      { name: '10 TH 15W', 're-th': 10, 're-wth': 15 },
      { name: '100 TH 15W', 're-th': 100, 're-wth': 15 },
      { name: '500 TH 12W, 20k GMT', 're-th': 500, 're-wth': 12, 're-gmt': 20000 },
      { name: '250 TH 20W', 're-th': 250, 're-wth': 20 },
      { name: '1000 TH 15W apr 25', 're-th': 1000, 're-wth': 15, 're-apr': 25 }],
    'embed/index.html': [
      { name: '$500', 're-usd': 500 },
      { name: '$5k', 're-usd': 5000 },
      { name: '$50k at 12W', 're-usd': 50000, 're-wth': 12 }]
  };
  for (const [page, cases] of Object.entries(pages)) {
    const dom = makeDom(page), ctx = makeCtx(dom);
    run(ctx, 'assets/pricing.js');
    try { run(ctx, 'lib/mining.js'); } catch (e) { /* older revisions (GOLDEN_REV) predate lib/ */ }
    run(ctx, 'assets/roi-embed.js');
    for (let k = 0; k < 20; k++) await flush();     // loadMarket() falls back to its fixed prices
    const ids = ['re-th', 're-wth', 're-gmt', 're-usd', 're-apr', 're-streak'].filter(id => dom.document.getElementById(id));
    for (const c of cases) {
      for (const id of ids) { const el = dom.get(id); if (c[id] != null) el.value = String(c[id]); }
      for (const id of ids) dom.fire(id, 'input');
      await flush();
      out[page + ' / ' + c.name] = Object.fromEntries(outIds.filter(id => dom.document.getElementById(id)).map(id => [id, text(dom.get(id).textContent || dom.get(id).innerHTML)]));
    }
  }
  return out;
}

// ---------- 3. marketplace checker ----------
async function checkerSuite() {
  const dom = makeDom(), ctx = makeCtx(dom);
  run(ctx, 'assets/pricing.js');
  const src = read('assets/market-check.js').replace("  if (document.readyState === 'loading')", '  globalThis.__render = render; globalThis.__setRun = v => { runAt = v; };\n$&');
  vm.runInContext(src, ctx, { filename: 'assets/market-check.js' });
  for (let k = 0; k < 20; k++) await flush();
  const outIds = ['mc-t-cost', 'mc-t-cost-s', 'mc-t-15', 'mc-t-15-s', 'mc-t-12', 'mc-t-12-s', 'mc-t-prem', 'mc-t-prem-s', 'mc-payback'];
  const cases = [[2408.5496, 15, 90000, 'asis'], [2408.5496, 15, 90000, '12'], [2408.5496, 15, 66666, 'asis'], [2408.5496, 15, 66666, '12'], [153, 21, 11000, 'asis'], [153, 21, 11000, '12'], [500, 20, 25000, '15'], [300, 12, 12000, '12']];
  const out = {};
  for (const [th, w, p, r] of cases) {
    dom.get('mc-th').value = String(th); dom.get('mc-wth').value = String(w); dom.get('mc-price').value = String(p); dom.get('mc-growth').value = '0.3347';
    ctx.__setRun(r); ctx.__render();
    out[`${th} TH @ ${w} W, ${p} GMT, run ${r}`] = Object.fromEntries(outIds.map(id => [id, text(dom.get(id).textContent || dom.get(id).innerHTML)]));
  }
  return out;
}

// ---------- 4. quote tool (/quote) ----------
async function quoteSuite() {
  const dom = makeDom('quote/index.html'), ctx = makeCtx(dom);
  run(ctx, 'assets/pricing.js'); run(ctx, 'assets/quote.js');
  for (let k = 0; k < 20; k++) await flush();
  const out = {};
  const cases = [[10000, 0, true], [50000, 0, true], [250000, 0, true], [50000, 500, true], [50000, 0, false], [1000, 100, true]];
  for (const [cap, add, streak] of cases) {
    dom.get('qCap').value = String(cap); dom.get('qAdd').value = String(add); dom.get('qStreak').checked = streak;
    dom.fire('qCap'); dom.fire('qAdd'); dom.fire('qStreak', 'change'); await flush();
    out[`$${cap} + $${add}/mo, streak ${streak}`] = text(dom.get('qOut').innerHTML);
  }
  return out;
}

(async () => {
  const suites = { console: consoleSuite(), roi: await roiSuite(), checker: await checkerSuite(), quote: await quoteSuite() };
  fs.mkdirSync(OUT, { recursive: true });
  let fails = 0;
  for (const [name, got] of Object.entries(suites)) {
    const f = path.join(OUT, name + '.json');
    const s = JSON.stringify(got, null, 1) + '\n';
    if (UPDATE || !fs.existsSync(f)) { fs.writeFileSync(f, s); console.log(`recorded ${name}: ${Object.keys(got).length} cases`); continue; }
    const want = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const k of Object.keys(want)) {
      const a = JSON.stringify(want[k]), b = JSON.stringify(got[k]);
      if (a !== b) { fails++; console.log(`FAIL ${name} / ${k}`); const wa = a.split(','), gb = (b || '').split(','); for (let i = 0; i < Math.max(wa.length, gb.length); i++) if (wa[i] !== gb[i]) { console.log('   want', wa[i], '\n   got ', gb[i]); break; } }
    }
    if (!fails) console.log(`ok ${name}: ${Object.keys(want).length} cases identical`);
  }
  process.exit(fails ? 1 : 0);
})();
