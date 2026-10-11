"use client";
import {useEffect,useId,useRef,useState} from "react";
import type {ReactNode} from "react";
import {ImagePlus,LoaderCircle,X} from "lucide-react";
import {MAX_REFERENCE_PHOTOS} from "@/lib/reference-photos";
import {useImagePaste} from "./image-paste";

type Props={photos:string[];onAdd:(photos:string[])=>void;onRemove:(photo:string)=>void;onPreparing:(preparing:boolean)=>void;disabled?:boolean;pasteTargetId?:string;children?:ReactNode};
const PHOTO_TYPES=new Set(["image/jpeg","image/png","image/webp"]);

/** Return only new attachments, never the prompt or a stale draft snapshot. */
export async function preparePhotoAttachments(files:File[],readPhotos:()=>string[],decode:(file:File)=>Promise<string>,active:()=>boolean=()=>true):Promise<string[]>{
 if(!files.length)return [];
 const existing=[...new Set(readPhotos())];
 if(files.length>MAX_REFERENCE_PHOTOS-existing.length)throw Error(`Use up to ${MAX_REFERENCE_PHOTOS} photos in total. Remove a photo to make room.`);
 if(files.some(file=>!PHOTO_TYPES.has(file.type)))throw Error("Choose JPG, PNG or WebP photos.");
 if(files.some(file=>file.size>10*1024*1024))throw Error("Choose photos smaller than 10 MB each.");
 const decoded:string[]=[];
 for(const file of files){
  if(!active())throw new DOMException("Photo upload canceled.","AbortError");
  const photo=await decode(file);
  if(!active())throw new DOMException("Photo upload canceled.","AbortError");
  decoded.push(photo);
 }
 const current=new Set(readPhotos()),added=[...new Set(decoded)].filter(photo=>!current.has(photo));
 if(current.size+added.length>MAX_REFERENCE_PHOTOS)throw Error(`Use up to ${MAX_REFERENCE_PHOTOS} photos in total. Remove a photo to make room.`);
 return added;
}

export default function PhotoAttachments({photos,onAdd,onRemove,onPreparing,disabled=false,pasteTargetId,children}:Props){
 const id=useId(),rootRef=useRef<HTMLElement>(null),fileInput=useRef<HTMLInputElement>(null),mounted=useRef(false),uploading=useRef(false),session=useRef(0),latest=useRef({photos,onAdd,onPreparing});
 latest.current={photos,onAdd,onPreparing};
 const [preparing,setPreparing]=useState(false),[error,setError]=useState("");
 const full=photos.length>=MAX_REFERENCE_PHOTOS,locked=disabled||preparing,description=`${id}-help${error?` ${id}-error`:""}`;
 useEffect(()=>{
  mounted.current=true;
  return()=>{mounted.current=false;session.current++;if(uploading.current){uploading.current=false;latest.current.onPreparing(false);}};
 },[]);
 async function add(files:File[]){
  if(disabled||uploading.current||!files.length)return;
  const token=++session.current,isActive=()=>mounted.current&&session.current===token;
  setError("");uploading.current=true;setPreparing(true);latest.current.onPreparing(true);
  try{
   const {imageDataURL}=await import("@/lib/imports");
   if(!isActive())return;
   const added=await preparePhotoAttachments(files,()=>latest.current.photos,imageDataURL,isActive);
   if(isActive()&&added.length)latest.current.onAdd(added);
  }catch(cause){if(isActive())setError(cause instanceof Error?cause.message:"These photos could not be prepared. Try another image.");}
  finally{if(isActive()){uploading.current=false;setPreparing(false);latest.current.onPreparing(false);}}
 }
 useImagePaste({rootRef,pasteTargetId,disabled:locked,onFiles:files=>void add(files)});
 return <section ref={rootRef} className="idea-attachments" aria-label="Photos for this idea" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=locked||full?"none":"copy";}} onDrop={event=>{event.preventDefault();void add(Array.from(event.dataTransfer.files));}}>
  <div className="idea-attachment-actions">
   <button type="button" className="idea-attachment-add" disabled={locked||full} aria-describedby={description} onClick={()=>fileInput.current?.click()}>{preparing?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}<span>{preparing?"Preparing photos…":full?"All four photos added":"Add photos"}</span></button>
   <input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" aria-label="Attach reference photos" aria-describedby={description} disabled={locked||full} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value="";void add(files);}}/>
   {children}<span className="idea-attachment-count" aria-live="polite" aria-label={`${photos.length} of ${MAX_REFERENCE_PHOTOS} photos attached`}>{photos.length} / {MAX_REFERENCE_PHOTOS} photos</span>
  </div>
  {photos.length>0&&<div className="idea-attachment-list">{photos.map((photo,index)=><figure key={photo}><img src={photo} alt={`Reference photo ${index+1} for your idea`}/><figcaption>Photo {index+1}</figcaption><button type="button" className="idea-attachment-remove" disabled={locked} aria-label={`Remove reference photo ${index+1}`} onClick={()=>{setError("");onRemove(photo);}}><X size={14}/></button></figure>)}</div>}
  {preparing&&<p className="idea-attachment-status" role="status">Preparing your photos. You can keep writing.</p>}
  <p id={`${id}-help`} className="idea-attachment-status">JPG, PNG or WebP, up to 10 MB each. You can also paste copied images into your description.</p>
  {error&&<p id={`${id}-error`} className="idea-attachment-error" role="alert">{error}</p>}
 </section>;
}
