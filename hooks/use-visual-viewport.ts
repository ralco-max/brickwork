"use client";

import {useEffect} from "react";
import type {CSSProperties} from "react";

const HEIGHT="--visual-viewport-height",TOP="--visual-viewport-top";
const COMPACT_QUERY="(max-width: 1024px)";
type ViewportStyle=CSSProperties&Partial<Record<typeof HEIGHT|typeof TOP,string>>;
export type VisualViewportMetrics={width:number;height:number;offsetTop?:number;scale?:number};

/** Keyboard resizing changes the visual viewport at scale 1; pinch zoom does not
 * resize our layout. The stylesheet's normal viewport sizing takes over then. */
export function visualViewportStyle(metrics?:VisualViewportMetrics):ViewportStyle{
 if(!metrics)return {};
 const {width,height,offsetTop=0,scale=1}=metrics;
 if(![width,height,offsetTop,scale].every(Number.isFinite)||width<=0||width>1024||height<=0||scale<=0||Math.abs(scale-1)>.01)return {};
 const px=(value:number)=>`${Math.round(value*100)/100}px`;
 return {[HEIGHT]:px(height),[TOP]:px(Math.max(0,offsetTop))};
}

// Mounted once by VisualViewportSize, so every dialog/sheet shares one set of
// viewport listeners. Exported separately for deterministic lifecycle tests.
export function trackVisualViewport(win:Window,style:CSSStyleDeclaration){
 const compact=win.matchMedia(COMPACT_QUERY),viewport=win.visualViewport;
 const previous=[HEIGHT,TOP].map(name=>({name,value:style.getPropertyValue(name),priority:style.getPropertyPriority(name)}));
 let frame:number|null=null,stopped=false;
 const update=()=>{
  frame=null;if(stopped)return;
  const measured=visualViewportStyle(compact.matches?{width:win.innerWidth,height:viewport?.height??win.innerHeight,offsetTop:viewport?.offsetTop??0,scale:viewport?.scale??1}:undefined);
  for(const name of [HEIGHT,TOP] as const){
   const value=measured[name];
   if(value===undefined){if(style.getPropertyValue(name))style.removeProperty(name);}
   else if(style.getPropertyValue(name)!==value)style.setProperty(name,value);
  }
 };
 const schedule=()=>{if(!stopped&&frame===null)frame=win.requestAnimationFrame(update);};
 update();
 viewport?.addEventListener("resize",schedule,{passive:true});
 viewport?.addEventListener("scroll",schedule,{passive:true});
 win.addEventListener("resize",schedule,{passive:true});
 compact.addEventListener("change",schedule);
 return()=>{
  stopped=true;if(frame!==null)win.cancelAnimationFrame(frame);
  viewport?.removeEventListener("resize",schedule);
  viewport?.removeEventListener("scroll",schedule);
  win.removeEventListener("resize",schedule);
  compact.removeEventListener("change",schedule);
  for(const {name,value,priority} of previous){if(value)style.setProperty(name,value,priority);else style.removeProperty(name);}
 };
}

/** Mount once inside the root layout. CSS variables inherit through portal roots. */
export function VisualViewportSize(){
 useEffect(()=>trackVisualViewport(window,document.documentElement.style),[]);
 return null;
}
