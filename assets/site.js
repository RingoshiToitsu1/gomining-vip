/* GMT Optimizer — shared site chrome for content pages.
   Injects the galaxy backdrop, fixed nav, footer, and back-to-top, then runs
   the galaxy + nav-shrink. Content pages only need content.css + this file. */
(function(){
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LOGO='/gmt-optimizer-logo.svg?v=2';

  /* ---- backdrop ---- */
  var bg=document.createElement('div');
  bg.innerHTML='<div class="world" aria-hidden="true"><span class="orb orb-1"></span><span class="orb orb-2"></span><span class="orb orb-3"></span>'+
    '<div class="grid-floor"></div><span class="beam beam-1"></span><span class="beam beam-2"></span><span class="beam beam-3"></span><canvas id="stars"></canvas></div><div class="vignette" aria-hidden="true"></div>';
  while(bg.firstChild) document.body.insertBefore(bg.firstChild, document.body.firstChild);

  /* ---- nav ---- */
  var nav=document.createElement('nav');
  nav.id='nav';
  nav.innerHTML='<a href="/" class="brand"><img src="'+LOGO+'" alt="">GMT Optimizer<span class="v">v2</span></a>'+
    '<div class="nav-links"><a href="/">Home</a><a href="/console">Console</a><a href="/planner">Planner</a><a href="/bitcoin">Charts</a></div>'+
    '<a href="/console" class="nav-cta">Launch Console</a>';
  document.body.insertBefore(nav, document.body.firstChild);

  /* ---- utility ticker / quotron (matches the landing) ---- */
  var util=document.createElement('div');
  util.className='util';util.setAttribute('aria-hidden','true');
  util.innerHTML='<div class="ticker">'+
    '<span><span class="li">◉ NETWORK LIVE</span></span>'+
    '<span>BTC <b data-tk="btc">$64,180</b></span>'+
    '<span>DIFFICULTY <b data-tk="diff">121.51 T</b></span>'+
    '<span>HASHPRICE <b data-tk="hp">$46.2 / PH/day</b></span>'+
    '<span>GMT <b data-tk="gmt">$0.285</b></span>'+
    '<span>NEXT HALVING <b>2028</b></span>'+
    '<span class="up">▲ SATS/TH/DAY <b data-tk="sats" style="color:inherit;font-weight:400">412</b></span>'+
    '<span><span class="li">◉ NETWORK LIVE</span></span>'+
    '<span>BTC <b data-tk="btc">$64,180</b></span>'+
    '<span>DIFFICULTY <b data-tk="diff">121.51 T</b></span>'+
    '<span>HASHPRICE <b data-tk="hp">$46.2 / PH/day</b></span>'+
    '<span>GMT <b data-tk="gmt">$0.285</b></span>'+
    '</div>';
  document.body.insertBefore(util, document.body.firstChild);
  (function(){
    var BS=3.125;
    function set(k,v){document.querySelectorAll('[data-tk="'+k+'"]').forEach(function(el){el.textContent=v;});}
    function j(u){return fetch(u).then(function(r){if(!r.ok)throw 0;return r.json();});}
    async function btcPrice(){
      try{var r=await j('https://api.coinpaprika.com/v1/tickers/btc-bitcoin');var p=+r.quotes.USD.price;if(p>0)return p;}catch(e){}
      try{var r=await j('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');var p=+r.bitcoin.usd;if(p>0)return p;}catch(e){}
      try{var r=await j('https://mempool.space/api/v1/prices');var p=+r.USD;if(p>0)return p;}catch(e){}
      return 0;
    }
    async function gmtPrice(){
      try{var r=await j('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token');var p=+r.quotes.USD.price;if(p>0)return p;}catch(e){}
      try{var r=await j('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd');var p=+r['gmt-token'].usd;if(p>0)return p;}catch(e){}
      return 0;
    }
    (async function(){
      try{
        var res=await Promise.all([btcPrice(),gmtPrice(),j('https://mempool.space/api/v1/mining/hashrate/3d').catch(function(){return null;})]);
        var btc=res[0],gmt=res[1],h=res[2];
        if(btc>0)set('btc','$'+Math.round(btc).toLocaleString());
        if(gmt>0)set('gmt','$'+gmt.toFixed(3));
        if(h&&h.currentDifficulty){
          var diff=h.currentDifficulty;set('diff',(diff/1e12).toFixed(2)+' T');
          var sats=((1e12*86400*BS)/(diff*Math.pow(2,32)))*1e8;set('sats',Math.round(sats));
          if(btc>0)set('hp','$'+((sats/1e8)*1000*btc).toFixed(1)+' / PH/day');
        }
      }catch(e){}
    })();
  })();

  /* ---- footer ---- */
  var foot=document.createElement('footer');
  foot.className='site-foot';
  foot.innerHTML='<div class="fwrap"><div class="fbrand"><a href="/" class="brand"><img src="'+LOGO+'" alt="">GMT Optimizer</a>'+
    '<p>The free, ad-free GoMining profit optimizer. Live network data, honest projections, no ads &mdash; ever.</p></div>'+
    '<div class="fcols">'+
      '<div><h4>Tool</h4><a href="/console">Console</a><a href="/planner">Capital Planner</a><a href="/projection">Growth Projection</a></div>'+
      '<div><h4>Learn</h4><a href="/how-gomining-works.html">How GoMining works</a><a href="/is-gomining-worth-it.html">Is it worth it?</a><a href="/gomining-roi-calculator.html">ROI calculator</a><a href="/gomining-discount-explained.html">Discount explained</a></div>'+
      '<div><h4>Legal</h4><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></div>'+
    '</div></div>'+
    '<div class="foot-donate">'+
      '<div class="fd-offer"><span class="fd-new">New to GoMining?</span> Use code <b class="fd-code" data-copy="RINGO5" role="button" tabindex="0" title="Click to copy">RINGO5</b> for +5% bonus TH &mdash; <a href="/claim">plus I&rsquo;ll fund your first TH&nbsp;&rarr;</a></div>'+
      '<div class="fd-tip">GMT Optimizer is free and ad-free forever. If it helps, consider donating:</div>'+
      '<div class="fd-addrs">'+
        '<button type="button" class="fd-addr" data-copy="bc1qwcwt8t3tekgctt6fkw24yrss4l9e0085m8unlh"><span class="fd-tag">BTC</span><span class="fd-val">bc1qwcwt8t3tekgctt6fkw24yrss4l9e0085m8unlh</span></button>'+
        '<button type="button" class="fd-addr" data-copy="0xc151cdCB14aac14096ae003793d3FfAb46881c99"><span class="fd-tag">GMT</span><span class="fd-val">0xc151cdCB14aac14096ae003793d3FfAb46881c99</span></button>'+
      '</div></div>'+
    '<div class="fbase">&copy; 2026 GMT Optimizer &middot; Independent community tool, not affiliated with GoMining. Informational only, not financial advice.</div>';
  document.body.appendChild(foot);

  /* ---- footer donation copy-to-clipboard (delegated) ---- */
  document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-copy]');if(!el)return;try{navigator.clipboard&&navigator.clipboard.writeText(el.getAttribute('data-copy'));}catch(_){}el.classList.add('copied');setTimeout(function(){el.classList.remove('copied');},1200);});

  /* ---- back to top ---- */
  var top=document.createElement('button');
  top.id='toTop';top.setAttribute('aria-label','Back to top');top.innerHTML='&uarr;';
  document.body.appendChild(top);
  top.onclick=function(){scrollTo({top:0,behavior:reduce?'auto':'smooth'});};

  /* ---- scroll: nav shrink + toTop ---- */
  addEventListener('scroll',function(){
    var y=scrollY||document.documentElement.scrollTop;
    nav.classList.toggle('shrunk',y>40);
    top.classList.toggle('show',y>320);
  },{passive:true});

  if(reduce)return;

  /* ---- cursor spotlight (sets --mx/--my for the ::after glow) ---- */
  document.querySelectorAll('.stat,.scenario,.cta,.claim-card').forEach(function(el){
    el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();
      el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');});
  });

  /* ---- magnetic hover on every clickable button (mirrors the landing page) ---- */
  (function(){
    var SEL='button, a.nav-cta, a.btn, a.ri-btn', cur=null;
    function clr(){ if(cur){cur.style.transform='';cur=null;} }
    document.addEventListener('pointermove',function(e){
      var b=(e.target&&e.target.closest)?e.target.closest(SEL):null;
      if(b!==cur)clr();
      if(!b)return;
      cur=b;var r=b.getBoundingClientRect();
      b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.16)+'px,'+((e.clientY-r.top-r.height/2)*.26-2)+'px)';
    },{passive:true});
    document.addEventListener('pointerleave',clr,{passive:true});
    addEventListener('blur',clr);
  })();

  /* ---- reveal-on-scroll (matches landing; flash-free — only pre-hides blocks below the fold) ---- */
  (function(){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.14,rootMargin:'0px 0px -6% 0px'});
    var vh=innerHeight||800,i=0;
    document.querySelectorAll('.content-wrap h2, .content-wrap .stats, .content-wrap .scenario, .content-wrap .formula, .content-wrap .cta, .content-wrap .faq, .content-wrap .related').forEach(function(el){
      if(el.getBoundingClientRect().top>vh*0.88){el.classList.add('reveal');if(i%3===1)el.classList.add('d1');else if(i%3===2)el.classList.add('d2');io.observe(el);i++;}
    });
  })();

  /* ---- spiral galaxy ---- */
  var cvs=document.getElementById('stars');if(!cvs)return;
  var ctx=cvs.getContext('2d');
  var W,H,dpr=Math.min(devicePixelRatio||1,2),gal=[],bg2=[],rot=0,ARMS=2,TURNS=1.45,maxR,cx0,cy0;
  function tint(t){return t<.28?'255,240,205':t<.62?'255,207,122':'245,166,35';}
  function build(){
    W=cvs.width=innerWidth*dpr;H=cvs.height=innerHeight*dpr;cvs.style.width=innerWidth+'px';cvs.style.height=innerHeight+'px';
    var narrow=innerWidth<900;cx0=W*(narrow?.5:.64);cy0=H*(narrow?.3:.4);maxR=Math.min(W,H)*(narrow?.7:.58);
    var n=Math.min(440,Math.round(innerWidth*.28));gal=[];
    for(var i=0;i<n;i++){var arm=i%ARMS,t=Math.pow(Math.random(),.62);
      gal.push({r:maxR*t+(Math.random()-.5)*maxR*.05,ang:arm*(6.2832/ARMS)+t*TURNS*6.2832+(Math.random()-.5)*(.42*(1-t*.5)),
        t:t,sz:(Math.random()*1.4+.5)*dpr,tw:Math.random()*6.28,tws:Math.random()*.05+.012,w:.85+.55*(1-t)});}
    var m=Math.min(90,Math.round(innerWidth/15));bg2=[];
    for(var k=0;k<m;k++)bg2.push({x:Math.random()*W,y:Math.random()*H,sz:(Math.random()*1.1+.3)*dpr,tw:Math.random()*6.28,tws:Math.random()*.03+.006});
  }
  build();addEventListener('resize',build);
  function draw(){
    ctx.clearRect(0,0,W,H);
    for(var k=0;k<bg2.length;k++){var s=bg2[k];s.tw+=s.tws;var o=(Math.sin(s.tw)*.5+.5)*.4;
      ctx.beginPath();ctx.arc(s.x,s.y,s.sz,0,6.28);ctx.fillStyle='rgba(255,225,175,'+o+')';ctx.fill();}
    ctx.globalCompositeOperation='lighter';
    var core=ctx.createRadialGradient(cx0,cy0,0,cx0,cy0,maxR*.34);
    core.addColorStop(0,'rgba(255,246,222,.85)');core.addColorStop(.18,'rgba(255,207,122,.45)');
    core.addColorStop(.5,'rgba(245,166,35,.12)');core.addColorStop(1,'rgba(245,166,35,0)');
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx0,cy0,maxR*.34,0,6.28);ctx.fill();
    rot+=.0014;
    for(var i=0;i<gal.length;i++){var p=gal[i];p.tw+=p.tws;var a=p.ang+rot*p.w;
      var x=cx0+Math.cos(a)*p.r,y=cy0+Math.sin(a)*p.r*.86,o=(Math.sin(p.tw)*.35+.65)*(1-p.t*.35);
      ctx.beginPath();ctx.arc(x,y,p.sz,0,6.28);ctx.fillStyle='rgba('+tint(p.t)+','+o+')';ctx.fill();}
    ctx.globalCompositeOperation='source-over';
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
