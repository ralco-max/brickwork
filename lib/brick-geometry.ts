import * as THREE from "three";
import {RoundedBoxGeometry} from "three/addons/geometries/RoundedBoxGeometry.js";
import {SLOPES,WHEELS} from "./bridge";
import type {Face,Piece} from "./bridge";

// Geometry for one kind of piece: a rounded box for bricks, plates and tiles, or
// a wedge for slopes, already turned to face the way the piece's slope descends.
// Sizes are world units: one stud across, 0.4 per plate of height.
export const PLATE=.4;
export function pieceGeometry(p:Pick<Piece,"part"|"w"|"d"|"h"|"face"|"rotated">):THREE.BufferGeometry{
 const wheel=WHEELS[p.part];
 if(wheel){
  // A tire: a cylinder on the axle, slightly rounded by a torus-like profile, sized to the element.
  const radius=wheel.diameter/2-.06,width=wheel.width-.12,geometry=new THREE.CylinderGeometry(radius,radius,width,28,1);
  // CylinderGeometry stands on y; lay it along the axle: z when unrotated, x when rotated.
  if(p.rotated)geometry.rotateZ(Math.PI/2);else geometry.rotateX(Math.PI/2);
  return geometry;
 }
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

// The hub of a wheel, drawn in light gray inside the tire.
export function hubGeometry(p:Pick<Piece,"part"|"rotated">):THREE.BufferGeometry|null{
 const wheel=WHEELS[p.part];if(!wheel)return null;
 const radius=wheel.diameter/2*.58,width=wheel.width+.14,geometry=new THREE.CylinderGeometry(radius,radius,width,20,1);
 if(p.rotated)geometry.rotateZ(Math.PI/2);else geometry.rotateX(Math.PI/2);
 return geometry;
}
