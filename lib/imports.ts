import {STLLoader} from "three/addons/loaders/STLLoader.js";
import {OBJLoader} from "three/addons/loaders/OBJLoader.js";
import * as THREE from "three";
import {finishModel,packVoxels,voxelKey} from "./models";
import type {VoxelMap,BuildModel} from "./models";
import type {ColorKey} from "./bridge";

export async function meshToBricks(file:File,resolution:number,color:ColorKey,upAxis:"y"|"z",onProgress:(percent:number)=>void):Promise<BuildModel>{
 if(file.size>10*1024*1024)throw Error("Choose an STL or OBJ smaller than 10 MB.");
 let object:THREE.Object3D;
 const extension=file.name.split(".").pop()?.toLowerCase();
 if(extension==="stl"){const geometry=new STLLoader().parse(await file.arrayBuffer());object=new THREE.Mesh(geometry);}
 else if(extension==="obj")object=new OBJLoader().parse(await file.text());
 else throw Error("Choose a .stl or .obj file.");
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 try{
  let triangles=0;object.traverse(node=>{if(node instanceof THREE.Mesh){geometries.push(node.geometry);triangles+=(node.geometry.index?.count??node.geometry.attributes.position?.count??0)/3;const originals=Array.isArray(node.material)?node.material:[node.material];materials.push(...originals);node.material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});materials.push(node.material);}});
  if(!triangles)throw Error("The file has no triangle mesh to convert.");if(triangles>60000)throw Error("This mesh has more than 60,000 triangles. Export a simplified mesh and try again.");
  if(upAxis==="z")object.rotation.x=-Math.PI/2;object.updateMatrixWorld(true);
  let bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length())||Math.max(size.x,size.y,size.z)<.0001)throw Error("The model has invalid or empty dimensions.");
  object.scale.multiplyScalar(resolution/Math.max(size.x,size.y,size.z));object.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(object);object.position.sub(bounds.min);object.position.y+=.0001;object.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(object);size=bounds.getSize(new THREE.Vector3());
  const w=Math.max(1,Math.ceil(size.x)),d=Math.max(1,Math.ceil(size.z)),h=Math.max(1,Math.ceil(size.y/.4));
  if(w>64||d>64||h>160)throw Error("Choose a smaller conversion size.");
  const voxels:VoxelMap=new Map(),ray=new THREE.Raycaster(),direction=new THREE.Vector3(0,-1,0),margin=2;
  const bw=Math.ceil((w+margin*2)/8)*8,bd=Math.ceil((d+margin*2)/8)*8;
  for(let x=0;x<bw;x++)for(let z=0;z<bd;z++)for(let y=0;y<2;y++)voxels.set(voxelKey(x,y,z),"gray");
  let solidCells=0;
  for(let x=0;x<w;x++){
   for(let z=0;z<d;z++){
    ray.set(new THREE.Vector3(x+.5,size.y+1,z+.5),direction);
    const hits=ray.intersectObject(object,true).map(hit=>hit.point.y).sort((a,b)=>a-b).filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>.002);
    // Even/odd filling supports cavities in closed meshes. A lone surface becomes a plate.
    for(let y=0;y<h;y++){
     const center=(y+.5)*.4;let inside=false;
     for(let i=0;i+1<hits.length;i+=2)if(center>=hits[i]-.2&&center<=hits[i+1]+.2){inside=true;break;}
     if(!inside&&hits.some(hit=>Math.abs(center-hit)<.22))inside=true;
     if(inside){voxels.set(voxelKey(x+margin,y+2,z+margin),color);solidCells++;}
    }
   }
   onProgress(Math.round((x+1)/w*85));await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!solidCells)throw Error("No solid shape was found. Try a closed mesh or a different up axis.");
  const pieces=packVoxels(voxels);onProgress(100);
  return finishModel(pieces,{name:file.name.replace(/\.[^.]+$/,"").slice(0,80),description:`Brick conversion of your ${extension.toUpperCase()} · ${resolution} stud resolution`,source:"mesh"});
 }finally{geometries.forEach(g=>g.dispose());new Set(materials).forEach(m=>m.dispose());}
}

export async function imagePixels(file:File,maxWidth:number):Promise<{data:Uint8ClampedArray;width:number;height:number}>{
 if(file.size>10*1024*1024)throw Error("Choose an image smaller than 10 MB.");
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("Choose a PNG, JPG or WebP image.");
 const url=URL.createObjectURL(file),img=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error("This image could not be opened."));img.src=url;});
  const factor=maxWidth/Math.max(img.naturalWidth,img.naturalHeight),width=Math.max(1,Math.round(img.naturalWidth*factor)),height=Math.max(1,Math.round(img.naturalHeight*factor));
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const ctx=canvas.getContext("2d");if(!ctx)throw Error("Image processing is unavailable in this browser.");ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);return {data:ctx.getImageData(0,0,width,height).data,width,height};
 }finally{URL.revokeObjectURL(url);}
}
