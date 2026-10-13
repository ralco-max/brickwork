"use client";
import type {ReactNode} from "react";
import {ArrowRight,Check,CircleAlert,CircleQuestionMark,Wrench} from "lucide-react";
import type {VisualReview} from "@/lib/design-project";

// typed: the request is the owner's own words (quoted); otherwise it is a plain label for a pass started without words.
type Props={pieces:number;size:string;request?:string;typed?:boolean;revision?:VisualReview["revision"];changes?:string;repairNote?:string;corrections?:readonly string[];interrupted?:boolean;onContinue?:()=>void;continueDisabled?:boolean;children?:ReactNode};
const STATE={visible:{label:"Visible",Icon:Check},missing:{label:"Not visible yet",Icon:CircleAlert},uncertain:{label:"Hard to tell",Icon:CircleQuestionMark}} as const;

/**
 * Under the preview: what the last pass was asked for and whether the review could see it, which components changed
 * against the previous version, and what was fixed automatically. Details (checks, notes, rating) come in as children.
 */
export default function RevisionResult({pieces,size,request,typed=false,revision,changes,repairNote,corrections=[],interrupted=false,onContinue,continueDisabled=false,children}:Props){
 const state=revision&&revision.status!=="not_requested"?STATE[revision.status]:null;
 return <section className="revision-result" aria-label="Latest result">
  <div className="revision-result-head"><strong>{pieces.toLocaleString()} pieces</strong><span>{size}</span></div>
  {interrupted&&<div className="revision-unfinished"><p>Unfinished draft. Continue building before it is reviewed.</p>{onContinue&&<button type="button" className="button secondary" disabled={continueDisabled} onClick={onContinue}><ArrowRight size={15}/>Continue design</button>}</div>}
  {request&&<div className={`revision-request${state?` is-${revision!.status}`:""}`}><p><span>{typed?"Your change":"Last pass"}</span>{typed?`“${request}”`:request}</p>{state&&<span className="revision-state"><state.Icon size={13} aria-hidden/>{state.label}</span>}{state&&revision!.status!=="visible"&&revision!.evidence&&<small>{revision!.evidence}</small>}</div>}
  {changes&&<p className="revision-changes">{changes}</p>}
  {repairNote&&<p className="revision-note"><Wrench size={14} aria-hidden/>{repairNote}</p>}
  {corrections.length>0&&<details className="revision-corrections"><summary>Fixed automatically ({corrections.length})</summary><ul>{corrections.map((c,i)=><li key={i}>{c}</li>)}</ul></details>}
  {children}
 </section>;
}
