import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,response,config} from './fixtures/fullrev.mjs';
import {WORK_TTL} from '../assets/fullrev-work-store.mjs';
const localWorks=h=>[...h.shared.map].filter(([k])=>k.startsWith('ybs:fullrev:work:'));
const resetSession=h=>{h.storage.map.clear();return h.reopen();};
test('未送出原文跨重整、sessionStorage 遺失及重新登入還原；只走既有 resume，無新增 Firestore 讀取',async()=>{
 const h=await harness();await h.login();await h.client.start(5,2);
 assert.equal(h.client.saveInput(5,2,['０１','未填完的合成文字','']),true);
 const [[key,saved]]=localWorks(h);assert.equal(key,`ybs:fullrev:work:${config.firebase.projectId}:115-g9:5:2:synthetic-student`);
 assert.doesNotMatch(saved,/synthetic-token|question|請輸入數值|correct|expected|resultId/);
 h.state.fetcher=async()=>Response.json(response(0,{question:{data:{value:7},instruction:'請輸入數值',title:'合成',type:'synthetic',slot:0}}));
 let client=h.reopen();await client.restore();assert.equal(client.savedRound(5),2);await client.start(5,2);
 assert.deepEqual(client.loadInput(5,2),['０１','未填完的合成文字','']);assert.equal(h.requests.at(-1).url,config.workerOrigin+'/resume');assert.deepEqual(h.reads,[]);
 client=resetSession(h);await client.restore();await client.start(5,2);assert.deepEqual(client.loadInput(5,2),['０１','未填完的合成文字','']);
 // Browser SESSION auth may require sign-in after closing; same UID may recover local work.
 h.closePage();h.storage.map.clear();h.auth.currentUser=null;client=h.reopen();await client.login('password','9990001','synthetic-password');await client.start(5,2);
 assert.deepEqual(client.loadInput(5,2),['０１','未填完的合成文字','']);
});
test('登出／不是我、Auth 換人及跨分頁換人清除該生所有關卡草稿',async()=>{
 for(const action of ['logout','auth','tab','login']){
  const h=await harness();await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成草稿']);
  if(action==='logout')await h.client.logout();
  if(action==='auth')h.changed({uid:'synthetic-next'});
  if(action==='tab'){h.shared.setItem(`ybs:fullrev:${config.firebase.projectId}:115-g9:identity`,'synthetic-other-tab');h.events.get('storage')({key:`ybs:fullrev:${config.firebase.projectId}:115-g9:identity`});}
  if(action==='login'){h.state.uid='synthetic-next';await h.login();await h.client.start(5,0);assert.equal(h.client.loadInput(5,0),undefined);}
  assert.ok(localWorks(h).every(([,v])=>!v.includes('合成草稿')));
 }
});
test('重置、過期、換組、題面變動均丟棄草稿，舊答案不補送',async()=>{
 for(const variant of ['reset','expired','slot','sid','question','ttl']){
  const h=await harness();await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成舊草稿']);
  if(variant==='ttl')h.advance(WORK_TTL+1);
  const client=h.reopen();await client.restore();
  h.state.fetcher=async()=>variant==='reset'||variant==='expired'?new Response('{}',{status:variant==='reset'?409:410}):Response.json(variant==='slot'?response(1):variant==='sid'?response(0,{sid:'n'.repeat(22)}):variant==='question'?response(0,{question:{slot:0,type:'synthetic',data:{value:8}}}):response());
  if(variant==='reset'||variant==='expired')await assert.rejects(client.start(5,0),{code:'restart-required'});else await client.start(5,0);
  assert.equal(client.loadInput(5,0),undefined,variant);assert.ok(localWorks(h).every(([,v])=>!v.includes('合成舊草稿')));assert.ok(h.requests.every(r=>!r.url.endsWith('/answer')));
 }
});
test('pending 不另存未送出草稿；跨重開沿用原 requestId 重送，不另建 answer',async()=>{
 const h=await harness();await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['合成作答']);
 h.state.fetcher=async()=>{throw Error('synthetic-offline');};await assert.rejects(h.client.answer(5,0,7),{code:'pending'});const body=h.requests.at(-1).body;
 assert.equal(h.client.loadInput(5,0),undefined);assert.equal(h.client.saveInput(5,0,['另填']),false);
 const client=resetSession(h);await client.restore();h.advance();h.state.fetcher=async()=>Response.json(response(1,{correct:true}));await client.start(5,0);
 assert.deepEqual(h.requests.at(-1).body,body);assert.equal(client.loadInput(5,0),undefined);
});
test('切關放棄舊草稿；本機儲存不可用仍可作答',async()=>{
 const h=await harness();await h.login();await h.client.start(5,0);h.client.saveInput(5,0,['舊關']);await h.client.start(5,1);
 assert.equal(h.client.loadInput(5,0),undefined);assert.equal(localWorks(h).length,1);
 h.shared.setItem=()=>{throw Error('synthetic-quota');};assert.equal(h.client.saveInput(5,1,['新關']),false);
 await h.client.answer(5,1,7);assert.equal(h.client.state().pending,false);
});
