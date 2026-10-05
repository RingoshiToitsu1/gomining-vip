/* OG thumbnails for /bitcoin and /gmt (1200x630 PNG): og-bitcoin.png, og-gmt.png.
 * Same glass price panel as the console's "Create chart screenshot" — both draw with
 * buildChartShotCanvas() from assets/chart-shot.js, rendered here in headless Chromium.
 * The line is real 1h data when the exchanges answer, else a seeded walk; the headline is
 * never a price, since social sites cache these cards for months.
 *   run:  npm i playwright-core @fontsource/space-grotesk @fontsource/share-tech-mono
 *         node scripts/gen-og-chart-images.js
 *   (set CHROMIUM=/path/to/chrome if Playwright can't find a browser)
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');

const b64 = (file, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
const font = (pkg, file) => b64(path.join(path.dirname(require.resolve(pkg + '/package.json')), 'files', file), 'font/woff2');
const FONTS = [
  ['Space Grotesk', '600', font('@fontsource/space-grotesk', 'space-grotesk-latin-600-normal.woff2')],
  ['Space Grotesk', '700', font('@fontsource/space-grotesk', 'space-grotesk-latin-700-normal.woff2')],
  ['Share Tech Mono', '400', font('@fontsource/share-tech-mono', 'share-tech-mono-latin-400-normal.woff2')],
];
const IMG = {
  logo: b64(path.join(ROOT, 'gmt-optimizer-logo.svg'), 'image/svg+xml'),
  btc: b64(path.join(ROOT, 'btc36.png'), 'image/png'),
  gmt: b64(path.join(ROOT, 'gmt36.png'), 'image/png'),
};

// deterministic pseudo-random walk: dips under the open, then rallies above it
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function walk(seed, n) {
  const r = mulberry32(seed), out = [], t0 = Date.UTC(2026, 0, 1);
  let p = 100;
  for (let i = 0; i < n; i++) {
    const drift = i < n * 0.45 ? -0.08 : 0.16;
    const jump = r() < 0.03 ? (r() - 0.3) * 9 : 0;
    const o = p, c = Math.max(20, o + drift + (r() - 0.5) * 2.2 + jump);
    out.push({ t: t0 + i * 3600e3, o, h: Math.max(o, c), l: Math.min(o, c), c });
    p = c;
  }
  return out;
}
async function live(kind) {
  const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
  try {
    if (kind === 'btc') {
      const r = await get('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600');
      return r.map(c => ({ t: c[0] * 1000, l: +c[1], h: +c[2], o: +c[3], c: +c[4] })).sort((a, b) => a.t - b.t).slice(-120);
    }
    const r = await get('https://api.bitget.com/api/v2/spot/market/candles?symbol=GOMININGUSDT&granularity=1h&limit=120');
    return r.data.map(c => ({ t: +c[0], o: +c[1], h: +c[2], l: +c[3], c: +c[4] }));
  } catch (e) { return null; }
}

const ASSETS = [
  { kind: 'btc', out: 'og-bitcoin.png', seed: 7, asset: { name: 'Bitcoin', pair: 'BTC / USD' }, headline: 'BTC / USD' },
  { kind: 'gmt', out: 'og-gmt.png', seed: 42, asset: { name: 'GoMining Token', pair: 'GMT / USD' }, headline: 'GMT / USD' },
];

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  const shot = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: path.join(ROOT, 'assets/chart-shot.js') });
  await page.evaluate(async fonts => {
    for (const [family, weight, src] of fonts) document.fonts.add(await new FontFace(family, 'url(' + src + ')', { weight }).load());
  }, FONTS);
  for (const a of ASSETS) {
    const real = await live(a.kind);
    const rows = real && real.length > 24 ? real : walk(a.seed, 120);
    const dataUrl = await page.evaluate(async ({ a, rows, IMG }) => {
      const img = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
      const [logoOpt, coin, token] = await Promise.all([img(IMG.logo), img(IMG[a.kind]), img(IMG.gmt)]);
      return buildChartShotCanvas(a.asset, { rows, interval: '1H' }, { logoOpt, coin, token }, {
        height: 630, headline: a.headline, sub: '● Live 1H chart',
        footRight: 'free · live data · no login',
      }).toDataURL('image/png');
    }, { a, rows, IMG });
    // the canvas renders at 2x; screenshot it back down to 1200x630
    await shot.setContent(`<html><body style="margin:0"><img src="${dataUrl}" width="1200" height="630"></body></html>`);
    await shot.screenshot({ path: path.join(ROOT, a.out), clip: { x: 0, y: 0, width: 1200, height: 630 } });
    console.log('wrote', a.out, real ? '(live data)' : '(seeded walk)');
  }
  await browser.close();
})();
