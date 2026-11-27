import {workerSource,workerSkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {growth,effectiveRecords,exportRows} from '../assets/fullrev-progress.mjs';
import {config,snapshot,record,harness} from './fixtures/fullrev.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const oracle=vm.runInNewContext(read('tests/fixtures/xp-legacy-oracle.js')+';YBSXP');
const xp=vm.runInNewContext(read('assets/xp.js')+';YBSXP');
const catalog=vm.runInNewContext(read('assets/curriculum.js')+'\n'+read('assets/activities.js')+';({activities:ACTIVITIES,activityOpenAt,termWeekOf})');
const activities=Array.from(catalog.activities).filter(a=>a.course==='115-g9').map(a=>({...a,openedAt:catalog.activityOpenAt(a),isOpen:true}));
const options={project:config.firebase.projectId,course:'115-g9',subject:'synthetic-subject',provider:'password',activities};
const open=activities.find(a=>a.week===6).openedAt;
const old=(round=0,extra={})=>({schemaVersion:1,source:'legacy-unverified',resultId:'l_'+String(round).padStart(64,'0'),subject:options.subject,
 provider:'password',activity:6,round,unit:2,unitEpoch:0,roundEpoch:0,displayPolicy:'migration-initial-epochs-v1',
 completedAt:new Date(open).toISOString(),xpPolicySnapshot:{openedAt:new Date(open).toISOString()},
 validity:{state:'effective',controlVersions:{gateVersion:1,classGateVersion:1}},...extra});
const plain=v=>JSON.parse(JSON.stringify(v));
function assertOracle(result,expected) {
 assert.equal(result.state,'confirmed');
 for(const key of ['totalXP','level','title','floor','next','remaining','progress','exploration'])assert.deepEqual(plain(result[key]),plain(expected[key]),key);
 assert.deepEqual(plain(result.activities.map(a=>({...a,rounds:a.rounds.map(({onTimeState,...r})=>r)}))),plain(expected.activities));
}
test('frozen old xp.js oracle: all activities, opening boundaries, unknown timestamps, full badges and level parity',()=>{
 for(const delta of [-1,0,7*864e5,7*864e5+1,null]){
  const raw=activities.flatMap(a=>a.rounds.map((_,round)=>({course:a.course,activity:a.week,round,at:delta===null?undefined:a.openedAt+delta})));
  const projected=raw.map((r,i)=>old(r.round,{activity:r.activity,unit:activities.find(a=>a.week===r.activity).unit,
   resultId:'l_'+i.toString(16).padStart(64,'0'),completedAt:r.at===undefined?null:new Date(r.at).toISOString(),
   xpPolicySnapshot:{openedAt:new Date(activities.find(a=>a.week===r.activity).openedAt).toISOString()}}));
  assertOracle(growth(snapshot(projected),options,xp),oracle.calculate(activities,raw));
 }
});
test('mixed old/new passes choose old first time (including unknown), deduplicate, and remove epochs before choosing',()=>{
 const current=record(0,{activity:6,completedAt:new Date(open+1).toISOString(),xpPolicySnapshot:{openedAt:new Date(open).toISOString()}});
 for(const records of [[old(),current],[current,old()],[old(0,{completedAt:null}),current],[current,old(0,{completedAt:null})]]){
  const expected=oracle.calculate(activities,records.map(r=>({course:'115-g9',activity:r.activity,round:r.round,at:r.completedAt})));
  const result=growth(snapshot(records),options,xp);assertOracle(result,expected);assert.equal(result.records.length,1);
 }
 const reset=old(0,{validity:{state:'excluded',reason:'reset'}});
 const redo={...current,roundEpoch:1};assert.equal(growth(snapshot([reset,redo]),options,xp).totalXP,15);
 const unknown=growth(snapshot([current,{...current,resultId:'other-new'}]),options,xp);assert.equal(unknown.state,'unknown');
 assert.equal(growth(snapshot([current,old(),{...current,resultId:'other-new'}]),options,xp).state,'unknown');
 const malformed=old(0,{displayPolicy:'unconfirmed'});assert.equal(effectiveRecords(snapshot([malformed]),options).state,'unknown');
 assert.equal(growth(snapshot([]),{...options,provider:'anonymous'},xp).reason,'guest-xp-policy-pending');
 const csv=exportRows(snapshot([old()]),options,xp);assert.ok(csv.some(r=>r[4]==='舊紀錄過關（未驗證）'));
});
test('多人混合投影匯出與 frozen oracle 全欄一致，含準時邊界、未知時間與重算',()=>{
 const deltas=[-1,0,7*864e5,7*864e5+1,null];
 const people=deltas.map((_,i)=>({subject:'synthetic-legacy-'+i,cls:901,seat:i+1,provider:'password'}));
 const records=[],expected=[['班級','座號','活動','關卡','狀態','完成時間','XP','結果識別']];
 for(const [i,person] of people.entries()) {
  const legacy=activities.flatMap(a=>a.rounds.map((_,round)=>old(round,{subject:person.subject,activity:a.week,unit:a.unit,
   resultId:'l_'+(i*1000+a.week*10+round).toString(16).padStart(64,'0'),
   completedAt:deltas[i]===null?null:new Date(a.openedAt+deltas[i]).toISOString(),
   xpPolicySnapshot:{openedAt:new Date(a.openedAt).toISOString()}})));
  const current=legacy.map(r=>record(r.round,{subject:person.subject,activity:r.activity,unit:r.unit,
   resultId:'c_'+i+'_'+r.activity+'_'+r.round,completedAt:new Date(Date.parse(r.completedAt||r.xpPolicySnapshot.openedAt)+1).toISOString(),
   xpPolicySnapshot:r.xpPolicySnapshot}));
  records.push(...(i%2?[...current,...legacy]:[...legacy,...current]));
  const reference=oracle.calculate(activities,legacy.map(r=>({course:'115-g9',activity:r.activity,round:r.round,at:r.completedAt})));
  assertOracle(growth(snapshot([...legacy,...current]),{...options,subject:person.subject},xp),reference);
  let k=0;
  for(const [aIndex,a] of activities.entries())for(let round=0;round<a.rounds.length;round++) {
   const r=legacy[k++];
   expected.push([901,person.seat,a.title,a.rounds[round],'舊紀錄過關（未驗證）',r.completedAt||'',
    reference.activities[aIndex].rounds[round].totalXP,r.resultId]);
  }
  expected.push([901,person.seat,'合計','','','',reference.totalXP,'']);
 }
 const projection=snapshot(records,{subject:undefined,people}),before=JSON.stringify(projection);let calculations=0;
 const countedXP={calculate(...args){calculations++;return xp.calculate(...args);}};
 assert.deepEqual(exportRows(projection,{...options,subject:undefined},countedXP),expected);
 assert.equal(calculations,people.length);
 assert.deepEqual(exportRows(projection,{...options,subject:undefined},xp),expected);
 assert.equal(JSON.stringify(projection),before);
});
test('login matches original login.js account/password normalization and retains SESSION',async()=>{
 const source=read('assets/login.js');
 const accountLine=source.match(/const normAccount = .*;/)[0],passwordLine=source.match(/const normPassword = .*;/)[0];
 const normalize=vm.runInNewContext(accountLine+'\n'+passwordLine+';({normAccount,normPassword})');
 const h=await harness();const calls=[],persist=[];
 const original=h.auth.signInWithEmailAndPassword;
 h.auth.signInWithEmailAndPassword=async(...args)=>{calls.push(args);return original(...args);};
 h.auth.setPersistence=async value=>persist.push(value);
 for(const account of ['  CG JH 9990001  ',' 999 0001 ','CGJH9990001@EXAMPLE.INVALID'])for(const password of ['  CGJHa000000000  ',' cgjhaA00000000 ','  Synthetic-Pass With Space  ']){
  await h.client.login('password',account,password);
  assert.deepEqual(calls.at(-1),[normalize.normAccount(account)+'@ybslab-edu.github.io',normalize.normPassword(password)]);
 }
 assert.ok(persist.every(v=>v==='session'));assert.doesNotMatch([...h.storage.map.values()].join(),/Synthetic-Pass|cgjhA/);
});
// YBS_WORKER_SOURCE is the Worker PACKAGE, e.g. classscore-wt-legacy/workers/ybs-grader.
test('Worker matches frozen oracle for undefined activity/round and production activity distribution', {skip:workerSkip},async()=>{
 const load=file=>import(pathToFileURL(resolve(workerSource,file)).href);
 const {legacyHarness,PROJECT}=await load('tests/legacy-progress-fixtures.mjs');
 const {legacyCatalog}=await load('src/formal/legacy-progress.mjs');
 const {action}=await load('../../tests/ybs-fullrev-fixtures.mjs');
 assert.deepEqual(legacyCatalog,plain(Object.fromEntries(activities.map(a=>[a.week,{unit:a.unit,rounds:a.rounds.map((_,r)=>r)}]))));
 const distribution=activities.filter(a=>[1,2,3,4,5,6,7,28,29,30].includes(a.week));
 assert.deepEqual(distribution.map(a=>catalog.termWeekOf(a)).sort((a,b)=>a-b),[2,5,6,7,8,9,10,11,12,13]);
 const opts={...options,project:PROJECT,subject:'synthetic-a'};
 for(const delta of [-1,0,7*864e5,7*864e5+1,null]){
  const h=await legacyHarness({allActivities:true});
  const raw=distribution.flatMap(a=>a.rounds.map((_,round)=>({course:'115-g9',activity:a.week,round,
   at:delta===null?null:a.openedAt+delta})));
  // These never contributed XP, badges or exploration in the actual old calculator.
  raw.push(...[[6,4],[5,5],[0,0],[31,0],[99,0],[6,-1],[6,1.5]].map(([activity,round])=>
   ({course:'115-g9',activity,round,at:open})));
  for(const r of raw)h.seedLegacy(r.activity,r.round,r);
  const result=growth(await h.progress(),opts,xp);
  assertOracle(result,oracle.calculate(activities,raw));
  assert.equal(result.records.length,41);
 }
 const h=await legacyHarness({allActivities:true});
 const raw=[0,4].map(round=>({course:'115-g9',activity:6,round,at:open}));
 for(const r of raw)h.seedLegacy(r.activity,r.round,r);
 const originals=structuredClone([...h.db.docs].filter(([p])=>p.includes('/legacyAttempts/')));
 const before=growth(await h.progress(),opts,xp);assertOracle(before,oracle.calculate(activities,raw));
 assert.equal(before.totalXP,15);assert.equal(before.records.length,1);
 const {preview}=await h.perform(action('reset-round',{activity:6,round:0}));
 assert.equal(preview.summary.xpRemoved,15);assert.equal(preview.summary.affectedCount,1);
 assert.equal(preview.summary.badgesRemoved,0);assert.equal(growth(await h.progress(),opts,xp).totalXP,0);
 assert.deepEqual([...h.db.docs].filter(([p])=>p.includes('/legacyAttempts/')),originals);
 const missing=await legacyHarness();missing.seedLegacy(6,0,{at:open});
 missing.change((await load('tests/legacy-progress-fixtures.mjs')).paths.global,g=>{delete g.activities[6];});
 await assert.rejects(missing.progress(),/legacy_unconfirmed/,'a known round with missing controls must not silently disappear');
});
test('actual Worker projection/reset and frozen XP oracle agree, including fallback times and schedule', {skip:workerSkip},async()=>{
 const load=file=>import(pathToFileURL(resolve(workerSource,file)).href);
 const {legacyHarness,PROJECT,paths,owner}=await load('tests/legacy-progress-fixtures.mjs');
 const {legacyOpenAt}=await load('src/formal/legacy-progress.mjs');
 const {action}=await load('../../tests/ybs-fullrev-fixtures.mjs');
 for(const a of activities)assert.equal(legacyOpenAt(a.week),catalog.activityOpenAt(a));
 const h=await legacyHarness();
 const raw=[];for(const activity of [6,7])for(let round=0;round<4;round++){
  const r={course:'115-g9',activity,round,at:'2026-11-17T00:00:00Z',passedAt:new Date('2026-11-19T00:00:00Z')};raw.push(r);h.seedLegacy(activity,round,r);
 }
 const opts={...options,project:PROJECT,subject:'synthetic-a'};
 const progress=async()=>{const p=await h.progress();return growth(p,opts,xp);};
 assertOracle(await progress(),oracle.calculate(activities,raw));assert.equal((await progress()).totalXP,140);
 let removed=0;
 for(let round=0;round<4;round++){
  const before=await progress();const {preview}=await h.perform(action('reset-round',{activity:7,round}));const after=await progress();
  assert.equal(preview.summary.xpRemoved,before.totalXP-after.totalXP);removed+=preview.summary.xpRemoved;
 }
 assert.equal(removed,60);assert.equal((await progress()).totalXP,80);assert.equal((await progress()).level,1);
 // Each actual raw timestamp shape passes through Worker normalization, not a hand-built projection.
 for(const extra of [{at:open,passedAt:new Date(open+8*864e5)},{at:'bad',passedAt:new Date(open)},
  {at:0,passedAt:null},{at:null,passedAt:new Date(open+7*864e5)},{at:'bad',passedAt:new Date(open+7*864e5+1)}]){
  const single=await legacyHarness();single.seedLegacy(6,0,extra);
  const original={course:'115-g9',activity:6,round:0,...extra,passedAt:extra.passedAt?{toMillis:()=>extra.passedAt.getTime()}:null};
  const result=growth(await single.progress(),opts,xp);assertOracle(result,oracle.calculate(activities,[original]));
  const preview=await single.service.preview(owner,action('reset-student-unit'));
  assert.equal(preview.summary.xpRemoved,result.totalXP);
 }
});
