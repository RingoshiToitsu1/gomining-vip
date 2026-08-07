/* GMT Optimizer — cinematic scroll intro.
   =========================================
   One canvas of particles, scrubbed by scroll position, morphing through four
   formations: galaxy -> clusters -> mesh -> a rising earnings chart. The chart
   is the payoff: the same shape the tool exists to project.

   Nothing here is required to read the page. The markup renders as a plain
   title block on its own; this script opts into the tall scroll stage by adding
   .cine-on to <body>, so with JS off (or reduced motion on) there is no
   multi-screen dead zone to scroll past. */
(function () {
  var sec = document.getElementById('cine');
  var cvs = document.getElementById('cineCanvas');
  if (!sec || !cvs || !cvs.getContext) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = cvs.getContext('2d');
  var N = 170;                        // particle count — O(n^2) link pass, keep modest
  var dpr = Math.min(devicePixelRatio || 1, 2);
  var W = 0, H = 0, running = false, p = 0, drawn = -1;
  var beats = [].slice.call(sec.querySelectorAll('[data-beat]'));

  document.body.classList.add('cine-on');

  /* Deterministic PRNG so a resize rebuilds the same constellation rather than
     reshuffling every particle under the reader. */
  function mk(seed) {
    var s = seed || 1;
    return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
  }

  /* ---- formations: each returns N points in canvas space ---- */

  function fGalaxy() {
    var r = mk(7), out = [], cx = W * 0.5, cy = H * 0.46,
        maxR = Math.min(W, H) * 0.62, ARMS = 2, TURNS = 1.45;
    for (var i = 0; i < N; i++) {
      var t = Math.pow(i / N, 0.62), arm = i % ARMS;
      var ang = arm * (6.2832 / ARMS) + t * TURNS * 6.2832 + (r() - 0.5) * 0.5;
      var rad = maxR * t + (r() - 0.5) * maxR * 0.06;
      out.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * 0.82 });
    }
    return out;
  }

  /* Five loose knots, the stage where the reference reads as constellations. */
  function fClusters() {
    var r = mk(23), out = [], K = 5;
    var cxs = [0.13, 0.32, 0.52, 0.72, 0.9], cys = [0.34, 0.62, 0.44, 0.66, 0.38];
    for (var i = 0; i < N; i++) {
      var k = i % K, rad = Math.min(W, H) * (0.05 + r() * 0.06), a = r() * 6.2832;
      out.push({ x: W * cxs[k] + Math.cos(a) * rad, y: H * cys[k] + Math.sin(a) * rad });
    }
    return out;
  }

  /* The knots merge into one wide banner that spans the viewport. */
  function fMesh() {
    var r = mk(41), out = [];
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      var y = H * 0.5 + Math.sin(t * 5.2) * H * 0.1 + (r() - 0.5) * H * 0.22;
      out.push({ x: W * 0.05 + t * W * 0.9 + (r() - 0.5) * W * 0.03, y: y });
    }
    return out;
  }

  /* Random walk with an upward drift — reads as a real price series, not an arc. */
  function fChart() {
    var r = mk(97), out = [], y = H * 0.74;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      y += (r() - 0.44) * H * 0.045;     // volatility
      y -= (H * 0.42) / N;               // trend
      y = Math.max(H * 0.14, Math.min(H * 0.84, y));
      out.push({ x: W * 0.05 + t * W * 0.9, y: y });
    }
    return out;
  }

  var F = [];
  function build() {
    W = cvs.width = Math.floor(innerWidth * dpr);
    H = cvs.height = Math.floor(innerHeight * dpr);
    cvs.style.width = innerWidth + 'px';
    cvs.style.height = innerHeight + 'px';
    F = [fGalaxy(), fClusters(), fMesh(), fChart()];
    drawn = -1;
  }

  /* ---- scrub ---- */
  var STOPS = [0, 0.30, 0.60, 0.90];    // progress at which each formation is fully struck
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* Map global progress to a pair of formations plus the blend between them. */
  function phase(prog) {
    for (var i = STOPS.length - 1; i >= 0; i--) {
      if (prog >= STOPS[i]) {
        if (i === STOPS.length - 1) return { a: i, b: i, t: 1 };
        return { a: i, b: i + 1, t: ease(clamp((prog - STOPS[i]) / (STOPS[i + 1] - STOPS[i]))) };
      }
    }
    return { a: 0, b: 0, t: 0 };
  }

  /* Text beats fade and sharpen inside their own windows, so copy is legible at
     rest and never competes with the busiest part of a transition. */
  function beatOpacity(el, prog) {
    var inA = +el.dataset.in, inB = +el.dataset.full, outA = +el.dataset.hold, outB = +el.dataset.out;
    if (prog < inA || prog > outB) return 0;
    if (prog < inB) return (prog - inA) / (inB - inA);
    if (prog <= outA) return 1;
    return 1 - (prog - outA) / (outB - outA);
  }

  function render() {
    var ph = phase(p), A = F[ph.a], B = F[ph.b], t = ph.t;
    var chartness = clamp((p - STOPS[2]) / (STOPS[3] - STOPS[2]));   // 0 mesh .. 1 chart
    var webness = 1 - chartness;

    ctx.clearRect(0, 0, W, H);

    var pts = [], i, j;
    for (i = 0; i < N; i++) {
      pts.push({ x: A[i].x + (B[i].x - A[i].x) * t, y: A[i].y + (B[i].y - A[i].y) * t });
    }

    /* Proximity web — the constellation. Fades out as the chart takes over. */
    if (webness > 0.01) {
      var lim = Math.min(W, H) * 0.19, lim2 = lim * lim;
      ctx.lineWidth = 1 * dpr;
      for (i = 0; i < N; i++) {
        for (j = i + 1; j < N; j++) {
          var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d2 = dx * dx + dy * dy;
          if (d2 > lim2) continue;
          var o = (1 - Math.sqrt(d2) / lim) * 0.42 * webness;
          ctx.strokeStyle = 'rgba(150,180,255,' + o + ')';
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    }

    /* Sequential trace — reads as the price line once the web has gone. */
    if (chartness > 0.01) {
      ctx.lineWidth = 1.7 * dpr;
      ctx.strokeStyle = 'rgba(210,225,255,' + (0.72 * chartness) + ')';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (i = 1; i < N; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();

      /* Glow pass under the trace, brightest at the leading edge. */
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 5 * dpr;
      ctx.strokeStyle = 'rgba(120,150,240,' + (0.1 * chartness) + ')';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* Nodes */
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < N; i++) {
      var lead = i / (N - 1);
      var sz = (1.1 + (i % 5 === 0 ? 0.9 : 0)) * dpr;
      var a = 0.5 + 0.5 * Math.sin(lead * 9 + p * 6);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, sz, 0, 6.2832);
      ctx.fillStyle = 'rgba(150,185,255,' + (0.45 + a * 0.35) + ')';
      ctx.fill();
    }
    /* Leading spark on the chart tip. */
    if (chartness > 0.3) {
      var tip = pts[N - 1], g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 26 * dpr);
      g.addColorStop(0, 'rgba(255,240,210,' + (0.75 * chartness) + ')');
      g.addColorStop(1, 'rgba(245,166,35,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 26 * dpr, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame() {
    if (!running) return;
    var top = sec.getBoundingClientRect().top;
    var span = sec.offsetHeight - innerHeight;
    var np = span > 0 ? clamp(-top / span) : 0;

    if (Math.abs(np - p) > 0.0002 || drawn < 0) {
      p = np;
      drawn = 1;
      render();
      for (var i = 0; i < beats.length; i++) {
        var o = beatOpacity(beats[i], p);
        beats[i].style.opacity = o;
        /* Focus-in: blurred and slightly low while arriving, sharp at rest. */
        beats[i].style.filter = o > 0.995 ? 'none' : 'blur(' + ((1 - o) * 9).toFixed(2) + 'px)';
        /* Centring lives in this transform too — setting it here would otherwise
           clobber the translate(-50%,-50%) the stylesheet uses to pin the beat. */
        beats[i].style.transform = 'translate(-50%,-50%) translateY(' + ((1 - o) * 16).toFixed(1) + 'px)';
        beats[i].style.visibility = o < 0.01 ? 'hidden' : 'visible';
      }
      sec.style.setProperty('--cp', p.toFixed(4));
    }
    requestAnimationFrame(frame);
  }

  build();
  addEventListener('resize', build);

  /* Only burn frames while the stage is actually on screen. */
  new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && !running) { running = true; requestAnimationFrame(frame); }
      else if (!e.isIntersecting) { running = false; }
    });
  }, { rootMargin: '10% 0px' }).observe(sec);
})();
