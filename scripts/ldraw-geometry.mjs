// Offline conversion of the unmodified LDraw library. LDraw sources retain their
// individual CC BY notices in the generated provenance manifest. Three.js's MIT
// LDrawLoader handles BFC orientation and hard/conditional-edge normal smoothing.
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import {deflateSync} from "node:zlib";
import {LoadingManager,Matrix4,Vector3} from "three";
import {LDrawLoader} from "three/addons/loaders/LDrawLoader.js";
import {LDrawConditionalLineMaterial} from "three/addons/materials/LDrawConditionalLineMaterial.js";

const textCache=new Map();
const OUTER_STUD=/^(?:stud|studa|stud2|stud2a|stud2s|stud2s2|stud6|stud6a|stud9|stud10|stud13|stud15|stud17|stud17a|stud26|studel|studh|studhr|studhl)\.dat$/i;
const rounded=n=>Math.round(n*1e6)/1e6||0;
const coordinates=values=>[Number(values[0]),Number(values[1]),Number(values[2])];
const bounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
function include(box,p){for(let i=0;i<3;i++){box.min[i]=Math.min(box.min[i],p[i]);box.max[i]=Math.max(box.max[i],p[i]);}}

export async function sourceFile(sourceDir,name){
 const file=name.replaceAll("\\","/").toLowerCase();
 if(file.startsWith("/")||file.split("/").includes(".."))throw Error(`Unsafe LDraw reference: ${name}`);
 const key=path.resolve(sourceDir)+":"+file;
 if(textCache.has(key))return textCache.get(key);
 for(const relative of [file,`parts/${file}`,`p/${file}`]){
  try{const content=await readFile(path.join(sourceDir,relative),"utf8"),result={path:relative,text:content};textCache.set(key,result);return result;}catch(error){if(error.code!=="ENOENT")throw error;}
 }
 throw Error(`Missing LDraw source ${name}`);
}

/** Raw LDU geometry + metadata. Body bounds exclude external male-stud subtrees. */
export async function loadLDrawPart(sourceDir,id){
 const triangles=[],hardEdges=[],studs=[],sources=new Map(),dependencies=new Map(),bodyBounds=bounds(),fullBounds=bounds();
 async function visit(name,matrix=new Matrix4(),inverted=false,inStud=false,inheritedColor="16",ancestors=[]){
  const source=await sourceFile(sourceDir,name);
  if(ancestors.includes(source.path))throw Error(`Recursive LDraw reference: ${[...ancestors,source.path].join(" -> ")}`);
  if(ancestors.length>40)throw Error(`LDraw reference depth exceeded for ${id}`);
  dependencies.set(name.replaceAll("\\","/").toLowerCase(),source.text);
  if(!sources.has(source.path)){
   const author=source.text.match(/^0 Author:\s*(.+)$/m)?.[1]?.trim()||"Unknown author";
   const license=source.text.match(/^0 !LICENSE\s*(.+)$/m)?.[1]?.trim();
   if(!license)throw Error(`Missing source license: ${source.path}`);
   if(/^0 !TEXMAP/m.test(source.text))throw Error(`Texture-mapped LDraw source needs explicit texture support: ${source.path}`);
   sources.set(source.path,{path:source.path,author,license,sha256:createHash("sha256").update(source.text).digest("hex")});
  }
  const primitive=path.posix.basename(source.path),isStud=!inStud&&OUTER_STUD.test(primitive);
  if(isStud){const position=new Vector3().applyMatrix4(matrix),normal=new Vector3(0,-1,0).transformDirection(matrix);studs.push({primitive,position:position.toArray().map(rounded),normal:normal.toArray().map(rounded)});}
  const insideStud=inStud||isStud,mirror=matrix.determinant()<0;let clockwise=false,invertNext=false;
  const point=values=>new Vector3(...coordinates(values)).applyMatrix4(matrix).toArray();
  for(const raw of source.text.split(/\r?\n/)){
   const line=raw.trim();if(!line)continue;const tokens=line.split(/\s+/),type=Number(tokens[0]);
   if(type===0){if(tokens[1]==="BFC"){
    if(tokens.includes("CW"))clockwise=true;else if(tokens.includes("CCW"))clockwise=false;
    invertNext=tokens.includes("INVERTNEXT");
   }continue;}
   const color=tokens[1]==="16"?inheritedColor:tokens[1];
   if(type===1){
    const v=tokens.slice(2,14).map(Number);if(v.length!==12||v.some(n=>!Number.isFinite(n)))throw Error(`Invalid LDraw transform in ${source.path}`);
    const local=new Matrix4().set(v[3],v[4],v[5],v[0],v[6],v[7],v[8],v[1],v[9],v[10],v[11],v[2],0,0,0,1);
    await visit(tokens.slice(14).join(" "),matrix.clone().multiply(local),inverted!==invertNext,insideStud,color,[...ancestors,source.path]);
   }else if(type===3||type===4){
    const points=Array.from({length:type},(_,i)=>point(tokens.slice(2+i*3,5+i*3)));
    if(points.flat().some(n=>!Number.isFinite(n)))throw Error(`Invalid LDraw polygon in ${source.path}`);
    for(const p of points){include(fullBounds,p);if(!insideStud)include(bodyBounds,p);}
    if(clockwise!==inverted!==mirror)points.reverse();
    triangles.push({vertices:points.slice(0,3),color,stud:insideStud});
    if(type===4)triangles.push({vertices:[points[0],points[2],points[3]],color,stud:insideStud});
   }else if(type===2){hardEdges.push([point(tokens.slice(2,5)),point(tokens.slice(5,8))]);}
   invertNext=false;
  }
 }
 await visit(`${id}.dat`);
 if(!triangles.length||bodyBounds.min.some(n=>!Number.isFinite(n)))throw Error(`Empty LDraw body: ${id}`);
 const rootSource=await sourceFile(sourceDir,`${id}.dat`);
 return {id,description:rootSource.text.split(/\r?\n/)[0].replace(/^0\s*/,""),triangles,hardEdges,bodyBounds,fullBounds,studs,sources:[...sources.values()],dependencies};
}

/** bodyOrigin is the raw LDU point corresponding to the app's minimum x/y/z anchor. */
export async function compileLDrawMesh(part,{w,d,h,bodyOrigin}){
 const manager=new LoadingManager();manager.setURLModifier(url=>{throw Error(`Unembedded LDraw dependency: ${url}`);});
 const loader=new LDrawLoader(manager).setConditionalLineMaterial(LDrawConditionalLineMaterial).addDefaultMaterials();
 // MPD embedding keeps compilation deterministic and avoids all network fetches.
 const main=`${part.id}.dat`,ordered=[main,...[...part.dependencies.keys()].filter(name=>name!==main)];
 const embeddedName=name=>name.startsWith("s/")?`parts/${name}`:name.startsWith("48/")?`p/${name}`:name;
 const mpd=ordered.map(name=>`0 FILE ${embeddedName(name)}\n${part.dependencies.get(name)}\n`).join("");
 const model=await new Promise((resolve,reject)=>loader.parse(mpd,resolve,reject));
 model.updateMatrixWorld(true);
 const positions=[],normals=[],indices=[],groups=[],vertexMap=new Map();
 const rawToLocal=new Matrix4().set(1/20,0,0,-bodyOrigin[0]/20-w/2,0,-1/20,0,bodyOrigin[1]/20-h*.2,0,0,1/20,-bodyOrigin[2]/20-d/2,0,0,0,1);
 model.traverse(object=>{
  if(!object.isMesh)return;
  const transform=rawToLocal.clone().multiply(object.matrixWorld),reverseWinding=transform.determinant()<0;
  const geometry=object.geometry.clone().applyMatrix4(transform);
  const position=geometry.getAttribute("position"),normal=geometry.getAttribute("normal"),index=geometry.index;
  const materialList=Array.isArray(object.material)?object.material:[object.material];
  const sourceGroups=geometry.groups.length?geometry.groups:[{start:0,count:index?.count??position.count,materialIndex:0}];
  for(const group of sourceGroups){
   const material=materialList[group.materialIndex||0],color=String(material?.userData?.code??"16");
   if(color!=="16")throw Error(`Part ${part.id} has fixed color ${color}; needs a multicolor asset before catalog inclusion.`);
   const start=indices.length;
   for(let offset=group.start,end=Math.min(group.start+group.count,index?.count??position.count);offset<end;offset+=3){
    // A retained mirrored child Part can cancel the source-to-world Y inversion.
    for(const corner of reverseWinding?[0,2,1]:[0,1,2]){const i=index?index.getX(offset+corner):offset+corner,values=[position.getX(i),position.getY(i),position.getZ(i),normal.getX(i),normal.getY(i),normal.getZ(i)].map(rounded),key=values.join(",");
     let destination=vertexMap.get(key);if(destination===undefined){destination=positions.length/3;vertexMap.set(key,destination);positions.push(...values.slice(0,3));normals.push(...values.slice(3));}indices.push(destination);
    }
   }
   groups.push({start,count:indices.length-start,color});
  }
  geometry.dispose();
 });
 model.traverse(object=>{object.geometry?.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material?.dispose();});
 return {version:1,part:part.id,positions,normals,indices,groups};
}

/** PNG encoding keeps the offline thumbnail renderer dependency-free. */
function pngImage(width,height,pixels){
 const crc=buffer=>{let value=0xffffffff;for(const byte of buffer){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const bytes=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(bytes));return Buffer.concat([head,bytes,tail]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(pixels.buffer,pixels.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(rows)),chunk("IEND",Buffer.alloc(0))]);
}

/** Isometric thumbnail rasterized from actual mesh triangles with a depth buffer. */
export function meshThumbnail(mesh){
 const right=new Vector3(.8,0,-.6),up=new Vector3(-.3,.8660254,-.4),toward=right.clone().cross(up).normalize(),light=new Vector3(-.4,.8,.6).normalize(),faces=[];
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),points=ids.map(index=>new Vector3(...mesh.positions.slice(index*3,index*3+3))),normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();if(normal.dot(toward)<=0)continue;
  const projected=points.map(p=>[p.dot(right),-p.dot(up),p.dot(toward)]);for(const [x,y] of projected){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  faces.push({points:projected,normals:ids.map(index=>mesh.normals.slice(index*3,index*3+3))});
 }
 const size=400,scale=352/Math.max(maxX-minX,maxY-minY,.001),xOffset=(size-(maxX-minX)*scale)/2-minX*scale,yOffset=(size-(maxY-minY)*scale)/2-minY*scale,pixels=new Uint8Array(size*size*4),depth=new Float64Array(size*size);depth.fill(-Infinity);
 const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
 for(const face of faces){const p=face.points.map(([x,y,z])=>[x*scale+xOffset,y*scale+yOffset,z]),area=edge(p[0],p[1],p[2][0],p[2][1]);if(Math.abs(area)<1e-8)continue;
  const left=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),rightEdge=Math.min(size-1,Math.ceil(Math.max(...p.map(v=>v[0])))),top=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),bottom=Math.min(size-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=rightEdge;x++){
   const a=edge(p[1],p[2],x+.5,y+.5)/area,b=edge(p[2],p[0],x+.5,y+.5)/area,c=1-a-b;if(a< -1e-8||b< -1e-8||c< -1e-8)continue;
   const z=a*p[0][2]+b*p[1][2]+c*p[2][2],index=y*size+x;if(z<depth[index]-1e-8)continue;depth[index]=z;
   const n=[0,1,2].map(axis=>a*face.normals[0][axis]+b*face.normals[1][axis]+c*face.normals[2][axis]),length=Math.hypot(...n)||1,shade=.58+.38*Math.max(0,(n[0]*light.x+n[1]*light.y+n[2]*light.z)/length),offset=index*4;
   pixels[offset]=Math.round(214*shade);pixels[offset+1]=Math.round(221*shade);pixels[offset+2]=Math.round(226*shade);pixels[offset+3]=255;
  }
 }
 const image=pngImage(size,size,pixels).toString("base64");
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="LDraw part ${mesh.part}"><image width="200" height="200" href="data:image/png;base64,${image}"/></svg>\n`;
}
