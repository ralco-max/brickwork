"use client";
import {useEffect,useId,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import {Box,Check,ChevronDown,ChevronLeft,ChevronRight,Layers3,Search,RotateCw,X} from "lucide-react";
import {COLORS,PARTS} from "@/lib/bridge";
import type {ColorKey,Face,PartId} from "@/lib/bridge";
import {catalogPart} from "@/lib/part-catalog";
import {partColors} from "@/lib/part-colors";
import {colorSwatch} from "@/lib/colors";
import {catalogOptions,familyLabel,partColorAllowed,partPage,searchParts,PART_PICKER_PAGE_SIZE} from "./part-picker-data";

const faces:Face[]=["pz","px","nz","nx"];
function PartThumbnail({part,name,family}:{part:PartId;name:string;family:string}){
 const [missing,setMissing]=useState(false),thumbnail=catalogPart(part)?.thumbnail;
 return <span className="part-picker-thumbnail" aria-hidden="true">{!thumbnail||missing?(/plate|tile/i.test(family)?<Layers3/>:<Box/>):<img src={thumbnail} alt={name} loading="lazy" onError={()=>setMissing(true)}/>}</span>;
}
type Props={value:PartId;onChange:(part:PartId)=>void;color:ColorKey;onColorChange:(color:ColorKey)=>void;face:Face;onFaceChange:(face:Face)=>void};
export default function PartPicker({value,onChange,color,onColorChange,face,onFaceChange}:Props){
 const id=useId(),searchId=`${id}-search`,panelId=`${id}-catalog`,trigger=useRef<HTMLButtonElement>(null),searchInput=useRef<HTMLInputElement>(null),resultsList=useRef<HTMLUListElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[family,setFamily]=useState("all"),[requestedPage,setPage]=useState(0);
 const options=useMemo(()=>catalogOptions(),[]),families=useMemo(()=>Array.from(new Set(options.map(part=>part.family))).sort((a,b)=>a.localeCompare(b)),[options]);
 const results=useMemo(()=>searchParts(options,query,family),[options,query,family]),page=partPage(results,requestedPage),part=PARTS[value],catalog=catalogPart(value),selected=options.find(option=>option.id===value),colorAllowed=partColorAllowed(value,color),knownColors=partColors(value);
 useEffect(()=>{if(open)searchInput.current?.focus();},[open]);
 useEffect(()=>{if(resultsList.current)resultsList.current.scrollTop=0;},[query,family,requestedPage]);
 const close=()=>{setOpen(false);trigger.current?.focus();};
 const choose=(partId:PartId)=>{onChange(partId);close();};
 const counterpart=catalog?.counterpart&&Object.hasOwn(PARTS,catalog.counterpart)?catalog.counterpart as PartId:undefined;
 return <div className="part-picker">
  <div className="part-picker-current"><button type="button" ref={trigger} className="part-picker-trigger" aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(value=>!value)}><PartThumbnail key={value} part={value} name={part.name} family={selected?.family||"bricks"}/><span><strong>{part.name}</strong><small>#{value} · Browse {options.length} part shapes</small></span><ChevronDown size={18}/></button><button type="button" className="button secondary part-picker-rotate" onClick={()=>onFaceChange(faces[(faces.indexOf(face)+1)%faces.length])} aria-label={`Rotate selected part clockwise; current orientation ${faces.indexOf(face)*90} degrees`}><RotateCw size={16}/>{faces.indexOf(face)*90}°</button></div>
  {open&&<section id={panelId} className="part-picker-browser" aria-label="Part catalog" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close();}}}>
   <div className="part-picker-browser-heading"><div><strong>Find the right shape.</strong><span>{options.length} part designs · search by name, number or size</span></div><button className="icon-button" type="button" aria-label="Close part catalog" onClick={close}><X size={17}/></button></div>
   <label className="part-picker-search" htmlFor={searchId}><Search size={18}/><span className="sr-only">Search parts</span><input id={searchId} ref={searchInput} type="search" value={query} placeholder="Try curved slope, 2 × 4, or a part number" onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>
   <div className="part-picker-families" role="group" aria-label="Filter by part family"><button type="button" aria-pressed={family==="all"} onClick={()=>{setFamily("all");setPage(0);}}>All shapes</button>{families.map(name=><button type="button" key={name} aria-pressed={family===name} onClick={()=>{setFamily(name);setPage(0);}}>{familyLabel(name)}</button>)}</div>
   <p className="part-picker-result-count" role="status">{results.length?`${results.length} matching ${results.length===1?"shape":"shapes"} · showing ${page.page*PART_PICKER_PAGE_SIZE+1}–${page.page*PART_PICKER_PAGE_SIZE+page.results.length}`:"No matching shapes. Try another name or size."}</p>
   <ul ref={resultsList} className="part-picker-results">{page.results.map(option=><li key={option.id}><button type="button" className={option.id===value?"selected":""} aria-pressed={option.id===value} onClick={()=>choose(option.id)}><PartThumbnail key={option.id} part={option.id} name={option.name} family={option.family}/><span><small>#{option.id} · {familyLabel(option.family)}</small><strong>{option.name}</strong><span>{option.w} × {option.d} studs · {option.h} plates high{option.handedness?` · ${option.handedness}`:""}</span></span>{option.id===value&&<Check className="part-picker-selected" size={16}/>}</button></li>)}</ul>
   {page.pages>1&&<nav className="part-picker-pagination" aria-label="Catalog pages"><button type="button" className="button secondary" disabled={page.page===0} onClick={()=>setPage(page.page-1)}><ChevronLeft size={16}/>Previous</button><span>Page {page.page+1} of {page.pages}</span><button type="button" className="button secondary" disabled={page.page===page.pages-1} onClick={()=>setPage(page.page+1)}>Next<ChevronRight size={16}/></button></nav>}
  </section>}
  <div className="part-picker-details"><div className="part-picker-specs"><span>{selected?familyLabel(selected.family):"Part"}</span><span>{part.w} × {part.d} studs · {part.h} plates high</span>{catalog&&<span>{catalog.topStuds.length} top studs · {catalog.bottomSockets.length} underside sockets</span>}{catalog?.handedness&&<span>{catalog.handedness} handed</span>}{counterpart&&<button type="button" onClick={()=>onChange(counterpart)}>Use counterpart #{counterpart}<ChevronRight size={13}/></button>}</div>
   <fieldset className="part-picker-colors"><legend>{catalog?"Catalog colors for this part":"Colors for this part"}<span> · {COLORS[color].name}</span></legend><div>{knownColors.map(key=>Object.hasOwn(COLORS,key)&&<button key={key} type="button" aria-label={COLORS[key].name} title={COLORS[key].name} aria-pressed={color===key} onClick={()=>onColorChange(key)} style={{"--part-color":colorSwatch(key)} as CSSProperties}>{color===key&&<Check size={15}/>}</button>)}</div></fieldset>
   {!colorAllowed&&<p className="part-picker-color-warning" role="status">{COLORS[color].name} is not recorded for this part. Choose a catalog color above before placing it.</p>}
   <p className="part-picker-guidance">Place upright on stud connections. Rotate to choose the front; clips and hinges do not auto-connect. <a href="/parts/about.html" target="_blank" rel="noreferrer">Part data &amp; credits</a></p>
  </div>
 </div>;
}
