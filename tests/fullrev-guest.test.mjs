import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {harness,response,config,controls} from './fixtures/fullrev.mjs';
import {guestScope,GUEST_PENDING} from '../assets/fullrev-guest.mjs';

const seat={cls:'901',seat:31};
const context=(body,extra={})=>({schemaVersion:1,sourceProject:config.firebase.projectId,...body,
  configVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:controls,...extra});
const completed={completed:true,status:'pending',verified:false,counted:false,attemptId:'synthetic-student_5_0_'+'x'.repeat(43),sid:'s'.repeat(22)};
const noStore=value=>Response.json(value,{headers:{'cache-control':'no-store'}});
async function guest(options={}) {
  const h=await harness({noModel:true,...options});h.state.hints={};
  h.state.fetcher=(url,init)=>url.endsWith('/guest/context')?noStore(context(JSON.parse(init.body))):noStore(response());
  await h.client.login('guest',seat);return h;
}

test('班座先驗證再匿名登入，分片與 Worker 名冊一致；不接受姓名、額外路徑',async()=>{
  assert.deepEqual(guestScope({cls:' 901 ',seat:'01'}),{cls:'901',seat:1,classKey:'c901_1'});
  assert.equal(guestScope({cls:901,seat:30}).classKey,'c901_1');assert.equal(guestScope(seat).classKey,'c901_2');
  const h=await harness();
  for(const value of [undefined,{cls:'9',seat:1},{cls:'901',seat:0},{cls:'901',seat:61},{cls:'901',seat:'1e1'},{cls:'../x',seat:1}])
    await assert.rejects(h.client.login('guest',value),{code:'guest-seat-required'});
  assert.equal(h.auth.currentUser,null);assert.equal(h.requests.length,0);
  const df=await harness({course:'115-df'});await assert.rejects(df.client.login('guest',seat),{code:'grading-not-supported'});
});

test('班座匿名登入不需 claims 或正式投影；context/start/answer/resume 只送 guest 路徑',async()=>{
  const h=await guest();await h.client.start(5,0);
  assert.deepEqual(h.requests.map(r=>new URL(r.url).pathname),['/guest/context','/guest/start']);
  assert.equal(h.requests[1].body.bindingVersion,undefined);
  assert.deepEqual(Object.keys(h.requests[0].body).sort(),['activity','classKey','cls','course','round','seat'].sort());
  await h.client.resume(5,0);await h.client.answer(5,0,7);
  assert.deepEqual(h.requests.slice(2).map(r=>new URL(r.url).pathname),['/guest/resume','/guest/answer']);
  for(const request of h.requests){assert.equal(request.body.cls,'901');assert.equal(request.body.seat,31);assert.equal(request.body.classKey,'c901_2');assert.equal(request.credentials,'omit');assert.equal(request.cache,'no-store');}
  assert.deepEqual(h.reads,[]);
});

test('guest 完成只顯示待審，不加入正式成績或 XP；回條不得冒充正式通過',async()=>{
  const h=await guest();await h.client.start(5,0);h.state.fetcher=()=>noStore(completed);
  const v=await h.client.answer(5,0,7);assert.equal(v.counted,false);assert.equal(h.client.state().status,'guest-pending');
  assert.equal(h.client.state().snapshot,null);assert.equal(h.client.state().pending,false);
  await assert.rejects(h.client.progress(),{code:'guest-pending'});
  assert.equal(GUEST_PENDING,'已存待審，尚未採計');
  const k=await guest();await k.client.start(5,0);k.state.fetcher=()=>noStore({...completed,counted:true});
  await assert.rejects(k.client.answer(5,0,7),{code:'pending'});assert.equal(k.client.state().pending,true);
});

test('重新整理保留班座與同一 sid；草稿不保存題面、token、正式 subject',async()=>{
  const h=await guest();await h.client.start(5,0);
  const saved=[...h.storage.map.values()].join('');assert.doesNotMatch(saved,/synthetic-token|"question"|"subject"|"answer"/);
  const restored=h.reopen();const profile=await restored.restore();assert.deepEqual(profile.guest,guestScope(seat));
  await restored.start(5,0);assert.ok(h.requests.at(-1).url.endsWith('/guest/resume'));assert.equal(h.requests.at(-1).body.sid,'s'.repeat(22));
});

test('遺失 guest answer 回應後重整，以相同 requestId 重送並保留 pending 狀態',async()=>{
  const h=await guest();await h.client.start(5,0);let lost=true;
  h.state.fetcher=()=>{if(lost)throw Error('synthetic-offline');return noStore(completed);};
  await assert.rejects(h.client.answer(5,0,7),{code:'pending'});const first=h.requests.at(-1).body;
  const restored=h.reopen();await restored.restore();h.advance();lost=false;await restored.retry();
  assert.deepEqual(h.requests.at(-1).body,first);assert.ok(h.requests.at(-1).url.endsWith('/guest/answer'));
  assert.equal(restored.state().status,'guest-pending');
});

for(const [label,extra] of [['錯專案',{sourceProject:'other-project'}],['錯班座',{seat:1}],['缺控制版本',{controlVersions:null}]])
  test(`guest context ${label}不得啟動作答`,async()=>{
    const h=await guest();h.state.fetcher=(_url,init)=>noStore(context(JSON.parse(init.body),extra));
    await assert.rejects(h.client.start(5,0),{code:'context-unconfirmed'});assert.equal(h.requests.length,1);
  });

test('guest token 到期僅強制刷新一次；活動關閉不建立草稿',async()=>{
  const h=await guest();let tries=0;
  h.state.fetcher=(_url,init)=>++tries===1?Response.json({error:'unauthenticated'},{status:401}):noStore(context(JSON.parse(init.body)));
  await h.client.context(5,0);assert.equal(tries,2);assert.equal(h.state.force.at(-1),true);
  h.state.fetcher=()=>Response.json({error:'not_open'},{status:403});
  await assert.rejects(h.client.start(5,0),{code:'not-open'});assert.equal(h.client.state().pending,false);
});

test('換人清除訪客草稿，慢回應不得帶回上一人的待審畫面',async()=>{
  const h=await guest();await h.client.start(5,0);let release;
  h.state.fetcher=()=>new Promise(resolve=>{release=()=>resolve(noStore(completed));});
  const work=h.client.answer(5,0,7);await new Promise(resolve=>setTimeout(resolve,0));
  await h.client.logout();release();await assert.rejects(work,{code:'identity-changed'});
  assert.equal(h.client.state().profile,null);assert.equal(h.storage.map.size,0);
});

test('兩種登入入口移除老師核發訪客文案；Google 學生仍須明確開啟',async()=>{
  for(const file of ['fullrev-shell.mjs','fullrev-ui.mjs']){
    const source=await readFile(new URL('../assets/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/老師核發訪客/);assert.match(source,/mountGuestLogin/);assert.match(source,/studentGoogleLogin===true/);
  }
});

for(const phase of ['fetch','json'])test(`guest context ${phase} 停住沿用請求期限，取消後可重試`,async()=>{
  const h=await guest({requestTimeoutMs:10});let signal;
  h.state.fetcher=async(_url,init)=>{signal=init.signal;return phase==='fetch'?new Promise(()=>{}):{json:()=>new Promise(()=>{})};};
  await assert.rejects(h.client.start(5,0),{code:'request-timeout'});
  assert.equal(signal.aborted,true);assert.equal(h.client.state().pending,false);
  h.state.fetcher=(url,init)=>url.endsWith('/guest/context')?noStore(context(JSON.parse(init.body))):noStore(response());
  const value=await h.client.start(5,0);assert.equal(value.activity,5);
});

test('capacity_deferred 顯示訪客開始次數限制，不誤判儲存額度且不自動重送',async()=>{
  const h=await guest();const original=h.state.fetcher;
  h.state.fetcher=(url,init)=>url.endsWith('/guest/context')?original(url,init):Response.json({error:'capacity_deferred'},{status:429});
  await assert.rejects(h.client.start(5,0),{code:'capacity-deferred'});
  assert.equal(h.client.state().pending,false);assert.equal(h.client.state().uploadIssue,null);assert.equal(h.timers.length,0);
});
