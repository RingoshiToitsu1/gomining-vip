/* GMT-Optimizer mining maths: pure functions, no DOM, no network, no globals.
   ==========================================================================
   Every function takes plain numbers plus `cfg` (data/config.json, available as window.GMT_CONFIG or
   require('../assets/pricing.js').CONFIG) and returns plain numbers. Same inputs, same outputs, always.

     browser → window.GMTMining      node → require('../lib/mining.js')
   Tested by tests/lib.test.js (hand-checked values + agreement with the console engine in assets/app.js).

   Units: TH = terahash; wth = W/TH; prices in USD; percentages as 0–100 numbers; fees per day.
*/
(function (root, factory) {
  const M = factory();
  if (typeof module === 'object' && module.exports) module.exports = M;
  else root.GMTMining = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Days in a month, everywhere on the site: 365.25 / 12 = 30.4375. */
  const DAYS_PER_MONTH = 365.25 / 12;

  /** Bitcoin mined per TH per day, in sats, from network difficulty. */
  const satsPerTHDay = (difficulty, cfg) => ((1e12 * 86400 * cfg.network.blockSubsidyBtc) / (difficulty * 2 ** 32)) * 1e8;

  /** BTC per TH per day as the app uses it: whole sats (rounded), in BTC. */
  const btcPerTHDay = sats => Math.round(sats) / 1e8;

  /** Maintenance fee in USD per TH per day, before any discount (electricity + service). */
  const feeUsdPerThDay = (wth, cfg) => (cfg.fees.electricityUsdPerKwh * 24 * wth) / 1000 + cfg.fees.serviceUsdPerThDay;

  /** VIP tier: the highest tier reached by hashrate OR locked GMT (whichever lifts you higher). */
  function vipTier(th, lockedGmt, cfg) {
    let t = cfg.vipTiers[0];
    for (const x of cfg.vipTiers) if (th >= x.th || lockedGmt >= x.veg) t = x;
    return t;
  }

  /** Non-token discount %: VIP bonus + click streak + solo mining (+ other), capped at the total cap. */
  const nonTokenDiscountPct = ({ vipPct = 0, clickStreak = false, soloPct = 0, otherPct = 0 }, cfg) =>
    Math.min(cfg.discount.totalCapPct, vipPct + (clickStreak ? cfg.rates.clickStreakPct : 0) + soloPct + otherPct);

  /** Daily fees paid in GMT after the non-token discount (the amount coverage is measured against). */
  const feesGmtPerDay = (feesUsd, nonTokPct, gmtPrice) => (gmtPrice > 0 ? (feesUsd * (1 - nonTokPct / 100)) / gmtPrice : 0);

  /** Days of fees the locked GMT covers. */
  const coverageDays = (lockedGmt, feesGmt) => (feesGmt > 0 ? lockedGmt / feesGmt : (lockedGmt > 0 ? Infinity : 0));

  /** Token (coverage) discount %: 1% per `coverageDaysPerPct` days, whole steps, capped. */
  const tokenDiscountPct = (covDays, cfg) => {
    const d = cfg.discount.coverageDaysPerPct;
    return covDays < d ? 0 : Math.min(cfg.discount.tokenCapPct, Math.floor(covDays / d));
  };

  /** Total fee discount %: token + non-token, capped at the total cap. */
  const totalDiscountPct = (tokPct, nonTokPct, cfg) => Math.min(cfg.discount.totalCapPct, tokPct + nonTokPct);

  /** GMT to lock for the full token discount (e.g. 18 days × 20 = 360 days of fees). */
  const gmtForFullDiscount = (feesGmt, cfg) => feesGmt * cfg.discount.coverageDaysPerPct * cfg.discount.tokenCapPct;

  /** Net mining income in USD per day, after the discounted fee and the BTC→GMT conversion fee. */
  const netMiningUsdPerDay = ({ th, btcPerTH, btcPrice, feesUsd, totalDiscPct }, cfg) =>
    (btcPerTH * th * btcPrice - feesUsd * (1 - totalDiscPct / 100)) * (1 - cfg.fees.btcToGmtConversion);

  /** Staking income in USD per day on locked GMT. */
  const stakingUsdPerDay = (lockedGmt, aprPct, gmtPrice) => lockedGmt * gmtPrice * (aprPct / 100) / 365.25;

  /** RINGO5 bonus TH on a first miner of `th` TH (percentage, capped). */
  const referralBonusTh = (th, cfg) => Math.min(th * cfg.referral.bonusThPct / 100, cfg.referral.bonusThCap);

  /** One-time USD per TH to upgrade from `wth` down to the best efficiency, band by band. */
  function upgradeUsdPerTh(wth, cfg) {
    const bands = cfg.pricing.effUpgradeBands, best = cfg.pricing.effBest;
    let c = 0, cur = wth;
    while (cur > best + 1e-9) {
      let floor = best, step = bands[bands.length - 1].step, found = false;
      for (const b of bands) { if (cur <= b.upTo + 1e-9) { step = b.step; found = true; break; } floor = b.upTo; }
      if (!found) floor = bands[bands.length - 1].upTo;
      const stop = Math.max(best, floor);
      c += (cur - stop) * step; cur = stop;
    }
    return c;
  }

  /** Price per TH at size `th` on a tier curve [{th, cpt}], linear between tiers, clamped at the ends. */
  function priceAtSize(tiers, th) {
    if (th <= 0) return tiers[0].cpt;
    if (th >= tiers[tiers.length - 1].th) return tiers[tiers.length - 1].cpt;
    for (let i = 0; i < tiers.length - 1; i++) {
      const lo = tiers[i], hi = tiers[i + 1];
      if (th >= lo.th && th <= hi.th) return lo.cpt + (hi.cpt - lo.cpt) * ((th - lo.th) / (hi.th - lo.th));
    }
    return tiers[0].cpt;
  }

  /** The whole daily picture for one farm at today's prices: discount breakdown and net income. */
  function farmToday({ th, wth, lockedGmt = 0, aprPct = 0, clickStreak = true, otherPct = 0, btcPrice, gmtPrice, satsPerTH }, cfg) {
    const btcPerTH = btcPerTHDay(satsPerTH);
    const feesUsd = feeUsdPerThDay(wth, cfg) * th;
    const vip = vipTier(th, lockedGmt, cfg);
    const nonTok = nonTokenDiscountPct({ vipPct: vip.d, clickStreak, soloPct: cfg.rates.soloMiningDiscountPct, otherPct }, cfg);
    const feesGmt = feesGmtPerDay(feesUsd, nonTok, gmtPrice);
    const cov = coverageDays(lockedGmt, feesGmt);
    const tok = tokenDiscountPct(cov, cfg);
    const totD = totalDiscountPct(tok, nonTok, cfg);
    const mining = netMiningUsdPerDay({ th, btcPerTH, btcPrice, feesUsd, totalDiscPct: totD }, cfg);
    const staking = stakingUsdPerDay(lockedGmt, aprPct, gmtPrice);
    return { btcPerTH, feesUsd, vip, nonTok, feesGmt, cov, tok, totD, gmtForFull: gmtForFullDiscount(feesGmt, cfg),
             grossUsd: btcPerTH * th * btcPrice, mining, staking, net: mining + staking };
  }

  return Object.freeze({
    DAYS_PER_MONTH,
    satsPerTHDay, btcPerTHDay, feeUsdPerThDay, vipTier, nonTokenDiscountPct, feesGmtPerDay, coverageDays,
    tokenDiscountPct, totalDiscountPct, gmtForFullDiscount, netMiningUsdPerDay, stakingUsdPerDay,
    referralBonusTh, upgradeUsdPerTh, priceAtSize, farmToday
  });
});
