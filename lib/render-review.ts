import * as THREE from "three";
import type {BuildModel} from "./models";
import type {Piece} from "./bridge";
import {COLORS,studCells} from "./bridge";
import {pieceGeometry,hubGeometry} from "./brick-geometry";
import {fittedPartGeometry,hasExactPartGeometry,preloadPartGeometries} from "./part-meshes";
import {fittedColor} from "./part-catalog";
import {isMinifig} from "./minifig";
import {colorFinish} from "./colors";
import type {ColorKey} from "./colors";
import {brickMaterial,finishColor,finishEnvironment,releaseFinishEnvironment} from "./brick-materials";

// Render the actual packed pieces, slopes included, for the visual critic: front, front-right,
// rear-left, and the left end and overhead, so a subject detailed on one face only is caught.
// The overhead view is always last; reviewDesign labels the last view overhead.
export const REVIEW_DIRECTIONS:[number,number,number][]=[[0,.08,1],[.9,.65,1],[-.8,.55,-1],[-1,.3,.25],[0,1,0]];
export const TARGETED_VIEW_SIZE=512;
// A targeted re-check sends three views: the front, the side view facing the marked area (front-right when there is
// none) and the overhead.
export function targetedViews(model:Pick<BuildModel,"length"|"width">,region?:{bounds?:{min:{x:number;z:number};max:{x:number;z:number}}}):number[]{
 const b=region?.bounds,dx=b?(b.min.x+b.max.x)/2-model.length/2:0,dz=b?(b.min.z+b.max.z)/2-model.width/2:0;
 if(Math.hypot(dx,dz)<1)return [0,1,4];
 const side=[1,2,3].map(i=>{const [x,,z]=REVIEW_DIRECTIONS[i];return {i,dot:(x*dx+z*dz)/Math.hypot(x,z)};}).sort((a,b)=>b.dot-a.dot)[0].i;
 return [0,side,4];
}
const fittedFinish=(p:Piece)=>{const c=fittedColor(p);return c?colorFinish(c).kind:"";};
export async function renderReviewViews(model:BuildModel,options:{views?:number[];size?:number}={}):Promise<string[]>{
 const size=options.size||640,views=(options.views||REVIEW_DIRECTIONS.map((_,i)=>i)).filter(i=>REVIEW_DIRECTIONS[i]);
 await preloadPartGeometries(model.pieces);
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(size,size);renderer.setPixelRatio(1);renderer.setClearColor(0xe9edf2,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 // Instances share one material per finish (solid, trans, metallic), so the critic sees glass and metal too.
 const scene=new THREE.Scene(),studGeometry=new THREE.CylinderGeometry(.3,.3,.18,8),materials=new Map<string,THREE.MeshStandardMaterial>(),temp=new THREE.Object3D(),color=new THREE.Color(),glazing=new THREE.Color();
 const materialFor=(c:ColorKey,figure:boolean)=>{const k=`${colorFinish(c).kind}:${figure}`;let m=materials.get(k);if(!m){m=brickMaterial(c,{roughness:.45,vertexColors:figure,environment:()=>finishEnvironment(renderer)});materials.set(k,m);}return m;};
 scene.add(new THREE.HemisphereLight(0xffffff,0x6e829b,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-40,90,80);scene.add(light);
 const h=model.height*.4,groups=new Map<string,Piece[]>();for(const p of model.pieces){const k=isMinifig(p.part)?`${p.part}:${p.color}:${p.legs||""}:${p.skin||""}:${p.face||""}`:`${p.part}:${p.rotated}:${p.face||""}:${colorFinish(p.color).kind}:${fittedFinish(p)}`;const list=groups.get(k)||[];list.push(p);groups.set(k,list);}
 const geometries:THREE.BufferGeometry[]=[];
 for(const list of groups.values()){
  const first=list[0],studded=hasExactPartGeometry(first.part)?[]:studCells(first),geometry=pieceGeometry(first);geometries.push(geometry);
  const figure=isMinifig(first.part),material=materialFor(finishColor(first),figure),body=new THREE.InstancedMesh(geometry,material,list.length),studs=studded.length?new THREE.InstancedMesh(studGeometry,material,list.length*studded.length):null;let index=0;
  const hubShape=hubGeometry(first),hubs=hubShape?new THREE.InstancedMesh(hubShape,new THREE.MeshStandardMaterial({color:0xa9b1b8,roughness:.5}),list.length):null;if(hubShape)geometries.push(hubShape);
  // A frame's glass or door in its own finish, so the critic sees real glazing rather than an empty frame.
  const fittedShape=fittedPartGeometry(first),fitted=fittedShape?new THREE.InstancedMesh(fittedShape,materialFor(fittedColor(first)!,false),list.length):null;if(fittedShape)geometries.push(fittedShape);
  list.forEach((p,i)=>{temp.position.set(p.x+p.w/2-model.length/2,p.y*.4+p.h*.2-h/2,p.z+p.d/2-model.width/2);temp.rotation.set(0,0,0);temp.scale.setScalar(1);temp.updateMatrix();body.setMatrixAt(i,temp.matrix);color.set(figure?"#ffffff":COLORS[p.color].hex);body.setColorAt(i,color);if(hubs)hubs.setMatrixAt(i,temp.matrix);if(fitted){fitted.setMatrixAt(i,temp.matrix);fitted.setColorAt(i,glazing.set(COLORS[fittedColor(p)!].hex));}
   if(studs)for(const [x,z] of studded){temp.position.set(p.x+x+.5-model.length/2,(p.y+p.h)*.4+.07-h/2,p.z+z+.5-model.width/2);temp.updateMatrix();studs.setMatrixAt(index,temp.matrix);studs.setColorAt(index++,color);}
  });
  scene.add(body);if(studs)scene.add(studs);if(hubs)scene.add(hubs);if(fitted)scene.add(fitted);
 }
 const radius=Math.hypot(model.length,model.width,h)/2+2,camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.1,radius*8),out:string[]=[];
 try{for(const direction of views.map(i=>REVIEW_DIRECTIONS[i])){camera.up.set(0,direction[1]===1?0:1,direction[1]===1?-1:0);camera.position.set(...direction as [number,number,number]).normalize().multiplyScalar(radius*3);camera.lookAt(0,0,0);renderer.render(scene,camera);out.push(renderer.domElement.toDataURL("image/jpeg",.82));}}finally{for(const g of geometries)g.dispose();studGeometry.dispose();for(const m of materials.values())m.dispose();releaseFinishEnvironment(renderer);renderer.dispose();renderer.forceContextLoss();}
 return out;
}
