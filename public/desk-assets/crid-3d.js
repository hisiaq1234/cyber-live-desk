/* CRID 3D — the owner's real rigged Bitmoji (Snap CDN GLB, 167 bones, 100 facial morphs).
   This module is the renderer, not the brain: crid-bot.js keeps owning walk/gesture/mode state
   and hands it a snapshot each frame through getState(). Everything here is derived motion on
   Snap's own skeleton — no clips, no retargeting, no redrawn art.

   Failure is silent by design: any error (no WebGL, GLB 404, bad GPU) resolves to null and the
   caller keeps the 2D rig. ?crid3d=off forces the 2D path for A/B checks. */
const GLB="/desk-assets/crid3d/crid.glb";
// Morph target names live under face_shapes.*; we match by suffix so _L/_R variants resolve.
const M={jaw:"ai_jawOpen",eyeShutL:"ai_eyeUpperClose_L",eyeShutR:"ai_eyeUpperClose_R",
  eyeShutLL:"ai_eyeLowerClose_L",eyeShutLR:"ai_eyeLowerClose_R",
  smileL:"ai_mouthSmile_L",smileR:"ai_mouthSmile_R",
  frownL:"ai_mouthFrown_L",frownR:"ai_mouthFrown_R",
  browUpL:"ai_browUp_L",browUpR:"ai_browUp_R",
  browInL:"ai_browInnerUp_L",browInR:"ai_browInnerUp_R"};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),TAU=Math.PI*2,rand=(a,b)=>a+Math.random()*(b-a);
const swingOf=t=>{if(t<.5)return 0;const x=(t-.5)*2;return .5-.5*Math.cos(2*Math.PI*x)};

export async function initCrid3D(host,getState,onReady){
  try{
    const q=typeof location=="object"?new URLSearchParams(location.search):null;
    if(q&&(q.get("crid3d")==="off"||q.get("bot3d")==="off"))return null;
    if(typeof document=="undefined"||!host)return null;
    const probe=document.createElement("canvas");
    if(!probe.getContext||!(probe.getContext("webgl2")||probe.getContext("webgl")))return null;
    const THREE=await import("./vendor/three/three.module.js");
    const{GLTFLoader}=await import("./vendor/three/loaders/GLTFLoader.js");

    const canvas=document.createElement("canvas");
    canvas.className="crid3d";canvas.setAttribute("aria-hidden","true");
    canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    host.insertBefore(canvas,host.firstChild);

    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.05;

    const scene=new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfd8ff,0x2a2038,.95));
    const key=new THREE.DirectionalLight(0xfff2dd,2.1);key.position.set(1.4,2.2,1.6);scene.add(key);
    const rim=new THREE.DirectionalLight(0x8f7bff,1.0);rim.position.set(-1.6,1.4,-1.4);scene.add(rim);
    const cam=new THREE.PerspectiveCamera(32,1,.1,50);

    // Turn group: yaw (which way he faces) and roll (the lean) live here so the body pose stays clean.
    const turn=new THREE.Group(),model=new THREE.Group();turn.add(model);scene.add(turn);

    const bones={},morphs=[];
    const gltf=await new Promise((res,rej)=>new GLTFLoader().load(GLB,res,undefined,rej));
    const root=gltf.scene;
    root.traverse(o=>{
      if(o.isBone&&!bones[o.name]){bones[o.name]=o;o.userData.q0=o.quaternion.clone()}
      if(o.isMesh&&o.morphTargetDictionary){
        for(const[k,i]of Object.entries(o.morphTargetDictionary))morphs.push({m:o,i,k})}
    });
    model.add(root);

    // Fit: normalise height to ~1.5 world units, feet on y=0.
    model.updateMatrixWorld(!0);
    const box=new THREE.Box3().setFromObject(model),h=box.max.y-box.min.y;
    const s=h>1e-3?1.5/h:1;model.scale.setScalar(s);
    const feetY=box.min.y*s;
    model.position.y=-feetY;
    const dist=1.5/(2*Math.tan(cam.fov*Math.PI/360))*1.28;
    cam.position.set(0,.82,dist);cam.lookAt(0,.72,0);

    const B=n=>bones[n];
    const MORPH_CACHE={};
    const morph=name=>{
      if(name in MORPH_CACHE)return MORPH_CACHE[name];
      const want=M[name];if(!want)return MORPH_CACHE[name]=[];
      return MORPH_CACHE[name]=morphs.filter(x=>x.k===want||x.k.endsWith("."+want))};
    const setMorph=(name,v)=>{for(const x of morph(name))x.m.morphTargetInfluences[x.i]=v};
    const setMorphs=pairs=>{for(const[k,v]of pairs)setMorph(k,v)};

    // Per-bone delta rotation on top of the rest pose (bone.userData.q0).
    const E=new THREE.Euler(),Q=new THREE.Quaternion(),Q2=new THREE.Quaternion();
    const rot=(n,x=0,y=0,z=0)=>{const b=B(n);if(!b)return;E.set(x,y,z,"XYZ");Q.setFromEuler(E);Q2.copy(b.userData.q0).multiply(Q);b.quaternion.copy(Q2)};

    const J={
      pelvis:"C_pelvis0001_bind_JNT",spine2:"C_spine0002_bind_JNT",spine3:"C_spine0003_bind_JNT",
      neck1:"C_neck0001_bind_JNT",neck2:"C_neck0002_bind_JNT",head:"C_head_bind_JNT",
      thighL:"L_legUpper0001_bind_JNT",shinL:"L_legLower0001_bind_JNT",footL:"L_foot0001_bind_JNT",
      thighR:"R_legUpper0001_bind_JNT",shinR:"R_legLower0001_bind_JNT",footR:"R_foot0001_bind_JNT",
      armL:"L_armUpper0001_bind_JNT",foreL:"L_armLower0001_bind_JNT",
      armR:"R_armUpper0001_bind_JNT",foreR:"R_armLower0001_bind_JNT"};
    const has=k=>!!B(J[k]);

    let disposed=!1,raf=0,ready=!1,phase=0,heading=0;
    let blinkAt=2.5,blinkUntil=-1;                        // seconds on the drive() clock
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
        pr=clamp((p.pr||0)*Math.PI/180,-1.4,1.4);
      if(walking)phase=(phase+dt*(reduced?3.4:5.2))%1;
      const u=phase,tL=(u*2)%1,tR=(u*2+.5)%1,
        wL=walking?swingOf(tL):0,wR=walking?swingOf(tR):0,
        kL=walking?swingOf((tL+.5)%1):0,kR=walking?swingOf((tR+.5)%1):0;

      // Facing: eased yaw toward travel direction; a lean pulls him toward the panel.
      const dir=st.walkDir||(st.fx<0?-1:1),
        targetYaw=(walking?.95:0)*dir+(st.lean?st.lean.dir*.3:0);
      heading+=(targetYaw-heading)*Math.min(1,dt*7);
      turn.rotation.y=heading;
      turn.rotation.z=st.lean?st.lean.angle*Math.PI/180*.55:0;

      // Root height/scale from the 2D pose contract: by drops him, bs squashes him.
      const by=(p.by||0)/100,bs=clamp(p.bs||1,.8,1.15);
      model.position.y=-feetY-by*.9*s;
      model.scale.set(s*(1+.05*(1-bs)),s*bs,s*(1+.05*(1-bs)));

      // Gait: thigh swings forward/back, knee folds, arms counter-swing. All deltas on rest pose.
      const swing=.5,fold=.85,lift=.5;
      if(has("thighL"))rot(J.thighL,wL*swing*lift,0,0);
      if(has("shinL"))rot(J.shinL,-(kL*fold),0,0);
      if(has("thighR"))rot(J.thighR,-wR*swing*lift,0,0);
      if(has("shinR"))rot(J.shinR,kR*fold,0,0);
      if(has("footL"))rot(J.footL,(wL-kL)*.3,0,0);
      if(has("footR"))rot(J.footR,-(wR-kR)*.3,0,0);
      const armAmp=walking?.45:.1;
      if(has("armL"))rot(J.armL,-Math.sin(TAU*tL)*armAmp+.05,0,.1);
      if(has("foreL"))rot(J.foreL,.22+Math.abs(Math.sin(TAU*tL))*.18*(walking?1:.35),0,0);
      if(has("armR"))rot(J.armR,Math.sin(TAU*tL)*armAmp+.05,0,-.1);
      if(has("foreR"))rot(J.foreR,.22+Math.abs(Math.sin(TAU*tR))*.18*(walking?1:.35),0,0);

      // Torso: breath, weight shift, pose sway, crawl/push-up pitch (clamped).
      const br=Math.sin(t*1.7),w1=Math.sin(t*.9),w2=Math.sin(t*4.1),calm=reduced?.45:1;
      if(has("spine2"))rot(J.spine2,(.02*br+(p.tr||0)*.004+pr*.55)*calm,w1*.012*calm,(w1*.035+p.hr*.004)*calm+(grooving?.05*Math.sin(t*3):0));
      if(has("spine3"))rot(J.spine3,.015*br+.01*w2,0,w1*.02*calm);
      if(has("pelvis"))rot(J.pelvis,w2*.015*calm,0,w1*.02*calm);

      // Head: gaze params scaled down from the 2D pixel contract; doze/dead droop it.
      const gx=(p.gx||0)/60,gy=(p.gy||0)/60;
      const droop=mode==="doze"?.38:mode==="dead"?.55:dying?.3:0;
      if(has("neck1"))rot(J.neck1,droop*.5+gy*.3,clamp(gx,-.5,.5)*.5,0);
      if(has("neck2"))rot(J.neck2,droop*.4,0,0);
      if(has("head"))rot(J.head,droop*.5+gy*.3+br*.008,clamp(gx,-.6,.6)*.6+Math.sin(t*.5)*.04*calm,0);

      // Face: jaw while "talking", scheduled blink, doze/dead hold eyes shut, mood shapes.
      const talking=!!st.talking;
      const jaw=talking?(reduced?.12:.28)+.22*Math.abs(Math.sin(t*11))+.08*Math.sin(t*23):0;
      const shut=mode==="doze"?.75:mode==="dead"?.9:dying?.6:0;
      const blink=t>=blinkUntil?0:1;                  // blinkUntil is a deadline second
      setMorphs([["jaw",clamp(jaw,0,.85)],["eyeShutL",Math.max(shut,blink)],["eyeShutR",Math.max(shut,blink)],
        ["eyeShutLL",shut*.5],["eyeShutLR",shut*.5]]);
      const mood=st.mood||"idle";
      const smile=mood==="delighted"?.5:mood==="proud"?.4:mood==="curious"?.15:0;
      const frown=mood==="sulky"?.45:mood==="flustered"?.4:mood==="alarmed"?.35:0;
      const brow=mood==="curious"?.4:mood==="delighted"?.3:mood==="sleepy"?.25:0;
      setMorphs([["smileL",smile],["smileR",smile],["frownL",frown],["frownR",frown],
        ["browUpL",brow],["browUpR",brow],["browInL",brow*.6],["browInR",brow*.6]]);
    };

    let now=performance.now()/1000;
    const frame=()=>{
      if(disposed)return;
      raf=requestAnimationFrame(frame);
      const t=performance.now()/1000,dt=clamp(t-now,0,.05);now=t;
      if(document.hidden)return;
      // blink scheduler on the same seconds clock drive() uses
      if(t>=blinkAt){blinkUntil=t+.13;blinkAt=t+rand(2.6,6.2)*(reducedNow()?1.5:1)}
      const st=getState?getState():{};
      if(!ready){ready=!0;onReady&&onReady()}
      drive(t,dt,st);
      renderer.render(scene,cam)};
    raf=requestAnimationFrame(frame);

    return{get active(){return ready},dispose(){disposed=!0;cancelAnimationFrame(raf);ro&&ro.disconnect();
      renderer.dispose();gltf.scene.traverse(o=>{if(o.geometry)o.geometry.dispose()});canvas.remove()}};
  }catch(err){
    // Silent for the viewer, loud for whoever is debugging: the 2D rig carries the page either way.
    try{console.warn("[crid-3d] fallback to 2D rig:",err&&err.message||err)}catch{}
    return null}
}
