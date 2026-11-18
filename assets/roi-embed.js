/* GMT-Optimizer — inline ROI / earnings calculator for the content pages.
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
// Prices come from assets/pricing.js (the single source). Pages load it first; if one didn't,
// fetch it from next to this script before running, so the widget never prices off nothing.
(function (run) {
  const me = document.currentScript, base = me && me.src ? me.src : location.origin + '/assets/';
  const need = [['GMT_PRICING', 'pricing.js'], ['GMTMining', '../lib/mining.js']].filter(([g]) => !window[g]);
  (function next() {
    if (!need.length) return run();
    const [, file] = need.shift(), s = document.createElement('script');
    s.src = new URL(file, base).href; s.onload = next; document.head.appendChild(s);
  })();
})(function () {
  'use strict';
  const P = window.GMT_PRICING;   // TH tiers (sale applied), efficiency ratings, upgrade steps
  const C = window.GMT_CONFIG;    // data/config.json: fees, rates, discount rules, VIP tiers, RINGO5 terms
  const M = window.GMTMining;     // lib/mining.js: the pure, tested maths

  // ---- calibration: all from data/config.json ----
  const CONVERSION_FEE = C.fees.btcToGmtConversion;
  const USD_GMT_FEE    = C.fees.usdToGmt;
  const BLOCK_SUBSIDY  = C.network.blockSubsidyBtc;
  const ELEC_RATE      = C.fees.electricityUsdPerKwh;
  const SERVICE_RATE   = C.fees.serviceUsdPerThDay;
  const EFF_BEST       = P.EFF_BEST;      // best efficiency reachable, by upgrading a 15 W miner (W/TH)
  const EFF_BASE_MAX   = P.EFF_BASE_MAX;      // cheaper marketplace hashrate (W/TH)
  const STAKE_APR0     = C.rates.stakingAprPct;          // % GMT locked-staking APR
  const MINING_MODE    = C.rates.soloMiningDiscountPct;  // % solo mining discount
  const CLICK_STREAK   = C.rates.clickStreakPct;         // % daily click streak
  const COV_DAYS = C.discount.coverageDaysPerPct, TOK_CAP = C.discount.tokenCapPct, TOT_CAP = C.discount.totalCapPct;
  const FB = { btc: 84000, gmt: 0.28, diff: 113e12 };

  const TH_TIERS_12W = P.TH_TIERS_12W;

  // VIP tiers — qualify on hashrate OR locked GMT, whichever lifts you higher.
  const TIERS = C.vipTiers;   // VIP tiers: data/config.json
  const vipOf = (th, veg) => { let t = TIERS[0]; for (const x of TIERS) if (th >= x.th || veg >= x.veg) t = x; return t; };


  const TH_TIERS_15W = P.TH_TIERS_15W;

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
    // Today's picture from the shared library: fees, VIP tier, coverage → token discount, net mining, staking.
    const f = M.farmToday({ th, wth, lockedGmt: gmtLocked, aprPct: apr0, clickStreak: streak, btcPrice: bp, gmtPrice: gp, satsPerTH: S.satsPerTHDay }, C);
    // Total-capital model: the GMT you lock to hold the discount counts as invested capital
    // (matches gen-pages.js totalCapital, which excludes USD_GMT_FEE, kept consistent deliberately).
    const thCost = th * cptAtEff(th, wth);
    const lockCost = gmtLocked * gp;
    const invested = thCost + lockCost;
    // Checked at today's rates only: this widget answers "what does this earn now", never "what will it earn".
    const miningDead = f.net <= 0 || f.mining <= 0;
    const yieldPct = invested > 0 ? (f.net * 365.25 / invested) * 100 : 0;
    return { dbt0: f.btcPerTH, feesUSD: f.feesUsd, totD: f.totD, tok: f.tok, nonTok: f.nonTok, vip: f.vip, gmtFor20: f.gmtForFull,
             invested, thCost, lockCost, netToday: f.net, miningToday: f.mining, stakingToday: f.staking, grossToday: f.grossUsd,
             miningDead, yieldPct, bp, gp };
  }

  // ---- render ----
  const $ = id => document.getElementById(id);
  // Language: the /embed page sets window.RE_LANG and window.RE_I18N from ?lang=. Other pages follow
  // <html lang> (the /es/, /fr/, /de/ copies); farm-mode text for those lives in FARM below.
  const LANG = window.RE_LANG || ({ es: 1, fr: 1, de: 1 }[(document.documentElement.lang || '').slice(0, 2)] ? document.documentElement.lang.slice(0, 2) : 'en');
  const LOCALE = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' }[LANG] || 'en-US';
  const NB = '\u00a0';
  const num = (n, d = 0) => n.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = n => { const d = Math.abs(n) < 100 ? 2 : 0; const s = num(Math.abs(n), d);
    return (n < 0 ? '-' : '') + (LANG === 'en' ? '$' + s : s + NB + '$'); };
  const pct = (n, d = 0) => num(n, d) + (LANG === 'en' ? '%' : NB + '%');
  // Dollar-mode copy. English lives here; other languages come from the /embed page.
  const EN = {
    cached: ' (cached)',
    minBuy: (p, w) => 'The smallest buy is 1 TH, about ' + p + ' at ' + w + ' W/TH, and RINGO5 adds 5% bonus TH on your first miner.',
    split: (a, b) => a + ' mining + ' + b + ' staking',
    afterFees: 'mining, after fees',
    ofA: (p, a) => p + ' of ' + a + ' · at today\'s rates',
    lock: ' GMT lock', streak: ' click streak', solo: ' solo',
    costSub: 'bonus TH on your first miner',
    yearCap: p => p + '% a year on capital',
    yearCapEst: p => '\u2248' + p + '% est. yearly at today\u2019s rates',   // the landing quick estimate (window.RE_YEARCAP = 'estimate')
    // farm mode (landing, /gomining-roi-calculator, /is-gomining-worth-it)
    fSplit: (a, b) => a + ' mining + ' + b + ' staking',
    fAfter: 'after fees & discount',
    fCov: p => p + ' GMT coverage', fStreak: p => p + ' click streak', fMode: p => p + ' mining mode',
    fNone: 'no GMT locked yet',
    fDead: o => 'This stops earning — without the GMT discount your mining margin decays to zero as difficulty ' +
      'rises, because you are exactly the marginal miner the network prices for. Locking ' + o.gmt +
      ' GMT (~' + o.usd + ') for the full ' + o.cap + '% discount is what makes this setup viable.',
    fMax: o => 'You are at the ' + o.cap + '% maximum token discount — extra GMT past this only lifts your VIP tier. ' +
      'The discount is saving you ' + o.save + '/mo at this size.',
    fLock: o => 'Lock ' + o.need + ' more GMT (~' + o.usd + ') to reach the ' + o.cap + '% maximum electricity discount — worth ' +
      o.worth + '/mo at this size.',
    fBasis: s => s + ' sats/TH/day',
    fCost: (th, p, lock) => th + ' TH @ ' + p + '/TH' + (lock ? ' + GMT lock' : ''),
    hint: o => o.A + ' buys <b>' + o.th + ' TH</b> at ' + o.wth + ' W/TH' +
      (o.lock ? ' plus <b>' + o.gmt + ' GMT</b> locked for the 20% fee discount' : '') +
      ', and RINGO5 adds <b>' + o.bonus + ' bonus TH</b> on top. ' +
      (o.lock ? 'That split earns more than putting it all into hashrate at today\'s prices.'
              : 'At today\'s prices, all hashrate earns more than locking GMT for the discount.')
  };
  // Farm-mode text for the translated pages (dollar-mode translations come from the /embed page).
  const FARM = {
    es: {
      yearCap: p => p + ' % al año sobre el capital', yearCapEst: p => '\u2248' + p + ' % anual est. a los precios de hoy',
      fSplit: (a, b) => a + ' minería + ' + b + ' staking', fAfter: 'tras comisiones y descuento',
      fCov: p => p + ' cobertura GMT', fStreak: p => p + ' racha de clics', fMode: p => p + ' modo de minería',
      fNone: 'aún no hay GMT bloqueado',
      fDead: o => 'Esto deja de ganar: sin el descuento GMT tu margen de minería cae a cero a medida que sube la dificultad, porque eres justo el minero marginal que fija el precio de la red. Bloquear ' + o.gmt + ' GMT (~' + o.usd + ') para el descuento completo del ' + o.cap + ' % es lo que hace viable esta configuración.',
      fMax: o => 'Estás en el descuento máximo por token del ' + o.cap + ' %: más GMT a partir de aquí solo sube tu nivel VIP. El descuento te ahorra ' + o.save + '/mes con este tamaño.',
      fLock: o => 'Bloquea ' + o.need + ' GMT más (~' + o.usd + ') para llegar al descuento máximo del ' + o.cap + ' % en electricidad: vale ' + o.worth + '/mes con este tamaño.',
      fBasis: s => s + ' sats/TH/día', fCost: (th, p, lock) => th + ' TH a ' + p + '/TH' + (lock ? ' + bloqueo de GMT' : ''), cached: ' (en caché)'
    },
    fr: {
      yearCap: p => p + ' % par an sur le capital', yearCapEst: p => '\u2248' + p + ' % par an est. aux prix du jour',
      fSplit: (a, b) => a + ' minage + ' + b + ' staking', fAfter: 'après frais et remise',
      fCov: p => p + ' couverture GMT', fStreak: p => p + ' série de clics', fMode: p => p + ' mode de minage',
      fNone: 'aucun GMT bloqué pour l\u2019instant',
      fDead: o => 'Cette configuration cesse de rapporter : sans la remise GMT, votre marge de minage tombe à zéro à mesure que la difficulté monte, car vous êtes exactement le mineur marginal sur lequel le réseau fixe son prix. Bloquer ' + o.gmt + ' GMT (~' + o.usd + ') pour la remise complète de ' + o.cap + ' % est ce qui la rend viable.',
      fMax: o => 'Vous êtes à la remise maximale de ' + o.cap + ' % sur les jetons : des GMT en plus ne font que monter votre niveau VIP. La remise vous fait économiser ' + o.save + '/mois à cette taille.',
      fLock: o => 'Bloquez ' + o.need + ' GMT de plus (~' + o.usd + ') pour atteindre la remise maximale de ' + o.cap + ' % sur l\u2019électricité : elle vaut ' + o.worth + '/mois à cette taille.',
      fBasis: s => s + ' sats/TH/jour', fCost: (th, p, lock) => th + ' TH à ' + p + '/TH' + (lock ? ' + blocage GMT' : ''), cached: ' (en cache)'
    },
    de: {
      yearCap: p => p + ' % pro Jahr aufs Kapital', yearCapEst: p => '\u2248' + p + ' % pro Jahr geschätzt zu heutigen Kursen',
      fSplit: (a, b) => a + ' Mining + ' + b + ' Staking', fAfter: 'nach Gebühren und Rabatt',
      fCov: p => p + ' GMT-Deckung', fStreak: p => p + ' Klick-Serie', fMode: p => p + ' Mining-Modus',
      fNone: 'noch keine GMT gesperrt',
      fDead: o => 'Das verdient bald nichts mehr: Ohne den GMT-Rabatt schrumpft deine Mining-Marge mit steigender Difficulty auf null, weil du genau der Grenz-Miner bist, nach dem sich das Netzwerk richtet. ' + o.gmt + ' GMT (~' + o.usd + ') für den vollen Rabatt von ' + o.cap + ' % zu sperren macht dieses Setup tragfähig.',
      fMax: o => 'Du hast den maximalen Token-Rabatt von ' + o.cap + ' % erreicht: Weitere GMT heben nur noch dein VIP-Level. Der Rabatt spart dir bei dieser Größe ' + o.save + '/Monat.',
      fLock: o => 'Sperre ' + o.need + ' GMT mehr (~' + o.usd + '), um den maximalen Stromrabatt von ' + o.cap + ' % zu erreichen: Das bringt bei dieser Größe ' + o.worth + '/Monat.',
      fBasis: s => s + ' Sats/TH/Tag', fCost: (th, p, lock) => th + ' TH zu je ' + p + '/TH' + (lock ? ' + GMT-Sperre' : ''), cached: ' (zwischengespeichert)'
    }
  }[LANG] || {};
  const tx = (k, ...a) => { const v = (window.RE_I18N && window.RE_I18N[k]) || FARM[k] || EN[k]; return typeof v === 'function' ? v(...a) : v; };


  // ---- dollar mode (/embed only, switched on by a #re-usd input) ----
  // The embed quotes PROSPECTIVE referrals: they have a budget, not a farm. The budget is
  // priced two ways — all hashrate, or hashrate plus the GMT that holds the 20% discount —
  // and the better one at today's prices is shown (the optimum is always one of those two
  // corners, never a split in between). The RINGO5 terms are counted in.
  const REF_BONUS_TH     = C.referral.bonusThPct / 100;   // RINGO5 bonus TH on the first miner…
  const REF_BONUS_CAP    = C.referral.bonusThCap;         // …capped (data/config.json → referral)
  const bonusOf = th => Math.min(th * REF_BONUS_TH, REF_BONUS_CAP);

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

    $('re-be').textContent = money(net * M.DAYS_PER_MONTH);
    $('re-be-sub').textContent = m.stakingToday > 0
      ? tx('split', money(m.miningToday * M.DAYS_PER_MONTH), money(m.stakingToday * M.DAYS_PER_MONTH))
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
    $('re-cost').textContent = '+' + num(p.thTot - p.th, 1) + ' TH';   // the RINGO5 +5% bonus TH (capped at 25 TH)
    $('re-cost-sub').textContent = tx('costSub');

    hintEl.innerHTML = tx('hint', { A: money(A), th: num(p.th, 1), wth: num(wth, 1), lock: p.withLock,
      gmt: num(p.gmt, 0), bonus: num(p.thTot - p.th, 1) });
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
    $('re-net').textContent = money(m.netToday * M.DAYS_PER_MONTH);
    $('re-disc').textContent = pct(m.totD, 1);
    $('re-be').textContent = money(m.netToday);
    $('re-be-sub').textContent = tx(window.RE_YEARCAP === 'estimate' ? 'yearCapEst' : 'yearCap', num(m.yieldPct, 1));
    $('re-cost').textContent = money(m.invested);
    $('re-net-sub').textContent = m.stakingToday > 0
      ? tx('fSplit', money(m.miningToday * M.DAYS_PER_MONTH), money(m.stakingToday * M.DAYS_PER_MONTH))
      : tx('fAfter');

    const parts = [];
    if (m.tok > 0) parts.push(tx('fCov', pct(m.tok)));
    if (m.vip.d > 0) parts.push(pct(m.vip.d, 1) + ' ' + m.vip.n);
    if (streak) parts.push(tx('fStreak', pct(CLICK_STREAK)));
    if (MINING_MODE > 0) parts.push(tx('fMode', pct(MINING_MODE, 2)));
    $('re-disc-sub').textContent = parts.length ? parts.join(' + ') : tx('fNone');

    // The lever the site is actually about: what it takes to max the discount.
    // Mining margin reaching zero is the important teaching moment — with no
    // discount you ARE the marginal miner the reward floor is defined by.
    const hint = $('re-hint');
    const need = Math.max(0, m.gmtFor20 - gl);
    if (m.miningDead && m.tok < TOK_CAP) {
      hint.textContent = tx('fDead', { gmt: num(m.gmtFor20, 0), usd: money(m.gmtFor20 * m.gp * (1 + USD_GMT_FEE)), cap: num(TOK_CAP) });
    } else if (m.tok >= TOK_CAP) {
      hint.textContent = tx('fMax', { cap: num(TOK_CAP), save: money(m.feesUSD * (m.totD / 100) * M.DAYS_PER_MONTH) });
    } else {
      hint.textContent = tx('fLock', { need: num(need, 0), usd: money(need * m.gp * (1 + USD_GMT_FEE)), cap: num(TOK_CAP),
        worth: money(m.feesUSD * (TOK_CAP / 100) * M.DAYS_PER_MONTH) });
    }

    $('re-basis').textContent = 'BTC ' + money(m.bp) + ' · GMT ' + (LANG === 'en' ? '$' + num(m.gp, 3) : num(m.gp, 3) + NB + '$') + ' · ' +
      tx('fBasis', num(Math.round(S.satsPerTHDay), 0)) + (S.live ? '' : tx('cached'));
    $('re-cost-sub').textContent = tx('fCost', num(th, 0), money(cptAtEff(th, wth)), m.lockCost > 0);
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
});
