import {z} from "zod";
import {aiSettings,requireBudgetDb,studioRequestAllowed,visitorAllowance} from "@/lib/ai-settings";
import {withReceipt} from "@/lib/receipts";
import {budgetedProvider} from "@/lib/ai-budget";
import type {BudgetSnapshot,RequestUsage} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";
import {researchSubject,researchWithContext,referenceSheetSchema} from "@/lib/design-research";
import type {ReferenceSheet} from "@/lib/design-research";
import {collectReferencePhotos,referencePhotoSchema,referencePhotosSchema,MAX_REFERENCE_PHOTOS} from "@/lib/reference-photos";

// previous: the confirmed sheet a feedback-forced lookup refines (the research treats it as tentative), so a refresh
// corrects the subject instead of re-deriving its target and rubric from nothing.
const schema=z.object({idea:z.string().trim().min(3).max(2000),scope:z.enum(["subject","site"]).optional(),composition:z.string().max(600).optional(),features:z.array(z.string().max(160)).max(12).optional(),reference:referencePhotoSchema.optional(),photos:referencePhotosSchema.optional(),identityHint:z.string().max(300).optional(),feedback:z.string().max(2000).optional(),previous:referenceSheetSchema.optional()}).strict().refine(input=>collectReferencePhotos(input.reference,input.photos).length<=MAX_REFERENCE_PHOTOS);
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Bricks in its own tab."},{status:403});
 let config;try{config=aiSettings(request);}catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:400});}const {key,model}=config;
 if(!studioRequestAllowed(request,config.studio))return Response.json({error:"Open Bricks in its own tab to use the studio AI.",code:"AI_ORIGIN"},{status:403});
 if(!key)return Response.json({error:"Connect AI to look up a subject.",code:"AI_NOT_CONNECTED"},{status:503});
 let input;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let text="",bytes=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>6500000){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();input=schema.parse(JSON.parse(text));
 }catch{return Response.json({error:"Describe the idea in 3–2,000 characters and attach up to 4 JPEG reference photos under 1.5 MB each."},{status:400});}
 let budget:BudgetSnapshot|null=null;const usages:RequestUsage[]=[],sign=withReceipt(config.receiptKey,"research"),visitor=await visitorAllowance(request,config);
 try{
  // The brief-specific plan (target, scale conflict, shell plan) is the client's, not research evidence.
  const previous=input.previous&&{...input.previous as ReferenceSheet,target:undefined,scaleConflict:undefined,plan:undefined};
  const result=await researchWithContext({...input,previous},async context=>{
   const provider=budgetedProvider(requireBudgetDb(config.db),key,b=>{budget=b;},fetch,async u=>{console.info(JSON.stringify({event:"bricks_ai_usage",stage:"research",...u}));usages.push(await sign(u));},config.period,visitor);
   return researchSubject(input.idea,key,model,request.signal,provider.fetch,provider.recordUsage,context);
  },request.signal);
  return Response.json({...result,budget,usages,usage:usages.at(-1)},{headers:{"Cache-Control":"no-store"}});
 }catch(error){const failure=generationFailure(error);console.error(JSON.stringify({event:"brickwork_request_failed",route:"/api/research",code:failure.code,upstreamStatus:failure.upstreamStatus}));return Response.json({error:failure.message,code:failure.code,budget,usages,usage:usages.at(-1)},{status:503,headers:{"Cache-Control":"no-store"}});}
}
