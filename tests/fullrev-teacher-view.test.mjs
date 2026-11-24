import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {buildSite,scanRelease,releasePaths} from '../tools/build-fullrev-site.mjs';
import {mountLogin,mountActivity} from '../assets/fullrev-ui.mjs';
import {openTeacherQuestion,mountTeacherQuestion} from '../assets/fullrev-teacher-view.mjs';
import {mountStudentLogin} from '../assets/fullrev-shell.mjs';
import {activityConfig,renderQuestion} from '../assets/fullrev-activities.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,config,store} from './fixtures/fullrev.mjs';
import {teacherPayload} from './fixtures/fullrev-teacher.mjs';
import {renderOutcome} from '../assets/fullrev-outcomes.mjs';
function dom(t){
 class TestElement extends Element{get lastChild(){return this.childNodes.at(-1)}get children(){return this.childNodes.filter(n=>n.nodeType===1)}prepend(...children){this.replaceChildren(...children,...this.childNodes);}contains(el){return el===this||this.childNodes.some(n=>n===el||n.contains?.(el));}remove(){this.parentElement?.replaceChildren(...this.parentElement.childNodes.filter(n=>n!==this));}}
 const body=new TestElement('body'),head=new TestElement('head');
 const document={body,head,createElement:t=>new TestElement(t),createElementNS:(_,t)=>new TestElement(t),getElementById:id=>body.querySelector('#'+id),addEventListener(){}};
 for(const [key,value] of Object.entries({document,window:{addEventListener(){}},sessionStorage:store(),localStorage:store(),requestAnimationFrame:()=>1,cancelAnimationFrame(){},matchMedia:()=>({matches:true})})){
  const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
  t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);
 }
 return {body,head,document};
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
test('教師附件離開後撤銷 Blob URL；晚到附件不會在登出後建立網址',async t=>{
 dom(t);const created=[],revoked=[],create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 URL.createObjectURL=()=>{const url='blob:synthetic-'+created.length;created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 t.after(()=>{URL.createObjectURL=create;URL.revokeObjectURL=revoke;});
 const data={...teacherPayload().question.data,materials:[{name:'synthetic.pdf',gzip:gzipSync('synthetic attachment').toString('base64')}]};
 const host=document.createElement('section'),h=renderOutcome(host,data,()=>{});
 await settle();assert.equal(created.length,1);h.dispose();assert.deepEqual(revoked,created);assert.equal(host.childNodes.length,0);
 const late=renderOutcome(host,data,()=>{});late.dispose();await settle();assert.equal(created.length,1);
});
test('兩種登入介面預設無學生 Google，明確開關才顯示，教師登入保留',async t=>{
 dom(t);
 for(const mount of [mountLogin,mountStudentLogin])for(const enabled of [undefined,false,true]){
  const host=new Element('div');await mount({host,client:{course:'115-g9',studentGoogleLogin:enabled,login(){}},onLogin(){},explain:String});
  const labels=host.querySelectorAll('button').map(b=>b.textContent);
  assert.equal(labels.includes('學生 Google 登入'),enabled===true);assert.ok(labels.includes('教師 Google 登入'));
  assert.equal(host.querySelectorAll('button').find(b=>b.textContent==='教師 Google 登入').closest('details'),null,'教師入口不應藏在收合區');
 }
 const h=await harness();assert.equal(h.client.studentGoogleLogin,false);
});
test('教師端點僅本人教師可呼叫；不存題面、答案、session 或紀錄；每次皆重新驗證',async()=>{
 const h=await harness({fetcher:async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}})});
 await assert.rejects(h.client.teacherQuestion(8,0),{code:'login-required'});await h.login();
 await assert.rejects(h.client.teacherQuestion(8,0),{code:'owner-required'});assert.equal(h.requests.length,0);
 await h.client.login('owner');const before=JSON.stringify([...h.storage.map,...h.shared.map]);
 const v=await h.client.teacherQuestion(8,0);assert.equal(v.solution.answer[0],'合成示範答案');
 await h.client.teacherQuestion(8,1);assert.equal(h.requests.length,2);
 assert.deepEqual(h.requests.map(r=>r.url),[config.workerOrigin+'/teacher-question',config.workerOrigin+'/teacher-question']);
 assert.equal(h.requests[0].cache,'no-store');assert.equal(h.requests[0].redirect,'error');assert.equal(h.requests[0].credentials,'omit');
 assert.equal(JSON.stringify([...h.storage.map,...h.shared.map]),before);assert.equal(h.client.state().snapshot,null);assert.equal(h.client.state().pending,false);
 h.state.fetcher=async()=>Response.json({error:'reauth_required'},{status:401,headers:{'cache-control':'no-store'}});
 await assert.rejects(h.client.teacherQuestion(8,0),{code:'reauth-required'});assert.equal(h.requests.length,3);
});
test('晚到回應、登出、換人及被拒絕的回應均不掛載；禁止可快取回應',async()=>{
 const h=await harness();assert.equal(await openTeacherQuestion({client:h.client,activity:8,round:0}),null);await h.login();
 assert.equal(await openTeacherQuestion({client:h.client,activity:8,round:0}),null);assert.equal(h.requests.length,0);
 await h.client.login('owner');h.state.fetcher=async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});
 assert.equal(await openTeacherQuestion({client:h.client,activity:8,round:0,current:()=>false}),null);
 h.state.fetcher=async(url,init)=>{await h.client.logout();return Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});};
 await assert.rejects(h.client.teacherQuestion(8,0),{code:'identity-changed'});
 await h.client.login('owner');h.state.fetcher=async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)));
 await assert.rejects(h.client.teacherQuestion(8,0),{code:'response-invalid'});
 h.state.fetcher=async()=>Response.json({error:'owner_required'},{status:403});await assert.rejects(h.client.teacherQuestion(8,0),{code:'owner-required'});
});
for(const activity of [7,8,9])test(`活動 ${activity}：教師題面／附件／填答／換題／關卡；學生與未登入不顯示，登出清除`,async t=>{
 const {body}=dom(t);let fetched=0;
 const h=await harness({fetcher:async(url,init)=>{fetched++;return Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});}});
 await mountActivity({client:Promise.resolve(h.client),cfg:activityConfig({course:'115-g9',week:activity,title:'合成活動'})});
 assert.equal(body.querySelector('#main').hidden,true);assert.equal(body.querySelector('#tbar'),null);
 await h.login();await settle();assert.equal(body.querySelector('#tbar'),null);assert.equal(fetched,0);
 await h.client.login('owner');await settle();assert.ok(body.querySelector('#tbar'));
 assert.match(body.querySelector('#stage').textContent,/合成題面/);assert.match(body.querySelector('#stage').textContent,/合成附件/);
 assert.equal(body.querySelector('#teacher-solution').hidden,true);assert.equal(body.querySelector('#b-send').hidden,true);
 body.querySelector('#tb-ans').click();assert.equal(body.querySelector('#teacher-solution').hidden,false);
 body.querySelector('#tb-fill').click();assert.deepEqual(body.querySelectorAll('[data-answer-field]').map(e=>e.value),['合成示範答案','42']);
 assert.equal(fetched,1);body.querySelector('#tb-new').click();await settle();assert.equal(fetched,2);
 body.querySelector('#rounds').querySelectorAll('button')[1].click();await settle();assert.equal(h.requests.at(-1).body.round,1);
 await h.client.logout();assert.equal(body.querySelector('#tbar'),null);assert.equal(body.querySelector('#main').hidden,true);
 assert.doesNotMatch(body.querySelector('#stage').textContent,/合成示範答案/);
});
test('ASCII 編解碼依題型填入文字，觸發預覽且 renderer 可讀回原解答',t=>{
 dom(t);
 for(const [mode,answer,data,text] of [
  ['ascii-encode',[65,32,66],{prompt:'A B'},'65 32 66'],
  ['ascii-decode','A B',{codes:[65,32,66]},'A B']
 ]){
  const host=new Element('div'),value={question:{slot:0,type:'finite-bank-v1',data:{mode,...data}},solution:{answer,notes:[]}};
  let rendered;
  const handle=mountTeacherQuestion({host,value,renderQuestion(...args){return rendered=renderQuestion(...args);},onNew(){}});
  host.querySelector('#tb-fill').click();
  assert.equal(host.querySelector('[data-answer-field="text"]').value,text);
  assert.deepEqual(rendered.get(),answer);assert.equal(rendered.ready(),true);
  assert.match(host.textContent,/目前編碼：65 32 66/);
  assert.equal(host.querySelector('#teacher-solution').hidden,false);handle.dispose();
 }
});
test('完整建置僅豁免既有 DF／暖身固定內容；新增答案或教師教材副本皆拒絕',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ybs-teacher-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const workerSource=join(dir,'synthetic-worker'),banks=join(workerSource,'src/formal/banks'),output=join(dir,'site');
 await mkdir(banks,{recursive:true});
 for(let n=1;n<=8;n++)await writeFile(join(banks,`pr6-batch${n}.mjs`),'export default '+JSON.stringify({['1:synthetic-private-version-'+n]:{rounds:{0:{cases:[{facts:{},answer:'synthetic-private-answer-unique-'+n}]}}}}));
 for(const name of ['pr6-batch5-materials.mjs','pr6-batch7-materials.mjs'])await writeFile(join(banks,name),'export default {};');
 const result=await buildSite({output,workerSource,config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'}});
 assert.equal(await readFile(join(output,'assets/activities.json'),'utf8'),await readFile(new URL('../assets/activities.json',import.meta.url),'utf8'));
 assert.equal(result.rounds,121);assert.equal(result.activities,30);assert.equal(result.scan.hits,0);assert.ok(!releasePaths().some(p=>p.includes('teacher-reference')));
 const shell=await readFile(join(output,'assets/fullrev-shell.mjs'),'utf8');assert.match(shell,/WARMUP_BANK/);assert.match(shell,/function mountWarmup/);
 const {publicAnswerRemainder}=await import('../tools/public-answer-allowlist.mjs');assert.doesNotMatch(publicAnswerRemainder('assets/fullrev-shell.mjs',Buffer.from(shell)).toString(),/WARMUP_BANK|firstOption|checkWarmup/);
 const file=join(output,'assets/fullrev-teacher-view.mjs'),clean=await readFile(file);
 await writeFile(file,Buffer.concat([clean,Buffer.from('\nconst leaked="synthetic-private-answer-unique-1";')]));
 await assert.rejects(scanRelease({output,workerSource}),/release_private_text_answer/);await writeFile(file,clean);
 const dfFile=join(output,'115-df/a/index.html'),df=await readFile(dfFile,'utf8');assert.match(df,/assets\/legacy-df\/login.js/);assert.match(df,/id="ans"/);
 await writeFile(dfFile,df+'<script id="ans" type="application/json">{}</script>');
 await assert.rejects(scanRelease({output,workerSource}),/release_legacy_df_changed/);await writeFile(dfFile,df);
 await mkdir(join(output,'assets/teacher-reference'));await writeFile(join(output,'assets/teacher-reference/8.mjs'),'export const answer="synthetic-private-answer-unique-1";');
 await assert.rejects(scanRelease({output,workerSource}),/release_allowlist_mismatch/);
});

test('Worker 授權後的 30 活動／121 關逐關掛載、填入解答欄位非空並銷毀',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 dom(t);const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
 const [{createFormalWorker},{MemoryFirestore},{readPath},{batchData},{ENV,paths},{EPOCH,ORIGIN},{default:batch8}]=await Promise.all([
  load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal/read-model.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs'),load('src/formal/banks/pr6-batch8.mjs')]);
 const data=await batchData(EPOCH);
 for(const [key,bundle] of Object.entries(batch8))if(!key.startsWith('115-df:')){const [a,graderVersion]=key.split(':');Object.assign(data[paths.global].activities[a],{graderVersion,rounds:Object.keys(bundle.rounds).map(Number)});}
 data['ybsTeachers/synthetic-owner']={schemaVersion:1,enabled:true};
 const db=new MemoryFirestore(data,{pathValidator:readPath});
 const worker=createFormalWorker({env:ENV,adapter:db,now:()=>EPOCH,verifier:{verify:async()=>({uid:'synthetic-owner',provider:'google.com',emailVerified:true,auth_time:EPOCH/1000})}});
 const host=new Element('div');let total=0,filledRounds=0,filledFields=0;
 for(const [a,p] of Object.entries(data[paths.global].activities))for(const round of p.rounds){
  const request=new Request('https://synthetic.invalid/teacher-question',{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({course:'115-g9',activity:Number(a),round})});
  // A fresh isolate avoids the unchanged 120 requests/minute identity ceiling in this 121-round sweep.
  const api=total===120?createFormalWorker({env:ENV,adapter:db,now:()=>EPOCH,verifier:{verify:async()=>({uid:'synthetic-owner',provider:'google.com',emailVerified:true,auth_time:EPOCH/1000})}}):worker;
  const response=await api.fetch(request);assert.equal(response.status,200,`activity ${a}, round ${round}`);const value=await response.json();
  const cfg=activityConfig({course:'115-g9',week:Number(a)});
  const handle=mountTeacherQuestion({host,value,renderQuestion:cfg.renderQuestion,onNew(){}});
  assert.ok(host.querySelector('#tb-ans'));assert.ok(host.querySelector('#teacher-solution'));
  const fields=host.querySelectorAll('[data-answer-field]'),fill=host.querySelector('#tb-fill');
  assert.equal(!!fill,fields.length>0,`activity ${a}, round ${round}: fill availability`);
  if(fill){
   fill.click();filledRounds++;
   for(const input of fields){
    assert.ok(input.value.trim()!==''&&input.value!=='undefined'&&input.value!=='[object Object]',`activity ${a}, round ${round}, field ${input.dataset.answerField}`);
    if(input.tagName==='SELECT')assert.ok(input.querySelectorAll('option').some(o=>o.value===input.value),'filled value must match a real option');
    filledFields++;
   }
  }
  handle.dispose();assert.equal(host.childNodes.length,0);total++;
 }
 assert.equal(total,121);assert.equal(db.metrics.writes,0);assert.equal(filledRounds,26);assert.ok(filledFields>=filledRounds);t.diagnostic(`teacher render/fill/dispose: activities=30; rounds=${total}; filledRounds=${filledRounds}; filledFields=${filledFields}; writes=0`);
});
