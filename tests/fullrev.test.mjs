import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {checkConfig} from '../assets/fullrev-client.mjs';
import {effectiveRecords,growth,exportRows} from '../assets/fullrev-progress.mjs';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {renderOutcome} from '../assets/fullrev-outcomes.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {config,opened,controls,activities,record,snapshot,harness,response} from './fixtures/fullrev.mjs';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',context);
const xp=context.xp, options={project:config.firebase.projectId,course:'115-g9',subject:'synthetic-subject',provider:'password',activities};
const storageKey='ybs:fullrev:'+config.firebase.projectId+':115-g9';
const savedDrafts=h=>JSON.parse(h.storage.getItem(storageKey)).drafts;

test('Worker 儲存額度不足：保留原待送、停止自動重試，手動成功後清除原因',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>Response.json({error:'storage_quota'},{status:503,headers:{'retry-after':'60'}});
  await assert.rejects(h.client.answer(5,0,7),{code:'pending'});
  assert.equal(h.client.state().uploadIssue,'storage-quota');assert.equal(h.client.state().pending,true);
  assert.equal(h.timers.length,0);const original=h.requests.at(-1).body;
  assert.equal((await h.client.retry()).length,0,'冷卻期間不重送');
  h.advance();h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await h.client.retry();
  assert.deepEqual(h.requests.at(-1).body,original);assert.equal(h.client.state().uploadIssue,null);assert.equal(h.client.state().pending,false);
});
test('Worker 請求無回應會逾時，保留答案並能原封重試，不永久卡在 sending',async()=>{
  const h=await harness({requestTimeoutMs:10});await h.login();await h.client.start(5,0);
  let signal;h.state.fetcher=async(_url,init)=>{signal=init.signal;return new Promise(()=>{});};
  await assert.rejects(h.client.answer(5,0,7),{code:'pending'});
  assert.equal(signal.aborted,true);assert.equal(h.client.state().status,'pending');assert.equal(h.client.state().uploadIssue,'connection-failed');
  const original=h.requests.at(-1).body;h.advance();h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await h.client.retry();
  assert.deepEqual(h.requests.at(-1).body,original);assert.equal(h.client.state().pending,false);
});
for(const status of [200,400,429,503])test(`Worker ${status} 標頭後本文停住仍逾時，原 requestId 重送且可換關`,{timeout:2000},async()=>{
  const h=await harness({requestTimeoutMs:10});await h.login();await h.client.start(5,0);
  let signal,body;
  h.state.fetcher=async(_url,init)=>{
    signal=init.signal;
    return new Response(new ReadableStream({start(controller){body=controller;controller.enqueue(new TextEncoder().encode('{'));}}),{status});
  };
  await assert.rejects(h.client.answer(5,0,7),{code:'pending'});
  assert.equal(signal.aborted,true);assert.equal(h.client.state().status,'pending');
  assert.equal(h.client.state().uploadIssue,'connection-failed');assert.equal(h.client.state().pending,true);
  const original=h.requests.at(-1).body;
  assert.deepEqual(savedDrafts(h)['5:0'].pending.body,original);
  // 不依賴測試 fetcher 配合 abort；晚到的本文也不能清除待送或改寫畫面。
  body.enqueue(new TextEncoder().encode(JSON.stringify(response(1,{correct:true})).slice(1)));body.close();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.client.state().status,'pending');assert.deepEqual(savedDrafts(h)['5:0'].pending.body,original);
  h.advance();h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await h.client.retry();
  assert.deepEqual(h.requests.at(-1).body,original);assert.equal(h.client.state().pending,false);
  // 再次卡住本文後選別關，不能被上一筆 gradingWork／running 鎖住。
  h.state.fetcher=async()=>({ok:true,status:200,json:()=>new Promise(()=>{})});
  await assert.rejects(h.client.answer(5,0,8),{code:'pending'});
  h.state.fetcher=async()=>Response.json(response());const next=await h.client.start(5,1);
  assert.equal(next.round,1);assert.equal(h.client.state().pending,false);
});

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
test('同一投影多人匯出隔離主體，guest／空集合沿用學生 XP，重算不修改輸入',()=>{
  const people=[{subject:options.subject,cls:901,seat:1,provider:'password'},
    {subject:'synthetic-guest',cls:901,seat:2,provider:'anonymous'},
    {subject:'synthetic-empty',cls:901,seat:3,provider:'google.com'}];
  const first=[0,1,2,3].map(round=>record(round));
  const records=[...first,record(0,{uid:'synthetic-other'}),
    record(0,{subject:people[1].subject,provider:'anonymous'}),
    record(3,{subject:people[2].subject,validity:{state:'excluded',reason:'reset'}})];
  let scans=0,visits=0;
  Object.defineProperty(records,Symbol.iterator,{value:function*(){
    scans++;for(let i=0;i<this.length;i++){visits++;yield this[i];}
  }});
  const projection=snapshot(records,{subject:undefined,people}),before=JSON.stringify(projection);
  const opts={...options,subject:undefined};let calculations=0;
  const countedXP={calculate(...args){calculations++;return xp.calculate(...args);}};
  const rows=exportRows(projection,opts,countedXP);
  assert.equal(scans,1,'匯出只走訪原始投影一次');assert.equal(visits,records.length);
  assert.equal(calculations,3,'每個主體只計算一次 XP，含訪客的其餘進度與已確認空集合');
  assert.equal(rows.length,16);
  for(let i=0;i<people.length;i++) {
    const person=people[i],progress=growth(snapshot(records.filter(r=>r.subject===person.subject)),{...opts,...person},xp);
    const block=rows.slice(1+i*5,6+i*5);
    assert.deepEqual(block.map(row=>row.slice(0,2)),Array.from({length:5},()=>[901,person.seat]));
    assert.equal(block.at(-1)[6],progress.totalXP===null?'待確認':progress.totalXP);
    assert.deepEqual(block.slice(0,4).map(row=>row[4]),i===0?Array(4).fill('已確認過關'):
      i===1?['已確認過關',...Array(3).fill('尚未過關')]:Array(4).fill('尚未過關'));
    assert.deepEqual(block.slice(0,4).map(row=>row[6]),i===0?Array(4).fill(15):i===1?Array(4).fill('待確認'):Array(4).fill(0));
  }
  assert.deepEqual(exportRows(projection,opts,xp),rows);
  assert.equal(JSON.stringify(projection),before);
  const canceled=snapshot(records.map(r=>r.subject===options.subject?{...r,validity:{state:'excluded',reason:'reset'}}:r),{subject:undefined,people});
  assert.equal(exportRows(canceled,opts,xp)[5][6],0);
  assert.equal(exportRows(projection,opts,xp)[5][6],80);
});
test('多人匯出對原始與有效紀錄的走訪次數隨人數線性成長',t=>{
  let visits=0;
  const count=value=>{if(value?.source==='worker-validated'&&value.resultId?.startsWith('c_scan_'))visits++;};
  const originals=new Map([Symbol.iterator,'filter','find','some'].map(key=>[key,Object.getOwnPropertyDescriptor(Array.prototype,key)]));
  const iterator=originals.get(Symbol.iterator).value,measurements=[];
  // 有效集合由實作複製產生；只監看輸入陣列的迭代器會漏掉逐人 filter。
  try {
    Object.defineProperty(Array.prototype,Symbol.iterator,{...originals.get(Symbol.iterator),value:function*(){
      for(const value of Reflect.apply(iterator,this,[])){count(value);yield value;}
    }});
    for(const method of ['filter','find','some']) {
      const descriptor=originals.get(method);
      Object.defineProperty(Array.prototype,method,{...descriptor,value:function(callback,thisArg){
        return Reflect.apply(descriptor.value,this,[(value,index,array)=>{
          count(value);return Reflect.apply(callback,thisArg,[value,index,array]);
        }]);
      }});
    }
    for(const size of [10,20,40]) {
      const people=Array.from({length:size},(_,i)=>({subject:'synthetic-scan-'+i,cls:901,seat:i+1,provider:'password'}));
      const records=people.flatMap(person=>[0,1,2,3].map(round=>record(round,{
        subject:person.subject,resultId:'c_scan_'+person.seat+'_'+round
      })));
      visits=0;
      const rows=exportRows(snapshot(records,{subject:undefined,people}),{...options,subject:undefined},xp);
      measurements.push({people:size,records:records.length,visits});
      assert.equal(rows.length,1+size*5);
      assert.equal(rows.at(-1)[6],80);
    }
  } finally {for(const [key,descriptor] of originals)Object.defineProperty(Array.prototype,key,descriptor);}
  t.diagnostic('合成紀錄走訪次數：'+JSON.stringify(measurements));
  for(const result of measurements)assert.ok(result.visits<=result.records*10,
    `${result.people} 人、${result.records} 筆紀錄走訪 ${result.visits} 次，超過線性成本上限 ${result.records*10}`);
  for(let i=1;i<measurements.length;i++)assert.ok(measurements[i].visits<=measurements[i-1].visits*2+8,
    '人數加倍時，紀錄走訪次數應至多加倍（容許固定成本）');
});
test('多人匯出遇到 unknown／名冊缺漏不得產生部分成績或採用舊結果',()=>{
  const opts={...options,subject:undefined};
  const people=[...snapshot().people,{subject:'synthetic-later',cls:901,seat:2,provider:'password'}];
  const records=[...snapshot().records,...[0,1,2,3].map(round=>record(round,{
    subject:people[1].subject,resultId:'c_later_'+round
  }))];
  const projection=snapshot(records,{subject:undefined,people});
  assert.equal(exportRows(projection,opts,xp).at(-1)[6],80);
  for(const change of [{state:'unknown'},{complete:false},{controlVersions:{gateVersion:2,classGateVersion:1}},
    {records:records.map(r=>r.subject===people[1].subject?{...r,validity:{state:'unknown'}}:r)}]) {
    let calculations=0;
    assert.throws(()=>exportRows({...projection,...change},opts,{calculate(){calculations++;throw Error('unexpected-xp');}}),{code:'export-unconfirmed'});
    assert.equal(calculations,0);
  }
  for(const people of [undefined,[],projection.people.slice(0,1),[...projection.people,projection.people[1]],
    [projection.people[0],{...projection.people[1],seat:0}]])assert.throws(()=>exportRows({...projection,people},opts,xp),{code:'roster-unconfirmed'});
  assert.throws(()=>exportRows({...projection,records:records.map(r=>r.subject===people[1].subject?{...r,xpPolicySnapshot:null}:r)},opts,xp),{code:'xp-unconfirmed'});
  assert.equal(exportRows(projection,opts,xp).at(-1)[6],80);
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
for(const op of ['start','answer','resume'])test(`${op} fetch 例外保留原因與 pending 狀態，重新整理仍重送原草稿`,async t=>{
  for(const [name,cause] of [['Error',Error('synthetic-offline')],['null',null],['undefined',undefined],['字串','synthetic-offline'],
    ...['invalid-answer','login-required','answer-too-large'].map(code=>[code,Object.assign(Error('synthetic-fetch-error'),{code})])])await t.test(name,async()=>{
    const h=await harness();await h.login();if(op!=='start')await h.client.start(5,0);
    h.state.fetcher=()=>{throw cause;};
    await assert.rejects(h.client[op](5,0,op==='answer'?7:undefined),error=>{
      assert.equal(error.code,'pending');assert.equal(error.cause,cause);return true;
    });
    const original=h.requests.at(-1).body,draft=savedDrafts(h)['5:0'];
    assert.equal(h.client.state().status,'pending');assert.equal(h.client.state().pending,true);
    assert.deepEqual(draft.pending,{op,body:original});assert.equal(draft.failures,1);assert.equal(h.timers.at(-1).ms,1000);
    const restored=h.reopen();await restored.restore();h.advance();h.state.fetcher=async()=>Response.json(response());
    await restored.retry();assert.deepEqual(h.requests.at(-1).body,original);
    assert.equal(restored.state().pending,false);assert.equal(restored.state().status,'ready');
  });
});
for(const op of ['start','answer','resume'])test(`${op} 成功 HTTP 的非 JSON／無效內容保留可判斷原因與可重送草稿`,async t=>{
  const readError=new TypeError('synthetic-body-read-failed');
  for(const [name,makeResponse,syntax,cause] of [
    ['HTML',()=>new Response('<html>synthetic-error</html>'),true],
    ['空回應',()=>new Response(null,{status:204}),true],
    ['截斷 JSON',()=>new Response('{"completed":'),true],
    ['本文讀取 TypeError',()=>new Response(new ReadableStream({start(controller){controller.error(readError);}})),false,readError],
    ['null',()=>Response.json(null),false],
    ['不完整物件',()=>Response.json({completed:false}),false]
  ])await t.test(name,async()=>{
    const h=await harness();await h.login();if(op!=='start')await h.client.start(5,0);
    h.state.fetcher=async()=>makeResponse();
    await assert.rejects(h.client[op](5,0,op==='answer'?7:undefined),error=>{
      assert.equal(error.code,'pending');assert.equal(error.status,name==='空回應'?204:200);
      assert.equal(error.cause.code,'response-invalid');if(syntax)assert.ok(error.cause.cause instanceof SyntaxError);
      if(cause)assert.equal(error.cause.cause,cause);return true;
    });
    const original=h.requests.at(-1).body;
    assert.equal(h.client.state().status,'pending');assert.equal(h.client.state().pending,true);
    assert.deepEqual(savedDrafts(h)['5:0'].pending,{op,body:original});assert.equal(h.timers.at(-1).ms,1000);
    const restored=h.reopen();await restored.restore();h.advance();h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_replayed'});
    await restored.retry();assert.deepEqual(h.requests.at(-1).body,original);
    assert.deepEqual(savedDrafts(h),{});assert.equal(restored.state().snapshot,null);
  });
});
for(const status of [429,503])test(`${status} 非 JSON 回應仍依 HTTP 狀態退避，不解析本文或遺失答案`,async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>new Response('<html>synthetic-unavailable</html>',{status,headers:{'Retry-After':'90'}});
  await assert.rejects(h.client.answer(5,0,7),{code:'pending',status});
  const original=h.requests.at(-1).body;
  if(status===429){assert.equal(h.timers.length,0);assert.equal(h.client.state().uploadIssue,'storage-quota');}
  else assert.equal(h.timers.at(-1).ms,90000);
  await h.client.retry();assert.equal(h.requests.length,2);
  h.advance(90001);h.state.fetcher=async()=>Response.json(response());await h.client.retry();
  assert.deepEqual(h.requests.at(-1).body,original);
});
for(const [round,op] of ['start','answer','resume','retry'].entries())test(`${op} 完成回條映射原關卡 5:${round}，只有 fresh 有效投影才能確認過關與 XP`,async()=>{
  const h=await harness();await h.login();
  if(op!=='start')await h.client.start(5,round);
  assert.equal(growth(await h.client.progress({activities}),options,xp).totalXP,80);
  let original;
  if(op==='retry'){
    h.state.fetcher=async()=>{throw Error('synthetic-offline');};
    await assert.rejects(h.client.answer(5,round,7),{code:'pending'});original=h.requests.at(-1).body;h.advance();
  }
  const receipt={completed:true,resultId:record(round).resultId};
  h.state.fetcher=async()=>Response.json(receipt);
  const result=op==='retry'?(await h.client.retry())[0]:await h.client[op](5,round,...(op==='answer'?[7]:[]));
  assert.deepEqual(result,{activity:5,round,...receipt});
  if(original)assert.deepEqual(h.requests.at(-1).body,original);
  assert.equal(h.client.state().status,'confirmation-pending');assert.equal(h.client.state().pending,false);
  assert.equal(h.client.state().snapshot,null);assert.deepEqual(savedDrafts(h),{});
  assert.equal(growth(h.client.state().snapshot,options,xp).totalXP,null);

  h.state.snapshot=snapshot([],{state:'unknown'});
  await assert.rejects(h.client.progress({activities}),{code:'page-unconfirmed'});
  assert.equal(h.client.state().snapshot,null);
  assert.throws(()=>exportRows(h.client.state().snapshot,options,xp),{code:'export-unconfirmed'});
  for(const records of [[],[record(round,{validity:{state:'excluded',reason:'reset'}})]]){
    h.state.snapshot=snapshot(records);
    const result=growth(await h.client.progress({activities}),options,xp);
    assert.equal(result.state,'confirmed');assert.equal(result.totalXP,0);
    assert.equal(result.activities[0].passed,0);assert.equal(result.activities[0].completeXP,0);
  }
  h.state.snapshot=snapshot([record(round)]);
  const confirmed=growth(await h.client.progress({activities}),options,xp);
  assert.equal(confirmed.state,'confirmed');assert.equal(confirmed.totalXP,15);
  assert.deepEqual(confirmed.activities[0].rounds.map(r=>r.passed),activities[0].rounds.map((_,i)=>i===round));
  assert.equal(confirmed.activities[0].completeXP,0);
});
test('未知或不完整回條保留原請求待重試，不能當 completed 或 XP',async t=>{
  for(const value of [{completed:'true',resultId:'c_invalid'},{completed:true},{completed:true,resultId:''},
    {completed:false},{state:'completed',resultId:'c_invalid'}])await t.test(JSON.stringify(value),async()=>{
    const h=await harness();await h.login();await h.client.start(5,0);
    h.state.fetcher=async()=>Response.json(value);
    await assert.rejects(h.client.answer(5,0,7),{code:'pending'});
    const original=h.requests.at(-1).body;
    assert.equal(h.client.state().status,'pending');assert.equal(h.client.state().pending,true);
    assert.equal(h.client.state().snapshot,null);assert.equal(growth(h.client.state().snapshot,options,xp).totalXP,null);
    assert.deepEqual(savedDrafts(h)['5:0'].pending.body,original);
    h.advance();h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_replayed'});
    await h.client.retry();assert.deepEqual(h.requests.at(-1).body,original);
    assert.equal(h.client.state().status,'confirmation-pending');assert.equal(h.client.state().snapshot,null);
  });
});
test('等待教師回條只表示已送達，重新開始仍重查 Worker，不產生完成或 XP',async()=>{
  const receipt={sid:'s'.repeat(22),completed:false,awaitingTeacher:true};
  const h=await harness({fetcher:async()=>Response.json(receipt)});await h.login();
  assert.deepEqual(await h.client.start(5,0),{activity:5,round:0,...receipt});
  assert.equal(h.client.state().status,'teacher-pending');assert.equal(h.client.state().pending,false);
  assert.equal(h.client.state().snapshot,null);assert.deepEqual(savedDrafts(h),{});
  assert.equal(growth(h.client.state().snapshot,options,xp).totalXP,null);
  await h.client.start(5,0);assert.equal(h.requests.length,2);
  assert.ok(h.requests.every(r=>r.url.endsWith('/start')));
});
test('已有完整過關投影遇到未知有效性或混版時，清除採計快照並禁止匯出',async t=>{
  for(const validity of [undefined,{state:'unknown',reason:'control-unavailable'},{state:'expired'},
    {state:'effective',controlVersions:{...controls,gateVersion:2}}])await t.test(JSON.stringify(validity)||'missing',async()=>{
    const h=await harness();await h.login();
    assert.equal(growth(await h.client.progress({activities}),options,xp).totalXP,80);
    h.state.snapshot=snapshot([record(0,{validity}),record(1),record(2),record(3)]);
    await assert.rejects(h.client.progress({activities}),{code:'validity-unconfirmed'});
    assert.equal(h.client.state().status,'confirmation-pending');assert.equal(h.client.state().snapshot,null);
    const result=growth(h.state.snapshot,options,xp);
    assert.equal(result.state,'unknown');assert.equal(result.totalXP,null);assert.deepEqual(result.records,[]);
    assert.throws(()=>exportRows(h.state.snapshot,options,xp),{code:'export-unconfirmed'});
  });
});
test('成果題介面收到完成回條仍顯示待確認，未知不顯示 XP，fresh 投影才更新過關',async t=>{
  class UIElement extends Element {
    append(...children){for(const child of children)super.append(child);}
    replaceChildren(...children){this.childNodes.forEach(child=>child.parentElement=null);this.childNodes=[];this.append(...children);}
  }
  const body=new UIElement('body'),events=new Map();
  for(const [key,value] of Object.entries({document:{body,createElement:tag=>new UIElement(tag),addEventListener(){}},
    window:{addEventListener:(name,fn)=>events.set(name,fn)},ACTIVITIES:activities,YBSXP:xp})){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  }
  const question={slot:0,type:'finite-bank-v1',data:{mode:'sheet-synthetic',heading:'合成成果',questions:[['合成數量']],kinds:['n']}};
  const h=await harness({fetcher:async()=>Response.json(response(0,{question}))});
  await mountActivity({client:Promise.resolve(h.client),cfg:{week:5,title:'合成活動',rounds:[{name:'合成關卡'}],
    renderQuestion:(q,host,api)=>renderOutcome(host,q.data,api.changed)}});
  await h.login();
  const button=text=>body.querySelectorAll('button').find(e=>e.textContent===text);
  await button('開始這一關').onclick();
  const input=body.querySelectorAll('input').find(e=>e.dataset.answerField===0);input.value='7';input.oninput();
  let release,started;
  const reading=new Promise(resolve=>started=resolve);
  h.model.page=()=>new Promise(resolve=>{release=resolve;started();});
  h.state.fetcher=async()=>Response.json({completed:true,resultId:record().resultId});
  await button('送出').onclick();await reading;
  assert.match(body.textContent,/作答已送達，正在確認有效過關紀錄/);
  assert.doesNotMatch(body.textContent,/\d+ XP|已獲得徽章/);assert.equal(button('送出').disabled,true);
  release(snapshot([],{state:'unknown'}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.client.state().snapshot,null);assert.doesNotMatch(body.textContent,/\d+ XP|已獲得徽章/);

  h.model.page=async()=>h.state.snapshot;
  for(const [records,expected] of [[[],0],[[record()],15],[snapshot().records,80],
    [[record(0,{validity:{state:'excluded',reason:'reset'}})],0]]){
    h.state.snapshot=snapshot(records);events.get('focus')();await new Promise(resolve=>setImmediate(resolve));
    assert.match(body.textContent,new RegExp('· '+expected+' XP'));
    if(expected===80)assert.match(body.textContent,/已獲得徽章/);else assert.doesNotMatch(body.textContent,/已獲得徽章/);
    assert.match(body.textContent,new RegExp('：'+records.filter(r=>r.validity.state==='effective').length+'／4 關'));
    if(expected===80){
      h.state.snapshot=snapshot([],{state:'unknown'});events.get('focus')();await new Promise(resolve=>setImmediate(resolve));
      assert.equal(h.client.state().snapshot,null);assert.doesNotMatch(body.textContent,/\d+ XP|已獲得徽章/);
    }
  }
  h.model.page=async()=>{throw Error('synthetic-offline');};
  events.get('focus')();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.client.state().snapshot,null);assert.doesNotMatch(body.textContent,/\d+ XP|已獲得徽章/);
});
test('429／503 尊重 Retry-After 且有上限重試，401 僅刷新一次',async()=>{
  const h=await harness();await h.login();h.state.fetcher=async()=>Response.json({error:'rate_limited'},{status:429,headers:{'Retry-After':'90'}});
  await assert.rejects(h.client.start(5,0),{code:'pending'});assert.equal(h.timers.at(-1).ms,90000);
  await h.client.retry();assert.equal(h.requests.length,1);h.advance(90001);
  let n=0;h.state.fetcher=async()=>++n===1?new Response('{}',{status:401}):Response.json(response());await h.client.retry();
  assert.deepEqual(h.state.force.slice(-2),[false,true]);
  const failed=await harness();await failed.login();failed.state.fetcher=async()=>new Response('<html>synthetic-unauthorized</html>',{status:401});
  await assert.rejects(failed.client.start(5,0),{code:'login-required'});assert.equal(failed.requests.length,2);assert.equal(failed.client.state().profile,null);
  assert.deepEqual(failed.state.force,[false,true]);assert.equal(failed.storage.map.size,0);assert.equal(failed.timers.length,0);
});
test('401 刷新後 fetch 失聯保留原答案，pending 不沿用前一次 HTTP 狀態',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);const cause=Error('synthetic-offline');
  let n=0;h.state.fetcher=async()=>{if(++n===1)return new Response(null,{status:401});throw cause;};
  await assert.rejects(h.client.answer(5,0,7),error=>{
    assert.equal(error.code,'pending');assert.equal(error.cause,cause);assert.equal(error.status,undefined);return true;
  });
  assert.deepEqual(h.state.force.slice(-2),[false,true]);assert.equal(h.client.state().profile.uid,'synthetic-student');
  const original=h.requests.at(-1).body;assert.deepEqual(h.requests.at(-2).body,original);
  h.advance();h.state.fetcher=async()=>Response.json(response());await h.client.retry();assert.deepEqual(h.requests.at(-1).body,original);
});
for(const op of ['start','answer','resume'])test(`${op} 401 後刷新 token 失敗保留原因與草稿，不沿用 401 或清除登入`,async()=>{
  const h=await harness();await h.login();if(op!=='start')await h.client.start(5,0);
  const cause=Object.assign(Error('synthetic-refresh-failed'),{code:'auth/network-request-failed'});
  const getIdToken=h.auth.currentUser.getIdToken;
  h.auth.currentUser.getIdToken=async force=>{const value=await getIdToken(force);if(force)throw cause;return value;};
  h.state.fetcher=async()=>new Response(null,{status:401});
  await assert.rejects(h.client[op](5,0,op==='answer'?7:undefined),error=>{
    assert.equal(error.code,'pending');assert.equal(error.cause,cause);assert.equal(error.status,undefined);return true;
  });
  assert.deepEqual(h.state.force.slice(-2),[false,true]);assert.equal(h.requests.length,op==='start'?1:2);
  assert.equal(h.client.state().profile.uid,'synthetic-student');assert.equal(h.client.state().status,'pending');
  assert.equal(h.client.state().pending,true);
  const original=h.requests.at(-1).body,draft=savedDrafts(h)['5:0'];
  assert.deepEqual(draft.pending,{op,body:original});assert.equal(draft.failures,1);assert.equal(h.timers.at(-1).ms,1000);
  const restored=h.reopen();await restored.restore();h.advance();h.auth.currentUser.getIdToken=getIdToken;
  h.state.fetcher=async()=>Response.json({completed:true,resultId:'c_replayed'});
  const count=h.requests.length;await restored.retry();assert.equal(h.requests.length,count+1);
  assert.deepEqual(h.requests.at(-1).body,original);assert.deepEqual(savedDrafts(h),{});
  assert.equal(restored.state().pending,false);assert.equal(restored.state().snapshot,null);
});
test('400 只有 JSON invalid_answer 可同題修正，非 JSON 仍按原規則重開',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>Response.json({error:'invalid_answer'},{status:400});
  await assert.rejects(h.client.answer(5,0,7),{code:'invalid-answer'});
  const original=h.requests.at(-1).body;
  assert.equal(h.client.state().status,'ready');assert.equal(h.client.state().pending,false);assert.equal(h.timers.length,0);
  h.state.fetcher=async()=>new Response('<html>synthetic-bad-request</html>',{status:400});
  await assert.rejects(h.client.answer(5,0,8),{code:'restart-required'});
  const corrected=h.requests.at(-1).body;for(const key of ['sid','seq','slot'])assert.equal(corrected[key],original[key]);
  assert.notEqual(corrected.requestId,original.requestId);assert.deepEqual(savedDrafts(h),{});
  const count=h.requests.length;await h.client.retry();assert.equal(h.requests.length,count);
});
for(const status of [403,409,410])test(`${status}：舊草稿不換版補傳，明確重開才產生新 start`,async()=>{
  const h=await harness();await h.login();h.state.fetcher=async()=>new Response('<html>synthetic-rejected</html>',{status});
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
for(const phase of ['fetch','json'])test(`換人後遲到的 ${phase} 例外仍為 identity-changed，不復活草稿`,async()=>{
  let reject;
  const pending=()=>new Promise((resolve,fail)=>{reject=fail;});
  const h=await harness({fetcher:phase==='fetch'?pending:async()=>({ok:true,status:200,json:pending})});await h.login();
  const old=h.client.start(5,0);while(!reject)await new Promise(resolve=>setImmediate(resolve));
  h.state.uid='synthetic-new';await h.login();const saved=h.storage.getItem(storageKey);
  reject(null);await assert.rejects(old,{code:'identity-changed'});
  assert.equal(h.client.state().profile.uid,'synthetic-new');assert.equal(h.client.state().status,'signed-in');
  assert.equal(h.client.state().pending,false);assert.equal(h.storage.getItem(storageKey),saved);assert.equal(h.timers.length,0);
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
test('缺 PR4 投影、未填班座、跨課 claim 與錯型別皆不送正式作答',async()=>{
  const h=await harness({noModel:true});await assert.rejects(h.client.login('guest'),{code:'guest-seat-required'});assert.equal(h.requests.length,0);
  const k=await harness();await k.login();for(const hints of [null,'c901',{'115-df':'c901'},{'115-g9':[]}] ){
    k.state.hints=hints;await assert.rejects(k.client.start(5,0),{code:'binding-pending'});
  }assert.equal(k.requests.length,0);
});
test('進度查詢分頁與結尾 fresh controls；換版／斷線不當0，完整空頁才歸零',async()=>{
  const h=await harness();await h.login();let n=0;
  h.model.page=async()=>({...h.state.snapshot,complete:++n===2,nextCursor:n===1?{completedAt:'cursor',resultId:'c_one'}:null,records:n===1?[record()]:[]});
  const s=await h.client.progress({activities});assert.equal(s.records.length,1);assert.equal(n,2);
  // The merged cold page supplies the initial versions; the trailing v1 check
  // must see a newer gate even on its first controls call.
  h.model.page=async()=>snapshot();let reads=0;h.model.controls=async()=>({...controls,gateVersion:controls.gateVersion+(++reads)});
  await assert.rejects(h.client.progress({activities}),{code:'control-changed'});assert.equal(h.client.state().snapshot,null);
  h.model.controls=async()=>({...controls});h.model.page=async()=>snapshot([]);assert.equal((await h.client.progress({activities})).records.length,0);
  h.model.page=async()=>{throw Error('offline');};await assert.rejects(h.client.progress({activities}));assert.equal(h.client.state().snapshot,null);
});
test('兩個同關請求只送一筆；進度同時查詢合併為一筆',async()=>{
  let release;const h=await harness({fetcher:()=>new Promise(r=>release=r)});await h.login();const a=h.client.start(5,0);
  await assert.rejects(h.client.start(5,0),{code:'request-in-flight'});while(!release)await new Promise(r=>setImmediate(r));release(Response.json(response()));await a;
  let finish;h.model.page=()=>new Promise(r=>finish=r);const old=h.client.progress({activities});while(!finish)await new Promise(r=>setImmediate(r));
  let extra=0;h.model.page=async()=>{extra++;return snapshot([]);};const combined=h.client.progress({activities});finish(snapshot());
  await Promise.all([old,combined]);assert.equal(extra,0);assert.equal(h.client.state().snapshot.records.length,4);
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
test('跨關／活動切換放棄舊草稿，超過八關仍可開始；重整保留當關離線原請求',async()=>{
  const h=await harness();await h.login();
  for(let activity=1;activity<=12;activity++){
    await h.client.start(activity,0);assert.deepEqual(Object.keys(savedDrafts(h)),[activity+':0']);
  }
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};
  await assert.rejects(h.client.answer(12,0,7),{code:'pending'});const original=h.requests.at(-1).body;
  const restored=h.reopen();await restored.restore();h.advance();h.state.fetcher=async()=>Response.json(response());
  await restored.start(12,0);assert.deepEqual(h.requests.at(-1).body,original);
  await restored.start(12,1);assert.deepEqual(Object.keys(savedDrafts(h)),['12:1']);
  await assert.rejects(restored.resume(12,0),{code:'restart-required'});
  await restored.start(13,0);const count=h.requests.length;await restored.retry();assert.equal(h.requests.length,count);
});
test('還原舊儲存區先剔除完成／作廢草稿再計八份，保留進行中題與原離線答案',async()=>{
  const h=await harness();await h.login();await h.client.start(1,0);const template=savedDrafts(h)['1:0'];await h.client.start(2,0);
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};await assert.rejects(h.client.answer(2,0,7),{code:'pending'});
  const original=h.requests.at(-1).body,saved=JSON.parse(h.storage.getItem(storageKey));saved.drafts['1:0']=template;
  for(let activity=3;activity<=22;activity++)saved.drafts[activity+':0']={...template,activity,context:{...template.context,activity},
    pending:activity<=12?null:{op:'answer',body:{...original,activity}},slot:undefined,...(activity<=12?{}:{blocked:true})};
  h.storage.setItem(storageKey,JSON.stringify(saved));const restored=h.reopen();await restored.restore();
  assert.deepEqual(Object.keys(savedDrafts(h)).sort(),['1:0','2:0']);
  h.state.fetcher=async()=>Response.json(response());await restored.resume(1,0);
  h.advance();const before=h.requests.length;await restored.retry();assert.deepEqual(h.requests.slice(before).map(r=>r.body),[original]);
  await restored.start(23,0);await assert.rejects(restored.resume(3,0),{code:'restart-required'});
});
test('放棄離線答案或 start 後的計時器及手動重試不會重開舊關',async()=>{
  for(const op of ['answer','start']){
    const h=await harness();await h.login();if(op==='answer')await h.client.start(5,0);
    h.state.fetcher=async()=>{throw Error('synthetic-offline');};
    await assert.rejects(op==='answer'?h.client.answer(5,0,7):h.client.start(5,0),{code:'pending'});
    const timer=h.timers.at(-1);h.state.fetcher=async()=>Response.json(response());
    await h.client.start(6,0);assert.equal(h.client.state().pending,false);assert.deepEqual(Object.keys(savedDrafts(h)),['6:0']);
    h.advance();timer.fn();await new Promise(resolve=>setImmediate(resolve));const count=h.requests.length;
    await h.client.retry();assert.equal(h.requests.length,count);assert.equal(h.requests.at(-1).body.activity,6);
  }
});
test('切換等前一筆送出結束；排隊舊重試不得在新關開始後補送',async()=>{
  const h=await harness();await h.login();await h.client.start(5,0);
  let release;h.state.fetcher=()=>new Promise(resolve=>{release=resolve;});
  const answer=h.client.answer(5,0,7);while(!release)await new Promise(resolve=>setImmediate(resolve));
  const next=h.client.start(6,0);
  assert.equal(h.requests.length,2,'新關不可與舊答案同時送出');
  h.state.fetcher=async()=>Response.json(response());release(Response.json(response(1,{correct:true})));
  await answer;await next;
  assert.deepEqual(h.requests.map(r=>new URL(r.url).pathname),['/start','/answer','/start']);
  assert.deepEqual(Object.keys(savedDrafts(h)),['6:0']);
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};await assert.rejects(h.client.answer(6,0,7),{code:'pending'});
  h.advance();h.state.fetcher=async()=>Response.json(response());
  const switched=h.client.start(7,0),retry=h.client.retry();await switched;await retry;
  assert.equal(h.requests.at(-1).body.activity,7);assert.equal(h.requests.at(-1).url.endsWith('/start'),true);
  assert.deepEqual(Object.keys(savedDrafts(h)),['7:0']);
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

test('已核可訪客成果保留匿名來源並發永久 XP，與正式成果共同成長',()=>{
  const guest=record(1,{source:'worker-guest-approved',approvalId:'synthetic-approval',provider:'anonymous'});
  const value=growth(snapshot([record(0),guest]),options,xp);
  assert.equal(value.totalXP,30);assert.equal(value.state,'confirmed');
  assert.equal(value.activities[0].rounds[0].passed,true);
  assert.equal(value.activities[0].rounds[1].passed,true);
  assert.equal(value.records.find(r=>r.source==='worker-guest-approved').provider,'anonymous');
  assert.equal(value.records.length,2);
});
