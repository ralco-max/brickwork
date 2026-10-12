import {env} from "cloudflare:workers";
import {readShareImage} from "@/lib/share";
import type {ShareDatabase} from "@/lib/share";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,db=(env as unknown as {DB?:ShareDatabase}).DB;
 const share=db?await readShareImage(db,id).catch(()=>null):null;
 if(!share)return new Response("Not found",{status:404});
 // Not immutable: a deleted link's preview must stop being served within the hour.
 const bytes=Uint8Array.from(atob(share.image.slice(share.image.indexOf(",")+1)),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{"Content-Type":"image/jpeg","Content-Length":String(bytes.byteLength),"Cache-Control":"public, max-age=3600"}});
}
