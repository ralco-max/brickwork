import {catalogPart} from "./part-catalog";
import {LEGACY_PARTS,PARTS,SLOPES,TILES,WHEELS} from "./bridge";
import type {Face,Piece} from "./bridge";
import {isMinifig} from "./minifig";

export type PartCell=readonly [number,number,number];
type Shape=Pick<Piece,"part"|"w"|"d">&Partial<Pick<Piece,"h"|"face"|"rotated">>;
type Located=Shape&Pick<Piece,"x"|"y"|"z">;
type Spatial={cells:readonly PartCell[];top:readonly PartCell[];bottom:readonly PartCell[];cellKeys:ReadonlySet<string>;solidBox:boolean};
const cache=new Map<string,Spatial>();
const faces:Face[]=["pz","px","nz","nx"];
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const legacy=(part:string)=>Object.hasOwn(LEGACY_PARTS,part);
const faceFor=(p:Pick<Shape,"face"|"rotated">):Face=>p.face??(p.rotated?"px":"pz");

// New parts use all four upright quarter turns. Legacy part coordinates keep
// their saved 0/90-degree footprint convention, including existing slopes.
export function partDimensions(part:string,rotated=false,face?:Face){
 const definition=Object.hasOwn(PARTS,part)?PARTS[part]:undefined;if(!definition)throw Error(`Unsupported part ${part}.`);
 const actualFace=face??(rotated?"px":"pz"),turn=legacy(part)?rotated:actualFace==="px"||actualFace==="nx";
 return {w:turn?definition.d:definition.w,d:turn?definition.w:definition.d,h:definition.h,rotated:turn,...(!legacy(part)||Object.hasOwn(SLOPES,part)?{face:actualFace}:{})};
}
function rotateCell([x,y,z]:PartCell,w:number,d:number,turn:number):PartCell{
 return turn===1?[z,y,w-1-x]:turn===2?[w-1-x,y,d-1-z]:turn===3?[d-1-z,y,x]:[x,y,z];
}
function unique(cells:readonly PartCell[]):readonly PartCell[]{
 return Object.freeze([...new Map(cells.map(c=>[key(...c),Object.freeze([...c]) as PartCell])).values()]);
}
function spatial(p:Shape):Spatial{
 const h=p.h??PARTS[p.part]?.h;if(h===undefined)throw Error(`Unsupported part ${p.part}.`);
 const face=legacy(p.part)?p.face??"pz":faceFor(p),id=`${p.part}:${p.w}:${p.d}:${h}:${face}`;
 const existing=cache.get(id);if(existing)return existing;
 let cells:readonly PartCell[],top:readonly PartCell[],bottom:readonly PartCell[];
 if(isMinifig(p.part)){
  // A minifigure fills its footprint to the top of its head and clutches with the two anti-stud
  // holes under its feet. Its head stud sits on the figure's centreline, between grid studs, so
  // it is drawn but offers no grid connection.
  const occupied:PartCell[]=[],sockets:PartCell[]=[];
  for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++){sockets.push([x,0,z]);for(let y=0;y<h;y++)occupied.push([x,y,z]);}
  cells=unique(occupied);top=unique([]);bottom=unique(sockets);
 }else if(!legacy(p.part)){
  const definition=catalogPart(p.part);if(!definition)throw Error(`Part ${p.part} has no verified spatial definition.`);
  const turn=faces.indexOf(face),orient=(items:readonly (readonly number[])[])=>unique(items.map(c=>rotateCell(c as PartCell,definition.w,definition.d,turn)));
  // Missing connectors are never replaced by bounding-box assumptions.
  cells=orient(definition.occupancy);top=orient(definition.topStuds);bottom=orient(definition.bottomSockets);
 }else{
  const occupied:PartCell[]=[],studs:PartCell[]=[],sockets:PartCell[]=[];
  const slope=SLOPES[p.part],wheel=Object.hasOwn(WHEELS,p.part),tile=TILES.has(p.part);
  for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++){
   for(let y=0;y<h;y++)occupied.push([x,y,z]);
   sockets.push([x,0,z]);
   if(tile||wheel||slope&&!slope.studded)continue;
   if(slope&&!slope.inverted){const depth=face==="px"||face==="nx"?p.w:p.d,along=face==="px"||face==="nx"?x:z,flat=depth-slope.run;if(!(face==="pz"||face==="px"?along<flat:along>=slope.run))continue;}
   studs.push([x,h,z]);
  }
  cells=unique(occupied);top=unique(studs);bottom=unique(sockets);
 }
 const result={cells,top,bottom,cellKeys:new Set(cells.map(c=>key(...c))),solidBox:cells.length===p.w*p.d*h};cache.set(id,result);return result;
}

/** Cached local occupancy, with no per-piece array creation. */
export const pieceCellOffsets=(p:Shape):readonly PartCell[]=>spatial(p).cells;
export const topConnectorOffsets=(p:Shape):readonly PartCell[]=>spatial(p).top;
export const bottomConnectorOffsets=(p:Shape):readonly PartCell[]=>spatial(p).bottom;
export function forEachPieceCell(p:Located,visit:(x:number,y:number,z:number)=>void){for(const [x,y,z] of spatial(p).cells)visit(p.x+x,p.y+y,p.z+z);}
export function* pieceCells(p:Located):Generator<[number,number,number]>{for(const [x,y,z] of spatial(p).cells)yield [p.x+x,p.y+y,p.z+z];}

/** Broad phase first; holes and empty corners remain available in the narrow phase. */
export function piecesIntersect(a:Located,b:Located):boolean{
 const ah=a.h??PARTS[a.part].h,bh=b.h??PARTS[b.part].h;
 if(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+bh&&a.y+ah>b.y&&a.z<b.z+b.d&&a.z+a.d>b.z))return false;
 const left=spatial(a),right=spatial(b);if(left.solidBox&&right.solidBox)return true;
 const [first,second,firstData,secondData]=left.cells.length<=right.cells.length?[a,b,left,right]:[b,a,right,left];
 for(const [x,y,z] of firstData.cells)if(secondData.cellKeys.has(key(first.x+x-second.x,first.y+y-second.y,first.z+z-second.z)))return true;
 return false;
}
