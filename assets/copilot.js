/*
  GMT Optimizer co-pilot: a scripted guide in Ringo's voice. No AI, no API, no backend.
  Same engine as the ringomining.com co-pilot, tailored to this site: it walks people through the
  tools (opening them in place when they're already on the console), explains the GMT discount,
  gets new users signed up with RINGO5, and sends their GoMining username to the same Formspree
  form /claim uses. Anything off-script goes to Ringo on Telegram or text.

  Edit the wording in NODES below. Each node has:
    say:   lines Ringo says (trusted HTML, written here only)
    links: buttons -> { t, kind: ref|copy|tg|sms } or { t, href, run }  (run = console function to
           call instead of navigating, when it exists on this page)
    opts:  reply buttons -> { t: label, go: next node }
    ask:   collect a value -> { key, label, type, check, bad, next, optional }
  Loaded on every page by site.js / chrome.js.
*/
(function () {
  if (window.__gmCopilot) return;
  window.__gmCopilot = true;
  if (window.self !== window.top) return;   // not inside embeds / iframes

  var CODE = "RINGO5";
  var REF = "https://gomining.com/?ref=" + CODE;
  var TG = "https://t.me/RinGoMining";
  var PHONE = "906-235-5711";
  var SMS = "sms:+1" + PHONE.replace(/\D/g, "");
  var FORM = "https://formspree.io/f/xojokqwe";   // same endpoint as /claim
  var STORE = "gmt_copilot";
  var AVATAR = "/assets/brand/ringo.png";

  var NODES = {
    start: {
      say: ["What's up, Ringo here. I built GMT Optimizer.", "What can I help you with?"],
      opts: [
        { t: "Help me use the calculator", go: "tools" },
        { t: "I'm new to GoMining", go: "signup" },
        { t: "How does the GMT discount work?", go: "disc" },
        { t: "I've got questions", go: "faq" }
      ]
    },

    // ---------- the tools ----------
    tools: {
      say: ["Sure. What are you trying to figure out?"],
      opts: [
        { t: "What my farm earns right now", go: "t_console" },
        { t: "Where to put new money", go: "t_planner" },
        { t: "What my farm looks like in a few years", go: "t_proj" },
        { t: "Is this marketplace miner a good deal?", go: "t_market" },
        { t: "Turn my GoMining CSV into a statement", go: "t_statement" }
      ]
    },
    t_console: {
      say: ["That's the Console. Hit <b>Edit my Farm</b> and add your miners, your locked GMT and your liquid GMT.", "It pulls live BTC price and difficulty, so your daily and monthly numbers are what you'd actually see today, discount included."],
      links: [{ t: "Edit my Farm", href: "/console?view=edit", run: "openEditSetup" }, { t: "Open the Console", href: "/console", run: ["consoleView", "tab-current"] }],
      opts: [{ t: "Another tool", go: "tools" }, { t: "How's the discount figured?", go: "disc" }, { t: "That's all, thanks", go: "bye" }]
    },
    t_planner: {
      say: ["That's the Capital Planner. Put in the amount you want to deploy.", "It tests every split between buying TH, upgrading efficiency and locking GMT, and gives you the one that earns the most at the 20% discount cap."],
      links: [{ t: "Open the Capital Planner", href: "/planner", run: ["consoleView", "tab-planner"] }],
      opts: [{ t: "Then project that plan?", go: "t_proj" }, { t: "Another tool", go: "tools" }, { t: "That's all, thanks", go: "bye" }]
    },
    t_proj: {
      say: ["That's the Growth Projection. Pick 1, 2, 3, 4, 5 or 10 years on the chart.", "It runs 4,000 possible Bitcoin futures, then walks your farm along the typical one, reinvesting every week. Switch between <b>My Farm</b> and <b>My Plan</b> to see it with your Capital Planner money in."],
      links: [{ t: "Open the Growth Projection", href: "/projection", run: "openSetupProjection" }],
      opts: [{ t: "Are those numbers guaranteed?", go: "f_model" }, { t: "Another tool", go: "tools" }, { t: "That's all, thanks", go: "bye" }]
    },
    t_market: {
      say: ["Paste the miner's link into the Marketplace Checker.", "It compares the asking price, the efficiency and the upgrade cost against just minting the same TH new, so you know if the listing actually beats it."],
      links: [{ t: "Open the Marketplace Checker", href: "/gomining-marketplace-checker" }],
      opts: [{ t: "Another tool", go: "tools" }, { t: "That's all, thanks", go: "bye" }]
    },
    t_statement: {
      say: ["Export your income CSV from GoMining and drop it into the Statement tool.", "It turns it into a clean income statement, with ownership splits if you share a farm with someone."],
      links: [{ t: "Open the Statement tool", href: "/statement" }],
      opts: [{ t: "Another tool", go: "tools" }, { t: "That's all, thanks", go: "bye" }]
    },

    // ---------- the discount ----------
    disc: {
      say: ["Pay your maintenance in GMT and GoMining discounts it based on how many days of fees your GMT covers.", "Every <b>18 days</b> of coverage is <b>1%</b> off, up to <b>20%</b> at <b>360 days</b>. The Console figures yours automatically from the GMT you enter."],
      links: [{ t: "Read the full breakdown", href: "/gomining-discount-explained" }],
      opts: [{ t: "How much GMT do I need for 20%?", go: "disc2" }, { t: "Another question", go: "faq" }, { t: "That's all, thanks", go: "bye" }]
    },
    disc2: {
      say: ["Depends on your farm size and efficiency, since that sets your daily fee.", "Add your farm in the Console and it shows your coverage in days. The Capital Planner tells you exactly how much to lock to hit 20%."],
      links: [{ t: "Edit my Farm", href: "/console?view=edit", run: "openEditSetup" }, { t: "Open the Capital Planner", href: "/planner", run: ["consoleView", "tab-planner"] }],
      opts: [{ t: "Another question", go: "faq" }, { t: "That's all, thanks", go: "bye" }]
    },

    // ---------- sign up ----------
    signup: {
      say: ["Let's get you set up with my code <b>" + CODE + "</b>. Tap the button. It opens GoMining in a new tab with the code already on, so this chat stays right here.", "Create your account. If it asks for a referral code, type <b>" + CODE + "</b>."],
      links: [{ t: "Open GoMining ↗", kind: "ref" }, { t: "Copy " + CODE, kind: "copy" }],
      opts: [
        { t: "Done, account made ✓", go: "buy" },
        { t: "I already have an account", go: "existing" },
        { t: "It never asked for a code", go: "nocode" },
        { t: "I'm stuck", go: "human" }
      ]
    },
    nocode: {
      say: ["That's normal. The link puts the code on for you.", "If you want to be sure, check your profile in GoMining. Accounts less than 30 days old can still add <b>" + CODE + "</b> there. Do it before you buy anything."],
      opts: [{ t: "Got it, next step", go: "buy" }, { t: "I'm stuck", go: "human" }]
    },
    existing: {
      say: ["Real talk: GoMining's new-user bonus only works on accounts created with <b>" + CODE + "</b>.", "If your account is less than 30 days old, add " + CODE + " in your profile before you buy. Older than that? Message me before you buy and we'll figure it out."],
      opts: [{ t: "Added it ✓", go: "buy" }, { t: "My account is older", go: "human" }, { t: "Back", go: "start" }]
    },
    buy: {
      say: ["With my code, GoMining adds <b>5% bonus terahash</b> to your first miner.", "How much to start with is your call, not mine. Only put in money you can afford to lose. Run your numbers in the Capital Planner first."],
      links: [{ t: "Open the Capital Planner", href: "/planner", run: ["consoleView", "tab-planner"] }],
      opts: [{ t: "Send Ringo my username", go: "claim" }, { t: "Questions first", go: "faq" }]
    },
    claim: {
      say: ["Send me your GoMining username so I can confirm you're under my code and help you get your farm set up.", "Three quick things. I'll fill it in as we go."],
      opts: [{ t: "Let's do it", go: "q_name" }, { t: "Not yet", go: "start" }]
    },
    q_name: {
      say: ["What should I call you?"],
      ask: { key: "name", label: "Your name or handle", type: "text", check: /\S{2,}/, bad: "Give me at least a couple letters.", next: "q_user" }
    },
    q_user: {
      say: ["Your GoMining username? It's the name on your GoMining profile."],
      ask: { key: "user", label: "GoMining username", type: "text", check: /\S{2,}/, bad: "That username looks too short. Try again?", next: "q_contact" }
    },
    q_contact: {
      say: ["Best way to reach you? Email, Telegram or X all work."],
      ask: { key: "contact", label: "Email, @telegram or @x", type: "text", check: /\S{3,}/, bad: "I need some way to reach you.", next: "review" }
    },
    review: { say: [], review: true },
    sent: {
      say: ["Got it. 🔥", "I'll check your username against my referral list and reach out.", "Welcome to the team."],
      links: [{ t: "Message me on Telegram", kind: "tg" }],
      opts: [{ t: "Help me use the calculator", go: "tools" }, { t: "I've got a question", go: "faq" }]
    },
    sendfail: {
      say: ["Hmm, that didn't send. Check your connection and try again, or send me your username on Telegram and I'll set you up by hand."],
      links: [{ t: "Message me on Telegram", kind: "tg" }],
      opts: [{ t: "Try again", go: "review" }]
    },

    // ---------- questions ----------
    faq: {
      say: ["Ask away. What's on your mind?"],
      opts: [
        { t: "Are these numbers guaranteed?", go: "f_model" },
        { t: "Is GoMining legit?", go: "f_legit" },
        { t: "How do I get money to my bank?", go: "f_bank" },
        { t: "What's in it for you?", go: "f_you" },
        { t: "Talk to Ringo", go: "human" }
      ]
    },
    f_model: {
      say: ["No. Everything here runs on live BTC price and difficulty, but the future is a model, not a promise.", "The projections assume Bitcoin keeps tracking its long-run trend and difficulty keeps grinding up. Use them to compare options, not to bank on a number. Not financial advice."],
      opts: [{ t: "Another question", go: "faq" }, { t: "Help me use the calculator", go: "tools" }]
    },
    f_legit: {
      say: ["Fair question. It's the same risk as any investment. If you own a company's stock and it falls apart, your shares fall with it.", "GoMining has been around since 2017 and has offered this product since 2021. I trust them with my own money. But no investment is risk-free, and this one isn't either.", "GMT Optimizer is my own independent tool, not GoMining's."],
      opts: [{ t: "Another question", go: "faq" }, { t: "Let's get started", go: "signup" }]
    },
    f_bank: {
      say: ["Here's how I do it. I withdraw on BNB Smart Chain, swap to USDC, send it to Coinbase, then to my bank.", "Or skip all that and spend it with the GoMining Visa card through Apple Pay."],
      links: [{ t: "Open Coinbase ↗", href: "https://coinbase.com/join/MC6T569" }],
      opts: [{ t: "Another question", go: "faq" }, { t: "Let's get started", go: "signup" }]
    },
    f_you: {
      say: ["Full transparency: GoMining pays me a referral commission plus ongoing ambassador rewards tied to your mining fees.", "That's also how I keep GMT Optimizer free and ad-free."],
      opts: [{ t: "Another question", go: "faq" }, { t: "Let's get started", go: "signup" }]
    },
    human: {
      say: ["Hit me up directly. I answer myself, usually pretty quick."],
      links: [{ t: "Message me on Telegram", kind: "tg" }, { t: "Text me", kind: "sms" }],
      opts: [{ t: "Back to the start", go: "start" }]
    },
    bye: {
      say: ["Anytime. I'm right here in the corner if you need me."],
      opts: [{ t: "Back to the start", go: "start" }]
    }
  };

  // ---------- state ----------
  var state = load() || { node: null, data: {} };
  function load() { try { return JSON.parse(sessionStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  // ---------- styles ----------
  var css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/assets/copilot.css?v=1";
  document.head.appendChild(css);

  // ---------- shell ----------
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  var fab = el("button", "gc-fab");
  fab.type = "button";
  fab.setAttribute("aria-label", "Ask Ringo");
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = '<img src="' + AVATAR + '" alt="" width="56" height="56"><span class="gc-dot"></span>';

  var tip = el("div", "gc-tip");
  tip.innerHTML = '<button type="button" class="gc-tip-x" aria-label="Dismiss">×</button><span>Need a hand with the numbers? Ask me.</span>';

  var panel = el("section", "gc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Ask Ringo");
  panel.hidden = true;
  panel.innerHTML =
    '<header class="gc-head"><img src="' + AVATAR + '" alt="" width="36" height="36">' +
    '<div><strong>Ringo</strong><small>GMT Optimizer guide · code ' + CODE + '</small></div>' +
    '<button type="button" class="gc-restart" title="Start over">↺</button>' +
    '<button type="button" class="gc-close" aria-label="Close">×</button></header>' +
    '<div class="gc-log" aria-live="polite"></div>' +
    '<div class="gc-foot"></div>';
  var log = panel.querySelector(".gc-log");
  var foot = panel.querySelector(".gc-foot");

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(tip);
    document.body.appendChild(fab);
    document.documentElement.classList.add("gc-on");
    var seenTip = false;
    try { seenTip = !!localStorage.getItem(STORE + "_tip"); } catch (e) {}
    if (!seenTip && !state.node) setTimeout(function () { if (panel.hidden) tip.classList.add("show"); }, 9000);
    // other elements can open the guide: <a data-copilot href="#">Ask Ringo</a>
    document.querySelectorAll("[data-copilot]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); open(); });
    });
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  function hideTip() { tip.classList.remove("show"); try { localStorage.setItem(STORE + "_tip", "1"); } catch (e) {} }
  tip.querySelector(".gc-tip-x").addEventListener("click", hideTip);
  tip.querySelector("span").addEventListener("click", function () { hideTip(); open(); });
  fab.addEventListener("click", function () { panel.hidden ? open() : close(); });
  panel.querySelector(".gc-close").addEventListener("click", close);
  panel.querySelector(".gc-restart").addEventListener("click", function () {
    state = { node: null, data: {} }; save(); log.innerHTML = ""; go("start");
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });

  var started = false;
  function open() {
    hideTip();
    panel.hidden = false;
    fab.classList.add("on");
    fab.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("gc-open");
    if (!started) {
      started = true;
      if (state.node && NODES[state.node] && state.node !== "start" && state.node !== "sent" && state.node !== "bye") {
        bot(["Picking up where we left off."], true);
        go(state.node, true);
      } else go("start");
    }
    var f = foot.querySelector("input, button");
    if (f) setTimeout(function () { f.focus(); }, 50);
  }
  function close() {
    panel.hidden = true;
    fab.classList.remove("on");
    fab.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("gc-open");
    fab.focus();
  }
  window.gmCopilot = { open: open, close: close };

  // ---------- rendering ----------
  function scroll() { log.scrollTop = log.scrollHeight; }
  function bot(lines, instant, after) {
    var i = 0;
    var reduce = instant || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    (function next() {
      if (i >= lines.length) { if (after) after(); return; }
      var b = el("div", "gc-msg gc-bot");
      if (reduce) {
        b.innerHTML = lines[i++]; log.appendChild(b); scroll(); next();
      } else {
        b.classList.add("gc-typing"); b.innerHTML = "<i></i><i></i><i></i>";
        log.appendChild(b); scroll();
        setTimeout(function () { b.classList.remove("gc-typing"); b.innerHTML = lines[i++]; scroll(); next(); },
          Math.min(900, 280 + lines[i].length * 6));
      }
    })();
  }
  function me(text) {
    var b = el("div", "gc-msg gc-me");
    b.textContent = text;   // user text is never treated as HTML
    log.appendChild(b); scroll();
  }

  // A tool link: when the console function it names exists on this page, run it in place
  // (and get the chat out of the way on phones); otherwise navigate.
  function runnable(run) {
    if (!run) return null;
    var name = Array.isArray(run) ? run[0] : run;
    return typeof window[name] === "function" ? function () { window[name].apply(window, Array.isArray(run) ? run.slice(1) : []); } : null;
  }
  function linkBtn(l) {
    if (l.kind === "copy") {
      var c = el("button", "gc-link"); c.type = "button"; c.textContent = l.t;
      c.addEventListener("click", function () { copyCode(c); });
      return c;
    }
    var a = el("a", "gc-link" + (l.kind === "ref" ? " gc-fire" : ""));
    a.textContent = l.t;
    a.href = l.kind === "ref" ? REF : l.kind === "tg" ? TG : l.kind === "sms" ? SMS : l.href;
    if (l.kind === "ref" || l.kind === "tg" || /^https?:/.test(l.href || "")) { a.target = "_blank"; a.rel = "noopener"; }
    var fn = runnable(l.run);
    if (fn) a.addEventListener("click", function (e) {
      e.preventDefault();
      if (window.matchMedia && matchMedia("(max-width: 600px)").matches) close();
      try { fn(); } catch (err) { location.href = l.href; }
    });
    return a;
  }
  function copyCode(btn) {
    var done = function () { var o = btn.textContent; btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = o; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(CODE).then(done, done);
    else done();
  }

  function go(id, instant) {
    var n = NODES[id];
    if (!n) return;
    state.node = id; save();
    foot.innerHTML = "";
    if (n.review) return review();
    bot(n.say, instant, function () {
      if (n.links) {
        var row = el("div", "gc-links");
        n.links.forEach(function (l) { row.appendChild(linkBtn(l)); });
        log.appendChild(row);
      }
      scroll();
      if (n.ask) return ask(n.ask);
      if (n.opts) options(n.opts);
    });
  }
  function options(opts) {
    foot.innerHTML = "";
    var wrap = el("div", "gc-opts");
    opts.forEach(function (o) {
      var b = el("button", "gc-opt"); b.type = "button"; b.textContent = o.t;
      b.addEventListener("click", function () { me(o.t); go(o.go); });
      wrap.appendChild(b);
    });
    foot.appendChild(wrap);
    scroll();
  }
  function ask(q) {
    foot.innerHTML = "";
    var f = el("form", "gc-ask"); f.noValidate = true;
    var inp = el("input");
    inp.type = "text";
    inp.setAttribute("aria-label", q.label);
    inp.placeholder = q.label + (q.optional ? " (optional)" : "");
    inp.autocomplete = "off";
    inp.spellcheck = false;
    if (state.data[q.key]) inp.value = state.data[q.key];
    var send = el("button", "gc-send"); send.type = "submit"; send.textContent = "Send";
    f.appendChild(inp); f.appendChild(send);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = inp.value.trim();
      if (q.check && !q.check.test(v)) { bot([q.bad], true); inp.focus(); return; }
      state.data[q.key] = v; save();
      me(v);
      go(q.next);
    });
    foot.appendChild(f);
    scroll();
    setTimeout(function () { inp.focus(); }, 30);
  }
  function review() {
    var d = state.data;
    bot(["Here's what I've got. Look right?"], false, function () {
      var card = el("div", "gc-msg gc-bot gc-card");
      [["Name", d.name], ["GoMining username", d.user], ["Reach me at", d.contact]].forEach(function (r) {
        var row = el("div"); var k = el("span"); var v = el("b");
        k.textContent = r[0]; v.textContent = r[1] || "";
        row.appendChild(k); row.appendChild(v); card.appendChild(row);
      });
      log.appendChild(card);
      var fine = el("div", "gc-fine");
      fine.innerHTML = 'By sending, you agree to the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>. GMT Optimizer is an independent tool, not affiliated with GoMining. Not financial advice.';
      log.appendChild(fine);
      scroll();
      var wrap = el("div", "gc-opts");
      var s = el("button", "gc-opt gc-primary"); s.type = "button"; s.textContent = "Send it →";
      s.addEventListener("click", function () { submit(s); });
      var fix = el("button", "gc-opt"); fix.type = "button"; fix.textContent = "Fix something";
      fix.addEventListener("click", function () { me("Fix something"); go("q_name"); });
      wrap.appendChild(s); wrap.appendChild(fix);
      foot.innerHTML = ""; foot.appendChild(wrap);
    });
  }
  function submit(btn) {
    var d = state.data;
    if (!d.name || !d.user || !d.contact) { bot(["I'm missing something. Let's run through it again."], true); return go("q_name"); }
    btn.disabled = true; btn.textContent = "Sending…";
    fetch(FORM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ name: d.name, gomining_username: d.user, contact: d.contact,
        message: "Sent from the GMT Optimizer co-pilot chat (" + location.pathname + ")", _subject: "GMT Optimizer co-pilot: " + d.user })
    }).then(function (r) {
      if (!r.ok) throw new Error("bad status");
      me("Send it");
      state.data = {}; go("sent");
    }).catch(function () { me("Send it"); go("sendfail"); });
  }
})();
