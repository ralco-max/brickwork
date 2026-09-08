import {env} from "cloudflare:workers";
import {BUDGET_MODEL} from "./ai-budget";
import type {BudgetDatabase} from "./ai-budget";
import {GenerationError} from "./generation-errors";

export function aiSettings(request:Request){
 const config=env as unknown as {OPENAI_API_KEY?:string;DB?:BudgetDatabase};
 // A personal key explicitly added in the UI always takes precedence.
 const key=(request.headers.get("x-brickwork-api-key")||config.OPENAI_API_KEY||"").trim();
 if(key&&(key.length>512||/[\r\n]/.test(key)))throw new GenerationError("Enter a valid API key.","AI_AUTH");
 return {key,model:BUDGET_MODEL,configured:Boolean(config.OPENAI_API_KEY),db:config.DB};
}
export function requireBudgetDb(db:BudgetDatabase|undefined){
 if(!db)throw new GenerationError("The spending limit is temporarily unavailable. No new AI request was started.","BUDGET_UNAVAILABLE");
 return db;
}
