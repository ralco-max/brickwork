import {z} from "zod";
import {aiSettings,requireBudgetDb} from "@/lib/ai-settings";
import {budgetedProvider,QUALITY_MODELS} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";
import {generateScene} from "@/lib/generation-provider";
import {validateScene} from "@/lib/generated-scene";
import {briefSchema} from "@/lib/design-project";
import {eventResponse} from "@/lib/server-events";
import {referenceSheetSchema} from "@/lib/design-research";

const inputSchema=z.object({prompt:z.string().trim().min(3).max(2000),detail:z.enum(["small","medium","large"]),reference:z.string().max(1500000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),research:referenceSheetSchema.optional(),previous:z.unknown().optional(),brief:briefSchema.optional(),locked:z.array(z.string().max(80)).max(240).optional(),feedback:z.array(z.string().max(1000)).max(40).optional(),history:z.array(z.object({request:z.string().max(2000),summary:z.string().max(1000)})).max(8).optional(),stage:z.enum(["massing","detail"]).optional(),massingCritique:z.array(z.string().max(500)).max(8).optional()}).strict();
export async function GET(request:Request){return Response.json({configured:aiSettings(request).configured,budgetLimit:10},{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Brickwork in its own tab to generate a model."},{status:403});
 let config;try{config=aiSettings(request);}catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:400});}const {key,model}=config;
 if(!key)return Response.json({error:"Connect AI once to generate custom builds.",code:"AI_NOT_CONNECTED"},{status:503});
 if(key.length>512||/[\r\n]/.test(key))return Response.json({error:"Enter a valid API key."},{status:400});
 let input;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let text="",bytes=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2400000){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();const parsed=inputSchema.parse(JSON.parse(text));input={...parsed,previous:parsed.previous?validateScene(parsed.previous):undefined};
 }catch{return Response.json({error:"Use a description of 3–2,000 characters, a JPEG reference under 1.5 MB and a valid previous design."},{status:400});}
 return eventResponse(request,async(signal,send)=>{
  send({type:"status",message:"Connecting to your builder…"});
  const provider=budgetedProvider(requireBudgetDb(config.db),key,budget=>send({type:"budget",budget}));
  const chosen=input.brief?.quality?QUALITY_MODELS[input.brief.quality]:model;
  for await(const event of generateScene(input,key,chosen,signal,provider.fetch,provider.recordUsage))send(event);
 },{timeoutMs:input.brief?.quality&&input.brief.quality!=="standard"?420000:240000});
}
