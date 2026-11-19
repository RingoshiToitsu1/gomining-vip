/* GMT-Optimizer: live % changes for the figures strips (landing, console, quote). v3, 2026-11-18.
   Fills every element marked data-chg="btc|gmt|diff|sats" with an up/down change and its basis:
     btc, gmt   24-hour price change          (coinpaprika tickers, CoinGecko as fallback)
     diff       change at the last difficulty adjustment   (mempool.space difficulty-adjustment)
     sats       sats/TH/day change at that same adjustment: reward per TH moves inversely to
                difficulty (subsidy-based, the formula the calculator uses), so  1 / (1 + Δdiff) − 1
   If a source fails the element keeps whatever text it had (e.g. "live price"). Text and numbers follow the page
   language through GMT_UI (ES/FR/DE); English pages need nothing else. No dependencies. */
(function () {
  'use strict';
  if (window.GMTMarketChange) return;
  var UI = window.GMT_UI, LANG = (UI && UI.lang) || (document.documentElement.lang || 'en').slice(0, 2);
  var LOC = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[LANG] || 'en-US';
  var T = UI ? UI.t : function (s) { var a = arguments; return String(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); };
  function j(u) { return fetch(u).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  function firstNum(fns) {
    return fns.reduce(function (p, f) { return p.then(function (v) { return isFinite(v) ? v : f().then(Number).catch(function () { return NaN; }); }); }, Promise.resolve(NaN));
  }
  var pct24 = function (paprika, gecko) {
    return firstNum([
      function () { return j('https://api.coinpaprika.com/v1/tickers/' + paprika).then(function (r) { return r.quotes.USD.percent_change_24h; }); },
      function () { return j('https://api.coingecko.com/api/v3/simple/price?ids=' + gecko + '&vs_currencies=usd&include_24hr_change=true').then(function (r) { return r[gecko].usd_24h_change; }); }
    ]);
  };
  var data = window.GMTMarketChange = Promise.all([
    pct24('btc-bitcoin', 'bitcoin'),
    pct24('gomining-gomining-token', 'gmt-token'),
    j('https://mempool.space/api/v1/difficulty-adjustment').then(function (r) { return +r.previousRetarget; }).catch(function () { return NaN; })
  ]).then(function (v) {
    var d = v[2];
    return { btc: v[0], gmt: v[1], diff: d, sats: isFinite(d) ? (1 / (1 + d / 100) - 1) * 100 : NaN };
  });
  function fmt(x) {
    var n = new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(x));
    return (x > 0 ? '▲ ' : x < 0 ? '▼ ' : '') + n + (LANG === 'en' ? '%' : ' %');
  }
  function paint(ch) {
    document.querySelectorAll('[data-chg]').forEach(function (el) {
      var k = el.getAttribute('data-chg'), x = ch[k];
      if (!isFinite(x)) return;
      var basis = (k === 'diff' || k === 'sats') ? T('{0} · last adjustment', fmt(x)) : T('{0} · 24h', fmt(x));
      el.textContent = el.hasAttribute('data-chg-short') ? fmt(x) : basis;   // compact strips: the tooltip carries the basis
      // colour = good or bad for a miner: a higher difficulty is bad news, everything else is good when it rises
      var good = k === 'diff' ? x < 0 : x > 0, bad = k === 'diff' ? x > 0 : x < 0;
      el.classList.toggle('is-good', good); el.classList.toggle('is-bad', bad);
      var tip = TIPS[k] ? TIPS[k]() : T('Price change over the last 24 hours');
      if (el.hasAttribute('data-chg-short') && !TIPS[k]) tip = T('Price change over the last 24 hours');
      el.removeAttribute('title');
      el.setAttribute('data-tip', tip);
      el.tabIndex = 0;
      var sr = document.createElement('span'); sr.className = 'ui-visually-hidden'; sr.textContent = ' (' + tip + ')';
      el.appendChild(sr);
    });
  }
  // one floating tooltip for every change line: hover, keyboard focus or tap opens it; leaving, blur, scroll or Esc closes it
  var TIPS = {
    diff: function () { return T('Lower difficulty means more BTC per TH.') + ' ' + T('Change at the last difficulty adjustment (about every 2 weeks).'); },
    sats: function () { return T('What 1 TH earns per day. It rises when difficulty falls.') + ' ' + T('Change at the last difficulty adjustment (about every 2 weeks).'); }
  };
  var tipEl = null, tipFor = null, tipAt = 0, tipY = 0;
  function hideTip() { if (tipEl) tipEl.hidden = true; tipFor = null; }
  function showTip(el) {
    if (!tipEl) {
      tipEl = document.createElement('div'); tipEl.className = 'ui-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    if (tipFor !== el || tipEl.hidden) { tipAt = Date.now(); tipY = scrollY; }
    tipFor = el; tipEl.textContent = el.getAttribute('data-tip'); tipEl.hidden = false;
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)), y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function tgt(e) { return e.target && e.target.closest && e.target.closest('[data-chg][data-tip]'); }
  document.addEventListener('mouseover', function (e) { var t = tgt(e); if (t && t !== tipFor) showTip(t); else if (!t && tipFor && e.pointerType !== 'touch') hideTip(); });
  document.addEventListener('focusin', function (e) { var t = tgt(e); if (t) showTip(t); });
  document.addEventListener('focusout', function (e) { if (tgt(e)) hideTip(); });
  // a tap fires hover + focus (which open it) and then click: only a later, separate click closes it
  document.addEventListener('click', function (e) { var t = tgt(e); if (t) { t === tipFor && !tipEl.hidden && Date.now() - tipAt > 500 ? hideTip() : showTip(t); } else hideTip(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
  // close on a real scroll only: focusing the line on a phone nudges the page a few pixels
  addEventListener('scroll', function () { if (tipFor && Math.abs(scrollY - tipY) > 24) hideTip(); }, { passive: true });
  function go() { data.then(paint); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  window.GMTMarketChangeRepaint = go;   // pages that build their strip later can call this
})();
