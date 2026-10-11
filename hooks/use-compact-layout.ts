"use client";

import {useSyncExternalStore} from "react";

export const COMPACT_LAYOUT_QUERY="(max-width: 1024px)";

function subscribe(onChange:()=>void){
 const media=window.matchMedia(COMPACT_LAYOUT_QUERY);
 media.addEventListener("change",onChange);
 return ()=>media.removeEventListener("change",onChange);
}
const snapshot=()=>window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
const serverSnapshot=()=>false;

/** Keep the server and initial hydration layout identical before checking width. */
export function useCompactLayout(){
 return useSyncExternalStore(subscribe,snapshot,serverSnapshot);
}
