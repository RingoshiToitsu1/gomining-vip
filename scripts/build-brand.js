#!/usr/bin/env node
/* Brand asset build — every icon and favicon derives from assets/brand/GMT_icon_transparent.svg.
   =========================================================================================
     NODE_OPTIONS="" node scripts/build-brand.js
   Writes: assets/brand/favicon.svg (square), assets/brand/apple-touch-icon.png (180),
   assets/brand/icon-192.png, icon-512.png, icon-maskable-512.png, /favicon.ico (16+32+48),
   /site.webmanifest, and refreshes the legacy paths /gmt-optimizer-logo.svg + /site-logo.png
   (kept because other sites, caches and old shares point at them). Needs @resvg/resvg-js.
*/
'use strict';
const fs = require('fs'), path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const ROOT = path.join(__dirname, '..'), B = path.join(ROOT, 'assets/brand');
const BG = '#0B0B0D';

const icon = fs.readFileSync(path.join(B, 'GMT_icon_transparent.svg'), 'utf8');
const [vx, vy, vw, vh] = icon.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const inner = icon.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
// The mark is ~2:1, so centre it on a square. pad = fraction of the side left empty around it.
function square(pad, bg, radius) {
  const side = vw / (1 - 2 * pad), cx = vx + vw / 2, cy = vy + vh / 2;
  const x = cx - side / 2, y = cy - side / 2;
  const rect = bg ? `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${radius ? side * radius : 0}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}">${rect}${inner}</svg>`;
}
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
const w = (rel, data) => { fs.writeFileSync(path.join(ROOT, rel), data); console.log('wrote', rel); };

const fav = square(0.06, null);                       // transparent, tight: reads at 16 px
w('assets/brand/favicon.svg', fav);
w('gmt-optimizer-logo.svg', fav);                     // legacy path, new mark
w('assets/brand/apple-touch-icon.png', png(square(0.14, BG), 180));
w('assets/brand/icon-192.png', png(square(0.12, BG), 192));
w('assets/brand/icon-512.png', png(square(0.12, BG), 512));
w('assets/brand/icon-maskable-512.png', png(square(0.22, BG), 512));   // safe zone for round masks
w('site-logo.png', png(square(0.14, BG), 500));       // legacy path, new mark

// favicon.ico: PNG-in-ICO container with 16, 32 and 48 px images.
const sizes = [16, 32, 48], imgs = sizes.map(s => png(square(0.04, null), s));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, k) => {
  const e = 6 + 16 * k;
  head.writeUInt8(s, e); head.writeUInt8(s, e + 1); head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(imgs[k].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += imgs[k].length;
});
w('favicon.ico', Buffer.concat([head, ...imgs]));

w('site.webmanifest', JSON.stringify({
  name: 'GMT-Optimizer', short_name: 'GMT-Optimizer',
  description: 'Independent GoMining calculator, planner and projections.',
  start_url: '/', display: 'standalone', background_color: BG, theme_color: BG,
  icons: [
    { src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 2) + '\n');
