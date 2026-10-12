"use client";

import {useRef} from "react";
import type {ReactNode} from "react";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {COMPACT_LAYOUT_QUERY,useCompactLayout} from "@/hooks/use-compact-layout";
import {cn} from "@/lib/utils";

export type StudioPanelProps={
 open:boolean;
 onOpenChange:(open:boolean)=>void;
 title:string;
 description?:string;
 className?:string;
 id?:string;
 triggerSelector?:string;
 children:ReactNode;
};

/** Inline desktop content becomes a modal, scroll-locking bottom sheet on mobile. */
export function StudioPanel({open,onOpenChange,title,description,className,id,triggerSelector,children}:StudioPanelProps){
 const compact=useCompactLayout(),returnFocus=useRef<HTMLElement|null>(null);
 if(!compact)return <div id={id} className={className} data-studio-panel="desktop">{children}</div>;
 return <Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent id={id} side="bottom" className={cn("mobile-studio-sheet",className)} data-studio-panel="mobile"
   {...(!description?{"aria-describedby":undefined}:{})}
   onOpenAutoFocus={()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;}}
   onCloseAutoFocus={event=>{
    // A resize keeps the panel open inline; leave desktop focus where it is.
    if(!window.matchMedia(COMPACT_LAYOUT_QUERY).matches)return;
    const trigger=(triggerSelector?document.querySelector<HTMLElement>(triggerSelector):null)||returnFocus.current;
    if(trigger?.isConnected&&!trigger.closest("[inert]")&&!trigger.matches(":disabled")){
     event.preventDefault();trigger.focus({preventScroll:true});
    }
   }}>
   <SheetHeader className="sr-only"><SheetTitle>{title}</SheetTitle>{description&&<SheetDescription>{description}</SheetDescription>}</SheetHeader>
   {children}
  </SheetContent>
 </Sheet>;
}

export default StudioPanel;
