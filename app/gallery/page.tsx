import type {Metadata} from "next";
import {headers} from "next/headers";
import Link from "next/link";
import {cache} from "react";
import {Plus} from "lucide-react";
import {env} from "cloudflare:workers";
import {listGallery,parseSort} from "@/lib/gallery";
import type {GalleryEnv,GalleryPage,GallerySort} from "@/lib/gallery";
import {ThemeToggle} from "../theme";
import GalleryGrid from "./gallery-grid";
import "./gallery.css";

type Props={searchParams:Promise<{sort?:string|string[]}>};
const TITLE="Community builds",DESCRIPTION="Custom brick models people designed with Bricks by Ralc and chose to share. Open any of them to explore it, remix it or get the pieces.";

// Metadata and the page share one read of the first page per request.
const firstPage=cache(async(sort:GallerySort):Promise<GalleryPage|null>=>{
 const db=(env as unknown as GalleryEnv).DB;if(!db)return null;
 try{return await listGallery(db,sort);}catch{console.error(JSON.stringify({event:"bricks_gallery_failed",op:"page"}));return null;}
});
const sortOf=async(searchParams:Props["searchParams"])=>{const raw=(await searchParams).sort;return parseSort(typeof raw==="string"?raw:null)||"recent";};

export async function generateMetadata({searchParams}:Props):Promise<Metadata>{
 const host=(await headers()).get("host")||"localhost",protocol=/^(localhost|127\.0\.0\.1)(:|$)/.test(host)?"http":"https",base=`${protocol}://${host}`;
 // The newest build's card makes the link preview; the logo stands in while the gallery is empty.
 const hero=(await firstPage(await sortOf(searchParams)))?.items[0];
 const images=hero?[{url:`${base}${hero.imageUrl}`,width:1200,height:630,alt:`${hero.name}, a custom brick model`}]:[{url:`${base}/bricks-logo.png`,alt:"Bricks by Ralc"}];
 return {title:`${TITLE} · Bricks by Ralc`,description:DESCRIPTION,alternates:{canonical:`${base}/gallery`},openGraph:{type:"website",siteName:"Bricks by Ralc",url:`${base}/gallery`,title:TITLE,description:DESCRIPTION,images},twitter:{card:hero?"summary_large_image":"summary",title:TITLE,description:DESCRIPTION,images:images.map(image=>image.url)}};
}

/** What people have built: published shares only, server-rendered so the names are indexable. */
export default async function Gallery({searchParams}:Props){
 const sort=await sortOf(searchParams),page=await firstPage(sort);
 return <div className="gallery-shell">
  <header className="topbar gallery-topbar">
   {/* A static logo from /public; the image optimizer adds nothing at this size. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <Link href="/" className="brand" aria-label="Bricks by Ralc studio"><img className="brand-logo" src="/bricks-logo.png" width={48} height={48} alt=""/><span className="brand-wordmark">Bricks<small>by ralc</small></span></Link>
   <div className="header-actions"><ThemeToggle/><Link className="button primary gallery-make" href="/"><Plus size={16}/><span>Make your own</span></Link></div>
  </header>
  <main className="gallery-main">
   <div className="gallery-head">
    <div><h1>{TITLE}</h1><p>Custom brick models people designed and chose to share. Open one to explore it, remix it or get the pieces.</p></div>
    <nav className="gallery-sort" aria-label="Sort builds"><Link href="/gallery" aria-current={sort==="recent"?"page":undefined}>Newest</Link><Link href="/gallery?sort=remixed" aria-current={sort==="remixed"?"page":undefined}>Most remixed</Link></nav>
   </div>
   {page?<GalleryGrid key={sort} sort={sort} initial={page}/>:<div className="gallery-empty" role="status"><h2>The gallery is taking a break.</h2><p>It couldn’t be loaded just now. Try again in a moment, or keep building in the studio.</p><Link className="button secondary" href="/">Open the studio</Link></div>}
  </main>
 </div>;
}
