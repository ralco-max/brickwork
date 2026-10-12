import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";
import {createRequire} from "node:module";

const bundle=await build({stdin:{contents:'export * from "./lib/region-selection"; export {PerspectiveCamera,Vector2,Vector3,Raycaster,Mesh,BoxGeometry,MeshBasicMaterial} from "three";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"cjs",write:false});
const module={exports:{}};new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {normalizedScreenPoint,cleanRegionPolygon,pointInRegion,regionSamplePoints,projectRegionCandidates,regionBoundsForPieces,regionBoundsOnViewPlane,PerspectiveCamera,Vector2,Vector3,Raycaster,Mesh,BoxGeometry,MeshBasicMaterial}=module.exports;
const rect=(left,top,right,bottom)=>[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
const piece=(id,x=18,y=0,z=18,w=4,h=10,d=4)=>({id,x,y,z,w,h,d});
const cameraAt=(position,target=[0,2,0])=>{const camera=new PerspectiveCamera(35,1,.1,250);camera.position.set(...position);camera.lookAt(new Vector3(...target));camera.updateMatrixWorld();return camera;};
const screen=(point,camera)=>{const p=new Vector3(...point).project(camera);return {x:(p.x+1)/2,y:(1-p.y)/2};};

test("pointer conversion uses the CSS canvas rectangle, clamps outside drags and rejects hidden/invalid rectangles",()=>{
 const canvas={left:80,top:120,width:600,height:300};
 assert.deepEqual(normalizedScreenPoint(380,270,canvas),{x:.5,y:.5});
 assert.deepEqual(normalizedScreenPoint(20,900,canvas),{x:0,y:1});
 assert.equal(normalizedScreenPoint(0,0,{...canvas,width:0}),null);assert.equal(normalizedScreenPoint(NaN,0,canvas),null);
 assert.equal(normalizedScreenPoint(0,0,{...canvas,height:-1}),null);
});

test("polygon cleanup preserves the outline while bounding freehand samples and rejecting clicks/lines",()=>{
 const stroke=Array.from({length:1200},(_,i)=>({x:.5+Math.cos(i/1200*Math.PI*2)*.35,y:.5+Math.sin(i/1200*Math.PI*2)*.25}));
 stroke.push(stroke[0]);const original=JSON.stringify(stroke),clean=cleanRegionPolygon(stroke);
 assert.ok(clean.length>=12&&clean.length<=96);assert.equal(JSON.stringify(stroke),original,"cleanup does not mutate captured pointer data");
 assert.ok(pointInRegion({x:.5,y:.5},clean));assert.equal(pointInRegion({x:.9,y:.5},clean),false);
 const dirty=[{x:-1,y:0},{x:1,y:0},{x:1,y:0},{x:NaN,y:1},{x:1,y:2},{x:0,y:1},{x:-1,y:0}];
 assert.deepEqual(cleanRegionPolygon(dirty),rect(0,0,1,1));
 for(const invalid of [[],[{x:.2,y:.3}],rect(.5,.5,.5,.5),[{x:.1,y:.1},{x:.5,y:.5},{x:.9,y:.9}]])assert.deepEqual(cleanRegionPolygon(invalid),[]);
 assert.ok(cleanRegionPolygon(stroke,12).length<=12);
});

test("point containment respects concave regions, boundary points and crossed outlines",()=>{
 const concave=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.3},{x:.3,y:.3},{x:.3,y:.9},{x:.1,y:.9}];
 assert.ok(pointInRegion({x:.2,y:.8},concave));assert.ok(pointInRegion({x:.8,y:.2},concave));
 assert.equal(pointInRegion({x:.6,y:.6},concave),false,"the lasso notch is not its bounding rectangle");
 assert.ok(pointInRegion({x:.3,y:.6},concave));assert.ok(pointInRegion(concave[0],concave));assert.equal(pointInRegion({x:NaN,y:.2},concave),false);
 const crossed=cleanRegionPolygon([{x:.1,y:.1},{x:.9,y:.9},{x:.9,y:.1},{x:.1,y:.9}]);assert.equal(crossed.length,4);assert.ok(pointInRegion({x:.8,y:.5},crossed));
});

test("ray sample budgets stay bounded, deterministic and spread inside the drawn area including its contour",()=>{
 const square=rect(.1,.1,.9,.9),samples=regionSamplePoints(square);
 assert.equal(samples.length,144);assert.deepEqual(regionSamplePoints(square),samples);
 for(const p of samples)assert.ok(pointInRegion(p,square));
 for(const [right,bottom] of [[false,false],[true,false],[false,true],[true,true]])assert.ok(samples.filter(p=>(p.x>=.5)===right&&(p.y>=.5)===bottom).length>=20,"each quadrant receives useful coverage");
 assert.ok(samples.some(p=>Math.abs(p.x-.1)<1e-9||Math.abs(p.x-.9)<1e-9||Math.abs(p.y-.1)<1e-9||Math.abs(p.y-.9)<1e-9),"contour probes cover the border too");
 const concave=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.15},{x:.15,y:.15},{x:.15,y:.9},{x:.1,y:.9}];
 for(const limit of [0,1,7,32,144]){const points=regionSamplePoints(concave,limit);assert.ok(points.length<=limit);if(limit)assert.ok(points.length>0);for(const p of points)assert.ok(pointInRegion(p,concave));}
 assert.deepEqual(regionSamplePoints([]),[]);assert.deepEqual(regionSamplePoints([{x:.1,y:.1},{x:.9,y:.9}]),[]);
});

test("front, perspective and top views select only projected overlapping candidates and produce in-region ray samples",()=>{
 const pieces=[piece(1),piece(2,0,0,36)];
 for(const position of [[0,8,70],[60,50,60],[0,80,.01]]){
  const camera=cameraAt(position),center=screen([0,2,0],camera),polygon=rect(center.x-.018,center.y-.018,center.x+.018,center.y+.018),original=camera.matrixWorld.elements.slice();
  const candidates=projectRegionCandidates(pieces,camera,40,40,polygon);
  assert.deepEqual(candidates.map(candidate=>candidate.id),[1]);assert.deepEqual(camera.matrixWorld.elements,original);
  assert.ok(candidates[0].samples.length>0&&candidates[0].samples.length<=9);
  for(const sample of candidates[0].samples)assert.ok(pointInRegion(sample,polygon));
 }
});

test("partial silhouettes count without their centers, but a concave notch and non-overlapping screen area do not",()=>{
 const camera=cameraAt([0,2,60]),p=piece(1,16,0,18,8,10,4),left=screen([-4,2,2],camera),inside=screen([-2.5,2,2],camera);
 const edge=rect(left.x-.001,.48,inside.x,.52),candidates=projectRegionCandidates([p],camera,40,40,edge);
 assert.equal(candidates.length,1);assert.equal(pointInRegion(candidates[0].center,edge),false,"overlap does not require the part center");
 for(const sample of candidates[0].samples)assert.ok(pointInRegion(sample,edge));
 const notch=[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.32},{x:.32,y:.32},{x:.32,y:.8},{x:.2,y:.8}];
 assert.deepEqual(projectRegionCandidates([p],camera,40,40,notch),[]);
 assert.deepEqual(projectRegionCandidates([p],camera,40,40,rect(.01,.01,.08,.08)),[]);
 assert.deepEqual(projectRegionCandidates([p],camera,40,40,[]),[]);
});

test("pieces behind the camera or beyond the far plane cannot reflect into candidates",()=>{
 const camera=cameraAt([0,2,10]);camera.far=50;camera.updateProjectionMatrix();
 const visible=piece(1,19,0,18,2,10,2),behind=piece(2,19,0,40,2,10,2),distant=piece(3,19,0,-80,2,10,2);
 assert.deepEqual(projectRegionCandidates([visible,behind,distant],camera,40,40,rect(.1,.1,.9,.9)).map(candidate=>candidate.id),[1]);
});

test("frontmost actual mesh raycasts exclude an occluded back wall even when both projected boxes overlap",()=>{
 const camera=cameraAt([0,2,30]),pieces=[piece(1,18,0,29),piece(2,18,0,15)],polygon=rect(.48,.48,.52,.52);
 const candidates=projectRegionCandidates(pieces,camera,40,40,polygon);assert.deepEqual(candidates.map(candidate=>candidate.id),[1,2],"projection provides candidates, not visibility");
 const meshes=pieces.map(p=>{const mesh=new Mesh(new BoxGeometry(p.w,p.h*.4,p.d),new MeshBasicMaterial());mesh.position.set(p.x+p.w/2-20,(p.y+p.h/2)*.4,p.z+p.d/2-20);mesh.userData.id=p.id;mesh.updateMatrixWorld();return mesh;});
 const selected=new Set(),ray=new Raycaster();
 for(const sample of regionSamplePoints(polygon)){ray.setFromCamera(new Vector2(sample.x*2-1,1-sample.y*2),camera);const first=ray.intersectObjects(meshes)[0];if(first)selected.add(first.object.userData.id);}
 assert.deepEqual([...selected],[1],"the back wall must not be selected through the visible front wall");
 for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}
});

test("selected bounds remain raw build coordinates in studs and plates, independent of camera centering",()=>{
 assert.equal(regionBoundsForPieces([]),null);
 assert.deepEqual(regionBoundsForPieces([piece(1,12,8,4,4,3,2),piece(2,2,15,9,2,6,3)]),{min:{x:2,y:8,z:4},max:{x:16,y:21,z:12}});
});

test("empty-space anchor-plane bounds use consistent front, perspective and top world units",()=>{
 const polygon=rect(.4,.4,.6,.6),anchor={x:20,y:10,z:20};
 const front=cameraAt([0,4,50],[0,4,0]),bounds=regionBoundsOnViewPlane(polygon,front,40,40,anchor),span=50*Math.tan(35*Math.PI/360)*.2;
 assert.ok(Math.abs(bounds.min.x-(20-span))<1e-9);assert.ok(Math.abs(bounds.max.x-(20+span))<1e-9);
 assert.ok(Math.abs(bounds.min.y-(10-span/.4))<1e-9);assert.ok(Math.abs(bounds.max.y-(10+span/.4))<1e-9);assert.equal(bounds.min.z,20);assert.equal(bounds.max.z,20);
 const top=cameraAt([0,50,0],[0,0,0]);top.up.set(0,0,-1);top.lookAt(new Vector3());top.updateMatrixWorld();
 const topBounds=regionBoundsOnViewPlane(polygon,top,40,40,{x:20,y:0,z:20});assert.ok(Math.abs(topBounds.min.y)<1e-9&&Math.abs(topBounds.max.y)<1e-9);assert.ok(topBounds.min.x<20&&topBounds.max.z>20);
 const perspective=regionBoundsOnViewPlane(polygon,cameraAt([60,50,60],[0,4,0]),40,40,anchor);
 for(const axis of ["x","y","z"]){assert.ok(Number.isFinite(perspective.min[axis]));assert.ok(perspective.min[axis]<anchor[axis]&&perspective.max[axis]>anchor[axis]);}
 assert.equal(regionBoundsOnViewPlane([],front,40,40,anchor),null);assert.equal(regionBoundsOnViewPlane(polygon,front,40,40,{x:20,y:10,z:90}),null,"a plane behind the viewpoint is not an inferred target");
});
