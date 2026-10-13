import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export * from "./lib/colors";export * from "./lib/brick-materials";export * from "./lib/part-colors";export {PARTS,LEGACY_PARTS,partsCSV,bricklinkXML,ldrawFile} from "./lib/bridge";export {packVoxels,smoothTops,nearestColor,parseIdea,mosaicFromPixels,validateProject,voxelKey,inventoryFor} from "./lib/models";export {carveSlopes} from "./lib/slopes";export {catalogPiece,expandCompactShape,compactJSONSchema,sceneJSONSchema,compileScene} from "./lib/generated-scene";export {repairScene} from "./lib/scene-repair";export {DESIGN_INSTRUCTIONS} from "./lib/generation-provider";export {RESEARCH_INSTRUCTIONS} from "./lib/design-research";export {projectJSON,emptyShopping} from "./lib/design-project";export {sanitizeSharedProject} from "./lib/share";export {prepareLegoShopping} from "./app/lego-shopping-data";export {catalogOptions,partColorAllowed} from "./app/part-picker-data";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'error',external:['cloudflare:workers']});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const keys=Object.keys(m.COLORS),added=keys.filter(k=>!m.CLASSIC_COLORS.includes(k));
const piece=(id,part,color,x,y,z,extra={})=>({id,part,color,x,y,z,...(({w,d,h})=>({w,d,h}))(m.PARTS[part]),rotated:false,stage:0,...extra});

test('the colour table keeps every classic key and gives each colour unique LDraw, BrickLink and Rebrickable IDs',()=>{
 // Saved projects and shares store these keys and values: they must never change.
 assert.deepEqual(keys.slice(0,13),['yellow','brown','darkbrown','pink','red','orange','blue','navy','black','gray','white','green','tan']);
 assert.deepEqual([...m.CLASSIC_COLORS].sort(),keys.slice(0,13).sort());
 const classic={yellow:[14,3,'#f2cd37'],brown:[70,88,'#582a12'],darkbrown:[308,120,'#352100'],pink:[29,104,'#e4adc8'],red:[4,5,'#c92820'],orange:[25,4,'#ed7825'],blue:[1,7,'#0055bf'],navy:[272,63,'#183b54'],black:[0,11,'#292f34'],gray:[71,86,'#a9b1b8'],white:[15,1,'#f3f0e5'],green:[2,6,'#3f7750'],tan:[19,2,'#c6ab78']};
 for(const [k,[ldraw,bricklink,hex]] of Object.entries(classic))assert.deepEqual([m.COLORS[k].ldraw,m.COLORS[k].bricklink,m.COLORS[k].hex,m.COLORS[k].rebrickable],[ldraw,bricklink,hex,ldraw],k);
 for(const field of ['ldraw','bricklink','rebrickable','name','hex'])assert.equal(new Set(keys.map(k=>m.COLORS[k][field])).size,keys.length,`unique ${field}`);
 // Source-verified (LDConfig, Rebrickable colours, BrickLink): key → [Rebrickable, LDraw, BrickLink, hex].
 const expected={darkgray:[72,72,85,'#6c6e68'],darktan:[28,28,69,'#958a73'],darkred:[320,320,59,'#720e0f'],sandgreen:[378,378,48,'#a0bcac'],darkgreen:[288,288,80,'#184632'],mediumazure:[322,322,156,'#36aebf'],lime:[27,27,34,'#bbe90b'],mediumnougat:[84,84,150,'#aa7d55'],transclear:[47,47,12,'#fcfcfc'],translightblue:[41,43,15,'#aeefec'],pearlgold:[297,297,115,'#aa7f2e'],flatsilver:[179,179,95,'#898788']};
 assert.deepEqual(added,Object.keys(expected));
 for(const [k,[rb,ldraw,bl,hex]] of Object.entries(expected))assert.deepEqual([m.COLORS[k].rebrickable,m.COLORS[k].ldraw,m.COLORS[k].bricklink,m.COLORS[k].hex],[rb,ldraw,bl,hex],k);
 // The trap: Rebrickable 43 is Trans-Very Lt Blue (BrickLink 113), so no key may carry it as its Rebrickable ID.
 assert.ok(!keys.some(k=>m.COLORS[k].rebrickable===43));assert.equal(keys.filter(k=>m.COLORS[k].rebrickable!==m.COLORS[k].ldraw).join(),'translightblue');
 assert.deepEqual(keys.filter(k=>m.COLORS[k].transparent),['transclear','translightblue']);assert.deepEqual(keys.filter(k=>m.COLORS[k].metallic),['pearlgold','flatsilver']);
 assert.ok(m.SOLID_COLORS.includes('darkgray')&&!m.SOLID_COLORS.some(k=>m.COLORS[k].transparent||m.COLORS[k].metallic));
 assert.deepEqual([...m.SKIN_COLORS],['yellow','tan','mediumnougat','brown','darkbrown']);
});

test('the material picker gives glass blending without depth writes and pearl a metallic sheen',()=>{
 assert.deepEqual(m.colorFinish('red'),{kind:'solid',transparent:false,opacity:1,depthWrite:true,metalness:0});
 const glass=m.colorFinish('transclear');assert.equal(glass.kind,'transparent');assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);assert.ok(glass.opacity>.4&&glass.opacity<.7);
 assert.deepEqual(m.colorFinish('translightblue'),glass);
 const pearl=m.colorFinish('pearlgold');assert.equal(pearl.kind,'metallic');assert.ok(pearl.metalness>=.4&&pearl.opacity===1&&pearl.depthWrite);assert.deepEqual(m.colorFinish('flatsilver'),pearl);
 for(const k of m.SOLID_COLORS)assert.equal(m.colorFinish(k).kind,'solid',k);
 let envCalls=0;const env=()=>{envCalls++;return {isTexture:true};};
 const solid=m.brickMaterial('darkgray',{roughness:.3,environment:env});assert.equal(solid.transparent,false);assert.equal(solid.depthWrite,true);assert.equal(solid.roughness,.3);assert.equal(solid.metalness,0);assert.equal(solid.userData.baseOpacity,1);
 const pane=m.brickMaterial('transclear',{roughness:.3,environment:env});assert.equal(pane.transparent,true);assert.equal(pane.depthWrite,false);assert.equal(pane.opacity,glass.opacity);assert.equal(pane.userData.baseOpacity,glass.opacity);assert.ok(pane.roughness<.3);
 assert.equal(envCalls,0,'only metallic colours build the reflection environment');
 const gold=m.brickMaterial('pearlgold',{roughness:.3,vertexColors:true,environment:env});assert.equal(gold.metalness,pearl.metalness);assert.equal(envCalls,1);assert.ok(gold.envMap);assert.equal(gold.vertexColors,true);
 assert.equal(m.finishColor({part:'3001',color:'transclear'}),'transclear');assert.equal(m.finishColor({part:'minifig',color:'transclear',legs:'transclear',skin:'yellow'}),'white','a trans torso does not make the head glass');
 assert.equal(m.finishColor({part:'minifig',color:'transclear',legs:'transclear',skin:'transclear'}),'transclear');assert.equal(m.finishColor({part:'minifig',color:'pearlgold',legs:'flatsilver',skin:'yellow'}),'white');
 assert.match(m.colorSwatch('transclear'),/repeating-conic-gradient/);assert.match(m.colorSwatch('pearlgold'),/linear-gradient\(135deg/);assert.equal(m.colorSwatch('red'),'#c92820');
 // The viewport groups pieces per colour and the review renderer per finish, so instancing stays batched.
 return Promise.all(['../app/viewport.tsx','../lib/render-review.ts'].map(f=>readFile(new URL(f,import.meta.url),'utf8'))).then(([viewport,review])=>{
  assert.match(viewport,/brickMaterial\(finishColor\(p\)/);assert.match(viewport,/material\.opacity=opacity\*\(material\.userData\.baseOpacity\?\?1\)/);
  assert.match(review,/colorFinish\(p\.color\)\.kind/);assert.match(review,/materialFor\(finishColor\(first\),figure\)/);
 });
});

test('part colours: legacy parts keep the classic palette and gain only evidenced new colours',()=>{
 for(const id of Object.keys(m.LEGACY_PARTS)){const list=m.partColors(id);for(const k of m.CLASSIC_COLORS)assert.ok(list.includes(k),`${id}:${k}`);}
 assert.equal(m.partAllowsColor('3035','pearlgold'),false,'no 4 x 8 plate in pearl gold');assert.equal(m.partAllowsColor('3001','translightblue'),false);
 assert.equal(m.partAllowsColor('3024','translightblue'),true);assert.equal(m.partAllowsColor('3005','transclear'),true);
 for(const k of keys)assert.ok(m.partAllowsColor('minifig',k),`minifig ${k}`);
 assert.equal(m.partColorAllowed('3035','pearlgold'),false);const option=m.catalogOptions().find(o=>o.id==='3035');assert.ok(option.colors.includes('darkgray')&&!option.colors.includes('pearlgold'));
 assert.equal(m.PART_COLOR_EVIDENCE.provisional,true);
});

test('packing uses only parts made in each colour and never drops a voxel',()=>{
 const voxels=new Map();for(let x=0;x<8;x++)for(let z=0;z<8;z++)for(let y=0;y<6;y++)voxels.set(m.voxelKey(x,y,z),y<2?'darkgray':y<4?'pearlgold':'transclear');
 const pieces=m.packVoxels(voxels);
 for(const p of pieces)assert.ok(m.partAllowsColor(p.part,p.color),`${p.part} is not made in ${p.color}`);
 const cells=pieces.reduce((n,p)=>n+p.w*p.d*p.h,0);assert.equal(cells,voxels.size,'every voxel is filled');
 assert.ok(pieces.some(p=>p.color==='darkgray'&&(p.part==='3035'||p.part==='3034')),'dark bluish gray keeps large plates');
 assert.ok(!pieces.some(p=>p.color==='pearlgold'&&['3035','3034','3020','3001'].includes(p.part)),'no unevidenced pearl gold plates or bricks');
 const smooth=m.smoothTops(pieces);for(const p of smooth)assert.ok(m.partAllowsColor(p.part,p.color),`smoothed ${p.part} in ${p.color}`);
 // Classic colours are untouched by the new filters.
 const classic=new Map([...voxels].map(([k,c])=>[k,c==='pearlgold'?'yellow':c==='transclear'?'white':'gray']));const packed=m.packVoxels(classic);
 assert.ok(packed.some(p=>p.part==='3035'||p.part==='3007'||p.part==='3001'));
 // Slopes are carved only from slope parts made in that colour: none in flat silver for a 45 degree pair.
 const stair=c=>{const v=new Map();for(let x=0;x<4;x++){for(let y=0;y<6;y++)v.set(m.voxelKey(x,y,0),c);for(let y=0;y<3;y++)v.set(m.voxelKey(x,y,1),c);}return v;};
 assert.ok(m.carveSlopes(stair('red')).some(p=>p.part==='3039'||p.part==='3040'),'a classic 45 degree step becomes slopes');
 assert.ok(m.carveSlopes(stair('darkgray')).some(p=>p.part==='3039'||p.part==='3040'),'dark bluish gray 45 degree slopes exist');
 const silver=m.carveSlopes(stair('flatsilver'));assert.ok(silver.length&&!silver.some(p=>p.part==='3039'||p.part==='3040'),'no 45 degree slope is evidenced in flat silver');
 for(const p of silver)assert.ok(m.partAllowsColor(p.part,'flatsilver'),p.part);
});

test('generation and repair respect part colours; minifig skin stays a skin tone',()=>{
 const shape=(part,color)=>({label:'p',kind:'part',operation:'add',color,position:{x:2,y:2,z:2},size:{x:1,y:1,z:1},end:{x:0,y:0,z:0},radius:1,part,face:'pz'});
 assert.throws(()=>m.catalogPiece(shape('3035','pearlgold')),/does not list part 3035 in pearlgold/);
 assert.equal(m.catalogPiece(shape('3024','pearlgold')).color,'pearlgold');assert.equal(m.catalogPiece(shape('3001','red')).color,'red');
 const compact={i:'f',c:'People',l:'Figure',k:'minifig',o:'add',a:null,col:'red',p:[2,2,2],s:[2,12,1],e:null,r:null,rep:null,txt:null,face:'pz',bg:'blue',pid:'mediumnougat'};
 assert.equal(m.expandCompactShape(compact).skin,'mediumnougat');assert.equal(m.expandCompactShape({...compact,pid:'lime'}).skin,undefined,'lime is not a skin tone');
 const base={id:'base',component:'Base',label:'Base',kind:'box',operation:'add',color:'darkgray',position:{x:0,y:0,z:0},size:{x:10,y:2,z:10},end:{x:0,y:0,z:0},radius:1};
 const scene={name:'Glass',description:'A pane.',dimensions:{x:10,y:12,z:10},shapes:[base,{...shape('3001','transclear'),id:'pane'}]};
 assert.equal(m.repairScene(scene).scene.shapes.find(s=>s.id==='pane').color,'transclear','3001 is evidenced in trans-clear');
 const blue=m.repairScene({...scene,shapes:[base,{...shape('3001','translightblue'),id:'pane'}]}).scene.shapes.find(s=>s.id==='pane');
 assert.equal(blue.color,'transclear','glass stays glass when the part has another trans colour');
});

test('prompts and schemas offer every colour with usage guidance',()=>{
 const allowed=m.DESIGN_INSTRUCTIONS.split('\n').find(l=>l.includes('Allowed colors:'));assert.ok(allowed);
 for(const k of keys){assert.match(allowed,new RegExp(`\\b${k}\\b`),k);assert.match(m.RESEARCH_INSTRUCTIONS,new RegExp(`\\b${k}\\b`),k);}
 assert.match(allowed,/transclear\/translightblue for glass, windows/);assert.match(allowed,/darkgray for asphalt, concrete/);assert.match(allowed,/pearlgold\/flatsilver for small metallic accents only/);
 assert.match(m.RESEARCH_INSTRUCTIONS,/transclear\/translightblue for glass/);assert.match(m.DESIGN_INSTRUCTIONS,/tan, mediumnougat, brown or darkbrown are realistic skin tones/);
 const shape=m.compactJSONSchema.properties.sh.items.properties;assert.deepEqual(shape.col.enum,keys);assert.deepEqual(shape.bg.anyOf[0].enum,keys);
 assert.ok(JSON.stringify(m.sceneJSONSchema).includes('"translightblue"'));
});

test('exports use each colour\'s own LDraw code, BrickLink ID and name',async()=>{
 const pieces=[piece(0,'3024','translightblue',0,0,0),piece(1,'3005','transclear',2,0,0),piece(2,'3023','pearlgold',4,0,0),piece(3,'3001','darkgray',0,1,2)];
 const ldraw=m.ldrawFile(pieces,'Palette',[{title:'All',text:''}]);
 assert.match(ldraw,/^1 43 .* 3024\.dat$/m);assert.match(ldraw,/^1 47 .* 3005\.dat$/m);assert.match(ldraw,/^1 297 .* 3023\.dat$/m);assert.match(ldraw,/^1 72 .* 3001\.dat$/m);
 const rows=m.inventoryFor(pieces),xml=m.bricklinkXML(rows);
 assert.match(xml,/<ITEMID>3024<\/ITEMID><COLOR>15<\/COLOR>/);assert.match(xml,/<ITEMID>3005<\/ITEMID><COLOR>12<\/COLOR>/);assert.match(xml,/<ITEMID>3023<\/ITEMID><COLOR>115<\/COLOR>/);assert.match(xml,/<ITEMID>3001<\/ITEMID><COLOR>85<\/COLOR>/);
 const csv=m.partsCSV(rows);assert.match(csv,/Trans-light blue/);assert.match(csv,/Pearl gold/);assert.match(csv,/Dark bluish gray/);
 // Shopping: a new colour has no element ID yet and says so; it is never matched to a substitute.
 const shop=m.prepareLegoShopping(rows,{},{});assert.ok(shop.unmatched.every(r=>r.catalog.pending===true));assert.equal(shop.matched.length,0);
 assert.match(await readFile(new URL('../app/lego-shopping.tsx',import.meta.url),'utf8'),/No exact LEGO element yet — verify on BrickLink/);
});

test('saved projects with classic colours load unchanged, and new colours round-trip through projects and shares',()=>{
 const classic=m.CLASSIC_COLORS.map((c,i)=>piece(i,'3005',c,i*2,0,0));classic.push({...piece(13,'minifig','red',0,0,4),legs:'navy',skin:'tan',face:'pz'});
 const legacy={format:'brickwork',version:3,name:'Classic',description:'Thirteen colours.',pieces:classic};
 const loaded=m.validateProject(JSON.parse(JSON.stringify(legacy)));
 assert.deepEqual(loaded.pieces.map(p=>[p.part,p.color,p.x,p.legs,p.skin]),classic.map(p=>[p.part,p.color,p.x,p.legs,p.skin]));
 assert.deepEqual(loaded.inventory.map(r=>r.key).sort(),[...m.CLASSIC_COLORS.map(c=>`3005:${c}`),'minifig:red'].sort());
 const fresh=[piece(0,'3024','translightblue',0,0,0),piece(1,'3001','darkgray',2,0,0),piece(2,'3023','pearlgold',0,1,0),{...piece(3,'minifig','darkred',6,0,0),legs:'flatsilver',skin:'mediumnougat',face:'px'}];
 const model=m.validateProject({format:'brickwork',version:3,name:'New colours',description:'Glass and gold.',pieces:fresh});
 const again=m.validateProject(JSON.parse(m.projectJSON(model,m.emptyShopping())));
 assert.deepEqual(again.pieces.map(p=>[p.part,p.color,p.legs,p.skin]),model.pieces.map(p=>[p.part,p.color,p.legs,p.skin]));
 const shared=m.sanitizeSharedProject(JSON.parse(m.projectJSON(model,m.emptyShopping())));assert.equal(shared.pieceCount,4);
 const remixed=m.validateProject(JSON.parse(shared.project));assert.deepEqual(remixed.pieces.map(p=>p.color),['translightblue','darkgray','pearlgold','darkred']);
 assert.throws(()=>m.validateProject({format:'brickwork',version:3,name:'x',pieces:[piece(0,'3024','chrome',0,0,0)]}),/unsupported part/);
});

test('ideas and pictures map into the wider palette without glass or metal by accident',()=>{
 assert.equal(m.parseIdea('a dark red castle with dark bluish gray roofs').color,'darkred');assert.equal(m.parseIdea('a dark red castle with dark bluish gray roofs').accent,'darkgray');
 assert.equal(m.parseIdea('a red house').color,'red');assert.equal(m.parseIdea('a sand-green lighthouse').color,'sandgreen');assert.equal(m.parseIdea('a dark brown dog').color,'darkbrown');
 assert.equal(m.parseIdea('a silver rocket').color,'gray');assert.equal(m.parseIdea('a clear glass house').color,'tan','presets stay opaque');
 const white=new Uint8ClampedArray(64).fill(255),mosaic=m.mosaicFromPixels(white,4,4,'Snow');assert.ok(mosaic.pieces.every(p=>!m.COLORS[p.color].transparent));assert.match(mosaic.description,/21-color/);
});
