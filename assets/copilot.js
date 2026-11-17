/*
  GMT-Optimizer co-pilot ENGINE: a scripted guide in Ringo's voice. No AI, no API, no backend.
  =============================================================================================
  One engine, two homes:
    • the widget — the gold launcher in the corner of every page, with two tabs:
        Co-pilot  (this conversation)  and  Messages  (the global chat room, logged-in visitors only)
    • the full page at /copilot — any element with [data-copilot-page] gets the conversation inline
      (the corner launcher stays off on that page).
  The words live in per-language script files, assets/copilot/<lang>.js (en now; es/fr/de in Phase 7).
  The page's <html lang> picks the file; anything missing falls back to English.

  It sends a visitor's GoMining username to the same Formspree form /claim uses, and opens tools in place
  when they're already on the console. Anything off-script goes to Ringo on Telegram or text.
  Loaded on every page by site.js / site-chrome.js.
*/
(function () {
  if (window.__gmCopilot) return;
  window.__gmCopilot = true;
  if (window.self !== window.top) return;   // not inside embeds / iframes

  var CFG = window.GMT_CONFIG;
  var CODE = (CFG && CFG.referral && CFG.referral.code) || "RINGO5";
  var REF = "https://gomining.com/?ref=" + CODE;
  var TG = "https://t.me/RinGoMining";
  var PHONE = "906-235-5711";
  var SMS = "sms:+1" + PHONE.replace(/\D/g, "");
  var FORM = "https://formspree.io/f/xojokqwe";   // same endpoint as /claim
  var STORE = "gmt_copilot";
  var AVATAR = "/assets/brand/GMT_icon_transparent.svg";
  var SCRIPTS = { en: "/assets/copilot/en.js?v=1", es: "/assets/copilot/es.js?v=1", fr: "/assets/copilot/fr.js?v=1", de: "/assets/copilot/de.js?v=1" };
  var CHAT_DEPS = [   // the Messages tab loads the chat room on first use, only on pages that don't already have it
    ["supabase", "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"],
    ["GMT_SUPABASE", "/assets/supabase-config.js?v=4"],
    ["GMTAccount", "/assets/account.js?v=25"],
    ["GMTChat", "/assets/chat.js?v=17"]
  ];
  var LANG = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();

  var css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/assets/copilot.css?v=8";
  document.head.appendChild(css);

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej;
      (document.head || document.documentElement).appendChild(s);
    });
  }
  var want = ["en"].concat(LANG !== "en" && SCRIPTS[LANG] ? [LANG] : []);
  var have = window.GMTCopilotScripts || {};
  Promise.all(want.filter(function (l) { return !(l in have); }).map(function (l) { return loadScript(SCRIPTS[l]).catch(function () {}); }))
    .then(function () {
      var all = window.GMTCopilotScripts || {};
      var en = all.en; if (!en) return;            // no script, no co-pilot
      var loc = all[LANG] || en;
      var U = {}; Object.keys(en.ui).forEach(function (k) { U[k] = (loc.ui && loc.ui[k]) || en.ui[k]; });
      U.sub = U.sub.replace("{CODE}", CODE);
      var NODES = (loc.nodes || en.nodes)({ CODE: CODE });
      if (document.body) boot(U, NODES); else document.addEventListener("DOMContentLoaded", function () { boot(U, NODES); });
    });

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  // ---------- shared conversation state (one conversation per tab, whichever home shows it) ----------
  var state = load() || { node: null, data: {} };
  function load() { try { return JSON.parse(sessionStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  // ---------- the conversation, rendered into any { log, foot } pair ----------
  function Conversation(U, NODES, log, foot, hooks) {
    var started = false;
    function scroll() { log.scrollTop = log.scrollHeight; }
    function bot(lines, instant, after) {
      var i = 0;
      var reduce = instant || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      (function next() {
        if (i >= lines.length) { if (after) after(); return; }
        var b = el("div", "gc-msg gc-bot");
        if (reduce) { b.innerHTML = lines[i++]; log.appendChild(b); scroll(); next(); }
        else {
          b.classList.add("gc-typing"); b.innerHTML = "<i></i><i></i><i></i>";
          log.appendChild(b); scroll();
          setTimeout(function () { b.classList.remove("gc-typing"); b.innerHTML = lines[i++]; scroll(); next(); },
            Math.min(900, 280 + lines[i].length * 6));
        }
      })();
    }
    function me(text) { var b = el("div", "gc-msg gc-me"); b.textContent = text; log.appendChild(b); scroll(); }   // user text never HTML

    // A tool link: when the console function it names exists on this page, run it in place; otherwise navigate.
    function runnable(run) {
      if (!run) return null;
      var name = Array.isArray(run) ? run[0] : run;
      return typeof window[name] === "function" ? function () { window[name].apply(window, Array.isArray(run) ? run.slice(1) : []); } : null;
    }
    function linkBtn(l) {
      if (l.kind === "copy") {
        var c = el("button", "gc-link"); c.type = "button"; c.textContent = l.t;
        c.addEventListener("click", function () { copyCode(c); });
        return c;
      }
      var a = el("a", "gc-link" + (l.kind === "ref" ? " gc-fire" : ""));
      a.textContent = l.t;
      a.href = l.kind === "ref" ? REF : l.kind === "tg" ? TG : l.kind === "sms" ? SMS : l.href;
      if (l.kind === "ref" || l.kind === "tg" || /^https?:/.test(l.href || "")) { a.target = "_blank"; a.rel = "noopener"; }
      var fn = runnable(l.run);
      if (fn) a.addEventListener("click", function (e) {
        e.preventDefault();
        if (hooks.beforeRun) hooks.beforeRun();
        try { fn(); } catch (err) { location.href = l.href; }
      });
      return a;
    }
    function copyCode(btn) {
      var done = function () { var o = btn.textContent; btn.textContent = U.copied; setTimeout(function () { btn.textContent = o; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(CODE).then(done, done); else done();
    }
    function go(id, instant) {
      var n = NODES[id]; if (!n) return;
      state.node = id; save();
      foot.innerHTML = "";
      if (n.review) return review();
      bot(n.say, instant, function () {
        if (n.links) { var row = el("div", "gc-links"); n.links.forEach(function (l) { row.appendChild(linkBtn(l)); }); log.appendChild(row); }
        scroll();
        if (n.ask) return ask(n.ask);
        if (n.opts) options(n.opts);
      });
    }
    function options(opts) {
      foot.innerHTML = "";
      var wrap = el("div", "gc-opts");
      opts.forEach(function (o) {
        var b = el("button", "gc-opt"); b.type = "button"; b.textContent = o.t;
        b.addEventListener("click", function () { me(o.t); go(o.go); });
        wrap.appendChild(b);
      });
      foot.appendChild(wrap); scroll();
    }
    function ask(q) {
      foot.innerHTML = "";
      var f = el("form", "gc-ask"); f.noValidate = true;
      var inp = el("input"); inp.type = "text";
      inp.setAttribute("aria-label", q.label);
      inp.placeholder = q.label + (q.optional ? " " + U.optional : "");
      inp.autocomplete = "off"; inp.spellcheck = false;
      if (state.data[q.key]) inp.value = state.data[q.key];
      var send = el("button", "gc-send"); send.type = "submit"; send.textContent = U.send;
      f.appendChild(inp); f.appendChild(send);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = inp.value.trim();
        if (q.check && !q.check.test(v)) { bot([q.bad], true); inp.focus(); return; }
        state.data[q.key] = v; save(); me(v); go(q.next);
      });
      foot.appendChild(f); scroll();
      setTimeout(function () { inp.focus(); }, 30);
    }
    function review() {
      var d = state.data;
      bot([U.reviewIntro], false, function () {
        var card = el("div", "gc-msg gc-bot gc-card");
        [[U.reviewName, d.name], [U.reviewUser, d.user], [U.reviewContact, d.contact]].forEach(function (r) {
          var row = el("div"), k = el("span"), v = el("b");
          k.textContent = r[0]; v.textContent = r[1] || "";
          row.appendChild(k); row.appendChild(v); card.appendChild(row);
        });
        log.appendChild(card);
        var fine = el("div", "gc-fine"); fine.innerHTML = U.fine; log.appendChild(fine);
        scroll();
        var wrap = el("div", "gc-opts");
        var s = el("button", "gc-opt gc-primary"); s.type = "button"; s.textContent = U.sendIt;
        s.addEventListener("click", function () { submit(s); });
        var fix = el("button", "gc-opt"); fix.type = "button"; fix.textContent = U.fix;
        fix.addEventListener("click", function () { me(U.fix); go("q_name"); });
        wrap.appendChild(s); wrap.appendChild(fix);
        foot.innerHTML = ""; foot.appendChild(wrap);
      });
    }
    function submit(btn) {
      var d = state.data;
      if (!d.name || !d.user || !d.contact) { bot([U.missing], true); return go("q_name"); }
      btn.disabled = true; btn.textContent = U.sending;
      fetch(FORM, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ name: d.name, gomining_username: d.user, contact: d.contact,
          message: "Sent from the GMT-Optimizer co-pilot chat (" + location.pathname + ")", _subject: "GMT-Optimizer co-pilot: " + d.user })
      }).then(function (r) {
        if (!r.ok) throw new Error("bad status");
        me(U.sentEcho); state.data = {}; go("sent");
      }).catch(function () { me(U.sentEcho); go("sendfail"); });
    }
    return {
      start: function () {
        if (started) return; started = true;
        if (state.node && NODES[state.node] && state.node !== "start" && state.node !== "sent" && state.node !== "bye") {
          bot([U.resume], true); go(state.node, true);
        } else go("start");
      },
      restart: function () { state = { node: null, data: {} }; save(); log.innerHTML = ""; started = true; go("start"); },
      focus: function () { var f = foot.querySelector("input, button"); if (f) setTimeout(function () { f.focus(); }, 50); },
      scroll: scroll
    };
  }

  function headHTML(U, extra) {
    return '<img src="' + AVATAR + '" alt="" width="36" height="36">' +
      '<div><strong>' + U.name + '</strong><small>' + U.sub + '</small></div>' + extra;
  }

  function boot(U, NODES) {
    var host = document.querySelector("[data-copilot-page]");
    if (host) return bootPage(U, NODES, host);
    bootWidget(U, NODES);
  }

  // ---------- /copilot: the conversation inline, no corner launcher ----------
  function bootPage(U, NODES, host) {
    host.classList.add("gc-page");
    host.innerHTML =
      '<header class="gc-head">' + headHTML(U, '<button type="button" class="gc-restart" title="' + U.restart + '" aria-label="' + U.restart + '">↺</button>') + '</header>' +
      '<div class="gc-log" aria-live="polite"></div><div class="gc-foot"></div>';
    var convo = Conversation(U, NODES, host.querySelector(".gc-log"), host.querySelector(".gc-foot"), {});
    host.querySelector(".gc-restart").addEventListener("click", function () { convo.restart(); });
    document.querySelectorAll("[data-copilot]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); host.scrollIntoView({ behavior: "smooth", block: "start" }); convo.focus(); });
    });
    convo.start();
    window.gmCopilot = { open: function () { convo.focus(); }, close: function () {} };
  }

  // ---------- the widget ----------
  function bootWidget(U, NODES) {
    var fab = el("button", "gc-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", U.fab);
    fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = '<img class="gc-fab-mark" src="' + AVATAR + '" alt="" width="56" height="28"><span class="gc-dot"></span><span class="gc-badge" hidden></span>';

    var tip = el("div", "gc-tip");
    tip.innerHTML = '<button type="button" class="gc-tip-x" aria-label="' + U.tipClose + '">×</button><span>' + U.tip + '</span>';

    var panel = el("section", "gc-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", U.fab);
    panel.hidden = true;
    panel.innerHTML =
      '<header class="gc-head">' + headHTML(U,
        '<a class="gc-full" href="/copilot" title="' + U.fullPage + '" aria-label="' + U.fullPage + '">⤢</a>' +
        '<button type="button" class="gc-restart" title="' + U.restart + '" aria-label="' + U.restart + '">↺</button>' +
        '<button type="button" class="gc-close" aria-label="' + U.close + '">×</button>') + '</header>' +
      '<div class="gc-tabs" role="tablist" hidden>' +
        '<button type="button" role="tab" class="gc-tab" data-tab="copilot" aria-selected="true">' + U.tabCopilot + '</button>' +
        '<button type="button" role="tab" class="gc-tab" data-tab="messages" aria-selected="false">' + U.tabMessages + ' <span class="gc-tab-n" hidden></span></button>' +
      '</div>' +
      '<div class="gc-pane" data-pane="copilot" role="tabpanel"><div class="gc-log" aria-live="polite"></div><div class="gc-foot"></div></div>' +
      '<div class="gc-pane gc-pane--msgs" data-pane="messages" role="tabpanel" hidden><div class="gc-msgs"><p class="gc-msgs-note">' + U.msgLoading + '</p></div></div>';
    var tabs = panel.querySelector(".gc-tabs"), msgsHost = panel.querySelector(".gc-msgs");
    var convo = Conversation(U, NODES, panel.querySelector(".gc-log"), panel.querySelector(".gc-foot"), {
      beforeRun: function () { if (window.matchMedia && matchMedia("(max-width: 600px)").matches) close(); }
    });

    document.body.appendChild(panel);
    document.body.appendChild(tip);
    document.body.appendChild(fab);
    document.documentElement.classList.add("gc-on");
    var seenTip = false;
    try { seenTip = !!localStorage.getItem(STORE + "_tip"); } catch (e) {}
    if (!seenTip && !state.node) setTimeout(function () { if (panel.hidden) tip.classList.add("show"); }, 9000);
    document.querySelectorAll("[data-copilot]").forEach(function (a) {   // <a data-copilot href="/copilot">Ask Ringo</a>
      a.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });

    function hideTip() { tip.classList.remove("show"); try { localStorage.setItem(STORE + "_tip", "1"); } catch (e) {} }
    tip.querySelector(".gc-tip-x").addEventListener("click", hideTip);
    tip.querySelector("span").addEventListener("click", function () { hideTip(); open(); });
    fab.addEventListener("click", function () { panel.hidden ? open() : close(); });
    panel.querySelector(".gc-close").addEventListener("click", close);
    panel.querySelector(".gc-restart").addEventListener("click", function () { convo.restart(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

    // ----- tabs: Messages only for logged-in visitors -----
    var tab = "copilot";
    function loggedIn() {
      var A = window.GMTAccount;
      if (A && A.ready && A.resolved) return A.isLoggedIn();
      try {   // pages without account.js: the Supabase session in localStorage
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (/^sb-[a-z0-9]+-auth-token$/.test(k)) { var s = JSON.parse(localStorage.getItem(k) || "null"); if (s && s.access_token) return true; }
        }
      } catch (e) {}
      return false;
    }
    function syncTabs() {
      var on = loggedIn();
      tabs.hidden = !on;
      panel.classList.toggle("gc-has-tabs", on);
      if (!on && tab === "messages") showTab("copilot");
    }
    function showTab(t) {
      // The console has its own chat panel: send Messages there instead of a second copy of the room.
      if (t === "messages" && document.getElementById("gmtOnline") && window.GMTChat) { close(); document.getElementById("gmtOnline").click(); return; }
      tab = t;
      tabs.querySelectorAll(".gc-tab").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
      panel.querySelectorAll(".gc-pane").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== t; });
      panel.classList.toggle("gc-on-msgs", t === "messages");
      panel.querySelector(".gc-restart").hidden = t !== "copilot";
      if (t === "messages") openMessages(); else { if (window.GMTChat) window.GMTChat.setVisible(false); convo.focus(); }
    }
    tabs.addEventListener("click", function (e) { var b = e.target.closest(".gc-tab"); if (b) showTab(b.getAttribute("data-tab")); });
    tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var next = tab === "copilot" ? "messages" : "copilot"; showTab(next);
      var b = tabs.querySelector('[data-tab="' + next + '"]'); if (b) b.focus();
    });
    var msgsMounted = false, msgsLoading = null;
    function openMessages() {
      if (msgsMounted) { window.GMTChat.setVisible(true); return; }
      if (!msgsLoading) {
        if (!window.GMTChat) window.GMT_CHAT_EMBED = true;
        msgsLoading = CHAT_DEPS.reduce(function (p, d) { return p.then(function () { return window[d[0]] ? null : loadScript(d[1]); }); }, Promise.resolve())
          .then(function () {
            return new Promise(function (res, rej) {   // chat.js starts once account.js is ready
              var n = 0, t = setInterval(function () { if (window.GMTChat) { clearInterval(t); res(); } else if (++n > 80) { clearInterval(t); rej(new Error("timeout")); } }, 100);
            });
          });
      }
      msgsLoading.then(function () {
        if (msgsMounted) return;
        msgsMounted = true; msgsHost.innerHTML = "";
        window.GMTChat.mountInto(msgsHost);
        if (tab === "messages" && !panel.hidden) window.GMTChat.setVisible(true);
      }).catch(function () {
        msgsHost.innerHTML = '<p class="gc-msgs-note">' + U.msgFail + '</p><a class="gc-link" href="/chat/">' + U.msgOpen + '</a>';
        msgsLoading = null;
      });
    }
    // unread count from the room (or, before it loads, from the header's counter)
    function setUnread(n) {
      var tn = tabs.querySelector(".gc-tab-n"), fb = fab.querySelector(".gc-badge");
      var txt = n > 99 ? "99+" : String(n);
      tn.hidden = !(n > 0); tn.textContent = txt;
      fb.hidden = !(n > 0) || !loggedIn(); fb.textContent = txt;
    }
    document.addEventListener("gmt-chat-unread", function (e) { setUnread(+(e.detail || 0)); });
    window.addEventListener("storage", function (e) { if (!e.key || /auth-token$/.test(e.key)) syncTabs(); });
    var tries = 0, waitAcc = setInterval(function () {   // account.js (where present) settles the login state a beat later
      if (window.GMTAccount && window.GMTAccount.onChange) { clearInterval(waitAcc); window.GMTAccount.onChange(syncTabs); syncTabs(); }
      else if (++tries > 50) clearInterval(waitAcc);
    }, 100);
    syncTabs();

    // Phones: fit the sheet to the visible area above the keyboard.
    var vv = window.visualViewport;
    function fit() {
      if (panel.hidden || !vv || !(window.matchMedia && matchMedia("(max-width: 600px)").matches)) { panel.style.height = ""; panel.style.top = ""; return; }
      panel.style.height = Math.round(vv.height) + "px";
      panel.style.top = Math.round(vv.offsetTop) + "px";
      convo.scroll();
    }
    if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }

    function open(which) {
      hideTip();
      syncTabs();
      panel.hidden = false;
      fab.classList.add("on");
      fab.setAttribute("aria-expanded", "true");
      document.documentElement.classList.add("gc-open");
      fit();
      convo.start();
      showTab(which === "messages" && loggedIn() ? "messages" : tab);
    }
    function close() {
      panel.hidden = true;
      fab.classList.remove("on");
      fab.setAttribute("aria-expanded", "false");
      document.documentElement.classList.remove("gc-open");
      if (window.GMTChat && msgsMounted) window.GMTChat.setVisible(false);
      fit();
      fab.focus();
    }
    window.gmCopilot = { open: open, close: close, messages: function () { open("messages"); } };

    // Keep clear of anything a page marks [data-copilot-clear] (the landing quick estimate): while the panel
    // would sit over it and there is room to its left, the panel moves beside it on the same bottom line.
    // It returns to the corner once the marked block scrolls out of view. Phones use the full-screen panel.
    function dodge() {
      panel.style.right = "";
      if (panel.hidden || window.innerWidth <= 640) return;
      var keep = document.querySelector("[data-copilot-clear]"); if (!keep) return;
      // Layout box, not getBoundingClientRect: the open animation scales the panel, which would under-measure it.
      var cs = getComputedStyle(panel), w = panel.offsetWidth, h = panel.offsetHeight;
      // clientWidth, not innerWidth: fixed `right` is measured from the inside of the scrollbar.
      var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      var pr = vw - (parseFloat(cs.right) || 0), pb = vh - (parseFloat(cs.bottom) || 0);
      var k = keep.getBoundingClientRect(), p = { left: pr - w, right: pr, top: pb - h, bottom: pb, width: w };
      var overlaps = p.left < k.right && p.right > k.left && p.top < k.bottom && p.bottom > k.top;
      if (!overlaps) return;
      var right = vw - k.left + 16;
      if (vw - right - p.width >= 16) panel.style.right = right + "px";
    }
    var dodgeRaf = 0;
    var queueDodge = function () { if (!dodgeRaf) dodgeRaf = requestAnimationFrame(function () { dodgeRaf = 0; dodge(); }); };
    window.addEventListener("scroll", queueDodge, { passive: true });
    window.addEventListener("resize", queueDodge);
    new MutationObserver(queueDodge).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    // The panel opens short and grows upward as messages arrive, so re-check whenever its size changes.
    if (window.ResizeObserver) new ResizeObserver(queueDodge).observe(panel);
  }
})();
