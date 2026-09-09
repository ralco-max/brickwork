import type {Piece} from "./bridge";

export type AssemblyTrack={start:number;angle:number;distance:number;lift:number;rx:number;ry:number;rz:number};
export type AssemblyPose={x:number;y:number;z:number;rx:number;ry:number;rz:number;scale:number;settled:boolean};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
// Only the visible canvas advances this clock. Backgrounding a phone or opening
// a dialog must not skip the intro on return. The landing plays the same intro
// as the studio: the bricks fly in over 18 seconds, then the finished model
// stays put until Play runs it again.
export const LANDING_INTRO=18;
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
export function assemblyTracks(pieces:Piece[],length:number,width:number,height:number){
 const sorted=[...pieces].sort((a,b)=>a.y-b.y||a.stage-b.stage||a.z-b.z||a.x-b.x||a.id-b.id),tracks=new Map<number,AssemblyTrack>();
 sorted.forEach((p,rank)=>{const seed=p.id+1,angle=hash(seed)*Math.PI*2;tracks.set(p.id,{start:.025+.70*rank/Math.max(1,sorted.length-1),angle,distance:Math.max(10,Math.max(length,width)*.24)*(1+hash(seed+9)*.45),lift:Math.max(12,height*.4*.5)+hash(seed+3)*10,rx:(hash(seed+5)-.5)*1.5,ry:(hash(seed+7)-.5)*2.6,rz:(hash(seed+11)-.5)*1.3});});return tracks;
}
export function assemblyPose(track:AssemblyTrack,time:number):AssemblyPose{
 const u=clamp((time-track.start)/.175);if(u>=1)return {x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true};
 const eased=u*u*u*(u*(u*6-15)+10),remaining=1-eased,arc=Math.sin(Math.PI*u),spin=remaining*remaining;
 return {x:Math.cos(track.angle)*track.distance*remaining+Math.sin(track.angle)*arc*2.5,y:track.lift*remaining+arc*4,z:Math.sin(track.angle)*track.distance*remaining-Math.cos(track.angle)*arc*2.5,rx:track.rx*spin,ry:track.ry*spin,rz:track.rz*spin,scale:time<track.start?0:Math.min(1,u*9),settled:false};
}
