import {env} from "cloudflare:workers";
import {bearer,feedbackSummary,isAdmin} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

const NO_STORE={"Cache-Control":"no-store"};

// The owner's dashboard data: how builds are rated, by subject kind and model, with recent
// reasons and what reports have hidden. GALLERY_ADMIN_TOKEN only; ?days=1..365 (default 30); ?hidden_offset=N pages
// through the hidden items (the response's gallery.nextHiddenOffset).
export async function GET(request:Request){
 const config=env as unknown as GalleryEnv,token=bearer(request);
 if(!token)return Response.json({error:"Send the gallery admin token."},{status:401,headers:{...NO_STORE,"WWW-Authenticate":"Bearer"}});
 if(!await isAdmin(token,config.GALLERY_ADMIN_TOKEN))return Response.json({error:"This token cannot read feedback."},{status:403,headers:NO_STORE});
 const query=new URL(request.url).searchParams,raw=query.get("days"),days=raw===null?30:Number(raw),offset=Number(query.get("hidden_offset")??0);
 if(!Number.isInteger(days)||days<1||days>365)return Response.json({error:"days must be a whole number from 1 to 365."},{status:400,headers:NO_STORE});
 if(!Number.isInteger(offset)||offset<0||offset>1_000_000)return Response.json({error:"hidden_offset must be a whole number from 0."},{status:400,headers:NO_STORE});
 if(!config.DB)return Response.json({error:"Feedback is temporarily unavailable."},{status:503,headers:NO_STORE});
 const summary=await feedbackSummary(config.DB,days,Date.now(),offset).catch(()=>null);
 if(!summary){console.error(JSON.stringify({event:"bricks_feedback_failed",op:"summary"}));return Response.json({error:"Feedback is temporarily unavailable."},{status:503,headers:NO_STORE});}
 return Response.json(summary,{headers:NO_STORE});
}
