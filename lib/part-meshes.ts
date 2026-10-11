import {BufferGeometry,Float32BufferAttribute} from "three";
import {catalogPart} from "./part-catalog";
import type {Piece} from "./bridge";

type PartMesh={version:1;part:string;positions:number[];normals:number[];indices:number[]};
const meshes=new Map<string,PartMesh>(),pending=new Map<string,Promise<void>>();

export const hasExactPartGeometry=(id:string)=>Boolean(catalogPart(id));
export const partGeometriesReady=(pieces:Pick<Piece,"part">[])=>pieces.every(p=>!hasExactPartGeometry(p.part)||meshes.has(p.part));

function validateMesh(value:unknown,id:string):PartMesh{
 const mesh=value as PartMesh;
 if(!mesh||mesh.version!==1||mesh.part!==id||!Array.isArray(mesh.positions)||!Array.isArray(mesh.normals)||!Array.isArray(mesh.indices)
  ||mesh.positions.length===0||mesh.positions.length>3000000||mesh.positions.length%3!==0||mesh.normals.length!==mesh.positions.length||mesh.indices.length===0||mesh.indices.length%3!==0
  ||mesh.positions.some(n=>!Number.isFinite(n))||mesh.normals.some(n=>!Number.isFinite(n))||mesh.indices.some(n=>!Number.isInteger(n)||n<0||n>=mesh.positions.length/3))throw Error(`The exact geometry for part ${id} is invalid. Please retry loading it.`);
 return mesh;
}

/** Only shapes actually used in the build are fetched; none enter the initial JS bundle. */
export async function preloadPartGeometries(pieces:Pick<Piece,"part">[],fetcher:typeof fetch=fetch){
 const ids=[...new Set(pieces.map(p=>p.part))].filter(id=>hasExactPartGeometry(id)&&!meshes.has(id));
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,ids.length)},async()=>{
  while(cursor<ids.length){const id=ids[cursor++];let request=pending.get(id);
   if(!request){request=(async()=>{const response=await fetcher(catalogPart(id)!.mesh);if(!response.ok)throw Error(`The exact geometry for part ${id} could not be loaded (${response.status}). Please retry.`);meshes.set(id,validateMesh(await response.json(),id));})().finally(()=>pending.delete(id));pending.set(id,request);}
   await request;
  }
 }));
}

/** Caller owns the returned geometry and can dispose it with the scene. */
export function exactPartGeometry(p:Pick<Piece,"part"|"face"|"rotated">):BufferGeometry{
 const mesh=meshes.get(p.part);if(!mesh)throw Error(`Load the exact geometry for part ${p.part} before rendering.`);
 const geometry=new BufferGeometry();geometry.setAttribute("position",new Float32BufferAttribute(mesh.positions,3));geometry.setAttribute("normal",new Float32BufferAttribute(mesh.normals,3));geometry.setIndex(mesh.indices);
 const face=p.face||(p.rotated?"px":"pz"),angle=face==="px"?Math.PI/2:face==="nz"?Math.PI:face==="nx"?-Math.PI/2:0;
 if(angle)geometry.rotateY(angle);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
