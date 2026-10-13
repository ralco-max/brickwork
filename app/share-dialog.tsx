"use client";
import {useCallback,useEffect,useId,useRef,useState} from "react";
import {Check,Copy,LoaderCircle,Share2} from "lucide-react";
import {Checkbox} from "@/components/ui/checkbox";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import type {BuildModel} from "@/lib/models";
import type {ShoppingState} from "@/lib/design-project";
import {projectJSON,isYourEdition} from "@/lib/design-project";
import {shareProjectHash,findSharedLink,rememberSharedLink,listSharedLinks,linksForDesign} from "@/lib/design-library";
import "./gallery/community.css";

// A ready link carries what the gallery switch needs: its id, the owner token when this browser
// holds it, whether the build is the creator's own (an untouched preset can't be listed), and the
// earlier links made from the same build, whose gallery entry this one can take over.
export type EarlierLink={shareId:string;ownerToken:string};
type ReadyLink={url:string;image:string;id:string;ownerToken?:string;publishable:boolean;earlier:EarlierLink[]};
export type ShareState={status:"idle"}|{status:"working";step:string}|({status:"ready"}&ReadyLink)|{status:"error";message:string};

/** Publish an unlisted link whose preview card shows the actual creation. */
export function useShareLink(){
 const [state,setState]=useState<ShareState>({status:"idle"}),session=useRef(0),published=useRef<{project:string;link:ReadyLink}|null>(null);
 // designId: the build in My builds being shared, so its gallery entry follows it from link to link.
 const start=useCallback((model:BuildModel,shopping:ShoppingState,designId?:string)=>{
  const run=++session.current,project=projectJSON(model,shopping),publishable=isYourEdition(model);
  const earlierThan=async(id:string)=>designId?(await linksForDesign(designId)).filter(l=>l.shareId!==id).slice(0,5).map(l=>({shareId:l.shareId,ownerToken:l.ownerToken})):[];
  // Sharing an unchanged creation again reuses its link.
  if(published.current?.project===project){setState({status:"ready",...published.current.link});return;}
  setState({status:"working",step:"Rendering a preview…"});
  void (async()=>{
   try{
    // Links made on earlier visits are reused too; their preview is served from the link.
    const projectHash=await shareProjectHash(model),known=await findSharedLink(projectHash);if(session.current!==run)return;
    if(known){
     if(designId&&known.designId!==designId)void rememberSharedLink({...known,designId});
     const link={url:known.url,image:`/api/share/${known.shareId}/image`,id:known.shareId,ownerToken:known.ownerToken,publishable,earlier:await earlierThan(known.shareId)};if(session.current!==run)return;
     published.current={project,link};setState({status:"ready",...link});return;
    }
    const {renderShareImage}=await import("@/lib/share-image");
    const image=await renderShareImage(model);if(session.current!==run)return;
    setState({status:"working",step:"Creating your link…"});
    const response=await fetch("/api/share",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:JSON.parse(project),image})});
    const data=await response.json().catch(()=>({})) as {id?:string;url?:string;ownerToken?:string;error?:string};
    if(!response.ok||!data.url||!data.id)throw Error(data.error||"Sharing is temporarily unavailable.");
    const earlier=await earlierThan(data.id);
    await rememberSharedLink({projectHash,shareId:data.id,url:data.url,ownerToken:data.ownerToken,createdAt:new Date().toISOString(),...(designId?{designId}:{})});
    // A repeat share comes back without a token; this browser may still hold it from the first time.
    const ownerToken=data.ownerToken||(await listSharedLinks()).find(l=>l.shareId===data.id&&l.ownerToken)?.ownerToken;
    if(session.current!==run)return;
    const link={url:data.url,image,id:data.id,ownerToken,publishable,earlier};published.current={project,link};setState({status:"ready",...link});
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
  <DialogHeader><DialogTitle>Share “{name}”</DialogTitle><DialogDescription>Anyone with the link can view and remix the model with its name, description and the shape of its reference plan. Your photos, location hint, research sources and notes, brief wording, change requests, review and shopping list are not included.</DialogDescription></DialogHeader>
  {state.status==="working"&&<p className="share-status" role="status"><LoaderCircle className="spin" size={16}/>{state.step}</p>}
  {state.status==="error"&&<p className="share-error" role="alert">{state.message}</p>}
  {state.status==="ready"&&<div className="share-ready">
   {/* A local data URL preview; the image optimizer does not apply. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img className="share-preview" src={state.image} width={1200} height={630} alt={`Link preview for ${name}`}/>
   <div className="share-link"><input readOnly value={state.url} aria-label="Share link" onFocus={e=>e.currentTarget.select()}/><button type="button" className="button primary" onClick={()=>void copy(state.url)}>{copied?<Check size={16}/>:<Copy size={16}/>}{copied?"Copied":"Copy link"}</button></div>
   {nativeShare&&<button type="button" className="button secondary share-native" onClick={()=>void navigator.share({title:name,text:`${name}, built with Bricks`,url:state.url}).catch(()=>{})}><Share2 size={16}/>Share via…</button>}
   <GalleryToggle key={state.id} shareId={state.id} ownerToken={state.ownerToken} publishable={state.publishable} earlier={state.earlier}/>
  </div>}
 </DialogContent></Dialog>;
}

/**
 * List or unlist a link in the public gallery with its owner token. Unlisting a link that isn't listed succeeds.
 * replaces: an earlier listed link of the same build (with its token), whose entry the new link takes over.
 */
export async function setGalleryListing(shareId:string,ownerToken:string,show:boolean,fetcher:typeof fetch=fetch,replaces?:EarlierLink):Promise<{published:boolean;hidden:boolean}>{
 const response=await fetcher(show?"/api/gallery":`/api/gallery/${encodeURIComponent(shareId)}`,{method:show?"POST":"DELETE",headers:{Authorization:`Bearer ${ownerToken}`,...(show?{"Content-Type":"application/json"}:{})},...(show?{body:JSON.stringify({shareId,...(replaces?{replaces}:{})})}:{})});
 if(!show&&(response.status===204||response.status===404))return {published:false,hidden:false};
 const data=await response.json().catch(()=>({})) as {hidden?:boolean;error?:string};
 if(!response.ok)throw Error(data.error||"The gallery couldn’t be updated. Try again in a moment.");
 return {published:show,hidden:data.hidden===true};
}

type GalleryStatus={published?:boolean;hidden?:boolean;removed?:boolean};
const readGalleryStatus=(shareId:string,fetcher:typeof fetch=fetch)=>fetcher(`/api/gallery/${encodeURIComponent(shareId)}`).then(r=>r.ok?r.json() as Promise<GalleryStatus>:null).catch(()=>null);
/** Which of these links are listed in the gallery now (unknown counts as not listed). */
export async function listedLinks<T extends {shareId:string}>(links:readonly T[],fetcher:typeof fetch=fetch):Promise<T[]>{
 const states=await Promise.all(links.map(l=>readGalleryStatus(l.shareId,fetcher)));return links.filter((_,i)=>states[i]?.published===true);
}

/**
 * Opt-in and off by default: a link stays unlisted unless its creator ticks this. When an earlier link
 * of the same build is listed, ticking updates that gallery entry with this version instead of adding
 * a second card: the old link is unlisted and its remixes move over.
 */
export function GalleryToggle({shareId,ownerToken,publishable,earlier=[]}:{shareId:string;ownerToken?:string;publishable:boolean;earlier?:readonly EarlierLink[]}){
 const id=useId(),[listing,setListing]=useState({checked:false,hidden:false,removed:false,busy:false,error:""}),[previous,setPrevious]=useState<EarlierLink|null>(null),earlierKey=earlier.map(l=>l.shareId).join(",");
 // Start from the server's answer, so a link listed on an earlier visit shows as listed, and find an earlier version still listed.
 useEffect(()=>{
  let live=true;
  void readGalleryStatus(shareId).then(status=>{if(live&&status)setListing(v=>v.busy?v:{...v,checked:status.published===true,hidden:status.hidden===true,removed:status.removed===true});});
  if(earlier.length)void listedLinks(earlier).then(listed=>{if(live)setPrevious(listed[0]||null);});
  return()=>{live=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[shareId,earlierKey]);
 const toggle=async(show:boolean)=>{
  if(!ownerToken)return;setListing(v=>({...v,checked:show,busy:true,error:""}));
  try{const next=await setGalleryListing(shareId,ownerToken,show,fetch,show&&previous?previous:undefined);if(show)setPrevious(null);setListing(v=>({...v,checked:next.published,hidden:next.hidden,busy:false,error:""}));}
  catch(error){setListing(v=>({...v,checked:!show,busy:false,error:error instanceof Error?error.message:"The gallery couldn’t be updated."}));}
 };
 const replacing=Boolean(previous&&!listing.checked);
 const note=!publishable?"Change this preset or design your own build to show it in the gallery.":!ownerToken?"Only the browser that created this link can show it in the gallery.":listing.removed?"A moderator took this build out of the public gallery. The link still works.":listing.checked&&listing.hidden?"Listed, but hidden from the gallery while it’s reviewed.":replacing?"An earlier version of this build is in the public gallery. Tick to show this version there instead; its remixes carry over. Turn off any time.":"Lists its name, preview and piece count in the public gallery, where anyone can open and remix it. Turn off any time.";
 return <div className="gallery-publish">
  <Checkbox id={id} checked={listing.checked} disabled={!publishable||!ownerToken||listing.removed||listing.busy} onCheckedChange={value=>void toggle(value===true)} aria-describedby={`${id}-note`}/>
  <div><label htmlFor={id}>{replacing?"Update the gallery entry":"Show in the public gallery"}{listing.busy&&<LoaderCircle className="spin" size={14} aria-label="Saving"/>}</label>
   <p id={`${id}-note`}>{note}{listing.checked&&!listing.hidden&&!listing.busy&&<> <a href="/gallery" target="_blank" rel="noopener">See the gallery</a></>}</p>
   {listing.error&&<p className="gallery-publish-error" role="alert">{listing.error}</p>}
  </div>
 </div>;
}
