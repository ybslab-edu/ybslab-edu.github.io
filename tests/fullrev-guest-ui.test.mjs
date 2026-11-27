import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,config,store} from './fixtures/fullrev.mjs';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {mountGuestLogin} from '../assets/fullrev-guest.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.ok(check(),'guest UI 未到預期狀態');}
const documentOf=()=>({body:new Element('body'),head:new Element('head'),visibilityState:'visible',createElement:tag=>new Element(tag),addEventListener(){}});

test('班座表單不提交非法座號；送出鎖定直到登入完成',async()=>{
  const doc=documentOf(),host=new Element('div');let release,called;
  const {button}=mountGuestLogin({host,document:doc,login:value=>{called=value;return new Promise(r=>{release=r;});}});
  const form=host.querySelector('form'),cls=form.querySelector('[name="cls"]'),seat=form.querySelector('[name="seat"]');
  cls.value='901';seat.value='61';await form.onsubmit({preventDefault(){}});assert.equal(called,undefined);
  assert.match(host.querySelector('[role="alert"]').textContent,/1–60/);
  seat.value='31';const work=form.onsubmit({preventDefault(){}});assert.equal(button.disabled,true);
  assert.deepEqual(called,{cls:'901',seat:31,classKey:'c901_2'});release();await work;assert.equal(button.disabled,false);
});

test('離線 DOM ＋真實 Worker：班座登入、重新整理 resume、兩組作答只顯示待審，換人清除',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
  const [{formalData,ENV},{EPOCH,ORIGIN},{MemoryFirestore},{createFormalWorker},{guestPath},{YbsAdminService,adminPath}]=await Promise.all([
    load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs'),load('src/memory-adapter.mjs'),load('src/formal/index.mjs'),load('src/formal/guest.mjs'),load('src/admin/service.mjs')]);
  const data=await formalData();data['ybsCourses/115-g9/classGates/c901_1']=data['ybsCourses/115-g9/classGates/synthetic-class'];delete data['ybsCourses/115-g9/classGates/synthetic-class'];
  data['ybsTeachers/synthetic-owner']={schemaVersion:1,enabled:true};
  let clock=EPOCH;const db=new MemoryFirestore(data,{now:()=>clock,pathValidator:p=>guestPath(p)||adminPath(p)});
  const worker=createFormalWorker({env:{...ENV,FIREBASE_PROJECT_ID:config.firebase.projectId,YBS_PROJECT_ID:config.firebase.projectId},adapter:db,now:()=>clock,
    verifier:{verify:async()=>({uid:'synthetic-student',provider:'anonymous'})}});
  const h=await harness({noModel:true,answerTickets:true});h.state.hints={};
  h.state.fetcher=(url,init)=>worker.fetch(new Request(url,{...init,headers:{'content-type':'application/json',origin:ORIGIN,authorization:'Bearer synthetic-token'}}));
  const document=documentOf(),events={};
  const xpContext=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xpContext);
  for(const [key,value] of Object.entries({YBSXP:vm.runInContext('YBSXP',xpContext),document,window:{addEventListener:(name,fn)=>events[name]=fn},ACTIVITIES:[{course:'115-g9',week:5,date:'2026-01-01',href:'115-g9/synthetic/',rounds:['第一關','第二關']}],isActivityOpen:()=>true,localStorage:store(),sessionStorage:store(),matchMedia:()=>({matches:true})})){
    const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];});
  }
  const cfg={course:'115-g9',week:5,title:'合成活動',rounds:[{name:'第一關'},{name:'第二關'}],renderQuestion(question,host,{changed}){
    const input=new Element('input');input.setAttribute('aria-label','合成答案');input.oninput=changed;host.append(input);
    return {get:()=>input.value?JSON.parse(input.value):null,ready:()=>input.value!==''};
  }};
  await mountActivity({client:Promise.resolve(h.client),cfg});
  const $=id=>document.body.querySelector('#'+id),button=text=>document.body.querySelectorAll('button').find(b=>b.textContent===text);
  assert.equal(button('學生 Google 登入'),undefined);
  const form=$('g-gbtn').querySelectorAll('form').find(f=>f.querySelector('[name="cls"]'));
  form.querySelector('[name="cls"]').value='901';form.querySelector('[name="seat"]').value='1';
  await form.onsubmit({preventDefault(){}});await until(()=>!!$('stage').querySelector('input'));
  assert.match($('who').textContent,/901 班 1 號/);
  events.pagehide();const restored=h.reopen();await mountActivity({client:Promise.resolve(restored),cfg});
  await until(()=>h.requests.some(r=>r.url.endsWith('/guest/resume'))&&!!$('stage').querySelector('input'));
  for(let slot=0;slot<2;slot++){
    const head=[...db.docs].find(([p])=>p.includes('/guestHeads/'))[1],input=$('stage').querySelector('input');
    input.value=JSON.stringify(head.activeSession.questions[slot].answer);input.oninput();await button('送出').onclick();
    if(slot===0){await until(()=>!!button('下一組'));button('下一組').onclick();}
  }
  await until(()=>$('verdict').querySelector('h3')?.textContent==='已存待審，尚未採計');
  assert.equal($('sync').textContent,'已存待審，尚未採計');assert.equal($('xp-header').hidden,false);assert.equal($('xp-total').textContent,'10 XP');assert.equal($('b-send').disabled,true);
  events.focus();await tick();assert.equal($('sync').textContent,'已存待審，尚未採計');
  assert.equal([...db.docs.keys()].filter(p=>p.includes('/guestAttempts/')).length,1);
  assert.equal([...db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
  assert.deepEqual(new Set(h.requests.map(r=>new URL(r.url).pathname)),new Set(['/guest/context','/guest/start','/guest/answer','/guest/resume']));
  clock+=60001;h.advance();
  events.pagehide();const completedReload=h.reopen();await mountActivity({client:Promise.resolve(completedReload),cfg});
  await until(()=>!!$('stage').querySelector('#b-redo'));assert.match($('stage').textContent,/已存待審，尚未採計/);
  assert.equal($('xp-header').hidden,false);assert.equal($('xp-total').textContent,'10 XP');assert.equal([...db.docs.keys()].filter(p=>p.includes('/guestAttempts/')).length,1);
  const admin=new YbsAdminService({adapter:db,project:config.firebase.projectId,now:()=>clock});
  const teacher={uid:'synthetic-owner',provider:'google.com',emailVerified:true,auth_time:Math.floor(clock/1000)};
  const scope={course:'115-g9',classKey:'c901_1'},queue=await admin.guestQueue(teacher,{...scope,after:null}),row=queue.rows[0];
  const original=structuredClone(db.docs.get(`ybsCourses/115-g9/guestAttempts/${row.attemptId}`));
  const action={...scope,kind:'guest-decision',reasonCode:'spot-check',subject:row.subjectAtSubmit,attemptId:row.attemptId,attemptHash:row.attemptHash,decision:'return'};
  const preview=await admin.preview(teacher,action);
  await admin.execute(teacher,{action,operationId:preview.operationId,fingerprint:preview.fingerprint});
  clock+=60001;h.advance();const returnedAt=h.requests.length;events.pagehide();const redo=h.reopen();await mountActivity({client:Promise.resolve(redo),cfg});
  await until(()=>!!$('stage').querySelector('input'));
  assert.equal($('stage').querySelector('#b-redo'),null);assert.doesNotMatch($('stage').textContent,/已存待審/);
  assert.equal($('rounds').querySelectorAll('button')[1].disabled,true);
  assert.deepEqual(h.requests.slice(returnedAt).map(r=>new URL(r.url).pathname),['/guest/context','/guest/context','/guest/start']);
  for(let slot=0;slot<2;slot++){
    const head=[...db.docs].find(([p])=>p.includes('/guestHeads/'))[1],input=$('stage').querySelector('input');
    input.value=JSON.stringify(head.activeSession.questions[slot].answer);input.oninput();await button('送出').onclick();
    if(slot===0){await until(()=>!!button('下一組'));button('下一組').onclick();}
  }
  await until(()=>$('verdict').querySelector('h3')?.textContent==='已存待審，尚未採計');
  assert.equal([...db.docs.keys()].filter(p=>p.includes('/guestAttempts/')).length,2);
  assert.deepEqual(db.docs.get(`ybsCourses/115-g9/guestAttempts/${row.attemptId}`),original);
  assert.equal((await admin.guestQueue(teacher,{...scope,after:null})).rows.length,1);
  assert.equal($('rounds').querySelectorAll('button')[1].disabled,false);
  const resetAction={...scope,kind:'reset-round',reasonCode:'spot-check',subject:row.subjectAtSubmit,activity:5,round:0};
  const resetPreview=await admin.preview(teacher,resetAction);
  await admin.execute(teacher,{action:resetAction,operationId:'rf-review-reset-0001',fingerprint:resetPreview.fingerprint});
  clock+=60001;h.advance();const resetAt=h.requests.length;events.pagehide();const reset=h.reopen();await mountActivity({client:Promise.resolve(reset),cfg});
  await until(()=>!!$('stage').querySelector('input'));
  assert.equal($('rounds').querySelectorAll('button')[1].disabled,true);assert.equal($('stage').querySelector('#b-redo'),null);
  assert.doesNotMatch($('stage').textContent,/已存待審|回看/);assert.equal($('xp-header').hidden,false);assert.equal($('xp-total').textContent,'10 XP');
  assert.deepEqual(h.requests.slice(resetAt).map(r=>new URL(r.url).pathname),['/guest/context','/guest/context','/guest/start']);
  assert.equal(h.requests.at(-1).body.round,0);assert.equal(h.requests.at(-1).body.roundEpoch,1);
  assert.equal([...db.docs.keys()].filter(p=>p.includes('/guestAttempts/')).length,2);
  assert.equal([...db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
  assert.deepEqual(db.docs.get(`ybsCourses/115-g9/guestAttempts/${row.attemptId}`),original);
  await $('b-swap').onclick();assert.equal($('main').hidden,true);assert.equal(completedReload.state().profile,null);assert.equal($('sync').hidden,true);
});
