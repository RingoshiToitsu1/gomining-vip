/* GMT Optimizer — live GoMining rates for any site.
   ===========================================================================
   Reads https://gmt-optimizer.com/api/rates.json (updated weekly by scripts/set-rates.js)
   and fills elements in the host page:

     <span data-gomining-rate>21.7%</span>                     staking APR -> "21.7%"
     <span data-gomining-rate="soloDiscount"></span>           any field of rates.json
     <span data-gomining-rate="stakingAprChange"></span>       "▼ 0.98" vs the previous update
     <span data-gomining-rate="updated"></span>                "Oct 7, 2026"
     <span data-gomining-rate data-format="number"></span>     "21.7" (no % sign)
     <div data-gomining-apr-badge></div>                       ready-made pill: label, rate, change, date

     <script src="https://gmt-optimizer.com/assets/rates.js" async></script>

   Whatever the element already contains stays if the feed can't be reached, so put the
   current number in as the fallback. For custom use: window.GoMiningRates is a Promise of
   the parsed feed, and a `gomining-rates` event fires on document with it as detail.
   The badge picks up the host's font; colour it with --gmr-accent / --gmr-bg / --gmr-line.
*/
(function () {
  'use strict';
  if (window.GoMiningRates) return;                       // loaded twice — the first copy handles it
  var FEED = 'https://gmt-optimizer.com/api/rates.json';
  var PCT = { stakingApr: 1, stakingAprPrevious: 1, soloDiscount: 1, greedyGrowthWeekly: 1, clickStreak: 1 };

  function trim(n) { return String(Math.round(n * 10000) / 10000); }
  function dateLabel(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function change(r) {
    if (r.stakingAprPrevious == null) return '';
    var d = Math.round((r.stakingApr - r.stakingAprPrevious) * 100) / 100;
    return d === 0 ? 'unchanged' : (d > 0 ? '▲ ' : '▼ ') + trim(Math.abs(d));
  }
  function value(r, field, format) {
    if (field === 'stakingAprChange') return change(r);
    if (field === 'updated') return dateLabel(r.updated);
    var v = r[field];
    if (typeof v !== 'number') return v == null ? '' : String(v);
    return trim(v) + (PCT[field] && format !== 'number' ? '%' : '');
  }

  var CSS = ':host{display:inline-block;font:inherit;color:inherit}' +
    '.b{display:inline-flex;align-items:center;flex-wrap:wrap;gap:.35em .6em;padding:.45em .95em;border-radius:999px;' +
    'background:var(--gmr-bg,rgba(246,181,58,.08));border:1px solid var(--gmr-line,rgba(246,181,58,.35));line-height:1.2}' +
    '.l{opacity:.75;font-size:.82em;letter-spacing:.06em;text-transform:uppercase}' +
    '.v{font-weight:700;font-size:1.1em;color:var(--gmr-accent,#f6b53a)}' +
    '.c{font-size:.8em;opacity:.8}.c.up{color:#4fd18b;opacity:1}.c.dn{color:#ff8f3f;opacity:1}' +
    '.d{font-size:.75em;opacity:.6}';
  function badge(el, r) {
    var root = el.attachShadow ? (el.shadowRoot || el.attachShadow({ mode: 'open' })) : el;
    var ch = change(r);
    var dir = ch.charAt(0) === '▲' ? 'up' : ch.charAt(0) === '▼' ? 'dn' : '';
    root.innerHTML = '<style>' + CSS + '</style><span class="b">' +
      '<span class="l">' + (el.getAttribute('data-label') || 'GoMining staking APR') + '</span>' +
      '<span class="v">' + value(r, 'stakingApr') + '</span>' +
      (ch && ch !== 'unchanged' ? '<span class="c ' + dir + '">' + ch + '</span>' : '') +
      '<span class="d">updated ' + dateLabel(r.updated) + '</span></span>';
  }

  function fill(r) {
    var els = document.querySelectorAll('[data-gomining-rate]');
    for (var i = 0; i < els.length; i++) {
      var v = value(r, els[i].getAttribute('data-gomining-rate') || 'stakingApr', els[i].getAttribute('data-format'));
      if (v !== '') els[i].textContent = v;
    }
    var bs = document.querySelectorAll('[data-gomining-apr-badge]');
    for (var j = 0; j < bs.length; j++) badge(bs[j], r);
  }

  window.GoMiningRates = fetch(FEED).then(function (res) {
    if (!res.ok) throw new Error('rates feed ' + res.status);
    return res.json();
  }).then(function (r) {
    var go = function () {
      fill(r);
      try { document.dispatchEvent(new CustomEvent('gomining-rates', { detail: r })); } catch (e) {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    return r;
  });
  window.GoMiningRates.catch(function () {});             // fallback text stays; callers can still .catch
})();
