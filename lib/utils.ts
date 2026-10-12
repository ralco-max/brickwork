import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Sentence ends: terminal punctuation (plus closing quotes/brackets) followed by a space and a
// capital, digit or opening quote. Titles and initials ("St. Louis", "U.S. Capitol") are not ends.
// Inputs are untrusted (imports, shares, judge output), so both scans stay linear: a punctuation run
// always matches whole (the lookahead is optional and checked in code) instead of being re-tried and
// backtracked from every character of "......", and abbreviations are tested on a short tail only.
const SENTENCE_END=/[.!?…]+["'”’)\]]*(?=(\s+["'“‘(\[]?[A-Z0-9])?)/g,ABBREVIATION=/(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Ft|No|Jr|Sr|vs|approx|e\.g|i\.e|U\.S|U\.K)\.$/,TRAILING=/[\s,;:(\[“‘"'–—-]/;
// Same result as replacing every whitespace run with one space, but single spaces (most of any text) are not rewritten.
const squash=(text:unknown)=>String(text??"").replace(/\s{2,}|[^\S ]/g," ").trim();
export function splitSentences(text:string):string[]{
 const t=squash(text),out:string[]=[];let start=0;
 // The longest abbreviation is 7 characters, so in a 12-character tail ^ can only match a real sentence start.
 for(const match of t.matchAll(SENTENCE_END)){if(match[1]===undefined)continue;const end=match.index+match[0].length;if(match[0]==="."&&ABBREVIATION.test(t.slice(Math.max(start,end-12),end)))continue;out.push(t.slice(start,end).trim());start=end;}
 const rest=t.slice(start).trim();if(rest)out.push(rest);
 return out;
}
// Shorten owner-facing text without ever stopping mid-word: whole sentences when they carry
// enough of the text, otherwise the last whole word plus "…". Whitespace is normalized.
export function clipSentence(text:string,max:number):string{
 // A kept sentence ends by max and is confirmed by the next 3 characters (space, opener, capital), so only
 // that much is ever read: a growing raw prefix is normalized until it holds them, never the whole input.
 const raw=String(text??"");let t="";for(let n=Math.max(64,max*2)||64;;n*=2){t=squash(raw.slice(0,n));if(n>=raw.length||t.length>max+3)break;}
 if(t.length<=max)return t;if(max<1)return "";
 let whole="";for(const s of splitSentences(t.slice(0,max+3))){const next=whole?`${whole} ${s}`:s;if(next.length>max)break;whole=next;}
 if(whole.length>=max*.4)return whole;
 const head=t.slice(0,max-1),space=t[max-1]===" "?head.length:head.lastIndexOf(" ");
 let cut=space>0?head.slice(0,space):head,k=cut.length;while(k>0&&TRAILING.test(cut[k-1]))k--;cut=cut.slice(0,k);
 return /[.!?…]$/.test(cut)?cut:`${cut}…`;
}
