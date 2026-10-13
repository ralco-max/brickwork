import * as THREE from "three";
import {RoomEnvironment} from "three/addons/environments/RoomEnvironment.js";
import {colorFinish} from "./colors";
import type {ColorKey} from "./colors";
import type {Piece} from "./bridge";
import {isMinifig} from "./minifig";

// A material for one colour group. Trans colours blend without writing depth and draw after the opaque
// bricks; pearlescent ones reflect a soft studio room, without which metal reads as dull brown.
// userData.baseOpacity lets a fade-in scale the colour's own opacity.
export function brickMaterial(color:ColorKey,{roughness,vertexColors=false,environment}:{roughness:number;vertexColors?:boolean;environment?:()=>THREE.Texture}):THREE.MeshStandardMaterial{
 const f=colorFinish(color),material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:f.roughness??roughness,metalness:f.metalness,vertexColors,...(f.transparent?{transparent:true,opacity:f.opacity,depthWrite:false}:{})});
 if(f.kind==="metallic"&&environment){material.envMap=environment();material.envMapIntensity=.9;}
 material.userData.baseOpacity=f.opacity;material.userData.finish=f.kind;return material;
}
// The colour whose finish a piece's material takes. A minifigure is one vertex-coloured mesh, so it is
// glass or metal only when all its regions are; a trans torso never turns the head and legs to glass.
export function finishColor(p:Pick<Piece,"part"|"color"|"legs"|"skin">):ColorKey{
 if(!isMinifig(p.part))return p.color;
 const kind=colorFinish(p.color).kind;return [p.legs??p.color,p.skin??"yellow"].every(c=>colorFinish(c).kind===kind)?p.color:"white";
}
// Built once per renderer, and only when a metallic colour is on screen.
const environments=new WeakMap<THREE.WebGLRenderer,THREE.Texture>();
export function finishEnvironment(renderer:THREE.WebGLRenderer):THREE.Texture{
 let texture=environments.get(renderer);
 if(!texture){const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();texture=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();environments.set(renderer,texture);}
 return texture;
}
export function releaseFinishEnvironment(renderer:THREE.WebGLRenderer){environments.get(renderer)?.dispose();environments.delete(renderer);}
