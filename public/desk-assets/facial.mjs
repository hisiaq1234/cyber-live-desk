/* CRID FACE — the performance layer over the GLB's ~100 face_shapes.ai_* morphs.
   Pure JS, no three.js: update() consumes a state snapshot, channels() emits
   {semanticName: weight} for the renderer to write through its morph table.

   Structure follows .devin/skills/crid-acting/references/animation-principles.md:
   an emotion is an envelope (ease-in onset, hold, slower release), blinks and
   saccades are scheduled events that never land on the beat of an action, and
   every channel eases — nothing snaps.

   Channel names are semantic ("smileL", "irisUpR"); crid-3d.js maps them onto
   the GLB's morph names. Weights are 0..1, additive regions blend by sum. */

const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const TAU=Math.PI*2;
const out3=x=>1-Math.pow(1-x,3);                 // energy spent: fast in
const inOut3=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
const back=(x,s=1.9)=>1+(s+1)*Math.pow(x-1,3)+s*Math.pow(x-1,2); // pop with settle

/* The eight micro-emotions (brain/micro-emotions.mjs names). w = steady-state
   morph weights at full envelope; onset/release/overshoot shape the timing.
   L/R suffixes are his left/right — asymmetry is the point of smug, flustered,
   curious. */
/* Every weight is per-side (…L/…R) so asymmetry is expressible; symmetric
   feelings just write both sides. eyeHeavy* = the authored 25% lid targets —
   heavy-lidded, not blink-shut. */
const EMO={
  curious:{w:{browInnerUpL:.55,browInnerUpR:.55,browUpL:.3,browUpR:.3,
    smileL:.16,smileR:.22,mouthLeft:.18},onset:.28,release:.55},
  delighted:{w:{smileL:.85,smileR:.85,lipCornerSmileL:.7,lipCornerSmileR:.7,
    cheekSquintL:.35,cheekSquintR:.35,eyeLoSmileL:.5,eyeLoSmileR:.5,
    browUpL:.45,browUpR:.45,browInnerUpL:.3,browInnerUpR:.3,
    eyeWideUpL:.22,eyeWideUpR:.22,eyeWideLoL:.2,eyeWideLoR:.2},
    onset:.22,release:.6,over:.12},
  smug:{w:{smileR:.55,lipCornerSmileR:.6,mouthRight:.3,browUpR:.5,
    browInnerUpL:.35,eyeHeavyL:.25,eyeHeavyR:.15},onset:.3,release:.7},
  flustered:{w:{browUpL:.7,browUpR:.7,browInnerUpL:.6,browInnerUpR:.6,
    eyeWideUpL:.4,eyeWideUpR:.4,eyeWideLoL:.3,eyeWideLoR:.3,
    jaw:.18,lipPuckerL:.4,lipPuckerR:.4,cheekPuffL:.15,cheekPuffR:.15,
    noseSneerL:.2,noseSneerR:.2},onset:.18,release:.5,over:.1},
  sleepy:{w:{eyeHeavyL:.5,eyeHeavyR:.5,browInnerDnL:.4,browInnerDnR:.4,
    browDownL:.3,browDownR:.3,mouthDn:.2},onset:.5,release:.8},
  startled:{w:{eyeWideUpL:.7,eyeWideUpR:.7,eyeWideLoL:.55,eyeWideLoR:.55,
    browUpL:.8,browUpR:.8,browInnerUpL:.7,browInnerUpR:.7,
    jaw:.55,mouthUp:.3},onset:.12,release:.4,over:.25},
  proud:{w:{smileL:.4,smileR:.45,lipCornerSmileL:.3,lipCornerSmileR:.35,
    browInnerUpL:.15,browInnerUpR:.15,eyeHeavyL:.1,eyeHeavyR:.1},
    onset:.35,release:.6},
  sulky:{w:{mouthFrownL:.6,mouthFrownR:.6,mouthDn:.25,
    browInnerUpL:.5,browInnerUpR:.5,browDownL:.3,browDownR:.3,
    eyeHeavyL:.2,eyeHeavyR:.2,lipPuckerL:.15,lipPuckerR:.15},onset:.4,release:.8}
};
/* Channel weights the face idles at — near-zero, alive. Micro-drift is added
   per-frame so the resting face breathes instead of freezing. */
const IDLE={smileL:.04,smileR:.05,browInnerUpL:.05,browInnerUpR:.05};

export function createFacial({rand=Math.random}={}){
  const cur={};                 // smoothed channel weights
  let lastT=0;                  // clock of the last update() — cue() timestamps on it
  let envName=null,envAt=0,envHold=1.4;   // active emotion envelope
  // blink engine: every 2.5–4.5 s (×1.5 under reduced motion), ~0.14 s close,
  // eyes 1 frame (~16 ms) apart, ~12% asymmetric half-blinks.
  let nextBlink=rand(1.5,3),blinkT=-1,blinkAsym=0,blinkDur=.14;
  // gaze: saccades on a 1.4–3.2 s clock plus slow drift; eyes lead the head.
  let sacAt=rand(.8,2),sacFrom={x:0,y:0},sacTo={x:0,y:0},sacT=1,sacDur=.16;
  const drift={x:0,y:0};

  const smooth=(k,v,dt,rate)=>{cur[k]=(cur[k]||0)+(v-(cur[k]||0))*Math.min(1,dt*rate);if(Math.abs(cur[k])<.001)cur[k]=0};

  function envelope(t){
    if(!envName)return 0;
    const e=EMO[envName]; if(!e)return 0;
    const el=t-envAt;   // both on the update() clock, seconds
    if(el<0)return 0;
    if(el<e.onset)return e.over?back(clamp(el/e.onset,0,1),1+e.over*8):out3(el/e.onset);
    if(el<e.onset+envHold)return 1;
    const r=clamp((el-e.onset-envHold)/e.release,0,1);
    return 1-inOut3(r);
  }

  /* One frame. input: {t,dt,talking,mode,dying,reduced,gx,gy}
     gx/gy are the pose's look offsets (2D units; /60 inside). */
  function update(dt,input){
    const t=input.t||0;lastT=t;
    const mode=input.mode||"on",dying=!!input.dying;
    const alive=mode==="on"&&!dying;
    const emo=alive?envelope(t):0;
    const e=EMO[envName]||{w:{}};

    // ---- scheduled events -------------------------------------------------
    // Blink: never on the beat of an action — it just has its own clock.
    if(t>=nextBlink){
      blinkT=t;blinkDur=.12+rand(0,.08);
      blinkAsym=rand()<.12?(rand()<.5?-1:1):0;   // which eye leads, if asymmetric
      nextBlink=t+(2.5+rand(0,2))*(input.reduced?1.6:1)*(mode==="doze"?.5:1);
    }
    const bt=t-blinkT;
    // blink curve: 35% close, 30% hold, 35% open — ~3-4 frames of real closure
    let blinkL=0,blinkR=0;
    if(bt>=0&&bt<blinkDur){
      const u=bt/blinkDur;
      const c=u<.35?u/.35:u<.65?1:(1-u)/.35;
      blinkL=c;blinkR=blinkAsym?(u<.3?c*.8:(u<.55?c:(1-u)/.4)):c;
    }
    // Doze/dead hold eyes shut; heavy-lid emotion channels ride on top.
    const shutBase=mode==="doze"?.7:mode==="dead"?.95:dying?.6:0;
    const lidL=Math.min(1,Math.max(shutBase,blinkL));
    const lidR=Math.min(1,Math.max(shutBase,blinkR));

    // ---- gaze -------------------------------------------------------------
    // saccade scheduler: pick a small offset, snap there fast (eyes lead the
    // head), hold, drift. gx/gy from the pose bias the target.
    if(t>=sacAt&&sacT>=1){
      sacFrom={...sacTo};
      sacTo={x:rand(-.35,.35),y:rand(-.3,.3)};
      sacT=0;sacDur=.1+rand(0,.12);sacAt=t+rand(1.4,3.2);
    }
    if(sacT<1)sacT=Math.min(1,sacT+dt/sacDur);
    const se=out3(sacT);
    const gx=clamp(((input.gx||0)/60)*2.2,-1,1),gy=clamp(((input.gy||0)/60)*2.2,-1,1);
    drift.x+= (rand(-.02,.02)-drift.x)*Math.min(1,dt*.5);
    drift.y+= (rand(-.015,.015)-drift.y)*Math.min(1,dt*.5);
    const lookX=sacFrom.x+(sacTo.x-sacFrom.x)*se+gx*.8+drift.x;
    const lookY=sacFrom.y+(sacTo.y-sacFrom.y)*se+gy*.8+drift.y;
    const lx=clamp(lookX,-1,1),ly=clamp(lookY,-1,1);

    // ---- channel assembly ---------------------------------------------------
    const tgt={};
    const put=(k,v)=>{if(v)tgt[k]=(tgt[k]||0)+v};
    // idle life: barely-there asymmetry so the resting face is never a mask
    const life=alive?1:.3;
    for(const[k,v]of Object.entries(IDLE))put(k,v*life);
    // emotion envelope over the recipe
    for(const[k,w]of Object.entries(e.w))put(k,w*emo);
    // lids from blink/doze/death + emotion (emotion lid keys are eyeShut*/eyeShut25*)
    put("eyeShutL",lidL);put("eyeShutR",lidR);
    if(shutBase>0){put("eyeShutLL",shutBase*.5);put("eyeShutLR",shutBase*.5)}
    // gaze: his left = viewer's right. gx<0 is look-left in the 2D pose space
    // (SEQ glanceL uses gx:-4), which is his right → irisOutR + irisInL.
    const gxw=clamp(Math.abs(lx)*.9,0,.9),gyw=clamp(Math.abs(ly)*.9,0,.9);
    if(lx<-.05){put("irisInL",gxw);put("irisOutR",gxw)}
    else if(lx>.05){put("irisOutL",gxw);put("irisInR",gxw)}
    if(ly<-.05){put("irisUpL",gyw);put("irisUpR",gyw)}
    else if(ly>.05){put("irisDownL",gyw);put("irisDownR",gyw)}
    // talking jaw — same rhythm the renderer used, now inside the face
    const talking=!!input.talking&&alive;
    const talkJaw=talking?(input.reduced?.12:.28)+.22*Math.abs(Math.sin(t*11))+.08*Math.sin(t*23):0;
    put("jaw",Math.max(talkJaw,emo*(e.w.jaw||0)));
    // doze/dead soften the mouth
    if(mode==="doze")put("mouthDn",.25*shutBase);
    if(mode==="dead")put("mouthDn",.4);

    for(const[k,v]of Object.entries(tgt))smooth(k,clamp(v,0,1),dt,k.startsWith("iris")?18:10);
    for(const k in cur)if(!(k in tgt))smooth(k,0,dt,10);   // released channels decay home
  }

  return{
    update,
    cue(name,hold){const e=EMO[name];if(!e)return!1;envName=name;envAt=lastT;
      envHold=clamp((Number(hold)||1400)/1000,.4,4);return!0},   // hold arrives in ms like FEEL
    channels(){return{...cur}},
    get emotion(){return envName},
    reset(){for(const k in cur)cur[k]=0;envName=null}
  };
}
