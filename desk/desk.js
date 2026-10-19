(function(){
const $=s=>document.querySelector(s);
const CH=[
  {id:'pres',name:'Presenter',sub:'Lavalier · RF 1'},
  {id:'aud1',name:'Audience 1',sub:'Handheld · RF 2'},
  {id:'aud2',name:'Audience 2',sub:'Handheld · RF 3'},
  {id:'remote',name:'Remote voices',sub:'Meet return'},
  {id:'play',name:'Playback',sub:'Video PC · stereo'}
];
const PRESETS={
  walkin:{label:'Walk-in',ch:{pres:[-60,true],aud1:[-60,true],aud2:[-60,true],remote:[-10,true],play:[-12,false]},cam:'wide'},
  presentation:{label:'Presentation',ch:{pres:[0,false],aud1:[-6,true],aud2:[-6,true],remote:[0,false],play:[-12,true]},cam:'presenter'},
  qa:{label:'Q&A',ch:{pres:[-3,false],aud1:[-4,true],aud2:[-4,true],remote:[0,false],play:[-12,true]},cam:'audience'},
  brk:{label:'Break',ch:{pres:[-60,true],aud1:[-60,true],aud2:[-60,true],remote:[-10,true],play:[-14,false]},cam:'wide'}
};
const CAMS={wide:'Wide',presenter:'Presenter',audience:'Audience'};
/* Lighting: one light cue per scene, same keys, so a scene GO moves sound, picture and light together */
const LX={
  walkin:{n:1,label:'Walk-in',lv:{house:85,wash:45,key:0,cyc:70},fade:5},
  presentation:{n:2,label:'Presentation',lv:{house:15,wash:70,key:90,cyc:30},fade:3},
  qa:{n:3,label:'Q&A',lv:{house:60,wash:70,key:70,cyc:30},fade:2},
  brk:{n:4,label:'Break',lv:{house:80,wash:30,key:0,cyc:70},fade:5}
};
const LX_ORDER=Object.keys(LX);
const SUBS=[
  {id:'house',name:'House',addr:'DMX 1–12'},
  {id:'wash',name:'Stage wash',addr:'DMX 13–24'},
  {id:'key',name:'Key / fill',addr:'DMX 25–30'},
  {id:'cyc',name:'Cyc / LED',addr:'DMX 31–36'}
];
const ROLE_COLORS={'Director':'var(--red)','A1 Audio':'var(--ok)','Camera':'var(--yellow)','Stream':'var(--blue)','Lighting':'#c78bff','Floor':'var(--fg)'};
const SHOWS={'hall-a':'Hall A · 200 seats · hybrid on Google Meet','boardroom':'Boardroom · 16 seats · Meet room','studio':'Studio · podcast set · streamed'};
/* Who owns what. Director owns everything; HUSH belongs to every human. */
const OWN={audio:['Director','A1 Audio'],camera:['Director','Camera'],stream:['Director','Stream'],lights:['Director','Lighting'],scene:['Director']};
const OWN_LABEL={audio:'audio',camera:'camera',stream:'the stream',lights:'lighting',scene:'scenes'};
const owns=k=>OWN[k].includes(myRole);
function gate(k){if(owns(k))return true;toast(myRole,'Your role doesn’t own '+OWN_LABEL[k]+'. Call the '+ownerHint(k)+(isAdmin?', or switch My role to Director.':'.'));return false;}
function ownerHint(k){return OWN[k].filter(r=>r!=='Director').concat('Director').join(' or ');}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pfl={};
const fmt=v=>v<=-60?'−∞':(v>0?'+':'')+v+' dB';
const chName=id=>(CH.find(c=>c.id===id)||{}).name||id;

/* ---------- Show state: one shared document when the crew is connected ---------- */
function freshState(){const ch={};for(const c of CH){const p=PRESETS.presentation.ch[c.id];ch[c.id]={level:p[0],mute:p[1]};}
  const lv=Object.assign({},LX.presentation.lv);
  return {ch,cam:'presenter',stream:'live',preset:'presentation',hush:false,pendingEnd:false,cue:null,change:null,lx:{look:'presentation',from:lv,to:Object.assign({},lv),at:0,fade:0},blackout:false};}
let S=freshState();
let db=null, user=null, room=null, docRef=null, myId=null, canWrite=true, docExists=false;
let fault=false, myRole='Director';
try{myRole=localStorage.getItem('desk.role')||'Director';}catch(e){}
$('#role').value=myRole;
let SHOW=(location.hash||'').slice(1);
if(!SHOWS[SHOW]){try{SHOW=localStorage.getItem('desk.show')||'';}catch(e){}}
if(!SHOWS[SHOW])SHOW='hall-a';
$('#show').value=SHOW;

/* writes: optimistic locally, then serialized to the shared doc */
let wq=Promise.resolve();
function merge(t,p){for(const k of Object.keys(p)){const v=p[k];if(v&&typeof v==='object'&&!Array.isArray(v)&&t[k]&&typeof t[k]==='object')merge(t[k],v);else t[k]=v;}}
function write(patch,src,what){
  if(!canWrite){toast('Read only','Ask the owner for edit access to operate the desk.');return Promise.resolve(false);}
  const change={src,what,by:myId,role:myRole,at:Date.now()};
  merge(S,patch); S.change=change; render();
  if(!docRef){addLog(src,what,myRole);bcSend({t:'patch',show:SHOW,patch,change});return Promise.resolve(true);}
  const full=Object.assign({},patch,{change});
  wq=wq.then(async()=>{
    try{ if(docExists) await docRef.update(full); else { const base=JSON.parse(JSON.stringify(S)); await docRef.set(base); docExists=true; } return true; }
    catch(e){ addLog('FAIL','Write refused: '+(e&&e.code||'error'),myRole); return false; }
  });
  return wq;
}

/* ---------- Multi-screen: each window shows one part; windows stay in step ---------- */
/* With the crew connected, every window follows the shared show. Solo, sibling windows on this computer talk directly. */
let bc=null; try{bc=new BroadcastChannel('ovi-directors-desk');}catch(e){}
function bcSend(m){if(bc)try{bc.postMessage(JSON.parse(JSON.stringify(m)));}catch(e){}}
let bcSynced=false;
if(bc)bc.onmessage=ev=>{const m=ev.data||{};if(docRef||m.show!==SHOW)return;
  if(m.t==='patch'&&m.patch&&m.change){merge(S,m.patch);S.change=m.change;bcSynced=true;render();addLog(m.change.src||'DIR',String(m.change.what||'').slice(0,160),m.change.role,'other screen');}
  else if(m.t==='hello'){bcSend({t:'state',show:SHOW,S});}
  else if(m.t==='state'&&!bcSynced&&m.S&&m.S.ch){S=Object.assign(freshState(),m.S);bcSynced=true;render();addLog('DIR','In step with the other screens',myRole);}};
setTimeout(()=>{if(!docRef)bcSend({t:'hello',show:SHOW});},1200);
const SCREENS={all:'Whole desk',audio:'Audio',picture:'Picture',calls:'Calls & Claude',lights:'Lighting'};
let consoleCss=null;
function setScreen(v,announce){
  if(!SCREENS[v])v='all';
  document.body.dataset.screen=v; $('#screen').value=v;
  try{sessionStorage.setItem('desk.screen',v);}catch(_){}
  if(v!=='all'&&!consoleCss){
    const st=[...document.querySelectorAll('style')].find(x=>x.textContent.includes('Desktop console: one landscape'));
    if(st){const t=st.textContent,i=t.indexOf('/* ===== Desktop console');
      consoleCss=document.createElement('style');consoleCss.id='consoleAnyWidth';
      consoleCss.textContent=t.slice(i,t.indexOf('/* ===== v22 multi-screen')>i?t.indexOf('/* ===== v22 multi-screen'):undefined).split('(min-width:1100px) and (min-height:620px)').join('(min-width:1px)');
      st.after(consoleCss);}
  }
  if(consoleCss)consoleCss.disabled=(v==='all');
  if(announce)toast('This screen',SCREENS[v]+(v==='all'?'':' · open this same link in another window and pick the next part'));
}
{let v='all';try{v=sessionStorage.getItem('desk.screen')||'all';}catch(_){}setScreen(v,false);}
$('#screen').addEventListener('change',e=>setScreen(e.target.value,true));

/* ---------- Log + names ---------- */
const logEl=$('#log'); const names={};
async function nameOf(id){if(!id||!user)return '';if(names[id]!==undefined)return names[id];
  try{const ps=await user.profiles([id]);names[id]=(ps&&ps[id]&&ps[id].name)||'';}catch(e){names[id]='';}return names[id];}
function addLog(src,msg,role,who){
  const li=document.createElement('li');
  li.innerHTML='<span class="t num"></span><span class="src"></span><span class="msg"></span>';
  li.children[0].textContent=new Date().toLocaleTimeString([], {hour12:false});
  li.children[1].className='src '+src; li.children[1].textContent=src;
  const tag=[who,role].filter(Boolean).join(' · ');
  li.children[2].textContent=msg+(tag?'  ('+tag+')':'');
  logEl.prepend(li); while(logEl.children.length>80)logEl.lastChild.remove();
}
let toastT=null;
function toast(who,txt){$('#toastWho').textContent=who;$('#toastTxt').textContent=txt;$('#toast').hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{$('#toast').hidden=true;},4200);}

/* ---------- UI build ---------- */
const stripList=$('#stripList'); const refs={};
for(const c of CH){
  const row=document.createElement('div'); row.className='strip';
  row.innerHTML='<div class="nm"></div><div class="fadercol"><div class="meter"><b></b></div><input type="range" min="-60" max="10" step="1"><span class="dbm num"></span></div><div class="db num"></div><button class="pfl" type="button">PFL</button><button class="mute" type="button"></button>';
  row.querySelector('.nm').innerHTML=c.name+'<small>'+c.sub+'</small>';
  const range=row.querySelector('input'); range.id='f_'+c.id; range.setAttribute('aria-label',c.name+' level');
  range.addEventListener('input',()=>{if(!owns('audio')){range.value=S.ch[c.id].level;return;}S.ch[c.id].level=+range.value;refs[c.id].db.textContent=fmt(+range.value);refs[c.id].dbm.textContent=fmt(+range.value);});
  range.addEventListener('change',()=>{if(!gate('audio')){render();return;}const v=+range.value;write({ch:{[c.id]:{level:v}},preset:null},'DIR',c.name+' fader '+fmt(v));});
  const mb=row.querySelector('.mute');
  mb.addEventListener('click',()=>{if(!gate('audio'))return;const m=!S.ch[c.id].mute;if(S.hush)toast('HUSH is on',c.name+(m?' will stay muted':' goes live')+' when HUSH is released.');write({ch:{[c.id]:{mute:m}},preset:null},'DIR',c.name+(m?' muted':' live'));});
  stripList.append(row);
  const pb=row.querySelector('.pfl'); pb.setAttribute('aria-label','Listen to '+c.name+' in headphones'); pb.addEventListener('click',()=>togglePfl(c.id));
  refs[c.id]={row,range,mb,pb,db:row.querySelector('.db'),dbm:row.querySelector('.dbm'),meter:row.querySelector('.meter b'),env:0};
}
function presetPatch(k){const p=PRESETS[k],ch={};for(const [id,[lv,mu]] of Object.entries(p.ch))ch[id]={level:lv,mute:mu};return Object.assign({ch,cam:p.cam},LX[k]?lxPatch(k):{});}
const presetRow=$('#presetRow');
for(const [k,p] of Object.entries(PRESETS)){const b=document.createElement('button');b.type='button';b.className='sel';b.dataset.k=k;b.textContent=p.label;
  b.addEventListener('click',()=>{if(gate('scene'))write(Object.assign(presetPatch(k),{preset:k}),'DIR','Scene → '+p.label+' · audio, camera, LX '+LX[k].n+' ('+LX[k].fade+' s)');});presetRow.append(b);}
const camRow=$('#camRow');
const camCanvas={};
for(const [k,l] of Object.entries(CAMS)){const b=document.createElement('button');b.type='button';b.className='tile';b.dataset.k=k;b.setAttribute('aria-label','Take '+l+' camera');
  const cv=document.createElement('canvas');cv.width=640;cv.height=360;camCanvas[k]=cv;const t=document.createElement('span');t.className='tl';t.textContent=l;const g=document.createElement('span');g.className='tg';g.textContent='PGM';g.hidden=true;b.append(cv,t,g);
  b.addEventListener('click',()=>{if(gate('camera'))write({cam:k},'DIR','Camera → '+l);});camRow.append(b);}
$('#streamStart').addEventListener('click',()=>gate('stream')&&write({stream:'live',pendingEnd:false},'DIR','Stream live'));
$('#streamEnd').addEventListener('click',()=>gate('stream')&&write({stream:'off',pendingEnd:false},'DIR','Stream ended'));
$('#confirmEnd').addEventListener('click',()=>gate('stream')&&write({stream:'off',pendingEnd:false},'DIR','Confirmed: stream ended'));
$('#confirmKeep').addEventListener('click',()=>gate('stream')&&write({pendingEnd:false},'DIR','Kept stream live'));
$('#fault').addEventListener('change',e=>{fault=e.target.checked;addLog('DIR','Test mode '+(fault?'on: Core may drop my Claude commands':'off'),myRole);render();});
$('#role').addEventListener('change',e=>{roleOverride=true;myRole=e.target.value;try{localStorage.setItem('desk.role',myRole);}catch(_){}
  if(room)room.presence({role:myRole,id:myId,show:SHOW}).catch(()=>{});renderPeople();render();});

/* ---------- Lighting: cue stack, submasters, human-only Blackout ---------- */
function lxLevels(st){const L=(st&&st.lx)||{};const from=L.from||{},to=L.to||{};
  const p=L.fade>0?clamp((Date.now()-(L.at||0))/(L.fade*1000),0,1):1;const lv={};
  for(const x of SUBS){const a=+(from[x.id]??0),b=+(to[x.id]??0);lv[x.id]=Math.round(a+(b-a)*p);}return {lv,p};}
function lxOut(id){return S.blackout?0:lxLevels(S).lv[id];}
function lxPatch(k){const cur=lxLevels(S).lv;return {lx:{look:k,from:cur,to:Object.assign({},LX[k].lv),at:Date.now(),fade:LX[k].fade}};}
function lxSubPatch(id,v){const cur=lxLevels(S).lv;const to=Object.assign({},cur,{[id]:clamp(Math.round(v),0,100)});return {lx:{look:null,from:to,to:Object.assign({},to),at:Date.now(),fade:0}};}
function lxName(){const L=S.lx||{};return L.look&&LX[L.look]?'LX '+LX[L.look].n+' '+LX[L.look].label:'manual levels';}
const lxLooksEl=$('#lxLooks'), lxSubsEl=$('#lxSubs'), lxRefs={};
for(const k of LX_ORDER){const L=LX[k];const b=document.createElement('button');b.type='button';b.className='sel lxlook';b.dataset.k=k;
  b.innerHTML='<span class="q num"></span> <span class="t"></span>';b.children[0].textContent=L.n;b.children[1].textContent=L.label;
  b.setAttribute('aria-label','Light cue '+L.n+' '+L.label+', '+L.fade+' second fade');
  b.addEventListener('click',()=>{if(gate('lights'))fireLook(k,'DIR');});lxLooksEl.append(b);}
for(const x of SUBS){const row=document.createElement('div');row.className='sub';row.dataset.k=x.id;
  row.innerHTML='<div class="snm"><span></span><small></small></div><div class="sfd"><div class="lvbar"><b></b></div><input type="range" min="0" max="100" step="1"></div><div class="pct num"></div>';
  row.querySelector('.snm span').textContent=x.name;row.querySelector('small').textContent=x.addr;
  const r=row.querySelector('input');r.id='lx_'+x.id;r.setAttribute('aria-label',x.name+' level');
  r.addEventListener('input',()=>{if(!owns('lights')){r.value=lxLevels(S).lv[x.id];return;}lxRefs[x.id].pct.textContent=r.value+'%';});
  r.addEventListener('change',()=>{if(!gate('lights')){renderLx();return;}const v=+r.value;write(Object.assign(lxSubPatch(x.id,v),{preset:null}),'DIR',x.name+' → '+v+'%');});
  lxSubsEl.append(row);lxRefs[x.id]={row,range:r,bar:row.querySelector('.lvbar b'),pct:row.querySelector('.pct')};}
function fireLook(k,src){const L=LX[k];return write(Object.assign(lxPatch(k),{preset:null}),src,'LX '+L.n+' '+L.label+' · '+L.fade+' s fade');}
function stepLook(d){const cur=(S.lx||{}).look;let i=LX_ORDER.indexOf(cur);i=i<0?(d>0?0:LX_ORDER.length-1):(i+d+LX_ORDER.length)%LX_ORDER.length;fireLook(LX_ORDER[i],'DIR');}
$('#lxGo').addEventListener('click',()=>{if(gate('lights'))stepLook(1);});
$('#lxBack').addEventListener('click',()=>{if(gate('lights'))stepLook(-1);});
/* Blackout: any human, tap to engage, hold to release. Claude has no tool for it. */
const boBtn=$('#blackout'), boBar=boBtn.querySelector('.hold'); let boT=null,boStart=0,boRaf=null;
function boTick(){const p=Math.min(1,(performance.now()-boStart)/800);boBar.style.width=(p*100)+'%';if(p>=1)boEnd(true);else boRaf=requestAnimationFrame(boTick);}
function boEnd(done){cancelAnimationFrame(boRaf);boBar.style.width='0';boT=null;if(done)write({blackout:false},'DIR','Blackout released · lights back on '+lxName());}
function boEngage(){write({blackout:true},'DIR','BLACKOUT: every light out');}
boBtn.addEventListener('pointerdown',e=>{if(!S.blackout){boEngage();return;}e.preventDefault();try{boBtn.setPointerCapture(e.pointerId);}catch(_){}boStart=performance.now();boT=1;boRaf=requestAnimationFrame(boTick);});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>boBtn.addEventListener(ev,()=>{if(boT)boEnd(false);}));
boBtn.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();if(e.repeat)return;if(!S.blackout)boEngage();else if(!boT){boStart=performance.now();boT=1;boRaf=requestAnimationFrame(boTick);}});
boBtn.addEventListener('keyup',()=>{if(boT)boEnd(false);});
/* Console: the Stream keys sit in the right column, under Claude, so the centre never scrolls */
const streamPanel=document.querySelector('.streampanel'), streamHome=streamPanel.parentNode, consoleMQ=matchMedia('(min-width:1100px) and (min-height:620px)');
function placeStream(){const inCue=consoleMQ.matches&&document.body.dataset.screen==='all';const logBox=$('#log').parentNode;
  if(inCue&&streamPanel.parentNode!==$('#cue'))$('#cue').insertBefore(streamPanel,logBox);
  else if(!inCue&&streamPanel.parentNode!==streamHome)streamHome.append(streamPanel);}
try{consoleMQ.addEventListener('change',placeStream);}catch(_){consoleMQ.addListener(placeStream);}
$('#screen').addEventListener('change',placeStream); placeStream();
function renderLx(){
  const {lv,p}=lxLevels(S);
  for(const x of SUBS){const r=lxRefs[x.id];const out=S.blackout?0:lv[x.id];
    if(document.activeElement!==r.range)r.range.value=lv[x.id];
    if(document.activeElement!==r.range)r.pct.textContent=out+'%';
    r.bar.style.width=out+'%';}
  const L=S.lx||{};const look=L.look&&LX[L.look];
  const fading=p<1&&!S.blackout;
  $('#lxNow').textContent=S.blackout?'Blackout':(look?'LX '+look.n+' · '+look.label:'Manual')+(fading?' · fading '+Math.max(0,(1-p)*L.fade).toFixed(1)+' s':'');
  $('#tLx').className='tally '+(S.blackout?'on-red':fading?'on-yellow':'on-ok');
  $('#tLxTxt').textContent=S.blackout?'Blackout':look?'LX '+look.n:'Lights';
}
function renderLxStatic(){
  const lk=!owns('lights');
  lxLooksEl.querySelectorAll('.sel').forEach(b=>{b.classList.toggle('active',b.dataset.k===(S.lx||{}).look);b.disabled=!canWrite;b.classList.toggle('locked',lk);});
  ['lxGo','lxBack'].forEach(id=>{$('#'+id).disabled=!canWrite;$('#'+id).classList.toggle('locked',lk);});
  for(const x of SUBS){lxRefs[x.id].range.disabled=!canWrite;lxRefs[x.id].range.classList.toggle('locked',lk);}
  boBtn.classList.toggle('engaged',!!S.blackout);boBtn.setAttribute('aria-pressed',String(!!S.blackout));boBtn.disabled=!canWrite;
  $('#boSub').textContent=S.blackout?'Out · hold to release':'Human only · tap';
  $('#lights').classList.toggle('isout',!!S.blackout);
  renderLx();
}
/* Lights reach the camera previews: what the LD does, the program monitor shows */
function lxShade(g,k,W,H){
  const house=lxOut('house')/100, wash=lxOut('wash')/100, key=lxOut('key')/100, cyc=lxOut('cyc')/100;
  g.save();
  if(k==='wide'){
    const stage=Math.max(wash,key*0.7);
    if(cyc>0){g.globalCompositeOperation='lighter';g.fillStyle='rgba(40,70,255,'+(0.22*cyc).toFixed(3)+')';g.fillRect(0,0,W,H*0.12);g.fillRect(0,H*0.12,W*0.18,H*0.56);g.fillRect(W*0.82,H*0.12,W*0.18,H*0.56);g.globalCompositeOperation='source-over';}
    g.beginPath();g.rect(0,0,W,H*0.82);g.rect(W*0.18,H*0.12,W*0.64,H*0.4);
    g.fillStyle='rgba(0,0,0,'+(0.86*(1-Math.max(stage,house*0.45))).toFixed(3)+')';g.fill('evenodd');
    g.fillStyle='rgba(0,0,0,'+(0.85*(1-house)).toFixed(3)+')';g.fillRect(0,H*0.82,W,H*0.18);
  }else if(k==='presenter'){
    g.fillStyle='rgba(0,0,0,'+(0.88*(1-Math.max(key,wash*0.55))).toFixed(3)+')';g.fillRect(0,0,W,H);
    if(key>0){const gr=g.createRadialGradient(W*0.45,H*0.45,4,W*0.45,H*0.45,W*0.35);gr.addColorStop(0,'rgba(255,240,210,'+(0.12*key).toFixed(3)+')');gr.addColorStop(1,'rgba(255,240,210,0)');g.fillStyle=gr;g.fillRect(0,0,W,H);}
  }else{
    g.fillStyle='rgba(0,0,0,'+(0.88*(1-house)).toFixed(3)+')';g.fillRect(0,0,W,H);
  }
  g.restore();
}

function render(){
  for(const c of CH){const s=S.ch[c.id],r=refs[c.id];
    if(document.activeElement!==r.range)r.range.value=s.level;
    r.db.textContent=fmt(s.level); r.dbm.textContent=fmt(s.level);
    const st=s.mute?'muted':'live';
    if(r.mb.dataset.state!==st){r.mb.dataset.state=st; r.mb.className='mute '+st;
      r.mb.innerHTML=s.mute?'<span class="a">MUTED</span><span class="b">UNMUTE</span>':'<span class="a">LIVE</span><span class="b">MUTE</span>';
      r.mb.setAttribute('aria-label',c.name+(s.mute?' muted, tap to unmute':' live, tap to mute'));}
    r.mb.setAttribute('aria-pressed',String(s.mute));
    r.row.classList.toggle('hushed',S.hush); r.range.disabled=!canWrite; r.mb.disabled=!canWrite; const lk=!owns('audio'); r.range.classList.toggle('locked',lk); r.mb.classList.toggle('locked',lk);}
  presetRow.querySelectorAll('.sel').forEach(b=>{b.classList.toggle('active',b.dataset.k===S.preset);b.disabled=!canWrite;b.classList.toggle('locked',!owns('scene'));});
  camRow.querySelectorAll('.tile').forEach(b=>{const on=b.dataset.k===S.cam;b.classList.toggle('pgm',on);b.querySelector('.tg').hidden=!on;b.disabled=!canWrite;b.classList.toggle('locked',!owns('camera'));});
  for(const c of CH){refs[c.id].pb.classList.toggle('on',!!pfl[c.id]);refs[c.id].pb.setAttribute('aria-pressed',String(!!pfl[c.id]));}
  $('#phonesOff').hidden=!Object.values(pfl).some(Boolean); updateAudio();
  $('#sceneNow').textContent=S.preset?PRESETS[S.preset].label:'Custom';
  $('#streamNow').textContent=S.stream==='live'?'On air':'Off';
  $('#tStream').className='tally'+(S.stream==='live'?' on-red':'');
  $('#tStream span').textContent=S.stream==='live'?'On air':'Stream off';
  $('#streamStart').classList.toggle('active',S.stream==='live');
  $('#streamEnd').classList.toggle('active',S.stream==='off');
  $('#confirmCard').hidden=!S.pendingEnd;
  renderCue();
  $('#tCore').className='tally '+(fault?'on-yellow':'on-ok');
  const h=$('#hush'); h.classList.toggle('engaged',S.hush); h.setAttribute('aria-pressed',String(S.hush));
  $('#hushSub').textContent=S.hush?'Engaged · hold to release':'Human only · tap to engage';
  $('#hushBanner').hidden=!S.hush;
  $('#app').classList.toggle('readonly',!canWrite);
  ['streamStart','streamEnd','confirmEnd','confirmKeep'].forEach(id=>{$('#'+id).disabled=!canWrite;$('#'+id).classList.toggle('locked',!owns('stream'));});
  $('#owns').textContent=myRole==='Director'?'You own every control':'You own: '+(Object.keys(OWN).filter(owns).map(k=>OWN_LABEL[k]).join(', ')||'calls and HUSH')+' · HUSH is everyone’s';
  $('#showLabel').textContent=SHOWS[SHOW];
  renderLxStatic();
}

/* ---------- HUSH: any human on the crew; Claude has no tool ---------- */
const hb=$('#hush'), hrb=$('#hushRelease'); let hold=$('#hushHold'); let holdT=null, holdStart=0, raf=null;
function engage(){write({hush:true},'DIR','HUSH engaged: all mics and remote audio cut');}
function holdTick(){const p=Math.min(1,(performance.now()-holdStart)/800);hold.style.width=(p*100)+'%';if(p>=1)endHold(true);else raf=requestAnimationFrame(holdTick);}
function endHold(done){cancelAnimationFrame(raf);document.querySelectorAll('.hold').forEach(h=>h.style.width='0');holdT=null;if(done)write({hush:false},'DIR','HUSH released');}
function startHold(){holdStart=performance.now();holdT=1;raf=requestAnimationFrame(holdTick);}
function holdDown(btn,bar,e){e.preventDefault();try{btn.setPointerCapture(e.pointerId);}catch(_){}hold=bar;startHold();}
hb.addEventListener('pointerdown',e=>{if(!S.hush){engage();return;}holdDown(hb,$('#hushHold'),e);});
hrb.addEventListener('pointerdown',e=>{if(S.hush)holdDown(hrb,$('#relHold'),e);});
[hb,hrb].forEach(btn=>['pointerup','pointercancel','lostpointercapture'].forEach(ev=>btn.addEventListener(ev,()=>{if(holdT)endHold(false);})));
hrb.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat&&S.hush&&!holdT){e.preventDefault();hold=$('#relHold');startHold();}});
hrb.addEventListener('keyup',()=>{if(holdT)endHold(false);});
hb.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();if(e.repeat)return;if(!S.hush)engage();else if(!holdT){hold=$('#hushHold');startHold();}});
hb.addEventListener('keyup',()=>{if(holdT)endHold(false);});

/* ---------- Headphones: PFL listen on this device only (synthesized room sound) ---------- */
let ac=null, master=null; const nodes={};
const dbGain=d=>d<=-60?0:Math.pow(10,d/20);
function phonesVol(){return Math.pow(+$('#phonesVol').value/100,2)*0.9;}
function ensureAudio(){
  if(ac)return true;
  const AC=window.AudioContext||window.webkitAudioContext; if(!AC){toast('Headphones','This browser has no audio engine.');return false;}
  ac=new AC(); master=ac.createGain(); master.gain.value=phonesVol(); master.connect(ac.destination);
  const buf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  const noise=()=>{const n=ac.createBufferSource();n.buffer=buf;n.loop=true;n.start();return n;};
  function voice(f0,lo,hi){ // speech-like: buzz + breath through moving formants, gated by syllables
    const out=ac.createGain(); out.gain.value=0; const env=ac.createGain(); env.gain.value=0;
    const osc=ac.createOscillator(); osc.type='sawtooth'; osc.frequency.value=f0; osc.start();
    const og=ac.createGain(); og.gain.value=0.18; osc.connect(og);
    const nz=noise(); const ng=ac.createGain(); ng.gain.value=0.25; nz.connect(ng);
    const f1=ac.createBiquadFilter(); f1.type='bandpass'; f1.frequency.value=700; f1.Q.value=5;
    const f2=ac.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=1800; f2.Q.value=7;
    const band=ac.createBiquadFilter(); band.type='bandpass'; band.frequency.value=Math.sqrt(lo*hi); band.Q.value=Math.sqrt(lo*hi)/(hi-lo);
    og.connect(f1); ng.connect(f1); og.connect(f2); ng.connect(f2);
    f1.connect(env); f2.connect(env); env.connect(band); band.connect(out); out.connect(master);
    return {out,env,osc,f1,f2,f0,speech:true};
  }
  function murmur(){const out=ac.createGain();out.gain.value=0;const nz=noise();const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=480;const g=ac.createGain();g.gain.value=0.5;nz.connect(lp);lp.connect(g);g.connect(out);out.connect(master);return {out,env:g,murmur:true};}
  function music(){const out=ac.createGain();out.gain.value=0;const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1400;const g=ac.createGain();g.gain.value=0.12;
    [220,277.18,329.63,110].forEach(f=>{const o=ac.createOscillator();o.type='triangle';o.frequency.value=f;o.start();o.connect(g);});
    const lfo=ac.createOscillator();lfo.frequency.value=0.25;const lg=ac.createGain();lg.gain.value=0.05;lfo.connect(lg);lg.connect(g.gain);lfo.start();
    g.connect(lp);lp.connect(out);out.connect(master);return {out};}
  nodes.pres=voice(125,120,6000); nodes.remote=voice(190,300,3400); nodes.aud1=murmur(); nodes.aud2=murmur(); nodes.play=music();
  setInterval(()=>{if(!ac)return;const t=ac.currentTime;
    for(const id of ['pres','remote']){const n=nodes[id];const talking=id==='pres'?Math.random()<0.78:Math.random()<0.45;
      n.env.gain.setTargetAtTime(talking?0.5+Math.random()*0.5:0,t,0.025);
      n.f1.frequency.setTargetAtTime(300+Math.random()*600,t,0.03);n.f2.frequency.setTargetAtTime(1100+Math.random()*1300,t,0.03);
      n.osc.frequency.setTargetAtTime(n.f0*(0.85+Math.random()*0.3),t,0.05);}
    for(const id of ['aud1','aud2'])nodes[id].env.gain.setTargetAtTime(0.3+Math.random()*0.4,t,0.2);
  },130);
  return true;
}
function updateAudio(){
  if(!ac)return; const t=ac.currentTime;
  master.gain.setTargetAtTime(phonesVol(),t,0.03);
  for(const c of CH){const n=nodes[c.id]; if(!n)continue; const s=S.ch[c.id];
    const live=!s.mute&&!(S.hush&&c.id!=='play');
    n.out.gain.setTargetAtTime(pfl[c.id]&&live?dbGain(s.level):0,t,0.03);}
}
function togglePfl(id){
  if(!ensureAudio())return; if(ac.state==='suspended')ac.resume();
  pfl[id]=!pfl[id]; render();
  if(pfl[id]){const s=S.ch[id];if(s.mute||(S.hush&&id!=='play'))toast('Headphones',chName(id)+' is '+(S.hush?'hushed':'muted')+'. You’ll hear it when it goes live.');}
}
$('#phonesVol').addEventListener('input',updateAudio);
$('#phonesOff').addEventListener('click',()=>{for(const k of Object.keys(pfl))pfl[k]=false;render();});

/* ---------- Camera previews (simulated feeds) ---------- */
function drawCams(t){
  const tc=new Date().toLocaleTimeString([], {hour12:false});
  const env=refs.pres.env, aud=[refs.aud1.env,refs.aud2.env];
  for(const [k,cv] of Object.entries(camCanvas)){
    const g=cv.getContext('2d'); g.setTransform(cv.width/320,0,0,cv.width/320,0,0); const W=320, H=180;
    if(k==='wide'){
      g.fillStyle='#0d0f16';g.fillRect(0,0,W,H);
      g.fillStyle='#1b2236';g.fillRect(W*0.18,H*0.12,W*0.64,H*0.4); // screen
      g.fillStyle='#3a5aa8';g.fillRect(W*0.2,H*0.14,W*0.6,H*0.36);
      g.fillStyle='#e8e4d8';g.font='bold 15px sans-serif';g.textAlign='center';g.fillText('Q4 ROADMAP',W/2,H*0.34);
      g.fillStyle='#2a2f3d';g.fillRect(0,H*0.68,W,H*0.32); // stage
      const x=W*0.62+Math.sin(t/1800)*W*0.04;
      g.fillStyle='#c9b79a';g.beginPath();g.arc(x,H*0.5,7,0,7);g.fill();
      g.fillStyle='#2f4f7f';g.fillRect(x-8,H*0.55,16,28);
      g.fillStyle='#57402a';g.fillRect(W*0.3,H*0.56,26,30); // podium
      for(let r=0;r<2;r++)for(let i=0;i<14;i++){g.fillStyle='#161a24';g.beginPath();g.arc(12+i*22+(r?11:0),H-6-r*14,7,0,7);g.fill();}
    }else if(k==='presenter'){
      g.fillStyle='#14203a';g.fillRect(0,0,W,H);
      g.fillStyle='#22345c';g.fillRect(W*0.62,0,W*0.38,H);
      const sway=Math.sin(t/900)*4;
      g.fillStyle='#2f4f7f';g.beginPath();g.ellipse(W*0.45+sway,H*1.02,W*0.24,H*0.38,0,0,7);g.fill();
      g.fillStyle='#c9b79a';g.beginPath();g.ellipse(W*0.45+sway,H*0.44,W*0.085,H*0.2,0,0,7);g.fill();
      g.fillStyle='#3b2a1c';g.beginPath();g.ellipse(W*0.45+sway,H*0.3,W*0.088,H*0.1,0,Math.PI,0);g.fill();
      const open=S.ch.pres.mute||S.hush?1:2+env*9;
      g.fillStyle='#5a2a2a';g.beginPath();g.ellipse(W*0.45+sway,H*0.55,6,open/2,0,0,7);g.fill();
      
    }else{
      g.fillStyle='#0f121a';g.fillRect(0,0,W,H);
      for(let r=0;r<4;r++)for(let i=0;i<9;i++){
        const x=18+i*36+(r%2?18:0), y=H*0.3+r*30, sz=9+r*2;
        g.fillStyle=['#8a7158','#c9b79a','#5b4636','#a68a6d'][(i+r)%4];g.beginPath();g.arc(x,y,sz,0,7);g.fill();
        g.fillStyle='#23293a';g.fillRect(x-sz,y+sz-2,sz*2,sz*1.6);}
      [['aud1',0],['aud2',1]].forEach(([id,j])=>{const s=S.ch[id];if(!s.mute&&!S.hush){const x=j?W*0.72:W*0.3,y=H*0.42;
        g.strokeStyle='#ffcc3d';g.lineWidth=3;g.beginPath();g.arc(x,y,16+aud[j]*6,0,7);g.stroke();
        g.fillStyle='#ffcc3d';g.font='bold 11px sans-serif';g.textAlign='center';g.fillText('MIC '+(j+1),x,y-22);}});
    }
    lxShade(g,k,W,H);
    g.fillStyle='rgba(0,0,0,.55)';g.fillRect(W-74,H-20,70,16);g.fillStyle='#ece9e1';g.font='11px monospace';g.textAlign='right';g.fillText(tc,W-8,H-8);
  }
}

/* ---------- Meters ---------- */
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches; let last=0, lastCam=0;
function meters(t){
  if(t-last>60){last=t;
    for(const c of CH){const s=S.ch[c.id],r=refs[c.id];
      const silent=s.mute||(S.hush&&c.id!=='play')||s.level<=-60; let target=0;
      if(!silent){const sp=c.id==='pres'?(0.55+0.4*Math.abs(Math.sin(t/430))*Math.random()):c.id==='remote'?(Math.random()<.6?0.5*Math.random()+0.25:0.05):c.id==='play'?0.6+0.2*Math.random():0.15*Math.random();target=clamp(sp*(1+s.level/60),0,1);}
      r.env=reduce?target:r.env*0.55+target*0.45; r.meter.style.width=(r.env*100).toFixed(1)+'%'; r.meter.style.setProperty('--lv',(r.env*100).toFixed(1)+'%');}
    renderLx();
    if(!reduce||t-lastCam>1000){lastCam=t;drawCams(t);}}
  requestAnimationFrame(meters);
}
requestAnimationFrame(meters);
setInterval(()=>{$('#clock').textContent=new Date().toLocaleTimeString([], {hour12:false});},1000);

/* ---------- Crew calls ---------- */
async function sendCall(text){
  text=text.trim().slice(0,140); if(!text)return;
  if(!room){addLog('CALL',text,myRole,'you');toast(myRole,text);return;}
  try{await room.emit('call',{text,role:myRole,show:SHOW});}catch(e){addLog('FAIL','Call not sent: '+(e&&e.code==='not_permitted'?'you need edit access':'connection'),myRole);}
}
/* Cue lights: Standby and Hold stay lit (blinking) for the whole crew, Go lights for 3 s, Clear resets */
const CUE_TEXT={Standby:'Standby',Go:'Go',Hold:'Hold'};
document.querySelectorAll('.callbtn').forEach(b=>b.addEventListener('click',()=>{
  const c=b.dataset.call;
  if(c==='Clear'){write({cue:null},'CALL','Clear: cue lights off'); toast(myRole,'Clear');}
  else{write({cue:{state:c,at:Date.now()}},'CALL',CUE_TEXT[c]); toast(myRole,c);}
}));
let goTimer=null;
function renderCue(){
  const cue=S.cue; let st=cue&&cue.state;
  if(st==='Go'&&Date.now()-(cue.at||0)>3000)st=null;
  document.querySelectorAll('.callbtn').forEach(b=>{const on=b.dataset.call===st;b.classList.toggle('on',on);b.classList.toggle('blink',on&&(st==='Standby'||st==='Hold'));b.setAttribute('aria-pressed',String(on));});
  clearTimeout(goTimer); if(st==='Go')goTimer=setTimeout(renderCue,Math.max(50,3000-(Date.now()-cue.at)));
}
$('#callForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#callInput').value;$('#callInput').value='';sendCall(v);});

/* ---------- Presence ---------- */
let peerList=[];
async function renderPeople(){
  const el=$('#people');
  const people=peerList.filter(p=>p.kind==='viewer'&&(p.isMe||!p.presence||!p.presence.show||p.presence.show===SHOW));
  if(!room||people.length<=1&&(!people[0]||people[0].isMe)){el.innerHTML='';const s=document.createElement('span');s.className='mode';s.textContent=room?'Just you so far. Share this page with your crew.':'Just you';el.append(s);if(!people.length)return;}
  else el.innerHTML='';
  const seen=new Set();
  for(const p of people){
    const id=p.by||(p.presence&&p.presence.id)||p.peer; if(seen.has(id+'|'+(p.presence&&p.presence.role)))continue; seen.add(id+'|'+(p.presence&&p.presence.role));
    const role=String((p.presence&&p.presence.role)||'Crew').slice(0,20);
    const chip=document.createElement('span'); chip.className='person'+(p.isMe?' me':'');
    chip.innerHTML='<i></i><span></span><b></b>';
    chip.children[0].style.background=ROLE_COLORS[role]||'var(--dim)';
    chip.children[2].textContent=role;
    chip.children[1].textContent=p.isMe?'You':'…';
    el.append(chip);
    const rn=rosterName(p.isMe?ME():id); if(rn)chip.children[1].textContent=rn+(p.isMe?' (you)':'');
    else if(!p.isMe&&p.by)nameOf(p.by).then(n=>{chip.children[1].textContent=n||'Someone';});
    else if(!p.isMe)chip.children[1].textContent='Someone';
  }
}

/* ---------- Call sheet: organizer names the crew, each person claims their slot ---------- */
const ROLES=['Director','A1 Audio','Camera','Stream','Lighting','Floor'];
const ROLE_NAME={'Director':'Director','A1 Audio':'A1 Audio','Camera':'Camera','Stream':'Stream engineer','Lighting':'Lighting (LD)','Floor':'Floor manager'};
const DUTY_HINT={'Director':'Calls the show, owns every control','A1 Audio':'Mics, Meet return, playback levels','Camera':'PTZ presets and framing','Stream':'Encoder and stream health','Lighting':'Light cues, house and stage looks','Floor':'Talent cues, mic handoff in Q&A'};
let SHEET={rows:{},callTime:'',published:false,publishedAt:0};
let draft=null, isAdmin=!window.claude, sheetRef=null, unsubSheet=null, sheetVer=0;
const ME=()=>myId||'me';
const rowList=o=>Object.entries(o.rows||{}).filter(([k,r])=>r&&r.name!==undefined).sort((a,b)=>(a[1].order||0)-(b[1].order||0));
function myRow(){return rowList(SHEET).find(([k,r])=>r.claimedBy&&r.claimedBy===ME());}
function isOrganizer(){const m=myRow();return isAdmin||(m&&m[1].role==='Director');}
function freshDraft(){const rows={};ROLES.forEach((r,i)=>{rows['r'+i]={order:i,name:'',role:r,duty:DUTY_HINT[r],claimedBy:null};});return {rows,callTime:'',published:false};}
function ensureDraft(){if(!draft)draft=JSON.parse(JSON.stringify(SHEET.published?SHEET:freshDraft()));}
let roleOverride=false;
function applyRosterRole(){
  const sel=$('#role'); const m=myRow();
  if(isAdmin){sel.disabled=false; if(m&&!roleOverride){myRole=m[1].role;sel.value=myRole;}}
  else if(SHEET.published&&m){myRole=m[1].role;sel.value=myRole;sel.disabled=true;}
  else if(SHEET.published&&!isOrganizer()){myRole='Floor';sel.value='Floor';sel.disabled=true;}
  else sel.disabled=false;
  if(room)room.presence({role:myRole,id:myId,show:SHOW}).catch(()=>{});
}
function onlineIds(){const s=new Set();for(const p of peerList){if(p.kind!=='viewer')continue;const id=p.by||(p.presence&&p.presence.id);if(id)s.add(id);if(p.isMe)s.add(ME());}return s;}
function renderSheet(){
  const org=isOrganizer(); const m=myRow(); const online=onlineIds();
  $('#sheetStatus').textContent=SHEET.published?('Sent'+(SHEET.publishedAt?' '+new Date(SHEET.publishedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}):'')):'Draft';
  const card=$('#myCard');
  if(m){card.hidden=false;card.innerHTML='<span class="big"></span><span class="lbl"></span><span class="duty"></span><button class="act" type="button" id="release">Not me</button>';
    card.children[0].textContent=m[1].name||'You';card.children[1].textContent=ROLE_NAME[m[1].role]||m[1].role;card.children[2].textContent=(m[1].duty||'')+(SHEET.callTime?' · call time '+SHEET.callTime:'');
    card.querySelector('#release').addEventListener('click',()=>claim(null));}
  else if(SHEET.published){card.hidden=false;card.innerHTML='<span class="duty"></span>';card.children[0].textContent='Find your name below and tap “This is me” to take your role.'+(SHEET.callTime?' Call time '+SHEET.callTime+'.':'');}
  else card.hidden=true;
  const rows=$('#rows'); rows.innerHTML='';
  if(org){ensureDraft();
    $('#callTime').value=draft.callTime||''; $('#callTime').disabled=false;
    for(const [k,r] of rowList(draft)){
      const live=(SHEET.rows||{})[k]||{}; const el=document.createElement('div'); el.className='row'+(live.claimedBy===ME()?' mine':'');
      el.innerHTML='<input placeholder="Type a name" aria-label="Name"><select aria-label="Role"></select><div class="dtcell"><input placeholder="Duty" aria-label="Duty"></div><div class="rowact"></div>';
      const [nm,rl]=el.querySelectorAll('input,select'); const dt=el.querySelector('.dtcell input');
      nm.id='n_'+k; dt.id='d_'+k; rl.id='r_'+k;
      ROLES.forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=ROLE_NAME[x];rl.append(o);});
      nm.value=r.name||''; rl.value=r.role; dt.value=r.duty||'';
      nm.addEventListener('input',()=>{draft.rows[k].name=nm.value.slice(0,40);});
      dt.addEventListener('input',()=>{draft.rows[k].duty=dt.value.slice(0,80);});
      rl.addEventListener('change',()=>{draft.rows[k].role=rl.value;});
      const act=el.querySelector('.rowact');
      if(live.claimedBy){const c=document.createElement('span');c.className='claimed';c.textContent=(online.has(live.claimedBy)?'● ':'')+(live.claimedBy===ME()?'You':'Claimed');act.append(c);}
      else if(SHEET.published&&SHEET.rows&&SHEET.rows[k]&&!m){const b=document.createElement('button');b.className='claim';b.type='button';b.textContent='This is me';b.addEventListener('click',()=>claim(k));act.append(b);}
      const x=document.createElement('button');x.className='x';x.type='button';x.textContent='✕';x.setAttribute('aria-label','Remove '+(r.name||'row'));
      x.addEventListener('click',()=>{delete draft.rows[k];renderSheet();});act.append(x);
      rows.append(el);}
    $('#sheetAct').hidden=false;
    $('#sheetHint').textContent=SHEET.published?'Edits reach the crew when you send again.':'Type each name, pick a role, then send.';
  }else{
    $('#callTime').value=SHEET.callTime||''; $('#callTime').disabled=true; $('#sheetAct').hidden=true;
    const list=rowList(SHEET);
    if(!SHEET.published||!list.length){const p=document.createElement('p');p.className='mode';p.textContent='The organizer hasn’t sent the call sheet yet. Your role picker works until then.';rows.append(p);}
    for(const [k,r] of list){
      const el=document.createElement('div'); el.className='row'+(r.claimedBy===ME()?' mine':'');
      el.innerHTML='<div class="nm2"><i></i><span></span></div><div class="rl"></div><div class="dtcell dt"></div><div class="rowact"></div>';
      el.querySelector('.nm2 i').className=r.claimedBy&&online.has(r.claimedBy)?'on':'';
      el.querySelector('.nm2 span').textContent=r.name||'(unnamed)'; el.querySelector('.rl').textContent=ROLE_NAME[r.role]||r.role; el.querySelector('.dt').textContent=r.duty||'';
      const act=el.querySelector('.rowact');
      if(r.claimedBy){const c=document.createElement('span');c.className='claimed';c.textContent=r.claimedBy===ME()?'You':'Checked in';act.append(c);}
      else if(!m){const b=document.createElement('button');b.className='claim';b.type='button';b.textContent='This is me';b.addEventListener('click',()=>claim(k));act.append(b);}
      rows.append(el);}
    $('#sheetHint').textContent='';
  }
}
$('#callTime').addEventListener('change',e=>{ensureDraft();draft.callTime=e.target.value;});
$('#addRow').addEventListener('click',()=>{ensureDraft();const k='r'+Date.now().toString(36);const n=rowList(draft).length;draft.rows[k]={order:n,name:'',role:'Camera',duty:DUTY_HINT['Camera'],claimedBy:null};renderSheet();const f=document.getElementById('n_'+k);if(f)f.focus();});
$('#sendSheet').addEventListener('click',async()=>{
  ensureDraft(); const rows={}; let i=0, named=0;
  for(const [k,r] of rowList(draft)){const name=(r.name||'').trim(); if(!name)continue; named++;
    const prev=(SHEET.rows||{})[k]; rows[k]={order:i++,name,role:r.role,duty:(r.duty||'').trim(),claimedBy:prev&&prev.claimedBy||null};}
  if(!named){toast('Call sheet','Type at least one name before sending.');return;}
  const doc={rows,callTime:draft.callTime||'',published:true,publishedAt:Date.now(),by:myId};
  if(sheetRef){try{await sheetRef.set(doc);}catch(e){toast('Call sheet','Not sent: '+(e&&e.code||'error'));return;}}
  else{SHEET=doc;applyRosterRole();renderSheet();render();}
  draft=JSON.parse(JSON.stringify(doc));
  sendCall('Call sheet sent: '+named+' crew'+(doc.callTime?', call time '+doc.callTime:'')+'. Tap your name.');
});
async function claim(k){
  const patch={};
  for(const [kk,r] of rowList(SHEET))if(r.claimedBy===ME()&&kk!==k)patch[kk]={claimedBy:null};
  if(k){const r=SHEET.rows[k]; if(r.claimedBy&&r.claimedBy!==ME()){toast('Call sheet','Someone already took that slot.');return;} patch[k]={claimedBy:ME(),claimedAt:Date.now()};}
  if(sheetRef){try{await sheetRef.update({rows:patch});}catch(e){toast('Call sheet','Could not check in: '+(e&&e.code||'error'));return;}}
  else{merge(SHEET.rows,patch);applyRosterRole();renderSheet();render();}
  if(k)sendCall((SHEET.rows[k].name||'Crew')+' checked in as '+(ROLE_NAME[SHEET.rows[k].role]||SHEET.rows[k].role));
}
function subscribeSheet(){
  if(unsubSheet){unsubSheet();unsubSheet=null;}
  SHEET={rows:{},callTime:'',published:false,publishedAt:0}; draft=null;
  if(!db){renderSheet();return;}
  sheetRef=db.doc('rosters/'+SHOW);
  unsubSheet=sheetRef.onSnapshot(snap=>{
    SHEET=snap.exists?Object.assign({rows:{},callTime:'',published:false},snap.data()):{rows:{},callTime:'',published:false,publishedAt:0};
    if(!draft||(SHEET.publishedAt&&SHEET.publishedAt!==sheetVer)){draft=null;sheetVer=SHEET.publishedAt||0;}
    applyRosterRole(); renderSheet(); render(); renderPeople();
  },e=>{sheetRef=null;renderSheet();});
}
function rosterName(id){const r=rowList(SHEET).find(([k,x])=>x.claimedBy===id);return r?r[1].name:'';}

/* ---------- Connect: db (shared state), room (calls + presence), user (names) ---------- */
let lastChangeAt=0, unsubShow=null;
function subscribeShow(){
  if(unsubShow){unsubShow();unsubShow=null;}
  docRef=db.doc('shows/'+SHOW); docExists=false; lastChangeAt=0;
  unsubShow=docRef.onSnapshot(async snap=>{
    if(!snap.exists){docExists=false;S=freshState();render();return;}
    docExists=true; const d=snap.data(); if(!d||!d.ch)return;
    const ch=d.change;
    S=Object.assign(freshState(),d); render();
    if(ch&&ch.at&&ch.at>lastChangeAt){lastChangeAt=ch.at; if(ch.src==='CALL'&&ch.by!==myId)toast(ch.role||'Crew',ch.what||'');
      const who=ch.by===myId?'you':await nameOf(ch.by); addLog(ch.src||'DIR',String(ch.what||'').slice(0,160),ch.role,who||'');}
  },e=>{$('#mode').textContent='Shared show unavailable ('+(e&&e.code||'error')+'). Working solo.';docRef=null;});
}
$('#show').addEventListener('change',e=>{
  SHOW=e.target.value; try{localStorage.setItem('desk.show',SHOW);}catch(_){}
  logEl.innerHTML=''; S=freshState(); addLog('DIR','Switched to '+SHOWS[SHOW],myRole,'you');
  if(db){subscribeShow();} subscribeSheet(); if(room)room.presence({role:myRole,id:myId,show:SHOW}).catch(()=>{});
  renderPeople(); render();
});
(async()=>{
  if(!window.claude)return;
  try{[db,room,user]=await Promise.all([claude.use('db'),claude.use('room'),claude.use('user')]);}catch(e){}
  if(user){try{myId=await user.id();}catch(e){}try{const c=await user.can('data.write');if(c===false)canWrite=false;}catch(e){}try{isAdmin=(await user.isOwner())||(await user.canEdit());}catch(e){}}
  if(db){
    $('#mode').textContent='Shared show · live for the whole crew';
    subscribeShow(); subscribeSheet();
  }else{$('#mode').textContent='Solo mode · sign in to Claude to share with the crew';isAdmin=true;renderSheet();}
  if(room){
    room.presence({role:myRole,id:myId,show:SHOW}).catch(()=>{});
    room.onPeers(ch=>{peerList=ch.peers.slice();renderPeople();renderSheet();});
    room.on('call',async m=>{const d=m.data||{};if(d.show&&d.show!==SHOW)return;const text=String(d.text||'').slice(0,140);if(!text)return;
      const role=String(d.role||'Crew').slice(0,20);const who=m.isMe?'you':(m.by?await nameOf(m.by):'')||'Someone';
      addLog('CALL',text,role,who);toast(role+(m.isMe?' · you':' · '+who),text);});
  }
  render();
})();

/* ---------- Claude tools: write to the shared show, then read back ---------- */
function snapshot(){const o={};for(const c of CH)o[c.id]={level_db:S.ch[c.id].level,muted:S.ch[c.id].mute};const {lv,p}=lxLevels(S);const out={};for(const x of SUBS)out[x.id]=S.blackout?0:lv[x.id];
  return {channels:o,camera:S.cam,stream:S.stream,scene:S.preset||'custom',hush:S.hush,lights:{cue:(S.lx&&S.lx.look)||'manual',output_pct:out,target_pct:Object.assign({},(S.lx&&S.lx.to)||{}),fading:p<1,blackout:!!S.blackout}};}
async function readback(){ if(docRef){try{const s=await docRef.get();if(s.exists){const d=s.data();if(d&&d.ch)return d;}}catch(e){}} return S; }
function guardOwn(k){if(!owns(k))throw new Error('The cuer is '+myRole+', who does not own '+OWN_LABEL[k]+'. Only '+ownerHint(k)+' can change it. Tell them to ask that person.');}
function guardBlackout(){if(S.blackout)throw new Error('Blackout is engaged by the crew. Lights stay out until a human releases it.');}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const lxMatch=(rb,want)=>{const {lv}=lxLevels(rb);return !rb.blackout&&SUBS.every(x=>lv[x.id]===want[x.id]);};
function guardHush(){if(S.hush)throw new Error('HUSH is engaged by the crew. Audio is locked until a human releases it.');}
async function claudeWrite(patch,what){
  if(fault&&Math.random()<0.25){addLog('CLAUDE',what+' (sent)',myRole,'Claude');return false;} // dropped on the wire
  return write(patch,'CLAUDE',what);
}
async function verifyLog(ok,okMsg,badMsg){await write({},ok?'CORE':'FAIL',ok?okMsg:badMsg);}
const chIds=CH.map(c=>c.id);
const tools=[
  {name:'read_room',description:'Returns the live shared read-back of every channel (level_db, muted), camera, stream, scene and whether HUSH is engaged.',async execute(){await readback();return snapshot();}},
  {name:'set_channel',description:'Change one channel. Give mute (true/false) and/or level_db (absolute, -60..10) or adjust_db (relative). Returns sent values, the shared read-back and verified true/false.',
    inputSchema:{type:'object',properties:{channel:{type:'string',enum:chIds},mute:{type:'boolean'},level_db:{type:'number'},adjust_db:{type:'number'}},required:['channel']},
    async execute(i){guardOwn('audio');guardHush();const id=String(i.channel);if(!S.ch[id])throw new Error('Unknown channel '+id);
      const want={};
      if(i.level_db!==undefined)want.level=clamp(Math.round(Number(i.level_db)),-60,10);
      else if(i.adjust_db!==undefined)want.level=clamp(S.ch[id].level+Math.round(Number(i.adjust_db)),-60,10);
      if(i.mute!==undefined)want.mute=!!i.mute;
      const desc=Object.keys(want).map(k=>k==='level'?fmt(want[k]):(want[k]?'mute':'live')).join(', ');
      await claudeWrite({ch:{[id]:want},preset:null},chName(id)+' → '+desc);
      const rb=await readback(); const cur=rb.ch[id];
      const ok=Object.keys(want).every(k=>cur[k]===want[k]);
      await verifyLog(ok,chName(id)+' read back ✓',chName(id)+' did not take ✗ (read back '+fmt(cur.level)+(cur.mute?', mute':', live')+')');
      return {channel:id,sent:want,readback:{level_db:cur.level,muted:cur.mute},verified:ok};}},
  {name:'recall_scene',description:'Recall a linked scene: audio, camera and its light cue in one GO. walkin, presentation, qa (presenter live, audience mics armed but muted, camera on audience, house lights up so the audience is on camera), brk (break). Waits for the light fade, then returns read-back and verified.',
    inputSchema:{type:'object',properties:{scene:{type:'string',enum:Object.keys(PRESETS)}},required:['scene']},
    async execute(i){guardOwn('scene');guardHush();guardBlackout();const k=String(i.scene);const p=PRESETS[k];if(!p)throw new Error('Unknown scene '+k);
      await claudeWrite(Object.assign(presetPatch(k),{preset:k}),'Scene → '+p.label+' · audio, camera, LX '+LX[k].n);
      await wait(Math.min(6,LX[k].fade)*1000+150);
      const rb=await readback();
      const okA=Object.entries(p.ch).every(([id,[lv,mu]])=>rb.ch[id].level===lv&&rb.ch[id].mute===mu)&&rb.cam===p.cam;
      const okL=lxMatch(rb,LX[k].lv); const ok=okA&&okL;
      await verifyLog(ok,p.label+' read back ✓ audio · camera · lights (fade complete)',p.label+' did not take ✗ ('+(!okA?'audio/camera':'')+(!okA&&!okL?' and ':'')+(!okL?'lights':'')+')');
      return {scene:k,readback:snapshot(),verified:ok};}},
  {name:'set_lights',description:'Lighting only. Fire a light cue by look (walkin, presentation, qa, brk) with its fade, or snap one submaster (sub: house, wash, key, cyc) to level 0-100 %. Waits for the fade, then returns the output read-back and verified. Blackout is human-only and not available here.',
    inputSchema:{type:'object',properties:{look:{type:'string',enum:LX_ORDER},sub:{type:'string',enum:SUBS.map(x=>x.id)},level:{type:'number'}}},
    async execute(i){guardOwn('lights');guardBlackout();
      if(i.look!==undefined){const k=String(i.look);const L=LX[k];if(!L)throw new Error('Unknown look '+k);
        await claudeWrite(Object.assign(lxPatch(k),{preset:null}),'LX '+L.n+' '+L.label+' · '+L.fade+' s fade');
        await wait(Math.min(6,L.fade)*1000+150);const rb=await readback();const ok=lxMatch(rb,L.lv);
        await verifyLog(ok,'LX '+L.n+' read back ✓ fade complete','LX '+L.n+' did not take ✗');
        return {look:k,readback:snapshot().lights,verified:ok};}
      if(i.sub!==undefined){const id=String(i.sub);const x=SUBS.find(s=>s.id===id);if(!x)throw new Error('Unknown sub '+id);if(i.level===undefined)throw new Error('Give a level 0-100');
        const v=clamp(Math.round(Number(i.level)),0,100);await claudeWrite(Object.assign(lxSubPatch(id,v),{preset:null}),x.name+' → '+v+'%');
        const rb=await readback();const got=lxLevels(rb).lv[id];const ok=!rb.blackout&&got===v;
        await verifyLog(ok,x.name+' read back ✓ '+got+'%',x.name+' did not take ✗ (read back '+got+'%)');
        return {sub:id,sent:v,readback:got,verified:ok};}
      throw new Error('Give a look, or a sub with a level.');}},
  {name:'set_camera',description:'Move the PTZ camera to a preset: wide, presenter or audience. Returns read-back and verified.',
    inputSchema:{type:'object',properties:{shot:{type:'string',enum:Object.keys(CAMS)}},required:['shot']},
    async execute(i){guardOwn('camera');const k=String(i.shot);if(!CAMS[k])throw new Error('Unknown shot '+k);
      await claudeWrite({cam:k},'Camera → '+CAMS[k]);const rb=await readback();const ok=rb.cam===k;
      await verifyLog(ok,'Camera read back ✓','Camera did not move ✗');return {shot:k,readback:rb.cam,verified:ok};}},
  {name:'request_stream',description:'Start the stream (applies at once) or request to end it. Ending only creates a confirmation for the human crew; it does not end the stream.',
    inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','end']}},required:['action']},
    async execute(i){guardOwn('stream');if(String(i.action)==='start'){await claudeWrite({stream:'live'},'Stream → live');const rb=await readback();const ok=rb.stream==='live';
        await verifyLog(ok,'Stream read back ✓','Stream did not start ✗');return {readback:rb.stream,verified:ok};}
      await write({pendingEnd:true},'CLAUDE','Requested end of stream: waiting for a human');return {status:'awaiting_human_confirmation',stream:S.stream};}}
];

/* ---------- Offline parser (when Claude isn't available) ---------- */
const WORDN={one:1,two:2,'1':1,'2':2};
async function offline(cue){
  const q=cue.toLowerCase(); const did=[];
  const run=async(n,i)=>{try{did.push(await tools.find(t=>t.name===n).execute(i));}catch(e){did.push({error:e.message});}};
  if(/hush|kill|cut everything|silence/.test(q))return 'HUSH is human-only. Use the red button.';
  if(/black ?out|lights? out\b|kill the lights/.test(q))return 'Blackout is human-only. Use the Blackout key in Lighting.';
  const lxOnly=/\blights?\b|\blx\b|\blook\b/.test(q)&&!/scene/.test(q);
  const lookOf=/walk.?in|preshow/.test(q)?'walkin':/break|intermission/.test(q)?'brk':/q ?& ?a|q and a|questions/.test(q)?'qa':/presentation|keynote/.test(q)?'presentation':null;
  const subOf=/house/.test(q)?'house':/wash/.test(q)?'wash':/\bkey\b|fill|spot/.test(q)?'key':/cyc|\bled\b|colou?r/.test(q)?'cyc':null;
  if(subOf){const n=q.match(/(\d{1,3})\s*%?/);const lv=/half/.test(q)?50:/\bfull\b/.test(q)?100:/\b(out|off|down)\b/.test(q)&&!n?0:n?Number(n[1]):null;
    if(lv!==null){await run('set_lights',{sub:subOf,level:lv});const e=did.find(r=>r.error);if(e)return e.error;return did[0].verified?'Done. '+subOf+' at '+did[0].readback+'%, read back ✓.':'It did not take. Check the log and resend.';}}
  if(lxOnly&&lookOf){await run('set_lights',{look:lookOf});const e=did.find(r=>r.error);if(e)return e.error;return did[0].verified?'Done. LX '+LX[lookOf].n+' '+LX[lookOf].label+' up, fade complete ✓.':'It did not take. Check the log and resend.';}
  if(/walk.?in/.test(q))await run('recall_scene',{scene:'walkin'});
  else if(/break|intermission/.test(q))await run('recall_scene',{scene:'brk'});
  else if(/q ?& ?a|q and a|questions/.test(q))await run('recall_scene',{scene:'qa'});
  else if(/presentation|keynote/.test(q))await run('recall_scene',{scene:'presentation'});
  const m=q.match(/(?:audience|aud)\s*(?:mic\s*)?(one|two|1|2)|mic\s*(one|two|1|2)/);
  if(m)await run('set_channel',{channel:'aud'+WORDN[m[1]||m[2]],mute:/close|mute|kill|off/.test(q)});
  else if(/audience mics/.test(q)&&/close|mute|off/.test(q)){await run('set_channel',{channel:'aud1',mute:true});await run('set_channel',{channel:'aud2',mute:true});}
  const ch=/remote|meet/.test(q)?'remote':/presenter|speaker|lav/.test(q)?'pres':/playback|music|video/.test(q)?'play':null;
  const d=q.match(/(up|down|raise|lower)\s*(\d+)\s*(?:db)?/);
  if(ch&&d)await run('set_channel',{channel:ch,adjust_db:(/(down|lower)/.test(d[1])?-1:1)*Number(d[2])});
  else if(ch&&/\bmute\b/.test(q))await run('set_channel',{channel:ch,mute:true});
  else if(ch&&/unmute|open|live/.test(q))await run('set_channel',{channel:ch,mute:false});
  const cam=/camera|shot|cam/.test(q)&&(/wide/.test(q)?'wide':/audience|crowd/.test(q)?'audience':/presenter|speaker/.test(q)?'presenter':null);
  if(cam)await run('set_camera',{shot:cam});
  if(/end (the )?stream|stop (the )?stream|we'?re done/.test(q))await run('request_stream',{action:'end'});
  else if(/go live|start (the )?stream/.test(q))await run('request_stream',{action:'start'});
  if(!did.length)return 'Offline parser did not understand. Try a scene name, "audience mic 2", or "remote up 3 dB".';
  const err=did.find(r=>r.error);if(err)return err.error;
  return did.some(r=>r.verified===false)?'Something did not take. Check the log and resend.':'Done. Every command read back ✓.';
}

/* ---------- Claude via the cuing viewer's own account ---------- */
let sample=null, ctl=null;
const replyEl=$('#reply'), stopBtn=$('#stopBtn'), go=$('#goBtn');
function setClaude(on,txt){$('#tClaude').className='tally'+(on?' on-blue':'');$('#tClaudeTxt').textContent=txt;}
setClaude(false,'Claude…');
(async()=>{
  try{sample=window.claude?await claude.use('sample'):null;}catch(e){sample=null;}
  if(sample){try{const lim=await sample.limits();if(!lim.tools)sample=null;}catch(e){}}
  if(sample){setClaude(true,'Claude');$('#who').innerHTML='Cues go to <b>Claude</b> on your own account. It operates the shared desk through six tools, lights included, and confirms every change with a read-back the whole crew sees.';}
  else{setClaude(false,'Offline parser');$('#who').textContent='Claude isn’t available in this view, so a simple offline parser handles cues.';}
})();
function prompt(cue){
  return 'You are the AV operator assisting a human broadcast crew during a live hybrid corporate presentation in Hall A (200 seats, remote participants on Google Meet). A crew member ('+myRole+') just called a cue.\n'
  +'Carry it out with the tools, then reply in ONE short line (max 20 words) stating what is now true according to the read-backs.\n'
  +'Rules: every write tool returns verified true/false from the shared read-back. If verified is false, say plainly what did not take; never claim success without a verified read-back. '
  +'You cannot control HUSH; if asked to cut everything, say HUSH belongs to the humans. Ending the stream only requests confirmation from the crew; say it is waiting. '
  +'Tools refuse controls the cuer\'s role does not own; if one refuses, say who owns it. '
  +'If the cue is ambiguous or risky, change nothing and ask one short question. Levels in dB, faders -60 to +10, 0 is unity. "Mic two" means aud2.\n'
  +'Channels: pres (Presenter lav), aud1 and aud2 (audience handhelds), remote (Meet return, remote voices in the room), play (video playback).\n'
  +'Lights: scenes are linked, so recall_scene moves audio, camera and the matching light cue together. Use set_lights for a lights-only cue or one submaster (house, wash, key, cyc, in %). Light fades take seconds; tools wait and verify the output. You cannot control Blackout; if asked, say Blackout belongs to the humans.\n'
  +'Current read-back: '+JSON.stringify(snapshot())+'\n\nCue: "'+cue.replace(/"/g,"'")+'"';
}
const ERR={not_granted:'Claude was not allowed for this page. Using the offline parser.',rate_limited:'Too many cues at once. Wait a moment and send again.',session_expired:'Sign in to Claude again, then resend.',refused:'Claude declined that cue. Rephrase it.',upstream_error:'Connection hiccup. Send the cue again.'};
async function sendCue(cue){
  cue=cue.trim(); if(!cue){toast('Cue Claude','Type a cue or tap one of the examples first.');$('#cueInput').focus();return;}
  if(!canWrite){toast('Read only','Ask the owner for edit access to cue the desk.');return;}
  addLog('DIR','Cue: '+cue,myRole,'you');
  if(!sample){replyEl.textContent='Working…';go.disabled=true;try{replyEl.textContent=await offline(cue);}finally{go.disabled=false;}return;}
  ctl=new AbortController(); go.disabled=true; stopBtn.hidden=false; replyEl.textContent='Thinking…';
  try{
    const {text}=await sample(prompt(cue),{tools,modelTier:'quick',signal:ctl.signal,onText:({text})=>{replyEl.textContent=text.split('\n').filter(Boolean).pop()||text;}});
    replyEl.textContent=text.split('\n').filter(Boolean).pop()||text;
  }catch(e){
    if(e&&e.code==='cancelled')replyEl.textContent='Stopped. Anything already sent stays done; check the log.';
    else if(e&&['not_granted','sampling_disabled','tools_unavailable','capability_disabled','not_declared'].includes(e.code)){sample=null;setClaude(false,'Offline parser');replyEl.textContent=(ERR[e.code]||'Claude is unavailable here.')+' '+await offline(cue);}
    else replyEl.textContent=ERR[e&&e.code]||ERR.upstream_error;
  }finally{go.disabled=false;stopBtn.hidden=true;ctl=null;}
}
stopBtn.addEventListener('click',()=>ctl&&ctl.abort());
$('#cueForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#cueInput').value;$('#cueInput').value='';sendCue(v);});
const CHIPS=['Presentation','Q&A, open audience mic two','House lights to half','Remote voices up 3 dB','Lights to the walk-in look','Camera on the audience','Close the audience mics','Break','Kill everything','Blackout','We’re done, end the stream'];
const chips=$('#chips');
for(const c of CHIPS){const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=c;b.addEventListener('click',()=>sendCue(c));chips.append(b);}

renderSheet();
/* momentary keys: light while held, release on lift, never latch */
const MOM='.callbtn[data-call="Clear"],.chip,.send,.claim,.act:not(.danger)';
document.addEventListener('pointerdown',e=>{const k=e.target.closest(MOM);if(!k||k.disabled)return;k.classList.add('pressed');k.dataset.down=Date.now();});
const release=e=>{document.querySelectorAll('.pressed').forEach(k=>{const held=Date.now()-(+k.dataset.down||0);setTimeout(()=>k.classList.remove('pressed'),Math.max(0,140-held));});};
['pointerup','pointercancel','blur'].forEach(ev=>(ev==='blur'?window:document).addEventListener(ev,release));

/* Desktop console: call-sheet drawer + keyboard shortcuts (no dragging needed) */
const sheetBtn=$('#sheetToggle');
function setSheet(open){document.body.classList.toggle('sheetOpen',open);sheetBtn.setAttribute('aria-expanded',String(open));sheetBtn.textContent=open?'Close call sheet':'Call sheet';}
sheetBtn.addEventListener('click',()=>setSheet(!document.body.classList.contains('sheetOpen')));
addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tag=(e.target&&e.target.tagName)||''; const typing=/INPUT|SELECT|TEXTAREA/.test(tag)&&e.target.type!=='range'&&e.target.type!=='checkbox';
  if(e.key==='Escape'){if(document.body.classList.contains('sheetOpen'))setSheet(false);if(typing)e.target.blur();return;}
  if(typing)return;
  const k=e.key.toLowerCase(); let el=null;
  if(/^[1-5]$/.test(k))el=document.querySelectorAll('#stripList .mute')[+k-1];
  else if('qwer'.includes(k)&&k.length===1)el=document.querySelector('#presetRow .sel[data-k="'+['walkin','presentation','qa','brk']['qwer'.indexOf(k)]+'"]');
  else if('sghc'.includes(k)&&k.length===1)el=document.querySelector('.callbtn[data-call="'+{s:'Standby',g:'Go',h:'Hold',c:'Clear'}[k]+'"]');
  else if(k==='l')el=$('#lxGo');
  else if(k==='/'){e.preventDefault();$('#cueInput').focus();return;}
  if(el){e.preventDefault();el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.click();setTimeout(()=>document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true})),120);}
});
render();
addLog('CORE','Design running · Presentation scene loaded','');
})();
if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));}
