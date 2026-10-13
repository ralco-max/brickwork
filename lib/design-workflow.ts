import type {VisualReview,FeatureStatus,designChecks} from "./design-project";

// The paid path has one reference lookup, one design and one review, plus at most one automatic repair.
// Compilation is local. A failed lookup/design stops subsequent paid work;
// a failed review preserves the completed candidate for an explicit retry.
// The repair runs only when repair.plan names material failures (the caller gates it on first builds, explicit
// retries, budget and the owner's setting); its design, compile and re-review replace the candidate only when
// repair.keep says the objective measures improved. A failed repair keeps the reviewed original.
export type RepairOutcome={reasons:string[];kept:boolean;fixed:number;error?:unknown};
export async function runDesignWorkflow<Reference, Scene, Model, Review>(steps:{
 reference?:Reference;
 lookup:()=>Promise<Reference>;
 design:(reference:Reference)=>Promise<Scene>;
 compile:(scene:Scene,reference:Reference)=>Promise<Model>;
 review:(model:Model,scene:Scene,reference:Reference)=>Promise<Review>;
 repair?:{
  plan:(model:Model,scene:Scene,review:Review,reference:Reference)=>string[];
  design:(reasons:string[],model:Model,scene:Scene,review:Review,reference:Reference)=>Promise<Scene>;
  compile:(scene:Scene,reference:Reference)=>Promise<Model>;
  review:(model:Model,scene:Scene,reference:Reference,reasons:string[])=>Promise<Review>;
  keep:(before:{model:Model;scene:Scene;review:Review},after:{model:Model;scene:Scene;review:Review})=>{keep:boolean;fixed:number};
 };
 signal:AbortSignal;
}){
 const alive=()=>steps.signal.throwIfAborted();
 alive();const reference=steps.reference??await steps.lookup();alive();
 const scene=await steps.design(reference);alive();
 const model=await steps.compile(scene,reference);alive();
 let review:Review;
 try{review=await steps.review(model,scene,reference);alive();}
 catch(reviewError){alive();return {reference,scene,model,review:null,reviewError,repair:undefined};}
 const reasons=steps.repair?steps.repair.plan(model,scene,review,reference):[];
 if(!steps.repair||!reasons.length)return {reference,scene,model,review,reviewError:undefined,repair:undefined};
 try{
  const nextScene=await steps.repair.design(reasons,model,scene,review,reference);alive();
  const nextModel=await steps.repair.compile(nextScene,reference);alive();
  const nextReview=await steps.repair.review(nextModel,nextScene,reference,reasons);alive();
  const verdict=steps.repair.keep({model,scene,review},{model:nextModel,scene:nextScene,review:nextReview});
  const repair:RepairOutcome={reasons,kept:verdict.keep,fixed:verdict.keep?verdict.fixed:0};
  return verdict.keep?{reference,scene:nextScene,model:nextModel,review:nextReview,reviewError:undefined,repair}:{reference,scene,model,review,reviewError:undefined,repair};
 }catch(error){alive();return {reference,scene,model,review,reviewError:undefined,repair:{reasons,kept:false,fixed:0,error} as RepairOutcome};}
}

// What a pass tells the designer as repairFeedback: why an automatic repair runs, the failed checks (each says how to
// fix it), the corrections the app already made to the scene being revised, and a rejected design's technical detail.
// The reviewer's optional suggestions, non-visible features and composition notes are not attached to every later
// revision; they reach the designer only as approved items (approvedFeedback).
export function revisionFeedback(s:{reasons?:string[];issues:string[];corrections?:string[];rejected?:string}):string[]{
 const reasons=s.reasons||[];
 return [...reasons,...s.issues.filter(i=>!reasons.includes(i)),...(s.corrections||[]).map(c=>`Automatic correction already applied: ${c}`),...(s.rejected?[`The previous attempt was rejected before it could be built: ${s.rejected}`]:[])].map(f=>f.slice(0,1000)).slice(0,40);
}
// What the Fix flagged issues action approves: exactly the flagged review items, never the reviewer's optional ideas.
export function flaggedReviewItems(r:VisualReview|null):string[]{
 if(!r)return [];
 return [...r.features.filter(f=>f.status!=="visible").map(f=>`${f.feature}: ${f.evidence}`),...(r.rubric||[]).filter(f=>f.status==="missing").map(f=>`${f.feature}: ${f.evidence}`),...(!r.recognizable&&r.composition&&r.composition.status!=="matches"?[r.composition.evidence]:[]),...(r.revision&&["missing","uncertain"].includes(r.revision.status)?[`Requested change not yet visible: ${r.revision.evidence}`]:[])].map(s=>s.slice(0,500)).slice(0,12);
}
// The owner's ticked suggestions, plus the flagged items when the pass is an empty-composer repair.
export const approvedFeedback=(s:{approved?:string[];repairing:boolean;review:VisualReview|null})=>[...new Set([...(s.approved||[]),...(s.repairing?flaggedReviewItems(s.review):[])])].slice(0,12);

// Objective measures of one candidate: local check counts, the proportion error and which required or
// research-distinctive features the review saw (by item, so a re-review is compared item by item, never by score).
type Checks=Pick<ReturnType<typeof designChecks>,"audit"|"clutch"|"issues"|"loose"|"proportion">;
export type RepairMetrics={pieces:number;maxPieces:number;issues:number;overlaps:number;ungrounded:number;groups:number;separate:number;unsupported:number;overloaded:number;proportion:number|null;loose:{component:string;pieces:number}[];items:Record<string,FeatureStatus>;critical:boolean;criticalEvidence:string};
export function repairMetrics(checks:Checks,review:VisualReview|null,pieces:number,maxPieces:number):RepairMetrics{
 const a=checks.audit,items:Record<string,FeatureStatus>={};
 for(const f of review?.features||[])items[`Required: ${f.feature}`]=f.status;
 for(const r of review?.rubric||[])if(r.kind==="distinctive")items[r.feature]=r.status;
 return {pieces,maxPieces,issues:checks.issues.length,overlaps:a.overlaps,ungrounded:a.ungrounded.length,groups:a.groups,separate:Math.max(0,a.disconnected.length-a.ungrounded.length),unsupported:a.unsupported.length,overloaded:checks.clutch.overloaded.length,proportion:checks.proportion?checks.proportion.error:null,loose:checks.loose,items,critical:review?.criticalMismatch===true,criticalEvidence:review?(review.composition&&review.composition.status!=="matches"&&review.composition.evidence)||review.summary:""};
}
// Material, objective failures only: never an uncertain or subjective item, never a single loose piece.
export const FLOATING_SHARE=.02,LOOSE_COMPONENT=8,SEPARATE_ASSEMBLY=8,AUTO_REPAIR_MIN_BUDGET=.5;
const floating=(m:RepairMetrics)=>m.ungrounded>Math.max(1,m.pieces*FLOATING_SHARE)||m.loose.some(l=>l.pieces>=LOOSE_COMPONENT);
export function materialFailures(m:RepairMetrics):string[]{
 const out:string[]=[];
 if(m.critical)out.push(`The review found a critical mismatch: ${m.criticalEvidence}`.slice(0,300));
 for(const [item,status] of Object.entries(m.items))if(status==="missing")out.push(`Missing ${item.replace(/^Required: /,"required feature: ")}`.slice(0,300));
 if(floating(m))out.push(`${m.ungrounded} pieces float with no stud path to the ground${m.loose.length?` (${m.loose.slice(0,4).map(l=>`${l.component} ${l.pieces}`).join(", ")})`:""}.`);
 if(m.separate>=SEPARATE_ASSEMBLY)out.push(`${m.separate} pieces stand as a separate assembly; connect them to the main build.`);
 return out;
}
// Who may auto-repair: first builds and explicit retries, with the owner's setting on, no open question about the
// subject, and enough budget left for one more design and a targeted review.
export function autoRepairAllowed(s:{enabled:boolean;eligible:boolean;remaining?:number|null;clarification:boolean}):boolean{
 return s.enabled&&s.eligible&&!s.clarification&&typeof s.remaining==="number"&&s.remaining>=AUTO_REPAIR_MIN_BUDGET;
}
// Keep the repaired candidate only when no local measure regresses, nothing that was seen goes missing, and at least
// one material failure is resolved (a missing item now visible, a critical mismatch cleared, floating or a separate
// assembly fixed). Two review scores are never compared.
export function compareRepair(before:RepairMetrics,after:RepairMetrics):{keep:boolean;fixed:number}{
 const regress=(["issues","overlaps","ungrounded","groups","unsupported","overloaded"] as const).some(k=>after[k]>before[k])||after.pieces>after.maxPieces&&after.pieces>before.pieces||(after.proportion??0)>(before.proportion??0)+.05;
 const lost=Object.entries(after.items).some(([item,status])=>status==="missing"&&before.items[item]!=="missing");
 let fixed=Object.entries(before.items).filter(([item,status])=>status==="missing"&&after.items[item]==="visible").length;
 if(before.critical&&!after.critical)fixed++;
 if(floating(before)&&!floating(after))fixed++;
 if(before.separate>=SEPARATE_ASSEMBLY&&after.separate<SEPARATE_ASSEMBLY)fixed++;
 return {keep:!regress&&!lost&&fixed>0,fixed};
}
