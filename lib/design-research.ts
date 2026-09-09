import {upstreamError} from "./generation-errors";

// Before the first design of a real, searchable subject, a short web lookup
// produces a reference sheet the designer treats as ground truth: real
// dimensions, defining proportions, colors mapped to the palette, silhouette
// and distinctive details, with sources. Generic or imaginary ideas skip it.
export type ReferenceSheet={searchable:boolean;subject:string;summary:string;length_m:number|null;width_m:number|null;height_m:number|null;proportions:string;colors:string[];silhouette:string[];distinctive:string[];sources:string[];target?:{x:number;y:number;z:number}};
// Real metres become a target in studs (x length, z width) and plates (y height) that fits the brief's envelope.
export function targetExtents(sheet:ReferenceSheet,envelope:{maxWidth:number;maxDepth:number;maxHeight:number}):{x:number;y:number;z:number}|undefined{
 const L=sheet.length_m,W=sheet.width_m,H=sheet.height_m;if(!L||!W||!H)return undefined;
 const k=Math.min(envelope.maxWidth/L,envelope.maxDepth/W,envelope.maxHeight/(H*2.5));
 const x=Math.max(4,Math.round(L*k)),z=Math.max(2,Math.round(W*k)),y=Math.max(3,Math.round(H*k*2.5));
 return {x,y,z};
}
const strings={type:"array",items:{type:"string"}};
const schema={type:"object",additionalProperties:false,properties:{searchable:{type:"boolean"},subject:{type:"string"},summary:{type:"string"},length_m:{type:["number","null"]},width_m:{type:["number","null"]},height_m:{type:["number","null"]},proportions:{type:"string"},colors:strings,silhouette:strings,distinctive:strings,sources:strings},required:["searchable","subject","summary","length_m","width_m","height_m","proportions","colors","silhouette","distinctive","sources"]};
export const RESEARCH_INSTRUCTIONS=`You prepare a reference sheet for a brick sculptor. First decide whether the idea names a specific real subject that can be looked up: a landmark, building, bridge, vehicle model, aircraft, ship, product, animal species, plant, famous object or well-known character. If it does, search the web (at most three searches) and fill the sheet: the real overall length, width and height in metres (null when unknown; for a bridge use total length, deck width and tower height; for an animal use body length, width and standing height), the proportions that define its look as one sentence with ratios, its real colors mapped onto this palette only: red, orange, blue, navy, black, gray, white, green, tan, yellow, brown, pink (dominant first), the silhouette features seen from the side and front as short phrases, the most distinctive details a sculptor must include, and up to four source URLs. If the idea is generic ("a castle", "a dragon") or imaginary, set searchable to false, put the idea in subject, and leave every other field empty or null. Keep every text field under 200 characters.`;
export async function researchSubject(idea:string,key:string,model:string,signal:AbortSignal,fetcher:typeof fetch=fetch,onUsage?:(usage:unknown,extra:{searchCalls:number})=>Promise<void>):Promise<ReferenceSheet>{
 const response=await fetcher("https://api.openai.com/v1/responses",{method:"POST",signal,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:2500,instructions:RESEARCH_INSTRUCTIONS,input:[{role:"user",content:[{type:"input_text",text:idea.slice(0,2000)}]}],tools:[{type:"web_search"}],max_tool_calls:3,text:{format:{type:"json_schema",name:"brickwork_reference",strict:true,schema}}})});
 if(!response.ok)throw await upstreamError(response);
 const data=await response.json();
 const searchCalls=(data.output||[]).filter((item:{type?:string})=>item.type==="web_search_call").length;
 await onUsage?.(data.usage,{searchCalls});
 if(data.status!=="completed")throw Error("The reference lookup was incomplete.");
 const text=(data.output||[]).flatMap((item:{content?:{type:string;text?:string}[]})=>item.content||[]).filter((c:{type:string})=>c.type==="output_text").map((c:{text?:string})=>c.text||"").join("");
 const raw=JSON.parse(text) as Partial<ReferenceSheet>;
 const list=(v:unknown,max:number)=>Array.isArray(v)?v.filter(x=>typeof x==="string").map(x=>(x as string).slice(0,200)).slice(0,max):[];
 const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>0&&v<100000?v:null;
 return {searchable:raw.searchable===true,subject:String(raw.subject||idea).slice(0,120),summary:String(raw.summary||"").slice(0,300),length_m:num(raw.length_m),width_m:num(raw.width_m),height_m:num(raw.height_m),proportions:String(raw.proportions||"").slice(0,300),colors:list(raw.colors,6),silhouette:list(raw.silhouette,8),distinctive:list(raw.distinctive,8),sources:list(raw.sources,4).filter(u=>/^https:\/\//.test(u))};
}
