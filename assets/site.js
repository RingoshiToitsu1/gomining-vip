/* GMT-Optimizer — content-page extras.
   The header and footer come from the global chrome (assets/site-chrome.js, linked in each page's <head>).
   This file only adds the back-to-top button and loads the co-pilot.
   data-chrome="bar" (the standalone tools, e.g. /quote, /statement) still means: no extras that would
   fight the tool's own layout or print view. */
(function(){
  var me=document.currentScript;
  var BAR=!!(me&&me.getAttribute('data-chrome')==='bar');
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(BAR) return;

  /* ---- back to top ---- */
  var top=document.createElement('button');
  top.id='toTop';top.type='button';top.setAttribute('aria-label','Back to top');top.innerHTML='&uarr;';
  document.body.appendChild(top);
  top.onclick=function(){scrollTo({top:0,behavior:reduce?'auto':'smooth'});};
  addEventListener('scroll',function(){top.classList.toggle('show',(scrollY||document.documentElement.scrollTop)>320);},{passive:true});
})();

// Ask-Ringo co-pilot (assets/copilot.js): loaded here so every page that uses this script gets it.
;(function(){if(window.__gmCopilot||document.getElementById("gmCopilotJs"))return;var s=document.createElement("script");s.id="gmCopilotJs";s.src="/assets/copilot.js?v=6";s.defer=true;(document.head||document.documentElement).appendChild(s);})();
