/* GMT Optimizer — /quote: zero-setup quoting tool for prospective GoMining users.
   =========================================================================
   Answers the two questions you actually get asked on a call — "what does $X
   earn me?" and "what do I need to invest for $Y a month?" — for someone with
   NO existing farm. It is deliberately separate from the console: no fleet, no
   saved setup, nothing here can touch the operator's own numbers.

   The economics core below (constants, tier tables, market fetch, model()) is
   taken verbatim from assets/roi-embed.js. Keep the two in step when
   recalibrating; scripts/constants.js documents the cluster.

   NO LOGIN, ever. This page is what gets sent to a prospect who has never heard of the site,
   so it must render for a logged-out stranger with cookies off and storage blocked. Keep it
   free of account.js, Supabase and localStorage — every number here comes from the inputs on
   screen plus public price APIs, and it still renders on fallback prices when those fail.

   What this ADDS over roi-embed is the allocation solve: given fresh capital
   and no existing hashrate, find the TH / locked-GMT split that holds the
   token discount, which is the same problem solveReferral() answers inside
   assets/app.js. A brand-new user is exactly that case — a farm built from
   zero — so this is the honest engine for it, not a simplification.
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
  // % — GMT locked-staking APR (observed 2026-08-26). Kept in step with STAKING_APR in
  // scripts/constants.js and inLockAPR in console/index.html so the cluster agrees.
  const STAKE_APR0     = 24.26;
  const MINING_MODE    = 1.36;    // % — solo mining discount (console inMiningMode, observed 2026-09-08)
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


  // TH a budget buys on the 12 W curve. Mirrors thForBudgetTiers() in assets/app.js: the tier
  // price depends on the size you end up at, so it is inverted by bisection rather than divided.
  // No avatar discount here — a prospect being quoted does not have one yet.
  function thForBudget12(budget) {
    if (!(budget > 0)) return 0;
    const T = TH_TIERS_12W;
    let lo = 0, hi = budget / T[T.length - 1].cpt;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (mid * cptOf(mid, T) < budget) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  // ---- allocation: fresh capital, no existing farm ----
  // Same shape as solveReferral() in assets/app.js. Every dollar deployed through GMT pays the
  // 2% conversion fee — there is no existing GMT to spend at face value, since this user has
  // none. The lock is solved to the SMALLEST amount that still covers 360 days of fees (the 20%
  // token-discount cap): past that point extra GMT buys no more discount, and hashrate pays
  // better than staking. Below it, coverage is what the discount is made of.
  const COV_DAYS = 360;
  function allocate(capUSD, streak, apr0) {
    if (!(capUSD > 0)) return null;
    const bp = S.btc, gp = S.gmt;
    const at = usd => thForBudget12(usd * (1 - USD_GMT_FEE));
    function trial(gmtUSD) {
      const ag = gmtUSD * (1 - USD_GMT_FEE) / gp;       // GMT locked
      const thUSD = Math.max(0, capUSD - gmtUSD);
      const th = thUSD > 0 ? at(thUSD) : 0;
      const feeUSD = ((ELEC_RATE * 24 * EFF_BEST) / 1000 + SERVICE_RATE) * Math.max(th, 0.0001);
      const vip = vipOf(th, ag);
      const nonTok = Math.min(30, vip.d + (streak ? CLICK_STREAK : 0) + MINING_MODE);
      const burn = gp > 0 ? (feeUSD * (1 - nonTok / 100)) / gp : 0;   // GMT/day
      return { deficit: Math.max(0, burn * COV_DAYS - ag), th, ag, thUSD, gmtUSD };
    }
    let best = trial(0);
    if (best.deficit > 0) {
      let lo = 0, hi = capUSD;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (trial(mid).deficit <= 0) hi = mid; else lo = mid; }
      best = trial(hi);
    }
    const m = model(best.th, EFF_BEST, best.ag, apr0, streak);
    return Object.assign({ capUSD }, best, { m });
  }
  // Capital needed for a target monthly income. Income rises monotonically with capital, so a
  // bisection is exact; the ceiling grows until it overshoots rather than being guessed, so a
  // large target is answered instead of silently clamped.
  function capitalForMonthly(targetMo, streak, apr0) {
    if (!(targetMo > 0)) return null;
    const mo = c => { const a = allocate(c, streak, apr0); return a ? a.m.netToday * 30 : 0; };
    let hi = 10000;
    for (let k = 0; k < 40 && mo(hi) < targetMo; k++) hi *= 1.8;
    if (mo(hi) < targetMo) return null;
    let lo = 0;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (mo(mid) >= targetMo) hi = mid; else lo = mid; }
    return allocate(hi, streak, apr0);
  }

  // ---- page ----
  const $ = id => document.getElementById(id);
  const money = (n, d) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US',
    { maximumFractionDigits: d != null ? d : (Math.abs(n) < 100 ? 2 : 0) });
  const num = (n, d = 0) => (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const APR = 24.26;   // mirrors inLockAPR in console/index.html and STAKING_APR in scripts/constants.js
  // When the tier tables above were last read off the live GoMining app. Mirrors
  // TH_PRICES_ASOF in assets/app.js — update both in the same commit as the prices.
  const TH_PRICES_ASOF = '8 Sep 2026';
  let mode = 'cap';

  function render() {
    try { render_(); }
    catch (e) {
      const out = $('qOut');
      if (out) { out.style.display = 'block'; out.innerHTML = '<div class="headline"><div class="lab">Could not build the quote</div><div class="note">' + String(e && e.message || e) + '</div></div>'; }
    }
  }
  function render_() {
    const out = $('qOut'); if (!out) return;
    const streak = !!($('qStreak') && $('qStreak').checked);
    const a = mode === 'cap'
      ? allocate(Math.max(0, +$('qCap').value || 0), streak, APR)
      : capitalForMonthly(Math.max(0, +$('qInc').value || 0), streak, APR);
    if (!a || !(a.capUSD > 0)) { out.style.display = 'none'; return; }
    // NOT '' — .out carries display:none in the stylesheet, so clearing the inline style
    // re-hides the panel. This built the whole quote and then hid it.
    out.style.display = 'block';
    const m = a.m, mo = m.netToday * 30, yr = m.netToday * 365.25;
    const lockUSD = a.gmtUSD, thUSD = a.thUSD;
    const pct = v => Math.max(0, Math.min(100, a.capUSD > 0 ? v / a.capUSD * 100 : 0));
    // A quote is only honest if the reader can see the discount is bought, not assumed — so the
    // GMT leg is labelled with what it buys, not just how much it is.
    out.innerHTML =
      `<div class="headline">
        <div class="lab">${mode === 'cap' ? 'Net monthly income' : 'Capital needed'}</div>
        <div class="big">${mode === 'cap' ? money(mo, 0) : money(a.capUSD, 0)}</div>
        <div class="sub">${mode === 'cap'
          ? money(m.netToday) + '/day &middot; ' + money(yr, 0) + '/yr'
          : 'to earn ' + money(mo, 0) + '/mo &middot; ' + money(m.netToday) + '/day'}</div>
        <div class="note">${num(a.th, 1)} TH at 12 W/TH with ${num(a.ag, 0)} GMT locked &mdash; a ${num(m.totD, 2)}% fee discount and ${num(m.yieldPct, 1)}%/yr on total capital.</div>
      </div>
      <div class="grid">
        <div class="cell gold"><div class="k">Hashrate</div><div class="v">${num(a.th, 1)} TH</div><div class="s">newly minted at 12 W/TH &middot; ${money(thUSD, 0)}</div></div>
        <div class="cell"><div class="k">Locked GMT</div><div class="v">${num(a.ag, 0)}</div><div class="s">${money(lockUSD, 0)} &middot; holds the fee discount and earns ${num(APR, 2)}% APR</div></div>
        <div class="cell green"><div class="k">Total discount</div><div class="v">${num(m.totD, 2)}%</div><div class="s">${num(m.tok, 0)}% coverage + ${num(m.nonTok, 2)}% tier, streak &amp; solo bonus</div></div>
        <div class="cell"><div class="k">VIP tier</div><div class="v" style="font-size:1.1rem">${m.vip.n}</div><div class="s">qualifies on hashrate or locked GMT, whichever is higher</div></div>
      </div>
      <div class="split">
        <h3>How the ${money(a.capUSD, 0)} is deployed</h3>
        <div class="bar"><i class="th" style="width:${pct(thUSD)}%"></i><i class="gm" style="width:${pct(lockUSD)}%"></i></div>
        <div class="legs">
          <div class="leg"><div class="lk"><span class="sw" style="background:var(--gold)"></span>Buy hashrate</div>
            <div class="lv" style="color:var(--gold)">${money(thUSD, 0)} &middot; ${num(pct(thUSD), 0)}%</div>
            <div class="ls">${num(a.th, 1)} TH minted at 12 W/TH</div></div>
          <div class="leg"><div class="lk"><span class="sw" style="background:#A78BFA"></span>Lock GMT</div>
            <div class="lv" style="color:#A78BFA">${money(lockUSD, 0)} &middot; ${num(pct(lockUSD), 0)}%</div>
            <div class="ls">${num(a.ag, 0)} GMT &mdash; 360 days of fee coverage</div></div>
        </div>
      </div>
      <div class="grid" style="margin-top:.8rem">
        <div class="cell"><div class="k">Mining income</div><div class="v">${money(m.miningToday * 30, 0)}<span style="font-size:.8rem;color:var(--t3)">/mo</span></div><div class="s">after fees and the ${num(m.totD, 2)}% discount</div></div>
        <div class="cell"><div class="k">Staking income</div><div class="v">${money(m.stakingToday * 30, 0)}<span style="font-size:.8rem;color:var(--t3)">/mo</span></div><div class="s">${num(APR, 2)}% APR on the locked GMT</div></div>
        <div class="cell"><div class="k">Payback</div><div class="v">${mo > 0 ? num(a.capUSD / mo, 1) + ' mo' : '&mdash;'}</div><div class="s">at today&rsquo;s rates, income only &mdash; the hashrate and GMT are still owned</div></div>
      </div>
      <div class="cta">
        <a href="https://gomining.com/?ref=RINGO5" target="_blank" rel="noopener">Start with code RINGO5 &rarr;</a>
        <button class="ghost" type="button" onclick="quoteCopy(this)">Copy this quote</button>
      </div>`;
    window._quote = { mode, cap: a.capUSD, mo, th: a.th, gmt: a.ag, disc: m.totD, streak };
  }

  // Plain text, because this gets pasted into a chat with the person being quoted.
  window.quoteCopy = function (btn) {
    const q = window._quote; if (!q) return;
    const t = `GoMining quote — ${money(q.cap, 0)} invested\n`
      + `• ${num(q.th, 1)} TH at 12 W/TH + ${num(q.gmt, 0)} GMT locked\n`
      + `• ${num(q.disc, 2)}% fee discount\n`
      + `• ${money(q.mo, 0)}/month net at today's prices\n`
      + `Modelled at gmt-optimizer.com/quote — sign up with code RINGO5 for +5% bonus TH.`;
    const done = () => { const o = btn.textContent; btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = o; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done).catch(() => {});
    else { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
  };

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#qModes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('qCapWrap').hidden = m !== 'cap';
    $('qIncWrap').hidden = m !== 'inc';
    render();
  }
  function presets(host, vals, target) {
    if (!host) return;
    host.innerHTML = vals.map(v => `<button type="button" data-v="${v}">${money(v, 0)}</button>`).join('');
    host.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $(target).value = b.dataset.v; render();
    });
  }
  function init() {
    const pd = $('qPxDate'); if (pd) pd.textContent = TH_PRICES_ASOF;
    presets($('qCapPresets'), [10000, 25000, 50000, 100000, 250000], 'qCap');
    presets($('qIncPresets'), [500, 1000, 2500, 5000, 10000], 'qInc');
    document.querySelectorAll('#qModes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
    ['qCap', 'qInc'].forEach(id => {
      const e = $(id); if (!e) return;
      e.addEventListener('input', render);
      // Enter is the natural "give me the answer" key in a one-field form. It already renders on
      // input, so this mostly blurs the keyboard on mobile — but it must never do nothing.
      e.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); render(); e.blur();
        const o = $('qOut'); if (o && o.style.display !== 'none') o.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    const go = $('qGo');
    if (go) go.addEventListener('click', () => {
      render();
      const o = $('qOut'); if (o && o.style.display !== 'none') o.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const st = $('qStreak');
    if (st) st.addEventListener('change', () => { $('qStreakL').classList.toggle('on', st.checked); render(); });
    // Draw immediately on the fallback prices, then redraw when the live ones land. Waiting for
    // the fetch meant up to eight seconds of a blank page — which reads as "it did nothing",
    // especially to someone who just pressed Enter.
    S.btc = FB.btc; S.gmt = FB.gmt; S.diff = FB.diff;
    S.satsPerTHDay = ((1e12 * 86400 * BLOCK_SUBSIDY) / (S.diff * 2 ** 32)) * 1e8;
    render();
    loadMarket().then(() => {
      const d = $('qDot'), l = $('qLive');
      if (d) d.className = 'dot' + (S.live ? '' : ' off');
      if (l) l.innerHTML = (S.live ? 'Live' : 'Cached') + ' &middot; BTC <b>' + money(S.btc, 0)
        + '</b> &middot; GMT <b>$' + S.gmt.toFixed(4) + '</b> &middot; <b>' + num(Math.round(S.satsPerTHDay)) + '</b> sats/TH/day';
      render();
    }).catch(() => { render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
