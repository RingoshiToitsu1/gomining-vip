#!/usr/bin/env node
/*
 * gen-pages.js — programmatic SEO/GEO page generator for gmt-optimizer.com
 *
 * Ports the live calculator's economic engine (from index.html) and bakes REAL,
 * per-scenario numbers into static HTML at build time — so Google and AI search
 * engines see concrete data, not client-side JS. Each page is genuinely
 * differentiated (unique computed figures + outcome-dependent commentary), which
 * keeps this on the right side of Google's scaled-content-abuse policy.
 *
 * Run:  cd ~ && NODE_OPTIONS= node scripts/gen-pages.js
 * Output: HTML files in the repo root + updated sitemap.xml.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');            // ~ (repo root)
const SITE = 'https://gmt-optimizer.com';

/* ===== economics: single source of truth in scripts/constants.js ===== */
const {
  BLOCK_SUBSIDY, ELECTRICITY_RATE, SERVICE_RATE, CONVERSION_FEE, STAKING_APR,
  EFF_BEST, EFF_BASE_MAX, MINER_FLOOR_WTH, COV_DAYS_PER_PCT,
  HALVING_DATES, TH_TIERS_12W, FB,
  cptTier, cptAtEff, feePerTHDay, satsPerTHDay, dailyBTCperTH, feesBTC
} = require('./constants.js');

// Per-scenario economics at TODAY's price and difficulty — no forward projection.
// Total-capital model: the GMT you must LOCK to hold the discount is
// counted as invested capital, and the staking APR that GMT earns is counted as income.
function model({th, bp, diff, disc, wth=EFF_BEST}){
  const now=Date.now();
  const dbt=dailyBTCperTH(diff);
  const gross=dbt*th;
  const fee=feesBTC(th,wth,bp);                 // BTC/day, undiscounted
  const dfees=fee*(1-disc/100);
  const netBTC=(gross-dfees)*(1-CONVERSION_FEE);
  const miningUSD=netBTC*bp;                    // mining net, $/day
  const hashCost=th*cptAtEff(th,wth);           // priced at the efficiency modelled, not always 12 W
  // GMT you must lock to hold this discount. Coverage = 18 days of fee per 1%, so disc%
  // needs 18·disc days of the (undiscounted) fee. GMT price cancels: lock$ = days · dailyFee$.
  const gmtLockUSD = disc>0 ? COV_DAYS_PER_PCT*disc*fee*bp : 0;
  const stakingUSD = gmtLockUSD*(STAKING_APR/100)/365.25;   // $/day; GMT valued at today's price, deliberately not marked up
  const totalCapital = hashCost+gmtLockUSD;
  const netUSD = miningUSD+stakingUSD;          // combined daily income
  const feeUSD = fee*bp;                        // USD maintenance fee (price-independent)
  const dfeesUSD = feeUSD*(1-disc/100);
  // What the setup EARNS, at each year mark: cumulative to date, and the run-rate
  // it is on at that moment. Deliberately not a payback date — "you get your money
  // back in N years" leads with the cost and buries the income, which is the wrong
  // way round for a decision people make on what it pays them.
  // NO forward projection here. These pages report what a setup earns TODAY, on
  // live price and difficulty. Projections belong in the calculator, where the user
  // sets their own assumptions and can see them — a multi-year total baked into
  // static HTML is a number nobody chose and everybody reads as a promise.


  return {dbt,gross,fee,dfees,netBTC,netUSD,miningUSD,stakingUSD,feeUSD,wth,bp0:bp,
          hashCost,gmtLockUSD,totalCapital,cost:totalCapital,
          monthlyUSD:netUSD*30.44, yearlyUSD:netUSD*365.25,
          miningMonthlyUSD:miningUSD*30.44, stakingMonthlyUSD:stakingUSD*30.44};
}

/* ===== live data ===== */
async function getLive(){
  const out={bp:FB.btcPrice,diff:FB.difficulty,live:false};
  try{
    const p=await fetch('https://mempool.space/api/v1/prices',{signal:AbortSignal.timeout(15000)});
    const pj=await p.json(); if(pj&&pj.USD)out.bp=pj.USD;
    const d=await fetch('https://mempool.space/api/v1/mining/hashrate/3d',{signal:AbortSignal.timeout(15000)});
    const dj=await d.json(); if(dj&&dj.currentDifficulty)out.diff=dj.currentDifficulty;
    out.live=true;
  }catch(e){console.warn('live fetch failed, using fallback:',e.message);}
  return out;
}

/* ===== formatting ===== */
const usd=n=>'$'+Math.round(n).toLocaleString('en-US');
const usd2=n=>'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/* ===== shared page shell ===== */
function shell({slug,title,desc,faq,body,related,canonicalUrl}){
  // slug is the FILENAME (foo.html); the canonical URL is extensionless. GitHub Pages
  // serves /foo for foo.html, so both resolve — the canonical picks which one Google keeps.
  // canonicalUrl overrides that when this page duplicates a stronger one and should
  // consolidate its signals there instead of competing with it.
  const canonical=canonicalUrl||`${SITE}/${slug.replace(/\.html$/,'')}`;
  const faqLd={"@context":"https://schema.org","@type":"FAQPage","mainEntity":faq.map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))};
  const faqHtml=faq.map(f=>`    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n');
  const relHtml=related.map(r=>`<a href="${r.href}">${esc(r.label)}</a>`).join(' &middot; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og-image.png?v=3">
<script type="application/ld+json">
${JSON.stringify(faqLd,null,2)}
</script>
<link rel="icon" type="image/svg+xml" href="/gmt-optimizer-logo.svg?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/content.css?v=9">
</head>
<body>
<main class="content-wrap">
${body}
  <h2>Frequently asked questions</h2>
  <div class="faq">
${faqHtml}
  </div>
  <div class="related">Read next: ${relHtml}</div>
</main>
<script src="/assets/site.js?v=4"></script>
</body>
</html>
`;
}

const CTA = `  <div class="cta">
    <h3>Run your own numbers — free</h3>
    <p>Plug in your hashrate for live P&amp;L on today's numbers &mdash; then project it forward on assumptions you choose.</p>
    <p style="margin-top:.6rem">New to GoMining? Use code <span class="code">RINGO5</span> for +5% bonus TH — and I'll fund your first TH to get your account started.</p>
    <a href="/console" class="btn">Open the calculator →</a>
  </div>`;


/* ===== page builders ===== */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

// Outcome-dependent verdict so prose genuinely differs per scenario. Framed as a
// yield on capital rather than a payback period — same arithmetic underneath, but
// it answers "what does this pay me" instead of "when do I stop being down".
function verdict(m){
  const y=m.yearlyUSD/m.totalCapital*100;
  const r=`${y.toFixed(1)}% a year on capital at today's price`;
  if(y>=20)return `that is ${r} — a strong rate for cloud mining, though it assumes you hold the maximum fee discount`;
  if(y>=12)return `that is ${r}, a solid rate provided you keep the fee discount in place`;
  if(y>=6)return `that is ${r} — modest, and materially better if Bitcoin outruns the modelled path`;
  return `that is ${r}, a thin rate, so the case rests largely on Bitcoin outperforming the path modelled here`;
}

function hashratePage(th, live, dateStr){
  const full=model({th,bp:live.bp,diff:live.diff,disc:20});
  const none=model({th,bp:live.bp,diff:live.diff,disc:0});
  const slug=`gomining-${th}-th-roi.html`;
  const title=`GoMining ${th} TH: What It Actually Earns (${dateStr.year})`;
  const desc=`What ${th} TH on GoMining earns at today's price: ${usd(full.monthlyUSD)}/mo on ${usd(full.totalCapital)} of capital — counting mining, staking, and the GMT you lock for the discount.`;
  const body=`  <h1>GoMining ${th} TH: What It Actually Earns</h1>
  <p class="lead">Exactly what a ${th} TH GoMining setup costs and pays you at today's price and difficulty — counting the GMT you must lock for the discount and the staking it earns, not just the hashrate.</p>
  <p class="updated">Live figures &middot; Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(full.totalCapital)}</div><div class="s">${usd(full.hashCost)} hashrate + ${usd(full.gmtLockUSD)} GMT lock</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(full.monthlyUSD)}</div><div class="s">${usd(full.miningMonthlyUSD)} mining + ${usd(full.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">GMT to lock</div><div class="v">${usd(full.gmtLockUSD)}</div><div class="s">for the 20% discount</div></div>
    <div class="stat"><div class="k">Per day</div><div class="v">${usd2(full.netUSD)}</div><div class="s">${(full.yearlyUSD/full.totalCapital*100).toFixed(1)}% a year on capital</div></div>
  </div>
  <p>Two things get bought here, and most calculators only count the first. You mint ${th} TH for about <strong>${usd(full.hashCost)}</strong>, and to hold the maximum 20% fee discount you must lock roughly <strong>${usd(full.gmtLockUSD)} of GMT</strong> (360 days of fee coverage) — <strong>${usd(full.totalCapital)}</strong> of capital committed in total. On the income side, the hashrate nets about ${usd(full.miningMonthlyUSD)}/month after fees and the ${CONVERSION_FEE*100}% conversion, and the locked GMT earns roughly ${usd(full.stakingMonthlyUSD)}/month staking at ${STAKING_APR}% APR — about ${usd(full.monthlyUSD)} combined, ${verdict(full)}.</p>
  <h2>Why the locked GMT is not a normal cost</h2>
  <p>Unlike the hashrate, the ${usd(full.gmtLockUSD)} in GMT isn't spent — you still own the tokens and can unlock them later, so it's capital tied up rather than money gone (with GMT price risk while it's locked). It also pulls double duty: it cuts your fee by 20% <em>and</em> earns ${STAKING_APR}% staking. Without any discount, ${th} TH nets only about <strong>${usd(none.monthlyUSD)}/month</strong> and ties up no GMT — but you leave the fee saving and the staking on the table. That trade is the main lever you control.</p>
  <div class="formula">daily net = mining net + GMT staking = (sats/TH/day × ${th} TH × BTC − fee × (1 − discount)) × 0.98 + locked GMT × APR ÷ 365\ntotal capital = hashrate + GMT locked for the discount</div>
  <h2>Why there is no multi-year forecast on this page</h2>
  <p>Every figure above is today's: live Bitcoin price (${usd(live.bp)}), live network difficulty, current fee rates and the ${STAKING_APR}% staking APR. None of it is projected forward, because a multi-year total printed into a static page is a number you did not choose and cannot inspect — and it will be read as a promise no matter how it is labelled. What happens next depends on the Bitcoin price, difficulty growth, the ${new Date(HALVING_DATES[0]).getUTCFullYear()} halving and whether you keep the discount funded. Those are your assumptions to set, so set them in the calculator and watch what moves.</p>
${CTA}`;
  const faq=[
    {q:`How much capital do you really need for ${th} TH on GoMining?`,a:`About ${usd(full.totalCapital)} in total: roughly ${usd(full.hashCost)} for ${th} TH at the 12 W/TH new-miner price (~${usd2(cptTier(th))}/TH), plus about ${usd(full.gmtLockUSD)} of GMT locked to hold the maximum 20% fee discount. The GMT is retained, not spent. With promo code RINGO5 you get 5% extra hashrate for the same spend.`},
    {q:`How much does ${th} TH earn per month?`,a:`At today's Bitcoin price of ${usd(live.bp)} and current difficulty, ${th} TH nets about ${usd(full.miningMonthlyUSD)} per month from mining after fees and the ${CONVERSION_FEE*100}% conversion (with the 20% GMT discount), plus roughly ${usd(full.stakingMonthlyUSD)} from staking the locked GMT at ${STAKING_APR}% APR — about ${usd(full.monthlyUSD)} combined. Without the discount, mining alone is closer to ${usd(none.monthlyUSD)}.`},
    {q:`What will ${th} TH be earning in a few years?`,a:`Nobody can tell you that, and any page quoting a single number is guessing. It depends on the Bitcoin price, how fast network difficulty grows, whether you keep the fee discount funded, and the ${new Date(HALVING_DATES[0]).getUTCFullYear()} halving cutting the block subsidy in half. What this page gives you is today's figures, computed from live data. If you want a projection, run one in the calculator where you set the assumptions yourself and can see exactly what they are.`}
  ];
  const related=[
    {href:'/gomining-roi-calculator',label:'How ROI is calculated'},
    {href:'/gomining-discount-explained',label:'The GMT discount explained'},
    {href:'/gomining-promo-code',label:'GoMining promo code (RINGO5)'},
    {href:'/',label:'the calculator'}
  ];
  return {slug,html:shell({slug,title,desc,faq,body,related})};
}

function pricePage(price, live, dateStr){
  const th=100; // reference farm
  const m=model({th,bp:price,diff:live.diff,disc:20});
  const pk=Math.round(price/1000);
  const slug=`gomining-profit-btc-${pk}k.html`;
  const title=`Is GoMining Profitable if Bitcoin Hits $${pk}k? (${dateStr.year})`;
  const desc=`Modeling GoMining returns at a $${pk},000 Bitcoin price: a 100 TH farm (plus the GMT locked for the discount) nets about ${usd(m.monthlyUSD)}/month on ${usd(m.totalCapital)} of capital. Live difficulty.`;
  const body=`  <h1>GoMining Profitability at $${pk}k Bitcoin</h1>
  <p class="lead">What a GoMining farm would earn if Bitcoin traded at $${pk},000 — counting the GMT locked for the discount and its staking, on a reference 100 TH setup at live difficulty.</p>
  <p class="updated">Scenario price $${pk},000 &middot; live difficulty ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">BTC price</div><div class="v">$${pk}k</div><div class="s">scenario</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(m.monthlyUSD)}</div><div class="s">${usd(m.miningMonthlyUSD)} mining + ${usd(m.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(m.totalCapital)}</div><div class="s">${usd(m.hashCost)} hashrate + ${usd(m.gmtLockUSD)} GMT</div></div>
    <div class="stat"><div class="k">Per day</div><div class="v">${usd2(m.netUSD)}</div><div class="s">${(m.yearlyUSD/m.totalCapital*100).toFixed(1)}% a year on capital</div></div>
  </div>
  <p>Mining rewards are paid in Bitcoin, so a higher price lifts the dollar value of every sat while the electricity and service fees (quoted in dollars) stay fixed. At $${pk},000, the 100 TH hashrate nets about ${usd(m.miningMonthlyUSD)}/month, and the ${usd(m.gmtLockUSD)} of GMT you lock for the 20% discount adds roughly ${usd(m.stakingMonthlyUSD)}/month in staking — about ${usd(m.monthlyUSD)} combined on ${usd(m.totalCapital)} of committed capital, ${verdict(m)}.</p>
  <p>The reason a higher Bitcoin price helps so much: your fee is a dollar amount, so as price rises it shrinks as a share of your reward. That's the leverage — and the risk works in reverse if price falls. The locked GMT, meanwhile, is retained capital that keeps paying staking regardless of BTC.</p>
${CTA}`;
  const faq=[
    {q:`Is GoMining profitable at $${pk}k Bitcoin?`,a:`At a $${pk},000 price and current difficulty, a 100 TH GoMining farm nets about ${usd(m.miningMonthlyUSD)}/month from mining plus ${usd(m.stakingMonthlyUSD)} from staking the GMT locked for the 20% discount — around ${usd(m.monthlyUSD)} combined on ${usd(m.totalCapital)} of capital. Earnings scale with your hashrate.`},
    {q:`Why does the Bitcoin price matter so much for GoMining?`,a:`Rewards are paid in Bitcoin but fees are charged in dollars, so a higher BTC price raises your revenue while your cost stays fixed — every dollar of price increase lands in your margin. A falling price does the opposite.`},
    {q:`Does difficulty change these numbers?`,a:`Yes, and this page holds it at today's level rather than guessing where it goes. Rising difficulty steadily reduces the sats each TH earns, so a figure computed at today's difficulty is a snapshot, not a forecast. The calculator lets you project difficulty growth forward and see how much it costs you.`}
  ];
  const related=[
    {href:'/is-gomining-worth-it',label:'Is GoMining worth it?'},
    {href:'/gomining-roi-calculator',label:'How ROI is calculated'},
    {href:'/gomining-promo-code',label:'GoMining promo code (RINGO5)'},
    {href:'/',label:'the calculator'}
  ];
  return {slug,html:shell({slug,title,desc,faq,body,related})};
}

function monthlyPage(live, dateStr){
  const th=100;
  const m=model({th,bp:live.bp,diff:live.diff,disc:20});
  const slug='gomining-worth-it-now.html';   // stable URL, regenerated in place (fresh, no pile-up)
  // This page and /is-gomining-worth-it chase the same query, and the latter pulls ~6x
  // the impressions. Point the canonical there so the two stop splitting the signal —
  // the page still exists and stays current, it just ranks under its stronger twin.
  const canonicalUrl=`${SITE}/is-gomining-worth-it`;
  const title=`Is GoMining Worth It in ${MONTHS[dateStr.m]} ${dateStr.year}?`;
  const desc=`A ${MONTHS[dateStr.m]} ${dateStr.year} snapshot: with Bitcoin at ${usd(live.bp)}, a 100 TH GoMining farm plus the GMT locked for the discount nets ~${usd(m.monthlyUSD)}/mo on ${usd(m.totalCapital)} of capital. Live numbers.`;
  const body=`  <h1>Is GoMining Worth It in ${MONTHS[dateStr.m]} ${dateStr.year}?</h1>
  <p class="lead">A current-conditions snapshot, computed from live Bitcoin price and network difficulty as of ${dateStr.full} — counting the GMT you lock for the discount and its staking.</p>
  <p class="updated">Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">BTC price now</div><div class="v">${usd(live.bp)}</div><div class="s">live</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(m.monthlyUSD)}</div><div class="s">${usd(m.miningMonthlyUSD)} mining + ${usd(m.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">Per day</div><div class="v">${usd2(m.netUSD)}</div><div class="s">${(m.yearlyUSD/m.totalCapital*100).toFixed(1)}% a year on capital</div></div>
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(m.totalCapital)}</div><div class="s">${usd(m.hashCost)} hashrate + ${usd(m.gmtLockUSD)} GMT</div></div>
  </div>
  <p>As of ${dateStr.full}, Bitcoin trades near ${usd(live.bp)} and the network mines about ${Math.round(satsPerTHDay(live.diff))} sats per TH per day. On those numbers a 100 TH GoMining farm nets roughly <strong>${usd(m.miningMonthlyUSD)}/month</strong> from mining, and the ${usd(m.gmtLockUSD)} of GMT locked for the 20% discount adds about ${usd(m.stakingMonthlyUSD)}/month in staking — around <strong>${usd(m.monthlyUSD)} combined</strong> on ${usd(m.totalCapital)} of committed capital. In short, ${verdict(m)}.</p>
  <h2>What would change this</h2>
  <p>These figures move constantly. A rising Bitcoin price improves margin (fees are fixed in dollars); rising difficulty erodes sats per TH; and letting your GMT coverage lapse can wipe out the discount and gut your net. That's why it pays to check current numbers rather than trust a static estimate — run yours below.</p>
${CTA}`;
  const faq=[
    {q:`Is GoMining worth it right now?`,a:`As of ${dateStr.full}, with Bitcoin near ${usd(live.bp)}, a 100 TH farm nets about ${usd(m.miningMonthlyUSD)}/month from mining plus ${usd(m.stakingMonthlyUSD)} from staking the GMT locked for the discount — around ${usd(m.monthlyUSD)} combined on ${usd(m.totalCapital)} of committed capital, or ${(m.yearlyUSD/m.totalCapital*100).toFixed(1)}% a year. Whether that's "worth it" depends on your view of Bitcoin's price from here, which is why this page stops at today's numbers.`},
    {q:`How much can you make with GoMining in ${dateStr.year}?`,a:`Earnings scale with hashrate. At current conditions each 100 TH nets roughly ${usd(m.miningMonthlyUSD)}/month mining plus ${usd(m.stakingMonthlyUSD)} staking the GMT you lock for the discount. More hashrate earns proportionally more; the discount, staking rate and Bitcoin's price are the main swing factors.`},
    {q:`Is GoMining a scam?`,a:`GoMining is a real service that has paid users for years, though many negative reviews trace to maintenance fees spiking when a user's GMT coverage lapses and the discount is lost — a configuration issue, not a scam. Understanding the fee and discount mechanics is what separates a good outcome from a bad one.`}
  ];
  const related=[
    {href:'/is-gomining-worth-it',label:'Is GoMining worth it? (full guide)'},
    {href:'/gomining-discount-explained',label:'The GMT discount explained'},
    {href:'/gomining-promo-code',label:'GoMining promo code (RINGO5)'},
    {href:'/',label:'the calculator'}
  ];
  return {slug,canonicalUrl,html:shell({slug,title,desc,faq,body,related,canonicalUrl})};
}

/* ===== sitemap ===== */
function updateSitemap(pages){
  const smPath=path.join(ROOT,'sitemap.xml');
  let sm=fs.readFileSync(smPath,'utf8');
  const today=new Date().toISOString().slice(0,10);
  for(const {slug,canonicalUrl} of pages){
    const loc=`${SITE}/${slug.replace(/\.html$/,'')}`;   // extensionless, matching the canonical
    // A page canonicalised elsewhere doesn't belong in the sitemap — listing a URL we've
    // told Google not to index is a mixed signal, so drop any entry it already has.
    if(canonicalUrl&&canonicalUrl!==loc){
      sm=sm.replace(new RegExp(`^\\s*<url>(?:(?!</url>)[\\s\\S])*?<loc>${loc}</loc>[\\s\\S]*?</url>\\n`,'m'),'');
      continue;
    }
    if(sm.includes(loc))continue;   // don't duplicate
    const entry=`  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    sm=sm.replace('</urlset>',entry+'</urlset>');
  }
  // refresh lastmod is left to the user's normal flow; just ensure entries exist
  fs.writeFileSync(smPath,sm);
}

/* ===== live-number injection into hand-written pages =====
   Some pages are hand-maintained prose but still need real, current figures —
   client-side JS numbers do not help ranking, since Google is weighing the HTML.
   These pages carry <!-- LIVE:name --> … <!-- /LIVE:name --> markers and this
   refills them on every run. Everything outside the markers is left alone. */
function injectLiveBlock(file,name,html){
  const p=path.join(ROOT,file);
  if(!fs.existsSync(p))return false;
  const src=fs.readFileSync(p,'utf8');
  const re=new RegExp(`(<!-- LIVE:${name}[^>]*-->)[\\s\\S]*?(<!-- /LIVE:${name} -->)`);
  if(!re.test(src)){console.log(`  ! ${file}: no LIVE:${name} markers`);return false;}
  // Replacement FUNCTION, not a string: the injected HTML contains dollar amounts
  // like "$1,341", and string replacement would treat "$1" as a backreference.
  fs.writeFileSync(p,src.replace(re,(_m,open,close)=>`${open}\n${html}\n  ${close}`));
  console.log('  injected',name,'->',file);
  return true;
}

function injectLiveBlocks(live,dateStr){
  // "Is GoMining worth it" — the query wants a verdict backed by evidence, so give
  // it the real numbers at both the optimised and the do-nothing end of the range.
  const good=model({th:50,bp:live.bp,diff:live.diff,disc:20});
  const bad =model({th:50,bp:live.bp,diff:live.diff,disc:0});
  const yGood=good.yearlyUSD/good.totalCapital*100, yBad=bad.yearlyUSD/bad.totalCapital*100;
  const html=
`  <div class="formula">Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; updated ${dateStr.full}</div>
  <p>Take a 50 TH setup at the best available efficiency (${EFF_BEST} W/TH). Buying the hashrate costs about
  <strong>${usd(good.hashCost)}</strong>, and holding the maximum 20% fee discount means locking roughly
  <strong>${usd(good.gmtLockUSD)}</strong> of GMT — <strong>${usd(good.totalCapital)}</strong> of capital in total.
  That pays about <strong>${usd(good.monthlyUSD)}/month</strong>, or <strong>${yGood.toFixed(1)}% a year</strong>
  on the capital committed.</p>
  <p>Run the same 50 TH <em>without</em> the GMT discount and the fee takes most of the margin: the same
  hashrate nets around <strong>${usd(bad.monthlyUSD)}/month</strong> on ${usd(bad.totalCapital)} of capital,
  <strong>${yBad.toFixed(1)}% a year</strong>. That gap is the whole answer to "is it worth it": the hardware
  is not what decides it, the discount is. Both figures are today's, on live price and difficulty — what they
  become depends on Bitcoin, difficulty growth and the ${dateStr.year < 2028 ? '2028 halving' : 'next halving'},
  which is your call to model, not ours to assert.</p>`;
  injectLiveBlock('is-gomining-worth-it.html','worth-it-verdict',html);
}

/* ===== main ===== */
(async()=>{
  const live=await getLive();
  const now=new Date();
  const dateStr={full:now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}),
                 year:now.getUTCFullYear(), m:now.getUTCMonth()};
  console.log(`Live: BTC ${usd(live.bp)}, difficulty ${(live.diff/1e12).toFixed(1)}e12, sats/TH/day ${Math.round(satsPerTHDay(live.diff))} (${live.live?'live':'FALLBACK'})`);

  const pages=[];
  [1,5,10,25,50,100,250,500].forEach(th=>pages.push(hashratePage(th,live,dateStr)));
  [75000,100000,150000,200000,250000].forEach(p=>pages.push(pricePage(p,live,dateStr)));
  pages.push(monthlyPage(live,dateStr));

  for(const p of pages){
    fs.writeFileSync(path.join(ROOT,p.slug),p.html);
    console.log('  wrote',p.slug);
  }
  updateSitemap(pages);
  injectLiveBlocks(live,dateStr);
  console.log(`\nDone: ${pages.length} pages + sitemap updated.`);
})();
