import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true},logLevel:'error'});
after(()=>vite.close());
const [history,project,scenes,region,library]=await Promise.all([vite.ssrLoadModule('/lib/revision-history.ts'),vite.ssrLoadModule('/lib/design-project.ts'),vite.ssrLoadModule('/lib/generated-scene.ts'),vite.ssrLoadModule('/lib/revision-region.ts'),vite.ssrLoadModule('/lib/design-library.ts')]);
const {addVersion,componentDiff,diffSummary,componentLabel,pieceOwners,piecesOf,componentsInBounds,composeRegion,TAP_POLYGON,changedPieceIds,highlightChanges,sameVersion,previousVersion,compactReview}=history;
const {contextSchema,defaultBrief,emptyManual,projectJSON,emptyShopping,readProjectMetadata,MAX_VERSIONS}=project;
const {compileScene,validateScene}=scenes;
const {revisionRegionSchema,revisionSceneKey}=region;

const box=(id,component,position,size,color,operation='add')=>({id,component,label:id,kind:'box',operation,color,position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
const cafe=(awningHeight=2,extra=[])=>validateScene({catalogVersion:1,name:'Corner café',description:'A small corner café with a red awning.',notes:['Roof simplified to a flat slab'],dimensions:{x:20,y:26,z:14},shapes:[box('Base','Base',{x:0,y:0,z:0},{x:20,y:2,z:14},'gray'),box('Cafe','Cafe',{x:2,y:2,z:2},{x:16,y:18,z:5},'tan'),box('Awning','Awning',{x:2,y:20,z:2},{x:16,y:awningHeight,z:7},'red'),...extra]});
const compiled=scene=>compileScene(scene,{manual:emptyManual(),smooth:true});
const review={summary:'Reads as a café.',recognizable:true,features:[],improvements:['Step the Awning'],thinking:'x'.repeat(3000)};
const version=(scene,label='First build')=>({at:'2026-10-13T00:00:00.000Z',label,scene,manual:emptyManual(),locked:[],brief:defaultBrief('A corner café'),review,pieces:compiled(scene).pieces.length});

test('versions number for the design\'s life, keep the last ten and drop the review\'s thinking',()=>{
 let list=[];for(let i=0;i<14;i++)list=addVersion(list,version(cafe(2+(i%3)),`Pass ${i+1}`));
 assert.equal(list.length,MAX_VERSIONS);assert.equal(MAX_VERSIONS,10);
 assert.deepEqual(list.map(v=>v.n),[5,6,7,8,9,10,11,12,13,14]);
 assert.equal(list.at(-1).label,'Pass 14');assert.equal(list[0].review.thinking,undefined,'thinking is not kept');
 assert.equal(addVersion([],{...version(cafe()),label:'x'.repeat(400)})[0].label.length,300);
 assert.equal(previousVersion(list,14).n,13);assert.equal(previousVersion(list,5),undefined);assert.equal(compactReview(null),undefined);
});

test('kept versions validate through contextSchema and survive a project round trip; bad ones are rejected',()=>{
 const scene=cafe(),model=compiled(scene),list=addVersion(addVersion([],version(scene)),version(cafe(4),'Make the awning taller'));
 const design={brief:defaultBrief('A corner café'),manual:emptyManual(),locked:[],revisions:[],versions:list};
 assert.equal(contextSchema.safeParse(design).success,true);
 const data=JSON.parse(projectJSON({...model,generation:scene,design},emptyShopping()));
 const read=readProjectMetadata(data,model.pieces);
 assert.equal(read.design.versions.length,2);assert.deepEqual(read.design.versions.map(v=>v.n),[1,2]);
 assert.equal(contextSchema.safeParse({...design,versions:Array.from({length:11},(_,i)=>({...list[0],n:i+1}))}).success,false,'more than ten versions is invalid');
 assert.equal(contextSchema.safeParse({...design,versions:[{...list[0],scene:{...list[0].scene,shapes:[]}}]}).success,false,'a version must be a real scene');
 assert.equal(contextSchema.safeParse({...design,versions:undefined}).success,true,'older saves have no versions');
 // A restore recompiles the kept version to exactly the bricks it had.
 assert.deepEqual(compiled(list[0].scene).pieces.length,list[0].pieces);
});

test('the component diff names what changed, by the same names the owner map uses',()=>{
 const before=cafe(),after=cafe(4,[box('Door','Door',{x:8,y:2,z:6},{x:3,y:10,z:1},'tan','subtract')]);
 assert.deepEqual(componentDiff(before,after),{changed:['Awning'],added:['Door'],removed:[]});
 assert.equal(diffSummary(componentDiff(before,after)),'Changed: Awning · Added: Door');
 assert.equal(diffSummary(componentDiff(before,before)),'','hidden when nothing changed');
 assert.equal(diffSummary(componentDiff(undefined,before)),'');
 // Key order and normalisation do not count as changes.
 const reordered={...before,shapes:before.shapes.map(s=>Object.fromEntries(Object.entries(s).reverse()))};
 assert.deepEqual(componentDiff(before,reordered),{changed:[],added:[],removed:[]});
 const owners=pieceOwners(after,compiled(after).pieces);
 assert.ok(['Changed','Added'].every(w=>diffSummary(componentDiff(before,after)).includes(w)));
 assert.ok(new Set(owners.values()).has('Awning'));
 assert.equal(componentLabel('VaultBands'),'Vault bands');assert.equal(componentLabel('front_door'),'Front door');assert.equal(componentLabel('Person3'),'Person 3');assert.equal(componentLabel('DCMetro'),'DC metro');
});

test('the owner map charges every brick of a component to it, and a lasso\'s bounds name the components inside',()=>{
 const scene=cafe(),model=compiled(scene),owners=pieceOwners(scene,model.pieces);
 assert.equal(owners.size,model.pieces.length,'every scene brick has an owner');
 const awning=piecesOf(owners,['Awning']),awningPieces=model.pieces.filter(p=>awning.includes(p.id));
 assert.ok(awningPieces.length>0);assert.ok(awningPieces.every(p=>p.y>=20&&p.color==='red'));
 // Hand-placed bricks belong to no shape.
 const hand={id:9999,part:'3001',color:'blue',x:0,y:22,z:12,w:4,h:3,d:2,rotated:false,stage:1};
 assert.equal(pieceOwners(scene,[...model.pieces,hand]).has(9999),false);
 assert.deepEqual(componentsInBounds(owners,model.pieces,{min:{x:2,y:20,z:2},max:{x:18,y:22,z:9}}),['Awning']);
 assert.deepEqual(componentsInBounds(owners,model.pieces,{min:{x:2,y:15,z:2},max:{x:18,y:22,z:9}}).sort(),['Awning','Cafe']);
 assert.deepEqual(componentsInBounds(owners,model.pieces,undefined),[]);
});

test('a tap selection fills region.components and sets sceneKey; a drawn area keeps its outline',()=>{
 const scene=cafe(),image='data:image/jpeg;base64,'+Buffer.from('still').toString('base64'),sceneKey=revisionSceneKey(scene);
 const tapped=composeRegion({picked:['Awning'],tap:{image,bounds:{min:{x:2,y:20,z:2},max:{x:18,y:22,z:9}},sceneKey}});
 assert.deepEqual(tapped.components,['Awning']);assert.equal(tapped.sceneKey,sceneKey);assert.deepEqual(tapped.polygon,TAP_POLYGON);
 assert.match(tapped.description,/tapped/);assert.equal(revisionRegionSchema.safeParse(tapped).success,true);
 assert.equal(composeRegion({picked:['Awning']}),undefined,'no captured view: the parts travel in the words');
 assert.equal(composeRegion({picked:[],tap:{image}}),undefined);
 const lasso={image,polygon:[{x:.2,y:.2},{x:.6,y:.2},{x:.4,y:.6}],components:['Cafe'],sceneKey};
 const drawn=composeRegion({lasso,picked:['Awning','Cafe']});
 assert.deepEqual(drawn.components,['Cafe','Awning']);assert.deepEqual(drawn.polygon,lasso.polygon);assert.equal(revisionRegionSchema.safeParse(drawn).success,true);
});

test('changed bricks are highlighted only in components that changed',()=>{
 const before=cafe(),after=cafe(4),a=compiled(before),b=compiled(after);
 const moved=changedPieceIds(a.pieces,b.pieces),shown=highlightChanges({scene:after,pieces:b.pieces},{scene:before,pieces:a.pieces});
 const owners=pieceOwners(after,b.pieces);
 assert.ok(shown.length>0);assert.ok(shown.every(id=>owners.get(id)==='Awning'));assert.ok(shown.every(id=>moved.includes(id)));
 assert.deepEqual(highlightChanges({scene:before,pieces:a.pieces},{scene:before,pieces:a.pieces}),[]);
 assert.equal(sameVersion({scene:before,manual:emptyManual(),locked:['A','B']},{scene:{...before},manual:emptyManual(),locked:['B','A']}),true);
 assert.equal(sameVersion({scene:before,manual:emptyManual(),locked:[]},{scene:after,manual:emptyManual(),locked:[]}),false);
});

test('saved drafts keep their versions through the design library',()=>{
 const scene=cafe(),model=compiled(scene),list=addVersion([],version(scene));
 const saved=library.packDesign({...model,name:'Corner café',generation:scene,libraryId:'d1',design:{brief:defaultBrief('A corner café'),manual:emptyManual(),locked:[],revisions:[],versions:list}},'draft');
 assert.equal(library.unpackDesign(saved).design.versions[0].n,1);
});
