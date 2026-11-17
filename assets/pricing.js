/* GMT Optimizer — THE single source of GoMining prices.
   =========================================================================
   Edit the numbers in the EDIT block below and nothing else, anywhere. Every pricing
   consumer reads from here:
     browser  → window.GMT_PRICING   (console app.js, roi-embed.js, quote.js, market-check.js)
     node     → require('../assets/pricing.js')   (scripts/constants.js → gen-pages.js)
   The data pages are regenerated from it on every deploy, so a price edit reaches them too.

   Rules for the numbers:
     • TH prices are LIST prices, pre-sale, pre-NFT-holder discount. Quotes read off the app by
       an NFT holder are net of 5%: gross them up by /0.95 (NOT ×1.05) before pasting.
     • Give all twenty tiers when repricing; the 5,000 TH anchor is mandatory.
     • GoMining only mints 15 W/TH. The 12 W curve is DERIVED below (15 W + the 15 → 12
       upgrade), never typed in.
     • A sale is SALE_PCT only. Never bake a sale into the tier prices.
       `node scripts/set-rates.js --sale 20` / `--sale 0` sets it.
*/
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.GMT_PRICING = P;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ======================= EDIT ======================= //
  const PRICES_ASOF = '30 Oct 2026';   // when the tier prices were last read off the GoMining app (console badge)
  const SALE_PCT = 20;        // GoMining promo: % off every TH price (new miners + TH added to a miner you own). 0 = no sale.
  const EFF_BEST     = 12;    // best efficiency reachable (by upgrading), W/TH
  const EFF_BASE_MAX = 15;    // what GoMining mints today, W/TH

  // 15 W/TH hashrate, list $/TH by miner size (TH). Repriced 2026-10-30.
  const TH_TIERS_15W_LIST = [
    {th:1,cpt:13.00},{th:2,cpt:12.51},{th:4,cpt:12.00},{th:8,cpt:12.00},
    {th:16,cpt:11.87},{th:32,cpt:11.78},{th:48,cpt:11.71},{th:64,cpt:11.64},
    {th:96,cpt:11.58},{th:128,cpt:11.53},{th:192,cpt:11.47},{th:256,cpt:11.41},
    {th:384,cpt:11.35},{th:512,cpt:11.29},{th:768,cpt:11.23},{th:1024,cpt:11.18},
    {th:1536,cpt:11.13},{th:2560,cpt:11.06},{th:3584,cpt:11.01},{th:5000,cpt:10.96}
  ];

  // Efficiency upgrade $/TH per W/TH step, by the rating stepped down FROM: band covers
  // (previous upTo, upTo]. Not discounted by SALE_PCT.
  const EFF_UPGRADE_BANDS = [
    {upTo:15,step:2.67},{upTo:20,step:1.10},{upTo:28,step:1.00},{upTo:35,step:0.50},{upTo:50,step:0.10}
  ];
  // ===================== END EDIT ===================== //

  // One-time $/TH to bring a miner from rating w down to 12 W/TH, band by band (20 W → $13.51).
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

  const r4 = x => Math.round(x * 1e4) / 1e4;
  const saleMult = 1 - SALE_PCT / 100;
  const UPG_15_TO_12 = r4(upgPerTH(EFF_BASE_MAX));                       // $8.01/TH today
  const freeze = T => Object.freeze(T.map(t => Object.freeze(t)));
  // What a buyer pays today (sale applied). 12 W = 15 W + the 15 → 12 upgrade.
  const TH_TIERS_15W = freeze(TH_TIERS_15W_LIST.map(t => ({ th: t.th, cpt: r4(t.cpt * saleMult) })));
  const TH_TIERS_12W = freeze(TH_TIERS_15W_LIST.map(t => ({ th: t.th, cpt: r4((t.cpt + UPG_15_TO_12) * saleMult) })));

  return Object.freeze({
    PRICES_ASOF, SALE_PCT, EFF_BEST, EFF_BASE_MAX,
    TH_TIERS_15W, TH_TIERS_12W,
    TH_TIERS_15W_LIST: freeze(TH_TIERS_15W_LIST),
    EFF_UPGRADE_BANDS: freeze(EFF_UPGRADE_BANDS),
    UPG_15_TO_12, upgPerTH
  });
});
