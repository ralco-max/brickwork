import {env} from "cloudflare:workers";
import {z} from "zod";
import {bearer,listGallery,parseCursor,parseSort,publishShare,readJson,sameOrigin,visitorHash,MAX_GALLERY_BODY_BYTES} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";
import {SHARE_ID} from "@/lib/share";

const NO_STORE={"Cache-Control":"no-store"},LIST_CACHE="public, max-age=30";
const fail=(error:string,status:number,headers:Record<string,string>=NO_STORE)=>Response.json({error},{status,headers});
// The Workers edge cache, where there is one: a busy gallery costs one D1 read per page per 30 s.
const edgeCache=()=>(globalThis as {caches?:{default?:Cache}}).caches?.default;

export async function GET(request:Request){
 const url=new URL(request.url),sort=parseSort(url.searchParams.get("sort")),cursor=url.searchParams.get("cursor");
 if(!sort||cursor!==null&&!parseCursor(sort,cursor))return fail("Unknown sort or cursor.",400);
 const db=(env as unknown as GalleryEnv).DB;if(!db)return fail("The gallery is temporarily unavailable.",503);
 const key=new Request(`${url.origin}/api/gallery?sort=${sort}${cursor?`&cursor=${cursor}`:""}`),cache=edgeCache();
 // A cached response's headers are immutable, and the router still adds its own; hand back a copy.
 const hit=await cache?.match(key).catch(()=>undefined);if(hit)return new Response(hit.body,hit);
 let page;try{page=await listGallery(db,sort,cursor);}
 catch{console.error(JSON.stringify({event:"bricks_gallery_failed",op:"list"}));return fail("The gallery is temporarily unavailable.",503);}
 // Pages never include a project or an image, only names, counts and links.
 const response=Response.json(page,{headers:{"Cache-Control":LIST_CACHE}});
 await cache?.put(key,response.clone()).catch(()=>{});
 return response;
}

const publishBody=z.object({shareId:z.string().regex(SHARE_ID)}).strict();

export async function POST(request:Request){
 if(!sameOrigin(request))return fail("Open Bricks in its own tab to publish.",403);
 const token=bearer(request);
 if(!token)return Response.json({error:"Send this link's owner token to publish it."},{status:401,headers:{...NO_STORE,"WWW-Authenticate":"Bearer"}});
 let body;try{body=publishBody.parse(await readJson(request,MAX_GALLERY_BODY_BYTES));}catch{return fail("Send the link to publish as {shareId}.",400);}
 const db=(env as unknown as GalleryEnv).DB;if(!db)return fail("The gallery is temporarily unavailable.",503);
 let result;try{result=await publishShare(db,body.shareId,token,await visitorHash(request));}
 catch{console.error(JSON.stringify({event:"bricks_gallery_failed",op:"publish"}));return fail("The gallery is temporarily unavailable. Try again in a moment.",503);}
 switch(result.status){
  case "missing":return fail("This shared creation was not found.",404);
  case "forbidden":return fail("Only the browser that created this link can show it in the gallery.",403);
  case "removed":return fail("A moderator took this build out of the gallery, so it can’t be shown there again.",403);
  case "preset":return fail("Change this preset or design your own build to show it in the gallery.",422);
  case "blocked":return fail(result.message,422);
  case "duplicate":return fail("This build is already in the gallery under another link.",409);
  case "copy":return fail("This is an unchanged copy of someone else’s shared build. Make a change to remix it, then show your version.",409);
  case "limited":return fail("You've published a lot this hour. Try again a little later.",429);
 }
 return Response.json({...result.item,hidden:result.hidden},{status:result.status==="published"?201:200,headers:NO_STORE});
}
