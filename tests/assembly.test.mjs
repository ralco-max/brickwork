import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/assembly";export {generateRecipe} from "./lib/models";export {PerspectiveCamera,Vector3,Frustum,Matrix4,Sphere} from "three";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {assemblyTracks,assemblyPose,inspectionTracks,inspectionReach,generateRecipe,PerspectiveCamera,Vector3,Frustum,Matrix4,Sphere}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const model=generateRecipe('bridge','small');
test('every catalog piece reaches its exact original transform before the final hold',()=>{const source=JSON.stringify(model.pieces),tracks=assemblyTracks(model.pieces,model.length,model.width,model.height);assert.equal(tracks.size,model.pieces.length);for(const p of model.pieces){assert.deepEqual(assemblyPose(tracks.get(p.id),1),{x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true});assert.equal(assemblyPose(tracks.get(p.id),.901).settled,true);}assert.equal(JSON.stringify(model.pieces),source);});
test('layer waves start bottom-up and replay/seek is deterministic',()=>{const a=assemblyTracks(model.pieces,model.length,model.width,model.height),b=assemblyTracks(model.pieces,model.length,model.width,model.height);const sorted=[...model.pieces].sort((p,q)=>p.y-q.y||p.stage-q.stage||p.z-q.z||p.x-q.x||p.id-q.id);const layers=[...new Set(sorted.map(p=>p.y))];const means=layers.map(y=>{const items=sorted.filter(p=>p.y===y);return items.reduce((sum,p)=>sum+a.get(p.id).start,0)/items.length;});for(let i=1;i<means.length;i++)assert.ok(means[i]>=means[i-1]-.07);for(const piece of sorted){assert.deepEqual(assemblyPose(a.get(piece.id),.42),assemblyPose(b.get(piece.id),.42));for(const time of [0,.1,.3,.6,.9,1]){const pose=assemblyPose(a.get(piece.id),time);for(const [key,value] of Object.entries(pose))if(key!=='settled')assert.ok(Number.isFinite(value));assert.ok(pose.scale>=0&&pose.scale<=1);assert.ok(pose.y>=0);}}});
test('empty and single-piece models have finite, reversible timelines',()=>{assert.equal(assemblyTracks([],0,0,0).size,0);const piece=model.pieces[0],track=assemblyTracks([piece],1,1,1).get(piece.id);const waiting=assemblyPose(track,0);assert.equal(waiting.scale,1);assert.equal(waiting.settled,false);assert.ok(Math.hypot(waiting.x,waiting.z)>0,"a brick waits at the far end of its path from the first frame");assert.equal(assemblyPose(track,1).settled,true);const middle=assemblyPose(track,track.start+.1);assert.ok(middle.scale>0);assert.ok(middle.y>0);assert.deepEqual(assemblyPose(track,track.start+.1),middle);});

test('broad full-size flights decelerate smoothly and leave a final hold',()=>{for(const piece of model.pieces){const track=assemblyTracks([piece],model.length,model.width,model.height).get(piece.id);assert.ok(track.start+track.duration<.9);const first=assemblyPose(track,0);assert.ok(Math.abs(first.ry)<=.19);assert.equal(first.scale,1);assert.ok(Math.hypot(first.x,first.z)>Math.max(model.length,model.width));let previous=Infinity;for(let i=0;i<=100;i++){const pose=assemblyPose(track,track.start+i*track.duration/100);assert.ok(pose.y>=0);const distance=Math.hypot(pose.x,pose.z);assert.ok(distance<=previous+1e-6);previous=distance;}}});

test('every waiting brick is completely outside the camera at portrait and landscape sizes',()=>{
 for(const aspect of [.42,.8,1.5,2.4])for(const view of [[.8,.72,1],[0,.1,1],[0,1,.001]]){
  const camera=new PerspectiveCamera(35,aspect,.1,3000),target=new Vector3(0,model.height*.4*.45,0),distance=Math.hypot(model.length,model.width,model.height*.4)*2/Math.min(1,aspect)+40;
  camera.position.copy(target).add(new Vector3(...view).normalize().multiplyScalar(distance));camera.lookAt(target);camera.updateMatrixWorld();
  const halfHeight=distance*Math.tan(35*Math.PI/360),frame={center:target,right:new Vector3().setFromMatrixColumn(camera.matrixWorld,0),up:new Vector3().setFromMatrixColumn(camera.matrixWorld,1),halfWidth:halfHeight*aspect,halfHeight};
  const tracks=assemblyTracks(model.pieces,model.length,model.width,model.height,frame);
  for(const sweep of [false,true]){
   if(sweep){camera.position.sub(target).applyAxisAngle(new Vector3(0,1,0),-.16).multiplyScalar(1.12).add(target);camera.lookAt(target);camera.updateMatrixWorld();}
   const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   for(const p of model.pieces){const pose=assemblyPose(tracks.get(p.id),0),center=new Vector3(p.x+p.w/2-model.length/2+pose.x,p.y*.4+p.h*.2+pose.y,p.z+p.d/2-model.width/2+pose.z),radius=Math.hypot(p.w,p.h*.4,p.d)/2+.3;
    assert.equal(frustum.intersectsSphere(new Sphere(center,radius)),false,`part ${p.id} waits outside ${aspect} aspect${sweep?' during sweep':''}`);
   }
  }
 }
});

test('exploded inspection retains a bounded spread independently of cinematic starts',()=>{
 const reach=inspectionReach(model.length,model.width,model.height),tracks=inspectionTracks(model.pieces,model.length,model.width,model.height);
 assert.ok(reach.distance<=14);assert.ok(reach.lift<=12);
 for(const p of model.pieces){const origin=assemblyPose(tracks.get(p.id),0);assert.ok(Math.hypot(origin.x,origin.z)<=14);assert.ok(origin.y<=12);assert.deepEqual(assemblyPose(tracks.get(p.id),1),{x:0,y:0,z:0,rx:0,ry:0,rz:0,scale:1,settled:true});}
});
