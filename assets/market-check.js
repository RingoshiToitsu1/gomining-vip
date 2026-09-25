/* GMT Optimizer — GoMining marketplace deal checker (/gomining-marketplace-checker).
   =========================================================================
   Paste a miner link from app.gomining.com/nft/view/<id>; the page reads that miner's
   hashrate, efficiency and asking price through the nft-lookup Supabase function (GoMining's
   API sends no CORS header, so the browser can't read it directly), then prices the listing
   against the only alternative every buyer has: minting the same TH new at 12 W/TH.

   Two ways to own a secondhand miner are compared, because efficiency is the whole story on
   the secondary market:
     • as-is      — keep it at its current W/TH and pay the higher electricity fee forever
     • upgraded   — pay the one-time efficiency upgrade down to 12 W/TH on top of the price
   The better of the two is what the listing is judged on. Every route is reduced to one
   number — net USD a year per dollar spent, at TODAY's rates — so as-is and upgraded
   compare fairly against new. No payback dates and no forecasts (site rule for content pages).

   IMPORTANT — the calibration constants below mirror assets/app.js and assets/roi-embed.js.
   Recalibrate all three together (fees, tier prices, EFF_UPGRADE_BANDS, BLOCK_SUBSIDY).
*/
(function () {
  'use strict';

  // ---- CALIBRATION (mirror of assets/app.js) ----
  const CONVERSION_FEE   = 0.0225;  // BTC → GMT skim applied at payout
  const USD_GMT_FEE      = 0.02;    // fee when buying GMT with dollars
  const BLOCK_SUBSIDY    = 3.125;   // BTC/block — halve at the 2028 halving
  const ELEC_RATE        = 0.05;    // $/kWh on (W/TH × TH × 24h)
  const SERVICE_RATE     = 0.0089;  // $/TH/day platform service fee
  const EFF_BEST         = 12;      // best efficiency available now (W/TH)
  // Efficiency upgrade $/TH per W/TH step, by the rating stepped down FROM (prev upTo, upTo].
  // Mirror of EFF_UPGRADE_BANDS in assets/app.js (GoMining app, 2026-09-13).
  const EFF_UPGRADE_BANDS = [
    { upTo: 15, step: 2.67 }, { upTo: 20, step: 1.10 }, { upTo: 28, step: 1.00 }, { upTo: 35, step: 0.50 }, { upTo: 50, step: 0.10 }
  ];
  const FB = { btc: 84000, gmt: 0.28, diff: 113e12 };
  const STAKE_APR        = 22.68;   // % — GMT locked-staking APR (mirror of STAKING_APR in scripts/constants.js)
  const COV_DAYS_PER_PCT = 18;      // days of fees locked in GMT per 1% token discount (20% = 360 days)
  const SB_URL = 'https://cbatlxqlmeyuhwqpczpv.supabase.co';
  const SB_KEY = 'sb_publishable_yFupMYjhcAlgl3cJunUfLw_X5DLY__A';   // same client-safe key as assets/supabase-config.js
  const LOOKUP = SB_URL + '/functions/v1/nft-lookup';
  const TOTAL_DISCOUNT_KEY = 'gmt_total_discount';                   // written by the console (assets/app.js)
  const PROFILES_KEY = 'gm_profiles_v1';                             // console saved setups (inGreedyGrowth lives here)
  const GREEDY_GROWTH_DEFAULT = 0.36;                                // %/wk — console inGreedyGrowth default; observed, not a constant
  const GREEDY_GROWTH_PAST_DEFAULTS = ['0.3', '0.30', '0.35', '0.3718', '0.3462']; // mirror of app.js: a saved old default is not the user's own number

  // $/TH for newly minted 12 W/TH hashrate, pre-avatar-discount. Mirror of TH_TIERS_12W.
  const TH_TIERS_12W = [
    {th:1,cpt:19.00},{th:2,cpt:18.91},{th:4,cpt:18.80},{th:8,cpt:18.75},
    {th:16,cpt:18.62},{th:32,cpt:18.53},{th:48,cpt:18.44},{th:64,cpt:18.33},
    {th:96,cpt:18.24},{th:128,cpt:18.15},{th:192,cpt:18.05},{th:256,cpt:17.96},
    {th:384,cpt:17.87},{th:512,cpt:17.78},{th:768,cpt:17.68},{th:1024,cpt:17.60},
    {th:1536,cpt:17.51},{th:2560,cpt:17.42},{th:3584,cpt:17.34},{th:5000,cpt:17.24}
  ];
  // $/TH for hashrate added at 15 W/TH, pre-avatar-discount. Mirror of TH_TIERS.
  const TH_TIERS = [
    {th:1,cpt:11.49},{th:2,cpt:11.47},{th:4,cpt:11.46},{th:8,cpt:11.44},
    {th:16,cpt:11.41},{th:32,cpt:11.39},{th:48,cpt:11.37},{th:64,cpt:11.36},
    {th:96,cpt:11.33},{th:128,cpt:11.31},{th:192,cpt:11.27},{th:256,cpt:11.25},
    {th:384,cpt:11.22},{th:512,cpt:11.20},{th:768,cpt:11.17},{th:1024,cpt:11.14},
    {th:1536,cpt:11.11},{th:2560,cpt:11.07},{th:3584,cpt:11.04},{th:5000,cpt:11.02}
  ];
  const EFF_BASE_MAX = 15;          // the 15 W/TH hashrate curve
  const GREEDY_CAP   = 5000;        // max TH per miner via manual upgrades; passive growth compounds past it
  function cptTier(T, th) {
    if (th <= 0) return T[0].cpt;
    if (th >= T[T.length - 1].th) return T[T.length - 1].cpt;
    for (let i = 0; i < T.length - 1; i++) {
      const lo = T[i], hi = T[i + 1];
      if (th >= lo.th && th <= hi.th) return lo.cpt + (hi.cpt - lo.cpt) * ((th - lo.th) / (hi.th - lo.th));
    }
    return T[0].cpt;
  }
  const cpt12 = th => cptTier(TH_TIERS_12W, th);
  // $/TH at a miner's own rating, linear in W between the 12 W and 15 W curves. Mirror of cptAtEff.
  function cptAtEff(th, w) {
    const f = (Math.min(Math.max(w, EFF_BEST), EFF_BASE_MAX) - EFF_BEST) / (EFF_BASE_MAX - EFF_BEST);
    return cptTier(TH_TIERS_12W, th) * (1 - f) + cptTier(TH_TIERS, th) * f;
  }
  // Adding TH to one miner: priced on its size after the top-up. Mirror of costToGrowTiers.
  const costToGrow = (cur, add, w) => add > 0 ? Math.max(0, (cur + add) * cptAtEff(cur + add, w) - cur * cptAtEff(cur, w)) : 0;
  // One-time $/TH to bring a miner down to 12 W/TH, summed band by band (20 W → $13.51).
  function upgPerTH(w) {
    let c = 0, cur = w;
    while (cur > EFF_BEST + 1e-9) {
      let floor = EFF_BEST, step = EFF_UPGRADE_BANDS[EFF_UPGRADE_BANDS.length - 1].step, found = false;
      for (const b of EFF_UPGRADE_BANDS) { if (cur <= b.upTo + 1e-9) { step = b.step; found = true; break; } floor = b.upTo; }
      if (!found) floor = EFF_UPGRADE_BANDS[EFF_UPGRADE_BANDS.length - 1].upTo;
      const stop = Math.max(EFF_BEST, floor);
      c += (cur - stop) * step; cur = stop;
    }
    return c;
  }

  // ---- market data (same sources and fallbacks as roi-embed.js) ----
  const S = { btc: 0, gmt: 0, diff: 0, satsPerTHDay: 0, live: false, ready: false };
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
    S.satsPerTHDay = ((1e12 * 86400 * BLOCK_SUBSIDY) / (S.diff * 2 ** 32)) * 1e8;
    S.live = b > 0 && g > 0 && diffOk;
    S.ready = true;
  }

  // ---- the model ----
  // Net USD/day for one TH at efficiency w, after the fee discount and the payout skim.
  function netPerTH(w, disc) {
    const dbt = Math.round(S.satsPerTHDay) / 1e8;
    const fee = (ELEC_RATE * 24 * w) / 1000 + SERVICE_RATE;
    return (dbt * S.btc - fee * (1 - disc / 100)) * (1 - CONVERSION_FEE);
  }

  function evaluate(th, w, priceGMT, disc) {
    const cost = priceGMT * S.gmt;                        // what the listing costs, at market
    const upg = th * upgPerTH(w);                         // one-time, to reach 12 W
    const newCost = th * cpt12(th);                       // mint the same TH new at 12 W
    const netAsIs = netPerTH(w, disc) * th;               // mining only
    const net12 = netPerTH(EFF_BEST, disc) * th;
    const canUpgrade = w > EFF_BEST + 1e-9;

    // Total capital, as everywhere else on the site. Your discount is only yours on THIS miner if
    // its fees are covered too: the token part (up to 20%) needs 18 days of fees per 1% locked in
    // GMT. An inefficient miner pays more fee, so it needs MORE GMT locked — real capital that the
    // hardware price alone hides. That GMT isn't spent: it earns the staking APR, counted as income.
    const tok = Math.min(20, disc), nonTok = Math.max(0, disc - tok);
    const feeDay = wt => ((ELEC_RATE * 24 * wt) / 1000 + SERVICE_RATE) * th;
    const lockFor = wt => COV_DAYS_PER_PCT * tok * feeDay(wt) * (1 - nonTok / 100);
    const stake = lock => lock * (STAKE_APR / 100) / 365.25;
    const route = (hw, lock, mining) => {
      const net = mining + stake(lock), capital = hw + lock;
      return { cost: hw, lock, mining, net, capital, y: capital > 0 ? (net * 365) / capital : 0 };
    };
    const lockAsIs = lockFor(w), lock12 = lockFor(EFF_BEST);
    const routes = {
      asIs:     route(cost, lockAsIs, netAsIs),
      upgraded: canUpgrade ? route(cost + upg, lock12, net12) : null,
      fresh:    route(newCost, lock12, net12)
    };
    const best = routes.upgraded && routes.upgraded.y > routes.asIs.y ? 'upgraded' : 'asIs';
    const yF = routes.fresh.y;
    const vsNew = r => (r && yF > 0 ? r.y / yF - 1 : null);

    // Highest asking price at which this listing still matches minting new, per route.
    // Upgraded: what's left of the new-miner cost after the upgrade (same income and lock as new).
    // As-is:    the price at which its income + staking earns the new miner's yield on its capital.
    const fairUpg = canUpgrade ? Math.max(0, newCost - upg) : 0;
    const fairAsIs = yF > 0 ? Math.max(0, routes.asIs.net * 365 / yF - lockAsIs) : 0;
    const fairUSD = Math.max(fairUpg, fairAsIs);

    // Edge vs minting new, by yield on total capital; if nothing earns at today's price, by cost.
    let edge;
    if (yF > 0 && routes.fresh.mining > 0) edge = vsNew(routes[best]);
    else edge = fairUSD > 0 ? fairUSD / Math.max(cost, 1e-9) - 1 : -1;

    // What the upgrade itself returns: the yearly fee it saves over what it costs, net of the GMT
    // lock it frees (a lower fee needs less coverage).
    const upgSaveDay = net12 - netAsIs;
    const lockFreed = Math.max(0, lockAsIs - lock12);
    const upgNetCost = Math.max(upg * 0.05, upg - lockFreed);
    const upgYield = upg > 0 ? (upgSaveDay * 365) / upgNetCost : 0;

    return { cost, upg, newCost, netAsIs, net12, routes, best, fairUSD, edge, upgSaveDay, upgYield, canUpgrade, lockFreed, tok, vsNew,
             lockPerTH: wt => th > 0 ? lockFor(wt) / th : 0 };
  }

  // ---- render ----
  const $ = id => document.getElementById(id);
  const money = (n, d) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: d != null ? d : (Math.abs(n) < 100 ? 2 : 0),
    maximumFractionDigits: d != null ? d : (Math.abs(n) < 100 ? 2 : 0) });
  const num = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const VERDICTS = [
    { min: 0.15,  cls: 'great', label: 'Great deal' },
    { min: 0.05,  cls: 'good',  label: 'Good deal' },
    { min: -0.05, cls: 'fair',  label: 'Fair price' },
    { min: -Infinity, cls: 'bad', label: 'Overpriced' }
  ];
  const MO = 30.44;
  const stakeMo = r => r.lock * (STAKE_APR / 100) / 365.25 * MO;

  function render() {
    const th = Math.max(0, parseFloat($('mc-th').value) || 0);
    const w = Math.max(EFF_BEST, parseFloat($('mc-wth').value) || 0);
    const p = Math.max(0, parseFloat($('mc-price').value) || 0);
    const disc = Math.min(30, Math.max(0, parseFloat($('mc-disc').value) || 0));
    const out = $('mc-result');
    if (scanning) { out.hidden = true; return; }   // the scan panel owns the stage until it lands
    if (!S.ready || th <= 0 || p <= 0 || !(parseFloat($('mc-wth').value) > 0)) { out.hidden = true; return; }
    out.hidden = false;

    const e = evaluate(th, w, p, disc);
    const v = VERDICTS.find(x => e.edge >= x.min);
    const bestR = e.routes[e.best];
    const how = e.best === 'upgraded' ? 'buying it and upgrading it to 12 W/TH' : 'buying it and keeping it at ' + num(w, 2).replace(/\.?0+$/, '') + ' W/TH';
    const gap = num(Math.abs(e.edge) * 100, 0) + '%';

    const vd = $('mc-verdict');
    vd.className = 'mc-verdict ' + v.cls;
    $('mc-v-label').textContent = v.label;
    // How far the ask sits from "Worth up to": the premium to swallow, or the margin in your favour.
    const premUSD = e.cost - e.fairUSD, premGMT = premUSD / S.gmt;
    const amt = $('mc-v-amt');
    if (e.fairUSD > 0 && v.cls === 'bad') { amt.textContent = 'by ' + num(premGMT, 0) + ' GMT (≈' + money(premUSD) + ')'; amt.hidden = false; }
    else if (e.fairUSD > 0 && (v.cls === 'good' || v.cls === 'great')) { amt.textContent = num(-premGMT, 0) + ' GMT under fair value (≈' + money(-premUSD) + ')'; amt.hidden = false; }
    else if (e.fairUSD <= 0 && v.cls === 'bad') { amt.textContent = 'not worth buying at any price today'; amt.hidden = false; }
    else amt.hidden = true;
    const at = 'At ' + num(p, 0) + ' GMT, ' + how;
    $('mc-v-line').textContent = e.routes.fresh.net <= 0
      ? 'Mining is under water at today\'s BTC price, so this compares cost only. ' +
        (e.edge >= 0 ? 'The listing is cheaper than minting the same TH new.' : 'Minting the same TH new is cheaper.')
      : (v.cls === 'fair' ? at + ' earns about the same per dollar as minting the same TH new.'
        : at + ' earns ' + gap + (e.edge > 0 ? ' more' : ' less') + ' per dollar than minting the same TH new.') +
        // The verdict follows the better way to own it. When that's keeping it as it is, say plainly
        // if upgrading would be the worse move — the upgrade row alone can read like the whole story.
        (e.best === 'asIs' && e.routes.upgraded && e.vsNew(e.routes.upgraded) != null && e.vsNew(e.routes.upgraded) < -0.005
          ? ' Don\'t upgrade it, though: bought and upgraded it would cost ' + money(e.routes.upgraded.cost) + ' against ' + money(e.newCost) + ' new, and earn ' + num(Math.abs(e.vsNew(e.routes.upgraded)) * 100, 0) + '% less per dollar than minting new.'
          : '');

    $('mc-t-cost').textContent = money(e.cost);
    $('mc-t-cost-s').textContent = num(p, 0) + ' GMT · ' + money(e.cost / th) + '/TH';
    $('mc-t-new').textContent = money(e.newCost);
    $('mc-t-new-s').textContent = num(th, 2).replace(/\.?0+$/, '') + ' TH new @ ' + money(cpt12(th)) + '/TH';
    $('mc-t-net').textContent = money(bestR.net * MO);
    $('mc-t-net-s').textContent = (e.best === 'upgraded' ? 'a month, after upgrading' : 'a month, as it is') + (bestR.lock > 0 ? ' · incl. ' + money(stakeMo(bestR)) + ' staking' : '');
    const fairGMT = e.fairUSD / S.gmt;
    $('mc-t-fair').textContent = fairGMT > 0 ? num(fairGMT, 0) + ' GMT' : '—';
    $('mc-t-fair-s').textContent = fairGMT > 0 ? '≈ ' + money(e.fairUSD) + ' — matches minting new' : 'not worth buying at any price today';

    const vs = r => { const x = e.vsNew(r); return x == null ? '—' : '<b class="' + (x >= 0.005 ? 'pos' : x <= -0.005 ? 'neg' : '') + '">' + (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x) * 100, 0) + '%</b>'; };
    const row = (label, r, note, hl, isNew) => r ? '<tr' + (hl ? ' class="hl"' : '') + '><td>' + label + (note ? '<span>' + note + '</span>' : '') + '</td>' +
      '<td>' + money(r.cost) + '</td><td>' + (r.lock > 0 ? money(r.lock) : '—') + '</td><td>' + money(r.net * MO) + '</td><td class="' + (r.y < 0 ? 'neg' : '') + '">' + num(r.y * 100, 1) + '%</td>' +
      '<td>' + (isNew ? 'benchmark' : vs(r)) + '</td></tr>' : '';
    $('mc-rows').innerHTML =
      row('Buy this listing as it is', e.routes.asIs, num(w, 2).replace(/\.?0+$/, '') + ' W/TH', e.best === 'asIs') +
      row('Buy it and upgrade to 12 W', e.routes.upgraded, '+' + money(e.upg) + ' upgrade', e.best === 'upgraded') +
      row('Mint the same TH new', e.routes.fresh, '12 W/TH', false, true);
    $('mc-tbl-note').textContent = e.tok > 0
      ? 'GMT lock = the GMT that keeps your ' + num(e.tok, 0) + '% token discount on this hashrate (18 days of fees per 1%). It isn\'t spent: it earns ' + STAKE_APR + '% staking, included in net. A year on capital = net ÷ (cost + GMT lock).'
      : 'No token discount set, so no GMT lock is needed. A year on capital = net ÷ cost.';

    const hint = $('mc-upg');
    if (!e.canUpgrade) {
      hint.textContent = 'This miner is already at 12 W/TH, the best efficiency GoMining sells, so there is no upgrade to price in.';
    } else if (e.upgSaveDay <= 0) {
      hint.textContent = 'The upgrade to 12 W/TH costs ' + money(e.upg) + ' but saves nothing at your discount today, so keep it as it is.';
    } else {
      const worth = e.best === 'upgraded';
      hint.innerHTML = '<b>Efficiency upgrade:</b> taking it from ' + esc(num(w, 2).replace(/\.?0+$/, '')) + ' to 12 W/TH costs ' + money(e.upg) +
        ' once (' + money(upgPerTH(w)) + '/TH) and cuts fees by ' + money(e.upgSaveDay * MO) + ' a month' +
        (e.lockFreed > 0 ? ', freeing ' + money(e.lockFreed) + ' of GMT lock' : '') + ', which returns ' +
        num(e.upgYield * 100, 0) + '% a year on the upgrade. ' +
        (worth ? 'That beats what the miner earns on its price, so upgrade it.' : 'The miner already earns more on its capital than the upgrade would, so skip the upgrade.') +
        (w > 15 ? ' Steps above 15 W/TH are the cheap ones; the last three into 12 W/TH cost $2.67/TH each.' : '');
    }

    renderGreedy(e, th, w, p, premUSD, v);

    $('mc-basis').textContent = 'BTC ' + money(S.btc, 0) + ' · GMT $' + num(S.gmt, 3) + ' · ' +
      num(Math.round(S.satsPerTHDay), 0) + ' sats/TH/day' + (S.live ? '' : ' (cached)') +
      ' · buying the GMT with dollars adds ' + (USD_GMT_FEE * 100) + '%';
  }

  // ---- Greedy Machine: free weekly growth ----
  // A Greedy Machine's TH grows by a % every week for free, and every free TH inherits the machine's
  // rating. So the growth has a dollar value: each new TH is worth what that TH would cost to get
  // another way — a new 12 W TH if you upgrade the machine (its growth then arrives at 12 W), or the
  // same yield-matched value the "Worth up to" figure uses if you keep it as it is. Growth compounds
  // on the current TH, so the weeks to accumulate X dollars of it are ln(1 + X / (TH · value)) / ln(1 + g).
  // ---- Greedy optimizer: how much TH to add so growth repays the premium in N weeks ----
  // Growth is a % of the machine's TH, so a bigger machine grows more dollars a week. Topping it up
  // with hashrate bought at the going rate doesn't add premium (you pay about what that TH is worth);
  // it just makes the free growth big enough to swallow the listing premium sooner. Solve
  //   T · ((1+g)^weeks − 1) · value(T) = premium
  // for the total TH T (value/TH falls a little with size, so iterate), capped at the 5,000 TH
  // manual-upgrade limit. Added TH carries the machine's rating: 12 W if you upgrade it, else its own.
  function sizeGreedy(e, th, w, g, premUSD, wks) {
    const rating = e.best === 'upgraded' ? EFF_BEST : w;
    const ratio = e.best === 'upgraded' ? 1 : (e.net12 > 0 ? Math.max(0, e.netAsIs / e.net12) : 0);
    const val = t => cpt12(t) * ratio;
    const f = Math.pow(1 + g, wks) - 1;
    if (!(premUSD > 0) || !(f > 0) || !(val(th) > 0)) return null;
    let need = th;
    for (let i = 0; i < 12; i++) need = Math.max(th, premUSD / (val(need) * f));
    const capped = need > Math.max(th, GREEDY_CAP) + 1e-9;
    const T = Math.min(need, Math.max(th, GREEDY_CAP));
    const add = Math.max(0, T - th);
    return {
      wks, T, add, capped, rating,
      cost: costToGrow(th, add, rating),
      lock: add * e.lockPerTH(rating),
      weeks: Math.log(1 + premUSD / (T * val(T))) / Math.log(1 + g)
    };
  }

  function renderGreedy(e, th, w, p, premUSD, v) {
    const box = $('mc-greedy');
    const on = $('mc-greedy-on').checked;
    $('mc-growth-fld').hidden = !on;
    $('mc-payback-fld').hidden = !on;
    if (!on) { box.hidden = true; return; }
    const g = Math.max(0, parseFloat($('mc-growth').value) || 0) / 100;
    const v12 = cpt12(th);
    const valPerTH = e.best === 'upgraded' ? v12 : (e.net12 > 0 ? Math.max(0, v12 * e.netAsIs / e.net12) : 0);
    box.hidden = false;
    if (!(g > 0) || !(valPerTH > 0)) {
      box.innerHTML = '<b>Greedy Machine.</b> ' + (g > 0 ? 'Its free TH has no value at today\'s rates, so growth can\'t offset the price.' : 'Set its weekly growth to value the free TH it adds.');
      return;
    }
    const weeks = usd => Math.log(1 + usd / (th * valPerTH)) / Math.log(1 + g);
    const wkTH = th * g, wkUSD = wkTH * valPerTH;
    const yrTH = th * (Math.pow(1 + g, 52) - 1), yrUSD = yrTH * valPerTH;
    const fmtW = n => n < 1 ? 'under a week' : num(Math.ceil(n), 0) + (Math.ceil(n) === 1 ? ' week' : ' weeks') + (n >= 104 ? ' (~' + num(n / 52, 1) + ' yrs)' : '');
    const where = e.best === 'upgraded' ? 'at 12 W/TH once upgraded' : 'at ' + num(w, 2).replace(/\.?0+$/, '') + ' W/TH';
    let lead;
    if (premUSD > 0) {
      lead = 'Its free growth covers the <b>' + money(premUSD) + ' premium in ' + fmtW(weeks(premUSD)) + '</b>. After that, every week of growth is value you didn\'t pay for.';
    } else {
      lead = 'The price is already at or under fair value, so its growth is pure upside from week one.';
    }
    box.innerHTML = '<div class="mc-g-h"><span class="mc-pill ok">Greedy Machine</span> grows ' + num(g * 100, 4).replace(/\.?0+$/, '') + '% a week, free</div>' +
      '<p>' + lead + '</p>' +
      '<div class="mc-g-stats">' +
        '<div><span>This week</span><b>+' + num(wkTH, wkTH < 10 ? 3 : 1) + ' TH</b><em>≈ ' + money(wkUSD) + '</em></div>' +
        '<div><span>Over a year</span><b>+' + num(yrTH, yrTH < 10 ? 2 : 0) + ' TH</b><em>≈ ' + money(yrUSD) + '</em></div>' +
        '<div><span>Growth repays the full price</span><b>' + fmtW(weeks(e.routes[e.best].cost)) + '</b><em>' + num(p, 0) + ' GMT' + (e.best === 'upgraded' ? ' + upgrade' : '') + '</em></div>' +
      '</div>' +
      optimizerHTML(e, th, w, g, premUSD) +
      '<p class="mc-g-n">Each free TH is valued ' + where + ' (' + money(valPerTH) + '/TH), compounding weekly at the rate you set. The rate is last week\'s observed growth, not a promise; mining income on the new TH comes on top.</p>';
  }

  function optimizerHTML(e, th, w, g, premUSD) {
    const wks = Math.min(520, Math.max(1, parseFloat($('mc-payback').value) || 13));
    const trim = (n, d) => d > 0 ? num(n, d).replace(/\.?0+$/, '') : num(n, 0);
    const head = '<div class="mc-g-opt"><div class="mc-g-h">Greedy optimizer · premium back in ' + trim(wks, 1) + (wks === 1 ? ' week' : ' weeks') + '</div>';
    if (!(premUSD > 0)) return head + '<p>No premium to pay back: the asking price is at or under what it\'s worth, so there\'s no need to top it up.</p></div>';
    const r = sizeGreedy(e, th, w, g, premUSD, wks);
    if (!r) return '';
    const fmtTH = n => trim(n, n < 10 ? 3 : n < 100 ? 2 : 0);
    const rate = trim(r.rating, 2) + ' W/TH';
    const wk = n => { const c = Math.ceil(n - 1e-6); return num(c, 0) + (c === 1 ? ' week' : ' weeks'); };
    let lead;
    if (r.add <= 0.0005) {
      lead = 'At its current <b>' + fmtTH(th) + ' TH</b> it\'s already big enough: growth covers the <b>' + money(premUSD) + '</b> premium in <b>' + wk(r.weeks) + '</b>. No top-up needed.';
    } else if (r.capped) {
      lead = 'Even topped up to the <b>' + num(GREEDY_CAP, 0) + ' TH</b> manual-upgrade cap (<b>+' + fmtTH(r.add) + ' TH</b> for <b>' + money(r.cost) + '</b>), growth takes <b>' + wk(r.weeks) + '</b> to cover the ' + money(premUSD) + ' premium. The premium is too big for ' + trim(wks, 1) + ' weeks at ' + trim(g * 100, 4) + '% a week.';
    } else {
      lead = 'Buy it, then add <b>+' + fmtTH(r.add) + ' TH</b> for <b>' + money(r.cost) + '</b> to take it to <b>' + fmtTH(r.T) + ' TH</b>. Its free growth then covers the <b>' + money(premUSD) + '</b> premium in <b>' + wk(r.weeks) + '</b>.';
    }
    // Quarter, half-year and year targets, whichever the input isn't already showing.
    const alts = [13, 26, 52].filter(m => Math.abs(m - wks) > 1e-9).map(m => {
      const a = sizeGreedy(e, th, w, g, premUSD, m);
      if (!a) return '';
      return m + ' weeks: ' + (a.add <= 0.0005 ? 'no top-up' : (a.capped ? 'not reachable under the cap' : '+' + fmtTH(a.add) + ' TH for ' + money(a.cost)));
    }).filter(Boolean);
    return head + '<p>' + lead + '</p>' +
      (r.add > 0.0005 ? '<div class="mc-g-stats">' +
        '<div><span>Upgrade it to</span><b>' + fmtTH(r.T) + ' TH</b><em>+' + fmtTH(r.add) + ' TH at ' + rate + '</em></div>' +
        '<div><span>Hashrate cost</span><b>' + money(r.cost) + '</b><em>' + money(r.cost / r.add) + '/TH</em></div>' +
        '<div><span>Extra GMT lock</span><b>' + (r.lock > 0 ? money(r.lock) : '—') + '</b><em>' + (r.lock > 0 ? 'keeps your discount, earns staking' : 'no token discount set') + '</em></div>' +
      '</div>' : '') +
      (alts.length ? '<p class="mc-g-n">' + alts.join(' · ') + '</p>' : '') +
      '</div>';
  }

  // ---- your discount, from the console ----
  // The console writes its live total discount to localStorage on every recalculation. When this
  // device has never run the console, a logged-in user's saved account setup carries it instead.
  const ago = t => {
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
  };
  function setDisc(pct, note) {
    const el = $('mc-disc');
    if (el.dataset.touched) return;
    el.value = String(Math.round(Math.min(30, Math.max(0, pct)) * 100) / 100);
    $('mc-disc-src').innerHTML = note;
    render();
  }
  async function loadDiscount() {
    try {
      const d = JSON.parse(localStorage.getItem(TOTAL_DISCOUNT_KEY) || 'null');
      if (d && isFinite(d.pct)) {
        setDisc(+d.pct, 'Your total discount from the <a href="/console">console</a>, updated ' + ago(d.at) + '.');
        return;
      }
    } catch (e) {}
    try {
      const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
      const s = k && JSON.parse(localStorage.getItem(k));
      const tok = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
      const uid = s && ((s.user && s.user.id) || (s.currentSession && s.currentSession.user && s.currentSession.user.id));
      if (tok && uid && !(s.expires_at && s.expires_at * 1000 < Date.now())) {
        const r = await fetch(SB_URL + '/rest/v1/profiles?select=setup&id=eq.' + encodeURIComponent(uid),
          { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tok } });
        const rows = r.ok ? await r.json() : [];
        const td = rows[0] && rows[0].setup && +rows[0].setup.totalDiscount;
        if (isFinite(td) && td >= 0) { setDisc(td, 'Your total discount from your saved <a href="/console">console</a> setup.'); return; }
      }
    } catch (e) {}
    $('mc-disc-src').innerHTML = 'Starting at the full 20%. Set up your farm in the <a href="/console">console</a> and this fills in your own discount.';
  }

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
  const trimN = (n, d) => num(n, d).replace(/\.?0+$/, '');

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
          if (!listed() || !(d().price > 0)) return 'enter a price to judge';
          const e = evaluate(d().power, Math.max(EFF_BEST, d().efficiency), d().price, Math.min(30, Math.max(0, parseFloat($('mc-disc').value) || 0)));
          return VERDICTS.find(x => e.edge >= x.min).label.toLowerCase();
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
      btn.disabled = false; btn.textContent = 'Check deal';
    }
  }

  // ---- reveal: the result rises in piece by piece and every figure counts up into place ----
  function revealResult() {
    if (reduce) return;
    const parts = ['#mc-card', '#mc-verdict', '#mc-result .re-tile', '#mc-result .mc-tbl-wrap', '#mc-greedy', '#mc-upg']
      .flatMap(s => Array.from(document.querySelectorAll(s))).filter(el => !el.hidden && !el.closest('[hidden]'));
    parts.forEach((el, i) => {
      el.classList.remove('mc-rise'); void el.offsetWidth;
      el.style.animationDelay = (i * 0.06) + 's';
      el.classList.add('mc-rise');
    });
    countUp(['#mc-card .mc-card-m', '#mc-v-amt', '#mc-v-line', '#mc-result .re-tile .v', '#mc-result .re-tile .s', '#mc-rows td', '#mc-greedy b', '#mc-greedy em']);
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
    // Only a secondary-market listing has a real asking price. Other miners carry GoMining's
    // internal reference price, which nobody can buy at — never present it as the ask.
    const listed = d.marketplace === 'gmt-secondary' && d.status === 'available';
    const priceGMT = listed ? (d.price > 0 ? d.price : (d.priceUsdt > 0 && S.gmt > 0 ? d.priceUsdt / S.gmt : 0)) : 0;
    $('mc-th').value = d.power > 0 ? String(+d.power.toFixed(4)) : '';
    $('mc-wth').value = d.efficiency > 0 ? String(+d.efficiency.toFixed(2)) : '';
    $('mc-price').value = priceGMT > 0 ? String(Math.round(priceGMT * 100) / 100) : '';
    $('mc-greedy-on').checked = /greedy/i.test(d.name || '');

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
    ['mc-th', 'mc-wth', 'mc-price', 'mc-growth', 'mc-payback'].forEach(id => $(id).addEventListener('input', render));
    $('mc-greedy-on').addEventListener('change', render);
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
    $('mc-disc').addEventListener('input', () => {
      $('mc-disc').dataset.touched = '1';
      $('mc-disc-src').textContent = 'Changed here only; your console setup is untouched.';
      render();
    });
    loadMarket().then(() => {
      root.classList.remove('re-loading');
      loadDiscount();
      render();
      const q = new URLSearchParams(location.search).get('id');
      const id = parseId(q);
      if (id) { $('mc-link').value = 'https://app.gomining.com/nft/view/' + id; lookup(id); }
      else $('mc-basis').textContent = 'BTC ' + money(S.btc, 0) + ' · GMT $' + num(S.gmt, 3) + ' · ' +
        num(Math.round(S.satsPerTHDay), 0) + ' sats/TH/day' + (S.live ? '' : ' (cached)');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
