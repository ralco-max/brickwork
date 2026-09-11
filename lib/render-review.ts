import * as THREE from "three";
import type {BuildModel} from "./models";
import type {Piece} from "./bridge";
import {COLORS,studCells} from "./bridge";
import {pieceGeometry,hubGeometry} from "./brick-geometry";

// Render the actual packed pieces, slopes included, for the visual critic: front, front-right,
// rear-left, and the left end, so a subject detailed on one face only is caught.
export function renderReviewViews(model:BuildModel):string[]{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(640,640);renderer.setPixelRatio(1);renderer.setClearColor(0xe9edf2,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),studGeometry=new THREE.CylinderGeometry(.3,.3,.18,8),material=new THREE.MeshStandardMaterial({roughness:.45}),temp=new THREE.Object3D(),color=new THREE.Color();
 scene.add(new THREE.HemisphereLight(0xffffff,0x6e829b,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-40,90,80);scene.add(light);
 const h=model.height*.4,groups=new Map<string,Piece[]>();for(const p of model.pieces){const k=`${p.part}:${p.rotated}:${p.face||""}`;const list=groups.get(k)||[];list.push(p);groups.set(k,list);}
 const geometries:THREE.BufferGeometry[]=[];
 for(const list of groups.values()){
  const first=list[0],studded=studCells(first),geometry=pieceGeometry(first);geometries.push(geometry);
  const body=new THREE.InstancedMesh(geometry,material,list.length),studs=studded.length?new THREE.InstancedMesh(studGeometry,material,list.length*studded.length):null;let index=0;
  const hubShape=hubGeometry(first),hubs=hubShape?new THREE.InstancedMesh(hubShape,new THREE.MeshStandardMaterial({color:0xa9b1b8,roughness:.5}),list.length):null;if(hubShape)geometries.push(hubShape);
  list.forEach((p,i)=>{temp.position.set(p.x+p.w/2-model.length/2,p.y*.4+p.h*.2-h/2,p.z+p.d/2-model.width/2);temp.rotation.set(0,0,0);temp.scale.setScalar(1);temp.updateMatrix();body.setMatrixAt(i,temp.matrix);color.set(COLORS[p.color].hex);body.setColorAt(i,color);if(hubs)hubs.setMatrixAt(i,temp.matrix);
   if(studs)for(const [x,z] of studded){temp.position.set(p.x+x+.5-model.length/2,(p.y+p.h)*.4+.07-h/2,p.z+z+.5-model.width/2);temp.updateMatrix();studs.setMatrixAt(index,temp.matrix);studs.setColorAt(index++,color);}
  });
  scene.add(body);if(studs)scene.add(studs);if(hubs)scene.add(hubs);
 }
 const radius=Math.hypot(model.length,model.width,h)/2+2,camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.1,radius*8),out:string[]=[];
 try{for(const direction of [[0,.08,1],[.9,.65,1],[-.8,.55,-1],[-1,.3,.25]]){camera.position.set(...direction as [number,number,number]).normalize().multiplyScalar(radius*3);camera.lookAt(0,0,0);renderer.render(scene,camera);out.push(renderer.domElement.toDataURL("image/jpeg",.82));}}finally{for(const g of geometries)g.dispose();studGeometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();}
 return out;
}
