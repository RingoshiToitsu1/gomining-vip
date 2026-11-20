/* GMT-Optimizer site data: every price, fee, rate and the RINGO5 terms, for the browser and Node.
   ================================================================================================
   EDIT data/config.json, not this file. `node scripts/build-config.js` regenerates the CONFIG block
   below (deploy and the preview build run it too).

     browser → window.GMT_CONFIG (the raw config) and window.GMT_PRICING (TH tiers with the sale applied)
     node    → require('../assets/pricing.js')  → GMT_PRICING, with .CONFIG on it

   Pricing rules: TH prices are LIST prices (pre-sale, pre-NFT-holder discount); 15 W is what GoMining
   mints; the 12 W curve is DERIVED (15 W + the 15 → 12 upgrade); a sale is pricing.salePct only.
*/
(function (root, factory) {
  const P = factory();
  if (typeof module === 'object' && module.exports) module.exports = P;
  else { root.GMT_PRICING = P; root.GMT_CONFIG = P.CONFIG; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===== CONFIG: generated from data/config.json by scripts/build-config.js. Do not edit by hand. ===== */
  const CONFIG = {
    "meta": {
      "updated": "2026-11-17",
      "ratesObserved": "2026-11-06",
      "pricesObserved": "2026-10-30"
    },
    "legal": {
      "_note": "privacyUpdated: set to the launch date (Phase 8 checklist). Shown on /privacy in every language.",
      "privacyUpdated": "2026-11-19"
    },
    "launch": {
      "_note": "date: set to the launch day (LAUNCH.md step 3). The v3 badge on the landing page hides itself v3BadgeDays after it (derived.v3BadgeUntil).",
      "date": "2026-11-19",
      "v3BadgeDays": 60
    },
    "fees": {
      "electricityUsdPerKwh": 0.05,
      "serviceUsdPerThDay": 0.0089,
      "btcToGmtConversion": 0.0225,
      "usdToGmt": 0.02,
      "nftHolderDiscount": 0.05
    },
    "rates": {
      "stakingAprPct": 18.87,
      "soloMiningDiscountPct": 1.09,
      "clickStreakPct": 3,
      "greedyGrowthWeeklyPct": 0.3347
    },
    "discount": {
      "coverageDaysPerPct": 18,
      "tokenCapPct": 20,
      "totalCapPct": 30
    },
    "network": {
      "blockSubsidyBtc": 3.125
    },
    "pricing": {
      "salePct": 20,
      "effBest": 12,
      "effBaseMax": 15,
      "minerCapTh": 5000,
      "thTiers15wList": [
        {
          "th": 1,
          "cpt": 13
        },
        {
          "th": 2,
          "cpt": 12.51
        },
        {
          "th": 4,
          "cpt": 12
        },
        {
          "th": 8,
          "cpt": 12
        },
        {
          "th": 16,
          "cpt": 11.87
        },
        {
          "th": 32,
          "cpt": 11.78
        },
        {
          "th": 48,
          "cpt": 11.71
        },
        {
          "th": 64,
          "cpt": 11.64
        },
        {
          "th": 96,
          "cpt": 11.58
        },
        {
          "th": 128,
          "cpt": 11.53
        },
        {
          "th": 192,
          "cpt": 11.47
        },
        {
          "th": 256,
          "cpt": 11.41
        },
        {
          "th": 384,
          "cpt": 11.35
        },
        {
          "th": 512,
          "cpt": 11.29
        },
        {
          "th": 768,
          "cpt": 11.23
        },
        {
          "th": 1024,
          "cpt": 11.18
        },
        {
          "th": 1536,
          "cpt": 11.13
        },
        {
          "th": 2560,
          "cpt": 11.06
        },
        {
          "th": 3584,
          "cpt": 11.01
        },
        {
          "th": 5000,
          "cpt": 10.96
        }
      ],
      "effUpgradeBands": [
        {
          "upTo": 15,
          "step": 2.67
        },
        {
          "upTo": 20,
          "step": 1.1
        },
        {
          "upTo": 28,
          "step": 1
        },
        {
          "upTo": 35,
          "step": 0.5
        },
        {
          "upTo": 50,
          "step": 0.1
        }
      ]
    },
    "vipTiers": [
      {
        "n": "Bronze I",
        "th": 0,
        "veg": 0,
        "d": 0,
        "rb": 0
      },
      {
        "n": "Bronze II",
        "th": 5,
        "veg": 50,
        "d": 0.3,
        "rb": 0
      },
      {
        "n": "Silver I",
        "th": 10,
        "veg": 100,
        "d": 0.6,
        "rb": 5
      },
      {
        "n": "Silver II",
        "th": 25,
        "veg": 250,
        "d": 0.9,
        "rb": 0
      },
      {
        "n": "Silver III",
        "th": 50,
        "veg": 500,
        "d": 1.2,
        "rb": 0
      },
      {
        "n": "Gold I",
        "th": 100,
        "veg": 1000,
        "d": 1.5,
        "rb": 0
      },
      {
        "n": "Gold II",
        "th": 200,
        "veg": 2000,
        "d": 1.8,
        "rb": 0
      },
      {
        "n": "Platinum I",
        "th": 500,
        "veg": 5000,
        "d": 2.1,
        "rb": 0
      },
      {
        "n": "Platinum II",
        "th": 1000,
        "veg": 10000,
        "d": 2.4,
        "rb": 0
      },
      {
        "n": "Platinum III",
        "th": 2500,
        "veg": 25000,
        "d": 2.7,
        "rb": 0
      },
      {
        "n": "Diamond I",
        "th": 5000,
        "veg": 50000,
        "d": 3,
        "rb": 10
      },
      {
        "n": "Diamond II",
        "th": 7000,
        "veg": 70000,
        "d": 3.3,
        "rb": 0
      },
      {
        "n": "Diamond III",
        "th": 9000,
        "veg": 90000,
        "d": 3.6,
        "rb": 0
      },
      {
        "n": "Diamond IV",
        "th": 12000,
        "veg": 120000,
        "d": 3.9,
        "rb": 0
      },
      {
        "n": "Diamond V",
        "th": 20000,
        "veg": 200000,
        "d": 4.2,
        "rb": 0
      },
      {
        "n": "Legend I",
        "th": 50000,
        "veg": 500000,
        "d": 4.5,
        "rb": 0
      },
      {
        "n": "Legend II",
        "th": 100000,
        "veg": 1000000,
        "d": 4.8,
        "rb": 0
      },
      {
        "n": "Legend III",
        "th": 250000,
        "veg": 2500000,
        "d": 5.1,
        "rb": 0
      },
      {
        "n": "Legend IV",
        "th": 400000,
        "veg": 4000000,
        "d": 5.4,
        "rb": 0
      },
      {
        "n": "Legend V",
        "th": 750000,
        "veg": 7500000,
        "d": 5.7,
        "rb": 0
      },
      {
        "n": "Elite",
        "th": 1000000,
        "veg": 10000000,
        "d": 6,
        "rb": 0
      }
    ],
    "referral": {
      "code": "RINGO5",
      "bonusThPct": 5,
      "bonusThCap": 25,
      "codeWindowDays": 30,
      "vipTier": "VIP Platinum+",
      "vipMonths": 1,
      "cardWindowDays": 90,
      "newAccountsOnly": true,
      "docsUrl": "https://docs.gomining.com/en/product/promos/referral-program"
    },
    "derived": {
      "fullCoverageDays": 360,
      "v3BadgeUntil": "2027-01-18"
    }
  };
  /* ===== END CONFIG ===== */

  const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
  const PR = CONFIG.pricing;
  const SALE_PCT = PR.salePct, EFF_BEST = PR.effBest, EFF_BASE_MAX = PR.effBaseMax;
  const TH_TIERS_15W_LIST = PR.thTiers15wList, EFF_UPGRADE_BANDS = PR.effUpgradeBands;
  const fmtDate = iso => { const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const PRICES_ASOF = fmtDate(CONFIG.meta.pricesObserved);

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
  const freeze = T => Object.freeze(T.map(t => Object.freeze(Object.assign({}, t))));
  // What a buyer pays today (sale applied). 12 W = 15 W + the 15 → 12 upgrade.
  const TH_TIERS_15W = freeze(TH_TIERS_15W_LIST.map(t => ({ th: t.th, cpt: r4(t.cpt * saleMult) })));
  const TH_TIERS_12W = freeze(TH_TIERS_15W_LIST.map(t => ({ th: t.th, cpt: r4((t.cpt + UPG_15_TO_12) * saleMult) })));

  return Object.freeze({
    PRICES_ASOF, SALE_PCT, EFF_BEST, EFF_BASE_MAX,
    TH_TIERS_15W, TH_TIERS_12W,
    TH_TIERS_15W_LIST: freeze(TH_TIERS_15W_LIST),
    EFF_UPGRADE_BANDS: freeze(EFF_UPGRADE_BANDS),
    UPG_15_TO_12, upgPerTH, fmtDate,
    UPDATED: fmtDate(CONFIG.meta.updated),
    CONFIG: deepFreeze(CONFIG)
  });
});
