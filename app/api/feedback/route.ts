import {env} from "cloudflare:workers";
import {createFeedback,feedbackSchema,readJson,sameOrigin,visitorHash,MAX_FEEDBACK_BODY_BYTES} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

const NO_STORE={"Cache-Control":"no-store"};

// "Looks right / Needs work" on a finished build. Free: nothing here calls a model.
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:"Open Bricks in its own tab to rate a build."},{status:403,headers:NO_STORE});
 let input;try{input=feedbackSchema.parse(await readJson(request,MAX_FEEDBACK_BODY_BYTES));}
 catch{return Response.json({error:"This rating is too large or invalid."},{status:400,headers:NO_STORE});}
 const db=(env as unknown as GalleryEnv).DB;
 if(!db)return Response.json({error:"Ratings are temporarily unavailable."},{status:503,headers:NO_STORE});
 const created=await createFeedback(db,input,await visitorHash(request)).catch(()=>undefined);
 if(created===undefined){console.error(JSON.stringify({event:"bricks_feedback_failed"}));return Response.json({error:"Ratings are temporarily unavailable. Try again in a moment."},{status:503,headers:NO_STORE});}
 if(!created)return Response.json({error:"Thanks, that's plenty of ratings for this hour."},{status:429,headers:NO_STORE});
 return Response.json({ok:true},{status:201,headers:NO_STORE});
}
