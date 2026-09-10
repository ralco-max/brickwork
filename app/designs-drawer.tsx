"use client";
import {FolderOpen,Sparkles,ShoppingBag,Trash2,Landmark} from "lucide-react";
import type {SavedDesign} from "@/lib/design-library";
import type {BuildModel,Recipe} from "@/lib/models";

// The designs drawer is the library: the four landmark presets and everything saved
// in this browser. It sits beside the stage in both modes, so opening a design or a
// landmark swaps the model in place instead of leaving the studio.
const relative=(iso:string)=>{const minutes=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));if(minutes<1)return "just now";if(minutes<60)return `${minutes} min ago`;const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;const days=Math.round(hours/24);return days===1?"yesterday":`${days} days ago`;};
const LANDMARKS=[["bridge","Golden Gate"],["castle","Neuschwanstein"],["lighthouse","Cape Hatteras"],["rocket","Saturn V"]] as const;
type Props={open:boolean;model:BuildModel;designs:SavedDesign[];onChoose:(recipe:Recipe)=>void;onOpenSaved:(design:SavedDesign)=>void;onContinueSaved:(design:SavedDesign)=>void;onShopSaved:(design:SavedDesign)=>void;onDeleteSaved:(id:string)=>void};
export default function DesignsDrawer({open,model,designs,onChoose,onOpenSaved,onContinueSaved,onShopSaved,onDeleteSaved}:Props){
 return <aside className="designs-drawer" aria-label="Designs" aria-hidden={!open} inert={!open}><div className="designs-drawer-inner">
  <div className="your-designs-head"><span>LANDMARKS</span><small>Rebuilt from real blueprints</small></div>
  <div className="landmark-list" role="group" aria-label="Show a landmark">{LANDMARKS.map(([id,label])=><button key={id} aria-pressed={model.recipe===id} onClick={()=>onChoose(id)}><Landmark size={15}/>{label}</button>)}</div>
  <div className="your-designs" aria-label="Your designs"><div className="your-designs-head"><span>YOUR DESIGNS</span><small>Saved in this browser · drafts included</small></div>
  {designs.length===0?<p className="drawer-empty">Nothing saved yet. Describe an idea in the bar above and it will appear here.</p>:<div className="your-designs-list">{designs.map(d=><article key={d.id} className={d.status==="draft"?"is-draft":""}><div className="your-design-meta"><strong>{d.name}</strong><span>{d.pieceCount.toLocaleString()} pieces · {d.status==="draft"?"In progress":"Saved"} · {relative(d.updatedAt)}</span></div><div className="your-design-actions"><button onClick={()=>onOpenSaved(d)}><FolderOpen size={14}/>Open</button><button onClick={()=>onContinueSaved(d)}><Sparkles size={14}/>Continue with AI</button><button onClick={()=>onShopSaved(d)}><ShoppingBag size={14}/>Get the pieces</button><button className="delete" aria-label={`Delete ${d.name}`} onClick={()=>onDeleteSaved(d.id)}><Trash2 size={14}/></button></div></article>)}</div>}
  </div>
 </div></aside>;
}
