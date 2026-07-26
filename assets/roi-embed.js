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
  // Year marks the earnings figures are quoted at — mirrors YEAR_MARKS in scripts/gen-pages.js.
  const YEAR_MARKS     = [1, 3, 5, 10];
  // % — GMT locked-staking APR (observed 2026-07-26). Kept in step with STAKING_APR in
  // scripts/gen-pages.js and inLockAPR in console/index.html so the cluster agrees.
  const STAKE_APR0     = 21.73;
  const MINING_MODE    = 0.83;    // % — mining-mode discount (console inMiningMode, observed 2026-07-26)
  const CLICK_STREAK   = 3;       // % — daily click streak, binary once the 10-day streak is held
  const FB = { btc: 84000, gmt: 0.28, diff: 113e12 };

  // $/TH for newly minted 12 W/TH hashrate, pre-avatar-discount.
  const TH_TIERS_12W = [
    { th: 1, cpt: 19.99 }, { th: 2, cpt: 19.71 }, { th: 4, cpt: 19.44 }, { th: 8, cpt: 19.16 },
    { th: 16, cpt: 18.88 }, { th: 32, cpt: 18.61 }, { th: 48, cpt: 18.44 }, { th: 64, cpt: 18.33 },
    { th: 96, cpt: 18.22 }, { th: 128, cpt: 18.15 }, { th: 192, cpt: 18.04 }, { th: 256, cpt: 17.96 },
    { th: 384, cpt: 17.86 }, { th: 512, cpt: 17.78 }, { th: 768, cpt: 17.68 }, { th: 1024, cpt: 17.62 },
    { th: 1536, cpt: 17.52 }, { th: 2560, cpt: 17.40 }, { th: 3584, cpt: 17.32 }, { th: 5000, cpt: 17.24 }
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

  // Reward decay — halvings plus the continuous difficulty grind, floored at the
  // network's no-arbitrage break-even (difficulty is an equilibrium; it can't
  // decay past the point where the marginal miner capitulates).
  const HALVINGS = [Date.UTC(2028, 3, 15), Date.UTC(2032, 3, 15), Date.UTC(2036, 3, 15), Date.UTC(2040, 3, 15)];
  const DIFF_G0 = 0.25, DIFF_FLOOR = 0.05, DIFF_TAU = 4;
  const subsidyMultAt = t => { let m = 1; for (const h of HALVINGS) if (t >= h) m *= 0.5; return m; };
  function difficultyMultAt(t) {
    const yrs = (t - Date.now()) / (365.25 * 86400000);
    if (yrs <= 0) return 1;
    const integral = DIFF_FLOOR * yrs + (DIFF_G0 - DIFF_FLOOR) * DIFF_TAU * (1 - Math.exp(-yrs / DIFF_TAU));
    return 1 / Math.exp(integral);
  }
  const rewardFloorBTC = p => p > 0 ? (0.0012 * EFF_BEST + 0.0089) / p : 0;

  function cpt12(th) {
    const T = TH_TIERS_12W;
    if (th <= 0) return T[0].cpt;
    if (th >= T[T.length - 1].th) return T[T.length - 1].cpt;
    for (let i = 0; i < T.length - 1; i++) {
      const lo = T[i], hi = T[i + 1];
      if (th >= lo.th && th <= hi.th) return lo.cpt + (hi.cpt - lo.cpt) * ((th - lo.th) / (hi.th - lo.th));
    }
    return T[0].cpt;
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
    const thCost = th * cpt12(th);
    const lockCost = gmtLocked * gp;
    const invested = thCost + lockCost;

    const grossToday = dbt0 * th * bp;
    const stakedUSD = gmtLocked * gp;                          // lock value, pre-fee
    const miningToday = (grossToday - feesUSD * (1 - totD / 100)) * (1 - CONVERSION_FEE);
    const stakingToday = stakedUSD * (apr0 / 100) / 365.25;
    const netToday = miningToday + stakingToday;

    // Project forward on TOTAL capital (hashrate + GMT lock), matching the model the
    // /gomining-*-th-roi pages publish: BTC and GMT held flat, mining reward eroded by
    // halvings and the difficulty grind (floored at the network no-arbitrage break-even),
    // mining clamped at >=0 (a rational operator stops rather than pays fees at a loss),
    // and staking held flat since the GMT price is held flat.
    let cum = 0, lastMining = 0;
    const earn = [];
    const now = Date.now();
    for (let d = 1; d <= 3650; d++) {
      const t = now + d * 86400000;
      const dbt = Math.max(dbt0 * subsidyMultAt(t) * difficultyMultAt(t), rewardFloorBTC(bp));
      const mining = Math.max(0, dbt * th * bp - feesUSD * (1 - totD / 100)) * (1 - CONVERSION_FEE);
      cum += mining + stakingToday;
      lastMining = mining;
      if (d % 365 === 0 && YEAR_MARKS.indexOf(d / 365) >= 0) {
        const day = mining + stakingToday;
        earn.push({ years: d / 365, total: cum, daily: day, monthly: day * 30.44, yearly: day * 365.25 });
      }
    }
    // Mining margin hitting zero is the teaching case, not a payback failure: with
    // no discount you ARE the marginal miner the reward floor is defined by.
    const miningDead = lastMining <= 0;
    return { dbt0, feesUSD, totD, tok, nonTok, vip, gmtFor20, invested, thCost, lockCost,
             netToday, miningToday, stakingToday, grossToday, earn, miningDead, bp, gp };
  }

  // ---- render ----
  const $ = id => document.getElementById(id);
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
  const num = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const atYear = (rows, y) => { for (let i = 0; i < rows.length; i++) if (rows[i].years === y) return rows[i]; return null; };

  function render() {
    const th = Math.max(0, parseFloat($('re-th').value) || 0);
    const wth = Math.max(EFF_BEST, parseFloat($('re-wth').value) || EFF_BEST);
    const gl = Math.max(0, parseFloat($('re-gmt').value) || 0);
    const apr = Math.max(0, parseFloat($('re-apr').value) || 0);
    const streak = !!$('re-streak').checked;
    if (th <= 0) return;

    const m = model(th, wth, gl, apr, streak);
    const e5 = atYear(m.earn, 5);

    $('re-net').textContent = money(m.netToday * 30.44);
    $('re-disc').textContent = num(m.totD, 1) + '%';
    $('re-be').textContent = money(e5.total);
    $('re-be-sub').textContent = 'then on ' + money(e5.monthly) + '/mo';
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
    $('re-cost-sub').textContent = num(th, 0) + ' TH @ ' + money(cpt12(th)) + '/TH' + (m.lockCost > 0 ? ' + GMT lock' : '');
  }

  // Until the visitor touches the GMT field, keep it parked at the amount that
  // holds the full 20% discount. First paint then shows the setup we'd actually
  // recommend rather than an unfunded one whose margin decays to zero.
  let gmtTouched = false;
  function autoFillGMT() {
    if (gmtTouched) return;
    const th = Math.max(0, parseFloat($('re-th').value) || 0);
    const wth = Math.max(EFF_BEST, parseFloat($('re-wth').value) || EFF_BEST);
    if (th <= 0) return;
    const m = model(th, wth, 0, STAKE_APR0, !!$('re-streak').checked);
    $('re-gmt').value = String(Math.ceil(m.gmtFor20));
  }

  function init() {
    const root = $('roi-embed');
    if (!root) return;
    ['re-th', 're-wth', 're-apr'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => { autoFillGMT(); render(); });
    });
    const st = $('re-streak');
    if (st) st.addEventListener('change', () => { autoFillGMT(); render(); });
    const g = $('re-gmt');
    if (g) g.addEventListener('input', () => { gmtTouched = true; render(); });
    loadMarket().then(() => {
      root.classList.remove('re-loading');
      autoFillGMT();
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
