import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
import {config} from './fixtures/fullrev.mjs';
function setup(fetcher,wait){
 let user={getIdToken:async()=> 'synthetic'},clock=Date.parse('2026-11-22T00:00:00Z');const waits=[],events=[];
 const auth={get currentUser(){return user;}},session=async()=>({app:{options:{projectId:config.firebase.projectId}},auth});
 const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher,now:()=>clock,
  wait:async ms=>{waits.push(ms);clock+=ms;await wait?.();}});
 model.subscribeRetry(v=>events.push(v));
 return {model,waits,events,change:()=>{user=null;}};
}
const input={course:'115-g9',classKey:'c901',activity:7,round:0};
test('讀取遇 storage_quota 立即保留具體原因，不當成一般 503 自動重試',async()=>{
 let calls=0;const h=setup(async()=>{calls++;return Response.json({error:'storage_quota'},{status:503});});
 await assert.rejects(h.model.context(input),{code:'storage-quota'});assert.equal(calls,1);assert.deepEqual(h.waits,[]);
});
test('讀取無回應會逾時並中止請求，可交回重新讀取',async()=>{
 let signal;const model=createReadModel({session:async()=>({app:{options:{projectId:config.firebase.projectId}},auth:{currentUser:{getIdToken:async()=> 'synthetic'}}}),
  project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,requestTimeoutMs:10,
  fetcher:async(_url,init)=>{signal=init.signal;return new Promise(()=>{});}});
 await assert.rejects(model.context(input),{code:'read-model-pending'});assert.equal(signal.aborted,true);
});
for(const status of [200,429,503])test(`讀取 ${status} 標頭後本文停住仍逾時，清理後可重新讀取`,{timeout:2000},async()=>{
 let signal,body,stalled=true,calls=0;
 const model=createReadModel({session:async()=>({app:{options:{projectId:config.firebase.projectId}},auth:{currentUser:{getIdToken:async()=> 'synthetic'}}}),
  project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,requestTimeoutMs:10,
  fetcher:async(_url,init)=>{
   calls++;signal=init.signal;
   return stalled?new Response(new ReadableStream({start(controller){body=controller;controller.enqueue(new TextEncoder().encode('{'));}}),{status}):Response.json({synthetic:true});
  }});
 await assert.rejects(model.context(input),{code:'read-model-pending'});assert.equal(signal.aborted,true);assert.equal(calls,1);
 body.enqueue(new TextEncoder().encode('"synthetic":true}'));body.close();stalled=false;
 assert.deepEqual(await model.context(input),{synthetic:true});assert.equal(calls,2);
});
test('context、controls、progress 依 Retry-After 秒數／HTTP 日期重送相同讀取，成功清除等待',async()=>{
 for(const operation of ['context','controls','page']){
  const calls=[];let n=0;const h=setup(async(url,init)=>{
   calls.push({url:String(url),init});n++;
   return n===1?Response.json({error:'rate_limited'},{status:429,headers:{'retry-after':'3'}}):n===2?Response.json({error:'temporarily_unavailable'},{status:503,headers:{'retry-after':'Sun, 22 Nov 2026 00:00:08 GMT'}}):Response.json({synthetic:true});
  });
  assert.deepEqual(await h.model[operation](input),{synthetic:true});assert.deepEqual(h.waits,[3000,5000]);
  assert.equal(calls.length,3);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[1],calls[2]);assert.equal(h.events.at(-1),null);
 }
});
test('連續 429／503 有界停止，超過總等待上限不提早重試',async()=>{
 for(const status of [429,503]){
  let calls=0;const h=setup(async()=>{calls++;return Response.json({error:'storage_busy'},{status,headers:{'retry-after':'60'}});});
  await assert.rejects(h.model.context(input),{code:status===429?'retry-later':'read-model-pending'});assert.equal(calls,4);assert.deepEqual(h.waits,[60000,60000,60000]);assert.equal(h.events.at(-1),null);
 }
 let calls=0;const h=setup(async()=>{calls++;return Response.json({error:'rate_limited'},{status:429,headers:{'retry-after':'181'}});});
 await assert.rejects(h.model.context(input),{code:'retry-later'});assert.equal(calls,1);assert.deepEqual(h.waits,[]);
});
test('未知 429 視為 quota，五分鐘內不再送出；cancel 立即取消在途讀取與等待',async()=>{
 let calls=0;const quota=setup(async()=>{calls++;return Response.json({error:'synthetic_unknown'},{status:429});});
 await assert.rejects(quota.model.context(input),{code:'storage-quota'});
 await assert.rejects(quota.model.context(input),{code:'storage-quota'});assert.equal(calls,1);assert.deepEqual(quota.waits,[]);
 let signal,started;const h=setup(async(_url,init)=>{signal=init.signal;started=true;return new Promise(()=>{});});
 const pending=h.model.context(input);while(!started)await new Promise(r=>setImmediate(r));h.model.cancel();
 await assert.rejects(pending,{code:'identity-changed'});assert.equal(signal.aborted,true);
});
test('等待時換人即停止，不用舊憑證送下一次讀取；not_open 保留為遮罩狀態',async()=>{
 let calls=0;const h=setup(async()=>{calls++;return Response.json({error:'rate_limited'},{status:429,headers:{'retry-after':'3'}});},()=>h.change());
 await assert.rejects(h.model.context(input),{code:'identity-changed'});assert.equal(calls,1);assert.equal(h.events.at(-1),null);
 const closed=setup(async()=>Response.json({error:'not_open'},{status:403}));await assert.rejects(closed.model.context(input),{code:'not-open'});assert.deepEqual(closed.waits,[]);
});
