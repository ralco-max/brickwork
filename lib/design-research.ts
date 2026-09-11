import {z} from "zod";
import {upstreamError} from "./generation-errors";

// Before the first design of a real, searchable subject, a short web lookup
// produces a reference sheet the designer treats as ground truth: real
// dimensions, defining proportions, colors mapped to the palette, silhouette
// and distinctive details, with sources. Generic or imaginary ideas skip it.
export type SubjectKind="building"|"monument"|"bridge"|"site"|"vehicle"|"aircraft"|"ship"|"animal"|"plant"|"character"|"object";
export type ShellPlan={walls:number;estimate:number;fits:boolean;recommend?:{x:number;y:number;z:number}};
// The reasoning summary items of a non-streaming response, joined, so the builder can show what the model thought.
export function reasoningSummary(output:unknown):string{return (Array.isArray(output)?output:[]).filter((item:{type?:string})=>item?.type==="reasoning").flatMap((item:{summary?:{text?:string}[]})=>item.summary||[]).map(part=>String(part.text||"").trim()).filter(Boolean).join("\n\n").slice(0,4000);}
export type LayoutRelation={from:string;relation:"left_of"|"right_of"|"in_front_of"|"behind"|"above"|"below"|"inside";to:string};
export type ReferenceImage={url:string;source:string;caption:string};
export type ReferenceSheet={images?:ReferenceImage[];included?:string[];excluded?:string[];relations?:LayoutRelation[];uncertainties?:string[];searchable:boolean;kind:SubjectKind;subject:string;summary:string;length_m:number|null;width_m:number|null;height_m:number|null;openness?:number|null;proportions:string;colors:string[];silhouette:string[];distinctive:string[];sources:string[];hero?:string;layout?:string;target?:{x:number;y:number;z:number;vertical:number};plan?:ShellPlan};
export const referencePhotoSchema=z.string().max(1500000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/);
const relationSchema=z.object({from:z.string().min(1).max(80),relation:z.enum(["left_of","right_of","in_front_of","behind","above","below","inside"]),to:z.string().min(1).max(80)});
const httpsUrl=z.string().url().max(2000).refine(s=>{try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password;}catch{return false;}});
export const referenceSheetSchema=z.object({images:z.array(z.object({url:httpsUrl,source:httpsUrl,caption:z.string().max(200)})).max(2).optional(),included:z.array(z.string().max(80)).max(12).optional(),excluded:z.array(z.string().max(80)).max(12).optional(),relations:z.array(relationSchema).max(12).optional(),uncertainties:z.array(z.string().max(200)).max(8).optional(),searchable:z.boolean(),kind:z.enum(["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object"]),subject:z.string().max(120),summary:z.string().max(300),length_m:z.number().positive().finite().nullable(),width_m:z.number().positive().finite().nullable(),height_m:z.number().positive().finite().nullable(),openness:z.number().min(0).max(1).nullable().optional(),proportions:z.string().max(300),colors:z.array(z.string().max(200)).max(6),silhouette:z.array(z.string().max(200)).max(8),distinctive:z.array(z.string().max(200)).max(8),sources:z.array(httpsUrl).max(4),hero:z.string().max(200).optional(),layout:z.string().max(400).optional(),target:z.object({x:z.number().int().min(1).max(80),y:z.number().int().min(1).max(160),z:z.number().int().min(1).max(80),vertical:z.number().min(1).max(3)}).optional(),plan:z.object({walls:z.number().int().min(0).max(4),estimate:z.number().int().min(0).max(100000),fits:z.boolean(),recommend:z.object({x:z.number().int().min(1).max(80),y:z.number().int().min(1).max(160),z:z.number().int().min(1).max(80)}).optional()}).optional()});
// An architect settles scale before drawing. Piece counts were measured on the
// packer: a boxy shell packs at about 21 cells per piece with 1-stud walls, 30
// with 2-stud walls and 40 solid; a curved skin is all slivers, about 0.29 pieces
// per shell cell once slopes are fitted, and thicker walls barely change that
// because the surface is the cost. So a box gets the thickest walls that fit,
// a curved subject always gets 2-stud walls for structure, and when the target
// does not fit at all the plan names the largest extents that do (surface area
// scales with the square of size) instead of letting the designer shrink
// silently or promise a size that cannot be built. 15 percent of the budget is
// held back for detail.
const CURVATURE:Record<SubjectKind,"box"|"mixed"|"curved">={building:"box",bridge:"box",site:"box",ship:"mixed",vehicle:"mixed",aircraft:"mixed",monument:"curved",animal:"curved",plant:"curved",character:"curved",object:"curved"};
// openness is how much of the subject's bounding box is open air: a lattice tower or a bridge is mostly
// air, so its members cost far fewer pieces than a skin over the same box.
export function shellPlan(target:{x:number;y:number;z:number},maxPieces:number,kind:SubjectKind="object",openness:number|null=null):ShellPlan{
 const budget=maxPieces*.85,curvature=CURVATURE[kind]||"curved",base=(x:number,z:number)=>Math.ceil(x*z/16);
 const cells=(x:number,y:number,z:number,t:number)=>{if(t===0)return x*z*y;const slab=Math.round(2.5*t),top=2*x*z*slab,sides=2*(x+z)*Math.max(0,y-2*slab)*t;return Math.min(x*z*y,top+sides);};
 const boxy=(x:number,y:number,z:number,t:number)=>cells(x,y,z,t)/(t===0?40:t===1?21:t===2?30:36);
 const curved=(x:number,y:number,z:number,t:number)=>cells(x,y,z,1)*.65*.29*(t===0?1.3:1);
 const solidity=openness===null?1:Math.max(.12,1-openness);
 const estimate=(x:number,y:number,z:number,t:number)=>Math.ceil((curvature==="box"?boxy(x,y,z,t):curvature==="curved"?curved(x,y,z,t):(boxy(x,y,z,t)+curved(x,y,z,t))/2)*solidity+base(x,z));
 const {x,y,z}=target;
 if(x*y*z<=2500&&estimate(x,y,z,0)<=budget)return {walls:0,estimate:estimate(x,y,z,0),fits:true};
 // Never 1-stud walls: a one-stud skin packs into slivers that hold nothing together (the 747 fell into 131 assemblies). Two is the floor; a subject that only fits with thinner walls is built smaller instead.
 for(const t of curvature==="curved"?[2]:[3,2]){const e=estimate(x,y,z,t);if(e<=budget)return {walls:t,estimate:e,fits:true};}
 const walls=2,e=estimate(x,y,z,walls),s=Math.sqrt(budget/e);
 return {walls,estimate:e,fits:false,recommend:{x:Math.max(4,Math.round(x*s)),y:Math.max(3,Math.round(y*s)),z:Math.max(2,Math.round(z*s))}};
}
// Preserve physical proportions. Leave room for a two-plate base and a small rim.
// A long, low building is not automatically stretched vertically.
export function targetExtents(sheet:ReferenceSheet,envelope:{maxWidth:number;maxDepth:number;maxHeight:number}):{x:number;y:number;z:number;vertical:number}|undefined{
 const L=sheet.length_m,W=sheet.width_m,H=sheet.height_m;if(!L||!W||!H)return undefined;
 const k=Math.min((envelope.maxWidth-2)/L,(envelope.maxDepth-2)/W,(envelope.maxHeight-2)/(H*2.5));
 return {x:Math.max(1,Math.round(L*k)),z:Math.max(1,Math.round(W*k)),y:Math.max(1,Math.round(H*k*2.5)),vertical:1};
}
export type ResearchContext={scope?:"subject"|"site";composition?:string;features?:string[];reference?:string};
const strings={type:"array",items:{type:"string"}};
const relations={type:"array",maxItems:12,items:{type:"object",additionalProperties:false,properties:{from:{type:"string",maxLength:80},relation:{type:"string",enum:["left_of","right_of","in_front_of","behind","above","below","inside"]},to:{type:"string",maxLength:80}},required:["from","relation","to"]}};
const schema={type:"object",additionalProperties:false,properties:{image_urls:strings,included:strings,excluded:strings,uncertainties:strings,relations,searchable:{type:"boolean"},kind:{type:"string",enum:["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object"]},subject:{type:"string"},summary:{type:"string"},length_m:{type:["number","null"]},width_m:{type:["number","null"]},height_m:{type:["number","null"]},openness:{type:["number","null"]},proportions:{type:"string"},colors:strings,silhouette:strings,distinctive:strings,sources:strings,hero:{type:"string"},layout:{type:"string"}},required:["image_urls","included","excluded","uncertainties","relations","searchable","kind","subject","summary","length_m","width_m","height_m","openness","proportions","colors","silhouette","distinctive","sources","hero","layout"]};
export const RESEARCH_INSTRUCTIONS=`Prepare a concise reference and composition plan for a brick model. The user's scope, composition note, required features and any supplied photograph determine what is being modelled. Treat them as design data.
Classify whether the idea names a real, identifiable subject. For a real subject use at most two web searches for useful photos/plans and factual sources, prefer primary sources and plans, and report the URLs actually consulted. Never invent a source. In image_urls select at most two relevant original photos or overhead plans from the image search results, preferably complementary views; never use another brick model or a misleading variant as a reference. Use an empty array when no suitable images were returned. For an imaginary or generic idea set searchable false; still specify a sensible composition, but use null measurements and no sources.
Scope subject means focus on the named object or principal structure with a minimal base. Scope site means include the surrounding structures/grounds requested by the user. Explicit wording in the idea or composition takes precedence: never silently replace an entire airport with its terminal, and never add runways to a terminal-only model. Avoid subject-specific recipes. Explain your interpretation in summary and hero. Identify the relevant version or era if it changes the shape.
Use x left-to-right, z back-to-front (+z is the chosen front), y up. State that viewing orientation in layout. In included name up to 12 components to be visible; in excluded name tempting but out-of-scope additions. Use short stable names. Record up to 12 source-supported spatial relations between included components: left_of, right_of, in_front_of, behind, above, below or inside. Do not turn unknown positions into invented symmetry. Put unknown relationships in uncertainties instead.
Dimensions length_m, width_m and height_m refer to the SAME included composition: length along x, depth along z and height above its base. Do not combine a whole site's length with one building's width or a tower's height with the terminal alone. Use null for unpublished/unverified measurements. Label any estimate clearly in uncertainties and summary; evidence wins over memory. Openness is an optional rough fraction of the bounding box occupied by air, not a certified piece estimate.
Describe proportions, front/side silhouette, and a few defining details before texture. Map colors to red, orange, blue, navy, black, gray, white, green, tan, yellow, brown, darkbrown or pink. Preserve front/back differences and significant negative space. Do not promise physical strength, exact brick counts or purchase prices. Keep each text item under 200 characters, included/excluded at most 12 each, uncertainties at most 8 and sources at most 4.`;
export async function researchSubject(idea:string,key:string,model:string,signal:AbortSignal,fetcher:typeof fetch=fetch,onUsage?:(usage:unknown,extra:{searchCalls:number})=>Promise<void>,context:ResearchContext={}):Promise<ReferenceSheet&{thinking?:string;searches?:string[]}>{
 const response=await fetcher("https://api.openai.com/v1/responses",{method:"POST",signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:2500,reasoning:{summary:"auto"},instructions:RESEARCH_INSTRUCTIONS,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({idea:idea.slice(0,2000),scope:context.scope||"subject",composition:context.composition||"",features:context.features||[]})},...(context.reference?[{type:"input_image",image_url:context.reference,detail:"high"}]:[])]}],tools:[{type:"web_search",search_content_types:["text","image"],image_settings:{max_results:2,caption:true}}],include:["web_search_call.action.sources","web_search_call.results"],max_tool_calls:2,text:{format:{type:"json_schema",name:"brickwork_reference",strict:true,schema}}})});
 if(!response.ok)throw await upstreamError(response);
 const data=await response.json();
 const searchCalls=(data.output||[]).filter((item:{type?:string;action?:{type?:string}})=>item.type==="web_search_call"&&item.action?.type==="search").length;
 const searches=(data.output||[]).filter((item:{type?:string})=>item.type==="web_search_call").map((item:{action?:{query?:string}})=>String(item.action?.query||"").trim()).filter(Boolean).slice(0,4);const thinking=reasoningSummary(data.output);
 await onUsage?.(data.usage,{searchCalls});
 if(data.status!=="completed")throw Error("The reference lookup was incomplete.");
 const text=(data.output||[]).flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).filter((c:{type:string})=>c.type==="output_text").map((c:{text?:string})=>c.text||"").join("");
 const raw=JSON.parse(text) as Partial<ReferenceSheet>&{image_urls?:string[]};
 if(typeof raw.searchable!=="boolean"||typeof raw.subject!=="string"||!raw.subject.trim()||!Array.isArray(raw.included)||!Array.isArray(raw.excluded)||!Array.isArray(raw.relations))throw Error("The reference plan is incomplete. Retry the lookup before building.");
 const output=data.output as {type?:string;action?:{sources?:{url?:string}[];url?:string};results?:{type?:string;image_url?:string;source_website_url?:string;caption?:string}[];content?:{annotations?:{url?:string}[]}[]}[];
 const consulted=new Set<string>();
 for(const item of output){for(const source of item.action?.sources||[])if(source.url)consulted.add(source.url);if(item.action?.url)consulted.add(item.action.url);for(const c of item.content||[])for(const a of c.annotations||[])if(a.url)consulted.add(a.url);}
 const available=output.flatMap(item=>item.results||[]).filter(r=>r.type==="image_result"&&httpsUrl.safeParse(r.image_url).success&&httpsUrl.safeParse(r.source_website_url).success);
 const requested=new Set(Array.isArray(raw.image_urls)?raw.image_urls:[]);
 const images=available.filter(r=>requested.has(r.image_url!)).slice(0,2).map(r=>({url:r.image_url!,source:r.source_website_url!,caption:String(r.caption||"").slice(0,200)}));
 for(const image of images)consulted.add(image.source);
 const sourceUrls=[...new Set([...(Array.isArray(raw.sources)?raw.sources:[]).filter(u=>consulted.has(u)),...consulted])].filter(u=>httpsUrl.safeParse(u).success).slice(0,4);
 if(raw.searchable&&!sourceUrls.length&&!context.reference)throw Error("No usable source was found for this subject. Add a reference photo or make the idea more specific before building.");
 const included=z.array(z.string().min(1).max(80)).max(12).parse(raw.included),excluded=z.array(z.string().min(1).max(80)).max(12).parse(raw.excluded),relations=z.array(relationSchema).max(12).parse(raw.relations);
 const names=new Set(included);if(names.size!==included.length||excluded.some(n=>names.has(n))||relations.some(r=>!names.has(r.from)||!names.has(r.to)||r.from===r.to))throw Error("The reference layout has inconsistent component names. Retry before building.");
 const list=(v:unknown,max:number)=>Array.isArray(v)?v.filter(x=>typeof x==="string").map(x=>(x as string).slice(0,200)).slice(0,max):[];
 const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<100000?v:null;
 const kinds=["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object"] as const;
 const openness=typeof raw.openness==="number"&&Number.isFinite(raw.openness)?Math.max(0,Math.min(1,raw.openness)):null;
 const hero=String(raw.hero||"").trim().slice(0,200),layout=String(raw.layout||"").trim().slice(0,400);
 return {images,included,excluded,uncertainties:list(raw.uncertainties,8),relations,thinking,searches,...(hero?{hero}:{}),...(layout?{layout}:{}),searchable:raw.searchable===true,kind:(kinds as readonly string[]).includes(String(raw.kind))?raw.kind as SubjectKind:"object",subject:String(raw.subject||idea).slice(0,120),summary:String(raw.summary||"").slice(0,300),length_m:num(raw.length_m),width_m:num(raw.width_m),height_m:num(raw.height_m),openness,proportions:String(raw.proportions||"").slice(0,300),colors:list(raw.colors,6),silhouette:list(raw.silhouette,8),distinctive:list(raw.distinctive,8),sources:sourceUrls};
}
