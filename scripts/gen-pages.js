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
  cptTier, cptAtEff, feePerTHDay, satsPerTHDay, dailyBTCperTH, feesBTC, CFG
} = require('./constants.js');
const TOKEN_CAP = CFG.discount.tokenCapPct;   // max token (GMT coverage) discount, % — data/config.json
// 'Fees and rates as of …' (data/config.json meta.updated), filled by scripts/build-config.js on every build
const ASOF_DATE = require('../assets/pricing.js').UPDATED;

// Per-scenario economics at TODAY's price and difficulty — no forward projection.
// Total-capital model: the GMT you must LOCK to hold the discount is
// counted as invested capital, and the staking APR that GMT earns is counted as income.
function model({th, bp, diff, disc, wth=EFF_BASE_MAX}){   // default: a new miner, 15 W only since 2026-10-30
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
          monthlyUSD:netUSD*(365.25 / 12), yearlyUSD:netUSD*365.25,
          miningMonthlyUSD:miningUSD*(365.25 / 12), stakingMonthlyUSD:stakingUSD*(365.25 / 12)};
}

/* ===== live data ===== */
async function getLive(){
  // Test hook: GEN_PAGES_FIXED="btcPrice,difficulty" makes a run reproducible (no network).
  if(process.env.GEN_PAGES_FIXED){const [bp,diff]=process.env.GEN_PAGES_FIXED.split(',').map(Number);return {bp,diff,live:false};}
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
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ===== languages (Phase 7c) =====
   Every page is built once per language from scripts/data-pages-text.js. English output is unchanged;
   es/fr/de are written to /es/, /fr/, /de/ at the same file name. */
const TEXT=require('./data-pages-text.js');
const LANGS=['en','es','fr','de'];
const LOCALE={en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE'};
const PAGES_JSON=JSON.parse(fs.readFileSync(path.join(ROOT,'locales/pages.json'),'utf8'));
const urlOfFile=f=>('/'+f.replace(/(^|\/)index\.html$/,'$1').replace(/\.html$/,'')).replace(/(.)\/$/,'$1');
const TRANSLATED=new Set([...PAGES_JSON.pages,...(PAGES_JSON.generated||[])].map(urlOfFile));
const localHref=(lang,href)=>{
  if(lang==='en'||!href.startsWith('/'))return href;
  const p=href.replace(/(.)\/$/,'$1')||'/';
  return TRANSLATED.has(p)?'/'+lang+(p==='/'?'/':p):href;
};
function ctx(lang,live,now){
  const loc=LOCALE[lang], en=lang==='en';
  const nf=(d)=>new Intl.NumberFormat(loc,{minimumFractionDigits:d,maximumFractionDigits:d});
  const money=(n,d)=>en?'$'+(d?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):Math.round(n).toLocaleString('en-US'))
                        :nf(d).format(d?n:Math.round(n))+' $';
  return {
    lang, home:en?'/':'/'+lang+'/', consoleHref:localHref(lang,'/console'),
    u:n=>money(n,0), u2:n=>money(n,2),
    p1:x=>en?x.toFixed(1):nf(1).format(x),
    n:x=>en?Math.round(x).toLocaleString('en-US'):nf(0).format(Math.round(x)),
    apr:en?String(STAKING_APR):String(STAKING_APR).replace('.',','),
    conv:en?String(CONVERSION_FEE*100):String(CONVERSION_FEE*100).replace('.',','),
    cap:TOKEN_CAP, btc:money(live.bp,0), sats:Math.round(satsPerTHDay(live.diff)),
    year:now.getUTCFullYear(),
    month:en?['January','February','March','April','May','June','July','August','September','October','November','December'][now.getUTCMonth()]
            :new Intl.DateTimeFormat(loc,{month:'long',timeZone:'UTC'}).format(now),
    date:now.toLocaleDateString(loc,{year:'numeric',month:'long',day:'numeric',timeZone:en?undefined:'UTC'}),
    halving:new Date(HALVING_DATES[0]).getUTCFullYear(),
    ref:{pct:CFG.referral.bonusThPct,cap:CFG.referral.bonusThCap,months:CFG.referral.vipMonths,card:CFG.referral.cardWindowDays}
  };
}
function alternates(slug){
  const u='/'+slug.replace(/\.html$/,'');
  return '<!-- i18n:alternates (scripts/gen-i18n.js) -->\n'+
    LANGS.map(l=>`<link rel="alternate" hreflang="${l}" href="${SITE}${l==='en'?'':'/'+l}${u}">`).join('\n')+
    `\n<link rel="alternate" hreflang="x-default" href="${SITE}${u}">\n<!-- /i18n:alternates -->`;
}

/* ===== shared page shell ===== */
function shell({c,T,slug,title,desc,faq,body,related,canonicalUrl}){
  // slug is the FILENAME (foo.html); the canonical URL is extensionless. GitHub Pages
  // serves /foo for foo.html, so both resolve — the canonical picks which one Google keeps.
  // canonicalUrl overrides that when this page duplicates a stronger one and should
  // consolidate its signals there instead of competing with it.
  const pre=c.lang==='en'?'':'/'+c.lang;
  const canonical=canonicalUrl?canonicalUrl.replace(SITE,SITE+pre):`${SITE}${pre}/${slug.replace(/\.html$/,'')}`;
  const faqLd={"@context":"https://schema.org","@type":"FAQPage","mainEntity":faq.map(f=>({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))};
  const faqHtml=faq.map(f=>`    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n');
  const relHtml=related.map(r=>`<a href="${localHref(c.lang,r.href)}">${esc(r.label)}</a>`).join(' &middot; ');
  return `<!DOCTYPE html>
<html lang="${c.lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${alternates(slug)}
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og-image.png?v=4">
<script type="application/ld+json">
${JSON.stringify(faqLd,null,2)}
</script>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0B0B0D">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/tokens.css?v=4">
<link rel="stylesheet" href="/assets/components.css?v=6">
<link rel="stylesheet" href="/assets/site-chrome.css?v=9">
<link rel="stylesheet" href="/assets/content.css?v=18">
<link rel="stylesheet" href="/assets/topbar.css?v=7">
<script src="/assets/site-chrome.js?v=11" defer></script>
</head>
<body>
<main class="content-wrap">
${body}
  <p class="cfg-asof">${T.asof(ASOF_DATE)}</p>
  <h2>${T.faqTitle}</h2>
  <div class="faq">
${faqHtml}
  </div>
  <div class="related">${T.readNext} ${relHtml}</div>
</main>
<script src="/assets/site.js?v=42"></script>
</body>
</html>
`;
}

/* ===== page builders ===== */
const stats=rows=>`  <div class="stats">\n`+rows.map(([k,v,s])=>`    <div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('\n')+`\n  </div>`;

function hashratePage(c, th, live){
  const T=TEXT[c.lang], S=T.stat, H=T.hash;
  const full=model({th,bp:live.bp,diff:live.diff,disc:20});
  const none=model({th,bp:live.bp,diff:live.diff,disc:0});
  const cc={...c,th};
  const slug=`gomining-${th}-th-roi.html`;
  const y=full.yearlyUSD/full.totalCapital*100;
  const body=`  <h1>${H.h1(cc)}</h1>
  <p class="lead">${H.lead(cc)}</p>
  <p class="updated">${H.updated(cc)}</p>
${stats([[S.capital,c.u(full.totalCapital),S.hashPlusLock(c,c.u(full.hashCost),c.u(full.gmtLockUSD))],
         [S.net,c.u(full.monthlyUSD),S.miningPlusStaking(c,c.u(full.miningMonthlyUSD),c.u(full.stakingMonthlyUSD))],
         [S.lock,c.u(full.gmtLockUSD),S.forCap(c)],
         [S.perDay,c.u2(full.netUSD),S.yearOnCap(c,y)]])}
  <p>${H.p1(cc,full,T.verdict(c,y))}</p>
  <h2>${H.h2a}</h2>
  <p>${H.p2(cc,full,none)}</p>
  <div class="formula">${H.formula(cc)}</div>
  <h2>${H.h2b}</h2>
  <p>${H.p3(cc)}</p>
${T.cta(c)}`;
  const R=T.related;
  const related=[{href:'/gomining-roi-calculator',label:R.roi},{href:'/gomining-discount-explained',label:R.disc},{href:'/gomining-promo-code',label:R.promo},{href:'/',label:R.calc}];
  return {slug,html:shell({c,T,slug,title:H.title(cc),desc:H.desc(cc,full),faq:H.faq(cc,full,none,cptTier(th)),body,related})};
}

function pricePage(c, price, live){
  const T=TEXT[c.lang], S=T.stat, P=T.price;
  const th=100; // reference farm
  const m=model({th,bp:price,diff:live.diff,disc:20});
  const pk=Math.round(price/1000), cc={...c,pk};
  const slug=`gomining-profit-btc-${pk}k.html`;
  const y=m.yearlyUSD/m.totalCapital*100;
  const body=`  <h1>${P.h1(cc)}</h1>
  <p class="lead">${P.lead(cc)}</p>
  <p class="updated">${P.updated(cc)}</p>
${stats([[S.btc,P.k(cc),S.scenario],
         [S.net,c.u(m.monthlyUSD),S.miningPlusStaking(c,c.u(m.miningMonthlyUSD),c.u(m.stakingMonthlyUSD))],
         [S.capital,c.u(m.totalCapital),S.hashPlusGmt(c,c.u(m.hashCost),c.u(m.gmtLockUSD))],
         [S.perDay,c.u2(m.netUSD),S.yearOnCap(c,y)]])}
  <p>${P.p1(cc,m,T.verdict(c,y))}</p>
  <p>${P.p2(cc)}</p>
${T.cta(c)}`;
  const R=T.related;
  const related=[{href:'/is-gomining-worth-it',label:R.worth},{href:'/gomining-roi-calculator',label:R.roi},{href:'/gomining-promo-code',label:R.promo},{href:'/',label:R.calc}];
  return {slug,html:shell({c,T,slug,title:P.title(cc),desc:P.desc(cc,m),faq:P.faq(cc,m),body,related})};
}

function monthlyPage(c, live){
  const T=TEXT[c.lang], S=T.stat, M=T.month;
  const th=100;
  const m=model({th,bp:live.bp,diff:live.diff,disc:20});
  const slug='gomining-worth-it-now.html';   // stable URL, regenerated in place (fresh, no pile-up)
  // This page and /is-gomining-worth-it chase the same query, and the latter pulls ~6x
  // the impressions. Point the canonical there so the two stop splitting the signal —
  // the page still exists and stays current, it just ranks under its stronger twin.
  const canonicalUrl=`${SITE}/is-gomining-worth-it`;
  const y=m.yearlyUSD/m.totalCapital*100;
  const body=`  <h1>${M.h1(c)}</h1>
  <p class="lead">${M.lead(c)}</p>
  <p class="updated">${M.updated(c)}</p>
${stats([[S.btcNow,c.btc,S.live],
         [S.net,c.u(m.monthlyUSD),S.miningPlusStaking(c,c.u(m.miningMonthlyUSD),c.u(m.stakingMonthlyUSD))],
         [S.perDay,c.u2(m.netUSD),S.yearOnCap(c,y)],
         [S.capital,c.u(m.totalCapital),S.hashPlusGmt(c,c.u(m.hashCost),c.u(m.gmtLockUSD))]])}
  <p>${M.p1(c,m,T.verdict(c,y))}</p>
  <h2>${M.h2}</h2>
  <p>${M.p2(c)}</p>
${T.cta(c)}`;
  const R=T.related;
  const related=[{href:'/is-gomining-worth-it',label:R.worthFull},{href:'/gomining-discount-explained',label:R.disc},{href:'/gomining-promo-code',label:R.promo},{href:'/',label:R.calc}];
  return {slug,canonicalUrl,html:shell({c,T,slug,title:M.title(c),desc:M.desc(c,m),faq:M.faq(c,m,y),body,related,canonicalUrl})};
}

/* ===== sitemap (English URLs; translated URLs are listed by scripts/gen-i18n.js) ===== */
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
   refills them on every run. Everything outside the markers is left alone.
   The es/fr/de versions of a block go to locales/live/<lang>/<name>.html; scripts/gen-i18n.js puts them
   into the translated copy of the page. */
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

function liveBlockHTML(c,live){
  // "Is GoMining worth it" — the query wants a verdict backed by evidence, so give
  // it the real numbers at both the optimised and the do-nothing end of the range.
  const good=model({th:50,bp:live.bp,diff:live.diff,disc:20});
  const bad =model({th:50,bp:live.bp,diff:live.diff,disc:0});
  const yGood=good.yearlyUSD/good.totalCapital*100, yBad=bad.yearlyUSD/bad.totalCapital*100;
  return TEXT[c.lang].live(c,good,bad,yGood,yBad,EFF_BASE_MAX);
}

/* ===== main ===== */
(async()=>{
  const live=await getLive();
  const now=process.env.GEN_PAGES_DATE?new Date(process.env.GEN_PAGES_DATE+'T12:00:00Z'):new Date();   // test hook
  console.log(`Live: BTC ${usd(live.bp)}, difficulty ${(live.diff/1e12).toFixed(1)}e12, sats/TH/day ${Math.round(satsPerTHDay(live.diff))} (${live.live?'live':'FALLBACK'})`);

  let englishPages=[];
  for(const lang of LANGS){
    const c=ctx(lang,live,now);
    const pages=[];
    [1,5,10,25,50,100,250,500].forEach(th=>pages.push(hashratePage(c,th,live)));
    [75000,100000,150000,200000,250000].forEach(p=>pages.push(pricePage(c,p,live)));
    pages.push(monthlyPage(c,live));
    const dir=lang==='en'?ROOT:path.join(ROOT,lang);
    fs.mkdirSync(dir,{recursive:true});
    for(const p of pages)fs.writeFileSync(path.join(dir,p.slug),p.html);
    console.log(`  wrote ${pages.length} ${lang} page(s)`);
    if(lang==='en'){englishPages=pages;injectLiveBlock('is-gomining-worth-it.html','worth-it-verdict',liveBlockHTML(c,live));}
    else{
      const d=path.join(ROOT,'locales/live',lang);fs.mkdirSync(d,{recursive:true});
      fs.writeFileSync(path.join(d,'worth-it-verdict.html'),liveBlockHTML(c,live));
    }
  }
  updateSitemap(englishPages);
  console.log(`\nDone: ${englishPages.length} pages × ${LANGS.length} languages + sitemap updated.`);
})();
