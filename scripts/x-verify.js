#!/usr/bin/env node
/*
 * x-verify.js — gate between the drafted post and the X API.
 *
 * The whole safety argument for auto-posting rests on this: every number in the
 * draft must trace back to a figure x-watch.js actually computed. A model that
 * writes a plausible-but-wrong break-even is the single worst failure mode here,
 * because it publishes a false claim about money under your name.
 *
 * Also enforces the things X's automation rules and the brand care about:
 * length, no financial promises, no duplicate of a recent post.
 *
 * Usage: node scripts/x-verify.js --draft post.txt --event x-event.json [--history h.json]
 * Exit 0 = safe to post. Non-zero = do not post.
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const draft = fs.readFileSync(argv('--draft'), 'utf8').trim();
const { facts } = JSON.parse(fs.readFileSync(argv('--event'), 'utf8'));
const historyPath = argv('--history');

const MAX_LEN = 280;
// Claims we will not make regardless of who drafted them.
const BANNED = [
  /guarantee/i, /risk[- ]free/i, /can'?t lose/i, /passive income for life/i,
  /\bmoon\b/i, /100x/i, /get rich/i, /financial advice/i, /you should buy/i,
  /sure thing/i, /no risk/i
];

const fail = m => { console.error('REJECT: ' + m); process.exit(1); };

if (!draft) fail('empty draft');
if (draft.length > MAX_LEN) fail(`draft is ${draft.length} chars, limit ${MAX_LEN}`);

for (const re of BANNED) if (re.test(draft)) fail(`banned phrasing matched ${re}`);

// --- the numeric guard ---
// Pull every number out of the draft and require each to match a computed fact.
// Tolerance is generous enough for sensible rounding ("7.2 years" from 7.23) but
// not enough to let a fabricated figure through.
const allowed = Object.values(facts).filter(v => typeof v === 'number');
const nums = (draft.match(/-?\d[\d,]*\.?\d*/g) || [])
  .map(s => parseFloat(s.replace(/,/g, '')))
  .filter(n => !isNaN(n));

const near = n => allowed.some(a => {
  if (a === n) return true;
  const tol = Math.max(Math.abs(a) * 0.005, 0.05);   // 0.5% or 0.05 absolute
  if (Math.abs(a - n) <= tol) return true;
  // allow a figure quoted rounded to whole units or one decimal
  return Math.round(a) === n || +a.toFixed(1) === n;
});

const bad = nums.filter(n => !near(n));
if (bad.length) {
  fail(`draft contains number(s) not derived from computed facts: ${bad.join(', ')}\n` +
       `        allowed: ${allowed.join(', ')}`);
}

// --- duplicate guard ---
// X limits accounts posting near-identical content. Compare against recent posts
// on word overlap rather than exact match, since templates differ only in digits.
if (historyPath && fs.existsSync(historyPath)) {
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const norm = s => new Set(s.toLowerCase().replace(/[\d.,$%]/g, '').match(/[a-z]{4,}/g) || []);
  const cur = norm(draft);
  for (const prev of (history.posts || []).slice(-10)) {
    const p = norm(prev.text || '');
    const overlap = [...cur].filter(w => p.has(w)).length / Math.max(cur.size, 1);
    if (overlap > 0.7) fail(`too similar to a recent post (${Math.round(overlap * 100)}% word overlap):\n        "${prev.text}"`);
  }
}

console.log('OK — ' + draft.length + ' chars, ' + nums.length + ' numbers all verified');
