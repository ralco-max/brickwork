import type {Piece} from "./bridge";
import {WHEELS} from "./bridge";
import {sceneVoxels,expandShapes,isExplicit,explicitPiece,normalizeScene} from "./generated-scene";
import type {GeneratedScene} from "./generated-scene";
import {voxelKey} from "./models";
import {pieceCells} from "./part-spatial";
import {MAX_VERSIONS} from "./design-project";
import type {DesignVersion,ManualEdits,VisualReview} from "./design-project";
import type {RevisionRegion} from "./revision-region";

// Versions, what changed between them, and which component a tapped or lassoed piece belongs to. Pure, so the
// generator's $0 undo and its "Changed: Awning" line are tested without a browser.

const stable=(value:unknown):string=>Array.isArray(value)?`[${value.map(stable).join(",")}]`:value&&typeof value==="object"?`{${Object.entries(value).filter(([,v])=>v!==undefined&&v!==null).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(",")}}`:JSON.stringify(value)??"null";
const placementKey=(p:Piece)=>`${p.part}:${p.x}:${p.y}:${p.z}:${p.face||(p.rotated?"px":"pz")}`;
const pieceKey=(p:Piece)=>`${placementKey(p)}:${p.color}:${p.legs||""}:${p.skin||""}`;

/** "VaultBands" → "Vault bands", "front_door" → "Front door", "Person3" → "Person 3": a component as people read it. */
export function componentLabel(name:string){
 const words=name.replace(/[_-]+/g," ").replace(/([a-z])([A-Z0-9])/g,"$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1 $2").replace(/\s+/g," ").trim();
 return words?words[0].toUpperCase()+words.slice(1).replace(/\b([A-Z])([a-z]+)/g,(_,a:string,b:string)=>a.toLowerCase()+b):name;
}

// Which component each piece is charged to, the way componentBudget counts them: an explicit part or minifig by its
// placement, a wheel element to the nearest wheel shape, any other brick by the first of its cells a shape owns.
// Hand-placed and support bricks belong to no shape and have no entry.
export function pieceOwners(scene:GeneratedScene,pieces:readonly Piece[]):Map<number,string>{
 const cells=new Map<string,string>(),out=new Map<number,string>(),wheelShapes=scene.shapes.filter(s=>s.kind==="wheel");sceneVoxels(scene,undefined,undefined,cells);
 const parts=new Map(expandShapes(scene.shapes).filter(isExplicit).map(s=>[placementKey(explicitPiece(s)),s.component||s.label]));
 for(const p of pieces){
  let owner=parts.get(placementKey(p));
  if(!owner&&WHEELS[p.part]){const cx=p.x+p.w/2,cy=p.y+p.h/2,cz=p.z+p.d/2;let best=Infinity;for(const w of wheelShapes){const d=Math.hypot(w.position.x-cx,(w.position.y-cy)*.4,w.position.z-cz);if(d<best){best=d;owner=w.component||w.label;}}}
  else if(!owner)for(const [x,y,z] of pieceCells(p)){const o=cells.get(voxelKey(x,y,z));if(o){owner=o;break;}}
  if(owner)out.set(p.id,owner);
 }
 return out;
}
export const piecesOf=(owners:Map<number,string>,components:readonly string[])=>{const want=new Set(components);return [...owners].filter(([,c])=>want.has(c)).map(([id])=>id);};

/** The components a lasso's sampled bounds touch, most pieces first. */
export function componentsInBounds(owners:Map<number,string>,pieces:readonly Piece[],bounds:RevisionRegion["bounds"],max=8):string[]{
 if(!bounds)return [];const count=new Map<string,number>();
 for(const p of pieces){const o=owners.get(p.id);if(!o||p.x>=bounds.max.x||p.x+p.w<=bounds.min.x||p.y>=bounds.max.y||p.y+p.h<=bounds.min.y||p.z>=bounds.max.z||p.z+p.d<=bounds.min.z)continue;count.set(o,(count.get(o)||0)+1);}
 return [...count].sort((a,b)=>b[1]-a[1]).slice(0,max).map(([c])=>c);
}

export type ComponentDiff={changed:string[];added:string[];removed:string[]};
/** Components whose shapes differ between two versions, by stable component name. */
export function componentDiff(before:GeneratedScene|undefined,after:GeneratedScene):ComponentDiff{
 if(!before)return {changed:[],added:[],removed:[]};
 const group=(scene:GeneratedScene)=>{const m=new Map<string,string[]>();for(const s of normalizeScene(scene).shapes){const c=s.component||s.label;m.set(c,[...(m.get(c)||[]),stable(s)]);}return new Map([...m].map(([c,list])=>[c,list.sort().join("|")]));};
 const a=group(before),b=group(after);
 return {changed:[...b].filter(([c,v])=>a.has(c)&&a.get(c)!==v).map(([c])=>c),added:[...b.keys()].filter(c=>!a.has(c)),removed:[...a.keys()].filter(c=>!b.has(c))};
}
/** "Changed: Awning · Added: Door"; empty when nothing moved. */
export function diffSummary(d:ComponentDiff){
 const part=(name:string,list:string[])=>list.length?`${name}: ${list.slice(0,4).map(componentLabel).join(", ")}${list.length>4?` +${list.length-4}`:""}`:"";
 return [part("Changed",d.changed),part("Added",d.added),part("Removed",d.removed)].filter(Boolean).join(" · ");
}
/** Ids of the pieces in `after` that are not in `before` at the same place, part and color. */
export function changedPieceIds(before:readonly Piece[],after:readonly Piece[]){const seen=new Set(before.map(pieceKey));return after.filter(p=>!seen.has(pieceKey(p))).map(p=>p.id);}
// The bricks to highlight in a shown version against another: those that moved or changed and belong to a component
// that changed. A change repacks neighbouring bricks of untouched components; those stay unhighlighted. When no
// component changed (only hand edits differ), every moved brick shows.
export function highlightChanges(shown:{scene:GeneratedScene;pieces:readonly Piece[]},other:{scene:GeneratedScene;pieces:readonly Piece[]}){
 const moved=changedPieceIds(other.pieces,shown.pieces),d=componentDiff(other.scene,shown.scene),touched=[...d.changed,...d.added,...d.removed];
 if(!touched.length)return moved;
 const owners=pieceOwners(shown.scene,shown.pieces),want=new Set(touched);
 return moved.filter(id=>want.has(owners.get(id)||""));
}

// Versions: one per finished pass, numbered for the design's life, the last MAX_VERSIONS kept. The thinking text is
// dropped; it is the largest part of a review and nothing restores it.
export const compactReview=(r:VisualReview|null|undefined):VisualReview|undefined=>{if(!r)return undefined;const rest={...r};delete rest.thinking;return rest;};
export function addVersion(list:readonly DesignVersion[],entry:Omit<DesignVersion,"n">):DesignVersion[]{
 const n=list.reduce((m,v)=>Math.max(m,v.n),0)+1;
 return [...list,{...entry,label:entry.label.slice(0,300),review:compactReview(entry.review),n}].slice(-MAX_VERSIONS);
}
/** Whether a version recompiles to this state: same scene, protected edits and locks. */
export const sameVersion=(a:{scene:GeneratedScene;manual:ManualEdits;locked:readonly string[]},b:{scene:GeneratedScene;manual:ManualEdits;locked:readonly string[]})=>stable([normalizeScene(a.scene),a.manual,[...a.locked].sort()])===stable([normalizeScene(b.scene),b.manual,[...b.locked].sort()]);
/** The version shown before `n` (the one Before compares against). */
export const previousVersion=(list:readonly DesignVersion[],n:number|null)=>{const at=list.findIndex(v=>v.n===n);return at>0?list[at-1]:undefined;};

// A tap selects whole components. Without a drawn outline the region is the full captured view (the selection is
// highlighted in it), so the components and their bounds carry the scope.
export const TAP_POLYGON:RevisionRegion["polygon"]=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export const TAP_DESCRIPTION="The user tapped to select the named components; they are highlighted orange in this captured view. The outline is the whole view, so use the component names and bounds for the scope.";
export type TapCapture={image:string;bounds?:RevisionRegion["bounds"];sceneKey?:string};
/** The region a pass sends: a drawn area (plus any tapped parts), or the tapped parts alone. */
export function composeRegion(s:{lasso?:RevisionRegion;picked:readonly string[];tap?:TapCapture}):RevisionRegion|undefined{
 if(s.lasso)return {...s.lasso,components:[...new Set([...s.lasso.components,...s.picked])].slice(0,24)};
 if(!s.picked.length||!s.tap)return undefined;
 return {image:s.tap.image,polygon:TAP_POLYGON.map(p=>({...p})),components:[...new Set(s.picked)].slice(0,24),...(s.tap.bounds?{bounds:s.tap.bounds}:{}),description:TAP_DESCRIPTION,...(s.tap.sceneKey?{sceneKey:s.tap.sceneKey}:{})};
}
