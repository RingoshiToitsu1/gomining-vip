/* GMT Optimizer — Odds tab.
   Turns the single-path Growth Projection into a probability view. Same engine, run thousands
   of times: BTC price wanders around the Power-Law fit (_rbFit) the rest of the app projects on,
   with mean reversion and shocks measured from BTC's own weekly history (bootstrapped residuals,
   so fat tails come from the data, not from a bell curve). Rewards follow the app's own
   subsidyMultAt + difficulty grind + rewardFloorBTC, fees follow fees() and calc()'s discount.
   Difficulty is NOT randomised per path — it is the biggest single driver, so it is shown as three
   explicit regimes taken from the trailing difficulty CAGRs documented next to DIFF_G0
   (2yr 26% / 3yr 37% / 8yr 50%). Depends on app.js globals; loads after it. */
(function(){
  'use strict';
  const PATHS=4000, WEEK=7*86400000, DAY=86400000;
  const REGIMES=[
    {k:'slow',  g0:0.26, label:'Slow difficulty', note:'2-yr pace'},
    {k:'model', g0:DIFF_G0, label:'Model difficulty', note:'3-yr pace, same as Projection'},
    {k:'fast',  g0:0.50, label:'Fast difficulty', note:'8-yr pace'}
  ];
  let cal=null;            // {phi,a,res[],weeks[]} — calibrated once per fit
  let running=false;

  const $o=id=>document.getElementById(id);
  const center=t=>_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b;            // log10 Power-Law centre
  function diffMult(t,g0){
    const yrs=(t-Date.now())/(365.25*DAY); if(yrs<=0)return 1;
    return 1/Math.exp(DIFF_FLOOR*yrs+(g0-DIFF_FLOOR)*DIFF_TAU*(1-Math.exp(-yrs/DIFF_TAU)));
  }
  function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

  // Weekly deviations from the Power-Law centre → AR(1): d' = a + phi·d + e. Residuals kept for bootstrap.
  function calibrate(){
    if(cal&&cal.fit===_rbFit)return cal;
    const wk=[];let next=0;
    for(const p of _rainbowData){if(p.t>=next&&p.v>0){wk.push({t:p.t,d:Math.log10(p.v)-center(p.t)});next=p.t+WEEK;}}
    let n=0,sx=0,sy=0,sxx=0,sxy=0;
    for(let k=1;k<wk.length;k++){const x=wk[k-1].d,y=wk[k].d;n++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
    let phi=(n*sxy-sx*sy)/(n*sxx-sx*sx),a=(sy-phi*sx)/n;
    if(!isFinite(phi)||phi>=0.999||phi<=0){phi=0.99;a=0;}
    const res=[];for(let k=1;k<wk.length;k++)res.push(wk[k].d-(a+phi*wk[k-1].d));
    cal={fit:_rbFit,phi,a,res,weeks:wk};
    return cal;
  }

  // History base rate: from weeks that sat within ±0.05 of today's deviation, how often was BTC higher 52 weeks later?
  function baseRate(d0){
    const w=cal.weeks;let hit=0,n=0;
    for(let k=0;k+52<w.length;k++){if(Math.abs(w[k].d-d0)<=0.05){n++;const p0=w[k].d+center(w[k].t),p1=w[k+52].d+center(w[k+52].t);if(p1>p0)hit++;}}
    return{n,p:n?hit/n:null};
  }
  function bandOf(d){for(let k=0;k<RB_LABELS.length;k++){if(d<=RB_OFFSETS[k]&&d>RB_OFFSETS[k+1])return k;}return d>RB_OFFSETS[0]?0:RB_LABELS.length-1;}

  // One Monte Carlo run for buying X TH. Returns per-regime stats.
  function simulate(X,years){
    const i=inp(),cur=calc(i);
    const i2=Object.assign({},i,{th:i.th+X,wth:(i.th+X)>0?(i.th*i.wth+X*EFF_NEW)/(i.th+X):EFF_NEW});
    const m2=calc(i2);
    const totD=m2.totD, dbt=dailyBTCperTH();
    const cpt=cptTier(TH_TIERS_NEW,X), cost=X*cpt*(1+USD_GMT_FEE);
    const W=Math.round(years*52), now=Date.now();
    const d0=Math.log10(S.btcPrice)-center(now);
    // Precompute per-week centre/subsidy so the inner loop is arithmetic only.
    const cen=[],sub=[],tm=[];for(let w=0;w<W;w++){const t=now+(w+0.5)*WEEK;tm.push(t);cen.push(center(t));sub.push(subsidyMultAt(t));}
    const out={};
    for(const R of REGIMES){
      const dm=tm.map(t=>diffMult(t,R.g0));
      const r=rng(1234), res=cal.res, nr=res.length;
      const pb=[],maxCum=[],endCum=[],btcEnd=[];
      for(let p=0;p<PATHS;p++){
        let d=d0,cum=0,mx=0,btc=0,hit=null;
        for(let w=0;w<W;w++){
          d=cal.a+cal.phi*d+res[(r()*nr)|0];
          const price=Math.pow(10,cen[w]+d);
          const rew=Math.max(dbt*sub[w]*dm[w],rewardFloorBTC(price));
          const fee=fees(1,EFF_NEW,price).t*(1-totD/100);
          const netBTC=(rew-fee)*(1-CONVERSION_FEE)*7*X;
          btc+=netBTC;cum+=netBTC*price;if(cum>mx)mx=cum;
          if(hit===null&&cum>=cost)hit=(w+1)*7;
        }
        pb.push(hit);maxCum.push(mx);endCum.push(cum);btcEnd.push(btc);
      }
      const paid=pb.filter(v=>v!==null).sort((a,b)=>a-b);
      maxCum.sort((a,b)=>a-b);endCum.sort((a,b)=>a-b);btcEnd.sort((a,b)=>a-b);
      const q=(arr,f)=>arr[Math.min(arr.length-1,Math.floor(f*arr.length))];
      out[R.k]={P:paid.length/PATHS,medDays:paid.length>=PATHS/2?paid[Math.floor(PATHS/2)]:null,   // median over ALL paths; null = most futures don't pay back in time
        
        p10:q(endCum,0.1)-cost,p50:q(endCum,0.5)-cost,p90:q(endCum,0.9)-cost,btc50:q(btcEnd,0.5),
        fair50:q(maxCum,0.5)/X/(1+USD_GMT_FEE),fair60:q(maxCum,0.4)/X/(1+USD_GMT_FEE)};
    }
    return{X,years,cost,cpt,totD,curTotD:cur.totD,d0,out,i,cur};
  }

  // ---------- render ----------
  const pct=v=>Math.round(v*100)+'%';
  const sU=v=>(v<0?'-':'')+fU(Math.abs(v),0);
  function verdict(P){return P>=0.6?{t:'Good odds',c:'good'}:P>=0.35?{t:'Coin flip',c:'mid'}:{t:'Poor odds',c:'bad'};}
  function barCls(P){return P>=0.6?'good':P>=0.35?'mid':'bad';}

  function shell(){
    const el=$o('oddsRoot');if(!el||el.dataset.built)return;
    el.dataset.built='1';
    el.innerHTML=`
      <div class="sec-head" style="margin-top:3.4rem">
        <span class="tag"><span class="dot"></span>Odds</span>
        <h2 class="sec-title">Decide on <span class="grad">probabilities.</span></h2>
        <p class="sec-lead">Your farm, run through ${PATHS.toLocaleString()} possible Bitcoin futures. Price wanders around the Power-Law line the way it has since 2012 — same fees, discounts, halvings and difficulty grind as the rest of the console.</p>
      </div>
      <div class="odds-ctrl">
        <label>TH to buy<input id="oddsTH" type="number" min="1" step="1" inputmode="numeric"></label>
        <label>Horizon<select id="oddsYrs"><option value="1">1 year</option><option value="2" selected>2 years</option><option value="3">3 years</option><option value="4">4 years</option></select></label>
        <button type="button" class="odds-run" id="oddsRun">Run the odds</button>
      </div>
      <div id="oddsCtx" class="odds-ctx"></div>
      <div id="oddsBuy" class="odds-card"></div>
      <div class="odds-grid"><div id="oddsEff" class="odds-card"></div><div id="oddsGmt" class="odds-card"></div></div>
      <p class="odds-foot">Probabilities come from a model, not a forecast. They assume GoMining keeps operating and prices stay where they are today; they can't price platform risk. Not financial advice.</p>`;
    $o('oddsRun').addEventListener('click',run);
    $o('oddsTH').addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  }

  function renderCtx(r){
    const b=bandOf(r.d0), br=baseRate(r.d0);
    $o('oddsCtx').innerHTML=`<span class="odds-sw" style="background:${RB_COLORS[b]}"></span>BTC ${fU(S.btcPrice,0)} sits in the <strong>${RB_LABELS[b]}</strong> band.`+
      (br.p!==null&&br.n>=8?` From this band, BTC was higher a year later in <strong>${pct(br.p)}</strong> of past weeks (${br.n} weeks, from only a few market cycles, so treat it as a hint).`:'');
  }

  function renderBuy(r){
    const M=r.out.model, v=verdict(M.P);
    const rows=REGIMES.map(R=>{const o=r.out[R.k];return`<div class="odds-row"><span>${R.label}<em>${R.note}</em></span><div class="odds-bar"><i class="${barCls(o.P)}" style="width:${Math.max(2,Math.round(o.P*100))}%"></i></div><b>${pct(o.P)}</b></div>`;}).join('');
    const discNote=r.totD<r.curTotD-0.01?`<div class="odds-warn">Adding ${fN(r.X,0)} TH stretches your GMT cover: discount drops from ${fN(r.curTotD,0)}% to ${fN(r.totD,0)}% unless you top up GMT.</div>`:'';
    $o('oddsBuy').innerHTML=`
      <div class="odds-h"><span>Buy ${fN(r.X,0)} TH now?</span><span class="odds-pill ${v.c}">${v.t}</span></div>
      <div class="odds-sub">${fU(r.cost,0)} at ${fU(r.cpt,2)}/TH (15 W, incl. 2% USD→GMT fee) · ${r.years}-year horizon</div>
      <div class="odds-lbl">Chance it pays for itself within ${r.years} year${r.years>1?'s':''}</div>
      ${rows}
      <div class="odds-kv">
        <div><span>Median payback</span><b>${M.medDays?fN(M.medDays,0)+' days':'Longer than '+r.years+' yr'+(r.years>1?'s':'')}</b></div>
        <div><span>Profit at horizon (bad / typical / good)</span><b>${sU(M.p10)} / ${sU(M.p50)} / ${sU(M.p90)}</b></div>
        <div><span>Typical BTC mined</span><b>${fmtBTCAmt(M.btc50)} BTC</b></div>
        <div><span>TH price for even odds</span><b>${fU(M.fair50,2)}/TH</b></div>
        <div><span>TH price for 60% odds</span><b>${fU(M.fair60,2)}/TH</b></div>
      </div>
      ${discNote}
      <div class="odds-note">Biggest driver: difficulty growth — see how far the three rows spread. You still own the TH after the horizon; it's not counted here.</div>`;
  }

  function renderEff(r){
    const i=r.i,m=r.cur,el=$o('oddsEff');
    if(!(i.th>0)){el.innerHTML=`<div class="odds-h"><span>Efficiency upgrade</span></div><div class="odds-sub">Add your farm to see this.</div><button type="button" class="odds-link" onclick="openEditSetup()">Edit my farm →</button>`;return;}
    if(i.wth<=EFF_BEST+0.01){el.innerHTML=`<div class="odds-h"><span>Efficiency upgrade</span><span class="odds-pill good">Done</span></div><div class="odds-big">${EFF_BEST} W/TH</div><div class="odds-sub">Already at the best rating GoMining offers.</div>`;return;}
    const cost=i.th*effUpgradeCostBetween(i.wth,EFF_BEST);
    const save=i.th*(i.wth-EFF_BEST)*24/1000*ELECTRICITY_RATE*(1-m.totD/100)*(1-CONVERSION_FEE);
    const days=save>0?cost/save:Infinity, v=days<=365?{t:'Do it',c:'good'}:days<=730?{t:'Solid',c:'mid'}:{t:'Low priority',c:'bad'};
    el.innerHTML=`<div class="odds-h"><span>Upgrade ${fN(i.wth,1)} → ${EFF_BEST} W/TH</span><span class="odds-pill ${v.c}">${v.t}</span></div>
      <div class="odds-big">${isFinite(days)?fN(days,0)+' days':'—'}</div>
      <div class="odds-sub">to pay back ${fU(cost,0)} · saves ${fU(save*30,0)}/mo · ${fN(save*365/cost*100,0)}%/yr. Fees are in dollars, so BTC's price doesn't change this one.</div>`;
  }

  function renderGmt(r){
    const i=r.i,m=r.cur,el=$o('oddsGmt'),gp=m.gp;
    if(!(i.th>0)){el.innerHTML=`<div class="odds-h"><span>GMT cover</span></div><div class="odds-sub">Add your farm to see this.</div>`;return;}
    if(!i.payG){el.innerHTML=`<div class="odds-h"><span>GMT cover</span><span class="odds-pill mid">Off</span></div><div class="odds-sub">Turn on paying fees in GMT to earn the token discount (up to 20%).</div><button type="button" class="odds-link" onclick="openEditSetup()">Edit my farm →</button>`;return;}
    const tg=i.gl+i.gw, need360=m.feesGMT*360, cov=m.cov;
    if(cov>=360){
      const buf=1-360/cov, extra=tg-need360;
      el.innerHTML=`<div class="odds-h"><span>GMT cover</span><span class="odds-pill good">Hold 20%</span></div>
        <div class="odds-big">${isFinite(cov)?fN(cov,0):'∞'} days</div>
        <div class="odds-sub">Your 20% holds through a ${pct(buf)} GMT price drop. About ${fN(extra,0)} GMT (${fU(extra*gp,0)}) sits above the 360-day line — that's the part you could sell or lock without losing the discount.</div>`;
    }else{
      const top=Math.max(0,need360-tg), topUSD=top*gp*(1+USD_GMT_FEE);
      const gain=m.f.t*m.bp*(Math.min(30,m.nonTokD+20)-m.totD)/100*(1-CONVERSION_FEE);
      const dd=gain>0?topUSD/gain:Infinity;
      el.innerHTML=`<div class="odds-h"><span>GMT cover</span><span class="odds-pill ${dd<=365?'good':'mid'}">${dd<=365?'Top up':'Optional'}</span></div>
        <div class="odds-big">${fN(cov,0)} / 360 days</div>
        <div class="odds-sub">${fN(top,0)} more GMT (${fU(topUSD,0)}) gets you to the 20% cap and saves ${fU(gain*30,0)}/mo — about ${isFinite(dd)?fN(dd,0):'—'} days to earn it back, not counting what the GMT itself does. Partial top-ups barely help: the best split is almost always 0% or 20%.</div>`;
    }
  }

  function run(){
    shell();
    if(running)return;
    if(!S.loaded||!(S.btcPrice>0)){$o('oddsBuy').innerHTML='<div class="odds-sub">Loading live data…</div>';setTimeout(run,800);return;}
    const X=Math.max(1,Math.round(+$o('oddsTH').value||0)), yrs=+$o('oddsYrs').value||2;
    $o('oddsBuy').innerHTML='<div class="odds-sub">Running '+PATHS.toLocaleString()+' futures…</div>';
    running=true;
    ensureRainbowFit(()=>{
      if(!_rbFit||!_rainbowData||_rainbowData.length<100){running=false;
        $o('oddsBuy').innerHTML='<div class="odds-sub">Couldn\'t load Bitcoin\'s price history, which the odds are built on. Check your connection and try again.</div><button type="button" class="odds-link" id="oddsRetry">Try again →</button>';
        $o('oddsRetry').onclick=run;return;}
      setTimeout(()=>{   // let "Running…" paint first
        try{calibrate();const r=simulate(X,yrs);renderCtx(r);renderBuy(r);renderEff(r);renderGmt(r);}
        catch(e){console.error('[odds]',e);$o('oddsBuy').innerHTML='<div class="odds-sub">Something went wrong running the odds.</div>';}
        finally{running=false;}
      },30);
    });
  }

  function onShow(){
    shell();
    const t=$o('oddsTH');
    if(t&&!t.value){const th=(+($('inTH')&&$('inTH').value)||0);t.value=th>0?Math.max(10,Math.round(th*0.1/10)*10):100;}
    run();
  }
  window.openOdds=onShow;
  const btn=document.querySelector('[data-tab="tab-odds"]');
  if(btn)btn.addEventListener('click',onShow);
  // Deep link (/console?view=odds) activates the tab before this file loads — catch up.
  const tab=$o('tab-odds');if(tab&&tab.classList.contains('active'))onShow();
})();
