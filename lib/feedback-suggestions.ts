import type {VisualReview} from "./design-project";
import {clipSentence} from "./utils";
import {componentLabel} from "./revision-history";

// The review's findings and the builder's own simplifications as tickable suggestions. Nothing here is sent unless the
// owner ticks it: a ticked chip's text goes to the designer as an approved item (FeedbackSnapshot.approved).
export type SuggestionKind="retry"|"missing"|"unclear"|"check"|"fix"|"simplified";
export type Suggestion={id:string;kind:SuggestionKind;tag:string;label:string;text:string};
// Kinds that say something is wrong (a failed check, a missing or unclear feature, an unseen request). Fix and Simplified
// chips are ideas: a build with only those has passed its checks.
export const PROBLEM_KINDS:readonly SuggestionKind[]=["retry","missing","unclear","check"];
export const suggestionsHeading=(list:readonly Pick<Suggestion,"kind">[])=>list.some(s=>PROBLEM_KINDS.includes(s.kind))?"Suggested fixes":"Ideas to improve";
// Same wording as design-workflow's flaggedReviewItems, so a ticked chip and the retry path's flagged items dedupe.
const flagged=(name:string,evidence:string)=>evidence.trim()?`${name}: ${evidence.trim()}`:name;
export const RETRY_ITEM="Requested change not yet visible";
export const isRetryItem=(text:string)=>text===RETRY_ITEM||text.startsWith(`${RETRY_ITEM}:`);

/**
 * request: the change the last pass was asked for (offered again when the review could not see it). issues: the design
 * checks that failed (geometry, size, sign); they are local, so they are offered with or without a review. notes: the
 * scene's private notes, passed only for a scene the builder wrote in this format; a migrated legacy caption is
 * description text, not a list of simplifications, and must not become "Simplified" chips.
 */
export function reviewSuggestions(review:VisualReview|null|undefined,s:{request?:string;issues?:readonly string[];notes?:readonly string[]}={}):{suggestions:Suggestion[];looksRight:string[]}{
 const out:Suggestion[]=[],looksRight:string[]=[],add=(kind:SuggestionKind,tag:string,label:string,text:string)=>{const t=clipSentence(text.replace(/\s+/g," ").trim(),500),l=label.replace(/\s+/g," ").trim();if(t&&l&&!out.some(o=>o.text===t))out.push({id:`${kind}-${out.length}`,kind,tag,label:l,text:t});};
 if(review){
  // A chip-only send is recorded as "Apply the approved fixes: …"; offer the fix itself, once, as the retry.
  const r=review.revision,asked=(s.request||"").trim().replace(/^Apply the approved fixes:\s*/i,"");if(r&&["missing","uncertain"].includes(r.status)&&asked)add("retry","Retry",clipSentence(asked,120),flagged(RETRY_ITEM,r.evidence));
  if(!review.recognizable&&review.composition&&["mismatch","uncertain"].includes(review.composition.status))add("missing","Layout","Overall layout",review.composition.evidence);
  for(const f of review.features)if(f.status==="visible")looksRight.push(f.feature);else add(f.status==="missing"?"missing":"unclear",f.status==="missing"?"Missing":"Hard to tell",f.feature,flagged(f.feature,f.evidence));
  for(const f of review.rubric||[])if(f.status==="visible")looksRight.push(f.feature);else if(f.status==="missing")add("missing","Missing",f.feature,flagged(f.feature,f.evidence));
 }
 for(const i of s.issues||[])add("check","Check",i,i);
 const retried=out.find(o=>o.kind==="retry")?.label.replace(/…$/,"")||"";
 for(const i of review?.improvements||[])if(!retried||!i.startsWith(retried.slice(0,60)))add("fix","Fix",i,i);
 // The builder's own simplifications, offered as the action a tick takes: more detail there.
 for(const n of s.notes||[])add("simplified","Add detail",n,`Improve this simplification: ${n}`);
 return {suggestions:out,looksRight:[...new Set(looksRight)]};
}

// Quick changes for tapped parts. Change color leaves the sentence open so the owner names the color.
export const QUICK_ACTIONS=[{id:"steeper",label:"Make steeper"},{id:"color",label:"Change color"},{id:"remove",label:"Remove"},{id:"detail",label:"Add detail"}] as const;
export type QuickAction=typeof QUICK_ACTIONS[number]["id"];
export function quickRequest(action:QuickAction,components:readonly string[]){
 const names=components.map(c=>componentLabel(c).toLowerCase()),target=`the ${names.length>1?`${names.slice(0,-1).join(", the ")} and the ${names.at(-1)}`:names[0]||"selected part"}`;
 return action==="steeper"?`Make ${target} steeper.`:action==="color"?`Change the color of ${target} to `:action==="remove"?`Remove ${target}.`:`Add more detail to ${target}.`;
}

/**
 * What Design history shows for a pass: exactly what was typed, or a plain label for a pass started without words.
 * checks: how many of the ticked fixes were failed design checks; a pass of only those reads as fixing the checks.
 */
export function historyLabel(s:{typed:string;fixes?:number;checks?:number;retry?:string;continuing?:boolean;region?:boolean;photos?:boolean;sign?:boolean;brief?:boolean;first?:string;restored?:number}){
 if(s.typed.trim())return s.typed.trim();
 if(s.restored)return `Went back to v${s.restored}`;
 if(s.continuing)return "Continued the unfinished design";
 if(s.retry)return `Retried: ${clipSentence(s.retry,200)}`;
 if(s.fixes&&s.checks===s.fixes)return "Fixed the flagged checks";
 if(s.fixes)return `Applied ${s.fixes} suggested change${s.fixes===1?"":"s"}`;
 if(s.region)return "Changed the marked area";
 if(s.photos)return "Matched the new photos";
 if(s.sign)return "Updated the sign text";
 if(s.brief)return "Updated the brief";
 if(s.first)return s.first.trim();
 return "Fixed the flagged checks";
}

// The thinking stream is the model's reasoning summary; schema fragments and markdown markers are noise to a reader.
export const plainThought=(text:string)=>text.replace(/\*\*/g,"").replace(/`[^`\n]*`/g,"").replace(/\{[^{}\n]*\}/g,"").replace(/"(?:sh|rm|nt|dim|n|d|f|c|k|op)"\s*:?/g,"").replace(/[ \t]{2,}/g," ").replace(/ +([.,;:])/g,"$1").trim();
