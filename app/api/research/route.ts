import {z} from "zod";
import {aiSettings,requireBudgetDb} from "@/lib/ai-settings";
import {budgetedProvider} from "@/lib/ai-budget";
import type {BudgetSnapshot} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";
import {researchSubject} from "@/lib/design-research";

const schema=z.object({idea:z.string().trim().min(3).max(2000)}).strict();
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Brickwork in its own tab."},{status:403});
 let config;try{config=aiSettings(request);}catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:400});}const {key,model}=config;
 if(!key)return Response.json({error:"Connect AI to look up a subject.",code:"AI_NOT_CONNECTED"},{status:503});
 let input;try{input=schema.parse(await request.json());}catch{return Response.json({error:"Describe the idea in 3–2,000 characters."},{status:400});}
 let budget:BudgetSnapshot|null=null;
 try{
  const provider=budgetedProvider(requireBudgetDb(config.db),key,b=>{budget=b;});
  const sheet=await researchSubject(input.idea,key,model,request.signal,provider.fetch,provider.recordUsage);
  return Response.json({sheet,budget},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const failure=generationFailure(error);console.error(JSON.stringify({event:"brickwork_request_failed",route:"/api/research",code:failure.code,upstreamStatus:failure.upstreamStatus}));return Response.json({error:failure.message,code:failure.code,budget},{status:503,headers:{"Cache-Control":"no-store"}});}
}
