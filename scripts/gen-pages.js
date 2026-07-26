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
  HALVING_DATES, DIFF_G0, DIFF_FLOOR, DIFF_TAU, TH_TIERS_12W, BTC_ANCHORS, FB,
  priceAt, cptTier, feePerTHDay, satsPerTHDay, dailyBTCperTH, feesBTC,
  subsidyMultAt, difficultyMultAt, rewardFloorBTC
} = require('./constants.js');

// Full per-scenario economics + break-even projection (BTC & GMT prices held flat —
// stated assumption). Total-capital model: the GMT you must LOCK to hold the discount is
// counted as invested capital, and the staking APR that GMT earns is counted as income.
function model({th, bp, diff, disc, wth=EFF_BEST}){
  const now=Date.now();
  const dbt=dailyBTCperTH(diff);
  const gross=dbt*th;
  const fee=feesBTC(th,wth,bp);                 // BTC/day, undiscounted
  const dfees=fee*(1-disc/100);
  const netBTC=(gross-dfees)*(1-CONVERSION_FEE);
  const miningUSD=netBTC*bp;                    // mining net, $/day
  const hashCost=th*cptTier(th);                // USD for this hashrate at 12 W/TH new-miner pricing
  // GMT you must lock to hold this discount. Coverage = 18 days of fee per 1%, so disc%
  // needs 18·disc days of the (undiscounted) fee. GMT price cancels: lock$ = days · dailyFee$.
  const gmtLockUSD = disc>0 ? COV_DAYS_PER_PCT*disc*fee*bp : 0;
  const stakingUSD = gmtLockUSD*(STAKING_APR/100)/365.25;   // $/day, flat GMT price
  const totalCapital = hashCost+gmtLockUSD;
  const netUSD = miningUSD+stakingUSD;          // combined daily income
  const feeUSD = fee*bp;                        // USD maintenance fee (price-independent)
  const dfeesUSD = feeUSD*(1-disc/100);
  // Two break-evens on TOTAL capital: (1) flat price — conservative headline; (2) analyst
  // forecast price path — the halving-cycle upside case, clearly labeled on the page.
  function breakEven(pricePath){
    let cum=0;
    for(let m=1;m<=120;m++){
      const t=now+m*30.44*86400000;
      const price_t=pricePath?priceAt(t,now,bp):bp;
      const dbt_t=Math.max(dbt*subsidyMultAt(t)*difficultyMultAt(t,now), rewardFloorBTC(price_t));
      const mining_t=Math.max(0,(dbt_t*th*price_t-dfeesUSD))*(1-CONVERSION_FEE);  // $/day, eroding reward
      cum += (mining_t+stakingUSD)*30.44;       // staking stays flat (GMT price held flat)
      if(cum>=totalCapital)return m;
    }
    return null;
  }
  const beMonths=breakEven(false), beMonthsFcast=breakEven(true);

  // Weekly reinvest projection — same signal as the site's allocator: HOLD the 20% discount
  // (top up GMT coverage as the farm grows) and put the rest into 12 W hashrate. Each
  // added TH costs cptTier(12W) to buy PLUS L$ of GMT to keep 360-day coverage, so the all-in
  // cost per incremental TH bundles both. Staking on the growing lock compounds too.
  function reinvest(years, pricePath){
    if(disc<=0)return null;
    const L = COV_DAYS_PER_PCT*disc*feePerTHDay(wth);   // GMT lock $ required per TH to hold discount
    let cTH=th, lock=L*th;
    const weeks=Math.round(years*52.1786);
    for(let w=1;w<=weeks;w++){
      const t=now+w*7*86400000;
      const price_t=pricePath?priceAt(t,now,bp):bp;
      const dbt_t=Math.max(dbt*subsidyMultAt(t)*difficultyMultAt(t,now), rewardFloorBTC(price_t));
      const feeDay=feePerTHDay(wth)*cTH;                // undiscounted $/day
      const miningWk=Math.max(0,(dbt_t*cTH*price_t-feeDay*(1-disc/100)))*(1-CONVERSION_FEE)*7;
      const stakingWk=lock*(STAKING_APR/100)/52.1786;
      const income=miningWk+stakingWk;
      const dTH=income/(cptTier(cTH)+L);                // buy TH + keep coverage, in one step
      cTH+=dTH; lock=L*cTH;                             // recompute lock for the larger farm
    }
    const tE=now+years*365.25*86400000, pE=pricePath?priceAt(tE,now,bp):bp;
    const dbtE=Math.max(dbt*subsidyMultAt(tE)*difficultyMultAt(tE,now), rewardFloorBTC(pE));
    const miningMo=Math.max(0,(dbtE*cTH*pE-feePerTHDay(wth)*cTH*(1-disc/100)))*(1-CONVERSION_FEE)*30.44;
    const stakingMo=lock*(STAKING_APR/100)/12;
    return {years, endTH:cTH, endLockUSD:lock, endMonthlyUSD:miningMo+stakingMo};
  }
  const reinvest3=reinvest(3,false), reinvest3f=reinvest(3,true);

  return {dbt,gross,fee,dfees,netBTC,netUSD,miningUSD,stakingUSD,feeUSD,wth,
          hashCost,gmtLockUSD,totalCapital,cost:totalCapital,beMonths,beMonthsFcast,
          reinvest3,reinvest3f,
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
const be=m=>m===null?'beyond 10 years':m<12?`about ${m} month${m===1?'':'s'}`:`about ${(m/12).toFixed(1)} years`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ===== shared page shell ===== */
function shell({slug,title,desc,faq,body,related}){
  // slug is the FILENAME (foo.html); the canonical URL is extensionless. GitHub Pages
  // serves /foo for foo.html, so both resolve — the canonical picks which one Google keeps.
  const canonical=`${SITE}/${slug.replace(/\.html$/,'')}`;
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
<meta property="og:image" content="${SITE}/og-image.png?v=2">
<script type="application/ld+json">
${JSON.stringify(faqLd,null,2)}
</script>
<link rel="icon" type="image/svg+xml" href="/gmt-optimizer-logo.svg?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/content.css?v=4">
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
    <p>Plug in your hashrate and get live P&amp;L plus a multi-year projection with your break-even.</p>
    <p style="margin-top:.6rem">New to GoMining? Use code <span class="code">RINGO5</span> for +5% bonus TH — and I'll fund your first TH to get your account started.</p>
    <a href="/console" class="btn">Open the calculator →</a>
  </div>`;

// Clearly-labeled halving-cycle upside callout: the same break-even under an analyst price path.
function scenarioBox(m){
  const flat = m.beMonths===null?'does not pay back within 10 years':`about ${m.beMonths<12?m.beMonths+' months':(m.beMonths/12).toFixed(1)+' years'}`;
  const fcast = m.beMonthsFcast===null?'still would not pay back within 10 years':`around ${m.beMonthsFcast<12?m.beMonthsFcast+' months':(m.beMonthsFcast/12).toFixed(1)+' years'}`;
  return `  <div class="scenario">
    <strong>The flat-price break-even is the pessimistic case.</strong> Bitcoin has never held one price across a halving cycle. Holding it flat, this setup breaks even in ${flat}. If Bitcoin instead follows published analyst forecasts, break-even shortens to <span class="big">${fcast}</span>
    <span class="src">Forecast path: ${BTC_ANCHORS.map(a=>a.src).join(', ')}, interpolated from today's price, with mining rewards still eroded by halvings and rising difficulty. A scenario, not a promise — Bitcoin could also fall.</span>
  </div>`;
}

// Weekly-reinvest growth callout — kept separate from break-even so payback stays honest.
const th0=n=>n>=100?Math.round(n):n.toFixed(1);
function reinvestBox(m){
  if(!m.reinvest3)return '';
  const r=m.reinvest3, rf=m.reinvest3f;
  return `  <div class="scenario">
    <strong>Or reinvest instead of cashing out.</strong> Break-even assumes you pocket the rewards. Feed them back in weekly — buying 12 W hashrate and topping up GMT to hold the 20% discount, the way the optimizer allocates capital — and the farm compounds. On the analyst-forecast price path it grows to <span class="big">~${th0(rf.endTH)} TH earning ~${usd(rf.endMonthlyUSD)}/mo in ${rf.years} years</span>
    <span class="src">Floor case: at a flat Bitcoin price it holds ~${th0(r.endTH)} TH earning ~${usd(r.endMonthlyUSD)}/month — rising difficulty caps per-TH income, so growth mostly offsets decay. Compounding at ${STAKING_APR}% GMT staking plus reinvested mining. A growth path, not a promise.</span>
  </div>`;
}

/* ===== page builders ===== */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

// outcome-dependent verdict so prose genuinely differs per scenario
function verdict(beMonths){
  if(beMonths===null)return "at a flat Bitcoin price this configuration does not pay back within six years — it needs BTC appreciation or a lower entry to make sense";
  if(beMonths<=14)return "that is a comparatively fast payback for cloud mining, though it assumes you hold the maximum fee discount and Bitcoin holds its price";
  if(beMonths<=28)return "that is a middling payback — reasonable if you expect Bitcoin to appreciate, slow if you don't";
  return "that is a long payback at a flat price, so the case rests largely on Bitcoin appreciating from here";
}

function hashratePage(th, live, dateStr){
  const full=model({th,bp:live.bp,diff:live.diff,disc:20});
  const none=model({th,bp:live.bp,diff:live.diff,disc:0});
  const slug=`gomining-${th}-th-roi.html`;
  const title=`GoMining ${th} TH ROI & Break-Even (${dateStr.year})`;
  const desc=`What ${th} TH on GoMining truly costs (hashrate + the GMT you lock for the discount) and earns (mining + staking) at today's price: ${usd(full.monthlyUSD)}/mo, break-even ${be(full.beMonths)}.`;
  const body=`  <h1>GoMining ${th} TH: ROI &amp; Break-Even</h1>
  <p class="lead">Exactly what a ${th} TH GoMining setup costs, earns, and takes to pay back — counting the GMT you must lock for the discount and the staking it earns, not just the hashrate.</p>
  <p class="updated">Live figures &middot; Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(full.totalCapital)}</div><div class="s">${usd(full.hashCost)} hashrate + ${usd(full.gmtLockUSD)} GMT lock</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(full.monthlyUSD)}</div><div class="s">${usd(full.miningMonthlyUSD)} mining + ${usd(full.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">GMT to lock</div><div class="v">${usd(full.gmtLockUSD)}</div><div class="s">for the 20% discount</div></div>
    <div class="stat"><div class="k">Break-even</div><div class="v">${be(full.beMonths)}</div><div class="s">on total capital</div></div>
  </div>
  <p>Two things get bought here, and most calculators only count the first. You mint ${th} TH for about <strong>${usd(full.hashCost)}</strong>, and to hold the maximum 20% fee discount you must lock roughly <strong>${usd(full.gmtLockUSD)} of GMT</strong> (360 days of fee coverage) — <strong>${usd(full.totalCapital)}</strong> of capital committed in total. On the income side, the hashrate nets about ${usd(full.miningMonthlyUSD)}/month after fees and the ${CONVERSION_FEE*100}% conversion, and the locked GMT earns roughly ${usd(full.stakingMonthlyUSD)}/month staking at ${STAKING_APR}% APR — about ${usd(full.monthlyUSD)} combined. On total capital, ${verdict(full.beMonths)}.</p>
${scenarioBox(full)}
${reinvestBox(full)}
  <h2>Why the locked GMT is not a normal cost</h2>
  <p>Unlike the hashrate, the ${usd(full.gmtLockUSD)} in GMT isn't spent — you still own the tokens and can unlock them later, so it's capital tied up rather than money gone (with GMT price risk while it's locked). It also pulls double duty: it cuts your fee by 20% <em>and</em> earns ${STAKING_APR}% staking. Without any discount, ${th} TH nets only about <strong>${usd(none.monthlyUSD)}/month</strong> and ties up no GMT — but you leave the fee saving and the staking on the table. That trade is the main lever you control.</p>
  <div class="formula">daily net = mining net + GMT staking = (sats/TH/day × ${th} TH × BTC − fee × (1 − discount)) × 0.98 + locked GMT × APR ÷ 365\ntotal capital = hashrate + GMT locked for the discount</div>
  <h2>What the projection assumes</h2>
  <p>Break-even holds Bitcoin and GMT flat (BTC at ${usd(live.bp)}), erodes mining rewards over time through halvings and rising network difficulty, and keeps staking income steady. If Bitcoin appreciates, payback comes sooner; if difficulty spikes, GMT falls, or the staking rate drops, later. Run your exact setup in the calculator for a projection you can adjust.</p>
${CTA}`;
  const faq=[
    {q:`How much capital do you really need for ${th} TH on GoMining?`,a:`About ${usd(full.totalCapital)} in total: roughly ${usd(full.hashCost)} for ${th} TH at the 12 W/TH new-miner price (~${usd2(cptTier(th))}/TH), plus about ${usd(full.gmtLockUSD)} of GMT locked to hold the maximum 20% fee discount. The GMT is retained, not spent. With promo code RINGO5 you get 5% extra hashrate for the same spend.`},
    {q:`How much does ${th} TH earn per month?`,a:`At today's Bitcoin price of ${usd(live.bp)} and current difficulty, ${th} TH nets about ${usd(full.miningMonthlyUSD)} per month from mining after fees and the ${CONVERSION_FEE*100}% conversion (with the 20% GMT discount), plus roughly ${usd(full.stakingMonthlyUSD)} from staking the locked GMT at ${STAKING_APR}% APR — about ${usd(full.monthlyUSD)} combined. Without the discount, mining alone is closer to ${usd(none.monthlyUSD)}.`},
    {q:`What is the break-even for ${th} TH?`,a:`Counting both the hashrate and the GMT locked for the discount as capital (about ${usd(full.totalCapital)}), and both mining and staking as income, break-even is ${be(full.beMonths)} at a flat Bitcoin and GMT price. Bitcoin appreciation shortens it; a falling price or faster difficulty growth extends it.`}
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
  const desc=`Modeling GoMining returns at a $${pk},000 Bitcoin price: a 100 TH farm (plus the GMT locked for the discount) nets about ${usd(m.monthlyUSD)}/month, break-even in ${be(m.beMonths)}. Live difficulty.`;
  const body=`  <h1>GoMining Profitability at $${pk}k Bitcoin</h1>
  <p class="lead">What a GoMining farm would earn if Bitcoin traded at $${pk},000 — counting the GMT locked for the discount and its staking, on a reference 100 TH setup at live difficulty.</p>
  <p class="updated">Scenario price $${pk},000 &middot; live difficulty ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">BTC price</div><div class="v">$${pk}k</div><div class="s">scenario</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(m.monthlyUSD)}</div><div class="s">${usd(m.miningMonthlyUSD)} mining + ${usd(m.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(m.totalCapital)}</div><div class="s">${usd(m.hashCost)} hashrate + ${usd(m.gmtLockUSD)} GMT</div></div>
    <div class="stat"><div class="k">Break-even</div><div class="v">${be(m.beMonths)}</div><div class="s">on total capital</div></div>
  </div>
  <p>Mining rewards are paid in Bitcoin, so a higher price lifts the dollar value of every sat while the electricity and service fees (quoted in dollars) stay fixed. At $${pk},000, the 100 TH hashrate nets about ${usd(m.miningMonthlyUSD)}/month, and the ${usd(m.gmtLockUSD)} of GMT you lock for the 20% discount adds roughly ${usd(m.stakingMonthlyUSD)}/month in staking — about ${usd(m.monthlyUSD)} combined on ${usd(m.totalCapital)} of committed capital. Based on that, ${verdict(m.beMonths)}.</p>
${scenarioBox(m)}
${reinvestBox(m)}
  <p>The reason a higher Bitcoin price helps so much: your fee is a dollar amount, so as price rises it shrinks as a share of your reward. That's the leverage — and the risk works in reverse if price falls. The locked GMT, meanwhile, is retained capital that keeps paying staking regardless of BTC.</p>
${CTA}`;
  const faq=[
    {q:`Is GoMining profitable at $${pk}k Bitcoin?`,a:`At a $${pk},000 price and current difficulty, a 100 TH GoMining farm nets about ${usd(m.miningMonthlyUSD)}/month from mining plus ${usd(m.stakingMonthlyUSD)} from staking the GMT locked for the 20% discount — around ${usd(m.monthlyUSD)} combined — paying back the full ${usd(m.totalCapital)} of capital in ${be(m.beMonths)}. Profitability scales with your hashrate.`},
    {q:`Why does the Bitcoin price matter so much for GoMining?`,a:`Rewards are paid in Bitcoin but fees are charged in dollars, so a higher BTC price raises your revenue while your cost stays fixed — improving margin and shortening break-even. A falling price does the opposite.`},
    {q:`Does difficulty change these numbers?`,a:`Yes. These figures use live network difficulty and then erode rewards over time as difficulty grinds up and block subsidies halve. Rising difficulty steadily reduces sats earned per TH, which the projection accounts for.`}
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
  const title=`Is GoMining Worth It in ${MONTHS[dateStr.m]} ${dateStr.year}?`;
  const desc=`A ${MONTHS[dateStr.m]} ${dateStr.year} snapshot: with Bitcoin at ${usd(live.bp)}, a 100 TH GoMining farm plus the GMT locked for the discount nets ~${usd(m.monthlyUSD)}/mo, break-even ${be(m.beMonths)}. Live numbers.`;
  const body=`  <h1>Is GoMining Worth It in ${MONTHS[dateStr.m]} ${dateStr.year}?</h1>
  <p class="lead">A current-conditions snapshot, computed from live Bitcoin price and network difficulty as of ${dateStr.full} — counting the GMT you lock for the discount and its staking.</p>
  <p class="updated">Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; ${STAKING_APR}% GMT staking APR &middot; updated ${dateStr.full}</p>
  <div class="stats">
    <div class="stat"><div class="k">BTC price now</div><div class="v">${usd(live.bp)}</div><div class="s">live</div></div>
    <div class="stat"><div class="k">Net / month</div><div class="v">${usd(m.monthlyUSD)}</div><div class="s">${usd(m.miningMonthlyUSD)} mining + ${usd(m.stakingMonthlyUSD)} staking</div></div>
    <div class="stat"><div class="k">Break-even</div><div class="v">${be(m.beMonths)}</div><div class="s">on total capital</div></div>
    <div class="stat"><div class="k">Total capital</div><div class="v">${usd(m.totalCapital)}</div><div class="s">${usd(m.hashCost)} hashrate + ${usd(m.gmtLockUSD)} GMT</div></div>
  </div>
  <p>As of ${dateStr.full}, Bitcoin trades near ${usd(live.bp)} and the network mines about ${Math.round(satsPerTHDay(live.diff))} sats per TH per day. On those numbers a 100 TH GoMining farm nets roughly <strong>${usd(m.miningMonthlyUSD)}/month</strong> from mining, and the ${usd(m.gmtLockUSD)} of GMT locked for the 20% discount adds about ${usd(m.stakingMonthlyUSD)}/month in staking — around ${usd(m.monthlyUSD)} combined, for a break-even of ${be(m.beMonths)} on ${usd(m.totalCapital)} of committed capital. In short, ${verdict(m.beMonths)}.</p>
${scenarioBox(m)}
${reinvestBox(m)}
  <h2>What would change this</h2>
  <p>These figures move constantly. A rising Bitcoin price improves margin (fees are fixed in dollars); rising difficulty erodes sats per TH; and letting your GMT coverage lapse can wipe out the discount and gut your net. That's why it pays to check current numbers rather than trust a static estimate — run yours below.</p>
${CTA}`;
  const faq=[
    {q:`Is GoMining worth it right now?`,a:`As of ${dateStr.full}, with Bitcoin near ${usd(live.bp)}, a 100 TH farm nets about ${usd(m.miningMonthlyUSD)}/month from mining plus ${usd(m.stakingMonthlyUSD)} from staking the GMT locked for the discount (~${usd(m.monthlyUSD)} combined), paying back the ${usd(m.totalCapital)} of committed capital in ${be(m.beMonths)}. Whether that's "worth it" depends on your view of Bitcoin's price from here.`},
    {q:`How much can you make with GoMining in ${dateStr.year}?`,a:`Earnings scale with hashrate. At current conditions each 100 TH nets roughly ${usd(m.miningMonthlyUSD)}/month mining plus ${usd(m.stakingMonthlyUSD)} staking the GMT you lock for the discount. More hashrate earns proportionally more; the discount, staking rate and Bitcoin's price are the main swing factors.`},
    {q:`Is GoMining a scam?`,a:`GoMining is a real service that has paid users for years, though many negative reviews trace to maintenance fees spiking when a user's GMT coverage lapses and the discount is lost — a configuration issue, not a scam. Understanding the fee and discount mechanics is what separates a good outcome from a bad one.`}
  ];
  const related=[
    {href:'/is-gomining-worth-it',label:'Is GoMining worth it? (full guide)'},
    {href:'/gomining-discount-explained',label:'The GMT discount explained'},
    {href:'/gomining-promo-code',label:'GoMining promo code (RINGO5)'},
    {href:'/',label:'the calculator'}
  ];
  return {slug,html:shell({slug,title,desc,faq,body,related})};
}

/* ===== sitemap ===== */
function updateSitemap(slugs){
  const smPath=path.join(ROOT,'sitemap.xml');
  let sm=fs.readFileSync(smPath,'utf8');
  const today=new Date().toISOString().slice(0,10);
  for(const slug of slugs){
    const loc=`${SITE}/${slug.replace(/\.html$/,'')}`;   // extensionless, matching the canonical
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
  const verdict = good.beMonths
    ? `pays for itself in about <strong>${(good.beMonths/12).toFixed(1)} years</strong>`
    : `does not pay back inside ten years`;
  const badVerdict = bad.beMonths
    ? `takes about <strong>${(bad.beMonths/12).toFixed(1)} years</strong>`
    : `<strong>never pays back at all</strong>`;
  const html=
`  <div class="formula">Bitcoin ${usd(live.bp)} &middot; ${Math.round(satsPerTHDay(live.diff))} sats/TH/day &middot; updated ${dateStr.full}</div>
  <p>Take a 50 TH setup at the best available efficiency (${EFF_BEST} W/TH). Buying the hashrate costs about
  <strong>${usd(good.hashCost)}</strong>, and holding the maximum 20% fee discount means locking roughly
  <strong>${usd(good.gmtLockUSD)}</strong> of GMT — <strong>${usd(good.totalCapital)}</strong> of capital in total.
  That earns about <strong>${usd(good.monthlyUSD)}/month</strong> combined, and on total capital it ${verdict}.</p>
  <p>Run the same 50 TH <em>without</em> the GMT discount and it ${badVerdict} — the fee eats the margin as
  difficulty climbs. That gap is the whole answer to "is it worth it": the hardware is not what decides it,
  the discount is. Both figures already price in the ${dateStr.year < 2028 ? '2028 halving' : 'next halving'}
  and the difficulty grind, which is why they look longer than the flat estimates most calculators show.</p>`;
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
  updateSitemap(pages.map(p=>p.slug));
  injectLiveBlocks(live,dateStr);
  console.log(`\nDone: ${pages.length} pages + sitemap updated.`);
})();
