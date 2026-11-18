/* GMT-Optimizer — console loaders: charts, Capital Planner and the Growth Projection.
   =========================================================================
   Same idea as the console boot screen (assets/boot.js): a loader whose steps tick off when each
   piece REALLY lands, each showing the value it read, then the result is revealed.
     • Bitcoin / GoMining Token charts — TradingView library, chart frame, 50 EMA, live price;
       the chart wipes in from the left.
     • Rainbow chart — price history, Power-Law fit, bands, today's price.
     • Capital Planner (both modes) and the Growth Projection (My Setup and My Plan) — a full-screen
       loader over the real calculation, which runs underneath exactly as before; when it has
       finished, the results replay their count-up.

   It wraps the app.js functions (openChart, openRainbow, submitPlannerCapital/Target,
   runSetupProjection) instead of changing them — they are classic-script globals, so app.js's own
   calls go through the wrappers. Styles are injected from here.

   Also: every view change (tabs, panels, projection form ↔ results) lands at the TOP of the page.
   html has scroll-behavior:smooth, so a plain scrollTo(0,0) animates and can be cut short by the
   content swapping underneath it — which is how a planner run could leave you at the bottom.
*/
(function () {
  'use strict';
  if (typeof window.openChart !== 'function' || typeof window.openRainbow !== 'function') return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const RB = ['#b11717', '#e23b25', '#ef7b2a', '#f3a93a', '#ecd24b', '#bcd64a', '#5fb85a', '#2fa39a', '#3f7cc4'];

  // Loader card: the site's surface and tokens, one gold progress bar, a plain step list. No glow, rings or counters.
  const CSS = `
.cb-load{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:var(--space-5);
  background:rgb(var(--color-bg-rgb) / .94);transition:opacity var(--duration-base) var(--ease-standard)}
.cb-load.cb-fixed{position:fixed;z-index:10030}
.cb-load.cb-inline{position:relative;inset:auto;min-height:220px}
.cb-load.out{opacity:0}
.cb-core{width:min(380px,100%);background:var(--color-surface-1);border:1px solid var(--color-border);border-radius:var(--radius-card);
  box-shadow:var(--shadow-card);padding:var(--space-5);text-align:left;font-family:var(--font-body)}
.cb-icon{display:block;width:32px;height:32px;margin:0 0 var(--space-3)}
.cb-kicker{font-family:var(--font-ui);font-size:var(--font-size-xs);font-weight:var(--font-weight-semibold);color:var(--color-gold);margin:0 0 var(--space-1)}
.cb-title{font-family:var(--font-ui);font-weight:var(--font-weight-semibold);font-size:var(--font-size-lg);line-height:var(--line-height-tight);
  color:var(--color-text);margin:0 0 var(--space-4)}
.cb-bar{height:4px;border-radius:var(--radius-pill);background:var(--color-border);overflow:hidden;margin:0 0 var(--space-4)}
.cb-bar i{display:block;height:100%;width:100%;background:var(--color-gold);transform-origin:left;transform:scaleX(0);
  transition:transform var(--duration-base) var(--ease-standard)}
.cb-steps{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-2)}
.cb-step{display:flex;align-items:center;gap:var(--space-2);font-size:var(--font-size-sm);color:var(--color-text-2)}
.cb-step b{flex:0 0 8px;width:8px;height:8px;border-radius:50%;background:var(--color-border-strong)}
.cb-step.on{color:var(--color-text)}
.cb-step.on b{background:var(--color-gold)}
.cb-step.ok b{background:var(--color-success)}
.cb-step.bad b{background:var(--color-error)}
.cb-step span{flex:1 1 auto;min-width:0}
.cb-v{font-style:normal;font-size:var(--font-size-xs);color:var(--color-text-2);white-space:nowrap}
.cb-msg{margin:var(--space-3) 0 0;font-size:var(--font-size-sm);color:var(--color-error)}
.cb-msg:empty{display:none}
`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Page locale on /es/, /fr/, /de/ (window.GMT_UI); English keeps en-US and '$' in front, so it is unchanged.
  const LOC_ = ({ es: 'es-ES', fr: 'fr-FR', de: 'de-DE' })[(window.GMT_UI || {}).lang];
  const nf = (n, d = 0) => Number(n).toLocaleString(LOC_ || 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (n, d = 0) => LOC_ ? nf(n, d) + '\u00a0$' : '$' + nf(n, d);
  const state = () => (typeof S !== 'undefined' ? S : {});
  let active = null;   // one loader at a time

  // Run a loader over a page's chart area. steps: [{label, ok(), v()}]. target: element to wipe in.
  function run(pageId, opts) {
    const page = pageId ? document.getElementById(pageId) : null;
    const wrap = opts.host || (opts.fixed ? document.body : page && page.querySelector('.btc-chart-wrap'));
    if (!wrap) return null;
    if (active) active.cancel();

    const el = document.createElement('div');
    el.className = 'cb-load' + (opts.rainbow ? ' cb-rainbow' : '') + (opts.fixed ? ' cb-fixed' : '') + (opts.host ? ' cb-inline' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="cb-core">' + (opts.icon ? '<img class="cb-icon" src="' + opts.icon + '" alt="">' : '') +
      (opts.kicker ? '<div class="cb-kicker">' + opts.kicker + '</div>' : '') +
      '<div class="cb-title">' + opts.title + '</div>' +
      '<div class="cb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>' +
      '<ul class="cb-steps">' + opts.steps.map(s => '<li class="cb-step"><b></b><span>' + s.label + '</span><em class="cb-v"></em></li>').join('') + '</ul>' +
      '<p class="cb-msg"></p></div>';
    wrap.appendChild(el);

    const rows = Array.from(el.querySelectorAll('.cb-step'));
    const bar = el.querySelector('.cb-bar i'), meter = el.querySelector('.cb-bar'), msg = el.querySelector('.cb-msg');
    // Shown only while the work runs, plus a short minimum so it doesn't flash (owner rule: about 1 s at most).
    const MIN_MS = reduce ? 0 : Math.min(opts.minMs || 600, opts.quick ? 250 : 600), MAX_MS = opts.maxMs || 9000;
    const t0 = performance.now();
    let done = 0, dead = false;
    rows[0].classList.add('on');

    const ctl = active = {
      cancel() { if (dead) return; dead = true; el.remove(); if (active === ctl) active = null; }
    };
    function paint() {
      const pctNow = Math.round((done / rows.length) * 100);
      bar.style.transform = 'scaleX(' + (done / rows.length) + ')';
      meter.setAttribute('aria-valuenow', pctNow);
    }

    function tick(now) {
      if (dead) return;
      if (page && page.style.display === 'none') return ctl.cancel();   // page closed mid-load
      const forced = now - t0 > MAX_MS;
      const failed = opts.failed && opts.failed();
      if (failed) {
        if (rows[done]) { rows[done].classList.remove('on'); rows[done].classList.add('bad'); }
        msg.textContent = opts.failText || 'Couldn’t load. Please try again shortly.';
        setTimeout(() => { ctl.cancel(); if (opts.onFail) { try { opts.onFail(); } catch (e) {} } }, 1500);
        return;
      }
      // every step whose work is finished ticks off in the same frame (no staged delay between steps)
      while (done < rows.length && (forced || opts.steps[done].ok())) {
        try { rows[done].querySelector('.cb-v').textContent = opts.steps[done].v ? opts.steps[done].v() : ''; } catch (e) {}
        rows[done].classList.remove('on'); rows[done].classList.add('ok');
        done++;
        if (rows[done]) rows[done].classList.add('on');
      }
      paint();
      if (done === rows.length && now - t0 >= MIN_MS) {
        el.classList.add('out');
        if (opts.onDone) { try { opts.onDone(); } catch (e) {} }
        setTimeout(() => ctl.cancel(), reduce ? 0 : 200);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return ctl;
  }

  // ---- Bitcoin / GoMining Token live charts (TradingView) ----
  const _openChart = window.openChart;
  window.openChart = function (symbol, title, icon, allowChange, isBtc) {
    const already = (typeof _chartSym !== 'undefined' && _chartSym === symbol);
    const widget = document.getElementById('btcChartWidget');
    let frameLoaded = already && !!(widget && widget.querySelector('iframe'));
    let frameAt = frameLoaded ? performance.now() - 1000 : 0;
    // Watch for the iframe TradingView injects and wait for its load event.
    let mo = null;
    if (!frameLoaded && widget) {
      const hook = f => f.addEventListener('load', () => { frameLoaded = true; frameAt = performance.now(); }, { once: true });
      mo = new MutationObserver(() => {
        const f = widget.querySelector('iframe');
        if (f && !f._cbHooked) { f._cbHooked = true; hook(f); }
      });
      mo.observe(widget, { childList: true, subtree: true });
    }
    const out = _openChart.apply(this, arguments);
    const name = isBtc ? 'Bitcoin' : 'GoMining Token', pair = isBtc ? 'BTC/USD' : 'GMT/USD';
    run('btcChartPage', {
      icon: icon || (isBtc ? '/btc36.png' : '/gmt36.png'),
      title: 'Loading the ' + name + ' chart',
      quick: already,
      target: () => widget,
      steps: [
        { label: 'Loading the TradingView chart', ok: () => !!window.TradingView },
        { label: 'Loading ' + pair + ' candles', ok: () => frameLoaded },
        { label: 'Loading the live price', ok: () => { const s = state(); return isBtc ? s.btcPrice > 0 : s.gmtPrice > 0; },
          v: () => { const s = state(); return isBtc ? usd(s.btcPrice) : usd(s.gmtPrice, 4); } }
      ]
    });
    setTimeout(() => mo && mo.disconnect(), 10000);
    return out;
  };

  // ---- Bitcoin Rainbow chart ----
  const _openRainbow = window.openRainbow;
  window.openRainbow = function () {
    const had = typeof _rainbowData !== 'undefined' && !!_rainbowData;
    const out = _openRainbow.apply(this, arguments);
    const data = () => (typeof _rainbowData !== 'undefined' ? _rainbowData : null);
    let fitAt = 0;
    run('rainbowPage', {
      icon: '/btc36.png',
      rainbow: true,
      title: 'Loading the rainbow chart',
      quick: had,
      target: () => document.getElementById('btcRainbowCanvas'),
      // loadBtcRainbow() writes "Couldn’t load price history…" into #btcRainbowMsg when every source fails.
      failed: () => { const m = document.getElementById('btcRainbowMsg'); return !data() && !!m && m.style.display !== 'none' && (m.dataset.err === '1' || /^Couldn/.test(m.textContent)); },
      steps: [
        { label: 'Loading Bitcoin price history', ok: () => !!data(), v: () => nf(data().length) + ' days' },
        { label: 'Fitting the power-law curve', ok: () => { const ok = typeof _rbFit !== 'undefined' && !!_rbFit; if (ok && !fitAt) fitAt = performance.now(); return ok; } },
        { label: 'Loading today’s price', ok: () => state().btcPrice > 0 || !!data(), v: () => state().btcPrice > 0 ? usd(state().btcPrice) : '' }
      ]
    });
    return out;
  };

  // =================================================================================
  // Land every view change at the top, instantly.
  // =================================================================================
  function toTop() {
    const h = document.documentElement, prev = h.style.scrollBehavior;
    h.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0); h.scrollTop = 0; document.body.scrollTop = 0;
    requestAnimationFrame(() => { window.scrollTo(0, 0); requestAnimationFrame(() => { window.scrollTo(0, 0); h.style.scrollBehavior = prev; }); });
  }
  window.gmtToTop = toTop;
  ['_activateTab', 'showPanelView', 'hidePanelView', 'spShowResults', 'spShowForm', 'gotoPlannerTab'].forEach(name => {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () { const r = orig.apply(this, arguments); toTop(); return r; };
  });

  // =================================================================================
  // Capital Planner (amount and target-income modes)
  // =================================================================================
  const money0 = n => usd(Math.round(n));
  function wrapPlanner(name, target) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      const load = document.getElementById('plannerCalcLoading');
      const txt = load && load.querySelector('.sp-loading-txt');
      let started = false, finished = false, failed = false;
      // The original shows #plannerCalcLoading, computes inside a timeout, then hides it.
      const watch = setInterval(() => {
        if (!load) { finished = true; return; }
        const shown = load.style.display !== 'none' && load.style.display !== '';
        if (shown) { started = true; if (txt && /went wrong/i.test(txt.textContent)) failed = true; }
        else if (started) finished = true;
      }, 40);
      const capIn = () => parseFloat((document.getElementById(target ? 'piTargetInput' : 'piCapitalInput') || {}).value) || 0;
      const t12 = typeof TH_TIERS !== 'undefined' ? TH_TIERS : null;   // new miners: 15 W only
      let splits = 0, splitT = 0;
      const ctl = run(null, {
        fixed: true, icon: '/gmt36.png', minMs: 600, maxMs: 15000,
        kicker: 'Capital planner', title: target ? 'Finding the capital you need' : 'Finding your optimal split',
        failed: () => failed, failText: 'Something went wrong. Please try again.',
        onDone: () => { clearInterval(watch); clearInterval(splitT); toTop(); if (typeof animatePlannerResults === 'function') setTimeout(animatePlannerResults, 60); },
        onFail: () => { clearInterval(watch); clearInterval(splitT); },
        steps: [
          { label: target ? 'Reading your income goal' : 'Reading your capital', ok: () => true,
            v: () => { const c = capIn(); return c > 0 ? money0(c) + (target ? '/mo more' : '') : ''; } },
          { label: 'Loading hashrate prices', ok: () => true,
            v: () => t12 ? usd(t12[0].cpt, 2) + ' → ' + usd(t12[t12.length - 1].cpt, 2) + '/TH' : '' },
          { label: target ? 'Finding the capital for your goal' : 'Comparing TH and GMT splits', ok: () => finished },
          { label: 'Calculating your monthly income', ok: () => finished,
            v: () => { const el = document.querySelector('#projTable .pc-monthly') || document.querySelector('#allocDisplay .a-val'); return el ? el.textContent.trim().slice(0, 22) : ''; } }
        ]
      });
      let r;
      try { r = orig.apply(this, arguments); } catch (e) { failed = true; throw e; }
      // The form refused to run (nothing to calculate) — it never showed its own loader, so drop ours.
      setTimeout(() => { if (!started && !finished && ctl) { ctl.cancel(); clearInterval(watch); clearInterval(splitT); } }, 300);
      return r;
    };
  }
  wrapPlanner('submitPlannerCapital', false);
  wrapPlanner('submitPlannerTarget', true);

  // Growth Projection: no full-screen loader — it re-runs in place on every horizon / payout
  // change; assets/futures.js plays its own path-streak loader over the panel on a horizon switch.
  // run() is exposed (with an in-panel opts.host mode) for any other panel that wants one.
  window.GMLoader = { run };
})();
