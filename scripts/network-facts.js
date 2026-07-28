#!/usr/bin/env node
/*
 * network-facts.js — compute today's real Bitcoin/GoMining figures, and flag
 * whatever is most notable about them, for the daily report to draw on.
 *
 * Design: this script does ALL the arithmetic. The daily report suggests a tweet
 * but may only quote figures that appear here — a suggestion carrying a
 * plausible-but-invented earnings figure is worse than no suggestion, because you'd
 * post it under your own name believing it was checked.
 *
 * `notable` marks whether anything actually moved (difficulty retarget, halving
 * milestone, hashprice drift). It is a hint about what is worth saying today,
 * not a gate: this runs daily and always writes its output.
 *
 * Usage: node scripts/network-facts.js [--state path] [--out path]
 * Exit 0 = facts written. Exit 1 = live data unavailable, nothing written.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./constants.js');
const rainbow = require('./rainbow.js');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const STATE = argv('--state') || path.join(__dirname, '..', 'seo-data', 'bot-state.json');
const OUT   = argv('--out')   || path.join(__dirname, '..', 'seo-data', 'network-facts.json');

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

// Cumulative earnings and run-rate at each year mark, total-capital model.
// Mirrors earnings() in scripts/gen-pages.js so a post can never contradict a page:
// same rainbow Still-cheap price path, same difficulty grind, cash only.
const YEAR_MARKS = [1, 3, 5, 10];
function earningsAt({ th, bp, diff, disc, wth = C.EFF_BEST, flat = false }) {
  const now = Date.now();
  const dbt = C.dailyBTCperTH(diff);
  const fee = C.feesBTC(th, wth, bp);
  const gmtLockUSD = disc > 0 ? C.COV_DAYS_PER_PCT * disc * fee * bp : 0;
  const stakingUSD = gmtLockUSD * (C.STAKING_APR / 100) / 365.25;
  const dfeesUSD = fee * bp * (1 - disc / 100);
  const rows = {};
  let cum = 0;
  for (let m = 1; m <= 120; m++) {
    const t = now + m * 30.44 * 86400000;
    const bp_t = flat ? bp : C.rbPriceAt(t, now, bp);
    const dbt_t = Math.max(dbt * C.subsidyMultAt(t) * C.difficultyMultAt(t, now), C.rewardFloorBTC(bp_t));
    const mining = Math.max(0, dbt_t * th * bp_t - dfeesUSD) * (1 - C.CONVERSION_FEE);
    const day = mining + stakingUSD;
    cum += day * 30.44;
    if (m % 12 === 0 && YEAR_MARKS.indexOf(m / 12) >= 0)
      rows[m / 12] = { total: +cum.toFixed(2), daily: +day.toFixed(2), monthly: +(day * 30.44).toFixed(2) };
  }
  return rows;
}

function monthlyNetUSD({ th, bp, diff, disc, wth = C.EFF_BEST }) {
  const dbt = C.dailyBTCperTH(diff);
  const fee = C.feesBTC(th, wth, bp);
  const mining = (dbt * th - fee * (1 - disc / 100)) * (1 - C.CONVERSION_FEE) * bp;
  const staking = (C.COV_DAYS_PER_PCT * disc * fee * bp) * (C.STAKING_APR / 100) / 365.25;
  return (mining + staking) * 30.44;
}

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; } };

// What, if anything, is worth leading with today. Returns null on a flat day —
// which is a normal and useful answer, not a failure.
function notable(state, mk) {
  const now = Date.now();
  const daysToHalving = Math.floor((C.HALVING_DATES[0] - now) / 86400000);

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
  const ev = notable(state, mk);
  const daysToHalving = Math.floor((C.HALVING_DATES[0] - Date.now()) / 86400000);

  const eNow = earningsAt({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC });
  // The downside the pages state next to the headline: price never moves again.
  const eFlat = earningsAt({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC, flat: true });
  const eNoDisc = earningsAt({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: 0 });
  const e15W = earningsAt({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC, wth: C.EFF_BASE_MAX });
  const net = monthlyNetUSD({ th: REF_TH, bp: mk.bp, diff: mk.diff, disc: REF_DISC });

  // Where price sits on the rainbow today — context for the band the projection
  // converges on. Optional: if the history is unreachable we post without it.
  let rb = null;
  try {
    const r = await rainbow.load();
    rb = {
      rainbowStillCheapUSD: Math.round(r.stillCheap),
      rainbowCenterUSD: Math.round(r.center),
      rainbowBandNow: r.bandAt(mk.bp).label,
      rainbowUpsidePct: +(((r.stillCheap - mk.bp) / mk.bp) * 100).toFixed(1)
    };
  } catch (e) {
    console.error('rainbow unavailable (continuing without it):', e.message);
  }

  // Every figure a suggested post is permitted to state. Anything not in here is
  // not a checked number, and must not appear in the report.
  const facts = {
    btcPrice: Math.round(mk.bp),
    satsPerTHDay: Math.round(mk.sats),
    difficultyT: +(mk.diff / 1e12).toFixed(1),
    refTH: REF_TH,
    refWTH: REF_WTH,
    refDiscountPct: REF_DISC,
    monthlyNetUSD: +net.toFixed(2),
    earned1yr: eNow[1].total,
    earned3yr: eNow[3].total,
    earned5yr: eNow[5].total,
    earned10yr: eNow[10].total,
    dailyAt5yr: eNow[5].daily,
    monthlyAt5yr: eNow[5].monthly,
    earned5yrFlatPrice: eFlat[5].total,
    earned5yrNoDiscount: eNoDisc[5].total,
    earned5yrAt15W: e15W[5].total,
    daysToHalving,
    stakingAPR: C.STAKING_APR,
    conversionFeePct: C.CONVERSION_FEE * 100,
    maxDiscountPct: 20,
    coverageDaysPerPct: C.COV_DAYS_PER_PCT,
    discountStepPct: 1,               // the discount is granted in whole 1% steps
    halvingYear: new Date(C.HALVING_DATES[0]).getUTCFullYear(),
    efficiencyBest: C.EFF_BEST,
    efficiencyBase: C.EFF_BASE_MAX,   // the 15 W/TH comparison point earned5yrAt15W refers to
    ...(ev && ev.changePct != null ? { changePct: ev.changePct } : {}),
    ...(ev && ev.milestone != null ? { milestone: ev.milestone } : {}),
    ...(rb || {})
  };

  fs.writeFileSync(OUT, JSON.stringify({ notable: ev, facts, generatedAt: new Date().toISOString() }, null, 1));
  fs.writeFileSync(STATE, JSON.stringify({
    ...state, difficulty: mk.diff, sats: mk.sats, checkedAt: Date.now(),
    // Only advance the milestone marker when one actually fired, so each rung of
    // the halving countdown is worth mentioning exactly once.
    lastHalvingMilestone: ev && ev.type === 'halving_milestone' ? ev.milestone : state.lastHalvingMilestone
  }, null, 1));

  console.log(ev ? `notable: ${ev.type}` : 'notable: nothing moved today');
  console.log(JSON.stringify(facts, null, 1));
})().catch(e => { console.error('network-facts failed:', e.message); process.exit(1); });
