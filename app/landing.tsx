"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {ReactNode} from "react";
import type React from "react";
import {Pause,Play,ArrowRight,Maximize2,Sparkles,Trash2,FolderOpen,RotateCcw} from "lucide-react";
import type {SavedDesign} from "@/lib/design-library";
import Viewport from "./viewport";
import {LandingAssemblyClock} from "@/lib/assembly";
import type {BuildModel,Recipe} from "@/lib/models";

const relative=(iso:string)=>{const minutes=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));if(minutes<1)return "just now";if(minutes<60)return `${minutes} min ago`;const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;const days=Math.round(hours/24);return days===1?"yesterday":`${days} days ago`;};
export default function Landing({children,onPlay,onChoose,onEdit,model,designs=[],onOpenSaved,onContinueSaved,onDeleteSaved,suspended=false}:{children:ReactNode;onPlay:()=>void;onChoose:(recipe:Recipe)=>void;onEdit:()=>void;model:BuildModel;designs?:SavedDesign[];onOpenSaved?:(design:SavedDesign)=>void;onContinueSaved?:(design:SavedDesign)=>void;onDeleteSaved?:(id:string)=>void;suspended?:boolean}){
 const [paused,setPaused]=useState(false),[done,setDone]=useState(false),[changing,setChanging]=useState(false),clock=useRef(new LandingAssemblyClock()),screen=useRef<HTMLDivElement>(null),choiceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync=()=>{clock.current.reduced=preference.matches;setPaused(preference.matches);clock.current.paused=preference.matches;clock.current.reset();};sync();preference.addEventListener("change",sync);
  return()=>preference.removeEventListener("change",sync);
 },[]);
 useEffect(()=>{clock.current.reset();setDone(false);setChanging(false);},[model.pieces]);
 useEffect(()=>()=>{if(choiceTimer.current)clearTimeout(choiceTimer.current);},[]);
 const readTime=useCallback(()=>clock.current.tick(performance.now()),[]);
 // A click on the film opens the studio; a drag still orbits the model.
 const press=useRef<{x:number;y:number}|null>(null);
 const onFilmDown=(e:React.PointerEvent)=>{press.current={x:e.clientX,y:e.clientY};};
 const onFilmUp=(e:React.PointerEvent)=>{const start=press.current;press.current=null;if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6)onEdit();};
 const onFrame=useCallback(()=>{if(screen.current)screen.current.style.opacity=String(clock.current.opacity);const finished=clock.current.done;setDone(current=>current===finished?current:finished);},[]);
 // One control, like the studio: pause and resume while the bricks fly in, replay once they have landed.
 function replay(){clock.current.reduced=false;clock.current.reset();setDone(false);setPaused(false);clock.current.paused=false;}
 function toggle(){if(clock.current.done){replay();return;}const next=!paused;setPaused(next);clock.current.paused=next;clock.current.reduced=false;clock.current.resume();}
 function choose(recipe:Recipe){if(choiceTimer.current)clearTimeout(choiceTimer.current);if(recipe===model.recipe){setChanging(false);return;}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){onChoose(recipe);return;}setChanging(true);choiceTimer.current=setTimeout(()=>{choiceTimer.current=null;onChoose(recipe);},160);}
 return <section className="creation-landing landing-with-film designs-first" aria-label="Explore brick designs">
  <div className={`landing-film ${changing?"is-changing":""}`} role="group" aria-label={`Assembly animation of ${model.name}`}>
   <div className="landing-film-canvas is-clickable" ref={screen} onPointerDown={onFilmDown} onPointerUp={onFilmUp} role="link" aria-label={`Open ${model.name} in the studio`}><Viewport pieces={model.pieces} length={model.length} width={model.width} height={model.height} modelKey={model.name+"-landing"} suspended={suspended} explode={0} stage={100000} selected={null} view="perspective" reset={0} rotate={false} onPick={()=>{}} assembly={{time:readTime,onFrame,sweep:true}} presentation/></div>
   <div className="landing-film-caption"><div><span>{model.pieces.length.toLocaleString()} PIECES</span><h1><button type="button" className="landing-title-link" onClick={onEdit}>{model.name}</button></h1></div><div className="landing-film-controls"><button onClick={toggle} aria-label={done?"Play the assembly again":paused?"Resume assembly":"Pause assembly"} aria-pressed={paused&&!done}>{done||paused?<Play size={18}/>:<Pause size={18}/>}</button><button onClick={replay} aria-label="Replay the assembly from the start"><RotateCcw size={18}/></button><button onClick={onPlay} aria-label="Open in the studio with the assembly playing"><Maximize2 size={18}/></button></div></div>
  </div>
  <div className="design-quick-picks"><div role="group" aria-label="Preview a starting design">{([['bridge','Golden Gate'],['castle','Neuschwanstein'],['lighthouse','Cape Hatteras'],['rocket','Saturn V']] as const).map(([id,label])=><button key={id} aria-pressed={model.recipe===id} onClick={()=>choose(id)}>{label}</button>)}</div><button className="open-design" onClick={onEdit}>Open studio<ArrowRight size={15}/></button></div>
  <div className="landing-input">{children}</div>
  {designs.length>0&&<div className="your-designs" aria-label="Your designs"><div className="your-designs-head"><span>YOUR DESIGNS</span><small>Saved in this browser · drafts included</small></div><div className="your-designs-list">{designs.map(d=><article key={d.id} className={d.status==="draft"?"is-draft":""}><div className="your-design-meta"><strong>{d.name}</strong><span>{d.pieceCount.toLocaleString()} pieces · {d.status==="draft"?"In progress":"Saved"} · {relative(d.updatedAt)}</span></div><div className="your-design-actions"><button onClick={()=>onOpenSaved?.(d)}><FolderOpen size={14}/>Open</button><button onClick={()=>onContinueSaved?.(d)}><Sparkles size={14}/>Continue with AI</button><button className="delete" aria-label={`Delete ${d.name}`} onClick={()=>onDeleteSaved?.(d.id)}><Trash2 size={14}/></button></div></article>)}</div></div>}
 </section>;
}
