/* GMT-Optimizer account pages: /login, /signup, /profile, /settings, /dashboard.
   =============================================================================
   One script for all five; each page sets <main data-acct="login|signup|profile|settings|dashboard">.
   Built on assets/account.js (window.GMTAccount), which owns every Supabase call. Nothing here talks to
   the backend directly except two public reads (a profile by username, a user's miners via account.js).
   Uses only what the backend already stores: username, display_name, avatar_url, bio, role, created_at,
   th_total, setup (the saved console inputs), the miners table and the messages count.
   No email, no password reset, no magic link: a forgotten password is reset by hand over Telegram.
*/
(function () {
  'use strict';
  var A = window.GMTAccount;
  var root = document.querySelector('[data-acct]');
  if (!root) return;
  var PAGE = root.getAttribute('data-acct');
  var TG = 'https://t.me/RinGoMining';
  var FORGOT = 'Forgot your password? <a href="' + TG + '" target="_blank" rel="noopener">Message @RingoMining on Telegram.</a>';
  var UA = navigator.userAgent || '';
  var IN_APP = /Telegram|Instagram|FBAN|FBAV|FB_IAB|FBIOS|MicroMessenger|Line\/|Snapchat|Twitter|TikTok/i.test(UA);
  var C = window.GMT_CONFIG, M = window.GMTMining;

  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return root.querySelector(sel); };
  var fmtN = function (v, d) { return (+v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var fmtU = function (v) { return '$' + fmtN(v, Math.abs(v) < 100 ? 2 : 0); };
  var since = function (iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var nextUrl = function () {
    var n = new URLSearchParams(location.search).get('next') || '';
    return /^\/[a-z0-9\/_-]*(\?[^#]*)?$/i.test(n) && n.indexOf('//') !== 0 ? n : '/dashboard';   // same-site paths only
  };
  function avatarHTML(p, size) {
    var cls = 'ui-avatar' + (size ? ' ui-avatar--' + size : '');
    if (p && p.avatar_url) return '<span class="' + cls + '"><img src="' + esc(p.avatar_url) + '" alt=""></span>';
    var ch = ((p && (p.display_name || p.username)) || '?').trim().charAt(0).toUpperCase();
    return '<span class="' + cls + ' acct-initial" aria-hidden="true">' + esc(ch) + '</span>';
  }
  function roleBadge(r) { return r === 'admin' ? '<span class="ui-badge ui-badge--gold">Admin</span>' : r === 'mod' ? '<span class="ui-badge ui-badge--gold">Moderator</span>' : ''; }
  function setStatus(el, kind, msg) { el.className = 'acct-status' + (kind ? ' acct-status--' + kind : ''); el.textContent = msg || ''; }

  // A page that needs an account, seen logged out.
  function needLogin(what) {
    root.innerHTML = '<section class="ui-card acct-card acct-card--narrow">' +
      '<h1 class="ui-h2">Log in to see your ' + esc(what) + '</h1>' +
      '<p class="ui-text-2">This page is part of your GMT-Optimizer account. Log in, or create a free account with just a username and password.</p>' +
      '<div class="ui-row"><a class="ui-btn ui-btn--primary" href="/login?next=' + encodeURIComponent(location.pathname) + '">Log in</a>' +
      '<a class="ui-btn ui-btn--secondary" href="/signup?next=' + encodeURIComponent(location.pathname) + '">Create account</a></div></section>';
  }
  function notConfigured() {
    root.innerHTML = '<div class="ui-notice ui-notice--error"><div>Accounts are unavailable right now. Please try again later.</div></div>';
  }

  // ---------------------------------------------------------------- login / signup
  function authForm(mode) {
    var signup = mode === 'signup';
    root.innerHTML = '<section class="ui-card acct-card acct-card--narrow">' +
      '<h1 class="ui-h2">' + (signup ? 'Create your account' : 'Log in') + '</h1>' +
      '<p class="ui-text-2">' + (signup ? 'Just a username and a password. No email.' : 'Welcome back.') + '</p>' +
      (IN_APP ? '<div class="ui-notice ui-notice--gold"><div>You\'re in an in-app browser (Telegram, Instagram and others), which can block sign-in. Open this page in Safari or Chrome. <button type="button" class="ui-btn ui-btn--sm ui-btn--secondary" id="acCopy">Copy link</button></div></div>' : '') +
      '<form class="ui-stack acct-form" id="acForm" novalidate>' +
        '<div class="ui-field"><label class="ui-label" for="acU">Username</label>' +
          '<input class="ui-input" id="acU" name="username" autocomplete="username" maxlength="20" autocapitalize="none" spellcheck="false" required>' +
          (signup ? '<span class="ui-help">3 to 20 letters, numbers or underscores. Shown in chat.</span>' : '') + '</div>' +
        '<div class="ui-field"><label class="ui-label" for="acP">Password</label>' +
          '<input class="ui-input" id="acP" name="password" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="8" required>' +
          '<span class="ui-help">At least 8 characters.</span></div>' +
        (signup ? '<div class="ui-field"><label class="ui-label" for="acP2">Repeat password</label>' +
          '<input class="ui-input" id="acP2" type="password" autocomplete="new-password" minlength="8" required></div>' : '') +
        '<p class="acct-status" id="acErr" role="alert"></p>' +
        '<button class="ui-btn ui-btn--primary ui-btn--block" id="acGo" type="submit">' + (signup ? 'Create account' : 'Log in') + '</button>' +
      '</form>' +
      '<p class="acct-forgot">' + FORGOT + '</p>' +
      (signup ? '<p class="ui-small ui-text-2">There is no email on the account, so save your password somewhere safe.</p>' : '') +
      '<p class="acct-swap">' + (signup ? 'Already have an account? <a href="/login' + location.search + '">Log in</a>' : 'New here? <a href="/signup' + location.search + '">Create an account</a>') + '</p>' +
      '</section>';
    var copy = $('#acCopy');
    if (copy) copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, done); else done();
    });
    var err = $('#acErr'), go = $('#acGo');
    $('#acForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = $('#acU').value.trim(), p = $('#acP').value;
      setStatus(err, '', '');
      if (!u) return setStatus(err, 'error', 'Enter your username.');
      if (!p || p.length < 8) return setStatus(err, 'error', 'Password must be at least 8 characters.');
      if (signup && p !== $('#acP2').value) return setStatus(err, 'error', 'The two passwords do not match.');
      go.disabled = true; go.textContent = signup ? 'Creating…' : 'Logging in…';
      (signup ? A.signUp(u, p) : A.signIn(u, p))
        .then(function () { location.href = nextUrl(); })
        .catch(function (ex) { go.disabled = false; go.textContent = signup ? 'Create account' : 'Log in'; setStatus(err, 'error', ex.message || String(ex)); });
    });
  }
  function alreadyIn() {
    var p = A.profile || {};
    root.innerHTML = '<section class="ui-card acct-card acct-card--narrow">' +
      '<div class="acct-who">' + avatarHTML(p, 'lg') + '<div><h1 class="ui-h3">You\'re logged in</h1><p class="ui-text-2">as @' + esc(p.username || '') + '</p></div></div>' +
      '<div class="ui-row"><a class="ui-btn ui-btn--primary" href="/dashboard">Go to your dashboard</a>' +
      '<button type="button" class="ui-btn ui-btn--ghost" id="acOut">Log out</button></div></section>';
    $('#acOut').addEventListener('click', function () { A.signOut().then(function () { location.reload(); }); });
  }

  // ---------------------------------------------------------------- profile (own, or ?u=username)
  function profileView(p, msgCount, own) {
    var name = p.display_name || p.username;
    var tier = M && C ? M.vipTier(+p.th_total || 0, 0, C).n : '';
    root.innerHTML = '<section class="ui-card acct-card acct-profile">' +
      '<div class="acct-who">' + avatarHTML(p, 'xl') + '<div class="acct-who__txt">' +
        '<h1 class="ui-h2">' + esc(name) + ' ' + roleBadge(p.role) + '</h1>' +
        '<p class="ui-text-2">@' + esc(p.username) + (p.created_at ? ' · Member since ' + esc(since(p.created_at)) : '') + '</p></div></div>' +
      (p.bio ? '<p class="acct-bio">' + esc(p.bio) + '</p>' : (own ? '<p class="ui-text-2 acct-bio">No bio yet. <a href="/settings">Add one in settings.</a></p>' : '')) +
      '<div class="ui-stats acct-stats">' +
        '<div class="ui-stat"><div class="ui-stat__label">Hashrate</div><div class="ui-stat__value">' + fmtN(p.th_total, (+p.th_total % 1) ? 1 : 0) + ' TH</div><div class="ui-stat__meta">from their saved farm</div></div>' +
        '<div class="ui-stat"><div class="ui-stat__label">VIP by hashrate</div><div class="ui-stat__value">' + esc(tier) + '</div><div class="ui-stat__meta">locked GMT can lift it higher</div></div>' +
        '<div class="ui-stat"><div class="ui-stat__label">Chat messages</div><div class="ui-stat__value">' + fmtN(msgCount) + '</div><div class="ui-stat__meta"><a href="/chat">Open chat</a></div></div>' +
      '</div>' +
      (own ? '<div class="ui-row"><a class="ui-btn ui-btn--primary" href="/settings">Edit profile</a><a class="ui-btn ui-btn--secondary" href="/dashboard">Dashboard</a></div>' : '') +
      '</section>';
  }
  function profilePage() {
    var u = (new URLSearchParams(location.search).get('u') || '').trim();
    if (u && !/^[a-zA-Z0-9_]{3,20}$/.test(u)) { root.innerHTML = '<div class="ui-notice ui-notice--error"><div>That is not a valid username.</div></div>'; return; }
    var own = !u || (A.profile && A.profile.username && A.profile.username.toLowerCase() === u.toLowerCase());
    if (own && !A.isLoggedIn()) return needLogin('profile');
    root.innerHTML = '<p class="ui-text-2">Loading profile…</p>';
    // Profiles are publicly readable under the existing RLS (profiles_read). ilike = case-insensitive exact match.
    var q = A.sb.from('profiles').select('id,username,display_name,avatar_url,bio,created_at,th_total,role');
    q = own ? q.eq('id', A.user.id) : q.ilike('username', u.replace(/_/g, '\\_'));
    q.limit(1).then(function (r) {
      var p = r.data && r.data[0];
      if (!p) { root.innerHTML = '<div class="ui-notice ui-notice--error"><div>No user called @' + esc(u) + '.</div></div>'; return; }
      document.title = (p.display_name || p.username) + ' (@' + p.username + ') | GMT-Optimizer';
      return A.fetchUserCard(p.id).then(function (card) { profileView(p, card.msgCount, own); });
    }).catch(function () { root.innerHTML = '<div class="ui-notice ui-notice--error"><div>Could not load the profile. Try again in a moment.</div></div>'; });
  }

  // ---------------------------------------------------------------- settings
  function settingsPage() {
    if (!A.isLoggedIn()) return needLogin('settings');
    var p = A.profile || {};
    root.innerHTML =
      '<h1 class="ui-h2">Settings</h1>' +
      '<section class="ui-card acct-card"><h2 class="ui-h4">Profile</h2>' +
        '<div class="acct-who">' + '<span id="stAv">' + avatarHTML(p, 'lg') + '</span>' +
          '<div><button type="button" class="ui-btn ui-btn--secondary ui-btn--sm" id="stAvBtn">Change picture</button>' +
          '<input type="file" accept="image/*" id="stFile" hidden><p class="ui-help">A square image works best.</p></div></div>' +
        '<form class="ui-stack" id="stProf" novalidate>' +
          '<div class="ui-field"><span class="ui-label">Username</span><p class="acct-fixed">@' + esc(p.username) + '</p><span class="ui-help">Usernames can\'t be changed.</span></div>' +
          '<div class="ui-field"><label class="ui-label" for="stName">Display name</label><input class="ui-input" id="stName" maxlength="40" value="' + esc(p.display_name || '') + '"><span class="ui-help">Shown in chat and on your profile. Leave empty to use your username.</span></div>' +
          '<div class="ui-field"><label class="ui-label" for="stBio">Bio</label><textarea class="ui-textarea" id="stBio" maxlength="200" rows="3">' + esc(p.bio || '') + '</textarea><span class="ui-help"><span id="stBioN">' + (p.bio || '').length + '</span>/200</span></div>' +
          '<p class="acct-status" id="stProfMsg" role="status"></p>' +
          '<div><button class="ui-btn ui-btn--primary" type="submit" id="stProfGo">Save profile</button></div>' +
        '</form></section>' +
      '<section class="ui-card acct-card"><h2 class="ui-h4">Password</h2>' +
        '<form class="ui-stack" id="stPw" novalidate>' +
          '<input type="text" autocomplete="username" value="' + esc(p.username) + '" hidden>' +
          '<div class="ui-field"><label class="ui-label" for="stCur">Current password</label><input class="ui-input" id="stCur" type="password" autocomplete="current-password"></div>' +
          '<div class="ui-field"><label class="ui-label" for="stNew">New password</label><input class="ui-input" id="stNew" type="password" autocomplete="new-password" minlength="8"><span class="ui-help">At least 8 characters.</span></div>' +
          '<div class="ui-field"><label class="ui-label" for="stNew2">Repeat new password</label><input class="ui-input" id="stNew2" type="password" autocomplete="new-password" minlength="8"></div>' +
          '<p class="acct-status" id="stPwMsg" role="status"></p>' +
          '<div><button class="ui-btn ui-btn--primary" type="submit" id="stPwGo">Update password</button></div>' +
        '</form><p class="acct-forgot">' + FORGOT + '</p></section>' +
      '<section class="ui-card acct-card"><h2 class="ui-h4">Session</h2><p class="ui-text-2">Log out of GMT-Optimizer on this device.</p>' +
        '<div><button type="button" class="ui-btn ui-btn--danger" id="stOut">Log out</button></div></section>';

    var bio = $('#stBio'); bio.addEventListener('input', function () { $('#stBioN').textContent = bio.value.length; });
    $('#stAvBtn').addEventListener('click', function () { $('#stFile').click(); });
    $('#stFile').addEventListener('change', function () {
      var f = this.files[0], msg = $('#stProfMsg'); if (!f) return;
      if (!/^image\//.test(f.type)) return setStatus(msg, 'error', 'Choose an image file.');
      if (f.size > 5 * 1024 * 1024) return setStatus(msg, 'error', 'That image is over 5 MB.');
      setStatus(msg, '', 'Uploading…');
      A.uploadAvatar(f).then(function () { $('#stAv').innerHTML = avatarHTML(A.profile, 'lg'); setStatus(msg, 'success', 'Picture updated.'); })
        .catch(function (e) { setStatus(msg, 'error', e.message || 'Upload failed.'); });
    });
    $('#stProf').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#stProfMsg'), go = $('#stProfGo'); go.disabled = true; setStatus(msg, '', 'Saving…');
      A.updateProfile({ display_name: $('#stName').value.trim() || null, bio: bio.value.trim() || null })
        .then(function () { go.disabled = false; setStatus(msg, 'success', 'Saved.'); })
        .catch(function (ex) { go.disabled = false; setStatus(msg, 'error', ex.message || 'Could not save.'); });
    });
    $('#stPw').addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = $('#stPwMsg'), go = $('#stPwGo');
      if ($('#stNew').value !== $('#stNew2').value) return setStatus(msg, 'error', 'The two new passwords do not match.');
      go.disabled = true; setStatus(msg, '', 'Updating…');
      A.changePassword($('#stCur').value, $('#stNew').value)
        .then(function () { go.disabled = false; $('#stCur').value = $('#stNew').value = $('#stNew2').value = ''; setStatus(msg, 'success', 'Password updated. Use it next time you log in.'); })
        .catch(function (ex) { go.disabled = false; setStatus(msg, 'error', ex.message || 'Could not update the password.'); });
    });
    $('#stOut').addEventListener('click', function () { A.signOut().then(function () { location.href = '/'; }); });
  }

  // ---------------------------------------------------------------- dashboard
  var FB = { btc: 90000, gmt: 0.3, diff: 1.1e14 };
  function fetchJSON(url) {
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, 8000);
    return fetch(url, { signal: ctrl.signal }).then(function (r) { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function market() {
    var first = function (list) { return list.reduce(function (pr, fn) { return pr.then(function (v) { return v > 0 ? v : fn().catch(function () { return 0; }); }); }, Promise.resolve(0)); };
    return Promise.all([
      first([function () { return fetchJSON('https://api.coinpaprika.com/v1/tickers/btc-bitcoin').then(function (r) { return +r.quotes.USD.price; }); },
             function () { return fetchJSON('https://mempool.space/api/v1/prices').then(function (r) { return +r.USD; }); }]),
      first([function () { return fetchJSON('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token').then(function (r) { return +r.quotes.USD.price; }); },
             function () { return fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd').then(function (r) { return +r['gmt-token'].usd; }); }]),
      fetchJSON('https://mempool.space/api/v1/mining/hashrate/3d').then(function (h) { return +h.currentDifficulty; }).catch(function () { return 0; })
    ]).then(function (v) { return { btc: v[0] || FB.btc, gmt: v[1] || FB.gmt, diff: v[2] || FB.diff, live: v[0] > 0 && v[1] > 0 && v[2] > 0 }; });
  }
  function dashboardPage() {
    if (!A.isLoggedIn()) return needLogin('dashboard');
    var p = A.profile || {}, s = p.setup || null;
    var name = p.display_name || p.username;
    var th = s ? +s.inTH || 0 : 0;
    root.innerHTML =
      '<div class="acct-head"><div class="acct-who">' + avatarHTML(p, 'lg') + '<div><p class="ui-eyebrow">Dashboard</p><h1 class="ui-h2">Hi, ' + esc(name) + '</h1></div></div>' +
        '<div class="ui-row"><a class="ui-btn ui-btn--primary" href="/console">Open calculator</a><a class="ui-btn ui-btn--secondary" href="/settings">Settings</a></div></div>' +
      (th > 0 ? '<section class="ui-card acct-card"><div class="acct-card__head"><h2 class="ui-h4">Your farm today</h2><span class="ui-small ui-text-2" id="dbAsOf">Loading live prices…</span></div><div class="ui-stats" id="dbStats"></div>' +
        '<p class="ui-small ui-text-2 acct-note">A quick estimate from your saved farm at today\'s prices. Greedy Machines, inactive hashrate and ambassador rewards are left out here; the <a href="/console">calculator</a> has the full picture. ' +
        'Fees and rates as of <time data-cfg="meta.updated" data-cfg-fmt="date">' + esc(window.GMT_PRICING ? window.GMT_PRICING.UPDATED : '') + '</time>. They may change.</p></section>'
        : '<section class="ui-card acct-card"><h2 class="ui-h4">No farm saved yet</h2><p class="ui-text-2">Add your miners in the calculator and press Save. Your farm then follows your account to any device and shows up here.</p><div><a class="ui-btn ui-btn--primary" href="/console?view=edit">Build my farm</a></div></section>') +
      '<section class="ui-card acct-card"><div class="acct-card__head"><h2 class="ui-h4">Your miners</h2><a class="ui-link ui-small" href="/console?view=edit">Edit farm</a></div><div id="dbMiners"><p class="ui-text-2">Loading…</p></div></section>' +
      '<section class="acct-links ui-grid">' +
        '<a class="ui-card ui-card--link" href="/projection"><h3 class="ui-card__title">Growth projection</h3><p class="ui-text-2">Where your farm could be in one to five years.</p></a>' +
        '<a class="ui-card ui-card--link" href="/gomining-marketplace-checker"><h3 class="ui-card__title">Marketplace checker</h3><p class="ui-text-2">Price a Greedy Machine before you buy it.</p></a>' +
        '<a class="ui-card ui-card--link" href="/chat"><h3 class="ui-card__title">Community chat</h3><p class="ui-text-2">Talk setups with other GoMining miners.</p></a>' +
        '<a class="ui-card ui-card--link" href="/profile"><h3 class="ui-card__title">Your public profile</h3><p class="ui-text-2">What other people see when they tap your name.</p></a>' +
      '</section>';

    // miners (private: RLS lets only the owner read them)
    A.getMiners().then(function (rows) {
      var host = $('#dbMiners');
      if (!rows.length) { host.innerHTML = '<p class="ui-text-2">No individual miners saved. Your farm total comes from the calculator.</p>'; return; }
      var tot = rows.reduce(function (a, r) { return a + (+r.th || 0); }, 0);
      host.innerHTML = '<div class="ui-table-wrap"><table class="ui-table ui-table--stack acct-miners" aria-label="Your miners">' +
        '<thead><tr><th aria-sort="none">Miner</th><th class="num" aria-sort="none">Hashrate</th><th class="num" aria-sort="none">Efficiency</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var label = [r.collection, r.code ? '#' + r.code : ''].filter(Boolean).join(' ') || 'Miner';
          return '<tr><td data-label="">' + esc(label) + '</td><td class="num" data-label="Hashrate" data-sort="' + (+r.th || 0) + '">' + fmtN(r.th, (+r.th % 1) ? 2 : 0) + ' TH</td>' +
            '<td class="num" data-label="Efficiency" data-sort="' + (+r.wth || 0) + '">' + fmtN(r.wth, (+r.wth % 1) ? 1 : 0) + ' W/TH</td></tr>';
        }).join('') + '</tbody><tfoot><tr><td data-label="">' + rows.length + ' miner' + (rows.length === 1 ? '' : 's') + '</td><td class="num" data-label="Total">' + fmtN(tot, (tot % 1) ? 2 : 0) + ' TH</td><td></td></tr></tfoot></table></div>';
    }).catch(function () { $('#dbMiners').innerHTML = '<p class="ui-text-2">Could not load your miners.</p>'; });

    if (!(th > 0) || !M || !C) return;
    var wth = +s.inWTH || C.pricing.effBaseMax, locked = +s.inGMTLocked || 0, wallet = +s.inGMTWallet || 0;
    var apr = s.inLockAPR != null && s.inLockAPR !== '' ? +s.inLockAPR : C.rates.stakingAprPct;
    var streak = s.inClickStreak == null ? true : !!s.inClickStreak && s.inClickStreak !== 'false';
    var solo = s.inMiningMode != null && s.inMiningMode !== '' ? +s.inMiningMode : C.rates.soloMiningDiscountPct;
    market().then(function (mk) {
      var f = M.farmToday({ th: th, wth: wth, lockedGmt: locked, coverageGmt: locked + wallet, aprPct: apr, clickStreak: streak, soloPct: solo,
        btcPrice: mk.btc, gmtPrice: mk.gmt, satsPerTH: M.satsPerTHDay(mk.diff, C) }, C);
      var DPM = M.DAYS_PER_MONTH;
      var stat = function (l, v, meta, gold) { return '<div class="ui-stat"><div class="ui-stat__label">' + l + '</div><div class="ui-stat__value' + (gold ? ' ui-stat__value--gold' : '') + '">' + v + '</div><div class="ui-stat__meta">' + meta + '</div></div>'; };
      $('#dbStats').innerHTML =
        stat('Net per month', fmtU(f.net * DPM), fmtU(f.mining * DPM) + ' mining + ' + fmtU(f.staking * DPM) + ' staking', true) +
        stat('Hashrate', fmtN(th, (th % 1) ? 1 : 0) + ' TH', fmtN(wth, (wth % 1) ? 1 : 0) + ' W/TH') +
        stat('Fee discount', fmtN(f.totD, 2) + '%', f.tok + '% from GMT coverage, ' + fmtN(f.nonTok, 2) + '% other') +
        stat('VIP tier', esc(f.vip.n), fmtN(locked) + ' GMT locked');
      $('#dbAsOf').textContent = (mk.live ? 'Live' : 'Fallback') + ' prices: BTC ' + fmtU(mk.btc) + ' · GMT $' + mk.gmt.toFixed(4);
    });
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    if (!A || !A.ready) return notConfigured();
    if (PAGE === 'login' || PAGE === 'signup') return A.isLoggedIn() ? alreadyIn() : authForm(PAGE);
    if (PAGE === 'profile') return profilePage();
    if (PAGE === 'settings') return settingsPage();
    if (PAGE === 'dashboard') return dashboardPage();
  }
  // Wait until account.js knows whether there is a session (and has loaded the profile).
  if (!A || !A.ready) return boot();
  var booted = false;
  var wasIn = null;
  var go = function () {
    if (!A.resolved) return;
    // Logged out from the header while on an account page: re-render for the new state.
    if (booted) { if (PAGE !== 'login' && PAGE !== 'signup' && wasIn !== null && wasIn !== A.isLoggedIn()) location.reload(); return; }
    booted = true; wasIn = A.isLoggedIn(); boot();
  };
  A.onChange(go); go();
  setTimeout(function () { if (!booted) { booted = true; boot(); } }, 6000);
})();
