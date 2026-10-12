import type {Piece} from "./bridge";
import {assemblyPose,assemblyTracks} from "./assembly";
import type {AssemblyTrack,AssemblyFraming} from "./assembly";
import type {GeneratedScene} from "./generated-scene";
import type {DesignBrief} from "./design-project";
export function foundationScene(brief:DesignBrief):GeneratedScene{
 // This is real starting geometry supplied to the designer, not a progress prop.
 // Keep its plate count modest even when the requested overall bounds are large.
 // A small placeholder so the stage is never empty; the designer resizes it to the subject.
 const x=Math.min(brief.maxWidth,12),z=Math.min(brief.maxDepth,12);
 return {name:"Display foundation",description:"A placeholder two-layer foundation. Resize or replace it so the base fits the design's own footprint; its size is not a requirement.",dimensions:{x:brief.maxWidth,y:brief.maxHeight,z:brief.maxDepth},shapes:[{id:"display-foundation",component:"Foundation",label:"Display foundation",kind:"box",operation:"add",color:"gray",position:{x:0,y:0,z:0},size:{x,y:2,z},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}}]};
}
export type ArrivalMode="assemble"|"revise"|"still";
export type Arrival={track:AssemblyTrack;at:number;mode?:ArrivalMode};
export const ARRIVAL_FLIGHT_SECONDS=1.6;
export const ARRIVAL_FADE_SECONDS=.32;
export const brickIdentity=(p:Piece)=>`${p.part}:${p.color}:${p.x}:${p.y}:${p.z}:${p.w}:${p.h}:${p.d}:${p.rotated}:${p.face||""}`;
export function reconcileArrivals(previous:Map<string,Arrival>,pieces:Piece[],now:number,length:number,width:number,height:number,frame?:AssemblyFraming,mode:ArrivalMode="assemble"){
 const tracks=assemblyTracks(pieces,length,width,height,frame),next=new Map<string,Arrival>();
 const fresh=pieces.filter(p=>{const old=previous.get(brickIdentity(p));return !old||(mode==="assemble"&&(old.mode??"assemble")!=="assemble");}).sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x);
 const ranks=new Map(fresh.map((p,i)=>[brickIdentity(p),i]));
 for(const p of pieces){
  const key=brickIdentity(p),old=previous.get(key),oldMode=old?.mode??"assemble";
  // A repaint or repack can publish many times during one fade. Preserve the
  // original birth time; unchanged bricks never restart or fly through a revision.
  if(old&&((mode==="revise"&&oldMode==="revise")||(mode==="still"&&oldMode==="still")||(mode==="assemble"&&oldMode==="assemble"))){next.set(key,old);continue;}
  const nextMode=mode==="revise"&&old?"still":mode;
  next.set(key,{track:{...tracks.get(p.id)!,start:0,duration:1},at:now+(nextMode==="assemble"?(ranks.get(key)||0)/Math.max(1,fresh.length-1)*.6:0),mode:nextMode});
 }
 return next;
}
export function arrivalPose(arrival:Arrival,now:number,reduced=false){return assemblyPose(arrival.track,reduced||arrival.mode==="revise"||arrival.mode==="still"||now>=arrival.at+ARRIVAL_FLIGHT_SECONDS?1:Math.max(0,now-arrival.at)/ARRIVAL_FLIGHT_SECONDS);}
export function arrivalOpacity(arrival:Arrival,now:number,reduced=false){
 if(reduced||arrival.mode!=="revise"||now>=arrival.at+ARRIVAL_FADE_SECONDS)return 1;
 const progress=Math.max(0,Math.min(1,(now-arrival.at)/ARRIVAL_FADE_SECONDS));
 return progress*progress*(3-2*progress);
}
export function arrivalEndTime(arrival:Arrival){return arrival.at+(arrival.mode==="still"?0:arrival.mode==="revise"?ARRIVAL_FADE_SECONDS:ARRIVAL_FLIGHT_SECONDS);}

// One compilation in flight and one pending snapshot. The trailing snapshot is
// always published before final compilation, even if the stream ends quickly.
export class PreviewQueue<T,R>{
 private next:{value:T}|null=null;private active:Promise<void>|null=null;private cancelled=false;private last=0;
 constructor(private compile:(value:T)=>Promise<R>,private publish:(value:R)=>void,private failure:(error:unknown)=>void,private interval=0){}
 push(value:T){if(this.cancelled)return;this.next={value};if(!this.active)this.active=this.drain();}
 private async drain(){try{while(this.next&&!this.cancelled){const delay=this.interval-(Date.now()-this.last);if(delay>0)await new Promise(r=>setTimeout(r,delay));if(this.cancelled||!this.next)break;const task=this.next;this.next=null;try{const value=await this.compile(task.value);if(!this.cancelled){this.publish(value);this.last=Date.now();}}catch(e){if(!this.cancelled)this.failure(e);}}}finally{this.active=null;}}
 async flush(){while(this.active)await this.active;}
 cancel(){this.cancelled=true;this.next=null;}
}
