"use client";
import {useId,useState} from "react";
import {Check,LoaderCircle,ThumbsDown,ThumbsUp} from "lucide-react";
import "./gallery/community.css";

export type BuildVerdict="good"|"needs_work";
export const RATING_REASONS=["Wrong shape","Wrong colors","Missing details","Falls apart","Other"] as const;
export type RatingReason=typeof RATING_REASONS[number];
/**
 * What the rated build was, as /api/feedback accepts it. Never the prompt, photos or share link. receipts: the signed
 * receipts of the run's paid calls; the server takes the model, tier and cost from them, not from model and costUsd.
 */
export type RatedBuild={subjectKind?:string;pieceCount?:number;model?:string;costUsd?:number;receipts?:readonly string[]};

/** The request body: chosen reasons in a fixed order, then the optional note after "Other", clipped to 280 characters. */
export function feedbackBody(verdict:BuildVerdict,reasons:readonly RatingReason[]=[],note="",build:RatedBuild={}){
 const chosen=RATING_REASONS.filter(r=>reasons.includes(r)),extra=note.replace(/\s+/g," ").trim();
 const reason=verdict==="needs_work"?[...chosen.filter(r=>r!=="Other"||!extra),...(chosen.includes("Other")&&extra?[`Other: ${extra}`]:[])].join(", ").slice(0,280):"";
 const pieceCount=Number.isInteger(build.pieceCount)&&build.pieceCount!>=0?build.pieceCount:undefined,costUsd=Number.isFinite(build.costUsd)&&build.costUsd!>=0?Math.round(build.costUsd!*10_000)/10_000:undefined;
 const receipts=(build.receipts||[]).filter(r=>typeof r==="string"&&r.length>0&&r.length<=600).slice(-12);
 return {verdict,...(reason?{reason}:{}),...(build.subjectKind?{subjectKind:build.subjectKind}:{}),...(pieceCount!==undefined?{pieceCount}:{}),...(build.model?{model:build.model}:{}),...(costUsd!==undefined?{costUsd}:{}),...(receipts.length?{receipts}:{})};
}

export async function sendBuildFeedback(body:ReturnType<typeof feedbackBody>,fetcher:typeof fetch=fetch){
 const response=await fetcher("/api/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 // Too many ratings this hour still thanks the person; the ones already sent count.
 if(!response.ok&&response.status!==429)throw Error((await response.json().catch(()=>({})) as {error?:string}).error||"Your rating couldn’t be sent.");
}

/**
 * "How did this build turn out?" A free, one-tap rating for a finished build. Looks right sends
 * at once; Needs work opens optional reason chips (and a short note for Other) and a Send button.
 * Mount it with a key per build so a new build asks again.
 */
export default function BuildRating({build={},className="",onRated}:{build?:RatedBuild;className?:string;onRated?:(verdict:BuildVerdict)=>void}){
 const id=useId(),[why,setWhy]=useState(false),[sending,setSending]=useState<BuildVerdict|null>(null),[done,setDone]=useState(false),[reasons,setReasons]=useState<RatingReason[]>([]),[note,setNote]=useState(""),[error,setError]=useState("");
 const send=async(verdict:BuildVerdict)=>{
  setSending(verdict);setError("");
  try{await sendBuildFeedback(feedbackBody(verdict,reasons,note,build));setDone(true);onRated?.(verdict);}
  catch(e){setError(e instanceof Error?e.message:"Your rating couldn’t be sent.");}
  finally{setSending(null);}
 };
 const toggle=(reason:RatingReason)=>setReasons(list=>list.includes(reason)?list.filter(r=>r!==reason):[...list,reason]);
 if(done)return <div className={`build-rating is-done ${className}`} role="status"><Check size={16}/><span>Thanks — that helps make the next build better.</span></div>;
 return <section className={`build-rating ${className}`} aria-labelledby={`${id}-title`}>
  <div className="build-rating-ask">
   <h3 id={`${id}-title`}>How did this build turn out?</h3>
   <div className="build-rating-verdicts">
    <button type="button" className="button secondary" disabled={sending!==null} onClick={()=>void send("good")}>{sending==="good"?<LoaderCircle className="spin" size={15}/>:<ThumbsUp size={15}/>}Looks right</button>
    <button type="button" className="button secondary" aria-expanded={why} aria-controls={`${id}-why`} disabled={sending!==null} onClick={()=>setWhy(v=>!v)}><ThumbsDown size={15}/>Needs work</button>
   </div>
  </div>
  {why&&<div className="build-rating-why" id={`${id}-why`}>
   <div className="build-rating-chips" role="group" aria-label="What was off? (optional)">{RATING_REASONS.map(reason=><button key={reason} type="button" className="build-rating-chip" aria-pressed={reasons.includes(reason)} onClick={()=>toggle(reason)}>{reason}</button>)}</div>
   {reasons.includes("Other")&&<input className="build-rating-note" value={note} maxLength={200} onChange={e=>setNote(e.target.value)} placeholder="What was off? (optional)" aria-label="What was off? (optional)"/>}
   <button type="button" className="button primary build-rating-send" disabled={sending!==null} onClick={()=>void send("needs_work")}>{sending==="needs_work"?<LoaderCircle className="spin" size={15}/>:null}Send</button>
  </div>}
  {error&&<p className="build-rating-error" role="alert">{error}</p>}
 </section>;
}
