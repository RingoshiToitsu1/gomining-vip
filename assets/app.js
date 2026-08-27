/* GMT Optimizer — app engine (extracted verbatim from index.html) */
// Always load at the top — don't let the browser restore a stale scroll position.
if('scrollRestoration' in history){history.scrollRestoration='manual';}
window.scrollTo(0,0);
window.addEventListener('load',()=>window.scrollTo(0,0));
// ---- STATE ----
const S = { btcPrice:0, gmtPrice:0, difficulty:0, netHashrate:0, avgTxFees:0, satsPerTHDay:0, apiOk:false, timer:3600, loaded:false, currency:'USD', fxRate:1, priceStale:false, priceCachedAt:0, discountOverride:null };
const FB = { btcPrice:84000, gmtPrice:0.28, difficulty:113e12, avgTxFees:0.15 };
// ---- GOMINING-SET RATES (calibrate against the MCP server / app periodically) ----
// Source: https://docs.gomining.com/en/product/ai/mcp-server (Wallet → conversion
// quotes, Miners → reward stats, VIP → benefits). Last calibrated: 2026-05-17.
const CONVERSION_FEE  = 0.0225;  // BTC → GMT conversion skim (reinvesting rewards into GMT), applied to (PR - fees) at payout (PR shown by GoMining is pre-skim)
const USD_GMT_FEE     = 0.02;    // Capital Planner: fee when deploying USD capital into GMT (to lock OR to mint TH, since TH is paid in GMT). Existing GMT on hand is unaffected.
// GMT tracks BTC. Calibration anchor from observed history: BTC $120k ↔ GMT $0.52.
// The New Monthly Income sim fits a line through (live BTC, live GMT) and this anchor.
const GMT_ANCHOR_BTC  = 120000;
const GMT_ANCHOR_GMT  = 0.52;
// GoMining quotes a SUBSIDY-ONLY sats/TH/day (block reward, no tx fees). Adding live
// mempool tx fees overshot the app (~50 vs 45 sats during a fee spike). Verified 2026-06-13:
// subsidy-only at current difficulty ≈ 45, matching the GoMining app. The app rounds to the
// nearest whole sat (not floor) — see dailyBTCperTH. Bump at each halving.
const BLOCK_SUBSIDY   = 3.125;   // BTC per block (post-2024 halving; → 1.5625 at the 2028 halving)
const ELECTRICITY_RATE= 0.05;    // $/kWh charged on (W/TH × TH × 24h)
const SERVICE_RATE    = 0.0089;  // $/TH/day platform service fee
const GREEDY_CAP      = 5000;    // max TH per miner via manual upgrades; passive growth compounds past this

// ---- AMBASSADOR (referral) COMMISSION ----
// GoMining pays an ambassador $0.005 per kWh their referrals' miners consume, so the stream is
// driven by the referral's ENERGY draw — hashrate x W/TH — not by hashrate alone. A referral who
// mints today runs at 12 W/TH and therefore pays 20% less than the 15 W/TH machines this used to
// assume for everyone. Hand-entered "Referred TH" keeps the 15 W default (their vintage is unknown);
// TH the Capital Planner mints for a referral is priced at EFF_BEST, because that is what it buys.
const AMB_RATE_PER_KWH = 0.005;
const AMB_DEFAULT_WTH  = 15;
function ambDailyUSD(th,wth){return Math.max(0,+th||0)*((wth>0?wth:AMB_DEFAULT_WTH)*24/1000)*AMB_RATE_PER_KWH;}

// ---- VIP TIERS ----
const TIERS=[
  {n:'Bronze I',th:0,veg:0,d:0,rb:0},{n:'Bronze II',th:5,veg:50,d:.3,rb:0},
  {n:'Silver I',th:10,veg:100,d:.6,rb:5},{n:'Silver II',th:25,veg:250,d:.9,rb:0},
  {n:'Silver III',th:50,veg:500,d:1.2,rb:0},{n:'Gold I',th:100,veg:1000,d:1.5,rb:0},
  {n:'Gold II',th:200,veg:2000,d:1.8,rb:0},{n:'Platinum I',th:500,veg:5000,d:2.1,rb:0},
  {n:'Platinum II',th:1000,veg:10000,d:2.4,rb:0},{n:'Platinum III',th:2500,veg:25000,d:2.7,rb:0},
  {n:'Diamond I',th:5000,veg:50000,d:3.0,rb:10},{n:'Diamond II',th:7000,veg:70000,d:3.3,rb:0},
  {n:'Diamond III',th:9000,veg:90000,d:3.6,rb:0},{n:'Diamond IV',th:12000,veg:120000,d:3.9,rb:0},
  {n:'Diamond V',th:20000,veg:200000,d:4.2,rb:0},
  {n:'Legend I',th:50000,veg:500000,d:4.5,rb:0},{n:'Legend II',th:100000,veg:1000000,d:4.8,rb:0},
  {n:'Legend III',th:250000,veg:2500000,d:5.1,rb:0},{n:'Legend IV',th:400000,veg:4000000,d:5.4,rb:0},
  {n:'Legend V',th:750000,veg:7500000,d:5.7,rb:0},{n:'Elite',th:1000000,veg:10000000,d:6.0,rb:0}
];
// VIP tier qualifies via locked GMT OR hashrate — whichever lifts you higher. GMT is the cheaper
// path per discount %, but TH still climbs your VIP level (matters once you're at the max token
// discount and keep growing the farm).
const vipOf=(th,veg)=>{let t=TIERS[0];for(const x of TIERS)if(th>=x.th||veg>=x.veg)t=x;return t};
const nextVip=(th,veg)=>{for(const x of TIERS)if(th<x.th&&veg<x.veg)return x;return null};
const tierCls=n=>n.startsWith('Bronze')?'bronze':n.startsWith('Silver')?'silver':n.startsWith('Gold')?'gold':n.startsWith('Platinum')?'platinum':n.startsWith('Legend')||n==='Elite'?'legend':'diamond';

// ---- TH COST TIERS ----
// 15 W/TH hashrate — the cheaper, less efficient curve. Applies whether you are minting
// or adding TH: at a given efficiency the price per TH is the same either way. The split
// against TH_TIERS_12W is by EFFICIENCY, not mint-versus-upgrade.
// Repriced 2026-07-30 (cut ~9.5% across the curve, one day after the previous cut).
// All twenty tiers observed this time, so nothing is extrapolated. Quotes were net of a
// 5% NFT discount and are grossed up by /0.95 to the list price a reader actually pays;
// every tier round-trips to the quote exactly.
const TH_TIERS=[
  {th:1,cpt:10.28},{th:2,cpt:10.27},{th:4,cpt:10.25},{th:8,cpt:10.23},
  {th:16,cpt:10.21},{th:32,cpt:10.19},{th:48,cpt:10.18},{th:64,cpt:10.16},
  {th:96,cpt:10.14},{th:128,cpt:10.12},{th:192,cpt:10.09},{th:256,cpt:10.07},
  {th:384,cpt:10.04},{th:512,cpt:10.02},{th:768,cpt:9.99},{th:1024,cpt:9.97},
  {th:1536,cpt:9.94},{th:2560,cpt:9.91},{th:3584,cpt:9.88},{th:5000,cpt:9.86}
];
function avatarDiscMult(){return $('inAvatarDisc')&&$('inAvatarDisc').checked?0.95:1;}
function estimateCPT(th){
  const disc=avatarDiscMult();
  if(th<=0)return TH_TIERS[0].cpt*disc;
  if(th>=TH_TIERS[TH_TIERS.length-1].th)return TH_TIERS[TH_TIERS.length-1].cpt*disc;
  for(let i=0;i<TH_TIERS.length-1;i++){
    const lo=TH_TIERS[i],hi=TH_TIERS[i+1];
    if(th>=lo.th&&th<=hi.th){
      const pct=(th-lo.th)/(hi.th-lo.th);
      return (lo.cpt+(hi.cpt-lo.cpt)*pct)*disc;
    }
  }
  return TH_TIERS[0].cpt*disc;
}
function thForBudget(budget){
  if(budget<=0)return 0;
  let lo=0,hi=budget/(TH_TIERS[TH_TIERS.length-1].cpt*avatarDiscMult());
  for(let k=0;k<50;k++){
    const mid=(lo+hi)/2;
    if(mid*estimateCPT(mid)<budget)lo=mid;else hi=mid;
  }
  return(lo+hi)/2;
}

/* ============================================================
   12 W/TH economics — new-miner pricing & efficiency upgrades
   ============================================================ */
// New miners can ONLY be created at 12 W/TH now, at this tiered $/TH (tiers down with block size).
// Repriced 2026-07-25: GoMining cut 12 W/TH pricing, and the volume taper compressed with it —
// 20.0% end-to-end down to 13.8%. Four CONFIRMED observations anchor the curve:
//   1 TH $19.99 (was 21.99) · 64 TH $18.33 · 512 TH $17.78 · 5000 TH $17.24 (was 17.60)
// The other 16 tiers interpolate piecewise-linearly in log10(TH) between those anchors, which
// hits all four exactly and stays strictly decreasing. The real curve falls faster early and
// flattens sooner than a uniform rescale of the old shape would suggest (-$0.34/TH at 48 TH).
// Pre-avatar-discount.
const TH_TIERS_12W=[
  {th:1,cpt:17.00},{th:2,cpt:16.95},{th:4,cpt:16.82},{th:8,cpt:16.75},
  {th:16,cpt:16.68},{th:32,cpt:16.59},{th:48,cpt:16.51},{th:64,cpt:16.41},
  {th:96,cpt:16.33},{th:128,cpt:16.23},{th:192,cpt:16.15},{th:256,cpt:16.07},
  {th:384,cpt:15.99},{th:512,cpt:15.91},{th:768,cpt:15.82},{th:1024,cpt:15.75},
  {th:1536,cpt:15.66},{th:2560,cpt:15.59},{th:3584,cpt:15.51},{th:5000,cpt:15.43}
];
const EFF_UPGRADE_STEP=2.67;  // $/TH to improve efficiency by 1 W/TH toward 12
const EFF_BEST=12;            // best efficiency available now
const EFF_BASE_MAX=15;        // ≥15 W/TH is priced as 15 for upgrades; also the marketplace-machine baseline
const MINER_CAP=5000;         // TH per machine via upgrades before a new 12 W machine is required

// Interpolate any tiered $/TH price table.
function cptTier(tiers,th){
  const disc=avatarDiscMult();
  if(th<=0)return tiers[0].cpt*disc;
  if(th>=tiers[tiers.length-1].th)return tiers[tiers.length-1].cpt*disc;
  for(let i=0;i<tiers.length-1;i++){const lo=tiers[i],hi=tiers[i+1];
    if(th>=lo.th&&th<=hi.th)return (lo.cpt+(hi.cpt-lo.cpt)*((th-lo.th)/(hi.th-lo.th)))*disc;}
  return tiers[0].cpt*disc;
}
function estimateCPT12(th){return cptTier(TH_TIERS_12W,th);}
// Marginal cost to grow a 12 W miner from `cur` TH by `add` TH — the slice of the price curve
// from cur → cur+add. Topping up an existing miner is CHEAPER than a new one, which re-pays the
// pricey 0 → add slice: a miner already at `cur` starts lower on the descending curve.
// --- Tiered top-up pricing --------------------------------------------------------------
// Adding TH to a miner you already own is cheaper than a new one: you skip the pricey first-TH
// tiers and stay on the descending part of the curve. These helpers are curve-agnostic (12 W or
// 15 W) and track per-miner fleet state, so the planner AND the forward projection price it right.
function costToGrowTiers(cur,add,tiers){ if(!(add>0))return 0; cur=Math.max(0,cur); return Math.max(0,(cur+add)*cptTier(tiers,cur+add)-cur*cptTier(tiers,cur)); }
function costToGrow12(cur,add){ return costToGrowTiers(cur,add,TH_TIERS_12W); }
// TH a `budget` adds to ONE miner already at `cur` TH (single miner, uncapped — used for the greedy).
function thToGrowTiers(cur,budget,tiers){
  if(!(budget>0))return 0;
  var lo=0,hi=budget/(tiers[tiers.length-1].cpt*avatarDiscMult()),g=0;
  while(costToGrowTiers(cur,hi,tiers)<budget&&g++<40)hi*=2;
  for(var k=0;k<60;k++){var m=(lo+hi)/2;if(costToGrowTiers(cur,m,tiers)<budget)lo=m;else hi=m;}
  return(lo+hi)/2;
}
// Min cost to add `x` TH given a fleet of miner sizes: fill existing miners toward the 5,000 cap
// first (cheapest marginal tier), then mint new NFTs.
function costToAddTiers(x,sizes,tiers){
  if(!(x>0))return 0;
  var cost=0,left=x,i,add;
  for(i=0;i<sizes.length&&left>0.0001;i++){ add=Math.min(MINER_CAP-sizes[i],left); if(add<=0)continue; cost+=costToGrowTiers(sizes[i],add,tiers); left-=add; }
  while(left>0.0001){ add=Math.min(MINER_CAP,left); cost+=costToGrowTiers(0,add,tiers); left-=add; }
  return cost;
}
// Budget → TH, crediting the top-up of existing miners. Falls back to fresh-miner pricing when
// there are no per-miner sizes to top up.
function thForBudgetFromSizes(budget,sizes,tiers){
  if(!(budget>0))return 0;
  if(!sizes||!sizes.length)return thForBudgetTiers(budget,tiers);
  var lo=0,hi=budget/(tiers[tiers.length-1].cpt*avatarDiscMult()),g=0;
  while(costToAddTiers(hi,sizes,tiers)<budget&&g++<40)hi*=2;
  for(var k=0;k<60;k++){var m=(lo+hi)/2;if(costToAddTiers(m,sizes,tiers)<budget)lo=m;else hi=m;}
  return(lo+hi)/2;
}
// Add `x` TH to a fleet (fill largest first, then new 5,000-cap NFTs). Returns the new size list
// with capped miners dropped — they can't be topped up, so they don't affect future pricing.
function applyAddSizes(sizes,x){
  sizes=sizes.slice().sort(function(a,b){return b-a;});
  var left=x,i,add;
  for(i=0;i<sizes.length&&left>0.0001;i++){ add=Math.min(MINER_CAP-sizes[i],left); if(add>0){ sizes[i]+=add; left-=add; } }
  while(left>0.0001){ add=Math.min(MINER_CAP,left); sizes.push(add); left-=add; }
  return sizes.filter(function(s){return s<MINER_CAP-1e-6;});
}
// The user's real miners we can top up with 12 W TH, largest first. A miner has ONE efficiency
// rating: hashrate added to a 15 W machine is 15 W hashrate. So a >12 W miner is only 12 W-toppable
// after an efficiency upgrade is actually paid for — the greedy included. It used to be waved
// through unconditionally ("the plan upgrades it"), which priced 15 W top-ups off the 12 W curve
// and reported them as 12 W even when the plan spent $0 on upgrades.
// inclGreedy=false excludes the greedy outright (the projection tracks it as its own miner).
function existingMinerSizes(inclGreedy){
  return (window.GMTFleetRows||[])
    .filter(function(r){
      var g=/greedy/i.test(r.collection||'');
      if(!((+r.th||0)>0&&(+r.th||0)<MINER_CAP))return false;
      if(g&&inclGreedy===false)return false;
      return (+r.wth||15)<=EFF_BEST+1e-6;
    })
    .map(function(r){return +r.th||0;})
    .sort(function(a,b){return b-a;});
}
function costToAdd12(x,sizes){ return costToAddTiers(x,sizes||existingMinerSizes(),TH_TIERS_12W); }
function thForBudget12Ex(budget){ return thForBudgetFromSizes(budget,existingMinerSizes(),TH_TIERS_12W); }
// $/TH at a FRACTIONAL efficiency, interpolated linearly in W between the 12 W and 15 W
// curves and clamped to [12,15]. A 12.9 W miner is priced ~30% of the way from the 12 W
// curve toward 15 W — not snapped to either cliff. Mirrors cptAtEff in scripts/constants.js.
function cptAtEff(th,wth){
  const w=Math.min(Math.max(wth||EFF_BEST,EFF_BEST),EFF_BASE_MAX);
  const f=(w-EFF_BEST)/(EFF_BASE_MAX-EFF_BEST);
  return cptTier(TH_TIERS_12W,th)*(1-f)+cptTier(TH_TIERS,th)*f;
}
// Budget → TH at 12 W/TH. Minting a new machine and adding TH to one you own cost the same
// per TH at a given efficiency, so this is the converter for every 12 W path, purchase or
// upgrade. thForBudget/estimateCPT are the 15 W equivalents on TH_TIERS — the split is by
// EFFICIENCY, not by mint-versus-upgrade.
function thForBudget12(budget){return thForBudgetTiers(budget,TH_TIERS_12W);}
function thForBudgetTiers(budget,tiers){
  if(budget<=0)return 0;
  let lo=0,hi=budget/(tiers[tiers.length-1].cpt*avatarDiscMult());
  for(let k=0;k<50;k++){const mid=(lo+hi)/2;if(mid*cptTier(tiers,mid)<budget)lo=mid;else hi=mid;}
  return(lo+hi)/2;
}
// One-time $/TH to upgrade existing hashrate's efficiency down to 12 W/TH.
// A farm at/above 15 W/TH is priced as 15 → 3 steps × $2.67 = $8.01/TH.
function effUpgradeCostPerTH(curW){return EFF_UPGRADE_STEP*Math.max(0,Math.min(curW,EFF_BASE_MAX)-EFF_BEST);}

// Net monthly USD for a setup, optionally at a hypothetical BTC price (always restores S.btcPrice).
function netMonthlyAt(i,bpOverride){
  const save=S.btcPrice;
  if(bpOverride!=null&&isFinite(bpOverride))S.btcPrice=bpOverride;
  let mo=0;try{const c=calc(i);mo=c.net*c.bp*30;}finally{S.btcPrice=save;}
  return mo;
}

// Auto-estimate $/TH for a farm the user is describing. Priced off the efficiency they
// entered: a 12 W/TH farm cost materially more per TH than a 15 W one, and defaulting
// everyone to the 15 W curve understated the capital behind an efficient setup.
function autoFillCPT(thId,cptId,wthId){
  const th=parseFloat(document.getElementById(thId).value)||0;
  const el=document.getElementById(cptId);
  const wEl=wthId?document.getElementById(wthId):null;
  const w=wEl?parseFloat(wEl.value)||0:0;
  const est=(w>0&&w<=EFF_BEST)?estimateCPT12(th):estimateCPT(th);
  el.value=est.toFixed(2);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  const hint=document.getElementById('cptAutoHint');
  const curve=(w>0&&w<=EFF_BEST)?EFF_BEST+' W/TH':'15 W/TH';
  if(hint&&th>0)hint.textContent='Auto-estimated ~$'+est.toFixed(2)+'/TH for '+fN(th,0)+' TH at '+curve;
  else if(hint)hint.textContent='';
}

// ---- FORMAT ----
const fB=v=>v.toFixed(8)+' BTC';
const fU=(v,d=2)=>{const syms={USD:'$',GBP:'\u00a3',EUR:'\u20ac'};const sym=syms[S.currency]||'$';const cv=v*S.fxRate;return sym+cv.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d})};
const fP=v=>v.toFixed(2)+'%';
const fN=(v,d=2)=>v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
// Compact formatters for chart axis labels (keep them narrow so monthly values
// don't overflow the y-axis gutter).
function fAxisUSD(v){const sym=({USD:'$',GBP:'£',EUR:'€'})[S.currency]||'$';const a=Math.abs(v*S.fxRate);let s;if(a>=1e6)s=(a/1e6).toFixed(a>=1e7?0:1)+'M';else if(a>=1e3)s=(a/1e3).toFixed(a>=1e4?0:1)+'K';else s=a.toFixed(a>=100?0:a>=10?1:2);return (v<0?'-':'')+sym+s;}
function fAxisGMT(v){const a=Math.abs(v);let s;if(a>=1e6)s=(a/1e6).toFixed(a>=1e7?0:1)+'M';else if(a>=1e3)s=(a/1e3).toFixed(a>=1e4?0:1)+'K';else s=a.toFixed(a>=100?0:2);return s+' GMT';}

// ---- SECTIONS ----
function toggleSection(id){document.getElementById(id).classList.toggle('collapsed')}

// ---- TABS ----
function _activateTab(b,push){
  // Leaving whatever panel was open (Edit Setup / Planner form / Projection / Chart) —
  // these are separate pages, so clear them before showing the tab.
  closeAllPanels();
  const prev=document.querySelector('.tab-content.active');
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');
  // Keep the header nav links in sync no matter how the tab was switched (e.g. "Return to
  // Console" clicks the hidden tab-btn directly, bypassing consoleView) — otherwise the
  // Planner link stays highlighted after returning.
  // Clear ALL nav links first (the "My Fleet"/Edit link has no data-view, so a
  // data-view-only toggle would leave it highlighted alongside the new tab).
  document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('nav-active'));
  const activeLink=document.querySelector(`.nav-links a[data-view="${b.dataset.tab}"]`);
  if(activeLink)activeLink.classList.add('nav-active');
  // The Capital Planner tab relabels to "Adjust Amount" while you're on it (re-clicking adjusts).
  const pBtn=document.querySelector('[data-tab="tab-planner"]');
  if(pBtn)pBtn.textContent=(b.dataset.tab==='tab-planner')?'Adjust Amount':'Capital Planner';
  // Re-observe reveals in newly visible tab
  document.getElementById(b.dataset.tab).querySelectorAll('.reveal:not(.visible)').forEach(el=>revealObs.observe(el));
  // Reflect the view in the URL so the tabs are real pages (/planner, /console) — unless we're
  // syncing FROM the URL via back/forward (push===false).
  if(push!==false){
    const t=b.dataset.tab, u=t==='tab-planner'?'/planner':t==='tab-current'?'/console':null;
    if(u&&location.pathname.replace(/\/+$/,'')!==u){try{history.pushState({tab:t},'',u);}catch(e){}}
  }
  // First visit to the planner auto-opens the full-page form; navigating in from another tab
  // shows the results. Re-clicking "Capital Planner" while already on it reopens the form to
  // adjust (replaces the old "Adjust Investment Amount" button).
  if(b.dataset.tab==='tab-planner'&&(!window._plannerCalcDone||(prev&&prev.id==='tab-planner'))){openPlannerForm();}
  // Switching to My Setup from another tab replays the count-up animation.
  if(b.dataset.tab==='tab-current'&&(!prev||prev.id!=='tab-current')){refreshMySetupAnimation();}
}
document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>_activateTab(b,true)));
// Back/forward between /console and /planner switches the tab without pushing a new history entry.
addEventListener('popstate',function(){
  closeAllPanels();   // any history navigation closes an open panel (Edit/Planner/Projection/Chart)
  const seg=location.pathname.replace(/\/+$/,'').split('/').pop();
  if(seg==='edit'){ openEditSetup(); return; }
  const id=seg==='planner'?'tab-planner':'tab-current';
  const b=document.querySelector('[data-tab="'+id+'"]');
  if(b&&!b.classList.contains('active'))_activateTab(b,false);
});
// ---- In-flow panel views (Edit Setup, Planner form, Growth Projection, Charts) ----
// Replace the old full-screen overlays: hide the dashboard but keep the sticky
// header + quotron and the footer, scrolling with the page instead of covering it.
const _PANEL_CLASS={secInputs:'editing',plannerIntro:'planning',setupProjModal:'projecting',btcChartPage:'charting',rainbowPage:'charting',cmbPage:'charting'};
const _PANEL_IDS=['secInputs','plannerIntro','setupProjModal','btcChartPage','rainbowPage','cmbPage'];
function showPanelView(id){
  const el=document.getElementById(id);if(!el)return;
  // Each panel is its own page — close any other that's already open (e.g. open Edit
  // Setup while the Planner is showing) so we never stack two panels.
  _PANEL_IDS.forEach(function(pid){if(pid!==id){const p=document.getElementById(pid);if(p){p.style.display='none';p.classList.remove('sp-view');}}});
  document.body.classList.remove('editing','planning','projecting','charting');
  document.body.classList.add(_PANEL_CLASS[id]||'planning');
  el.classList.add('sp-view');
  el.style.display='';
  el.scrollTop=0;
  try{window.scrollTo(0,0);}catch(e){}
}
// Panels are in-flow and scroll with the document, so leaving one must never leave the
// body scroll-locked. Any overlay that locked it (chart screenshot, onboarding, donate)
// is gone by the time we get here — clear the lock rather than trust every close path.
const _LOCKING_OVERLAYS=['onboarding','newUserModal','chartShotModal','donateModal'];
function releaseScrollLock(){
  // Don't yank the lock out from under an overlay that's legitimately still open.
  const held=_LOCKING_OVERLAYS.some(function(id){
    const el=document.getElementById(id);
    return el&&getComputedStyle(el).display!=='none';
  });
  if(!held)document.body.style.overflow='';
}
function hidePanelView(id){
  const el=document.getElementById(id);if(el){el.style.display='none';el.classList.remove('sp-view');}
  document.body.classList.remove(_PANEL_CLASS[id]||'planning');
  releaseScrollLock();
}
// Close every in-flow panel and clear all panel state. Called on any tab switch so
// navigating to Console / Planner from an open panel always lands on a clean page.
function closeAllPanels(){
  _PANEL_IDS.forEach(function(pid){const p=document.getElementById(pid);if(p){p.style.display='none';p.classList.remove('sp-view');}});
  document.body.classList.remove('editing','planning','projecting','charting');
  releaseScrollLock();
}
// Open the full-page Capital Planner form, seeded from the current inputs.
function openPlannerForm(){
  document.getElementById('piCapitalInput').value=$('inCapital').value;
  document.getElementById('piGMTInput').value=$('inGMTWallet').value;
  document.getElementById('piRefCapInput').value=$('inRefCapital').value;
  if($('piRefBonus')&&$('inRefBonusPct'))$('piRefBonus').value=$('inRefBonusPct').value;
  if($('piRefReinvest')&&$('inRefReinvest'))$('piRefReinvest').value=$('inRefReinvest').value;
  document.getElementById('piMpTH').value=$('inMpTH').value;
  document.getElementById('piMpGMT').value=$('inMpGMT').value;
  document.getElementById('piMpWth').value=$('inMpWth').value;
  if($('piMpGreedy')&&$('inMpGreedy')){
    $('piMpGreedy').checked=$('inMpGreedy').checked;
    const n=$('piMpGreedyNote');if(n)n.style.display=$('piMpGreedy').checked?'':'none';
  }
  if($('piMpCode')&&$('inMpCode'))$('piMpCode').value=$('inMpCode').value;
  if(window._incomeGoal&&isFinite(window._incomeGoal.targetDisp))document.getElementById('piTargetInput').value=Math.round(window._incomeGoal.targetDisp);
  setPlannerMode(window._plannerMode||'amount');   // restore the chosen mode + button label + unit
  showPanelView('plannerIntro');
  const cb=document.getElementById('plannerCalcBtn');if(cb)cb.disabled=false;
  // "Return to Capital Planner" only makes sense once a plan has been calculated to go back to.
  const rr=document.getElementById('piReturnResults');if(rr)rr.style.display=window._plannerCalcDone?'':'none';
}
// Dismiss the form back to the already-computed Capital Planner results (no recalculation).
// The planner form is a full-page panel, so it can be opened from ANY tab — the Capital Planner
// tab, or My Setup's idle-GMT card. Closing it just reveals whatever tab is underneath, which
// meant calculating from My Setup dropped you back on My Setup with the plan you just asked for
// hidden a tab away. Every exit that should show a plan routes through here instead.
function gotoPlannerTab(){
  const pBtn=document.querySelector('[data-tab="tab-planner"]');
  if(pBtn&&!pBtn.classList.contains('active'))pBtn.click();
}
function returnToPlannerResults(){
  closePlannerIntro();
  gotoPlannerTab();
}
function submitPlannerCapital(){
  // Brief "calculating" state so the optimal-split solve feels tangible.
  const btn=document.getElementById('plannerCalcBtn');
  const load=document.getElementById('plannerCalcLoading');
  const txt=load?load.querySelector('.sp-loading-txt'):null;
  if(txt)txt.textContent='Finding your optimal split…';
  if(btn)btn.disabled=true;
  if(load)load.style.display='flex';
  setTimeout(function(){
    const val=parseFloat(document.getElementById('piCapitalInput').value)||0;
    const gmtVal=parseFloat(document.getElementById('piGMTInput').value)||0;
    const refCapVal=parseFloat(document.getElementById('piRefCapInput').value)||0;
    $('inCapital').value=val;
    if(gmtVal>0)$('inGMTWallet').value=gmtVal;
    $('inRefCapital').value=refCapVal;
    if($('piRefBonus')&&$('inRefBonusPct'))$('inRefBonusPct').value=parseFloat($('piRefBonus').value)||5;
    if($('piRefReinvest')&&$('inRefReinvest'))$('inRefReinvest').value=parseFloat($('piRefReinvest').value)||0;
    $('inMpTH').value=parseFloat(document.getElementById('piMpTH').value)||0;
    $('inMpGMT').value=parseFloat(document.getElementById('piMpGMT').value)||0;
    const mpWthVal=parseFloat(document.getElementById('piMpWth').value);
    $('inMpWth').value=(mpWthVal>0?mpWthVal:15);
    if($('piMpGreedy')&&$('inMpGreedy'))$('inMpGreedy').checked=$('piMpGreedy').checked;
    if($('piMpCode')&&$('inMpCode'))$('inMpCode').value=$('piMpCode').value.trim();
    window._plannerCalcDone=true;
    window._incomeGoal=null;   // amount mode: drop any prior income-goal banner
    recalc();
    hidePanelView('plannerIntro');
    gotoPlannerTab();           // show the plan, not whichever tab the form was opened from
    if(load)load.style.display='none';
    if(btn)btn.disabled=false;
    animatePlannerResults();   // fresh-load feel: count the allocation up from 0
  },800);
}
// The Calculate button runs whichever planner mode is active.
function submitPlanner(){
  if(window._plannerMode==='goal')submitPlannerTarget();
  else submitPlannerCapital();
}
// Toggle the planner form between "invest an amount" and "target a monthly income".
function setPlannerMode(mode){
  window._plannerMode=mode;
  const amt=$('piAmountBlock'),goal=$('piGoalBlock');
  const bA=$('piModeAmount'),bG=$('piModeGoal'),btn=$('plannerCalcBtn'),unit=$('piTargetUnit');
  const isGoal=mode==='goal';
  if(amt)amt.hidden=isGoal;
  if(goal)goal.hidden=!isGoal;
  if(bA)bA.classList.toggle('active',!isGoal);
  if(bG)bG.classList.toggle('active',isGoal);
  if(btn)btn.textContent=isGoal?'Find Required Capital':'Calculate Optimal Split';
  if(unit)unit.textContent=(({USD:'$',GBP:'£',EUR:'€'})[S.currency]||'$')+'/mo';
}
// Project the farm's total monthly income (mining + staking + ambassador) for a hypothetical
// USD capital, mirroring renderPlanner's "Projected monthly" — used to goal-seek a target income.
function projectedMonthlyForCapital(capUSD){
  const i=inp();i.cap=Math.max(0,capUSD||0);
  const m=calc(i);
  return projectedMonthlyFor(i,m,m.bp,m.gp,dailyBTCperTH());
}
// Month-by-month income at TODAY's prices, for one solved plan. The headline comparison is a
// single-month snapshot, which is the wrong lens on a Greedy Machine: it grows for free every
// week and compounds, while the GMT it displaced earns a fixed staking yield and a discount that
// erodes as the farm's fee bill grows. Deliberately flat prices — this answers "which plan pulls
// ahead, and when", not "what will BTC do"; the projection page owns forecasting.
function plannerMonthlyPath(a,ep,i,bp,gp,dbt,months){
  if(!a)return null;
  let locked=Math.max(0,a.newLocked||0);
  let gTH=(ep&&ep.gTHf>0)?ep.gTHf:(a.greedyTot||0);
  const gW=(ep&&ep.gWthf>0)?ep.gWthf:(a.gwthAfter||EFF_BASE_MAX);
  const finTH=(ep&&ep.finTH>0)?ep.finTH:a.nt, finW=(ep&&ep.finWth>0)?ep.finWth:a.bwth;
  const othTH=Math.max(0,finTH-gTH);
  const othW=othTH>0?Math.max(EFF_BEST,(finTH*finW-gTH*gW)/othTH):finW;
  const gGrow=Math.max(0,+(i.ggrow||0))/100;
  const WK=52/12;
  const ambMo=(ambDailyUSD(i.amb?i.refTH:0,AMB_DEFAULT_WTH)+ambDailyUSD(a.ref?a.ref.at:0,EFF_BEST))*30;
  const gmtW=Math.max(0,a.gmtReserve||0);
  const out=[];
  for(let mo=1;mo<=months;mo++){
    if(gTH>0&&gGrow>0)gTH*=Math.pow(1+gGrow,WK);          // free weekly TH, compounding
    locked*=Math.pow(1+(i.apr/100)/52,WK);                 // staking yield auto-compounds
    const tot=othTH+gTH, bw=tot>0?(othTH*othW+gTH*gW)/tot:othW;
    const f=fees(tot,bw,bp);
    const v=vipOf(othTH+Math.max(0,gTH-(a.gInit||0)),locked);
    const nonTok=Math.min(30,v.d+(i.click?3:0)+(i.mm||0)+(i.od||0));
    const burn=(f.t*(1-nonTok/100)*bp)/gp;
    const cov=burn>0?(locked+gmtW)/burn:Infinity;
    const tok=i.payG?Math.min(20,Math.floor(cov/18)):0;
    const fd=Math.min(30,tok+nonTok);
    const mineMo=Math.max(0,dbt*tot-f.t*(1-fd/100))*bp*(1-CONVERSION_FEE)*30;
    const stakeMo=locked*(i.apr/100)/52*gp*4.33;
    const greedyMo=(gTH>0&&gGrow>0)?(gTH*gGrow)*4.33*cptAtEff(gTH,gW):0;
    out.push(mineMo+stakeMo+ambMo+greedyMo);
  }
  return out;
}
// The planner's headline monthly income for an ARBITRARY model — same composition the results
// show. Lets the planner price a counterfactual ("what if I didn't buy this miner?") against the
// exact number it displays, instead of a second, subtly different formula.
function projectedMonthlyFor(i,m,bp,gp,dbt){
  const a=solvePlannerAllocation(i,bp,gp,dbt);
  let mineMo,locked,refInitTH,gTHf,gWf;
  if(a){
    // Mirror the displayed "Projected monthly" EXACTLY (else target-income overshoots/undershoots):
    // price the efficiency-inclusive total (finTH) and value the greedy's free weekly growth.
    const ep=computeEffPlan(effStateFrom(i,a,gp,bp));
    const projTH=(ep&&ep.finTH>0)?ep.finTH:a.nt, projWth=(ep&&ep.finWth>0)?ep.finWth:a.bwth;
    mineMo=(dbt*projTH-fees(projTH,projWth,bp).t*(1-a.td2/100))*(1-CONVERSION_FEE)*bp*30;   // incl. 2% BTC→GMT fee
    locked=a.newLocked;refInitTH=a.ref?a.ref.at:0;
    gTHf=(ep&&ep.gTHf>0)?ep.gTHf:(a.greedyTot||0);gWf=(ep&&ep.gWthf>0)?ep.gWthf:(a.gwthAfter||15);
  }else{
    // Nothing to allocate (e.g. zero capital on a blank/empty setup): the farm just
    // earns its current income — a $0 baseline on a blank setup, not an error.
    mineMo=m.net*m.bp*30;locked=i.gl;refInitTH=0;gTHf=m.gth||0;gWf=m.gwth||15;
  }
  const stakingMo=locked*(i.apr/100)/52*gp*4.33;
  const ambMo=(ambDailyUSD(i.amb?i.refTH:0,AMB_DEFAULT_WTH)+ambDailyUSD(refInitTH,EFF_BEST))*30;
  const gGrow=+(i.ggrow||0);
  const greedyMo=(gTHf>0&&gGrow>0)?(gTHf*gGrow/100)*4.33*cptAtEff(gTHf,gWf):0;   // free weekly TH as income
  return mineMo+stakingMo+ambMo+greedyMo;

}
// The farm's CURRENT monthly income, computed exactly like the "Current" card / console hero
// (calc()-based), so the target banner's "you already earn" matches to the dollar — the $0-capital
// solve routes through a different discount path and drifts a few dollars.
function currentMonthlyIncomeUSD(){
  const i=inp(),m=calc(i),gp=m.gp;
  const mineMo=m.net*m.bp*30;                                   // includes discount + 2.25% conversion fee
  const stakingMo=m.wkGMT*gp*4.33;
  const ambMo=ambDailyUSD(i.amb?(+i.refTH||0):0,AMB_DEFAULT_WTH)*30;
  const gGrow=+(i.ggrow||0);
  const greedyMo=((m.gth||0)>0&&gGrow>0)?(m.gth*gGrow/100)*4.33*cptAtEff(m.gth,m.gwth||15):0;
  return mineMo+stakingMo+ambMo+greedyMo;
}
// Binary-search the smallest USD capital that ADDS addUSD to the farm's monthly income.
// The target is additional income, not a total: someone already earning $2,800/mo who asks
// for $1,500 wants to end up on $4,300, not to be told they are already there.
function solveCapitalForIncome(addUSD){
  if(!(addUSD>0))return null;
  const f=projectedMonthlyForCapital;
  const base=currentMonthlyIncomeUSD();   // the real current income (matches the Current card)
  if(base==null||!isFinite(base))return {cap:null,error:true};
  const goal=base+addUSD;
  let hi=1000,hiMo=f(hi),iter=0;
  while((hiMo==null||hiMo<goal)&&hi<1e8&&iter<40){hi*=2;hiMo=f(hi);iter++;}
  if(hiMo==null||hiMo<goal)return {cap:null,mo:hiMo,maxTried:hi,base,goal,unreachable:true};
  let lo=0;
  for(let k=0;k<44;k++){const mid=(lo+hi)/2,mo=f(mid);if(mo==null){lo=mid;continue;}mo<goal?lo=mid:hi=mid;}
  return {cap:hi,mo:f(hi),base,goal};
}
// Target-income mode: solve for the capital needed, fill it in, then show the normal results.
function submitPlannerTarget(){
  const btn=$('plannerCalcBtn'),load=$('plannerCalcLoading'),txt=load?load.querySelector('.sp-loading-txt'):null;
  if(txt)txt.textContent='Finding the capital you need…';
  if(btn)btn.disabled=true;
  if(load)load.style.display='flex';
  setTimeout(function(){
    // Apply the form's non-capital fields first so the goal-seek accounts for them.
    const gmtVal=parseFloat($('piGMTInput').value)||0;
    const refCapVal=parseFloat($('piRefCapInput').value)||0;
    if(gmtVal>0)$('inGMTWallet').value=gmtVal;
    $('inRefCapital').value=refCapVal;
    if($('piRefBonus')&&$('inRefBonusPct'))$('inRefBonusPct').value=parseFloat($('piRefBonus').value)||5;
    if($('piRefReinvest')&&$('inRefReinvest'))$('inRefReinvest').value=parseFloat($('piRefReinvest').value)||0;
    $('inMpTH').value=parseFloat($('piMpTH').value)||0;
    $('inMpGMT').value=parseFloat($('piMpGMT').value)||0;
    const mpWthVal=parseFloat($('piMpWth').value);$('inMpWth').value=(mpWthVal>0?mpWthVal:15);
    if($('piMpGreedy')&&$('inMpGreedy'))$('inMpGreedy').checked=$('piMpGreedy').checked;
    if($('piMpCode')&&$('inMpCode'))$('inMpCode').value=$('piMpCode').value.trim();
    // Target income is entered in the display currency; solve in USD.
    const targetDisp=parseFloat($('piTargetInput').value)||0;
    const targetUSD=targetDisp/(S.fxRate||1);
    const res=solveCapitalForIncome(targetUSD);
    let cap=0;
    if(res&&res.cap!=null)cap=Math.ceil(res.cap/10)*10;   // round up to a tidy $10
    $('inCapital').value=cap;
    window._plannerCalcDone=true;
    window._incomeGoal={targetUSD,targetDisp,cap,res};
    recalc();
    hidePanelView('plannerIntro');
    gotoPlannerTab();           // show the plan, not whichever tab the form was opened from
    if(load)load.style.display='none';
    if(btn)btn.disabled=false;
    animatePlannerResults();
  },800);
}
// "Return to My Setup" from the planner form: brief load, switch tabs, fresh animation.
function returnToSetupFromPlanner(){
  const load=document.getElementById('plannerCalcLoading');
  const txt=load?load.querySelector('.sp-loading-txt'):null;
  if(txt)txt.textContent='Loading your setup…';
  if(load)load.style.display='flex';
  setTimeout(function(){
    hidePanelView('plannerIntro');
    if(load)load.style.display='none';
    if(txt)txt.textContent='Finding your optimal split…';
    const setupBtn=document.querySelector('[data-tab="tab-current"]');
    if(setupBtn)setupBtn.click();
    refreshMySetupAnimation();
  },650);
}
function closePlannerIntro(){
  hidePanelView('plannerIntro');
}

// Live price chart (TradingView advanced chart — real-time, with the drawing/TA toolbar).
// Reused for BTC and the GoMining token; the widget is rebuilt when the symbol changes.
let _chartSym=null;
function openBtcChart(){openChart('COINBASE:BTCUSD','Bitcoin — Live Chart','/btc36.png',false,true);}
function openGmtChart(){openChart('CRYPTO:GOMININGUSD','GoMining Token — Live Chart','/gmt36.png',true,false);}
// Deep-link: /bitcoin and /gmt (served by the redirect pages as /?chart=…, or hit directly)
// auto-open the matching chart on first load.
function maybeOpenChartFromURL(){
  let which=new URLSearchParams(location.search).get('chart');
  if(!which){const seg=location.pathname.replace(/\/+$/,'').split('/').pop();if(seg==='bitcoin'||seg==='gmt'||seg==='combined')which=seg;}
  if(which==='bitcoin')openBtcChart();
  else if(which==='gmt')openGmtChart();
  else if(which==='combined')openCombined();
}
function closeBtcChart(){
  try{history.replaceState({},'','/console'+location.hash);}catch(e){}   // drop /bitcoin|/gmt from the URL
  const load=document.getElementById('btcChartLoading');
  if(load)load.style.display='flex';
  setTimeout(function(){
    hidePanelView('btcChartPage');
    if(load)load.style.display='none';
    const setupBtn=document.querySelector('[data-tab="tab-current"]');
    if(setupBtn)setupBtn.click();        // return to My Setup
    refreshMySetupAnimation();            // replay the count-up on all the numbers
  },650);
}
function openChart(symbol,title,icon,allowChange,isBtc){
  // remember which asset is on screen so the screenshot button knows what to render
  window._chartAsset=isBtc
    ? {kind:'btc',name:'Bitcoin',pair:'BTC / USD',icon:'/btc36.png'}
    : {kind:'gmt',name:'GoMining Token',pair:'GMT / USD',icon:'/gmt36.png'};
  // reflect the chart in the URL so it's shareable / bookmarkable (gmt-optimizer.com/bitcoin|/gmt)
  try{history.replaceState({},'',(isBtc?'/bitcoin':'/gmt')+location.hash);}catch(e){}
  showPanelView('btcChartPage');
  const t=document.getElementById('btcChartTitle');
  const shortT=isBtc?'Bitcoin':'GMT';
  if(t)t.innerHTML='<img src="'+icon+'" alt="" style="height:18px;width:18px;border-radius:50%;vertical-align:middle;margin-right:.4rem">'
    +'<span class="ct-long">'+title+'</span><span class="ct-short">'+shortT+'</span>';
  // The Rainbow Chart toggle is BTC-only; reset to the live view each open.
  const mode=document.getElementById('btcChartMode');
  if(mode)mode.style.display=isBtc?'':'none';
  _rbView=null;                       // reset rainbow zoom/pan on each open
  buildChart(symbol,allowChange);
}
// ---- Bitcoin Rainbow Chart — its own page (/rainbow) ----
function openRainbow(){
  window._chartAsset={kind:'btc',name:'Bitcoin',pair:'BTC / USD',icon:'/btc36.png'};
  try{history.replaceState({},'','/rainbow'+location.hash);}catch(e){}
  showPanelView('rainbowPage');
  const wrap=document.getElementById('btcRainbowWrap');
  if(wrap)wrap.classList.add('show');
  _rbView=null;
  loadBtcRainbow();
}
function closeRainbow(){
  try{history.replaceState({},'','/console'+location.hash);}catch(e){}
  hidePanelView('rainbowPage');
  const setupBtn=document.querySelector('[data-tab="tab-current"]');
  if(setupBtn)setupBtn.click();
  refreshMySetupAnimation();
}

// ---- Live vs Rainbow view toggle (BTC) ----
function setBtcChartView(view,silent){
  const wrap=document.getElementById('btcRainbowWrap');
  const live=document.getElementById('btcModeLive');
  const rain=document.getElementById('btcModeRainbow');
  if(!wrap)return;
  if(view==='rainbow'){
    wrap.classList.add('show');
    if(live)live.classList.remove('active');
    if(rain)rain.classList.add('active');
    loadBtcRainbow();
  }else{
    wrap.classList.remove('show');
    if(live)live.classList.add('active');
    if(rain)rain.classList.remove('active');
  }
}

// ---- Bitcoin Rainbow Chart (log-regression bands fitted to daily history) ----
let _rainbowData=null, _rainbowLoading=false;
// Pull long BTC daily/weekly history from whichever public source answers (CORS-friendly,
// no API key). Returns a normalized [{t:ms, v:usd}] array sorted ascending.
async function fetchRainbowHistory(){
  // 1. blockchain.com market-price — the canonical rainbow source; data back to 2010, CORS via cors=true
  try{
    const r=await fetchTO('https://api.blockchain.info/charts/market-price?timespan=all&format=json&cors=true',18000);
    const v=(r&&r.values)||[];
    const out=v.map(p=>({t:p.x*1000,v:p.y})).filter(p=>p.v>0);
    if(out.length>100)return out;
  }catch(e){}
  // 2. Kraken weekly OHLC — global, CORS-enabled, ~13yr of history (720 weekly candles)
  try{
    const r=await fetchTO('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080',15000);
    const res=r&&r.result;
    if(res){const key=Object.keys(res).find(k=>k!=='last');const arr=res[key];
      if(arr&&arr.length>20)return arr.map(c=>({t:c[0]*1000,v:+c[4]})).filter(p=>p.v>0);}
  }catch(e){}
  // 3. Binance weekly klines — long history, CORS ok (may be geo-blocked in some regions)
  try{
    const r=await fetchTO('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1000',15000);
    if(Array.isArray(r)&&r.length>20)return r.map(c=>({t:c[0],v:+c[4]})).filter(p=>p.v>0);
  }catch(e){}
  // 4. CoinGecko market_chart — may require a key / rate-limit, kept as last resort
  try{
    const r=await fetchTO('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max',15000);
    const pr=(r&&r.prices)||[];
    if(pr.length>20)return pr.map(p=>({t:p[0],v:p[1]})).filter(p=>p.v>0);
  }catch(e){}
  throw new Error('no rainbow source');
}
function loadBtcRainbow(){
  drawBtcRainbow();                 // draw immediately (bands render even before data)
  if(_rainbowData||_rainbowLoading)return;
  _rainbowLoading=true;
  const msg=document.getElementById('btcRainbowMsg');
  if(msg){msg.textContent='Loading price history…';msg.style.display='';}
  fetchRainbowHistory()
    .then(data=>{
      // Trim to 2012+ so the Power-Law fit matches the canonical "since 2012" rainbow.
      const trimmed=data.filter(p=>p.t>=Date.UTC(2012,0,1));
      _rainbowData=(trimmed.length>50?trimmed:data).sort((a,b)=>a.t-b.t);
      _rbFit=null;                    // recompute Power-Law fit for the new dataset
      _rainbowLoading=false;
      if(msg)msg.style.display='none';
      drawBtcRainbow();
    })
    .catch(()=>{
      _rainbowLoading=false;
      if(msg){msg.textContent='Couldn’t load price history right now — try again shortly.';msg.style.display='';}
      drawBtcRainbow();
    });
}
// ---- Rainbow chart constants (9 Power-Law bands, red overvalued → blue undervalued) ----
const RB_COLORS=['#b11717','#e23b25','#ef7b2a','#f3a93a','#ecd24b','#bcd64a','#5fb85a','#2fa39a','#3f7cc4'];
const RB_LABELS=['Maximum Bubble Territory','Sell. Seriously, SELL!','FOMO intensifies','Is this a bubble?','HODL!','Still cheap','Accumulate','BUY!','Basically a Fire Sale'];
const RB_OFFSETS=[0.45,0.35,0.25,0.15,0.05,-0.05,-0.15,-0.25,-0.35,-0.45]; // 10 boundaries → 9 bands
const RB_DAY=86400000;
const RB_GEN=Date.UTC(2009,0,3);                 // genesis-era reference for the log-time axis
const RB_T0=Date.UTC(2012,0,1), RB_T1=Date.UTC(2041,5,1);  // full view: 2012 → past the 2040 halving (covers every projection target)
const RB_HALVINGS=[
  {t:Date.UTC(2012,10,28),label:'Halving',est:false},
  {t:Date.UTC(2016,6,9),label:'Halving',est:false},
  {t:Date.UTC(2020,4,11),label:'Halving',est:false},
  {t:Date.UTC(2024,3,20),label:'Halving',est:false},
  {t:Date.UTC(2028,3,15),label:'Halving 2028 (Est)',est:true},
  {t:Date.UTC(2032,3,15),label:'Halving 2032 (Est)',est:true},
  {t:Date.UTC(2036,3,15),label:'Halving 2036 (Est)',est:true},
  {t:Date.UTC(2040,3,15),label:'Halving 2040 (Est)',est:true}
];
// Plot padding adapts to width so the axis/labels stay readable on phones.
function rbPads(W){return W<480?{l:6,r:52,t:10,b:44}:{l:8,r:74,t:12,b:46};}
function rbAxisLabel(val,sm){if(!sm)return rbFmtUSD(val);return val>=1e6?'$'+(val/1e6)+'M':val>=1e3?'$'+(val/1e3)+'K':'$'+val;}
let _rbView=null, _rbDrag=null, _rbPinch=null, _rbBound=false, _rbFit=null, _rbHover=null, _rbRaf=null;
function rbRequestDraw(){if(_rbRaf)return;_rbRaf=requestAnimationFrame(()=>{_rbRaf=null;drawBtcRainbow();});}
function rbHideTip(){const t=document.getElementById('btcRainbowTip');if(t)t.style.display='none';}
// Tooltip: date + each rainbow band's price at the hovered time (+ actual BTC price if known).
function rbShowTip(t,wx,wy){
  const tip=document.getElementById('btcRainbowTip'),wrap=document.getElementById('btcRainbowWrap');
  if(!tip||!wrap||!_rbFit||!_rainbowData)return;
  const center=_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b;
  const ds=new Date(t).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  const last=_rainbowData[_rainbowData.length-1];
  const actual=(t<=last.t)?rbPriceAt(_rainbowData,t):null;
  let html=`<div class="rb-tip-date">${ds}</div>`;
  html+=actual?`<div class="rb-tip-actual">BTC price: ${rbFmtUSD(actual)}</div>`
              :`<div class="rb-tip-actual" style="color:var(--text4)">Projected band prices</div>`;
  for(let i=0;i<RB_LABELS.length;i++){
    const mid=(RB_OFFSETS[i]+RB_OFFSETS[i+1])/2;
    html+=`<div class="rb-tip-row"><span class="rb-tip-sw" style="background:${RB_COLORS[i]}"></span><span class="rb-tip-lbl">${RB_LABELS[i]}</span><span class="rb-tip-px">${rbFmtUSD(Math.pow(10,center+mid))}</span></div>`;
  }
  tip.innerHTML=html;tip.style.display='block';
  const ww=wrap.clientWidth, wh=wrap.clientHeight, tw=tip.offsetWidth, th=tip.offsetHeight;
  let lx=wx+14; if(lx+tw>ww-6)lx=wx-tw-14; if(lx<6)lx=6;
  let ty=wy+12; if(ty+th>wh-6)ty=wh-th-6; if(ty<6)ty=6;
  tip.style.left=lx+'px';tip.style.top=ty+'px';
}

function rbDayOf(t){return Math.max(1,(t-RB_GEN)/RB_DAY);}
function rbView(){return _rbView||{t0:RB_T0,t1:RB_T1};}
function rbClamp(t0,t1){
  let span=t1-t0; const full=RB_T1-RB_T0;
  if(span>=full)return{t0:RB_T0,t1:RB_T1};
  if(span<RB_DAY*60)span=RB_DAY*60;       // min ~2-month window
  if(t0<RB_T0){t0=RB_T0;t1=t0+span;}
  if(t1>RB_T1){t1=RB_T1;t0=t1-span;}
  if(t0<RB_T0)t0=RB_T0;
  return{t0,t1};
}
// Least-squares Power-Law fit (log10 price vs ln days) + R², cached per dataset.
function rbComputeFit(series){
  let n=0,sx=0,sy=0,sxx=0,sxy=0;
  for(const p of series){if(p.v>0){const lx=Math.log(rbDayOf(p.t)),ly=Math.log10(p.v);n++;sx+=lx;sy+=ly;sxx+=lx*lx;sxy+=lx*ly;}}
  let m=2.9,b=-19.0;
  if(n>2&&(n*sxx-sx*sx)!==0){m=(n*sxy-sx*sy)/(n*sxx-sx*sx);b=(sy-m*sx)/n;}
  const meanY=sy/n; let ssr=0,sst=0;
  for(const p of series){if(p.v>0){const lx=Math.log(rbDayOf(p.t)),ly=Math.log10(p.v);const pred=m*lx+b;ssr+=(ly-pred)*(ly-pred);sst+=(ly-meanY)*(ly-meanY);}}
  const r2=sst>0?1-ssr/sst:0;
  return{m,b,r2};
}
// HODL (Power-Law center) fair value at time t — the rainbow chart's center line.
function rbCenterPrice(t){return _rbFit?Math.pow(10,_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b):0;}
// Price at the MIDPOINT of a named rainbow band at time t. Band i spans RB_OFFSETS[i]
// to RB_OFFSETS[i+1], so its representative price sits between them.
function rbBandPrice(t,i){
  if(!_rbFit)return 0;
  const mid=(RB_OFFSETS[i]+RB_OFFSETS[i+1])/2;
  return Math.pow(10,_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b+mid);
}
// The band the Growth Projection converges onto. "Still cheap" sits one step below the
// Power-Law centre — a conservative valuation, but a realistic one. This used to be the
// chart's absolute bottom edge (Fire Sale, offset −0.45), which is where price goes in a
// capitulation, not where it lives. Projecting a decade of earnings off a capitulation
// price understated the whole model. See DIFF_G0 — the difficulty path is paired to this
// choice and must move with it.
const RB_PROJ_BAND=RB_LABELS.indexOf('Still cheap');
function rbProjPrice(t){return rbBandPrice(t,RB_PROJ_BAND);}
// Ensure the Power-Law fit exists (load history once if needed), then run cb. Lets the
// Growth Projection reference HODL fair values even before the rainbow chart is opened.
function ensureRainbowFit(cb){
  if(_rbFit){cb&&cb();return;}
  if(_rainbowData){_rbFit=rbComputeFit(_rainbowData);cb&&cb();return;}
  if(_rainbowLoading){return;}
  _rainbowLoading=true;
  fetchRainbowHistory().then(data=>{
    const trimmed=data.filter(p=>p.t>=Date.UTC(2012,0,1));
    _rainbowData=(trimmed.length>50?trimmed:data).sort((a,b)=>a.t-b.t);
    _rbFit=rbComputeFit(_rainbowData);
    _rainbowLoading=false;cb&&cb();
  }).catch(()=>{_rainbowLoading=false;cb&&cb();});
}
function rbPriceAt(series,t){
  if(t<=series[0].t)return null;
  if(t>=series[series.length-1].t)return series[series.length-1].v;
  let lo=0,hi=series.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(series[mid].t<t)lo=mid;else hi=mid;}
  const a=series[lo],c=series[hi],f=(t-a.t)/((c.t-a.t)||1);
  return a.v*Math.pow(c.v/a.v,f);
}
function rbFmtUSD(v){return '$'+Math.round(v).toLocaleString('en-US');}
function renderRainbowLegend(active){
  const el=document.getElementById('btcRainbowLegend');if(!el)return;
  el.innerHTML=RB_LABELS.map((l,i)=>`<span class="rb-pill${i===active?' active':''}" style="border-left-color:${RB_COLORS[i]}">${l}</span>`).join('');
}

function drawBtcRainbow(){
  const wrap=document.getElementById('btcRainbowWrap');
  const cv=document.getElementById('btcRainbowCanvas');
  if(!cv||!wrap||!wrap.classList.contains('show'))return;
  const dpr=window.devicePixelRatio||1;
  const W=cv.clientWidth||wrap.clientWidth, H=cv.clientHeight;
  if(W<10||H<10){requestAnimationFrame(drawBtcRainbow);return;}
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,W,H);

  const series=_rainbowData;
  if(!series||series.length<2){return;}      // message overlay covers the no-data case
  if(!_rbFit)_rbFit=rbComputeFit(series);
  const {m,b,r2}=_rbFit;
  const centerAt=t=>m*Math.log(rbDayOf(t))+b;
  const dataT0=series[0].t, dataT1=series[series.length-1].t;
  const v=rbView();

  // Y auto-fits to the visible window: band extremes + any visible price.
  let yLo=centerAt(v.t0)+RB_OFFSETS[9]-0.08;
  let yHi=centerAt(v.t1)+RB_OFFSETS[0]+0.08;
  for(const p of series){if(p.t>=v.t0&&p.t<=v.t1&&p.v>0){const l=Math.log10(p.v);if(l<yLo)yLo=l;if(l>yHi)yHi=l;}}
  const sm=W<480, P=rbPads(W);
  const plotL=P.l, plotR=W-P.r, plotT=P.t, plotB=H-P.b;
  const plotW=plotR-plotL, plotH=plotB-plotT;
  const X=t=>plotL+plotW*((t-v.t0)/((v.t1-v.t0)||1));
  const Y=lv=>plotT+plotH*(1-((lv-yLo)/((yHi-yLo)||1)));

  // ---- Bands (clipped to the plot) ----
  x.save();x.beginPath();x.rect(plotL,plotT,plotW,plotH);x.clip();
  const steps=140;
  for(let bi=0;bi<RB_OFFSETS.length-1;bi++){
    x.beginPath();
    for(let s=0;s<=steps;s++){const t=v.t0+(v.t1-v.t0)*s/steps;x.lineTo(X(t),Y(centerAt(t)+RB_OFFSETS[bi]));}
    for(let s=steps;s>=0;s--){const t=v.t0+(v.t1-v.t0)*s/steps;x.lineTo(X(t),Y(centerAt(t)+RB_OFFSETS[bi+1]));}
    x.closePath();x.fillStyle=hexA(RB_COLORS[bi],0.82);x.fill();
  }
  // horizontal $ gridlines
  x.lineWidth=1;
  for(let e=Math.ceil(yLo);e<=Math.floor(yHi);e++){const yy=Y(e);x.strokeStyle='rgba(255,255,255,0.10)';x.beginPath();x.moveTo(plotL,yy);x.lineTo(plotR,yy);x.stroke();}
  // year + halving vertical lines
  const yr0=new Date(v.t0).getUTCFullYear(), yr1=new Date(v.t1).getUTCFullYear();
  for(let yr=yr0;yr<=yr1+1;yr++){const t=Date.UTC(yr,0,1);if(t<v.t0||t>v.t1)continue;const xx=X(t);x.strokeStyle='rgba(255,255,255,0.06)';x.beginPath();x.moveTo(xx,plotT);x.lineTo(xx,plotB);x.stroke();}
  for(const h of RB_HALVINGS){if(h.t<v.t0||h.t>v.t1)continue;const xx=X(h.t);
    x.strokeStyle=h.est?'rgba(244,143,177,0.7)':'rgba(255,255,255,0.45)';x.lineWidth=1;x.setLineDash(h.est?[5,4]:[2,3]);
    x.beginPath();x.moveTo(xx,plotT);x.lineTo(xx,plotB);x.stroke();x.setLineDash([]);}
  // price line (black)
  x.beginPath();let first=true;
  for(const p of series){if(p.v<=0)continue;const xx=X(p.t),yy=Y(Math.log10(p.v));if(first){x.moveTo(xx,yy);first=false;}else x.lineTo(xx,yy);}
  x.strokeStyle='rgba(10,10,12,0.92)';x.lineWidth=1.6;x.stroke();
  // yellow halving circles on the price line (past halvings within data)
  for(const h of RB_HALVINGS){if(h.est||h.t<dataT0||h.t>dataT1||h.t<v.t0||h.t>v.t1)continue;
    const pv=rbPriceAt(series,h.t);if(!pv)continue;const xx=X(h.t),yy=Y(Math.log10(pv));
    x.fillStyle='#ffd54a';x.beginPath();x.arc(xx,yy,4.5,0,7);x.fill();x.strokeStyle='#7a5c00';x.lineWidth=1.4;x.stroke();}
  // current price dot
  const cur=S.btcPrice||series[series.length-1].v;
  let curBand=8;
  if(cur>0){const tNow=Math.min(Date.now(),dataT1);const xx=X(tNow),yy=Y(Math.log10(cur));
    if(tNow>=v.t0&&tNow<=v.t1){x.fillStyle='#fff';x.beginPath();x.arc(xx,yy,4.5,0,7);x.fill();x.strokeStyle='#0a0a0a';x.lineWidth=1.6;x.stroke();}
    const cl=Math.log10(cur)-centerAt(tNow);
    if(cl>=RB_OFFSETS[0])curBand=0;else{curBand=8;for(let bi=0;bi<RB_OFFSETS.length-1;bi++){if(cl<RB_OFFSETS[bi]&&cl>=RB_OFFSETS[bi+1]){curBand=bi;break;}}}
  }
  x.restore();

  // ---- Right-side $ axis labels (powers of 10) ----
  x.font=(sm?'9px ':'10px ')+(getComputedStyle(document.body).getPropertyValue('--mono')||'monospace');
  x.textBaseline='middle';x.textAlign='left';x.fillStyle='rgba(255,255,255,0.6)';
  for(let e=Math.ceil(yLo);e<=Math.floor(yHi);e++){const yy=Y(e);if(yy<plotT-2||yy>plotB+2)continue;x.fillText(rbAxisLabel(Math.pow(10,e),sm),plotR+5,yy);}
  // ---- Year labels (abbreviate to 'YY on phones) ----
  x.textAlign='center';x.textBaseline='top';x.fillStyle='rgba(255,255,255,0.6)';
  x.font=(sm?'9px ':'10px ')+(getComputedStyle(document.body).getPropertyValue('--sans')||'sans-serif');
  const span=v.t1-v.t0, yrStep=span>RB_DAY*365*(sm?6:12)?2:1;
  for(let yr=yr0;yr<=yr1+1;yr++){if(yr%yrStep!==0)continue;const t=Date.UTC(yr,0,1);if(t<v.t0||t>v.t1)continue;x.fillText(sm?"'"+String(yr).slice(2):String(yr),X(t),plotB+16);}
  // ---- Halving labels (shortened on phones to avoid clutter) ----
  for(const h of RB_HALVINGS){if(h.t<v.t0||h.t>v.t1)continue;const xx=X(h.t);
    const lab=sm?(h.est?String(new Date(h.t).getUTCFullYear()):'⌗'):h.label;
    x.font=(h.est?'bold ':'')+(sm?'8px ':'9px ')+(getComputedStyle(document.body).getPropertyValue('--sans')||'sans-serif');
    const tw=x.measureText(lab).width;
    if(h.est){x.fillStyle='rgba(244,143,177,0.18)';x.fillRect(xx-tw/2-4,plotB+1,tw+8,12);x.fillStyle='#f48fb1';}
    else x.fillStyle='rgba(255,255,255,0.55)';
    x.textAlign='center';x.textBaseline='top';x.fillText(lab,xx,plotB+2);}

  // ---- Hover crosshair ----
  if(_rbHover!=null&&_rbHover>=v.t0&&_rbHover<=v.t1){
    const xx=X(_rbHover);
    x.save();x.beginPath();x.rect(plotL,plotT,plotW,plotH);x.clip();
    x.strokeStyle='rgba(255,255,255,0.55)';x.setLineDash([4,4]);x.lineWidth=1;
    x.beginPath();x.moveTo(xx,plotT);x.lineTo(xx,plotB);x.stroke();x.setLineDash([]);x.restore();
  }

  renderRainbowLegend(curBand);
  const foot=document.getElementById('btcRainbowFoot');
  if(foot)foot.textContent=`Power-Law regression fitted to BTC since ${new Date(dataT0).getUTCFullYear()} (R² ${(r2*100).toFixed(1)}% fit strength). Scroll to zoom, drag to pan, double-click to reset.`;

  rbBindInteractions(cv);
}
function hexA(hex,a){const n=parseInt(hex.slice(1),16);return'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}

// ---- Zoom / pan (TradingView-style: wheel to zoom at cursor, drag to pan, dbl-click reset) ----
function rbBindInteractions(cv){
  if(_rbBound)return;_rbBound=true;
  cv.style.cursor='grab';
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    const r=cv.getBoundingClientRect(),W=cv.clientWidth,P=rbPads(W);
    const frac=Math.max(0,Math.min(1,((e.clientX-r.left)-P.l)/((W-P.l-P.r)||1)));
    const v=rbView(),anchor=v.t0+(v.t1-v.t0)*frac;
    const f=e.deltaY<0?0.82:1/0.82;
    _rbView=rbClamp(anchor-(anchor-v.t0)*f, anchor+(v.t1-anchor)*f);
    drawBtcRainbow();
  },{passive:false});
  cv.addEventListener('mousemove',e=>{
    if(_rbDrag){rbHideTip();return;}     // dragging is handled by the window listener
    const cr=cv.getBoundingClientRect(),W=cv.clientWidth,P=rbPads(W);
    const frac=((e.clientX-cr.left)-P.l)/((W-P.l-P.r)||1);
    if(frac<0||frac>1){_rbHover=null;rbHideTip();rbRequestDraw();return;}
    const v=rbView();_rbHover=v.t0+(v.t1-v.t0)*frac;
    const wrap=document.getElementById('btcRainbowWrap'),wr=wrap.getBoundingClientRect();
    rbShowTip(_rbHover,e.clientX-wr.left,e.clientY-wr.top);
    rbRequestDraw();
  });
  cv.addEventListener('mouseleave',()=>{_rbHover=null;rbHideTip();rbRequestDraw();});
  cv.addEventListener('mousedown',e=>{_rbDrag={x:e.clientX,v:rbView()};cv.style.cursor='grabbing';_rbHover=null;rbHideTip();});
  window.addEventListener('mousemove',e=>{
    if(!_rbDrag)return;const W=cv.clientWidth,P=rbPads(W),pw=(W-P.l-P.r)||1;
    const span=_rbDrag.v.t1-_rbDrag.v.t0,dt=((e.clientX-_rbDrag.x)/pw)*span;
    _rbView=rbClamp(_rbDrag.v.t0-dt,_rbDrag.v.t1-dt);drawBtcRainbow();
  });
  window.addEventListener('mouseup',()=>{if(_rbDrag){_rbDrag=null;cv.style.cursor='grab';}});
  cv.addEventListener('dblclick',e=>{e.preventDefault();_rbView=null;drawBtcRainbow();});
  // touch: 1-finger pan, 2-finger pinch zoom
  cv.addEventListener('touchstart',e=>{
    if(e.touches.length===1)_rbDrag={x:e.touches[0].clientX,v:rbView()};
    else if(e.touches.length===2){const a=e.touches[0],c=e.touches[1];_rbPinch={d:Math.abs(a.clientX-c.clientX)||1,v:rbView(),mx:(a.clientX+c.clientX)/2};_rbDrag=null;}
  },{passive:true});
  cv.addEventListener('touchmove',e=>{
    const W=cv.clientWidth,P=rbPads(W),pw=(W-P.l-P.r)||1,r=cv.getBoundingClientRect();
    if(e.touches.length===2&&_rbPinch){e.preventDefault();
      const a=e.touches[0],c=e.touches[1],d=Math.abs(a.clientX-c.clientX)||1;
      const frac=Math.max(0,Math.min(1,((_rbPinch.mx-r.left)-P.l)/pw));
      const vv=_rbPinch.v,anchor=vv.t0+(vv.t1-vv.t0)*frac,f=_rbPinch.d/d;
      _rbView=rbClamp(anchor-(anchor-vv.t0)*f,anchor+(vv.t1-anchor)*f);drawBtcRainbow();
    }else if(e.touches.length===1&&_rbDrag){e.preventDefault();
      const span=_rbDrag.v.t1-_rbDrag.v.t0,dt=((e.touches[0].clientX-_rbDrag.x)/pw)*span;
      _rbView=rbClamp(_rbDrag.v.t0-dt,_rbDrag.v.t1-dt);drawBtcRainbow();
    }
  },{passive:false});
  cv.addEventListener('touchend',e=>{if(e.touches.length===0){_rbDrag=null;_rbPinch=null;}});
}
window.addEventListener('resize',()=>{const w=document.getElementById('btcRainbowWrap');if(w&&w.classList.contains('show'))drawBtcRainbow();});
function buildChart(symbol,allowChange){
  const make=()=>{
    if(!window.TradingView||!window.TradingView.widget)return;
    if(_chartSym===symbol)return;   // already showing this symbol
    _chartSym=symbol;
    document.getElementById('btcChartWidget').innerHTML='';
    // A phone has no room for the drawing rail or the date-range strip — the candles are the
    // point, so hand them the full width there and keep the top toolbar for the interval switch.
    const narrow=window.matchMedia('(max-width:700px)').matches;
    new TradingView.widget({
      container_id:'btcChartWidget', autosize:true,
      symbol:symbol, interval:'60', timezone:'Etc/UTC',
      theme:'dark', style:'1', locale:'en',
      hide_side_toolbar:narrow,   // drawing / TA toolbar — desktop only
      allow_symbol_change:!!allowChange, withdateranges:!narrow, details:false,
      // 50 EMA on every chart, every load. The study's own default is 9, so the length has to
      // be forced through studies_overrides — embed widgets keep no saved chart state.
      studies:['MAExp@tv-basicstudies'],
      studies_overrides:{
        'moving average exponential.length':50,
        'moving average exponential.plot.color':'#F5A623',
        'moving average exponential.plot.linewidth':2
      },
      backgroundColor:'rgba(10,10,10,1)', gridColor:'rgba(245,166,35,0.06)'
    });
  };
  if(window.TradingView){make();return;}
  const s=document.createElement('script');
  s.src='https://s3.tradingview.com/tv.js';s.async=true;s.onload=make;
  document.head.appendChild(s);
}

// ============================================================
// BTC + GMT COMBINED CHART (/combined)
// Two assets whose prices differ by five orders of magnitude can only be compared as INDEXES,
// so both are re-based to 100 at the left edge of the window — the lines then answer the real
// question ("do they rise and fall together?") instead of hugging opposite corners. On top sits
// a blended index, weighted between the two, and its 50-day EMA.
// ============================================================
// The hold/convert verdict, the GMT/BTC signal view and the swap levels are PARKED, not deleted:
// the maths is sound but the product question behind it is not settled. Everything below still
// works — flip this one flag to true to bring the whole thing back. Until then /combined is the
// comparison chart only, and nothing on the page offers a trading opinion.
const CMB_SIGNAL_ON=false;
let _cmbData=null, _cmbLoading=false, _cmbDays=180, _cmbHover=null, _cmbMode='compare';
const CMB_EMA_N=50;
const CMB_BTC='#F5A623', CMB_GMT='#7FB0FF', CMB_EMA='#16c784';

// Daily closes for one asset, newest last, as {t(ms),v}. Every source here is CORS-open.
async function cmbFetchBTC(){
  try{   // Coinbase daily candles: [time(s),low,high,open,close,vol], newest first, max ~300
    const r=await fetchTO('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400',14000);
    if(Array.isArray(r)&&r.length>60)return r.map(c=>({t:c[0]*1000,v:+c[4]})).sort((a,b)=>a.t-b.t);
  }catch(e){}
  try{   // CoinGecko daily market chart
    const r=await fetchTO('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily',14000);
    if(r&&Array.isArray(r.prices)&&r.prices.length>60)return r.prices.map(p=>({t:+p[0],v:+p[1]}));
  }catch(e){}
  return null;
}
async function cmbFetchGMT(){
  try{   // Bitget daily candles: [ts(ms),open,high,low,close,...]
    const r=await fetchTO('https://api.bitget.com/api/v2/spot/market/candles?symbol=GOMININGUSDT&granularity=1day&limit=400',14000);
    const d=r&&r.data;
    if(Array.isArray(d)&&d.length>60)return d.map(c=>({t:+c[0],v:+c[4]})).sort((a,b)=>a.t-b.t);
  }catch(e){}
  try{
    const r=await fetchTO('https://api.coingecko.com/api/v3/coins/gmt-token/market_chart?vs_currency=usd&days=365&interval=daily',14000);
    if(r&&Array.isArray(r.prices)&&r.prices.length>60)return r.prices.map(p=>({t:+p[0],v:+p[1]}));
  }catch(e){}
  return null;
}
// Snap to UTC days and keep only the days BOTH assets traded, so every comparison, return and
// correlation below lines up date-for-date instead of drifting between two exchange calendars.
function cmbAlign(a,b){
  const day=t=>Math.floor(t/86400000)*86400000;
  const ma=new Map(),mb=new Map();
  a.forEach(p=>{if(p.v>0)ma.set(day(p.t),p.v)});
  b.forEach(p=>{if(p.v>0)mb.set(day(p.t),p.v)});
  const out=[];
  Array.from(ma.keys()).sort((x,y)=>x-y).forEach(t=>{if(mb.has(t))out.push({t,btc:ma.get(t),gmt:mb.get(t)})});
  return out;
}
function loadCombined(force){
  if(_cmbLoading)return;
  if(_cmbData&&!force){drawCombined();return;}
  _cmbLoading=true;
  const msg=document.getElementById('cmbMsg');
  if(msg){msg.textContent='Loading daily price history…';msg.style.display='';}
  Promise.all([cmbFetchBTC(),cmbFetchGMT()]).then(([b,g])=>{
    _cmbLoading=false;
    const rows=(b&&g)?cmbAlign(b,g):[];
    if(rows.length<CMB_EMA_N+10){
      if(msg){msg.textContent='Couldn’t load enough overlapping daily history right now — try again shortly.';msg.style.display='';}
      return;
    }
    _cmbData=rows;
    if(msg)msg.style.display='none';
    drawCombined();
  }).catch(()=>{
    _cmbLoading=false;
    if(msg){msg.textContent='Couldn’t load price history right now — try again shortly.';msg.style.display='';}
  });
}
// Pearson correlation of DAILY LOG RETURNS — the honest measure of "do they move together".
// Correlating the price levels themselves would report ~1 for any two things that both trended.
function cmbCorrelation(rows){
  const rb=[],rg=[];
  for(let i=1;i<rows.length;i++){
    if(rows[i].btc>0&&rows[i-1].btc>0&&rows[i].gmt>0&&rows[i-1].gmt>0){
      rb.push(Math.log(rows[i].btc/rows[i-1].btc));
      rg.push(Math.log(rows[i].gmt/rows[i-1].gmt));
    }
  }
  const n=rb.length;if(n<10)return null;
  const mb=rb.reduce((a,c)=>a+c,0)/n, mg=rg.reduce((a,c)=>a+c,0)/n;
  let sbg=0,sbb=0,sgg=0;
  for(let i=0;i<n;i++){const db=rb[i]-mb,dg=rg[i]-mg;sbg+=db*dg;sbb+=db*db;sgg+=dg*dg;}
  return (sbb>0&&sgg>0)?sbg/Math.sqrt(sbb*sgg):null;
}
// ---- The whole page in one line: hold GMT, or sit in stablecoin ----
// One rule decides it: GMT against its own 50-day EMA in dollars. That is the plain
// trend-following test, it is the indicator that was actually asked for, and keeping the verdict
// on ONE variable is what makes it readable — a verdict assembled from three conditions is not a
// verdict, it is a paragraph. The BTC-relative z-score is shown next to it as context, never as
// part of the decision.
function cmbHoldSignal(rows){
  if(!rows||rows.length<CMB_EMA_N+5)return null;
  const k=2/(CMB_EMA_N+1);
  let e=0;for(let i=0;i<CMB_EMA_N;i++)e+=rows[i].gmt;e/=CMB_EMA_N;
  const ema=[];ema[CMB_EMA_N-1]=e;
  for(let i=CMB_EMA_N;i<rows.length;i++){e=rows[i].gmt*k+e*(1-k);ema[i]=e;}
  // A 1% deadband around the average. Without it a dead-flat price sits a hair below its own EMA
  // and the card reads CONVERT — a sell call generated by rounding. Inside the band the answer is
  // HOLD, because doing nothing is the default and converting costs fees both ways.
  const DEAD=0.01;
  const above=i=>ema[i]!=null&&rows[i].gmt>=ema[i]*(1-DEAD);
  const i=rows.length-1;
  if(ema[i]==null)return null;
  // How long the current side has held, so the card can say whether this is a fresh flip (which
  // is where trend rules whipsaw) or a settled trend.
  let days=1;
  for(let j=i-1;j>=CMB_EMA_N-1;j--){if(above(j)!==above(i))break;days++;}
  const gap=(rows[i].gmt/ema[i]-1)*100;
  // The level the verdict actually turns on, in dollars. "Below its average" is not something you
  // can put a limit order at; a price is. Note the EMA drifts each day, so this is today's line,
  // not a standing one — the card says so.
  const trigger=ema[i]*(1-DEAD);
  return {hold:above(i),gap,days,price:rows[i].gmt,ema:ema[i],trigger,
    away:(trigger/rows[i].gmt-1)*100,fresh:days<=5,flat:Math.abs(gap)<DEAD*100};
}
// ---- Sell-high / buy-back-low levels on GMT itself ----
// The 50-day trend rule above exits AFTER a top and re-enters AFTER a bottom — by construction it
// never sells high or buys low. Doing that needs a valuation band instead: how stretched GMT is
// against its own average, in standard deviations of the log deviation. Same maths as the
// GMT/BTC view, pointed at GMT's dollar price, and trailing-only so no day sees its own future.
function cmbGmtBands(rows){
  const out=rows.map(r=>({t:r.t,v:r.gmt}));
  if(out.length<CMB_EMA_N+10)return out;
  const k=2/(CMB_EMA_N+1);
  let e=0;for(let i=0;i<CMB_EMA_N;i++)e+=out[i].v;e/=CMB_EMA_N;
  out[CMB_EMA_N-1].ema=e;
  for(let i=CMB_EMA_N;i<out.length;i++){e=out[i].v*k+e*(1-k);out[i].ema=e;}
  for(let i=0;i<out.length;i++)if(out[i].ema>0)out[i].dev=Math.log(out[i].v/out[i].ema);
  for(let i=0;i<out.length;i++){
    if(out[i].dev==null)continue;
    const w=[];
    for(let j=Math.max(0,i-CMB_EMA_N+1);j<=i;j++)if(out[j].dev!=null)w.push(out[j].dev);
    if(w.length<20)continue;
    const mu=w.reduce((a,c)=>a+c,0)/w.length;
    const sd=Math.sqrt(w.reduce((a,c)=>a+(c-mu)*(c-mu),0)/w.length);
    out[i].mu=mu;out[i].sd=sd;
    out[i].z=sd>1e-9?(out[i].dev-mu)/sd:0;
    out[i].sell=out[i].ema*Math.exp(mu+K_SWAP*sd);
    out[i].buy=out[i].ema*Math.exp(mu-K_SWAP*sd);
  }
  return out;
}
let K_SWAP=1.0;   // band width in sd; 1.0 traded most often on the history we can see
// What this rule would ACTUALLY have done on the history on screen, measured in GMT — the only
// unit that matters to someone who needs GMT for coverage. Swapping out and back is only worth
// doing if it ends with MORE GMT than never moving, so that is what gets reported, including
// when the answer is "less".
function cmbSwapBacktest(B){
  const live=B.filter(p=>p.z!=null);
  if(live.length<30)return null;
  let gmt=1000,usd=0,inGmt=true,trips=0,lastAt=null;
  for(const p of live){
    if(inGmt&&p.z>=K_SWAP){usd=gmt*p.v;gmt=0;inGmt=false;trips++;lastAt={side:'stable',t:p.t,v:p.v};}
    else if(!inGmt&&p.z<=-K_SWAP){gmt=usd/p.v;usd=0;inGmt=true;trips++;lastAt={side:'gmt',t:p.t,v:p.v};}
  }
  const end=inGmt?gmt:usd/live[live.length-1].v;
  return {trips,endGmt:end,edge:(end/1000-1)*100,days:live.length,inGmt,lastAt};
}
// ---- GMT/BTC relative-value signal ----
// GMT mostly rides Bitcoin, so its own chart says little that BTC's doesn't. Dividing the two
// strips the shared move out and leaves the part that is actually about GMT: what a unit of GMT
// costs in Bitcoin. That ratio is mean-reverting in a way neither price is, which is what makes
// it usable as a timing tool — for converting mining rewards into GMT, above all.
// z = how far today's ratio sits from its own 50-day EMA, in standard deviations of that same
// deviation. Log deviations, so a 20% premium and a 20% discount are symmetric.
function cmbRatioSeries(rows){
  const out=rows.map(r=>({t:r.t,btc:r.btc,gmt:r.gmt,ratio:r.gmt/r.btc}));
  if(out.length<CMB_EMA_N+10)return out;
  let e=0;for(let i=0;i<CMB_EMA_N;i++)e+=out[i].ratio;e/=CMB_EMA_N;
  const k=2/(CMB_EMA_N+1);
  out[CMB_EMA_N-1].ema=e;
  for(let i=CMB_EMA_N;i<out.length;i++){e=out[i].ratio*k+e*(1-k);out[i].ema=e;}
  for(let i=0;i<out.length;i++)if(out[i].ema>0)out[i].dev=Math.log(out[i].ratio/out[i].ema);
  // Trailing dispersion, never forward-looking: each day's bands use only days up to that day,
  // so the history on screen is what the signal would genuinely have said at the time.
  for(let i=0;i<out.length;i++){
    if(out[i].dev==null)continue;
    const win=[];
    for(let j=Math.max(0,i-CMB_EMA_N+1);j<=i;j++)if(out[j].dev!=null)win.push(out[j].dev);
    if(win.length<12)continue;
    const mu=win.reduce((a,c)=>a+c,0)/win.length;
    const sd=Math.sqrt(win.reduce((a,c)=>a+(c-mu)*(c-mu),0)/win.length);
    out[i].mu=mu;out[i].sd=sd;
    out[i].z=sd>1e-9?(out[i].dev-mu)/sd:0;
  }
  return out;
}
// Slope of the ratio's own EMA over the last month — the trend filter. "Cheap" in a ratio that
// is still falling means cheap and getting cheaper, which is a different trade from cheap and
// stabilising, and the wording has to say so rather than flash a green light either way.
function cmbRatioSlope(R){
  const withEma=R.filter(p=>p.ema>0);
  if(withEma.length<25)return 0;
  const a=withEma[withEma.length-22].ema, b=withEma[withEma.length-1].ema;
  return a>0?(b/a-1):0;
}
// Deliberately NOT a trade instruction. It states where the ratio sits and what that has meant,
// and the caller renders the caveat alongside — a z-score is a description of the present, not a
// forecast, and it breaks whenever the relationship itself breaks (tokenomics, listings, news).
function cmbVerdict(z,slope){
  if(z==null)return null;
  const falling=slope<-0.02, rising=slope>0.02;
  if(z<=-2)return{tone:'buy',label:'GMT unusually cheap vs BTC',
    body:'The ratio is more than 2 standard deviations below its 50-day average — a level it has historically spent little time at. '+(falling?'It is still trending down, though, so cheap can get cheaper; scaling in beats going all at once.':'The trend has flattened, which is the setup mean reversion actually needs.')};
  if(z<=-1)return{tone:'buy',label:'GMT cheap vs BTC',
    body:'Below its 50-day average against Bitcoin. '+(falling?'The downtrend is intact, so treat this as a better-than-average entry, not a bottom.':'A reasonable window to convert mining rewards into GMT.')};
  if(z<1)return{tone:'neutral',label:'GMT fairly priced vs BTC',
    body:'Within a standard deviation of its 50-day average — the ratio is telling you nothing much. Convert on your normal schedule.'};
  if(z<2)return{tone:'sell',label:'GMT rich vs BTC',
    body:'Above its 50-day average against Bitcoin. '+(rising?'Momentum is with it, so this is a reason to wait rather than to sell.':'If you were going to hold rewards in BTC for a while, this is the better end of the range to do it.')};
  return{tone:'sell',label:'GMT unusually rich vs BTC',
    body:'More than 2 standard deviations above its 50-day average. '+(rising?'Still climbing — stretched is not the same as finished.':'Historically a poor moment to be buying GMT with BTC.')};
}
function cmbPads(W){return W<480?{l:8,r:46,t:14,b:40}:{l:10,r:66,t:16,b:44};}
function sm0(W){return W<480;}
function drawCombined(){
  const page=document.getElementById('cmbPage');
  const wrap=document.getElementById('cmbWrap'), cv=document.getElementById('cmbCanvas');
  // Bail on a hidden page BEFORE the zero-size retry below, or leaving the chart open would
  // leave a requestAnimationFrame loop spinning against a 0x0 canvas forever.
  if(!cv||!wrap||!page||page.style.display==='none'||!wrap.classList.contains('show'))return;
  const dpr=window.devicePixelRatio||1;
  const W=cv.clientWidth||wrap.clientWidth, H=cv.clientHeight;
  if(W<10||H<10){requestAnimationFrame(drawCombined);return;}
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);
  if(!_cmbData||_cmbData.length<2)return;
  renderCmbVerdict();

  // Two price lines, nothing else. Both re-based to 100 at the LEFT EDGE OF THE WINDOW — not at
  // the start of everything downloaded — so changing the range re-zeroes them and the chart
  // always answers "what have these two done since the date on the left".
  const all=_cmbData, n=all.length;
  const want=Math.min(n,_cmbDays);
  if(CMB_SIGNAL_ON&&_cmbMode==='signal'){drawCmbSignal(x,all,want,W,H,sm0(W));return;}
  const S=all.slice(n-want);
  if(S.length<2)return;
  const b0=S[0].btc, g0=S[0].gmt;
  S.forEach(p=>{p.biR=p.btc/b0*100;p.giR=p.gmt/g0*100;});

  const sm=W<480, P=cmbPads(W);
  const L=P.l,R=W-P.r,T=P.t,B=H-P.b, pw=R-L, ph=B-T;
  let lo=Infinity,hi=-Infinity;
  S.forEach(p=>{[p.biR,p.giR].forEach(v=>{if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v;}})});
  const padv=(hi-lo)*0.08||8;lo-=padv;hi+=padv;
  const t0=S[0].t,t1=S[S.length-1].t;
  const X=t=>L+pw*((t-t0)/((t1-t0)||1));
  const Y=v=>T+ph*(1-((v-lo)/((hi-lo)||1)));

  // grid + right axis, labelled as % change since the left edge
  x.font=(sm?'10px':'11px')+' "Share Tech Mono",monospace';x.textAlign='left';
  for(let k=0;k<=4;k++){
    const v=lo+(hi-lo)*k/4, gy=Y(v);
    x.strokeStyle=(Math.abs(v-100)<(hi-lo)/80)?'rgba(255,255,255,0.22)':'rgba(245,166,35,0.07)';
    x.lineWidth=1;x.beginPath();x.moveTo(L,gy);x.lineTo(R,gy);x.stroke();
    x.fillStyle='rgba(255,255,255,0.45)';
    x.fillText((v>=100?'+':'')+Math.round(v-100)+'%',R+6,gy+4);
  }
  // month gridlines
  x.textAlign='center';let lastM=null;
  S.forEach(p=>{const d=new Date(p.t),mk=d.getUTCFullYear()+'-'+d.getUTCMonth();
    if(mk!==lastM){lastM=mk;const gx=X(p.t);
      x.strokeStyle='rgba(255,255,255,0.05)';x.beginPath();x.moveTo(gx,T);x.lineTo(gx,B);x.stroke();
      x.fillStyle='rgba(255,255,255,0.4)';
      x.fillText(d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}),gx,B+16);}});

  const line=(key,col,wd,dash)=>{
    x.save();x.beginPath();x.rect(L,T,pw,ph);x.clip();
    x.strokeStyle=col;x.lineWidth=wd;x.lineJoin='round';x.setLineDash(dash||[]);
    let started=false;
    S.forEach(p=>{const v=p[key];if(v==null||!isFinite(v))return;
      const px=X(p.t),py=Y(v);if(!started){x.beginPath();x.moveTo(px,py);started=true;}else x.lineTo(px,py);});
    if(started)x.stroke();
    x.setLineDash([]);x.restore();
  };
  line('biR',CMB_BTC,2);
  line('giR',CMB_GMT,2);

  // crosshair readout
  if(_cmbHover!=null){
    const frac=Math.max(0,Math.min(1,(_cmbHover-L)/(pw||1)));
    const p=S[Math.round(frac*(S.length-1))];
    if(p){
      const px=X(p.t);
      x.strokeStyle='rgba(255,255,255,0.3)';x.lineWidth=1;x.setLineDash([3,3]);
      x.beginPath();x.moveTo(px,T);x.lineTo(px,B);x.stroke();x.setLineDash([]);
      [['biR',CMB_BTC],['giR',CMB_GMT]].forEach(([k,c])=>{
        if(p[k]==null)return;x.fillStyle=c;x.beginPath();x.arc(px,Y(p[k]),3.2,0,7);x.fill();});
      const tip=document.getElementById('cmbTip');
      if(tip){
        tip.style.display='';
        tip.innerHTML=`<div class="rb-tip-date">${new Date(p.t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}</div>`
          +`<div class="rb-tip-row"><span class="rb-tip-sw" style="background:${CMB_BTC}"></span><span class="rb-tip-lbl">BTC</span><span class="rb-tip-px">${fmtBTCPrice(p.btc)}</span></div>`
          +`<div class="rb-tip-row"><span class="rb-tip-sw" style="background:${CMB_GMT}"></span><span class="rb-tip-lbl">GMT</span><span class="rb-tip-px">$${p.gmt.toFixed(4)}</span></div>`;
        const tw=tip.offsetWidth||150;
        tip.style.left=Math.max(4,Math.min(W-tw-4,px+12))+'px';
        tip.style.top=(T+6)+'px';
      }
    }
  }else{const tip=document.getElementById('cmbTip');if(tip)tip.style.display='none';}

  // legend + stats
  const last=S[S.length-1];
  const corr=cmbCorrelation(all.slice(-want));
  const pct=v=>(v>=100?'+':'')+(v-100).toFixed(1)+'%';
  const lg=document.getElementById('cmbLegend');
  if(lg)lg.innerHTML=
     `<span class="rb-pill" style="border-left-color:${CMB_BTC}">BTC ${pct(last.biR)} &middot; ${fmtBTCPrice(last.btc)}</span>`
    +`<span class="rb-pill" style="border-left-color:${CMB_GMT}">GMT ${pct(last.giR)} &middot; $${last.gmt.toFixed(4)}</span>`
    +(corr!=null?`<span class="rb-pill" style="border-left-color:${corr>=0.5?'#16c784':corr>=0.2?'#f3a93a':'#ea3943'}">correlation ${corr.toFixed(2)}</span>`:'');
  const note=document.getElementById('cmbCorrNote');
  if(note)note.textContent=corr==null?''
    :corr>=0.7?'They move together closely — GMT is largely riding Bitcoin day to day.'
    :corr>=0.4?'They move together more often than not, with GMT adding its own swings.'
    :corr>=0.15?'Loosely linked — GMT is mostly driven by something other than BTC right now.'
    :corr>=-0.15?'Effectively unlinked over this window.'
    :'They have been moving in opposite directions over this window.';
}
// Signal view: the GMT/BTC ratio against its own 50-day EMA, with the +/-1 and +/-2 sd envelopes
// the z-score is measured in. Everything is indexed to the EMA (=100), so the y-axis reads as
// "percent rich/cheap versus the average" rather than as an unreadable 0.0000051 ratio.
function drawCmbSignal(x,all,want,W,H,sm){
  const pad=Math.max(0,all.length-want-CMB_EMA_N);
  const R=cmbRatioSeries(all.slice(pad));
  const S=R.slice(Math.max(0,(all.length-want)-pad)).filter(p=>p.ema>0);
  if(S.length<2){const msg=document.getElementById('cmbMsg');if(msg){msg.textContent='Not enough overlapping history for the 50-day signal yet.';msg.style.display='';}return;}
  const P=cmbPads(W),L=P.l,Rr=W-P.r,T=P.t,B=H-P.b,pw=Rr-L,ph=B-T;
  const rel=p=>p.ratio/p.ema*100;
  const band=(p,k)=>Math.exp((p.mu||0)+k*(p.sd||0))*100;
  let lo=Infinity,hi=-Infinity;
  S.forEach(p=>{[rel(p),band(p,2),band(p,-2)].forEach(v=>{if(isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v;}})});
  const padv=(hi-lo)*0.08||4;lo-=padv;hi+=padv;
  const t0=S[0].t,t1=S[S.length-1].t;
  const X=t=>L+pw*((t-t0)/((t1-t0)||1));
  const Y=v=>T+ph*(1-((v-lo)/((hi-lo)||1)));

  const zone=(kA,kB,fill)=>{
    x.save();x.beginPath();x.rect(L,T,pw,ph);x.clip();
    x.beginPath();
    S.forEach((p,idx)=>{const px=X(p.t),py=Y(band(p,kA));idx?x.lineTo(px,py):x.moveTo(px,py);});
    for(let idx=S.length-1;idx>=0;idx--){const p=S[idx];x.lineTo(X(p.t),Y(band(p,kB)));}
    x.closePath();x.fillStyle=fill;x.fill();x.restore();
  };
  zone(2,1,'rgba(234,57,67,0.10)');      // rich
  zone(-1,-2,'rgba(22,199,132,0.10)');   // cheap
  zone(1,-1,'rgba(255,255,255,0.03)');   // fair

  x.font=(sm?'10px':'11px')+' "Share Tech Mono",monospace';x.textAlign='left';
  for(let k=0;k<=4;k++){
    const v=lo+(hi-lo)*k/4,gy=Y(v);
    x.strokeStyle='rgba(245,166,35,0.06)';x.lineWidth=1;x.beginPath();x.moveTo(L,gy);x.lineTo(Rr,gy);x.stroke();
    x.fillStyle='rgba(255,255,255,0.45)';x.fillText((v>=100?'+':'')+Math.round(v-100)+'%',Rr+6,gy+4);
  }
  x.textAlign='center';let lastM=null;
  S.forEach(p=>{const d=new Date(p.t),mk=d.getUTCFullYear()+'-'+d.getUTCMonth();
    if(mk!==lastM){lastM=mk;const gx=X(p.t);
      x.strokeStyle='rgba(255,255,255,0.05)';x.beginPath();x.moveTo(gx,T);x.lineTo(gx,B);x.stroke();
      x.fillStyle='rgba(255,255,255,0.4)';x.fillText(d.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}),gx,B+16);}});

  const path=(fn,col,wd,dash)=>{
    x.save();x.beginPath();x.rect(L,T,pw,ph);x.clip();
    x.strokeStyle=col;x.lineWidth=wd;x.lineJoin='round';x.setLineDash(dash||[]);
    x.beginPath();S.forEach((p,idx)=>{const px=X(p.t),py=Y(fn(p));idx?x.lineTo(px,py):x.moveTo(px,py);});
    x.stroke();x.setLineDash([]);x.restore();
  };
  path(()=>100,'rgba(255,255,255,0.45)',1.4,[5,4]);   // the 50-day EMA itself
  path(p=>band(p,1),'rgba(234,57,67,0.5)',1);
  path(p=>band(p,-1),'rgba(22,199,132,0.5)',1);
  path(rel,'#FFCF7A',2.4);                            // GMT priced in BTC

  const last=S[S.length-1];
  if(_cmbHover!=null){
    const frac=Math.max(0,Math.min(1,(_cmbHover-L)/(pw||1)));
    const p=S[Math.round(frac*(S.length-1))];
    if(p){
      const px=X(p.t);
      x.strokeStyle='rgba(255,255,255,0.3)';x.lineWidth=1;x.setLineDash([3,3]);
      x.beginPath();x.moveTo(px,T);x.lineTo(px,B);x.stroke();x.setLineDash([]);
      x.fillStyle='#FFCF7A';x.beginPath();x.arc(px,Y(rel(p)),3.4,0,7);x.fill();
      const tip=document.getElementById('cmbTip');
      if(tip){
        tip.style.display='';
        tip.innerHTML=`<div class="rb-tip-date">${new Date(p.t).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}</div>`
          +`<div class="rb-tip-actual">GMT ${'$'+p.gmt.toFixed(4)} &middot; BTC ${fmtBTCPrice(p.btc)}</div>`
          +`<div class="rb-tip-row"><span class="rb-tip-lbl">vs 50d avg</span><span class="rb-tip-px">${(rel(p)>=100?'+':'')+(rel(p)-100).toFixed(1)}%</span></div>`
          +`<div class="rb-tip-row"><span class="rb-tip-lbl">z-score</span><span class="rb-tip-px" style="color:${p.z<=-1?'#16c784':p.z>=1?'#ea3943':'var(--text)'}">${p.z!=null?p.z.toFixed(2):'—'}</span></div>`;
        const tw=tip.offsetWidth||150;
        tip.style.left=Math.max(4,Math.min(W-tw-4,px+12))+'px';tip.style.top=(T+6)+'px';
      }
    }
  }else{const tip=document.getElementById('cmbTip');if(tip)tip.style.display='none';}

  const slope=cmbRatioSlope(R), v=cmbVerdict(last.z,slope);
  const lg=document.getElementById('cmbLegend');
  if(lg)lg.innerHTML=
     `<span class="rb-pill" style="border-left-color:#FFCF7A">GMT/BTC ${(rel(last)>=100?'+':'')+(rel(last)-100).toFixed(1)}% vs 50d</span>`
    +`<span class="rb-pill" style="border-left-color:${last.z<=-1?'#16c784':last.z>=1?'#ea3943':'rgba(255,255,255,.4)'}">z ${last.z!=null?last.z.toFixed(2):'—'}</span>`
    +`<span class="rb-pill" style="border-left-color:${slope>0.02?'#16c784':slope<-0.02?'#ea3943':'rgba(255,255,255,.4)'}">30d trend ${(slope>=0?'+':'')+(slope*100).toFixed(1)}%</span>`;
  const note=document.getElementById('cmbCorrNote');
  if(note&&v)note.innerHTML=`<strong style="color:${v.tone==='buy'?'#16c784':v.tone==='sell'?'#ea3943':'var(--text2)'}">${v.label}.</strong> ${v.body}`;
}
function renderCmbVerdict(){
  const el=document.getElementById('cmbVerdict');
  if(!el)return;
  if(!CMB_SIGNAL_ON){el.style.display='none';return;}
  const sig=cmbHoldSignal(_cmbData);
  if(!sig){el.style.display='none';return;}
  el.style.display='';
  el.className='cmb-verdict '+(sig.hold?'hold':'out');
  const R=cmbRatioSeries(_cmbData);
  const z=R.length?R[R.length-1].z:null;
  const rel=z==null?'':(z<=-1?' It is also cheap against Bitcoin right now.'
    :z>=1?' It is also expensive against Bitcoin right now.':'');
  el.innerHTML=
     `<div class="cmb-verdict-head">${sig.hold?'HOLD GMT':'CONVERT TO STABLECOIN'}</div>`
    +`<div class="cmb-verdict-why">GMT is <strong>${sig.gap>=0?'+':''}${sig.gap.toFixed(1)}%</strong> ${sig.gap>=0?'above':'below'} its 50-day average `
    +`($${sig.price.toFixed(4)} vs $${sig.ema.toFixed(4)}) &mdash; ${sig.flat?'sitting right on it, so there is no trend either way and nothing to act on.':(sig.hold?'the trend is up.':'the trend is down.')}${rel}</div>`
    +`<div class="cmb-verdict-level">${sig.hold
        ? `Converts if GMT closes below <strong>$${sig.trigger.toFixed(4)}</strong> &mdash; <strong>${Math.abs(sig.away).toFixed(1)}%</strong> below today's price.`
        : `Back to hold once GMT closes above <strong>$${sig.trigger.toFixed(4)}</strong> &mdash; <strong>${Math.abs(sig.away).toFixed(1)}%</strong> above today's price.`}
        <span style="color:var(--text3)">The average moves daily, so this level drifts with it.</span></div>`
    +cmbSwapBlock()
    +`<div class="cmb-verdict-sub">${sig.fresh?`Signal flipped <strong>${sig.days} day${sig.days===1?'':'s'}</strong> ago &mdash; fresh flips are where this rule whipsaws most, so treat it as early rather than confirmed.`:`Held for <strong>${sig.days} days</strong>.`} `
    +`Locked GMT is what holds your fee discount &mdash; this is about spare GMT, not your coverage.</div>`;
}
function cmbSwapBlock(){
  const B=cmbGmtBands(_cmbData||[]);
  const last=B.length?B[B.length-1]:null;
  if(!last||last.sell==null)return '';
  const bt=cmbSwapBacktest(B);
  const px=v=>'$'+v.toFixed(4);
  const now=last.v;
  const stretched=last.z>=K_SWAP?'sell':last.z<=-K_SWAP?'buy':'';
  // The two rules on this card can disagree, and often do at exactly the moments that matter:
  // an asset well above its average is both "trending up" (hold) and "stretched" (sell). Saying
  // so is more useful than silently showing a green verdict above a red level.
  const trend=cmbHoldSignal(_cmbData);
  const clash=(trend&&trend.hold&&stretched==='sell')
    ? 'The two rules disagree right now: the trend is up, but GMT is stretched above its average. Trend-followers hold and ride it; mean-reverters take the swap here. Both are defensible — what is not defensible is switching rules based on which one is currently winning.'
    : (trend&&!trend.hold&&stretched==='buy')
    ? 'The two rules disagree right now: the trend is down, but GMT is stretched below its average. Buying here is catching the falling knife on purpose — size it accordingly.'
    : '';
  return `<div class="cmb-swap">
    <div class="cmb-swap-title">Swap levels <span>&middot; sell high, buy back low &middot; &plusmn;${K_SWAP.toFixed(1)}&sigma;</span></div>
    <div class="cmb-swap-row">
      <span class="cmb-swap-leg ${stretched==='sell'?'hit':''}"><b>Swap to stablecoin above</b> ${px(last.sell)} <i>${((last.sell/now-1)*100>=0?'+':'')+((last.sell/now-1)*100).toFixed(1)}%</i></span>
      <span class="cmb-swap-leg ${stretched==='buy'?'hit':''}"><b>Swap back to GMT below</b> ${px(last.buy)} <i>${((last.buy/now-1)*100).toFixed(1)}%</i></span>
    </div>
    ${bt?`<div class="cmb-swap-bt">On the last <strong>${bt.days}</strong> days this rule made <strong>${bt.trips}</strong> swap${bt.trips===1?'':'s'} and ended with <strong style="color:${bt.edge>=0?'#16c784':'#ea3943'}">${(bt.edge>=0?'+':'')+bt.edge.toFixed(1)}%</strong> ${bt.edge>=0?'more':'less'} GMT than never moving.
      ${bt.trips<8?`That is only ${bt.trips} trade${bt.trips===1?'':'s'} &mdash; far too few to call it an edge rather than luck.`:''}</div>`:''}
    ${clash?`<div class="cmb-swap-clash">${clash}</div>`:''}
  </div>`;
}
function setCmbBand(k,btn){
  K_SWAP=k;
  const nav=document.getElementById('cmbBandNav');
  if(nav)nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
  renderCmbVerdict();drawCombined();
}
function setCmbMode(mode,btn){
  _cmbMode=mode;
  const nav=document.getElementById('cmbModeNav');
  if(nav)nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
  const ft=document.getElementById('cmbFootNote');
  if(ft)ft.style.display=(mode==='compare')?'':'none';
  const sf=document.getElementById('cmbSignalFoot');
  if(sf)sf.style.display=(mode==='signal')?'':'none';
  drawCombined();
}
function setCmbRange(days,btn){
  _cmbDays=days;
  const nav=document.getElementById('cmbRange');
  if(nav)nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
  drawCombined();
}
function openCombined(){
  try{history.replaceState({},'','/combined'+location.hash);}catch(e){}
  showPanelView('cmbPage');
  const wrap=document.getElementById('cmbWrap');if(wrap)wrap.classList.add('show');
  if(!CMB_SIGNAL_ON){
    _cmbMode='compare';
    ['cmbModeNav','cmbBandNav','cmbVerdict'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
    const sf=document.getElementById('cmbSignalFoot');if(sf)sf.style.display='none';
    const ft=document.getElementById('cmbFootNote');if(ft)ft.style.display='';
  }
  loadCombined();
  bindCmbPointer();
}
function closeCombined(){
  try{history.replaceState({},'','/console'+location.hash);}catch(e){}
  hidePanelView('cmbPage');
  const wrap=document.getElementById('cmbWrap');if(wrap)wrap.classList.remove('show');
  const setupBtn=document.querySelector('[data-tab="tab-current"]');
  if(setupBtn)setupBtn.click();
}
let _cmbBound=false;
function bindCmbPointer(){
  const cv=document.getElementById('cmbCanvas');
  if(!cv||_cmbBound)return;_cmbBound=true;
  const at=e=>{const r=cv.getBoundingClientRect();const cx=(e.touches?e.touches[0].clientX:e.clientX);_cmbHover=cx-r.left;drawCombined();};
  cv.addEventListener('mousemove',at);
  cv.addEventListener('mouseleave',()=>{_cmbHover=null;drawCombined();});
  cv.addEventListener('touchstart',at,{passive:true});
  cv.addEventListener('touchmove',e=>{at(e);},{passive:true});
  cv.addEventListener('touchend',()=>{_cmbHover=null;drawCombined();});
}
window.addEventListener('resize',()=>{const w=document.getElementById('cmbWrap');if(w&&w.classList.contains('show'))drawCombined();});

// ============================================================
// CHART SCREENSHOT — branded, shareable candlestick snapshot
// The live chart is a cross-origin TradingView iframe and can't be captured, so we
// rebuild our own 1-hour candlestick image from public OHLC data and stamp it with
// GMT-Optimizer + GoMining branding (deliberately NO promo code).
// ============================================================
let _chartShotCanvas=null, _chartShotBlob=null;
// Which snapshot currently sits in the modal — the share sheet, filename and caption
// all key off this ('chart' = candles, 'farm' = the user's live farm stats card).
let _shotKind='chart';
const _csImgCache={};
function _csImg(src){
  if(_csImgCache[src])return _csImgCache[src];
  const p=new Promise(res=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>res(null);im.src=src;});
  _csImgCache[src]=p;return p;
}
// Normalize into ascending [{t(ms),o,h,l,c}] and trim to (about) the last `hours`.
function _csTrim(rows,hours){
  rows=rows.filter(r=>r&&isFinite(r.o)&&isFinite(r.c)&&r.h>0&&r.l>0).sort((a,b)=>a.t-b.t);
  const win=rows.filter(r=>r.t>=Date.now()-hours*3600e3);
  return (win.length>=8?win:rows).slice(-Math.max(24,Math.ceil(hours)));
}
async function fetchBtcCandles(hours){
  // Coinbase Exchange — CORS *, rows are [time(s),low,high,open,close,vol]
  try{
    const r=await fetchTO('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600',12000);
    if(Array.isArray(r)&&r.length>8)
      return {rows:_csTrim(r.map(c=>({t:c[0]*1000,l:+c[1],h:+c[2],o:+c[3],c:+c[4]})),hours),interval:'1H'};
  }catch(e){}
  // Kraken hourly OHLC — [time(s),open,high,low,close,...]
  try{
    const r=await fetchTO('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60',12000);
    const res=r&&r.result,key=res&&Object.keys(res).find(k=>k!=='last');
    if(key&&res[key].length>8)
      return {rows:_csTrim(res[key].map(c=>({t:c[0]*1000,o:+c[1],h:+c[2],l:+c[3],c:+c[4]})),hours),interval:'1H'};
  }catch(e){}
  return null;
}
async function fetchGmtCandles(hours){
  // Bitget — true 1h, CORS *, lists GoMining as GOMININGUSDT.
  // [ts(ms),open,high,low,close,baseVol,quoteVol,usdtVol]
  try{
    const r=await fetchTO('https://api.bitget.com/api/v2/spot/market/candles?symbol=GOMININGUSDT&granularity=1h&limit=200',12000);
    const d=r&&r.data;
    if(Array.isArray(d)&&d.length>8)
      return {rows:_csTrim(d.map(c=>({t:+c[0],o:+c[1],h:+c[2],l:+c[3],c:+c[4]})),hours),interval:'1H'};
  }catch(e){}
  // CoinGecko OHLC (4h buckets for a 7-day window) — CORS-friendly last resort
  try{
    const r=await fetchTO('https://api.coingecko.com/api/v3/coins/gmt-token/ohlc?vs_currency=usd&days=7',12000);
    if(Array.isArray(r)&&r.length>6)
      return {rows:_csTrim(r.map(c=>({t:+c[0],o:+c[1],h:+c[2],l:+c[3],c:+c[4]})),hours),interval:'4H'};
  }catch(e){}
  return null;
}
async function createChartShot(){
  _shotKind='chart';
  const asset=window._chartAsset||{kind:'btc',name:'Bitcoin',pair:'BTC / USD',icon:'/btc36.png'};
  const modal=document.getElementById('chartShotModal');
  const load=document.getElementById('chartShotLoading');
  const img=document.getElementById('chartShotImg');
  const actions=document.getElementById('chartShotActions');
  document.getElementById('chartShotTitle').textContent=asset.name+' — 1H chart snapshot';
  document.getElementById('chartShotLoadTxt').textContent='Pulling the latest 1-hour candles…';
  img.style.display='none';actions.style.display='none';load.style.display='flex';
  modal.style.display='flex';document.body.style.overflow='hidden';
  _chartShotCanvas=null;_chartShotBlob=null;   // clear any prior shot so we never share stale image
  const HOURS=120; // ~5 days of hourly candles
  try{
    const [data,logoOpt,coin,token]=await Promise.all([
      asset.kind==='btc'?fetchBtcCandles(HOURS):fetchGmtCandles(HOURS),
      _csImg('gmt-optimizer-logo.svg?v=2'),
      _csImg(asset.icon),
      _csImg('/gmt36.png')
    ]);
    if(!data||!data.rows||data.rows.length<4)throw new Error('no data');
    _chartShotCanvas=buildChartShotCanvas(asset,data,{logoOpt,coin,token});
    img.src=_chartShotCanvas.toDataURL('image/png');
    _chartShotBlob=await canvasToBlob(_chartShotCanvas);  // cache so Share can fire inside the click gesture
    _shotReady();
  }catch(e){
    document.getElementById('chartShotLoadTxt').textContent='Couldn’t load price data right now — please try again in a moment.';
  }
}
function closeChartShot(){
  document.getElementById('chartShotModal').style.display='none';
  closeChartShare();
  // The chart page underneath used to be a fixed full-screen overlay that needed the body
  // locked. It's an in-flow panel now (.sp-page.sp-view scrolls with the document), so
  // re-locking here stranded the whole site unscrollable until a reload.
  document.body.style.overflow='';
}
// ---- share sheet (YouTube-Music style) ----
const CHART_SHARE_BASE='https://gmt-optimizer.com';
// Everything the share sheet needs for whichever snapshot is on screen: the link it
// points at, the caption, the native-share title and the PNG filename.
function _shotInfo(){
  if(_shotKind==='projection'){
    const d=window._shareData||{};
    const dys=d.days?fN(d.days,0)+'-day':'';
    return{
      url:CHART_SHARE_BASE+'/console',
      title:(dys?dys+' ':'')+'GoMining growth projection',
      text:'Where my GoMining farm lands after '+(dys||'the period')+' of auto-reinvesting rewards. Model yours free at GMT-Optimizer.com',
      file:'gmt-optimizer-projection.png'
    };
  }
  if(_shotKind==='farm')return{
    url:CHART_SHARE_BASE+'/console',
    title:'My GoMining farm — live numbers',
    text:'My GoMining farm right now — daily & monthly earnings, discount and compounding velocity. Model yours free at GMT-Optimizer.com',
    file:'gmt-optimizer-my-farm.png'
  };
  const a=window._chartAsset||{kind:'btc',name:'Bitcoin'};
  return{
    url:CHART_SHARE_BASE+(a.kind==='gmt'?'/gmt':'/bitcoin'),
    title:a.name+' — 1H chart',
    text:'Live '+a.name+' chart — plan your GoMining ROI, discount & earnings free at GMT-Optimizer.com',
    file:'gmt-optimizer-'+(a.kind==='btc'?'bitcoin':'gmt')+'-1h-chart.png'
  };
}
function _csChartUrl(){return _shotInfo().url;}
function _csShareText(){return _shotInfo().text;}
// Build a File from the cached PNG blob (present once the shot is rendered).
function _chartShotFile(){
  if(!_chartShotBlob)return null;
  return new File([_chartShotBlob],_shotInfo().file,{type:'image/png'});
}
// Strict: only true when the browser has confirmed it will carry the file. Drives the sheet's
// labels and hints, which must never promise something that then silently does nothing.
function _canShareImage(){const f=_chartShotFile();return !!(f&&navigator.share&&navigator.canShare&&navigator.canShare({files:[f]}));}
// Loose: worth *trying*. Chrome on iOS exposes navigator.share but no navigator.canShare to ask,
// so gating the attempt on canShare meant we never tried a file share there at all.
function _mightShareImage(){const f=_chartShotFile();return !!(f&&navigator.share);}
// "Share": always open our custom YouTube-style bottom sheet (the user prefers it over the
// browser's native share dialog). The native OS sheet is still reachable from the sheet's
// "Share with other apps" row, which carries the actual PNG where file-sharing is supported.
function openChartShare(){
  if(!_chartShotBlob)return;
  // Where the OS can take the actual PNG (most phones), that's the one-tap route — float it to
  // the top of the sheet and name it plainly. Elsewhere it degrades to a link-only share, so it
  // stays below "Copy image", which is what actually works on a desktop browser.
  const nat=document.getElementById('cshareNativeRow'),ntx=document.getElementById('cshareNativeTxt');
  const withFile=_canShareImage();
  if(nat&&ntx){
    nat.style.order=withFile?'-1':'';
    ntx.textContent=withFile?'Share image to another app'
      :(_IS_IOS?'Press & hold the image to save it':'Copy or save the image');
  }
  const hint=document.getElementById('cshareHint');
  if(hint){
    const msg=withFile?''
      :(_IOS_INAPP?'This in-app browser can\u2019t hand over images. Tap \u22ef and "Open in Safari" for one-tap sharing.'
      :(/CriOS|FxiOS|EdgiOS/.test(_UA)?'Chrome/Firefox on iOS can\u2019t pass images to other apps \u2014 press & hold the image, or open this page in Safari for one-tap sharing.'
      :(_IS_IOS?'This browser can\u2019t hand over images \u2014 open the page in Safari for one-tap sharing.':'')));
    hint.textContent=msg;hint.style.display=msg?'block':'none';
  }
  document.getElementById('chartShareSheet').style.display='flex';
}
function closeChartShare(){const s=document.getElementById('chartShareSheet');if(s)s.style.display='none';}
// iOS can't be treated as one browser. Safari carries files through navigator.share; an in-app
// WebView (a link opened inside Telegram, Instagram, X…) has no Safari/ token in its UA, usually
// refuses file shares, blocks window.open, and ignores <a download> entirely — so every fallback
// we had ended in nothing visibly happening. Long-pressing the preview image always works there.
const _UA=navigator.userAgent||'';
const _IS_IOS=/iP(hone|od|ad)/.test(_UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const _IOS_INAPP=_IS_IOS&&!/Safari\//.test(_UA)&&!/CriOS|FxiOS|EdgiOS/.test(_UA);
// Every snapshot flow finishes here: reveal the image + actions, and where the browser can't
// hand a file to another app, say so under the image — long-press is the route that always works.
function _shotReady(){
  const img=document.getElementById('chartShotImg'),load=document.getElementById('chartShotLoading');
  const act=document.getElementById('chartShotActions'),hint=document.getElementById('chartShotHint');
  if(img)img.style.display='';
  if(load)load.style.display='none';
  if(act)act.style.display='flex';
  if(hint){
    const show=_IS_IOS&&!_canShareImage();
    hint.textContent=show?'Press and hold the image to save or share it — this browser can’t pass the file to other apps, but Safari can.':'';
    hint.style.display=show?'block':'none';
  }
}
let _csToastT=null;
function csToast(msg){
  const el=document.getElementById('chartShareToast');if(!el)return;
  el.textContent=msg;el.classList.add('show');
  clearTimeout(_csToastT);_csToastT=setTimeout(()=>el.classList.remove('show'),2600);
}
// Fallback-sheet app buttons can't attach a file to a web intent, so copy the image to the
// clipboard first and open the app's composer — the user pastes the ready image into the post.
const _CS_NET={telegram:'Telegram',x:'X',whatsapp:'WhatsApp',facebook:'Facebook',reddit:'Reddit'};
async function chartShareTo(net){
  // Phones: a web composer (t.me/share, twitter/intent, …) can only carry a link — tapping
  // "Telegram" here used to post a bare URL with no image at all. Where the OS can hand over
  // the actual PNG, go through the system sheet instead and let them pick the same app there.
  if(_canShareImage()||(_IS_IOS&&_mightShareImage())){
    csToast('Choose '+(_CS_NET[net]||'the app')+' — the image goes with it');
    return chartShareNative();
  }
  const copied=await copyChartShot(true);   // silent copy
  const link=_csChartUrl(),u=encodeURIComponent(link),te=encodeURIComponent(_csShareText());
  const urls={
    telegram:'https://t.me/share/url?url='+u+'&text='+te,
    x:'https://twitter.com/intent/tweet?text='+te+'&url='+u,
    whatsapp:'https://wa.me/?text='+encodeURIComponent(_csShareText()+' '+link),
    facebook:'https://www.facebook.com/sharer/sharer.php?u='+u,
    reddit:'https://www.reddit.com/submit?url='+u+'&title='+te
  };
  // In-app WebViews block window.open outright — navigate instead of doing nothing at all.
  if(urls[net]){
    const w=window.open(urls[net],'_blank','noopener,noreferrer');
    if(!w){location.href=urls[net];return;}
  }
  csToast(copied?'✓ Image copied — paste it into '+(_CS_NET[net]||'the post')
    :'Link only — press & hold the image to add it yourself');
}
// "Share with other apps" row — hand the OS the actual PNG.
async function chartShareNative(){
  const f=_chartShotFile();if(!f)return;
  const info=_shotInfo();
  try{
    if(_mightShareImage()&&(!navigator.canShare||navigator.canShare({files:[f]}))){
      // NO `url:` here. When a share payload carries both files and a url, iOS and most
      // Android targets take the link and silently drop the image — which is exactly how
      // "share the image" turned into "post a link". The link rides along inside `text`.
      await navigator.share({files:[f],title:info.title,text:info.text+' '+info.url});return;
    }
  }catch(e){if(e&&e.name==='AbortError')return;}
  // No file sharing on this browser. Never fall back to sharing a bare link from a button that
  // promised the image — put the PNG somewhere the user can actually attach it.
  if(_IS_IOS)return _imageFallback();
  return copyChartShot();
}
// Last resort when neither native file-share nor the clipboard is available. On iOS a download
// is a no-op, so point the user at the preview image they're already looking at.
function _imageFallback(){
  if(_IS_IOS){
    closeChartShare();
    csToast('Press and hold the image to save or share it');
    return;
  }
  downloadChartShot();csToast('⬇ Image saved — attach it anywhere');
}
async function copyChartShot(silent){
  if(!_chartShotCanvas&&!_chartShotBlob)return;
  try{
    if(navigator.clipboard&&window.ClipboardItem&&window.isSecureContext){
      const blobP=_chartShotBlob?Promise.resolve(_chartShotBlob):canvasToBlob(_chartShotCanvas);
      await navigator.clipboard.write([new ClipboardItem({'image/png':blobP})]);
      if(silent!==true)csToast('✓ Image copied — paste anywhere');return true;
    }
  }catch(e){}
  if(silent!==true)_imageFallback();
  return false;
}
async function downloadChartShot(btn){
  if(!_chartShotCanvas&&!_chartShotBlob)return;
  try{
    const blob=_chartShotBlob||await canvasToBlob(_chartShotCanvas);
    downloadBlob(blob,_shotInfo().file);
    if(btn){const orig=btn.innerHTML;btn.innerHTML='⬇ Saved';setTimeout(()=>{btn.innerHTML=orig;},2000);}
  }catch(e){}
}
function buildChartShotCanvas(asset,data,imgs){
  const rows=data.rows,n=rows.length;
  const SC=2,W=1200,H=675;
  const c=document.createElement('canvas');c.width=W*SC;c.height=H*SC;
  const x=c.getContext('2d');x.scale(SC,SC);
  const GOLD='#F5A623',GSOFT='#F7B84E',UP='#16c784',DN='#ea3943';
  const price=p=>p>=1000?'$'+p.toLocaleString('en-US',{maximumFractionDigits:0})
    :p>=1?'$'+p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    :'$'+p.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
  // background
  const bgG=x.createLinearGradient(0,0,W,H);
  bgG.addColorStop(0,'#0a0a0a');bgG.addColorStop(0.5,'#100c06');bgG.addColorStop(1,'#0a0a0a');
  x.fillStyle=bgG;x.fillRect(0,0,W,H);
  const orb=(cx,cy,r,a)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(245,166,35,'+a+')');g.addColorStop(0.5,'rgba(245,166,35,'+(a*0.4)+')');g.addColorStop(1,'rgba(245,166,35,0)');x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2);};
  orb(150,50,360,0.16);orb(1080,110,300,0.10);orb(600,760,440,0.06);
  // ---- top-left: GMT Optimizer brand, url beneath it ----
  let bx=44;
  if(imgs.logoOpt){x.drawImage(imgs.logoOpt,bx,24,30,30);bx+=38;}
  x.textAlign='left';x.fillStyle='#fff';x.font='800 26px "Space Grotesk",system-ui,sans-serif';
  x.fillText('GMT Optimizer',bx,48);
  x.fillStyle='rgba(247,184,78,0.92)';x.font='700 16px "Share Tech Mono",monospace';
  x.fillText('gmt-optimizer.com',44,74);
  // ---- top-right: asset name (+ coin), pair/interval, price + change ----
  const daysSpan=Math.max(1,Math.round((rows[n-1].t-rows[0].t)/86400e3));
  x.textAlign='right';x.fillStyle='#fff';x.font='800 26px "Space Grotesk",system-ui,sans-serif';
  x.fillText(asset.name,W-44,46);
  const nameW=x.measureText(asset.name).width;
  if(imgs.coin){const cxb=W-44-nameW-22,cyb=37;x.save();x.beginPath();x.arc(cxb,cyb,15,0,7);x.closePath();x.clip();x.drawImage(imgs.coin,cxb-15,cyb-15,30,30);x.restore();}
  x.fillStyle='rgba(255,255,255,0.45)';x.font='700 14px "Share Tech Mono",monospace';
  x.fillText(asset.pair+'   ·   '+data.interval+' candles   ·   last '+daysSpan+' days',W-44,70);
  const first=rows[0].o||rows[0].c,last=rows[n-1].c,chg=first?(last-first)/first*100:0,pos=chg>=0;
  x.fillStyle='#fff';x.font='800 24px "Share Tech Mono",monospace';
  const pStr=price(last);x.fillText(pStr,W-44,100);
  const pW=x.measureText(pStr).width;
  x.fillStyle=pos?UP:DN;x.font='700 16px "Share Tech Mono",monospace';
  x.fillText((pos?'▲ +':'▼ ')+chg.toFixed(2)+'% ('+daysSpan+'d)',W-44-pW-16,100);
  // divider
  const lg=x.createLinearGradient(44,0,W-44,0);
  lg.addColorStop(0,'transparent');lg.addColorStop(0.5,'rgba(245,166,35,0.55)');lg.addColorStop(1,'transparent');
  x.strokeStyle=lg;x.lineWidth=2;x.beginPath();x.moveTo(44,120);x.lineTo(W-44,120);x.stroke();
  // ---- plot area ----
  const PL=60,PR=W-96,PT=150,PB=596;
  let lo=Infinity,hi=-Infinity;rows.forEach(r=>{if(r.l<lo)lo=r.l;if(r.h>hi)hi=r.h;});
  const padv=(hi-lo)*0.08||hi*0.02;lo-=padv;hi+=padv;
  const py=p=>PB-(p-lo)/((hi-lo)||1)*(PB-PT);
  // horizontal price grid + right-axis labels
  x.font='13px "Share Tech Mono",monospace';x.textAlign='left';
  for(let k=0;k<=4;k++){
    const p=lo+(hi-lo)*k/4,gy=py(p);
    x.strokeStyle='rgba(245,166,35,0.08)';x.lineWidth=1;x.beginPath();x.moveTo(PL,gy);x.lineTo(PR,gy);x.stroke();
    x.fillStyle='rgba(255,255,255,0.42)';x.fillText(price(p),PR+8,gy+4);
  }
  // vertical day gridlines + date labels
  const slot=(PR-PL)/n;
  let lastDay=null;
  x.textAlign='center';
  rows.forEach((r,i)=>{
    const d=new Date(r.t),day=d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate();
    if(day!==lastDay){lastDay=day;const gx=PL+i*slot;
      x.strokeStyle='rgba(255,255,255,0.06)';x.lineWidth=1;x.beginPath();x.moveTo(gx,PT);x.lineTo(gx,PB);x.stroke();
      x.fillStyle='rgba(255,255,255,0.42)';x.font='13px "Share Tech Mono",monospace';
      x.fillText(d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),gx+slot*2.2,PB+22);
    }
  });
  // candles
  const bw=Math.max(1.5,Math.min(15,slot*0.62));
  rows.forEach((r,i)=>{
    const cx=PL+(i+0.5)*slot,up=r.c>=r.o,col=up?UP:DN;
    x.strokeStyle=col;x.fillStyle=col;x.lineWidth=Math.max(1,slot*0.12);
    x.beginPath();x.moveTo(cx,py(r.h));x.lineTo(cx,py(r.l));x.stroke();
    const yo=py(r.o),yc=py(r.c),top=Math.min(yo,yc),bh=Math.max(1.5,Math.abs(yc-yo));
    x.fillRect(cx-bw/2,top,bw,bh);
  });
  // 50 EMA — same study that's pinned on the live chart, so the screenshot matches it.
  // Seeded with the SMA of the first 50 closes and only drawn once that window is full.
  const EMA_N=50;
  if(n>EMA_N){
    const k=2/(EMA_N+1);
    let e=0;for(let i=0;i<EMA_N;i++)e+=rows[i].c;e/=EMA_N;
    x.strokeStyle=GSOFT;x.lineWidth=2.4;x.lineJoin='round';x.beginPath();
    x.moveTo(PL+(EMA_N-0.5)*slot,py(e));
    for(let i=EMA_N;i<n;i++){e=rows[i].c*k+e*(1-k);x.lineTo(PL+(i+0.5)*slot,py(e));}
    x.stroke();
    x.fillStyle=GSOFT;x.font='bold 14px "Share Tech Mono",monospace';x.textAlign='left';
    x.fillText('EMA 50',PL+8,PT+20);
  }
  // plot border
  x.strokeStyle='rgba(245,166,35,0.14)';x.lineWidth=1;x.strokeRect(PL,PT,PR-PL,PB-PT);
  // ---- footer / marketing ----
  const footY=H-26;
  const fg=x.createLinearGradient(44,0,W-44,0);
  fg.addColorStop(0,'transparent');fg.addColorStop(0.5,'rgba(245,166,35,0.4)');fg.addColorStop(1,'transparent');
  x.strokeStyle=fg;x.lineWidth=1.2;x.beginPath();x.moveTo(44,footY-30);x.lineTo(W-44,footY-30);x.stroke();
  let fx=44;
  if(imgs.token){x.save();x.beginPath();x.arc(fx+11,footY-7,11,0,7);x.closePath();x.clip();x.drawImage(imgs.token,fx,footY-18,22,22);x.restore();fx+=30;}
  x.textAlign='left';x.fillStyle='rgba(255,255,255,0.75)';x.font='700 17px "Space Grotesk",system-ui,sans-serif';
  x.fillText('Free GoMining ROI & discount optimizer',fx,footY-2);
  x.textAlign='right';x.fillStyle='rgba(255,255,255,0.4)';x.font='14px "Share Tech Mono",monospace';
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  x.fillText(now+'   ·   not financial advice',W-44,footY-2);
  x.textAlign='left';
  return c;
}

// ============================================================
// FARM SCREENSHOT — branded, shareable card of the live hero stats
// Same modal + share sheet as the chart snapshot, but the picture is the four
// headline numbers on My Setup (daily, monthly, discount, velocity) plus the
// setup they come from. Numbers are read from window._farmShot, stashed by recalc().
// ============================================================
// Shrink a font until the string fits maxW; returns the size actually used.
function _fsFit(x,text,maxW,weight,size,family){
  let sz=size;
  for(;sz>10;sz--){x.font=weight+' '+sz+'px '+family;if(x.measureText(text).width<=maxW)break;}
  return sz;
}
// Greedy word wrap, capped at `max` lines (last line gets an ellipsis if it overflows).
function _fsWrap(x,text,maxW,max){
  const words=String(text||'').split(/\s+/).filter(Boolean),lines=[];
  let cur='';
  for(const w of words){
    const t=cur?cur+' '+w:w;
    if(!cur||x.measureText(t).width<=maxW)cur=t;
    else{lines.push(cur);cur=w;if(lines.length===max)break;}
  }
  if(lines.length<max&&cur)lines.push(cur);
  if(lines.length===max){
    let last=lines[max-1];
    const more=words.join(' ').length>lines.join(' ').length;
    if(more){while(last.length>1&&x.measureText(last+'…').width>maxW)last=last.slice(0,-1);lines[max-1]=last+'…';}
  }
  return lines;
}
async function createFarmShot(){
  const d=window._farmShot;
  const modal=document.getElementById('chartShotModal');
  if(!modal)return;
  _shotKind='farm';
  const load=document.getElementById('chartShotLoading');
  const img=document.getElementById('chartShotImg');
  const actions=document.getElementById('chartShotActions');
  document.getElementById('chartShotTitle').textContent='Your farm — live snapshot';
  document.getElementById('chartShotLoadTxt').textContent='Rendering your farm card…';
  img.style.display='none';actions.style.display='none';load.style.display='flex';
  modal.style.display='flex';document.body.style.overflow='hidden';
  _chartShotCanvas=null;_chartShotBlob=null;   // never share a stale image
  try{
    if(!d)throw new Error('no data');
    const [logoOpt,token,coin]=await Promise.all([
      _csImg('/gmt-optimizer-logo.svg?v=2'),_csImg('/gmt36.png'),_csImg('/btc36.png')
    ]);
    _chartShotCanvas=buildFarmShotCanvas(d,{logoOpt,token,coin});
    img.src=_chartShotCanvas.toDataURL('image/png');
    _chartShotBlob=await canvasToBlob(_chartShotCanvas);  // cached so Share fires inside the click gesture
    _shotReady();
  }catch(e){
    document.getElementById('chartShotLoadTxt').textContent='Enter your setup first — there are no numbers to snapshot yet.';
  }
}
function buildFarmShotCanvas(d,imgs){
  const SC=2,W=1200,H=675;
  const c=document.createElement('canvas');c.width=W*SC;c.height=H*SC;
  const x=c.getContext('2d');x.scale(SC,SC);
  const MONO='"Share Tech Mono",monospace',SANS='"Space Grotesk",system-ui,sans-serif';
  const GOLD='#F5A623',GSOFT='#F7B84E',GLT='#FFCF7A',GPALE='#FFE0A8',RED='#FF4D4D';
  // background — the site's gold-on-black
  const bgG=x.createLinearGradient(0,0,W,H);
  bgG.addColorStop(0,'#0a0a0a');bgG.addColorStop(0.5,'#100c06');bgG.addColorStop(1,'#0a0a0a');
  x.fillStyle=bgG;x.fillRect(0,0,W,H);
  const orb=(cx,cy,r,a)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(245,166,35,'+a+')');g.addColorStop(0.5,'rgba(245,166,35,'+(a*0.4)+')');g.addColorStop(1,'rgba(245,166,35,0)');x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2);};
  orb(150,60,380,0.17);orb(1070,150,320,0.11);orb(600,780,420,0.07);
  x.strokeStyle='rgba(245,166,35,0.04)';x.lineWidth=0.5;
  for(let gy=0;gy<H;gy+=50){x.beginPath();x.moveTo(0,gy);x.lineTo(W,gy);x.stroke();}
  for(let gx=0;gx<W;gx+=50){x.beginPath();x.moveTo(gx,0);x.lineTo(gx,H);x.stroke();}
  const pad=44;
  // ---- header: brand left, VIP tier right ----
  let bx=pad;
  if(imgs.logoOpt){x.drawImage(imgs.logoOpt,bx,24,30,30);bx+=38;}
  x.textAlign='left';x.fillStyle='#fff';x.font='800 26px '+SANS;
  x.fillText('GMT Optimizer',bx,48);
  x.fillStyle='rgba(247,184,78,0.92)';x.font='700 16px '+MONO;
  x.fillText('gmt-optimizer.com',pad,74);
  x.textAlign='right';x.fillStyle='#fff';x.font='800 26px '+SANS;
  x.fillText('My GoMining Farm',W-pad,46);
  x.fillStyle='rgba(255,255,255,0.45)';x.font='700 14px '+MONO;
  x.fillText('VIP '+(d.vip||'—')+'   ·   '+fN(d.th,1)+' TH   ·   live snapshot',W-pad,70);
  const lg=x.createLinearGradient(pad,0,W-pad,0);
  lg.addColorStop(0,'transparent');lg.addColorStop(0.5,'rgba(245,166,35,0.55)');lg.addColorStop(1,'transparent');
  x.strokeStyle=lg;x.lineWidth=2;x.beginPath();x.moveTo(pad,100);x.lineTo(W-pad,100);x.stroke();
  // ---- the four headline stats ----
  const neg=d.dailyUSD<0;
  const cards=[
    {id:'DAILY.NET',  label:'Daily Net Profit',      val:fU(d.dailyUSD),          accent:neg?RED:GLT,  sub:d.dailySub},
    {id:'MONTH.YIELD',label:'Monthly Earnings',      val:fU(d.monthlyUSD,0),      accent:GSOFT,        sub:fU(d.yearlyUSD,0)+' / yr'},
    {id:'COVERAGE',   label:'Total Discount',        val:fP(d.disc),              accent:GOLD,         sub:'Saving '+fU(d.saveMoUSD)+'/mo on fees'},
    {id:'VELOCITY',   label:'Compounding Velocity',  val:fN(d.velocity,0)+'%/yr', accent:GPALE,        sub:d.velSub}
  ];
  const gap=18,cardW=(W-pad*2-gap*3)/4,cardY=132,cardH=248;
  cards.forEach((cd,i)=>{
    const cx=pad+i*(cardW+gap);
    const cbg=x.createLinearGradient(cx,cardY,cx,cardY+cardH);
    cbg.addColorStop(0,'rgba(245,166,35,0.07)');cbg.addColorStop(1,'rgba(245,166,35,0.015)');
    x.fillStyle=cbg;x.beginPath();x.roundRect(cx,cardY,cardW,cardH,16);x.fill();
    x.strokeStyle='rgba(245,166,35,0.2)';x.lineWidth=1.4;x.beginPath();x.roundRect(cx,cardY,cardW,cardH,16);x.stroke();
    // accent bar along the top edge, like the hero cards on the site
    x.shadowColor=cd.accent;x.shadowBlur=14;x.strokeStyle=cd.accent;x.lineWidth=3;
    x.beginPath();x.moveTo(cx+16,cardY);x.lineTo(cx+cardW-16,cardY);x.stroke();x.shadowBlur=0;
    const ix=cx+22,iw=cardW-44;
    x.textAlign='left';
    x.fillStyle='rgba(255,255,255,0.32)';x.font='700 12px '+MONO;
    x.fillText(cd.id,ix,cardY+38);
    x.fillStyle='rgba(255,255,255,0.62)';
    const lsz=_fsFit(x,cd.label,iw,'700',17,SANS);x.font='700 '+lsz+'px '+SANS;
    x.fillText(cd.label,ix,cardY+66);
    const vsz=_fsFit(x,cd.val,iw,'bold',40,MONO);
    x.font='bold '+vsz+'px '+MONO;x.fillStyle=cd.accent;
    x.shadowColor='rgba(245,166,35,0.45)';x.shadowBlur=18;
    x.fillText(cd.val,ix,cardY+126);x.shadowBlur=0;
    x.fillStyle='rgba(255,255,255,0.5)';x.font='13px '+MONO;
    _fsWrap(x,cd.sub,iw,4).forEach((ln,k)=>x.fillText(ln,ix,cardY+164+k*20));
  });
  // ---- supporting pills ----
  const pills=[
    {label:'HASHRATE',   val:fN(d.th,1)+' TH'},
    {label:'EFFICIENCY', val:fN(d.wth,1)+' W/TH'},
    {label:'GMT LOCKED', val:fN(d.gmtLocked,0)},
    {label:'GMT VALUE',  val:fU(d.gmtValueUSD,0)},
    {label:'VIP TIER',   val:d.vip||'—'},
    {label:'BTC',        val:fmtBTCPrice(d.btc)}
  ];
  const pillY=cardY+cardH+26,pillH=68,pillPad=18,pillGap=12;
  const pw=pills.map(p=>{x.font='bold 14px '+MONO;const lw=x.measureText(p.label).width;x.font='bold 22px '+MONO;const vw=x.measureText(p.val).width;return Math.max(lw,vw)+pillPad*2;});
  const totalW=pw.reduce((a,b)=>a+b,0)+pillGap*(pills.length-1);
  let px=(W-totalW)/2;
  pills.forEach((p,i)=>{const w=pw[i];
    x.fillStyle='rgba(245,166,35,0.06)';x.beginPath();x.roundRect(px,pillY,w,pillH,12);x.fill();
    x.strokeStyle='rgba(245,166,35,0.22)';x.lineWidth=1;x.beginPath();x.roundRect(px,pillY,w,pillH,12);x.stroke();
    x.textAlign='center';
    x.fillStyle='rgba(255,255,255,0.55)';x.font='bold 14px '+MONO;x.fillText(p.label,px+w/2,pillY+26);
    x.fillStyle=GSOFT;x.font='bold 22px '+MONO;x.fillText(p.val,px+w/2,pillY+55);
    px+=w+pillGap;
  });
  // ---- strapline ----
  x.textAlign='center';x.fillStyle='rgba(255,255,255,0.6)';x.font='700 18px '+SANS;
  x.fillText('Free GoMining ROI, discount & compounding optimizer',W/2,pillY+pillH+46);
  // ---- footer ----
  const footY=H-34;
  const fg=x.createLinearGradient(pad,0,W-pad,0);
  fg.addColorStop(0,'transparent');fg.addColorStop(0.5,'rgba(245,166,35,0.4)');fg.addColorStop(1,'transparent');
  x.strokeStyle=fg;x.lineWidth=1.2;x.beginPath();x.moveTo(pad,footY-24);x.lineTo(W-pad,footY-24);x.stroke();
  let fx=pad;
  if(imgs.token){x.save();x.beginPath();x.arc(fx+11,footY-8,11,0,7);x.closePath();x.clip();x.drawImage(imgs.token,fx,footY-19,22,22);x.restore();fx+=30;}
  x.textAlign='left';x.fillStyle='rgba(255,255,255,0.72)';x.font='700 19px '+SANS;
  x.fillText('gmt-optimizer.com',fx,footY-1);
  x.textAlign='center';x.fillStyle='rgba(255,255,255,0.4)';x.font='14px '+MONO;
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  x.fillText(now+'   ·   not financial advice',W/2,footY-1);
  x.textAlign='right';x.fillStyle=GSOFT;x.font='bold 17px '+MONO;
  x.fillText('use code RINGO5',W-pad,footY-1);
  x.textAlign='left';
  return c;
}

// Share the current plan as a link that re-creates the same view for the recipient. The setup
// (readInputs) is packed into a ?p=<base64 JSON> URL. Uses the native share sheet (email / message
// / etc.) on supporting devices, else copies the link to the clipboard.
// Compact share encoding: a fixed-order, '~'-delimited value string (all chars URL-safe, no
// base64/JSON keys) — ~3x shorter than the old base64-JSON links. Trailing defaults are trimmed.
const SHARE_FIELDS=[
  ['inTH'],['inWTH'],['inGMTLocked'],['inGMTWallet'],['inCapital'],
  ['inMpTH'],['inMpGMT'],['inMpWth'],['inGreedyTH'],['inGreedyInitial'],['inGreedyGrowth'],
  ['inClickStreak','b'],['inPayGMT','b'],['inAmbassador','b'],['inAvatarDisc','b'],
  ['inReferredTH'],['inRefCapital'],['inCurrency'],['piVipBonus','b'],['inGreedyWth'],['inMpGreedy','b'],['inMpCode']
];
// Compact v2 share encoding (?s2=). Shorter than v1 (?s=) because:
//  • the rarely-filled marketplace/greedy/referral fields sit at the TAIL, so they're
//    trimmed entirely when empty (the common case);
//  • all four toggles collapse into ONE base-36 digit;
//  • currency is a single char, and the default (USD) is omitted.
// A basic setup goes from ~18 tilde-segments down to ~6.
const SHARE_CUR={USD:'',GBP:'G',EUR:'E'};
function encodeShareV2(d){
  const v=x=>(x==null||x==='')?'':String(x);
  const flags=(d.inClickStreak?1:0)|(d.inPayGMT?2:0)|(d.inAmbassador?4:0)|(d.piVipBonus?8:0)|(d.inAvatarDisc?16:0)|(d.inMpGreedy?32:0);
  const parts=[
    v(d.inTH),v(d.inWTH),v(d.inGMTLocked),v(d.inGMTWallet),v(d.inCapital),
    flags?flags.toString(36):'', SHARE_CUR[d.inCurrency]||'',
    v(d.inMpTH),v(d.inMpGMT),v(d.inMpWth),
    v(d.inGreedyTH),v(d.inGreedyInitial),v(d.inGreedyGrowth),
    v(d.inReferredTH),v(d.inRefCapital),
    v(d.inGreedyWth),         // appended at the tail so pre-existing ?s2= links stay valid
    encodeURIComponent(v(d.inMpCode).replace(/~/g,''))
  ];
  while(parts.length&&parts[parts.length-1]==='')parts.pop();
  return parts.join('~');
}
function decodeShareV2(s){
  const p=s.split('~'),g=i=>(p[i]!==undefined&&p[i]!=='')?p[i]:undefined,d={};
  const set=(k,i)=>{const x=g(i);if(x!==undefined)d[k]=x;};
  set('inTH',0);set('inWTH',1);set('inGMTLocked',2);set('inGMTWallet',3);set('inCapital',4);
  const flags=g(5)?(parseInt(g(5),36)||0):0;
  d.inClickStreak=!!(flags&1);d.inPayGMT=!!(flags&2);d.inAmbassador=!!(flags&4);d.piVipBonus=!!(flags&8);d.inAvatarDisc=!!(flags&16);d.inMpGreedy=!!(flags&32);
  const cur=g(6);d.inCurrency=cur==='G'?'GBP':cur==='E'?'EUR':'USD';
  set('inMpTH',7);set('inMpGMT',8);set('inMpWth',9);
  set('inGreedyTH',10);set('inGreedyInitial',11);set('inGreedyGrowth',12);
  set('inReferredTH',13);set('inRefCapital',14);
  set('inGreedyWth',15);
  {const c=g(16);if(c!==undefined){try{d.inMpCode=decodeURIComponent(c);}catch(e){d.inMpCode=c;}}}
  return d;
}
// Copy text without the ugly prompt: clipboard API on https, else a silent textarea+execCommand
// fallback (works on http / insecure contexts, e.g. mobile). Returns a Promise.
function copyText(text){
  if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext){
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve,reject)=>{
    try{
      const ta=document.createElement('textarea');
      ta.value=text;ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus();ta.select();ta.setSelectionRange(0,text.length);
      const ok=document.execCommand('copy');
      document.body.removeChild(ta);
      ok?resolve():reject(new Error('execCommand failed'));
    }catch(e){reject(e);}
  });
}
function sharePlan(btn){
  const d=readInputs();
  const url='https://'+location.host+location.pathname+'?s2='+encodeShareV2(d);   // always share the https link
  const done=()=>{if(btn){const t=btn.getAttribute('data-lbl')||btn.innerHTML;btn.setAttribute('data-lbl',t);btn.innerHTML='✓ Link copied!';setTimeout(()=>btn.innerHTML=t,1800);}};
  copyText(url).then(done).catch(()=>prompt('Copy this link:',url));
}
// Load a shared plan from a link (compact ?s= , or legacy base64-JSON ?p=), overriding the local
// inputs (view-only — not saved to the visitor's profile). Returns true if a link was applied.
function applySharedPlan(){
  try{
    const sp=new URLSearchParams(location.search);
    let data=null;
    const s2=sp.get('s2');
    if(s2!=null){
      data=decodeShareV2(s2);
    }else{
      const s=sp.get('s');   // legacy v1 compact links
      if(s!=null){
        const parts=s.split('~');data={};
        SHARE_FIELDS.forEach(([k,t],i)=>{const v=parts[i];if(v===undefined||v==='')return;data[k]=t==='b'?(v==='1'||v==='true'):v;});
      }else{
        const raw=sp.get('p');   // legacy full-JSON links
        if(raw)data=JSON.parse(decodeURIComponent(escape(atob(raw))));
      }
    }
    if(data&&typeof data==='object'&&Object.keys(data).length){
      applyInputs(data);
      applyDiscountOverrideFor(null);   // a shared setup is auto-calc; don't inherit the viewer's override
      history.replaceState({},'',location.pathname);   // clean URL so the tool behaves normally afterward
      return true;
    }
  }catch(e){}
  return false;
}

// ---- Projection share image (client-side, copied to clipboard) ----
function downloadBlob(blob,name){
  const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name||'gmt-optimizer-projection.png';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
}
function canvasToBlob(c){return new Promise(res=>c.toBlob(res,'image/png'));}
// Render the projection card and hand it to the shared snapshot modal — preview, then the
// YouTube-style share sheet (native OS share with the PNG attached on mobile, copy-image or a
// one-tap app composer on desktop). Downloading a file the user then has to find and attach is
// the last resort, not the default.
async function shareProjectionImage(btn){
  const d=window._shareData;if(!d)return;
  const modal=document.getElementById('chartShotModal');
  if(!modal){return copyProjectionImageFallback(d);}
  _shotKind='projection';
  const load=document.getElementById('chartShotLoading');
  const img=document.getElementById('chartShotImg');
  const actions=document.getElementById('chartShotActions');
  document.getElementById('chartShotTitle').textContent='Your projection — shareable card';
  document.getElementById('chartShotLoadTxt').textContent='Rendering your projection card…';
  img.style.display='none';actions.style.display='none';load.style.display='flex';
  modal.style.display='flex';document.body.style.overflow='hidden';
  _chartShotCanvas=null;_chartShotBlob=null;   // never share a stale image
  try{
    _chartShotCanvas=buildShareCanvas(d);
    img.src=_chartShotCanvas.toDataURL('image/png');
    _chartShotBlob=await canvasToBlob(_chartShotCanvas);  // cached so Share fires inside the click gesture
    _shotReady();
  }catch(e){
    document.getElementById('chartShotLoadTxt').textContent='Couldn’t build the image — please run the projection again.';
  }
}
// Only reachable if the snapshot modal isn't on the page (e.g. an embed) — save the PNG.
async function copyProjectionImageFallback(d){
  try{downloadBlob(await canvasToBlob(buildShareCanvas(d)),'gmt-optimizer-projection.png');}catch(e){}
}

// ---- API ----
// fetch with hard timeout — default fetch() can hang for ages on slow/dead endpoints
function fetchTO(url,ms=8000){
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{signal:ctrl.signal}).then(r=>{clearTimeout(id);if(!r.ok)throw new Error('http '+r.status);return r.json()}).catch(e=>{clearTimeout(id);throw e});
}
// Persist last-good market data so a transient API outage doesn't drop the user back to year-old static fallbacks.
const PRICE_CACHE_KEY='gm_price_cache_v1';
function loadPriceCache(){
  try{const raw=localStorage.getItem(PRICE_CACHE_KEY);if(!raw)return null;
    const c=JSON.parse(raw);if(c&&c.btc>0&&c.gmt>0&&c.t)return c;
  }catch(e){}
  return null;
}
function savePriceCache(){
  // Only persist truly-live values from this run; otherwise we'd rewrite the cache with FB/cached numbers.
  if(!(S.priceLiveBTC>0&&S.priceLiveGMT>0))return;
  try{
    const prev=loadPriceCache()||{};
    localStorage.setItem(PRICE_CACHE_KEY,JSON.stringify({
      btc:S.priceLiveBTC,gmt:S.priceLiveGMT,
      gbp:S.gbpRate||prev.gbp||0.79,
      eur:S.eurRate||prev.eur||0.92,
      diff:S.difficulty||prev.diff,
      hr:S.netHashrate||prev.hr,
      fees:S.avgTxFees||prev.fees,
      t:Date.now()
    }));
  }catch(e){}
}
async function fetchBTCPrice(){
  try{const r=await fetchTO('https://api.coinpaprika.com/v1/tickers/btc-bitcoin');const p=+r?.quotes?.USD?.price;if(p>0)return p;}catch(e){}
  try{const r=await fetchTO('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');const p=+r?.bitcoin?.usd;if(p>0)return p;}catch(e){}
  try{const r=await fetchTO('https://mempool.space/api/v1/prices');const p=+r?.USD;if(p>0)return p;}catch(e){}
  return 0;
}
async function fetchGMTPrice(){
  try{const r=await fetchTO('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token');const p=+r?.quotes?.USD?.price;if(p>0)return p;}catch(e){}
  // CoinGecko's ID for GoMining (symbol GOMINING) is 'gmt-token', NOT 'gomining-token'.
  try{const r=await fetchTO('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd');const p=+r?.['gmt-token']?.usd;if(p>0)return p;}catch(e){}
  return 0;
}

async function fetchData(){
  let ok=true;
  const cached=loadPriceCache();

  // ---- PRICES (BTC + GMT) — multi-source with cache fallback ----
  const[btcLive,gmtLive]=await Promise.all([fetchBTCPrice(),fetchGMTPrice()]);
  if(btcLive>0)S.btcPrice=btcLive;
  else if(cached&&cached.btc>0){S.btcPrice=cached.btc;ok=false;}
  else{S.btcPrice=FB.btcPrice;ok=false;}
  if(gmtLive>0)S.gmtPrice=gmtLive;
  else if(cached&&cached.gmt>0){S.gmtPrice=cached.gmt;ok=false;}
  else{S.gmtPrice=FB.gmtPrice;ok=false;}
  S.priceStale=!(btcLive>0&&gmtLive>0);
  S.priceCachedAt=(S.priceStale&&cached)?cached.t:0;
  // Only the live values from this run are eligible to overwrite the cache;
  // never write FB or previously-cached values back, or we lock in stale prices.
  S.priceLiveBTC=btcLive;S.priceLiveGMT=gmtLive;

  // ---- MEMPOOL (difficulty + tx fees) ----
  try{
    const[h,f]=await Promise.all([
      fetchTO('https://mempool.space/api/v1/mining/hashrate/3d'),
      fetchTO('https://mempool.space/api/v1/mining/reward-stats/144')
    ]);
    S.difficulty=h.currentDifficulty||(cached&&cached.diff)||FB.difficulty;
    S.netHashrate=h.currentHashrate||(cached&&cached.hr)||0;
    S.avgTxFees=(parseFloat(f.totalFee||0)/144)/1e8;
    if(!S.avgTxFees)S.avgTxFees=(cached&&cached.fees)||FB.avgTxFees;
  }catch(e){
    S.difficulty=(cached&&cached.diff)||FB.difficulty;
    S.netHashrate=(cached&&cached.hr)||0;
    S.avgTxFees=(cached&&cached.fees)||FB.avgTxFees;
    ok=false;
  }
  // sats/TH/day from on-chain difficulty (the 2-week smoothed network measure —
  // less noisy than the 3-day hashrate sample). This is the true current network
  // issuance per TH. NOTE: a difficulty retarget moves this ~instantly while the
  // GoMining app can lag a day or two, so they can briefly diverge.
  S.satsPerTHDay=((1e12*86400*BLOCK_SUBSIDY)/(S.difficulty*2**32))*1e8;

  // ---- FX (GBP, EUR) ----
  try{
    const fx=await fetchTO('https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP,EUR');
    S.gbpRate=fx.rates?.GBP||(cached&&cached.gbp)||0.79;
    S.eurRate=fx.rates?.EUR||(cached&&cached.eur)||0.92;
  }catch(e){
    S.gbpRate=(cached&&cached.gbp)||0.79;
    S.eurRate=(cached&&cached.eur)||0.92;
  }
  if(S.currency==='GBP')S.fxRate=S.gbpRate;
  else if(S.currency==='EUR')S.fxRate=S.eurRate;

  S.apiOk=ok;
  savePriceCache();
  if(!S.setupLoaded){S.setupLoaded=true;loadSetup();}
  S.loaded=true;
  const sharedPlan=!S.sharedApplied&&applySharedPlan();
  if(sharedPlan)S.sharedApplied=true;
  updateHeader();recalc();
  if(sharedPlan){
    // Land the recipient on the Capital Planner results (already populated by recalc).
    window._plannerCalcDone=true;
    const pBtn=document.querySelector('[data-tab="tab-planner"]');if(pBtn)pBtn.click();
  }
  if(!S.chartDeepLinkChecked){S.chartDeepLinkChecked=true;if(!sharedPlan)maybeOpenChartFromURL();}
}

function updateHeader(){
  const$=id=>document.getElementById(id);
  $('btcVal').textContent=S.btcPrice?fU(S.btcPrice,0):'--';
  $('gmtVal').textContent=S.gmtPrice?fU(S.gmtPrice,4):'--';
  $('satsVal').textContent=S.satsPerTHDay?Math.round(S.satsPerTHDay):'--';
  const bar=$('liveBar');
  if(S.apiOk){bar.classList.remove('api-err');bar.removeAttribute('title');}
  else{
    bar.classList.add('api-err');
    if(S.priceStale&&S.priceCachedAt){
      const mins=Math.round((Date.now()-S.priceCachedAt)/60000);
      const ago=mins<60?mins+' min':mins<1440?Math.round(mins/60)+'h':Math.round(mins/1440)+'d';
      bar.title='Live API unreachable — showing cached prices from '+ago+' ago';
    }else{
      bar.title='Live API unreachable';
    }
  }
}

// ---- INPUTS ----
function inp(){
  // The entered Total Hashrate is the WHOLE farm (incl. greedy), and Energy
  // Efficiency is its weighted average. So the greedy machine is a SUBSET, not
  // added on top: standalone = total - greedy, and greedy shares the same
  // weighted-avg efficiency (don't re-blend it).
  const rawTH=+$('inTH').value||0;
  const wth=+$('inWTH').value||0;
  const gth=+($('inGreedyTH')?$('inGreedyTH').value:0)||0;
  return{
  th:Math.max(0,rawTH-gth), wth:wth,
  gl:+$('inGMTLocked').value||0, gw:+$('inGMTWallet').value||0,
  apr:+$('inLockAPR').value||0,
  click:$('inClickStreak').checked, payG:$('inPayGMT').checked,
  mm:+$('inMiningMode').value||0, od:0, cpt:+$('inCostPerTH').value||0,
  // Hashrate switched off in the fleet — excluded from rawTH above, so nothing
  // downstream mistakes it for earning power. calc() adds it back into the fee
  // and VIP basis only.
  offTH:+($('inInactiveTH')?$('inInactiveTH').value:0)||0,
  offWth:+($('inInactiveWth')?$('inInactiveWth').value:0)||0,
  cap:+$('inCapital').value||0,
  mpTH:+($('inMpTH')?$('inMpTH').value:0)||0,
  mpGMT:+($('inMpGMT')?$('inMpGMT').value:0)||0,
  mpWth:+($('inMpWth')?$('inMpWth').value:0)||0,
  // "This is a Greedy Machine" on the marketplace-miner block. Only the planner acts on it —
  // the miner isn't owned yet, so it must never reach calc()'s current-farm numbers.
  mpGreedy:!!($('inMpGreedy')&&$('inMpGreedy').checked),
  mpCode:(($('inMpCode')&&$('inMpCode').value)||'').trim(),
  gth:gth,
  gInit:+($('inGreedyInitial')?$('inGreedyInitial').value:0)||0,
  // The Greedy Machine is a separate miner with its own W/TH rating. Blank/0 ⇒ reuse the main
  // farm's efficiency (keeps every setup saved before this field existed behaving as it did).
  gwth:(+($('inGreedyWth')?$('inGreedyWth').value:0)||0)||wth,
  ggrow:+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0,
  amb:$('inAmbassador').checked, refTH:+$('inReferredTH').value||0,
  refCap:+$('inRefCapital').value||0,
  // Ambassador commission on a referral's TH spend, paid to you in GMT. Tiered (5%→~14%+),
  // so it's user-editable; default 5%.
  refBonusPct:(+($('inRefBonusPct')?$('inRefBonusPct').value:0)||0)||5,
  // Opt-in: % of their own rewards the referral reinvests. 0 (default) = don't model their growth.
  refReinvest:+($('inRefReinvest')?$('inRefReinvest').value:0)||0
}}
function $(id){return document.getElementById(id)}

const SETUP_KEY='gm_saved_setup';        // legacy single-slot, kept only for one-shot migration
const PROFILES_KEY='gm_profiles_v1';     // {profiles:[{id,name,data}], activeId}
// Mining mode is a DAO-governance rate that applies across every saved setup,
// so it persists in its own localStorage key — not bundled with per-setup data.
const MINING_MODE_KEY='gmtopt_mining_mode_v1';
// Manual total-discount override (global, like mining mode): the value the user
// reads in their GoMining app, used when the coverage-based estimate is off.
const DISCOUNT_OVERRIDE_KEY='gmtopt_discount_override_v1';
// Keep this in sync with the HTML default on the inMiningMode input. When the DAO
// bumps the rate, update both and saved values that were tracking the old default
// will auto-pick up the new one on next load.
const MINING_MODE_DEFAULT=1.06;
// Every rate this input has ever shipped with. `base` was written from
// MINING_MODE_DEFAULT even in builds where that had drifted from the HTML default, so a
// saved value matching any past rate is a stale default, not a user's own number.
const MINING_MODE_PAST_DEFAULTS=[0.7,0.83,0.88];
function saveMiningMode(){
  try{localStorage.setItem(MINING_MODE_KEY,JSON.stringify({v:$('inMiningMode').value,base:MINING_MODE_DEFAULT}))}catch(e){}
}
function loadMiningMode(){
  try{
    const raw=localStorage.getItem(MINING_MODE_KEY);
    if(raw===null)return;
    let parsed=null;try{parsed=JSON.parse(raw)}catch(e){}
    if(parsed&&typeof parsed==='object'&&'v' in parsed){
      // A saved value that was simply the default of its day isn't a customization —
      // leave the input alone so the current default wins.
      const v=Number(parsed.v);
      if(v===Number(parsed.base)||MINING_MODE_PAST_DEFAULTS.includes(v))return;
      if($('inMiningMode'))$('inMiningMode').value=parsed.v;
      return;
    }
    // Legacy bare-value format from before this migration: abandon and let the
    // current HTML default (MINING_MODE_DEFAULT) win.
  }catch(e){}
}

// ---- DISCOUNT OVERRIDE ----
function loadDiscountOverride(){
  try{
    const raw=localStorage.getItem(DISCOUNT_OVERRIDE_KEY);
    if(raw===null)return;
    const v=Number(raw);
    if(isFinite(v))S.discountOverride=Math.max(0,Math.min(30,v));
  }catch(e){}
}
function toggleDiscountOverride(){
  const panel=$('discOverridePanel'),btn=$('discOverrideToggle');
  const open=panel.style.display==='none';
  panel.style.display=open?'':'none';
  btn.classList.toggle('active',open);
  if(open){
    // Prefill with the current displayed discount as a starting point.
    if(S.discountOverride!=null)$('inDiscOverride').value=S.discountOverride;
    else{const m=calc(inp());$('inDiscOverride').value=(+m.totD.toFixed(1));}
    $('inDiscOverride').focus();$('inDiscOverride').select();
  }
}
function applyDiscountOverride(){
  let v=parseFloat($('inDiscOverride').value);
  if(!isFinite(v)){resetDiscountOverride();return;}
  v=Math.max(0,Math.min(30,v));
  S.discountOverride=v;
  try{localStorage.setItem(DISCOUNT_OVERRIDE_KEY,String(v))}catch(e){}
  autoSave();   // persist the override into the active setup so it stays tied to THIS setup
  $('discOverridePanel').style.display='none';
  $('discOverrideToggle').classList.remove('active');
  if(S.loaded)recalc();
  flashStatus('Discount override set to '+fP(v));
}
function resetDiscountOverride(){
  S.discountOverride=null;
  try{localStorage.removeItem(DISCOUNT_OVERRIDE_KEY)}catch(e){}
  autoSave();   // clear it from the active setup too
  $('discOverridePanel').style.display='none';
  $('discOverrideToggle').classList.remove('active');
  if(S.loaded)recalc();
  flashStatus('Discount reset to auto-calc');
}

function loadProfilesState(){
  try{
    const raw=localStorage.getItem(PROFILES_KEY);
    if(raw){const s=JSON.parse(raw);if(s&&Array.isArray(s.profiles))return s;}
  }catch(e){}
  return {profiles:[],activeId:null};
}
function saveProfilesState(s){try{localStorage.setItem(PROFILES_KEY,JSON.stringify(s))}catch(e){}}

function readInputs(){
  return {
    inTH:$('inTH').value, inWTH:$('inWTH').value,
    inGMTLocked:$('inGMTLocked').value, inGMTWallet:$('inGMTWallet').value,
    inCapital:$('inCapital').value,
    inMpTH:$('inMpTH').value, inMpGMT:$('inMpGMT').value, inMpWth:$('inMpWth').value,
    inMpGreedy:($('inMpGreedy')?$('inMpGreedy').checked:false),
    inMpCode:($('inMpCode')?$('inMpCode').value:''),
    inGreedyTH:$('inGreedyTH').value, inGreedyInitial:$('inGreedyInitial').value, inGreedyGrowth:$('inGreedyGrowth').value,
    inGreedyWth:($('inGreedyWth')?$('inGreedyWth').value:''),
    inInactiveTH:($('inInactiveTH')?$('inInactiveTH').value:'0'),
    inInactiveWth:($('inInactiveWth')?$('inInactiveWth').value:'0'),
    inClickStreak:$('inClickStreak').checked, inPayGMT:$('inPayGMT').checked,
    inAvatarDisc:$('inAvatarDisc').checked,
    inAmbassador:$('inAmbassador').checked, inReferredTH:$('inReferredTH').value,
    inRefCapital:$('inRefCapital').value,
    inRefBonusPct:$('inRefBonusPct')?$('inRefBonusPct').value:'5',
    inRefReinvest:$('inRefReinvest')?$('inRefReinvest').value:'0',
    inCurrency:$('inCurrency').value,
    piVipBonus:$('piVipBonus')?$('piVipBonus').checked:false,
    // Manual discount override travels WITH the setup so it never leaks across profiles.
    discountOverride:(S.discountOverride!=null&&isFinite(S.discountOverride))?S.discountOverride:null
  };
}
// Apply a setup's saved discount override (or clear it). Keeps the global persistence key
// in sync so a page reload of the same setup restores the same override.
function applyDiscountOverrideFor(d){
  const raw=d?d.discountOverride:undefined;
  const v=(raw!=null&&isFinite(Number(raw)))?Math.max(0,Math.min(30,Number(raw))):null;
  S.discountOverride=v;
  try{v!=null?localStorage.setItem(DISCOUNT_OVERRIDE_KEY,String(v)):localStorage.removeItem(DISCOUNT_OVERRIDE_KEY)}catch(e){}
}
function applyInputs(d){
  if(d.inTH!=null)$('inTH').value=d.inTH;
  if(d.inWTH!=null)$('inWTH').value=d.inWTH;
  if(d.inGMTLocked!=null)$('inGMTLocked').value=d.inGMTLocked;
  if(d.inGMTWallet!=null)$('inGMTWallet').value=d.inGMTWallet;
  $('inCapital').value='0';   // capital-to-deploy is transient — always start at $0, never restored from a saved setup
  if(d.inMpTH!=null)$('inMpTH').value=d.inMpTH;
  if(d.inMpGMT!=null)$('inMpGMT').value=d.inMpGMT;
  if(d.inMpWth!=null)$('inMpWth').value=d.inMpWth;
  if(d.inMpGreedy!==undefined&&$('inMpGreedy'))$('inMpGreedy').checked=!!d.inMpGreedy;
  if(d.inMpCode!=null&&$('inMpCode'))$('inMpCode').value=d.inMpCode;
  if(d.inGreedyTH!=null)$('inGreedyTH').value=d.inGreedyTH;
  if(d.inGreedyInitial!=null)$('inGreedyInitial').value=d.inGreedyInitial;
  if(d.inGreedyWth!=null&&$('inGreedyWth'))$('inGreedyWth').value=d.inGreedyWth;
  // Older saved setups predate the active/inactive toggle — default to all-active
  // rather than leaving a stale value from whatever setup was loaded before.
  if($('inInactiveTH'))$('inInactiveTH').value=(d.inInactiveTH!=null?d.inInactiveTH:'0');
  if($('inInactiveWth'))$('inInactiveWth').value=(d.inInactiveWth!=null?d.inInactiveWth:'0');
  if(d.inGreedyGrowth!=null)$('inGreedyGrowth').value=d.inGreedyGrowth;
  if(d.inClickStreak!==undefined)$('inClickStreak').checked=!!d.inClickStreak;
  if(d.inPayGMT!==undefined)$('inPayGMT').checked=!!d.inPayGMT;
  if(d.inAvatarDisc!==undefined)$('inAvatarDisc').checked=!!d.inAvatarDisc;
  if(d.inAmbassador!==undefined){$('inAmbassador').checked=!!d.inAmbassador;$('ambassadorFields').style.display=d.inAmbassador?'':'none'}
  if(d.inReferredTH!=null)$('inReferredTH').value=d.inReferredTH;
  if(d.inRefCapital!=null)$('inRefCapital').value=d.inRefCapital;
  if(d.inRefBonusPct!=null&&$('inRefBonusPct'))$('inRefBonusPct').value=d.inRefBonusPct;
  if(d.inRefReinvest!=null&&$('inRefReinvest'))$('inRefReinvest').value=d.inRefReinvest;
  if(d.piVipBonus!==undefined&&$('piVipBonus'))$('piVipBonus').checked=!!d.piVipBonus;
  if(d.inCurrency&&typeof setCurrency==='function')setCurrency(d.inCurrency);
  autoFillCPT('inTH','inCostPerTH','inWTH');
  refreshGreedyVisibility();
}

function migrateLegacySetup(){
  const state=loadProfilesState();
  if(state.profiles.length>0)return state;
  try{
    const raw=localStorage.getItem(SETUP_KEY);
    if(!raw)return state;
    const d=JSON.parse(raw);
    if(d.inMiningMode&&localStorage.getItem(MINING_MODE_KEY)===null){
      if($('inMiningMode'))$('inMiningMode').value=d.inMiningMode;
      saveMiningMode();
    }
    const id='p_'+Date.now().toString(36);
    state.profiles.push({id,name:'My Setup',data:d});
    state.activeId=id;
    saveProfilesState(state);
  }catch(e){}
  return state;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderProfileSelect(){
  const sel=$('profileSelect');if(!sel)return;
  const state=loadProfilesState();
  const cur=state.activeId||'';
  sel.innerHTML='<option value="">Setup</option>'+
    state.profiles.map(p=>{
      // The primary account profile is starred + labelled so it's obviously the main one.
      const label=p.account?('★ '+p.name+' (your profile)'):p.name;
      return `<option value="${escapeHtml(p.id)}"${p.id===cur?' selected':''}>${escapeHtml(label)}</option>`;
    }).join('');
  const del=$('btnDeleteProfile');if(del){del.disabled=!cur;del.style.opacity=cur?'1':'.4';del.style.cursor=cur?'pointer':'not-allowed';}
}

// The edit form carries two save rows (top and bottom), so flash the confirmation on both —
// whichever one you clicked is the one you're looking at.
function flashStatus(msg){
  const els=document.querySelectorAll('.ed-save-status');if(!els.length)return;
  els.forEach(el=>{
    el.textContent=msg;el.style.opacity='1';
    setTimeout(()=>el.style.opacity='0',2000);
  });
}

function onProfileChange(){
  const state=loadProfilesState();
  const id=$('profileSelect').value;
  state.activeId=id||null;
  saveProfilesState(state);
  if(id){
    const p=state.profiles.find(x=>x.id===id);
    if(p){applyInputs(p.data);applyDiscountOverrideFor(p.data);if(S.loaded)recalc();}
    // Switching profiles switches fleet stores (account=cloud, scratch=local).
    if(window.GMTFleetReload)window.GMTFleetReload();
    flashStatus('Loaded "'+(p?p.name:'')+'"');
  }else{
    // Switched to demo / no setup — drop any override carried over from a previous setup.
    applyDiscountOverrideFor(null);if(S.loaded)recalc();
  }
  renderProfileSelect();
}

function saveActiveProfile(){
  const state=loadProfilesState();
  let p=state.activeId&&state.profiles.find(x=>x.id===state.activeId);
  if(!p){
    // No profile selected — Save should NOT prompt for a name (that's "Save as").
    // Logged in: save to the account "[username]" profile. Logged out: save to a
    // default local "My Setup". Either is created if it doesn't exist yet.
    const pid=accountProfileId();
    if(pid&&window.GMTAccount&&GMTAccount.isLoggedIn()){
      p=state.profiles.find(x=>x.id===pid);
      const uname=(GMTAccount.profile&&GMTAccount.profile.username)||'my setup';
      if(!p){p={id:pid,name:uname,account:true,data:readInputs()};state.profiles.unshift(p);}
      state.activeId=pid;
    }else{
      p=state.profiles.find(x=>x.name==='My Setup'&&!x.account);
      if(!p){p={id:'p_'+Date.now().toString(36),name:'My Setup',data:readInputs()};state.profiles.unshift(p);}
      state.activeId=p.id;
    }
  }
  p.data=readInputs();
  saveProfilesState(state);
  // The primary "[username]" profile mirrors to the cloud so it follows the account.
  if(isAccountProfile(p)&&window.GMTAccount&&GMTAccount.isLoggedIn())GMTAccount.saveSetup(p.data);
  renderProfileSelect();   // reflect the now-active profile (esp. if we just adopted the account one)
  flashStatus(isAccountProfile(p)?'Saved to your profile':'Saved to "'+p.name+'"');
  editLoadClose('Saved to "'+p.name+'"');
}
function saveAsNewProfile(){
  const name=(prompt('Name this setup (e.g. "Mine", "Client - John"):','')||'').trim();
  if(!name)return;
  const state=loadProfilesState();
  if(state.profiles.some(p=>p.name===name)){
    if(!confirm('A profile named "'+name+'" already exists. Overwrite it?'))return;
    const existing=state.profiles.find(p=>p.name===name);
    existing.data=readInputs();
    state.activeId=existing.id;
  }else{
    const id='p_'+Date.now().toString(36);
    state.profiles.push({id,name,data:readInputs()});
    state.activeId=id;
  }
  saveProfilesState(state);
  renderProfileSelect();
  flashStatus('Saved as "'+name+'"');
  editLoadClose('Saved to "'+name+'"');
}

function toggleEditSetup(){openEditSetup();}   // back-compat
function openEditSetup(){
  const sec=$('secInputs');if(!sec)return;
  // The edit overlay lives inside the My Setup tab; on another tab (e.g. Capital Planner)
  // that tab is display:none, so the overlay's ancestor is hidden and nothing renders.
  // Make My Setup the active tab first so the editor actually shows.
  const cur=document.getElementById('tab-current');
  if(cur&&!cur.classList.contains('active')){
    const setupBtn=document.querySelector('[data-tab="tab-current"]');
    if(setupBtn)setupBtn.click();
  }
  showPanelView('secInputs');
  refreshGreedyVisibility();
  // Highlight the "My Profile" nav item, not "Console" — clicking tab-current above
  // set Console active, so override it here.
  document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('nav-active'));
  const nl=$('navEditSetup');if(nl)nl.classList.add('nav-active');
  try{history.replaceState({panel:'edit'},'','/edit'+location.hash);}catch(e){}   // its own URL
}
function closeEditSetup(){
  hidePanelView('secInputs');
  // Restore the Console nav highlight.
  document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('nav-active'));
  const cn=document.querySelector('.nav-links a[data-view="tab-current"]');if(cn)cn.classList.add('nav-active');
  try{history.replaceState({},'','/console'+location.hash);}catch(e){}
  refreshMySetupAnimation();   // return to the dashboard with the fresh count-up
}
// Brief load spinner (optionally with a status message), then return to My
// Setup with the count-up. Shared by the save buttons and the legacy Enter btn.
function editLoadClose(msg){
  const btn=$('edEnterBtn'),load=$('edLoading'),txt=$('edLoadingTxt');
  if(txt)txt.textContent=msg||'Updating your setup…';
  if(btn)btn.disabled=true;
  if(load)load.style.display='flex';
  setTimeout(function(){
    if(load)load.style.display='none';
    if(txt)txt.textContent='Updating your setup…';
    if(btn)btn.disabled=false;
    closeEditSetup();
  },750);
}
function submitEditSetup(){editLoadClose();}
// "I own a Greedy Machine" checkbox reveals the greedy inputs; unchecking zeroes them.
// Greedy is auto-detected from the fleet (a "Greedy Machines" collection miner) —
// there is no manual "I own a greedy machine" toggle. The Greedy Machine group
// shows only when there's greedy TH.
function refreshGreedyVisibility(){
  const grp=$('greedyGroup');if(!grp)return;
  const has=(+($('inGreedyTH')&&$('inGreedyTH').value)||0)>0;
  grp.style.display=has?'':'none';
}
// Back-compat shim: fleet.js and applyInputs call this after setting greedy fields.
function toggleGreedyFields(){refreshGreedyVisibility();}

function clearInputs(){
  // Blanks the form. Stays on the CURRENT setup so Save updates it without renaming.
  applyInputs({
    inTH:'0',inWTH:'15',inGMTLocked:'0',inGMTWallet:'0',
    inCapital:'0',inClickStreak:false,inPayGMT:true,inAvatarDisc:false,
    inMpTH:'0',inMpGMT:'0',inMpWth:'15',inMpGreedy:false,inMpCode:'',
    inGreedyTH:'0',inGreedyInitial:'0',inGreedyWth:'',inGreedyGrowth:'0.3',
    inAmbassador:false,inReferredTH:'0',inRefCapital:'0',inRefBonusPct:'5',inRefReinvest:'0',
    piVipBonus:false
  });
  // Empty the fleet builder too — but ONLY on a scratch/no profile, never on the
  // account profile, so the real cloud fleet is never wiped by a clear.
  if(!gmtOnAccountProfile()&&window.GMTFleetClear)window.GMTFleetClear();
  if(S.loaded)recalc();
  flashStatus('Inputs cleared');
}

// The logged-in user's PRIMARY setup profile, named after their username and backed
// by the cloud (profiles.setup). Any other Saved Setups are local scratch profiles —
// tinkering, referral quotes, etc. Called by account.js once per login.
function accountProfileId(){return (window.GMTAccount&&GMTAccount.user)?('acct_'+GMTAccount.user.id):null}
function isAccountProfile(p){return !!(p&&p.account)}
// True when the active Saved Setup is the primary account profile. The cloud fleet
// syncs only here; scratch profiles keep a local fleet (see fleet.js isCloud).
window.gmtOnAccountProfile=function(){const pid=accountProfileId();if(!pid)return false;const s=loadProfilesState();return s.activeId===pid};
window.gmtSyncAccountProfile=function(){
  const A=window.GMTAccount; if(!A||!A.isLoggedIn())return;
  const uname=(A.profile&&A.profile.username)||'my setup';
  const cloudSetup=A.profile&&A.profile.setup;
  const pid=accountProfileId();
  const state=loadProfilesState();
  let p=state.profiles.find(x=>x.id===pid);
  if(!p){
    // First login on this device: seed the primary profile from the cloud setup,
    // or from whatever's on screen if the account has no saved setup yet.
    p={id:pid,name:uname,account:true,data:cloudSetup||readInputs()};
    state.profiles.unshift(p);
  }else{
    p.name=uname; p.account=true;
    if(cloudSetup)p.data=cloudSetup;   // cloud is the source of truth for the primary
  }
  state.activeId=pid;
  saveProfilesState(state);
  renderProfileSelect();
  applyInputs(p.data);
  if(S.loaded)recalc();
};

function deleteActiveProfile(){
  const state=loadProfilesState();
  if(!state.activeId)return;
  const p=state.profiles.find(x=>x.id===state.activeId);
  if(!p)return;
  if(isAccountProfile(p)){alert('This is your account profile — it can’t be deleted. Create a separate setup for tinkering or referral quotes.');return;}
  if(!confirm('Delete profile "'+p.name+'"? (Inputs stay on screen.)'))return;
  state.profiles=state.profiles.filter(x=>x.id!==state.activeId);
  state.activeId=null;
  saveProfilesState(state);
  renderProfileSelect();
  flashStatus('Deleted "'+p.name+'"');
}

function loadSetup(){
  loadMiningMode();
  loadDiscountOverride();
  const state=migrateLegacySetup();
  renderProfileSelect();
  if(state.activeId){
    const p=state.profiles.find(x=>x.id===state.activeId);
    if(p){
      applyInputs(p.data);
      // New profiles store their own override; legacy ones (field absent) keep the
      // global value loadDiscountOverride() already restored above.
      if(p.data&&p.data.discountOverride!==undefined)applyDiscountOverrideFor(p.data);
      return true;
    }
  }
  return false;
}

// Auto-save: silently persist into the active profile only.
// Demo mode (no active profile) intentionally does not write anywhere.
function autoSave(){
  try{
    const state=loadProfilesState();
    if(!state.activeId)return;
    const p=state.profiles.find(x=>x.id===state.activeId);
    if(!p)return;
    p.data=readInputs();
    saveProfilesState(state);
  }catch(e){}
}
['inTH','inWTH','inGMTLocked','inGMTWallet','inCapital','inReferredTH','inRefCapital','inRefBonusPct','inRefReinvest','inMpTH','inMpGMT','inMpWth','inGreedyTH','inGreedyInitial','inGreedyWth','inGreedyGrowth','inMpCode'].forEach(id=>{const e=$(id);if(e)e.addEventListener('input',autoSave)});
// Mining mode persists globally — separate save handler so it doesn't get bundled into per-setup data
{const mm=$('inMiningMode');if(mm)mm.addEventListener('input',saveMiningMode);}

// Platform-wide field UX: focusing any value field clears it so you can type instantly (the old
// value becomes a placeholder hint). Leaving it blank — or pressing Escape — reverts to the old
// value. Delegated on document so it covers every number/text input, current or added later.
function _isClearable(el){return el&&el.tagName==='INPUT'&&(el.type==='number'||el.type==='text')&&!el.readOnly&&!el.disabled&&el.dataset.noClear==null;}
document.addEventListener('focusin',e=>{
  const el=e.target;if(!_isClearable(el))return;
  el.dataset.prevVal=el.value;
  el.dataset.prevPh=el.getAttribute('placeholder')||'';
  if(el.value!==''){el.setAttribute('placeholder',el.value);el.value='';}
});
document.addEventListener('focusout',e=>{
  const el=e.target;if(!_isClearable(el)||el.dataset.prevVal===undefined)return;
  if(el.value.trim()===''&&el.dataset.prevVal!==''){
    el.value=el.dataset.prevVal;
    el.dispatchEvent(new Event('input',{bubbles:true}));   // resync (value reverted to its prior state)
  }
  el.setAttribute('placeholder',el.dataset.prevPh);
  delete el.dataset.prevVal;delete el.dataset.prevPh;
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const el=e.target;if(!_isClearable(el)||el.dataset.prevVal===undefined)return;
  el.value=el.dataset.prevVal;el.blur();   // cancel the edit, revert
});
['inClickStreak','inPayGMT','inAmbassador','inAvatarDisc','inMpGreedy'].forEach(id=>{const e=$(id);if(e)e.addEventListener('change',autoSave)});
$('inAvatarDisc').addEventListener('change',()=>autoFillCPT('inTH','inCostPerTH','inWTH'));
// Efficiency now selects the price curve, so the estimate has to follow it.
$('inWTH').addEventListener('input',()=>autoFillCPT('inTH','inCostPerTH','inWTH'));
{const pv=$('piVipBonus');if(pv)pv.addEventListener('change',()=>{autoSave();if(S.loaded)recalc();});}
$('inAmbassador').addEventListener('change',function(){$('ambassadorFields').style.display=this.checked?'':'none'});

// ---- CALC ----
// GoMining verified fee formulas (per TH per day in BTC, pre-discount)
// electricity_per_TH = (0.05 * 24 * W/TH) / BTC_price / 1000
// service_per_TH = 0.0089 / BTC_price
function fees(th,wth,bp){const e=(ELECTRICITY_RATE*24*wth)/bp/1000*th,s=(SERVICE_RATE/bp)*th;return{e,s,t:e+s}}
function dailyBTCperTH(){
  // Derive from S.satsPerTHDay (live network-hashrate basis, set in fetchData) so the
  // calc and the live-bar number never diverge. Round to whole sats like the app
  // (GoMining rounds to nearest, not floor — verified 2026-06-27: app 47 vs our floored 46).
  return Math.round(S.satsPerTHDay||0)/1e8;
}

// Block subsidy (and thus mining reward per TH) halves at each halving. Dates are estimates
// (~every 210k blocks). Used to make long projections shed reward at each future halving.
const HALVING_DATES=[Date.UTC(2028,3,15),Date.UTC(2032,3,15),Date.UTC(2036,3,15),Date.UTC(2040,3,15)];
function subsidyMultAt(t){let m=1;for(const h of HALVING_DATES){if(t>=h)m*=0.5;}return m;}
// Beyond halvings, network difficulty grinds upward and erodes sats/TH/day continuously.
// Calibrated to the DECAYING trailing difficulty CAGR (8yr 50% → 5yr 46% → 3yr 37% → 2yr 26%):
//   g(Y) = floor + (g0−floor)·e^(−Y/τ)   (Y = years from now), cumulative growth = exp(∫₀^Y g dY).
// Reward factor = 1/that. Params must stay coherent with the PRICE path the projection uses:
// price and difficulty are anti-correlated, so pairing one scenario's price with another's
// difficulty double-stacks. The projection converges on the "Still cheap" band (rbProjPrice),
// a healthier world than the old Fire-Sale path — a better-funded network adds hashrate, so
// g0 sits at the 3yr trailing CAGR (37%) rather than the maximally-decelerated 2yr (26%) that
// paired with capitulation pricing. Still decaying, since the trailing series decelerates
// (8yr 50% → 5yr 46% → 3yr 37% → 2yr 26%), and never flat — ASIC efficiency grinds difficulty
// up even in bears (2022 bear: +45%). NO quantitative price→difficulty regression (that's
// OOS-invalid, +2346% error); this is only the qualitative scenario-coherence choice.
const DIFF_G0=0.37, DIFF_FLOOR=0.05, DIFF_TAU=4;   // paired with the Still-cheap price path
// GMT price path — expressed as a LEVEL ratio to BTC (GMT $ per micro-BTC), so the token scales
// with whatever BTC path a projection already uses instead of sitting frozen for a decade.
// Calibrated 2026-07-26 on ~3 yr of daily GoMining/BTC closes (Bitget, 1056 obs).
// WHY A LEVEL RATIO AND NOT A BETA: regressing GMT log-returns on BTC is worthless — R² is
// 0.039 daily / 0.061 weekly / 0.042 monthly, and beta swings 0.41 → 0.24 → -0.00 → 0.23 → 0.89
// across consecutive 6-month blocks. That is the same out-of-sample failure as the price→difficulty
// regression, so NEVER model GMT as a return beta. The LEVEL ratio is what's stable: over the last
// two years min 3.17, p25 4.02, median 4.38, today ~4.49. We use the p25 so the token tracks BTC
// but lands ~11% below today's ratio — scaling, without quietly turning the projection bullish.
// NOT enforced by any arbitrage (unlike the reward floor): emissions or tokenomics changes could
// reset it permanently. Treat as a calibrated assumption, not a law.
const GMT_BTC_RATIO=4.02e-6;
// ---- How hard GMT actually moves with BTC ----
// The projection used to scale GMT 1:1 with Bitcoin. Measured on daily log returns that
// elasticity is nowhere near 1, and — this is the part that matters — it explains very little:
// R^2 sits around 0.07, so ~93% of GMT's daily movement has nothing to do with BTC. The fit is
// therefore used to produce a CENTRE and a BAND, never a forecast. Beta is clamped because a
// short window can throw a silly number, and the residual is what the band is drawn from.
let _gmtBeta=null;                       // {beta,resid,r2,n,at}
const GMT_BETA_KEY='gmtopt_gmt_beta_v1';
const GMT_BETA_MIN=0.05, GMT_BETA_MAX=1.5;
function fitGmtBeta(rows){
  if(!rows||rows.length<60)return null;
  const rb=[],rg=[];
  for(let i=1;i<rows.length;i++){
    const b0=rows[i-1].btc,b1=rows[i].btc,g0=rows[i-1].gmt,g1=rows[i].gmt;
    if(b0>0&&b1>0&&g0>0&&g1>0){rb.push(Math.log(b1/b0));rg.push(Math.log(g1/g0));}
  }
  const n=rb.length;if(n<50)return null;
  const mB=rb.reduce((a,c)=>a+c,0)/n, mG=rg.reduce((a,c)=>a+c,0)/n;
  let sbg=0,sbb=0,sgg=0;
  for(let i=0;i<n;i++){const db=rb[i]-mB,dg=rg[i]-mG;sbg+=db*dg;sbb+=db*db;sgg+=dg*dg;}
  if(!(sbb>0&&sgg>0))return null;
  const beta=sbg/sbb, r2=(sbg/Math.sqrt(sbb*sgg))**2;
  let ss=0;for(let i=0;i<n;i++){const e=(rg[i]-mG)-beta*(rb[i]-mB);ss+=e*e;}
  return {beta,r2,n,resid:Math.sqrt(ss/Math.max(1,n-2)),at:Date.now()};
}
function gmtBetaClamped(){
  if(!_gmtBeta||!isFinite(_gmtBeta.beta))return null;
  return Math.max(GMT_BETA_MIN,Math.min(GMT_BETA_MAX,_gmtBeta.beta));
}
// Fitted once per session off the same daily series the BTC+GMT chart uses, and cached for a day
// — a beta that moves between page loads would make two identical projections disagree.
function ensureGmtBeta(){
  if(_gmtBeta)return Promise.resolve(_gmtBeta);
  try{
    const raw=localStorage.getItem(GMT_BETA_KEY);
    if(raw){const c=JSON.parse(raw);
      if(c&&isFinite(c.beta)&&c.at&&Date.now()-c.at<86400000){_gmtBeta=c;return Promise.resolve(c);}}
  }catch(e){}
  return Promise.all([cmbFetchBTC(),cmbFetchGMT()]).then(([b,g])=>{
    const rows=(b&&g)?cmbAlign(b,g):null;
    const fit=fitGmtBeta(rows);
    if(fit){_gmtBeta=fit;try{localStorage.setItem(GMT_BETA_KEY,JSON.stringify(fit));}catch(e){}}
    return fit;
  }).catch(()=>null);
}
// GMT staking APR decay. The headline ~23.1% CANNOT persist: GMT is FIXED SUPPLY
// (total_supply === max_supply === 404,266,808, zero inflation headroom), so staking rewards come
// from a finite pool / protocol revenue, never from emissions. A staker is owed S((1+r)^n − 1):
// at a flat 23.1% that is 17.35x the staked amount over 14 yr, so with just 5% of supply staked
// the payout would consume 87% of every GMT that will ever exist (10% staked ⇒ 173% — impossible).
// So the APR must decay; only the speed is a judgement call. We mirror the difficulty treatment:
// start at the user's observed APR and relax toward a floor set by what fee revenue can fund
// long-run. Cuts the 14-yr compounding from 17.35x to ~4.7x, which a plausible rewards allocation
// can actually cover. Applies to PROJECTIONS only — today's run-rate stays at the observed APR.
const STAKE_APR_FLOOR=5, STAKE_APR_TAU=5;   // % floor, years
function stakeAprAt(apr0,yrs){
  if(!(apr0>STAKE_APR_FLOOR))return apr0;    // already at/below the floor: leave it alone
  return STAKE_APR_FLOOR+(apr0-STAKE_APR_FLOOR)*Math.exp(-Math.max(0,yrs)/STAKE_APR_TAU);
}
function difficultyMultAt(t){
  const yrs=(t-Date.now())/(365.25*86400000);
  if(yrs<=0)return 1;
  const integral=DIFF_FLOOR*yrs+(DIFF_G0-DIFF_FLOOR)*DIFF_TAU*(1-Math.exp(-yrs/DIFF_TAU));
  return 1/Math.exp(integral);
}
// No-arbitrage reward floor: difficulty is an EQUILIBRIUM, not an exogenous grind. If the reward fell
// below where the marginal miner covers costs, hashrate would capitulate and difficulty would drop
// until it didn't — the network can't run at a loss (Bitcoin would halt first). So sats/TH/day can't
// decay past a 12 W/TH miner's break-even at the projected price. This is an economic CONSTRAINT, NOT
// a price→difficulty forecast (that regression is OOS-invalid — see project_difficulty_model). Floor
// uses the undiscounted 12 W cost, so a GoMining user keeps a thin margin via their GMT discount.
// MINER_FLOOR_WTH is tunable: lower it if you think the marginal global miner is more efficient/cheaper.
const MINER_FLOOR_WTH=EFF_BEST;   // efficiency (W/TH) of the price-setting marginal network miner
function rewardFloorBTC(price){return price>0?(0.0012*MINER_FLOOR_WTH+0.0089)/price:0;}  // BTC/TH/day
// Halving years that fall within [now, now+days] — for projection notes.
function halvingsInWindow(days){const end=Date.now()+days*86400000;return HALVING_DATES.filter(h=>h>=Date.now()&&h<=end).map(h=>new Date(h).getUTCFullYear());}

function calc(i){
  const bp=S.btcPrice,gp=S.gmtPrice,dbt=dailyBTCperTH();
  // Greedy Machine TH earns rewards + pays fees. It counts toward the VIP tier
  // EXCEPT the initial marketplace-bought amount (gInit) — only growth above that
  // (passive + reinvested upgrades) is VIP-eligible.
  const gth=Math.max(0,i.gth||0),gwth=gth>0?(i.gwth>0?i.gwth:15):0;
  const gInit=Math.min(Math.max(0,i.gInit||0),gth);
  // Hashrate switched off in the fleet. A miner you've turned off mines nothing,
  // but you still own it, so it still counts toward your VIP tier. It is switched off,
  // so it enters NEITHER the reward nor the fee basis — only the VIP one.
  const offTH=Math.max(0,i.offTH||0),offWth=offTH>0?(i.offWth>0?i.offWth:15):0;
  const vipTH=i.th+Math.max(0,gth-gInit)+offTH;   // VIP tier basis — still owned, so it still counts
  const earnTH=i.th+gth;                          // hashrate that mines AND is billed
  const totTH=earnTH+offTH;                       // hashrate OWNED (farm value, VIP) — not the fee basis
  // A paused miner is switched off: it mines nothing and it is billed nothing. Fees and
  // the blended efficiency they're computed on therefore cover the ACTIVE hashrate only.
  // Pausing consequently lifts the token discount slightly, because there is less daily
  // fee for the same GMT coverage to stretch over — which is the real-world effect.
  const bwth=earnTH>0?(i.th*i.wth+gth*gwth)/earnTH:i.wth;
  const gross=dbt*earnTH,f=fees(earnTH,bwth,bp);
  const vip=vipOf(vipTH,i.gl),nxt=nextVip(vipTH,i.gl);
  const vd=vip.d,cb=i.click?3:0;
  const nonTokD=Math.min(30,vd+cb+i.mm+i.od);
  // Token discount auto-calculated from GMT holdings
  const feesGMT=(f.t*(1-nonTokD/100)*bp)/gp; // daily fees in GMT after non-token discounts
  // Wallet (liquid) GMT counts toward coverage alongside locked.
  const tg=i.gl+i.gw,cov=feesGMT>0?tg/feesGMT:Infinity;
  // GoMining grants the token discount in 1% steps based on coverage days.
  // GoMining uses 18 days per 1% step (360 days = 20% max), not 18.9.
  const eTok=cov<18?0:Math.min(20,Math.floor(cov/18));
  let tok=i.payG?eTok:0;
  let totD=Math.min(30,tok+nonTokD);
  // Manual override: user enters the real discount they see in the GoMining app.
  // The delta from the auto-calc is attributed to the token (coverage) discount so
  // the breakdown still sums to the displayed total.
  let ovr=false;
  if(S.discountOverride!=null&&isFinite(S.discountOverride)){
    totD=Math.max(0,Math.min(30,S.discountOverride));
    tok=Math.max(0,totD-nonTokD);
    ovr=true;
  }
  const dfees=f.t*(1-totD/100),net=(gross-dfees)*(1-CONVERSION_FEE),save=f.t*(totD/100);
  const wkGMT=(i.gl*i.apr/100)/52;
  return{dbt,gross,f,vip,nxt,vd,cb,tok,totD,dfees,net,save,eTok,wkGMT,bp,gp,ovr,bwth,totTH,earnTH,offTH,offWth,gth,gwth,vipTH,feesGMT,nonTokD,cov}
}

// ---- RENDER HELPERS ----
function row(l,v,c=''){return`<div class="out-row"><span class="out-label">${l}</span><span class="out-val ${c}">${v}</span></div>`}
function badge(vip){return`<span class="vip-badge ${tierCls(vip.n)}">${vip.n}${vip.est?' (est.)':''}</span>`}

// ---- ANIMATED NUMBER COUNTER ----
// Eases a metric from its previous value to the new one (~800ms). First render
// counts up from 0 (el._cur undefined). Concurrent calls retarget cleanly.
function animateMetric(el,to,fmt){
  if(!el)return;
  if(typeof to!=='number'||!isFinite(to)){el.textContent=fmt(to);return;}
  const from=(typeof el._cur==='number'&&isFinite(el._cur))?el._cur:0;
  el._cur=to;
  if(el._raf)cancelAnimationFrame(el._raf);
  if(Math.abs(to-from)<1e-9){el.textContent=fmt(to);el._raf=null;return;}
  const dur=800,t0=performance.now(),ease=p=>1-Math.pow(1-p,3);
  function step(now){
    const p=Math.min(1,(now-t0)/dur);
    el.textContent=fmt(from+(to-from)*ease(p));
    if(p<1)el._raf=requestAnimationFrame(step);else el._raf=null;
  }
  el._raf=requestAnimationFrame(step);
}

// ---- MAIN RENDER ----
// Hide the optional marketplace-miner / greedy-machine blocks on the Investment
// Amount screen when the user hasn't entered any such info — keeps the planner clean.
function updateCapInVisibility(){
  const mpEl=$('inMpTH'),gEl=$('inGreedyTH');
  const mpOn=mpEl&&(parseFloat(mpEl.value)||0)>0;
  // A marketplace miner flagged greedy needs the weekly-growth input too, even with no greedy owned.
  const mpG=!!($('inMpGreedy')&&$('inMpGreedy').checked)&&mpOn;
  const gOn=(gEl&&(parseFloat(gEl.value)||0)>0)||mpG;
  const note=document.getElementById('mpGreedyNote');
  if(note)note.style.display=mpG?'':'none';
  const mpBlock=document.getElementById('capInMarketplace');
  const gBlock=document.getElementById('capInGreedy');
  // Don't yank a block out from under the user while they're typing inside it.
  if(mpBlock&&!mpBlock.contains(document.activeElement))mpBlock.style.display=mpOn?'':'none';
  if(gBlock&&!gBlock.contains(document.activeElement))gBlock.style.display=gOn?'':'none';
}
function recalc(){
  if(!S.loaded)return;
  updateCapInVisibility();
  const i=inp(),m=calc(i);

  // Update auto-calculated token discount display
  $('inTokenDiscountDisplay').textContent=m.eTok;

  // Weighted-average efficiency across all hashrate (main + greedy) — the value
  // fees are actually computed on. Read-only; equals main W/TH when no greedy.
  const wAvg=$('inWeightedWthDisplay');
  if(wAvg)wAvg.textContent=fN(m.bwth,2);

  // Hero cards
  const dailyStakeUSD=(m.wkGMT/7)*m.gp;
  const netUSD=m.net*m.bp;
  const heroIsAmb=$('inAmbassador').checked;
  const heroRefTH=heroIsAmb?(+$('inReferredTH').value||0):0;
  const heroAmbDaily=ambDailyUSD(heroRefTH,AMB_DEFAULT_WTH);
  // Greedy Machine free weekly growth is real value in the form of TH credits: the free
  // TH it accrues × the marketplace cost of that TH at the greedy's own efficiency
  // (12 W priced off the 12 W curve, else the 15 W curve). Counted as income below.
  const ggrow=+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0;
  const greedyWkTH=(m.gth||0)*ggrow/100, gwv=m.gwth||0;
  const cptGreedy=cptAtEff(m.gth||1,gwv);   // interpolated by the greedy's exact W/TH
  const greedyDailyUSD=greedyWkTH/7*cptGreedy, greedyMonthlyUSD=greedyWkTH*4.33*cptGreedy;
  const totalDailyUSD=netUSD+dailyStakeUSD+heroAmbDaily+greedyDailyUSD;
  // Monthly must equal the "Total monthly income" breakdown below, which uses
  // 4.33 weeks/month for staking (52/12), not daily×30/7. Compose it the same way.
  const stakingMonthlyUSD=m.wkGMT*m.gp*4.33;
  const cashMoUSD=netUSD*30+stakingMonthlyUSD+heroAmbDaily*30;   // reinvestable cash income
  const moUSD=cashMoUSD+greedyMonthlyUSD;                        // + greedy TH-credit value
  animateMetric($('heroDailyNet'),totalDailyUSD,fU);$('heroDailyNet').className='hero-val '+(totalDailyUSD>=0?'green':'red');
  let heroSub=fU(netUSD)+' mining + '+fU(dailyStakeUSD)+' staking';
  if(heroAmbDaily>0)heroSub+=' + '+fU(heroAmbDaily)+' ambassador';
  if(greedyDailyUSD>0)heroSub+=' + '+fU(greedyDailyUSD)+' greedy growth';
  $('heroDailyBTC').textContent=heroSub;
  animateMetric($('heroMonthly'),moUSD,v=>fU(v,0));$('heroMonthly').className='hero-val '+(moUSD>=0?'cyan':'red');
  let heroMoSub=fU(netUSD*30)+' mining + '+fU(stakingMonthlyUSD)+' staking';
  if(heroAmbDaily>0)heroMoSub+=' + '+fU(heroAmbDaily*30)+' ambassador';
  if(greedyMonthlyUSD>0)heroMoSub+=' + '+fU(greedyMonthlyUSD)+' greedy growth';
  $('heroMonthlyBTC').textContent=heroMoSub;
  animateMetric($('heroYearly'),moUSD*12,v=>fU(v,0)+' / yr');$('heroYearly').className='hero-yearly '+(moUSD>=0?'cyan':'red');
  animateMetric($('heroDiscount'),m.totD,fP);
  $('heroDiscountSub').textContent='Saving '+fU(m.save*m.bp*30)+'/mo';
  // Compounding velocity — how fast the farm grows if you reinvest every dollar you earn
  // into hashrate, plus the Greedy Machine's free weekly growth. A rate at TODAY's prices
  // (income ÷ productive capital), not a forward projection. Base = TH value + locked GMT.
  const totTHv=m.totTH||0, cptNow=estimateCPT12(totTHv||1);
  const farmValueUSD=totTHv*cptNow+Math.max(0,i.gl||0)*m.gp;
  const reinvestPct=(cashMoUSD>0&&farmValueUSD>0)?(cashMoUSD*12)/farmValueUSD*100:0;
  const greedyPct=totTHv>0?(greedyWkTH*52)/totTHv*100:0;
  const velocity=reinvestPct+greedyPct;
  animateMetric($('heroVelocity'),velocity,v=>fN(v,0)+'%/yr');$('heroVelocity').className='hero-val orange';
  const velSub=$('heroVelocitySub');
  if(velSub)velSub.textContent=greedyPct>0.5?`${fN(reinvestPct,0)}% reinvest + ${fN(greedyPct,0)}% greedy growth`:'reinvest all earnings into hashrate';
  // Stash the headline numbers so "Create farm screenshot" can render a shareable card
  // without recomputing anything — same values the hero cards are showing.
  window._farmShot={
    dailyUSD:totalDailyUSD, dailySub:heroSub,
    monthlyUSD:moUSD, yearlyUSD:moUSD*12, monthlySub:heroMoSub,
    disc:m.totD, saveMoUSD:m.save*m.bp*30,
    velocity, velSub:velSub?velSub.textContent:'',
    th:m.totTH||0, wth:m.bwth||0,
    gmtLocked:Math.max(0,i.gl||0), gmtValueUSD:Math.max(0,i.gl||0)*m.gp,
    vip:(m.vip&&m.vip.n)||'—', btc:m.bp, farmValueUSD
  };
  // Reflect manual override state on the "Incorrect discount?" control.
  const ovrToggle=$('discOverrideToggle'),ovrReset=$('discOverrideReset');
  if(ovrToggle){
    ovrToggle.textContent=m.ovr?'Manual override · '+fP(m.totD):'Incorrect discount?';
    // Keep it visually "set" while overridden, even with the editor collapsed.
    if(m.ovr)ovrToggle.classList.add('active');
    else if($('discOverridePanel')&&$('discOverridePanel').style.display==='none')ovrToggle.classList.remove('active');
  }
  if(ovrReset)ovrReset.style.display=m.ovr?'':'none';
  // VIP next-tier progress: the tier qualifies on TH OR locked GMT, so show whichever path is
  // CLOSER to the next tier (e.g. a GMT-qualified user sees "X GMT to next", not the TH path).
  let vipNext=null;
  if(m.nxt){
    const thP=m.nxt.th>0?m.vipTH/m.nxt.th:0, gP=m.nxt.veg>0?i.gl/m.nxt.veg:0, useG=gP>=thP;
    const cur=useG?i.gl:m.vipTH, tgt=useG?m.nxt.veg:m.nxt.th;
    vipNext={unit:useG?'GMT':'TH',cur,tgt,need:Math.max(0,tgt-cur),pct:tgt>0?Math.min(100,cur/tgt*100):0,dec:useG?0:1};
  }
  // VIP Level hero card was replaced by the Growth Projection button; VIP tier
  // detail still renders in the VIP section below. Guarded in case it returns.
  if($('heroVip')){
    $('heroVip').innerHTML=badge(m.vip);
    $('heroVipSub').textContent=vipNext?fN(vipNext.need,0)+' '+vipNext.unit+' to '+m.nxt.n:'Max tier reached';
  }

  // VIP section
  let vh='<div style="display:flex;align-items:center;justify-content:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.4rem">'+badge(m.vip);
  if(m.vip.rb)vh+=` <span class="badge green">+${m.vip.rb}% TH reinvest bonus</span>`;
  if(m.vip.est)vh+=` <span class="badge orange">discount estimated</span>`;
  vh+='</div>';
  if(vipNext){
    vh+=`<div class="tier-progress"><div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.78rem;color:var(--text2)">Next: ${badge(m.nxt)}</span>
      <span style="font-size:.78rem;color:var(--text3)">${fN(vipNext.need,0)} ${vipNext.unit} needed</span></div>
      <div class="tier-bar-bg"><div class="tier-bar-fill" style="width:${vipNext.pct}%"></div></div>
      <div class="tier-info"><span>${fN(vipNext.cur,vipNext.dec)} ${vipNext.unit}</span><span>${fN(vipNext.tgt,0)} ${vipNext.unit}</span></div></div>`;
  }
  $('vipDisplay').innerHTML=vh;

  // Discount
  let dh='';const pts=[];
  if(m.tok>0)pts.push({l:'Token '+fP(m.tok),p:m.tok,c:'ds-token'});
  if(m.vd>0)pts.push({l:'VIP '+fP(m.vd),p:m.vd,c:'ds-vip'});
  if(m.cb>0)pts.push({l:'Click '+fP(m.cb),p:m.cb,c:'ds-click'});
  if(i.mm>0)pts.push({l:'Mining '+fP(i.mm),p:i.mm,c:'ds-mining'});
  if(i.od>0)pts.push({l:'Other '+fP(i.od),p:i.od,c:'ds-other'});
  if(pts.length){
    dh+='<div class="discount-visual">';
    for(const p of pts)dh+=`<div class="${p.c}" style="width:${(p.p/30)*100}%">${p.l}</div>`;
    dh+='</div>';
  }
  dh+=row('Total Discount',fP(m.totD),'cyan');
  dh+=row('Monthly savings',`${fU(m.save*m.bp*30)}/mo`,'green');
  dh+=row('Yearly savings',`${fU(m.save*m.bp*30*12)}/yr`,'green');
  // Paused hashrate: off the books entirely on both sides — no rewards, no fees — but
  // still owned, so it still counts toward the VIP tier. Show the fee it would incur if
  // switched back on, since that's the number that decides whether it's worth running.
  if(m.offTH>0){
    const wouldCostMo=fees(m.offTH,m.offWth,m.bp).t*(1-m.totD/100)*m.bp*30;
    const wouldEarnMo=m.dbt*m.offTH*m.bp*30;
    dh+=row('Paused hashrate',`${fN(m.offTH,2)} TH @ ${fN(m.offWth,1)} W/TH`,'orange');
    dh+=row('↳ If switched on',`${fU(wouldEarnMo-wouldCostMo)}/mo<span class="sub">${fU(wouldEarnMo)} mined − ${fU(wouldCostMo)} fees · counts toward VIP either way</span>`,
      (wouldEarnMo-wouldCostMo)>0?'green':'red');
  }
  $('discountDisplay').innerHTML=dh;

  // Combined: Daily Operation & Rewards
  let g='';
  const tg=i.gl+i.gw;
  g+=row('Total GMT held',`${fN(tg,0)} GMT<span class="sub">${fU(tg*m.gp)}</span>`);

  const stakingMonthly=m.wkGMT*m.gp*4.33;
  const miningMonthly=m.net*m.bp*30;
  const isAmb=$('inAmbassador').checked;
  const refTH=isAmb?(+$('inReferredTH').value||0):0;
  const ambDaily=ambDailyUSD(refTH,AMB_DEFAULT_WTH);
  const ambMonthly=ambDaily*30;
  // Greedy Machine free weekly growth, valued as TH credits (see hero card) — free TH
  // accrued × the cost of that TH at the greedy's efficiency. Real income, in hashrate.
  const ggrowB=+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0;
  const greedyWkTHb=(m.gth||0)*ggrowB/100, gwvb=m.gwth||0;
  const cptGreedyB=cptAtEff(m.gth||1,gwvb);   // interpolated by the greedy's exact W/TH
  const greedyMonthlyB=greedyWkTHb*4.33*cptGreedyB;
  const totalMonthly=miningMonthly+stakingMonthly+ambMonthly+greedyMonthlyB;
  g+=row('TH mining income',`${fU(miningMonthly)}/mo`,miningMonthly>=0?'green':'red');
  g+=row('Staking income',`${fU(stakingMonthly)}/mo`,'green');
  if(isAmb&&refTH>0){
    g+=row('Ambassador rewards',`${fU(ambMonthly)}/mo<span class="sub">${fU(ambDaily)}/day USDT &middot; ${fN(refTH,0)} referred TH</span>`,'green');
  }
  if(greedyMonthlyB>0){
    g+=row('Greedy Machine growth',`${fU(greedyMonthlyB)}/mo<span class="sub">+${fN(greedyWkTHb,2)} TH/wk &middot; ${fU(cptGreedyB)}/TH credit @ ${fN(gwvb,1)} W</span>`,'green');
  }
  g+=`<div class="divider"></div>`;
  g+=row('Total monthly income',fU(totalMonthly),totalMonthly>=0?'green':'red');
  g+=row('Total yearly income',fU(totalMonthly*12),totalMonthly>=0?'green':'red');

  $('gmtCoverage').innerHTML=g;

  // Capital planner (includes projections)
  renderPlanner(i,m);
  // ...and the same solve run automatically on the GMT already sitting in your wallet
  renderIdleGmt(i,m);
}

// ---- My Setup: what to do with the GMT you are already holding ----
// The Capital Planner pre-loads your wallet GMT as deployable capital, but you only see the
// answer if you go there and press Calculate. This runs the identical solve automatically on
// My Setup with NO new USD, so idle GMT always shows its optimal split. Wallet GMT is not free
// to spend — it already counts toward your fee coverage — so the solver keeps whatever holds
// the discount and only deploys the genuine surplus.
function renderIdleGmt(i,m){
  const host=$('idleGmtCard');if(!host)return;
  const hide=()=>{host.innerHTML='';host.style.display='none';};
  const gw=Math.max(0,i.gw||0), gp=m.gp, bp=m.bp, usd=gw*gp;
  if(!(gw>0&&usd>=1&&bp>0&&gp>0))return hide();
  // Same setup, but nothing new deployed: the wallet GMT is the only capital in play.
  const i2=Object.assign({},i,{cap:0,mpTH:0,mpGMT:0,refCap:0});
  const a=solvePlannerAllocation(i2,bp,gp,dailyBTCperTH());
  const P=a?computeEffPlan(effStateFrom(i2,a,gp,bp)):null;
  if(!P||!(P.tot>0.5))return hide();
  // Same resolver the planner uses, so this card names the same machine at the same watts.
  const fs=buyFillSummary(buyFillPlan(P.addTH));
  const wLbl=w=>fN(w,Math.abs(w-Math.round(w))>0.05?1:0);
  const legs=[
    {k:'Lock GMT',v:P.lockUSD,sub:P.glAdd>0.5?fN(P.glAdd,0)+' GMT':'nothing'},
    {k:'Buy TH',v:P.thUSD,
     sub:(P.addTH>0.5&&fs)?`+${fN(P.addTH,1)} TH @ ${wLbl(fs.wth)} W${fs.mixed?' avg':''}`:(P.addTH>0.5?`+${fN(P.addTH,1)} TH`:'nothing'),
     into:(P.addTH>0.5&&fs)?`${fs.name}${fs.more>0?` +${fs.more} more`:''}`:''}
  ];
  if(P.effRoom)legs.push({k:'Upgrade Efficiency',v:P.effUSD,
    sub:P.effTHupg>0.5?`${fN(P.effTHupg,0)} TH \u2192 12 W`:'nothing',
    into:(P.effTHupg>0.5&&P.effIsGreedy&&P.gCode)?P.gCode+' (greedy)':''});
  const pc=v=>Math.max(0,v/P.tot*100);
  const held=gw-(a.sol.deployable||0);   // kept back as the fee reserve / to hold the discount
  let h=`<div class="idle-gmt">
    <div class="idle-gmt-head">
      <div>
        <div class="idle-gmt-title">Your idle GMT, put to work</div>
        <div class="idle-gmt-sub">${fN(gw,0)} GMT in your wallet &middot; ${fU(usd,0)}${held>1?` &middot; ${fN(held,0)} held back to keep your coverage`:''}</div>
        ${(i.cap||0)>0?`<div class="idle-gmt-note">Your Capital Planner is already deploying this GMT alongside ${fU(i.cap,0)} of new capital — open it for the combined plan. This card is the GMT on its own.</div>`:''}
      </div>
      <div class="idle-gmt-gain">+${fU(P.totalMo,0)}<span>/mo</span><div class="idle-gmt-roi">${fN(P.roiB,0)}%/yr</div></div>
    </div>
    <div class="idle-gmt-bar">${legs.map((l,n)=>`<div class="idle-gmt-seg s${n}" style="width:${pc(l.v)}%"></div>`).join('')}</div>
    <div class="idle-gmt-legs">${legs.map((l,n)=>`<div class="idle-gmt-leg"><span class="idle-gmt-dot s${n}"></span><div><div class="idle-gmt-leg-k">${l.k}</div><div class="idle-gmt-leg-v">${fN(pc(l.v),0)}% &middot; ${fU(l.v,0)}</div><div class="idle-gmt-leg-s">${l.sub}</div>${l.into?`<div class="idle-gmt-leg-into">into ${l.into}</div>`:''}</div></div>`).join('')}</div>
    <div class="idle-gmt-foot">Result: <strong>${fN(P.finTH,0)} TH</strong> @ ${fN(P.finWth,2)} W/TH
      <button class="idle-gmt-btn" onclick="openPlannerForm()">Open in Capital Planner &rarr;</button></div>
  </div>`;
  host.innerHTML=h;host.style.display='';
}

function renderProjections(th,wth,totD,label,moStakingUSD,moAmbUSD,curP,greedyMoUSD){
  moStakingUSD=moStakingUSD||0;
  moAmbUSD=moAmbUSD||0;
  const cur=S.btcPrice;
  const gp=S.gmtPrice;
  const dbt=dailyBTCperTH();
  const grossBTC=dbt*th;
  // Store params for dropdown recalc
  window._projParams={th,wth,totD,moStakingUSD,moAmbUSD,greedyMoUSD:greedyMoUSD||0,grossBTC,cur,gp,curP:curP||null};

  const prices=[50000,60000,70000,80000,90000,100000,110000,120000,130000,140000,150000];
  const opts=[cur,...prices.filter(p=>Math.abs(p-cur)>5000)].sort((a,b)=>a-b);

  let h=`<div style="display:flex;align-items:center;justify-content:center;gap:.6rem;margin-bottom:1rem">`;
  h+=`<label style="font-size:.75rem;color:var(--text3)">BTC Price</label>`;
  h+=`<select id="projBtcSelect" onchange="updateProjCell()">`;
  for(const p of opts){
    const lbl=p===cur?'$'+(p/1000).toFixed(1)+'K (Live)':p>=1000?'$'+(p/1000).toFixed(0)+'K':'$'+p;
    h+=`<option value="${p}"${p===cur?' selected':''}>${lbl}</option>`;
  }
  h+=`</select></div>`;
  h+=`<div id="projSingleCell" style="display:flex;justify-content:center"></div>`;
  return h;
}

function moAtBTC(P,bp,gmtScale){
  // Monthly income for state P at a given BTC price. Staking income is GMT-priced,
  // so it scales with the GMT price (which we move with BTC, same ratio).
  const f=fees(Math.max(0.0001,P.th),P.wth||15,bp);
  const dfees=f.t*(1-(P.totD||0)/100);
  const netBTC=((P.grossBTC||0)-dfees)*(1-CONVERSION_FEE);
  // Greedy free-growth income is a USD TH-credit value (BTC-independent) — add it flat.
  const daily=Math.max(0,netBTC*bp)+(P.stakingMo||0)*(gmtScale||1)/30+(P.ambMo||0)/30+(P.greedyMo||0)/30;
  return{daily,mo:daily*30};
}
function updateProjCell(){
  const p=window._projParams;
  if(!p)return;
  const sel=document.getElementById('projBtcSelect');
  const bp=parseFloat(sel.value);
  const isLive=bp===p.cur;
  // GMT tracks BTC. Fit a line through (live BTC, live GMT) and the observed
  // anchor (BTC $120k -> GMT $0.52); GMT-denominated staking scales by that.
  let gmtScale=1;
  if(p.gp>0&&p.cur>0){
    if(Math.abs(GMT_ANCHOR_BTC-p.cur)>1){
      const slope=(GMT_ANCHOR_GMT-p.gp)/(GMT_ANCHOR_BTC-p.cur);
      gmtScale=Math.max(0,p.gp+(bp-p.cur)*slope)/p.gp;
    }else{gmtScale=bp/p.cur;}
  }
  // After investment
  const after=moAtBTC({th:p.th,wth:p.wth,totD:p.totD,grossBTC:p.grossBTC,stakingMo:p.moStakingUSD,ambMo:p.moAmbUSD,greedyMo:p.greedyMoUSD},bp,gmtScale);
  // Current (before)
  const before=p.curP?moAtBTC(p.curP,bp,gmtScale):{daily:0,mo:0};
  const uplift=before.mo>0?(after.mo-before.mo)/before.mo*100:0;
  const tag=isLive?'LIVE':'SIMULATED';
  const tagCol=isLive?'var(--green)':'var(--orange)';
  let h=`<div class="proj-ba">`;
  h+=`<div class="proj-cell ba-cell"><div class="ba-label">Current</div><div class="pc-monthly">${fU(before.mo,0)}</div><div class="pc-daily">${fU(before.daily)}/day</div></div>`;
  h+=`<div class="ba-arrow"><div class="ba-arrow-ico">&rarr;</div><div class="ba-uplift">${uplift>=0?'+':''}${fN(uplift,0)}%</div></div>`;
  h+=`<div class="proj-cell current ba-cell"><span class="pc-tag" style="background:${tagCol}">${tag}</span><div class="ba-label">After Investment</div><div class="pc-monthly green">${fU(after.mo,0)}</div><div class="pc-daily">${fU(after.daily)}/day</div></div>`;
  h+=`</div>`;
  document.getElementById('projSingleCell').innerHTML=h;
}

function flipProjCell(el){
  const mode=el.dataset.mode;
  const moUSD=parseFloat(el.dataset.moUsd);
  const dailyUSD=parseFloat(el.dataset.dailyUsd);
  const yearlyUSD=parseFloat(el.dataset.yearlyUsd);
  const moGMT=parseFloat(el.dataset.moGmt);
  const dailyGMT=parseFloat(el.dataset.dailyGmt);
  const yearlyGMT=parseFloat(el.dataset.yearlyGmt);
  const moEl=el.querySelector('.pc-monthly');
  const dayEl=el.querySelector('.pc-daily');
  const yrEl=el.querySelector('.pc-yearly');
  const tagEl=el.querySelector('.pc-mode-tag');
  if(mode==='usd'){
    el.dataset.mode='gmt';
    moEl.innerHTML=fN(moGMT,0)+' <img src="/gmt36.png" class="gmt-logo" alt="GMT">';
    dayEl.innerHTML=fN(dailyGMT,0)+' <img src="/gmt36.png" class="gmt-logo" alt="GMT">/day';
    if(yrEl)yrEl.innerHTML=fN(yearlyGMT,0)+' <img src="/gmt36.png" class="gmt-logo" alt="GMT">/yr';
    tagEl.innerHTML='<img src="/gmt36.png" alt="GMT" style="height:16px;width:16px;border-radius:4px;vertical-align:middle">';
    tagEl.style.color='';
  }else{
    el.dataset.mode='usd';
    moEl.textContent=fU(moUSD);
    dayEl.textContent=fU(dailyUSD)+'/day';
    if(yrEl)yrEl.textContent=fU(yearlyUSD)+'/yr';
    tagEl.textContent='USD';
    tagEl.style.color='';
  }
}

// The Greedy Machines actually owned, one entry per NFT. The Greedy inputs hold a single
// total (auto-filled from the fleet), which would blend two real machines into one — and a
// machine's 5,000 TH cap and its efficiency upgrade both belong to that machine alone. So read
// the per-miner fleet where it agrees with the entered total, and fall back to the aggregate
// when the user typed their own number and there's no fleet detail to trust.
function ownedGreedyMachines(gthTot,gwthAvg,gInitTot){
  if(!(gthTot>0))return [];
  const rows=(window.GMTFleetRows||[]).filter(r=>/greedy/i.test(r.collection||'')&&(+r.th||0)>0);
  const sum=rows.reduce((s,r)=>s+(+r.th||0),0);
  const code=r=>r&&r.code?('#'+String(r.code)):'';
  if(rows.length&&sum>0&&Math.abs(sum-gthTot)<=Math.max(1,gthTot*0.02)){
    // gInit is entered for the greedy fleet as a whole — split it by size across the machines.
    return rows.map(r=>({th:+r.th||0,wth:(+r.wth>0?+r.wth:(gwthAvg||15)),init:gInitTot*((+r.th||0)/sum),code:code(r)}));
  }
  return [{th:gthTot,wth:gwthAvg||15,init:gInitTot,code:rows.length===1?code(rows[0]):''}];
}

// Shared solver: produces the post-investment state used by both the
// Capital Planner and the Reinvest Growth Projection. Keeping these in sync
// means "Monthly Income by BTC (LIVE)" matches the Reinvest's day-1 baseline.
function solvePlannerAllocation(i, bp, gp, dbt){
  let usdCap=i.cap;
  // Marketplace miner: a specific miner the user plans to buy off the GoMining
  // marketplace. Its hashrate earns rewards and incurs fees, but does NOT count
  // toward the VIP tier (terahash bonus) — so it never lifts the tier .d discount.
  const mpTHraw=Math.max(0,i.mpTH||0);
  let mpTH=mpTHraw;
  let mpWth=mpTH>0?(i.mpWth>0?i.mpWth:15):0;
  const mpGmtCost=mpTHraw>0?Math.max(0,i.mpGMT||0):0;
  // Greedy Machine: existing owned TH — earns rewards + pays fees, never VIP-eligible.
  // Reinvestment grows it (greedy-first, up to 5k) inside the projection, not here.
  let gth0=Math.max(0,i.gth||0);
  let gwth0=gth0>0?(i.gwth>0?i.gwth:15):0;
  let gInit=Math.min(Math.max(0,i.gInit||0),gth0);   // initial marketplace greedy — never VIP-eligible
  // A marketplace miner flagged as greedy is re-homed into the greedy fleet: from here on it is
  // greedy hashrate, so it inherits free weekly growth, greedy-first reinvestment and the 5k cap
  // for nothing extra. Its GMT price is already fixed above, so the purchase still bills.
  const mpIsGreedy=!!i.mpGreedy&&mpTHraw>0;
  // A Greedy Machine's free weekly TH inherits ITS OWN rating, so buying one worse than the
  // 15 W baseline compounds that handicap for as long as you own it — every free TH it ever
  // grows arrives at the bad rating. So the upgrade to 15 W is paid FIRST, off the top, before
  // a dollar reaches hashrate or lock.
  // Note effUpgradeCostPerTH() prices anything at or above 15 AS 15 (that is the GoMining
  // upgrade path this app models), so it cannot price the leg above 15 at all. This leg is
  // charged at the same per-W-step rate the rest of the model uses.
  const mpWthBought=mpWth;
  const mpUpgSteps=(mpIsGreedy&&mpWth>EFF_BASE_MAX)?(mpWth-EFF_BASE_MAX):0;
  const mpUpgUSD=mpUpgSteps>0?mpUpgSteps*EFF_UPGRADE_STEP*mpTHraw:0;
  if(mpUpgSteps>0)mpWth=EFF_BASE_MAX;   // the fleet below is built from the UPGRADED machine
  const mpWthPlanned=mpWth;             // captured now: mpWth is zeroed once the miner is re-homed
  // The greedy fleet as SEPARATE NFTs. Each machine owns its efficiency and its own 5,000 TH
  // cap, so a second one must never be averaged into the first: blending would hand the pair a
  // single shared cap and a single upgrade target. They are summed only for fees, rewards and
  // the VIP basis, all of which are linear in TH (and in TH x W/TH), where a sum is exact.
  const GRD0=ownedGreedyMachines(gth0,gwth0,gInit);
  // bought, not minted ⇒ outside the VIP basis, and a distinct NFT from anything already owned
  if(mpIsGreedy)GRD0.push({th:mpTHraw,wth:mpWth,init:mpTHraw,code:(i.mpCode?('#'+String(i.mpCode).replace(/^#/,'')):'the miner you\u2019re buying')});
  const gSum=l=>l.reduce((s,m)=>s+m.th,0);
  const gWattSum=l=>l.reduce((s,m)=>s+m.th*m.wth,0);
  const gAvgW=l=>{const t=gSum(l);return t>0?gWattSum(l)/t:15;};
  if(mpIsGreedy){
    gth0=gSum(GRD0);gwth0=gAvgW(GRD0);gInit=GRD0.reduce((s,m)=>s+m.init,0);
    mpTH=0;mpWth=0;
  }
  // Spend a TH budget across the greedy machines, biggest first — the cheapest marginal tier —
  // each stopping at its OWN cap and priced on its OWN efficiency curve.
  function fillGreedy(budgetUSD){
    const add=GRD0.map(()=>0);
    let left=Math.max(0,budgetUSD);
    const order=GRD0.map((m,ix)=>({ix,m})).sort((a,b)=>b.m.th-a.m.th);
    for(const o of order){
      const room=Math.max(0,GREEDY_CAP-o.m.th);
      if(room<=0||left<=0)continue;
      const tiers=(o.m.wth<=EFF_BEST+1e-6)?TH_TIERS_12W:TH_TIERS;
      const a=Math.min(room,thToGrowTiers(o.m.th,left,tiers));
      if(a<=0)continue;
      add[o.ix]=a;left=Math.max(0,left-costToGrowTiers(o.m.th,a,tiers));
    }
    const tot=add.reduce((s,v)=>s+v,0);
    // Added TH inherits the machine it lands on — a 15 W greedy grows by 15 W TH.
    const watts=add.reduce((s,v,ix)=>s+v*GRD0[ix].wth,0);
    return {add,left,tot,watts};
  }
  // The model as the planner sees it: identical to `i` except the flagged miner now sits in the
  // greedy fields, so computeEffPlan builds the same farm the projection will run.
  const iP=mpIsGreedy?Object.assign({},i,{gth:gth0,gwth:gwth0,gInit,mpTH:0,mpWth:0,mpWthUpgraded:mpWth}):i;
  // VIP 10% bonus disabled — GoMining is not currently offering this promo.
  // Stale localStorage entries with piVipBonus=true must NOT silently grant it.
  const vipBonus=false;
  const VIP_BONUS_MIN=10000, VIP_BONUS_MULT=1.10;
  const REF_GMT_BONUS=(i.refBonusPct>0?i.refBonusPct:5)/100; // ambassador tier commission on referral's TH spend, paid in GMT (user-editable)

  function solveReferral(refCap){
    if(refCap<=0)return null;
    const COV=360;
    function refSolve(gmtUSD){
      const ag=gmtUSD*(1-USD_GMT_FEE)/gp, thUSD=refCap-gmtUSD;
      const at=thUSD>0?thForBudget12(thUSD*(1-USD_GMT_FEE)):0;
      const fT=fees(at||1,EFF_BEST,bp);   // a referral's capital mints a new machine ⇒ 12 W/TH
      const vT=vipOf(at,ag);
      const ntd=Math.min(30,vT.d+(i.click?3:0)+(i.mm||0));
      const burn=(fT.t*(1-ntd/100)*bp)/gp;
      return{deficit:Math.max(0,burn*COV-ag),at,ag,thUSD};
    }
    let bGU=0;
    if(i.payG&&refSolve(0).deficit>0){
      let lo=0,hi=refCap;
      for(let k=0;k<50;k++){const mid=(lo+hi)/2;if(refSolve(mid).deficit<=0)hi=mid;else lo=mid;}
      bGU=hi;
    }
    return refSolve(bGU);
  }
  const ref=solveReferral(i.refCap);
  const refBonusGMT=ref?(ref.thUSD*REF_GMT_BONUS)/gp:0;
  const refBonusUSD=refBonusGMT*gp;

  const baseGmtAvail=i.gw;
  const gmtAvailPre=baseGmtAvail+refBonusGMT;
  // Pay for the marketplace miner: GMT on hand first, then USD capital for the shortfall.
  const gmtForMiner=Math.min(mpGmtCost,gmtAvailPre);
  const usdForMiner=(mpGmtCost-gmtForMiner)*gp/(1-USD_GMT_FEE);
  const minerShortfallUSD=Math.max(0,usdForMiner-usdCap);
  let gmtAvail=gmtAvailPre-gmtForMiner;
  usdCap=Math.max(0,usdCap-usdForMiner);
  // Off the top, straight after the miner itself: bring it to 15 W before anything is optimized.
  // It is a cost like any other, so it draws on the same two pockets in the same order the rest
  // of the plan does — USD capital first, then GMT on hand at face value (existing GMT is
  // already GMT; only deployed USD pays the conversion fee). Charging it to USD alone reported a
  // shortfall for anyone holding their capital as GMT, which is the normal case here: the
  // planner is fed from a GoMining wallet, and USD capital is the optional field.
  const mpUpgFromUSD=Math.min(mpUpgUSD,usdCap);
  usdCap-=mpUpgFromUSD;
  const mpUpgRemUSD=mpUpgUSD-mpUpgFromUSD;
  const mpUpgFromGMT=(gp>0)?Math.min(gmtAvail,mpUpgRemUSD/gp):0;
  gmtAvail-=mpUpgFromGMT;
  const mpUpgShortfallUSD=Math.max(0,mpUpgRemUSD-mpUpgFromGMT*gp);
  const totalValue=usdCap+(gmtAvail*gp);
  if(totalValue<=0&&mpTHraw<=0)return null;

  const covNeeded=360; // 20 steps * 18 days/step (GoMining's actual)

  // VIP-only blended efficiency (existing farm + freshly minted TH, which is 12 W/TH only).
  function vipBlendWTH(addTH){return(i.th>0||addTH>0)?(i.th*i.wth+addTH*EFF_BEST)/(i.th+addTH):i.wth}
  // Total blended efficiency including the marketplace miner — drives fees.
  // addTH = freshly minted hashrate (12 W by definition). addG = hashrate added to the greedy,
  // which inherits THAT machine's rating — a 15 W greedy grows by 15 W TH, it does not self-heal.
  function blendWTH(addTH,addG,addGWatts){
    const aG=Math.max(0,addG||0);
    const tot=i.th+addTH+mpTH+gth0+aG;
    const gWatts=(gth0*gwth0)+(addGWatts!=null?addGWatts:aG*gwth0);
    return tot>0?(i.th*i.wth+addTH*EFF_BEST+mpTH*mpWth+gWatts)/tot:i.wth;
  }

  let reserveNeeded=0;
  function calcReserve(totFeeTH,vipBasis,lockedGMT){
    if(!i.payG)return 0;
    // newMinted = all TH beyond the existing farm + existing greedy + marketplace,
    // i.e. the freshly minted TH (standalone + greedy upgrades), all at 15 W/TH.
    const newMinted=Math.max(0,totFeeTH-i.th-gth0-mpTH);
    const bw=blendWTH(newMinted);
    const rf=fees(totFeeTH||1,bw||15,bp);
    const rd=Math.min(30,(vipOf(vipBasis,lockedGMT).d)+(i.click?3:0)+(i.mm||0));
    const dailyFeeGMT=(rf.t*(1-rd/100)*bp)/gp;
    reserveNeeded=dailyFeeGMT*2;
    return Math.min(reserveNeeded,gmtAvail);
  }

  function solveWithReserve(reserve){
    const deployable=Math.max(0,gmtAvail-reserve);
    const maxLockGMT=deployable+(usdCap*(1-USD_GMT_FEE)/gp);

    function solveAlloc(totalGmtLock){
      const fromPool=Math.min(totalGmtLock,deployable);
      const fromUSD=totalGmtLock-fromPool;
      const usdSpentOnGMT=fromUSD*gp/(1-USD_GMT_FEE);
      const gmtSell=deployable-fromPool;
      // Leftover USD routes through GMT to mint TH, so it eats the 2% fee too;
      // existing pool GMT (gmtSell) is already GMT, so it's spent at face value.
      const thBudgetUSD=(usdCap-usdSpentOnGMT)*(1-USD_GMT_FEE)+(gmtSell*gp);
      // Greedy-first: the capital's TH budget fills an owned greedy machine up to 5k (non-VIP)
      // before minting VIP-eligible TH. A miner carries ONE efficiency rating, so hashrate added
      // to a 15 W greedy is 15 W hashrate and prices off the 15 W curve — cheaper per TH, but it
      // leaves the machine at 15 W. Only a greedy already at 12 W takes 12 W TH. This used to buy
      // the whole budget at 12 W prices and then pour part of it into a 15 W machine, which both
      // overstated the price per greedy TH and reported the farm as more efficient than it is.
      const gFill=fillGreedy(thBudgetUSD);
      const addGreedy=gFill.tot, addGreedyWatts=gFill.watts, gAdds=gFill.add;
      let thLeftUSD=addGreedy>0?gFill.left:thBudgetUSD;
      // Whatever is left mints fresh 12 W hashrate, topping up other 12 W miners first.
      const baseVipTH=thLeftUSD>0?thForBudgetFromSizes(thLeftUSD,existingMinerSizes(false),TH_TIERS_12W):0;
      const bonusActive=vipBonus&&thBudgetUSD>=VIP_BONUS_MIN;
      const addVip=bonusActive?baseVipTH*VIP_BONUS_MULT:baseVipTH;
      const baseTH=addGreedy+baseVipTH;
      const atTest=addGreedy+addVip;
      const bonusTH=atTest-baseTH;
      const greedyTot=gth0+addGreedy;
      const feeTH=i.th+addVip+greedyTot+mpTH;                 // total hashrate (fees + rewards)
      const vipTH=i.th+addVip+Math.max(0,greedyTot-gInit);   // VIP basis: all but initial mkt greedy + mpTH
      const totalLocked=i.gl+totalGmtLock;
      const walletAfter=reserve;
      const bwth=blendWTH(addVip,addGreedy,addGreedyWatts);
      const fTest=fees(feeTH,bwth,bp);
      const vTest=vipOf(vipTH,totalLocked);
      const ntkD=Math.min(30,vTest.d+(i.click?3:0)+i.mm+i.od);
      const burnGMT=(fTest.t*(1-ntkD/100)*bp)/gp;
      const needed=burnGMT*covNeeded;
      return{needed,have:totalLocked,deficit:Math.max(0,needed-totalLocked),at:atTest,nt:feeTH,
        addGreedy,addVip,greedyTot,
        fromPool,fromUSD,usdSpentOnGMT,gmtSell,thBudgetUSD,baseTH,bonusActive,bonusTH};
    }
    let lock=0;
    if(i.payG){
      const check0=solveAlloc(0);
      if(check0.deficit>0){
        let lo=0,hi=maxLockGMT;
        for(let k=0;k<50;k++){const mid=(lo+hi)/2;if(solveAlloc(mid).deficit<=0)hi=mid;else lo=mid;}
        lock=Math.min(hi,maxLockGMT);
      }
    }
    const r=solveAlloc(lock);
    return{lock,fromPool:r.fromPool,fromUSD:r.fromUSD,usdSpentOnGMT:r.usdSpentOnGMT,
      sell:r.gmtSell,deployable,addTH:r.at,thUSD:r.thBudgetUSD,
      baseTH:r.baseTH,bonusActive:r.bonusActive,bonusTH:r.bonusTH,
      addGreedy:r.addGreedy,addGreedyWatts:r.addGreedyWatts,gAdds:r.gAdds,addVip:r.addVip,greedyTot:r.greedyTot,
      finalFeeTH:i.th+r.addVip+r.greedyTot+mpTH,
      finalVipBasis:i.th+r.addVip+Math.max(0,r.greedyTot-gInit),
      finalTH:i.th+r.at,finalLocked:i.gl+lock};
  }

  // Three-pass convergence: reserve depends on final TH, final TH depends on reserve.
  let gmtReserve=calcReserve(i.th+gth0+mpTH,i.th+Math.max(0,gth0-gInit),i.gl);
  let sol=solveWithReserve(gmtReserve);
  gmtReserve=calcReserve(sol.finalFeeTH,sol.finalVipBasis,sol.finalLocked);
  sol=solveWithReserve(gmtReserve);
  gmtReserve=calcReserve(sol.finalFeeTH,sol.finalVipBasis,sol.finalLocked);
  sol=solveWithReserve(gmtReserve);

  const greedyTot=sol.greedyTot!=null?sol.greedyTot:gth0;
  const addGreedy=sol.addGreedy||0;
  // Adding TH to a miner never changes that miner's W/TH rating, so each greedy keeps the
  // efficiency it owns — the fleet average only moves because the machines grew unevenly.
  const greedyList=GRD0.map((m,ix)=>({th:m.th+((sol.gAdds&&sol.gAdds[ix])||0),wth:m.wth,init:m.init,code:m.code||''}));
  const greedyWthAfter=gAvgW(greedyList);
  const addVip=sol.addVip!=null?sol.addVip:sol.addTH;
  const vipStandalone=i.th+addVip;     // non-greedy VIP TH — the projection's compounding base
  const vipTH=i.th+addVip+Math.max(0,greedyTot-gInit); // VIP tier basis (excl. initial mkt greedy + mpTH)
  const nt=i.th+addVip+greedyTot+mpTH; // total hashrate for rewards + fees
  const newLocked=i.gl+sol.lock;
  const bwth=blendWTH(addVip,addGreedy,sol.addGreedyWatts);   // minted TH at 12 W, greedy top-up at its own machine's rating
  const vipWth=vipBlendWTH(addVip);    // VIP-only blend (standalone), for the reinvest sim
  const newF=fees(nt,bwth,bp);
  const nv=vipOf(vipTH,newLocked);     // tier from VIP-eligible TH only
  const newNonTokD=Math.min(30,nv.d+(i.click?3:0)+i.mm+i.od);
  const newDailyBurnGMT=(newF.t*(1-newNonTokD/100)*bp)/gp;
  const gmtNeededNew=newDailyBurnGMT*covNeeded;
  const covAfter=newDailyBurnGMT>0?newLocked/newDailyBurnGMT:Infinity;
  const ntd=i.payG?Math.min(20,Math.floor(covAfter/18)):0;
  const td2=Math.min(30,ntd+newNonTokD);
  const canCover20=ntd>=20;
  const gmtShortfall=Math.max(0,gmtNeededNew-newLocked);

  return{
    sol, ref, refBonusGMT, refBonusUSD, baseGmtAvail, gmtAvail, totalValue,
    gmtReserve, reserveNeeded,
    nt, newLocked, bwth, newF, nv, newNonTokD, newDailyBurnGMT,
    gmtNeededNew, covAfter, ntd, td2, canCover20, gmtShortfall,
    vipBonus, VIP_BONUS_MIN, VIP_BONUS_MULT, REF_GMT_BONUS,
    vipTH, vipWth, mpTH, mpWth, mpGmtCost, gmtForMiner, usdForMiner, minerShortfallUSD, usdCapAfter:usdCap,
    iP, mpIsGreedy, mpTHraw, mpWthRaw:(mpTHraw>0?(i.mpWth>0?i.mpWth:15):0),
    mpWthBought, mpWthAfter:mpWthPlanned, mpUpgSteps, mpUpgUSD, mpUpgShortfallUSD,
    mpUpgFromUSD, mpUpgFromGMT,
    gth:gth0, gInit, gwth:gwth0, ggrow:i.ggrow||0, greedyTot, gwthAfter:greedyWthAfter, addGreedy, vipStandalone,
    greedyList
  };
}

// Side-by-side comparison: spend the next chunk of capital on efficiency vs hashrate vs discount.
// Persistent shell: title + the per-miner upgrade input + an empty body the input refreshes.
// 12 W/TH is the floor — nothing can be upgraded below it. Only surface the efficiency option
// when something actually sits above it: the existing VIP farm, or a greedy machine.
function hasEffRoom(i){
  if(!i)return false;
  const gwth=(i.gth>0)?(i.gwth>0?i.gwth:EFF_BASE_MAX):0;
  return (i.th>0&&i.wth>EFF_BEST+1e-6)||(i.gth>0&&gwth>EFF_BEST+1e-6);
}
// The eff-plan state implied by a solved allocation. ONE builder, so the planner, the
// target-income solver and My Setup's idle-GMT card all describe the same plan.
function effStateFrom(i,a,gp,bp){
  if(!a||!a.sol)return null;
  const usdToTH=a.usdCapAfter-a.sol.usdSpentOnGMT;
  return {i:(a.iP||i),K:a.totalValue,gp,bp,
    lockUSD:a.sol.usdSpentOnGMT+a.sol.fromPool*gp, glAdd:a.sol.lock,
    thUSD:usdToTH+a.sol.sell*gp, addTH:a.sol.addTH, mpTH:a.mpTH, mpWth:a.mpWth};
}
function effCompareShell(i){
  const t=hasEffRoom(i)?'Efficiency vs. Hashrate vs. Discount':'Hashrate vs. Discount';
  return `<div class="sub-title" style="margin-top:1rem">${t}</div><div id="effCompareBody"></div>`;
}
// Populate the comparison body (called once after the planner renders).
function updateEffCompare(){
  const st=window._effCmp;if(!st)return;
  const body=document.getElementById('effCompareBody');
  if(body)body.innerHTML=renderEfficiencyComparison(st);
}

// Capital split — driven by the planner's solver (Lock GMT vs Buy TH, consistent with the
// Resource Breakdown), with an Upgrade-Efficiency overlay that only takes funds when upgrading
// the whole existing farm to 12 W/TH yields more than buying new hashrate.
// Single source of truth for the "deploy this capital" plan: the Lock GMT / Buy TH split
// from the solver PLUS the Upgrade-Efficiency overlay (whole-farm, or greedy-prerequisite).
// Returns the greedy-, efficiency- and marketplace-inclusive totals so the allocation cards,
// the "New hashrate" row and the post-investment projection all agree on ONE plan.
function computeEffPlan(st){
  const i=st.i, K=st.K, gp=st.gp, bp=st.bp;
  if(!i||!(K>0))return null;
  const cf=CONVERSION_FEE, dbt=dailyBTCperTH(), _m0=calc(i), d=_m0.totD/100, nonTokD=(_m0.nonTokD||0)/100;
  let lockUSD=Math.max(0,st.lockUSD||0), thUSD=Math.max(0,st.thUSD||0);
  const thUSD0=thUSD, glAdd=Math.max(0,st.glAdd||0);
  let addTH=Math.max(0,st.addTH||0);
  const mpTH=Math.max(0,st.mpTH||0), mpWth=(+st.mpWth||EFF_BASE_MAX);   // marketplace miner — part of the resulting farm
  // GMT-lock capital freed per TH by upgrading to 12 W/TH. The lock for max discount is
  // 20×18 = 360 days of fee coverage; a lower fee (from better efficiency) needs less
  // coverage, so upgrading returns real capital — worth ~$1.24/TH at 15→12 W.
  const lockFreedPerTH=(i.wth>EFF_BEST)?(18*20)*(0.0012*(i.wth-EFF_BEST))*(1-nonTokD):0;

  // Efficiency overlay: if the existing farm is above 12 W/TH and upgrading it yields more per
  // dollar than buying new TH, divert that slice of the TH budget into the upgrade (whole farm).
  let effUSD=0, effTHupg=0, upgradeROI=0, newThROI=0;
  const effRoom=hasEffRoom(i);   // false ⇒ everything is already at 12 W/TH; never offer the upgrade
  if(effRoom && i.th>0 && i.wth>EFF_BEST && thUSD>0){
    const cptU=effUpgradeCostPerTH(i.wth);
    const cptUnet=Math.max(0.01,cptU-lockFreedPerTH);   // net of the freed GMT-lock capital
    const cap=i.th;   // the whole existing farm is upgradeable (per-machine cap doesn't limit the total)
    if(cptU>0 && cap>0){
      const savedMo=cap*0.0012*(i.wth-EFF_BEST)*(1-d)*(1-cf)*30;   // $/TH/day electricity saving is already USD — no ×bp
      upgradeROI=savedMo*12/(cap*cptUnet);   // ROI on the NET cost (saves fees AND frees GMT-lock capital)
      const cptTH=estimateCPT12((i.th+addTH)||1);   // alternative is MINTING new 12 W TH
      const thNetMo=(dbt*bp-(0.0012*EFF_BEST+0.0089)*(1-d))*(1-cf)*30;
      newThROI=cptTH>0?thNetMo*12/cptTH:0;
      if(upgradeROI>newThROI){
        const upgradeCost=cap*cptU;
        effUSD=Math.min(thUSD,upgradeCost);
        effTHupg=effUSD/cptU;
        thUSD-=effUSD;
      }
    }
  }
  // A Greedy Machine is a genuine special case: its free weekly TH inherits the machine's
  // W/TH, so upgrading it early makes every future free TH cheaper to run for good. That
  // argument is real — but it used to be applied with NO comparison whatsoever, diverting
  // the hashrate budget into the upgrade however poor the return. It now has to win the
  // same test the whole-farm overlay does, with its expected growth credited to it: the
  // saving accrues on the grown machine, while the upgrade is only paid for once.
  if(effUSD<=0 && thUSD>0){
    const gr=(window.GMTFleetRows||[]).filter(r=>/greedy/i.test(r.collection||'')&&(+r.th||0)>0&&(+r.th||0)<MINER_CAP&&(+r.wth||15)>EFF_BEST).sort((a,b)=>b.th-a.th)[0];
    if(gr){
      const gwth=+gr.wth||EFF_BASE_MAX, gth=+gr.th||0;
      const gCptU=effUpgradeCostPerTH(gwth);
      if(gCptU>0&&gth>0){
        const gGrow=(+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0)/100;   // free growth, fraction/wk
        // Mean TH across the next year at weekly compounding — the base the saving really lands on.
        const grownAvg=gGrow>0?gth*((Math.pow(1+gGrow,52)-1)/(52*gGrow)):gth;
        const gLockFreed=(18*20)*(0.0012*(gwth-EFF_BEST))*(1-nonTokD);
        const gCptUnet=Math.max(0.01,gCptU-gLockFreed);
        const gSavedYrPerTH=0.0012*(gwth-EFF_BEST)*(1-d)*(1-cf)*30*12;
        const gROI=(gSavedYrPerTH*grownAvg)/(gth*gCptUnet);
        const cptTHg=estimateCPT12((i.th+addTH)||1);
        const thNetMoG=(dbt*bp-(0.0012*EFF_BEST+0.0089)*(1-d))*(1-cf)*30;
        const thROIg=cptTHg>0?thNetMoG*12/cptTHg:0;
        if(gROI>thROIg){
          const gEff=Math.min(thUSD,gth*gCptU);
          effUSD+=gEff; effTHupg+=gEff/gCptU; thUSD-=gEff;
        }
      }
    }
  }
  if(thUSD0>0)addTH=addTH*thUSD/thUSD0;   // fewer TH bought once efficiency takes a slice

  const tot=lockUSD+thUSD+effUSD;

  // Rebuild the WHOLE farm. i.th/i.wth describe only the NON-greedy portion; the greedy
  // (i.gth @ i.gwth) is a separate component that calc() re-adds internally. Include the
  // marketplace miner (mpTH @ mpWth) so the resulting total matches the projection.
  const _greedy=(window.GMTFleetRows||[]).filter(r=>/greedy/i.test(r.collection||'')&&(+r.th||0)>0&&(+r.th||0)<MINER_CAP).sort((a,b)=>b.th-a.th)[0];
  const gthv=Math.max(0,i.gth||0), gwthv=gthv>0?(i.gwth>0?i.gwth:15):0;
  const gCode=_greedy?(_greedy.code?`#${escapeHtml(String(_greedy.code))}`:'your greedy machine'):(gthv>0?'your greedy machine':'');
  const addG=gthv>0?Math.min(Math.max(0,MINER_CAP-gthv),addTH):0;   // TH that grows the greedy
  const addNew=Math.max(0,addTH-addG);                              // TH needing a fresh 12 W machine
  const effIsGreedy=gthv>0&&gwthv>EFF_BEST&&effTHupg>0.5&&effTHupg<=gthv+1;
  const gUpg=effIsGreedy?Math.min(gthv,effTHupg):0, ngUpg=effIsGreedy?0:Math.min(i.th,effTHupg);
  const ngWatts=(i.th-ngUpg)*i.wth+ngUpg*EFF_BEST+addNew*EFF_BEST, ngTHf=i.th+addNew, ngWthf=ngTHf>0?ngWatts/ngTHf:i.wth;
  // One efficiency per NFT: hashrate added to the greedy inherits the rating that machine has
  // AFTER whatever upgrade this plan pays for — 15 W if the upgrade was gated out. Counting it
  // as 12 W was what made the farm average read better than the farm actually is.
  const gWthAfter=gthv>0?((gthv-gUpg)*gwthv+gUpg*EFF_BEST)/gthv:EFF_BEST;
  const gWatts=(gthv+addG)*gWthAfter, gTHf=gthv+addG, gWthf=gTHf>0?gWatts/gTHf:gwthv;
  const curTH=i.th+gthv, curWth=curTH>0?(i.th*i.wth+gthv*gwthv)/curTH:i.wth;
  const finTH=curTH+addTH+mpTH, finWth=finTH>0?(ngWatts+gWatts+mpTH*mpWth)/finTH:curWth;

  const baseMo=calc(i).net*bp*30;
  const newMo=calc({...i,th:ngTHf,wth:ngWthf,gth:gTHf,gwth:gWthf,gl:i.gl+glAdd}).net*bp*30 + glAdd*(i.apr||0)/100/12*gp;
  const totalMo=newMo-baseMo, roiB=totalMo>0?totalMo*12/K*100:0;

  // BTC-price threshold below which upgrading the WHOLE FARM out-yields buying TH.
  let effThreshBp=null;
  if(i.th>0 && i.wth>EFF_BEST){
    const cptU=Math.max(0.01,effUpgradeCostPerTH(i.wth)-lockFreedPerTH);
    if(cptU>0){
      const M=0.0012*EFF_BEST+0.0089, cptTH=estimateCPT12((i.th+addTH)||1);
      const bpStar=(M*(1-d)+cptTH*0.0012*(i.wth-EFF_BEST)*(1-d)/cptU)/dbt;
      if(isFinite(bpStar)&&bpStar>0)effThreshBp=bpStar;
    }
  }
  return {i,K,gp,bp,cf,dbt,d,nonTokD,lockUSD,thUSD,glAdd,addTH,mpTH,mpWth,effUSD,effTHupg,effRoom,tot,
    _greedy,gthv,gwthv,gWthAfter,gCode,addG,addNew,effIsGreedy,curTH,curWth,ngTHf,ngWthf,gTHf,gWthf,finTH,finWth,totalMo,roiB,effThreshBp};
}

function renderEfficiencyComparison(st){
  if(!st)return '';
  const P=computeEffPlan(st);
  if(!P||P.tot<=0)return '';
  const {i,K,gp,bp,cf,dbt,d,lockUSD,thUSD,glAdd,addTH,effUSD,effTHupg,effRoom,tot,
    gthv,gwthv,gCode,addG,addNew,effIsGreedy,curWth,finTH,finWth,totalMo,roiB,effThreshBp}=P;
  const effGauge=(thresh,now)=>{
    const hi=Math.max(thresh,now)*1.4||1;
    const tPos=Math.min(100,thresh/hi*100), nPos=Math.max(2,Math.min(98,now/hi*100)), winning=now<=thresh;
    return `<div class="eff-gauge"><div class="eff-gauge-bar"><div class="eff-gauge-win" style="width:${tPos}%"></div><div class="eff-gauge-now" style="left:${nPos}%"><span>now ${fU(now,0)}</span></div></div>`
      +`<div class="eff-gauge-lbl">${winning?'<b style="color:var(--green)">Worth it now</b> &middot; ':''}upgrade wins under <b>${fU(thresh,0)}</b> BTC</div></div>`;
  };

  let h=`<div class="eff-verdict">`;
  h+=`<div class="eff-verdict-main">Optimal split of your ${fU(K,0)} <span class="eff-verdict-roi">+${fU(totalMo,0)}/mo · ${fN(roiB,0)}%/yr</span></div>`;
  h+=`<div class="eff-verdict-sub">${effRoom
    ?'Balances locking GMT (to hold your 20% discount), buying hashrate, and efficiency upgrades — adding TH without locking would drop your coverage, so the two are balanced.'
    :'Balances locking GMT (to hold your 20% discount) against buying hashrate — adding TH without locking would drop your coverage, so the two are balanced. Your miners are already at 12 W/TH, the best efficiency available, so there is nothing to upgrade.'}</div>`;
  h+=`</div>`;

  const lockPct=lockUSD/tot*100, thPct=thUSD/tot*100, effPct=effUSD/tot*100;
  const _greedyNeedsEff=gthv>0&&gwthv>EFF_BEST;
  // Resolve WHERE the hashrate actually goes once, so the plan step, the Buy TH card and the
  // per-miner table below can never name different machines or different watts.
  const _fill=buyFillPlan(addTH), _fs=buyFillSummary(_fill);
  const hasExistingRoom=!!(_fs&&_fs.onExisting);
  const _wLbl=w=>fN(w,Math.abs(w-Math.round(w))>0.05?1:0);

  // Plain-language bottom line — the whole plan as numbered steps, in order.
  const _steps=[];
  if(glAdd>0.5)_steps.push(`Lock ~<strong>${fN(glAdd,0)} GMT</strong> <span class="eff-plainplan-cost">${fU(lockUSD,0)}</span><span class="eff-plainplan-why">holds your 20% fee discount</span>`);
  if(effTHupg>0.5)_steps.push(`Upgrade ~<strong>${fN(effTHupg,0)} TH</strong> to ${fN(EFF_BEST,0)} W/TH <span class="eff-plainplan-cost">${fU(effUSD,0)}</span><span class="eff-plainplan-why">the miners named below</span>`);
  if(addTH>0.5&&_fs){
    const _why=_fs.onExisting
      ? `top up <strong>${_fs.name}</strong> at ${_wLbl(_fs.first.wth)} W — cheaper per TH than a new NFT${_fs.more>0?`, then ${_fs.more} more below`:''}`
      : `mint a new ${fN(EFF_BEST,0)} W machine — you have no miner with room to top up`;
    _steps.push(`Put ~<strong>${fN(thUSD,0)}</strong> into hashrate <span class="eff-plainplan-cost">${fU(thUSD,0)}</span><span class="eff-plainplan-why">${_why}</span>`);
  }
  const _spent=lockUSD+effUSD+thUSD;
  const plain=_steps.length?`<div class="eff-plainplan"><span class="eff-plainplan-lbl">Do this &rarr;</span><ol>${_steps.map(s=>`<li>${s}</li>`).join('')}</ol><div class="eff-plainplan-foot">Total <strong>${fU(_spent,0)}</strong> of your ${fU(K,0)} — each step is a separate part of the one plan, not extra.</div></div>`:'';

  const segs=[[lockPct,'Lock GMT','var(--purple)'],[thPct,'Buy TH','var(--cyan)']];
  if(effRoom)segs.push([effPct,'Upgrade Eff','var(--green)']);
  let bar=`<div class="eff-splitbar">`;
  segs.forEach(([p,l,c])=>{if(p>0.5)bar+=`<div style="width:${p}%;background:${c}" title="${l} ${fN(p,0)}%">${p>=12?fN(p,0)+'%':''}</div>`;});
  bar+=`</div>`;

  const card=(label,p,amt,rows,extra)=>{
    let s=`<div class="eff-card${(p<0.5&&!extra)?' eff-card-dim':''}"><div class="eff-card-h">${label}</div>`;
    s+=`<div class="eff-card-mo">${fN(p,0)}%</div><div class="eff-card-sub2">${fU(amt,0)}</div><div class="eff-card-rows">`;
    rows.forEach(r=>{s+=`<div class="eff-row"><span>${r[0]}</span><span>${r[1]}</span></div>`;});
    s+=`</div>`;
    if(extra)s+=extra;
    return s+`</div>`;
  };
  let g=`<div class="eff-grid${effRoom?'':' eff-grid-2'}">`;
  g+=card('Lock GMT',lockPct,lockUSD,[
    ['Locks',glAdd>0?`+${fN(glAdd,0)} GMT`:'—'],
    ['Effect',lockPct>0.5?'holds 20% discount':'—']
  ]);
  g+=card('Buy TH',thPct,thUSD,[
    ['Adds',(addTH>0&&_fs)?`+${fN(addTH,1)} TH @ ${_wLbl(_fs.wth)}W${_fs.mixed?' avg':''}`:'—'],
    ['Into',(addTH>0&&_fs)?`${_fs.name}${_fs.more>0?` +${_fs.more} more`:''}`:'—']
  ]);
  // The "upgrade wins under $X BTC" gauge frames efficiency as a price-dependent bet vs
  // buying TH — right for a whole-farm upgrade, but NOT for a greedy upgrade, which is a
  // prerequisite to growing the greedy at 12 W (one efficiency per NFT). This branch only
  // fires when the whole-farm upgrade LOST to buying TH, so the gauge would contradict it.
  const effExtra=effIsGreedy
    ? `<div class="eff-gauge-lbl" style="margin-top:.55rem">Required first — one efficiency per NFT, so ${gCode} must reach ${fN(EFF_BEST,0)} W before its new (and free weekly) TH can run at ${fN(EFF_BEST,0)} W.</div>`
    : (effThreshBp?effGauge(effThreshBp,bp):'');
  if(effRoom)g+=card('Upgrade Efficiency',effPct,effUSD,[
    ['Upgrades',effTHupg>0?`${fN(effTHupg,0)} TH → 12 W`:'—'],
    ['Farm avg',effTHupg>0?`${fN(curWth,2)} → ${fN(finWth,2)}`:'—']
  ],effExtra);
  g+=`</div>`;
  // Per-miner upgrade order (by NFT code, greedy first) — shown ONLY when the plan
  // actually allocates to efficiency, so it never contradicts a "buy TH" plan.
  if(effRoom&&effTHupg>0)g+=upgradeOrderHTML(effTHupg);
  // 5,000 TH cap advisory on Buy TH: a single NFT can't exceed 5,000 TH.
  if(addTH>0)g+=buyCapHTML(addTH);
  g+=`<div class="eff-foot">Result: <strong>${fN(finTH,0)} TH</strong> @ ${fN(finWth,2)} W/TH${glAdd>0?`, +${fN(glAdd,0)} GMT locked`:''} &rarr; <strong>+${fU(totalMo,0)}/mo</strong> net.</div>`;
  return h+plain+bar+g;
}

// Which specific miners to upgrade, worst efficiency first, until the budget's TH
// is used up. Reads the per-miner fleet (window.GMTFleetRows).
// budgetTH>0 caps the list to the plan's efficiency-upgrade budget. A non-positive
// budget means "recommend regardless" — list every upgradeable miner at full cost,
// which is what surfaces the greedy-first advice even when the plan bought TH.
function upgradeOrderHTML(budgetTH){
  const isG=r=>/greedy/i.test(r.collection||'');
  const rows=(window.GMTFleetRows||[]).filter(r=>(+r.wth||0)>EFF_BEST&&(+r.th||0)>0)
    .sort((a,b)=>{
      // Greedy Machines FIRST: they grow weekly and the new TH inherits the miner's
      // W/TH, so upgrading them while still small is far cheaper than after they've
      // grown. Then, among the rest, least efficient (highest W/TH) first.
      const ga=isG(a)?1:0, gb=isG(b)?1:0;
      if(ga!==gb)return gb-ga;
      return b.wth-a.wth;
    });
  if(!rows.length)return '';
  const fullMode=!(budgetTH>0&&isFinite(budgetTH));
  let left=fullMode?Infinity:budgetTH,out='';
  for(const r of rows){
    if(left<=0.5)break;
    const upgTH=Math.min(r.th,left); left-=upgTH;
    const cost=upgTH*effUpgradeCostPerTH(r.wth);
    const label=r.code?`#${escapeHtml(String(r.code))}`:escapeHtml(r.collection||'miner');
    const partial=upgTH<r.th-0.5?` (${fN(upgTH,0)} of ${fN(r.th,0)} TH)`:'';
    const tag=isG(r)?` <span class="eff-upg-greedy" title="Grows weekly — upgrade early while it's small">greedy · do first</span>`:'';
    out+=`<div class="eff-upg-row"><span class="eff-upg-id">${label}${tag}</span>`
       +`<span class="eff-upg-move">${fN(r.wth,1)} → ${fN(EFF_BEST,0)} W/TH${partial}</span>`
       +`<span class="eff-upg-cost">${fU(cost,0)}</span></div>`;
  }
  const anyGreedy=rows.some(isG);
  const note=`<div class="eff-upg-greedynote">${anyGreedy?`Upgrade your Greedy Machine's efficiency while it's still small — its free weekly TH inherits its W/TH, so future growth stays efficient. `:''}Upgrading also cuts the GMT you must lock for max discount (a lower fee needs less coverage), so it frees capital too — that's already credited in this plan.</div>`;
  const title=fullMode?'Upgrade these miners':'Upgrade these miners first';
  const sub=fullMode?'(recommended for an existing fleet — greedy first)':'(greedy machines first, then worst efficiency)';
  return `<div class="eff-upg"><div class="eff-upg-title">${title} <span>${sub}</span></div>${note}${out}</div>`;
}

// Where the hashrate budget goes. Topping up a miner you ALREADY own is cheaper per TH than a
// new one — you skip the pricey first-TH tiers and stay on the descending part of the curve. So
// fill existing miners toward the 5,000 cap first (greedy first, since it also compounds weekly,
// then biggest-first for the cheapest tier), and only mint new NFTs for the spill-over. Each
// upgrade is priced at its marginal slice of the curve via costToGrow12.
// Which miners the Buy-TH budget actually fills, in the order the allocator funds them, each at
// its OWN efficiency rating. Shared by the plan steps, the Buy TH card and the per-miner table so
// all three name the same machine and quote the same watts.
function buyFillPlan(addTH){
  if(!(addTH>0.5))return [];
  const isG=r=>/greedy/i.test(r.collection||'');
  const all=(window.GMTFleetRows||[])
    .filter(r=>(+r.th||0)>0&&(+r.th||0)<MINER_CAP)
    .map(r=>({code:r.code,th:+r.th||0,wth:Math.min(EFF_BASE_MAX,Math.max(EFF_BEST,+r.wth||EFF_BASE_MAX)),greedy:isG(r)}));
  // Greedy first (it also compounds weekly), then miners already at 12 W, largest first for the
  // cheapest marginal tier. A non-greedy machine above 12 W is NOT a target: it would need an
  // efficiency upgrade before it could take the hashrate, which is a different line of the plan.
  const order=all.filter(r=>r.greedy).sort((a,b)=>b.th-a.th)
    .concat(all.filter(r=>!r.greedy&&r.wth<=EFF_BEST+1e-6).sort((a,b)=>b.th-a.th));
  let left=addTH; const steps=[];
  for(const r of order){
    if(left<=0.5)break;
    const add=Math.min(MINER_CAP-r.th,left); if(add<0.5)continue;
    left-=add;
    const label=r.code?`#${escapeHtml(String(r.code))}`:'an existing miner';
    const tiers=r.wth<=EFF_BEST+1e-6?TH_TIERS_12W:TH_TIERS;
    steps.push({label,greedy:r.greedy,from:r.th,add,wth:r.wth,cost:costToGrowTiers(r.th,add,tiers),existing:true});
  }
  while(left>0.5){
    const add=Math.min(MINER_CAP,left); left-=add;
    steps.push({label:'New machine',greedy:false,from:0,add,wth:EFF_BEST,cost:costToGrow12(0,add),existing:false});
  }
  return steps;
}
// Blended watts of the hashrate a buy really adds, plus a name for where the first (largest)
// slice goes — so the summary card and the plan step can say "#1366 (greedy)" instead of
// "top up existing first".
function buyFillSummary(steps){
  if(!steps||!steps.length)return null;
  const th=steps.reduce((a,s)=>a+s.add,0);
  const wth=th>0?steps.reduce((a,s)=>a+s.add*s.wth,0)/th:EFF_BEST;
  const f=steps[0];
  return {th,wth,
    mixed:steps.some(s=>Math.abs(s.wth-wth)>0.05),
    name:f.existing?f.label+(f.greedy?' (greedy)':''):`a new ${fN(EFF_BEST,0)} W machine`,
    onExisting:f.existing, more:steps.length-1, first:f};
}
function buyCapHTML(addTH){
  const steps=buyFillPlan(addTH);
  if(!steps.length)return '';
  if(!steps.length)return '';
  const anyExisting=steps.some(s=>s.existing);
  const _sum=buyFillSummary(steps);
  let out=`<div class="eff-upg"><div class="eff-upg-title">Where to add the TH <span>(${anyExisting?`${_sum.name} first`:'new NFTs'})</span></div>`;
  if(anyExisting)out+=`<div class="eff-upg-greedynote">Adding TH to a miner you already own is cheaper per TH than a new one — you skip the pricey first-TH tiers and stay on the lower part of the price curve. Fill your biggest miners toward the ${fN(MINER_CAP,0)} TH cap before minting a new NFT.</div>`;
  steps.forEach(s=>{
    const tag=s.greedy?` <span class="eff-upg-greedy">greedy</span>`:'';
    const move=s.existing
      ?`+${fN(s.add,0)} TH @ ${fN(s.wth,s.wth%1?1:0)} W (${fN(s.from,0)} → ${fN(s.from+s.add,0)})`
      :`+${fN(s.add,0)} TH @ ${fN(EFF_BEST,0)} W (new NFT)`;
    out+=`<div class="eff-upg-row"><span class="eff-upg-id">${s.label}${tag}</span><span class="eff-upg-move">${move}</span><span class="eff-upg-cost">${fU(s.cost,0)}</span></div>`;
  });
  return out+`</div>`;
}

function renderPlanner(i,m){
  const bp=m.bp,gp=m.gp,usdCap=i.cap,dbt=dailyBTCperTH();
  const a=solvePlannerAllocation(i,bp,gp,dbt);
  if(!a){
    $('allocDisplay').innerHTML='<div style="color:var(--text4);padding:.5rem">Enter GMT or USD capital to see recommendation.</div>';
    $('projDisplay').innerHTML='';$('projTable').innerHTML='';return;
  }
  const {sol, ref, refBonusGMT, refBonusUSD, baseGmtAvail, gmtAvail, totalValue,
         gmtReserve, reserveNeeded, nt, newLocked, bwth, newF, nv,
         newNonTokD, newDailyBurnGMT, gmtNeededNew, ntd, td2,
         canCover20, gmtShortfall, vipBonus, VIP_BONUS_MIN,
         mpTH, mpWth, mpGmtCost, gmtForMiner, usdForMiner, minerShortfallUSD, usdCapAfter, vipTH,
         mpTHraw, mpWthRaw, mpIsGreedy, mpWthBought, mpWthAfter, mpUpgSteps, mpUpgUSD,
         mpUpgShortfallUSD, mpUpgFromUSD, mpUpgFromGMT}=a;
  const gmtDeployable=sol.deployable, gmtLock=sol.lock, gmtSell=sol.sell;
  const gmtFromPool=sol.fromPool, gmtFromUSD=sol.fromUSD, usdSpentOnGMT=sol.usdSpentOnGMT;
  let at=sol.addTH, tu=sol.thUSD;
  const ag=gmtLock;
  const cap=totalValue;

  const gr=dbt*nt;
  const df=newF.t*(1-td2/100),net=gr-df,mo=net*bp*30;

  // --- Display ---
  let ah='';

  // Income-goal banner: when the user planned via a target monthly income, surface the
  // capital we solved for (only while the displayed capital still matches that solve).
  const G=window._incomeGoal;
  if(G&&G.res&&Math.abs((i.cap||0)-(G.cap||0))<0.5){
    const baseMo=G.res.base||0;
    if(G.res.unreachable){
      ah+=`<div class="goal-banner warn">🎯 Couldn't add <strong>${fU(G.targetUSD)}/mo</strong> even at ${fU(G.res.maxTried)} of capital — try a smaller increase.</div>`;
    }else if(baseMo>0){
      ah+=`<div class="goal-banner">🎯 To add <strong>${fU(G.targetUSD)}/mo</strong> to the <strong>${fU(baseMo)}/mo</strong> you already earn — taking you to about <strong>${fU(G.res.goal)}/mo</strong> — invest <strong>${fU(G.cap)}</strong>. Here's how to deploy it:</div>`;
    }else{
      ah+=`<div class="goal-banner">🎯 To earn about <strong>${fU(G.targetUSD)}/mo</strong>, invest <strong>${fU(G.cap)}</strong>. Here's how to deploy it:</div>`;
    }
  }

  // Explanation — only noteworthy states (the split itself is shown in the cards below).
  // The greedy-machine-first allocation is computed in `a` and used by the projections, but
  // not surfaced here (backend detail). The box is omitted entirely when there's nothing to say.
  const usdToTH=usdCapAfter-usdSpentOnGMT;
  // Wallet GMT is spent before the referral commission, so the miner's price can be attributed.
  const minerFromWallet=Math.min(gmtForMiner,baseGmtAvail);
  const minerFromBonus=Math.max(0,gmtForMiner-minerFromWallet);
  let exp='';
  if(mpTHraw>0){
    exp+=`<strong style="color:var(--purple-soft)">Marketplace miner${mpIsGreedy?` (greedy${i.mpCode?' '+escapeHtml('#'+String(i.mpCode).replace(/^#/,'')):''})`:''}:</strong> +${fN(mpTHraw,0)} TH for ${fN(mpGmtCost,0)} GMT`;
    {
      const src=[];
      if(minerFromWallet>0)src.push(`${fN(minerFromWallet,0)} GMT on hand`);
      if(minerFromBonus>0)src.push(`${fN(minerFromBonus,0)} GMT referral bonus`);
      if(usdForMiner>0)src.push(fU(usdForMiner)+' capital');
      if(src.length)exp+=` (paid with ${src.join(' + ')})`;
    }
    exp+=`. <span style="color:var(--text3)">Doesn't count toward VIP tier.</span>${mpIsGreedy?` <span style="color:var(--text3)">Grows ${fN(i.ggrow||0,2)}%/wk for free and reinvestment fills it first, up to its own ${fN(GREEDY_CAP,0)} TH cap.</span>`:''} Remaining balance optimized below.<br>`;
    if(minerShortfallUSD>0)exp+=`<strong style="color:var(--orange)">You're ${fU(minerShortfallUSD)} short of affording this miner — figures assume the rest is funded.</strong><br>`;
    if(mpUpgSteps>0){
      exp+=`<strong style="color:var(--cyan)">Upgraded first:</strong> at ${fN(mpWthBought,1)} W/TH this miner is worse than the ${fN(EFF_BASE_MAX,0)} W baseline, and a greedy machine's free weekly TH inherits its rating &mdash; so <strong>${fU(mpUpgUSD)}</strong> takes it to <strong>${fN(EFF_BASE_MAX,0)} W/TH</strong> before anything else is allocated. <span style="color:var(--text3)">Everything below is planned with the remaining balance.</span><br>`;
      if(mpUpgShortfallUSD>0)exp+=`<strong style="color:var(--orange)">You're ${fU(mpUpgShortfallUSD)} short of that upgrade — figures assume it is funded.</strong><br>`;
    }
  }
  // The referral's capital is a large number that shapes this whole plan (it funds the ambassador
  // stream and the GMT bonus), but it isn't yours to allocate — say so here rather than leaving
  // the reader to find it below the split and wonder why it isn't in the pot.
  if(ref&&i.refCap>0){
    exp+=`<strong style="color:var(--green)">Referral:</strong> their ${fU(i.refCap)} buys <strong>${fN(ref.at,1)} TH</strong> and locks <strong>${fN(ref.ag,0)} GMT</strong>`;
    exp+=` — paying you <strong style="color:var(--text2)">${fU(ambDailyUSD(ref.at,EFF_BEST)*30)}/mo</strong> in ambassador rewards`;
    if(refBonusGMT>0)exp+=` plus a one-off <strong style="color:var(--text2)">${fN(refBonusGMT,0)} GMT</strong> bonus (${fU(refBonusUSD)}), which IS in the pot below`;
    exp+=`. <span style="color:var(--text3)">Their ${fU(i.refCap)} is their capital, not yours — it never enters the split.</span><br>`;
  }
  if(!i.payG){
    exp+=`<strong style="color:var(--cyan)">All to TH.</strong> GMT fee payment is off — all resources go to hashrate.`;
  }else if(!canCover20){
    exp+=`<strong style="color:var(--orange)">Not enough resources.</strong> You need ${fN(gmtNeededNew,0)} GMT total for 20% at ${fN(nt,1)} TH — you're ${fN(gmtShortfall,0)} GMT short.`;
  }else if(gmtLock<=0){
    exp+=`<strong style="color:var(--cyan)">All to TH.</strong> You already have enough locked GMT for 20% token discount. All resources go to hashrate growth.`;
  }
  if(sol.bonusActive){
    exp+=` <span style="color:var(--gold,#ffd700);font-weight:600">VIP 10% bonus active</span> — base ${fN(sol.baseTH,1)} TH +${fN(sol.bonusTH,1)} TH bonus on ${fU(sol.thUSD)} deposit.`;
  }else if(vipBonus&&sol.thUSD>0&&sol.thUSD<VIP_BONUS_MIN){
    exp+=` <span style="color:var(--text3)">(VIP bonus needs ${fU(VIP_BONUS_MIN)}+ on TH — currently ${fU(sol.thUSD)}, ${fU(VIP_BONUS_MIN-sol.thUSD)} short.)</span>`;
  }
  if(exp.trim())ah+=`<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.8rem 1rem;margin-bottom:.8rem;font-size:.8rem;color:var(--text2);line-height:1.6">${exp}</div>`;

  // Optimal allocation split — efficiency vs hashrate vs discount (greedy marginal allocator).
  // GMT on hand spends fee-free; only USD capital pays the 2% conversion fee. The per-miner
  // upgrade input re-renders just the comparison body via updateEffCompare().
  const hasGMT=(baseGmtAvail>0||refBonusGMT>0||gmtForMiner>0||gmtAvail>0);
  // Split is driven by the SAME solver as Path-to-20% / Resource Breakdown (consistent + unbounded
  // — no 5,000 TH cap on the farm total). Efficiency upgrade is layered on as an overlay.
  // a.iP is the model with a greedy-flagged marketplace miner moved into the greedy fields. Build
  // the plan from THAT, not the raw inputs: with the raw model the miner is neither in i.gth nor
  // in mpTH (the solver zeroes it when re-homing), so its hashrate — and everything reinvestment
  // adds to it — vanished from finTH, understating the projected income by the whole machine.
  const iPlan=a.iP||i;
  window._effCmp={i:iPlan,K:totalValue,gp,bp,
    lockUSD:usdSpentOnGMT+gmtFromPool*gp, glAdd:gmtLock,
    thUSD:usdToTH+gmtSell*gp, addTH:at, mpTH:mpTH, mpWth:mpWth};
  ah+=effCompareShell(iPlan);
  // Same plan the allocation cards render, so the post-investment projection agrees with the
  // "Result" total: the efficiency overlay diverts part of the TH budget into upgrades, so the
  // resulting hashrate (finTH) is lower than the solver's all-to-TH nt. Use it below.
  const _ep=computeEffPlan(window._effCmp);
  const projTH=(_ep&&_ep.finTH>0)?_ep.finTH:nt;      // greedy-, efficiency- & marketplace-inclusive total
  const projWth=(_ep&&_ep.finWth>0)?_ep.finWth:bwth;
  // Mining monthly for THAT total (same formula as the solver's `mo`, but on the efficiency-
  // inclusive TH/efficiency) so the "Projected monthly" headline matches the projection table.
  const projMoMining=(dbt*projTH-fees(projTH,projWth,bp).t*(1-td2/100))*(1-CONVERSION_FEE)*bp*30;   // incl. 2% BTC→GMT fee, like calc() and the After-Investment card

  // Path to 20%
  ah+=`<div class="sub-title">Path to 20% Token Discount</div>`;
  ah+=row('GMT needed for 20% (at '+fN(nt,1)+' TH)',`${fN(gmtNeededNew,0)} GMT<span class="sub">${fU(gmtNeededNew*gp)}</span>`);
  ah+=row('Already locked',`${fN(i.gl,0)} GMT`);
  if(gmtFromPool>0)ah+=row('Lock from GMT pool',`+${fN(gmtFromPool,0)} GMT`);
  if(gmtFromUSD>0)ah+=row('Buy & lock with USD',`+${fN(gmtFromUSD,0)} GMT<span class="sub">${fU(usdSpentOnGMT)}</span>`);
  ah+=row('Total locked after',`${fN(newLocked,0)} GMT`);
  if(canCover20){
    ah+=row('Status','20% token discount covered','green');
  }else{
    ah+=row('Still need',`${fN(gmtShortfall,0)} GMT<span class="sub">${fU(gmtShortfall*gp)}</span>`,'orange');
  }

  // Resource breakdown
  ah+=`<div class="sub-title" style="margin-top:.8rem">Resource Breakdown</div>`;
  if(mpTHraw>0){
    ah+=row(mpIsGreedy?`Marketplace miner (greedy${i.mpCode?' '+escapeHtml('#'+String(i.mpCode).replace(/^#/,'')):''})`:'Marketplace miner',
      `+${fN(mpTHraw,0)} TH<span class="sub">${fN(mpGmtCost,0)} GMT @ ${mpUpgSteps>0?`${fN(mpWthBought,1)}→${fN(mpWthAfter,1)}`:fN(mpWthRaw,1)} W/TH · non-VIP${mpIsGreedy?` · +${fN(i.ggrow||0,2)}%/wk free`:''}</span>`,'purple');
    if(mpUpgSteps>0){
      const src=[];
      if(mpUpgFromGMT>0)src.push(`${fN(mpUpgFromGMT,0)} GMT`);
      if(mpUpgFromUSD>0)src.push(fU(mpUpgFromUSD));
      ah+=row('→ Efficiency upgrade first',`${fU(mpUpgUSD)}<span class="sub">${fN(mpWthBought,1)} → ${fN(EFF_BASE_MAX,0)} W/TH on ${fN(mpTHraw,0)} TH${src.length?' · paid with '+src.join(' + '):''}</span>`,'cyan');
    }
  }
  if(hasGMT){
    if(baseGmtAvail>0)ah+=row('GMT on hand',`${fN(baseGmtAvail,0)} GMT<span class="sub">${fU(baseGmtAvail*gp)}</span>`);
    if(refBonusGMT>0)ah+=row(`+ Referral ${fN(i.refBonusPct>0?i.refBonusPct:5,0)}% GMT bonus`,`+${fN(refBonusGMT,0)} GMT<span class="sub">${fU(refBonusUSD)} (${fN(i.refBonusPct>0?i.refBonusPct:5,0)}% of ${fU(ref.thUSD)} TH spend)</span>`,'green');
    if(gmtForMiner>0)ah+=row('→ Marketplace miner',`${fN(gmtForMiner,0)} GMT<span class="sub">${fU(gmtForMiner*gp)}${minerFromBonus>0&&minerFromWallet>0?` · ${fN(minerFromWallet,0)} on hand + ${fN(minerFromBonus,0)} referral bonus`:(minerFromBonus>0?' · from the referral bonus':'')}</span>`,'purple');
    if(gmtFromPool>0)ah+=row('→ Lock',`${fN(gmtFromPool,0)} GMT`,'purple');
    if(gmtSell>0)ah+=row('→ Upgrade TH',`${fN(gmtSell,0)} GMT<span class="sub">${fU(gmtSell*gp)}</span>`,'cyan');
    // Closes the trail: whatever is neither spent nor locked is the fee float held in the wallet.
    if(gmtReserve>0.5)ah+=row('→ Kept in wallet for fees',`${fN(gmtReserve,0)} GMT<span class="sub">${fU(gmtReserve*gp)}</span>`);
  }
  if(usdCap>0){
    ah+=row('USD capital',`${fU(usdCap)}`);
    if(usdForMiner>0)ah+=row('→ Marketplace miner',`${fU(usdForMiner)}`,'purple');
    if(usdSpentOnGMT>0)ah+=row('→ Buy GMT to lock',`${fU(usdSpentOnGMT)}<span class="sub">${fN(gmtFromUSD,0)} GMT</span>`,'purple');
    if(usdToTH>0)ah+=row('→ Buy TH',`${fU(usdToTH)}`,'cyan');
  }

  $('allocDisplay').innerHTML=ah;
  updateEffCompare();

  // --- Post-investment projections ---
  const ov=vipOf(i.th,i.gl),tc=nv.n!==ov.n;
  const curMo=m.net*m.bp*30,imp=projMoMining-curMo;
  const svBTC=newF.t*(td2/100),rec=imp>0?cap/imp:Infinity;

  let ph='<div style="display:flex;align-items:center;justify-content:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">';
  ph+=`<span style="font-size:.8rem;color:var(--text3)">New VIP:</span>${badge(nv)}`;
  if(tc)ph+=` <span class="badge green">TIER UP from ${ov.n}</span>`;
  ph+='</div>';
  // VIP qualifies on locked GMT (or TH, whichever is higher), so the TH VIP-eligibility
  // breakdown is noise here — just show the resulting hashrate.
  ph+=row('New hashrate',`${fN(projTH,1)} TH`);
  if(at>0&&i.th>0&&Math.abs(i.wth-15)>0.01)ph+=row('New avg efficiency',`${fN(projWth,2)} W/TH<span class="sub">${fN(i.wth,2)}→${fN(projWth,2)} blended</span>`);
  ph+=row('New token discount',fP(ntd),'cyan');
  ph+=row('New total discount',fP(td2),'cyan');
  ph+=`<div class="divider"></div>`;
  // ref already solved at top of renderPlanner so the 5% GMT bonus could feed the main solver.
  const refInitTH=ref?ref.at:0;
  const refInitLocked=ref?ref.ag:0;

  const projMoStaking=newLocked*(i.apr/100)/52*gp*4.33;
  const projTotalRefTH=(i.amb?i.refTH:0)+refInitTH;
  const projAmbDaily=ambDailyUSD(i.amb?i.refTH:0,AMB_DEFAULT_WTH)+ambDailyUSD(refInitTH,EFF_BEST);
  const projAmbMo=projAmbDaily*30;
  // Greedy Machine free weekly growth, valued as income in TH credits (matches the console hero
  // + the Total monthly income breakdown). POST-PLAN greedy size, so growing the greedy raises it.
  const gGrow=+(i.ggrow||0);
  const _gTHf=(_ep&&_ep.gTHf>0)?_ep.gTHf:(m.gth||0), _gWf=(_ep&&_ep.gWthf>0)?_ep.gWthf:(m.gwth||15);
  const greedyMoAfter=(_gTHf>0&&gGrow>0)?(_gTHf*gGrow/100)*4.33*cptAtEff(_gTHf,_gWf):0;
  const greedyMoBefore=((m.gth||0)>0&&gGrow>0)?(m.gth*gGrow/100)*4.33*cptAtEff(m.gth,m.gwth||15):0;
  const projMoTotal=projMoMining+projMoStaking+projAmbMo+greedyMoAfter;
  const projSub='mining + staking'+(projAmbMo>0?' + ambassador':'')+(greedyMoAfter>0?' + greedy growth':'');
  ph+=row('Projected monthly',`${fU(projMoTotal)}<span class="sub">${projSub}</span>`,projMoTotal>=0?'green':'red');
  // A marketplace miner is a forced purchase, not something the optimizer chose — and when it is
  // paid for in GMT, that GMT is no longer locked while the new hashrate raises the fee bill the
  // lock has to cover. The token discount can fall several points across the WHOLE farm, which
  // easily outweighs what the miner earns. Price the same plan without it and say so outright,
  // rather than leaving a lower headline with no explanation.
  if(mpTHraw>0){
    const iNoMiner=Object.assign({},i,{mpTH:0,mpGMT:0,mpWth:0,mpGreedy:false});
    const aNo=solvePlannerAllocation(iNoMiner,bp,gp,dbt);
    const moNoMiner=projectedMonthlyFor(iNoMiner,m,bp,gp,dbt);
    const delta=projMoTotal-moNoMiner;
    if(isFinite(moNoMiner)&&aNo){
      const dTok=(aNo.ntd||0)-(ntd||0);
      const cost=`${fN(mpGmtCost,0)} GMT`;
      // Month one is the wrong place to stop for a greedy machine: it compounds, the GMT it
      // displaced does not. Walk both plans forward at today's prices and find where the miner
      // overtakes on monthly income, and where it has repaid the months it was behind.
      const HORIZON=120;
      const epNo=computeEffPlan(effStateFrom(iNoMiner,aNo,gp,bp));
      const pWith=plannerMonthlyPath(a,_ep,i,bp,gp,dbt,HORIZON);
      const pNo=plannerMonthlyPath(aNo,epNo,iNoMiner,bp,gp,dbt,HORIZON);
      let mAhead=0,mPaid=0,cw=0,cn=0;
      if(pWith&&pNo)for(let k=0;k<HORIZON;k++){
        if(!mAhead&&pWith[k]>=pNo[k])mAhead=k+1;
        cw+=pWith[k];cn+=pNo[k];
        if(!mPaid&&cw>=cn)mPaid=k+1;
      }
      const yrs=n=>n>=24?`${fN(n/12,1)} years`:`${n} month${n===1?'':'s'}`;
      const catchUp=(mAhead||mPaid)
        ? `<div style="margin-top:.45rem;color:var(--text2)">The greedy grows <strong>${fP(i.ggrow)}/wk</strong> for free and compounds, while that GMT would only earn its staking yield — so at today's prices it out-earns the alternative from <strong style="color:var(--text)">month ${mAhead||'—'}</strong>${mPaid?`, and has repaid everything it gave up by <strong style="color:var(--text)">month ${mPaid}</strong> (${yrs(mPaid)})`:''}.</div>`
        : `<div style="margin-top:.45rem;color:var(--text2)">Even with its free weekly growth compounding, it does not overtake within ${fN(HORIZON/12,0)} years at today's prices.</div>`;
      if(delta<-0.5){
        const worth=(mPaid&&mPaid<=36);
        ph+=`<div class="warn" style="margin:.5rem 0;background:${worth?'rgba(245,166,35,.07)':'rgba(239,68,68,.07)'};border-color:${worth?'rgba(245,166,35,.3)':'rgba(239,68,68,.28)'};color:var(--text2);font-size:.8rem;line-height:1.55">
          <strong style="color:${worth?'var(--gold-soft)':'#fca5a5'}">Starts ${fU(-delta)}/mo behind${worth?', pays for itself later':''}.</strong>
          The same plan without this miner projects <strong>${fU(moNoMiner)}/mo</strong> today.
          Its ${cost} would otherwise be locked${dTok>0?`, holding your token discount at <strong>${fN(aNo.ntd,0)}%</strong> instead of <strong>${fN(ntd,0)}%</strong>`:''} — and that discount applies to your whole farm, not just the new hashrate.
          ${mpIsGreedy?catchUp:'<div style="margin-top:.45rem;color:var(--text3)">A plain marketplace miner does not grow on its own, so nothing recovers this gap except a higher BTC price.</div>'}
        </div>`;
      }else if(delta>0.5){
        ph+=row('↳ This miner adds',`+${fU(delta)}/mo<span class="sub">vs ${fU(moNoMiner)}/mo without it${dTok>0?` · token discount ${fN(ntd,0)}% vs ${fN(aNo.ntd,0)}%`:''}</span>`,'green');
      }
    }
  }
  if(projAmbMo>0){
    const ambSub=refInitTH>0&&i.amb&&i.refTH>0
      ? `${fN(i.refTH,0)} existing + ${fN(refInitTH,1)} from referral plan = ${fN(projTotalRefTH,1)} TH`
      : refInitTH>0 ? `${fN(refInitTH,1)} TH from referral plan` : `${fN(i.refTH,0)} referred TH`;
    ph+=row('↳ Ambassador uplift',`+${fU(projAmbMo)}/mo<span class="sub">${ambSub}</span>`,'green');
  }
  if(greedyMoAfter>0){
    ph+=row('↳ Greedy growth',`+${fU(greedyMoAfter)}/mo<span class="sub">${fN(_gTHf*gGrow/100,2)} free TH/wk @ ${fN(_gWf,1)} W${_gTHf>(m.gth||0)+0.5?` · grown to ${fN(_gTHf,0)} TH`:''}</span>`,'green');
  }
  const newWkStake=(newLocked*i.apr/100)/52;
  const newStakingMo=newWkStake*gp*4.33;
  const curStakingMo=m.wkGMT*m.gp*4.33;
  const totalImp=imp+(newStakingMo-curStakingMo)+(greedyMoAfter-greedyMoBefore);
  ph+=row('Monthly improvement',`${totalImp>=0?'+':''}${fU(totalImp)}<span class="sub">mining + staking</span>`,totalImp>=0?'green':'red');
  ph+=row('Monthly maintenance saved',fU(svBTC*bp*30),'green');
  ph+=`<div class="divider"></div>`;
  const recAdj=totalImp>0?cap/totalImp:Infinity;
  ph+=row('New locked GMT',`${fU(newLocked*gp)}`+(gmtReserve>0?`<span class="sub">+${fU(gmtReserve*gp)} reserve</span>`:''));
  ph+=row('Months to recoup',recAdj===Infinity?'N/A':`${fN(recAdj,1)} months`,recAdj<12?'green':recAdj<24?'orange':'red');
  if(ref){
    ph+=`<div class="divider"></div>`;
    ph+=`<div class="sub-title">Referral's planned allocation (${fU(i.refCap)})</div>`;
    // Show the actual USD ALLOCATED to each (TH budget + GMT budget = refCap exactly). Pricing
    // the TH at the user's own i.cpt was wrong — a referral mints NEW 12 W machines (~$15/TH), so
    // the old line under-counted and the split didn't sum to the capital they invested.
    ph+=row('Referral TH',`${fN(refInitTH,1)} TH<span class="sub">${fU(ref.thUSD)} invested</span>`,'cyan');
    ph+=row('Referral locked <img src="/gmt36.png" class="gmt-logo" alt="GMT">',`${fN(refInitLocked,0)} GMT<span class="sub">${fU(Math.max(0,i.refCap-ref.thUSD))} invested</span>`,'cyan');
    ph+=row('Adds to your ambassador',`${fU(ambDailyUSD(refInitTH,EFF_BEST)*30)}/mo`,'green');
    if(refBonusGMT>0)ph+=row(`Your ${fN(i.refBonusPct>0?i.refBonusPct:5,0)}% GMT bonus`,`+${fN(refBonusGMT,0)} GMT<span class="sub">${fU(refBonusUSD)} on their ${fU(ref.thUSD)} TH spend (allocated above)</span>`,'green');
  }
  $('projDisplay').innerHTML=ph;

  // BTC price projections (includes mining + staking + ambassador)
  const moStakingUSD=newWkStake*gp*4.33;
  const projLabel=`Projected monthly income at ${fN(projTH,1)} TH with ${fP(td2)} total discount (mining + staking${projAmbMo>0?' + ambassador':''}${greedyMoAfter>0?' + greedy growth':''})`;
  // Current (pre-investment) state, for the before/after comparison.
  const curAmbMo=ambDailyUSD(i.amb?(+i.refTH||0):0,AMB_DEFAULT_WTH)*30;
  // earnTH, not totTH: switched-off miners must not be credited with rewards in the
  // "before" baseline, or the projection would show income they can't produce.
  const curP={th:m.earnTH,wth:m.bwth,totD:m.totD,grossBTC:dbt*m.earnTH,stakingMo:curStakingMo,ambMo:curAmbMo,greedyMo:greedyMoBefore};
  $('projTable').innerHTML=renderProjections(projTH,projWth,td2,projLabel,moStakingUSD,projAmbMo,curP,greedyMoAfter);
  updateProjCell();

}

// ---- REINVEST PROJECTION ----
// Public BTC price targets by firm. Sourced from each firm's published research
// notes. Year is the firm's target horizon, not when the note was written.
const BTC_FIRM_FORECASTS={
  'std-chartered':{firm:'Standard Chartered',price:500000,year:2028},
  'bernstein':    {firm:'Bernstein',price:1000000,year:2033},
};
function fmtBTCPrice(p){
  if(p>=1e9)return '$'+(p/1e9).toFixed(p%1e9===0?0:1)+'B';
  if(p>=1e6)return '$'+(p/1e6).toFixed(p%1e6===0?0:1)+'M';
  return '$'+(p/1000).toFixed(0)+'K';
}
function btcSelectionFrom(selId){
  const sel=$(selId);
  const v=sel?sel.value:'live';
  if(v==='live')return{price:S.btcPrice,label:'Live ('+fmtBTCPrice(S.btcPrice)+')',mode:'live'};
  if(v.startsWith('firm:')){
    const f=BTC_FIRM_FORECASTS[v.slice(5)];
    if(f){
      const tag=f.scenario?f.firm+' '+f.scenario:f.firm;
      return{price:f.price,label:tag+' — '+fmtBTCPrice(f.price)+' by '+f.year,mode:'firm',targetYear:f.year};
    }
  }
  if(v.startsWith('manual:')){
    const p=parseFloat(v.slice(7));
    if(p>0)return{price:p,label:fmtBTCPrice(p)+' (manual)',mode:'manual'};
  }
  return{price:S.btcPrice,label:'Live',mode:'live'};
}

// ===== Growth Projection popup (for users who already invested) =====
// Seeds the same compounding-reinvest engine from the CURRENT setup (no new
// capital), so existing users can project their farm forward.
function spShowForm(){
  const f=document.getElementById('spFormView'),r=document.getElementById('spResultsView');
  if(f)f.style.display='';if(r)r.style.display='none';
  const m=document.getElementById('setupProjModal');if(m)m.scrollTop=0;
}
function spShowResults(){
  const f=document.getElementById('spFormView'),r=document.getElementById('spResultsView');
  if(f)f.style.display='none';if(r)r.style.display='';
  const m=document.getElementById('setupProjModal');if(m)m.scrollTop=0;
}
function syncPayoutUnit(){
  const t=document.getElementById('spPayoutType'),u=document.getElementById('spPayoutUnit');
  if(t&&u)u.textContent=t.value==='usd'?'USD':'%';
}
// Resolve what the "Project To" control is actually asking for — a halving from the dropdown,
// or a hand-set horizon and BTC price. ONE source of truth for the preview, the run and the
// results narrative, so they can never disagree about the window being projected.
//   custom     — user picked their own horizon
//   userPriced — user also typed an end price, so the run leaves the rainbow curve behind
//   modelEnd   — what the fair-value model says for that date, for comparison
const SP_MAX_DAYS=7300;   // 20 years — beyond this the difficulty/APR decay curves are meaningless
function spSelection(){
  const sel=document.getElementById('spTarget'), now=Date.now();
  if(sel&&sel.value==='custom'){
    const amt=Math.max(0,+(($('spCustomAmt')||{}).value)||0)||12;
    const unit=(($('spCustomUnit')||{}).value)||'m';
    const days=Math.min(SP_MAX_DAYS,Math.max(1,Math.round(amt*(unit==='y'?365.25:30.4375))));
    const targetMs=now+days*86400000;
    const modelEnd=_rbFit?rbProjPrice(targetMs):S.btcPrice;
    const typed=+(($('spCustomBtc')||{}).value)||0;
    return{custom:true,userPriced:typed>0,targetMs,days,bpEnd:typed>0?typed:modelEnd,modelEnd};
  }
  let targetMs=sel?parseFloat(sel.value):0;
  if(!(targetMs>now)){const fut=HALVING_DATES.filter(h=>h>now);targetMs=fut.length?fut[0]:now+1095*86400000;}
  const days=Math.min(SP_MAX_DAYS,Math.max(1,Math.round((targetMs-now)/86400000)));
  const modelEnd=_rbFit?rbProjPrice(targetMs):S.btcPrice;
  return{custom:false,userPriced:false,targetMs,days,bpEnd:modelEnd,modelEnd};
}
// Show/hide the custom inputs, and seed the price box with the model's own figure the first
// time — so "custom" starts as the rainbow projection and the user edits away from it.
function onSpTargetChange(){
  const sel=document.getElementById('spTarget'), row=document.getElementById('spCustomRow');
  const custom=!!(sel&&sel.value==='custom');
  if(row)row.style.display=custom?'':'none';
  if(custom){
    const box=$('spCustomBtc');
    if(box&&!(+box.value>0))box.value=Math.round(spSelection().modelEnd||S.btcPrice||0);
  }
  updateSpTargetPreview();
}
// Put the model's fair value back in the price box for the chosen horizon.
function spResetCustomPrice(){
  const box=$('spCustomBtc');if(!box)return;
  box.value='';                                   // clear so spSelection() reports the model figure
  box.value=Math.round(spSelection().modelEnd||S.btcPrice||0);
  updateSpTargetPreview();
}
// Populate the "Project To" dropdown with each upcoming halving and its projected
// Still-cheap band price, so the user sees the target the projection will converge on.
function populateSpTargets(){
  const sel=document.getElementById('spTarget');
  if(!sel)return;
  const now=Date.now();
  const future=HALVING_DATES.filter(h=>h>now);
  if(!_rbFit||!future.length){sel.innerHTML='<option value="">Loading fair-value model…</option>';return;}
  const prev=sel.value;
  sel.innerHTML=future.map((h,idx)=>{
    const yr=new Date(h).getUTCFullYear();
    const fv=rbProjPrice(h);
    const label=(idx===0?'Next halving — ':'')+yr+' halving &mdash; '+fmtBTCPrice(fv);
    return `<option value="${h}">${label}</option>`;
  }).join('')+'<option value="custom">Custom &mdash; my own horizon &amp; BTC price</option>';
  if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
  onSpTargetChange();
}
// Live preview under the dropdown: horizon, the BTC price path (today → HODL fair value),
// and which halving(s) the projection crosses.
function updateSpTargetPreview(){
  const el=document.getElementById('spTargetPreview');
  if(!el)return;
  const sp=spSelection();
  if(!_rbFit||!(sp.targetMs>Date.now())){el.innerHTML='';return;}
  const days=sp.days, yrs=days/365;
  const P0=S.btcPrice||0;
  const hv=halvingsInWindow(days);
  const endLbl=sp.userPriced?'BTC: today &rarr; your figure':'BTC: today &rarr; Still cheap (rainbow)';
  const cagr=(P0>0&&sp.bpEnd>0&&yrs>0)?(Math.pow(sp.bpEnd/P0,1/yrs)-1)*100:0;
  el.innerHTML=
    `<div class="sp-prev-chip"><div class="sp-prev-val">${yrs.toFixed(1)} yr</div><div class="sp-prev-lbl">horizon (${days} days)</div></div>`+
    `<div class="sp-prev-chip"><div class="sp-prev-val">${fmtBTCPrice(P0)} &rarr; ${fmtBTCPrice(sp.bpEnd)}</div><div class="sp-prev-lbl">${endLbl} &middot; ${cagr>=0?'+':''}${fN(cagr,0)}%/yr</div></div>`+
    `<div class="sp-prev-chip"><div class="sp-prev-val">${hv.length?hv.join(' &amp; '):'—'}</div><div class="sp-prev-lbl">halving${hv.length===1?'':'s'} crossed${hv.length?' (−50% reward each)':''}</div></div>`;
  // Difficulty is paired to the model's price path. Set a price far above it and you are banking
  // a bull case while still paying the difficulty grind of a modest one — say so rather than
  // quietly returning a flattering number.
  if(sp.userPriced){
    const skipped=Math.round((1-difficultyMultAt(sp.targetMs))*100);
    const rich=sp.modelEnd>0&&sp.bpEnd>sp.modelEnd*1.5;
    el.innerHTML+=`<div class="sp-prev-note">&#9888; <strong style="color:var(--text2)">Difficulty growth is off</strong> for a hand-set price — that curve is calibrated to pair with the fair-value path, so applying it to your own would stack two different scenarios. Reward moves only on halvings and the no-arbitrage floor; the model would otherwise have taken <strong style="color:var(--text2)">−${skipped}%</strong> off reward per TH over ${fN(sp.days/365,1)} yr.${rich?` Your ${fmtBTCPrice(sp.bpEnd)} is also ${fN(sp.bpEnd/sp.modelEnd,1)}&times; the fair-value band for that date (${fmtBTCPrice(sp.modelEnd)}).`:''}</div>`;
  }
}
function openSetupProjection(mode){
  // 'planner' = project the post-investment allocation; otherwise the current My Setup.
  window._spMode=(mode==='planner')?'planner':'setup';
  const m=document.getElementById('setupProjModal');
  if(!m)return;
  ensureRainbowFit(populateSpTargets);   // load the HODL fair-value model, then fill the targets
  populateSpTargets();
  const sub=document.getElementById('spSubtitle');
  if(sub)sub.innerHTML=(mode==='planner')
    ? 'Project your <strong>planned investment</strong> forward &mdash; the recommended allocation reinvesting mining &amp; staking rewards into more TH and locked GMT each week.'
    : 'Already invested? Project your current setup forward &mdash; reinvesting mining &amp; staking rewards into more TH and locked GMT each week, keeping your 20% token discount.';
  spShowForm();
  syncPayoutUnit();
  showPanelView('setupProjModal');
  // Its own page. The planner-mode projection (projecting the RECOMMENDED allocation) is
  // separate logic from the setup projection, so it gets its own nested URL /planner/projection
  // and keeps the Planner nav highlighted; the setup projection is /projection.
  const backLabel=(window._spMode==='planner')?'← Return to Planner':'← Return to Console';
  document.querySelectorAll('#setupProjModal .sp-back-btn').forEach(b=>{b.textContent=backLabel;});
  document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('nav-active'));
  if(window._spMode==='planner'){
    const pl=document.querySelector('.nav-links a[data-view="tab-planner"]');if(pl)pl.classList.add('nav-active');
    try{history.replaceState({panel:'projection',mode:'planner'},'','/planner/projection'+location.hash);}catch(e){}
  }else{
    const npl=$('navProjection');if(npl)npl.classList.add('nav-active');
    try{history.replaceState({panel:'projection'},'','/projection'+location.hash);}catch(e){}
  }
  const btn=document.getElementById('spRunBtn');
  if(btn)btn.disabled=false;
}
// Re-run the fresh-load feel for the My Setup dashboard: hero values count up
// from 0 again and the cards re-enter, just like a page refresh.
function refreshMySetupAnimation(){
  ['heroDailyNet','heroMonthly','heroYearly','heroDiscount','heroVelocity'].forEach(id=>{const e=$(id);if(e)e._cur=0;});
  document.querySelectorAll('#heroGrid .hero-card').forEach(c=>{c.style.animation='none';void c.offsetWidth;c.style.animation='';});
  if(S.loaded)recalc();
}
// Count an element's leading number up from 0 to its rendered value, preserving
// any currency prefix / unit suffix (e.g. "$1,234", "9,354 GMT").
function animateCountText(el,dur){
  if(!el)return;
  // Use innerHTML so trailing markup (e.g. a GMT logo <img>) survives the animation.
  const m=String(el.innerHTML).match(/^(\D*?)([\d,]+(?:\.\d+)?)([\s\S]*)$/);
  if(!m)return;
  const prefix=m[1],numStr=m[2],rest=m[3];
  const target=parseFloat(numStr.replace(/,/g,''));
  if(!isFinite(target))return;
  const dec=(numStr.split('.')[1]||'').length;
  const t0=performance.now(),ease=p=>1-Math.pow(1-p,3);
  function step(now){
    const p=Math.min(1,(now-t0)/(dur||800));
    el.innerHTML=prefix+(target*ease(p)).toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec})+rest;
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
// Growth Projection results: count the headline values up + draw the chart line
// from left to right (slow "to the moon" climb).
function animateSetupResults(){
  document.querySelectorAll('#spResult .ri-headline,#spResult .ri-gain').forEach(el=>animateCountText(el,900));
  const line=document.getElementById('riChartLine');
  if(line&&line.getTotalLength){
    const len=line.getTotalLength();
    if(len){
      line.style.transition='none';
      line.style.strokeDasharray=len;line.style.strokeDashoffset=len;
      void line.getBoundingClientRect();
      line.style.transition='stroke-dashoffset 2.1s cubic-bezier(.16,.84,.44,1)';
      requestAnimationFrame(()=>{line.style.strokeDashoffset='0';});
    }
  }
  const area=document.getElementById('riChartArea');
  if(area){
    area.style.transition='none';area.style.opacity='0';
    void area.getBoundingClientRect();
    area.style.transition='opacity 2.1s ease';
    requestAnimationFrame(()=>{area.style.opacity='1';});
  }
}
// Fresh-load feel for the planner results: replay the section entrances and
// count the allocation numbers up from 0.
function animatePlannerResults(){
  const secs=document.querySelectorAll('#tab-planner .reveal');
  secs.forEach(el=>el.classList.remove('visible'));
  requestAnimationFrame(()=>requestAnimationFrame(()=>secs.forEach(el=>el.classList.add('visible'))));
  document.querySelectorAll('#allocDisplay .a-val').forEach(el=>animateCountText(el,800));
  document.querySelectorAll('#projTable .pc-monthly').forEach(el=>animateCountText(el,900));
  // Grow the allocation split bar from 0 to its target widths.
  document.querySelectorAll('#allocDisplay .alloc-split-bar>div').forEach(el=>{
    const target=el.style.width;
    if(!target)return;
    el.style.transition='none';
    el.style.width='0%';
    void el.offsetWidth;
    el.style.transition='width .8s cubic-bezier(.22,1,.36,1)';
    requestAnimationFrame(()=>{el.style.width=target;});
  });
}
function closeSetupProjection(){
  const m=document.getElementById('setupProjModal');
  const load=document.getElementById('spPageLoading');
  const txt=load?load.querySelector('.sp-loading-txt'):null;
  if(txt)txt.textContent='Loading your setup…';
  if(load)load.style.display='flex';
  setTimeout(function(){
    hidePanelView('setupProjModal');
    spShowForm();   // reset for next open
    if(load)load.style.display='none';
    if(txt)txt.textContent='Crunching your projection…';   // restore default for next run
    document.querySelectorAll('.nav-links a').forEach(a=>a.classList.remove('nav-active'));
    // Return to wherever this projection was launched from: planner-mode → /planner, else /console.
    if(window._spMode==='planner'){
      const pl=document.querySelector('.nav-links a[data-view="tab-planner"]');if(pl)pl.classList.add('nav-active');
      try{history.replaceState({},'','/planner'+location.hash);}catch(e){}
    }else{
      const cn=document.querySelector('.nav-links a[data-view="tab-current"]');if(cn)cn.classList.add('nav-active');
      try{history.replaceState({},'','/console'+location.hash);}catch(e){}
      refreshMySetupAnimation();
    }
  },650);
}
function newSetupProjection(){
  spShowForm();
  const btn=document.getElementById('spRunBtn');
  if(btn)btn.disabled=false;
}
// Show a brief full-page "crunching" state, compute, then switch to the results page.
function runSetupProjection(){
  if(!S.loaded)return;
  const btn=document.getElementById('spRunBtn');
  const load=document.getElementById('spPageLoading');
  if(btn)btn.disabled=true;
  if(load)load.style.display='flex';
  const go=function(){
    try{computeSetupProjection();spShowResults();animateSetupResults();}
    finally{if(load)load.style.display='none';if(btn)btn.disabled=false;}
  };
  // The GMT elasticity is fitted from daily history; wait for it behind the overlay that is
  // already showing rather than running the first projection on the fallback path. It is cached
  // for a day, so this only ever costs the first run of a session, and a failed fetch just
  // proceeds — the fallback is the model this always used.
  Promise.race([ensureGmtBeta(),new Promise(r=>setTimeout(r,4000))])
    .then(()=>setTimeout(go,300)).catch(()=>setTimeout(go,300));
}
function computeSetupProjection(){
  if(!S.loaded)return;
  const out=document.getElementById('spResult');
  if(!out)return;
  const i=inp();
  const ptype=($('spPayoutType')&&$('spPayoutType').value)||'pct';
  const pval=Math.max(0,+($('spPayoutVal')&&$('spPayoutVal').value||0));
  const distPct=(ptype==='pct'?Math.min(100,pval):0)/100;
  const distWeeklyUSD=ptype==='usd'?pval:0;
  // gp0 = today's spot GMT (used for the planner seed, which is a point-in-time purchase).
  // gp itself is a LET: it walks forward each simulated day, see gpForDay below.
  const gp0=S.gmtPrice,dbt=dailyBTCperTH();
  let gp=gp0;
  const bpStart=S.btcPrice;
  // Need the HODL (Power-Law) fit and a target halving to auto-scale the price.
  if(!_rbFit){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Loading the fair-value model…</div>';ensureRainbowFit(()=>runSetupProjection());return;}
  const nowMs=Date.now();
  const spSel=spSelection();
  const targetMs=spSel.targetMs, days=spSel.days, bpEnd=spSel.bpEnd;
  // A hand-set end price replaces the rainbow band as the destination; a custom horizon on its
  // own still rides the band, just to a date of the user's choosing.
  const customPath=spSel.userPriced;
  // The modelled difficulty grind (DIFF_G0/TAU) is CALIBRATED TO PAIR with the rainbow price path
  // — a better-funded network adds hashrate. Bolting it onto a price the user set themselves
  // double-stacks two unrelated scenarios, so a manual projection runs without it: reward then
  // moves only on halvings (dated, certain) and the no-arbitrage floor (a constraint, and one
  // that tracks whatever price was entered). Removing the grind is a LARGE change — over 5 years
  // it is most of the erosion — so the preview and the results both say so outright.
  const applyDiffGrind=!customPath;
  const centerNow=rbProjPrice(nowMs);
  if(!bpStart||!bpEnd||!centerNow||!gp0||!dbt){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Waiting for live market data to load…</div>';return;}
  // Convergence: start at today's real price, converge onto the Still-cheap band by the target.
  const offset0=Math.log(bpStart/centerNow);   // today's log-deviation from that band
  const btcSel=customPath
    ? {mode:'manual',label:fmtBTCPrice(bpEnd)+' by '+new Date(targetMs).toLocaleDateString('en-US',{month:'short',year:'numeric'})+' (your figure)',price:bpEnd,targetYear:new Date(targetMs).getUTCFullYear()}
    : {mode:'powerlaw',label:'Still cheap '+fmtBTCPrice(bpEnd)+' by '+new Date(targetMs).getUTCFullYear(),price:bpEnd,targetYear:new Date(targetMs).getUTCFullYear()};

  // ---- Seed: post-investment allocation when launched from the Capital Planner,
  //      otherwise the current My Setup state (no new capital deployed). ----
  const fromPlanner=(window._spMode==='planner');
  let MP_TH,MP_WTH,GGROW,GINIT,greedyTH,greedyWTH,th,curWTH,gmtLocked,gmtW,startTH,startLocked;
  // The greedy fleet, one entry per NFT — each with its own efficiency and its own 5,000 TH cap.
  // greedyTH / greedyWTH stay as the fleet totals every reward, fee and VIP calculation reads;
  // those are linear in TH (and TH x W/TH), so a sum is exact. Only the decisions that belong to
  // a single machine — filling toward the cap, buying an efficiency upgrade — walk the list.
  let GRD=[];
  const gTot=()=>GRD.reduce((s,m)=>s+m.th,0);
  const gWattsTot=()=>GRD.reduce((s,m)=>s+m.th*m.wth,0);
  const syncGreedy=()=>{const t=gTot();greedyTH=t;greedyWTH=t>0?gWattsTot()/t:15;};
  // The referral your Capital Planner just funded: their fleet, so their hashrate feeds YOUR
  // ambassador stream for the whole run instead of being dropped at the planner's results page.
  let refFleetTH=0, refFleetLocked=0;
  // apr0 = the APR observed today; apr walks down it across the simulated years (see stakeAprAt).
  const apr0=i.apr||0;
  let apr=apr0;
  if(fromPlanner){
    const a=solvePlannerAllocation(i,bpStart,gp0,dbt);   // allocation is a purchase TODAY -> spot GMT
    if(!a){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Enter capital in the <strong>Capital Planner</strong> first, then project.</div>';return;}
    MP_TH=a.mpTH||0; MP_WTH=a.mpWth>0?a.mpWth:15;
    GGROW=(a.ggrow||0)/100;
    GINIT=a.gInit||0;
    GRD=(a.greedyList||[]).filter(m=>m&&m.th>0).map(m=>({th:m.th,wth:m.wth>0?m.wth:15,code:m.code||''}));
    if(!GRD.length&&(a.greedyTot||0)>0)GRD=[{th:a.greedyTot,wth:a.gwthAfter>0?a.gwthAfter:15,code:''}];
    syncGreedy();
    th=a.vipStandalone!=null?a.vipStandalone:a.vipTH;     // post-investment standalone VIP TH
    curWTH=a.vipWth>0?a.vipWth:15;
    gmtLocked=a.newLocked;
    gmtW=a.gmtReserve;
    startTH=a.nt;                                          // total post-investment hashrate
    startLocked=a.newLocked;
    if(a.ref){refFleetTH=Math.max(0,a.ref.at||0);refFleetLocked=Math.max(0,a.ref.ag||0);}
  }else{
    MP_TH=0; MP_WTH=15;
    GGROW=(i.ggrow||0)/100;
    GINIT=Math.min(Math.max(0,i.gInit||0),Math.max(0,i.gth||0));
    GRD=ownedGreedyMachines(Math.max(0,i.gth||0),i.gwth>0?i.gwth:15,GINIT);
    syncGreedy();
    th=Math.max(0,i.th||0);
    curWTH=i.wth>0?i.wth:15;
    gmtLocked=Math.max(0,i.gl||0);
    gmtW=Math.max(0,i.gw||0);
    startTH=th+MP_TH+greedyTH;
    startLocked=gmtLocked;
  }
  if(startTH<=0&&gmtLocked<=0){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Add your hashrate and locked GMT in <strong>My Setup</strong> first, then project.</div>';return;}
  const GRD_START=GRD.map(m=>({th:m.th,wth:m.wth,code:m.code||''}));   // per-machine snapshot for the results card
  // Starting blended efficiency (across VIP + marketplace + greedy) — to show any reinvested upgrade.
  const _bwStart=(th+MP_TH+greedyTH)>0?(th*curWTH+MP_TH*MP_WTH+greedyTH*greedyWTH)/(th+MP_TH+greedyTH):curWTH;

  // Ambassador USDT = hand-entered referred TH (efficiency unknown -> 15 W) plus the referral the
  // Capital Planner just funded (minted at 12 W). `ambDaily` is a LET: with a referral reinvest
  // rate set it is re-derived every week as their fleet grows.
  const manualRefTH=i.amb?Math.max(0,i.refTH||0):0;
  // Opt-in: what share of their own rewards the referral ploughs back in. 0 = a static fleet,
  // which is the default because this forecasts somebody else's behaviour, not yours.
  const refReinvest=Math.max(0,Math.min(100,+i.refReinvest||0))/100;
  const refBonusRate=(i.refBonusPct>0?i.refBonusPct:5)/100;
  let ambDaily=ambDailyUSD(manualRefTH,AMB_DEFAULT_WTH)+ambDailyUSD(refFleetTH,EFF_BEST);
  let totalAmbUSD=0, totalRefBonusUSD=0, refFleetStartTH=refFleetTH;

  let bpToday=bpStart;
  const projStartMs=Date.now();
  let dbtToday=dbt;                 // daily BTC/TH; halves at each halving date during the run
  // Convergence to the Still-cheap band: price = stillCheap(t) · e^(offset0·(1−progress)).
  // At d=1 → today's real price; at the target halving → exactly the Still-cheap band price.
  function bpForDay(d){
    const t=projStartMs+(d-1)*86400000;
    const progress=Math.min(1,Math.max(0,(t-projStartMs)/Math.max(1,targetMs-projStartMs)));
    // Hand-set target: walk today's price to it geometrically (a constant %/yr), which is the
    // honest reading of "BTC is $X by then" — no shape smuggled in that the user didn't ask for.
    if(customPath)return bpStart*Math.pow(bpEnd/bpStart,progress);
    const c=rbProjPrice(t)||bpEnd;
    return c*Math.exp(offset0*(1-progress));
  }
  // GMT walks with BTC instead of sitting frozen: it starts at today's REAL GMT price and converges
  // onto the conservative GMT_BTC_RATIO band by the target — exactly the treatment BTC gets above,
  // so GMT always tracks whatever BTC path the projection uses. Holding GMT flat while
  // BTC multiplies was the single harshest assumption in the model: locked GMT is ~40% of a
  // reinvested farm's end value, and coverage needs FEWER tokens as GMT rises (burn ∝ 1/gp).
  const gpRatioNow=bpStart>0?gp0/bpStart:GMT_BTC_RATIO;
  const gpOffset0=Math.log((gpRatioNow>0?gpRatioNow:GMT_BTC_RATIO)/GMT_BTC_RATIO);
  // Where the measured elasticity is available, GMT moves with BTC by THAT much rather than 1:1:
  // gp = gp0 * (bp/bp0)^beta, anchored on today's real price. Beta near 0.4 means a BTC double
  // lifts GMT by roughly a third, not double — which is what 300 days of daily returns actually
  // show. Without the fit (no history loaded) it falls back to the original ratio-convergence
  // path, so a projection never silently changes model because a fetch failed.
  const GB=gmtBetaClamped();
  function gpForDay(d){
    if(GB!=null){
      const b=bpForDay(d);
      return (bpStart>0&&b>0)?gp0*Math.pow(b/bpStart,GB):gp0;
    }
    const t=projStartMs+(d-1)*86400000;
    const progress=Math.min(1,Math.max(0,(t-projStartMs)/Math.max(1,targetMs-projStartMs)));
    return bpForDay(d)*GMT_BTC_RATIO*Math.exp(gpOffset0*(1-progress));
  }
  // The band the centre line sits inside. Residual dispersion is per DAY, so it widens with the
  // square root of the horizon — the honest statement is a range, and the range is wide.
  const gpEnd=gpForDay(days);
  const gpSigma=(GB!=null&&_gmtBeta&&_gmtBeta.resid>0)?_gmtBeta.resid*Math.sqrt(Math.max(1,days)):0;
  const gpLo=gpSigma>0?gpEnd*Math.exp(-gpSigma):gpEnd;
  const gpHi=gpSigma>0?gpEnd*Math.exp(gpSigma):gpEnd;

  // ov (optional) overrides closure state for trial evaluation in the reinvest allocator:
  // {wth} = VIP blended efficiency, {greedyTH,greedyWTH} = greedy fleet. Defaults to live state.
  function dailyNet(curTH,curLocked,ov){
    const cW=ov&&ov.wth!=null?ov.wth:curWTH;
    const gTH=ov&&ov.greedyTH!=null?ov.greedyTH:greedyTH;
    const gW=ov&&ov.greedyWTH!=null?ov.greedyWTH:greedyWTH;
    const totTH=curTH+MP_TH+gTH;
    const bw=totTH>0?(curTH*cW+MP_TH*MP_WTH+gTH*gW)/totTH:cW;
    const g=dbtToday*totTH,f=fees(totTH,bw,bpToday);
    const v=vipOf(curTH+Math.max(0,gTH-GINIT),curLocked);
    const ntd=Math.min(30,v.d+(i.click?3:0)+i.mm+i.od);
    const tg2=curLocked+gmtW;
    const fc2=(f.t*(1-ntd/100)*bpToday)/gp;
    const cv=fc2>0?tg2/fc2:Infinity;
    const td=i.payG?Math.min(20,Math.floor(cv/18)):0;
    const fd=Math.min(30,td+ntd);
    const miningUSD=Math.max(0,(g-f.t*(1-fd/100))*bpToday*(1-CONVERSION_FEE)); // floor at 0: an unprofitable miner earns nothing, not a negative reward
    const stakingUSD=(curLocked*(apr/100)/52)*4.33/30*gp;
    return{net:miningUSD+stakingUSD+ambDaily,reinvest:miningUSD+ambDaily,mining:miningUSD,staking:stakingUSD,amb:ambDaily,disc:fd,tokD:td,vip:v.n};
  }
  // The referral's farm, run on the same rules as yours: each week their rewards top their own
  // coverage back to 360 days first, then mint fresh 12 W hashrate. You are paid `refBonusRate`
  // of that TH spend, returned here as reinvestable income so the allocator splits it like any
  // other dollar. Their growing fleet also lifts `ambDaily`. Runs only when the user has opted
  // in with a reinvest rate — at 0 their fleet stays exactly as the planner bought it.
  function refFleetWeek(){
    if(!(refFleetTH>0&&refReinvest>0))return 0;
    refFleetLocked+=refFleetLocked*(apr/100)/52;              // their locked GMT stakes too
    const f=fees(refFleetTH,EFF_BEST,bpToday);
    const v=vipOf(refFleetTH,refFleetLocked);
    const ntd=Math.min(30,v.d);                                // VIP only — their streak/mode is unknown
    const burn=(f.t*(1-ntd/100)*bpToday)/gp;                   // their daily GMT fee burn
    const cov=burn>0?refFleetLocked/burn:Infinity;
    const td=i.payG?Math.min(20,Math.floor(cov/18)):0;
    const fd=Math.min(30,td+ntd);
    const netWk=Math.max(0,(dbtToday*refFleetTH-f.t*(1-fd/100))*bpToday*(1-CONVERSION_FEE))*7;
    const spend=netWk*refReinvest;
    if(!(spend>0))return 0;
    const gmtSpend=i.payG?Math.min(spend,Math.max(0,burn*360-refFleetLocked)*gp):0;
    refFleetLocked+=gmtSpend/gp;
    const thSpend=spend-gmtSpend;
    if(thSpend>0)refFleetTH+=thForBudget12(thSpend);
    ambDaily=ambDailyUSD(manualRefTH,AMB_DEFAULT_WTH)+ambDailyUSD(refFleetTH,EFF_BEST);
    const bonus=thSpend*refBonusRate;                          // your commission on their TH spend
    totalRefBonusUSD+=bonus;
    return bonus;
  }
  function gmtDeficit(curTH,curLocked){
    const totTH=curTH+MP_TH+greedyTH;
    const bw=totTH>0?(curTH*curWTH+MP_TH*MP_WTH+greedyTH*greedyWTH)/totTH:curWTH;
    const f=fees(totTH,bw,bpToday);
    const v=vipOf(curTH+Math.max(0,greedyTH-GINIT),curLocked);
    const ntd=Math.min(30,v.d+(i.click?3:0)+i.mm+i.od);
    const burn=(f.t*(1-ntd/100)*bpToday)/gp;
    return Math.max(0,burn*360-(curLocked+gmtW));
  }

  const daily=[];
  let weeklyGrossUSD=0,totalDistributionUSD=0,startSS_capture=0;
  // Real per-miner state for the VIP (non-greedy) farm, so each week's TH purchase prices against
  // the evolving fleet (topping up existing miners is cheaper than minting new). The greedy
  // machines are tracked one-by-one in GRD, each priced on its own efficiency curve.
  let vipSizes=existingMinerSizes(false);
  for(let d=1;d<=days;d++){
    bpToday=bpForDay(d);
    gp=gpForDay(d);      // dailyNet/gmtDeficit close over gp, so staking value, burn, coverage
                         // and every GMT purchase reprice off the walking token price
    apr=stakeAprAt(apr0,(d-1)/365.25);   // and the staking yield relaxes toward its funded floor
    dbtToday=Math.max(dbt*subsidyMultAt(projStartMs+(d-1)*86400000)*(applyDiffGrind?difficultyMultAt(projStartMs+(d-1)*86400000):1), rewardFloorBTC(bpToday));  // halving (+ difficulty grind, unless the price is hand-set), floored at the network no-arbitrage break-even
    if(d===1)startSS_capture=dailyNet(th,gmtLocked).net;
    totalAmbUSD+=ambDaily;
    if(d%7===0){
      gmtLocked+=gmtLocked*(apr/100)/52;            // weekly staking yield auto-compounds
      if(GGROW>0&&GRD.length){GRD.forEach(m=>{m.th*=(1+GGROW);});syncGreedy();}   // passive growth, per machine (compounds past the 5k cap)
    }
    const dn=dailyNet(th,gmtLocked);
    weeklyGrossUSD+=Math.max(0,dn.reinvest);
    if(d%7===0)weeklyGrossUSD+=refFleetWeek();   // their reinvestment pays you a commission
    let postDN=dn;
    if(d%7===0){
      const pctPortion=weeklyGrossUSD*distPct;
      const dollarPortion=Math.min(distWeeklyUSD,Math.max(0,weeklyGrossUSD-pctPortion));
      const distributionUSD=pctPortion+dollarPortion;
      if(distributionUSD>0)totalDistributionUSD+=distributionUSD;
      const netUSD=weeklyGrossUSD-distributionUSD;
      weeklyGrossUSD=0;
      if(netUSD>0){
        // Discount-first allocation: minimum GMT lock so 20% holds, remainder to TH.
        let gmtSpend=0;
        if(i.payG){
          // Size the lock off the SAME price table the reinvest step actually buys at (12W),
          // otherwise the cheaper 15W curve overestimates the TH bought and over-locks GMT.
          const allTH=th+thForBudgetFromSizes(netUSD,vipSizes,TH_TIERS_12W);
          if(gmtDeficit(allTH,gmtLocked)>0){
            let lo=0,hi=netUSD;
            for(let k=0;k<40;k++){const mid=(lo+hi)/2;const agT=mid/gp;const thRem=netUSD-mid;const atT=thRem>0?thForBudgetFromSizes(thRem,vipSizes,TH_TIERS_12W):0;if(gmtDeficit(th+atT,gmtLocked+agT)<=0)hi=mid;else lo=mid;}
            gmtSpend=hi;
          }
        }
        gmtLocked+=gmtSpend/gp;                 // discount-first lock
        let budget=netUSD-gmtSpend;
        // Marginal allocator: each step spend `incr` on buy TH @12W /
        // upgrade efficiency toward 12 / lock GMT for staking. Efficiency is PREFERRED over staking
        // while mining is alive or rescuable — a lower W/TH lowers break-even and keeps the miner
        // earning longer, which the myopic daily-ROI of staking ignores. Staking only wins once the
        // farm is fully efficient (12 W) or mining is truly dead (even a 12 W farm nets $0) — we never
        // bank GMT while a cheaper miner could still be saved, nor fund hashrate that can't earn.
        // New VIP TH is priced as a 12 W/TH machine; greedy fills first, each machine on its own curve.
        if(budget>0){
          const STEPS=12, incr=budget/STEPS;
          for(let s=0;s<STEPS;s++){
            // --- option BUY: fill a greedy machine first, remainder a new 12 W VIP machine ---
            let gTH2=greedyTH,gW2=greedyWTH,vTH2=th,vW2=curWTH,gFillIx=-1,gFillAdd=0;
            // Biggest machine with room first (cheapest marginal tier). The cap belongs to the
            // machine, not the fleet: a full one is skipped while its sibling keeps filling, and
            // the TH is priced on that machine's own curve and inherits its rating.
            const gCand=GRD.map((m,ix)=>({ix,m})).filter(o=>o.m.th<GREEDY_CAP).sort((a,b)=>b.m.th-a.m.th)[0];
            const gT=gCand?thToGrowTiers(gCand.m.th,incr,gCand.m.wth<=EFF_BEST+1e-6?TH_TIERS_12W:TH_TIERS):0;
            if(gCand&&gT>0){
              gFillIx=gCand.ix;gFillAdd=Math.min(gT,GREEDY_CAP-gCand.m.th);
              gTH2=greedyTH+gFillAdd;
              gW2=gTH2>0?(gWattsTot()+gFillAdd*gCand.m.wth)/gTH2:greedyWTH;
              const rem=incr*(1-gFillAdd/gT);
              if(rem>0){const vAdd=thForBudgetFromSizes(rem,vipSizes,TH_TIERS_12W);vW2=(th*curWTH+vAdd*EFF_BEST)/(th+vAdd);vTH2=th+vAdd;}
            }else{
              const vAdd=thForBudgetFromSizes(incr,vipSizes,TH_TIERS_12W);vW2=(th*curWTH+vAdd*EFF_BEST)/(th+vAdd);vTH2=th+vAdd;
            }
            const buyNet=dailyNet(vTH2,gmtLocked,{wth:vW2,greedyTH:gTH2,greedyWTH:gW2}).net;
            // --- option EFF: drive efficiency toward 12 W/TH ($2.67/TH per W-step). ---
            // GREEDY IS ALWAYS UPGRADED FIRST, even when the VIP farm sits at a worse W/TH. The two
            // fleets are not symmetric: every TH bought now mints at 12 W/TH, so the VIP farm blends
            // its own efficiency down for free as it reinvests — but the Greedy Machine's weekly free
            // TH inherits whatever rating the machine already has, so it never self-heals, and the
            // upgrade bill grows with the machine (delaying 5 yr at 1%/wk costs 13x more).
            let effNet=-Infinity, effApply=null;
            const vipRoom=(curWTH>EFF_BEST+1e-6&&th>0);
            // Efficiency is a per-NFT purchase, so upgrade a single machine — the worst-rated one
            // — rather than nudging a fleet average that no real miner has.
            const gUp=GRD.map((m,ix)=>({ix,m})).filter(o=>o.m.wth>EFF_BEST+1e-6&&o.m.th>0).sort((a,b)=>b.m.wth-a.m.wth)[0];
            if(gUp){
              const dW=Math.min(gUp.m.wth-EFF_BEST,incr/(EFF_UPGRADE_STEP*gUp.m.th));
              const gw2=gUp.m.wth-dW;
              const fleetW2=greedyTH>0?(gWattsTot()-gUp.m.th*gUp.m.wth+gUp.m.th*gw2)/greedyTH:greedyWTH;
              effNet=dailyNet(th,gmtLocked,{greedyWTH:fleetW2}).net;
              effApply=()=>{GRD[gUp.ix].wth=gw2;syncGreedy();};
            }else if(vipRoom){
              const dW=Math.min(curWTH-EFF_BEST,incr/(EFF_UPGRADE_STEP*th));const cw2=curWTH-dW;
              effNet=dailyNet(th,gmtLocked,{wth:cw2}).net;effApply=()=>{curWTH=cw2;};
            }
            // --- option LOCK: stake extra GMT ---
            const addG=incr/gp,lockNet=dailyNet(th,gmtLocked+addG).net;
            // Selection. KEY RULE: don't idle money into staking while mining can still be kept alive by
            // a cheaper miner. While the farm has efficiency headroom AND mining is earning now OR could
            // be revived by reaching the 12 W floor (rescuable), spend only on buying TH or upgrading
            // efficiency. Staking is reserved for when mining is genuinely dead (even a 12 W farm nets
            // $0) or the farm is already fully efficient.
            const eps=1e-9, base=dailyNet(th,gmtLocked).net;
            const headroom=effApply!=null;
            const rescuable=dailyNet(th,gmtLocked,{wth:EFF_BEST,greedyWTH:Math.min(greedyWTH,EFF_BEST)}).mining>0;
            const applyBuy=()=>{
              vipSizes=applyAddSizes(vipSizes,Math.max(0,vTH2-th));
              if(gFillIx>=0&&gFillAdd>0){GRD[gFillIx].th+=gFillAdd;syncGreedy();}
              th=vTH2;curWTH=vW2;
            };
            if(headroom&&(dn.mining>0||rescuable)){
              if(buyNet>=effNet&&buyNet>base+eps)applyBuy();
              else{effApply();}
            }else if(Math.max(buyNet,effNet)>lockNet+eps){
              if(buyNet>=effNet)applyBuy();
              else{effApply();}
            }else{gmtLocked+=addG;}
          }
        }
      }
      postDN=dailyNet(th,gmtLocked);
    }
    daily.push({d,th:th+MP_TH+greedyTH,greedy:greedyTH,gmtLocked,gmtW,gp,ssNet:postDN.net,disc:postDN.disc,tokD:postDN.tokD,vip:postDN.vip});
    if(!isFinite(th)||!isFinite(greedyTH)||!isFinite(gmtLocked)||!isFinite(postDN.net)){out.innerHTML='<div class="warn" style="background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#fca5a5"><strong>Numbers exceeded simulation precision.</strong> Pick a more conservative BTC target or shorter horizon.</div>';return;}
  }

  // ---- Render ----
  const finalEntry=daily[daily.length-1];
  const totEndTH=th+MP_TH+greedyTH;
  const thGain=totEndTH-startTH,thPct=startTH>0?thGain/startTH*100:0;
  const startSS=startSS_capture,finalSS=finalEntry.ssNet;
  const ssPct=startSS>0?((finalSS-startSS)/startSS*100):0;
  const gmtGain=gmtLocked-startLocked;
  const bpAtEnd=bpForDay(days);
  const finalDailyGMT=finalSS/gp,finalMonthly=finalSS*30,finalYearly=finalSS*365;
  const lockedUSD=gmtLocked*gp;

  const _endWhen=new Date(targetMs).toLocaleDateString('en-US',{month:'short',year:'numeric'});
  const btcModeBadge=customPath
    ? '<span class="badge" style="background:rgba(245,166,35,.18);color:var(--gold-soft);font-size:.65rem;margin-left:.4rem">YOUR PRICE</span>'
    : '<span class="badge" style="background:rgba(63,124,196,.22);color:#7fb0ff;font-size:.65rem;margin-left:.4rem">WORST CASE</span>';
  const btcRangeLine=customPath
    ? `BTC walks from <strong style="color:var(--text2)">${fmtBTCPrice(bpStart)} (today)</strong> to <strong style="color:var(--text2)">${fmtBTCPrice(bpEnd)} by ${_endWhen}</strong> — the figure you set — at a steady ${fN((Math.pow(bpEnd/bpStart,365/Math.max(1,days))-1)*100,0)}%/yr (${days}d). Fair-value band for that date: ${fmtBTCPrice(spSel.modelEnd)}`
    : `BTC follows the rainbow Power-Law curve from <strong style="color:var(--text2)">${fmtBTCPrice(bpStart)} (today)</strong>, converging to the <strong style="color:var(--text2)">Still-cheap band at ${fmtBTCPrice(bpEnd)}</strong> by the ${new Date(targetMs).getUTCFullYear()} halving (${days}d)`;

  // Say plainly what the GMT leg is and how little it is worth trusting. The centre is a rough
  // average, not a forecast, and the band is the point of showing it at all.
  const gmtNoteS=(GB!=null&&_gmtBeta)
    ? `<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9878; GMT is modelled at <strong style="color:var(--text2)">&beta; ${fN(GB,2)}</strong> to Bitcoin (measured on ${fN(_gmtBeta.n,0)} days of daily returns): <strong style="color:var(--text2)">$${gp0.toFixed(4)} &rarr; $${gpEnd.toFixed(4)}</strong> by ${_endWhen}, 1&sigma; range <strong style="color:var(--text2)">$${gpLo.toFixed(4)}&ndash;$${gpHi.toFixed(4)}</strong>. Bitcoin explains only <strong style="color:var(--text2)">${fN(_gmtBeta.r2*100,0)}%</strong> of GMT's daily movement, so treat this leg as a rough average with a wide band, not a forecast.</div>`
    : '';
  const hwS=halvingsInWindow(days);
  const diffPenaltyPct=applyDiffGrind?Math.round((1-difficultyMultAt(targetMs))*100):0;
  const diffSkippedPct=applyDiffGrind?0:Math.round((1-difficultyMultAt(targetMs))*100);
  const _bwEnd=totEndTH>0?(th*curWTH+MP_TH*MP_WTH+greedyTH*greedyWTH)/totEndTH:curWTH;
  const effNoteS=(_bwStart-_bwEnd>0.05)?`<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9889; Reinvestment upgraded efficiency <strong style="color:var(--text2)">${_bwStart.toFixed(1)} &rarr; ${_bwEnd.toFixed(1)} W/TH</strong> to keep mining above break-even (capital is never spent on hashrate that nets $0).</div>`:'';
  const halvingNoteS=gmtNoteS+(applyDiffGrind
    ? `<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9143; ${hwS.length?`Mining reward halves at the ${hwS.join(' &amp; ')} halving${hwS.length>1?'s':''}, plus ` : 'Plus '}<strong style="color:var(--text2)">−${diffPenaltyPct}%</strong> from rising network difficulty over the period (both modeled).</div>`
    : `<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9143; ${hwS.length?`Mining reward halves at the ${hwS.join(' &amp; ')} halving${hwS.length>1?'s':''}. ` : ''}<strong style="color:var(--text2)">Network difficulty growth is OFF</strong> for a hand-set price — that curve is calibrated to pair with the fair-value path, not yours. The model would otherwise have taken a further <strong style="color:var(--text2)">−${diffSkippedPct}%</strong> off reward per TH over this period, so read this as your price scenario at today's difficulty, not a forecast.</div>`)+effNoteS;
  let h='';
  h+=`<div class="warn" style="margin-bottom:.8rem;background:rgba(245,166,35,.06);border-color:rgba(245,166,35,.2);color:var(--text2)">
    <strong style="color:var(--purple-soft)">Starting from ${fromPlanner?'your planned investment':'your current setup'}:</strong>
    <strong>${fN(startTH,1)} TH</strong> hashrate, <strong>${fN(startLocked,0)} GMT</strong> locked
    <div style="margin-top:.5rem;font-size:.75rem;color:var(--text3)">${btcRangeLine}${btcModeBadge}</div>${halvingNoteS}</div>`;
  h+=buildReinvestChart(daily,days,gp);

  // Re-price the FINAL state at each end of the GMT band. dailyNet reads gp from this scope, so
  // this is the same end-state farm valued at a cheaper and a dearer GMT — no re-simulation, and
  // it isolates exactly what the GMT assumption is worth to the answer.
  let gmtRangeNote='';
  if(gpSigma>0){
    const _gpSave=gp;
    gp=gpLo; const loMo=dailyNet(th,gmtLocked).net*30;
    gp=gpHi; const hiMo=dailyNet(th,gmtLocked).net*30;
    gp=_gpSave;
    const a=Math.min(loMo,hiMo), b=Math.max(loMo,hiMo);
    gmtRangeNote=`<div class="ri-breakdown" style="margin-top:.35rem">across the 1&sigma; GMT range ($${gpLo.toFixed(4)}&ndash;$${gpHi.toFixed(4)}): ${fU(a)}&ndash;${fU(b)}/mo</div>`;
  }
  const fb=dailyNet(th,gmtLocked);
  const breakdownMonthly=`mining ${fU(fb.mining*30)} + staking ${fU(fb.staking*30)}${ambDaily>0?` + ambassador ${fU(fb.amb*30)}`:''}`;
  h+=`<div class="ri-single-card">
    <div class="ri-label">Monthly Reward (End of Period)</div>
    <div class="ri-headline cyan">${fU(finalMonthly)}</div>
    <div class="ri-mo-yr alt"><span class="v">${fU(finalSS)}<i>/day</i></span><span class="ri-sep">&bull;</span><span class="v">${fU(finalYearly)}<i>/yr</i></span></div>
    <div class="ri-breakdown">${breakdownMonthly}</div>
    ${gmtRangeNote}
    <div class="ri-gain">${ssPct>=0?'+':''}${fN(ssPct,1)}% vs start</div>
  </div>`;
  {
    const yrs=days/365;
    const roiYr=yrs>0?ssPct/yrs:0;
    h+=`<div class="ri-single-card">
      <div class="ri-label">Projected ROI</div>
      <div class="ri-headline green">${roiYr>=0?'+':''}${fN(roiYr,1)}%<span style="font-size:.95rem;color:var(--text3);font-weight:600"> / yr</span></div>
      <div class="ri-breakdown">${ssPct>=0?'+':''}${fN(ssPct,1)}% reward growth over ${fN(yrs,1)} yr${Math.round(yrs)===1?'':'s'}</div>
    </div>`;
  }
  if(refFleetStartTH>0){
    const grew=refFleetTH-refFleetStartTH;
    h+=`<div class="ri-single-card">
      <div class="ri-label">Your Referral's Fleet (End of Period)</div>
      <div class="ri-headline cyan">${fN(refFleetTH,1)} TH</div>
      <div class="ri-usd-value">from ${fN(refFleetStartTH,1)} TH at 12 W/TH${refReinvest>0?` &middot; reinvesting ${fN(refReinvest*100,0)}% of their rewards`:' &middot; static (no reinvest rate set)'}</div>
      <div class="ri-gain">pays you ${fU(ambDailyUSD(refFleetTH,EFF_BEST)*30)}/mo in ambassador rewards${grew>0.05?` &middot; +${fN(grew,1)} TH grown`:''}</div>
    </div>`;
    if(totalRefBonusUSD>0){
      h+=`<div class="ri-single-card">
        <div class="ri-label">Referral Commission (over period)</div>
        <div class="ri-headline green">${fU(totalRefBonusUSD)}</div>
        <div class="ri-usd-value">${fN(refBonusRate*100,0)}% of every TH purchase they make, paid in GMT</div>
        <div class="ri-gain">reinvested alongside your own rewards</div>
      </div>`;
    }
  }
  if(totalDistributionUSD>0){
    const wks=days/7, payRate=ptype==='pct'?fP(pval)+' of weekly rewards':fU(pval)+'/wk';
    h+=`<div class="ri-single-card">
      <div class="ri-label">Income Paid Out (over period)</div>
      <div class="ri-headline green">${fU(totalDistributionUSD)}</div>
      <div class="ri-mo-yr">${fU(totalDistributionUSD/(days/30))}/mo avg<span class="ri-sep">&bull;</span>${payRate}</div>
      <div class="ri-gain">taken as income instead of reinvested</div>
    </div>`;
  }
  if(GRD.length){
    const gStart=GRD_START.reduce((s,m)=>s+m.th,0);
    const greedyGain=greedyTH-gStart;
    const multi=GRD.length>1;
    // "Capped" is a property of a machine, not the fleet — only say it when every one is full.
    const capped=GRD.every(m=>m.th>=GREEDY_CAP-1e-6);
    const per=multi?`<div class="ri-breakdown">${GRD.map((m,ix)=>{
      const st=GRD_START[ix]?GRD_START[ix].th:0;
      const nm=m.code?escapeHtml(m.code):`Machine ${ix+1}`;
      return `${nm}: ${fN(st,0)}&rarr;${fN(m.th,0)} TH @ ${fN(m.wth,1)} W${m.th>=GREEDY_CAP-1e-6?' &middot; at cap':''}`;
    }).join('<br>')}</div>`:'';
    h+=`<div class="ri-single-card">
      <div class="ri-label">Greedy Machine${multi?'s':''} TH (End of Period)</div>
      <div class="ri-headline cyan">${fN(greedyTH,1)} TH</div>
      <div class="ri-usd-value">from ${fN(gStart,1)} TH start${multi?` across ${GRD.length} machines`:''} &middot; ${fP(i.ggrow)}/wk passive${capped?` &middot; ${multi?'all':''} at the ${fN(GREEDY_CAP,0)} TH cap, passive only`:''}</div>
      ${per}
      <div class="ri-gain">+${fN(greedyGain,1)} TH &middot; ~${fU(greedyGain*estimateCPT(greedyTH),0)} free hashrate</div>
    </div>`;
  }
  h+=`<div class="ri-single-card">
    <div class="ri-label">Total Hashrate (End of Period)</div>
    <div class="ri-headline cyan">${fN(totEndTH,1)} TH</div>
    <div class="ri-usd-value">from ${fN(startTH,1)} TH start</div>
    <div class="ri-gain">+${fN(thGain,1)} TH${startTH>0?` (+${fN(thPct,0)}%)`:''}</div>
  </div>`;
  h+=`<div class="ri-single-card">
    <div class="ri-label">Locked GMT (End of Period)</div>
    <div class="ri-headline green">${fN(gmtLocked,0)} <img src="/gmt36.png" class="gmt-logo" alt="GMT"></div>
    <div class="ri-usd-value">${fU(lockedUSD)} USD value</div>
    <div class="ri-gain">+${fN(gmtGain,0)} GMT gained</div>
  </div>`;
  out.innerHTML=h;
  // Stash the key results so "Share projection image" can render a shareable card.
  window._shareData={
    days, startTH, startSS, startLocked, th:totEndTH, finalSS, gmtLocked, gp,
    // Only a Capital-Planner projection deploys new capital; a My Setup projection invests nothing.
    cap:(fromPlanner?(i.cap||0):0), thPct, ssPct, disc:finalEntry.disc, vip:finalEntry.vip,
    roiYr:(days/365>0?ssPct/(days/365):0), btcMode:btcSel.mode, bpStart, bpAtEnd
  };
  // Chart renders in Daily/USD by default — keep the toggle state in sync.
  window._reinvestUnit='usd';
  window._reinvestPeriod='day';
}

function buildReinvestXLabels(days){
  let step;
  if(days<=365)step=30;
  else if(days<=1095)step=90;
  else if(days<=3650)step=365;
  else step=730;
  const out=[];
  for(let d=step;d<=days;d+=step)out.push(d);
  return out;
}

function buildReinvestChart(daily,days,gp){
  const N=daily.length;
  const target=Math.min(150,N);
  const stride=Math.max(1,Math.floor(N/target));
  const pts=[];
  for(let i=0;i<N;i+=stride)pts.push({d:daily[i].d,v:daily[i].ssNet,gp:daily[i].gp});
  if(pts[pts.length-1].d!==daily[N-1].d)pts.push({d:daily[N-1].d,v:daily[N-1].ssNet,gp:daily[N-1].gp});
  const W=600,H=232,padL=72,padR=18,padT=20,padB=44;
  const innerW=W-padL-padR,innerH=H-padT-padB;

  // Store geometry + data for hover/toggle handlers
  window._reinvestChart={pts,gp,days,W,H,padL,padR,padT,padB,innerW,innerH};

  const ys=pts.map(p=>p.v);
  const yMax=Math.max(...ys,1e-9);
  const px=i=>padL+(i/(pts.length-1))*innerW;
  const py=v=>padT+innerH-(v/yMax)*innerH;
  let line='';
  for(let i=0;i<pts.length;i++)line+=(i===0?'M':' L')+px(i).toFixed(1)+' '+py(pts[i].v).toFixed(1);
  const area=line+` L ${px(pts.length-1).toFixed(1)} ${(padT+innerH).toFixed(1)} L ${padL} ${(padT+innerH).toFixed(1)} Z`;

  // X-axis ticks at 30-day (or scaled) increments
  const xTicks=buildReinvestXLabels(days);
  let xLabelHtml='';
  for(const td of xTicks){
    const xc=padL+(td/days)*innerW;
    xLabelHtml+=`<line x1="${xc.toFixed(1)}" y1="${padT+innerH}" x2="${xc.toFixed(1)}" y2="${padT+innerH+3}" stroke="rgba(255,255,255,.18)"/>`;
    xLabelHtml+=`<text x="${xc.toFixed(1)}" y="${H-10}" text-anchor="middle" fill="rgba(255,255,255,.55)" font-size="13" font-family="monospace">D${td}</text>`;
  }

  return `<div class="ri-chart-wrap">
    <div class="ri-chart-head">
      <div class="ri-chart-title">Reward Growth &middot; ${days} days</div>
      <div class="ri-chart-controls">
        <button class="ri-tog-btn active" data-period="day" onclick="setReinvestPeriod('day')">Daily</button>
        <button class="ri-tog-btn" data-period="month" onclick="setReinvestPeriod('month')">Monthly</button>
        <span class="ri-tog-sep"></span>
        <button class="ri-tog-btn active" data-unit="usd" onclick="setReinvestUnit('usd')">USD</button>
        <button class="ri-tog-btn" data-unit="gmt" onclick="setReinvestUnit('gmt')">GMT</button>
      </div>
    </div>
    <svg class="ri-chart-svg" viewBox="0 0 ${W} ${H}" id="riChartSvg" onmousemove="riChartHover(event)" onmouseleave="riChartLeave()">
      <defs>
        <linearGradient id="riChartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4ecffa" stop-opacity=".35"/>
          <stop offset="100%" stop-color="#4ecffa" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="rgba(255,255,255,.08)"/>
      <line x1="${padL}" y1="${padT+innerH}" x2="${padL+innerW}" y2="${padT+innerH}" stroke="rgba(255,255,255,.08)"/>
      <line x1="${padL}" y1="${padT+innerH/2}" x2="${padL+innerW}" y2="${padT+innerH/2}" stroke="rgba(255,255,255,.05)" stroke-dasharray="2 4"/>
      <path d="${area}" id="riChartArea" fill="url(#riChartGrad)"/>
      <path d="${line}" id="riChartLine" fill="none" stroke="#4ecffa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <line id="riChartCursor" x1="0" y1="${padT}" x2="0" y2="${padT+innerH}" stroke="#4ecffa" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
      <circle id="riChartDot" cx="0" cy="0" r="4" fill="#4ecffa" stroke="#fff" stroke-width="1.5" opacity="0"/>
      <text x="${padL-8}" y="${padT+4}" text-anchor="end" fill="rgba(255,255,255,.55)" font-size="14" font-family="monospace" id="riAxisMax">${fAxisUSD(yMax)}</text>
      <text x="${padL-8}" y="${padT+innerH/2+4}" text-anchor="end" fill="rgba(255,255,255,.55)" font-size="14" font-family="monospace" id="riAxisMid">${fAxisUSD(yMax/2)}</text>
      <text x="${padL-8}" y="${padT+innerH+4}" text-anchor="end" fill="rgba(255,255,255,.55)" font-size="14" font-family="monospace">0</text>
      ${xLabelHtml}
    </svg>
    <div class="ri-tooltip" id="riChartTip"></div>
  </div>`;
}

window._reinvestUnit='usd';
window._reinvestPeriod='day';

function riChartUpdateAxis(){
  const c=window._reinvestChart;if(!c)return;
  const unit=window._reinvestUnit,period=window._reinvestPeriod;
  const mult=period==='month'?30:1;
  const ys=c.pts.map(p=>p.v);
  const yMax=Math.max(...ys,1e-9);
  // GMT price moves across the run, so convert point-wise rather than at one rate.
  const scaled=unit==='gmt'?Math.max(...c.pts.map(p=>p.v/(p.gp||c.gp)),1e-9)*mult:yMax*mult;
  const fmt=v=>unit==='gmt'?fAxisGMT(v):fAxisUSD(v);
  const aMax=document.getElementById('riAxisMax');
  const aMid=document.getElementById('riAxisMid');
  if(aMax)aMax.textContent=fmt(scaled);
  if(aMid)aMid.textContent=fmt(scaled/2);
  const color=unit==='gmt'?'#5ad9a8':'#4ecffa';
  const line=document.getElementById('riChartLine');
  const cursor=document.getElementById('riChartCursor');
  const dot=document.getElementById('riChartDot');
  if(line)line.setAttribute('stroke',color);
  if(cursor)cursor.setAttribute('stroke',color);
  if(dot)dot.setAttribute('fill',color);
  document.querySelectorAll('#riChartGrad stop').forEach(s=>s.setAttribute('stop-color',color));
  const tipVal=document.querySelector('#riChartTip .ri-tip-val');
  if(tipVal)tipVal.classList.toggle('green',unit==='gmt');
}

function setReinvestUnit(unit){
  window._reinvestUnit=unit;
  document.querySelectorAll('#reinvestResult [data-reinvest-unit],#spResult [data-reinvest-unit]').forEach(el=>{
    el.style.display=el.dataset.reinvestUnit===unit?'':'none';
  });
  document.querySelectorAll('#reinvestResult [data-unit],#spResult [data-unit]').forEach(b=>b.classList.toggle('active',b.dataset.unit===unit));
  riChartUpdateAxis();
}

function setReinvestPeriod(period){
  window._reinvestPeriod=period;
  document.querySelectorAll('#reinvestResult [data-period],#spResult [data-period]').forEach(b=>b.classList.toggle('active',b.dataset.period===period));
  riChartUpdateAxis();
}

function riChartHover(e){
  const c=window._reinvestChart;if(!c)return;
  const svg=e.currentTarget;
  const rect=svg.getBoundingClientRect();
  const vbX=((e.clientX-rect.left)/rect.width)*c.W;
  if(vbX<c.padL||vbX>c.padL+c.innerW){riChartLeave();return;}
  const frac=(vbX-c.padL)/c.innerW;
  const idx=Math.max(0,Math.min(c.pts.length-1,Math.round(frac*(c.pts.length-1))));
  const pt=c.pts[idx];
  const ys=c.pts.map(p=>p.v);
  const yMax=Math.max(...ys,1e-9);
  const ptX=c.padL+(idx/(c.pts.length-1))*c.innerW;
  const ptY=c.padT+c.innerH-(pt.v/yMax)*c.innerH;
  const cursor=document.getElementById('riChartCursor');
  const dot=document.getElementById('riChartDot');
  cursor.setAttribute('x1',ptX);cursor.setAttribute('x2',ptX);cursor.style.opacity='.55';
  dot.setAttribute('cx',ptX);dot.setAttribute('cy',ptY);dot.style.opacity='1';

  const unit=window._reinvestUnit,period=window._reinvestPeriod;
  const mult=period==='month'?30:1;
  const val=unit==='gmt'?(pt.v/(pt.gp||c.gp))*mult:pt.v*mult;
  const valStr=unit==='gmt'?fN(val,val>=1000?0:2)+' GMT':fU(val);
  const suffix=period==='month'?'/mo':'/day';
  const tip=document.getElementById('riChartTip');
  tip.innerHTML=`<div class="ri-tip-day">Day ${pt.d}</div><div class="ri-tip-val${unit==='gmt'?' green':''}">${valStr}${suffix}</div>`;
  const wrap=tip.parentElement.getBoundingClientRect();
  let left=e.clientX-wrap.left+14;
  let top=e.clientY-wrap.top-44;
  if(left+140>wrap.width)left=e.clientX-wrap.left-152;
  if(top<6)top=e.clientY-wrap.top+18;
  tip.style.left=left+'px';
  tip.style.top=top+'px';
  tip.style.opacity='1';
}

function riChartLeave(){
  const cursor=document.getElementById('riChartCursor');
  const dot=document.getElementById('riChartDot');
  const tip=document.getElementById('riChartTip');
  if(cursor)cursor.style.opacity='0';
  if(dot)dot.style.opacity='0';
  if(tip)tip.style.opacity='0';
}

function buildShareCanvas(d){
  const S=2,W=1200,H=675;
  const c=document.createElement('canvas');
  c.width=W*S;c.height=H*S;
  const x=c.getContext('2d');x.scale(S,S);
  const pad=50;
  const GOLD='#F5A623',GSOFT='#F7B84E',GLT='#FFCF7A';
  // background — site gold-on-black
  const bgG=x.createLinearGradient(0,0,W,H);
  bgG.addColorStop(0,'#0a0a0a');bgG.addColorStop(0.5,'#100c06');bgG.addColorStop(1,'#0a0a0a');
  x.fillStyle=bgG;x.fillRect(0,0,W,H);
  const orb=(cx,cy,r,a)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(245,166,35,'+a+')');g.addColorStop(0.5,'rgba(245,166,35,'+(a*0.4)+')');g.addColorStop(1,'rgba(245,166,35,0)');x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2);};
  orb(140,90,380,0.18);orb(1060,230,320,0.12);orb(600,770,380,0.07);orb(W/2,-40,460,0.10);
  x.strokeStyle='rgba(245,166,35,0.05)';x.lineWidth=0.5;
  for(let gy=0;gy<H;gy+=50){x.beginPath();x.moveTo(0,gy);x.lineTo(W,gy);x.stroke();}
  for(let gx=0;gx<W;gx+=50){x.beginPath();x.moveTo(gx,0);x.lineTo(gx,H);x.stroke();}
  // header
  x.fillStyle='#ffffff';x.font='bold 56px Space Grotesk,system-ui,sans-serif';x.textAlign='center';
  x.shadowColor='rgba(245,166,35,0.55)';x.shadowBlur=28;
  x.fillText(d.days+'-Day Growth Projection',W/2,72);x.shadowBlur=0;
  x.fillStyle='rgba(247,184,78,0.92)';x.font='22px "Share Tech Mono",monospace';
  const btcSub=d.btcMode==='live'?'':'  •  BTC '+fmtBTCPrice(d.bpStart)+' → '+fmtBTCPrice(d.bpAtEnd)+' (linear)';
  x.fillText('Auto-Reinvest Compound Strategy'+btcSub+'  •  powered by gmt-optimizer.com',W/2,108);
  const lg=x.createLinearGradient(pad,0,W-pad,0);
  lg.addColorStop(0,'transparent');lg.addColorStop(0.5,'rgba(245,166,35,0.6)');lg.addColorStop(1,'transparent');
  x.strokeStyle=lg;x.lineWidth=2;x.beginPath();x.moveTo(pad,128);x.lineTo(W-pad,128);x.stroke();
  // comparison cards
  const cardW=510,cardH=350,cardY=150,gap=80;
  const leftX=(W-cardW*2-gap)/2,rightX=leftX+cardW+gap;
  const drawCard=(cx,cy,title,accent,items)=>{
    const cbg=x.createLinearGradient(cx,cy,cx,cy+cardH);
    cbg.addColorStop(0,'rgba(245,166,35,0.06)');cbg.addColorStop(1,'rgba(245,166,35,0.015)');
    x.fillStyle=cbg;x.beginPath();x.roundRect(cx,cy,cardW,cardH,18);x.fill();
    x.strokeStyle='rgba(245,166,35,0.2)';x.lineWidth=1.5;x.beginPath();x.roundRect(cx,cy,cardW,cardH,18);x.stroke();
    x.shadowColor=accent;x.shadowBlur=16;x.strokeStyle=accent;x.lineWidth=3;
    x.beginPath();x.moveTo(cx+18,cy);x.lineTo(cx+cardW-18,cy);x.stroke();x.shadowBlur=0;
    x.fillStyle=accent;x.font='bold 26px Space Grotesk,system-ui,sans-serif';x.textAlign='left';
    x.fillText(title,cx+30,cy+50);
    items.forEach((it,i)=>{const iy=cy+105+i*68;
      x.fillStyle='rgba(255,255,255,0.55)';x.font='20px "Share Tech Mono",monospace';x.textAlign='left';x.fillText(it.label,cx+30,iy);
      x.fillStyle=accent;x.font='bold 38px "Share Tech Mono",monospace';x.fillText(it.val,cx+30,iy+38);
    });
  };
  drawCard(leftX,cardY,'STARTING POSITION',GLT,[
    {label:'HASHRATE',val:fN(d.startTH,0)+' TH'},
    {label:'DAILY REWARD',val:fU(d.startSS,0)},
    {label:'MONTHLY INCOME',val:fU(d.startSS*30,0)},
    {label:'GMT Value',val:fU((d.startLocked||0)*d.gp,0)},
  ]);
  drawCard(rightX,cardY,'AFTER '+d.days+' DAYS',GSOFT,[
    {label:'HASHRATE',val:fN(d.th,0)+' TH'},
    {label:'DAILY REWARD',val:fU(d.finalSS,0)},
    {label:'MONTHLY INCOME',val:fU(d.finalSS*30,0)},
    {label:'GMT Value',val:fU((d.gmtLocked||0)*d.gp,0)},
  ]);
  x.fillStyle=GSOFT;x.shadowColor='rgba(245,166,35,0.7)';x.shadowBlur=22;
  x.font='bold 56px "General Sans",system-ui,sans-serif';x.textAlign='center';
  x.fillText('➤',W/2,cardY+cardH/2+10);x.shadowBlur=0;
  // stat pills (incl. ROI)
  const pillY=cardY+cardH+25;
  const vip=(d.vip&&d.vip.n)?d.vip.n:(d.vip||'—');
  const pills=[];
  // INVESTED + ROI are capital-deployment metrics — only show them when capital was actually
  // deployed (a Capital Planner projection). A My Setup projection invests nothing, so omit them.
  if(d.cap>0){
    pills.push({label:'INVESTED',val:fU(d.cap,0)});
    pills.push({label:'ROI',val:(d.roiYr>=0?'+':'')+fN(d.roiYr,0)+'%'});
  }
  pills.push(
    {label:'TH GROWTH',val:'+'+fN(d.thPct,0)+'%'},
    {label:'REWARD GROWTH',val:(d.ssPct>=0?'+':'')+fN(d.ssPct,0)+'%'},
    {label:'DISCOUNT',val:fN(d.disc,0)+'%'},
    {label:'VIP',val:vip}
  );
  const pillPad=20,pillGap=12,pillH=70;
  const pwArr=pills.map(p=>{x.font='bold 15px "Share Tech Mono",monospace';const lw=x.measureText(p.label).width;x.font='bold 26px "Share Tech Mono",monospace';const vw=x.measureText(p.val).width;return Math.max(lw,vw)+pillPad*2;});
  const totalW=pwArr.reduce((a,b)=>a+b,0)+pillGap*(pills.length-1);
  let pxp=(W-totalW)/2;
  pills.forEach((p,i)=>{const w=pwArr[i];
    x.fillStyle='rgba(245,166,35,0.06)';x.beginPath();x.roundRect(pxp,pillY,w,pillH,12);x.fill();
    x.strokeStyle='rgba(245,166,35,0.22)';x.lineWidth=1;x.beginPath();x.roundRect(pxp,pillY,w,pillH,12);x.stroke();
    x.fillStyle='rgba(255,255,255,0.6)';x.font='bold 15px "Share Tech Mono",monospace';x.textAlign='center';x.fillText(p.label,pxp+w/2,pillY+26);
    x.fillStyle=GSOFT;x.font='bold 26px "Share Tech Mono",monospace';x.fillText(p.val,pxp+w/2,pillY+58);
    pxp+=w+pillGap;
  });
  // footer
  const footY=H-38;
  const fg=x.createLinearGradient(pad,0,W-pad,0);
  fg.addColorStop(0,'transparent');fg.addColorStop(0.5,'rgba(245,166,35,0.4)');fg.addColorStop(1,'transparent');
  x.strokeStyle=fg;x.lineWidth=1.2;x.beginPath();x.moveTo(pad,footY-22);x.lineTo(W-pad,footY-22);x.stroke();
  x.textAlign='left';x.fillStyle=GOLD;x.font='bold 14px "General Sans",system-ui,sans-serif';x.fillText('●',pad,footY);
  x.fillStyle='rgba(255,255,255,0.7)';x.font='bold 20px Space Grotesk,system-ui,sans-serif';x.fillText('gmt-optimizer.com',pad+18,footY+1);
  x.textAlign='center';x.fillStyle='rgba(255,255,255,0.4)';x.font='15px "Share Tech Mono",monospace';
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});x.fillText(now,W/2,footY+1);
  x.textAlign='right';x.fillStyle=GSOFT;x.font='bold 17px "Share Tech Mono",monospace';x.fillText('use code RINGO5',W-pad,footY+1);
  x.textAlign='left';
  return c;
}

// ---- REACTIVE ----
document.querySelectorAll('input').forEach(el=>{el.addEventListener('input',recalc);el.addEventListener('change',recalc)});

// ---- TIMER ----
setInterval(()=>{S.timer--;if(S.timer<=0){S.timer=3600;fetchData()}const ago=Math.max(0,3600-S.timer);const t=$('refreshTimer');if(t)t.textContent=ago<60?ago+'s ago':Math.floor(ago/60)+'m ago'},1000);

// ---- TOOLTIPS (touch) ----
document.addEventListener('click',e=>{
  document.querySelectorAll('.tip.show').forEach(t=>t.classList.remove('show'));
  if(e.target.classList.contains('tip')){e.preventDefault();e.target.classList.add('show')}
});

// ---- ONBOARDING ----
function obZoom(e,el){
  const r=el.getBoundingClientRect();
  const x=((e.clientX-r.left)/r.width)*100;
  const y=((e.clientY-r.top)/r.height)*100;
  const img=el.querySelector('.ob-tutorial-img');
  if(img)img.style.transformOrigin=x+'% '+y+'%';
}
function openLightbox(el){
  const img=el.querySelector('img');if(!img)return;
  const lb=document.getElementById('lightbox'),li=document.getElementById('lightboxImg');
  if(!lb||!li)return;
  li.src=img.src;li.alt=img.alt||'';lb.style.display='flex';
}
function closeLightbox(){const lb=document.getElementById('lightbox');if(lb)lb.style.display='none';}
function togglePiOpt(btn,id){
  const el=document.getElementById(id);if(!el)return;
  const opening=el.hasAttribute('hidden');
  if(opening){el.removeAttribute('hidden');btn.classList.add('open');}
  else{el.setAttribute('hidden','');btn.classList.remove('open');}
}
let obCur=0;
function initOnboarding(){
  // Opt-in only. This used to fire for anyone without a gm_onboarded flag, so a cleared
  // cache or a new browser meant being ambushed by a full-screen wizard before you could
  // see the tool. It now opens solely on request from the landing page's CTAs.
  if(!/[?&]setup=1/.test(location.search))return;
  document.getElementById('onboarding').style.display='';
  document.body.style.overflow='hidden';
  // Straight into entering the farm — step 0 is the "new or existing?" chooser, and
  // clicking "I'm already mining" has already answered it.
  obGoStep(1);
  // Drop the param once it's been acted on, so refreshing or sharing the URL afterwards
  // lands on the console rather than reopening the wizard.
  try{history.replaceState({},'',location.pathname+location.hash);}catch(e){}
}
const OB_LAST_STEP=6;
function obGoStep(n){
  if(n<0||n>OB_LAST_STEP)return;
  obCur=n;
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.ob-dot').forEach((d,i)=>{d.classList.toggle('active',i===n);d.classList.toggle('done',i<n)});
  const step=document.querySelector(`[data-ob-step="${n}"]`);
  step.classList.add('active');
  // Stagger reveal delays for children within the step
  const revealEls=step.querySelectorAll('.ob-step-reveal,.ob-field,.ob-toggle-row,.ob-preview-card');
  revealEls.forEach((el,i)=>{el.style.transitionDelay=(0.15+i*0.12)+'s'});
  // Step 0 is the marketing landing page — it has its own CTAs, so hide the wizard dots + nav there,
  // and switch on the artistic background (aurora + loupe rings) only for the landing.
  const nav=document.querySelector('.ob-nav'),dots=document.querySelector('.ob-dots');
  if(nav)nav.style.display=n===0?'none':'flex';
  if(dots)dots.style.display=n===0?'none':'flex';
  document.getElementById('onboarding').classList.toggle('lp-active',n===0);
  document.getElementById('obBack').style.display=n===0?'none':'';
  const newBtn=document.getElementById('obNewBtn'),nextBtn=document.getElementById('obNext');
  newBtn.style.display=n===0?'':'none';
  if(n===0){newBtn.classList.remove('ob-reveal');newBtn.style.opacity='1';nextBtn.classList.remove('ob-reveal');nextBtn.style.opacity='1'}
  if(n===0)nextBtn.innerHTML='Get Started<br><span style="font-size:.6rem;font-weight:400;opacity:.7">(existing setup)</span>';
  else if(n===OB_LAST_STEP)nextBtn.textContent='Launch Dashboard';
  else nextBtn.textContent='Next';
  if(n===OB_LAST_STEP)obPreview();
}
function obNext(){
  if(obCur<OB_LAST_STEP){obGoStep(obCur+1);if(obCur>=1)syncOB()}
  else obFinish();
}
function setCurrency(c){
  S.currency=c;
  S.fxRate=c==='GBP'?(S.gbpRate||0.79):c==='EUR'?(S.eurRate||0.92):1;
  const ob=document.getElementById('obCurrency');if(ob)ob.value=c;
  const main=document.getElementById('inCurrency');if(main)main.value=c;
  try{localStorage.setItem('gm_currency',c)}catch(e){}
  recalc();
}
function syncOB(){
  const map={obTH:'inTH',obWTH:'inWTH',obGMTLocked:'inGMTLocked',obGMTWallet:'inGMTWallet'};
  for(const[ob,main]of Object.entries(map)){const el=document.getElementById(ob);if(el&&el.value)document.getElementById(main).value=el.value}
  document.getElementById('inClickStreak').checked=document.getElementById('obClickStreak')?.checked||false;
  document.getElementById('inPayGMT').checked=document.getElementById('obPayGMT')?.checked??true;
  const cur=document.getElementById('obCurrency')?.value||'USD';
  setCurrency(cur);
}
function obPreview(){
  syncOB();
  if(S.loaded){
    const i=inp(),m=calc(i);
    // Mirror the My Setup hero card: mining + staking + ambassador,
    // otherwise the preview shows a lower number than the dashboard.
    const netUSD=m.net*m.bp;
    const dailyStakeUSD=(m.wkGMT/7)*m.gp;
    const isAmb=$('inAmbassador').checked;
    const refTH=isAmb?(+$('inReferredTH').value||0):0;
    const ambDaily=ambDailyUSD(refTH,AMB_DEFAULT_WTH);
    const gWk=(m.gth||0)*((+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0)/100), gwp=m.gwth||0;
    const gDaily=gWk/7*cptAtEff(m.gth||1,gwp);
    const totalDailyUSD=netUSD+dailyStakeUSD+ambDaily+gDaily;
    document.getElementById('obPrevDaily').textContent=fU(totalDailyUSD);
    document.getElementById('obPrevMonthly').textContent=fU(totalDailyUSD*30);
    document.getElementById('obPrevDiscount').textContent=fP(m.totD);
    document.getElementById('obPrevVip').textContent=m.vip.n;
  }
}
function obFinish(){
  syncOB();
  try{localStorage.setItem('gm_onboarded','1')}catch(e){}
  // Brief "launching" spinner, then reveal the dashboard with the count-up, then the donate prompt.
  const load=document.getElementById('newUserLoading');
  const txt=load?load.querySelector('.sp-loading-txt'):null, prev=txt?txt.textContent:'';
  if(txt)txt.textContent='Launching your dashboard…';
  if(load)load.style.display='flex';
  setTimeout(function(){
    document.getElementById('onboarding').style.display='none';
    if(load)load.style.display='none';
    if(txt)txt.textContent=prev;
    refreshMySetupAnimation();   // reveal My Setup with the numbers counting up from 0
    setTimeout(function(){document.getElementById('donateModal').style.display='';},1200);
  },850);
}
function closeDonate(){
  document.getElementById('donateModal').style.display='none';
  document.body.style.overflow='';
  recalc();
}
function copyAddr(el,addr){
  navigator.clipboard.writeText(addr).catch(()=>{});
  const msg=document.getElementById('donateCopied');
  msg.classList.add('show');
  setTimeout(()=>msg.classList.remove('show'),2000);
}
function copyFooterAddr(addr){
  navigator.clipboard.writeText(addr).catch(()=>{});
  const msg=document.getElementById('footerCopied');
  msg.classList.add('show');
  setTimeout(()=>msg.classList.remove('show'),2000);
}
function obNewUser(){
  // Zero out all onboarding fields
  ['obTH','obGMTLocked','obGMTWallet'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0'});
  // A brand-new miner can only mint a 12 W/TH machine, so seed the 12W rating and its $/TH —
  // never the 15W marketplace figures, which describe hardware they cannot buy.
  const wth=document.getElementById('obWTH');if(wth)wth.value=String(EFF_BEST);
  const cpt=document.getElementById('obCPT');if(cpt)cpt.value=estimateCPT12(0).toFixed(2);
  const apr=document.getElementById('obLockAPR');if(apr)apr.value='23.1';
  const cs=document.getElementById('obClickStreak');if(cs)cs.checked=false;
  const pg=document.getElementById('obPayGMT');if(pg)pg.checked=true;
  // Sync zeros to main inputs
  syncOB();
  // Zero the extras that syncOB doesn't touch, so "Current" starts at $0.
  ['inGreedyTH','inGreedyInitial','inMpTH','inMpGMT','inReferredTH','inRefCapital'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='0';});
  const gw=document.getElementById('inGreedyWth');if(gw)gw.value='';
  if(typeof refreshGreedyVisibility==='function')refreshGreedyVisibility();
  // Close onboarding
  try{localStorage.setItem('gm_onboarded','1')}catch(e){}
  document.getElementById('onboarding').style.display='none';
  document.body.style.overflow='';
  // Switch to Capital Planner tab
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  const planBtn=document.querySelector('[data-tab="tab-planner"]');
  if(planBtn)planBtn.classList.add('active');
  const planTab=document.getElementById('tab-planner');
  if(planTab)planTab.classList.add('active');
  recalc();
  // Show new user welcome page
  const m=document.getElementById('newUserModal');if(m){m.style.display='';m.scrollTop=0;document.body.style.overflow='hidden';}
}
function goBackFromNewUser(){
  document.getElementById('newUserModal').style.display='none';
  document.getElementById('onboarding').style.display='';
  document.body.style.overflow='hidden';
  obGoStep(0);
}
function submitNewUserBudget(){
  const budgetEl=document.getElementById('newUserBudget');
  const budget=budgetEl?parseFloat(budgetEl.value)||0:0;
  const capEl=document.getElementById('inCapital');if(capEl)capEl.value=budget;
  window._plannerCalcDone=true;
  const btn=document.getElementById('newUserBtn');
  const load=document.getElementById('newUserLoading');
  if(btn)btn.disabled=true;
  if(load)load.style.display='flex';
  setTimeout(function(){
    recalc();
    document.getElementById('newUserModal').style.display='none';
    document.body.style.overflow='';
    if(load)load.style.display='none';
    if(btn)btn.disabled=false;
    window.scrollTo(0,0);
    animatePlannerResults();   // load the results with the fresh count-up
  },800);
}
function resetOnboarding(){
  // Nothing gates on the old gm_onboarded flag any more, so clearing it and reloading
  // would do nothing. Reopening the wizard now means asking for it by URL.
  location.href='/console?setup=1';
}

// ---- SCROLL REVEAL ----
const revealObs=new IntersectionObserver((entries)=>{
  entries.forEach((e,i)=>{
    if(e.isIntersecting){
      // Stagger siblings in the same parent (e.g. hero cards)
      const parent=e.target.parentElement;
      const siblings=[...parent.querySelectorAll(':scope > .reveal:not(.visible)')];
      const idx=siblings.indexOf(e.target);
      e.target.style.transitionDelay=(idx>=0?idx*0.1:0)+'s';
      e.target.classList.add('visible');
      revealObs.unobserve(e.target);
    }
  });
},{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>revealObs.observe(el));


// ---- INIT ----
try{const sc=localStorage.getItem('gm_currency');if(sc&&sc!=='USD')setCurrency(sc)}catch(e){}
fetchData();
initOnboarding();
// /planner, /projection and /planner/projection are static stubs that land here as
// /console?view=<name> (a plain <a href="/planner"> can't deep-link a tab or panel).
// Nothing read that param, so every one of those URLs silently dumped you on My Setup.
function _activateTabById(id){
  const b=document.querySelector('[data-tab="'+id+'"]');
  if(b)_activateTab(b,false);   // false = don't push history; we own the URL below
}
(function routeViewParam(){
  const view=new URLSearchParams(location.search).get('view');
  if(!view)return;
  // Onboarding covers the page and chooses its own destination — just drop the query.
  if(document.documentElement.classList.contains('show-onboarding')){
    try{history.replaceState({},'',location.pathname+location.hash);}catch(e){}
    return;
  }
  // Panel views each write their own pretty URL when opened, and need the right tab
  // underneath so that closing them returns where the stub implied.
  switch(view){
    case 'edit':               openEditSetup(); return;
    case 'rainbow':            openRainbow();   return;
    case 'combined':           openCombined();  return;
    case 'projection':         _activateTabById('tab-current'); openSetupProjection('setup');   return;
    case 'planner-projection': _activateTabById('tab-planner'); openSetupProjection('planner'); return;
  }
  // Plain tab views own no panel, so set the URL here.
  _activateTabById(view==='planner'?'tab-planner':'tab-current');
  try{history.replaceState({},'',(view==='planner'?'/planner':'/console')+location.hash);}catch(e){}
})();
