# URLS.md: frozen URL inventory for gmt-optimizer.com

Captured **2026-11-17** from the live site (`curl` against https://gmt-optimizer.com, GitHub Pages).
**This list is frozen.** Every URL below must answer on the overhaul preview, and later on production,
with the **same status code, the same redirect target and the same content** it has today. Phase 8 runs a
script against this file. New URLs may be added (as a new section); none may be removed or changed
without written approval.

### How GitHub Pages answers today (the behavior to preserve)
- **File pages** (`foo.html`): served at `/foo` **and** `/foo.html`, both 200. `/foo/` is a 404.
- **Folder pages** (`foo/index.html`): `/foo` **301 → `/foo/`**, and `/foo/` is 200.
- Canonicals, the sitemap and internal links all use the **extension-free, no-trailing-slash** form
  (`/console`, `/claim`). For folder pages that form is a 301 (see AUDIT.md, finding S-2).
- Linked anchors in use: `/#faq`.

## A. Indexed pages (in sitemap.xml)

The 30 sitemap URLs plus their alternate spellings. These rank. Highest-risk group.

| URL | Live response | Served file | robots meta | Title |
|---|---|---|---|---|
| `/` | 200 | `index.html` | index,follow,max-image-preview:large | GoMining Calculator: Profit, ROI & Earnings / GMT Optimizer |
| `/bitcoin` | 301 → `/bitcoin/` | `bitcoin/index.html` | (none) | Bitcoin Live Chart — 1H Candles / GMT Optimizer |
| `/bitcoin/` | 200 | `bitcoin/index.html` | (none) | Bitcoin Live Chart — 1H Candles / GMT Optimizer |
| `/claim` | 301 → `/claim/` | `claim/index.html` | index,follow,max-image-preview:large | Claim Your Funded First TH — GMT Optimizer |
| `/claim/` | 200 | `claim/index.html` | index,follow,max-image-preview:large | Claim Your Funded First TH — GMT Optimizer |
| `/console` | 301 → `/console/` | `console/index.html` | index,follow,max-image-preview:large | GoMining Console — Live Dashboard, Capital Planner & Projections / GMT |
| `/console/` | 200 | `console/index.html` | index,follow,max-image-preview:large | GoMining Console — Live Dashboard, Capital Planner & Projections / GMT |
| `/gmt` | 301 → `/gmt/` | `gmt/index.html` | (none) | GoMining Token (GMT) Live Chart — 1H Candles / GMT Optimizer |
| `/gmt/` | 200 | `gmt/index.html` | (none) | GoMining Token (GMT) Live Chart — 1H Candles / GMT Optimizer |
| `/gomining-1-th-roi` | 200 | `gomining-1-th-roi.html` | index,follow,max-image-preview:large | GoMining 1 TH: What It Actually Earns (2026) |
| `/gomining-1-th-roi.html` | 200 | `gomining-1-th-roi.html` | index,follow,max-image-preview:large | GoMining 1 TH: What It Actually Earns (2026) |
| `/gomining-10-th-roi` | 200 | `gomining-10-th-roi.html` | index,follow,max-image-preview:large | GoMining 10 TH: What It Actually Earns (2026) |
| `/gomining-10-th-roi.html` | 200 | `gomining-10-th-roi.html` | index,follow,max-image-preview:large | GoMining 10 TH: What It Actually Earns (2026) |
| `/gomining-100-th-roi` | 200 | `gomining-100-th-roi.html` | index,follow,max-image-preview:large | GoMining 100 TH: What It Actually Earns (2026) |
| `/gomining-100-th-roi.html` | 200 | `gomining-100-th-roi.html` | index,follow,max-image-preview:large | GoMining 100 TH: What It Actually Earns (2026) |
| `/gomining-25-th-roi` | 200 | `gomining-25-th-roi.html` | index,follow,max-image-preview:large | GoMining 25 TH: What It Actually Earns (2026) |
| `/gomining-25-th-roi.html` | 200 | `gomining-25-th-roi.html` | index,follow,max-image-preview:large | GoMining 25 TH: What It Actually Earns (2026) |
| `/gomining-250-th-roi` | 200 | `gomining-250-th-roi.html` | index,follow,max-image-preview:large | GoMining 250 TH: What It Actually Earns (2026) |
| `/gomining-250-th-roi.html` | 200 | `gomining-250-th-roi.html` | index,follow,max-image-preview:large | GoMining 250 TH: What It Actually Earns (2026) |
| `/gomining-5-th-roi` | 200 | `gomining-5-th-roi.html` | index,follow,max-image-preview:large | GoMining 5 TH: What It Actually Earns (2026) |
| `/gomining-5-th-roi.html` | 200 | `gomining-5-th-roi.html` | index,follow,max-image-preview:large | GoMining 5 TH: What It Actually Earns (2026) |
| `/gomining-50-th-roi` | 200 | `gomining-50-th-roi.html` | index,follow,max-image-preview:large | GoMining 50 TH: What It Actually Earns (2026) |
| `/gomining-50-th-roi.html` | 200 | `gomining-50-th-roi.html` | index,follow,max-image-preview:large | GoMining 50 TH: What It Actually Earns (2026) |
| `/gomining-500-th-roi` | 200 | `gomining-500-th-roi.html` | index,follow,max-image-preview:large | GoMining 500 TH: What It Actually Earns (2026) |
| `/gomining-500-th-roi.html` | 200 | `gomining-500-th-roi.html` | index,follow,max-image-preview:large | GoMining 500 TH: What It Actually Earns (2026) |
| `/gomining-discount-explained` | 200 | `gomining-discount-explained.html` | index,follow,max-image-preview:large | GoMining Discount & GMT Locking Explained (2026) |
| `/gomining-discount-explained.html` | 200 | `gomining-discount-explained.html` | index,follow,max-image-preview:large | GoMining Discount & GMT Locking Explained (2026) |
| `/gomining-marketplace-checker` | 200 | `gomining-marketplace-checker.html` | index,follow,max-image-preview:large | GoMining Marketplace Deal Checker — Is That Miner Worth the Price? |
| `/gomining-marketplace-checker.html` | 200 | `gomining-marketplace-checker.html` | index,follow,max-image-preview:large | GoMining Marketplace Deal Checker — Is That Miner Worth the Price? |
| `/gomining-profit-btc-100k` | 200 | `gomining-profit-btc-100k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $100k? (2026) |
| `/gomining-profit-btc-100k.html` | 200 | `gomining-profit-btc-100k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $100k? (2026) |
| `/gomining-profit-btc-150k` | 200 | `gomining-profit-btc-150k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $150k? (2026) |
| `/gomining-profit-btc-150k.html` | 200 | `gomining-profit-btc-150k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $150k? (2026) |
| `/gomining-profit-btc-200k` | 200 | `gomining-profit-btc-200k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $200k? (2026) |
| `/gomining-profit-btc-200k.html` | 200 | `gomining-profit-btc-200k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $200k? (2026) |
| `/gomining-profit-btc-250k` | 200 | `gomining-profit-btc-250k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $250k? (2026) |
| `/gomining-profit-btc-250k.html` | 200 | `gomining-profit-btc-250k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $250k? (2026) |
| `/gomining-profit-btc-75k` | 200 | `gomining-profit-btc-75k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $75k? (2026) |
| `/gomining-profit-btc-75k.html` | 200 | `gomining-profit-btc-75k.html` | index,follow,max-image-preview:large | Is GoMining Profitable if Bitcoin Hits $75k? (2026) |
| `/gomining-promo-code` | 200 | `gomining-promo-code.html` | index,follow,max-image-preview:large | GoMining Promo Code 2026: RINGO5 Bonus Explained |
| `/gomining-promo-code.html` | 200 | `gomining-promo-code.html` | index,follow,max-image-preview:large | GoMining Promo Code 2026: RINGO5 Bonus Explained |
| `/gomining-roi-calculator` | 200 | `gomining-roi-calculator.html` | index,follow,max-image-preview:large | GoMining ROI Calculator — What Your Setup Earns |
| `/gomining-roi-calculator.html` | 200 | `gomining-roi-calculator.html` | index,follow,max-image-preview:large | GoMining ROI Calculator — What Your Setup Earns |
| `/how-gomining-works` | 200 | `how-gomining-works.html` | index,follow,max-image-preview:large | How Does GoMining Work? A Beginner's Guide (2026) |
| `/how-gomining-works.html` | 200 | `how-gomining-works.html` | index,follow,max-image-preview:large | How Does GoMining Work? A Beginner's Guide (2026) |
| `/is-gomining-worth-it` | 200 | `is-gomining-worth-it.html` | index,follow,max-image-preview:large | Is GoMining Worth It in 2026? An Honest Breakdown |
| `/is-gomining-worth-it.html` | 200 | `is-gomining-worth-it.html` | index,follow,max-image-preview:large | Is GoMining Worth It in 2026? An Honest Breakdown |
| `/planner` | 301 → `/planner/` | `planner/index.html` | (none) | GoMining Capital Planner — Optimal TH / GMT Split / GMT Optimizer |
| `/planner/` | 200 | `planner/index.html` | (none) | GoMining Capital Planner — Optimal TH / GMT Split / GMT Optimizer |
| `/planner/projection` | 301 → `/planner/projection/` | `planner/projection/index.html` | (none) | GoMining Capital Planner Projection — Project Your Recommended Allocat |
| `/planner/projection/` | 200 | `planner/projection/index.html` | (none) | GoMining Capital Planner Projection — Project Your Recommended Allocat |
| `/privacy` | 200 | `privacy.html` | (none) | Privacy Policy — GMT Optimizer |
| `/privacy.html` | 200 | `privacy.html` | (none) | Privacy Policy — GMT Optimizer |
| `/projection` | 301 → `/projection/` | `projection/index.html` | (none) | GoMining Growth Projection — Multi-Year ROI Forecast / GMT Optimizer |
| `/projection/` | 200 | `projection/index.html` | (none) | GoMining Growth Projection — Multi-Year ROI Forecast / GMT Optimizer |
| `/rainbow` | 301 → `/rainbow/` | `rainbow/index.html` | index,follow,max-image-preview:large | Bitcoin Rainbow Chart — Power-Law Valuation Bands / GMT Optimizer |
| `/rainbow/` | 200 | `rainbow/index.html` | index,follow,max-image-preview:large | Bitcoin Rainbow Chart — Power-Law Valuation Bands / GMT Optimizer |
| `/terms` | 200 | `terms.html` | (none) | Terms of Use — GMT Optimizer |
| `/terms.html` | 200 | `terms.html` | (none) | Terms of Use — GMT Optimizer |

## B. Live tool and content pages not in the sitemap

Working pages people reach from the menu, embeds or shared links (several are noindex on purpose).

| URL | Live response | Served file | robots meta | Title |
|---|---|---|---|---|
| `/chat` | 301 → `/chat/` | `chat/index.html` | noindex,nofollow | GMT Optimizer — Chat |
| `/chat/` | 200 | `chat/index.html` | noindex,nofollow | GMT Optimizer — Chat |
| `/embed` | 301 → `/embed/` | `embed/index.html` | noindex,follow | GoMining ROI Calculator — GMT Optimizer |
| `/embed/` | 200 | `embed/index.html` | noindex,follow | GoMining ROI Calculator — GMT Optimizer |
| `/gomining-worth-it-now` | 200 | `gomining-worth-it-now.html` | index,follow,max-image-preview:large | Is GoMining Worth It in November 2026? |
| `/gomining-worth-it-now.html` | 200 | `gomining-worth-it-now.html` | index,follow,max-image-preview:large | Is GoMining Worth It in November 2026? |
| `/quote` | 301 → `/quote/` | `quote/index.html` | noindex,follow | Quote a GoMining Setup — Capital & Income Calculator / GMT Optimizer |
| `/quote/` | 200 | `quote/index.html` | noindex,follow | Quote a GoMining Setup — Capital & Income Calculator / GMT Optimizer |
| `/statement` | 301 → `/statement/` | `statement/index.html` | noindex,follow | Mining Income Statement from a GoMining CSV / GMT Optimizer |
| `/statement/` | 200 | `statement/index.html` | noindex,follow | Mining Income Statement from a GoMining CSV / GMT Optimizer |

## C. Redirect stubs

Old tool URLs that now meta-refresh into the console (`/console?view=…`). Keep them working exactly as they are. `/odds` stays noindex and out of the nav (rule 6).

| URL | Live response | Served file | robots meta | Title |
|---|---|---|---|---|
| `/combined` | 301 → `/combined/` | `combined/index.html` | index,follow,max-image-preview:large | Bitcoin + GMT on One Chart — Indexed Comparison / GMT Optimizer |
| `/combined/` | 200 | `combined/index.html` | index,follow,max-image-preview:large | Bitcoin + GMT on One Chart — Indexed Comparison / GMT Optimizer |
| `/edit` | 301 → `/edit/` | `edit/index.html` | noindex,follow | Edit Setup — GMT Optimizer |
| `/edit/` | 200 | `edit/index.html` | noindex,follow | Edit Setup — GMT Optimizer |
| `/odds` | 301 → `/odds/` | `odds/index.html` | noindex | GoMining Odds — Will Your Capital Pay Back? / GMT Optimizer |
| `/odds/` | 200 | `odds/index.html` | noindex | GoMining Odds — Will Your Capital Pay Back? / GMT Optimizer |

## D. Legacy and orphaned pages (live, unlinked)

Old full-app copies and prototypes. Not linked or in the sitemap, but publicly reachable. Frozen like everything else until you decide otherwise (AUDIT.md, finding D-1).

| URL | Live response | Served file | robots meta | Title |
|---|---|---|---|---|
| `/gomining-calc/src` | 301 → `/gomining-calc/src/` | `gomining-calc/src/index.html` | (none) | GoMining Reinvestment Calculator |
| `/gomining-calc/src/` | 200 | `gomining-calc/src/index.html` | (none) | GoMining Reinvestment Calculator |
| `/gomining-optimizer` | 200 | `gomining-optimizer.html` | (none) | GMT Optimizer |
| `/gomining-optimizer.html` | 200 | `gomining-optimizer.html` | (none) | GMT Optimizer |
| `/gomining-vip-index` | 200 | `gomining-vip-index.html` | (none) | GMT Optimizer |
| `/gomining-vip-index.html` | 200 | `gomining-vip-index.html` | (none) | GMT Optimizer |
| `/ob_research_dashboard` | 200 | `ob_research_dashboard.html` | (none) | OB Research - Late-Entry Fill Analysis |
| `/ob_research_dashboard.html` | 200 | `ob_research_dashboard.html` | (none) | OB Research - Late-Entry Fill Analysis |
| `/redesign-prototype` | 200 | `redesign-prototype.html` | noindex,nofollow | GMT Optimizer — Redesign Prototype |
| `/redesign-prototype.html` | 200 | `redesign-prototype.html` | noindex,nofollow | GMT Optimizer — Redesign Prototype |

## E. Approved removals (expected 404)

Removed on purpose with the owner's approval. The URL check expects **404** for these, not their old response.

| URL | Was | Expected now | Approved |
|---|---|---|---|
| `/carbon` | 301 → `/carbon/` | **404** | 2026-11-17 hotfix f01ba6450 (Carbon sales desk taken off the public site; it published its login) |
| `/carbon/` | 200 | **404** | same |

`robots.txt` also has `Disallow: /carbon/`.

## F. Feeds, embeds and site files

Read by other sites (ringomining.com reads `/api/rates.json` and `/assets/rates.js`) or by crawlers. Paths must not move.

| URL | Live response | Served file | robots meta | Title |
|---|---|---|---|---|
| `/CNAME` | 200 | — | (none) |  |
| `/api/rates.json` | 200 | — | (none) |  |
| `/assets/embed.js` | 200 | — | (none) |  |
| `/assets/rates.js` | 200 | — | (none) |  |
| `/assets/roi-embed.js` | 200 | — | (none) |  |
| `/gmt-optimizer-logo.svg` | 200 | — | (none) |  |
| `/og-image.png` | 200 | — | (none) |  |
| `/robots.txt` | 200 | — | (none) |  |
| `/sitemap.xml` | 200 | — | (none) |  |

## G. Committed junk that is technically live

`neon-miner/` (36 tracked files, including `node_modules` HTML such as
`/neon-miner/frontend/node_modules/tslib/tslib.html`, which returns 200). Not site content. It's listed
here so the URL check accounts for it; whether to remove it is a question for you (AUDIT.md D-2).
