import type {ColorKey,Face,PartId,Piece} from "@/lib/bridge";
import {addPiece} from "@/lib/models";
import {bottomConnectorOffsets,partDimensions,topConnectorOffsets} from "@/lib/part-spatial";

type Point={x:number;y:number;z:number};
/** Align a real underside socket to the clicked stud, including raised sockets. */
export function placeOnTopStud(pieces:Piece[],part:PartId,color:ColorKey,face:Face,target:Piece,point:Point){
 const studs=topConnectorOffsets(target).map(([x,y,z])=>({x:target.x+x,y:target.y+y,z:target.z+z}));
 studs.sort((a,b)=>distance(a,point)-distance(b,point));
 const stud=studs[0];
 if(!stud||Math.hypot(stud.x+.5-point.x,stud.z+.5-point.z)>.8)throw Error("Click a visible stud to attach this part, or use coordinates for exact placement.");
 const rotated=face==="px"||face==="nx",shape={part,...partDimensions(part,rotated,face)},sockets=bottomConnectorOffsets(shape);
 if(!sockets.length)throw Error("This part has no upright underside sockets. Use coordinates; clips and hinges do not auto-connect.");
 const preferred={x:Math.floor(point.x),z:Math.floor(point.z)},seen=new Set<string>();
 const candidates=sockets.map(([x,y,z])=>({x:stud.x-x,y:stud.y-y,z:stud.z-z})).sort((a,b)=>Math.hypot(a.x-preferred.x,a.z-preferred.z)-Math.hypot(b.x-preferred.x,b.z-preferred.z));
 for(const position of candidates){
  const key=`${position.x},${position.y},${position.z}`;if(seen.has(key))continue;seen.add(key);
  try{return {pieces:addPiece(pieces,part,color,position.x,position.y,position.z,rotated,face),position};}catch(error){if(pieces.length>=16000)throw error;}
 }
 throw Error("This part cannot fit on that stud without a collision. Try an edge stud or rotate the part.");
}
const distance=(stud:Point,point:Point)=>(stud.x+.5-point.x)**2+(stud.z+.5-point.z)**2+((stud.y-point.y)*.4)**2;
