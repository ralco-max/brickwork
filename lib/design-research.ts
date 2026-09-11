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
export type ReferenceSheet={searchable:boolean;kind:SubjectKind;subject:string;summary:string;length_m:number|null;width_m:number|null;height_m:number|null;openness:number|null;proportions:string;colors:string[];silhouette:string[];distinctive:string[];sources:string[];hero?:string;layout?:string;target?:{x:number;y:number;z:number;vertical:number};plan?:ShellPlan};
export const referenceSheetSchema=z.object({searchable:z.boolean(),kind:z.string().max(20),subject:z.string().max(120),summary:z.string().max(300),length_m:z.number().nullable(),width_m:z.number().nullable(),height_m:z.number().nullable(),openness:z.number().min(0).max(1).nullable().optional(),proportions:z.string().max(300),colors:z.array(z.string().max(200)).max(6),silhouette:z.array(z.string().max(200)).max(8),distinctive:z.array(z.string().max(200)).max(8),sources:z.array(z.string().max(200)).max(4),hero:z.string().max(200).optional(),layout:z.string().max(400).optional(),target:z.object({x:z.number().int().min(1).max(80),y:z.number().int().min(1).max(160),z:z.number().int().min(1).max(80),vertical:z.number().min(1).max(3)}).optional(),plan:z.object({walls:z.number().int().min(0).max(4),estimate:z.number().int().min(0).max(100000),fits:z.boolean(),recommend:z.object({x:z.number().int().min(1).max(80),y:z.number().int().min(1).max(160),z:z.number().int().min(1).max(80)}).optional()}).optional()});
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
// Real metres become a target in studs (x length, z width) and plates (y height) that fits the brief's envelope.
// Sites and bridges are far longer than tall, so their heights are exaggerated (up to 3x) the way
// architectural models do, and their footprint fills the envelope; everything else stays 1:1.
export function targetExtents(sheet:ReferenceSheet,envelope:{maxWidth:number;maxDepth:number;maxHeight:number}):{x:number;y:number;z:number;vertical:number}|undefined{
 const L=sheet.length_m,W=sheet.width_m,H=sheet.height_m;if(!L||!W||!H)return undefined;
 const flat=sheet.kind==="site"||sheet.kind==="bridge"||L/H>8;
 const k=flat?Math.min(envelope.maxWidth/L,envelope.maxDepth/W):Math.min(envelope.maxWidth/L,envelope.maxDepth/W,envelope.maxHeight/(H*2.5));
 const vertical=flat?Math.min(3,Math.max(1,envelope.maxHeight/(H*k*2.5)),3):1;
 const x=Math.max(4,Math.round(L*k)),z=Math.max(2,Math.round(W*k)),y=Math.max(3,Math.min(envelope.maxHeight,Math.round(H*k*2.5*vertical)));
 return {x,y,z,vertical:Math.round(vertical*10)/10};
}
const strings={type:"array",items:{type:"string"}};
const schema={type:"object",additionalProperties:false,properties:{searchable:{type:"boolean"},kind:{type:"string",enum:["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object"]},subject:{type:"string"},summary:{type:"string"},length_m:{type:["number","null"]},width_m:{type:["number","null"]},height_m:{type:["number","null"]},openness:{type:["number","null"]},proportions:{type:"string"},colors:strings,silhouette:strings,distinctive:strings,sources:strings,hero:{type:"string"},layout:{type:"string"}},required:["searchable","kind","subject","summary","length_m","width_m","height_m","openness","proportions","colors","silhouette","distinctive","sources","hero","layout"]};
export const RESEARCH_INSTRUCTIONS=`You prepare a reference sheet for a brick sculptor. First decide whether the idea names a specific real subject that can be looked up: a landmark, building, bridge, vehicle model, aircraft, ship, product, animal species, plant, famous object or well-known character. If it does, classify it (kind: building, monument, bridge, site for a landscape or complex of several structures such as a mall, campus, park or city block, vehicle, aircraft, ship, animal, plant, character, object). For an airport, a station, a campus, a park, a stadium complex or a city block, the model is about its hero structure, not its grounds: name the hero in hero (for Washington Dulles it is Saarinen's main terminal with its catenary roof and the control tower), set kind to building or monument, and report the hero's dimensions, colors, silhouette and details; runways, roads, car parks and lawns are not modelled. Give layout as one plan-view sentence saying what sits where relative to the hero (left, right, front, back), including anything that should be left out. For a subject that is genuinely a site (a mall of several equal structures), keep kind site and use layout for the order along its length. Then search the web (at most two searches) and fill the sheet: the real overall length, width and height in metres (when exact figures are not published, give your best estimate from plans, satellite imagery, photographs or comparable known dimensions and say so in the summary; use null only when the subject has no meaningful size, never because a figure is unpublished; for a bridge use total length, deck width and tower height; for a site use its overall length and width and the height of its tallest structure, and list the major structures in order along its length under silhouette; for an animal use body length, width and standing height), openness: the fraction of the subject's bounding box that is open air (0 for a solid block, about 0.2 for a building or a car, 0.6 for an animal with legs, 0.8 or more for a lattice tower, a crane or a suspension bridge), the proportions that define its look as one sentence with ratios, its real colors mapped onto this palette only: red, orange, blue, navy, black, gray, white, green, tan, yellow, brown (reddish brown), darkbrown (dark brown: bronze, wrought iron, dark wood, the Eiffel Tower), pink (dominant first), the silhouette features seen from the side and front as short phrases, the most distinctive details a sculptor must include, and up to four source URLs; hero and layout are empty strings when they do not apply. If the idea is generic ("a castle", "a dragon") or imaginary, set searchable to false, put the idea in subject, and leave every other field empty or null. Keep every text field under 200 characters.`;
export async function researchSubject(idea:string,key:string,model:string,signal:AbortSignal,fetcher:typeof fetch=fetch,onUsage?:(usage:unknown,extra:{searchCalls:number})=>Promise<void>):Promise<ReferenceSheet&{thinking?:string;searches?:string[]}>{
 const response=await fetcher("https://api.openai.com/v1/responses",{method:"POST",signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:2500,reasoning:{summary:"auto"},instructions:RESEARCH_INSTRUCTIONS,input:[{role:"user",content:[{type:"input_text",text:idea.slice(0,2000)}]}],tools:[{type:"web_search"}],max_tool_calls:2,text:{format:{type:"json_schema",name:"brickwork_reference",strict:true,schema}}})});
 if(!response.ok)throw await upstreamError(response);
 const data=await response.json();
 const searchCalls=(data.output||[]).filter((item:{type?:string})=>item.type==="web_search_call").length;
 const searches=(data.output||[]).filter((item:{type?:string})=>item.type==="web_search_call").map((item:{action?:{query?:string}})=>String(item.action?.query||"").trim()).filter(Boolean).slice(0,4);const thinking=reasoningSummary(data.output);
 await onUsage?.(data.usage,{searchCalls});
 if(data.status!=="completed")throw Error("The reference lookup was incomplete.");
 const text=(data.output||[]).flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).filter((c:{type:string})=>c.type==="output_text").map((c:{text?:string})=>c.text||"").join("");
 const raw=JSON.parse(text) as Partial<ReferenceSheet>;
 const list=(v:unknown,max:number)=>Array.isArray(v)?v.filter(x=>typeof x==="string").map(x=>(x as string).slice(0,200)).slice(0,max):[];
 const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<100000?v:null;
 const kinds=["building","monument","bridge","site","vehicle","aircraft","ship","animal","plant","character","object"] as const;
 const openness=typeof raw.openness==="number"&&Number.isFinite(raw.openness)?Math.max(0,Math.min(1,raw.openness)):null;
 const hero=String(raw.hero||"").trim().slice(0,200),layout=String(raw.layout||"").trim().slice(0,400);
 return {thinking,searches,...(hero?{hero}:{}),...(layout?{layout}:{}),searchable:raw.searchable===true,kind:(kinds as readonly string[]).includes(String(raw.kind))?raw.kind as SubjectKind:"object",subject:String(raw.subject||idea).slice(0,120),summary:String(raw.summary||"").slice(0,300),length_m:num(raw.length_m),width_m:num(raw.width_m),height_m:num(raw.height_m),openness,proportions:String(raw.proportions||"").slice(0,300),colors:list(raw.colors,6),silhouette:list(raw.silhouette,8),distinctive:list(raw.distinctive,8),sources:list(raw.sources,4).filter(u=>/^https:\/\//.test(u))};
}
