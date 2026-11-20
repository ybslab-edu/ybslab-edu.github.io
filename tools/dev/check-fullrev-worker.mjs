// 唯讀載入指定的既存 PR2 原始碼；不安裝、不啟動雲端服務。請在僅 loopback 的命名空間執行。
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {createClient} from '../../assets/fullrev-client.mjs';
import {growth} from '../../assets/fullrev-progress.mjs';

if(!process.env.YBS_WORKER_SOURCE)throw new Error('請指定既存 PR2 目錄 YBS_WORKER_SOURCE；不自動下載');
const root=resolve(process.env.YBS_WORKER_SOURCE);
const load=path=>import(pathToFileURL(resolve(root,path)).href);
const [{createFormalWorker},{formalPath,formalPaths},{MemoryFirestore},{formalData,solve}]=await Promise.all([
  load('src/formal/index.mjs'),load('src/formal-contract.mjs'),load('src/memory-adapter.mjs'),load('tests/formal-fixtures.mjs')]);
const xpContext=vm.createContext({});vm.runInContext(await readFile(new URL('../../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',xpContext);
const config={enabled:true,firebase:{projectId:'synthetic-ybs-pr5',apiKey:'synthetic-public-key'},workerOrigin:'https://synthetic-pr5.workers.dev'};
const activities=[{course:'115-g9',week:5,unit:2,title:'合成接線',rounds:['甲','乙','丙','丁','戊'],codes:[]}];
const paths=formalPaths('115-g9','synthetic-class');
const store=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),values:()=>[...m.values()]};};
const opened=Date.parse('2026-11-01T00:00:00Z');
let cases=0;
for(const provider of ['password','google.com','anonymous'])for(const reset of ['round','student-unit','class-unit']) {
  let current=opened+1000;
  const uid=provider==='password'?'fake-uid-a':provider==='google.com'?'fake-google':'fake-guest';
  const email=provider==='password'?'cgjh000000@ybslab-edu.github.io':'cgjh000000@cgjh.hcc.edu.tw';
  const identity={uid,provider,email,emailVerified:true,ybsClassKeys:{'115-g9':'synthetic-class'}};
  const data=await formalData(opened);
  const db=new MemoryFirestore(data,{now:()=>current,pathValidator:formalPath});
  const env={YBS_GRADER_MODE:'formal',GRADER_ENABLED:'true',FIREBASE_PROJECT_ID:config.firebase.projectId,YBS_PROJECT_ID:config.firebase.projectId,YBS_ORIGIN:'https://ybslab-edu.github.io'};
  const worker=createFormalWorker({env,adapter:db,verifier:{verify:async()=>identity},now:()=>current});
  const auth={currentUser:null,setPersistence:async()=>{},signOut:async()=>{auth.currentUser=null;},
    signInWithEmailAndPassword:signIn,signInWithPopup:signIn,signInAnonymously:signIn};
  async function signIn(){auth.currentUser={uid,getIdToken:async()=>uid,getIdTokenResult:async()=>({claims:{
    firebase:{sign_in_provider:provider},email_verified:true,ybsClassKeys:identity.ybsClassKeys}})};return{user:auth.currentUser};}
  const control=()=>({gateVersion:db.docs.get(paths.global).gateVersion,classGateVersion:db.docs.get(paths.roster).classGateVersion});
  const model={controls:async()=>control(),context:async input=>{
    const c=db.docs.get(paths.roster),m=c.members['synthetic-a'];return{schemaVersion:1,sourceProject:config.firebase.projectId,
      ...input,uid,subject:'synthetic-a',configVersion:1,bindingVersion:c.bindings[uid].version,
      unitEpoch:m.unitEpochs[2],roundEpoch:m.roundEpochs['5:1'],classUnitEpoch:c.classUnitEpochs[2],controlVersions:control()};},
    page:async()=>{
      const m=db.docs.get(paths.roster).members['synthetic-a'];
      const records=[...db.docs].filter(([path])=>path.includes('/validatedResults/')).map(([path,r])=>({
        ...r,resultId:path.split('/').at(-1),completedAt:new Date(r.completedAt).toISOString(),
        xpPolicySnapshot:{...r.xpPolicySnapshot,openedAt:r.xpPolicySnapshot.openedAt.toISOString()},
        validity:r.unitEpoch===m.unitEpochs[2]&&r.roundEpoch===m.roundEpochs['5:1']?{state:'effective',controlVersions:control()}:{state:'excluded',reason:'reset'}}));
      return{schemaVersion:1,sourceProject:config.firebase.projectId,course:'115-g9',classKey:'synthetic-class',subject:'synthetic-a',
        state:'confirmed',complete:true,nextCursor:null,controlVersions:control(),records};}};
  let serial=0,drop=false;const sent=[],storage=store();
  const client=createClient({config,session:async()=>({app:{options:{projectId:config.firebase.projectId}},auth,persistence:'session',googleProvider:()=>({}),
    db:{doc:()=>({get:async()=>({exists:false})})}}),readModel:model,storage,shared:store(),events:null,now:()=>current,
    requestId:()=>`synthetic-request-${++serial}`,schedule:()=>0,cancel:()=>{},
    fetcher:async(url,init)=>{
      sent.push(JSON.parse(init.body));const result=await worker.fetch(new Request(url,{...init,headers:{...init.headers,origin:env.YBS_ORIGIN}}));
      if(drop){drop=false;throw new Error('synthetic-response-lost');}return result;}});
  await client.login(provider==='password'?'password':provider==='google.com'?'google':'guest','000000','synthetic-password');
  let view=await client.start(5,1);assert.equal(view.question.slot,0);
  current+=61000;view=await client.answer(5,1,-1);assert.equal(view.correct,false);assert.equal(view.question.slot,0);
  current+=61000;drop=true;await assert.rejects(client.answer(5,1,solve(view)),{code:'pending'});
  const original=sent.at(-1);current+=61000;[view]=await client.retry();assert.deepEqual(sent.at(-1),original);assert.equal(view.question.slot,1);
  current+=61000;view=await client.resume(5,1);assert.equal(view.question.slot,1);
  current+=61000;view=await client.answer(5,1,solve(view));assert.equal(view.completed,true);
  assert.equal(client.state().snapshot,null);
  const options={project:client.project,course:client.course,subject:'synthetic-a',provider,activities};
  let progress=growth(await client.progress({activities}),options,xpContext.xp);
  assert.equal(progress.totalXP,provider==='anonymous'?null:15);
  const gate=structuredClone(db.docs.get(paths.roster)),member=gate.members['synthetic-a'];
  gate.classGateVersion++;
  if(reset==='round')member.roundEpochs['5:1']++;
  else if(reset==='student-unit')member.unitEpochs[2]++;
  else{for(const m of Object.values(gate.members))m.unitEpochs[2]++;gate.classUnitEpochs[2]++;}
  db.seed(paths.roster,gate);
  current+=61000;await assert.rejects(client.resume(5,1),{code:'restart-required'});
  progress=growth(await client.progress({activities}),options,xpContext.xp);assert.equal(progress.totalXP,provider==='anonymous'?null:0);
  current=opened+8*864e5;
  view=await client.start(5,1,{restart:true});
  for(let i=0;i<2;i++){current+=61000;view=await client.answer(5,1,solve(view));}
  progress=growth(await client.progress({activities}),options,xpContext.xp);
  assert.equal(progress.totalXP,provider==='anonymous'?null:10);
  assert.equal([...db.docs].filter(([p])=>p.includes('/validatedResults/')).length,2);
  assert.doesNotMatch(storage.values().join(),/"question"|"expected"|"seed"|Bearer/);
  await client.logout();cases++;
}
console.log(`PR2 實際 Worker × PR5 client：${cases} 個三來源／三重置案例通過（記憶體交易、無網路服務）。`);
