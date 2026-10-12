import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Sentence ends: terminal punctuation (plus closing quotes/brackets) followed by a space and a
// capital, digit or opening quote. Titles and initials ("St. Louis", "U.S. Capitol") are not ends.
const SENTENCE_END=/[.!?…]+["'”’)\]]*(?=\s+["'“‘(\[]?[A-Z0-9])/g,ABBREVIATION=/(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Ft|No|Jr|Sr|vs|approx|e\.g|i\.e|U\.S|U\.K)\.$/;
export function splitSentences(text:string):string[]{
 const t=String(text??"").replace(/\s+/g," ").trim(),out:string[]=[];let start=0;
 for(const match of t.matchAll(SENTENCE_END)){const end=match.index+match[0].length;if(match[0]==="."&&ABBREVIATION.test(t.slice(start,end)))continue;out.push(t.slice(start,end).trim());start=end;}
 const rest=t.slice(start).trim();if(rest)out.push(rest);
 return out;
}
// Shorten owner-facing text without ever stopping mid-word: whole sentences when they carry
// enough of the text, otherwise the last whole word plus "…". Whitespace is normalized.
export function clipSentence(text:string,max:number):string{
 const t=String(text??"").replace(/\s+/g," ").trim();if(t.length<=max)return t;if(max<1)return "";
 let whole="";for(const s of splitSentences(t)){const next=whole?`${whole} ${s}`:s;if(next.length>max)break;whole=next;}
 if(whole.length>=max*.4)return whole;
 const head=t.slice(0,max-1),space=t[max-1]===" "?head.length:head.lastIndexOf(" ");
 const cut=(space>0?head.slice(0,space):head).replace(/[\s,;:(\[“‘"'–—-]+$/,"");
 return /[.!?…]$/.test(cut)?cut:`${cut}…`;
}
