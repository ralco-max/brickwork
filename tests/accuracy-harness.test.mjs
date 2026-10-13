import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runAccuracy,rescore,compareRuns,baselineLocal,loadLib,loadCases,loadFixtures,mockTransport,parseArgs,estimateTokens,CSV_COLUMNS,BASELINE_COLUMNS,FIXTURES} from '../scripts/run-accuracy.mjs';

const out=mkdtempSync(join(tmpdir(),'brickwork-accuracy-'));test.after(()=>rmSync(out,{recursive:true,force:true}));
const lib=await loadLib();
// The scorecard quotes cells with commas; a tiny reader is enough here.
const readCSV=file=>readFileSync(file,'utf8').trim().split('\n').map(line=>{const cells=[];let cell='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(quoted){if(c==='"'&&line[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){cells.push(cell);cell='';}else cell+=c;}cells.push(cell);return cells;});
const spy=(inner,log)=>async(url,init)=>{log.push({url,body:JSON.parse(init.body)});return inner(url,init);};
const formatName=b=>b.text?.format?.name;

test('every benchmark and photo case has a synthetic fixture and the photo cases have photos',()=>{
 const cases=loadCases(lib),fixtures=loadFixtures();
 assert.equal(cases.length,4+6+4);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
 for(const c of cases){const fx=fixtures.get(c.brief.idea);assert.ok(fx,`${c.id} has a fixture`);assert.equal(fx.synthetic,true);assert.equal(fx.case,c.id);assert.ok(lib.briefSchema.safeParse(c.brief).success,c.id);}
 for(const c of cases.filter(c=>c.suite==='photo'))assert.ok(readdirSync(join(FIXTURES,'photos',c.id)).some(f=>f.endsWith('.jpg')),c.id);
 assert.equal(cases.find(c=>c.id==='dulles-terminal').brief.quality,'better');assert.equal(cases.find(c=>c.id==='photo-house').brief.quality,'sol_low');
 assert.equal(loadCases(lib,{quality:'sol_medium',suite:'accuracy'}).every(c=>c.brief.quality==='sol_medium'),true);
});

test('mock mode drives the real routes, compiles and checks every design, and writes one scorecard row per case at $0',async()=>{
 const calls=[],r=await runAccuracy({mode:'mock',render:false,out,stamp:'mock',transport:spy(mockTransport(loadFixtures()),calls)});
 const csv=readCSV(join(r.dir,'scorecard.csv'));assert.deepEqual(csv[0],CSV_COLUMNS);assert.equal(csv.length-1,14);
 const ids=loadCases(lib).map(c=>c.id);assert.deepEqual(csv.slice(1).map(row=>row[0]),ids);assert.deepEqual(r.rows.map(x=>x.case),ids);
 const by=Object.fromEntries(r.rows.map(x=>[x.case,x]));
 assert.ok(r.meta.totalUSD>0.5,String(r.meta.totalUSD));
 for(const row of r.rows.filter(x=>x.case!=='dulles-whole-airport')){
  assert.equal(row.status,'completed',`${row.case}: ${row.errorCode}`);assert.equal(row.reviewStatus,'ok',row.case);assert.equal(row.rendered,'placeholder');
  assert.ok(row.pieces>0&&row.designUSD>0&&row.researchUSD>0&&row.reviewUSD>0&&row.judgeUSD>0,row.case);
  assert.ok(Math.abs(row.totalUSD-(row.researchUSD+row.designUSD+row.reviewUSD+row.repairUSD+row.judgeUSD))<1e-5,row.case);
  // An automatic repair is priced on its own line, and only when it ran.
  assert.equal(row.repairUSD>0,Boolean(row.autoRepair),row.case);
  assert.equal(row.requiredTotal,lib.briefSchema.parse(loadCases(lib,{cases:row.case})[0].brief).features.length);
 }
 // The whole-airport case stops at the clarification gate after two research passes: no design spend.
 assert.equal(by['dulles-whole-airport'].status,'clarification');assert.equal(by['dulles-whole-airport'].researchPasses,2);assert.equal(by['dulles-whole-airport'].designUSD,0);
 // One design per completed case, plus one automatic repair (and its targeted re-check) on each materially flagged first build.
 const repaired=r.rows.filter(x=>x.autoRepair);assert.ok(repaired.length>0&&repaired.length<13,String(repaired.length));
 assert.equal(calls.filter(c=>formatName(c.body)==='brickwork_scene').length,13+repaired.length);assert.equal(calls.filter(c=>formatName(c.body)==='brickwork_reference').length,15);
 assert.equal(calls.filter(c=>formatName(c.body)==='brickwork_visual_review'&&JSON.parse(c.body.input.flatMap(x=>x.content).find(x=>x.type==='input_text'&&x.text.startsWith('{')).text).mode==='targeted').length,repaired.length);
 const repairCall=calls.find(c=>formatName(c.body)==='brickwork_scene'&&JSON.stringify(c.body).includes('CURRENT MODEL VIEW 1 (generated, before repair)'));assert.ok(repairCall,'the repair design sees the rendered model');
 // Synthetic fixtures answer the repair with the first design, so nothing improves and the first build is kept.
 assert.ok(repaired.every(x=>x.autoRepair==='discarded'),repaired.map(x=>x.autoRepair).join());
 // The studio's support columns run on every compile before any paid repair.
 assert.ok(r.rows.some(x=>x.supportsAdded>0));
 // Proportion error is measured against the research target; generic ideas have none.
 // planTarget: the long, low span is drawn 2 studs deep with its heights exaggerated (target.vertical).
 assert.equal(by['golden-gate-span'].targetStuds,'78x2x45');assert.ok(by['golden-gate-span'].propErrPct>100);assert.equal(by['apollo-saturn-v'].targetStuds,'6x6x158');
 assert.equal(by['design-4-snowy-owl-perched'].propErrPct,'');
 // Critical checks come from the judge until a human grades them.
 assert.equal(by['dulles-terminal'].criticalTotal,4);assert.equal(by['dulles-terminal'].criticalSource,'judge');assert.equal(by['photo-dc-metro'].criticalFailed,1);
 assert.equal(by['design-3-retro-orange-record'].criticalTotal,'');assert.ok(by['design-3-retro-orange-record'].sourceFeaturesTotal>0);
 // Photos reach research, design and review; the user photos are the committed placeholders.
 assert.equal(by['photo-dc-metro'].photos,'placeholderx2');
 const metro=calls.filter(c=>JSON.stringify(c.body).includes('This DC Metro station from my photos')&&c.url.endsWith('/responses'));
 for(const name of ['brickwork_reference','brickwork_scene','brickwork_visual_review']){const body=metro.find(c=>formatName(c.body)===name).body;assert.ok(JSON.stringify(body).split('"input_image"').length-1>=2,name);}
 // The saved project reopens in the app's own importer with its review attached.
 const project=lib.validateProject(JSON.parse(readFileSync(join(r.dir,'cases/dulles-terminal/project.json'),'utf8')));
 assert.equal(project.pieces.length,by['dulles-terminal'].pieces);assert.equal(project.design.review.features.length,by['dulles-terminal'].requiredTotal);assert.equal(project.design.review.rubric.filter(f=>f.kind==='signature').length,by['dulles-terminal'].signatureTotal);
 assert.ok(project.design.manual.bricks.every(p=>p.support),'the saved project carries its support columns');
 for(const f of ['reference.json','scene.json','checks.json','review.json','judge.json','usage.json'])assert.ok(existsSync(join(r.dir,'cases/dulles-terminal',f)),f);
 assert.match(readFileSync(join(r.dir,'summary.md'),'utf8'),/SYNTHETIC/);
 const grades=JSON.parse(readFileSync(join(r.dir,'grades.json'),'utf8'));assert.deepEqual(Object.keys(grades['golden-gate-span']),loadCases(lib,{cases:'golden-gate-span'})[0].criticalChecks);

 // Human grades override the judge; compare reports per-case deltas.
 writeFileSync(join(r.dir,'grades.json'),JSON.stringify({...grades,'dulles-terminal':{'Front/back arrangement follows the actual references':'fail'}}));
 const again=await rescore(r.dir),dulles=again.rows.find(x=>x.case==='dulles-terminal');
 assert.equal(dulles.criticalFailed,1);assert.equal(dulles.criticalSource,'human+judge');assert.match(readFileSync(join(r.dir,'scorecard.csv'),'utf8'),/human\+judge/);
 assert.match(compareRuns(r.dir,r.dir),/\| dulles-terminal \| completed \|/);
});

test('live mode refuses to start without a key or a sane cap and calls nothing',async()=>{
 const run=spawnSync(process.execPath,['scripts/run-accuracy.mjs','--live','--no-render','--out',out],{encoding:'utf8',env:{...process.env,OPENAI_API_KEY:''}});
 assert.equal(run.status,1);assert.match(run.stderr,/OPENAI_API_KEY/);
 let called=0;const transport=async()=>{called++;throw Error('no calls expected');};
 for(const maxDollars of [0,11,NaN])await assert.rejects(runAccuracy({mode:'live',key:'sk-test',maxDollars,transport,render:false,out}),{code:'BAD_CAP'});
 assert.equal(called,0);assert.throws(()=>parseArgs(['--bogus']),/Unknown option/);
 assert.deepEqual(parseArgs(['--live','--max-dollars','3','--cases','a,b','--no-render','--no-judge']),{mode:'live',maxDollars:3,cases:'a,b',render:false,judge:false});
});

test('the live dollar cap is enforced by the app ledger, and recorded replies replay in mock mode',async()=>{
 const calls=[],transport=spy(mockTransport(loadFixtures()),calls);
 // A $0.50 cap cannot hold the 32k-output reservation of a "better" design call: it stops before sending it.
 const capped=await runAccuracy({mode:'live',key:'sk-test-cap',maxDollars:.5,transport,render:false,out,stamp:'cap',cases:'dulles-terminal,apollo-saturn-v'});
 assert.deepEqual(capped.rows.map(x=>x.status),['budget','skipped']);assert.equal(capped.rows[0].errorCode,'BUDGET_LIMIT');
 assert.ok(capped.ledger.spent<=.5&&capped.ledger.spent>0);assert.equal(capped.ledger.held,0);
 assert.equal(calls.filter(c=>c.url.endsWith('/responses')&&formatName(c.body)==='brickwork_scene').length,0);
 // Under a sufficient cap the summed RequestUsage equals what the ledger settled; placeholder photos are skipped live.
 const ok=await runAccuracy({mode:'live',key:'sk-test-ok',maxDollars:1.2,transport,render:false,out,stamp:'ok',record:true,cases:'design-3,photo-house'});
 const [player,house]=ok.rows;assert.equal(player.status,'completed');assert.equal(player.reviewStatus,'skipped (no renders)');assert.equal(house.status,'skipped');
 assert.ok(Math.abs(ok.ledger.spent-ok.rows.reduce((n,x)=>n+x.totalUSD,0))<1e-6);assert.equal(ok.ledger.held,0);
 const recorded=JSON.parse(readFileSync(join(ok.dir,'fixtures','design-3-retro-orange-record.json'),'utf8'));
 assert.equal(recorded.synthetic,false);assert.equal(typeof recorded.design.sse,'string');assert.ok(recorded.research[0].raw.output.length);
 const replay=await runAccuracy({mode:'mock',render:false,judge:false,out,stamp:'replay',fixtures:join(ok.dir,'fixtures'),cases:'design-3'});
 assert.equal(replay.rows[0].status,'completed');assert.equal(replay.rows[0].pieces,player.pieces);assert.equal(replay.rows[0].designUSD,player.designUSD);
});

test('a whitespace-padded key still hits the cap row, and a key with whitespace inside is refused',async()=>{
 // A CRLF .env leaves "sk-…\r": the routes trim the header, so the harness must fingerprint the trimmed key too.
 for(const key of ['sk-test-pad\r',' sk-test-pad \n']){
  const calls=[],auth=new Set(),transport=async(url,init)=>{auth.add(new Headers(init.headers).get('authorization'));return spy(mockTransport(loadFixtures()),calls)(url,init);};
  const r=await runAccuracy({mode:'live',key,maxDollars:.5,transport,render:false,out,stamp:`pad-${key.length}`,cases:'dulles-terminal,apollo-saturn-v'});
  assert.deepEqual(r.rows.map(x=>x.status),['budget','skipped']);assert.equal(r.rows[0].errorCode,'BUDGET_LIMIT');assert.ok(r.ledger.spent>0&&r.ledger.spent<=.5);
  assert.equal(calls.filter(c=>formatName(c.body)==='brickwork_scene').length,0);assert.deepEqual([...auth],['Bearer sk-test-pad']);
 }
 let called=0;const transport=async()=>{called++;throw Error('no calls expected');};
 for(const key of ['sk-test bad','sk-test\r\nbad','sk-'+'x'.repeat(600)])await assert.rejects(runAccuracy({mode:'live',key,maxDollars:1,transport,render:false,out}),{code:'BAD_KEY'});
 assert.equal(called,0);
});

test('out-of-bounds provider usage settles a capped, reported charge instead of writing off the pool',async()=>{
 // The app used to settle a full $10 hold and report nothing. It now charges the computed amount,
 // capped at 3x the reservation, reports it, and fails only that request: the ledger still reconciles.
 const transport=async(url,init)=>{const response=await mockTransport(loadFixtures())(url,init);if(!url.endsWith('/responses')||formatName(JSON.parse(init.body))!=='brickwork_reference')return response;const data=await response.json();data.usage.output_tokens=10**6;return Response.json(data);};
 const result=await runAccuracy({mode:'live',key:'sk-test-mismatch',maxDollars:1,transport,render:false,out,stamp:'overage',cases:'design-3,design-4'}).then(r=>({r}),e=>({e}));
 assert.notEqual(result.e?.code,'LEDGER_MISMATCH',result.e?.message);
 const dir=result.r?.dir||result.e?.dir,rows=JSON.parse(readFileSync(join(dir,'results.json'),'utf8')).cases;
 assert.equal(rows[0].row.errorCode,'BUDGET_ACCOUNTING');
 assert.ok(rows.every(c=>(c.detail?.usage||[]).reduce((n,u)=>n+u.cost,0)<1),'no case may be charged anything close to the $10 pool');
});

test('--record survives a design stream that dies mid-reply, and reports are saved after every case',async()=>{
 const ideas=loadCases(lib,{cases:'design-3,design-4'}).map(c=>c.brief.idea),dir=join(out,'stream-live');let broken=0,seen=null;
 const transport=async(url,init)=>{
  const body=JSON.parse(init.body),text=JSON.stringify(body);
  // When the second case starts, the first one's row must already be on disk.
  if(seen===null&&text.includes(ideas[1]))seen={csv:existsSync(join(dir,'scorecard.csv'))?readCSV(join(dir,'scorecard.csv')).length-1:0,summary:existsSync(join(dir,'summary.md'))?readFileSync(join(dir,'summary.md'),'utf8'):''};
  const response=await mockTransport(loadFixtures())(url,init);
  if(broken||!url.endsWith('/responses')||formatName(body)!=='brickwork_scene'||!text.includes(ideas[0]))return response;
  // Like an undici "terminated" reset (or the route's own timeout abort): one chunk, then the body errors.
  broken++;const reader=response.body.getReader(),first=await reader.read();let pulls=0;
  return new Response(new ReadableStream({pull(c){if(pulls++===0)c.enqueue(first.value);else c.error(new TypeError('terminated'));}}),{status:response.status,headers:response.headers});
 };
 const r=await runAccuracy({mode:'live',key:'sk-test-stream',maxDollars:3,transport,render:false,out,stamp:'stream',record:true,cases:'design-3,design-4'});
 assert.equal(broken,1);assert.equal(r.rows[0].status,'failed');assert.equal(r.rows[0].errorStage,'design');assert.equal(r.rows[1].status,'completed');
 assert.ok(r.ledger.held>0,'the dropped stream keeps its worst-case hold');assert.equal(r.meta.ledgerMismatch,undefined);
 assert.deepEqual(seen.csv,1);assert.match(seen.summary,/Partial:\*\* 1 of 2 cases finished/);assert.doesNotMatch(readFileSync(join(r.dir,'summary.md'),'utf8'),/Partial/);
 const recorded=JSON.parse(readFileSync(join(r.dir,'fixtures','design-3-retro-orange-record.json'),'utf8'));assert.match(recorded.design.error,/stream aborted: terminated/);
 // The aborted recording replays as an upstream failure instead of crashing the mock provider.
 const replay=await runAccuracy({mode:'mock',render:false,judge:false,out,stamp:'stream-replay',fixtures:join(r.dir,'fixtures'),cases:'design-3'});
 assert.equal(replay.rows[0].status,'failed');assert.equal(replay.rows[0].errorStage,'design');
});

test('baseline-local compiles every worked example and landmark preset without AI',async()=>{
 const r=await baselineLocal({render:false,out,stamp:'base',details:['small']}),csv=readCSV(join(r.dir,'scorecard.csv'));
 assert.deepEqual(csv[0],BASELINE_COLUMNS);assert.equal(r.rows.length,lib.DESIGN_EXAMPLES.length+4);
 const by=Object.fromEntries(r.rows.map(x=>[`${x.id}${x.detail?`-${x.detail}`:''}`,x]));
 assert.equal(by.cottage.structuralPass,true);assert.equal(by.cottage.checksPass,true);
 for(const row of r.rows){assert.ok(row.pieces>0);assert.equal(row.overlaps,0);}
 assert.equal(by['castle-small'].limitsPass,'');assert.equal(typeof by.lattice.limitsPass,'boolean');
 assert.match(readFileSync(join(r.dir,'summary.md'),'utf8'),/Structural pass: \d+\/\d+/);
});

test('the request-size estimate counts text by characters and images by tile',()=>{
 assert.equal(estimateTokens({input:[{role:'user',content:[{type:'input_text',text:'x'.repeat(300)},{type:'input_image',image_url:'data:image/jpeg;base64,AA=='}]}]}),100+765);
 assert.equal(estimateTokens({instructions:'abc',input:[]}),1);
});
