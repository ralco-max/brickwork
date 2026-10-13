"use client";
import {toast} from "sonner";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowRight,Check,LoaderCircle,RotateCcw,Send,Square,Sparkles,LockKeyhole,Eye,Play,Pause,SlidersHorizontal,Maximize2,ShoppingBag,LassoSelect,X,Box,MessageSquare,Wrench,KeyRound} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import AIConnection from "./ai-connection";
import {isLocalDesignEdit,needsFreshResearch,lookupOutcome,savedReference} from "@/lib/ai-efficiency";
import RunUsage from "./run-usage";
import type {UsageStage,RunUsageEntry} from "./run-usage";
import type {BudgetSnapshot,RequestUsage} from "@/lib/ai-budget";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import Viewport,{type RegionCapture} from "./viewport";
import type {RevisionRegion} from "@/lib/revision-region";
import {saveDesign,packDesign,newDesignId} from "@/lib/design-library";
import type {ReferenceSheet} from "@/lib/design-research";
import {planTarget,referenceSheetSchema,referenceReady,referenceClarification} from "@/lib/design-research";
import {runDesignWorkflow,repairMetrics,materialFailures,autoRepairAllowed,compareRepair,repairNeedsReview,mergeTargetedReview,approvedFeedback,revisionFeedback} from "@/lib/design-workflow";
import {clipSentence} from "@/lib/utils";
import {FeedbackQueue,mayClearSubmittedFeedback} from "@/lib/feedback-queue";
import type {QueuedFeedback} from "@/lib/feedback-queue";
import BriefForm from "./design-brief";
import SignInput from "./sign-input";
import {signMetrics} from "@/lib/brick-lettering";
import ReferenceInputs,{type ReferenceInputValue} from "./reference-inputs";
import {collectReferencePhotos} from "@/lib/reference-photos";
import {normalizeScene,componentBudget,splitCaption} from "@/lib/generated-scene";
import {PreviewQueue,foundationScene,type ArrivalMode} from "@/lib/live-arrivals";
import {readEvents} from "@/lib/generation-stream";
import {canKeepPartial,continuationPrompt} from "@/lib/generation-recovery";
import {GenerationError,generationFailure} from "@/lib/generation-errors";
import {briefSchema,defaultBrief,emptyManual,designChecks,sceneDiff,referenceKey} from "@/lib/design-project";
import type {DesignBrief,VisualReview,ManualEdits,DesignReference,AutoRepairRecord} from "@/lib/design-project";
import type {GeneratedScene,SceneHeader,Shape} from "@/lib/generated-scene";
import type {BuildModel} from "@/lib/models";
import type {Creation} from "./create-build";
import {PHOTO_IDEA} from "@/lib/idea-draft";
import type {IdeaDraft} from "@/lib/idea-draft";
type Props={open:boolean;onOpenChange:(open:boolean)=>void;initialPrompt:string;initialPhotos?:string[];onDraftChange?:(draft:IdeaDraft)=>void;previous?:BuildModel;onCreate:(creation:Creation)=>void};
// approved: review suggestions the owner ticked for this pass; only these, the failed checks and the automatic
// corrections reach the designer as repair feedback.
type FeedbackSnapshot={region?:RevisionRegion;text:string;references:ReferenceInputValue;version:number;approved?:string[]};
// manual: the protected edits this draft was packed with (its automatic support columns included).
type Completed={reviewRegion?:RevisionRegion;reviewRequest?:string;reference?:DesignReference;model:BuildModel;scene:GeneratedScene;review:VisualReview|null;brief:DesignBrief;manual?:ManualEdits;corrections?:string[]};
// Scale is planned from the subject's own shape inside the brief's limits: a vertical exaggeration for very long, low
// subjects, and a faithful section when the smallest defining feature would otherwise drop below 2 studs.
function planSheet(sheet:ReferenceSheet,b:DesignBrief):ReferenceSheet{return planTarget(sheet,b);}
const checksFor=(m:BuildModel,b:DesignBrief,sheet?:ReferenceSheet)=>designChecks(m,b,sheet?.target,sheet?.scaleConflict);
const stripSupports=(m:ManualEdits):ManualEdits=>({...m,bricks:m.bricks.filter(p=>!p.support)});
// Toggling auto-repair is not a design change.
const sameBrief=(a:DesignBrief|undefined,b:DesignBrief)=>JSON.stringify({...a,autoRepair:undefined})===JSON.stringify({...b,autoRepair:undefined});
export const visualPassed=(r:VisualReview|null)=>!!r&&r.recognizable&&!r.criticalMismatch&&r.features.every(f=>f.status==="visible")&&!(r.rubric||[]).some(f=>f.status==="missing")&&(!r.revision||["visible","not_requested"].includes(r.revision.status));
// What the designer is told about a finished pass: the review's verdict and its own private notes.
const builderSummary=(review:VisualReview|null,scene:GeneratedScene)=>clipSentence([review?.summary,...(scene.notes||[])].filter(Boolean).join(" "),1000);
// Display names for the stored detail tiers. The recap never shows model names.
export const detailLabel=(d:DesignBrief["detail"])=>d==="signature"?"Signature":d==="balanced"?"Essential":"Detailed";
export const briefRecap=(b:Pick<DesignBrief,"scope"|"detail"|"maxPieces">)=>`${b.scope==="site"?"Whole site":"Main subject"} · ${detailLabel(b.detail)} · up to ${b.maxPieces.toLocaleString()} pieces`;
export const flaggedCount=(issues:number,review:VisualReview|null)=>issues+(review?(review.recognizable?0:1)+review.features.filter(f=>f.status!=="visible").length+(review.rubric||[]).filter(f=>f.status==="missing").length+(review.revision&&!["visible","not_requested"].includes(review.revision.status)?1:0):0);
// An empty composer never invites a paid run: fixing flagged issues and continuing an unfinished draft are separate, labelled actions.
export function composerActions(s:{busy:boolean;queued:boolean;changed:boolean;typed:boolean;scene:boolean;interrupted:boolean;error:boolean;flagged:number}){
 return {submit:s.busy?s.queued?"Update queued feedback":"Queue feedback":"Revise build",submitDisabled:!s.changed,secondary:s.busy||!s.scene||s.changed||s.typed?"":s.interrupted?s.error?"":"Continue design":s.flagged>0?`Fix ${s.flagged} flagged issue${s.flagged===1?"":"s"}`:""};
}
const CONNECTION_CODES=["AI_AUTH","AI_NOT_CONNECTED"];
export const retryLabel=(code:string,interrupted:boolean,reviewing:boolean)=>CONNECTION_CODES.includes(code)?"AI settings":interrupted?"Continue design":reviewing?"Retry review":"Try again";
// The key field mounts with the connection card, so it is revealed after that render; it often sits below the fold.
export function revealConnectionKey(doc:Pick<Document,"getElementById">=document,smooth=!window.matchMedia("(prefers-reduced-motion: reduce)").matches){const input=doc.getElementById("generation-key");if(!input)return false;input.scrollIntoView({block:"center",behavior:smooth?"smooth":"auto"});input.focus({preventScroll:true});return true;}
export default function Generator({open,onOpenChange,initialPrompt,initialPhotos,onDraftChange,previous,onCreate}:Props){
 const [reference,setReference]=useState<string|null>(null),[photos,setPhotos]=useState<string[]>([]),[identityHint,setIdentityHint]=useState(""),[preparingPhotos,setPreparingPhotos]=useState(false),[clarification,setClarification]=useState(""),[sheet,setSheet]=useState<ReferenceSheet|null>(null);
 const reviewRequest=useRef(""),reviewRegion=useRef<RevisionRegion|undefined>(undefined);
 const [region,setRegion]=useState<RevisionRegion|undefined>(undefined),[markingRegion,setMarkingRegion]=useState(false);
 const composerVersion=useRef(0),editorSession=useRef(0),feedbackQueue=useRef(new FeedbackQueue<FeedbackSnapshot>()),activeFeedback=useRef<FeedbackSnapshot|null>(null);
 const [queuedFeedback,setQueuedFeedback]=useState<QueuedFeedback<FeedbackSnapshot>|null>(null);
 const syncQueue=()=>setQueuedFeedback(feedbackQueue.current.pending);
 const pauseQueue=()=>{feedbackQueue.current.pause();syncQueue();};
 const referencePack=useRef<DesignReference|undefined>(undefined);
 const draftId=useRef("");
 // Refs for values a running pass must read fresh: the packed manual edits, the live budget, the auto-repair log and a
 // rejected design's technical detail, which the next pass hands back to the designer.
 const manualRef=useRef<ManualEdits>(emptyManual()),budgetRef=useRef<BudgetSnapshot|null>(null),autoRepairs=useRef<AutoRepairRecord[]>([]),rejectedDetail=useRef(""),repairSpend=useRef<number|null>(null);
 // Every completed or kept draft is written to the browser's design library so backing out never loses it.
 const persist=(m:BuildModel,s:GeneratedScene,r:VisualReview|null,b:DesignBrief,ref=referencePack.current,unfinished=false)=>{if(!briefSchema.safeParse(b).success)return;try{void saveDesign(packDesign({...m,name:previous?.name||m.name,generation:s,shopping:previous?.shopping,detail:b.size,libraryId:draftId.current,design:{brief:b,reference:ref,unfinished,reviewRequest:reviewRequest.current,reviewRegion:reviewRegion.current,manual:manualRef.current,locked,revisions:revisions.current,review:r||undefined,reviewStale:!r,...(autoRepairs.current.length?{autoRepairs:autoRepairs.current}:{})}},"draft")).then(saved=>{if(!saved)toast.warning("This draft could not be saved to your designs. Browser storage may be full or blocked; keep this tab open or export the project.",{id:"draft-save-failed"});});}catch{/* drafts that cannot be serialized stay in this tab */}};
 const [budget,setBudget]=useState<BudgetSnapshot|null>(null);
 useEffect(()=>{budgetRef.current=budget;},[budget]);
 const trackBudget=(b:BudgetSnapshot)=>{budgetRef.current=b;setBudget(b);};
 // The builder's notes: what it looked up, the scale it settled on, its own reasoning summaries as they stream, the architect's critique and the review.
 const [runCost,setRunCost]=useState(0),[settledCalls,setSettledCalls]=useState(0);
 const [runUsage,setRunUsage]=useState<RunUsageEntry[]>([]),[referenceReused,setReferenceReused]=useState(false);
 const recordCost=(usage:RequestUsage,stage:UsageStage)=>{if(typeof usage?.cost==="number"&&Number.isFinite(usage.cost)&&usage.cost>=0){if(repairSpend.current!==null)repairSpend.current+=usage.cost;setRunCost(c=>c+usage.cost!);setSettledCalls(c=>c+1);setRunUsage(rows=>[...rows,{...usage,stage}]);}};
 const [notes,setNotes]=useState<{phase:string;text:string;live?:boolean}[]>([]);
 const note=(phase:string,text:string)=>{const clean=text.trim();if(clean)setNotes(list=>[...list,{phase,text:clean}]);};
 const thought=(phase:string,delta:string)=>setNotes(list=>{const last=list[list.length-1];if(last&&last.live&&last.phase===phase)return [...list.slice(0,-1),{...last,text:(last.text+delta).slice(-6000)}];return [...list,{phase,text:delta.trimStart(),live:true}];});
 const [interrupted,setInterrupted]=useState(false),[errorCode,setErrorCode]=useState("");
 // An accounting error settles that one request; the rest of the budget stays available, so it may be retried.
 const budgetBlocked=["BUDGET_LIMIT","BUDGET_MODEL"].includes(errorCode);
 const partialDraft=useRef<Completed|null>(null);
 const [mobilePanel,setMobilePanel]=useState("preview"),[motionPaused,setMotionPaused]=useState(false),[replay,setReplay]=useState(0),[arrivalMode,setArrivalMode]=useState<ArrivalMode>("assemble"),[previewError,setPreviewError]=useState(""),[elapsed,setElapsed]=useState(0);
 const startedAt=useRef(0),previewQueue=useRef<PreviewQueue<GeneratedScene,BuildModel>|null>(null);
 const [brief,setBrief]=useState<DesignBrief>(defaultBrief()),[setup,setSetup]=useState(true),[prompt,setPrompt]=useState(""),[busy,setBusy]=useState(false),[phase,setPhase]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState("");
 const [draft,setDraft]=useState<BuildModel|null>(null),[scene,setScene]=useState<GeneratedScene|null>(null),[review,setReview]=useState<VisualReview|null>(null),[shapeCount,setShapeCount]=useState(0),[configured,setConfigured]=useState<boolean|null>(null),[view,setView]=useState("perspective");
 const [apiKey,setApiKey]=useState(""),[showConnection,setShowConnection]=useState(false),[keyReveal,setKeyReveal]=useState(0),[locked,setLocked]=useState<string[]>([]),[manual,setManual]=useState<ManualEdits>(emptyManual()),[approved,setApproved]=useState<string[]>([]),[messages,setMessages]=useState<{role:"you"|"builder";text:string}[]>([]);
 const controller=useRef<AbortController|null>(null),requestId=useRef(0),worker=useRef<Worker|null>(null),workerId=useRef(0),wasOpen=useRef(false),running=useRef(false);
 const pending=useRef(new Map<number,{resolve:(packed:{model:BuildModel;manual?:ManualEdits;added?:number})=>void;reject:(error:Error)=>void}>()),lastComplete=useRef<Completed|null>(null),revisions=useRef<NonNullable<BuildModel["design"]>["revisions"]>([]);
 useEffect(()=>{if(!keyReveal)return;const frame=requestAnimationFrame(()=>revealConnectionKey());return()=>cancelAnimationFrame(frame);},[keyReveal]);
 const askForKey=()=>{setShowConnection(true);setMobilePanel("refine");setKeyReveal(v=>v+1);};
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-startedAt.current)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 const checks=useMemo(()=>draft&&!busy?checksFor(draft,brief,sheet||undefined):null,[draft,brief,busy,sheet]);
 const keepManual=(m:ManualEdits)=>{manualRef.current=m;setManual(m);};
 const reviewPassed=visualPassed(review),ready=checks?.pass&&reviewPassed&&!interrupted;
 const components=useMemo(()=>[...new Set(scene?.shapes.map(s=>s.component||s.label)||[])],[scene]),diff=scene?sceneDiff(previous?.generation,scene):null;
 useEffect(()=>{
  worker.current=new Worker(new URL("./generation.worker.ts",import.meta.url),{type:"module"});
  worker.current.onmessage=e=>{const task=pending.current.get(e.data.id);if(task){pending.current.delete(e.data.id);if(e.data.error)task.reject(Error(e.data.error));else task.resolve(e.data);}};
  worker.current.onerror=()=>{worker.current?.terminate();worker.current=null;for(const task of pending.current.values())task.reject(Error("The brick assembler could not start. Reload and try again."));pending.current.clear();};
  return()=>{requestId.current++;controller.current?.abort();worker.current?.terminate();for(const task of pending.current.values())task.reject(Error("Generation closed."));pending.current.clear();};
 },[]);
 // supports: a finished design is packed with the automatic support columns, re-derived from the manual edits without
 // the previous ones (stale columns could cut through new geometry). Previews skip them too.
 function assemble(next:GeneratedScene,b:DesignBrief,base?:GeneratedScene,options:{preview?:boolean;supports?:boolean}={}){const edits=options.preview||options.supports?stripSupports(manualRef.current):manualRef.current;return new Promise<{model:BuildModel;manual:ManualEdits;added:number}>((resolve,reject)=>{if(!worker.current){reject(Error("The brick assembler is unavailable. Reload and try again."));return;}const id=++workerId.current;pending.current.set(id,{resolve:r=>resolve({model:r.model,manual:r.manual||edits,added:r.added||0}),reject});worker.current.postMessage({id,scene:next,manual:edits,hollow:b.hollow,smooth:b.finish==="smooth",previous:options.preview&&!locked.length?undefined:base,locked,supports:options.supports});});}
 const compile=(next:GeneratedScene,b:DesignBrief,base?:GeneratedScene,preview=false)=>assemble(next,b,base,{preview}).then(r=>r.model);
 useEffect(()=>{if(open&&!wasOpen.current){const session=++requestId.current,old=previous?.design,b=old?.brief||defaultBrief(initialPrompt||previous?.description||"");editorSession.current++;composerVersion.current=0;activeFeedback.current=null;feedbackQueue.current.cancel();syncQueue();setBrief(b);setPrompt("");setRegion(undefined);setMarkingRegion(false);setError("");setErrorCode("");setInterrupted(Boolean(old?.unfinished));partialDraft.current=null;setPreviewError("");setMotionPaused(false);setReplay(0);setArrivalMode(previous?"still":"assemble");setElapsed(0);const normalized=previous?.generation?normalizeScene(previous.generation):null;setScene(normalized);setDraft(previous||null);setReview(old?.reviewStale?null:old?.review||null);setLocked(old?.locked||[]);keepManual(old?.manual||emptyManual());setApproved([]);autoRepairs.current=[...(old?.autoRepairs||[])];rejectedDetail.current="";repairSpend.current=null;revisions.current=[...(old?.revisions||[])];setMessages(revisions.current.flatMap(r=>[{role:"you" as const,text:r.request},{role:"builder" as const,text:r.summary}]));draftId.current=previous?.libraryId||newDesignId();referencePack.current=old?.reference;reviewRequest.current=old?.reviewRequest||"";reviewRegion.current=old?.reviewRegion;const startingPhotos=previous?collectReferencePhotos(old?.reference?.photo,old?.reference?.photos):collectReferencePhotos(undefined,initialPhotos);setReference(startingPhotos[0]||null);setPhotos(startingPhotos.slice(1));setIdentityHint(old?.reference?.identityHint||"");setPreparingPhotos(false);setClarification(old?.reference?.sheet&&!referenceReady(old.reference.sheet)?referenceClarification(old.reference.sheet):"");setSheet(old?.reference?.sheet||null);setSetup(!previous);setShapeCount(0);setStatus("");setPhase("");setBusy(false);setRunCost(0);setSettledCalls(0);setRunUsage([]);setReferenceReused(false);setNotes([]);running.current=false;setShowConnection(false);setConfigured(null);lastComplete.current=previous?.generation?{reviewRequest:old?.reviewRequest,reviewRegion:old?.reviewRegion,reference:old?.reference,model:previous,scene:normalized!,review:old?.reviewStale?null:old?.review||null,brief:b,manual:old?.manual||emptyManual()}:null;if(old?.unfinished){partialDraft.current=lastComplete.current;lastComplete.current=null;}
   void fetch("/api/generate",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(requestId.current===session)setConfigured(Boolean(data.configured));}).catch(()=>{if(requestId.current===session){setConfigured(false);setError("Could not check the AI connection. Connect your key below to continue.");}});
  }wasOpen.current=open;
 },[open]);
 function editReferences(value:ReferenceInputValue){
  composerVersion.current++;setReference(value.photo||null);setPhotos(value.photos);setIdentityHint(value.identityHint);
  // While the builder runs, these belong only to the next feedback pass.
  if(running.current)return;
  setReview(null);
  // Keep new evidence even if the next lookup is interrupted, fails, or asks a question.
  const ref:DesignReference={...referencePack.current,...value,briefKey:""};referencePack.current=ref;
  if(lastComplete.current)lastComplete.current={...lastComplete.current,reference:ref,review:null};
  if(partialDraft.current)partialDraft.current={...partialDraft.current,reference:ref,review:null};
  if(draft&&scene)persist(draft,scene,null,brief,ref,interrupted);
 }
 const briefEdited=Boolean(lastComplete.current&&!sameBrief(lastComplete.current.brief,brief));
 const editorReferences:ReferenceInputValue={photo:reference||undefined,photos,identityHint};
 const sameReferences=(a:{photo?:string;photos?:string[];identityHint?:string}|undefined,b:ReferenceInputValue)=>JSON.stringify(collectReferencePhotos(a?.photo,a?.photos))===JSON.stringify(collectReferencePhotos(b.photo,b.photos))&&(a?.identityHint||"")===b.identityHint;
 const referenceEdited=Boolean(referencePack.current&&referencePack.current.briefKey!==referenceKey(brief))||!sameReferences(referencePack.current,editorReferences);
 const feedbackChanged=Boolean(region)||prompt.trim().length>=3||(busy?!sameReferences(activeFeedback.current?.references,editorReferences):referenceEdited||briefEdited);
 const actions=composerActions({busy,queued:Boolean(queuedFeedback),changed:feedbackChanged,typed:Boolean(prompt.trim()),scene:Boolean(draft&&scene),interrupted,error:Boolean(error),flagged:flaggedCount(checks?.issues.length||0,review)});
 function editPrompt(value:string){composerVersion.current++;setPrompt(value);}
 function editRegion(value:RevisionRegion|undefined){composerVersion.current++;setRegion(value);}
 function jumpToBuild(){(document.activeElement as HTMLElement|null)?.blur();setMobilePanel("preview");requestAnimationFrame(()=>document.querySelector(".generator-dialog .generation-preview")?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));}
 function jumpToFeedback(){setMobilePanel("refine");const input=document.getElementById("generation-prompt");input?.focus({preventScroll:true});requestAnimationFrame(()=>input?.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));}
 function startMarking(){if(!draft)return;setMarkingRegion(true);setMobilePanel("preview");requestAnimationFrame(()=>document.querySelector(".generator-dialog .generation-canvas")?.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));}
 function attachRegion(capture:RegionCapture){editRegion({...capture,components:[],description:"User-marked area on the generated model. This view was captured before the requested edit; the live build may have progressed since then. Optional bounds summarize sampled visible surfaces, not the full marked area; use the drawn outline for scope."});setMarkingRegion(false);setMobilePanel("refine");requestAnimationFrame(()=>{const input=document.getElementById("generation-prompt");input?.focus({preventScroll:true});input?.scrollIntoView({block:"nearest",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});});}
 function feedbackSnapshot():FeedbackSnapshot{return {region:region?structuredClone(region):undefined,text:prompt.trim(),references:{...editorReferences,photos:[...photos]},version:composerVersion.current,...(approved.length?{approved:[...approved]}:{})};}
 function submitFeedback(){
  if(preparingPhotos||markingRegion||budgetBlocked)return;
  if(running.current){if(!feedbackChanged)return;feedbackQueue.current.submit(feedbackSnapshot(),requestId.current);syncQueue();return;}
  feedbackQueue.current.cancel();syncQueue();void run();
 }
 function editQueuedFeedback(){const queued=feedbackQueue.current.pending;if(!queued)return;const value=queued.value;feedbackQueue.current.cancel();syncQueue();editPrompt(value.text);editReferences(value.references);editRegion(value.region);setApproved(value.approved||[]);requestAnimationFrame(()=>document.getElementById("generation-prompt")?.focus());}
 function resumeQueuedFeedback(){if(preparingPhotos||running.current||budgetBlocked)return;feedbackQueue.current.resume();syncQueue();}
 function editSign(signText:string){const b={...brief,signText};setBrief(b);setReview(null);if(draft&&scene)persist(draft,scene,null,b,referencePack.current,interrupted);}
 const referenceSession=editorSession.current;
 const referenceInputs=<ReferenceInputs key={referenceSession} value={editorReferences} pasteTargetId={setup?"brief-idea":"generation-prompt"} disabled={!open} question={clarification} onChange={value=>{if(wasOpen.current&&referenceSession===editorSession.current)editReferences(value);}} onPreparing={setPreparingPhotos}/>;
 function restore(){const last=lastComplete.current;setDraft(last?.model||null);setScene(last?.scene||null);setReview(last?.reference===referencePack.current&&sameBrief(last?.brief,brief)?last?.review||null:null);if(last){reviewRequest.current=last.reviewRequest||"";reviewRegion.current=last.reviewRegion;if(last.manual)keepManual(last.manual);}}
 function stop(){setMarkingRegion(false);if(activeFeedback.current&&composerVersion.current===activeFeedback.current.version){setPrompt(activeFeedback.current.text);setRegion(activeFeedback.current.region);setApproved(activeFeedback.current.approved||[]);}activeFeedback.current=null;pauseQueue();previewQueue.current?.cancel();requestId.current++;controller.current?.abort();running.current=false;setBusy(false);setPhase("");if(partialDraft.current){const saved=partialDraft.current;reviewRequest.current=saved.reviewRequest||"";reviewRegion.current=saved.reviewRegion;if(saved.manual)keepManual(saved.manual);setDraft(saved.model);setScene(saved.scene);setReview(null);setInterrupted(true);persist(saved.model,saved.scene,null,saved.brief,saved.reference,true);setStatus("Stopped. Your in-progress draft is kept in your designs.");}else{setStatus("Stopped. Your last completed draft is preserved.");restore();}}
 const headers=(key=apiKey)=>({"Content-Type":"application/json",...(key?{"x-brickwork-api-key":key}:{})});
 // targeted: three smaller views for a local or marked-area change (the auto-repair's re-check uses its pass's mode). The views are handed
 // back so an automatic repair can show the designer the model it is fixing.
 async function visual(model:BuildModel,b:DesignBrief,abort:AbortController,revision="",key=apiKey,signature:string[]=[],ref=referencePack.current,marked=reviewRegion.current,mode:"full"|"targeted"="full",onViews?:(images:string[])=>void){
  setPhase("review");setStatus(mode==="targeted"?"Checking the change…":"Looking over the finished model…");const {renderReviewViews,targetedViews,TARGETED_VIEW_SIZE}=await import("@/lib/render-review");abort.signal.throwIfAborted();const images=await renderReviewViews(model,mode==="targeted"?{views:targetedViews(model,marked),size:TARGETED_VIEW_SIZE}:{});abort.signal.throwIfAborted();onViews?.(images);
  // The designer's signature is checked as part of the review's rubric, beside (never merged into) the brief's features.
  const response=await fetch("/api/review",{method:"POST",signal:abort.signal,headers:headers(key),body:JSON.stringify({brief:b,images,revision,region:marked,sheet:ref?.sheet,reference:ref?.photo,photos:ref?.photos,signature:signature.slice(0,4).map(f=>f.slice(0,80)),mode})});
  if(!response.ok){const data=await response.json();throw new GenerationError(data.error||"Visual review could not start.",data.code||"REVIEW_FAILED");}
  if(!response.body)throw new GenerationError("Visual review lost its connection. Your design is kept.","CONNECTION_LOST");
  let result:VisualReview|undefined;for await(const event of readEvents(response.body)){if(event.type==="usage")recordCost(event.usage,"review");if(event.type==="budget")trackBudget(event.budget);if(event.type==="error")throw new GenerationError(event.message,event.code||"REVIEW_FAILED");if(event.type==="complete")result=event.review;}
  if(!result)throw new GenerationError("Visual review lost its connection. Your design is kept. Run the review again.","CONNECTION_LOST");return result;
 }
 async function run(reviewOnly=false,keyOverride?:string,fresh?:{brief:DesignBrief},submitted?:FeedbackSnapshot,retrying=false):Promise<boolean>{
  const activeKey=keyOverride||apiKey;if(running.current||preparingPhotos||markingRegion)return false;if(!configured&&!activeKey){askForKey();setError("Connect an OpenAI API key to build.");setErrorCode("AI_NOT_CONNECTED");return false;}
  const source=fresh?.brief||brief;
  if(source.signText?.trim())try{const size=signMetrics(source.signText);if(size.width>Math.max(source.maxWidth,source.maxDepth)||size.height>source.maxHeight)throw Error(`This sign needs ${size.width} studs of width and ${size.height} plates of height. Increase the scale or shorten the wording.`);}catch(e){setError(e instanceof Error?e.message:"Check the sign text.");setMobilePanel("refine");return false;}
  const parsed=briefSchema.safeParse({...source,idea:source.idea.trim(),features:source.features.map(s=>s.trim()).filter(Boolean)});
  if(!parsed.success){setError("Check the brief and size limits.");return false;}
  const b=parsed.data;if(locked.length&&lastComplete.current&&b.hollow!==lastComplete.current.brief.hollow){setError("Unlock the protected components before changing hollow interiors.");return false;}
  const runFeedback=submitted||feedbackSnapshot(),runReferences=runFeedback.references,runComposerVersion=runFeedback.version;
  const runReferenceEdited=Boolean(referencePack.current&&referencePack.current.briefKey!==referenceKey(b))||!sameReferences(referencePack.current,runReferences);
  const continuing=interrupted&&!fresh&&!reviewOnly&&!runFeedback.text&&!runFeedback.region&&!runReferenceEdited&&!briefEdited;
  // An empty-composer repair (Fix flagged issues, or a retry) of a pass whose requested change the review could not see keeps
  // that request and its marked area, so the repair finishes it and the review checks it again; the flagged review items
  // count as approved for this pass.
  const repairing=!reviewOnly&&!fresh&&!continuing&&!interrupted&&!runFeedback.text&&!runFeedback.region&&!runReferenceEdited&&!briefEdited&&Boolean(lastComplete.current||scene);
  const carried=repairing&&review?.revision&&["missing","uncertain"].includes(review.revision.status)?reviewRequest.current:"";
  const approvedItems=approvedFeedback({approved:runFeedback.approved,repairing,review});
  const rejected=reviewOnly?"":rejectedDetail.current;if(!reviewOnly)rejectedDetail.current="";
  const runPrompt=continuing?reviewRequest.current:runFeedback.text,runRegion=reviewOnly?reviewRegion.current:fresh?undefined:runFeedback.region||(continuing||carried?reviewRegion.current:undefined);
  const baseScene=submitted&&!interrupted?(lastComplete.current?.scene||scene):scene;
  const oldSign=lastComplete.current?.brief.signText||"",newSign=b.signText||"";
  const briefChangeRequest=b.signText!==undefined&&!newSign.trim()&&baseScene?.shapes.some(s=>s.kind==="text")?"Remove the existing sign lettering while preserving the building and unrelated details.":oldSign!==newSign?(newSign?`Set the building sign to exactly "${newSign}" using supported block lettering. Preserve unrelated details.`:`Remove the previous "${oldSign}" sign lettering. Preserve unrelated details.`):"Apply the updated brief while preserving unrelated details.";
  const original=fresh?undefined:baseScene||undefined,text=original?continuing?continuationPrompt(b.idea,reviewRequest.current):runPrompt||(carried?`Finish the earlier request “${carried.slice(0,1200)}” and repair the flagged checks while preserving the rest of the design.`:runRegion?"Refine the marked area while preserving the rest of the build.":runReferenceEdited?"Update the design to match the reference photos and clarified place or structure.":briefEdited?briefChangeRequest:interrupted?continuationPrompt(b.idea,reviewRequest.current):"Repair the failed checks while preserving the original design."):runPrompt?`${b.idea}\n\nAdditional instructions: ${runPrompt}`:b.idea;
  if(!reviewOnly){setArrivalMode(original?"revise":"assemble");reviewRegion.current=runRegion;}
  if(!reviewOnly)reviewRequest.current=original||runPrompt?runPrompt||carried||(runRegion?"Refine the marked area while preserving the rest of the build.":runReferenceEdited?"Match the reference photos and clarified place or structure.":briefEdited?briefChangeRequest:interrupted?reviewRequest.current:""):"";
  activeFeedback.current=reviewOnly?runFeedback:{...runFeedback,text:runPrompt,region:runRegion};if(mayClearSubmittedFeedback(runComposerVersion,composerVersion.current,reviewOnly)){setPrompt("");setRegion(undefined);setApproved([]);}
  const runId=++requestId.current,abort=new AbortController();controller.current=abort;previewQueue.current?.cancel();startedAt.current=Date.now();setElapsed(0);setPreviewError("");setErrorCode("");running.current=true;setBusy(true);setMobilePanel("preview");setSetup(false);setBrief(b);setError("");setClarification("");setReview(null);setShapeCount(0);setNotes([]);setRunCost(0);setSettledCalls(0);setRunUsage([]);setReferenceReused(false);repairSpend.current=null;
  let best:Completed|null=null,completedSuccessfully=false,applied=false,activeReference:DesignReference|undefined,passCorrections:string[]=[],firstViews:string[]=[],repairNote="";
  // Typed by assertion: they are assigned inside workflow callbacks, which flow analysis does not follow.
  let repairPack=undefined as {model:BuildModel;manual:ManualEdits}|undefined,repairCorrections=[] as string[];
  const alive=()=>{abort.signal.throwIfAborted();if(requestId.current!==runId)throw new DOMException("Cancelled","AbortError");};
  const keepReference=(ref:DesignReference)=>{activeReference=ref;referencePack.current=ref;setSheet(ref.sheet||null);if(composerVersion.current===runComposerVersion){setReference(ref.photo||null);setPhotos(ref.photos||[]);setIdentityHint(ref.identityHint||"");}};
  const saved=referencePack.current,identity=referenceKey(b);
  // The saved sheet is reused unless the feedback brings new evidence about what the subject is (a link, an identity
  // statement, a name the sheet does not know); new photos, a new place hint or a changed brief always look it up again.
  const refreshForFeedback=Boolean(!reviewOnly&&!continuing&&runPrompt&&!runRegion&&needsFreshResearch(runPrompt,saved?.sheet,baseScene||undefined));
  // When only the typed feedback forced the lookup, the confirmed sheet is what it refines and its fallback: an unready
  // answer keeps it, with the question shown, instead of stopping the pass after paying for the lookup. New photos or a
  // new hint get no fallback; recording them as researched would hide them from every later lookup.
  const usable=savedReference(saved,{...runReferences,briefKey:identity},refreshForFeedback),planned=(r?:DesignReference)=>r&&{...r,sheet:planSheet(r.sheet!,b)};
  const reusable=planned(usable.reusable),fallback=planned(usable.fallback);
  // A local or marked-area change is re-checked in targeted mode (three smaller views, no unchanged source images) and
  // merged with the previous review, whose layout verdict it cannot see. Without a previous review, or on a retry (which
  // may auto-repair, and a repair is compared on full evidence), the pass gets a full review.
  const priorReview=baseScene&&lastComplete.current?.scene===baseScene?lastComplete.current.review:review;
  const targeted=Boolean(original&&priorReview&&!reviewOnly&&!retrying&&!continuing&&!runReferenceEdited&&!briefEdited&&(runRegion||isLocalDesignEdit(runPrompt)));
  // One automatic repair at most, and only for a first build or an explicit retry.
  const eligible=!reviewOnly&&(!original||retrying);
  setReferenceReused(Boolean(reusable));
  if(fresh){setScene(null);setDraft(null);partialDraft.current=null;}
  const lookup=async():Promise<DesignReference>=>{
   setPhase("research");setStatus("Establishing the subject and layout…");
   const response=await fetch("/api/research",{method:"POST",signal:abort.signal,headers:headers(activeKey),body:JSON.stringify({idea:b.idea,scope:b.scope,composition:b.composition,features:b.features,reference:runReferences.photo,photos:runReferences.photos,identityHint:runReferences.identityHint.trim(),feedback:runPrompt||undefined,previous:fallback?.sheet?saved!.sheet:undefined})});
   const data=await response.json();alive();if(data.budget)trackBudget(data.budget);if(Array.isArray(data.usages))data.usages.forEach((usage:RequestUsage)=>recordCost(usage,"research"));else if(data.usage)recordCost(data.usage,"research");
   if(!response.ok)throw new GenerationError(data.error||"The reference lookup failed. Retry before spending on a design.",data.code||"REFERENCE_FAILED");
   const checked=referenceSheetSchema.safeParse(data.sheet);if(!checked.success)throw new GenerationError("The reference plan was incomplete. Retry the lookup before building.","REFERENCE_FAILED");
   const sheet=planSheet(checked.data as ReferenceSheet,b),ref={sheet,photo:runReferences.photo,photos:runReferences.photos,identityHint:runReferences.identityHint.trim(),briefKey:identity};
   if(data.passes>1)note("Research","Checked additional sources to resolve the structure or its layout.");
   const outcome=lookupOutcome(sheet,fallback);
   if(outcome!=="ready"){
    const question=data.question||referenceClarification(sheet);
    if(outcome==="fallback"&&fallback){note("Reference",`The new lookup could not confirm a change (${question}), so the confirmed reference for ${fallback.sheet.subject} is kept. Answer the question to change the subject.`);keepReference(fallback);setClarification(question);return fallback;}
    keepReference(ref);setClarification(question);setMobilePanel("refine");
    throw new GenerationError(question,"REFERENCE_CLARIFICATION");
   }
   keepReference(ref);note("Reference",`${sheet.subject}. ${sheet.summary}${sheet.layout?` Layout: ${sheet.layout}`:""}${sheet.uncertainties?.length?` Uncertain: ${sheet.uncertainties.join("; ")}`:""}`);
   return ref;
  };
  try{
   if(reviewOnly&&draft&&original){const ref=reusable||await lookup();keepReference(ref);const r=await visual(draft,b,abort,reviewRequest.current,activeKey,original.signature||[],ref,runRegion);alive();best={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:ref,model:draft,scene:original,review:r,brief:b,manual:manualRef.current,corrections:lastComplete.current?.corrections};}
   else{
    setMessages(m=>[...m,{role:"you",text}]);
    // draft:false keeps an automatic repair's partial out of the kept drafts: stopping it keeps the reviewed first build.
    const stream=async(previousScene:GeneratedScene|undefined,extra:{feedback?:string[];approved?:string[];renders?:string[];budget?:{limit:number;used:number;remaining:number;byComponent:{component:string;pieces:number}[]};label?:string;prompt?:string;draft?:boolean})=>{
     let header:SceneHeader|null=null,shapes:Shape[]=[],result:GeneratedScene|undefined,geometryError="",geometryDetail="",corrections:string[]=[];setShapeCount(0);
     const previews=new PreviewQueue<GeneratedScene,BuildModel>(async snapshot=>{const m=await compile(snapshot,b,original,true);return {...m,generation:snapshot,length:snapshot.dimensions.x,width:snapshot.dimensions.z,height:snapshot.dimensions.y};},m=>{if(requestId.current===runId){setDraft(m);setPreviewError("");if(extra.draft!==false&&m.generation&&canKeepPartial(m.generation,m))partialDraft.current={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:activeReference,model:m,scene:m.generation,review:null,brief:b,manual:stripSupports(manualRef.current)};}},e=>{if(requestId.current===runId&&!(e instanceof Error&&/draft is empty/.test(e.message)))setPreviewError(e instanceof Error?e.message:"Live preview could not update.");},350);previewQueue.current=previews;const cancelPreview=()=>previews.cancel();abort.signal.addEventListener("abort",cancelPreview,{once:true});
     // The designer's history carries the review's verdict and its own notes; the owner's history shows the caption.
     const response=await fetch("/api/generate",{method:"POST",signal:abort.signal,headers:headers(activeKey),body:JSON.stringify({prompt:extra.prompt||text,detail:b.size,brief:b,reference:activeReference?.photo,photos:activeReference?.photos,research:activeReference?.sheet,region:runRegion,previous:previousScene,locked,feedback:extra.feedback?.length?extra.feedback.map(f=>f.slice(0,1000)).slice(0,40):undefined,approved:extra.approved?.length?extra.approved:undefined,renders:extra.renders?.length?extra.renders:undefined,continuation:continuing||undefined,budget:extra.budget,history:revisions.current.slice(-8).map(({request,summary,builder})=>({request,summary:(builder||summary).slice(0,1000)}))})});
     if(!response.ok){const body=await response.json();throw new GenerationError(body.error||"Generation could not start.",body.code||"GENERATION_FAILED");}if(!response.body)throw Error("No generation stream was returned.");
     try{for await(const event of readEvents(response.body)){
      alive();if(event.type==="usage")recordCost(event.usage,"design");if(event.type==="budget")trackBudget(event.budget);else if(event.type==="thought")thought(extra.label||(original?"Revising":"Designing"),event.text);else if(event.type==="header"){header=event.header;if(event.header.signature?.length)note("Signature",event.header.signature.join(" · "));}
      else if(event.type==="base"){shapes=event.shapes;setShapeCount(shapes.length);}
      else if(event.type==="shape"){const at=shapes.findIndex(s=>(s.id||s.label)===(event.shape.id||event.shape.label));if(at>=0)shapes[at]=event.shape;else shapes.push(event.shape);setShapeCount(shapes.length);setStatus(`Shaping ${event.shape.label}…`);
       if(header)previews.push({...header,shapes:[...shapes]});
      }else if(event.type==="corrections"&&Array.isArray(event.items))corrections=event.items.filter((c:unknown)=>typeof c==="string").slice(0,12);
      else if(event.type==="complete")result=event.scene;else if(event.type==="error"){if(event.code==="INVALID_GEOMETRY"||/outside the build area|no volume|too complex|duplicate shape IDs|repeats too many|shape limit|incomplete design/.test(event.message)){geometryError=event.message;geometryDetail=typeof event.detail==="string"?event.detail:"";}else throw new GenerationError(event.message,event.code||"GENERATION_FAILED");}
     }}finally{await previews.flush();previews.cancel();abort.signal.removeEventListener("abort",cancelPreview);}
     alive();if(corrections.length)note("Corrections",corrections.join(" "));
     if(geometryError)throw new GenerationError(geometryError,"INVALID_GEOMETRY",undefined,undefined,geometryDetail||undefined);
     return {result,corrections};
    };
    const metrics=(model:BuildModel,r:VisualReview|null,ref?:DesignReference)=>repairMetrics(checksFor(model,b,ref?.sheet),r,model,b.maxPieces);
    // A targeted pass's review is merged with the previous one; the repair's re-check uses the same mode and views.
    const reviewed=(seen:VisualReview)=>targeted?mergeTargetedReview(priorReview,seen):seen;

    const result=await runDesignWorkflow({reference:reusable,lookup,signal:abort.signal,
     design:async(ref)=>{
      keepReference(ref);let candidate=original;
      const current=await compile(original||(candidate=foundationScene(b)),b);alive();if(!original)setDraft(current);
      // Repair feedback is what the checks found, what the app already corrected in the last pass, a rejected design's
      // detail and what the owner approved; never the reviewer's unrequested suggestions.
      const feedback=revisionFeedback({issues:original?checksFor(current,b,ref.sheet).issues:[],corrections:original?lastComplete.current?.corrections:undefined,rejected});
      const budget={limit:b.maxPieces,used:current.pieces.length,remaining:b.maxPieces-current.pieces.length,byComponent:componentBudget(candidate!,current)};
      setPhase("design");setStatus(original?"Revising the design…":"Shaping the design from its references…");
      const generated=await stream(candidate,{feedback,approved:approvedItems,budget});alive();passCorrections=generated.corrections;
      if(!generated.result)throw new GenerationError("The connection ended before the design finished. Your in-progress draft is kept.","CONNECTION_LOST");
      return generated.result;
     },
     compile:async(candidate,ref)=>{
      setPhase("check");setStatus("Packing bricks and checking the connections…");const packed=await assemble(candidate,b,original,{supports:true});alive();
      const model=packed.model;keepManual(packed.manual);if(packed.added)note("Supports",`Added ${packed.added} support piece${packed.added===1?"":"s"} under loose parts.`);
      setDraft(model);setPreviewError("");partialDraft.current=null;best={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:ref,model,scene:candidate,review:null,brief:b,manual:packed.manual,corrections:passCorrections};lastComplete.current=best;persist(model,candidate,null,b,ref);
      const checks=checksFor(model,b,ref.sheet);note("Checks",checks.pass?`${model.pieces.length.toLocaleString()} pieces. Digital checks passed.`:checks.issues.join(" "));
      return model;
     },
     review:async(model,candidate,ref)=>{
      const r=reviewed(await visual(model,b,abort,reviewRequest.current,activeKey,candidate.signature||[],ref,runRegion,targeted?"targeted":"full",views=>{firstViews=views;}));alive();
      // The paid review stays with this draft even if an automatic repair is then stopped.
      const done=lastComplete.current;if(done&&done.model===model){lastComplete.current={...done,review:r};persist(model,candidate,r,b,ref);}
      return r;
     },
     repair:{
      plan:(model,_candidate,r,ref)=>autoRepairAllowed({enabled:b.autoRepair!==false,eligible,remaining:budgetRef.current?.remaining,clarification:!referenceReady(ref.sheet)})?materialFailures(metrics(model,r,ref)):[],
      design:async(reasons,model,candidate,_r,ref)=>{
       repairSpend.current=0;setPhase("repair");setStatus(`Fixing ${reasons.length} flagged issue${reasons.length===1?"":"s"} automatically…`);note("Auto-fix",reasons.join(" "));
       const feedback=revisionFeedback({reasons,issues:checksFor(model,b,ref.sheet).issues,corrections:passCorrections});
       const generated=await stream(candidate,{feedback,renders:firstViews.slice(0,5),budget:{limit:b.maxPieces,used:model.pieces.length,remaining:b.maxPieces-model.pieces.length,byComponent:componentBudget(candidate,model)},label:"Auto-fixing",prompt:`Fix the problems the checks and the review found in this build, using the CURRENT MODEL VIEWs, with the smallest edits that keep everything else. ${reasons.join(" ")}`.slice(0,2000),draft:false});alive();
       repairCorrections=generated.corrections;
       if(!generated.result)throw new GenerationError("The automatic fix ended before it finished.","CONNECTION_LOST");
       return generated.result;
      },
      compile:async candidate=>{setPhase("check");setStatus("Packing the fixed design…");const packed=await assemble(candidate,b,original,{supports:true});alive();repairPack=packed;setDraft(packed.model);return packed.model;},
      // No re-check is paid for when the local measures already decide: an unchanged scene, a regression, or local
      // failures left unfixed.
      worth:(before,after)=>{const d=sceneDiff(before.scene,after.scene);return repairNeedsReview(metrics(before.model,before.review,activeReference),metrics(after.model,null,activeReference),d.added+d.changed+d.removed>0);},
      // The re-check sees what the first review saw (same mode, views and references), so verdicts compare item by item.
      review:async(model,candidate,ref)=>reviewed(await visual(model,b,abort,reviewRequest.current,activeKey,candidate.signature||[],ref,runRegion,targeted?"targeted":"full")),
      keep:(before,after)=>compareRepair(metrics(before.model,before.review,activeReference),metrics(after.model,after.review,activeReference)),
     },
    });alive();
    const kept=Boolean(result.repair?.kept&&repairPack);
    best={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:result.reference,model:result.model,scene:result.scene,review:result.review,brief:b,manual:kept?repairPack!.manual:lastComplete.current?.manual,corrections:kept?repairCorrections:passCorrections};
    if(result.repair){
     const {reasons,fixed,error,checked}=result.repair,cost=repairSpend.current||0;repairSpend.current=null;
     autoRepairs.current=[...autoRepairs.current,{at:new Date().toISOString(),reasons:reasons.slice(0,8).map(r=>r.slice(0,300)),kept,fixed:kept?fixed:0,cost:Math.round(cost*10000)/10000,checked}].slice(-20);
     repairNote=kept?`Auto-fixed ${fixed} issue${fixed===1?"":"s"} (+$${cost.toFixed(2)}).`:error?`The automatic fix stopped (+$${cost.toFixed(2)}): ${generationFailure(error).message} The first build is kept.`:checked?`Tried an automatic fix (+$${cost.toFixed(2)}); the re-check found it no better, so the first build is kept.`:`Tried an automatic fix (+$${cost.toFixed(2)}); it fixed nothing measurable, so the first build is kept without a second review.`;
     note("Auto-fix",repairNote);
    }
    if(result.reviewError){const failure=generationFailure(result.reviewError);setError(failure.message);setErrorCode(failure.code);}
   }
   alive();if(!best)throw Error("No complete draft is available.");
   if(best.manual)keepManual(best.manual);
   lastComplete.current=best;partialDraft.current=null;setInterrupted(false);setDraft(best.model);setScene(best.scene);setReview(best.review);if(mayClearSubmittedFeedback(runComposerVersion,composerVersion.current,reviewOnly)){setPrompt(best.review?"":runPrompt);setRegion(best.review?undefined:runRegion);setApproved(best.review?[]:runFeedback.approved||[]);}setPhase("done");persist(best.model,best.scene,best.review,b,best.reference);
   const checks=checksFor(best.model,b,best.reference?.sheet);
   setStatus(`${repairNote?`${repairNote} `:""}${checks.pass&&visualPassed(best.review)?"Finished. Every digital check passed.":"Draft ready. Review the flagged issues before refining."}`);
   const caption=splitCaption(best.scene.description).description||best.review?.summary||"",builder=builderSummary(best.review,best.scene);setMessages(m=>[...m,{role:"builder",text:caption}]);
   if(!reviewOnly)revisions.current=[...revisions.current,{request:text,summary:caption.slice(0,1000),...(builder?{builder}:{}),at:new Date().toISOString()}].slice(-50);
   persist(best.model,best.scene,best.review,b,best.reference);applied=true;completedSuccessfully=Boolean(best.review);
  }catch(e){
   if(requestId.current!==runId)return false;
   if(mayClearSubmittedFeedback(runComposerVersion,composerVersion.current,reviewOnly)){setPrompt(runPrompt);setRegion(runRegion);setApproved(runFeedback.approved||[]);}
   const recovered=best||partialDraft.current||lastComplete.current;
   if(recovered){reviewRequest.current=recovered.reviewRequest||"";reviewRegion.current=recovered.reviewRegion;if(recovered.manual)keepManual(recovered.manual);const ref=activeReference||recovered.reference,r=ref===recovered.reference&&sameBrief(recovered.brief,b)?recovered.review:null;setDraft(recovered.model);setScene(recovered.scene);setReview(r);persist(recovered.model,recovered.scene,r,b,ref,!best&&recovered===partialDraft.current);setInterrupted(!best&&recovered===partialDraft.current);setStatus("Your last draft and reference photos are kept.");}
   const failure=generationFailure(e);setError(failure.message);setErrorCode(failure.code);if(failure.code==="REFERENCE_CLARIFICATION")setStatus("Add a place detail or another photo to continue.");
   // A rejected drawing's technical detail goes back to the designer on the next pass, so a retry does not repeat it.
   if(failure.code==="INVALID_GEOMETRY")rejectedDetail.current=(failure.detail||"A shape was invalid or outside the build area.").slice(0,600);else if(rejected&&!rejectedDetail.current)rejectedDetail.current=rejected;
  }finally{repairSpend.current=null;if(requestId.current===runId){feedbackQueue.current.settle(runId,completedSuccessfully?"completed":"failed");syncQueue();running.current=false;activeFeedback.current=null;setBusy(false);controller.current=null;}}
  // Report whether this pass changed the design. A failed review still pauses
  // later queued work (settle above), but the applied feedback is not restored.
  return applied;
 }
 useEffect(()=>{
  if(!open||busy||running.current||preparingPhotos||markingRegion||queuedFeedback?.status!=="ready")return;
  if(budgetBlocked){pauseQueue();return;}
  const queued=feedbackQueue.current.takeReady();if(!queued)return;syncQueue();
  const session=editorSession.current;
  void run(false,undefined,undefined,queued.value).then(applied=>{
   if(!applied&&session===editorSession.current){feedbackQueue.current.restorePaused(queued);syncQueue();}
  });
 },[open,busy,preparingPhotos,markingRegion,queuedFeedback,budgetBlocked]);
 function retry(){
  if(CONNECTION_CODES.includes(errorCode)){askForKey();return;}
  void run(Boolean(scene&&!interrupted&&(phase==="done"||phase==="review")),undefined,undefined,undefined,true);
 }
 function useBuild(shop=false){if(!draft||!scene||busy)return;pauseQueue();if(!briefSchema.safeParse(brief).success){setError("Check the sign text and brief before keeping this draft.");return;}const lastRequest=messages.filter(m=>m.role==="you").at(-1)?.text;if(lastRequest&&revisions.current.at(-1)?.request!==lastRequest){const builder=builderSummary(review,scene);revisions.current=[...revisions.current,{request:lastRequest,summary:(splitCaption(scene.description).description||review?.summary||"").slice(0,1000),...(builder?{builder}:{}),at:new Date().toISOString()}].slice(-50);}const model:BuildModel={...draft,name:previous?.name||draft.name,generation:scene,shopping:previous?.shopping,detail:brief.size,libraryId:draftId.current,design:{brief,reference:referencePack.current,unfinished:interrupted,reviewRequest:reviewRequest.current,reviewRegion:reviewRegion.current,manual:manualRef.current,locked,revisions:revisions.current,review:review||undefined,reviewStale:!review,...(autoRepairs.current.length?{autoRepairs:autoRepairs.current}:{})}};requestId.current++;onCreate({model,detail:brief.size,color:draft.inventory.find(r=>r.color!=="gray")?.color||"white",accent:"white",shop});onOpenChange(false);requestAnimationFrame(()=>document.getElementById("build-table")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));}
 return <Dialog open={open} onOpenChange={v=>{if(!v){if(preparingPhotos){toast.info("Finishing your photos. This window can close in a moment.",{id:"photos-preparing"});return;}if(!previous&&!scene)onDraftChange?.({prompt:brief.idea===PHOTO_IDEA?"":brief.idea,photos:collectReferencePhotos(reference||undefined,photos)});stop();}onOpenChange(v);}}><DialogContent onEscapeKeyDown={e=>{if(markingRegion){e.preventDefault();setMarkingRegion(false);}}} onOpenAutoFocus={e=>{e.preventDefault();document.querySelector<HTMLElement>(".generator-dialog [data-slot=dialog-title]")?.focus({preventScroll:true});}} className={`generator-dialog design-flow ${setup?"is-brief":"is-design"} mobile-${mobilePanel} ${busy?"is-building":""}`}><DialogHeader><DialogTitle tabIndex={-1}>{setup?"Let’s make it yours.":busy?draft?"Taking shape.":"Every build starts with an idea.":draft?draft.name:error?"Let’s get this working.":"Your canvas is ready."}</DialogTitle><DialogDescription>{setup?"Start with your idea. The finer details are optional.":busy?"Follow the real design as it arrives, piece by piece.":draft?"Turn it around. Make it yours.":"Your idea is safe. Start when you’re ready."}</DialogDescription></DialogHeader>

 {!setup&&<div className="creation-toolbar"><span>{busy?phase==="review"?"Reviewing the details":phase==="check"?"Checking the connections":phase==="repair"?"Refining the design":draft?"Building live":"Composing your idea":draft&&phase==="done"?<><Check size={15}/>Finished · {draft.pieces.length.toLocaleString()} pieces</>:draft?`${draft.pieces.length.toLocaleString()} pieces`:"Ready when you are"}</span><div><button className="creation-motion" disabled={!draft||markingRegion} aria-pressed={motionPaused} onClick={()=>setMotionPaused(v=>!v)}>{motionPaused?<Play size={16}/>:<Pause size={16}/>}<span>{motionPaused?"Resume":"Pause motion"}</span></button><button className="creation-feedback-jump" onClick={()=>{setMobilePanel("refine");const input=document.getElementById("generation-prompt");input?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});input?.focus({preventScroll:true});}}><SlidersHorizontal size={16}/><span>Feedback</span></button></div></div>}{!setup&&<nav className="mobile-build-nav" aria-label="Build and feedback"><button type="button" onClick={jumpToBuild}><Box size={17}/>Build</button><button type="button" onClick={jumpToFeedback}><MessageSquare size={17}/>Feedback{queuedFeedback&&<span className="mobile-feedback-dot" aria-label="Feedback queued"/>}</button></nav>}<div className="generator-layout"><div id="creation-controls" className="generator-conversation">
 {!setup&&<form className="finish-feedback" onSubmit={e=>{e.preventDefault();submitFeedback();}}><label htmlFor="generation-prompt">What would you like to change?</label><div className="region-feedback-tools"><button type="button" disabled={!draft} aria-pressed={markingRegion} onClick={()=>markingRegion?setMarkingRegion(false):startMarking()}><LassoSelect size={16}/>{markingRegion?"Cancel marking":region?"Redraw area":"Mark an area on the model"}</button></div>{region&&<div className="feedback-region"><img src={region.image} alt="Your marked edit area on the model"/><div><strong>Marked area attached</strong><span>Describe what to change or add here.</span><button type="button" onClick={()=>editRegion(undefined)}><X size={14}/>Remove area</button></div></div>}<Textarea id="generation-prompt" inputMode="text" enterKeyHint="enter" autoCapitalize="sentences" rows={3} maxLength={2000} value={prompt} onChange={e=>editPrompt(e.target.value)} placeholder="Make the roof steeper, add the missing tower, or match this new photo."/><button type="submit" className="button primary feedback-submit" disabled={budgetBlocked||preparingPhotos||markingRegion||actions.submitDisabled}><Send size={16}/>{actions.submit}</button>{actions.secondary&&<button type="button" className="button secondary feedback-fix" disabled={budgetBlocked||preparingPhotos||markingRegion} onClick={submitFeedback}>{interrupted?<ArrowRight size={15}/>:<Wrench size={15}/>}{actions.secondary}</button>}<p className="feedback-hint">{busy?"Keep watching or writing. Submitted feedback runs after this build and its review finish.":"Describe the change, then select Revise build. You can add photos below."}</p>
 {queuedFeedback&&<div className="feedback-queue" role="status"><strong>{queuedFeedback.status==="paused"?"Feedback saved · waiting for you":"Feedback queued for the next pass"}</strong><p>{queuedFeedback.value.text||"Update the build using the attached photos and place details."}</p><span>{collectReferencePhotos(queuedFeedback.value.references.photo,queuedFeedback.value.references.photos).length} reference photos{queuedFeedback.value.region?" · Marked area attached":""}</span>{queuedFeedback.value.region&&<img className="queued-region-image" src={queuedFeedback.value.region.image} alt="Marked area for the queued revision"/>}{queuedFeedback.status==="paused"&&<p>The current pass stopped or needs attention. Apply this feedback when you’re ready.</p>}<div className="feedback-queue-actions">{queuedFeedback.status==="paused"&&<button type="button" className="button secondary" disabled={busy||preparingPhotos||budgetBlocked} onClick={resumeQueuedFeedback}>Apply queued feedback</button>}<button type="button" className="button secondary" disabled={preparingPhotos} onClick={editQueuedFeedback}>Edit</button><button type="button" className="button secondary" onClick={()=>{feedbackQueue.current.cancel();syncQueue();}}>Cancel queue</button></div></div>}
 {referenceInputs}<SignInput text={brief.signText||""} onChange={editSign} maxWidth={brief.maxWidth} maxDepth={brief.maxDepth} maxHeight={brief.maxHeight} disabled={busy||preparingPhotos}/>{draft&&!busy&&scene&&<div className="review-actions finish-actions"><button type="button" className="button secondary" disabled={interrupted||budgetBlocked||preparingPhotos} onClick={()=>void run(true)}><Eye size={14}/>Review again</button>{brief.size!=="large"&&<button type="button" className="button secondary" disabled={budgetBlocked||preparingPhotos} title="Start over at the largest size, 4,000 pieces in 80 × 80 studs" onClick={()=>void run(false,undefined,{brief:{...brief,size:"large",maxWidth:80,maxDepth:80,maxHeight:160,maxPieces:4000}})}><Maximize2 size={14}/>Rebuild bigger</button>}<button type="button" className="button secondary" disabled={preparingPhotos} onClick={()=>useBuild(true)} title="Open the shopping list for this design"><ShoppingBag size={14}/>Get the pieces</button><button type="button" className="button primary" disabled={preparingPhotos} onClick={()=>useBuild()}>Open in studio<ArrowRight size={16}/></button></div>}</form>}

 {setup?<><BriefForm brief={brief} onChange={b=>{setBrief(b);setReview(null);}}/>{referenceInputs}</>:<><div className="brief-recap"><strong>{brief.idea}</strong><span>{briefRecap(brief)}</span><button disabled={busy||preparingPhotos||markingRegion} onClick={()=>setSetup(true)}>Edit brief</button></div>
 {sheet&&<div className="reference-identity" role="status"><strong>{referenceEdited?"References updated · ready to check":referenceReady(sheet)?`Identified: ${sheet.subject}`:"Let’s identify the structure"}</strong>{!referenceEdited&&sheet.identity?.location&&<span>{sheet.identity.location}</span>}</div>}
 {sheet&&<details className="reference-sheet"><summary>Reference plan · {sheet.hero||sheet.subject}</summary><p>{sheet.summary}</p>{sheet.images?.length?<div className="reference-photos">{sheet.images.map(image=><a key={image.url} href={image.source} target="_blank" rel="noreferrer"><img src={image.url} alt={image.caption||"Source reference"} loading="lazy" referrerPolicy="no-referrer"/>View source</a>)}</div>:null}{sheet.layout&&<p>{sheet.layout}</p>}{sheet.included?.length? <p><strong>Include:</strong> {sheet.included.join(", ")}</p>:null}{sheet.excluded?.length?<p><strong>Leave out:</strong> {sheet.excluded.join(", ")}</p>:null}{sheet.relations?.length?<ul>{sheet.relations.map((r,i)=><li key={i}>{r.from} {r.relation.replaceAll("_"," ")} {r.to}</li>)}</ul>:null}{sheet.uncertainties?.length?<p><strong>Uncertain:</strong> {sheet.uncertainties.join("; ")}</p>:null}{sheet.target&&<p>Proportional size guide: {sheet.target.x} × {sheet.target.z} studs, {sheet.target.y} plates tall. The build may be smaller to fit the piece limit.</p>}{sheet.sources.length>0&&<small>{sheet.sources.map((u,i)=><a key={i} href={u} target="_blank" rel="noreferrer">Source {i+1}</a>)}</small>}</details>}

 {scene&&!busy&&scene.signature&&scene.signature.length>0&&<div className="reference-sheet signature-sheet"><strong>Signature features</strong><p>{scene.signature.join(" · ")}</p></div>}
 {scene&&!busy&&<details className="component-locks"><summary><LockKeyhole size={15}/>{locked.length?`${locked.length} components protected`:"Protect parts you already love"}</summary><p>Locked components keep their geometry and color. Revisions that overlap them are rejected.</p><div>{components.map(c=><label key={c}><Checkbox checked={locked.includes(c)} onCheckedChange={v=>setLocked(list=>v?[...list,c]:list.filter(x=>x!==c))}/>{c}</label>)}</div>{(manual.bricks.length>0||manual.erase.length>0)&&<p>{manual.bricks.length} edited bricks and {manual.erase.length} erased regions are also protected.</p>}</details>}
 {notes.length>0&&<details className="builder-notes"><summary>What the builder is thinking</summary><div className="builder-notes-list">{notes.map((n,i)=><div key={i} className={`builder-note ${n.live?"is-live":""}`}><span>{n.phase}</span><p>{n.text}</p></div>)}</div></details>}
 <details className="design-history"><summary>Design history</summary><div className="generation-messages">{messages.slice(-6).map((m,i)=><div className={`generation-message message-${m.role}`} key={i}><span>{m.role==="you"?"YOU":"BRICKS"}</span><p>{m.text}</p></div>)}</div></details>
 </>}
 {!setup&&!scene&&clarification&&<button className="button primary" disabled={busy||preparingPhotos||budgetBlocked} onClick={()=>void run()}>Check references and continue<ArrowRight size={16}/></button>}
 <AIConnection configured={configured} apiKey={apiKey} busy={busy||preparingPhotos} active={open} expanded={showConnection} onExpand={setShowConnection} setup={setup} budget={budget} onBudget={setBudget} onConnect={key=>{setApiKey(key);setShowConnection(false);setError("");setErrorCode("");if(setup)void run(false,key);}} onForget={()=>{setApiKey("");setBudget(null);}}/>
 {busy&&<button className="button secondary" onClick={stop}><Square size={14}/>Stop and keep last draft</button>}
 {setup&&error&&errorCode!=="REFERENCE_CLARIFICATION"&&<div className="creation-error" role="alert"><p>{error}</p>{!busy&&!budgetBlocked&&<button className="button secondary" onClick={retry}>{CONNECTION_CODES.includes(errorCode)?<KeyRound size={14}/>:<RotateCcw size={14}/>}{retryLabel(errorCode,interrupted,Boolean(scene&&(phase==="done"||phase==="review")))}</button>}</div>}
 </div><div className="generation-preview"><div className="generation-preview-header"><span>{setup?"YOUR DESIGN BRIEF":busy?phase==="repair"?"REFINING":"LIVE DESIGN":draft?.name||"YOUR 3D BUILD"}</span>{busy&&<span><LoaderCircle size={13} className="spin"/>{shapeCount} shape definitions</span>}</div>
 {!setup&&<><div className="generation-canvas">{draft?<Viewport regionMode={markingRegion} onRegion={attachRegion} onCancelRegion={()=>setMarkingRegion(false)} arrivals={{epoch:replay,paused:motionPaused,mode:arrivalMode}} pieces={draft.pieces} length={draft.length} width={draft.width} height={draft.height} modelKey="live-creation" explode={0} stage={100000} selected={null} view={view} reset={0} rotate={false} onPick={()=>{}}/>:<div className="generation-empty"><span className="empty-stage-label">{busy?"THE FIRST PIECES ARE ON THEIR WAY":error?"GENERATION PAUSED":"YOUR NEXT CREATION"}</span><strong>{busy?brief.idea:error?"Your idea is still here.":"An open canvas."}</strong><p>{busy?"Waiting for the builder’s first geometry. Bricks will appear here as soon as it arrives.":error?error:"Start a design from your brief."}</p>{!busy&&<button className="button primary" onClick={()=>setSetup(true)}>Back to my brief<ArrowRight size={16}/></button>}</div>}</div><button className="generation-assembly" disabled={!draft||busy||markingRegion} onClick={()=>{setMotionPaused(false);setArrivalMode("assemble");setReplay(v=>v+1);}}><Play size={17} fill="currentColor"/>Replay assembly</button><div className="review-camera">{["perspective","front","top"].map(v=><button key={v} disabled={markingRegion} className={view===v?"active":""} onClick={()=>setView(v)}>{v}</button>)}</div></>}
 {previewError&&<p className="live-preview-error" role="status">Preview update: {previewError} The last visible draft is kept.</p>}{error&&errorCode!=="REFERENCE_CLARIFICATION"&&<div className="stage-recovery" role="alert"><div><strong>{interrupted?"Your progress is kept.":draft&&scene?"Your design is kept.":"Let’s get your build going."}</strong><p>{error}</p></div>{!busy&&!budgetBlocked&&<button className="button secondary" onClick={retry}>{retryLabel(errorCode,interrupted,Boolean(scene&&(phase==="done"||phase==="review")))}</button>}</div>}{busy&&<button className="mobile-stop button secondary" onClick={stop}><Square size={14}/>Stop and keep draft</button>}<div className={`generation-status ${draft&&!busy&&scene&&!setup?"is-finished":""}`} role="status">{busy?<LoaderCircle size={15} className="spin"/>:ready?<Check size={15}/>:<Sparkles size={15}/>}<p>{status||(scene?"Ready for your feedback.":"Your brief is ready when you are.")}</p>{settledCalls>0&&<span className="live-budget">Recorded this run: ${runCost.toFixed(3)} · {settledCalls} calls</span>}{settledCalls>0&&<RunUsage entries={runUsage} referenceReused={referenceReused}/>}{budget&&<span className="live-budget">${budget.remaining.toFixed(2)} available · $10 limit</span>}{busy&&<span className="live-elapsed">{elapsed}s · {(draft?.pieces.length||0).toLocaleString()} bricks</span>}</div>

 {draft&&!busy&&scene&&!setup&&<div className="generation-result">{interrupted&&<p className="unfinished-draft">Unfinished draft. Continue building before reviewing the complete design.</p>}<div><strong>{draft.pieces.length.toLocaleString()} pieces</strong><span>{(draft.length*.8).toFixed(1)} × {(draft.width*.8).toFixed(1)} × {(draft.height*.32).toFixed(1)} cm</span></div><details className="design-inspection"><summary>{ready?"Design checks passed":"Review design checks"}<span>{checks?.issues.length||0} geometry issues</span></summary><div className={`review-verdict ${ready?"passed":"needs-work"}`}><strong>{ready?"Digital checks passed":"Needs review"}</strong><span>{checks?.pass?"Support paths and size limits pass.":`${checks?.issues.length} geometry or brief checks need attention.`} {reviewPassed?"Visual brief review passes.":"Visual brief review is incomplete or has concerns."}</span></div>
 {checks&&checks.issues.length>0&&<ul className="review-issues">{checks.issues.map(i=><li key={i}>{i}</li>)}</ul>}{review&&<div className="feature-review"><p>{review.summary}</p>{review.scope==="targeted"&&<p className="review-limit">The change was checked in three views; the layout verdict is from the last full review. Use Review again for a full check.</p>}{review.composition&&<div><strong>Composition · {review.composition.status.replace("_"," ")}</strong><p>{review.composition.evidence}</p></div>}{review.revision&&review.revision.status!=="not_requested"&&<div><span className={`feature-state ${review.revision.status}`}>{review.revision.status}</span><strong>Your requested change</strong><p>{review.revision.evidence}</p></div>}{review.features.map((f,i)=><div key={i}><span className={`feature-state ${f.status}`}>{f.status}</span><strong>{f.feature}</strong><p>{f.evidence}</p></div>)}{review.rubric?.map((f,i)=><div key={`rubric-${i}`}><span className={`feature-state ${f.status}`}>{f.status}</span><strong>{f.feature}</strong><p>{f.evidence}</p></div>)}</div>}{diff&&previous&&<p className="diff-summary">{diff.added} shapes added · {diff.changed} changed · {diff.removed} removed</p>}<p className="review-limit">Digital checks cover geometry, support paths and visible details. Physical strength, fit and hand access still need a test build.</p>
 </details></div>}
 </div></div>{setup&&<div className="brief-commit"><span>Up to {brief.maxPieces.toLocaleString()} pieces<small>{detailLabel(brief.detail)} design</small></span><button className="button primary begin-design" disabled={brief.idea.trim().length<3||busy||preparingPhotos||configured===null&&!apiKey} onClick={()=>void run()}><Sparkles size={17}/>{configured===null&&!apiKey?"Checking connection…":configured||apiKey?scene?"Rebuild design":"Build my design":"Connect & build"}<ArrowRight size={17}/></button></div>}</DialogContent></Dialog>;
}
