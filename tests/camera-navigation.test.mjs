import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const bundle=await build({stdin:{contents:'export {cameraPanOffset,advanceCameraMove} from "./lib/camera-navigation"; export {default as Viewport} from "./app/viewport"; export {PerspectiveCamera,Vector3} from "three"; export {createElement} from "react"; export {renderToStaticMarkup} from "react-dom/server";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic'});
const compiled={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {cameraPanOffset,advanceCameraMove,Viewport,PerspectiveCamera,Vector3,createElement,renderToStaticMarkup}=compiled.exports;

test('pan follows the screen axes at front, perspective and top without changing the viewing angle or distance',()=>{
 for(const position of [[0,5,100],[75,65,100],[0,100,.01]]){
  const camera=new PerspectiveCamera(35,1.4,.1,1500),target=new Vector3(0,5,0);
  camera.position.set(...position);camera.lookAt(target);camera.updateMatrixWorld();
  const originalPosition=camera.position.clone(),originalTarget=target.clone(),offset=cameraPanOffset(camera,target,0,1);
  assert.deepEqual(camera.position.toArray(),originalPosition.toArray(),'calculating movement does not mutate the camera');
  camera.position.add(offset);target.add(offset);camera.lookAt(target);camera.updateMatrixWorld();
  const projection=originalTarget.clone().project(camera);
  assert.ok(Math.abs(projection.x)<1e-9,'vertical movement stays on the screen vertical');
  assert.ok(Math.abs(projection.y+.24)<1e-9,'each press moves by 12% of the visible height');
  assert.ok(Math.abs(camera.position.distanceTo(target)-originalPosition.distanceTo(originalTarget))<1e-9,'zoom is preserved');
  assert.ok(camera.position.clone().sub(target).distanceTo(originalPosition.sub(originalTarget))<1e-9,'viewing direction is preserved');
  const reverse=cameraPanOffset(camera,target,0,-1);camera.position.add(reverse);target.add(reverse);
  assert.ok(target.distanceTo(originalTarget)<1e-9,'down reverses up');
 }
});

test('horizontal pan remains useful at different zoom levels and can be reversed exactly',()=>{
 for(const distance of [18,100,600]){
  const camera=new PerspectiveCamera(35,.6,.1,1500),target=new Vector3();camera.position.set(0,0,distance);camera.lookAt(target);
  const right=cameraPanOffset(camera,target,1,0),left=cameraPanOffset(camera,target,-1,0);
  assert.ok(right.x>0);assert.equal(right.y,0);assert.equal(right.z,0);assert.ok(right.clone().add(left).length()<1e-9);
  assert.ok(Math.abs(right.length()/distance-2*Math.tan(35*Math.PI/360)*.12)<1e-9);
 }
});

test('live review exposes pan, fit and touch activation while decorative presentation stays uncluttered',()=>{
 const props={pieces:[],length:24,width:16,height:20,explode:0,stage:100000,selected:null,view:'perspective',reset:0,rotate:false,onPick:()=>{}};
 const review=renderToStaticMarkup(createElement(Viewport,{...props,arrivals:{epoch:1,paused:false}}));
 for(const label of ['Move view up','Move view down','Move view left','Move view right','Fit the whole model in view'])assert.ok(review.includes(`aria-label="${label}"`));
 assert.ok(review.includes('touch-model-toggle'),'mobile review must offer a way to enable touch orbit and pan');
 const presentation=renderToStaticMarkup(createElement(Viewport,{...props,presentation:true}));
 assert.ok(!presentation.includes('camera-navigation'));assert.ok(!presentation.includes('touch-model-toggle'));
});

// A completed Fit must reach the intended center exactly, including after a pan.
test('camera fit reaches the exact target and reduced motion completes immediately',()=>{
 const camera=new PerspectiveCamera(35,1,.1,1500),target=new Vector3(10,20,5);camera.position.set(80,70,120);
 const move={position:camera.position.clone(),target:target.clone(),toPosition:new Vector3(50,50,75),toTarget:new Vector3(0,15,0),start:100,duration:520};
 assert.equal(advanceCameraMove(camera,target,move,100,false),false);assert.deepEqual(target.toArray(),[10,20,5]);
 assert.equal(advanceCameraMove(camera,target,move,360,false),false);
 assert.equal(advanceCameraMove(camera,target,move,620,false),true);assert.deepEqual(target.toArray(),move.toTarget.toArray());assert.deepEqual(camera.position.toArray(),move.toPosition.toArray());
 // Switching the preference while moving also settles the camera in that frame.
 assert.equal(advanceCameraMove(camera,target,move,200,true),true);assert.deepEqual(target.toArray(),move.toTarget.toArray());assert.deepEqual(camera.position.toArray(),move.toPosition.toArray());
});
