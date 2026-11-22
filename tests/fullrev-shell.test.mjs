import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {createClient} from '../assets/fullrev-client.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
import {activityConfig,MANAGED_ACTIVITIES} from '../assets/fullrev-activities.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,config,store} from './fixtures/fullrev.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.ok(check(),'離線 UI 未到預期狀態');}
async function setup(t,{closed=false,holdProgress=false,activityId=7,initialRound,restoredRound}={}){
 const activity=MANAGED_ACTIVITIES.find(a=>a.activity===activityId),catalog=[{...activity,week:activityId,course:'115-g9',codes:[]}];
 const source=process.env.YBS_WORKER_SOURCE;assert.ok(source,'本機驗收須指定 YBS_WORKER_SOURCE');
 const load=p=>import(pathToFileURL(resolve(source,p)).href);
 const [{createFormalWorker},{MemoryFirestore},{readPath},{batchData,privateAnswer},{ENV,CLASS_HINTS,password,paths},{EPOCH,ORIGIN}]=await Promise.all([
  load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal/read-model.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
 let clock=EPOCH,calls=[],throttle=true,waits=[],readsReleased=!holdProgress,release;
 const held=new Promise(resolve=>{release=()=>{readsReleased=true;resolve();};});
 const data=await batchData(clock);if(closed)data[paths.global].activities[7].opensAt=clock+86400000;
 const db=new MemoryFirestore(data,{now:()=>clock,pathValidator:readPath});
 const worker=createFormalWorker({env:{...ENV,FIREBASE_PROJECT_ID:config.firebase.projectId,YBS_PROJECT_ID:config.firebase.projectId},adapter:db,now:()=>clock,verifier:{verify:async uid=>({...password(uid),ybsClassKeys:CLASS_HINTS})}});
 const firebase=await harness();firebase.state.uid='fake-uid-a';firebase.state.owner=false;firebase.state.hints=CLASS_HINTS;
 const session=async()=>firebase.session,fetcher=async(url,init)=>{
  const op=new URL(url).pathname.slice(1);calls.push({op,body:JSON.parse(init.body)});clock+=60001;
  if(op==='context'&&throttle){throttle=false;return Response.json({error:'rate_limited'},{status:429,headers:{'retry-after':'3'}});}
  if(op==='progress'&&!readsReleased&&db.docs.get(paths.head('synthetic-a'))?.completions&&Object.keys(db.docs.get(paths.head('synthetic-a')).completions).length)await held;
  return worker.fetch(new Request('https://synthetic.invalid/'+op,{...init,headers:{'content-type':'application/json',origin:ORIGIN,authorization:'Bearer fake-uid-a'}}));
 };
 const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher,now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;}});
 const client=createClient({config,session,readModel:model,fetcher,shared:store(),storage:store(),now:()=>clock,events:{addEventListener(){}}});
 const xpContext=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xpContext);const xp=vm.runInContext('YBSXP',xpContext);
 const sessionStore=store();if(restoredRound!==undefined)sessionStore.setItem(`ybs:fullrev:round:${config.firebase.projectId}:115-g9:${activityId}:fake-uid-a`,String(restoredRound));
 const body=new Element('body'),head=new Element('head'),document={body,head,createElement:tag=>new Element(tag),addEventListener(){}},storage=store();
 for(const [key,value] of Object.entries({document,window:{addEventListener(){}},ACTIVITIES:catalog,YBSXP:xp,localStorage:storage,sessionStorage:sessionStore})){
  const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
 }
 await mountActivity({client:Promise.resolve(client),cfg:activityConfig({course:'115-g9',week:activityId,title:activity.title})});
 const $=id=>body.querySelector('#'+id),button=label=>body.querySelectorAll('button').find(b=>b.textContent===label);
 const fill=answer=>{answer.forEach((value,k)=>{const field=$('stage').querySelectorAll('input').concat($('stage').querySelectorAll('select')).find(f=>String(f.dataset.answerField)===String(k));field.value=value;field.oninput();});};
 await client.login('password','9990001','synthetic-password');
 await until(()=>!$('g-isme').hidden);assert.equal(calls.some(c=>c.op==='start'),false,'確認身分前不可建立作答 session');
 if(initialRound!==undefined)$('g-round').value=initialRound;
 await $('g-isme').onclick();
 await until(()=>closed?!$('activity-lock').hidden:!!$('stage').querySelector('input'));
 if(!closed)await until(()=>!!client.state().snapshot);
 return {client,db,paths,calls,waits,$,button,fill,answer:()=>privateAnswer(db),release,sessionStore};
}
test('u2-05 四關：真實 Worker、舊版 DOM、429 自動恢復、錯答修正、兩組確認及可信 XP',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t);assert.deepEqual(h.waits,[3000]);assert.equal(h.$('gate').hidden,true);assert.equal(h.$('main').hidden,false);
 assert.ok(h.$('task-instructions'));assert.equal(h.button('重試上傳').hidden,true);assert.equal(h.button('重新開始').hidden,true);
 for(let r=0;r<4;r++){
  if(r){await h.button('下一關').onclick();assert.equal(h.$('stage').dataset.round,r);await until(()=>h.$('stage').querySelectorAll('[data-answer-field]').length>0);}
  const inputs=h.$('stage').querySelectorAll('[data-answer-field]'),correct=h.answer(),wrong=structuredClone(correct);wrong[0]=typeof wrong[0]==='number'?wrong[0]+1:'合成錯答';
  h.fill(wrong);await h.button('送出').onclick();assert.equal(h.$('verdict').querySelector('h3').textContent,'還不對');assert.equal(h.$('stage').querySelectorAll('[data-answer-field]')[0],inputs[0]);assert.equal(h.button('送出').disabled,true);
  assert.match(h.$('hint-content').textContent,/第 1 層：方向/);assert.match(h.$('streak').textContent,/0\/2/);
  h.fill(correct);await h.button('送出').onclick();assert.match(h.$('verdict').textContent,/答對了！累積答對 1\/2/);assert.equal(h.button('送出').disabled,true);assert.equal(h.$('stage').dataset.slot,0);
  const firstQuestion=structuredClone(h.db.docs.get(h.paths.head('synthetic-a')).activeSession.questions[0].data);
  h.button('下一組').onclick();assert.equal(h.$('stage').dataset.slot,1);assert.notDeepEqual(h.db.docs.get(h.paths.head('synthetic-a')).activeSession.questions[1].data,firstQuestion);assert.equal(h.button('送出').disabled,true);
  h.fill(h.answer());await h.button('送出').onclick();await until(()=>h.$('verdict').querySelector('h3')?.textContent==='過關！');
  assert.match(h.$('verdict').textContent,/本關 XP：\+10 過關、\+5 準時/);assert.match(h.$('streak').textContent,/2\/2/);
  assert.equal([...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,r+1);
 }
 assert.match(h.$('verdict').textContent,/\+20 全過/);assert.match(h.$('verdict').textContent,/全部過關/);assert.equal(h.$('rounds').querySelectorAll('.passed').length,4);
 assert.equal(h.$('xp-total').textContent,'80 XP');assert.equal(h.calls.filter(c=>c.op==='answer').length,12);
 console.log('u2-05 mock Worker: 4/4 rounds, 12 answers, 429 -> retry 3000ms -> 200, 4 validated results, 80 XP');
});
test('Worker 未開放顯示舊遮罩，F12 移除遮罩不能取得題面或過關',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{closed:true});assert.equal(h.$('main').hidden,true);assert.match(h.$('activity-lock').textContent,/這個活動還沒開放/);
 await assert.rejects(h.client.start(7,0),{code:'not-open'});assert.equal(h.calls.some(c=>c.op==='start'),false);assert.equal([...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
});
test('completed 回條尚未確認進度時不出現過關或 XP；登出後延遲讀取不能補回畫面',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{holdProgress:true});h.fill(h.answer());await h.button('送出').onclick();h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();
 await until(()=>h.calls.filter(c=>c.op==='progress').length===3);assert.notEqual(h.$('verdict').querySelector('h3')?.textContent,'過關！');assert.equal(h.$('xp-total').textContent,'0 XP');
 await h.client.logout();h.release();await tick();await tick();assert.equal(h.$('main').hidden,true);assert.equal(h.$('stage').textContent,'');assert.equal(h.$('xp-header').hidden,true);
});

test('試算表活動使用同一外框與原 renderer，不帶問卷專用文案',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{activityId:8});
 assert.equal(h.$('activity-title').textContent,MANAGED_ACTIVITIES.find(a=>a.activity===8).title);
 assert.doesNotMatch(h.$('main').textContent,/虛構音樂活動團隊|前測完成前/);
 h.fill(h.answer());await h.button('送出').onclick();assert.equal(h.$('verdict').className,'verdict mid');
 h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();await until(()=>h.$('verdict').className==='verdict ok');
 assert.equal(h.$('xp-total').textContent,'15 XP');
});

test('問卷、試算表與媒體的備用紀錄只存本機，不送出或採計',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const activityId of [7,8,9]){
  const h=await setup(t,{activityId}),calls=h.calls.length;
  const session=structuredClone(h.db.docs.get(h.paths.head('synthetic-a')).activeSession);
  h.button('使用備用素材並記錄').onclick();await tick();
  assert.equal(h.calls.length,calls,'備用操作不得呼叫 Worker');
  assert.deepEqual(h.db.docs.get(h.paths.head('synthetic-a')).activeSession,session);
  assert.equal([...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
  assert.match(localStorage.getItem(`ybs:u2-0${activityId-2}:fallback:v1`),/未實際操作/);
 }
});

test('直接選第 3 關與重整還原，不先建立第 0 關 session',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{initialRound:2});
 assert.equal(h.$('stage').dataset.round,2);assert.ok(h.calls.filter(c=>c.op==='start').every(c=>c.body.round===2));
 assert.equal(h.sessionStore.getItem(`ybs:fullrev:round:${config.firebase.projectId}:115-g9:7:fake-uid-a`),'2');
 const restored=await setup(t,{restoredRound:2});assert.equal(restored.$('g-round').value,'2');assert.equal(restored.$('stage').dataset.round,2);
 assert.ok(restored.calls.filter(c=>c.op==='context'||c.op==='start').every(c=>c.body.round===2));
});
test('名冊確認不依賴第 0 關開放，活動 4 可直接開始第 4 關',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{activityId:4,initialRound:3});
 assert.equal(h.$('gate').hidden,true);assert.equal(h.$('stage').dataset.round,3);
 assert.ok(h.calls.filter(c=>c.op==='context'||c.op==='start').every(c=>c.body.round===3));
});
