import type {Piece} from "./bridge";
import {assemblyPose,assemblyTracks} from "./assembly";
import type {AssemblyTrack} from "./assembly";
import type {GeneratedScene} from "./generated-scene";
import type {DesignBrief} from "./design-project";
export function foundationScene(brief:DesignBrief):GeneratedScene{
 // This is real starting geometry supplied to the designer, not a progress prop.
 // Keep its plate count modest even when the requested overall bounds are large.
 // A small placeholder so the stage is never empty; the designer resizes it to the subject.
 const x=Math.min(brief.maxWidth,12),z=Math.min(brief.maxDepth,12);
 return {name:"Display foundation",description:"A placeholder two-layer foundation. Resize or replace it so the base fits the design's own footprint; its size is not a requirement.",dimensions:{x:brief.maxWidth,y:brief.maxHeight,z:brief.maxDepth},shapes:[{id:"display-foundation",component:"Foundation",label:"Display foundation",kind:"box",operation:"add",color:"gray",position:{x:0,y:0,z:0},size:{x,y:2,z},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}}]};
}
export type Arrival={track:AssemblyTrack;at:number};
export const brickIdentity=(p:Piece)=>`${p.part}:${p.color}:${p.x}:${p.y}:${p.z}:${p.w}:${p.h}:${p.d}:${p.rotated}`;
export function reconcileArrivals(previous:Map<string,Arrival>,pieces:Piece[],now:number,length:number,width:number,height:number){
 const tracks=assemblyTracks(pieces,length,width,height),next=new Map<string,Arrival>();
 const fresh=pieces.filter(p=>!previous.has(brickIdentity(p))).sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x);
 const ranks=new Map(fresh.map((p,i)=>[brickIdentity(p),i]));
 for(const p of pieces){const key=brickIdentity(p);next.set(key,previous.get(key)||{track:{...tracks.get(p.id)!,start:0,distance:Math.max(5,Math.max(length,width)*.18),lift:Math.max(8,height*.16)},at:now+(ranks.get(key)||0)/Math.max(1,fresh.length-1)*1.1});}
 return next;
}
export function arrivalPose(arrival:Arrival,now:number,reduced=false){return assemblyPose(arrival.track,reduced?1:Math.max(0,now-arrival.at)/1.35*.175);}

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
