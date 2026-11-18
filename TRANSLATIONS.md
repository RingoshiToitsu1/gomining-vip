# Translations: review list

Every Spanish, French and German string on the site was machine-translated in Phase 7 and **needs native review**
before it can be considered final. Nothing here is legal or financial wording reviewed by a professional.

Register (matches the existing /embed widget): **ES tú · FR vous · DE du**.

## Where the strings live
| What | File | How it's used |
|---|---|---|
| Page text, titles, meta, JSON-LD | `locales/es.json`, `locales/fr.json`, `locales/de.json` | keyed by the exact English text; `node scripts/gen-i18n.js` writes `/es/…`, `/fr/…`, `/de/…` |
| Which pages are translated | `locales/pages.json` | add a page once all its strings exist (`--missing` lists gaps) |
| Header, footer, account menu | `assets/site-chrome.js` (`STR`) | picks the language from `<html lang>` |
| Co-pilot | `assets/copilot/es.js`, `fr.js`, `de.js` | same nodes as `en.js` |
| Data pages (live numbers) | `scripts/data-pages-text.js` | templates; numbers come in through `c`, never typed |
| Quick-estimate widget (farm mode) | `assets/roi-embed.js` (`FARM`) | `/embed` keeps its own dollar-mode strings |
| JS interfaces (account pages, chat, checker) | `locales/<lang>.json` → `"ui"` | keyed by the English text; `{0}`, `{1}` are values; compiled to `assets/i18n/<lang>.js` |

## Rules for reviewers
- Keep HTML tags, `href`s, `class`es and `data-cfg` attributes exactly as they are; change only the words.
- Numbers that come from `data/config.json` (5 %, 25 TH, 30 and 90 days, 1 month, 18 days, 20 %, 360 days) must keep
  the phrasing the phrase rules in `scripts/build-config.js` look for, or they stop updating. The patterns are listed there.
- Never add an ended offer (rule 8). `node scripts/offer-check.js` must stay at 0.
- When the English text of a page changes, its old translation stops matching and that text shows in English until
  it's translated again. `node scripts/gen-i18n.js --missing` lists exactly those.

## Status
| Stage | Pages | ES | FR | DE |
|---|---|---|---|---|
| 7a | landing, /claim, /copilot, header/footer, co-pilot, quick estimate | machine | machine | machine |
| 7b | guides, FAQ, glossary, about, disclosures, privacy, terms, how-it-works, worth-it, discount, promo code, ROI calculator, marketplace checker (page text) | machine | machine | machine |
| 7c | 14 generated data pages + live blocks (templates in `scripts/data-pages-text.js`) | machine | machine | machine |
| 7d-1 | account pages (login, signup, profile, settings, dashboard), chat UI, marketplace checker results | machine | machine | machine |
| 7d-2 | console app (/console and its views; /planner, /projection, /planner/projection redirect to it) | machine | machine | machine |

## Notes for reviewers (7d-2, console)
- The console's text lives in three places in `locales/<lang>.json`:
  `"strings"` (the page's static HTML), `"dom"` (text the app writes at runtime, looked up by `assets/i18n-dom.js`)
  and `"ui"` (whole sentences `app.js` builds with markup, via `T()`).
- `"dom"` keys are the English text with every number and month abbreviation replaced by `{0}`, `{1}`… in order.
  Keep every placeholder; you may reorder them (dates do: `{0} {1}, {2}` = "Nov 17, 2026" → ES `{1} {0} {2}`).
- Not translated on purpose: GoMining's own names (VIP tiers like "Gold II", "Greedy Machine", "VeGoMining"), the
  GoMining app mock-ups in the setup tutorial (they show the app's real English labels), units, wallet addresses,
  the TradingView widget, and the English YouTube video title.
- Stream mode's overlay follows the page language; a streamer with a non-English audience may prefer English
  there. Easy to switch off if so.

## Notes for reviewers (7b)
- **Legal pages** (`/privacy`, `/terms`): **needs legal review before launch.** The privacy policy was rewritten on
  2026-11-18 and the terms' referral and acceptable-use clauses changed; English is binding and the translations say so
  ("this translation is for convenience; the English version prevails"). A lawyer, not a translator, should sign off
  both the English and the ES/FR/DE versions.
- **Live numbers**: the 14 data pages and the live block on `/is-gomining-worth-it` are templates in
  `scripts/data-pages-text.js` (7c). Keep every `${...}` placeholder; reword around them.
- **Card cashback wording** must keep "Carte" / "Karte" / "tarjeta" next to "cashback" (FR "bonus cashback Carte",
  DE "Karten-Cashback-Bonus"), or `scripts/offer-check.js` flags it as an ended offer.
- `"ui"` strings keep their `{0}`/`{1}` placeholders and `<b>` tags exactly; reword around them.
- French: avoid "remboursé(s)" for "pay back" (the offer check reads it as the ended cash-back offer); use "rentabilisé".
