import type {Metadata} from "next";
import {headers} from "next/headers";
import {env} from "cloudflare:workers";
import Studio from "../../studio";
import {readShareSummary,shareDescription,SHARE_ID} from "@/lib/share";
import type {ShareDatabase} from "@/lib/share";

type Props={params:Promise<{id:string}>};

// Link unfurlers (Messages, Slack, X, Discord…) read these tags without running scripts.
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {id}=await params,db=(env as unknown as {DB?:ShareDatabase}).DB;
 const summary=db&&SHARE_ID.test(id)?await readShareSummary(db,id).catch(()=>null):null;
 if(!summary)return {title:"Shared creation · Bricks by Ralc",robots:{index:false}};
 const host=(await headers()).get("host")||"localhost",protocol=/^(localhost|127\.0\.0\.1)(:|$)/.test(host)?"http":"https",base=`${protocol}://${host}`;
 const title=`${summary.name} · Bricks by Ralc`,description=shareDescription(summary),image={url:`${base}/api/share/${summary.id}/image`,width:1200,height:630,alt:`${summary.name}, a custom brick model`};
 return {title,description,robots:{index:false},openGraph:{type:"website",siteName:"Bricks by Ralc",url:`${base}/s/${summary.id}`,title:summary.name,description,images:[image]},twitter:{card:"summary_large_image",title:summary.name,description,images:[image.url]}};
}

export default async function SharedCreation({params}:Props){
 const {id}=await params;
 return <Studio sharedId={SHARE_ID.test(id)?id:"invalid"}/>;
}
