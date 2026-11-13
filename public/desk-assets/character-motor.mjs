/* CRID CHARACTER MOTOR — deterministic 2.5D root physics.
 * Screen coordinates: x right, y down, pixels and seconds. This is deliberately
 * not a ragdoll: one weighted body, solid platform contacts, and explicit hand
 * grips drive the existing Bitmoji skeleton/IK. */
import { GRAVITY } from "./physics.mjs";

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(v,target,amount)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
const REST=0.0001;

export function createCharacterMotor({gravity=GRAVITY,fixedDt=1/120,maxSteps=24}={}) {
  const actor={
    x:0,feetY:0,vx:0,vy:0,width:100,height:300,mass:1,strength:1,
    grounded:true,supportId:"floor",distance:0,deltaX:0,grip:null,
  };
  let floorY=0,surfaces=[],acc=0,command=null,climb=null;
  const setScene=({floor=floorY,platforms=[]}={})=>{
    floorY=Number.isFinite(floor)?floor:floorY;
    surfaces=platforms.filter(s=>s&&Number.isFinite(s.left)&&Number.isFinite(s.right)&&Number.isFinite(s.top))
      .map(s=>({id:String(s.id),left:Math.min(s.left,s.right),right:Math.max(s.left,s.right),
        top:s.top,bottom:Number.isFinite(s.bottom)?s.bottom:floorY,solidSides:s.solidSides!==false}));
    if(actor.supportId!=="floor"&&!surfaces.some(s=>s.id===actor.supportId)) {
      actor.grounded=false;actor.supportId=null;
    }
  };
  const configure=({width=actor.width,height=actor.height,mass=actor.mass,strength=mass}={})=>{
    actor.width=Math.max(1,width);actor.height=Math.max(1,height);
    actor.mass=Math.max(.05,mass);actor.strength=Math.max(.05,strength);
  };
  const reset=({x,feetY=floorY,width,height,mass=1,strength=mass}={})=>{
    if(Number.isFinite(width))actor.width=Math.max(1,width);
    if(Number.isFinite(height))actor.height=Math.max(1,height);
    actor.x=Number.isFinite(x)?x:0;actor.feetY=Number.isFinite(feetY)?feetY:floorY;
    actor.vx=0;actor.vy=0;actor.mass=Math.max(.05,mass);actor.strength=Math.max(.05,strength);
    actor.grounded=true;actor.supportId="floor";actor.distance=0;actor.deltaX=0;actor.grip=null;
    command=null;climb=null;acc=0;return snapshot();
  };
  const moveTo=(x,{maxSpeed=160,acceleration=520,strength=actor.strength,load=0}={})=>{
    if(!Number.isFinite(x)){command=null;return}
    command={x,maxSpeed:Math.max(0,maxSpeed),acceleration:Math.max(1,acceleration),
      strength:Math.max(.05,strength),load:Math.max(0,load)};
  };
  const stop=()=>{command=null};
  const jump=({height=120,horizontal=0}={})=>{
    if(!actor.grounded)return false;
    const g=Math.max(1,gravity);
    actor.vy=-Math.sqrt(2*g*Math.max(0,height));
    actor.vx+=horizontal;actor.grounded=false;actor.supportId=null;climb=null;actor.grip=null;
    return true;
  };
  const grab=(anchor)=>{
    if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))return false;
    actor.grip={id:String(anchor.id??"ledge"),x:anchor.x,y:anchor.y,side:anchor.side<0?-1:1};
    return true;
  };
  const climbTo=({x,feetY,strength=actor.strength,load=0}={})=>{
    if(!actor.grip||!Number.isFinite(x)||!Number.isFinite(feetY))return false;
    climb={x,feetY,strength:Math.max(.05,strength),load:Math.max(0,load)};
    command=null;return true;
  };
  const releaseGrip=()=>{actor.grip=null;climb=null};
  const supportSurface=()=>actor.supportId==="floor"?{id:"floor",top:floorY}:surfaces.find(s=>s.id===actor.supportId)||null;
  const overlaps=(s,x=actor.x)=>x+actor.width/2>s.left+REST&&x-actor.width/2<s.right-REST;
  const resolveHorizontal=(oldX)=>{
    const left=actor.x-actor.width/2,right=actor.x+actor.width/2;
    const top=actor.feetY-actor.height,bottom=actor.feetY;
    for(const s of surfaces){
      if(!s.solidSides||bottom<=s.top+REST||top>=s.bottom-REST)continue;
      if(right>s.left&&left<s.right){
        if(actor.x>=oldX)actor.x=s.left-actor.width/2;
        else actor.x=s.right+actor.width/2;
        actor.vx=0;
      }
    }
  };
  const resolveVertical=(oldFeet,oldVy)=>{
    actor.grounded=false;actor.supportId=null;
    if(oldVy>=0&&actor.feetY>=oldFeet){
      let best=null;
      for(const s of surfaces){
        if(!overlaps(s))continue;
        if(oldFeet<=s.top+REST&&actor.feetY>=s.top-REST&&(!best||s.top<best.top))best=s;
      }
      if(best){actor.feetY=best.top;actor.vy=0;actor.grounded=true;actor.supportId=best.id}
    }
    if(actor.feetY>=floorY){
      actor.feetY=floorY;
      if(actor.vy>0)actor.vy=0;
      actor.grounded=true;actor.supportId="floor";
    }
    if(actor.grounded&&Math.abs(actor.vy)<REST)actor.vy=0;
  };
  const substep=dt=>{
    const oldX=actor.x,oldFeet=actor.feetY,oldVy=actor.vy;
    const support=supportSurface();
    if(actor.grounded&&(!support||!overlaps(support))){
      actor.grounded=false;actor.supportId=null;
    } else if(actor.grounded&&support){actor.feetY=support.top;actor.vy=0}
    const carryingMass=climb?climb.load:command?command.load:0;
    if(climb&&actor.grip){
      const cap=5200*climb.strength/(actor.mass+carryingMass);
      let ax=(climb.x-actor.x)*16-actor.vx*6;
      let ay=(climb.feetY-actor.feetY)*16-actor.vy*6-gravity;
      const mag=Math.hypot(ax,ay);
      if(mag>cap){const k=cap/mag;ax*=k;ay*=k}
      actor.vx+=ax*dt;actor.vy+=(gravity+ay)*dt;
    } else {
      const load=command?.load||0,strength=command?.strength||actor.strength;
      const mobility=strength/(actor.mass+load);
      const maxSpeed=(command?.maxSpeed||0)*mobility;
      const accel=(command?.acceleration||720)*mobility;
      const dx=command?command.x-actor.x:0;
      const braking=command?Math.sqrt(Math.max(0,2*accel*Math.abs(dx))):0;
      const desired=command?Math.sign(dx)*Math.min(maxSpeed,braking):0;
      actor.vx=approach(actor.vx,desired,accel*dt);
      if(!command&&actor.grounded)actor.vx*=Math.exp(-10*dt);
      else if(!command&& !actor.grounded)actor.vx*=Math.exp(-.8*dt);
      actor.vy+=gravity*dt;
    }
    actor.x+=actor.vx*dt;
    resolveHorizontal(oldX);
    actor.feetY+=actor.vy*dt;
    resolveVertical(oldFeet,oldVy);
    actor.deltaX=actor.x-oldX;
    actor.distance+=Math.abs(actor.deltaX);
  };
  const step=dt=>{
    if(!Number.isFinite(dt)||dt<=0)return snapshot();
    acc+=Math.min(dt,.1);let n=0;
    while(acc>=fixedDt&&n<maxSteps){acc-=fixedDt;substep(fixedDt);n++}
    if(n===maxSteps&&acc>=fixedDt)acc%=fixedDt;
    return snapshot();
  };
  const snapshot=()=>({
    x:actor.x,feetY:actor.feetY,vx:actor.vx,vy:actor.vy,width:actor.width,height:actor.height,
    mass:actor.mass,strength:actor.strength,grounded:actor.grounded,supportId:actor.supportId,
    distance:actor.distance,deltaX:actor.deltaX,grip:actor.grip?{...actor.grip}:null,
  });
  return {actor,setScene,configure,reset,moveTo,stop,jump,grab,climbTo,releaseGrip,step,snapshot,
    get fixedDt(){return fixedDt}};
}
