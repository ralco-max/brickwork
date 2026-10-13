import {listSharedLinks} from "@/lib/design-library";

const REMIXED="bricks-remixed-shares";
const remembered=():string[]=>{try{const list=JSON.parse(localStorage.getItem(REMIXED)||"[]");return Array.isArray(list)?list.filter(v=>typeof v==="string"):[];}catch{return [];}};

/**
 * Count a remix of a shared build: call it once, on the visitor's first change to an opened
 * share (wave C wires it into the studio's first save). A link this browser created is the
 * creator's own and is skipped, as is a share this browser already counted. The server counts
 * a visitor once a day and ignores links that are not in the gallery. Never throws.
 */
export async function noteRemix(shareId:string,fetcher:typeof fetch=fetch):Promise<boolean>{
 try{
  if(!/^[A-Za-z0-9]{10}$/.test(shareId)||remembered().includes(shareId))return false;
  if((await listSharedLinks()).some(link=>link.shareId===shareId))return false;
  const response=await fetcher(`/api/gallery/${shareId}/remix`,{method:"POST"});
  try{localStorage.setItem(REMIXED,JSON.stringify([shareId,...remembered()].slice(0,200)));}catch{/* private mode: the server still dedupes */}
  return response.ok&&(await response.json().catch(()=>({})) as {counted?:boolean}).counted===true;
 }catch{return false;}
}
