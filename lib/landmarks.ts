import type {ColorKey,Config} from "./bridge";

// Real landmarks sculpted as voxels. X/Z are studs and Y is plate layers
// (2.5 plates per stud), so every helper takes design-space numbers and the
// sculptor scales and rounds them. Everything is deterministic.
export type VoxelMap=Map<string,ColorKey>;
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const TAU=Math.PI*2;

export class Sculpt{
 readonly voxels:VoxelMap=new Map();
 // scale is uniform; vertical multiplies heights on top of it, the way display models stretch the skyline.
 constructor(readonly scale=1,readonly vertical=1){}
 private s(v:number){return Math.round(v*this.scale);}
 private sy(v:number){return Math.round(v*this.scale*this.vertical);}
 private spanY(a:number,len:number){const lo=this.sy(a);return [lo,Math.max(lo+1,this.sy(a+len))] as const;}
 put(x:number,y:number,z:number,c:ColorKey){if(x>=0&&y>=0&&z>=0&&y<240)this.voxels.set(key(x,y,z),c);}
 has(x:number,y:number,z:number){return this.voxels.has(key(x,y,z));}
 // A feature thinner than one cell at the current scale still gets one cell, so cables,
 // suspenders and windows never vanish when a model is scaled down.
 private span(a:number,len:number){const lo=this.s(a);return [lo,Math.max(lo+1,this.s(a+len))] as const;}
 box(x:number,y:number,z:number,w:number,h:number,d:number,c:ColorKey){
  const [x0,x1]=this.span(x,w),[y0,y1]=this.spanY(y,h),[z0,z1]=this.span(z,d);
  for(let xx=x0;xx<x1;xx++)for(let yy=y0;yy<y1;yy++)for(let zz=z0;zz<z1;zz++)this.put(xx,yy,zz,c);
 }
 erase(x:number,y:number,z:number,w:number,h:number,d:number){
  for(let xx=this.s(x);xx<this.s(x+w);xx++)for(let yy=this.sy(y);yy<this.sy(y+h);yy++)for(let zz=this.s(z);zz<this.s(z+d);zz++)this.voxels.delete(key(xx,yy,zz));
 }
 // One horizontal disc in scaled space. `paint` may return undefined to skip a cell.
 private disc(cx:number,yy:number,cz:number,rx:number,rz:number,paint:(angle:number,ring:number)=>ColorKey|undefined){
  const sx=cx*this.scale,sz=cz*this.scale,srx=Math.max(.5,rx*this.scale),srz=Math.max(.5,rz*this.scale);
  for(let x=Math.floor(sx-srx);x<Math.ceil(sx+srx);x++)for(let z=Math.floor(sz-srz);z<Math.ceil(sz+srz);z++){
   const dx=(x+.5-sx)/srx,dz=(z+.5-sz)/srz,ring=Math.sqrt(dx*dx+dz*dz);
   if(ring>1)continue;
   const c=paint((Math.atan2(z+.5-sz,x+.5-sx)/TAU+1)%1,ring);
   if(c)this.put(x,yy,z,c);
  }
 }
 // Elliptical cylinder. `paint` can vary the color by angle (0..1) and height (0..1).
 cyl(cx:number,y:number,cz:number,rx:number,rz:number,h:number,c:ColorKey|((angle:number,t:number,ring:number)=>ColorKey|undefined)){
  const y0=this.sy(y),y1=Math.max(y0+1,this.sy(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0-1);this.disc(cx,yy,cz,rx,rz,(a,ring)=>typeof c==="string"?c:c(a,t,ring));}
 }
 // Round cone or frustum: radius runs from r0 at the bottom to r1 at the top.
 cone(cx:number,y:number,cz:number,r0:number,r1:number,h:number,c:ColorKey|((angle:number,t:number)=>ColorKey|undefined)){
  const y0=this.sy(y),y1=Math.max(y0+1,this.sy(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0-1),r=r0+(r1-r0)*t;this.disc(cx,yy,cz,r,r,a=>typeof c==="string"?c:c(a,t));}
 }
 // Pitched roof with its ridge along X (insets Z) or along Z (insets X).
 gable(x:number,y:number,z:number,w:number,d:number,h:number,c:ColorKey,along:"x"|"z"="x"){
  const y0=this.sy(y),y1=Math.max(y0+1,this.sy(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0);
   if(along==="x"){const inset=t*(d/2-.5);this.box(x,yy/(this.scale*this.vertical),z+inset,w,1/(this.scale*this.vertical),d-2*inset,c);}
   else{const inset=t*(w/2-.5);this.box(x+inset,yy/(this.scale*this.vertical),z,w-2*inset,1/(this.scale*this.vertical),d,c);}
  }
 }
 // Pyramid roof insetting on all sides.
 hip(x:number,y:number,z:number,w:number,d:number,h:number,c:ColorKey){
  const y0=this.sy(y),y1=Math.max(y0+1,this.sy(y+h)),m=Math.min(w,d)/2-.5;
  for(let yy=y0;yy<y1;yy++){const inset=(yy-y0)/Math.max(1,y1-y0)*m;this.box(x+inset,yy/(this.scale*this.vertical),z+inset,w-2*inset,1/(this.scale*this.vertical),d-2*inset,c);}
 }
 // Open lattice tower: four corner posts with horizontal platforms every `step` plates.
 // Platforms are two studs wide so they pack into plates that rest on the posts.
 lattice(x:number,y:number,z:number,w:number,h:number,d:number,step:number,c:ColorKey){
  for(const [px,pz] of [[x,z],[x+w-1,z],[x,z+d-1],[x+w-1,z+d-1]])this.box(px,y,pz,1,h,1,c);
  for(let yy=y+step;yy<y+h;yy+=step){this.box(x,yy,z,w,1,2,c);this.box(x,yy,z+d-2,w,1,2,c);this.box(x,yy,z,2,1,d,c);this.box(x+w-2,yy,z,2,1,d,c);}
 }
 // Horizontal profile: fills a column of `d` cells at z for each x, at height fn(x).
 // Vertical gaps between neighbouring samples are bridged so the run stays continuous.
 curve(x0:number,x1:number,z:number,d:number,fn:(x:number)=>number,c:ColorKey,thickness=1){
  let prev:number|null=null;
  for(let xx=this.s(x0);xx<this.s(x1);xx++){
   const yy=Math.round(fn(xx/this.scale)*this.scale);
   const lo=prev===null?yy:Math.min(prev,yy),hi=prev===null?yy:Math.max(prev,yy);
   const [z0,z1]=this.span(z,d);
   for(let y=lo;y<=hi;y++)for(let k=0;k<Math.max(1,this.s(thickness));k++)for(let zz=z0;zz<z1;zz++)this.put(xx,y+k,zz,c);
   prev=yy;
  }
 }
}

const quadrants=(dark:ColorKey,light:ColorKey)=>(angle:number)=>Math.floor(angle*4)%2===0?dark:light;

// ---------------------------------------------------------------------------
// Golden Gate Bridge, from a measured blueprint.
// Source: Golden Gate Bridge Highway & Transportation District design and
// construction statistics. Main span 4,200 ft; each side span 1,125 ft; tower
// height 746 ft above water; deck clearance 220 ft; roadway width 90 ft.
// The suspended length (6,450 ft) is laid out as 80 studs, so one stud is
// 80.6 ft. Horizontal ratios are fixed. Two things are chosen explicitly:
//  - vertical exaggeration: "true" keeps 1:1 (towers 23 plates above water),
//    "display" doubles heights so the towers read from across a room;
//  - roadway width: the true width is 1.1 studs; "true" uses 2 studs, "display"
//    uses 6 so the road can carry lanes and sidewalks.
// ---------------------------------------------------------------------------
export const GOLDEN_GATE_BLUEPRINT={suspendedStuds:80,mainSpan:52,sideSpan:14,approach:8,towerAboveWaterPlates:23.1,deckAboveWaterPlates:6.8,trueRoadwayStuds:1.1};
export type GoldenGateLayout={scale:number;vertical:number;roadW:number;legD:number;deckH:number;length:number;width:number;anchor:[number,number];towers:[number,number];deckY:number;deckTop:number;towerTop:number;cableZ:[number,number];suspenderStep:number};
export function goldenGateLayout(config:Config,scale:number):GoldenGateLayout{
 const b=GOLDEN_GATE_BLUEPRINT,trueScale=config.proportions==="true",vertical=trueScale?1:3.5,roadW=trueScale?2:7,legD=2,deckH=trueScale?1:2;
 const t1=b.approach+b.sideSpan,t2=t1+b.mainSpan,length=b.approach*2+b.suspendedStuds;
 const deckY=2+Math.round(b.deckAboveWaterPlates*vertical),towerTop=2+Math.round(b.towerAboveWaterPlates*vertical);
 return {scale,vertical,roadW,legD,deckH,length,width:roadW+2*legD+8,anchor:[3,length-3],towers:[t1,t2],deckY,deckTop:deckY+deckH,towerTop,cableZ:[4+legD,4+legD+roadW-1],suspenderStep:trueScale?Math.max(3,Math.round(3/scale)):Math.max(2,Math.round(2/scale))};   // spacing widens as the model shrinks so suspenders never merge
}
/** The Golden Gate Bridge: towers, deck, continuous cables and suspenders built symmetrically from the blueprint above, then the setting. */
export function goldenGate(config:Config,scale:number):VoxelMap{
 const v=new Sculpt(scale),lay=goldenGateLayout(config,scale),{roadW,legD,deckH,length:L,width:W,anchor,towers,deckY,deckTop,towerTop,cableZ,suspenderStep}=lay,steel=config.color,water=config.water;
 const z0=4,deckZ=z0+legD,legZ=[z0,z0+legD+roadW];   // water margin, then leg, deck, leg
 v.box(0,0,0,L,2,W,water);
 // Deck: a slender slab the full length, road surface and sidewalks in display proportions.
 v.box(0,deckY,deckZ,L,deckH,roadW,steel);
 if(roadW>=6){v.box(0,deckTop,deckZ+1,L,1,roadW-2,"black");v.box(0,deckTop,deckZ,L,1,1,"gray");v.box(0,deckTop,deckZ+roadW-1,L,1,1,"gray");for(let x=2;x<L;x+=4)v.box(x,deckTop,deckZ+Math.floor(roadW/2),2,1,1,"yellow");}   // an odd road width keeps the centre line dead centre
 // Anchorages and approach viaduct piers, mirrored at both ends.
 for(const end of [0,1]){const x=end?L-7:3;v.box(x,2,z0,4,deckY-2,roadW+2*legD,"gray");for(let px=end?L-2:1;end?px>x+4:px<x-1;px+=end?-3:3)v.box(px,2,deckZ,1,deckY-2,roadW,"gray");}
 // Towers: one construction, placed twice. Paired legs, a strut below the deck and four above at the real strut heights.
 const above=towerTop-deckY,strutFractions=[.2,.42,.62,.82];
 for(const tx of towers){
  for(const z of legZ){
   v.box(tx-1.5,2,z,3,deckY-2,legD,steel);                      // wider footing to the deck
   const setback=deckY+Math.round(above*strutFractions[0]);
   v.box(tx-1.5,deckY,z,3,setback-deckY,legD,steel);             // the legs taper: full width up to the first portal
   v.box(tx-1,setback,z,2,towerTop-setback,legD,steel);          // then a step in, the Art Deco setback
   v.box(tx-1,towerTop,z<deckZ?z:z-1,2,1,legD+1,steel);          // saddle reaching over the cable line
  }
  v.box(tx-1.5,deckY-3,legZ[0],3,2,legZ[1]+legD-legZ[0],steel);   // strut just under the deck
  for(const f of strutFractions){const y=deckY+Math.round(above*f),h=above>=16?2:1;v.box(tx-1,y,legZ[0],2,h,legZ[1]+legD-legZ[0],steel);if(h===2&&roadW>=6)v.box(tx-.5,y+.5,legZ[0]+legD,1,1,roadW,"black");}
 }
 // Stiffening truss under the suspended deck (display proportions): a bottom chord with posts every four studs.
 if(roadW>=6){const x0=anchor[0]+5,x1=anchor[1]-5;v.box(x0,deckY-3,deckZ,x1-x0,1,roadW,steel);for(let x=x0;x<x1;x+=4)for(const z of [deckZ,deckZ+roadW-1])v.box(x,deckY-2,z,1,2,1,steel);
  // Lamp posts along both sidewalks, between the suspenders.
  for(let x=anchor[0]+5;x<anchor[1]-3;x+=8)if(!towers.some(t=>Math.abs(x-t)<=2))for(const z of [deckZ+1,deckZ+roadW-2]){v.box(x,deckTop+1,z,1,3,1,"gray");v.box(x,deckTop+4,z,1,1,1,"yellow");}}
 // Cables: one continuous path per side, over both saddles, dipping to the deck at mid-span.
 const mid=(towers[0]+towers[1])/2,half=(towers[1]-towers[0])/2,sagBottom=deckTop+1;
 const cableY=(x:number)=>{
  if(x<=towers[0])return deckY+(towerTop-deckY)*Math.max(0,(x-anchor[0]))/(towers[0]-anchor[0]);
  if(x>=towers[1])return deckY+(towerTop-deckY)*Math.max(0,(anchor[1]-x))/(anchor[1]-towers[1]);
  return sagBottom+(towerTop-sagBottom)*((x-mid)/half)**2;
 };
 for(const z of cableZ){
  v.curve(anchor[0],anchor[1]+1,z,1,cableY,steel);
  // Suspenders: repeated verticals from the deck edge up to the cable, skipping the towers.
  for(let x=anchor[0]+suspenderStep;x<anchor[1];x+=suspenderStep){if(towers.some(t=>Math.abs(x-t)<=1.5))continue;const top=Math.floor(cableY(x));if(top>deckTop+1)v.box(x,deckTop,z,1,top-deckTop,1,steel);}
 }
 // Setting, added last so the bridge reads on its own.
 if(config.landscape){
  for(const end of [0,1]){const x=end?L-6:0;v.box(x,2,0,6,2,W,"tan");v.box(end?L-4:0,4,0,4,2,W,"green");}
  // The Marin Headlands rise at the north end; the San Francisco side is lower.
  v.cone(2,4,2,3.2,.6,Math.max(6,deckY-8),"green");v.cone(3,4,W-3,3.4,.6,Math.max(7,deckY-6),"tan");v.cone(L-3,4,2,2.6,.5,Math.max(5,deckY-12),"green");
  // Fort Point: the brick fort tucked under the south approach, with its parapet.
  if(config.proportions!=="true"){const fz=z0+legD+roadW+legD;v.box(L-15,2,fz,8,8,W-fz,"brown");v.box(L-15,10,fz,8,1,W-fz,"tan");v.erase(L-13,10,fz+1,4,1,W-fz-2);}
 }
 return v.voxels;
}
/** Side-elevation review: measures the finished voxels against the blueprint. */
export function goldenGateReport(config:Config,scale:number){
 const lay=goldenGateLayout(config,scale),voxels=goldenGate(config,scale),s=(n:number)=>Math.round(n*scale);
 const has=(x:number,y:number,z:number)=>voxels.has(`${x},${y},${z}`);
 const cableZ=lay.cableZ.map(s),xs=[s(lay.anchor[0]),s(lay.anchor[1])];
 let gaps=0,suspenders=0;
 // The cable is checked where it runs clear of the deck; near the anchorages it descends to deck level by design.
 const approach=s(GOLDEN_GATE_BLUEPRINT.approach),clear=[approach+2,s(lay.length)-approach-2];
 for(const z of cableZ){for(let x=clear[0];x<=clear[1];x++){let any=false;for(let y=s(lay.deckTop);y<240&&!any;y++)if(has(x,y,z))any=true;if(!any)gaps++;}
  // Free-standing verticals on the cable line, away from the tower legs, are the suspenders.
  for(let x=xs[0];x<=xs[1];x++)if(!lay.towers.some(t=>Math.abs(x-s(t))<=2)&&has(x,s(lay.deckTop),z)&&has(x,s(lay.deckTop)+1,z)&&!has(x-1,s(lay.deckTop)+1,z)&&!has(x+1,s(lay.deckTop)+1,z))suspenders++;}
 const towerSpacing=s(lay.towers[1])-s(lay.towers[0]),suspended=s(GOLDEN_GATE_BLUEPRINT.suspendedStuds);
 return {towerSpacing,sideSpan:s(lay.towers[0])-approach,suspended,mainToSuspended:towerSpacing/suspended,towerTopAboveWater:s(lay.towerTop)-2,deckAboveWater:s(lay.deckY)-2,towerToDeckRatio:(s(lay.towerTop)-2)/Math.max(1,s(lay.deckY)-2),roadwayStuds:s(lay.roadW),trueRoadwayStuds:GOLDEN_GATE_BLUEPRINT.trueRoadwayStuds*scale,deckThicknessPlates:s(lay.deckH)||1,cableGaps:gaps,suspenders,verticalExaggeration:lay.vertical};
}

/** Neuschwanstein Castle on its rock: the Palas with its two great towers, the courtyard wings and the red-brick gatehouse. */
export function neuschwanstein(scale:number,wall:ColorKey="white",roof:ColorKey="navy"):VoxelMap{
 // Display proportions: heights at 1.6x so the towers climb the way they do above the gorge.
 const v=new Sculpt(scale,1.6),G=10;
 // The rock ledge above the Pöllat gorge.
 v.box(0,0,0,64,2,32,"green");v.box(2,2,1,62,2,30,"tan");v.box(3,4,2,61,2,28,"gray");v.box(4,6,3,60,2,26,"gray");v.box(5,8,4,59,2,24,"tan");
 for(const [x,z] of [[1,3],[2,29],[30,1],[34,31],[1,16]])v.cone(x,2,z,2.5,.5,7,"green");
 const windows=(x0:number,x1:number,z:number,rows:number[],step=3)=>{for(const y of rows)for(let x=x0;x<x1;x+=step)v.box(x,y,z,1,3,1,roof);};
 // Palas: the five-storey main building.
 v.box(8,G,9,26,32,14,wall);
 windows(10,33,22,[G+5,G+12,G+19,G+26]);windows(10,33,9,[G+5,G+12,G+19,G+26]);
 v.box(8,G+31,8,26,1,16,wall);
 v.gable(7,G+32,8,28,16,15,roof,"x");
 for(const x of [12,20,28]){v.box(x,G+33,20,2,4,2,wall);v.box(x,G+37,19.5,2,1,3,roof);}
 v.box(20,G+45,15,2,4,2,"gray");
 // Corner turrets on the east end of the Palas.
 for(const z of [10,22]){v.cyl(33.5,G+18,z,1.6,1.6,20,wall);v.cone(33.5,G+38,z,2.2,.3,8,roof);}
 // The north tower (tallest) and the south tower at the west end.
 v.cyl(9,G,7,3.6,3.6,52,wall);v.cyl(9,G+52,7,4.4,4.4,2,wall);v.cyl(9,G+54,7,3.6,3.6,8,wall);v.cone(9,G+62,7,4.2,.3,17,roof);
 for(const y of [G+8,G+18,G+28,G+38,G+48])v.box(9,y,3,1,3,1,roof);
 v.cyl(9,G,25,3,3,44,wall);v.cyl(9,G+44,25,3.7,3.7,2,wall);v.cone(9,G+46,25,3.6,.3,14,roof);
 for(const y of [G+8,G+18,G+28,G+38])v.box(9,y,27,1,3,1,roof);
 // Stair tower on the north face.
 v.cyl(21,G,8.5,2,2,44,wall);v.cone(21,G+44,8.5,2.6,.3,10,roof);
 // Courtyard with the Knights' House (north) and the Bower (south).
 v.box(34,G,9,18,1,14,"tan");
 v.box(34,G,3,18,16,7,wall);windows(36,51,3,[G+4,G+10]);v.gable(33,G+16,2,20,9,9,roof,"x");
 v.box(34,G,22,18,16,7,wall);windows(36,51,28,[G+4,G+10]);v.gable(33,G+16,21,20,9,9,roof,"x");
 v.cyl(36,G,27,2.6,2.6,24,wall);v.cone(36,G+24,27,3.2,.3,9,roof);
 // Arcade along the courtyard side of the Bower.
 for(let x=36;x<51;x+=3)v.box(x,G+1,22,2,5,1,"gray");
 // Gatehouse: red brick with white dressings, twin towers and the archway.
 v.box(52,G,8,10,20,16,"red");
 for(const z of [8,23])v.box(52,G,z,10,20,1,"red");
 v.erase(52,G,14,10,9,4);
 v.box(52,G+9,13.5,10,1,5,wall);
 for(const [x,z] of [[52,8],[52,23],[61,8],[61,23]])v.box(x,G,z,1,20,1,wall);
 windows(53,61,8,[G+12],4);windows(53,61,23,[G+12],4);
 v.gable(51,G+20,10,12,12,9,roof,"x");
 for(const z of [9.5,22.5]){v.cyl(61,G,z,2.6,2.6,28,"red");v.cyl(61,G+28,z,3.1,3.1,1,wall);v.cone(61,G+29,z,3,.3,10,roof);}
 return v.voxels;
}

/** The Cape Hatteras Lighthouse: brick base, black-and-white spiral daymark, lantern room and the keepers' quarters. */
export function capeHatteras(scale:number,dark:ColorKey="black",light:ColorKey="white"):VoxelMap{
 const v=new Sculpt(scale),cx=14,cz=16,B=3,T=21,H=120;
 v.box(0,0,0,40,2,32,"green");v.box(0,2,0,40,1,32,"tan");v.box(2,2,2,36,1,28,"green");
 v.box(cx-1,2,0,2,1,10,"tan");v.box(cx-1,2,24,2,1,8,"tan");v.box(20,2,cz-1,8,1,2,"tan");
 // Octagonal red-brick base with stone belt courses.
 v.cyl(cx,B,cz,7.5,7.5,12,"brown");v.cyl(cx,B+12,cz,7.8,7.8,1,"tan");
 v.cyl(cx,B+13,cz,6.6,6.6,4,"brown");v.cyl(cx,B+17,cz,6.9,6.9,1,"tan");
 v.box(cx-1,B,cz+6.5,2,6,1,dark);
 // The spiral daymark: two black and two white bands wrapping about 1.4 turns.
 v.cone(cx,T,cz,6,3.4,H,(angle,t)=>Math.floor(((angle+t*1.4)%1)*4)%2===0?dark:light);
 for(const y of [T+24,T+54,T+84])v.box(cx-.5,y,cz+5.5,1,3,1,dark);
 // Gallery, lantern room and dome.
 v.cyl(cx,T+H,cz,5,5,2,dark);
 v.cyl(cx,T+H+2,cz,4.6,4.6,3,(angle,_,ring)=>ring>.86&&Math.floor(angle*16)%2===0?dark:undefined);
 v.cyl(cx,T+H+2,cz,3,3,8,(angle,_,ring)=>ring>.7&&Math.floor(angle*8)%2===0?dark:"yellow");
 v.cyl(cx,T+H+10,cz,3.6,3.6,1,dark);v.cone(cx,T+H+11,cz,3.4,.4,6,dark);v.box(cx-.5,T+H+17,cz-.5,1,3,1,dark);
 // Double keepers' quarters and the oil house.
 v.box(25,3,4,11,12,8,light);v.box(25,15,3,11,1,10,light);v.gable(24,16,3,13,10,7,"red","x");v.box(29,15,7,1,9,1,"brown");
 for(const x of [26.5,30,33.5]){v.box(x,6,11,1,4,1,"navy");v.box(x,6,4,1,4,1,"navy");}
 v.box(30,3,11,1,5,1,"brown");
 v.box(26,3,22,5,6,5,"brown");v.hip(25,9,21,7,7,3,dark);
 // Picket fence along the seaward edge.
 for(let x=1;x<39;x+=2)v.box(x,3,30,1,2,1,light);
 return v.voxels;
}

/** The Apollo Saturn V on its mobile launcher beside the launch umbilical tower. */
export function saturnV(scale:number,body:ColorKey="white",tower:ColorKey="red"):VoxelMap{
 const v=new Sculpt(scale),cx=12,cz=16,R=4,quad=quadrants("black",body);
 // Pad and mobile launcher platform with the flame hole.
 v.box(0,0,0,32,2,32,"gray");v.box(3,2,7,18,3,18,"gray");v.box(7,4,11,10,1,10,"black");
 // Five F-1 engines.
 for(const [ex,ez] of [[0,0],[2.6,2.6],[-2.6,2.6],[2.6,-2.6],[-2.6,-2.6]]){v.cyl(cx+ex,5,cz+ez,1.7,1.7,1,"black");v.cone(cx+ex,6,cz+ez,1.6,.9,6,"gray");}
 // S-IC first stage with fins, engine fairings and the intertank roll pattern.
 let y=12;
 v.cyl(cx,y,cz,R,R,12,quad);v.cyl(cx,y,cz,R,R,1,"gray");v.cyl(cx,y+12,cz,R,R,20,body);v.cyl(cx,y+32,cz,R,R,8,quad);v.cyl(cx,y+40,cz,R,R,22,body);
 for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const fx=cx+dx*(R-.5),fz=cz+dz*(R-.5);
  v.box(fx+Math.min(0,dx*3)-.5*Math.abs(dz),5,fz+Math.min(0,dz*3)-.5*Math.abs(dx),dx?3:1,y-5+4,dz?3:1,"black");
  v.box(fx+Math.min(0,dx*2)-.5*Math.abs(dz),y+4,fz+Math.min(0,dz*2)-.5*Math.abs(dx),dx?2:1,3,dz?2:1,"black");
  v.box(fx+Math.min(0,dx)-.5*Math.abs(dz),y+7,fz+Math.min(0,dz)-.5*Math.abs(dx),1,3,1,"black");
 }
 // United States flag on the first stage.
 v.box(cx+R-.5,y+20,cz-1.5,1,2,3,"red");v.box(cx+R-.5,y+22,cz-1.5,1,2,1.5,"navy");v.box(cx+R-.5,y+22,cz,1,2,1.5,"red");
 y+=62;
 // S-II second stage.
 v.cyl(cx,y,cz,R,R,8,quad);v.cyl(cx,y+8,cz,R,R,30,body);
 y+=38;
 v.cone(cx,y,cz,R,2.7,4,body);
 y+=4;
 // S-IVB third stage and instrument unit.
 v.cyl(cx,y,cz,2.7,2.7,6,quad);v.cyl(cx,y+6,cz,2.7,2.7,21,body);v.cyl(cx,y+27,cz,2.7,2.7,1,"black");v.cyl(cx,y+28,cz,2.7,2.7,1,body);
 y+=29;
 // Spacecraft adapter, service and command modules.
 v.cone(cx,y,cz,2.7,1.8,12,body);y+=12;
 v.cyl(cx,y,cz,1.8,1.8,11,"gray");y+=11;
 v.cone(cx,y,cz,1.8,.6,5,"gray");y+=5;
 // Launch escape system.
 v.box(cx-.5,y,cz-.5,1,8,1,body);y+=8;
 v.cyl(cx,y,cz,.9,.9,9,body);y+=9;
 v.cone(cx,y,cz,.9,.2,4,body);
 const top=y+4;
 // Launch umbilical tower with swing arms and the hammerhead crane.
 v.box(22,2,13,7,3,7,"gray");
 v.lattice(23,5,14,5,top-8,5,9,tower);
 // Swing arms are two staggered plate rows so they chain from the tower post to the vehicle.
 // Swing arms sit one plate above a platform level so their plates rest on the tower.
 for(const armY of [42,69,96,132,159,177])v.box(cx+R-.5,armY,cz-1,24-(cx+R-.5),1,2,"gray");
 v.box(22,top-3,14,8,2,5,"gray");v.box(20,top-1,15.5,10,1,2,tower);v.box(24,top-1,14,3,4,5,"gray");
 return v.voxels;
}
