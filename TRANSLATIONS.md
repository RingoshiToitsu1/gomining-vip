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
| 7d | console app (`app.js`), account pages, chat UI | – | – | – |

## Notes for reviewers (7b)
- **Legal pages** (`/privacy`, `/terms`): **needs legal review before launch.** The privacy policy was rewritten on
  2026-11-18 and the terms' referral and acceptable-use clauses changed; English is binding and the translations say so
  ("this translation is for convenience; the English version prevails"). A lawyer, not a translator, should sign off
  both the English and the ES/FR/DE versions.
- **Live numbers**: the 14 data pages and the live block on `/is-gomining-worth-it` are templates in
  `scripts/data-pages-text.js` (7c). Keep every `${...}` placeholder; reword around them.
- **Card cashback wording** must keep "Carte" / "Karte" / "tarjeta" next to "cashback" (FR "bonus cashback Carte",
  DE "Karten-Cashback-Bonus"), or `scripts/offer-check.js` flags it as an ended offer.
- The marketplace checker's results panel and the quick-estimate dollar mode are JavaScript text: 7d.
