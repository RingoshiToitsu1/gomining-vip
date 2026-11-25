/* GMT-Optimizer — Hashrate visualizer (opened from the "Hashrate" chip in the console's live strip).
   ==================================================================================================
   One idea, shown four ways: 1 TH/s = 1 trillion calculations (SHA-256 hashes) every second.

     1. The rate        your TH as "N trillion calculations a second", with every digit written out.
     2. The counter     calculations your farm has done since this screen opened, counting live.
                        Digits below what can change between two frames are unknowable at that speed, so they
                        churn at random; everything above them is the exact running total.
     3. The picture     "Your farm": one square per TH, a gold sweep passes through all of them once a second.
                        "Inside 1 TH": 1,000 × 1,000 dots, each dot one million calculations; the square fills
                        once a second — that is one TH.
     4. The race        this device does real Bitcoin-style hashing (double SHA-256 over an 80-byte header with
                        a precomputed midstate, the same shortcut ASICs use) while the screen is open, and the
                        farm's rate is set against it. Plus a few plain comparisons, and the solo-mining odds from
                        live network difficulty (why mining is pooled).

   Nothing here is a live reading from GoMining: the farm rate is the TH the user entered, at its nominal speed.
   Loaded on demand by openHashViz() in app.js. GMTHashViz.open({ th, diff }) / GMTHashViz.close(). */
(function () {
  'use strict';
  if (window.GMTHashViz) return;

  var UI = window.GMT_UI, LANG = (UI && UI.lang) || (document.documentElement.lang || 'en').slice(0, 2);
  var LOC = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[LANG] || 'en-US';
  var T = UI && UI.t ? UI.t : function (s) { var a = arguments; return String(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // big-number names per language (de/fr/es use the long scale: 10^12 is Billion / billion / billón)
  var SCALE = {
    en: ['thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion'],
    es: ['mil', 'millones', 'mil millones', 'billones', 'mil billones', 'trillones', 'mil trillones', 'cuatrillones'],
    fr: ['mille', 'millions', 'milliards', 'billions', 'billiards', 'trillions', 'trilliards', 'quadrillions'],
    de: ['Tausend', 'Millionen', 'Milliarden', 'Billionen', 'Billiarden', 'Trillionen', 'Trilliarden', 'Quadrillionen']
  }[LANG] || null;
  var NAMES = SCALE || ['thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion'];
  var TRILLION = NAMES[3];

  function num(n, d) { return Number(n).toLocaleString(LOC, { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 }); }
  // 4.2e15 -> "4.2 quadrillion"; below 1,000 a plain number
  function words(n) {
    if (!isFinite(n)) return '∞';
    if (n < 1e3) return num(n, n < 10 ? 1 : 0);
    var k = Math.min(NAMES.length, Math.floor(Math.log10(n) / 3)), v = n / Math.pow(10, 3 * k);
    if (v >= 999.5 && k < NAMES.length) { k++; v /= 1000; }
    return num(v, v < 10 ? 1 : 0) + ' ' + NAMES[k - 1];
  }
  function dur(s) {
    if (s < 1) return T('less than a second');
    if (s < 90) return T('{0} seconds', num(s, s < 10 ? 1 : 0));
    if (s < 5400) return T('{0} minutes', num(s / 60, 0));
    if (s < 172800) return T('{0} hours', num(s / 3600, s < 36000 ? 1 : 0));
    if (s < 31557600 * 2) return T('{0} days', num(s / 86400, 0));
    return T('{0} years', words(s / 31557600));
  }
  function thText(th) { return num(th, th % 1 ? 2 : 0); }

  // ---------- styles (brand palette, same family as the Live Meter) ----------
  var GOLD = '#E2B259';
  var CSS = [
    '#hvRoot{position:fixed;inset:0;z-index:2147483600;background:#0B0B0D;color:var(--color-text,#F4F1EA);overflow-y:auto;overscroll-behavior:contain;',
    '  font-family:Inter,"Inter Fallback",system-ui,sans-serif;opacity:0;transition:opacity .25s ease;-webkit-overflow-scrolling:touch}',
    '#hvRoot.on{opacity:1}',
    '.hv-wrap{max-width:760px;margin:0 auto;padding:16px 16px 48px;box-sizing:border-box}',
    '.hv-top{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;background:#0B0B0D}',
    '.hv-top h2{margin:0;font:600 15px/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A)}',
    '.hv-x{all:unset;cursor:pointer;font:500 13px/1 Poppins,"Poppins Fallback",system-ui,sans-serif;color:#F4F1EA;padding:9px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12)}',
    '.hv-x:hover{background:rgba(255,255,255,.07)}',
    '#hvRoot :focus-visible{outline:2px solid ' + GOLD + ';outline-offset:2px}',
    '.hv-hero{text-align:center;padding:18px 0 6px}',
    '.hv-k{font:500 12px/1.4 Poppins,"Poppins Fallback",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-2,#A8A29A);margin:0 0 6px}',
    '.hv-big{font:600 clamp(40px,12vw,84px)/1.05 Inter,"Inter Fallback",system-ui,sans-serif;color:' + GOLD + ';font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
    '.hv-big small{font-size:.42em;color:#F7D88A;margin-left:.15em}',
    '.hv-eq{font:500 clamp(16px,4.4vw,22px)/1.4 Inter,"Inter Fallback",system-ui,sans-serif;margin:10px 0 0}',
    '.hv-eq b{color:#F7D88A;font-weight:600}',
    '.hv-digits{margin:8px auto 0;max-width:36em;font:500 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--color-text-3,#7C776F);overflow-wrap:anywhere}',
    '.hv-card{margin-top:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;background:#111114}',
    '.hv-card h3{margin:0 0 4px;font:600 14px/1.35 Poppins,"Poppins Fallback",system-ui,sans-serif;color:#F4F1EA}',
    '.hv-card p{margin:6px 0 0;font-size:13.5px;line-height:1.55;color:var(--color-text-2,#A8A29A)}',
    '.hv-card p b{color:#F4F1EA;font-weight:600}',
    '.hv-count{font:600 clamp(18px,5.6vw,36px)/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:' + GOLD + ';font-variant-numeric:tabular-nums;overflow-wrap:anywhere;margin-top:8px}',
    '.hv-tabs{display:inline-flex;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px;margin:10px 0 12px}',
    '.hv-tabs button{all:unset;cursor:pointer;font:500 12.5px/1 Poppins,"Poppins Fallback",system-ui,sans-serif;padding:8px 13px;border-radius:999px;color:var(--color-text-2,#A8A29A)}',
    '.hv-tabs button[aria-pressed="true"]{background:rgba(226,178,89,.16);color:#F7D88A}',
    '.hv-cv{display:block;width:100%;border-radius:10px;background:#000;image-rendering:pixelated}',
    '.hv-cv.farm{aspect-ratio:16/10}.hv-cv.one{aspect-ratio:1;max-width:520px;margin:0 auto}',
    '.hv-cap{margin-top:10px!important;font-size:13px!important}',
    '.hv-race{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}',
    '.hv-stat{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;min-width:0}',
    '.hv-stat span{display:block;font:500 11.5px/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A)}',
    '.hv-stat b{display:block;font:600 16px/1.35 Inter,"Inter Fallback",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:#F4F1EA;margin-top:2px}',
    '.hv-stat.gold b{color:' + GOLD + '}',
    '.hv-hash{margin-top:12px;font:500 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--color-text-3,#7C776F);overflow-wrap:anywhere}',
    '.hv-hash i{font-style:normal;color:' + GOLD + '}',
    '.hv-hash span{display:block;font:500 11.5px/1.4 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A);margin-top:8px}',
    '.hv-list{margin:6px 0 0;padding:0;list-style:none}',
    '.hv-list li{padding:12px 0;border-top:1px solid rgba(255,255,255,.06);font-size:13.5px;line-height:1.55;color:var(--color-text-2,#A8A29A)}',
    '.hv-list li:first-child{border-top:0}',
    '.hv-list li b{display:block;font:600 18px/1.3 Inter,"Inter Fallback",system-ui,sans-serif;color:#F7D88A;margin-bottom:2px}',
    '.hv-note{margin:16px 2px 0;font-size:12px;line-height:1.5;color:var(--color-text-3,#7C776F)}',
    '.hv-demo{margin:10px auto 0;max-width:30em;font-size:13px;color:#F7D88A}',
    '@media (max-width:420px){.hv-race{grid-template-columns:1fr}}',
    '@media (prefers-reduced-motion:reduce){#hvRoot{transition:none}}'
  ].join('\n');

  // ---------- SHA-256 (midstate + double hash, as a miner does it) ----------
  var K = new Int32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
    0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
    0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var IV = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  var W = new Int32Array(64);
  // compress one 16-word block (in W[0..15]) into out, starting from state st
  function compress(st, out) {
    var i, a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7], t1, t2, x, y;
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (((x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3)) + W[i - 16] +
        ((y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10)) + W[i - 7]) | 0;
    }
    for (i = 0; i < 64; i++) {
      t1 = (h + ((e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = (((a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    out[0] = st[0] + a | 0; out[1] = st[1] + b | 0; out[2] = st[2] + c | 0; out[3] = st[3] + d | 0;
    out[4] = st[4] + e | 0; out[5] = st[5] + f | 0; out[6] = st[6] + g | 0; out[7] = st[7] + h | 0;
  }
  // a made-up 80-byte block header: the first 64 bytes never change, so their state (the midstate) is computed once
  var MID = new Int32Array(8), TAIL = new Int32Array(3), H1 = new Int32Array(8), H2 = new Int32Array(8);
  (function () {
    for (var i = 0; i < 16; i++) W[i] = (Math.random() * 4294967296) | 0;
    compress(IV, MID);
    for (i = 0; i < 3; i++) TAIL[i] = (Math.random() * 4294967296) | 0;
  })();
  function hashNonce(nonce) {
    W[0] = TAIL[0]; W[1] = TAIL[1]; W[2] = TAIL[2]; W[3] = nonce;
    W[4] = 0x80000000; for (var i = 5; i < 15; i++) W[i] = 0; W[15] = 640;
    compress(MID, H1);
    for (i = 0; i < 8; i++) W[i] = H1[i];
    W[8] = 0x80000000; for (i = 9; i < 15; i++) W[i] = 0; W[15] = 256;
    compress(IV, H2);
  }
  // Bitcoin shows a hash byte-reversed, which is where the leading zeros appear
  function hexRev(h) {
    var s = '';
    for (var i = 7; i >= 0; i--) for (var j = 0; j < 4; j++) { var b = (h[i] >>> (8 * j)) & 255; s += (b < 16 ? '0' : '') + b.toString(16); }
    return s;
  }
  function zeros(hex) { var n = 0; while (n < hex.length && hex.charCodeAt(n) === 48) n++; return n; }

  // ---------- state ----------
  var root = null, el = {}, raf = 0, t0 = 0, last = 0, th = 1, demo = false, diff = 0, view = 'farm', opener = null;
  var nonce = 0, hashMs = 0, hashN = 0, rate = 0, best = { z: -1, hex: '' }, latest = '', lastRaceDraw = 0;
  var oneImg = null, oneNoise = null, oneRow = 0, onePhase = -1;

  function css() {
    if (document.getElementById('hvCss')) return;
    var s = document.createElement('style'); s.id = 'hvCss'; s.textContent = CSS; document.head.appendChild(s);
  }

  function build() {
    var perSec = th * 1e12, Dh = diff * 4294967296, needZ = Math.round(Math.log2(Dh) / 4);
    root = document.createElement('div'); root.id = 'hvRoot';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'hvTitle');
    var digits; try { digits = BigInt(Math.round(th * 100)) * 10000000000n; digits = digits.toLocaleString(LOC); } catch (e) { digits = num(perSec); }
    root.innerHTML =
      '<div class="hv-wrap">' +
      '<div class="hv-top"><h2 id="hvTitle">' + T('What your hashrate does') + '</h2><button type="button" class="hv-x" id="hvClose">' + T('Close') + '</button></div>' +
      '<div class="hv-hero">' +
      '<p class="hv-k">' + T('Your hashrate') + '</p>' +
      '<div class="hv-big">' + thText(th) + '<small>TH/s</small></div>' +
      '<p class="hv-eq">= <b>' + thText(th) + ' ' + TRILLION + '</b> ' + T('calculations every second') +
      (perSec >= 1e15 ? '<br><span style="color:var(--color-text-2,#A8A29A);font-size:.8em">(' + T('that’s {0}', words(perSec)) + ')</span>' : '') + '</p>' +
      '<p class="hv-digits">' + digits + ' ' + T('per second') + '</p>' +
      (demo ? '<p class="hv-demo">' + T('Showing 1 TH as an example. Add your TH in Edit farm to see your own.') + '</p>' : '') +
      '</div>' +

      '<div class="hv-card"><h3>' + T('Calculations since you opened this') + '</h3>' +
      '<div class="hv-count" id="hvCount" aria-live="off">0</div>' +
      '<p id="hvCountW">&nbsp;</p></div>' +

      '<div class="hv-card"><h3>' + T('See it') + '</h3>' +
      '<div class="hv-tabs" role="group" aria-label="' + T('View') + '">' +
      '<button type="button" data-v="farm" aria-pressed="true">' + T('Your farm') + '</button>' +
      '<button type="button" data-v="one" aria-pressed="false">' + T('Inside 1 TH') + '</button></div>' +
      '<canvas class="hv-cv farm" id="hvCv" aria-hidden="true"></canvas>' +
      '<p class="hv-cap" id="hvCap"></p></div>' +

      '<div class="hv-card"><h3>' + T('This device vs your farm') + '</h3>' +
      '<p>' + T('While this screen is open, this device is doing real Bitcoin hashing (double SHA-256), the same work your miners do.') + '</p>' +
      '<div class="hv-race">' +
      '<div class="hv-stat"><span>' + T('This device') + '</span><b id="hvDev">…</b></div>' +
      '<div class="hv-stat gold"><span>' + T('Your farm') + '</span><b>' + words(perSec) + ' / s</b></div></div>' +
      '<p id="hvRatio">&nbsp;</p>' +
      '<div class="hv-hash"><span>' + T('Latest hash from this device') + '</span><div id="hvLatest">…</div>' +
      '<span>' + T('Best so far (most leading zeros)') + '</span><div id="hvBest">…</div></div>' +
      '<p>' + T('To win a block, Bitcoin needs a hash that starts with about {0} zeros.', '<b>' + needZ + '</b>') + '</p></div>' +

      '<div class="hv-card"><h3>' + T('To put it in perspective') + '</h3><ul class="hv-list">' +
      '<li><b>' + T('{0} years', words(perSec / 31557600)) + '</b>' + T('to count, one number a second, to what your farm does in one second.') + '</li>' +
      '<li><b>' + dur(perSec / 8.1e9) + '</b>' + T('if all 8 billion people on Earth each did one calculation a second, to match one second of your farm.') + '</li>' +
      (diff > 0 ? '<li><b>' + T('About every {0}', dur(Dh / perSec)) + '</b>' +
        T('is how often your farm would find a block on its own. The whole network finds one about every 10 minutes. That’s why mining is pooled: you get a steady share of the rewards every day instead of waiting.') + '</li>' : '') +
      '</ul></div>' +

      '<p class="hv-note">' + T('1 TH/s = 1 trillion SHA-256 hashes a second. Your TH is a share of real miners GoMining runs; these figures use its nominal speed, not a live reading.') + '</p>' +
      '</div>';
    document.body.appendChild(root);
    el.count = root.querySelector('#hvCount'); el.countW = root.querySelector('#hvCountW');
    el.cv = root.querySelector('#hvCv'); el.cap = root.querySelector('#hvCap');
    el.dev = root.querySelector('#hvDev'); el.ratio = root.querySelector('#hvRatio');
    el.latest = root.querySelector('#hvLatest'); el.best = root.querySelector('#hvBest');
    root.querySelector('#hvClose').addEventListener('click', close);
    root.querySelectorAll('.hv-tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-v')); });
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {   // keep focus inside the dialog
        var f = root.querySelectorAll('button'), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    setView('farm');
  }

  // ---------- picture ----------
  var grid = null;
  function setView(v) {
    view = v;
    root.querySelectorAll('.hv-tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); });
    el.cv.className = 'hv-cv ' + v;
    if (v === 'farm') {
      var unit = 1; while (th / unit > 1600) unit *= 10;
      var n = Math.max(1, Math.ceil(th / unit - 1e-9));
      el.cap.innerHTML = (unit === 1
        ? T('Each square is 1 TH: {0} calculations a second. The gold sweep passes through all {1} of them once a second.', '<b>' + num(1e12) + '</b>', '<b>' + num(n) + '</b>')
        : T('Each square is {0} TH. The gold sweep passes through all {1} of them once a second.', '<b>' + num(unit) + '</b>', '<b>' + num(n) + '</b>'));
      grid = { unit: unit, n: n, frac: (th / unit) - Math.floor(th / unit - 1e-9) };
    } else {
      el.cap.innerHTML = T('1,000 × 1,000 = 1 million dots. Each dot is 1 million calculations. One TH fills the whole square every second, and you have {0} of them.', '<b>' + thText(th) + '</b>');
    }
    sizeCanvas();
    if (reduce) drawStatic();
  }
  function sizeCanvas() {
    var cv = el.cv;
    if (view === 'one') {
      if (cv.width !== 1000) { cv.width = 1000; cv.height = 1000; }
      var ctx = cv.getContext('2d');
      oneImg = ctx.createImageData(1000, 1000); oneRow = 0; onePhase = -1;
      if (!oneNoise) { oneNoise = new Uint8Array(1e6); for (var i = 0; i < 1e6; i++) oneNoise[i] = 90 + (Math.random() * 165) | 0; }
      new Uint32Array(oneImg.data.buffer).fill(0xff000000);
      return;
    }
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 600, h = Math.round(w * 10 / 16);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    // lay out n squares to fill the canvas
    var W2 = cv.width, H2 = cv.height, n = grid.n, cols = Math.max(1, Math.round(Math.sqrt(n * W2 / H2)));
    while (Math.ceil(n / cols) * (W2 / cols) > H2 && cols < n) cols++;
    var rows = Math.ceil(n / cols), cell = Math.min(W2 / cols, H2 / rows);
    grid.cols = cols; grid.rows = rows; grid.cell = cell;
    grid.ox = (W2 - cols * cell) / 2; grid.oy = (H2 - rows * cell) / 2;
    grid.gap = cell > 6 ? Math.max(1, cell * 0.12) : 0.5;
  }
  function drawFarm(phase) {
    var ctx = el.cv.getContext('2d'), g = grid, W2 = el.cv.width, H2 = el.cv.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W2, H2);
    var span = g.cols + g.rows, s = g.cell - g.gap;
    for (var i = 0; i < g.n; i++) {
      var c = i % g.cols, r = (i / g.cols) | 0, pos = (c + r) / span, d = phase - pos;
      d -= Math.round(d);   // wrapped distance
      var a = phase < 0 ? 0.55 : 0.12 + 0.88 * Math.exp(-(d * d) / 0.0035);
      var wFrac = (i === g.n - 1 && g.frac > 0 && g.frac < 1) ? g.frac : 1;
      ctx.fillStyle = 'rgba(226,178,89,' + a.toFixed(3) + ')';
      ctx.fillRect(g.ox + c * g.cell + g.gap / 2, g.oy + r * g.cell + g.gap / 2, s * wFrac, s);
    }
  }
  function drawOne(phase) {
    var ctx = el.cv.getContext('2d'), px = new Uint32Array(oneImg.data.buffer);
    var target = phase < 0 ? 1000 : Math.floor(phase * 1000);
    if (phase >= 0 && phase < onePhase) { px.fill(0xff000000); oneRow = 0; }   // a new second: start the square again
    onePhase = phase;
    for (var y = oneRow; y < target; y++) {
      for (var x = 0, o = y * 1000; x < 1000; x++) {
        var v = oneNoise[o + x];   // gold (226,178,89) scaled by the dot's brightness; ABGR in memory
        px[o + x] = 0xff000000 | (((89 * v / 255) | 0) << 16) | (((178 * v / 255) | 0) << 8) | ((226 * v / 255) | 0);
      }
    }
    oneRow = target;
    ctx.putImageData(oneImg, 0, 0);
  }
  function drawStatic() { if (view === 'farm') drawFarm(-1); else drawOne(-1); }

  // ---------- counter ----------
  var bigOK = typeof BigInt === 'function';
  function drawCount(ms) {
    var total = th * 1e9 * ms;   // calculations so far (th × 10^12 per second)
    el.countW.textContent = '≈ ' + words(total);
    if (!bigOK) { el.count.textContent = num(total); return; }
    // exact to the microsecond; digits finer than one frame's worth churn, because at this speed they can't be read
    var us = BigInt(Math.floor(ms * 1000)), perUs = BigInt(Math.round(th * 100)) * 10000n;   // th × 10^6 per µs
    var exact = us * perUs, s = exact.toString();
    var fuzz = reduce ? 0 : Math.max(0, Math.min(s.length - 1, Math.floor(Math.log10(th * 1e9 * 33)) ));
    if (fuzz > 0) { var r = ''; for (var i = 0; i < fuzz; i++) r += (Math.random() * 10) | 0; s = s.slice(0, s.length - fuzz) + r; }
    try { el.count.textContent = BigInt(s).toLocaleString(LOC); } catch (e) { el.count.textContent = s; }
  }

  // ---------- race ----------
  function hashFor(budget) {
    var start = performance.now(), n = 0, now;
    do {
      for (var k = 0; k < 2048; k++) {
        hashNonce(nonce = (nonce + 1) | 0);
        if ((H2[7] & 0xf0) === 0) {   // at least one leading zero: worth a closer look
          var hx = hexRev(H2), z = zeros(hx);
          if (z > best.z) { best.z = z; best.hex = hx; }
        }
      }
      n += 2048; now = performance.now();
    } while (now - start < budget);
    hashN += n; hashMs += now - start; latest = hexRev(H2);
  }
  function mark(hex) { var z = zeros(hex); return '<i>' + hex.slice(0, z) + '</i>' + hex.slice(z); }
  function drawRace() {
    if (hashMs > 0) rate = hashN / hashMs * 1000;
    if (rate > 0) {
      el.dev.textContent = words(rate) + ' / s';
      el.ratio.innerHTML = T('Your farm does the work of {0} devices like this one.', '<b>' + words(th * 1e12 / rate) + '</b>');
    }
    if (latest) el.latest.innerHTML = mark(latest);
    if (best.hex) el.best.innerHTML = mark(best.hex) + ' <span style="display:inline;margin:0">(' + T('{0} zeros', best.z) + ', ' + T('{0} tries', words(hashN)) + ')</span>';
  }

  // ---------- loop ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!reduce && now - last < 30) return;   // ~30 fps
    if (reduce && now - last < 250) return;
    last = now;
    var ms = now - t0;
    drawCount(ms);
    if (!reduce) { var ph = (ms % 1000) / 1000; if (view === 'farm') drawFarm(ph); else drawOne(ph); }
    hashFor(reduce ? 20 : 8);
    if (now - lastRaceDraw > 250) { lastRaceDraw = now; drawRace(); }
  }
  function onResize() { if (root && view === 'farm') { sizeCanvas(); if (reduce) drawStatic(); } }

  function open(o) {
    o = o || {};
    if (root) close(true);
    th = +o.th > 0 ? +o.th : 0; demo = !(th > 0); if (demo) th = 1;
    diff = +o.diff > 0 ? +o.diff : 0;
    opener = document.activeElement;
    nonce = 0; hashMs = 0; hashN = 0; rate = 0; best = { z: -1, hex: '' }; latest = ''; last = 0; lastRaceDraw = 0;
    css(); build();
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { root.classList.add('on'); sizeCanvas(); if (reduce) drawStatic(); });
    root.querySelector('#hvClose').focus({ preventScroll: true });
    t0 = performance.now();
    raf = requestAnimationFrame(frame);
    addEventListener('resize', onResize, { passive: true });
  }
  function close(silent) {
    if (!root) return;
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener('resize', onResize);
    root.remove(); root = null; el = {}; oneImg = null;
    document.documentElement.style.overflow = '';
    if (silent !== true && opener && opener.focus) try { opener.focus({ preventScroll: true }); } catch (e) {}
  }

  window.GMTHashViz = { open: open, close: close };
})();
