# AUDIT.md: gmt-optimizer.com, Phase 0

Audited **2026-11-17** at `main` 734ef393a, on branch `overhaul`. No site code was changed in Phase 0.
Companion file: **URLS.md**, the frozen URL inventory (96 live URL variants with their exact responses).

---

## 1. What the site is, technically

| | |
|---|---|
| Hosting | GitHub Pages, repo `RingoshiToitsu1/gomining-vip` (public). `CNAME` = `gmt-optimizer.com`. |
| Deploy | `.github/workflows/deploy.yml`, on push to `main`: regenerates the data pages (`scripts/gen-pages.js`), then publishes **every non-hidden file in the repo**. |
| Build step | None for pages. Plain HTML + vanilla JS. Two Node generators: `scripts/gen-pages.js` (14 data pages, sitemap) and `scripts/set-rates.js` (weekly rates and the TH sale). |
| Backend | Supabase project `cbatlxqlmeyuhwqpczpv` (see §3). |
| Forms | Formspree `xojokqwe` (used by `/claim` and the co-pilot). |
| Analytics | **None installed.** No GA, Plausible, Clarity or Cloudflare beacon anywhere. |
| Fonts | Google Fonts: Space Grotesk + Share Tech Mono; Fontshare on some pages. |

### Repo map (176 tracked files)

| Area | Files |
|---|---|
| **Pages (root)** | `index.html` (landing) · 8 SEO guides (`how-gomining-works`, `is-gomining-worth-it`, `gomining-promo-code`, `gomining-discount-explained`, `gomining-roi-calculator`, `gomining-marketplace-checker`, `privacy`, `terms`) · 14 generated data pages (`gomining-{1..500}-th-roi`, `gomining-profit-btc-{75k..250k}`, `gomining-worth-it-now`) |
| **Pages (folders)** | `console/` (the main app) · `claim/` · `chat/` · `quote/` · `statement/` · `embed/` · redirect stubs `bitcoin/ gmt/ combined/ planner/ planner/projection/ projection/ edit/ odds/` · `rainbow/` |
| **App scripts** (`assets/`) | `app.js` (5,997 lines: calculator, planner, projection engine) · `pricing.js` (the single price source) · `account.js` (auth, profiles) · `chat.js` (global chat, presence) · `copilot.js` (scripted co-pilot) · `fleet.js` · `odds.js` · `futures.js` · `visualizer.js` · `loaders.js` · `boot.js` · `chrome.js` · `menu.js` (site-wide hamburger) · `site.js` · `roi-embed.js` · `quote.js` · `market-check.js` · `statement.js` · `rates.js` / `embed.js` (read by other sites) · `chart-shot.js` · `cine.js` |
| **Stylesheets** | `app.css` (1,595 lines) · `design.css` · `content.css` · `topbar.css` · `accounts.css` · `copilot.css` · `roi-embed.css` · `market-check.css` · `odds.css` · `futures.css` |
| **Data** | `api/rates.json` (public rates feed) · `sitemap.xml` · `robots.txt` |
| **Backend source** | `supabase/schema.sql` · `supabase/functions/nft-lookup/index.ts` |
| **Images** | ~30 `og-*.png` social cards, tutorial screenshots, `gmt-optimizer-logo.svg`, `site-logo.png`, `gomining-logo.png` |
| **Not site content, but published** | `carbon/` · `neon-miner/` (36 files incl. `node_modules`) · `realtime_agent.py` · `ob_research_dashboard.html` · `redesign-prototype.html` · `gomining-calc/` · `README.md` |

---

## 2. URL facts that shape the whole overhaul

- **S-1. Two URL shapes, and both must survive.** File pages answer at `/x` and `/x.html` (200). Folder
  pages answer `/x` → **301** → `/x/`. GitHub Pages does this by itself; Netlify, Vercel and Cloudflare
  each do it differently by default. **The preview host must reproduce it exactly**, or the URL check
  in Phase 8 proves nothing (see §8).
- **S-2. Canonicals point at redirects.** `/console`, `/claim`, `/rainbow` and the other folder pages
  declare a no-slash canonical that 301s to the slash form. Google copes, but it's wasted crawl. **I
  won't change it** (rule 1). I'm flagging it as an option for later: changing the canonical tags only
  would leave every URL working.
- **S-3. The sitemap lists five redirect stubs** (`/bitcoin`, `/gmt`, `/planner`, `/projection`,
  `/planner/projection`) as indexable pages, though each just meta-refreshes into `/console?view=…`.
  Same as S-2: they stay, flagged for later.
- **S-4. `/gomining-worth-it-now` canonicalises to `/is-gomining-worth-it`.** That's intentional (a
  monthly-refreshed variant). Keep it.
- Internal links are healthy: **0 broken** across live pages (the only 2 broken refs are inside the
  orphaned `gomining-calc/`). A few older links still use `.html` (`/terms.html`, `/privacy.html`);
  both forms work.

---

## 3. Backend (Supabase), documented as it is

**Auth: username + password only.** `account.js` turns a username into a synthetic email
(`emailFor(username)`) and calls `signUp` / `signInWithPassword`. A trigger (`auto_confirm`) stamps every
new account confirmed. **There is no real email on file**, so:
- no password-reset email and no magic link are possible today;
- there are **no auth redirect or callback URLs** in use (no OAuth, no email links), so new pages, the
  preview domain and the `/es/ /fr/ /de/` folders need **no auth configuration changes**.

**Tables** (all RLS-protected; `supabase/schema.sql`):

| Table | Columns that matter | Policies |
|---|---|---|
| `profiles` | `id`→auth.users, `username`, `display_name`, `avatar_url`, `bio`, `role` (user/mod/admin), `banned`, `th_total`, `setup` jsonb (the saved console setup and total discount) | read: everyone · insert/update: own row · mods may update · `guard_role` trigger blocks self-promotion |
| `miners` | `user_id`, `th`, `wth` (the cloud fleet) | own rows only |
| `messages` | `user_id`, `body` (1–500 chars), `avatar_url`, `created_at` | read: everyone · insert: own, not banned · delete: own or mod |

**Storage:** bucket `avatars` (public read, write to your own folder).
**Realtime:** channel `chat-room` (postgres_changes INSERT/DELETE on `messages`) + channel `online` (presence count).
**Edge function:** `nft-lookup` (marketplace checker), a CORS proxy to GoMining's public NFT API with an
**origin allowlist**: `gmt-optimizer.com`, `www.gmt-optimizer.com`, `ringoshitoitsu1.github.io`.
**Public keys:** `assets/supabase-config.js` ships the URL and the *publishable* key, which is safe by design
(RLS is the gate). No secrets in the repo.

**How the front end talks to it:** `supabase-js@2` from jsDelivr, created once in `account.js`; `chat.js`,
`fleet.js` and the console reuse that client. The marketplace checker and `/statement` read profile setup
over plain REST.

---

## 4. Features that work today

| Feature | Where | How it works |
|---|---|---|
| **Calculator / console** | `/console` (+ stubs) | `app.js`: live BTC (CoinPaprika, mempool, Kraken, Coinbase, Bitget, Binance fallbacks), GMT price, difficulty (mempool). Earnings net of electricity ($0.05/kWh), service fee, discount, BTC→GMT conversion. VIP tiers, GMT coverage discount, solo mode, click streak. |
| **Capital planner** | `/console` (`/planner` stub) | Invest-an-amount / target-an-income modes, optimal split across lock GMT / buy TH / upgrade efficiency. |
| **Growth projection** | `/console` (`/projection` stub) | Halving and difficulty-decay model, reinvest allocator, 4,000-futures Monte Carlo (`futures.js`). |
| **ROI calculator widget** | `/gomining-roi-calculator`, `/is-gomining-worth-it`, `/embed` | `roi-embed.js`; `/embed` is iframed on other sites and already has **FR/ES/DE** strings. |
| **Quote tool** | `/quote` (noindex) | `quote.js`. |
| **Marketplace checker** | `/gomining-marketplace-checker` | `market-check.js` + `nft-lookup`. |
| **Income statement** | `/statement` (noindex) | GoMining CSV → statement, `statement.js`. |
| **Rebate / "funded first TH" claim** | `/claim` | Form → Formspree `xojokqwe`. Copy: *"I fund your first TH and message you to help get your farm started."* |
| **Co-pilot** | Floating on every page | `copilot.js`: scripted node graph (`NODES`: say / links / opts / ask), sends the username to the same Formspree form, hands off to Telegram `t.me/RinGoMining` or SMS. No AI, no API. |
| **Accounts** | Console modal | Sign up, log in, change password (`updateUser`), log out, avatar upload, bio, display name. |
| **Profiles** | `openProfile` modal | There is **no profile URL**: profiles open as a modal from chat and the console. |
| **Cloud fleet + setup** | Console | `miners` table + `profiles.setup`; one fleet per saved setup. |
| **In-app chat** | `/chat` (noindex) + console | **One global room**, realtime, online count, mods can delete, banned users can't post. |
| **Charts** | `/rainbow`, console views | Rainbow chart, BTC/GMT candles, combined chart. |
| **Odds** | `/odds` (noindex, hidden) | Monte Carlo payback odds. |
| **Rates feed** | `/api/rates.json`, `/assets/rates.js` | Read by ringomining.com. |

---

## 5. Where the brief and the codebase disagree (need your call)

These decide scope. Nothing here is done until you answer.

| # | The brief says | What actually exists | My recommendation |
|---|---|---|---|
| **Q1** | Rebuild the in-app chat with a **conversation list, DMs, unread counts, report/block** | **One global room.** No DM, conversation, read-receipt or block tables. | Phase 6 restyles the global room as a channel. DMs and unread counts need **3 new tables + RLS** (`conversations`, `conversation_members`, `message_reads`) and a `reports` table. I'll write the exact SQL for approval before Phase 6. |
| **Q2** | Password reset / magic link, email in Settings | **No real emails exist** (username login). | Keep username login as is. Offer an *optional* "add a recovery email" later, which is a backend change for approval. |
| **Q3** | Dashboard with **rebate claim history/status** | Claims go to Formspree only; nothing is stored. | The dashboard shows what exists (saved setups, fleet, profile). Claim history would need a `claims` table: propose it or drop it. |
| **Q4** | Settings: **language preference, notification prefs, delete account** | No columns for these; deleting a user needs a service-role edge function. | Language goes in `localStorage` (no backend). Notifications: there are none to configure, so drop it. Delete account: an edge function, for approval. |
| **Q5** | **`/chat`** for the co-pilot page | **`/chat` already exists** (the global chat). | Leave `/chat` as the community chat. Put the co-pilot full page at **`/copilot`** (free). |
| **Q6** | New `/privacy`, `/terms` | **Both exist** (and are in the sitemap). | Restyle the existing ones in place. New: `/faq`, `/glossary`, `/disclosures`, `/dashboard`, `/settings`, `/styleguide`, `/copilot`. All checked: no collisions. |
| **Q7** | "Calculator", "Rebate" in the nav at their URLs | There's no `/calculator` and no `/rebate`. The calculator is **`/console`** (app) + **`/gomining-roi-calculator`** (widget); the rebate is **`/claim`**. | Nav labels map to the existing URLs. `/es/` mirrors use the real paths (`/es/console`, `/es/claim`…). |
| **Q8** | "No *free* language", and keep the offer "worded exactly as in current copy" | Current indexed copy on `/gomining-promo-code` says *"plus a **free** offer to fund your first TH"*, *"free setup help"*, and has an FAQ *"Is the RINGO5 bonus free?"* | These rules contradict. Pick one: (a) remove "free" from those lines (small title/snippet risk on a ranking page), or (b) keep that page's wording and use no-"free" copy everywhere new. I'd go with (a), but only on body copy, not the FAQ question. |
| **Q9** | "Never write a fixed fee percentage in copy" | Indexed guides explain specific numbers: the 2% USD→GMT fee, the 5% NFT discount, per-step upgrade prices ($2.67/TH). | Prices (upgrade $/TH) aren't fees, so they stay. Fee percentages get pulled from config and shown as "currently X%, may change", not removed from guides that rank on them. Confirm? |
| **Q10** | Preview on Netlify/Vercel | None set up; no CLI login on this machine. | See §8: a GitHub Pages preview reproduces production URL behavior exactly; Netlify doesn't. |
| **Q11** | Phase 1 removes "all old branding" | The old logo files (`gmt-optimizer-logo.svg`, `site-logo.png`) are referenced by **every page** and by the og-image generators. | Keep the old **file paths** (other sites, caches and old shares point at them) and replace their contents with the new mark. New files go in `/assets/brand/`. |
| **Q12** | Lighthouse Performance ≥ 90 on every page | `/console` loads a 6,000-line app, supabase-js from a CDN, and 13 scripts. | Achievable on content pages. On `/console` it needs script deferral and code-splitting: likely, not guaranteed. I'll report honestly in REVIEW.md. |
| **Q13** | Calculator outputs must match current numbers, with a test | There's already a headless harness pattern (app.js in a Node vm). | A golden-output test: snapshot today's outputs for ~30 input sets, then every phase must reproduce them. |

---

## 6. Findings to clean up (no URL changes)

- **X-1. Carbon sales desk: REMOVED (hotfix `f01ba6450` on `main`, 2026-11-17).** `carbon/index.html` was
  published at gmt-optimizer.com/carbon/ with the desk's login in plain text. It is now untracked and
  git-ignored (your local `~/carbon/` copy is kept), `robots.txt` disallows `/carbon/`, and URLS.md lists
  `/carbon` and `/carbon/` as approved removals (expected 404). Nothing on the site linked to it, and it
  was never in the sitemap.
  **Carbon's backend, as found:** none on this site. It has **no Supabase tables, users, storage or edge
  functions**. Its "login" was a hard-coded username/password check in the page's own JavaScript, and its
  data lived in the browser. It called `api.anthropic.com/v1/messages` directly from the page with **no
  API key in the file** (so no key was exposed). Nothing to delete on the backend.
  **Still to do on your side:** the old page is still readable in this public repo's git history (and
  possibly in search caches), so treat that password as public and change it wherever it's still used.
- **D-1. Legacy full-app copies:** `gomining-optimizer.html`, `gomining-vip-index.html` (old inline app with
  **stale prices and VIP tables**), `redesign-prototype.html`, `ob_research_dashboard.html`,
  `gomining-calc/` (broken image refs). Live but unlinked. Recommendation: add `noindex` (URL keeps working).
- **D-2.** `neon-miner/` (36 files incl. `node_modules`) and `realtime_agent.py` are published.
  Recommendation: exclude from the deploy (changes URLs, so it needs your OK).
- **H-1. Hard-coded numbers still duplicated:** prices are already single-source (`assets/pricing.js`), but
  fees and rates (`ELEC_RATE`, `SERVICE_RATE`, `CONVERSION_FEE`, staking APR, solo/click-streak %) live in
  6 files, and the **VIP tier table in 3** (`app.js`, `roi-embed.js`, `quote.js`). Phase 4 moves them into
  one config module next to `pricing.js`.
- **H-2. Inline styles:** `console/index.html` has 142 `style=""` attributes; the rest of the live pages are low.
- **H-3. Two parallel design systems:** `design.css` (landing/console) and `content.css` (guides), plus
  per-tool sheets. The Phase 1 tokens replace both.
- **H-4. GoMining trade dress:** `gomining-logo.png` is in the repo but referenced only by the legacy copies
  in D-1. Nothing live uses GoMining's logo. Good. Descriptive mentions only.
- **H-5. Telegram:** code uses `t.me/RinGoMining`; the brief says `@RingoMining`. Same account (handles are
  case-insensitive), so it stays as is.

---

## 7. Proposed sitemap (existing URLs unchanged)

```
/                                  Home (restructured in place, Phase 3)
├─ Tools
│  ├─ /console                     Calculator, planner, projection (the app)
│  ├─ /gomining-roi-calculator     ROI calculator
│  ├─ /gomining-marketplace-checker
│  ├─ /claim                       Funded-first-TH claim (the "Rebate")
│  ├─ /copilot          NEW        Co-pilot full page (Q5)
│  └─ /chat                        Community chat (exists)
├─ Learn
│  ├─ /how-gomining-works  /is-gomining-worth-it  /gomining-discount-explained  /gomining-promo-code
│  ├─ 14 data pages (/gomining-*-th-roi, /gomining-profit-btc-*, /gomining-worth-it-now)
│  ├─ /faq              NEW    /glossary   NEW
├─ Account (noindex)
│  ├─ /dashboard        NEW    /settings   NEW
├─ Legal
│  ├─ /privacy  /terms  (exist)    /disclosures  NEW
├─ Hidden: /odds (noindex, out of nav) · /styleguide NEW (noindex) · /quote /statement /embed (noindex, as today)
└─ Language mirrors: /es/…, /fr/…, /de/… of every indexable English page (Phase 7)
```

---

## 8. Preview deploy: two options

**Option A (recommended): a second GitHub Pages site.** Create the repo
`RingoshiToitsu1/ringoshitoitsu1.github.io` (public, empty). A script I add builds the `overhaul` branch into
it with: **CNAME stripped** (so it can never claim gmt-optimizer.com), `robots.txt` = `Disallow: /`, and
`<meta name="robots" content="noindex,nofollow">` injected into every page.
- Preview URL: **https://ringoshitoitsu1.github.io/**, served at the domain root, so `/console` paths work unchanged.
- **The same server as production**, so the trailing-slash and `.html` behavior in URLS.md match one to one.
- That origin is **already on the `nft-lookup` allowlist**, so the marketplace checker works with no backend change.
- Supabase works from any origin (no redirect URLs in use).
- Your step: approve, and I create the repo with `gh` (it's on your account, public).

**Option B: Netlify.** app.netlify.com → *Add new site → Import from Git → GitHub* →
`RingoshiToitsu1/gomining-vip` → branch **`overhaul`**, build command empty, publish directory `.`. I'd add
`netlify.toml` with an `X-Robots-Tag: noindex` header. Downsides: Netlify's slash and `.html` handling
differs from GitHub Pages, so URL-check results won't transfer to production one to one. The
`nft-lookup` allowlist would also need the `*.netlify.app` origin, which is a backend redeploy.

---

## 9. i18n plan (Phase 7, summarized)

- **No framework, no runtime routing.** A Node generator (same pattern as `gen-pages.js`) reads each English
  page template plus `/locales/{es,fr,de}.json` and **writes static files** to `/es/…`, `/fr/…`, `/de/…`,
  mirroring each path's shape (file page → file page, folder page → folder page), so the new URLs
  behave like the English ones. English output stays at today's paths.
- Generated files are **committed** (reviewable diffs, and Pages serves them with no build step), and
  also regenerated in deploy like the data pages.
- JS UI strings (console, chat, co-pilot, widget) load `/locales/<lang>.json`; the co-pilot script moves to
  `/locales/copilot.<lang>.json` (Phase 6). Numbers and dates via `Intl.NumberFormat` / `Intl.DateTimeFormat`.
- `hreflang` (en/es/fr/de + x-default) on every page, plus all variants in the sitemap. Language switcher
  keeps the path; the choice goes to `localStorage`. No auto-redirect; a dismissible suggestion banner instead.
- The existing FR/ES/DE strings in `/embed` are reused as the seed for the widget.
- Poppins and Inter both cover Latin Extended (á é ñ ü ß ç œ) via Google Fonts.

---

## 10. Risks

1. **Rankings.** Titles and H1s on the 30 indexed URLs are the main SEO asset. Any change is listed in
   this file with before/after (rule from Phase 3). The data-page titles are generated, so I edit the generator, not the output.
2. **Preview ≠ production behavior** (S-1). Mitigated by Option A.
3. **The console is one 6,000-line script with globals** that several other scripts wrap (`boot.js`,
   `loaders.js`). Re-skinning it is the riskiest UI work, so the golden-output test (Q13) goes in first.
4. **Backend-dependent asks** (Q1–Q4) can't ship without schema changes. I'll propose SQL and wait.
5. **Translation quality.** Machine translation of finance copy, so every string is listed in TRANSLATIONS.md for native review.
6. **Two co-pilot copies** (this site and ringomining.com share the engine). Moving its script to JSON is
   per-site, and ringomining.com is untouched.
7. **Lighthouse on `/console`** (Q12).

---

## 11. Decisions (owner, 2026-11-17)

| # | Decision |
|---|---|
| Preview | GitHub Pages user site **https://ringoshitoitsu1.github.io/** (repo `RingoshiToitsu1/ringoshitoitsu1.github.io`). Its workflow pulls `gomining-vip@overhaul`, strips `CNAME`, sets `robots.txt` to `Disallow: /`, and injects `noindex,nofollow` into every page. Rebuilds on `gh workflow run preview.yml` after each push, plus every 30 min as a fallback. |
| Q1 Chat | Phase 6 restyles the **existing global room only**. DM tables are proposed in §12, **not built**. |
| Q5 Co-pilot | Full page at **`/copilot`**. |
| Q7 Nav | "Calculator" → `/console`; "RINGO5 Bonuses" → `/claim`. |
| Q8 Promo page | `/gomining-promo-code`: remove the whole "free offer to fund your first TH" line (**the offer has ended**). Keep title, H1 and keywords; rewrite the body around the three RINGO5 bonuses (**definition still needed from the owner**). |
| Q9 Fees | Keep fee figures in guides, pulled from config and worded "currently X%, may change", with the config's last-updated date. |
| D-1 | `gomining-optimizer.html`, `gomining-vip-index.html` set to `noindex,nofollow` (URLs unchanged). |
| D-2 | `neon-miner/`: kept; every file is a redirect page to `/` (URLS.md §G). |
| Analytics | None. Don't add any. |
| Q2 Auth | Username + password stays. No password reset or magic link in this overhaul. |
| Open | The funded-first-TH offer has ended but **is still advertised on the live site** (home, `/claim`, `/gomining-promo-code`, co-pilot). Hotfix now or wait for the overhaul? Asked. |

## 12. Proposal (NOT built): direct messages, conversation list, unread counts, report/block

Kept separate from the global room (`messages` is untouched). Everything is RLS-gated, so only members
of a conversation can read it. Apply only after explicit approval.

```sql
-- One row per conversation (a DM between two users, or a small group later).
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  last_msg_at timestamptz not null default now()
);
-- Who is in it, and how far each member has read (drives unread counts).
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table public.dm_messages (
  id              bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index on public.dm_messages (conversation_id, created_at desc);
-- Safety
create table public.user_blocks (
  blocker_id uuid references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create table public.reports (
  id          bigserial primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user uuid references auth.users(id) on delete set null,
  message_ref text,                     -- 'global:<id>' or 'dm:<id>'
  reason      text not null check (char_length(reason) between 1 and 500),
  created_at  timestamptz not null default now(),
  status      text not null default 'open' check (status in ('open','actioned','dismissed'))
);
-- RLS (sketch): members-only read/write on conversations, members and dm_messages; you can only
-- update your own last_read_at; insert into dm_messages is blocked if either side has blocked the
-- other or the sender is banned; blocks are visible to the blocker only; reports are insert-own and
-- readable by mods (public.is_mod()). A security-definer RPC start_dm(other_user) creates or returns
-- the DM so clients never insert membership rows directly.
-- Realtime: postgres_changes on dm_messages filtered by conversation_id (RLS applies to realtime).
-- Unread count = dm_messages newer than my last_read_at, per conversation (one view or RPC).
```

---

## 13. Phase 1: brand system (done)

**New files**
- `assets/brand/`: the five logo SVGs and PNGs, plus `favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png`, `icon-maskable-512.png`.
- `/favicon.ico` (16/32/48) and `/site.webmanifest`: new URLs, additive.
- `assets/tokens.css`: every colour, font, size, space, radius, shadow and z-index. Contrast ratios are documented in its header.
- `assets/components.css` + `assets/components.js`: buttons, inputs, select, textarea, checkbox, switch, cards, stat tiles, sortable/stackable tables, tabs, segmented control, badges, counts, notices, modal (`<dialog>`), toasts (`UI.toast`), accordion (`<details>`), avatars, message bubbles, quick-reply chips, logo. All `ui-` prefixed.
- `/styleguide` (noindex, in robots.txt): every component, plus a "German-length text" switch that swaps in ~40–60% longer labels.
- `scripts/build-brand.js`: rebuilds every icon from `GMT_icon_transparent.svg`.
- `tests/golden.js`: the calculator golden test (rule 3). **Passes after every Phase 1 change: 27/27 cases identical.**

**Applied to every live page** (the legacy copies in D-1 are excluded, apart from removing GoMining's logo from them, rule 7):
- Fonts: Space Grotesk / Share Tech Mono / General Sans replaced by **Poppins** (headings, UI) + **Inter** (body, figures), tabular numerals site-wide.
- Every page loads `tokens.css` + `components.css` first; the old stylesheets' variables now resolve to tokens.
- **1,340 hard-coded colours** converted: 887 to `var(--color-…)` in CSS contexts, 453 to the new literal values in JS
  and SVG attributes (canvas and SVG attributes can't read CSS variables; Phase 4 gives charts a token reader).
- Favicons, apple-touch icon, manifest and `theme-color` on every page; the old `/gmt-optimizer-logo.svg` and
  `/site-logo.png` keep their paths with the new mark inside.
- Header and footer logos are now the white-text wordmark (the "v2" badge is gone). The landing hero's spinning
  old mark is now the static new icon (Phase 3 rebuilds the hero).
- The data-page generator template uses the same head, so the 14 data pages stay rebranded when deploy regenerates them.
- Changed scripts and stylesheets have their `?v=` cache-busters bumped on every page.

**Title / H1 changes (SEO log):** only the brand suffix in `<title>`, `og:site_name` and JSON-LD `name`:
"GMT Optimizer" → "GMT-Optimizer" (120 occurrences). No H1 or keyword changed.

**Deliberately left as they were**
- `/embed`'s **ember theme** (host-selected palette matching ringomining.com) and `/statement`'s **print
  stylesheet** (dark colours chosen for white paper) were restored verbatim after the colour pass.
- VIP-tier identity colours (bronze/silver/platinum…) and third-party brand colours on share buttons
  (WhatsApp, Telegram, X).
- ~300 one-off colour literals in a long tail; Phases 2–4 rebuild those pages on components and remove them.
- Social/OG images still show the old branding: regenerated in Phase 8 (the brief puts them there).
- Glow and orbit effects in the old page styles are recoloured, not removed; Phases 2–3 replace them with the calmer components.

---

## 14. Rule 8: ended personal offer (owner, 2026-11-17; overrides everything else)

> My personal 10% cash back and the "Claim TH Rebate" / funded-TH / free TH offer have ended. Don't advertise
> them anywhere: not in the nav, footer, landing page, tool cards, dashboard, co-pilot scripts, chat widget,
> meta descriptions, or any language version. The only offer on the site is the RINGO5 bonus block.

**The RINGO5 bonus block** (exact copy, used on the landing offer section, `/claim`, `/gomining-promo-code`):
Title "Your RINGO5 bonuses" · +5% bonus TH on your first miner (up to 25 TH) · 1 month of VIP Platinum+, on
GoMining · Card cashback bonus: spend with the GoMining Card in your first 90 days and earn bonus TH ·
"Enter code RINGO5 before your first purchase, within 30 days of signing up. New accounts only." ·
"Bonuses set by GoMining and may change" → https://docs.gomining.com/en/product/promos/referral-program.
Never say the owner pays them; no dollar amount for the card cashback.

**Hotfix shipped to `main`: `9d1f29432`** (merged into `overhaul`):
- `/claim`: rewritten as the RINGO5 bonuses explainer. **The claim form is removed. Formspree form ID
  `xojokqwe`** (endpoint `https://formspree.io/f/xojokqwe`) is no longer on `/claim`; it is still used by
  the co-pilot's "send Ringo my username" support flow (`assets/copilot.js`).
  **Title changed** "Claim Your Funded First TH" → "Your RINGO5 Bonuses" (the old title advertised the
  ended offer; rule 8 overrides the keep-titles rule). URL unchanged.
- `/gomining-promo-code`: title and H1 kept; body rebuilt on the bonus block; meta + FAQ rewritten.
- Every guide, the 14 data pages and their generator, the landing/console/content footers, the menu, the console
  projection card, the stream visualizer, the co-pilot, meta descriptions, privacy and terms: old offer copy replaced.
- `/embed`: the 10% and 5% cash back are removed from its offer list (EN/FR/ES/DE) **and from its dollar-mode
  maths**; that tile now shows the RINGO5 bonus TH. Golden ROI snapshot re-recorded: only the three embed `$`
  cases changed, and only in the cash-back tile and the last sentence of the hint.
- A hidden, unused "VIP 10% bonus on $10,000" planner block was removed.
- `og-claim.png` and `og-gomining-promo-code.png` were regenerated without the old offer.
- **`scripts/offer-check.js`**: scans every published file for the old phrases in EN/FR/ES/DE (the GoMining Card
  cashback is allowed). It reports 0 matches on `main` and `overhaul`, and caught 137 on the pre-hotfix copy.
  Phase 8 runs it against the built site in all languages.
