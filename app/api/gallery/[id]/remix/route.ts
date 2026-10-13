import {env} from "cloudflare:workers";
import {countRemix,sameOrigin,visitorHash} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

const NO_STORE={"Cache-Control":"no-store"};

// Sent once when a visitor first changes a gallery build; counted once per visitor per day.
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=(env as unknown as GalleryEnv).DB;
 if(!sameOrigin(request))return Response.json({error:"Open Bricks in its own tab."},{status:403,headers:NO_STORE});
 if(!db)return Response.json({error:"The gallery is temporarily unavailable."},{status:503,headers:NO_STORE});
 const result=await countRemix(db,id,await visitorHash(request)).catch(()=>undefined);
 if(result===undefined){console.error(JSON.stringify({event:"bricks_gallery_failed",op:"remix"}));return Response.json({error:"The gallery is temporarily unavailable."},{status:503,headers:NO_STORE});}
 if(!result)return Response.json({error:"This build is not in the gallery."},{status:404,headers:NO_STORE});
 return Response.json(result,{headers:NO_STORE});
}
