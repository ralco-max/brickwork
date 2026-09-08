"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {ReactNode} from "react";
import {Pause,Play,ArrowRight,Maximize2} from "lucide-react";
import Viewport from "./viewport";
import {LandingAssemblyClock} from "@/lib/assembly";
import type {BuildModel,Recipe} from "@/lib/models";

export default function Landing({children,onPlay,onChoose,onEdit,model,suspended=false}:{children:ReactNode;onPlay:()=>void;onChoose:(recipe:Recipe)=>void;onEdit:()=>void;model:BuildModel;suspended?:boolean}){
 const [paused,setPaused]=useState(false),[changing,setChanging]=useState(false),clock=useRef(new LandingAssemblyClock()),screen=useRef<HTMLDivElement>(null),choiceTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync=()=>{clock.current.reduced=preference.matches;setPaused(preference.matches);clock.current.paused=preference.matches;clock.current.reset();};sync();preference.addEventListener("change",sync);
  return()=>preference.removeEventListener("change",sync);
 },[]);
 useEffect(()=>{clock.current.reset();setChanging(false);},[model.pieces]);
 useEffect(()=>()=>{if(choiceTimer.current)clearTimeout(choiceTimer.current);},[]);
 const readTime=useCallback(()=>clock.current.tick(performance.now()),[]);
 const onFrame=useCallback(()=>{if(screen.current)screen.current.style.opacity=String(clock.current.opacity);},[]);
 function toggle(){const next=!paused;setPaused(next);clock.current.paused=next;clock.current.reduced=false;clock.current.resume();}
 function choose(recipe:Recipe){if(choiceTimer.current)clearTimeout(choiceTimer.current);if(recipe===model.recipe){setChanging(false);return;}if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){onChoose(recipe);return;}setChanging(true);choiceTimer.current=setTimeout(()=>{choiceTimer.current=null;onChoose(recipe);},160);}
 return <section className="creation-landing landing-with-film designs-first" aria-label="Explore brick designs">
  <div className={`landing-film ${changing?"is-changing":""}`} role="group" aria-label={`Assembly animation of ${model.name}`}>
   <div className="landing-film-canvas" ref={screen}><Viewport pieces={model.pieces} length={model.length} width={model.width} height={model.height} modelKey={model.name+"-landing"} suspended={suspended} explode={0} stage={100000} selected={null} view="perspective" reset={0} rotate={false} onPick={()=>{}} assembly={{time:readTime,onFrame}}/></div>
   <div className="landing-film-caption"><div><span>{model.pieces.length.toLocaleString()} PIECES</span><h1>{model.name}</h1></div><div className="landing-film-controls"><button onClick={toggle} aria-label={paused?"Resume assembly animation":"Pause assembly animation"} aria-pressed={paused}>{paused?<Play size={18}/>:<Pause size={18}/>}</button><button onClick={onPlay} aria-label="Open assembly film"><Maximize2 size={18}/></button></div></div>
  </div>
  <div className="design-quick-picks"><div role="group" aria-label="Preview a starting design">{([['bridge','Golden Gate'],['castle','Neuschwanstein'],['lighthouse','Cape Hatteras'],['rocket','Saturn V']] as const).map(([id,label])=><button key={id} aria-pressed={model.recipe===id} onClick={()=>choose(id)}>{label}</button>)}</div><button className="open-design" onClick={onEdit}>Open studio<ArrowRight size={15}/></button></div>
  <div className="landing-input">{children}</div>
 </section>;
}
