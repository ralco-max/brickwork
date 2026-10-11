"use client";
import {useId} from "react";
import {Type} from "lucide-react";
import {signMetrics} from "@/lib/brick-lettering";

export default function SignInput({text,onChange,maxWidth,maxDepth,maxHeight,disabled=false}:{text:string;onChange:(text:string)=>void;maxWidth:number;maxDepth:number;maxHeight:number;disabled?:boolean}){
 const id=useId();let help="Up to 12 characters, built as block capitals. Use the exact wording you want on the building.",error="";
 if(text.trim())try{
  const size=signMetrics(text);help=`${size.width} studs wide × ${size.height} plates tall. The builder places these exact letters on a contrasting, supported sign.`;
  if(size.width>Math.max(maxWidth,maxDepth)||size.height>maxHeight)error="This sign needs more room. Choose a larger scale or shorten the wording.";
 }catch(e){error=e instanceof Error?e.message:"Use letters, numbers, spaces or simple punctuation.";}
 return <div className="sign-input"><label htmlFor={id}><Type size={15}/>Exact sign text <span>Optional</span></label><input id={id} value={text} maxLength={12} disabled={disabled} onChange={e=>onChange(e.target.value.toUpperCase())} placeholder="SKYMARK" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={`${id}-help`}/><p id={`${id}-help`} className={error?"sign-input-error":""}>{error||help}</p></div>;
}
