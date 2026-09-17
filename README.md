# GMT Optimizer

**[gmt-optimizer.com](https://gmt-optimizer.com)** — a free, ad-free web app that models
Bitcoin cloud-mining economics (GoMining) against live BTC price and network difficulty.

It answers one question a spreadsheet gets wrong: given a fixed amount of capital, what is
the *best* split between buying hashrate, upgrading miner efficiency, and locking GMT for a
fee discount — and what does that setup actually earn over the years ahead?

---

## What's in here

| Surface | Path | What it does |
|---|---|---|
| Landing + inline calculator | `index.html`, `assets/roi-embed.js` | Live P&L on your current farm |
| Console | `/console`, `assets/app.js` | Full modeling suite behind an account |
| Capital planner | `assets/app.js` | Optimal allocation of a budget, or solve for a target income |
| Marketplace checker | `/gomining-marketplace-checker` | Prices any secondhand miner listing against minting new |
| Income statement | `/statement` | GoMining CSV → partner/tax-ready statement with ownership splits |
| Programmatic SEO pages | `scripts/gen-pages.js` → 33 static pages | Real computed figures baked in at build time |

## The modeling engine

The economics live in `assets/app.js` (~6.1k lines) with a Node-side mirror in
`scripts/constants.js` for the page generator.

**Difficulty and reward decay.** Projections erode sats/TH/day through both scheduled
halvings and a time-decaying difficulty grind (`difficultyMultAt`), floored at the network
no-arbitrage break-even (`rewardFloorBTC`) — difficulty is an equilibrium, so it cannot
decay to network death.

**Price path.** A single Bitcoin power-law fit (`RB_FIT`, refreshed from blockchain.com
daily closes since 2012) drives every surface — pages, calculator and console converge on
one band. There is deliberately no flat-price scenario anywhere in the product: a price
pinned for a decade isn't a conservative assumption, it's an impossible one. The downside
case is a *worse path*, not a stopped clock.

**Fee discount mechanics.** Locked GMT covers maintenance fees; coverage converts to a
discount in 1% steps at 18 days per point, capping at 20% (360 days). The planner exploits
a property of this curve: the optimum is always a corner — 0% or 20%, never in between.

**Allocation solver.** `optimalSplit` is an efficiency-aware greedy allocator across three
levers (mint TH at 12 W/TH, upgrade existing efficiency, lock GMT), honoring a $0-miner
discount gate. In target mode, `solveCapitalForIncome` binary-searches the capital required
to hit a stated monthly income.

## Calibration

Economic constants are pinned in one block at the top of `scripts/constants.js` and mirrored
in `assets/app.js` / `assets/roi-embed.js`. Each carries the date it was last observed:

```js
const CONVERSION_FEE  = 0.0225;  // BTC→GMT payout skim (calibrated 2026-07-07)
const STAKING_APR     = 24.26;   // % — GMT locked-staking APR (observed 2026-09-08)
const COV_DAYS_PER_PCT= 18;      // 18 days of coverage per 1% discount (360d = 20% cap)
```

`constants.js` exists because a 2026-07-07 recalibration updated `index.html` but not the
page generator, leaving the SEO pages publishing a retired fee for three weeks. Recalibrate
all mirrors together.

## Stack

Vanilla JS, no build step for the site itself. Supabase for accounts, saved farms, global
chat and moderation roles. One Deno edge function (`supabase/functions/nft-lookup`) bridges
GoMining's CORS-less public NFT API for the marketplace checker — deliberately not a general
proxy: one upstream URL, a digits-only id, and an origin allowlist.

## Regenerating the SEO pages

```bash
NODE_OPTIONS= node scripts/gen-pages.js   # writes 33 HTML pages + sitemap.xml
```

Pages report **today** only — no break-even dates, no forward projections. Projections live
in the console. Regeneration is manual and intentional.

## Status

Live, actively developed. 730 commits, February–September 2026. A mobile app is in
development, targeting 2027.
