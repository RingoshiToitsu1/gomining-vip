/* GMT Optimizer — global chat + presence (Phase 3).
   ==================================================
   A Twitch-style global chat and a live "online" count, on Supabase Realtime.
   Anyone can read the chat and is counted as online; posting needs an account.
   Mods/admins (profiles.role) get per-message delete and a ban action.

   Depends on window.GMTAccount from account.js (it holds the Supabase client and
   the auth/role state). Stays dormant if accounts aren't configured. */
(function () {
  'use strict';

  function ready() { return window.GMTAccount && window.GMTAccount.ready && window.GMTAccount.sb; }
  if (!ready()) {
    // account.js may not have parsed yet; try again shortly, then give up quietly.
    var tries = 0, t = setInterval(function () {
      if (ready()) { clearInterval(t); start(); }
      else if (++tries > 40) clearInterval(t);
    }, 100);
    if (document.readyState !== 'loading') { /* interval handles it */ }
    return;
  }
  start();

  function start() {
    var A = window.GMTAccount, sb = A.sb;
    var LIMIT = 50, MIN_GAP = 1000, lastSent = 0;
    var messages = [], online = 0, mounted = false, openPanel = false;
    var el = {};

    // Deterministic Twitch-ish username color from the id.
    function color(seed) {
      var h = 0; seed = String(seed);
      for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      var hues = [8, 30, 45, 140, 170, 200, 265, 320];
      return 'hsl(' + hues[h % hues.length] + ' 70% 62%)';
    }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    // ---- data ----
    function loadHistory() {
      return sb.from('messages').select('id,user_id,username,body,created_at')
        .order('created_at', { ascending: false }).limit(LIMIT)
        .then(function (r) { messages = (r.data || []).reverse(); renderList(); });
    }
    function send(body) {
      var now = Date.now();
      if (now - lastSent < MIN_GAP) { flash('Slow down a moment.'); return; }
      body = body.trim();
      if (!body) return;
      if (body.length > 500) body = body.slice(0, 500);
      if (!A.isLoggedIn()) { flash('Log in to chat.'); return; }
      lastSent = now;
      var name = (A.profile && (A.profile.display_name || A.profile.username)) || 'miner';
      sb.from('messages').insert({ user_id: A.user.id, username: name, body: body })
        .then(function (r) { if (r.error) { flash(r.error.message || 'Could not send.'); lastSent = 0; } });
      el.input.value = '';
    }
    function del(id) {
      sb.from('messages').delete().eq('id', id).then(function (r) {
        if (r.error) flash(r.error.message || 'Delete failed.');
      });
    }
    function ban(userId, uname) {
      if (!confirm('Ban ' + uname + '? They will no longer be able to post.')) return;
      sb.from('profiles').update({ banned: true }).eq('id', userId).then(function (r) {
        if (r.error) flash(r.error.message || 'Ban failed.'); else flash(uname + ' banned.');
      });
    }

    // ---- realtime: chat feed ----
    sb.channel('chat-room')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, function (p) {
        messages.push(p.new); if (messages.length > 200) messages.shift(); renderList();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, function (p) {
        messages = messages.filter(function (m) { return String(m.id) !== String(p.old.id); }); renderList();
      })
      .subscribe();

    // ---- realtime: presence (online count) ----
    var myKey;
    try { myKey = sessionStorage.getItem('gmt_anon') || ('a' + Math.random().toString(36).slice(2)); sessionStorage.setItem('gmt_anon', myKey); }
    catch (e) { myKey = 'a' + Math.random().toString(36).slice(2); }
    var pres = sb.channel('online', { config: { presence: { key: myKey } } });
    pres.on('presence', { event: 'sync' }, function () {
      online = Object.keys(pres.presenceState()).length; renderOnline();
    });
    pres.subscribe(function (status) {
      if (status === 'SUBSCRIBED') pres.track({ at: Date.now(), user: A.isLoggedIn() ? (A.profile && A.profile.username) : null });
    });

    // ===========================================================================
    // UI
    // ===========================================================================
    var STYLE =
      '#gmtOnline{font-family:var(--mono,monospace);font-size:.72rem;color:var(--text3,#8a90a0);display:inline-flex;align-items:center;gap:.35rem}' +
      '#gmtOnline .dot{width:7px;height:7px;border-radius:50%;background:#3ddc84;box-shadow:0 0 8px #3ddc84}' +
      '.gmt-chat-fab{position:fixed;right:18px;bottom:18px;z-index:9998;background:var(--gold,#f5a623);color:#1a1205;border:none;border-radius:24px;padding:.6rem .9rem;font-weight:700;font-size:.85rem;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:.45rem}' +
      '.gmt-chat-fab .n{background:rgba(0,0,0,.22);border-radius:10px;padding:0 .4rem;font-size:.72rem}' +
      '.gmt-chat{position:fixed;right:18px;bottom:18px;z-index:9999;width:min(360px,94vw);height:min(520px,76vh);background:linear-gradient(180deg,#141824,#0e111a);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);display:none;flex-direction:column;overflow:hidden}' +
      '.gmt-chat.show{display:flex}' +
      '.gmt-chat-head{display:flex;align-items:center;justify-content:space-between;padding:.7rem .9rem;border-bottom:1px solid var(--line,rgba(255,255,255,.1))}' +
      '.gmt-chat-head .t{font-weight:700;color:var(--text1,#e8ecf4);font-size:.9rem}' +
      '.gmt-chat-head .o{font-family:var(--mono,monospace);font-size:.7rem;color:var(--text3,#8a90a0)}' +
      '.gmt-chat-head .c{background:none;border:none;color:var(--text4,#6a7080);font-size:1.2rem;cursor:pointer}' +
      '.gmt-chat-list{flex:1;overflow-y:auto;padding:.6rem .8rem;display:flex;flex-direction:column;gap:.35rem}' +
      '.gmt-msg{font-size:.82rem;line-height:1.4;color:var(--text2,#c4cad6);word-break:break-word}' +
      '.gmt-msg .u{font-weight:700;cursor:default}' +
      '.gmt-msg .mod{opacity:0;margin-left:.3rem;font-size:.72rem;cursor:pointer}' +
      '.gmt-msg:hover .mod{opacity:.8}' +
      '.gmt-msg .mod:hover{opacity:1}' +
      '.gmt-chat-foot{padding:.6rem .8rem;border-top:1px solid var(--line,rgba(255,255,255,.1))}' +
      '.gmt-chat-foot textarea{width:100%;resize:none;background:var(--glass-1,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text1,#e8ecf4);border-radius:10px;padding:.5rem .6rem;font-size:.85rem;font-family:inherit;height:38px}' +
      '.gmt-chat-login{width:100%;background:var(--gold,#f5a623);color:#1a1205;border:none;border-radius:10px;padding:.55rem;font-weight:700;cursor:pointer}' +
      '.gmt-flash{font-size:.72rem;color:#ffb060;min-height:1em;margin-top:.25rem}';

    function mount() {
      if (mounted) return; mounted = true;
      var s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);

      var fab = document.createElement('button'); fab.className = 'gmt-chat-fab';
      fab.innerHTML = '💬 Chat <span class="n" id="gmtFabN">0</span>';
      fab.addEventListener('click', function () { setOpen(true); });
      document.body.appendChild(fab); el.fab = fab; el.fabN = fab.querySelector('#gmtFabN');

      var box = document.createElement('div'); box.className = 'gmt-chat';
      box.innerHTML =
        '<div class="gmt-chat-head"><div><div class="t">Global Chat</div><div class="o" id="gmtChatOnline">0 online</div></div><button class="c" title="Close">&minus;</button></div>' +
        '<div class="gmt-chat-list" id="gmtChatList"></div>' +
        '<div class="gmt-chat-foot" id="gmtChatFoot"></div>';
      document.body.appendChild(box); el.box = box;
      el.list = box.querySelector('#gmtChatList');
      el.online2 = box.querySelector('#gmtChatOnline');
      el.foot = box.querySelector('#gmtChatFoot');
      box.querySelector('.c').addEventListener('click', function () { setOpen(false); });

      renderFoot(); renderOnline(); renderList();
      A.onChange(function () { renderFoot(); });   // login/logout swaps the footer
    }

    function setOpen(v) {
      openPanel = v;
      el.box.classList.toggle('show', v);
      el.fab.style.display = v ? 'none' : 'flex';
      if (v) { el.list.scrollTop = el.list.scrollHeight; if (el.input) el.input.focus(); }
    }

    function renderFoot() {
      if (!el.foot) return;
      if (A.isLoggedIn()) {
        el.foot.innerHTML = '<textarea id="gmtChatIn" maxlength="500" placeholder="Message…"></textarea><div class="gmt-flash" id="gmtFlash"></div>';
        el.input = el.foot.querySelector('#gmtChatIn');
        el.flash = el.foot.querySelector('#gmtFlash');
        el.input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(el.input.value); }
        });
      } else {
        el.foot.innerHTML = '<button class="gmt-chat-login" id="gmtChatLogin">Log in to chat</button><div class="gmt-flash" id="gmtFlash"></div>';
        el.flash = el.foot.querySelector('#gmtFlash');
        el.foot.querySelector('#gmtChatLogin').addEventListener('click', function () { if (A.openLogin) A.openLogin('login'); });
      }
    }
    function flash(m) { if (el.flash) { el.flash.textContent = m; setTimeout(function () { if (el.flash) el.flash.textContent = ''; }, 2500); } }

    function renderList() {
      if (!el.list) return;
      var mine = A.isLoggedIn() ? A.user.id : null, mod = A.isMod();
      var atBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 40;
      el.list.innerHTML = messages.map(function (m) {
        var canDel = mod || (mine && m.user_id === mine);
        var controls = '';
        if (canDel) controls += '<span class="mod" data-del="' + m.id + '" title="Delete">✕</span>';
        if (mod && (!mine || m.user_id !== mine)) controls += '<span class="mod" data-ban="' + esc(m.user_id) + '" data-name="' + esc(m.username) + '" title="Ban user">🚫</span>';
        return '<div class="gmt-msg"><span class="u" style="color:' + color(m.user_id) + '">' + esc(m.username) + '</span> ' + esc(m.body) + controls + '</div>';
      }).join('');
      if (atBottom) el.list.scrollTop = el.list.scrollHeight;
    }

    // delegated mod actions
    document.addEventListener('click', function (e) {
      var d = e.target.getAttribute && e.target.getAttribute('data-del');
      var b = e.target.getAttribute && e.target.getAttribute('data-ban');
      if (d) del(d);
      else if (b) ban(b, e.target.getAttribute('data-name'));
    });

    function renderOnline() {
      var hdr = document.getElementById('gmtOnline');
      if (hdr) hdr.innerHTML = '<span class="dot"></span>' + online + ' online';
      if (el.fabN) el.fabN.textContent = online;
      if (el.online2) el.online2.textContent = online + ' online';
    }

    loadHistory();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})();
