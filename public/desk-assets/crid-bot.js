/* CRID — OTOLORIN's "mini me" (Bitmoji). Same createCridBot() API and behaviour as the robot:
   pose/gesture engine, summon/dismiss/cancel flights, reactions, observe, PAID/DUE verdict tag,
   on/doze/dead, is-active/music-playing.

   Sprite: ./desk-assets/crid/body-<shape>-r7.png. Shapes lean -> fattest: 3, 0, 5, 1, 2.
   Growth: every sub moves him up a notch. SUB_STEPS is where each body shape takes over, and
   between shapes he widens a little (STAGE_STRETCH) so every single sub is visible. The size is
   worked out from the sub total each time, so an overlay reload mid-stream restores it.
   Feed it with observe(state) where state.bot.subs is the sub count this stream, or call setSubs(n). */
const NS="http://www.w3.org/2000/svg",PAL={onyx:"#151B23",screen:"#0D1117",edge:"#143B5D",indigo:"#2868A6",indigoDk:"#143B5D",mint:"#86F6BC",bone:"#F3F2F0",ink:"#F3F2F0",red:"#FF453A",dead:"#5E6570"},
DOZE_AFTER_MS=12e4,BODIES=[3,0,5,1,2],ROT=7,ASSETS="./desk-assets/crid",AV=b=>`${ASSETS}/body-${b}-r${ROT}.png`,
SUB_STEPS=[0,1,2,3,4],STAGE_STRETCH=.18,
el=(t,a={},...k)=>{const e=document.createElementNS(NS,t);for(const[n,v]of Object.entries(a))e.setAttribute(n,v);for(const c of k)c&&e.append(c);return e},
clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n)),rand=(lo,hi)=>lo+Math.random()*(hi-lo),
stageFor=n=>{n=Math.max(0,n|0);let i=0;for(let k=0;k<SUB_STEPS.length;k++)if(n>=SUB_STEPS[k])i=k;
  const last=i===SUB_STEPS.length-1,frac=last?clamp((n-SUB_STEPS[i])/35,0,1):(n-SUB_STEPS[i])/(SUB_STEPS[i+1]-SUB_STEPS[i]),
  sx=1+STAGE_STRETCH*(i+frac)/(SUB_STEPS.length-1);return{i,sx,sy:1+(sx-1)*.55}},
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
pushup:[{pr:-62},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-72,by:-1},{pr:-83,by:3},{pr:-60},{pr:0,by:0}]};
SEQ.sub=[...SEQ.cheer.slice(0,-1).map(f=>({...f,tag:"+SUB"})),...SEQ.pushup];
function draw(){
  const sticker={fill:PAL.bone,stroke:PAL.bone,"stroke-width":9,"stroke-linejoin":"round","stroke-linecap":"round"};
  const svg=el("svg",{viewBox:"-6 -4 160 168","aria-hidden":"true",focusable:"false"});
  const shadow=el("ellipse",{class:"shadow",cx:70,cy:159,rx:34,ry:5,fill:PAL.indigoDk});
  const avatar=el("image",{class:"avatar",x:18,y:18,width:112,height:142,preserveAspectRatio:"xMidYMax meet"});
  const ph=el("g",{class:"ph",display:"none"},
    el("path",{d:"M44 152C44 110 56 92 70 92C84 92 96 110 96 152Z",fill:PAL.indigo,stroke:PAL.bone,"stroke-width":5,"stroke-linejoin":"round"}),
    el("circle",{cx:70,cy:56,r:21,fill:PAL.indigo,stroke:PAL.bone,"stroke-width":5}),
    el("circle",{cx:63,cy:54,r:2.8,fill:PAL.mint}),el("circle",{cx:77,cy:54,r:2.8,fill:PAL.mint}));
  const figG=el("g",{class:"fig"},avatar,ph),bodyG=el("g",{class:"body"},figG);
  const ticket=el("g",{class:"ticket",opacity:0});
  const tkFill=[el("path",{d:"M79 4H151V30H79Z",fill:PAL.red,class:"ticket-fill"}),el("path",{d:"M88 30L86 38L99 30Z",fill:PAL.red,class:"ticket-fill"})];
  const ticketText=el("text",{x:115,y:22,"text-anchor":"middle","font-size":15.5,"font-weight":800,"letter-spacing":.35,fill:PAL.onyx,"font-family":"ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace"});
  ticketText.textContent="";
  ticket.append(el("path",{d:"M79 4H151V30H79ZM88 30L86 38L99 30Z",...sticker,"stroke-width":6}),...tkFill,ticketText);
  svg.append(shadow,bodyG,ticket);
  return{svg,parts:{ticket,ticketText,tkFill,shadow,bodyG,figG,avatar,ph}};
}
const CSS=`
#crid-bot{--bw:clamp(84px,10vw,160px);--bx:50%;--by:auto;position:fixed;z-index:27;width:var(--bw);aspect-ratio:160/168;pointer-events:none;
  left:var(--bx);margin-left:calc(var(--bw)/-2);bottom:calc(var(--m,16px) + env(safe-area-inset-bottom,0px));top:auto;
  transition:left .9s cubic-bezier(.2,.8,.2,1),top .9s cubic-bezier(.2,.8,.2,1),bottom .9s cubic-bezier(.2,.8,.2,1),width .6s ease,transform .18s ease}
#crid-bot.pos-bl{--bx:calc(var(--m,16px) + 12em);margin-left:0}
#crid-bot.pos-br{left:auto;margin-left:0;right:calc(var(--m,16px) + var(--identity-w,24em) + .6em)}
#crid-bot.pos-custom{left:var(--bx);top:var(--by);bottom:auto;right:auto;margin-left:calc(var(--bw)/-2)}
#crid-bot.roam{margin-left:calc(var(--bw)/-2);right:auto;bottom:auto;transition:none}
#crid-bot svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(3px 4px 0 ${PAL.indigoDk})}
html.low-power #crid-bot svg,html.swae #crid-bot svg{filter:none}
#crid-bot[data-mode="dead"] .ticket-fill{fill:${PAL.dead}}
#crid-bot[data-mode="dead"] .avatar{opacity:.55}
#crid-bot[data-mode="doze"] .avatar{opacity:.88}
#crid-bot .crid-event-tag{position:absolute;left:calc(100% + .24em);bottom:62%;max-width:min(10em,38vw);box-sizing:border-box;
  padding:.3em .52em;border:.14em solid var(--danger,#FF5B57);border-radius:.38em;background:var(--onyx-950,#0D1117);
  color:var(--ink-1,#F3F2F0);font:800 clamp(11px,1.05vw,15px)/1.1 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:.12em .15em 0 var(--indigo-700,#143B5D);opacity:0;visibility:hidden;
  transform:translateY(2px);transition:opacity .12s ease,transform .12s ease;pointer-events:none}
#crid-bot .crid-event-tag.is-visible{opacity:1;visibility:visible;transform:none}
`;
export function createCridBot({root=document.body,swae=!1,lowPower=!1,position="bc",x=null,y=null,step=null}={}){
  if(!document.getElementById("crid-bot-css")){const st=document.createElement("style");st.id="crid-bot-css",st.textContent=CSS,document.head.append(st)}
  const STEP=step!=null?step:swae?220:lowPower?260:140,JOB_STEP=step!=null?step:swae?90:STEP,reduced=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches,{svg,parts}=draw(),host=document.createElement("div");
  host.id="crid-bot",host.setAttribute("aria-hidden","true"),host.dataset.mode="on";
  const banner=document.createElement("div");banner.className="crid-event-tag";banner.hidden=!0;banner.setAttribute("aria-hidden","true");
  if(x!=null&&y!=null){host.classList.add("pos-custom");host.style.setProperty("--bx",`${x}%`);host.style.setProperty("--by",`${y}%`)}
  else if(position=="bl"||position=="br")host.classList.add(`pos-${position}`);
  const homeCls=[...host.classList].filter(c=>c.startsWith("pos-"));
  host.append(svg,banner); root.append(host);
  if(!swae&&!lowPower)for(const b of BODIES){const im=new Image();im.src=AV(b)}
  parts.avatar.addEventListener("error",()=>{parts.avatar.setAttribute("display","none");parts.ph.removeAttribute("display")});
  parts.avatar.addEventListener("load",()=>{parts.ph.setAttribute("display","none");parts.avatar.removeAttribute("display")});
  let mode="on",tagText=null,talking=!1,grooving=!1,tickN=0,wait=6,idleQ=[],gestureQ=[],timer=null,frozen=!1,dying=!1,bannerTimer=null;
  const pendingReact=[]; let lastActive=Date.now(),prev=null,online=!0,lastReactN=null,lastSubN=null,bodyI=-1,growth={sx:1,sy:1},fx=1,walk=null,roamN=0,subs=0;
  const jobs=[]; let running=null; const flights=new WeakMap; let lastDrawn="";
  const setBody=i=>{if(i===bodyI)return; bodyI=clamp(i,0,BODIES.length-1); const src=AV(BODIES[bodyI]); parts.avatar.setAttribute("href",src);};
  const showBanner=label=>{const value=String(label||"").trim();if(!value)return;banner.textContent=value.slice(0,28);banner.hidden=!1;banner.classList.add("is-visible");clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>{banner.classList.remove("is-visible");banner.hidden=!0},3000)};
  const subCount=s=>{const b=s&&s.bot||{}; const n=b.subs??b.subCount??b.subN; return Number.isFinite(n)?n:null};
  const applySubs=(n,beat)=>{subs=Math.max(0,n|0); const st=stageFor(subs); setBody(st.i); growth={sx:st.sx,sy:st.sy}; lastDrawn="";
    if(beat&&mode!=="dead"&&!dying){if(mode==="doze"){mode="on";lastActive=Date.now()} showBanner("+SUB");play(SEQ.sub,{urgent:!0}); lastActive=Date.now()}};
  const pct=r=>({x:(r.left+r.width/2)/innerWidth*100,y:r.top/innerHeight*100,h:r.height/innerHeight*100});
  const startWalk=(tx,ty)=>{if(reduced||mode!=="on"||walk)return; const r=pct(host.getBoundingClientRect());
    host.classList.remove(...homeCls); host.classList.add("roam"); host.style.left=`${r.x}%`; host.style.top=`${r.y}%`;
    walk={x:r.x,y:r.y,tx:clamp(tx,8,92),ty:clamp(ty,50,100-r.h-2),done:0}};
  const advanceWalk=()=>{if(!walk)return; if(walk.done>0){if(--walk.done===0)goHome(); return} const dx=walk.tx-walk.x,dy=walk.ty-walk.y;
    if(Math.hypot(dx,dy)<1.2){walk.done=Math.round(2600/STEP); return} fx=dx<0?-1:1; walk.x+=dx*.34; walk.y+=dy*.34; host.style.left=`${walk.x}%`; host.style.top=`${walk.y}%`};
  const goHome=()=>{if(!walk)return; walk=null; fx=1; gestureQ=[]; host.classList.remove("roam"); host.style.left=host.style.top=""; host.classList.add(...homeCls)};
  const crawlScreen=()=>{const pts=[[14,88],[40,82],[72,88],[52,84]]; roamN=(roamN+1)%pts.length; startWalk(...pts[roamN])};
  const render=p=>{
    const sig=JSON.stringify(p)+bodyI; if(sig===lastDrawn)return; lastDrawn=sig;
    const plank=Math.abs(Math.sin(p.pr*Math.PI/180)),L=(p.hr*.8+p.pr)*p.fx,k=1-.16*plank,shift=plank*60*p.fx;
    parts.ticketText.textContent=p.tag||""; parts.ticket.setAttribute("opacity",p.tag?1:0);
    const tkc=p.tag==="PAID"||p.tag==="+SUB"?PAL.mint:PAL.red; for(const n of parts.tkFill)n.setAttribute("fill",tkc);
    parts.bodyG.setAttribute("transform",`translate(0 ${p.by}) translate(70 160) scale(${(1+(1-p.bs)*.6).toFixed(3)} ${p.bs}) translate(-70 -160)`);
    parts.figG.setAttribute("transform",`translate(${(shift+p.gx*.4).toFixed(2)} ${(p.hy*.6-plank*14).toFixed(2)}) translate(70 158) rotate(${L.toFixed(2)}) scale(${(p.fx*p.sx*k).toFixed(3)} ${(p.sy*k).toFixed(3)}) translate(-70 -158)`);
    const lift=clamp(1+Math.min(p.by,0)/70,.45,1);
    parts.shadow.setAttribute("transform",`translate(${(shift*.55).toFixed(2)} 0) translate(70 159) scale(${((1+plank*.8)*lift*p.sx).toFixed(3)} 1) translate(-70 -159)`);
    host.dataset.mode=mode;
  };
  const compose=frame=>{const p={...REST[mode],tag:tagText,fx,sx:growth.sx,sy:growth.sy,...(frame||{})}; if(!frame&&mode==="doze")p.hr=[3,5,7,5][Math.floor(tickN/3)%4]; if(grooving&&mode==="on"&&!frame){p.hr=tickN%4<2?-3:3;p.hy=tickN%2?2:0} return p};
  const pickIdle=()=>{const r=Math.random(); if(mode==="doze") return r<.5?[{led:"on"},{led:"dim"}]:SEQ.blink;
    if(r<.18)return SEQ.blink; if(r<.26)return SEQ.doubleBlink; if(r<.34)return rand(0,1)<.5?SEQ.glanceL:SEQ.glanceR;
    if(r<.42)return SEQ.lookUp; if(r<.5)return SEQ.sway; if(r<.58)return SEQ.read; if(r<.66)return SEQ.hop;
    if(r<.74)return SEQ.jump; if(r<.82)return SEQ.sit.concat(SEQ.stand); if(r<.9)return SEQ.crawl; if(r<.95)return SEQ.ledBlink; return SEQ.shrug};
  const tick=()=>{if(frozen)return; timer=setTimeout(tick,(running||jobs.length||gestureQ.length)?JOB_STEP:STEP); tickN++; if(walk&&(jobs.length||running))goHome(); advanceJob(); advanceWalk();
    let frame=null; if(walk&&!walk.done&&!gestureQ.length)gestureQ.push(...SEQ.crawl);
    if(gestureQ.length)frame=gestureQ.shift(); else if(mode!=="dead"){if(!idleQ.length&&!walk&&--wait<=0){const q=pickIdle(); if(q===SEQ.crawl){crawlScreen();idleQ=[]}else idleQ=[...q]; wait=Math.round(rand(3,9)*(mode==="doze"?1.8:1)*(220/STEP))} frame=idleQ.shift()||null; if(mode==="on"&&Date.now()-lastActive>DOZE_AFTER_MS)setMode("doze")}
    render(compose(frame)); if(dying&&!gestureQ.length){mode="dead";dying=!1}else if(!running&&!jobs.length&&!gestureQ.length&&pendingReact.length)play(SEQ[pendingReact.shift()]||[])};
  const nudge=()=>{if(!swae||frozen)return;clearTimeout(timer);timer=setTimeout(tick,JOB_STEP)};
  const play=(frames,{urgent=!1}={})=>{if(reduced)return; if(urgent)gestureQ=[]; gestureQ.push(...frames);nudge()};
  function setMode(next){if(next===mode&&!dying)return; const was=mode; idleQ=[]; if(next!=="on")goHome(); if(next==="dead"){if(was==="dead"||dying)return; cancelJobs(); pendingReact.length=0; dying=!0; play(SEQ.die,{urgent:!0}); if(reduced){mode="dead";dying=!1} return} dying=!1; mode=next; if(was==="dead")play(SEQ.wake,{urgent:!0}); lastActive=Date.now()}
  const react=(kind,label)=>{const motion=kind==="gift"||kind==="bits"?"sub":kind;if(mode==="dead"||dying||!SEQ[motion])return;
    if(kind==="sub"||kind==="gift"||kind==="bits")showBanner(label||({sub:"+SUB",gift:"GIFT",bits:"BITS"}[kind]));
    if(mode==="doze"){mode="on";lastActive=Date.now()} if(running||jobs.length){if(pendingReact.length<3)pendingReact.push(motion); return} play(SEQ[motion],{urgent:!0})};
  const centre=r=>({x:r.left+r.width/2,y:r.top+r.height/2});
  const setFlight=(node,f)=>{if(!f){for(const k of["transform","opacity","transition","zIndex","willChange","transformOrigin","visibility"])node.style[k]=""; if(flights.has(node)&&flights.get(node).madeRelative)node.style.position=""; flights.delete(node); return} node.style.transform=`translate(${f.tx}px,${f.ty}px) scale(${f.s}) rotate(${f.r}deg)`; node.style.opacity=f.o; node.style.visibility=f.o===0?"hidden":"visible"};
  const prepare=node=>{const info={madeRelative:!1}; node.style.transition="none"; node.style.willChange="transform"; node.style.transformOrigin="50% 50%"; node.style.zIndex="40"; if(getComputedStyle(node).position=="static"){node.style.position="relative"; info.madeRelative=!0} flights.set(node,info)};
  const pathAt=(from,to,p,s,r,o=1,inward=!1)=>{const arc=Math.sin(Math.PI*p)*46,k=inward?p:1-p; return{tx:(from.x-to.x)*k,ty:(from.y-to.y)*k-arc,s,r,o}};
  const summon=(node,opts={})=>{if(!node||reduced||!(mode==="on"||mode==="doze")||!host.isConnected)return; prepare(node); setFlight(node,{tx:0,ty:0,s:1,r:0,o:0}); jobs.push({kind:"summon",node,opts});nudge()};
  const dismiss=(node,done)=>{if(!node){done==null||done(); return} if(reduced||mode==="dead"||!host.isConnected){done==null||done(); return} prepare(node); jobs.push({kind:"dismiss",node,done});nudge()};
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
  const power=()=>setMode(online?"on":"dead");
  const observe=s=>{var _a,_b,_c; if(!s)return; const on=s.bot?s.bot.on!==!1:!0; if(on!==online){online=on;power()}
    const reaction=s.bot?.react||{},reactN=(_c=(_b=(_a=s.bot)==null?void 0:_a.react)==null?void 0:_b.n)!=null?_c:0,sn=subCount(s);
    if(!online){lastReactN=reactN;if(sn!=null){lastSubN=sn;applySubs(sn,!1)}prev=s;return}
    let engagementChanged=!1;if(lastReactN===null)lastReactN=reactN; else if(reactN!==lastReactN){lastReactN=reactN;engagementChanged=["sub","gift","bits"].includes(reaction.kind);react(reaction.kind,reaction.label)}
    if(sn!=null){if(lastSubN===null){lastSubN=sn;applySubs(sn,!1)}else if(sn!==lastSubN){const up=sn>lastSubN;lastSubN=sn;applySubs(sn,up&&!engagementChanged)}}
    if(talking&&mode==="on"&&tickN%9===0)play(SEQ.read);
    if(activityOf(s)){lastActive=Date.now(); if(mode==="doze"){mode="on";play([{eyes:"wide",mouth:"o",hy:-2},{eyes:"open",mouth:"flat",hy:0}],{urgent:!0})}}
    const verdict=s.crid?s.crid.verdict:null; tagText=s.crid?(verdict===1?"PAID":"DUE"):null;
    if(prev){const pv=prev.crid?prev.crid.verdict:null; if(verdict===1&&pv!==1)react("paid"); else if(verdict===0&&pv!==0)react("due"); const pollNow=s.poll&&s.poll.active!==!1,pollBefore=prev.poll&&prev.poll.active!==!1; if(pollNow&&!pollBefore)react("think"); else if(!pollNow&&pollBefore&&s.poll&&s.poll.options)react("cheer"); if(s.card&&s.card.confidence==="disputed"&&!(prev.card&&prev.card.id===s.card.id))react("wince")} prev=s};
  const watch=()=>{talking=host.classList.contains("is-active");grooving=host.classList.contains("music-playing")};
  const mo=typeof MutationObserver=="function"?new MutationObserver(watch):null; mo==null||mo.observe(host,{attributes:!0,attributeFilter:["class"]});
  applySubs(0,!1); render(compose(null)); timer=setTimeout(tick,STEP);
  return{el:host,summon,dismiss,cancel,react,observe,setMode,setSubs:n=>{lastSubN=n|0;applySubs(n,!1)},setOnline(v){online=!!v;power()},get mode(){return mode},get subs(){return subs},freeze(pose={}){frozen=!0;clearTimeout(timer); if(pose.mode)mode=pose.mode; if(pose.tag!==void 0)tagText=pose.tag; if(pose.subs!=null)applySubs(pose.subs,!1); lastDrawn=""; render({...REST[mode],tag:tagText,fx:pose.fx||1,sx:growth.sx,sy:growth.sy,...pose})},destroy(){clearTimeout(timer);clearTimeout(bannerTimer); mo==null||mo.disconnect(); cancelJobs(); goHome(); host.remove()}}
}
