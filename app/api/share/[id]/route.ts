import {env} from "cloudflare:workers";
import {readShareProject} from "@/lib/share";
import type {ShareDatabase} from "@/lib/share";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=(env as unknown as {DB?:ShareDatabase}).DB;
 if(!db)return Response.json({error:"Sharing is temporarily unavailable."},{status:503});
 const share=await readShareProject(db,id).catch(()=>undefined);
 if(share===undefined)return Response.json({error:"Sharing is temporarily unavailable."},{status:503});
 if(!share)return Response.json({error:"This shared creation was not found."},{status:404});
 // Shares are immutable, so they can be cached at the edge and in the browser.
 return new Response(`{"id":${JSON.stringify(share.id)},"project":${share.project}}`,{headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=3600, s-maxage=86400"}});
}
