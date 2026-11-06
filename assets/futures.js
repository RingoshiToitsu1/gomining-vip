/* GMT Optimizer — "4,000 Bitcoin futures" inside the Growth Projection.
   BTC price paths that wander around the Power-Law fit the way BTC has since 2010: weekly
   deviations from the fit follow an AR(1) whose speed (phi) and shocks (bootstrapped residuals)
   are measured from history, reverting toward RB_PROJ_BAND ("Still cheap") — the same band the
   Growth Projection converges on and DIFF_G0 is paired with. Simulated once for 10 years; every
   shorter horizon is a prefix of the same paths, so switching 1/2/3/4/5/10 years is instant.
   This file drives the whole Growth Projection page: the chips ARE the projection horizon and the
   typical (median) path IS the BTC price path computeSetupProjection() walks (via GMFutures). Any
   change — horizon, payout, My Farm / My Plan — re-runs the reinvesting projection in place, and
   the Daily / Monthly / Yearly cards show its end-of-period figures (window._spEnd, 'gm:proj').
   Depends on app.js globals; loads after it. Shares its method with assets/odds.js (hidden). */
(function(){
  'use strict';
  const PATHS=4000, WEEK=7*86400000, DAY=86400000, MAXY=10, YEARS=[1,2,3,4,5,10], SAMPLE=260;
  let sim=null, yrs=5, anim=null, building=false;
  const $f=id=>document.getElementById(id);
  const band=()=>(RB_OFFSETS[RB_PROJ_BAND]+RB_OFFSETS[RB_PROJ_BAND+1])/2;
  const center=t=>_rbFit.m*Math.log(rbDayOf(t))+_rbFit.b;
  function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

  function simulate(){
    // Calibrate on weekly deviations from the fit.
    const wk=[];let next=0;
    for(const p of _rainbowData){if(p.t>=next&&p.v>0){wk.push(Math.log10(p.v)-center(p.t));next=p.t+WEEK;}}
    let n=0,sx=0,sy=0,sxx=0,sxy=0;
    for(let k=1;k<wk.length;k++){const x=wk[k-1],y=wk[k];n++;sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;}
    let phi=(n*sxy-sx*sy)/(n*sxx-sx*sx),a=(sy-phi*sx)/n;
    if(!isFinite(phi)||phi>=0.999||phi<=0){phi=0.99;a=0;}
    const res=[];for(let k=1;k<wk.length;k++)res.push(wk[k]-(a+phi*wk[k-1]));
    const mu=band(), aR=mu*(1-phi), nr=res.length;
    const W=MAXY*52, now=Date.now(), cen=new Float64Array(W);
    for(let w=0;w<W;w++)cen[w]=center(now+(w+1)*WEEK);
    const all=new Float32Array(PATHS*W), r=rng(1234), d0=Math.log10(S.btcPrice)-center(now);
    for(let p=0;p<PATHS;p++){let d=d0;for(let w=0;w<W;w++){d=aR+phi*d+res[(r()*nr)|0];all[p*W+w]=Math.pow(10,cen[w]+d);}}
    const p10=new Float64Array(W),p50=new Float64Array(W),p90=new Float64Array(W),col=new Float32Array(PATHS);
    for(let w=0;w<W;w++){for(let p=0;p<PATHS;p++)col[p]=all[p*W+w];col.sort();p10[w]=col[(PATHS*0.1)|0];p50[w]=col[(PATHS*0.5)|0];p90[w]=col[(PATHS*0.9)|0];}
    const lane=new Float64Array(W);for(let w=0;w<W;w++)lane[w]=Math.pow(10,cen[w]+mu);
    return{W,now,all,p10,p50,p90,lane,bp:S.btcPrice};
  }

  // Typical (median) price at time t: today's price at t<=now, then the weekly medians, linear in log.
  function typicalAt(t){
    if(!sim)return 0;
    const x=(t-sim.now)/WEEK-1;   // index into weekly medians (week w sits at now+(w+1) weeks)
    if(x<=-1)return sim.bp;
    if(x<0)return Math.exp(Math.log(sim.bp)*(-x)+Math.log(sim.p50[0])*(1+x));
    const i0=Math.min(sim.W-1,Math.floor(x)),i1=Math.min(sim.W-1,i0+1),f=Math.min(1,x-i0);
    return Math.exp(Math.log(sim.p50[i0])*(1-f)+Math.log(sim.p50[i1])*f);
  }
  window.GMFutures={ready:()=>!!sim,years:()=>yrs,typicalAt};

  function shell(){
    const host=$f('spFuturesHost');if(!host||host.dataset.built)return;
    host.dataset.built='1';
    host.innerHTML=`
      <div class="fx-wrap">
        <div class="fx-head">
          <div><div class="fx-title">${PATHS.toLocaleString()} Bitcoin futures</div>
          <div class="fx-sub" id="fxSub">Pick how far ahead to project</div></div>
          <div class="fx-chips" role="tablist" aria-label="Horizon">${YEARS.map(y=>`<button type="button" class="fx-chip${y===yrs?' on':''}" data-y="${y}" role="tab" aria-selected="${y===yrs}">${y}Y</button>`).join('')}</div>
        </div>
        <div class="fx-plot" id="fxPlot"><canvas id="fxCanvas" aria-label="Fan chart of simulated Bitcoin price paths"></canvas>
          <div class="fx-x" id="fxX" hidden><i class="hi"></i><i class="mid"></i><i class="lo"></i></div><div class="fx-tip" id="fxTip" hidden></div></div>
        <div class="fx-leg"><span><i class="lg-p"></i>One possible future</span><span><i class="lg-m"></i>Avg</span><span><i class="lg-b"></i>Low / high (10th–90th)</span><span><i class="lg-c"></i>"Still cheap" band</span></div>
        <div class="fx-when" id="fxWhen"></div>
        <div class="hero-grid fx-grid">
          <div class="hero-card green-accent"><span class="corners"></span>
            <div class="hero-label">Daily Net Profit</div>
            <div class="hero-val-row fx-row"><div class="hero-val green" id="fxDay">--</div><span class="hero-btc" id="fxDayBtc"></span></div>
            <div class="hero-sub" id="fxDaySub">--</div></div>
          <div class="hero-card cyan-accent"><span class="corners"></span>
            <div class="hero-label">Monthly Earnings</div>
            <div class="hero-val-row fx-row"><div class="hero-val cyan" id="fxMo">--</div><span class="hero-btc" id="fxMoBtc"></span></div>
            <div class="hero-sub" id="fxMoSub">--</div></div>
          <div class="hero-card purple-accent"><span class="corners"></span>
            <div class="hero-label">Yearly Earnings</div>
            <div class="hero-val-row fx-row"><div class="hero-val purple" id="fxYr">--</div><span class="hero-btc" id="fxYrBtc"></span></div>
            <div class="hero-sub" id="fxYrSub">--</div></div>
        </div>
        <div class="fx-note" id="fxNote"></div>
        <div class="fx-foot">A model, not a forecast: price swings are sampled from Bitcoin's own history and drift toward the rainbow chart's Still-cheap band. The projection below walks the typical line, reinvesting each week. Not financial advice.</div>
      </div>`;
    host.querySelectorAll('.fx-chip').forEach(b=>b.addEventListener('click',()=>{yrs=+b.dataset.y;
      host.querySelectorAll('.fx-chip').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-selected',on);});project(true);}));
  }

  function render(){
    if(!sim)return;
    const Wn=yrs*52, wEnd=Wn-1, t=sim.now+Wn*WEEK, P=sim.p50[wEnd];
    draw(Wn);
    const date=new Date(t).toLocaleDateString('en-US',{month:'short',year:'numeric'});
    // Headline: one row, three equal stats — low and high get the same weight as the middle.
    const st=(k,v,c)=>`<div class="fx-stat${c?' '+c:''}"><div class="fx-k">${k}</div><div class="fx-v">${fU(v,0)}</div></div>`;
    $f('fxWhen').innerHTML=`<div class="fx-title">${yrs} Year Forecast <span>${date}</span></div>
      <div class="fx-stats">${st('Avg',P,'mid')}${st('Low',sim.p10[wEnd])}${st('High',sim.p90[wEnd])}</div>`;
    const sub=$f('fxSub');if(sub)sub.textContent=(window._spMode==='planner'?'Your plan':'Your farm')+', reinvesting along the typical path';
  }
  // Cards = the reinvesting projection's end-of-period figures, so they always match the results below.
  function cards(){
    if(!$f('fxDay'))return;
    const E=window._spEnd;
    if(!E){   // the run stopped early (no farm, no plan) — the reason is shown in the results below
      ['fxDay','fxMo','fxYr'].forEach(id=>{const e=$f(id);e._cur=0;e.textContent='--';e.className='hero-val';});
      ['fxDayBtc','fxMoBtc','fxYrBtc','fxNote'].forEach(id=>{$f(id).textContent='';});
      const why=window._spMode==='planner'?'Enter an amount in the Capital Planner to see this':'Add your farm to see this';
      ['fxDaySub','fxMoSub','fxYrSub'].forEach(id=>{$f(id).textContent=why;});
      return;}
    const d=E.daily, mo=d*30, yr=d*365, P=E.bpEnd>0?E.bpEnd:S.btcPrice, btc=v=>'(\u20BF'+fmtBTCAmt(v/P)+')';
    const set=(id,v,fmt,cls)=>{const e=$f(id);animateMetric(e,v,fmt);e.className='hero-val '+(v>=0?cls:'red');};
    set('fxDay',d,fU,'green');set('fxMo',mo,v=>fU(v,0),'cyan');set('fxYr',yr,v=>fU(v,0),'purple');
    $f('fxDayBtc').textContent=btc(d);$f('fxMoBtc').textContent=btc(mo);$f('fxYrBtc').textContent=btc(yr);
    const parts=(k)=>[fU(E.mining*k,k>1?0:2)+' mining',fU(E.staking*k,k>1?0:2)+' staking'].concat(E.amb>0?[fU(E.amb*k,k>1?0:2)+' ambassador']:[]).concat(E.greedy>0?[fU(E.greedy*k,k>1?0:2)+' greedy']:[]).join(' + ');
    $f('fxDaySub').textContent=parts(1);
    $f('fxMoSub').textContent=parts(30);
    $f('fxYrSub').textContent=fN(E.th,E.th<100?1:0)+' TH · '+(E.ssPct>=0?'+':'')+fN(E.ssPct,0)+'% vs today';
    $f('fxNote').innerHTML=E.gmtRange||'';
  }
  addEventListener('gm:proj',cards);
  // Re-run the reinvesting projection for the current horizon / payout / mode.
  // The run is synchronous and a 10-year one takes several seconds, so: show a busy state, let it
  // paint, run, and only then animate the chart and the cards together.
  // A horizon switch (loud) plays the futures loader over the panel; payout / mode changes stay quiet.
  let ran=0;
  function project(loud){
    if(!sim||typeof runSetupProjection!=='function')return;
    ['fxDay','fxMo','fxYr'].forEach(id=>{const e=$f(id);if(e)e.classList.add('fx-busy');});
    const w=$f('fxWhen');if(w)w.innerHTML=`<span class="fx-spin"></span>Projecting ${yrs} year${yrs>1?'s':''} of weekly reinvesting…`;
    const host=loud&&document.querySelector('#spFuturesHost .fx-wrap');
    if(!host){setTimeout(runSetupProjection,40);return;}
    loader(host,++ran);
  }

  // ---- futures loader: the real simulated paths for this horizon streak out of today's price,
  // a counter races to 4,000, then the high / low / avg lines sweep across. Only after that does
  // the (synchronous, multi-second for 10Y) reinvesting run start, so the animation never stalls
  // mid-flight; its last step ticks off when the run lands ('gm:proj').
  function loader(host,id){
    const old=host.querySelector('.fx-load');if(old)old.remove();
    const Y=yrs,Wn=Y*52,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el=document.createElement('div');el.className='fx-load';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML=`<div class="fx-lk">${Y} Year Forecast</div>
      <div class="fx-lc"><span id="fxLN">0</span><small>/ ${PATHS.toLocaleString()} Bitcoin futures</small></div>
      <canvas class="fx-lcv"></canvas>
      <div class="fx-lbar"><i></i></div>
      <ul class="fx-lsteps">
        <li><b></b><span>Simulating every week of ${Y} year${Y>1?'s':''}</span><em>${Wn.toLocaleString()} weeks</em></li>
        <li><b></b><span>Finding the high, avg and low path</span><em>${fU(sim.p50[Wn-1],0)} avg</em></li>
        <li><b></b><span>Reinvesting your rewards each week</span><em></em></li>
      </ul>`;
    host.appendChild(el);
    const cv=el.querySelector('canvas'),num=el.querySelector('#fxLN'),bar=el.querySelector('.fx-lbar i'),rows=[...el.querySelectorAll('.fx-lsteps li')];
    const cssW=cv.clientWidth||600,cssH=cv.clientHeight||220,dpr=Math.min(2,devicePixelRatio||1);
    cv.width=cssW*dpr;cv.height=cssH*dpr;
    // trail: persistent layer the paths are painted onto; fx: cleared each frame (sparks, lines)
    const trail=document.createElement('canvas');trail.width=cv.width;trail.height=cv.height;
    const tg=trail.getContext('2d'),g=cv.getContext('2d');tg.setTransform(dpr,0,0,dpr,0,0);g.setTransform(dpr,0,0,dpr,0,0);
    let lo=sim.bp,hi=sim.bp;for(let w=0;w<Wn;w++){if(sim.p10[w]<lo)lo=sim.p10[w];if(sim.p90[w]>hi)hi=sim.p90[w];}
    lo*=0.7;hi*=1.6;
    const pad={l:6,r:6,t:8,b:8},pw=cssW-pad.l-pad.r,ph=cssH-pad.t-pad.b,L0=Math.log(lo),L1=Math.log(hi);
    const X=w=>pad.l+(w+1)/Wn*pw,Yv=v=>pad.t+(1-(Math.log(v)-L0)/(L1-L0))*ph,x0=pad.l,y0=Yv(sim.bp);   // unclamped: wild paths run off the edge
    const N=Math.min(PATHS,cssW<500?260:420),STEP=Math.max(1,Math.ceil(Wn/120)),W=sim.W,med=sim.p50[Wn-1];
    // each drawn path: start time and speed, staggered so they burst out in waves
    const P=[];for(let k=0;k<N;k++){const p=(k*9973)%PATHS;P.push({p,s:Math.pow(k/N,1.35)*1500,d:520+((k*37)%300),f:0,b:-1,up:sim.all[p*W+Wn-1]>=med});}
    const T1=reduce?0:2050, T2=reduce?0:900, t0=performance.now();   // paths, then the three lines
    let phase=0,gone=false;
    const at=(arr,k)=>arr[Math.min(Wn-1,k)];
    function path(ctx,p,from,to){ctx.beginPath();ctx.moveTo(from<0?x0:X(from),from<0?y0:Yv(sim.all[p*W+from]));
      for(let w=Math.max(0,from)+STEP;w<=to;w+=STEP)ctx.lineTo(X(w),Yv(sim.all[p*W+w]));
      if((to-Math.max(0,from))%STEP)ctx.lineTo(X(to),Yv(sim.all[p*W+to]));ctx.stroke();}
    function band(arr,col,glow,width,k,dash){g.strokeStyle=col;g.lineWidth=width;g.setLineDash(dash||[]);g.shadowColor=glow;g.shadowBlur=width*6;
      g.beginPath();g.moveTo(x0,y0);for(let w=0;w<=k;w+=STEP)g.lineTo(X(w),Yv(arr[w]));g.lineTo(X(k),Yv(arr[k]));g.stroke();g.setLineDash([]);
      g.fillStyle=col;g.beginPath();g.arc(X(k),Yv(arr[k]),width+1.5,0,7);g.fill();g.shadowBlur=0;}
    function frame(now){
      if(gone||ran!==id||!el.isConnected)return;
      const t=now-t0;
      // paths
      tg.globalCompositeOperation='lighter';tg.lineWidth=1;
      let alive=0;
      g.clearRect(0,0,cssW,cssH);g.globalAlpha=1;g.drawImage(trail,0,0,cssW,cssH);
      g.globalCompositeOperation='lighter';
      for(const q of P){
        const f=Math.max(0,Math.min(1,(t-q.s)/q.d));if(f<=q.f)continue;
        const a=q.b,b=Math.floor((1-Math.pow(1-f,2))*(Wn-1));
        if(b>a){tg.strokeStyle=q.up?'rgba(255,190,80,.11)':'rgba(255,110,70,.10)';path(tg,q.p,a,b);q.b=b;}
        if(f<1){alive++;const hx=X(b),hy=Yv(sim.all[q.p*W+b]);   // spark at the head
          g.fillStyle=q.up?'rgba(255,220,140,.9)':'rgba(255,150,110,.85)';g.shadowColor=g.fillStyle;g.shadowBlur=8;
          g.beginPath();g.arc(hx,hy,1.3,0,7);g.fill();}
        q.f=f;
      }
      g.shadowBlur=0;g.globalCompositeOperation='source-over';
      // origin pulse
      const pr=3+Math.sin(t/140)*1.2;g.fillStyle='#FFC65A';g.shadowColor='#FFC65A';g.shadowBlur=18;g.beginPath();g.arc(x0,y0,pr,0,7);g.fill();g.shadowBlur=0;
      const pk=Math.min(1,t/Math.max(1,T1));
      num.textContent=Math.round(PATHS*(1-Math.pow(1-pk,2))).toLocaleString();
      // the three lines sweep in once the paths are out
      const lk=T2?Math.max(0,Math.min(1,(t-T1+250)/T2)):1;
      if(lk>0){const k=Math.max(0,Math.floor((1-Math.pow(1-lk,3))*(Wn-1)));
        band(sim.p90,'rgba(127,211,122,.95)','rgba(110,220,110,.9)',1.5,k,[3,3]);
        band(sim.p10,'rgba(255,128,128,.95)','rgba(255,110,110,.9)',1.5,k,[3,3]);
        band(sim.p50,'#FFC65A','rgba(255,190,70,1)',2.6,k);
        if(lk>=1){g.font='700 12px ui-monospace,monospace';g.textAlign='right';g.textBaseline='bottom';g.fillStyle='#FFC65A';g.shadowColor='#FFC65A';g.shadowBlur=10;
          g.fillText(fU(at(sim.p50,Wn-1),0),cssW-pad.r,Yv(at(sim.p50,Wn-1))-6);g.shadowBlur=0;g.textAlign='left';}}
      const prog=Math.min(1,t/(T1+T2));bar.style.transform=`scaleX(${0.08+prog*0.8})`;
      if(phase===0){rows[0].classList.add('on');phase=1;}
      if(phase===1&&t>=T1*0.75){rows[0].className='ok';rows[1].classList.add('on');phase=2;}
      if(phase===2&&t>=T1+T2){rows[1].className='ok';rows[2].classList.add('on');phase=3;
        num.textContent=PATHS.toLocaleString();
        // now the heavy, synchronous run — the finished frame holds still while it works
        addEventListener('gm:proj',function f(){removeEventListener('gm:proj',f);if(ran!==id)return;
          const E=window._spEnd;rows[2].querySelector('em').textContent=E?fN(E.th,E.th<100?1:0)+' TH':'done';rows[2].className='ok';
          bar.style.transform='scaleX(1)';setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),500);},380);});
        setTimeout(()=>{if(el.isConnected){el.classList.add('out');setTimeout(()=>el.remove(),500);}},20000);   // never strand it
        setTimeout(runSetupProjection,60);return;}
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  addEventListener('gm:proj',()=>{['fxDay','fxMo','fxYr'].forEach(id=>{const e=$f(id);if(e)e.classList.remove('fx-busy');});render();});

  // ---- hover / touch readout: crosshair, a dot on each headline line, and their prices ----
  let geo=null;
  function hover(ev){
    const tip=$f('fxTip'),xh=$f('fxX'),cv=$f('fxCanvas');if(!tip||!xh)return;
    if(!ev||!geo||!sim){tip.hidden=xh.hidden=true;return;}
    const r=cv.getBoundingClientRect(),px=ev.clientX-r.left;
    const {X,Y,Wn,pad,pw,cssW}=geo;
    const w=Math.round((px-pad.l)/pw*Wn)-1;
    if(px<pad.l-4||px>pad.l+pw+4){tip.hidden=xh.hidden=true;return;}
    const today=w<0, i=Math.max(0,Math.min(Wn-1,w)), x=today?geo.x0:X(i);
    const v=today?{hi:sim.bp,mid:sim.bp,lo:sim.bp}:{hi:sim.p90[i],mid:sim.p50[i],lo:sim.p10[i]};
    xh.hidden=false;xh.style.left=x+'px';
    for(const k of ['hi','mid','lo'])xh.querySelector('.'+k).style.top=Y(v[k])+'px';
    const date=today?'Today':new Date(sim.now+(i+1)*WEEK).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    tip.innerHTML=today?`<b>${date}</b><div class="r mid"><span>BTC</span>${fU(sim.bp,0)}</div>`:
      `<b>${date}</b><div class="r hi"><span>High</span>${fU(v.hi,0)}</div><div class="r mid"><span>Avg</span>${fU(v.mid,0)}</div><div class="r lo"><span>Low</span>${fU(v.lo,0)}</div>`;
    tip.hidden=false;
    const tw=tip.offsetWidth, left=x+12+tw>cssW?x-12-tw:x+12;
    tip.style.left=Math.max(0,left)+'px';tip.style.top=Math.max(0,Math.min(Y(v.mid)-tip.offsetHeight/2,(cv.clientHeight||300)-tip.offsetHeight))+'px';
  }
  function bindHover(){
    const cv=$f('fxCanvas');if(!cv||cv.dataset.hv)return;cv.dataset.hv='1';
    ['pointermove','pointerdown'].forEach(e=>cv.addEventListener(e,hover));
    cv.addEventListener('pointerleave',()=>hover(null));
  }

  function draw(Wn,still){
    bindHover();
    const cv=$f('fxCanvas');if(!cv||!sim)return;
    const W=sim.W, all=sim.all, p10=sim.p10, p50=sim.p50, p90=sim.p90, lane=sim.lane;
    // Scale to the bands (always fully visible); individual paths may run off the edges.
    let lo=sim.bp,hi=sim.bp;
    for(let w=0;w<Wn;w++){if(p10[w]<lo)lo=p10[w];if(p90[w]>hi)hi=p90[w];}
    lo*=0.7;hi*=1.6;
    const cssW=cv.clientWidth||600, cssH=Math.round(Math.min(380,Math.max(240,cssW*0.5)));
    const dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=cssW*dpr;cv.height=cssH*dpr;cv.style.height=cssH+'px';
    const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
    const pad={l:8,r:58,t:10,b:24},pw=cssW-pad.l-pad.r,ph=cssH-pad.t-pad.b;
    const X=w=>pad.l+(w+1)/Wn*pw, L0=Math.log(lo),L1=Math.log(hi);
    const Y=v=>pad.t+(1-(Math.log(Math.min(hi,Math.max(lo,v)))-L0)/(L1-L0))*ph;
    const x0=pad.l, y0=Y(sim.bp);
    const short=v=>v>=1e6?'$'+(v/1e6).toFixed(1)+'M':'$'+Math.round(v/1e3)+'K';
    const endYs=[p10,p50,p90].map(a=>Y(a[Wn-1]));
    function axes(){
      g.font='11px ui-monospace,monospace';g.textBaseline='middle';
      for(let e=Math.floor(Math.log10(lo));e<=Math.ceil(Math.log10(hi));e++)for(const m of [1,2,5]){const v=m*Math.pow(10,e);if(v<lo||v>hi)continue;const y=Y(v);
        g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=1;g.beginPath();g.moveTo(pad.l,y);g.lineTo(pad.l+pw,y);g.stroke();
        if(endYs.some(z=>Math.abs(z-y)<13))continue;
        g.fillStyle='rgba(235,226,210,.38)';g.fillText(short(v),pad.l+pw+6,y);}
      g.textBaseline='alphabetic';g.fillStyle='rgba(235,226,210,.38)';
      const now$=fU(sim.bp,0);g.font='600 11px ui-monospace,monospace';const nowW=g.measureText(now$).width;g.font='11px ui-monospace,monospace';
      const step=yrs>5?2:1;for(let k=step;k<=yrs;k+=step){const x=Math.min(X(k*52-1)-12,pad.l+pw-30);if(x<pad.l+nowW+8)continue;g.fillText('Yr '+k,x,cssH-6);}
      g.fillStyle='#FFC65A';g.font='600 11px ui-monospace,monospace';g.fillText(now$,pad.l,cssH-6);   // today's price, where the paths start
    }
    // glow: a soft halo in the line's own colour (only on the few headline lines — 260 paths would crawl)
    function line(arr,stroke,width,dash,upto,glow){g.strokeStyle=stroke;g.lineWidth=width;g.setLineDash(dash||[]);
      if(glow){g.shadowColor=glow;g.shadowBlur=width*5;}
      g.beginPath();g.moveTo(x0,y0);
      for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(arr[w]));g.stroke();g.setLineDash([]);g.shadowBlur=0;}
    geo={X,Y,Wn,pad,pw,cssW,x0,y0};hover(null);
    const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const DUR=(reduce||still)?0:1800, t0=performance.now();
    if(anim)cancelAnimationFrame(anim);
    function frame(now){
      const k=DUR?Math.min(1,(now-t0)/DUR):1, ease=1-Math.pow(1-k,3), upto=Math.max(0,Math.min(Wn-1,Math.floor(ease*(Wn-1))));
      g.clearRect(0,0,cssW,cssH);axes();
      g.fillStyle='rgba(245,166,35,.10)';g.beginPath();g.moveTo(x0,y0);
      for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(p90[w]));for(let w=upto;w>=0;w--)g.lineTo(X(w),Y(p10[w]));g.lineTo(x0,y0);g.fill();
      g.lineWidth=1;
      for(let p=0;p<SAMPLE;p++){
        const up=all[p*W+Wn-1]>=p50[Wn-1];
        g.strokeStyle=up?'rgba(255,198,90,.085)':'rgba(255,120,80,.07)';
        g.beginPath();g.moveTo(x0,y0);for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(all[p*W+w]));g.stroke();
      }
      line(lane,'rgba(235,226,210,.55)',1.2,[4,4],upto);
      line(p10,'rgba(255,128,128,.95)',1.6,[2,3],upto,'rgba(255,110,110,.8)');
      line(p90,'rgba(127,211,122,.95)',1.6,[2,3],upto,'rgba(110,220,110,.8)');
      line(p50,'#FFC65A',2.6,null,upto,'rgba(255,190,70,.95)');
      g.shadowColor='rgba(255,190,70,.95)';g.shadowBlur=14;g.fillStyle='#FFC65A';
      g.beginPath();g.arc(X(upto),Y(p50[upto]),4,0,7);g.fill();g.beginPath();g.arc(x0,y0,3.5,0,7);g.fill();g.shadowBlur=0;
      if(k>=1){g.font='600 11px ui-monospace,monospace';g.textBaseline='middle';
        [[p90,'#7fd37a'],[p50,'#FFC65A'],[p10,'#ff8080']].forEach(([a,c])=>{g.fillStyle=c;g.fillText(short(a[Wn-1]),pad.l+pw+6,Math.max(pad.t+6,Math.min(cssH-pad.b,Y(a[Wn-1]))));});
        anim=null;return;}
      anim=requestAnimationFrame(frame);
    }
    anim=requestAnimationFrame(frame);
  }

  function show(){
    const host=$f('spFuturesHost');if(!host||!host.offsetParent)return;
    shell();
    if(sim){project();return;}
    if(building)return;
    if(!S.loaded||!(S.btcPrice>0)){setTimeout(show,700);return;}
    building=true;$f('fxWhen').textContent='Simulating '+PATHS.toLocaleString()+' futures…';
    ensureRainbowFit(()=>{
      if(!_rbFit||!_rainbowData||_rainbowData.length<100){building=false;$f('fxWhen').textContent='Couldn\'t load Bitcoin\'s price history, which the futures are built on.';return;}
      setTimeout(()=>{try{sim=simulate();project();}catch(e){console.error('[futures]',e);$f('fxWhen').textContent='Something went wrong simulating the futures.';}finally{building=false;}},30);
    });
  }
  // Re-render when the Projection opens (however it's reached) and when the farm changes.
  const orig=window.openSetupProjection;
  if(typeof orig==='function')window.openSetupProjection=function(){const r=orig.apply(this,arguments);setTimeout(show,60);return r;};
  // Payout changes re-run the projection (debounced while typing).
  let pt=null;const payoutChanged=()=>{clearTimeout(pt);pt=setTimeout(project,350);};
  ['spPayoutVal','spPayoutType'].forEach(id=>{const e=$f(id);if(e){e.addEventListener('input',payoutChanged);e.addEventListener('change',payoutChanged);}});
  // Capital Planner round-trip: "Change the amount" / "Plan it in the Capital Planner" on this page
  // opens the planner form; once it calculates, come straight back here as My Plan.
  const origGoto=window.gotoPlannerTab;
  if(typeof origGoto==='function')window.gotoPlannerTab=function(){const r=origGoto.apply(this,arguments);
    if(window._spReturnAfterPlan){window._spReturnAfterPlan=false;setTimeout(()=>openSetupProjection('planner'),80);}return r;};
  // Closing the planner form without calculating cancels the round-trip.
  const origClose=window.closePlannerIntro;
  if(typeof origClose==='function')window.closePlannerIntro=function(){window._spReturnAfterPlan=false;return origClose.apply(this,arguments);};
  // Phones fire resize on every scroll (address bar), so only a WIDTH change redraws — and without replaying the animation.
  let rz=null,lastW=innerWidth;addEventListener('resize',()=>{if(innerWidth===lastW)return;lastW=innerWidth;clearTimeout(rz);rz=setTimeout(()=>{if(sim&&$f('spFuturesHost')&&$f('spFuturesHost').offsetParent)draw(yrs*52,true);},200);});
  setTimeout(show,0);   // deep link (/projection) may have opened the panel before this file loaded
})();
