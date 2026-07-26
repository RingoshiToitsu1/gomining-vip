#!/usr/bin/env node
/*
 * notify-telegram.js — deliver a report to Telegram.
 *
 * Replaces the SMTP path: a bot token needs no app password, no 2FA dance, and
 * the message lands on your phone rather than in an inbox you have to open.
 *
 * Renders markdown into Telegram HTML rather than sending it raw. MarkdownV2
 * is not an option — it demands escaping of a dozen characters that appear
 * constantly in these reports — but HTML mode needs only & < > escaped, and
 * gives real bold plus <pre> blocks for tables, which are unreadable as raw
 * pipe syntax on a phone.
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * Usage: node scripts/notify-telegram.js --file report.md [--title "SEO report"]
 *        node scripts/notify-telegram.js --text "..." [--title "..."]
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const argv = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

// --dry renders the HTML to stdout without sending, so the formatting can be
// checked without a bot token or a message landing in the chat.
const DRY = args.includes('--dry');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT  = process.env.TELEGRAM_CHAT_ID;
if (!DRY && (!TOKEN || !CHAT)) {
  console.error('missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID');
  process.exit(1);
}

const file = argv('--file');
let raw = argv('--text') || (file ? fs.readFileSync(file, 'utf8') : '');
const title = argv('--title');
if (!raw.trim()) { console.error('nothing to send'); process.exit(1); }

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline markdown -> Telegram HTML. Escapes first so generated tags survive.
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, (_, c) => `<b>${c}</b>`)
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,)]|$)/g, (_, p, c) => `${p}<i>${c}</i>`);
}

// A markdown table is unreadable as pipes on a phone. Re-render it as an
// aligned monospace block, dropping the |---| separator row.
function table(rows) {
  const cells = rows
    .filter(r => !/^\s*\|[\s|:-]+\|\s*$/.test(r))
    .map(r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (!cells.length) return '';
  const w = [];
  for (const row of cells) row.forEach((c, i) => { w[i] = Math.max(w[i] || 0, c.length); });
  const out = cells.map(row => row.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ').trimEnd());
  return `<pre>${esc(out.join('\n'))}</pre>`;
}

function toHTML(md) {
  const lines = md.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*```/.test(ln)) {                        // fenced block -> tap-to-copy
      const block = [];
      i++;                                           // skip the opening fence
      while (i < lines.length && !/^\s*```/.test(lines[i])) block.push(lines[i++]);
      out.push(`<pre>${esc(block.join('\n'))}</pre>`);
      continue;                                      // outer i++ steps over the closing fence
    }
    if (/^\s*\|.*\|\s*$/.test(ln)) {                 // gather a whole table block
      const block = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      i--;
      out.push(table(block));
      continue;
    }
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<b>${inline(h[2]).replace(/<\/?b>/g, '')}</b>`); continue; }
    const li = ln.match(/^\s*[-*]\s+(.*)$/);
    if (li) { out.push(`• ${inline(li[1])}`); continue; }
    out.push(inline(ln));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Drop the document's own H1 when a title is supplied, so it isn't said twice.
if (title) raw = raw.replace(/^\s*#\s+.*\n+/, '');
let body = toHTML(raw);
if (title) body = `<b>${esc(title)}</b>\n\n${body}`;

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
    if (DRY) { console.log(`--- part ${i + 1}/${parts.length} ---\n${parts[i] + suffix}`); continue; }
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT,
        text: parts[i] + suffix,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const t = await r.text();
    if (!r.ok) { console.error(`telegram ${r.status}: ${t.slice(0, 300)}`); process.exit(1); }
  }
  console.log(`${DRY ? 'rendered' : 'sent'} ${parts.length} message(s), ${body.length} chars`);
})().catch(e => { console.error('telegram send failed:', e.message); process.exit(1); });
