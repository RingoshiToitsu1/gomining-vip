---
name: seo-review
description: Analyse Search Console snapshots for gmt-optimizer.com and write the daily insight report. Use when asked for the SEO report, to review search performance, or when the seo-report workflow runs.
---

# Daily SEO review — gmt-optimizer.com

Read the Search Console snapshots in `seo-data/` and write a short report to
`seo-data/report-<END_DATE>.md`. Analysis only — never edit site pages from this
skill. Recommendations go in the report; a human decides what ships.

## Inputs

- `seo-data/latest.json` — most recent snapshot.
- `seo-data/gsc-*.json` — history, filename is the window END date.

Each snapshot holds `totals`, `by_query`, `by_page`, `by_page_query`, `by_date`,
each row carrying `clicks`, `impressions`, `ctr`, `position`.

Compare `latest.json` against the snapshot ~7 days older. If fewer than two
snapshots exist, say so and report levels only — no deltas.

## The volume problem — read this before concluding anything

This site is small (a few hundred impressions per 28-day window). Most day-to-day
movement is sampling noise, not signal. Do not narrate noise as insight.

Thresholds before calling something a change:

- A query/page needs **≥30 impressions** in the window to be worth commenting on.
- A position move counts only if it is **≥1.5 places** on a row meeting that bar.
- A CTR change counts only if impressions are **≥100**. Below that, one click
  swings CTR by whole percentage points.
- Never infer anything from a row with **0 clicks and <20 impressions**.

If nothing clears the bar, the correct report is short and says so. "No
significant movement this week" is a valid, useful report. Padding it with
marginal observations trains the reader to ignore the whole thing.

Also: Google takes 2–8 weeks to recrawl and re-rank. Do not attribute a position
change to a site change made in the last fortnight — flag it as "too early to
attribute" instead.

## What to look for, in priority order

1. **Ranking movement on pages that matter.** Pages clearing the impression bar
   that gained or lost ≥1.5 positions. This is the highest-value signal — it is
   the constraint on this site, far more than CTR.
2. **Impressions with no clicks.** A query with ≥30 impressions and 0 clicks is
   either ranking too low to be seen (check position — if >10, it is a ranking
   problem, not a snippet problem) or an intent mismatch (the page does not do
   what the query asks for).
3. **Queries with no dedicated page.** Queries at position 5–15 where the ranking
   URL is only tangentially about that query. These are the real growth
   opportunities — an existing page is half-matching and a purpose-built one
   would beat it.
4. **What is working.** Pages/queries with above-average CTR for their position.
   Worth noting so the pattern can be repeated, not just problems.

Known context: the homepage historically converts far better than the subpages
(it holds the ranking equity). The `gomining-*` branded cluster is small in
absolute search demand — winning all of it is worth tens of clicks, not hundreds.
Real growth needs non-branded queries ("cloud mining worth it", "bitcoin mining
without hardware"). Say so if the data keeps confirming it, but do not repeat it
every single day.

## Report format

Keep it scannable. Lead with the verdict; a reader should get the point from the
first two lines and be able to stop there.

```markdown
# SEO report — <window start> to <window end>

**<One-line verdict.>** e.g. "Quiet week — nothing cleared the significance bar."
or "ROI calculator gained 4 positions on its money query."

| | This window | Prior | Δ |
|---|---|---|---|
| Clicks | | | |
| Impressions | | | |
| Avg position | | | |

## What moved
<Only rows clearing the thresholds. If none: "Nothing cleared the bar this week.">

## Worth acting on
<At most 3 items, each with the specific page/query and a concrete suggested
change. If there is nothing worth acting on, say that — do not invent work.>

## Watching
<Things trending but not yet significant. Keep to 2-3 lines.>
```

Write the file, then print the report path and its one-line verdict to stdout so
the calling workflow can pick it up.
