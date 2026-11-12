/* CRID 3D — the owner's real rigged Bitmoji (Snap CDN GLB, 167 bones, 100 facial morphs).
   This module is the renderer, not the brain: crid-bot.js keeps owning walk/gesture/mode state
   and hands it a snapshot each frame through getState(). Everything here is derived motion on
   Snap's own skeleton — no clips, no retargeting, no redrawn art.

   Joint axes were measured from the GLB itself (world transform of each bone):
     local X points along the limb for arms/legs; spine/neck/head share one convention —
     pitch = local Y, roll = local Z, yaw = local X.
   Legs swing fore/aft on local Y (positive Y = forward, toward the face). The bind
   pose faces +Z, so the model is turned 180° to meet the camera on -Z. Knees fold on +Y.
   Shoulders lower on local Z (L +, R -) — the bind pose is a wide A-pose, so the relaxed
   hang is part of every pose, not a one-time fix. Arm swing rides local X (L +, R -).

   Failure is silent by design: any error resolves to null and the caller keeps the 2D rig.
   ?crid3d=off forces the 2D path for A/B checks. */
import{createFacial}from"./facial.mjs";
import{TwoBoneIK}from"./ik.mjs";
const GLB="/desk-assets/crid3d/crid.glb";
const M={jaw:"ai_jawOpen",eyeShutL:"ai_eyeUpperClose_L",eyeShutR:"ai_eyeUpperClose_R",
  eyeShutLL:"ai_eyeLowerClose_L",eyeShutLR:"ai_eyeLowerClose_R",
  eyeHeavyL:"ai_eyeUpperClose_25_L",eyeHeavyR:"ai_eyeUpperClose_25_R",
  eyeWideUpL:"ai_eyeUpperWide_L",eyeWideUpR:"ai_eyeUpperWide_R",
  eyeWideLoL:"ai_eyeLowerWide_L",eyeWideLoR:"ai_eyeLowerWide_R",
  eyeLoSmileL:"ai_eyeLowerSmile_L",eyeLoSmileR:"ai_eyeLowerSmile_R",
  irisUpL:"ai_eyeIrisUp_L",irisUpR:"ai_eyeIrisUp_R",
  irisDownL:"ai_eyeIrisDown_L",irisDownR:"ai_eyeIrisDown_R",
  irisInL:"ai_eyeIrisIn_L",irisInR:"ai_eyeIrisIn_R",
  irisOutL:"ai_eyeIrisOut_L",irisOutR:"ai_eyeIrisOut_R",
  browInnerUpL:"ai_browInnerUp_L",browInnerUpR:"ai_browInnerUp_R",
  browInnerDnL:"ai_browInnerDn_L",browInnerDnR:"ai_browInnerDn_R",
  browDownL:"ai_browDown_L",browDownR:"ai_browDown_R",
  mouthDn:"ai_mouthDn",mouthUp:"ai_mouthUp",mouthLeft:"ai_mouthLeft",mouthRight:"ai_mouthRight",
  mouthFrownL:"ai_mouthFrown_L",mouthFrownR:"ai_mouthFrown_R",
  lipPuckerL:"ai_mouthIn_L",lipPuckerR:"ai_mouthIn_R",
  noseSneerL:"ai_noseSneer_L",noseSneerR:"ai_noseSneer_R",
  cheekPuffL:"ai_cheekPuff_L",cheekPuffR:"ai_cheekPuff_R",
  cheekSquintL:"ai_cheekSquint_L",cheekSquintR:"ai_cheekSquint_R",
  lipCornerSmileL:"ca_lipCornerSmile_L",lipCornerSmileR:"ca_lipCornerSmile_R",
  smileL:"ai_mouthSmile_L",smileR:"ai_mouthSmile_R",
  frownL:"ai_mouthFrown_L",frownR:"ai_mouthFrown_R",
  browUpL:"ai_browUp_L",browUpR:"ai_browUp_R",
  browInL:"ai_browInnerUp_L",browInR:"ai_browInnerUp_R"};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),TAU=Math.PI*2;
const swingOf=t=>{if(t<.5)return 0;const x=(t-.5)*2;return .5-.5*Math.cos(2*Math.PI*x)};

export async function initCrid3D(host,getState,onReady,onFail){
  try{
    const q=typeof location=="object"?new URLSearchParams(location.search):null;
    if(q&&(q.get("crid3d")==="off"||q.get("bot3d")==="off"))return null;
    // ?limbo=1 — silhouette staging: the same rig, the same bones, the same motion, but the
    // baked colour is crushed to near-black and a fog gradient sits behind him, so the figure
    // reads as one dark shape against haze. A skin over the character, never a second one.
    const limbo=!!(q&&(q.get("limbo")==="1"||q.get("crid")==="silhouette"));
    if(typeof document=="undefined"||!host)return null;
    const probe=document.createElement("canvas");
    if(!probe.getContext||!(probe.getContext("webgl2")||probe.getContext("webgl")))return null;
    const THREE=await import("./vendor/three/three.module.js");
    const{GLTFLoader}=await import("./vendor/three/loaders/GLTFLoader.js");

    const canvas=document.createElement("canvas");
    canvas.className="crid3d";canvas.setAttribute("aria-hidden","true");
    canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    host.insertBefore(canvas,host.firstChild);
    if(limbo){const fog=document.createElement("div");
      fog.style.cssText="position:absolute;inset:-14%;pointer-events:none;z-index:0;background:radial-gradient(ellipse 62% 58% at 50% 60%,rgba(198,206,224,0) 30%,rgba(198,206,224,.34) 66%,rgba(206,212,228,.55) 100%)";
      host.insertBefore(fog,canvas)}

    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    // The GLB base colors are Snap's already-lit shader bakes (____Shader_*), not flat albedo.
    // Tone mapping and extra lights would shift that color. Show the map as stored.
    renderer.toneMapping=THREE.NoToneMapping;

    const scene=new THREE.Scene();
    const cam=new THREE.PerspectiveCamera(32,1,.1,50);

    // Camera sits at -Z. The bind pose faces +Z, so a half turn on the model
    // puts the face toward the camera. Turn group still carries walk yaw and lean.
    // Gait signs below are flipped to match: local -Y is the back, forward is +Y.
    const turn=new THREE.Group(),model=new THREE.Group();turn.add(model);scene.add(turn);
    model.rotation.y=Math.PI;

    const bones={},morphs=[];
    const gltf=await new Promise((res,rej)=>new GLTFLoader().load(GLB,res,undefined,rej));
    const root=gltf.scene;
    root.traverse(o=>{
      if(o.isBone&&!bones[o.name]){bones[o.name]=o;o.userData.q0=o.quaternion.clone()}
      if(o.isMesh&&o.morphTargetDictionary){
        for(const[k,i]of Object.entries(o.morphTargetDictionary))morphs.push({m:o,i,k})}
    });
    model.add(root);
    // Base-color maps are the shaded image. Draw them unlit so the pixel is the texture's pixel.
    const dress=m=>{
      if(!m||!m.isMaterial||!m.map)return m;
      const name=m.name||"";
      const thin=/bag|eyelash|hair|facialhair|brow|earring/i.test(name);
      return new THREE.MeshBasicMaterial({
        name,map:m.map,color:limbo?0x0d0a16:0xffffff,
        transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,
        side:thin?THREE.DoubleSide:m.side,depthWrite:m.depthWrite
      });
    };
    root.traverse(o=>{
      if(!o.material)return;
      if(Array.isArray(o.material))o.material=o.material.map(dress);
      else o.material=dress(o.material);
    });
    // Snap's skinned meshes ship degenerate bind-pose bounds — three.js frustum-culls
    // them every frame and he never draws. Skeleton joints are the truth; disable culling.
    root.traverse(o=>{if(o.isMesh||o.isSkinnedMesh)o.frustumCulled=false});
    // The pack is Snap's own bag mesh, skinned to his spine — worn it rides his
    // back in 3D. crid-bot reports bag.worn through the snapshot; a dropped bag
    // hides this and the SVG prop on the floor is the only bag left.
    const bagMeshes=[];root.traverse(o=>{if(/bag/i.test(o.name||""))bagMeshes.push(o)});

    // Fit: bounds come from the SKELETON joints, not the skinned-mesh bbox — morph targets and
    // bind-pose geometry can report a degenerate box that flings the model off-camera.
    model.updateMatrixWorld(!0);
    const vp=new THREE.Vector3();let y0=1e9,y1=-1e9;
    for(const n in bones){bones[n].getWorldPosition(vp);if(vp.y<y0)y0=vp.y;if(vp.y>y1)y1=vp.y}
    const h=(y1-y0)>1e-3?y1-y0:1.7,s=1.5/h;
    model.scale.setScalar(s);
    const feetY=y0*s;
    model.position.y=-feetY;

    // ---- the body ladder, inside the mesh ----------------------------------------------
    // One GLB is one build; the seven stages are that same body at a girth factor k
    // (docs/specs/crid-360.md). Bones are not scaled — that bent him — so the bind-pose
    // vertices of the body and kit meshes are displaced instead: x/z offsets from the
    // body axis grow by k, masked by height so feet, legs and the head keep their own
    // measure while chest, waist, belly and arms all take the same concurrent change.
    // y is never touched: height and head size are fixed on every stage.
    const STAGE_K={"3":.82,"0":.95,"4":.95,"5":1.10,"1":1.03,"11":1.13,"2":1.28};
    const girth=[];
    root.traverse(o=>{
      if(!o.isMesh||!o.geometry)return;
      if(/head|eye|hair|brow|mouth|earring|lash|bag/i.test(o.name||""))return;
      const pos=o.geometry.attributes.position; if(!pos||!pos.count)return;
      const n=pos.count,orig=new Float32Array(n*3),w=new Float32Array(n);
      let cx=0,cz=0;
      for(let i=0;i<n;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),j=i*3;
        orig[j]=x;orig[j+1]=y;orig[j+2]=z;cx+=x;cz+=z}
      cx/=n;cz/=n;
      for(let i=0;i<n;i++){const t=clamp((orig[i*3+1]-y0)/(y1-y0||1),0,1);
        // shins/feet carry half the change, torso and arms the full k, the neck tapers off
        w[i]=t<.14?.45:t<.24?.45+(t-.14)/.10*.55:t<.8?1:t<.92?1-(t-.8)/.12*.6:.4}
      girth.push({pos,orig,w,cx,cz})});
    let curK=1,targetK=1,appliedK=-1,curStage=null;
    const applyGirth=k=>{for(const g of girth){const p=g.pos;
      for(let i=0;i<g.w.length;i++){const s=1+(k-1)*g.w[i],j=i*3;
        p.setXYZ(i,g.cx+(g.orig[j]-g.cx)*s,g.orig[j+1],g.cz+(g.orig[j+2]-g.cz)*s)}
      p.needsUpdate=!0}};
    const dist=1.5/(2*Math.tan(cam.fov*Math.PI/360))*1.3;
    cam.position.set(0,.8,-dist);cam.lookAt(0,.7,0);

    // Contact shadow: a soft radial blob on the floor plane, so he stands IN the room.
    const shC=document.createElement("canvas");shC.width=shC.height=128;
    const shG=shC.getContext("2d"),shGrad=shG.createRadialGradient(64,64,10,64,64,62);
    shGrad.addColorStop(0,"rgba(5,3,10,.6)");shGrad.addColorStop(.65,"rgba(5,3,10,.32)");shGrad.addColorStop(1,"rgba(5,3,10,0)");
    shG.fillStyle=shGrad;shG.fillRect(0,0,128,128);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.55),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shC),transparent:!0,depthWrite:!1}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.014;shadow.renderOrder=-1;
    turn.add(shadow);

    const B=n=>bones[n];
    const MORPH_CACHE={};
    const morph=name=>{
      if(name in MORPH_CACHE)return MORPH_CACHE[name];
      const want=M[name];if(!want)return MORPH_CACHE[name]=[];
      return MORPH_CACHE[name]=morphs.filter(x=>x.k===want||x.k.endsWith("."+want))};
    const setMorph=(name,v)=>{for(const x of morph(name))if(x.m.morphTargetInfluences)x.m.morphTargetInfluences[x.i]=v};

    // Delta rotation on top of each bone's rest pose (userData.q0).
    const E=new THREE.Euler(),Q=new THREE.Quaternion(),Q2=new THREE.Quaternion();
    const rot=(n,x=0,y=0,z=0)=>{const b=B(n);if(!b)return;E.set(x,y,z,"XYZ");Q.setFromEuler(E);Q2.copy(b.userData.q0).multiply(Q);b.quaternion.copy(Q2)};

    const J={
      pelvis:"C_pelvis0001_bind_JNT",spine2:"C_spine0002_bind_JNT",spine3:"C_spine0003_bind_JNT",
      neck1:"C_neck0001_bind_JNT",neck2:"C_neck0002_bind_JNT",head:"C_head_bind_JNT",
      thighL:"L_legUpper0001_bind_JNT",shinL:"L_legLower0001_bind_JNT",footL:"L_foot0001_bind_JNT",
      thighR:"R_legUpper0001_bind_JNT",shinR:"R_legLower0001_bind_JNT",footR:"R_foot0001_bind_JNT",
      armL:"L_armUpper0001_bind_JNT",foreL:"L_armLower0001_bind_JNT",handL:"L_hand0001_bind_JNT",
      armR:"R_armUpper0001_bind_JNT",foreR:"R_armLower0001_bind_JNT",handR:"R_hand0001_bind_JNT"};
    const has=k=>!!B(J[k]);
    // The bind pose holds his arms wide (A-pose); the relaxed hang is the baseline of every pose.
    const RELAX={armL:{z:1.12},armR:{z:-1.12},foreL:{x:.3},foreR:{x:-.3}};

    let disposed=!1,raf=0,ready=!1,phase=0,heading=0,bagShown=true,ikW=0;
    const ikSolver=new TwoBoneIK();let ikLast=null,ikDbg="";
    const _iv=new THREE.Vector3(),_id=new THREE.Vector3(),_it=new THREE.Vector3(),
      _ic=new THREE.Vector3(),_ip=new THREE.Vector3(),_io=new THREE.Vector3(),
      _idv=new THREE.Vector3(),_iq=new THREE.Quaternion(),_ih=new THREE.Vector3();
    try{window.__cridIk={w:()=>ikW,last:()=>ikLast,dbg:()=>ikDbg}}catch{}
    const face=createFacial();let lastFaceKey=null;
    // Read-only handle for visual QA: the shot harness polls channels() to catch
    // a blink at its peak, and morph() proves the weight actually reached the GLB.
    try{window.__cridFace={channels:()=>face.channels(),
      morph:name=>{let v=0;for(const x of morph(name))if(x.m.morphTargetInfluences)v=Math.max(v,x.m.morphTargetInfluences[x.i]||0);return v}}}catch{}
    const reducedNow=()=>{try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch{return!1}};

    const resize=()=>{
      const r=host.getBoundingClientRect();
      renderer.setSize(Math.max(2,r.width),Math.max(2,r.height),!1);
      cam.aspect=r.width/Math.max(1,r.height);cam.updateProjectionMatrix()};
    resize();
    const ro=typeof ResizeObserver=="function"?new ResizeObserver(resize):null;
    ro&&ro.observe(host);

    const drive=(t,dt,st)=>{
      const p=st.p||{},mode=st.mode||"dead",dying=!!st.dying,
        alive=mode==="on"&&!dying,walking=!!st.walking&&alive,
        reduced=st.reduced||reducedNow(),grooving=!!st.grooving,
        pr=clamp((p.pr||0)*Math.PI/180,-1.2,1.2);
      if(walking)phase=(phase+dt*(reduced?3.4:5.2))%1;
      const u=phase,gait=Math.sin(TAU*u),          // one full gait cycle per phase wrap
        kL=walking?swingOf(((u*2)%1+.5)%1):0,kR=walking?swingOf(((u*2+.5)%1+.5)%1):0,
        wL=-gait*(walking?1:0),wR=gait*(walking?1:0);

      // Facing: eased yaw toward travel direction; a lean pulls him toward the panel.
      const dir=st.walkDir||(st.fx<0?-1:1),
        targetYaw=(walking?.85:0)*dir+(st.lean?st.lean.dir*.3:0);
      heading+=(targetYaw-heading)*Math.min(1,dt*7);
      turn.rotation.y=heading;
      turn.rotation.z=st.lean?st.lean.angle*Math.PI/180*.55:0;

      const by=(p.by||0)/100,bs=clamp(p.bs||1,.8,1.15);
      // Stage: the bot names his build; the mesh eases to that girth over ~a second so a sub
      // milestone reads as him filling out, not as a pop. First sighting snaps — no boot swell.
      if(st.stage&&st.stage!==curStage){curStage=st.stage;targetK=STAGE_K[st.stage]??1;if(appliedK<0)curK=targetK}
      curK+=(targetK-curK)*Math.min(1,dt*4);
      if(Math.abs(curK-appliedK)>.0005){applyGirth(curK);appliedK=curK}
      model.position.y=-feetY-by*.9*s+(walking?Math.abs(Math.sin(TAU*u))*.035*s:Math.sin(t*1.55)*.012*s);
      model.scale.set(s*(1+.05*(1-bs)),s*bs,s*(1+.05*(1-bs)));

      const br=Math.sin(t*1.55),w1=Math.sin(t*.62),calm=reduced?.4:1;
      const life=(mode==="on"&&!dying?1:.22)*calm;
      const still=(walking?0:1)*life,droop=mode==="doze"?.42:mode==="dead"?.6:dying?.35:0;
      const swing=walking?1:still*.55;

      // Standing idle is a person, not a statue: breath in the chest, weight moving
      // from foot to foot, the head looking off the same clock. Amplitudes are large
      // enough to read at desk size. The GLB has no clips; this is the motion.
      const shift=Math.sin(t*.5);                         // hip to hip, about 12s
      const look=Math.sin(t*.33),look2=Math.sin(t*.19+1.4);

      // Legs: local +Y is forward (toward the face). Knees still fold on +Y.
      // Idle settles onto the weighted foot instead of locking both legs straight.
      if(has("thighL"))rot(J.thighL,0,gait*.55*walking+still*(shift*.04),0);
      if(has("shinL"))rot(J.shinL,0,(kL*.85+still*Math.max(0,shift)*.12)*calm,0);
      if(has("footL"))rot(J.footL,0,(wL-kL)*.22+still*shift*.03,0);
      if(has("thighR"))rot(J.thighR,0,-gait*.55*walking-still*(shift*.04),0);
      if(has("shinR"))rot(J.shinR,0,-(kR*.85+still*Math.max(0,-shift)*.12)*calm,0);
      if(has("footR"))rot(J.footR,0,-(wR-kR)*.22-still*shift*.03,0);

      // Arms hang and drift against the weight. They do not swing as one piece.
      if(has("armL"))rot(J.armL,gait*.45*swing+still*(Math.sin(t*.7)*.1+shift*.05),0,RELAX.armL.z+still*w1*.04);
      if(has("foreL"))rot(J.foreL,RELAX.foreL.x+still*Math.sin(t*.7+.8)*.08+gait*.16*swing,0,0);
      if(has("armR"))rot(J.armR,-gait*.45*swing-still*(Math.sin(t*.7+1.2)*.1-shift*.05),0,RELAX.armR.z-still*w1*.04);
      if(has("foreR"))rot(J.foreR,RELAX.foreR.x-still*Math.sin(t*.7+2)*.08-gait*.16*swing,0,0);

      // Torso: breath lifts the chest, the pelvis carries the weight shift.
      if(has("spine2"))rot(J.spine2,(.07*br-pr*.55+(p.tr||0)*.004)*life,(look*.05)*life,
        (shift*.09+(p.hr||0)*.004+(grooving?.08*Math.sin(t*3):0))*life);
      if(has("spine3"))rot(J.spine3,(.05*br-pr*.2)*life,look*.04*life,shift*.04*life);
      if(has("pelvis"))rot(J.pelvis,br*.015*life,0,shift*.1*life);

      // Head follows the shift late, and looks off-axis so he is not staring through the lens.
      const gx=(p.gx||0)/60,gy=(p.gy||0)/60;
      if(has("neck1"))rot(J.neck1,-droop*.5-gy*.3+look2*.06*life,clamp(gx,-.5,.5)*.5+look*.08*life,shift*.03*life);
      if(has("neck2"))rot(J.neck2,-droop*.4+br*.02*life,look*.05*life,0);
      if(has("head"))rot(J.head,-droop*.55-gy*.3+br*.025*life,clamp(gx,-.6,.6)*.6+look*.16*life,shift*.04*life);

      // Face: the performance layer — gaze saccades, the blink engine, doze/dead
      // lid hold, talking jaw, and the emotion envelope crid-bot cues in.
      if(st.face&&st.face.name){const fk=st.face.name+":"+(st.face.seq||0);
        if(fk!==lastFaceKey){lastFaceKey=fk;face.cue(st.face.name,st.face.hold)}}
      face.update(dt,{t,dt,talking:!!st.talking,mode,dying,reduced,gx:p.gx,gy:p.gy,attend:st.attend});
      const fc=face.channels();
      for(const k in fc)setMorph(k,fc[k]);

      // The pack: Snap's bag mesh is on his back only while the snapshot says he
      // wears it — a dropped bag leaves the floor prop as the only bag in the room.
      const showBag=st.bag!==false;
      if(showBag!==bagShown){bagShown=showBag;for(const m of bagMeshes)m.visible=showBag}

      // Hand plant (Phase C groundwork): while he leans on a panel, the touching
      // arm solves onto the contact point crid-bot measured in screen px. The
      // solve target lerps from the hand's own position by ikW, so weight 0 is
      // a no-op and the reach eases in with the lean — no quaternion blending.
      // bs widens past 1 only in SEQ frames; past ~15% the solver's quaternion
      // decompose degrades, so extreme poses keep the procedural arm.
      const leanOn=!!(st.lean&&alive),uniform=Math.abs(bs-1)<.15;
      ikW+=((leanOn&&uniform?1:0)-ikW)*Math.min(1,dt*4);
      ikDbg=`w=${ikW.toFixed(2)} lean=${!!st.lean} alive=${alive} uni=${uniform} bs=${bs} c=${!!(st.lean&&st.lean.contact)}`;
      if(ikW>.02&&leanOn&&uniform){
        const sd=st.lean.dir>0?"R":"L";
        const sh=B(J["arm"+sd]),fo=B(J["fore"+sd]),ha=B(J["hand"+sd]),c=st.lean.contact;
        if(sh&&fo&&ha&&c){
          model.updateMatrixWorld(!0);cam.updateMatrixWorld(!0);
          const r=host.getBoundingClientRect();
          // Screen-space reach: the hand's own projected px plus ikW of the pixel
          // distance to the contact point. The desired px is unprojected back
          // through the camera at the hand's view depth — the solve only ever
          // asks for a lateral reach the arm can actually make, and it converges
          // on the panel as ikW→1 (solver clamps if the panel is truly out of reach).
          ha.getWorldPosition(_ih);_io.copy(_ih).project(cam);   // _io = hand NDC
          const hx0=r.left+(_io.x+1)/2*r.width,hy0=r.top+(1-_io.y)/2*r.height;
          const px=hx0+(c.x-hx0)*ikW,py=hy0+(c.y-hy0)*ikW;
          const ndx=((px-r.left)/r.width)*2-1,ndy=-(((py-r.top)/r.height)*2-1);
          _iv.set(ndx,ndy,0).unproject(cam);_id.copy(_iv).sub(cam.position).normalize();
          _ic.copy(_ih).applyMatrix4(cam.matrixWorldInverse);   // hand view pos (z<0)
          _idv.copy(_id).applyQuaternion(_iq.copy(cam.quaternion).invert());
          const tt=_ic.z/_idv.z;
          if(tt>0){
            _it.copy(cam.position).addScaledVector(_id,tt);
            _ic.copy(_ih).lerp(_it,ikW);
            sh.getWorldPosition(_ip);_ip.add(_io.set(st.lean.dir*.12,-.5,.3));
            ikLast=ikSolver.solve({rootBone:sh,middleBone:fo,endBone:ha,target:_ic,poleTarget:_ip,preserveEndRotation:!0});
            ikLast.tgt=_ic.toArray().map(v=>+v.toFixed(3));ikLast.h0=_ih.toArray().map(v=>+v.toFixed(3));ikLast.pl=_ip.toArray().map(v=>+v.toFixed(3));
            ikLast.px=[hx0|0,hy0|0,c.x|0,c.y|0,px|0,py|0];
            ha.getWorldPosition(_ip).project(cam);   // QA: where the hand actually landed, host px
            ikLast.hx=((_ip.x+1)/2*r.width+r.left).toFixed(1);ikLast.hy=((1-_ip.y)/2*r.height+r.top).toFixed(1);
          }
        }
      }
    };

    let now=performance.now()/1000;
    const frame=()=>{
      if(disposed)return;
      raf=requestAnimationFrame(frame);
      const t=performance.now()/1000,dt=clamp(t-now,0,.05);now=t;
      if(document.hidden)return;
      const st=getState?getState():{};
      if(!ready){ready=!0;onReady&&onReady()}
      try{drive(t,dt,st);renderer.render(scene,cam)}
      catch(err){
        // A bad frame is logged and skipped. It does not dispose the model or hand the
        // page back to the 2D figure — the canvas is him.
        try{console.warn("[crid-3d] frame skipped:",err&&err.message||err)}catch{}}};
    raf=requestAnimationFrame(frame);

    return{get active(){return ready},dispose(){disposed=!0;cancelAnimationFrame(raf);ro&&ro.disconnect();
      renderer.dispose();gltf.scene.traverse(o=>{if(o.geometry)o.geometry.dispose()});canvas.remove()}};
  }catch(err){
    try{console.warn("[crid-3d] init failed:",err&&err.message||err)}catch{}
    throw err}
}
