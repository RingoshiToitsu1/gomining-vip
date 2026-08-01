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

  // In-app browsers (Telegram, Instagram, Facebook, etc.) run an embedded WebView
  // that restricts the storage Supabase auth needs, so signup/login silently fails.
  // We can't fix their WebView — we detect it and tell the user to open in a real
  // browser. Critical here because the launch link is posted to Telegram.
  var UA = navigator.userAgent || '';
  var IN_APP = /Telegram|Instagram|FBAN|FBAV|FB_IAB|FBIOS|MicroMessenger|Line\/|Snapchat|Twitter|TikTok/i.test(UA);

  // Public API stub so callers (fleet.js later) can always reference it safely.
  var Account = window.GMTAccount = {
    ready: READY, user: null, profile: null,
    isLoggedIn: function () { return !!Account.user; },
    role: function () { return (Account.profile && Account.profile.role) || 'user'; },
    isMod: function () { var r = Account.role(); return r === 'mod' || r === 'admin'; },
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
    return sb.from('profiles').select('username,display_name,avatar_url,bio,role,setup')
      .eq('id', Account.user.id).single()
      .then(function (r) { Account.profile = r.data || null; return Account.profile; });
  }

  // ---- fleet (cloud store; fleet.js falls back to localStorage when logged out) ----
  Account.getMiners = function () {
    if (!Account.user) return Promise.resolve([]);
    return sb.from('miners').select('collection,code,th,wth').eq('user_id', Account.user.id)
      .order('created_at')
      .then(function (r) {
        if (r.error) throw r.error;
        return (r.data || []).map(function (m) {
          return { collection: m.collection, code: m.code, th: m.th, wth: m.wth };
        });
      });
  };
  // Replace the whole fleet: delete the user's rows, insert the current set. Not
  // atomic, but the data is low-stakes and a fleet is a handful of rows. Also
  // caches the total TH on the profile (for user cards + the site-wide total).
  Account.saveMiners = function (rows) {
    if (!Account.user) return Promise.resolve();
    var uid = Account.user.id;
    var clean = (rows || []).filter(function (r) { return (+r.th || 0) > 0; }).map(function (r) {
      return { user_id: uid, collection: r.collection || null, code: r.code || null, th: +r.th || 0, wth: +r.wth || 15 };
    });
    var total = clean.reduce(function (s, r) { return s + r.th; }, 0);
    return sb.from('miners').delete().eq('user_id', uid).then(function () {
      return clean.length ? sb.from('miners').insert(clean) : { error: null };
    }).then(function (r) {
      if (r && r.error) throw r.error;
      return sb.from('profiles').update({ th_total: total }).eq('id', uid);
    }).then(function () {});
  };

  // Public user card: profile fields anyone may read, plus their message count.
  Account.fetchUserCard = function (userId) {
    return Promise.all([
      sb.from('profiles').select('username,display_name,avatar_url,bio,created_at,th_total,role')
        .eq('id', userId).single(),
      sb.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    ]).then(function (res) {
      return { profile: res[0].data || {}, msgCount: res[1].count || 0 };
    });
  };
  Account.banUser = function (userId) {
    return sb.from('profiles').update({ banned: true }).eq('id', userId)
      .then(function (r) { if (r.error) throw r.error; });
  };
  // The full console setup ("[username]" primary profile), saved by the Save button.
  Account.saveSetup = function (obj) {
    if (!Account.user) return Promise.resolve();
    if (Account.profile) Account.profile.setup = obj;
    return sb.from('profiles').update({ setup: obj }).eq('id', Account.user.id)
      .then(function (r) { if (r.error) throw r.error; });
  };

  // ---- profile ----
  Account.updateProfile = function (patch) {
    if (!Account.user) return Promise.reject(new Error('not logged in'));
    return sb.from('profiles').update(patch).eq('id', Account.user.id)
      .then(function (r) { if (r.error) throw r.error; return loadProfile(); })
      .then(function () { renderHeader(); emit(); });
  };
  Account.uploadAvatar = function (file) {
    if (!Account.user) return Promise.reject(new Error('not logged in'));
    var ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    var path = Account.user.id + '/avatar.' + ext;
    return sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      .then(function (r) {
        if (r.error) throw r.error;
        var url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?t=' + Date.now();
        return Account.updateProfile({ avatar_url: url });
      });
  };

  // ---- session tracking ----
  var _synced = false;
  function setSession(session) {
    Account.user = session ? session.user : null;
    if (!Account.user) _synced = false;
    (Account.user ? loadProfile() : Promise.resolve()).then(function () {
      // Once per login, hand the account's saved setup to app.js, which makes the
      // "[username]" profile the default in Saved Setups and restores its inputs.
      if (Account.user && !_synced && typeof window.gmtSyncAccountProfile === 'function') {
        _synced = true;
        try { window.gmtSyncAccountProfile(); } catch (e) {}
      }
      emit(); renderHeader();
    });
  }
  sb.auth.getSession().then(function (r) { setSession(r.data.session); });
  sb.auth.onAuthStateChange(function (_evt, session) { setSession(session); });

  // ===========================================================================
  // UI: a header slot + a modal. Self-contained so the console HTML barely changes.
  // ===========================================================================
  // (styles live in assets/accounts.css)
  var modal, els = {}, mode = 'login';

  function buildModal() {
    modal = document.createElement('div'); modal.className = 'gmt-modal-bg';
    modal.innerHTML =
      '<div class="gmt-modal">' +
        '<button class="x" data-close>&times;</button>' +
        '<h3 id="gmtModalTitle">Log in</h3>' +
        '<div class="sub" id="gmtModalSub">Welcome back.</div>' +
        '<div class="gmt-inapp" id="gmtInApp" style="display:none"></div>' +
        '<label>Username</label><input id="gmtU" autocomplete="username" maxlength="20">' +
        '<label>Password</label><input id="gmtP" type="password" autocomplete="current-password" minlength="8">' +
        '<div class="pw-hint">Must be at least 8 characters.</div>' +
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

  function open(m) {
    setMode(m || 'login');
    var w = modal.querySelector('#gmtInApp');
    if (w) {
      if (IN_APP) {
        w.style.display = 'block';
        w.innerHTML = '⚠️ You\'re in an in-app browser (Telegram, Instagram, etc.), which can block sign-in. ' +
          'Open this page in your normal browser: <button class="gmt-inapp-copy" type="button">Copy link</button>';
        var btn = w.querySelector('.gmt-inapp-copy');
        btn.addEventListener('click', function () {
          var url = location.href;
          var done = function () { btn.textContent = 'Copied — paste in Safari/Chrome'; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
          else { try { var t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); } catch (e) {} }
        });
      } else { w.style.display = 'none'; }
    }
    modal.classList.add('show'); setTimeout(function () { els.u.focus(); }, 30);
  }
  function close() { modal.classList.remove('show'); els.u.value = ''; els.p.value = ''; els.err.textContent = ''; }

  function submit() {
    var u = els.u.value.trim(), p = els.p.value;
    els.err.textContent = '';
    // Length check up front on BOTH modes, so login gives a clear reason instead
    // of the generic "wrong username or password".
    if (!p || p.length < 8) { els.err.textContent = 'Password must be at least 8 characters.'; return; }
    els.go.disabled = true;
    var op = mode === 'signup' ? Account.signUp(u, p) : Account.signIn(u, p);
    op.then(function () { els.go.disabled = false; close(); })
      .catch(function (e) { els.go.disabled = false; els.err.textContent = e.message || String(e); });
  }

  // ---- header slot ----
  function renderHeader() {
    // When logged in, the "Edit Setup" nav link reads "My Fleet" — it's where you
    // build your fleet and edit your setup/profile.
    var navLink = document.getElementById('navEditSetup');
    if (navLink) navLink.textContent = Account.isLoggedIn() ? 'My Fleet' : 'Edit Setup';
    renderGate();
    var slot = document.getElementById('gmtAccountSlot');
    if (!slot) return;
    if (Account.isLoggedIn()) {
      var p = Account.profile || {};
      var name = p.display_name || p.username || 'account';
      var av = p.avatar_url ? '<img class="gmt-acc-av" src="' + escapeHtml(p.avatar_url) + '" alt="">' : '';
      slot.innerHTML =
        av + '<span class="gmt-acc-name" id="gmtProfBtn" title="Edit profile">' + escapeHtml(name) + '</span>' +
        '<button class="gmt-acc-btn" id="gmtLogout">Log out</button>';
      slot.querySelector('#gmtProfBtn').addEventListener('click', openProfile);
      slot.querySelector('#gmtLogout').addEventListener('click', function () { Account.signOut(); });
    } else {
      slot.innerHTML = '<button class="gmt-acc-btn" id="gmtLoginBtn">Log in</button>';
      slot.querySelector('#gmtLoginBtn').addEventListener('click', function () { open('login'); });
    }
  }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---- profile modal ----
  var pModal, pEls = {};
  function buildProfileModal() {
    pModal = document.createElement('div'); pModal.className = 'gmt-modal-bg';
    pModal.innerHTML =
      '<div class="gmt-modal">' +
        '<button class="x" data-close>&times;</button>' +
        '<h3>Your profile</h3>' +
        '<div class="sub" id="gmtProfUser"></div>' +
        '<div class="gmt-prof-avwrap">' +
          '<img class="gmt-prof-av" id="gmtProfAv" alt="">' +
          '<button class="gmt-prof-avbtn" id="gmtProfAvBtn">Change picture</button>' +
          '<input type="file" accept="image/*" id="gmtProfFile" style="display:none">' +
        '</div>' +
        '<label>Display name</label><input id="gmtProfName" maxlength="40">' +
        '<label>Bio</label><textarea id="gmtProfBio" maxlength="200" rows="3" style="width:100%;background:var(--glass-1,rgba(255,255,255,.05));border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text1,#e8ecf4);border-radius:9px;padding:.6rem .7rem;font-size:.88rem;resize:vertical;font-family:inherit"></textarea>' +
        '<div class="err" id="gmtProfErr"></div><div class="ok" id="gmtProfOk"></div>' +
        '<button class="go" id="gmtProfSave">Save</button>' +
      '</div>';
    document.body.appendChild(pModal);
    pEls.user = pModal.querySelector('#gmtProfUser');
    pEls.av = pModal.querySelector('#gmtProfAv');
    pEls.file = pModal.querySelector('#gmtProfFile');
    pEls.name = pModal.querySelector('#gmtProfName');
    pEls.bio = pModal.querySelector('#gmtProfBio');
    pEls.err = pModal.querySelector('#gmtProfErr');
    pEls.ok = pModal.querySelector('#gmtProfOk');
    pEls.save = pModal.querySelector('#gmtProfSave');
    pModal.addEventListener('click', function (e) { if (e.target === pModal || e.target.hasAttribute('data-close')) pModal.classList.remove('show'); });
    pModal.querySelector('#gmtProfAvBtn').addEventListener('click', function () { pEls.file.click(); });
    pEls.file.addEventListener('change', function () {
      if (!pEls.file.files[0]) return;
      pEls.err.textContent = ''; pEls.ok.textContent = 'Uploading…';
      Account.uploadAvatar(pEls.file.files[0])
        .then(function () { pEls.ok.textContent = 'Picture updated.'; pEls.av.src = (Account.profile && Account.profile.avatar_url) || ''; })
        .catch(function (e) { pEls.ok.textContent = ''; pEls.err.textContent = e.message || 'Upload failed.'; });
    });
    pEls.save.addEventListener('click', function () {
      pEls.err.textContent = ''; pEls.ok.textContent = ''; pEls.save.disabled = true;
      Account.updateProfile({ display_name: pEls.name.value.trim() || null, bio: pEls.bio.value.trim() || null })
        .then(function () { pEls.save.disabled = false; pEls.ok.textContent = 'Saved.'; })
        .catch(function (e) { pEls.save.disabled = false; pEls.err.textContent = e.message || 'Save failed.'; });
    });
  }
  function openProfile() {
    if (!pModal) buildProfileModal();
    var p = Account.profile || {};
    pEls.user.textContent = '@' + (p.username || '');
    pEls.name.value = p.display_name || '';
    pEls.bio.value = p.bio || '';
    pEls.av.src = p.avatar_url || '';
    pEls.err.textContent = ''; pEls.ok.textContent = '';
    pModal.classList.add('show');
  }

  // Results gate: let a logged-out visitor build their fleet freely (the fleet
  // editor is a fixed .sp-page that floats above this), but blur the calculated
  // data and prompt them to make an account to reveal it and save the fleet.
  // The card adapts to whether they've entered any miners yet (window.GMTFleet,
  // broadcast by fleet.js via the 'gmt-fleet' event).
  var GATE_IDS = ['tab-current', 'tab-planner'];
  function fleetState() { return window.GMTFleet || { count: 0, th: 0 }; }
  function gateCardHTML() {
    var f = fleetState();
    if (f.count > 0) {
      return '<div class="card">' +
        '<h3>Your fleet is ready</h3>' +
        '<div class="fleetstat">' + f.count + ' miner' + (f.count === 1 ? '' : 's') +
          ' &middot; ' + Math.round(f.th).toLocaleString('en-US') + ' TH</div>' +
        '<p>Create a free account to reveal what it earns — live P&amp;L, your fee discount, and multi-year projections — and save your fleet across devices.</p>' +
        '<div class="btns"><button class="gmt-btn-primary" data-g="signup">Create account</button>' +
        '<button class="gmt-btn-ghost" data-g="login">Log in</button></div>' +
        '<div class="lyd"><a data-g="fleet">Edit my fleet</a></div></div>';
    }
    return '<div class="card">' +
      '<h3>See what your fleet earns</h3>' +
      '<p>Add your miners and we\'ll calculate your live P&amp;L, fee discount, and multi-year projections — free.</p>' +
      '<div class="btns"><button class="gmt-btn-primary" data-g="fleet">Add my miners</button></div>' +
      '<div class="lyd">Already have an account? <a data-g="login">Log in</a></div></div>';
  }
  function wireGate(g) {
    g.querySelectorAll('[data-g]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-g');
        if (k === 'signup') open('signup');
        else if (k === 'login') open('login');
        else if (k === 'fleet' && typeof window.openEditSetup === 'function') window.openEditSetup();
      });
    });
  }
  function renderGate() {
    if (!READY) return;   // accounts not configured -> don't gate anyone
    GATE_IDS.forEach(function (id) {
      var host = document.getElementById(id); if (!host) return;
      var g = host.querySelector(':scope > .gmt-resgate');
      if (Account.isLoggedIn()) { if (g) g.remove(); return; }
      if (!g) {
        g = document.createElement('div'); g.className = 'gmt-resgate';
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(g);
      }
      g.innerHTML = gateCardHTML();
      wireGate(g);
    });
  }

  Account.openLogin = function (m) { open(m); };

  function mount() {
    buildModal(); renderHeader();
    // Re-render the gate card when the fleet changes (empty -> has miners).
    document.addEventListener('gmt-fleet', function () { if (!Account.isLoggedIn()) renderGate(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
