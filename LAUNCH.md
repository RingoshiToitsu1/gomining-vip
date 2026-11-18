# LAUNCH.md: taking the overhaul live

Runbook for merging `overhaul` into `main` (gmt-optimizer.com, GitHub Pages, repo `RingoshiToitsu1/gomining-vip`).
**Nothing here happens without the owner.** Steps marked **OWNER** are yours; steps marked *Claude* I can run when you
say so. Every step lists how to check it worked and how to undo it.

Order matters in one place: **code first, SQL second.** The new site reads profiles through `get_my_profile()` and
falls back to the old read if that function doesn't exist yet, so the code can go live before the SQL. The reverse
is not true: today's live `account.js` reads `setup` straight from `profiles`, so running the exposure fix while the
old code is live would break login restores of saved farms.

---

## 0. Before launch day (gates: all must be green)

| # | Gate | How | Pass |
|---|---|---|---|
| G1 | Golden maths test | `node tests/golden.js` | 33/33 cases identical |
| G2 | Library tests | `node tests/lib.test.js` | 67 passed, 0 failed |
| G3 | Config applied everywhere | `node scripts/build-config.js --check` | "config in sync" |
| G4 | Translations in sync | `node scripts/gen-i18n.js --check` and `--missing` | "in sync", 0 missing |
| G5 | Ended offer nowhere (rule 8) | `node scripts/offer-check.js --quiet` on the built preview, all 4 languages | 0 matches |
| G6 | Frozen URLs (rule 1) | `node scripts/url-check.js https://ringoshitoitsu1.github.io` (checks every row of URLS.md) | 0 failures |
| G7 | No horizontal overflow, no leftover English | screenshot pass, 360 + 1280, 4 languages (AUDIT §24, §26a) | 0 overflow; only words valid in the language |
| G8 | Logged-in views | done 2026-11-18 (AUDIT Phase 8 checklist) | ✔ |
| G9 | Legal sign-off | `/privacy`, `/terms` in EN (binding) and ES/FR/DE | ✔ **owner-accepted, no lawyer review** (2026-11-18) |
| G10 | Social/OG images rebranded | AUDIT §13 | new images in place |
| G11 | No secrets in the repo | `git grep -nIE "(service_role|sk_live|-----BEGIN|PRIVATE KEY)" overhaul` | only 2 expected hits: this file (the pattern itself) and the Postgres role name `service_role` in `supabase/schema.sql` (a role, not a key). The Supabase *publishable* key is public by design |
| G12 | CNAME untouched | `git diff main overhaul -- CNAME` | empty |
| G13 | `/odds` still hidden | not in nav, sitemap or menu; `noindex` | ✔ |
| G14 | No analytics | `git grep -nIiE "gtag|googletagmanager|plausible|analytics\\.js" overhaul -- '*.html' '*.js'` | no hits |
| G15 | Native review of ES/FR/DE | TRANSLATIONS.md | **skipped for launch** (owner, 2026-11-18): machine translations ship; TRANSLATIONS.md kept for a later review |
| **G16** | **Indexable (blocking, before AND after launch)** | `node scripts/url-check.js <preview>` checks the build; after the merge `node scripts/url-check.js https://gmt-optimizer.com` checks the live responses (see below) | no site-wide noindex (meta robots or `X-Robots-Tag`), `robots.txt` has no `Disallow: /`, canonical/hreflang/og:url only on `https://gmt-optimizer.com`, no noindex outside the allowed list |

**G16 allowed noindex list** (anything else noindex fails): `/odds`, `/styleguide`, `/carbon/` (404 anyway), and the
retired redirect pages (`/gomining-optimizer`, `/gomining-vip-index`, `/neon-miner/…`, `noindex,follow`). Also allowed,
because they are **noindex on the live site today** and the overhaul keeps them that way: `/quote`, `/statement`,
`/edit`, `/embed`, `/chat`, `/redesign-prototype`, and the new account pages (`/login`, `/signup`, `/profile`,
`/settings`, `/dashboard`) with their ES/FR/DE copies. **Confirmed by the owner 2026-11-18: all stay noindex.**
The retired `/redesign-prototype` (redirect to `/`, `noindex,follow`) is on the list too.
The preview host is noindex + `Disallow: /` by design, so against the preview G16 reads the committed build files
(what production will serve); against gmt-optimizer.com it reads the live responses.

Nice to have the night before: back up the database (step 3a), so launch day is only merges and checks.

---

## 1. Launch day: freeze and final build (*Claude*, on your go)

1. Set the privacy date: `data/config.json` → `"legal": { "privacyUpdated": "<launch date YYYY-MM-DD>" }`.
2. Rebuild and re-run the gates:
   ```bash
   NODE_OPTIONS="" node scripts/build-config.js && node scripts/gen-pages.js && node scripts/gen-i18n.js && node scripts/build-config.js
   NODE_OPTIONS="" node tests/golden.js && node tests/lib.test.js && node scripts/build-config.js --check \
     && node scripts/gen-i18n.js --check && node scripts/offer-check.js --quiet && node scripts/bump-versions.js
   ```
3. Commit, push `overhaul`, rebuild the preview, re-run G6 (`url-check.js`) against the preview.
4. Open the merge PR `overhaul → main` (title only, no attribution lines). The diff is large; the PR body links
   AUDIT.md §§13–27 and this file.

**Check:** all gates green on the exact commit that will be merged.
**Undo:** nothing has changed on the live site yet.

## 2. Merge and deploy (**OWNER** merges; *Claude* watches)

1. **OWNER:** merge the PR on GitHub (merge commit, not squash, so a single revert undoes it).
2. `.github/workflows/deploy.yml` runs on the push to `main`: applies config, regenerates the data pages,
   builds the ES/FR/DE copies, publishes. About 2–4 minutes, then up to ~10 minutes of Pages CDN cache.
3. *Claude*, once the deploy is green:
   - `node scripts/url-check.js https://gmt-optimizer.com` → 0 failures (G6 + G16, now on production). **Blocking:** it
     fetches `https://gmt-optimizer.com/robots.txt` (200, no `Disallow: /`) and 5 key pages (`/`, `/console`,
     `/gomining-roi-calculator`, `/is-gomining-worth-it`, `/es/`) and confirms each is indexable (no noindex meta or
     header) with a canonical and a full hreflang block pointing at `https://gmt-optimizer.com`, never
     `ringoshitoitsu1.github.io`. Any failure here = roll back (step 2, Undo) before anything else.
   - Offer check on production pages (G5).
   - Spot checks, EN + one other language: `/`, `/console` (logged out: sign-up gate as before), `/planner`,
     `/quote`, `/statement`, `/gomining-marketplace-checker` (check a real miner link), `/chat`, `/login`.
   - Logged in (**OWNER** opens the debug Chrome window): console restores your saved farm, Settings opens,
     chat posts.

**Check:** URL check 0 failures; the spot checks match the preview.
**Undo (code):** `git revert -m 1 <merge-commit>` on `main` and push. The deploy republishes the old site in a
few minutes. **If the SQL in step 3 has already run, roll it back too (its rollback block), BEFORE or together
with the code revert**: the old code needs the old read access.

## 3. Database (**OWNER** runs the SQL; *Claude* checks)

Only after step 2 is live and the spot checks pass.

a. **Back up** (`supabase/proposals/README.md`): `pg_dump` of `profiles`, `miners`, `messages`, `auth.users` and the
   public schema, or the dashboard CSV export plus the read-only inspect results.

b. **Apply `supabase/proposals/2026-11-17_fix_profile_exposure.sql`** (required). Until it runs, any logged-in user can
   read every user's saved `setup`.
   *Claude* then re-checks every row of AUDIT §18b on production:
   - logged out: profiles' `setup` is not readable (0 rows / permission error on that column);
   - logged in: your own farm restores; another user's card shows TH via `profile_cards` but no `setup`;
   - chat user card, /profile, /dashboard, /settings, mod delete/ban all still work.

c. **Apply `supabase/proposals/2026-11-17_account_extras.sql`** (required: the new privacy policy promises these).
   *Claude* checks Settings: hide hashrate, language preference, and that **Delete account** asks for the password
   (test with a throwaway account, never the real one).

**Undo:** each SQL file ends with a rollback block. Data restore from the step-3a dump if ever needed.
`2026-11-17_chat_report_block.sql` is **not** part of launch (only when you approve report/block).

## 4. After launch

| When | What | Who |
|---|---|---|
| Day 0 | Google Search Console: resubmit `sitemap.xml` (it now lists the ES/FR/DE pages); URL-inspect `/`, `/es/`, `/console` | **OWNER** |
| Day 0 | `gomining.vip` redirect (separate repo) still lands on gmt-optimizer.com | *Claude* (curl) |
| Day 0–2 | Telegram/socials: the new OG images show (Telegram caches previews; send `/` once to refresh) | **OWNER** |
| Week 1 | Search Console coverage: no new 404s or "redirect error" pages; hreflang has no errors | *Claude* with your export |
| Week 1 | Weekly rates script still writes `api/rates.json` and ringomining.com reads it | *Claude* |
| When ready | Native review of ES/FR/DE; legal review notes folded in | **OWNER** |

## 5. SEO baseline: titles and H1s, live vs overhaul (for the 4-week Search Console comparison)

Top 20 pages by impressions from the last Search Console snapshot on file (`~/seo-data/latest.json`, 28 days to
**2026-08-10**; `/x` and `/x.html` combined). Live = gmt-optimizer.com on 2026-11-18; overhaul = the branch to be merged.
For four weeks after launch compare clicks, impressions and position per page against this table (take a fresh
snapshot the day before launch: `python3 scripts/gsc-snapshot.py --days 28`).

| # | Page | Clicks | Impr. | Avg pos | Title (live) | Title (overhaul) | H1 (live) | H1 (overhaul) |
|---|---|---|---|---|---|---|---|---|
| 1 | `/gomining-roi-calculator` | 7 | 257 | 8.6 | GoMining ROI Calculator — What Your Setup Earns | = same | GoMining ROI Calculator | = same |
| 2 | `/gomining-discount-explained` | 2 | 151 | 9.1 | GoMining Discount & GMT Locking Explained (2026) | = same | GoMining Discount & GMT Locking Explained | = same |
| 3 | `/is-gomining-worth-it` | 2 | 112 | 9.3 | Is GoMining Worth It in 2026? An Honest Breakdown | = same | Is GoMining Worth It in 2026? An Honest Breakdown | = same |
| 4 | `/` | 16 | 85 | 9.1 | GoMining Calculator: Profit, ROI & Earnings \| GMT Optimizer | GoMining Calculator: Profit, ROI & Earnings \| GMT-Optimizer | Plan your work.Work your plan. | Model your GoMining returns before you buy |
| 5 | `/gomining-promo-code` | 0 | 56 | 30.3 | GoMining Promo Code 2026: RINGO5 Bonus Explained | = same | GoMining Promo Code 2026: RINGO5 | = same |
| 6 | `/how-gomining-works` | 0 | 36 | 14.6 | How Does GoMining Work? A Beginner's Guide (2026) | = same | How Does GoMining Work? A Beginner's Guide | = same |
| 7 | `/terms` | 0 | 32 | 2.2 | Terms of Use — GMT Optimizer | Terms of Use — GMT-Optimizer | Terms of Use | = same |
| 8 | `/privacy` | 2 | 22 | 5.5 | Privacy Policy — GMT Optimizer | Privacy Policy — GMT-Optimizer | Privacy Policy | = same |
| 9 | `/gomining-250-th-roi` | 0 | 22 | 5.0 | GoMining 250 TH: What It Actually Earns (2026) | = same | GoMining 250 TH: What It Actually Earns | = same |
| 10 | `/claim` | 0 | 17 | 6.9 | Your RINGO5 Bonuses — GMT Optimizer | Your RINGO5 Bonuses — GMT-Optimizer | Your RINGO5 bonuses | = same |
| 11 | `/gmt` | 0 | 11 | 4.6 | GoMining Token (GMT) Live Chart — 1H Candles \| GMT Optimizer | GoMining Token (GMT) Live Chart — 1H Candles \| GMT-Optimizer | — | = same |
| 12 | `/gomining-profit-btc-250k` | 1 | 7 | 6.1 | Is GoMining Profitable if Bitcoin Hits $250k? (2026) | = same | GoMining Profitability at $250k Bitcoin | = same |
| 13 | `/gomining-profit-btc-150k` | 0 | 5 | 7.8 | Is GoMining Profitable if Bitcoin Hits $150k? (2026) | = same | GoMining Profitability at $150k Bitcoin | = same |
| 14 | `/gomining-profit-btc-200k` | 0 | 5 | 4.0 | Is GoMining Profitable if Bitcoin Hits $200k? (2026) | = same | GoMining Profitability at $200k Bitcoin | = same |
| 15 | `/planner` | 0 | 5 | 5.8 | GoMining Capital Planner — Optimal TH / GMT Split \| GMT Optimizer | GoMining Capital Planner — Optimal TH / GMT Split \| GMT-Optimizer | — | = same |
| 16 | `/gomining-50-th-roi` | 0 | 4 | 10.0 | GoMining 50 TH: What It Actually Earns (2026) | = same | GoMining 50 TH: What It Actually Earns | = same |
| 17 | `/gomining-profit-btc-100k` | 0 | 4 | 11.2 | Is GoMining Profitable if Bitcoin Hits $100k? (2026) | = same | GoMining Profitability at $100k Bitcoin | = same |
| 18 | `/gomining-1-th-roi` | 0 | 3 | 6.7 | GoMining 1 TH: What It Actually Earns (2026) | = same | GoMining 1 TH: What It Actually Earns | = same |
| 19 | `/gomining-10-th-roi` | 0 | 3 | 6.7 | GoMining 10 TH: What It Actually Earns (2026) | = same | GoMining 10 TH: What It Actually Earns | = same |
| 20 | `/gomining-500-th-roi` | 0 | 2 | 7.5 | GoMining 500 TH: What It Actually Earns (2026) | = same | GoMining 500 TH: What It Actually Earns | = same |

**What changes:** only the brand in titles ("GMT Optimizer" → "GMT-Optimizer", 6 pages) and the home page H1
("Plan your work. Work your plan." → "Model your GoMining returns before you buy"). Every other title and H1 is
identical. New in the overhaul: ES/FR/DE copies with hreflang (33 per language).

## 6. Contacts and references

- URL inventory and rules: `URLS.md`. Audit trail and every decision: `AUDIT.md`. Translations: `TRANSLATIONS.md`.
- SQL and backups: `supabase/proposals/` (README first).
- Preview: https://ringoshitoitsu1.github.io (rebuild: `gh workflow run preview.yml -R RingoshiToitsu1/ringoshitoitsu1.github.io`).
