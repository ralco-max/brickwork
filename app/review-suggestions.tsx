"use client";
import {useState} from "react";
import {Check,ChevronDown,Plus} from "lucide-react";
import type {Suggestion} from "@/lib/feedback-suggestions";

type Props={suggestions:readonly Suggestion[];looksRight:readonly string[];approved:readonly string[];onToggle:(text:string)=>void;disabled?:boolean};
const SHOWN=5;

/**
 * What the review found, as chips above the composer. Nothing is sent until a chip is ticked; ticked chips are the
 * pass's approved items, and with an empty composer the send button reads "Apply N fixes".
 */
export default function ReviewSuggestions({suggestions,looksRight,approved,onToggle,disabled=false}:Props){
 const [all,setAll]=useState(false);
 if(!suggestions.length&&!looksRight.length)return null;
 const ticked=suggestions.filter(s=>approved.includes(s.text)).length,list=all?suggestions:suggestions.filter((s,i)=>i<SHOWN||approved.includes(s.text)),hidden=suggestions.length-list.length;
 return <section className="review-suggestions" aria-labelledby="review-suggestions-title">
  <div className="review-suggestions-head"><h3 id="review-suggestions-title">{suggestions.length?"Suggested fixes":"Review"}</h3>{suggestions.length>0&&<span aria-live="polite">{ticked?`${ticked} ticked`:"Tick any to apply"}</span>}</div>
  {looksRight.length>0&&<p className="review-looks-right"><Check size={14} aria-hidden/><span><strong>Looks right:</strong> {looksRight.join(" · ")}</span></p>}
  {list.length>0&&<div className="review-chips" role="group" aria-label="Suggested fixes">{list.map(s=>{const on=approved.includes(s.text);return <button key={s.id} type="button" className={`review-chip is-${s.kind}`} aria-pressed={on} disabled={disabled} title={s.text} onClick={()=>onToggle(s.text)}>
   <span className="review-chip-box" aria-hidden>{on?<Check size={13}/>:<Plus size={13}/>}</span><span className="review-chip-tag">{s.tag}</span><span className="review-chip-label">{s.label}{s.kind==="simplified"&&<em> — Improve</em>}</span>
  </button>;})}</div>}
  {(hidden>0||all)&&suggestions.length>SHOWN&&<button type="button" className="review-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?"Show fewer":`Show ${hidden} more`}<ChevronDown size={14} aria-hidden/></button>}
 </section>;
}
