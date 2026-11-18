/* GMT-Optimizer global chrome: the one header and footer every page wears.
   ==========================================================================
   Load with:  <link rel="stylesheet" href="/assets/site-chrome.css">  +  <script src="/assets/site-chrome.js" defer>
   Options on the script tag:  data-footer="off"  (tool pages with their own print view)

   Header: logo · Calculator · Growth Projection · Guides · New to GoMining? | language · Messages (logged in,
   unread badge) · Log in / avatar menu (Profile, Dashboard, Settings, Log out) · Get Started.
   Footer: Tools · Learn · Company · Legal, the support addresses, and the legal bar.

   Login state works on every page without loading Supabase: where account.js runs (console, /chat) its
   GMTAccount is used; anywhere else the saved session in localStorage is read and the profile is fetched
   once over REST (profiles are publicly readable under the existing RLS). No backend change.
   Unread = chat messages newer than the time you last opened the chat (localStorage gmt_chat_seen_at,
   written by chat.js), counted with a HEAD request on the public messages table.
*/
(function () {
  'use strict';
  if (window.__gmChrome) return;
  window.__gmChrome = true;

  var me = document.currentScript;
  var NO_FOOTER = me && me.getAttribute('data-footer') === 'off';
  var CFG = window.GMT_SUPABASE || {};
  var SB_URL = CFG.url || 'https://cbatlxqlmeyuhwqpczpv.supabase.co';
  var SB_KEY = CFG.anonKey || 'sb_publishable_yFupMYjhcAlgl3cJunUfLw_X5DLY__A';   // client-safe publishable key (RLS is the gate)
  var AUTH_KEY = 'sb-' + SB_URL.replace(/^https:\/\//, '').split('.')[0] + '-auth-token';
  var SEEN_KEY = 'gmt_chat_seen_at';
  var WORDMARK = '/assets/brand/GMT-Optimizer_white-text_transparent.svg';
  var ICON = '/assets/brand/GMT_icon_transparent.svg';
  var TG = 'https://t.me/RinGoMining';
  // ---------- language (Phase 7): from <html lang>; /es/, /fr/, /de/ copies come from scripts/gen-i18n.js ----------
  var LANG = ({ es: 1, fr: 1, de: 1 }[(document.documentElement.lang || '').slice(0, 2)]) ? document.documentElement.lang.slice(0, 2) : 'en';
  // Pages that exist in every language (kept up to date by scripts/gen-i18n.js; don't edit by hand).
  var TRANSLATED = /* i18n:pages */["/","/claim","/copilot","/about","/disclosures","/guides","/faq","/glossary","/how-gomining-works","/privacy","/terms","/is-gomining-worth-it","/gomining-discount-explained","/gomining-promo-code","/gomining-roi-calculator","/gomining-marketplace-checker","/login","/signup","/profile","/settings","/dashboard","/chat","/console","/planner","/projection","/planner/projection","/gomining-1-th-roi","/gomining-5-th-roi","/gomining-10-th-roi","/gomining-25-th-roi","/gomining-50-th-roi","/gomining-100-th-roi","/gomining-250-th-roi","/gomining-500-th-roi","/gomining-profit-btc-75k","/gomining-profit-btc-100k","/gomining-profit-btc-150k","/gomining-profit-btc-200k","/gomining-profit-btc-250k","/gomining-worth-it-now"]/* /i18n:pages */;
  var STR = {
    en: {},
    es: { Calculator: 'Calculadora', 'Growth Projection': 'Proyección', Guides: 'Guías', 'New to GoMining?': '¿Nuevo en GoMining?', Tools: 'Herramientas',
      'ROI Calculator': 'Calculadora de ROI', 'Marketplace Checker': 'Comprobador del marketplace', 'Co-pilot': 'Copiloto', Learn: 'Aprender',
      FAQ: 'Preguntas frecuentes', Glossary: 'Glosario', 'How GoMining works': 'Cómo funciona GoMining', Company: 'Empresa', About: 'Sobre GMT-Optimizer',
      Contact: 'Contacto', Legal: 'Legal', 'Privacy Policy': 'Política de privacidad', 'Terms of Use': 'Condiciones de uso', Disclosures: 'Divulgaciones',
      'Get Started': 'Empezar', 'Skip to content': 'Saltar al contenido', 'GMT-Optimizer home': 'Inicio de GMT-Optimizer', Main: 'Principal',
      Language: 'Idioma', 'Language: ': 'Idioma: ', Messages: 'Mensajes', 'Open menu': 'Abrir menú', Menu: 'Menú', soon: 'pronto',
      tagline: 'Calculadora, planificador y proyecciones independientes para GoMining, con datos de la red en directo. Sin anuncios.',
      'Support the site:': 'Apoya la web:', 'Copy BTC address': 'Copiar dirección BTC', 'Copy GMT address (ETH/BNB)': 'Copiar dirección GMT (ETH/BNB)',
      legal1: 'Herramienta independiente. No afiliada, respaldada ni gestionada por GoMining.', legal2: 'Recibo una recompensa por referido si usas mi código. No es asesoramiento financiero.',
      'Log in': 'Iniciar sesión', 'Log in (bar)': 'Entrar', 'Create account': 'Crear cuenta', Account: 'Cuenta', Dashboard: 'Panel', Profile: 'Perfil', Settings: 'Ajustes',
      'Log out': 'Cerrar sesión', 'Account menu for ': 'Menú de cuenta de ' },
    fr: { Calculator: 'Calculateur', 'Growth Projection': 'Projection', Guides: 'Guides', 'New to GoMining?': 'Nouveau sur GoMining ?', Tools: 'Outils',
      'ROI Calculator': 'Calculateur de ROI', 'Marketplace Checker': 'Vérificateur du marketplace', 'Co-pilot': 'Copilote', Learn: 'Apprendre',
      FAQ: 'FAQ', Glossary: 'Glossaire', 'How GoMining works': 'Comment fonctionne GoMining', Company: 'À propos', About: 'Qui sommes-nous',
      Contact: 'Contact', Legal: 'Mentions', 'Privacy Policy': 'Politique de confidentialité', 'Terms of Use': 'Conditions d\u2019utilisation', Disclosures: 'Transparence',
      'Get Started': 'Commencer', 'Skip to content': 'Aller au contenu', 'GMT-Optimizer home': 'Accueil GMT-Optimizer', Main: 'Principal',
      Language: 'Langue', 'Language: ': 'Langue : ', Messages: 'Messages', 'Open menu': 'Ouvrir le menu', Menu: 'Menu', soon: 'bientôt',
      tagline: 'Calculateur, planificateur et projections GoMining indépendants, sur les données réseau en direct. Sans publicité.',
      'Support the site:': 'Soutenir le site :', 'Copy BTC address': 'Copier l\u2019adresse BTC', 'Copy GMT address (ETH/BNB)': 'Copier l\u2019adresse GMT (ETH/BNB)',
      legal1: 'Outil indépendant. Ni affilié à GoMining, ni approuvé, ni exploité par GoMining.', legal2: 'Je touche une récompense de parrainage si vous utilisez mon code. Pas un conseil financier.',
      'Log in': 'Se connecter', 'Log in (bar)': 'Connexion', 'Create account': 'Créer un compte', Account: 'Compte', Dashboard: 'Tableau de bord', Profile: 'Profil', Settings: 'Paramètres',
      'Log out': 'Se déconnecter', 'Account menu for ': 'Menu du compte de ' },
    de: { Calculator: 'Rechner', 'Growth Projection': 'Wachstumsprognose', Guides: 'Ratgeber', 'New to GoMining?': 'Neu bei GoMining?', Tools: 'Tools',
      'ROI Calculator': 'ROI-Rechner', 'Marketplace Checker': 'Marketplace-Check', 'Co-pilot': 'Co-Pilot', Learn: 'Lernen',
      FAQ: 'FAQ', Glossary: 'Glossar', 'How GoMining works': 'So funktioniert GoMining', Company: 'Über uns', About: 'Über GMT-Optimizer',
      Contact: 'Kontakt', Legal: 'Rechtliches', 'Privacy Policy': 'Datenschutz', 'Terms of Use': 'Nutzungsbedingungen', Disclosures: 'Offenlegungen',
      'Get Started': 'Loslegen', 'Skip to content': 'Zum Inhalt springen', 'GMT-Optimizer home': 'GMT-Optimizer Startseite', Main: 'Haupt',
      Language: 'Sprache', 'Language: ': 'Sprache: ', Messages: 'Nachrichten', 'Open menu': 'Menü öffnen', Menu: 'Menü', soon: 'bald',
      tagline: 'Unabhängiger GoMining-Rechner, Planer und Prognosen auf Basis von Live-Netzwerkdaten. Ohne Werbung.',
      'Support the site:': 'Unterstütze die Seite:', 'Copy BTC address': 'BTC-Adresse kopieren', 'Copy GMT address (ETH/BNB)': 'GMT-Adresse kopieren (ETH/BNB)',
      legal1: 'Unabhängiges Tool. Weder mit GoMining verbunden noch von GoMining unterstützt oder betrieben.', legal2: 'Ich erhalte eine Empfehlungsprämie, wenn du meinen Code nutzt. Keine Finanzberatung.',
      'Log in': 'Anmelden', 'Log in (bar)': 'Anmelden', 'Create account': 'Konto erstellen', Account: 'Konto', Dashboard: 'Dashboard', Profile: 'Profil', Settings: 'Einstellungen',
      'Log out': 'Abmelden', 'Account menu for ': 'Kontomenü von ' }
  };
  var EN_TEXT = { tagline: 'Independent GoMining calculator, planner and projections, on live network data. No ads.',
    legal1: 'Independent tool. Not affiliated with, endorsed by, or operated by GoMining.', legal2: 'I earn a referral reward if you use my code. Not financial advice.' };
  var t = function (k) { return (STR[LANG] && STR[LANG][k]) || EN_TEXT[k] || k; };
  // A site path in the current language: /claim → /es/claim when that page is translated.
  var L = function (href) {
    if (LANG === 'en' || !href || href.charAt(0) !== '/' || href.charAt(1) === '/') return href;
    var m = href.match(/^([^?#]*)(.*)$/), p = m[1].replace(/\/$/, '') || '/';
    return TRANSLATED.indexOf(p) >= 0 ? '/' + LANG + (p === '/' ? '/' : p) + m[2] : href;
  };
  var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '').replace(/^\/(es|fr|de)(?=\/|$)/, '') || '/';

  var NAV = [
    { href: '/console', label: 'Calculator', on: /^\/(console|planner|edit)(\/|$)/ },
    { href: '/projection', label: 'Growth Projection', on: /^\/(projection|planner\/projection)(\/|$)/ },
    { href: '/guides', label: 'Guides', on: /^\/(guides|how-gomining-works|is-gomining-worth-it|gomining-worth-it-now|gomining-discount-explained|gomining-roi-calculator|gomining-promo-code|gomining-marketplace-checker|gomining-\d+-th-roi|gomining-profit-btc-\d+k|faq|glossary)(\/|$)/ },
    { href: '/claim', label: 'New to GoMining?', on: /^\/claim(\/|$)/ }
  ];
  var FOOT = [
    ['Tools', [['Calculator', '/console'], ['Growth Projection', '/projection'], ['ROI Calculator', '/gomining-roi-calculator'], ['Marketplace Checker', '/gomining-marketplace-checker'], ['Co-pilot', '/copilot'], ['New to GoMining?', '/claim']]],
    ['Learn', [['Guides', '/guides'], ['FAQ', '/faq'], ['Glossary', '/glossary'], ['How GoMining works', '/how-gomining-works']]],
    ['Company', [['About', '/about'], ['Contact', '/about#contact'], ['Telegram (@RingoMining)', TG, 1], ['ringomining.com', 'https://ringomining.com/', 1]]],
    ['Legal', [['Privacy Policy', '/privacy'], ['Terms of Use', '/terms'], ['Disclosures', '/disclosures']]]
  ];
  var LANGS = [['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch']];   // es/fr/de go live in Phase 7

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var cur = function (re) { return re.test(path) ? ' aria-current="page"' : ''; };
  var ext = function (x) { return x ? ' target="_blank" rel="noopener"' : ''; };
  var chev = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var msgIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var burgerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  // ---------- markup ----------
  // Each language links to this page's own translation (its hreflang alternate), or shows "soon" when there isn't one.
  function altHref(l) {
    if (l === LANG) return location.pathname + location.search;
    var a = document.querySelector('link[rel="alternate"][hreflang="' + l + '"]');
    if (!a) return null;
    try { return new URL(a.getAttribute('href')).pathname + location.search; } catch (e) { return null; }
  }
  function langMenu() {
    return LANGS.map(function (l) {
      var h = altHref(l[0]);
      if (l[0] === LANG) return '<a href="' + esc(h) + '" lang="' + l[0] + '" hreflang="' + l[0] + '" aria-current="true">' + l[1] + '</a>';
      return h ? '<a href="' + esc(h) + '" lang="' + l[0] + '" hreflang="' + l[0] + '" data-lang="' + l[0] + '">' + l[1] + '</a>'
        : '<a lang="' + l[0] + '" aria-disabled="true" tabindex="-1">' + l[1] + ' <span class="sc-soon">' + t('soon') + '</span></a>';
    }).join('');
  }
  document.addEventListener('click', function (e) {   // remember an explicit choice (used by the account preference later)
    var a = e.target.closest && e.target.closest('[data-lang], .sc-lang [aria-current], .sc-mobile__langs a');
    if (a) ls.set('gmt_lang', a.getAttribute('lang') || 'en');
  });
  var header = document.createElement('header');
  header.className = 'sc-header';
  header.innerHTML =
    '<a class="sc-skip" href="#sc-main">' + t('Skip to content') + '</a>' +
    '<div class="sc-bar">' +
      '<a class="sc-logo" href="' + L('/') + '" aria-label="' + t('GMT-Optimizer home') + '"><img src="' + WORDMARK + '" alt="GMT-Optimizer" width="138" height="36"></a>' +
      '<nav class="sc-nav" aria-label="' + t('Main') + '">' + NAV.map(function (n) { return '<a href="' + L(n.href) + '"' + cur(n.on) + '>' + t(n.label) + '</a>'; }).join('') + '</nav>' +
      '<div class="sc-actions">' +
        '<div class="sc-pop sc-lang"><button type="button" class="sc-pop__btn" aria-haspopup="true" aria-expanded="false" aria-label="' + t('Language: ') + LANGS.filter(function (l) { return l[0] === LANG; })[0][1] + '">' + LANG.toUpperCase() + ' ' + chev + '</button>' +
          '<div class="sc-pop__menu" hidden>' + langMenu() + '</div></div>' +
        '<a class="sc-icon-btn sc-msg" href="/chat" hidden aria-label="' + t('Messages') + '">' + msgIcon + '<span class="ui-count" hidden></span></a>' +
        '<div class="sc-acct"></div>' +
        '<a class="ui-btn ui-btn--primary ui-btn--sm sc-cta" href="' + L('/claim') + '">' + t('Get Started') + '</a>' +
        '<button type="button" class="sc-icon-btn sc-burger" aria-expanded="false" aria-controls="sc-mobile" aria-label="' + t('Open menu') + '">' + burgerIcon + '</button>' +
      '</div>' +
    '</div>';

  var mobile = document.createElement('div');
  mobile.className = 'sc-mobile';
  mobile.id = 'sc-mobile';
  mobile.hidden = true;
  mobile.setAttribute('role', 'dialog');
  mobile.setAttribute('aria-modal', 'true');
  mobile.setAttribute('aria-label', t('Menu'));
  mobile.innerHTML =
    '<nav class="sc-mobile-nav" aria-label="' + t('Main') + '">' + NAV.map(function (n) { return '<a href="' + L(n.href) + '"' + cur(n.on) + '>' + t(n.label) + '</a>'; }).join('') + '</nav>' +
    FOOT.slice(0, 3).map(function (c) {
      return '<div class="sc-mobile__group"><h2>' + t(c[0]) + '</h2><div class="sc-mobile__links">' +
        c[1].map(function (l) { return '<a href="' + L(l[1]) + '"' + ext(l[2]) + '>' + t(l[0]) + '</a>'; }).join('') + '</div></div>';
    }).join('') +
    '<div class="sc-mobile__group"><h2>' + t('Language') + '</h2><div class="sc-mobile__langs">' +
      LANGS.map(function (l) {
        var h = altHref(l[0]);
        if (l[0] === LANG) return '<span class="ui-badge ui-badge--gold">' + l[1] + '</span>';
        return h ? '<a class="ui-badge" href="' + esc(h) + '" lang="' + l[0] + '" hreflang="' + l[0] + '">' + l[1] + '</a>' : '<span class="ui-badge" aria-disabled="true">' + l[1] + ' · ' + t('soon') + '</span>';
      }).join('') +
    '</div></div>' +
    '<div class="sc-mobile__acct"></div>' +
    '<a class="ui-btn ui-btn--primary ui-btn--block" href="' + L('/claim') + '">' + t('Get Started') + '</a>';

  function mount() {
    var body = document.body;
    body.insertBefore(mobile, body.firstChild);
    body.insertBefore(header, body.firstChild);
    document.documentElement.classList.add('sc-on');
    // skip-link target: the page's own <main>, else the first thing after the header
    var main = document.querySelector('main') || header.nextElementSibling;
    if (main && !main.id) main.id = 'sc-main'; else if (main && main.id !== 'sc-main') header.querySelector('.sc-skip').href = '#' + main.id;
    if (!NO_FOOTER) body.appendChild(footer());
    wirePopovers();
    wireMobile();
    initAccount();
  }

  function footer() {
    var f = document.createElement('footer');
    f.className = 'sc-footer';
    f.innerHTML =
      '<div class="sc-footer__inner">' +
        '<div class="sc-footer__top">' +
          '<div class="sc-footer__brand"><img src="' + WORDMARK + '" alt="GMT-Optimizer" width="108" height="28" loading="lazy">' +
            '<p>' + t('tagline') + '</p></div>' +
          '<div class="sc-footer__cols">' + FOOT.map(function (c) {
            return '<div><h2>' + t(c[0]) + '</h2><ul>' + c[1].map(function (l) { return '<li><a href="' + L(l[1]) + '"' + ext(l[2]) + '>' + t(l[0]) + '</a></li>'; }).join('') + '</ul></div>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="sc-footer__support"><span>' + t('Support the site:') + '</span>' +
          '<button type="button" class="sc-addr" data-copy="3QfKwNdXmeXAYNZ8ndKGYSzfGmbqfxxzmE" title="' + t('Copy BTC address') + '"><b>BTC</b><span>3QfKwNdXmeXAYNZ8ndKGYSzfGmbqfxxzmE</span></button>' +
          '<button type="button" class="sc-addr" data-copy="0xFa15fBf74E106629c7E1D57e604aE1d5C5FEABd1" title="' + t('Copy GMT address (ETH/BNB)') + '"><b>GMT</b><span>0xFa15fBf74E106629c7E1D57e604aE1d5C5FEABd1</span></button>' +
        '</div>' +
        '<div class="sc-footer__legal">' +
          '<span>&copy; ' + new Date().getFullYear() + ' GMT-Optimizer</span>' +
          '<span>' + t('legal1') + '</span>' +
          '<span>' + t('legal2') + '</span>' +
        '</div>' +
      '</div>';
    f.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]'); if (!b) return;
      try { navigator.clipboard && navigator.clipboard.writeText(b.getAttribute('data-copy')); } catch (_) {}
      b.classList.add('copied'); setTimeout(function () { b.classList.remove('copied'); }, 1400);
    });
    return f;
  }

  // ---------- popovers (language, account) ----------
  function wirePopovers() {
    header.addEventListener('click', function (e) {
      var btn = e.target.closest('.sc-pop__btn, .sc-acct-btn');
      if (!btn) return;
      var menu = btn.parentNode.querySelector('.sc-pop__menu');
      var open = btn.getAttribute('aria-expanded') !== 'true';
      closeAll();
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.hidden = !open;
      if (open) { var first = menu.querySelector('a:not([aria-disabled="true"]), button'); if (first) first.focus(); }
      e.stopPropagation();
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.sc-pop')) closeAll(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var openBtn = header.querySelector('[aria-expanded="true"]:not(.sc-burger)');
        closeAll(); if (openBtn) openBtn.focus();
      }
    });
  }
  function closeAll() {
    header.querySelectorAll('.sc-pop__menu').forEach(function (m) { m.hidden = true; });
    header.querySelectorAll('.sc-pop__btn, .sc-acct-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  // ---------- mobile panel (focus-trapped while open) ----------
  function wireMobile() {
    var burger = header.querySelector('.sc-burger');
    function set(open) {
      mobile.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      burger.innerHTML = open ? closeIcon : burgerIcon;
      document.documentElement.classList.toggle('sc-lock', open);
      if (open) { var f = mobile.querySelector('a, button'); if (f) f.focus(); } else burger.focus();
    }
    burger.addEventListener('click', function () { set(mobile.hidden); });
    mobile.addEventListener('click', function (e) { if (e.target.closest('a[href]')) set(false); });
    document.addEventListener('keydown', function (e) {
      if (mobile.hidden) return;
      if (e.key === 'Escape') { set(false); return; }
      if (e.key !== 'Tab') return;
      var items = [burger].concat(Array.prototype.slice.call(mobile.querySelectorAll('a[href], button:not([disabled])')));
      var i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); }
    });
    matchMedia('(min-width: 1024px)').addEventListener('change', function (m) { if (m.matches && !mobile.hidden) set(false); });
  }

  // ---------- account ----------
  var state = { in: false, id: null, name: '', username: '', avatar: '' };
  function GA() { var a = window.GMTAccount; return a && a.ready && a.sb ? a : null; }

  function session() {
    var raw = ls.get(AUTH_KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      s = s.currentSession || s;
      if (!s || !s.access_token || !s.user) return null;
      if (s.expires_at && s.expires_at * 1000 < Date.now() - 6 * 3600 * 1000) return null;   // long expired: treat as logged out
      return s;
    } catch (e) { return null; }
  }

  function initAccount() {
    var tries = 0;
    (function wait() {
      var a = GA();
      if (a) { a.onChange(fromAccount); fromAccount(a); return; }
      // account.js only runs on some pages; elsewhere read the saved session directly
      if (++tries === 1) fromSession();
      if (tries < 30 && document.querySelector('script[src*="/assets/account.js"]')) setTimeout(wait, 100);
    })();
  }
  function fromAccount(a) {
    var p = a.profile || {};
    state = { in: a.isLoggedIn(), id: a.user && a.user.id, name: p.display_name || p.username || '', username: p.username || '', avatar: p.avatar_url || '' };
    renderAccount();
  }
  function fromSession() {
    var s = session();
    if (!s) { state = { in: false }; renderAccount(); return; }
    var meta = s.user.user_metadata || {};
    state = { in: true, id: s.user.id, name: meta.username || 'Account', username: meta.username || '', avatar: '' };
    renderAccount();
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem('gm_chrome_profile') || 'null'); } catch (e) {}
    if (cached && cached.id === s.user.id) { apply(cached); return; }
    fetch(SB_URL + '/rest/v1/profiles?select=id,username,display_name,avatar_url&id=eq.' + encodeURIComponent(s.user.id),
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + s.access_token } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { if (rows[0]) { try { sessionStorage.setItem('gm_chrome_profile', JSON.stringify(rows[0])); } catch (e) {} apply(rows[0]); } })
      .catch(function () {});
    function apply(p) { state.name = p.display_name || p.username || state.name; state.username = p.username || state.username; state.avatar = p.avatar_url || ''; renderAccount(); }
  }

  function avatarHTML(size) {
    return '<span class="ui-avatar ui-avatar--' + size + (state.avatar ? '' : ' ui-avatar--default') + '"><img src="' + esc(state.avatar || ICON) + '" alt=""></span>';
  }
  function renderAccount() {
    var slot = header.querySelector('.sc-acct'), mslot = mobile.querySelector('.sc-mobile__acct'), msg = header.querySelector('.sc-msg');
    // On the console the icon is the one chat entry point (its in-page chat is open to read logged out too).
    msg.hidden = !state.in && !document.getElementById('gmtOnline');
    if (!state.in) {
      var nx = /^\/(login|signup)$/.test(location.pathname.replace(/\.html$/, '')) ? '' : '?next=' + encodeURIComponent(location.pathname + location.search);
      var barLogin = (STR[LANG] && STR[LANG]['Log in (bar)']) || t('Log in');   // short label: the bar is tight on phones
      slot.innerHTML = '<a class="ui-btn ui-btn--ghost ui-btn--sm" href="' + L('/login') + nx + '">' + barLogin + '</a>';
      mslot.innerHTML = '<div class="sc-mobile__group"><h2>' + t('Account') + '</h2><div class="ui-stack"><a class="ui-btn ui-btn--secondary ui-btn--block" href="' + L('/login') + nx + '">' + t('Log in') + '</a>' +
        '<a class="ui-btn ui-btn--ghost ui-btn--block" href="' + L('/signup') + nx + '">' + t('Create account') + '</a></div></div>';
    } else {
      slot.innerHTML = '<div class="sc-pop">' +
        '<button type="button" class="sc-acct-btn" aria-haspopup="true" aria-expanded="false" aria-label="' + t('Account menu for ') + esc(state.name) + '">' + avatarHTML('sm') + '</button>' +
        '<div class="sc-pop__menu" hidden>' +
          '<div class="sc-pop__head">' + avatarHTML('') + '<div><b>' + esc(state.name) + '</b>' + (state.username ? '<span>@' + esc(state.username) + '</span>' : '') + '</div></div>' +
          '<div class="sc-pop__sep"></div>' +
          '<a href="' + L('/dashboard') + '">' + t('Dashboard') + '</a>' +
          '<a href="' + L('/profile') + '">' + t('Profile') + '</a>' +
          '<a href="' + L('/settings') + '">' + t('Settings') + '</a>' +
          '<div class="sc-pop__sep"></div>' +
          '<button type="button" class="sc-danger" data-sc="logout">' + t('Log out') + '</button>' +
        '</div></div>';
      mslot.innerHTML = '<div class="sc-mobile__group"><h2>' + t('Account') + '</h2><div class="sc-mobile__links">' +
        '<a href="' + L('/dashboard') + '">' + t('Dashboard') + '</a><a href="/chat">' + t('Messages') + '</a><a href="' + L('/profile') + '">' + t('Profile') + '</a><a href="' + L('/settings') + '">' + t('Settings') + '</a>' +
        '<button type="button" class="ui-btn ui-btn--danger ui-btn--sm" data-sc="logout">' + t('Log out') + '</button></div></div>';
      unread();
    }
  }

  // Log in, Dashboard, Profile and Settings are plain links to their own pages (Phase 5). Log out stays an action.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sc]'); if (!b) return;
    var act = b.getAttribute('data-sc'), a = GA();
    closeAll();
    if (act === 'logout') logout();
  });
  function logout() {
    var a = GA();
    if (a && a.signOut) { a.signOut(); return; }
    var s = session();
    var done = function () { try { localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem('gm_chrome_profile'); } catch (e) {} location.reload(); };
    if (!s) return done();
    fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + s.access_token } }).then(done, done);
  }

  // ---------- unread messages ----------
  function setBadge(n) {
    var c = header.querySelector('.sc-msg .ui-count');
    c.hidden = !(n > 0);
    c.textContent = n > 99 ? '99+' : String(n);
    header.querySelector('.sc-msg').setAttribute('aria-label', n > 0 ? 'Messages, ' + n + ' unread' : 'Messages');
  }
  function unread() {
    if (!state.in) return;
    var seen = ls.get(SEEN_KEY);
    if (!seen) { ls.set(SEEN_KEY, new Date().toISOString()); return setBadge(0); }   // first visit: start counting from now
    var q = SB_URL + '/rest/v1/messages?select=id&created_at=gt.' + encodeURIComponent(seen) + (state.id ? '&user_id=neq.' + encodeURIComponent(state.id) : '');
    fetch(q, { method: 'HEAD', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'count=exact' } })
      .then(function (r) { var cr = r.headers.get('content-range') || ''; var n = parseInt(cr.split('/')[1], 10); setBadge(isFinite(n) ? n : 0); })
      .catch(function () {});
  }
  // chat.js reports live unread counts where the chat runs
  document.addEventListener('gmt-chat-unread', function (e) { setBadge(e.detail || 0); });
  // On pages with the in-page chat panel, the icon opens it instead of leaving the page.
  header.addEventListener('click', function (e) {
    if (!e.target.closest('.sc-msg')) return;
    var panel = document.getElementById('gmtOnline');
    if (panel) { e.preventDefault(); panel.click(); }
  });

  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
