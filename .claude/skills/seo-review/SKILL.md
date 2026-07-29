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
- `seo-data/network-facts.json` — today's computed Bitcoin/GoMining figures, for
  the tweet suggestion. May be absent if the price APIs were down; if so, omit
  the tweet section entirely rather than writing one from memory.

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

**Tweet:**

```
<the suggested post, verbatim>
```
```

For a nothing-to-do day:

```markdown
# Today: nothing — <one-line reason>

<One or two sentences on what you are waiting for and when it will be readable.>

**Tweet:**

```
<still suggest one — a quiet SEO day is not a quiet Bitcoin day>
```
```

No tables. No impression counts beyond the single number in **Why**. No
"here's what I looked at." They did not ask.

## The tweet suggestion

One post, ready to paste into @GMT_Optimizer. They post it by hand, so write the
final text — not a brief, not options, no commentary about why you chose it.
Put it in a fenced code block: Telegram renders that as a tap-to-copy box, and
anything outside the fence gets copied along with it.

**Every number you use must appear in `network-facts.json`.** Nothing is checking
this before it goes out, and the reader will reasonably assume the figures were
verified because a machine produced them. A wrong earnings figure published
under their own name is the worst outcome this skill can cause. Round sensibly
($976 to "about $975") but never estimate, never interpolate between two facts,
and never carry a figure over from yesterday's report.

- Lead with `notable` if it is non-null — that is the day's real news. If it is
  null, teach something evergreen from the same figures instead.
- Frame it as what the setup **earns** — cumulative totals and the per-day or
  per-month run-rate. Never as a payback period or a break-even date, however the
  arithmetic tempts you. Nobody decides to mine because they will stop being down
  in four years; they decide because of what it pays them. There is no payback
  figure in `network-facts.json` any more, and reconstructing one from the totals
  and the capital is exactly the move to avoid.
- Under 280 characters. Count them.
- No price predictions. The figures already assume Bitcoin follows the Power-Law
  onto the rainbow's Still-cheap band, so state them as what the model projects,
  never as what Bitcoin will do. "On the Still-cheap path, five years pays $1,703"
  is fine; "Bitcoin is going to $104k" is not, and neither is anything shaped like
  it. `earned5yrLowerBand` is the downside if you want to show both.
- Never frame anything as a flat or unchanged Bitcoin price. No projection in this
  product holds price still, so quoting one would misdescribe the model.
- No guarantees, no "risk-free", no "passive income", no financial advice, no
  hype register. The account's whole edge is sounding like the only honest
  calculator in a field of shills.
- Skip the referral code most days. It reads as an ad if it is in every post.

If `network-facts.json` is missing, drop the **Tweet:** line. A day without a
suggestion costs nothing; a fabricated one costs the account's credibility.

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
