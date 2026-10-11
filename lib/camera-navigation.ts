import {PerspectiveCamera,Vector3} from "three";

export type CameraMove={position:Vector3;target:Vector3;toPosition:Vector3;toTarget:Vector3;start:number;duration:number};

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
