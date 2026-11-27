// 合成 Firestore 故障與實際 DF 交件佇列；不連雲端、不替代 client 邏輯。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createDFReports} from '../assets/fullrev-df.mjs';
import DFReport from '../assets/df-report.js';
import {harness,response,store} from './fixtures/fullrev.mjs';

const html=await readFile(new URL('../115-df/a/index.html',import.meta.url),'utf8');
const manager=html.slice(html.indexOf('/* ---------- report hand-in'),html.indexOf('/* ---------- generic bind helpers'));
const syncRecords=html.slice(html.indexOf('function syncRecords(){'),html.indexOf("if(typeof YBS!=='undefined') YBS.status("));
const failure=code=>Object.assign(Error('synthetic failure'),{code});
const stamp=value=>({toMillis:()=>value});
const snapshot=data=>({exists:!!data,metadata:{fromCache:false},data:()=>data});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.fail('合成 DF 交件等待逾時');}

function reports(t){
  const state={clock:1700000000000,uid:'synthetic-student'},docs=new Map(),writes=[],events=[],hooks={};
  const serverTimestamp=Symbol('synthetic server timestamp'),original=globalThis.firebase;
  globalThis.firebase={firestore:{FieldValue:{serverTimestamp:()=>serverTimestamp}}};
  t.after(()=>{if(original===undefined)delete globalThis.firebase;else globalThis.firebase=original;});
  const db={doc:path=>({path,get:async options=>{
    assert.deepEqual(options,{source:'server'});
    if(path.includes('/roster/')){
      assert.equal(path,'ybsCourses/115-df/roster/cgjh000000@cgjh.hcc.edu.tw');events.push('roster');
      return snapshot({active:true,subject:'synthetic-subject',cls:901,seat:1});
    }
    events.push('receipt');return hooks.receipt?hooks.receipt(docs.get(path)):snapshot(docs.get(path));
  }}),runTransaction:async callback=>{
    events.push('transaction');await hooks.beforeTransaction?.();
    const attempt=async(commit=true)=>{
      const pending=[];
      await callback({get:async ref=>{events.push('tx.get');return snapshot(docs.get(ref.path));},set:(ref,data)=>pending.push({ref,data})});
      if(!commit)return pending;
      for(const {ref,data} of pending){
        assert.match(ref.path,/^ybsCourses\/115-df\/reports\/synthetic-student_s[1-3]$/);
        const report={...data};
        for(const key of ['createdAt','updatedAt'])if(report[key]===serverTimestamp)report[key]=stamp(state.clock);
        docs.set(ref.path,report);writes.push({path:ref.path,data:report});events.push('commit');
      }
    };
    if(hooks.retryBeforeCommit){
      const discarded=await attempt(false);events.push('discard');await hooks.retryBeforeCommit(discarded);
    }
    await attempt();await hooks.afterCommit?.(attempt);
  }};
  const api=createDFReports({course:'115-df',getSession:async()=>({db}),mark:()=>({uid:state.uid}),
    active:m=>{if(m.uid!==state.uid)throw failure('identity-changed');},
    claims:async()=>({firebase:{sign_in_provider:'password'},email:'cgjh000000@ybslab-edu.github.io'}),
    context:async()=>({subject:'synthetic-subject'}),fail:failure,now:()=>state.clock});
  const encoded={schemaVersion:1,encoding:'ascii-json',payload:'{"synthetic":true}',cls:901,seat:1,snapshotAt:state.clock};
  return {api,db,state,docs,writes,events,hooks,encoded,path:'ybsCourses/115-df/reports/synthetic-student_s1'};
}

function failOnce(f,stage){
  const hook=stage==='before-commit'?'beforeTransaction':stage==='after-commit'?'afterCommit':'receipt';
  f.hooks[hook]=data=>{
    delete f.hooks[hook];
    if(stage==='cached-receipt')return {...snapshot(data),metadata:{fromCache:true}};
    if(stage==='pending-timestamp')return snapshot({...data,updatedAt:null});
    throw failure(stage==='after-commit'?'deadline-exceeded':'unavailable');
  };
}

for(const stage of ['before-commit','after-commit','receipt','cached-receipt','pending-timestamp'])test(`DF ${stage} 失敗只由呼叫端重試，同一快照不重寫、不更新收件時間`,async t=>{
  const f=reports(t),original={...f.encoded};failOnce(f,stage);
  await assert.rejects(f.api.submitReport(1,f.encoded),{code:stage==='after-commit'?'deadline-exceeded':'unavailable'});
  await tick();assert.equal(f.events.filter(x=>x==='transaction').length,1);
  assert.equal(f.writes.length,stage==='before-commit'?0:1);
  const committedAt=f.docs.get(f.path)?.updatedAt.toMillis();f.state.clock+=2000;
  const receipt=await f.api.submitReport(1,f.encoded);
  assert.equal(f.writes.length,1);assert.equal(receipt.updatedAt,committedAt??f.state.clock);
  assert.deepEqual(receipt,{courseId:'115-df',uid:'synthetic-student',session:1,cls:901,seat:1,updatedAt:receipt.updatedAt});
  assert.deepEqual(f.encoded,original);assert.equal(f.docs.get(f.path).payload,original.payload);
});

test('DF 交易回呼在已提交後重跑，讀到相同報告便不再寫入',async t=>{
  const f=reports(t);f.hooks.afterCommit=attempt=>attempt();
  await f.api.submitReport(1,f.encoded);
  assert.equal(f.events.filter(x=>x==='tx.get').length,2);assert.equal(f.writes.length,1);
  assert.equal(f.events.filter(x=>x==='receipt').length,1);
});

test('DF 交易首次待寫內容遭丟棄後重跑，只提交第二次回呼的寫入與收件時間',async t=>{
  const f=reports(t);
  f.hooks.retryBeforeCommit=pending=>{
    assert.equal(pending.length,1);assert.equal(pending[0].ref.path,f.path);
    assert.equal(pending[0].data.payload,f.encoded.payload);
    assert.equal(f.writes.length,0);assert.equal(f.docs.has(f.path),false);
    f.state.clock+=2000;
  };
  const receipt=await f.api.submitReport(1,f.encoded);
  assert.deepEqual(f.events,['roster','transaction','tx.get','discard','tx.get','commit','receipt']);
  assert.equal(f.writes.length,1);assert.equal(f.docs.size,1);
  assert.equal(f.docs.get(f.path).createdAt.toMillis(),f.state.clock);
  assert.equal(f.docs.get(f.path).updatedAt.toMillis(),f.state.clock);assert.equal(receipt.updatedAt,f.state.clock);
});

test('DF 逾時後遇到較新報告須明確確認覆寫，仍遵守 60 秒間隔並保留 createdAt',async t=>{
  const f=reports(t);failOnce(f,'after-commit');
  await assert.rejects(f.api.submitReport(1,f.encoded),{code:'deadline-exceeded'});
  const first=f.docs.get(f.path);f.state.clock+=1000;
  const newerAt=f.state.clock;f.docs.set(f.path,{...first,payload:'{"synthetic":"newer"}',updatedAt:stamp(newerAt)});
  const conflict=error=>error.code==='report/conflict'&&error.updatedAt===newerAt;
  await assert.rejects(f.api.submitReport(1,f.encoded),conflict);
  await assert.rejects(f.api.submitReport(1,{...f.encoded,overwriteAt:newerAt-1}),conflict);
  await assert.rejects(f.api.submitReport(1,{...f.encoded,overwriteAt:newerAt}),error=>
    error.code==='report/rate-limited'&&error.retryAt===newerAt+60000);
  assert.equal(f.writes.length,1);assert.equal(f.docs.get(f.path).payload,'{"synthetic":"newer"}');
  f.state.clock+=60000;const receipt=await f.api.submitReport(1,{...f.encoded,overwriteAt:newerAt});
  assert.equal(f.writes.length,2);assert.equal(receipt.updatedAt,f.state.clock);
  assert.equal(f.docs.get(f.path).createdAt.toMillis(),first.createdAt.toMillis());
});

test('DF 回條讀到其他快照時拒絕確認，換人後也不回傳前一人的成功回條',async t=>{
  const f=reports(t);f.hooks.receipt=data=>snapshot({...data,payload:'{"synthetic":"other"}'});
  await assert.rejects(f.api.submitReport(1,f.encoded),{code:'report/conflict',updatedAt:f.state.clock});
  f.hooks.receipt=data=>{f.state.uid='synthetic-other';return snapshot(data);};
  await assert.rejects(f.api.submitReport(1,f.encoded),{code:'identity-changed'});
  assert.equal(f.writes.length,1);
});

async function pageQueue(f,{lostWorkerResponse}={}){
  // 合成伺服器先保存處理結果，再遺失回應；相同 requestId 回放原回條。
  const worker={receipts:new Map(),effects:[],replayed:[]};
  let lost=false;const h=await harness({course:'115-df',fetcher:async(url,init)=>{
    const op=url.split('/').at(-1),body=JSON.parse(init.body),key=op+':'+body.requestId;f.events.push(op);
    let receipt=worker.receipts.get(key);
    if(receipt){assert.deepEqual(body,receipt.body);worker.replayed.push(key);}
    else{
      const value=op==='start'?response(0,{question:{slot:0,type:'df-report-v1',data:{session:body.round+1}}})
        :{sid:'s'.repeat(22),completed:false,awaitingTeacher:true};
      receipt={body,value};worker.receipts.set(key,receipt);worker.effects.push({op,body});
    }
    if(op===lostWorkerResponse&&!lost){lost=true;throw failure('deadline-exceeded');}
    return Response.json(receipt.value);
  }});
  h.state.hints={'115-df':'c901'};h.session.db=f.db;await h.login();
  let latest;h.client.subscribe(state=>{latest=state;});
  const getClaims=h.auth.currentUser.getIdTokenResult;
  h.auth.currentUser.getIdTokenResult=async(...args)=>{const result=await getClaims(...args);return {claims:{...result.claims,email:'cgjh000000@ybslab-edu.github.io'}};};
  const timers=new Map();let serial=0;
  const c=vm.createContext({YBS:{fullrev:true,enabled:()=>true,profile:()=>h.client.state().profile,
    submitReport:h.client.submitReport,submitManual:h.client.submitManual,
    submit:()=>assert.fail('DF 不可自報一般過關')},
    DFReport,sessionStorage:store(),$:()=>null,toast(){},confirm:()=>true,newCid:()=>String(++serial),
    Date:class extends Date {static now(){return f.state.clock;}},
    setTimeout:(fn,ms)=>{const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),addEventListener(){},
    recOn:true,recSent:new Set(),REC_ACT:1,impWho:{cls:'901',seat:'1'},S:{app:'DF-investigation',appVersion:'1.0',version:'A',cls:'901',seat:'1',
      problem:'合成原快照',b2:{},h1:{submittedAt:'2026-11-01T00:00:00Z'},
      concl:{doneAt:'2026-11-01T00:00:00Z'},reveal:{finalAt:'2026-11-01T00:00:00Z'}}
  });
  vm.runInContext(manager+syncRecords,c);
  const value=source=>vm.runInContext(source,c),idle=()=>value('reportFlight===null&&reportPreparing.size===0');
  return {h,c,worker,timers,value,idle,view:()=>latest.view,queue:()=>JSON.parse(c.sessionStorage.getItem('ybslab:reports:115-df')||'[]')};
}

for(const session of [1,2,3])test(`DF 第 ${session} 堂必須先確認報告收件，才送一次待審核請求，沒有本機過關或 XP`,async t=>{
  const f=reports(t),p=await pageQueue(f);
  p.c.syncRecords();assert.equal(f.writes.length,0);assert.equal(p.h.requests.length,0);
  let release;f.hooks.receipt=data=>new Promise(resolve=>{release=()=>resolve(snapshot(data));});
  await p.c.queueReport(session);await until(()=>release);
  assert.equal(p.h.requests.length,0);assert.equal(p.queue()[0].phase,'sending');assert.equal(p.value('reportViews.size'),0);
  release();await until(p.idle);
  assert.deepEqual(f.events,['roster','transaction','tx.get','commit','receipt','start','answer']);
  assert.deepEqual(p.h.requests.map(r=>[r.body.course,r.body.activity,r.body.round]),Array.from({length:2},()=>['115-df',1,session-1]));
  assert.deepEqual(p.h.requests[1].body.answer,{session});assert.equal(f.writes[0].path,`ybsCourses/115-df/reports/synthetic-student_s${session}`);
  assert.deepEqual(p.queue(),[]);assert.equal(p.value(`reportViews.get(${session}).completed`),undefined);
  assert.equal(p.h.client.state().status,'teacher-pending');assert.equal(p.view().completed,false);assert.equal(p.view().awaitingTeacher,true);
  assert.equal(p.h.client.state().snapshot,null);assert.equal(p.h.client.state().pending,false);
  assert.deepEqual(JSON.parse([...p.h.storage.map.values()][0]).drafts,{});
});

for(const stage of ['after-commit','receipt'])test(`DF 佇列 ${stage} 逾時後保留原快照；重試僅確認既有寫入後才送待審核`,async t=>{
  const f=reports(t),p=await pageQueue(f);failOnce(f,stage);
  await p.c.queueReport(1);await until(()=>p.idle()&&p.queue()[0]?.phase==='waiting');
  const first=f.docs.get(f.path);assert.equal(f.writes.length,1);assert.equal(p.h.requests.length,0);
  assert.equal(p.value('reportViews.size'),0);assert.equal(p.queue()[0].retries,1);
  assert.equal(p.queue()[0].encoded.payload,first.payload);
  p.c.S.problem='合成後續修改';assert.deepEqual([...p.timers.values()].map(x=>x.ms),[2000]);
  const [timerId,timer]=[...p.timers][0];p.timers.delete(timerId);f.state.clock+=timer.ms;
  await timer.fn();await until(p.idle);
  assert.equal(f.writes.length,1);assert.equal(f.docs.get(f.path).payload,first.payload);
  assert.equal(p.value('reportViews.get(1).updatedAt'),first.updatedAt.toMillis());
  assert.deepEqual(p.h.requests.map(r=>r.url.split('/').at(-1)),['start','answer']);
  assert.deepEqual(p.queue(),[]);assert.equal(p.h.client.state().status,'teacher-pending');
});

for(const op of ['start','answer'])test(`DF Worker ${op} 已處理但回應遺失，重送原請求只回放一次副作用的回條`,async t=>{
  const f=reports(t),p=await pageQueue(f,{lostWorkerResponse:op});
  await p.c.queueReport(1);await until(p.idle);
  const original=p.h.requests.at(-1).body,receiptAt=p.value('reportViews.get(1).updatedAt');
  assert.equal(p.h.client.state().pending,true);assert.deepEqual(p.queue(),[]);
  const key=op+':'+original.requestId,committed=p.worker.receipts.get(key);
  assert.deepEqual(committed.body,original);assert.equal(p.worker.effects.filter(x=>x.op===op).length,1);
  assert.deepEqual(p.worker.replayed,[]);
  p.h.advance();f.state.clock+=60001;await p.c.queueReport(1);await until(p.idle);
  const repeated=p.h.requests.filter(r=>r.url.endsWith('/'+op));
  assert.equal(repeated.length,2);assert.deepEqual(repeated[1].body,original);
  assert.deepEqual(p.h.requests.map(r=>r.url.split('/').at(-1)),op==='start'?['start','start','answer']:['start','answer','answer']);
  assert.equal(p.worker.receipts.get(key),committed);assert.deepEqual(p.worker.replayed,[key]);
  assert.deepEqual(p.worker.effects.map(x=>x.op),['start','answer']);assert.equal(p.worker.receipts.size,2);
  assert.equal(f.writes.length,1);assert.equal(p.value('reportViews.get(1).updatedAt'),receiptAt);
  assert.equal(p.h.client.state().pending,false);assert.equal(p.h.client.state().snapshot,null);
  assert.equal(p.h.client.state().status,'teacher-pending');
});
