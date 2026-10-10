/* GMT Optimizer — inline ROI / earnings calculator for the content pages.
   =========================================================================
   A trimmed, self-contained mirror of the engine in assets/app.js. It exists so
   /gomining-roi-calculator answers its own query (a calculator) instead of only
   describing one, without pulling the 190 KB console bundle onto a content page.

   IMPORTANT — this duplicates the calibration constants below. They MUST stay in
   sync with the block at the top of assets/app.js. When you recalibrate there
   (BLOCK_SUBSIDY at a halving, fee rates, conversion skim, tier pricing), mirror
   the change here. Everything else is derived, so the constants are the only
   drift surface. Full-fidelity modelling (VIP bonuses, click streak, greedy
   machine, reinvestment) stays in the console — this deliberately covers only
   the variables that dominate a first-pass ROI answer.
*/
(function () {
  'use strict';

  // ---- CALIBRATION (mirror of assets/app.js) ----
  const CONVERSION_FEE = 0.0225;  // BTC → GMT skim applied at payout
  const USD_GMT_FEE    = 0.02;    // fee on USD deployed into GMT (lock + TH mint)
  const BLOCK_SUBSIDY  = 3.125;   // BTC/block — halve at the 2028 halving
  const ELEC_RATE      = 0.05;    // $/kWh on (W/TH × TH × 24h)
  const SERVICE_RATE   = 0.0089;  // $/TH/day platform service fee
  const EFF_BEST       = 12;      // best efficiency purchasable now (W/TH)
  const EFF_BASE_MAX   = 15;      // cheaper marketplace hashrate (W/TH)
  // % — GMT locked-staking APR (observed 2026-10-07). Kept in step with STAKING_APR in
  // scripts/constants.js and inLockAPR in console/index.html so the cluster agrees.
  const STAKE_APR0     = 21.7;
  const MINING_MODE    = 1.32;    // % — solo mining discount (console inMiningMode, observed 2026-10-07)
  const CLICK_STREAK   = 3;       // % — daily click streak, binary once the 10-day streak is held
  const FB = { btc: 84000, gmt: 0.28, diff: 113e12 };

  // $/TH for newly minted 12 W/TH hashrate, pre-avatar-discount.
  const TH_TIERS_12W = [
  {th:1,cpt:19.00},{th:2,cpt:18.91},{th:4,cpt:18.80},{th:8,cpt:18.75},
  {th:16,cpt:18.62},{th:32,cpt:18.53},{th:48,cpt:18.44},{th:64,cpt:18.33},
  {th:96,cpt:18.24},{th:128,cpt:18.15},{th:192,cpt:18.05},{th:256,cpt:17.96},
  {th:384,cpt:17.87},{th:512,cpt:17.78},{th:768,cpt:17.68},{th:1024,cpt:17.60},
  {th:1536,cpt:17.51},{th:2560,cpt:17.42},{th:3584,cpt:17.34},{th:5000,cpt:17.24}
];

  // VIP tiers — qualify on hashrate OR locked GMT, whichever lifts you higher.
  const TIERS = [
    { n: 'Bronze I', th: 0, veg: 0, d: 0 }, { n: 'Bronze II', th: 5, veg: 50, d: .3 },
    { n: 'Silver I', th: 10, veg: 100, d: .6 }, { n: 'Silver II', th: 25, veg: 250, d: .9 },
    { n: 'Silver III', th: 50, veg: 500, d: 1.2 }, { n: 'Gold I', th: 100, veg: 1000, d: 1.5 },
    { n: 'Gold II', th: 200, veg: 2000, d: 1.8 }, { n: 'Platinum I', th: 500, veg: 5000, d: 2.1 },
    { n: 'Platinum II', th: 1000, veg: 10000, d: 2.4 }, { n: 'Platinum III', th: 2500, veg: 25000, d: 2.7 },
    { n: 'Diamond I', th: 5000, veg: 50000, d: 3.0 }, { n: 'Diamond II', th: 7000, veg: 70000, d: 3.3 },
    { n: 'Diamond III', th: 9000, veg: 90000, d: 3.6 }, { n: 'Diamond IV', th: 12000, veg: 120000, d: 3.9 },
    { n: 'Diamond V', th: 20000, veg: 200000, d: 4.2 }
  ];
  const vipOf = (th, veg) => { let t = TIERS[0]; for (const x of TIERS) if (th >= x.th || veg >= x.veg) t = x; return t; };


  // 15 W/TH curve — cheaper, less efficient hashrate. Mirrors TH_TIERS in assets/app.js.
  // Repriced 2026-07-30 from all twenty tiers, grossed up /0.95 from quotes net of a 5%
  // NFT discount. Needed here because this widget lets the user enter their own W/TH:
  // pricing a 15 W farm off the 12 W curve overstated its capital by ~60%.
  const TH_TIERS_15W = [
  {th:1,cpt:11.49},{th:2,cpt:11.47},{th:4,cpt:11.46},{th:8,cpt:11.44},
  {th:16,cpt:11.41},{th:32,cpt:11.39},{th:48,cpt:11.37},{th:64,cpt:11.36},
  {th:96,cpt:11.33},{th:128,cpt:11.31},{th:192,cpt:11.27},{th:256,cpt:11.25},
  {th:384,cpt:11.22},{th:512,cpt:11.20},{th:768,cpt:11.17},{th:1024,cpt:11.14},
  {th:1536,cpt:11.11},{th:2560,cpt:11.07},{th:3584,cpt:11.04},{th:5000,cpt:11.02}
];

  function cptOf(th, T) {
    if (th <= 0) return T[0].cpt;
    if (th >= T[T.length - 1].th) return T[T.length - 1].cpt;
    for (let i = 0; i < T.length - 1; i++) {
      const lo = T[i], hi = T[i + 1];
      if (th >= lo.th && th <= hi.th) return lo.cpt + (hi.cpt - lo.cpt) * ((th - lo.th) / (hi.th - lo.th));
    }
    return T[0].cpt;
  }
  const cpt12 = th => cptOf(th, TH_TIERS_12W);
  const cpt15 = th => cptOf(th, TH_TIERS_15W);
  // $/TH at the efficiency the user actually entered. Interpolated linearly in W between
  // the two published curves, clamped outside them — 12 W hashrate genuinely costs ~46%
  // more per TH than 15 W, so charging one price for both distorts the capital that every
  // rate on this widget is divided by.
  function cptAtEff(th, wth) {
    const w = Math.min(Math.max(wth || EFF_BEST, EFF_BEST), EFF_BASE_MAX);
    const f = (w - EFF_BEST) / (EFF_BASE_MAX - EFF_BEST);
    return cpt12(th) * (1 - f) + cpt15(th) * f;
  }

  // ---- market data ----
  const S = { btc: 0, gmt: 0, diff: 0, satsPerTHDay: 0, live: false };
  function fetchTO(url, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal })
      .then(r => { clearTimeout(id); if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(e => { clearTimeout(id); throw e; });
  }
  async function btcPrice() {
    try { const r = await fetchTO('https://api.coinpaprika.com/v1/tickers/btc-bitcoin'); const p = +r?.quotes?.USD?.price; if (p > 0) return p; } catch (e) {}
    try { const r = await fetchTO('https://mempool.space/api/v1/prices'); const p = +r?.USD; if (p > 0) return p; } catch (e) {}
    return 0;
  }
  async function gmtPrice() {
    try { const r = await fetchTO('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token'); const p = +r?.quotes?.USD?.price; if (p > 0) return p; } catch (e) {}
    try { const r = await fetchTO('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd'); const p = +r?.['gmt-token']?.usd; if (p > 0) return p; } catch (e) {}
    return 0;
  }
  async function loadMarket() {
    const [b, g] = await Promise.all([btcPrice(), gmtPrice()]);
    S.btc = b > 0 ? b : FB.btc;
    S.gmt = g > 0 ? g : FB.gmt;
    let diffOk = false;
    try {
      const h = await fetchTO('https://mempool.space/api/v1/mining/hashrate/3d');
      if (h?.currentDifficulty > 0) { S.diff = h.currentDifficulty; diffOk = true; }
    } catch (e) {}
    if (!diffOk) S.diff = FB.diff;
    // Subsidy-only issuance per TH — matches what the GoMining app quotes.
    S.satsPerTHDay = ((1e12 * 86400 * BLOCK_SUBSIDY) / (S.diff * 2 ** 32)) * 1e8;
    S.live = b > 0 && g > 0 && diffOk;
  }

  // ---- the model ----
  // Returns today's economics plus cumulative earnings at each year mark.
  function model(th, wth, gmtLocked, apr0, streak) {
    const bp = S.btc, gp = S.gmt;
    const dbt0 = Math.round(S.satsPerTHDay) / 1e8;            // BTC/TH/day, rounded like the app
    const feeUSDperTH = (ELEC_RATE * 24 * wth) / 1000 + SERVICE_RATE;
    const feesUSD = feeUSDperTH * th;                          // daily, pre-discount

    // Discount: VIP tier bonus, then the GMT coverage discount in 1% steps.
    // Non-token discounts stack before coverage, matching calc() in app.js:
    // nonTokD = min(30, VIP bonus + click streak + mining mode + other).
    const vip = vipOf(th, gmtLocked);
    const cb = streak ? CLICK_STREAK : 0;
    const nonTok = Math.min(30, vip.d + cb + MINING_MODE);
    const feesGMT = gp > 0 ? (feesUSD * (1 - nonTok / 100)) / gp : 0;
    const cov = feesGMT > 0 ? gmtLocked / feesGMT : (gmtLocked > 0 ? Infinity : 0);
    const tok = cov < 18 ? 0 : Math.min(20, Math.floor(cov / 18));
    const totD = Math.min(30, tok + nonTok);
    const gmtFor20 = feesGMT * 360;                            // 360 coverage days = the 20% cap

    // What this setup costs to build from scratch, at live prices. Total-capital model:
    // the GMT you must lock to hold the discount counts as invested capital. Matches
    // gen-pages.js totalCapital (which excludes USD_GMT_FEE — kept consistent deliberately).
    const thCost = th * cptAtEff(th, wth);
    const lockCost = gmtLocked * gp;
    const invested = thCost + lockCost;

    const grossToday = dbt0 * th * bp;
    const stakedUSD = gmtLocked * gp;                          // lock value, pre-fee
    const miningToday = (grossToday - feesUSD * (1 - totD / 100)) * (1 - CONVERSION_FEE);
    const stakingToday = stakedUSD * (apr0 / 100) / 365.25;
    const netToday = miningToday + stakingToday;

    // Project forward on TOTAL capital (hashrate + GMT lock), matching the model the
    // /gomining-*-th-roi pages publish: BTC on the rainbow Still-cheap path, mining reward eroded by
    // halvings and the difficulty grind (floored at the network no-arbitrage break-even),
    // mining clamped at >=0 (a rational operator stops rather than pays fees at a loss),
    // and staking valued at today's GMT price rather than marked up with BTC.
    // Mining margin at zero is the teaching case: with no discount you ARE the
    // marginal miner the reward floor is defined by. Checked at today's rates only —
    // this widget answers "what does this earn now", never "what will it earn".
    const miningDead = netToday <= 0 || miningToday <= 0;
    const yieldPct = invested > 0 ? (netToday * 365.25 / invested) * 100 : 0;
    return { dbt0, feesUSD, totD, tok, nonTok, vip, gmtFor20, invested, thCost, lockCost,
             netToday, miningToday, stakingToday, grossToday, miningDead, yieldPct, bp, gp };
  }

  // ---- render ----
  const $ = id => document.getElementById(id);
  // Language: the /embed page sets window.RE_LANG and window.RE_I18N from ?lang=. Every
  // other page that loads this file stays English, exactly as before.
  const LANG = window.RE_LANG || 'en';
  const LOCALE = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' }[LANG] || 'en-US';
  const NB = '\u00a0';
  const num = (n, d = 0) => n.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = n => { const d = Math.abs(n) < 100 ? 2 : 0; const s = num(Math.abs(n), d);
    return (n < 0 ? '-' : '') + (LANG === 'en' ? '$' + s : s + NB + '$'); };
  const pct = (n, d = 0) => num(n, d) + (LANG === 'en' ? '%' : NB + '%');
  // Dollar-mode copy. English lives here; other languages come from the /embed page.
  const EN = {
    cached: ' (cached)',
    minBuy: (p, w) => 'The smallest buy is 1 TH, about ' + p + ' at ' + w + ' W/TH, and with RINGO5 that first TH is paid back to you.',
    split: (a, b) => a + ' mining + ' + b + ' staking',
    afterFees: 'mining, after fees',
    ofA: (p, a) => p + ' of ' + a + ' · at today\'s rates',
    lock: ' GMT lock', streak: ' click streak', solo: ' solo',
    costSub: 'first TH + 10% back with RINGO5',
    hint: o => o.A + ' buys <b>' + o.th + ' TH</b> at ' + o.wth + ' W/TH' +
      (o.lock ? ' plus <b>' + o.gmt + ' GMT</b> locked for the 20% fee discount' : '') +
      ', and RINGO5 adds <b>' + o.bonus + ' bonus TH</b> on top. ' +
      (o.lock ? 'That split earns more than putting it all into hashrate at today\'s prices.'
              : 'At today\'s prices, all hashrate earns more than locking GMT for the discount.') +
      ' After ' + o.cash + ' cash back, it costs you ' + o.net + '.'
  };
  const tx = (k, ...a) => { const v = (window.RE_I18N && window.RE_I18N[k]) || EN[k]; return typeof v === 'function' ? v(...a) : v; };


  // ---- dollar mode (/embed only, switched on by a #re-usd input) ----
  // The embed quotes PROSPECTIVE referrals: they have a budget, not a farm. The budget is
  // priced two ways — all hashrate, or hashrate plus the GMT that holds the 20% discount —
  // and the better one at today's prices is shown (the optimum is always one of those two
  // corners, never a split in between). The RINGO5 terms are counted in.
  const REF_BONUS_TH     = 0.05;    // +5% bonus TH on the first miner, from GoMining via the referral code…
  const REF_BONUS_CAP    = 25;      // …capped at 25 TH (docs.gomining.com referral program)
  const bonusOf = th => Math.min(th * REF_BONUS_TH, REF_BONUS_CAP);
  const REF_FIRST_TH     = 18.99;   // first TH reimbursed by Ringo
  const REF_CASHBACK     = 0.10;    // 10% back on hashrate purchases…
  const REF_CASHBACK_CAP = 10000;   // …up to $10,000 spent ($1,000 back)

  // TH the budget buys. Cost is monotonic in TH, so bisect.
  function thForBudget(budget, wth, withLock) {
    const cost = th => th * cptAtEff(th, wth) + (withLock
      ? model(th + bonusOf(th), wth, 0, 0, true).gmtFor20 * S.gmt * (1 + USD_GMT_FEE) : 0);
    let lo = 0, hi = budget / 10;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (cost(mid) > budget) hi = mid; else lo = mid; }
    return lo;
  }
  function planFor(budget, wth, withLock, apr) {
    const th = thForBudget(budget, wth, withLock);
    const thTot = th + bonusOf(th);
    const gmt = withLock ? Math.ceil(model(thTot, wth, 0, 0, true).gmtFor20) : 0;
    return { th, thTot, gmt, withLock, m: model(thTot, wth, gmt, apr, true) };
  }

  function renderUSD() {
    const A = Math.max(0, parseFloat($('re-usd').value) || 0);
    const wth = Math.max(EFF_BEST, parseFloat($('re-wth').value) || EFF_BEST);
    const apr = Math.max(0, parseFloat($('re-apr').value) || 0);
    const basis = 'BTC ' + money(S.btc) + ' · GMT $' + num(S.gmt, 3) + ' · ' +
      num(Math.round(S.satsPerTHDay), 0) + ' sats/TH/day' + (S.live ? '' : tx('cached'));
    $('re-basis').textContent = basis;
    const minBuy = cptAtEff(1, wth);
    const hintEl = $('re-hint');
    if (A < minBuy) {
      ['re-net', 're-disc', 're-be', 're-cost'].forEach(id => { $(id).textContent = '—'; });
      // Nothing entered yet: the heading already says what to do, so no prompt box.
      hintEl.style.display = A > 0 ? '' : 'none';
      hintEl.textContent = A > 0 ? tx('minBuy', money(minBuy), num(wth, 1)) : '';
      return;
    }
    hintEl.style.display = '';
    const a = planFor(A, wth, false, apr), b = planFor(A, wth, true, apr);
    const p = (b.th >= 1 && b.m.netToday > a.m.netToday) ? b : a;
    const m = p.m, net = m.netToday;
    const thSpend = p.th * cptAtEff(p.th, wth);
    const cash = REF_FIRST_TH + REF_CASHBACK * Math.min(thSpend, REF_CASHBACK_CAP);

    $('re-be').textContent = money(net * 30.44);
    $('re-be-sub').textContent = m.stakingToday > 0
      ? tx('split', money(m.miningToday * 30.44), money(m.stakingToday * 30.44))
      : tx('afterFees');
    $('re-net').textContent = money(net * 365.25);
    $('re-net-sub').textContent = tx('ofA', pct(net * 365.25 / A * 100, 1), money(A));
    $('re-disc').textContent = pct(m.totD, 1);
    const parts = [];
    if (m.tok > 0) parts.push(pct(m.tok) + tx('lock'));
    if (m.vip.d > 0) parts.push(pct(m.vip.d, 1) + ' ' + m.vip.n);
    parts.push(pct(CLICK_STREAK) + tx('streak'));
    if (MINING_MODE > 0) parts.push(pct(MINING_MODE, 2) + tx('solo'));
    $('re-disc-sub').textContent = parts.join(' + ');
    $('re-cost').textContent = money(cash);
    $('re-cost-sub').textContent = tx('costSub');

    hintEl.innerHTML = tx('hint', { A: money(A), th: num(p.th, 1), wth: num(wth, 1), lock: p.withLock,
      gmt: num(p.gmt, 0), bonus: num(p.thTot - p.th, 1), cash: money(cash), net: money(A - cash) });
  }

  function render() {
    if ($('re-usd')) return renderUSD();
    const th = Math.max(0, parseFloat($('re-th').value) || 0);
    const wth = Math.max(EFF_BEST, parseFloat($('re-wth').value) || EFF_BEST);
    const gl = Math.max(0, parseFloat($('re-gmt').value) || 0);
    const apr = Math.max(0, parseFloat($('re-apr').value) || 0);
    const streak = !!$('re-streak').checked;
    if (th <= 0) {
      // Empty state (the /embed page starts at 0 TH): live basis line, blank tiles, a prompt.
      ['re-net', 're-disc', 're-be', 're-cost'].forEach(id => { $(id).textContent = '—'; });
      $('re-hint').textContent = 'Enter your hashrate (TH) to see what it earns today.';
      $('re-basis').textContent = 'BTC ' + money(S.btc) + ' · GMT $' + num(S.gmt, 3) + ' · ' +
        num(Math.round(S.satsPerTHDay), 0) + ' sats/TH/day' + (S.live ? '' : ' (cached)');
      return;
    }

    const m = model(th, wth, gl, apr, streak);
    $('re-net').textContent = money(m.netToday * 30.44);
    $('re-disc').textContent = num(m.totD, 1) + '%';
    $('re-be').textContent = money(m.netToday);
    $('re-be-sub').textContent = num(m.yieldPct, 1) + '% a year on capital';
    $('re-cost').textContent = money(m.invested);
    $('re-net-sub').textContent = m.stakingToday > 0
      ? money(m.miningToday * 30.44) + ' mining + ' + money(m.stakingToday * 30.44) + ' staking'
      : 'after fees & discount';

    const parts = [];
    if (m.tok > 0) parts.push(m.tok + '% GMT coverage');
    if (m.vip.d > 0) parts.push(num(m.vip.d, 1) + '% ' + m.vip.n);
    if (streak) parts.push(CLICK_STREAK + '% click streak');
    if (MINING_MODE > 0) parts.push(num(MINING_MODE, 2) + '% mining mode');
    $('re-disc-sub').textContent = parts.length ? parts.join(' + ') : 'no GMT locked yet';

    // The lever the site is actually about: what it takes to max the discount.
    // Mining margin reaching zero is the important teaching moment — with no
    // discount you ARE the marginal miner the reward floor is defined by.
    const hint = $('re-hint');
    const need = Math.max(0, m.gmtFor20 - gl);
    if (m.miningDead && m.tok < 20) {
      hint.textContent = 'This stops earning — without the GMT discount your mining margin decays to zero as difficulty ' +
        'rises, because you are exactly the marginal miner the network prices for. Locking ' + num(m.gmtFor20, 0) +
        ' GMT (~' + money(m.gmtFor20 * m.gp * (1 + USD_GMT_FEE)) + ') for the full 20% discount is what makes this setup viable.';
    } else if (m.tok >= 20) {
      hint.textContent = 'You are at the 20% maximum token discount — extra GMT past this only lifts your VIP tier. ' +
        'The discount is saving you ' + money(m.feesUSD * (m.totD / 100) * 30.44) + '/mo at this size.';
    } else {
      hint.textContent = 'Lock ' + num(need, 0) + ' more GMT (~' + money(need * m.gp * (1 + USD_GMT_FEE)) +
        ') to reach the 20% maximum electricity discount — worth ' +
        money(m.feesUSD * 0.20 * 30.44) + '/mo at this size.';
    }

    $('re-basis').textContent = 'BTC ' + money(m.bp) + ' · GMT $' + num(m.gp, 3) + ' · ' +
      num(Math.round(S.satsPerTHDay), 0) + ' sats/TH/day' + (S.live ? '' : ' (cached)');
    $('re-cost-sub').textContent = num(th, 0) + ' TH @ ' + money(cptAtEff(th, wth)) + '/TH' + (m.lockCost > 0 ? ' + GMT lock' : '');
  }

  // Until the visitor touches the GMT field, keep it parked at the amount that
  // holds the full 20% discount. First paint then shows the setup we'd actually
  // recommend rather than an unfunded one whose margin decays to zero.
  let gmtTouched = false;
  function autoFillGMT() {
    if (gmtTouched || $('re-usd')) return;
    const th = Math.max(0, parseFloat($('re-th').value) || 0);
    const wth = Math.max(EFF_BEST, parseFloat($('re-wth').value) || EFF_BEST);
    if (th <= 0) return;
    const m = model(th, wth, 0, STAKE_APR0, !!$('re-streak').checked);
    $('re-gmt').value = String(Math.ceil(m.gmtFor20));
  }

  function init() {
    const root = $('roi-embed');
    if (!root) return;
    ['re-th', 're-wth', 're-apr', 're-usd'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => { autoFillGMT(); render(); });
    });
    const st = $('re-streak');
    if (st) st.addEventListener('change', () => { autoFillGMT(); render(); });
    const g = $('re-gmt');
    if (g) g.addEventListener('input', () => { gmtTouched = true; render(); });
    // The APR field's HTML value is only a placeholder: seed it from STAKE_APR0 so a rate
    // update is one constant, not a hunt through every page that hosts the widget. A field
    // carrying data-preset (the /embed page, from its URL) keeps the host's number, and a
    // preset GMT amount counts as the visitor's own so autoFillGMT leaves it alone.
    const a = $('re-apr');
    if (a && !a.hasAttribute('data-preset')) a.value = String(STAKE_APR0);
    if (g && g.hasAttribute('data-preset')) gmtTouched = true;
    loadMarket().then(() => {
      root.classList.remove('re-loading');
      autoFillGMT();
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
