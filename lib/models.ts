import type {GeneratedScene} from "./generated-scene";
import {readProjectMetadata} from "./design-project";
import type {DesignContext,ShoppingState} from "./design-project";
import {COLORS,PARTS,STAGES,generateBridge,auditModel} from "./bridge";
import type {ColorKey,Piece,InventoryRow,PartId,Config} from "./bridge";

export type Recipe = "bridge"|"castle"|"lighthouse"|"house"|"rocket"|"robot"|"car"|"tree"|"cat"|"dog"|"boat"|"skyline"|"blank";
export type Detail = "small"|"medium"|"large";
export type BuildModel={design?:DesignContext;shopping?:ShoppingState;generation?:GeneratedScene;name:string;description:string;source:"recipe"|"mosaic"|"mesh"|"custom";recipe?:Recipe;detail?:Detail;primary?:ColorKey;accent?:ColorKey;bridgeConfig?:Config;pieces:Piece[];inventory:InventoryRow[];length:number;width:number;height:number;stages:{title:string;text:string}[];};
export const RECIPES:{id:Recipe;name:string;prompt:string;color:ColorKey;description:string}[]=[
 {id:"bridge",name:"Golden Gate",prompt:"The Golden Gate Bridge in red",color:"red",description:"The original brick-built landmark"},
 {id:"castle",name:"Castle",prompt:"A gray medieval castle with blue roofs",color:"gray",description:"Four towers, battlements and a central keep"},
 {id:"lighthouse",name:"Lighthouse",prompt:"A red and white coastal lighthouse",color:"red",description:"A striped tower and lantern room"},
 {id:"house",name:"Cottage",prompt:"A tan cottage with a red roof",color:"tan",description:"A pitched roof, front door and windows"},
 {id:"rocket",name:"Rocket",prompt:"A white rocket with red fins",color:"white",description:"A space-age rocket ready for display"},
 {id:"robot",name:"Robot",prompt:"A blue robot with yellow eyes",color:"blue",description:"A friendly companion with blocky arms"},
 {id:"car",name:"Sports car",prompt:"A red sports car with a black roof",color:"red",description:"A sculptural car with brick-built wheels"},
 {id:"tree",name:"Tree",prompt:"A green tree with a brown trunk",color:"green",description:"A layered canopy on a display base"},
 {id:"cat",name:"Cat",prompt:"An orange cat with white paws",color:"orange",description:"Pointed ears, a long tail and four paws"},
 {id:"dog",name:"Dog",prompt:"A brown dog with white paws",color:"brown",description:"A blocky pup with floppy ears"},
 {id:"boat",name:"Sailboat",prompt:"A white sailboat with blue sails",color:"white",description:"A shaped hull, tall mast and stepped sail"},
 {id:"skyline",name:"City skyline",prompt:"A blue city skyline with yellow windows",color:"navy",description:"A family of towers at different heights"},
 {id:"blank",name:"Blank canvas",prompt:"Start with a blank canvas",color:"gray",description:"A studded base for your own design"},
];
const defaultNames:Record<Recipe,string>={bridge:"Golden Gate Bridge",castle:"The little kingdom",lighthouse:"Coastal lighthouse",house:"Weekend cottage",rocket:"Mission to the moon",robot:"Your tiny sidekick",car:"Sunday drive",tree:"A little green escape",cat:"Curious cat",dog:"Best friend",boat:"Set sail",skyline:"City after dark",blank:"Untitled build"};
export function inventoryFor(pieces:Piece[]) {const map=new Map<string,InventoryRow>();for(const p of pieces){const key=`${p.part}:${p.color}`,r=map.get(key);if(r)r.quantity++;else map.set(key,{key,part:p.part,color:p.color,quantity:1});}return [...map.values()].sort((a,b)=>b.quantity-a.quantity);}
export function finishModel(pieces:Piece[],meta:Pick<BuildModel,"name"|"description"|"source">&Partial<BuildModel>,keepStages=false):BuildModel {
 const clean=pieces.map((p,id)=>({...p,id}));const maxY=Math.max(1,...clean.map(p=>p.y+p.h));
 let stages=meta.stages||STAGES;
 if(!keepStages){
  const ordered=[...clean].sort((a,b)=>a.y-b.y||a.z-b.z||a.x-b.x),check=auditModel(clean),unsupported=new Set(check.unsupported);
  stages=[];let lastY=-1,count=0;
  for(const p of ordered){if(p.y!==lastY||count>=24){stages.push({title:p.y===0?`Foundation · ${stages.length+1}`:`Layer ${p.y+1} · step ${stages.length+1}`,text:""});count=0;lastY=p.y;}p.stage=stages.length-1;count++;}
  stages.forEach((s,i)=>{const batch=clean.filter(p=>p.stage===i),needs=batch.filter(p=>unsupported.has(p.id)).length;s.text=`Place ${batch.length} pieces at the listed stud coordinates. The view includes all earlier steps. ${needs?`${needs} pieces lack a supported bottom-up placement. Resolve these connections or plan temporary supports before building.`:"These pieces touch the ground or have a stud path through previously placed pieces. Clutch strength and hand access still need a physical test."}`;});
 }

 return {...meta,pieces:clean,inventory:inventoryFor(clean),length:Math.max(1,...clean.map(p=>p.x+p.w)),width:Math.max(1,...clean.map(p=>p.z+p.d)),height:maxY,stages};
}
export type VoxelMap = Map<string,ColorKey>;
export const voxelKey=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export function packVoxels(voxels:VoxelMap):Piece[]{
 const remaining=new Map(voxels),pieces:Piece[]=[],owners=new Map<string,number>();
 const ids:PartId[]=["3007","3001","3003","3035","3034","3020","3022","3005","3023","3024"];
 const options=ids.flatMap(part=>[false,true].map(rotated=>{const p=PARTS[part];return {part,rotated,w:rotated?p.d:p.w,d:rotated?p.w:p.d,h:p.h};}));
 const positions=[...voxels.keys()].map(k=>k.split(",").map(Number)).sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
 const tieLayers=new Set<number>();for(const [x,y,z] of positions)if(y>1&&!voxels.has(voxelKey(x,y-1,z))){tieLayers.add(y);tieLayers.add(y+1);}
 // Brick orientations change by layer to cross seams wherever the shape allows it.
 for(const [x,y,z] of positions){const color=remaining.get(voxelKey(x,y,z));if(!color)continue;
  let best:typeof options[number]|undefined,bestScore=-1;
  for(const p of options){
   // Continuous plate courses let a roof or overhang overlap its supporting walls.
   // Tall wall bricks must end before these courses rather than cutting through them.
   if(p.h>1&&[y,y+1,y+2].some(layer=>tieLayers.has(layer)))continue;

   if(y<2){const stepX=y===0?4:8,stepZ=y===0?8:4,offset=y===0?0:2;const nextX=x<offset?offset:offset+(Math.floor((x-offset)/stepX)+1)*stepX;const nextZ=z<offset?offset:offset+(Math.floor((z-offset)/stepZ)+1)*stepZ;if(p.h!==1||x+p.w>nextX||z+p.d>nextZ)continue;}
   let fits=true;outer:for(let a=0;a<p.w;a++)for(let b=0;b<p.h;b++)for(let c=0;c<p.d;c++)if(remaining.get(voxelKey(x+a,y+b,z+c))!==color){fits=false;break outer;}if(!fits)continue;
   const supports=new Set<number>();for(let a=0;a<p.w;a++)for(let c=0;c<p.d;c++){const below=owners.get(voxelKey(x+a,y-1,z+c));if(below!==undefined)supports.add(below);}
   const score=p.w*p.d*p.h*(1+Math.min(3,Math.max(0,supports.size-1))*.16)+(p.rotated===!!(Math.floor(y/3)%2)?.01:0);
   if(score>bestScore){best=p;bestScore=score;}
  }
  if(best){const p=best,id=pieces.length;pieces.push({id,part:p.part,color,x,y,z,w:p.w,d:p.d,h:p.h,rotated:p.rotated,stage:0});
   for(let a=0;a<p.w;a++)for(let b=0;b<p.h;b++)for(let c=0;c<p.d;c++){const key=voxelKey(x+a,y+b,z+c);remaining.delete(key);owners.set(key,id);}}

 }
 if(pieces.length>16000)throw Error("This model needs too many pieces. Choose a smaller size and try again.");
 return pieces;
}
export function parseIdea(text:string):{recipe:Recipe;color:ColorKey;accent:ColorKey;detail?:Detail;applied:string[]}|{error:string}{
 const t=text.toLowerCase();
 const terms:[Recipe,RegExp][]=[["bridge",/\b(bridge|golden gate)\b/],["lighthouse",/\b(lighthouse|beacon)\b/],["castle",/\b(castle|fortress|palace)\b/],["house",/\b(house|cottage|cabin|home)\b/],["rocket",/\b(rocket|spaceship|spacecraft)\b/],["robot",/\b(robot|droid)\b/],["car",/\b(car|convertible|bmw|roadster|automobile)\b/],["tree",/\b(tree|bonsai|oak)\b/],["cat",/\b(cat|kitten)\b/],["dog",/\b(dog|puppy|pup)\b/],["boat",/\b(boat|sailboat|yacht|ship)\b/],["skyline",/\b(skyline|city|skyscraper)\b/],["blank",/\b(blank|empty)\b/]];
 const hit=terms.find(([,r])=>r.test(t));if(!hit)return {error:"No matching preset."};
 const recipe=hit[0],r=RECIPES.find(r=>r.id===recipe)!;
 const colorWords=[...t.matchAll(/\b(red|orange|blue|navy|black|gray|grey|white|green|tan|yellow|brown|pink)\b/g)].map(m=>(m[1]==="grey"?"gray":m[1]) as ColorKey);
 const color=colorWords[0]||r.color,accent=colorWords[1]||({castle:"navy",house:"red",rocket:"red",robot:"yellow",car:"black",tree:"brown",cat:"white",dog:"white",boat:"blue",skyline:"yellow",lighthouse:"white",bridge:"blue",blank:"white"} as Record<Recipe,ColorKey>)[recipe];
 const detail=/\b(tiny|small|mini|compact)\b/.test(t)?"small":/\b(large|big|huge|display)\b/.test(t)?"large":undefined;
 return {recipe,color,accent,detail,applied:[r.name,`${COLORS[color].name} body`,`${COLORS[accent].name} accents`,...(detail?[`${detail} size`]:[])]};
}
export function generateRecipe(recipe:Recipe,detail:Detail="medium",primary?:ColorKey,accent?:ColorKey,bridgeConfig?:Config):BuildModel{
 if(recipe==="bridge"){const config=bridgeConfig||{size:detail==="small"?"compact":"display",color:"red",water:"blue",landscape:true};const b=generateBridge(config);return finishModel(b.pieces,{name:defaultNames.bridge,description:"The original brick-built suspension bridge",source:"recipe",recipe,detail,primary:config.color,accent:config.water,bridgeConfig:config});}
 const scale=detail==="small"?0.75:detail==="large"?1.25:1,voxels:VoxelMap=new Map();
 const p=primary||RECIPES.find(r=>r.id===recipe)!.color,a=accent||"white";
 const put=(x:number,y:number,z:number,c:ColorKey)=>{if(x>=0&&y>=0&&z>=0)voxels.set(voxelKey(x,y,z),c);};
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:ColorKey)=>{for(let xx=Math.round(x*scale);xx<Math.round((x+w)*scale);xx++)for(let yy=Math.round(y*scale);yy<Math.round((y+h)*scale);yy++)for(let zz=Math.round(z*scale);zz<Math.round((z+d)*scale);zz++)put(xx,yy,zz,c);};
 const erase=(x:number,y:number,z:number,w:number,h:number,d:number)=>{for(let xx=Math.round(x*scale);xx<Math.round((x+w)*scale);xx++)for(let yy=Math.round(y*scale);yy<Math.round((y+h)*scale);yy++)for(let zz=Math.round(z*scale);zz<Math.round((z+d)*scale);zz++)voxels.delete(voxelKey(xx,yy,zz));};
 const ellipse=(cx:number,y:number,cz:number,rx:number,rz:number,h:number,c:ColorKey)=>{for(let x=Math.floor((cx-rx)*scale);x<Math.ceil((cx+rx)*scale);x++)for(let z=Math.floor((cz-rz)*scale);z<Math.ceil((cz+rz)*scale);z++)if(((x+.5-cx*scale)/(rx*scale))**2+((z+.5-cz*scale)/(rz*scale))**2<=1)for(let yy=Math.round(y*scale);yy<Math.round((y+h)*scale);yy++)put(x,yy,z,c);};
 const base=(w=32,d=24,c:ColorKey="gray")=>{for(let x=0;x<Math.ceil(w*scale/8)*8;x++)for(let z=0;z<Math.ceil(d*scale/8)*8;z++)for(let y=0;y<Math.round(2*scale);y++)put(x,y,z,c);};
 if(recipe==="castle"){
  base(36,28,"green");box(3,2,3,30,15,3,p);box(3,2,22,30,15,3,p);box(3,2,3,3,15,22,p);box(30,2,3,3,15,22,p);
  erase(15,2,22,6,11,3);box(13,2,7,10,26,12,p);box(17,2,18,3,7,1,"brown");
  for(const x of [3,27])for(const z of [3,19]){box(x,2,z,6,22,6,p);for(let level=0;level<5;level++)box(x-1+level*.5,24+level*2,z-1+level*.5,8-level,2,8-level,a);}
  for(let x=7;x<28;x+=4){box(x,17,3,2,3,3,p);box(x,17,22,2,3,3,p);}for(let z=8;z<20;z+=4){box(3,17,z,3,3,2,p);box(30,17,z,3,3,2,p);}for(let i=0;i<5;i++)box(12+i,28+i*2,6+i,12-2*i,2,14-2*i,a);
 }else if(recipe==="lighthouse"){
  base(28,24,"blue");ellipse(14,2,12,10,9,2,"tan");ellipse(14,4,12,6,6,3,"gray");
  for(let y=7;y<58;y+=3){const r=5.5-(y-7)/30;ellipse(14,y,12,r,r,3,Math.floor((y-7)/9)%2?a:p);}
  ellipse(14,58,12,6,6,2,"black");ellipse(14,60,12,4,4,8,"yellow");for(let z=9;z<16;z+=6)for(let x=11;x<18;x+=6)box(x,60,z,1,8,1,"black");ellipse(14,68,12,5,5,2,"black");for(let k=0;k<5;k++)ellipse(14,70+k,12,5-k,5-k,1,p);box(13,7,16,2,6,1,"black");
 }else if(recipe==="house"){
  base(32,26,"green");box(4,2,4,24,2,18,"gray");box(5,4,5,22,23,16,p);box(14,4,20,4,12,1,"brown");
  for(const x of [8,21]){box(x,11,20,4,7,1,"navy");box(x,14,20,4,1,1,"white");box(x+1,11,20,1,7,1,"white");}for(let k=0;k<10;k++)box(3,27+k*2,3+k,26,2,20-2*k,a);box(23,27,9,3,18,3,"brown");box(13,2,22,6,1,4,"tan");
 }else if(recipe==="rocket"){
  base(28,24,"gray");ellipse(14,2,12,6,6,3,"black");ellipse(14,5,12,5,5,6,"orange");ellipse(14,11,12,5,5,39,p);ellipse(14,24,12,5,5,3,a);ellipse(14,43,12,5,5,3,a);box(12,33,16,4,5,1,"navy");for(let k=0;k<10;k++)ellipse(14,50+k*2,12,5-k*.5,5-k*.5,2,a);
  for(let y=8;y<25;y+=2){const w=Math.max(1,8-(y-8)/2);box(14-5-w,y,11,w,2,2,a);box(19,y,11,w,2,2,a);box(13,y,12-5-w,2,2,w,a);box(13,y,17,2,2,w,a);}
 }else if(recipe==="robot"){
  base();box(9,2,7,6,4,11,a);box(18,2,7,6,4,11,a);box(10,6,10,4,12,5,"gray");box(19,6,10,4,12,5,"gray");box(8,18,7,18,22,12,p);box(13,40,11,8,3,5,"gray");box(7,43,6,20,17,14,p);box(10,49,19,4,5,1,a);box(20,49,19,4,5,1,a);box(13,45,19,9,2,1,"black");box(3,22,9,5,17,7,p);box(26,22,9,5,17,7,p);box(3,18,9,5,5,7,a);box(26,18,9,5,5,7,a);box(12,25,18,10,8,1,a);box(16,60,11,2,7,2,"gray");box(15,67,10,4,2,4,a);
 }else if(recipe==="car"){
  base(42,22,"gray");box(5,3,5,32,5,12,"black");box(4,8,4,34,6,14,p);box(14,14,5,14,8,12,"navy");box(15,22,5,12,2,12,a);box(3,10,5,2,2,3,"white");box(3,10,14,2,2,3,"white");box(37,10,5,2,2,3,"red");box(37,10,14,2,2,3,"red");
  for(const x of [10,31])for(const z of [3,17])for(let xx=x-4;xx<x+4;xx++)for(let y=2;y<14;y++)if(((xx+.5-x)/4)**2+((y+.5-8)/6)**2<1)box(xx,y,z,1,1,2,"black");for(const x of [9,30])for(const z of [3,18])box(x,6,z,2,4,1,"gray");
 }else if(recipe==="tree"){
  base(32,28,"tan");box(14,2,12,4,29,4,a);for(const [y,r] of [[18,8],[26,12],[35,10],[44,7],[51,4]])ellipse(16,y,14,r,r,9,p);
 }else if(recipe==="cat"||recipe==="dog"){
  base(34,26,"tan");for(const x of [9,23])for(const z of [7,16]){box(x,2,z,4,4,4,a);box(x,6,z,4,9,4,p);}box(8,12,6,20,13,15,p);box(5,24,6,11,14,15,p);box(4,27,10,2,5,7,a);box(4,30,12,1,2,3,"black");box(5,33,8,1,2,2,"black");box(5,33,17,1,2,2,"black");
  if(recipe==="cat"){for(let y=38;y<46;y+=2){box(7,y,6,5-(y-38)/2,2,4,p);box(7,y,17,5-(y-38)/2,2,4,p);}box(27,19,12,3,19,3,p);box(29,34,12,3,4,3,p);}else{box(10,28,4,5,13,3,"brown");box(10,28,20,5,13,3,"brown");box(27,20,12,5,5,3,p);}
 }else if(recipe==="boat"){
  base(42,26,"blue");for(let y=2;y<14;y++)box(8-(y-2)*.45,y,8-(y-2)*.3,26+(y-2)*.8,1,10+(y-2)*.6,p);box(7,14,6,29,2,15,"tan");box(20,16,12,2,42,2,"brown");for(let y=20;y<55;y+=2)box(22,y,12,Math.max(1,18-(y-20)*.5),2,1,a);box(18,53,12,2,4,2,p);
 }else if(recipe==="skyline"){
  base(44,22,"black");const towers=[[3,4,7,10,29],[12,5,8,12,50],[23,3,7,9,38],[33,6,8,11,62]];for(const [x,z,w,d,h] of towers){box(x,2,z,w,h,d,p);for(let y=7;y<h-2;y+=6)for(let xx=x+1;xx<x+w-1;xx+=3)box(xx,y,z+d-1,1,3,1,a);box(x+2,h+2,z+2,w-4,3,d-4,"gray");}box(36,67,10,1,9,1,"gray");
 }else base(32,24,p);
 return finishModel(packVoxels(voxels),{name:defaultNames[recipe],description:RECIPES.find(r=>r.id===recipe)!.description,source:"recipe",recipe,detail,primary:p,accent:a});
}
export function nearestColor(r:number,g:number,b:number):ColorKey {
 let best:ColorKey="white",distance=Infinity;for(const [key,c] of Object.entries(COLORS)){const hex=parseInt(c.hex.slice(1),16),dr=r-(hex>>16),dg=g-((hex>>8)&255),db=b-(hex&255),v=dr*dr*.3+dg*dg*.59+db*db*.11;if(v<distance){distance=v;best=key as ColorKey;}}return best;
}
export function mosaicFromPixels(data:ArrayLike<number>,width:number,height:number,name:string):BuildModel {
 if(width<1||height<1||width>96||height>96||data.length!==width*height*4)throw Error("Invalid image dimensions.");
 const voxels:VoxelMap=new Map();for(let z=0;z<height;z++)for(let x=0;x<width;x++){const i=(z*width+x)*4,alpha=data[i+3]/255,c=nearestColor(data[i]*alpha+255*(1-alpha),data[i+1]*alpha+255*(1-alpha),data[i+2]*alpha+255*(1-alpha));voxels.set(voxelKey(x,0,z),"gray");voxels.set(voxelKey(x,1,z),"gray");voxels.set(voxelKey(x,2,z),c);}
 return finishModel(packVoxels(voxels),{name,description:`${width} × ${height} stud mosaic · 12-color brick palette`,source:"mosaic"});
}
export function intersects(a:Piece,b:Piece){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y&&a.z<b.z+b.d&&a.z+a.d>b.z;}
export function addPiece(pieces:Piece[],part:PartId,color:ColorKey,x:number,y:number,z:number,rotated=false):Piece[]{
 const s=PARTS[part],p:Piece={id:pieces.length,part,color,x,y,z,w:rotated?s.d:s.w,d:rotated?s.w:s.d,h:s.h,rotated,stage:5};
 if(![x,y,z].every(Number.isInteger)||Math.min(x,y,z)<0||x+p.w>192||z+p.d>192||y+p.h>240)throw Error("Place bricks within 192 × 192 studs and 240 plate layers.");
 if(pieces.length>=16000)throw Error("This design has reached the 16,000 piece limit.");
 if(pieces.some(other=>intersects(p,other)))throw Error("That space is occupied. Choose another stud or height.");
 if(pieces.some(other=>other.part.startsWith("306")&&other.y+other.h===y&&x<other.x+other.w&&x+p.w>other.x&&z<other.z+other.d&&z+p.d>other.z))throw Error("This surface is a smooth tile. Replace it with a studded plate before building on it.");
 return [...pieces,p];
}
export function validateProject(raw:unknown):BuildModel{
 if(!raw||typeof raw!=="object")throw Error("Choose a Brickwork project JSON file.");const data=raw as Record<string,unknown>;
 if(!Array.isArray(data.pieces)||data.pieces.length<1||data.pieces.length>16000)throw Error("The project must contain between 1 and 16,000 pieces.");
 const pieces:Piece[]=data.pieces.map((v:unknown,id:number)=>{if(!v||typeof v!=="object")throw Error("Invalid piece.");const p=v as Piece,s=Object.hasOwn(PARTS,p.part)?PARTS[p.part]:null;if(!s||!Object.hasOwn(COLORS,p.color)||![p.x,p.y,p.z].every(n=>Number.isInteger(n)&&n>=0)||typeof p.rotated!=="boolean")throw Error("The project contains an unsupported part or invalid coordinates.");const w=p.rotated?s.d:s.w,d=p.rotated?s.w:s.d;if(p.x+w>192||p.z+d>192||p.y+s.h>240)throw Error("The project exceeds the supported dimensions.");return {id,part:p.part,color:p.color,x:p.x,y:p.y,z:p.z,w,d,h:s.h,rotated:p.rotated,stage:0};});
 const occupied=new Set<string>();for(const p of pieces)for(let x=p.x;x<p.x+p.w;x++)for(let y=p.y;y<p.y+p.h;y++)for(let z=p.z;z<p.z+p.d;z++){const k=voxelKey(x,y,z);if(occupied.has(k))throw Error("The project has overlapping pieces. Repair the file before importing.");occupied.add(k);if(occupied.size>350000)throw Error("The project is too complex. Import a smaller version.");}
 return finishModel(pieces,{name:typeof data.name==="string"?data.name.slice(0,80):"Imported project",description:typeof data.description==="string"?data.description.slice(0,500):"Your editable Brickwork project",source:"custom",...readProjectMetadata(data,pieces)});
}
export function supportLoosePieces(input:Piece[]):{pieces:Piece[];added:number}{
 let pieces=input.map((p,id)=>({...p,id})),added=0;
 for(let pass=0;pass<80;pass++){
  const audit=auditModel(pieces);if(!audit.disconnected.length)break;
  const occupied=new Map<string,Piece>();for(const p of pieces)for(let x=p.x;x<p.x+p.w;x++)for(let z=p.z;z<p.z+p.d;z++)for(let y=p.y;y<p.y+p.h;y++)occupied.set(voxelKey(x,y,z),p);
  let changed=false;
  for(const id of [...audit.disconnected].sort((a,b)=>pieces[a].y-pieces[b].y)){
   const p=pieces[id];if(p.y===0)continue;
   outer:for(let x=p.x;x<p.x+p.w;x++)for(let z=p.z;z<p.z+p.d;z++){
    if(occupied.has(voxelKey(x,p.y-1,z)))continue;let y=p.y-1;
    while(y>=0&&!occupied.has(voxelKey(x,y,z)))y--;
    if(y>=0&&occupied.get(voxelKey(x,y,z))!.part.startsWith("306"))continue;
    y++;while(y<p.y){if(pieces.length>=16000)return {pieces,added};const part:PartId=p.y-y>=3?"3005":"3024",s=PARTS[part];pieces.push({id:pieces.length,part,color:"gray",x,y,z,w:1,d:1,h:s.h,rotated:false,stage:0});y+=s.h;added++;}changed=true;break outer;
   }
   if(changed)break;
  }
  if(!changed)break;
 }
 return {pieces,added};
}
