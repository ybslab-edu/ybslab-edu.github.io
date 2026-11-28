import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,activities,record as fixtureRecord,snapshot,response,config} from './fixtures/fullrev.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
import {effectiveRecords} from '../assets/fullrev-progress.mjs';
import {mountHistory} from '../assets/fullrev-ui.mjs';
import {Element} from './fixtures/activity-dom.mjs';
const epoch='e'.repeat(43),version='v'.repeat(43),legacyVersion='l'.repeat(43);
const record=(round=0,extra={})=>fixtureRecord(round,{resultId:'c_'+String(round).padStart(43,'r'),...extra});
const startContext={bindingVersion:1,unitEpochs:{2:0},roundEpochs:{'5:0':0,'5:1':0,'5:2':0},classUnitEpochs:{2:0},configVersions:{5:1}};
const page=(records=[],extra={})=>snapshot(records,{progressVersion:2,epoch,resultVersion:version,
 resultVersions:Object.fromEntries(records.map(r=>[`a${r.activity}_r${r.round}`,r.resultId])),replace:true,removed:[],
 legacy:{version:legacyVersion,records:[],states:[]},startContext,...extra});
async function setup(value=page()){
 const h=await harness(),calls=[];h.model.controls=async()=>{throw Error('cold controls read forbidden');};
 h.model.context=async()=>{throw Error('per-round context read forbidden');};
 h.model.page=async body=>{calls.push(body);return typeof value==='function'?value(body):value;};
 await h.login();return {...h,calls,set:v=>{value=v;},read:()=>h.client.progress({activities})};
}

test('merged cold read carries null controls and startContext avoids context for every round',async()=>{
 const h=await setup();await h.read();assert.equal(h.calls.length,1);
 assert.deepEqual([h.calls[0].controlVersions,h.calls[0].since,h.calls[0].legacyVersion,h.calls[0].cursor],[null,null,null,null]);
 await h.client.start(5,0);await h.client.start(5,1);
 assert.equal(h.requests.length,2);assert.equal(h.calls.length,1);
 assert.equal(h.requests[1].body.roundEpoch,0);assert.equal(h.requests[1].body.bindingVersion,1);
});

test('stale startContext makes exactly one merged refresh then succeeds; repeated invalidation stops',async()=>{
 const h=await setup();await h.read();let starts=0;
 h.state.fetcher=async()=>++starts===1?Response.json({error:'binding_version_mismatch'},{status:409}):Response.json(response());
 h.set(page([],{startContext:{...startContext,bindingVersion:2}}));
 await h.client.start(5,1);assert.equal(starts,2);assert.equal(h.calls.length,2);assert.equal(h.requests[1].body.bindingVersion,2);
 h.state.fetcher=async()=>Response.json({error:'binding_version_mismatch'},{status:409});
 await assert.rejects(h.client.start(5,2),{code:'restart-required'});
 assert.equal(h.calls.length,3);assert.equal(h.requests.length,4);
});

test('all 121 formal rounds confirm in one page and persist originals before emitting since',async()=>{
 const h=await setup(),catalog=[],records=[];
 for(let activity=1;activity<=30;activity++){
  const count=activity===30?5:4;catalog.push({course:'115-g9',week:activity,unit:2,rounds:Array(count).fill('合成')});
  for(let round=0;round<count;round++)records.push(record(round,{activity,resultId:'c_'+`${activity}-${round}`.padEnd(43,'x')}));
 }
 h.set(page(records));const d=await h.client.progress({activities:catalog});assert.equal(d.records.length,121);assert.equal(h.calls.length,1);
 h.set(page([],{replace:false,resultVersions:d.resultVersions,legacy:{version:legacyVersion,records:null,states:[]}}));
 await h.client.progress({activities:catalog});assert.equal(Object.keys(h.calls[1].since.results).length,121);
});

const guest=(round=0,extra={})=>({source:'worker-guest-approved',subject:'synthetic-subject',activity:5,round,
 approvalId:'guest_'+String(round).padEnd(43,'g'),completedAt:'2026-11-01T12:00:00.000Z',validity:{state:'effective',controlVersions:{gateVersion:1,classGateVersion:1}},...extra});
test('approved guests are complete independent projections, respect validity and formal precedence, and clear when omitted by new full set',async()=>{
 const h=await setup(page([record()],{guestVersion:'g'.repeat(43),guestRecords:[guest(),guest(1)]}));
 let d=await h.read();let valid=effectiveRecords(d,{project:config.firebase.projectId,course:'115-g9',subject:d.subject,activities});
 assert.equal(valid.state,'confirmed');assert.equal(valid.records.length,2);assert.equal(valid.records.find(r=>r.round===0).source,'worker-validated');
 assert.equal(valid.records.find(r=>r.round===1).source,'worker-guest-approved');
 assert.equal(d.resultVersions.a5_r0,record().resultId);assert.equal(Object.keys(d.resultVersions).length,1);
 await h.client.start(5,2);const r=record(2);h.state.fetcher=async()=>Response.json(response(0,{completed:true,resultId:r.resultId,progressDelta:{progressVersion:2,epoch,resultVersions:{a5_r2:r.resultId},records:[r]}}));
 await h.client.answer(5,2,7);assert.equal(h.calls.length,1);assert.equal(h.client.state().snapshot.guestRecords.length,2);
 h.set(page([],{replace:false,resultVersions:{a5_r0:record().resultId,a5_r2:r.resultId},guestVersion:'n'.repeat(43),guestRecords:[],legacy:{version:legacyVersion,records:null,states:[]}}));
 d=await h.read();assert.equal(d.records.length,2);assert.equal(d.guestRecords.length,0);
 h.set(page([],{guestVersion:'b'.repeat(43),guestRecords:[guest(1,{validity:{state:'unknown',controlVersions:d.controlVersions}})]}));
 await assert.rejects(h.read(),{code:'validity-unconfirmed'});assert.equal(h.client.state().snapshot,null);
});

for(const code of ['summary_unconfirmed','summary_capacity'])test(`${code} stops retries and keeps prior cached originals without a fallback scan`,async()=>{
 let calls=0;const waits=[];
 const model=createReadModel({session:async()=>({app:{options:{projectId:config.firebase.projectId}},auth:{currentUser:{getIdToken:async()=> 'synthetic'}}}),
  project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,
  fetcher:async()=>{calls++;return Response.json({error:code},{status:503});},wait:async ms=>waits.push(ms)});
 await assert.rejects(model.page({course:'115-g9',classKey:'c901',controlVersions:null}),{code:code.replaceAll('_','-')});assert.equal(calls,1);assert.deepEqual(waits,[]);
 const h=await setup(page([record()]));await h.read();const saved=[...h.shared.map];
 h.set(()=>{throw Object.assign(Error(),{code:code.replaceAll('_','-')});});await assert.rejects(h.read());
 assert.equal(h.client.state().snapshot,null);assert.deepEqual([...h.shared.map],saved);assert.equal(h.calls.length,2);
 await assert.rejects(h.client.start(5,1),{code:code.replaceAll('_','-')});assert.equal(h.requests.length,0);
 h.set(page([record()]));await h.read();await h.client.start(5,1);const timers=h.timers.length;
 h.state.fetcher=async()=>Response.json({error:code},{status:503});await assert.rejects(h.client.answer(5,1,7),{code:code.replaceAll('_','-')});
 assert.equal(h.client.state().snapshot,null);assert.equal(h.client.state().uploadIssue,code.replaceAll('_','-'));assert.equal(h.timers.length,timers);
 const requests=h.requests.length;
 h.events.get('online')();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.requests.length,requests,'恢復連線不得自動重送待確認的答案');
 h.state.fetcher=async()=>Response.json(response());await h.client.retry();
 assert.equal(h.requests.length,requests+1,'老師完成對帳後仍可明確重試同一筆答案');
});

test('teacher summary pages retain complete approved guest projections once per person and reject mixed pages',async()=>{
 const h=await harness();await h.client.login('owner');
 const approved=guest(1),second={...guest(2),subject:'synthetic-second'};
 const pages=[
  snapshot([record()],{complete:false,nextCursor:{person:0,offset:100},guestVersion:'g'.repeat(43),guestRecords:[approved]}),
  snapshot([],{people:[],complete:false,nextCursor:{person:1,offset:0},guestVersion:'g'.repeat(43),guestRecords:[approved]}),
  snapshot([],{people:[{subject:second.subject,cls:901,seat:2,provider:'password'}],nextCursor:null,guestVersion:'h'.repeat(43),guestRecords:[second]})
 ];
 let n=0;h.model.page=async()=>pages[n++];
 const d=await h.client.progress({teacher:true,classKey:'c901',activities});
 assert.deepEqual(d.records.filter(r=>r.source==='worker-guest-approved'),[approved,second]);
 assert.equal(d.people.length,2);assert.equal(n,3);
 n=0;h.model.page=async()=>{const page=pages[n++];return n===2?{...page,guestVersion:'x'.repeat(43)}:page;};
 await assert.rejects(h.client.progress({teacher:true,classKey:'c901',activities}),{code:'page-unconfirmed'});
 assert.equal(h.client.state().snapshot,null);
});

test('old controls-first v2 and v1 Worker responses remain explicit compatibility paths',async()=>{
 for(const error of ['control-changed','progress-unsupported']){
  const h=await setup();let controls=0;h.model.controls=async()=>{controls++;return {gateVersion:1,classGateVersion:1};};
  h.set(body=>{if(body.controlVersions===null)throw Object.assign(Error(),{code:error});return error==='progress-unsupported'?snapshot([record()]):page([record()]);});
  const d=await h.read();assert.equal(d.records.length,1);assert.equal(h.calls.length,2);
  assert.equal(controls,error==='progress-unsupported'?2:1);if(error==='progress-unsupported')assert.equal(h.calls[1].progressVersion,undefined);
 }
});

test('explicit paged history never mutates grading caches and scope changes cancel late replies',async()=>{
 const h=await setup(page([record()]));await h.read();const saved=[...h.shared.map],before=h.client.state().snapshot,calls=[];
 h.model.history=async body=>{calls.push(body);return {...snapshot([record()]),historyOnly:true,next:body.after?null:'next-page'};};
 const first=await h.client.history();assert.equal(first.next,'next-page');await h.client.history({after:first.next});
 assert.equal(calls[1].after,'next-page');assert.deepEqual([...h.shared.map],saved);assert.deepEqual(h.client.state().snapshot,before);
 let release;h.model.history=body=>{calls.push(body);return new Promise(resolve=>{release=()=>resolve({...snapshot([record()]),historyOnly:true,next:null});});};
 const pending=h.client.history();while(!release)await new Promise(r=>setImmediate(r));
 await h.client.logout();assert.equal(calls.at(-1).signal.aborted,true);release();await assert.rejects(pending,{code:'identity-changed'});
});

test('history UI reads only on click, preserves cursor and clears late data on scope change',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 const host=new Element('div'),calls=[],client={subscribe(){},cancelHistory(){},history:async body=>{calls.push(body);return {records:[record()],next:body.after?null:'next-page'};}};
 const widget=mountHistory({client,host,scope:()=>({classKey:'c901',subject:'synthetic-subject'})});assert.equal(calls.length,0);
 await host.querySelectorAll('button').find(b=>b.textContent==='查閱歷史').onclick();
 await host.querySelectorAll('button').find(b=>b.textContent==='下一頁').onclick();assert.equal(calls[1].after,'next-page');
 widget.clear();assert.equal(host.querySelectorAll('button').find(b=>b.textContent==='下一頁').hidden,true);
});

 test('v1 summary responses preserve approved guests and start context without using v2 indexes',async()=>{
 const h=await setup(snapshot([record()],{startContext,guestVersion:'g'.repeat(43),guestRecords:[guest(1)]}));
 h.model.controls=async()=>({gateVersion:1,classGateVersion:1});
 const d=await h.read();assert.equal(d.records.length,2);assert.equal(d.progressVersion,undefined);
 await h.client.start(5,1);assert.equal(h.requests.length,1);
});
