import type {Piece} from "./bridge";
import {partGeometriesReady,preloadPartGeometries} from "./part-meshes";

export type PreviewGeometry={pieces:Piece[];length:number;width?:number;height?:number;modelKey?:string};

/** Keep one complete, renderable snapshot while the next one's assets arrive. */
export class PreviewGeometryBuffer{
 private committed:PreviewGeometry|null=null;
 private version=0;
 constructor(private ready=partGeometriesReady,private load=preloadPartGeometries){}

 select(request:PreviewGeometry){
  if(this.ready(request.pieces))return request;
  return this.committed?.modelKey===request.modelKey?this.committed:null;
 }

 prepare(request:PreviewGeometry,changed:()=>void,failed:(error:unknown)=>void){
  const version=++this.version;
  if(this.ready(request.pieces))this.committed=request;
  else void this.load(request.pieces).then(()=>{
   if(version!==this.version)return;
   this.committed=request;changed();
  }).catch(error=>{if(version===this.version)failed(error);});
  // A newer stream snapshot or unmount owns subsequent completion/error state.
  return()=>{if(version===this.version)this.version++;};
 }
}
