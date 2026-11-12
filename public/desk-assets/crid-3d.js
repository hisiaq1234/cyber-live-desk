/* CRID 3D — the owner's real rigged Bitmoji (Snap CDN GLB, 167 bones, 100 facial morphs).
   This module is the renderer, not the brain: crid-bot.js keeps owning walk/gesture/mode state
   and hands it a snapshot each frame through getState(). Everything here is derived motion on
   Snap's own skeleton — no clips, no retargeting, no redrawn art.

   Joint axes were measured from the GLB itself (world transform of each bone):
     local X points along the limb for arms/legs; spine/neck/head share one convention —
     pitch = local Y, roll = local Z, yaw = local X.
   Legs swing fore/aft on local Y (negative Y = forward, he faces -Z), knees fold on +Y.
   Shoulders lower on local Z (L +, R -) — the bind pose is a wide A-pose, so the relaxed
   hang is part of every pose, not a one-time fix. Arm swing rides local X (L +, R -).

   Failure is silent by design: any error resolves to null and the caller keeps the 2D rig.
   ?crid3d=off forces the 2D path for A/B checks. */
const GLB="/desk-assets/crid3d/crid.glb";
const M={jaw:"ai_jawOpen",eyeShutL:"ai_eyeUpperClose_L",eyeShutR:"ai_eyeUpperClose_R",
  eyeShutLL:"ai_eyeLowerClose_L",eyeShutLR:"ai_eyeLowerClose_R",
  smileL:"ai_mouthSmile_L",smileR:"ai_mouthSmile_R",
  frownL:"ai_mouthFrown_L",frownR:"ai_mouthFrown_R",
  browUpL:"ai_browUp_L",browUpR:"ai_browUp_R",
  browInL:"ai_browInnerUp_L",browInR:"ai_browInnerUp_R"};
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n)),TAU=Math.PI*2,rand=(a,b)=>a+Math.random()*(b-a);
const swingOf=t=>{if(t<.5)return 0;const x=(t-.5)*2;return .5-.5*Math.cos(2*Math.PI*x)};

export async function initCrid3D(host,getState,onReady,onFail){
  try{
    const q=typeof location=="object"?new URLSearchParams(location.search):null;
    if(q&&(q.get("crid3d")==="off"||q.get("bot3d")==="off"))return null;
    if(typeof document=="undefined"||!host)return null;
    const probe=document.createElement("canvas");
    if(!probe.getContext||!(probe.getContext("webgl2")||probe.getContext("webgl")))return null;
    const THREE=await import("./vendor/three/three.module.js");
    const{GLTFLoader}=await import("./vendor/three/loaders/GLTFLoader.js");
    const{RoomEnvironment}=await import("./vendor/three/environments/RoomEnvironment.js");

    const canvas=document.createElement("canvas");
    canvas.className="crid3d";canvas.setAttribute("aria-hidden","true");
    canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
    host.insertBefore(canvas,host.firstChild);

    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"low-power"});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.18;

    const scene=new THREE.Scene();
    // Image-based lighting: Snap's materials are PBR — without an environment map they render
    // flat and grey. A neutral studio room gives skin, cloth and hair their real response.
    const pmrem=new THREE.PMREMGenerator(renderer);
    scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xd8e2ff,0x241a33,.6));
    const key=new THREE.DirectionalLight(0xfff0d8,2.6);key.position.set(1.2,2.3,-1.7);scene.add(key);
    const fill=new THREE.DirectionalLight(0x9db4ff,.9);fill.position.set(-1.7,1.1,-1.1);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xc4b0ff,1.8);rim.position.set(-1.1,1.9,1.9);scene.add(rim);
    const cam=new THREE.PerspectiveCamera(32,1,.1,50);

    // Camera sits at -Z: the GLB's bind pose faces -Z (verified from L/R eye joint positions),
    // so this is his front. Turn group carries yaw/roll; model carries the skeleton.
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
    root.traverse(o=>{if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms)if("envMapIntensity" in m)m.envMapIntensity=.7}});

    // Fit: bounds come from the SKELETON joints, not the skinned-mesh bbox — morph targets and
    // bind-pose geometry can report a degenerate box that flings the model off-camera.
    model.updateMatrixWorld(!0);
    const vp=new THREE.Vector3();let y0=1e9,y1=-1e9;
    for(const n in bones){bones[n].getWorldPosition(vp);if(vp.y<y0)y0=vp.y;if(vp.y>y1)y1=vp.y}
    const h=(y1-y0)>1e-3?y1-y0:1.7,s=1.5/h;
    model.scale.setScalar(s);
    const feetY=y0*s;
    model.position.y=-feetY;
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
    const setMorphs=pairs=>{for(const[k,v]of pairs)setMorph(k,v)};

    // Delta rotation on top of each bone's rest pose (userData.q0).
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
    // The bind pose holds his arms wide (A-pose); the relaxed hang is the baseline of every pose.
    const RELAX={armL:{z:1.12},armR:{z:-1.12},foreL:{x:.3},foreR:{x:-.3}};

    let disposed=!1,raf=0,ready=!1,phase=0,heading=0;
    let blinkAt=2.5,blinkUntil=-1;
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
        kL=walking?swingOf(((u*2)%1+.5)%1):0,kR=walking?swingOf(((u*2+.5)%1+.5)%1):0;

      // Facing: eased yaw toward travel direction; a lean pulls him toward the panel.
      const dir=st.walkDir||(st.fx<0?-1:1),
        targetYaw=(walking?.85:0)*dir+(st.lean?st.lean.dir*.3:0);
      heading+=(targetYaw-heading)*Math.min(1,dt*7);
      turn.rotation.y=heading;
      turn.rotation.z=st.lean?st.lean.angle*Math.PI/180*.55:0;

      const by=(p.by||0)/100,bs=clamp(p.bs||1,.8,1.15);
      model.position.y=-feetY-by*.9*s+(walking?Math.abs(Math.sin(TAU*u))*.02*s:0);
      model.scale.set(s*(1+.05*(1-bs)),s*bs,s*(1+.05*(1-bs)));

      const br=Math.sin(t*1.7),w1=Math.sin(t*.9),w2=Math.sin(t*4.1),calm=reduced?.45:1;
      const still=(walking?0:1),droop=mode==="doze"?.42:mode==="dead"?.6:dying?.35:0;
      const swing=walking?1:still*.12;              // idle arms/legs keep a whisper of motion

      // Legs: local Y, negative = forward. Knees fold on +Y during the swing-through.
      if(has("thighL"))rot(J.thighL,0,-gait*.5*walking+still*w1*.015,0);
      if(has("shinL"))rot(J.shinL,0,(kL*.75+still*.04)*calm,0);
      if(has("footL"))rot(J.footL,0,(wL-kL)*.22,0);
      if(has("thighR"))rot(J.thighR,0,gait*.5*walking-still*w1*.015,0);
      if(has("shinR"))rot(J.shinR,0,-(kR*.75+still*.04)*calm,0);
      if(has("footR"))rot(J.footR,0,-(wR-kR)*.22,0);

      // Arms: relaxed hang is constant; swing counter to the same-side leg on local X.
      if(has("armL"))rot(J.armL,-gait*.38*swing+still*Math.sin(t*.8)*.02,0,RELAX.armL.z+still*w1*.015);
      if(has("foreL"))rot(J.foreL,RELAX.foreL.x+still*Math.sin(t*.8+1)*.03-gait*.12*swing,0,0);
      if(has("armR"))rot(J.armR,gait*.38*swing-still*Math.sin(t*.8+1)*.02,0,RELAX.armR.z-still*w1*.015);
      if(has("foreR"))rot(J.foreR,RELAX.foreR.x-still*Math.sin(t*.8+2)*.03+gait*.12*swing,0,0);

      // Torso: breath, weight shift, pose sway; pr pitches him forward for crawl/push-up.
      if(has("spine2"))rot(J.spine2,(.02*br-pr*.55+(p.tr||0)*.004)*calm,(w2*.01)*calm,
        (w1*.045+p.hr*.004+ (grooving?.05*Math.sin(t*3):0))*calm);
      if(has("spine3"))rot(J.spine3,(.015*br+.01*w2-pr*.2)*calm,0,w1*.025*calm);
      if(has("pelvis"))rot(J.pelvis,w2*.02*calm,0,w1*.025*calm);

      // Head/neck: gaze params scaled down; doze/dead droop forward (negative local Y = down).
      const gx=(p.gx||0)/60,gy=(p.gy||0)/60;
      if(has("neck1"))rot(J.neck1,-droop*.5-gy*.3,clamp(gx,-.5,.5)*.5,0);
      if(has("neck2"))rot(J.neck2,-droop*.4,0,0);
      if(has("head"))rot(J.head,-droop*.55-gy*.3+br*.01,clamp(gx,-.6,.6)*.6+Math.sin(t*.5)*.05*calm,w1*.015*calm);

      // Face: jaw while "talking", scheduled blink, doze/dead hold eyes shut, mood shapes.
      const talking=!!st.talking;
      const jaw=talking?(reduced?.12:.28)+.22*Math.abs(Math.sin(t*11))+.08*Math.sin(t*23):0;
      const shut=mode==="doze"?.75:mode==="dead"?.9:dying?.6:0;
      const blink=t>=blinkUntil?0:1;
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
      if(t>=blinkAt){blinkUntil=t+.13;blinkAt=t+rand(2.6,6.2)*(reducedNow()?1.5:1)}
      const st=getState?getState():{};
      if(!ready){ready=!0;onReady&&onReady()}
      try{drive(t,dt,st);renderer.render(scene,cam)}
      catch(err){
        // One bad frame must not leave a transparent canvas where Crid should be: hand the
        // page back to the 2D rig and stop the loop.
        try{console.warn("[crid-3d] render failed, restoring 2D:",err&&err.message||err)}catch{}
        disposed=!0;onFail&&onFail();return}};
    raf=requestAnimationFrame(frame);

    return{get active(){return ready},dispose(){disposed=!0;cancelAnimationFrame(raf);ro&&ro.disconnect();
      renderer.dispose();gltf.scene.traverse(o=>{if(o.geometry)o.geometry.dispose()});canvas.remove()}};
  }catch(err){
    try{console.warn("[crid-3d] fallback to 2D rig:",err&&err.message||err)}catch{}
    return null}
}
