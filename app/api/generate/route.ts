import {z} from "zod";
import {revisionRegionSchema,MAX_REVISION_REGION_IMAGE_LENGTH} from "@/lib/revision-region";
import {aiSettings,requireBudgetDb} from "@/lib/ai-settings";
import {budgetedProvider,designModelFor,longDesignRun} from "@/lib/ai-budget";
import {generationFailure} from "@/lib/generation-errors";
import {generateScene,MAX_RENDERS,MAX_RENDER_LENGTH} from "@/lib/generation-provider";
import {validateScene} from "@/lib/generated-scene";
import {briefSchema} from "@/lib/design-project";
import {clipSentence} from "@/lib/utils";
import {eventResponse} from "@/lib/server-events";
import {referenceSheetSchema,referenceReady,referenceClarification} from "@/lib/design-research";
import {referencePhotoSchema,referencePhotosSchema,collectReferencePhotos,MAX_REFERENCE_PHOTOS} from "@/lib/reference-photos";

// approved: owner-approved items; a blank one is dropped and a long one clipped rather than rejecting the whole design.
const inputSchema=z.object({prompt:z.string().trim().min(3).max(2000),detail:z.enum(["small","medium","large"]),reference:referencePhotoSchema.optional(),photos:referencePhotosSchema.optional(),research:referenceSheetSchema.optional(),region:revisionRegionSchema.optional(),previous:z.unknown().optional(),brief:briefSchema.optional(),locked:z.array(z.string().max(80)).max(240).optional(),feedback:z.array(z.string().max(1000)).max(40).optional(),approved:z.array(z.string().max(4000)).max(24).optional().transform(list=>list?.map(s=>clipSentence(s,500)).filter(Boolean).slice(0,12)),renders:z.array(z.string().max(MAX_RENDER_LENGTH).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)).max(MAX_RENDERS).optional(),continuation:z.boolean().optional(),history:z.array(z.object({request:z.string().max(2000),summary:z.string().max(1000)})).max(8).optional(),budget:z.object({limit:z.number().int().min(1).max(16000),used:z.number().int().min(0).max(100000),remaining:z.number().int().min(-100000).max(16000),byComponent:z.array(z.object({component:z.string().max(80),pieces:z.number().int().min(0).max(100000)})).max(241)}).optional()}).strict().refine(input=>collectReferencePhotos(input.reference,input.photos).length<=MAX_REFERENCE_PHOTOS,"Use at most four reference photos.").refine(input=>!input.renders?.length||input.previous!==undefined,"Model views describe an existing design.");
export async function GET(request:Request){return Response.json({configured:aiSettings(request).configured,budgetLimit:10},{headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Open Bricks in its own tab to generate a model."},{status:403});
 let config;try{config=aiSettings(request);}catch(error){const failure=generationFailure(error);return Response.json({error:failure.message,code:failure.code},{status:400});}const {key,model}=config;
 if(!key)return Response.json({error:"Connect AI once to generate custom builds.",code:"AI_NOT_CONNECTED"},{status:503});
 if(key.length>512||/[\r\n]/.test(key))return Response.json({error:"Enter a valid API key."},{status:400});
 let input;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let text="",bytes=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>7000000+MAX_REVISION_REGION_IMAGE_LENGTH+MAX_RENDERS*MAX_RENDER_LENGTH){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();const parsed=inputSchema.parse(JSON.parse(text));input={...parsed,previous:parsed.previous?validateScene(parsed.previous):undefined};
 }catch{return Response.json({error:"Use a description of 3–2,000 characters, up to four JPEG references under 1.5 MB each, an optional marked JPEG/PNG area under 1.5 MB, up to five model views, and a valid previous design."},{status:400});}
 if(input.region&&!input.previous)return Response.json({error:"Draw the edit area on an existing draft before requesting a local change.",code:"INVALID_REVISION_REGION"},{status:400});
 const reference=input.research;if(reference?.searchable&&(reference.identity!==undefined||reference.contextAdequate!==undefined)&&!referenceReady(reference,collectReferencePhotos(input.reference,input.photos).length))return Response.json({error:referenceClarification(reference),code:"REFERENCE_UNCLEAR"},{status:400});
 return eventResponse(request,async(signal,send)=>{
  send({type:"status",message:"Connecting to your builder…"});
  const provider=budgetedProvider(requireBudgetDb(config.db),key,budget=>send({type:"budget",budget}),fetch,usage=>{console.info(JSON.stringify({event:"bricks_ai_usage",stage:"design",...usage}));send({type:"usage",usage});},config.period);
  const chosen=designModelFor(input.brief?.quality,model,config.studio);
  for await(const event of generateScene(input,key,chosen,signal,provider.fetch,provider.recordUsage))send(event);
 },{timeoutMs:longDesignRun(input.brief?.quality)?420000:240000});
}
