#!/usr/bin/env node
/*
 * x-watch.js — detect a real network event worth posting about, and compute
 * every number the post is allowed to contain.
 *
 * Design: this script does ALL the arithmetic. The language model that writes
 * the post gets a fixed set of computed figures and may not introduce others —
 * scripts/x-verify.js enforces that before anything is published. An auto-poster
 * that invents a break-even figure is far worse than one that never posts.
 *
 * Only fires on genuine events (difficulty retarget, halving milestone, a real
 * hashprice move). No event, no post — that is what keeps this the right side
 * of X's duplicate-content rules, and the right side of the brand.
 *
 * Usage: node scripts/x-watch.js [--state path] [--out path] [--force TYPE]
 * Exit 0 = event found (JSON written). Exit 3 = nothing to post.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./constants.js');
const rainbow = require('./rainbow.js');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const STATE = argv('--state') || path.join(__dirname, '..', 'seo-data', 'bot-state.json');
const OUT   = argv('--out')   || path.join(__dirname, '..', 'x-event.json');
const FORCE = argv('--force');

// Post at most this often, no matter how many events fire. Two posts in a day
// from an automated account is how you get rate-limited.
const MIN_HOURS_BETWEEN_POSTS = 48;
// Thresholds for "this is actually news".
const DIFF_MOVE_PCT = 1.0;    // difficulty retarget worth mentioning
const SATS_MOVE_PCT = 3.0;    // sats/TH/day drift worth mentioning
const HALVING_MILESTONES = [600, 500, 400, 365, 300, 250, 200, 150, 100, 50, 30, 14, 7, 1];

// Reference setup the numbers are quoted against — matches the calculator default.
const REF_TH = 50, REF_WTH = C.EFF_BEST, REF_DISC = 20;

const fetchJSON = (url) => fetch(url, { signal: AbortSignal.timeout(15000) })
  .then(r => { if (!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); });

async function market() {
  let bp = 0, diff = 0;
  try { const r = await fetchJSON('https://api.coinpaprika.com/v1/tickers/btc-bitcoin'); bp = +r?.quotes?.USD?.price || 0; } catch (e) {}
  if (!bp) { try { const r = await fetchJSON('https://mempool.space/api/v1/prices'); bp = +r?.USD || 0; } catch (e) {} }
  try { const h = await fetchJSON('https://mempool.space/api/v1/mining/hashrate/3d'); diff = +h?.currentDifficulty || 0; } catch (e) {}
  if (!bp || !diff) throw new Error('could not fetch live market data — refusing to post on fallbacks');
  return { bp, diff, sats: C.satsPerTHDay(diff) };
}

// Break-even in months for the reference setup, total-capital model.
// Mirrors scripts/gen-pages.js model() so a post can never contradict a page.
function breakEvenMonths({ th, bp, diff, disc, wth = C.EFF_BEST }) {
  const now = Date.now();
  const dbt = C.dailyBTCperTH(diff);
  const fee = C.feesBTC(th, wth, bp);
  const gmtLockUSD = disc > 0 ? C.COV_DAYS_PER_PCT * disc * fee * bp : 0;
  const stakingUSD = gmtLockUSD * (C.STAKING_APR / 100) / 365.25;
  const totalCapital = th * C.cptTier(th) + gmtLockUSD;
  const dfeesUSD = fee * bp * (1 - disc / 100);
  let cum = 0;
  for (let m = 1; m <= 120; m++) {
    const t = now + m * 30.44 * 86400000;
    const dbt_t = Math.max(dbt * C.subsidyMultAt(t) * C.difficultyMultAt(t, now), C.rewardFloorBTC(bp));
    const mining = Math.max(0, dbt_t * th * bp - dfeesUSD) * (1 - C.CONVERSION_FEE);
    cum += (mining + stakingUSD) * 30.44;
    if (cum >= totalCapital) return m;
  }
  return null;
}

function monthlyNetUSD({ th, bp, diff, disc, wth = C.EFF_BEST }) {
  const dbt = C.dailyBTCperTH(diff);
  const fee = C.feesBTC(th, wth, bp);
  const mining = (dbt * th - fee * (1 - disc / 100)) * (1 - C.CONVERSION_FEE) * bp;
  const staking = (C.COV_DAYS_PER_PCT * disc * fee * bp) * (C.STAKING_APR / 100) / 365.25;
  return (mining + staking) * 30.44;
}

const yrs = m => m == null ? null : +(m / 12).toFixed(1);
const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };

function detect(state, mk) {
  const now = Date.now();
  const daysToHalving = Math.floor((C.HALVING_DATES[0] - now) / 86400000);

  if (FORCE) return { type: FORCE, forced: true, daysToHalving };

  // Rate limit first — an event we skip now will still be true next run.
  if (state.lastPostAt && (now - state.lastPostAt) < MIN_HOURS_BETWEEN_POSTS * 3600000) return null;

  // 1. Difficulty retarget.
  if (state.difficulty > 0) {
    const pct = ((mk.diff - state.difficulty) / state.difficulty) * 100;
    if (Math.abs(pct) >= DIFF_MOVE_PCT) {
      return { type: 'difficulty_retarget', changePct: +pct.toFixed(2), daysToHalving };
    }
  }

  // 2. Halving countdown milestone (fire once per milestone).
  const hit = HALVING_MILESTONES.find(m => daysToHalving <= m && (state.lastHalvingMilestone == null || m < state.lastHalvingMilestone));
  if (hit != null) return { type: 'halving_milestone', milestone: hit, daysToHalving };

  // 3. Sustained hashprice / issuance drift.
  if (state.sats > 0) {
    const pct = ((mk.sats - state.sats) / state.sats) * 100;
    if (Math.abs(pct) >= SATS_MOVE_PCT) {
      return { type: 'hashprice_move', changePct: +pct.toFixed(2), daysToHalving };
    }
  }
  return null;
}

(async () => {
  const mk = await market();
  const state = loadState();
  const ev = detect(state, mk);

  if (!ev) {
    console.log('no event — nothing to post');
    fs.writeFileSync(STATE, JSON.stringify({ ...state, difficulty: mk.diff, sats: mk.sats, checkedAt: Date.now() }, null, 1));
    process.exit(3);
  }

  const beNow = breakEvenMonths({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC });
  const beNoDisc = breakEvenMonths({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: 0 });
  const be15W = breakEvenMonths({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC, wth: C.EFF_BASE_MAX });
  const net = monthlyNetUSD({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC });

  // Rainbow-chart valuation context. Optional — if the price history is
  // unreachable we post without it rather than not posting at all.
  let rb = null;
  try {
    const r = await rainbow.load();
    const sc = r.stillCheap;
    rb = {
      rainbowStillCheapUSD: Math.round(sc),
      rainbowCenterUSD: Math.round(r.center),
      rainbowBandNow: r.bandAt(mk.bp).label,
      rainbowUpsidePct: +(((sc - mk.bp) / mk.bp) * 100).toFixed(1),
      breakEvenYearsAtStillCheap: yrs(breakEvenMonths({ th: REF_TH, bp: sc, diff: mk.diff, disc: REF_DISC })),
      monthlyNetAtStillCheap: +monthlyNetUSD({ th: REF_TH, bp: sc, diff: mk.diff, disc: REF_DISC }).toFixed(2)
    };
  } catch (e) {
    console.error('rainbow unavailable (posting without it):', e.message);
  }

  // Every figure the post is permitted to state. x-verify.js rejects anything else.
  const facts = {
    btcPrice: Math.round(mk.bp),
    satsPerTHDay: Math.round(mk.sats),
    difficultyT: +(mk.diff / 1e12).toFixed(1),
    refTH: REF_TH,
    refWTH: REF_WTH,
    refDiscountPct: REF_DISC,
    monthlyNetUSD: +net.toFixed(2),
    breakEvenYears: yrs(beNow),
    breakEvenYearsNoDiscount: yrs(beNoDisc),
    breakEvenYears15W: yrs(be15W),
    daysToHalving: ev.daysToHalving,
    stakingAPR: C.STAKING_APR,
    conversionFeePct: C.CONVERSION_FEE * 100,
    maxDiscountPct: 20,
    coverageDaysPerPct: C.COV_DAYS_PER_PCT,
    discountStepPct: 1,               // the discount is granted in whole 1% steps
    halvingYear: new Date(C.HALVING_DATES[0]).getUTCFullYear(),
    efficiencyBest: C.EFF_BEST,
    efficiencyBase: C.EFF_BASE_MAX,   // the 15 W/TH comparison point breakEvenYears15W refers to
    ...(ev.changePct != null ? { changePct: ev.changePct } : {}),
    ...(ev.milestone != null ? { milestone: ev.milestone } : {}),
    ...(rb || {})
  };

  fs.writeFileSync(OUT, JSON.stringify({ event: ev, facts, generatedAt: new Date().toISOString() }, null, 1));
  fs.writeFileSync(STATE, JSON.stringify({
    ...state, difficulty: mk.diff, sats: mk.sats, checkedAt: Date.now(),
    lastHalvingMilestone: ev.type === 'halving_milestone' ? ev.milestone : state.lastHalvingMilestone
  }, null, 1));

  console.log(`event: ${ev.type}`);
  console.log(JSON.stringify(facts, null, 1));
})().catch(e => { console.error('x-watch failed:', e.message); process.exit(1); });
