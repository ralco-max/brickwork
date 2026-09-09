import * as THREE from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {SLOPES} from "./bridge";
import type {Face,Piece} from "./bridge";

// Geometry for one kind of piece: a rounded box for bricks, plates and tiles, or
// a wedge for slopes, already turned to face the way the piece's slope descends.
// Sizes are world units: one stud across, 0.4 per plate of height.
export const PLATE=.4;
export function pieceGeometry(p:Pick<Piece,"part"|"w"|"d"|"h"|"face">):THREE.BufferGeometry{
 const slope=SLOPES[p.part];
 if(!slope)return new RoundedBoxGeometry(p.w-.035,p.h*PLATE-.018,p.d-.035,2,.032);
 const face:Face=p.face||"pz",rotated=face==="px"||face==="nx";
 const depth=(rotated?p.w:p.d)-.035,width=(rotated?p.d:p.w)-.035,height=p.h*PLATE-.018,flat=depth-slope.run,lip=.08;
 // Profile in the (depth, height) plane, descending toward +u, extruded along the ridge.
 const shape=new THREE.Shape();
 if(slope.inverted){shape.moveTo(0,0);shape.lineTo(flat,0);shape.lineTo(depth,height-lip);shape.lineTo(depth,height);shape.lineTo(0,height);}
 else{shape.moveTo(0,0);shape.lineTo(depth,0);shape.lineTo(depth,lip);
  // A curved slope is a convex quarter ellipse from the low front edge up to the flat top.
  if(slope.curved){const steps=8;for(let i=1;i<=steps;i++){const t=i/steps*Math.PI/2;shape.lineTo(flat+(depth-flat)*Math.cos(t),lip+(height-lip)*Math.sin(t));}}
  else shape.lineTo(flat,height);
  shape.lineTo(0,height);}
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false});
 geometry.translate(-depth/2,-height/2,-width/2);
 geometry.rotateY(face==="px"?0:face==="nx"?Math.PI:face==="pz"?-Math.PI/2:Math.PI/2);
 geometry.computeVertexNormals();
 return geometry;
}
