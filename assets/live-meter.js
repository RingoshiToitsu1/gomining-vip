/* GMT-Optimizer — Live Meter (replaced "Stream mode", 2026-11-19).
   ==================================================================
   A calm full-screen display, closer to a screensaver than a stream overlay, built around one number: what the farm
   has earned since the meter opened, counting up every frame.

   Maths: nothing is computed here. app.js publishes window._vizFeed from the same composed figure as the console's
   Daily net profit card (mining + staking + ambassador + Greedy, after every fee and discount), so the meter can never
   disagree with the console behind it. Per second = daily ÷ 86,400. Sats = USD ÷ today's BTC price × 100,000,000.
   These are estimates at today's rates, not live payouts, and the screen says so.

   Themes (brand palette, slow, no glow, no particles):
     Minimal  pure black, the number, a thin gold line that fills once per second
     Flow     a very slow gold gradient wave drifting behind the number
     Ledger   a faint grid; a cell softly lights each time a sat is earned (at most 10 a second on big farms)

   Screensaver: full screen; cursor and controls hide after 3 s idle, any key/tap/move shows them; the screen is kept
   awake (Screen Wake Lock, where supported); the whole layout drifts a few pixels every minute (burn-in protection);
   optional clock; optional auto-start after X minutes idle on the console (off by default); animation capped at
   30 fps and paused while the tab is hidden; with reduced motion only the numbers update.

   Streaming (in the Streaming drawer, off by default; settings kept from Stream mode):
     Twitch chat read anonymously over Twitch's public IRC websocket (justinfan guest, read-only).
     TikTok chat via the helper on the streaming PC (~/tiktok-chat-bridge, ws://127.0.0.1:8787).
     Joins pooled so a rush reads as one line. QR (RINGO5 by default, or your own image) in its own reserved corner
     with its caption inside the same box. TikTok 9:16 frame with TikTok's own header/comment areas kept clear.

   Keys: Esc close · F full screen · U USD/sats · T next theme · K clock · S streaming drawer · V 9:16 (streaming). */
(function () {
  'use strict';
  if (window.GMTLiveMeter) return;

  // ---------- settings (Stream mode's keys kept so a streamer's channel, TikTok name, QR and layout carry over) ----------
  var K = { theme: 'gmtopt_lm_theme_v1', unit: 'gmtopt_lm_unit_v1', clock: 'gmtopt_lm_clock_v1', auto: 'gmtopt_lm_auto_v1',
    stream: 'gmtopt_lm_stream_v1', chan: 'gmtopt_viz_twitch_v1', tt: 'gmtopt_viz_tiktok_v1', joins: 'gmtopt_viz_joins_v1',
    qr: 'gmtopt_viz_qr_v1', layout: 'gmtopt_viz_layout_v1' };
  var TT_BRIDGE = 'ws://127.0.0.1:8787', QR_DEFAULT = '/assets/stream-qr.png?v=1', QR_MAX = 1.5e6;
  function load(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var UI = window.GMT_UI, LANG = (UI && UI.lang) || (document.documentElement.lang || 'en').slice(0, 2);
  var LOC = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[LANG] || 'en-US';
  var T = UI && UI.t ? UI.t : function (s) { var a = arguments; return String(s).replace(/\{(\d)\}/g, function (m, i) { return a[+i + 1] != null ? a[+i + 1] : m; }); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var THEMES = [{ id: 'minimal', name: 'Minimal' }, { id: 'flow', name: 'Flow' }, { id: 'ledger', name: 'Ledger' }];

  // ---------- styles ----------
  var CSS = [
    '#lmRoot{position:fixed;inset:0;z-index:2147483600;background:#000;color:var(--color-text,#F4F1EA);font-family:Inter,"Inter Fallback",system-ui,sans-serif;',
    '  opacity:0;transition:opacity .35s ease;container-type:size;overflow:hidden}',
    '#lmRoot.on{opacity:1}',
    '#lmRoot.idle,#lmRoot.idle *{cursor:none!important}',
    '#lmRoot.t-flow,#lmRoot.t-ledger{background:#0B0B0D}',
    '#lmRoot canvas.lm-bg{position:absolute;inset:0;width:100%;height:100%;display:block}',
    /* the stage: a grid, so the stats, hero, chat, QR and controls can never sit on top of each other */
    '.lm-stage{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr) auto;',
    '  grid-template-areas:"top top" "hero hero" "chat qr";gap:clamp(8px,2cqh,24px);padding:clamp(14px,3cqmin,40px);transition:transform 2s ease}',
    '#lmRoot.vert .lm-stage{left:50%;right:auto;width:min(100cqw,56.25cqh);transform:translateX(-50%);padding:11cqh clamp(12px,3cqw,28px) 25cqh;',
    '  grid-template-columns:minmax(0,1fr) auto;border-left:1px solid rgba(255,255,255,.06);border-right:1px solid rgba(255,255,255,.06)}',
    '.lm-top{grid-area:top;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}',
    '.lm-stats{display:flex;gap:clamp(6px,1.2cqw,14px);flex-wrap:wrap;opacity:.55}',
    '.lm-stat{border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:6px 10px;min-width:0}',
    '.lm-stat span{display:block;font:500 clamp(10px,1.1cqmin,12px)/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A);letter-spacing:.02em}',
    '.lm-stat b{display:block;font:600 clamp(12px,1.5cqmin,16px)/1.3 Inter,"Inter Fallback",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--color-text,#F4F1EA);white-space:nowrap}',
    '.lm-clock{font:500 clamp(14px,2.2cqmin,26px)/1 Inter,"Inter Fallback",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--color-text-2,#A8A29A);opacity:.7}',
    '.lm-clock[hidden]{display:none}',
    '.lm-hero{grid-area:hero;align-self:center;justify-self:center;text-align:center;min-width:0;max-width:100%}',
    '.lm-k{font:500 clamp(11px,1.6cqmin,15px)/1.4 Poppins,"Poppins Fallback",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--color-text-2,#A8A29A);margin:0 0 .6em}',
    '.lm-big{font:600 clamp(34px,min(13cqw,19cqh),180px)/1.05 Inter,"Inter Fallback",system-ui,sans-serif;font-variant-numeric:tabular-nums;',
    '  color:#E2B259;letter-spacing:-.01em;white-space:nowrap}',
    '#lmRoot.vert .lm-big{font-size:clamp(30px,min(12.5cqw,9cqh),150px)}',
    '.lm-sec{height:2px;margin:clamp(10px,2cqh,22px) auto 0;width:min(100%,36em);background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden}',
    '.lm-sec i{display:block;height:100%;width:100%;background:#E2B259;transform-origin:left;transform:scaleX(0)}',
    '#lmRoot:not(.t-minimal) .lm-sec{visibility:hidden}',
    '.lm-rates{display:flex;justify-content:center;gap:clamp(10px,3cqw,40px);flex-wrap:wrap;margin-top:clamp(14px,3cqh,30px)}',
    '.lm-rate span{display:block;font:500 clamp(10px,1.3cqmin,13px)/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A)}',
    '.lm-rate b{display:block;font:500 clamp(13px,2cqmin,20px)/1.35 Inter,"Inter Fallback",system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--color-text,#F4F1EA);white-space:nowrap}',
    '.lm-unit{display:inline-flex;margin-top:clamp(12px,2.4cqh,24px);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:2px}',
    '.lm-unit button{all:unset;cursor:pointer;font:500 12px/1 Poppins,"Poppins Fallback",system-ui,sans-serif;padding:6px 12px;border-radius:999px;color:var(--color-text-2,#A8A29A);transition:background-color 150ms ease,color 150ms ease}',
    '.lm-unit button[aria-pressed="true"]{background:rgba(226,178,89,.16);color:#F7D88A}',
    '.lm-unit button:focus-visible,.lm-bar button:focus-visible,.lm-drawer :focus-visible{outline:2px solid #E2B259;outline-offset:2px}',
    '.lm-note{margin:clamp(10px,2cqh,18px) 0 0;font:400 clamp(10px,1.2cqmin,12px)/1.4 Inter,"Inter Fallback",system-ui,sans-serif;color:var(--color-text-3,#7C776F)}',
    '.lm-empty{font:500 clamp(14px,2.4cqmin,20px)/1.5 Inter,"Inter Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A);max-width:28em}',
    /* streaming pieces: a chat column and the QR corner, each in its own grid cell */
    '.lm-chat{grid-area:chat;align-self:end;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;max-height:34cqh;overflow:hidden;min-width:0;max-width:min(30em,100%)}',
    '.lm-msg{font:500 clamp(12px,1.6cqmin,16px)/1.35 Inter,"Inter Fallback",system-ui,sans-serif;color:rgba(244,241,234,.85);background:rgba(0,0,0,.45);padding:4px 10px;border-radius:8px;width:fit-content;max-width:100%;overflow-wrap:anywhere;transition:opacity 1.2s ease}',
    '.lm-msg.old{opacity:0}.lm-msg b{margin-right:.4em}.lm-msg.sys{color:var(--color-text-3,#7C776F)}.lm-msg img{height:1.4em;vertical-align:middle}',
    '.lm-src{display:inline-block;width:1.2em;height:1.2em;border-radius:4px;margin-right:.4em;vertical-align:-.2em;font:700 .7em/1.2em Inter,sans-serif;text-align:center;color:#000;background:#B98CFF}.lm-src.tt{background:#5EE0D2}',
    '.lm-qr{grid-area:qr;align-self:end;justify-self:end;display:flex;flex-direction:column;align-items:center;gap:6px;width:clamp(92px,13cqmin,170px)}',
    '.lm-qr img{width:100%;aspect-ratio:1;object-fit:contain;display:block;border-radius:10px;background:#000;border:1px solid rgba(226,178,89,.35)}',
    '.lm-qrcap{width:100%;text-align:center;font:500 clamp(9px,1.25cqmin,13px)/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:#F7D88A;overflow-wrap:anywhere;hyphens:auto}',
    '.lm-qrcap small{display:block;color:var(--color-text-2,#A8A29A);font-size:.92em}',
    '#lmRoot:not(.streaming) .lm-chat,#lmRoot:not(.streaming) .lm-qr,#lmRoot.qr-off .lm-qr{display:none}',
    /* controls: shown on activity, hidden when idle */
    '.lm-bar{position:absolute;left:50%;bottom:clamp(10px,2cqh,22px);transform:translateX(-50%);display:flex;gap:6px;flex-wrap:wrap;justify-content:center;',
    '  max-width:calc(100% - 24px);padding:6px;border-radius:14px;background:rgba(20,20,24,.86);border:1px solid rgba(255,255,255,.08);transition:opacity .3s ease;z-index:3}',
    '#lmRoot.idle .lm-bar{opacity:0;pointer-events:none}',
    '.lm-bar button,.lm-bar select{font:500 12px/1 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text,#F4F1EA);background:transparent;border:1px solid transparent;',
    '  border-radius:10px;padding:8px 11px;cursor:pointer;transition:background-color 150ms ease,color 150ms ease,border-color 150ms ease}',
    '.lm-bar button:hover,.lm-bar select:hover{background:rgba(255,255,255,.07)}',
    '.lm-bar button[aria-pressed="true"]{border-color:rgba(226,178,89,.45);color:#F7D88A}',
    '.lm-bar select{background:rgba(255,255,255,.04)}.lm-bar select option{background:#141418;color:#F4F1EA}',
    '.lm-sep{width:1px;background:rgba(255,255,255,.1);margin:4px 2px}',
    '.lm-drawer{position:absolute;top:0;right:0;bottom:0;width:min(360px,100%);background:#121216;border-left:1px solid rgba(255,255,255,.08);z-index:4;',
    '  padding:20px;overflow:auto;transform:translateX(100%);transition:transform .25s ease;font-size:14px}',
    '#lmRoot.drawer .lm-drawer{transform:none}',
    '.lm-drawer h2{font:600 16px/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;margin:0 0 4px}',
    '.lm-drawer p{color:var(--color-text-2,#A8A29A);font-size:13px;line-height:1.5;margin:0 0 14px}',
    '.lm-drawer label{display:block;font:500 12px/1.3 Poppins,"Poppins Fallback",system-ui,sans-serif;color:var(--color-text-2,#A8A29A);margin:14px 0 6px}',
    '.lm-drawer input[type=text]{width:100%;box-sizing:border-box;background:#0B0B0D;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 11px;color:#F4F1EA;font:14px Inter,system-ui,sans-serif}',
    '.lm-drawer .lm-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '.lm-drawer button{font:500 12px/1 Poppins,"Poppins Fallback",system-ui,sans-serif;color:#F4F1EA;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:9px 12px;cursor:pointer;transition:background-color 150ms ease,border-color 150ms ease}',
    '.lm-drawer button:hover{background:rgba(255,255,255,.09)}',
    '.lm-drawer button[aria-pressed="true"]{border-color:rgba(226,178,89,.5);color:#F7D88A}',
    '.lm-drawer .lm-close{float:right}',
    '@media (prefers-reduced-motion:reduce){#lmRoot,.lm-stage,.lm-bar,.lm-drawer,.lm-msg{transition:none}}'
  ].join('\n');

  // ---------- state ----------
  var root = null, el = {}, running = false, raf = 0, lastFrame = 0, lastTick = 0, earnedUSD = 0, idleT = 0, driftT = 0;
  var theme = Math.max(0, THEMES.findIndex(function (t) { return t.id === load(K.theme, 'minimal'); }));
  var unit = load(K.unit, 'usd') === 'sats' ? 'sats' : 'usd', clockOn = load(K.clock, '0') === '1';
  var streaming = load(K.stream, '0') === '1', vert = load(K.layout, '') === 'vert';
  var wakeLock = null, bg = null, W = 0, H = 0, dpr = 1, ctx = null;

  function feed() { return window._vizFeed || null; }
  function perSecUSD() { var f = feed(); return f && isFinite(f.daily) ? f.daily / 86400 : 0; }
  function btcPrice() { var f = feed(); return f && f.bp > 0 ? f.bp : 0; }
  function fx() { var f = feed(); return (f && f.fx) || 1; }
  function curCode() { var f = feed(); var c = f && f.cur; return /^[A-Z]{3}$/.test(c || '') ? c : 'USD'; }
  function money(usd, d) {
    return new Intl.NumberFormat(LOC, { style: 'currency', currency: curCode(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }).format(usd * fx());
  }
  function num(v, d) { return new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v); }
  // enough decimals that the last digit visibly moves every frame or so, without turning into noise
  function decFor(perSec, lo, hi) { return perSec > 0 ? Math.max(lo, Math.min(hi, Math.ceil(-Math.log10(perSec / 12)))) : lo; }
  function show(usd, kind) {
    if (unit === 'sats') {
      var bp = btcPrice(), sats = bp ? usd / bp * 1e8 : 0, ps = bp ? perSecUSD() / bp * 1e8 : 0;
      var d = kind === 'big' ? decFor(ps, 0, 4) : (Math.abs(sats) >= 100 ? 0 : 2);
      return num(sats, d) + ' sats';
    }
    var p = perSecUSD() * fx();
    var dd = kind === 'big' ? decFor(p, 2, 8) : (Math.abs(usd * fx()) >= 100 ? 0 : Math.abs(usd * fx()) >= 1 ? 2 : 4);
    return money(usd, dd);
  }

  // ---------- open / close ----------
  function open(opts) {
    if (running) return;
    opts = opts || {};
    // settings are read on every open, so a change made in another tab (or on another visit) is always picked up
    theme = Math.max(0, THEMES.findIndex(function (t) { return t.id === load(K.theme, 'minimal'); }));
    unit = load(K.unit, 'usd') === 'sats' ? 'sats' : 'usd'; clockOn = load(K.clock, '0') === '1';
    streaming = load(K.stream, '0') === '1'; vert = load(K.layout, '') === 'vert';
    qrOn = load(K.qr + '_on', '1') === '1'; joinsOn = load(K.joins, '1') === '1';
    chan = load(K.chan, ''); tt = load(K.tt, '');
    if (!document.getElementById('lmCss')) { var st = document.createElement('style'); st.id = 'lmCss'; st.textContent = CSS; document.head.appendChild(st); }
    root = document.createElement('div');
    root.id = 'lmRoot';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', T('Live Meter'));
    root.innerHTML =
      '<canvas class="lm-bg" aria-hidden="true"></canvas>' +
      '<div class="lm-stage">' +
        '<div class="lm-top"><div class="lm-stats">' +
          '<div class="lm-stat"><span>' + T('Bitcoin') + '</span><b data-lm="btc">—</b></div>' +
          '<div class="lm-stat"><span>' + T('Hashrate') + '</span><b data-lm="th">—</b></div>' +
          '<div class="lm-stat"><span>' + T('Discount') + '</span><b data-lm="disc">—</b></div>' +
        '</div><div class="lm-clock" data-lm="clock"' + (clockOn ? '' : ' hidden') + '></div></div>' +
        '<div class="lm-hero">' +
          '<p class="lm-k">' + T('Earned this session') + '</p>' +
          '<div class="lm-big" data-lm="big" aria-live="off">—</div>' +
          '<div class="lm-sec" aria-hidden="true"><i data-lm="secbar"></i></div>' +
          '<div class="lm-rates">' +
            '<div class="lm-rate"><span>' + T('per second') + '</span><b data-lm="ps">—</b></div>' +
            '<div class="lm-rate"><span>' + T('per minute') + '</span><b data-lm="pm">—</b></div>' +
            '<div class="lm-rate"><span>' + T('per hour') + '</span><b data-lm="ph">—</b></div>' +
            '<div class="lm-rate"><span>' + T('per day') + '</span><b data-lm="pd">—</b></div>' +
          '</div>' +
          '<div class="lm-unit" role="group" aria-label="' + T('Show in') + '"><button type="button" data-unit="usd">' + curCode() + '</button><button type="button" data-unit="sats">sats</button></div>' +
          '<p class="lm-note">' + T('Estimated at today’s rates. Not a live payout.') + '</p>' +
          '<p class="lm-empty" data-lm="empty" hidden>' + T('Add your farm in the console to start the meter.') + '</p>' +
        '</div>' +
        '<div class="lm-chat" data-lm="chat" aria-live="polite"></div>' +
        '<div class="lm-qr"><img data-lm="qr" alt="' + T('QR code') + '"><div class="lm-qrcap">gmt-optimizer.com<small>' + T('code RINGO5 · scan to sign up') + '</small></div></div>' +
      '</div>' +
      '<div class="lm-bar" role="toolbar" aria-label="' + T('Live Meter controls') + '">' +
        THEMES.map(function (t, i) { return '<button type="button" data-theme="' + i + '">' + T(t.name) + '</button>'; }).join('') +
        '<span class="lm-sep" aria-hidden="true"></span>' +
        '<button type="button" data-act="clock">' + T('Clock') + '</button>' +
        '<label style="display:flex;align-items:center;gap:6px;color:var(--color-text-2,#A8A29A);font:500 12px Poppins,system-ui,sans-serif">' + T('Auto-start') +
          ' <select data-act="auto" aria-label="' + T('Start automatically after the console is idle for') + '">' +
          [0, 5, 10, 15, 30].map(function (m) { return '<option value="' + m + '">' + (m ? T('{0} min idle', m) : T('Off')) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" data-act="stream">' + T('Streaming') + '</button>' +
        '<button type="button" data-act="fs">' + T('Full screen') + '</button>' +
        '<button type="button" data-act="close">' + T('Close') + '</button>' +
      '</div>' +
      '<aside class="lm-drawer" aria-label="' + T('Streaming') + '">' +
        '<button type="button" class="lm-close" data-act="stream">' + T('Close') + '</button>' +
        '<h2>' + T('Streaming') + '</h2>' +
        '<p>' + T('Chat, joins and a QR code for when the meter is on stream. Off unless you turn it on.') + '</p>' +
        '<div class="lm-row"><button type="button" data-act="streamOn"></button><button type="button" data-act="vert">TikTok 9:16</button></div>' +
        '<label for="lmChan">' + T('Twitch channel') + '</label><input type="text" id="lmChan" autocomplete="off" spellcheck="false" placeholder="channel">' +
        '<label for="lmTt">' + T('TikTok username (needs the helper on this PC)') + '</label><input type="text" id="lmTt" autocomplete="off" spellcheck="false" placeholder="@username">' +
        '<div class="lm-row"><button type="button" data-act="joins"></button><button type="button" data-act="qr"></button></div>' +
        '<div class="lm-row"><button type="button" data-act="qrset">' + T('Change QR') + '</button><button type="button" data-act="qrreset">' + T('Reset QR') + '</button></div>' +
        '<input type="file" accept="image/*" data-lm="qrfile" hidden>' +
      '</aside>';
    document.body.appendChild(root);
    root.querySelectorAll('[data-lm]').forEach(function (n) { el[n.getAttribute('data-lm')] = n; });
    el.bar = root.querySelector('.lm-bar'); el.stage = root.querySelector('.lm-stage');
    root.querySelector('[data-act="auto"]').value = load(K.auto, '0');
    bg = root.querySelector('canvas.lm-bg'); ctx = bg.getContext('2d');
    running = true; earnedUSD = 0; lastTick = performance.now(); lastFrame = 0;
    applyTheme(); applyUnit(); applyStreaming(); qrApply(); syncControls(); updateStats(); resize();
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    ['pointermove', 'pointerdown', 'touchstart', 'wheel'].forEach(function (t) { root.addEventListener(t, wake, { passive: true }); });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', syncControls);
    addEventListener('resize', resize);
    addEventListener('gm:viz', updateStats);
    var ci = root.querySelector('#lmChan'), ti = root.querySelector('#lmTt');
    ci.value = chan; ti.value = tt ? '@' + tt : '';
    ci.addEventListener('change', function () { setChannel(ci.value); });
    ti.addEventListener('change', function () { setTikTok(ti.value); });
    if (streaming) { if (chan) chatConnect(chan); if (tt) ttConnect(); }
    if (!opts.auto) { try { root.requestFullscreen && root.requestFullscreen().catch(function () {}); } catch (e) {} }
    keepAwake();
    wake();
    drift();
    requestAnimationFrame(function () { if (root) root.classList.add('on'); });
    raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf); clearTimeout(idleT); clearInterval(driftT);
    chatDisconnect(); ttDisconnect();
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('fullscreenchange', syncControls);
    removeEventListener('resize', resize);
    removeEventListener('gm:viz', updateStats);
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    var r = root; root = null; el = {};
    r.classList.remove('on'); setTimeout(function () { r.remove(); }, reduce ? 0 : 350);
    var b = document.getElementById('lmLaunch'); if (b) b.focus();
    armAuto();
  }

  // ---------- frame loop: 30 fps cap, stops while hidden ----------
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 32) return;        // ~30 fps is plenty for a counter; saves power
    lastFrame = now;
    var dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    var ps = perSecUSD();
    earnedUSD += ps * dt;
    var has = !!feed() && ps > 0;
    el.empty.hidden = has;
    el.big.textContent = has ? show(earnedUSD, 'big') : '—';
    if (!reduce) el.secbar.style.transform = 'scaleX(' + ((Date.now() % 1000) / 1000).toFixed(3) + ')';
    if (clockOn) el.clock.textContent = new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
    drawBg(now, dt, ps);
  }
  function onVis() {
    if (!running) return;
    if (document.hidden) { cancelAnimationFrame(raf); }
    else {
      // money kept coming while the tab was away: credit the gap (capped at a day), then carry on
      var gap = Math.min(86400, (performance.now() - lastTick) / 1000);
      earnedUSD += perSecUSD() * gap; lastTick = performance.now();
      keepAwake(); raf = requestAnimationFrame(frame);
    }
  }

  // ---------- backgrounds ----------
  function resize() {
    if (!bg) return;
    dpr = Math.min(1.5, devicePixelRatio || 1);
    W = root.clientWidth; H = root.clientHeight;
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ledger.cells = null;
    drawBg(performance.now(), 0, perSecUSD(), true);
  }
  var ledger = { cells: null, lit: [], acc: 0 };
  function drawBg(now, dt, ps, force) {
    var id = THEMES[theme].id;
    if (id === 'minimal') { if (force) ctx.clearRect(0, 0, W, H); return; }
    if (reduce && !force) return;            // reduced motion: draw once, then only the numbers change
    ctx.clearRect(0, 0, W, H);
    if (id === 'flow') {
      // two broad, very slow waves (about a minute per cycle); gold at low alpha, no glow
      var t = reduce ? 0 : now / 1000;
      for (var k = 0; k < 2; k++) {
        var base = H * (0.62 + k * 0.1), amp = H * (0.07 - k * 0.02), ph = t * (0.1 + k * 0.04) + k * 1.7;
        var g = ctx.createLinearGradient(0, base - amp * 2, 0, H);
        g.addColorStop(0, 'rgba(226,178,89,' + (0.2 - k * 0.07) + ')'); g.addColorStop(1, 'rgba(226,178,89,0.02)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H);
        for (var x = 0; x <= W + 20; x += 20) ctx.lineTo(x, base + Math.sin(x / W * Math.PI * 2 + ph) * amp + Math.sin(x / W * Math.PI * 5 - ph * 0.7) * amp * 0.25);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      }
      return;
    }
    // ledger: a faint grid; each earned sat softly lights a cell (capped at 10 a second, so a big farm stays calm)
    var c = Math.max(22, Math.round(Math.min(W, H) / 26));
    if (!ledger.cells) { ledger.cells = { c: c, cols: Math.ceil(W / c), rows: Math.ceil(H / c) }; ledger.lit = []; }
    var L = ledger.cells;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= L.cols; i++) { ctx.moveTo(i * c + .5, 0); ctx.lineTo(i * c + .5, H); }
    for (var j = 0; j <= L.rows; j++) { ctx.moveTo(0, j * c + .5); ctx.lineTo(W, j * c + .5); }
    ctx.stroke();
    var bp = btcPrice();
    if (bp && dt) {
      var satsPerSec = ps / bp * 1e8, rate = Math.min(10, satsPerSec);
      ledger.acc += rate * dt;
      while (ledger.acc >= 1) { ledger.acc -= 1; ledger.lit.push({ x: (Math.random() * L.cols) | 0, y: (Math.random() * L.rows) | 0, a: 1 }); }
    }
    for (var q = ledger.lit.length - 1; q >= 0; q--) {
      var p = ledger.lit[q]; p.a -= dt / 2.5;
      if (p.a <= 0) { ledger.lit.splice(q, 1); continue; }
      ctx.fillStyle = 'rgba(226,178,89,' + (0.22 * p.a) + ')';
      ctx.fillRect(p.x * c + 1, p.y * c + 1, c - 1, c - 1);
    }
  }

  // ---------- stats, units, themes ----------
  function updateStats() {
    if (!running) return;
    var f = feed(), ps = perSecUSD();
    el.btc.textContent = f && f.bp ? new Intl.NumberFormat(LOC, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 }).format(f.bp) : '—';
    el.th.textContent = f && f.th ? num(f.th, f.th < 100 ? 1 : 0) + ' TH' : '—';
    el.disc.textContent = f && isFinite(f.disc) ? num(f.disc, 1) + (LANG === 'en' ? '%' : ' %') : '—';
    el.ps.textContent = ps ? show(ps, 'small') : '—';
    el.pm.textContent = ps ? show(ps * 60, 'small') : '—';
    el.ph.textContent = ps ? show(ps * 3600, 'small') : '—';
    el.pd.textContent = ps ? show(ps * 86400, 'small') : '—';
  }
  function applyUnit() {
    root.querySelectorAll('[data-unit]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-unit') === unit)); });
    updateStats();
  }
  function applyTheme() {
    THEMES.forEach(function (t) { root.classList.toggle('t-' + t.id, t === THEMES[theme]); });
    ledger.cells = null; ledger.lit = [];
    syncControls();
    if (ctx) drawBg(performance.now(), 0, perSecUSD(), true);
  }
  function applyStreaming() {
    root.classList.toggle('streaming', streaming);
    root.classList.toggle('vert', streaming && vert);
    root.classList.toggle('qr-off', !qrOn);
    resize();
  }
  function syncControls() {
    if (!root) return;
    root.querySelectorAll('[data-theme]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-theme') === theme)); });
    var set = function (act, on, label) { var b = root.querySelector('.lm-drawer [data-act="' + act + '"], .lm-bar [data-act="' + act + '"]'); if (!b) return; b.setAttribute('aria-pressed', String(!!on)); if (label) b.textContent = label; };
    set('clock', clockOn);
    set('stream', root.classList.contains('drawer'));
    set('fs', !!document.fullscreenElement);
    set('streamOn', streaming, streaming ? T('Streaming: on') : T('Streaming: off'));
    set('vert', vert);
    set('joins', joinsOn, joinsOn ? T('Joins: on') : T('Joins: off'));
    set('qr', qrOn, qrOn ? T('QR: on') : T('QR: off'));
    var rs = root.querySelector('[data-act="qrreset"]'); if (rs) rs.hidden = !qrCustom();
  }

  // ---------- input ----------
  function onClick(e) {
    var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.hasAttribute('data-theme')) { theme = +b.getAttribute('data-theme'); save(K.theme, THEMES[theme].id); applyTheme(); return; }
    if (b.hasAttribute('data-unit')) { unit = b.getAttribute('data-unit'); save(K.unit, unit); applyUnit(); return; }
    var a = b.getAttribute('data-act');
    if (a === 'close') close();
    else if (a === 'fs') toggleFs();
    else if (a === 'clock') { clockOn = !clockOn; save(K.clock, clockOn ? '1' : '0'); el.clock.hidden = !clockOn; syncControls(); }
    else if (a === 'stream') { root.classList.toggle('drawer'); syncControls(); }
    else if (a === 'streamOn') { streaming = !streaming; save(K.stream, streaming ? '1' : '0'); applyStreaming(); if (streaming) { if (chan) chatConnect(chan); if (tt) ttConnect(); } else { chatDisconnect(); ttDisconnect(); } syncControls(); }
    else if (a === 'vert') { vert = !vert; save(K.layout, vert ? 'vert' : 'wide'); applyStreaming(); syncControls(); }
    else if (a === 'joins') { joinsOn = !joinsOn; save(K.joins, joinsOn ? '1' : '0'); syncControls(); }
    else if (a === 'qr') { qrOn = !qrOn; save(K.qr + '_on', qrOn ? '1' : '0'); applyStreaming(); syncControls(); }
    else if (a === 'qrset') el.qrfile.click();
    else if (a === 'qrreset') { try { localStorage.removeItem(K.qr); } catch (x) {} qrApply(); syncControls(); }
  }
  function onChange(e) {
    if (e.target.matches('[data-act="auto"]')) { save(K.auto, e.target.value); return; }
    if (e.target === el.qrfile) { qrPick(e.target.files && e.target.files[0]); e.target.value = ''; }
  }
  function onKey(e) {
    if (!running) return;
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
    wake();
    if (e.key === 'Escape') { if (root.classList.contains('drawer')) { root.classList.remove('drawer'); syncControls(); } else if (!document.fullscreenElement) close(); e.stopPropagation(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'f') toggleFs();
    else if (k === 'u') { unit = unit === 'usd' ? 'sats' : 'usd'; save(K.unit, unit); applyUnit(); }
    else if (k === 't') { theme = (theme + 1) % THEMES.length; save(K.theme, THEMES[theme].id); applyTheme(); }
    else if (k === 'k') root.querySelector('[data-act="clock"]').click();
    else if (k === 's') root.querySelector('.lm-bar [data-act="stream"]').click();
    else if (k === 'v' && streaming) root.querySelector('[data-act="vert"]').click();
    else return;
    e.preventDefault();
  }
  function toggleFs() {
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    else { try { root.requestFullscreen().catch(function () {}); } catch (e) {} }
  }
  // cursor and controls hide after 3 s without input; any key, move or tap brings them back
  function wake() {
    if (!root) return;
    root.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(function () {
      if (!root || root.classList.contains('drawer') || (document.activeElement && root.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName))) return;
      root.classList.add('idle');
    }, 3000);
  }
  // burn-in protection: the whole layout moves a few pixels once a minute
  function drift() {
    clearInterval(driftT);
    driftT = setInterval(function () {
      if (!el.stage) return;
      var x = Math.round(Math.random() * 12 - 6), y = Math.round(Math.random() * 12 - 6);
      el.stage.style.translate = x + 'px ' + y + 'px';
    }, 60000);
  }
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.hidden || !running) return;
    navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {});
  }

  // ---------- auto-start on the console (off by default) ----------
  var autoT = 0;
  function armAuto() {
    clearTimeout(autoT);
    var mins = +load(K.auto, '0');
    if (!mins || running || document.hidden) return;
    autoT = setTimeout(function () {
      // only on a quiet console with a farm loaded, never over an open panel or dialog
      if (running || document.hidden || !feed() || document.querySelector('.sp-page[style*="flex"], .sp-page[style*="block"], [aria-modal="true"]:not([hidden])')) return armAuto();
      open({ auto: true });
    }, mins * 60000);
  }
  ['pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach(function (t) { addEventListener(t, function () { if (!running) armAuto(); }, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!running) armAuto(); });

  // ---------- QR ----------
  var qrOn = load(K.qr + '_on', '1') === '1';
  function qrCustom() { return load(K.qr, ''); }
  function qrApply() { if (el.qr) el.qr.src = qrCustom() || QR_DEFAULT; }
  // stored exactly as picked (no re-encode), so a QR keeps the sharpness it needs to scan
  function qrPick(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { sysMsg(T('That file isn’t an image.')); return; }
    if (file.size > QR_MAX) { sysMsg(T('QR image is too big. Keep it under 1.5 MB.')); return; }
    var r = new FileReader();
    r.onload = function () {
      try { localStorage.setItem(K.qr, r.result); } catch (e) { sysMsg(T('Couldn’t save that QR in this browser.')); return; }
      qrOn = true; save(K.qr + '_on', '1'); qrApply(); applyStreaming(); syncControls();
    };
    r.readAsDataURL(file);
  }

  // ---------- Twitch chat (read-only guest) ----------
  var chan = load(K.chan, ''), ws = null, wsChan = '', retry = 0, retryT = 0, twJoinedAt = 0, MAX_MSGS = 12, MSG_TTL = 45000;
  function setChannel(v) {
    v = String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/^[#@]/, '').replace(/[^a-z0-9_]/g, '');
    chan = v; save(K.chan, chan);
    var ci = root && root.querySelector('#lmChan'); if (ci) ci.value = chan;
    chatDisconnect(); if (el.chat) el.chat.innerHTML = '';
    if (chan && streaming) chatConnect(chan);
  }
  function chatDisconnect() { clearTimeout(retryT); wsChan = ''; if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; } }
  function chatConnect(c) {
    chatDisconnect(); wsChan = c;
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { return; }
    var sock = ws;
    sock.onopen = function () {
      retry = 0; twJoinedAt = Date.now();
      sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      sock.send('PASS SCHMOOPIIE'); sock.send('NICK justinfan' + (10000 + ((Math.random() * 80000) | 0))); sock.send('JOIN #' + c);
    };
    sock.onmessage = function (e) { String(e.data).split('\r\n').forEach(function (line) { if (line) handleIrc(line, sock); }); };
    sock.onclose = function () {
      if (ws !== sock || !running || wsChan !== c) return;
      retry = Math.min(retry + 1, 6);   // Twitch drops idle guest sockets now and then: back off and rejoin quietly
      retryT = setTimeout(function () { if (running && chan === c && streaming) chatConnect(c); }, 1000 * Math.pow(2, retry));
    };
  }
  function parseTags(raw) { var o = {}; raw.split(';').forEach(function (kv) { var i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1).replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\'); }); return o; }
  function handleIrc(line, sock) {
    if (line.indexOf('PING') === 0) { sock.send('PONG' + line.slice(4)); return; }
    var tags = {};
    if (line[0] === '@') { var sp = line.indexOf(' '); tags = parseTags(line.slice(1, sp)); line = line.slice(sp + 1); }
    var m = /^:(\S+) (\S+) (\S+)(?: :(.*))?$/.exec(line); if (!m) return;
    var cmd = m[2];
    if (cmd === 'JOIN' && /^justinfan/.test(m[1])) sysMsg(T('Connected to #{0}', m[3].slice(1)));
    else if (cmd === 'JOIN') { if (Date.now() - twJoinedAt > 15000) queueJoin(m[1].split('!')[0], 'tw'); }   // skip the chatter dump on connect
    else if (cmd === 'NOTICE' && m[4]) sysMsg(m[4]);
    else if (cmd === 'PRIVMSG' && m[4] != null) {
      var user = tags['display-name'] || m[1].split('!')[0], text = m[4], action = false;
      var am = /^\x01ACTION (.*)\x01$/.exec(text); if (am) { text = am[1]; action = true; }
      addMsg(user, tags.color || nameColor(user), renderEmotes(text, tags.emotes), action, 'tw');
    } else if (cmd === 'USERNOTICE' && tags['system-msg']) sysMsg(tags['system-msg']);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // emote ranges count code points, not UTF-16 units
  function renderEmotes(text, spec) {
    var cps = Array.from(text); if (!spec) return esc(text);
    var ranges = [];
    spec.split('/').forEach(function (e) { var p = e.split(':'); if (p.length < 2) return; p[1].split(',').forEach(function (r) { var ab = r.split('-'); ranges.push({ id: p[0], a: +ab[0], b: +ab[1] }); }); });
    ranges.sort(function (x, y) { return x.a - y.a; });
    var out = '', i = 0;
    ranges.forEach(function (r) {
      if (r.a < i) return;
      out += esc(cps.slice(i, r.a).join(''));
      out += '<img alt="' + esc(cps.slice(r.a, r.b + 1).join('')) + '" src="https://static-cdn.jtvnw.net/emoticons/v2/' + encodeURIComponent(r.id) + '/default/dark/2.0">';
      i = r.b + 1;
    });
    return out + esc(cps.slice(i).join(''));
  }
  var PALETTE = ['#FF7A59', '#F7D88A', '#7FD1FF', '#B98CFF', '#6BE39A', '#FF8FC8', '#5EE0D2', '#E2B259'];
  function nameColor(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; }
  function readable(hex) {   // Twitch's dark default colours vanish on black: lift anything too dark
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#F7D88A';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l >= 110) return '#' + m[1];
    var k = 110 / Math.max(l, 1), mix = function (c) { return Math.min(255, Math.round(c * k + 40)); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }
  function pushMsg(node, ttl) {
    var box = el.chat; if (!box) return;
    box.appendChild(node);
    while (box.children.length > MAX_MSGS) box.removeChild(box.firstChild);
    setTimeout(function () { node.classList.add('old'); setTimeout(function () { node.remove(); }, 1300); }, ttl || MSG_TTL);
  }
  var joinsOn = load(K.joins, '1') === '1', joinQ = { tw: [], tt: [] }, joinT = 0;
  function queueJoin(user, src) { if (!joinsOn || !user) return; if (joinQ[src].indexOf(user) < 0) joinQ[src].push(user); if (!joinT) joinT = setTimeout(flushJoins, 1500); }
  function flushJoins() {
    joinT = 0;
    ['tt', 'tw'].forEach(function (src) {
      var q = joinQ[src]; joinQ[src] = []; if (!q.length) return;
      var d = document.createElement('div'); d.className = 'lm-msg join';
      var who = q.length <= 2 ? q.map(function (u) { return '<b style="color:' + readable(nameColor(u)) + '">' + esc(u) + '</b>'; }).join(' & ')
        : T('{0} & {1} others', '<b style="color:' + readable(nameColor(q[0])) + '">' + esc(q[0]) + '</b>', q.length - 1);
      d.innerHTML = srcTag(src) + T('{0} joined', who);
      pushMsg(d, 15000);
    });
  }
  function srcTag(src) { return src && chan && tt ? '<span class="lm-src ' + src + '">' + (src === 'tw' ? 'T' : '♪') + '</span>' : ''; }
  function addMsg(user, color, html, action, src, cls) {
    var d = document.createElement('div'); d.className = 'lm-msg' + (cls ? ' ' + cls : '');
    var c = readable(color);
    d.innerHTML = srcTag(src) + '<b style="color:' + c + '">' + esc(user) + '</b>' + (action ? '<i style="color:' + c + '">' + html + '</i>' : html);
    pushMsg(d);
  }
  function sysMsg(t) { var d = document.createElement('div'); d.className = 'lm-msg sys'; d.textContent = t; pushMsg(d); }

  // ---------- TikTok chat (via the local helper) ----------
  var tt = load(K.tt, ''), tws = null, ttRetry = 0, ttRetryT = 0, ttWarned = false;
  function setTikTok(v) {
    v = String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '').replace(/^@/, '').replace(/[^a-z0-9._]/g, '');
    tt = v; save(K.tt, tt);
    var ti = root && root.querySelector('#lmTt'); if (ti) ti.value = tt ? '@' + tt : '';
    ttDisconnect(); ttWarned = false;
    if (tt && streaming) ttConnect();
  }
  function ttDisconnect() { clearTimeout(ttRetryT); if (tws) { tws.onclose = null; try { tws.close(); } catch (e) {} tws = null; } }
  function ttConnect() {
    ttDisconnect();
    var sock; try { sock = new WebSocket(TT_BRIDGE); } catch (e) { return; }
    tws = sock;
    sock.onopen = function () { ttRetry = 0; ttWarned = false; sock.send(JSON.stringify({ join: tt })); };
    sock.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'chat') addMsg(m.user, nameColor(m.user), esc(m.text || ''), false, 'tt');
      else if (m.type === 'gift') addMsg(m.user, nameColor(m.user), T('sent {0}', '<em>' + esc(m.gift) + (m.count > 1 ? ' ×' + (+m.count) : '') + '</em>'), false, 'tt', 'gift');
      else if (m.type === 'join') queueJoin(m.user, 'tt');
      else if (m.type === 'follow') addMsg(m.user, nameColor(m.user), '<em>' + T('followed') + '</em>', false, 'tt');
      else if (m.type === 'sys') sysMsg(m.text);
    };
    sock.onclose = function () {
      if (tws !== sock || !running || !tt || !streaming) return;
      if (!ttWarned) { ttWarned = true; sysMsg(T('TikTok helper not running. Start it on this PC (npm start in tiktok-chat-bridge).')); }
      ttRetry = Math.min(ttRetry + 1, 5);
      ttRetryT = setTimeout(function () { if (running && tt && streaming) ttConnect(); }, 1000 * Math.pow(2, ttRetry));
    };
  }

  // ---------- launch button (shipped in console/index.html as #lmLaunch) ----------
  function mount() {
    var b = document.getElementById('lmLaunch');
    if (b) b.onclick = function () { open(); };
    armAuto();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.GMTLiveMeter = { open: open, close: close };
  window.openStreamMode = open;   // old name, kept for any saved link or script that still calls it
})();
