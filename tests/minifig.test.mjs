import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
const bundle=await build({stdin:{contents:'export * from "./lib/minifig";export * from "./lib/generated-scene";export {auditModel,ldrawFile,bricklinkXML,PARTS,COLORS} from "./lib/bridge";export {simulateClutch} from "./lib/clutch";export {validateProject,addPiece,inventoryFor} from "./lib/models";export {projectJSON,emptyShopping} from "./lib/design-project";export {pieceCellOffsets,topConnectorOffsets,bottomConnectorOffsets,partDimensions} from "./lib/part-spatial";export {preloadPartGeometries,partGeometriesReady,exactPartGeometry,hasExactPartGeometry} from "./lib/part-meshes";export {resolveLegoElement} from "./lib/lego-elements";export {DESIGN_INSTRUCTIONS} from "./lib/generation-provider";export {pickExamples,DESIGN_EXAMPLES} from "./lib/design-examples";export {prepareLegoShopping} from "./app/lego-shopping-data";',resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",write:false,alias:{"@":process.cwd()}});
const m=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text+"\n//# sourceURL=minifig-test-bundle.mjs").toString("base64"));
const manifest=JSON.parse(await readFile(new URL("../lib/data/minifig.json",import.meta.url),"utf8"));
const meshes=Object.fromEntries(await Promise.all(m.MINIFIG_MESHES.map(async({id,mesh})=>[mesh,JSON.parse(await readFile(new URL(`../public${mesh}`,import.meta.url),"utf8"))])));
const fetcher=async url=>meshes[url]?Response.json(meshes[url]):new Response("",{status:404});
// Vertical extent (LDU, y down) of each assembled element in the minifig frame.
const extent=element=>{const mesh=meshes[element.mesh],r=element.matrix;let lo=Infinity,hi=-Infinity;for(let i=0;i<mesh.positions.length;i+=3){const x=mesh.positions[i]*20,y=-mesh.positions[i+1]*20,z=mesh.positions[i+2]*20,v=r[3]*x+r[4]*y+r[5]*z+element.position[1];lo=Math.min(lo,v);hi=Math.max(hi,v);}return [lo,hi];};
const scene=(shapes,dim=[12,20,10])=>({name:"Street",description:"Figures on a base",dimensions:{x:dim[0],y:dim[1],z:dim[2]},shapes:[{id:"base",component:"Base",label:"Base",kind:"box",operation:"add",color:"gray",position:{x:0,y:0,z:0},size:{x:dim[0],y:2,z:dim[2]},end:{x:0,y:0,z:0},radius:1},...shapes]});
const figure=(id,p,extra={})=>({id,component:"People",label:id,kind:"minifig",operation:"add",color:"red",position:{x:p[0],y:p[1],z:p[2]},size:{x:2,y:12,z:1},end:{x:0,y:0,z:0},radius:1,background:"blue",...extra});

test("minifig meshes are committed LDraw element meshes in the shared mesh format with attribution",async()=>{
 assert.deepEqual(m.MINIFIG_MESHES.map(x=>x.id).sort(),["3626c","3815b","3816c","3817c","3818","3819","3820","973"]);
 for(const [url,mesh] of Object.entries(meshes)){
  assert.equal(mesh.version,1);assert.equal(url,`/parts/minifig/${mesh.part}.json`);assert.ok(mesh.positions.length>300&&mesh.positions.length%3===0);assert.equal(mesh.normals.length,mesh.positions.length);
  assert.ok(mesh.indices.length%3===0&&mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3));assert.ok([...mesh.positions,...mesh.normals].every(Number.isFinite));
 }
 const attribution=JSON.parse(await readFile(new URL("../public/parts/minifig/attribution.json",import.meta.url),"utf8"));
 assert.equal(attribution.geometry.commit,"0eda020f43fe3af7d45444580dd56a9ce0c716ab");assert.ok(attribution.geometry.files.length>=8&&attribution.geometry.files.every(f=>/CC BY/.test(f.license)&&/^[a-f0-9]{64}$/.test(f.sha256)));
 for(const id of ["973","3626c","3820","3815b","3816c","3817c"])assert.ok(attribution.geometry.files.some(f=>f.path===`parts/${id}.dat`),id);
});

test("the assembly has real minifig proportions: 2 x 1 legs, 12 plates to the head plus its stud, no gaps",()=>{
 assert.deepEqual(manifest.footprint,{w:2,d:1,h:12});assert.deepEqual([m.PARTS.minifig.w,m.PARTS.minifig.d,m.PARTS.minifig.h],[2,1,12]);
 // Sole to the top of the head stud is 100 LDU: 12 plates (96 LDU) plus the 4 LDU stud.
 assert.equal(manifest.envelope.max[1],72);assert.equal(manifest.envelope.min[1],-28);
 const part=id=>m.MINIFIG_ELEMENTS.find(e=>e.id===id),[head,torso,hips,legR,legL]=["3626c","973","3815b","3816c","3817c"].map(id=>extent(part(id)));
 assert.ok(Math.abs(head[1]-head[0]-28)<.01,"head with stud is 28 LDU");assert.ok(Math.abs(legR[1]-72)<.01&&Math.abs(legL[1]-72)<.01,"both soles on one plane");
 // Each element reaches into the one below it (neck into torso, hip peg into torso, legs onto hip pins).
 for(const [upper,lower] of [[head,torso],[torso,hips],[hips,legR],[hips,legL]])assert.ok(upper[1]>=lower[0]-.5,`gap between ${upper} and ${lower}`);
 // The leg holes lie on the stud grid of the 2 x 1 footprint.
 const [ax,feet,az]=manifest.anchor;for(const [x,y,z] of manifest.sockets){assert.equal(y,feet);assert.equal(((x-ax)/20-.5)%1,0);assert.equal((z-az)/20-.5,0);}
 assert.ok(manifest.envelope.max[0]-manifest.envelope.min[0]<4*20,"arms stay within a stud of each side");
 const front=m.minifigPlacements("pz"),side=m.minifigPlacements("px");assert.ok(front.find(p=>p.element.id==="3626c").position[1]===-96);
 // Facing +z, the hands point toward +z; facing +x, toward +x.
 assert.ok(front.filter(p=>p.element.id==="3820").every(p=>p.position[2]>5));assert.ok(side.filter(p=>p.element.id==="3820").every(p=>p.position[0]>5));
});

test("a minifig occupies its footprint and full height, clutches with two foot sockets and offers no grid stud",()=>{
 for(const face of ["pz","px","nz","nx"]){const d=m.partDimensions("minifig",face==="px"||face==="nx",face),shape={part:"minifig",...d};
  assert.deepEqual([d.w,d.d,d.h],face==="px"||face==="nx"?[1,2,12]:[2,1,12]);assert.equal(m.pieceCellOffsets(shape).length,24);assert.equal(m.bottomConnectorOffsets(shape).length,2);assert.ok(m.bottomConnectorOffsets(shape).every(([,y])=>y===0));assert.equal(m.topConnectorOffsets(shape).length,0);}
 const built=m.compileScene(scene([figure("a",[2,2,3]),figure("b",[6,2,3],{face:"px"})])),figures=built.pieces.filter(p=>p.part==="minifig"),audit=m.auditModel(built.pieces);
 assert.equal(figures.length,2);assert.equal(audit.overlaps,0);assert.equal(audit.disconnected.length,0);assert.equal(audit.unsupported.length,0);assert.equal(audit.weak.length,0);
 const clutch=m.simulateClutch(built.pieces);assert.ok(figures.every(p=>!clutch.floating.includes(p.id)&&!clutch.overloaded.includes(p.id)));
 // A floating figure is reported, not silently attached.
 const floating=m.compileScene(scene([figure("a",[2,5,3])])),loose=floating.pieces.find(p=>p.part==="minifig");assert.ok(m.auditModel(floating.pieces).disconnected.includes(loose.id));
 // Nothing can be built through a figure.
 assert.throws(()=>m.addPiece(built.pieces,"3001","white",1,6,3),/occupied/);
 // The editor can stand a figure on free studs; it gets the default classic look.
 const placed=m.addPiece(built.pieces,"minifig","green",8,2,6,true,"nx").at(-1);assert.deepEqual([placed.w,placed.d,placed.h,placed.face],[1,2,12,"nx"]);assert.equal(m.auditModel([...built.pieces,placed]).disconnected.length,0);
});

test("scene validation, compact wire format and project round-trip keep minifig colors and facing",()=>{
 const raw=scene([figure("keeper",[2,2,3],{color:"white",background:"navy",skin:"tan",face:"nx"}),figure("guest",[6,2,3])]),valid=m.validateScene(raw);
 assert.deepEqual(valid.shapes[1].size,{x:1,y:12,z:2});assert.equal(valid.shapes[1].face,"nx");
 const compact=m.compactScene(valid).sh[1];assert.deepEqual({k:compact.k,col:compact.col,bg:compact.bg,pid:compact.pid,face:compact.face},{k:"minifig",col:"white",bg:"navy",pid:"tan",face:"nx"});
 assert.deepEqual(m.expandCompactShape(compact),{...valid.shapes[1],repeat:{count:1,offset:{x:0,y:0,z:0}}});
 const legacy=m.expandCompactShape({...compact,pid:"not-a-color",bg:null,face:null});assert.equal(legacy.skin,undefined);assert.equal(legacy.face,"pz");
 assert.equal(m.compactShapeSchema.safeParse(compact).success,true);
 const built=m.compileScene(valid),keeper=built.pieces.find(p=>p.part==="minifig"&&p.color==="white");
 assert.deepEqual({legs:keeper.legs,skin:keeper.skin,face:keeper.face,w:keeper.w,d:keeper.d,h:keeper.h},{legs:"navy",skin:"tan",face:"nx",w:1,d:2,h:12});
 const loaded=m.validateProject(JSON.parse(m.projectJSON({...built,generation:valid},m.emptyShopping())));
 const again=loaded.pieces.find(p=>p.part==="minifig"&&p.color==="white");assert.deepEqual({legs:again.legs,skin:again.skin,face:again.face},{legs:"navy",skin:"tan",face:"nx"});
 assert.equal(loaded.pieces.length,built.pieces.length);
 // Overlapping figures, a figure through a part, or off-grid figures are rejected before compiling.
 assert.throws(()=>m.validateScene(scene([figure("a",[2,2,3]),figure("b",[3,2,3])])),/minifigure overlaps/);
 assert.throws(()=>m.validateScene(scene([figure("a",[2.5,2,3])])),/whole studs/);
 assert.throws(()=>m.validateScene(scene([figure("a",[2,10,3])])),/outside the build area/);
 assert.throws(()=>m.validateScene(scene([figure("a",[2,2,3],{operation:"subtract"})])),/Remove a minifigure/);
});

test("rendering loads the element meshes lazily and colors each region",async()=>{
 const piece={part:"minifig",color:"red",legs:"blue",skin:"yellow",face:"pz",rotated:false,w:2,d:1,h:12};
 assert.equal(m.hasExactPartGeometry("minifig"),true);assert.equal(m.partGeometriesReady([piece]),false);assert.throws(()=>m.exactPartGeometry(piece),/Load the exact geometry/);
 await assert.rejects(m.preloadPartGeometries([piece],async()=>new Response("",{status:503})),/could not be loaded/);assert.equal(m.partGeometriesReady([piece]),false);
 let calls=0;await Promise.all([m.preloadPartGeometries([piece,piece],url=>{calls++;return fetcher(url);}),m.preloadPartGeometries([piece],url=>{calls++;return fetcher(url);})]);
 assert.equal(calls,8);assert.equal(m.partGeometriesReady([piece]),true);
 for(const face of ["pz","px","nz","nx"]){
  const rotated=face==="px"||face==="nx",geometry=m.exactPartGeometry({...piece,face,rotated,w:rotated?1:2,d:rotated?2:1}),box=geometry.boundingBox;
  assert.ok(Math.abs(box.min.y+2.4)<1e-4&&Math.abs(box.max.y-2.6)<1e-4,"sole on the cell floor, stud 0.2 above 12 plates");
  const [half,deep]=rotated?["z","x"]:["x","z"];assert.ok(box.max[half]<1.6&&box.min[half]>-1.6);assert.ok(box.max[deep]-box.min[deep]<2);
  const colors=geometry.getAttribute("color");assert.equal(colors.count,geometry.getAttribute("position").count);
  const tints=new Set();for(let i=0;i<colors.count;i+=7)tints.add([colors.getX(i),colors.getY(i),colors.getZ(i)].map(v=>v.toFixed(3)).join());assert.equal(tints.size,3);
  geometry.dispose();
 }
});

test("inventory lists one minifigure, shopping treats it as an assembly and LDraw export writes its real elements",()=>{
 const pieces=m.compileScene(scene([figure("a",[2,2,3],{color:"white",background:"black",skin:"tan"})])).pieces,figures=pieces.filter(p=>p.part==="minifig");
 const row=m.inventoryFor(pieces).find(r=>r.part==="minifig");assert.equal(row.quantity,1);assert.equal(row.key,"minifig:white");
 assert.equal(m.resolveLegoElement("minifig","white").status,"assembly");assert.equal(m.resolveLegoElement("minifig","white").elementId,undefined);
 const shopping=m.prepareLegoShopping([row],{},{});assert.equal(shopping.rows[0].match,"assembly");assert.equal(shopping.matched.length,0);
 assert.doesNotMatch(m.bricklinkXML([row]),/minifig/);
 const lines=m.ldrawFile(figures.map(p=>({...p,stage:0})),"Figure",[{title:"All",text:""}]).split("\n").filter(l=>l.startsWith("1 "));
 assert.equal(lines.length,9);
 const byPart=id=>lines.filter(l=>l.endsWith(` ${id}.dat`));
 assert.ok(byPart("3626c")[0].startsWith(`1 ${m.COLORS.tan.ldraw} `));assert.equal(byPart("3820").length,2);assert.ok(byPart("3820").every(l=>l.startsWith(`1 ${m.COLORS.tan.ldraw} `)));
 assert.ok(byPart("973")[0].startsWith(`1 ${m.COLORS.white.ldraw} `));assert.ok(["3815b","3816c","3817c"].every(id=>byPart(id)[0].startsWith(`1 ${m.COLORS.black.ldraw} `)));
 // Facing +z (180 degrees from LDraw's native front), the soles stand on the base top and the leg holes on studs 2 and 3.
 const fig=figures[0],[,,x,y,z,...matrix]=byPart("3816c")[0].split(" ").map(Number);
 assert.deepEqual([x,y+28,z],[(fig.x+1)*20,-fig.y*8,(fig.z+.5)*20-1.25]);assert.deepEqual(matrix.slice(0,9),[-1,0,0,0,1,0,0,0,-1]);
 const [,,hx,hy]=byPart("3626c")[0].split(" ").map(Number);assert.equal(hx,(fig.x+1)*20);assert.equal(hy,-fig.y*8-96);
});

test("the designer is told to use real minifigs for people, the schema offers them and examples teach them",()=>{
 assert.match(m.DESIGN_INSTRUCTIONS,/MINIFIGURES/);assert.match(m.DESIGN_INSTRUCTIONS,/k minifig/);assert.match(m.DESIGN_INSTRUCTIONS,/Never build people from boxes/);assert.match(m.DESIGN_INSTRUCTIONS,/12 plates \(4 bricks\)/);
 assert.ok(m.compactJSONSchema.properties.sh.items.properties.k.enum.includes("minifig"));assert.ok(m.sceneJSONSchema.properties.shapes.items.properties.kind.enum.includes("minifig"));
 for(const idea of ["A fire station with crew","Two people at a bus stop","A minifig astronaut","A pirate character","Market stall with figures"])assert.ok(m.pickExamples(idea).some(e=>e.id==="minifigs"),idea);
 assert.ok(!m.pickExamples("A brown dog").some(e=>e.id==="minifigs"));
 const example=m.DESIGN_EXAMPLES.find(e=>e.id==="minifigs").scene,shapes=example.sh.map(c=>m.expandCompactShape(c));
 const built=m.compileScene({name:example.n,description:example.d,dimensions:{x:example.dim[0],y:example.dim[1],z:example.dim[2]},shapes}),audit=m.auditModel(built.pieces),figures=built.pieces.filter(p=>p.part==="minifig");
 assert.equal(figures.length,2);assert.equal(audit.overlaps,0);assert.ok(figures.every(p=>!audit.disconnected.includes(p.id)&&!audit.unsupported.includes(p.id)));
 assert.deepEqual(figures.map(p=>p.skin).sort(),["tan","yellow"]);
});
