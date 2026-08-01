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
    var messages = [], online = 0, mounted = false, collapsed = false;
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
      return sb.from('messages').select('id,user_id,username,avatar_url,body,created_at')
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
      var av = (A.profile && A.profile.avatar_url) || null;
      sb.from('messages').insert({ user_id: A.user.id, username: name, avatar_url: av, body: body })
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
    // UI  (styles live in assets/accounts.css)
    // ===========================================================================
    var POPOUT = window.GMT_CHAT_POPOUT === true;   // running in the detached /chat window
    var POPOUT_KEY = 'gmt_chat_popout';             // localStorage flag: a detached window is open
    function popoutIsOpen() { try { return localStorage.getItem(POPOUT_KEY) === '1'; } catch (e) { return false; } }
    // The detached window owns the flag: sets it while alive, clears it on close, so
    // the main window's dock hides while it's out — even across a main-window reload.
    if (POPOUT) {
      try { localStorage.setItem(POPOUT_KEY, '1'); } catch (e) {}
      var _clr = function () { try { localStorage.removeItem(POPOUT_KEY); } catch (e) {} };
      window.addEventListener('pagehide', _clr);
      window.addEventListener('beforeunload', _clr);
    }

    function mount() {
      if (mounted) return; mounted = true;

      // A right-side dock (Twitch-style): collapses to a thin rail at the edge and
      // expands back out. The detached /chat window fills its viewport instead.
      var head =
        '<div class="gmt-chat-head"><div><div class="t">Global Chat</div><div class="o" id="gmtChatOnline">0 online</div></div>' +
        '<div class="gmt-chat-ctl">' +
          (POPOUT ? '' :
            '<button class="ci" data-pop title="Pop out into its own window">&#8599;</button>' +
            '<button class="ci" data-collapse title="Collapse to the side">&#8250;</button>') +
        '</div></div>';
      var rail = POPOUT ? '' :
        '<div class="gmt-chat-rail" data-expand title="Open chat">' +
          '<button class="rail-btn">&#8249;</button><span class="rail-label">CHAT</span>' +
          '<span class="rail-n" id="gmtRailN">0</span>' +
        '</div>';
      var box = document.createElement('div'); box.className = 'gmt-chat' + (POPOUT ? ' popout' : ' gmt-dock');
      box.innerHTML = rail +
        '<div class="gmt-chat-body">' + head +
          '<div class="gmt-chat-list" id="gmtChatList"></div>' +
          '<div class="gmt-chat-foot" id="gmtChatFoot"></div>' +
        '</div>';
      document.body.appendChild(box); el.box = box;
      el.list = box.querySelector('#gmtChatList');
      el.online2 = box.querySelector('#gmtChatOnline');
      el.foot = box.querySelector('#gmtChatFoot');
      el.railN = box.querySelector('#gmtRailN');

      if (!POPOUT) {
        box.querySelector('[data-expand]').addEventListener('click', function () { setCollapsed(false); });
        box.querySelector('[data-collapse]').addEventListener('click', function () { setCollapsed(true); });
        box.querySelector('[data-pop]').addEventListener('click', function () {
          var w = window.open('/chat/', 'gmtchat', 'width=400,height=660,menubar=no,toolbar=no,location=no');
          if (w) {
            try { localStorage.setItem(POPOUT_KEY, '1'); } catch (e) {}   // hide the dock immediately
            updateVisibility();
            var t = setInterval(function () {   // restore the dock when the window closes
              if (w.closed) { clearInterval(t); try { localStorage.removeItem(POPOUT_KEY); } catch (e) {} updateVisibility(); }
            }, 600);
          }
        });
        // React to the flag changing in the other window (open/close of the popout).
        window.addEventListener('storage', function (e) { if (e.key === POPOUT_KEY) updateVisibility(); });
        // Resting state: remember the user's choice; default collapsed on narrow screens.
        var saved; try { saved = localStorage.getItem('gmt_chat_collapsed'); } catch (e) {}
        setCollapsed(saved != null ? saved === '1' : window.innerWidth < 1000);
      }

      renderFoot(); renderOnline(); renderList(); updateVisibility();
      // Re-render the list too: mod controls depend on the role, which loads a beat
      // after mount — without this, a mod/admin never sees delete/ban until the next
      // message arrives.
      A.onChange(function () { renderFoot(); updateVisibility(); renderList(); });
    }

    // The console is gated behind login, so the chat dock only shows when logged in.
    function updateVisibility() {
      if (!el.box || POPOUT) return;
      // Hidden when logged out, or while a detached popout window is open.
      el.box.style.display = (A.isLoggedIn() && !popoutIsOpen()) ? 'flex' : 'none';
    }

    function setCollapsed(v) {
      if (POPOUT) return;
      collapsed = v;
      el.box.classList.toggle('collapsed', v);
      try { localStorage.setItem('gmt_chat_collapsed', v ? '1' : '0'); } catch (e) {}
      if (!v) { el.list.scrollTop = el.list.scrollHeight; if (el.input) el.input.focus(); }
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

    function avatarHTML(m) {
      if (m.avatar_url) return '<img class="gmt-msg-av" src="' + esc(m.avatar_url) + '" alt="">';
      // Fallback monogram tinted to the user's color.
      var initial = (m.username || '?').charAt(0).toUpperCase();
      return '<span class="gmt-msg-av gmt-msg-mono" style="background:' + color(m.user_id) + '">' + esc(initial) + '</span>';
    }
    function renderList() {
      if (!el.list) return;
      var mine = A.isLoggedIn() ? A.user.id : null, mod = A.isMod();
      var atBottom = el.list.scrollHeight - el.list.scrollTop - el.list.clientHeight < 40;
      el.list.innerHTML = messages.map(function (m) {
        var canDel = mod || (mine && m.user_id === mine);
        var controls = '';
        if (canDel) controls += '<span class="mod" data-del="' + m.id + '" title="Delete">✕</span>';
        if (mod && (!mine || m.user_id !== mine)) controls += '<span class="mod" data-ban="' + esc(m.user_id) + '" data-name="' + esc(m.username) + '" title="Ban user">🚫</span>';
        return '<div class="gmt-msg">' + avatarHTML(m) +
          '<div class="gmt-msg-txt"><span class="u" data-user="' + esc(m.user_id) + '" style="color:' + color(m.user_id) + '" title="View profile">' + esc(m.username) + '</span> ' +
          esc(m.body) + controls + '</div></div>';
      }).join('');
      if (atBottom) el.list.scrollTop = el.list.scrollHeight;
    }

    // ---- user card: a Twitch-style popover anchored near the clicked username ----
    var card;
    function buildUserCard() {
      card = document.createElement('div'); card.className = 'gmt-uc'; card.style.display = 'none';
      document.body.appendChild(card);
      // Close on outside click (but not when clicking another username, which reopens it).
      document.addEventListener('mousedown', function (e) {
        if (card.style.display === 'none') return;
        if (card.contains(e.target)) return;
        if (e.target.getAttribute && e.target.getAttribute('data-user')) return;
        hideCard();
      });
    }
    function hideCard() { if (card) card.style.display = 'none'; }
    function positionCard(anchor) {
      // On a phone, anchoring beside a tapped name is fiddly — just center it.
      if (!anchor || window.innerWidth <= 700) {
        card.style.left = '50%'; card.style.top = '50%'; card.style.transform = 'translate(-50%,-50%)';
        return;
      }
      card.style.transform = '';
      var r = anchor.getBoundingClientRect(), cw = card.offsetWidth || 300, ch = card.offsetHeight || 260;
      var left = r.left - cw - 12;                                   // prefer left of the name (chat is docked right)
      if (left < 8) left = Math.min(r.right + 12, window.innerWidth - cw - 8);
      var top = Math.min(Math.max(r.top - 10, 8), window.innerHeight - ch - 8);
      card.style.left = left + 'px'; card.style.top = top + 'px';
    }
    function openUserCard(userId, anchor) {
      if (!card) buildUserCard();
      card.innerHTML = '<button class="uc-x" title="Close">&times;</button><div class="uc-inner"><div class="uc-loading">Loading…</div></div>';
      card.style.display = 'block'; positionCard(anchor);
      card.querySelector('.uc-x').addEventListener('click', hideCard);
      A.fetchUserCard(userId).then(function (d) {
        var p = d.profile || {};
        var joined = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
        var name = p.display_name || p.username || 'miner';
        var col = color(userId);
        var roleBadge = (p.role === 'admin' || p.role === 'mod')
          ? '<span class="uc-role uc-role-' + p.role + '">' + p.role + '</span>' : '';
        var av = p.avatar_url
          ? '<img class="uc-av" src="' + esc(p.avatar_url) + '" alt="">'
          : '<span class="uc-av uc-mono" style="background:' + col + '">' + esc(name.charAt(0).toUpperCase()) + '</span>';
        var modBtn = (A.isMod() && userId !== (A.user && A.user.id))
          ? '<button class="gmt-btn-ghost uc-ban" data-ban="' + esc(userId) + '" data-name="' + esc(name) + '">Ban user</button>' : '';
        card.querySelector('.uc-inner').innerHTML =
          '<div class="uc-banner" style="background:linear-gradient(120deg,' + col + ',var(--bg2))"></div>' +
          '<div class="uc-head">' + av +
            '<div class="uc-idwrap"><div class="uc-name">' + esc(name) + roleBadge + '</div>' +
            '<div class="uc-user">@' + esc(p.username || '') + '</div></div></div>' +
          (p.bio ? '<div class="uc-bio">' + esc(p.bio) + '</div>' : '') +
          '<div class="uc-info">' +
            '<div><span class="uc-ic">📅</span> Joined <b>' + joined + '</b></div>' +
            '<div><span class="uc-ic">💬</span> <b>' + d.msgCount + '</b> message' + (d.msgCount === 1 ? '' : 's') + ' sent</div>' +
            '<div><span class="uc-ic">⛏️</span> <b>' + Math.round(p.th_total || 0).toLocaleString('en-US') + '</b> TH fleet</div>' +
          '</div>' + (modBtn ? '<div class="uc-actions">' + modBtn + '</div>' : '');
        positionCard(anchor);   // re-clamp now that the card has its real height
      }).catch(function () { card.querySelector('.uc-inner').innerHTML = '<div class="uc-loading">Could not load profile.</div>'; });
    }

    // delegated actions: mod controls, username -> card, ban-from-card
    document.addEventListener('click', function (e) {
      var t = e.target; if (!t.getAttribute) return;
      var d = t.getAttribute('data-del');
      var b = t.getAttribute('data-ban');
      var u = t.getAttribute('data-user');
      if (d) del(d);
      else if (b) { ban(b, t.getAttribute('data-name')); hideCard(); }
      else if (u) openUserCard(u, t);
    });

    function renderOnline() {
      var hdr = document.getElementById('gmtOnline');
      if (hdr) hdr.innerHTML = '<span class="dot"></span>' + online + ' online';
      if (el.railN) el.railN.textContent = online;
      if (el.online2) el.online2.textContent = online + ' online';
    }

    loadHistory();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  }
})();
