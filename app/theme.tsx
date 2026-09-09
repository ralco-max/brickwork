"use client";
import {ThemeProvider as NextThemes,useTheme} from "next-themes";
import {useEffect,useState} from "react";
import {Moon,Sun,SunMoon} from "lucide-react";
import type {ReactNode} from "react";

// Light, dark, or follow the device. The choice is remembered in this browser.
export function ThemeProvider({children}:{children:ReactNode}){
 return <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>{children}</NextThemes>;
}
const ORDER=["system","light","dark"] as const;
export function ThemeToggle(){
 const {theme,resolvedTheme,setTheme}=useTheme(),[mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const current=(ORDER.includes(theme as typeof ORDER[number])?theme:"system") as typeof ORDER[number];
 const next=ORDER[(ORDER.indexOf(current)+1)%ORDER.length];
 const label=current==="system"?`Following your device (${mounted?resolvedTheme:"light"}). Switch to ${next}`:`${current[0].toUpperCase()+current.slice(1)} mode. Switch to ${next}`;
 return <button className="theme-toggle" type="button" onClick={()=>setTheme(next)} title={label} aria-label={label}>{!mounted||current==="system"?<SunMoon size={17}/>:current==="dark"?<Moon size={17}/>:<Sun size={17}/>}</button>;
}
