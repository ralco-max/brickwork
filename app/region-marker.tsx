"use client";
import {useEffect,useRef,useState} from "react";
import {Check,X} from "lucide-react";
import {cleanRegionPolygon,normalizedScreenPoint} from "@/lib/region-selection";

type Point={x:number;y:number};
type Props={onSelect:(polygon:Point[])=>void;onCancel:()=>void};
const centered=[{x:.3,y:.3},{x:.7,y:.3},{x:.7,y:.7},{x:.3,y:.7}];

// This overlay owns pointer events only while marking. Orbit and pan remain
// ordinary viewport interactions as soon as the selection is attached.
export default function RegionMarker({onSelect,onCancel}:Props){
 const svg=useRef<SVGSVGElement>(null),drawing=useRef<Point[]>([]),pointer=useRef<number|null>(null);
 const [points,setPoints]=useState<Point[]>([]),[message,setMessage]=useState("");
 useEffect(()=>{svg.current?.focus({preventScroll:true});},[]);
 const select=(raw:Point[])=>{const polygon=cleanRegionPolygon(raw);if(polygon.length<3){setMessage("Draw a larger loop around the area you want to change.");setPoints([]);return;}try{onSelect(polygon);}catch{setMessage("The marked view couldn’t be captured. Please try again.");}};
 const at=(e:React.PointerEvent<SVGSVGElement>)=>normalizedScreenPoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect())||{x:.5,y:.5};
 return <div className="region-marker">
  <svg ref={svg} viewBox="0 0 1000 1000" preserveAspectRatio="none" tabIndex={0} role="group" aria-label="Mark an area to edit. Draw a loop, or use arrow keys to move a selection, Shift and arrows to resize, and Enter to attach it. Escape cancels."
   onKeyDown={e=>{
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onCancel();return;}
    if(e.key==="Enter"){e.preventDefault();select(points.length?points:centered);return;}
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
    e.preventDefault();const current=points.length?points:centered,minX=Math.min(...current.map(p=>p.x)),maxX=Math.max(...current.map(p=>p.x)),minY=Math.min(...current.map(p=>p.y)),maxY=Math.max(...current.map(p=>p.y));
    let left=minX,right=maxX,top=minY,bottom=maxY;const dx=e.key==="ArrowLeft"?-.025:e.key==="ArrowRight"?.025:0,dy=e.key==="ArrowUp"?-.025:e.key==="ArrowDown"?.025:0;
    if(e.shiftKey){right=Math.max(left+.05,Math.min(1,right+dx));bottom=Math.max(top+.05,Math.min(1,bottom+dy));}else{const x=Math.max(-left,Math.min(1-right,dx)),y=Math.max(-top,Math.min(1-bottom,dy));left+=x;right+=x;top+=y;bottom+=y;}
    setPoints([{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]);setMessage("Arrow keys move the area. Shift + arrows resize. Enter attaches it.");
   }}
   onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=[at(e)];setPoints(drawing.current);setMessage("");}}
   onPointerMove={e=>{if(pointer.current!==e.pointerId)return;const p=at(e),last=drawing.current.at(-1)!;if(Math.hypot(p.x-last.x,p.y-last.y)<.003)return;drawing.current=[...drawing.current,p];if(drawing.current.length>1024)drawing.current=drawing.current.filter((_,i)=>i%2===0);setPoints(drawing.current);}}
   onPointerUp={e=>{if(pointer.current!==e.pointerId)return;pointer.current=null;e.currentTarget.releasePointerCapture(e.pointerId);const raw=[...drawing.current,at(e)];drawing.current=[];select(raw);}}
   onPointerCancel={()=>{pointer.current=null;drawing.current=[];setPoints([]);}}
  >{points.length>1&&<polygon points={points.map(p=>`${p.x*1000},${p.y*1000}`).join(" ")} fill="#fb541e24" fillRule="evenodd" stroke="#fb541e" strokeWidth="3" vectorEffect="non-scaling-stroke"/>}</svg>
  <div className="region-marker-help"><strong>Draw around the area to change</strong><span role="status">{message||"Drag a loop with your mouse or finger. You can include empty space for additions."}</span><div><button type="button" onClick={()=>select(points.length?points:centered)}><Check size={16}/>{points.length?"Use marked area":"Use center area"}</button><button type="button" onClick={onCancel}><X size={16}/>Cancel</button></div></div>
 </div>;
}
