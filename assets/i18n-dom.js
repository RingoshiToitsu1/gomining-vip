/* GMT-Optimizer DOM translator, for the console (a large legacy app whose text is built in many places).
   ====================================================================================================
   Loaded only on translated copies of pages listed under "dom" in locales/pages.json (scripts/gen-i18n.js
   adds it after /assets/i18n/<lang>.js). English pages never load it, so English output can't change.

   It watches the page and replaces English text with the page language:
     • text nodes, and the title / placeholder / aria-label / alt / data-tip attributes;
     • window.alert / confirm / prompt messages.
   Lookup is by NORMALIZED text: whitespace collapsed, and every number token ($1,234.56, 12.5%, 3, 0.358 …)
   and every month abbreviation next to a number ("Nov 2027") replaced by {0}, {1}… The translation's
   placeholders get the original tokens back (English months turned into local ones), so one entry covers
   every value. Dictionary: GMT_UI.dom (compiled from locales/<lang>.json "dom" by gen-i18n.js).
   Sentences split by inline markup are not handled here; app.js translates those whole with T().
   Elements marked translate="no" or class "notranslate", the GoMining app mock-ups (.gm-mk), and inputs,
   scripts and styles are left alone.

   GMTDomI18n.normalize(text) → { key, tokens } is exported for the dictionary builder.
*/
(function () {
  'use strict';
  var L = 'A-Za-zÀ-ÿ';
  var MON = 'Sept\\.?|Sep|Jan\\.?|Feb\\.?|Mar|Apr\\.?|May|Jun|Jul|Aug\\.?|Oct|Nov\\.?|Dec|ene|abr|ago|dic|janv\\.|févr\\.|mars|avr\\.|mai|juin|juil\\.|août|oct\\.|déc\\.|März|Mai|Juni|Juli|Okt\\.|Dez\\.|feb|mar|jun|jul|oct|nov|sept';
  var TOK = new RegExp(
    "[-+−]?(?:[$£€]\\s?)?\\d(?:[\\d.,  ']*\\d)?(?:\\s?(?:%|[$£€]))?" +
    '|(?<![' + L + '])(?:' + MON + ')(?![' + L + '])(?=,?\\s?\\d)' +
    '|(?<=\\d\\.?,?\\s)(?:' + MON + ')(?![' + L + '])', 'g');
  function normalize(text) {
    var tokens = [];
    // Collapse ordinary whitespace only: \s would also eat U+00A0 / U+202F, the no-break spaces inside French
    // numbers ("1\u202f206,58\u00a0$"), and split them into two tokens.
    var key = String(text).replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, '').replace(TOK, function (m) { tokens.push(m); return '{' + (tokens.length - 1) + '}'; });
    return { key: key, tokens: tokens };
  }
  window.GMTDomI18n = { normalize: normalize };

  var UI = window.GMT_UI;
  if (!UI || !UI.dom) return;          // English page or no dictionary: nothing to do
  var D = UI.dom, LANG = UI.lang, comma = LANG !== 'en';
  var MONTHS = {
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
    fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']
  }[LANG];
  var EN_MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Sept: 8, Oct: 9, Nov: 10, Dec: 11 };
  // English month → local; a number the app built by hand (toFixed) gets the local decimal comma.
  function fixTok(t) {
    if (MONTHS && Object.prototype.hasOwnProperty.call(EN_MON, t)) return MONTHS[EN_MON[t]];
    if (comma && /^[-+−]?[$£€]?\d+\.\d+%?$/.test(t)) t = t.replace('.', ',');
    if (comma && /^[-+−]?\d+(?:,\d+)?%$/.test(t)) t = t.replace('%', ' %');   // "20%" → "20 %"
    return t;
  }
  function tr(text) {
    if (!text || !/[A-Za-z]/.test(text)) return null;
    var n = normalize(text);
    if (!Object.prototype.hasOwnProperty.call(D, n.key)) return null;
    var out = D[n.key].replace(/\{(\d+)\}/g, function (m, i) { return n.tokens[+i] != null ? fixTok(n.tokens[+i]) : m; });
    var lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    return lead + out + trail;
  }
  window.GMTDomI18n.t = tr;

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, NOSCRIPT: 1 };
  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip'];
  var done = new WeakMap();   // node -> the text we last wrote, so our own write isn't re-processed
  // inner: true when checking an ancestor of a text node (a mock-up's own aria-label is still translatable).
  function skipped(el, inner) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP[e.tagName] || e.getAttribute('translate') === 'no') return true;
      var c = e.classList;
      if (c && (c.contains('notranslate') || /(^|\s)gm-mk-/.test(e.className) || (c.contains('gm-mk') && (inner || e !== el)))) return true;
    }
    return false;
  }
  function doText(node) {
    var v = node.nodeValue;
    if (done.get(node) === v) return;
    if (node.parentNode && skipped(node.parentNode, true)) return;
    var t = tr(v);
    if (t != null && t !== v) { node.nodeValue = t; done.set(node, t); }
  }
  function doAttrs(el) {
    // An input's own tooltip / placeholder is translatable; only its value (and text inside skipped tags) is not.
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName) ? skipped(el.parentNode, true) : skipped(el, false)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], v = el.getAttribute(a);
      if (!v) continue;
      var t = tr(v);
      if (t != null && t !== v) el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP[root.tagName]) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  var obs = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
    }
  });
  function start() {
    walk(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // Dialogs the app opens with English text.
  ['alert', 'confirm', 'prompt'].forEach(function (k) {
    var orig = window[k];
    if (typeof orig !== 'function') return;
    window[k] = function (msg) { var a = [].slice.call(arguments); if (typeof msg === 'string') { var t = tr(msg); if (t != null) a[0] = t; } return orig.apply(window, a); };
  });
})();
