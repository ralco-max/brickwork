import {GenerationError} from "./generation-errors";
export class LetteringError extends GenerationError{constructor(message:string){super(message,"INVALID_GEOMETRY");}}
// A small, deliberately fixed brick alphabet. The generator places a sign;
// it never draws the letters. Rows are read top to bottom, with one stud per
// column and two plate layers per row, close to square in physical space.
const GLYPHS:Record<string,string[]>={
 A:["01110","10001","10001","11111","10001","10001","10001"],
 B:["11110","10001","10001","11110","10001","10001","11110"],
 C:["01111","10000","10000","10000","10000","10000","01111"],
 D:["11110","10001","10001","10001","10001","10001","11110"],
 E:["11111","10000","10000","11110","10000","10000","11111"],
 F:["11111","10000","10000","11110","10000","10000","10000"],
 G:["01111","10000","10000","10111","10001","10001","01111"],
 H:["10001","10001","10001","11111","10001","10001","10001"],
 I:["11111","00100","00100","00100","00100","00100","11111"],
 J:["00111","00010","00010","00010","10010","10010","01100"],
 K:["10001","10010","10100","11000","10100","10010","10001"],
 L:["10000","10000","10000","10000","10000","10000","11111"],
 M:["10001","11011","10101","10101","10001","10001","10001"],
 N:["10001","11001","10101","10011","10001","10001","10001"],
 O:["01110","10001","10001","10001","10001","10001","01110"],
 P:["11110","10001","10001","11110","10000","10000","10000"],
 Q:["01110","10001","10001","10001","10101","10010","01101"],
 R:["11110","10001","10001","11110","10100","10010","10001"],
 S:["01111","10000","10000","01110","00001","00001","11110"],
 T:["11111","00100","00100","00100","00100","00100","00100"],
 U:["10001","10001","10001","10001","10001","10001","01110"],
 V:["10001","10001","10001","10001","10001","01010","00100"],
 W:["10001","10001","10001","10101","10101","10101","01010"],
 X:["10001","10001","01010","00100","01010","10001","10001"],
 Y:["10001","10001","01010","00100","00100","00100","00100"],
 Z:["11111","00001","00010","00100","01000","10000","11111"],
 "0":["01110","10001","10011","10101","11001","10001","01110"],
 "1":["00100","01100","00100","00100","00100","00100","01110"],
 "2":["01110","10001","00001","00010","00100","01000","11111"],
 "3":["11110","00001","00001","01110","00001","00001","11110"],
 "4":["00010","00110","01010","10010","11111","00010","00010"],
 "5":["11111","10000","10000","11110","00001","00001","11110"],
 "6":["01110","10000","10000","11110","10001","10001","01110"],
 "7":["11111","00001","00010","00100","01000","01000","01000"],
 "8":["01110","10001","10001","01110","10001","10001","01110"],
 "9":["01110","10001","10001","01111","00001","00001","01110"],
 " ":["000","000","000","000","000","000","000"],
 "&":["01100","10010","10100","01000","10101","10010","01101"],
 ".":["0","0","0","0","0","0","1"],
 "-":["000","000","000","111","000","000","000"],
 "'":["1","1","0","0","0","0","0"],
 "/":["00001","00001","00010","00100","01000","10000","10000"],
};
export const SIGN_TEXT_PATTERN=/^[A-Za-z0-9 &.\-'/]*$/;
export const SIGN_TEXT_HELP="Use up to 12 letters, digits, spaces or & . - ' /. Signs use uppercase brick lettering.";
export const SIGN_FACES=["px","nx","pz","nz"] as const;
export type SignFace=typeof SIGN_FACES[number];
export function normalizedSignText(text:string){
 if(text.length>12||!SIGN_TEXT_PATTERN.test(text))throw new LetteringError(SIGN_TEXT_HELP);
 if(!text.trim())throw new LetteringError("Enter at least one letter, digit or punctuation mark for the sign.");
 return text.toUpperCase();
}
export function signMetrics(text:string){
 const chars=[...normalizedSignText(text)];
 return {width:chars.reduce((sum,c)=>sum+GLYPHS[c][0].length,chars.length-1),height:14};
}
export function signRows(text:string){
 const chars=[...normalizedSignText(text)];
 return Array.from({length:7},(_,row)=>chars.map(c=>GLYPHS[c][row]).join("0"));
}
type Vector={x:number;y:number;z:number};
// Return exact face pixels in local coordinates. Opposite sides reverse the
// world horizontal axis, so every sign reads normally from outside the model.
export function signPixels(text:string,size:Vector,face:SignFace):Vector[]{
 const metrics=signMetrics(text),width=face==="px"||face==="nx"?size.z:size.x,depth=face==="px"||face==="nx"?size.x:size.z;
 if(!Object.values(size).every(n=>Number.isInteger(n)&&n>0))throw new LetteringError("A sign panel must use whole studs and plate layers.");
 if(width<metrics.width||size.y<metrics.height||depth<2)throw new LetteringError(`The sign “${text.toUpperCase()}” needs at least ${metrics.width} studs across, ${metrics.height} plate layers high and 2 studs of backing. Enlarge its panel or shorten the text.`);
 const left=Math.floor((width-metrics.width)/2),bottom=Math.floor((size.y-metrics.height)/2),pixels:Vector[]=[];
 signRows(text).forEach((row,v)=>{for(let u=0;u<row.length;u++){if(row[u]!=="1")continue;for(let plate=0;plate<2;plate++){
  const horizontal=left+u,y=bottom+(6-v)*2+plate;
  pixels.push(face==="pz"?{x:horizontal,y,z:size.z-1}:face==="nz"?{x:size.x-1-horizontal,y,z:0}:face==="px"?{x:size.x-1,y,z:size.z-1-horizontal}:{x:0,y,z:horizontal});
 }}});
 return pixels;
}
