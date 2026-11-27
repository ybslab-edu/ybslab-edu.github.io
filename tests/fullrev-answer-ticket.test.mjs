import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {harness,response,config} from './fixtures/fullrev.mjs';
const ticket=n=>'ybs-answer-v1.synthetic-encrypted-fixture-'+n;
const view=(slot=0,extra={})=>response(slot,{ticketVersion:1,ticket:ticket(slot),...extra});
const works=h=>[...h.shared.map].filter(([k])=>k.startsWith('ybs:fullrev:work:'));

test('旗標預設走 P2；啟用後既有 session 仍以舊協定完成',async()=>{
 for(const enabled of [false,true]){
  const h=await harness({answerTickets:enabled});await h.login();await h.client.start(5,0);
  assert.ok(h.requests.at(-1).url.endsWith(enabled?'/ticket/start':'/start'));
  await h.client.answer(5,0,7);assert.equal(h.requests.at(-1).url,config.workerOrigin+'/answer');
  assert.equal(h.requests.at(-1).body.ticket,undefined);
 }
});

test('票與未送出輸入跨重整、關頁續作；原票／requestId 重送後才換票',async()=>{
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(view())});await h.login();await h.client.start(5,0);
 assert.equal(h.client.saveInput(5,0,['合成未完成']),true);
 assert.ok(works(h)[0][1].includes(ticket(0)));
 assert.doesNotMatch(works(h)[0][1],/synthetic-token|"questions"|"expected"|"answerProtocol"/);
 h.closePage();h.storage.map.clear();let client=h.reopen();await client.restore();await client.start(5,0);
 assert.equal(h.requests.at(-1).url,config.workerOrigin+'/ticket/resume');
 assert.equal(h.requests.at(-1).body.ticket,ticket(0));assert.deepEqual(client.loadInput(5,0),['合成未完成']);
 h.state.fetcher=async()=>{throw Error('synthetic-offline');};
 await assert.rejects(client.answer(5,0,7),{code:'pending'});const original=h.requests.at(-1).body;
 h.closePage();h.storage.map.clear();client=h.reopen();await client.restore();h.advance();
 h.state.fetcher=async()=>Response.json(view(1,{correct:true}));await client.start(5,0);
 assert.deepEqual(h.requests.at(-1).body,original);assert.equal(client.loadInput(5,0),undefined);
 await client.answer(5,0,8);assert.equal(h.requests.at(-1).body.ticket,ticket(1));assert.deepEqual(h.reads,[]);
 await client.logout();assert.equal(works(h).length,0);
});

for(const code of ['ticket_expired','ticket_invalid','ticket_not_owned','ticket_out_of_order','ticket_attempt_limit','ticket_stale','ticket_replayed','tickets_disabled','ticket_secret_required'])
 test(`${code} 停止重送、清楚回傳原因，可重新開始`,async()=>{
  const h=await harness({answerTickets:true,fetcher:async()=>Response.json(view())});await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>Response.json({error:code},{status:code==='ticket_secret_required'?503:409});
  await assert.rejects(h.client.answer(5,0,7),{code:code.replaceAll('_','-')});
  assert.equal(h.client.state().pending,false);assert.equal(works(h).length,0);const requests=h.requests.length;
  await h.client.retry();assert.equal(h.requests.length,requests);
  h.state.fetcher=async()=>Response.json(view());await h.client.start(5,0,{restart:true});
  assert.equal(h.requests.at(-1).url,config.workerOrigin+'/ticket/start');
 });

test('新票回應損毀不覆蓋待送原票；關閉旗標後重開走 P2 且不重送舊票',async()=>{
 const h=await harness({answerTickets:true,fetcher:async()=>Response.json(view())});await h.login();await h.client.start(5,0);
 h.state.fetcher=async()=>Response.json(response(1,{correct:true}));
 await assert.rejects(h.client.answer(5,0,7),{code:'pending'});const original=h.requests.at(-1).body;
 h.advance();h.state.fetcher=async()=>Response.json(view(1,{correct:true}));await h.client.retry();
 assert.deepEqual(h.requests.at(-1).body,original);
 const client=h.reopen({config:{...config,answerTickets:false}});await client.restore();
 assert.equal(works(h).length,0);h.state.fetcher=async()=>Response.json(response());await client.start(5,0);
 assert.equal(h.requests.at(-1).url,config.workerOrigin+'/start');assert.equal(h.requests.at(-1).body.ticket,undefined);
});

test('真實 Worker：中途斷線重送及續作零讀寫，最後回應遺失重送不重複計分',{skip:!process.env.YBS_WORKER_SOURCE},async()=>{
 const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
 const [{ticketHarness},{solve,paths},{ORIGIN}]=await Promise.all([load('tests/ticket-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
 const worker=await ticketHarness(),h=await harness({answerTickets:true});h.state.uid='fake-uid-a';h.state.hints={'115-g9':'synthetic-class'};
 let lose=false;
 h.state.fetcher=async(url,init)=>{
  const r=await worker.instance.fetch(new Request(url,{...init,headers:{origin:ORIGIN,authorization:'Bearer fake-uid-a','content-type':'application/json'}}));
  if(lose&&r.ok){lose=false;throw Error('synthetic-response-lost');}return r;
 };
 await h.login();let v=await h.client.start(5,1),b={...worker.db.metrics};
 lose=true;await assert.rejects(h.client.answer(5,1,solve(v)),{code:'pending'});
 const original=h.requests.at(-1).body;h.advance();[v]=await h.client.retry();assert.deepEqual(h.requests.at(-1).body,original);
 const client=h.reopen();await client.restore();v=await client.start(5,1);
 assert.equal(worker.db.metrics.reads,b.reads);assert.equal(worker.db.metrics.writes,b.writes);
 lose=true;await assert.rejects(client.answer(5,1,solve(v)),{code:'pending'});
 assert.equal(worker.results().length,1);const resultBefore=structuredClone(worker.results()[0]);
 h.advance();[v]=await client.retry();assert.equal(v.completed,true);assert.ok(v.progressDelta);
 assert.deepEqual(worker.results(),[resultBefore]);assert.equal(works(h).length,0);
 assert.equal(Object.keys(worker.db.docs.get(paths.head('synthetic-a')).completions).length,1);
});
