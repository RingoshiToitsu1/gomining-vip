---
name: seo-review
description: Analyse Search Console snapshots for gmt-optimizer.com and decide the single highest-value action to take today. Use when asked for the SEO report, to review search performance, or when the seo-report workflow runs.
---

# Daily SEO review — gmt-optimizer.com

You do a full analysis, but you **send almost none of it**. The reader is the
owner, not an analyst. They want one instruction: what to do today. Data they
did not ask for is noise that trains them to stop reading.

Analysis only — never edit site pages from this skill.

## Outputs

Write three files. Only the first is delivered.

1. **`seo-data/report-<END_DATE>.md`** — the message. One action. Short. Format below.
2. **`seo-data/analysis-<END_DATE>.md`** — the full workings: tables, deltas,
   what you ruled out and why. Nobody reads this day to day; it exists so the
   recommendation is auditable and so future runs can compare.
3. **`seo-data/backlog.md`** — the standing queue of known-worthwhile work,
   updated in place. Read it first, rewrite it last.

## Inputs

- `seo-data/latest.json` — most recent snapshot.
- `seo-data/gsc-*.json` — history, filename is the window END date.
- `seo-data/backlog.md` — what was already known to be worth doing.

Each snapshot holds `totals`, `by_query`, `by_page`, `by_page_query`, `by_date`,
each row with `clicks`, `impressions`, `ctr`, `position`. Compare `latest.json`
against the snapshot ~7 days older; with fewer than two snapshots, levels only.

## Significance — do not recommend action on noise

The site is small (a few hundred impressions per 28-day window). Most daily
movement is sampling noise.

- A query/page needs **≥30 impressions** in the window to justify a conclusion.
- A position move counts only at **≥1.5 places** on a row meeting that bar.
- A CTR change counts only at **≥100 impressions**.
- Never infer anything from a row with 0 clicks and <20 impressions.
- Google takes 2–8 weeks to re-rank. Never attribute a change to a site edit
  made in the last fortnight, and never recommend re-doing something recently
  shipped because it "hasn't worked yet."

## Choosing today's action

In order:

1. **Something genuinely new and significant in the data** — a page that lost
   real position, a query newly ranking 5–15 with no dedicated page. Rare.
2. **The top item on `backlog.md`** — this is the normal case. Most days the
   data says nothing new, and the right answer is the next known job.
3. **Nothing.** If the backlog is empty and nothing moved, say so. "Nothing
   worth doing today, the last change needs two more weeks to read" is a
   legitimate and valuable message. Never invent work to fill the slot.

Pick ONE. Not a list. If two things matter, the second goes on the backlog.

Prefer actions that are concrete and finishable today over vague projects.
"Add a canonical tag to /gmt pointing at /gmt/" beats "improve site structure."

## The message format

Keep it under ~120 words. First line becomes the notification title, so make it
the instruction itself.

```markdown
# Today: <the instruction, imperative and specific>

<One or two sentences: what to actually do. Name files or URLs.>

**Why:** <one sentence of evidence — the number that justifies it>

**Expect:** <what should move, and when you could tell — usually "2-4 weeks">
```

For a nothing-to-do day:

```markdown
# Today: nothing — <one-line reason>

<One or two sentences on what you are waiting for and when it will be readable.>
```

No tables. No impression counts beyond the single number in **Why**. No
"here's what I looked at." They did not ask.

## Maintaining the backlog

`seo-data/backlog.md` is a ranked list. Each item: one line of instruction, one
short clause of justification, and the date it was added.

- Remove an item when the message you just wrote covers it.
- Add items whenever the analysis surfaces something real but not today's
  priority.
- Re-rank if the data changes what matters most.
- Keep it under ~10 items; if something has sat at the bottom for a month it is
  not worth doing, so delete it.

Print the delivered message to stdout at the end so the run log shows what was sent.
