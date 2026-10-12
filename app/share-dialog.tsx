"use client";
import {useCallback,useRef,useState} from "react";
import {Check,Copy,LoaderCircle,Share2} from "lucide-react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import type {BuildModel} from "@/lib/models";
import type {ShoppingState} from "@/lib/design-project";
import {projectJSON} from "@/lib/design-project";
import {shareProjectHash,findSharedLink,rememberSharedLink} from "@/lib/design-library";

export type ShareState={status:"idle"}|{status:"working";step:string}|{status:"ready";url:string;image:string}|{status:"error";message:string};

/** Publish an unlisted link whose preview card shows the actual creation. */
export function useShareLink(){
 const [state,setState]=useState<ShareState>({status:"idle"}),session=useRef(0),published=useRef<{project:string;url:string;image:string}|null>(null);
 const start=useCallback((model:BuildModel,shopping:ShoppingState)=>{
  const run=++session.current,project=projectJSON(model,shopping);
  // Sharing an unchanged creation again reuses its link.
  if(published.current?.project===project){const {url,image}=published.current;setState({status:"ready",url,image});return;}
  setState({status:"working",step:"Rendering a preview…"});
  void (async()=>{
   try{
    // Links made on earlier visits are reused too; their preview is served from the link.
    const projectHash=await shareProjectHash(model),known=await findSharedLink(projectHash);if(session.current!==run)return;
    if(known){const image=`/api/share/${known.shareId}/image`;published.current={project,url:known.url,image};setState({status:"ready",url:known.url,image});return;}
    const {renderShareImage}=await import("@/lib/share-image");
    const image=await renderShareImage(model);if(session.current!==run)return;
    setState({status:"working",step:"Creating your link…"});
    const response=await fetch("/api/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:JSON.parse(project),image})});
    const data=await response.json().catch(()=>({})) as {id?:string;url?:string;ownerToken?:string;error?:string};
    if(!response.ok||!data.url||!data.id)throw Error(data.error||"Sharing is temporarily unavailable.");
    void rememberSharedLink({projectHash,shareId:data.id,url:data.url,ownerToken:data.ownerToken,createdAt:new Date().toISOString()});
    if(session.current!==run)return;
    published.current={project,url:data.url,image};setState({status:"ready",url:data.url,image});
   }catch(error){if(session.current===run)setState({status:"error",message:error instanceof Error?error.message:"Sharing failed."});}
  })();
 },[]);
 const cancel=useCallback(()=>{session.current++;},[]);
 return {state,start,cancel};
}

type Props={open:boolean;onOpenChange:(open:boolean)=>void;name:string;state:ShareState};

export default function ShareDialog({open,onOpenChange,name,state}:Props){
 const [copiedUrl,setCopiedUrl]=useState("");
 const copy=async(url:string)=>{try{await navigator.clipboard.writeText(url);setCopiedUrl(url);}catch{setCopiedUrl("");}};
 const nativeShare=typeof navigator!=="undefined"&&typeof navigator.share==="function";
 const copied=state.status==="ready"&&copiedUrl===state.url;
 return <Dialog open={open} onOpenChange={next=>{if(!next)setCopiedUrl("");onOpenChange(next);}}><DialogContent className="share-dialog">
  <DialogHeader><DialogTitle>Share “{name}”</DialogTitle><DialogDescription>Anyone with the link can view and remix this creation. Your reference photos, the words you typed and your shopping list are not included.</DialogDescription></DialogHeader>
  {state.status==="working"&&<p className="share-status" role="status"><LoaderCircle className="spin" size={16}/>{state.step}</p>}
  {state.status==="error"&&<p className="share-error" role="alert">{state.message}</p>}
  {state.status==="ready"&&<div className="share-ready">
   {/* A local data URL preview; the image optimizer does not apply. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img className="share-preview" src={state.image} width={1200} height={630} alt={`Link preview for ${name}`}/>
   <div className="share-link"><input readOnly value={state.url} aria-label="Share link" onFocus={e=>e.currentTarget.select()}/><button type="button" className="button primary" onClick={()=>void copy(state.url)}>{copied?<Check size={16}/>:<Copy size={16}/>}{copied?"Copied":"Copy link"}</button></div>
   {nativeShare&&<button type="button" className="button secondary share-native" onClick={()=>void navigator.share({title:name,text:`${name}, built with Bricks`,url:state.url}).catch(()=>{})}><Share2 size={16}/>Share via…</button>}
  </div>}
 </DialogContent></Dialog>;
}
