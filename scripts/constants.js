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
const DIFF_G0=0.25, DIFF_FLOOR=0.05, DIFF_TAU=4;

// New-miner tiered $/TH (12 W/TH). Keep in sync with TH_TIERS_12W in assets/app.js.
// Repriced 2026-07-25 from four confirmed observations — 1 TH $19.99, 64 TH $18.33,
// 512 TH $17.78, 5000 TH $17.24 — remaining tiers interpolated in log10(TH).
const TH_TIERS_12W=[
  {th:1,cpt:19.99},{th:2,cpt:19.71},{th:4,cpt:19.44},{th:8,cpt:19.16},
  {th:16,cpt:18.88},{th:32,cpt:18.61},{th:48,cpt:18.44},{th:64,cpt:18.33},
  {th:96,cpt:18.22},{th:128,cpt:18.15},{th:192,cpt:18.04},{th:256,cpt:17.96},
  {th:384,cpt:17.86},{th:512,cpt:17.78},{th:768,cpt:17.68},{th:1024,cpt:17.62},
  {th:1536,cpt:17.52},{th:2560,cpt:17.40},{th:3584,cpt:17.32},{th:5000,cpt:17.24}
];

// Citable analyst price milestones. Used ONLY for clearly-labeled forecast cases.
const BTC_ANCHORS=[
  {t:Date.UTC(2028,11,31), p:500000,  src:'Standard Chartered ($500k by 2028)'},
  {t:Date.UTC(2033,11,31), p:1000000, src:'Bernstein ($1M by 2033)'}
];

const FB = { btcPrice:84000, difficulty:113e12 };

// ---- engine ----
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
  TH_TIERS_12W, BTC_ANCHORS, FB,
  priceAt, cptTier, feePerTHDay, satsPerTHDay, dailyBTCperTH, feesBTC,
  subsidyMultAt, difficultyMultAt, rewardFloorBTC
};
