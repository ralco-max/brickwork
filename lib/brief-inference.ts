import type {DesignBrief} from "./design-project";
import {PHOTO_IDEA} from "./idea-draft";

// A first build starts from the idea alone: scope, scale and detail are read from plain cues in the
// wording, locally and for free. The chip under the idea bar shows the guess and changes it in one tap.
export type BriefSize=DesignBrief["size"];
export const SIZE_PRESETS:Record<BriefSize,Pick<DesignBrief,"maxWidth"|"maxDepth"|"maxHeight"|"maxPieces">>={small:{maxWidth:32,maxDepth:32,maxHeight:64,maxPieces:200},medium:{maxWidth:48,maxDepth:48,maxHeight:96,maxPieces:600},large:{maxWidth:80,maxDepth:80,maxHeight:160,maxPieces:4000}};
export const SIZE_NAMES:Record<BriefSize,string>={small:"Desk",medium:"Shelf",large:"Statement"};
export const sizePreset=(size:BriefSize)=>({size,...SIZE_PRESETS[size]});

// Cues are read with proper-noun runs removed first, so "Big Ben", "Town Hall" and "Little Mermaid" say nothing about size or scope.
const SITE=/\b(?:streets?(?:cape)?|blocks?|neighbou?rhoods?|campus|plaza|piazza|town|village|cityscape|skyline|harbou?r|marina|airport|diorama|intersection|crossroads|surroundings|grounds|layout|landscape|whole (?:site|area|place|scene)|entire (?:site|area|place)|(?:the )?area around|row of)\b/;
const SMALL=/\b(?:tiny|small|mini|miniature|micro|little|desk(?:top)?|key ?chain|pocket|bookends?|ornament|figurine|bust|cute)\b/;
const LARGE=/\b(?:huge|giant|large|big|massive|statement|ucs|ultimate|life[- ]?size|epic|grand|centerpiece|centrepiece|display piece|showpiece)\b/;
const SIMPLE=/\b(?:simple|minimal(?:ist)?|clean|basic|blocky|chunky|low[- ]detail)\b/;
const INTRICATE=/\b(?:intricate|ornate|highly detailed|very detailed|every detail|signature|elaborate|museum[- ]quality)\b/;
const PIECES=/(\d{1,3}(?:,\d{3})+|\d+)\s*(?:k\s*)?(?:pieces|pcs|bricks|parts|elements)\b/;

/** The brief a one-step Create starts with. Photos alone mean "this subject, on a shelf"; nothing at all infers nothing. */
export function inferBrief(idea:string,photos:number):Partial<DesignBrief>{
 const words=idea.trim()===PHOTO_IDEA?"":idea.trim(),text=` ${words.replace(/\b[A-Z][\w'’-]*(?=\s+[A-Z])/g,"").toLowerCase()} `;
 if(!words)return photos>0?{scope:"subject",detail:"detailed",...sizePreset("medium")}:{};
 const scope:DesignBrief["scope"]=SITE.test(text)?"site":"subject";
 let size:BriefSize=SMALL.test(text)?"small":LARGE.test(text)?"large":"medium";
 const counted=PIECES.exec(text);let maxPieces:number|undefined;
 if(counted){const n=Number(counted[1].replace(/,/g,""))*(/\dk\s*\w/.test(counted[0])?1000:1);if(Number.isFinite(n)&&n>0){maxPieces=Math.min(16000,Math.max(100,Math.round(n/100)*100));size=maxPieces<=300?"small":maxPieces<=1500?"medium":"large";}}
 const detail:DesignBrief["detail"]=INTRICATE.test(text)?"signature":SIMPLE.test(text)?"balanced":"detailed";
 return {scope,detail,...sizePreset(size),...(maxPieces?{maxPieces}:{})};
}

/** The chip label: "Shelf · ~600 pieces", plus "· whole site" when the scope widens. */
export function briefChip(b:Pick<DesignBrief,"size"|"maxPieces">&{scope?:DesignBrief["scope"]}){
 return `${SIZE_NAMES[b.size]} · ~${b.maxPieces.toLocaleString("en-US")} pieces${b.scope==="site"?" · whole site":""}`;
}
