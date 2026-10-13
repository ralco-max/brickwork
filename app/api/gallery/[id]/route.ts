import {env} from "cloudflare:workers";
import {z} from "zod";
import {bearer,galleryStatus,isAdmin,readJson,sameOrigin,setHidden,unpublishShare,MAX_GALLERY_BODY_BYTES} from "@/lib/gallery";
import type {GalleryEnv} from "@/lib/gallery";

type Params={params:Promise<{id:string}>};
const NO_STORE={"Cache-Control":"no-store"};
const fail=(error:string,status:number,headers:Record<string,string>=NO_STORE)=>Response.json({error},{status,headers});
const unauthorized=(error:string)=>fail(error,401,{...NO_STORE,"WWW-Authenticate":"Bearer"});

// Whether a link is in the gallery, so the share dialog's switch starts in the right place.
export async function GET(_request:Request,{params}:Params){
 const {id}=await params,db=(env as unknown as GalleryEnv).DB;
 if(!db)return fail("The gallery is temporarily unavailable.",503);
 const status=await galleryStatus(db,id).catch(()=>null);
 return status?Response.json(status,{headers:NO_STORE}):fail("The gallery is temporarily unavailable.",503);
}

// Unpublish with the link's owner token or the gallery admin token. The link keeps working.
export async function DELETE(request:Request,{params}:Params){
 const {id}=await params,config=env as unknown as GalleryEnv;
 if(!sameOrigin(request))return fail("Open Bricks in its own tab.",403);
 const token=bearer(request);if(!token)return unauthorized("Send this link's owner token to take it out of the gallery.");
 if(!config.DB)return fail("The gallery is temporarily unavailable.",503);
 const result=await unpublishShare(config.DB,id,token,config.GALLERY_ADMIN_TOKEN).catch(()=>null);
 if(!result){console.error(JSON.stringify({event:"bricks_gallery_failed",op:"unpublish"}));return fail("The gallery is temporarily unavailable. Try again in a moment.",503);}
 if(result==="missing")return fail("This build is not in the gallery.",404);
 if(result==="forbidden")return fail("This token cannot change this build.",403);
 return new Response(null,{status:204,headers:NO_STORE});
}

// Admin only: hide a build, or restore one that reports hid ({"hidden":false} also clears its reports).
const hiddenBody=z.object({hidden:z.boolean()}).strict();
export async function PATCH(request:Request,{params}:Params){
 const {id}=await params,config=env as unknown as GalleryEnv;
 if(!sameOrigin(request))return fail("Open Bricks in its own tab.",403);
 const token=bearer(request);if(!token)return unauthorized("Send the gallery admin token.");
 if(!await isAdmin(token,config.GALLERY_ADMIN_TOKEN))return fail("This token cannot moderate the gallery.",403);
 let body;try{body=hiddenBody.parse(await readJson(request,MAX_GALLERY_BODY_BYTES));}catch{return fail("Send {hidden:true|false}.",400);}
 if(!config.DB)return fail("The gallery is temporarily unavailable.",503);
 const found=await setHidden(config.DB,id,body.hidden).catch(()=>null);
 if(found===null)return fail("The gallery is temporarily unavailable. Try again in a moment.",503);
 return found?Response.json({id,hidden:body.hidden},{headers:NO_STORE}):fail("This build is not in the gallery.",404);
}
