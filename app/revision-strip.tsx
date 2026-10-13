"use client";
import {RotateCcw} from "lucide-react";

export type StripVersion={n:number;label:string;pieces:number};
type Props={versions:readonly StripVersion[];current:number|null;peek:number|null;changes:boolean;previous?:number;onPeek:(n:number|null,changes:boolean)=>void;onRestore:(n:number)=>void;disabled?:boolean};

/**
 * v1…vN under the preview. Picking a version shows it in place (changed bricks highlighted) with Restore, which only
 * recompiles the kept version: no AI call, $0. Before/After flips between this version and the one before it.
 */
export default function RevisionStrip({versions,current,peek,changes,previous,onPeek,onRestore,disabled=false}:Props){
 if(versions.length<2)return null;
 const shown=peek!==null&&peek!==current?versions.find(v=>v.n===peek):undefined,before=changes&&previous!==undefined&&peek===previous,after=changes&&peek===null;
 return <div className="revision-strip">
  <div className="revision-strip-row">
   <span className="revision-strip-title" id="revision-strip-title">Versions</span>
   <ol className="revision-versions" aria-labelledby="revision-strip-title">{versions.map(v=><li key={v.n}><button type="button" aria-current={v.n===current?"true":undefined} aria-pressed={v.n===(peek??current)} title={`v${v.n} · ${v.label} · ${v.pieces.toLocaleString()} pieces`} aria-label={`Version ${v.n}${v.n===current?" (current)":""}: ${v.label}`} disabled={disabled} onClick={()=>onPeek(v.n===current?null:v.n,v.n!==current)}>v{v.n}</button></li>)}</ol>
   {previous!==undefined&&<div className="before-after" role="group" aria-label={`Compare with v${previous}`}><button type="button" aria-pressed={before} disabled={disabled} onClick={()=>onPeek(before?null:previous,!before)}>Before</button><button type="button" aria-pressed={after} disabled={disabled} onClick={()=>onPeek(null,!after)}>After</button></div>}
  </div>
  {shown?<div className="revision-peek" role="status"><p><strong>v{shown.n}</strong> {shown.label}<span> · {shown.pieces.toLocaleString()} pieces · changes highlighted</span></p><div><button type="button" className="button primary" disabled={disabled} onClick={()=>onRestore(shown.n)}><RotateCcw size={14} aria-hidden/>Restore v{shown.n} · $0</button><button type="button" className="button secondary" onClick={()=>onPeek(null,false)}>Back to v{current}</button></div></div>
  :after?<p className="revision-compare-note" role="status">v{current}: bricks that changed since v{previous} are highlighted.</p>:null}
 </div>;
}
