/* CRID — OTOLORIN's "mini me" (Bitmoji). Same createCridBot() API and behaviour as the robot:
   pose/gesture engine, summon/dismiss/cancel flights, reactions, observe, PAID/DUE verdict tag,
   on/doze/dead, is-active/music-playing.

Sprite: ./desk-assets/crid/body-<shape>-r7.webp (600x800, downscaled from the 1050x1400 masters:
    the biggest he is ever drawn is 340 CSS px wide, so 600px is ~2.5x the display box and ~1.3x a
    retina one). Shapes lean -> fattest: 000, 00, 3, 0, 5, 1, 2.
   Growth: every sub moves him up a notch. SUB_STEPS is where each body shape takes over, and
   between shapes he widens a little (STAGE_STRETCH) so every single sub is visible. The size is
   worked out from the sub total each time, so an overlay reload mid-stream restores it.
   Feed it with observe(state) where state.bot.subs is the sub count this stream, or call setSubs(n). */
const NS="http://www.w3.org/2000/svg",XLINK="http://www.w3.org/1999/xlink",PAL={onyx:"#1F1736",screen:"#0F0B17",edge:"#3A1D9E",indigo:"#6531F8",indigoDk:"#3A1D9E",mint:"#86F6BC",bone:"#A98BFF",ink:"#F4F0FF",red:"#FF5B57",dead:"#5E5873"},
DOZE_AFTER_MS=12e4,BODIES=["000","00",3,0,5,1,2],ROT=7,ASSETS="./desk-assets/crid",AV=b=>`${ASSETS}/body-${b}-r${ROT}.webp`,
SUB_STEPS=[0,2,5,9,14,21,30],STAGE_STRETCH=.06,
el=(t,a={},...k)=>{const e=document.createElementNS(NS,t);for(const[n,v]of Object.entries(a))e.setAttribute(n,v);for(const c of k)c&&e.append(c);return e},
clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n)),rand=(lo,hi)=>lo+Math.random()*(hi-lo),
stageFor=n=>{n=Math.max(0,n|0);let i=0;for(let k=0;k<SUB_STEPS.length;k++)if(n>=SUB_STEPS[k])i=k;
  const last=i===SUB_STEPS.length-1,frac=last?clamp((n-SUB_STEPS[i])/35,0,1):(n-SUB_STEPS[i])/(SUB_STEPS[i+1]-SUB_STEPS[i]),
  sx=1+STAGE_STRETCH*frac*(last?1.5:1);return{i,sx,sy:1+(sx-1)*.2}},
REST={on:{eyes:"open",gx:0,gy:0,mouth:"flat",hr:0,hy:0,by:0,bs:1,pr:0,mL:"down",mR:"down",led:"on",tr:0},doze:{eyes:"sleep",gx:0,gy:0,mouth:"flat",hr:3,hy:3,by:2,bs:1,pr:0,mL:"limp",mR:"limp",led:"dim",tr:0},dead:{eyes:"x",gx:0,gy:0,mouth:"dead",hr:0,hy:0,by:0,bs:1,pr:-84,mL:"limp",mR:"limp",led:"off",tr:0}},
TALK=["t2","t1","t3","t1","t2","flat"],
SEQ={blink:[{eyes:"half"},{eyes:"closed"},{eyes:"closed"}],doubleBlink:[{eyes:"half"},{eyes:"closed"},{eyes:"open"},{eyes:"half"},{eyes:"closed"}],glanceL:[{gx:-4},{gx:-4},{gx:-4,hr:-2}],glanceR:[{gx:4},{gx:4},{gx:4,hr:2}],lookUp:[{gy:-4,hr:3},{gy:-4,hr:3},{gy:-3}],sway:[{tr:7,hr:3},{tr:-6,hr:-3},{tr:3,hr:2}],ledBlink:[{led:"dim"},{led:"on"}],shrug:[{hy:-2,by:-2},{hy:-2,by:-2,mL:"wave",mR:"wave"}],
wake:[{led:"on",eyes:"dim",pr:-60},{led:"off",eyes:"spark",pr:-40},{led:"on",eyes:"dim",hy:10,by:14,hr:-6,pr:-18},{eyes:"half",hy:6,by:6,hr:-4,bs:.97},{eyes:"wide",mouth:"o",hy:-3,by:-2,hr:4,tr:9,bs:1.03},{eyes:"open",mouth:"smile",hy:0,by:0,hr:-2,tr:-6,bs:1},{hr:0,tr:3}],
die:[{eyes:"wide",mouth:"o",hy:-3,tr:10,hr:6},{eyes:"wince",mouth:"wavy",hy:2,hr:-8,bs:.97,led:"dim",pr:-20},{eyes:"x",mouth:"dead",hr:0,by:2,bs:.95,led:"off",pr:-60,mL:"limp",mR:"limp"}],
cheer:[{eyes:"happy",mouth:"grin",mL:"up",mR:"up",by:-6,hr:0},{by:0,hr:-5,tr:8},{by:-6,hr:5,tr:-8,mL:"wave"},{by:0,hr:-5,mR:"wave",tr:8},{by:-6,hr:0,mL:"up",mR:"up",tr:0},{eyes:"happy",mouth:"smile",mL:"down",mR:"down",by:0}],
wince:[{eyes:"wince",mouth:"wavy",hr:-6,hy:-2,bs:.95},{hr:-8,tr:12},{hr:-6,tr:-6},{eyes:"half",mouth:"flat",hr:-3,tr:0}],
think:[{gx:4,gy:-4,hr:5},{gx:4,gy:-4,hr:5,tr:10},{gx:-3,gy:-5,hr:4,tr:-8},{gx:4,gy:-4,hr:6},{gx:0,gy:0,hr:0,tr:0}],
surprise:[{eyes:"wide",mouth:"o",hy:-4,tr:14,by:-8},{eyes:"wide",mouth:"o",hy:-2,tr:-10},{eyes:"open",mouth:"flat",hy:0,tr:0,by:0}],
paid:[{eyes:"half",hy:-6,hr:-6,mR:"up"},{eyes:"happy",hy:8,mR:"slam",tag:"PAID",tr:16},{hy:6,mR:"slam",tag:"PAID"},{hy:0,mR:"down",mouth:"grin",tag:"PAID"},{mouth:"smile",tr:0}],
due:[{eyes:"mad",hy:-4,mR:"up"},{eyes:"mad",hy:8,mR:"slam",tag:"DUE",tr:-16},{hy:6,mR:"slam",tag:"DUE"},{hy:0,mR:"down",tag:"DUE"},{eyes:"open",tr:0}],
nod:[{hy:5,hr:2},{hy:0,hr:0}],
wave:[{eyes:"happy",mouth:"smile",mR:"up",hy:-2,hr:3},{mR:"wave",hr:4},{mR:"up",hr:-3},{mR:"wave",hr:4},{mR:"up",hr:-3},{eyes:"happy",mouth:"grin",mR:"up",hr:0},{mR:"down",eyes:"open",mouth:"smile",hy:0,hr:0}],
hop:[{by:-3,bs:.95,hy:2},{by:-14,bs:1.05,hy:-4},{by:2,bs:.93,hy:3},{by:0,bs:1,hy:0}],
jump:[{by:5,bs:.88,hy:4},{by:-30,bs:1.08,hy:-6,mL:"up",mR:"up"},{by:-26,bs:1.06,hy:-4},{by:4,bs:.9,hy:3},{by:0,bs:1,hy:0,mL:"down",mR:"down"}],
sit:[{by:12,hy:6,bs:.9,hr:2},{by:12,hy:6,bs:.9,hr:2},{by:12,hy:6,bs:.9,hr:0}],
stand:[{by:0,hy:0,bs:1,hr:0}],
read:[{gx:4,gy:-2,hr:5,hy:-1,mouth:"flat"},{gx:4,gy:-1,hr:6,hy:-1},{gx:3,gy:-2,hr:4,hy:0}],
crawl:[{pr:-50,by:3,hy:2,bs:.97},{pr:-57,by:0,hy:3,bs:.99},{pr:-50,by:3,hy:2,bs:.97},{pr:-57,by:0,hy:3,bs:.99}],
pushup:[{pr:-62},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-60},{pr:0,by:0}],
climb:[{by:4,bs:0.92},{by:-16,bs:1.06,hy:-4},{by:-8,bs:1.02,hy:-2},{by:0,bs:1,hy:0}],
kick:[{hr:-8,by:2},{hr:14,by:-4,bs:1.04},{hr:-4,by:0,bs:1}],
weighted:[{by:6,bs:0.9},{by:10,bs:0.88},{by:4,bs:0.94},{by:0,bs:1}],
peek:[{hy:-3,hr:4},{hy:-2,hr:2},{hy:0,hr:0}],
sideeye:[{hr:6},{hr:-4},{hr:0}],
salute:[{hy:-4,mR:"up"},{hy:-2},{hy:0,mR:"down"}]};
SEQ.sub=[...SEQ.cheer.slice(0,-1).map(f=>({...f,tag:"+SUB"})),...SEQ.pushup];
function draw(){
  const sticker={fill:PAL.bone,stroke:PAL.bone,"stroke-width":9,"stroke-linejoin":"round","stroke-linecap":"round"};
  const svg=el("svg",{viewBox:"-6 -4 160 168","aria-hidden":"true",focusable:"false"});
  const shadow=el("ellipse",{class:"shadow",cx:70,cy:159,rx:34,ry:5,fill:PAL.indigoDk});
  const avatarBase=el("image",{class:"avatar-base",x:18,y:18,width:112,height:142,preserveAspectRatio:"xMidYMax meet"});
  const avatarEyes=el("image",{class:"avatar-eyes",x:48,y:40,width:44,height:22,preserveAspectRatio:"xMidYMid meet"});
  const avatarMouth=el("image",{class:"avatar-mouth",x:54,y:62,width:32,height:24,preserveAspectRatio:"xMidYMid meet"});
  const ph=el("g",{class:"ph",display:"none"},
    el("path",{d:"M44 152C44 110 56 92 70 92C84 92 96 110 96 152Z",fill:PAL.indigo,stroke:PAL.bone,"stroke-width":5,"stroke-linejoin":"round"}),
    el("circle",{cx:70,cy:56,r:21,fill:PAL.indigo,stroke:PAL.bone,"stroke-width":5}),
    el("circle",{cx:63,cy:54,r:2.8,fill:PAL.mint}),el("circle",{cx:77,cy:54,r:2.8,fill:PAL.mint}));
  const figG=el("g",{class:"fig"},avatarBase,avatarEyes,avatarMouth,ph),bodyG=el("g",{class:"body"},figG);
  const ticket=el("g",{class:"ticket",opacity:0});
  const tkFill=[el("path",{d:"M100 4H138V22H100Z",fill:PAL.red,class:"ticket-fill"}),el("path",{d:"M108 22L106 31L118 22Z",fill:PAL.red,class:"ticket-fill"})];
  const ticketText=el("text",{x:119,y:17.2,"text-anchor":"middle","font-size":10.5,"font-weight":800,"letter-spacing":.6,fill:PAL.onyx,"font-family":"ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace"});
  ticketText.textContent="";
  ticket.append(el("path",{d:"M100 4H138V22H100ZM108 22L106 31L118 22Z",...sticker,"stroke-width":6}),...tkFill,ticketText);
  svg.append(shadow,bodyG,ticket);
  return{svg,parts:{ticket,ticketText,tkFill,shadow,bodyG,figG,avatarBase,avatarEyes,avatarMouth,ph}};
}
const CSS=`
/* He is drawn at broadcast size: ~17.5vw is a full torso-and-head read on a 1080p stream, and the
   clamp keeps him off a phone screen's face. --bws is the ?bot.scale= multiplier, so the operator
   can resize him from the URL without a code edit.

   --bot-w is the width actually drawn: that product, capped so a raised scale can never crop him.
   He is anchored by his edge, not his centre, so before this cap growing him pushed him past the
   frame instead of around his spot — at 500x500 and ?bot.scale=2.5 he measured 375px wide starting
   at x=-215, i.e. more than half of him outside the frame. The two caps are the frame's own width
   and height; the height one carries the sprite's 160/168 aspect so the SVG never has to squash. */
#crid-bot{--bw:clamp(150px,17.5vw,340px);--bws:1;--bx:50%;--by:auto;
  --bot-max:min(calc(100vw - 2*var(--m,16px)),calc((100dvh - 2*var(--m,16px))*160/168));
  --bot-w:min(calc(var(--bw)*var(--bws)),var(--bot-max));
  position:fixed;z-index:27;
  width:var(--bot-w);aspect-ratio:160/168;pointer-events:none;
  left:var(--bx);margin-left:calc(var(--bot-w)/-2);top:auto;
  bottom:var(--bot-floor,calc(var(--m,16px) + env(safe-area-inset-bottom,0px)));
  transition:left .9s cubic-bezier(.2,.8,.2,1),top .9s cubic-bezier(.2,.8,.2,1),bottom .9s cubic-bezier(.2,.8,.2,1),width .6s ease,transform .18s ease}
#crid-bot.pos-bl{--bx:calc(var(--m,16px) + 12em);margin-left:0}
/* --bot-right is measured from the lower-third strip itself (place()), because the strip is wider
   than --identity-w by its own padding and border and he must not sit on top of it. The extra cap
   is the room that is actually left of that anchor, so ?bot=br scales the same way. */
#crid-bot.pos-br{left:auto;margin-left:0;right:var(--bot-right,calc(var(--m,16px) + var(--identity-w,24em) + .6em));
  --bot-w:min(calc(var(--bw)*var(--bws)),var(--bot-max),calc(100vw - var(--bot-right,0px) - 2*var(--m,16px)))}
#crid-bot.pos-custom{left:var(--bx);top:var(--by);bottom:auto;right:auto;margin-left:calc(var(--bot-w)/-2)}
#crid-bot.roam{margin-left:calc(var(--bot-w)/-2);right:auto;bottom:auto;transition:none}
/* A soft cast shadow, not a zero-blur offset copy of the silhouette: the hard offset was the single
   biggest thing making him read as a sticker pasted on the frame. */
#crid-bot svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 calc(var(--bot-w)*.028) calc(var(--bot-w)*.07) rgba(15,11,23,.45))}
html.low-power #crid-bot svg,html.swae #crid-bot svg{filter:none}
#crid-bot[data-mode="dead"] .ticket-fill{fill:${PAL.dead}}
#crid-bot[data-mode="dead"] .avatar-base,.avatar-eyes,.avatar-mouth{opacity:.55}
#crid-bot[data-mode="doze"] .avatar-base,.avatar-eyes,.avatar-mouth{opacity:.88}
`;
export function createCridBot({root=document.body,swae=!1,lowPower=!1,position="bc",x=null,y=null,step=null,scale=1}={}){
  if(!document.getElementById("crid-bot-css")){const st=document.createElement("style");st.id="crid-bot-css",st.textContent=CSS,document.head.append(st)}
  const STEP=step!=null?step:swae?220:lowPower?260:140,{svg,parts}=draw(),host=document.createElement("div");
  host.id="crid-bot",host.setAttribute("aria-hidden","true"),host.dataset.mode="dead";
  if(x!=null&&y!=null){host.classList.add("pos-custom");host.style.setProperty("--bx",`${x}%`);host.style.setProperty("--by",`${y}%`)}
  else if(position=="bl"||position=="br")host.classList.add(`pos-${position}`);
  if(Number.isFinite(scale)&&scale>0)host.style.setProperty("--bws",String(clamp(scale,.4,2.5)));
  const homeCls=[...host.classList].filter(c=>c.startsWith("pos-"));
  host.append(svg); root.append(host);
  // Reduced motion is a request for less movement, never for a dead mascot: he keeps breathing and
  // ticking and only the travelling gestures (hops, walks, flights, slams) are cut back. It is read
  // live rather than once, because a browser source (OBS, Swae) can report the preference and can
  // change it without a reload.
  let reduced=!1,lastDrawn="";
  const mq=typeof matchMedia=="function"?matchMedia("(prefers-reduced-motion: reduce)"):null;
  const readMotion=()=>{reduced=!!(mq&&mq.matches)};
  readMotion(); if(mq){const onmq=()=>{readMotion();lastDrawn=""}; mq.addEventListener?mq.addEventListener("change",onmq):mq.addListener&&mq.addListener(onmq)}
  for(const b of BODIES){const im=new Image();im.src=AV(b)}
  parts.avatarBase.addEventListener("error",()=>{parts.avatarBase.setAttribute("display","none");parts.ph.removeAttribute("display")});
  parts.avatarBase.addEventListener("load",()=>{parts.ph.setAttribute("display","none");parts.avatarBase.removeAttribute("display");parts.avatarEyes.removeAttribute("display");parts.avatarMouth.removeAttribute("display")});
  parts.avatarEyes.addEventListener("error",()=>{parts.avatarEyes.setAttribute("display","none")});
  parts.avatarMouth.addEventListener("error",()=>{parts.avatarMouth.setAttribute("display","none")});
  let mode="dead",tagText=null,talking=!1,grooving=!1,tickN=0,wait=6,idleQ=[],gestureQ=[],timer=null,frozen=!1,dying=!1;
  // online is null, not true: "nothing has told me otherwise yet" is a different state from "the
  // desk says he is on". Starting at true made the first observe({bot:{on:true}}) a no-op — it only
  // acts on a flip — so the boot never ran, mode stayed at its "dead" default and the idle loop's
  // `mode!=="dead"` guard skipped every gesture. That was the dead-on-air bug.
  const pendingReact=[]; let lastActive=Date.now(),prev=null,online=null,lastReactN=null,lastSubN=null,bodyI=-1,growth={sx:1,sy:1},fx=1,walk=null,roamN=0,subs=0,home=null;
  const jobs=[]; let running=null; const flights=new WeakMap;
  const failedEyes=new Set(), failedMouth=new Set();
  const setBody=i=>{if(i===bodyI)return; bodyI=clamp(i,0,BODIES.length-1); const src=AV(BODIES[bodyI]); parts.avatarBase.setAttribute("href",src); parts.avatarBase.setAttributeNS(XLINK,"href",src);};
  const subCount=s=>{const b=s&&s.bot||{}; const n=b.subs??b.subCount??b.subN; return Number.isFinite(n)?n:null};
  const applySubs=(n,beat)=>{subs=Math.max(0,n|0); const st=stageFor(subs); setBody(st.i); growth={sx:st.sx,sy:st.sy}; lastDrawn="";
    if(beat&&mode!=="dead"&&!dying){if(mode==="doze"){mode="on";lastActive=Date.now()} play(SEQ.sub,{urgent:!0}); lastActive=Date.now()}};
  let mood="idle";
  let bubbleTimer=null;
  let mischiefTimer=null;
  const WHIMSY_LINES={
    idle:["rent is always due","Omooo","hm.","no notes","I saw that"],
    curious:["what's this then?","new card","hold on—","ooh."],
    delighted:["PAID.","yes!","get in jorr","called it"],
    alarmed:["uh oh","disputed","hm hm","signal's gone"],
    dozing:["zzz","five more","wake me for food"],
    proud:["my desk","tidy.","look at it"],
    cheeky:["wasn't me","oops","just a nudge","you saw nothing"]
  };
  const setMood=(m)=>{if(!WHIMSY_LINES[m])return; mood=m; host.dataset.mood=m; const desk=document.getElementById("desk"); if(desk) desk.dataset.botMood=m;};
  const say=(text,ms=1800)=>{if(!text)return; let b=host.querySelector(".bot-bubble"); if(!b){b=document.createElement("div"); b.className="bot-bubble"; host.append(b);} b.style.transition=reduced?"none":""; b.textContent=text; b.style.opacity="1"; clearTimeout(bubbleTimer); bubbleTimer=setTimeout(()=>{b.style.opacity="0";},ms);};
  const nudge=(node)=>{if(!node||reduced||document.documentElement.classList.contains("swae"))return; node.classList.add("chaos-nudged"); clearTimeout(mischiefTimer); mischiefTimer=setTimeout(()=>node.classList.remove("chaos-nudged"),700);};
  const randomLine=(m=mood)=>{const list=WHIMSY_LINES[m]||WHIMSY_LINES.idle; return list[Math.floor(Math.random()*list.length)];};
  const pct=r=>({x:(r.left+r.width/2)/innerWidth*100,y:r.top/innerHeight*100,h:r.height/innerHeight*100});
  // Where the frame is clear on his side. The lower-third strip is wider than --identity-w by its
  // own padding and border, so its edge is measured rather than inferred from a CSS variable.
  const clearRight=()=>{const t=document.getElementById("auto-headlines"); if(!t)return innerWidth;
    const r=t.getBoundingClientRect(); return r.width>0&&r.height>0?r.left:innerWidth};
  const maxCenterX=()=>{const w=host.offsetWidth||innerWidth*.175; return (clearRight()-w/2-10)/innerWidth*100};
  // The other end of that band: the clock plate. He may cross the centre of the frame, never the
  // clock, so the left bound is measured the same way the right one is.
  const minCenterX=()=>{const c=document.getElementById("time-dock"); if(!c)return 8;
    const r=c.getBoundingClientRect(),w=host.offsetWidth||innerWidth*.175;
    return r.width>0&&r.height>0?(r.right+w/2+10)/innerWidth*100:8};
  // The floor of the frame belongs to the clock and the news ticker. He lives in the centre column,
  // so whatever of that band reaches under him decides where his feet go: on a 1080p frame neither
  // plate reaches the middle and he stands on the frame's own floor, and on a 500x500 Swae box both
  // do, so he stands on top of them instead of behind them. Measured, never inferred from the
  // viewport, because both plates move (the clock lifts on a narrow frame, the ticker lifts and
  // narrows when the dual-cam inset is on) and the composition has to hold either way.
  let floorBottom=0;
  const homeFloor=()=>{
    const w=host.offsetWidth||innerWidth*.175,half=w/2,cx=innerWidth/2;
    const gap=clamp(innerWidth*.008,4,12); let floor=0;
    for(const id of ["time-dock","auto-headlines"]){
      const n=document.getElementById(id); if(!n)continue;
      const r=n.getBoundingClientRect(); if(!(r.width>0&&r.height>0))continue;
      if(r.left<cx+half&&r.right>cx-half) floor=Math.max(floor,innerHeight-r.top+gap);
    }
    return floor};
  // Bottom-right: sit just left of that edge. Re-run whenever the frame or the strip changes size,
  // so a resize, a theme switch or a long headline can never slide him under the ticker.
  const place=()=>{
    if(host.classList.contains("pos-br"))
      host.style.setProperty("--bot-right",`${Math.round(innerWidth-clearRight()+clamp(innerWidth*.012,10,26))}px`);
    floorBottom=homeFloor();
    if(floorBottom>0) host.style.setProperty("--bot-floor",`${Math.round(floorBottom)}px`);
    else host.style.removeProperty("--bot-floor")};
  const startWalk=(tx,ty)=>{if(reduced||mode!=="on"||walk)return;
    // He travels the band between the clock and the strip. When the frame is too narrow for one
    // (a 500px Swae box: the two plates overlap in x) there is nowhere to walk that is not on top
    // of something, so he stays where he is and the idle gestures carry the movement instead.
    const lo=minCenterX(),hi=Math.min(92,maxCenterX()); if(hi<=lo)return;
    const r=pct(host.getBoundingClientRect());
    host.classList.remove(...homeCls); host.classList.add("roam"); host.style.left=`${r.x}%`; host.style.top=`${r.y}%`;
    // He may shuffle along the centre, never across the frame: at broadcast size a full-width
    // crawl would walk him over the lower third and the clock.
    const tyMax=floorBottom?(innerHeight-floorBottom-r.h*innerHeight/100)/innerHeight*100:100-r.h-2;
    walk={x:r.x,y:r.y,tx:clamp(tx,lo,hi),ty:clamp(ty,42,tyMax),done:0}};
  const advanceWalk=()=>{if(!walk)return; if(walk.done>0){if(--walk.done===0)goHome(); return} const dx=walk.tx-walk.x,dy=walk.ty-walk.y;
    if(Math.hypot(dx,dy)<1.2){walk.done=Math.round(2600/STEP); return} fx=dx<0?-1:1; walk.x+=dx*.34; walk.y+=dy*.34; host.style.left=`${walk.x}%`; host.style.top=`${walk.y}%`};
  const goHome=()=>{if(!walk)return; walk=null; fx=1; gestureQ=[]; host.classList.remove("roam"); host.style.left=host.style.top=""; host.classList.add(...homeCls)};
  // A short shuffle around wherever he lives (home is re-read after every landing and on resize),
  // so the crawl reads as him pottering about rather than as a walk across the whole stream.
  const crawlScreen=()=>{if(!home)home=pct(host.getBoundingClientRect());
    const pts=[[-6,1.5],[1.5,-2],[4.5,1],[-2,-2.5]]; roamN=(roamN+1)%pts.length; const [dx,dy]=pts[roamN];
    startWalk(home.x+dx,home.y+dy)};
  const render=p=>{
    // Stamped before the unchanged-pose early return: the mode is the attribute the overlay, the
    // theme's idle animation and any on-air check read, and it must never lag a mode change.
    host.dataset.mode=mode;
    const sig=JSON.stringify(p)+bodyI; if(sig===lastDrawn)return; lastDrawn=sig;
    // Swap expression layers only when state actually changes
    const eyeState=p.eyes||"open";
    if(parts.avatarEyes.dataset.state!==eyeState){
      const src=`${ASSETS}/eyes-${eyeState}.webp`;
      parts.avatarEyes.setAttribute("href",src);
      parts.avatarEyes.setAttributeNS(XLINK,"href",src);
      parts.avatarEyes.dataset.state=eyeState;
    }
    const mouthState=p.mouth||"flat";
    if(parts.avatarMouth.dataset.state!==mouthState){
      const src=`${ASSETS}/mouth-${mouthState}.webp`;
      parts.avatarMouth.setAttribute("href",src);
      parts.avatarMouth.setAttributeNS(XLINK,"href",src);
      parts.avatarMouth.dataset.state=mouthState;
    }
    const plank=Math.abs(Math.sin(p.pr*Math.PI/180)),L=(p.hr*.8+p.pr)*p.fx,k=1-.16*plank,shift=plank*60*p.fx;
    parts.ticketText.textContent=p.tag||""; parts.ticket.setAttribute("opacity",p.tag?1:0);
    const tkc=p.tag==="PAID"||p.tag==="+SUB"?PAL.mint:PAL.red; for(const n of parts.tkFill)n.setAttribute("fill",tkc);
    parts.bodyG.setAttribute("transform",`translate(0 ${p.by}) translate(70 160) scale(${(1+(1-p.bs)*.6).toFixed(3)} ${p.bs}) translate(-70 -160)`);
    // gx used to be scaled by .4 — a 3px glance at the old 104px size, i.e. nothing. A glance now
    // reads as a look: the sprite is the only face he has, so its travel is the expression.
    parts.figG.setAttribute("transform",`translate(${(shift+p.gx*1.15).toFixed(2)} ${(p.hy*.85-plank*14).toFixed(2)}) translate(70 158) rotate(${L.toFixed(2)}) scale(${(p.fx*p.sx*k).toFixed(3)} ${(p.sy*k).toFixed(3)}) translate(-70 -158)`);
    const lift=clamp(1+Math.min(p.by,0)/70,.45,1);
    parts.shadow.setAttribute("transform",`translate(${(shift*.55).toFixed(2)} 0) translate(70 159) scale(${((1+plank*.8)*lift*p.sx).toFixed(3)} 1) translate(-70 -159)`);
  };
  // The sprite is a still drawing, so the only life it has is what the engine moves. Breathing runs
  // under every pose — a slow rise and a 1% swell on a 4.6s cycle — so he is never a frozen image,
  // even between gestures, and even when a gesture frame is playing.
  const breath=()=>Math.sin(tickN*STEP/1000*2*Math.PI/4.6)*(reduced?.35:1);
  const compose=frame=>{const p={...REST[mode],tag:tagText,fx,sx:growth.sx,sy:growth.sy,...(frame||{})};
    if(mode==="on"||mode==="doze"){const br=breath(); p.bs*=(1+.012*br); p.sy*=(1+.007*br); p.hy-=1.1*br}
    if(!frame&&mode==="doze")p.hr=[3,5,7,5][Math.floor(tickN/3)%4]; if(grooving&&mode==="on"&&!frame){p.hr=tickN%4<2?-3:3;p.hy=tickN%2?2:0} return p};
  // Weighted towards the moves that actually read on air: sway, lean, peek, kick, hop. The eye-only
  // sequences (blink, ledBlink) are kept but rare, because on a sprite with a painted face they are
  // nearly invisible at any size.
  const pickIdle=()=>{const r=Math.random(); if(mode==="doze") return r<.5?[{led:"on"},{led:"dim"}]:SEQ.blink;
    if(r<.14)return SEQ.blink; if(r<.2)return SEQ.doubleBlink; if(r<.3)return rand(0,1)<.5?SEQ.glanceL:SEQ.glanceR;
    if(r<.38)return SEQ.peek; if(r<.48)return SEQ.sway; if(r<.55)return SEQ.read; if(r<.63)return SEQ.sideeye;
    if(r<.7)return SEQ.hop; if(r<.77)return SEQ.shrug; if(r<.85)return SEQ.sit.concat(SEQ.stand);
    if(r<.9)return SEQ.kick; if(r<.95)return SEQ.weighted; return SEQ.crawl};
  const tick=()=>{if(frozen)return; timer=setTimeout(tick,STEP); tickN++; if(walk&&(jobs.length||running))goHome(); advanceJob(); advanceWalk();
    let frame=null; if(walk&&!walk.done&&!gestureQ.length)gestureQ.push(...SEQ.crawl);
    if(gestureQ.length)frame=gestureQ.shift(); else if(mode!=="dead"){if(!idleQ.length&&!walk&&--wait<=0){const q=pickIdle(); if(q===SEQ.crawl){crawlScreen();idleQ=[]}else idleQ=[...q]; wait=Math.round(rand(3,9)*(mode==="doze"?1.8:1)*(220/STEP))} frame=idleQ.shift()||null; if(mode==="on"&&Date.now()-lastActive>DOZE_AFTER_MS)setMode("doze")}
    render(compose(frame)); if(dying&&!gestureQ.length){mode="dead";dying=!1}else if(!running&&!jobs.length&&!gestureQ.length&&pendingReact.length)play(SEQ[pendingReact.shift()]||[])};
  // The reduced-motion cut of a sequence: the same beats, without the travel. Anything that moves
  // him across the frame (by, bs, pr) is dropped and what remains is clamped to a twitch, so the
  // loop still ticks and still reads as a character — it just stops throwing him around.
  const calm=frames=>{const seen=new Set(),out=[];
    for(const f of frames){const g={...f}; delete g.by; delete g.bs; delete g.pr;
      if(g.tr!=null)g.tr=clamp(g.tr,-2,2); if(g.hy!=null)g.hy=clamp(g.hy,-1.5,1.5); if(g.hr!=null)g.hr=clamp(g.hr,-2,2);
      const k=JSON.stringify(g); if(!seen.has(k)){seen.add(k); out.push(g)}}
    return out.length?out:[frames[frames.length-1]||{}]};
  const play=(frames,{urgent=!1}={})=>{if(urgent)gestureQ=[]; gestureQ.push(...(reduced?calm(frames):frames))};
  function setMode(next){if(next===mode&&!dying)return; const was=mode; idleQ=[]; if(next!=="on")goHome(); if(next==="dead"){if(was==="dead"||dying)return; cancelJobs(); pendingReact.length=0; dying=!0; play(SEQ.die,{urgent:!0}); if(reduced){mode="dead";dying=!1;host.dataset.mode=mode} return} dying=!1; mode=next; host.dataset.mode=mode; if(was==="dead")play(SEQ.wake,{urgent:!0}); lastActive=Date.now()}
  const react=kind=>{if(mode==="dead"||dying||!SEQ[kind])return; if(mode==="doze"){mode="on";lastActive=Date.now()} if(running||jobs.length){if(pendingReact.length<3)pendingReact.push(kind); return} play(SEQ[kind],{urgent:!0})};
  const centre=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
  const setFlight=(node,f)=>{if(!f){for(const k of["transform","opacity","transition","zIndex","willChange","transformOrigin","visibility"])node.style[k]=""; if(flights.has(node)&&flights.get(node).madeRelative)node.style.position=""; flights.delete(node); return} node.style.transform=`translate(${f.tx}px,${f.ty}px) scale(${f.s}) rotate(${f.r}deg)`; node.style.opacity=f.o; node.style.visibility=f.o===0?"hidden":"visible"};
  const prepare=node=>{const info={madeRelative:!1}; node.style.transition="none"; node.style.willChange="transform"; node.style.transformOrigin="50% 50%"; node.style.zIndex="40"; if(getComputedStyle(node).position=="static"){node.style.position="relative"; info.madeRelative=!0} flights.set(node,info)};
  const pathAt=(from,to,p,s,r,o=1,inward=!1)=>{const arc=Math.sin(Math.PI*p)*46,k=inward?p:1-p; return{tx:(from.x-to.x)*k,ty:(from.y-to.y)*k-arc,s,r,o}};
  const summon=(node,opts={})=>{if(!node||reduced||!(mode=="on"||mode=="doze")||!host.isConnected)return; prepare(node); setFlight(node,{tx:0,ty:0,s:1,r:0,o:0}); jobs.push({kind:"summon",node,opts})};
  const dismiss=(node,done)=>{if(!node){done==null||done(); return} if(reduced||mode=="dead"||!host.isConnected){done==null||done(); return} prepare(node); jobs.push({kind:"dismiss",node,done})};
  const cancel=node=>{for(let i=jobs.length-1;i>=0;i--)if(jobs[i].node===node)jobs.splice(i,1); if(running&&running.node===node)running=null; if(flights.has(node))setFlight(node,null)};
  function cancelJobs(){var _a,_b; for(const j of jobs.splice(0)){setFlight(j.node,null); (_a=j.done)==null||_a.call(j)} if(running){setFlight(running.node,null); (_b=running.done)==null||_b.call(running); running=null}}
  function advanceJob(){var _a,_b,_c; if(!running){if(gestureQ.length||dying||(running=jobs.shift()||null,!running))return; running.i=0; if(!running.node.isConnected){setFlight(running.node,null); (_a=running.done)==null||_a.call(running); running=null; return} running.node.style.transform="none"; running.from=centre(host.getBoundingClientRect()); running.to=centre(running.node.getBoundingClientRect()); running.fast=jobs.length>0}
    const j=running; if(!j.node.isConnected){setFlight(j.node,null); (_b=j.done)==null||_b.call(j); running=null; return}
    const look=clamp((j.to.x-j.from.x)/60,-5,5);
    if(j.kind==="summon"){const F=j.fast?[[{eyes:"mad",hy:4,bs:.95,gx:look},[0,0,0,0,0]],[{eyes:"wide",mouth:"o",mL:"push",mR:"push",hy:-2,bs:1.03,gx:look},[.4,.55,8,1,1]],[{eyes:"open",mouth:"smile",mL:"down",mR:"down",gx:0},[.85,1.05,-2,1,1]]]:[[{eyes:"mad",hy:5,bs:.94,hr:look<0?3:-3,gx:look},[0,0,0,0,0]],[{eyes:"wide",mouth:"o",mL:"up",mR:"up",hy:-3,bs:1.04,gx:look},[.15,.3,-12,1,1]],[{mL:"push",mR:"push",hy:-1},[.45,.62,7,1,1]],[{eyes:"open",mouth:"smile",mL:"down",mR:"down",hy:0,bs:1,hr:0,gx:look*.4},[.78,1.06,-3,1,1]],[{eyes:"happy",mouth:"smile",gx:0},[1,1.02,0,1,1]]];
      if(j.i<F.length){const[bf,[p,s,r,,o]]=F[j.i]; gestureQ=[bf]; if(j.i===0)setFlight(j.node,{tx:0,ty:0,s:.2,r:0,o:0}); else setFlight(j.node,pathAt(j.from,j.to,p,s,r,o)); j.i++; return}
      setFlight(j.node,null); gestureQ=[{eyes:"open",mouth:"smile"}]; running=null; return}
    const D=[[.35,.82,5],[.7,.46,-8],[.95,.16,6]]; if(j.i<D.length){const[p,s,r]=D[j.i]; gestureQ=[{eyes:"wide",mouth:"o",mL:"push",mR:"push",hy:-2}]; setFlight(j.node,pathAt(j.from,j.to,p,s,r,1,!0)); j.i++; return}
    gestureQ=[{eyes:"happy",mouth:"grin",bs:1.04},{eyes:"open",mouth:"smile"}]; setFlight(j.node,null); (_c=j.done)==null||_c.call(j); running=null}
  const activityOf=s=>!!(s&&(s.visible&&s.card||s.poll&&s.poll.active!==!1||s.crid||s.court||s.music&&s.music.current||s.spaces&&s.spaces.length||s.riad&&s.riad.active));
  // null online means "not told yet", and the desk's own default is on, so an unknown state boots
  // him rather than freezing him. Only an explicit bot.on:false kills him.
  const power=()=>setMode(online===!1?"dead":"on");
  const observe=s=>{var _a,_b,_c; if(!s)return; const on=s.bot?s.bot.on!==!1:!0; if(on!==online){online=on;power()} if(online===!1){prev=s; return}
    const reactN=(_c=(_b=(_a=s.bot)==null?void 0:_a.react)==null?void 0:_b.n)!=null?_c:0; if(lastReactN===null)lastReactN=reactN; else if(reactN!==lastReactN){lastReactN=reactN;react(s.bot.react.kind)}
    const sn=subCount(s); if(sn!=null){if(lastSubN===null){lastSubN=sn;applySubs(sn,!1)}else if(sn!==lastSubN){const up=sn>lastSubN;lastSubN=sn;applySubs(sn,up)}}
    if(talking&&mode==="on"&&tickN%9===0)play(SEQ.read);
    if(activityOf(s)){lastActive=Date.now(); if(mode==="doze"){mode="on";play([{eyes:"wide",mouth:"o",hy:-2},{eyes:"open",mouth:"flat",hy:0}],{urgent:!0})}}
    const verdict=s.crid?s.crid.verdict:null; tagText=s.crid?(verdict===1?"PAID":"DUE"):null;
    if(prev){const pv=prev.crid?prev.crid.verdict:null; if(verdict===1&&pv!==1)react("paid"); else if(verdict===0&&pv!==0)react("due"); const pollNow=s.poll&&s.poll.active!==!1,pollBefore=prev.poll&&prev.poll.active!==!1; if(pollNow&&!pollBefore)react("think"); else if(!pollNow&&pollBefore&&s.poll&&s.poll.options)react("cheer"); if(s.card&&s.card.confidence==="disputed"&&!(prev.card&&prev.card.id===s.card.id))react("wince")} prev=s};
  const watch=()=>{talking=host.classList.contains("is-active");grooving=host.classList.contains("music-playing")};
  const mo=typeof MutationObserver=="function"?new MutationObserver(watch):null; mo==null||mo.observe(host,{attributes:!0,attributeFilter:["class"]});
  // Boot him on the way in (the desk default), place him clear of the lower third, and keep the
  // placement honest across resizes and strip content changes.
  applySubs(0,!1); power(); place(); render(compose(null)); timer=setTimeout(tick,STEP);
  let placeFrame=0,stripWatch=null;
  const replace=()=>{home=null; if(placeFrame)return; placeFrame=(typeof requestAnimationFrame=="function"?requestAnimationFrame:setTimeout)(()=>{placeFrame=0; place()},0)};
  if(typeof addEventListener=="function")addEventListener("resize",replace);
  if(typeof ResizeObserver=="function"){const strip=document.getElementById("auto-headlines"); if(strip){stripWatch=new ResizeObserver(replace); stripWatch.observe(strip)}}
  return{el:host,summon,dismiss,cancel,react,observe,setMode,setSubs:n=>{lastSubN=n|0;applySubs(n,!1)},setOnline(v){online=!!v;power()},get mode(){return mode},get subs(){return subs},setMood,say,nudge,randomLine,place:replace,freeze(pose={}){frozen=!0;clearTimeout(timer); if(pose.mode)mode=pose.mode; if(pose.tag!==void 0)tagText=pose.tag; if(pose.subs!=null)applySubs(pose.subs,!1); lastDrawn=""; render({...REST[mode],tag:tagText,fx:pose.fx||1,sx:growth.sx,sy:growth.sy,...pose})},destroy(){clearTimeout(timer); mo==null||mo.disconnect(); stripWatch==null||stripWatch.disconnect(); if(typeof removeEventListener=="function")removeEventListener("resize",replace); cancelJobs(); goHome(); host.remove()}}
}
