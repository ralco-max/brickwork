import {BufferGeometry,Color,Float32BufferAttribute,Matrix3,Matrix4} from "three";
import {catalogPart} from "./part-catalog";
import {COLORS} from "./colors";
import type {Piece} from "./bridge";
import {MINIFIG_MESHES,isMinifig,minifigColors,minifigPlacements} from "./minifig";

type PartMesh={version:1;part:string;positions:number[];normals:number[];indices:number[]};
const meshes=new Map<string,PartMesh>(),pending=new Map<string,Promise<void>>();

// A catalog part has one mesh; a minifigure is assembled from its LDraw elements' meshes.
const sources=(id:string):{key:string;part:string;url:string}[]=>isMinifig(id)?MINIFIG_MESHES.map(m=>({key:`minifig/${m.id}`,part:m.id,url:m.mesh})):catalogPart(id)?[{key:id,part:id,url:catalogPart(id)!.mesh}]:[];
export const hasExactPartGeometry=(id:string)=>isMinifig(id)||Boolean(catalogPart(id));
export const partGeometriesReady=(pieces:Pick<Piece,"part">[])=>pieces.every(p=>sources(p.part).every(s=>meshes.has(s.key)));

function validateMesh(value:unknown,id:string):PartMesh{
 const mesh=value as PartMesh;
 if(!mesh||mesh.version!==1||mesh.part!==id||!Array.isArray(mesh.positions)||!Array.isArray(mesh.normals)||!Array.isArray(mesh.indices)
  ||mesh.positions.length===0||mesh.positions.length>3000000||mesh.positions.length%3!==0||mesh.normals.length!==mesh.positions.length||mesh.indices.length===0||mesh.indices.length%3!==0
  ||mesh.positions.some(n=>!Number.isFinite(n))||mesh.normals.some(n=>!Number.isFinite(n))||mesh.indices.some(n=>!Number.isInteger(n)||n<0||n>=mesh.positions.length/3))throw Error(`The exact geometry for part ${id} is invalid. Please retry loading it.`);
 return mesh;
}

/** Only shapes actually used in the build are fetched; none enter the initial JS bundle. */
export async function preloadPartGeometries(pieces:Pick<Piece,"part">[],fetcher:typeof fetch=fetch){
 const wanted=[...new Map([...new Set(pieces.map(p=>p.part))].flatMap(sources).map(s=>[s.key,s])).values()].filter(s=>!meshes.has(s.key));
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,wanted.length)},async()=>{
  while(cursor<wanted.length){const source=wanted[cursor++];let request=pending.get(source.key);
   if(!request){request=(async()=>{const response=await fetcher(source.url);if(!response.ok)throw Error(`The exact geometry for part ${source.part} could not be loaded (${response.status}). Please retry.`);meshes.set(source.key,validateMesh(await response.json(),source.part));})().finally(()=>pending.delete(source.key));pending.set(source.key,request);}
   await request;
  }
 }));
}

// The assembled figure with a per-vertex color for each region, centred on its cell box like a part.
// Viewers tint it with a white instance color so dimming and highlights still apply.
function minifigGeometry(p:Pick<Piece,"part"|"face"|"rotated"|"h"|"color"|"legs"|"skin">):BufferGeometry{
 const colors=minifigColors(p),positions:number[]=[],normals:number[]=[],tints:number[]=[],indices:number[]=[],color=new Color(),v=[0,0,0];
 for(const {element,matrix:m,position:t} of minifigPlacements(p.face??(p.rotated?"px":"pz"))){
  const mesh=meshes.get(`minifig/${element.id}`);if(!mesh)throw Error(`Load the exact geometry for part ${p.part} before rendering.`);
  // Mesh vertices are (x,-y,z)/20 of the LDraw element; flip y around the LDraw transform.
  const transform=new Matrix4().set(m[0],-m[1],m[2],t[0]/20,-m[3],m[4],-m[5],-t[1]/20-p.h*.2,m[6],-m[7],m[8],t[2]/20,0,0,0,1),normal=new Matrix3().getNormalMatrix(transform),e=transform.elements,n=normal.elements,base=positions.length/3;
  color.set(COLORS[colors[element.region]].hex);
  for(let i=0;i<mesh.positions.length;i+=3){
   for(let r=0;r<3;r++)v[r]=e[r]*mesh.positions[i]+e[4+r]*mesh.positions[i+1]+e[8+r]*mesh.positions[i+2]+e[12+r];positions.push(...v);
   for(let r=0;r<3;r++)v[r]=n[r]*mesh.normals[i]+n[3+r]*mesh.normals[i+1]+n[6+r]*mesh.normals[i+2];const length=Math.hypot(...v)||1;normals.push(v[0]/length,v[1]/length,v[2]/length);
   tints.push(color.r,color.g,color.b);
  }
  for(const index of mesh.indices)indices.push(base+index);
 }
 const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(positions,3));geometry.setAttribute("normal",new Float32BufferAttribute(normals,3));geometry.setAttribute("color",new Float32BufferAttribute(tints,3));geometry.setIndex(indices);
 geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Caller owns the returned geometry and can dispose it with the scene. */
export function exactPartGeometry(p:Pick<Piece,"part"|"face"|"rotated">&Partial<Pick<Piece,"h"|"color"|"legs"|"skin">>):BufferGeometry{
 if(isMinifig(p.part))return minifigGeometry({...p,h:p.h??12,color:p.color??"red"});
 const mesh=meshes.get(p.part);if(!mesh)throw Error(`Load the exact geometry for part ${p.part} before rendering.`);
 const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(mesh.positions,3));geometry.setAttribute("normal",new Float32BufferAttribute(mesh.normals,3));geometry.setIndex(mesh.indices);
 const face=p.face||(p.rotated?"px":"pz"),angle=face==="px"?Math.PI/2:face==="nz"?Math.PI:face==="nx"?-Math.PI/2:0;
 if(angle)geometry.rotateY(angle);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
