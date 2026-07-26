/* rainbow.js — Node-side reproduction of the site's Bitcoin power-law rainbow.
   ==========================================================================
   Mirrors the model in assets/app.js (RB_* constants, rbComputeFit, rbDayOf) so
   an X post can quote the same band price the chart at /rainbow shows. Kept in
   step with that implementation — if the bands or the fit window change there,
   change them here.

   The bands are a descriptive fit to past price, NOT a forecast. Anything
   quoting them should attribute them ("the rainbow chart's 'Still cheap' band"),
   never state them as a prediction of where price will go.
*/
'use strict';

const RB_LABELS = ['Maximum Bubble Territory', 'Sell. Seriously, SELL!', 'FOMO intensifies',
  'Is this a bubble?', 'HODL!', 'Still cheap', 'Accumulate', 'BUY!', 'Basically a Fire Sale'];
const RB_OFFSETS = [0.45, 0.35, 0.25, 0.15, 0.05, -0.05, -0.15, -0.25, -0.35, -0.45];
const RB_GEN = Date.UTC(2009, 0, 3);
const RB_DAY = 86400000;
const FIT_FROM = Date.UTC(2012, 0, 1);   // canonical "since 2012" rainbow fit window
const STILL_CHEAP = RB_LABELS.indexOf('Still cheap');

const rbDayOf = t => Math.max(1, (t - RB_GEN) / RB_DAY);

async function fetchHistory() {
  const get = (u, ms = 20000) => fetch(u, { signal: AbortSignal.timeout(ms) })
    .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  try {
    const r = await get('https://api.blockchain.info/charts/market-price?timespan=all&format=json&cors=true');
    const out = ((r && r.values) || []).map(p => ({ t: p.x * 1000, v: p.y })).filter(p => p.v > 0);
    if (out.length > 100) return out;
  } catch (e) {}
  try {
    const r = await get('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=10080');
    const res = r && r.result;
    if (res) {
      const key = Object.keys(res).find(k => k !== 'last');
      const arr = res[key];
      if (arr && arr.length > 20) return arr.map(c => ({ t: c[0] * 1000, v: +c[4] })).filter(p => p.v > 0);
    }
  } catch (e) {}
  try {
    const r = await get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1000');
    if (Array.isArray(r) && r.length > 20) return r.map(c => ({ t: c[0], v: +c[4] })).filter(p => p.v > 0);
  } catch (e) {}
  throw new Error('no rainbow price-history source reachable');
}

// Least-squares power-law fit: log10(price) against ln(days since genesis).
function computeFit(series) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of series) {
    if (p.v > 0) {
      const lx = Math.log(rbDayOf(p.t)), ly = Math.log10(p.v);
      n++; sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly;
    }
  }
  let m = 2.9, b = -19.0;                        // same fallback the browser uses
  if (n > 2 && (n * sxx - sx * sx) !== 0) {
    m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    b = (sy - m * sx) / n;
  }
  const meanY = sy / n;
  let ssr = 0, sst = 0;
  for (const p of series) {
    if (p.v > 0) {
      const lx = Math.log(rbDayOf(p.t)), ly = Math.log10(p.v);
      const pred = m * lx + b;
      ssr += (ly - pred) ** 2; sst += (ly - meanY) ** 2;
    }
  }
  return { m, b, r2: sst > 0 ? 1 - ssr / sst : 0, n };
}

const centerLog = (fit, t) => fit.m * Math.log(rbDayOf(t)) + fit.b;
// Mid-price of band i at time t (bands are the gaps between consecutive offsets).
const bandPrice = (fit, i, t) =>
  Math.pow(10, centerLog(fit, t) + (RB_OFFSETS[i] + RB_OFFSETS[i + 1]) / 2);
// Which band a given price sits in.
function bandOf(fit, price, t) {
  const rel = Math.log10(price) - centerLog(fit, t);
  for (let i = 0; i < RB_LABELS.length; i++) {
    if (rel >= RB_OFFSETS[i + 1] && rel < RB_OFFSETS[i]) return { index: i, label: RB_LABELS[i] };
  }
  return rel >= RB_OFFSETS[0]
    ? { index: 0, label: RB_LABELS[0] }
    : { index: RB_LABELS.length - 1, label: RB_LABELS[RB_LABELS.length - 1] };
}

async function load() {
  const raw = await fetchHistory();
  const trimmed = raw.filter(p => p.t >= FIT_FROM);
  const series = (trimmed.length > 50 ? trimmed : raw).sort((a, b) => a.t - b.t);
  const fit = computeFit(series);
  const now = Date.now();
  return {
    fit,
    now,
    stillCheap: bandPrice(fit, STILL_CHEAP, now),
    center: Math.pow(10, centerLog(fit, now)),
    bandAt: price => bandOf(fit, price, now),
    priceOfBand: (label, t = now) => bandPrice(fit, RB_LABELS.indexOf(label), t)
  };
}

module.exports = { load, RB_LABELS, RB_OFFSETS, bandOf, computeFit, rbDayOf };
