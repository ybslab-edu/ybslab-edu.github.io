import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,activities,record as fixtureRecord,response,snapshot} from './fixtures/fullrev.mjs';
import {createFocusRefresh} from '../assets/fullrev-shell.mjs';

const epoch='e'.repeat(43),version='v'.repeat(43),legacyVersion='l'.repeat(43);
const record=(round=0,extra={})=>fixtureRecord(round,{resultId:'c_'+String(round).padStart(43,'r'),...extra});
const old={schemaVersion:1,source:'legacy-unverified',resultId:'l_'+'a'.repeat(64),subject:'synthetic-subject',provider:'password',
 activity:5,round:0,unit:2,unitEpoch:0,roundEpoch:0,displayPolicy:'migration-initial-epochs-v1',completedAt:null,
 xpPolicySnapshot:{openedAt:'2026-11-01T00:00:00.000Z'}};
const states=Array.from({length:4},(_,round)=>({activity:5,round,state:'effective'}));
const page=(records=[],extra={})=>snapshot(records,{progressVersion:2,epoch,resultVersion:version,
 resultVersions:Object.fromEntries(records.map(r=>[`a${r.activity}_r${r.round}`,r.resultId])),replace:true,removed:[],
 legacy:{version:legacyVersion,records:[old],states},...extra});
async function setup(){const h=await harness(),calls=[];let value=page();
 h.model.page=async input=>{calls.push(input);return typeof value==='function'?value(input):value;};
 await h.login();return {...h,calls,set:v=>{value=v;},read:()=>h.client.progress({activities})};}
const cacheKeys=h=>[...h.shared.map.keys()].filter(k=>k.startsWith('progress-v2/'));

test('v2 cold/hot, replace/removal, retained archive and first-pass projection',async()=>{
 const h=await setup();let d=await h.read();assert.equal(d.records.length,1);
 assert.equal(h.calls[0].progressVersion,2);assert.equal(h.calls[0].since,null);assert.equal(h.calls[0].legacyVersion,null);
 h.set(page([record(1)],{replace:false,legacy:{version:legacyVersion,records:null,states}}));
 d=await h.read();assert.deepEqual(h.calls[1].since,{epoch,results:{}});assert.equal(h.calls[1].legacyVersion,legacyVersion);
 assert.equal(d.records.length,2);assert.ok(cacheKeys(h).every(k=>k.includes('/c901/synthetic-student/password/synthetic-subject/')));
 h.set(page([],{replace:false,removed:['a5_r1'],legacy:{version:legacyVersion,records:null,states}}));
 d=await h.read();assert.deepEqual(d.resultVersions,{});assert.equal(d.records.length,1);
 h.set(page([record(0)],{epoch:'x'.repeat(43),legacy:{version:legacyVersion,records:null,states:states.map(s=>({...s,state:'excluded',reason:'reset'}))}}));
 d=await h.read();assert.equal(d.records.find(r=>r.source==='legacy-unverified').validity.state,'excluded');
 assert.equal(d.records.find(r=>r.source==='worker-validated').validity.state,'effective');
 h.set(page([],{epoch:'y'.repeat(43),legacy:{version:legacyVersion,records:null,states}}));
 d=await h.read();assert.deepEqual(d.resultVersions,{});assert.equal(d.records.length,1,'replace clears all new projections');
});
test('committed delta preserves the all-scope index and archive without a progress read; mismatched epoch invalidates',async()=>{
 const h=await setup();h.set(page([record()]));await h.read();await h.client.start(5,1);const r=record(1,{uid:'synthetic-earlier-binding',completedAt:'2026-11-24T01:00:01.123Z'});
 h.state.fetcher=async()=>Response.json(response(0,{completed:true,resultId:r.resultId,
  progressDelta:{progressVersion:2,epoch,resultVersions:{a5_r1:r.resultId},records:[r]}}));
 await h.client.answer(5,1,7);assert.equal(h.calls.length,1);assert.equal(h.client.state().snapshot.records.length,3);
 assert.equal(h.client.state().snapshot.records.find(x=>x.resultId===r.resultId).completedAt,r.completedAt);
 h.set(page([],{replace:false,resultVersions:{a5_r0:record().resultId,a5_r1:r.resultId},legacy:{version:legacyVersion,records:null,states}}));
 await h.read();assert.deepEqual(h.calls.at(-1).since.results,{a5_r0:record().resultId,a5_r1:r.resultId});
 h.state.fetcher=async()=>Response.json(response());await h.client.start(5,2);h.state.fetcher=async()=>Response.json({completed:true,resultId:record(2).resultId,
  progressDelta:{progressVersion:2,epoch:'z'.repeat(43),resultVersions:{a5_r2:record(2).resultId},records:[record(2)]}});
 await h.client.answer(5,2,7);assert.equal(h.client.state().snapshot,null);
 assert.ok(cacheKeys(h).every(k=>k.endsWith('/legacy')));
});
test('pagination keeps the original since, shares the archive, and never persists a partial index',async()=>{
 const h=await setup();h.set(input=>input.cursor?page([record(1)],{replace:true,resultVersions:{a5_r0:record().resultId,a5_r1:record(1).resultId},
  legacy:{version:legacyVersion,records:null,states}}):page([record()],{complete:false,nextCursor:{person:0,offset:100},resultVersions:{a5_r0:record().resultId,a5_r1:record(1).resultId}}));
 const d=await h.read();assert.equal(h.calls[1].since,null);assert.equal(h.calls[1].legacyVersion,legacyVersion);
 assert.equal(d.records.length,3);assert.equal(Object.keys(d.resultVersions).length,2);
 const before=cacheKeys(h).map(k=>h.shared.getItem(k));
 let n=0;h.set(input=>{n++;if(input.cursor)throw Error('synthetic offline');return page([],{replace:false,resultVersions:{...d.resultVersions,a5_r2:record(2).resultId},complete:false,nextCursor:{person:0,offset:100},legacy:{version:legacyVersion,records:null,states}});});
 await assert.rejects(h.read());assert.equal(n,2);assert.deepEqual(cacheKeys(h).map(k=>h.shared.getItem(k)),before);
});
test('cross-page epoch/hash changes restart with merged controls; control_changed is bounded; failures do not become empty progress',async()=>{
 const h=await setup();let count=0,controlReads=0;h.model.controls=async()=>{controlReads++;return {gateVersion:1,classGateVersion:1};};
 h.set(input=>{count++;return count===1?page([],{complete:false,nextCursor:{person:0,offset:100}}):count===2?page([],{resultVersion:'h'.repeat(43)}):page();});
 assert.equal((await h.read()).records.length,1);assert.equal(controlReads,0);assert.equal(h.calls[2].cursor,null);
 h.set(()=>{throw Object.assign(Error(),{code:'control-changed'});});await assert.rejects(h.read(),{code:'control-changed'});
 assert.equal(controlReads,3);assert.equal(h.client.state().snapshot,null);assert.ok(cacheKeys(h).length);
});
test('same identity restores persistent originals; missing originals cold-read; logout and identity switch purge',async()=>{
 const h=await setup();await h.read();h.closePage();const next=h.reopen();await next.restore();await next.progress({activities});
 assert.equal(h.calls.at(-1).legacyVersion,legacyVersion);assert.deepEqual(h.calls.at(-1).since,{epoch,results:{}});
 h.shared.removeItem(cacheKeys(h).find(k=>k.endsWith('/legacy')));h.closePage();const missing=h.reopen();await missing.restore();await missing.progress({activities});
 assert.equal(h.calls.at(-1).since,null);assert.equal(h.calls.at(-1).legacyVersion,null);
 await missing.logout();assert.deepEqual(cacheKeys(h),[]);
});
test('missing SESSION login purges every course progress cache in this project before restore returns',async()=>{
 const h=await setup();await h.read();assert.equal(cacheKeys(h).length,2);
 const prefix=`progress-v2/${h.client.project}/`;
 h.shared.setItem(prefix+'115-df/old-class/old-user/password/old-subject/all','{}');
 h.shared.setItem(prefix+'115-df/old-class/old-user/password/old-subject/legacy','{}');
 h.shared.setItem('unrelated-preference','keep');
 h.shared.setItem('progress-v2/another-project/115-g9/all','keep');
 h.closePage();h.auth.currentUser=null;
 const next=h.reopen();assert.equal(await next.restore(),null);
 assert.ok(!cacheKeys(h).some(k=>k.startsWith(prefix)));
 assert.equal(h.shared.getItem('unrelated-preference'),'keep');
 assert.equal(h.shared.getItem('progress-v2/another-project/115-g9/all'),'keep');
 assert.equal(next.state().snapshot,null);assert.equal(next.state().profile,null);
});
test('unknown legacy states stay unconfirmed and late identity responses cannot repopulate cache',async()=>{
 const h=await setup();h.set(page([],{legacy:{version:legacyVersion,records:[old],states:[]}}));
 await assert.rejects(h.read(),{code:'validity-unconfirmed'});assert.equal(h.client.state().snapshot,null);
 let release;h.set(()=>new Promise(resolve=>{release=()=>resolve(page());}));const pending=h.read();
 while(!release)await new Promise(r=>setImmediate(r));await h.client.logout();release();
 await assert.rejects(pending,{code:'identity-changed'});assert.deepEqual(cacheKeys(h),[]);
});
test('single in-flight progress and throttled focus/visibility do not queue a second read',async()=>{
 const h=await setup();let release;h.set(()=>new Promise(resolve=>{release=()=>resolve(page());}));
 let clock=0;const focus=createFocusRefresh(h.read,{now:()=>clock});const reads=[focus(),focus(),focus()];
 while(!release)await new Promise(r=>setImmediate(r));release();await Promise.all(reads);
 for(const time of [1001,30000,59999]){clock=time;await focus();assert.equal(h.calls.length,1);}
 clock=60000;h.set(page([],{replace:false,legacy:{version:legacyVersion,records:null,states}}));
 await Promise.all([focus(),focus()]);assert.equal(h.calls.length,2);
 clock=110000;focus.touch();clock=120001;await focus();assert.equal(h.calls.length,2,'a committed update restarts the 60-second window');
 clock=170000;await focus();assert.equal(h.calls.length,3);
 focus.reset();await focus();assert.equal(h.calls.length,4,'a changed identity bypasses the old window');
});
test('a context subject rebind notifies observers with cleared progress and permits a fresh identity read',async()=>{
 const h=await setup();h.set(page([record()]));await h.read();await h.client.start(5,0);
 h.state.context={...await h.client.context(5,1),subject:'synthetic-rebound',bindingVersion:2};
 const events=[];h.client.subscribe(value=>events.push(value));
 await assert.rejects(h.client.start(5,1),{code:'identity-changed'});
 const changed=events.find(value=>value.status==='binding-changed');
 assert.ok(changed);assert.equal(changed.profile.uid,h.state.uid);assert.equal(changed.snapshot,null);assert.equal(changed.view,null);
 assert.deepEqual(cacheKeys(h),[]);assert.equal(h.client.savedRound(5),undefined);
 h.set(page([],{subject:'synthetic-rebound',epoch:'b'.repeat(43),legacy:{version:'n'.repeat(43),records:[],states}}));
 assert.equal((await h.read()).subject,'synthetic-rebound');assert.equal(h.calls.at(-1).since,null);
 assert.ok(cacheKeys(h).every(k=>k.includes('/synthetic-rebound/')));
 await h.client.start(5,1);assert.equal(h.client.savedRound(5),1);
});
test('old Worker v1 responses keep full read validation and ignore v2 tokens',async()=>{
 const h=await setup();h.set(snapshot([record()]));assert.equal((await h.read()).records.length,1);
 assert.equal(h.client.state().snapshot.progressVersion,undefined);assert.deepEqual(cacheKeys(h),[]);
 await h.read();assert.equal(h.calls.at(-1).since,null);
});
test('activity scopes share the original archive, but their epoch cannot accept an all-scope receipt',async()=>{
 const h=await setup();await h.read();h.set(page([],{epoch:'a'.repeat(43),legacy:{version:legacyVersion,records:null,states}}));
 await h.client.progress({activities,activity:5});assert.equal(h.calls.at(-1).since,null);assert.equal(h.calls.at(-1).legacyVersion,legacyVersion);
 assert.ok(cacheKeys(h).some(k=>k.endsWith('/all')));assert.ok(cacheKeys(h).some(k=>k.endsWith('/activity/5')));
 await h.client.start(5,1);h.state.fetcher=async()=>Response.json({completed:true,resultId:record(1).resultId,
  progressDelta:{progressVersion:2,epoch,resultVersions:{a5_r1:record(1).resultId},records:[record(1)]}});
 await h.client.answer(5,1,7);assert.equal(h.client.state().snapshot,null);
});
test('class, subject, provider and UID changes purge old caches and reject stale work',async()=>{
 const h=await setup();await h.read();h.state.hints={'115-g9':'c902'};
 h.set(page([],{classKey:'c902',epoch:'b'.repeat(43)}));await h.read();
 assert.ok(cacheKeys(h).every(k=>k.includes('/c902/')));assert.equal(h.calls.at(-1).since,null);
 h.set(page([],{classKey:'c902',subject:'synthetic-other',epoch:'c'.repeat(43),legacy:{version:'s'.repeat(43),records:[],states}}));
 await h.read();assert.ok(cacheKeys(h).every(k=>k.includes('/synthetic-other/')));
 const getClaims=h.auth.currentUser.getIdTokenResult;
 h.auth.currentUser.getIdTokenResult=async()=>{const c=await getClaims();c.claims.firebase.sign_in_provider='google.com';return c;};
 await assert.rejects(h.read(),{code:'identity-changed'});assert.deepEqual(cacheKeys(h),[]);assert.equal(h.client.state().profile,null);
 await h.login();h.state.uid='synthetic-next';await h.login();assert.equal(h.client.state().profile.uid,'synthetic-next');assert.deepEqual(cacheKeys(h),[]);
});
test('a hot read already in flight cannot delay or overwrite a committed receipt',async()=>{
 const h=await setup();await h.read();await h.client.start(5,1);
 let release;h.set(()=>new Promise(resolve=>{release=()=>resolve(page([],{replace:false,legacy:{version:legacyVersion,records:null,states}}));}));
 const pending=h.read();while(!release)await new Promise(r=>setImmediate(r));assert.equal(h.client.state().snapshot,null);
 h.state.fetcher=async()=>Response.json({completed:true,resultId:record(1).resultId,
  progressDelta:{progressVersion:2,epoch,resultVersions:{a5_r1:record(1).resultId},records:[record(1)]}});
 await h.client.answer(5,1,7);assert.equal(h.client.state().snapshot.records.length,2);
 release();await assert.rejects(pending,{code:'read-superseded'});assert.equal(h.client.state().snapshot.records.length,2);
});
