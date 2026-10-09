/* GMT Optimizer — embed loader for other sites.
   ===========================================================================
   Drop this on any page:

     <div data-gmt-optimizer data-th="100"></div>
     <script src="https://gmt-optimizer.com/assets/embed.js" async></script>

   Every [data-gmt-optimizer] element gets an iframe of /embed, sized to its content (the
   frame posts its height; this script applies it). Options, all optional, as data-*:
     data-th, data-wth, data-gmt, data-apr   prefill the calculator
     data-streak="0"                         untick the daily click streak
     data-bg="transparent"                   no page background around the card
     data-src="my-funnel"                    utm_source on outbound links (default: host domain)
     data-credit="off"                       hide the "by GMT Optimizer" line under the frame

   CTA clicks inside the frame are re-dispatched on the host element as a
   `gmt-optimizer:cta` CustomEvent (detail.cta = "claim" | "console" | "brand").
*/
(function () {
  'use strict';
  var ORIGIN = 'https://gmt-optimizer.com';
  var OPTS = ['th', 'wth', 'gmt', 'apr', 'streak', 'bg', 'src'];
  var frames = [];

  function mount(el) {
    if (el.getAttribute('data-gmt-mounted')) return;
    el.setAttribute('data-gmt-mounted', '1');
    var q = [];
    OPTS.forEach(function (k) {
      var v = el.getAttribute('data-' + k);
      if (v != null && v !== '') q.push(k + '=' + encodeURIComponent(v));
    });
    var f = document.createElement('iframe');
    f.src = ORIGIN + '/embed/' + (q.length ? '?' + q.join('&') : '');
    f.title = 'GoMining ROI calculator by GMT Optimizer';
    f.loading = 'lazy';
    f.setAttribute('allow', 'clipboard-write');
    // A sensible first height so the page doesn't jump much before the frame reports its own.
    f.style.cssText = 'display:block;width:100%;height:640px;border:0;border-radius:22px;overflow:hidden;background:transparent';
    el.appendChild(f);
    frames.push({ el: el, f: f });

    // A real link in the host page's own HTML — the frame's links don't count as the host's.
    if (el.getAttribute('data-credit') !== 'off') {
      var p = document.createElement('p');
      p.style.cssText = 'margin:.5rem 0 0;font:12px/1.4 system-ui,sans-serif;opacity:.7;text-align:right';
      var a = document.createElement('a');
      a.href = ORIGIN + '/gomining-roi-calculator';
      a.textContent = 'GoMining ROI calculator';
      a.style.color = 'inherit';
      p.appendChild(a);
      p.appendChild(document.createTextNode(' by GMT Optimizer'));
      el.appendChild(p);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data.type !== 'string') return;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].f.contentWindow !== e.source) continue;
      if (e.data.type === 'gmt-optimizer:height' && e.data.height > 0) {
        frames[i].f.style.height = Math.min(4000, e.data.height) + 'px';
      } else if (e.data.type === 'gmt-optimizer:cta') {
        try { frames[i].el.dispatchEvent(new CustomEvent('gmt-optimizer:cta', { bubbles: true, detail: { cta: e.data.cta } })); } catch (err) {}
      }
    }
  });

  function scan() {
    var els = document.querySelectorAll('[data-gmt-optimizer]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
})();
