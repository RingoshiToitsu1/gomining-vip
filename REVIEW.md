# REVIEW.md: gmt-optimizer.com overhaul, final review

Branch `overhaul` (RingoshiToitsu1/gomining-vip), 120 commits ahead of `main`, 356 files changed. Nothing is on `main`;
the launch is yours to approve (LAUNCH.md). Preview: https://ringoshitoitsu1.github.io (noindex, CNAME stripped).
Detailed record of every finding and decision: AUDIT.md. URL inventory: URLS.md. Translations: TRANSLATIONS.md.

## 1. What changed

| Phase | Result |
|---|---|
| 1 Brand system | `tokens.css` (single source of colours, type, spacing) + `components.css` (cards, stat tiles, buttons, fields, tabs, tables, accordions, notices, toasts); new GMT-Optimizer wordmark and favicons |
| 2 Information architecture | one global header and footer (`site-chrome.js`), menu drawer, new pages: /guides, /faq, /glossary, /about, /disclosures |
| 3 Landing page | rebuilt on the components; live figures strip; quick estimate |
| 4 Data layer | `data/config.json` single source for prices, fees, rates and RINGO5 terms (build fails on an invalid config); chart kit `charts.js` |
| 5 Accounts | login, signup, profile, settings, dashboard; Supabase changes prepared as reviewed SQL (not applied) |
| 6 Chat and co-pilot | community chat (panel, /chat, widget Messages tab), scripted co-pilot (/copilot + widget) |
| 7 Languages | full ES / FR / DE copies (39 pages each incl. account pages), hreflang + sitemap, runtime dictionary for the console, local number and date formats |
| Parts 1–3 (pre-8) | site-wide removal of the old visuals (525-row audit); console rebuilt on one template for all six tabs; every loading screen rewritten (real steps only, ≤0.6 s minimum) |
| v3 polish (walkthrough) | header and tool card say "New to GoMining?" (was "RINGO5 Bonuses"); v3 badge and a self-drawing earnings curve in the hero; ▲/▼ % change on BTC and GMT (24 h) and on difficulty and sats/TH/day (last adjustment), green = good for a miner, on the landing, console and quote strips; soft cross-fade between pages and a light fade-up of each page's text, replayed on console tabs; loaders: continuously moving sheen, bar finishes before closing, overlays fade in. Nothing moves with reduced motion |
| Pre-launch round (owner walkthrough 2) | state-aware start button (see §4a); dashboard empty state led by "Build my farm"; sign-up onboarding lines; v3 badge ends by itself 60 days after `launch.date` in `data/config.json`; tooltips on difficulty and sats/TH/day (tap or hover, 4 languages); performance pass (§4b) |
| Final polish (owner) | hero curve rebuilt (dots on the line at every width, full stroke); hover is colour-only and 150 ms everywhere, nothing moves, focus ring on every control (AUDIT §29); **Live Meter** replaces Stream mode: one calm per-second earnings counter, 3 quiet themes, screensaver behaviour, streaming extras in a drawer (AUDIT §31) |
| 8 Quality and launch | URL check, indexability gate, link check, accessibility check, OG images rebranded, tables pass, LAUNCH.md runbook, SEO baseline |

## 2. Rules: how each was kept

| Rule | Status |
|---|---|
| No existing URL changes | `scripts/url-check.js`: 203 URLs (URLS.md + sitemap) answer as frozen on the preview, 0 failures. Approved exceptions only: `/carbon` removed (404); four retired copies and `/redesign-prototype` turned into redirect pages, still 200 at the same URLs |
| CNAME untouched | `git diff main overhaul -- CNAME` is empty |
| All features keep working | golden maths test 33/33 after every step; 67/67 library tests; screenshot passes in 4 languages, logged out and logged in |
| No backend change without OK | all Supabase changes are SQL files in `supabase/proposals/`, none run; you apply them (LAUNCH.md §3) |
| No secrets | only the public Supabase publishable key; secret scan: 2 known false positives |
| /odds hidden | noindex, not in nav, menu or sitemap |
| No GoMining trade dress | own brand; the setup tutorial's small app mock-ups keep GoMining's labels so users can find the real screens |
| Rule 8 (ended offer nowhere) | offer check 0 on every page, all languages |
| No analytics | none |
| No Claude attribution | none in commits or files |

## 3. Gates (LAUNCH.md), current commit

| Gate | Result |
|---|---|
| G1 golden test | 33/33 |
| G2 library tests | 67/67 |
| G3 config / G4 translations | in sync; 0 missing |
| G5 offer check | 0 |
| G6 URL check (preview) | 203 URLs, 0 failures |
| G7 overflow / leftover English | 0 overflow at 360 and 1280 in all 4 languages (incl. the Live Meter at 360/1280/1920/1080×1920); only words valid in the language; hover moves nothing (416 elements hovered across 4 languages) |
| G8 logged-in views | done (test account with a fake farm, your OK) |
| G9 legal | **owner-accepted, no lawyer review** |
| G10 OG images | 26 rebranded |
| G11 secrets | clean (2 expected hits) |
| G12 CNAME | unchanged |
| G13 /odds | hidden |
| G14 analytics | none (the pattern matches the word "plausible" in two code comments) |
| G15 native review | **skipped for launch** (machine translations ship; TRANSLATIONS.md kept) |
| G16 indexable | build: no noindex outside the allowed list, robots.txt allows crawling, canonicals/hreflang on gmt-optimizer.com. Re-run on production after the merge (blocking) |
| G17 links | 2,975 internal links across 174 pages, 0 broken |
| G18 accessibility (static) | 0 errors; 29 warnings (headings built by script; one h1 per console tab) |
| G19 performance | Lighthouse ≥ 90 everywhere: lowest 97 (console mobile), every other page/form factor 97–100; first screen never hidden at load (table §4b) |

## 4. What to expect at launch

- **URLs:** identical. New: the ES/FR/DE pages and the pages listed in URLS.md §I.
- **Search:** titles and H1s of the top 20 pages are unchanged except the brand spelling in 6 titles
  ("GMT Optimizer" → "GMT-Optimizer") and the home page H1. Baseline table: LAUNCH.md §5. New hreflang may bring
  ES/FR/DE impressions within weeks.
- **Logged-in users:** saved farms restore as before. The new code reads profiles through `get_my_profile()` when it
  exists and falls back otherwise, so it works before and after the SQL.
- **Look:** one design across every page and all six console tabs; no glow, particles, cinematic loaders or count-ups.
- **Speed you will notice:** the console opens up to ~2 s sooner (boot screen min 2.4 s → 0.6 s), the planner answers
  ~2.3 s sooner, the quote appears instantly.

## 4a. Start button (header, menu, landing hero and closing band)

| Visitor | Label | Goes to | After |
|---|---|---|---|
| logged out | Get Started / Empezar / Commencer / Loslegen | /signup | sign-up lands on /dashboard |
| logged in, no saved farm | Set up my farm / Configurar mi granja / Configurer ma ferme / Farm einrichten | Edit farm in the console | Save returns to /dashboard (tested) |
| logged in, farm saved | Dashboard / Panel / Tableau de bord / Dashboard | /dashboard | |

"New to GoMining?" stays on /claim. First paint shows the logged-out label; all three labels share one cell, so the
button is always as wide as the longest one and the swap never moves the layout (measured: same width in every state,
no clipping at 360 px in FR/DE). "Saved farm" = the profile's `setup` has hashrate, read through `get_my_profile()`
when the SQL is applied and the table before that, so it works on both sides of the launch SQL.

## 4b. Performance (Lighthouse 12, performance only, median of 3, preview build)

| Page | Before v3 mobile | Final mobile | Before v3 desktop | Final desktop |
|---|---|---|---|---|
| / | 97 | 100 | 92 | 97 |
| /console | **81** | **99** | 95 | 100 |
| /claim | 97 | 100 | 99 | 100 |
| /es/ | 97 | 100 | 98 | 100 |

The console was already under 90 before v3. What changed: Google Fonts no longer block the first paint (metric-matched
fallback fonts keep text from jumping when they swap in); the console's scripts start right after its first frame; an
old fade that started the console at opacity 0 is gone; space is held for the header, the strip's change lines, the
price badge, the YouTube card and the Stream mode button, so nothing drops when data arrives. The text entrance no
longer hides anything on the first screen: only blocks below the fold fade in as they scroll into view, and only when
JavaScript runs (checked: no first-screen element below full opacity at load; every page readable with JavaScript off).

Loaders, measured in the browser on the test farm (main-thread tasks over 50 ms = the page freezing):

| Loader | Before | Now |
|---|---|---|
| Console boot screen | 3.5 s, 1.7 s without a frame | 1.3–1.9 s, longest pause 0.1 s |
| Planner (amount / target) | 0.34 / 0.32 s | 0.35 / 0.34 s (they never froze) |
| Growth projection 5 years | 2.6 s, froze 132 ms | 1.4 s, no freeze |
| Growth projection 10 years | 2.9 s, froze 453 ms (≈2 s on a phone) | 1.5 s, no freeze, frames every ≤ 24 ms |

The lag was the projection: it simulates every day (3,650 for 10 years) in one block, and its loader played a fixed
1.5 s animation before even starting. It now runs in ~20 ms slices next to a ~1 s animation of the real paths. Same
code in the same order: with the clock frozen, the one-go and sliced runs give bit-identical results for 1, 5 and
10 years. A price lookup that read a checkbox thousands of times per run now reads it once per slice.

## 5. Known limits and risks

| Item | Why it's acceptable / what to watch |
|---|---|
| Machine translations (ES/FR/DE) | marked as such; native review later (TRANSLATIONS.md). Legal pages state English prevails |
| No lawyer review of /privacy, /terms | your decision (G9) |
| The privacy policy promises account features that need `account_extras.sql` | run it right after the exposure fix (LAUNCH.md §3c) |
| Until `fix_profile_exposure.sql` runs, logged-in users can read others' saved `setup` | this is true on the live site today too; the SQL fixes it right after the merge |
| Accessibility check is static | it reads the HTML; content built by scripts is covered by the screenshot passes, not by an automated WCAG engine (running axe in your logged-in browser was blocked as a safety measure) |
| Statement checked with a synthetic CSV | the maths is covered by the golden tests; layout verified with 398 rows |
| GoMining app mock-ups stay English in all languages | deliberate: they mirror the real app the user will open |
| Old Search Console data | the baseline uses the snapshot to 2026-08-10; take a fresh one the day before launch |
| Pages CDN cache | after the merge, changes can take ~10 minutes to show everywhere |

## 6. After launch (from LAUNCH.md §4)

Resubmit the sitemap in Search Console; check the gomining.vip redirect; refresh link previews in Telegram; week 1:
coverage and hreflang reports, rates feed for ringomining.com; later: native review of the translations.

## 7. Evidence

Screenshots (Windows `%TEMP%\gmtshots\`): `cshots-final` (console, 4 languages × 2 widths), `logged2` (logged in,
4 × 2), `after6` (six tabs, side by side with the landing page), `part1` (content pages), `loaders` (each loading
screen mid-load), `stmt-*.png`, `planres-*.png`. Audit sections: AUDIT.md §13–28.
