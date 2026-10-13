import {env} from "cloudflare:workers";
import {createShare,creatorHash,sanitizeSharedProject,validShareImage,MAX_SHARE_BODY_BYTES} from "@/lib/share";
import type {ShareDatabase} from "@/lib/share";

export async function POST(request:Request){
 const url=new URL(request.url),origin=request.headers.get("origin");
 if(origin&&origin!==url.origin)return Response.json({error:"Open Bricks in its own tab to share."},{status:403});
 const config=env as unknown as {DB?:ShareDatabase;SHARE_STORAGE_LIMIT_MB?:string},db=config.DB,storageMb=Number(config.SHARE_STORAGE_LIMIT_MB);
 if(!db)return Response.json({error:"Sharing is temporarily unavailable."},{status:503});
 let body:{project?:unknown;image?:unknown};
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let text="",bytes=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_SHARE_BODY_BYTES){await reader.cancel();throw Error();}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();body=JSON.parse(text);
 }catch{return Response.json({error:"This creation is too large or invalid to share."},{status:400});}
 if(!validShareImage(body.image))return Response.json({error:"The preview image is missing, invalid or too large."},{status:400});
 let shared;try{shared=sanitizeSharedProject(body.project);}catch(error){return Response.json({error:error instanceof Error?error.message:"This project cannot be shared."},{status:400});}
 let created:Awaited<ReturnType<typeof createShare>>;
 try{created=await createShare(db,{...shared,image:body.image},await creatorHash(request),Date.now(),storageMb>0?{storageBytes:storageMb*1_000_000}:{});}
 catch{console.error(JSON.stringify({event:"bricks_share_failed"}));return Response.json({error:"Sharing is temporarily unavailable. Try again in a moment."},{status:503});}
 if(!created)return Response.json({error:"Sharing is temporarily unavailable. Try again in a moment."},{status:503});
 if("limited" in created)return created.limited==="creator"?Response.json({error:"You've shared a lot this hour. Try again a little later."},{status:429}):Response.json({error:"Sharing is busy right now. Try again later, or download the project file to share it."},{status:503,headers:{"Retry-After":"3600"}});
 // The owner token is sent only here, with a new link (201); a repeat share returns the existing link (200).
 const {id,ownerToken}=created;
 return Response.json({id,url:`${url.origin}/s/${id}`,...(ownerToken?{ownerToken}:{})},{status:ownerToken?201:200,headers:{"Cache-Control":"no-store"}});
}
