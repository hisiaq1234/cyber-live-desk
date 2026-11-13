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
import{stageChannels}from"./stage.mjs";
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
  browInL:"ai_browInnerUp_L",browInR:"ai_browInnerUp_R",
  // The rest of the brow ladder — mid/outer raises, inner squeeze, mid drops.
  browMidUpL:"ai_browMidUp_L",browMidUpR:"ai_browMidUp_R",
  browMidDownL:"ai_browMidDown_L",browMidDownR:"ai_browMidDown_R",
  browOuterUpL:"ai_browOuterUp_L",browOuterUpR:"ai_browOuterUp_R",
  browInnerInL:"ai_browInnerIn_L",browInnerInR:"ai_browInnerIn_R",
  // Smile family beyond the basic pair: dimples, stretched mouth, corner rounds,
  // lower-lid smile already mapped — plus the lip raise/lower tells and the
  // 25% lower lid for heavy-eyed moods.
  mouthDimpleL:"ai_mouthDimple_L",mouthDimpleR:"ai_mouthDimple_R",
  mouthStretchL:"ai_mouthStretch_L",mouthStretchR:"ai_mouthStretch_R",
  lipRoundL:"ca_lipCornerRound_L",lipRoundR:"ca_lipCornerRound_R",
  lipLowerUpC:"ai_lipLowerUp_C",lipUpperDownC:"ai_lipUpperDown_C",
  eyeLow25L:"ai_eyeLowerClose_25_L",eyeLow25R:"ai_eyeLowerClose_25_R"};
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
    // A lost GL context (driver reset, GPU switch, tab discard) must not kill
    // him: preventDefault keeps the context restorable, frames pause while it
    // is gone, and the restored event hands rendering back to the loop.
    let ctxLost=false;
    canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();ctxLost=!0});
    canvas.addEventListener("webglcontextrestored",()=>{ctxLost=!1;
      try{renderer.forceContextRestore&&renderer.forceContextRestore()}catch{}});
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    // The GLB base colors are Snap's already-lit shader bakes (____Shader_*), not flat albedo.
    // Tone mapping and extra lights would shift that color. Show the map as stored.
    renderer.toneMapping=THREE.NoToneMapping;

    const scene=new THREE.Scene();
    // Orthographic, exactly like crid3d.html: the 2D art has no vanishing point,
    // so the 3D is shot flat — no perspective stretch on his head and shoulders.
    const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,60);
    const VIEW_H=2.05,camTargetY=.86;   // portrait framing: model ~1.7 units fills ~83%

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

    // ---- rest pose = the art's stance, not the raw bind -------------------------
    // Ported from crid3d.html: the GLB's bind frame holds the arms wide, so the
    // reference page swings them down to his sides and turns the head a touch
    // toward the lens — measured off the rig's own bone axes, never invented.
    // After posing we re-freeze userData.q0 on THIS frame, so every procedural
    // delta (pose(), stage channels, IK) composes on top of the art's stance
    // instead of fighting the bind pose — that was the twisted-wrist idle.
    const _bv=new THREE.Vector3();
    {
      const basisCol=(m,c)=>_bv.set(m.elements[c*4],m.elements[c*4+1],m.elements[c*4+2]).clone().normalize();
      const swing=(bone,target)=>{if(!bone)return;
        bone.updateWorldMatrix(!0);
        const cur=basisCol(bone.matrixWorld,0),axis=basisCol(bone.matrixWorld,2),
          t=target.clone().normalize();
        const ang=Math.atan2(new THREE.Vector3().crossVectors(cur,t).dot(axis),cur.dot(t));
        bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),ang));
        bone.updateMatrixWorld(!0)};
      for(const side of["L","R"]){
        const up=bones[`${side}_armUpper0001_bind_JNT`],fore=bones[`${side}_armLower0001_bind_JNT`];
        if(!up)continue;
        up.updateWorldMatrix(!0);
        const out=basisCol(up.matrixWorld,0).x>=0?1:-1;
        swing(up,new THREE.Vector3(out*.27,-.96,0));
        swing(fore,new THREE.Vector3(out*.14,-.97,.12))}
      const n=bones["C_neck0001_bind_JNT"];
      if(n){n.updateWorldMatrix(!0);
        const pq=n.parent.getWorldQuaternion(new THREE.Quaternion()),
          q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.26);
        n.quaternion.premultiply(pq.clone().invert().multiply(q).multiply(pq));
        n.updateMatrixWorld(!0)}
      // the art's face is relaxed, not wide-eyed: the rig's own lid shapes at .35
      for(const x of morphs){
        if(x.k==="face_shapes.ai_eyeUpperClose_25_L"||x.k==="face_shapes.ai_eyeUpperClose_25_R")
          if(x.m.morphTargetInfluences)x.m.morphTargetInfluences[x.i]=.35}
      model.updateMatrixWorld(!0);
      for(const n2 in bones)bones[n2].userData.q0=bones[n2].quaternion.clone();
    }

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
    cam.position.set(0,camTargetY,-4.2);cam.lookAt(0,camTargetY,0);

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
    // Read-only skeleton probe for rig work: rest local pos/quat + children names.
    try{window.__cridBones=()=>{model.updateMatrixWorld(!0);const vp=new THREE.Vector3(),wq=new THREE.Quaternion(),o={};
      for(const n in bones){const b=bones[n];b.getWorldPosition(vp);b.getWorldQuaternion(wq);
        o[n]={w:[+vp.x.toFixed(3),+vp.y.toFixed(3),+vp.z.toFixed(3)],
          wq:[+wq.x.toFixed(3),+wq.y.toFixed(3),+wq.z.toFixed(3),+wq.w.toFixed(3)],
          p:[+b.position.x.toFixed(4),+b.position.y.toFixed(4),+b.position.z.toFixed(4)],
          chain:(()=>{const c=[];for(let n=b.parent;n&&c.length<5;n=n.parent)c.push(n.name||n.type);return c})(),
          c:b.children.filter(c=>c.isBone).map(c=>c.name)}}return o}}catch{}
    // Which bones actually carry skin weight — a bone with zero influence can be
    // posed all day without touching the mesh (the twist helpers' real test).
    try{window.__cridSkin=()=>{const use={};
      root.traverse(o=>{if(!o.isSkinnedMesh||!o.skeleton)return;
        const si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;
        for(let i=0;i<si.count;i++)for(let k=0;k<4;k++){
          const w=sw.getComponent(i,k);if(w<=0)continue;
          const n=o.skeleton.bones[si.getComponent(i,k)]?.name||"?";use[n]=(use[n]||0)+w}});
      return use}}catch{}
    const MORPH_CACHE={};
    const morph=name=>{
      if(name in MORPH_CACHE)return MORPH_CACHE[name];
      const want=M[name];if(!want)return MORPH_CACHE[name]=[];
      return MORPH_CACHE[name]=morphs.filter(x=>x.k===want||x.k.endsWith("."+want))};
    const setMorph=(name,v)=>{for(const x of morph(name))if(x.m.morphTargetInfluences)x.m.morphTargetInfluences[x.i]=v};

    // Delta rotation on top of each bone's rest pose (userData.q0), in WORLD axes —
    // the same convention as applyStageChannels and crid3d.html's applyAcc: the
    // euler triple names screen axes, P^-1·R·P rewrites it into the parent's
    // frame, and the result premultiplies the rest quaternion. Bone-local euler
    // deltas were the twisted-limb idle: a thigh's local Y runs down the bone,
    // so "swing" written there was a twist, and easing three local slots is not
    // a rotation near a bent joint.
    const E=new THREE.Euler(),Q=new THREE.Quaternion(),Q2=new THREE.Quaternion();
    // Bones the stage channels own this frame — pose() must not write them.
    let stageOwned=null;
    const rot=(n,x=0,y=0,z=0)=>{const b=B(n);if(!b)return;
      if(stageOwned&&stageOwned.has(n))return;
      const P=restPQ.get(n);
      if(!P){E.set(x,y,z,"XYZ");Q.setFromEuler(E);Q2.copy(b.userData.q0).multiply(Q);b.quaternion.copy(Q2);return}
      E.set(x,y,z,"XYZ");Q.setFromEuler(E);
      Q2.copy(P).invert().multiply(Q).multiply(P);
      b.quaternion.copy(b.userData.q0).premultiply(Q2)};

    const J={
      pelvis:"C_pelvis0001_bind_JNT",spine1:"C_spine0001_bind_JNT",spine2:"C_spine0002_bind_JNT",spine3:"C_spine0003_bind_JNT",
      neck1:"C_neck0001_bind_JNT",neck2:"C_neck0002_bind_JNT",head:"C_head_bind_JNT",
      thighL:"L_legUpper0001_bind_JNT",shinL:"L_legLower0001_bind_JNT",footL:"L_foot0001_bind_JNT",
      thighR:"R_legUpper0001_bind_JNT",shinR:"R_legLower0001_bind_JNT",footR:"R_foot0001_bind_JNT",
      armL:"L_armUpper0001_bind_JNT",foreL:"L_armLower0001_bind_JNT",handL:"L_hand0001_bind_JNT",
      armR:"R_armUpper0001_bind_JNT",foreR:"R_armLower0001_bind_JNT",handR:"R_hand0001_bind_JNT",
      toeL:"L_foot0002_bind_JNT",toeR:"R_foot0002_bind_JNT",
      // Twist helpers (children of the 0001 bones via _SSC nodes, ~1/3 of the
      // segment's skin weight): upper/lower arm and leg, both sides.
      tArmL:"L_armUpper0002_bind_JNT",tForeL:"L_armLower0002_bind_JNT",
      tArmR:"R_armUpper0002_bind_JNT",tForeR:"R_armLower0002_bind_JNT",
      tThighL:"L_legUpper0002_bind_JNT",tShinL:"L_legLower0002_bind_JNT",
      tThighR:"R_legUpper0002_bind_JNT",tShinR:"R_legLower0002_bind_JNT"};
    const LIMB_TWIST=[["armL","tArmL"],["foreL","tForeL"],["armR","tArmR"],["foreR","tForeR"],
      ["thighL","tThighL"],["shinL","tShinL"],["thighR","tThighR"],["shinR","tShinR"]];
    // Foot-lock bind data: where each ankle sits relative to the pelvis, and how
    // high the ankle rides above the floor plane. Measured once at bind — the
    // stage machine's surface states reuse it as the IK target every frame.
    model.updateMatrixWorld(!0);
    const bindPelvis=B(J.pelvis).getWorldPosition(new THREE.Vector3());
    const footBind={};
    for(const sd of["L","R"]){const f=B(J["foot"+sd]);if(!f)continue;
      const fp=f.getWorldPosition(new THREE.Vector3());
      footBind[sd]={x:fp.x-bindPelvis.x,z:fp.z-bindPelvis.z,ankleH:fp.y-shadowY()}}
    function shadowY(){shadow.updateWorldMatrix(!0,!1);return shadow.getWorldPosition(new THREE.Vector3()).y}

    // ---- stage channels: the rig page's own convention, ported verbatim ---------
    // crid3d.html applyChannels/applyAcc: semantic channels accumulate as WORLD-AXIS
    // euler triples per bone, then each bone gets _D = P^-1·R·P premultiplied onto its
    // posed quaternion (P = the parent's rest world orientation). Rotating about world
    // axes is why the climb reads as a body and not a pile of local-axis bends — the
    // guessed-axis rotAdd version is gone.
    const CH_ACC=new Map(),CH_LAG=new Map(),_CH_Q=new THREE.Quaternion(),_CH_E=new THREE.Euler(),_CH_D=new THREE.Quaternion();
    const restPQ=new Map();let chanFrozen=false;
    const chanAdd=(n,x,y,z)=>{if(!x&&!y&&!z)return;const a=CH_ACC.get(n);if(a){a[0]+=x;a[1]+=y;a[2]+=z}else CH_ACC.set(n,[x,y,z])};
    const freezeChan=()=>{if(chanFrozen||!model)return;chanFrozen=true;
      model.updateMatrixWorld(!0);
      for(const n in bones){const b=bones[n];if(b.parent)restPQ.set(n,b.parent.getWorldQuaternion(new THREE.Quaternion()))}};
    // Stage channels get the same follow-through as the pose bones: the semantic
    // channel arrives instantly but each bone eases toward it on its own clock —
    // head first, hands next, feet last — so a reach or a slip ripples down the
    // body instead of posing as one rigid cut-out.
    const CH_TAU=n=>/head/.test(n)?.10:/neck/.test(n)?.07:/spine0003|spine0002/.test(n)?.17:/spine/.test(n)?.14
      :/pelvis/.test(n)?.20:/eye/.test(n)?.05:/arm|clavicle/.test(n)?.18:/foot|leg/.test(n)?.24:.14;
    const accStageChannels=c=>{CH_ACC.clear();const g=n=>c[n]||0;
      const lf=g("leanFwd"),ls=g("leanSide")||0,tw=g("twist")||0;
      chanAdd("C_pelvis0001_bind_JNT",-lf*.10,tw*.25,-ls*.10);
      chanAdd("C_spine0001_bind_JNT",-lf*.25,tw*.25,-ls*.25);
      chanAdd("C_spine0002_bind_JNT",-lf*.35,tw*.30,-ls*.35);
      chanAdd("C_spine0003_bind_JNT",-lf*.30,tw*.20,-ls*.30);
      chanAdd("C_neck0001_bind_JNT",-g("headPitch")*.30,(g("headYaw")||0)*.35,-(g("headTilt")||0)*.30);
      chanAdd("C_head_bind_JNT",-g("headPitch")*.70,(g("headYaw")||0)*.65,-(g("headTilt")||0)*.70);
      chanAdd("L_eye_bind_JNT",0,(g("eyeYaw")||0)*.5,0);chanAdd("R_eye_bind_JNT",0,(g("eyeYaw")||0)*.5,0);
      chanAdd("L_clavicle_bind_JNT",0,0,(g("shrugL")||0));chanAdd("R_clavicle_bind_JNT",0,0,-(g("shrugR")||0));
      chanAdd("L_armUpper0001_bind_JNT",-g("armFwdL"),0,g("armLiftL"));
      chanAdd("R_armUpper0001_bind_JNT",-g("armFwdR"),0,-g("armLiftR"));
      chanAdd("L_armLower0001_bind_JNT",-g("elbowL"),0,0);
      chanAdd("R_armLower0001_bind_JNT",-g("elbowR"),0,0);
      chanAdd("L_legUpper0001_bind_JNT",-g("legFwdL"),0,(g("legSideL")||0));
      chanAdd("R_legUpper0001_bind_JNT",-g("legFwdR"),0,(g("legSideR")||0));
      chanAdd("L_legLower0001_bind_JNT",g("kneeL"),0,0);
      chanAdd("R_legLower0001_bind_JNT",g("kneeR"),0,0);
      chanAdd("L_foot0001_bind_JNT",-(g("ankleL")||0)*.5,0,0);
      chanAdd("R_foot0001_bind_JNT",-(g("ankleR")||0)*.5,0,0)};
    // flushStageChannels writes each accumulated channel as an ABSOLUTE pose on
    // the bone's rest quaternion — _CH_D * q0, the rig page's copy(base).premultiply.
    // Stage-owned bones are never premultiplied on top of a walk: pose() skips
    // whatever CH_ACC names, so a climbing step is the stage's alone.
    const flushStageChannels=(dt=1/60)=>{
      CH_ACC.forEach((a,n)=>{const b=bones[n],P=restPQ.get(n);if(!b||!P)return;
        let s=CH_LAG.get(n);
        if(!s){s=[a[0],a[1],a[2]];CH_LAG.set(n,s)}
        else{const tau=CH_TAU(n),k=1-Math.exp(-dt/tau);
          s[0]+=(a[0]-s[0])*k;s[1]+=(a[1]-s[1])*k;s[2]+=(a[2]-s[2])*k}
        _CH_Q.setFromEuler(_CH_E.set(s[0],s[1],s[2],"XYZ"));
        _CH_D.copy(P).invert().multiply(_CH_Q).multiply(P);
        b.quaternion.copy(b.userData.q0).premultiply(_CH_D)})};
    const applyStageChannels=(c,dt=1/60)=>{accStageChannels(c);flushStageChannels(dt)};
    // Channels that went quiet must release home too, or a finished reach would
    // hold its last lagged pose forever.
    const releaseStageChannels=dt=>{CH_LAG.forEach((s,n)=>{const k=1-Math.exp(-dt/CH_TAU(n));
      s[0]*=(1-k);s[1]*=(1-k);s[2]*=(1-k)})};

    // ---- the bag's lag: the rig page rigid-skins it to the upper spine and lets
    // a spring group swing it — straps and bag trailing him is the secondary
    // motion that sells weight. Ported: same re-skin, same pivot, same springs.
    let bagPivot=null,bagLag=null,bagAxes=null;const Sbag={v:0,vel:0},SbagX={v:0,vel:0},Scurl={v:.14,vel:0};
    {
      let skinned=null;root.traverse(o=>{if(o.isSkinnedMesh&&/outfit_bag/i.test(o.name))skinned=o});
      const spine3=B(J.spine3);
      if(skinned&&spine3){const skel=skinned.skeleton,i=skel.bones.indexOf(spine3);
        if(i>=0){const ibm=skel.boneInverses[i].clone(),geo=skinned.geometry.clone();
          geo.deleteAttribute("skinIndex");geo.deleteAttribute("skinWeight");
          const mesh=new THREE.Mesh(geo,skinned.material);mesh.frustumCulled=false;
          const pivot=new THREE.Group();pivot.matrixAutoUpdate=false;pivot.matrix.copy(ibm);
          const lag=new THREE.Group();pivot.add(lag);lag.add(mesh);spine3.add(pivot);
          skinned.parent.remove(skinned);
          bagPivot=pivot;bagLag=lag;
          const q=spine3.getWorldQuaternion(new THREE.Quaternion()).invert();
          bagAxes={x:new THREE.Vector3(1,0,0).applyQuaternion(q).normalize(),
                   z:new THREE.Vector3(0,0,1).applyQuaternion(q).normalize()}}}}
    const stepSpring=(s,target,k,d,dt)=>{const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;
      for(let i=0;i<n;i++){const a=(target-s.v)*k-s.vel*d;s.vel+=a*h;s.v+=s.vel*h}return s.v};
    freezeChan();   // rest parent orientations at bind — the same reference frame the rig page froze
    // Fingers: five chains per hand. The curl axis is MEASURED at bind, not
    // guessed — each joint's direction to its child crossed with the palm's
    // inward normal gives the anatomical hinge, brought into bone-local space.
    // The old single local-Z angle curled some chains sideways; this closes
    // every finger toward the palm on both hands (the _SSC mirror quirks cancel
    // out because the axis comes from the real geometry, not a side sign).
    const FINGERS=[],FINGER_W=[.35,.6,.85,.6],THUMB_W=[.4,.7,.5];
    {
      const _fv=new THREE.Vector3(),_fq=new THREE.Quaternion(),
        pv=b=>{b.getWorldPosition(_fv);return _fv.clone()};
      for(const side of["L","R"]){
        const hand=B(J["hand"+side]),mid1=B(`${side}_handMiddle0001_bind_JNT`),
          ptr1=B(`${side}_handPointer0001_bind_JNT`),pnk1=B(`${side}_handPinky0001_bind_JNT`),
          th1=B(`${side}_handThumb0001_bind_JNT`);
        if(!hand||!mid1)continue;
        const fwd=pv(mid1).sub(pv(hand)).normalize();
        const across=(ptr1&&pnk1?pv(pnk1).sub(pv(ptr1)).normalize():new THREE.Vector3(1,0,0));
        const palm=across.cross(fwd);
        if(palm.lengthSq()>.25){palm.normalize();
          if(th1){const toT=pv(th1).sub(pv(hand));if(toT.dot(palm)<0)palm.negate()}
        }else palm.set(0,0,0);
        for(const f of["Thumb","Pointer","Middle","Ring","Pinky"]){
          const ws=f==="Thumb"?THUMB_W:FINGER_W;let dir=null;
          for(let i=0;i<ws.length;i++){
            const bn=`${side}_hand${f}000${i+1}_bind_JNT`,b=B(bn);if(!b)continue;
            const ch=B(`${side}_hand${f}000${i+2}_bind_JNT`);
            dir=ch?pv(ch).sub(pv(b)).normalize():(dir||fwd.clone());
            if(palm.lengthSq()<.25)continue;
            const axis=dir.clone().cross(palm).normalize();
            b.getWorldQuaternion(_fq);axis.applyQuaternion(_fq.invert());
            FINGERS.push({b:bn,w:ws[i],axis})}}}
    }
    const has=k=>!!B(J[k]);
    // The bind pose holds his arms wide (A-pose); the relaxed hang is the baseline of every pose.
    const RELAX={armL:{z:1.12},armR:{z:-1.12},foreL:{x:.3},foreR:{x:-.3}};

    let disposed=!1,raf=0,ready=!1,phase=0,heading=0,bagShown=true,ikW=0,footW=0,footDbg=0,curlW=0,lastBagCX=0,C_leanF=0,walkW=0;
    // Landing squash clock (pose-path landings) + head-turn rate for the blink scheduler.
    let sqAt=-9,prevBy=0,prevHeadYaw=0,prevHeadPitch=0,headTurnS=0;
    const ikSolver=new TwoBoneIK();let ikLast=null,ikDbg="";
    const _iv=new THREE.Vector3(),_id=new THREE.Vector3(),_it=new THREE.Vector3(),
      _ic=new THREE.Vector3(),_ip=new THREE.Vector3(),_io=new THREE.Vector3(),
      _idv=new THREE.Vector3(),_iq=new THREE.Quaternion(),_ih=new THREE.Vector3(),_aq=new THREE.Quaternion();
    try{window.__cridIk={w:()=>ikW,last:()=>ikLast,dbg:()=>ikDbg}}catch{}
    try{window.__cridBag=()=>({pivot:!!bagPivot,visible:!!(bagPivot&&bagPivot.visible),
      lag:!!bagLag,shown:bagShown})}catch{}
    const face=createFacial();let lastFaceKey=null;
    // Read-only handle for visual QA: the shot harness polls channels() to catch
    // a blink at its peak, and morph() proves the weight actually reached the GLB.
    try{window.__cridFace={channels:()=>face.channels(),
      morph:name=>{let v=0;for(const x of morph(name))if(x.m.morphTargetInfluences)v=Math.max(v,x.m.morphTargetInfluences[x.i]||0);return v}}}catch{}
    const reducedNow=()=>{try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch{return!1}};

    const resize=()=>{
      const r=host.getBoundingClientRect();
      renderer.setSize(Math.max(2,r.width),Math.max(2,r.height),!1);
      cam.aspect=r.width/Math.max(1,r.height);
      const half=VIEW_H/2,a=cam.aspect;
      cam.left=-half*a;cam.right=half*a;cam.top=half;cam.bottom=-half;
      cam.updateProjectionMatrix()};
    resize();
    const ro=typeof ResizeObserver=="function"?new ResizeObserver(resize):null;
    ro&&ro.observe(host);

    // Follow-through: nothing on him stops at once. Every joint trails the one
    // before it — eyes are facial.mjs (fastest), head ~90 ms, torso ~170 ms,
    // feet last — so a move reads as a body, not a board sliding. First-order
    // lag per bone; the phase shift IS the overlap. Inside a limb the lag grows
    // proximal->distal (shoulder->elbow->hand, hip->knee->ankle->toe), which is
    // also how real weight travels. Head pitch trails yaw a touch so diagonal
    // looks arc instead of tracking a straight line.
    const LAG_TAU={
      neck1:[.05,.06,.05],neck2:[.07,.10,.08],head:[.09,.13,.11],
      spine1:[.15,.16,.15],spine2:[.14,.15,.14],spine3:[.22,.24,.22],pelvis:[.20,.20,.20],
      armL:[.14,.16,.14],foreL:[.19,.22,.19],armR:[.14,.16,.14],foreR:[.19,.22,.19],
      thighL:[.18,.20,.18],shinL:[.22,.24,.22],footL:[.26,.28,.26],toeL:[.30,.32,.30],
      thighR:[.18,.20,.18],shinR:[.22,.24,.22],footR:[.26,.28,.26],toeR:[.30,.32,.30]};
    const lagPose=new Map();
    let frameDt=.016;                       // drive() stamps this each frame; pose() reads it
    const pose=(jk,x=0,y=0,z=0)=>{
      let s=lagPose.get(jk);
      if(!s){s=[x,y,z];lagPose.set(jk,s);rot(J[jk],x,y,z);return}
      const tau=LAG_TAU[jk]||[.14,.14,.14];
      s[0]+=(x-s[0])*(1-Math.exp(-frameDt/tau[0]));
      s[1]+=(y-s[1])*(1-Math.exp(-frameDt/tau[1]));
      s[2]+=(z-s[2])*(1-Math.exp(-frameDt/tau[2]));
      rot(J[jk],s[0],s[1],s[2])};

    const drive=(t,dt,st)=>{
      const p=st.p||{},mode=st.mode||"dead",dying=!!st.dying,
        alive=mode==="on"&&!dying,walking=!!st.walking&&alive,
        reduced=st.reduced||reducedNow(),grooving=!!st.grooving,
        pr=clamp((p.pr||0)*Math.PI/180,-1.2,1.2);
      frameDt=dt;
      // Walk settle: the gait fades over ~200 ms instead of snapping off — a stop
      // is a settle, not a cut. Phase keeps its own clock; only amplitude blends.
      walkW+=((walking?1:0)-walkW)*Math.min(1,dt*5);
      if(walking)phase=(phase+dt*(reduced?3.4:5.2))%1;
      const u=phase,gait=Math.sin(TAU*u),          // one full gait cycle per phase wrap
        kL=swingOf(((u*2)%1+.5)%1)*walkW,kR=swingOf(((u*2+.5)%1+.5)%1)*walkW;

      // Facing: eased yaw toward travel direction; a lean pulls him toward the panel.
      const dir=st.walkDir||(st.fx<0?-1:1),
        targetYaw=(walking?.85:0)*dir+(st.lean?st.lean.dir*.3:0);
      heading+=(targetYaw-heading)*Math.min(1,dt*7);
      turn.rotation.y=heading;
      // stagePose: roll/pitch from the climb/lean state machine (radians). The
      // lean verb's z-tilt and the stage's roll add — they never run together.
      const sp=st.stagePose||null;
      // Stage channels accumulate FIRST so pose() knows which bones they own
      // this frame — a climbing step is the stage's alone, never a walk pose
      // with a channel premultiplied on top. flush happens after the pose
      // section, before IK, same slot it always had.
      let stageC=null;
      if(sp&&sp.ref){freezeChan();stageC=stageChannels(sp.ref,t);accStageChannels(stageC);
        stageOwned=new Set(CH_ACC.keys())}
      else stageOwned=null;
      turn.rotation.x=sp?sp.pitch:0;
      turn.rotation.z=(st.lean?st.lean.angle*Math.PI/180*.55:0)+(sp?sp.roll:0);

      const by=(p.by||0)/100,bs=clamp(p.bs||1,.8,1.15);
      // Stage: the bot names his build; the mesh eases to that girth over ~a second so a sub
      // milestone reads as him filling out, not as a pop. First sighting snaps — no boot swell.
      if(st.stage&&st.stage!==curStage){curStage=st.stage;targetK=STAGE_K[st.stage]??1;if(appliedK<0)curK=targetK}
      curK+=(targetK-curK)*Math.min(1,dt*4);
      if(Math.abs(curK-appliedK)>.0005){applyGirth(curK);appliedK=curK}
      // Landing squash: ~8% spine compression for ~80 ms, then a damped recover
      // with one small stretch overshoot. Two triggers — the stage machine's own
      // landing clock (panel tops, seats, floor arrivals) and a pose landing
      // (SEQ jump/hop frames dropping `by` back to the floor).
      const sqStage=sp&&sp.squash?sp.squash:0;
      if(prevBy<-4&&(p.by||0)>-1.5)sqAt=t;
      prevBy=p.by||0;
      const sqT=t-sqAt;
      const sqPose=sqT>=0?(sqT<.08?.07:.07*Math.exp(-6*(sqT-.08))*Math.cos((sqT-.08)*14)):0;
      const squash=clamp(Math.max(sqStage,Math.min(.08,sqPose)),-.02,.09);
      const sqY=1-squash,sqX=1+squash*.5;   // volume preserved: wider as he compresses
      model.position.y=-feetY-by*.9*s+(walking?Math.abs(Math.sin(TAU*u))*.035*s:Math.sin(t*1.55)*.012*s);
      model.scale.set(s*(1+.05*(1-bs))*sqX,s*bs*sqY,s*(1+.05*(1-bs))*sqX);

      const br=Math.sin(t*1.55),w1=Math.sin(t*.62),calm=reduced?.4:1;
      const life=(mode==="on"&&!dying?1:.22)*calm;
      const still=(walking?0:1)*life,droop=mode==="doze"?.42:mode==="dead"?.6:dying?.35:0;
      const swing=walkW;

      // Standing idle is a person, not a statue: breath in the chest, weight moving
      // from foot to foot, the head looking off the same clock. Amplitudes are large
      // enough to read at desk size. The GLB has no clips; this is the motion.
      const shift=Math.sin(t*.5);                         // hip to hip, about 12s
      const look=Math.sin(t*.33),look2=Math.sin(t*.19+1.4);

      // Legs: each step is a planted foot and a swinging foot. kL/kR are the
      // per-leg swing curves — zero through stance, a bump while that foot is
      // up — so the planted thigh and knee hold still at rest for the foot-lock
      // IK to own, and only the swinging knee bends, on world +X, same sign on
      // both legs. A knee bending on the planted leg is the puppet.
      if(has("thighL"))pose("thighL",-kL*.55+still*(shift*.04),0,0);
      if(has("shinL"))pose("shinL",kL*.85*calm+still*Math.max(0,shift)*.12*calm,0,0);
      if(has("footL"))pose("footL",-(kL*.22+still*shift*.03)*.5,0,0);
      if(has("thighR"))pose("thighR",-kR*.55-still*(shift*.04),0,0);
      if(has("shinR"))pose("shinR",kR*.85*calm+still*Math.max(0,-shift)*.12*calm,0,0);
      if(has("footR"))pose("footR",-(kR*.22-still*shift*.03)*.5,0,0);

      // Arms hang and drift against the weight. X is the swing line, Z the lift
      // out to the side — mirrored signs on R exactly as applyStageChannels has.
      if(has("armL"))pose("armL",-(gait*.45*swing+still*(Math.sin(t*.7)*.1+shift*.05)),0,RELAX.armL.z+still*w1*.04);
      if(has("foreL"))pose("foreL",-(RELAX.foreL.x+still*Math.sin(t*.7+.8)*.08+gait*.16*swing),0,0);
      if(has("armR"))pose("armR",gait*.45*swing+still*(Math.sin(t*.7+1.2)*.1-shift*.05),0,-RELAX.armR.z+still*w1*.04);
      if(has("foreR"))pose("foreR",-(RELAX.foreR.x-still*Math.sin(t*.7+2)*.08-gait*.16*swing),0,0);

      // Fingers: a relaxed hand is not straight — base curl .14; a planted
      // grip (the IK lean, the stage machine's reach/seat) closes toward
      // .85; dying lets them go slack. st.grip is the stage machine's channel.
      // curlW eases the grip in — fingers are flesh on springs, not switches.
      // The hinge is each joint's measured anatomical axis (bind pose), so the
      // curl closes toward the palm instead of guessing local Z.
      const gripT=clamp(Math.max(ikW||0,(sp&&sp.grip)||st.grip||0,dying?.25:0),0,1);
      // Flesh on a spring: the curl trails the grip by a few frames and settles
      // with one small overshoot instead of snapping shut.
      curlW=stepSpring(Scurl,gripT,52,8.5,dt);
      const grip=curlW;
      // Only the planted hand fully closes — the free hand keeps a relaxed curl
      // so it doesn't claw at air during a one-armed lean.
      const plantSide=st.lean?(st.lean.dir>0?"R":"L"):null;
      for(const f of FINGERS){
        const a=.14+.78*(f.b[0]===plantSide?grip:grip*.35),b=B(f.b);if(!b)continue;
        _aq.setFromAxisAngle(f.axis,a*f.w*.9);
        b.quaternion.copy(b.userData.q0).multiply(_aq)}

      // Toes: the foot has a real toe joint (foot0002). It rolls through the
      // step — dorsiflexed in swing, plantar-flexed at push-off — instead of
      // the whole foot pivoting like a board.
      if(has("toeL"))pose("toeL",kL*.35+still*.04,0,0);
      if(has("toeR"))pose("toeR",kR*.35-still*.04,0,0);

      // Torso: one lean carried by pelvis and spine0001 together — they are
      // siblings under ROOT, never reparented — while spine0003 arrives late
      // on its own slower clock. Breath stays on the chest, the head follows
      // the shift late, and looks off-axis so he is not staring through the lens.
      const leanX=(-pr*.55+(p.tr||0)*.004)*life;
      if(has("pelvis"))pose("pelvis",leanX,0,shift*.1*life);
      if(has("spine1"))pose("spine1",leanX,(look*.04)*life,shift*.06*life);
      if(has("spine2"))pose("spine2",(.07*br)*life+leanX*.5,(look*.05)*life,
        (shift*.09+(p.hr||0)*.004+(grooving?.08*Math.sin(t*3):0))*life);
      if(has("spine3"))pose("spine3",leanX*.25+(.05*br)*life,look*.04*life,shift*.04*life);

      // Head follows the shift late, and looks off-axis so he is not staring through the lens.
      const gx=(p.gx||0)/60,gy=(p.gy||0)/60;
      if(has("neck1"))pose("neck1",-droop*.5-gy*.3+look2*.06*life,clamp(gx,-.5,.5)*.5+look*.08*life,shift*.03*life);
      if(has("neck2"))pose("neck2",-droop*.4+br*.02*life,look*.05*life,0);
      if(has("head"))pose("head",-droop*.55-gy*.3+br*.025*life,clamp(gx,-.6,.6)*.6+look*.16*life,shift*.04*life);

      // Face: the performance layer — gaze saccades, the blink engine, doze/dead
      // lid hold, talking jaw, and the emotion envelope crid-bot cues in.
      if(st.face&&st.face.name){const fk=st.face.name+":"+(st.face.seq||0);
        if(fk!==lastFaceKey){lastFaceKey=fk;face.cue(st.face.name,st.face.hold)}}
      // Head-turn rate for the blink scheduler: humans blink as the eyes move,
      // so facial.mjs gets told when the head is actually going somewhere.
      const headYaw=(lagPose.get("head")?.[1]||0)+(lagPose.get("neck2")?.[1]||0)+(lagPose.get("neck1")?.[1]||0);
      const headPitch=(lagPose.get("head")?.[0]||0)+(lagPose.get("neck2")?.[0]||0)+(lagPose.get("neck1")?.[0]||0);
      headTurnS+= (clamp(Math.hypot(headYaw-prevHeadYaw,headPitch-prevHeadPitch)/Math.max(dt,1e-3)*.05,0,1)-headTurnS)*Math.min(1,dt*9);
      prevHeadYaw=headYaw;prevHeadPitch=headPitch;
      face.update(dt,{t,dt,talking:!!st.talking,mode,dying,reduced,gx:p.gx,gy:p.gy,attend:st.attend,
        lookBias:st.lookBias,headTurn:headTurnS});
      const fc=face.channels();
      for(const k in fc)setMorph(k,fc[k]);
      // Weight shows in the face too: the heavier builds carry a touch of cheek
      // fullness through the authored morphs — eyes, nose and brows untouched.
      const chub=clamp((curK-1)/.28,0,1)*.22;
      setMorph("cheekPuffL",clamp((fc.cheekPuffL||0)+chub,0,1));
      setMorph("cheekPuffR",clamp((fc.cheekPuffR||0)+chub,0,1));

      // Worn state comes from crid-bot's bag.worn through the snapshot: on, the
      // GLB's own outfit_bag (re-skinned to spine3 above, on the lag springs)
      // is the pack on his back; off, it hides and the SVG floor prop is the
      // only bag left. The flat SVG never rides him on this path.
      const showBag=!!st.bag;
      if(showBag!==bagShown){bagShown=showBag;if(bagPivot)bagPivot.visible=showBag;
        for(const m of bagMeshes)m.visible=false}   // the skinned original is gone; the pivot carries the bag
      if(bagLag){
        const hr=host.getBoundingClientRect(),cx=hr.left+hr.width/2;
        const vx=lastBagCX?(cx-lastBagCX)/Math.max(dt,1e-3):0;lastBagCX=cx;
        const leanF=C_leanF||0;
        stepSpring(Sbag,clamp(-vx*.0011,-.3,.3),55,7.5,dt);
        stepSpring(SbagX,clamp(-leanF*.25,-.2,.2),45,7,dt);
        _CH_Q.setFromAxisAngle(bagAxes.z,Sbag.v);_CH_D.setFromAxisAngle(bagAxes.x,SbagX.v);
        bagLag.quaternion.copy(_CH_Q).multiply(_CH_D)}

      // Stage machine pose channels — the reach/pull/crouch/seat/slip/recover
      // beats, applied with the rig page's own world-axis convention
      // (applyChannels/applyAcc above). Runs before IK so the solver still owns
      // the arm chain while a lean is planted.
      if(sp&&sp.ref){flushStageChannels(dt);C_leanF=stageC.leanFwd||0;
        if(stageC.rootY)model.position.y+=stageC.rootY*s}
      else{C_leanF*=Math.max(0,1-dt*4);releaseStageChannels(dt)}

      // Hand plant (Phase C groundwork): while he leans on a panel, the touching
      // arm solves onto the contact point crid-bot measured in screen px. The
      // solve target lerps from the hand's own position by ikW, so weight 0 is
      // a no-op and the reach eases in with the lean — no quaternion blending.
      // bs widens past 1 only in SEQ frames; past ~15% the solver's quaternion
      // decompose degrades, so extreme poses keep the procedural arm.
      const leanOn=!!(st.lean&&alive),uniform=Math.abs(bs-1)<.15;
      ikW+=((leanOn&&uniform?1:0)-ikW)*Math.min(1,dt*4);
      ikDbg=`w=${ikW.toFixed(2)} foot=${footW.toFixed(2)}${footDbg?" !reach":""} lean=${!!st.lean} alive=${alive} uni=${uniform} bs=${bs} c=${!!(st.lean&&st.lean.contact)}`;
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

      // Foot-lock: while the stage machine has him standing on a surface (top,
      // seat, lean — not mid-pull, not stepping), each ankle is IK'd onto its
      // bind stance at floor height. This is what keeps his feet planted when
      // the body rolls into a lean or drifts on a panel lip instead of skating.
      const locked=!!(sp&&alive&&!sp.ref.walking&&["top","seat","lean","lean-in"].includes(sp.state));
      footW+=((locked?1:0)-footW)*Math.min(1,dt*5);
      // Planted-foot lock during a free walk: the foot whose swing curve sits
      // at zero carries him — the same ankle IK the lean uses runs on it while
      // the other leg is up. A leg the stage channels own this frame is theirs;
      // the lock does not fight the stage's own stepping.
      const legFree=sd=>!(stageOwned&&(stageOwned.has(J["thigh"+sd])||stageOwned.has(J["shin"+sd])));
      const plant={L:walking&&legFree("L")?clamp(walkW-kL,0,1):0,
                   R:walking&&legFree("R")?clamp(walkW-kR,0,1):0};
      const wLock={L:Math.max(locked?footW:0,plant.L),R:Math.max(locked?footW:0,plant.R)};
      if((wLock.L>.02||wLock.R>.02)&&footBind.L&&footBind.R){
        footDbg=0;B(J.pelvis).getWorldPosition(_ip);const floorY=shadowY();
        // Stance offsets and the knee pole rotate with his heading — a lean
        // that yaws him 0.85 rad must not leave the feet planted on bind axes.
        const cy=Math.cos(heading),sy=Math.sin(heading);
        for(const sd of["L","R"]){const w=wLock[sd];if(w<.02)continue;
          const fb=footBind[sd],th=B(J["thigh"+sd]),sn=B(J["shin"+sd]),ft=B(J["foot"+sd]);
          if(!th||!sn||!ft)continue;
          ft.getWorldPosition(_it);                                   // current ankle
          _ic.set(_ip.x+fb.x*cy+fb.z*sy,floorY+fb.ankleH,_ip.z-fb.x*sy+fb.z*cy);
          _it.lerp(_ic,w);                                            // eased reach, like the hand plant
          _id.set(_it.x+sy*.5,_it.y+.5,_it.z+cy*.5);                  // pole: knees back along facing
          const r2=ikSolver.solve({rootBone:th,middleBone:sn,endBone:ft,target:_it,poleTarget:_id,preserveEndRotation:!0});
          if(r2&&!r2.reachable)footDbg=1}
      }

      // Twist helpers: Snap's 0002 bones are children of their 0001 parents (via
      // _SSC nodes) and carry real skin weight (~a third of the segment's). They
      // inherit the limb's motion for free; their local X is the limb's long axis
      // (measured on the GLB), so each takes half the parent's twist-about-X —
      // the share that keeps the elbow/shoulder from candy-wrapping on a reach.
      // Runs after IK so the solve's arm rotation is what gets distributed.
      for(const[mk,tk]of LIMB_TWIST){
        const b=B(J[mk]),tw=B(J[tk]);if(!b||!tw)continue;
        Q2.copy(b.userData.q0).invert().multiply(b.quaternion);   // commanded delta in rest frame
        E.set(Math.atan2(Q2.x,Q2.w),0,0,"XYZ");Q.setFromEuler(E); // half the X-twist (atan2 gives θ/2)
        tw.quaternion.copy(tw.userData.q0).multiply(Q)}};

    let now=performance.now()/1000;
    const frame=()=>{
      if(disposed)return;
      raf=requestAnimationFrame(frame);
      const t=performance.now()/1000,dt=clamp(t-now,0,.05);now=t;
      if(document.hidden||ctxLost)return;
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
