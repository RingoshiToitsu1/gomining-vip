#!/usr/bin/env node
/*
 * notify-telegram.js — deliver a report to Telegram.
 *
 * Replaces the SMTP path: a bot token needs no app password, no 2FA dance, and
 * the message lands on your phone rather than in an inbox you have to open.
 *
 * Sends plain text (no parse_mode) deliberately — report bodies contain
 * markdown tables, underscores and brackets, and Telegram's MarkdownV2 would
 * reject or mangle them. Readability of the raw text is good enough.
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * Usage: node scripts/notify-telegram.js --file report.md [--title "SEO report"]
 *        node scripts/notify-telegram.js --text "..." [--title "..."]
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT  = process.env.TELEGRAM_CHAT_ID;
if (!TOKEN || !CHAT) {
  console.error('missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');
  process.exit(1);
}

const file = argv('--file');
let body = argv('--text') || (file ? fs.readFileSync(file, 'utf8') : '');
const title = argv('--title');
if (!body.trim()) { console.error('nothing to send'); process.exit(1); }
if (title) body = `${title}\n\n${body}`;

// Telegram caps a message at 4096 chars. Split on blank lines so a chunk never
// lands mid-paragraph, and fall back to a hard cut for any single huge block.
const LIMIT = 3900;
function chunk(text) {
  if (text.length <= LIMIT) return [text];
  const out = [];
  let cur = '';
  for (const para of text.split('\n\n')) {
    if ((cur + '\n\n' + para).length > LIMIT) {
      if (cur) out.push(cur);
      if (para.length > LIMIT) {
        for (let i = 0; i < para.length; i += LIMIT) out.push(para.slice(i, i + LIMIT));
        cur = '';
      } else cur = para;
    } else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) out.push(cur);
  return out;
}

(async () => {
  const parts = chunk(body);
  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.length > 1 ? `\n\n(${i + 1}/${parts.length})` : '';
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT,
        text: parts[i] + suffix,
        disable_web_page_preview: true
      })
    });
    const t = await r.text();
    if (!r.ok) { console.error(`telegram ${r.status}: ${t.slice(0, 300)}`); process.exit(1); }
  }
  console.log(`sent ${parts.length} message(s), ${body.length} chars`);
})().catch(e => { console.error('telegram send failed:', e.message); process.exit(1); });
