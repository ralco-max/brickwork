import {env} from "cloudflare:workers";
import {reportShare,reporterKeys,sameOrigin} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

const NO_STORE={"Cache-Control":"no-store"};

// One report per person per build and ten a day; three different people hide it until the admin looks.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=(env as unknown as GalleryEnv).DB;
 if(!sameOrigin(request))return Response.json({error:"Open Bricks in its own tab to report a build."},{status:403,headers:NO_STORE});
 if(!db)return Response.json({error:"Reporting is temporarily unavailable."},{status:503,headers:NO_STORE});
 const result=await reportShare(db,id,await reporterKeys(request,id)).catch(()=>undefined);
 if(result===undefined){console.error(JSON.stringify({event:"bricks_gallery_failed",op:"report"}));return Response.json({error:"Reporting is temporarily unavailable. Try again in a moment."},{status:503,headers:NO_STORE});}
 if(!result)return Response.json({error:"This build is not in the gallery."},{status:404,headers:NO_STORE});
 if(result.status==="limited")return Response.json({error:"Thanks, that’s a lot of reports for one day. A moderator will look at the ones you’ve sent."},{status:429,headers:NO_STORE});
 // A repeat report is accepted quietly; it simply does not count twice.
 return Response.json({reported:true},{status:202,headers:NO_STORE});
}
