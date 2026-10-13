"use client";
import {ThemeProvider as NextThemes,useTheme} from "next-themes";
import {useEffect,useState} from "react";
import {Moon,Sun,SunMoon} from "lucide-react";
import type {ReactNode} from "react";

// Follows the device until the person picks light or dark; the choice is remembered in this browser.
export function ThemeProvider({children}:{children:ReactNode}){
 return <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>{children}</NextThemes>;
}
// Two states: the button always shows the theme on screen and switches to the other one. The first
// choice replaces "follow the device" with an explicit theme, so the first click always changes something.
export function ThemeToggle(){
 const {resolvedTheme,setTheme}=useTheme(),[mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const dark=mounted&&resolvedTheme==="dark",label=!mounted?"Switch theme":dark?"Switch to light mode":"Switch to dark mode";
 return <button className="theme-toggle" type="button" onClick={()=>setTheme(dark?"light":"dark")} title={label} aria-label={label}>{!mounted?<SunMoon size={17}/>:dark?<Moon size={17}/>:<Sun size={17}/>}</button>;
}
