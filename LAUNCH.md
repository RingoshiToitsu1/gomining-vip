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
| G9 | Legal sign-off | **OWNER** (with a lawyer): `/privacy`, `/terms` in EN (binding) and ES/FR/DE | written OK |
| G10 | Social/OG images rebranded | AUDIT §13 | new images in place |
| G11 | No secrets in the repo | `git grep -nIE "(service_role|sk_live|-----BEGIN|PRIVATE KEY)" overhaul` | no hits (the Supabase *publishable* key is public by design) |
| G12 | CNAME untouched | `git diff main overhaul -- CNAME` | empty |
| G13 | `/odds` still hidden | not in nav, sitemap or menu; `noindex` | ✔ |
| G14 | No analytics | `git grep -nIiE "gtag|googletagmanager|plausible|analytics\\.js" overhaul -- '*.html' '*.js'` | no hits |
| G15 | Native review of ES/FR/DE (optional before launch) | TRANSLATIONS.md | owner's call: machine translations can ship marked as such |

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
   - `node scripts/url-check.js https://gmt-optimizer.com` → 0 failures (same check as G6, now on production).
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

## 5. Contacts and references

- URL inventory and rules: `URLS.md`. Audit trail and every decision: `AUDIT.md`. Translations: `TRANSLATIONS.md`.
- SQL and backups: `supabase/proposals/` (README first).
- Preview: https://ringoshitoitsu1.github.io (rebuild: `gh workflow run preview.yml -R RingoshiToitsu1/ringoshitoitsu1.github.io`).
