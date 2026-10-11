import {EXPANDED_PARTS,catalogPart} from "./part-catalog";
import {PARTS,COLORS,studCells,isTile,isSlope,isWheel} from "./bridge";
import type {ColorKey} from "./bridge";
import type {DesignBrief} from "./design-project";
import type {ReferenceSheet} from "./design-research";
import type {GeneratedScene} from "./generated-scene";

type Cell=readonly [number,number,number];
export type GenerationCatalogPart={name:string;w:number;d:number;h:number;family:string;colors:readonly ColorKey[];handedness?:"left"|"right";counterpart?:string;topStuds:readonly Cell[];bottomSockets:readonly Cell[];occupancy:readonly Cell[]};
type Catalog=Readonly<Record<string,GenerationCatalogPart>>;
export type PartSelectionInput={prompt:string;brief?:DesignBrief;research?:ReferenceSheet;previous?:GeneratedScene;feedback?:string[]};
export type ConnectorLayout={cells:Cell[]}|{grids:{x:[number,number];y:number;z:[number,number]}[]};
export type GenerationPart={id:string;name:string;family:string;size:[number,number,number];colors:readonly ColorKey[];topStuds:ConnectorLayout;bottomSockets:ConnectorLayout;handedness?:"left"|"right";counterpart?:string};

// Rectangles are an exact, lossless encoding of connector locations. An arch's
// missing middle and a curved wedge's raised sockets must never become a box.
export function compactConnectors(input:readonly Cell[]):ConnectorLayout{
 const cells=[...new Map(input.map(c=>[c.join(","),c])).values()].sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
 if(cells.length<=12)return {cells};
 const remaining=new Set(cells.map(c=>c.join(","))),grids:{x:[number,number];y:number;z:[number,number]}[]=[];
 for(const [x,y,z] of cells){
  if(!remaining.has(`${x},${y},${z}`))continue;let x1=x,z1=z;
  while(remaining.has(`${x1+1},${y},${z}`))x1++;
  let next=true;while(next){for(let a=x;a<=x1;a++)if(!remaining.has(`${a},${y},${z1+1}`)){next=false;break;}if(next)z1++;}
  for(let a=x;a<=x1;a++)for(let c=z;c<=z1;c++)remaining.delete(`${a},${y},${c}`);
  grids.push({x:[x,x1],y,z:[z,z1]});
 }
 return {grids};
}
const normalized=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
const words=(s:string)=>new Set(normalized(s).match(/[a-z0-9]+/g)?.map(w=>w.length>4&&w.endsWith("s")?w.slice(0,-1):w)||[]);
const intents:[RegExp,string[]][]=[
 [/\b(building|house|cottage|castle|palace|church|terminal|airport|museum|facade|architecture|site)\b/,["arch","slope","curved","panel","support","round"]],
 [/\b(roof|pitched|eaves|shingle)\b/,["slope","curved","wedge"]],
 [/\b(arch|arched|arcade|doorway|aqueduct|viaduct|bridge)\b/,["arch","support","slope"]],
 [/\b(car|vehicle|truck|bus|cockpit|aircraft|airplane|plane|jet|wing|ship|boat|hull)\b/,["curved","wedge","wedge_plate","slope","panel","round"]],
 [/\b(rocket|spaceship|spacecraft|tower|lighthouse|column|dome|rotunda|cylinder)\b/,["round","round_plate","round_tile","curved","slope"]],
 [/\b(animal|character|dog|cat|bird|plant|tree|flower|creature|face|eye|robot|monument)\b/,["curved","round","round_plate","round_tile","wedge","slope"]],
 [/\b(window|glass|wall|fence|railing|balcony)\b/,["panel","support","arch"]],
];
function legacyPart(id:string):GenerationCatalogPart|undefined{
 const p=Object.hasOwn(PARTS,id)?PARTS[id]:undefined;if(!p)return;
 const top=studCells({part:id,w:p.w,d:p.d}).map(([x,z])=>[x,p.h,z] as Cell),bottom:Cell[]=[];
 if(!isWheel(id))for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++)bottom.push([x,0,z]);
 return {...p,family:isWheel(id)?"wheel":isSlope(id)?"slope":isTile(id)?"tile":p.h===1?"plate":"brick",colors:Object.keys(COLORS) as ColorKey[],topStuds:top,bottomSockets:bottom,occupancy:[]};
}
const hasConnectors=(layout:ConnectorLayout)=>"cells" in layout?layout.cells.length>0:layout.grids.length>0;
function entry(id:string,p:GenerationCatalogPart):GenerationPart{
 return {id,name:p.name,family:p.family,size:[p.w,p.h,p.d],colors:p.colors,topStuds:compactConnectors(p.topStuds),bottomSockets:compactConnectors(p.bottomSockets),...(p.handedness?{handedness:p.handedness}:{}),...(p.counterpart?{counterpart:p.counterpart}:{})};
}

// This search is local and deterministic: no extra AI call, whole-catalog prompt
// or fabricated part IDs. Existing explicit pieces are always represented, even
// if a later request has different themes or the normal shortlist is full.
export function buildGenerationPartCatalog(input:PartSelectionInput,catalog:Catalog=EXPANDED_PARTS,limit=40){
 const text=normalized([input.prompt,input.brief?.idea,input.brief?.composition,...(input.brief?.features||[]),input.research?.kind,input.research?.subject,input.research?.summary,input.research?.proportions,...(input.research?.silhouette||[]),...(input.research?.distinctive||[]),...(input.feedback||[])].filter(Boolean).join(" "));
 const query=words(text),requestedIds=new Set(text.match(/\b\d{3,}[a-z]?\b/g)||[]),familyWeight=new Map<string,number>();
 for(const [pattern,families] of intents)if(pattern.test(text))for(const family of families)familyWeight.set(family,(familyWeight.get(family)||0)+3);
 for(const family of [...new Set(Object.values(catalog).map(p=>p.family))])if(words(family.replace(/_/g," ")).size&&[...words(family.replace(/_/g," "))].every(w=>query.has(w)))familyWeight.set(family,(familyWeight.get(family)||0)+8);
 const palette=new Set([...query,...words((input.research?.colors||[]).join(" "))].filter(c=>Object.hasOwn(COLORS,c))),ceiling=input.brief?{x:input.brief.maxWidth,y:input.brief.maxHeight,z:input.brief.maxDepth}:{x:80,y:160,z:80};
 const fits=(p:GenerationCatalogPart)=>p.h<=ceiling.y&&((p.w<=ceiling.x&&p.d<=ceiling.z)||(p.d<=ceiling.x&&p.w<=ceiling.z));
 const usable=(p:GenerationCatalogPart)=>p.colors.length>0&&p.occupancy.length>0&&(p.topStuds.length>0||p.bottomSockets.length>0)&&fits(p);
 const scored=Object.entries(catalog).filter(([,p])=>usable(p)).map(([id,p])=>{
  const tokens=words(p.name),matches=[...tokens].filter(t=>t.length>2&&query.has(t)).length,preferred=palette.size?p.colors.filter(c=>palette.has(c)).length/palette.size:0;
  return {id,p,score:(requestedIds.has(id)?1000:0)+(familyWeight.get(p.family)||0)+matches*2+preferred*3+Math.min(p.colors.length,6)*.15+1/Math.sqrt(p.w*p.d*p.h)};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const chosen=new Map<string,GenerationCatalogPart>(),familyCounts=new Map<string,number>(),cap=Math.min(48,Math.max(24,Math.floor(limit)));
 const include=(id:string,p:GenerationCatalogPart)=>{if(chosen.has(id))return;chosen.set(id,p);familyCounts.set(p.family,(familyCounts.get(p.family)||0)+1);};
 for(const shape of input.previous?.shapes||[]){const value=shape as {kind:string;part?:string|null};if(value.kind!=="part"||!value.part)continue;const p=catalog[value.part]||catalogPart(value.part)||legacyPart(value.part);if(p)include(value.part,p);}
 const includePair=(id:string,p:GenerationCatalogPart)=>{include(id,p);const mate=p.counterpart?catalog[p.counterpart]:undefined;if(mate&&usable(mate)&&chosen.size<cap)include(p.counterpart!,mate);};
 // Explicit requested IDs outrank themes; handed mates are offered together.
 for(const {id,p} of scored)if(requestedIds.has(id)&&chosen.size<cap)includePair(id,p);
 // Seed the relevant families before filling by score, avoiding forty near-
 // identical slopes when the building also needs arches and round columns.
 const families=[...new Set(scored.map(({p})=>p.family))].sort((a,b)=>(familyWeight.get(b)||0)-(familyWeight.get(a)||0)||a.localeCompare(b));
 for(const family of families){if(chosen.size>=cap)break;const candidate=scored.find(c=>c.p.family===family&&!chosen.has(c.id));if(candidate)includePair(candidate.id,candidate.p);}
 while(chosen.size<cap){
  const next=scored.filter(c=>!chosen.has(c.id)).sort((a,b)=>b.score/(1+(familyCounts.get(b.p.family)||0)*.45)-a.score/(1+(familyCounts.get(a.p.family)||0)*.45)||a.id.localeCompare(b.id))[0];
  if(!next)break;includePair(next.id,next.p);
 }
 const parts=[...chosen].map(([id,p])=>entry(id,p)),example=parts.find(p=>!["brick","plate","tile"].includes(p.family)&&hasConnectors(p.bottomSockets))||parts[0];
 return {availableParts:Object.keys(catalog).length,...(example?{placementExample:{note:"Syntax only: choose a position whose actual sockets meet supporting studs, with empty clearance around the real part.",shape:{i:"detail-1",c:"Signature detail",l:example.name.slice(0,80),k:"part",o:"add",a:null,col:example.colors[0],p:[4,2,4],s:example.size,e:null,r:null,rep:null,txt:null,face:"pz",bg:null,pid:example.id}}}:{}),units:"size [width studs,height plates,depth studs]; connectors local [x stud cell,y plate plane,z stud cell]",orientation:"pz is the canonical catalog orientation; px/nz/nx rotate it by 90/180/270 degrees. px/nx swap width and depth. Handedness is intrinsic: rotation does not mirror a part.",connectorEncoding:"cells are exact points. Each grids item includes every integer x and z in its inclusive ranges at the given y. Empty means no connectors; never infer missing studs or sockets.",parts};
}
