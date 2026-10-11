import type {Piece} from "./bridge";

type Vector={x:number;y:number;z:number};
export type AssemblyFraming={center:Vector;right:Vector;up:Vector;halfWidth:number;halfHeight:number};
export type AssemblyTrack={start:number;duration:number;angle:number;distance:number;back:number;lift:number;peak:number;rx:number;ry:number;rz:number;origin:Vector};
export type AssemblyPose={x:number;y:number;z:number;rx:number;ry:number;rz:number;scale:number;settled:boolean};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
// Only the visible canvas advances this clock. Backgrounding a phone or opening
// a dialog must not skip the intro on return. The landing plays the same intro
// as the studio: a short assembly followed by a finished-model hold. The model
// stays put until Play runs it again.
export const LANDING_INTRO=5.6;
export class LandingAssemblyClock{
 paused=false;reduced=false;speed=1;private elapsed=0;private last:number|null=null;
 reset(){this.elapsed=0;this.last=null;}
 resume(){this.last=null;}
 // Skip lands every brick at once; speed runs the same intro faster.
 skip(){this.elapsed=LANDING_INTRO;}
 tick(now:number){const delta=this.last===null?0:Math.max(0,Math.min(.08,(now-this.last)/1000));this.last=now;if(!this.paused&&!this.reduced)this.elapsed=Math.min(LANDING_INTRO,this.elapsed+delta*this.speed);return this.reduced?1:Math.min(1,this.elapsed/LANDING_INTRO);}
 get done(){return this.reduced||this.elapsed>=LANDING_INTRO;}
 get opacity(){return 1;}
}
// Overlapping waves keep the whole assembly short, while each brick travels in
// at full size from beyond the camera edges rather than materializing locally.
export function assemblyReach(length:number,width:number,height:number){
 const size=Math.hypot(Math.max(1,length),Math.max(1,width),Math.max(1,height)*.4);
 return {distance:size*1.8+24,back:size*.06,lift:Math.max(20,height*.4+Math.max(length,width)*.8),peak:1.1};
}
export function assemblyTracks(pieces:Piece[],length:number,width:number,height:number,frame?:AssemblyFraming){
 const reach=assemblyReach(length,width,height),tracks=new Map<number,AssemblyTrack>();
 const layers=[...new Set(pieces.map(p=>p.y))].sort((a,b)=>a-b),layerIndex=new Map(layers.map((y,i)=>[y,i]));
 for(const p of pieces){
  const seed=p.id+1,layer=(layerIndex.get(p.y)??0)/Math.max(1,layers.length-1);
  const sweep=clamp((p.x+p.w/2)/Math.max(length,1))*.7+clamp((p.z+p.d/2)/Math.max(width,1))*.3;
  // Approach lanes fan across the upper and side edges, with stable variation.
  const angle=Math.PI*(.035+.93*hash(seed+17)),distance=reach.distance*(.9+.18*hash(seed+9)),lift=reach.lift*(.8+.2*layer);
  let origin={x:Math.cos(angle)*distance,y:lift,z:Math.sin(angle)*distance};
  if(frame){
   const cosine=Math.cos(angle),sine=Math.sin(angle),edge=Math.max(Math.abs(cosine),Math.abs(sine));
   const radius=Math.hypot(p.w,p.h*.4,p.d)/2+.3;
   // A rectangular outer ring guarantees at least one screen coordinate is
   // outside the view, including the complete rotating piece, on narrow phones.
   const across=cosine/edge*(frame.halfWidth*1.75+radius*1.5+4),above=sine/edge*(frame.halfHeight*1.75+radius*1.5+4);
   const final={x:p.x+p.w/2-length/2,y:p.y*.4+p.h*.2,z:p.z+p.d/2-width/2};
   origin={x:frame.center.x+frame.right.x*across+frame.up.x*above-final.x,y:frame.center.y+frame.right.y*across+frame.up.y*above-final.y,z:frame.center.z+frame.right.z*across+frame.up.z*above-final.z};
  }
  tracks.set(p.id,{start:.005+.53*layer+.055*sweep,duration:.28+.015*hash(seed+3),angle,distance,back:reach.back,lift,peak:reach.peak,origin,
   rx:(hash(seed+5)-.5)*.20,ry:(hash(seed+7)-.5)*.34,rz:(hash(seed+11)-.5)*.16});
 }
 return tracks;
}
// Exploded inspection is a separate, compact arrangement: offscreen cinematic
// origins must never force a tiny model or a huge zoom-out while editing.
export function inspectionReach(length:number,width:number,height:number){
 const distance=Math.min(14,Math.max(3,Math.max(length,width,1)*.12)),lift=Math.min(12,Math.max(3,height*.4*.18));
 return {distance,back:distance,lift,peak:.6};
}
export function inspectionTracks(pieces:Piece[],length:number,width:number,height:number){
 const reach=inspectionReach(length,width,height),tracks=assemblyTracks(pieces,length,width,height);
 for(const p of pieces){const track=tracks.get(p.id)!,seed=p.id+1,angle=Math.atan2(p.z+p.d/2-width/2,p.x+p.w/2-length/2)+(hash(seed)-.5)*.24,distance=reach.distance*(.65+.25*hash(seed+9)),lift=reach.lift*.8;
  Object.assign(track,{angle,distance,lift,back:reach.distance*.14,peak:reach.peak,origin:{x:Math.cos(angle)*distance,y:lift,z:Math.sin(angle)*distance}});
 }
 return tracks;
}
export function assemblyPose(track:AssemblyTrack,time:number):AssemblyPose{
 const u=clamp((time-track.start)/track.duration);
 if(u>=1)return {x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true};
 // Bricks enter already moving, then decelerate continuously into an exact,
 // quiet landing. The velocity change at launch happens safely off screen.
 const remaining=(1-u)**3,arc=Math.sin(Math.PI*u)*remaining;
 const spin=(1-clamp(u/.8))**3;
 return {x:track.origin.x*remaining-Math.sin(track.angle)*track.back*arc,
  y:track.origin.y*remaining+track.peak*arc,
  z:track.origin.z*remaining+Math.cos(track.angle)*track.back*arc,
  rx:track.rx*spin,ry:track.ry*spin,rz:track.rz*spin,scale:1,settled:false};
}
