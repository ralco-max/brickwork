"use client";
import {MoreHorizontal,Pin,PinOff,Sparkles,ShoppingBag,Trash2,X,LayoutGrid,ArrowRight} from "lucide-react";
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from "@/components/ui/dropdown-menu";
import type {CSSProperties} from "react";
import type {SavedDesign} from "@/lib/design-library";

// My builds: everything saved in this browser as a visual grid. Each card opens with one click; the rest
// (pin, refine, pieces, delete) sits in its ⋯ menu. Landmarks live with the presets in More ways.
const relative=(iso:string)=>{const minutes=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));if(minutes<1)return "just now";if(minutes<60)return `${minutes} min ago`;const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;const days=Math.round(hours/24);return days===1?"yesterday":`${days} days ago`;};
// A saved build may carry a small picture; one without gets a tinted tile with its initial so look-alike names still differ.
type Card=SavedDesign&{thumbnail?:string};
const hue=(name:string)=>[...name].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,7);
export const isAIDesign=(d:SavedDesign)=>d.project.includes('"generation":');
type Props={open:boolean;onClose:()=>void;designs:SavedDesign[];featureBusyId?:string|null;onOpenSaved:(design:SavedDesign)=>void;onContinueSaved:(design:SavedDesign)=>void;onShopSaved:(design:SavedDesign)=>void;onDeleteSaved:(design:SavedDesign)=>void;onFeatureSaved:(design:SavedDesign)=>void};
export default function DesignsDrawer({open,onClose,designs,featureBusyId,onOpenSaved,onContinueSaved,onShopSaved,onDeleteSaved,onFeatureSaved}:Props){
 const pinned=designs.filter(d=>d.featured),recent=designs.filter(d=>!d.featured);
 const card=(d:Card)=><li key={d.id} className={["design-card",d.status==="draft"?"is-draft":"",d.featured?"is-pinned":""].filter(Boolean).join(" ")}>
  <button type="button" className="design-card-open" onClick={()=>onOpenSaved(d)} aria-label={`Open ${d.name}`}>
   <span className="design-thumb" style={{"--thumb-hue":hue(d.name)} as CSSProperties}>{d.thumbnail?<img src={d.thumbnail} alt="" loading="lazy" decoding="async"/>:<span aria-hidden="true">{d.name.trim().charAt(0).toUpperCase()||"B"}</span>}{d.featured&&<Pin className="design-pin" size={13} aria-hidden="true"/>}</span>
   <span className="design-card-text"><strong title={d.name}>{d.name}</strong><small>{d.pieceCount.toLocaleString()} pieces · {d.status==="draft"?"Draft":relative(d.updatedAt)}</small></span>
  </button>
  <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="design-card-menu" aria-label={`More for ${d.name}`}><MoreHorizontal size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="end">
   <DropdownMenuItem disabled={Boolean(featureBusyId)} onSelect={()=>onFeatureSaved(d)}>{d.featured?<PinOff size={16}/>:<Pin size={16}/>}{featureBusyId===d.id?"Saving…":d.featured?"Unpin":"Pin"}</DropdownMenuItem>
   {isAIDesign(d)&&<DropdownMenuItem onSelect={()=>onContinueSaved(d)}><Sparkles size={16}/>Refine with AI</DropdownMenuItem>}
   <DropdownMenuItem onSelect={()=>onShopSaved(d)}><ShoppingBag size={16}/>Get the pieces</DropdownMenuItem>
   <DropdownMenuSeparator/><DropdownMenuItem variant="destructive" onSelect={()=>onDeleteSaved(d)}><Trash2 size={16}/>Delete</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
 </li>;
 return <aside className="designs-drawer" aria-label="My builds" aria-hidden={!open} inert={!open}><div className="designs-drawer-inner">
  <div className="your-designs-head drawer-head"><span>MY BUILDS</span><small>Saved in this browser</small><button type="button" className="tools-close drawer-close" aria-label="Close my builds" onClick={onClose}><X size={18}/></button></div>
  {designs.length===0?<p className="drawer-empty">Nothing here yet. Describe an idea above; every build you make or change is kept here.</p>:<>
   {pinned.length>0&&<section className="design-section" aria-label="Pinned builds"><h3 className="design-section-title">Pinned</h3><ul className="design-grid">{pinned.map(card)}</ul></section>}
   {recent.length>0&&<section className="design-section" aria-label="Recent builds"><h3 className="design-section-title">Recent<small>Last 12 · pin a build to keep it</small></h3><ul className="design-grid">{recent.map(card)}</ul></section>}
  </>}
  <a className="drawer-gallery-link" href="/gallery"><LayoutGrid size={15}/>See what others built<ArrowRight size={14}/></a>
 </div></aside>;
}
