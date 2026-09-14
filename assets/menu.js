/* GMT Optimizer — site menu (hamburger + slide-out drawer), shared by every page.
   =========================================================================
   One list of pages, one component. Each page keeps its own header (the landing #nav,
   the content-page #nav injected by site.js, the console .header-inner, and the plain
   .top bar on /statement and /quote); this script finds whichever one is there, hides
   its inline links, and adds a hamburger that opens the full site map.

   Styles are injected from here so a page only needs the one <script> tag.
   Add a new page to MENU below and it appears everywhere at once.

   On /console, items that point at a console view run that view's function in place
   instead of reloading the page (the same calls the old inline nav made).
*/
(function () {
  'use strict';
  if (window.__gmMenu) return;
  window.__gmMenu = true;

  const MENU = [
    { h: 'Tools', items: [
      { t: 'Console', d: 'Your farm\'s live profit and loss', href: '/console', run: ['consoleView', 'tab-current'] },
      { t: 'Capital Planner', d: 'The best split for new capital', href: '/console?view=planner', run: ['consoleView', 'tab-planner'] },
      { t: 'Growth Projection', d: 'Your farm, years ahead', href: '/console?view=projection', run: ['openSetupProjection'] },
      { t: 'Edit Setup', d: 'Miners, GMT and discounts', href: '/console?view=edit', run: ['openEditSetup'] },
      { t: 'Marketplace Checker', d: 'Is that miner a good deal?', href: '/gomining-marketplace-checker', badge: 'New' },
      { t: 'Quote a Setup', d: 'Price a farm from zero', href: '/quote' },
      { t: 'Income Statement', d: 'Turn a GoMining CSV into a statement', href: '/statement', badge: 'New' },
      { t: 'ROI Calculator', d: 'What a setup earns today', href: '/gomining-roi-calculator' }
    ]},
    { h: 'Charts', items: [
      { t: 'Bitcoin', href: '/console?chart=bitcoin', run: ['openBtcChart'] },
      { t: 'GoMining Token', href: '/console?chart=gmt', run: ['openGmtChart'] },
      { t: 'Rainbow Chart', href: '/console?view=rainbow', run: ['openRainbow'] }
    ], compact: true },
    { h: 'Guides', items: [
      { t: 'How GoMining works', href: '/how-gomining-works' },
      { t: 'Is GoMining worth it?', href: '/is-gomining-worth-it' },
      { t: 'Worth it right now', href: '/gomining-worth-it-now' },
      { t: 'The GMT discount, explained', href: '/gomining-discount-explained' },
      { t: 'Promo code RINGO5', href: '/gomining-promo-code' }
    ], compact: true },
    { h: 'Earnings by size', chips: [1, 5, 10, 25, 50, 100, 250, 500].map(n => ({ t: n + ' TH', href: '/gomining-' + n + '-th-roi' })) },
    { h: 'Profit by BTC price', chips: [75, 100, 150, 200, 250].map(n => ({ t: '$' + n + 'k', href: '/gomining-profit-btc-' + n + 'k' })) }
  ];

  const LOGO = '/gmt-optimizer-logo.svg?v=2';
  const norm = p => (p || '/').replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1');
  const here = norm(location.pathname);
  // The console rewrites its own URL (/console ↔ /planner), so detect it by its code, not its path.
  const isConsole = () => typeof window.consoleView === 'function';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
.gm-burger{position:relative;flex:0 0 auto;width:42px;height:42px;display:inline-flex;align-items:center;justify-content:center;
  margin-left:10px;padding:0;border-radius:12px;cursor:pointer;background:rgba(255,255,255,.035);
  border:1px solid rgba(240,196,120,.2);color:#FFF4E0;transition:border-color .2s,background .2s;-webkit-tap-highlight-color:transparent}
.gm-burger:hover{border-color:rgba(245,166,35,.55);background:rgba(245,166,35,.08)}
.gm-burger:focus-visible{outline:2px solid #F5A623;outline-offset:2px}
.gm-burger i{position:absolute;left:12px;right:12px;height:1.6px;border-radius:2px;background:currentColor;transition:transform .3s cubic-bezier(.22,.61,.36,1),opacity .2s,top .3s cubic-bezier(.22,.61,.36,1)}
.gm-burger i:nth-child(1){top:14px}.gm-burger i:nth-child(2){top:20px}.gm-burger i:nth-child(3){top:26px}
.gm-burger[aria-expanded="true"] i:nth-child(1){top:20px;transform:rotate(45deg)}
.gm-burger[aria-expanded="true"] i:nth-child(2){opacity:0}
.gm-burger[aria-expanded="true"] i:nth-child(3){top:20px;transform:rotate(-45deg)}
.gm-has-menu .nav-links,.gm-hide{display:none!important}
.gm-has-menu{flex-wrap:nowrap!important;justify-content:flex-start!important}
.gm-has-menu>.brand,.gm-has-menu>.c-brand{margin-right:auto}
/* Phones: Launch Console stays beside the hamburger — both tighten so brand + CTA + menu fit one row. */
@media(max-width:520px){
  .gm-has-menu .brand .v,.gm-has-menu .c-brand .v{display:none}
  .gm-has-menu .nav-cta{display:inline-flex!important;align-items:center;padding:8px 12px!important;font-size:.74rem!important;white-space:nowrap;flex:0 0 auto}
  .gm-burger{width:38px;height:38px;margin-left:8px;border-radius:11px}
  .gm-burger i{left:10px;right:10px}
  .gm-burger i:nth-child(1){top:12px}.gm-burger i:nth-child(2){top:18px}.gm-burger i:nth-child(3){top:24px}
  .gm-burger[aria-expanded="true"] i:nth-child(1),.gm-burger[aria-expanded="true"] i:nth-child(3){top:18px}
  .gm-has-menu .brand,.gm-has-menu .c-brand{min-width:0;white-space:nowrap}
}
@media(max-width:380px){
  .gm-has-menu .brand,.gm-has-menu .c-brand{font-size:.88rem;gap:7px}
  .gm-has-menu .brand img,.gm-has-menu .c-brand img{width:22px;height:22px}
  .gm-has-menu .nav-cta{padding:7px 10px!important;font-size:.7rem!important}
  .gm-burger{margin-left:6px}
}

.gm-scrim{position:fixed;inset:0;z-index:10050;background:rgba(3,4,6,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
  opacity:0;visibility:hidden;transition:opacity .3s,visibility 0s .3s}
.gm-drawer{position:fixed;top:0;right:0;bottom:0;z-index:10051;width:min(400px,100vw);display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(18,19,25,.97),rgba(9,10,14,.98));border-left:1px solid rgba(240,196,120,.16);
  box-shadow:-30px 0 80px rgba(0,0,0,.55);transform:translateX(100%);visibility:hidden;
  transition:transform .38s cubic-bezier(.16,1,.3,1),visibility 0s .38s;
  font-family:'Space Grotesk',system-ui,-apple-system,sans-serif;color:#CAD1DE;font-size:15px;line-height:1.4;text-align:left}
.gm-open .gm-scrim{opacity:1;visibility:visible;transition:opacity .3s}
.gm-open .gm-drawer{transform:none;visibility:visible;transition:transform .38s cubic-bezier(.16,1,.3,1)}
html.gm-lock,html.gm-lock body{overflow:hidden!important}
.gm-drawer *{box-sizing:border-box}
.gm-top{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 14px 22px;border-bottom:1px solid rgba(200,210,235,.08)}
.gm-brand{display:flex;align-items:center;gap:10px;color:#FFF4E0!important;font-weight:600;font-size:1rem;text-decoration:none!important;letter-spacing:.01em}
.gm-brand img{width:26px;height:26px;filter:drop-shadow(0 0 10px rgba(245,166,35,.5))}
.gm-x{width:38px;height:38px;border-radius:11px;border:1px solid rgba(240,196,120,.18);background:transparent;color:#CAD1DE;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;transition:border-color .2s,color .2s}
.gm-x:hover{border-color:rgba(245,166,35,.55);color:#FFF4E0}
.gm-x:focus-visible,.gm-drawer a:focus-visible{outline:2px solid #F5A623;outline-offset:2px}
.gm-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:8px 14px 18px}
.gm-sec{padding:14px 0 6px}
.gm-sec+.gm-sec{border-top:1px solid rgba(200,210,235,.06)}
.gm-h{font-family:'Share Tech Mono',ui-monospace,monospace;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:#6E7688;padding:0 10px 8px}
.gm-list{list-style:none;margin:0;padding:0}
.gm-item{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:11px;text-decoration:none!important;color:#E6E9F0;transition:background .18s,color .18s}
.gm-item:hover{background:rgba(245,166,35,.075);color:#FFF4E0}
.gm-item .gm-t{font-size:.94rem;font-weight:500;display:flex;align-items:center;gap:8px}
.gm-item .gm-d{display:block;font-size:.76rem;color:#7D8597;margin-top:1px}
.gm-item .gm-tx{flex:1 1 auto;min-width:0}
.gm-item .gm-arr{flex:0 0 auto;color:#4B5163;transition:transform .2s,color .2s}
.gm-item:hover .gm-arr{color:#F5A623;transform:translateX(2px)}
.gm-compact .gm-item{padding:7px 10px}
.gm-compact .gm-item .gm-t{font-size:.9rem;font-weight:400;color:#C9CFDB}
.gm-item.gm-on{background:rgba(245,166,35,.1);color:#FFF4E0}
.gm-item.gm-on::before{content:'';width:3px;align-self:stretch;margin:-2px 0 -2px -6px;border-radius:3px;background:#F5A623}
.gm-badge{font-family:'Share Tech Mono',ui-monospace,monospace;font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:#1a1206;
  background:linear-gradient(135deg,#FFC65A,#FFCF7A);border-radius:6px;padding:2px 6px;font-weight:400}
.gm-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 10px}
.gm-chip{font-family:'Share Tech Mono',ui-monospace,monospace;font-size:.78rem;color:#C9CFDB;text-decoration:none!important;
  padding:6px 10px;border-radius:9px;border:1px solid rgba(240,196,120,.14);background:rgba(255,255,255,.02);transition:border-color .18s,color .18s,background .18s}
.gm-chip:hover{border-color:rgba(245,166,35,.5);color:#FFF4E0;background:rgba(245,166,35,.06)}
.gm-chip.gm-on{border-color:#F5A623;color:#FFF4E0;background:rgba(245,166,35,.12)}
.gm-foot{padding:14px 22px 18px;border-top:1px solid rgba(200,210,235,.08);display:grid;gap:10px}
.gm-cta{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:12px;font-weight:600;font-size:.92rem;
  color:#120a01!important;text-decoration:none!important;background:linear-gradient(135deg,#FFC65A,#FFCF7A);box-shadow:0 8px 26px rgba(245,166,35,.3)}
.gm-cta:hover{box-shadow:0 12px 32px rgba(245,166,35,.45)}
.gm-offer{font-size:.8rem;color:#8A93A6;text-align:center}
.gm-offer a{color:#FFCF7A}
.gm-offer b{font-family:'Share Tech Mono',ui-monospace,monospace;color:#FFF4E0;font-weight:400;letter-spacing:.04em}
.gm-legal{display:flex;justify-content:center;gap:14px;font-size:.72rem}
.gm-legal a{color:#6E7688;text-decoration:none}.gm-legal a:hover{color:#CAD1DE}
@media(prefers-reduced-motion:reduce){.gm-drawer,.gm-scrim,.gm-burger i,.gm-item,.gm-arr{transition:none!important}}
`;

  const ARROW = '<svg class="gm-arr" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function isOn(href) {
    const u = new URL(href, location.origin);
    if (norm(u.pathname) !== here) return false;
    // Console views share one path — only the bare /console entry is "you are here" by path.
    return !u.search || u.search === location.search;
  }

  function itemHTML(it, i, j) {
    const on = isOn(it.href) ? ' gm-on' : '';
    return '<li><a class="gm-item' + on + '" href="' + esc(it.href) + '" data-gm="' + i + ':' + j + '"' + (on ? ' aria-current="page"' : '') + '>' +
      '<span class="gm-tx"><span class="gm-t">' + esc(it.t) + (it.badge ? '<span class="gm-badge">' + esc(it.badge) + '</span>' : '') + '</span>' +
      (it.d ? '<span class="gm-d">' + esc(it.d) + '</span>' : '') + '</span>' + ARROW + '</a></li>';
  }

  function build(host) {
    // "On this page": the landing's in-page section links, kept reachable from the menu.
    const local = host ? Array.from(host.querySelectorAll('.nav-links a[href^="#"]')).filter(a => a.getAttribute('href').length > 1) : [];
    let secs = '';
    if (local.length) {
      secs += '<div class="gm-sec gm-compact"><div class="gm-h">On this page</div><ul class="gm-list">' +
        local.map(a => '<li><a class="gm-item" href="' + esc(a.getAttribute('href')) + '"><span class="gm-tx"><span class="gm-t">' + esc(a.textContent.trim()) + '</span></span>' + ARROW + '</a></li>').join('') +
        '</ul></div>';
    }
    MENU.forEach((sec, i) => {
      secs += '<div class="gm-sec' + (sec.compact ? ' gm-compact' : '') + '"><div class="gm-h">' + esc(sec.h) + '</div>';
      if (sec.items) secs += '<ul class="gm-list">' + sec.items.map((it, j) => itemHTML(it, i, j)).join('') + '</ul>';
      if (sec.chips) secs += '<div class="gm-chips">' + sec.chips.map(c => '<a class="gm-chip' + (isOn(c.href) ? ' gm-on' : '') + '" href="' + esc(c.href) + '">' + esc(c.t) + '</a>').join('') + '</div>';
      secs += '</div>';
    });

    const wrap = document.createElement('div');
    wrap.className = 'gm-menu';
    wrap.innerHTML =
      '<div class="gm-scrim" data-gm-close></div>' +
      '<aside class="gm-drawer" id="gm-drawer" role="dialog" aria-modal="true" aria-label="Site menu" tabindex="-1">' +
        '<div class="gm-top"><a class="gm-brand" href="/"><img src="' + LOGO + '" alt="">GMT Optimizer</a>' +
          '<button type="button" class="gm-x" data-gm-close aria-label="Close menu"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>' +
        '<div class="gm-body" role="navigation" aria-label="All pages">' + secs + '</div>' +
        '<div class="gm-foot">' +
          (isConsole() ? '' : '<a class="gm-cta" href="/console">Launch Console ' + ARROW.replace('gm-arr', '') + '</a>') +
          '<div class="gm-offer">New to GoMining? Code <b>RINGO5</b> &middot; <a href="/claim">claim your first TH &rarr;</a></div>' +
          '<div class="gm-legal"><a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>' +
        '</div>' +
      '</aside>';
    return wrap;
  }

  function init() {
    const style = document.createElement('style');
    style.id = 'gm-menu-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    // Whichever header this page has. site.js injects #nav before this runs on content pages.
    const host = document.querySelector('#nav') || document.querySelector('.header-inner') || document.querySelector('.wrap > .top');
    const menu = build(host);
    document.body.appendChild(menu);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gm-burger';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'gm-drawer');
    btn.innerHTML = '<i></i><i></i><i></i>';

    if (host) {
      host.classList.add('gm-has-menu');
      // The plain .top bars carry their links in a sibling div of .back pills — fold those in too.
      host.querySelectorAll('.back').forEach(a => a.parentElement && a.parentElement !== host && a.parentElement.classList.add('gm-hide'));
      host.appendChild(btn);
    } else {
      btn.style.cssText = 'position:fixed;top:14px;right:14px;z-index:10049;background:rgba(10,11,15,.85)';
      document.body.appendChild(btn);
    }

    const drawer = menu.querySelector('.gm-drawer');
    let lastFocus = null;
    function open() {
      lastFocus = document.activeElement;
      menu.classList.add('gm-open');
      document.documentElement.classList.add('gm-lock');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
      setTimeout(() => { const f = drawer.querySelector('.gm-on') || drawer.querySelector('.gm-x'); f && f.focus({ preventScroll: true }); }, 60);
    }
    function close(restore) {
      if (!menu.classList.contains('gm-open')) return;
      menu.classList.remove('gm-open');
      document.documentElement.classList.remove('gm-lock');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
      if (restore !== false && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    btn.addEventListener('click', () => menu.classList.contains('gm-open') ? close() : open());
    menu.addEventListener('click', e => {
      if (e.target.closest('[data-gm-close]')) { close(); return; }
      const a = e.target.closest('a');
      if (!a) return;
      const key = a.getAttribute('data-gm');
      if (key && isConsole()) {
        const [i, j] = key.split(':').map(Number);
        const it = MENU[i].items[j];
        const fn = it.run && window[it.run[0]];
        if (typeof fn === 'function') {
          e.preventDefault();
          close(false);
          try { fn.apply(window, it.run.slice(1)); } catch (err) { location.href = it.href; }
          return;
        }
      }
      close(false);
    });
    document.addEventListener('keydown', e => {
      if (!menu.classList.contains('gm-open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(drawer.querySelectorAll('a[href],button')).filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
