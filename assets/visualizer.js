/* GMT Optimizer — stream mode visualizer.
   ========================================
   A full-screen, screensaver-style view of the farm's earnings, built to sit on screen while
   talking about GoMining on a stream. It reads window._vizFeed, which app.js publishes from the
   same composed figure as the Daily Net Profit hero card (mining + staking + ambassador + greedy),
   so the per-second ticker never disagrees with the console behind it.

   Every "spark" in a scene is one unit of real earnings. The unit is picked per farm so a spark
   lands roughly every half-second to two seconds: a small farm sparks per tenth of a cent, a big
   one per dime. The legend in the HUD says what a spark is worth.

   Twitch chat: type a channel into the Chat field and its chat is read anonymously over Twitch's
   public IRC websocket (a justinfan guest login, read-only, no account) and drawn as a transparent
   column over the art, so it reads as part of the scene instead of a pasted-in embed box.

   QR: the corner QR defaults to the RINGO5 signup code (assets/stream-qr.png); "Change QR" swaps in
   any image the viewer picks, kept in this browser only, and "Reset QR" goes back to the default.

   TikTok chat: TikTok has no public chat feed a page can read, so the TikTok box talks to a small
   helper running on the streaming PC (~/tiktok-chat-bridge, ws://127.0.0.1:8787). Stream mode
   tells it which username to join and it forwards chat, gifts and follows. With both platforms
   set, each line carries a small platform badge.

   Layout: "TikTok 9:16" squeezes the whole scene into a centered portrait frame (sized off the
   stage via container units) for capturing into a vertical TikTok LIVE; a portrait phone starts in it.

   Keys: V wide/9:16 · 1-3 scene · H hide overlay · C chat · Q QR · F fullscreen · M session/today counter · Esc exit. */
(function () {
  'use strict';
  var SCENE_KEY = 'gmtopt_viz_scene_v1', MODE_KEY = 'gmtopt_viz_mode_v1', CHAN_KEY = 'gmtopt_viz_twitch_v1', TT_KEY = 'gmtopt_viz_tiktok_v1', TT_BRIDGE = 'ws://127.0.0.1:8787', QR_KEY = 'gmtopt_viz_qr_v1', LAYOUT_KEY = 'gmtopt_viz_layout_v1';
  var QR_DEFAULT = '/assets/stream-qr.png?v=1', QR_MAX = 1.5e6;
  var SCENES = [
    { id: 'nebula', name: 'Nebula' },
    { id: 'flow', name: 'Silk' },
    { id: 'rain', name: 'Hash Rain' }
  ];
  var SYMS = { USD: '$', GBP: '£', EUR: '€' };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- styles ---------- */
  var css = [
    '.viz-launch{display:inline-flex;align-items:center;gap:8px;margin-top:.7rem;padding:.5rem .95rem;border-radius:999px;border:1px solid rgba(245,166,35,.45);background:linear-gradient(135deg,rgba(245,166,35,.14),rgba(255,138,61,.06));color:#FFCF7A;font:600 .8rem/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s}',
    '.viz-launch:hover{transform:translateY(-1px);border-color:#F5A623;box-shadow:0 0 22px rgba(245,166,35,.28)}',
    '.viz-launch .viz-dot{width:7px;height:7px;border-radius:50%;background:#F5A623;box-shadow:0 0 10px #F5A623;animation:vizPulse 1.6s ease-in-out infinite}',
    '@keyframes vizPulse{50%{opacity:.35;transform:scale(.7)}}',
    '#vizRoot{position:fixed;inset:0;z-index:2147483000;background:#040508;color:#FFF4E0;font-family:"Space Grotesk",system-ui,sans-serif;overflow:hidden;opacity:0;transition:opacity .45s ease}',
    '#vizRoot.on{opacity:1}',
    '#vizRoot canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '#vizRoot .vz-hud{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(16px,3.2cqw,44px);transition:opacity .5s}',
    '#vizRoot.hud-off .vz-hud{opacity:0}',
    '.vz-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}',
    '.vz-label{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.62rem,1.1cqw,.8rem);letter-spacing:.28em;text-transform:uppercase;color:rgba(255,207,122,.72)}',
    '.vz-big{font-weight:700;font-size:clamp(2.3rem,7.4cqw,6.4rem);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#FFF4E0 10%,#FFC65A 60%,#F5A623);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 28px rgba(245,166,35,.35));margin-top:.35rem;white-space:nowrap}',
    '.vz-big small{font-size:.42em;opacity:.8}',
    '.vz-rates{display:flex;flex-wrap:wrap;gap:clamp(10px,2cqw,28px);margin-top:1rem}',
    '.vz-rate{min-width:0}',
    '.vz-rate b{display:block;font-weight:600;font-size:clamp(1rem,2.1cqw,1.7rem);font-variant-numeric:tabular-nums;color:#FFF4E0}',
    '.vz-rate span{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.58rem,.95cqw,.72rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(255,244,224,.5)}',
    '.vz-rate.hot b{color:#FFC65A;text-shadow:0 0 18px rgba(245,166,35,.55)}',
    '.vz-chips{display:flex;flex-direction:column;align-items:flex-end;gap:8px;text-align:right}',
    '.vz-chip{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.66rem,1.05cqw,.82rem);letter-spacing:.08em;padding:.38rem .7rem;border-radius:8px;background:rgba(10,12,18,.55);border:1px solid rgba(245,166,35,.22);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);white-space:nowrap}',
    '.vz-chip i{font-style:normal;color:rgba(255,244,224,.5);margin-right:.45em}',
    '.vz-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}',
    '.vz-legend{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.6rem,1cqw,.78rem);color:rgba(255,244,224,.55);letter-spacing:.1em}',
    '.vz-legend em{font-style:normal;color:#FFC65A}',
    '.vz-brandrow{display:flex;align-items:flex-end;gap:clamp(10px,1.4cqw,18px)}',
    '.vz-qr{width:clamp(84px,10cqw,148px);aspect-ratio:1;border-radius:12px;overflow:hidden;background:#000;border:1px solid rgba(245,166,35,.45);box-shadow:0 0 28px rgba(245,166,35,.18);flex:none}',
    '.vz-qr img{width:100%;height:100%;object-fit:contain;display:block}',
    '#vizRoot.qr-off .vz-qr{display:none}',
    '.vz-qrcap{display:block;margin-top:.35rem;color:#FFC65A}',
    '.vz-brand{text-align:right;font-family:"Share Tech Mono",ui-monospace,monospace;letter-spacing:.14em;font-size:clamp(.66rem,1.1cqw,.86rem);color:rgba(255,244,224,.7)}',
    '.vz-brand strong{display:block;font-family:"Space Grotesk",system-ui,sans-serif;font-size:clamp(.95rem,1.7cqw,1.35rem);letter-spacing:.02em;color:#FFF4E0}',
    '.vz-brand strong span{color:#F5A623}',
    '.vz-bar{position:absolute;left:50%;bottom:clamp(16px,3vw,36px);transform:translateX(-50%);display:flex;gap:6px;padding:6px;border-radius:14px;background:rgba(10,12,18,.72);border:1px solid rgba(255,244,224,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity .4s,transform .4s;z-index:2}',
    '#vizRoot.idle .vz-bar{opacity:0;transform:translate(-50%,12px);pointer-events:none}',
    '#vizRoot.idle{cursor:none}',
    '.vz-bar button{border:0;background:transparent;color:rgba(255,244,224,.75);font:600 .76rem/1 "Space Grotesk",system-ui,sans-serif;padding:.55rem .8rem;border-radius:9px;cursor:pointer;white-space:nowrap}',
    '.vz-bar button:hover{background:rgba(255,244,224,.08);color:#FFF4E0}',
    '.vz-bar button.act{background:rgba(245,166,35,.18);color:#FFC65A}',
    '.vz-bar .sep{width:1px;background:rgba(255,244,224,.12);margin:4px 2px}',
    '.vz-chat{position:absolute;right:clamp(16px,3.2cqw,44px);top:30%;bottom:max(20%,calc(clamp(84px,10cqw,148px) + 70px));width:min(380px,32cqw);display:flex;flex-direction:column;justify-content:flex-end;gap:6px;overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%);mask-image:linear-gradient(180deg,transparent,#000 22%);z-index:1}',
    '#vizRoot.chat-off .vz-chat{display:none}',
    '.vz-msg{font-size:clamp(.82rem,1.15cqw,1rem);line-height:1.4;padding:.45rem .7rem;border-radius:10px;background:rgba(6,7,11,.58);border:1px solid rgba(255,244,224,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#FFF4E0;word-wrap:break-word;overflow-wrap:anywhere;animation:vzIn .35s ease-out;transition:opacity 1.2s}',
    '.vz-msg.old{opacity:0}',
    '.vz-msg b{font-weight:700;margin-right:.35em}',
    '.vz-msg img{height:1.5em;vertical-align:middle;margin:-.2em .05em}',
    '.vz-msg.sys{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,207,122,.75);background:rgba(6,7,11,.4)}',
    '@keyframes vzIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}',
    '.vz-chan{display:flex;align-items:center;gap:4px;padding-left:6px}',
    '.vz-chan input{width:120px;background:rgba(255,244,224,.06);border:1px solid rgba(255,244,224,.14);border-radius:8px;color:#FFF4E0;font:500 .76rem/1 "Space Grotesk",system-ui,sans-serif;padding:.5rem .55rem;outline:none}',
    '.vz-chan input:focus{border-color:#9146FF}',
    '.vz-chan .tw{color:#BF94FF;font-weight:700;font-size:.72rem}',
    '.vz-chan .tt{color:#25F4EE;font-weight:700;font-size:.72rem}',
    '.vz-chan input.tti:focus{border-color:#FE2C55}',
    '.vz-src{display:inline-block;width:1.25em;height:1.25em;border-radius:4px;margin-right:.4em;vertical-align:-.2em;font:800 .72em/1.25em "Space Grotesk",system-ui,sans-serif;text-align:center;color:#fff}',
    '.vz-src.tw{background:#9146FF}',
    '.vz-src.tt{background:linear-gradient(135deg,#25F4EE,#FE2C55);color:#000}',
    '.vz-msg.gift{border-color:rgba(245,166,35,.5);background:linear-gradient(135deg,rgba(245,166,35,.2),rgba(6,7,11,.6))}',
    '.vz-msg.gift em{font-style:normal;color:#FFC65A;font-weight:600}',
    '.vz-stage{position:absolute;inset:0;overflow:hidden;background:#040508;container:vzstage/size}',
    '#vizRoot.vert{background:#000}',
    '#vizRoot.vert .vz-stage{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);height:min(100vh,177.78vw);aspect-ratio:9/16}',
    '@container vzstage (max-width:640px){.vz-chat{left:16px;right:16px;width:auto;top:auto;bottom:230px;height:24cqh}.vz-brandrow{flex-direction:row-reverse}.vz-top{flex-direction:column}.vz-chips{flex-direction:row;flex-wrap:wrap;align-items:flex-start;text-align:left}.vz-bottom{flex-direction:column;align-items:flex-start;padding-bottom:64px}.vz-brand{text-align:left}}',
    '@media (max-width:640px){.vz-chan input{width:90px}.vz-bar{max-width:calc(100% - 32px);overflow-x:auto}.vz-bar button{padding:.5rem .6rem}}',
    /* 9:16. TikTok draws its own header over the top ~11% and its comments/gift strip over the
       bottom ~25% of a LIVE, so the numbers and the QR sit in the band between. */
    '#vizRoot.vert .vz-hud{justify-content:flex-start;gap:3.2cqh;padding:11cqh 6cqw 0}',
    '#vizRoot.vert .vz-top{flex-direction:column;align-items:center;text-align:center;gap:2.4cqh}',
    '#vizRoot.vert .vz-label{font-size:2.6cqw}',
    '#vizRoot.vert .vz-big{font-size:12.5cqw;margin-top:1cqh}',
    '#vizRoot.vert .vz-rates{display:grid;grid-template-columns:1fr 1fr;gap:1.6cqh 8cqw;justify-items:center;margin-top:2.4cqh}',
    '#vizRoot.vert .vz-rate b{font-size:5.6cqw}',
    '#vizRoot.vert .vz-rate span{font-size:2.3cqw}',
    '#vizRoot.vert .vz-chips{flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:center;text-align:center;gap:1.6cqw}',
    '#vizRoot.vert .vz-chip{font-size:2.5cqw;padding:.8cqh 2.2cqw}',
    '#vizRoot.vert .vz-bottom{flex-direction:column-reverse;align-items:center;gap:1.4cqh;padding-bottom:0}',
    '#vizRoot.vert .vz-brandrow{flex-direction:row-reverse;align-items:center;gap:4cqw}',
    '#vizRoot.vert .vz-brand{text-align:left;font-size:2.7cqw}',
    '#vizRoot.vert .vz-brand strong{font-size:5cqw}',
    '#vizRoot.vert .vz-qr{width:22cqw}',
    '#vizRoot.vert .vz-legend{text-align:center;font-size:2.3cqw}',
    '#vizRoot.vert .vz-chat{left:6cqw;right:6cqw;width:auto;top:auto;bottom:4cqh;height:22cqh}',
    '#vizRoot.vert .vz-msg{font-size:3.3cqw}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- formatting ---------- */
  function feed() { return window._vizFeed || null; }
  function sym(f) { return SYMS[f && f.cur] || '$'; }
  function money(usd, d, f) {
    f = f || feed(); var v = usd * ((f && f.fx) || 1);
    return (v < 0 ? '-' : '') + sym(f) + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // Decimals scale with the size of the number so a per-second figure is never "$0.00".
  function autoDec(usdAbs, f) {
    var v = usdAbs * ((f && f.fx) || 1);
    if (v >= 1000) return 2; if (v >= 1) return 4; if (v >= 0.01) return 5; if (v >= 0.0001) return 6; return 8;
  }

  /* ---------- launch button ---------- */
  function mountButton() {
    var head = document.querySelector('#tab-current .sec-head');
    if (!head || document.getElementById('vizLaunch')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'vizLaunch'; b.className = 'viz-launch';
    b.innerHTML = '<span class="viz-dot"></span>Stream mode';
    b.title = 'Full-screen live earnings visualizer for streaming';
    b.onclick = open;
    head.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton); else mountButton();

  /* ---------- overlay state ---------- */
  var root, cvs, ctx, W = 0, H = 0, DPR = 1, raf = 0, running = false;
  var sceneIdx = Math.max(0, SCENES.findIndex(function (s) { return s.id === load(SCENE_KEY, 'nebula'); }));
  var mode = load(MODE_KEY, 'session');          // 'session' | 'today'
  var sessionUSD = 0, lastT = 0, unitUSD = 0.001, unitAcc = 0, idleTimer = 0;
  var el = {};
  var scene = null;

  function pickUnit(perSecUSD) {
    // Aim for ~1 spark/sec: the power of ten nearest the per-second income, clamped.
    if (!(perSecUSD > 0)) return 0.001;
    var u = Math.pow(10, Math.round(Math.log10(perSecUSD)));
    return Math.min(10, Math.max(0.00001, u));
  }

  function open() {
    if (running) return;
    root = document.createElement('div'); root.id = 'vizRoot';
    if (vert) root.className = 'vert';   // before the first resize, so the canvas starts at the frame's size
    root.innerHTML =
      '<div class="vz-stage" id="vzStage">' +
      '<canvas></canvas>' +
      '<div class="vz-hud">' +
        '<div class="vz-top">' +
          '<div>' +
            '<div class="vz-label" id="vzLabel">Earned this session</div>' +
            '<div class="vz-big" id="vzBig">--</div>' +
            '<div class="vz-rates">' +
              '<div class="vz-rate hot"><b id="vzSec">--</b><span>per second</span></div>' +
              '<div class="vz-rate"><b id="vzMin">--</b><span>per minute</span></div>' +
              '<div class="vz-rate"><b id="vzHr">--</b><span>per hour</span></div>' +
              '<div class="vz-rate"><b id="vzDay">--</b><span>per day</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="vz-chips">' +
            '<div class="vz-chip"><i>BTC</i><span id="vzBtc">--</span></div>' +
            '<div class="vz-chip"><i>HASHRATE</i><span id="vzTh">--</span></div>' +
            '<div class="vz-chip"><i>SATS/MIN</i><span id="vzSats">--</span></div>' +
            '<div class="vz-chip"><i>DISCOUNT</i><span id="vzDisc">--</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="vz-bottom">' +
          '<div class="vz-legend" id="vzLegend"></div>' +
          '<div class="vz-brandrow">' +
            '<div class="vz-brand"><strong>gmt-optimizer<span>.com</span></strong>code RINGO5 · we fund your first TH<span class="vz-qrcap">scan to sign up →</span></div>' +
            '<div class="vz-qr"><img id="vzQrImg" alt="QR code"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="vz-chat" id="vzChat"></div>' +
      '</div>' +
      '<div class="vz-bar" id="vzBar"></div>';
    document.body.appendChild(root);
    cvs = root.querySelector('canvas'); ctx = cvs.getContext('2d');
    ['vzLabel', 'vzBig', 'vzSec', 'vzMin', 'vzHr', 'vzDay', 'vzBtc', 'vzTh', 'vzSats', 'vzDisc', 'vzLegend', 'vzBar', 'vzChat', 'vzStage', 'vzQrImg'].forEach(function (id) { el[id] = document.getElementById(id); });
    buildBar();
    document.documentElement.style.overflow = 'hidden';
    resize(); setScene(sceneIdx);
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousemove', wake); root.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('gm:viz', onFeed);
    sessionUSD = 0; unitAcc = 0; lastT = performance.now(); running = true;
    if (!chatOn) root.classList.add('chat-off');
    if (!qrOn) root.classList.add('qr-off');
    qrApply();
    if (chan) chatConnect(chan);
    if (tt) ttConnect();
    onFeed(); wake(); updateHud(true);
    requestAnimationFrame(function () { root.classList.add('on'); });
    raf = requestAnimationFrame(frame);
  }

  function close() {
    if (!running) return;
    running = false; cancelAnimationFrame(raf); clearTimeout(idleTimer);
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('gm:viz', onFeed);
    chatDisconnect();
    ttDisconnect();
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    document.documentElement.style.overflow = '';
    var r = root; r.classList.remove('on'); setTimeout(function () { r.remove(); }, 450);
    root = null; scene = null;
  }

  function buildBar() {
    var h = '';
    SCENES.forEach(function (s, i) { h += '<button data-scene="' + i + '">' + s.name + '</button>'; });
    h += '<span class="sep"></span>' +
      '<label class="vz-chan"><span class="tw">Twitch</span><input id="vzChanIn" placeholder="channel" spellcheck="false" autocomplete="off" maxlength="25"></label>' +
      '<label class="vz-chan"><span class="tt">TikTok</span><input id="vzTtIn" class="tti" placeholder="@username" spellcheck="false" autocomplete="off" maxlength="30"></label>' +
      '<button data-act="chat" id="vzChatBtn"></button>' +
      '<span class="sep"></span>' +
      '<button data-act="mode" id="vzModeBtn"></button>' +
      '<button data-act="qr" id="vzQrBtn"></button>' +
      '<button data-act="qrset">Change QR</button>' +
      '<button data-act="qrreset" id="vzQrReset">Reset QR</button>' +
      '<input type="file" accept="image/*" id="vzQrFile" hidden>' +
      '<span class="sep"></span>' +
      '<button data-act="vert" id="vzVertBtn"></button>' +
      '<button data-act="hud">Hide overlay</button>' +
      '<button data-act="fs">Fullscreen</button>' +
      '<button data-act="exit">Exit ✕</button>';
    el.vzBar.innerHTML = h;
    el.vzBar.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.scene != null) setScene(+b.dataset.scene);
      else if (b.dataset.act === 'mode') toggleMode();
      else if (b.dataset.act === 'chat') toggleChat();
      else if (b.dataset.act === 'qr') toggleQr();
      else if (b.dataset.act === 'qrset') document.getElementById('vzQrFile').click();
      else if (b.dataset.act === 'qrreset') qrReset();
      else if (b.dataset.act === 'hud') toggleHud(b);
      else if (b.dataset.act === 'vert') toggleVert();
      else if (b.dataset.act === 'fs') toggleFs();
      else if (b.dataset.act === 'exit') close();
    };
    document.getElementById('vzQrFile').addEventListener('change', function () { qrPick(this.files && this.files[0]); this.value = ''; });
    wireInput('vzChanIn', function () { return chan; }, setChannel);
    wireInput('vzTtIn', function () { return tt; }, setTikTok);
    syncBar();
  }
  // Keys typed into a channel box belong to the box, not to the scene shortcuts.
  function wireInput(id, get, set) {
    var ci = document.getElementById(id);
    ci.value = get();
    ci.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { set(ci.value); ci.blur(); }
      if (e.key === 'Escape') { ci.value = get(); ci.blur(); }
    });
    ci.addEventListener('change', function () { set(ci.value); });
    ci.addEventListener('focus', function () { clearTimeout(idleTimer); });
    ci.addEventListener('blur', wake);
  }
  function syncBar() {
    var vb = document.getElementById('vzVertBtn'); if (vb) { vb.textContent = 'TikTok 9:16'; vb.classList.toggle('act', vert); }
    var qb = document.getElementById('vzQrBtn'); if (qb) qb.textContent = qrOn ? 'QR: on' : 'QR: off';
    var qr = document.getElementById('vzQrReset'); if (qr) qr.hidden = !qrCustom();
    var cb = document.getElementById('vzChatBtn'); if (cb) cb.textContent = chatOn ? 'Chat: on' : 'Chat: off';
    if (!el.vzBar) return;
    el.vzBar.querySelectorAll('[data-scene]').forEach(function (b) { b.classList.toggle('act', +b.dataset.scene === sceneIdx); });
    var mb = document.getElementById('vzModeBtn'); if (mb) mb.textContent = mode === 'today' ? 'Counter: today' : 'Counter: session';
    var hb = el.vzBar.querySelector('[data-act="hud"]'); if (hb) hb.textContent = root && root.classList.contains('hud-off') ? 'Show overlay' : 'Hide overlay';
  }
  function toggleMode() { mode = mode === 'today' ? 'session' : 'today'; save(MODE_KEY, mode); syncBar(); updateHud(true); }
  // With no saved choice, a phone held upright starts in 9:16 and everything else starts wide.
  var vert = (function () { var v = load(LAYOUT_KEY, ''); return v ? v === 'vert' : window.innerHeight > window.innerWidth; })();
  function toggleVert() {
    vert = !vert; save(LAYOUT_KEY, vert ? 'vert' : 'wide');
    root.classList.toggle('vert', vert);
    resize(); setScene(sceneIdx);
  }
  function toggleHud() { root.classList.toggle('hud-off'); syncBar(); }
  function toggleFs() {
    try { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen(); } catch (e) {}
  }
  function onKey(e) {
    if (e.key === 'Escape' && !document.fullscreenElement) { close(); return; }
    var k = e.key.toLowerCase();
    if (k >= '1' && k <= String(SCENES.length)) setScene(+k - 1);
    else if (k === 'h') toggleHud();
    else if (k === 'v') toggleVert();
    else if (k === 'f') toggleFs();
    else if (k === 'm') toggleMode();
    else if (k === 'c') toggleChat();
    else if (k === 'q') toggleQr();
    else return;
    wake();
  }
  function wake() {
    if (!root) return;
    root.classList.remove('idle'); clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (root && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.vz-chan'))) root.classList.add('idle');
    }, 2600);
  }

  function onFeed() {
    var f = feed(); if (!f) return;
    unitUSD = pickUnit(f.daily / 86400);
    var d = unitUSD >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(unitUSD * (f.fx || 1)) - 1e-9));
    if (el.vzLegend) el.vzLegend.innerHTML = 'each spark = <em>' + money(unitUSD, Math.min(d, 6), f) + '</em> earned · live from your console';
  }

  function resize() {
    if (!cvs) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = el.vzStage.clientWidth || window.innerWidth; H = el.vzStage.clientHeight || window.innerHeight;
    cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (scene && scene.resize) scene.resize();
  }

  function setScene(i) {
    sceneIdx = (i + SCENES.length) % SCENES.length;
    save(SCENE_KEY, SCENES[sceneIdx].id);
    scene = MAKERS[SCENES[sceneIdx].id]();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#040508'; ctx.fillRect(0, 0, W, H);
    syncBar();
  }

  /* ---------- HUD ---------- */
  var hudT = 0;
  function todayUSD(f) {
    var n = new Date(), m = new Date(n); m.setHours(0, 0, 0, 0);
    return f.daily * ((n - m) / 86400000);
  }
  function updateHud(force) {
    var f = feed(); if (!f || !el.vzBig) return;
    var perSec = f.daily / 86400;
    var total = mode === 'today' ? todayUSD(f) : sessionUSD;
    el.vzLabel.textContent = mode === 'today' ? 'Earned today so far' : 'Earned this session';
    var dec = autoDec(Math.max(Math.abs(total), Math.abs(perSec) * 60), f);
    el.vzBig.textContent = money(total, dec, f);
    var now = performance.now();
    if (!force && now - hudT < 500) return;
    hudT = now;
    el.vzSec.textContent = money(perSec, autoDec(Math.abs(perSec), f), f);
    el.vzMin.textContent = money(perSec * 60, autoDec(Math.abs(perSec * 60), f), f);
    el.vzHr.textContent = money(perSec * 3600, 2, f);
    el.vzDay.textContent = money(f.daily, 2, f);
    el.vzBtc.textContent = f.bp > 0 ? money(f.bp, 0, f) : '--';
    el.vzTh.textContent = (f.th || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' TH';
    var satsMin = (f.btcDay || 0) * 1e8 / 1440;
    el.vzSats.textContent = satsMin.toLocaleString(undefined, { maximumFractionDigits: satsMin < 10 ? 2 : 0 });
    el.vzDisc.textContent = (+f.disc || 0).toFixed(1) + '%';
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    var f = feed(), perSec = f ? Math.max(0, f.daily / 86400) : 0;
    sessionUSD += perSec * dt;
    unitAcc += perSec * dt;
    var sparks = 0;
    while (unitAcc >= unitUSD && sparks < 20) { unitAcc -= unitUSD; sparks++; }
    if (sparks >= 20) unitAcc = 0;
    if (scene) scene.step(dt, now / 1000, sparks);
    updateHud(false);
    raf = requestAnimationFrame(frame);
  }

  /* ---------- QR code ---------- */
  var qrOn = load(QR_KEY + '_on', '1') === '1';
  function qrCustom() { return load(QR_KEY, ''); }
  function qrApply() { if (el.vzQrImg) el.vzQrImg.src = qrCustom() || QR_DEFAULT; }
  function toggleQr() {
    qrOn = !qrOn; save(QR_KEY + '_on', qrOn ? '1' : '0');
    if (root) root.classList.toggle('qr-off', !qrOn);
    syncBar();
  }
  // Stored exactly as picked (no re-encode), so a QR never loses the sharpness it needs to scan.
  function qrPick(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { sysMsg('That file isn\u2019t an image.'); return; }
    if (file.size > QR_MAX) { sysMsg('QR image is too big \u2014 keep it under 1.5 MB.'); return; }
    var r = new FileReader();
    r.onload = function () {
      try { localStorage.setItem(QR_KEY, r.result); } catch (e) { sysMsg('Couldn\u2019t save that QR in this browser.'); return; }
      if (!qrOn) toggleQr();
      qrApply(); syncBar();
    };
    r.readAsDataURL(file);
  }
  function qrReset() { try { localStorage.removeItem(QR_KEY); } catch (e) {} qrApply(); syncBar(); }

  /* ---------- twitch chat ---------- */
  var chan = load(CHAN_KEY, ''), chatOn = load(CHAN_KEY + '_on', '1') === '1';
  var ws = null, wsChan = '', retry = 0, retryT = 0;
  var MAX_MSGS = 14, MSG_TTL = 45000;

  function toggleChat() {
    chatOn = !chatOn; save(CHAN_KEY + '_on', chatOn ? '1' : '0');
    if (root) root.classList.toggle('chat-off', !chatOn);
    syncBar();
  }
  function setChannel(v) {
    v = String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/^[#@]/, '').replace(/[^a-z0-9_]/g, '');
    if (v === chan && ws) return;
    chan = v; save(CHAN_KEY, chan);
    var ci = document.getElementById('vzChanIn'); if (ci) ci.value = chan;
    chatDisconnect();
    if (el.vzChat) el.vzChat.innerHTML = '';
    if (chan) {
      if (!chatOn) toggleChat();
      chatConnect(chan);
    }
  }
  function chatDisconnect() {
    clearTimeout(retryT); wsChan = '';
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; }
  }
  function chatConnect(c) {
    chatDisconnect(); wsChan = c;
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); } catch (e) { return; }
    var sock = ws;
    sock.onopen = function () {
      retry = 0;
      sock.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      sock.send('PASS SCHMOOPIIE');
      sock.send('NICK justinfan' + (10000 + ((Math.random() * 80000) | 0)));
      sock.send('JOIN #' + c);
    };
    sock.onmessage = function (e) {
      String(e.data).split('\r\n').forEach(function (line) { if (line) handleIrc(line, sock); });
    };
    sock.onclose = function () {
      if (ws !== sock || !running || wsChan !== c) return;
      // Twitch drops idle guest sockets now and then; back off and rejoin quietly.
      retry = Math.min(retry + 1, 6);
      retryT = setTimeout(function () { if (running && chan === c) chatConnect(c); }, 1000 * Math.pow(2, retry));
    };
  }
  function parseTags(raw) {
    var o = {};
    raw.split(';').forEach(function (kv) { var i = kv.indexOf('='); o[kv.slice(0, i)] = kv.slice(i + 1).replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\'); });
    return o;
  }
  function handleIrc(line, sock) {
    if (line.indexOf('PING') === 0) { sock.send('PONG' + line.slice(4)); return; }
    var tags = {};
    if (line[0] === '@') { var sp = line.indexOf(' '); tags = parseTags(line.slice(1, sp)); line = line.slice(sp + 1); }
    var m = /^:(\S+) (\S+) (\S+)(?: :(.*))?$/.exec(line);
    if (!m) return;
    var cmd = m[2];
    if (cmd === 'JOIN' && /^justinfan/.test(m[1])) sysMsg('Connected to #' + m[3].slice(1));
    else if (cmd === 'NOTICE' && m[4]) sysMsg(m[4]);
    else if (cmd === 'PRIVMSG' && m[4] != null) {
      var user = tags['display-name'] || m[1].split('!')[0];
      var text = m[4], action = false;
      var am = /^\x01ACTION (.*)\x01$/.exec(text); if (am) { text = am[1]; action = true; }
      addMsg(user, tags.color || nameColor(user), renderEmotes(text, tags.emotes), action, 'tw');
    } else if (cmd === 'USERNOTICE' && tags['system-msg']) sysMsg(tags['system-msg']);
  }
  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Emote ranges count code points, not UTF-16 units, so an emoji earlier in the line would shift a string-index slice.
  function renderEmotes(text, spec) {
    var cps = Array.from(text);
    if (!spec) return esc(text);
    var ranges = [];
    spec.split('/').forEach(function (e) {
      var p = e.split(':'); if (p.length < 2) return;
      p[1].split(',').forEach(function (r) { var ab = r.split('-'); ranges.push({ id: p[0], a: +ab[0], b: +ab[1] }); });
    });
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
  var PALETTE = ['#FF7A59', '#FFC65A', '#7FD1FF', '#B98CFF', '#6BE39A', '#FF8FC8', '#5EE0D2', '#F5A623'];
  function nameColor(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0; return PALETTE[Math.abs(h) % PALETTE.length]; }
  // Twitch's default dark blues vanish on a black canvas; lift anything too dark.
  function readable(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#FFC65A';
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    var l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (l >= 110) return '#' + m[1];
    var k = 110 / Math.max(l, 1), mix = function (c) { return Math.min(255, Math.round(c * k + 40)); };
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }
  function pushMsg(node) {
    var box = el.vzChat; if (!box) return;
    box.appendChild(node);
    while (box.children.length > MAX_MSGS) box.removeChild(box.firstChild);
    setTimeout(function () { node.classList.add('old'); setTimeout(function () { node.remove(); }, 1300); }, MSG_TTL);
  }
  // The platform badge only earns its space when two chats are mixed together.
  function srcTag(src) { return src && chan && tt ? '<span class="vz-src ' + src + '">' + (src === 'tw' ? 'T' : '\u266a') + '</span>' : ''; }
  function addMsg(user, color, html, action, src, cls) {
    var d = document.createElement('div'); d.className = 'vz-msg' + (cls ? ' ' + cls : '');
    var c = readable(color);
    d.innerHTML = srcTag(src) + '<b style="color:' + c + '">' + esc(user) + '</b>' + (action ? '<i style="color:' + c + '">' + html + '</i>' : html);
    pushMsg(d);
  }
  function sysMsg(t) { var d = document.createElement('div'); d.className = 'vz-msg sys'; d.textContent = t; pushMsg(d); }

  /* ---------- tiktok chat (via the local bridge) ---------- */
  var tt = load(TT_KEY, ''), tws = null, ttRetry = 0, ttRetryT = 0, ttWarned = false;
  function setTikTok(v) {
    v = String(v || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, '').replace(/\/.*$/, '').replace(/^@/, '').replace(/[^a-z0-9._]/g, '');
    if (v === tt && tws) return;
    tt = v; save(TT_KEY, tt);
    var ci = document.getElementById('vzTtIn'); if (ci) ci.value = tt ? '@' + tt : '';
    ttDisconnect(); ttWarned = false;
    if (tt) { if (!chatOn) toggleChat(); ttConnect(); }
  }
  function ttDisconnect() {
    clearTimeout(ttRetryT);
    if (tws) { tws.onclose = null; try { tws.close(); } catch (e) {} tws = null; }
  }
  function ttConnect() {
    ttDisconnect();
    var sock;
    try { sock = new WebSocket(TT_BRIDGE); } catch (e) { return; }
    tws = sock;
    sock.onopen = function () { ttRetry = 0; ttWarned = false; sock.send(JSON.stringify({ join: tt })); };
    sock.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.type === 'chat') addMsg(m.user, nameColor(m.user), esc(m.text || ''), false, 'tt');
      else if (m.type === 'gift') addMsg(m.user, nameColor(m.user), 'sent <em>' + esc(m.gift) + (m.count > 1 ? ' ×' + (+m.count) : '') + '</em> 🎁', false, 'tt', 'gift');
      else if (m.type === 'follow') addMsg(m.user, nameColor(m.user), '<em>followed</em> ❤️', false, 'tt');
      else if (m.type === 'sys') sysMsg(m.text);
    };
    sock.onclose = function () {
      if (tws !== sock || !running || !tt) return;
      // Say it once, not on every retry: the helper usually just hasn't been started yet.
      if (!ttWarned) { ttWarned = true; sysMsg('TikTok helper not running — start it on this PC (npm start in tiktok-chat-bridge)'); }
      ttRetry = Math.min(ttRetry + 1, 5);
      ttRetryT = setTimeout(function () { if (running && tt) ttConnect(); }, 1000 * Math.pow(2, ttRetry));
    };
  }

  /* ---------- scenes ---------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function density(n) { return Math.round(n * Math.min(1.6, (W * H) / (1440 * 900)) * (reduce ? 0.5 : 1)); }

  var MAKERS = {
    /* A gold galaxy drawn into a hot core. Each spark is a comet that falls in from the rim;
       when it lands the core flares and sends a shockwave ring out through the disc. */
    nebula: function () {
      var P = [], comets = [], rings = [], flare = 0, cx, cy, R;
      function geo() { cx = W / 2; cy = H * 0.56; R = Math.hypot(W, H) * 0.52; }
      geo();
      function spawn(p, outer) {
        p.r = outer ? rnd(R * 0.75, R) : Math.pow(Math.random(), 0.6) * R;
        p.a = rnd(0, Math.PI * 2);
        p.arm = Math.floor(rnd(0, 3));
        p.s = rnd(0.5, 1.8); p.h = Math.random();
        return p;
      }
      for (var i = 0, n = density(1400); i < n; i++) P.push(spawn({}, false));
      return {
        resize: geo,
        step: function (dt, t, sparks) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(4,5,8,0.22)'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          // core glow
          flare = Math.max(0, flare - dt * 1.6);
          var cr = Math.min(W, H) * (0.07 + flare * 0.05);
          var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 4);
          g.addColorStop(0, 'rgba(255,244,224,' + (0.55 + flare * 0.45) + ')');
          g.addColorStop(0.18, 'rgba(255,198,90,' + (0.35 + flare * 0.4) + ')');
          g.addColorStop(0.5, 'rgba(245,120,35,0.08)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cr * 4, 0, Math.PI * 2); ctx.fill();
          // disc
          for (var i = 0; i < P.length; i++) {
            var p = P[i];
            var w = 0.9 / Math.sqrt(Math.max(p.r, 20) / 120);
            p.a += w * dt * 0.35;
            p.r -= dt * (6 + 900 / Math.max(p.r, 30));
            if (p.r < cr * 0.6) spawn(p, true);
            var tilt = 0.42;
            var spiral = p.a + p.arm * 2.094 + Math.log(Math.max(p.r, 1)) * 1.1;
            var x = cx + Math.cos(spiral) * p.r, y = cy + Math.sin(spiral) * p.r * tilt;
            var near = 1 - Math.min(1, p.r / R);
            var al = 0.25 + near * 0.6;
            var col = p.h < 0.6 ? '255,198,90' : p.h < 0.88 ? '255,138,61' : '255,244,224';
            ctx.fillStyle = 'rgba(' + col + ',' + al + ')';
            ctx.fillRect(x, y, p.s + near * 1.2, p.s + near * 1.2);
          }
          // new comets
          for (var s = 0; s < sparks; s++) {
            var a0 = rnd(0, Math.PI * 2);
            comets.push({ a: a0, r: R * 0.95, v: rnd(0.9, 1.3) });
          }
          for (var c = comets.length - 1; c >= 0; c--) {
            var k = comets[c];
            k.r -= dt * R * 0.42 * k.v; k.a += dt * 1.4;
            var kx = cx + Math.cos(k.a) * k.r, ky = cy + Math.sin(k.a) * k.r * 0.42;
            var kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, 18);
            kg.addColorStop(0, 'rgba(255,244,224,0.95)'); kg.addColorStop(0.3, 'rgba(255,198,90,0.5)'); kg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(kx, ky, 18, 0, Math.PI * 2); ctx.fill();
            if (k.r <= cr) { comets.splice(c, 1); flare = Math.min(1, flare + 0.55); rings.push({ r: cr, a: 0.7 }); }
          }
          // shockwaves
          ctx.lineWidth = 1.5;
          for (var q = rings.length - 1; q >= 0; q--) {
            var rg = rings[q]; rg.r += dt * R * 0.35; rg.a -= dt * 0.45;
            if (rg.a <= 0) { rings.splice(q, 1); continue; }
            ctx.strokeStyle = 'rgba(255,207,122,' + rg.a + ')';
            ctx.beginPath(); ctx.ellipse(cx, cy, rg.r, rg.r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
          }
        }
      };
    },

    /* Silk: thousands of threads riding a slowly breathing flow field, leaving long trails.
       A spark releases a bloom of brighter threads from a random point that fan out and fade. */
    flow: function () {
      var P = [], hueT = 0;
      function field(x, y, t) {
        var s = 0.0019;
        return Math.sin(x * s + t * 0.13) * 1.7 + Math.cos(y * s * 1.3 - t * 0.09) * 1.7 + Math.sin((x + y) * s * 0.6 + t * 0.05);
      }
      function spawn(p) { p.x = rnd(0, W); p.y = rnd(0, H); p.life = rnd(2, 7); p.hot = 0; p.w = rnd(0.5, 1.3); return p; }
      for (var i = 0, n = density(1800); i < n; i++) P.push(spawn({}));
      return {
        step: function (dt, t, sparks) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(4,5,8,0.045)'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          hueT += dt;
          for (var s = 0; s < sparks; s++) {
            var bx = rnd(W * 0.1, W * 0.9), by = rnd(H * 0.15, H * 0.85);
            for (var j = 0; j < 60; j++) {
              var p0 = P[(Math.random() * P.length) | 0];
              p0.x = bx + rnd(-30, 30); p0.y = by + rnd(-30, 30); p0.hot = 1; p0.life = rnd(2, 4);
            }
          }
          var sp = 70;
          for (var i = 0; i < P.length; i++) {
            var p = P[i];
            var a = field(p.x, p.y, t);
            var nx = p.x + Math.cos(a) * sp * dt * (1 + p.hot * 1.5), ny = p.y + Math.sin(a) * sp * dt * (1 + p.hot * 1.5);
            // palette drifts gold -> amber -> a cool violet accent and back
            var m = (Math.sin(hueT * 0.08 + p.x * 0.001) + 1) / 2;
            var r = 255, gg = Math.round(200 - m * 70), b = Math.round(90 + m * (p.y / H) * 150);
            var al = 0.08 + p.hot * 0.5;
            ctx.strokeStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + al + ')';
            ctx.lineWidth = p.w + p.hot * 1.2;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
            p.x = nx; p.y = ny; p.life -= dt; p.hot = Math.max(0, p.hot - dt * 0.5);
            if (p.life <= 0 || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) spawn(p);
          }
        }
      };
    },

    /* Hash Rain: columns of hex digests falling like a terminal. Each spark turns one column's
       head solid gold and prints the amount it just earned as it falls. */
    rain: function () {
      var HEX = '0123456789abcdef', cols = [], fs, pops = [];
      function geo() {
        fs = Math.max(13, Math.round(Math.min(W, H) / 48));
        cols = [];
        for (var x = 0; x < W; x += fs) cols.push({ x: x, y: rnd(-H, 0), v: rnd(0.4, 1.1), gold: 0 });
      }
      geo();
      var label = function () { var f = feed(); return '+' + money(unitUSD, Math.min(6, Math.max(0, -Math.floor(Math.log10(unitUSD * ((f && f.fx) || 1)) - 1e-9))), f); };
      return {
        resize: function () { geo(); },
        step: function (dt, t, sparks) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(4,5,8,0.11)'; ctx.fillRect(0, 0, W, H);
          ctx.font = fs + 'px "Share Tech Mono", ui-monospace, monospace';
          ctx.textBaseline = 'top';
          for (var s = 0; s < sparks; s++) {
            var c0 = cols[(Math.random() * cols.length) | 0]; c0.gold = 1;
            pops.push({ x: c0.x, y: Math.max(fs * 4, c0.y), a: 1, txt: label() });
          }
          for (var i = 0; i < cols.length; i++) {
            var c = cols[i];
            c.y += c.v * fs * dt * 9;
            var ch = HEX[(Math.random() * 16) | 0];
            if (c.gold > 0) { ctx.fillStyle = 'rgba(255,214,150,' + (0.6 + c.gold * 0.4) + ')'; c.gold = Math.max(0, c.gold - dt * 0.35); }
            else ctx.fillStyle = 'rgba(255,244,224,0.85)';
            ctx.fillText(ch, c.x, c.y);
            ctx.fillStyle = c.gold > 0 ? 'rgba(245,166,35,0.55)' : 'rgba(245,166,35,0.28)';
            ctx.fillText(HEX[(Math.random() * 16) | 0], c.x, c.y - fs);
            if (c.y > H + fs * 2 && Math.random() > 0.96) { c.y = rnd(-fs * 20, 0); c.v = rnd(0.4, 1.1); }
          }
          ctx.globalCompositeOperation = 'lighter';
          ctx.font = '700 ' + Math.round(fs * 1.15) + 'px "Space Grotesk", system-ui, sans-serif';
          for (var q = pops.length - 1; q >= 0; q--) {
            var p = pops[q]; p.y -= dt * fs * 1.6; p.a -= dt * 0.55;
            if (p.a <= 0) { pops.splice(q, 1); continue; }
            ctx.fillStyle = 'rgba(255,198,90,' + p.a + ')';
            ctx.fillText(p.txt, Math.min(p.x + fs, W - fs * 7), p.y);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      };
    }
  };

  window.openStreamMode = open;
})();
