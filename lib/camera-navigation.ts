import {PerspectiveCamera,Vector3} from "three";
import type {Piece} from "./bridge";

export type CameraMove={position:Vector3;target:Vector3;toPosition:Vector3;toTarget:Vector3;start:number;duration:number};
export type SettledBounds={min:Vector3;max:Vector3};
export type CameraFramingSnapshot={bounds:SettledBounds|null;aspect:number};

/** Model coordinates match the settled instances, including clearance for studs. */
export function settledPieceBounds(pieces:readonly Pick<Piece,"x"|"y"|"z"|"w"|"h"|"d">[],length:number,width:number):SettledBounds|null{
 if(!pieces.length)return null;
 const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
 for(const p of pieces){
  min.min(new Vector3(p.x-length/2,p.y*.4,p.z-width/2));
  max.max(new Vector3(p.x+p.w-length/2,(p.y+p.h)*.4+.3,p.z+p.d-width/2));
 }
 return {min,max};
}

/** Keep this snapshot across scene rebuilds, even when the current frame already fits. */
export function cameraFramingSnapshot(bounds:SettledBounds|null,aspect:number):CameraFramingSnapshot{
 return {bounds:bounds?{min:bounds.min.clone(),max:bounds.max.clone()}:null,aspect};
}

function sameBounds(a:SettledBounds|null,b:SettledBounds|null){
 return a===b||Boolean(a&&b&&a.min.distanceToSquared(b.min)<1e-12&&a.max.distanceToSquared(b.max)<1e-12);
}

/**
 * Only new bounds or a resized frame may request an automatic camera move. Manual
 * orbit, pan and zoom on the same model are left alone. A fitting frame keeps its
 * exact position and target; a clipped one recenters along the existing angle and
 * only increases the camera distance when the growing model needs more room.
 */
export function cameraAutoFit(camera:PerspectiveCamera,target:Vector3,bounds:SettledBounds|null,previous?:CameraFramingSnapshot|null,safeFrame=.82):{position:Vector3;target:Vector3}|null{
 if(!bounds||(previous&&Math.abs(previous.aspect-camera.aspect)<1e-6&&sameBounds(previous.bounds,bounds)))return null;
 const margin=Math.max(.1,Math.min(.98,safeFrame));
 // Use a copy: a framing query must not change the live camera or its matrices.
 const view=camera.clone();view.lookAt(target);view.updateProjectionMatrix();view.updateMatrixWorld();
 const corners:Vector3[]=[];
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new Vector3(x,y,z));
 const clips=corners.some(corner=>{
  const inView=corner.clone().applyMatrix4(view.matrixWorldInverse),projected=corner.clone().project(view);
  return inView.z>=-view.near||Math.abs(projected.x)>margin||Math.abs(projected.y)>margin;
 });
 if(!clips)return null;
 const center=bounds.min.clone().add(bounds.max).multiplyScalar(.5);
 const right=new Vector3().setFromMatrixColumn(view.matrixWorld,0),up=new Vector3().setFromMatrixColumn(view.matrixWorld,1),back=new Vector3().setFromMatrixColumn(view.matrixWorld,2);
 const halfHeight=Math.tan(view.getEffectiveFOV()*Math.PI/360)*margin,halfWidth=halfHeight*view.aspect;
 let distance=camera.position.distanceTo(target);
 for(const corner of corners){
  const offset=corner.clone().sub(center),depth=offset.dot(back);
  distance=Math.max(distance,depth+Math.abs(offset.dot(right))/halfWidth,depth+Math.abs(offset.dot(up))/halfHeight,depth+view.near*1.1);
 }
 return {position:center.clone().addScaledVector(back,distance),target:center};
}

/** Both pan and fit use the same bounded transition, including preference changes mid-move. */
export function advanceCameraMove(camera:PerspectiveCamera,target:Vector3,move:CameraMove,now:number,reducedMotion:boolean){
 const progress=reducedMotion?1:Math.max(0,Math.min(1,(now-move.start)/move.duration));
 const eased=1-Math.pow(1-progress,3);
 camera.position.lerpVectors(move.position,move.toPosition,eased);
 target.lerpVectors(move.target,move.toTarget,eased);
 camera.lookAt(target);
 return progress===1;
}

/** Translate the viewpoint in screen space without changing its angle or zoom. */
export function cameraPanOffset(camera:PerspectiveCamera,target:Vector3,horizontal:number,vertical:number){
 camera.updateMatrixWorld();
 const visibleHeight=2*camera.position.distanceTo(target)*Math.tan(camera.fov*Math.PI/360);
 const step=visibleHeight*.12;
 return new Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(horizontal*step)
  .addScaledVector(new Vector3().setFromMatrixColumn(camera.matrixWorld,1),vertical*step);
}
