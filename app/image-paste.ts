"use client";
import {useEffect,useRef} from "react";
import type {RefObject} from "react";

type ClipboardImages=Pick<DataTransfer,"items"|"files">;

/** Read image files supplied by the browser, without fetching pasted URLs or HTML. */
export function clipboardImageFiles(data:ClipboardImages|null):File[]{
 if(!data)return [];
 const files=Array.from(data.items||[]).filter(item=>item.kind==="file"&&item.type.startsWith("image/")).map(item=>item.getAsFile()).filter((file):file is File=>file!==null);
 return [...new Set(files.length?files:Array.from(data.files||[]).filter(file=>file.type.startsWith("image/")))];
}

const handledPastes=new WeakSet<ClipboardEvent>();

/** Claim only image pastes, once, even when attachment and composer scopes overlap. */
export function consumeImagePaste(event:ClipboardEvent,onFiles:(files:File[])=>void,disabled=false):boolean{
 if(disabled||event.defaultPrevented||handledPastes.has(event))return false;
 const files=clipboardImageFiles(event.clipboardData);
 if(!files.length)return false;
 handledPastes.add(event);event.preventDefault();onFiles(files);return true;
}

type ImagePasteOptions={rootRef:RefObject<HTMLElement|null>;pasteTargetId?:string;disabled:boolean;onFiles:(files:File[])=>void};

/** Listen on this composer's elements, never on the document or other mounted dialogs. */
export function useImagePaste({rootRef,pasteTargetId,disabled,onFiles}:ImagePasteOptions){
 const latest=useRef({disabled,onFiles});latest.current={disabled,onFiles};
 useEffect(()=>{
  const root=rootRef.current;if(!root)return;
  const target=pasteTargetId?document.getElementById(pasteTargetId):null;
  const composer=target?.closest("[data-photo-paste-scope], form, .brief-form")||target;
  const scopes=composer&&composer.contains(root)?[composer]:composer?[root,composer]:[root];
  const paste=(event:Event)=>{
   // Radix may retain a closed tab/dialog in the DOM; it cannot own a paste.
   if(root.closest('[hidden], [inert], [aria-hidden="true"]')||!root.getClientRects().length)return;
   consumeImagePaste(event as ClipboardEvent,latest.current.onFiles,latest.current.disabled);
  };
  for(const scope of scopes)scope.addEventListener("paste",paste);
  return()=>{for(const scope of scopes)scope.removeEventListener("paste",paste);};
 },[rootRef,pasteTargetId]);
}
