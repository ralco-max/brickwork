"use client";
import {toast} from "sonner";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from "react";
import {flushSync} from "react-dom";
import {ArrowRight,Check,LoaderCircle,RotateCcw,Send,Square,Sparkles,LockKeyhole,Eye,Play,Pause,SlidersHorizontal,Maximize2,ShoppingBag,LassoSelect,X,KeyRound,Ellipsis,MousePointerClick,ScrollText,MapPin,Type,Box} from "lucide-react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from "@/components/ui/dropdown-menu";
import AIConnection from "./ai-connection";
import {isLocalDesignEdit,needsFreshResearch,lookupOutcome,savedReference} from "@/lib/ai-efficiency";
import RunUsage from "./run-usage";
import type {UsageStage,RunUsageEntry} from "./run-usage";
import {stopCostNotice,QUALITY_MODELS} from "@/lib/ai-budget";
import type {BudgetSnapshot,RequestUsage} from "@/lib/ai-budget";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/checkbox";
import Viewport,{type RegionCapture} from "./viewport";
import type {RevisionRegion} from "@/lib/revision-region";
import {revisionSceneKey} from "@/lib/revision-region";
import {regionBoundsForPieces} from "@/lib/region-selection";
import {saveDesign,packDesign,newDesignId,listDesigns} from "@/lib/design-library";
import type {ReferenceSheet} from "@/lib/design-research";
import {planTarget,referenceSheetSchema,referenceReady,referenceClarification} from "@/lib/design-research";
import {runDesignWorkflow,repairMetrics,materialFailures,autoRepairAllowed,compareRepair,repairNeedsReview,mergeTargetedReview,approvedFeedback,revisionFeedback} from "@/lib/design-workflow";
import {clipSentence} from "@/lib/utils";
import {FeedbackQueue,mayClearSubmittedFeedback,queuedLabel} from "@/lib/feedback-queue";
import type {QueuedFeedback} from "@/lib/feedback-queue";
import {reviewSuggestions,isRetryItem,historyLabel,quickRequest,QUICK_ACTIONS,plainThought} from "@/lib/feedback-suggestions";
import type {QuickAction} from "@/lib/feedback-suggestions";
import {pieceOwners,piecesOf,componentsInBounds,componentDiff,diffSummary,highlightChanges,addVersion,keepVersion,sameVersion,previousVersion,compactReview,composeRegion,componentLabel} from "@/lib/revision-history";
import type {TapCapture} from "@/lib/revision-history";
import BriefForm from "./design-brief";
import SignInput from "./sign-input";
import {signMetrics} from "@/lib/brick-lettering";
import ReferenceInputs,{mergeReferencePhotos,type ReferenceInputValue} from "./reference-inputs";
import PhotoAttachments from "./photo-attachments";
import ReviewSuggestions from "./review-suggestions";
import RevisionResult from "./revision-result";
import RevisionStrip from "./revision-strip";
import BuildRating from "./build-rating";
import {collectReferencePhotos} from "@/lib/reference-photos";
import {normalizeScene,componentBudget,splitCaption} from "@/lib/generated-scene";
import {PreviewQueue,foundationScene,type ArrivalMode} from "@/lib/live-arrivals";
import {readEvents} from "@/lib/generation-stream";
import {canKeepPartial,continuationPrompt} from "@/lib/generation-recovery";
import {GenerationError,generationFailure} from "@/lib/generation-errors";
import {briefSchema,defaultBrief,emptyManual,designChecks,sceneDiff,referenceKey} from "@/lib/design-project";
import type {DesignBrief,VisualReview,ManualEdits,DesignReference,AutoRepairRecord,DesignVersion} from "@/lib/design-project";
import type {GeneratedScene,SceneHeader,Shape} from "@/lib/generated-scene";
import type {BuildModel} from "@/lib/models";
import type {Creation} from "./create-build";
import {PHOTO_IDEA} from "@/lib/idea-draft";
import type {IdeaDraft} from "@/lib/idea-draft";
import "./styles/feedback.css";
// autoStart: skip the brief and build at once with initialBrief (merged over the idea's defaults).
type Props={open:boolean;onOpenChange:(open:boolean)=>void;initialPrompt:string;initialPhotos?:string[];onDraftChange?:(draft:IdeaDraft)=>void;previous?:BuildModel;onCreate:(creation:Creation)=>void;autoStart?:boolean;initialBrief?:Partial<DesignBrief>};
// The composer's targets: a drawn area, tapped parts and the captured view of them, kept so a queued or stopped pass
// restores the composer exactly.
type Selection={lasso?:RevisionRegion;picked:string[];tap?:TapCapture};
// approved: review suggestions the owner ticked for this pass; only these, the failed checks and the automatic
// corrections reach the designer as repair feedback. typed: exactly what the owner wrote (history shows it).
type FeedbackSnapshot={region?:RevisionRegion;text:string;typed?:string;references:ReferenceInputValue;version:number;approved?:string[];selection?:Selection};
// manual: the protected edits this draft was packed with (its automatic support columns included).
type Completed={reviewRegion?:RevisionRegion;reviewRequest?:string;reference?:DesignReference;model:BuildModel;scene:GeneratedScene;review:VisualReview|null;brief:DesignBrief;manual?:ManualEdits;corrections?:string[]};
type Panel=""|"locks"|"sign"|"place"|"history"|"bigger";
// One column below this width (feedback.css): the composer is pinned to the bottom and the suggestions move up, under
// the canvas, so they are not the last thing on the page.
const NARROW="(max-width: 1000px)";
const watchNarrow=(change:()=>void)=>{const media=window.matchMedia(NARROW);media.addEventListener("change",change);return()=>media.removeEventListener("change",change);};
const useNarrow=()=>useSyncExternalStore(watchNarrow,()=>window.matchMedia(NARROW).matches,()=>false);
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
// One send button. An empty composer never starts a paid run: it needs words or ticked suggestions. While a pass runs,
// sending queues the next one.
export function composerActions(s:{busy:boolean;queued:boolean;typed:boolean;fixes:number}){
 return {submit:s.busy?s.queued?"Replace queued":"Queue":!s.typed&&s.fixes?`Apply ${s.fixes} fix${s.fixes===1?"":"es"}`:"Send",submitDisabled:!s.typed&&!s.fixes};
}
// The status after a pass: failed design checks are named (they are tickable under Suggested fixes) before the review.
export const finishStatus=(issues:number,reviewPassed:boolean)=>issues?`${issues} design check${issues===1?" needs":"s need"} a look. ${issues===1?"It is":"They are"} listed under Suggested fixes.`:reviewPassed?"Finished. Every check passed.":"Ready for your feedback.";
const CONNECTION_CODES=["AI_AUTH","AI_NOT_CONNECTED"];
export const retryLabel=(code:string,interrupted:boolean,reviewing:boolean)=>CONNECTION_CODES.includes(code)?"AI settings":interrupted?"Continue design":reviewing?"Retry review":"Try again";
// The key field mounts with the connection card, so it is revealed after that render; it often sits below the fold.
export function revealConnectionKey(doc:Pick<Document,"getElementById">=document,smooth=!window.matchMedia("(prefers-reduced-motion: reduce)").matches){const input=doc.getElementById("generation-key");if(!input)return false;input.scrollIntoView({block:"center",behavior:smooth?"smooth":"auto"});input.focus({preventScroll:true});return true;}
// A tap carries a still of the canvas with the selection highlighted. The renderer keeps no frame between draws, so the
// still is read in an animation frame after the viewport has drawn.
export function canvasStill(source:HTMLCanvasElement|null,background="#eef2f4"){
 try{
  if(!source||!source.width||!source.height)return undefined;const canvas=document.createElement("canvas"),scale=Math.min(1,960/Math.max(source.width,source.height));canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));const context=canvas.getContext("2d");if(!context)return undefined;context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);
  // An offscreen canvas is not redrawn, so its buffer reads back empty: a still with no variation is no still.
  const probe=document.createElement("canvas");probe.width=probe.height=24;const p=probe.getContext("2d",{willReadFrequently:true});if(p){p.drawImage(canvas,0,0,24,24);const d=p.getImageData(0,0,24,24).data;let spread=0;for(let i=4;i<d.length;i+=4)spread=Math.max(spread,Math.abs(d[i]-d[0]),Math.abs(d[i+1]-d[1]),Math.abs(d[i+2]-d[2]));if(spread<12)return undefined;}
  const image=canvas.toDataURL("image/jpeg",.82);return /^data:image\/jpeg;base64,/.test(image)&&image.length<1400000?image:undefined;
 }catch{return undefined;}
}
// Which component owns each brick of a shown build, computed once per build and scene.
const ownerCache=new WeakMap<BuildModel,{scene:GeneratedScene;map:Map<number,string>}>();
function ownersOf(model:BuildModel|null,scene:GeneratedScene|null){if(!model||!scene)return null;const hit=ownerCache.get(model);if(hit&&hit.scene===scene)return hit.map;try{const map=pieceOwners(scene,model.pieces);ownerCache.set(model,{scene,map});return map;}catch{return null;}}
const PANEL_TITLES:Record<Exclude<Panel,"">,string>={locks:"Protect parts",sign:"Sign text",place:"Place or structure",history:"Design history",bigger:"Rebuild bigger?"};
const smoothScroll=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
export default function Generator({open,onOpenChange,initialPrompt,initialPhotos,onDraftChange,previous,onCreate,autoStart=false,initialBrief}:Props){
 const [reference,setReference]=useState<string|null>(null),[photos,setPhotos]=useState<string[]>([]),[identityHint,setIdentityHint]=useState(""),[preparingPhotos,setPreparingPhotos]=useState(false),[clarification,setClarification]=useState(""),[sheet,setSheet]=useState<ReferenceSheet|null>(null);
 const reviewRequest=useRef(""),reviewRegion=useRef<RevisionRegion|undefined>(undefined);
 const [lasso,setLasso]=useState<RevisionRegion|undefined>(undefined),[picked,setPicked]=useState<string[]>([]),[tap,setTap]=useState<TapCapture|undefined>(undefined),[markingRegion,setMarkingRegion]=useState(false),[panel,setPanel]=useState<Panel>(""),[partsOpen,setPartsOpen]=useState(false);
 // panelOpener: the control a panel was opened from, focused again when it closes.
 const panelOpener=useRef<HTMLElement|null>(null),moreButton=useRef<HTMLButtonElement>(null),narrow=useNarrow();
 const composerVersion=useRef(0),editorSession=useRef(0),feedbackQueue=useRef(new FeedbackQueue<FeedbackSnapshot>()),activeFeedback=useRef<FeedbackSnapshot|null>(null),tapToken=useRef(0);
 const [queuedFeedback,setQueuedFeedback]=useState<QueuedFeedback<FeedbackSnapshot>|null>(null);
 const syncQueue=()=>setQueuedFeedback(feedbackQueue.current.pending);
 const pauseQueue=()=>{feedbackQueue.current.pause();syncQueue();};
 const referencePack=useRef<DesignReference|undefined>(undefined);
 const draftId=useRef("");
 // Refs for values a running pass must read fresh: the packed manual edits, the locks, the live budget, the auto-repair
 // log, a rejected design's technical detail (the next pass hands it back to the designer) and the kept versions.
 const manualRef=useRef<ManualEdits>(emptyManual()),lockedRef=useRef<string[]>([]),budgetRef=useRef<BudgetSnapshot|null>(null),autoRepairs=useRef<AutoRepairRecord[]>([]),rejectedDetail=useRef(""),repairSpend=useRef<number|null>(null);
 const pending=useRef(new Map<number,{resolve:(packed:{model:BuildModel;manual?:ManualEdits;added?:number})=>void;reject:(error:Error)=>void}>()),lastComplete=useRef<Completed|null>(null),revisions=useRef<NonNullable<BuildModel["design"]>["revisions"]>([]);
 const versionsRef=useRef<DesignVersion[]>([]),currentRef=useRef<number|null>(null),[versions,setVersions]=useState<DesignVersion[]>([]),[current,setCurrent]=useState<number|null>(null);
 // peek: a kept version shown instead of the current one. compare: Before/After is in use. tint: recolor what changed.
 const [peek,setPeek]=useState<number|null>(null),[compare,setCompare]=useState(false),[tint,setTint]=useState(false),[versionModels,setVersionModels]=useState<Record<number,BuildModel>>({});
 const showVersion=(n:number|null,c=false)=>{setPeek(n);setCompare(c);if(n===null&&!c)setTint(false);};
 const syncVersions=(list:DesignVersion[],n:number|null)=>{versionsRef.current=list;currentRef.current=n;setVersions(list);setCurrent(n);};
 // dirty: this session changed the design (a pass, a restore or new locks), so closing keeps the current version.
 const dirty=useRef(false),autoPending=useRef(false),savedOnce=useRef(false);
 // pendingRun: the exact build a missing key interrupted, started once the key is connected (and dropped on Not now).
 // Its arguments are kept, not a closure, so the build reads the composer as it is when the key arrives.
 type PendingRun={fresh?:{brief:DesignBrief};submitted?:FeedbackSnapshot;retrying:boolean};
 const pendingRun=useRef<PendingRun|null>(null),[pendingBuild,setPendingBuild]=useState(false);
 const deferRun=(go:PendingRun|null)=>{pendingRun.current=go;setPendingBuild(Boolean(go));};
 // What the More menu does once it has closed (show a panel, focus Stop or the key field) instead of refocusing its
 // trigger. Scrolling waits for the close too: the open menu locks the dialog's scroll.
 const afterMenu=useRef<(()=>void)|null>(null);
 // The running pass's history label (typed: the owner's own words), for a build kept when that pass is stopped.
 const activeLabel=useRef({label:"",request:"",typed:false});
 const designFor=(b:DesignBrief,ref:DesignReference|undefined,unfinished:boolean,r:VisualReview|null)=>({brief:b,reference:ref,unfinished,reviewRequest:reviewRequest.current,reviewRegion:reviewRegion.current,manual:manualRef.current,locked:lockedRef.current,revisions:revisions.current,review:r||undefined,reviewStale:!r,...(autoRepairs.current.length?{autoRepairs:autoRepairs.current}:{}),...(versionsRef.current.length?{versions:versionsRef.current}:{})});
 // Every completed or kept draft is written to the browser's design library so backing out never loses it.
 const persist=(m:BuildModel,s:GeneratedScene,r:VisualReview|null,b:DesignBrief,ref=referencePack.current,unfinished=false)=>{if(!briefSchema.safeParse(b).success)return;savedOnce.current=true;try{void saveDesign(packDesign({...m,name:previous?.name||m.name,generation:s,shopping:previous?.shopping,detail:b.size,libraryId:draftId.current,design:designFor(b,ref,unfinished,r)},"draft")).then(saved=>{if(!saved)toast.warning("This draft could not be saved to your designs. Browser storage may be full or blocked; keep this tab open or export the project.",{id:"draft-save-failed"});});}catch{/* drafts that cannot be serialized stay in this tab */}};
 const [budget,setBudget]=useState<BudgetSnapshot|null>(null);
 useEffect(()=>{budgetRef.current=budget;},[budget]);
 // holds: the reservations of requests still running, the most a Stop can keep.
 const holds=useRef<number[]>([]),[stopHold,setStopHold]=useState(0);
 const trackBudget=(b:BudgetSnapshot)=>{budgetRef.current=b;setBudget(b);if(typeof b.hold==="number"&&b.hold>0){holds.current=[...holds.current,b.hold];setStopHold(holds.current.reduce((a,h)=>a+h,0));}};
 // The builder's notes: what it looked up, the scale it settled on, its own reasoning summaries as they stream, the architect's critique and the review.
 const [runCost,setRunCost]=useState(0),[settledCalls,setSettledCalls]=useState(0);
 const [runUsage,setRunUsage]=useState<RunUsageEntry[]>([]),[referenceReused,setReferenceReused]=useState(false);
 const recordCost=(usage:RequestUsage,stage:UsageStage)=>{if(typeof usage?.cost==="number"&&Number.isFinite(usage.cost)&&usage.cost>=0){if(repairSpend.current!==null)repairSpend.current+=usage.cost;holds.current=holds.current.slice(1);setStopHold(holds.current.reduce((a,h)=>a+h,0));setRunCost(c=>c+usage.cost!);setSettledCalls(c=>c+1);setRunUsage(rows=>[...rows,{...usage,stage}]);}};
 const [notes,setNotes]=useState<{phase:string;text:string;live?:boolean}[]>([]);
 const note=(phase:string,text:string)=>{const clean=text.trim();if(clean)setNotes(list=>[...list,{phase,text:clean}]);};
 const thought=(phase:string,delta:string)=>setNotes(list=>{const last=list[list.length-1];if(last&&last.live&&last.phase===phase)return [...list.slice(0,-1),{...last,text:(last.text+delta).slice(-6000)}];return [...list,{phase,text:delta.trimStart(),live:true}];});
 const [interrupted,setInterrupted]=useState(false),[errorCode,setErrorCode]=useState("");
 // An accounting error settles that one request; the rest of the budget stays available, so it may be retried.
 const budgetBlocked=["BUDGET_LIMIT","BUDGET_MODEL"].includes(errorCode);
 const partialDraft=useRef<Completed|null>(null);
 const [motionPaused,setMotionPaused]=useState(false),[replay,setReplay]=useState(0),[arrivalMode,setArrivalMode]=useState<ArrivalMode>("assemble"),[previewError,setPreviewError]=useState(""),[elapsed,setElapsed]=useState(0);
 const startedAt=useRef(0),previewQueue=useRef<PreviewQueue<GeneratedScene,BuildModel>|null>(null);
 const [brief,setBrief]=useState<DesignBrief>(defaultBrief()),[setup,setSetup]=useState(true),[prompt,setPrompt]=useState(""),[busy,setBusy]=useState(false),[phase,setPhase]=useState(""),[status,setStatus]=useState(""),[error,setError]=useState("");
 const [draft,setDraft]=useState<BuildModel|null>(null),[scene,setScene]=useState<GeneratedScene|null>(null),[review,setReview]=useState<VisualReview|null>(null),[configured,setConfigured]=useState<boolean|null>(null),[view,setView]=useState("perspective");
 const [apiKey,setApiKey]=useState(""),[showConnection,setShowConnection]=useState(false),[keyReveal,setKeyReveal]=useState(0),[locked,setLockedState]=useState<string[]>([]),[manual,setManual]=useState<ManualEdits>(emptyManual()),[approved,setApproved]=useState<string[]>([]),[messages,setMessages]=useState<{role:"you"|"builder";text:string}[]>([]);
 const [completedBrief,setCompletedBrief]=useState<DesignBrief|undefined>(undefined),[pack,setPackState]=useState<DesignReference|undefined>(undefined),[askedFor,setAskedFor]=useState(""),[sessionKey,setSessionKey]=useState(0);
 // Render reads these mirrors; running passes read the refs, which are always current.
 const setComplete=(c:Completed|null)=>{lastComplete.current=c;setCompletedBrief(c?.brief);},setPack=(r:DesignReference|undefined)=>{referencePack.current=r;setPackState(r);},setRequest=(v:string)=>{reviewRequest.current=v;setAskedFor(v);};
 const [working,setWorking]=useState(""),[lastRequest,setLastRequest]=useState(""),[lastTyped,setLastTyped]=useState(false),[repairNote,setRepairNote]=useState(""),[corrections,setCorrections]=useState<string[]>([]);
 const setLocked=(list:string[])=>{lockedRef.current=list;setLockedState(list);};
 const controller=useRef<AbortController|null>(null),requestId=useRef(0),worker=useRef<Worker|null>(null),workerId=useRef(0),wasOpen=useRef(false),running=useRef(false);
 useEffect(()=>{if(!keyReveal)return;const frame=requestAnimationFrame(()=>revealConnectionKey());return()=>cancelAnimationFrame(frame);},[keyReveal]);
 const askForKey=()=>{setShowConnection(true);setKeyReveal(v=>v+1);};
 useEffect(()=>{if(!busy)return;startedAt.current=Date.now();const timer=setInterval(()=>setElapsed(Math.floor((Date.now()-startedAt.current)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 const checks=useMemo(()=>draft&&!busy?checksFor(draft,brief,sheet||undefined):null,[draft,brief,busy,sheet]);
 const keepManual=(m:ManualEdits)=>{manualRef.current=m;setManual(m);};
 const reviewPassed=visualPassed(review),ready=checks?.pass&&reviewPassed&&!interrupted;
 const components=useMemo(()=>[...new Set(scene?.shapes.map(s=>s.component||s.label)||[])],[scene]);
 useEffect(()=>{
  worker.current=new Worker(new URL("./generation.worker.ts",import.meta.url),{type:"module"});
  worker.current.onmessage=e=>{const task=pending.current.get(e.data.id);if(task){pending.current.delete(e.data.id);if(e.data.error)task.reject(Error(e.data.error));else task.resolve(e.data);}};
  worker.current.onerror=()=>{worker.current?.terminate();worker.current=null;for(const task of pending.current.values())task.reject(Error("The brick assembler could not start. Reload and try again."));pending.current.clear();};
  return()=>{requestId.current++;controller.current?.abort();worker.current?.terminate();for(const task of pending.current.values())task.reject(Error("Generation closed."));pending.current.clear();};
 },[]);
 function work(next:GeneratedScene,edits:ManualEdits,b:DesignBrief,extra:{previous?:GeneratedScene;locked?:string[];supports?:boolean}={}){return new Promise<{model:BuildModel;manual:ManualEdits;added:number}>((resolve,reject)=>{if(!worker.current){reject(Error("The brick assembler is unavailable. Reload and try again."));return;}const id=++workerId.current;pending.current.set(id,{resolve:r=>resolve({model:r.model,manual:r.manual||edits,added:r.added||0}),reject});worker.current.postMessage({id,scene:next,manual:edits,hollow:b.hollow,smooth:b.finish==="smooth",previous:extra.previous,locked:extra.locked,supports:extra.supports});});}
 // supports: a finished design is packed with the automatic support columns, re-derived from the manual edits without
 // the previous ones (stale columns could cut through new geometry). Previews skip them too.
 function assemble(next:GeneratedScene,b:DesignBrief,base?:GeneratedScene,options:{preview?:boolean;supports?:boolean}={}){const edits=options.preview||options.supports?stripSupports(manualRef.current):manualRef.current;return work(next,edits,b,{previous:options.preview&&!lockedRef.current.length?undefined:base,locked:lockedRef.current,supports:options.supports});}
 const compile=(next:GeneratedScene,b:DesignBrief,base?:GeneratedScene,preview=false)=>assemble(next,b,base,{preview}).then(r=>r.model);
 useEffect(()=>{if(open&&!wasOpen.current){const session=++requestId.current,old=previous?.design,b=old?.brief||{...defaultBrief(initialPrompt||previous?.description||""),...initialBrief};editorSession.current++;setSessionKey(editorSession.current);composerVersion.current=0;activeFeedback.current=null;feedbackQueue.current.cancel();syncQueue();setBrief(b);setPrompt("");setLasso(undefined);setPicked([]);setTap(undefined);tapToken.current++;setPanel("");setPartsOpen(false);setMarkingRegion(false);setError("");setErrorCode("");setInterrupted(Boolean(old?.unfinished));partialDraft.current=null;setPreviewError("");setMotionPaused(false);setReplay(0);setArrivalMode(previous?"still":"assemble");setElapsed(0);const normalized=previous?.generation?normalizeScene(previous.generation):null;setScene(normalized);setDraft(previous||null);setReview(old?.reviewStale?null:old?.review||null);setLocked(old?.locked||[]);keepManual(old?.manual||emptyManual());setApproved([]);autoRepairs.current=[...(old?.autoRepairs||[])];rejectedDetail.current="";repairSpend.current=null;holds.current=[];setStopHold(0);revisions.current=[...(old?.revisions||[])];setMessages(revisions.current.flatMap(r=>[{role:"you" as const,text:r.request},{role:"builder" as const,text:r.summary}]));draftId.current=previous?.libraryId||newDesignId();setPack(old?.reference);setRequest(old?.reviewRequest||"");reviewRegion.current=old?.reviewRegion;const startingPhotos=previous?collectReferencePhotos(old?.reference?.photo,old?.reference?.photos):collectReferencePhotos(undefined,initialPhotos);setReference(startingPhotos[0]||null);setPhotos(startingPhotos.slice(1));setIdentityHint(old?.reference?.identityHint||"");setPreparingPhotos(false);setClarification(old?.reference?.sheet&&!referenceReady(old.reference.sheet)?referenceClarification(old.reference.sheet):"");setSheet(old?.reference?.sheet||null);autoPending.current=Boolean(autoStart&&!previous);setSetup(!previous&&!autoStart);setStatus("");setPhase("");setBusy(false);setRunCost(0);setSettledCalls(0);setRunUsage([]);setReferenceReused(false);setNotes([]);running.current=false;setShowConnection(false);setConfigured(null);dirty.current=false;deferRun(null);const lastAsk=old?.reviewRequest?old.revisions.at(-1)?.request||old.reviewRequest:"";setLastRequest(lastAsk);setLastTyped(Boolean(lastAsk&&lastAsk===old?.reviewRequest));setRepairNote("");setCorrections([]);setPeek(null);setCompare(false);setTint(false);setVersionModels({});setComplete(previous?.generation?{reviewRequest:old?.reviewRequest,reviewRegion:old?.reviewRegion,reference:old?.reference,model:previous,scene:normalized!,review:old?.reviewStale?null:old?.review||null,brief:b,manual:old?.manual||emptyManual()}:null);if(old?.unfinished){partialDraft.current=lastComplete.current;setComplete(null);}
   // A design opened without kept versions (older saves) starts at v1 as opened; one edited in the studio since its
   // last version gets a new one, so Restore never silently drops those edits.
   let list=[...(old?.versions||[])];
   let shown:number|null=null;
   if(previous&&normalized&&!old?.unfinished){const state={scene:normalized,manual:old?.manual||emptyManual(),locked:old?.locked||[]},match=[...list].reverse().find(v=>sameVersion(v,state));if(match)shown=match.n;else{list=addVersion(list,{at:new Date().toISOString(),label:list.length?"Edited in the studio":old?.revisions.at(-1)?.request||"Opened design",...state,brief:b,review:old?.reviewStale?undefined:old?.review,pieces:previous.pieces.length,...(list.length?{}:{opened:true})});shown=list.at(-1)!.n;}}
   // An unfinished draft is no kept version, so none is current and each can be restored.
   syncVersions(list,old?.unfinished?null:shown??list.at(-1)?.n??null);
   // A design the studio saved without handing over its library id (an opened file, say) is found by its content, so
   // this session's drafts and Done update that entry instead of adding a second one with the same name.
   savedOnce.current=false;const opened=editorSession.current;
   if(previous?.generation&&!previous.libraryId)void listDesigns().then(list=>{if(editorSession.current!==opened||savedOnce.current)return;const generation=JSON.stringify(previous.generation),match=list.find(d=>{if(d.name!==previous.name||d.pieceCount!==previous.pieces.length)return false;try{return JSON.stringify((JSON.parse(d.project) as {generation?:unknown}).generation)===generation;}catch{return false;}});if(match)draftId.current=match.id;});
   void fetch("/api/generate",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(requestId.current===session)setConfigured(Boolean(data.configured));}).catch(()=>{if(requestId.current===session){setConfigured(false);setError("Could not check the AI connection. Connect your key below to continue.");}});
  }wasOpen.current=open;
 },[open]);
 function editReferences(value:ReferenceInputValue){
  composerVersion.current++;setReference(value.photo||null);setPhotos(value.photos);setIdentityHint(value.identityHint);
  // While the builder runs, these belong only to the next feedback pass.
  if(running.current)return;
  setReview(null);
  // Keep new evidence even if the next lookup is interrupted, fails, or asks a question.
  const ref:DesignReference={...referencePack.current,...value,briefKey:""};setPack(ref);
  if(lastComplete.current)lastComplete.current={...lastComplete.current,reference:ref,review:null};
  if(partialDraft.current)partialDraft.current={...partialDraft.current,reference:ref,review:null};
  if(draft&&scene)persist(draft,scene,null,brief,ref,interrupted);
 }
 const briefEdited=Boolean(completedBrief&&!sameBrief(completedBrief,brief));
 const editorReferences:ReferenceInputValue={photo:reference||undefined,photos,identityHint};
 const sameReferences=(a:{photo?:string;photos?:string[];identityHint?:string}|undefined,b:ReferenceInputValue)=>JSON.stringify(collectReferencePhotos(a?.photo,a?.photos))===JSON.stringify(collectReferencePhotos(b.photo,b.photos))&&(a?.identityHint||"")===b.identityHint;
 const referenceEdited=Boolean(pack&&pack.briefKey!==referenceKey(brief))||!sameReferences(pack,editorReferences);
 // Suggestions come from the shown version's review. Simplified chips only from notes the builder wrote as notes: a
 // version from before versions were kept may carry a migrated caption instead.
 const currentVersion=versions.find(v=>v.n===current),prevVersion=previousVersion(versions,current);
 // Failed design checks are offered too, so a build with geometry or brief issues has a one-tap fix.
 const {suggestions,looksRight}=useMemo(()=>busy||interrupted?{suggestions:[],looksRight:[]}:reviewSuggestions(review,{request:askedFor,issues:checks?.issues,notes:currentVersion&&!currentVersion.opened?scene?.notes:undefined}),[review,scene,busy,interrupted,currentVersion,askedFor,checks]);
 const fixes=approved.filter(a=>suggestions.some(s=>s.text===a)),typed=prompt.trim().length>=3;
 const actions=composerActions({busy,queued:Boolean(queuedFeedback),typed,fixes:fixes.length});
 const changes=useMemo(()=>currentVersion&&prevVersion?diffSummary(componentDiff(prevVersion.scene,currentVersion.scene)):"",[currentVersion,prevVersion]);
 // The owner map of the shown build, computed when a part is picked: during a pass, the live draft's scene.
 const liveScene=busy?draft?.generation||null:scene;
 const ownersNow=()=>ownersOf(draft,liveScene);
 function editPrompt(value:string){composerVersion.current++;setPrompt(value);}
 function editLasso(value:RevisionRegion|undefined){composerVersion.current++;setLasso(value);}
 function clearComposer(){composerVersion.current++;tapToken.current++;setPrompt("");setLasso(undefined);setPicked([]);setTap(undefined);setApproved([]);setPartsOpen(false);}
 function restoreComposer(s:FeedbackSnapshot){setPrompt(s.typed??s.text);setLasso(s.selection?.lasso);setPicked(s.selection?.picked||[]);setTap(s.selection?.tap);setApproved(s.approved||[]);}
 function focusComposer(){const input=document.getElementById("generation-prompt");input?.focus({preventScroll:true});requestAnimationFrame(()=>input?.scrollIntoView({block:"nearest",behavior:smoothScroll()}));}
 // When a step removes the focused control, focus returns to the composer: its text field with a mouse or keyboard, the
 // composer itself on touch, so no keyboard pops up over the model.
 function focusComposerArea(){if(window.matchMedia("(pointer: coarse)").matches)document.getElementById("feedback-composer")?.focus({preventScroll:true});else focusComposer();}
 // The element may render a frame later (a panel just opened, Stop once a pass starts).
 function focusLater(selector:string,tries=3){const el=document.querySelector<HTMLElement>(selector);if(el)el.focus({preventScroll:true});else if(tries>0)requestAnimationFrame(()=>focusLater(selector,tries-1));}
 function revealPanel(tries=3){const card=document.getElementById("feedback-panel");if(!card){if(tries>0)requestAnimationFrame(()=>revealPanel(tries-1));return;}card.scrollIntoView({block:narrow?"start":"nearest",behavior:smoothScroll()});document.getElementById("feedback-panel-title")?.focus({preventScroll:true});}
 // A panel takes focus (its heading) and gives it back to the control it was opened from. From the More menu, the
 // menu's own close hands focus over (onCloseAutoFocus), so the menu does not pull it back to its trigger.
 function openPanel(p:Exclude<Panel,"">,fromMenu=false){panelOpener.current=fromMenu?moreButton.current:document.activeElement instanceof HTMLElement?document.activeElement:null;setPanel(p);if(fromMenu)afterMenu.current=()=>revealPanel();else requestAnimationFrame(()=>revealPanel());}
 // Focus moves before the control that has it is removed, so it never falls back to the dialog in between.
 function closePanel(){const back=panelOpener.current;panelOpener.current=null;if(back?.isConnected&&!back.matches(":disabled"))back.focus({preventScroll:true});else focusComposerArea();setPanel("");}
 function toggleParts(){if(partsOpen){setPartsOpen(false);return;}flushSync(()=>setPartsOpen(true));focusLater(".composer-parts button");}
 // Removing a target chip moves focus to the next chip, or back to the composer.
 function removeTarget(remove:()=>void,button:HTMLElement){const all=[...document.querySelectorAll<HTMLElement>(".composer-target button")],at=all.indexOf(button),next=all[at+1]||all[at-1];if(next)next.focus();else focusComposerArea();remove();}
 function startMarking(){if(!draft)return;showVersion(null);setPartsOpen(false);setMarkingRegion(true);requestAnimationFrame(()=>document.querySelector(".generator-dialog .generation-canvas")?.scrollIntoView({block:"center",behavior:smoothScroll()}));}
 // A drawn area names the components its sampled bounds touch and the scene it was drawn on.
 function attachRegion(capture:RegionCapture){const owners=ownersNow(),components=owners&&draft?componentsInBounds(owners,draft.pieces,capture.bounds):[];editLasso({...capture,components,description:"User-marked area on the generated model. This view was captured before the requested edit; the live build may have progressed since then. Optional bounds summarize sampled visible surfaces, not the full marked area; use the drawn outline for scope.",...(liveScene?{sceneKey:revisionSceneKey(liveScene)}:{})});setMarkingRegion(false);requestAnimationFrame(focusComposer);}
 function captureTap(next:string[]){
  const token=++tapToken.current,owners=ownersNow(),ids=new Set(owners?piecesOf(owners,next):[]),bounds=draft?regionBoundsForPieces(draft.pieces.filter(p=>ids.has(p.id))):null,sceneKey=liveScene?revisionSceneKey(liveScene):undefined;
  let frames=3;const step=()=>{if(token!==tapToken.current)return;if(--frames>0){requestAnimationFrame(step);return;}const image=canvasStill(document.querySelector<HTMLCanvasElement>(".generator-dialog .generation-canvas canvas"),getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg").trim()||undefined);setTap(image?{image,...(bounds?{bounds}:{}),...(sceneKey?{sceneKey}:{})}:undefined);};requestAnimationFrame(step);
 }
 function togglePick(component:string){composerVersion.current++;showVersion(null);const next=picked.includes(component)?picked.filter(c=>c!==component):[...picked,component].slice(-6);setPicked(next);if(next.length)captureTap(next);else{tapToken.current++;setTap(undefined);}}
 // A tap (not a drag) on the model reports a piece; its component becomes the target.
 function pickPiece(id:string){if(markingRegion||!draft||peek!==null)return;const piece=draft.pieces.find(p=>String(p.id)===id),owner=piece&&ownersNow()?.get(piece.id);if(owner){togglePick(owner);setPartsOpen(false);}else if(piece)toast.info("That brick was added by hand. Tap another part, or choose one from Select part.",{id:"pick-unowned"});}
 // A part picked from the list closes it: the chip and its quick changes take its place.
 function pickFromList(component:string){const adding=!picked.includes(component);if(adding)focusComposerArea();togglePick(component);if(adding)setPartsOpen(false);}
 function quick(action:QuickAction){const request=quickRequest(action,picked),text=prompt.trim()?`${prompt.trim()} ${request}`:request;editPrompt(text);requestAnimationFrame(()=>{const input=document.getElementById("generation-prompt") as HTMLTextAreaElement|null;input?.focus({preventScroll:true});input?.setSelectionRange(text.length,text.length);});}
 function feedbackSnapshot():FeedbackSnapshot{
  const region=composeRegion({lasso,picked,tap}),words=prompt.trim();
  // Without a captured view the tapped parts travel in the words.
  const names=picked.map(c=>componentLabel(c).toLowerCase()),text=!region&&names.length&&words&&!names.every(n=>words.toLowerCase().includes(n))?`For the ${names.join(", ")}: ${words}`:words;
  return {region:region?structuredClone(region):undefined,text,typed:words,references:{...editorReferences,photos:[...photos]},version:composerVersion.current,selection:structuredClone({lasso,picked,tap}),...(fixes.length?{approved:[...fixes]}:{})};
 }
 // A pass started from a panel button (sign, place, continue) leaves whatever is in the composer alone.
 const blank=():FeedbackSnapshot=>({text:"",typed:"",references:{...editorReferences,photos:[...photos]},version:-1});
 function submitFeedback(){
  if(preparingPhotos||markingRegion||budgetBlocked||needKey||actions.submitDisabled)return;
  // The queue is the one place a submitted change lives until it runs: the composer is cleared for the next idea.
  if(running.current){feedbackQueue.current.submit(feedbackSnapshot(),requestId.current);syncQueue();clearComposer();return;}
  feedbackQueue.current.cancel();syncQueue();void run();
 }
 function editQueuedFeedback(){const queued=feedbackQueue.current.pending;if(!queued)return;const value=queued.value;feedbackQueue.current.cancel();syncQueue();composerVersion.current++;restoreComposer(value);if(!sameReferences(editorReferences,value.references))editReferences(value.references);requestAnimationFrame(focusComposer);}
 function resumeQueuedFeedback(){if(preparingPhotos||running.current||budgetBlocked)return;focusComposerArea();feedbackQueue.current.resume();syncQueue();}
 function removeQueuedFeedback(){focusComposerArea();feedbackQueue.current.cancel();syncQueue();}
 function editSign(signText:string){const b={...brief,signText};setBrief(b);setReview(null);if(draft&&scene)persist(draft,scene,null,b,referencePack.current,interrupted);}
 function editLocks(list:string[]){setLocked(list);dirty.current=true;if(draft&&scene&&!busy)persist(draft,scene,review,brief,referencePack.current,interrupted);}
 const referenceSession=sessionKey;
 const referenceInputs=<ReferenceInputs key={referenceSession} value={editorReferences} pasteTargetId="brief-idea" disabled={!open} question={clarification} onChange={value=>{if(wasOpen.current&&referenceSession===editorSession.current)editReferences(value);}} onPreparing={setPreparingPhotos}/>;
 function restoreLast(){const last=lastComplete.current;setDraft(last?.model||null);setScene(last?.scene||null);setReview(last?.reference===referencePack.current&&sameBrief(last?.brief,brief)?last?.review||null:null);if(last){setRequest(last.reviewRequest||"");reviewRegion.current=last.reviewRegion;if(last.manual)keepManual(last.manual);}}
 function stop(){const wasRunning=running.current;setMarkingRegion(false);const active=activeFeedback.current;if(active&&composerVersion.current===active.version)restoreComposer(active);activeFeedback.current=null;pauseQueue();previewQueue.current?.cancel();requestId.current++;controller.current?.abort();running.current=false;holds.current=[];setStopHold(0);setWorking("");setBusy(false);setPhase("");if(partialDraft.current){const saved=partialDraft.current;setRequest(saved.reviewRequest||"");reviewRegion.current=saved.reviewRegion;if(saved.manual)keepManual(saved.manual);setDraft(saved.model);setScene(saved.scene);setReview(null);setInterrupted(true);persist(saved.model,saved.scene,null,saved.brief,saved.reference,true);setStatus("Stopped. Your in-progress draft is kept in your designs.");if(wasRunning){showVersion(null);syncVersions(versionsRef.current,null);}}else{setStatus("Stopped. Your last completed draft is preserved.");restoreLast();if(wasRunning)keepShown(lastComplete.current);}}
 // A pass stopped after its build was packed (during the review or the automatic fix) leaves that build on screen: it
 // becomes a version, so the strip's current version is what is shown and every other one can still be restored. An
 // unfinished draft is no version: none is current, so each kept one can be restored.
 function keepShown(c:Completed|null){
  if(!c)return;const {label,request,typed}=activeLabel.current,name=label||"Stopped pass",kept=keepVersion(versionsRef.current,{at:new Date().toISOString(),label:c.review?name:`${name} (stopped before review)`,scene:c.scene,manual:c.manual||manualRef.current,locked:lockedRef.current,brief:c.brief,review:c.review||undefined,pieces:c.model.pieces.length});
  syncVersions(kept.list,kept.n);if(kept.added){dirty.current=true;setLastRequest(request);setLastTyped(typed);setRepairNote("");setCorrections(c.corrections||[]);persist(c.model,c.scene,c.review,c.brief,c.reference);}
 }
 // Restore recompiles a kept version: no AI call, no charge.
 async function restoreVersion(n:number){
  const v=versionsRef.current.find(x=>x.n===n);if(!v||running.current||busy)return;
  let model=versionModels[n];try{if(!model)model=(await work(v.scene,v.manual,v.brief)).model;}catch(e){setError(e instanceof Error?e.message:"That version could not be rebuilt.");return;}
  const restored=normalizeScene(v.scene),r=v.review||null;
  keepManual(v.manual);setLocked(v.locked);setBrief(v.brief);setScene(restored);setDraft(model);setReview(r);setInterrupted(false);partialDraft.current=null;setRequest("");reviewRegion.current=undefined;setArrivalMode("still");setPeek(null);setCompare(false);setTint(false);setPartsOpen(false);tapToken.current++;setLasso(undefined);setPicked([]);setTap(undefined);setApproved([]);
  setComplete({reference:referencePack.current,model,scene:restored,review:r,brief:v.brief,manual:v.manual});
  const label=historyLabel({typed:"",restored:n});setMessages(m=>[...m,{role:"you",text:label}]);revisions.current=[...revisions.current,{request:label,summary:splitCaption(restored.description).description.slice(0,1000),at:new Date().toISOString()}].slice(-50);
  // The last run's spend is not this version's: the cost line clears, so "$0" is the only figure shown.
  syncVersions(versionsRef.current,n);setLastRequest("");setLastTyped(false);setRepairNote("");setCorrections([]);setRunCost(0);setSettledCalls(0);setRunUsage([]);setReferenceReused(false);setPhase("");setError("");setErrorCode("");setStatus(`Back to v${n}. No AI was used ($0).`);dirty.current=true;persist(model,restored,r,v.brief,referencePack.current);
 }
 // The version a peek or Before shows is compiled once, in the worker; the one before the current only to tint changes.
 useEffect(()=>{
  const want=[peek,tint&&peek===null?prevVersion?.n:undefined].filter((n):n is number=>typeof n==="number"&&n!==current&&!versionModels[n]);
  for(const n of want){const v=versionsRef.current.find(x=>x.n===n);if(v)void work(v.scene,v.manual,v.brief).then(r=>setVersionModels(m=>({...m,[n]:r.model}))).catch(()=>{showVersion(null);toast.error("That version couldn’t be shown.",{id:"version-peek"});});}
 },[peek,tint,current,prevVersion,versionModels]);
 const peekModel=peek!==null&&peek!==current?versionModels[peek]:undefined,shownModel=peekModel||draft;
 // Every version shows in its own colors. The tapped parts are highlighted while they are targets; changed bricks only
 // when the owner asks (Highlight changes): a peek against the current version, the current one against the one before.
 const highlightIds=useMemo(()=>{
  if(picked.length&&!peekModel){const owners=ownersNow();return owners?piecesOf(owners,picked):[];}
  if(tint&&draft&&(peekModel||peek===null)){const shownV=peekModel?versions.find(v=>v.n===peek):currentVersion,otherV=peekModel?currentVersion:prevVersion,other=peekModel?draft:prevVersion?versionModels[prevVersion.n]:undefined;try{return shownV&&otherV&&other&&shownModel?highlightChanges({scene:shownV.scene,pieces:shownModel.pieces},{scene:otherV.scene,pieces:other.pieces}):[];}catch{return [];}}
  return [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[tint,draft,peekModel,shownModel,prevVersion,currentVersion,versions,peek,versionModels,picked,liveScene]);
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
  const activeKey=keyOverride||apiKey;if(running.current||preparingPhotos||markingRegion)return false;if(!configured&&!activeKey){deferRun(reviewOnly?null:{fresh,submitted,retrying});askForKey();setError("Connect an OpenAI API key to build.");setErrorCode("AI_NOT_CONNECTED");return false;}
  const source=fresh?.brief||brief;
  if(source.signText?.trim())try{const size=signMetrics(source.signText);if(size.width>Math.max(source.maxWidth,source.maxDepth)||size.height>source.maxHeight)throw Error(`This sign needs ${size.width} studs of width and ${size.height} plates of height. Increase the scale or shorten the wording.`);}catch(e){setError(e instanceof Error?e.message:"Check the sign text.");if(!setup)setPanel("sign");return false;}
  const parsed=briefSchema.safeParse({...source,idea:source.idea.trim(),features:source.features.map(s=>s.trim()).filter(Boolean)});
  if(!parsed.success){setError("Check the brief and size limits.");return false;}
  const b=parsed.data;if(lockedRef.current.length&&lastComplete.current&&b.hollow!==lastComplete.current.brief.hollow){setError("Unlock the protected components before changing hollow interiors.");return false;}
  const runFeedback=submitted||feedbackSnapshot(),runReferences=runFeedback.references,runComposerVersion=runFeedback.version;
  const runReferenceEdited=Boolean(referencePack.current&&referencePack.current.briefKey!==referenceKey(b))||!sameReferences(referencePack.current,runReferences);
  const continuing=interrupted&&!fresh&&!reviewOnly&&!runFeedback.text&&!runFeedback.region&&!runReferenceEdited&&!briefEdited;
  // A pass without words: the owner's ticked fixes, or a retry of a pass whose requested change the review could not see.
  // That request and its marked area are carried only when the owner ticked Retry (or a bare retry re-runs the pass).
  const repairing=!reviewOnly&&!fresh&&!continuing&&!interrupted&&!runFeedback.text&&!runFeedback.region&&!runReferenceEdited&&!briefEdited&&Boolean(lastComplete.current||scene);
  const ticked=runFeedback.approved||[],retryTicked=ticked.some(isRetryItem);
  const carried=repairing&&(retryTicked||!ticked.length)&&review?.revision&&["missing","uncertain"].includes(review.revision.status)?reviewRequest.current:"";
  const approvedItems=approvedFeedback({approved:runFeedback.approved,repairing:repairing&&!ticked.length,review});
  const rejected=reviewOnly?"":rejectedDetail.current;if(!reviewOnly)rejectedDetail.current="";
  const runPrompt=continuing?reviewRequest.current:runFeedback.text,runRegion=reviewOnly?reviewRegion.current:fresh?undefined:runFeedback.region||(continuing||carried?reviewRegion.current:undefined);
  const baseScene=submitted&&!interrupted?(lastComplete.current?.scene||scene):scene;
  const oldSign=lastComplete.current?.brief.signText||"",newSign=b.signText||"";
  const briefChangeRequest=b.signText!==undefined&&!newSign.trim()&&baseScene?.shapes.some(s=>s.kind==="text")?"Remove the existing sign lettering while preserving the building and unrelated details.":oldSign!==newSign?(newSign?`Set the building sign to exactly "${newSign}" using supported block lettering. Preserve unrelated details.`:`Remove the previous "${oldSign}" sign lettering. Preserve unrelated details.`):"Apply the updated brief while preserving unrelated details.";
  const fixRequest=ticked.length&&!carried?clipSentence(`Apply the approved fixes: ${ticked.filter(t=>!isRetryItem(t)).join("; ")}`,1500):"";
  const original=fresh?undefined:baseScene||undefined,text=original?continuing?continuationPrompt(b.idea,reviewRequest.current):runPrompt||(carried?`Finish the earlier request “${carried.slice(0,1200)}” and repair the flagged checks while preserving the rest of the design.`:runRegion?"Refine the marked area while preserving the rest of the build.":runReferenceEdited?"Update the design to match the reference photos and clarified place or structure.":briefEdited?briefChangeRequest:interrupted?continuationPrompt(b.idea,reviewRequest.current):ticked.length?"Apply the fixes the owner approved while preserving the rest of the design.":"Repair the failed checks while preserving the original design."):runPrompt?`${b.idea}\n\nAdditional instructions: ${runPrompt}`:b.idea;
  // What the owner sees in Design history and the version strip: their words, or a plain label for the pass.
  const checkItems=new Set(checks?.issues||[]),ownWords=Boolean(original&&(runFeedback.typed??runFeedback.text).trim());
  const userText=original?historyLabel({typed:runFeedback.typed??runFeedback.text,fixes:ticked.filter(t=>!isRetryItem(t)).length,checks:ticked.filter(t=>checkItems.has(t)).length,retry:carried||undefined,continuing,region:Boolean(runRegion),photos:runReferenceEdited,sign:oldSign!==newSign,brief:briefEdited}):fresh&&scene?"Rebuilt at the largest size":b.idea===PHOTO_IDEA?"Built from my photos":b.idea;
  if(!reviewOnly){setArrivalMode(original?"revise":"assemble");reviewRegion.current=runRegion;activeLabel.current={label:userText,request:original?userText:"",typed:ownWords};}
  if(!reviewOnly)setRequest(original||runPrompt?runPrompt||carried||(runRegion?"Refine the marked area while preserving the rest of the build.":runReferenceEdited?"Match the reference photos and clarified place or structure.":briefEdited?briefChangeRequest:interrupted?reviewRequest.current:fixRequest):"");
  activeFeedback.current=reviewOnly?runFeedback:{...runFeedback,text:runPrompt,region:runRegion};if(mayClearSubmittedFeedback(runComposerVersion,composerVersion.current,reviewOnly)){setPrompt("");setLasso(undefined);setPicked([]);setTap(undefined);setApproved([]);}
  const runId=++requestId.current,abort=new AbortController();controller.current=abort;previewQueue.current?.cancel();setElapsed(0);setPreviewError("");setErrorCode("");running.current=true;setBusy(true);setSetup(false);setBrief(b);setError("");setClarification("");setReview(null);setNotes([]);setRunCost(0);setSettledCalls(0);setRunUsage([]);setReferenceReused(false);repairSpend.current=null;holds.current=[];setStopHold(0);setPeek(null);setCompare(false);setTint(false);setMarkingRegion(false);if(panel!=="history")setPanel("");
  let best:Completed|null=null,completedSuccessfully=false,applied=false,activeReference:DesignReference|undefined,passCorrections:string[]=[],firstViews:string[]=[],fixNote="";
  // Typed by assertion: they are assigned inside workflow callbacks, which flow analysis does not follow.
  let repairPack=undefined as {model:BuildModel;manual:ManualEdits}|undefined,repairCorrections=[] as string[];
  const alive=()=>{abort.signal.throwIfAborted();if(requestId.current!==runId)throw new DOMException("Cancelled","AbortError");};
  const keepReference=(ref:DesignReference)=>{activeReference=ref;setPack(ref);setSheet(ref.sheet||null);if(composerVersion.current===runComposerVersion){setReference(ref.photo||null);setPhotos(ref.photos||[]);setIdentityHint(ref.identityHint||"");}};
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
    keepReference(ref);setClarification(question);setPanel("place");
    throw new GenerationError(question,"REFERENCE_CLARIFICATION");
   }
   keepReference(ref);note("Reference",`${sheet.subject}. ${sheet.summary}${sheet.uncertainties?.length?` Uncertain: ${sheet.uncertainties.join("; ")}`:""}`);
   return ref;
  };
  try{
   if(reviewOnly&&draft&&original){const ref=reusable||await lookup();keepReference(ref);const r=await visual(draft,b,abort,reviewRequest.current,activeKey,original.signature||[],ref,runRegion);alive();best={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:ref,model:draft,scene:original,review:r,brief:b,manual:manualRef.current,corrections:lastComplete.current?.corrections};}
   else{
    setMessages(m=>[...m,{role:"you",text:userText}]);setWorking(userText);
    // draft:false keeps an automatic repair's partial out of the kept drafts: stopping it keeps the reviewed first build.
    const stream=async(previousScene:GeneratedScene|undefined,extra:{feedback?:string[];approved?:string[];renders?:string[];budget?:{limit:number;used:number;remaining:number;byComponent:{component:string;pieces:number}[]};label?:string;prompt?:string;draft?:boolean})=>{
     let header:SceneHeader|null=null,shapes:Shape[]=[],result:GeneratedScene|undefined,geometryError="",geometryDetail="",corrections:string[]=[];
     const previews=new PreviewQueue<GeneratedScene,BuildModel>(async snapshot=>{const m=await compile(snapshot,b,original,true);return {...m,generation:snapshot,length:snapshot.dimensions.x,width:snapshot.dimensions.z,height:snapshot.dimensions.y};},m=>{if(requestId.current===runId){setDraft(m);setPreviewError("");if(extra.draft!==false&&m.generation&&canKeepPartial(m.generation,m))partialDraft.current={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:activeReference,model:m,scene:m.generation,review:null,brief:b,manual:stripSupports(manualRef.current)};}},e=>{if(requestId.current===runId&&!(e instanceof Error&&/draft is empty/.test(e.message)))setPreviewError(e instanceof Error?e.message:"Live preview could not update.");},350);previewQueue.current=previews;const cancelPreview=()=>previews.cancel();abort.signal.addEventListener("abort",cancelPreview,{once:true});
     // The designer's history carries the review's verdict and its own notes; the owner's history shows the caption.
     const response=await fetch("/api/generate",{method:"POST",signal:abort.signal,headers:headers(activeKey),body:JSON.stringify({prompt:extra.prompt||text,detail:b.size,brief:b,reference:activeReference?.photo,photos:activeReference?.photos,research:activeReference?.sheet,region:runRegion,previous:previousScene,locked:lockedRef.current,feedback:extra.feedback?.length?extra.feedback.map(f=>f.slice(0,1000)).slice(0,40):undefined,approved:extra.approved?.length?extra.approved:undefined,renders:extra.renders?.length?extra.renders:undefined,continuation:continuing||undefined,budget:extra.budget,history:revisions.current.slice(-8).map(({request,summary,builder})=>({request,summary:(builder||summary).slice(0,1000)}))})});
     if(!response.ok){const body=await response.json();throw new GenerationError(body.error||"Generation could not start.",body.code||"GENERATION_FAILED");}if(!response.body)throw Error("No generation stream was returned.");
     try{for await(const event of readEvents(response.body)){
      alive();if(event.type==="usage")recordCost(event.usage,"design");if(event.type==="budget")trackBudget(event.budget);else if(event.type==="thought")thought(extra.label||(original?"Revising":"Designing"),event.text);else if(event.type==="header"){header=event.header;if(event.header.signature?.length)note("Signature",event.header.signature.join(" · "));}
      else if(event.type==="base"){shapes=event.shapes;}
      else if(event.type==="shape"){const at=shapes.findIndex(s=>(s.id||s.label)===(event.shape.id||event.shape.label));if(at>=0)shapes[at]=event.shape;else shapes.push(event.shape);setStatus(`Shaping ${event.shape.label}…`);
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
      setDraft(model);setPreviewError("");partialDraft.current=null;best={reviewRequest:reviewRequest.current,reviewRegion:runRegion,reference:ref,model,scene:candidate,review:null,brief:b,manual:packed.manual,corrections:passCorrections};setComplete(best);persist(model,candidate,null,b,ref);
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
     fixNote=kept?`Auto-fixed ${fixed} issue${fixed===1?"":"s"} (+$${cost.toFixed(2)}).`:error?`The automatic fix stopped (+$${cost.toFixed(2)}): ${generationFailure(error).message} The first build is kept.`:checked?`Tried an automatic fix (+$${cost.toFixed(2)}); the re-check found it no better, so the first build is kept.`:`Tried an automatic fix (+$${cost.toFixed(2)}); it fixed nothing measurable, so the first build is kept without a second review.`;
     note("Auto-fix",fixNote);
    }
    if(result.reviewError){const failure=generationFailure(result.reviewError);setError(failure.message);setErrorCode(failure.code);}
   }
   alive();if(!best)throw Error("No complete draft is available.");
   if(best.manual)keepManual(best.manual);
   setComplete(best);partialDraft.current=null;setInterrupted(false);setDraft(best.model);setScene(best.scene);setReview(best.review);setPhase("done");
   // Each finished pass is a version; a review of the shown version updates that version's review.
   if(!reviewOnly){const list=addVersion(versionsRef.current,{at:new Date().toISOString(),label:userText,scene:best.scene,manual:best.manual||manualRef.current,locked:lockedRef.current,brief:b,review:best.review||undefined,pieces:best.model.pieces.length});syncVersions(list,list.at(-1)!.n);setLastRequest(original?userText:"");setLastTyped(ownWords);setRepairNote(fixNote);setCorrections(best.corrections||[]);}
   // Only the version on screen takes the new review; a stopped pass may have left another build shown.
   else if(best.review){const n=currentRef.current,shown=versionsRef.current.find(v=>v.n===n),state={scene:best.scene,manual:best.manual||manualRef.current,locked:lockedRef.current};if(shown&&sameVersion(shown,state))syncVersions(versionsRef.current.map(v=>v===shown?{...v,review:compactReview(best!.review)}:v),shown.n);}
   const checks=checksFor(best.model,b,best.reference?.sheet);
   setStatus(finishStatus(checks.issues.length,visualPassed(best.review)));
   const caption=splitCaption(best.scene.description).description||best.review?.summary||"",builder=builderSummary(best.review,best.scene);setMessages(m=>[...m,{role:"builder",text:caption}]);
   if(!reviewOnly)revisions.current=[...revisions.current,{request:userText,summary:caption.slice(0,1000),...(builder?{builder}:{}),at:new Date().toISOString()}].slice(-50);
   dirty.current=true;persist(best.model,best.scene,best.review,b,best.reference);applied=true;completedSuccessfully=Boolean(best.review);
  }catch(e){
   if(requestId.current!==runId)return false;
   // A queued pass that fails goes back to its card only; a direct send goes back to the composer.
   if(!submitted&&mayClearSubmittedFeedback(runComposerVersion,composerVersion.current,reviewOnly))restoreComposer(runFeedback);
   const recovered=best||partialDraft.current||lastComplete.current;
   if(recovered){setRequest(recovered.reviewRequest||"");reviewRegion.current=recovered.reviewRegion;if(recovered.manual)keepManual(recovered.manual);const ref=activeReference||recovered.reference,r=ref===recovered.reference&&sameBrief(recovered.brief,b)?recovered.review:null;setDraft(recovered.model);setScene(recovered.scene);setReview(r);persist(recovered.model,recovered.scene,r,b,ref,!best&&recovered===partialDraft.current);setInterrupted(!best&&recovered===partialDraft.current);setStatus("Your last draft and reference photos are kept.");}
   const failure=generationFailure(e);setError(failure.message);setErrorCode(failure.code);if(failure.code==="REFERENCE_CLARIFICATION"){setStatus("Add a place detail or another photo to continue.");setPanel("place");}
   // A rejected drawing's technical detail goes back to the designer on the next pass, so a retry does not repeat it.
   if(failure.code==="INVALID_GEOMETRY")rejectedDetail.current=(failure.detail||"A shape was invalid or outside the build area.").slice(0,600);else if(rejected&&!rejectedDetail.current)rejectedDetail.current=rejected;
  }finally{repairSpend.current=null;if(requestId.current===runId){feedbackQueue.current.settle(runId,completedSuccessfully?"completed":"failed");syncQueue();running.current=false;activeFeedback.current=null;holds.current=[];setStopHold(0);setWorking("");setBusy(false);controller.current=null;}}
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
 // autoStart builds as soon as the connection is known; without a key, run() keeps the build for when one is connected.
 useEffect(()=>{if(!open||!autoPending.current||configured===null||preparingPhotos)return;const timer=setTimeout(()=>{if(!autoPending.current)return;autoPending.current=false;void run();},0);return()=>clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,configured,preparingPhotos]);
 function retry(){
  if(CONNECTION_CODES.includes(errorCode)){askForKey();return;}
  void run(Boolean(scene&&!interrupted&&(phase==="done"||phase==="review")),undefined,undefined,undefined,true);
 }
 // A connected key starts exactly the build it interrupted (same brief, snapshot and retry flag); with no design yet the
 // only thing to start is the build itself. Otherwise connecting starts nothing.
 const buildsOnConnect=setup||pendingBuild||!scene;
 function connectKey(key:string){setApiKey(key);setShowConnection(false);setError("");setErrorCode("");const p=pendingRun.current||(setup||!scene?{retrying:false}:null);deferRun(null);if(p)void run(false,key,p.fresh,p.submitted,p.retrying);else requestAnimationFrame(focusComposerArea);}
 function dismissKey(){setShowConnection(false);deferRun(null);if(errorCode==="AI_NOT_CONNECTED"){setError("");setErrorCode("");}requestAnimationFrame(focusComposerArea);}
 // The pinned composer's height keeps focused and scrolled-to content above it on phones (scroll-padding, feedback.css).
 const composerSize=useRef<ResizeObserver|null>(null);
 const composerRef=useCallback((node:HTMLElement|null)=>{composerSize.current?.disconnect();composerSize.current=null;const dialog=node?.closest<HTMLElement>(".generator-dialog");if(!node||!dialog||typeof ResizeObserver==="undefined")return;const observer=new ResizeObserver(()=>dialog.style.setProperty("--composer-h",`${Math.ceil(node.offsetHeight)}px`));observer.observe(node);composerSize.current=observer;},[]);
 // Done and closing both hand the shown version to the studio under this draft's id, so no second same-named draft is left behind.
 function keep(shop=false,closing=false){if(!draft||!scene||busy)return false;pauseQueue();if(!briefSchema.safeParse(brief).success){if(!closing)setError("Check the sign text and brief before keeping this draft.");return false;}const lastAsk=messages.filter(m=>m.role==="you").at(-1)?.text;if(lastAsk&&revisions.current.at(-1)?.request!==lastAsk){const builder=builderSummary(review,scene);revisions.current=[...revisions.current,{request:lastAsk,summary:(splitCaption(scene.description).description||review?.summary||"").slice(0,1000),...(builder?{builder}:{}),at:new Date().toISOString()}].slice(-50);}const model:BuildModel={...draft,name:previous?.name||draft.name,generation:scene,shopping:previous?.shopping,detail:brief.size,libraryId:draftId.current,design:designFor(brief,referencePack.current,interrupted,review)};requestId.current++;onCreate({model,detail:brief.size,color:draft.inventory.find(r=>r.color!=="gray")?.color||"white",accent:"white",shop});if(!closing){onOpenChange(false);requestAnimationFrame(()=>document.getElementById("build-table")?.scrollIntoView({behavior:smoothScroll()}));}return true;}
 const needKey=showConnection&&!configured&&!apiKey;
 const connection=<AIConnection configured={configured} apiKey={apiKey} busy={busy||preparingPhotos} active={open} expanded={showConnection} onExpand={v=>{setShowConnection(v);if(!v)deferRun(null);}} setup={buildsOnConnect} budget={budget} onBudget={setBudget} onConnect={connectKey} onForget={()=>{setApiKey("");setBudget(null);}}/>;
 // In the composer the key card is the one control: its own expand toggle is hidden (feedback.css) and Not now closes it.
 const keyCard=<div className="composer-key">{connection}<button type="button" className="composer-key-dismiss" onClick={dismissKey}>Not now</button></div>;
 const finished=Boolean(draft&&!busy&&scene&&!setup);
 // While the key field is open, it is the answer to a missing connection: no second message, no second button.
 const keyAnswers=needKey&&CONNECTION_CODES.includes(errorCode);
 const errorPanel=error&&errorCode!=="REFERENCE_CLARIFICATION"&&!(keyAnswers&&errorCode==="AI_NOT_CONNECTED")?<div className={setup?"creation-error":"stage-recovery"} role="alert"><div>{!setup&&<strong>{interrupted?"Your progress is kept.":draft&&scene?"Your design is kept.":"Let’s get your build going."}</strong>}<p>{error}</p></div>{!busy&&!budgetBlocked&&!keyAnswers&&<button className="button secondary" onClick={retry}>{CONNECTION_CODES.includes(errorCode)?<KeyRound size={14}/>:<RotateCcw size={14}/>}{retryLabel(errorCode,interrupted,Boolean(scene&&(phase==="done"||phase==="review")))}</button>}</div>:null;
 const panelBody=panel==="locks"?<><p>Locked parts keep their shape and color. A change that touches them is rejected.</p><div className="feedback-locks">{components.map(c=><label key={c}><Checkbox checked={locked.includes(c)} onCheckedChange={v=>editLocks(v?[...locked,c]:locked.filter(x=>x!==c))}/>{componentLabel(c)}</label>)}</div>{(manual.bricks.length>0||manual.erase.length>0)&&<p>{manual.bricks.length} edited bricks and {manual.erase.length} erased regions are also protected.</p>}</>
  :panel==="sign"?<><SignInput text={brief.signText||""} onChange={editSign} maxWidth={brief.maxWidth} maxDepth={brief.maxDepth} maxHeight={brief.maxHeight} disabled={busy||preparingPhotos}/>{briefEdited&&scene&&<button type="button" className="button primary" disabled={busy||preparingPhotos||budgetBlocked} onClick={()=>{focusComposerArea();void run(false,undefined,undefined,blank());}}><Send size={15}/>Update the sign</button>}</>
  :panel==="place"?<>{clarification&&<p className="reference-question" role="status">{clarification}</p>}<input id="feedback-place" className="reference-place-input" aria-label="Place or structure" value={identityHint} maxLength={300} disabled={busy} autoComplete="off" placeholder="Name, city, specific building or era" onChange={e=>editReferences({...editorReferences,identityHint:e.target.value})}/><p>For a known place, Bricks looks up its shape and layout.</p>{referenceEdited&&scene&&<button type="button" className="button primary" disabled={busy||preparingPhotos||budgetBlocked} onClick={()=>{focusComposerArea();void run(false,undefined,undefined,blank());}}><Send size={15}/>Update for this place</button>}</>
  :panel==="history"?<div className="generation-messages">{messages.length?messages.slice(-12).map((m,i)=><div className={`generation-message message-${m.role}`} key={i}><span>{m.role==="you"?"YOU":"BRICKS"}</span><p>{m.text}</p></div>):<p>Nothing yet. Your requests and the results appear here.</p>}</div>
  :panel==="bigger"?<><p>Starts over as a new design at the largest size: up to 4,000 pieces in 80 × 80 studs. It is a full paid build (research, design and review), the most expensive step. This version stays in Versions, so going back is free.</p><div className="feedback-panel-actions"><button type="button" className="button primary" disabled={busy||preparingPhotos||budgetBlocked} onClick={()=>{focusComposerArea();setPanel("");void run(false,undefined,{brief:{...brief,size:"large",maxWidth:80,maxDepth:80,maxHeight:160,maxPieces:4000}});}}><Maximize2 size={15}/>Rebuild bigger</button><button type="button" className="button secondary" onClick={closePanel}>Cancel</button></div></>:null;
 const queueCard=queuedFeedback&&<div className="feedback-queue" role="status"><p><strong>{queuedFeedback.status==="paused"?"Waiting for you":"Next"}:</strong> {queuedLabel(queuedFeedback.value,componentLabel)}</p>{queuedFeedback.status==="paused"&&<span>The last pass stopped or needs attention.</span>}<div className="feedback-queue-actions">{queuedFeedback.status==="paused"&&<button type="button" disabled={busy||preparingPhotos||budgetBlocked} onClick={resumeQueuedFeedback}>Run it</button>}<button type="button" disabled={preparingPhotos} onClick={editQueuedFeedback}>Edit</button><button type="button" onClick={removeQueuedFeedback}>Remove</button></div></div>;
 const sendLabel=preparingPhotos?"Preparing photos…":actions.submit;
 // aria-disabled, not disabled: Send keeps focus when a send or queue empties the composer behind it.
 const sendBlocked=budgetBlocked||preparingPhotos||markingRegion||actions.submitDisabled;
 const composer=<form id="feedback-composer" ref={composerRef} tabIndex={-1} aria-labelledby="feedback-composer-label" className="finish-feedback feedback-composer" onSubmit={e=>{e.preventDefault();submitFeedback();}}>
  <label id="feedback-composer-label" htmlFor="generation-prompt" className="feedback-composer-label">What would you like to change?</label>
  {needKey&&keyCard}
  {(lasso||picked.length>0)&&<div className="composer-targets" role="group" aria-label="Targets for this change">{lasso&&<span className="composer-target is-area"><img src={lasso.image} alt=""/>Drawn area{lasso.components.length?` · ${componentLabel(lasso.components[0])}${lasso.components.length>1?` +${lasso.components.length-1}`:""}`:""}<button type="button" aria-label="Remove the drawn area" onClick={e=>removeTarget(()=>editLasso(undefined),e.currentTarget)}><X size={14}/></button></span>}{picked.map(c=><span key={c} className="composer-target"><Box size={13} aria-hidden/>{componentLabel(c)}<button type="button" aria-label={`Remove ${componentLabel(c)}`} onClick={e=>removeTarget(()=>togglePick(c),e.currentTarget)}><X size={14}/></button></span>)}</div>}
  {partsOpen&&components.length>0&&<div className="composer-parts" role="group" aria-labelledby="composer-parts-label"><span id="composer-parts-label">Pick a part, or tap it on the model</span><div>{components.map(c=><button key={c} type="button" aria-pressed={picked.includes(c)} onClick={()=>pickFromList(c)}>{componentLabel(c)}</button>)}</div></div>}
  {picked.length>0&&!partsOpen&&<div className="quick-chips" role="group" aria-label="Quick changes">{QUICK_ACTIONS.map(a=><button key={a.id} type="button" onClick={()=>quick(a.id)}>{a.label}</button>)}</div>}
  <div className="composer-input">
   <Textarea id="generation-prompt" inputMode="text" enterKeyHint="enter" autoCapitalize="sentences" rows={2} maxLength={2000} value={prompt} onChange={e=>editPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();submitFeedback();}}} placeholder={picked.length?`What should change about the ${componentLabel(picked[0]).toLowerCase()}?`:lasso?"What should change in the drawn area?":draft?"Describe a change, or select a part.":"Add a detail for the next pass."}/>
   {!needKey&&<button type="submit" className="button primary feedback-submit" aria-disabled={sendBlocked||undefined}><Send size={15} aria-hidden/>{sendLabel}</button>}
  </div>
  <PhotoAttachments photos={collectReferencePhotos(reference||undefined,photos)} pasteTargetId="generation-prompt" disabled={!open||markingRegion} onPreparing={setPreparingPhotos} onAdd={added=>editReferences(mergeReferencePhotos(editorReferences,added))} onRemove={photo=>editReferences({...editorReferences,photo:reference===photo?undefined:reference||undefined,photos:photos.filter(p=>p!==photo)})}>
   <button type="button" className="composer-tool" aria-expanded={partsOpen} data-active={picked.length>0||undefined} disabled={!draft||markingRegion} onClick={toggleParts}><MousePointerClick size={16} aria-hidden/><span>Select part</span></button>
   <button type="button" className="composer-tool" aria-pressed={markingRegion||Boolean(lasso)} disabled={!draft} onClick={()=>markingRegion?setMarkingRegion(false):startMarking()}><LassoSelect size={16} aria-hidden/><span>Draw area</span></button>
  </PhotoAttachments>
  <p className="feedback-hint">{busy?"Sending now queues it for after this build.":referenceEdited&&!typed&&scene?"Say what to take from the new photo, then Send.":"Each send is one AI revision. Going back to a version is free."}</p>
 </form>;
 const referenceNode=sheet&&!setup?<details className="reference-sheet feedback-reference"><summary>{referenceEdited?"References updated · checked on your next send":referenceReady(sheet)?`Identified: ${[sheet.subject,sheet.identity?.location].filter(Boolean).join(" · ")}`:"Let’s identify the structure"}</summary><p>{sheet.summary}</p>{sheet.images?.length?<div className="reference-photos">{sheet.images.map(image=><a key={image.url} href={image.source} target="_blank" rel="noreferrer"><img src={image.url} alt={image.caption||"Source reference"} loading="lazy" referrerPolicy="no-referrer"/>View source</a>)}</div>:null}{sheet.included?.length?<div className="reference-chips"><span>Will include</span>{sheet.included.map(x=><i key={x}>{x}</i>)}</div>:null}{sheet.excluded?.length?<div className="reference-chips is-out"><span>Will leave out</span>{sheet.excluded.map(x=><i key={x}>{x}</i>)}</div>:null}{sheet.uncertainties?.length?<p><strong>Uncertain:</strong> {sheet.uncertainties.join("; ")}</p>:null}{sheet.sources.length>0&&<small>{sheet.sources.map((u,i)=><a key={i} href={u} target="_blank" rel="noreferrer">Source {i+1}</a>)}</small>}</details>:null;
 const notesNode=notes.length>0&&!setup?<details className="builder-notes"><summary>How Bricks built it</summary><div className="builder-notes-list">{notes.map((n,i)=>{const text=plainThought(n.text);return text?<div key={i} className={`builder-note ${n.live?"is-live":""}`}><span>{n.phase}</span><p>{text}</p></div>:null;})}</div></details>:null;
 const menu=finished&&<DropdownMenu><DropdownMenuTrigger asChild><button ref={moreButton} type="button" className="creation-more" aria-label="More actions"><Ellipsis size={17} aria-hidden/><span>More</span></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="feedback-menu" onCloseAutoFocus={e=>{const go=afterMenu.current;afterMenu.current=null;if(!go)return;e.preventDefault();go();}}>
  <DropdownMenuItem disabled={interrupted||budgetBlocked||preparingPhotos} onSelect={()=>{afterMenu.current=()=>focusLater(".creation-stop");void run(true);}}><Eye size={15}/>Review again</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>{afterMenu.current=()=>focusLater(".generator-dialog [data-slot=dialog-title]");setSetup(true);}}><SlidersHorizontal size={15}/>Edit brief</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>openPanel("locks",true)}><LockKeyhole size={15}/>Protect parts{locked.length?` (${locked.length})`:""}</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>openPanel("sign",true)}><Type size={15}/>Sign text</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>openPanel("place",true)}><MapPin size={15}/>Place or structure</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>openPanel("history",true)}><ScrollText size={15}/>Design history</DropdownMenuItem>
  <DropdownMenuSeparator/>
  <DropdownMenuItem onSelect={()=>keep(true)}><ShoppingBag size={15}/>Get the pieces</DropdownMenuItem>
  <DropdownMenuItem onSelect={()=>{afterMenu.current=()=>{if(!revealConnectionKey())requestAnimationFrame(()=>revealConnectionKey());};askForKey();}}><KeyRound size={15}/>AI settings</DropdownMenuItem>
  {brief.size!=="large"&&<><DropdownMenuSeparator/><DropdownMenuItem disabled={budgetBlocked||preparingPhotos} onSelect={()=>openPanel("bigger",true)}><Maximize2 size={15}/>Rebuild bigger…</DropdownMenuItem></>}
 </DropdownMenuContent></DropdownMenu>;
 const suggestionsNode=<ReviewSuggestions key={current??0} suggestions={suggestions} looksRight={looksRight} approved={fixes} disabled={preparingPhotos} onToggle={t=>{composerVersion.current++;setApproved(list=>list.includes(t)?list.filter(x=>x!==t):[...list,t]);}}/>;
 const costLine=[settledCalls>0?`$${runCost.toFixed(runCost<.1?3:2)} this run`:"",budget?`$${budget.remaining.toFixed(2)} of $10 left`:""].filter(Boolean).join(" · ");
 return <Dialog open={open} onOpenChange={v=>{if(!v){if(preparingPhotos){toast.info("Finishing your photos. This window can close in a moment.",{id:"photos-preparing"});return;}if(running.current&&stopHold>0)toast.info(stopCostNotice(stopHold),{id:"stop-cost"});if(!running.current&&dirty.current&&!interrupted)keep(false,true);else if(!previous&&!scene)onDraftChange?.({prompt:brief.idea===PHOTO_IDEA?"":brief.idea,photos:collectReferencePhotos(reference||undefined,photos)});stop();}onOpenChange(v);}}><DialogContent onEscapeKeyDown={e=>{if(markingRegion){e.preventDefault();setMarkingRegion(false);}}} onOpenAutoFocus={e=>{e.preventDefault();document.querySelector<HTMLElement>(".generator-dialog [data-slot=dialog-title]")?.focus({preventScroll:true});}} className={`generator-dialog design-flow feedback-flow ${setup?"is-brief":"is-design"} mobile-refine ${busy?"is-building":""}`}><DialogHeader><DialogTitle tabIndex={-1}>{setup?"Let’s make it yours.":busy?draft?"Taking shape.":"Every build starts with an idea.":draft?draft.name:error?"Let’s get this working.":"Your canvas is ready."}</DialogTitle><DialogDescription>{setup?"Start with your idea. The finer details are optional.":busy?"Follow the real design as it arrives, piece by piece.":draft?briefRecap(brief):"Your idea is safe. Start when you’re ready."}</DialogDescription></DialogHeader>

 {/* The piece count lives in the result card; the toolbar says what is on the canvas (a peeked version, say). The cost of
     stopping sits under Stop, where it is decided. */}
 {!setup&&<div className="creation-toolbar"><span>{busy?phase==="review"?"Reviewing the details":phase==="check"?"Checking the connections":phase==="repair"?"Refining the design":draft?"Building live":"Composing your idea":peekModel?`Viewing v${peek}`:draft?interrupted?"Unfinished draft":phase==="done"?<><Check size={15}/>Finished</>:"Ready to refine":"Ready when you are"}</span><div>{busy&&<button type="button" className="creation-motion" disabled={!draft} aria-pressed={motionPaused} onClick={()=>setMotionPaused(v=>!v)}>{motionPaused?<Play size={16}/>:<Pause size={16}/>}<span>{motionPaused?"Resume":"Pause motion"}</span></button>}{busy&&<button type="button" className="creation-stop" aria-describedby={stopHold>0?"stop-hold":undefined} onClick={stop}><Square size={14}/><span>Stop</span></button>}{menu}{finished&&<button type="button" className="creation-done" disabled={preparingPhotos} onClick={()=>keep()}>Save & close<ArrowRight size={16}/></button>}</div>{busy&&stopHold>0&&<p className="stop-hold" id="stop-hold">{stopCostNotice(stopHold)}</p>}</div>}
 <div className="generator-layout"><div id="creation-controls" className="generator-conversation">
 {setup?<><BriefForm brief={brief} onChange={b=>{setBrief(b);setReview(null);}}/>{referenceInputs}{errorPanel}{!needKey&&connection}</>:<>
  {panel&&panelBody&&<div className="feedback-panel-card" id="feedback-panel" role="region" aria-labelledby="feedback-panel-title"><div className="feedback-panel-head"><strong id="feedback-panel-title" tabIndex={-1}>{PANEL_TITLES[panel]}</strong><button type="button" aria-label={`Close ${PANEL_TITLES[panel]}`} onClick={closePanel}><X size={16}/></button></div>{panelBody}</div>}
  {!scene&&clarification&&<button className="button primary" disabled={busy||preparingPhotos||budgetBlocked} onClick={()=>void run()}>Check references and continue<ArrowRight size={16}/></button>}
  {!narrow&&suggestionsNode}
  {busy&&working&&<p className="feedback-working" role="status"><LoaderCircle size={14} className="spin" aria-hidden/><span>Working on</span>“{working}”</p>}
  {queueCard}
  {!draft&&!busy&&needKey?<div ref={composerRef} id="feedback-composer" tabIndex={-1} className="finish-feedback feedback-composer is-key-only">{keyCard}</div>:composer}
  {!needKey&&connection}
 </>}
 </div><div className="generation-preview"><div className="generation-preview-header"><span>{setup?"YOUR DESIGN BRIEF":busy?phase==="repair"?"REFINING":"LIVE DESIGN":draft?.name||"YOUR 3D BUILD"}</span>{busy&&<span><LoaderCircle size={13} className="spin"/>{(draft?.pieces.length||0).toLocaleString()} bricks placed</span>}</div>
 {!setup&&<><div className="generation-canvas">{shownModel?<Viewport {...({onPickPiece:pickPiece} as object)} regionMode={markingRegion} onRegion={attachRegion} onCancelRegion={()=>setMarkingRegion(false)} arrivals={{epoch:replay,paused:motionPaused,mode:arrivalMode}} pieces={shownModel.pieces} length={shownModel.length} width={shownModel.width} height={shownModel.height} modelKey="live-creation" explode={0} stage={100000} selected={null} view={view} reset={0} rotate={false} highlightIds={highlightIds} onPick={()=>{}}/>:<div className="generation-empty"><span className="empty-stage-label">{busy?"THE FIRST PIECES ARE ON THEIR WAY":error?"GENERATION PAUSED":"YOUR NEXT CREATION"}</span><strong>{busy?brief.idea:error?"Your idea is still here.":"An open canvas."}</strong><p>{busy?"Waiting for the builder’s first geometry. Bricks will appear here as soon as it arrives.":error?error:needKey?"Connect your AI to start building.":"Start a design from your brief."}</p>{!busy&&!needKey&&<button className="button primary" onClick={()=>setSetup(true)}>Back to my brief<ArrowRight size={16}/></button>}</div>}</div><button className="generation-assembly" disabled={!draft||busy||markingRegion||peek!==null} onClick={()=>{setMotionPaused(false);setArrivalMode("assemble");setReplay(v=>v+1);}}><Play size={17} fill="currentColor"/>Replay assembly</button><div className="review-camera">{["perspective","front","top"].map(v=><button key={v} disabled={markingRegion} className={view===v?"active":""} onClick={()=>setView(v)}>{v}</button>)}</div></>}
 {!setup&&<RevisionStrip versions={versions} current={current} peek={peek} compare={compare} tint={tint} previous={prevVersion?.n} disabled={busy||markingRegion} onPeek={(n,c)=>{setArrivalMode("still");showVersion(n,c);}} onTint={setTint} onRestore={restoreVersion}/>}
 {previewError&&<p className="live-preview-error" role="status">Preview update: {previewError} The last visible draft is kept.</p>}{!setup&&errorPanel}<div className={`generation-status ${finished?"is-finished":""}`} role="status">{busy?<LoaderCircle size={15} className="spin"/>:ready?<Check size={15}/>:<Sparkles size={15}/>}<p>{status||(scene?finishStatus(checks?.issues.length||0,false):"Your brief is ready when you are.")}</p>{costLine&&<span className="live-budget">{costLine}</span>}{settledCalls>0&&<RunUsage entries={runUsage} referenceReused={referenceReused}/>}{busy&&<span className="live-elapsed">{elapsed}s · {(draft?.pieces.length||0).toLocaleString()} bricks placed</span>}</div>
 {!setup&&narrow&&suggestionsNode}

 {finished&&draft&&<RevisionResult pieces={draft.pieces.length} size={`${(draft.length*.8).toFixed(1)} × ${(draft.width*.8).toFixed(1)} × ${(draft.height*.32).toFixed(1)} cm`} request={lastRequest||undefined} typed={lastTyped} revision={review?.revision} changes={changes} repairNote={repairNote} corrections={corrections} interrupted={interrupted} continueDisabled={busy||preparingPhotos||budgetBlocked||Boolean(error)} onContinue={()=>{focusComposerArea();void run(false,undefined,undefined,blank());}}>
  <details className="design-inspection"><summary>{ready?"Design checks passed":"Design checks"}<span>{checks?.issues.length?`${checks.issues.length} to look at`:"Geometry OK"}</span></summary><div className={`review-verdict ${ready?"passed":"needs-work"}`}><strong>{ready?"Digital checks passed":"Needs a look"}</strong><span>{checks?.pass?"Support paths and size limits pass.":`${checks?.issues.length} geometry or brief checks need attention.`} {reviewPassed?"The visual review passes.":"The visual review is incomplete or has concerns."}</span></div>
  {checks&&checks.issues.length>0&&<ul className="review-issues">{checks.issues.map(i=><li key={i}>{i}</li>)}</ul>}{review&&<div className="feature-review"><p>{review.summary}</p>{review.scope==="targeted"&&<p className="review-limit">The change was checked in three views; the layout verdict is from the last full review. Use Review again for a full check.</p>}{review.composition&&review.composition.status!=="not_applicable"&&<div><strong>Composition · {review.composition.status}</strong><p>{review.composition.evidence}</p></div>}</div>}<p className="review-limit">Digital checks cover geometry, support paths and visible details. Physical strength, fit and hand access still need a test build.</p></details>
  {phase==="done"&&<BuildRating key={current??0} className="revision-rating" build={{pieceCount:draft.pieces.length,model:QUALITY_MODELS[brief.quality||"sol_low"],...(runCost?{costUsd:runCost}:{}),...(sheet?.kind?{subjectKind:sheet.kind}:{})}} onRated={verdict=>{if(verdict==="needs_work")focusComposer();}}/>}
 </RevisionResult>}
 {referenceNode}{notesNode}
 </div></div>{setup&&<div className="brief-commit">{needKey?connection:<><span>Up to {brief.maxPieces.toLocaleString()} pieces<small>{detailLabel(brief.detail)} design</small></span><button className="button primary begin-design" disabled={brief.idea.trim().length<3||busy||preparingPhotos||configured===null&&!apiKey} onClick={()=>void run()}><Sparkles size={17}/>{configured===null&&!apiKey?"Checking connection…":configured||apiKey?scene?"Rebuild design":"Build my design":"Connect & build"}<ArrowRight size={17}/></button></>}</div>}</DialogContent></Dialog>;
}
