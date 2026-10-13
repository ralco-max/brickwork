import {env} from "cloudflare:workers";
import {BUDGET_MODEL} from "./ai-budget";
import type {BudgetDatabase,VisitorAllowance} from "./ai-budget";
import {GenerationError} from "./generation-errors";
import {networkOf} from "./moderation";

// The shared studio key's per-visitor allowance, in USD a day of its pool (STUDIO_VISITOR_DAILY_USD; "off" turns it
// off). A visitor is their network: an IPv4 /24 or an IPv6 /48. No one visitor, or script, can drain the pool that
// everyone without a personal key builds on.
export const STUDIO_VISITOR_DAILY_USD=1;
export function visitorAllowanceNanos(raw:string|undefined){
 const text=String(raw??"").trim().toLowerCase();if(text==="off")return undefined;
 const usd=text?Number(text):STUDIO_VISITOR_DAILY_USD;return Math.round(Math.min(10,Number.isFinite(usd)&&usd>0?usd:STUDIO_VISITOR_DAILY_USD)*1e9);
}
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,"0")).join("");
/** A daily-salted hash of the visitor's network, scoped to the studio budget period. Never a durable IP identifier. */
export async function studioVisitor(request:Request,period:string,now=Date.now()){
 const network=networkOf(request.headers.get("cf-connecting-ip"),48,24),day=Math.floor(now/86_400_000);
 return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`bricks-studio-${period}-${day}:${network}`))).slice(0,32);
}
/**
 * The studio key serves this site's own pages: a paid request on it must say it comes from them (an Origin of this site,
 * or Sec-Fetch-Site: same-origin, which browsers always send). A script without either is refused before any spend.
 * Requests on a personal key are that key holder's own.
 */
export function studioRequestAllowed(request:Request,studio:boolean){
 if(!studio)return true;
 return request.headers.get("origin")===new URL(request.url).origin||request.headers.get("sec-fetch-site")==="same-origin";
}

export function aiSettings(request:Request){
 const config=env as unknown as {OPENAI_API_KEY?:string;STUDIO_BUDGET_PERIOD?:string;STUDIO_VISITOR_DAILY_USD?:string;DB?:BudgetDatabase;LEDGER_DB?:BudgetDatabase;GALLERY_ADMIN_TOKEN?:string};
 // A personal key explicitly added in the UI always takes precedence.
 const key=(request.headers.get("x-brickwork-api-key")||config.OPENAI_API_KEY||"").trim();
 if(key&&(key.length>512||/[\r\n]/.test(key)))throw new GenerationError("Enter a valid API key.","AI_AUTH");
 const studio=Boolean(key)&&key===config.OPENAI_API_KEY?.trim(),period=studio?(config.STUDIO_BUDGET_PERIOD||"v1"):"v1";
 // The spend ledger can live in its own D1 database (LEDGER_DB), so growth in shares never stops paid accounting.
 return {period,studio,key,model:BUDGET_MODEL,configured:Boolean(config.OPENAI_API_KEY),db:config.LEDGER_DB||config.DB,
  receiptKey:config.GALLERY_ADMIN_TOKEN||undefined,visitorLimit:studio?visitorAllowanceNanos(config.STUDIO_VISITOR_DAILY_USD):undefined};
}
/** The visitor's allowance on the studio key, or undefined for a personal key or when the allowance is off. */
export async function visitorAllowance(request:Request,settings:{studio:boolean;period:string;visitorLimit?:number}):Promise<VisitorAllowance|undefined>{
 return settings.studio&&settings.visitorLimit?{hash:await studioVisitor(request,settings.period),limit:settings.visitorLimit}:undefined;
}
export function requireBudgetDb(db:BudgetDatabase|undefined){
 if(!db)throw new GenerationError("The spending limit is temporarily unavailable. No new AI request was started.","BUDGET_UNAVAILABLE");
 return db;
}
