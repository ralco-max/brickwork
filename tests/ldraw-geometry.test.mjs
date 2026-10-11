import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {loadLDrawPart,compileLDrawMesh,meshThumbnail} from "../scripts/ldraw-geometry.mjs";
import {Vector3} from "three";

const header=name=>`0 Synthetic compiler test fixture\n0 Name: ${name}\n0 Author: Brickwork tests\n0 !LDRAW_ORG ${name==="stud.dat"?"Primitive":"Part"}\n0 !LICENSE CC0 synthetic test fixture\n0 BFC CERTIFY CCW\n`;
async function fixture(files,run){const root=await mkdtemp(path.join(tmpdir(),"brickwork-ldraw-"));try{await mkdir(path.join(root,"parts"));await mkdir(path.join(root,"p"));for(const [name,body] of Object.entries(files))await writeFile(path.join(root,name),header(path.basename(name))+body);await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test("recursive LDraw transforms retain mirrored and BFC-inverted winding",()=>fixture({
 "parts/test.dat":"0 BFC INVERTNEXT\n1 16 20 8 10 -1 0 0 0 1 0 0 0 1 child.dat\n",
 "parts/child.dat":"3 16 0 0 0 10 0 0 0 -8 0\n",
},async root=>{
 const part=await loadLDrawPart(root,"test");assert.equal(part.triangles.length,1);
 assert.deepEqual(part.triangles[0].vertices,[[20,8,10],[10,8,10],[20,0,10]]);
 assert.equal(part.sources.length,2);assert.ok(part.sources.every(source=>source.sha256.length===64&&source.license));
 const mesh=await compileLDrawMesh(part,{w:1,d:1,h:1,bodyOrigin:[10,8,0]});
 assert.equal(mesh.indices.length,3);assert.ok(mesh.positions.every(Number.isFinite));assert.ok(mesh.normals.every(Number.isFinite));
 assert.ok(meshThumbnail(mesh).startsWith("<svg"));
}));

test("external studs remain in render geometry while body bounds and body triangles exclude them",()=>fixture({
 "parts/test.dat":"4 16 -10 0 -10 -10 8 -10 10 8 -10 10 0 -10\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 stud.dat\n",
 "p/stud.dat":"3 16 -6 0 0 6 0 0 0 -4 0\n",
},async root=>{
 const part=await loadLDrawPart(root,"test");assert.deepEqual(part.bodyBounds,{min:[-10,0,-10],max:[10,8,-10]});assert.equal(part.fullBounds.min[1],-4);
 assert.deepEqual(part.studs,[{primitive:"stud.dat",position:[0,0,0],normal:[0,-1,0]}]);assert.equal(part.triangles.filter(triangle=>!triangle.stud).length,2);
 const mesh=await compileLDrawMesh(part,{w:1,d:1,h:1,bodyOrigin:[-10,8,-10]});assert.equal(mesh.indices.length,9);assert.ok(Math.max(...mesh.positions.filter((_,i)=>i%3===1))>.2,"the real stud extends above the body");
}));

test("incomplete dependencies fail compilation instead of substituting a box",()=>fixture({"parts/test.dat":"1 16 0 0 0 1 0 0 0 1 0 0 0 1 absent.dat\n"},async root=>{
 await assert.rejects(loadLDrawPart(root,"test"),/Missing LDraw source absent.dat/);
}));

test("mirrored child Parts retain outward winding after their object transform is baked",()=>fixture({
 "parts/test.dat":"1 16 0 0 0 -1 0 0 0 1 0 0 0 1 child.dat\n",
 "parts/child.dat":"3 16 0 0 0 10 0 0 0 -8 0\n",
},async root=>{
 const part=await loadLDrawPart(root,"test"),mesh=await compileLDrawMesh(part,{w:1,d:1,h:1,bodyOrigin:[-10,0,0]});
 const [a,b,c]=mesh.indices.map(i=>new Vector3(...mesh.positions.slice(i*3,i*3+3))),geometricNormal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),renderNormal=new Vector3(...mesh.normals.slice(mesh.indices[0]*3,mesh.indices[0]*3+3));
 assert.ok(geometricNormal.dot(renderNormal)>.999,"front faces agree with the renderer normals");
}));
