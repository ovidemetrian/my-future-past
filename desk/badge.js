/* ===== MADE BY OVI WITH CLAUDE badge: injects itself, then drift · drag & throw · hold still = SYNTHIOSIS ===== */
(function(){
  "use strict";
  if(document.getElementById('wcBadge')) return;
  var css=document.createElement('link'); css.rel='stylesheet'; css.href='badge.css'; document.head.appendChild(css);
  var holder=document.createElement('div');
  holder.innerHTML='<button id="wcBadge" type="button" aria-label="Made with Claude. Drag to throw it; hold still to go to SYNTHIOSIS.">'+
'<svg viewBox="0 0 88 88" aria-hidden="true">'+
'  <defs>'+
'    <radialGradient id="wcPiano" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#3b3b3b"/><stop offset=".55" stop-color="#0b0b0b"/><stop offset="1" stop-color="#000"/></radialGradient>'+
'    <linearGradient id="wcGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'+
'    <linearGradient id="wcRYB" x1="0" x2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".5" stop-color="#ffc400"/><stop offset="1" stop-color="#3d8bff"/></linearGradient>'+
'    <path id="wcArc" d="M44 44m-33 0a33 33 0 1 1 66 0a33 33 0 1 1 -66 0"/>'+
'  </defs>'+
'  <circle cx="44" cy="44" r="42" fill="url(#wcPiano)" stroke="url(#wcRYB)" stroke-width="1.6"/>'+
'  <circle class="ring" cx="44" cy="44" r="42" fill="none" stroke="#ffc400" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="263.9" stroke-dashoffset="263.9" transform="rotate(-90 44 44)"/>'+
'  <g class="rim"><text font-family="system-ui,-apple-system,\'Segoe UI\',sans-serif" font-size="8.1" font-weight="800" fill="#fff"><textPath href="#wcArc" textLength="205" lengthAdjust="spacing">MADE BY <tspan fill="#ffc400">OVI</tspan> WITH <tspan fill="#ff7a1a">CLAUDE</tspan>  ·  </textPath></text></g>'+
'  <defs>'+
'    <linearGradient id="wcNeon" x1="0" y1="0" x2="1" y2="0">'+
'      <stop offset="0" stop-color="#ff2a4d"/><stop offset=".25" stop-color="#ffb000"/><stop offset=".5" stop-color="#ffe600"/><stop offset=".75" stop-color="#2f8cff"/><stop offset="1" stop-color="#b44dff"/>'+
'      <animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="5s" repeatCount="indefinite"/>'+
'    </linearGradient>'+
'    <filter id="wcGlow" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'+
'  </defs>'+
'  <g transform="translate(20 26) scale(1.5)" filter="url(#wcGlow)">'+
'    <path d="M5 12C5 6.5 11 6.5 16 12S27 17.5 27 12 21 6.5 16 12 5 17.5 5 12Z" fill="none" stroke="url(#wcNeon)" stroke-width="3.6" stroke-linecap="round"/>'+
'    <path class="flow" d="M5 12C5 6.5 11 6.5 16 12S27 17.5 27 12 21 6.5 16 12 5 17.5 5 12Z" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'+
'  </g>'+
'  <ellipse cx="44" cy="22" rx="28" ry="14" fill="url(#wcGloss)"/>'+
'</svg>'+
'</button>'+
'<div id="wcTip" role="status" aria-live="polite">Drag me to throw · hold still for SYNTHIOSIS</div>';
  while(holder.firstChild) document.body.appendChild(holder.firstChild);

  var b=document.getElementById('wcBadge'), tip=document.getElementById('wcTip'); if(!b) return;
  var ring=b.querySelector('.ring'), C=263.9, reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CRUISE=70, MINV=25, MAXV=1600, SLOP=10, HOLD_MS=700, TOP=56;
  var S=72, x=16, y=innerHeight*0.58, vx=32, vy=-24, ang=0, va=0, last=0;
  var mode='drift', pid=null, sx=0, sy=0, ox=0, oy=0, lx=0, ly=0, lt=0, start=0, raf=0, done=false, pvx=vx, pvy=vy, tipT=null;

  /* light trail: red, yellow, blue sparks behind a fast badge */
  var trail=[], ti=0, lastSpark=0, COLS=['#ff3b3b','#ffc400','#3d8bff'];
  for(var i=0;i<14;i++){ var d=document.createElement('span');
    d.style.cssText='position:fixed;left:0;top:0;width:14px;height:14px;border-radius:50%;pointer-events:none;z-index:29;opacity:0;will-change:transform,opacity';
    document.body.appendChild(d); trail.push(d); }
  function spark(now){ if(reduce||now-lastSpark<28) return; lastSpark=now;
    var d=trail[ti]; ti=(ti+1)%trail.length; var c=COLS[ti%3];
    d.style.background='radial-gradient(circle,'+c+' 0%,'+c+'00 70%)'; d.style.transition='none';
    d.style.transform='translate('+(x+S/2-7)+'px,'+(y+S/2-7)+'px) scale(1.6)'; d.style.opacity='.9';
    requestAnimationFrame(function(){ d.style.transition='opacity .5s linear,transform .5s ease-out'; d.style.opacity='0';
      d.style.transform='translate('+(x+S/2-7)+'px,'+(y+S/2-7)+'px) scale(.3)'; }); }

  function put(){ b.style.transform='translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px) rotate('+ang.toFixed(1)+'deg)'; }
  function lim(){ return {W:innerWidth-S-6, H:innerHeight-S-6}; }
  function walls(){ var L=lim(), fast=Math.hypot(vx,vy)>CRUISE*1.5, e=fast?.82:1;
    if(x<6){x=6;vx=Math.abs(vx)*e;va=-va*.6} if(x>L.W){x=L.W;vx=-Math.abs(vx)*e;va=-va*.6}
    if(y<TOP){y=TOP;vy=Math.abs(vy)*e} if(y>L.H){y=L.H;vy=-Math.abs(vy)*e} }
  function speedCtl(dt){ var sp=Math.hypot(vx,vy)||1, k=1;
    if(sp>CRUISE) k=Math.max(CRUISE/sp, Math.exp(-1.3*dt));   /* a throw glides back down to cruising speed */
    else if(sp<MINV) k=MINV/sp;
    vx*=k; vy*=k; }

  function loop(ts){
    var dt=last?Math.min(.05,(ts-last)/1000):0; last=ts;
    if(mode==='drift' && dt){
      x+=vx*dt; y+=vy*dt; walls(); speedCtl(dt);
      ang+=va*dt; va*=Math.exp(-1.6*dt);
      if(Math.hypot(vx,vy)>180) spark(ts);
      put(); }
    requestAnimationFrame(loop); }
  put(); if(!reduce) requestAnimationFrame(loop);

  function showTip(m){ if(!tip) return; tip.textContent=m; tip.classList.add('show');
    var tx=Math.min(Math.max(x+S/2-tip.offsetWidth/2,8),innerWidth-tip.offsetWidth-8), ty=y-tip.offsetHeight-12; if(ty<8) ty=y+S+12;
    tip.style.left=tx+'px'; tip.style.top=ty+'px'; clearTimeout(tipT); tipT=setTimeout(function(){tip.classList.remove('show')},2400); }
  function setP(p){ ring.style.strokeDashoffset=(C*(1-p/100)).toFixed(1); }
  function stopFill(){ cancelAnimationFrame(raf); setP(0); }
  function go(){ b.classList.remove('go2'); void b.offsetWidth; b.classList.add('go2');
    showTip('SYNTHIOSIS · creation through coexistence'); try{ window.wcGoSynthiosis && window.wcGoSynthiosis(); }catch(e){} }
  function fill(){ if(mode!=='hold') return; var p=Math.min(100,(performance.now()-start)/HOLD_MS*100); setP(p);
    if(p>=100){ stopFill(); done=true; go(); return; } raf=requestAnimationFrame(fill); }

  b.addEventListener('pointerdown',function(e){ if(pid!==null) return; e.preventDefault();
    pid=e.pointerId; try{b.setPointerCapture(pid)}catch(_){}
    pvx=vx; pvy=vy; mode='hold'; done=false;
    sx=lx=e.clientX; sy=ly=e.clientY; ox=e.clientX-x; oy=e.clientY-y; lt=performance.now();
    start=performance.now(); raf=requestAnimationFrame(fill); });
  b.addEventListener('pointermove',function(e){ if(e.pointerId!==pid) return; e.preventDefault();
    if(mode==='hold' && !done && Math.hypot(e.clientX-sx,e.clientY-sy)>SLOP){ mode='drag'; stopFill(); vx=vy=0; b.style.cursor='grabbing'; }
    if(mode!=='drag') return;
    var now=performance.now(), dt=Math.max(8,now-lt)/1000, L=lim();
    var nx=Math.max(6,Math.min(L.W,e.clientX-ox)), ny=Math.max(6,Math.min(L.H,e.clientY-oy));
    vx=vx*.35+((e.clientX-lx)/dt)*.65; vy=vy*.35+((e.clientY-ly)/dt)*.65;   /* carry the flick */
    ang+=(nx-x)*.6; x=nx; y=ny; lx=e.clientX; ly=e.clientY; lt=now;
    if(Math.hypot(vx,vy)>180) spark(now); put(); });
  function release(cancel){ if(pid===null) return; try{b.releasePointerCapture(pid)}catch(_){} pid=null; b.style.cursor='';
    if(mode==='drag'){
      if(performance.now()-lt>90){ vx*=.1; vy*=.1; }                 /* held still before letting go: just set it down */
      var sp=Math.hypot(vx,vy); if(sp>MAXV){ vx*=MAXV/sp; vy*=MAXV/sp; }
      va=vx*.5;
    } else {
      stopFill(); vx=pvx; vy=pvy;
      if(!done && !cancel) showTip('Drag me to throw · hold still for SYNTHIOSIS');
    }
    done=false; mode='drift'; }
  b.addEventListener('pointerup',function(){ release(false); });
  b.addEventListener('pointercancel',function(){ release(true); });
  b.addEventListener('lostpointercapture',function(){ if(pid!==null) release(true); });
  b.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); go(); } });
  b.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  addEventListener('resize',function(){ var L=lim(); x=Math.min(x,L.W); y=Math.min(y,L.H); put(); });
})();
