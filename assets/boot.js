/* GMT Optimizer — console boot sequence + count-up reveal.
   =========================================================================
   The console fetches prices, difficulty, FX, then (if logged in) the saved setup and the cloud
   fleet, and every one of those re-renders the numbers. Shown raw, that reads as flicker: zeros,
   a fallback price, then the real farm. So the page opens behind a boot screen (#gmBoot, in the
   HTML so it's there on the first frame) whose steps tick off as each piece REALLY lands, each
   showing the value it just read. It lifts only once the numbers have stopped changing, and then
   every figure on screen counts up from zero into its final value.

   Nothing here computes anything: it only watches the app's own state (S, GMTAccount, the fleet
   event) and the DOM. If this script fails, the CSS failsafe in console/index.html removes the
   overlay after 12 s.
*/
(function () {
  'use strict';
  const root = document.documentElement;
  const boot = document.getElementById('gmBoot');
  if (!boot || !root.classList.contains('gm-booting')) { reveal(false); return; }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem('gm_boot_seen') === '1'; sessionStorage.setItem('gm_boot_seen', '1'); } catch (e) {}
  const MIN_MS = reduce ? 500 : seen ? 1100 : 2400;   // long enough to read the first time, brisk after
  const STEP_MS = reduce ? 60 : seen ? 140 : 330;     // minimum gap between steps ticking off
  const MAX_MS = 8000;                                // never hold the page longer than this
  const SETTLE_MS = 450;                              // numbers must be still this long
  const t0 = performance.now();

  const $ = id => document.getElementById(id);
  const pctEl = $('gbPct'), barEl = $('gbBar'), hashEl = $('gbHash');
  const rows = Array.from(boot.querySelectorAll('.gb-step'));

  // ---- when the numbers have stopped moving ----
  let lastMut = performance.now();
  const container = document.querySelector('.container');
  const mo = new MutationObserver(() => { lastMut = performance.now(); });
  if (container) mo.observe(container, { childList: true, characterData: true, subtree: true });

  // ---- account + fleet readiness (hooks set by account.js / fleet.js) ----
  let fleetLoaded = false;
  document.addEventListener('gmt-fleet-loaded', () => { fleetLoaded = true; });
  const acc = () => window.GMTAccount;
  const accountResolved = () => { const a = acc(); return !a || a.ready === false || a.resolved === true; };
  const loggedIn = () => { const a = acc(); return !!(a && a.isLoggedIn && a.isLoggedIn()); };
  const st = () => (typeof S !== 'undefined' ? S : null);   // app.js's global state
  const nf = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const STEPS = [
    { ready: () => true, detail: () => 'mempool.space' },
    { ready: () => { const s = st(); return s && s.btcPrice > 0 && s.gmtPrice > 0; },
      detail: () => { const s = st(); return 'BTC $' + nf(s.btcPrice) + ' · GMT $' + nf(s.gmtPrice, 3); } },
    { ready: () => { const s = st(); return s && s.satsPerTHDay > 0; },
      detail: () => nf(Math.floor(st().satsPerTHDay)) + ' sats/TH/day' },
    { ready: () => accountResolved() && (!loggedIn() || fleetLoaded || performance.now() - t0 > 4500),
      detail: () => {
        const f = window.GMTFleet;
        if (f && f.th > 0) return nf(f.count) + (f.count === 1 ? ' miner · ' : ' miners · ') + (f.th < 100 ? nf(f.th, 2).replace(/\.?0+$/, '') : nf(f.th)) + ' TH';
        return loggedIn() ? 'account synced' : 'guest session';
      } },
    { ready: () => { const s = st(); return s && s.loaded && performance.now() - lastMut > SETTLE_MS; },
      detail: () => { const d = $('heroDiscount'); const t = d && d.textContent.trim(); return t && /\d/.test(t) ? t + ' discount' : 'ready'; } }
  ];

  let done = 0, lastDoneAt = t0, shown = 0, finished = false;
  rows[0] && rows[0].classList.add('on');

  function tick(now) {
    if (finished) return;
    const forced = now - t0 > MAX_MS;
    if (done < STEPS.length && now - lastDoneAt >= STEP_MS && (forced || STEPS[done].ready())) {
      const r = rows[done];
      if (r) {
        let d = '';
        try { d = STEPS[done].detail(); } catch (e) {}
        r.querySelector('.gb-v').textContent = d || '';
        r.classList.remove('on'); r.classList.add('ok');
      }
      done++; lastDoneAt = now;
      if (rows[done]) rows[done].classList.add('on');
    }
    // Progress creeps within the active step so the bar never sits dead while waiting on the network.
    const creep = done < STEPS.length ? Math.min(0.85, (now - lastDoneAt) / 1600) : 0;
    const target = Math.min(done === STEPS.length ? 100 : 99, ((done + creep) / STEPS.length) * 100);
    shown += (target - shown) * (reduce ? 1 : 0.12);
    const p = Math.max(0, Math.min(100, shown));
    pctEl.textContent = Math.floor(p);
    barEl.style.transform = 'scaleX(' + (p / 100) + ')';

    if (done === STEPS.length && now - t0 >= MIN_MS && shown > 99.3) return finish();
    requestAnimationFrame(tick);
  }

  // A running hash readout under the steps — the machine visibly working.
  const HEX = '0123456789abcdef';
  const hashTimer = reduce ? 0 : setInterval(() => {
    let h = '0x';
    for (let i = 0; i < 40; i++) h += HEX[(Math.random() * 16) | 0];
    hashEl.textContent = h;
  }, 70);

  function finish() {
    finished = true;
    pctEl.textContent = '100';
    barEl.style.transform = 'scaleX(1)';
    clearInterval(hashTimer);
    hashEl.textContent = 'farm synced · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    boot.classList.add('gb-done');
    setTimeout(() => {
      boot.classList.add('gb-out');
      root.classList.remove('gm-booting');
      mo.disconnect();
      reveal(!reduce);
      setTimeout(() => boot.remove(), 700);
    }, reduce ? 80 : 380);
  }

  requestAnimationFrame(tick);

  // ===================================================================================
  // Reveal: cards rise in again, and every visible figure counts up into its final value.
  // ===================================================================================
  function reveal(animate) {
    if (!animate) return;
    const vh = innerHeight;
    const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh * 1.15 && r.width > 0; };

    // Re-run the scroll reveal on what's on screen, so the dashboard arrives rather than just appears.
    document.querySelectorAll('.reveal.visible').forEach(el => {
      if (!inView(el)) return;
      el.style.transitionDelay = '0s';
      el.classList.remove('visible');
    });
    void document.body.offsetHeight;
    let k = 0;
    document.querySelectorAll('.reveal').forEach(el => {
      if (el.classList.contains('visible') || !inView(el)) return;
      el.style.transitionDelay = (Math.min(k++, 8) * 0.07) + 's';
      el.classList.add('visible');
    });

    const SEL = '.hero-val, .hero-yearly, .hero-btc, .hero-sub, .out-val, .topbar .live-chip .val, .gmt-resgate .fleetstat';
    const NUM = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
    const jobs = [];
    document.querySelectorAll(SEL).forEach((el, i) => {
      if (!inView(el) || el.closest('[hidden]')) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const text = n.nodeValue;
        if (!/\d/.test(text)) continue;
        const parts = [], nums = [];
        let last = 0, m;
        NUM.lastIndex = 0;
        while ((m = NUM.exec(text))) {
          const raw = m[0], plain = raw.replace(/,/g, '');
          const v = parseFloat(plain);
          // Leave years, times and tiny labels alone — only real figures count up.
          if (!isFinite(v) || (/^(19|20)\d\d$/.test(raw)) || text.charAt(m.index + raw.length) === ':' || text.charAt(m.index - 1) === ':') continue;
          parts.push(text.slice(last, m.index));
          nums.push({ v, dec: (plain.split('.')[1] || '').length, comma: raw.indexOf(',') >= 0 });
          last = m.index + raw.length;
        }
        if (!nums.length) continue;
        parts.push(text.slice(last));
        jobs.push({ node: n, el, parts, nums, final: text, written: text, delay: Math.min(i, 14) * 45 });
      }
    });
    if (!jobs.length) return;

    const fmt = (x, d, comma) => {
      const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: comma });
      return (x < 0 && Math.abs(x) >= Math.pow(10, -d) / 2 ? '-' : '') + s;
    };
    const build = (j, p) => {
      let out = j.parts[0];
      j.nums.forEach((q, idx) => {
        // Last stretch jitters the trailing digits, as if the figure is still being resolved.
        let x = q.v * p;
        if (p < 0.92 && p > 0.05) x += (Math.random() - 0.5) * Math.abs(q.v) * 0.04 * (1 - p);
        out += fmt(x, q.dec, q.comma) + j.parts[idx + 1];
      });
      return out;
    };

    const DUR = 1500, start = performance.now();
    const easeOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    jobs.forEach(j => { j.node.nodeValue = build(j, 0); j.written = j.node.nodeValue; j.el.classList.add('gm-counting'); });

    function frame(now) {
      let live = false;
      for (const j of jobs) {
        if (j.dead) continue;
        // The app re-rendered this figure mid-count: its new value wins, stop touching it.
        if (!j.node.isConnected || j.node.nodeValue !== j.written) { j.dead = true; j.el.classList.remove('gm-counting'); continue; }
        const t = Math.max(0, now - start - j.delay) / DUR;
        if (t >= 1) {
          j.node.nodeValue = j.final; j.dead = true;
          j.el.classList.remove('gm-counting'); j.el.classList.add('gm-counted');
          setTimeout(() => j.el.classList.remove('gm-counted'), 900);
          continue;
        }
        j.node.nodeValue = build(j, easeOut(t));
        j.written = j.node.nodeValue;
        live = true;
      }
      if (live) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
