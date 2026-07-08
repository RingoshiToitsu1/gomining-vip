/* GMT Optimizer — shared UI chrome/behaviors (reveal, count-up, tilt,
   magnetic, nav-shrink, decode headline, galaxy backdrop).
   Ported verbatim from redesign-prototype.html; defensively no-ops on
   pages that lack the relevant elements. */
(function(){
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* nav shrink */
  var nav=document.getElementById('nav');
  addEventListener('scroll',function(){nav.classList.toggle('shrunk',scrollY>40);},{passive:true});

  /* reveal + trigger counters/decode when a node enters */
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add('in');
      e.target.querySelectorAll('[data-count]').forEach(runCount);
      io.unobserve(e.target);}
  });},{threshold:.16,rootMargin:'0px 0px -6% 0px'});
  document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});

  /* FAQ */
  document.querySelectorAll('.faq-q').forEach(function(q){q.addEventListener('click',function(){
    var it=q.parentElement,a=it.querySelector('.faq-a');var open=it.classList.toggle('open');
    a.style.maxHeight=open?a.scrollHeight+'px':0;});});

  /* animated counters */
  function runCount(el){
    if(el.dataset.done)return;el.dataset.done=1;
    var to=parseFloat(el.dataset.to),dec=parseInt(el.dataset.dec||0),pre=el.dataset.prefix||'',suf=el.dataset.suffix||'';
    if(reduce){el.textContent=pre+to.toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf;return;}
    var t0=performance.now(),dur=1300;
    (function step(t){var p=Math.min((t-t0)/dur,1);var e=1-Math.pow(1-p,3);var v=to*e;
      el.textContent=pre+v.toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec})+suf;
      if(p<1)requestAnimationFrame(step);})(t0);
  }

  /* decode headline */
  if(!reduce){
    var GL='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#*';
    document.querySelectorAll('[data-dec]').forEach(function(el,i){
      var full=el.textContent,out=el.textContent.split(''),done=0;
      el.textContent='';
      setTimeout(function(){
        var iv=setInterval(function(){
          var s='';
          for(var k=0;k<full.length;k++){
            if(full[k]===' '){s+=' ';continue;}
            if(k<done)s+=full[k];else s+=GL[Math.floor(Math.random()*GL.length)];
          }
          el.textContent=s;done+=0.7;
          if(done>=full.length){el.textContent=full;clearInterval(iv);}
        },28);
      },200+i*380);
    });
  }

  if(reduce)return;

  /* pointer parallax + tilt + magnetic + spotlight */
  var depths=[].slice.call(document.querySelectorAll('[data-depth]'));
  var mx=0,my=0,cx=0,cy=0;
  addEventListener('pointermove',function(e){mx=(e.clientX/innerWidth-.5);my=(e.clientY/innerHeight-.5);},{passive:true});
  document.querySelectorAll('[data-tilt]').forEach(function(el){
    el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();
      var px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;
      el.style.transform='perspective(820px) rotateX('+(-py*6)+'deg) rotateY('+(px*8)+'deg) translateY(-4px)';});
    el.addEventListener('pointerleave',function(){el.style.transform='';});
  });
  document.querySelectorAll('.spot').forEach(function(el){
    el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();
      el.style.setProperty('--mx',((e.clientX-r.left)/r.width*100)+'%');
      el.style.setProperty('--my',((e.clientY-r.top)/r.height*100)+'%');});
  });
  document.querySelectorAll('[data-magnetic]').forEach(function(b){
    b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();
      b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.16)+'px,'+((e.clientY-r.top-r.height/2)*.26-2)+'px)';});
    b.addEventListener('pointerleave',function(){b.style.transform='';});
  });
  (function loop(){cx+=(mx-cx)*.06;cy+=(my-cy)*.06;
    depths.forEach(function(el){var d=parseFloat(el.getAttribute('data-depth'))*100;
      el.style.transform='translate('+(-cx*d)+'px,'+(-cy*d)+'px)';});
    requestAnimationFrame(loop);})();

  /* ---- SPIRAL GALAXY BACKDROP ---- */
  var cvs=document.getElementById('stars'),ctx=cvs.getContext('2d');
  var W,H,dpr=Math.min(devicePixelRatio||1,2),gal=[],bg=[],shots=[],shotTimer=0,rot=0,ARMS=2,TURNS=1.45,maxR,cx0,cy0;
  function tint(t){return t<.28?'255,240,205':t<.62?'255,207,122':'245,166,35';}
  function build(){
    W=cvs.width=innerWidth*dpr;H=cvs.height=innerHeight*dpr;cvs.style.width=innerWidth+'px';cvs.style.height=innerHeight+'px';
    var narrow=innerWidth<900;cx0=W*(narrow?.5:.62);cy0=H*(narrow?.32:.42);maxR=Math.min(W,H)*(narrow?.72:.6);
    var n=Math.min(440,Math.round(innerWidth*.28));gal=[];
    for(var i=0;i<n;i++){var arm=i%ARMS,t=Math.pow(Math.random(),.62);
      gal.push({r:maxR*t+(Math.random()-.5)*maxR*.05,ang:arm*(6.2832/ARMS)+t*TURNS*6.2832+(Math.random()-.5)*(.42*(1-t*.5)),
        t:t,sz:(Math.random()*1.4+.5)*dpr,tw:Math.random()*6.28,tws:Math.random()*.05+.012,w:.85+.55*(1-t)});}
    var m=Math.min(110,Math.round(innerWidth/13));bg=[];
    for(var k=0;k<m;k++)bg.push({x:Math.random()*W,y:Math.random()*H,sz:(Math.random()*1.1+.3)*dpr,tw:Math.random()*6.28,tws:Math.random()*.03+.006});
  }
  build();addEventListener('resize',build);
  function draw(){
    ctx.clearRect(0,0,W,H);
    for(var k=0;k<bg.length;k++){var s=bg[k];s.tw+=s.tws;var o=(Math.sin(s.tw)*.5+.5)*.45;
      ctx.beginPath();ctx.arc(s.x,s.y,s.sz,0,6.28);ctx.fillStyle='rgba(255,225,175,'+o+')';ctx.fill();}
    ctx.globalCompositeOperation='lighter';
    var ccx=cx0+mx*46*dpr,ccy=cy0+my*46*dpr;
    var core=ctx.createRadialGradient(ccx,ccy,0,ccx,ccy,maxR*.34);
    core.addColorStop(0,'rgba(255,246,222,.85)');core.addColorStop(.18,'rgba(255,207,122,.45)');
    core.addColorStop(.5,'rgba(245,166,35,.12)');core.addColorStop(1,'rgba(245,166,35,0)');
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(ccx,ccy,maxR*.34,0,6.28);ctx.fill();
    rot+=.0015;
    for(var i=0;i<gal.length;i++){var p=gal[i];p.tw+=p.tws;var a=p.ang+rot*p.w;
      var x=ccx+Math.cos(a)*p.r,y=ccy+Math.sin(a)*p.r*.86,o=(Math.sin(p.tw)*.35+.65)*(1-p.t*.35);
      ctx.beginPath();ctx.arc(x,y,p.sz,0,6.28);ctx.fillStyle='rgba('+tint(p.t)+','+o+')';ctx.fill();}
    if(--shotTimer<=0){shotTimer=150+Math.random()*220;shots.push({x:Math.random()*W,y:Math.random()*H*.55,vx:(6+Math.random()*5)*dpr,vy:(2.4+Math.random()*2)*dpr,life:1});}
    for(var j=shots.length-1;j>=0;j--){var t=shots[j];t.x+=t.vx;t.y+=t.vy;t.life-=.02;if(t.life<=0){shots.splice(j,1);continue;}
      var g=ctx.createLinearGradient(t.x,t.y,t.x-t.vx*9,t.y-t.vy*9);g.addColorStop(0,'rgba(255,235,190,'+t.life+')');g.addColorStop(1,'rgba(255,235,190,0)');
      ctx.strokeStyle=g;ctx.lineWidth=1.6*dpr;ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.x-t.vx*9,t.y-t.vy*9);ctx.stroke();}
    ctx.globalCompositeOperation='source-over';
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
