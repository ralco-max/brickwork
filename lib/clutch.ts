import type {Piece} from "./bridge";

// A first-order clutch simulation. Weight flows down through stud contacts;
// pieces with nothing grounded beneath them hang from the studs above; a
// piece whose loaded centre lies outside its support footprint levers on its
// studs. Every joint is compared with a conservative per-stud holding force.
// This estimates whether the bricks hold; it does not replace a test build.
export const CLUTCH_PER_STUD=1.6;   // newtons one engaged stud resists in pull-apart
const GRAM_PER_CELL=.095;           // a 2x4 brick (24 cells) weighs about 2.3 g
const G=9.81,STUD_M=.008;
export type ClutchJoint={piece:number;holder:number;kind:"hanging"|"cantilever";studs:number;demand:number;capacity:number;ratio:number};
export type ClutchReport={ratios:Map<number,number>;joints:ClutchJoint[];overloaded:number[];tight:number[];floating:number[];maxRatio:number;grams:number};
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const isTile=(p:Piece)=>p.part.startsWith("306");

export function simulateClutch(pieces:Piece[]):ClutchReport{
 const n=pieces.length,cells=new Map<string,number>();
 pieces.forEach((p,i)=>{for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++)cells.set(key(x,y,z),i);});
 const weight=pieces.map(p=>p.w*p.d*p.h*GRAM_PER_CELL*G/1000);
 // Contact cells between each piece and the pieces directly beneath and above it.
 const below=pieces.map(()=>new Map<number,number>()),above=pieces.map(()=>new Map<number,number>()),footing=pieces.map(()=>[] as [number,number][]);
 pieces.forEach((p,i)=>{for(let x=p.x;x<p.x+p.w;x++)for(let z=p.z;z<p.z+p.d;z++){const j=cells.get(key(x,p.y-1,z));if(j===undefined||j===i)continue;below[i].set(j,(below[i].get(j)||0)+1);above[j].set(i,(above[j].get(i)||0)+1);footing[i].push([x,z]);}});
 // Compression paths: a piece is grounded when it stands on the ground or on a grounded piece.
 const asc=pieces.map((_,i)=>i).sort((a,b)=>pieces[a].y-pieces[b].y),grounded=new Array<boolean>(n).fill(false);
 for(const i of asc)grounded[i]=pieces[i].y===0||[...below[i].keys()].some(j=>grounded[j]);
 const load=weight.slice(),momentX=pieces.map((p,i)=>weight[i]*(p.x+p.w/2)),momentZ=pieces.map((p,i)=>weight[i]*(p.z+p.d/2));
 const pass=(from:number,to:number,share:number)=>{const f=share/load[from];load[to]+=share;momentX[to]+=momentX[from]*f;momentZ[to]+=momentZ[from]*f;};
 const joints:ClutchJoint[]=[],floating:number[]=[];
 // Hanging pieces send their weight up into the studs above them, lowest first so chains accumulate.
 for(const i of asc){
  if(grounded[i])continue;
  const holders=[...above[i]].filter(([k])=>!isTile(pieces[i]));
  const total=holders.reduce((s,[,c])=>s+c,0);
  if(!total){floating.push(i);continue;}
  const before=load[i];
  for(const [k,c] of holders){const demand=before*c/total;joints.push({piece:pieces[i].id,holder:pieces[k].id,kind:"hanging",studs:c,demand,capacity:c*CLUTCH_PER_STUD,ratio:demand/(c*CLUTCH_PER_STUD)});pass(i,k,demand);}
 }
 // Grounded pieces pass their load down, highest first, and lever on their footing when off-centre.
 for(const i of [...asc].reverse()){
  if(!grounded[i])continue;
  const supporters=[...below[i]].filter(([j])=>grounded[j]),total=supporters.reduce((s,[,c])=>s+c,0);
  if(pieces[i].y>0&&total){
   const cx=momentX[i]/load[i],cz=momentZ[i]/load[i],xs=footing[i].map(([x])=>x),zs=footing[i].map(([,z])=>z);
   const minX=Math.min(...xs),maxX=Math.max(...xs)+1,minZ=Math.min(...zs),maxZ=Math.max(...zs)+1;
   const leverX=Math.max(0,minX-cx,cx-maxX),leverZ=Math.max(0,minZ-cz,cz-maxZ);
   if(leverX>0||leverZ>0){
    const alongX=leverX>=leverZ,lever=(alongX?leverX:leverZ)*STUD_M,extent=(alongX?maxX-minX:maxZ-minZ)*STUD_M;
    const studs=supporters.reduce((s,[j,c])=>s+(isTile(pieces[j])?0:c),0),demand=load[i]*lever,capacity=studs*CLUTCH_PER_STUD*extent/2;
    joints.push({piece:pieces[i].id,holder:pieces[supporters[0][0]].id,kind:"cantilever",studs,demand,capacity,ratio:capacity?demand/capacity:Infinity});
   }
   const before=load[i];for(const [j,c] of supporters)pass(i,j,before*c/total);
  }
 }
 const ratios=new Map<number,number>();for(const j of joints)ratios.set(j.piece,Math.max(ratios.get(j.piece)??0,j.ratio));for(const i of floating)ratios.set(pieces[i].id,Infinity);
 const overloaded=[...ratios].filter(([,r])=>r>1).map(([i])=>i),tight=[...ratios].filter(([,r])=>r>.5&&r<=1).map(([i])=>i);
 return {ratios,joints,overloaded,tight,floating:floating.map(i=>pieces[i].id),maxRatio:Math.max(0,...ratios.values()),grams:pieces.reduce((s,p)=>s+p.w*p.d*p.h*GRAM_PER_CELL,0)};
}
