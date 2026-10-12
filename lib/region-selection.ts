import {PerspectiveCamera,Plane,Raycaster,Vector2,Vector3} from "three";
import type {Piece} from "./bridge";

export type RegionScreenPoint={x:number;y:number};
export type RegionWorldPoint={x:number;y:number;z:number};
export type RegionWorldBounds={min:RegionWorldPoint;max:RegionWorldPoint};
export type RegionCandidate={id:number;center:RegionScreenPoint;samples:RegionScreenPoint[]};
type RegionPiece=Pick<Piece,"id"|"x"|"y"|"z"|"w"|"h"|"d">;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const cross=(a:RegionScreenPoint,b:RegionScreenPoint,c:RegionScreenPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distanceSquared=(a:RegionScreenPoint,b:RegionScreenPoint)=>(a.x-b.x)**2+(a.y-b.y)**2;

/** Pointer coordinates use the displayed canvas rectangle, independent of DPR. */
export function normalizedScreenPoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number}):RegionScreenPoint|null{
 if(![clientX,clientY,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return null;
 return {x:clamp((clientX-rect.left)/rect.width),y:clamp((clientY-rect.top)/rect.height)};
}

function segmentDistanceSquared(p:RegionScreenPoint,a:RegionScreenPoint,b:RegionScreenPoint){
 const length=distanceSquared(a,b),t=length?clamp(((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/length):0;
 return distanceSquared(p,{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
}

function simplify(points:RegionScreenPoint[],tolerance:number){
 const closed=[...points,points[0]],keep=new Set([0,closed.length-1]),stack=[[0,closed.length-1]];
 while(stack.length){const [first,last]=stack.pop()!;let farthest=-1,max=tolerance*tolerance;
  for(let i=first+1;i<last;i++){const distance=segmentDistanceSquared(closed[i],closed[first],closed[last]);if(distance>max){max=distance;farthest=i;}}
  if(farthest!==-1){keep.add(farthest);stack.push([first,farthest],[farthest,last]);}
 }
 return closed.filter((_,i)=>i<points.length&&keep.has(i));
}

/** Keep the closed outline compact without replacing a concave lasso by its box. */
export function cleanRegionPolygon(points:readonly RegionScreenPoint[],maxPoints=96):RegionScreenPoint[]{
 const clean:RegionScreenPoint[]=[];
 for(const p of points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;const point={x:clamp(p.x),y:clamp(p.y)};if(!clean.length||distanceSquared(point,clean[clean.length-1])>1e-10)clean.push(point);}
 if(clean.length>1&&distanceSquared(clean[0],clean[clean.length-1])<1e-10)clean.pop();
 if(clean.length<3)return [];
 const limit=Math.max(3,Math.min(96,Math.floor(Number.isFinite(maxPoints)?maxPoints:96)));
 let tolerance=.0004,result=simplify(clean,tolerance);
 while(result.length>limit){const next=simplify(clean,tolerance*=1.6);if(next.length<3)break;result=next;}
 // Extremely jagged strokes can cross the limit at a single tolerance step.
 while(result.length>limit){let index=0,area=Infinity;for(let i=0;i<result.length;i++){const value=Math.abs(cross(result[(i+result.length-1)%result.length],result[i],result[(i+1)%result.length]));if(value<area){area=value;index=i;}}result.splice(index,1);}
 if(result.length<3)return [];
 // Reject a click/line, while retaining crossed outlines with non-collinear arms.
 const anchor=result[0],far=result.reduce((a,b)=>distanceSquared(anchor,a)>distanceSquared(anchor,b)?a:b);
 return result.some(p=>Math.abs(cross(anchor,far,p))>1e-7)?result:[];
}

/** Even-odd containment with the boundary included, suitable for crossed lassos. */
export function pointInRegion(point:RegionScreenPoint,polygon:readonly RegionScreenPoint[]):boolean{
 if(polygon.length<3||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
 let inside=false;
 for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[j],b=polygon[i];if(segmentDistanceSquared(point,a,b)<1e-18)return true;
  if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}

/** Bounded, deterministic ray probes spread across the area and its contour. */
export function regionSamplePoints(polygon:readonly RegionScreenPoint[],maxPoints=144):RegionScreenPoint[]{
 const region=cleanRegionPolygon(polygon),budget=Math.max(0,Math.min(512,Math.floor(Number.isFinite(maxPoints)?maxPoints:144)));
 if(region.length<3||!budget)return [];
 const min={x:Math.min(...region.map(p=>p.x)),y:Math.min(...region.map(p=>p.y))},max={x:Math.max(...region.map(p=>p.x)),y:Math.max(...region.map(p=>p.y))};
 const samples:RegionScreenPoint[]=[],contourCount=Math.min(16,Math.floor(budget/5)),interiorCount=budget-contourCount;
 const add=(p:RegionScreenPoint)=>{if(pointInRegion(p,region)&&!samples.some(q=>distanceSquared(p,q)<1e-12))samples.push(p);};
 add({x:(min.x+max.x)/2,y:(min.y+max.y)/2});
 const radical=(index:number,base:number)=>{let value=0,fraction=1/base;while(index){value+=fraction*(index%base);index=Math.floor(index/base);fraction/=base;}return value;};
 // A low-discrepancy sequence fills concave/narrow regions without allocating a
 // dense grid or making the number of raycasts depend on model piece count.
 for(let i=1;i<=budget*64&&samples.length<interiorCount;i++)add({x:min.x+(max.x-min.x)*radical(i,2),y:min.y+(max.y-min.y)*radical(i,3)});
 const lengths=region.map((p,i)=>Math.sqrt(distanceSquared(p,region[(i+1)%region.length]))),perimeter=lengths.reduce((a,b)=>a+b,0);
 for(let i=0;i<contourCount;i++){
  let distance=(i+.5)*perimeter/contourCount,index=0;while(index<lengths.length-1&&distance>lengths[index])distance-=lengths[index++];
  const a=region[index],b=region[(index+1)%region.length],t=lengths[index]?distance/lengths[index]:0;add({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 }
 return samples.slice(0,budget);
}

function hull(points:RegionScreenPoint[]){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lower:RegionScreenPoint[]=[],upper:RegionScreenPoint[]=[];
 for(const point of sorted){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],point)<=1e-12)lower.pop();lower.push(point);}
 for(const point of sorted.reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],point)<=1e-12)upper.pop();upper.push(point);}
 lower.pop();upper.pop();return lower.concat(upper);
}

function intersection(a:RegionScreenPoint,b:RegionScreenPoint,c:RegionScreenPoint,d:RegionScreenPoint):RegionScreenPoint|null{
 const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,denominator=dx*ey-dy*ex;
 if(Math.abs(denominator)<1e-12)return null;
 const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/denominator,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/denominator;
 return t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9?{x:a.x+t*dx,y:a.y+t*dy}:null;
}

function overlapSamples(outline:RegionScreenPoint[],polygon:readonly RegionScreenPoint[],center:RegionScreenPoint){
 const points:RegionScreenPoint[]=[];
 const add=(p:RegionScreenPoint)=>{if(pointInRegion(p,outline)&&pointInRegion(p,polygon)&&!points.some(q=>distanceSquared(p,q)<1e-12))points.push(p);};
 add(center);for(const p of outline)add(p);for(const p of polygon)add(p);
 for(let i=0;i<outline.length;i++)for(let j=0;j<polygon.length;j++){const p=intersection(outline[i],outline[(i+1)%outline.length],polygon[j],polygon[(j+1)%polygon.length]);if(p)add(p);}
 if(points.length<3)return [];
 const intersectionHull=hull(points);let twiceArea=0;
 for(let i=0;i<intersectionHull.length;i++){const a=intersectionHull[i],b=intersectionHull[(i+1)%intersectionHull.length];twiceArea+=a.x*b.y-b.x*a.y;}
 if(Math.abs(twiceArea)<1e-10)return []; // touching an edge is not selecting a piece
 const average=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0});
 const samples:RegionScreenPoint[]=[];
 const sample=(p:RegionScreenPoint)=>{if(pointInRegion(p,outline)&&pointInRegion(p,polygon)&&!samples.some(q=>distanceSquared(p,q)<1e-12))samples.push(p);};
 sample(center);sample(average);
 // Interior samples avoid rays landing exactly on a seam between adjacent parts.
 for(const p of points)sample({x:p.x*.8+average.x*.2,y:p.y*.8+average.y*.2});
 if(!samples.length)for(const p of points)sample(p);
 return samples.length<=9?samples:Array.from({length:9},(_,i)=>samples[Math.floor(i*(samples.length-1)/8)]);
}

/**
 * Broad-phase candidates, not final selections: projected boxes cannot establish
 * visibility. Raycast these samples against actual rendered meshes and keep only
 * each ray's first hit. Never select every ID returned here as a back-wall shortcut.
 */
export function projectRegionCandidates(pieces:readonly RegionPiece[],camera:PerspectiveCamera,length:number,width:number,polygon:readonly RegionScreenPoint[]):RegionCandidate[]{
 const region=cleanRegionPolygon(polygon);if(region.length<3)return [];
 const view=camera.clone();view.updateProjectionMatrix();view.updateMatrixWorld();const candidates:RegionCandidate[]=[];
 for(const p of pieces){
  const corners:Vector3[]=[];
  for(const x of [p.x-length/2,p.x+p.w-length/2])for(const y of [p.y*.4,(p.y+p.h)*.4+.3])for(const z of [p.z-width/2,p.z+p.d-width/2])corners.push(new Vector3(x,y,z).applyMatrix4(view.matrixWorldInverse));
  // Clip edges at the near/far planes before projecting; behind-camera vertices
  // must not reflect into a false screen-spanning selection.
  const clipped=corners.filter(v=>v.z<=-view.near&&v.z>=-view.far).map(v=>v.clone());
  for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))for(const depth of [view.near,view.far]){const a=corners[i],b=corners[i|bit],delta=b.z-a.z;if(Math.abs(delta)<1e-12)continue;const t=(-depth-a.z)/delta;if(t>0&&t<1)clipped.push(a.clone().lerp(b,t));}
  if(clipped.length<3)continue;
  const outline=hull(clipped.map(v=>{const projected=v.applyMatrix4(view.projectionMatrix);return {x:(projected.x+1)/2,y:(1-projected.y)/2};}));
  if(outline.length<3)continue;
  const projected=new Vector3(p.x+p.w/2-length/2,(p.y+p.h/2)*.4,p.z+p.d/2-width/2).project(view),center={x:(projected.x+1)/2,y:(1-projected.y)/2};
  const samples=overlapSamples(outline,region,center);if(samples.length)candidates.push({id:p.id,center,samples});
 }
 return candidates;
}

/** Exact piece extents in build units: x/z studs, y plates; no centered-scene offset. */
export function regionBoundsForPieces(pieces:readonly Pick<Piece,"x"|"y"|"z"|"w"|"h"|"d">[]):RegionWorldBounds|null{
 if(!pieces.length)return null;
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
 for(const p of pieces){min.x=Math.min(min.x,p.x);min.y=Math.min(min.y,p.y);min.z=Math.min(min.z,p.z);max.x=Math.max(max.x,p.x+p.w);max.y=Math.max(max.y,p.y+p.h);max.z=Math.max(max.z,p.z+p.d);}
 return {min,max};
}

/** Camera-facing anchor plane supplies an explicit area for empty-space additions. */
export function regionBoundsOnViewPlane(polygon:readonly RegionScreenPoint[],camera:PerspectiveCamera,length:number,width:number,anchor:RegionWorldPoint):RegionWorldBounds|null{
 const region=cleanRegionPolygon(polygon);if(region.length<3||![anchor.x,anchor.y,anchor.z].every(Number.isFinite))return null;
 const view=camera.clone();view.updateProjectionMatrix();view.updateMatrixWorld();
 const plane=new Plane().setFromNormalAndCoplanarPoint(view.getWorldDirection(new Vector3()),new Vector3(anchor.x-length/2,anchor.y*.4,anchor.z-width/2)),raycaster=new Raycaster();
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};let hits=0;
 for(const point of region){raycaster.setFromCamera(new Vector2(point.x*2-1,1-point.y*2),view);const hit=raycaster.ray.intersectPlane(plane,new Vector3());if(!hit)continue;hits++;const world={x:hit.x+length/2,y:hit.y/.4,z:hit.z+width/2};for(const axis of ["x","y","z"] as const){min[axis]=Math.min(min[axis],world[axis]);max[axis]=Math.max(max[axis],world[axis]);}}
 return hits>=3?{min,max}:null;
}
