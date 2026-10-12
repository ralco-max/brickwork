import type {BuildModel} from "./models";
import {renderReviewViews} from "./render-review";
import {SHARE_IMAGE_WIDTH,SHARE_IMAGE_HEIGHT} from "./share";

// The server checks uploads against the same size, so it is defined once in lib/share.
export {SHARE_IMAGE_WIDTH,SHARE_IMAGE_HEIGHT};

function load(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error("Image failed to load."));image.src=src;});}

/** Split a title into at most `lines` lines that fit `width`, ending with an ellipsis if cut. */
export function wrapTitle(text:string,width:number,measure:(s:string)=>number,lines=2){
 const out:string[]=[];
 for(const word of text.trim().split(/\s+/).filter(Boolean)){
  const last=out.at(-1),joined=last===undefined?word:`${last} ${word}`;
  if(last!==undefined&&measure(joined)<=width)out[out.length-1]=joined;else out.push(word);
 }
 if(out.length<=lines&&out.every(line=>measure(line)<=width))return out;
 let tail=out.slice(lines-1).join(" ");
 // Drop whole words first; cut inside a word only when one word alone is too wide.
 while(tail.length>1&&measure(`${tail}…`)>width)tail=/\s/.test(tail)?tail.replace(/\s+\S*$/,""):tail.slice(0,-1);
 return [...out.slice(0,lines-1),`${tail.trimEnd()}…`];
}

/** A 1200×630 link-preview card: the hero render beside the name, piece count and brand. */
export async function renderShareImage(model:BuildModel):Promise<string>{
 const views=await renderReviewViews(model),[hero,logo]=await Promise.all([load(views[1]),load("/bricks-logo.png").catch(()=>null)]);
 const canvas=document.createElement("canvas");canvas.width=SHARE_IMAGE_WIDTH;canvas.height=SHARE_IMAGE_HEIGHT;
 const g=canvas.getContext("2d");if(!g)throw Error("This browser cannot create a preview image.");
 g.fillStyle="#e9edf2";g.fillRect(0,0,SHARE_IMAGE_WIDTH,SHARE_IMAGE_HEIGHT);
 // The render's own background matches the card, so the model sits on one continuous field.
 const size=SHARE_IMAGE_HEIGHT;g.drawImage(hero,SHARE_IMAGE_WIDTH-size-10,0,size,size);
 const left=64,width=SHARE_IMAGE_WIDTH-size-left-24;
 if(logo){g.drawImage(logo,left,56,64,64);}
 g.fillStyle="#1f2933";g.font="600 30px system-ui,-apple-system,Segoe UI,sans-serif";g.fillText("Bricks",left+(logo?80:0),98);
 g.font="700 52px system-ui,-apple-system,Segoe UI,sans-serif";g.fillStyle="#111827";
 const title=wrapTitle(model.name||"Untitled creation",width,s=>g.measureText(s).width,3);
 title.forEach((line,i)=>g.fillText(line,left,250+i*62));
 g.font="500 30px system-ui,-apple-system,Segoe UI,sans-serif";g.fillStyle="#4b5563";
 g.fillText(`${model.pieces.length.toLocaleString()} pieces`,left,250+title.length*62+28);
 g.font="600 24px system-ui,-apple-system,Segoe UI,sans-serif";g.fillStyle="#c2410c";g.fillText("Open it, remix it, build it →",left,560);
 return canvas.toDataURL("image/jpeg",.86);
}
