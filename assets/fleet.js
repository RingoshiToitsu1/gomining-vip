/* GMT Optimizer — Fleet builder (Phase 1, no backend).
   =====================================================
   Lets a user enter their miners one NFT at a time — collection, NFT code, TH,
   W/TH, cost — instead of hand-computing a single blended Total Hashrate and
   weighted efficiency. The module owns only its own panel; it writes the
   aggregate into the existing #inTH / #inWTH / #inCostPerTH fields and fires an
   `input` event on each, so app.js's global recalc + autosave run untouched.

   Persistence is localStorage for now. Phase 2 swaps loadFleet/saveFleet for a
   Supabase-backed store keyed to the logged-in user; nothing else here changes,
   which is the whole reason the aggregation and the UI are kept separate from
   the storage calls. */
(function () {
  'use strict';
  var KEY = 'gmt_fleet_v1';

  // GoMining miner collections (label only in Phase 1 — the console math never
  // reads it). Kept in the app's display order; "Other" catches new drops so a
  // user is never blocked by a stale list.
  var COLLECTIONS = [
    'The Mine Box', 'The Trust Box', 'The GoMining Whales', 'The South Collection',
    'The North Collection', 'The East Collection', 'The West Collection',
    'The Khabib Collection', 'The Greedy Machines', 'The Greedy Machines vol. 2',
    'The Party Box', 'The Gift Box', 'The Golden Box', 'The Solana Collection',
    'The Duck Collection', 'The Go Duck Collection', 'EPIC X', 'Other'
  ];

  // ---- storage ----
  // Logged out (or accounts not configured): localStorage. Logged in: the
  // Supabase `miners` table via account.js, so the fleet follows the user across
  // devices. The routing is decided per call so a login/logout mid-session just
  // works.
  function acc() { return window.GMTAccount; }
  function isCloud() {
    var a = acc();
    if (!(a && a.ready && a.isLoggedIn())) return false;
    // The cloud fleet belongs to the ACCOUNT profile only. Scratch / referral-quote
    // profiles use a local fleet, so entering or clearing them never touches the
    // user's real cloud fleet.
    return (typeof window.gmtOnAccountProfile === 'function') ? window.gmtOnAccountProfile() : true;
  }

  function loadLocal() {
    try { var a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveLocal(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {} }

  // Async load from whichever store is active.
  function loadFleet() {
    if (isCloud()) return acc().getMiners().catch(function () { return []; });
    return Promise.resolve(loadLocal());
  }
  // Debounced save to the active store (cloud writes shouldn't fire on every keystroke).
  var _saveT = null;
  function saveFleet(r) {
    if (isCloud()) {
      clearTimeout(_saveT);
      _saveT = setTimeout(function () { acc().saveMiners(r).catch(function () {}); }, 600);
    } else {
      saveLocal(r);
    }
  }

  var rows = [];
  var el = {};   // cached DOM refs

  var num = function (n) { return (Math.round(n * 100) / 100).toLocaleString('en-US'); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };

  // ---- aggregation ----
  // Total TH is the plain sum; efficiency is TH-weighted (a big efficient miner
  // should move the average more than a tiny inefficient one). Rows with 0 TH are
  // ignored so a half-entered row never poisons the weighting or divides by zero.
  // No cost input: nobody remembers what they paid per miner, and the console
  // already estimates $/TH from the tier curves off the TH + W/TH we set below.
  var DEFAULT_WTH = 15;   // marketplace default; matches the console's default efficiency
  var isGreedy = function (c) { return /greedy/i.test(c || ''); };
  // Paused miners are aggregated SEPARATELY, never folded into the earning totals:
  // switched off, they mine nothing and are billed nothing. calc() keeps them out of
  // both the reward and the fee basis; they still count toward the VIP tier, because
  // you continue to own the hashrate whether or not it is running.
  function aggregate() {
    var th = 0, wSum = 0, count = 0, gTH = 0, gWSum = 0, offTH = 0, offWSum = 0, offCount = 0;
    rows.forEach(function (r) {
      var t = +r.th || 0; if (t <= 0) return;
      // A blank W/TH must NOT count as 0 — that would zero the electricity fee and
      // corrupt profit AND discount coverage. Fall back to the default efficiency.
      var w = +r.wth || DEFAULT_WTH;
      count++;
      if (r.off) { offTH += t; offWSum += t * w; offCount++; return; }
      th += t; wSum += t * w;
      if (isGreedy(r.collection)) { gTH += t; gWSum += t * w; }   // Greedy Machine rows tracked apart
    });
    return {
      th: th, wth: th > 0 ? wSum / th : 0, count: count,
      greedyTH: gTH, greedyWth: gTH > 0 ? gWSum / gTH : 0,
      offTH: offTH, offWth: offTH > 0 ? offWSum / offTH : 0, offCount: offCount
    };
  }

  function setField(id, value) {
    var f = document.getElementById(id);
    if (!f) return;
    f.value = value;
    f.dispatchEvent(new Event('input', { bubbles: true }));   // -> app.js recalc + autoSave
  }

  // Push the aggregate into the console. Setting inTH fires its oninput handler,
  // which re-estimates $/TH from the tier curves — so cost stays correct without
  // the user ever entering it.
  function apply() {
    var a = aggregate();
    if (a.count === 0) return;                 // empty fleet: leave manual fields alone
    setField('inWTH', +a.wth.toFixed(2));      // set efficiency first: inTH's handler prices off it
    setField('inTH', +a.th.toFixed(2));        // total farm TH (greedy is a SUBSET of this)
    // Greedy Machine rows drive the console's greedy fields, so the planner treats
    // them as separate greedy TH. inTH already includes them; inGreedyTH is the
    // subset. Imported greedy is booked as all-"initial" (the conservative VIP
    // case — only growth ABOVE the initial marketplace TH counts toward the tier).
    // Greedy is auto-detected — no manual toggle. Drive the greedy fields straight
    // from the fleet's greedy-collection rows, and clear them when there are none.
    var hasGreedy = a.greedyTH > 0;
    if (hasGreedy) {
      setField('inGreedyTH', +a.greedyTH.toFixed(2));
      setField('inGreedyWth', +a.greedyWth.toFixed(2));
      setField('inGreedyInitial', +a.greedyTH.toFixed(2));
    } else {
      setField('inGreedyTH', 0);
      setField('inGreedyInitial', 0);
    }
    // Paused hashrate: earns nothing, billed nothing, still counts toward VIP.
    setField('inInactiveTH', +a.offTH.toFixed(2));
    setField('inInactiveWth', +a.offWth.toFixed(2));
    if (typeof window.refreshGreedyVisibility === 'function') window.refreshGreedyVisibility();
  }

  function commit() { saveFleet(rows); renderSummary(); }

  // ---- rendering ----
  function optionList(sel) {
    return COLLECTIONS.map(function (c) {
      return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  // Each field is a labelled box in the same shape the rest of the editor uses
  // (.ed-fld): name on the left, value right-aligned, all inside one border. The
  // old layout leaned on placeholders alone, so the moment you typed anything the
  // row became four anonymous numbers — worst on mobile, where they stack.
  function fieldHTML(cls, label, inner) {
    return '<label class="fleet-f ' + cls + '"><span class="fleet-lbl">' + label + '</span>' + inner + '</label>';
  }

  function rowHTML(r, i) {
    var off = !!r.off;
    return '' +
      '<div class="fleet-row' + (off ? ' is-off' : '') + '" data-i="' + i + '">' +
        fieldHTML('f-col', 'Miner',
          '<select class="fleet-col" data-k="collection" title="Collection">' + optionList(r.collection) + '</select>') +
        fieldHTML('f-code', 'Code',
          '<input class="fleet-in fleet-code" data-k="code" type="text" inputmode="numeric" placeholder="NFT #" value="' + esc(r.code) + '">') +
        fieldHTML('f-th', 'TH',
          '<input class="fleet-in fleet-th" data-k="th" type="number" min="0" step="0.01" placeholder="0" value="' + (r.th != null ? esc(r.th) : '') + '">') +
        fieldHTML('f-wth', 'W/TH',
          '<input class="fleet-in fleet-wth" data-k="wth" type="number" min="12" step="0.1" placeholder="15" value="' + (r.wth != null ? esc(r.wth) : '') + '">') +
        '<button class="fleet-pwr" aria-pressed="' + (off ? 'false' : 'true') + '" ' +
          'title="' + (off ? 'Paused — mines nothing and is billed nothing, but still counts toward your VIP tier. Click to switch back on.' : 'Active and mining. Click to pause.') + '" ' +
          'aria-label="' + (off ? 'Miner inactive' : 'Miner active') + '">' +
          '<span class="fleet-pwr-dot"></span>' + (off ? 'OFF' : 'ON') +
        '</button>' +
        '<button class="fleet-del" title="Remove miner" aria-label="Remove miner">&times;</button>' +
      '</div>';
  }

  function renderRows() {
    if (!el.rows) return;   // may be called before the panel mounts
    el.rows.innerHTML = rows.length
      ? rows.map(rowHTML).join('')
      : '<div class="fleet-empty">No miners yet. Add your first below — or keep using the simple Hashrate field above.</div>';
  }

  function renderSummary() {
    var a = aggregate();
    // Broadcast fleet state so the results gate (account.js) can adapt its card,
    // and expose the per-miner rows so the planner can name which miner to upgrade.
    try {
      window.GMTFleet = { count: a.count, th: a.th, offTH: a.offTH, offCount: a.offCount };
      window.GMTFleetRows = rows.filter(function (r) { return (+r.th || 0) > 0; }).map(function (r) {
        return { collection: r.collection, code: r.code, th: +r.th || 0, wth: +r.wth || DEFAULT_WTH, off: !!r.off };
      });
      document.dispatchEvent(new CustomEvent('gmt-fleet'));
    } catch (e) {}
    if (!el.summary) return;
    if (a.count === 0) { el.summary.innerHTML = ''; return; }
    // TH total reads as the MINING total; paused hashrate is called out separately so
    // it never looks like it was silently dropped.
    el.summary.innerHTML =
      '<strong>' + a.count + '</strong> miner' + (a.count === 1 ? '' : 's') +
      ' &middot; <strong>' + num(a.th) + '</strong> TH mining' +
      ' &middot; <strong>' + num(a.wth) + '</strong> W/TH avg' +
      (a.offCount > 0
        ? ' &middot; <span class="fleet-offnote">' + a.offCount + ' paused (' + num(a.offTH) + ' TH, no fees)</span>'
        : '');
  }

  function render() {
    renderRows();
    renderSummary();
  }

  // ---- events ----
  function onInput(e) {
    var row = e.target.closest('.fleet-row'); if (!row) return;
    var i = +row.getAttribute('data-i'); var k = e.target.getAttribute('data-k');
    if (!rows[i]) return;
    rows[i][k] = e.target.value;
    commit();
    apply();
  }
  function onClick(e) {
    if (e.target.classList.contains('fleet-del')) {
      var row = e.target.closest('.fleet-row'); var i = +row.getAttribute('data-i');
      rows.splice(i, 1);
      render(); commit(); apply();
      return;
    }
    var pwr = e.target.closest ? e.target.closest('.fleet-pwr') : null;
    if (pwr) {
      var pr = pwr.closest('.fleet-row'); var pi = +pr.getAttribute('data-i');
      if (!rows[pi]) return;
      rows[pi].off = !rows[pi].off;
      render(); commit(); apply();
    }
  }
  function addRow() {
    rows.push({ collection: COLLECTIONS[0], code: '', th: '', wth: '', off: false });
    render(); commit();
    // focus the TH field of the new row
    var last = el.rows.querySelector('.fleet-row:last-child .fleet-th');
    if (last) last.focus();
  }

  // Reload the fleet from whichever store is now active (called on profile switch).
  window.GMTFleetReload = function () {
    loadFleet().then(function (r) { rows = r || []; render(); apply(); });
  };
  // Empty the fleet in the active store — used by "Clear inputs" on a scratch
  // profile. Because scratch profiles are never cloud (isCloud is account-only),
  // this clears the local fleet and never deletes the real cloud one.
  window.GMTFleetClear = function () { rows = []; commit(); render(); };

  // ---- mount ---- (styles live in assets/accounts.css)
  function mount() {
    var host = document.getElementById('fleetGroup');
    if (!host) return;
    host.className = 'ed-group';
    host.innerHTML =
      '<div class="ed-group-title">My Fleet <span class="ed-toggle-note" style="font-weight:400">(optional — adds up your miners for you)</span></div>' +
      '<div class="fleet-panel">' +
        '<div class="fleet-head"><div class="fleet-summary" id="fleetSummary"></div></div>' +
        // Column headings, desktop only. Fifteen rows x four labelled boxes is sixty little
        // borders saying the same four words — naming each column once turns the same data into
        // a table you can scan down. Mobile keeps its per-field labels: there are no columns to
        // head there, since each miner stacks.
        '<div class="fleet-thead" aria-hidden="true">' +
          '<span>Miner</span><span>Code</span><span class="num">TH</span><span class="num">W/TH</span><span></span><span></span>' +
        '</div>' +
        '<div class="fleet-rows" id="fleetRows"></div>' +
        '<button class="fleet-add" id="fleetAdd">+ Add a miner</button>' +
      '</div>';
    el.rows = document.getElementById('fleetRows');
    el.summary = document.getElementById('fleetSummary');
    el.rows.addEventListener('input', onInput);
    el.rows.addEventListener('change', onInput);   // <select> fires change, not input
    el.rows.addEventListener('click', onClick);
    document.getElementById('fleetAdd').addEventListener('click', addRow);
    render();   // empty first paint; data arrives via the load below

    // If already logged in when we mount, do the one-time cloud load now; otherwise
    // show the local fleet. The cloud load is NOT driven off Account.onChange —
    // account.js calls GMTFleetLoginLoad exactly once per real login (below), so
    // token refreshes and realtime auth churn can never reload/clobber the fleet.
    if (acc() && acc().ready && acc().isLoggedIn()) { window.GMTFleetLoginLoad(); }
    else { loadFleet().then(function (r) { rows = r || []; render(); apply(); }); }
  }

  // Called ONCE per real login by account.js. Idempotent via _authHandled.
  var _migrated = false, _authHandled = false;
  window.GMTFleetLoginLoad = function () {
    var a = acc();
    if (!a || !a.ready || !a.isLoggedIn() || _authHandled) return;
    _authHandled = true;
    a.getMiners().then(function (cloud) {
      var local = loadLocal();
      // First login on this device: lift a locally-built fleet into an empty cloud account.
      if (!_migrated && (!cloud || !cloud.length) && local.length) {
        _migrated = true;
        return a.saveMiners(local).then(function () { rows = local.slice(); render(); apply(); });
      }
      return loadFleet().then(function (r) { rows = r || []; render(); apply(); });
    }).catch(function () { rows = loadLocal(); render(); apply(); });
  };
  // Called by account.js on a real SIGNED_OUT.
  window.GMTFleetLogout = function () { _authHandled = false; rows = loadLocal(); render(); apply(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
