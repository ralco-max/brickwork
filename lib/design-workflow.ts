import type {VisualReview,FeatureStatus,designChecks} from "./design-project";
import {clipSentence} from "./utils";

// The paid path has one reference lookup, one design and one review, plus at most one automatic repair.
// Compilation is local. A failed lookup/design stops subsequent paid work;
// a failed review preserves the completed candidate for an explicit retry.
// The repair runs only when repair.plan names material failures (the caller gates it on first builds, explicit
// retries, budget and the owner's setting). Its design is compiled, then repair.worth says whether a re-review can
// still change the verdict (an unchanged scene, a local regression, or local failures left unfixed cannot be kept);
// the re-review uses the same evidence as the first one, and the candidate replaces the original only when
// repair.keep says the objective measures improved. A failed repair keeps the reviewed original.
export type RepairOutcome={reasons:string[];kept:boolean;fixed:number;checked:boolean;error?:unknown};
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
  worth?:(before:{model:Model;scene:Scene;review:Review},after:{model:Model;scene:Scene})=>boolean;
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
 const original={reference,scene,model,review,reviewError:undefined};
 try{
  const nextScene=await steps.repair.design(reasons,model,scene,review,reference);alive();
  const nextModel=await steps.repair.compile(nextScene,reference);alive();
  if(steps.repair.worth&&!steps.repair.worth({model,scene,review},{model:nextModel,scene:nextScene}))return {...original,repair:{reasons,kept:false,fixed:0,checked:false} as RepairOutcome};
  const nextReview=await steps.repair.review(nextModel,nextScene,reference,reasons);alive();
  const verdict=steps.repair.keep({model,scene,review},{model:nextModel,scene:nextScene,review:nextReview});
  const repair:RepairOutcome={reasons,kept:verdict.keep,fixed:verdict.keep?verdict.fixed:0,checked:true};
  return verdict.keep?{reference,scene:nextScene,model:nextModel,review:nextReview,reviewError:undefined,repair}:{...original,repair};
 }catch(error){alive();return {...original,repair:{reasons,kept:false,fixed:0,checked:false,error} as RepairOutcome};}
}

// What a pass tells the designer as repairFeedback: why an automatic repair runs, the failed checks (each says how to
// fix it), the corrections the app already made to the scene being revised, and a rejected design's technical detail.
// The reviewer's optional suggestions, non-visible features and composition notes are not attached to every later
// revision; they reach the designer only as approved items (approvedFeedback).
export function revisionFeedback(s:{reasons?:string[];issues:string[];corrections?:string[];rejected?:string}):string[]{
 const reasons=s.reasons||[];
 return [...reasons,...s.issues.filter(i=>!reasons.includes(i)),...(s.corrections||[]).map(c=>`Automatic correction already applied: ${c}`),...(s.rejected?[`The previous attempt was rejected before it could be built: ${s.rejected}`]:[])].map(f=>f.slice(0,1000)).slice(0,40);
}
// Approved items go to /api/generate, which takes at most 12 non-blank items of 500 characters.
const approvedList=(list:string[])=>[...new Set(list.map(s=>clipSentence(s,500)).filter(Boolean))].slice(0,12);
const flagged=(name:string,evidence:string)=>evidence.trim()?`${name}: ${evidence.trim()}`:name;
// What the Fix flagged issues action approves: exactly the flagged review items, never the reviewer's optional ideas.
// A composition note counts only when it reports a mismatch or doubt in words; not_applicable leaves nothing to fix.
export function flaggedReviewItems(r:VisualReview|null):string[]{
 if(!r)return [];
 return approvedList([...r.features.filter(f=>f.status!=="visible").map(f=>flagged(f.feature,f.evidence)),...(r.rubric||[]).filter(f=>f.status==="missing").map(f=>flagged(f.feature,f.evidence)),...(!r.recognizable&&r.composition&&["mismatch","uncertain"].includes(r.composition.status)?[r.composition.evidence]:[]),...(r.revision&&["missing","uncertain"].includes(r.revision.status)?[flagged("Requested change not yet visible",r.revision.evidence)]:[])]);
}
// The owner's ticked suggestions, plus the flagged items when the pass is an empty-composer repair.
export const approvedFeedback=(s:{approved?:string[];repairing:boolean;review:VisualReview|null})=>approvedList([...(s.approved||[]),...(s.repairing?flaggedReviewItems(s.review):[])]);

// A targeted check (three smaller views, no reference) cannot judge the layout or the far side: the previous full
// verdict on composition, critical mismatch and recognizability carries over unless the check reports a new failure,
// and an item it could not see (uncertain) keeps the previous sighting. The result is marked targeted.
export function mergeTargetedReview(previous:VisualReview|null|undefined,targeted:VisualReview):VisualReview{
 const out:VisualReview={...targeted,scope:"targeted"};if(!previous)return out;
 const carry=<T extends {feature:string;status:FeatureStatus;evidence:string}>(now:T,list?:T[]):T=>{const was=list?.find(p=>p.feature===now.feature);return now.status==="uncertain"&&was?.status==="visible"?{...now,status:was.status,evidence:was.evidence}:now;};
 out.features=targeted.features.map(f=>carry(f,previous.features));
 if(targeted.rubric)out.rubric=targeted.rubric.map(r=>carry(r,previous.rubric));
 if(targeted.composition?.status!=="mismatch"&&previous.composition&&previous.composition.status!=="not_applicable")out.composition=previous.composition;
 if(previous.criticalMismatch)out.criticalMismatch=true;
 out.recognizable=targeted.recognizable&&previous.recognizable&&!out.criticalMismatch&&!(out.composition&&["mismatch","uncertain"].includes(out.composition.status));
 return out;
}

// Objective measures of one candidate: local check counts, the proportion error and what the review saw, item by
// item (a re-review is compared per item, never by score). items are the required and research-distinctive features
// that may trigger a repair; watched are the silhouette and signature items a repair must not lose.
type Checks=Pick<ReturnType<typeof designChecks>,"audit"|"clutch"|"issues"|"loose"|"proportion">;
export type RepairMetrics={pieces:number;maxPieces:number;issues:number;overlaps:number;ungrounded:number;groups:number;separate:number;unsupported:number;overloaded:number;proportion:number|null;loose:{component:string;pieces:number}[];items:Record<string,FeatureStatus>;watched:Record<string,FeatureStatus>;critical:boolean;recognizable:boolean;full:boolean;criticalEvidence:string};
// The two-plate base (its top is y=2). Only pieces above it count toward a separate assembly: when the body leaves a
// strip of base exposed, the packer can lay both base layers with the same seam, and that strip stands on its own.
// It is a packing artifact no design call can fix, so it never starts a paid repair.
export const BASE_PLATES=2;
export function repairMetrics(checks:Checks,review:VisualReview|null,model:{pieces:{id:number;y:number}[]},maxPieces:number):RepairMetrics{
 const a=checks.audit,items:Record<string,FeatureStatus>={},watched:Record<string,FeatureStatus>={};
 for(const f of review?.features||[])items[`Required: ${f.feature}`]=f.status;
 for(const r of review?.rubric||[])(r.kind==="distinctive"?items:watched)[r.feature]=r.status;
 const apart=new Set(a.disconnected),floating=new Set(a.ungrounded),separate=model.pieces.filter(p=>apart.has(p.id)&&!floating.has(p.id)&&p.y>=BASE_PLATES).length;
 return {pieces:model.pieces.length,maxPieces,issues:checks.issues.length,overlaps:a.overlaps,ungrounded:a.ungrounded.length,groups:a.groups,separate,unsupported:a.unsupported.length,overloaded:checks.clutch.overloaded.length,proportion:checks.proportion?checks.proportion.error:null,loose:checks.loose,items,watched,critical:review?.criticalMismatch===true,recognizable:review?.recognizable!==false,full:Boolean(review)&&review!.scope!=="targeted",criticalEvidence:review?(review.composition&&review.composition.status!=="matches"&&review.composition.evidence)||review.summary:""};
}
// Material, objective failures only: never an uncertain or subjective item, never a single loose piece.
export const FLOATING_SHARE=.02,LOOSE_COMPONENT=8,SEPARATE_ASSEMBLY=8,AUTO_REPAIR_MIN_BUDGET=.5;
const floats=(m:RepairMetrics)=>m.ungrounded>Math.max(1,m.pieces*FLOATING_SHARE)||m.loose.some(l=>l.pieces>=LOOSE_COMPONENT);
export function materialFailures(m:RepairMetrics):string[]{
 const out:string[]=[];
 if(m.critical)out.push(`The review found a critical mismatch: ${m.criticalEvidence}`.slice(0,300));
 for(const [item,status] of Object.entries(m.items))if(status==="missing")out.push(`Missing ${item.replace(/^Required: /,"required feature: ")}`.slice(0,300));
 if(floats(m))out.push(`${m.ungrounded} pieces float with no stud path to the ground${m.loose.length?` (${m.loose.slice(0,4).map(l=>`${l.component} ${l.pieces}`).join(", ")})`:""}.`);
 if(m.separate>=SEPARATE_ASSEMBLY)out.push(`${m.separate} pieces stand as a separate assembly; connect them to the main build.`);
 return out;
}
// Who may auto-repair: first builds and explicit retries, with the owner's setting on, no open question about the
// subject, and enough budget left for one more design and its re-review.
export function autoRepairAllowed(s:{enabled:boolean;eligible:boolean;remaining?:number|null;clarification:boolean}):boolean{
 return s.enabled&&s.eligible&&!s.clarification&&typeof s.remaining==="number"&&s.remaining>=AUTO_REPAIR_MIN_BUDGET;
}
// The local half of the keep rule, known before any re-review: a regression in any check count, the piece limit or
// the proportions rejects the candidate; fixed counts the floating and separate-assembly failures it resolved.
const LOCAL=["issues","overlaps","ungrounded","groups","unsupported","overloaded"] as const;
function localVerdict(before:RepairMetrics,after:RepairMetrics){
 const regress=LOCAL.some(k=>after[k]>before[k])||after.pieces>after.maxPieces&&after.pieces>before.pieces||(after.proportion??0)>(before.proportion??0)+.05;
 return {regress,fixed:(floats(before)&&!floats(after)?1:0)+(before.separate>=SEPARATE_ASSEMBLY&&after.separate<SEPARATE_ASSEMBLY?1:0)};
}
// Whether the re-review is worth paying for, from the candidate's local measures (after has no review yet). An unchanged
// scene fixes nothing; a local regression is rejected whatever a review says; and when every failure was local, a
// candidate that resolves none of them cannot be kept.
export function repairNeedsReview(before:RepairMetrics,after:RepairMetrics,changed:boolean):boolean{
 if(!changed)return false;const local=localVerdict(before,after);if(local.regress)return false;
 return local.fixed>0||before.critical||Object.values(before.items).includes("missing");
}
// Keep the repaired candidate only when no local measure regresses, the review raises no new critical mismatch and
// still recognizes the subject, nothing it saw before is now missing or unseen (silhouette and signature included),
// and at least one material failure is resolved: a missing item now visible, floating or a separate assembly fixed,
// or a critical mismatch cleared by a re-review that saw at least the first review's evidence (a targeted check
// cannot see the reference, so it never clears one). Two review scores are never compared.
export function compareRepair(before:RepairMetrics,after:RepairMetrics):{keep:boolean;fixed:number}{
 const local=localVerdict(before,after),regress=local.regress||!before.critical&&after.critical||before.recognizable&&!after.recognizable;
 const was:Record<string,FeatureStatus>={...before.watched,...before.items},now:Record<string,FeatureStatus>={...after.watched,...after.items};
 const lost=Object.entries(now).some(([item,status])=>Object.hasOwn(was,item)&&(was[item]==="visible"&&status!=="visible"||status==="missing"&&was[item]!=="missing"));
 let fixed=local.fixed+Object.entries(before.items).filter(([item,status])=>status==="missing"&&after.items[item]==="visible").length;
 if(before.critical&&!after.critical&&(after.full||!before.full))fixed++;
 return {keep:!regress&&!lost&&fixed>0,fixed};
}
