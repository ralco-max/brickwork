import {cacheStableContext} from "./ai-efficiency";
import {GenerationError,upstreamError} from "./generation-errors";

// USD nanodollars avoid floating-point rounding in the durable ledger.
// Default: GPT-6.1 Sol standard rates, verified 2026-10-11.
// https://developers.openai.com/api/docs/models/gpt-6.1-sol
export const BUDGET_NANOS=10_000_000_000;
export const BUDGET_MODEL="gpt-6.1-sol";
// Standard rates in nanodollars per token for every model the ledger will pay for.
// GPT-6 Astra: https://developers.openai.com/api/docs/models/gpt-6-astra ($10 / $1 cached / $50).
export const PRICED_MODELS:Record<string,{input:number;cached:number;output:number;write?:number}>={"gpt-6.1-sol":{input:2000,cached:100,write:2500,output:10000},"gpt-5.6-terra":{input:2000,cached:200,output:12000},"gpt-5.6-sol":{input:4000,cached:400,output:20000},"gpt-6-astra":{input:10000,cached:1000,output:50000}};
export const QUALITY_MODELS={sol_low:"gpt-6.1-sol",sol_medium:"gpt-6.1-sol",standard:"gpt-5.6-terra",better:"gpt-5.6-sol",best:"gpt-6-astra"} as const;
export const BEST_MODEL=QUALITY_MODELS.best;
// The shared studio key runs only the two priced tiers; older, pricier designers need a personal key.
export const STUDIO_QUALITIES=["sol_low","sol_medium"] as const;
export function designModelFor(quality:keyof typeof QUALITY_MODELS|undefined,fallback:string,studio:boolean){
 if(!quality)return fallback;if(studio&&!(STUDIO_QUALITIES as readonly string[]).includes(quality))return QUALITY_MODELS.sol_medium;
 return QUALITY_MODELS[quality];
}
// The tier a design call actually ran. Sol's two tiers differ only in reasoning effort (generation-provider), so a legacy
// tier the studio key runs on Sol is Everyday; other models are their own tier.
export const designTier=(quality:string|undefined,model:string)=>model===QUALITY_MODELS.sol_low?quality==="sol_medium"?"sol_medium":"sol_low":quality||"standard";
// What a rating names: the model the last design call ran (from its usage, not the brief) and its tier, so Everyday and
// Careful stay apart in the owner's ratings.
export function ratedModel(usage:readonly {stage:string;model:string}[],quality?:string,fallback?:string){
 const model=usage.filter(u=>u.stage==="design").at(-1)?.model||fallback||QUALITY_MODELS[(quality||"sol_low") as keyof typeof QUALITY_MODELS]||BUDGET_MODEL;
 return `${model}:${designTier(quality,model)}`;
}
// Higher-effort runs get the longer stream timeout; low-effort defaults do not.
export const longDesignRun=(quality?:string)=>quality==="better"||quality==="best"||quality==="sol_medium";
const INPUT=2000,CACHED_INPUT=100,OUTPUT=10000;
// The built-in web search tool: $10 per 1,000 calls, and its page content is billed as input tokens.
// Each allowed search reserves its own pages; calibrate that from the bricks_ai_usage research logs.
// A stopped lookup can't see which searches ran, so it counts one per SEARCH_MS elapsed (a deliberately
// quick search turn) with at most the old single 30k lookup allowance of pages, never every search up front.
const SEARCH_CALL_NANOS=10_000_000,SEARCH_CONTENT_TOKENS=25000,SEARCH_MS=3000,STOPPED_SEARCH_TOKENS=30000;
// Reasoning is never streamed, so a stopped request's output estimate cannot drop below an
// effort floor or below its elapsed time at a deliberately high generation rate.
const REASONING_FLOOR:Record<string,number>={none:500,minimal:500,low:2000,medium:4000,high:8000,xhigh:16000},TOKENS_PER_SECOND=150,OVERAGE_CAP=3;
type Statement={bind:(...values:(string|number|null)[])=>Statement;run:()=>Promise<{meta:{changes?:number}}>;
 first:<T>()=>Promise<T|null>};
export type BudgetDatabase={prepare:(sql:string)=>Statement};
// receipt: the server-signed record of this call (lib/receipts.ts), which a build rating cites.
export type RequestUsage={cost:number;model:string;inputTokens:number;outputTokens:number;searchCalls:number;cachedTokens:number;cacheWriteTokens:number;reasoningTokens:number;receipt?:string};
// hold is set only on the report sent when a request is reserved: that request's ceiling, which is also the most a Stop can charge.
// allowance: the figures are this visitor's daily allowance on the shared studio key, not the key's whole pool.
export type BudgetSnapshot={limit:number;spent:number;held:number;remaining:number;hold?:number;allowance?:boolean};
// A studio-key visitor's daily allowance: a salted hash of their network for today and the most it may spend, in nanodollars.
export type VisitorAllowance={hash:string;limit:number};
type Usage={input_tokens:number;output_tokens:number;input_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number};output_tokens_details?:{reasoning_tokens?:number}};
const unavailable=()=>new GenerationError("Spending checks are temporarily unavailable. Further AI requests are paused. Your draft is kept.","BUDGET_UNAVAILABLE");
const allowanceUsed=(visitor:VisitorAllowance)=>new GenerationError(`You've used today's $${(visitor.limit/1e9).toFixed(2)} of studio AI. Your design is kept. Add your own OpenAI key to keep building now, or come back tomorrow.`,"BUDGET_LIMIT");
const SPEND="SELECT COALESCE(SUM(charged_nanos),0) AS spent, COALESCE(SUM(CASE WHEN charged_nanos IS NULL THEN reserved_nanos ELSE 0 END),0) AS held FROM ai_spend WHERE";

export async function keyFingerprint(key:string,period="v1"){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`brickwork-budget-${period}:${key}`));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
/** The key's $10 pool; for a studio visitor, their allowance today, never more than what the pool has left. */
export async function budgetSnapshot(db:BudgetDatabase,keyHash:string,visitor?:VisitorAllowance):Promise<BudgetSnapshot>{
 try{
  const read=async(column:"key_hash"|"visitor_hash",value:string)=>{const row=await db.prepare(`${SPEND} ${column} = ?`).bind(value).first<{spent:number;held:number}>();if(!row||![row.spent,row.held].every(n=>Number.isSafeInteger(n)&&n>=0))throw unavailable();return row;};
  const pool=await read("key_hash",keyHash),left=BUDGET_NANOS-pool.spent-pool.held;
  if(!visitor)return {limit:10,spent:pool.spent/1e9,held:pool.held/1e9,remaining:Math.max(0,left/1e9)};
  const mine=await read("visitor_hash",visitor.hash);
  return {limit:visitor.limit/1e9,spent:mine.spent/1e9,held:mine.held/1e9,remaining:Math.max(0,Math.min(left,visitor.limit-mine.spent-mine.held)/1e9),allowance:true};
 }catch{throw unavailable();}
}
// Cache writes are normally a subset of input_tokens. If a provider reports
// them separately (cached+written exceeds input), charge them on top rather
// than failing settlement and leaving the whole reservation held forever.
export function billedInputTokens(input:number,cached=0,written=0){return cached+written>input?input+written:input;}
export function tokenCost(input:number,output:number,cached=0,rates:{input:number;cached:number;output:number;write?:number}={input:INPUT,cached:CACHED_INPUT,output:OUTPUT,write:2500},written=0){
 if(![input,output,cached,written].every(n=>Number.isSafeInteger(n)&&n>=0)||cached>input)throw unavailable();
 const total=billedInputTokens(input,cached,written),long=total>272000;
 return ((total-cached-written)*rates.input+written*(rates.write??rates.input))*(long?2:1)+cached*rates.cached*(long?2:1)+output*rates.output*(long?1.5:1);
}
export async function reserveBudget(db:BudgetDatabase,keyHash:string,amount:number,visitor?:VisitorAllowance){
 if(!Number.isSafeInteger(amount)||amount<=0)throw unavailable();
 const id=crypto.randomUUID(),mine=visitor?.hash??null;let changes=0;
 try{
  // One atomic SQLite write including the balance checks: the key's pool and, on the studio key, the visitor's
  // allowance (held requests count, so parallel requests are capped too). Unresolved reservations never expire.
  const result=await db.prepare("INSERT INTO ai_spend (id,key_hash,reserved_nanos,created_at,visitor_hash) SELECT ?,?,?,?,? WHERE ? + (SELECT COALESCE(SUM(COALESCE(charged_nanos,reserved_nanos)),0) FROM ai_spend WHERE key_hash = ?) <= ? AND (? IS NULL OR ? + (SELECT COALESCE(SUM(COALESCE(charged_nanos,reserved_nanos)),0) FROM ai_spend WHERE visitor_hash = ?) <= ?)")
   .bind(id,keyHash,amount,Date.now(),mine,amount,keyHash,BUDGET_NANOS,mine,amount,mine,visitor?.limit??0).run();
  changes=result.meta.changes??0;
 }catch{throw unavailable();}
 if(changes!==1){
  if(visitor&&(await budgetSnapshot(db,keyHash)).remaining*1e9>=amount)throw allowanceUsed(visitor);
  throw new GenerationError("This request would exceed your $10 Bricks budget. Your design is kept; you can still edit it in the studio.","BUDGET_LIMIT");
 }
 return id;
}
async function settle(db:BudgetDatabase,id:string,amount:number){
 try{await db.prepare("UPDATE ai_spend SET charged_nanos = ? WHERE id = ? AND charged_nanos IS NULL").bind(amount,id).run();}
 catch{throw unavailable();}
}
// inputTokens is the counted request plus its output schema's UTF-8 bytes; the margin and searches go on top.
const reservedInput=(inputTokens:number,searchCalls:number)=>inputTokens+4096+searchCalls*SEARCH_CONTENT_TOKENS;
const holdNanos=(rates:{input:number;cached:number;output:number;write?:number},input:number,maxOutput:number,searchCalls:number)=>tokenCost(input,maxOutput,0,rates,input)+searchCalls*SEARCH_CALL_NANOS;
// The worst case for one request in USD: its reservation. A stopped request settles an
// estimate capped at this, so it is also the most a Stop can keep (null for unpriced models).
export function worstCaseHold(model:string,inputTokens:number,maxOutputTokens:number,searchCalls=0){
 const rates=PRICED_MODELS[model];return rates?holdNanos(rates,reservedInput(inputTokens,searchCalls),maxOutputTokens,searchCalls)/1e9:null;
}
export const stopCostNotice=(usd:number)=>`Stopping uses up to $${(Math.ceil(Math.max(usd,0)*100-1e-9)/100).toFixed(2)} of your budget for work already started.`;

// Providers pass their exact outgoing payload through this guard. The client
// cannot supply a balance, raise the limit, or bypass review/repair accounting.
export function budgetedProvider(db:BudgetDatabase,key:string,notify:(budget:BudgetSnapshot)=>void,fetcher:typeof fetch=fetch,onUsage?:(usage:RequestUsage)=>void|Promise<void>,period="v1",visitor?:VisitorAllowance){
 // idle → sent (paid request issued) → done (body ended or usage unreadable: exact usage or the hold) → closed (settled once).
 let phase:"idle"|"sent"|"done"|"closed"="idle",requestModel="",sentAt=0,deltas=0,bytes=0,abandoned:Promise<void>|undefined;
 let reservation:{id:string;amount:number;base:number;input:number;maxOutput:number;searchCalls:number;effort:string;rates:{input:number;cached:number;output:number;write?:number}}|undefined;
 const fingerprint=keyFingerprint(key,period),encoder=new TextEncoder();
 const report=async(hold?:number)=>{const snapshot=await budgetSnapshot(db,await fingerprint,visitor);notify(hold===undefined?snapshot:{...snapshot,hold});};
 // A request stopped after it was sent (Stop, closed dialog, disconnect, timeout, or a caller
 // abandoning the stream) settles an estimate instead of keeping its ceiling forever: counted input
 // plus output = max(2x the streamed text tokens, the effort floor, elapsed time at a high rate),
 // capped at the reservation. Searches can't be observed mid-request, so only those elapsed time allows count.
 const settleAbandoned=():Promise<void>=>{
  const r=reservation;if(phase!=="sent"||!r)return abandoned??Promise.resolve();phase="closed";
  const elapsedMs=Math.max(0,Date.now()-sentAt),streamedTokens=Math.max(deltas,Math.ceil(bytes/3));
  const output=Math.min(r.maxOutput,Math.max(2*streamedTokens,REASONING_FLOOR[r.effort]??REASONING_FLOOR.medium,Math.ceil(elapsedMs/1000*TOKENS_PER_SECOND)));
  const searches=Math.min(r.searchCalls,Math.floor(elapsedMs/SEARCH_MS)),input=r.base+Math.min(STOPPED_SEARCH_TOKENS,searches*SEARCH_CONTENT_TOKENS),amount=Math.min(r.amount,holdNanos(r.rates,input,output,searches));
  return abandoned=(async()=>{
   try{await settle(db,r.id,amount);}catch{console.error(JSON.stringify({event:"bricks_budget_unsettled",reason:"estimate_failed"}));return;}
   console.info(JSON.stringify({event:"bricks_budget_estimated",estimated:true,model:requestModel,reservedNanos:r.amount,chargedNanos:amount,inputTokens:input,outputTokens:output,streamedTokens,searchCalls:searches,reservedSearchCalls:r.searchCalls,elapsedMs}));
   await report().catch(()=>{});
  })();
 };
 const stopped=(error:unknown,signal?:AbortSignal|null)=>Boolean(signal?.aborted)||(error as {name?:string}|null)?.name==="AbortError";
 const guardedFetch:typeof fetch=async(url,init)=>{
  if(url!=="https://api.openai.com/v1/responses"||reservation)throw unavailable();
  const body=cacheStableContext(JSON.parse(String(init?.body)));
  const search=Array.isArray(body.tools)&&body.tools.length===1&&body.tools[0]?.type==="web_search";
  const rates=PRICED_MODELS[body.model];requestModel=String(body.model);
  if(!rates||!Number.isSafeInteger(body.max_output_tokens)||body.max_output_tokens<1||body.max_output_tokens>32000||(body.tools&&!search))throw new GenerationError("The spending limit needs verified pricing for this model. No AI request was started.","BUDGET_MODEL");
  const keyHash=await fingerprint;
  const before=await budgetSnapshot(db,keyHash,visitor);
  if(before.remaining<=0)throw visitor&&(await budgetSnapshot(db,keyHash)).remaining>0?allowanceUsed(visitor):new GenerationError("Your $10 Bricks budget is used. Your design is kept and the studio is still available.","BUDGET_LIMIT");
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
  const base=counted.input_tokens+encoder.encode(JSON.stringify(body.text??{})).length,input=reservedInput(base,searchCalls);
  if(input>1_000_000)throw new GenerationError("This design is too large to budget safely. Shorten the brief or lower the detail level.","BUDGET_INPUT");
  const amount=holdNanos(rates,input,body.max_output_tokens,searchCalls),id=await reserveBudget(db,keyHash,amount,visitor);
  reservation={id,amount,base,input,maxOutput:body.max_output_tokens,searchCalls,effort:String(body.reasoning?.effort??"medium"),rates};
  await report(amount/1e9);
  // An HTTP error reply means nothing was generated, so release it. A stop after sending settles
  // an estimate. Other network failures and streams that end without usage keep the reservation:
  // generation may have been billed even though its usage never arrived.
  const signal=init?.signal;
  if(signal?.aborted){phase="closed";await settle(db,id,0);await report();throw signal.reason??new DOMException("Cancelled","AbortError");}
  phase="sent";sentAt=Date.now();signal?.addEventListener("abort",()=>void settleAbandoned(),{once:true});
  let response:Response;
  try{response=await fetcher(url,{...init,body:JSON.stringify({...body,service_tier:"default"})});}
  catch(error){if(stopped(error,signal))await settleAbandoned();else if(phase==="sent")phase="done";throw error;}
  if(!response.ok){if(phase==="sent"){phase="closed";await settle(db,id,0);await report();}return response;}
  if(!response.body){if(phase==="sent")phase="done";return response;}
  // Pass the body through untouched, counting streamed text so a stop can be estimated.
  const reader=response.body.getReader(),decoder=new TextDecoder(),streaming=body.stream===true;let buffer="";
  const scan=(chunk:Uint8Array)=>{
   buffer=(buffer+decoder.decode(chunk,{stream:true})).replace(/\r\n/g,"\n");let boundary;
   while((boundary=buffer.indexOf("\n\n"))!==-1){
    const data=buffer.slice(0,boundary).split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");buffer=buffer.slice(boundary+2);
    if(data.includes('.delta"'))try{const event=JSON.parse(data);if(typeof event?.delta==="string"&&String(event.type).endsWith(".delta")){deltas++;bytes+=encoder.encode(event.delta).length;}}catch{}
   }
   if(buffer.length>250000)buffer="";
  };
  return new Response(new ReadableStream<Uint8Array>({
   async pull(controller){
    let chunk;try{chunk=await reader.read();}catch(error){if(stopped(error,signal))await settleAbandoned();else if(phase==="sent")phase="done";throw error;}
    if(chunk.done){if(phase==="sent")phase="done";controller.close();return;}
    if(streaming)scan(chunk.value);controller.enqueue(chunk.value);
   },
   async cancel(reason){void reader.cancel(reason).catch(()=>{});await settleAbandoned();}
  }),{status:response.status,statusText:response.statusText,headers:response.headers});
 };
 const recordUsage=async(value:unknown,extra:{searchCalls?:number}={})=>{
  const r=reservation;if(!r||(phase!=="sent"&&phase!=="done")||!value||typeof value!=="object")return;
  const usage=value as Usage,cached=usage.input_tokens_details?.cached_tokens??0,written=usage.input_tokens_details?.cache_write_tokens??0,calls=Math.max(0,Math.floor(extra.searchCalls||0));
  let amount:number;
  try{amount=tokenCost(usage.input_tokens,usage.output_tokens,cached,r.rates,written)+calls*SEARCH_CALL_NANOS;}
  catch{phase="done";console.error(JSON.stringify({event:"bricks_budget_unsettled",reason:"unreadable_usage"}));return;}
  phase="closed";
  // Readable usage outside the reserved bounds is charged its actual cost, capped at 3x the
  // reservation, and fails only this request. Charging the whole pool would lock out every user of the key.
  const input=billedInputTokens(usage.input_tokens,cached,written),over=input>r.input||usage.output_tokens>r.maxOutput||calls>r.searchCalls,charged=over?Math.min(amount,OVERAGE_CAP*r.amount):amount;
  await settle(db,r.id,charged);
  if(over)console.error(JSON.stringify({event:"bricks_budget_overage",model:requestModel,reservedNanos:r.amount,actualNanos:amount,chargedNanos:charged,capped:charged<amount,inputTokens:input,reservedInputTokens:r.input,outputTokens:usage.output_tokens,maxOutputTokens:r.maxOutput,searchCalls:calls,reservedSearchCalls:r.searchCalls}));
  await report();
  const reasoning=usage.output_tokens_details?.reasoning_tokens;
  const reasoningTokens=typeof reasoning==="number"&&Number.isSafeInteger(reasoning)&&reasoning>=0&&reasoning<=usage.output_tokens?reasoning:0;
  await onUsage?.({cost:charged/1e9,model:requestModel,inputTokens:usage.input_tokens,outputTokens:usage.output_tokens,searchCalls:calls,cachedTokens:cached,cacheWriteTokens:written,reasoningTokens});
  if(over)throw new GenerationError("AI usage went over this request's expected limit, so it was stopped and charged what it used. Your draft is kept and the rest of your budget is still available.","BUDGET_ACCOUNTING");
 };
 return {fetch:guardedFetch,recordUsage,settleAbandoned};
}
