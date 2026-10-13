import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const [catalog,elements,selection,attribution,colorEvidence,publicCatalog]=await Promise.all([
 json('../lib/data/parts-catalog.json'),json('../lib/data/lego-elements.json'),json('../scripts/part-catalog-selection.json'),json('../public/parts/attribution.json'),json('../scripts/part-color-evidence.json'),json('../public/parts/catalog.json'),
]);
// Colours added after the classic palette are evidenced by refresh-part-colors.mjs, not by element IDs.
const added=new Set(catalog.colorEvidence.colors),evidenced=(part,color)=>{const e=colorEvidence.combos[`${part}:${color}`];return Array.isArray(e)&&(e[0]>0||e[1]>0);};
const parts=Object.entries(catalog.parts),chosen=new Map(selection.parts.map(p=>[p.id,p])),palette=new Set(Object.keys(selection.colorIds));
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,`${label}: duplicate entries`);
const triple=(cell,label)=>assert.ok(Array.isArray(cell)&&cell.length===3&&cell.every(Number.isFinite),`${label}: finite xyz tuple`);
const cellKey=cell=>cell.join(',');
const publicFile=url=>{assert.match(url,/^\/parts\/ldraw\/[\w-]+\.(json|svg)$/);return new URL(`../public${url}`,import.meta.url);};

test('the catalog contains hundreds of source-backed usable parts with exact integer spatial contracts',()=>{
 assert.equal(catalog.version,1);assert.ok(parts.length>=250,`only ${parts.length} expanded parts`);
 for(const [id,p] of parts){
  assert.match(id,/^[a-z0-9]+$/);assert.ok(p.name&&p.family,`${id}: name/family`);
  assert.ok([p.w,p.d,p.h].every(n=>Number.isInteger(n)&&n>0),`${id}: positive integer extents`);
  assert.ok(p.w<=32&&p.d<=32&&p.h<=48&&p.w*p.d*p.h<=8192,`${id}: bounded dimensions`);
  assert.ok(Number.isFinite(p.price)&&p.price>=0,`${id}: estimate`);triple(p.ldrawOffset,`${id}: source origin`);
  assert.ok(p.occupancy.length>0&&p.bottomSockets.length>0,`${id}: body and documented sockets required`);
  for(const field of ['occupancy','topStuds','bottomSockets']){
   unique(p[field].map(cellKey),`${id} ${field}`);
   for(const c of p[field]){triple(c,`${id} ${field}`);const [x,y,z]=c;assert.ok(c.every(Number.isInteger)&&x>=0&&x<p.w&&z>=0&&z<p.d&&y>=0&&y<(field==='occupancy'?p.h:p.h+1),`${id} ${field}: ${c} outside body grid`);}
  }
  const occupied=new Set(p.occupancy.map(cellKey));
  for(const [x,y,z] of p.topStuds)assert.ok(occupied.has(`${x},${y-1},${z}`),`${id}: unsupported stud ${x},${y},${z}`);
  for(const socket of p.bottomSockets)assert.ok(occupied.has(cellKey(socket)),`${id}: socket without body above ${socket}`);
  const source=chosen.get(id);assert.ok(source&&!source.legacy,`${id}: selected source`);
  assert.equal(source.ldrawFile,`${id}.dat`);assert.equal(p.sourcePart,source.rebrickableId);assert.equal(p.family,source.family);
  if(p.handedness){assert.ok(['left','right'].includes(p.handedness));const mate=catalog.parts[p.counterpart];assert.ok(mate&&mate.counterpart===id&&mate.handedness!==p.handedness,`${id}: reciprocal handed part`);}
 }
});

test('every offered catalog color has an exact sourced element match or recorded production evidence, with no stock claims',()=>{
 for(const [id,p] of parts){
  assert.ok(p.colors.length,`${id}: no evidenced colors`);unique(p.colors,`${id}: colors`);
  assert.deepEqual(p.colors,chosen.get(id).colors,`${id}: selection color provenance`);
  for(const color of p.colors){
   assert.ok(palette.has(color),`${id}: unknown color ${color}`);
   if(added.has(color)){assert.ok(evidenced(id,color),`${id}:${color}: no production evidence`);assert.equal(elements.elements[`${id}:${color}`],undefined,`${id}:${color}: no substituted element ID`);continue;}
   assert.ok(elements.elements[`${id}:${color}`]?.length,`${id}:${color}: unsupported element match`);assert.ok(!elements.missing.includes(`${id}:${color}`));
  }
 }
 assert.equal(Object.hasOwn(catalog,'stock'),false);assert.equal(Object.hasOwn(catalog,'availability'),false);assert.match(attribution.prices,/estimate/i);
});

test('every exact mesh has finite geometry, valid indices, normalized normals and matching face winding',async()=>{
 let triangles=0;
 for(const [id,p] of parts){
  const mesh=JSON.parse(await readFile(publicFile(p.mesh),'utf8'));
  assert.equal(mesh.version,1);assert.equal(mesh.part,id);assert.ok(mesh.positions.length>0&&mesh.positions.length%3===0,`${id}: xyz positions`);
  assert.equal(mesh.normals.length,mesh.positions.length,`${id}: normals`);assert.ok(mesh.indices.length>0&&mesh.indices.length%3===0,`${id}: triangles`);
  assert.ok(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite),`${id}: finite coordinates`);
  const vertices=mesh.positions.length/3;assert.ok(mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<vertices),`${id}: index bounds`);
  for(let i=0;i<mesh.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i,i+3))-1)<1e-4,`${id}: unit normal at ${i/3}`);
  let end=0;for(const group of mesh.groups){assert.equal(group.start,end,`${id}: contiguous material groups`);assert.equal(group.color,'16',`${id}: current-color geometry`);assert.ok(Number.isInteger(group.count)&&group.count>0&&group.count%3===0);end+=group.count;}assert.equal(end,mesh.indices.length);
  for(let i=0;i<mesh.indices.length;i+=3){
   const ids=mesh.indices.slice(i,i+3),v=ids.map(index=>mesh.positions.slice(index*3,index*3+3));
   const u=v[1].map((n,j)=>n-v[0][j]),w=v[2].map((n,j)=>n-v[0][j]),cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],area=Math.hypot(...cross);
   assert.ok(area>1e-10,`${id}: degenerate triangle ${i/3}`);
   const normal=[0,1,2].map(axis=>ids.reduce((sum,index)=>sum+mesh.normals[index*3+axis],0)/3),alignment=cross.reduce((sum,n,axis)=>sum+n*normal[axis],0)/area;
   assert.ok(alignment>=-1e-4,`${id}: face ${i/3} winds against its vertex normals`);triangles++;
  }
  const thumbnail=await readFile(publicFile(p.thumbnail),'utf8');assert.match(thumbnail,/<svg\b/);assert.match(thumbnail,/data:image\/png;base64,/);assert.ok(!/<(?:script|foreignObject)\b|https?:\/\/(?!www\.w3\.org)/i.test(thumbnail),`${id}: self-contained thumbnail`);
 }
 assert.ok(triangles>10000,'catalog includes detailed meshes');
});

test('source files retain authorship, content hashes, upstream licenses and shipped license text',async()=>{
 assert.match(attribution.geometry.commit,/^[a-f0-9]{40}$/);assert.match(attribution.connections.commit,/^[a-f0-9]{40}$/);
 assert.match(attribution.geometry.url,/^https:\/\/(library\.)?ldraw\.org\//);assert.equal(attribution.connections.url,catalog.connectionSource);assert.match(attribution.connections.license,/CC BY-SA 4\.0/);
 const files=new Map(attribution.geometry.files.map(f=>[f.path,f]));assert.equal(files.size,attribution.geometry.files.length);
 for(const [id] of parts)assert.ok(files.has(`parts/${id}.dat`),`${id}: missing root source attribution`);
 for(const file of files.values()){assert.ok(file.author&&file.author!=='Unknown author',`${file.path}: author`);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.match(file.license,/Licensed under CC BY (?:2\.0 and CC BY )?4\.0/);assert.ok(!file.path.includes('..')&&!file.path.startsWith('/'));}
 unique(attribution.connections.files.map(f=>f.file),'connector source files');for(const file of attribution.connections.files)assert.match(file.sha256,/^[a-f0-9]{64}$/);
 const licenseFiles=['ldraw/CAreadme.txt','ldraw/CAlicense.txt','ldraw/CAlicense4.txt','ldcad/LICENSE.md'];
 for(const file of licenseFiles){const text=await readFile(new URL(`../public/licenses/${file}`,import.meta.url),'utf8');assert.ok(text.length>300,`${file}: complete license text`);assert.match(text,/Creative Commons|CC BY/i);}
 assert.match(attribution.collision,/Conservative/);assert.match(attribution.collision,/sub-stud/);
});

test('rounded LDraw primitives do not inflate nominal body dimensions by a whole stud or plate',()=>{
 for(const [id,expected] of [['3941',[2,2,3]],['4032a',[2,2,1]],['30367c',[2,2,3]],['11213',[6,6,1]],['64448',[6,1,15]]]){
  const p=catalog.parts[id];assert.ok(p,`${id}: regression part present`);assert.deepEqual([p.w,p.d,p.h],expected,id);
 }
 const round=catalog.parts['6141'];assert.deepEqual(round.topStuds,[[0,1,0]],'documented compound cylinder still exposes its ordinary top stud');
});

test('added colours are offered only where evidenced and their provenance is recorded and provisional',()=>{
 const meta=catalog.colorEvidence;assert.equal(meta.source,'rebrickable-2022-elements+2026-inventories');assert.equal(meta.provisional,true);assert.equal(meta.evidence,'scripts/part-color-evidence.json');
 assert.deepEqual(publicCatalog.colorEvidence,meta);assert.deepEqual(publicCatalog.legacyColors,catalog.legacyColors);assert.deepEqual(selection.colorEvidence.colors,meta.colors);assert.equal(selection.colorEvidence.provisional,true);
 assert.equal(colorEvidence.source,meta.source);assert.equal(colorEvidence.provisional,true);
 for(const file of colorEvidence.files){assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.match(file.url,/^https:\/\/(raw\.githubusercontent\.com\/rfordatascience\/tidytuesday\/|registry\.npmjs\.org\/lego-oracle\/)/);}
 // Selection colour IDs are Rebrickable IDs: trans-light blue is 41 (LDraw 43 would be Trans-Very Lt Blue).
 assert.equal(selection.colorIds.translightblue,41);assert.equal(colorEvidence.colorIds.translightblue,41);
 for(const key of meta.colors)assert.equal(selection.colorIds[key],colorEvidence.colorIds[key]);
 const classic=Object.keys(selection.colorIds).filter(k=>!added.has(k));assert.equal(classic.length,13);
 let offered=0;
 for(const p of selection.parts)for(const color of p.colors)if(added.has(color)){assert.ok(evidenced(p.id==='3040b'?'3040':p.id,color),`${p.id}:${color}: selection colour without evidence`);offered++;}
 assert.ok(offered>1000);
 for(const [id,list] of Object.entries(catalog.legacyColors)){
  unique(list,`${id}: legacy colors`);assert.deepEqual(list.slice(0,13).sort(),[...classic].sort(),`${id}: legacy parts keep every classic colour`);
  for(const color of list.slice(13)){assert.ok(added.has(color));assert.ok(evidenced(id,color),`${id}:${color}: legacy colour without evidence`);}
 }
 for(const combo of Object.keys(colorEvidence.combos)){const [id,color]=combo.split(':');assert.ok(added.has(color));assert.ok(evidenced(id,color));assert.ok((catalog.parts[id]?.colors||catalog.legacyColors[id]||chosen.get(id).colors).includes(color),`${combo}: evidence not applied`);}
 // Sparse finishes stay sparse: no 4 x 8 plate in pearl gold or trans-clear.
 assert.ok(!catalog.legacyColors['3035'].includes('pearlgold'));assert.ok(!catalog.legacyColors['3035'].includes('transclear'));
 assert.ok(catalog.legacyColors['3024'].includes('translightblue')&&catalog.legacyColors['3024'].includes('pearlgold'));
});
