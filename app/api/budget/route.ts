import {aiSettings,requireBudgetDb,visitorAllowance} from "@/lib/ai-settings";
import {budgetSnapshot,keyFingerprint} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";

export async function GET(request:Request){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Bricks in its own tab."},{status:403});
 try{
  const config=aiSettings(request),{key,db,period}=config;
  if(!key)return Response.json({error:"Add your API key to see your Bricks budget.",code:"AI_NOT_CONNECTED"},{status:400});
  // A studio-key visitor sees their own daily allowance, never the shared pool.
  return Response.json({budget:await budgetSnapshot(requireBudgetDb(db),await keyFingerprint(key,period),await visitorAllowance(request,config))},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:503,headers:{"Cache-Control":"no-store"}});}
}
