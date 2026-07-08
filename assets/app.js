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
const TH_TIERS=[
  {th:1,cpt:14.99},{th:2,cpt:14},{th:4,cpt:14},{th:8,cpt:13.75},
  {th:16,cpt:13.56},{th:32,cpt:13.44},{th:48,cpt:13.29},{th:64,cpt:13.16},
  {th:96,cpt:13.03},{th:128,cpt:12.90},{th:192,cpt:12.77},{th:256,cpt:12.64},
  {th:384,cpt:12.51},{th:512,cpt:12.39},{th:768,cpt:12.27},{th:1024,cpt:12.14},
  {th:1536,cpt:12.02},{th:2560,cpt:11.90},{th:3584,cpt:11.78},{th:5000,cpt:11.67}
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
const TH_TIERS_12W=[
  {th:1,cpt:21.99},{th:2,cpt:21.50},{th:4,cpt:21.00},{th:8,cpt:20.75},
  {th:16,cpt:20.50},{th:32,cpt:20.28},{th:48,cpt:20.06},{th:64,cpt:19.86},
  {th:96,cpt:19.66},{th:128,cpt:19.46},{th:192,cpt:19.27},{th:256,cpt:19.07},
  {th:384,cpt:18.88},{th:512,cpt:18.69},{th:768,cpt:18.51},{th:1024,cpt:18.32},
  {th:1536,cpt:18.14},{th:2560,cpt:17.96},{th:3584,cpt:17.78},{th:5000,cpt:17.60}
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

// Marginal net-monthly impact of deploying GROWTH capital down each path, at price bp.
// Capital split: gmtUSD = USD value of existing GMT (no conversion fee — upgrades/TH are paid
// in GMT directly), usdUSD = USD cash (pays the 2% USD→GMT fee).
// Discount is held FIXED at the current level: this answers "best use of growth capital while
// you MAINTAIN your token discount" (securing the discount is the main allocation's job). So
// TH never shows a phantom loss from coverage dipping, and Lock GMT here is staking-yield only.
function evalPaths(i,gmtUSD,usdUSD,bp,minerTH){
  const gp=S.gmtPrice||FB.gmtPrice, fee=USD_GMT_FEE, cf=CONVERSION_FEE, curW=i.wth, dbt=dailyBTCperTH();
  gmtUSD=Math.max(0,gmtUSD||0);usdUSD=Math.max(0,usdUSD||0);
  const K=gmtUSD+usdUSD;                 // nominal capital deployed (for ROI / display)
  const eff=gmtUSD+usdUSD*(1-fee);       // effective GMT purchasing power in USD terms
  const ppRate=K>0?eff/K:1-fee;          // GMT-USD per nominal-USD; convert a GMT cost → nominal
  const toNominal=gmtCost=>gmtCost/ppRate;
  const d=(calc(i).totD)/100;            // current discount, held fixed (greedy TH cancels in deltas)
  const netFix=(th,w)=>((dbt*th-((0.0012*w+0.0089)/bp)*th*(1-d))*(1-cf))*bp*30;
  const base=netFix(i.th,curW), out={base,K};
  // 15 W TH — upgrade an existing machine up to the 5,000 TH cap (cheap raw hashrate)
  {
    const room=Math.max(0,MINER_CAP-i.th), want=thForBudget(eff);
    let dth=Math.min(room,want), usd=K, capped=false;
    if(want>room&&room>0){capped=true;usd=toNominal(room*cptTier(TH_TIERS,i.th+room/2));}
    if(room<=0){dth=0;usd=0;}
    const nth=i.th+dth, nwth=nth>0?(i.th*curW+dth*EFF_BASE_MAX)/nth:curW;
    out.th15={dth,usd,room,capped,mo:netFix(nth,nwth)-base};
  }
  // 12 W TH — create a new machine (no cap)
  {
    const dth=thForBudgetTiers(eff,TH_TIERS_12W), nth=i.th+dth;
    const nwth=nth>0?(i.th*curW+dth*EFF_BEST)/nth:curW;
    out.th12={dth,usd:K,mo:netFix(nth,nwth)-base};
  }
  // Upgrade efficiency of a SPECIFIC machine (minerTH of hashrate) down to 12 W.
  // Upgrades are per-machine: minerTH defaults to the whole standalone farm but the user
  // can point it at one miner. Cost = upgraded TH × $2.67 per 1 W/TH step toward 12.
  {
    const cap=Math.max(0,Math.min(minerTH>0?minerTH:i.th,i.th));
    const cpt=effUpgradeCostPerTH(curW);let dth=0,nwth=curW,usd=0;
    if(cpt>0&&cap>0){dth=Math.min(cap,eff/cpt);nwth=i.th>0?((i.th-dth)*curW+dth*EFF_BEST)/i.th:curW;usd=toNominal(dth*cpt);}
    out.upg={dth,cpt,usd,minerTH:cap,na:cpt<=0,newWth:nwth,mo:netFix(i.th,nwth)-base};
  }
  // Lock GMT — staking yield only here (securing the 20% discount is handled in the allocation above).
  {
    const dgmt=eff/gp, staking=dgmt*(i.apr||0)/100/12*gp;
    out.gmt={dgmt,usd:K,staking,mo:staking};
  }
  return out;
}

// BTC price where upgrading the existing 15 W machine starts to beat creating a new 12 W machine.
// Analytic, at a FIXED discount (consistent with the cards): ΔTH15·(g−m15) = ΔTH12·(g−m12) ⇒ g,
// bp = g/dbt. Above it, cheaper raw 15 W hashrate wins; below it, 12 W's lower maintenance wins.
function btcCrossover(i,eff){
  const room=Math.max(0,MINER_CAP-i.th), want=thForBudget(eff);
  const dth15=Math.min(room,want), dth12=thForBudgetTiers(eff,TH_TIERS_12W);
  if(dth15<=0)return{capped:true,bp:null};
  if(dth15<=dth12)return{capped:want>room,bp:null};
  const d=(calc(i).totD)/100, dbt=dailyBTCperTH();
  const m15=(0.0012*EFF_BASE_MAX+0.0089)*(1-d), m12=(0.0012*EFF_BEST+0.0089)*(1-d);
  const g=(dth15*m15-dth12*m12)/(dth15-dth12), bp=dbt>0?g/dbt:null;
  return{capped:want>room,bp:(bp&&bp>0&&isFinite(bp))?bp:null};
}

// Greedy marginal allocator: spends capital where the NEXT dollar earns most, re-running the real
// calc() each step so the token discount is ALWAYS respected — adding TH erodes coverage, which
// raises the value of locking GMT, so locks and TH interleave to HOLD the 20% discount. Returns the
// optimal split across {lock GMT, buy TH (15 W upgrade / 12 W new), upgrade efficiency}.
function optimalSplit(i,gmtUSD,usdUSD,bp,minerTH){
  const gp=S.gmtPrice||FB.gmtPrice, fee=USD_GMT_FEE, cf=CONVERSION_FEE, aprMo=(i.apr||0)/100/12;
  gmtUSD=Math.max(0,gmtUSD||0);usdUSD=Math.max(0,usdUSD||0);
  const K=gmtUSD+usdUSD, eff=gmtUSD+usdUSD*(1-fee), ppRate=K>0?eff/K:1-fee;
  if(eff<=0)return null;
  const minerCap=Math.max(0,Math.min(minerTH>0?minerTH:i.th,i.th)), cptU=effUpgradeCostPerTH(i.wth);
  const STEPS=60, incr=eff/STEPS;
  const s={gl:0,th15:0,th12:0,effTH:0};   // amounts ADDED (gl in GMT, th/eff in TH)
  const spent={lock:0,th:0,eff:0};        // eff-USD allocated per category
  const setupOf=st=>{
    const totStand=i.th+st.th15+st.th12;
    const wsum=(i.th-st.effTH)*i.wth+st.effTH*EFF_BEST+st.th15*EFF_BASE_MAX+st.th12*EFF_BEST;
    return {...i,th:totStand,wth:totStand>0?wsum/totStand:i.wth,gl:i.gl+st.gl};
  };
  const objOf=st=>{const c=calc(setupOf(st));return c.net*c.bp*30+st.gl*aprMo*gp;};
  const base=objOf(s); let cur=base;
  for(let step=0;step<STEPS;step++){
    const c=calc(setupOf(s));
    // Lock GMT: forward ROI to the next discount step; pure staking once at the 20% cap.
    let lockROI;
    if(c.eTok>=20){lockROI=aprMo*12;}
    else{
      const targetCov=(c.eTok+1)*18, needGMT=Math.max(incr/gp,targetCov*c.feesGMT-(i.gl+s.gl+i.gw));
      const stepSaveMo=c.f.t*0.01*(1-cf)*bp*30;
      lockROI=(stepSaveMo*12)/(needGMT*gp)+aprMo*12;
    }
    // Buy TH: 15 W upgrade while the machine has room, else a new 12 W machine.
    const room=Math.max(0,MINER_CAP-(i.th+s.th15)), th15Mode=room>0.01;
    const thDth=th15Mode?Math.min(room,thForBudget(incr)):thForBudgetTiers(incr,TH_TIERS_12W);
    const thState={...s};if(th15Mode)thState.th15+=thDth;else thState.th12+=thDth;
    const thROI=thDth>0?(objOf(thState)-cur)*12/incr:-Infinity;
    // Upgrade efficiency of the chosen miner.
    let effROI=-Infinity,effDth=0;
    if(cptU>0&&s.effTH<minerCap-0.01){
      effDth=Math.min(minerCap-s.effTH,incr/cptU);
      const effState={...s};effState.effTH+=effDth;
      effROI=(objOf(effState)-cur)*12/incr;
    }
    const opts=[['lock',lockROI],['th',thROI],['eff',effROI]].sort((a,b)=>b[1]-a[1]);
    const winner=opts[0][0];
    if(winner==='lock'){s.gl+=incr/gp;spent.lock+=incr;}
    else if(winner==='th'){if(th15Mode)s.th15+=thDth;else s.th12+=thDth;spent.th+=incr;}
    else{s.effTH+=effDth;spent.eff+=incr;}
    cur=objOf(s);
  }
  const fin=setupOf(s);
  return {spent,eff,K,ppRate,gp,totalMo:cur-base,baseMo:base,
    lockPct:spent.lock/eff*100,thPct:spent.th/eff*100,effPct:spent.eff/eff*100,
    th15:s.th15,th12:s.th12,effTH:s.effTH,glAdd:s.gl,finWth:fin.wth,finTH:fin.th};
}
function autoFillCPT(thId,cptId){
  const th=parseFloat(document.getElementById(thId).value)||0;
  const el=document.getElementById(cptId);
  const est=estimateCPT(th);
  el.value=est.toFixed(2);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  const hint=document.getElementById('cptAutoHint');
  if(hint&&th>0)hint.textContent='Auto-estimated ~$'+est.toFixed(2)+'/TH for '+fN(th,0)+' TH farm';
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
document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{
  const prev=document.querySelector('.tab-content.active');
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');document.getElementById(b.dataset.tab).classList.add('active');
  // The Capital Planner tab relabels to "Adjust Amount" while you're on it (re-clicking adjusts).
  const pBtn=document.querySelector('[data-tab="tab-planner"]');
  if(pBtn)pBtn.textContent=(b.dataset.tab==='tab-planner')?'Adjust Amount':'Capital Planner';
  // Re-observe reveals in newly visible tab
  document.getElementById(b.dataset.tab).querySelectorAll('.reveal:not(.visible)').forEach(el=>revealObs.observe(el));
  // First visit to the planner auto-opens the full-page form; navigating in from another tab
  // shows the results. Re-clicking "Capital Planner" while already on it reopens the form to
  // adjust (replaces the old "Adjust Investment Amount" button).
  if(b.dataset.tab==='tab-planner'&&(!window._plannerCalcDone||(prev&&prev.id==='tab-planner'))){openPlannerForm();}
  // Switching to My Setup from another tab replays the count-up animation.
  if(b.dataset.tab==='tab-current'&&(!prev||prev.id!=='tab-current')){refreshMySetupAnimation();}
}));
// Open the full-page Capital Planner form, seeded from the current inputs.
function openPlannerForm(){
  document.getElementById('piCapitalInput').value=$('inCapital').value;
  document.getElementById('piGMTInput').value=$('inGMTWallet').value;
  document.getElementById('piRefCapInput').value=$('inRefCapital').value;
  document.getElementById('piMpTH').value=$('inMpTH').value;
  document.getElementById('piMpGMT').value=$('inMpGMT').value;
  document.getElementById('piMpWth').value=$('inMpWth').value;
  if(window._incomeGoal&&isFinite(window._incomeGoal.targetDisp))document.getElementById('piTargetInput').value=Math.round(window._incomeGoal.targetDisp);
  setPlannerMode(window._plannerMode||'amount');   // restore the chosen mode + button label + unit
  document.getElementById('plannerIntro').style.display='';
  document.getElementById('plannerIntro').scrollTop=0;
  document.body.style.overflow='hidden';
  const cb=document.getElementById('plannerCalcBtn');if(cb)cb.disabled=false;
  // "Return to Capital Planner" only makes sense once a plan has been calculated to go back to.
  const rr=document.getElementById('piReturnResults');if(rr)rr.style.display=window._plannerCalcDone?'':'none';
}
// Dismiss the form back to the already-computed Capital Planner results (no recalculation).
function returnToPlannerResults(){
  closePlannerIntro();
  const pBtn=document.querySelector('[data-tab="tab-planner"]');
  if(pBtn&&!pBtn.classList.contains('active'))pBtn.click();
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
    $('inMpTH').value=parseFloat(document.getElementById('piMpTH').value)||0;
    $('inMpGMT').value=parseFloat(document.getElementById('piMpGMT').value)||0;
    const mpWthVal=parseFloat(document.getElementById('piMpWth').value);
    $('inMpWth').value=(mpWthVal>0?mpWthVal:15);
    window._plannerCalcDone=true;
    window._incomeGoal=null;   // amount mode: drop any prior income-goal banner
    recalc();
    document.getElementById('plannerIntro').style.display='none';
    document.body.style.overflow='';
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
  const m=calc(i),bp=m.bp,gp=m.gp,dbt=dailyBTCperTH();
  const a=solvePlannerAllocation(i,bp,gp,dbt);
  let mineMo,locked,refInitTH;
  if(a){
    const gr=dbt*a.nt,df=a.newF.t*(1-a.td2/100);
    mineMo=(gr-df)*bp*30;locked=a.newLocked;refInitTH=a.ref?a.ref.at:0;
  }else{
    // Nothing to allocate (e.g. zero capital on a blank/empty setup): the farm just
    // earns its current income — a $0 baseline on a blank setup, not an error.
    mineMo=m.net*m.bp*30;locked=i.gl;refInitTH=0;
  }
  const stakingMo=locked*(i.apr/100)/52*gp*4.33;
  const ambMo=((i.amb?i.refTH:0)+refInitTH)*15*24/1000*0.005*30;
  return mineMo+stakingMo+ambMo;
}
// Binary-search the smallest USD capital whose projected monthly income reaches targetUSD.
function solveCapitalForIncome(targetUSD){
  if(!(targetUSD>0))return null;
  const f=projectedMonthlyForCapital;
  const base=f(0);
  if(base==null)return {cap:null,error:true};
  if(base>=targetUSD)return {cap:0,mo:base,already:true};
  let hi=1000,hiMo=f(hi),iter=0;
  while((hiMo==null||hiMo<targetUSD)&&hi<1e8&&iter<40){hi*=2;hiMo=f(hi);iter++;}
  if(hiMo==null||hiMo<targetUSD)return {cap:null,mo:hiMo,maxTried:hi,unreachable:true};
  let lo=0;
  for(let k=0;k<44;k++){const mid=(lo+hi)/2,mo=f(mid);if(mo==null){lo=mid;continue;}mo<targetUSD?lo=mid:hi=mid;}
  return {cap:hi,mo:f(hi),base};
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
    $('inMpTH').value=parseFloat($('piMpTH').value)||0;
    $('inMpGMT').value=parseFloat($('piMpGMT').value)||0;
    const mpWthVal=parseFloat($('piMpWth').value);$('inMpWth').value=(mpWthVal>0?mpWthVal:15);
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
    $('plannerIntro').style.display='none';
    document.body.style.overflow='';
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
    document.getElementById('plannerIntro').style.display='none';
    document.body.style.overflow='';
    if(load)load.style.display='none';
    if(txt)txt.textContent='Finding your optimal split…';
    const setupBtn=document.querySelector('[data-tab="tab-current"]');
    if(setupBtn)setupBtn.click();
    refreshMySetupAnimation();
  },650);
}
function closePlannerIntro(){
  document.getElementById('plannerIntro').style.display='none';
  document.body.style.overflow='';
}

// Live price chart (TradingView advanced chart — real-time, with the drawing/TA toolbar).
// Reused for BTC and the GoMining token; the widget is rebuilt when the symbol changes.
let _chartSym=null;
function openBtcChart(){openChart('COINBASE:BTCUSD','Bitcoin — Live Chart','btc36.png',false,true);}
function openGmtChart(){openChart('CRYPTO:GOMININGUSD','GoMining Token — Live Chart','gmt36.png',true,false);}
// Deep-link: /bitcoin and /gmt (served by the redirect pages as /?chart=…, or hit directly)
// auto-open the matching chart on first load.
function maybeOpenChartFromURL(){
  let which=new URLSearchParams(location.search).get('chart');
  if(!which){const seg=location.pathname.replace(/\/+$/,'').split('/').pop();if(seg==='bitcoin'||seg==='gmt')which=seg;}
  if(which==='bitcoin')openBtcChart();
  else if(which==='gmt')openGmtChart();
}
function closeBtcChart(){
  try{history.replaceState({},'','/'+location.search+location.hash);}catch(e){}   // drop /bitcoin|/gmt from the URL
  const load=document.getElementById('btcChartLoading');
  if(load)load.style.display='flex';
  setTimeout(function(){
    document.getElementById('btcChartPage').style.display='none';
    if(load)load.style.display='none';
    document.body.style.overflow='';
    const setupBtn=document.querySelector('[data-tab="tab-current"]');
    if(setupBtn)setupBtn.click();        // return to My Setup
    refreshMySetupAnimation();            // replay the count-up on all the numbers
  },650);
}
function openChart(symbol,title,icon,allowChange,isBtc){
  // remember which asset is on screen so the screenshot button knows what to render
  window._chartAsset=isBtc
    ? {kind:'btc',name:'Bitcoin',pair:'BTC / USD',icon:'btc36.png'}
    : {kind:'gmt',name:'GoMining Token',pair:'GMT / USD',icon:'gmt36.png'};
  // reflect the chart in the URL so it's shareable / bookmarkable (gmt-optimizer.com/bitcoin|/gmt)
  try{history.replaceState({},'',(isBtc?'/bitcoin':'/gmt')+location.hash);}catch(e){}
  document.getElementById('btcChartPage').style.display='';
  document.getElementById('btcChartPage').scrollTop=0;
  document.body.style.overflow='hidden';
  const t=document.getElementById('btcChartTitle');
  if(t)t.innerHTML='<img src="'+icon+'" alt="" style="height:18px;width:18px;border-radius:50%;vertical-align:middle;margin-right:.4rem">'+title;
  // The Rainbow Chart toggle is BTC-only; reset to the live view each open.
  const mode=document.getElementById('btcChartMode');
  if(mode)mode.style.display=isBtc?'':'none';
  _rbView=null;                       // reset rainbow zoom/pan on each open
  setBtcChartView('live',true);
  buildChart(symbol,allowChange);
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
// Worst-case "Basically a Fire Sale" price — the chart's absolute bottom edge (most conservative valuation).
const RB_FIRESALE_OFF=RB_OFFSETS[RB_OFFSETS.length-1];
function rbFireSalePrice(t){return _rbFit?Math.pow(10,_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b+RB_FIRESALE_OFF):0;}
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
    new TradingView.widget({
      container_id:'btcChartWidget', autosize:true,
      symbol:symbol, interval:'60', timezone:'Etc/UTC',
      theme:'dark', style:'1', locale:'en',
      hide_side_toolbar:false,   // shows the drawing / TA toolbar
      allow_symbol_change:!!allowChange, withdateranges:true, details:false,
      backgroundColor:'rgba(10,10,10,1)', gridColor:'rgba(245,166,35,0.06)'
    });
  };
  if(window.TradingView){make();return;}
  const s=document.createElement('script');
  s.src='https://s3.tradingview.com/tv.js';s.async=true;s.onload=make;
  document.head.appendChild(s);
}

// ============================================================
// CHART SCREENSHOT — branded, shareable candlestick snapshot
// The live chart is a cross-origin TradingView iframe and can't be captured, so we
// rebuild our own 1-hour candlestick image from public OHLC data and stamp it with
// GMT-Optimizer + GoMining branding (deliberately NO promo code).
// ============================================================
let _chartShotCanvas=null, _chartShotBlob=null;
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
  const asset=window._chartAsset||{kind:'btc',name:'Bitcoin',pair:'BTC / USD',icon:'btc36.png'};
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
      _csImg('gmt36.png')
    ]);
    if(!data||!data.rows||data.rows.length<4)throw new Error('no data');
    _chartShotCanvas=buildChartShotCanvas(asset,data,{logoOpt,coin,token});
    img.src=_chartShotCanvas.toDataURL('image/png');
    _chartShotBlob=await canvasToBlob(_chartShotCanvas);  // cache so Share can fire inside the click gesture
    img.style.display='';load.style.display='none';actions.style.display='flex';
  }catch(e){
    document.getElementById('chartShotLoadTxt').textContent='Couldn’t load price data right now — please try again in a moment.';
  }
}
function closeChartShot(){
  document.getElementById('chartShotModal').style.display='none';
  closeChartShare();
  document.body.style.overflow='hidden'; // the chart page underneath still locks scroll
}
// ---- share sheet (YouTube-Music style) ----
const CHART_SHARE_BASE='https://gmt-optimizer.com';
// Per-asset shareable link — gmt-optimizer.com/bitcoin or /gmt.
function _csChartUrl(){
  const a=window._chartAsset||{kind:'btc'};
  return CHART_SHARE_BASE+(a.kind==='gmt'?'/gmt':'/bitcoin');
}
function _csShareText(){
  const a=window._chartAsset||{name:'Bitcoin'};
  return 'Live '+a.name+' chart — plan your GoMining ROI, discount & break-even free at GMT-Optimizer.com';
}
// Build a File from the cached PNG blob (present once the shot is rendered).
function _chartShotFile(){
  if(!_chartShotBlob)return null;
  const a=window._chartAsset||{kind:'btc'};
  return new File([_chartShotBlob],'gmt-optimizer-'+(a.kind==='btc'?'bitcoin':'gmt')+'-1h-chart.png',{type:'image/png'});
}
function _canShareImage(){const f=_chartShotFile();return !!(f&&navigator.canShare&&navigator.canShare({files:[f]}));}
// "Share": always open our custom YouTube-style bottom sheet (the user prefers it over the
// browser's native share dialog). The native OS sheet is still reachable from the sheet's
// "Share with other apps" row, which carries the actual PNG where file-sharing is supported.
function openChartShare(){
  if(!_chartShotBlob)return;
  document.getElementById('chartShareSheet').style.display='flex';
}
function closeChartShare(){const s=document.getElementById('chartShareSheet');if(s)s.style.display='none';}
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
  await copyChartShot(true);   // silent copy
  const link=_csChartUrl(),u=encodeURIComponent(link),te=encodeURIComponent(_csShareText());
  const urls={
    telegram:'https://t.me/share/url?url='+u+'&text='+te,
    x:'https://twitter.com/intent/tweet?text='+te+'&url='+u,
    whatsapp:'https://wa.me/?text='+encodeURIComponent(_csShareText()+' '+link),
    facebook:'https://www.facebook.com/sharer/sharer.php?u='+u,
    reddit:'https://www.reddit.com/submit?url='+u+'&title='+te
  };
  if(urls[net])window.open(urls[net],'_blank','noopener,noreferrer');
  csToast('✓ Image copied — paste it into '+(_CS_NET[net]||'the post'));
}
// "Share with other apps" row — native image share, else save the PNG.
async function chartShareNative(){
  const f=_chartShotFile();if(!f)return;
  try{
    if(navigator.canShare&&navigator.canShare({files:[f]})){
      await navigator.share({files:[f],url:_csChartUrl(),title:(window._chartAsset||{}).name+' — 1H chart',text:_csShareText()+' '+_csChartUrl()});return;
    }
    if(navigator.share){await navigator.share({title:(window._chartAsset||{}).name+' — 1H chart',text:_csShareText()+' '+_csChartUrl()});return;}
  }catch(e){if(e&&e.name==='AbortError')return;}
  downloadChartShot();csToast('⬇ Image saved — attach it anywhere');
}
async function copyChartShot(silent){
  if(!_chartShotCanvas&&!_chartShotBlob)return;
  try{
    if(navigator.clipboard&&window.ClipboardItem&&window.isSecureContext){
      const blobP=_chartShotBlob?Promise.resolve(_chartShotBlob):canvasToBlob(_chartShotCanvas);
      await navigator.clipboard.write([new ClipboardItem({'image/png':blobP})]);
      if(silent!==true)csToast('✓ Image copied — paste anywhere');return;
    }
  }catch(e){}
  if(silent!==true){downloadChartShot();csToast('⬇ Image saved');}
}
async function downloadChartShot(btn){
  if(!_chartShotCanvas&&!_chartShotBlob)return;
  const asset=window._chartAsset||{kind:'btc'};
  try{
    const blob=_chartShotBlob||await canvasToBlob(_chartShotCanvas);
    downloadBlob(blob,'gmt-optimizer-'+(asset.kind==='btc'?'bitcoin':'gmt')+'-1h-chart.png');
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

// Share the current plan as a link that re-creates the same view for the recipient. The setup
// (readInputs) is packed into a ?p=<base64 JSON> URL. Uses the native share sheet (email / message
// / etc.) on supporting devices, else copies the link to the clipboard.
// Compact share encoding: a fixed-order, '~'-delimited value string (all chars URL-safe, no
// base64/JSON keys) — ~3x shorter than the old base64-JSON links. Trailing defaults are trimmed.
const SHARE_FIELDS=[
  ['inTH'],['inWTH'],['inGMTLocked'],['inGMTWallet'],['inCapital'],
  ['inMpTH'],['inMpGMT'],['inMpWth'],['inGreedyTH'],['inGreedyInitial'],['inGreedyGrowth'],
  ['inClickStreak','b'],['inPayGMT','b'],['inAmbassador','b'],['inAvatarDisc','b'],
  ['inReferredTH'],['inRefCapital'],['inCurrency'],['piVipBonus','b']
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
  const flags=(d.inClickStreak?1:0)|(d.inPayGMT?2:0)|(d.inAmbassador?4:0)|(d.piVipBonus?8:0)|(d.inAvatarDisc?16:0);
  const parts=[
    v(d.inTH),v(d.inWTH),v(d.inGMTLocked),v(d.inGMTWallet),v(d.inCapital),
    flags?flags.toString(36):'', SHARE_CUR[d.inCurrency]||'',
    v(d.inMpTH),v(d.inMpGMT),v(d.inMpWth),
    v(d.inGreedyTH),v(d.inGreedyInitial),v(d.inGreedyGrowth),
    v(d.inReferredTH),v(d.inRefCapital)
  ];
  while(parts.length&&parts[parts.length-1]==='')parts.pop();
  return parts.join('~');
}
function decodeShareV2(s){
  const p=s.split('~'),g=i=>(p[i]!==undefined&&p[i]!=='')?p[i]:undefined,d={};
  const set=(k,i)=>{const x=g(i);if(x!==undefined)d[k]=x;};
  set('inTH',0);set('inWTH',1);set('inGMTLocked',2);set('inGMTWallet',3);set('inCapital',4);
  const flags=g(5)?(parseInt(g(5),36)||0):0;
  d.inClickStreak=!!(flags&1);d.inPayGMT=!!(flags&2);d.inAmbassador=!!(flags&4);d.piVipBonus=!!(flags&8);d.inAvatarDisc=!!(flags&16);
  const cur=g(6);d.inCurrency=cur==='G'?'GBP':cur==='E'?'EUR':'USD';
  set('inMpTH',7);set('inMpGMT',8);set('inMpWth',9);
  set('inGreedyTH',10);set('inGreedyInitial',11);set('inGreedyGrowth',12);
  set('inReferredTH',13);set('inRefCapital',14);
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
// Generate the rich projection card (buildShareCanvas) and copy it to the clipboard (download
// fallback), with a 'Generating…' loading state that ends with a paste hint in the same region.
async function copyProjectionImage(btn){
  const d=window._shareData;if(!d){return;}
  const load=document.getElementById('spPageLoading');
  const spin=load?load.querySelector('.sp-spinner'):null;
  const txt=load?load.querySelector('.sp-loading-txt'):null,prev=txt?txt.textContent:'';
  if(spin)spin.style.display='';
  if(txt)txt.textContent='Generating pastable image…';
  if(load)load.style.display='flex';
  // iOS Safari won't always start a CSS animation on an element revealed from a display:none
  // ancestor — force a reflow-driven restart so the spinner actually spins on mobile.
  if(spin){spin.style.animation='none';void spin.offsetWidth;spin.style.animation='';}
  const finish=(msg)=>{
    if(spin)spin.style.display='none';
    if(txt)txt.textContent=msg;
    setTimeout(()=>{if(load)load.style.display='none';if(spin)spin.style.display='';if(txt)txt.textContent=prev;},2200);
  };
  // blob promise carries a delay so the "generating" state is visible; passed to ClipboardItem so
  // write() is still called within the click gesture (required by browsers).
  const blobP=(async()=>{await new Promise(r=>setTimeout(r,1400));return canvasToBlob(buildShareCanvas(d));})();
  if(navigator.clipboard&&window.ClipboardItem&&window.isSecureContext){
    try{await navigator.clipboard.write([new ClipboardItem({'image/png':blobP})]);finish('✓ Paste the image anywhere you like');return;}catch(e){}
  }
  try{downloadBlob(await blobP,'gmt-optimizer-projection.png');finish('⬇ Image saved — paste or attach it anywhere');}
  catch(e){finish('Couldn’t make image');}
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
  cap:+$('inCapital').value||0,
  mpTH:+($('inMpTH')?$('inMpTH').value:0)||0,
  mpGMT:+($('inMpGMT')?$('inMpGMT').value:0)||0,
  mpWth:+($('inMpWth')?$('inMpWth').value:0)||0,
  gth:gth,
  gInit:+($('inGreedyInitial')?$('inGreedyInitial').value:0)||0,
  gwth:wth,
  ggrow:+($('inGreedyGrowth')?$('inGreedyGrowth').value:0)||0,
  amb:$('inAmbassador').checked, refTH:+$('inReferredTH').value||0,
  refCap:+$('inRefCapital').value||0
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
const MINING_MODE_DEFAULT=0.82;
function saveMiningMode(){
  try{localStorage.setItem(MINING_MODE_KEY,JSON.stringify({v:$('inMiningMode').value,base:MINING_MODE_DEFAULT}))}catch(e){}
}
function loadMiningMode(){
  try{
    const raw=localStorage.getItem(MINING_MODE_KEY);
    if(raw===null)return;
    let parsed=null;try{parsed=JSON.parse(raw)}catch(e){}
    if(parsed&&typeof parsed==='object'&&'v' in parsed){
      // If the cached value was the default at save time AND the default has changed,
      // the user wasn't customizing — honor the new default.
      if(Number(parsed.base)!==MINING_MODE_DEFAULT&&Number(parsed.v)===Number(parsed.base))return;
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
    inGreedyTH:$('inGreedyTH').value, inGreedyInitial:$('inGreedyInitial').value, inGreedyGrowth:$('inGreedyGrowth').value,
    inClickStreak:$('inClickStreak').checked, inPayGMT:$('inPayGMT').checked,
    inAvatarDisc:$('inAvatarDisc').checked,
    inAmbassador:$('inAmbassador').checked, inReferredTH:$('inReferredTH').value,
    inRefCapital:$('inRefCapital').value,
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
  if(d.inCapital!=null)$('inCapital').value=d.inCapital;
  if(d.inMpTH!=null)$('inMpTH').value=d.inMpTH;
  if(d.inMpGMT!=null)$('inMpGMT').value=d.inMpGMT;
  if(d.inMpWth!=null)$('inMpWth').value=d.inMpWth;
  if(d.inGreedyTH!=null)$('inGreedyTH').value=d.inGreedyTH;
  if(d.inGreedyInitial!=null)$('inGreedyInitial').value=d.inGreedyInitial;
  if(d.inGreedyWth!=null&&$('inGreedyWth'))$('inGreedyWth').value=d.inGreedyWth;
  if(d.inGreedyGrowth!=null)$('inGreedyGrowth').value=d.inGreedyGrowth;
  if(d.inClickStreak!==undefined)$('inClickStreak').checked=!!d.inClickStreak;
  if(d.inPayGMT!==undefined)$('inPayGMT').checked=!!d.inPayGMT;
  if(d.inAvatarDisc!==undefined)$('inAvatarDisc').checked=!!d.inAvatarDisc;
  if(d.inAmbassador!==undefined){$('inAmbassador').checked=!!d.inAmbassador;$('ambassadorFields').style.display=d.inAmbassador?'':'none'}
  if(d.inReferredTH!=null)$('inReferredTH').value=d.inReferredTH;
  if(d.inRefCapital!=null)$('inRefCapital').value=d.inRefCapital;
  if(d.piVipBonus!==undefined&&$('piVipBonus'))$('piVipBonus').checked=!!d.piVipBonus;
  if(d.inCurrency&&typeof setCurrency==='function')setCurrency(d.inCurrency);
  autoFillCPT('inTH','inCostPerTH');
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
    state.profiles.map(p=>`<option value="${escapeHtml(p.id)}"${p.id===cur?' selected':''}>${escapeHtml(p.name)}</option>`).join('');
  const del=$('btnDeleteProfile');if(del){del.disabled=!cur;del.style.opacity=cur?'1':'.4';del.style.cursor=cur?'pointer':'not-allowed';}
}

function flashStatus(msg){
  const el=$('saveStatus');if(!el)return;
  el.textContent=msg;el.style.opacity='1';
  setTimeout(()=>el.style.opacity='0',2000);
}

function onProfileChange(){
  const state=loadProfilesState();
  const id=$('profileSelect').value;
  state.activeId=id||null;
  saveProfilesState(state);
  if(id){
    const p=state.profiles.find(x=>x.id===id);
    if(p){applyInputs(p.data);applyDiscountOverrideFor(p.data);if(S.loaded)recalc();}
    flashStatus('Loaded "'+(p?p.name:'')+'"');
  }else{
    // Switched to demo / no setup — drop any override carried over from a previous setup.
    applyDiscountOverrideFor(null);if(S.loaded)recalc();
  }
  renderProfileSelect();
}

function saveActiveProfile(){
  const state=loadProfilesState();
  const p=state.activeId&&state.profiles.find(x=>x.id===state.activeId);
  if(!p){saveAsNewProfile();return;}   // nothing selected yet -> save as new
  p.data=readInputs();
  saveProfilesState(state);
  flashStatus('Saved to "'+p.name+'"');
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
  sec.style.display='';sec.scrollTop=0;
  document.body.style.overflow='hidden';
  refreshGreedyVisibility();
}
function closeEditSetup(){
  const sec=$('secInputs');if(sec)sec.style.display='none';
  document.body.style.overflow='';
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
function toggleGreedyFields(){
  const cb=$('inHasGreedy');const on=cb&&cb.checked;
  const fields=document.querySelectorAll('.greedy-field');
  fields.forEach(el=>el.style.display=on?'':'none');
  if(on){
    // Flash the freshly-revealed fields so they don't blend in.
    fields.forEach((el,idx)=>{el.classList.remove('flash');void el.offsetWidth;el.style.setProperty('--flash-delay',(idx*0.07)+'s');el.classList.add('flash');});
    setTimeout(()=>fields.forEach(el=>el.classList.remove('flash')),1500);
  }else{
    ['inGreedyTH','inGreedyInitial'].forEach(id=>{const e=$(id);if(e)e.value=0;});
  }
  autoSave();
  if(S.loaded)recalc();
}
// Sync the checkbox + field visibility from the current data (greedy on iff TH>0).
function refreshGreedyVisibility(){
  const cb=$('inHasGreedy');if(!cb)return;
  cb.checked=(+($('inGreedyTH')&&$('inGreedyTH').value)||0)>0;
  document.querySelectorAll('.greedy-field').forEach(el=>el.style.display=cb.checked?'':'none');
}

function clearInputs(){
  // Wipes the form for a fresh demo. Saved profiles are untouched; auto-save is paused
  // until a profile is loaded or "Save as…" is used.
  applyInputs({
    inTH:'0',inWTH:'15',inGMTLocked:'0',inGMTWallet:'0',
    inCapital:'5000',inClickStreak:false,inPayGMT:true,inAvatarDisc:false,
    inMpTH:'0',inMpGMT:'0',inMpWth:'15',
    inGreedyTH:'0',inGreedyInitial:'0',inGreedyWth:'15',inGreedyGrowth:'0.3',
    inAmbassador:false,inReferredTH:'0',inRefCapital:'0',
    piVipBonus:false
  });
  const state=loadProfilesState();
  state.activeId=null;
  saveProfilesState(state);
  renderProfileSelect();
  if(S.loaded)recalc();
  flashStatus('Inputs cleared');
}

function deleteActiveProfile(){
  const state=loadProfilesState();
  if(!state.activeId)return;
  const p=state.profiles.find(x=>x.id===state.activeId);
  if(!p)return;
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
['inTH','inWTH','inGMTLocked','inGMTWallet','inCapital','inReferredTH','inRefCapital','inMpTH','inMpGMT','inMpWth','inGreedyTH','inGreedyInitial','inGreedyWth','inGreedyGrowth'].forEach(id=>{const e=$(id);if(e)e.addEventListener('input',autoSave)});
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
['inClickStreak','inPayGMT','inAmbassador','inAvatarDisc'].forEach(id=>{const e=$(id);if(e)e.addEventListener('change',autoSave)});
$('inAvatarDisc').addEventListener('change',()=>autoFillCPT('inTH','inCostPerTH'));
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
// Reward factor = 1/that. Params are the EXPECTED (decelerated) trajectory, chosen to stay coherent
// with the projection's worst-case Fire-Sale PRICE: a low-price world starves miners, so difficulty
// growth decelerates rather than racing (pairing low price with worst-case difficulty would double-
// stack two anti-correlated pessimisms). Not flat though — ASIC efficiency keeps difficulty grinding
// up even in bears (2022 bear: +45%). NO quantitative price→difficulty regression (that's OOS-invalid,
// +2346% error); this is only the qualitative scenario-coherence choice. Reward factor vs today (≤1).
const DIFF_G0=0.25, DIFF_FLOOR=0.05, DIFF_TAU=4;   // expected decay, coherent with worst-case price
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
  const vipTH=i.th+Math.max(0,gth-gInit);   // VIP tier basis
  const totTH=i.th+gth,bwth=totTH>0?(i.th*i.wth+gth*gwth)/totTH:i.wth;
  const gross=dbt*totTH,f=fees(totTH,bwth,bp);
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
  return{dbt,gross,f,vip,nxt,vd,cb,tok,totD,dfees,net,save,eTok,wkGMT,bp,gp,ovr,bwth,totTH,gth,gwth,vipTH,feesGMT,nonTokD,cov}
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
  const gOn=gEl&&(parseFloat(gEl.value)||0)>0;
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
  const heroAmbDaily=heroRefTH*15*24/1000*0.005;
  const totalDailyUSD=netUSD+dailyStakeUSD+heroAmbDaily;
  // Monthly must equal the "Total monthly income" breakdown below, which uses
  // 4.33 weeks/month for staking (52/12), not daily×30/7. Compose it the same way.
  const stakingMonthlyUSD=m.wkGMT*m.gp*4.33;
  const moUSD=netUSD*30+stakingMonthlyUSD+heroAmbDaily*30;
  animateMetric($('heroDailyNet'),totalDailyUSD,fU);$('heroDailyNet').className='hero-val '+(totalDailyUSD>=0?'green':'red');
  let heroSub=fU(netUSD)+' mining + '+fU(dailyStakeUSD)+' staking';
  if(heroAmbDaily>0)heroSub+=' + '+fU(heroAmbDaily)+' ambassador';
  $('heroDailyBTC').textContent=heroSub;
  animateMetric($('heroMonthly'),moUSD,v=>fU(v,0));$('heroMonthly').className='hero-val '+(moUSD>=0?'cyan':'red');
  let heroMoSub=fU(netUSD*30)+' mining + '+fU(stakingMonthlyUSD)+' staking';
  if(heroAmbDaily>0)heroMoSub+=' + '+fU(heroAmbDaily*30)+' ambassador';
  $('heroMonthlyBTC').textContent=heroMoSub;
  animateMetric($('heroYearly'),moUSD*12,v=>fU(v,0)+' / yr');$('heroYearly').className='hero-yearly '+(moUSD>=0?'cyan':'red');
  animateMetric($('heroDiscount'),m.totD,fP);
  $('heroDiscountSub').textContent='Saving '+fU(m.save*m.bp*30)+'/mo';
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
  $('discountDisplay').innerHTML=dh;

  // Combined: Daily Operation & Rewards
  let g='';
  const tg=i.gl+i.gw;
  g+=row('Total GMT held',`${fN(tg,0)} GMT<span class="sub">${fU(tg*m.gp)}</span>`);

  const stakingMonthly=m.wkGMT*m.gp*4.33;
  const miningMonthly=m.net*m.bp*30;
  const isAmb=$('inAmbassador').checked;
  const refTH=isAmb?(+$('inReferredTH').value||0):0;
  const ambDaily=refTH*15*24/1000*0.005;
  const ambMonthly=ambDaily*30;
  const totalMonthly=miningMonthly+stakingMonthly+ambMonthly;
  g+=row('TH mining income',`${fU(miningMonthly)}/mo`,miningMonthly>=0?'green':'red');
  g+=row('Staking income',`${fU(stakingMonthly)}/mo`,'green');
  if(isAmb&&refTH>0){
    g+=row('Ambassador rewards',`${fU(ambMonthly)}/mo<span class="sub">${fU(ambDaily)}/day USDT &middot; ${fN(refTH,0)} referred TH</span>`,'green');
  }
  g+=`<div class="divider"></div>`;
  g+=row('Total monthly income',fU(totalMonthly),totalMonthly>=0?'green':'red');
  g+=row('Total yearly income',fU(totalMonthly*12),totalMonthly>=0?'green':'red');

  $('gmtCoverage').innerHTML=g;

  // Signal
  let sg='';
  if(m.bp>80000){
    sg+=`<div class="signal th"><div class="signal-head">REINVEST IN TH</div><div class="signal-body">BTC is at ${fU(m.bp)} (above $80K). Convert BTC rewards to hashrate -- purchasing power is elevated.`;
    if(m.vip.rb>0)sg+=` Your ${m.vip.n} tier gives +${m.vip.rb}% TH reinvest bonus.`;
    const nv=nextVip(i.th,i.gl);
    if(nv&&nv.rb>0)sg+=` Reaching ${nv.n} (${nv.th} TH) unlocks +${nv.rb}% reinvest bonus.`;
    sg+='</div></div>';
  }else if(m.bp>=60000){
    sg+=`<div class="signal gmt"><div class="signal-head">REINVEST IN GMT</div><div class="signal-body">BTC at ${fU(m.bp)} (mid-range). Build discount coverage -- maintenance savings compound and protect margins if BTC pulls back.</div></div>`;
  }else{
    sg+=`<div class="signal gmt"><div class="signal-head">REINVEST IN GMT</div><div class="signal-body">BTC at ${fU(m.bp)} (below $60K). Accumulate GMT while cheap. Discount savings outweigh TH growth since hashrate ROI compresses at lower prices.</div></div>`;
  }
  $('reinvestSignal').innerHTML=sg;

  // Capital planner (includes projections)
  renderPlanner(i,m);
}

function renderProjections(th,wth,totD,label,moStakingUSD,moAmbUSD,curP){
  moStakingUSD=moStakingUSD||0;
  moAmbUSD=moAmbUSD||0;
  const cur=S.btcPrice;
  const gp=S.gmtPrice;
  const dbt=dailyBTCperTH();
  const grossBTC=dbt*th;
  // Store params for dropdown recalc
  window._projParams={th,wth,totD,moStakingUSD,moAmbUSD,grossBTC,cur,gp,curP:curP||null};

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
  const daily=Math.max(0,netBTC*bp)+(P.stakingMo||0)*(gmtScale||1)/30+(P.ambMo||0)/30;
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
  const after=moAtBTC({th:p.th,wth:p.wth,totD:p.totD,grossBTC:p.grossBTC,stakingMo:p.moStakingUSD,ambMo:p.moAmbUSD},bp,gmtScale);
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
    moEl.innerHTML=fN(moGMT,0)+' <img src="gmt36.png" class="gmt-logo" alt="GMT">';
    dayEl.innerHTML=fN(dailyGMT,0)+' <img src="gmt36.png" class="gmt-logo" alt="GMT">/day';
    if(yrEl)yrEl.innerHTML=fN(yearlyGMT,0)+' <img src="gmt36.png" class="gmt-logo" alt="GMT">/yr';
    tagEl.innerHTML='<img src="gmt36.png" alt="GMT" style="height:16px;width:16px;border-radius:4px;vertical-align:middle">';
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

// Shared solver: produces the post-investment state used by both the
// Capital Planner and the Reinvest Growth Projection. Keeping these in sync
// means "Monthly Income by BTC (LIVE)" matches the Reinvest's day-1 baseline.
function solvePlannerAllocation(i, bp, gp, dbt){
  let usdCap=i.cap;
  // Marketplace miner: a specific miner the user plans to buy off the GoMining
  // marketplace. Its hashrate earns rewards and incurs fees, but does NOT count
  // toward the VIP tier (terahash bonus) — so it never lifts the tier .d discount.
  const mpTH=Math.max(0,i.mpTH||0);
  const mpWth=mpTH>0?(i.mpWth>0?i.mpWth:15):0;
  const mpGmtCost=mpTH>0?Math.max(0,i.mpGMT||0):0;
  // Greedy Machine: existing owned TH — earns rewards + pays fees, never VIP-eligible.
  // Reinvestment grows it (greedy-first, up to 5k) inside the projection, not here.
  const gth0=Math.max(0,i.gth||0);
  const gwth0=gth0>0?(i.gwth>0?i.gwth:15):0;
  const gInit=Math.min(Math.max(0,i.gInit||0),gth0);   // initial marketplace greedy — never VIP-eligible
  // VIP 10% bonus disabled — GoMining is not currently offering this promo.
  // Stale localStorage entries with piVipBonus=true must NOT silently grant it.
  const vipBonus=false;
  const VIP_BONUS_MIN=10000, VIP_BONUS_MULT=1.10;
  const REF_GMT_BONUS=0.05; // 5% of referral's TH spend, paid in GMT to the referrer

  function solveReferral(refCap){
    if(refCap<=0)return null;
    const COV=360;
    function refSolve(gmtUSD){
      const ag=gmtUSD*(1-USD_GMT_FEE)/gp, thUSD=refCap-gmtUSD;
      const at=thUSD>0?thForBudget(thUSD*(1-USD_GMT_FEE)):0;
      const fT=fees(at||1,15,bp);
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
  const gmtAvail=gmtAvailPre-gmtForMiner;
  usdCap=Math.max(0,usdCap-usdForMiner);
  const totalValue=usdCap+(gmtAvail*gp);
  if(totalValue<=0&&mpTH<=0)return null;

  const covNeeded=360; // 20 steps * 18 days/step (GoMining's actual)

  // VIP-only blended efficiency (existing farm + freshly minted TH at 15 W/TH).
  function vipBlendWTH(addTH){return(i.th>0||addTH>0)?(i.th*i.wth+addTH*15)/(i.th+addTH):i.wth}
  // Total blended efficiency including the marketplace miner — drives fees.
  function blendWTH(addTH){const tot=i.th+addTH+mpTH+gth0;return tot>0?(i.th*i.wth+addTH*15+mpTH*mpWth+gth0*gwth0)/tot:i.wth}

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
      const baseTH=thBudgetUSD>0?thForBudget(thBudgetUSD):0;
      const bonusActive=vipBonus&&thBudgetUSD>=VIP_BONUS_MIN;
      const atTest=bonusActive?baseTH*VIP_BONUS_MULT:baseTH;
      const bonusTH=atTest-baseTH;
      // Greedy-first: the capital's TH budget fills an owned greedy machine up to
      // 5k (non-VIP) before minting VIP-eligible TH. Total fee TH is unchanged —
      // only the VIP tier basis shrinks by whatever went to the greedy machine.
      const gRoom=GREEDY_CAP-gth0;
      const addGreedy=(gth0>0&&gRoom>0)?Math.min(atTest,gRoom):0;
      const addVip=atTest-addGreedy;
      const greedyTot=gth0+addGreedy;
      const feeTH=i.th+addVip+greedyTot+mpTH;                 // total hashrate (fees + rewards)
      const vipTH=i.th+addVip+Math.max(0,greedyTot-gInit);   // VIP basis: all but initial mkt greedy + mpTH
      const totalLocked=i.gl+totalGmtLock;
      const walletAfter=reserve;
      const bwth=blendWTH(atTest);
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
      addGreedy:r.addGreedy,addVip:r.addVip,greedyTot:r.greedyTot,
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
  const greedyWthAfter=greedyTot>0?(gth0*gwth0+addGreedy*15)/greedyTot:gwth0;
  const addVip=sol.addVip!=null?sol.addVip:sol.addTH;
  const vipStandalone=i.th+addVip;     // non-greedy VIP TH — the projection's compounding base
  const vipTH=i.th+addVip+Math.max(0,greedyTot-gInit); // VIP tier basis (excl. initial mkt greedy + mpTH)
  const nt=i.th+addVip+greedyTot+mpTH; // total hashrate for rewards + fees
  const newLocked=i.gl+sol.lock;
  const bwth=blendWTH(sol.addTH);      // total blended efficiency (all new TH @15, greedy/VIP split-agnostic)
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
    gth:gth0, gInit, gwth:gwth0, ggrow:i.ggrow||0, greedyTot, gwthAfter:greedyWthAfter, addGreedy, vipStandalone
  };
}

// Side-by-side comparison: spend the next chunk of capital on efficiency vs hashrate vs discount.
// Persistent shell: title + the per-miner upgrade input + an empty body the input refreshes.
function effCompareShell(i){
  return `<div class="sub-title" style="margin-top:1rem">Efficiency vs. Hashrate vs. Discount</div><div id="effCompareBody"></div>`;
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
function renderEfficiencyComparison(st){
  if(!st)return '';
  const i=st.i, K=st.K, gp=st.gp, bp=st.bp;
  if(!i||!(K>0))return '';
  const cf=CONVERSION_FEE, dbt=dailyBTCperTH(), d=(calc(i).totD)/100;
  let lockUSD=Math.max(0,st.lockUSD||0), thUSD=Math.max(0,st.thUSD||0);
  const thUSD0=thUSD, glAdd=Math.max(0,st.glAdd||0);
  let addTH=Math.max(0,st.addTH||0);

  // Efficiency overlay: if the existing farm is above 12 W/TH and upgrading it yields more per
  // dollar than buying new TH, divert that slice of the TH budget into the upgrade (whole farm).
  let effUSD=0, effTHupg=0, upgradeROI=0, newThROI=0;
  if(i.th>0 && i.wth>12 && thUSD>0){
    const cptU=effUpgradeCostPerTH(i.wth);
    const cap=i.th;   // the whole existing farm is upgradeable (per-machine cap doesn't limit the total)
    if(cptU>0 && cap>0){
      const savedMo=cap*0.0012*(i.wth-EFF_BEST)*(1-d)*(1-cf)*30;   // $/TH/day electricity saving is already USD — no ×bp
      const upgradeCost=cap*cptU;
      upgradeROI=upgradeCost>0?savedMo*12/upgradeCost:0;
      const cptTH=estimateCPT((i.th+addTH)||1);
      const thNetMo=(dbt*bp-(0.0012*EFF_BASE_MAX+0.0089)*(1-d))*(1-cf)*30;
      newThROI=cptTH>0?thNetMo*12/cptTH:0;
      if(upgradeROI>newThROI){
        effUSD=Math.min(thUSD,upgradeCost);
        effTHupg=effUSD/cptU;
        thUSD-=effUSD;
      }
    }
  }
  if(thUSD0>0)addTH=addTH*thUSD/thUSD0;   // fewer TH bought once efficiency takes a slice

  const tot=lockUSD+thUSD+effUSD;
  if(tot<=0)return '';
  const lockPct=lockUSD/tot*100, thPct=thUSD/tot*100, effPct=effUSD/tot*100;
  const finTH=i.th+addTH;
  const finWth=finTH>0?((i.th-effTHupg)*i.wth+effTHupg*EFF_BEST+addTH*EFF_BASE_MAX)/finTH:i.wth;
  const baseMo=calc(i).net*bp*30;
  const newMo=calc({...i,th:finTH,wth:finWth,gl:i.gl+glAdd}).net*bp*30 + glAdd*(i.apr||0)/100/12*gp;
  const totalMo=newMo-baseMo, roiB=totalMo>0?totalMo*12/K*100:0;

  // BTC-price threshold below which upgrading efficiency out-yields buying TH. Upgrade ROI is
  // BTC-independent; new-TH ROI rises with BTC — so below this price the upgrade wins.
  // newThROI(bp*) = upgradeROI ⇒ bp* = [M(1-d) + cptTH·0.0012·(wth-12)(1-d)/cptU] / dbt.
  let effThreshBp=null;
  if(i.th>0 && i.wth>EFF_BEST){
    const cptU=effUpgradeCostPerTH(i.wth);
    if(cptU>0){
      const M=0.0012*EFF_BASE_MAX+0.0089, cptTH=estimateCPT((i.th+addTH)||1);
      const bpStar=(M*(1-d)+cptTH*0.0012*(i.wth-EFF_BEST)*(1-d)/cptU)/dbt;
      if(isFinite(bpStar)&&bpStar>0)effThreshBp=bpStar;
    }
  }
  const effGauge=(thresh,now)=>{
    const hi=Math.max(thresh,now)*1.4||1;
    const tPos=Math.min(100,thresh/hi*100), nPos=Math.max(2,Math.min(98,now/hi*100)), winning=now<=thresh;
    return `<div class="eff-gauge"><div class="eff-gauge-bar"><div class="eff-gauge-win" style="width:${tPos}%"></div><div class="eff-gauge-now" style="left:${nPos}%"><span>now ${fU(now,0)}</span></div></div>`
      +`<div class="eff-gauge-lbl">${winning?'<b style="color:var(--green)">Worth it now</b> &middot; ':''}upgrade wins under <b>${fU(thresh,0)}</b> BTC</div></div>`;
  };

  let h=`<div class="eff-verdict">`;
  h+=`<div class="eff-verdict-main">Optimal split of your ${fU(K,0)} <span class="eff-verdict-roi">+${fU(totalMo,0)}/mo · ${fN(roiB,0)}%/yr</span></div>`;
  h+=`<div class="eff-verdict-sub">Balances locking GMT (to hold your 20% discount), buying hashrate, and efficiency upgrades — adding TH without locking would drop your coverage, so the two are balanced.</div>`;
  h+=`</div>`;

  const segs=[[lockPct,'Lock GMT','var(--purple)'],[thPct,'Buy TH','var(--cyan)'],[effPct,'Upgrade Eff','var(--green)']];
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
  let g=`<div class="eff-grid">`;
  g+=card('Lock GMT',lockPct,lockUSD,[
    ['Locks',glAdd>0?`+${fN(glAdd,0)} GMT`:'—'],
    ['Effect',lockPct>0.5?'holds 20% discount':'—']
  ]);
  g+=card('Buy TH',thPct,thUSD,[
    ['Adds',addTH>0?`+${fN(addTH,1)} TH @ 15W`:'—'],
    ['Source',addTH>0?'15 W machine upgrade':'—']
  ]);
  g+=card('Upgrade Efficiency',effPct,effUSD,[
    ['Upgrades',effTHupg>0?`${fN(effTHupg,0)} TH → 12 W`:'—'],
    ['Farm avg',effTHupg>0?`${fN(i.wth,2)} → ${fN(finWth,2)}`:'—']
  ],effThreshBp?effGauge(effThreshBp,bp):'');
  g+=`</div>`;
  g+=`<div class="eff-foot">Result: <strong>${fN(finTH,0)} TH</strong> @ ${fN(finWth,2)} W/TH${glAdd>0?`, +${fN(glAdd,0)} GMT locked`:''} &rarr; <strong>+${fU(totalMo,0)}/mo</strong> net.</div>`;
  return h+bar+g;
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
         mpTH, mpWth, mpGmtCost, gmtForMiner, usdForMiner, minerShortfallUSD, usdCapAfter, vipTH}=a;
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
    if(G.res.already){
      ah+=`<div class="goal-banner">🎯 You're already earning <strong>${fU(G.targetUSD)}/mo</strong> or more — no new capital needed to hit this goal.</div>`;
    }else if(G.res.unreachable){
      ah+=`<div class="goal-banner warn">🎯 Couldn't reach <strong>${fU(G.targetUSD)}/mo</strong> even at ${fU(G.res.maxTried)} of capital — try a lower goal.</div>`;
    }else{
      ah+=`<div class="goal-banner">🎯 To earn about <strong>${fU(G.targetUSD)}/mo</strong>, invest <strong>${fU(G.cap)}</strong>. Here's how to deploy it:</div>`;
    }
  }

  // Explanation — only noteworthy states (the split itself is shown in the cards below).
  // The greedy-machine-first allocation is computed in `a` and used by the projections, but
  // not surfaced here (backend detail). The box is omitted entirely when there's nothing to say.
  const usdToTH=usdCapAfter-usdSpentOnGMT;
  let exp='';
  if(mpTH>0){
    exp+=`<strong style="color:var(--purple-soft)">Marketplace miner:</strong> +${fN(mpTH,0)} TH for ${fN(mpGmtCost,0)} GMT`;
    if(usdForMiner>0)exp+=` (${fN(gmtForMiner,0)} GMT from pool + ${fU(usdForMiner)})`;
    else exp+=` (from your GMT)`;
    exp+=`. <span style="color:var(--text3)">Doesn't count toward VIP tier.</span> Remaining balance optimized below.<br>`;
    if(minerShortfallUSD>0)exp+=`<strong style="color:var(--orange)">You're ${fU(minerShortfallUSD)} short of affording this miner — figures assume the rest is funded.</strong><br>`;
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
  const hasGMT=gmtAvail>0;
  // Split is driven by the SAME solver as Path-to-20% / Resource Breakdown (consistent + unbounded
  // — no 5,000 TH cap on the farm total). Efficiency upgrade is layered on as an overlay.
  window._effCmp={i,K:totalValue,gp,bp,
    lockUSD:usdSpentOnGMT+gmtFromPool*gp, glAdd:gmtLock,
    thUSD:usdToTH+gmtSell*gp, addTH:at};
  ah+=effCompareShell(i);

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
  if(mpTH>0){
    ah+=row('Marketplace miner',`+${fN(mpTH,0)} TH<span class="sub">${fN(mpGmtCost,0)} GMT @ ${fN(mpWth,1)} W/TH · non-VIP</span>`,'purple');
  }
  if(hasGMT){
    if(baseGmtAvail>0)ah+=row('GMT on hand',`${fN(baseGmtAvail,0)} GMT<span class="sub">${fU(baseGmtAvail*gp)}</span>`);
    if(refBonusGMT>0)ah+=row('+ Referral 5% GMT bonus',`+${fN(refBonusGMT,0)} GMT<span class="sub">${fU(refBonusUSD)} (5% of ${fU(ref.thUSD)} TH spend)</span>`,'green');
    if(gmtForMiner>0)ah+=row('→ Marketplace miner',`${fN(gmtForMiner,0)} GMT<span class="sub">${fU(gmtForMiner*gp)}</span>`,'purple');
    if(gmtFromPool>0)ah+=row('→ Lock',`${fN(gmtFromPool,0)} GMT`,'purple');
    if(gmtSell>0)ah+=row('→ Upgrade TH',`${fN(gmtSell,0)} GMT<span class="sub">${fU(gmtSell*gp)}</span>`,'cyan');
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
  const curMo=m.net*m.bp*30,imp=mo-curMo;
  const svBTC=newF.t*(td2/100),rec=imp>0?cap/imp:Infinity;

  let ph='<div style="display:flex;align-items:center;justify-content:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">';
  ph+=`<span style="font-size:.8rem;color:var(--text3)">New VIP:</span>${badge(nv)}`;
  if(tc)ph+=` <span class="badge green">TIER UP from ${ov.n}</span>`;
  ph+='</div>';
  const nonVipTH=(a.gInit||0)+mpTH;
  ph+=row('New hashrate',`${fN(nt,1)} TH`+(nonVipTH>0?`<span class="sub">${fN(vipTH,1)} TH counts toward VIP &middot; ${fN(nonVipTH,0)} TH marketplace (non-VIP)</span>`:`<span class="sub">all counts toward VIP</span>`));
  if(at>0&&i.th>0&&Math.abs(i.wth-15)>0.01)ph+=row('New avg efficiency',`${fN(bwth,2)} W/TH<span class="sub">${fN(i.wth,2)}→${fN(bwth,2)} blended</span>`);
  ph+=row('New token discount',fP(ntd),'cyan');
  ph+=row('New total discount',fP(td2),'cyan');
  ph+=`<div class="divider"></div>`;
  // ref already solved at top of renderPlanner so the 5% GMT bonus could feed the main solver.
  const refInitTH=ref?ref.at:0;
  const refInitLocked=ref?ref.ag:0;

  const projMoStaking=newLocked*(i.apr/100)/52*gp*4.33;
  const projTotalRefTH=(i.amb?i.refTH:0)+refInitTH;
  const projAmbDaily=projTotalRefTH*15*24/1000*0.005;
  const projAmbMo=projAmbDaily*30;
  const projMoTotal=mo+projMoStaking+projAmbMo;
  const projSub='mining + staking'+(projAmbMo>0?' + ambassador':'');
  ph+=row('Projected monthly',`${fU(projMoTotal)}<span class="sub">${projSub}</span>`,projMoTotal>=0?'green':'red');
  if(projAmbMo>0){
    const ambSub=refInitTH>0&&i.amb&&i.refTH>0
      ? `${fN(i.refTH,0)} existing + ${fN(refInitTH,1)} from referral plan = ${fN(projTotalRefTH,1)} TH`
      : refInitTH>0 ? `${fN(refInitTH,1)} TH from referral plan` : `${fN(i.refTH,0)} referred TH`;
    ph+=row('↳ Ambassador uplift',`+${fU(projAmbMo)}/mo<span class="sub">${ambSub}</span>`,'green');
  }
  const newWkStake=(newLocked*i.apr/100)/52;
  const newStakingMo=newWkStake*gp*4.33;
  const curStakingMo=m.wkGMT*m.gp*4.33;
  const totalImp=imp+(newStakingMo-curStakingMo);
  ph+=row('Monthly improvement',`${totalImp>=0?'+':''}${fU(totalImp)}<span class="sub">mining + staking</span>`,totalImp>=0?'green':'red');
  ph+=row('Monthly maintenance saved',fU(svBTC*bp*30),'green');
  ph+=`<div class="divider"></div>`;
  const recAdj=totalImp>0?cap/totalImp:Infinity;
  ph+=row('New locked GMT',`${fU(newLocked*gp)}`+(gmtReserve>0?`<span class="sub">+${fU(gmtReserve*gp)} reserve</span>`:''));
  ph+=row('Months to recoup',recAdj===Infinity?'N/A':`${fN(recAdj,1)} months`,recAdj<12?'green':recAdj<24?'orange':'red');
  if(ref){
    ph+=`<div class="divider"></div>`;
    ph+=`<div class="sub-title">Referral's planned allocation (${fU(i.refCap)})</div>`;
    ph+=row('Referral TH',`${fN(refInitTH,1)} TH<span class="sub">${fU(refInitTH*(i.cpt||0))}</span>`,'cyan');
    ph+=row('Referral locked <img src="gmt36.png" class="gmt-logo" alt="GMT">',`${fN(refInitLocked,0)} GMT<span class="sub">${fU(refInitLocked*gp)}</span>`,'cyan');
    ph+=row('Adds to your ambassador',`${fU(refInitTH*15*24/1000*0.005*30)}/mo`,'green');
    if(refBonusGMT>0)ph+=row('Your 5% GMT bonus',`+${fN(refBonusGMT,0)} GMT<span class="sub">${fU(refBonusUSD)} on their ${fU(ref.thUSD)} TH spend (allocated above)</span>`,'green');
  }
  $('projDisplay').innerHTML=ph;

  // BTC price projections (includes mining + staking + ambassador)
  const moStakingUSD=newWkStake*gp*4.33;
  const projLabel=`Projected monthly income at ${fN(nt,1)} TH with ${fP(td2)} total discount (mining + staking${projAmbMo>0?' + ambassador':''})`;
  // Current (pre-investment) state, for the before/after comparison.
  const curAmbMo=(i.amb?(+i.refTH||0):0)*15*24/1000*0.005*30;
  const curP={th:m.totTH,wth:m.bwth,totD:m.totD,grossBTC:dbt*m.totTH,stakingMo:curStakingMo,ambMo:curAmbMo};
  $('projTable').innerHTML=renderProjections(nt,bwth,td2,projLabel,moStakingUSD,projAmbMo,curP);
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
// Populate the "Project To" dropdown with each upcoming halving and its projected worst-case
// (Fire-Sale band) price, so the user sees the conservative target the projection will reach.
function populateSpTargets(){
  const sel=document.getElementById('spTarget');
  if(!sel)return;
  const now=Date.now();
  const future=HALVING_DATES.filter(h=>h>now);
  if(!_rbFit||!future.length){sel.innerHTML='<option value="">Loading fair-value model…</option>';return;}
  const prev=sel.value;
  sel.innerHTML=future.map((h,idx)=>{
    const yr=new Date(h).getUTCFullYear();
    const fv=rbFireSalePrice(h);
    const label=(idx===0?'Next halving — ':'')+yr+' halving &mdash; worst-case '+fmtBTCPrice(fv);
    return `<option value="${h}">${label}</option>`;
  }).join('');
  if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
  updateSpTargetPreview();
}
// Live preview under the dropdown: horizon, the BTC price path (today → HODL fair value),
// and which halving(s) the projection crosses.
function updateSpTargetPreview(){
  const el=document.getElementById('spTargetPreview'),sel=document.getElementById('spTarget');
  if(!el||!sel)return;
  const targetMs=parseFloat(sel.value);
  if(!_rbFit||!(targetMs>Date.now())){el.innerHTML='';return;}
  const now=Date.now(), days=Math.round((targetMs-now)/86400000), yrs=days/365;
  const P0=S.btcPrice||0, target=rbFireSalePrice(targetMs);
  const hv=halvingsInWindow(days);
  el.innerHTML=
    `<div class="sp-prev-chip"><div class="sp-prev-val">${yrs.toFixed(1)} yr</div><div class="sp-prev-lbl">horizon (${days} days)</div></div>`+
    `<div class="sp-prev-chip"><div class="sp-prev-val">${fmtBTCPrice(P0)} &rarr; ${fmtBTCPrice(target)}</div><div class="sp-prev-lbl">BTC: today &rarr; worst-case (Fire Sale)</div></div>`+
    `<div class="sp-prev-chip"><div class="sp-prev-val">${hv.length?hv.join(' &amp; '):'—'}</div><div class="sp-prev-lbl">halving${hv.length===1?'':'s'} crossed${hv.length?' (−50% reward each)':''}</div></div>`;
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
  m.style.display='';
  document.body.style.overflow='hidden';
  const btn=document.getElementById('spRunBtn');
  if(btn)btn.disabled=false;
}
// Re-run the fresh-load feel for the My Setup dashboard: hero values count up
// from 0 again and the cards re-enter, just like a page refresh.
function refreshMySetupAnimation(){
  ['heroDailyNet','heroMonthly','heroYearly','heroDiscount'].forEach(id=>{const e=$(id);if(e)e._cur=0;});
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
    if(m)m.style.display='none';
    document.body.style.overflow='';
    spShowForm();   // reset for next open
    if(load)load.style.display='none';
    if(txt)txt.textContent='Crunching your projection…';   // restore default for next run
    refreshMySetupAnimation();
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
  setTimeout(function(){
    try{computeSetupProjection();spShowResults();animateSetupResults();}
    finally{if(load)load.style.display='none';if(btn)btn.disabled=false;}
  },750);
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
  const gp=S.gmtPrice,dbt=dailyBTCperTH();
  const bpStart=S.btcPrice;
  // Need the HODL (Power-Law) fit and a target halving to auto-scale the price.
  if(!_rbFit){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Loading the fair-value model…</div>';ensureRainbowFit(()=>runSetupProjection());return;}
  const nowMs=Date.now();
  const selEl=$('spTarget');
  let targetMs=selEl?parseFloat(selEl.value):0;
  if(!(targetMs>nowMs)){const fut=HALVING_DATES.filter(h=>h>nowMs);targetMs=fut.length?fut[0]:nowMs+1095*86400000;}
  const days=Math.min(7300,Math.max(1,Math.round((targetMs-nowMs)/86400000)));
  const centerNow=rbFireSalePrice(nowMs), bpEnd=rbFireSalePrice(targetMs);
  if(!bpStart||!bpEnd||!centerNow||!gp||!dbt){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Waiting for live market data to load…</div>';return;}
  // Worst-case convergence: start at today's real price, converge onto the Fire-Sale band by the target.
  const offset0=Math.log(bpStart/centerNow);   // today's log-deviation from the worst-case band
  const btcSel={mode:'powerlaw',label:'Fire-sale '+fmtBTCPrice(bpEnd)+' by '+new Date(targetMs).getUTCFullYear(),price:bpEnd,targetYear:new Date(targetMs).getUTCFullYear()};

  // ---- Seed: post-investment allocation when launched from the Capital Planner,
  //      otherwise the current My Setup state (no new capital deployed). ----
  const fromPlanner=(window._spMode==='planner');
  let MP_TH,MP_WTH,HAS_GREEDY,GGROW,GINIT,greedyTH,greedyWTH,th,curWTH,gmtLocked,gmtW,startTH,startLocked;
  const apr=i.apr||0;
  if(fromPlanner){
    const a=solvePlannerAllocation(i,bpStart,gp,dbt);
    if(!a){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Enter capital in the <strong>Capital Planner</strong> first, then project.</div>';return;}
    MP_TH=a.mpTH||0; MP_WTH=a.mpWth>0?a.mpWth:15;
    HAS_GREEDY=(a.gth||0)>0;
    GGROW=(a.ggrow||0)/100;
    GINIT=a.gInit||0;
    greedyTH=a.greedyTot!=null?a.greedyTot:(a.gth||0);
    greedyWTH=a.gwthAfter>0?a.gwthAfter:(a.gwth>0?a.gwth:15);
    th=a.vipStandalone!=null?a.vipStandalone:a.vipTH;     // post-investment standalone VIP TH
    curWTH=a.vipWth>0?a.vipWth:15;
    gmtLocked=a.newLocked;
    gmtW=a.gmtReserve;
    startTH=a.nt;                                          // total post-investment hashrate
    startLocked=a.newLocked;
  }else{
    MP_TH=0; MP_WTH=15;
    HAS_GREEDY=(i.gth||0)>0;
    GGROW=(i.ggrow||0)/100;
    GINIT=Math.min(Math.max(0,i.gInit||0),Math.max(0,i.gth||0));
    greedyTH=Math.max(0,i.gth||0);
    greedyWTH=i.gwth>0?i.gwth:15;
    th=Math.max(0,i.th||0);
    curWTH=i.wth>0?i.wth:15;
    gmtLocked=Math.max(0,i.gl||0);
    gmtW=Math.max(0,i.gw||0);
    startTH=th+MP_TH+greedyTH;
    startLocked=gmtLocked;
  }
  if(startTH<=0&&gmtLocked<=0){out.innerHTML='<div style="color:var(--text4);padding:.5rem">Add your hashrate and locked GMT in <strong>My Setup</strong> first, then project.</div>';return;}
  // Starting blended efficiency (across VIP + marketplace + greedy) — to show any reinvested upgrade.
  const _bwStart=(th+MP_TH+greedyTH)>0?(th*curWTH+MP_TH*MP_WTH+greedyTH*greedyWTH)/(th+MP_TH+greedyTH):curWTH;

  // Existing referred TH pays flat ambassador USDT (no referral-reinvest sim here).
  const manualRefTH=i.amb?Math.max(0,i.refTH||0):0;
  const ambDaily=manualRefTH*15*24/1000*0.005;
  let totalAmbUSD=0;

  let bpToday=bpStart;
  const projStartMs=Date.now();
  let dbtToday=dbt;                 // daily BTC/TH; halves at each halving date during the run
  // Worst-case convergence to the Fire-Sale band: price = fireSale(t) · e^(offset0·(1−progress)).
  // At d=1 → today's real price; at the target halving → exactly the Fire-Sale band price.
  function bpForDay(d){
    const t=projStartMs+(d-1)*86400000;
    const progress=Math.min(1,Math.max(0,(t-projStartMs)/Math.max(1,targetMs-projStartMs)));
    const c=rbFireSalePrice(t)||bpEnd;
    return c*Math.exp(offset0*(1-progress));
  }

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
  for(let d=1;d<=days;d++){
    bpToday=bpForDay(d);
    dbtToday=Math.max(dbt*subsidyMultAt(projStartMs+(d-1)*86400000)*difficultyMultAt(projStartMs+(d-1)*86400000), rewardFloorBTC(bpToday));  // halving + difficulty grind, floored at the network no-arbitrage break-even
    if(d===1)startSS_capture=dailyNet(th,gmtLocked).net;
    totalAmbUSD+=ambDaily;
    if(d%7===0){
      gmtLocked+=gmtLocked*(apr/100)/52;            // weekly staking yield auto-compounds
      if(greedyTH>0&&GGROW>0)greedyTH*=(1+GGROW);    // greedy passive growth (compounds past 5k cap)
    }
    const dn=dailyNet(th,gmtLocked);
    weeklyGrossUSD+=Math.max(0,dn.reinvest);
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
          const allTH=th+thForBudget(netUSD);
          if(gmtDeficit(allTH,gmtLocked)>0){
            let lo=0,hi=netUSD;
            for(let k=0;k<40;k++){const mid=(lo+hi)/2;const agT=mid/gp;const thRem=netUSD-mid;const atT=thRem>0?thForBudget(thRem):0;if(gmtDeficit(th+atT,gmtLocked+agT)<=0)hi=mid;else lo=mid;}
            gmtSpend=hi;
          }
        }
        gmtLocked+=gmtSpend/gp;                 // discount-first lock
        let budget=netUSD-gmtSpend;
        // Marginal allocator (mirrors optimalSplit): each step spend `incr` on buy TH @12W /
        // upgrade efficiency toward 12 / lock GMT for staking. Efficiency is PREFERRED over staking
        // while mining is alive or rescuable — a lower W/TH lowers break-even and keeps the miner
        // earning longer, which the myopic daily-ROI of staking ignores. Staking only wins once the
        // farm is fully efficient (12 W) or mining is truly dead (even a 12 W farm nets $0) — we never
        // bank GMT while a cheaper miner could still be saved, nor fund hashrate that can't earn.
        // New VIP TH is priced as a 12 W/TH machine; greedy fills first @15W.
        if(budget>0){
          const STEPS=12, incr=budget/STEPS;
          for(let s=0;s<STEPS;s++){
            // --- option BUY: greedy-fill first @15W, remainder a new 12W VIP machine ---
            let gTH2=greedyTH,gW2=greedyWTH,vTH2=th,vW2=curWTH;
            const t15=thForBudget(incr);
            if(HAS_GREEDY&&greedyTH<GREEDY_CAP&&t15>0){
              const gAdd=Math.min(t15,GREEDY_CAP-greedyTH);
              gW2=(greedyTH*greedyWTH+gAdd*15)/(greedyTH+gAdd);gTH2=greedyTH+gAdd;
              const rem=incr*(1-gAdd/t15);
              if(rem>0){const vAdd=thForBudgetTiers(rem,TH_TIERS_12W);vW2=(th*curWTH+vAdd*EFF_BEST)/(th+vAdd);vTH2=th+vAdd;}
            }else{
              const vAdd=thForBudgetTiers(incr,TH_TIERS_12W);vW2=(th*curWTH+vAdd*EFF_BEST)/(th+vAdd);vTH2=th+vAdd;
            }
            const buyNet=dailyNet(vTH2,gmtLocked,{wth:vW2,greedyTH:gTH2,greedyWTH:gW2}).net;
            // --- option EFF: drive efficiency toward 12 W/TH ($2.67/TH per W-step), upgrading whichever
            // fleet (greedy or VIP) currently has the HIGHER W/TH so the FARM BLENDED falls fastest. ---
            let effNet=-Infinity, effApply=null;
            const vipRoom=(curWTH>EFF_BEST+1e-6&&th>0), grdRoom=(HAS_GREEDY&&greedyTH>0&&greedyWTH>EFF_BEST+1e-6);
            if(grdRoom&&(!vipRoom||greedyWTH>=curWTH)){
              const dW=Math.min(greedyWTH-EFF_BEST,incr/(EFF_UPGRADE_STEP*greedyTH));const gw2=greedyWTH-dW;
              effNet=dailyNet(th,gmtLocked,{greedyWTH:gw2}).net;effApply=()=>{greedyWTH=gw2;};
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
            if(headroom&&(dn.mining>0||rescuable)){
              if(buyNet>=effNet&&buyNet>base+eps){greedyTH=gTH2;greedyWTH=gW2;th=vTH2;curWTH=vW2;}
              else{effApply();}
            }else if(Math.max(buyNet,effNet)>lockNet+eps){
              if(buyNet>=effNet){greedyTH=gTH2;greedyWTH=gW2;th=vTH2;curWTH=vW2;}
              else{effApply();}
            }else{gmtLocked+=addG;}
          }
        }
      }
      postDN=dailyNet(th,gmtLocked);
    }
    daily.push({d,th:th+MP_TH+greedyTH,greedy:greedyTH,gmtLocked,gmtW,ssNet:postDN.net,disc:postDN.disc,tokD:postDN.tokD,vip:postDN.vip});
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

  const btcModeBadge='<span class="badge" style="background:rgba(63,124,196,.22);color:#7fb0ff;font-size:.65rem;margin-left:.4rem">WORST CASE</span>';
  const btcRangeLine=`BTC follows the rainbow Power-Law curve from <strong style="color:var(--text2)">${fmtBTCPrice(bpStart)} (today)</strong>, converging to the worst-case <strong style="color:var(--text2)">Fire-Sale ${fmtBTCPrice(bpEnd)}</strong> at the ${new Date(targetMs).getUTCFullYear()} halving (${days}d)`;

  const hwS=halvingsInWindow(days);
  const diffPenaltyPct=Math.round((1-difficultyMultAt(targetMs))*100);
  const _bwEnd=totEndTH>0?(th*curWTH+MP_TH*MP_WTH+greedyTH*greedyWTH)/totEndTH:curWTH;
  const effNoteS=(_bwStart-_bwEnd>0.05)?`<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9889; Reinvestment upgraded efficiency <strong style="color:var(--text2)">${_bwStart.toFixed(1)} &rarr; ${_bwEnd.toFixed(1)} W/TH</strong> to keep mining above break-even (capital is never spent on hashrate that nets $0).</div>`:'';
  const halvingNoteS=`<div style="margin-top:.35rem;font-size:.72rem;color:var(--text3)">&#9143; ${hwS.length?`Mining reward halves at the ${hwS.join(' &amp; ')} halving${hwS.length>1?'s':''}, plus ` : 'Plus '}<strong style="color:var(--text2)">−${diffPenaltyPct}%</strong> from rising network difficulty over the period (both modeled).</div>`+effNoteS;
  let h='';
  h+=`<div class="warn" style="margin-bottom:.8rem;background:rgba(245,166,35,.06);border-color:rgba(245,166,35,.2);color:var(--text2)">
    <strong style="color:var(--purple-soft)">Starting from ${fromPlanner?'your planned investment':'your current setup'}:</strong>
    <strong>${fN(startTH,1)} TH</strong> hashrate, <strong>${fN(startLocked,0)} GMT</strong> locked
    <div style="margin-top:.5rem;font-size:.75rem;color:var(--text3)">${btcRangeLine}${btcModeBadge}</div>${halvingNoteS}</div>`;
  h+=buildReinvestChart(daily,days,gp);

  const fb=dailyNet(th,gmtLocked);
  const breakdownDaily=`mining ${fU(fb.mining)} + staking ${fU(fb.staking)}${ambDaily>0?` + ambassador ${fU(fb.amb)}`:''}`;
  h+=`<div class="ri-single-card">
    <div class="ri-label">Daily Reward (End of Period)</div>
    <div class="ri-headline cyan">${fU(finalSS)}</div>
    <div class="ri-mo-yr">${fU(finalMonthly)}/mo<span class="ri-sep">&bull;</span>${fU(finalYearly)}/yr</div>
    <div class="ri-breakdown">${breakdownDaily}</div>
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
  if(totalDistributionUSD>0){
    const wks=days/7, payRate=ptype==='pct'?fP(pval)+' of weekly rewards':fU(pval)+'/wk';
    h+=`<div class="ri-single-card">
      <div class="ri-label">Income Paid Out (over period)</div>
      <div class="ri-headline green">${fU(totalDistributionUSD)}</div>
      <div class="ri-mo-yr">${fU(totalDistributionUSD/(days/30))}/mo avg<span class="ri-sep">&bull;</span>${payRate}</div>
      <div class="ri-gain">taken as income instead of reinvested</div>
    </div>`;
  }
  if(HAS_GREEDY){
    const greedyGain=greedyTH-Math.max(0,i.gth||0);
    const capped=greedyTH>=GREEDY_CAP;
    h+=`<div class="ri-single-card">
      <div class="ri-label">Greedy Machine TH (End of Period)</div>
      <div class="ri-headline cyan">${fN(greedyTH,1)} TH</div>
      <div class="ri-usd-value">from ${fN(Math.max(0,i.gth||0),1)} TH start &middot; ${fP(i.ggrow)}/wk passive${capped?' &middot; at 5k cap, passive only':''}</div>
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
    <div class="ri-headline green">${fN(gmtLocked,0)} <img src="gmt36.png" class="gmt-logo" alt="GMT"></div>
    <div class="ri-usd-value">${fU(lockedUSD)} USD value</div>
    <div class="ri-gain">+${fN(gmtGain,0)} GMT gained</div>
  </div>`;
  out.innerHTML=h;
  // Stash the key results so "Copy projection image" can render a shareable card.
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
  for(let i=0;i<N;i+=stride)pts.push({d:daily[i].d,v:daily[i].ssNet});
  if(pts[pts.length-1].d!==daily[N-1].d)pts.push({d:daily[N-1].d,v:daily[N-1].ssNet});
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
  const scaled=unit==='gmt'?(yMax/c.gp)*mult:yMax*mult;
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
  const val=unit==='gmt'?(pt.v/c.gp)*mult:pt.v*mult;
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
  try{if(localStorage.getItem('gm_onboarded'))return}catch(e){}
  document.getElementById('onboarding').style.display='';
  document.body.style.overflow='hidden';
  obGoStep(0);   // landing page: applies the step-0 state (hides wizard dots + nav)
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
    const ambDaily=refTH*15*24/1000*0.005;
    const totalDailyUSD=netUSD+dailyStakeUSD+ambDaily;
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
  const wth=document.getElementById('obWTH');if(wth)wth.value='15';
  const cpt=document.getElementById('obCPT');if(cpt)cpt.value='14.48';
  const apr=document.getElementById('obLockAPR');if(apr)apr.value='23.1';
  const cs=document.getElementById('obClickStreak');if(cs)cs.checked=false;
  const pg=document.getElementById('obPayGMT');if(pg)pg.checked=true;
  // Sync zeros to main inputs
  syncOB();
  // Zero the extras that syncOB doesn't touch, so "Current" starts at $0.
  ['inGreedyTH','inGreedyInitial','inMpTH','inMpGMT','inReferredTH','inRefCapital'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='0';});
  const gw=document.getElementById('inGreedyWth');if(gw)gw.value='15';
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
  try{localStorage.removeItem('gm_onboarded')}catch(e){}
  location.reload();
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
