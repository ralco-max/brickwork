"use client";
import {useState} from "react";
import Link from "next/link";
import {Flag,LoaderCircle,MoreHorizontal,Shuffle,SquareArrowOutUpRight} from "lucide-react";
import {Toaster,toast} from "sonner";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import type {GalleryItem,GalleryPage,GallerySort} from "@/lib/gallery";

const count=(n:number,one:string,many:string)=>`${n.toLocaleString("en-US")} ${n===1?one:many}`;

function GalleryCard({item,onReport}:{item:GalleryItem;onReport:(item:GalleryItem)=>void}){
 return <article className="gallery-card">
  <a className="gallery-card-link" href={item.url}>
   {/* The share's own 1200×630 card, cropped to its model render on the right. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={item.imageUrl} width={1200} height={630} loading="lazy" decoding="async" alt={`${item.name}, a custom brick model`}/>
   <span className="gallery-card-body"><strong title={item.name}>{item.name}</strong><span className="gallery-card-meta"><span>{count(item.pieceCount,"piece","pieces")}</span><span className="gallery-remixes"><Shuffle size={13} aria-hidden="true"/>{count(item.remixes,"remix","remixes")}</span></span></span>
  </a>
  <DropdownMenu>
   <DropdownMenuTrigger asChild><button type="button" className="gallery-card-menu" aria-label={`More for ${item.name}`}><MoreHorizontal size={18}/></button></DropdownMenuTrigger>
   <DropdownMenuContent align="end"><DropdownMenuItem asChild><a href={item.url}><SquareArrowOutUpRight size={16}/>Open &amp; remix</a></DropdownMenuItem><DropdownMenuItem onSelect={()=>onReport(item)}><Flag size={16}/>Report this build</DropdownMenuItem></DropdownMenuContent>
  </DropdownMenu>
 </article>;
}

/** The first page arrives server-rendered; later pages load by cursor and append without repeats. */
export default function GalleryGrid({sort,initial}:{sort:GallerySort;initial:GalleryPage}){
 const [items,setItems]=useState(initial.items),[cursor,setCursor]=useState(initial.nextCursor),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const more=async()=>{
  if(!cursor||loading)return;setLoading(true);setError("");
  try{
   const response=await fetch(`/api/gallery?sort=${sort}&cursor=${encodeURIComponent(cursor)}`);
   const page=await response.json() as GalleryPage&{error?:string};if(!response.ok)throw Error(page.error);
   setItems(list=>{const seen=new Set(list.map(i=>i.id));return [...list,...page.items.filter(i=>!seen.has(i.id))];});setCursor(page.nextCursor);
  }catch{setError("More builds couldn’t be loaded. Try again in a moment.");}
  finally{setLoading(false);}
 };
 const report=async(item:GalleryItem)=>{
  try{
   const response=await fetch(`/api/gallery/${item.id}/report`,{method:"POST"});
   if(!response.ok&&response.status!==404)throw Error();
   setItems(list=>list.filter(i=>i.id!==item.id));
   toast.success("Thanks for the report.",{description:"Builds that several people report are hidden while they’re reviewed."});
  }catch{toast.error("The report couldn’t be sent. Try again in a moment.");}
 };
 if(!items.length)return <div className="gallery-empty"><h2>No public builds yet — share yours</h2><p>Design a build in the studio, choose Share, then tick “Show in the public gallery”.</p><Link className="button primary" href="/">Start a build</Link></div>;
 return <>
  <ul className="gallery-grid">{items.map(item=><li key={item.id}><GalleryCard item={item} onReport={item=>void report(item)}/></li>)}</ul>
  {cursor&&<button type="button" className="button secondary gallery-more" onClick={()=>void more()} disabled={loading}>{loading?<LoaderCircle className="spin" size={16}/>:null}{loading?"Loading…":"Load more"}</button>}
  <p className="gallery-error" role="status" aria-live="polite">{error}</p>
  <Toaster position="bottom-center" richColors/>
 </>;
}
