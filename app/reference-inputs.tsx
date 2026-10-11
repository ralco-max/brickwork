"use client";
import {useEffect,useId,useRef,useState} from "react";
import {ImagePlus,LoaderCircle,MapPin,X} from "lucide-react";
import {MAX_REFERENCE_PHOTOS,collectReferencePhotos} from "@/lib/reference-photos";
import {preparePhotoAttachments} from "./photo-attachments";
import {useImagePaste} from "./image-paste";

export type ReferenceInputValue={photo?:string;photos:string[];identityHint:string};
type Props={value:ReferenceInputValue;disabled?:boolean;question?:string;pasteTargetId?:string;onChange:(value:ReferenceInputValue)=>void;onPreparing:(preparing:boolean)=>void};

export function mergeReferencePhotos(value:ReferenceInputValue,added:string[]):ReferenceInputValue{
 const next=collectReferencePhotos(value.photo,[...value.photos,...added]);
 return {...value,photos:value.photo?next.filter(photo=>photo!==value.photo):next};
}

export default function ReferenceInputs({value,disabled=false,question,pasteTargetId,onChange,onPreparing}:Props){
 const id=useId(),rootRef=useRef<HTMLElement>(null),alive=useRef(false),uploading=useRef(false),session=useRef(0),latest=useRef({value,onChange,onPreparing}),[preparing,setPreparing]=useState(false),[error,setError]=useState("");
 latest.current={value,onChange,onPreparing};
 const photos=collectReferencePhotos(value.photo,value.photos),full=photos.length>=MAX_REFERENCE_PHOTOS;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;session.current++;if(uploading.current){uploading.current=false;latest.current.onPreparing(false);}};},[]);
 async function add(files:File[]){
  if(disabled||uploading.current||!files.length)return;
  const token=++session.current,isActive=()=>alive.current&&session.current===token;
  setError("");uploading.current=true;setPreparing(true);latest.current.onPreparing(true);
  try{
   const {imageDataURL}=await import("@/lib/imports");if(!isActive())return;
   const added=await preparePhotoAttachments(files,()=>collectReferencePhotos(latest.current.value.photo,latest.current.value.photos),imageDataURL,isActive);
   if(isActive()&&added.length)latest.current.onChange(mergeReferencePhotos(latest.current.value,added));
  }catch(e){if(isActive())setError(e instanceof Error?e.message:"These photos could not be prepared. Try another image.");}
  finally{if(isActive()){uploading.current=false;setPreparing(false);latest.current.onPreparing(false);}}
 }
 useImagePaste({rootRef,pasteTargetId,disabled:disabled||preparing,onFiles:files=>void add(files)});
 return <section ref={rootRef} className="reference-inputs" aria-label="Reference photos and place">
  <div className="reference-inputs-heading"><strong>Reference photos</strong><span>{photos.length} / {MAX_REFERENCE_PHOTOS}</span></div>
  <p>Add another angle or a detail to guide the next pass. You can also paste copied images into your description.</p>
  {photos.length>0&&<div className="reference-thumbnails">{photos.map((photo,index)=><figure key={photo}><img src={photo} alt={`Your reference photo ${index+1}`}/><figcaption>Photo {index+1}</figcaption><button type="button" disabled={disabled||preparing} aria-label={`Remove reference photo ${index+1}`} onClick={()=>{setError("");onChange({...value,photo:value.photo===photo?undefined:value.photo,photos:value.photos.filter(item=>item!==photo)});}}><X size={14}/></button></figure>)}</div>}
  <label className={`reference-upload ${disabled||preparing||full?"is-disabled":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void add(Array.from(e.dataTransfer.files));}}>
   {preparing?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}<span>{preparing?"Preparing photos…":full?"All four photos added":"Add photos"}</span>
   <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Add reference photos" disabled={disabled||preparing||full} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void add(files);}}/>
  </label>
  {error&&<p className="reference-input-error" role="alert">{error}</p>}
  {question&&<p className="reference-question" role="status">{question}</p>}
  <label className="reference-place-label" htmlFor={`${id}-place`}><MapPin size={14}/>Place or structure <span>{question?"Help identify it":"Optional"}</span></label>
  <input id={`${id}-place`} className="reference-place-input" value={value.identityHint} maxLength={300} disabled={disabled} onChange={e=>onChange({...value,identityHint:e.target.value})} placeholder="Name, city, specific building or era" aria-describedby={`${id}-help`}/>
  <p id={`${id}-help`}>For a known place, Bricks looks up its shape and layout. If the structure is still unclear, it will ask before building.</p>
 </section>;
}
