import {aiSettings,requireBudgetDb} from "@/lib/ai-settings";
import {budgetSnapshot,keyFingerprint} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";

export async function GET(request:Request){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Brickwork in its own tab."},{status:403});
 try{
  const {key,db}=aiSettings(request);
  if(!key)return Response.json({error:"Add your API key to see your Brickwork budget.",code:"AI_NOT_CONNECTED"},{status:400});
  return Response.json({budget:await budgetSnapshot(requireBudgetDb(db),await keyFingerprint(key))},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:503,headers:{"Cache-Control":"no-store"}});}
}
