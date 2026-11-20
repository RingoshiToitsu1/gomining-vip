/* Landing hero curve (v3, decorative). The SVG in index.html works on its own (stretched, no dots) when this script
   doesn't run. With it, the curve is rebuilt in real pixels on every size change:
   - viewBox = the SVG's own box, so nothing is stretched: dots stay round and the stroke has its true length;
   - the line draws in along its whole length (pathLength dash, valid now that the stroke isn't non-scaling);
   - dots are points ON the path (getPointAtLength), placed only where they clear the hero text, the badge, the
     buttons and the Quick estimate card (and anything else in the hero), so none hide behind or under them.
   Reduced motion: drawn at once, no animation. */
(function () {
  'use strict';
  var svg = document.querySelector('.lp-hero__art'), hero = svg && svg.closest('.lp-hero');
  if (!svg || !hero || !svg.getBoundingClientRect) return;
  var line = svg.querySelector('.lp-art-line'), area = svg.querySelector('.lp-art-area'), dotsG = svg.querySelector('.lp-art-dots');
  if (!line || !area || !dotsG) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  // the curve's shape, as fractions of the box (same shape as the static path: 1440 × 560 units)
  var K = [[0, 520], [260, 512], [470, 488], [660, 448], [1010, 330], [1180, 228], [1360, 110], [1440, 64]]
    .map(function (p) { return [p[0] / 1440, p[1] / 560]; });
  var lastKey = '', t0 = 0, DUR = 2200, DELAY = 250;

  function pathD(w, h) {
    var P = K.map(function (p) { return (p[0] * w).toFixed(1) + ' ' + (p[1] * h).toFixed(1); });
    return 'M' + P[0] + ' C ' + P[1] + ', ' + P[2] + ', ' + P[3] + ' S ' + P[4] + ', ' + P[5] + ' S ' + P[6] + ', ' + P[7];
  }
  // everything the dots must not sit behind or under: each text block, the badge, the buttons, the estimate card
  function obstacles(box) {
    var els = hero.querySelectorAll('.lp-hero__grid > div > *, .lp-hero__grid > .lp-calc, .lp-v3, #roi-embed');
    var pad = 16, out = [];
    Array.prototype.forEach.call(els, function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      out.push({ l: r.left - box.left - pad, t: r.top - box.top - pad, r: r.right - box.left + pad, b: r.bottom - box.top + pad });
    });
    return out;
  }
  function clear(x, y, obs, w, h) {
    if (x < 24 || x > w - 24 || y < 18 || y > h - 18) return false;
    for (var i = 0; i < obs.length; i++) { var o = obs[i]; if (x > o.l && x < o.r && y > o.t && y < o.b) return false; }
    return true;
  }
  // up to 3 dots, spread along the line, only on clear stretches; at least 90 px apart
  function pickDots(L, obs, w, h) {
    var N = 240, ok = [];
    for (var i = 4; i <= N - 2; i++) { var s = L * i / N, p = line.getPointAtLength(s); if (clear(p.x, p.y, obs, w, h)) ok.push({ s: s, x: p.x, y: p.y }); }
    if (!ok.length) return [];
    var picked = [];
    [0.3, 0.55, 0.82, 0.95].forEach(function (f) {
      if (picked.length >= 3) return;
      var target = L * f, best = null;
      ok.forEach(function (c) {
        if (picked.some(function (q) { return Math.hypot(q.x - c.x, q.y - c.y) < 90; })) return;
        if (!best || Math.abs(c.s - target) < Math.abs(best.s - target)) best = c;
      });
      if (best && Math.abs(best.s - target) < L * 0.2) picked.push(best);
    });
    return picked.sort(function (a, b) { return a.s - b.s; });
  }

  function build() {
    var box = svg.getBoundingClientRect(), w = Math.round(box.width), h = Math.round(box.height);
    if (w < 50 || h < 50) return;
    var obs = obstacles(box), key = w + 'x' + h + ':' + obs.map(function (o) { return Math.round(o.l) + ',' + Math.round(o.t) + ',' + Math.round(o.r) + ',' + Math.round(o.b); }).join(';');
    if (key === lastKey) return;
    lastKey = key;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');   // 1:1 with the box now, nothing stretches
    var d = pathD(w, h);
    line.setAttribute('d', d);
    line.removeAttribute('vector-effect');   // uniform scale now: the dash (pathLength 1) covers the whole line
    area.setAttribute('d', d + ' L ' + w + ' ' + h + ' L 0 ' + h + ' Z');
    var L = line.getTotalLength();   // user units (pathLength only scales dashes)
    var dots = pickDots(L, obs, w, h);
    while (dotsG.firstChild) dotsG.removeChild(dotsG.firstChild);
    if (!t0) t0 = performance.now();
    var elapsed = performance.now() - t0;
    dots.forEach(function (p, i) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p.x.toFixed(2)); c.setAttribute('cy', p.y.toFixed(2)); c.setAttribute('r', i === dots.length - 1 ? 6 : 5);
      dotsG.appendChild(c);
      // pop in when the line reaches it (the draw is linear, so time = share of the length); a dot made by a later
      // rebuild gets only what's left of that delay, or none
      var at = DELAY + DUR * (p.s / L) - elapsed;
      if (!reduce && at > 0) c.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }],
        { duration: 450, delay: at, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
    svg.classList.add('is-live');   // starts the CSS draw-in (landing.css), once
  }

  function schedule() { requestAnimationFrame(build); }
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(schedule);
    ro.observe(hero);
    var card = document.getElementById('roi-embed'); if (card) ro.observe(card);   // the estimate fills in later
  } else addEventListener('resize', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);   // text blocks move when fonts swap
  schedule();
})();
