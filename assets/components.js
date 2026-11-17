/* GMT-Optimizer component behaviour: tabs, sortable tables, modals, toasts. No dependencies.
   =============================================================================================
   Markup drives it; nothing needs wiring per page:
     tabs     .ui-tabs > [role=tablist].ui-tabs__list > button.ui-tab[aria-controls]  + [role=tabpanel]
              arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern)
     sort     table.ui-table th[aria-sort] — click to sort by that column; numbers sort numerically
              (cell data-sort="…" overrides the visible text)
     modal    <dialog class="ui-modal" id="x">; any [data-ui-open="x"] opens it, [data-ui-close] closes.
              Native showModal(): focus is trapped and Esc closes, for free.
     toast    UI.toast('Saved', {type:'success'|'error', timeout:4000}); announced via aria-live.
*/
(function () {
  'use strict';
  if (window.UI) return;
  const UI = window.UI = {};

  // ---- tabs ----
  function selectTab(tab, focus) {
    const list = tab.closest('[role="tablist"]');
    list.querySelectorAll('[role="tab"]').forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
    if (focus) tab.focus();
  }
  document.addEventListener('click', e => {
    const tab = e.target.closest('.ui-tabs [role="tab"]');
    if (tab) selectTab(tab, false);
  });
  document.addEventListener('keydown', e => {
    const tab = e.target.closest && e.target.closest('.ui-tabs [role="tab"]');
    if (!tab) return;
    const tabs = Array.from(tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
    const i = tabs.indexOf(tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    selectTab(tabs[(to + tabs.length) % tabs.length], true);
  });

  // ---- sortable tables ----
  const cellVal = td => {
    const raw = td.dataset.sort != null ? td.dataset.sort : td.textContent.trim();
    const n = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
    return /[0-9]/.test(raw) && isFinite(n) ? n : raw.toLowerCase();
  };
  document.addEventListener('click', e => {
    const th = e.target.closest('table.ui-table th[aria-sort]');
    if (!th) return;
    const table = th.closest('table'), body = table.tBodies[0];
    const col = Array.from(th.parentNode.children).indexOf(th);
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    table.querySelectorAll('th[aria-sort]').forEach(h => h.setAttribute('aria-sort', 'none'));
    th.setAttribute('aria-sort', dir);
    const rows = Array.from(body.rows);
    rows.sort((a, b) => {
      const x = cellVal(a.cells[col]), y = cellVal(b.cells[col]);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), document.documentElement.lang || 'en');
      return dir === 'ascending' ? r : -r;
    });
    rows.forEach(r => body.appendChild(r));
  });

  // ---- modals ----
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-ui-open]');
    if (open) { const d = document.getElementById(open.dataset.uiOpen); if (d && d.showModal) { d.showModal(); e.preventDefault(); } return; }
    const close = e.target.closest('[data-ui-close]');
    if (close) { const d = close.closest('dialog'); if (d) d.close(); return; }
    // click on the backdrop closes
    if (e.target.matches && e.target.matches('dialog.ui-modal[open]')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });

  // ---- toasts ----
  let host;
  UI.toast = function (message, opts) {
    opts = opts || {};
    if (!host) {
      host = document.createElement('div');
      host.className = 'ui-toasts ui-scope';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const t = document.createElement('div');
    t.className = 'ui-toast' + (opts.type ? ' ui-toast--' + opts.type : '');
    const msg = document.createElement('span');
    msg.textContent = message;
    const x = document.createElement('button');
    x.className = 'ui-toast__close'; x.type = 'button'; x.setAttribute('aria-label', opts.closeLabel || 'Dismiss'); x.textContent = '×';
    x.onclick = () => t.remove();
    t.append(msg, x);
    host.appendChild(t);
    if (opts.timeout !== 0) setTimeout(() => t.remove(), opts.timeout || 4000);
    return t;
  };
})();
