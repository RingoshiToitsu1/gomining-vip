/* GMT-Optimizer co-pilot script: ENGLISH.
   =========================================
   The words only. The engine (assets/copilot.js) loads this file, then the page language's file
   (es.js, fr.js, de.js) when that one is filled in; a missing or empty language falls back to this one.
   Translators: copy this file, keep every node id, `go` target and `kind`, translate the strings.

   nodes(K): K.CODE is the referral code. Each node:
     say:   lines Ringo says (trusted HTML, written here only)
     links: buttons -> { t, kind: ref|copy|tg|sms } or { t, href, run }  (run = console function to call in place)
     opts:  reply buttons -> { t: label, go: next node }
     ask:   collect a value -> { key, label, type, check, bad, next, optional }
   Numbers in the discount lines (18 days, 1%, 20%, 360 days) are kept in step with data/config.json by
   scripts/build-config.js.
*/
(window.GMTCopilotScripts = window.GMTCopilotScripts || {}).en = {
  ui: {
    name: "Ringo",
    sub: "GMT-Optimizer guide · code {CODE}",
    fab: "Ask Ringo",
    tip: "Need a hand with the numbers? Ask me.",
    tipClose: "Dismiss",
    restart: "Start over",
    close: "Close",
    resume: "Picking up where we left off.",
    send: "Send",
    optional: "(optional)",
    copied: "Copied ✓",
    reviewIntro: "Here's what I've got. Look right?",
    reviewName: "Name",
    reviewUser: "GoMining username",
    reviewContact: "Reach me at",
    fine: 'By sending, you agree to the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>. GMT-Optimizer is an independent tool, not affiliated with GoMining. Not financial advice.',
    sendIt: "Send it →",
    sentEcho: "Send it",
    fix: "Fix something",
    missing: "I'm missing something. Let's run through it again.",
    sending: "Sending…",
    tabCopilot: "Co-pilot",
    tabMessages: "Messages",
    msgLoading: "Loading the chat…",
    msgFail: "The chat couldn't load. Open it on its own page instead.",
    msgOpen: "Open the chat",
    fullPage: "Open full page"
  },
  nodes: function (K) {
    var CODE = K.CODE;
      return {
      start: {
        say: ["What's up, Ringo here. I built GMT-Optimizer.", "What can I help you with?"],
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
        say: ["With my code, GoMining adds three sign-up bonuses: <b>+5% bonus TH</b> on your first miner (up to 25 TH), <b>1 month of VIP Platinum+</b>, and a <b>Card cashback bonus</b> when you spend with the GoMining Card in your first 90 days.", "How much to start with is your call, not mine. Only put in money you can afford to lose. Run your numbers in the Capital Planner first."],
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
        say: ["Fair question. It's the same risk as any investment. If you own a company's stock and it falls apart, your shares fall with it.", "GoMining has been around since 2017 and has offered this product since 2021. I trust them with my own money. But no investment is risk-free, and this one isn't either.", "GMT-Optimizer is my own independent tool, not GoMining's."],
        opts: [{ t: "Another question", go: "faq" }, { t: "Let's get started", go: "signup" }]
      },
      f_bank: {
        say: ["Here's how I do it. I withdraw on BNB Smart Chain, swap to USDC, send it to Coinbase, then to my bank.", "Or skip all that and spend it with the GoMining Visa card through Apple Pay."],
        links: [{ t: "Open Coinbase ↗", href: "https://coinbase.com/join/MC6T569" }],
        opts: [{ t: "Another question", go: "faq" }, { t: "Let's get started", go: "signup" }]
      },
      f_you: {
        say: ["Full transparency: GoMining pays me a referral commission plus ongoing ambassador rewards tied to your mining fees.", "That's also how I keep GMT-Optimizer free and ad-free."],
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
  }
};
