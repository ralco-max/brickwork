"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {ArrowDown,ArrowLeft,ArrowRight,ArrowUp,Scan} from "lucide-react";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {COLORS,Piece,studCells} from "@/lib/bridge";
import {pieceGeometry,hubGeometry} from "@/lib/brick-geometry";
import {reconcileArrivals,arrivalPose,brickIdentity,arrivalOpacity,arrivalEndTime} from "@/lib/live-arrivals";
import type {Arrival,ArrivalMode} from "@/lib/live-arrivals";
import {assemblyPose,assemblyTracks,inspectionReach,inspectionTracks,type AssemblyTrack} from "@/lib/assembly";
import {cameraPanOffset,advanceCameraMove,settledPieceBounds,cameraFramingSnapshot,cameraAutoFit,type CameraMove,type CameraFramingSnapshot} from "@/lib/camera-navigation";
import {fittedPartGeometry,hasExactPartGeometry,partGeometriesReady} from "@/lib/part-meshes";
import {fittedColor,fittedElement} from "@/lib/part-catalog";
import {isMinifig} from "@/lib/minifig";
import {brickMaterial,finishColor,finishEnvironment,releaseFinishEnvironment} from "@/lib/brick-materials";
import RegionMarker from "./region-marker";
import {regionSamplePoints,regionBoundsForPieces} from "@/lib/region-selection";
import type {RevisionRegion} from "@/lib/revision-region";
import {PreviewGeometryBuffer,type PreviewGeometry} from "@/lib/preview-geometry";

export type BrickHit={piece:Piece;point:{x:number;y:number;z:number};normal:{x:number;y:number;z:number}};
export type RegionCapture=Pick<RevisionRegion,"image"|"polygon"|"bounds">;
type Props={regionMode?:boolean;onRegion?:(region:RegionCapture)=>void;onCancelRegion?:()=>void;arrivals?:{epoch:number;paused:boolean;mode?:ArrivalMode};suspended?:boolean;light?:number;pieces:Piece[];length:number;width?:number;height?:number;modelKey?:string;editMode?:string;onBrick?:(hit:BrickHit)=>void;highlightIds?:number[];heat?:Map<number,number>;explode:number;stage:number;selected:string|null;view:string;reset:number;rotate:boolean;onPick:(key:string|null)=>void;onPickPiece?:(pieceId:string)=>void;assembly?:{time:()=>number;onFrame?:(canvas:HTMLCanvasElement,time:number)=>void;sweep?:boolean};presentation?:boolean;onCanvas?:(canvas:HTMLCanvasElement|null)=>void};
export default function Viewport(props:Props){
 const buffer=useRef<PreviewGeometryBuffer|null>(null);if(!buffer.current)buffer.current=new PreviewGeometryBuffer();
 const request=useMemo<PreviewGeometry>(()=>({pieces:props.pieces,length:props.length,width:props.width,height:props.height,modelKey:props.modelKey}),[props.pieces,props.length,props.width,props.height,props.modelKey]);
 const [,refresh]=useState(0),[retry,setRetry]=useState(0),[failure,setFailure]=useState<{request:PreviewGeometry;error:unknown}|null>(null);
 const [showPreparing,setShowPreparing]=useState(false);
 const available=buffer.current.select(request),frozen=useRef<PreviewGeometry|null>(null);
 if(!props.regionMode)frozen.current=available;else if(!frozen.current)frozen.current=available;
 const display=props.regionMode?frozen.current:available,waiting=!partGeometriesReady(request.pieces),currentFailure=waiting&&failure?.request===request?failure:null;
 useEffect(()=>{setFailure(null);return buffer.current!.prepare(request,()=>refresh(v=>v+1),error=>setFailure({request,error}));},[request,retry,waiting]);
 const hasDisplay=Boolean(display);
 useEffect(()=>{setShowPreparing(false);if(hasDisplay)return;const timer=setTimeout(()=>setShowPreparing(true),450);return()=>clearTimeout(timer);},[hasDisplay,props.modelKey]);
 return <div className="preview-shell" aria-busy={waiting}>
  {display?<ReadyViewport {...props} {...display} editMode={waiting?"inspect":props.editMode} onBrick={waiting?undefined:props.onBrick}/>:<div className="canvas-host">{showPreparing&&!currentFailure&&<div className="preview-preparing" role="status">Preparing preview…</div>}</div>}
  {currentFailure&&<div className={hasDisplay?"preview-update-notice":"canvas-error"} role="alert"><p>{hasDisplay?"The preview couldn’t update. Your current view is kept.":"The preview couldn’t load. Please try again."}</p><button type="button" className="button secondary" onClick={()=>setRetry(v=>v+1)}>Retry preview</button></div>}
 </div>;
}

// Touch-first screens get touch wording; the server and the first client render assume a mouse.
const COARSE="(pointer: coarse)",coarseNow=()=>window.matchMedia(COARSE).matches;
function watchPointer(change:()=>void){const media=window.matchMedia(COARSE);media.addEventListener("change",change);return()=>media.removeEventListener("change",change);}
// This component receives only complete geometry snapshots. Its scene, camera,
// controls and animation stay alive while the wrapper loads the next update.
function ReadyViewport(props:Props){
 const host=useRef<HTMLDivElement>(null),api=useRef<{update:(p:Props)=>void;camera:(view:string)=>void;pan:(horizontal:number,vertical:number)=>void;captureRegion:(polygon:RevisionRegion["polygon"])=>RegionCapture}|null>(null),latest=useRef(props);latest.current=props;const savedCamera=useRef<{key:string;position:THREE.Vector3;target:THREE.Vector3;length:number;width:number;framing:CameraFramingSnapshot;move:CameraMove|null;userMoved:boolean}|null>(null);
 const rendererRef=useRef<THREE.WebGLRenderer|null>(null);
 const previousFraming=useRef({view:props.view,reset:props.reset,explode:props.explode});
 const arrivalState=useRef({epoch:-1,clock:0,entries:new Map<string,Arrival>()});
 const [error,setError]=useState(false),[touchActive,setTouchActive]=useState(false);const coarsePointer=useSyncExternalStore(watchPointer,coarseNow,()=>false);const presentationProp=Boolean(props.presentation);const touchEnabled=useRef(touchActive);touchEnabled.current=touchActive;
 useEffect(()=>()=>{latest.current.onCanvas?.(null);const renderer=rendererRef.current;rendererRef.current=null;if(renderer)releaseFinishEnvironment(renderer);renderer?.dispose();renderer?.domElement.remove();},[]);
 useEffect(()=>{
  if(!host.current)return;const node=host.current;let renderer:THREE.WebGLRenderer;
  // The assembly plays inside the same interactive view: orbit stays enabled, and the
  // slow camera sweep (landing only) stops the moment the viewer takes the camera.
  // The slow camera sweep is read live so the stage can stop sweeping the moment the tools open.
  const cinematic=Boolean(props.assembly),sweeping=()=>Boolean(latest.current.assembly?.sweep),presentation=Boolean(props.presentation)||Boolean(props.arrivals),coarse=window.matchMedia("(pointer: coarse)").matches;let userMoved=false;
  try{renderer=rendererRef.current||new THREE.WebGLRenderer({antialias:true,alpha:!presentation});rendererRef.current=renderer;}catch{setError(true);return;}
  // Stage colours follow the theme's CSS variables and update when the theme changes.
  const themeColor=(name:string,fallback:string)=>new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback);
  const applyTheme=()=>{renderer.setClearColor(themeColor(presentation?"--stage-bg":"--canvas-bg",presentation?"#ffffff":"#eef2f4"),presentation?1:0);if(scene.fog instanceof THREE.FogExp2)scene.fog.color.copy(themeColor("--stage-bg","#ffffff"));hemi.groundColor.copy(themeColor("--stage-ground","#8794a2"));};
  setError(false);renderer.setPixelRatio(Math.min(window.devicePixelRatio,coarse?1.5:2));renderer.shadowMap.enabled=false;renderer.outputColorSpace=THREE.SRGBColorSpace;if(renderer.domElement.parentElement!==node){node.appendChild(renderer.domElement);latest.current.onCanvas?.(renderer.domElement);}
  renderer.domElement.setAttribute("aria-label","Interactive 3D brick model. Drag to orbit; right-drag or two-finger drag to pan; pinch or scroll to zoom. Arrow keys move the view; Home fits the model.");renderer.domElement.setAttribute("role","img");renderer.domElement.tabIndex=props.presentation?-1:0;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,1500),L=props.length,W=props.width??16,H=(props.height??43)*.4,centerX=L/2,centerZ=W/2;
  const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=true;controls.enableDamping=true;controls.enablePan=true;controls.screenSpacePanning=true;controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;controls.addEventListener("start",()=>{userMoved=true;cameraMove=null;});controls.dampingFactor=.07;controls.minDistance=18;controls.maxDistance=Math.max(L,W,H)*6;controls.maxPolarAngle=Math.PI*.49;controls.target.set(0,H*.44,0);controls.autoRotateSpeed=.6;
  const hemi=new THREE.HemisphereLight(0xffffff,0x8794a2,2.8);scene.add(hemi);const sun=new THREE.DirectionalLight(0xfff6e6,3.3);sun.position.set(-20,80,50);
  // The key light sits on an arc over the model, low on the left at 0, overhead at 0.5, low on
  // the right at 1, warming slightly as it drops. Keep this light steady during
  // assembly so the moving geometry stays readable.
  const sunNoon=new THREE.Color(0xfff6e6),sunLow=new THREE.Color(0xffb36b);
  const placeSun=(a:number)=>{const th=Math.max(.03,Math.min(.97,a))*Math.PI;sun.position.set(-Math.cos(th)*95,16+Math.sin(th)*84,48);const warmth=.55*Math.pow(1-Math.sin(th),1.6);sun.color.copy(sunNoon).lerp(sunLow,warmth);sun.intensity=2.8+.5*Math.sin(th);};sun.castShadow=false;sun.shadow.mapSize.set(coarse?1024:2048,coarse?1024:2048);sun.shadow.camera.left=-75;sun.shadow.camera.right=75;sun.shadow.camera.top=70;sun.shadow.camera.bottom=-70;sun.shadow.bias=-.0004;sun.shadow.normalBias=.06;scene.add(sun);
  const fill=new THREE.DirectionalLight(0xccdeff,2);fill.position.set(40,20,-40);scene.add(fill);
  // No cast shadows: the bricks are lit by highlights and the hemisphere fill alone, which keeps the surfaces clean.
  if(presentation){scene.fog=new THREE.FogExp2(0xffffff,.0018);}applyTheme();const themeWatch=new MutationObserver(applyTheme);themeWatch.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});if(presentation){const rim=new THREE.DirectionalLight(0xe5edff,1.5);rim.position.set(0,30,-50);scene.add(rim);const radius=Math.max(L,W,H)+20;sun.shadow.camera.left=-radius;sun.shadow.camera.right=radius;sun.shadow.camera.top=radius;sun.shadow.camera.bottom=-radius;sun.shadow.camera.updateProjectionMatrix();}
  // Exploded inspection reverses the assembly order with a compact spread.
  // Cinematic arrivals use separate paths beginning beyond the camera edges.
  const reach=inspectionReach(L,W,props.height??43),flightMax=reach.distance*1.4,backMax=reach.distance*1.4,liftMax=reach.lift*1.4+4;
  let arrivalEnd=0,tracks=new Map<number,AssemblyTrack>();
  const explodedTracks=inspectionTracks(props.pieces,L,W,props.height??43);
  const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
  const captureTracks=()=>{
   // Start beyond the destination frame while automatic fitting eases outward.
   const framingCamera=camera.clone(),target=cameraMove?.toTarget??controls.target;
   framingCamera.position.copy(cameraMove?.toPosition??camera.position);framingCamera.lookAt(target);framingCamera.updateMatrixWorld();
   const halfHeight=framingCamera.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
   const frame={center:target.clone(),right:new THREE.Vector3().setFromMatrixColumn(framingCamera.matrixWorld,0),up:new THREE.Vector3().setFromMatrixColumn(framingCamera.matrixWorld,1),halfWidth:halfHeight*camera.aspect,halfHeight};
   tracks=assemblyTracks(props.pieces,L,W,props.height??43,frame);
   if(props.arrivals){
    // Returning from Edit brief remounts the viewport around an existing model.
    // Seed that baseline as settled; only subsequent changes should dissolve.
    const seedRevision=arrivalState.current.epoch===-1&&props.arrivals.mode==="revise";
    if(arrivalState.current.epoch!==props.arrivals.epoch)arrivalState.current={epoch:props.arrivals.epoch,clock:0,entries:new Map()};
    arrivalState.current.entries=reconcileArrivals(arrivalState.current.entries,props.pieces,arrivalState.current.clock,L,W,props.height??43,frame,seedRevision?"still":props.arrivals.mode);
   }
   arrivalEnd=Math.max(0,...[...arrivalState.current.entries.values()].map(arrivalEndTime));
  };
  let cameraMove:CameraMove|null=null;
  const bounds=settledPieceBounds(props.pieces,L,W);
  let framing:CameraFramingSnapshot|null=null,initialized=false;
  const ensureCameraRange=(position:THREE.Vector3,target:THREE.Vector3)=>{
   const distance=Math.max(position.distanceTo(target),camera.position.distanceTo(controls.target));controls.maxDistance=Math.max(controls.maxDistance,distance*1.5);
   camera.far=Math.max(1500,controls.maxDistance+(bounds?bounds.max.distanceTo(bounds.min):Math.max(L,W,H))*2);camera.updateProjectionMatrix();
  };
  const moveCamera=(toPosition:THREE.Vector3,toTarget:THREE.Vector3,duration:number,manual=true)=>{
   if(manual)userMoved=true;ensureCameraRange(toPosition,toTarget);
   if(reducedMotion.matches){cameraMove=null;camera.position.copy(toPosition);controls.target.copy(toTarget);camera.lookAt(toTarget);controls.update();return;}
   cameraMove={position:camera.position.clone(),target:controls.target.clone(),toPosition,toTarget,start:performance.now(),duration};
  };
  const setCamera=(view:string)=>{
   const aspect=Math.max(.1,camera.aspect),vFov=THREE.MathUtils.degToRad(camera.fov),hFov=2*Math.atan(Math.tan(vFov/2)*aspect);
   const e=latest.current.explode;
   const min=bounds?.min.clone()??new THREE.Vector3(-L/2,0,-W/2),max=bounds?.max.clone()??new THREE.Vector3(L/2,H,W/2);
   min.sub(new THREE.Vector3(e*flightMax,0,e*backMax));max.add(new THREE.Vector3(e*flightMax,e*liftMax+1,e*backMax));
   const target=min.clone().add(max).multiplyScalar(.5);controls.target.copy(target);
   const direction=(view==="front"?new THREE.Vector3(0,.10,1):view==="top"?new THREE.Vector3(0,1,.001):new THREE.Vector3(.8,.72,1)).normalize();
   const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
   let distance=1;
   for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){const corner=new THREE.Vector3(x,y,z).sub(target);distance=Math.max(distance,corner.dot(direction)+Math.max(Math.abs(corner.dot(right))/Math.tan(hFov/2),Math.abs(corner.dot(up))/Math.tan(vFov/2)));}
   camera.position.copy(target).add(direction.multiplyScalar(Math.max(controls.minDistance,distance*1.22+3)));ensureCameraRange(camera.position,target);camera.lookAt(target);controls.update();
  };
  const autoFrame=()=>{
   if(!sweeping()&&latest.current.explode===0){
    const destination=camera.clone();destination.position.copy(cameraMove?.toPosition??camera.position);
    const fit=cameraAutoFit(destination,cameraMove?.toTarget??controls.target,bounds,framing);
    if(fit)moveCamera(fit.position,fit.target,420,false);
   }
   framing=cameraFramingSnapshot(bounds,camera.aspect);
  };
  const cinematicCamera=new THREE.Vector3();let cameraRevision=0;
  const resize=()=>{cameraRevision++;const w=node.clientWidth,h=node.clientHeight;renderer.setSize(w,h);camera.aspect=Math.max(.1,w/Math.max(h,1));camera.updateProjectionMatrix();if(sweeping()&&!userMoved){setCamera("perspective");camera.position.sub(controls.target).multiplyScalar(1.12).add(controls.target);cinematicCamera.copy(camera.position).sub(controls.target);}else if(initialized&&w&&h)autoFrame();};
  const observer=new ResizeObserver(resize);observer.observe(node);resize();
  const saved=savedCamera.current;
  if(saved?.key===(props.modelKey??"model")){
   // Declared dimensions change the scene's centered origin. Translate the camera
   // equally so existing bricks stay in place on screen as the build grows.
   const offset=new THREE.Vector3((saved.length-L)/2,0,(saved.width-W)/2);
   camera.position.copy(saved.position).add(offset);controls.target.copy(saved.target).add(offset);userMoved=saved.userMoved;
   framing=cameraFramingSnapshot(saved.framing.bounds,saved.framing.aspect);framing.bounds?.min.add(offset);framing.bounds?.max.add(offset);
   if(saved.move)cameraMove={...saved.move,position:saved.move.position.clone().add(offset),target:saved.move.target.clone().add(offset),toPosition:saved.move.toPosition.clone().add(offset),toTarget:saved.move.toTarget.clone().add(offset)};
   ensureCameraRange(cameraMove?.toPosition??camera.position,cameraMove?.toTarget??controls.target);controls.update();autoFrame();
  }else{setCamera(latest.current.view);framing=cameraFramingSnapshot(bounds,camera.aspect);}
  initialized=true;captureTracks();
  const fitCamera=(view:string)=>{const position=camera.position.clone(),target=controls.target.clone();setCamera(view);const toPosition=camera.position.clone(),toTarget=controls.target.clone();camera.position.copy(position);controls.target.copy(target);camera.lookAt(target);moveCamera(toPosition,toTarget,520);};
  const panCamera=(horizontal:number,vertical:number)=>{
   const toPosition=(cameraMove?.toPosition??camera.position).clone(),toTarget=(cameraMove?.toTarget??controls.target).clone();
   const offset=cameraPanOffset(camera,controls.target,horizontal,vertical);
   moveCamera(toPosition.add(offset),toTarget.add(offset),160);
  };
  // Revisions dissolve changed bricks at their final position. Stock MSAA
  // coverage avoids transparent-instance sorting; alpha hash is the fallback.
  const gl=renderer.getContext(),coverage=Boolean(gl.getContextAttributes()?.antialias)&&gl.getParameter(gl.SAMPLES)>1;
  const groups=new Map<string,{pieces:Piece[];arrival?:Arrival}>();
  for(const p of props.pieces){
   const entry=arrivalState.current.entries.get(brickIdentity(p));
   const arrival=props.arrivals?.mode==="revise"&&entry?.mode==="revise"&&arrivalState.current.clock<arrivalEndTime(entry)&&!reducedMotion.matches?entry:undefined;
   const k=`${p.part}:${p.color}:${p.legs||""}:${p.skin||""}:${fittedColor(p)||""}:${p.rotated}:${p.face||""}:${arrival?arrival.at:"solid"}`;
   const group=groups.get(k)||{pieces:[],arrival};group.pieces.push(p);groups.set(k,group);
  }
  const batches:{body:THREE.InstancedMesh;studs:THREE.InstancedMesh|null;hubs:THREE.InstancedMesh|null;fitted:THREE.InstancedMesh|null;pieces:Piece[];studded:[number,number][];arrival?:Arrival;materials:THREE.MeshStandardMaterial[]}[]=[],meshes:THREE.InstancedMesh[]=[];
  for(const {pieces:list,arrival} of groups.values()){
   const reveal={opacity:arrival?arrivalOpacity(arrival,arrivalState.current.clock,reducedMotion.matches):1,alphaToCoverage:Boolean(arrival)&&coverage,alphaHash:Boolean(arrival)&&!coverage};
   // One material per colour group, with the colour's finish. Trans colours already blend, so a
   // revision fade scales their opacity instead of using coverage.
   const p=list[0],material=brickMaterial(finishColor(p),{roughness:.3,vertexColors:isMinifig(p.part),environment:()=>finishEnvironment(renderer)}),materials=[material],studded=hasExactPartGeometry(p.part)?[]:studCells(p);
   if(material.transparent)material.opacity=material.userData.baseOpacity*reveal.opacity;else material.setValues(reveal);
   const body=new THREE.InstancedMesh(pieceGeometry(p),material,list.length);body.castShadow=true;body.receiveShadow=true;body.userData.pieces=list;meshes.push(body);scene.add(body);
   let studs:THREE.InstancedMesh|null=null;if(studded.length){studs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.30,.30,.18,12),material,list.length*studded.length);studs.castShadow=true;studs.receiveShadow=true;scene.add(studs);}
   const hubShape=hubGeometry(p);let hubs:THREE.InstancedMesh|null=null;if(hubShape){const hubMaterial=new THREE.MeshStandardMaterial({color:0xa9b1b8,roughness:.5,metalness:.1,...reveal});materials.push(hubMaterial);hubs=new THREE.InstancedMesh(hubShape,hubMaterial,list.length);scene.add(hubs);}
   // A frame's glass or door, in its own colour and finish, posed and picked with the frame.
   const fittedShape=fittedPartGeometry(p),glazing=fittedColor(p);let fitted:THREE.InstancedMesh|null=null;
   if(fittedShape&&glazing){const fittedMaterial=brickMaterial(glazing,{roughness:.3,environment:()=>finishEnvironment(renderer)});if(fittedMaterial.transparent)fittedMaterial.opacity=fittedMaterial.userData.baseOpacity*reveal.opacity;else fittedMaterial.setValues(reveal);materials.push(fittedMaterial);fitted=new THREE.InstancedMesh(fittedShape,fittedMaterial,list.length);fitted.castShadow=!fittedMaterial.transparent;fitted.receiveShadow=true;fitted.userData.pieces=list;meshes.push(fitted);scene.add(fitted);}
   if(presentation||cinematic){body.frustumCulled=false;body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(studs){studs.frustumCulled=false;studs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}if(hubs){hubs.frustumCulled=false;hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}if(fitted){fitted.frustumCulled=false;fitted.instanceMatrix.setUsage(THREE.DynamicDrawUsage);}}
   batches.push({body,studs,hubs,fitted,pieces:list,studded,arrival,materials});
  }
  const temp=new THREE.Object3D(),studLocal=new THREE.Matrix4(),studWorld=new THREE.Matrix4(),baseColor=new THREE.Color(),fittedTint=new THREE.Color(),dimColor=new THREE.Color("#c2cbd0");
  let previousAssemblyTime:number|undefined;
  const update=(state:Props,time?:number)=>{
   controls.enabled=!state.regionMode&&(!coarse||touchEnabled.current);renderer.domElement.style.touchAction=coarse&&!touchEnabled.current?"pan-y":"none";
   if(coarse&&time===undefined)renderer.domElement.setAttribute("aria-label",touchEnabled.current?"Interactive 3D model. Drag to rotate; pinch to zoom; use two fingers or the arrow buttons to move the view. Choose Done to scroll the page.":"3D model preview. Page scrolling is enabled. Choose Explore model to rotate, zoom or move the view.");
   controls.autoRotate=!state.regionMode&&state.rotate&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   const assemblyTime=time??state.assembly?.time()??1,animationOnly=time!==undefined,highlighted=new Set(state.highlightIds||[]);
   const sunTarget=state.light??.38;placeSun(sunTarget);
   const reusePoses=animationOnly&&cinematic&&!state.arrivals&&state.explode===0&&previousAssemblyTime!==undefined;
   const tint=(target:THREE.Color,hex:string,p:Piece,selected:boolean)=>{target.set(hex);if(state.heat){const r=state.heat.get(p.id);if(r===undefined)target.lerp(dimColor,.8);else target.set(r>1?"#e5484d":r>.5?"#f2b134":"#3f9d5a");}else if(highlighted.size){if(highlighted.has(p.id))target.set("#fb541e");else target.lerp(dimColor,.85);}else if(!selected)target.lerp(dimColor,.85);return target;};
   for(const batch of batches){if(batch.arrival){const opacity=state.regionMode?1:arrivalOpacity(batch.arrival,arrivalState.current.clock,reducedMotion.matches);for(const material of batch.materials)material.opacity=opacity*(material.userData.baseOpacity??1);}let studIndex=0,matrixChanged=!animationOnly;batch.pieces.forEach((p,i)=>{
    const visible=p.stage<=state.stage,key=`${p.part}:${p.color}`,glazing=fittedColor(p),selected=!state.selected||state.selected===key||Boolean(glazing)&&state.selected===`${fittedElement(p.part)!.part}:${glazing}`;
    const e=state.explode,y=p.y*.4,track=tracks.get(p.id)!;
    // Waiting and landed bricks have identical matrices; only active flights
    // need CPU transforms. Replay and reverse seeking still cross these bounds.
    if(reusePoses&&((assemblyTime<=track.start&&previousAssemblyTime!<=track.start)||(assemblyTime>=track.start+track.duration&&previousAssemblyTime!>=track.start+track.duration))){studIndex+=batch.studded.length;return;}
    matrixChanged=true;
    const entry=state.arrivals?arrivalState.current.entries.get(brickIdentity(p)):null;
    const px=p.x+p.w/2-L/2,py=y+p.h*.2,pz=p.z+p.d/2-centerZ;
    const pose=state.regionMode?null:entry?arrivalPose(entry,arrivalState.current.clock,reducedMotion.matches):e>0?assemblyPose(explodedTracks.get(p.id)!,1-e):cinematic?assemblyPose(track,assemblyTime):null;
    temp.position.set(px+(pose?.x??0),py+(pose?.y??0),pz+(pose?.z??0));temp.rotation.set(pose?.rx??0,pose?.ry??0,pose?.rz??0);temp.scale.setScalar(visible?(pose?.scale??1):0);temp.updateMatrix();batch.body.setMatrixAt(i,temp.matrix);
    if(!animationOnly){batch.body.setColorAt(i,tint(baseColor,isMinifig(p.part)?"#ffffff":COLORS[p.color].hex,p,selected));if(batch.fitted&&glazing)batch.fitted.setColorAt(i,tint(fittedTint,COLORS[glazing].hex,p,selected));}
    if(batch.hubs){batch.hubs.setMatrixAt(i,temp.matrix);}if(batch.fitted)batch.fitted.setMatrixAt(i,temp.matrix);
    if(batch.studs)for(const [x,z] of batch.studded){studLocal.makeTranslation(x+.5-p.w/2,p.h*.2+.07,z+.5-p.d/2);studWorld.multiplyMatrices(temp.matrix,studLocal);batch.studs.setMatrixAt(studIndex,studWorld);if(!animationOnly)batch.studs.setColorAt(studIndex,baseColor);studIndex++;}
   });batch.body.instanceMatrix.needsUpdate=matrixChanged;if(batch.hubs)batch.hubs.instanceMatrix.needsUpdate=matrixChanged;if(batch.fitted){batch.fitted.instanceMatrix.needsUpdate=matrixChanged;if(!animationOnly){if(batch.fitted.instanceColor)batch.fitted.instanceColor.needsUpdate=true;if(!presentation)batch.fitted.computeBoundingSphere();}}if(!animationOnly){if(batch.body.instanceColor)batch.body.instanceColor.needsUpdate=true;if(!presentation)batch.body.computeBoundingSphere();}if(batch.studs){batch.studs.instanceMatrix.needsUpdate=matrixChanged;if(!animationOnly){if(batch.studs.instanceColor)batch.studs.instanceColor.needsUpdate=true;if(!presentation)batch.studs.computeBoundingSphere();}}}
   previousAssemblyTime=cinematic&&!state.arrivals&&state.explode===0?assemblyTime:undefined;
  };
  update(latest.current);
  const captureRegion=(polygon:RevisionRegion["polygon"]):RegionCapture=>{
   // Read the WebGL framebuffer immediately after a render. The normal renderer
   // does not retain it between frames; a later toDataURL can otherwise be blank.
   update(latest.current);camera.updateMatrixWorld();scene.updateMatrixWorld(true);renderer.render(scene,camera);
   const source=renderer.domElement,canvas=document.createElement("canvas"),scale=Math.min(1,960/Math.max(source.width,source.height));
   canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
   const context=canvas.getContext("2d");if(!context)throw Error("No image canvas");
   context.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim()||"#eef2f4";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);
   context.beginPath();polygon.forEach((p,i)=>{if(i)context.lineTo(p.x*canvas.width,p.y*canvas.height);else context.moveTo(p.x*canvas.width,p.y*canvas.height);});context.closePath();context.fillStyle="#fb541e25";context.fill("evenodd");context.lineWidth=3;context.strokeStyle="#fb541e";context.stroke();
   // A bounded number of rays keeps large builds responsive. Only first visible
   // surface hits contribute advisory bounds; rear walls are never box-selected.
   for(const mesh of meshes)mesh.computeBoundingSphere();
   const selectionRay=new THREE.Raycaster(),selected=new Map<number,Piece>();
   for(const point of regionSamplePoints(polygon)){
    selectionRay.setFromCamera(new THREE.Vector2(point.x*2-1,1-point.y*2),camera);
    const hit=selectionRay.intersectObjects(meshes,false)[0];
    if(hit?.instanceId!==undefined){const piece=hit.object.userData.pieces[hit.instanceId] as Piece;selected.set(piece.id,piece);}
   }
   const bounds=regionBoundsForPieces([...selected.values()]);
   return {image:canvas.toDataURL("image/jpeg",.82),polygon:polygon.map(p=>({...p})),...(bounds?{bounds}:{})};
  };
  api.current={update,camera:fitCamera,pan:panCamera,captureRegion};
  const keyboard=(event:KeyboardEvent)=>{
   const direction=event.key==="ArrowUp"?[0,1]:event.key==="ArrowDown"?[0,-1]:event.key==="ArrowLeft"?[-1,0]:event.key==="ArrowRight"?[1,0]:null;
   if(direction){event.preventDefault();panCamera(direction[0],direction[1]);}else if(event.key==="Home"){event.preventDefault();fitCamera(latest.current.view);}
  };
  if(!props.presentation)renderer.domElement.addEventListener("keydown",keyboard);
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),activePointers=new Set<number>();let downX=0,downY=0,tapPointer:number|null=null;
  // While a phone scrolls the page, a plain tap still picks a part when the host asks for one (onPickPiece);
  // inspection selection and brick edits wait for Explore model.
  const touchLocked=()=>coarse&&!touchEnabled.current,tapBlocked=()=>touchLocked()&&!latest.current.onPickPiece;
  const down=(e:PointerEvent)=>{cameraMove=null;activePointers.add(e.pointerId);if(e.button!==0||activePointers.size>1||tapBlocked()){tapPointer=null;return;}tapPointer=e.pointerId;downX=e.clientX;downY=e.clientY;};
  const move=(e:PointerEvent)=>{if(tapPointer===e.pointerId&&Math.hypot(e.clientX-downX,e.clientY-downY)>(e.pointerType==="touch"?8:5))tapPointer=null;};
  const cancelPointer=(e:PointerEvent)=>{activePointers.delete(e.pointerId);tapPointer=null;};
  const pick=(e:PointerEvent)=>{const isTap=tapPointer===e.pointerId&&activePointers.size===1;activePointers.delete(e.pointerId);if(tapPointer===e.pointerId)tapPointer=null;if(!isTap||latest.current.regionMode||e.button!==0||tapBlocked()||Math.hypot(e.clientX-downX,e.clientY-downY)>(e.pointerType==="touch"?8:5))return;const locked=touchLocked(),rect=node.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(meshes)[0];if(hit&&hit.instanceId!==undefined){const p=hit.object.userData.pieces[hit.instanceId] as Piece;if(!locked&&latest.current.editMode&&latest.current.editMode!=="inspect"&&latest.current.onBrick){const n=hit.face?.normal??new THREE.Vector3(0,1,0);latest.current.onBrick({piece:p,point:{x:hit.point.x+centerX,y:hit.point.y/.4,z:hit.point.z+centerZ},normal:{x:n.x,y:n.y,z:n.z}});return;}latest.current.onPickPiece?.(String(p.id));if(locked)return;const key=`${p.part}:${p.color}`;latest.current.onPick(latest.current.selected===key?null:key);}else if(!locked)latest.current.onPick(null);};
  renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointermove",move);renderer.domElement.addEventListener("pointerup",pick);renderer.domElement.addEventListener("pointercancel",cancelPointer);
  const lost=(e:Event)=>{e.preventDefault();latest.current.onCanvas?.(null);setError(true);};renderer.domElement.addEventListener("webglcontextlost",lost);
  let inView=true;const visibility=new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;});visibility.observe(node);
  let raf=0,lastTime=-1,lastCameraRevision=-1,lastFrame=performance.now();const axis=new THREE.Vector3(0,1,0);const animate=()=>{raf=requestAnimationFrame(animate);const now=performance.now(),delta=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;if(inView&&node.clientWidth&&node.clientHeight&&!document.hidden&&!latest.current.suspended){if(latest.current.arrivals&&arrivalState.current.clock<=arrivalEnd){if(!latest.current.arrivals.paused)arrivalState.current.clock+=delta;update(latest.current,arrivalState.current.clock);}
if(latest.current.regionMode)cameraMove=null;
if(cameraMove&&advanceCameraMove(camera,controls.target,cameraMove,now,reducedMotion.matches))cameraMove=null;
const time=latest.current.assembly?.time();if(time!==undefined&&(time!==lastTime||cameraRevision!==lastCameraRevision)){if(time<lastTime){captureTracks();previousAssemblyTime=undefined;}update(latest.current,time);if(sweeping()&&!userMoved&&cinematicCamera.lengthSq()>0){camera.position.copy(cinematicCamera).applyAxisAngle(axis,(Math.min(time/.88,1)-1)*.16).multiplyScalar(1-.035*Math.min(time/.88,1)).add(controls.target);camera.lookAt(controls.target);}lastTime=time;lastCameraRevision=cameraRevision;}if(!latest.current.regionMode)controls.update();renderer.render(scene,camera);if(time!==undefined)latest.current.assembly?.onFrame?.(renderer.domElement,time);}};animate();
  return()=>{savedCamera.current={key:props.modelKey??"model",position:camera.position.clone(),target:controls.target.clone(),length:L,width:W,framing:framing!,move:cameraMove,userMoved};api.current=null;cancelAnimationFrame(raf);observer.disconnect();themeWatch.disconnect();visibility.disconnect();controls.dispose();renderer.domElement.removeEventListener("keydown",keyboard);renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointermove",move);renderer.domElement.removeEventListener("pointerup",pick);renderer.domElement.removeEventListener("pointercancel",cancelPointer);renderer.domElement.removeEventListener("webglcontextlost",lost);const materials=new Set<THREE.Material>();scene.traverse(obj=>{if(obj instanceof THREE.Mesh){obj.geometry.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>materials.add(m));else materials.add(obj.material);}});materials.forEach(m=>m.dispose());sun.shadow.map?.dispose();renderer.renderLists.dispose();};
 },[props.pieces,props.length,props.width,props.height,props.modelKey,props.arrivals?.epoch,props.arrivals?.mode]);
 useEffect(()=>{api.current?.update(props);},[props.explode,props.stage,props.selected,props.rotate,props.highlightIds,props.heat,props.light,props.regionMode,touchActive]);
 useEffect(()=>{const old=previousFraming.current;previousFraming.current={view:props.view,reset:props.reset,explode:props.explode};if(old.view!==props.view||old.reset!==props.reset||old.explode!==props.explode)api.current?.camera(props.view);},[props.view,props.reset,props.explode]);
 return <div className={"canvas-host "+(props.editMode&&props.editMode!=="inspect"?"is-editing":"")} data-touch-active={touchActive} data-region-mode={Boolean(props.regionMode)} ref={host}>{!presentationProp&&!error&&!props.regionMode&&<>
  {/* Fit is always shown; the arrow pad appears for keyboard users (focus on the model or the pad). */}
  <div className="camera-navigation" role="group" aria-label="Move the camera">
   <span className="camera-pad-label">Move view</span><div>
    <span className="camera-pad">
     <button type="button" className="camera-pan" title="Move view left" aria-label="Move view left" onClick={()=>api.current?.pan(-1,0)}><ArrowLeft size={18}/></button>
     <button type="button" className="camera-pan" title="Move view up" aria-label="Move view up" onClick={()=>api.current?.pan(0,1)}><ArrowUp size={18}/></button>
     <button type="button" className="camera-pan" title="Move view down" aria-label="Move view down" onClick={()=>api.current?.pan(0,-1)}><ArrowDown size={18}/></button>
     <button type="button" className="camera-pan" title="Move view right" aria-label="Move view right" onClick={()=>api.current?.pan(1,0)}><ArrowRight size={18}/></button>
    </span>
    <button type="button" className="camera-fit" title="Fit the whole model in view" aria-label="Fit the whole model in view" onClick={()=>api.current?.camera(latest.current.view)}><Scan size={18}/><span>Fit</span></button>
   </div><small className="camera-gesture-hint">{coarsePointer?touchActive?"Drag to rotate · Pinch to zoom · Two fingers to move":"Tap Explore model to rotate and zoom":"Right-drag to pan · Scroll to zoom"}</small>
  </div>
  <button type="button" className="touch-model-toggle" aria-pressed={touchActive} aria-label={touchActive?"Done exploring model. Enable page scrolling":"Explore model. Enable touch rotation, zoom and movement"} onClick={()=>setTouchActive(v=>!v)}>{touchActive?"Done":"Explore model"}</button>
 </>}{props.regionMode&&!error&&<RegionMarker onSelect={polygon=>{if(!api.current)throw Error("Preview is not ready");props.onRegion?.(api.current.captureRegion(polygon));}} onCancel={()=>props.onCancelRegion?.()}/>} {error&&<div className="canvas-error"><strong>3D preview is unavailable in this browser.</strong><p>The parts list and downloads still work. Try opening the studio in Safari or Chrome with WebGL enabled.</p></div>}</div>;
}
