import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,activities,snapshot,controls,config} from './fixtures/fullrev.mjs';
import {teacherSnapshots} from '../assets/fullrev-ui.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('老師取消發生在權限確認期間，不發出後續 controls／progress',async()=>{
 const h=await harness();await h.client.login('owner');
 const claim=deferred(),started=deferred();let calls=0;
 h.auth.currentUser.getIdTokenResult=()=>{started.resolve();return claim.promise;};
 h.model.controls=async()=>{calls++;return controls;};
 const controller=new AbortController(),pending=h.client.progress({teacher:true,classKey:'c901',activities,signal:controller.signal});
 const rejected=assert.rejects(pending,{code:'read-superseded'});
 await started.promise;controller.abort();claim.resolve({claims:{firebase:{sign_in_provider:'google.com'},email_verified:true}});
 await rejected;assert.equal(calls,0);assert.equal(h.client.state().snapshot,null);
});

test('取消 controls 的訊號傳至 adapter；晚到回應不繼續分頁或發布快照',async()=>{
 const h=await harness();await h.client.login('owner');
 const started=deferred(),late=deferred();let signal,pages=0;
 h.model.controls=async input=>{signal=input.signal;started.resolve();return late.promise;};
 h.model.page=async()=>{pages++;return snapshot();};
 const controller=new AbortController(),pending=h.client.progress({teacher:true,classKey:'c901',activities,signal:controller.signal});
 const rejected=assert.rejects(pending,{code:'read-superseded'});
 await started.promise;controller.abort();assert.equal(signal.aborted,true);late.resolve(controls);
 await rejected;assert.equal(pages,0);assert.equal(h.client.state().snapshot,null);
});

test('切班後舊分頁即使晚到也不覆蓋新班 snapshot；同班取消後可立刻重查',async()=>{
 const h=await harness();await h.client.login('owner');
 const started=deferred(),late=deferred();let calls=0;
 h.model.page=async input=>{if(++calls===1){started.resolve();return late.promise;}return snapshot([],{classKey:input.classKey,people:[]});};
 const oldController=new AbortController(),old=h.client.progress({teacher:true,classKey:'c901',activities,signal:oldController.signal});
 const rejected=assert.rejects(old,{code:'read-superseded'});
 await started.promise;oldController.abort();
 const fresh=await h.client.progress({teacher:true,classKey:'c902',activities,signal:new AbortController().signal});
 late.resolve(snapshot());await rejected;
 assert.equal(fresh.classKey,'c902');assert.equal(h.client.state().snapshot.classKey,'c902');
 const next=await h.client.progress({teacher:true,classKey:'c901',activities,signal:new AbortController().signal});
 assert.equal(next.classKey,'c901');assert.equal(calls,3);
});

test('分組 fallback 共用取消訊號，取消後不查下一組、不回傳半班',async()=>{
 for(const stopAt of ['c901','c901_1']){
  const controller=new AbortController(),keys=[];
  const client={course:'115-g9',progress:async input=>{
   keys.push(input.classKey);assert.equal(input.signal,controller.signal);
   if(input.classKey===stopAt)controller.abort();
   if(input.classKey==='c901')throw Object.assign(Error('missing'),{code:'class-not-found'});
   return snapshot();
  }};
  await assert.rejects(teacherSnapshots(client,'c901',activities,{signal:controller.signal}),{code:'read-superseded'});
  assert.deepEqual(keys,stopAt==='c901'?['c901']:['c901','c901_1']);
 }
});

test('真實 adapter 等待時取消，立即清除通知、不重送，且同班可重新讀取',async()=>{
 const h=await harness();await h.client.login('owner');
 const waiting=deferred();let busy=true,calls=0,release;
 const model=createReadModel({session:async()=>h.session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,
  wait:()=>new Promise(resolve=>{release=resolve;waiting.resolve();}),fetcher:async url=>{
   calls++;return busy?Response.json({error:'storage_busy'},{status:503,headers:{'retry-after':'60'}}):Response.json(new URL(url).pathname==='/controls'?controls:snapshot());
  }});
 const client=h.reopen({readModel:model});await client.restore();
 const controller=new AbortController(),pending=client.progress({teacher:true,classKey:'c901',activities,signal:controller.signal});
 const rejected=assert.rejects(pending,{code:'identity-changed'});
 await waiting.promise;assert.equal(client.state().readingRetry.attempt,1);controller.abort();await rejected;
 assert.equal(client.state().readingRetry,null);assert.equal(client.state().snapshot,null);
 busy=false;await client.progress({teacher:true,classKey:'c901',activities,signal:new AbortController().signal});
 assert.equal(client.state().snapshot.classKey,'c901');assert.equal(calls,4);
 release();await turn();assert.equal(calls,4);
});

test('同班在舊請求尚未結束前重查，使用新訊號且不沿用已取消的 Promise',async()=>{
 const h=await harness();await h.client.login('owner');
 const started=deferred(),late=deferred();let pages=0;
 h.model.page=async()=>{if(++pages===1){started.resolve();return late.promise;}return snapshot([],{people:[]});};
 const controller=new AbortController(),old=h.client.progress({teacher:true,classKey:'c901',activities,signal:controller.signal});
 const rejected=assert.rejects(old,{code:'read-superseded'});await started.promise;controller.abort();
 const fresh=await h.client.progress({teacher:true,classKey:'c901',activities,signal:new AbortController().signal});
 assert.equal(fresh.people.length,0);assert.equal(pages,2);
 late.resolve(snapshot());await rejected;assert.deepEqual(h.client.state().snapshot.people,[]);
});
