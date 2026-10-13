import {COLORS,PARTS} from "./bridge";
import type {ColorKey} from "./bridge";
import {SIGN_FACES,SIGN_TEXT_PATTERN,signMetrics} from "./brick-lettering";
import {partColors} from "./part-colors";
import {fittedElement} from "./part-catalog";
import {colorFinish,SKIN_COLORS} from "./colors";
import {pieceCells,pieceClearance,piecesIntersect} from "./part-spatial";
import {shapeSchema,expandShapes,explicitPiece,isExplicit,wheelPiece,wheelPart,compileScene,expandCompactHeader,expandCompactShape,compactShapeSchema} from "./generated-scene";
import type {GeneratedScene,Shape} from "./generated-scene";
import {nearestColor,hexRgb,rgbLab,supportLoosePieces,voxelKey} from "./models";
import type {BuildModel} from "./models";
import {emptyManual} from "./design-project";
import type {DesignBrief,ManualEdits} from "./design-project";

// A paid design is too expensive to throw away over one shape the validator rejects. repairScene makes the
// smallest change that lets validateScene accept the scene and reports each one in plain words, so the user
// sees it and a repair pass can be told what was moved. It throws only when nothing usable came back.
// Not repaired here: the 4M-evaluation and 200k-cell complexity caps, which need a redesign.
const INCOMPLETE="The generator returned an incomplete design. Try again; your current build is safe.";
const LIMIT={x:80,y:160,z:80},AXES=["x","y","z"] as const;
type Vec={x:number;y:number;z:number};
const num=(v:unknown,fallback=0)=>typeof v==="number"&&Number.isFinite(v)?v:fallback;
const vec=(v:unknown):Vec=>{const o=(Array.isArray(v)?{x:v[0],y:v[1],z:v[2]}:v&&typeof v==="object"?v:{}) as Record<string,unknown>;return {x:Math.min(80,Math.max(0,num(o.x))),y:Math.min(160,Math.max(0,num(o.y))),z:Math.min(80,Math.max(0,num(o.z)))};};
const str=(v:unknown,max:number)=>typeof v==="string"&&v.trim()?v.trim().slice(0,max):undefined;
const colorOf=(v:unknown):ColorKey|undefined=>{
 if(typeof v!=="string")return undefined;const t=v.trim().toLowerCase();if(Object.hasOwn(COLORS,t))return t as ColorKey;
 if(/^#[0-9a-f]{6}$/.test(t))return nearestColor(...hexRgb(t));
 return (Object.keys(COLORS) as ColorKey[]).find(k=>COLORS[k].name.toLowerCase()===t);
};
const lightness=(c:ColorKey)=>rgbLab(...hexRgb(COLORS[c].hex))[0];
// The nearest colour a part is made in. Glass stays glass and metal stays metal when the part comes in such a colour.
const madeIn=(color:ColorKey,listed:readonly ColorKey[])=>{if(listed.includes(color))return color;const kind=colorFinish(color).kind,same=listed.filter(c=>colorFinish(c).kind===kind);return nearestColor(...hexRgb(COLORS[color].hex),same.length?same:listed);};
const quoted=(s:Shape)=>`“${s.label}”`;
// A shape the schema rejects is rebuilt field by field (wire-format or full-form keys) before giving up on it.
function coerceShape(raw:unknown,i:number):Shape|null{
 if(!raw||typeof raw!=="object")return null;
 const wire=raw as Record<string,unknown>;
 if("k" in wire){const parsed=compactShapeSchema.safeParse(wire);if(parsed.success){try{return expandCompactShape(parsed.data);}catch{}}}
 const s:Record<string,unknown>="k" in wire?{id:wire.i,component:wire.c,label:wire.l,kind:wire.k,operation:wire.o,axis:wire.a,color:wire.col,position:wire.p,size:wire.s,end:wire.e,radius:wire.r,text:wire.txt,face:wire.face,background:wire.bg,...(wire.k==="minifig"?{skin:wire.pid}:{part:wire.pid}),repeat:Array.isArray(wire.rep)?{count:wire.rep[0],offset:wire.rep.slice(1)}:undefined}:wire;
 const first=shapeSchema.safeParse(s);if(first.success)return first.data;
 const kind=shapeSchema.shape.kind.safeParse(s.kind);if(!kind.success)return null;
 const rep=s.repeat&&typeof s.repeat==="object"?s.repeat as Record<string,unknown>:null,count=Math.min(32,Math.max(1,Math.round(num(rep?.count,1))));
 const candidate={id:str(s.id,80),component:str(s.component,80),label:str(s.label,80)||str(s.id,80)||`${kind.data} ${i+1}`,kind:kind.data,operation:s.operation==="subtract"?"subtract":"add",...(["x","y","z"].includes(String(s.axis))?{axis:s.axis}:{}),color:colorOf(s.color)||"gray",position:vec(s.position),size:vec(s.size),end:vec(s.end),radius:Math.min(12,Math.max(.5,num(s.radius,1))),...(count>1?{repeat:{count,offset:vec(rep?.offset)}}:{}),part:str(s.part,32)??null,text:str(s.text,12)??null,face:(SIGN_FACES as readonly unknown[]).includes(s.face)?s.face:null,background:colorOf(s.background)??null,skin:colorOf(s.skin)??null};
 const second=shapeSchema.safeParse(candidate);return second.success?second.data:null;
}
const at=(s:Shape,i:number):Shape=>{const o=s.repeat?.offset||{x:0,y:0,z:0},shift=(p:Vec)=>({x:p.x+i*o.x,y:p.y+i*o.y,z:p.z+i*o.z});return {...s,position:shift(s.position),end:s.kind==="beam"||s.kind==="lean"?shift(s.end):s.end};};
// Where an instance ends on each axis: the far corner of its occupied cells, or its endpoints for members.
function reach(s:Shape):Vec{
 if(isExplicit(s)){const p=explicitPiece(s);return {x:p.x+p.w,y:p.y+p.h,z:p.z+p.d};}
 if(s.kind==="wheel")return s.position;
 if(s.kind==="beam"||s.kind==="lean")return {x:Math.max(s.position.x,s.end.x),y:Math.max(s.position.y,s.end.y),z:Math.max(s.position.z,s.end.z)};
 if(Math.min(s.size.x,s.size.y,s.size.z)<=0)return {x:0,y:0,z:0};
 return {x:s.position.x+s.size.x,y:s.position.y+s.size.y,z:s.position.z+s.size.z};
}
const fits=(s:Shape,d:Vec)=>{const r=reach(s);return AXES.every(a=>r[a]<=d[a]);};
const list=(items:string[])=>items.length>3?`${items.slice(0,3).join(", ")} and ${items.length-3} more`:items.join(", ");

// carried: the IDs (or labels) of shapes a revision kept unchanged from the saved design. Their colours, glass and skin
// were accepted when that design was made, and which colours a part comes in is source data a refresh can change, so
// they are never recoloured here (validateScene exempts them from the fresh colour check the same way).
export function repairScene(raw:unknown,brief?:Partial<Pick<DesignBrief,"maxWidth"|"maxDepth"|"maxHeight">>,carried?:ReadonlySet<string>):{scene:GeneratedScene;corrections:string[]}{
 let data=raw;
 if(typeof data==="string"){try{data=JSON.parse(data);}catch{throw Error(INCOMPLETE);}}
 if(!data||typeof data!=="object"||Array.isArray(data))throw Error(INCOMPLETE);
 const o=data as Record<string,unknown>,wire=Array.isArray(o.sh)&&!Array.isArray(o.shapes),input=(wire?o.sh:o.shapes) as unknown[]|undefined;
 if(!Array.isArray(input)||!input.length)throw Error("The generated draft is empty. Try again.");
 const corrections:string[]=[],note=(m:string)=>{if(!corrections.includes(m))corrections.push(m);};
 const header=wire?expandCompactHeader(o):{name:str(o.name,80)||"Untitled design",description:typeof o.description==="string"?o.description:"",...(Array.isArray(o.signature)?{signature:o.signature.filter(x=>typeof x==="string"&&x.trim()).map(x=>String(x).trim().slice(0,80)).slice(0,4)}:{}),dimensions:vec(o.dimensions),...(o.catalogVersion===1?{catalogVersion:1 as const}:{})};
 const description=header.description.length>500?header.description.slice(0,500).replace(/\s+\S*$/,""):header.description;
 const declared=(wire?header.dimensions:o.dimensions) as Record<string,unknown>|undefined,dims:Vec={x:0,y:0,z:0};
 for(const a of AXES)dims[a]=Math.min(LIMIT[a],Math.max(8,Math.ceil(num(declared?.[a],8))));
 if(AXES.some(a=>dims[a]!==declared?.[a]))note(`Set the build area to whole studs within the limits: ${dims.x} × ${dims.z} studs, ${dims.y} plates.`);

 let shapes=input.map(coerceShape).filter((s):s is Shape=>s!==null);
 if(shapes.length<input.length)note(`Dropped ${input.length-shapes.length} unreadable shape${input.length-shapes.length>1?"s":""}.`);
 if(shapes.length>240){note(`Kept the first 240 of ${shapes.length} shapes.`);shapes=shapes.slice(0,240);}
 const ids=new Set<string>();
 shapes=shapes.map(s=>{if(!s.id)return s;let id=s.id;for(let n=2;ids.has(id);n++)id=`${s.id.slice(0,72)}-${n}`;ids.add(id);if(id!==s.id)note(`Renamed a repeated shape ID to “${id}”.`);return id===s.id?s:{...s,id};});

 // Real elements and signs: fix what the validator would reject about the element itself.
 const snapped:string[]=[];
 shapes=shapes.flatMap(s=>{
  // A wheel shape is a real wheel too: the part its size selects must come in its colour.
  const saved=Boolean(carried?.has(s.id||s.label));
  if(s.kind==="wheel"&&s.operation==="add"){if(saved)return [s];const part=wheelPart(s),color=madeIn(s.color,partColors(part));if(color===s.color)return [s];note(`Changed ${quoted(s)} (wheel ${part}) from ${s.color} to ${color}, the nearest colour it is made in.`);return [{...s,color}];}
  if(!isExplicit(s)&&s.kind!=="text")return [s];
  if(s.operation!=="add"){note(`Removed ${quoted(s)}: a ${s.kind==="text"?"sign":s.kind==="minifig"?"minifigure":"catalog part"} cannot carve space; remove it by its shape ID instead.`);return [];}
  if(s.kind==="part"&&(!s.part||!Object.hasOwn(PARTS,s.part))){note(`Removed ${quoted(s)}: part ${s.part||"(none)"} is not in the catalog.`);return [];}
  let next=s;
  if(!AXES.every(a=>Number.isInteger(s.position[a]))){next={...next,position:{x:Math.round(s.position.x),y:Math.round(s.position.y),z:Math.round(s.position.z)}};snapped.push(quoted(s));}
  if(s.kind==="part"&&!saved){
   const listed=partColors(s.part!);
   if(!listed.includes(next.color)){
    if(!listed.length){note(`Removed ${quoted(s)}: part ${s.part} has no listed colours.`);return [];}
    const color=madeIn(next.color,listed);note(`Changed ${quoted(s)} (part ${s.part}) from ${next.color} to ${color}, the nearest colour it is made in.`);next={...next,color};
   }
   // bg is a frame's glass or door colour; on any other part it means nothing and is dropped.
   const fitted=fittedElement(s.part!);
   if(next.background&&!fitted)next={...next,background:null};
   else if(fitted&&next.background&&!fitted.colors.includes(next.background)){const color=madeIn(next.background,fitted.colors);note(`Changed the ${fitted.name} in ${quoted(s)} from ${next.background} to ${color}, the nearest colour it is made in.`);next={...next,background:color};}
  }
  // Heads and hands come in skin tones only; any other skin falls back to the classic yellow.
  if(s.kind==="minifig"&&!saved&&next.skin&&!SKIN_COLORS.includes(next.skin)){note(`Gave ${quoted(s)} a classic yellow head and hands: ${next.skin} is not a skin tone.`);next={...next,skin:null};}
  if(s.kind==="text"){
   const text=[...(s.text||"")].filter(c=>SIGN_TEXT_PATTERN.test(c)).join("").slice(0,12);
   if(!text.trim()){note(`Removed sign ${quoted(s)}: it has no letters the brick alphabet can spell.`);return [];}
   if(text!==s.text)note(`Spelled sign ${quoted(s)} as “${text.toUpperCase()}” with supported letters.`);
   const face=s.face||"pz",dark=lightness(next.color)<55,background=s.background&&s.background!==next.color?s.background:dark?"white":"black";
   if(background!==s.background)note(`Gave sign ${quoted(s)} a ${background} background so its ${next.color} letters read.`);
   const m=signMetrics(text),across:"x"|"z"=face==="px"||face==="nx"?"z":"x",deep:"x"|"z"=across==="x"?"z":"x",size={x:Math.max(1,Math.round(s.size.x)),y:Math.max(14,Math.round(s.size.y)),z:Math.max(1,Math.round(s.size.z))};
   size[across]=Math.max(size[across],m.width);size[deep]=Math.max(size[deep],2);
   if(AXES.some(a=>size[a]!==s.size[a])&&AXES.some(a=>size[a]>s.size[a]))note(`Enlarged sign ${quoted(s)} to the ${size[across]} × ${size.y} panel its letters need.`);
   next={...next,text,face,background,size};
  }
  return [next];
 });
 if(snapped.length)note(`Snapped ${list(snapped)} to whole studs and plate layers.`);

 // The validator expands repeats and stops at 1,400 instances; later repeats give way first.
 let instances=0;
 shapes=shapes.flatMap(s=>{const count=s.repeat?.count||1,room=1400-instances;if(room<=0){note(`Dropped ${quoted(s)}: the design already repeats 1,400 details.`);return [];}instances+=Math.min(count,room);if(count<=room)return [s];note(`Repeated ${quoted(s)} ${room} times instead of ${count} to stay under 1,400 details.`);return [{...s,repeat:{...s.repeat!,count:room}}];});

 // Grow the build area to hold everything, up to the brief's ceilings.
 const ceiling={x:Math.min(LIMIT.x,brief?.maxWidth??LIMIT.x),y:Math.min(LIMIT.y,brief?.maxHeight??LIMIT.y),z:Math.min(LIMIT.z,brief?.maxDepth??LIMIT.z)},need={x:0,y:0,z:0};
 for(const s of expandShapes(shapes)){const r=reach(s);for(const a of AXES)need[a]=Math.max(need[a],r[a]);}
 const grown={...dims};for(const a of AXES)grown[a]=Math.max(dims[a],Math.min(Math.ceil(need[a]),Math.max(dims[a],ceiling[a])));
 if(AXES.some(a=>grown[a]!==dims[a])){note(`Grew the build area to ${grown.x} × ${grown.z} studs and ${grown.y} plates so every shape fits.`);Object.assign(dims,grown);}

 // Whatever still overflows is brought inside: rigid elements move in, members end at the edge,
 // volumes are trimmed at the edge, and repeats stop at the last copy that fits.
 const trimmed:string[]=[],moved:string[]=[];
 shapes=shapes.flatMap(s=>{
  let next=s;
  if(!fits(at(next,0),dims)){
   if(isExplicit(next)||next.kind==="text"){
    const r=reach(next),position={...next.position};for(const a of AXES)if(r[a]>dims[a])position[a]-=r[a]-dims[a];
    if(AXES.some(a=>position[a]<0)){note(`Removed ${quoted(s)}: it is larger than the build area.`);return [];}
    next={...next,position};moved.push(quoted(s));
   }else if(next.kind==="wheel"||next.kind==="beam"||next.kind==="lean"){
    const cap=(p:Vec)=>({x:Math.min(p.x,dims.x),y:Math.min(p.y,dims.y),z:Math.min(p.z,dims.z)});next={...next,position:cap(next.position),end:next.kind==="wheel"?next.end:cap(next.end)};trimmed.push(quoted(s));
   }else{
    if(AXES.some(a=>next.position[a]>=dims[a])){note(`Removed ${quoted(s)}: it lies outside the build area.`);return [];}
    const size={...next.size};for(const a of AXES)size[a]=Math.min(size[a],dims[a]-next.position[a]);next={...next,size};trimmed.push(quoted(s));
   }
  }
  const count=next.repeat?.count||1;let keep=1;while(keep<count&&fits(at(next,keep),dims))keep++;
  if(keep<count){note(`Repeated ${quoted(s)} ${keep} time${keep>1?"s":""} instead of ${count}; the rest fell outside the build area.`);next={...next,repeat:{...next.repeat!,count:keep}};}
  return [next];
 });
 if(moved.length)note(`Moved ${list(moved)} inward to fit the build area.`);
 if(trimmed.length)note(`Trimmed ${list(trimmed)} at the edge of the build area.`);

 // Real elements cannot share space, nor fill the cells a hung door's handle needs behind its frame: the earlier one
 // stays, the later one (or its later copies) goes.
 const wheels=expandShapes(shapes).filter(s=>s.kind==="wheel"&&s.operation==="add").map(wheelPiece),taken=new Map<string,string>(),handles=new Map<string,string>();
 shapes=shapes.flatMap(s=>{
  if(!isExplicit(s))return [s];
  const count=s.repeat?.count||1,mine=new Set<string>(),clear=new Set<string>();let keep=0,blocker="";
  for(;keep<count;keep++){
   const p=explicitPiece(at(s,keep)),cells=[...pieceCells(p)].map(([x,y,z])=>voxelKey(x,y,z)),pocket=[...pieceClearance(p)].map(([x,y,z])=>voxelKey(x,y,z));
   if(wheels.some(w=>piecesIntersect(p,w))){blocker="a wheel";break;}
   const hit=cells.find(k=>taken.has(k)||mine.has(k)||handles.has(k)||clear.has(k))??pocket.find(k=>taken.has(k)||mine.has(k));
   if(hit!==undefined){blocker=taken.has(hit)?`“${taken.get(hit)}”`:handles.has(hit)?`the door handle of “${handles.get(hit)}”`:"its own copies";break;}
   for(const k of cells)mine.add(k);for(const k of pocket)clear.add(k);
  }
  for(const k of mine)taken.set(k,s.label);for(const k of clear)handles.set(k,s.label);
  if(!keep){note(`Removed ${quoted(s)}: it overlapped ${blocker}.`);return [];}
  if(keep<count){note(`Kept ${keep} of ${count} copies of ${quoted(s)}; the next overlapped ${blocker}.`);return [{...s,repeat:{...s.repeat!,count:keep}}];}
  return [s];
 });
 if(!shapes.length)throw Error("The generated draft is empty. Try again.");
 const {dimensions:_dimensions,description:_description,...rest}=header;
 return {scene:{...rest,name:rest.name.trim()||"Untitled design",description,dimensions:dims,shapes},corrections};
}

// The studio's "Add vertical supports", run after compile: each column is recorded as a manual brick with
// support:true, exactly what that button records, so a saved project recompiles to the same bricks and
// "Remove added supports" still strips them. Pass the options the project compiles with (the brief's hollow
// and smooth finish) or the saved bricks will not match.
export function addSupports(scene:GeneratedScene,options:{manual?:ManualEdits;hollow?:boolean;smooth?:boolean}={}):{model:BuildModel;manual:ManualEdits;added:number}{
 let manual=options.manual||emptyManual(),model=compileScene(scene,{...options,manual}),added=0;
 // A recompile packs around the new columns, so a later pass picks up anything that is still loose.
 for(let pass=0;pass<3;pass++){
  const {pieces}=supportLoosePieces(model.pieces),fresh=pieces.slice(model.pieces.length).filter(p=>p.support);
  if(!fresh.length)break;
  manual={...manual,bricks:[...manual.bricks,...fresh]};model=compileScene(scene,{...options,manual});added+=fresh.length;
 }
 return {model:{...model,generation:scene},manual,added};
}
