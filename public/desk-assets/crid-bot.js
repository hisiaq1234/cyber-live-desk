/* CRID — OTOLORIN's "mini me" (Bitmoji). Same createCridBot() API and behaviour as the robot:
   pose/gesture engine, summon/dismiss/cancel flights, reactions, observe, PAID/DUE verdict tag,
   on/doze/dead, is-active/music-playing.

   Sprite: ./desk-assets/crid/body-<body>-r0.webp — the 1050x1400 render Snapchat's preview API
   gives for this avatar at rotation 0, shipped at that size. He is drawn 340 CSS px wide by
   default and up to 850 at ?bot.scale=2.5, on a screen that may be retina, so a frame is never
   smaller than what the display asks for. Bodies lean -> heavy: 3, 0, 4, 5, 1, 11, 2. Each
   frame is a COMPLETE drawing with its own painted face, so he is drawn as one layer. The
   eyes-<state>/mouth-<state> frames were never registered to these bodies (a different scale and
   position, squeezed into a 44x22 box over a face that already has eyes) and produced a second
   ghost face; those unregistered frames have been removed. Emotion therefore comes from a
   body swap + a motion beat + a hold — see FEEL.
   BODY LADDER: seven frames, and they are seven builds of ONE render — the distinct builds Snap's
   own body= parameter gives at rotation 0 (3/0/4/5/1/11/2 lean -> heavy; every other value returns
   one of these same pictures), fetched and framed by scripts/build-body-ladder.py. The pose, the
   base body and the head are therefore the same pixels in all seven and only the build changes:
   480x1190 px of ink leanest, 592x1191 heaviest. The six lighter builds differ mostly in mass —
   Snap gives them nearly the same silhouette width — so the stage order is proven on ink area in
   ladder.json, not on width. All seven keep one framing: ink bottom on y=1325 and the mid-torso on
   x=560, so a swap is a change of build, never a jump sideways or off the floor. ladder.json next
   to the frames holds the measured box of each stage.
   Growth: every sub moves him up a notch. SUB_STEPS is where each stage takes over, and between
   stages he widens a little (STAGE_STRETCH) so every single sub is visible. The size is worked out
   from the sub total each time, so an overlay reload mid-stream restores it. The build also drives
   how he moves — see BODY_LADDER.slow and .heft, used by the walk, the gait and the gesture weight.
   Feed it with observe(state) where state.bot.subs is the sub count this stream, or call setSubs(n). */
import{RIGS}from"./crid/rig.mjs";
import{BODY_LADDER,FRAME}from"./crid/ladder.mjs";
import{initCrid3D}from"./crid-3d.js";
import{createWorld}from"./physics.mjs";
import{createBeing}from"./being.mjs";
import{createStage}from"./stage.mjs";
const NS="http://www.w3.org/2000/svg",XLINK="http://www.w3.org/1999/xlink",PAL={onyx:"#1F1736",screen:"#0F0B17",edge:"#3A1D9E",indigo:"#6531F8",indigoDk:"#3A1D9E",mint:"#86F6BC",bone:"#A98BFF",ink:"#F4F0FF",slate:"#2B2738",red:"#FF5B57",dead:"#5E5873"},
DOZE_AFTER_MS=12e4,BODIES=["3","0","4","5","1","11","2"],ROT=0,ASSETS="./desk-assets/crid",AV=b=>`${ASSETS}/body-${b}-r${ROT}.webp`,
SUB_STEPS=[0,4,8,12,16,20,24],STAGE_STRETCH=.03,
// The ladder, in BODIES order: the measured ink box of each frame (w x h) and what that build does
// to his movement. slow stretches every step he takes, heft is his weight in a gesture — a heavy
// Shared measured geometry is generated into ./crid/ladder.mjs; subscription thresholds and BODIES order remain here.
  stageOf=i=>BODY_LADDER[Math.min(BODY_LADDER.length-1,Math.max(0,i|0))],
// The eight micro-emotions from brain/micro-emotions.mjs. A painted face cannot be swapped, so a
// feeling is a whole drawing that changes and is moved well: a different body, one of the gesture
// sequences, and how long he stays in that body before his own weight takes it back. No two triples
// are the same. The bodies are the builds the ladder has (3 leanest, 2 heaviest) and he
// only ever borrows one next to his own, so a feeling changes his stance, never his size.
FEEL={curious:{body:"1",seq:"peek",hold:1500},delighted:{body:"0",seq:"hop",hold:1300},
  smug:{body:"1",seq:"sideeye",hold:1900},flustered:{body:"2",seq:"wince",hold:1200},
  sleepy:{body:"1",seq:"sit",hold:2400},startled:{body:"2",seq:"surprise",hold:1000},
  proud:{body:"0",seq:"nod",hold:1700},sulky:{body:"1",seq:"shrug",hold:2100}},
// Measured ink box of the three body frames (1050x1400): the feet stop at y=1325, so a frame drawn to
// the box edge leaves him hovering ~5% of his height over the floor. The sprite is drawn so the feet
// land exactly on the box bottom, which is the floor band at every ?bot.scale= — the shadow is a
// filter on the same drawing, so it tracks him.
INK_BOTTOM=1325/1400,FIG_H=142,FIG_W=FIG_H*.75,FIG_X=74-FIG_W/2,FIG_Y=164-INK_BOTTOM*FIG_H,
el=(t,a={},...k)=>{const e=document.createElementNS(NS,t);for(const[n,v]of Object.entries(a))e.setAttribute(n,v);for(const c of k)c&&e.append(c);return e},
clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n)),rand=(lo,hi)=>lo+Math.random()*(hi-lo),
stageFor=n=>{n=Math.max(0,n|0);let i=0;for(let k=0;k<SUB_STEPS.length;k++)if(n>=SUB_STEPS[k])i=k;
  // The stretch runs across the whole ladder, not inside each stage: the three builds are only a
  // few px apart at the bottom of it (Snap has one average build), so a per-stage ramp that resets
  // at every stage boundary made him visibly shrink on the step up. One ramp only ever grows.
  const frac=clamp(n/SUB_STEPS[SUB_STEPS.length-1],0,1)*1.5,
  sx=1+STAGE_STRETCH*frac;return{i,sx,sy:1+(sx-1)*.2}},
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
hop:[{by:5,bs:.9,hy:3},{by:-3,bs:.95,hy:2},{by:-14,bs:1.05,hy:-4},{by:2,bs:.93,hy:3},{by:0,bs:1,hy:0}],
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
// gift and bits were advertised in BOT_REACTS with no sequence behind them, so a gifted sub or a
// cheer of bits played nothing at all. Both are built from moves he already has: a gift is offered
// up in two hands and set down, bits are a quick coin-flick shiver.
gift:[{eyes:"happy",mouth:"grin",mL:"up",mR:"up",by:-4,hy:-2,hr:0},{by:-10,hy:-4,mL:"up",mR:"up",tr:6},{by:2,bs:.95,hy:2,mL:"up",mR:"up",tr:-6},{by:0,bs:1,hy:0,mL:"down",mR:"down",mouth:"smile",tr:0}],
bits:[{hr:-4,hy:-2,tr:8,bs:1.03},{hr:5,hy:1,tr:-8,bs:.97},{hr:-2,hy:-1,tr:4},{hr:0,hy:0,tr:0,bs:1}],
salute:[{hy:-4,mR:"up"},{hy:-2},{hy:0,mR:"down"}],
// The bag beats (docs/specs/backpack.md). The __bag marker is picked up by the tick loop the
// same way __cueEnd is: the frame plays as a pose and the marker does the prop's physics.
dropbag:[{by:6,bs:.92,hy:2,mR:"down"},{mR:"up",hy:-3,hr:-4,eyes:"open"},{mR:"down",hy:1,hr:3,tr:8,by:2},{__bag:"drop",eyes:"open",hy:0,hr:0,tr:0}],
pickup:[{by:10,hy:4,bs:.92,eyes:"open"},{by:12,mR:"down",hr:2},{__bag:"wear",by:0,bs:1,hy:0,hr:0,tr:0}]};
SEQ.sub=[...SEQ.cheer.slice(0,-1).map(f=>({...f,tag:"+SUB"})),...SEQ.pushup];
// Everything he can be told to do in one word: every sequence, every micro-emotion, and "say" for
// a line of text. The desk overlay and the server both hold this list (api/_desk-core.mjs BOT_CUES);
// tests/cue-channel.test.mjs keeps the two identical, so a name can never be accepted by one end
// and dropped by the other.
export const CUE_NAMES=[...Object.keys(SEQ),...Object.keys(FEEL),"say"];
function draw(){
  // Nothing attached to him carries a colour of its own: the ticket outline is the desk's ink, not
  // the theme's lavender, and the fallback figure is neutral slate. He used to sit on a flat indigo
  // ellipse, which read as a purple sticker under a painted character on a dark frame.
  const sticker={fill:PAL.ink,stroke:PAL.ink,"stroke-width":9,"stroke-linejoin":"round","stroke-linecap":"round"};
  const svg=el("svg",{viewBox:"-6 -4 160 168","aria-hidden":"true",focusable:"false"});
  // One drawing, moved well: the body carries its own painted face, and there is nothing stacked on
  // top of it. The eyes/mouth frames are gone — they were never registered to the bodies.
  const avatarBase=el("image",{class:"avatar-base",x:FIG_X,y:FIG_Y,width:FIG_W,height:FIG_H,preserveAspectRatio:"xMidYMax meet"});
  const ph=el("g",{class:"ph",display:"none",transform:"translate(0 12)"},
    el("path",{d:"M44 152C44 110 56 92 70 92C84 92 96 110 96 152Z",fill:PAL.slate,stroke:PAL.ink,"stroke-width":5,"stroke-linejoin":"round"}),
    el("circle",{cx:70,cy:56,r:21,fill:PAL.slate,stroke:PAL.ink,"stroke-width":5}),
    el("circle",{cx:63,cy:54,r:2.8,fill:PAL.mint}),el("circle",{cx:77,cy:54,r:2.8,fill:PAL.mint}));
  // ---- the cut-out rig -------------------------------------------------------------------
  // Each body-*-r0.webp is one flat drawing, so a walk could only slide it across the desk — his
  // legs never stepped and his arms never swung. scripts/build-crid-rig.py cuts every stage's own
  // render into ten pieces (head, torso, upper arm / forearm+hand and thigh / shin+foot per side)
  // and measures the shoulder, elbow, hip and knee of each. Nothing is redrawn: every piece is a
  // crop of the shipped drawing, and the script proves they reassemble into it pixel for pixel.
  // Each joint is a group that turns about its own pivot, nested so a forearm carries the
  // shoulder it hangs from and a shin carries its thigh. The group is placed in the render's own
  // 1050x1400 space and scaled into the box the flat drawing used, so a rigged frame lands
  // exactly where the flat one did.
  // Every stage has its own rig cut from its own render (rigs/<stage>/), so the limbs he moves
  // are always the same build as the body he is wearing. The ten piece <image>s are shared; a
  // stage swap re-points them at that stage's crops and pivots.
  let rigStage="3";
  const rigNow=()=>{const rig=RIGS[rigStage];if(!rig)throw new Error(`Missing generated cutout rig for CRID body stage ${rigStage}`);return rig},rigImgs={};
  const syncRig=()=>{const t=rigNow(); for(const n in rigImgs){const b=t.pieces[n],im=rigImgs[n];
    im.setAttribute("x",b.x); im.setAttribute("y",b.y); im.setAttribute("width",b.w); im.setAttribute("height",b.h);
    im.setAttribute("href",b.src); im.setAttributeNS(XLINK,"href",b.src)}};
  const rigJ={},rigG=el("g",{class:"rig",display:"none"}),
    piece=n=>{const b=rigNow().pieces[n],im=el("image",{class:`rig-${n}`,x:b.x,y:b.y,width:b.w,height:b.h,preserveAspectRatio:"none"});
      im.setAttribute("href",b.src); im.setAttributeNS(XLINK,"href",b.src); rigImgs[n]=im; return im},
    joint=(n,...k)=>{const g=el("g",{class:`joint-${n}`});for(const c of k)g.append(c); rigJ[n]=g; return g};
  // The chest, the head and the arms hang off a group of their own, so the body can rise and lean
  // over the foot that is carrying him while the legs below stay where the floor is. The legs are
  // siblings of it, so a bob never lifts a planted foot off the ground.
  // Each joint is drawn with the piece above the cut over the piece below it. The pieces overlap a
  // few px past every cut (see scripts/build-crid-rig.py), so whichever piece is on top is the one
  // whose band seals the joint — and that has to be the upper one, or a lifted leg would drag its
  // band off the hip and show the cut edge.
  const rigUpper=el("g",{class:"rig-upper"},
    joint("shoulder-l",joint("elbow-l",piece("arm-fore-l")),piece("arm-upper-l")),
    joint("shoulder-r",joint("elbow-r",piece("arm-fore-r")),piece("arm-upper-r")),
    piece("torso"),piece("head"));
  rigG.append(
    joint("hip-l",joint("knee-l",piece("shin-l")),piece("thigh-l")),
    joint("hip-r",joint("knee-r",piece("shin-r")),piece("thigh-r")),
    rigUpper);
  rigG.setAttribute("transform",`translate(${FIG_X} ${FIG_Y}) scale(${FIG_W/rigNow().source.w})`);
  const figG=el("g",{class:"fig"},avatarBase,rigG,ph),bodyG=el("g",{class:"body"},figG);
  const ticket=el("g",{class:"ticket",opacity:0});
  const tkFill=[el("path",{d:"M100 4H138V22H100Z",fill:PAL.red,class:"ticket-fill"}),el("path",{d:"M108 22L106 31L118 22Z",fill:PAL.red,class:"ticket-fill"})];
  const ticketText=el("text",{x:119,y:17.2,"text-anchor":"middle","font-size":10.5,"font-weight":800,"letter-spacing":.6,fill:PAL.onyx,"font-family":"ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace"});
  ticketText.textContent="";
  ticket.append(el("path",{d:"M100 4H138V22H100ZM108 22L106 31L118 22Z",...sticker,"stroke-width":6}),...tkFill,ticketText);
  svg.append(bodyG,ticket);
  return{svg,parts:{ticket,ticketText,tkFill,bodyG,figG,avatarBase,rigG,rigJ,rigUpper,ph,
    rigNow,setRigStage:k=>{rigStage=k;syncRig()}}};
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
   biggest thing making him read as a sticker pasted on the frame. The colour is pure black at low
   opacity — a tinted shadow was what turned into the purple blob under his feet. */
#crid-bot svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 calc(var(--bot-w)*.028) calc(var(--bot-w)*.07) rgba(0,0,0,.42))}
html.low-power #crid-bot svg,html.swae #crid-bot svg{filter:none}
/* A line he says on air. The brain page carries its own bubble in brain/overlay.css, but the
   stream page loads only this stylesheet, so without it a say cue was a bare div of text laid
   out under the sprite. Sized off --bot-w so it reads at broadcast size and shrinks with him; the
   theme's own variables win wherever the desk defines them. */
#crid-bot .bot-bubble{position:absolute;bottom:calc(100% + .4em);left:50%;transform:translateX(-50%);
  min-width:8ch;max-width:min(34ch,84vw);padding:.5em .7em;border-radius:.6em;
  background:var(--onyx,${PAL.onyx});border:2px solid var(--bone,${PAL.bone});
  box-shadow:.16em .2em 0 var(--indigo-dk,${PAL.indigoDk});color:var(--ink,${PAL.ink});
  font:600 clamp(11px,calc(var(--bot-w)*.072),20px)/1.35 ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;
  text-align:center;white-space:pre-wrap;opacity:0;transition:opacity .22s ease;pointer-events:none}
#crid-bot .bot-bubble::after{content:"";position:absolute;top:100%;left:50%;margin-left:-5px;
  border:5px solid transparent;border-top-color:var(--bone,${PAL.bone})}
#crid-bot[data-mode="dead"] .ticket-fill,#crid-bot[data-mode="dying"] .ticket-fill{fill:${PAL.dead}}
#crid-bot[data-mode="dead"] .avatar-base,#crid-bot[data-mode="dying"] .avatar-base{opacity:.55}
#crid-bot[data-mode="dead"] svg,#crid-bot[data-mode="dying"] svg{filter:grayscale(.15) drop-shadow(0 calc(var(--bot-w)*.028) calc(var(--bot-w)*.07) rgba(0,0,0,.42))}
#crid-bot[data-mode="doze"] .avatar-base{opacity:.88}
/* The 3D body owns the frame once it is on the GPU: the theme's idle bob is a
   host transform animation, which would fight the stage's translate3d outright,
   and the svg drop-shadow only ever painted the now-hidden flat figure. */
#crid-bot.has-glb[data-mode="on"]{animation:none}
#crid-bot.has-glb svg{filter:none}
#crid-bot.has-glb[data-mode="dead"] svg,#crid-bot.has-glb[data-mode="dying"] svg{filter:none}
`;
// The ladder is exported so a test can hold it to the measurement in ladder.json; nothing in the
// overlay has to import it to use it.
export{BODY_LADDER};
export function createCridBot({root=document.body,swae=!1,lowPower=!1,position="bc",x=null,y=null,step=null,scale=1,layers=null,visitIn=null,init3d=initCrid3D,beingOpts={}}={}){
  if(!document.getElementById("crid-bot-css")){const st=document.createElement("style");st.id="crid-bot-css",st.textContent=CSS,document.head.append(st)}
  const STEP=step!=null?step:swae?220:lowPower?260:140,
  // Movement is sampled finer than the sequencing tick, so an eased beat is drawn as a movement
  // rather than as three jumps. The fast cadence only runs while something is actually travelling:
  // a still character costs the same as before.
  ANIM=Math.max(16,Math.min(STEP,45)),{svg,parts}=draw(),host=document.createElement("div");
  // The flat drawing and the cut-out rig are gone for good — the 3D GLB is the
  // only body. figG hidden once here; every later display toggle lands on its
  // children and can never un-hide it. If WebGL fails he is simply absent
  // rather than a second, lesser Crid.
  parts.figG.setAttribute("display","none");
  host.id="crid-bot",host.setAttribute("aria-hidden","true"),host.dataset.mode="dead";
  if(x!=null&&y!=null){host.classList.add("pos-custom");host.style.setProperty("--bx",`${x}%`);host.style.setProperty("--by",`${y}%`)}
  else if(position=="bl"||position=="br")host.classList.add(`pos-${position}`);
  if(Number.isFinite(scale)&&scale>0)host.style.setProperty("--bws",String(clamp(scale,.4,2.5)));
  const homeCls=[...host.classList].filter(c=>c.startsWith("pos-"));
  host.append(svg); root.append(host);
  // ---- the 3D body -----------------------------------------------------------------------
  // His real rigged Bitmoji (crid-3d.js): Snap's own GLB, 167 bones, facial morphs. The canvas
  // is him. The SVG figure is hidden the moment the model is on the GPU and is not put back.
  let crid3d=null,lastPose=null,crid3dFailed=false,disposed3d=false;
  const hideFigure=()=>{parts.avatarBase.setAttribute("display","none");parts.rigG.setAttribute("display","none");parts.ph.setAttribute("display","none");host.classList.add("has-glb")};
  // The stage machine's lean states don't set leanAt (that's the verb path) —
  // synthesize the same contract for the renderer: roll/pitch/lift plus a
  // contact point on the panel edge so the IK hand-plant keeps working.
  const stageLean=()=>{
    if(!stage||!["lean","lean-in","reach","pull"].includes(stage.state)||!stage.layer)return null;
    const dir=stage.side==="right"?1:-1,angle=dir*.42;
    if(stage.state==="reach"||stage.state==="pull"){
      const g=cridBody.grip;if(!g)return null;
      return {dir,angle,contact:{x:innerWidth/2+g.x*UPX(),y:deskFeet()+g.y*UPX()},
        worldAnchor:{id:g.id,position:{x:g.x,y:-g.y,z:0},
          normal:{x:g.normal?.x||0,y:-(g.normal?.y??-1),z:g.normal?.z||0}}};
    }
    const b=stageBoxes[stage.layer];if(!b)return null;
    const pxX=dir>0?b.edge.right-8:b.edge.left+8,pxY=b.edge.top;
    return {dir,angle,contact:{x:pxX,y:pxY},
      worldAnchor:{id:stage.layer,position:{x:stagePX(pxX),y:(deskFeet()-pxY)/UPX(),z:0},
        normal:{x:dir,y:0,z:0}}};
  };
  const STAGE_GRIP={reach:.85,pull:.85,"lean-in":.8,lean:.8,seat:.7,slip:.9,hop:.4,top:.4};
  // Where the body is about to go, for the face: the eyes fixate the target
  // BEFORE the body covers ground (facial.mjs lookBias fires a saccade on a
  // changed bias). Panel commits look up at the lip; a walk looks down-range.
  // stage.side "right" means he stands on the panel's right edge — the panel
  // (and the look) is screen-left, so the sign flips against attend's lean dir.
  const lookBiasNow=()=>{
    if(stage&&stageActive()){
      const s=stage.state,dir=stage.side==="right"?-1:1;
      if(s==="anticipate"||s==="reach"||s==="pull")return{x:dir*.7,y:-.55};
      if(s==="lean"||s==="lean-in")return{x:dir*.6,y:.1};
      if(s==="top"||s==="seat")return{x:0,y:-.3};
      if(s==="hop"||s==="hop-down")return{x:0,y:-.45};
      if(s==="slip"||s==="recover")return{x:0,y:.5};
      if(s==="drop"||s==="settle"||s==="crouch")return{x:0,y:.3};
      return{x:dir*.4,y:-.2}}
    if(walk&&walk.to)return{x:(walk.tx-walk.x<0?-1:1)*.6,y:0};
    return null};
  init3d(host,()=>({p:lastPose,mode,dying,
    walking:!!(walk&&walk.to)||(stage?stage.walking&&Math.abs(stage.targetX-stage.walkX)>.015:!1),
    walkDir:walk&&walk.to?(walk.tx-walk.x<0?-1:1):(stage&&stage.targetX<cridBody.x?-1:1),fx,
    motorState:{x:cridBody.x,y:cridBody.y,vx:cridBody.vx,vy:cridBody.vy,
      grounded:cridBody.grounded,supportId:cridBody.supportId,distanceTravelled:cridBody.distanceTravelled,
      screenX:cridBody.x*UPX(),active:!!(walk&&walk.to)||!!(stage&&stage.walking&&["approach","floor","top"].includes(stage.state)),source:walk&&walk.to?"cue-layout":"stage-physics",kinematic:!!(walk&&walk.to),
      strideLength:Math.max(.08,cridBody.halfW*2.25),
      grip:cridBody.grip?{...cridBody.grip}:null},
    lean:leanAt||stageLean(),reduced,stage:BODIES[bodyI],face:faceNow,
    stagePose:stage?{ref:stage,roll:stage.roll,pitch:stage.pitch,liftPx:stage.groundY*UPX(),
      state:stage.state,key:stage.key,trace:stage.trace,squash:stage.squashEnv||0,
      grip:STAGE_GRIP[stage.state]||0}:null,
    // Phase B attention: eyes fixate what the body is engaged with — the panel
    // he's touching while leaning (dir=+1 is screen-right), a down-glance while
    // pondering. null hands gaze back to the saccade/drift scheduler.
    attend:leanAt?{x:leanAt.dir*.8,y:.15}:pondering?{x:0,y:.4}:null,
    lookBias:lookBiasNow(),
    talking:host.classList.contains("is-active"),grooving:host.classList.contains("music-playing"),mood,bag:bag.worn}),hideFigure)
    .then(h=>{crid3d=h;crid3dFailed=!h}).catch(err=>{crid3dFailed=true;try{console.warn("[crid-3d] not started:",err&&err.message||err)}catch{}});
  // ---- the backpack: a prop with mass (docs/specs/backpack.md + physics.md) ---------------
  // One world, one gravity, one floor — the same rules the spec gives every body. Worn, the bag
  // rides his back as an SVG in his own palette (no bitmap, no image budget); dropped, it is a
  // physics body that falls, bounces once and settles on the same floor line his feet use, and it
  // stays exactly where it landed — that is the continuity a returning viewer reads.
  const BAG_MASS=.5,world=createWorld();
  // One weighted character body in the shared bag/paper world.
  const cridBody=world.add({character:true,x:0,y:-1,vx:0,vy:0,
    halfW:Math.max(20,(host.offsetWidth||innerWidth*.175)*.34)/Math.max(80,innerHeight/3.5),
    halfH:Math.max(50,(host.offsetHeight||220)*.47)/Math.max(80,innerHeight/3.5),
    floor:0,gravity:2400/Math.max(80,innerHeight/3.5),mass:1,strength:1,grounded:true,supportId:"floor"});
  const bagEl=document.createElement("div"); bagEl.id="crid-bag";
  const bagSvg=el("svg",{viewBox:"0 0 64 78","aria-hidden":"true",focusable:"false"});
  bagSvg.append(
    el("path",{d:"M16 24 Q11 24 11 32 L11 60 Q11 69 20 69 L44 69 Q53 69 53 60 L53 32 Q53 24 48 24 Z",fill:PAL.slate,stroke:PAL.bone,"stroke-width":3,"stroke-linejoin":"round"}),
    el("path",{d:"M16 24 Q32 36 48 24 L48 31 Q32 43 16 31 Z",fill:PAL.onyx,stroke:PAL.bone,"stroke-width":2.5,"stroke-linejoin":"round"}),
    el("circle",{cx:32,cy:41,r:5,fill:"none",stroke:PAL.mint,"stroke-width":3}),
    el("path",{d:"M21 14 L19 25 M43 14 L45 25",stroke:PAL.bone,"stroke-width":4,"stroke-linecap":"round"}));
  bagSvg.style.cssText="width:100%;height:100%;display:block";
  bagEl.append(bagSvg); bagEl.style.cssText="position:fixed;z-index:26;pointer-events:none";
  root.append(bagEl);
  const bag={worn:!0,body:null};
  let pickupWalk=!1,pickupEnd=null,bucketThinkAt=Date.now()+rand(200000,380000),pickupThinkAt=0,paperThinkAt=0;
  const bagWH=()=>{const w=host.offsetWidth||innerWidth*.175; return{w:w*.5,h:w*.5*78/64}};
  const floorY=()=>{const r=host.getBoundingClientRect(); return r.bottom-r.height*.03};
  // His horizontal speed, measured off the host's own movement — the toss a dropped bag gets is
  // the speed he was actually walking at, not a guessed constant.
  let lastCX=0,lastCT=0,hisVx=0;
  const placeBag=()=>{
    const{w,h}=bagWH(); bagEl.style.width=`${w}px`; bagEl.style.height=`${h}px`;
    // Worn on the 3D path the pack is the GLB's own skinned bag — the SVG is only
    // ever the dropped prop on the floor, never a flat image pasted on his back.
    // If the GLB never started there is no figure to follow either, so the worn
    // SVG stays hidden rather than floating where he should be.
    if(bag.worn&&(crid3d||crid3dFailed)){bagEl.style.display="none";return}
    if(bag.worn){const r=host.getBoundingClientRect();
      bagEl.style.left=`${r.left+r.width/2-w/2}px`; bagEl.style.top=`${r.top+r.height*.07}px`}
    else if(bag.body){const b=bag.body;
      bagEl.style.left=`${b.x-w/2}px`; bagEl.style.top=`${b.y-h/2}px`}
    else bagEl.style.display="none";
    if(bag.body){bag.body.floor=floorY(); bag.body.halfH=h/2}};
  const releaseBag=()=>{if(!bag.worn||bag.body)return; const r=host.getBoundingClientRect(),{h}=bagWH();
    const b=world.add({x:r.left+r.width/2,y:r.top+r.height*.22,vx:hisVx,vy:-60,mass:1,drag:.4,restitution:reduced?0:.26,floor:floorY(),halfH:h/2});
    bag.body=b; bag.worn=!1; bagEl.style.display="";
    spawnPaper(b.x-rand(4,16),b.y-rand(0,10),hisVx); if(Math.random()<.5)spawnPaper(b.x+rand(4,16),b.y,hisVx)};
  const wearBag=()=>{if(bag.worn||!bag.body)return; world.remove(bag.body); bag.body=null; bag.worn=!0};
  // The marker frames inside SEQ.dropbag / SEQ.pickup land here, the same place __cueEnd does.
  const bagMark=(kind,frame)=>{if(kind==="drop")releaseBag(); else if(kind==="wear")wearBag()};
  // Loose paper (physics.md §3): what slips out of the bag obeys the same gravity, the same
  // drag and the same floor — it flutters on the way down, lands flat and stays where it lies.
  // Session-only: a reload clears the floor the way a reset desk would.
  const papers=[],PAPER_MAX=4;
  const paperEl=()=>{const d=document.createElement("div");d.id="crid-paper";
    const s=el("svg",{viewBox:"0 0 20 14","aria-hidden":"true",focusable:"false"});
    s.append(el("path",{d:"M2 2 L18 1 L19 12 L3 13 Z",fill:PAL.bone,opacity:.92,stroke:PAL.ink,"stroke-width":.6}),
      el("path",{d:"M4 5 L16 4.5 M4 8 L15 7.6",stroke:PAL.slate,"stroke-width":.8,"stroke-linecap":"round"}));
    s.style.cssText="width:100%;height:100%;display:block";d.append(s);
    d.style.cssText="position:fixed;z-index:25;pointer-events:none";
    const w=13+rand(0,7);d.style.width=`${w}px`;d.style.height=`${w*.7}px`;root.append(d);return d};
  const spawnPaper=(x,y,vx=0)=>{
    if(papers.length>=PAPER_MAX){const old=papers.shift();world.remove(old.body);old.el.remove()}
    const d=paperEl(),b=world.add({x,y,vx:vx+rand(-30,30),vy:rand(-50,10),mass:.05,drag:2.8,restitution:0,floor:floorY(),halfH:7});
    papers.push({body:b,el:d,phase:rand(0,6.28),rot:rand(-14,14)})};
  const placePapers=now=>{for(const p of papers){const b=p.body,w=p.el.offsetWidth||16,h=w*.7;
    p.el.style.left=`${b.x-w/2}px`;p.el.style.top=`${b.y-h/2}px`;
    const fl=!reduced&&!world.settled(b)?Math.sin(now/130+p.phase)*9+b.vx*.05:0;
    p.el.style.transform=`rotate(${p.rot+fl}deg)`}};
  // Carrying is not free: his step shrinks and his gap lengthens by the mass ratio, so a lean
  // Crid visibly works harder under the same bag than a heavy one does (physics.md §1).
  const carrySlow=()=>bag.worn?build().heft/(build().heft+BAG_MASS):1;
  // The desk hands in its layer registry (layers.mjs) and this is the only way he learns where a
  // panel is. It is read at the moment he moves, never cached: the registry answers for a panel
  // that has been moved, hidden or removed, and a name it does not know comes back null — which
  // every verb below treats as "no such furniture", not as a reason to throw.
  let getLayer=typeof layers=="function"?layers:layers&&typeof layers.layer=="function"?n=>layers.layer(n):null;
  // Panel boxes are read through a 4Hz memo: the registry invalidates on every
  // style/class mutation — including the ones his own position writes cause —
  // so an unmemoized read in the tick re-measured all nine layers (a
  // getBoundingClientRect plus computed styles each) several times a second.
  // A panel that actually moves is still picked up within a quarter second,
  // which is faster than he can lean on it anyway.
  const layerCache=new Map(); let layerCacheAt=0;
  const layerOf=name=>{
    const now=Date.now();
    if(now-layerCacheAt>250){layerCache.clear();layerCacheAt=now}
    if(!layerCache.has(name)){let b=null; try{b=(getLayer&&getLayer(name))||null}catch{} layerCache.set(name,b)}
    return layerCache.get(name)};
  // What the desk offers his inner life, read off the same registry the lean verbs use, in desk
  // pixels — the px stand-in for crid3d.html's layerTargets() (behaviour-drives §9). The filters
  // are the same three, with the world-unit thresholds restated against his own drawn height:
  // a panel that paints over him is furniture he only stands beside, one whose top is below his
  // knees has nothing to lean on, and only a top wide enough for his footprint can hold him.
  // No registry (or a name it does not know) simply offers less: with no panels at all the
  // being still wanders, stretches and rests — a living desk, not a parked sprite.
  const BEING_LAYERS=["card","clock","map","ticker","dock","logo","chat","headlines"],   // LAYER_NAMES minus "crid"; the fallback for injected fakes that carry no .names
    BEING_BENCH=["ticker","headlines"],                                              // wide text plates: leaned on, never climbed
    deskFeet=()=>innerHeight-(floorBottom||16),                                      // the floor line his feet actually stand on
    deskTargets=()=>{
      const out={lean:[],sit:[],climb:[]};
      if(!getLayer)return out;
      const names=(layers&&Array.isArray(layers.names)?layers.names:BEING_LAYERS).filter(n=>n!=="crid"),
        cridZ=(layerOf("crid")||{}).z??0,
        frameW=host.offsetWidth||innerWidth*.175,frameH=host.offsetHeight||frameW*168/VBW,bodySpec=build(),w=frameW*bodySpec.w/FRAME.w,h=frameH*bodySpec.h/FRAME.h,
        above=b=>deskFeet()-b.edge.top;                       // px the panel's top edge stands above his feet
      for(const name of names){
        const b=layerOf(name); if(!b||!b.edge||b.w<=10||b.h<=10)continue;
        if(b.z>cridZ)continue;                                // it paints over him: he stands beside it, never on it
        const top=above(b);
        if(top<h*.25)continue;                               // below his knees (crid3d's 0.25 world units)
        out.lean.push(name);
        if(top>h)continue;                                   // taller than he is: its top is above his reach (crid3d's 1.05)
        if(b.w<w*1.2)continue;                               // too narrow for his footprint (§9.3)
        out.sit.push(name);
        if(!BEING_BENCH.includes(name))out.climb.push(name);
      }
      out.climb.sort((a,b)=>above(layerOf(a))-above(layerOf(b)));   // the lowest ledge first
      return out};
  // ---- the stage machine (stage.mjs — the crid3d.html body, on this desk) ---------------
  // being decides WHAT; the stage decides HOW: approach the panel, reach, pull up, sit on
  // the lip, lean in, slip and recover — the same states the rig page proved. stage.mjs is
  // pure and speaks the rig page's world units: x centred on the screen's middle, y up from
  // the floor line, one unit = UPX desk px. syncStageBoxes converts the registry's viewport
  // px into that space; stageTick converts walkX/groundY back for the DOM.
  const UPX=()=>Math.max(80,innerHeight/3.5);   // desk px per world unit (~the rig page's pxPerUnit)
  const stageBoxes={};
  const stageHW={w:0,h:0};
  let stage=null,lastBoxSync=0;
  const stageActive=()=>!!stage&&(stage.state!=="floor"||stage.walking);
  const stagePX=x=>(x-innerWidth/2)/UPX();       // viewport px -> world x (0 = screen centre)
  // Re-measured at most 4x a second (and once when forced): panel rects only
  // matter when he picks a target or reaches for a lip, neither of which happens
  // faster than a quarter second. His own size rides the same pass.
  const syncStageBoxes=force=>{
    const now=Date.now(); if(!force&&now-lastBoxSync<250)return; lastBoxSync=now;
    for(const k of Object.keys(stageBoxes))delete stageBoxes[k];
    const hr=host.getBoundingClientRect(); stageHW.w=hr.width||host.offsetWidth; stageHW.h=hr.height||host.offsetHeight;
    if(!getLayer){world.setPlatforms([]);return}
    const feet=deskFeet(),names=(layers&&Array.isArray(layers.names)?layers.names:BEING_LAYERS).filter(n=>n!=="crid");
    for(const name of names){
      const b=layerOf(name); if(!b||!b.edge)continue;
      const left=b.edge.left??(b.edge.x??0),right=b.edge.right??(left+(b.w||0));
      stageBoxes[name]={left:stagePX(left),right:stagePX(right),top:(feet-(b.edge.top??0))/UPX(),w:b.w/UPX(),h:b.h/UPX(),z:b.z??0}};
    // Mirror deskTargets' physical reach/occlusion checks without calling it
    // during boot (its responsive dimensions are initialized later in this file).
    const bodySpec=build(),wPx=(stageHW.w||host.offsetWidth||innerWidth*.175)*bodySpec.w/FRAME.w,hPx=(stageHW.h||host.offsetHeight||220)*bodySpec.h/FRAME.h;
    const cridZ=(layerOf("crid")||{}).z??0;
    const solid=new Set(Object.keys(stageBoxes).filter(id=>{
      const b=layerOf(id);if(!b||!b.edge||b.z>cridZ)return false;
      const top=feet-(b.edge.top??0);
      return top>=hPx*.25&&top<=hPx&&b.w>=wPx*1.2;
    }));
    world.setPlatforms(Object.entries(stageBoxes).filter(([id])=>solid.has(id)).map(([id,b])=>({
      id,left:b.left,right:b.right,top:-b.top,bottom:-b.top+b.h,solidSides:true
    })));
  };
  const getStage=()=>stage||(stage=createStage({
    targets:deskTargets,boxes:stageBoxes,unit:UPX,worldX:px=>stagePX(px),screenWidth:()=>innerWidth,
    rand:Math.random,mass:()=>build().heft,bagOn:()=>bag.worn,
    canCompleteClimb:()=>!!(cridBody.grounded&&cridBody.supportId===stage?.layer),
    canCompleteHop:()=>!!(cridBody.grounded&&cridBody.supportId===stage?.layer),
    canCompleteDrop:()=>!!(cridBody.grounded&&cridBody.supportId==="floor"),
    hisW:Math.max(24,(host.offsetWidth||innerWidth*.175)*build().w/FRAME.w)/UPX(),hipY:Math.max(30,(host.offsetHeight||220)*build().h/FRAME.h*.5)/UPX(),
    walkX:0,   // seeded from his real centre-x on first step (stageSeed)
    onInterrupt:reason=>{try{being.interrupt(reason)}catch{}
      // Clear the verb-path lean directly — unlean() would re-enter goHome()
      // and this callback fires from inside stage transitions.
      if(leanAt||pendingLean){pendingLean=null;leanAt=null;lastDrawn=""}}}));
  // Seed walkX from where he actually stands the first time the machine wakes.
  const stageSeed=()=>{if(stage){const fw=host.offsetWidth||innerWidth*.175,fh=host.offsetHeight||220,b=build();cridBody.halfW=Math.max(12,fw*b.w/FRAME.w*.52)/UPX();cridBody.halfH=Math.max(30,fh*b.h/FRAME.h*.5)/UPX();if(stage.walkX===0){const r=host.getBoundingClientRect();stage.walkX=stagePX(r.left+r.width/2);cridBody.x=stage.walkX;cridBody.y=-cridBody.halfH;cridBody.floor=0;cridBody.grounded=true;cridBody.supportId="floor"}}};
  // His inner life (being.mjs is pure — drives in, an intent out; beingTick below is the body
  // half). The registry is read live on every decision, so a panel that moves or leaves simply
  // stops being offered. beingOpts is the test seam: rng/drives/cooldown can be pinned without
  // touching the module under test. `let`, not `const`: the first observe that carries a saved
  // snapshot rebuilds it once with those drives restored (see the persistence block below).
  let being=createBeing({now:Date.now(),targets:deskTargets,...beingOpts});
  // Reduced motion is a request for less movement, never for a dead mascot: he keeps breathing and
  // ticking and only the travelling gestures (hops, walks, flights, slams) are cut back. It is read
  // live rather than once, because a browser source (OBS, Swae) can report the preference and can
  // change it without a reload.
  let reduced=!1,lastDrawn="";
  const mq=typeof matchMedia=="function"?matchMedia("(prefers-reduced-motion: reduce)"):null;
  const readMotion=()=>{reduced=!!(mq&&mq.matches)};
  readMotion(); if(mq){const onmq=()=>{readMotion();lastDrawn=""}; mq.addEventListener?mq.addEventListener("change",onmq):mq.addListener&&mq.addListener(onmq)}
  // Kept, not just warmed: a lean bakes the drawing into a bitmap (see bakeLean), and that needs the
  // decoded frame, not a second request for it.
  const bodyImg=new Map(); for(const b of BODIES){const im=new Image();im.src=AV(b);bodyImg.set(String(b),im)}
  // A sprite that will not load falls back to the drawn placeholder figure rather than leaving an
  // invisible image painting over the frame.
  parts.avatarBase.addEventListener("error",()=>{parts.avatarBase.setAttribute("display","none");parts.ph.removeAttribute("display")});
  parts.avatarBase.addEventListener("load",()=>{parts.ph.setAttribute("display","none");parts.avatarBase.removeAttribute("display")});
  let mode="dead",tagText=null,talking=!1,grooving=!1,tickN=0,waitUntil=Date.now()+3000,idleQ=[],gestureQ=[],timer=null,frozen=!1,dying=!1;
  // online is null, not true: "nothing has told me otherwise yet" is a different state from "the
  // desk says he is on". Starting at true made the first observe({bot:{on:true}}) a no-op — it only
  // acts on a flip — so the boot never ran, mode stayed at its "dead" default and the idle loop's
  // `mode!=="dead"` guard skipped every gesture. That was the dead-on-air bug.
  const pendingReact=[]; let lastActive=Date.now(),prev=null,online=null,lastReactN=null,lastSubN=null,bodyI=-1,growth={sx:1,sy:1},fx=1,walk=null,roamN=0,subs=0,home=null,
  // Staging: the lean he is holding, the lean he is walking towards, and the held wondering pose.
  leanAt=null,pendingLean=null,pondering=!1;
  const jobs=[]; let running=null; const flights=new WeakMap;
  const paintBody=()=>{const src=AV(BODIES[bodyI]); parts.avatarBase.setAttribute("href",src); parts.avatarBase.setAttributeNS(XLINK,"href",src); parts.setRigStage(BODIES[bodyI])};
  const setBody=i=>{if(i===bodyI)return; bodyI=clamp(i,0,BODIES.length-1); paintBody()};
  // The build he is in right now — the walk, the gait and the gesture weight all read it, so the
  // body is not just a picture that changes: a heavy Crid plods and slams, a lanky one trots.
  const build=()=>stageOf(bodyI);
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
  // so a resize, a theme switch or a long headline can never slide him under the ticker. The floor
  // is re-measured on the same pass, so his feet always land on the frame rather than behind a plate.
  const place=()=>{
    if(host.classList.contains("pos-br"))
      host.style.setProperty("--bot-right",`${Math.round(innerWidth-clearRight()+clamp(innerWidth*.012,10,26))}px`);
    floorBottom=homeFloor();
    if(floorBottom>0) host.style.setProperty("--bot-floor",`${Math.round(floorBottom)}px`);
    else host.style.removeProperty("--bot-floor")};
  // ---- locomotion: stepping, not gliding -------------------------------------------------
  // He covers ground in short weighted steps with a pause between them, each one eased in and out,
  // so the travel reads as a person shifting their weight rather than as a sprite sliding along.
  const startWalk=(tx,ty,{loose=!1,eps=1.1,stay=!1}={})=>{if(reduced||mode!=="on"||walk)return !1;
    // He travels the band between the clock and the strip. When the frame is too narrow for one
    // (a 500px Swae box: the two plates overlap in x) there is nowhere to walk that is not on top
    // of something, so he stays where he is and the idle gestures carry the movement instead.
    // A walk to a named layer is a directed walk, so it is allowed the whole frame: the panel he
    // has been sent to is the reason he is crossing it.
    const lo=loose?1.5:minCenterX(),hi=loose?98.5:Math.min(92,maxCenterX()); if(hi<=lo)return !1;
    const r=pct(host.getBoundingClientRect());
    dropStageAnchor();
    host.classList.remove(...homeCls); host.classList.add("roam"); host.style.left=`${r.x}%`; host.style.top=`${r.y}%`;
    const tyMax=floorBottom?(innerHeight-floorBottom-r.h*innerHeight/100)/innerHeight*100:100-r.h-2;
    walk={x:r.x,y:r.y,tx:clamp(tx,lo,hi),ty:clamp(ty,42,tyMax),
      from:{x:r.x,y:r.y},to:null,t0:0,dur:1,gap:0,done:0,eps,stay};
    return !0};
  const advanceWalk=()=>{if(!walk)return; const now=Date.now();
    if(walk.done){if(now<walk.done)return; const stay=walk.stay; walk=null;
      // A staged walk ends where it was sent: he stays at the panel he came for instead of
      // drifting home, and the lean he was walking towards is put on him here.
      if(stay||pendingLean){if(pendingLean){const p=pendingLean; pendingLean=null; lean(p.name,p.side)}
        if(pickupWalk){pickupWalk=!1; const e=pickupEnd; pickupEnd=null; play(e!=null?[...SEQ.pickup,{__cueEnd:e}]:SEQ.pickup); lastActive=Date.now()}
        return}
      goHome(); return}
    if(walk.to){ // mid-step: eased travel, then a beat with both feet down before the next one
      const e=EASE.smooth(clamp((now-walk.t0)/walk.dur,0,1));
      walk.x=walk.from.x+(walk.to.x-walk.from.x)*e; walk.y=walk.from.y+(walk.to.y-walk.from.y)*e;
      if(now-walk.t0>=walk.dur){walk.from={x:walk.x,y:walk.y}; walk.to=null; walk.gap=now+rand(160,430)*build().slow/carrySlow()*(reduced?1.6:1)}
    } else if(now>=walk.gap){
      const dx=walk.tx-walk.x,dy=walk.ty-walk.y;
      if(Math.hypot(dx,dy)<walk.eps){walk.done=now+Math.round(rand(1900,2900)); return}
      fx=dx<0?-1:1; const carry=carrySlow(),k=(.42+Math.random()*.26)/Math.sqrt(build().slow)*carry;   // no two steps cover the same ground; a carried bag shortens every one
      walk.from={x:walk.x,y:walk.y}; walk.to={x:walk.x+dx*k,y:walk.y+dy*k};
      walk.t0=now; walk.dur=clamp(340+Math.hypot(dx,dy)*9,340,720)*build().slow/carry;
    }
    if(stageAnchored)dropStageAnchor();
    host.style.left=`${walk.x}%`; host.style.top=`${walk.y}%`};
  // Home is the anchor he was placed at. Coming home is the one thing that ends a lean: he is a
  // guest on a panel, not furniture himself, so the moment the desk needs him back he lets go of
  // it. Nothing else may take it away — see setMode(), unlean() and resettle() for the three
  // things that are allowed to call this while he is leaning.
  const goHome=()=>{if(stage&&stage.state!=="floor")stage.interrupt("home");   // going home abandons the panel gracefully — drop/crouch, never a cut
    const roam=host.classList.contains("roam"); leanAt=null; pendingLean=null; lastDrawn="";
    if(pickupWalk){pickupWalk=!1; const e=pickupEnd; pickupEnd=null; e!=null&&endCue(e,"aborted")}
    const sp=stageAnchored?stagePosePct():null;
    if(!walk&&!roam)return; walk=null; fx=1; gestureQ=[];
    host.classList.remove("roam");
    // Hand the stage's translate3d back as the left/top percentages the home
    // transition knows how to animate from — clearing it bare would snap him
    // to the anchor's corner before the .9s glide even started.
    if(sp){host.style.left=`${sp.x}%`;host.style.top=`${sp.y}%`}else host.style.left=host.style.top="";
    if(stageAnchored){stageAnchored=false;host.style.transform="";host.style.willChange="";host.style.marginLeft=""}
    host.classList.add(...homeCls)};
  // Stopping a walk is not letting go of a panel. A job arriving mid-stride, or a wander coming to
  // its end, used to go through goHome() — the one thing that clears the lean — so a lean he had
  // already taken (or was walking towards) was thrown away and he walked home instead. A walk ends
  // where he stands; the lean it was carrying is put on him there, and only unlean(), death or a
  // panel that left the frame release one.
  const stopWalk=()=>{if(!walk)return; walk=null; fx=1; gestureQ=[];
    if(pickupWalk){pickupWalk=!1; const e=pickupEnd; pickupEnd=null; e!=null&&endCue(e,"aborted")}
    if(pendingLean){const p=pendingLean; pendingLean=null; lean(p.name,p.side)}};
  // A short shuffle around wherever he lives (home is re-read after every landing and on resize),
  // so the crawl reads as him pottering about rather than as a walk across the whole stream.
  const crawlScreen=()=>{if(!home)home=pct(host.getBoundingClientRect());
    const pts=[[-6,1.5],[1.5,-2],[4.5,1],[-2,-2.5]]; roamN=(roamN+1)%pts.length; const [dx,dy]=pts[roamN];
    startWalk(home.x+dx,home.y+dy)};
  // ---- the desk as furniture --------------------------------------------------------------
  // A panel is a place with an edge, not a rectangle on a screen: he walks to its side, and when
  // he leans his side meets that edge and stays there. The geometry is the sprite's own — the
  // drawing's ink box is known (BODY_LADDER measured it), so the point where his body crosses the
  // panel's edge can be put exactly on it instead of being eyeballed.
  //
  // The lean is a rotation about his feet, which is what leaning actually is: his feet stay on the
  // floor line, his body tilts toward the panel, and the contact point — his side at whatever
  // height the panel's edge reaches him — is solved so it lands on the edge. Because the rotation
  // pivots on the feet and the contact is on the same rigid body, breathing moves the rest of him
  // and leaves the lean point where it is.
  const VBW=160,VB_FEET=164,VB_CX=74,VB_PAD=6,     // the sprite's viewBox: width, foot line, centre, left bleed
    VB_PER_WEBP=106.5/1050,                         // viewBox units per px of the 1050x1400 frame
    SHOULDER=.78,                                   // shoulder height as a fraction of the drawn figure
    OVERLAP=3,                                      // px his silhouette is allowed inside the panel's edge
    TILT=[[.6,9],[.35,12],[0,15]];                  // how far he leans, by how high the contact is
  // ---- the lean, baked ---------------------------------------------------------------------
  // A lean used to be a rotate() on the <image>, which resamples a 1050px drawing down into the tilted
  // grid at the size it is displayed — the softness you can see on his face against a panel. His pose
  // is solved this way: the frames are rendered front-on (rotation 0) and turned once here, at the
  // frame's own resolution, into a bitmap that the SVG then only scales down.
  // LEAN_BOX is everything a 15° tilt about the feet can reach — the viewBox plus the 8 units his feet
  // hang below it and the 15 units a shoulder swings past each edge — and LEAN_S is bitmap pixels per
  // viewBox unit: 6 puts the drawing at ~640px across, i.e. the resolution of the 1050px frame it was
  // cut from, instead of the ~150px it is drawn at.
  const LEAN_BOX={x:-24,y:-10,w:208,h:196},LEAN_S=6,
    canBake=typeof document.createElement==="function"&&(()=>{try{return typeof document.createElement("canvas").getContext==="function"}catch{return !1}})();
  let bakedKey="",bakedHref=null;
  const bakeLean=angle=>{
    if(!canBake)return null;
    const key=`${BODIES[bodyI]}:${angle}`; if(key===bakedKey)return bakedHref;
    const im=bodyImg.get(String(BODIES[bodyI])); if(!im||!im.complete||!im.naturalWidth)return null;
    const c=document.createElement("canvas"); c.width=LEAN_BOX.w*LEAN_S; c.height=LEAN_BOX.h*LEAN_S;
    const g=c.getContext("2d"); if(!g)return null;
    // The canvas is the viewBox's own coordinate system, so a pixel in it is a viewBox unit and the
    // rotation below lands exactly where rotate(angle VB_CX VB_FEET) on the drawing would.
    g.setTransform(LEAN_S,0,0,LEAN_S,-LEAN_BOX.x*LEAN_S,-LEAN_BOX.y*LEAN_S);
    g.translate(VB_CX,VB_FEET); g.rotate(angle*Math.PI/180); g.translate(-VB_CX,-VB_FEET);
    g.drawImage(im,FIG_X,FIG_Y,FIG_W,FIG_H);
    bakedKey=key; bakedHref=c.toDataURL("image/webp",.92);
    return bakedHref;
  };
  // A baked bitmap already carries the tilt, so the pose transform must not put it on again: the
  // outer rotate() is dropped, not compensated for — wrapping it in rotate(-angle) is what made the
  // first attempt cancel itself out and look exactly like the unbaked one.
  const showSprite=baked=>{
    const A=parts.avatarBase;
    if(baked){if(A.getAttribute("href")!==baked){
        A.setAttribute("href",baked); A.setAttributeNS(XLINK,"href",baked);
        A.setAttribute("x",LEAN_BOX.x); A.setAttribute("y",LEAN_BOX.y);
        A.setAttribute("width",LEAN_BOX.w); A.setAttribute("height",LEAN_BOX.h);
        A.setAttribute("preserveAspectRatio","none")}
      return}
    if(A.getAttribute("x")!==null&&+A.getAttribute("x")!==FIG_X){   // he was baked: put the drawing back
      A.setAttribute("x",FIG_X); A.setAttribute("y",FIG_Y);
      A.setAttribute("width",FIG_W); A.setAttribute("height",FIG_H);
      A.setAttribute("preserveAspectRatio","xMidYMax meet");
      paintBody()}
  };
  // Which side of the panel he stands on. Asked for, or the roomier side of the frame.
  const sideFor=(box,side)=>side==="left"||side==="right"?side:(box.x+box.w/2>innerWidth/2?"left":"right");
  // Where he has to stand to put his side on that panel's edge, and how far he tilts to get there.
  // Null when there is nothing to lean on: the panel's edge never crosses his body, so a shoulder
  // would be leaning on air and he would rather stand beside it than fake it.
  const standPoint=(box,side)=>{
    const w=host.offsetWidth||innerWidth*.175,h=host.offsetHeight||w*168/VBW,
      st=build(),sx=growth.sx||1,sy=growth.sy||1,
      inkW=st.w*VB_PER_WEBP*sx,inkH=st.h*VB_PER_WEBP*sy,   // his drawn body, in viewBox units
      u=w/VBW,                                            // px per viewBox unit
      rect=host.getBoundingClientRect(),feetY=rect.bottom,
      bodyTop=feetY-inkH*u,shoulderY=feetY-inkH*SHOULDER*u,
      dir=side==="left"?1:-1,                             // standing on its left puts his right side on it
      lo=Math.max(box.edge.top,bodyTop),hi=Math.min(box.edge.bottom,feetY);
    if(!(hi>lo))return null;
    const contactY=clamp(shoulderY,lo,hi),
      f=clamp((feetY-contactY)/(inkH*u),0,1),
      tilt=(TILT.find(([min])=>f>=min)||TILT[TILT.length-1])[1]*dir,
      th=tilt*Math.PI/180,
      above=(feetY-contactY)/u,                           // contact height above his feet, viewBox units
      // The side of him that meets the panel, in viewBox units. He is drawn facing forward to
      // lean — the mirror is a walking artefact, not a stance — so this is the plain geometry:
      // the walk flips fx as it steps, and a contact point that moved with it would walk him into
      // the panel and back out again forever.
      qx=VB_CX+dir*(inkW/2),
      // …and where that point ends up once the lean is rotated about his feet.
      xAt=VB_CX+(qx-VB_CX)*Math.cos(th)+above*Math.sin(th),
      wallX=dir>0?box.edge.left+OVERLAP:box.edge.right-OVERLAP,
      left=wallX-(xAt+VB_PAD)*u;
    return{left,centre:left+w/2,tilt,dir,contactY,wallX,w,h,feetY}};
  // Walk to a named panel and stop at the offset where a lean would start. Not a teleport: the
  // same stepping walk he uses for everything else, at the gait his body stage gives him.
  const walkTo=(name,side)=>{
    const box=layerOf(name); if(!box||mode==="dead"||dying||reduced)return !1;
    const sp=standPoint(box,sideFor(box,side)); if(!sp)return !1;
    return startWalk(sp.centre/innerWidth*100,(sp.feetY-sp.h)/innerHeight*100,{loose:!0,eps:.35,stay:!0})};
  const lean=(name,side)=>{
    const box=layerOf(name); if(!box||mode==="dead"||dying||reduced)return !1;
    const s=sideFor(box,side),sp=standPoint(box,s); if(!sp)return !1;
    if(walk&&!walk.stay)stopWalk();   // a wander is not a reason to refuse the panel he was sent to
    if(walk){pendingLean={name,side:s}; return !0}          // he is already on his way somewhere
    const rect=host.getBoundingClientRect();
    if(Math.abs(rect.left+rect.width/2-sp.centre)>Math.max(16,sp.w*.2)){   // not beside it yet
      pendingLean={name,side:s};
      return walkTo(name,s)};
    return holdLean(name,sp)};
  // Putting him on the edge he has already reached: the lean itself, with no walking involved.
  // lean() and the resize re-solve both end here, so a lean that is re-taken lands in exactly the
  // same place as one that was asked for.
  const holdLean=(name,sp)=>{fx=1;                         // face forward: a lean has no direction of travel
    // contact is the hand-plant point for the 3D arm IK: a few px inside the
    // panel face at a hand below the shoulder contact, in viewport px.
    leanAt={angle:sp.tilt,dir:sp.dir,layer:name,
      contact:{x:sp.wallX-sp.dir*6,y:sp.contactY+sp.h*.07}};
    host.classList.remove(...homeCls); host.classList.add("roam");
    host.style.left=`${sp.centre/innerWidth*100}%`; host.style.top=`${(sp.feetY-sp.h)/innerHeight*100}%`;
    lastDrawn="";
    return !0};
  // A lean outlives the moment it was asked for. A doze, a quiet stretch or a resize must not
  // quietly take it back — that is what made him let go and walk home the moment the desk went
  // still. Letting go is a decision, and this is the verb that makes it.
  const unlean=()=>{if(!leanAt&&!pendingLean)return !1; goHome(); return !0};
  // A resize moves the panel, not his decision to lean on it: the edge he is on is re-solved
  // against the frame as it is now. If the panel has left the frame there is nothing to lean on,
  // and he lets go rather than hanging in the air beside a rectangle that is no longer drawn.
  const resettle=()=>{if(!leanAt||walk||mode==="dead")return;
    const layer=leanAt.layer,side=leanAt.dir>0?"left":"right",box=layerOf(layer),
      sp=box?standPoint(box,side):null;
    if(!sp)goHome(); else holdLean(layer,sp)};
  // A held wondering pose: weight on one leg, head tilted, the body given to a question. The
  // drawings carry painted arms, so nothing here can raise a hand — what he has is posture, and
  // posture held still is what reads as thinking. Usable standing and leaning; it composes with
  // the lean rather than replacing it.
  const ponder=(on=!0)=>{if(mode==="dead"||dying)return !1; pondering=!!on; lastDrawn=""; return !0};
  // ---- out and about -----------------------------------------------------------------------
  // Every so often, when the desk is quiet and he is not already busy, he takes the walk to one
  // of the panels and leans on it for a spell — sometimes falling into a ponder about what is
  // on it — then lets go and drifts home. The registry is the same layer list the desk measures,
  // so a name that is not on screen is never picked, and a panel that leaves mid-lean is let go
  // by the same resettle that looks after a commanded lean. This is what keeps him a guest on
  // the furniture instead of a sprite pinned to one spot of it.
  const VISIT_LAYERS=["card","clock","map","ticker","dock","logo","chat","headlines"];
  let visitAt=Date.now()+(visitIn??rand(28000,48000)),visit=null,visitPondered=!1;
  const maybeVisit=now=>{
    if(!getLayer||mode==="dead"||dying||reduced)return;
    if(visit){
      if(leanAt){                                // arrived: hold for a spell, then let go
        if(!visit.until)visit.until=now+rand(9000,17000);
        if(!visitPondered&&Math.random()<.45){ponder(!0);visitPondered=!0}
        if(now>=visit.until){
          // Only let go of the panel he chose: a lean somebody else put on him is theirs to
          // end, so a visit that lost its panel simply retires instead of pushing him off it.
          if(leanAt.layer===visit.name){ponder(!1);unlean()}
          else ponder(!1);
          visitPondered=!1;visit=null;visitAt=now+rand(42000,95000)}
      }else if(!pendingLean&&!walk){visit=null;visitAt=now+rand(20000,40000)}
      return}
    if(mode!=="on"||now<visitAt||walk||leanAt||pendingLean||pondering||idleQ.length||gestureQ.length||running||jobs.length||beingPrev||stageActive())return;
    const names=VISIT_LAYERS.filter(n=>{const b=layerOf(n);return b&&b.w>10&&b.h>10});
    if(!names.length){visitAt=now+rand(20000,40000);return}
    const name=names[Math.floor(Math.random()*names.length)],side=Math.random()<.5?"left":"right";
    if(lean(name,side)){visit={name,until:0};visitPondered=!1;lastActive=Date.now()}
    else{pendingLean=null;visitAt=now+rand(15000,32000)}};
  // ---- the stride -------------------------------------------------------------------------
  // A walk is not two legs turning opposite ways. That is a wide-legged stance: both feet stay on
  // the floor and both legs leave the vertical at once, so he reads as standing spread rather than
  // walking. A walk is one foot planted and one in the air. Each leg owns half the cycle — planted
  // for its first half, lifted, folded and put down on its second — and the leg that is planted is
  // left exactly vertical, so the two legs are never both tilted away from each other.
  // The chest rides the step: it rises over the foot carrying him at mid-step and leans towards
  // it, and the shoulder line tips against the hip line. The arms swing with the step, both turning
  // the same way so one comes across the body while the other goes out — never both out at once.
  // Every curve below is zero at both ends of a step, so the pose at the start and at the end of a
  // walk is the flat drawing itself and the hand-over to it cannot jump. Every angle turns about
  // the pivot the slicer measured on the render.
  // build().slow is already inside walk.dur, so a heavy stage still takes the step it took before.
  const RIG_LIFT=80,      // px the lifted leg rises, in the render's own 1400-tall space
    RIG_HIP=5,            // degrees the swinging thigh leans — small, so a leg stays near vertical
    RIG_KNEE=8,           // degrees the swinging knee folds, which the thigh's lean cancels sideways
    RIG_ARM=6,            // degrees an arm swings, against the leg on the same side
    RIG_BOB=12,           // px the chest rises at mid-step
    RIG_SWAY=3,           // px the chest leans over the planted foot
    RIG_TWIST=2.2;        // px the shoulder line tips against the hip line
  // One leg's own step: flat while it is planted, then a smooth rise to the top of the step and back
  // down to the floor.
  const swingOf=t=>{if(t<.5)return 0; const x=(t-.5)*2; return .5-.5*Math.cos(2*Math.PI*x)};
  let rigOn=!1;
  // Walking is an alternating-step cycle (feet leave the floor, arms swing with the step).
  // Standing idle is different on purpose: a living hold — slow weight shift onto one leg, a gentle
  // body sway/settle and small natural arm movement — not a march played slowly. Dead/dying never
  // reach showRig (render falls back to the flat drawing) so the character can show dead treatment.
  const showRig=(on,u,kind="walk")=>{
    // The flat drawing is the same figure, so it has to go while the rig is on: left underneath, it
    // is a second pair of legs that stay planted and a second pair of arms that do not swing, and
    // the whole gait reads as a body walking out of its own skin.
    if(on!==rigOn){rigOn=on; parts.rigG.setAttribute("display",on?"":"none"); parts.avatarBase.setAttribute("display",on?"none":"")}
    if(!on)return;
    const set=(j,deg,dx=0,dy=0)=>{const q=parts.rigNow().pivot[j]; parts.rigJ[j].setAttribute("transform",
      `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${deg.toFixed(2)} ${q.x} ${q.y})`)};
    if(kind==="walk"){
      const tL=(u*2)%1,tR=(u*2+.5)%1,          // the left leg steps first, the right on the second half
        wL=swingOf(tL),wR=swingOf(tR),         // 0 with the foot down, 1 at the top of the step
        kickL=wL>0?Math.sin(Math.PI*(tL-.5)*2):0, kickR=wR>0?Math.sin(Math.PI*(tR-.5)*2):0,
        arm=Math.sin(2*Math.PI*tL)*RIG_ARM,    // both shoulders turn the same way: one out, one across
        bob=Math.max(wL,wR)*RIG_BOB,
        sway=-Math.sin(2*Math.PI*tL)*RIG_SWAY, // towards whichever foot is planted
        twist=Math.sin(2*Math.PI*tL)*RIG_TWIST;
      // The planted leg is untouched: no lift, no lean, so its foot stays exactly on the floor line.
      set("hip-l",RIG_HIP*kickL,0,-RIG_LIFT*wL); set("knee-l",-RIG_KNEE*wL);
      set("hip-r",-RIG_HIP*kickR,0,-RIG_LIFT*wR); set("knee-r",RIG_KNEE*wR);
      set("shoulder-l",arm,0,-twist); set("elbow-l",-arm*.5);
      set("shoulder-r",arm,0,twist); set("elbow-r",-arm*.5);
      parts.rigUpper.setAttribute("transform",`translate(${sway.toFixed(2)} ${(-bob).toFixed(2)})`);
      return;
    }
    // Idle: no stepping, both feet stay planted. Weight shifts slowly side to side (hips/torso carry
    // it), the upper body eases and settles, and the arms move a little with the shift — a standing
    // person, not a walking cycle. Motions are out of phase so they read as organic, not metronomic.
    // The amplitudes are set against the walk's own constants above: everything here lives in the
    // render's 1050px space and reaches the screen at ~0.19x, so a hold any gentler than this reads
    // as a frozen sprite — the "log of wood" the rig was built to fix. Two clocks drive it: the
    // ~5.2s weight-shift cycle from rigPhase, plus slower drifts off the wall clock so the hold
    // never lines up into a visible loop. Under reduced motion the same beats play smaller.
    const now=Date.now(),calm=reduced?.45:1,
      w=Math.sin(2*Math.PI*u), w2=Math.sin(2*Math.PI*u+.9), w3=Math.sin(4*Math.PI*u+.4),
      d1=Math.sin(now/1000*2*Math.PI/14.3), d2=Math.sin(now/1000*2*Math.PI/9.7+1.3);
    const sway=(w*16+d1*7)*calm, bob=((.5+.5*w2)*13+Math.max(0,d2)*4)*calm,
      twist=(w*7+d1*2.5)*calm;
    const hipShift=(w*4+d1*1.6)*calm, load=clamp(.5+.5*(w*.8+d1*.4),0,1);
    // The loaded knee softens as the weight arrives — both stay planted, neither lifts.
    set("hip-l",hipShift,0,0); set("knee-l",-2.2*load*calm);
    set("hip-r",hipShift,0,0); set("knee-r",-2.2*(1-load)*calm);
    // The arms never mirror: one swings with the shift, the other trails it, and the elbows fold
    // unevenly so the hands stay alive without either arm leaving his side.
    set("shoulder-l",-(w*8+d1*3)*calm,0,-twist); set("elbow-l",(-w3*4.5-d2*2)*calm);
    set("shoulder-r",-(w*5.5-d1*2)*calm,0,twist*.8); set("elbow-r",(w3*3.5+d2*1.5)*calm);
    parts.rigUpper.setAttribute("transform",`translate(${sway.toFixed(2)} ${(-bob).toFixed(2)}) rotate(${((w*1.8+d1*.8)*calm).toFixed(2)} ${parts.rigNow().pivot["shoulder-l"].x} ${parts.rigNow().pivot["shoulder-l"].y})`);
  };
  // The rig's own clock. Mid-stride it is the step's progress so feet land with the travel;
  // standing still it is a slower cycle for an idle weight shift (not a walk).
  let rigIdleAt=0;
  const rigPhase=()=>{
    if(walk&&walk.to) return clamp((Date.now()-walk.t0)/walk.dur,0,1);
    const now=Date.now(); if(!rigIdleAt)rigIdleAt=now;
    return ((now-rigIdleAt)/5200)%1; // ~5.2s idle cycle, slow weight shift
  };
  const render=p=>{
    lastPose=p;
    // Stamped before the unchanged-pose early return: the mode/dying state is what the overlay,
    // theme and checks read, and it must never lag a transition (including the dying beat).
    host.dataset.mode=dying?"dying":mode;
    // A lean is drawn from a bitmap that already carries the tilt (see bakeLean), so the pose below
    // has nothing left to rotate at display size. Resolved before the signature so a bake that only
    // becomes possible once the frame has decoded still gets drawn. A prone pose (pr) is left on the
    // old path: it rotates about a different point, and a push-up against a panel is not worth a
    // second pivot rule.
    const plank=Math.abs(Math.sin(p.pr*Math.PI/180)),L=(p.hr*.8+p.pr)*p.fx,k=1-.16*plank,shift=plank*60*p.fx;
    const baked=leanAt&&p.fx===1&&plank===0?bakeLean(leanAt.angle):null;
    // The rig is cut for the lean stage only (scripts/build-crid-rig.py cuts body-3-r0.webp), so
    // it is drawn only for that stage when not leaning and not dead/dying. Dead/dying always fall back to the flat drawing so
    // the rendered character shows the dead-state treatment and the limbs stop moving. At rest the
    // rig is a living idle (subtle weight/posture/arm shifts), distinct from an actual walk.
    const stepping=!!(walk&&walk.to), alive=mode!=="dead"&&!dying;
    const rigStep=!!(alive&&!leanAt),
      rigU=rigStep?rigPhase():0,
      rigKind=stepping?"walk":"idle",
      sig=JSON.stringify(p)+bodyI+(leanAt?leanAt.angle:0)+(pondering?1:0)+(baked?"b":"")+(rigStep?":"+rigKind+":"+Math.round(rigU*100):":flat:"+(dying?"d":"")+mode);
    if(sig===lastDrawn)return; lastDrawn=sig;
    // A pose may still name eyes:/mouth: (every sequence does). There is no face layer to write to
    // any more — the drawing's own face is the face — so those keys are carried and ignored, and the
    // beat around them still plays.
    parts.ticketText.textContent=p.tag||""; parts.ticket.setAttribute("opacity",p.tag?1:0);
    // The tag is the one object he handles himself, and he handles it with the body he has: a heavy
    // build slaps a heavier sticker down, a lanky one flicks a small one on. Anything else that
    // sizes an object to him can read stage.w / stage.heft off the API.
    parts.ticket.setAttribute("transform",`translate(100 4) scale(${(.9+.35*(build().heft-.86)/.59).toFixed(2)}) translate(-100 -4)`);
    const tkc=p.tag==="PAID"||p.tag==="+SUB"?PAL.mint:PAL.red; for(const n of parts.tkFill)n.setAttribute("fill",tkc);
    // The squash pivots on the box bottom (164), which is where his feet now are, so a breath or a
    // landing compresses him downwards instead of lifting him off the floor.
    parts.bodyG.setAttribute("transform",`translate(0 ${p.by}) translate(70 164) scale(${(1+(1-p.bs)*.6).toFixed(3)} ${p.bs}) translate(-70 -164)`);
    // gx used to be scaled by .4 — a 3px glance at the old 104px size, i.e. nothing. A glance now
    // reads as a look: the sprite is the only face he has, so its travel is the expression.
    // The lean is the outermost transform — the whole figure, already posed, tips about his feet.
    // Everything inside it — the breath, the squash, the idle weight shift — still moves, which is
    // the point: he breathes against the panel instead of being pinned to it. When the tilt is baked
    // into the bitmap there is nothing to rotate here: the bitmap is already tipped about the same
    // feet, so the pose goes on unchanged and the drawing stays sharp.
    parts.figG.setAttribute("transform",`${leanAt&&!baked?`rotate(${leanAt.angle.toFixed(2)} ${VB_CX} ${VB_FEET}) `:""}translate(${(shift+p.gx*1.15).toFixed(2)} ${(p.hy*.85-plank*14).toFixed(2)}) translate(70 158) rotate(${L.toFixed(2)}) scale(${(p.fx*p.sx*k).toFixed(3)} ${(p.sy*k).toFixed(3)}) translate(-70 -158)`);
    // The canvas is him. Once the model is live the SVG figure stays hidden.
    if(crid3d&&crid3d.active&&!disposed3d)hideFigure();
    else{showSprite(baked); showRig(rigStep,rigU,stepping?"walk":"idle")}
  };
  // ---- human timing ----------------------------------------------------------------------
  // The sprite is a still drawing, so the only life it has is what the engine moves. Two layers:
  // the gesture beats, which are interpolated (below), and a continuous layer that never stops —
  // breathing, a slow weight shift, and the walk cycle.
  const EASE={linear:u=>u,smooth:u=>u*u*(3-2*u),out:u=>1-Math.pow(1-u,3),settle:u=>1-Math.pow(1-u,4.2),
      // Damped spring, ratio ~0.45: one small overshoot then rest — the settle
      // every stop owes. w=12 keeps the tail inside ~0.5% of target at u=1.
      damped:u=>{const z=.45,w=12,wd=w*Math.sqrt(1-z*z);
        return 1-Math.exp(-z*w*u)*(Math.cos(wd*u)+(z*w/wd)*Math.sin(wd*u))},
      anticipate:u=>{const c=1.35;return (c+1)*u*u*u-c*u*u},
      overshoot:u=>{const c=1.70158;return 1+(c+1)*Math.pow(u-1,3)+c*Math.pow(u-1,2)}},
    NUMS=["gx","gy","hy","hr","by","bs","pr","tr"],BOOT=Date.now();
  // Every beat knows where it sits in its own sequence, so the first beat can wind up before the
  // move and the last one can settle after it. One frame per tick, every frame the same length,
  // was the metronome that made him skip like a robot.
  const FPOS=new WeakMap,FLEN=new WeakMap,FPSEQ=new WeakMap;
  // Sequences whose first beat IS the anticipation: a ~140 ms opposite dip
  // before the move, not the usual long wind-up.
  const ANTICIPATE=new Set(["hop","jump","climb","dropbag"]);
  for(const k in SEQ){const arr=SEQ[k]; arr.forEach((f,i)=>{if(!FPOS.has(f))FPOS.set(f,i);if(!FPSEQ.has(f))FPSEQ.set(f,k)}); for(const f of arr)if(!FLEN.has(f))FLEN.set(f,arr.length)}
  const beatMs=f=>{const i=FPOS.get(f)??1,n=FLEN.get(f)??3,anti=i===0&&ANTICIPATE.has(FPSEQ.get(f));
    return STEP*(i===0?(anti?1.0:2.6):i===n-1?3.1:2.0)*(.82+Math.random()*.5)*(reduced?1.3:1)};
  const beatEase=f=>{const i=FPOS.get(f)??1,n=FLEN.get(f)??3; return i===0?"anticipate":i===n-1?"damped":(Math.random()<.5?"out":"smooth")};
  const breath=now=>Math.sin((now-BOOT)/1000*2*Math.PI/4.6)*(reduced?.35:1);
  // A person standing still is never square to the camera: a small lean that moves every few
  // seconds, biased to one side, is what stops him reading as a sprite pinned to a grid.
  let post={hr:0,tr:0,hy:0},postTo={hr:0,tr:0,hy:0},postAt=BOOT,postFor=1;
  const postureAt=now=>{if(now>=postAt+postFor){post={...postTo}; postAt=now; postFor=rand(2600,4600)*(reduced?1.4:1);
      postTo={hr:(Math.random()<.62?-1:1)*rand(1.6,4.4),tr:rand(-3.2,3.2),hy:rand(0,2.2)}}
    const e=EASE.smooth(clamp((now-postAt)/postFor,0,1));
    return{hr:post.hr+(postTo.hr-post.hr)*e,tr:post.tr+(postTo.tr-post.tr)*e,hy:post.hy+(postTo.hy-post.hy)*e}};
  // A heavy body puts more of itself into every step: it does not lift as far off the ground, it
  // rocks further side to side, and it comes down harder. A lanky one is the opposite — springy and
  // light. This is the walk cycle's gait, and it is the build that sets it.
  const weighGesture=f=>{if(!f)return f;const h=build().heft,q={...f};
    if(q.by)q.by=q.by<0?q.by/h:q.by*h;
    if(q.hy)q.hy=q.hy<0?q.hy/h:q.hy*h;
    if(q.bs&&q.bs<1)q.bs=1-(1-q.bs)*h;
    return q};
  const baseOf=frame=>({...REST[mode],tag:tagText,fx,sx:growth.sx,sy:growth.sy,...(weighGesture(frame)||{})});
  const dress=p=>{const now=Date.now(),q={...p};
    if(mode==="on"||mode==="doze"){const br=breath(now); q.bs*=(1+.028*br); q.sy*=(1+.016*br); q.hy-=2.4*br}
    // Against a panel the idle weight shift is cut back: the whole point of a lean is that the
    // contact point holds still, so the drifting posture must not walk him along the edge.
    // With the rig carrying the idle (base body, feet planted, not stepping) the posture sway is
    // cut back further: hr rotates the WHOLE figure about a pivot at his feet, which is the
    // lollipop sway — a rigid board pivoting on a stick. The rig already shifts his weight the
    // way a body does, so the pose layer only has to breathe and settle.
    if(!frozen&&mode!=="dead"){const po=postureAt(now),rigIdle=mode!=="dead"&&!dying&&!leanAt&&!(walk&&walk.to),k=(leanAt?.3:1)*(rigIdle?.22:1); q.hr+=po.hr*k; q.tr+=po.tr*k; q.hy+=po.hy*k}
    // The wondering pose: weight on one leg, head tilted, held. It is a slow sway rather than a
    // still, because a perfectly still body reads as a paused image.
    if(pondering){const w=Math.sin((now-BOOT)/1000*1.35); q.hr+=7.6+w*1.2; q.tr+=3.8+w*1.6; q.hy+=1.5; q.bs*=.994}
    if(!gestureOn){if(mode==="doze")q.hr=[3,5,7,5][Math.floor(now/430)%4];
      if(grooving&&mode==="on"){q.hr=Math.floor(now/760)%2?-3:3; q.hy=Math.floor(now/1500)%2?2:0}}
    if(walk&&walk.to){const u=clamp((now-walk.t0)/walk.dur,0,1),lift=Math.sin(Math.PI*u),h=build().heft;
      q.by-=lift*2.4/h; q.hr+=lift*2*fx*h; q.hy+=lift*.7/h}
    return q};
  // One transition at a time: the pose eases from where it is to the next beat instead of snapping
  // onto it, which is the difference between a gesture and a twitch.
  let pose=null,tgt=null,from=null,trAt=0,trFor=1,trEase=EASE.smooth,gestureOn=!1;
  const stepTo=(frame,now)=>{from={...pose}; tgt=baseOf(frame); trAt=now; trFor=frame?beatMs(frame):STEP*1.5;
    trEase=EASE[frame?beatEase(frame):"smooth"]; gestureOn=!!frame};
  const advancePose=now=>{if(!pose){pose=baseOf(null); tgt=pose; trAt=now; trFor=1; return dress(pose)}
    const e=trEase(clamp((now-trAt)/trFor,0,1)),p={...tgt};
    for(const k of NUMS)p[k]=(from[k]??0)+((tgt[k]??0)-(from[k]??0))*e;
    pose=p; return dress(pose)};
  // Fewer, larger gestures, and long gaps between them. The eye-only beats (blink, ledBlink) are
  // nearly invisible on a painted face, so they are the rare exception now, not the filler.
  const pickIdle=()=>{const r=Math.random(); if(mode==="doze") return r<.5?SEQ.sit:SEQ.weighted;
    // A painted face cannot blink, so the idle set is only moves the body can show.
    if(r<.22)return SEQ.sway; if(r<.38)return SEQ.weighted; if(r<.50)return SEQ.read;
    if(r<.62)return rand(0,1)<.5?SEQ.glanceL:SEQ.glanceR; if(r<.72)return SEQ.peek;
    if(r<.82)return SEQ.shrug; if(r<.90)return SEQ.sit.concat(SEQ.stand);
    if(r<.96)return SEQ.crawl; return SEQ.sideeye};
  // The gap before the next gesture is drawn, not fixed: a few seconds of stillness, often much
  // longer, and never the same interval twice running.
  const nextWait=()=>{const r=Math.random();
    // Stillness is part of him, but a painted body with a 28s gap reads as a statue.
    const sec=mode==="doze"?(r<.4?rand(12,20):rand(7,12)):(r<.2?rand(8,12):r<.55?rand(5,8):rand(2.8,5));
    return sec*1000*(reduced?1.35:1)};
  // The stage owns his place on the floor: walkX is centre-x px, groundY lifts
  // him off the floor line in px (panel tops, seats, the hop). While the machine
  // is idle this does nothing — home anchors and cue walks are untouched.
  // Root motion is integrated here because stage.mjs stays pure: walking is a
  // flag + a target, the body covers the distance. Speed is ~0.76 body-widths
  // a second (the rig page's 0.42 units at hisW 0.55), slowed on a ledge.
  let stageAnchored=false;
  // Once the stage owns him he is pinned by a compositor transform, not left/top:
  // the behaviour tick used to write layout properties ~22x a second while the
  // rig drew at 60fps, and every write forced style+layout work the transform
  // path never does. The anchor is a fixed 0,0 corner under .roam (which already
  // kills the .9s position transition); translate3d then carries the same desk-px
  // box the old percentage math produced. dropStageAnchor hands the element back
  // to left/top the moment a cue walk or goHome needs it.
  const dropStageAnchor=()=>{if(!stageAnchored)return; stageAnchored=false;
    host.style.transform=""; host.style.willChange=""; host.style.marginLeft=""; host.style.left=""; host.style.top=""};
  // The transform's px offset back in viewport-percent, so a walk home or a cue
  // stride can start from the exact spot the stage left him without a jump.
  const stagePosePct=()=>{const m=/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(host.style.transform||"");
    return m?{x:+m[1]/innerWidth*100,y:+m[2]/innerHeight*100}:null};
  const stageTick=()=>{
    if(!stage)return;
    if(stageTick.lastState!==stage.state){stageTick.lastState=stage.state;if(stage.state==="hop")stageTick.hopStarted=false}
    if(mode!=="on"||dying){world.stopCharacter(cridBody);return}
    const bodySpec=build(),fw=stageHW.w||host.offsetWidth||180,fh=stageHW.h||host.offsetHeight||220;
    const bodyWpx=fw*bodySpec.w/FRAME.w,bodyHpx=fh*bodySpec.h/FRAME.h,slow=Math.max(1,bodySpec.slow||1),heft=bodySpec.heft,load=bag.worn?BAG_MASS:0;
    const walkSpeed=Math.max(.12,.76*bodyHpx/UPX())/slow,walkAccel=3.2/slow;
    cridBody.mass=bodySpec.heft;cridBody.strength=bodySpec.heft;cridBody.load=bag.worn?BAG_MASS:0;
    cridBody.halfW=Math.max(12,bodyWpx*.52)/UPX();cridBody.halfH=Math.max(30,bodyHpx*.5)/UPX();
    cridBody.floor=0;cridBody.gravity=2400/UPX();
    if(stage.state==="floor"&&(walk||leanAt||pendingLean)){
      // A cue walk is screen-layout navigation, not game traversal. advanceWalk owns the
      // percentage-positioned root for this short mode; the physical stage motor is bypassed.
      // We only sample its actual displacement here so the 3D distance gait/foot lock stays live.
      const r=host.getBoundingClientRect(),nextX=stagePX(r.left+r.width/2),dx=nextX-cridBody.x;
      cridBody.distanceTravelled=(cridBody.distanceTravelled||0)+Math.abs(dx);
      cridBody.x=nextX;cridBody.y=-cridBody.halfH;cridBody.vx=0;cridBody.vy=0;
      cridBody.grounded=true;cridBody.supportId="floor";cridBody.motor=null;
      stage.walkX=cridBody.x;stage.groundY=0;stage.grounded=true;stage.supportId="floor";stage.gripFailed=false;
      return;
    }
    if(!stageAnchored&&stage.state==="floor"&&!stage.walking&&!cridBody.motor&&!cridBody.grip)return;

    if(stage.state==="top"&&cridBody.grounded&&cridBody.supportId===stage.layer)
      world.releaseGrip(cridBody);
    if(stage.walking&&["approach","floor","top"].includes(stage.state)){
      world.moveCharacter(cridBody,stage.targetX,{maxSpeed:walkSpeed,
        acceleration:walkAccel,strength:heft,load});
    } else if(stage.state==="pull"&&cridBody.grip){
      world.climbCharacter(cridBody,{x:stage.lipX,feetY:-stage.topY},
        {strength:heft,load,maxAcceleration:24,stiffness:18/slow,damping:8/slow});
    } else if(stage.state==="reach"&&!cridBody.grip){
      const box=stageBoxes[stage.layer],side=stage.side==="right"?-1:1;
      const anchored=box&&world.grabCharacter(cridBody,{id:stage.layer,x:side<0?box.right-8/UPX():box.left+8/UPX(),y:-box.top,normal:{x:0,y:-1,z:0}},
        {side,strength:heft,load,reach:cridBody.halfH*1.9});
      if(!anchored)stage.gripFailed=true;
    } else if(stage.state==="drop"||stage.state==="hop-down"){
      world.releaseGrip(cridBody);
      world.moveCharacter(cridBody,stage.fromX,{maxSpeed:walkSpeed,
        acceleration:walkAccel,strength:heft,load});
    } else if(["slip","crouch"].includes(stage.state)){
      world.releaseGrip(cridBody);world.stopCharacter(cridBody);
    } else if(stage.state==="hop"&&!stageTick.hopStarted){
      stageTick.hopStarted=true;
      world.jumpCharacter(cridBody,{height:Math.max(0,stage.topY/slow),horizontal:(stage.lipX-cridBody.x)*.6});
    } else if(stage.state==="hop"&&stageTick.hopStarted){
      world.moveCharacter(cridBody,stage.lipX,{maxSpeed:Math.max(walkSpeed,.9*bodyHpx/UPX()/slow),acceleration:3.2/slow,strength:heft,load});
    } else if(!["top","approach","floor"].includes(stage.state)){
      world.stopCharacter(cridBody);
    }
    stage.walkX=cridBody.x;
    stage.groundY=Math.max(0,-(cridBody.y+cridBody.halfH));stage.grounded=!!cridBody.grounded;stage.supportId=cridBody.supportId;
    if(cridBody.gripFailed&&["reach","anticipate","pull"].includes(stage.state)){
      stage.gripFailed=true;world.releaseGrip(cridBody)}
    if(!stageAnchored){
      stageAnchored=true;host.classList.remove(...homeCls);host.classList.add("roam");
      host.style.left="0px";host.style.top="0px";host.style.marginLeft="0px";host.style.willChange="transform"}
    const cxPx=cridBody.x*UPX()+innerWidth/2,gY=stage.groundY*UPX();
    const w=stageHW.w||host.offsetWidth,h=stageHW.h||host.offsetHeight;
    host.style.transform=`translate3d(${(cxPx-w/2).toFixed(2)}px,${(deskFeet()-h-gY).toFixed(2)}px,0)`};
  // The stage machine itself runs on the display's clock, not the behaviour
  // tick's: step() advances groundY/roll/pitch through climbs and lens, and at
  // 22Hz those stepped visibly under the 60fps rig. The intent is the one
  // beingTick last computed — it only ever changed at that cadence anyway.
  let stageIntent=null,stageBusy=false,lastStageRAF=0,stageManual=false;
  const stageDrive=now=>{
    if(stage&&mode==="on"&&!dying&&!reduced){
      const dt=lastStageRAF?Math.min(.1,Math.max(0,(now-lastStageRAF)/1000)):.016; lastStageRAF=now;
      try{
        stage.step(now,stageBusy?null:stageIntent,dt);
        if(stageManual&&stageIntent?.phase==="end"&&stage.state==="floor"){
          stageManual=false;stageIntent=null;stageBusy=false;
        }
      }catch{}
    } else lastStageRAF=0};
  let lastWorldRAF=0;
  const stageRAF=()=>{
    if(frozen){requestAnimationFrame(stageRAF);return}
    const now=Date.now(),dt=lastWorldRAF?Math.min(.1,Math.max(0,(now-lastWorldRAF)/1000)):.016;
    lastWorldRAF=now;
    stageDrive(now);
    try{stageTick()}catch{}
    world.step(dt);
    try{stageTick()}catch{}
    if(typeof requestAnimationFrame=="function")requestAnimationFrame(stageRAF)};
  if(typeof requestAnimationFrame=="function")requestAnimationFrame(stageRAF);
  // Read-only QA handle for the stage machine — same spirit as __cridIk/__cridFace.
  // Positions are reported back in desk px so a screenshot can be checked by eye.
  try{window.__cridStage=()=>stage?{state:stage.state,key:stage.key,layer:stage.layer,
    walkX:Math.round(stage.walkX*UPX()+innerWidth/2),groundY:Math.round(stage.groundY*UPX()),
    roll:+stage.roll.toFixed(3),pitch:+stage.pitch.toFixed(3),trace:stage.trace,hold:+stage.hold.toFixed(1),
    grounded:cridBody.grounded,supportId:cridBody.supportId,handContact:stageLean()?.contact||null,worldAnchor:stageLean()?.worldAnchor||null,vx:+cridBody.vx.toFixed(3),vy:+cridBody.vy.toFixed(3)}:null}catch{}
  try{window.__crid3D=()=>({active:!!(crid3d&&crid3d.active),failed:!!crid3dFailed})}catch{}
  try{window.__cridMotor=()=>({x:+cridBody.x.toFixed(4),y:+cridBody.y.toFixed(4),
    vx:+cridBody.vx.toFixed(4),vy:+cridBody.vy.toFixed(4),grounded:cridBody.grounded,
    supportId:cridBody.supportId,distanceTravelled:+cridBody.distanceTravelled.toFixed(4),
    mass:cridBody.mass,strength:cridBody.strength,grip:cridBody.grip?{...cridBody.grip}:null,
    platforms:world.platforms.map(p=>p.id)})}catch{}
  // Same read-only QA spirit for the loose bodies: a screenshot or a test can prove a sheet
  // fell, fluttered and came to rest without reaching into the closure.
  try{window.__cridPapers=()=>papers.map(p=>({x:Math.round(p.body.x),y:Math.round(p.body.y),
    vx:+p.body.vx.toFixed(1),vy:+p.body.vy.toFixed(1),settled:world.settled(p.body)}))}catch{}
  const tick=()=>{if(frozen)return; const now=Date.now(); tickN++;
    // The bag is a body in the same world as everything else: it integrates on the tick's own
    // clock, and while it is in the air the loop runs at the fast cadence so the fall reads.
    const tS=now/1000,fdt=Math.min(.1,tS-(tick.lastT||tS)); tick.lastT=tS;
    // Non-browser tests have no display RAF; keep their deterministic physics
    // seam alive without adding a second production clock.
    if(typeof requestAnimationFrame!=="function")world.step(fdt);
    if(!reduced)for(const p of papers)if(!world.settled(p.body))p.body.vx+=Math.sin(tS*6+p.phase)*150*fdt;
    {const r=host.getBoundingClientRect(),cx=r.left+r.width/2; hisVx=(cx-(tick.lastCX||cx))/Math.max(.05,tS-(tick.lastCT||tS)); tick.lastCX=cx; tick.lastCT=tS}
    placeBag(); placePapers(now);
    // A sheet slips out now and then while he walks under it — rare enough to be a detail,
    // regular enough that a long stream always has one on the floor eventually.
    if(bag.worn&&walk&&now>=paperThinkAt){paperThinkAt=now+rand(150000,360000);
      if(Math.random()<.3){const r=host.getBoundingClientRect();spawnPaper(r.left+r.width/2+rand(-16,16),r.top+r.height*.2,hisVx)}}
    if(walk&&(jobs.length||running))stopWalk(); advanceJob(); advanceWalk(); beingTick(now);
    // A commanded lean or walk is the desk's ask outranking his own stage: the
    // machine is told to abandon gracefully rather than fight the new verb.
    if(stage&&stage.state!=="floor"&&(leanAt||pendingLean||walk))stage.interrupt("cue-takeover");
    if(typeof requestAnimationFrame!="function"){stageDrive(now);stageTick()} maybeVisit(now); maybeBag(now);
    if(now>=trAt+trFor){ // the previous beat has finished travelling: choose the next one
      let frame=null; if(walk&&!walk.done&&!gestureQ.length)gestureQ.push(...SEQ.crawl);
      if(gestureQ.length){const head=gestureQ[0]; if(head&&head.__cueEnd!=null){gestureQ.shift(); endCue(head.__cueEnd,"done")} else {frame=gestureQ.shift(); if(frame&&frame.__bag)bagMark(frame.__bag,frame)}} else if(mode!=="dead"&&!dying){
        // Against a panel, or inside a thought, he is not pottering about: the staged hold is the
        // performance, so nothing picks a wander for him until he lets go.
        if(!idleQ.length&&!walk&&!leanAt&&!pondering&&now>=waitUntil){const q=pickIdle();
          if(q===SEQ.crawl){crawlScreen();idleQ=[]}else idleQ=[...q]; waitUntil=now+nextWait()}
        frame=idleQ.shift()||null; if(mode==="on"&&now-lastActive>DOZE_AFTER_MS)setMode("doze")}
      stepTo(frame,now);
      if(dying&&!gestureQ.length){mode="dead";dying=!1;host.dataset.mode="dead";lastDrawn=""}
      else if(!dying&&!running&&!jobs.length&&!gestureQ.length&&pendingReact.length){const next=pendingReact.shift(); const nm=typeof next==="string"?next:next&&next.name; play([...(SEQ[nm]||[]),...(next&&next.__cueEnd!=null?[{__cueEnd:next.__cueEnd}]:[])])}
    }
    // Dead/dying: render the pose (die sequence while dying, prone at rest when dead) but do not
    // run the rig/idle loop — the flat drawing carries the dead treatment and limbs stay still.
    render(advancePose(now));
    const fast=!dying&&mode!=="dead"&&(walk||Date.now()<trAt+trFor||(bag.body&&!world.settled(bag.body)));
    timer=setTimeout(tick,fast?ANIM:(mode==="dead"?STEP*4:STEP))};
  // The reduced-motion cut of a sequence: the same beats, without the travel. Anything that moves
  // him across the frame (by, bs, pr) is dropped and what remains is clamped to a twitch, so the
  // loop still ticks and still reads as a character — it just stops throwing him around.
  const calm=frames=>{const seen=new Set(),out=[];
    for(const f of frames){const g={...f}; delete g.by; delete g.bs; delete g.pr;
      if(g.tr!=null)g.tr=clamp(g.tr,-2,2); if(g.hy!=null)g.hy=clamp(g.hy,-1.5,1.5); if(g.hr!=null)g.hr=clamp(g.hr,-2,2);
      const k=JSON.stringify(g); if(!seen.has(k)){seen.add(k); out.push(g)}}
    return out.length?out:[frames[frames.length-1]||{}]};
  // ---- cue completion -------------------------------------------------------------------------
  // The desk asks "wave"; now it also asks "did he?". One callback per cue, fired exactly once and
  // only by something that actually happened: the last frame of the sequence is drawn ("done"),
  // something louder clears the queue underneath it ("aborted"), or a line's bubble has been held
  // and faded ("done"). A cue that gets neither — the page is reloaded, the tab is killed, he walks
  // off mid-gesture — reports nothing, which is why the brain keeps its own timer as the fallback.
  let cueEndSeq=0; const cueEnds=new Map();
  const endCue=(id,outcome)=>{if(id==null||!cueEnds.has(id))return; const fire=cueEnds.get(id); cueEnds.delete(id); try{fire(outcome)}catch{}};
  const cueEndWith=(id,outcome)=>()=>endCue(id,outcome);
  const abortCueEnds=()=>{for(const id of [...cueEnds.keys()])endCue(id,"aborted")};
  const cueEndFor=onEnd=>{if(typeof onEnd!=="function")return null; const id=++cueEndSeq; cueEnds.set(id,onEnd); return id};
  const play=(frames,{urgent=!1}={})=>{if(urgent){gestureQ=[]; abortCueEnds()} gestureQ.push(...(reduced?calm(frames):frames))};
  // Going quiet is not a reason to leave a panel: a doze is a mode, not a recall, and taking the
  // lean away here was what sent him home the moment the desk went still. Only a mode that takes
  // him off the desk (dead) comes home; a lean is released by unlean(), by another lean, or by
  // dying — never by the clock running out on his attention.
  function setMode(next){if(next===mode&&!dying)return; const was=mode; idleQ=[]; if(next!=="on"&&next!=="doze")goHome();
    if(next==="dead"){if(was==="dead"||dying)return; cancelJobs(); clearTimeout(feelTimer); pendingReact.length=0; dying=!0; play(SEQ.die,{urgent:!0}); lastDrawn=""; host.dataset.mode="dying"; if(reduced){mode="dead";dying=!1;host.dataset.mode="dead"; lastDrawn=""} return}
    dying=!1; mode=next; host.dataset.mode=mode; lastDrawn=""; if(was==="dead")play(SEQ.wake,{urgent:!0}); lastActive=Date.now()}
  const react=kind=>{if(mode==="dead"||dying||!SEQ[kind])return; if(mode==="doze"){mode="on";lastActive=Date.now()} if(running||jobs.length){if(pendingReact.length<3)pendingReact.push(kind); return} play(SEQ[kind],{urgent:!0})};
  // A micro-emotion, from FEEL: swap the body, play its beat, hold the body, then let his own weight
  // take it back. The beat is queued, never urgent, so a small feeling can never interrupt the loud
  // layer — the same promise the brain's bus makes (interrupt "none", lowest priority).
  let feelTimer=null,faceNow=null,faceSeq=0;
  const feel=(name,{hold,onEnd,faceOnly}={})=>{const f=FEEL[name]; if(!f||mode==="dead"||dying)return false;
    if(mode==="doze"){mode="on";lastActive=Date.now()}
    // The 3D face gets the same feeling the body borrows: facial.mjs runs the
    // emotion envelope (onset/hold/release) over the GLB's morph targets while
    // the gesture sequence plays on top. One channel, no second brain.
    faceNow={name,hold:clamp(Number(hold)||f.hold,400,4e3),seq:++faceSeq};
    // A feeling is a different drawing for a moment, not a different body: now that the bodies are a
    // real size ladder, swapping to a fixed shape would balloon a lanky Crid into a fat one for a
    // beat and back. He borrows a build one step away from his own, so the stance changes and the
    // size does not.
    // On the 3D path this borrow is disabled outright: bodyI feeds getState().stage, and stage is
    // subscription progression — Route B turns it into girth. An emotion must never move it.
    // The gesture sequence and the face envelope carry the feeling instead.
    const borrow=!(crid3d&&crid3d.active);
    if(borrow){const i=BODIES.findIndex(b=>String(b)===String(f.body));
      if(i>=0){const here=Math.max(0,bodyI), near=clamp(i,here-1,here+1); setBody(near)}}
    if(!faceOnly&&f.seq&&SEQ[f.seq])play(SEQ[f.seq]);
    lastActive=Date.now(); clearTimeout(feelTimer);
    feelTimer=setTimeout(()=>{if(borrow&&mode!=="dead")setBody(stageFor(subs).i); if(typeof onEnd==="function")onEnd()},clamp(Number(hold)||f.hold,400,4e3));
    return true};
  // ---- the cue channel ---------------------------------------------------------------------
  // One thing at a time, from the desk state. A cue is never stacked on another: if he is already
  // busy it waits its turn in the same queue the derived reactions use, and if that queue is full it
  // is dropped. Nothing here remounts him, clears the frame or teleports a walk, and a name he does
  // not know is ignored, so the desk can pass whatever state carries.
  // The two bag cues (docs/specs/backpack.md). dropbag is the sequence plus the release marker;
  // pickup walks him to where the bag actually lies before he bends for it — off-screen, he does
  // not attempt it, and a walk that is called off reports the cue aborted, not done.
  const bagDrop=end=>{if(!bag.worn){endCue(end,"failed"); return !1}
    if(mode==="doze"){mode="on";lastActive=Date.now()}
    if(running||jobs.length){if(pendingReact.length<3){pendingReact.push(end?{name:"dropbag",__cueEnd:end}:"dropbag"); return !0} endCue(end,"aborted"); return !1}
    play(end?[...SEQ.dropbag,{__cueEnd:end}]:SEQ.dropbag); return !0};
  const bagPickup=end=>{if(bag.worn||!bag.body){endCue(end,"failed"); return !1}
    const r=bagEl.getBoundingClientRect();
    if(r.right<0||r.left>innerWidth||r.bottom<0||r.top>innerHeight){endCue(end,"failed"); return !1}
    const hr=host.getBoundingClientRect(),near=Math.hypot(r.left+r.width/2-(hr.left+hr.width/2),r.top-hr.top)<hr.width*1.4;
    if(pickupWalk)return pickupEnd=end??pickupEnd,!0;   // already on his way: the newer ask takes the report
    if(!near){
      if(walk&&!walk.stay){pickupWalk=!1; const e=pickupEnd; pickupEnd=null; e!=null&&endCue(e,"aborted")}
      pickupWalk=!0; pickupEnd=end;
      const ok=startWalk(clamp((r.left+r.width/2)/innerWidth*100,2,98),clamp(hr.top/innerHeight*100,2,96),{loose:!0,eps:.6,stay:!0});
      if(!ok){pickupWalk=!1; pickupEnd=null; endCue(end,"aborted"); return !1}
      lastActive=Date.now(); return !0}
    if(mode==="doze"){mode="on";lastActive=Date.now()}
    play(end?[...SEQ.pickup,{__cueEnd:end}]:SEQ.pickup); return !0};
  // Quiet-moment autonomy, same guards as the panel visits: he shrugs the bag off now and then on
  // a long quiet stretch, and goes back for it later — the prop's position is the story a viewer
  // who was away comes back to.
  const maybeBag=now=>{
    if(mode!=="on"||dying||reduced||walk||leanAt||pendingLean||pondering||idleQ.length||gestureQ.length||running||jobs.length||stageActive())return;
    if(bag.worn){if(now>=bucketThinkAt){bucketThinkAt=now+rand(200000,420000); if(Math.random()<.3)bagDrop(null)}}
    else if(bag.body&&world.settled(bag.body)&&now>=pickupThinkAt){pickupThinkAt=now+rand(60000,180000); if(Math.random()<.4)bagPickup(null)}};
  // ---- his inner life -------------------------------------------------------------------
  // being.mjs decides (drives → an intent); this is where the intent becomes a verb he already
  // has. The yield rules are maybeVisit's and maybeBag's: nothing new STARTS while the cue
  // channel is busy — a flight, a queued cue or react, the bag walk, any gesture on the frame —
  // because the desk's asks always outrank his own restlessness. An intent already under way (a
  // walk mid-stride, a lean held, a doze) is left alone; only its start waits for quiet. That is
  // also why there is no being.interrupt("cue") here: pausing the decision is cleaner than
  // abandoning the activity and paying the cooldown for a cue that was never a threat. When the
  // activity ends or turns over, whatever it was holding is let go first.
  let beingPrev=null,beingLean=null,beingFired=!1;
  // Phase C: the activity carries its feeling on the face only — faceOnly skips
  // the gesture sequence so it never fights the verb's own SEQ beat (climb,
  // hop). rest gets none: doze already holds the lids and suppresses emotion.
  const beingTick=now=>{
    const plan=being.step(now),it=plan.intent,key=it.key;
    // The stage machine steps every tick he is free to be staged — the same busy
    // list the verb guard below uses, so a cue flight pauses his decisions but
    // never strands a sequence mid-pull. dt is the real gap since the last step.
    const busy=!!(walk||running||jobs.length||pendingReact.length||pickupWalk||gestureQ.length||idleQ.length);
    if(mode==="on"&&!dying&&!reduced){
      getStage(); stageSeed(); syncStageBoxes();
      // step() itself moved to the rAF loop (stageRAF) — it advances the climb,
      // the lean and the seat on the display's clock. What stays here is the
      // intent it consumes, refreshed at the behaviour tick's own cadence.
      if(!stageManual){stageIntent=it||null;stageBusy=busy}}
    if(stageManual)return;
    if(key!==beingPrev){                              // the activity ended or turned over: let go of what it held
      if(beingPrev==="rest"&&mode==="doze")setMode("on");
      if(beingLean&&leanAt&&leanAt.layer===beingLean){ponder(!1);unlean()}
      beingLean=null;beingPrev=key;beingFired=!1}
    if(stageActive())return;                          // approach/reach/climb/lean/seat owns him until floor
    if(!key||mode!=="on"||dying||beingFired)return;
    if(walk||running||jobs.length||pendingReact.length||pickupWalk||gestureQ.length||idleQ.length)return;
    if(key==="wander"){
      // The stage machine owns the walk now: floor-state wander sets walking +
      // targetX and stageTick carries him there. This branch only pays the feeling.
      if(reduced){beingFired=!0;being.interrupt("reduced-motion");return}
      beingFired=!0;feel("curious",{faceOnly:!0})}
    else if(key==="lean-watch"||key==="sit-on"){
      // sit-on is a real seat now — the stage climbs to the lip and sits. The
      // begin() inside stage.step already validated the panel is in targets().
      if(reduced){beingFired=!0;being.interrupt("reduced-motion");return}
      beingFired=!0;
      if(!it.layer)being.interrupt("no-panel");
      else{beingLean=it.layer;feel(key==="sit-on"?"smug":"curious",{faceOnly:!0})}}
    else if(key==="climb"){
      // Real climb: approach → reach → pull → top → descend, with the slip
      // chance physics.md §2 gives a bag-carrying lean body.
      if(reduced){beingFired=!0;being.interrupt("reduced-motion");return}
      beingFired=!0;
      if(!it.layer)being.interrupt("no-panel");
      else feel("flustered",{faceOnly:!0})}
    else if(key==="stretch"){beingFired=!0;play(SEQ.hop);feel("delighted",{faceOnly:!0})}   // the nearest "up and shake it out" beat he has
    else if(key==="rest"){beingFired=!0;setMode("doze")}     // tired is doze: the mode he already has for it
    // plan.fidgetEvery is deliberately unused: nextWait() is the idle-gesture gap, not a fidget
    // timer, and there is no burst channel on this page to scale — skipped rather than faked.
  };
  // ---- his persistence (docs/specs/behaviour-drives.md §10) --------------------------------
  // The desk state carries the last snapshot this page wrote back (state.bot.being, through
  // POST /api/desk/being — see being-sync.mjs). The first observe that carries one re-seeds his
  // drives exactly once, so a later poll can never re-roll a life already under way. The gap
  // since savedAt gets the spec's offline decay: energy recovers toward full — he slept —
  // while boredom and attention relax back toward an empty room's resting values (60 and 5,
  // exponential with a one-hour constant). Anything stale, future-dated or not v:1 is ignored
  // and he keeps the drives he booted with.
  const BEING_MAX_GAP_MS=8*3600e3;
  const beingOffline=(d,dtMs)=>{
    const dt=Math.min(Math.max(dtMs,0),BEING_MAX_GAP_MS),h=dt/3600e3,k=Math.exp(-dt/3600000);
    return{energy:clamp(d.energy+0.05*h*100,0,100),   // 0.05 of the scale per hour, capped at 8 h
      boredom:clamp(60-(60-d.boredom)*k,0,100),
      attention:clamp(5-(5-d.attention)*k,0,100)}};
  let beingSeeded=!1;
  const seedBeing=(snap,dtMs)=>{
    const d=snap.drives;
    if(!d)return;
    being=createBeing({now:Date.now(),targets:deskTargets,...beingOpts,
      drives:beingOffline({energy:+d.energy,boredom:+d.boredom,attention:+d.attention},dtMs),
      ...(Number.isFinite(snap.floorX)?{lastX:snap.floorX}:{})});
    // floorX is where he was standing when the page was last alive: 0..1 across the same
    // clock-to-strip band getBeing() measures. The brain's copy was seeded above; here his
    // body goes there too — a page load is not a walk, so he is placed, not sent strolling.
    // roam is the free-positioning class startWalk() also uses, and the height he had is kept
    // by re-reading his own rect, the same convention a staged walk's y uses. Done before the
    // bag restore below so a dropped bag's floor line is measured off where he actually is.
    if(Number.isFinite(snap.floorX)&&!walk&&!leanAt&&!pendingLean){
      const lo=minCenterX(),hi=Math.min(92,maxCenterX());
      if(hi>lo){
        const cx=clamp(lo+(hi-lo)*clamp(snap.floorX,0,1),1.5,98.5),
          r=pct(host.getBoundingClientRect());
        host.classList.remove(...homeCls); host.classList.add("roam");
        host.style.left=`${cx}%`; host.style.top=`${r.y}%`; home=null;
      }
    }
    // The dropped bag is the one physical trace worth resurrecting: it lies exactly where it
    // fell, on the same floor line, until he decides to pick it up again. Restoring it is a
    // plain physics body at rest — placeBag() puts the element on it from the next tick.
    const b=snap.bag;
    if(b&&b.worn===!1&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&!bag.body){
      bag.worn=!1;
      bag.body=world.add({x:clamp(b.x,0,1)*innerWidth,y:clamp(b.y,0,1)*innerHeight,vx:0,vy:0,
        mass:1,drag:.4,restitution:reduced?0:.26,floor:floorY(),halfH:bagWH().h/2});
      bagEl.style.display=""; placeBag()}
  };
  const maybeSeedBeing=s=>{
    if(beingSeeded)return; beingSeeded=!0;
    const snap=s.bot?s.bot.being:null;
    if(!snap||snap.v!==1)return;
    const dt=Date.now()-Number(snap.savedAt);
    if(!(dt>=0)||dt>BEING_MAX_GAP_MS)return;   // future-dated or too old to mean anything
    seedBeing(snap,dt)};
  const cue=(name,{text="",onEnd}={})=>{
    if(typeof name!=="string"||!name||mode==="dead"||dying)return false;
    const end=cueEndFor(onEnd);
    if(name==="say"){const line=String(text||"").trim().slice(0,140); if(!line){endCue(end,"failed"); return false} const ms=clamp(line.length*65,2e3,6e3); say(line,ms); if(end)setTimeout(()=>endCue(end,"done"),ms+450); return true}
    if(name==="dropbag")return bagDrop(end);
    if(name==="pickup")return bagPickup(end);
    if(FEEL[name])return feel(name,{onEnd:end?cueEndWith(end,"done"):undefined});
    if(!SEQ[name]){endCue(end,"failed"); return false}
    if(mode==="doze"){mode="on";lastActive=Date.now()}
    // Busy: it waits its turn like every other cue, and the end marker waits with it, so a cue that
    // plays three seconds late still reports when it actually finishes.
    if(running||jobs.length){if(pendingReact.length<3){pendingReact.push(end?{name,__cueEnd:end}:name); return true} endCue(end,"aborted"); return false}
    play(end?[...SEQ[name],{__cueEnd:end}]:SEQ[name]);
    return true};
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
  const observe=s=>{var _a,_b,_c; if(!s)return; maybeSeedBeing(s); const on=s.bot?s.bot.on!==!1:!0; if(on!==online){online=on;power()} if(online===!1){prev=s; return}
    const reactN=(_c=(_b=(_a=s.bot)==null?void 0:_a.react)==null?void 0:_b.n)!=null?_c:0; if(lastReactN===null)lastReactN=reactN; else if(reactN!==lastReactN){lastReactN=reactN;react(s.bot.react.kind)}
    const sn=subCount(s); if(sn!=null){if(lastSubN===null){lastSubN=sn;applySubs(sn,!1)}else if(sn!==lastSubN){const up=sn>lastSubN;lastSubN=sn;applySubs(sn,up)}}
    if(talking&&mode==="on"&&tickN%9===0)play(SEQ.read);
    if(activityOf(s)){lastActive=Date.now(); if(mode==="doze"){mode="on";play([{eyes:"wide",mouth:"o",hy:-2},{eyes:"open",mouth:"flat",hy:0}],{urgent:!0})}}
    const verdict=s.crid?s.crid.verdict:null; tagText=s.crid?(verdict===1?"PAID":"DUE"):null;
    if(prev){const pv=prev.crid?prev.crid.verdict:null; if(verdict===1&&pv!==1)react("paid"); else if(verdict===0&&pv!==0)react("due"); const pollNow=s.poll&&s.poll.active!==!1,pollBefore=prev.poll&&prev.poll.active!==!1; if(pollNow&&!pollBefore)react("think"); else if(!pollNow&&pollBefore&&s.poll&&s.poll.options)react("cheer"); if(s.card&&s.card.confidence==="disputed"&&!(prev.card&&prev.card.id===s.card.id))react("wince"); const jNow=!!(s.letters&&s.letters.status==="open"),jBefore=!!(prev.letters&&prev.letters.status==="open"); if(jNow&&!jBefore)react("cheer"); else if(!jNow&&jBefore)react("nod")} prev=s};
  const watch=()=>{talking=host.classList.contains("is-active");grooving=host.classList.contains("music-playing")};
  const mo=typeof MutationObserver=="function"?new MutationObserver(watch):null; mo==null||mo.observe(host,{attributes:!0,attributeFilter:["class"]});
  // Boot him on the way in (the desk default), place him clear of the lower third, and keep the
  // placement honest across resizes and strip content changes.
  
  const get3DState=()=>{
    const p=advancePose(Date.now());
    const walking=!!(walk&&walk.to)||!!(stage&&stage.walking&&["approach","floor","top"].includes(stage.state));
    const b=build();
    return {p,mode,dying,walking,reduced,grooving,fx:p.fx,walkDir:walk?.dir||1,
      lean:leanAt||stageLean(),stage:b.key,
      stagePose:stage?{ref:stage,pitch:stage.pitch||0,roll:stage.roll||0,squash:stage.squashEnv||0}:null,
      grip:!!cridBody.grip,bag:{...bag},
      motorState:{active:walking,distanceTravelled:cridBody.distanceTravelled||0,
        strideLength:Math.max(.08,cridBody.halfW*2.25),velocity:cridBody.vx,
        grounded:!!cridBody.grounded,supportId:cridBody.supportId,
        grip:cridBody.grip?{...cridBody.grip}:null}};
  };
  if(typeof init3d==="function"&&!lowPower){
    try{
      Promise.resolve(init3d(host,get3DState,()=>{},()=>{crid3dFailed=true}))
        .then(instance=>{
          if(!instance)return;
          if(disposed3d){instance.dispose();return}
          crid3d=instance;
          if(instance.active)hideFigure();
        })
        .catch(()=>{crid3dFailed=true;crid3d=null});
    }catch{crid3dFailed=true}
  }

  applySubs(0,!1); power(); place(); placeBag(); render(advancePose(Date.now())); timer=setTimeout(tick,STEP);
  let placeFrame=0,stripWatch=null;
  const replace=()=>{home=null; if(placeFrame)return; placeFrame=(typeof requestAnimationFrame=="function"?requestAnimationFrame:setTimeout)(()=>{placeFrame=0; place(); resettle()},0)};
  if(typeof addEventListener=="function")addEventListener("resize",replace);
  if(typeof ResizeObserver=="function"){const strip=document.getElementById("auto-headlines"); if(strip){stripWatch=new ResizeObserver(replace); stripWatch.observe(strip)}}
  return{el:host,summon,dismiss,cancel,react,feel,cue,observe,setMode,walkTo,lean,unlean,ponder,
    get leaning(){return leanAt?{layer:leanAt.layer,angle:leanAt.angle,dir:leanAt.dir}:null},
    get pondering(){return pondering},
    // The registry can arrive after him (the desk builds its panels as it goes), and a new one
    // replaces the old without remounting him.
    setLayers(v){getLayer=typeof v=="function"?v:v&&typeof v.layer=="function"?n=>v.layer(n):null; return !0},
    // QA hook (crid-lab): hand the stage machine one intent the way beingTick would.
    // On air only being's intents reach begin(); the lab page uses this to film a climb.
    driveStage:(key,layerName,phase="start")=>{
      if(mode!=="on"||dying||reduced)return false;
      stageSeed();syncStageBoxes();getStage();
      if(!stageManual&&phase==="start"){
        stageManual=true;being.interrupt("lab-stage");
      }
      if(!stageManual)return false;
      stageIntent={key,phase,layer:layerName,x:.5};stageBusy=false;
      return true},
    stopStageDrive:()=>{
      if(!stageManual)return false;
      stageManual=false;stageIntent=null;stageBusy=false;
      if(stage&&stage.state!=="floor")stage.interrupt("lab-stop");
      being.interrupt("lab-stage-stop");
      return true},
    setSubs:n=>{lastSubN=n|0;applySubs(n,!1)},setOnline(v){online=!!v;power()},get mode(){return mode},get subs(){return subs},get stage(){return build()},setMood,say,nudge,randomLine,place:replace,
    // What being-sync.mjs posts back to the desk: the drives as they stand, where he is on the
    // floor band (0..1 between the clock and the strip, the same band wander walks), and the
    // bag — worn, or dropped at its normalized viewport spot. Tiny on purpose: it rides the
    // public state document, so it stays a handful of numbers (docs/specs/behaviour-drives.md §10).
    getBeing(){const r=host.getBoundingClientRect(),cx=(r.left+r.width/2)/innerWidth*100,
      lo=minCenterX(),hi=Math.min(92,maxCenterX());
      return{v:1,savedAt:Date.now(),drives:being.peek().drives,
        floorX:hi>lo?clamp((cx-lo)/(hi-lo),0,1):.5,
        bag:{worn:bag.worn,...(bag.worn?{}:{x:clamp((bag.body?bag.body.x:r.left+r.width/2)/innerWidth,0,1),
          y:clamp((bag.body?bag.body.y:r.top+r.height*.22)/innerHeight,0,1)})}}},freeze(pose={}){frozen=!0;clearTimeout(timer); if(pose.mode)mode=pose.mode; if(pose.tag!==void 0)tagText=pose.tag; if(pose.subs!=null)applySubs(pose.subs,!1); lastDrawn=""; render({...REST[mode],tag:tagText,fx:pose.fx||1,sx:growth.sx,sy:growth.sy,...pose})},destroy(){disposed3d=true;clearTimeout(timer); clearTimeout(feelTimer); mo==null||mo.disconnect(); stripWatch==null||stripWatch.disconnect(); if(typeof removeEventListener=="function")removeEventListener("resize",replace); cancelJobs(); goHome(); crid3d&&crid3d.dispose(); host.remove()}}
}
