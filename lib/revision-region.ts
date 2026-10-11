import {z} from "zod";
import type {GeneratedScene} from "./generated-scene";

export const MAX_REVISION_REGION_IMAGE_LENGTH=1500000;
export const MAX_REVISION_REGION_POINTS=128;
const point=z.object({x:z.number().finite().min(0).max(1),y:z.number().finite().min(0).max(1)}).strict();
const position=z.object({x:z.number().finite().min(-192).max(384),y:z.number().finite().min(-240).max(480),z:z.number().finite().min(-192).max(384)}).strict();
const bounds=z.object({min:position,max:position}).strict().refine(b=>b.min.x<=b.max.x&&b.min.y<=b.max.y&&b.min.z<=b.max.z,"The selected area's bounds are inverted.");
export const revisionRegionSchema=z.object({
 image:z.string().max(MAX_REVISION_REGION_IMAGE_LENGTH).regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/,"Use a captured JPEG or PNG view for the marked area."),
 polygon:z.array(point).min(3).max(MAX_REVISION_REGION_POINTS).refine(points=>{
  if(points.length<3)return false;
  // Match the lasso's even-odd fill: crossed outlines can have zero signed area
  // while enclosing useful regions. Reject only a click or collinear stroke.
  const anchor=points[0],distance=(p:typeof anchor)=>(p.x-anchor.x)**2+(p.y-anchor.y)**2;
  const far=points.reduce((a,b)=>distance(a)>distance(b)?a:b);
  return points.some(p=>Math.abs((far.x-anchor.x)*(p.y-anchor.y)-(far.y-anchor.y)*(p.x-anchor.x))>1e-7);
 },"Draw around an area rather than a single line."),
 components:z.array(z.string().trim().min(1).max(80)).max(24),
 bounds:bounds.optional(),description:z.string().max(600).optional(),sceneKey:z.string().min(1).max(100).optional(),
}).strict();
export type RevisionRegion=z.infer<typeof revisionRegionSchema>;

/** Never duplicate the screenshot's base64 bytes in a provider text payload. */
export function revisionRegionContext(region:RevisionRegion|undefined){
 if(!region)return undefined;
 const {image:_image,...context}=region;
 return {...context,coordinateSystem:"polygon: normalized captured image; bounds: x/z studs, y plate layers"};
}

// This is a version hint, not a security signature. Stable object-key ordering
// keeps the hint intact through JSON exports and canonical scene validation.
function stableJSON(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(stableJSON).join(",")}]`;
 if(value&&typeof value==="object")return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJSON(v)}`).join(",")}}`;
 return JSON.stringify(value)??"null";
}
export function revisionSceneKey(scene:Pick<GeneratedScene,"dimensions"|"shapes"|"catalogVersion">){
 const serialized=stableJSON({dimensions:scene.dimensions,shapes:scene.shapes,catalogVersion:scene.catalogVersion});let hash=2166136261;
 for(let i=0;i<serialized.length;i++){hash^=serialized.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return `scene-v1-${(hash>>>0).toString(16).padStart(8,"0")}`;
}
