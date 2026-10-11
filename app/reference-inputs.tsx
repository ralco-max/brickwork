"use client";
import {useEffect,useId,useRef,useState} from "react";
import {ImagePlus,LoaderCircle,MapPin,X} from "lucide-react";
import {MAX_REFERENCE_PHOTOS,collectReferencePhotos} from "@/lib/reference-photos";

export type ReferenceInputValue={photo?:string;photos:string[];identityHint:string};
type Props={value:ReferenceInputValue;disabled?:boolean;question?:string;onChange:(value:ReferenceInputValue)=>void;onPreparing:(preparing:boolean)=>void};

export default function ReferenceInputs({value,disabled=false,question,onChange,onPreparing}:Props){
 const id=useId(),alive=useRef(true),uploading=useRef(false),[preparing,setPreparing]=useState(false),[error,setError]=useState("");
 const photos=collectReferencePhotos(value.photo,value.photos),full=photos.length>=MAX_REFERENCE_PHOTOS;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onPreparing(false);};},[onPreparing]);
 async function add(files:File[]){
  if(disabled||uploading.current||!files.length)return;
  setError("");
  if(files.length>MAX_REFERENCE_PHOTOS-photos.length){setError(`Use up to ${MAX_REFERENCE_PHOTOS} photos in total. Remove a photo to make room.`);return;}
  if(files.some(file=>!["image/jpeg","image/png","image/webp"].includes(file.type))){setError("Choose JPG, PNG or WebP photos.");return;}
  if(files.some(file=>file.size>10*1024*1024)){setError("Choose photos smaller than 10 MB each.");return;}
  uploading.current=true;setPreparing(true);onPreparing(true);
  try{
   const {imageDataURL}=await import("@/lib/imports"),added:string[]=[];
   for(const file of files){const photo=await imageDataURL(file);if(!alive.current)return;added.push(photo);}
   const next=collectReferencePhotos(value.photo,[...value.photos,...added]);
   onChange({...value,photos:value.photo?next.filter(photo=>photo!==value.photo):next});
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:"These photos could not be prepared. Try another image.");}
  finally{uploading.current=false;if(alive.current){setPreparing(false);onPreparing(false);}}
 }
 return <section className="reference-inputs" aria-label="Reference photos and place">
  <div className="reference-inputs-heading"><strong>Reference photos</strong><span>{photos.length} / {MAX_REFERENCE_PHOTOS}</span></div>
  <p>Add another angle or a detail to guide the next pass. These photos stay with your design.</p>
  {photos.length>0&&<div className="reference-thumbnails">{photos.map((photo,index)=><figure key={photo}><img src={photo} alt={`Your reference photo ${index+1}`}/><figcaption>Photo {index+1}</figcaption><button type="button" disabled={disabled||preparing} aria-label={`Remove reference photo ${index+1}`} onClick={()=>{setError("");onChange({...value,photo:value.photo===photo?undefined:value.photo,photos:value.photos.filter(item=>item!==photo)});}}><X size={14}/></button></figure>)}</div>}
  <label className={`reference-upload ${disabled||preparing||full?"is-disabled":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void add(Array.from(e.dataTransfer.files));}}>
   {preparing?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}<span>{preparing?"Preparing photos…":full?"All four photos added":"Add photos"}</span>
   <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Add reference photos" disabled={disabled||preparing||full} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void add(files);}}/>
  </label>
  {error&&<p className="reference-input-error" role="alert">{error}</p>}
  {question&&<p className="reference-question" role="status">{question}</p>}
  <label className="reference-place-label" htmlFor={`${id}-place`}><MapPin size={14}/>Place or structure <span>{question?"Help identify it":"Optional"}</span></label>
  <input id={`${id}-place`} className="reference-place-input" value={value.identityHint} maxLength={300} disabled={disabled||preparing} onChange={e=>onChange({...value,identityHint:e.target.value})} placeholder="Name, city, specific building or era" aria-describedby={`${id}-help`}/>
  <p id={`${id}-help`}>For a known place, Brickwork looks up its shape and layout. If the structure is still unclear, it will ask before building.</p>
 </section>;
}
