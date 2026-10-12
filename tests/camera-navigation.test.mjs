import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const bundle=await build({stdin:{contents:'export {cameraPanOffset,advanceCameraMove,settledPieceBounds,cameraFramingSnapshot,cameraAutoFit} from "./lib/camera-navigation"; export {default as Viewport} from "./app/viewport"; export {PerspectiveCamera,Vector3} from "three"; export {createElement} from "react"; export {renderToStaticMarkup} from "react-dom/server";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic'});
const compiled={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
const {cameraPanOffset,advanceCameraMove,settledPieceBounds,cameraFramingSnapshot,cameraAutoFit,Viewport,PerspectiveCamera,Vector3,createElement,renderToStaticMarkup}=compiled.exports;

const dimensions=(x=0,y=0,z=0,w=8,h=3,d=8)=>({x,y,z,w,h,d});
function assertCornersFit(camera,bounds,margin=.82){
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
  const point=new Vector3(x,y,z),projected=point.clone().project(camera),inView=point.applyMatrix4(camera.matrixWorldInverse);
  assert.ok(Math.abs(projected.x)<=margin+1e-9,`horizontal corner ${projected.x} exceeds ${margin}`);
  assert.ok(Math.abs(projected.y)<=margin+1e-9,`vertical corner ${projected.y} exceeds ${margin}`);
  assert.ok(inView.z<-camera.near,'all corners remain in front of the near plane');
 }
}

test('settled bounds use actual pieces, plate heights, scene centering and stud clearance',()=>{
 assert.equal(settledPieceBounds([],96,40),null);
 const bounds=settledPieceBounds([dimensions(12,0,4,4,3,2),dimensions(-2,15,-3,2,6,3)],40,20);
 assert.deepEqual(bounds.min.toArray(),[-22,0,-13]);
 assert.equal(bounds.max.x,-4);assert.ok(Math.abs(bounds.max.y-8.7)<1e-9);assert.equal(bounds.max.z,-4);
 const snapshot=cameraFramingSnapshot(bounds,1.5);bounds.min.x=-999;
 assert.equal(snapshot.bounds.min.x,-22,'a stored scene framing does not alias mutable bounds');
});

test('wide, tall and deep growth fit every corner while preserving the viewing angle',()=>{
 const initial=settledPieceBounds([dimensions()],8,8);
 const growth=[dimensions(0,0,0,100,3,8),dimensions(0,0,0,8,350,8),dimensions(0,0,0,8,3,100)];
 for(const direction of [[0,.1,1],[.8,.72,1],[0,1,.001]])for(const aspect of [.4,1,2.2])for(const expanded of growth){
  const camera=new PerspectiveCamera(35,aspect,.1,1500),target=new Vector3(0,.75,0);
  camera.position.copy(target).add(new Vector3(...direction).normalize().multiplyScalar(65));camera.lookAt(target);
  const beforePosition=camera.position.clone(),beforeTarget=target.clone(),beforeMatrix=camera.matrixWorld.clone(),bounds=settledPieceBounds([expanded],8,8);
  const fit=cameraAutoFit(camera,target,bounds,cameraFramingSnapshot(initial,aspect));
  assert.ok(fit,'substantial growth beyond a viewport edge needs a fit');
  assert.deepEqual(camera.position.toArray(),beforePosition.toArray());assert.deepEqual(target.toArray(),beforeTarget.toArray());assert.deepEqual(camera.matrixWorld.elements,beforeMatrix.elements,'query leaves the camera matrices unchanged');
  const previousDirection=beforePosition.sub(target).normalize(),nextDirection=fit.position.clone().sub(fit.target).normalize();
  assert.ok(previousDirection.distanceTo(nextDirection)<1e-9,'automatic fitting keeps the chosen perspective/front/top angle');
  assert.ok(fit.position.distanceTo(fit.target)>=65-1e-9,'growth never automatically zooms closer');
  camera.position.copy(fit.position);camera.lookAt(fit.target);assertCornersFit(camera,bounds);
 }
});

test('growth that still fits and same-bounds manual navigation preserve the exact camera',()=>{
 const camera=new PerspectiveCamera(35,1.5,.1,1500),target=new Vector3(0,3,0);camera.position.set(60,55,90);camera.lookAt(target);
 const initial=settledPieceBounds([dimensions()],8,8),grown=settledPieceBounds([dimensions(0,0,0,10,6,9)],8,8),previous=cameraFramingSnapshot(initial,camera.aspect);
 assert.equal(cameraAutoFit(camera,target,grown,previous),null,'do not move a frame just because its bounds grew');
 const saved=cameraFramingSnapshot(grown,camera.aspect);
 // A scene rebuild has fresh piece/bounds objects; manual movement still wins.
 camera.position.set(100,3,5);target.set(100,3,0);camera.lookAt(target);
 const rebuilt=settledPieceBounds([dimensions(0,0,0,10,6,9)],8,8);
 assert.equal(cameraAutoFit(camera,target,rebuilt,saved),null,'do not undo manual pan/zoom on unchanged model bounds');
 assert.equal(cameraAutoFit(camera,target,null,saved),null,'an empty build has nothing to frame');
});

test('narrow resize reframes at the existing angle and effective zoom; wider resize preserves a fitting view',()=>{
 const bounds=settledPieceBounds([dimensions(0,0,0,24,20,12)],24,12),target=new Vector3(0,4,0),camera=new PerspectiveCamera(35,2,.1,1500);
 camera.zoom=1.5;camera.position.set(0,4,75);camera.lookAt(target);camera.updateProjectionMatrix();
 assertCornersFit(camera,bounds);
 const previous=cameraFramingSnapshot(bounds,camera.aspect);camera.aspect=.4;
 const fit=cameraAutoFit(camera,target,bounds,previous);assert.ok(fit,'a portrait frame needs more room for the same model');
 camera.position.copy(fit.position);target.copy(fit.target);camera.lookAt(target);assertCornersFit(camera,bounds);
 const portrait=cameraFramingSnapshot(bounds,camera.aspect);camera.aspect=2;
 assert.equal(cameraAutoFit(camera,target,bounds,portrait),null,'a wider frame must not zoom in automatically');
});

test('auto-fit can recover a growing model around or behind the camera',()=>{
 const camera=new PerspectiveCamera(35,1,.1,1500),target=new Vector3();camera.position.set(0,0,.2);camera.lookAt(target);
 const bounds=settledPieceBounds([dimensions(-8,0,-8,16,40,16)],0,0),fit=cameraAutoFit(camera,target,bounds);
 assert.ok(fit);camera.position.copy(fit.position);camera.lookAt(fit.target);assertCornersFit(camera,bounds);
});

test('a scene-origin translation preserves the view and progress of a pending camera move',()=>{
 const camera=new PerspectiveCamera(35,1.2,.1,1500),target=new Vector3(),shiftedCamera=camera.clone(),shiftedTarget=new Vector3();
 const move={position:new Vector3(50,35,70),target:new Vector3(0,5,0),toPosition:new Vector3(85,70,115),toTarget:new Vector3(12,18,4),start:100,duration:420};
 // Increasing the declared footprint from 24×16 to 40×28 moves every instance
 // by this same offset. A rebuild must translate both ends of an in-flight move.
 const offset=new Vector3((24-40)/2,0,(16-28)/2),shifted={...move};
 for(const field of ['position','target','toPosition','toTarget'])shifted[field]=move[field].clone().add(offset);
 const piece=new Vector3(4,7,2),shiftedPiece=piece.clone().add(offset);
 for(const now of [100,205,310,520]){
  const finished=advanceCameraMove(camera,target,move,now,false),shiftedFinished=advanceCameraMove(shiftedCamera,shiftedTarget,shifted,now,false);
  camera.updateMatrixWorld();shiftedCamera.updateMatrixWorld();
  assert.equal(finished,shiftedFinished,'a rebuild must not restart the transition deadline');
  assert.ok(piece.clone().project(camera).distanceTo(shiftedPiece.clone().project(shiftedCamera))<1e-9,'existing bricks retain their screen position throughout the move');
 }
 const bounds=settledPieceBounds([dimensions()],24,16),framing=cameraFramingSnapshot(bounds,1.2);
 framing.bounds.min.add(offset);framing.bounds.max.add(offset);
 assert.equal(cameraAutoFit(shiftedCamera,shiftedTarget,settledPieceBounds([dimensions()],40,28),framing),null,'a centering-only rebuild does not override the retained view');
});

test('growth checks a pending fit destination rather than restarting because its current frame still clips',()=>{
 const camera=new PerspectiveCamera(35,1,.1,1500),target=new Vector3(0,.75,0);camera.position.set(0,.75,35);camera.lookAt(target);
 const initial=settledPieceBounds([dimensions()],8,8),wide=settledPieceBounds([dimensions(0,0,0,100,3,8)],8,8);
 const fit=cameraAutoFit(camera,target,wide,cameraFramingSnapshot(initial,1));assert.ok(fit);
 const move={position:camera.position.clone(),target:target.clone(),toPosition:fit.position,toTarget:fit.target,start:100,duration:420};
 advanceCameraMove(camera,target,move,142,false);
 const taller=settledPieceBounds([dimensions(0,0,0,100,6,8)],8,8),previous=cameraFramingSnapshot(wide,1),destination=camera.clone();destination.position.copy(move.toPosition);
 assert.ok(cameraAutoFit(camera,target,taller,previous),'the deliberately intermediate camera still clips the new model');
 assert.equal(cameraAutoFit(destination,move.toTarget,taller,previous),null,'the intended destination already fits this growth; retain its existing deadline');
 assert.equal(advanceCameraMove(camera,target,move,520,true),true);assertCornersFit(camera,taller);
});

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
