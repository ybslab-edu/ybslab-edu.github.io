import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {checkConfig} from '../assets/fullrev-client.mjs';
import {effectiveRecords,growth,exportRows} from '../assets/fullrev-progress.mjs';
import {config,opened,controls,activities,record,snapshot,harness,response} from './fixtures/fullrev.mjs';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',context);
const xp=context.xp, options={project:config.firebase.projectId,course:'115-g9',subject:'synthetic-subject',provider:'password',activities};
const storageKey='ybs:fullrev:'+config.firebase.projectId+':115-g9';
const savedDrafts=h=>JSON.parse(h.storage.getItem(storageKey)).drafts;

test('預設關閉、空正式設定與舊／試點專案拒絕，不由 URL／儲存區切換',()=>{
  const c=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/fullrev-config.js',import.meta.url),'utf8')+';globalThis.config=YBS_FULLREV_CONFIG;',c);
  assert.equal(c.config.enabled,false);assert.throws(()=>checkConfig(c.config),{code:'configuration-pending'});
  for(const projectId of ['class-score-86020','ybs-pilot-ca9ae','demo-fake','REPLACE_WITH_PROJECT',''])assert.throws(()=>checkConfig({...config,firebase:{...config.firebase,projectId}}));
  for(const workerOrigin of ['http://synthetic.workers.dev','https://synthetic.workers.dev/path','https://evil.invalid'])assert.throws(()=>checkConfig({...config,workerOrigin}));
});
for(const provider of ['password','google.com','anonymous'])for(const scope of ['round','student-unit','class-unit'])test(`${provider} ${scope}：80→取消45→第8天重做75，原時間窗不重開`,()=>{
  const records=[0,1,2,3].map(i=>record(i,{provider}));
  const first=growth(snapshot(records),{...options,provider},xp);
  if(provider==='anonymous')assert.equal(first.totalXP,null);else assert.equal(first.totalXP,80);
  const canceled=records.map((r,i)=>i===3?{...r,validity:{state:'excluded',reason:scope}}:r);
  const middle=growth(snapshot(canceled),{...options,provider},xp);
  if(provider!=='anonymous')assert.equal(middle.totalXP,45);
  canceled.push(record(3,{provider,resultId:'c_redo',roundEpoch:1,completedAt:new Date(opened+8*864e5).toISOString()}));
  const redo=growth(snapshot(canceled),{...options,provider},xp);
  if(provider==='anonymous')assert.equal(redo.reason,'guest-xp-policy-pending');else assert.equal(redo.totalXP,75);
});
test('七天含端點、快照缺漏待確認、不信 at／新開放窗、不同 UID 去重',()=>{
  const records=[record(0,{completedAt:new Date(opened+7*864e5).toISOString(),at:new Date(opened+90*864e5).toISOString()})];
  assert.equal(growth(snapshot(records),options,xp).totalXP,15);
  assert.equal(growth(snapshot([record(0,{completedAt:new Date(opened+7*864e5+1).toISOString()})]),options,xp).totalXP,10);
  assert.equal(growth(snapshot([record(0,{xpPolicySnapshot:null})]),options,xp).totalXP,null);
  const dual=[record(),record(0,{uid:'synthetic-other'})];assert.equal(growth(snapshot(dual),options,xp).totalXP,15);
  assert.equal(effectiveRecords(snapshot([...dual,record(0,{resultId:'c_conflict'})]),options).state,'unknown');
  assert.equal(growth(snapshot([record(0,{provider:'anonymous'})]),options,xp).totalXP,null);
});
test('整單元重置涵蓋多活動；有效空集合撤徽章，unknown 不當0',()=>{
  const all=[...activities,{...activities[0],week:6}];
  const records=[...snapshot().records,...snapshot().records.map(r=>({...r,activity:6,resultId:r.resultId+'_six'}))];
  assert.equal(growth(snapshot(records),{...options,activities:all},xp).totalXP,160);
  const canceled=records.map(r=>({...r,validity:{state:'excluded',reason:'unit-reset'}}));
  assert.equal(growth(snapshot(canceled),{...options,activities:all},xp).totalXP,0);
  assert.equal(growth(snapshot([], {state:'unknown'}),options,xp).totalXP,null);
});
test('三態、混版本、錯來源、錯主體、錯關卡皆拒採，unknown 禁匯出',()=>{
  for(const change of [{state:'unknown'},{complete:false},{sourceProject:'other'}])assert.equal(growth(snapshot([],change),options,xp).totalXP,null);
  for(const change of [{validity:{state:'unknown'}},{source:'client-reported'},{subject:'other'},{round:99},
    {validity:{state:'effective',controlVersions:{gateVersion:2,classGateVersion:1}}}])assert.equal(effectiveRecords(snapshot([record(0,change)]),options).state,'unknown');
  assert.throws(()=>exportRows(snapshot([],{state:'unknown'}),options,xp),{code:'export-unconfirmed'});
  assert.equal(exportRows(snapshot([]),options,xp).at(-1)[6],0);
});
test('準時加全過 XP 與教師匯出共用，取消後不留舊徽章或成績列',()=>{
  assert.equal(exportRows(snapshot(),options,xp).at(-1)[6],80);
  const records=snapshot().records.map(r=>r.round===3?{...r,validity:{state:'excluded',reason:'reset'}}:r);
  const rows=exportRows(snapshot(records),options,xp);assert.equal(rows.at(-1)[6],45);assert.equal(rows[4][4],'尚未過關');
});
test('start／answer／resume 精確協定，沒有 Firestore 寫入或題面持久快取',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  assert.deepEqual(h.requests[0].body,{course:'115-g9',classKey:'c901',activity:5,round:0,requestId:'synthetic-request-2',
    configVersion:1,bindingVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0});
  h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await h.client.answer(5,0,7);await h.client.resume(5,0);
  assert.equal(h.requests[1].body.seq,1);assert.equal(h.requests[1].body.slot,0);assert.equal(h.requests[2].url,config.workerOrigin+'/resume');
  const saved=[...h.storage.map.values()].join();assert.doesNotMatch(saved,/synthetic-token|question|請輸入數值|expected|seed/);
  assert.equal(h.requests[0].credentials,'omit');assert.equal(h.requests[0].cache,'no-store');
});
test('斷線保留原 requestId／epoch／答案，成功遺失回應重送也不預加 XP',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>{throw Error('offline');};await assert.rejects(h.client.answer(5,0,7),{code:'pending'});
  const original=h.requests.at(-1).body;assert.equal(h.client.state().pending,true);assert.equal(h.client.state().snapshot,null);
  h.state.context={...await h.client.context(5,0),roundEpoch:8};h.advance();h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_confirmed'});
  await h.client.retry();assert.deepEqual(h.requests.at(-1).body,original);assert.equal(h.client.state().snapshot,null);
});
test('429／503 尊重 Retry-After 且有上限重試，401 僅刷新一次',async()=>{
  const h=await harness();await h.login();h.state.fetcher=async()=>new Response('{}',{status:429,headers:{'Retry-After':'90'}});
  await assert.rejects(h.client.start(5,0),{code:'pending'});assert.equal(h.timers.at(-1).ms,90000);
  await h.client.retry();assert.equal(h.requests.length,1);h.advance(90001);
  let n=0;h.state.fetcher=async()=>++n===1?new Response('{}',{status:401}):Response.json(response());await h.client.retry();
  assert.deepEqual(h.state.force.slice(-2),[false,true]);
  const failed=await harness();await failed.login();failed.state.fetcher=async()=>new Response('{}',{status:401});
  await assert.rejects(failed.client.start(5,0));assert.equal(failed.requests.length,2);assert.equal(failed.client.state().profile,null);
});
for(const status of [403,409,410])test(`${status}：舊草稿不換版補傳，明確重開才產生新 start`,async()=>{
  const h=await harness();await h.login();h.state.fetcher=async()=>new Response('{}',{status});
  await assert.rejects(h.client.start(5,0),{code:'restart-required'});const count=h.requests.length;
  await h.client.retry();assert.equal(h.requests.length,count);
  h.state.fetcher=async()=>Response.json(response());await h.client.start(5,0,{restart:true});
  assert.notEqual(h.requests.at(-1).body.requestId,h.requests[0].body.requestId);
});
test('換人及舊分頁清除待送、晚到成功不復活，Auth 已換人也拒絕',async()=>{
  let resolve;const h=await harness({fetcher:()=>new Promise(r=>resolve=r)});await h.login();
  const old=h.client.start(5,0);while(!resolve)await new Promise(r=>setImmediate(r));
  await h.client.logout();resolve(Response.json({completed:true,resultId:'c_late'}));await assert.rejects(old,{code:'identity-changed'});
  assert.equal(h.client.state().snapshot,null);assert.equal(h.storage.map.size,0);
  h.state.fetcher=async()=>Response.json(response());await h.login();
  h.shared.setItem('ybs:fullrev:'+config.firebase.projectId+':115-g9:identity','other-tab');
  await assert.rejects(h.client.start(5,0),{code:'identity-changed'});assert.equal(h.client.state().profile,null);
  assert.equal(await h.client.restore(),null);
});
test('重新整理僅還原同 UID／身分標記的草稿，題面由 resume 重新授權',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  const {createClient}=await import('../assets/fullrev-client.mjs');
  const restored=createClient({config,session:async()=>h.session,storage:h.storage,shared:h.shared,events:null,requestId:()=> 'restore-request',fetcher:async(url)=>{
    assert.equal(url,config.workerOrigin+'/resume');return Response.json(response());}});
  await restored.restore();await restored.resume(5,0);
  h.auth.currentUser.uid='different';await assert.rejects(restored.resume(5,0),{code:'identity-changed'});
});
test('教師 Google owner 嚴格核對，示範永不送 start／answer／resume',async()=>{
  const h=await harness();await h.client.login('owner');assert.deepEqual(h.reads,['ybsTeachers/synthetic-student','ybsCourses/115-g9']);
  await assert.rejects(h.client.start(5,0),{code:'demonstration-only'});await assert.rejects(h.client.answer(5,0,7),{code:'demonstration-only'});assert.equal(h.requests.length,0);
  const denied=await harness();denied.state.owner=false;await assert.rejects(denied.client.login('owner'),{code:'owner-required'});
  const disabled=await harness();disabled.state.enabledTeacher=false;await assert.rejects(disabled.client.login('owner'),{code:'owner-required'});
});
test('Google 學生缺教師文件遭 permission-denied，登入及重新整理仍可作答，不能取得 owner',async()=>{
  const h=await harness();h.state.readErrors['ybsTeachers/synthetic-student']=Object.assign(Error('synthetic-denied'),{code:'permission-denied'});
  const profile=await h.client.login('google');assert.equal(profile.owner,false);assert.equal(profile.provider,'google.com');
  assert.deepEqual(h.reads,['ybsTeachers/synthetic-student']);await h.client.start(5,0);
  const restored=h.reopen();assert.equal((await restored.restore()).owner,false);await restored.resume(5,0);
  await assert.rejects(restored.owner(),{code:'owner-required'});
  await assert.rejects(h.client.login('owner'),{code:'owner-required'});
  assert.equal(h.client.state().profile,null);assert.equal(h.storage.map.size,0);
});
for(const [path,code] of [['ybsTeachers/synthetic-student','unavailable'],['ybsTeachers/synthetic-student','unauthenticated'],
  ['ybsTeachers/synthetic-student','unknown'],['ybsCourses/115-g9','permission-denied']])test(`Google ${path} ${code}：其他查詢錯誤仍使登入／還原失敗`,async()=>{
  const h=await harness(),error=Object.assign(Error('synthetic-read-error'),{code});h.state.readErrors[path]=error;
  await assert.rejects(h.client.login('google'),e=>e===error);assert.equal(h.client.state().profile,null);assert.equal(h.storage.map.size,0);
  delete h.state.readErrors[path];await h.client.login('google');h.state.readErrors[path]=error;
  const restored=h.reopen();await assert.rejects(restored.restore(),e=>e===error);
  assert.equal(restored.state().profile,null);assert.equal(h.storage.map.size,0);assert.equal(h.requests.length,0);
});
test('缺 PR4 投影、未核發 guest、跨課 claim 與錯型別皆不送正式作答',async()=>{
  const h=await harness({noModel:true});await h.client.login('guest');await assert.rejects(h.client.start(5,0),{code:'read-model-pending'});assert.equal(h.requests.length,0);
  const k=await harness();await k.login();for(const hints of [null,'c901',{'115-df':'c901'},{'115-g9':[]}] ){
    k.state.hints=hints;await assert.rejects(k.client.start(5,0),{code:'binding-pending'});
  }assert.equal(k.requests.length,0);
});
test('進度查詢分頁與結尾 fresh controls；換版／斷線不當0，完整空頁才歸零',async()=>{
  const h=await harness();await h.login();let n=0;
  h.model.page=async()=>({...h.state.snapshot,complete:++n===2,nextCursor:n===1?{completedAt:'cursor',resultId:'c_one'}:null,records:n===1?[record()]:[]});
  const s=await h.client.progress({activities});assert.equal(s.records.length,1);assert.equal(n,2);
  h.model.page=async()=>snapshot();let reads=0;h.model.controls=async()=>({...controls,gateVersion:++reads});
  await assert.rejects(h.client.progress({activities}),{code:'control-changed'});assert.equal(h.client.state().snapshot,null);
  h.model.controls=async()=>({...controls});h.model.page=async()=>snapshot([]);assert.equal((await h.client.progress({activities})).records.length,0);
  h.model.page=async()=>{throw Error('offline');};await assert.rejects(h.client.progress({activities}));assert.equal(h.client.state().snapshot,null);
});
test('兩個同關請求只送一筆；舊查詢晚回不蓋過新查詢',async()=>{
  let release;const h=await harness({fetcher:()=>new Promise(r=>release=r)});await h.login();const a=h.client.start(5,0);
  await assert.rejects(h.client.start(5,0),{code:'request-in-flight'});while(!release)await new Promise(r=>setImmediate(r));release(Response.json(response()));await a;
  let finish;h.model.page=()=>new Promise(r=>finish=r);const old=h.client.progress({activities});while(!finish)await new Promise(r=>setImmediate(r));
  h.model.page=async()=>snapshot([]);await h.client.progress({activities});finish(snapshot());await assert.rejects(old,{code:'read-superseded'});
  assert.equal(h.client.state().snapshot.records.length,0);
});
test('跨 UID 已完成只回 resultId 時清除草稿，再次 start 重查版本；owner 還原後也不送作答',async()=>{
  const h=await harness();await h.login();h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_existing'});
  await h.client.start(5,0);assert.deepEqual(savedDrafts(h),{});assert.equal(h.client.state().snapshot,null);
  h.state.context={...await h.client.context(5,0),roundEpoch:1};await h.client.start(5,0);
  assert.notEqual(h.requests[0].body.requestId,h.requests[1].body.requestId);assert.equal(h.requests[1].body.roundEpoch,1);
  assert.ok(h.requests.every(r=>r.url.endsWith('/start')));
  const owner=await harness();await owner.client.login('owner');
  const {createClient}=await import('../assets/fullrev-client.mjs');
  const restored=createClient({config,session:async()=>owner.session,storage:owner.storage,shared:owner.shared,events:null});
  await restored.restore();assert.equal(restored.state().profile.owner,true);
  await assert.rejects(restored.start(5,0),{code:'demonstration-only'});
});
for(const op of ['start','answer','resume'])test(`${op} 完成累積十二關不占草稿容量，第八關後重新整理仍可繼續`,async()=>{
  const h=await harness();await h.login();let client=h.client;
  for(let activity=1;activity<=12;activity++) {
    h.state.fetcher=async()=>Response.json(op==='start'?{completed:true,resultId:'c_'+activity}:response());
    await client.start(activity,0);
    if(op==='answer') {
      h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await client.answer(activity,0,7);
      h.state.fetcher=async()=>Response.json(response(1,{completed:true,resultId:'c_'+activity,question:undefined}));await client.answer(activity,0,7);
    }else if(op==='resume') {
      h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_'+activity});await client.resume(activity,0);
    }
    assert.deepEqual(savedDrafts(h),{});assert.equal(client.state().pending,false);assert.equal(client.state().snapshot,null);
    if(activity===8){client=h.reopen();await client.restore();}
  }
  client=h.reopen();await client.restore();h.state.fetcher=async()=>Response.json(response());await client.start(13,0);
  assert.deepEqual(Object.keys(savedDrafts(h)),['13:0']);
});
for(const status of [403,409,410,422])test(`${status} 作廢草稿立即清除，累積十關及重新整理不占容量，也不再補送`,async()=>{
  const h=await harness();await h.login();let client=h.client;
  for(let activity=1;activity<=10;activity++) {
    h.state.fetcher=async()=>Response.json(response());await client.start(activity,0);
    h.state.fetcher=async()=>new Response('{}',{status});
    await assert.rejects(client.answer(activity,0,7),{code:'restart-required'});
    assert.deepEqual(savedDrafts(h),{});assert.equal(client.state().pending,false);
    const count=h.requests.length;await client.retry();assert.equal(h.requests.length,count);
    if(activity===8){client=h.reopen();await client.restore();}
  }
});
test('八份上限仍限制進行中／斷線草稿，重新整理保留原請求，完成一份才釋出名額',async()=>{
  const h=await harness();await h.login();
  for(let activity=1;activity<=4;activity++)await h.client.start(activity,0);
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};
  for(let activity=5;activity<=8;activity++)await assert.rejects(h.client.start(activity,0),{code:'pending'});
  const original=h.requests.slice(4).map(r=>r.body);
  await assert.rejects(h.client.start(9,0),{code:'draft-capacity'});assert.equal(h.requests.length,8);
  const restored=h.reopen();await restored.restore();await assert.rejects(restored.start(9,0),{code:'draft-capacity'});
  assert.equal(Object.keys(savedDrafts(h)).length,8);
  h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_first'});await restored.answer(1,0,7);
  h.state.fetcher=async()=>Response.json(response());await restored.start(9,0);assert.equal(Object.keys(savedDrafts(h)).length,8);
  h.advance();const before=h.requests.length;await restored.retry();assert.deepEqual(h.requests.slice(before).map(r=>r.body),original);
});
test('還原舊儲存區先剔除完成／作廢草稿再計八份，保留進行中題與原離線答案',async()=>{
  const h=await harness();await h.login();await h.client.start(1,0);await h.client.start(2,0);
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};await assert.rejects(h.client.answer(2,0,7),{code:'pending'});
  const original=h.requests.at(-1).body,saved=JSON.parse(h.storage.getItem(storageKey)),template=saved.drafts['1:0'];
  for(let activity=3;activity<=22;activity++)saved.drafts[activity+':0']={...template,activity,context:{...template.context,activity},
    pending:activity<=12?null:{op:'answer',body:{...original,activity}},slot:undefined,...(activity<=12?{}:{blocked:true})};
  h.storage.setItem(storageKey,JSON.stringify(saved));const restored=h.reopen();await restored.restore();
  assert.deepEqual(Object.keys(savedDrafts(h)),['1:0','2:0']);
  h.state.fetcher=async()=>Response.json(response());await restored.resume(1,0);
  h.advance();const before=h.requests.length;await restored.retry();assert.deepEqual(h.requests.slice(before).map(r=>r.body),[original]);
  await restored.start(23,0);await assert.rejects(restored.resume(3,0),{code:'restart-required'});
});
test('離頁即作廢未完成回應；題面與舊進度不在隱藏分頁回填',async()=>{
  let done;const h=await harness({fetcher:()=>new Promise(resolve=>done=resolve)});await h.login();
  const request=h.client.start(5,0);while(!done)await new Promise(resolve=>setImmediate(resolve));
  h.events.get('pagehide')();done(Response.json(response()));await assert.rejects(request,{code:'identity-changed'});
  assert.equal(h.client.state().snapshot,null);assert.equal(h.client.state().pending,true);
});
test('context 額外欄位不落入草稿；重送達四次後停止自動排程',async()=>{
  const h=await harness();await h.login();
  h.state.context={...await h.client.context(5,0),privateQuestion:{expected:7},token:'must-not-persist'};
  h.state.fetcher=async()=>new Response('{}',{status:503});
  await assert.rejects(h.client.start(5,0),{code:'pending'});
  for(let i=0;i<3;i++){h.advance();await assert.rejects(h.client.retry(),{code:'pending'});}
  assert.equal(h.timers.length,3);assert.doesNotMatch([...h.storage.map.values()].join(),/privateQuestion|expected|must-not-persist/);
});
test('上一人的請求持續無回應也不會卡住新身分同一關',async()=>{
  let release;const h=await harness({fetcher:()=>new Promise(resolve=>release=resolve)});await h.login();
  const old=h.client.start(5,0);while(!release)await new Promise(resolve=>setImmediate(resolve));
  h.state.uid='synthetic-new';h.state.fetcher=async()=>Response.json(response());await h.login();
  await h.client.start(5,0);assert.equal(h.requests.length,2);
  release(Response.json(response()));await assert.rejects(old,{code:'identity-changed'});
  assert.equal(h.client.state().profile.uid,'synthetic-new');
});
