import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {harness,response,config} from './fixtures/fullrev.mjs';
import {createDFReports} from '../assets/fullrev-df.mjs';
import vm from 'node:vm';
import {renderRecording} from '../assets/fullrev-recording.mjs';
import {Element} from './fixtures/activity-dom.mjs';
test('batch8 pending response clears answer queue without completing or creating XP; reopening asks Worker again',async()=>{
 const h=await harness({fetcher:async()=>Response.json({sid:'s'.repeat(22),completed:false,awaitingTeacher:true})});await h.login();
 const v=await h.client.start(4,0);assert.equal(v.awaitingTeacher,true);assert.equal(v.completed,false);assert.equal(h.client.state().status,'teacher-pending');assert.equal(h.client.state().pending,false);
 assert.deepEqual(JSON.parse([...h.storage.map.values()][0]).drafts,{});await h.client.start(4,0);assert.equal(h.requests.length,2);assert.equal(h.client.state().snapshot,null);
});
test('batch8 full artifact has 124 rounds, 31 distinct activities; DF protected content and recording budgets excluded',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'pr6-b8-artifact-'));t.after(()=>rm(dir,{recursive:true,force:true}));const out=join(dir,'public');
 assert.deepEqual(await buildBatches({output:out,config}),{activities:31,rounds:124});
 assert.match(await readFile(join(out,'assets/login.js'),'utf8'),/fullrev-client\.mjs\?v=20261120b8/);
 const df=await readFile(join(out,'115-df/a/index.html'),'utf8');
 const globals=vm.createContext({});
 for(const [,src] of df.matchAll(/<script src="([^"]+)"/g))if(/\/(curriculum|activities)\.js\?/.test(src)){
  const file=join(out,'assets',src.split('/').at(-1).split('?')[0]);
  const source=await readFile(file,'utf8');
  assert.doesNotThrow(()=>vm.runInContext(source,globals),`generated DF resource ${src} loads once`);
 }
 assert.match(df,/await YBS.loadDFContent\(\)/);for(const id of ['pub','enc-b2','enc-rv','ans'])assert.ok(df.includes(`id="${id}" type="application/json">null</script>`));
 assert.doesNotMatch(df,/teacher\.js|lock\.js|"ct"\s*:|"s2"\s*:|"b64"\s*:/);
 const scan=async dir=>{let all='';for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);all+=e.isDirectory()?await scan(p):await readFile(p,'utf8');}return all;};
 const text=await scan(out);assert.doesNotMatch(text,/soundBest|minimumBytes|"budget"\s*:|checkRecordingAnswer|pr6-batch8|sourceMappingURL/);
 assert.match(await readFile(new URL('../assets/fullrev-config.js',import.meta.url),'utf8'),/enabled: false/);
});
test('DF envelope remains three UID slots; upload receipt has no grade side effect, strict identity and stale auth checks',async()=>{
 let flip=false,uid='synthetic-student',control={subject:'synthetic-subject'},clock=1700000000000;const docs=new Map(),writes=[];
 const stamp=()=>({toMillis:()=>clock});globalThis.firebase={firestore:{FieldValue:{serverTimestamp:stamp}}};
 const db={doc:path=>({path,get:async()=>path.includes('/roster/')?{exists:true,data:()=>({active:true,subject:'synthetic-subject',cls:901,seat:1})}:{exists:docs.has(path),data:()=>docs.get(path)}}),runTransaction:async fn=>fn({get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),set:(ref,value)=>{docs.set(ref.path,value);writes.push(ref.path);}})};
 const api=createDFReports({course:'115-df',getSession:async()=>({db}),mark:()=>({uid}),active:m=>{if(uid!==m.uid)throw Error('identity-changed');},claims:async()=>({firebase:{sign_in_provider:'password'},email:'cgjh000000@ybslab-edu.github.io'}),context:async()=>{if(flip)uid='synthetic-other';return control;},fail:code=>Object.assign(Error(code),{code})});
 try{
  assert.deepEqual(await api.whoami(),{ok:true,student:{cls:901,seat:1}});
  const encoded={schemaVersion:1,encoding:'ascii-json',payload:'{}',cls:901,seat:1,snapshotAt:clock};
  for(let n=1;n<=3;n++){const receipt=await api.submitReport(n,encoded);assert.equal(receipt.session,n);assert.equal(receipt.completed,undefined);assert.equal(receipt.uid,uid);}
  await api.submitReport(1,encoded);assert.equal(writes.length,3);
  assert.deepEqual(writes,[1,2,3].map(n=>`ybsCourses/115-df/reports/${uid}_s${n}`));
  await assert.rejects(api.submitReport(1,{...encoded,seat:2}),/report\/identity/);control={subject:'different-subject'};assert.equal((await api.whoami()).ok,false);
  control={subject:'synthetic-subject'};flip=true;await assert.rejects(api.submitReport(1,encoded),/identity-changed/);assert.equal(writes.length,3);
 }finally{delete globalThis.firebase;}
});

test('DF client uses the same authenticated start/answer queue, awaitingTeacher never becomes completed',async()=>{
 const h=await harness({course:'115-df',fetcher:async(url)=>Response.json(url.endsWith('/start')?response(0,{question:{slot:0,type:'df-report-v1',data:{session:1}}}):{sid:'s'.repeat(22),completed:false,awaitingTeacher:true})});
 h.state.hints={'115-df':'c901'};await h.login();const result=await h.client.submitManual(0);
 assert.equal(result.awaitingTeacher,true);assert.equal(result.completed,false);assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].body.answer,{session:1});assert.equal(h.requests[1].body.course,'115-df');assert.equal(h.client.state().snapshot,null);
});

test('recording rejects decimal and out of range formats before sending, retaining controls for same-question correction',t=>{
 const original={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 Object.assign(globalThis,{document:{createElement:tag=>new Element(tag)},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 t.after(()=>{for(const [k,v] of Object.entries(original))if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 const host=new Element('section'),handle=renderRecording({data:{mode:'recording-movie',seconds:2}},host,{changed(){}});
 const set=(id,v)=>{const e=host.querySelector('#'+id);e.value=v;e.oninput();};
 set('movie-fps','12');set('movie-fps','24');set('movie-parts','1');set('movie-one','24.0');set('movie-total','48');
 assert.equal(handle.ready(),false);assert.match(host.textContent,/整數/);assert.equal(host.querySelector('#movie-one').value,'24.0');
 for(const bad of ['2e1','-1','100001','9007199254740992']){set('movie-one',bad);assert.equal(handle.ready(),false);}
 set('movie-one','24');assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),{fps:24,one:24,total:48,parts:1});handle.dispose();
});

test('invalid_answer 400 preserves session draft and permits a corrected answer with the same sid/seq/slot',async()=>{
 const h=await harness();await h.login();await h.client.start(4,2);
 h.state.fetcher=async()=>Response.json({error:'invalid_answer'},{status:400});
 await assert.rejects(h.client.answer(4,2,{fps:24,one:null,total:48,parts:1}),{code:'invalid-answer'});
 assert.equal(h.client.state().pending,false);assert.equal(h.client.state().status,'ready');
 const old=h.requests.at(-1).body,draft=JSON.parse([...h.storage.map.values()][0]).drafts['4:2'];assert.equal(draft.sid,old.sid);
 h.state.fetcher=async()=>Response.json(response(0,{nextSeq:2,correct:false}));
 await h.client.answer(4,2,{fps:24,one:24,total:48,parts:1});const fresh=h.requests.at(-1).body;
 for(const k of ['sid','seq','slot'])assert.equal(fresh[k],old[k]);assert.notEqual(fresh.requestId,old.requestId);
});
