import {aiSettings,requireBudgetDb} from "@/lib/ai-settings";
import {budgetedProvider} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";
import {z} from "zod";
import {briefSchema} from "@/lib/design-project";
import {reviewDesign} from "@/lib/design-review";
import {referenceSheetSchema,referencePhotoSchema} from "@/lib/design-research";
import type {ReferenceSheet} from "@/lib/design-research";
import {eventResponse} from "@/lib/server-events";
const schema=z.object({revision:z.string().max(2000).optional(),brief:briefSchema,images:z.array(z.string().max(750000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)).min(3).max(5),reference:referencePhotoSchema.optional(),sheet:referenceSheetSchema.optional(),signature:z.array(z.string().max(80)).max(4).optional()}).strict();
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Brickwork in its own tab."},{status:403});
 let config;try{config=aiSettings(request);}catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:400});}const {key,model}=config;
 if(!key)return Response.json({error:"Connect AI to review this design."},{status:503});if(key.length>512||/[\r\n]/.test(key))return Response.json({error:"Invalid API key."},{status:400});
 let input;try{const reader=request.body?.getReader();if(!reader)throw Error();let text="",size=0;const decoder=new TextDecoder();while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>5300000){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();input=schema.parse(JSON.parse(text));}catch{return Response.json({error:"The design brief or rendered views are invalid."},{status:400});}
 return eventResponse(request,async(signal,send)=>{
  const provider=budgetedProvider(requireBudgetDb(config.db),key,budget=>send({type:"budget",budget}),fetch,usage=>send({type:"usage",usage}));
  const review=await reviewDesign(input.brief,input.images,key,model,signal,provider.fetch,input.revision,provider.recordUsage,{sheet:input.sheet as ReferenceSheet|undefined,photo:input.reference});
  send({type:"complete",review});
 },{timeoutMs:120000});
}
