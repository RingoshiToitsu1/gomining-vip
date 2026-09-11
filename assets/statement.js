/* GMT Optimizer — /statement: turn a GoMining income export into a partner-ready statement.
   ==========================================================================
   Feed it the CSV that GoMining hands you ("<from>-<to>_nft_incomes.csv") and it
   renders a dated income statement — headline figures, four charts and a monthly
   table — that can be printed to PDF and sent to a partner.

   THE FILE NEVER LEAVES THE BROWSER. It is read with FileReader and parsed here;
   there is no upload, no fetch, no localStorage, no Supabase, no account.js. That
   is a promise made on the page itself, so keep this file dependency-free — if you
   ever need a network call, gate the feature and keep the promise.

   What the export actually contains (verified against a 326-row, 252-day file):
     date                        one row PER MINER GROUP per day, so a date can
                                 repeat up to 3x — everything must be summed by day
     income                      NOT a fixed meaning — see maintenanceByGmt below
     c1 / c2                     electricity / platform service fee, in BTC
     c1 in USD / c2 in USD       the same two costs at that day's BTC rate
     btcCourseInUsd              BTC price on the day — this is what makes the USD
                                 column an accrual, valued when earned
     power / nfts                hashrate (TH) and miner count for the group
     discountByMaintenanceInGmt  the GMT-locked token discount (0 -> 0.20)
     dailyMaintenanceDiscount    the click streak (0.03 once held)
     levelDiscount               the VIP tier bonus
     rewardDistributionDiscount  the solo-mining bonus
     toAddress                   payout wallet. NOT an account identifier: a real
                                 export carried two of these that never appear on
                                 the same day, because the payout address changed
                                 mid-period on one farm. Do not split figures on it.

   READ THIS BEFORE TOUCHING THE MATH. "income" means one of two different things
   depending on how that group pays its maintenance, and getting it wrong invents
   losses that never happened:

     maintenanceByGmt = true   maintenance is paid separately in GMT, so the BTC
                               "income" is the GROSS reward.   net = income - c1 - c2
     maintenanceByGmt = false  maintenance is deducted from the BTC before it is
                               paid out, so "income" is ALREADY NET. net = income,
                               and gross = income + c1 + c2

   The export proves this itself: on 2026-01-01 one group paid in GMT and the other
   in BTC, and the two only agree on the day's yield — 42.51 sats/TH/day, to the
   cent — when the BTC-paying group is grossed back up. Subtracting c1+c2 from a
   row that was already net double-charges it.

   rewardProtection = true is the second trap: those rows carry income = 0 because
   GoMining PAUSED the miner rather than let it mine at a loss, and c1/c2 on them
   are the would-be cost that triggered the pause, not a charge. Treat the day as
   idle — zero reward, zero cost — or the protection feature shows up as a loss.

   Together these two rules are what make the statement agree with the operator's
   own experience: across this 252-day export there is not one negative day, which
   is exactly what reward protection guarantees.

   Costs are already net of the discount stack, which is why the efficiency figure
   has to divide that stack back out to recover W/TH.

   Deliberately NOT here: any forward projection, any price forecast, any figure the
   operator can type in. A statement that a partner relies on must be reproducible
   from the CSV alone — every number on the page traces back to a row in the file.
*/
(function () {
  'use strict';

  // ---- assumptions used only to DERIVE display-only metrics (never money) ----
  // Money on this page comes from the file. These two recover fleet efficiency,
  // which the export does not state outright. Mirrors scripts/constants.js.
  const ELEC_RATE = 0.05;    // $/kWh — GoMining's flat electricity rate

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const usd = (v, dp) => (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US',
    { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp });
  const usd0 = (v) => usd(v, 0);
  const btc = (v) => (v < 0 ? '-' : '') + Math.abs(v).toFixed(8);
  const num = (v, dp) => v.toLocaleString('en-US', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  const pct = (v, dp) => (v == null || !isFinite(v)) ? '—' : v.toFixed(dp == null ? 1 : dp) + '%';

  // compact axis money: $1.2k / $14k / $1.1M
  function usdShort(v) {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return s + '$' + Math.round(a);
  }
  function thShort(v) {
    const a = Math.abs(v);
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return String(Math.round(v));
  }

  const dLabel = (iso) => { const [y, m, d] = iso.split('-'); return +d + ' ' + MONTHS[+m - 1] + ' ' + y; };
  const mLabel = (ym) => { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + ' ' + y; };
  const mShort = (ym) => { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + (m === '01' ? " '" + y.slice(2) : ''); };

  // ---------------------------------------------------------------- CSV parse
  /* The GoMining export is unquoted, but a tolerant reader costs ten lines and
     survives anyone who opens the file in Excel and saves it back. */
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return { header: [], rows: [] };
    const header = rows.shift().map((h) => h.trim());
    const out = [];
    for (const r of rows) {
      if (r.length === 1 && r[0].trim() === '') continue;   // trailing blank line
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] == null ? '' : r[i].trim()); });
      out.push(o);
    }
    return { header: header, rows: out };
  }

  const REQUIRED = ['date', 'income', 'c1', 'c2', 'btcCourseInUsd', 'power'];

  function fnum(r, k) { const v = parseFloat(r[k]); return isFinite(v) ? v : 0; }

  /* One normalised record per CSV row. Kept at row granularity (not yet summed by
     day) because the account filter has to cut before the daily sum happens. */
  function normalize(rows) {
    const out = [];
    for (const r of rows) {
      const iso = String(r.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
      out.push({
        d: iso,
        gross: fnum(r, 'income'),
        c1: fnum(r, 'c1'),
        c2: fnum(r, 'c2'),
        btc: fnum(r, 'btcCourseInUsd'),
        gmt: fnum(r, 'gmtPrice'),
        th: fnum(r, 'power'),
        nfts: fnum(r, 'nfts'),
        byg: String(r.maintenanceByGmt).trim() === 'true',
        prot: String(r.rewardProtection).trim() === 'true',
        dTok: fnum(r, 'discountByMaintenanceInGmt'),
        dClick: fnum(r, 'dailyMaintenanceDiscount'),
        dVip: fnum(r, 'levelDiscount'),
        dSolo: fnum(r, 'rewardDistributionDiscount')
      });
    }
    out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    return out;
  }

  // ---------------------------------------------------------------- aggregate
  /* Sum the miner-group rows into one record per calendar day. Money and hashrate
     add; the BTC rate and the discount stack are properties of the day, so they are
     taken as the TH-weighted view rather than summed. */
  function byDay(recs) {
    const map = new Map();
    for (const r of recs) {
      let x = map.get(r.d);
      if (!x) { x = { d: r.d, gross: 0, c1: 0, c2: 0, c1USD: 0, c2USD: 0, th: 0, nfts: 0, btc: 0, gmt: 0, wsum: 0, thWt: 0, idle: 0, tok: 0, click: 0, vip: 0, solo: 0 }; map.set(r.d, x); }
      // resolve what this row's "income" actually is before adding anything up
      let rg, rc1, rc2;
      if (r.prot) { rg = 0; rc1 = 0; rc2 = 0; }              // miner paused — idle day
      else if (r.byg) { rg = r.gross; rc1 = r.c1; rc2 = r.c2; }        // income is gross
      else { rg = r.gross + r.c1 + r.c2; rc1 = r.c1; rc2 = r.c2; }     // income was net
      x.gross += rg; x.c1 += rc1; x.c2 += rc2; x.th += r.th; x.nfts += r.nfts;
      x.c1USD += rc1 * r.btc; x.c2USD += rc2 * r.btc;
      if (r.prot) x.idle += r.th;
      if (r.btc > 0) x.btc = r.btc;
      if (r.gmt > 0) x.gmt = r.gmt;
      // best (highest) stack seen on the day — what the account had available
      x.tok = Math.max(x.tok, r.dTok); x.click = Math.max(x.click, r.dClick);
      x.vip = Math.max(x.vip, r.dVip); x.solo = Math.max(x.solo, r.dSolo);
      // implied efficiency, weighted by hashrate: divide the discount stack back
      // out of the electricity line to recover the undiscounted watt-hours.
      const f = (1 - r.dTok) * (1 - r.dClick) * (1 - r.dVip);
      if (r.th > 0 && f > 0 && r.btc > 0) {
        const base = (r.c1 * r.btc) / f;                       // undiscounted $ of power
        const w = base * 1000 / (r.th * 24 * ELEC_RATE);        // W/TH
        if (isFinite(w) && w > 0 && w < 80) { x.wsum += w * r.th; x.thWt += r.th; }
      }
    }
    const days = Array.from(map.values()).sort((a, b) => (a.d < b.d ? -1 : 1));
    for (const x of days) {
      x.net = x.gross - x.c1 - x.c2;
      x.netUSD = x.net * x.btc;
      x.grossUSD = x.gross * x.btc;
      x.costUSD = x.c1USD + x.c2USD;
      x.wth = x.thWt > 0 ? x.wsum / x.thWt : null;
    }
    return days;
  }

  function byMonth(days) {
    const map = new Map();
    for (const x of days) {
      const k = x.d.slice(0, 7);
      let m = map.get(k);
      if (!m) { m = { k: k, days: 0, gross: 0, c1: 0, c2: 0, net: 0, grossUSD: 0, costUSD: 0, netUSD: 0, thSum: 0, nftMax: 0, thEnd: 0 }; map.set(k, m); }
      m.days++; m.gross += x.gross; m.c1 += x.c1; m.c2 += x.c2; m.net += x.net;
      m.grossUSD += x.grossUSD; m.costUSD += x.costUSD; m.netUSD += x.netUSD;
      m.thSum += x.th; m.nftMax = Math.max(m.nftMax, x.nfts); m.thEnd = x.th;
    }
    const out = Array.from(map.values()).sort((a, b) => (a.k < b.k ? -1 : 1));
    for (const m of out) {
      m.thAvg = m.days ? m.thSum / m.days : 0;
      m.margin = m.grossUSD > 0 ? (m.netUSD / m.grossUSD) * 100 : null;
    }
    return out;
  }

  function totals(days) {
    const t = { days: days.length, gross: 0, c1: 0, c2: 0, c1USD: 0, c2USD: 0, net: 0, grossUSD: 0, costUSD: 0, netUSD: 0, thSum: 0 };
    for (const x of days) {
      t.gross += x.gross; t.c1 += x.c1; t.c2 += x.c2; t.net += x.net;
      t.c1USD += x.c1USD; t.c2USD += x.c2USD;
      t.grossUSD += x.grossUSD; t.costUSD += x.costUSD; t.netUSD += x.netUSD; t.thSum += x.th;
    }
    t.thAvg = t.days ? t.thSum / t.days : 0;
    t.margin = t.grossUSD > 0 ? (t.netUSD / t.grossUSD) * 100 : null;
    t.netPerDay = t.days ? t.netUSD / t.days : 0;
    const last = days[days.length - 1] || {};
    t.thEnd = last.th || 0; t.nftsEnd = last.nfts || 0; t.wth = last.wth || null;
    t.tok = last.tok || 0; t.click = last.click || 0; t.vip = last.vip || 0; t.solo = last.solo || 0;
    t.btcEnd = last.btc || 0;
    // sats per TH per day, gross — the yardstick that is comparable across farms
    t.satsTH = t.thSum > 0 ? (t.gross * 1e8) / t.thSum : 0;
    return t;
  }

  // ---------------------------------------------------------------- chart kit
  /* Inline SVG, no library. Every mark colour is a CSS custom property so the
     print stylesheet can re-theme the charts for paper without touching this file. */
  let uid = 0;   // unique gradient ids — two area charts on one page must not collide
  const VW = 760, VH = 250, PL = 64, PR = 22, PT = 16, PB = 34;
  const PW = VW - PL - PR, PH = VH - PT - PB;

  function niceScale(lo, hi, count) {
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (lo === hi) { if (lo === 0) { lo = 0; hi = 1; } else { lo -= Math.abs(lo) * 0.1; hi += Math.abs(hi) * 0.1; } }
    const raw = (hi - lo) / (count || 5);
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
    // round the step to the NEAREST nice number rather than always up — rounding up
    // pushes e.g. a -450..1710 axis onto a 1000 step and wastes half the plot
    const n = raw / mag;
    let step = (n <= 1.5 ? 1 : n <= 3 ? 2 : n <= 7 ? 5 : 10) * mag;
    let start, end, ticks;
    for (let guard = 0; guard < 6; guard++) {
      start = Math.floor(lo / step) * step; end = Math.ceil(hi / step) * step;
      ticks = [];
      for (let v = start; v <= end + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
      if (ticks.length <= 8) break;   // keep the axis readable at this chart height
      step *= 2;
    }
    return { lo: start, hi: end, ticks: ticks };
  }

  function gridSVG(sc, fmt) {
    let s = '';
    for (const t of sc.ticks) {
      const y = PT + PH - ((t - sc.lo) / (sc.hi - sc.lo)) * PH;
      const zero = Math.abs(t) < 1e-12;
      s += '<line class="ch-grid' + (zero ? ' zero' : '') + '" x1="' + PL + '" y1="' + y.toFixed(1) + '" x2="' + (PL + PW) + '" y2="' + y.toFixed(1) + '"/>';
      s += '<text class="ch-ax" x="' + (PL - 9) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + esc(fmt(t)) + '</text>';
    }
    return s;
  }

  /* A one-sided rounded bar: the data end is rounded, the baseline end is square,
     so the bar stays visually anchored to zero. */
  function barPath(x, w, yZero, yVal, r) {
    const up = yVal <= yZero, h = Math.abs(yZero - yVal);
    if (h < 0.4) return '';
    r = Math.min(r, w / 2, h);
    const top = up ? yVal : yZero, bot = up ? yZero : yVal;
    return up
      ? 'M' + x + ',' + bot + ' L' + x + ',' + (top + r) + ' Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
        ' L' + (x + w - r) + ',' + top + ' Q' + (x + w) + ',' + top + ' ' + (x + w) + ',' + (top + r) + ' L' + (x + w) + ',' + bot + ' Z'
      : 'M' + x + ',' + top + ' L' + x + ',' + (bot - r) + ' Q' + x + ',' + bot + ' ' + (x + r) + ',' + bot +
        ' L' + (x + w - r) + ',' + bot + ' Q' + (x + w) + ',' + bot + ' ' + (x + w) + ',' + (bot - r) + ' L' + (x + w) + ',' + top + ' Z';
  }

  function figure(host, title, sub, svg, tableFn) {
    const f = document.createElement('figure');
    f.className = 'fig';
    f.innerHTML = '<figcaption><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</figcaption>' +
      '<div class="ch-wrap">' + svg + '<div class="ch-tip" hidden></div></div>';
    host.appendChild(f);
    return f;
  }

  /* Shared crosshair for the time-series charts: map pointer x back through the
     viewBox scale to the nearest sample. */
  function hoverIndex(svg, e, n) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return -1;
    const vx = (e.clientX - r.left) * (VW / r.width);
    const i = Math.round(((vx - PL) / PW) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }
  function tipAt(fig, xView, html) {
    const svg = fig.querySelector('svg'), tip = fig.querySelector('.ch-tip');
    const r = svg.getBoundingClientRect(), k = r.width / VW;
    tip.innerHTML = html; tip.hidden = false;
    const left = xView * k;
    tip.style.left = Math.max(4, Math.min(r.width - tip.offsetWidth - 4, left - tip.offsetWidth / 2)) + 'px';
  }

  // ---- chart 1 & 3: single-series time area -------------------------------
  function chartArea(host, title, sub, pts, fmtY, fmtTip, cls) {
    const n = pts.length;
    if (!n) return;
    const gid = 'g' + (++uid);
    const vals = pts.map((p) => p.v);
    const sc = niceScale(Math.min(0, Math.min.apply(null, vals)), Math.max.apply(null, vals), 5);
    const X = (i) => PL + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
    const Y = (v) => PT + PH - ((v - sc.lo) / (sc.hi - sc.lo)) * PH;

    let line = '', area = '';
    pts.forEach((p, i) => { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p.v).toFixed(1) + ' '; });
    area = 'M' + X(0).toFixed(1) + ',' + Y(sc.lo).toFixed(1) + ' ' + line.slice(1) + 'L' + X(n - 1).toFixed(1) + ',' + Y(sc.lo).toFixed(1) + ' Z';

    // x ticks: first, last and a few month boundaries in between
    let xt = '';
    const stride = Math.max(1, Math.round(n / 6));
    const byDate = n <= 75;   // under ~2.5 months, month names would just repeat
    for (let i = 0; i < n; i += stride) {
      const t = pts[i].t;
      const lab = byDate ? (+t.slice(8, 10) + ' ' + MONTHS[+t.slice(5, 7) - 1]) : mShort(t.slice(0, 7));
      xt += '<text class="ch-ax" x="' + X(i).toFixed(1) + '" y="' + (PT + PH + 20) + '" text-anchor="middle">' + esc(lab) + '</text>';
    }

    const last = pts[n - 1];
    const svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="' + esc(title) + '">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" class="gs0"/><stop offset="100%" class="gs1"/></linearGradient></defs>' +
      gridSVG(sc, fmtY) + xt +
      '<path class="ch-area ' + cls + '" d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path class="ch-line ' + cls + '" d="' + line.trim() + '"/>' +
      '<line class="ch-cross" x1="0" y1="' + PT + '" x2="0" y2="' + (PT + PH) + '" hidden/>' +
      '<circle class="ch-dot ' + cls + '" r="4.5" cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '"/>' +
      '<circle class="ch-hot ' + cls + '" r="4.5" cx="0" cy="0" hidden/>' +
      '</svg>';

    const fig = figure(host, title, sub, svg);
    const s = fig.querySelector('svg'), cross = s.querySelector('.ch-cross'), hot = s.querySelector('.ch-hot');
    const tip = fig.querySelector('.ch-tip');
    s.addEventListener('pointermove', (e) => {
      const i = hoverIndex(s, e, n); if (i < 0) return;
      const x = X(i), y = Y(pts[i].v);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.hidden = false;
      hot.setAttribute('cx', x); hot.setAttribute('cy', y); hot.hidden = false;
      tipAt(fig, x, '<b>' + esc(dLabel(pts[i].t)) + '</b>' + fmtTip(pts[i]));
    });
    s.addEventListener('pointerleave', () => { cross.hidden = true; hot.hidden = true; tip.hidden = true; });
  }

  // ---- chart 2: monthly net, diverging around zero -------------------------
  function chartMonthlyNet(host, months) {
    const n = months.length; if (!n) return;
    const vals = months.map((m) => m.netUSD);
    const sc = niceScale(Math.min(0, Math.min.apply(null, vals)), Math.max(0, Math.max.apply(null, vals)), 5);
    const Y = (v) => PT + PH - ((v - sc.lo) / (sc.hi - sc.lo)) * PH;
    const yZero = Y(0);
    const slot = PW / n, gap = Math.max(2, slot * 0.22);
    const bw = Math.max(4, Math.min(slot - gap, 86));
    // centre the row when few months leave the bars narrower than the plot
    const off = (PW - (n * bw + (n - 1) * Math.max(gap, 10))) / 2;
    const pitch = bw + Math.max(gap, 10);
    const useCentred = n < 5;

    let bars = '', labs = '', xt = '';
    months.forEach((m, i) => {
      const x = useCentred ? PL + off + i * pitch : PL + i * slot + (slot - bw) / 2;
      const y = Y(m.netUSD), up = m.netUSD >= 0;
      bars += '<path class="ch-bar ' + (up ? 'pos' : 'neg') + '" data-i="' + i + '" d="' + barPath(x, bw, yZero, y, 4) + '"/>';
      labs += '<text class="ch-val ' + (up ? 'pos' : 'neg') + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (up ? y - 7 : y + 14).toFixed(1) + '" text-anchor="middle">' + esc(usdShort(m.netUSD)) + '</text>';
      xt += '<text class="ch-ax" x="' + (x + bw / 2).toFixed(1) + '" y="' + (PT + PH + 20) + '" text-anchor="middle">' + esc(mShort(m.k)) + '</text>';
    });

    const svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Net income by month">' +
      gridSVG(sc, usdShort) + xt + bars + labs + '</svg>';
    const fig = figure(host, 'Net income by month', 'Green above the line is profit after all costs; red below it is a loss.', svg);
    const tip = fig.querySelector('.ch-tip');
    fig.querySelectorAll('.ch-bar').forEach((b) => {
      b.addEventListener('pointerenter', () => {
        const m = months[+b.dataset.i];
        const bb = b.getBBox();
        tipAt(fig, bb.x + bb.width / 2,
          '<b>' + esc(mLabel(m.k)) + '</b>' +
          '<i>Net</i>' + esc(usd(m.netUSD)) +
          '<i>Gross</i>' + esc(usd(m.grossUSD)) +
          '<i>Costs</i>' + esc(usd(m.costUSD)) +
          '<i>Margin</i>' + esc(pct(m.margin)));
      });
      b.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }

  // ---- chart 4: margin by month -------------------------------------------
  function chartMargin(host, months) {
    const n = months.length; if (!n) return;
    const vals = months.map((m) => (m.margin == null ? 0 : m.margin));
    const sc = niceScale(Math.min(0, Math.min.apply(null, vals)), Math.max.apply(null, vals), 5);
    const X = (i) => PL + (n === 1 ? PW / 2 : (i / (n - 1)) * PW);
    const Y = (v) => PT + PH - ((v - sc.lo) / (sc.hi - sc.lo)) * PH;

    let line = '', dots = '', xt = '';
    months.forEach((m, i) => {
      const v = m.margin == null ? 0 : m.margin;
      line += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1) + ' ';
      dots += '<circle class="ch-mk" data-i="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="4.5"/>';
      xt += '<text class="ch-ax" x="' + X(i).toFixed(1) + '" y="' + (PT + PH + 20) + '" text-anchor="middle">' + esc(mShort(m.k)) + '</text>';
    });
    // label only the first and last point — the trend is the story, not each value
    const f = months[0], l = months[n - 1];
    let labs = '<text class="ch-val gold" x="' + X(0).toFixed(1) + '" y="' + (Y(f.margin || 0) - 10).toFixed(1) + '" text-anchor="start">' + esc(pct(f.margin, 0)) + '</text>';
    if (n > 1) labs += '<text class="ch-val gold" x="' + X(n - 1).toFixed(1) + '" y="' + (Y(l.margin || 0) - 10).toFixed(1) + '" text-anchor="end">' + esc(pct(l.margin, 0)) + '</text>';

    const svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Net margin by month">' +
      gridSVG(sc, (v) => Math.round(v) + '%') + xt +
      '<path class="ch-line gold" d="' + line.trim() + '"/>' + dots + labs + '</svg>';
    const fig = figure(host, 'Net margin by month', 'Share of gross mining revenue kept after electricity and service fees.', svg);
    const tip = fig.querySelector('.ch-tip');
    fig.querySelectorAll('.ch-mk').forEach((c) => {
      c.addEventListener('pointerenter', () => {
        const m = months[+c.dataset.i];
        tipAt(fig, +c.getAttribute('cx'),
          '<b>' + esc(mLabel(m.k)) + '</b><i>Margin</i>' + esc(pct(m.margin)) + '<i>Net</i>' + esc(usd(m.netUSD)));
      });
      c.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }

  // ---------------------------------------------------------------- state
  const S = { recs: [], from: null, to: null, fname: '', share: 100, capital: 0 };

  /* A share statement is the same farm scaled down, never a different farm: one
     owner's slice of a jointly-funded fleet, split out so it can stand on its own
     for tax. Money and hashrate scale; ratios must NOT — a 36% owner earns 36% of
     the income on 36% of the hashrate, so margin, sats/TH/day and W/TH are
     identical to the whole farm's and are left alone. Miner COUNT is deliberately
     not scaled either: "5.4 miners" is meaningless, so the farm's real count is
     reported and labelled as a share. */
  function applyShare(days, k) {
    if (k === 1) return days;
    return days.map((x) => {
      const y = {};
      for (const key in x) y[key] = x[key];
      ['gross', 'c1', 'c2', 'c1USD', 'c2USD', 'th', 'idle', 'net', 'netUSD', 'grossUSD', 'costUSD']
        .forEach((f) => { y[f] = (x[f] || 0) * k; });
      return y;
    });
  }

  /* Single path from raw rows to figures, so the statement, the CSV export and
     anything added later cannot drift apart. */
  function aggregate() {
    const days = applyShare(byDay(filtered()), (S.share || 0) / 100);
    return { days: days, months: byMonth(days), T: totals(days) };
  }

  // ---------------------------------------------------------------- render
  function filtered() {
    return S.recs.filter((r) => (!S.from || r.d >= S.from) && (!S.to || r.d <= S.to));
  }

  function render() {
    const out = $('stOut');
    const agg = aggregate();
    const days = agg.days;
    if (!days.length) {
      out.innerHTML = '<div class="empty">No rows fall in this date range. Widen the period.</div>';
      out.style.display = 'block';
      return;
    }
    const months = agg.months, T = agg.T;
    const p0 = days[0].d, p1 = days[days.length - 1].d;
    const prepared = ($('stFor').value || '').trim();
    const share = S.share;
    // trim a trailing ".0" so a whole percentage does not read as a false precision
    const shareTxt = (Math.round(share * 10) / 10).toFixed(share % 1 === 0 ? 0 : 1) + '%';

    const issued = new Date();
    const issuedStr = issued.getDate() + ' ' + MONTHS[issued.getMonth()] + ' ' + issued.getFullYear();

    out.innerHTML = '';
    out.style.display = 'block';

    const doc = document.createElement('div');
    doc.className = 'doc';
    out.appendChild(doc);

    // ---- header ----
    doc.insertAdjacentHTML('beforeend',
      '<header class="doc-head">' +
        '<div class="dh-top">' +
          '<div class="dh-brand"><img src="/gmt-optimizer-logo.svg?v=2" alt=""><span>GMT Optimizer</span></div>' +
          '<div class="dh-kind">Mining income statement</div>' +
        '</div>' +
        '<div class="dh-meta">' +
          '<div><i>Statement period</i><b>' + esc(dLabel(p0)) + ' – ' + esc(dLabel(p1)) + '</b></div>' +
          '<div><i>Days covered</i><b>' + T.days + ' of ' + esc(spanDays(p0, p1)) + '</b></div>' +
          (share < 100 ? '<div><i>Ownership share</i><b>' + esc(shareTxt) + ' of the farm</b></div>' : '') +
          (S.capital > 0 ? '<div><i>Capital contributed</i><b>' + esc(usd0(S.capital)) + '</b></div>' : '') +
          (prepared ? '<div><i>Prepared for</i><b>' + esc(prepared) + '</b></div>' : '') +
          '<div><i>Issued</i><b>' + esc(issuedStr) + '</b></div>' +
        '</div>' +
      '</header>');

    // ---- hero ----
    const heroCls = T.netUSD >= 0 ? 'pos' : 'neg';
    doc.insertAdjacentHTML('beforeend',
      '<section class="hero ' + heroCls + '">' +
        '<div class="h-lab">Net income for the period' + (share < 100 ? ' — ' + esc(shareTxt) + ' share' : '') + '</div>' +
        '<div class="h-big">' + esc(usd0(T.netUSD)) + '</div>' +
        '<div class="h-sub">' + esc(btc(T.net)) + ' BTC net · ' + esc(usd0(T.netPerDay)) + ' average per day</div>' +
        '<div class="h-note">Valued at the BTC price on each day it was earned, after electricity and platform service fees.' +
          (share < 100 ? ' This is ' + esc(shareTxt) + ' of a farm that earned ' + esc(usd0(T.netUSD / (share / 100))) + ' net over the same period.' : '') + '</div>' +
      '</section>');

    // ---- KPI row ----
    const kpis = [
      ['Gross mining revenue', usd0(T.grossUSD), btc(T.gross) + ' BTC'],
      ['Operating costs', usd0(T.costUSD), 'Electricity ' + usd0(T.c1USD) + ' · service fees ' + usd0(T.c2USD)],
      ['Net margin', pct(T.margin), 'of gross revenue'],
      ['Hashrate at period end', num(T.thEnd) + ' TH',
        (T.nftsEnd ? (share < 100 ? shareTxt + ' of ' + num(T.nftsEnd) + ' miners' : num(T.nftsEnd) + ' miners') : '—') +
        (T.wth ? ' · ' + T.wth.toFixed(1) + ' W/TH' : '')],
      ['Average hashrate', num(T.thAvg) + ' TH', 'across ' + T.days + ' days'],
      ['Gross yield', T.satsTH.toFixed(1) + ' sats', 'per TH per day']
    ];
    if (S.capital > 0) {
      // Simple period return on the capital the preparer states — NOT annualised,
      // because annualising a part-year mining result overstates it.
      kpis.push(['Return on capital', pct((T.netUSD / S.capital) * 100),
        'on ' + usd0(S.capital) + ' over ' + T.days + ' days']);
    }
    doc.insertAdjacentHTML('beforeend', '<section class="kpis">' + kpis.map((k) =>
      '<div class="kpi"><div class="k">' + esc(k[0]) + '</div><div class="v">' + esc(k[1]) + '</div><div class="s">' + esc(k[2]) + '</div></div>').join('') + '</section>');

    // ---- charts ----
    const charts = document.createElement('section');
    charts.className = 'charts';
    doc.appendChild(charts);

    let run = 0;
    const cum = days.map((x) => { run += x.netUSD; return { t: x.d, v: run, day: x.netUSD }; });
    chartArea(charts, 'Cumulative net income', 'Running total of daily net income across the statement period.',
      cum, usdShort, (p) => '<i>Cumulative</i>' + esc(usd(p.v)) + '<i>That day</i>' + esc(usd(p.day)), 'gold');

    if (months.length > 1) chartMonthlyNet(charts, months);

    chartArea(charts, 'Hashrate under management', 'Total contracted hashrate on each day of the period.',
      days.map((x) => ({ t: x.d, v: x.th, n: x.nfts })), thShort,
      (p) => '<i>Hashrate</i>' + esc(num(p.v, 2)) + ' TH' + (p.n ? '<i>Miners</i>' + esc(num(p.n)) : ''), 'gold');

    if (months.length > 1) chartMargin(charts, months);

    // ---- monthly table ----
    let rowsHTML = '';
    for (const m of months) {
      rowsHTML += '<tr>' +
        '<td class="lft">' + esc(mLabel(m.k)) + '</td>' +
        '<td>' + m.days + '</td>' +
        '<td>' + esc(num(m.thAvg)) + '</td>' +
        '<td>' + esc(usd(m.grossUSD)) + '</td>' +
        '<td>' + esc(usd(m.costUSD)) + '</td>' +
        '<td class="' + (m.netUSD >= 0 ? 'pos' : 'neg') + '">' + esc(usd(m.netUSD)) + '</td>' +
        '<td class="' + (m.netUSD >= 0 ? 'pos' : 'neg') + '">' + esc(pct(m.margin)) + '</td>' +
        '<td class="mono-dim">' + esc(btc(m.net)) + '</td>' +
      '</tr>';
    }
    doc.insertAdjacentHTML('beforeend',
      '<section class="tbl-sec">' +
        '<h2>Monthly summary</h2>' +
        '<div class="tbl-scroll"><table class="tbl">' +
          '<thead><tr><th class="lft">Month</th><th>Days</th><th>Avg TH</th><th>Gross</th><th>Costs</th><th>Net</th><th>Margin</th><th>Net BTC</th></tr></thead>' +
          '<tbody>' + rowsHTML + '</tbody>' +
          '<tfoot><tr><td class="lft">Total</td><td>' + T.days + '</td><td>' + esc(num(T.thAvg)) + '</td>' +
            '<td>' + esc(usd(T.grossUSD)) + '</td><td>' + esc(usd(T.costUSD)) + '</td>' +
            '<td class="' + (T.netUSD >= 0 ? 'pos' : 'neg') + '">' + esc(usd(T.netUSD)) + '</td>' +
            '<td class="' + (T.netUSD >= 0 ? 'pos' : 'neg') + '">' + esc(pct(T.margin)) + '</td>' +
            '<td class="mono-dim">' + esc(btc(T.net)) + '</td></tr></tfoot>' +
        '</table></div>' +
      '</section>');

    // ---- operating profile ----
    const stack = [
      ['Maintenance discount (locked GMT)', pct(T.tok * 100, 0)],
      ['Daily click streak', pct(T.click * 100, 0)],
      ['VIP level bonus', pct(T.vip * 100, 1)],
      ['Solo-mining bonus', pct(T.solo * 100, 2)]
    ];
    doc.insertAdjacentHTML('beforeend',
      '<section class="prof">' +
        '<h2>Operating profile at period end</h2>' +
        '<div class="prof-grid">' + stack.map((s) =>
          '<div class="pf"><i>' + esc(s[0]) + '</i><b>' + esc(s[1]) + '</b></div>').join('') +
        '</div>' +
        '<p class="prof-note">These reductions are already reflected in the cost lines above. ' +
        (T.wth ? 'Implied fleet efficiency at period end is ' + esc(T.wth.toFixed(1)) + ' W/TH, derived from the electricity line at $0.05/kWh. ' : '') +
        'The maintenance discount is the one driven by locked GMT.</p>' +
      '</section>');

    // ---- basis ----
    doc.insertAdjacentHTML('beforeend',
      '<footer class="basis">' +
        '<h2>Basis of preparation</h2>' +
        '<ul>' +
          '<li>Every figure is derived from the GoMining income export <b>' + esc(S.fname) + '</b>.' +
            (share < 100 || S.capital > 0 ? ' The ownership share' + (S.capital > 0 ? ' and capital figure' : '') + ' below ' + (S.capital > 0 ? 'are' : 'is') + ' stated by the preparer; everything else comes from the file.' : ' Nothing on this statement is estimated, projected or entered by hand.') + '</li>' +
          '<li><b>Net income = gross mining revenue − electricity − platform service fee.</b> Costs are shown after the account’s discounts. Where maintenance was settled in GMT rather than deducted from the mined BTC, it is still charged here as a cost in the period it arose.</li>' +
          '<li>Days on which GoMining’s reward protection paused a miner are recorded as idle — no reward and no maintenance — which is why no day in this statement runs at a loss.</li>' +
          (share < 100 ? '<li><b>This statement covers ' + esc(shareTxt) + ' of the farm.</b> Income, costs and hashrate are stated pro rata at that share for the whole period. Ratios — margin, sats per TH per day and W/TH — are unchanged by the split and match the farm as a whole.</li>' : '') +
          '<li>US dollar amounts are accrual figures: each day is converted at the BTC reference price recorded for that day, not at today’s price. Totals therefore differ from the current market value of the BTC held.</li>' +
          '<li>Rewards from staking locked GMT are <b>not</b> included — the export covers mining income only.</li>' +
          '<li>Unaudited, and not a tax document in itself — a mined-coin disposal is taxed on rules this statement does not attempt to apply. Prepared for information only; past results do not indicate future returns.</li>' +
        '</ul>' +
      '</footer>');
  }

  function spanDays(a, b) {
    const d = Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
    return d + ' day' + (d === 1 ? '' : 's');
  }

  // ---------------------------------------------------------------- controls
  function fillControls() {
    const days = byDay(S.recs);
    const first = days[0].d, last = days[days.length - 1].d;
    S.from = first; S.to = last;
    $('stFrom').value = first; $('stFrom').min = first; $('stFrom').max = last;
    $('stTo').value = last; $('stTo').min = first; $('stTo').max = last;

    $('stCtl').hidden = false;
    $('stActions').hidden = false;
  }

  /* setUTCMonth overflows rather than clamps: 31 March minus one month is 31
     February, which rolls forward to 3 March and quietly returns a window days
     shorter than the button promises. Clamp to the last valid day instead. */
  function subMonthsUTC(d, n) {
    const day = d.getUTCDate();
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
    const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    t.setUTCDate(Math.min(day, lastDay));
    return t;
  }

  function setRange(kind) {
    const days = byDay(S.recs);
    const first = days[0].d, last = days[days.length - 1].d;
    let from = first;
    if (kind !== 'all') {
      // "This month" and "Year to date" are calendar periods that run from the 1st
      // to the last day with data — not rolling windows. On the 10th, "this month"
      // means the 1st to the 10th, the way a statement period is normally read.
      if (kind === 'mtd') from = last.slice(0, 7) + '-01';
      else if (kind === 'ytd') from = last.slice(0, 4) + '-01-01';
      else {
        const d = subMonthsUTC(new Date(last + 'T00:00:00Z'), parseInt(kind, 10));
        d.setUTCDate(d.getUTCDate() + 1);
        from = d.toISOString().slice(0, 10);
      }
      if (from < first) from = first;
    }
    S.from = from; S.to = last;
    $('stFrom').value = from; $('stTo').value = last;
    document.querySelectorAll('#stRanges button').forEach((b) => b.classList.toggle('on', b.dataset.r === kind));
    render();
  }

  // ---------------------------------------------------------------- load
  function loadText(text, name) {
    const parsed = parseCSV(text);
    const missing = REQUIRED.filter((c) => parsed.header.indexOf(c) === -1);
    if (missing.length) {
      fail('That does not look like a GoMining income export — it is missing the column' +
        (missing.length > 1 ? 's ' : ' ') + missing.map((m) => '“' + m + '”').join(', ') +
        '. Export it from GoMining under Rewards → History → Download CSV.');
      return;
    }
    const recs = normalize(parsed.rows);
    if (!recs.length) { fail('The file parsed, but it has no dated rows in it.'); return; }

    S.recs = recs;
    S.fname = name;
    $('stErr').hidden = true;
    $('stFileName').textContent = name;
    $('stFileMeta').textContent = recs.length + ' rows · ' + byDay(recs).length + ' days';
    $('stLoaded').hidden = false;
    fillControls();
    setRange('all');
    $('stOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fail(msg) {
    const e = $('stErr');
    e.textContent = msg; e.hidden = false;
    $('stOut').style.display = 'none';
    $('stLoaded').hidden = true;
    $('stCtl').hidden = true;
    $('stActions').hidden = true;
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { fail('That file is larger than 12 MB — it is unlikely to be an income export.'); return; }
    const fr = new FileReader();
    fr.onload = () => { try { loadText(String(fr.result), file.name); } catch (err) { fail('Could not read that file: ' + err.message); } };
    fr.onerror = () => fail('Could not read that file.');
    fr.readAsText(file);
  }

  // ---------------------------------------------------------------- exports
  function downloadSummary() {
    const agg = aggregate(), months = agg.months, T = agg.T;
    const rows = [['month', 'days', 'avg_th', 'gross_usd', 'costs_usd', 'net_usd', 'margin_pct', 'gross_btc', 'net_btc']];
    for (const m of months) {
      rows.push([m.k, m.days, m.thAvg.toFixed(2), m.grossUSD.toFixed(2), m.costUSD.toFixed(2),
        m.netUSD.toFixed(2), m.margin == null ? '' : m.margin.toFixed(2), m.gross.toFixed(8), m.net.toFixed(8)]);
    }
    rows.push(['TOTAL', T.days, T.thAvg.toFixed(2), T.grossUSD.toFixed(2), T.costUSD.toFixed(2),
      T.netUSD.toFixed(2), T.margin == null ? '' : T.margin.toFixed(2), T.gross.toFixed(8), T.net.toFixed(8)]);
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'statement-' + (S.from || '') + '-to-' + (S.to || '') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    const drop = $('stDrop'), input = $('stFile');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', () => readFile(input.files[0]));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { readFile(e.dataTransfer.files[0]); });

    $('stFrom').addEventListener('change', (e) => {
      S.from = e.target.value;
      document.querySelectorAll('#stRanges button').forEach((b) => b.classList.remove('on'));
      render();
    });
    $('stTo').addEventListener('change', (e) => {
      S.to = e.target.value;
      document.querySelectorAll('#stRanges button').forEach((b) => b.classList.remove('on'));
      render();
    });
    document.querySelectorAll('#stRanges button').forEach((b) =>
      b.addEventListener('click', () => setRange(b.dataset.r)));
    let t;
    $('stFor').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 250); });

    // A share of 0 or a blank box would silently zero the whole statement, so the
    // value is clamped into 0.01–100 and written back before anything re-renders.
    let t2;
    $('stShare').addEventListener('input', (e) => {
      clearTimeout(t2);
      t2 = setTimeout(() => {
        let v = parseFloat(e.target.value);
        if (!isFinite(v) || v <= 0) v = 100;
        v = Math.min(100, Math.max(0.01, v));
        if (String(v) !== e.target.value) e.target.value = v;
        S.share = v; render();
      }, 300);
    });
    let t3;
    $('stCap').addEventListener('input', (e) => {
      clearTimeout(t3);
      t3 = setTimeout(() => {
        const v = parseFloat(e.target.value);
        S.capital = isFinite(v) && v > 0 ? v : 0;
        render();
      }, 300);
    });
    $('stPrint').addEventListener('click', () => window.print());
    $('stCSV').addEventListener('click', downloadSummary);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
