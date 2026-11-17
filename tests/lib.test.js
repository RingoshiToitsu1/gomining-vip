#!/usr/bin/env node
/* Unit tests for lib/mining.js.
     node tests/lib.test.js
   1. Hand-checked values: each expected number is worked out by hand in the comment beside it.
   2. Agreement with the console engine: assets/app.js's own functions, loaded headless, must give
      the same answers as the library across a grid of farms (so the two can never drift apart).
*/
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const M = require('../lib/mining.js');
const cfg = require('../assets/pricing.js').CONFIG;
let pass = 0, fail = 0;
const eq = (name, got, want, tol = 1e-9) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)) : got === want;
  ok ? pass++ : (fail++, console.log(`FAIL ${name}: got ${got}, want ${want}`));
};

// ---------- 1. hand-checked ----------
eq('fee 15 W/TH', M.feeUsdPerThDay(15, cfg), 0.0269);                 // 0.05 × 24 × 15 / 1000 = 0.018, + 0.0089
eq('fee 12 W/TH', M.feeUsdPerThDay(12, cfg), 0.0233);                 // 0.0144 + 0.0089
eq('token disc 17 days', M.tokenDiscountPct(17, cfg), 0);             // under one 18-day step
eq('token disc 36 days', M.tokenDiscountPct(36, cfg), 2);             // two whole steps
eq('token disc 359 days', M.tokenDiscountPct(359, cfg), 19);          // floor(359 / 18) = 19
eq('token disc 360 days', M.tokenDiscountPct(360, cfg), 20);          // the cap
eq('token disc 5000 days', M.tokenDiscountPct(5000, cfg), 20);        // capped
eq('non-token: VIP 1.8 + streak 3 + solo 1.09', M.nonTokenDiscountPct({ vipPct: 1.8, clickStreak: true, soloPct: 1.09 }, cfg), 5.89);
eq('non-token capped at 30', M.nonTokenDiscountPct({ vipPct: 25, clickStreak: true, soloPct: 10 }, cfg), 30);
eq('total 20 + 5.89', M.totalDiscountPct(20, 5.89, cfg), 25.89);
eq('total capped', M.totalDiscountPct(20, 15, cfg), 30);
eq('VIP 0 TH', M.vipTier(0, 0, cfg).n, 'Bronze I');
eq('VIP 100 TH', M.vipTier(100, 0, cfg).n, 'Gold I');
eq('VIP by GMT (2000 veGMT)', M.vipTier(1, 2000, cfg).n, 'Gold II');  // GMT path lifts it higher than TH
eq('VIP 1,000,000 TH', M.vipTier(1e6, 0, cfg).n, 'Elite');
eq('bonus 100 TH', M.referralBonusTh(100, cfg), 5);                   // 5%
eq('bonus 1000 TH capped', M.referralBonusTh(1000, cfg), 25);          // 50 → cap 25
eq('upgrade 20 W', M.upgradeUsdPerTh(20, cfg), 13.51, 1e-9);           // 5 × 1.10 + 3 × 2.67
eq('upgrade 15 W', M.upgradeUsdPerTh(15, cfg), 8.01, 1e-9);            // 3 × 2.67
eq('upgrade 12 W', M.upgradeUsdPerTh(12, cfg), 0);
eq('price at 4 TH (tier)', M.priceAtSize(cfg.pricing.thTiers15wList, 4), 12.00);
eq('price at 3 TH (between 2 and 4)', M.priceAtSize(cfg.pricing.thTiers15wList, 3), (12.51 + 12.00) / 2);
eq('price above 5000 clamps', M.priceAtSize(cfg.pricing.thTiers15wList, 9000), 10.96);
eq('full-discount GMT, 10 GMT/day fees', M.gmtForFullDiscount(10, cfg), 3600);   // 10 × 18 × 20
eq('sats/TH/day @ 113 T', M.satsPerTHDay(113e12, cfg), (1e12 * 86400 * 3.125) / (113e12 * 2 ** 32) * 1e8);
eq('staking 10k GMT @ 18.87% @ $0.30', M.stakingUsdPerDay(10000, 18.87, 0.30), 10000 * 0.30 * 0.1887 / 365.25);

// farmToday: 100 TH @ 15 W, 3266 GMT locked, the quick-estimate case (BTC 84k, GMT 0.28, 113 T difficulty)
const f = M.farmToday({ th: 100, wth: 15, lockedGmt: 3266, aprPct: 18.87, clickStreak: true, btcPrice: 84000, gmtPrice: 0.28, satsPerTH: M.satsPerTHDay(113e12, cfg) }, cfg);
eq('farmToday total discount', Math.round(f.totD * 100) / 100, 25.89);        // 20 + 1.8 Gold II + 3 + 1.09
eq('farmToday mining $/mo (×30.44)', Math.round(f.mining * 30.44 * 100) / 100, 80.65);   // matches the landing quick estimate
eq('farmToday staking $/mo', Math.round(f.staking * 30.44 * 100) / 100, 14.38);

// ---------- 2. agreement with the console engine (assets/app.js) ----------
{
  const els = new Map();
  const el = id => els.get(id) || els.set(id, { id, value: '', checked: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild: c => c, querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }), getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }).get(id);
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Date, Intl, URL, URLSearchParams, Promise, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, performance: { now: () => 0 }, navigator: { language: 'en-US' }, location: { search: '', pathname: '/', hash: '', href: '' }, history: { replaceState() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {} }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; }, ResizeObserver: function () { return { observe() {}, disconnect() {} }; }, MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    fetch: () => Promise.reject(new Error('offline')), getComputedStyle: () => ({ getPropertyValue: () => '' }), scrollTo() {}, addEventListener() {}, innerWidth: 1280, innerHeight: 800 };
  ctx.document = { readyState: 'complete', getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: () => el(''), addEventListener() {}, body: el('body'), documentElement: el('html'), head: el('head') };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/pricing.js'), 'utf8'), ctx);
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/app.js'), 'utf8'), ctx); } catch (e) { /* UI wiring past the engine */ }
  const app = (expr) => vm.runInContext(expr, ctx);
  for (const wth of [12, 13.5, 15, 18, 20, 25, 35]) {
    // app.js fees(th, wth, btcPrice) returns BTC/day; ×price = USD
    eq(`fee vs app.js @ ${wth} W`, app(`fees(1, ${wth}, 50000).t`) * 50000, M.feeUsdPerThDay(wth, cfg), 1e-9);
  }
  for (const [th, veg] of [[0, 0], [7, 0], [99, 0], [100, 0], [3000, 30000], [0, 120000], [20000, 0], [60000, 0], [1e6, 0]]) {
    eq(`VIP vs app.js th=${th} veg=${veg}`, app(`vipOf(${th}, ${veg}).n`), M.vipTier(th, veg, cfg).n);
  }
  for (const th of [1, 3, 10, 100, 777, 5000, 9000]) {
    eq(`15 W price vs app.js @ ${th} TH`, app(`cptTier(TH_TIERS, ${th})`), M.priceAtSize(require('../assets/pricing.js').TH_TIERS_15W, th), 1e-9);
  }
  // whole-farm discount and net mining vs calc()
  const S = 'S.btcPrice=84000;S.gmtPrice=0.28;S.satsPerTHDay=' + M.satsPerTHDay(113e12, cfg) + ';S.loaded=true;S.fxRate=1;';
  app(S);
  for (const [th, wth, gl] of [[100, 15, 3266], [100, 15, 0], [1000, 12, 200000], [250, 18, 20000], [5000, 15, 600000]]) {
    const set = (id, v) => { const e = el(id); if (typeof v === 'boolean') e.checked = v; else e.value = String(v); };
    Object.entries({ inTH: th, inWTH: wth, inGMTLocked: gl, inGMTWallet: 0, inLockAPR: 18.87, inClickStreak: true, inPayGMT: true, inMiningMode: cfg.rates.soloMiningDiscountPct, inCapital: 0, inGreedyTH: 0, inInactiveTH: 0 }).forEach(([k, v]) => set(k, v));
    const c = app('calc(inp())');
    const lib = M.farmToday({ th, wth, lockedGmt: gl, aprPct: 18.87, clickStreak: true, btcPrice: 84000, gmtPrice: 0.28, satsPerTH: M.satsPerTHDay(113e12, cfg) }, cfg);
    eq(`total discount vs calc() ${th} TH @ ${wth} W, ${gl} GMT`, c.totD, lib.totD, 1e-9);
    eq(`net mining vs calc() ${th} TH @ ${wth} W, ${gl} GMT`, c.net * 84000, lib.mining, 1e-6);
  }
}

console.log(`lib tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
