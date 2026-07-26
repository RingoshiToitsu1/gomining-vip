---
name: x-post
description: Draft an educational X post for the GMT Optimizer account, anchored to a real network event. Use when x-event.json exists or when asked to write an X/Twitter post for the brand.
---

# X post — @GMT_Optimizer

Read `x-event.json`, write one post to `x-draft.txt`. Nothing else.

Posts go to **https://x.com/GMT_Optimizer** — the brand account, not a personal
one. Write as the project, not as a person: "the calculator", not "I built".

## The hard rule

**Every number you write must come from `facts` in `x-event.json`.** Do not
compute, estimate, round beyond one decimal, or infer a figure. `scripts/x-verify.js`
rejects the post if any number is not traceable to that object, and a rejected
post is a failed run — but a *wrong* number that slipped through would be a false
claim about money published under a real person's name. If the point you want to
make needs a number you do not have, make a different point.

`breakEvenYearsNoDiscount: null` means it never pays back. Say "never pays back",
not a number.

## Voice

The brand is independent mining education. Hype-free, no financial promises, no
urgency. The reader is intelligent and skeptical and has been pitched at all day.

- Lead with the idea, not the event. The event is the reason to post today, not
  the subject. "Difficulty went up 2%" is a data point; "rising difficulty is why
  flat calculators overstate your return" is a post.
- Teach one thing. One post, one idea.
- Plain sentences. No emoji, no hashtags, no "🚨", no "Let that sink in."
- Never tell anyone to buy anything. No referral code, no "DM me", no link
  unless it is gmt-optimizer.com and it genuinely completes the thought.
- It is fine — good, even — to say something unflattering about the economics.
  "Without the discount this never pays back" is the most trustworthy thing the
  account can say, and it is true.

## Shape

Under 280 characters including any link. Three short blocks separated by blank
lines reads best on X:

```
<the claim — a specific, slightly counterintuitive statement>

<the number that supports it, from facts>

<the takeaway, one line>
```

## By event type

- `difficulty_retarget` — teach why difficulty erodes per-TH income over time,
  and that a projection ignoring it overstates returns. `changePct` is the hook.
- `halving_milestone` — teach that the halving cuts mining reward in half on a
  known date, and that break-even quoted at today's rates hides it. Use
  `daysToHalving` and `breakEvenYears`.
- `hashprice_move` — teach what sats/TH/day actually measures and why it moves.

## Anti-repetition

Check `seo-data/x-history.json` if present. You post at most every 48 hours, so
the last few posts are recent memory for anyone following. Pick a different angle
from the last three — the verifier rejects >70% word overlap, but clearing that
bar is not the same as being worth reading.

Write `x-draft.txt`, then print it to stdout so the run log shows what was drafted.
