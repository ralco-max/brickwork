import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['export {PARTS,ELEMENTS,COLORS,ldrawFile,auditModel,partsCSV,bricklinkXML} from "./lib/bridge";','export {partDimensions,pieceCellOffsets,topConnectorOffsets,bottomConnectorOffsets,piecesIntersect} from "./lib/part-spatial";',
 'export {catalogPart,fittedElement,fittedColor,FITTED_ELEMENTS} from "./lib/part-catalog";','export {partColors} from "./lib/part-colors";','export {inventoryFor,validateProject,addPiece} from "./lib/models";',
 'export {validateScene,compileScene,compactShape,expandCompactShape,catalogPiece} from "./lib/generated-scene";','export {repairScene} from "./lib/scene-repair";','export {projectJSON,emptyShopping,editModel} from "./lib/design-project";',
 'export {buildGenerationPartCatalog} from "./lib/generation-parts";','export {DESIGN_INSTRUCTIONS} from "./lib/generation-provider";','export {paintPiece} from "./app/part-picker-data";','export {placeOnTopStud} from "./app/part-placement";',
 'export {preloadPartGeometries,exactPartGeometry,fittedPartGeometry} from "./lib/part-meshes";','export {resolveLegoElement} from "./lib/lego-elements";'].join(''),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error',alias:{'@':process.cwd()}});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const attribution=JSON.parse(await readFile(new URL('../public/parts/attribution.json',import.meta.url),'utf8'));
const NEW=['60592','60593','60596','2412b','2877','98283','4216'],FRAMES={'60592':'60601','60593':'60602','60596':'60616b'},FACES=['pz','px','nz','nx'];
const sort=cells=>[...cells].map(c=>c.join(',')).sort();
const piece=(part,x,y,z,face='pz',extra={})=>({id:0,part,color:m.catalogPart(part)?.colors.includes('white')?'white':m.partColors(part)[0],x,y,z,...m.partDimensions(part,face==='px'||face==='nx',face),stage:0,...extra});
const box=(id,x,y,z,w,h,d,extra={})=>({id,component:id,label:id,kind:'box',operation:'add',color:'white',position:{x,y,z},size:{x:w,y:h,z:d},end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}},...extra});
const partShape=(id,pid,x,y,z,extra={})=>box(id,x,y,z,1,1,1,{kind:'part',part:pid,face:'pz',...extra});
const fetchPublic=async url=>({ok:true,status:200,json:async()=>JSON.parse(await readFile(new URL(`../public${url}`,import.meta.url),'utf8'))});

test('window and door frames, grille tile and facade bricks compile to their real stud-grid sizes and connectors',()=>{
 const expect={'60592':[2,6,1,'window'],'60593':[2,9,1,'window'],'60596':[4,18,1,'door'],'2412b':[2,1,1,'tile'],'2877':[2,3,1,'brick'],'98283':[2,3,1,'brick'],'4216':[2,3,1,'brick']};
 for(const id of NEW){
  const p=m.catalogPart(id),[w,h,d,family]=expect[id];assert.ok(p,`${id} compiled`);
  assert.deepEqual([p.w,p.h,p.d,p.family],[w,h,d,family],`${id}: 1 stud deep, ${h} plates (8 LDU) high`);
  // Every bottom cell is an anti-stud on the 20 LDU grid; a tile has none on top, the others a stud per cell.
  assert.deepEqual(sort(p.bottomSockets),sort(Array.from({length:w},(_,x)=>[x,0,0])),`${id}: sockets`);
  assert.deepEqual(sort(p.topStuds),id==='2412b'?[]:sort(Array.from({length:w},(_,x)=>[x,h,0])),`${id}: studs`);
  assert.equal(p.occupancy.length,w*h*d,`${id}: a closed frame (glass or door fitted) fills its whole box`);
  assert.ok(p.colors.length>=10,`${id}: evidenced colours`);
 }
 // The notched outer studs of 60596 are drawn inline, not with a stud primitive; they still count as studs, not body.
 assert.equal(m.catalogPart('60596').h,18);
 for(const id of Object.values(FRAMES))assert.ok(attribution.rejected.some(r=>r.id===id&&r.fittedIn?.length===1),`${id}: never a standalone part`);
});

test('every new part keeps its connectors and cells in all four orientations',()=>{
 for(const id of NEW)for(const face of FACES){
  const p=piece(id,4,2,4,face),def=m.catalogPart(id),turned=face==='px'||face==='nx';
  assert.deepEqual([p.w,p.d,p.h],[turned?def.d:def.w,turned?def.w:def.d,def.h],`${id} ${face}: footprint`);
  const cells=m.pieceCellOffsets(p),top=m.topConnectorOffsets(p),bottom=m.bottomConnectorOffsets(p);
  assert.equal(cells.length,def.occupancy.length);assert.equal(top.length,def.topStuds.length);assert.equal(bottom.length,def.bottomSockets.length);
  for(const [x,y,z] of [...cells,...bottom])assert.ok(x>=0&&x<p.w&&z>=0&&z<p.d&&y>=0&&y<p.h,`${id} ${face}: ${x},${y},${z} inside`);
  for(const [x,y,z] of top)assert.ok(x>=0&&x<p.w&&z>=0&&z<p.d&&y===p.h,`${id} ${face}: stud on top`);
 }
});

test('glass and doors are fitted into their frames from LDraw shortcuts or documented hinge snaps',async()=>{
 for(const [frame,id] of Object.entries(FRAMES)){
  const f=m.fittedElement(frame);assert.equal(f.part,id);assert.equal(m.FITTED_ELEMENTS[id],f);assert.equal(f.default,'transclear');assert.ok(f.colors.includes('transclear')&&f.colors.includes('translightblue'));
  assert.ok(!Object.hasOwn(m.PARTS,id)&&Object.hasOwn(m.ELEMENTS,id),`${id}: bought, never placed alone`);assert.deepEqual(m.partColors(id),f.colors);
  assert.match(f.placement,frame==='60596'?/^LDCad shadow SNAP_FGR \[group=door\] 60596 \(-32 70 5\) with 60616b \(0 70 0\)$/:new RegExp(`^LDraw ${frame}c01\\.dat$`));
  const mesh=JSON.parse(await readFile(new URL(`../public${f.mesh}`,import.meta.url),'utf8')),p=m.catalogPart(frame);
  assert.equal(mesh.part,id);assert.ok(mesh.indices.length>0&&mesh.positions.every(Number.isFinite));assert.ok(mesh.groups.every(g=>g.color==='16'),'recoloured by the piece');
  // In the frame's own placement box: the door's stud handle stands 2.75 LDU proud of the frame face.
  const slack=frame==='60596'?.14:1e-6;
  for(let i=0;i<mesh.positions.length;i+=3){const [x,y,z]=mesh.positions.slice(i,i+3);assert.ok(Math.abs(x)<=p.w/2+1e-6&&Math.abs(y)<=p.h*.2+1e-6&&Math.abs(z)<=p.d/2+slack,`${frame}/${id}: vertex ${x},${y},${z} outside the frame box`);}
  await m.preloadPartGeometries([{part:frame}],fetchPublic);
  for(const face of FACES){const glass=m.fittedPartGeometry({part:frame,face}),body=m.exactPartGeometry({part:frame,face});glass.computeBoundingBox();body.computeBoundingBox();assert.ok(body.boundingBox.containsPoint(glass.boundingBox.getCenter(glass.boundingBox.min.clone())),`${frame} ${face}: fitted element turns with its frame`);}
 }
 assert.equal(m.fittedPartGeometry({part:'2877',face:'pz'}),null);assert.equal(m.fittedColor({part:'2877'}),undefined);
 assert.equal(m.fittedColor({part:'60592'}),'transclear');assert.equal(m.fittedColor({part:'60592',fitted:'translightblue'}),'translightblue');
});

test('LDraw export writes the fitted element in its own colour, turned and placed with its frame',()=>{
 for(const [frame,id] of Object.entries(FRAMES))for(const face of FACES){
  const p=piece(frame,3,2,5,face,{fitted:'translightblue'}),lines=m.ldrawFile([p],'Facade',[{title:'One',text:''}]).split('\n').filter(l=>l.startsWith('1 '));
  assert.equal(lines.length,2);const [host,glass]=lines.map(l=>l.split(/\s+/));
  assert.equal(host[14],`${frame}.dat`);assert.equal(glass[14],`${id}.dat`);assert.equal(glass[1],'43','trans-light blue is LDraw 43');assert.equal(host[1],'15');
  const r=host.slice(5,14).map(Number),at=host.slice(2,5).map(Number),g=glass.slice(2,5).map(Number),local=[0,1,2].map(c=>[0,1,2].reduce((s,i)=>s+r[i*3+c]*(g[i]-at[i]),0));
  assert.deepEqual(local.map(v=>Math.round(v*1e6)/1e6||0),m.fittedElement(frame).ldraw.position,`${frame} ${face}: same place in the frame`);
  assert.deepEqual(glass.slice(5,14).map(Number),r,`${frame} ${face}: same turn as the frame`);
 }
});

test('frames sit on studs, carry bricks, and their filled openings block other parts',()=>{
 const base={id:0,part:'3001',color:'white',x:0,y:0,z:0,w:4,d:2,h:3,rotated:false,stage:0};
 let pieces=m.addPiece([base],'60596','white',0,3,0,false,'pz');pieces=m.addPiece(pieces,'2877','gray',0,21,0,false,'pz');pieces=m.addPiece(pieces,'60592','red',0,3,1,false,'pz');
 const audit=m.auditModel(pieces);assert.equal(audit.overlaps,0);assert.deepEqual(audit.disconnected,[]);assert.deepEqual(audit.unsupported,[]);
 // The closed door fills the doorway and the glass the window: nothing else fits inside either opening.
 assert.throws(()=>m.addPiece(pieces,'3005','white',1,8,0,false),/space is occupied/);
 assert.throws(()=>m.addPiece(pieces,'3024','white',1,5,1,false),/space is occupied/);
 const door=pieces.find(p=>p.part==='60596');
 for(const face of FACES){const turned=piece('60596',20,3,20,face);assert.ok(!m.piecesIntersect(turned,door));assert.ok(m.piecesIntersect({...turned,x:door.x+1,z:door.z},door),`${face}: the doorway is filled`);}
 // A window clicked onto a stud lands with its sockets on studs.
 const placed=m.placeOnTopStud([base],'60593','black','px',base,{x:2.5,y:3,z:.5});assert.equal(placed.pieces.length,2);assert.equal(m.auditModel(placed.pieces).overlaps,0);
});

test('a frame keeps its glass or door colour through scenes, repair, painting and project files',()=>{
 const shapes=[box('Base',0,0,0,16,2,8),partShape('Shop window','60592',2,2,3,{color:'white',background:'translightblue'}),partShape('Door','60596',8,2,3,{color:'darkgreen',background:'brown'}),partShape('Upper window','60593',2,8,3,{color:'white'})];
 const scene=m.validateScene({catalogVersion:1,name:'Corner shop',description:'A shop front.',dimensions:{x:16,y:24,z:8},shapes},{fresh:true});
 const model=m.compileScene(scene),window=model.pieces.find(p=>p.part==='60592'),door=model.pieces.find(p=>p.part==='60596'),upper=model.pieces.find(p=>p.part==='60593');
 assert.equal(window.fitted,'translightblue');assert.equal(door.fitted,'brown');assert.equal(upper.fitted,undefined);assert.equal(m.fittedColor(upper),'transclear');
 // bg is the fitted colour on a frame and dropped elsewhere; the compact wire keeps it.
 const wire=m.compactShape(scene.shapes[1]);assert.equal(wire.bg,'translightblue');assert.equal(m.expandCompactShape(wire).background,'translightblue');
 assert.equal(m.expandCompactShape({...m.compactShape(partShape('Grille','2412b',0,2,0,{color:'black'})),bg:'red'}).background,undefined);
 // A fresh design may only ask for a fitted colour the element is made in; repair moves it to the nearest one.
 const wrong=[...shapes.slice(0,1),partShape('Shop window','60592',2,2,3,{color:'white',background:'red'})];
 assert.throws(()=>m.validateScene({catalogVersion:1,name:'Corner shop',description:'x',dimensions:{x:16,y:24,z:8},shapes:wrong},{fresh:true}),/Glass for Window 1 x 2 x 2 Flat \(60601\) in red/);
 const repaired=m.repairScene({catalogVersion:1,name:'Corner shop',description:'x',dimensions:{x:16,y:24,z:8},shapes:wrong});
 assert.ok(m.fittedElement('60592').colors.includes(repaired.scene.shapes[1].background));assert.ok(repaired.corrections.some(c=>/Glass for Window/.test(c)));
 // Painting a window with a glass colour glazes it; a frame colour paints the frame.
 assert.equal(m.paintPiece(window,'transclear').fitted,'transclear');assert.equal(m.paintPiece(window,'black').color,'black');assert.equal(m.paintPiece(window,'pink'),null);
 // Shopping lists, CSV and BrickLink name the fitted elements in their colours.
 const rows=m.inventoryFor(model.pieces);for(const key of ['60601:translightblue','60616b:brown','60602:transclear'])assert.ok(rows.some(r=>r.key===key&&r.quantity===1),key);
 assert.match(m.partsCSV(rows),/60601,Glass for Window 1 x 2 x 2 Flat,Trans-light blue,1/);assert.match(m.bricklinkXML(rows),/<ITEMID>60616b<\/ITEMID><COLOR>88<\/COLOR>/);
 assert.equal(m.resolveLegoElement('60601','translightblue').pending,true);
 // A saved project reopens with the same fitted colours.
 const reopened=m.validateProject(JSON.parse(m.projectJSON({...model,generation:scene},m.emptyShopping())));
 assert.equal(reopened.pieces.find(p=>p.part==='60592').fitted,'translightblue');assert.equal(reopened.pieces.find(p=>p.part==='60596').fitted,'brown');assert.deepEqual(m.inventoryFor(reopened.pieces),rows);
 const edited=m.editModel(reopened,reopened.pieces.map(p=>p.part==='60593'?{...p,fitted:'translightblue'}:p));assert.equal(edited.pieces.find(p=>p.part==='60593').fitted,'translightblue');
 // Only frames carry a fitted colour; an imported file cannot give one to a plain brick.
 const file=JSON.parse(m.projectJSON({...reopened,generation:undefined,design:undefined},m.emptyShopping())),plain=file.pieces.findIndex(p=>!m.fittedElement(p.part)),frame=file.pieces.findIndex(p=>p.part==='60593');
 file.pieces[plain].fitted='transclear';file.pieces[frame].fitted='pearlgold';const imported=m.validateProject(file);
 assert.equal(imported.pieces[plain].fitted,undefined);assert.equal(imported.pieces[frame].fitted,'pearlgold');
});

test('briefs for shops, homes and stations shortlist real windows, doors and facade details',()=>{
 for(const prompt of ['A corner café with a striped awning','A four-storey apartment building','A small railway station with a platform canopy']){
  const ids=m.buildGenerationPartCatalog({prompt}).parts.map(p=>p.id);
  assert.ok(ids.includes('60592')||ids.includes('60593'),`${prompt}: a window frame`);assert.ok(ids.includes('60596'),`${prompt}: a door frame`);
 }
 const cafe=m.buildGenerationPartCatalog({prompt:'A corner café with a striped awning'}).parts,frame=cafe.find(p=>p.id==='60592');
 assert.deepEqual(frame.fitted,{id:'60601',name:'Glass for Window 1 x 2 x 2 Flat',colors:m.fittedElement('60592').colors,default:'transclear'});
 assert.ok(cafe.some(p=>['2412b','2877','98283','4216'].includes(p.id)),'a facade detail');
 assert.ok(!m.buildGenerationPartCatalog({prompt:'A red sports car with a low curved nose'}).parts.some(p=>p.family==='window'||p.family==='door'));
 assert.match(m.DESIGN_INSTRUCTIONS,/real window and door frames with their fitted glass or door/);assert.match(m.DESIGN_INSTRUCTIONS,/bg is that element's colour from fitted\.colors/);
});
