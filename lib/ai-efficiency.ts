import {referenceReady} from "./design-research";
import type {ReferenceSheet} from "./design-research";
import type {GeneratedScene} from "./generated-scene";

// Unambiguous, local appearance/size edits: the review re-checks these in targeted mode.
export function isLocalDesignEdit(feedback:string):boolean{
 const text=feedback.trim().toLowerCase().replace(/[.!]+$/,"").replace(/\s+/g," ").replace(/^please /,"");
 const target="(?:the )?(?:roof|walls?|windows?|doors?|base|building|tower|sign|facade|model)";
 const color="(?:(?:dark|light) )?(?:blue|green|red|gray|grey|brown|tan|yellow|orange|pink|purple|black|white)";
 return new RegExp(`^make ${target} (?:a (?:little|bit) )?(?:darker|lighter|taller|shorter|wider|narrower|thicker|thinner|larger|smaller|${color})$`).test(text)
  ||new RegExp(`^(?:paint|recolor) ${target} (?:${color})$`).test(text)
  ||new RegExp(`^change (?:the )?(?:color|colour) of ${target} to ${color}$`).test(text);
}

// A revision reuses the saved research sheet unless the feedback brings new evidence about what the subject is:
// a link, an identity statement, or a proper noun the sheet and the model do not already name. A lookup costs
// $0.06-0.13, and "make the train silver" or "I don't like the roof" never changes the subject. New or changed
// photos, a new place hint, a changed brief and an unready sheet are checked by the caller, which always re-researches
// for them.
const URL_CUE=/https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|org|net|gov|edu|io|co|uk|info)\b/i;
const IDENTITY_CUES=[/\bwrong (?:building|place|structure|landmark|station|bridge|tower|location|city|one)\b/i,/\blocated (?:in|at|on|near)\b/i,/\bactually\b/i,/\b[Tt]his is (?:not )?(?:the |a |an )?(?:real |actual )?[A-Z0-9]/];
const NOT_NAMES=new Set(["i","i'm","i'd","i've","i'll","lego","ok","okay","please","thanks"]);
const nameWords=(text:string)=>text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]*/g)||[];
export function needsFreshResearch(feedback:string,sheet?:ReferenceSheet,scene?:GeneratedScene):boolean{
 const text=feedback.trim();if(!text)return false;if(!sheet)return true;
 if(URL_CUE.test(text)||IDENTITY_CUES.some(cue=>cue.test(text)))return true;
 const known=new Set(nameWords([sheet.subject,sheet.hero,sheet.summary,sheet.layout,sheet.identity?.location,...(sheet.included||[]),...(sheet.excluded||[]),...sheet.distinctive,...sheet.silhouette,scene?.name,...(scene?.shapes||[]).flatMap(s=>[s.component,s.label,s.text])].filter(Boolean).join(" ")));
 // Capitalized words that do not start a sentence: "Union Station", "the Smithsonian"; ALL-CAPS words are sign text or emphasis.
 for(const m of text.matchAll(/[A-Z][a-z][A-Za-z'’-]*/g)){
  const raw=text.slice(0,m.index),before=raw.trimEnd(),word=m[0].toLowerCase();
  if(!before||/[.!?:;"“(]$/.test(before)||/\n\s*$/.test(raw)||/[A-Za-z0-9'’]$/.test(raw))continue;
  if(!NOT_NAMES.has(word)&&!known.has(word.replace(/['’]s$/,"")))return true;
 }
 return false;
}

// After a lookup: a ready sheet is used. An unready one asks its question, unless a confirmed sheet for the same brief
// is saved: then a lookup forced by feedback, new photos or a place hint falls back to it (with a note) instead of
// stopping a paid pass with a question the earlier lookup already answered.
export function lookupOutcome(sheet:ReferenceSheet,fallback?:{sheet?:ReferenceSheet}):"ready"|"fallback"|"ask"{
 return referenceReady(sheet)?"ready":fallback?.sheet&&referenceReady(fallback.sheet)?"fallback":"ask";
}

// Output ceilings sized to the request: they set the ledger hold, and a stop settles below them. A first build (or a
// continuation) may write the contract's 240 shapes at about 80 tokens each plus a 2k header; a revision may re-emit
// every shape it was given ("make it bigger", "change all windows"), never less than 14k; reasoning gets its effort's
// allowance (unset effort is the provider's medium). Never above the 32k the ledger accepts.
export const SHAPE_LIMIT=240,TOKENS_PER_SHAPE=80;
export const reasoningAllowance=(effort?:string)=>effort==="none"||effort==="minimal"?2000:effort==="low"?6000:effort==="high"?16000:12000;
export function designOutputLimit(previousShapes:number,effort?:string,first=false):number{
 const allowance=reasoningAllowance(effort);
 return Math.min(32000,first?2000+TOKENS_PER_SHAPE*SHAPE_LIMIT+allowance:Math.max(14000,TOKENS_PER_SHAPE*previousShapes+allowance));
}

// Null fields in the compact scene mean "not applicable". Omit them only in
// input context; the generated output retains its strict schema and all fields.
export function compactSceneContext(scene:unknown):unknown{
 return JSON.parse(JSON.stringify(scene,(_key,value)=>value===null?undefined:value));
}

// Cache the stable instructions and the reference sheet, never a changing
// request suffix. partCatalog and examples are chosen from each request's own
// wording, so they differ between revisions; placing them behind a breakpoint
// would pay the cache-write premium on every call without ever being read.
// Preserve role boundaries: source data remains user content.
export function cacheStableContext(request:Record<string,any>):Record<string,any>{
 if(!["gpt-6.1-sol","gpt-5.6-terra","gpt-5.6-sol","gpt-6-astra"].includes(request.model)||typeof request.instructions!=="string"||!Array.isArray(request.input))return request;
 const {instructions,...rest}=request;
 const breakpoint={mode:"explicit"};
 const prefix:any[]=[{role:"developer",content:[{type:"input_text",text:instructions,prompt_cache_breakpoint:breakpoint}]}];
 const input=request.input.map((message:any)=>({...message,content:Array.isArray(message.content)?message.content.map((block:any)=>({...block})):message.content}));
 const first=input[0];
 if(first?.role==="user"&&first.content?.[0]?.type==="input_text"){
  try{
   const data=JSON.parse(first.content[0].text),stable:Record<string,unknown>={};
   for(const key of ["referenceSheet"]){if(data[key]!==undefined){stable[key]=data[key];delete data[key];}}
   if(Object.keys(stable).length){prefix.push({role:"user",content:[{type:"input_text",text:JSON.stringify(stable),prompt_cache_breakpoint:breakpoint}]});first.content[0].text=JSON.stringify(data);}
  }catch{/* Plain-text requests retain their original content. */}
 }
 return {...rest,prompt_cache_options:{mode:"explicit"},input:[...prefix,...input]};
}
