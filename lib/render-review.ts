import * as THREE from "three";
import type {BuildModel} from "./models";
import {COLORS} from "./bridge";

// Render the actual packed bricks for the visual critic, including all protected edits.
export function renderReviewViews(model:BuildModel):string[]{
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(640,640);renderer.setPixelRatio(1);renderer.setClearColor(0xe9edf2,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(1,1,1),studGeometry=new THREE.CylinderGeometry(.3,.3,.18,8),material=new THREE.MeshStandardMaterial({roughness:.45});
 const body=new THREE.InstancedMesh(geometry,material,model.pieces.length),studCount=model.pieces.reduce((n,p)=>n+(p.part.startsWith("306")?0:p.w*p.d),0),studs=new THREE.InstancedMesh(studGeometry,material,studCount),temp=new THREE.Object3D(),color=new THREE.Color();
 scene.add(body,studs,new THREE.HemisphereLight(0xffffff,0x6e829b,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-40,90,80);scene.add(light);
 let index=0;const h=model.height*.4;
 model.pieces.forEach((p,i)=>{temp.position.set(p.x+p.w/2-model.length/2,p.y*.4+p.h*.2-h/2,p.z+p.d/2-model.width/2);temp.scale.set(p.w-.035,p.h*.4-.018,p.d-.035);temp.updateMatrix();body.setMatrixAt(i,temp.matrix);color.set(COLORS[p.color].hex);body.setColorAt(i,color);
  if(!p.part.startsWith("306"))for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++){temp.position.set(p.x+x+.5-model.length/2,(p.y+p.h)*.4+.07-h/2,p.z+z+.5-model.width/2);temp.scale.setScalar(1);temp.updateMatrix();studs.setMatrixAt(index,temp.matrix);studs.setColorAt(index++,color);}
 });
 const radius=Math.hypot(model.length,model.width,h)/2+2,camera=new THREE.OrthographicCamera(-radius,radius,radius,-radius,.1,radius*8),out:string[]=[];
 try{for(const direction of [[0,.08,1],[.9,.65,1],[-.8,.55,-1]]){camera.position.set(...direction as [number,number,number]).normalize().multiplyScalar(radius*3);camera.lookAt(0,0,0);renderer.render(scene,camera);out.push(renderer.domElement.toDataURL("image/jpeg",.82));}}finally{geometry.dispose();studGeometry.dispose();material.dispose();renderer.dispose();renderer.forceContextLoss();}
 return out;
}
