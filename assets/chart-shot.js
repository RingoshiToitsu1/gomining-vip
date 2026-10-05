/* Branded chart snapshot renderer: a glowing glass price panel.
   Shared by the console's "Create chart screenshot" button (assets/app.js) and the
   OG image generator (scripts/gen-og-chart-images.js), so both images look the same.
   buildChartShotCanvas(asset, data, imgs) -> <canvas> (1200x675 at 2x)
     asset: {name, pair}            data: {rows:[{t,o,h,l,c}], interval}
     imgs:  {logoOpt, coin, token}  any of them may be null
     opts:  {headline, sub, footRight, height}  optional overrides for the big price, the change line
            and the footer's date text; height trims the floor (630 for OG cards). The OG images use them, since a baked-in price goes stale.
   The line runs from the first close: green with a green fill wherever price sits above
   that start, red below it, split along a dotted baseline. */
function buildChartShotCanvas(asset,data,imgs,opts){
  opts=opts||{};
  const rows=data.rows,n=rows.length;
  const SC=2,W=1200,H=opts.height||675;
  const c=document.createElement('canvas');c.width=W*SC;c.height=H*SC;
  const x=c.getContext('2d');x.scale(SC,SC);
  const GOLD='#F5A623',GSOFT='#F7B84E',GHI='#FFCF7A',UP='#2EE59D',DN='#FF4D5E';
  const SANS='"Space Grotesk",system-ui,sans-serif',MONO='"Share Tech Mono",monospace';
  const price=p=>p>=1000?'$'+p.toLocaleString('en-US',{maximumFractionDigits:0})
    :p>=1?'$'+p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    :'$'+p.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
  const rr=(g,X,Y,w,h,r)=>{g.beginPath();g.moveTo(X+r,Y);g.arcTo(X+w,Y,X+w,Y+h,r);g.arcTo(X+w,Y+h,X,Y+h,r);g.arcTo(X,Y+h,X,Y,r);g.arcTo(X,Y,X+w,Y,r);g.closePath();};
  const gold=a=>'rgba(245,166,35,'+a+')';

  // ---- backdrop: dark room, amber light columns, a reflective floor ----
  const bg=x.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,'#0b0805');bg.addColorStop(0.55,'#120c05');bg.addColorStop(0.8,'#070504');bg.addColorStop(1,'#050403');
  x.fillStyle=bg;x.fillRect(0,0,W,H);
  const beam=(cx,w,a)=>{
    const g=x.createLinearGradient(cx-w/2,0,cx+w/2,0);
    g.addColorStop(0,gold(0));g.addColorStop(0.5,gold(a));g.addColorStop(1,gold(0));
    const v=x.createLinearGradient(0,0,0,H*0.8);
    x.save();x.fillStyle=g;x.globalAlpha=1;x.fillRect(cx-w/2,0,w,H*0.8);
    v.addColorStop(0,'rgba(11,8,5,0)');v.addColorStop(1,'rgba(11,8,5,1)');
    x.fillStyle=v;x.fillRect(cx-w/2,H*0.35,w,H*0.45);x.restore();
  };
  beam(520,120,0.10);beam(700,70,0.07);beam(1080,180,0.13);beam(60,140,0.06);
  const orb=(cx,cy,r,a)=>{const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,gold(a));g.addColorStop(1,gold(0));x.fillStyle=g;x.fillRect(cx-r,cy-r,r*2,r*2);};
  orb(0,330,320,0.16);orb(W,170,300,0.14);orb(W/2,600,520,0.08);
  // floor horizon
  const FY=575;   // panel bottom (564) + a sliver
  const fl=x.createLinearGradient(0,FY,0,H);
  fl.addColorStop(0,'rgba(245,166,35,0.10)');fl.addColorStop(0.15,'rgba(20,13,6,0.9)');fl.addColorStop(1,'#040302');
  x.fillStyle=fl;x.fillRect(0,FY,W,H-FY);

  // ---- the glass panel, drawn offscreen so it can be reflected in the floor ----
  const PX=56,PY=112,PW=W-112,PH=452,PR=26;
  const pc=document.createElement('canvas');pc.width=(PW+80)*SC;pc.height=(PH+80)*SC;
  const p=pc.getContext('2d');p.scale(SC,SC);p.translate(40,40);   // 40px margin for the glow
  // outer glow + glass body
  p.save();p.shadowColor=gold(0.55);p.shadowBlur=34;
  rr(p,0,0,PW,PH,PR);p.fillStyle='rgba(18,12,6,0.92)';p.fill();p.restore();
  const body=p.createLinearGradient(0,0,PW*0.35,PH);
  body.addColorStop(0,'rgba(255,200,110,0.10)');body.addColorStop(0.45,'rgba(40,26,10,0.25)');body.addColorStop(1,'rgba(0,0,0,0.35)');
  rr(p,0,0,PW,PH,PR);p.fillStyle=body;p.fill();
  p.save();rr(p,0,0,PW,PH,PR);p.clip();
  // grid
  p.strokeStyle=gold(0.09);p.lineWidth=1;
  for(let i=1;i<14;i++){const gx=PW*i/14;p.beginPath();p.moveTo(gx,0);p.lineTo(gx,PH);p.stroke();}
  for(let i=1;i<8;i++){const gy=PH*i/8;p.beginPath();p.moveTo(0,gy);p.lineTo(PW,gy);p.stroke();}
  // diagonal sheen across the top-left of the glass
  const sh=p.createLinearGradient(0,0,PW*0.5,PH*0.6);
  sh.addColorStop(0,'rgba(255,240,210,0.10)');sh.addColorStop(0.4,'rgba(255,240,210,0.03)');sh.addColorStop(0.41,'rgba(255,240,210,0)');
  p.fillStyle=sh;p.fillRect(0,0,PW,PH);

  // ---- plot ----
  const L=34,R=PW-34,T=196,B=PH-30;
  const first=rows[0].o||rows[0].c,last=rows[n-1].c;
  let lo=first,hi=first;rows.forEach(r=>{if(r.c<lo)lo=r.c;if(r.c>hi)hi=r.c;});
  const padv=(hi-lo)*0.06||hi*0.02;lo-=padv;hi+=padv;
  const py=v=>B-(v-lo)/((hi-lo)||1)*(B-T);
  const pxs=i=>L+(R-L)*(n>1?i/(n-1):0.5);
  const base=py(first);
  const line=()=>{p.beginPath();p.moveTo(pxs(0),py(first));rows.forEach((r,i)=>p.lineTo(pxs(i),py(r.c)));};
  const side=(up)=>{
    const col=up?UP:DN,rgb=up?'46,229,157':'255,77,94';
    p.save();p.beginPath();
    if(up)p.rect(0,0,PW,base);else p.rect(0,base,PW,PH-base);
    p.clip();
    // area between the line and the baseline
    line();p.lineTo(pxs(n-1),base);p.lineTo(pxs(0),base);p.closePath();
    const ag=p.createLinearGradient(0,up?T:B,0,base);
    ag.addColorStop(0,'rgba('+rgb+',0.42)');ag.addColorStop(1,'rgba('+rgb+',0.05)');
    p.fillStyle=ag;p.fill();
    // glowing stroke: wide soft pass, then a crisp core
    p.lineJoin='round';p.lineCap='round';
    line();p.shadowColor=col;p.shadowBlur=16;p.strokeStyle='rgba('+rgb+',0.55)';p.lineWidth=4.5;p.stroke();
    line();p.shadowBlur=4;p.strokeStyle=col;p.lineWidth=2;p.stroke();
    p.restore();
  };
  side(true);side(false);
  // dotted baseline at the starting price
  p.save();p.setLineDash([2,5]);p.strokeStyle='rgba(255,240,215,0.55)';p.lineWidth=1.3;
  p.beginPath();p.moveTo(L,base);p.lineTo(R,base);p.stroke();p.restore();
  // start + end dots
  const pos=last>=first,chg=first?(last-first)/first*100:0;
  const dot=(cx,cy,col,r)=>{p.save();p.shadowColor=col;p.shadowBlur=16;p.fillStyle=col;p.beginPath();p.arc(cx,cy,r,0,7);p.fill();
    p.shadowBlur=0;p.fillStyle='rgba(255,255,255,0.85)';p.beginPath();p.arc(cx,cy,r*0.45,0,7);p.fill();p.restore();};
  dot(pxs(0),base,rows[1]&&rows[1].c<first?DN:UP,4);
  dot(pxs(n-1),py(last),pos?UP:DN,6.5);
  p.restore();   // un-clip

  // ---- headline: asset (left), price + change (right) ----
  const daysSpan=Math.max(1,Math.round((rows[n-1].t-rows[0].t)/86400e3));
  let ax=34;
  if(imgs.coin){p.save();p.beginPath();p.arc(ax+21,58,21,0,7);p.closePath();p.clip();p.drawImage(imgs.coin,ax,37,42,42);p.restore();ax+=56;}
  p.textAlign='left';p.fillStyle='#fff';p.font='700 32px '+SANS;p.fillText(asset.name,ax,70);
  p.fillStyle='rgba(255,236,205,0.55)';p.font='18px '+MONO;
  p.fillText(asset.pair+'  ·  '+data.interval+'  ·  last '+daysSpan+' days',34,112);
  p.textAlign='right';
  p.save();p.shadowColor='rgba(255,220,160,0.45)';p.shadowBlur=22;
  p.fillStyle='#fff';p.font='700 92px '+SANS;p.fillText(opts.headline||price(last),PW-34,108);p.restore();
  p.save();p.shadowColor=pos?UP:DN;p.shadowBlur=12;
  p.fillStyle=pos?UP:DN;p.font='700 38px '+SANS;
  p.fillText(opts.sub||((pos?'▲ ':'▼ ')+Math.abs(chg).toFixed(2)+'% ('+daysSpan+'D)'),PW-34,160);p.restore();

  // glass rim: bright gold top-left fading round to the bottom-right, plus a thin inner line
  const rim=p.createLinearGradient(0,0,PW,PH);
  rim.addColorStop(0,GHI);rim.addColorStop(0.35,GOLD);rim.addColorStop(0.7,gold(0.55));rim.addColorStop(1,GSOFT);
  p.save();p.shadowColor=gold(0.9);p.shadowBlur=14;rr(p,0,0,PW,PH,PR);p.strokeStyle=rim;p.lineWidth=2.4;p.stroke();p.restore();
  rr(p,5,5,PW-10,PH-10,PR-5);p.strokeStyle='rgba(255,230,180,0.10)';p.lineWidth=1;p.stroke();

  // floor reflection: the panel flipped, squashed and faded out
  x.save();
  x.beginPath();x.rect(0,PY+PH+2,W,H-(PY+PH+2));x.clip();
  x.globalAlpha=0.22;
  x.translate(0,(PY+PH)*2+4);x.scale(1,-1);
  x.drawImage(pc,PX-40,PY-40,PW+80,PH+80);
  x.restore();
  const fade=x.createLinearGradient(0,PY+PH,0,PY+PH+90);
  fade.addColorStop(0,'rgba(5,4,3,0.15)');fade.addColorStop(1,'rgba(5,4,3,1)');
  x.fillStyle=fade;x.fillRect(0,PY+PH,W,H-(PY+PH));
  x.drawImage(pc,PX-40,PY-40,PW+80,PH+80);

  // ---- brand: top-left / url top-right ----
  let bx=PX+4;
  if(imgs.logoOpt){x.drawImage(imgs.logoOpt,bx,34,46,46);bx+=60;}
  x.textAlign='left';x.fillStyle='#fff';x.font='700 34px '+SANS;x.fillText('GMT Optimizer',bx,69);
  x.textAlign='right';x.fillStyle=GSOFT;x.font='20px '+MONO;x.fillText('gmt-optimizer.com',W-PX-4,66);

  // ---- footer on the floor ----
  const fy=H-24;
  let fx=PX+4;
  if(imgs.token){x.save();x.beginPath();x.arc(fx+10,fy-6,10,0,7);x.closePath();x.clip();x.drawImage(imgs.token,fx,fy-16,20,20);x.restore();fx+=28;}
  x.textAlign='left';x.fillStyle='rgba(255,240,215,0.72)';x.font='600 16px '+SANS;
  x.fillText('Free GoMining ROI & discount optimizer',fx,fy);
  x.textAlign='right';x.fillStyle='rgba(255,240,215,0.4)';x.font='14px '+MONO;
  const now=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  x.fillText(opts.footRight||now+'   ·   not financial advice',W-PX-4,fy);
  x.textAlign='left';
  return c;
}
if(typeof module!=='undefined')module.exports={buildChartShotCanvas};
