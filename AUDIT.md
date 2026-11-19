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

---

## 15. Phase 2: information architecture and global chrome (done)

**One header and one footer on every page** (`assets/site-chrome.css` + `assets/site-chrome.js`, linked in each
page's `<head>` and in the data-page template). It replaces the landing nav, the console brand bar, the content-page
bar from `site.js` and the `menu.js` drawer. (`menu.js` stays on disk; its URL is unchanged.)

- **Header (sticky, 64 px):** wordmark → `/` · **Calculator** `/console` · **Growth Projection** `/projection` ·
  **Guides** `/guides` · **RINGO5 Bonuses** `/claim` (current page underlined in gold) · language switcher (EN live;
  ES/FR/DE shown as "soon" until Phase 7, no links to pages that don't exist yet) · **Messages** with unread badge
  (logged in only) · **Log in** / avatar menu (Profile, Dashboard, Settings, Log out) · gold **Get Started** → `/claim`.
  Under 1024 px it becomes a hamburger panel (focus-trapped, Esc closes, scroll locked).
- **Footer:** Tools · Learn · Company (About, Contact, Telegram @RingoMining, ringomining.com) · Legal (Privacy,
  Terms, Disclosures), the existing BTC/GMT support addresses, and the legal bar with the independence and
  referral disclaimers. `/quote` and `/statement` (tools with their own print view) get the header only.
- **Accounts without a backend change:** where `account.js` runs (console, `/chat`) the header uses it; elsewhere it
  reads the saved Supabase session and fetches the profile once over REST (public read under existing RLS).
  "Log in" on other pages goes to `/console?view=login`; Profile/Settings open the existing profile editor
  (`GMTAccount.openProfile`, newly exposed; `?view=profile` from other pages). Dashboard → `/console` until Phase 5.
- **Unread badge without a backend change:** `chat.js` writes `localStorage.gmt_chat_seen_at` when the chat is
  opened and broadcasts its live count (`gmt-chat-unread`); other pages count newer messages with a `HEAD
  … Prefer: count=exact` on the public `messages` table. On the console the icon opens the in-page chat.
- **New pages:** `/guides` (hub; card text comes from each page's own meta description), `/faq` (10 Q&As +
  FAQPage JSON-LD), `/glossary` (17 terms, anchor per term), `/about` (with `#contact`), `/disclosures`
  (independence, referral relationship, RINGO5 block, estimates, data sources, no ads/trackers). No fee
  percentages in their copy (Q9). Added to `sitemap.xml`.
- **Removed effects (calm direction):** the content pages' galaxy canvas, orbs and beams, cursor spotlight and
  magnetic buttons, and the live BTC/GMT strip in their bar (the console keeps its own live strip).
- **Layout:** the console's tool tabs and live strip now dock under the global header; old top padding reserved
  for fixed bars is removed; z-index tokens raised above the console's layers (header 150, modals 10050).
- **Left for later phases:** `/chat` (the console's pop-out window) keeps its own minimal UI until Phase 6; the
  landing body is rebuilt in Phase 3; the back-to-top button moves when the Phase 6 widget takes the corner.
- Golden test: 27/27 identical. Offer check: 0. Internal link check: 0 broken.

**Title / H1 log:** new pages only; no existing title or H1 changed in Phase 2.

---

## 16. Phase 3: landing page (done)

`/` was rebuilt in place on the component library (`assets/landing.css`, tokens only). Top to bottom:
1. **Hero:** eyebrow "Independent GoMining calculator", H1 *Model your GoMining returns before you buy*, one line of
   support copy, **Open Calculator** (`/console`) + **Get Started** (`/claim`), "Estimates only. Not financial advice."
   On the right, a **live mini-calculator** (hashrate + efficiency → net/month, net/day, est. cost, fee discount). It
   runs on `assets/roi-embed.js` through its `re-*` ids, so its maths is the golden-tested ROI widget, not a copy.
2. **Trust strip:** who it's for, plus live BTC, GMT, sats/TH/day and difficulty (only data the site already pulls).
3. **How it works:** three steps; projections labelled as estimates.
4. **Tools:** Calculator, Growth Projection, RINGO5 Bonuses, Co-pilot (opens the co-pilot via its `data-copilot`
   hook), Marketplace Checker, Community chat (3 × 2), plus links to the ROI calculator and income statement.
5. **RINGO5 offer block:** the exact rule-8 copy, the code copies on click, and the GoMining docs link.
6. **Guides preview:** three cards + "All guides and data pages".
7. **FAQ:** six questions, accordion; FAQPage JSON-LD rewritten to match the visible answers exactly.
8. **"The GoMining calculator, explained"**: the keyword-rich prose and every guide/data-page link, kept from the old page.
9. **Final CTA band.**

Removed from `/`: starfield canvas, orbs/beams/scanlines, cinematic intro (`cine.js`), ticker, magnetic buttons, the
old `design.css` dependency. `cine.js` / `chrome.js` stay on disk (URLs unchanged; the console still uses `chrome.js`).

**Title / H1 log (SEO):** `<title>` unchanged ("GoMining Calculator: Profit, ROI & Earnings | GMT-Optimizer").
H1 changed from "Plan your work. Work your plan." to "Model your GoMining returns before you buy". The old H1 had no
keyword; the new one carries "GoMining", and "GoMining calculator" stays in the eyebrow, title, meta description
and the explained section. Meta description unchanged.

**Site-wide fixes found in the Phase 3 screenshots:** body margin reset; hyphenation limited to German (English read
"dis-count"); back-to-top styled globally and moved bottom-left (the co-pilot owns bottom-right); the co-pilot hint
bubble is hidden on phones (it covered page content; Phase 6 rebuilds the widget); cache bumps now follow references
transitively (a CSS bump also bumps the script that loads it).

Checks: golden 27/27 identical; offer check 0; landing JSON-LD valid; 0 broken internal links. Screenshots at 360,
768, 1280 and 1920 px reviewed (full page).

## 17. Phase 4: data layer (done)

**One config.** `data/config.json` holds every price, fee, rate, discount rule, VIP tier and the RINGO5 terms
(5% bonus TH, 25 TH cap, 30-day code window, 1 month VIP Platinum+, 90-day card window, docs link).
`node scripts/build-config.js` validates it and:
- writes the generated CONFIG block in `assets/pricing.js` (`window.GMT_CONFIG` in the browser, `.CONFIG` in Node);
- fills `data-cfg` values in pages (dates, %, amounts);
- rewrites numbers inside known phrases (referral %, cap, windows, 18-day step, 20% cap, 360 days) in pages, meta, JSON-LD and JS strings, all four languages;
- keeps calculator input defaults in step.
Deploy and the preview build run it; an invalid config fails the deploy. `--check` reports drift, `--list` audits phrase hits.
`set-rates.js` now edits the config, then builds and bumps versions.

**Engines read the config.** app.js, roi-embed.js, quote.js, market-check.js, statement.js and scripts/constants.js.
No fee or rate literals remain in them.

**As-of dates.** "Fees and rates as of <date>. They may change." beside every fee or rate: claim, faq, glossary,
discount-explained, checker, promo-code, roi-calculator, how-gomining-works, is-gomining-worth-it, disclosures,
guides, landing (quick estimate and RINGO5 block), quote badge, /embed, and all 14 generated data pages.
Fees in prose read "currently X%, may change".

**/lib.** `lib/mining.js` holds the pure maths (fees, VIP tier, coverage → token discount, caps, net mining,
staking, referral bonus, upgrade cost, price curve, `farmToday`). `tests/lib.test.js` has 62 checks: hand-worked
values, plus agreement with app.js's own `fees`/`vipOf`/`cptTier`/`calc` on a grid of farms.
The landing/ROI widget now computes on the library. The console engine still has its own copy (agreement-tested);
moving the console onto /lib is a larger refactor and is left for later.

**Golden test: 33 cases** (console 11, roi 8, checker 8, quote 6). Two accepted changes, each proven to be the only diff:
- the quote tool now knows the Legend VIP tiers like the console ($250k case: 83.7% → 84.0%);
- one quote sentence reworded to "USD-to-GMT fee (currently 2%, may change)" (the two cases with monthly top-ups).

**Tables** on `ui-table` (tabular numbers, cards under 640px): checker payback table, checker upgrade steps
(sortable), quote compounding table. Statement and console tables are unchanged (Phase 8 pass).

**Charts.** `assets/charts.js` gives token colours (SVG via `var(--color-*)`, canvas via resolved values) and
locale-aware Intl formatters keyed to `<html lang>`. The quote chart and share image use it. The console's canvas
charts still use their own palette and en-US formatting; they move onto the kit with the i18n work in Phase 7.

**Open question.** The landing quick estimate shows months as 30.44 days and the console as 30 days, so monthly
figures differ by about 1.4% (daily figures are identical). Unifying them changes the console golden numbers,
so it needs the owner's OK.

### 17a. Month length unified to 30.4375 days (owner-approved, 2026-11-17)

One month = 365.25 / 12 = 30.4375 days everywhere: `DAYS_PER_MONTH` in assets/app.js and lib/mining.js
(the ROI widget, quote tool, gen-pages.js and network-facts.js use the same value). Before: console ×30,
widget and data pages ×30.44.

Golden values re-recorded on purpose. Every change, field by field:
- console: 8 monthly figures ×1.01458 (30.4375 / 30).
- console: 3 `monthlyFor10k` figures +0.84% to +0.94%. That figure is mining × days-per-month (+1.46%) plus
  staking and Greedy growth, which are weekly × 4.33 and never used the 30, so the blend lands lower.
- roi widget: 3 values moved by a cent (30.44 → 30.4375).
- checker and quote: unchanged.
Proof: with the old month lengths (30 / 30.44) temporarily put back, all 33 cases matched the old recording exactly.
Yearly figures built as monthly × 12 now come to 365.25 days instead of 360. Daily figures are unchanged.
Also replaced two leftover cap literals (the discount-bar `/30` and the widget's `0.20`) with config values; no output change.

## 18. Phase 5: accounts (built; logged-in screenshots pending)

**New pages** (file pages, same style as /guides; `noindex,follow`, not in the sitemap):
`/login`, `/signup`, `/profile` (own, or anyone's at `/profile?u=username`), `/settings`, `/dashboard`.
No existing URL changed. `/console?view=login|signup|profile|settings|edit` still open the console modals as before.

**No backend change.** Everything goes through assets/account.js with the calls it already made:
- sign up / log in (username → internal address, password ≥ 8);
- change password (current password required first);
- profile update (display_name, bio), avatar upload to the existing `avatars` bucket;
- reads: own profile, any profile by username (public under `profiles_read`), own miners (`miners_all_own`),
  a user's message count.
Login and signup say "Forgot your password? Message @RingoMining on Telegram." The console modal now uses the same line.
`?next=` sends you back where you came from (same-site paths only).

**Dashboard** shows the saved farm (`profiles.setup`) at today's prices, computed with lib/mining.js. Wallet GMT counts
toward fee coverage, as in the console (tests/lib.test.js checks this against calc()). It also shows the miners table and links.
It leaves out Greedy Machines, inactive hashrate and ambassador rewards and says so, pointing to the calculator.

**Header**: Log in, Dashboard, Profile and Settings are links to the new pages. Log out stays an action.

### Proposals (not built; each needs your OK, and some need backend changes)
1. **Delete my account.** Needs a server function (an edge function with the service key) to remove the auth user;
   rows cascade. Backend change.
2. **Change username.** Update `profiles.username` and the internal login address together. Needs a server function.
   Also old chat messages show the username at the time they were sent.
3. **Remove avatar** (set `avatar_url` to null and delete the file). Small; no schema change.
4. **Profile privacy**: hide hashrate on the public profile. Needs a `profiles.show_th boolean` column.
5. **Preferences** (display currency, language) stored on the account instead of per device. Needs a `profiles.prefs jsonb` column.
6. **Log out everywhere** (`signOut({ scope: 'global' })`). No schema change.
7. DMs: unchanged from §5 (needs new tables).

### 18a. Approved account extras: status (2026-11-17)
- **Remove profile picture**: built (Settings → Remove picture). No backend change: it uses the existing `avatars_delete_own` policy.
- **Delete account, hide TH, preferences (language)**: client built, SQL **awaiting review**:
  `supabase/proposals/2026-11-17_account_extras.sql`. The Settings sections for them appear only once that SQL is live
  (the site detects `get_my_profile()`). Until then the site keeps working on today's schema.
  - Deleting an account removes the auth user; profile, miners and **chat messages are deleted** (cascade; messages
    only live 24h anyway). Avatar files are removed first. The current password is required.
  - Hide TH is enforced in the database, not just hidden in the UI: the private columns (`th_total`, `setup`, `prefs`)
    stop being publicly readable; public cards come from the `profile_cards` view, own row from `get_my_profile()`.
    Today **every user's saved console setup (`setup`) is readable by anyone** via the REST API; this SQL closes that too.
- Username change: not now (owner, 2026-11-17).

## 19. Phase 6: chat, co-pilot, widget

**Co-pilot.** One engine (`assets/copilot.js`) drives the corner widget and the new full page **/copilot** (file page,
indexed, in the sitemap and the footer; the landing Co-pilot card links to it). The words moved out of the engine into
`assets/copilot/en.js` (script + UI strings, unchanged wording); `es.js`, `fr.js`, `de.js` are empty stubs that fall
back to English until Phase 7. `build-config.js` phrase rules now point at `en.js`. The Formspree "Send Ringo my
username" flow is unchanged and mentions no ended offer (offer-check 0).

**Widget.** Two tabs: **Co-pilot** and **Messages** (the global room; the tab shows only when logged in, with an unread
count on the tab and the launcher). Messages loads the chat on first use (Supabase SDK, account.js, chat.js) and mounts
the same room inside the tab. On the console the tab opens the console's own chat panel instead of a second copy.
On /copilot the corner launcher stays off. The "slides beside the quick estimate" behaviour is kept.

**Community chat.** Restyled only: new `assets/chat.css` on the tokens, loaded by chat.js wherever the room appears
(console panel, /chat, widget). /chat stays the console pop-out at the same URL. "Log in to chat" goes to /login.
The user card says "Hashrate hidden" once hide-TH is live. No backend change.

**Proposals (not built):**
- DMs / conversation list / unread tables: unchanged from §5.
- Report and block need backend tables: `supabase/proposals/2026-11-17_chat_report_block.sql`.
  Report = a mod-only queue with a snapshot of the message (messages vanish after 24h). Block = hides that user's
  messages for you on every device. A browser-only block (no backend) is possible but wouldn't follow the account.

### 18b. Exposure fix split out (2026-11-17)
`supabase/proposals/2026-11-17_fix_profile_exposure.sql` now stands alone and only tightens read access:
public columns readable by all; `setup` readable only by its owner (via `get_my_profile()`); TH stays public through
`profile_cards`, as shown today. `account_extras.sql` builds on it (hide-TH, prefs, delete). Backups and order:
`supabase/proposals/README.md`. **Apply the exposure fix only after the overhaul code is live on main**: the current
live `account.js` reads `setup`/`th_total` straight from `profiles`.

Who reads profile data today (all must keep working after the fix):
| Where | What it reads | After the fix |
|---|---|---|
| Header account menu, every page (`site-chrome.js`) | own id, username, display_name, avatar_url via REST | public columns, unchanged |
| Login restore of the saved farm, console (`account.js` loadProfile → `app.js` gmtSyncAccountProfile) | own username, display_name, avatar, bio, role, **setup**, th_total | `get_my_profile()` |
| Console role checks: mod delete/ban in chat (`account.js` role/isMod) | own role | `get_my_profile()` |
| Chat user card, console + /chat + widget (`account.js` fetchUserCard) | any user's card incl. **th_total** | `profile_cards` |
| /profile and /profile?u= (`account-pages.js`) | card incl. th_total | `profile_cards` |
| /dashboard, /settings (`account-pages.js`) | own setup, th_total | `get_my_profile()` |
| Chat posting (`messages_insert` policy) | poster's own `banned` | stays readable |
| Writes: save farm / fleet TH / profile edit / mod ban (`account.js`, `chat.js`) | update filtered on `id` | unchanged (updates aren't affected) |
| Edge function `nft-lookup` | no profile data | unaffected |

## Phase 8 checklist (carried forward)
- [ ] **LAUNCH, REQUIRED:** also apply `supabase/proposals/2026-11-17_account_extras.sql` right after the exposure fix.
      The new privacy policy promises Settings → Delete account, hiding hashrate and the language preference, which
      only appear once that SQL is live. (If you'd rather launch without it, the policy's "Accounts" and
      "Keeping and deleting your data" sections must change first.)
- [ ] **LAUNCH, REQUIRED:** set `legal.privacyUpdated` in `data/config.json` to the launch date (shown on /privacy in
      every language), then rebuild.
- [ ] Legal review of the rewritten /privacy and edited /terms (EN binding; ES/FR/DE convenience translations).
- [ ] **LAUNCH, REQUIRED:** right after the overhaul is merged to `main` and live, apply
      `supabase/proposals/2026-11-17_fix_profile_exposure.sql` (back up first: `supabase/proposals/README.md`), then
      re-check every row of the §18b table on the live site. Until it runs, logged-in users can read every user's `setup`.
- [x] (done 2026-11-18, same set) Logged-in screenshots, 360 and 1280: widget with both tabs, Messages tab, /chat, /copilot (Phase 6; skipped by owner 2026-11-17).
- [ ] After the owner applies the SQL: re-check every row of the §18b table, and the Settings sections (hide TH, language, delete).
- [ ] Social/OG images rebranded (§13).
- [ ] Statement and console tables pass (§17).
- [ ] Offer check = 0 on the built site, all languages.
- [x] (done 2026-11-18, `%TEMP%\gmtshots\logged2`, test account with a fake 5,000 TH farm, owner OK) Logged-in console screenshots, 360 and 1280, all 4 languages: dashboard with real results (no gate), planner
      results, projection, saved farms, fleet editor with miners (7d-2 covered logged-out views only, per owner).
- [ ] Native review of the console dictionary (`locales/*.json` "dom" + "ui"), see TRANSLATIONS.md (7d-2 notes).

## 20. Phase 7a: translation machinery + first pages (ES / FR / DE)

**How it works.** `scripts/gen-i18n.js` (no dependencies) reads each English page listed in `locales/pages.json`,
splits it into text runs (text plus inline markup, split at block elements; the parser round-trips every page byte for
byte), and swaps each run for its translation from `locales/<lang>.json`, keyed by the English text. It also translates
meta/og/twitter text, `alt`/`title`/`aria-label`/`placeholder` and JSON-LD strings, sets `<html lang>`, canonical and
og:url, points internal links at the same language when that page exists, and writes the copy at the same shape
(`/claim/index.html` → `/es/claim/index.html`, `/copilot.html` → `/es/copilot.html`), so the new URLs behave like the
English ones on GitHub Pages. It keeps an hreflang block (en/es/fr/de + x-default) in the English page and every copy,
the translated URLs in `sitemap.xml`, and the header's list of translated pages. Untranslated text stays English and is
listed by `--missing`; `--check` fails when generated files are stale.

**New URLs (additions only; no English URL changed):** `/es/`, `/fr/`, `/de/`, and `/es|fr|de/claim`, `/es|fr|de/copilot`.

**Also:** header/footer/account menu translated (`site-chrome.js`), and the language menu now links to the page's real
translations (from its hreflang links), with "soon" for the rest. The co-pilot speaks ES/FR/DE (`assets/copilot/*.js`,
same nodes as English). The quick-estimate widget's farm-mode text is translated and uses the config's discount cap
instead of literal 20s. `data-cfg` dates and decimals are formatted per page language. Phrase rules cover ES/FR/DE for
every config number used in the translations, and run over the locale files and co-pilot scripts.

**Review:** all strings are machine translations; `TRANSLATIONS.md` lists where they live and the rules for reviewers.
**Next stages:** 7b content pages, 7c data pages, 7d console app + account pages + chat UI (TRANSLATIONS.md status table).

### 18c. SQL review answers (2026-11-17)
- **Anon probe (zero-row requests, no data read):** anon can read `id, username, display_name, avatar_url, role,
  created_at, bio, banned, th_total, setup` on 477 profiles; `miners` returns 0 rows to anon (RLS works);
  `messages` is public (139 rows, by design). `message_reports`, `user_blocks`, `conversations` don't exist yet.
  Columns beyond `schema.sql` can't be listed with the publishable key: `inspect_readonly.sql` lists them live.
- **Live code read while logged out:** only the chat user card (`username, display_name, avatar_url, bio, created_at,
  th_total, role` by `id`) and message counts. Nothing reads `setup` logged out → `interim_anon_lockdown.sql`.
- **No `select('*')`, `profiles(*)` or `profiles!…` embeds** anywhere on `main` or `overhaul` (messages/miners
  queries name their columns; none join profiles). Nothing to fix.
- **/profile VIP tier** is computed in the browser from `th_total` (hashrate path only; locked GMT isn't public).
  **Chat count** = rows in `messages` for that user, and messages are purged after 24 h, so it's labelled
  "last 24 h" now (profile page and chat card).
- **profile_cards** covers every column the overhaul's public reads use (`id, username, display_name, avatar_url,
  bio, created_at, th_total, role` + `show_th`). The live code doesn't use the view; it's replaced at launch.
- **Foreign keys (schema.sql):** `profiles.id`, `miners.user_id`, `messages.user_id` → `auth.users`, all
  `ON DELETE CASCADE`; nothing references `profiles`. Proposed tables cascade (`message_reports.message_id` SET NULL).
  Supabase's own `auth.*` tables cascade by design. `storage.objects.owner` may carry an FK on older projects; the
  site deletes the user's avatar files before deleting the account. `inspect_readonly.sql` §5 confirms all of this live.
- **report/block** revised: `reported_user_id`, server-filled `body`/`reported_user_id`/`reporter_id` (trigger from
  `public.messages`), body capped at 500, clients can insert only `message_id` and `reason`.

## 21. Phase 7b: content pages in ES / FR / DE

Translated (machine, listed in TRANSLATIONS.md): `/guides`, `/faq`, `/glossary`, `/about`, `/disclosures`, `/privacy`,
`/terms`, `/how-gomining-works`, `/is-gomining-worth-it`, `/gomining-discount-explained`, `/gomining-promo-code`,
`/gomining-roi-calculator`, `/gomining-marketplace-checker` (page text). New URLs only: `/es|fr|de/<same path>`.
16 pages × 3 languages, all in the sitemap with hreflang. Offer check 0, golden 33/33, no broken links.
Deploy and preview now run `gen-i18n.js` after `gen-pages.js`, so translated copies always carry the fresh English
for anything not yet translated. 5 live-number runs (guides "This month", worth-it live paragraphs) stay English until 7c.

**Owner decisions needed (found while translating; translated faithfully, not changed):**
1. **Rule 8 wording in the legal pages.** `/terms` "Affiliate and referral disclosure": *"Any additional new-user offer
   we make is discretionary… may require proof of a genuine sign-up… limit the offer to one per person…"*; and
   "Acceptable use": *"abuse our offers through fraudulent or duplicate claims"*. `/privacy`: *"To prevent abuse of our
   offers (for example, verifying a genuine sign-up)"* and *"We keep claim-form submissions… administer the offer"*.
   These describe the ended personal offer. The offer check doesn't catch them (different wording).
2. **Contact pointer.** `/privacy` and `/terms` say "use the contact form on our homepage"; there is no such form now
   (contact is Telegram, /about#contact, or the co-pilot's Formspree flow).
3. `/privacy` "Last updated: June 30, 2026" predates accounts, chat and the co-pilot form; it doesn't mention
   Supabase (accounts, saved farms, chat). Worth a legal refresh before launch.

### 21a. Owner decisions applied (2026-11-18)
- Interim anon lockdown: **declined**; file removed. The full exposure fix stays a required launch step.
- **/terms**: offer wording removed in all 4 languages. Referral clause now says only that RINGO5 may earn us a
  referral reward and that GoMining sets/pays its own bonuses. "Acceptable use" is a short generic clause against
  disrupting the site, spam, harassment, impersonation and unlawful use (moderators may remove messages / suspend).
- **/privacy rewritten** (EN binding, ES/FR/DE convenience): no-account use (no analytics, ads or tracking cookies;
  local storage only), accounts (username + password, no email, hashed by Supabase, manual reset via Telegram), what's
  stored (profile, saved farm, miners, language), what's public (profile + total TH, hideable), chat (public, deleted
  after 24 h, moderation), avatars (Supabase storage, public by link, removable), the co-pilot Formspree form (name,
  GoMining username, contact, page; purpose; retention), processors (Supabase, Formspree, GitHub Pages, market-data
  APIs, jsDelivr, Google Fonts), deletion (Settings → Delete account), rights, contact @RingoMining on Telegram.
  Date comes from `legal.privacyUpdated` in config (set on launch day).
- **Contact**: every "contact form on our homepage" now points to @RingoMining on Telegram.
- `gen-i18n.js --prune` removed the old privacy/terms translations (22 per language), so no ended-offer wording
  survives in any locale file. Offer check 0.
- Report/block SQL: re-verified with the real PostgreSQL parser (pglast 8.8 / libpg_query): every proposal file parses
  and both PL/pgSQL functions compile; a copy of `message_reports_fill` without `begin` is rejected, the file as
  written compiles. Still not built (awaiting approval).

## 22. Phase 7c: data pages in ES / FR / DE

`gen-pages.js` now builds each of the 14 data pages in en/es/fr/de from `scripts/data-pages-text.js` (templates; all
numbers, RINGO5 terms and the discount cap come in from config/live data, so translations can't go stale) and writes
`/es|fr|de/<same file>`. Numbers, money and dates are formatted per language. The live paragraphs on
`/is-gomining-worth-it` are written per language to `locales/live/<lang>/` and swapped into the translated copy by
`gen-i18n.js`. Every data page (English included) now carries the hreflang block. `locales/pages.json` lists the
generated pages, so links, the header and the sitemap know them; `/gomining-worth-it-now` stays out of the sitemap in
every language (canonical points at /is-gomining-worth-it).

**English unchanged, proven:** with fixed inputs (`GEN_PAGES_FIXED=64000,1.5e14 GEN_PAGES_DATE=2026-11-18`) the new
generator's English output is byte-identical to the old generator's for all 16 files it touches (14 pages,
is-gomining-worth-it, sitemap), apart from the new hreflang block.

**Also fixed:** the `/guides` "This month" card was static text frozen at "November 2026" (my Phase 2 copy); it's now
"Is GoMining worth it right now?" with a month-free description, in all languages.

**Noticed, not changed (owner's call):** the data pages' formula line says "× 0.98" for the BTC→GMT conversion, but
the fee in config is 2.25% (× 0.9775). The figures themselves use the config value; only that printed formula is stale.

## 23. Phase 7d-1: account pages, chat and checker in ES / FR / DE

**UI strings for JavaScript.** Scripts call `T('English text', …)` (with `{0}`, `{1}` placeholders) and `LH('/path')`
for same-language links. Translations live in `locales/<lang>.json` under `"ui"`; `gen-i18n.js` compiles them into
`assets/i18n/<lang>.js` (content-hashed URL, no manual cache bump) and adds it to every translated page. English
pages don't load it, so English output is unchanged (golden 33/33, including the 8 checker cases that snapshot text).

- **Account pages** `/es|fr|de/login`, `/signup`, `/profile`, `/settings`, `/dashboard` (noindex, not in the
  sitemap): 144 strings, incl. the error messages `account.js` throws (translated at display time).
- **Chat** (console panel, `/chat`, widget Messages tab): 29 strings; `/es|fr|de/chat` shells (noindex).
- **Marketplace checker** results, scan steps, errors and table: 61 strings; numbers and money in local format.
  The sentence fragments were rebuilt as whole sentences with placeholders, so translators see full sentences.
- Header "Log in", account menu and in-page links now go to the same-language page where it exists.

**Remaining: 7d-2, the console app** (`/console`, `/planner`, `/projection` and its views, ~6,000 lines of
`app.js` with text inline, plus `boot.js`, `loaders.js`, `fleet.js`). Same mechanism, but the console's golden test
snapshots much of its text, so it goes in carefully, view by view.

## 24. Phase 7d-2: the console in ES / FR / DE

**URLs.** No English URL changed. `/planner`, `/projection`, `/planner/projection` behave exactly as live (301 to the
trailing slash, then a 200 page that sends you to `/console?view=…`, as on `main`). Their `/es|fr|de/` copies send
you to the console in the same language. New pages: `/es|fr|de/console` and those three stubs ×3 (hreflang + sitemap).

| Path | Live | Preview (overhaul) | Points to |
|---|---|---|---|
| `/planner` → `/planner/` | 301 → 200 | 301 → 200 | `/console?view=planner` |
| `/projection` → `/projection/` | 301 → 200 | 301 → 200 | `/console?view=projection` |
| `/planner/projection` → `/planner/projection/` | 301 → 200 | 301 → 200 | `/console?view=planner-projection` |

**How it's translated.** Static HTML through gen-i18n (284 runs). Text the app writes at runtime through
`assets/i18n-dom.js` (console only; dictionary keyed by normalized English, numbers and months as placeholders).
Sentences split by markup through `T()` in `app.js`. Canvas text through `TC()`/`T()`. English pages never load the
translator; golden 33/33 after every step, and a harvest of all English console text (14 views) before and after is
identical except the language menu, which no longer says "Español · soon" now that the console exists in Spanish.

**Charts.** The console loads `assets/charts.js`; canvas colours come from the tokens (same values, so English pixels
are unchanged); axis and price labels use the page locale on translated pages.

**Bugs found and fixed on the way.**
- gen-i18n could misplace text when one element had several translatable runs (only the console triggered it).
- Three places compared on-screen text with English (planner loading overlays, rainbow error check); now language-proof.
- French amounts of 1,000+ weren't matched (whitespace collapse ate U+202F); German "1.200" was turned into "1,200".

**Screenshots.** 14 logged-out views × EN/ES/FR/DE × 360/1280 (+ the planner loader at 360), in
`%TEMP%\gmtshots\cshots`. Each shot checked automatically for horizontal overflow and visible English (list of known
English strings + an English-word heuristic). Result: 0 overflow anywhere; ES and EN nothing flagged; DE and FR flag
only words that are correct in those languages (DE "FAQ", "Tools", "Status", "online", "live"; FR "Console",
"Projection", "Guides", "Contact", "Options"). Logged out, the console and planner results sit behind the sign-up gate;
logged-in shots are on the Phase 8 checklist.


## 25. Part 1: site-wide sweep for leftover old visuals (2026-11-18)

Method: `sweep.py` scanned every stylesheet in `assets/`, every inline `<style>` and `style=""` in the 52 site pages,
and the CSS and canvas effects written from JavaScript, for: glow/neon shadows, glow orbs and spotlight gradients, heavy
glass blur, corner-bracket frames, ALL-CAPS letter-spaced text, non-token fonts, colours not from `tokens.css`, decorative
animations and old effect code (starfield, particles, tilt, magnetic, typewriter, ticker, cinematic). ES/FR/DE pages are
generated from the English ones and share every stylesheet, so a fix in the source fixes all four languages.
Noise removed before listing: the legacy variables `--mono`/`--sans` (already Inter via tokens), plain white/black.

**Exceptions that stay (owner):** the `/embed` ember theme (matches ringomining.com) and the `/statement` print styles.

**Whole pages, not itemised:** `gomining-optimizer.html` and `gomining-vip-index.html` are full copies of the old app
(2,283 and 2,139 lines, 127 and 121 findings each: old fonts, glow, caps, 51+ hard-coded colours, 8 animations). They are
frozen URLs, `noindex,nofollow`, kept "same content" on 2026-11-17. **Proposal (needs your OK):** turn each into a
redirect page like `/planner` (still 200 at the same URL, sends visitors to `/console`), instead of restyling an obsolete
second app. Until you decide they stay as they are.

**Dead files (not loaded by any page):** `assets/cine.js` (cinematic intro), `assets/topbar.js`. Left in place; no visual effect.

**Findings: 525 rows** (file, line, element, what's wrong, verdict). Console files (`app.css`, `design.css`, `futures.css`,
`console/index.html`, `chrome.js`, loaders) are fixed by the Part 2 redesign and Part 3 loaders; the rest in Part 1.

| File | Line | Element | What's wrong | Verdict |
|---|---|---|---|---|
| `assets/account-pages.css` | 40 | `.acct-danger` | colour not from tokens.css (rgb(239 68 68 / .35)) | fix |
| `assets/accounts.css` | 23 | `.gmt-field:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/accounts.css` | 57 | `.gmt-acc-menu` | colour not from tokens.css (#121316) | fix |
| `assets/accounts.css` | 73 | `#gmtOnline .dot` | glow / neon shadow (box-shadow: 0 0 8px var(--color-success)) | fix |
| `assets/accounts.css` | 80 | `#gmtOnline .gmt-chat-new` | colour not from tokens.css (#04140b) | fix |
| `assets/accounts.css` | 92 | `.gmt-modal label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/accounts.css` | 97 | `.gmt-modal input:focus,.gmt-modal textarea:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/accounts.css` | 112 | `.gmt-modal .ok` | colour not from tokens.css (#7bd88f) | fix |
| `assets/accounts.css` | 125 | `/* ---------- results gate: hide the data, prompt signup (fl` | glow orb / spotlight gradient | fix |
| `assets/accounts.css` | 161 | `.fleet-thead span` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/accounts.css` | 176 | `.fleet-f:focus-within` | glow / neon shadow (box-shadow: 0 0 0 2px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/accounts.css` | 188 | `.fleet-lbl` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/accounts.css` | 198 | `/* The dropdown paints its own list background in some engin` | colour not from tokens.css (#12151a) | fix |
| `assets/accounts.css` | 207 | `.fleet-pwr-dot` | glow / neon shadow (box-shadow: 0 0 7px var(--green,#3ddc97)); colour not from tokens.css (#3ddc97) | fix |
| `assets/app.css` | 3 | `:root` | colour not from tokens.css (#c0c0c0, #cd7f32, #e0dfe0) | fix |
| `assets/app.css` | 21 | `body` | glow orb / spotlight gradient | fix |
| `assets/app.css` | 27 | `.header` | heavy glass blur | fix |
| `assets/app.css` | 36 | `.live-dot` | decorative animation (pulse 2s infinite) | fix |
| `assets/app.css` | 54 | `.tab-btn.active` | glow / neon shadow (box-shadow: 0 0 20px rgb(var(--color-gold-rgb) / .25)) | fix |
| `assets/app.css` | 66 | `/* FLATTENED one-page layout: both panels render as one cont` | decorative animation (fadeIn .3s ease) | fix |
| `assets/app.css` | 70 | `/* planner entry button (opens the existing capital form; re` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .34)) | fix |
| `assets/app.css` | 71 | `.planner-open-btn:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/app.css` | 103 | `.idle-gmt-editwrap:focus-within` | glow / neon shadow (box-shadow: 0 0 0 2px rgb(var(--color-gold-rgb) / .16)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 104 | `.idle-gmt-editlbl` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 123 | `.idle-gmt-ask-row input:focus` | glow / neon shadow (box-shadow: 0 0 0 2px rgb(var(--color-gold-rgb) / .18)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 141 | `.px-dot` | glow / neon shadow (box-shadow: 0 0 6px var(--green,var(--color-success))) | fix |
| `assets/app.css` | 148 | `/* Centred modal with its own backdrop. Two reasons it is no` | colour not from tokens.css (rgba(4,4,6,.72)); decorative animation (fadeIn .16s ease) | fix |
| `assets/app.css` | 152 | `.px-info-card` | colour not from tokens.css (#111318) | fix |
| `assets/app.css` | 161 | `.px-tbl th` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 175 | `.idle-gmt-leg-k` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 191 | `/* The number you act on breathes. This card exists because ` | decorative animation (idleActPulse 2.8s ease-in-out infinite) | fix |
| `assets/app.css` | 199 | `/* A glow that breathes on its own is exactly the motion thi` | glow / neon shadow (text-shadow: 0 0 14px rgb(var(--color-gold-300-rgb) / .60),0) | fix |
| `assets/app.css` | 208 | `.idle-gmt-btn` | glow / neon shadow (box-shadow: 0 6px 18px rgb(var(--color-gold-rgb) / .26)) | fix |
| `assets/app.css` | 209 | `.idle-gmt-btn:hover` | glow / neon shadow (box-shadow: 0 9px 24px rgb(var(--color-gold-rgb) / .4)) | fix |
| `assets/app.css` | 227 | `.hero-card-action:hover` | glow / neon shadow (box-shadow: 0 6px 26px rgb(var(--color-gold-rgb) / .28)) | fix |
| `assets/app.css` | 231 | `.hero-card-action .hero-cta-btn` | glow / neon shadow (box-shadow: 0 3px 12px rgb(var(--color-gold-rgb) / .3)) | fix |
| `assets/app.css` | 236 | `.hero-label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 257 | `/* The income split is reference detail, not a headline — co` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 271 | `.disc-override-panel` | decorative animation (fadeIn .2s ease) | fix |
| `assets/app.css` | 289 | `/* The hero heading carries the badge on its own line, right` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 290 | `.sec-head .tag .dot` | glow / neon shadow (box-shadow: 0 0 10px var(--gold)) | fix |
| `assets/app.css` | 297 | `.section:hover` | colour not from tokens.css (#232d48); glow / neon shadow (box-shadow: var(--sh),0 0 26px rgb(var(--color-gold-rgb) / .) | fix |
| `assets/app.css` | 330 | `.section-collapsible .section-toggle::before` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 346 | `.field-input:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 347 | `.greedy-field.flash .field-input` | decorative animation (greedyFlash 1.4s ease var(--flash-delay,0s) both) | fix |
| `assets/app.css` | 348 | `.greedy-field.flash label` | decorative animation (greedyLabelFlash 1.4s ease var(--flash-delay,0s) both) | fix |
| `assets/app.css` | 378 | `.out-row` | colour not from tokens.css (rgba(26,32,56,.6)) | fix |
| `assets/app.css` | 390 | `.vip-badge.bronze` | colour not from tokens.css (rgba(205,127,50,.08), rgba(205,127,50,.4)) | fix |
| `assets/app.css` | 391 | `.vip-badge.silver` | colour not from tokens.css (rgba(192,192,192,.08), rgba(192,192,192,.4)) | fix |
| `assets/app.css` | 393 | `.vip-badge.platinum` | colour not from tokens.css (rgba(224,223,224,.08), rgba(224,223,224,.4)) | fix |
| `assets/app.css` | 394 | `.vip-badge.diamond` | colour not from tokens.css (rgba(126,232,250,.08), rgba(126,232,250,.4)) | fix |
| `assets/app.css` | 395 | `.vip-badge.legend` | colour not from tokens.css (rgba(255,77,106,.08), rgba(255,77,106,.4)) | fix |
| `assets/app.css` | 407 | `.ds-mining` | colour not from tokens.css (#e879f9) | fix |
| `assets/app.css` | 414 | `.badge.red` | colour not from tokens.css (rgba(248,113,113,.08), rgba(248,113,113,.2)) | fix |
| `assets/app.css` | 422 | `.donate-box` | decorative animation (fadeIn .3s ease); heavy glass blur | fix |
| `assets/app.css` | 454 | `.alloc-split-gmt` | colour not from tokens.css (#E0E0E0) | fix |
| `assets/app.css` | 458 | `.alloc-split-legend .dot-gmt` | colour not from tokens.css (#E0E0E0) | fix |
| `assets/app.css` | 460 | `.alloc-card .a-label` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 467 | `.sub-title.centered` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 477 | `.nbm-head` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 481 | `.nbm-item.nbm-active` | glow / neon shadow (box-shadow: 0 0 0 1px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 488 | `.nbm-tag` | ALL-CAPS letter-spaced; colour not from tokens.css (#062) | fix |
| `assets/app.css` | 492 | `.nbm-locked .nbm-cost` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 499 | `.eff-control input:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 501 | `.eff-splitbar>div` | colour not from tokens.css (#06121f) | fix |
| `assets/app.css` | 506 | `.eff-gauge-win` | colour not from tokens.css (rgba(80,220,140,.5)) | fix |
| `assets/app.css` | 515 | `.eff-card.eff-best` | glow / neon shadow (box-shadow: 0 0 0 1px var(--green),0 2px 14px rgba(80,220,14); colour not from tokens.css (rgba(80,220,140,.12)) | fix |
| `assets/app.css` | 516 | `.eff-tag` | ALL-CAPS letter-spaced; colour not from tokens.css (#062) | fix |
| `assets/app.css` | 532 | `.eff-upg-greedy` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 536 | `.eff-plainplan-lbl` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 560 | `.skel` | decorative animation (shimmer 1.5s infinite) | fix |
| `assets/app.css` | 635 | `.pc-mode-tag` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 636 | `.proj-cell.current` | glow / neon shadow (box-shadow: 0 0 12px rgb(var(--color-success-rgb) / .20)) | fix |
| `assets/app.css` | 652 | `.ba-label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 660 | `#projBtcSelect:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 666 | `.proj-cell .pc-tag` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 685 | `/* New-user onboarding — full page (same look a` | glow orb / spotlight gradient | fix |
| `assets/app.css` | 688 | `/* The overlay itself stays fully opaque from frame 1 (so th` | decorative animation (obFadeIn .45s ease) | fix |
| `assets/app.css` | 694 | `.ob-dot.active` | glow / neon shadow (box-shadow: 0 0 10px var(--purple)) | fix |
| `assets/app.css` | 711 | `.lp-aurora-1` | glow orb / spotlight gradient; decorative animation (lpDrift1 19s ease-in-out infinite) | fix |
| `assets/app.css` | 712 | `.lp-aurora-2` | glow orb / spotlight gradient; decorative animation (lpDrift2 23s ease-in-out infinite) | fix |
| `assets/app.css` | 713 | `.lp-aurora-3` | glow orb / spotlight gradient; decorative animation (lpDrift3 27s ease-in-out infinite) | fix |
| `assets/app.css` | 717 | `.lp-rings` | decorative animation (lpSpin 75s linear infinite) | fix |
| `assets/app.css` | 723 | `.lp-headline` | colour not from tokens.css (#fff6e0); decorative animation (lpShimmer 6.5s linear infinite) | fix |
| `assets/app.css` | 729 | `.lp-cta-primary` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .3)); colour not from tokens.css (#1a1205) | fix |
| `assets/app.css` | 730 | `.lp-cta-primary:hover` | glow / neon shadow (box-shadow: 0 9px 30px rgb(var(--color-gold-rgb) / .45)) | fix |
| `assets/app.css` | 739 | `.ob-step` | decorative animation (obSlideIn .35s ease) | fix |
| `assets/app.css` | 758 | `.ob-field .ob-input-wrap:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 764 | `.ob-select:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 769 | `.ob-btn-primary` | glow / neon shadow (box-shadow: 0 4px 20px rgb(var(--color-gold-rgb) / .3)); colour not from tokens.css (#7540ef) | fix |
| `assets/app.css` | 770 | `.ob-btn-primary:hover` | glow / neon shadow (box-shadow: 0 6px 30px rgb(var(--color-gold-rgb) / .4)) | fix |
| `assets/app.css` | 783 | `.ob-reveal` | decorative animation (obReveal .6s ease forwards) | fix |
| `assets/app.css` | 794 | `.ob-tutorial-wrap` | colour not from tokens.css (#0d0e1a) | fix |
| `assets/app.css` | 801 | `.gm-mk` | colour not from tokens.css (#0f1020, #2a2c45) | fix |
| `assets/app.css` | 803 | `.gm-mk-head .gm-mk-dot` | glow / neon shadow (box-shadow: 0 0 8px rgba(124,108,247,.7)); colour not from tokens.css (#7c6cf7, rgba(124,108,247,.7)) | fix |
| `assets/app.css` | 807 | `.gm-mk-tile-lbl` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 808 | `.gm-mk-ico` | colour not from tokens.css (rgba(124,108,247,.18)) | fix |
| `assets/app.css` | 811 | `.gm-mk-tile-sub` | colour not from tokens.css (#6fd08a) | fix |
| `assets/app.css` | 812 | `.gm-mk-hl` | glow / neon shadow (box-shadow: 0 0 0 3px #FF3B3B); colour not from tokens.css (#FF3B3B) | fix |
| `assets/app.css` | 817 | `.gm-mk-chev` | colour not from tokens.css (#6a6c8f) | fix |
| `assets/app.css` | 818 | `.gm-mk-bal-lbl` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 823 | `.gm-mk-act` | colour not from tokens.css (#c9cae6) | fix |
| `assets/app.css` | 824 | `.gm-mk-act-btn` | colour not from tokens.css (#2f3252, #7c6cf7) | fix |
| `assets/app.css` | 826 | `.gm-mk-menu` | colour not from tokens.css (#2f3252) | fix |
| `assets/app.css` | 828 | `.gm-mk-menu-ico` | colour not from tokens.css (rgba(124,108,247,.16)) | fix |
| `assets/app.css` | 829 | `.gm-mk-arrow` | colour not from tokens.css (#FF3B3B) | fix |
| `assets/app.css` | 871 | `.pi-overlay` | decorative animation (fadeIn .3s ease) | fix |
| `assets/app.css` | 872 | `.pi-modal` | glow / neon shadow (box-shadow: 0 0 80px rgb(var(--color-gold-rgb) / .12)) | fix |
| `assets/app.css` | 888 | `.sp-page` | glow orb / spotlight gradient; decorative animation (fadeIn .25s ease) | fix |
| `assets/app.css` | 894 | `.live-chip-btn:hover` | glow / neon shadow (box-shadow: 0 0 0 2px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 911 | `.rb-pill.active` | glow / neon shadow (box-shadow: 0 0 0 1px var(--text3)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 912 | `.btc-rainbow-tip` | colour not from tokens.css (rgba(12,12,16,0.95)) | fix |
| `assets/app.css` | 945 | `.cmb-swap-title` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 986 | `.sp-new-btn` | glow / neon shadow (box-shadow: 0 3px 12px rgb(var(--color-gold-rgb) / .25)) | fix |
| `assets/app.css` | 1023 | `#secInputs .ed-group-title` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 1026 | `#secInputs .ed-fld:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1037 | `#secInputs .ed-dd:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1048 | `#secInputs .ed-sbtn` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 1050 | `#secInputs .ed-sbtn-primary` | glow / neon shadow (box-shadow: 0 2px 10px rgb(var(--color-gold-rgb) / .25)) | fix |
| `assets/app.css` | 1083 | `.pi-mode-btn.active` | glow / neon shadow (box-shadow: 0 2px 8px rgb(var(--color-gold-rgb) / .25)) | fix |
| `assets/app.css` | 1088 | `.pi-field-box:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1093 | `.pi-field-budget:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1100 | `.sp-page select:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1105 | `.sp-payout-val:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1118 | `.sp-page-loading` | decorative animation (fadeIn .2s ease) | fix |
| `assets/app.css` | 1120 | `.planner-a` | glow / neon shadow (box-shadow: 0 2px 12px rgb(var(--color-gold-rgb) / .12)); decorative animation (adjustPulse 2.6s ease-in-out infinite) | fix |
| `assets/app.css` | 1121 | `.planner-adjust-btn:hover` | glow / neon shadow (box-shadow: 0 5px 20px rgb(var(--color-gold-rgb) / .25)) | fix |
| `assets/app.css` | 1130 | `.cshot-overlay` | colour not from tokens.css (rgba(6,6,8,.82)) | fix |
| `assets/app.css` | 1133 | `.cshot-x` | colour not from tokens.css (#999) | fix |
| `assets/app.css` | 1137 | `.cshot-loading` | colour not from tokens.css (#999) | fix |
| `assets/app.css` | 1142 | `.cshare-sheet` | decorative animation (cshFade .18s ease) | fix |
| `assets/app.css` | 1144 | `.cshare-panel` | colour not from tokens.css (#1c1c1e); decorative animation (cshUp .26s cubic-bezier(.2,.8,.2,1)) | fix |
| `assets/app.css` | 1164 | `.planner-proj-btn:hover` | glow / neon shadow (box-shadow: 0 6px 24px rgb(var(--color-gold-rgb) / .2)) | fix |
| `assets/app.css` | 1172 | `.planner-top-row .planner-proj-btn` | glow / neon shadow (box-shadow: 0 2px 14px rgb(var(--color-gold-rgb) / .1)) | fix |
| `assets/app.css` | 1173 | `.planner-top-row .planner-proj-btn:hover` | glow / neon shadow (box-shadow: 0 6px 26px rgb(var(--color-gold-rgb) / .24)) | fix |
| `assets/app.css` | 1181 | `.sp-loading` | decorative animation (fadeIn .2s ease) | fix |
| `assets/app.css` | 1182 | `.sp-spinner` | decorative animation (spSpin .7s linear infinite) | fix |
| `assets/app.css` | 1186 | `.pi-calc-loading` | decorative animation (fadeIn .2s ease) | fix |
| `assets/app.css` | 1198 | `.hero-card` | decorative animation (cardEnter .4s ease backwards) | fix |
| `assets/app.css` | 1203 | `.field input:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow),0 0 20px rgb(var(--) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1216 | `.ri-card .ri-label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 1231 | `.ri-table td` | colour not from tokens.css (rgba(58,57,64,.3)) | fix |
| `assets/app.css` | 1238 | `.ri-btn:hover` | colour not from tokens.css (#4ae8ac) | fix |
| `assets/app.css` | 1241 | `.ri-chart-title` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 1249 | `.ri-tip-day` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 1253 | `.ri-single-card .ri-label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/app.css` | 1323 | `.hero-card,.section,.sp-page` | heavy glass blur | fix |
| `assets/app.css` | 1351 | `/* header -> EXACT copy of the landing nav: full-bleed docke` | heavy glass blur | fix |
| `assets/app.css` | 1360 | `.header .c-brand img` | glow / neon shadow (filter: drop-shadow(...)) | fix |
| `assets/app.css` | 1365 | `.header .nav-links a` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 1373 | `.header .nav-cta` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .34)) | fix |
| `assets/app.css` | 1374 | `.header .nav-cta:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/app.css` | 1378 | `/* live strip` | heavy glass blur; colour not from tokens.css (rgba(20,22,30,.7)) | fix |
| `assets/app.css` | 1404 | `html .topbar>.header` | colour not from tokens.css (#08090c) | fix |
| `assets/app.css` | 1420 | `.tab-btn` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 1424 | `.field-input:has(input[type="number"]):focus-wit` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1426 | `.share-plan-btn,.disc-override-row` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .3)) | fix |
| `assets/app.css` | 1427 | `.share-plan-btn:hover,.disc-override-row button:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .46)) | fix |
| `assets/app.css` | 1433 | `/* =========================================================` | glow orb / spotlight gradient | fix |
| `assets/app.css` | 1435 | `.donate-overlay` | colour not from tokens.css (rgba(2,3,5,.72)) | fix |
| `assets/app.css` | 1448 | `.hero-card .corners::before` | corner bracket frame | fix |
| `assets/app.css` | 1449 | `.hero-card .corners::after` | corner bracket frame | fix |
| `assets/app.css` | 1450 | `.hero-card .hero-label` | ALL-CAPS letter-spaced | fix |
| `assets/app.css` | 1460 | `.hero-card:hover` | glow / neon shadow (box-shadow: var(--sh),0 0 34px rgb(var(--color-gold-rgb) / .) | fix |
| `assets/app.css` | 1477 | `` | glow orb / spotlight gradient | fix |
| `assets/app.css` | 1505 | `/* =========================================================` | decorative animation (fadeIn .25s ease) | fix |
| `assets/app.css` | 1541 | `#secInputs .ed-dd:hover,.sp-page select:hover,.tabs-saved se` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .1)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1563 | `.qk-pop input:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 1593 | `.pi-contrib-freq:focus` | glow / neon shadow (box-shadow: 0 0 0 3px var(--purple-glow)) | fix: focus ring → var(--focus-ring) |
| `assets/app.css` | 37 | `@keyframes pulse` | old animation | fix |
| `assets/app.css` | 68 | `@keyframes fadeIn` | old animation | fix |
| `assets/app.css` | 192 | `@keyframes idleActPulse` | old animation | fix |
| `assets/app.css` | 349 | `@keyframes greedyFlash` | old animation | fix |
| `assets/app.css` | 350 | `@keyframes greedyLabelFlash` | old animation | fix |
| `assets/app.css` | 561 | `@keyframes shimmer` | old animation | fix |
| `assets/app.css` | 689 | `@keyframes obFadeIn` | old animation | fix |
| `assets/app.css` | 714 | `@keyframes lpDrift1` | old animation | fix |
| `assets/app.css` | 715 | `@keyframes lpDrift2` | old animation | fix |
| `assets/app.css` | 716 | `@keyframes lpDrift3` | old animation | fix |
| `assets/app.css` | 718 | `@keyframes lpSpin` | old animation | fix |
| `assets/app.css` | 724 | `@keyframes lpShimmer` | old animation | fix |
| `assets/app.css` | 741 | `@keyframes obSlideIn` | old animation | fix |
| `assets/app.css` | 782 | `@keyframes obReveal` | old animation | fix |
| `assets/app.css` | 1123 | `@keyframes adjustPulse` | old animation | fix |
| `assets/app.css` | 1143 | `@keyframes cshFade` | old animation | fix |
| `assets/app.css` | 1145 | `@keyframes cshUp` | old animation | fix |
| `assets/app.css` | 1184 | `@keyframes spSpin` | old animation | fix |
| `assets/app.css` | 1197 | `@keyframes cardEnter` | old animation | fix |
| `assets/chat.css` | 9 | `.gmt-chat.gmt-dock` | decorative animation (gmtChatIn var(--duration-base) var(--ease-standard)) | fix |
| `assets/chat.css` | 52 | `.gmt-msg.mentioned` | glow / neon shadow (box-shadow: inset 2px 0 0 var(--color-gold)) | fix |
| `assets/chat.css` | 79 | `#gmtOnline.mention-al` | decorative animation (gmtMentionPulse 1s ease-in-out infinite) | fix |
| `assets/chat.css` | 95 | `.uc-role` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/chat.css` | 12 | `@keyframes gmtChatIn` | old animation | fix |
| `assets/chat.css` | 80 | `@keyframes gmtMentionPulse` | old animation | fix |
| `assets/chat.css` | 109 | `@keyframes gmtChatUp` | old animation | fix |
| `assets/components.css` | 30 | `.ui-eyebrow` | ALL-CAPS letter-spaced | keep: Phase 1 component (eyebrow / modal & toast pop) |
| `assets/components.css` | 197 | `.ui-modal[open]` | decorative animation (ui-pop var(--duration-base) var(--ease-standard)) | keep: Phase 1 component (eyebrow / modal & toast pop) |
| `assets/components.css` | 209 | `.ui-toast` | decorative animation (ui-pop var(--duration-base) var(--ease-standard)) | keep: Phase 1 component (eyebrow / modal & toast pop) |
| `assets/components.css` | 204 | `@keyframes ui-pop` | old animation | keep: Phase 1 component (eyebrow / modal & toast pop) |
| `assets/content.css` | 21 | `.orb-1` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 22 | `.orb-2` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 23 | `.orb-3` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 24 | `.beam` | colour not from tokens.css (rgba(255,210,140,.4)) | fix |
| `assets/content.css` | 26 | `.grid-floor` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 31 | `.vignette` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 38 | `.ticker` | decorative animation (ticker 34s linear infinite) | fix |
| `assets/content.css` | 46 | `.brand img` | glow / neon shadow (filter: drop-shadow(...)) | fix |
| `assets/content.css` | 48 | `.nav-links a` | ALL-CAPS letter-spaced | fix |
| `assets/content.css` | 51 | `.nav-cta` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .34)) | fix |
| `assets/content.css` | 53 | `.nav-cta:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/content.css` | 80 | `.updated` | ALL-CAPS letter-spaced | fix |
| `assets/content.css` | 83 | `.tag` | ALL-CAPS letter-spaced | fix |
| `assets/content.css` | 84 | `.tag .dot` | glow / neon shadow (box-shadow: 0 0 10px var(--gold)) | fix |
| `assets/content.css` | 88 | `.stat,.scenario,.formula,.faq details,.cta,.claim-card` | heavy glass blur | fix |
| `assets/content.css` | 93 | `.stat .k` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/content.css` | 108 | `table.earnings thead th` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/content.css` | 118 | `.cta a.btn` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .4)) | fix |
| `assets/content.css` | 136 | `.site-foot h4` | ALL-CAPS letter-spaced | fix |
| `assets/content.css` | 152 | `.site-foot .fd-addr:hover` | glow / neon shadow (box-shadow: 0 8px 22px rgb(var(--color-gold-rgb) / .14)) | fix |
| `assets/content.css` | 171 | `.stat:hover,.scenario:hover,.claim-card:hover` | glow / neon shadow (box-shadow: var(--sh),0 0 30px rgb(var(--color-gold-rgb) / .) | fix |
| `assets/content.css` | 175 | `.cta a.btn:hover` | glow / neon shadow (box-shadow: 0 16px 40px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/content.css` | 179 | `.stat::after,.sce` | glow orb / spotlight gradient | fix |
| `assets/content.css` | 40 | `@keyframes ticker` | old animation | fix |
| `assets/copilot.css` | 3 | `/* GMT-Optimizer co-pilot chat (assets/copilot.js). Self-con` | glow / neon shadow (box-shadow: 0 10px 30px -6px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/copilot.css` | 9 | `.gc-fab:hover` | glow / neon shadow (box-shadow: 0 14px 36px -6px rgb(var(--color-gold-rgb) / .7)) | fix |
| `assets/copilot.css` | 16 | `.gc-tip` | colour not from tokens.css (#151515) | fix |
| `assets/copilot.css` | 23 | `.gc-panel` | glow / neon shadow (box-shadow: 0 30px 80px -20px rgb(var(--color-black-rgb) / .); non-token font (font-family: Inter,system-ui,-apple-system,sans-serif); colour not from tokens.css (#0d0d0d) | fix |
| `assets/copilot.css` | 28 | `.gc-head` | colour not from tokens.css (#121010, #181410) | fix |
| `assets/copilot.css` | 32 | `.gc-head small` | non-token font (font-family: ui-monospace,) | fix |
| `assets/copilot.css` | 40 | `.gc-bot` | colour not from tokens.css (#161616, #262321) | fix |
| `assets/copilot.css` | 43 | `.gc-typing i` | decorative animation (gc-blink 1s infinite) | fix |
| `assets/copilot.css` | 56 | `.gc-card span` | ALL-CAPS letter-spaced; non-token font (font-family: ui-monospace,monospace) | fix |
| `assets/copilot.css` | 57 | `.gc-card b` | non-token font (font-family: ui-monospace,monospace) | fix |
| `assets/copilot.css` | 64 | `.gc-opt` | colour not from tokens.css (#1c160b, #5a4217) | fix |
| `assets/copilot.css` | 71 | `.gc-ask input` | colour not from tokens.css (#060606, #2a2622) | fix |
| `assets/copilot.css` | 94 | `.gc-tabs` | colour not from tokens.css (#121010) | fix |
| `assets/copilot.css` | 101 | `.gc-tab-n,.gc-badge` | colour not from tokens.css (#04140b) | fix |
| `assets/copilot.css` | 114 | `.gc-page` | non-token font (font-family: Inter,system-ui,-apple-system,sans-serif); colour not from tokens.css (#0d0d0d) | fix |
| `assets/copilot.css` | 45 | `@keyframes gc-blink` | old animation | fix |
| `assets/design.css` | 25 | `.rd .orb-1` | glow orb / spotlight gradient; decorative animation (drift1 11s var(--ease) infinite alternate) | fix |
| `assets/design.css` | 26 | `.rd .orb-2` | glow orb / spotlight gradient; decorative animation (drift2 13s var(--ease) infinite alternate) | fix |
| `assets/design.css` | 27 | `.rd .orb-3` | glow orb / spotlight gradient; decorative animation (drift3 9s var(--ease) infinite alternate) | fix |
| `assets/design.css` | 31 | `.rd .grid-floor` | glow orb / spotlight gradient; decorative animation (gridscroll 6s linear infinite) | fix |
| `assets/design.css` | 37 | `.rd .beam` | colour not from tokens.css (rgba(255,210,140,.5)) | fix |
| `assets/design.css` | 39 | `.rd .beam-1` | decorative animation (beam 10s var(--ease) infinite) | fix |
| `assets/design.css` | 40 | `.rd .beam-2` | decorative animation (beam 12s var(--ease) 3s infinite) | fix |
| `assets/design.css` | 41 | `.rd .beam-3` | decorative animation (beam 9s var(--ease) 6s infinite) | fix |
| `assets/design.css` | 44 | `.rd .vignette` | glow orb / spotlight gradient | fix |
| `assets/design.css` | 52 | `.rd .glass` | heavy glass blur | fix |
| `assets/design.css` | 60 | `.rd .spot::after` | glow orb / spotlight gradient | fix |
| `assets/design.css` | 66 | `.rd .corners::before` | corner bracket frame | fix |
| `assets/design.css` | 67 | `.rd .corners::after` | corner bracket frame | fix |
| `assets/design.css` | 72 | `.rd .tag` | ALL-CAPS letter-spaced | fix |
| `assets/design.css` | 75 | `.rd .tag .dot` | glow / neon shadow (box-shadow: 0 0 10px var(--gold)); decorative animation (pulse 2.4s ease infinite) | fix |
| `assets/design.css` | 80 | `.rd .grad` | decorative animation (shimmer 7s linear infinite) | fix |
| `assets/design.css` | 92 | `.rd .ticker` | decorative animation (ticker 34s linear infinite) | fix |
| `assets/design.css` | 102 | `.rd .brand img` | glow / neon shadow (filter: drop-shadow(...)) | fix |
| `assets/design.css` | 105 | `.rd .nav-links a` | ALL-CAPS letter-spaced | fix |
| `assets/design.css` | 108 | `.rd .nav-cta` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .34)) | fix |
| `assets/design.css` | 110 | `.rd .nav-cta:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/design.css` | 123 | `.rd .btn-primary` | glow / neon shadow (box-shadow: 0 10px 34px rgb(var(--color-gold-rgb) / .4),inse) | fix |
| `assets/design.css` | 124 | `.rd .btn-primary small` | colour not from tokens.css (#3a2600) | fix |
| `assets/design.css` | 125 | `.rd .btn-primary:hover` | glow / neon shadow (box-shadow: 0 16px 46px rgb(var(--color-gold-rgb) / .6)) | fix |
| `assets/design.css` | 126 | `.rd .btn-alt` | colour not from tokens.css (rgba(16,18,24,.6), rgba(30,32,40,.6)) | fix |
| `assets/design.css` | 127 | `.rd .btn-alt:hover` | glow / neon shadow (box-shadow: 0 12px 36px rgb(var(--color-gold-rgb) / .22)) | fix |
| `assets/design.css` | 145 | `.rd .hero-trust i` | glow / neon shadow (box-shadow: 0 0 8px var(--gold)) | fix |
| `assets/design.css` | 151 | `.rd .reticle .r-spin` | decorative animation (spin 60s linear infinite) | fix |
| `assets/design.css` | 152 | `.rd .reticle .r-spin-rev` | decorative animation (spin 90s linear infinite reverse) | fix |
| `assets/design.css` | 153 | `.rd .radar` | glow orb / spotlight gradient; decorative animation (spin 7s linear infinite) | fix |
| `assets/design.css` | 159 | `.rd .holo::after` | glow orb / spotlight gradient; decorative animation (pulseGlow 4.2s var(--ease) infinite) | fix |
| `assets/design.css` | 162 | `.rd .holo svg` | glow / neon shadow (filter: drop-shadow(...)); decorative animation (spin 46s linear infinite) | fix |
| `assets/design.css` | 163 | `.rd .holo img.holo-mark` | glow / neon shadow (filter: drop-shadow(...)) | fix |
| `assets/design.css` | 165 | `.rd .callout` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/design.css` | 171 | `.rd .callout .cd` | glow / neon shadow (box-shadow: 0 0 6px var(--gold)) | fix |
| `assets/design.css` | 173 | `.rd .telem` | decorative animation (floatY 5s var(--ease) infinite alternate) | fix |
| `assets/design.css` | 176 | `.rd .telem .t-head` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/design.css` | 178 | `.rd .telem .t-live i` | glow / neon shadow (box-shadow: 0 0 8px var(--color-success)); decorative animation (pulse 1.8s ease infinite) | fix |
| `assets/design.css` | 179 | `.rd .telem .t-big` | glow / neon shadow (text-shadow: 0 0 22px rgb(var(--color-gold-rgb) / .35)) | fix |
| `assets/design.css` | 184 | `.rd .telem .t-mini .ml` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/design.css` | 191 | `.rd .mq-track` | ALL-CAPS letter-spaced; decorative animation (ticker 32s linear infinite) | fix |
| `assets/design.css` | 198 | `.rd .stat-card:hover` | glow / neon shadow (box-shadow: var(--sh),0 0 34px rgb(var(--color-gold-rgb) / .) | fix |
| `assets/design.css` | 201 | `.rd .stat-card .s-label` | ALL-CAPS letter-spaced | fix |
| `assets/design.css` | 216 | `.rd .feat .ico` | glow / neon shadow (box-shadow: inset 0 1px 0 rgb(var(--color-white-rgb) / .14),) | fix |
| `assets/design.css` | 224 | `.rd .cta-band::after` | glow orb / spotlight gradient | fix |
| `assets/design.css` | 226 | `.rd .cta-band .rings` | glow orb / spotlight gradient | fix |
| `assets/design.css` | 269 | `.rd .foot-social a:hover` | glow / neon shadow (box-shadow: 0 8px 22px rgb(var(--color-gold-rgb) / .2)) | fix |
| `assets/design.css` | 272 | `.rd .foot-col h4` | ALL-CAPS letter-spaced | fix |
| `assets/design.css` | 287 | `.rd .fd-addr:hover` | glow / neon shadow (box-shadow: 0 8px 22px rgb(var(--color-gold-rgb) / .14)) | fix |
| `assets/design.css` | 364 | `.rd .cine-sub,.rd .cine-cue` | ALL-CAPS letter-spaced | fix |
| `assets/design.css` | 366 | `.rd .cine-cue` | decorative animation (cueBob 2.4s var(--ease) infinite) | fix |
| `assets/design.css` | 400 | `/* The canvas already carries the motion — a drop shadow kee` | colour not from tokens.css (rgba(4,6,12,.92)) | fix |
| `assets/design.css` | 413 | `/* ============ SCROLL-DRIVEN LAYER ============ Motion tied` | glow / neon shadow (box-shadow: 0 0 14px rgb(var(--color-gold-rgb) / .55)) | fix |
| `assets/design.css` | 437 | `.rd .sprog` | decorative animation (sprogGrow linear both) | fix |
| `assets/design.css` | 441 | `/* Reveals scrub with scroll position instead of snapping on` | decorative animation (revealScrub linear both) | fix |
| `assets/design.css` | 451 | `.rd .sec-head::after` | decorative animation (headSweep linear both) | fix |
| `assets/design.css` | 457 | `/* Hero drifts up and dissolves as it leaves — the parallax ` | decorative animation (heroExit linear both) | fix |
| `assets/design.css` | 495 | `html.lite .rd .btn-alt` | colour not from tokens.css (rgba(16,18,24,.92), rgba(30,32,40,.92)) | fix |
| `assets/design.css` | 28 | `@keyframes drift1` | old animation | fix |
| `assets/design.css` | 29 | `@keyframes drift2` | old animation | fix |
| `assets/design.css` | 30 | `@keyframes drift3` | old animation | fix |
| `assets/design.css` | 36 | `@keyframes gridscroll` | old animation | fix |
| `assets/design.css` | 42 | `@keyframes beam` | old animation | fix |
| `assets/design.css` | 76 | `@keyframes pulse` | old animation | fix |
| `assets/design.css` | 82 | `@keyframes shimmer` | old animation | fix |
| `assets/design.css` | 94 | `@keyframes ticker` | old animation | fix |
| `assets/design.css` | 157 | `@keyframes spin` | old animation | fix |
| `assets/design.css` | 161 | `@keyframes pulseGlow` | old animation | fix |
| `assets/design.css` | 175 | `@keyframes floatY` | old animation | fix |
| `assets/design.css` | 367 | `@keyframes cueBob` | old animation | fix |
| `assets/design.css` | 428 | `@keyframes sprogGrow` | old animation | fix |
| `assets/design.css` | 429 | `@keyframes revealScrub` | old animation | fix |
| `assets/design.css` | 431 | `@keyframes headSweep` | old animation | fix |
| `assets/design.css` | 432 | `@keyframes heroExit` | old animation | fix |
| `assets/futures.css` | 2 | `.fx-wrap` | glow orb / spotlight gradient | fix |
| `assets/futures.css` | 13 | `.fx-x i` | colour not from tokens.css (#0a0b0e) | fix |
| `assets/futures.css` | 14 | `.fx-x .mid` | glow / neon shadow (box-shadow: 0 0 10px var(--color-gold-300)) | fix |
| `assets/futures.css` | 14 | `.fx-x .hi` | glow / neon shadow (box-shadow: 0 0 10px var(--color-success)) | fix |
| `assets/futures.css` | 14 | `.fx-x .lo` | glow / neon shadow (box-shadow: 0 0 10px var(--color-error)) | fix |
| `assets/futures.css` | 15 | `.fx-tip` | glow / neon shadow (box-shadow: 0 6px 24px rgb(var(--color-black-rgb) / .5),0 0 ); colour not from tokens.css (rgba(10,11,14,.92)) | fix |
| `assets/futures.css` | 32 | `.fx-k` | ALL-CAPS letter-spaced | fix |
| `assets/futures.css` | 46 | `.fx-spin` | decorative animation (fxspin .8s linear infinite) | fix |
| `assets/futures.css` | 50 | `.fx-load` | glow orb / spotlight gradient; colour not from tokens.css (#08090c) | fix |
| `assets/futures.css` | 53 | `.fx-lk` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/futures.css` | 55 | `.fx-lc span` | glow / neon shadow (text-shadow: 0 0 22px rgb(var(--color-gold-rgb) / .6)) | fix |
| `assets/futures.css` | 60 | `.fx-lbar i` | glow / neon shadow (box-shadow: 0 0 12px rgb(var(--color-gold-rgb) / .8)) | fix |
| `assets/futures.css` | 64 | `.fx-lsteps li.on b` | decorative animation (fxspin .7s linear infinite) | fix |
| `assets/futures.css` | 65 | `.fx-lsteps li.ok b` | glow / neon shadow (box-shadow: 0 0 9px rgb(var(--color-success-rgb) / .6)) | fix |
| `assets/futures.css` | 47 | `@keyframes fxspin` | old animation | fix |
| `assets/landing.css` | 87 | `.lp-band` | glow orb / spotlight gradient | keep: landing page is the benchmark (faint CTA band tint) |
| `assets/market-check.css` | 2 | `/* ===== Marketplace deal checker — /gomining-marketplace-ch` | heavy glass blur | fix |
| `assets/market-check.css` | 10 | `.mc-url input:focus` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `assets/market-check.css` | 11 | `.mc-url button` | glow / neon shadow (box-shadow: 0 8px 24px rgb(var(--color-gold-rgb) / .3)) | fix |
| `assets/market-check.css` | 14 | `.mc-url button:hover` | glow / neon shadow (box-shadow: 0 12px 30px rgb(var(--color-gold-rgb) / .42)) | fix |
| `assets/market-check.css` | 17 | `.mc-err` | colour not from tokens.css (#ffc2b0) | fix |
| `assets/market-check.css` | 27 | `.mc-pill` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/market-check.css` | 45 | `.mc-tbl th` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/market-check.css` | 52 | `.mc-tbl tr.hl td:first-child` | glow / neon shadow (box-shadow: inset 2px 0 0 var(--gold)) | fix |
| `assets/market-check.css` | 80 | `.mc-g-stats span` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/market-check.css` | 88 | `.mc-scan` | glow / neon shadow (box-shadow: inset 0 0 40px rgb(var(--color-gold-rgb) / .05)); glow orb / spotlight gradient | fix |
| `assets/market-check.css` | 92 | `.mc-scan::before` | decorative animation (mcGrid 3s linear infinite) | fix |
| `assets/market-check.css` | 98 | `.mc-scan-ring` | glow orb / spotlight gradient; decorative animation (mcSpin 1s linear infinite) | fix |
| `assets/market-check.css` | 105 | `.mc-scan-line` | glow / neon shadow (box-shadow: 0 2px 12px rgb(var(--color-gold-rgb) / .7)) | fix |
| `assets/market-check.css` | 107 | `.mc-scan-thumb.has-img .mc-scan-line` | decorative animation (mcScanLine 1.15s cubic-bezier(.45,0,.55,1) infinite) | fix |
| `assets/market-check.css` | 115 | `.mc-scan-bar i` | glow / neon shadow (box-shadow: 0 0 12px rgb(var(--color-gold-rgb) / .8)) | fix |
| `assets/market-check.css` | 120 | `.mc-sstep.on b` | decorative animation (mcSpin .7s linear infinite) | fix |
| `assets/market-check.css` | 122 | `.mc-sstep.ok b` | glow / neon shadow (box-shadow: 0 0 9px rgb(var(--color-success-rgb) / .6)) | fix |
| `assets/market-check.css` | 137 | `.mc-rise` | decorative animation (mcRise .6s cubic-bezier(.16,1,.3,1) both) | fix |
| `assets/market-check.css` | 139 | `.mc-counting` | glow / neon shadow (text-shadow: 0 0 16px rgb(var(--color-gold-rgb) / .55)) | fix |
| `assets/market-check.css` | 140 | `.mc-counted` | decorative animation (mcCounted .85s ease-out) | fix |
| `assets/market-check.css` | 150 | `.mc-runat span` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/market-check.css` | 95 | `@keyframes mcGrid` | old animation | fix |
| `assets/market-check.css` | 109 | `@keyframes mcScanLine` | old animation | fix |
| `assets/market-check.css` | 110 | `@keyframes mcSpin` | old animation | fix |
| `assets/market-check.css` | 138 | `@keyframes mcRise` | old animation | fix |
| `assets/market-check.css` | 141 | `@keyframes mcCounted` | old animation | fix |
| `assets/odds.css` | 26 | `.odds-bar i.good` | colour not from tokens.css (#5fb85a) | fix |
| `assets/odds.css` | 36 | `.odds-fan` | glow orb / spotlight gradient | fix |
| `assets/odds.css` | 46 | `.odds-call` | glow orb / spotlight gradient | fix |
| `assets/odds.css` | 47 | `.call-kicker` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/roi-embed.css` | 2 | `/* ===== ROI calculator widget — shared by /gomining-roi-cal` | heavy glass blur | fix |
| `assets/roi-embed.css` | 8 | `.re-field label` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/roi-embed.css` | 13 | `.re-field input:focus` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `assets/roi-embed.css` | 20 | `.re-tile .k` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `assets/site-chrome.css` | 33 | `.sc-nav a[aria-current="page"]` | glow / neon shadow (box-shadow: inset 0 -2px 0 var(--color-gold)) | keep: header underline / tiny eyebrow labels (new design) |
| `assets/site-chrome.css` | 71 | `.sc-soon` | ALL-CAPS letter-spaced | keep: header underline / tiny eyebrow labels (new design) |
| `assets/site-chrome.css` | 84 | `.sc-mobile__group h2` | ALL-CAPS letter-spaced | keep: header underline / tiny eyebrow labels (new design) |
| `assets/site-chrome.css` | 104 | `.sc-footer__cols h2` | ALL-CAPS letter-spaced | keep: header underline / tiny eyebrow labels (new design) |
| `assets/topbar.css` | 20 | `.gmbar-head` | heavy glass blur | fix |
| `assets/topbar.css` | 35 | `.gmbar .brand img` | glow / neon shadow (filter: drop-shadow(...)) | fix |
| `assets/topbar.css` | 38 | `.gmbar .nav-cta` | glow / neon shadow (box-shadow: 0 6px 22px rgb(var(--color-gold-rgb) / .34)) | fix |
| `assets/topbar.css` | 41 | `.gmbar .nav-cta:hover` | glow / neon shadow (box-shadow: 0 10px 30px rgb(var(--color-gold-rgb) / .5)) | fix |
| `assets/topbar.css` | 45 | `.gmbar .live-bar` | heavy glass blur; colour not from tokens.css (rgba(20,22,30,.78)) | fix |
| `assets/topbar.css` | 57 | `.gmbar .live-dot` | glow / neon shadow (box-shadow: 0 0 8px var(--color-success)) | fix |
| `bitcoin/index.html` | 31 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `combined/index.html` | 29 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `console/index.html` | 71 | `#gmBoot` | glow orb / spotlight gradient; non-token font (font-family: 'Inter',system-ui,-apple-system,sans-serif); decorative animation (gbFailsafe 0s linear 12s forwards) | fix |
| `console/index.html` | 76 | `#gmBoot::before` | glow orb / spotlight gradient; decorative animation (gbGrid 6s linear infinite) | fix |
| `console/index.html` | 86 | `.gb-orb::before` | glow orb / spotlight gradient; decorative animation (gbSpin 1.1s linear infinite) | fix |
| `console/index.html` | 88 | `.gb-orb::after` | decorative animation (gbPulse 1.6s ease-in-out infinite) | fix |
| `console/index.html` | 89 | `.gb-orb img` | glow / neon shadow (filter: drop-shadow(...)); decorative animation (gbBreathe 1.6s ease-in-out infinite) | fix |
| `console/index.html` | 93 | `.gb-brand` | ALL-CAPS letter-spaced; non-token font (font-family: 'Inter',ui-monospace,monospace) | fix |
| `console/index.html` | 97 | `.gb-bar i` | glow / neon shadow (box-shadow: 0 0 14px rgb(var(--color-gold-rgb) / .8)) | fix |
| `console/index.html` | 99 | `.gb-pct` | non-token font (font-family: 'Inter',ui-monospace,monospace) | fix |
| `console/index.html` | 104 | `.gb-step.on b` | decorative animation (gbSpin .7s linear infinite) | fix |
| `console/index.html` | 106 | `.gb-step.ok b` | glow / neon shadow (box-shadow: 0 0 10px rgb(var(--color-success-rgb) / .6)) | fix |
| `console/index.html` | 109 | `.gb-v` | non-token font (font-family: 'Inter',ui-monospace,monospace) | fix |
| `console/index.html` | 111 | `.gb-hash` | non-token font (font-family: 'Inter',ui-monospace,monospace) | fix |
| `console/index.html` | 117 | `.gm-counting` | glow / neon shadow (text-shadow: 0 0 18px rgb(var(--color-gold-rgb) / .55)) | fix |
| `console/index.html` | 118 | `.gm-counted` | decorative animation (gmCounted .9s ease-out) | fix |
| `console/index.html` | 81 | `@keyframes gbFailsafe` | old animation | fix |
| `console/index.html` | 82 | `@keyframes gbGrid` | old animation | fix |
| `console/index.html` | 90 | `@keyframes gbSpin` | old animation | fix |
| `console/index.html` | 91 | `@keyframes gbPulse` | old animation | fix |
| `console/index.html` | 92 | `@keyframes gbBreathe` | old animation | fix |
| `console/index.html` | 119 | `@keyframes gmCounted` | old animation | fix |
| `console/index.html` | 1314 | `.ytp-play` | colour not from tokens.css (#FF0033) | fix |
| `console/index.html` | 1315 | `.ytp-play::after` | corner bracket frame | fix |
| `console/index.html` | 1317 | `.ytp-kicker` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `console/index.html` | 369 | `inline` | colour not from tokens.css (#dc2626, #ef4444); glow / neon shadow (box-shadow: 0 4px 20px rgb(var(--color-gold-rgb) / .3)); ALL-CAPS letter-spaced | fix |
| `edit/index.html` | 18 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `gmt/index.html` | 31 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `odds/index.html` | 26 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `planner/index.html` | 32 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `planner/projection/index.html` | 32 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `projection/index.html` | 32 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `quote/index.html` | 26 | `:root` | colour not from tokens.css (#121316, #17181c, #26272c) | fix |
| `quote/index.html` | 30 | `body` | glow orb / spotlight gradient | fix |
| `quote/index.html` | 50 | `.dot` | glow / neon shadow (box-shadow: 0 0 7px var(--green)) | fix |
| `quote/index.html` | 59 | `.field:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `quote/index.html` | 87 | `.headline .lab` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `quote/index.html` | 93 | `.cell .k` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `quote/index.html` | 103 | `.bar .gm` | colour not from tokens.css (#c4b0ff) | fix |
| `quote/index.html` | 135 | `.shot` | colour not from tokens.css (rgba(6,6,8,.84)) | fix |
| `rainbow/index.html` | 29 | `body` | non-token font (font-family: system-ui,-apple-system,sans-serif) | fix |
| `statement/index.html` | 32 | `/* Palette note: the chart marks below are not chosen by eye` | colour not from tokens.css (#00b076, #121316, #17181c, #26272c, #b83719) | fix |
| `statement/index.html` | 37 | `body` | glow orb / spotlight gradient; colour not from tokens.css (#111, #fff) | fix |
| `statement/index.html` | 62 | `.err` | colour not from tokens.css (#ffb3a3) | fix |
| `statement/index.html` | 66 | `.loaded .dot` | glow / neon shadow (box-shadow: 0 0 7px var(--c-pos)) | fix |
| `statement/index.html` | 74 | `.fld label` | ALL-CAPS letter-spaced | fix |
| `statement/index.html` | 77 | `.fld input:focus,.fld select:focus` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `statement/index.html` | 101 | `.dh-kind` | ALL-CAPS letter-spaced; colour not from tokens.css (#8a5a00) | fix |
| `statement/index.html` | 103 | `.dh-meta i` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `statement/index.html` | 110 | `.h-lab` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `statement/index.html` | 112 | `.hero.neg .h-big` | colour not from tokens.css (#ff9b86) | fix |
| `statement/index.html` | 118 | `.kpi .k` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `statement/index.html` | 154 | `.tbl th` | ALL-CAPS letter-spaced | fix → eyebrow: keep caps only if it is a tiny eyebrow label, else sentence case |
| `statement/index.html` | 159 | `.tbl .neg` | colour not from tokens.css (#ff9b86) | fix |
| `statement/index.html` | 199 | `.stake-item:focus-within` | glow / neon shadow (box-shadow: 0 0 0 3px rgb(var(--color-gold-rgb) / .14)) | fix: focus ring → var(--focus-ring) |
| `statement/index.html` | 213 | `:root` | colour not from tokens.css (#00795a, #111, #333, #555, #777, #8a5a00, #999, #a06400, #b3) | fix |
| `statement/index.html` | 222 | `.hero` | colour not from tokens.css (#e6d3ac, #fdf6e8) | fix |
| `statement/index.html` | 223 | `.hero.neg` | colour not from tokens.css (#e8c4b6, #fdeee9) | fix |
| `statement/index.html` | 224 | `.h-big` | colour not from tokens.css (#8a5a00) | fix |
| `statement/index.html` | 226 | `.kpi,.fig,.pf,.tbl th,.tbl tfoot td` | colour not from tokens.css (#fafafa) | fix |
| `statement/index.html` | 229 | `.pf b` | colour not from tokens.css (#8a5a00) | fix |
| `statement/index.html` | 234 | `.tbl-scroll` | colour not from tokens.css (#d8d8d8) | fix |
| `assets/account-pages.js` | 251 | `js` | old effect code | fix |
| `assets/account.js` | 420 | `inline` | colour not from tokens.css (#e8ecf4, rgba(255,255,255,.05), rgba(255,255,255,.14)) | fix |
| `assets/app.js` | 2182 | `canvas` | glow on canvas (shadowBlur) | fix |
| `assets/app.js` | 1612 | `border-left-color:$` | colour not from tokens.css (#22C55E, #EF4444, #f3a93a) | fix |
| `assets/app.js` | 1688 | `color:$` | colour not from tokens.css (#22C55E, #EF4444) | fix |
| `assets/app.js` | 1698 | `inline` | colour not from tokens.css (#F7D88A) | fix |
| `assets/app.js` | 4632 | `margin:.5rem 0;background:$` | colour not from tokens.css (rgba(226,178,89,.07), rgba(239,68,68,.07)) | fix |
| `assets/app.js` | 4632 | `;border-color:$` | colour not from tokens.css (rgba(226,178,89,.3), rgba(239,68,68,.28)) | fix |
| `assets/app.js` | 2415 | `js` | old effect code | fix |
| `assets/chart-shot.js` | 56 | `canvas` | glow on canvas (shadowBlur) | fix: drop the glow on the snapshot image |
| `assets/chrome.js` | 2 | `js` | old effect code | fix |
| `assets/cine.js` | 1 | `js` | old effect code | fix |
| `assets/futures.js` | 204 | `canvas` | glow on canvas (shadowBlur) | fix |
| `assets/loaders.js` | 34 | `.cb-load.cb-rainbow` | glow orb / spotlight gradient; colour not from tokens.css (#0a0b0e, rgba(34,197,94,.08)) | fix |
| `assets/loaders.js` | 36 | `.cb-load.cb-fixed` | glow orb / spotlight gradient; colour not from tokens.css (rgba(11,11,13,.97), rgba(169,119,47,.08), rgba(226,178,89,.1) | fix |
| `assets/loaders.js` | 43 | `@keyframes cbGrid` | old animation | fix |
| `assets/loaders.js` | 49 | `.cb-orb img` | glow / neon shadow (filter: drop-shadow(...)); colour not from tokens.css (rgba(226,178,89,.6)); decorative animation (cbBreathe 1.5s ease-in-out infinite) | fix |
| `assets/loaders.js` | 54 | `.cb-bar` | colour not from tokens.css (rgba(255,255,255,.07)) | fix |
| `assets/loaders.js` | 55 | `.cb-bar i` | glow / neon shadow (box-shadow: 0 0 12px rgba(226,178,89,.8)); colour not from tokens.css (#E2B259, #F7D88A, rgba(226,178,89,.8)) | fix |
| `assets/loaders.js` | 50 | `@keyframes cbSpin` | old animation | fix |
| `assets/loaders.js` | 51 | `@keyframes cbBreathe` | old animation | fix |
| `assets/loaders.js` | 59 | `.cb-step` | colour not from tokens.css (#6B6B75) | fix |
| `assets/loaders.js` | 62 | `.cb-step.on b` | colour not from tokens.css (#E2B259, rgba(226,178,89,.3)); decorative animation (cbSpin .7s linear infinite) | fix |
| `assets/loaders.js` | 63 | `.cb-step.ok` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/loaders.js` | 64 | `.cb-step.ok b` | glow / neon shadow (box-shadow: 0 0 9px rgba(34,197,94,.6)); colour not from tokens.css (#22C55E, rgba(34,197,94,.6)) | fix |
| `assets/loaders.js` | 66 | `.cb-step.bad` | colour not from tokens.css (#EF4444) | fix |
| `assets/loaders.js` | 66 | `.cb-step.bad b` | colour not from tokens.css (#EF4444) | fix |
| `assets/market-check.js` | 88 | `js` | old effect code | fix |
| `assets/menu.js` | 91 | `.gm-scrim` | colour not from tokens.css (rgba(3,4,6,.6)) | fix |
| `assets/menu.js` | 102 | `.gm-top` | colour not from tokens.css (rgba(255,255,255,.08)) | fix |
| `assets/menu.js` | 104 | `.gm-brand img` | glow / neon shadow (filter: drop-shadow(...)); colour not from tokens.css (rgba(226,178,89,.5)) | fix |
| `assets/menu.js` | 105 | `.gm-x` | colour not from tokens.css (#FFFFFF, rgba(226,178,89,.18)) | fix |
| `assets/menu.js` | 107 | `.gm-x:hover` | colour not from tokens.css (#FFFFFF, rgba(226,178,89,.55)) | fix |
| `assets/menu.js` | 108 | `.gm-x:focus-visible,.gm-drawer a:focus-visible` | colour not from tokens.css (#E2B259) | fix |
| `assets/menu.js` | 111 | `.gm-sec+.gm-sec` | colour not from tokens.css (rgba(255,255,255,.06)) | fix |
| `assets/menu.js` | 115 | `.gm-item:hover` | colour not from tokens.css (#FFFFFF, rgba(226,178,89,.075)) | fix |
| `assets/menu.js` | 117 | `.gm-item .gm-d` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/menu.js` | 119 | `.gm-item .gm-arr` | colour not from tokens.css (#6B6B75) | fix |
| `assets/menu.js` | 120 | `.gm-item:hover .gm-arr` | colour not from tokens.css (#E2B259) | fix |
| `assets/menu.js` | 122 | `.gm-compact .gm-item .gm-t` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/menu.js` | 123 | `.gm-item.gm-on` | colour not from tokens.css (#FFFFFF, rgba(226,178,89,.1)) | fix |
| `assets/menu.js` | 130 | `.gm-chip:hover` | colour not from tokens.css (#FFFFFF, rgba(226,178,89,.06), rgba(226,178,89,.5)) | fix |
| `assets/menu.js` | 131 | `.gm-chip.gm-on` | colour not from tokens.css (#E2B259, #FFFFFF, rgba(226,178,89,.12)) | fix |
| `assets/menu.js` | 132 | `.gm-foot` | colour not from tokens.css (rgba(255,255,255,.08)) | fix |
| `assets/menu.js` | 133 | `.gm-cta` | glow / neon shadow (box-shadow: 0 8px 26px rgba(226,178,89,.3)); colour not from tokens.css (#0B0B0D, #F7D88A, rgba(226,178,89,.3)) | fix |
| `assets/menu.js` | 135 | `.gm-cta:hover` | glow / neon shadow (box-shadow: 0 12px 32px rgba(226,178,89,.45)); colour not from tokens.css (rgba(226,178,89,.45)) | fix |
| `assets/menu.js` | 136 | `.gm-offer` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/menu.js` | 137 | `.gm-offer a` | colour not from tokens.css (#F7D88A) | fix |
| `assets/menu.js` | 140 | `.gm-legal a` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/quote.js` | 638 | `@keyframes qlGrid` | old animation | fix |
| `assets/quote.js` | 643 | `.ql-orb img` | glow / neon shadow (filter: drop-shadow(...)); colour not from tokens.css (rgba(226,178,89,.6)); decorative animation (qlBreathe 1.5s ease-in-out infinite) | fix |
| `assets/quote.js` | 646 | `.ql-kicker` | ALL-CAPS letter-spaced; colour not from tokens.css (#F7D88A) | fix |
| `assets/quote.js` | 649 | `.ql-bar` | colour not from tokens.css (rgba(255,255,255,.07)) | fix |
| `assets/quote.js` | 650 | `.ql-bar i` | glow / neon shadow (box-shadow: 0 0 12px rgba(226,178,89,.8)); colour not from tokens.css (#E2B259, #F7D88A, rgba(226,178,89,.8)) | fix |
| `assets/quote.js` | 653 | `.ql-step` | colour not from tokens.css (#6B6B75) | fix |
| `assets/quote.js` | 656 | `.ql-step.on b` | colour not from tokens.css (#E2B259, rgba(226,178,89,.3)); decorative animation (qlSpin .7s linear infinite) | fix |
| `assets/quote.js` | 657 | `.ql-step.ok` | colour not from tokens.css (#A1A1AA) | fix |
| `assets/quote.js` | 658 | `.ql-step.ok b` | glow / neon shadow (box-shadow: 0 0 9px rgba(34,197,94,.6)); colour not from tokens.css (#22C55E, rgba(34,197,94,.6)) | fix |
| `assets/quote.js` | 644 | `@keyframes qlSpin` | old animation | fix |
| `assets/quote.js` | 645 | `@keyframes qlBreathe` | old animation | fix |
| `assets/quote.js` | 514 | `canvas` | glow on canvas (shadowBlur) | fix |
| `assets/quote.js` | 94 | `js` | old effect code | fix |
| `assets/rates.js` | 47 | `.l` | ALL-CAPS letter-spaced | keep: widget styles for ringomining.com (other site) |
| `assets/rates.js` | 48 | `.v` | colour not from tokens.css (#E2B259) | keep: widget styles for ringomining.com (other site) |
| `assets/rates.js` | 49 | `.c.up` | colour not from tokens.css (#22C55E) | keep: widget styles for ringomining.com (other site) |
| `assets/rates.js` | 49 | `.c.dn` | colour not from tokens.css (#EF4444) | keep: widget styles for ringomining.com (other site) |
| `assets/roi-embed.js` | 85 | `js` | old effect code | fix |
| `assets/visualizer.js` | 50 | `.viz-launch .viz-dot` | glow / neon shadow (box-shadow: 0 0 10px #E2B259); colour not from tokens.css (#E2B259); decorative animation (vizPulse 1.6s ease-in-out infinite) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 52 | `#vizRoot` | colour not from tokens.css (#040508, #FFFFFF) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 58 | `.vz-label` | ALL-CAPS letter-spaced; colour not from tokens.css (rgba(247,216,138,.72)) | fix |
| `assets/visualizer.js` | 59 | `.vz-big` | glow / neon shadow (filter: drop-shadow(...)); colour not from tokens.css (#E2B259, #F7D88A, #FFFFFF, rgba(226,178,89,.35)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 67 | `.vz-chip` | colour not from tokens.css (rgba(11,11,13,.55), rgba(226,178,89,.22)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 70 | `.vz-legend` | colour not from tokens.css (rgba(255,255,255,.55)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 73 | `.vz-qr` | glow / neon shadow (box-shadow: 0 0 28px rgba(226,178,89,.18)); colour not from tokens.css (#000000, rgba(226,178,89,.18), rgba(226,178,89,.45)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 76 | `.vz-qrcap` | colour not from tokens.css (#F7D88A) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 77 | `.vz-brand` | colour not from tokens.css (rgba(255,255,255,.7)) | fix |
| `assets/visualizer.js` | 80 | `.vz-bar` | colour not from tokens.css (rgba(11,11,13,.72), rgba(255,255,255,.12)) | fix |
| `assets/visualizer.js` | 82 | `#vizRoot.idle` | custom cursor | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 85 | `.vz-bar button.act` | colour not from tokens.css (#F7D88A, rgba(226,178,89,.18)) | fix |
| `assets/visualizer.js` | 86 | `.vz-bar .sep` | colour not from tokens.css (rgba(255,255,255,.12)) | fix |
| `assets/visualizer.js` | 89 | `.vz-msg` | colour not from tokens.css (#FFFFFF, rgba(11,11,13,.58), rgba(255,255,255,.07)); decorative animation (vzIn .35s ease-out) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 93 | `.vz-msg.sys` | ALL-CAPS letter-spaced; colour not from tokens.css (rgba(11,11,13,.4), rgba(247,216,138,.75)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 98 | `.vz-chan .tw` | colour not from tokens.css (#BF94FF) | fix |
| `assets/visualizer.js` | 99 | `.vz-chan .tt` | colour not from tokens.css (#25F4EE) | fix |
| `assets/visualizer.js` | 102 | `.vz-src.tw` | colour not from tokens.css (#9146FF) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 103 | `.vz-src.tt` | colour not from tokens.css (#000000, #25F4EE, #FE2C55) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 104 | `.vz-msg.join` | colour not from tokens.css (rgba(11,11,13,.35), rgba(255,255,255,.62)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 106 | `.vz-msg.gift` | colour not from tokens.css (rgba(11,11,13,.6), rgba(226,178,89,.2), rgba(226,178,89,.5)) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 108 | `.vz-stage` | colour not from tokens.css (#040508) | keep: stream-mode scene art (the visualizer itself); its controls are fixed |
| `assets/visualizer.js` | 6 | `js` | old effect code | keep: stream-mode scene art (the visualizer itself); its controls are fixed |

Totals: {'fix': 496, 'keep': 29}.

## 26. Part 2: the six console tabs before the redesign (1280 px, 2026-11-18)

Shots: `%TEMP%\gmtshots\before6\en-1280-0{1..6}-*.png` (Console, Edit farm, Planner, Projection, Quote, Statement), next to
the landing page (`en-1280-00-landing.png`). Logged out, so Console and Planner results sit behind the sign-up gate (kept,
owner 2026-11-18). Everything that differs between the tabs, or between a tab and the rest of the site:

| # | Item | Console / Edit farm / Planner / Projection | Quote / Statement | Rest of site (target) |
|---|---|---|---|---|
| 1 | Page background | starfield particles, gold glow orb behind the content, faint grid | flat | flat `--color-bg` |
| 2 | Tab row | ALL-CAPS letter-spaced links (`.nav-links`), only on these four | none at all | site tabs component, sentence case, gold underline like the header nav |
| 3 | Chat entry | separate "Chat · 3 online" pill left of the tabs | none | header Messages icon only (one entry point) |
| 4 | Live data strip | gold-bordered glass box, two centred rows, mixed sizes | one-line pills under the heading | landing "live figures" strip (bordered tiles, label / value / note) |
| 5 | Page heading | none (Console), gold Inter "Edit Your Farm" left, gold centred "Growth Projection", none (Planner) | Poppins 600 white h1, left, with a lead paragraph | Poppins h1 + lead, left |
| 6 | Page width | 1100 (Edit), 340 px centred column (Planner form), 870 (Projection), full (Console) | 1040 | `--content-max` container |
| 7 | Back control | "← Return to Console" ghost button on Edit / Planner / Projection | none | not needed with a tab row |
| 8 | Card style | gold-tinted borders, inner glow, corner brackets (Projection stat cards), glass blur | flat card, grey border | `ui-card` (surface-1, `--color-border`, `--radius-card`, no glow) |
| 9 | Card / section titles | ALL-CAPS gold letter-spaced and centred ("SAVED FARMS", "YOUR FARM", "OPTIONS", "DAILY NET PROFIT") | ALL-CAPS small grey labels on stat tiles, sentence-case section titles | sentence case, Poppins 600; tiny caps only as eyebrows |
| 10 | Stat figures | Inter, gold everywhere, mixed sizes; AVG / LOW / HIGH caps | gold or white per tile, green/purple accents | `ui-stat`: Inter tabular, gold only on each card's key figure |
| 11 | Buttons | ALL-CAPS (SAVE, SAVE AS…, NEW, DELETE), gold glow shadow ("Share this setup"), oversized pill CTA ("Calculate Optimal Split") | sentence case, flat gold / ghost | `ui-btn` primary / secondary / ghost, sentence case, no glow |
| 12 | Inputs | big centred numeric inputs, gold focus glow, unit inside; row style in Edit farm | left-aligned, compact | `ui-field` + `ui-input` / `ui-input-group` |
| 13 | Segmented controls | gold pill toggles of different heights (My Farm / My Plan, Invest / Target, 1Y…10Y, Daily / Monthly) | gold segmented, same height | `ui-segmented` |
| 14 | Switches | gold slider toggles | checkbox chip (Quote) | `ui-switch` |
| 15 | Section panels | gold-titled boxes with SHOW / HIDE caps toggles (VIP Level & Discount Stack, Daily Operation & Rewards) | n/a | `ui-card` + `ui-accordion`, same show/hide control |
| 16 | Charts | monospace axis labels, glowing lines, cyan area fill (reward growth), fan chart with glow | flat bars, Inter labels | chart kit: Inter, token colours, no glow |
| 17 | Tables | bordered gold rows, caps headers | `ui-table`-like, sentence-case headers | `ui-table` |
| 18 | Notes / banners | gold-bordered warn boxes with emoji glyphs | grey small print | `ui-notice` / `ui-disclaimer` |
| 19 | Fonts | Inter for headings, monospace on charts and badges | Poppins headings, Inter body | Poppins headings / nav / buttons, Inter copy and figures |
| 20 | Spacing | dense, centred, uneven gaps between blocks | even 16/24 px rhythm | token spacing, `--section-y` between sections |
| 21 | "Support the site" video banner | thumbnail strip with its own style | n/a | standard dismissible `ui-card` |
| 22 | "Stream mode" | glowing pill button | n/a | `ui-btn--secondary` |
| 23 | Effects | count-up numbers, reveal-on-scroll, tilt / magnetic (`chrome.js`), shimmer, pulsing dots | none | none (number updates without animation) |

Target: one console page template for all six tabs (same container, heading, tab row, live strip, card grid, fields, buttons,
tables, charts, empty states); only the content changes. Quote and Statement keep their URLs and get the same tab row.

## 27. Part 3: loading screens (inventory, 2026-11-18)

| # | Where | Today | Real work behind it | Artificial time today |
|---|---|---|---|---|
| L1 | Console boot (`#gmBoot`, `boot.js`) | full-screen logo, % counter, 4 staged steps, scrolling fake hash "0x…" | live prices, network stats, account/fleet, first calculation | min 2.4 s first visit, 1.1 s after; steps tick ≥ 330 ms apart |
| L2 | Planner calculate (`#plannerCalcLoading` + `loaders.js` overlay) | full-screen card: kicker, title, % bar, 5 steps incl. a random "1,200+ combinations" counter and "Holding the 20% token discount" | the split solve (a few ms) | 800 ms `setTimeout` before solving, then min 2.1 s overlay |
| L3 | Planner goal mode (same overlay, "Finding the capital you need") | same, "Goal-seeking the capital" | binary search over capital (ms) | 800 ms + min 2.1 s |
| L4 | Growth projection (`#spPageLoading`, "Crunching your projection…") | spinner + text | projection run (100–400 ms) | 650 ms `setTimeout` first |
| L5 | Edit farm "Updating your farm…" (`#edLoading`) | spinner + text | recalc (ms) | 750 ms `setTimeout` |
| L6 | New-user budget "Planning your capital…" (`#newUserLoading`) | spinner + text | planner solve | 850 ms `setTimeout` |
| L7 | Close chart "Loading your farm…" (`#btcChartLoading`) | spinner + text | none: just switches the view back | fixed 650 ms |
| L8 | BTC / GMT live chart (`loaders.js`) | overlay with orb, 4 steps ("Connecting to TradingView", "Plotting the 50 EMA"…) | TradingView widget load | min 1.5 s (0.75 s repeat), steps ≥ 260 ms apart |
| L9 | Rainbow chart (`loaders.js` + `#rainbowLoading`) | overlay, 4 steps ("Painting the 9 valuation bands"…) | price-history download + fit | min 1.5 s; steps ≥ 260 ms |
| L10 | Chart / farm snapshot (`#chartShotLoading`) | spinner + "Pulling the latest 1-hour candles…" | candle fetch + canvas render | none |
| L11 | Marketplace checker scan (`market-check.js`, `.mc-scan-steps`) | staged scan steps with % bar | NFT lookup + prices | min 1.9 s first, 1.2 s after; steps ≥ 300 ms |
| L12 | Quote tool (`quote.js`) | staged rows revealed one by one | quote solve (ms) | each row waits 300 ms |
| L13 | ROI calculator / quick estimate (`.re-loading`) | skeleton until live data | live prices | none |
| L14 | Chat / account pages (`.uc-loading`, `.skel`) | skeleton text | Supabase fetch | none |

Rewrite rules (owner): site background and components; skeleton or one gold progress bar; GMT icon only if a mark is needed;
no glow, particles or spinning rings. Calm, sentence-case copy naming only what the page really does. Shown only while the
work runs, plus at most ~1 s minimum so it doesn't flash. All loader text in ES/FR/DE through the same dictionary.

### 26a. After the redesign: the same side-by-side set (1280 and 360 px, 2026-11-18)

Shots: `%TEMP%\gmtshots\after6\en-{1280,360}-0{0..6}-*.png`. Console and Planner results were shot with the logged-out
sign-up gate removed from the screenshot browser only (the gate itself is unchanged on the site, as live).

| # | Item (from §26) | Now, on all six tabs |
|---|---|---|
| 1 | Background | flat `--color-bg`; galaxy, orb, grid and stars removed (markup and chrome.js) — gone |
| 2 | Tab row | one `ui-tabs`-style row on all six tabs, sentence case, gold underline on the active tab — gone |
| 3 | Chat entry | the pill is folded into the header Messages icon (shown on the console logged out too) — gone |
| 4 | Live strip | landing-style label-over-value tiles on a surface band, one row; same strip on Quote; Statement has no live data so no strip — gone (Statement noted) |
| 5 | Page heading | Poppins 600 h1 + lead, left, on every tab — gone |
| 6 | Page width | `--content-max` container with the 20 px (16 px phone) gutter everywhere — gone |
| 7 | Back control | "Return to Console" hidden on tab panels (tab row replaces it); kept on chart pages — gone |
| 8 | Card style | `ui-card` surface everywhere; no gold borders, brackets, inner glow or glass — gone |
| 9 | Card titles | sentence case, Poppins 600 (60 labels re-cased, translations moved) — gone |
| 10 | Stat figures | `ui-stat` look, Inter tabular, gold only on each card's key figure — gone |
| 11 | Buttons | `ui-btn` primary/secondary/ghost, sentence case, no glow — gone |
| 12 | Inputs | `ui-field`/`ui-input` look, left-aligned — gone |
| 13 | Segmented controls | `ui-segmented` — gone |
| 14 | Switches | `ui-switch` look — gone |
| 15 | Section panels | card + accordion "+/×" control on the same click target and saved state; no CSS-written English "Show/Hide" — gone |
| 16 | Charts | chart kit colours, Inter labels, no glow; reward chart drawn at its real width — gone |
| 17 | Tables | `ui-table` look — gone |
| 18 | Notes | `ui-notice` look — gone |
| 19 | Fonts | Poppins / Inter only; root font 16 px like the site (was 19.8 px) — gone |
| 20 | Spacing | token spacing; console 1 rem = site 1 rem — gone |
| 21 | Video banner | standard dismissible card (same hide-per-video behaviour) — gone |
| 22 | Stream mode | `ui-btn--secondary` — gone |
| 23 | Effects | no count-up, reveal, tilt, magnetic or shimmer — gone |

### 27a. Loading screens after the rewrite

| # | Loader | Steps now (all real) | Minimum display | Artificial delay |
|---|---|---|---|---|
| L1 | Console boot | prices, network difficulty, your farm, discount & earnings (fake "Connecting to the Bitcoin network" removed) | 0.6 s (0.3 s repeat; was 2.4 / 1.1 s) | none (was ≥330 ms per step + 1.1 s exit) |
| L2/L3 | Planner | your capital/goal, hashrate prices, comparing splits, monthly income (random counter and "Holding the 20%" removed) | 0.6 s (was 2.1 s) | one frame (was 800 ms) |
| L4–L6 | Projection, Edit farm, new-user plan | single line ("Building your projection…" etc.) | only while running | one frame (was 650–850 ms) |
| L7 | Closing a chart / planner / projection | no loader (nothing loads) | — | none (was a fixed 650 ms) |
| L8/L9 | Live chart, rainbow | library/candles/price; history/fit/today's price (fixed-delay "EMA" and "bands" steps removed) | 0.6 s (0.25 s repeat) | none (was ≥260 ms per step) |
| L10 | Snapshot | "Loading the latest 1-hour candles…" | only while running | none |
| L11 | Marketplace checker | locate, hashrate, listing, upgrades, premium | 0.6 s first / 0.3 s (was 1.9 / 1.2 s) | none (was ≥300 ms per step) |
| L12 | Quote | no loader: the quote is computed instantly, the result just appears | — | none (was ~2.6 s staged) |
| L13/L14 | ROI widget, chat, accounts | skeletons (unchanged) | — | none |

Look: flat card, GMT-Optimizer mark, one gold bar, dot/check step list; no rings, glow, % counter or hash readout.
Mid-load shots (throttled network so the real wait is visible): `%TEMP%\gmtshots\loaders\{en,de}-{1280,360}-L*.png`.

## 28. Phase 8: quality bar and launch

- **Old app copies retired (owner OK 2026-11-18):** `gomining-optimizer.html`, `gomining-vip-index.html` are redirect
  pages to `/console` (200 at the same URLs, `noindex,follow`, canonical `/console`). URLS.md §D/§H updated.
- **LAUNCH.md** written: gates G1–G15, launch-day steps, merge and deploy, database order (code first, SQL second),
  rollback for each step, after-launch tasks.
- **URL check** `scripts/url-check.js`: parses URLS.md (§A–G) plus every sitemap URL. Preview: 201 URLs, 0 failures.
  Production today (before the merge): 110 failures, all expected (the 99 ES/FR/DE pages, 6 new pages, the retired
  copies and `/neon-miner/` not live yet). After the merge it must be 0.
- **G16 (indexability)** added to LAUNCH.md and enforced by `url-check.js` (build files on the preview, live responses
  on production; robots.txt; 5 key pages' canonical + hreflang on gmt-optimizer.com). Negative test (noindex on /faq,
  preview canonical on /about, `Disallow: /`) caught all three. Allowed noindex list in LAUNCH.md, including the pages
  that are noindex on the live site today (/quote, /statement, /edit, /embed, /chat, account pages): flagged to the owner.
- **SEO baseline** (LAUNCH.md §5): top 20 pages by impressions (GSC snapshot to 2026-08-10), title and H1 live vs
  overhaul. Only the brand in 6 titles and the home H1 change.
- **OG images rebranded** (G10): `scripts/gen-og-thumbs.js` on the Phase 1 look; 26 images including the generic
  `og-image.png` (93 pages) and the BTC/GMT chart cards; `og:image` cache-bust bumped. `gen-og-chart-images.js` marked
  superseded.
- **Tables pass** (§17): /statement with a synthetic 398-row CSV (flat headline card; monthly table on tokens) and the
  planner results with a populated test farm (flat cards, chart-kit bar colours, left-aligned section titles,
  sentence case), 360 and 1280, no overflow.
- **Gate run on the current commit (2026-11-18):** G1 33/33 · G2 67/67 · G3 in sync · G4 in sync, 0 missing ·
  G5 0 · G6+G16 0 failures (preview) · G11 2 expected hits only · G12 CNAME unchanged · G13 /odds noindex, not linked ·
  G14 no analytics. Open: G9 legal sign-off, G15 native review (owner), and the launch-day steps.
- **Owner decisions 2026-11-18:** noindex allowed list kept as is; `/redesign-prototype` retired (redirect page to
  `/`, 200 same URL, `noindex,follow`; URLS.md §D/§H); G9 owner-accepted without lawyer review; G15 skipped for launch.
- **Quality bar:** `scripts/link-check.js` (G17: 2,975 internal links, 0 broken) and `scripts/a11y-check.js` (G18,
  static: 0 errors after linking 17 console labels to their fields, `alt=""` on a decorative icon and 5 aria-labels;
  29 warnings). An automated axe run in the owner's logged-in browser was blocked as a safety measure; not worked around.
- **REVIEW.md** written. Phase 8 complete; the launch itself waits for the owner (LAUNCH.md).
- **Live schema verified 2026-11-18** (read-only `inspect_readonly.sql`, run in the SQL editor with the owner's session;
  SELECT-only). profiles has exactly the columns the exposure fix grants (id, username, display_name, avatar_url, bio,
  role, created_at, banned) plus th_total and setup; show_th / prefs / get_my_profile / profile_cards /
  delete_my_account don't exist yet; RLS on for all 3 tables; profiles readable by anon (confirms the exposure);
  messages_insert reads profiles.banned (kept readable); every FK to auth.users cascades (Supabase's
  auth.scim_users: SET NULL). **Both launch SQL files fit the live schema unchanged.**
- **Pre-launch round (owner, 2026-11-18/19):** state-aware start button, dashboard/sign-up onboarding, config-driven
  v3 badge, difficulty/sats tooltips, performance pass to G19 (Lighthouse ≥ 90; console mobile 81 → 99), projection
  time-sliced (bit-identical with a frozen clock). Numbers and tables in REVIEW.md §4a/§4b. Screenshots:
  `%TEMP%\gmtshots\states` (3 states × EN/FR/DE × 360/1280, menu, sign-up, empty dashboard, tooltips), `g7`, `nojs`.
