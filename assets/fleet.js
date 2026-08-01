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
  function isCloud() { var a = acc(); return a && a.ready && a.isLoggedIn(); }

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
  function aggregate() {
    var th = 0, wSum = 0, count = 0;
    rows.forEach(function (r) {
      var t = +r.th || 0; if (t <= 0) return;
      th += t; count++;
      wSum += t * (+r.wth || 0);
    });
    return { th: th, wth: th > 0 ? wSum / th : 0, count: count };
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
    setField('inTH', +a.th.toFixed(2));
  }

  function commit() { saveFleet(rows); renderSummary(); }

  // ---- rendering ----
  function optionList(sel) {
    return COLLECTIONS.map(function (c) {
      return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function rowHTML(r, i) {
    return '' +
      '<div class="fleet-row" data-i="' + i + '">' +
        '<select class="fleet-col" data-k="collection" title="Collection">' + optionList(r.collection) + '</select>' +
        '<input class="fleet-in fleet-code" data-k="code" type="text" inputmode="numeric" placeholder="NFT code" value="' + esc(r.code) + '">' +
        '<input class="fleet-in fleet-th" data-k="th" type="number" min="0" step="0.01" placeholder="TH" value="' + (r.th != null ? esc(r.th) : '') + '">' +
        '<input class="fleet-in fleet-wth" data-k="wth" type="number" min="12" step="0.1" placeholder="W/TH" value="' + (r.wth != null ? esc(r.wth) : '') + '">' +
        '<button class="fleet-del" title="Remove miner" aria-label="Remove miner">&times;</button>' +
      '</div>';
  }

  function renderRows() {
    el.rows.innerHTML = rows.length
      ? rows.map(rowHTML).join('')
      : '<div class="fleet-empty">No miners yet. Add your first below — or keep using the simple Hashrate field above.</div>';
  }

  function renderSummary() {
    var a = aggregate();
    // Broadcast fleet state so the results gate (account.js) can adapt its card
    // from "add your miners" to "your fleet is ready".
    try { window.GMTFleet = { count: a.count, th: a.th }; document.dispatchEvent(new CustomEvent('gmt-fleet')); } catch (e) {}
    if (!el.summary) return;
    if (a.count === 0) { el.summary.innerHTML = ''; return; }
    el.summary.innerHTML =
      '<strong>' + a.count + '</strong> miner' + (a.count === 1 ? '' : 's') +
      ' &middot; <strong>' + num(a.th) + '</strong> TH total' +
      ' &middot; <strong>' + num(a.wth) + '</strong> W/TH avg';
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
    }
  }
  function addRow() {
    rows.push({ collection: COLLECTIONS[0], code: '', th: '', wth: '' });
    render(); commit();
    // focus the TH field of the new row
    var last = el.rows.querySelector('.fleet-row:last-child .fleet-th');
    if (last) last.focus();
  }

  // ---- mount ---- (styles live in assets/accounts.css)
  function mount() {
    var host = document.getElementById('fleetGroup');
    if (!host) return;
    host.className = 'ed-group';
    host.innerHTML =
      '<div class="ed-group-title">My Fleet <span class="ed-toggle-note" style="font-weight:400">(optional — adds up your miners for you)</span></div>' +
      '<div class="fleet-panel">' +
        '<div class="fleet-head"><div class="fleet-summary" id="fleetSummary"></div></div>' +
        '<div class="fleet-rows" id="fleetRows"></div>' +
        '<button class="fleet-add" id="fleetAdd">+ Add a miner</button>' +
      '</div>';
    el.rows = document.getElementById('fleetRows');
    el.summary = document.getElementById('fleetSummary');
    el.rows.addEventListener('input', onInput);
    el.rows.addEventListener('change', onInput);   // <select> fires change, not input
    el.rows.addEventListener('click', onClick);
    document.getElementById('fleetAdd').addEventListener('click', addRow);
    render();   // empty first paint; data arrives async below

    // React to login state. account.js loads its session asynchronously, so we
    // both subscribe to changes and evaluate the current state once now.
    if (acc()) { acc().onChange(onAuth); onAuth(acc()); }
    else { loadFleet().then(function (r) { rows = r; render(); apply(); }); }
  }

  var _migrated = false;
  function onAuth(a) {
    if (a.isLoggedIn()) {
      // On first login this session, lift a local fleet into the cloud if the
      // account has none yet — so a fleet built while logged out isn't lost.
      a.getMiners().then(function (cloud) {
        var local = loadLocal();
        if (!_migrated && (!cloud || !cloud.length) && local.length) {
          _migrated = true;
          return a.saveMiners(local).then(function () { rows = local.slice(); render(); apply(); });
        }
        rows = cloud || []; render(); apply();
      }).catch(function () { rows = loadLocal(); render(); apply(); });
    } else {
      rows = loadLocal(); render(); apply();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
