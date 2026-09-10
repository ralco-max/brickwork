import {PARTS} from "./bridge";
import type {ColorKey,Face,PartId,Piece} from "./bridge";
import {voxelKey} from "./models";
import type {VoxelMap} from "./models";

// A real builder finishes stepped surfaces with slopes. Before the packer runs,
// this pass looks for the staircase patterns a voxelized curve or pitch leaves
// behind and swaps each one for the slope part that matches its rise and run:
// 45 degree slopes for a 3-plate step, cheese slopes for a 2-plate step, curved
// slopes for two 1-plate steps, 33 degree slopes for a 3-plate rise over two
// studs, and inverted 45 degree slopes for the same staircase on an underside.
// A slope is only fitted where the staircase keeps rising behind it (a flat roof
// edge stays square) and where it rests on something, so every slope piece is
// supported and every cell it replaces was part of the surface, and only where
// the column directly behind the step is solid: a slope leans against mass. On a
// one-stud-thick curved skin the step is backed by void, and carving it would only
// fragment the skin into small pieces with less clutch, so it stays as bricks.
// The cells a slope takes are removed from the voxel map; the packer fills the rest.
type Dir={face:Face;dx:number;dz:number;rx:number;rz:number};
const DIRS:Dir[]=[{face:"pz",dx:0,dz:1,rx:1,rz:0},{face:"nz",dx:0,dz:-1,rx:1,rz:0},{face:"px",dx:1,dz:0,rx:0,rz:1},{face:"nx",dx:-1,dz:0,rx:0,rz:1}];
type Match={cells:[number,number,number][];columns:[number,number][]};
type Pattern={part1?:PartId;part2:PartId;match:(x:number,y:number,z:number,d:Dir,c:ColorKey)=>Match|null};

export function carveSlopes(voxels:VoxelMap,protect:Set<string>=new Set()):Piece[]{
 const at=(x:number,y:number,z:number)=>voxels.get(voxelKey(x,y,z));
 const has=(x:number,y:number,z:number)=>voxels.has(voxelKey(x,y,z));
 const filled=(x:number,z:number,y0:number,n:number,c:ColorKey)=>{for(let i=0;i<n;i++)if(at(x,y0+i,z)!==c)return false;return true;};
 const empty=(x:number,z:number,y0:number,n:number)=>{for(let i=0;i<n;i++)if(has(x,y0+i,z))return false;return true;};
 const footed=(x:number,y:number,z:number)=>y===0||has(x,y-1,z);
 const column=(x:number,z:number,y0:number,n:number):[number,number,number][]=>Array.from({length:n},(_,i)=>[x,y0+i,z]);
 // Solid mass behind the step, and that mass must stand on something itself: on a leaning member the
 // cell behind is an overhang that only holds because it shares a brick with this one, so carving
 // this one into a slope would leave it hanging.
 const backed=(x:number,z:number,y0:number,n:number,d:Dir)=>{if(!footed(x-d.dx,y0,z-d.dz))return false;for(let i=0;i<n;i++)if(!has(x-d.dx,y0+i,z-d.dz))return false;return true;};
 // Each pattern is described from its back column at (x, y0, z), looking toward the face.
 const patterns:Pattern[]=[
  // 33 degrees: a full back column, then 2 and 1 plates over the next two studs.
  {part1:"4286",part2:"3298",match:(x,y0,z,d,c)=>{const [x1,z1]=[x+d.dx,z+d.dz],[x2,z2]=[x+2*d.dx,z+2*d.dz];
   if(!filled(x,z,y0,3,c)||!filled(x1,z1,y0,2,c)||!empty(x1,z1,y0+2,1)||!filled(x2,z2,y0,1,c)||!empty(x2,z2,y0+1,2)||!empty(x+3*d.dx,z+3*d.dz,y0,1))return null;
   if(!(has(x,y0+3,z)||has(x-d.dx,y0+3,z-d.dz)))return null;if(!footed(x,y0,z)||!footed(x1,y0,z1)||!footed(x2,y0,z2)||!backed(x,z,y0,3,d))return null;
   return {cells:[...column(x,z,y0,3),...column(x1,z1,y0,2),...column(x2,z2,y0,1)],columns:[[x,z],[x1,z1],[x2,z2]]};}},
  // Curved: two 1-plate steps over two studs, 2 plates tall.
  {part1:"11477",part2:"15068",match:(x,y0,z,d,c)=>{const [x1,z1]=[x+d.dx,z+d.dz];
   if(!filled(x,z,y0,2,c)||!empty(x,z,y0+2,1)||!filled(x1,z1,y0,1,c)||!empty(x1,z1,y0+1,2)||!empty(x+2*d.dx,z+2*d.dz,y0,1))return null;
   if(!has(x-d.dx,y0+2,z-d.dz)||!footed(x,y0,z)||!footed(x1,y0,z1)||!backed(x,z,y0,2,d))return null;
   return {cells:[...column(x,z,y0,2),...column(x1,z1,y0,1)],columns:[[x,z],[x1,z1]]};}},
  // 45 degrees: a 3-plate step with the staircase rising behind it. Pairs only; there is no 1-stud 45 degree slope.
  {part2:"3040",match:(x,y0,z,d,c)=>{if(!filled(x,z,y0,3,c)||!empty(x,z,y0+3,1)||!empty(x+d.dx,z+d.dz,y0,3)||!has(x-d.dx,y0+3,z-d.dz)||!footed(x,y0,z)||!backed(x,z,y0,3,d))return null;return {cells:column(x,z,y0,3),columns:[[x,z]]};}},
  // Inverted 45 degrees: the same step on an underside, held by the piece above it. The course above
  // must also cover the column behind, so it keeps a stud path down through that column once this
  // one no longer shares a brick with it (a leaning member's underside stays as bricks).
  {part2:"3665",match:(x,y0,z,d,c)=>{if(!filled(x,z,y0,3,c)||has(x,y0-1,z)||!empty(x+d.dx,z+d.dz,y0,3)||!has(x-d.dx,y0-1,z-d.dz)||!has(x,y0+3,z)||!has(x-d.dx,y0+3,z-d.dz)||!backed(x,z,y0,3,d))return null;return {cells:column(x,z,y0,3),columns:[[x,z]]};}},
  // Cheese: a 2-plate step.
  {part1:"54200",part2:"85984",match:(x,y0,z,d,c)=>{if(!filled(x,z,y0,2,c)||!empty(x,z,y0+2,1)||!empty(x+d.dx,z+d.dz,y0,2)||!has(x-d.dx,y0+2,z-d.dz)||!footed(x,y0,z)||!backed(x,z,y0,2,d))return null;return {cells:column(x,z,y0,2),columns:[[x,z]]};}},
 ];
 const pieces:Piece[]=[];
 const place=(part:PartId,color:ColorKey,d:Dir,y:number,matches:Match[])=>{
  const columns=matches.flatMap(m=>m.columns),xs=columns.map(([x])=>x),zs=columns.map(([,z])=>z);
  for(const [cx,cy,cz] of matches.flatMap(m=>m.cells))voxels.delete(voxelKey(cx,cy,cz));
  pieces.push({id:pieces.length,part,color,x:Math.min(...xs),y,z:Math.min(...zs),w:Math.max(...xs)-Math.min(...xs)+1,d:Math.max(...zs)-Math.min(...zs)+1,h:PARTS[part].h,rotated:d.face==="px"||d.face==="nx",stage:0,face:d.face});
 };
 const positions=[...voxels.keys()].map(k=>k.split(",").map(Number) as [number,number,number]).sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
 for(const [x,y,z] of positions){
  const c=at(x,y,z);if(!c)continue;
  let done=false;
  for(const d of DIRS){if(done)break;
   for(const pattern of patterns){
    const first=pattern.match(x,y,z,d,c);if(!first||first.cells.some(([cx,cy,cz])=>protect.has(voxelKey(cx,cy,cz))))continue;
    let second=pattern.match(x+d.rx,y,z+d.rz,d,c);if(second&&second.cells.some(([cx,cy,cz])=>protect.has(voxelKey(cx,cy,cz))))second=null;
    // An inverted pair takes overhanging cells. A neighbouring overhang cell along the ridge that
    // will not become a slope itself must keep these cells to bridge back into the mass, so the
    // pair is refused rather than leaving a corner plate with nothing to hold it.
    if(pattern.part2==="3665"&&second){const flanks:[number,number][]=[[x-d.rx,z-d.rz],[x+2*d.rx,z+2*d.rz]];if(flanks.some(([fx,fz])=>has(fx,y,fz)&&!footed(fx,y,fz)&&!pattern.match(fx,y,fz,d,c)))continue;}
    if(second){
     // A 45 degree pair with a full column behind both becomes the 2 x 2 slope, whose back row keeps its studs.
     if(pattern.part2==="3040"){const bx=x-d.dx,bz=z-d.dz,b2x=bx+d.rx,b2z=bz+d.rz;if(filled(bx,bz,y,3,c)&&filled(b2x,b2z,y,3,c)&&footed(bx,y,bz)&&footed(b2x,y,b2z)){place("3039",c,d,y,[first,second,{cells:[...column(bx,bz,y,3),...column(b2x,b2z,y,3)],columns:[[bx,bz],[b2x,b2z]]}]);done=true;break;}}
     place(pattern.part2,c,d,y,[first,second]);done=true;break;
    }
    if(pattern.part1){place(pattern.part1,c,d,y,[first]);done=true;break;}
   }
  }
 }
 return pieces;
}
