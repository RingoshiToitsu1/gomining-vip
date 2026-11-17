/* GMT-Optimizer — GoMining marketplace checker (/gomining-marketplace-checker).
   =========================================================================
   Paste a miner link from app.gomining.com/nft/view/<id>; the page reads that miner's
   hashrate, efficiency and asking price through the nft-lookup Supabase function (GoMining's
   API sends no CORS header, so the browser can't read it directly).

   Built for buying a Greedy Machine. It answers three things only:
     1. what the listing costs to buy
     2. what it costs to upgrade its efficiency to 15 W/TH and to 12 W/TH
     3. how big to grow it (TH) so its free weekly growth repays the premium in 1–12 months
   Premium = asking price − what the same hashrate is worth at its rating (going $/TH).
   Growth TH is valued at the rating you choose to run it at; top-up TH is bought at that rating.

   All prices (TH tiers, sale, efficiency upgrade steps) come from assets/pricing.js — edit them there.
*/
// Prices come from assets/pricing.js (the single source). Pages load it first; if one didn't,
// fetch it from next to this script before running, so the widget never prices off nothing.
(function (run) {
  if (window.GMT_PRICING) return run();
  const me = document.currentScript, s = document.createElement('script');
  s.src = new URL('pricing.js', me && me.src ? me.src : location.origin + '/assets/').href;
  s.onload = run;
  document.head.appendChild(s);
})(function () {
  'use strict';
  const P = window.GMT_PRICING;   // TH tiers (sale applied), efficiency ratings, upgrade steps

  // ---- CALIBRATION (mirror of assets/app.js) ----
  const EFF_BEST = P.EFF_BEST;              // best efficiency available (W/TH)
  const EFF_BASE_MAX = P.EFF_BASE_MAX;          // the 15 W/TH hashrate curve
  const GREEDY_CAP = 5000;          // max TH per miner via manual upgrades; passive growth compounds past it
  const FB = { gmt: 0.28 };
  const PROFILES_KEY = 'gm_profiles_v1';                             // console saved setups (inGreedyGrowth lives here)
  const GREEDY_GROWTH_DEFAULT = 0.3347;                              // %/wk — console inGreedyGrowth default; observed, not a constant
  const GREEDY_GROWTH_PAST_DEFAULTS = ['0.3', '0.30', '0.35', '0.3718', '0.3462', '0.36']; // mirror of app.js: a saved old default is not the user's own number
  const SB_URL = 'https://cbatlxqlmeyuhwqpczpv.supabase.co';
  const LOOKUP = SB_URL + '/functions/v1/nft-lookup';

  const TH_TIERS_12W = P.TH_TIERS_12W;
  const TH_TIERS = P.TH_TIERS_15W;
  function cptTier(T, th) {
    if (th <= 0) return T[0].cpt;
    if (th >= T[T.length - 1].th) return T[T.length - 1].cpt;
    for (let i = 0; i < T.length - 1; i++) {
      const lo = T[i], hi = T[i + 1];
      if (th >= lo.th && th <= hi.th) return lo.cpt + (hi.cpt - lo.cpt) * ((th - lo.th) / (hi.th - lo.th));
    }
    return T[0].cpt;
  }
  // One-time $/TH to bring a miner down to 12 W/TH (20 W → $13.51), from the single price source.
  const upgPerTH = P.upgPerTH;
  // Upgrade $/TH from rating w down to rating to (0 when already there or better).
  const upgBetween = (w, to) => Math.max(0, upgPerTH(w) - upgPerTH(to));
  // What one TH is worth at rating w on a miner of size th: the going $/TH between the 12 W and
  // 15 W curves (linear in W, mirror of cptAtEff); above 15 W, a 15 W TH less the upgrade it still needs.
  // With list=true it uses full (non-sale) prices: what that TH is worth once a GoMining sale ends.
  const TH_TIERS_LIST = P.TH_TIERS_15W_LIST;
  const TH_TIERS_12W_LIST = P.TH_TIERS_15W_LIST.map(t => ({ th: t.th, cpt: t.cpt + P.UPG_15_TO_12 }));
  function worthPerTH(th, w, list) {
    const T15 = list ? TH_TIERS_LIST : TH_TIERS, T12 = list ? TH_TIERS_12W_LIST : TH_TIERS_12W;
    if (w > EFF_BASE_MAX) return Math.max(0, cptTier(T15, th) - upgBetween(w, EFF_BASE_MAX));
    const f = (Math.max(w, EFF_BEST) - EFF_BEST) / (EFF_BASE_MAX - EFF_BEST);
    return cptTier(T12, th) * (1 - f) + cptTier(T15, th) * f;
  }
  // Free growth arrives over the coming months, mostly after any sale ends, so it is valued at full
  // price. The premium and the top-ups are what you pay today, so they use today's (sale) prices.
  const growthVal = (T, r) => worthPerTH(T, r, true);
  // $/TH GoMining charges to add hashrate at rating w: linear between the curves, clamped to them
  // (a miner above 15 W still pays the 15 W price per added TH). Mirror of cptAtEff.
  function cptAtEff(th, w) {
    const f = (Math.min(Math.max(w, EFF_BEST), EFF_BASE_MAX) - EFF_BEST) / (EFF_BASE_MAX - EFF_BEST);
    return cptTier(TH_TIERS_12W, th) * (1 - f) + cptTier(TH_TIERS, th) * f;
  }
  // Adding TH to one miner: priced on its size after the top-up. Mirror of costToGrowTiers.
  const costToGrow = (cur, add, w) => add > 0 ? Math.max(0, (cur + add) * cptAtEff(cur + add, w) - cur * cptAtEff(cur, w)) : 0;

  // ---- market data: the GMT price turns the GMT ask into dollars ----
  const S = { gmt: 0, live: false, ready: false };
  function fetchTO(url, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal })
      .then(r => { clearTimeout(id); if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(e => { clearTimeout(id); throw e; });
  }
  async function gmtPrice() {
    try { const r = await fetchTO('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token'); const p = +r?.quotes?.USD?.price; if (p > 0) return p; } catch (e) {}
    try { const r = await fetchTO('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd'); const p = +r?.['gmt-token']?.usd; if (p > 0) return p; } catch (e) {}
    return 0;
  }
  async function loadMarket() {
    const g = await gmtPrice();
    S.gmt = g > 0 ? g : FB.gmt;
    S.live = g > 0;
    S.ready = true;
  }

  // ---- the model ----
  const WK_PER_MO = 52 / 12;
  // Grow the machine to T TH so that T · ((1+g)^weeks − 1) · worth(T, r) = premium. Worth/TH falls a
  // little with size, so iterate. Capped at the 5,000 TH manual-upgrade limit (or its size, if bigger).
  function sizeFor(th, r, g, prem, months) {
    const wks = months * WK_PER_MO, f = Math.pow(1 + g, wks) - 1;
    const cap = Math.max(th, GREEDY_CAP);
    let need = th;
    for (let i = 0; i < 16; i++) need = Math.max(th, prem / (growthVal(need, r) * f));
    const T = Math.min(need, cap), add = Math.max(0, T - th);
    return { months, T, add, capped: need > cap + 1e-9, cost: costToGrow(th, add, r) };
  }
  // Months for growth alone to repay the premium at size T.
  const monthsAt = (T, r, g, prem) => Math.log(1 + prem / (T * growthVal(T, r))) / Math.log(1 + g) / WK_PER_MO;

  // ---- render ----
  const $ = id => document.getElementById(id);
  const money = (n, d) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d != null ? d : (Math.abs(n) < 100 ? 2 : 0),
    maximumFractionDigits: d != null ? d : (Math.abs(n) < 100 ? 2 : 0) });
  const num = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const trimN = (n, d) => d > 0 ? num(n, d).replace(/\.?0+$/, '') : num(n, 0);
  const fmtTH = n => trimN(n, n < 10 ? 3 : n < 100 ? 2 : 0);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let runAt = 'asis';               // 'asis' | '15' | '12' — the rating the payback table assumes; no upgrade unless picked
  const ratingFor = w => runAt === '12' ? EFF_BEST : runAt === '15' ? Math.min(w, EFF_BASE_MAX) : w;

  function readInputs() {
    return {
      th: Math.max(0, parseFloat($('mc-th').value) || 0),
      w: Math.max(EFF_BEST, parseFloat($('mc-wth').value) || 0),
      p: Math.max(0, parseFloat($('mc-price').value) || 0),
      g: Math.max(0, parseFloat($('mc-growth').value) || 0) / 100,
      wOk: parseFloat($('mc-wth').value) > 0
    };
  }
  // Headline figures for the scan panel and the tiles.
  function basics(th, w, p) {
    const ask = p * S.gmt, worth = th * worthPerTH(th, w);
    return { ask, worth, prem: ask - worth, up15: th * upgBetween(w, EFF_BASE_MAX), up12: th * upgPerTH(w) };
  }

  function render() {
    const { th, w, p, g, wOk } = readInputs();
    const out = $('mc-result');
    if (scanning) { out.hidden = true; return; }   // the scan panel owns the stage until it lands
    if (!S.ready || th <= 0 || p <= 0 || !wOk) { out.hidden = true; return; }
    out.hidden = false;

    const b = basics(th, w, p);
    const wTxt = trimN(w, 2) + ' W/TH';

    $('mc-t-cost').textContent = money(b.ask);
    $('mc-t-cost-s').textContent = num(p, 0) + ' GMT · ' + money(b.ask / th) + '/TH';
    $('mc-t-15').textContent = w > EFF_BASE_MAX + 1e-9 ? money(b.up15) : '—';
    $('mc-t-15-s').textContent = w > EFF_BASE_MAX + 1e-9 ? wTxt + ' → 15 · ' + money(b.up15 / th) + '/TH' : 'already at ' + wTxt;
    $('mc-t-12').textContent = w > EFF_BEST + 1e-9 ? money(b.up12) : '—';
    $('mc-t-12-s').textContent = w > EFF_BEST + 1e-9 ? wTxt + ' → 12 · ' + money(b.up12 / th) + '/TH' : 'already at 12 W/TH';
    $('mc-t-prem').textContent = b.prem > 0 ? money(b.prem) : 'none';
    $('mc-t-prem-s').textContent = 'over its ' + fmtTH(th) + ' TH\'s worth of ' + money(b.worth) + (P.SALE_PCT > 0 ? ' at sale prices' : '');

    // Rating switch: only the options that mean something for this miner.
    const asIs = ['asis', 'As is · ' + trimN(w, 2) + ' W'];
    const opts = w > EFF_BASE_MAX + 1e-9 ? [asIs, ['15', '15 W'], ['12', '12 W']]
      : Math.abs(w - EFF_BASE_MAX) < 1e-9 ? [['15', 'As is · 15 W'], ['12', '12 W']]
      : w > EFF_BEST + 1e-9 ? [asIs, ['12', '12 W']]
      : [['12', '12 W']];
    if (!opts.some(o => o[0] === runAt)) runAt = opts[0][0];   // "as is" for this miner
    $('mc-runat').innerHTML = opts.length > 1 ? '<span>Run it at</span>' + opts.map(o =>
      '<button type="button" data-r="' + o[0] + '" class="' + (o[0] === runAt ? 'on' : '') + '">' + esc(o[1]) + '</button>').join('') : '';

    const r = ratingFor(w);
    const effUp = th * upgBetween(w, r);
    const pb = $('mc-payback');
    if (!(b.prem > 0)) {
      pb.innerHTML = '<p class="mc-pb-lead">No premium to pay back: the asking price is at or under what its hashrate is worth (' + money(b.worth) + '). Its growth is profit from week one.</p>';
      return;
    }
    if (!(g > 0)) {
      pb.innerHTML = '<p class="mc-pb-lead">Set its weekly growth % to size the payback.</p>';
      return;
    }
    const now = monthsAt(th, r, g, b.prem);
    const base = b.ask + effUp;                    // what you spend before any top-up
    const nowTxt0 = now < 1 ? 'under a month' : trimN(now, 1) + ' months' + (now > 24 ? ' (~' + trimN(now / 12, 1) + ' yrs)' : '');
    // Above 15 W, GoMining charges the 15 W price for TH that runs at the miner's worse rating, so a
    // top-up costs more than it's worth: don't size one, point at the upgrade instead.
    if (r > EFF_BASE_MAX + 1e-9) {
      pb.innerHTML = '<p class="mc-pb-lead">You\'d pay <b>' + money(b.prem) + '</b> over what its hashrate costs today. At its current <b>' + fmtTH(th) + ' TH</b>, its free growth pays that back in <b>' + nowTxt0 + '</b> on its own.</p>' +
        '<p class="mc-pb-up">Adding TH won\'t speed that up at ' + trimN(r, 2) + ' W: GoMining charges the 15 W price for hashrate that runs at ' + trimN(r, 2) + ' W, so every TH you add costs more than it\'s worth. Pick <b>15 W</b> or <b>12 W</b> above to see top-up options with the upgrade priced in.</p>';
      return;
    }
    const span = (a, z) => a === z ? a + (a === 1 ? ' month' : ' months') : a + '–' + z + ' months';
    // One row per month that needs a top-up; months over the cap, and months growth already covers,
    // collapse into one row each so the table only shows what changes.
    const sizes = []; for (let m = 1; m <= 12; m++) sizes.push(sizeFor(th, r, g, b.prem, m));
    const rows = [];
    for (let k = 0; k < sizes.length;) {
      const s = sizes[k], kind = s.capped ? 'cap' : s.add <= 0.0005 ? 'free' : 'top';
      let z = k; if (kind !== 'top') while (z + 1 < sizes.length && (kind === 'cap' ? sizes[z + 1].capped : sizes[z + 1].add <= 0.0005 && !sizes[z + 1].capped)) z++;
      const when = '<td>' + span(k + 1, z + 1) + '</td>';
      if (kind === 'cap') rows.push('<tr>' + when + '<td colspan="4" class="mc-cap">not reachable: needs more than the ' + num(GREEDY_CAP, 0) + ' TH top-up cap</td></tr>');
      else if (kind === 'free') rows.push('<tr class="hl">' + when + '<td colspan="3" class="mc-cap">no top-up needed: growth covers it in ' + (now < 1 ? 'under a month' : trimN(now, 1) + ' months') + '</td><td>' + money(base) + '</td></tr>');
      else rows.push('<tr>' + when + '<td>' + fmtTH(s.T) + ' TH</td><td>+' + fmtTH(s.add) + '</td><td>' + money(s.cost) + '</td><td>' + money(base + s.cost) + '</td></tr>');
      k = z + 1;
    }
    const nowTxt = now < 1 ? 'under a month' : trimN(now, 1) + ' months' + (now > 24 ? ' (~' + trimN(now / 12, 1) + ' yrs)' : '');
    pb.innerHTML =
      '<p class="mc-pb-lead">You\'d pay <b>' + money(b.prem) + '</b> over what its hashrate costs today. At its current <b>' + fmtTH(th) + ' TH</b>, its free growth pays that back in <b>' + nowTxt + '</b> on its own' +
        (now <= 12 ? (now > 1 ? '. Adding TH only helps if you want it back sooner:' : ', so no top-up is needed:') : '. To get it back sooner, grow it to:') + '</p>' +
      (effUp > 0 ? '<p class="mc-pb-up">Running it at ' + trimN(r, 2) + ' W adds a one-time <b>' + money(effUp) + '</b> efficiency upgrade, included in All-in below. It doesn\'t change the premium.</p>' : '') +
      '<div class="mc-tbl-wrap"><table class="mc-tbl mc-pb"><thead><tr><th>Pay back in</th><th>Grow it to</th><th>Add</th><th>Top-up cost</th><th>All-in</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table></div>' +
      '<p class="mc-tbl-note">All-in = ' + money(b.ask) + ' to buy' + (effUp > 0 ? ' + ' + money(effUp) + ' upgrade to ' + trimN(r, 2) + ' W' : '') + ' + top-up. ' +
      'Growth ' + trimN(g * 100, 4) + '%/week compounding; each free TH is valued at the full ' + trimN(r, 2) + ' W price (' + money(growthVal(th, r)) + '/TH)' +
      (P.SALE_PCT > 0 ? ', not the ' + P.SALE_PCT + '% sale price, since most of it arrives after the sale' : '') + '. ' +
      'Top-up TH is bought at today\'s ' + trimN(r, 2) + ' W price' + (r > EFF_BASE_MAX ? ' (charged at the 15 W rate)' : '') + '. ' +
      'Growth is last week\'s observed rate, not a promise; mining income comes on top.</p>';
  }
  const basisLine = () => 'GMT $' + num(S.gmt, 3) + (S.live ? '' : ' (cached)') + ' · TH priced at GoMining\'s going rate';

  // ---- lookup ----
  function parseId(s) {
    s = String(s || '').trim();
    const m = s.match(/nft\/view\/(\d{1,12})/i) || s.match(/^#?(\d{1,12})$/) || s.match(/[?&](?:id|nft)=(\d{1,12})/i);
    return m ? m[1] : null;
  }
  function showErr(msg) { const el = $('mc-err'); el.textContent = msg; el.hidden = !msg; }

  // ---- scan: the lookup plays out step by step, each step ticking off only when its data is in ----
  let scanning = false, scans = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function runScan(id, req) {
    const box = $('mc-scan'), rows = Array.from(box.querySelectorAll('.mc-sstep'));
    const img = box.querySelector('.mc-scan-thumb img'), thumb = box.querySelector('.mc-scan-thumb');
    const first = scans++ === 0;
    const MIN_MS = reduce ? 300 : first ? 1900 : 1200, STEP_MS = reduce ? 40 : first ? 300 : 190;
    $('mc-scan-title').textContent = 'Scanning miner #' + id;
    rows.forEach(r => { r.className = 'mc-sstep'; r.querySelector('.mc-sv').textContent = ''; });
    rows[0].querySelector('span').textContent = 'Locating miner #' + id + ' on GoMining';
    img.hidden = true; img.removeAttribute('src'); thumb.classList.remove('has-img', 'bad');
    box.className = 'mc-scan'; box.hidden = false;
    ['mc-card', 'mc-result'].forEach(k => { $(k).hidden = true; });

    const d = () => req.data;
    const listed = () => d() && d().marketplace === 'gmt-secondary' && d().status === 'available';
    const steps = [
      { ok: () => !!d(), v: () => d().name || 'miner #' + id },
      { ok: () => !!d(), v: () => trimN(d().power, 2) + ' TH · ' + trimN(d().efficiency, 2) + ' W/TH' },
      { ok: () => !!d(), v: () => listed() ? num(d().price || 0, 0) + ' GMT · ' + (d().saleType === 'auction' ? 'auction' : 'fixed price') : 'not for sale right now' },
      { ok: () => !!d() && S.ready, v: () => { const u = upgPerTH(d().efficiency); return u > 0 ? money(u) + '/TH to reach 12 W' : 'already at 12 W/TH'; } },
      { ok: () => !!d() && S.ready, v: () => {
          if (!listed() || !(d().price > 0)) return 'enter a price to size it';
          const b = basics(d().power, Math.max(EFF_BEST, d().efficiency), d().price);
          return b.prem > 0 ? money(b.prem) + ' premium' : 'no premium';
        } }
    ];

    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      let done = 0, lastAt = t0, shown = 0;
      rows[0].classList.add('on');
      const HEX = '0123456789abcdef';
      const hashT = reduce ? 0 : setInterval(() => {
        let h = '0x'; for (let i = 0; i < 36; i++) h += HEX[(Math.random() * 16) | 0];
        $('mc-scan-hash').textContent = h;
      }, 70);
      const stop = () => clearInterval(hashT);
      function tick(now) {
        if (req.error) {
          stop(); box.classList.add('failed');
          if (rows[done]) { rows[done].classList.remove('on'); rows[done].classList.add('bad'); }
          $('mc-scan-hash').textContent = 'scan stopped';
          return setTimeout(() => reject(req.error), reduce ? 0 : 650);
        }
        if (d() && d().image && img.hidden) {
          img.onload = () => thumb.classList.add('has-img');
          img.src = d().image; img.hidden = false;
        }
        if (done < steps.length && now - lastAt >= STEP_MS && steps[done].ok()) {
          const r = rows[done];
          try { r.querySelector('.mc-sv').textContent = steps[done].v(); } catch (e) {}
          r.classList.remove('on'); r.classList.add('ok');
          done++; lastAt = now;
          if (rows[done]) rows[done].classList.add('on');
        }
        const creep = done < steps.length ? Math.min(0.85, (now - lastAt) / 1400) : 0;
        const target = Math.min(done === steps.length ? 100 : 99, ((done + creep) / steps.length) * 100);
        shown += (target - shown) * (reduce ? 1 : 0.14);
        $('mc-scan-pct').textContent = Math.floor(shown);
        $('mc-scan-bar').style.transform = 'scaleX(' + (shown / 100) + ')';
        if (done === steps.length && now - t0 >= MIN_MS && shown > 99.3) {
          stop();
          $('mc-scan-pct').textContent = '100'; $('mc-scan-bar').style.transform = 'scaleX(1)';
          $('mc-scan-hash').textContent = 'scan complete';
          box.classList.add('done');
          return setTimeout(resolve, reduce ? 0 : 320);
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function lookup(id) {
    if (scanning) return;
    showErr('');
    const btn = $('mc-go');
    btn.disabled = true; btn.textContent = 'Scanning…';
    scanning = true;
    const req = { data: null, error: null };
    fetch(LOOKUP + '?id=' + encodeURIComponent(id))
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 404 || d.error === 'not_found') throw new Error('No GoMining miner has the number ' + id + '. Check the link and try again.');
        if (!r.ok || d.error) throw new Error('Couldn\'t reach GoMining just now. Try again in a minute, or type the numbers in below.');
        if (d.type && d.type !== 'miner') throw new Error('That NFT isn\'t a miner, so there is no hashrate to price.');
        req.data = d;
      })
      .catch(e => { req.error = e instanceof Error ? e : new Error('Couldn\'t reach GoMining just now. Try again in a minute, or type the numbers in below.'); });
    try {
      await runScan(id, req);
      const box = $('mc-scan');
      box.classList.add('out');
      await new Promise(r => setTimeout(r, reduce ? 0 : 260));
      box.hidden = true;
      scanning = false;
      fill(req.data);
      try { history.replaceState(null, '', location.pathname + '?id=' + req.data.id); } catch (e) {}
      revealResult();
    } catch (e) {
      $('mc-scan').hidden = true;
      scanning = false;
      render();
      showErr(e.message || 'Something went wrong.');
    } finally {
      btn.disabled = false; btn.textContent = 'Check miner';
    }
  }

  // ---- reveal: the result rises in piece by piece and every figure counts up into place ----
  function revealResult() {
    if (reduce) return;
    const parts = ['#mc-card', '#mc-result .re-tile', '#mc-runat', '#mc-payback']
      .flatMap(s => Array.from(document.querySelectorAll(s))).filter(el => !el.hidden && !el.closest('[hidden]'));
    parts.forEach((el, i) => {
      el.classList.remove('mc-rise'); void el.offsetWidth;
      el.style.animationDelay = (i * 0.06) + 's';
      el.classList.add('mc-rise');
    });
    countUp(['#mc-card .mc-card-m', '#mc-result .re-tile .v', '#mc-result .re-tile .s', '#mc-payback .mc-pb-lead b', '#mc-payback td']);
  }

  function countUp(selectors) {
    const NUM = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
    const jobs = [];
    selectors.forEach((sel, si) => document.querySelectorAll(sel).forEach((el, i) => {
      if (el.hidden || el.closest('[hidden]')) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const text = n.nodeValue;
        if (!/\d/.test(text)) continue;
        const parts = [], nums = [];
        let last = 0, m;
        NUM.lastIndex = 0;
        while ((m = NUM.exec(text))) {
          const raw = m[0], plain = raw.replace(/,/g, ''), v = parseFloat(plain);
          if (!isFinite(v) || /^(19|20)\d\d$/.test(raw)) continue;
          parts.push(text.slice(last, m.index));
          nums.push({ v, dec: (plain.split('.')[1] || '').length, comma: raw.indexOf(',') >= 0 });
          last = m.index + raw.length;
        }
        if (!nums.length) continue;
        parts.push(text.slice(last));
        jobs.push({ node: n, el, parts, nums, final: text, written: text, delay: 120 + Math.min(si * 3 + i, 18) * 40 });
      }
    }));
    if (!jobs.length) return;
    const fmt = (x, d, comma) => (x < 0 && Math.abs(x) >= Math.pow(10, -d) / 2 ? '-' : '') +
      Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: comma });
    const build = (j, p) => j.parts[0] + j.nums.map((q, k) => {
      let x = q.v * p;
      if (p > 0.05 && p < 0.92) x += (Math.random() - 0.5) * Math.abs(q.v) * 0.04 * (1 - p);
      return fmt(x, q.dec, q.comma) + j.parts[k + 1];
    }).join('');
    const DUR = 1200, start = performance.now(), ease = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    jobs.forEach(j => { j.node.nodeValue = build(j, 0); j.written = j.node.nodeValue; j.el.classList.add('mc-counting'); });
    (function frame(now) {
      let live = false;
      for (const j of jobs) {
        if (j.dead) continue;
        if (!j.node.isConnected || j.node.nodeValue !== j.written) { j.dead = true; j.el.classList.remove('mc-counting'); continue; }
        const t = Math.max(0, now - start - j.delay) / DUR;
        if (t >= 1) {
          j.node.nodeValue = j.final; j.dead = true;
          j.el.classList.remove('mc-counting'); j.el.classList.add('mc-counted');
          setTimeout(() => j.el.classList.remove('mc-counted'), 850);
          continue;
        }
        j.node.nodeValue = build(j, ease(t)); j.written = j.node.nodeValue; live = true;
      }
      if (live) requestAnimationFrame(frame);
    })(start);
  }

  function fill(d) {
    runAt = 'asis';   // each new miner starts with no upgrade assumed
    // Only a secondary-market listing has a real asking price. Other miners carry GoMining's
    // internal reference price, which nobody can buy at — never present it as the ask.
    const listed = d.marketplace === 'gmt-secondary' && d.status === 'available';
    const priceGMT = listed ? (d.price > 0 ? d.price : (d.priceUsdt > 0 && S.gmt > 0 ? d.priceUsdt / S.gmt : 0)) : 0;
    $('mc-th').value = d.power > 0 ? String(+d.power.toFixed(4)) : '';
    $('mc-wth').value = d.efficiency > 0 ? String(+d.efficiency.toFixed(2)) : '';
    $('mc-price').value = priceGMT > 0 ? String(Math.round(priceGMT * 100) / 100) : '';

    const card = $('mc-card');
    let status;
    if (listed && d.saleType === 'auction') status = '<span class="mc-pill warn">Auction · price is the current bid</span>';
    else if (listed) status = '<span class="mc-pill ok">Listed for sale</span>';
    else status = '<span class="mc-pill off">Not listed right now · enter a price to test one</span>';
    card.innerHTML =
      (d.image ? '<img src="' + esc(d.image) + '" alt="" loading="lazy" width="72" height="72">' : '') +
      '<div class="mc-card-b"><div class="mc-card-n">' + esc(d.name || ('Miner #' + d.id)) + '</div>' +
      '<div class="mc-card-m">' + esc(num(d.power, 2).replace(/\.?0+$/, '')) + ' TH · ' + esc(num(d.efficiency, 2).replace(/\.?0+$/, '')) + ' W/TH' +
      (d.level ? ' · level ' + esc(d.level) : '') + (d.network ? ' · ' + esc(d.network) : '') + '</div>' + status + '</div>' +
      '<a class="mc-card-l" href="https://app.gomining.com/nft/view/' + esc(d.id) + '" target="_blank" rel="noopener">View on GoMining ↗</a>';
    card.hidden = false;
    render();
    if (!listed) $('mc-price').focus();
  }

  function init() {
    const root = $('mc');
    if (!root) return;
    $('mc-form').addEventListener('submit', ev => {
      ev.preventDefault();
      const id = parseId($('mc-link').value);
      if (!id) { showErr('Paste a miner link like https://app.gomining.com/nft/view/10854, or just the number.'); return; }
      lookup(id);
    });
    ['mc-th', 'mc-wth', 'mc-price', 'mc-growth'].forEach(id => $(id).addEventListener('input', render));
    $('mc-runat').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-r]');
      if (b) { runAt = b.dataset.r; render(); }
    });
    // Weekly growth: your console's figure when this browser has a saved setup, else the console default.
    let gr = GREEDY_GROWTH_DEFAULT;
    try {
      const ps = JSON.parse(localStorage.getItem(PROFILES_KEY) || 'null');
      const prof = ps && ps.profiles && (ps.profiles.find(x => x.id === ps.activeId) || ps.profiles[0]);
      const raw = prof && prof.data && prof.data.inGreedyGrowth != null ? String(prof.data.inGreedyGrowth).trim() : '';
      const v = parseFloat(raw);
      if (Number.isFinite(v) && v >= 0 && !GREEDY_GROWTH_PAST_DEFAULTS.includes(raw)) gr = v;
    } catch (e) {}
    $('mc-growth').value = String(gr);
    loadMarket().then(() => {
      root.classList.remove('re-loading');
      render();
      const q = new URLSearchParams(location.search).get('id');
      const id = parseId(q);
      if (id) { $('mc-link').value = 'https://app.gomining.com/nft/view/' + id; lookup(id); }
      $('mc-basis').textContent = basisLine();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
});
