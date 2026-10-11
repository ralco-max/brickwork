import type {Piece} from "./bridge";

export type AssemblyTrack={start:number;duration:number;angle:number;distance:number;back:number;lift:number;peak:number;rx:number;ry:number;rz:number};
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
// Build in overlapping layer waves. Bricks begin close to their final silhouette,
// fanned gently outward, instead of waiting in a random cloud across the screen.
export function assemblyReach(length:number,width:number,height:number){
 const size=Math.max(length,width,1);
 const distance=Math.min(14,Math.max(3,size*.12)),lift=Math.min(12,Math.max(3,height*.4*.18));
 return {distance,back:distance,lift,peak:.6};
}
export function assemblyTracks(pieces:Piece[],length:number,width:number,height:number){
 const reach=assemblyReach(length,width,height),tracks=new Map<number,AssemblyTrack>();
 const layers=[...new Set(pieces.map(p=>p.y))].sort((a,b)=>a-b),layerIndex=new Map(layers.map((y,i)=>[y,i]));
 for(const p of pieces){
  const seed=p.id+1,layer=(layerIndex.get(p.y)??0)/Math.max(1,layers.length-1);
  // Spatial sweep within a layer gives neighboring bricks a common rhythm.
  const sweep=clamp((p.x+p.w/2)/Math.max(length,1))*.7+clamp((p.z+p.d/2)/Math.max(width,1))*.3;
  const px=p.x+p.w/2-length/2,pz=p.z+p.d/2-width/2;
  const angle=Math.atan2(pz,px)+(hash(seed)-.5)*.24;
  tracks.set(p.id,{start:.015+.60*layer+.07*sweep,duration:.19,
   angle,distance:reach.distance*(.65+.25*hash(seed+9)),back:reach.distance*.14,
   lift:reach.lift*(.65+.25*layer),peak:reach.peak,
   rx:(hash(seed+5)-.5)*.22,ry:(hash(seed+7)-.5)*.38,rz:(hash(seed+11)-.5)*.18});
 }
 return tracks;
}
export function assemblyPose(track:AssemblyTrack,time:number):AssemblyPose{
 const u=clamp((time-track.start)/track.duration);
 if(u>=1)return {x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true};
 // Quintic easing has zero velocity/acceleration at both ends. The small
 // tangential arc straightens on approach, and rotation resolves before seating.
 const eased=clamp(u*u*u*(u*(u*6-15)+10)),remaining=1-eased;
 const arc=Math.sin(Math.PI*u)**2*remaining;
 const turn=1-clamp(u/.82),spin=turn*turn*(3-2*turn);
 return {x:Math.cos(track.angle)*track.distance*remaining-Math.sin(track.angle)*track.back*arc,
  y:track.lift*remaining+track.peak*arc,
  z:Math.sin(track.angle)*track.distance*remaining+Math.cos(track.angle)*track.back*arc,
  rx:track.rx*spin,ry:track.ry*spin,rz:track.rz*spin,scale:1,settled:false};
}
