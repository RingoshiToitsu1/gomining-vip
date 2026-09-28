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

   Keys: 1-3 scene · H hide overlay · C chat · F fullscreen · M session/today counter · Esc exit. */
(function () {
  'use strict';
  var SCENE_KEY = 'gmtopt_viz_scene_v1', MODE_KEY = 'gmtopt_viz_mode_v1', CHAN_KEY = 'gmtopt_viz_twitch_v1';
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
    '#vizRoot .vz-hud{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(16px,3.2vw,44px);transition:opacity .5s}',
    '#vizRoot.hud-off .vz-hud{opacity:0}',
    '.vz-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}',
    '.vz-label{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.62rem,1.1vw,.8rem);letter-spacing:.28em;text-transform:uppercase;color:rgba(255,207,122,.72)}',
    '.vz-big{font-weight:700;font-size:clamp(2.3rem,7.4vw,6.4rem);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,#FFF4E0 10%,#FFC65A 60%,#F5A623);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 28px rgba(245,166,35,.35));margin-top:.35rem;white-space:nowrap}',
    '.vz-big small{font-size:.42em;opacity:.8}',
    '.vz-rates{display:flex;flex-wrap:wrap;gap:clamp(10px,2vw,28px);margin-top:1rem}',
    '.vz-rate{min-width:0}',
    '.vz-rate b{display:block;font-weight:600;font-size:clamp(1rem,2.1vw,1.7rem);font-variant-numeric:tabular-nums;color:#FFF4E0}',
    '.vz-rate span{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.58rem,.95vw,.72rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(255,244,224,.5)}',
    '.vz-rate.hot b{color:#FFC65A;text-shadow:0 0 18px rgba(245,166,35,.55)}',
    '.vz-chips{display:flex;flex-direction:column;align-items:flex-end;gap:8px;text-align:right}',
    '.vz-chip{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.66rem,1.05vw,.82rem);letter-spacing:.08em;padding:.38rem .7rem;border-radius:8px;background:rgba(10,12,18,.55);border:1px solid rgba(245,166,35,.22);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);white-space:nowrap}',
    '.vz-chip i{font-style:normal;color:rgba(255,244,224,.5);margin-right:.45em}',
    '.vz-bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}',
    '.vz-legend{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:clamp(.6rem,1vw,.78rem);color:rgba(255,244,224,.55);letter-spacing:.1em}',
    '.vz-legend em{font-style:normal;color:#FFC65A}',
    '.vz-brand{text-align:right;font-family:"Share Tech Mono",ui-monospace,monospace;letter-spacing:.14em;font-size:clamp(.66rem,1.1vw,.86rem);color:rgba(255,244,224,.7)}',
    '.vz-brand strong{display:block;font-family:"Space Grotesk",system-ui,sans-serif;font-size:clamp(.95rem,1.7vw,1.35rem);letter-spacing:.02em;color:#FFF4E0}',
    '.vz-brand strong span{color:#F5A623}',
    '.vz-bar{position:absolute;left:50%;bottom:clamp(16px,3vw,36px);transform:translateX(-50%);display:flex;gap:6px;padding:6px;border-radius:14px;background:rgba(10,12,18,.72);border:1px solid rgba(255,244,224,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity .4s,transform .4s;z-index:2}',
    '#vizRoot.idle .vz-bar{opacity:0;transform:translate(-50%,12px);pointer-events:none}',
    '#vizRoot.idle{cursor:none}',
    '.vz-bar button{border:0;background:transparent;color:rgba(255,244,224,.75);font:600 .76rem/1 "Space Grotesk",system-ui,sans-serif;padding:.55rem .8rem;border-radius:9px;cursor:pointer;white-space:nowrap}',
    '.vz-bar button:hover{background:rgba(255,244,224,.08);color:#FFF4E0}',
    '.vz-bar button.act{background:rgba(245,166,35,.18);color:#FFC65A}',
    '.vz-bar .sep{width:1px;background:rgba(255,244,224,.12);margin:4px 2px}',
    '.vz-chat{position:absolute;right:clamp(16px,3.2vw,44px);top:30%;bottom:20%;width:min(380px,32vw);display:flex;flex-direction:column;justify-content:flex-end;gap:6px;overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%);mask-image:linear-gradient(180deg,transparent,#000 22%);z-index:1}',
    '#vizRoot.chat-off .vz-chat{display:none}',
    '.vz-msg{font-size:clamp(.82rem,1.15vw,1rem);line-height:1.4;padding:.45rem .7rem;border-radius:10px;background:rgba(6,7,11,.58);border:1px solid rgba(255,244,224,.07);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#FFF4E0;word-wrap:break-word;overflow-wrap:anywhere;animation:vzIn .35s ease-out;transition:opacity 1.2s}',
    '.vz-msg.old{opacity:0}',
    '.vz-msg b{font-weight:700;margin-right:.35em}',
    '.vz-msg img{height:1.5em;vertical-align:middle;margin:-.2em .05em}',
    '.vz-msg.sys{font-family:"Share Tech Mono",ui-monospace,monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,207,122,.75);background:rgba(6,7,11,.4)}',
    '@keyframes vzIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}',
    '.vz-chan{display:flex;align-items:center;gap:4px;padding-left:6px}',
    '.vz-chan input{width:120px;background:rgba(255,244,224,.06);border:1px solid rgba(255,244,224,.14);border-radius:8px;color:#FFF4E0;font:500 .76rem/1 "Space Grotesk",system-ui,sans-serif;padding:.5rem .55rem;outline:none}',
    '.vz-chan input:focus{border-color:#9146FF}',
    '.vz-chan .tw{color:#BF94FF;font-weight:700;font-size:.72rem}',
    '@media (max-width:640px){.vz-chat{left:16px;right:16px;width:auto;top:auto;bottom:130px;height:28vh}.vz-chan input{width:90px}..vz-top{flex-direction:column}.vz-chips{flex-direction:row;flex-wrap:wrap;align-items:flex-start;text-align:left}.vz-bottom{flex-direction:column;align-items:flex-start;padding-bottom:64px}.vz-brand{text-align:left}.vz-bar{max-width:calc(100% - 32px);overflow-x:auto}.vz-bar button{padding:.5rem .6rem}}'
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
    root.innerHTML =
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
          '<div class="vz-brand"><strong>gmt-optimizer<span>.com</span></strong>code RINGO5 · we fund your first TH</div>' +
        '</div>' +
      '</div>' +
      '<div class="vz-chat" id="vzChat"></div>' +
      '<div class="vz-bar" id="vzBar"></div>';
    document.body.appendChild(root);
    cvs = root.querySelector('canvas'); ctx = cvs.getContext('2d');
    ['vzLabel', 'vzBig', 'vzSec', 'vzMin', 'vzHr', 'vzDay', 'vzBtc', 'vzTh', 'vzSats', 'vzDisc', 'vzLegend', 'vzBar', 'vzChat'].forEach(function (id) { el[id] = document.getElementById(id); });
    buildBar();
    document.documentElement.style.overflow = 'hidden';
    resize(); setScene(sceneIdx);
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', onKey);
    root.addEventListener('mousemove', wake); root.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('gm:viz', onFeed);
    sessionUSD = 0; unitAcc = 0; lastT = performance.now(); running = true;
    if (!chatOn) root.classList.add('chat-off');
    if (chan) chatConnect(chan);
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
      '<button data-act="chat" id="vzChatBtn"></button>' +
      '<span class="sep"></span>' +
      '<button data-act="mode" id="vzModeBtn"></button>' +
      '<button data-act="hud">Hide overlay</button>' +
      '<button data-act="fs">Fullscreen</button>' +
      '<button data-act="exit">Exit ✕</button>';
    el.vzBar.innerHTML = h;
    el.vzBar.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.scene != null) setScene(+b.dataset.scene);
      else if (b.dataset.act === 'mode') toggleMode();
      else if (b.dataset.act === 'chat') toggleChat();
      else if (b.dataset.act === 'hud') toggleHud(b);
      else if (b.dataset.act === 'fs') toggleFs();
      else if (b.dataset.act === 'exit') close();
    };
    var ci = document.getElementById('vzChanIn');
    ci.value = chan;
    // Keys typed into the channel box belong to the box, not to the scene shortcuts.
    ci.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { setChannel(ci.value); ci.blur(); }
      if (e.key === 'Escape') { ci.value = chan; ci.blur(); }
    });
    ci.addEventListener('change', function () { setChannel(ci.value); });
    ci.addEventListener('focus', function () { clearTimeout(idleTimer); });
    ci.addEventListener('blur', wake);
    syncBar();
  }
  function syncBar() {
    var cb = document.getElementById('vzChatBtn'); if (cb) cb.textContent = chatOn ? 'Chat: on' : 'Chat: off';
    if (!el.vzBar) return;
    el.vzBar.querySelectorAll('[data-scene]').forEach(function (b) { b.classList.toggle('act', +b.dataset.scene === sceneIdx); });
    var mb = document.getElementById('vzModeBtn'); if (mb) mb.textContent = mode === 'today' ? 'Counter: today' : 'Counter: session';
    var hb = el.vzBar.querySelector('[data-act="hud"]'); if (hb) hb.textContent = root && root.classList.contains('hud-off') ? 'Show overlay' : 'Hide overlay';
  }
  function toggleMode() { mode = mode === 'today' ? 'session' : 'today'; save(MODE_KEY, mode); syncBar(); updateHud(true); }
  function toggleHud() { root.classList.toggle('hud-off'); syncBar(); }
  function toggleFs() {
    try { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen(); } catch (e) {}
  }
  function onKey(e) {
    if (e.key === 'Escape' && !document.fullscreenElement) { close(); return; }
    var k = e.key.toLowerCase();
    if (k >= '1' && k <= String(SCENES.length)) setScene(+k - 1);
    else if (k === 'h') toggleHud();
    else if (k === 'f') toggleFs();
    else if (k === 'm') toggleMode();
    else if (k === 'c') toggleChat();
    else return;
    wake();
  }
  function wake() {
    if (!root) return;
    root.classList.remove('idle'); clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (root && document.activeElement !== document.getElementById('vzChanIn')) root.classList.add('idle');
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
    W = window.innerWidth; H = window.innerHeight;
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
      addMsg(user, tags.color || nameColor(user), renderEmotes(text, tags.emotes), action);
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
  function addMsg(user, color, html, action) {
    var d = document.createElement('div'); d.className = 'vz-msg';
    var c = readable(color);
    d.innerHTML = '<b style="color:' + c + '">' + esc(user) + '</b>' + (action ? '<i style="color:' + c + '">' + html + '</i>' : html);
    pushMsg(d);
  }
  function sysMsg(t) { var d = document.createElement('div'); d.className = 'vz-msg sys'; d.textContent = t; pushMsg(d); }

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
