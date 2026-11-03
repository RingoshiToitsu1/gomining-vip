/* GMT Optimizer — "4,000 Bitcoin futures" inside the Growth Projection.
   BTC price paths that wander around the Power-Law fit the way BTC has since 2010: weekly
   deviations from the fit follow an AR(1) whose speed (phi) and shocks (bootstrapped residuals)
   are measured from history, reverting toward RB_PROJ_BAND ("Still cheap") — the same band the
   Growth Projection converges on and DIFF_G0 is paired with. Simulated once for 10 years; every
   shorter horizon is a prefix of the same paths, so switching 1/2/3/4/5/10 years is instant.
   The "typical" line (median path) then prices the user's farm AS IT IS TODAY (no reinvesting)
   at the end of the chosen horizon, using the app's own reward/fee/discount/staking functions.
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

  // The farm as it stands today, priced at BTC price P on date t. Mirrors calc(): reward floored at the
  // network break-even (rewardFloorBTC), halvings, difficulty grind, today's discount, 2.25% conversion,
  // plus staking on locked GMT at the decayed APR with GMT on the app's BTC ratio (GMT_BTC_RATIO).
  function farmAt(P,t){
    const i=inp(),m=calc(i), yrsOut=(t-Date.now())/(365.25*DAY);
    const rew=Math.max(dailyBTCperTH()*subsidyMultAt(t)*difficultyMultAt(t),rewardFloorBTC(P));
    const mineBTC=(rew*m.earnTH-fees(m.earnTH,m.bwth,P).t*(1-m.totD/100))*(1-CONVERSION_FEE);
    const gpT=GMT_BTC_RATIO*P, stakeUSD=i.gl*stakeAprAt(i.apr||0,yrsOut)/100/365*gpT;
    return{mineUSD:mineBTC*P,stakeUSD,dayUSD:mineBTC*P+stakeUSD,P,th:m.earnTH,rewSats:rew*1e8};
  }

  function shell(){
    const host=$f('spFuturesHost');if(!host||host.dataset.built)return;
    host.dataset.built='1';
    host.innerHTML=`
      <div class="fx-wrap">
        <div class="fx-head">
          <div><div class="fx-title">${PATHS.toLocaleString()} Bitcoin futures</div>
          <div class="fx-sub">Your farm as it is today, priced on the typical path</div></div>
          <div class="fx-chips" role="tablist" aria-label="Horizon">${YEARS.map(y=>`<button type="button" class="fx-chip${y===yrs?' on':''}" data-y="${y}" role="tab" aria-selected="${y===yrs}">${y}Y</button>`).join('')}</div>
        </div>
        <canvas id="fxCanvas" aria-label="Fan chart of simulated Bitcoin price paths"></canvas>
        <div class="fx-leg"><span><i class="lg-p"></i>One possible future</span><span><i class="lg-m"></i>Typical</span><span><i class="lg-b"></i>Bad / good (10th–90th)</span><span><i class="lg-c"></i>"Still cheap" band</span></div>
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
        <div class="fx-foot">A model, not a forecast: price swings are sampled from Bitcoin's own history and drift toward the same Power-Law band as the projection below. Assumes no reinvesting and today's discount. Not financial advice.</div>
      </div>`;
    host.querySelectorAll('.fx-chip').forEach(b=>b.addEventListener('click',()=>{yrs=+b.dataset.y;
      host.querySelectorAll('.fx-chip').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-selected',on);});render();}));
  }

  function render(){
    if(!sim)return;
    const Wn=yrs*52, wEnd=Wn-1, t=sim.now+Wn*WEEK, P=sim.p50[wEnd];
    draw(Wn);
    const f=farmAt(P,t), d=f.dayUSD, mo=d*30, yr=d*365, btc=v=>'(₿'+fmtBTCAmt(v/P)+')';
    const set=(id,v,fmt,cls)=>{const e=$f(id);animateMetric(e,v,fmt);e.className='hero-val '+(v>=0?cls:'red');};
    set('fxDay',d,fU,'green');set('fxMo',mo,v=>fU(v,0),'cyan');set('fxYr',yr,v=>fU(v,0),'purple');
    $f('fxDayBtc').textContent=btc(d);$f('fxMoBtc').textContent=btc(mo);$f('fxYrBtc').textContent=btc(yr);
    $f('fxDaySub').textContent=fU(f.mineUSD)+' mining + '+fU(f.stakeUSD)+' staking';
    $f('fxMoSub').textContent=fU(f.mineUSD*30,0)+' mining + '+fU(f.stakeUSD*30,0)+' staking';
    $f('fxYrSub').textContent=fN(f.th,f.th<100?1:0)+' TH · '+fN(f.rewSats,0)+' sats/TH/day';
    const date=new Date(t).toLocaleDateString('en-US',{month:'short',year:'numeric'});
    $f('fxWhen').innerHTML=`In <b>${yrs} year${yrs>1?'s':''}</b> (${date}) the typical future has BTC at <b class="g">${fU(P,0)}</b> <span>· bad ${fU(sim.p10[wEnd],0)} · good ${fU(sim.p90[wEnd],0)}</span>`;
  }

  function draw(Wn,still){
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
      const step=yrs>5?2:1;for(let k=step;k<=yrs;k+=step){const x=X(k*52-1);g.fillText('Yr '+k,Math.min(x-12,pad.l+pw-30),cssH-6);}
      g.fillText('Now',pad.l,cssH-6);
    }
    function line(arr,stroke,width,dash,upto){g.strokeStyle=stroke;g.lineWidth=width;g.setLineDash(dash||[]);g.beginPath();g.moveTo(x0,y0);
      for(let w=0;w<=upto;w++)g.lineTo(X(w),Y(arr[w]));g.stroke();g.setLineDash([]);}
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
      line(p10,'rgba(255,128,128,.9)',1.4,[2,3],upto);
      line(p90,'rgba(127,211,122,.9)',1.4,[2,3],upto);
      line(p50,'#FFC65A',2.4,null,upto);
      g.fillStyle='#FFC65A';g.beginPath();g.arc(X(upto),Y(p50[upto]),3.5,0,7);g.fill();g.beginPath();g.arc(x0,y0,3,0,7);g.fill();
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
    if(sim){render();return;}
    if(building)return;
    if(!S.loaded||!(S.btcPrice>0)){setTimeout(show,700);return;}
    building=true;$f('fxWhen').textContent='Simulating '+PATHS.toLocaleString()+' futures…';
    ensureRainbowFit(()=>{
      if(!_rbFit||!_rainbowData||_rainbowData.length<100){building=false;$f('fxWhen').textContent='Couldn\'t load Bitcoin\'s price history, which the futures are built on.';return;}
      setTimeout(()=>{try{sim=simulate();render();}catch(e){console.error('[futures]',e);$f('fxWhen').textContent='Something went wrong simulating the futures.';}finally{building=false;}},30);
    });
  }
  // Re-render when the Projection opens (however it's reached) and when the farm changes.
  const orig=window.openSetupProjection;
  if(typeof orig==='function')window.openSetupProjection=function(){const r=orig.apply(this,arguments);setTimeout(show,60);return r;};
  const origNew=window.newSetupProjection;
  if(typeof origNew==='function')window.newSetupProjection=function(){const r=origNew.apply(this,arguments);setTimeout(show,60);return r;};
  // Phones fire resize on every scroll (address bar), so only a WIDTH change redraws — and without replaying the animation.
  let rz=null,lastW=innerWidth;addEventListener('resize',()=>{if(innerWidth===lastW)return;lastW=innerWidth;clearTimeout(rz);rz=setTimeout(()=>{if(sim&&$f('spFuturesHost')&&$f('spFuturesHost').offsetParent)draw(yrs*52,true);},200);});
  setTimeout(show,0);   // deep link (/projection) may have opened the panel before this file loaded
})();
