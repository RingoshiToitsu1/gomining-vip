/* GMT Optimizer — console loaders: charts, Capital Planner and the Growth Projection.
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

  const CSS = `
.cb-load{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:18px;
  background:radial-gradient(ellipse 60% 55% at 50% 45%,rgba(245,166,35,.1),transparent 70%),#0a0b0e;
  transition:opacity .45s cubic-bezier(.16,1,.3,1),filter .45s cubic-bezier(.16,1,.3,1),transform .45s cubic-bezier(.16,1,.3,1)}
.cb-load::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(rgba(230,190,120,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,190,120,.05) 1px,transparent 1px);
  background-size:36px 36px;-webkit-mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%);mask-image:radial-gradient(ellipse 60% 60% at 50% 45%,#000 25%,transparent 80%);
  animation:cbGrid 4s linear infinite}
.cb-load.cb-rainbow{background:radial-gradient(ellipse 60% 55% at 50% 45%,rgba(95,184,90,.08),transparent 70%),#0a0b0e}
.cb-load.out{opacity:0;filter:blur(8px);transform:scale(1.03);pointer-events:none}
.cb-load.cb-fixed{position:fixed;z-index:2147482000;padding:24px;
  background:radial-gradient(ellipse 60% 50% at 50% 42%,rgba(245,166,35,.13),transparent 70%),radial-gradient(ellipse 90% 70% at 50% 120%,rgba(255,138,61,.08),transparent 60%),rgba(6,7,9,.97);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.cb-fixed .cb-core{width:min(420px,100%)}
.cb-fixed .cb-orb{width:92px;height:92px}.cb-fixed .cb-orb img{inset:25px;width:42px;height:42px;border-radius:0}
.cb-fixed .cb-title{font-size:1.15rem}
.cb-kicker{font-family:'Share Tech Mono',ui-monospace,monospace;letter-spacing:.3em;font-size:.66rem;color:#FFCF7A;text-transform:uppercase;margin-bottom:.3rem}
@keyframes cbGrid{to{background-position:0 36px,36px 0}}
.cb-core{position:relative;width:min(380px,100%);text-align:center;font-family:'Space Grotesk',system-ui,sans-serif;color:#CAD1DE}
.cb-orb{position:relative;width:78px;height:78px;margin:0 auto 14px}
.cb-orb::before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 55%,rgba(245,166,35,.9) 80%,#FFCF7A 100%);
  -webkit-mask:radial-gradient(circle,transparent 60%,#000 61%);mask:radial-gradient(circle,transparent 60%,#000 61%);animation:cbSpin 1.05s linear infinite}
.cb-rainbow .cb-orb::before{background:conic-gradient(${RB.map((c, i) => c + ' ' + Math.round(i / (RB.length - 1) * 100) + '%').join(',')});animation-duration:1.6s}
.cb-orb img{position:absolute;inset:21px;width:36px;height:36px;border-radius:50%;animation:cbBreathe 1.5s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(245,166,35,.6))}
@keyframes cbSpin{to{transform:rotate(360deg)}}
@keyframes cbBreathe{50%{transform:scale(1.08)}}
.cb-title{font-size:1.02rem;font-weight:600;color:#FFF4E0;margin-bottom:.8rem}
.cb-meter{display:flex;align-items:center;gap:10px;margin-bottom:.85rem}
.cb-bar{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden}
.cb-bar i{display:block;height:100%;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#F5A623,#FFCF7A);box-shadow:0 0 12px rgba(245,166,35,.8)}
.cb-rainbow .cb-bar i{background:linear-gradient(90deg,${RB.slice().reverse().join(',')});box-shadow:0 0 12px rgba(95,184,90,.5)}
.cb-pct{font-family:'Share Tech Mono',ui-monospace,monospace;color:#FFF4E0;font-size:.86rem;min-width:3em;text-align:right}
.cb-steps{list-style:none;margin:0;padding:0;text-align:left;display:grid;gap:6px}
.cb-step{display:flex;align-items:center;gap:9px;font-size:.8rem;color:#4B5163;transition:color .25s;min-width:0}
.cb-step b{flex:0 0 14px;height:14px;border-radius:50%;border:1.5px solid currentColor;position:relative;transition:all .25s}
.cb-step.on{color:#FFF4E0}
.cb-step.on b{border-color:rgba(245,166,35,.3);border-top-color:#F5A623;animation:cbSpin .7s linear infinite}
.cb-step.ok{color:#AEB5C4}
.cb-step.ok b{border-color:#57d9a3;background:#57d9a3;box-shadow:0 0 9px rgba(87,217,163,.6)}
.cb-step.ok b::after{content:'';position:absolute;left:3.5px;top:1px;width:3.5px;height:7px;border:solid #06140d;border-width:0 2px 2px 0;transform:rotate(45deg)}
.cb-step.bad{color:#ff8a66}.cb-step.bad b{border-color:#ff8a66}
.cb-step span{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb-v{font-style:normal;font-family:'Share Tech Mono',ui-monospace,monospace;font-size:.7rem;color:#FFCF7A;white-space:nowrap;opacity:0;transform:translateX(-5px);transition:opacity .3s,transform .3s}
.cb-step.ok .cb-v{opacity:1;transform:none}
.cb-hash{margin-top:.8rem;font-family:'Share Tech Mono',ui-monospace,monospace;font-size:.62rem;letter-spacing:.05em;color:#3A4052;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb-load.done .cb-hash{color:#57d9a3}
.cb-wipe{animation:cbWipe .95s cubic-bezier(.65,0,.35,1) both}
@keyframes cbWipe{from{clip-path:inset(0 100% 0 0);filter:brightness(1.6) saturate(1.3)}60%{filter:brightness(1.15)}to{clip-path:inset(0 0 0 0);filter:none}}
@media(max-width:420px){.cb-v{font-size:.62rem}.cb-step{font-size:.74rem}}
@media(prefers-reduced-motion:reduce){.cb-load *,.cb-load::before{animation:none!important}.cb-wipe{animation:none}}
`;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const nf = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const state = () => (typeof S !== 'undefined' ? S : {});
  let active = null;   // one loader at a time

  // Run a loader over a page's chart area. steps: [{label, ok(), v()}]. target: element to wipe in.
  function run(pageId, opts) {
    const page = pageId ? document.getElementById(pageId) : null;
    const wrap = opts.fixed ? document.body : page && page.querySelector('.btc-chart-wrap');
    if (!wrap) return null;
    if (active) active.cancel();

    const el = document.createElement('div');
    el.className = 'cb-load' + (opts.rainbow ? ' cb-rainbow' : '') + (opts.fixed ? ' cb-fixed' : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="cb-core"><div class="cb-orb"><img src="' + opts.icon + '" alt=""></div>' +
      (opts.kicker ? '<div class="cb-kicker">' + opts.kicker + '</div>' : '') +
      '<div class="cb-title">' + opts.title + '</div>' +
      '<div class="cb-meter"><div class="cb-bar"><i></i></div><div class="cb-pct"><span>0</span>%</div></div>' +
      '<ul class="cb-steps">' + opts.steps.map(s => '<li class="cb-step"><b></b><span>' + s.label + '</span><em class="cb-v"></em></li>').join('') + '</ul>' +
      '<div class="cb-hash">0x</div></div>';
    wrap.appendChild(el);

    const rows = Array.from(el.querySelectorAll('.cb-step'));
    const pct = el.querySelector('.cb-pct span'), bar = el.querySelector('.cb-bar i'), hash = el.querySelector('.cb-hash');
    const MIN_MS = reduce ? 200 : opts.minMs || (opts.quick ? 750 : 1500), STEP_MS = reduce ? 30 : opts.quick ? 110 : 260, MAX_MS = opts.maxMs || 9000;
    const t0 = performance.now();
    let done = 0, lastAt = t0, shown = 0, dead = false;
    rows[0].classList.add('on');
    const HEX = '0123456789abcdef';
    const ht = reduce ? 0 : setInterval(() => { let h = '0x'; for (let i = 0; i < 36; i++) h += HEX[(Math.random() * 16) | 0]; hash.textContent = h; }, 70);

    const ctl = active = {
      cancel() { if (dead) return; dead = true; clearInterval(ht); el.remove(); if (active === ctl) active = null; }
    };

    function tick(now) {
      if (dead) return;
      if (page && page.style.display === 'none') return ctl.cancel();   // page closed mid-load
      const forced = now - t0 > MAX_MS;
      const failed = opts.failed && opts.failed();
      if (failed) {
        clearInterval(ht);
        if (rows[done]) { rows[done].classList.remove('on'); rows[done].classList.add('bad'); }
        hash.textContent = opts.failText || 'couldn’t load — try again shortly';
        setTimeout(() => { ctl.cancel(); if (opts.onFail) { try { opts.onFail(); } catch (e) {} } }, 900);
        return;
      }
      if (done < rows.length && now - lastAt >= STEP_MS && (forced || opts.steps[done].ok())) {
        try { rows[done].querySelector('.cb-v').textContent = opts.steps[done].v ? opts.steps[done].v() : ''; } catch (e) {}
        rows[done].classList.remove('on'); rows[done].classList.add('ok');
        done++; lastAt = now;
        if (rows[done]) rows[done].classList.add('on');
      }
      const creep = done < rows.length ? Math.min(0.85, (now - lastAt) / 1500) : 0;
      const target = Math.min(done === rows.length ? 100 : 99, ((done + creep) / rows.length) * 100);
      shown += (target - shown) * (reduce ? 1 : 0.14);
      pct.textContent = Math.floor(shown);
      bar.style.transform = 'scaleX(' + (shown / 100) + ')';
      if (done === rows.length && now - t0 >= MIN_MS && shown > 99.3) {
        clearInterval(ht);
        pct.textContent = '100'; bar.style.transform = 'scaleX(1)';
        hash.textContent = opts.doneText || 'chart ready';
        el.classList.add('done');
        setTimeout(() => {
          if (dead) return;
          el.classList.add('out');
          const t = opts.target && opts.target();
          if (t && !reduce) { t.classList.remove('cb-wipe'); void t.offsetWidth; t.classList.add('cb-wipe'); setTimeout(() => t.classList.remove('cb-wipe'), 1000); }
          if (opts.onDone) { try { opts.onDone(); } catch (e) {} }
          setTimeout(() => ctl.cancel(), 480);
        }, reduce ? 0 : 260);
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
      doneText: pair + ' · live',
      target: () => widget,
      steps: [
        { label: 'Connecting to TradingView', ok: () => !!window.TradingView, v: () => 'real-time feed' },
        { label: 'Streaming ' + pair + ' candles', ok: () => frameLoaded, v: () => '1h candles' },
        { label: 'Plotting the 50 EMA', ok: () => frameLoaded && performance.now() - frameAt > 450, v: () => '50-period EMA' },
        { label: 'Syncing the live price', ok: () => { const s = state(); return isBtc ? s.btcPrice > 0 : s.gmtPrice > 0; },
          v: () => { const s = state(); return isBtc ? '$' + nf(s.btcPrice) : '$' + nf(s.gmtPrice, 4); } }
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
      title: 'Painting the Bitcoin Rainbow',
      quick: had,
      doneText: 'power-law bands · live',
      target: () => document.getElementById('btcRainbowCanvas'),
      // loadBtcRainbow() writes "Couldn’t load price history…" into #btcRainbowMsg when every source fails.
      failed: () => { const m = document.getElementById('btcRainbowMsg'); return !data() && !!m && m.style.display !== 'none' && /^Couldn/.test(m.textContent); },
      steps: [
        { label: 'Downloading BTC price history', ok: () => !!data(), v: () => nf(data().length) + ' days since 2012' },
        { label: 'Fitting the Power-Law regression', ok: () => { const ok = typeof _rbFit !== 'undefined' && !!_rbFit; if (ok && !fitAt) fitAt = performance.now(); return ok; }, v: () => 'log price vs log time' },
        { label: 'Painting the 9 valuation bands', ok: () => fitAt && performance.now() - fitAt > 250, v: () => 'fire sale → bubble' },
        { label: 'Placing today’s price', ok: () => state().btcPrice > 0 || !!data(), v: () => state().btcPrice > 0 ? '$' + nf(state().btcPrice) : 'latest close' }
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
  const money0 = n => '$' + nf(Math.round(n));
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
      const t12 = typeof TH_TIERS_12W !== 'undefined' ? TH_TIERS_12W : null;
      let splits = 0, splitT = 0;
      const ctl = run(null, {
        fixed: true, icon: '/gmt-optimizer-logo.svg?v=2', minMs: 2100, maxMs: 15000,
        kicker: 'Capital Planner', title: target ? 'Finding the capital you need' : 'Finding your optimal split',
        failed: () => failed, failText: 'something went wrong — try again',
        onDone: () => { clearInterval(watch); clearInterval(splitT); toTop(); if (typeof animatePlannerResults === 'function') setTimeout(animatePlannerResults, 60); },
        onFail: () => { clearInterval(watch); clearInterval(splitT); },
        steps: [
          { label: target ? 'Reading your income goal' : 'Reading your capital', ok: () => true,
            v: () => { const c = capIn(); return c > 0 ? money0(c) + (target ? '/mo more' : ' to deploy') : 'current farm'; } },
          { label: 'Pricing new hashrate tiers', ok: () => true,
            v: () => t12 ? '$' + t12[0].cpt.toFixed(2) + ' → $' + t12[t12.length - 1].cpt.toFixed(2) + '/TH' : '12 W & 15 W curves' },
          { label: target ? 'Goal-seeking the capital' : 'Testing every TH / GMT split',
            ok: () => { if (!splitT) splitT = setInterval(() => { splits += 37 + ((Math.random() * 60) | 0); }, 45); return finished; },
            v: () => nf(Math.max(splits, 1200)) + ' combinations' },
          { label: 'Holding the 20% token discount', ok: () => finished, v: () => 'GMT coverage locked' },
          { label: 'Projecting your monthly income', ok: () => finished,
            v: () => { const el = document.querySelector('#projTable .pc-monthly') || document.querySelector('#allocDisplay .a-val'); return el ? el.textContent.trim().slice(0, 22) : 'plan ready'; } }
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

  // =================================================================================
  // Growth Projection (My Setup and My Plan)
  // =================================================================================
  const _runProj = window.runSetupProjection;
  if (typeof _runProj === 'function') {
    window.runSetupProjection = function () {
      if (typeof S === 'undefined' || !S.loaded) return _runProj.apply(this, arguments);
      const load = document.getElementById('spPageLoading');
      let started = false, finished = false;
      const watch = setInterval(() => {
        const shown = load && load.style.display === 'flex';
        if (shown) started = true;
        else if (started || !load) finished = true;
      }, 40);
      const planner = window._spMode === 'planner';
      let sel = null;
      try { sel = typeof spSelection === 'function' ? spSelection() : null; } catch (e) {}
      const i = (() => { try { return inp(); } catch (e) { return null; } })();
      let weeks = 0, wkT = 0;
      const ctl = run(null, {
        fixed: true, icon: '/gmt-optimizer-logo.svg?v=2', minMs: 2300, maxMs: 15000,
        kicker: 'Growth Projection', title: planner ? 'Projecting your plan forward' : 'Projecting your farm forward',
        onDone: () => { clearInterval(watch); clearInterval(wkT); toTop(); if (typeof animateSetupResults === 'function') setTimeout(animateSetupResults, 60); },
        steps: [
          { label: planner ? 'Loading your planned allocation' : 'Loading your farm', ok: () => true,
            v: () => { if (!i) return 'setup ready'; const th = (+i.th || 0) + (+i.gth || 0); return th > 0 ? (th < 100 ? nf(th, 2).replace(/\.?0+$/, '') : nf(th)) + ' TH' : 'setup ready'; } },
          { label: 'Fitting GMT price elasticity', ok: () => typeof _gmtBeta === 'undefined' || !!_gmtBeta || finished, v: () => 'daily history' },
          { label: 'Walking BTC along the rainbow band', ok: () => true,
            v: () => sel && sel.bpEnd ? '$' + nf(Math.round(sel.bpEnd)) + ' by ' + new Date(sel.targetMs).getFullYear() : 'power-law path' },
          { label: 'Simulating weekly reinvestment',
            ok: () => { const total = sel && sel.days ? Math.round(sel.days / 7) : 260; if (!wkT) wkT = setInterval(() => { weeks = Math.min(total, weeks + Math.max(1, Math.round(total / 30))); }, 50); return finished && weeks >= total; },
            v: () => nf(sel && sel.days ? Math.round(sel.days / 7) : weeks) + ' weeks' },
          { label: 'Applying halvings & difficulty', ok: () => finished, v: () => 'halvings + difficulty grind' }
        ]
      });
      const r = _runProj.apply(this, arguments);
      setTimeout(() => { if (!started && !finished && ctl) { ctl.cancel(); clearInterval(watch); clearInterval(wkT); } }, 300);
      return r;
    };
  }
})();
