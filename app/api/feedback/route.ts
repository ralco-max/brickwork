import {env} from "cloudflare:workers";
import {createFeedback,feedbackProof,feedbackSchema,readJson,sameOrigin,visitorHash,MAX_FEEDBACK_BODY_BYTES} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

const NO_STORE={"Cache-Control":"no-store"};

// "Looks right / Needs work" on a finished build. Free: nothing here calls a model. Once the owner has a ratings view
// (GALLERY_ADMIN_TOKEN), a rating must cite the signed receipts of the run it rates: one rating per run, with the
// model and cost the server recorded, so made-up ratings cannot skew it.
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:"Open Bricks in its own tab to rate a build."},{status:403,headers:NO_STORE});
 let input;try{input=feedbackSchema.parse(await readJson(request,MAX_FEEDBACK_BODY_BYTES));}
 catch{return Response.json({error:"This rating is too large or invalid."},{status:400,headers:NO_STORE});}
 const config=env as unknown as GalleryEnv,db=config.DB;
 if(!db)return Response.json({error:"Ratings are temporarily unavailable."},{status:503,headers:NO_STORE});
 const proof=config.GALLERY_ADMIN_TOKEN?await feedbackProof(config.GALLERY_ADMIN_TOKEN,input.receipts):undefined;
 if(proof===null)return Response.json({error:"Only a build made here in the last two days can be rated."},{status:400,headers:NO_STORE});
 const created=await createFeedback(db,input,await visitorHash(request),Date.now(),proof).catch(()=>undefined);
 if(created===undefined){console.error(JSON.stringify({event:"bricks_feedback_failed"}));return Response.json({error:"Ratings are temporarily unavailable. Try again in a moment."},{status:503,headers:NO_STORE});}
 if(!created)return Response.json({error:"Thanks, that's plenty of ratings for this hour."},{status:429,headers:NO_STORE});
 return Response.json({ok:true},{status:201,headers:NO_STORE});
}
