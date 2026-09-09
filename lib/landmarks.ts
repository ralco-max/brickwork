import type {ColorKey,Config} from "./bridge";

// Real landmarks sculpted as voxels. X/Z are studs and Y is plate layers
// (2.5 plates per stud), so every helper takes design-space numbers and the
// sculptor scales and rounds them. Everything is deterministic.
export type VoxelMap=Map<string,ColorKey>;
const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const TAU=Math.PI*2;

export class Sculpt{
 readonly voxels:VoxelMap=new Map();
 constructor(readonly scale=1){}
 private s(v:number){return Math.round(v*this.scale);}
 put(x:number,y:number,z:number,c:ColorKey){if(x>=0&&y>=0&&z>=0&&y<240)this.voxels.set(key(x,y,z),c);}
 has(x:number,y:number,z:number){return this.voxels.has(key(x,y,z));}
 box(x:number,y:number,z:number,w:number,h:number,d:number,c:ColorKey){
  for(let xx=this.s(x);xx<this.s(x+w);xx++)for(let yy=this.s(y);yy<this.s(y+h);yy++)for(let zz=this.s(z);zz<this.s(z+d);zz++)this.put(xx,yy,zz,c);
 }
 erase(x:number,y:number,z:number,w:number,h:number,d:number){
  for(let xx=this.s(x);xx<this.s(x+w);xx++)for(let yy=this.s(y);yy<this.s(y+h);yy++)for(let zz=this.s(z);zz<this.s(z+d);zz++)this.voxels.delete(key(xx,yy,zz));
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
  const y0=this.s(y),y1=Math.max(y0+1,this.s(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0-1);this.disc(cx,yy,cz,rx,rz,(a,ring)=>typeof c==="string"?c:c(a,t,ring));}
 }
 // Round cone or frustum: radius runs from r0 at the bottom to r1 at the top.
 cone(cx:number,y:number,cz:number,r0:number,r1:number,h:number,c:ColorKey|((angle:number,t:number)=>ColorKey|undefined)){
  const y0=this.s(y),y1=Math.max(y0+1,this.s(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0-1),r=r0+(r1-r0)*t;this.disc(cx,yy,cz,r,r,a=>typeof c==="string"?c:c(a,t));}
 }
 // Pitched roof with its ridge along X (insets Z) or along Z (insets X).
 gable(x:number,y:number,z:number,w:number,d:number,h:number,c:ColorKey,along:"x"|"z"="x"){
  const y0=this.s(y),y1=Math.max(y0+1,this.s(y+h));
  for(let yy=y0;yy<y1;yy++){const t=(yy-y0)/Math.max(1,y1-y0);
   if(along==="x"){const inset=t*(d/2-.5);this.box(x,yy/this.scale,z+inset,w,1/this.scale,d-2*inset,c);}
   else{const inset=t*(w/2-.5);this.box(x+inset,yy/this.scale,z,w-2*inset,1/this.scale,d,c);}
  }
 }
 // Pyramid roof insetting on all sides.
 hip(x:number,y:number,z:number,w:number,d:number,h:number,c:ColorKey){
  const y0=this.s(y),y1=Math.max(y0+1,this.s(y+h)),m=Math.min(w,d)/2-.5;
  for(let yy=y0;yy<y1;yy++){const inset=(yy-y0)/Math.max(1,y1-y0)*m;this.box(x+inset,yy/this.scale,z+inset,w-2*inset,1/this.scale,d-2*inset,c);}
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
   for(let y=lo;y<=hi;y++)for(let k=0;k<Math.max(1,this.s(thickness));k++)for(let zz=this.s(z);zz<this.s(z+d);zz++)this.put(xx,y+k,zz,c);
   prev=yy;
  }
 }
}

const quadrants=(dark:ColorKey,light:ColorKey)=>(angle:number)=>Math.floor(angle*4)%2===0?dark:light;

/** The Golden Gate Bridge: Art Deco towers, main cables with suspenders, the anchorages, Fort Point and the Marin headlands. */
export function goldenGate(config:Config,scale:number):VoxelMap{
 const v=new Sculpt(scale),L=128,W=20,steel=config.color,water=config.water;
 const deckY=14,deckTop=16,deckZ=3,deckW=14,towerTop=84,towers=[30,98],mid=(towers[0]+towers[1])/2,half=(towers[1]-towers[0])/2,anchor=[11,117];
 v.box(0,0,0,L,2,W,water);
 if(config.landscape){
  // Marin headlands to the north and the Presidio shoreline to the south.
  v.box(0,2,0,10,3,W,"tan");v.box(0,5,0,8,3,W,"green");v.box(0,8,0,6,3,W,"green");v.box(0,11,3,4,2,W-6,"green");
  v.box(118,2,0,10,3,W,"tan");v.box(120,5,0,8,3,W,"green");v.box(122,8,0,6,3,W,"green");v.box(124,11,3,4,2,W-6,"green");
  // Fort Point sits beneath the south approach.
  v.box(110,2,13,7,7,6,"brown");v.box(111,9,14,5,1,4,"gray");
  // South tower fender ring at water level.
  v.cyl(100,2,W/2,9,10.5,1,"gray");
 }
 // Anchorage blocks and approach viaduct piers.
 for(const x of [7,115]){v.box(x,2,2,6,12,W-4,"gray");v.box(x-1,10,1,8,4,W-2,"gray");}
 for(const x of [2,124])for(const z of [5,13])v.box(x,2,z,2,12,2,"gray");
 // Stiffening truss and roadway.
 v.box(13,deckY-3,deckZ,L-26,3,deckW,steel);
 v.box(0,deckY,deckZ,L,2,deckW,steel);
 v.box(0,deckTop,deckZ+1,L,1,deckW-2,"black");
 v.box(0,deckTop,deckZ,L,1,1,"gray");v.box(0,deckTop,deckZ+deckW-1,L,1,1,"gray");
 for(let x=2;x<L;x+=4)v.box(x,deckTop,deckZ+deckW/2-1,2,1,1,"yellow");
 for(let x=1;x<L;x+=4){v.box(x,deckTop+1,deckZ,1,2,1,steel);v.box(x,deckTop+1,deckZ+deckW-1,1,2,1,steel);}
 // Towers: stepped legs joined by portal struts, one below the deck and four above.
 const legZ=[1,16],legD=3;
 for(const tx of towers){
  for(const z of legZ){
   v.box(tx-3,2,z-1,6,deckY-2,legD+2,steel);
   v.box(tx-2.5,deckY,z,5,22,legD,steel);
   v.box(tx-2,36,z,4,24,legD,steel);
   v.box(tx-1.5,60,z,3,towerTop-60,legD,steel);
   v.box(tx-2,towerTop,z-.5,4,1,legD+1,steel);v.box(tx-1,towerTop+1,z,2,1,legD,steel);
  }
  for(const [y,h,w] of [[7,3,6],[26,4,5],[42,4,4],[58,4,4],[74,4,3]]){v.box(tx-w/2,y,legZ[0],w,h,legZ[1]+legD-legZ[0],steel);v.box(tx-w/2+1,y+1,legZ[0]+legD,w-2,1,legZ[1]-legZ[0]-legD,"black");}
 }
 // Main cables: parabolic between the towers, straight to the anchorages.
 const cableY=(x:number)=>{
  if(x<towers[0])return deckY+(towerTop-1-deckY)*(x-anchor[0])/(towers[0]-anchor[0]);
  if(x>towers[1])return deckY+(towerTop-1-deckY)*(anchor[1]-x)/(anchor[1]-towers[1]);
  return 19+(towerTop-1-19)*((x-mid)/half)**2;
 };
 // Each cable is two studs wide; its inner stud sits over the sidewalk so the suspenders land on the deck.
 for(const [z,hang] of [[legZ[0]+1,deckZ],[legZ[1],deckZ+deckW-1]]){
  v.curve(anchor[0],anchor[1]+1,z,2,cableY,steel);
  // Suspenders hang every stud on the steep side spans and every other stud across the main span.
  for(let x=anchor[0]+2;x<anchor[1];x+=x<towers[0]-3||x>towers[1]+2?1:2){
   if(towers.some(t=>x>=t-3&&x<t+3))continue;
   const top=Math.floor(cableY(x));
   if(top>deckTop+1)v.box(x,deckTop+1,hang,1,top-deckTop-1,1,steel);
  }
 }
 return v.voxels;
}

/** Neuschwanstein Castle on its rock: the Palas with its two great towers, the courtyard wings and the red-brick gatehouse. */
export function neuschwanstein(scale:number,wall:ColorKey="white",roof:ColorKey="navy"):VoxelMap{
 const v=new Sculpt(scale),G=10;
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
