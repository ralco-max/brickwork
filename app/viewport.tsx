"use client";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {COLORS,Piece,studCells} from "@/lib/bridge";
import {pieceGeometry} from "@/lib/brick-geometry";
import {reconcileArrivals,arrivalPose,brickIdentity} from "@/lib/live-arrivals";
import type {Arrival} from "@/lib/live-arrivals";
import {assemblyPose,assemblyTracks} from "@/lib/assembly";

export type BrickHit={piece:Piece;point:{x:number;y:number;z:number};normal:{x:number;y:number;z:number}};
type Props={arrivals?:{epoch:number;paused:boolean};suspended?:boolean;pieces:Piece[];length:number;width?:number;height?:number;modelKey?:string;editMode?:string;onBrick?:(hit:BrickHit)=>void;highlightIds?:number[];heat?:Map<number,number>;explode:number;stage:number;selected:string|null;view:string;reset:number;rotate:boolean;onPick:(key:string|null)=>void;assembly?:{time:()=>number;onFrame?:(canvas:HTMLCanvasElement,time:number)=>void;sweep?:boolean};presentation?:boolean;onCanvas?:(canvas:HTMLCanvasElement|null)=>void};
export default function Viewport(props:Props){
 const host=useRef<HTMLDivElement>(null),api=useRef<{update:(p:Props)=>void;camera:(view:string)=>void}|null>(null),latest=useRef(props);latest.current=props;const savedCamera=useRef<{key:string;position:THREE.Vector3;target:THREE.Vector3}|null>(null);
 const rendererRef=useRef<THREE.WebGLRenderer|null>(null);
 const arrivalState=useRef({epoch:-1,clock:0,entries:new Map<string,Arrival>()});
 const [error,setError]=useState(false),[touchActive,setTouchActive]=useState(false);const presentationProp=Boolean(props.presentation)||Boolean(props.arrivals);const touchEnabled=useRef(touchActive);touchEnabled.current=touchActive;
 useEffect(()=>()=>{latest.current.onCanvas?.(null);const renderer=rendererRef.current;rendererRef.current=null;renderer?.dispose();renderer?.domElement.remove();},[]);
 useEffect(()=>{
  if(!host.current)return;const node=host.current;let renderer:THREE.WebGLRenderer;
  // The assembly plays inside the same interactive view: orbit stays enabled, and the
  // slow camera sweep (landing only) stops the moment the viewer takes the camera.
  const cinematic=Boolean(props.assembly),sweep=Boolean(props.assembly?.sweep),presentation=Boolean(props.presentation)||Boolean(props.arrivals),coarse=window.matchMedia("(pointer: coarse)").matches;let userMoved=false;
  try{renderer=rendererRef.current||new THREE.WebGLRenderer({antialias:true,alpha:!presentation});rendererRef.current=renderer;}catch{setError(true);return;}
  // Stage colours follow the theme's CSS variables and update when the theme changes.
  const themeColor=(name:string,fallback:string)=>new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback);
  const applyTheme=()=>{renderer.setClearColor(themeColor(presentation?"--stage-bg":"--canvas-bg",presentation?"#ffffff":"#eef2f4"),presentation?1:0);if(scene.fog instanceof THREE.FogExp2)scene.fog.color.copy(themeColor("--stage-bg","#ffffff"));hemi.groundColor.copy(themeColor("--stage-ground","#8794a2"));};
  setError(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio,coarse?1.5:2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;if(renderer.domElement.parentElement!==node){node.appendChild(renderer.domElement);latest.current.onCanvas?.(renderer.domElement);}
  renderer.domElement.setAttribute("aria-label","Interactive 3D brick model. Drag to rotate; pinch or scroll to zoom. Select a brick to inspect its part.");renderer.domElement.setAttribute("role","img");
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,1500),L=props.length,W=props.width??16,H=(props.height??43)*.4,centerX=L/2,centerZ=W/2;
  const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=true;controls.enableDamping=true;controls.addEventListener("start",()=>{userMoved=true;});controls.dampingFactor=.07;controls.minDistance=18;controls.maxDistance=Math.max(L,W,H)*6;controls.maxPolarAngle=Math.PI*.49;controls.target.set(0,H*.44,0);controls.autoRotateSpeed=.6;
  const hemi=new THREE.HemisphereLight(0xffffff,0x8794a2,2.8);scene.add(hemi);const sun=new THREE.DirectionalLight(0xfff6e6,3.3);sun.position.set(-20,80,50);sun.castShadow=true;sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.bias=-.0004;sun.shadow.normalBias=.06;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xccdeff,2);fill.position.set(40,20,-40);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.ShadowMaterial({opacity:presentation ? .12 : .15}));floor.rotation.x=-Math.PI/2;floor.position.y=-.10;floor.receiveShadow=true;scene.add(floor);
  if(presentation){scene.fog=new THREE.FogExp2(0xffffff,.0018);}applyTheme();const themeWatch=new MutationObserver(applyTheme);themeWatch.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});if(presentation){const rim=new THREE.DirectionalLight(0xe5edff,1.5);rim.position.set(0,30,-50);scene.add(rim);const radius=Math.max(L,W,H)+20;sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.updateProjectionMatrix();}
  // Explode scales every brick's position away from the model's centre in all directions,
  // lifted so the lowest bricks stay above the floor.
  // Explode walks every brick back along its own intro flight path, all together, frozen
  // mid-flight and tumbling; at the far end the bricks are still visible.
  const EXPLODE_REACH=.9,flightMax=Math.max(10,Math.max(L,W)*.24)*1.45,liftMax=Math.max(12,H*.4*.5)+10;
  if(props.arrivals){if(arrivalState.current.epoch!==props.arrivals.epoch)arrivalState.current={epoch:props.arrivals.epoch,clock:0,entries:new Map()};arrivalState.current.entries=reconcileArrivals(arrivalState.current.entries,props.pieces,arrivalState.current.clock,L,W,props.height??43);}
  const arrivalEnd=Math.max(0,...[...arrivalState.current.entries.values()].map(e=>e.at+1.36));
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const tracks=assemblyTracks(props.pieces,L,W,props.height??43);
  const groups=new Map<string,Piece[]>();for(const p of props.pieces){const k=`${p.part}:${p.color}:${p.rotated}:${p.face||""}`;const list=groups.get(k)||[];list.push(p);groups.set(k,list);}
  const batches:{body:THREE.InstancedMesh;studs:THREE.InstancedMesh|null;pieces:Piece[];studded:[number,number][]}[]=[],meshes:THREE.InstancedMesh[]=[];
  for(const list of groups.values()){
   const p=list[0],material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.3,metalness:0}),studded=studCells(p);
   const body=new THREE.InstancedMesh(pieceGeometry(p),material,list.length);body.castShadow=true;body.receiveShadow=true;body.userData.pieces=list;meshes.push(body);scene.add(body);
   let studs:THREE.InstancedMesh|null=null;if(studded.length){studs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.30,.30,.18,12),material,list.length*studded.length);studs.castShadow=true;studs.receiveShadow=true;scene.add(studs);}
   if(presentation){body.frustumCulled=false;body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(studs){studs.frustumCulled=false;studs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}}
   batches.push({body,studs,pieces:list,studded});
  }
  const temp=new THREE.Object3D(),studLocal=new THREE.Matrix4(),studWorld=new THREE.Matrix4(),baseColor=new THREE.Color(),dimColor=new THREE.Color("#c2cbd0");
  const update=(state:Props,time?:number)=>{
   controls.enabled=!coarse||touchEnabled.current;renderer.domElement.style.touchAction=coarse&&!touchEnabled.current?"pan-y":"none";
   controls.autoRotate=state.rotate&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   const assemblyTime=time??state.assembly?.time()??1,animationOnly=time!==undefined,highlighted=new Set(state.highlightIds||[]);
   for(const batch of batches){let studIndex=0;batch.pieces.forEach((p,i)=>{
    const visible=p.stage<=state.stage,key=`${p.part}:${p.color}`,selected=!state.selected||state.selected===key;
    const e=state.explode,y=p.y*.4,track=tracks.get(p.id)!;
    const entry=state.arrivals?arrivalState.current.entries.get(brickIdentity(p)):null;
    const pose=entry?arrivalPose(entry,arrivalState.current.clock,reducedMotion.matches):e>0?assemblyPose(track,track.start+(1-e*EXPLODE_REACH)*.175):cinematic?assemblyPose(track,assemblyTime):null;
    temp.position.set(p.x+p.w/2-L/2+(pose?.x??0),y+p.h*.2+(pose?.y??0),p.z+p.d/2-centerZ+(pose?.z??0));temp.rotation.set(pose?.rx??0,pose?.ry??0,pose?.rz??0);temp.scale.setScalar(visible?(pose?.scale??1):0);temp.updateMatrix();batch.body.setMatrixAt(i,temp.matrix);
    if(!animationOnly){baseColor.set(COLORS[p.color].hex);if(state.heat){const r=state.heat.get(p.id);if(r===undefined)baseColor.lerp(dimColor,.8);else baseColor.set(r>1?"#e5484d":r>.5?"#f2b134":"#3f9d5a");}else if(highlighted.size){if(highlighted.has(p.id))baseColor.set("#fb541e");else baseColor.lerp(dimColor,.85);}else if(!selected)baseColor.lerp(dimColor,.85);batch.body.setColorAt(i,baseColor);}
    if(batch.studs)for(const [x,z] of batch.studded){studLocal.makeTranslation(x+.5-p.w/2,p.h*.2+.07,z+.5-p.d/2);studWorld.multiplyMatrices(temp.matrix,studLocal);batch.studs.setMatrixAt(studIndex,studWorld);if(!animationOnly)batch.studs.setColorAt(studIndex,baseColor);studIndex++;}
   });batch.body.instanceMatrix.needsUpdate=true;if(!animationOnly){if(batch.body.instanceColor)batch.body.instanceColor.needsUpdate=true;if(!presentation)batch.body.computeBoundingSphere();}if(batch.studs){batch.studs.instanceMatrix.needsUpdate=true;if(!animationOnly){if(batch.studs.instanceColor)batch.studs.instanceColor.needsUpdate=true;if(!presentation)batch.studs.computeBoundingSphere();}}}
  };
  let cameraMove:{position:THREE.Vector3;target:THREE.Vector3;toPosition:THREE.Vector3;toTarget:THREE.Vector3;start:number}|null=null;
  const setCamera=(view:string)=>{
   const aspect=Math.max(.3,node.clientWidth/Math.max(1,node.clientHeight)),vFov=THREE.MathUtils.degToRad(35),hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
   const e=latest.current.explode*EXPLODE_REACH,displayH=H+e*liftMax+4,spreadX=L/2+e*flightMax,spreadZ=W/2+e*flightMax;
   const target=new THREE.Vector3(0,displayH*.45,0);controls.target.copy(target);
   const direction=(view==="front"?new THREE.Vector3(0,.10,1):view==="top"?new THREE.Vector3(0,1,.001):new THREE.Vector3(.8,.72,1)).normalize();
   const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
   let distance=1;
   for(const x of [-spreadX,spreadX])for(const y of [0,displayH])for(const z of [-spreadZ,spreadZ]){const corner=new THREE.Vector3(x,y,z).sub(target);distance=Math.max(distance,corner.dot(direction)+Math.max(Math.abs(corner.dot(right))/Math.tan(hFov/2),Math.abs(corner.dot(up))/Math.tan(vFov/2)));}
   camera.position.copy(target).add(direction.multiplyScalar(distance*1.16+3));camera.lookAt(target);controls.update();
  };
  const cinematicCamera=new THREE.Vector3();let cameraRevision=0;
  const resize=()=>{cameraRevision++;const w=node.clientWidth,h=node.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();if(sweep){setCamera("perspective");camera.position.sub(controls.target).multiplyScalar(1.4).add(controls.target);cinematicCamera.copy(camera.position).sub(controls.target);}};
  const observer=new ResizeObserver(resize);observer.observe(node);resize();if(savedCamera.current?.key===(props.modelKey??"model")){camera.position.copy(savedCamera.current.position);controls.target.copy(savedCamera.current.target);controls.update();}else setCamera(latest.current.view);update(latest.current);api.current={update,camera:(view)=>{if(sweep||reducedMotion.matches){cameraMove=null;setCamera(view);return;}const position=camera.position.clone(),target=controls.target.clone();setCamera(view);cameraMove={position,target,toPosition:camera.position.clone(),toTarget:controls.target.clone(),start:performance.now()};camera.position.copy(position);controls.target.copy(target);camera.lookAt(target);}};
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let downX=0,downY=0;
  const down=(e:PointerEvent)=>{cameraMove=null;downX=e.clientX;downY=e.clientY;};
  const pick=(e:PointerEvent)=>{if((coarse&&!touchEnabled.current)||Math.hypot(e.clientX-downX,e.clientY-downY)>5)return;const rect=node.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(meshes)[0];if(hit&&hit.instanceId!==undefined){const p=hit.object.userData.pieces[hit.instanceId] as Piece;if(latest.current.editMode&&latest.current.editMode!=="inspect"&&latest.current.onBrick){const n=hit.face?.normal??new THREE.Vector3(0,1,0);latest.current.onBrick({piece:p,point:{x:hit.point.x+centerX,y:hit.point.y/.4,z:hit.point.z+centerZ},normal:{x:n.x,y:n.y,z:n.z}});return;}const key=`${p.part}:${p.color}`;latest.current.onPick(latest.current.selected===key?null:key);}else latest.current.onPick(null);};
  renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointerup",pick);
  const lost=(e:Event)=>{e.preventDefault();latest.current.onCanvas?.(null);setError(true);};renderer.domElement.addEventListener("webglcontextlost",lost);
  let inView=true;const visibility=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;});visibility.observe(node);
  let raf=0,lastTime=-1,lastCameraRevision=-1,lastFrame=performance.now();const axis=new THREE.Vector3(0,1,0);const animate=()=>{raf=requestAnimationFrame(animate);const now=performance.now(),delta=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;if(inView&&node.clientWidth&&node.clientHeight&&!document.hidden&&!latest.current.suspended){if(latest.current.arrivals&&arrivalState.current.clock<=arrivalEnd){if(!latest.current.arrivals.paused)arrivalState.current.clock+=delta;update(latest.current,arrivalState.current.clock);}
if(cameraMove){const u=Math.min(1,(now-cameraMove.start)/520),eased=1-Math.pow(1-u,3);camera.position.lerpVectors(cameraMove.position,cameraMove.toPosition,eased);controls.target.lerpVectors(cameraMove.target,cameraMove.toTarget,eased);camera.lookAt(controls.target);if(u===1)cameraMove=null;}
const time=latest.current.assembly?.time();if(time!==undefined&&(time!==lastTime||cameraRevision!==lastCameraRevision)){update(latest.current,time);if(sweep&&!userMoved){camera.position.copy(cinematicCamera).applyAxisAngle(axis,(time-.5)*.38).multiplyScalar(1-.08*time).add(controls.target);camera.lookAt(controls.target);}lastTime=time;lastCameraRevision=cameraRevision;}controls.update();renderer.render(scene,camera);if(time!==undefined)latest.current.assembly?.onFrame?.(renderer.domElement,time);}};animate();
  return()=>{savedCamera.current={key:props.modelKey??"model",position:camera.position.clone(),target:controls.target.clone()};api.current=null;cancelAnimationFrame(raf);observer.disconnect();themeWatch.disconnect();visibility.disconnect();controls.dispose();renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointerup",pick);renderer.domElement.removeEventListener("webglcontextlost",lost);const materials=new Set<THREE.Material>();scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>materials.add(m));else materials.add(obj.material);}});materials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.renderLists.dispose();};
 },[props.pieces,props.length,props.width,props.height,props.modelKey,props.arrivals?.epoch]);
 useEffect(()=>{api.current?.update(props);},[props.explode,props.stage,props.selected,props.rotate,props.highlightIds,props.heat,touchActive]);
 useEffect(()=>{api.current?.camera(props.view);},[props.view,props.reset,props.explode]);
 return <div className={"canvas-host "+(props.editMode&&props.editMode!=="inspect"?"is-editing":"")} ref={host}>{!presentationProp&&!error&&<button className="touch-model-toggle" aria-pressed={touchActive} onClick={()=>setTouchActive(v=>!v)}>{touchActive?"Done · scroll page":"Touch to rotate or edit"}</button>}{error&&<div className="canvas-error"><strong>3D preview is unavailable in this browser.</strong><p>The parts audit and exports still work. Try opening the studio in Safari or Chrome with WebGL enabled.</p></div>}</div>;
}
