/* GMT Optimizer — account layer (Phase 2 step 1: auth pipe).
   ==========================================================
   Username + password only. There is no email: a username maps to a synthetic
   internal address so Supabase's hardened password auth does the real work while
   the user only ever types a username. No email also means no password reset —
   the signup screen says so plainly (min 8 chars, save it).

   This step proves the pipe: sign up, log in, log out, and show the logged-in
   username in the header. Fleet cloud-sync and profile editing (display name,
   avatar) layer on next, once we've confirmed a real account round-trips.

   Loads only if window.GMT_SUPABASE holds real values; otherwise it no-ops so the
   console is unaffected before setup. */
(function () {
  'use strict';

  var CFG = window.GMT_SUPABASE || {};
  var READY = CFG.url && CFG.anonKey &&
    CFG.url.indexOf('PASTE_') === -1 && CFG.anonKey.indexOf('PASTE_') === -1;

  // Public API stub so callers (fleet.js later) can always reference it safely.
  var Account = window.GMTAccount = {
    ready: READY, user: null, profile: null,
    isLoggedIn: function () { return !!Account.user; },
    _listeners: [],
    onChange: function (cb) { Account._listeners.push(cb); }
  };
  function emit() { Account._listeners.forEach(function (cb) { try { cb(Account); } catch (e) {} }); }

  if (!READY) { return; }   // not configured yet — stay dormant, console untouched

  var sb = window.supabase.createClient(CFG.url, CFG.anonKey);
  Account.sb = sb;

  // ---- username <-> synthetic email ----
  var EMAIL_DOMAIN = 'users.gmt-optimizer.local';
  var emailFor = function (u) { return u.trim().toLowerCase() + '@' + EMAIL_DOMAIN; };
  var USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

  // Human-readable errors instead of raw Supabase strings.
  function friendly(err, mode) {
    var m = (err && err.message ? err.message : String(err)).toLowerCase();
    if (m.indexOf('already registered') >= 0 || m.indexOf('already exists') >= 0) return 'That username is taken.';
    if (m.indexOf('invalid login') >= 0) return 'Wrong username or password.';
    if (m.indexOf('password') >= 0 && m.indexOf('at least') >= 0) return 'Password must be at least 8 characters.';
    return (mode === 'signup' ? 'Could not create the account. ' : 'Could not log in. ') + (err && err.message ? err.message : '');
  }

  Account.signUp = function (username, password) {
    if (!USERNAME_RE.test(username)) return Promise.reject(new Error('Username must be 3–20 letters, numbers or underscores.'));
    if (!password || password.length < 8) return Promise.reject(new Error('Password must be at least 8 characters.'));
    var email = emailFor(username);
    return sb.auth.signUp({
      email: email, password: password,
      options: { data: { username: username.trim() } }
    }).then(function (res) {
      if (res.error) throw new Error(friendly(res.error, 'signup'));
      if (res.data && res.data.session) return res.data;   // already logged in
      // No session means the dashboard still has email-confirmation on. The
      // auto_confirm trigger has already stamped the account, so a direct
      // sign-in succeeds — the confirm-email toggle no longer matters.
      return sb.auth.signInWithPassword({ email: email, password: password })
        .then(function (r2) { if (r2.error) throw new Error(friendly(r2.error, 'signup')); return r2.data; });
    });
  };

  Account.signIn = function (username, password) {
    return sb.auth.signInWithPassword({ email: emailFor(username), password: password })
      .then(function (res) {
        if (res.error) throw new Error(friendly(res.error, 'login'));
        return res.data;
      });
  };

  Account.signOut = function () { return sb.auth.signOut(); };

  // Load the caller's profile row (username, display_name, avatar, role).
  function loadProfile() {
    if (!Account.user) { Account.profile = null; return Promise.resolve(null); }
    return sb.from('profiles').select('username,display_name,avatar_url,role')
      .eq('id', Account.user.id).single()
      .then(function (r) { Account.profile = r.data || null; return Account.profile; });
  }

  // ---- session tracking ----
  function setSession(session) {
    Account.user = session ? session.user : null;
    (Account.user ? loadProfile() : Promise.resolve()).then(function () { emit(); renderHeader(); });
  }
  sb.auth.getSession().then(function (r) { setSession(r.data.session); });
  sb.auth.onAuthStateChange(function (_evt, session) { setSession(session); });

  // ===========================================================================
  // UI: a header slot + a modal. Self-contained so the console HTML barely changes.
  // ===========================================================================
  var STYLE =
    '#gmtAccountSlot{display:flex;align-items:center;gap:.5rem;font-size:.82rem}' +
    '.gmt-acc-btn{background:var(--glass-1,rgba(255,255,255,.06));border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text1,#e8ecf4);border-radius:9px;padding:.4rem .7rem;cursor:pointer;font-size:.8rem}' +
    '.gmt-acc-btn:hover{border-color:var(--gold,#f5a623);color:var(--gold-soft,#ffd479)}' +
    '.gmt-acc-name{font-family:var(--mono,monospace);color:var(--gold-soft,#ffd479)}' +
    '.gmt-modal-bg{position:fixed;inset:0;background:rgba(4,6,12,.72);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:9999}' +
    '.gmt-modal-bg.show{display:flex}' +
    '.gmt-modal{width:min(360px,92vw);background:linear-gradient(180deg,#141824,#0e111a);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:16px;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    '.gmt-modal h3{margin:0 0 .3rem;font-size:1.15rem;color:var(--text1,#e8ecf4)}' +
    '.gmt-modal .sub{font-size:.78rem;color:var(--text3,#8a90a0);margin-bottom:1rem}' +
    '.gmt-modal label{display:block;font-size:.72rem;color:var(--text3,#8a90a0);margin:.6rem 0 .25rem}' +
    '.gmt-modal input{width:100%;background:var(--glass-1,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text1,#e8ecf4);border-radius:9px;padding:.6rem .7rem;font-size:.9rem}' +
    '.gmt-modal .go{width:100%;margin-top:1rem;background:var(--gold,#f5a623);color:#1a1205;border:none;border-radius:10px;padding:.7rem;font-weight:700;cursor:pointer;font-size:.9rem}' +
    '.gmt-modal .go:disabled{opacity:.6;cursor:default}' +
    '.gmt-modal .swap{margin-top:.9rem;text-align:center;font-size:.78rem;color:var(--text3,#8a90a0)}' +
    '.gmt-modal .swap a{color:var(--gold-soft,#ffd479);cursor:pointer}' +
    '.gmt-modal .err{margin-top:.7rem;font-size:.78rem;color:#ff8080;min-height:1em}' +
    '.gmt-modal .note{margin-top:.7rem;font-size:.7rem;color:var(--text4,#6a7080);line-height:1.4}' +
    '.gmt-modal .x{float:right;background:none;border:none;color:var(--text4,#6a7080);font-size:1.2rem;cursor:pointer;line-height:1}';

  var modal, els = {}, mode = 'login';

  function buildModal() {
    var s = document.createElement('style'); s.textContent = STYLE; document.head.appendChild(s);
    modal = document.createElement('div'); modal.className = 'gmt-modal-bg';
    modal.innerHTML =
      '<div class="gmt-modal">' +
        '<button class="x" data-close>&times;</button>' +
        '<h3 id="gmtModalTitle">Log in</h3>' +
        '<div class="sub" id="gmtModalSub">Welcome back.</div>' +
        '<label>Username</label><input id="gmtU" autocomplete="username" maxlength="20">' +
        '<label>Password</label><input id="gmtP" type="password" autocomplete="current-password">' +
        '<div class="err" id="gmtErr"></div>' +
        '<button class="go" id="gmtGo">Log in</button>' +
        '<div class="note" id="gmtNote"></div>' +
        '<div class="swap" id="gmtSwap"></div>' +
      '</div>';
    document.body.appendChild(modal);
    els.title = modal.querySelector('#gmtModalTitle');
    els.sub = modal.querySelector('#gmtModalSub');
    els.u = modal.querySelector('#gmtU');
    els.p = modal.querySelector('#gmtP');
    els.err = modal.querySelector('#gmtErr');
    els.go = modal.querySelector('#gmtGo');
    els.note = modal.querySelector('#gmtNote');
    els.swap = modal.querySelector('#gmtSwap');
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.hasAttribute('data-close')) close(); });
    els.go.addEventListener('click', submit);
    els.p.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setMode('login');
  }

  function setMode(m) {
    mode = m; els.err.textContent = '';
    if (m === 'login') {
      els.title.textContent = 'Log in'; els.sub.textContent = 'Welcome back.';
      els.go.textContent = 'Log in'; els.p.setAttribute('autocomplete', 'current-password');
      els.note.textContent = '';
      els.swap.innerHTML = 'New here? <a data-to="signup">Create an account</a>';
    } else {
      els.title.textContent = 'Create an account'; els.sub.textContent = 'Just a username and password — no email.';
      els.go.textContent = 'Create account'; els.p.setAttribute('autocomplete', 'new-password');
      els.note.textContent = 'There is no email recovery — if you forget your password you lose the account, so save it somewhere safe. Minimum 8 characters.';
      els.swap.innerHTML = 'Already have one? <a data-to="login">Log in</a>';
    }
    els.swap.querySelector('a').addEventListener('click', function () { setMode(this.getAttribute('data-to')); });
  }

  function open(m) { setMode(m || 'login'); modal.classList.add('show'); setTimeout(function () { els.u.focus(); }, 30); }
  function close() { modal.classList.remove('show'); els.u.value = ''; els.p.value = ''; els.err.textContent = ''; }

  function submit() {
    var u = els.u.value.trim(), p = els.p.value;
    els.err.textContent = ''; els.go.disabled = true;
    var op = mode === 'signup' ? Account.signUp(u, p) : Account.signIn(u, p);
    op.then(function () { els.go.disabled = false; close(); })
      .catch(function (e) { els.go.disabled = false; els.err.textContent = e.message || String(e); });
  }

  // ---- header slot ----
  function renderHeader() {
    var slot = document.getElementById('gmtAccountSlot');
    if (!slot) return;
    if (Account.isLoggedIn()) {
      var name = (Account.profile && Account.profile.display_name) || (Account.profile && Account.profile.username) || 'account';
      slot.innerHTML = '<span class="gmt-acc-name">' + escapeHtml(name) + '</span>' +
        '<button class="gmt-acc-btn" id="gmtLogout">Log out</button>';
      slot.querySelector('#gmtLogout').addEventListener('click', function () { Account.signOut(); });
    } else {
      slot.innerHTML = '<button class="gmt-acc-btn" id="gmtLoginBtn">Log in</button>';
      slot.querySelector('#gmtLoginBtn').addEventListener('click', function () { open('login'); });
    }
  }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  Account.openLogin = function (m) { open(m); };

  function mount() { buildModal(); renderHeader(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
