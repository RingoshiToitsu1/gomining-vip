/* Console page scripts that used to sit inline at the end of console/index.html. Loaded with defer after the
   other console scripts, so they run in the same order as before, but no longer hold up the first paint. */
/* console: header-nav view switching + route new users / deep-linked views */
/* Header nav drives the (hidden) tab buttons so Capital Planner keeps its own view.
   Global so the header links' inline onclick can reach it. */
function consoleView(tab){var b=document.querySelector('[data-tab="'+tab+'"]');if(b)b.click();document.querySelectorAll('.nav-links a[data-view]').forEach(function(a){a.classList.toggle('nav-active',a.dataset.view===tab);});try{window.scrollTo({top:0,behavior:'smooth'})}catch(e){}}
(function(){try{
  var qs=location.search;
  if(/[?&]new=1/.test(qs)){ if(typeof obNewUser==='function') obNewUser();
    try{history.replaceState({},'',location.pathname+location.hash);}catch(e){} return; }
  /* ?setup=1 is handled by initOnboarding() in app.js, which runs before this. */
  if(/[?&]setup=1/.test(qs)) return;
  var view=(qs.match(/[?&]view=([a-z]+)/)||[])[1];
  if(view==='planner'){ if(typeof consoleView==='function') consoleView('tab-planner'); }
  else if(view==='planner-projection'){ if(typeof consoleView==='function') consoleView('tab-planner'); if(typeof openSetupProjection==='function') openSetupProjection('planner'); }
  else if(view==='odds'){ if(typeof consoleView==='function') consoleView('tab-odds'); }
  else if(view==='projection'){ if(typeof openSetupProjection==='function') openSetupProjection(); }
  else if(view==='edit'){ if(typeof openEditSetup==='function') openEditSetup(); }
  else if(view==='rainbow'){ if(typeof openRainbow==='function') openRainbow(); }
}catch(e){}
  try{document.querySelectorAll('.hero-card').forEach(function(el){
    el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();
      el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');});
  });}catch(e){}})();
;
(function(){var b=document.getElementById("toTop");if(!b)return;function o(){b.classList.toggle("show",(window.scrollY||document.documentElement.scrollTop)>320);}window.addEventListener("scroll",o,{passive:true});o();b.onclick=function(){window.scrollTo({top:0,behavior:"smooth"});};})();
;
/* Live quotron for the ticker — real network data (same sources + sats/TH/day
   formula as the tool), mirrors the landing page. Targets the [data-tk] spans. */
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
      var res=await Promise.all([btcPrice(),gmtPrice(),
        j('https://mempool.space/api/v1/mining/hashrate/3d').catch(function(){return null;})]);
      var btc=res[0],gmt=res[1],h=res[2];
      if(btc>0)set('btc','$'+Math.round(btc).toLocaleString());
      if(gmt>0)set('gmt','$'+gmt.toFixed(3));
      if(h&&h.currentDifficulty){
        var diff=h.currentDifficulty;
        set('diff',(diff/1e12).toFixed(2)+' T');
        var sats=((1e12*86400*BS)/(diff*Math.pow(2,32)))*1e8;
        set('sats',Math.round(sats));
        if(btc>0)set('hp','$'+((sats/1e8)*1000*btc).toFixed(1)+' / PH/day');
      }
    }catch(e){}
  })();
})();
;
/* Magnetic hover on every clickable button — same pull/lift math as the landing
   page's data-magnetic. Delegated so dynamically-rendered buttons are covered too. */
(function(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var SEL='button, a.nav-cta, a.btn, a.lp-cta, a.ri-btn';
  var cur=null;
  function clear(){ if(cur){cur.style.transform='';cur=null;} }
  document.addEventListener('pointermove',function(e){
    var b=(e.target&&e.target.closest)?e.target.closest(SEL):null;
    if(b!==cur)clear();
    if(!b)return;
    cur=b;
    var r=b.getBoundingClientRect();
    b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.16)+'px,'+((e.clientY-r.top-r.height/2)*.26-2)+'px)';
  },{passive:true});
  document.addEventListener('pointerleave',clear,{passive:true});
  window.addEventListener('blur',clear);
})();
;
/* Footer donation copy-to-clipboard (delegated — RINGO5 + wallet addresses). */
document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-copy]');if(!el)return;try{navigator.clipboard&&navigator.clipboard.writeText(el.getAttribute('data-copy'));}catch(_){}el.classList.add('copied');setTimeout(function(){el.classList.remove('copied');},1200);});
;
(function(){
  var el=document.getElementById('ytPromo'); if(!el) return;
  var key='ytPromoHidden', vid=el.getAttribute('data-vid'), hidden=null;
  try{ hidden=localStorage.getItem(key); }catch(e){}
  if(hidden!==vid) el.hidden=false;
  el.querySelector('.ytp-x').addEventListener('click',function(){
    el.hidden=true; try{ localStorage.setItem(key,vid); }catch(e){}
  });
})();
