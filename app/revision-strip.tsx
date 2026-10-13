"use client";
import {useRef} from "react";
import {Highlighter,RotateCcw} from "lucide-react";

export type StripVersion={n:number;label:string;pieces:number};
// compare: Before/After is in use. tint: changed bricks are recolored; off by default, so every version shows its true colors.
type Props={versions:readonly StripVersion[];current:number|null;peek:number|null;compare:boolean;tint:boolean;previous?:number;onPeek:(n:number|null,compare:boolean)=>void;onTint:(on:boolean)=>void;onRestore:(n:number)=>void|Promise<void>;disabled?:boolean};

/**
 * v1…vN under the preview. Picking a version shows it in place, in its own colors, with Restore, which only recompiles
 * the kept version: no AI call, $0. Before/After flips between this version and the one before it; Highlight changes
 * tints what differs. With no current version (an unfinished draft is shown), every kept version can be restored.
 */
export default function RevisionStrip({versions,current,peek,compare,tint,previous,onPeek,onTint,onRestore,disabled=false}:Props){
 const root=useRef<HTMLDivElement>(null);
 // Restore and Back remove the peek card that holds focus: focus first moves to the chip of the version that will show.
 const focusChip=(n:number|null)=>{const chips=[...root.current?.querySelectorAll<HTMLElement>(".revision-versions button")||[]];(chips[versions.findIndex(v=>v.n===n)]||chips[0])?.focus();};
 if(versions.length<2&&!(versions.length===1&&current===null))return null;
 const shown=peek!==null&&peek!==current?versions.find(v=>v.n===peek):undefined,before=compare&&previous!==undefined&&peek===previous,after=compare&&peek===null;
 const canTint=Boolean(shown&&current!==null)||(peek===null&&previous!==undefined);
 return <div className="revision-strip" ref={root}>
  <div className="revision-strip-row">
   <span className="revision-strip-title" id="revision-strip-title">Versions</span>
   <ol className="revision-versions" aria-labelledby="revision-strip-title">{versions.map(v=><li key={v.n}><button type="button" aria-current={v.n===current?"true":undefined} aria-pressed={v.n===(peek??current)} title={`v${v.n} · ${v.label} · ${v.pieces.toLocaleString()} pieces`} aria-label={`v${v.n}${v.n===current?" (current)":""}: ${v.label}`} disabled={disabled} onClick={()=>onPeek(v.n===current?null:v.n,false)}>v{v.n}</button></li>)}</ol>
   {(previous!==undefined||canTint)&&<div className="revision-strip-tools">
    {previous!==undefined&&<div className="before-after" role="group" aria-label={`Compare v${current} with v${previous}`}><button type="button" aria-pressed={before} disabled={disabled} onClick={()=>onPeek(before?null:previous,!before)}>Before</button><button type="button" aria-pressed={after} disabled={disabled} onClick={()=>onPeek(null,!after)}>After</button></div>}
    {canTint&&<button type="button" className="revision-tint" aria-pressed={tint} disabled={disabled} onClick={()=>onTint(!tint)}><Highlighter size={14} aria-hidden/>Highlight changes</button>}
   </div>}
  </div>
  {shown?<div className="revision-peek" role="status"><p><strong>v{shown.n}</strong> {shown.label}<span> · {shown.pieces.toLocaleString()} pieces{tint&&current!==null?` · changes from v${current} highlighted`:""}</span></p><div><button type="button" className="button primary" disabled={disabled} onClick={()=>{focusChip(shown.n);void onRestore(shown.n);}}><RotateCcw size={14} aria-hidden/>Restore v{shown.n} · $0</button><button type="button" className="button secondary" onClick={()=>{focusChip(current);onPeek(null,false);}}>{current!==null?`Back to v${current}`:"Back to the draft"}</button></div></div>
  :after?<p className="revision-compare-note" role="status">{tint?`v${current}: bricks changed since v${previous} are highlighted.`:`Showing v${current}, the current version.`}</p>:null}
 </div>;
}
