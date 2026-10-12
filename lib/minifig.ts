import manifest from "./data/minifig.json";
import type {ColorKey} from "./colors";
import type {Face,Piece} from "./bridge";

// A classic LEGO minifigure: one fixed-size element assembled from real LDraw parts
// (scripts/compile-minifig.mjs). It stands on two studs (2 x 1 footprint at the legs)
// and is 12 plates (4 bricks) from sole to the top of the head, plus the head stud.
// Colors come in three regions: skin (head, hands), torso (torso, arms) and legs (hips, legs).
// Its native LDraw front is -z; face is the direction the figure looks.
export const MINIFIG="minifig";
export const isMinifig=(part:string)=>part===MINIFIG;
export const MINIFIG_SPEC={name:"Minifigure",w:manifest.footprint.w,d:manifest.footprint.d,h:manifest.footprint.h,price:2.5};
export type MinifigRegion="skin"|"torso"|"legs";
export type MinifigElement={id:string;name:string;region:MinifigRegion;position:number[];matrix:number[];mesh:string};
export const MINIFIG_ELEMENTS=manifest.parts as MinifigElement[];
export const MINIFIG_MESHES=[...new Map(MINIFIG_ELEMENTS.map(e=>[e.id,e.mesh])).entries()].map(([id,mesh])=>({id,mesh}));
export const minifigColors=(p:Pick<Piece,"color"|"legs"|"skin">):Record<MinifigRegion,ColorKey>=>({torso:p.color,legs:p.legs??p.color,skin:p.skin??"yellow"});
// Quarter turns about the vertical axis from the native -z front (row-major LDraw 3x3).
const TURNS:Record<Face,number[]>={nz:[1,0,0,0,1,0,0,0,1],pz:[-1,0,0,0,1,0,0,0,-1],px:[0,0,-1,0,1,0,1,0,0],nx:[0,0,1,0,1,0,-1,0,0]};
const [ax,feet,az]=manifest.anchor,centre=[ax+manifest.footprint.w*10,feet,az+manifest.footprint.d*10];
const mul=(a:number[],b:number[])=>[0,1,2].flatMap(r=>[0,1,2].map(c=>a[r*3]*b[c]+a[r*3+1]*b[3+c]+a[r*3+2]*b[6+c]));
const round=(n:number)=>Math.round(n*1e4)/1e4||0;
/** Each element relative to the footprint centre at sole level, in LDU with y down. */
export function minifigPlacements(face:Face="pz"){
 const turn=TURNS[face];
 return MINIFIG_ELEMENTS.map(element=>{const t=element.position.map((v,i)=>v-centre[i]);return {element,matrix:mul(turn,element.matrix).map(round),position:[0,1,2].map(r=>round(turn[r*3]*t[0]+turn[r*3+1]*t[1]+turn[r*3+2]*t[2])) as [number,number,number]};});
}
