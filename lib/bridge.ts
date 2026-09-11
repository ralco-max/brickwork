export type ColorKey = "red" | "orange" | "blue" | "navy" | "black" | "gray" | "white" | "green" | "tan" | "yellow" | "brown" | "darkbrown" | "pink";
export const COLORS: Record<ColorKey, {name:string;hex:string;ldraw:number;bricklink:number}> = {
 yellow:{name:"Yellow",hex:"#f2cd37",ldraw:14,bricklink:3},brown:{name:"Reddish brown",hex:"#582a12",ldraw:70,bricklink:88},darkbrown:{name:"Dark brown",hex:"#352100",ldraw:308,bricklink:120},pink:{name:"Bright pink",hex:"#e4adc8",ldraw:29,bricklink:104},
 red:{name:"Red",hex:"#c92820",ldraw:4,bricklink:5},orange:{name:"Orange",hex:"#ed7825",ldraw:25,bricklink:4},blue:{name:"Blue",hex:"#0055bf",ldraw:1,bricklink:7},navy:{name:"Dark blue",hex:"#183b54",ldraw:272,bricklink:63},black:{name:"Black",hex:"#292f34",ldraw:0,bricklink:11},gray:{name:"Light bluish gray",hex:"#a9b1b8",ldraw:71,bricklink:86},white:{name:"White",hex:"#f3f0e5",ldraw:15,bricklink:1},green:{name:"Green",hex:"#3f7750",ldraw:2,bricklink:6},tan:{name:"Tan",hex:"#c6ab78",ldraw:19,bricklink:2}
};
export const PARTS = {
 "3007":{name:"Brick 2 × 8",w:8,d:2,h:3,price:0.55},"3001":{name:"Brick 2 × 4",w:4,d:2,h:3,price:0.25},"3003":{name:"Brick 2 × 2",w:2,d:2,h:3,price:0.16},"3008":{name:"Brick 1 × 8",w:8,d:1,h:3,price:0.28},"3009":{name:"Brick 1 × 6",w:6,d:1,h:3,price:0.20},"3010":{name:"Brick 1 × 4",w:4,d:1,h:3,price:0.14},"3004":{name:"Brick 1 × 2",w:2,d:1,h:3,price:0.10},"3005":{name:"Brick 1 × 1",w:1,d:1,h:3,price:0.10},"3020":{name:"Plate 2 × 4",w:4,d:2,h:1,price:0.17},"3022":{name:"Plate 2 × 2",w:2,d:2,h:1,price:0.12},"3023":{name:"Plate 1 × 2",w:2,d:1,h:1,price:0.09},"3024":{name:"Plate 1 × 1",w:1,d:1,h:1,price:0.07},"3034":{name:"Plate 2 × 8",w:8,d:2,h:1,price:0.30},"3035":{name:"Plate 4 × 8",w:8,d:4,h:1,price:0.49},"3460":{name:"Plate 1 × 8",w:8,d:1,h:1,price:0.16},"3666":{name:"Plate 1 × 6",w:6,d:1,h:1,price:0.13},"3710":{name:"Plate 1 × 4",w:4,d:1,h:1,price:0.10},"3068b":{name:"Tile 2 × 2",w:2,d:2,h:1,price:0.13},"3069b":{name:"Tile 1 × 2",w:2,d:1,h:1,price:0.10},"3070b":{name:"Tile 1 × 1",w:1,d:1,h:1,price:0.07},"2431":{name:"Tile 1 × 4",w:4,d:1,h:1,price:0.10},"6636":{name:"Tile 1 × 6",w:6,d:1,h:1,price:0.14},"4162":{name:"Tile 1 × 8",w:8,d:1,h:1,price:0.18},"87079":{name:"Tile 2 × 4",w:4,d:2,h:1,price:0.25},
 "3040":{name:"Slope 45° 2 × 1",w:2,d:1,h:3,price:0.12},"3039":{name:"Slope 45° 2 × 2",w:2,d:2,h:3,price:0.18},"3665":{name:"Slope inverted 45° 2 × 1",w:2,d:1,h:3,price:0.16},"54200":{name:"Slope 30° 1 × 1 × ⅔",w:1,d:1,h:2,price:0.08},"85984":{name:"Slope 30° 1 × 2 × ⅔",w:2,d:1,h:2,price:0.10},"11477":{name:"Slope curved 2 × 1",w:1,d:2,h:2,price:0.10},"15068":{name:"Slope curved 2 × 2 × ⅔",w:2,d:2,h:2,price:0.16},"3298":{name:"Slope 33° 3 × 2",w:2,d:3,h:3,price:0.22},"4286":{name:"Slope 33° 3 × 1",w:1,d:3,h:3,price:0.14},
 "55982":{name:"Wheel 18 mm with tire",w:3,d:1,h:8,price:0.35},"56145":{name:"Wheel 30.4 mm with tire",w:4,d:2,h:10,price:0.55},"56908":{name:"Wheel 43.2 mm with tire",w:6,d:2,h:15,price:0.95}
};
export type PartId = keyof typeof PARTS;
export const TILES=new Set<string>(["3068b","3069b","3070b","2431","6636","4162","87079"]);
export const isTile=(part:string)=>TILES.has(part);
// Slope parts. In the catalog entry w is the ridge width, d the depth from the flat
// back edge to the low front edge and h the height in plates. run is how many studs
// of that depth slope; the rest is a flat, studded back row when studded is true.
// A piece's face is the direction its slope descends toward, and rotated is true
// for faces along x, so the world w and d of a slope piece follow the same rule as
// every other part.
export type Face="px"|"nx"|"pz"|"nz";
export const SLOPES:Record<string,{run:number;curved?:boolean;inverted?:boolean;studded:boolean}>={
 "3040":{run:1,studded:false},"3039":{run:1,studded:true},"3665":{run:1,inverted:true,studded:true},"54200":{run:1,studded:false},"85984":{run:1,studded:false},
 "11477":{run:2,curved:true,studded:false},"15068":{run:2,curved:true,studded:false},"3298":{run:2,studded:true},"4286":{run:2,studded:true},
};
export const isSlope=(part:string)=>Object.hasOwn(SLOPES,part);
// Real wheel elements (rim with tire). In the catalog entry w is the diameter in studs, d the width
// along the axle and h the diameter in plates. Unrotated, the axle runs along z (a vehicle whose
// length runs along x); rotated, it runs along x. The wheel spins on its hub, so it has no studs.
export const WHEELS:Record<string,{diameter:number;width:number}>={"55982":{diameter:3,width:1},"56145":{diameter:4,width:2},"56908":{diameter:6,width:2}};
export const isWheel=(part:string)=>Object.hasOwn(WHEELS,part);
// True when nothing can be attached on top of this part: tiles and studless slopes.
export const studless=(part:string)=>isTile(part)||isWheel(part)||(isSlope(part)&&!SLOPES[part].studded);
export interface Piece {id:number;part:PartId;color:ColorKey;x:number;y:number;z:number;w:number;d:number;h:number;rotated:boolean;stage:number;support?:boolean;face?:Face;}
// The cells of a piece's top that carry studs, as offsets within its world footprint.
// Bricks and plates are studded everywhere, tiles nowhere, and a studded slope only on
// the flat rows behind its slope (an inverted slope is studded across its whole top).
export function studCells(p:Pick<Piece,"part"|"w"|"d"|"face">):[number,number][]{
 if(isTile(p.part)||isWheel(p.part))return [];
 const slope=SLOPES[p.part];const out:[number,number][]=[];
 for(let x=0;x<p.w;x++)for(let z=0;z<p.d;z++){
  if(slope&&!slope.inverted){if(!slope.studded)return [];const face=p.face||"pz",depth=face==="px"||face==="nx"?p.w:p.d,along=face==="px"||face==="nx"?x:z,flat=depth-slope.run;const back=face==="pz"||face==="px"?along<flat:along>=slope.run;if(!back)continue;}
  out.push([x,z]);
 }
 return out;
}
export interface Config {size:"compact"|"display";color:"red"|"orange"|"white";water:"blue"|"navy";landscape:boolean;proportions?:"display"|"true";}
export interface InventoryRow {key:string;part:PartId;color:ColorKey;quantity:number;}
export const STAGES = [
 {title:"Lay the bay",text:"Build the lower plate layer, then overlap its seams with the upper layer. The second layer ties the display base together."},
 {title:"Raise the foundations",text:"Stack the four supports from the bay up to road level. Keep both tower foundations aligned across the full road width."},
 {title:"Connect the roadway",text:"Add the two staggered road plate layers. Work from the supports toward the center; support the spans by hand during assembly."},
 {title:"Build the two towers",text:"Stack the tower legs and full-width crossbeams. Inspect the upper beams and their connections in the 3D view."},
 {title:"Trace the suspension",text:"The cables are a stepped sculpture of overlapping plates and brick hangers. This stage needs physical prototyping; the view shows intended placement, not a tested assembly sequence."},
 {title:"Finish the scene",text:"Add the road tiles and shoreline. Rotate the finished model to inspect both sides. Handle the display by its base."}
];
export function generateBridge(config:Config) {
 const L=config.size==="display"?96:64,W=16,pieces:Piece[]=[],cells=new Map<string,number>();
 const cell=(x:number,y:number,z:number)=>`${x},${y},${z}`;
 function add(part:PartId,color:ColorKey,x:number,y:number,z:number,stage:number,rotated=false) {
  const p=PARTS[part],w=rotated?p.d:p.w,d=rotated?p.w:p.d;
  for(let a=x;a<x+w;a++)for(let b=y;b<y+p.h;b++)for(let c=z;c<z+d;c++)if(cells.has(cell(a,b,c)))return false;
  const id=pieces.length;pieces.push({id,part,color,x,y,z,w,d,h:p.h,rotated,stage});
  for(let a=x;a<x+w;a++)for(let b=y;b<y+p.h;b++)for(let c=z;c<z+d;c++)cells.set(cell(a,b,c),id);return true;
 }
 function fillRect(x:number,z:number,w:number,d:number,y:number,color:ColorKey,stage:number,offset=false) {
  for(let zz=z;zz<z+d;zz+=2){let xx=x;if(offset&&w>=4){add("3020",color,xx,y,zz,stage);xx+=4;}while(xx<x+w){const rem=x+w-xx,p=rem>=8?"3034":rem>=4?"3020":"3022";add(p,color,xx,y,zz,stage);xx+=PARTS[p].w;}}
 }
 for(let x=0;x<L;x+=4)for(let z=0;z<W;z+=8)add("3035",config.water,x,0,z,0,true);
 for(const [z,depth] of [[0,2],[2,4],[6,4],[10,4],[14,2]]){let x=0;while(x<L){const width=x===0?2:L-x>=8?8:L-x>=4?4:2;if(depth===4){if(width===8)add("3035",config.water,x,1,z,0);else if(width===4){add("3020",config.water,x,1,z,0);add("3020",config.water,x,1,z+2,0);}else add("3020",config.water,x,1,z,0,true);}else{add(width===8?"3034":width===4?"3020":"3022",config.water,x,1,z,0);}x+=width;}}
 const towers=[L/4-2,3*L/4-2];
 for(const x of [0,...towers,L-4])for(let y=2;y<14;y+=3)for(let z=4;z<12;z+=2)add("3001",y<5?"gray":config.color,x,y,z,1);
 fillRect(0,4,L,8,14,config.color,2);fillRect(0,4,L,8,15,config.color,2,true);
 const towerTop=config.size==="display"?43:37;
 for(const x of towers)for(let y=16;y<towerTop;y+=3){const cross=y===25||y===towerTop-3;if(cross){add("3007",config.color,x,y,4,3,true);add("3007",config.color,x+2,y,4,3,true);}else for(const z of [4,10])add("3001",config.color,x,y,z,3);}
 const low=21,high=towerTop-4;
 const cableY=(x:number)=>{const a=towers[0]+1,b=towers[1]+2,mid=(a+b)/2;if(x<a)return Math.round(17+(high-17)*x/a);if(x>b)return Math.round(17+(high-17)*(L-1-x)/(L-1-b));return Math.round(low+(high-low)*Math.pow(Math.abs(x-mid)/((b-a)/2),1.35));};
 for(const z of [4,11]){const heights:number[]=[];let prev=-100;
  for(let x=0;x<L-1;x++){let y=cableY(x);if(y===prev)y++;heights.push(y);add("3023",config.color,x,y,z,4);if(x>0)for(let yy=Math.min(prev,y)+1;yy<Math.max(prev,y);yy++)add("3024",config.color,x,yy,z,4);prev=y;}
  for(let x=2;x<L-2;x+=4){if(towers.some(t=>x>=t&&x<t+4))continue;const top=Math.min(heights[x-1],heights[x]);for(let y=16;y<top;){const p=top-y>=3?"3005":"3024";add(p,config.color,x,y,z,4);y+=PARTS[p].h;}}
 }
 for(let x=0;x<L;x+=2){add("3068b","black",x,16,6,5);add("3069b","black",x,16,8,5);add("3069b",x%4===0?"white":"black",x,16,9,5);}
 if(config.landscape)for(const end of [0,L-8])for(const z of [0,12]){add("3035","tan",end,2,z,5);add("3020","green",end+2,3,z,5);add("3022","green",end+4,3,z+2,5);add("3022","green",end+2,4,z,5);}
 const inventory=Array.from(pieces.reduce((m,p)=>{const key=`${p.part}:${p.color}`,old=m.get(key);if(old)old.quantity++;else m.set(key,{key,part:p.part,color:p.color,quantity:1});return m;},new Map<string,InventoryRow>()).values()).sort((a,b)=>b.quantity-a.quantity);
 return {pieces,inventory,length:L,width:W,height:towerTop};
}
export function auditModel(pieces:Piece[]) {
 if(!pieces.length)return {overlaps:0,disconnected:[] as number[],ungrounded:[] as number[],unsupported:[] as number[],weak:[] as number[],groups:0};
 const occupied=new Map<string,number>();let overlaps=0;const parent=pieces.map((_,i)=>i);
 function root(i:number):number{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}const join=(a:number,b:number)=>{parent[root(a)]=root(b);};
 pieces.forEach((p,i)=>{for(let x=p.x;x<p.x+p.w;x++)for(let z=p.z;z<p.z+p.d;z++)for(let y=p.y;y<p.y+p.h;y++){const k=`${x},${y},${z}`;if(occupied.has(k))overlaps++;occupied.set(k,i);}});
 const contacts=pieces.map(()=>0),bottom=pieces.map(()=>[] as number[]);
 pieces.forEach((p,i)=>{for(const [a,c] of studCells(p)){const x=p.x+a,z=p.z+c;const other=occupied.get(`${x},${p.y+p.h},${z}`);if(other!==undefined&&other!==i){join(i,other);contacts[other]++;bottom[other].push(i);}}});
 // A wheel holds on its hub: it is attached to whatever piece meets its inner face along the axle,
 // and a wheel that rests on something stands on it, the way a car stands on its tires.
 pieces.forEach((p,i)=>{if(!isWheel(p.part))return;const cy=p.y+Math.floor(p.h/2),axleX=p.rotated,cx=p.x+Math.floor(p.w/2),cz=p.z+Math.floor(p.d/2);const faces=axleX?[p.x-1,p.x+p.w]:[p.z-1,p.z+p.d];for(const face of faces)for(let u=-1;u<=1;u++)for(let dy=-1;dy<=1;dy++){const x=axleX?face:cx+u,z=axleX?cz+u:face;const other=occupied.get(`${x},${cy+dy},${z}`);if(other!==undefined&&other!==i){join(i,other);contacts[i]++;bottom[i].push(other);}}
  for(let x=p.x;x<p.x+p.w;x++)for(let z=p.z;z<p.z+p.d;z++){const under=occupied.get(`${x},${p.y-1},${z}`);if(under!==undefined&&under!==i){join(i,under);bottom[i].push(under);}}});
 const grounded=new Set(pieces.flatMap((p,i)=>p.y===0?[root(i)]:[]));
 const groups=new Map<number,number>();pieces.forEach((_,i)=>groups.set(root(i),(groups.get(root(i))||0)+1));
 const baseRoot=[...groups].sort((a,b)=>Number(grounded.has(b[0]))-Number(grounded.has(a[0]))||b[1]-a[1])[0][0];
 const ungrounded=pieces.filter((_,i)=>!grounded.has(root(i))).map(p=>p.id);
 const disconnected=pieces.filter((_,i)=>!grounded.has(root(i))||root(i)!==baseRoot).map(p=>p.id);
 // A build sequence needs every piece attached to something already placed: pressed onto studs
 // beneath it, or hung from the studs it offers to a placed piece above it (an eave plate, an
 // inverted slope). Passes repeat until nothing more can be attached.
 const above=pieces.map(()=>[] as number[]);bottom.forEach((list,i)=>{for(const j of list)above[j].push(i);});
 const placed=new Set<number>();let grew=true;
 while(grew){grew=false;for(const i of pieces.map((_,i)=>i).sort((a,b)=>pieces[a].y-pieces[b].y)){if(placed.has(i))continue;if(pieces[i].y===0||bottom[i].some(j=>placed.has(j))||above[i].some(j=>placed.has(j))){placed.add(i);grew=true;}}}
 const unsupported=pieces.filter((_,i)=>!placed.has(i)).map(p=>p.id);
 const weak=pieces.filter((p,i)=>p.y>0&&contacts[i]>0&&contacts[i]<Math.min(2,p.w*p.d)).map(p=>p.id);
 return {overlaps,disconnected,ungrounded,unsupported,weak,groups:groups.size};
}
export function partsCSV(rows:InventoryRow[],owned:Record<string,number>={},prices:Record<string,number>={}){return ["Design ID,Part,Color,Required,Owned,To buy,Estimated unit USD",...rows.map(r=>`${r.part},${PARTS[r.part].name},${COLORS[r.color].name},${r.quantity},${Math.min(r.quantity,owned[r.key]||0)},${Math.max(0,r.quantity-(owned[r.key]||0))},${prices[r.key]??PARTS[r.part].price}`)].join("\n");}
export function bricklinkXML(rows:InventoryRow[],owned:Record<string,number>={}){return `<INVENTORY>\n${rows.filter(r=>r.quantity>(owned[r.key]||0)).map(r=>` <ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${r.part}</ITEMID><COLOR>${COLORS[r.color].bricklink}</COLOR><MINQTY>${Math.max(0,r.quantity-(owned[r.key]||0))}</MINQTY></ITEM>`).join("\n")}\n</INVENTORY>`;}
export function ldrawFile(pieces:Piece[],name="Golden Gate Bridge",stages=STAGES){return [`0 ${name.replace(/[\r\n]/g," ")} - Brickwork custom concept`,"0 Physical stability and assembly not tested.",...stages.flatMap((s,i)=>["0 STEP",`0 ${s.title}`,...pieces.filter(p=>p.stage===i).map(p=>`1 ${COLORS[p.color].ldraw} ${(p.x+p.w/2)*20} ${-(p.y+p.h)*8} ${(p.z+p.d/2)*20} ${p.face==="px"?"0 0 1 0 1 0 -1 0 0":p.face==="nx"?"0 0 -1 0 1 0 1 0 0":p.face==="nz"?"-1 0 0 0 1 0 0 0 -1":p.rotated?"0 0 1 0 1 0 -1 0 0":"1 0 0 0 1 0 0 0 1"} ${p.part}.dat`)])].join("\n");}
