import {env} from "cloudflare:workers";
import {deleteShare,readShareProject} from "@/lib/share";
import type {ShareDatabase} from "@/lib/share";

type Params={params:Promise<{id:string}>};

export async function GET(_request:Request,{params}:Params){
 const {id}=await params,db=(env as unknown as {DB?:ShareDatabase}).DB;
 if(!db)return Response.json({error:"Sharing is temporarily unavailable."},{status:503});
 const share=await readShareProject(db,id).catch(()=>undefined);
 if(share===undefined)return Response.json({error:"Sharing is temporarily unavailable."},{status:503});
 if(!share)return Response.json({error:"This shared creation was not found."},{status:404});
 // A share never changes but can be deleted, so caches keep it for an hour at most.
 return new Response(`{"id":${JSON.stringify(share.id)},"project":${share.project}}`,{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=3600"}});
}

// Unpublish with the owner token returned when the link was created, or the gallery admin token.
export async function DELETE(request:Request,{params}:Params){
 const {id}=await params,config=env as unknown as {DB?:ShareDatabase;GALLERY_ADMIN_TOKEN?:string},headers={"Cache-Control":"no-store"};
 const token=/^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization")||"")?.[1];
 if(!token)return Response.json({error:"Send this link's owner token to delete it."},{status:401,headers:{...headers,"WWW-Authenticate":"Bearer"}});
 if(!config.DB)return Response.json({error:"Sharing is temporarily unavailable."},{status:503,headers});
 const result=await deleteShare(config.DB,id,token,config.GALLERY_ADMIN_TOKEN).catch(()=>undefined);
 if(!result)return Response.json({error:"Sharing is temporarily unavailable. Try again in a moment."},{status:503,headers});
 if(result==="missing")return Response.json({error:"This shared creation was not found."},{status:404,headers});
 if(result==="forbidden")return Response.json({error:"This token cannot delete this link."},{status:403,headers});
 return new Response(null,{status:204,headers});
}
