import type {Piece} from "./bridge";

export type AssemblyTrack={start:number;angle:number;distance:number;back:number;lift:number;peak:number;rx:number;ry:number;rz:number};
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
// Where the bricks come from: behind the model at a modest height, a little spread to the
// sides. Each one swoops forward and up over the build, crests, and settles into place.
export function assemblyReach(length:number,width:number,height:number){const size=Math.max(length,width);return {distance:Math.max(8,size*.25),back:Math.max(30,size*.7),lift:Math.max(18,height*.4*.6),peak:Math.max(22,height*.4*.55)};}
export function assemblyTracks(pieces:Piece[],length:number,width:number,height:number){
 const reach=assemblyReach(length,width,height);
 const sorted=[...pieces].sort((a,b)=>a.y-b.y||a.stage-b.stage||a.z-b.z||a.x-b.x||a.id-b.id),tracks=new Map<number,AssemblyTrack>();
 sorted.forEach((p,rank)=>{const seed=p.id+1,angle=hash(seed)*Math.PI*2;tracks.set(p.id,{start:.025+.70*rank/Math.max(1,sorted.length-1),angle,distance:reach.distance*(.3+hash(seed+9)*.9),back:reach.back*(.8+hash(seed+13)*.5),lift:reach.lift+hash(seed+3)*14,peak:reach.peak*(.8+hash(seed+17)*.5),rx:(hash(seed+5)-.5)*1.5,ry:(hash(seed+7)-.5)*2.6,rz:(hash(seed+11)-.5)*1.3});});return tracks;
}
export function assemblyPose(track:AssemblyTrack,time:number):AssemblyPose{
 // Every brick is in the air from the first frame, waiting at the far end of its own path, so the
 // late arrivals are already part of the picture instead of appearing out of nowhere.
 const u=clamp((time-track.start)/.175);if(u>=1)return {x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true};
 // A swoosh: from behind and slightly to one side, forward and up over the build, then down onto it.
 const eased=u*u*u*(u*(u*6-15)+10),remaining=1-eased,arc=Math.sin(Math.PI*eased),spin=remaining*remaining;
 return {x:Math.cos(track.angle)*track.distance*remaining,y:track.lift*remaining+track.peak*arc,z:-track.back*remaining+Math.sin(track.angle)*track.distance*.35*remaining,rx:track.rx*spin,ry:track.ry*spin,rz:track.rz*spin,scale:1,settled:false};
}
