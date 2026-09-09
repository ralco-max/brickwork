import {GenerationError,upstreamError} from "./generation-errors";

// USD nanodollars avoid floating-point rounding in the durable ledger.
// Standard GPT-5.6 Terra rates, checked 2026-09-08. The model page lists only
// the undated alias, so that alias is pinned here:
// https://developers.openai.com/api/docs/models/gpt-5.6-terra
export const BUDGET_NANOS=10_000_000_000;
export const BUDGET_MODEL="gpt-5.6-terra";
const INPUT=2000,CACHED_INPUT=200,OUTPUT=12000;
// The built-in web search tool: $10 per 1,000 calls, and its page content is billed as input tokens.
const SEARCH_CALL_NANOS=10_000_000,SEARCH_CONTENT_TOKENS=30000;
type Statement={bind:(...values:(string|number|null)[])=>Statement;run:()=>Promise<{meta:{changes?:number}}>;
 first:<T>()=>Promise<T|null>};
export type BudgetDatabase={prepare:(sql:string)=>Statement};
export type BudgetSnapshot={limit:number;spent:number;held:number;remaining:number};
type Usage={input_tokens:number;output_tokens:number;input_tokens_details?:{cached_tokens?:number}};
const unavailable=()=>new GenerationError("Spending checks are temporarily unavailable. Further AI requests are paused. Your draft is kept.","BUDGET_UNAVAILABLE");

export async function keyFingerprint(key:string){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`brickwork-budget-v1:${key}`));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function budgetSnapshot(db:BudgetDatabase,keyHash:string):Promise<BudgetSnapshot>{
 try{
  const row=await db.prepare("SELECT COALESCE(SUM(charged_nanos),0) AS spent, COALESCE(SUM(CASE WHEN charged_nanos IS NULL THEN reserved_nanos ELSE 0 END),0) AS held FROM ai_spend WHERE key_hash = ?").bind(keyHash).first<{spent:number;held:number}>();
  if(!row||![row.spent,row.held].every(n=>Number.isSafeInteger(n)&&n>=0))throw unavailable();
  return {limit:10,spent:row.spent/1e9,held:row.held/1e9,remaining:Math.max(0,(BUDGET_NANOS-row.spent-row.held)/1e9)};
 }catch{throw unavailable();}
}
export function tokenCost(input:number,output:number,cached=0){
 if(![input,output,cached].every(n=>Number.isSafeInteger(n)&&n>=0)||cached>input)throw unavailable();
 const long=input>272000;
 return (input-cached)*INPUT*(long?2:1)+cached*CACHED_INPUT*(long?2:1)+output*OUTPUT*(long?1.5:1);
}
export async function reserveBudget(db:BudgetDatabase,keyHash:string,amount:number){
 if(!Number.isSafeInteger(amount)||amount<=0)throw unavailable();
 const id=crypto.randomUUID();let changes=0;
 try{
  // One atomic SQLite write including the balance check. Parallel tabs cannot
  // reserve the same remaining funds. Unresolved reservations never expire.
  const result=await db.prepare("INSERT INTO ai_spend (id,key_hash,reserved_nanos,created_at) SELECT ?,?,?,? WHERE ? + (SELECT COALESCE(SUM(COALESCE(charged_nanos,reserved_nanos)),0) FROM ai_spend WHERE key_hash = ?) <= ?")
   .bind(id,keyHash,amount,Date.now(),amount,keyHash,BUDGET_NANOS).run();
  changes=result.meta.changes??0;
 }catch{throw unavailable();}
 if(changes!==1)throw new GenerationError("This request would exceed your $10 Brickwork budget. Your design is kept; you can still edit it in the studio.","BUDGET_LIMIT");
 return id;
}
async function settle(db:BudgetDatabase,id:string,amount:number){
 try{await db.prepare("UPDATE ai_spend SET charged_nanos = ? WHERE id = ? AND charged_nanos IS NULL").bind(amount,id).run();}
 catch{throw unavailable();}
}

// Providers pass their exact outgoing payload through this guard. The client
// cannot supply a balance, raise the limit, or bypass review/repair accounting.
export function budgetedProvider(db:BudgetDatabase,key:string,notify:(budget:BudgetSnapshot)=>void,fetcher:typeof fetch=fetch){
 let reservation:{id:string;input:number;maxOutput:number;searchCalls:number}|undefined;
 const fingerprint=keyFingerprint(key);
 const report=async()=>notify(await budgetSnapshot(db,await fingerprint));
 const guardedFetch:typeof fetch=async(url,init)=>{
  if(url!=="https://api.openai.com/v1/responses"||reservation)throw unavailable();
  const body=JSON.parse(String(init?.body));
  const search=Array.isArray(body.tools)&&body.tools.length===1&&body.tools[0]?.type==="web_search";
  if(body.model!==BUDGET_MODEL||!Number.isSafeInteger(body.max_output_tokens)||body.max_output_tokens<1||body.max_output_tokens>32000||(body.tools&&!search))throw new GenerationError("The spending limit needs verified pricing for this model. No AI request was started.","BUDGET_MODEL");
  const keyHash=await fingerprint;
  if((await budgetSnapshot(db,keyHash)).remaining<=0)throw new GenerationError("Your $10 Brickwork budget is used. Your design is kept and the studio is still available.","BUDGET_LIMIT");
  // Count text and image inputs before generation. Conservatively include the
  // output schema's UTF-8 byte length and a formatting margin separately;
  // input_tokens does not expose the Responses text.format parameter.
  const countResponse=await fetcher("https://api.openai.com/v1/responses/input_tokens",{
   method:"POST",signal:init?.signal,headers:init?.headers,
   body:JSON.stringify({model:body.model,instructions:body.instructions,input:body.input})
  });
  if(!countResponse.ok)throw await upstreamError(countResponse);
  const counted=await countResponse.json();
  if(!Number.isSafeInteger(counted.input_tokens)||counted.input_tokens<0)throw unavailable();
  const searchCalls=search?Math.min(5,Math.max(1,Number(body.max_tool_calls)||3)):0;
  const input=counted.input_tokens+new TextEncoder().encode(JSON.stringify(body.text??{})).length+4096+(search?SEARCH_CONTENT_TOKENS:0);
  if(input>1_000_000)throw new GenerationError("This design is too large to budget safely. Shorten the brief or lower the detail level.","BUDGET_INPUT");
  const amount=tokenCost(input,body.max_output_tokens)+searchCalls*SEARCH_CALL_NANOS,id=await reserveBudget(db,keyHash,amount);
  reservation={id,input,maxOutput:body.max_output_tokens,searchCalls};
  await report();
  // Disconnects and streams that end without usage keep the entire reservation:
  // generation may have been billed even when its final usage never arrived.
  // An HTTP error reply is different: nothing was generated, so release it.
  const response=await fetcher(url,{...init,body:JSON.stringify({...body,service_tier:"default"})});
  if(!response.ok){
   await settle(db,id,0);await report();
  }
  return response;
 };
 const recordUsage=async(value:unknown,extra:{searchCalls?:number}={})=>{
  if(!reservation||!value||typeof value!=="object")return;
  const usage=value as Usage,cached=usage.input_tokens_details?.cached_tokens??0,calls=Math.max(0,Math.floor(extra.searchCalls||0));
  let amount:number;
  try{amount=tokenCost(usage.input_tokens,usage.output_tokens,cached)+calls*SEARCH_CALL_NANOS;}catch{return;}
  // Unexpected provider accounting keeps a full budget hold and stops later
  // requests. Never silently undercount usage outside the reserved bounds.
  if(usage.input_tokens>reservation.input||usage.output_tokens>reservation.maxOutput||calls>reservation.searchCalls){
   await settle(db,reservation.id,Math.max(BUDGET_NANOS,amount));await report();
   throw new GenerationError("AI usage exceeded the expected request bounds. Further spending is paused; your draft is kept.","BUDGET_ACCOUNTING");
  }
  await settle(db,reservation.id,amount);await report();
 };
 return {fetch:guardedFetch,recordUsage};
}
