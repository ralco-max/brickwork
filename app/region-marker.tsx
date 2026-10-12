"use client";
import {useEffect,useRef,useState} from "react";
import {Check,RotateCcw,X} from "lucide-react";
import {cleanRegionPolygon,normalizedScreenPoint} from "@/lib/region-selection";

type Point={x:number;y:number};
type Props={onSelect:(polygon:Point[])=>void;onCancel:()=>void};
const centered=[{x:.3,y:.3},{x:.7,y:.3},{x:.7,y:.7},{x:.3,y:.7}];

// This overlay owns pointer events only while marking. Orbit and pan remain
// ordinary viewport interactions as soon as the selection is attached.
export default function RegionMarker({onSelect,onCancel}:Props){
 const svg=useRef<SVGSVGElement>(null),drawing=useRef<Point[]>([]),previousPoints=useRef<Point[]>([]),pointer=useRef<number|null>(null);
 const [points,setPoints]=useState<Point[]>([]),[message,setMessage]=useState(""),[isDrawing,setIsDrawing]=useState(false);
 useEffect(()=>{svg.current?.focus({preventScroll:true});},[]);
 const select=(raw:Point[])=>{const polygon=cleanRegionPolygon(raw);if(polygon.length<3){setMessage("Draw a larger loop around the area you want to change.");setPoints([]);return;}try{onSelect(polygon);}catch{setMessage("The marked view couldn’t be captured. Please try again.");}};
 const at=(e:React.PointerEvent<SVGSVGElement>)=>normalizedScreenPoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect());
 const release=(element:SVGSVGElement,id:number)=>{if(element.hasPointerCapture(id))element.releasePointerCapture(id);};
 const cancelStroke=()=>{const id=pointer.current;pointer.current=null;drawing.current=[];setIsDrawing(false);setPoints(previousPoints.current);if(id!==null&&svg.current)release(svg.current,id);};
 const marked=points.length>=3&&!isDrawing;
 return <div className={"region-marker"+(isDrawing?" is-drawing":"")+(marked?" has-selection":"")} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onCancel();}}}>
  <svg ref={svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" tabIndex={0} role="group" aria-label="Mark an area to edit. Draw a loop, then choose Use marked area. Arrow keys move a selection, Shift and arrows resize, and Enter attaches it. Escape cancels."
   onKeyDown={e=>{
    if(e.key==="Enter"){e.preventDefault();select(points.length?points:centered);return;}
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
    e.preventDefault();const current=points.length?points:centered,minX=Math.min(...current.map(p=>p.x)),maxX=Math.max(...current.map(p=>p.x)),minY=Math.min(...current.map(p=>p.y)),maxY=Math.max(...current.map(p=>p.y));
    let left=minX,right=maxX,top=minY,bottom=maxY;const dx=e.key==="ArrowLeft"?-.025:e.key==="ArrowRight"?.025:0,dy=e.key==="ArrowUp"?-.025:e.key==="ArrowDown"?.025:0;
    if(e.shiftKey){right=Math.max(left+.05,Math.min(1,right+dx));bottom=Math.max(top+.05,Math.min(1,bottom+dy));}else{const x=Math.max(-left,Math.min(1-right,dx)),y=Math.max(-top,Math.min(1-bottom,dy));left+=x;right+=x;top+=y;bottom+=y;}
    setPoints([{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]);setMessage("Arrow keys move the area. Shift + arrows resize. Enter attaches it.");
   }}
   onPointerDown={e=>{
    if(e.button!==0)return;e.preventDefault();
    if(pointer.current!==null){if(pointer.current!==e.pointerId){cancelStroke();setMessage("Use one finger to draw. Cancel marking to move the model.");}return;}
    if(e.pointerType==="touch"&&!e.isPrimary)return;const point=at(e);if(!point)return;
    previousPoints.current=points;pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=[point];setPoints(drawing.current);setIsDrawing(true);setMessage("");
   }}
   onPointerMove={e=>{
    if(pointer.current!==e.pointerId)return;e.preventDefault();const rect=e.currentTarget.getBoundingClientRect(),events=e.nativeEvent.getCoalescedEvents?.()||[e.nativeEvent];
    let changed=false;for(const event of events.length?events:[e.nativeEvent]){const p=normalizedScreenPoint(event.clientX,event.clientY,rect),last=drawing.current.at(-1);if(!p||last&&Math.hypot(p.x-last.x,p.y-last.y)<.003)continue;drawing.current.push(p);changed=true;}
    if(drawing.current.length>1024)drawing.current=drawing.current.filter((_,i)=>i%2===0);if(changed)setPoints([...drawing.current]);
   }}
   onPointerUp={e=>{
    if(pointer.current!==e.pointerId)return;e.preventDefault();const point=at(e),raw=point?[...drawing.current,point]:drawing.current;pointer.current=null;drawing.current=[];setIsDrawing(false);release(e.currentTarget,e.pointerId);
    const polygon=cleanRegionPolygon(raw);if(polygon.length<3){setPoints(previousPoints.current);setMessage("Draw a larger loop around the area you want to change.");return;}
    setPoints(polygon);setMessage("Choose Use marked area, or draw a new loop.");
   }}
   onPointerCancel={e=>{if(pointer.current===e.pointerId){cancelStroke();setMessage("Drawing canceled. Try again with one finger.");}}}
   onLostPointerCapture={e=>{if(pointer.current===e.pointerId)cancelStroke();}}
  >{points.length>1&&<polygon points={points.map(p=>`${p.x*1000},${p.y*1000}`).join(" ")} fill="#fb541e24" fillRule="evenodd" stroke="#fb541e" strokeWidth="3" vectorEffect="non-scaling-stroke"/>}</svg>
  <div className="region-marker-help"><strong>{marked?"Review your marked area":"Draw around the area to change"}</strong><span className="region-marker-status" role="status">{isDrawing?"Release to preview your area.":message||"Draw one loop. Empty space can be included for additions."}</span><div className="region-marker-actions"><button type="button" disabled={isDrawing} onClick={()=>select(marked?points:centered)}><Check size={16}/>{marked?"Use marked area":"Use center area"}</button>{marked&&<button type="button" className="region-marker-redraw" onClick={()=>{setPoints([]);setMessage("");svg.current?.focus({preventScroll:true});}}><RotateCcw size={16}/>Redraw</button>}<button type="button" onClick={onCancel}><X size={16}/>Cancel</button></div></div>
 </div>;
}
