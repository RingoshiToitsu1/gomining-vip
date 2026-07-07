const fs=require('fs');
const {Resvg}=require('@resvg/resvg-js');
const ROOT='/home/ringoshi';

const b64=(p,mime)=>'data:'+mime+';base64,'+fs.readFileSync(ROOT+'/'+p).toString('base64');
const LOGO=b64('gmt-optimizer-logo.svg','image/svg+xml');
const BTC=b64('btc36.png','image/png');
const GMT=b64('gmt36.png','image/png');

const W=1200,H=630,GOLD='#F5A623',GSOFT='#F7B84E',UP='#16c784',DN='#ea3943';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// deterministic pseudo-random walk -> nice-looking candles
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function candles(seed,n){
  const r=mulberry32(seed);let p=100,out=[];
  for(let i=0;i<n;i++){
    const drift=0.6+r()*1.0;                 // gentle uptrend
    const o=p, c=Math.max(20,o*(1+(r()-0.5)*0.05)+drift*0.4);
    const hi=Math.max(o,c)*(1+r()*0.02), lo=Math.min(o,c)*(1-r()*0.02);
    out.push({o,c,h:hi,l:lo});p=c;
  }
  return out;
}

function chartSVG(rows,x0,x1,y0,y1){
  let lo=Infinity,hi=-Infinity;rows.forEach(r=>{if(r.l<lo)lo=r.l;if(r.h>hi)hi=r.h;});
  const pad=(hi-lo)*0.12;lo-=pad;hi+=pad;
  const n=rows.length,slot=(x1-x0)/n,bw=Math.min(15,slot*0.6);
  const py=v=>y1-(v-lo)/(hi-lo)*(y1-y0);
  let g='';
  // horizontal gridlines
  for(let k=0;k<=4;k++){const gy=y0+(y1-y0)*k/4;g+=`<line x1="${x0}" y1="${gy.toFixed(1)}" x2="${x1}" y2="${gy.toFixed(1)}" stroke="rgba(245,166,35,0.08)" stroke-width="1"/>`;}
  // area glow under the close line
  let area=`M ${x0} ${py(rows[0].c).toFixed(1)}`;
  rows.forEach((r,i)=>{area+=` L ${(x0+(i+0.5)*slot).toFixed(1)} ${py(r.c).toFixed(1)}`;});
  area+=` L ${x1} ${y1} L ${x0} ${y1} Z`;
  g+=`<path d="${area}" fill="url(#areaG)" opacity="0.5"/>`;
  // candles
  rows.forEach((r,i)=>{
    const cx=x0+(i+0.5)*slot,col=r.c>=r.o?UP:DN;
    const yo=py(r.o),yc=py(r.c),top=Math.min(yo,yc),bh=Math.max(2,Math.abs(yc-yo));
    g+=`<line x1="${cx.toFixed(1)}" y1="${py(r.h).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${py(r.l).toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
    g+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" rx="1.5"/>`;
  });
  return g;
}

function build(asset){
  const isBtc=asset==='btc';
  const name=isBtc?'Bitcoin':'GoMining Token';
  const pair=isBtc?'BTC / USD  ·  1H CANDLES':'GMT / USD  ·  1H CANDLES';
  const coin=isBtc?BTC:GMT;
  const rows=candles(isBtc?7:42,44);
  const CX0=60,CX1=1140,CY0=190,CY1=496;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0a0a0a"/><stop offset="0.5" stop-color="#100c06"/><stop offset="1" stop-color="#0a0a0a"/>
  </linearGradient>
  <radialGradient id="orb1" cx="0.12" cy="0.1" r="0.5"><stop offset="0" stop-color="rgba(245,166,35,0.20)"/><stop offset="1" stop-color="rgba(245,166,35,0)"/></radialGradient>
  <radialGradient id="orb2" cx="0.9" cy="0.2" r="0.5"><stop offset="0" stop-color="rgba(245,166,35,0.12)"/><stop offset="1" stop-color="rgba(245,166,35,0)"/></radialGradient>
  <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(22,199,132,0.28)"/><stop offset="1" stop-color="rgba(22,199,132,0)"/></linearGradient>
  <linearGradient id="divg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(245,166,35,0)"/><stop offset="0.5" stop-color="rgba(245,166,35,0.5)"/><stop offset="1" stop-color="rgba(245,166,35,0)"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#orb1)"/>
<rect width="${W}" height="${H}" fill="url(#orb2)"/>
<!-- brand: top-left -->
<image href="${LOGO}" x="60" y="48" width="42" height="42"/>
<text x="114" y="80" font-family="Ubuntu, sans-serif" font-size="36" font-weight="700" fill="#ffffff">GMT Optimizer</text>
<text x="60" y="120" font-family="Ubuntu Mono, monospace" font-size="23" font-weight="700" fill="${GSOFT}">gmt-optimizer.com</text>
<!-- asset: top-right -->
<image href="${coin}" x="${W-60-40-16-textW(name,36)}" y="52" width="40" height="40" clip-path="circle(20px at 20px 20px)"/>
<text x="${W-60}" y="82" text-anchor="end" font-family="Ubuntu, sans-serif" font-size="36" font-weight="700" fill="#ffffff">${esc(name)}</text>
<text x="${W-60}" y="118" text-anchor="end" font-family="Ubuntu Mono, monospace" font-size="20" font-weight="700" fill="rgba(255,255,255,0.5)">${esc(pair)}</text>
<!-- live badge -->
<circle cx="${W-60-92}" cy="146" r="6" fill="${UP}"/>
<text x="${W-60}" y="153" text-anchor="end" font-family="Ubuntu Mono, monospace" font-size="19" font-weight="700" fill="${UP}">LIVE</text>
<!-- chart -->
${chartSVG(rows,CX0,CX1,CY0,CY1)}
<rect x="${CX0}" y="${CY0}" width="${CX1-CX0}" height="${CY1-CY0}" fill="none" stroke="rgba(245,166,35,0.14)" stroke-width="1"/>
<!-- footer -->
<line x1="60" y1="540" x2="${W-60}" y2="540" stroke="url(#divg)" stroke-width="1.5"/>
<image href="${GMT}" x="60" y="560" width="26" height="26" clip-path="circle(13px at 13px 13px)"/>
<text x="98" y="580" font-family="Ubuntu, sans-serif" font-size="23" font-weight="700" fill="rgba(255,255,255,0.82)">Live 1-hour chart — free GoMining ROI, discount &amp; break-even planner</text>
</svg>`;
}
// crude text-width estimate for right-aligned coin placement (Ubuntu ~0.56em avg)
function textW(s,size){return s.length*size*0.56;}

for(const a of ['btc','gmt']){
  const svg=build(a);
  const png=new Resvg(svg,{fitTo:{mode:'width',value:W},font:{loadSystemFonts:true}}).render().asPng();
  const out=ROOT+'/og-'+(a==='btc'?'bitcoin':'gmt')+'.png';
  fs.writeFileSync(out,png);
  console.log('wrote',out,png.length,'bytes');
}
