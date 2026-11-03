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
    // Keep the measured speed of reversion (phi) and shocks (res), but revert toward the band the
    // Growth Projection converges on (RB_PROJ_BAND, "Still cheap") rather than the fit's centre —
    // DIFF_G0 is paired with that path, and reverting to the centre would quietly run bullish.
    const mu=(RB_OFFSETS[RB_PROJ_BAND]+RB_OFFSETS[RB_PROJ_BAND+1])/2;
    cal={fit:_rbFit,phi,a:mu*(1-phi),res,weeks:wk,rawA:a};
    return cal;
  }

  // History base rate: from weeks that sat within ±0.05 of today's deviation, how often was BTC higher 52 weeks later?
  function baseRate(d0){
    const w=cal.weeks;let hit=0,n=0;
    for(let k=0;k+52<w.length;k++){if(Math.abs(w[k].d-d0)<=0.05){n++;const p0=w[k].d+center(w[k].t),p1=w[k+52].d+center(w[k+52].t);if(p1>p0)hit++;}}
    return{n,p:n?hit/n:null};
  }
  function bandOf(d){for(let k=0;k<RB_LABELS.length;k++){if(d<=RB_OFFSETS[k]&&d>RB_OFFSETS[k+1])return k;}return d>RB_OFFSETS[0]?0:RB_LABELS.length-1;}

  // Capital → the Capital Planner's own optimal split (solvePlannerAllocation + computeEffPlan, the
  // same pair projectedMonthlyFor uses), then Monte Carlo the INCREMENTAL income that plan adds over
  // the farm as it stands: (mining after − mining before) + staking on the newly locked GMT.
  function plan(capUSD){
    const i=inp(),cur=calc(i),bp=S.btcPrice,gp=S.gmtPrice,dbt=dailyBTCperTH();
    const i2=Object.assign({},i,{cap:capUSD,mpTH:0,mpGMT:0,refCap:0});
    const a=solvePlannerAllocation(i2,bp,gp,dbt);
    const ep=a?computeEffPlan(effStateFrom(i2,a,gp,bp)):null;
    if(!a||!ep)return null;
    const th1=(ep.finTH>0)?ep.finTH:a.nt, w1=(ep.finWth>0)?ep.finWth:a.bwth;
    return{i,cur,a,ep,capUSD,K:ep.K,gmtUsedUSD:Math.max(0,ep.K-capUSD),
      th0:cur.earnTH,w0:cur.bwth,d0:cur.totD,th1,w1,d1:a.td2,
      glAdd:Math.max(0,ep.glAdd||0),apr:i.apr||0,gp,bp,covAfter:a.covAfter};
  }

  function simulate(P,years){
    const dbt=dailyBTCperTH(), cost=P.K;
    const W=Math.round(years*52), now=Date.now();
    const d0=Math.log10(S.btcPrice)-center(now);
    const gRatio=P.bp>0?P.gp/P.bp:0;                       // GMT moves with BTC at today's ratio
    const cen=[],sub=[],tm=[],stk=[];for(let w=0;w<W;w++){const t=now+(w+0.5)*WEEK;tm.push(t);cen.push(center(t));sub.push(subsidyMultAt(t));stk.push(P.glAdd*stakeAprAt(P.apr||0,(w+0.5)/52)/100/52);}
    const out={};let fan=null;
    for(const R of REGIMES){
      const dm=tm.map(t=>diffMult(t,R.g0));
      const r=rng(1234), res=cal.res, nr=res.length;
      const pb=[],endCum=[],btcEnd=[],mo1=[];
      const rec=R.k==='model', all=rec?new Float32Array(PATHS*W):null;
      for(let p=0;p<PATHS;p++){
        let d=d0,cum=0,btc=0,hit=null,first=0;
        for(let w=0;w<W;w++){
          d=cal.a+cal.phi*d+res[(r()*nr)|0];
          const price=Math.pow(10,cen[w]+d);
          if(rec)all[p*W+w]=price;
          const rew=Math.max(dbt*sub[w]*dm[w],rewardFloorBTC(price));
          const after=(rew*P.th1-fees(P.th1,P.w1,price).t*(1-P.d1/100))*(1-CONVERSION_FEE);
          const before=(rew*P.th0-fees(P.th0,P.w0,price).t*(1-P.d0/100))*(1-CONVERSION_FEE);
          const addBTC=(after-before)*7;
          const usd=addBTC*price+stk[w]*gRatio*price;
          btc+=addBTC;cum+=usd;if(w<4)first+=usd;
          if(hit===null&&cum>=cost)hit=(w+1)*7;
        }
        pb.push(hit);endCum.push(cum);btcEnd.push(btc);mo1.push(first*30/28);
      }
      const paid=pb.filter(v=>v!==null).sort((x,y)=>x-y);
      endCum.sort((x,y)=>x-y);btcEnd.sort((x,y)=>x-y);mo1.sort((x,y)=>x-y);
      const q=(arr,f)=>arr[Math.min(arr.length-1,Math.floor(f*arr.length))];
      out[R.k]={P:paid.length/PATHS,medDays:paid.length>=PATHS/2?paid[Math.floor(PATHS/2)]:null,   // median over ALL paths; null = most futures don't pay back in time
        p10:q(endCum,0.1)-cost,p50:q(endCum,0.5)-cost,p90:q(endCum,0.9)-cost,btc50:q(btcEnd,0.5),mo50:q(mo1,0.5)};
      if(rec)fan={W,now,all,cen};
    }
    return{years,cost,d0,out,fan};
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
        <p class="sec-lead">Enter what you could deploy. Odds weighs buying TH, holding GMT and selling GMT across the same simulated futures and makes the call — then shows the Capital Planner's split run through ${PATHS.toLocaleString()} possible Bitcoin futures. Price swings the way it has since 2010 and drifts toward the same Power-Law band the Growth Projection uses.</p>
      </div>
      <div class="odds-ctrl">
        <label>Capital ($)<input id="oddsCap" type="number" min="0" step="50" inputmode="decimal"></label>
        <label>Horizon<select id="oddsYrs"><option value="1">1 year</option><option value="2" selected>2 years</option><option value="3">3 years</option><option value="4">4 years</option></select></label>
        <button type="button" class="odds-run" id="oddsRun">Run the odds</button>
      </div>
      <div id="oddsCtx" class="odds-ctx"></div>
      <div id="oddsCall" class="odds-card odds-call"></div>
      <div class="odds-fan" id="oddsFanWrap" hidden>
        <div class="odds-fan-h"><span>${PATHS.toLocaleString()} Bitcoin futures</span><span id="oddsFanEnd" class="odds-fan-end"></span></div>
        <canvas id="oddsFan" aria-label="Fan chart of simulated Bitcoin price paths"></canvas>
        <div class="odds-fan-leg"><span><i class="lg-p"></i>One possible future</span><span><i class="lg-m"></i>Typical</span><span><i class="lg-b"></i>Bad / good (10th–90th)</span><span><i class="lg-c"></i>\"Still cheap\" band (Projection path)</span></div>
      </div>
      <div id="oddsBuy" class="odds-card"></div>
      <p class="odds-foot">Probabilities come from a model, not a forecast. GMT is assumed to move with BTC at today's ratio, and the model assumes GoMining keeps operating — it can't price platform risk. Not financial advice.</p>`;
    $o('oddsRun').addEventListener('click',run);
    $o('oddsCap').addEventListener('keydown',e=>{if(e.key==='Enter')run();});
  }

  function renderCtx(r){
    const b=bandOf(r.d0), br=baseRate(r.d0);
    $o('oddsCtx').innerHTML=`<span class="odds-sw" style="background:${RB_COLORS[b]}"></span>BTC ${fU(S.btcPrice,0)} sits in the <strong>${RB_LABELS[b]}</strong> band.`+
      (br.p!==null&&br.n>=8?` From this band, BTC was higher a year later in <strong>${pct(br.p)}</strong> of past weeks (${br.n} weeks, from only a few market cycles, so treat it as a hint).`:'');
  }

  function renderBuy(P,r){
    const M=r.out.model, v=verdict(M.P), ep=P.ep;
    const legs=[
      ep.thUSD>0.5?`<div><span>Buy hashrate</span><b>${fU(ep.thUSD,0)} → +${fN(ep.addTH||0,ep.addTH<10?2:1)} TH</b></div>`:'',
      ep.lockUSD>0.5?`<div><span>Lock GMT</span><b>${fU(ep.lockUSD,0)} → +${fN(P.glAdd,0)} GMT</b></div>`:'',
      ep.effUSD>0.5?`<div><span>Upgrade efficiency</span><b>${fU(ep.effUSD,0)} → ${fN(P.w1,1)} W/TH</b></div>`:''
    ].join('');
    const rows=REGIMES.map(R=>{const o=r.out[R.k];return`<div class="odds-row"><span>${R.label}<em>${R.note}</em></span><div class="odds-bar"><i class="${barCls(o.P)}" style="width:${Math.max(2,Math.round(o.P*100))}%"></i></div><b>${pct(o.P)}</b></div>`;}).join('');
    const bv=(P.covAfter>=360&&isFinite(P.covAfter))?1-360/P.covAfter:null;
    const buf=bv===null?'':bv<0.05?`<div class="odds-warn">This plan locks GMT right at the 360-day line, so any GMT price drop slips you below 20%. Holding a little extra GMT keeps the discount safe.</div>`:`<div><span>20% discount survives a GMT drop of</span><b>${pct(bv)}</b></div>`;
    $o('oddsBuy').innerHTML=`
      <div class="odds-h"><span>Deploy ${fU(P.capUSD,0)}?</span><span class="odds-pill ${v.c}">${v.t}</span></div>
      <div class="odds-sub">${P.gmtUsedUSD>0.5?`Plus ${fU(P.gmtUsedUSD,0)} of liquid GMT you already hold · `:''}${r.years}-year horizon · discount ${fN(P.d0,0)}% → ${fN(P.d1,0)}%</div>
      <div class="odds-lbl">The optimal split</div>
      <div class="odds-kv odds-split">${legs||'<div><span>Nothing to buy at this amount</span></div>'}</div>
      <div class="odds-lbl">Chance the plan pays for itself within ${r.years} year${r.years>1?'s':''}</div>
      ${rows}
      <div class="odds-kv">
        <div><span>Median payback</span><b>${M.medDays?fN(M.medDays,0)+' days':'Longer than '+r.years+' yr'+(r.years>1?'s':'')}</b></div>
        <div><span>Added income, first month (typical)</span><b>${sU(M.mo50)}/mo</b></div>
        <div><span>Profit at horizon (bad / typical / good)</span><b>${sU(M.p10)} / ${sU(M.p50)} / ${sU(M.p90)}</b></div>
        <div><span>Typical extra BTC mined</span><b>${fmtBTCAmt(M.btc50)} BTC</b></div>
      </div>
      ${buf}
      <div class="odds-note">Biggest driver: difficulty growth — see how far the three rows spread. Payback counts mining and staking income only; you still own the TH and the locked GMT afterwards.</div>
      <button type="button" class="odds-link" onclick="consoleView('tab-planner')">See it in the Capital Planner →</button>`;
  }

  // ---------- the call: buy TH vs hold/lock GMT vs sell GMT ----------
  // Same resources go into each move: the capital entered + any GMT ABOVE the 360-day cover that
  // keeps the 20% token discount (GMT below that line is working, so no move touches it).
  //   Buy TH   : capital (after the 2% USD→GMT fee) + surplus GMT → 15 W TH. GMT here mints at par.
  //   Hold GMT : capital → GMT, locked (earns staking, adds cover). Surplus stays.
  //   Sell GMT : surplus → cash. Capital stays cash.
  // Each path scores end wealth = cash + GMT held × GMT price + everything the
  // whole farm earned on the way (mining at that path's discount + staking). The discount is
  // recomputed weekly from cover, so a GMT slump that drops a thin cover below 360 days costs fees.
  // GMT: log(GMT/BTC) mean-reverts to GMT_BTC_RATIO (the app's own p25 anchor). Stationary spread
  // 0.20 in logs — wider than the 0.127 the two-year ratio history implies, because that history
  // can't show a tokenomics shock. Half-life ~13 weeks.
  const GMT_SD=0.20, GMT_PHI=Math.pow(0.5,1/13), GMT_E=GMT_SD*Math.sqrt(1-GMT_PHI*GMT_PHI);
  function gauss(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
  function decide(capUSD,years,gmtFade){
    gmtFade=gmtFade||0;   // 0.5 = GMT's BTC ratio target slides to half by the horizon (stress test)
    const i=inp(),m=calc(i),bp=S.btcPrice,gp=S.gmtPrice,dbt=dailyBTCperTH();
    if(!(bp>0&&gp>0))return null;
    const tg=i.gl+i.gw, need=i.payG?m.feesGMT*360:0, surplus=Math.max(0,tg-need);
    const fromWallet=Math.min(surplus,i.gw), fromLocked=surplus-fromWallet;
    const thBudget=capUSD/(1+USD_GMT_FEE)+surplus*gp;
    const addTH=thBudget>0?thForBudgetTiers(thBudget,TH_TIERS_NEW):0;
    const lockAdd=capUSD>0?capUSD/(1+USD_GMT_FEE)/gp:0;
    const th0=m.earnTH, w0=m.bwth, nonTok=m.nonTokD;
    const S_=[
      {k:'th',  t:'Buy TH',   cash:0,              gl:i.gl-fromLocked, gw:i.gw-fromWallet, th:th0+addTH, w:(th0+addTH)>0?(th0*w0+addTH*EFF_NEW)/(th0+addTH):EFF_NEW, addTH},
      {k:'hold',t:surplus>0?'Hold GMT':'Lock GMT',cash:0, gl:i.gl+lockAdd, gw:i.gw, th:th0, w:w0, addTH:0},
      {k:'sell',t:surplus>0?'Sell GMT':'Keep cash',cash:capUSD+surplus*gp, gl:i.gl-fromLocked, gw:i.gw-fromWallet, th:th0, w:w0, addTH:0}
    ];
    if(!(capUSD>0)&&!(surplus>0))return {none:true,need,tg,surplus,i,m};
    const W=Math.round(years*52), now=Date.now(), d0=Math.log10(bp)-center(now);
    const mu=Math.log(GMT_BTC_RATIO), r0=Math.log(gp/bp);
    const cen=[],sub=[],dm=[],aprW=[];for(let w=0;w<W;w++){const t=now+(w+0.5)*WEEK;cen.push(center(t));sub.push(subsidyMultAt(t));dm.push(diffMult(t,DIFF_G0));aprW.push(stakeAprAt(i.apr||0,(w+0.5)/52)/100/52);}
    const r=rng(4321),res=cal.res,nr=res.length, N=PATHS, fadeStep=gmtFade>0?Math.log(1-gmtFade)/W:0;
    const end=S_.map(()=>new Float64Array(N)), wins=S_.map(()=>0);
    for(let p=0;p<N;p++){
      let d=d0, lr=r0; const inc=S_.map(()=>0);
      let price=bp,g=gp;
      for(let w=0;w<W;w++){
        d=cal.a+cal.phi*d+res[(r()*nr)|0];
        const muW=mu+fadeStep*(w+1);
        lr=muW+GMT_PHI*(lr-muW)+GMT_E*gauss(r);
        price=Math.pow(10,cen[w]+d); g=Math.exp(lr)*price;
        const rew=Math.max(dbt*sub[w]*dm[w],rewardFloorBTC(price));
        for(let k=0;k<S_.length;k++){
          const s=S_[k], fe=fees(s.th,s.w,price), feeUSDday=fe.t*price*(1-nonTok/100);
          const cov=feeUSDday>0?(s.gl+s.gw)*g/feeUSDday:Infinity;
          const tok=i.payG?(cov<18?0:Math.min(20,Math.floor(cov/18))):0, D=Math.min(30,nonTok+tok);
          inc[k]+=((rew*s.th-fe.t*(1-D/100))*(1-CONVERSION_FEE)*price+s.gl*aprW[w]*g/7)*7;
        }
      }
      let best=-Infinity,bk=0;
      for(let k=0;k<S_.length;k++){const s=S_[k];const v=s.cash+(s.gl+s.gw)*g+inc[k];end[k][p]=v;if(v>best){best=v;bk=k;}}
      wins[bk]++;
    }
    const base=end[2];   // "Sell GMT / Keep cash" = the do-least move; others are shown vs it
    const out=S_.map((s,k)=>{const diff=new Float64Array(N);for(let p=0;p<N;p++)diff[p]=end[k][p]-base[p];diff.sort();
      return {k:s.k,t:s.t,win:wins[k]/N,med:diff[(N*0.5)|0],p10:diff[(N*0.1)|0],p90:diff[(N*0.9)|0]};});
    return {out,capUSD,surplus,need,tg,addTH,lockAdd,gp,years,i,m};
  }

  function renderCall(D){
    const el=$o('oddsCall');if(!el)return;
    if(!D){el.innerHTML='';return;}
    if(D.none){el.innerHTML=`<div class="odds-h"><span>The call</span><span class="odds-pill mid">Nothing to move</span></div>
      <div class="odds-sub">All ${fN(D.tg,0)} of your GMT is working to hold the discount (${fN(D.need,0)} GMT needed for 360 days), and no capital was entered. Enter an amount above to compare buying TH with locking GMT.</div>`;return;}
    const o=D.out.slice().sort((a,b)=>b.win-a.win), top=o[0], gap=top.win-o[1].win;
    const conf=top.win>=0.6&&gap>=0.2?'Clear call':top.win>=0.45&&gap>=0.1?'Lean':'Close call';
    const what={th:`Put ${D.capUSD>0?fU(D.capUSD,0):''}${D.capUSD>0&&D.surplus>0?' + ':''}${D.surplus>0?fN(D.surplus,0)+' spare GMT':''} into ≈${fN(D.addTH,D.addTH<10?2:1)} TH`,
      hold:D.surplus>0?`Keep your ${fN(D.surplus,0)} spare GMT${D.capUSD>0?` and lock ${fN(D.lockAdd,0)} more`:''}`:`Lock ${fN(D.lockAdd,0)} GMT with ${fU(D.capUSD,0)}`,
      sell:D.surplus>0?`Sell the ${fN(D.surplus,0)} GMT above your 360-day cover (≈${fU(D.surplus*D.gp,0)})`:`Keep the ${fU(D.capUSD,0)} in cash`};
    const rows=D.out.map(x=>`<div class="odds-row call-row${x.k===top.k?' win':''}"><span>${x.t}</span><div class="odds-bar"><i class="${x.k===top.k?'good':'mid'}" style="width:${Math.max(2,Math.round(x.win*100))}%"></i></div><b>${pct(x.win)}</b></div>`).join('');
    const vs=D.out.filter(x=>x.k!=='sell').map(x=>`<div class="call-vs"><span>${x.t} vs ${D.out[2].t}<em>bad · typical · good</em></span><b>${sU(x.p10)} · ${sU(x.med)} · ${sU(x.p90)}</b></div>`).join('');
    el.innerHTML=`
      <div class="call-kicker">The call · ${D.years}-year horizon</div>
      <div class="call-verdict">${top.t}</div>
      <div class="call-what">${what[top.k]}.</div>
      <div class="call-meta"><span class="odds-pill ${conf==='Clear call'?'good':conf==='Lean'?'mid':'bad'}">${conf}</span> wins in <b>${pct(top.win)}</b> of ${PATHS.toLocaleString()} futures</div>
      <div class="odds-lbl">Which move leaves you with the most, future by future</div>
      ${rows}
      <div class="odds-kv">${vs}</div>
      ${D.stress?(()=>{const z=D.stress.out.slice().sort((a,b)=>b.win-a.win)[0];const same=z.k===top.k;return `<div class="call-stress ${same?'ok':'flip'}"><b>Stress test:</b> if GMT loses half its value against BTC over the horizon, <b>${z.t}</b> wins ${pct(z.win)} of futures — ${same?'the call holds.':'the call flips. Size this one carefully.'}</div>`;})():''}
      <div class="odds-note">GMT is assumed to keep tracking BTC at its long-run ratio, the same as the Growth Projection. Counts everything you'd own at the end: cash, GMT at that future's price, new TH for what it earns (no resale value), plus all mining and staking on the way. Your discount is rechecked weekly, so a GMT drop that thins your cover costs you here. Model difficulty pace. GMT that's still locked can only be sold once its lock ends.</div>`;
  }

  // ---------- fan chart ----------
  let fanAnim=null;
  function drawFan(f){
    const wrap=$o('oddsFanWrap'),cv=$o('oddsFan');if(!wrap||!cv||!f)return;
    wrap.hidden=false;
    const W=f.W, all=f.all, N=PATHS;
    // Percentiles per week across every path.
    const p10=new Float64Array(W),p50=new Float64Array(W),p90=new Float64Array(W),col=new Float32Array(N);
    for(let w=0;w<W;w++){for(let p=0;p<N;p++)col[p]=all[p*W+w];col.sort();p10[w]=col[(N*0.1)|0];p50[w]=col[(N*0.5)|0];p90[w]=col[(N*0.9)|0];}
    const SAMPLE=Math.min(N,260);
    let lo=Infinity,hi=0;
    for(let p=0;p<SAMPLE;p++)for(let w=0;w<W;w++){const v=all[p*W+w];if(v<lo)lo=v;if(v>hi)hi=v;}
    lo=Math.min(lo,S.btcPrice)*0.9;hi=Math.max(hi,S.btcPrice)*1.1;
    const cssW=cv.clientWidth||600, cssH=Math.round(Math.min(380,Math.max(240,cssW*0.55)));
    const dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=cssW*dpr;cv.height=cssH*dpr;cv.style.height=cssH+'px';
    const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
    const pad={l:8,r:58,t:10,b:24},pw=cssW-pad.l-pad.r,ph=cssH-pad.t-pad.b;
    const X=w=>pad.l+(w+1)/W*pw, L0=Math.log(lo),L1=Math.log(hi);
    const Y=v=>pad.t+(1-(Math.log(v)-L0)/(L1-L0))*ph;
    const x0=pad.l, y0=Y(S.btcPrice);
    const short=v=>v>=1e6?'$'+(v/1e6).toFixed(1)+'M':'$'+Math.round(v/1e3)+'K';
    const endYs=[p10,p50,p90].map(a=>Y(a[W-1]));
    function axes(){
      g.font='11px ui-monospace,monospace';g.textBaseline='middle';
      for(let e=Math.floor(Math.log10(lo));e<=Math.ceil(Math.log10(hi));e++)for(const m of [1,2,5]){const v=m*Math.pow(10,e);if(v<lo||v>hi)continue;const y=Y(v);
        g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=1;g.beginPath();g.moveTo(pad.l,y);g.lineTo(pad.l+pw,y);g.stroke();
        if(endYs.some(e=>Math.abs(e-y)<13))continue;   // don't collide with the end labels
        g.fillStyle='rgba(235,226,210,.38)';g.fillText(short(v),pad.l+pw+6,y);}
      g.textBaseline='alphabetic';g.fillStyle='rgba(235,226,210,.38)';
      const yrs=W/52;for(let k=1;k<=Math.round(yrs);k++){const x=X(k*52-1);g.fillText('Yr '+k,Math.min(x-12,pad.l+pw-28),cssH-6);}
      g.fillText('Now',pad.l,cssH-6);
    }
    function line(arr,stroke,width,dash,upto){
      g.strokeStyle=stroke;g.lineWidth=width;g.setLineDash(dash||[]);g.beginPath();g.moveTo(x0,y0);
      for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(arr[w]));g.stroke();g.setLineDash([]);
    }
    const center=new Float64Array(W),mu=(RB_OFFSETS[RB_PROJ_BAND]+RB_OFFSETS[RB_PROJ_BAND+1])/2;for(let w=0;w<W;w++)center[w]=Math.pow(10,f.cen[w]+mu);
    const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DUR=reduce?0:2200, t0=performance.now();
    if(fanAnim)cancelAnimationFrame(fanAnim);
    function frame(now){
      const k=DUR?Math.min(1,(now-t0)/DUR):1, ease=1-Math.pow(1-k,3), upto=Math.max(0,Math.min(W-1,Math.floor(ease*(W-1))));
      g.clearRect(0,0,cssW,cssH);axes();
      // band
      g.fillStyle='rgba(245,166,35,.10)';g.beginPath();g.moveTo(x0,y0);
      for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(p90[w]));for(let w=upto;w>=0;w--)g.lineTo(X(w),Y(p10[w]));g.lineTo(x0,y0);g.fill();
      // individual futures
      g.lineWidth=1;
      for(let p=0;p<SAMPLE;p++){
        const end=all[p*W+W-1], up=end>=p50[W-1];
        g.strokeStyle=up?'rgba(255,198,90,.085)':'rgba(255,120,80,.07)';
        g.beginPath();g.moveTo(x0,y0);for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(all[p*W+w]));g.stroke();
      }
      line(center,'rgba(235,226,210,.55)',1.2,[4,4],upto);
      line(p10,'rgba(255,128,128,.9)',1.4,[2,3],upto);
      line(p90,'rgba(127,211,122,.9)',1.4,[2,3],upto);
      line(p50,'#FFC65A',2.4,null,upto);
      // live head
      g.fillStyle='#FFC65A';g.beginPath();g.arc(X(upto),Y(p50[upto]),3.5,0,7);g.fill();
      g.beginPath();g.arc(x0,y0,3,0,7);g.fill();
      if(k>=1){
        g.font='600 11px ui-monospace,monospace';g.textBaseline='middle';
        [[p90,'#7fd37a'],[p50,'#FFC65A'],[p10,'#ff8080']].forEach(([a,c])=>{g.fillStyle=c;g.fillText(short(a[W-1]),pad.l+pw+6,Math.max(pad.t+6,Math.min(cssH-pad.b,Y(a[W-1]))));});
        $o('oddsFanEnd').innerHTML=`In ${W>=52?Math.round(W/52)+' yr'+(W>=104?'s':''):''}: <b style="color:#ff8080">${short(p10[W-1])}</b> · <b style="color:#FFC65A">${short(p50[W-1])}</b> · <b style="color:#7fd37a">${short(p90[W-1])}</b>`;
        fanAnim=null;return;
      }
      fanAnim=requestAnimationFrame(frame);
    }
    $o('oddsFanEnd').textContent='';
    fanAnim=requestAnimationFrame(frame);
  }

  function run(){
    shell();
    if(running)return;
    if(!S.loaded||!(S.btcPrice>0)){$o('oddsBuy').innerHTML='<div class="odds-sub">Loading live data…</div>';setTimeout(run,800);return;}
    const capUSD=Math.max(0,+$o('oddsCap').value||0), yrs=+$o('oddsYrs').value||2;
    $o('oddsBuy').innerHTML='<div class="odds-sub">Running '+PATHS.toLocaleString()+' futures…</div>';
    running=true;
    ensureRainbowFit(()=>{
      if(!_rbFit||!_rainbowData||_rainbowData.length<100){running=false;
        $o('oddsBuy').innerHTML='<div class="odds-sub">Couldn\'t load Bitcoin\'s price history, which the odds are built on. Check your connection and try again.</div><button type="button" class="odds-link" id="oddsRetry">Try again →</button>';
        $o('oddsRetry').onclick=run;return;}
      setTimeout(()=>{   // let "Running…" paint first
        try{calibrate();const Dc=decide(capUSD,yrs);if(Dc&&!Dc.none)Dc.stress=decide(capUSD,yrs,0.5);renderCall(Dc);const P=capUSD>0?plan(capUSD):null;
          if(!P){$o('oddsBuy').innerHTML='<div class="odds-sub">Enter a capital amount to see the Capital Planner\'s split and its payback odds.</div>';const r0=simulate({K:0,th0:0,w0:EFF_NEW,d0:0,th1:0,w1:EFF_NEW,d1:0,glAdd:0,apr:0,gp:S.gmtPrice,bp:S.btcPrice},yrs);renderCtx(r0);drawFan(r0.fan);return;}
          const r=simulate(P,yrs);renderCtx(r);drawFan(r.fan);renderBuy(P,r);}
        catch(e){console.error('[odds]',e);$o('oddsBuy').innerHTML='<div class="odds-sub">Something went wrong running the odds.</div>';}
        finally{running=false;}
      },30);
    });
  }

  function onShow(){
    shell();
    const c=$o('oddsCap');
    if(c&&!c.value)c.value=1000;
    run();
  }
  window.openOdds=onShow;
  // Deep link (/console?view=odds) activates the tab before this file loads — catch up.
  const tab=$o('tab-odds');if(tab&&tab.classList.contains('active'))onShow();
})();
