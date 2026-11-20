/* Per-URL social/OG thumbnails (1200x630 PNG) for every page on the site.
 * Branded template (dark + gold, matches gmt-optimizer-og.svg); each page gets a
 * distinct eyebrow + headline + subline. Renders with @resvg/resvg-js.
 *   run:  node scripts/gen-og-thumbs.js [og-claim.png …]   (no args = every page)
 */
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const ROOT = require('path').join(__dirname, '..');
const ONLY = process.argv.slice(2);   // optional: just these output files

const b64 = (p, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(ROOT + '/' + p).toString('base64');
const WORDMARK = b64('assets/brand/GMT-Optimizer_white-text_transparent.svg', 'image/svg+xml');
// Fonts: pass a folder with Poppins-SemiBold.ttf and Inter-*.ttf (OFL) as OG_FONTS=<dir>; they are not committed.
const FONT_DIR = process.env.OG_FONTS || '';
const FONT_FILES = FONT_DIR ? fs.readdirSync(FONT_DIR).filter(f => /\.ttf$/i.test(f)).map(f => require('path').join(FONT_DIR, f)) : [];
const W = 1200, H = 630;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Phase 1 brand (2026-11-18): flat --color-bg, the GMT-Optimizer wordmark, one gold rule + eyebrow, Poppins headline,
// Inter subline, domain in the footer. No glow, gradients or old orange icon.
function thumb({ eyebrow, lines, sub }) {
  const lh = 86, top = lines.length === 1 ? 330 : 292;
  const headline = lines.map((t, i) =>
    `<text x="80" y="${top + i * lh}" font-family="Poppins" font-size="74" font-weight="600" fill="#FFFFFF" letter-spacing="-1">${esc(t)}</text>`
  ).join('\n  ');
  const subY = top + (lines.length - 1) * lh + 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0B0B0D"/>
  <image href="${WORDMARK}" x="80" y="64" width="232" height="60"/>
  <rect x="80" y="${top - 128}" width="56" height="4" rx="2" fill="#E2B259"/>
  <text x="80" y="${top - 86}" font-family="Poppins" font-size="22" font-weight="600" fill="#E2B259" letter-spacing="2">${esc(eyebrow)}</text>
  ${headline}
  <text x="80" y="${subY}" font-family="Inter" font-size="30" font-weight="400" fill="#A1A1AA">${esc(sub)}</text>
  <rect x="80" y="548" width="1040" height="1" fill="#26262C"/>
  <text x="80" y="596" font-family="Inter" font-size="24" font-weight="600" fill="#FFFFFF">gmt-optimizer.com</text>
  <text x="1120" y="596" text-anchor="end" font-family="Inter" font-size="22" font-weight="500" fill="#A1A1AA">Free · live data · no ads</text>
</svg>`;
}

const PAGES = [
  { page: null, out: 'og-image.png', eyebrow: 'FREE GOMINING TOOLS', lines: ['GoMining calculator,', 'planner and projections'], sub: 'Independent and free, on live network data.' },
  { page: 'index.html',          out: 'og-home.png',    eyebrow: 'INDEPENDENT GOMINING CALCULATOR', lines: ['Model your GoMining', 'returns before you buy'], sub: 'Live P&L, a capital planner and honest projections.' },
  { page: 'console/index.html',  out: 'og-console.png', eyebrow: 'CONSOLE',                   lines: ['Your GoMining farm,', 'on live data'],      sub: 'Daily net, monthly earnings, fee discount and VIP tier.' },
  { page: 'claim/index.html',    out: 'og-claim.png',   eyebrow: 'RINGO5 BONUSES',           lines: ['Your RINGO5', 'bonuses'],           sub: '+5% bonus TH · 1 month VIP Platinum+ · Card cashback.' },
  { page: 'bitcoin/index.html',  out: 'og-bitcoin.png', eyebrow: 'LIVE CHART',                lines: ['Bitcoin', 'live chart'],             sub: '1-hour candles with the 50 EMA, plus your farm alongside.' },
  { page: 'gmt/index.html',      out: 'og-gmt.png',     eyebrow: 'LIVE CHART',                lines: ['GoMining Token (GMT)', 'live chart'], sub: '1-hour candles with the 50 EMA, plus your farm alongside.' },
  { page: 'rainbow/index.html',  out: 'og-rainbow.png', eyebrow: 'BITCOIN RAINBOW CHART',     lines: ['Bitcoin rainbow', 'chart'],          sub: 'Power-law valuation bands on live price history.' },
  { page: 'gomining-roi-calculator.html',   out: 'og-gomining-roi-calculator.png',   eyebrow: 'CALCULATOR',        lines: ['GoMining ROI', 'calculator'], sub: 'See what a setup earns, on live network data.' },
  { page: 'gomining-discount-explained.html', out: 'og-gomining-discount-explained.png', eyebrow: 'GUIDE',           lines: ['The GoMining', 'discount, explained'],    sub: 'How locking GMT cuts your electricity fee.' },
  { page: 'gomining-promo-code.html',       out: 'og-gomining-promo-code.png',       eyebrow: 'PROMO CODE',        lines: ['GoMining promo', 'code: RINGO5'],         sub: 'Three sign-up bonuses for new GoMining accounts.' },
  { page: 'gomining-worth-it-now.html',     out: 'og-gomining-worth-it-now.png',     eyebrow: 'LIVE VERDICT',      lines: ['Is GoMining', 'worth it right now?'],     sub: 'Updated monthly on live figures.' },
  { page: 'how-gomining-works.html',        out: 'og-how-gomining-works.png',        eyebrow: "BEGINNER'S GUIDE",  lines: ['How does', 'GoMining work?'],             sub: 'Cloud Bitcoin mining, explained simply.' },
  { page: 'is-gomining-worth-it.html',      out: 'og-is-gomining-worth-it.png',      eyebrow: 'HONEST BREAKDOWN',  lines: ['Is GoMining', 'worth it in 2026?'],       sub: 'An honest, numbers-first breakdown.' },
];
// what each size earns
[1, 5, 10, 25, 50, 100, 250, 500].forEach(th => PAGES.push({
  page: `gomining-${th}-th-roi.html`, out: `og-gomining-${th}-th-roi.png`,
  eyebrow: 'EARNINGS BY SIZE', lines: [`GoMining ${th} TH:`, 'what it earns'], sub: 'What it really costs and what it pays you.'
}));
// Profitability by BTC price
[['75k', '$75k'], ['100k', '$100k'], ['150k', '$150k'], ['200k', '$200k'], ['250k', '$250k']].forEach(([s, p]) => PAGES.push({
  page: `gomining-profit-btc-${s}.html`, out: `og-gomining-profit-btc-${s}.png`,
  eyebrow: 'PRICE SCENARIO', lines: ['Is GoMining profitable', `if Bitcoin hits ${p}?`], sub: 'What a farm earns at this Bitcoin price.'
}));

let n = 0;
PAGES.filter(p => !ONLY.length || ONLY.includes(p.out)).forEach(p => {
  const png = new Resvg(thumb(p), { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: !FONT_FILES.length, fontFiles: FONT_FILES, defaultFontFamily: 'Inter' } }).render().asPng();
  fs.writeFileSync(ROOT + '/' + p.out, png);
  n++;
});
console.log(`Rendered ${n} thumbnails.`);
// emit the page->image map so the wiring step can pick it up
fs.writeFileSync(ROOT + '/scripts/og-thumbs.map.json', JSON.stringify(PAGES.filter(p => p.page).map(p => ({ page: p.page, out: p.out })), null, 2));
