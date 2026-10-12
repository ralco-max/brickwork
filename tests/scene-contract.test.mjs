import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';

const bundle=await build({stdin:{contents:'export {clipSentence,splitSentences} from "./lib/utils";export * from "./lib/generated-scene";export {generateScene,DESIGN_INSTRUCTIONS} from "./lib/generation-provider";export * from "./lib/generation-errors";export {projectJSON,emptyShopping,defaultBrief,emptyManual,migrateCaption,reviewSchema,referenceKey} from "./lib/design-project";export {validateProject} from "./lib/models";export {packDesign,unpackDesign} from "./lib/design-library";export {shareDescription,sanitizeSharedProject} from "./lib/share";',resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

// The owner's Build details text: the model's 562-character d, hard-cut to 500 characters.
const FULL='An unnamed DC Metro interior with a broad coffered vault, side platforms and a silver train on the left track. The open foreground exposes both track beds. The vault is simplified into overlapping stepped bands with deep repeated recesses; its upper courses can be separated for viewing, but a removable assembly is not physically tested. The train is shortened to one representative car, passengers are abstract figures, and obscured rear circulation is reduced to a dark tunnel mouth. No station or line signage is shown because none was legible in the photo.';
const SNIP=FULL.slice(0,500);
const TWO='An unnamed DC Metro interior with a broad coffered vault, side platforms and a silver train on the left track. The open foreground exposes both track beds.';
const CAPTION='A DC Metro interior with a broad coffered vault, side platforms and a silver train on the left track. The open foreground exposes both track beds.';
const box=(id,position,size,color)=>({id,component:id,label:id,kind:'box',operation:'add',color,position,size,end:{x:0,y:0,z:0},radius:1,repeat:{count:1,offset:{x:0,y:0,z:0}}});
const scene=(extra={})=>({name:'DC Metro station',description:'A Metro station with a coffered vault.',dimensions:{x:16,y:12,z:12},shapes:[box('Base',{x:0,y:0,z:0},{x:16,y:2,z:12},'gray'),box('Vault',{x:2,y:2,z:2},{x:12,y:8,z:8},'tan')],...extra});
const compactText=(s,patch={})=>JSON.stringify({...m.compactScene(s),...patch});
const endsClean=text=>/[.!?…]$/.test(text);

test('clipSentence keeps the owner\'s caption to whole sentences and never stops mid-word',()=>{
 assert.equal(SNIP.length,500);assert.ok(SNIP.endsWith('No station or'));
 const clipped=m.clipSentence(SNIP,160);assert.equal(clipped,TWO);assert.equal(clipped.length,155);
 assert.deepEqual(m.splitSentences(SNIP).slice(-1),['No station or']);assert.equal(m.splitSentences(SNIP).length,5);
 // Every limit yields a whole-sentence prefix or a whole-word prefix plus a single ellipsis.
 const words=new Set(FULL.split(/\s+/));
 for(let max=1;max<=FULL.length+5;max++){
  const out=m.clipSentence(FULL,max);assert.ok(out.length<=max,`length at ${max}`);
  if(out===FULL)continue;
  if(out.endsWith('…')){const body=out.slice(0,-1);if(!body)continue;assert.ok(FULL.startsWith(body),`prefix at ${max}`);const last=body.split(' ').at(-1);assert.ok(words.has(last)||words.has(`${last},`)||words.has(`${last};`)||max<16,`whole word at ${max}: ${last}`);assert.doesNotMatch(out,/[.!?,;:]…$/);}
  else{assert.ok(FULL.startsWith(out),`sentence prefix at ${max}`);assert.match(out,/[.!?]$/);}
 }
});

test('clipSentence and splitSentences handle short, abbreviated, unbroken and messy text',()=>{
 assert.equal(m.clipSentence('  A red  car.\n\nFast. ',160),'A red car. Fast.');
 assert.equal(m.clipSentence('Hello world this is long',10),'Hello…');
 assert.equal(m.clipSentence('One, two, three, four five',14),'One, two…');
 assert.equal(m.clipSentence('Ends here. next lower words',15),'Ends here.');
 assert.equal(m.clipSentence('Supercalifragilistic',8),'Superca…');
 assert.equal(m.clipSentence('Anything',0),'');assert.equal(m.clipSentence(undefined,10),'');
 assert.deepEqual(m.splitSentences('The arch in St. Louis by Dr. Smith. The U.S. Capitol dome at 3.5 m. Done!'),['The arch in St. Louis by Dr. Smith.','The U.S. Capitol dome at 3.5 m.','Done!']);
 assert.deepEqual(m.splitSentences('He said "Stop." Then left.'),['He said "Stop."','Then left.']);
 assert.equal(m.clipSentence('Hi. This is a much longer second sentence that goes on.',30),'Hi. This is a much longer…');
});

test('the streamed header turns an over-long d into a clean caption plus private notes',()=>{
 for(const d of [SNIP,FULL]){
  const parser=new m.SceneStreamParser(),text=compactText(scene(),{d});
  for(let i=0;i<text.length;i+=37)parser.push(text.slice(i,i+37));
  const {header}=parser.finish();
  assert.equal(parser.header.description,header.description);
  assert.equal(header.description,CAPTION);assert.ok(header.description.length<=m.CAPTION_TARGET);assert.ok(endsClean(header.description));
  assert.doesNotMatch(header.description,/No station or|unnamed|physically tested/);
  assert.ok(header.notes.some(n=>/physically tested/.test(n)));assert.ok(header.notes.every(n=>endsClean(n)),'a cut-off fragment never becomes a note');
  assert.ok(header.notes.length<=6&&header.notes.every(n=>n.length<=200));
  m.validateScene({...header,shapes:scene().shapes});
 }
});

test('display titles are short names and never say unnamed',()=>{
 assert.equal(m.sceneTitle('Unnamed DC Metro station'),'DC Metro station');
 assert.equal(m.sceneTitle('An unnamed elevated station'),'An elevated station');
 assert.equal(m.sceneTitle('an unnamed bridge'),'A bridge');
 assert.equal(m.sceneTitle('iPhone dock'),'iPhone dock');assert.equal(m.sceneTitle('  Golden   Gate Bridge '),'Golden Gate Bridge');
 assert.equal(m.sceneTitle('unnamed'),'Untitled design');assert.equal(m.sceneTitle(''),'Untitled design');assert.equal(m.sceneTitle(undefined),'Untitled design');
 const long=m.sceneTitle('The very long and winding name of a grand old railway terminal building in the middle of the city');
 assert.ok(long.length<=80);assert.ok(long.endsWith('…'));
 const parser=new m.SceneStreamParser();parser.push(compactText(scene(),{n:'Unnamed metro hall'}));assert.equal(parser.finish().header.name,'Metro hall');
});

test('notes round-trip through the compact scene, validation and saved projects, and stay out of the caption',()=>{
 const notes=['Train shortened to one car.','Rear circulation reduced to a tunnel mouth.'],withNotes=m.validateScene(scene({notes}));
 assert.deepEqual(withNotes.notes,notes);
 const compact=m.compactScene(withNotes);assert.deepEqual(compact.nt,notes);
 assert.deepEqual(m.compactJSONSchema.required,['n','d','nt','f','dim','rm','sh']);
 assert.equal(m.compactJSONSchema.properties.nt.type,'array');assert.equal(m.compactJSONSchema.properties.nt.maxItems,5);assert.equal(m.compactJSONSchema.properties.nt.items.maxLength,140);assert.equal(m.compactJSONSchema.properties.d.maxLength,200);
 const parser=new m.SceneStreamParser();parser.push(JSON.stringify(compact));const parsed=parser.finish();
 assert.deepEqual(parsed.header.notes,notes);assert.equal(parsed.header.description,withNotes.description);
 const back=m.validateScene({...parsed.header,shapes:parsed.shapes});assert.deepEqual(back.notes,notes);
 // Saved projects keep the notes privately and never fold them into what owners read.
 const model={...m.compileScene(back),generation:back},loaded=m.validateProject(JSON.parse(m.projectJSON(model,m.emptyShopping())));
 assert.deepEqual(loaded.generation.notes,notes);assert.equal(loaded.description,withNotes.description);
 for(const note of notes){assert.ok(!loaded.description.includes(note));assert.ok(!m.shareDescription({description:loaded.description,pieceCount:loaded.pieces.length}).includes(note));}
 const shared=m.sanitizeSharedProject(JSON.parse(m.projectJSON(model,m.emptyShopping())));for(const note of notes)assert.ok(!shared.description.includes(note));
 // Older scenes and streams without notes still validate and parse.
 assert.equal(m.validateScene(scene()).notes,undefined);
 const legacyStream=new m.SceneStreamParser(),noNotes=m.compactScene(m.validateScene(scene()));delete noNotes.nt;legacyStream.push(JSON.stringify(noNotes));assert.equal(legacyStream.finish().header.notes,undefined);
 assert.throws(()=>m.validateScene(scene({notes:Array(7).fill('Too many.')})));assert.throws(()=>m.validateScene(scene({notes:['x'.repeat(201)]})));
 // Over-long model notes are clipped at a word and capped at five.
 const noisy=new m.SceneStreamParser();noisy.push(compactText(scene(),{nt:['A '.repeat(100)+'end.','',7,'B.','C.','D.','E.','F.']}));const nh=noisy.finish().header;
 assert.equal(nh.notes.length,5);assert.ok(nh.notes[0].length<=140);
});

test('a revision takes its notes from the new header',()=>{
 const previous=m.validateScene(scene({notes:['Old caveat.']}));
 const parser=new m.SceneStreamParser();parser.push(compactText(previous,{nt:['New caveat.'],sh:[]}));const r=parser.finish();
 assert.deepEqual(m.mergeRevision(previous,r.header,r.removed,r.shapes).notes,['New caveat.']);
 const cleared=new m.SceneStreamParser();cleared.push(compactText(previous,{nt:[],sh:[]}));const c=cleared.finish();
 assert.equal(m.mergeRevision(previous,c.header,c.removed,c.shapes).notes,undefined);
});

test('the provider stream delivers a clean caption and keeps the parse detail for repair',async()=>{
 const frames=text=>[{type:'response.output_text.delta',delta:text},{type:'response.completed',response:{status:'completed'}}].map(e=>'data: '+JSON.stringify(e)+'\n\n').join('');
 const events=[];for await(const e of m.generateScene({prompt:'A DC Metro station',detail:'small'},'k','m',new AbortController().signal,async()=>new Response(frames(compactText(scene(),{d:SNIP})))))events.push(e);
 const header=events.find(e=>e.type==='header').header,complete=events.at(-1).scene;
 assert.equal(header.description,CAPTION);assert.equal(complete.description,CAPTION);assert.ok(complete.notes.length>0);
 const bad=compactText(scene(),{sh:[{i:'a',c:'A',l:'a',k:'box',o:'add',a:null,col:'purple',p:[0,0,0],s:[2,1,1],e:null,r:null,rep:null,txt:null,face:null,bg:null,pid:null}]});
 await assert.rejects(async()=>{for await(const _ of m.generateScene({prompt:'x',detail:'small'},'k','m',new AbortController().signal,async()=>new Response(frames(bad)))){}},e=>e.code==='INVALID_GEOMETRY'&&e.message===m.INVALID_GEOMETRY_MESSAGE&&/col/.test(e.detail));
});

test('drawing mistakes read as one plain sentence while the technical text stays in detail',()=>{
 let zod;try{new m.SceneStreamParser().push(compactText(scene(),{sh:[{i:'a',c:'A',l:'a',k:'box',o:'add',a:null,col:'purple',p:[0,0,0],s:[2,1,1],e:null,r:null,rep:null,txt:null,face:null,bg:null,pid:null}]}));}catch(e){zod=e;}
 const failure=m.generationFailure(zod);
 assert.equal(failure.code,'INVALID_GEOMETRY');assert.equal(failure.message,'The builder made a drawing mistake on this pass. Your draft is kept. Try again to let it fix it.');
 assert.doesNotMatch(failure.message,/Expected '/);assert.match(failure.detail,/Expected '/);
 const box2=box('a',{x:0,y:0,z:0},{x:4,y:2,z:4},'red');
 let duplicate;try{m.validateScene({name:'x',description:'',dimensions:{x:10,y:10,z:10},shapes:[box2,box2]});}catch(e){duplicate=e;}
 assert.deepEqual(m.generationFailure(duplicate),{message:m.INVALID_GEOMETRY_MESSAGE,code:'INVALID_GEOMETRY',detail:'The design has duplicate shape IDs.'});
 const part=m.generationFailure(new m.GenerationError('The design requested an unknown catalog part. Choose a supported part ID.','INVALID_GEOMETRY'));
 assert.equal(part.message,m.INVALID_GEOMETRY_MESSAGE);assert.match(part.detail,/unknown catalog part/);
 // Client-side rethrows of the plain message carry no duplicate detail; other codes are unchanged.
 assert.equal(m.generationFailure(new m.GenerationError(m.INVALID_GEOMETRY_MESSAGE,'INVALID_GEOMETRY')).detail,undefined);
 assert.equal(m.generationFailure(new m.GenerationError('Your API key was rejected.','AI_AUTH',401,'req')).message,'Your API key was rejected.');
 assert.equal(m.generationFailure(new SyntaxError('Unexpected token')).message,m.INVALID_GEOMETRY_MESSAGE);
});

test('design instructions keep caveats out of the caption',()=>{
 const p=m.DESIGN_INSTRUCTIONS;
 assert.doesNotMatch(p,/(?<!never )in d\.|State important|disclose|explain them|describe the uncertainty instead/);
 assert.match(p,/n display title of 2–6 words/);assert.match(p,/never "unnamed"/);assert.match(p,/160 characters or fewer/);
 assert.match(p,/nt private builder notes the owner never sees/);assert.match(p,/Record important simplifications and uncertain features in nt/);
 assert.match(p,/record in nt when the requested text cannot fit/);assert.match(p,/record them in nt/);
 assert.equal(p.split('\n').length,24,'line ownership: the prompt keeps its line count');
});

function legacyProject({design=true,description=SNIP}={}){
 const brief=m.defaultBrief('A DC Metro station'),s={...scene(),catalogVersion:1,description};
 const model={...m.compileScene(s,design?{manual:m.emptyManual(),hollow:brief.hollow,smooth:brief.finish==='smooth'}:{}),generation:s},data=JSON.parse(m.projectJSON(model,m.emptyShopping()));
 if(design){data.design={brief,manual:m.emptyManual(),locked:[],revisions:[{request:'A DC Metro station',summary:SNIP,at:'2026-10-01T00:00:00.000Z'},{request:'Make the vault taller',summary:'The vault now rises above the platforms and reads clearly from the front three-quarter view, with the train still visible beneath it and both platforms preserved as in the earlier pass of this design.',at:'2026-10-02T00:00:00.000Z'}]};}
 return data;
}

test('legacy saves split their description into a caption and private notes on load',()=>{
 const loaded=m.validateProject(legacyProject());
 assert.equal(loaded.description,CAPTION);assert.equal(loaded.generation.description,CAPTION);
 assert.deepEqual(loaded.generation.notes,['The vault is simplified into overlapping stepped bands with deep repeated recesses; its upper courses can be separated for viewing, but a removable assembly is not physically tested.','The train is shortened to one representative car, passengers are abstract figures, and obscured rear circulation is reduced to a dark tunnel mouth.']);
 // History that repeated the old text shows the caption; real review summaries are untouched.
 assert.equal(loaded.design.revisions[0].summary,CAPTION);assert.match(loaded.design.revisions[1].summary,/earlier pass of this design\.$/);
 // Migration is idempotent, and the migrated project re-saves and reloads unchanged.
 assert.deepEqual(m.migrateCaption(loaded),loaded);
 const again=m.validateProject(JSON.parse(m.projectJSON(loaded,m.emptyShopping())));assert.equal(again.description,CAPTION);assert.deepEqual(again.generation.notes,loaded.generation.notes);
 // Projects without design context, and the browser library, migrate the same way.
 const bare=m.validateProject(legacyProject({design:false}));assert.equal(bare.description,CAPTION);assert.equal(bare.design,undefined);assert.equal(bare.generation.notes.length,2);
 const saved={id:'legacy-1',name:'DC Metro station',description:SNIP,pieceCount:loaded.pieces.length,status:'design',updatedAt:'2026-10-01T00:00:00.000Z',project:JSON.stringify(legacyProject())};
 const unpacked=m.unpackDesign(saved);assert.equal(unpacked.description,CAPTION);assert.equal(unpacked.generation.notes.length,2);assert.equal(unpacked.libraryId,'legacy-1');
 assert.equal(m.packDesign(unpacked,'design').description,CAPTION);
 // The packer-changed fallback path also migrates.
 const stale=legacyProject();stale.pieces=stale.pieces.slice(0,-1);
 const rebuilt=m.unpackDesign({...saved,project:JSON.stringify(stale)});assert.equal(rebuilt.description,CAPTION);assert.equal(rebuilt.generation.description,CAPTION);
 // Short descriptions are left alone.
 const short=m.validateProject(legacyProject({description:'A Metro station with a coffered vault.'}));assert.equal(short.description,'A Metro station with a coffered vault.');assert.equal(short.generation.notes,undefined);
});

test('link previews lead with the piece count and end on a whole sentence',()=>{
 // Rows stored before this change hold the description cut at 300 characters.
 const legacy=m.shareDescription({description:SNIP.slice(0,300),pieceCount:73});
 assert.ok(legacy.startsWith('73-piece brick model · '));assert.ok(legacy.length<=200);assert.ok(endsClean(legacy));
 assert.equal(legacy,`73-piece brick model · ${CAPTION}`);assert.doesNotMatch(legacy,/remova|\.\s*·|\.\.|Built with Bricks/);
 assert.equal(m.shareDescription({description:'',pieceCount:1234}),'A custom 1,234-piece brick model, designed with Bricks by Ralc.');
 assert.equal(m.shareDescription({description:'A red car.',pieceCount:1}),'1-piece brick model · A red car.');
 const wordy=m.shareDescription({description:'Word '.repeat(80),pieceCount:12});assert.ok(wordy.length<=200);assert.ok(wordy.endsWith('Word…'));
 // A legacy project shared now stores the clean caption.
 const shared=m.sanitizeSharedProject(legacyProject());assert.equal(shared.description,CAPTION);
});

test('long judge text loaded from a save is trimmed at a sentence, not mid-word',()=>{
 const sentence='The vault reads clearly from the front. ';
 const review=m.reviewSchema.parse({summary:sentence.repeat(50),recognizable:true,features:[],improvements:['Add a second car to the train. '.repeat(30)]});
 assert.ok(review.summary.length<=1500);assert.ok(review.summary.endsWith('front.'));
 assert.ok(review.improvements[0].length<=500);assert.ok(review.improvements[0].endsWith('train.'));
 assert.equal(m.reviewSchema.parse({summary:'Short.\nKept as written.',recognizable:true,features:[],improvements:[]}).summary,'Short.\nKept as written.');
});
