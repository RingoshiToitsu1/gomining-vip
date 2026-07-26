#!/usr/bin/env node
/*
 * x-publish.js — post a verified draft to X, and record it.
 *
 * Runs ONLY after scripts/x-verify.js exits 0. Uses OAuth 1.0a user context
 * (app-only auth cannot post). Set --dry to render the request without sending,
 * which is how you should test before wiring the real credentials.
 *
 * Target account: https://x.com/GMT_Optimizer
 * The access token is what selects the account — it must be generated from the
 * developer portal while signed in as @GMT_Optimizer. The API key/secret identify
 * the app; the access token/secret identify who posts. Getting this pair from a
 * personal account posts to the personal account.
 *
 * Env: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 * Usage: node scripts/x-publish.js --draft x-draft.txt [--history seo-data/x-history.json] [--dry]
 */
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry');
const text = fs.readFileSync(argv('--draft'), 'utf8').trim();
const historyPath = argv('--history');
// Defaults to the same file x-watch.js reads, so the 48h rate limit works without
// the workflow having to pass it. x-watch checks state.lastPostAt; only a real
// (non-dry) publish sets it, which is what makes the limit meaningful.
const statePath = argv('--state') || require('path').join(__dirname, '..', 'seo-data', 'bot-state.json');

const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
if (!DRY && !(X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_SECRET)) {
  console.error('missing X credentials — set X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET');
  process.exit(1);
}

const URL = 'https://api.twitter.com/2/tweets';
const enc = s => encodeURIComponent(s).replace(/[!*()']/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// OAuth 1.0a signature. Note the JSON body is NOT part of the signature base for
// this endpoint — only the oauth_* params are, since there are no query params.
function authHeader() {
  const p = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: '1.0'
  };
  const base = 'POST&' + enc(URL) + '&' +
    enc(Object.keys(p).sort().map(k => `${enc(k)}=${enc(p[k])}`).join('&'));
  const key = `${enc(X_API_SECRET)}&${enc(X_ACCESS_SECRET)}`;
  p.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).sort().map(k => `${enc(k)}="${enc(p[k])}"`).join(', ');
}

function record(id) {
  if (historyPath) {
    let h = { posts: [] };
    try { h = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) {}
    h.posts = (h.posts || []).concat([{ id: id || null, text, at: new Date().toISOString() }]).slice(-50);
    fs.writeFileSync(historyPath, JSON.stringify(h, null, 1));
  }
  // Stamp the rate limit. Without this x-watch's MIN_HOURS_BETWEEN_POSTS check
  // reads an undefined lastPostAt and never fires.
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    s.lastPostAt = Date.now();
    fs.writeFileSync(statePath, JSON.stringify(s, null, 1));
  } catch (e) { console.error('warning: could not stamp lastPostAt in ' + statePath); }
}

(async () => {
  if (DRY) {
    console.log('--- DRY RUN, not sending ---');
    console.log(text);
    console.log(`--- ${text.length} chars ---`);
    return;
  }
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const body = await r.text();
  if (!r.ok) { console.error(`X API ${r.status}: ${body}`); process.exit(1); }
  const id = (() => { try { return JSON.parse(body).data.id; } catch (e) { return null; } })();
  record(id);
  console.log('posted' + (id ? ` https://x.com/i/status/${id}` : ''));
})().catch(e => { console.error('publish failed:', e.message); process.exit(1); });
