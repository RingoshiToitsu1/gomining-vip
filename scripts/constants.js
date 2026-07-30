/* Shared economics constants + core engine for the Node-side tooling.
   ==================================================================
   Single source of truth for scripts/gen-pages.js and scripts/x-watch.js.

   This module exists because the 2026-07-07 calibration (4f6cc75) updated
   index.html but not gen-pages.js, leaving the SEO pages publishing a retired
   conversion fee and staking APR for three weeks. One file to recalibrate.

   The browser side (assets/app.js, assets/roi-embed.js) cannot require() this,
   so those still carry their own copies — when you recalibrate, update this
   file AND that pair. Nothing else should hold these numbers.
*/
'use strict';

// ---- calibration (recalibrate against the GoMining MCP / app periodically) ----
const BLOCK_SUBSIDY   = 3.125;   // BTC/block (→ 1.5625 at 2028 halving)
const ELECTRICITY_RATE= 0.05;    // $/kWh on (W/TH × TH × 24h)
const SERVICE_RATE    = 0.0089;  // $/TH/day platform service fee
const CONVERSION_FEE  = 0.0225;  // BTC→GMT payout skim (calibrated 2026-07-07)
const STAKING_APR     = 21.73;   // % — GMT locked-staking APR (observed 2026-07-26)
const MINING_MODE     = 0.83;    // % — mining-mode discount (observed 2026-07-26)
const CLICK_STREAK    = 3;       // % — daily click streak, binary once held 10 days
const EFF_BEST        = 12;      // W/TH — freshly-minted new miners
const EFF_BASE_MAX    = 15;      // W/TH — cheaper marketplace hashrate
const MINER_FLOOR_WTH = EFF_BEST;// network marginal miner for the no-arbitrage floor
const COV_DAYS_PER_PCT= 18;      // 18 days of fee coverage per 1% token discount (360d = 20% cap)

const HALVING_DATES   = [Date.UTC(2028,3,15),Date.UTC(2032,3,15),Date.UTC(2036,3,15),Date.UTC(2040,3,15)];
// Difficulty grind. Paired with the RAINBOW price path below — price and difficulty are
// anti-correlated, so a healthier price world has to carry faster hashrate growth or the
// projection banks the upside twice. 0.37 is the 3yr trailing CAGR; the maximally
// decelerated 2yr figure (0.25) belonged with the old flat/capitulation pricing.
// Mirrors DIFF_G0 in assets/app.js and assets/roi-embed.js.
const DIFF_G0=0.37, DIFF_FLOOR=0.05, DIFF_TAU=4;

// ---- Bitcoin Power-Law (rainbow) price path ----
// The single price assumption across the whole product: pages, inline calculator and
// console all converge on the "Still cheap" band, one step below the Power-Law centre.
// Previously the pages held price FLAT forever while the console used this, so the two
// disagreed by ~3x on the same setup.
// Fit refreshed 2026-07-28 from blockchain.com daily closes (2012+). Recompute with
// scripts/rainbow.js and paste back; it moves slowly, so an occasional refresh is enough.
const RB_FIT = { m:2.4257730142322704, b:-16.148215459680067 };
const RB_GEN = Date.UTC(2009,0,3);        // genesis-era reference for the log-time axis
const RB_STILL_CHEAP_OFF = -0.10;         // midpoint of the "Still cheap" band, log10 units
const RB_ACCUMULATE_OFF  = -0.20;         // one band lower — the downside case. There is no
                                          // flat-price scenario anywhere in this product: a
                                          // price pinned for a decade is not a conservative
                                          // assumption, it is an impossible one. The downside
                                          // is a WORSE PATH, not a stopped clock.
const rbDayOf = t => Math.max(1,(t-RB_GEN)/86400000);
// Band price at time t, independent of today's spot.
const rbBandPrice = (t,off=RB_STILL_CHEAP_OFF) =>
  Math.pow(10, RB_FIT.m*Math.log(rbDayOf(t)) + RB_FIT.b + off);

// New-miner tiered $/TH (12 W/TH), LIST price. Keep in sync with TH_TIERS_12W in
// assets/app.js and assets/roi-embed.js.
// Repriced 2026-07-29: GoMining cut 12 W/TH pricing ~10-15%. Observed prices were net
// of a 5% NFT holder discount, so every tier is grossed up by /0.95 to the list price a
// new user actually pays — 1 TH reconstructs to exactly $17.00, which confirms the
// discount is 5% off list rather than 5% added on. Do NOT paste discounted quotes in
// here: the site must quote what its readers pay, not what one account pays.
const TH_TIERS_12W=[
  {th:1,cpt:17.00},{th:2,cpt:16.95},{th:4,cpt:16.82},{th:8,cpt:16.75},
  {th:16,cpt:16.68},{th:32,cpt:16.59},{th:48,cpt:16.51},{th:64,cpt:16.41},
  {th:96,cpt:16.33},{th:128,cpt:16.23},{th:192,cpt:16.15},{th:256,cpt:16.07},
  {th:384,cpt:15.99},{th:512,cpt:15.91},{th:768,cpt:15.82},{th:1024,cpt:15.75},
  {th:1536,cpt:15.66},{th:2560,cpt:15.59},{th:3584,cpt:15.51},{th:5000,cpt:15.43}
];

// 15 W/TH hashrate — the cheaper, less efficient curve. Mirrors TH_TIERS in assets/app.js
// and TH_TIERS_15W in assets/roi-embed.js. Repriced 2026-07-30, grossed up /0.95 from
// quotes net of a 5% NFT discount. The split against TH_TIERS_12W is by EFFICIENCY, not
// mint-versus-upgrade: at a given W/TH the price per TH is the same either way.
const TH_TIERS_15W=[
  {th:1,cpt:10.28},{th:2,cpt:10.27},{th:4,cpt:10.25},{th:8,cpt:10.23},
  {th:16,cpt:10.21},{th:32,cpt:10.19},{th:48,cpt:10.18},{th:64,cpt:10.16},
  {th:96,cpt:10.14},{th:128,cpt:10.12},{th:192,cpt:10.09},{th:256,cpt:10.07},
  {th:384,cpt:10.04},{th:512,cpt:10.02},{th:768,cpt:9.99},{th:1024,cpt:9.97},
  {th:1536,cpt:9.94},{th:2560,cpt:9.91},{th:3584,cpt:9.88},{th:5000,cpt:9.86}
];

// Citable analyst price milestones. Used ONLY for clearly-labeled forecast cases.
const BTC_ANCHORS=[
  {t:Date.UTC(2028,11,31), p:500000,  src:'Standard Chartered ($500k by 2028)'},
  {t:Date.UTC(2033,11,31), p:1000000, src:'Bernstein ($1M by 2033)'}
];

const FB = { btcPrice:84000, difficulty:113e12 };

// ---- engine ----
// The headline price path: start at today's REAL spot and converge onto the Still-cheap
// band by `convergeMs` (default the next halving), holding the log-deviation and decaying
// it to zero. Identical treatment to bpForDay() in assets/app.js, so a page and the
// console quote the same price for the same date.
function rbPriceAt(t, now, p0, off=RB_STILL_CHEAP_OFF, convergeMs){
  if(t<=now)return p0;
  const target=convergeMs||HALVING_DATES.find(h=>h>now)||(now+1095*86400000);
  const off0=Math.log(p0/rbBandPrice(now,off));
  const progress=Math.min(1,Math.max(0,(t-now)/Math.max(1,target-now)));
  return rbBandPrice(t,off)*Math.exp(off0*(1-progress));
}
function priceAt(t, now, p0){
  if(t<=now)return p0;
  const pts=[{t:now,p:p0},...BTC_ANCHORS];
  if(t>=pts[pts.length-1].t)return pts[pts.length-1].p;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    if(t>=a.t&&t<=b.t)return a.p*Math.pow(b.p/a.p,(t-a.t)/(b.t-a.t));
  }
  return p0;
}
function cptTier(th, T=TH_TIERS_12W){
  if(th<=T[0].th)return T[0].cpt;
  if(th>=T[T.length-1].th)return T[T.length-1].cpt;
  for(let i=0;i<T.length-1;i++){
    const lo=T[i],hi=T[i+1];
    if(th>=lo.th&&th<=hi.th)return lo.cpt+(hi.cpt-lo.cpt)*((th-lo.th)/(hi.th-lo.th));
  }
  return T[0].cpt;
}
// $/TH at a given efficiency, interpolated linearly in W between the two published
// curves and clamped outside them. 12 W hashrate costs ~60% more per TH than 15 W, so
// pricing every setup off one curve distorts the capital that every rate divides by.
function cptAtEff(th, wth){
  const w=Math.min(Math.max(wth||EFF_BEST,EFF_BEST),EFF_BASE_MAX);
  const f=(w-EFF_BEST)/(EFF_BASE_MAX-EFF_BEST);
  return cptTier(th,TH_TIERS_12W)*(1-f)+cptTier(th,TH_TIERS_15W)*f;
}
function feePerTHDay(wth){return (ELECTRICITY_RATE*24*wth)/1000 + SERVICE_RATE;}
function satsPerTHDay(diff){return ((1e12*86400*BLOCK_SUBSIDY)/(diff*2**32))*1e8;}
function dailyBTCperTH(diff){return Math.round(satsPerTHDay(diff))/1e8;}
function feesBTC(th,wth,bp){const e=(ELECTRICITY_RATE*24*wth)/bp/1000*th,s=(SERVICE_RATE/bp)*th;return e+s;}
function subsidyMultAt(t){let m=1;for(const h of HALVING_DATES)if(t>=h)m*=0.5;return m;}
function difficultyMultAt(t,now){
  const yrs=(t-now)/(365.25*86400000);
  if(yrs<=0)return 1;
  const integral=DIFF_FLOOR*yrs+(DIFF_G0-DIFF_FLOOR)*DIFF_TAU*(1-Math.exp(-yrs/DIFF_TAU));
  return 1/Math.exp(integral);
}
function rewardFloorBTC(price){return price>0?(0.0012*MINER_FLOOR_WTH+0.0089)/price:0;}

module.exports = {
  BLOCK_SUBSIDY, ELECTRICITY_RATE, SERVICE_RATE, CONVERSION_FEE, STAKING_APR,
  MINING_MODE, CLICK_STREAK, EFF_BEST, EFF_BASE_MAX, MINER_FLOOR_WTH,
  COV_DAYS_PER_PCT, HALVING_DATES, DIFF_G0, DIFF_FLOOR, DIFF_TAU,
  TH_TIERS_12W, TH_TIERS_15W, BTC_ANCHORS, FB,
  RB_FIT, RB_GEN, RB_STILL_CHEAP_OFF, RB_ACCUMULATE_OFF, rbDayOf, rbBandPrice, rbPriceAt,
  priceAt, cptTier, cptAtEff, feePerTHDay, satsPerTHDay, dailyBTCperTH, feesBTC,
  subsidyMultAt, difficultyMultAt, rewardFloorBTC
};
