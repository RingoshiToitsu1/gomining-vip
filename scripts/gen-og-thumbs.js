/* Per-URL social/OG thumbnails (1200x630 PNG) for every page on the site.
 * Branded template (dark + gold, matches gmt-optimizer-og.svg); each page gets a
 * distinct eyebrow + headline + subline. Renders with @resvg/resvg-js.
 *   run:  cd ~ && node scripts/gen-og-thumbs.js
 */
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const ROOT = '/home/ringoshi';

const b64 = (p, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(ROOT + '/' + p).toString('base64');
const LOGO = b64('gmt-optimizer-logo.svg', 'image/svg+xml');
const W = 1200, H = 630;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function thumb({ eyebrow, lines, sub }) {
  // headline block is vertically centred-ish; 1 or 2 lines supported
  const lh = 88, top = lines.length === 1 ? 342 : 300;
  const headline = lines.map((t, i) =>
    `<text x="80" y="${top + i * lh}" font-size="78" font-weight="800" fill="#ffffff" letter-spacing="-1.5">${esc(t)}</text>`
  ).join('\n  ');
  const subY = top + (lines.length - 1) * lh + 62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Space Grotesk','DejaVu Sans',Inter,system-ui,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.75" y2="1"><stop offset="0" stop-color="#0a0a0a"/><stop offset="1" stop-color="#17110a"/></linearGradient>
    <radialGradient id="glowA" cx="16%" cy="6%" r="72%"><stop offset="0" stop-color="#F5A623" stop-opacity=".20"/><stop offset="1" stop-color="#F5A623" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB" cx="102%" cy="108%" r="62%"><stop offset="0" stop-color="#F5A623" stop-opacity=".30"/><stop offset="0.5" stop-color="#F5A623" stop-opacity=".08"/><stop offset="1" stop-color="#F5A623" stop-opacity="0"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5A623"/><stop offset="1" stop-color="#FFCF7A"/></linearGradient>
    <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F5A623"/><stop offset="1" stop-color="#FFE0A8"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <!-- faint grid -->
  <g stroke="rgba(245,166,35,0.05)" stroke-width="1">
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 120}" y1="0" x2="${i * 120}" y2="${H}"/>`).join('')}
    ${Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${i * 120}" x2="${W}" y2="${i * 120}"/>`).join('')}
  </g>
  <!-- large faded logo mark, bottom-right -->
  <g transform="translate(895,235)" opacity="0.10" fill="none" stroke="url(#gold)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 78 208 A 80 80 0 1 1 208 78" transform="scale(2.4)"/>
  </g>
  <!-- brand top-left -->
  <g transform="translate(80,72)">
    <rect width="46" height="46" rx="13" fill="url(#gold)"/>
    <g transform="translate(23,23) scale(1.16) translate(-20,-20)" fill="none" stroke="#1a1205" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M 13 26 A 10 10 0 1 1 26 13"/><path d="M 23 16 A 5 5 0 1 0 16 22"/><path d="M 22 13 L 26 13 L 26 17"/>
    </g>
    <text x="60" y="33" font-size="31" font-weight="800" fill="url(#goldH)" letter-spacing="0.3">GMT Optimizer</text>
  </g>
  <!-- eyebrow -->
  <text x="82" y="214" font-size="23" font-weight="700" fill="#F7B84E" letter-spacing="5">${esc(eyebrow)}</text>
  <!-- headline -->
  ${headline}
  <!-- subline -->
  <text x="82" y="${subY}" font-size="28" font-weight="500" fill="#b9a986">${esc(sub)}</text>
  <!-- footer -->
  <line x1="80" y1="558" x2="1120" y2="558" stroke="rgba(245,166,35,0.22)" stroke-width="1"/>
  <text x="80" y="598" font-size="24" font-weight="800" fill="url(#goldH)" letter-spacing="1.5">gmt-optimizer.com</text>
  <text x="1120" y="598" text-anchor="end" font-size="16" font-weight="600" fill="#8a7c5c" letter-spacing="2.5">FREE &#183; LIVE DATA &#183; NO LOGIN</text>
</svg>`;
}

const PAGES = [
  { page: 'index.html',          out: 'og-home.png',    eyebrow: 'GOMINING PROFIT OPTIMIZER', lines: ['Free GoMining', 'Profit Optimizer'], sub: 'Live P&L, a capital planner, and honest projections.' },
  { page: 'console/index.html',  out: 'og-console.png', eyebrow: 'LIVE DASHBOARD',            lines: ['Your GoMining', 'farm, live.'],      sub: 'Daily net, monthly yield, discount & VIP — sat by sat.' },
  { page: 'claim/index.html',    out: 'og-claim.png',   eyebrow: 'NEW USER OFFER',           lines: ['Claim your funded', 'first TH.'],     sub: 'Sign up with RINGO5 — I fund your first TH.' },
  { page: 'gomining-roi-calculator.html',   out: 'og-gomining-roi-calculator.png',   eyebrow: 'CALCULATOR',        lines: ['GoMining ROI &', 'Break-Even Calculator'], sub: 'Model your payback on live network data.' },
  { page: 'gomining-discount-explained.html', out: 'og-gomining-discount-explained.png', eyebrow: 'GUIDE',           lines: ['The GoMining', 'Discount, Explained'],    sub: 'How locking GMT cuts your electricity fee.' },
  { page: 'gomining-promo-code.html',       out: 'og-gomining-promo-code.png',       eyebrow: 'PROMO CODE',        lines: ['GoMining Promo', 'Code: RINGO5'],         sub: '+5% bonus TH — and a funded first TH.' },
  { page: 'gomining-worth-it-now.html',     out: 'og-gomining-worth-it-now.png',     eyebrow: 'LIVE VERDICT',      lines: ['Is GoMining', 'Worth It Right Now?'],     sub: 'Updated monthly on live figures.' },
  { page: 'how-gomining-works.html',        out: 'og-how-gomining-works.png',        eyebrow: "BEGINNER'S GUIDE",  lines: ['How Does', 'GoMining Work?'],             sub: 'Cloud Bitcoin mining, explained simply.' },
  { page: 'is-gomining-worth-it.html',      out: 'og-is-gomining-worth-it.png',      eyebrow: 'HONEST BREAKDOWN',  lines: ['Is GoMining', 'Worth It in 2026?'],       sub: 'An honest, numbers-first breakdown.' },
];
// ROI & break-even by size
[1, 5, 10, 25, 50, 100, 250, 500].forEach(th => PAGES.push({
  page: `gomining-${th}-th-roi.html`, out: `og-gomining-${th}-th-roi.png`,
  eyebrow: 'ROI & BREAK-EVEN', lines: [`GoMining ${th} TH`, 'ROI & Break-Even'], sub: 'What it really costs, earns, and pays back.'
}));
// Profitability by BTC price
[['75k', '$75k'], ['100k', '$100k'], ['150k', '$150k'], ['200k', '$200k'], ['250k', '$250k']].forEach(([s, p]) => PAGES.push({
  page: `gomining-profit-btc-${s}.html`, out: `og-gomining-profit-btc-${s}.png`,
  eyebrow: 'PRICE SCENARIO', lines: ['Is GoMining Profitable', `if BTC hits ${p}?`], sub: 'Break-even and ROI at this Bitcoin price.'
}));

let n = 0;
PAGES.forEach(p => {
  const png = new Resvg(thumb(p), { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true } }).render().asPng();
  fs.writeFileSync(ROOT + '/' + p.out, png);
  n++;
});
console.log(`Rendered ${n} thumbnails.`);
// emit the page->image map so the wiring step can pick it up
fs.writeFileSync(ROOT + '/scripts/og-thumbs.map.json', JSON.stringify(PAGES.map(p => ({ page: p.page, out: p.out })), null, 2));
