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
async function setup(t,{closed=false,holdProgress=false,activityId=7,initialRound,restoredRound,failInitialRead=false,roster,holdRoster=false,rosterProvider='password'}={}){
 const activity=MANAGED_ACTIVITIES.find(a=>a.activity===activityId),catalog=[{...activity,week:activityId,course:'115-g9',codes:[],date:'2026-11-01'},...Array.from({length:3},(_,i)=>({...activity,codes:[],week:20+i,course:'115-g9',title:'合成複習 '+i,date:'2026-10-0'+(i+1)}))];
 const source=process.env.YBS_WORKER_SOURCE;assert.ok(source,'本機驗收須指定 YBS_WORKER_SOURCE');
 const load=p=>import(pathToFileURL(resolve(source,p)).href);
 const [{createFormalWorker},{MemoryFirestore},{readPath},{batchData,privateAnswer},{ENV,CLASS_HINTS,password,paths},{EPOCH,ORIGIN}]=await Promise.all([
  load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal/read-model.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
 let readFailure=failInitialRead,secondFailure=null;let clock=EPOCH,calls=[],throttle=true,waits=[],readsReleased=!holdProgress,release;
 const held=new Promise(resolve=>{release=()=>{readsReleased=true;resolve();};});
 const data=await batchData(clock);if(closed)data[paths.global].activities[7].opensAt=clock+86400000;
 const db=new MemoryFirestore(data,{now:()=>clock,pathValidator:readPath});
 const worker=createFormalWorker({env:{...ENV,FIREBASE_PROJECT_ID:config.firebase.projectId,YBS_PROJECT_ID:config.firebase.projectId},adapter:db,now:()=>clock,verifier:{verify:async uid=>({...password(uid),ybsClassKeys:CLASS_HINTS})}});
 const firebase=await harness();firebase.state.uid='fake-uid-a';firebase.state.owner=false;firebase.state.hints=CLASS_HINTS;
 const rosterReads=[];let releaseRoster;const rosterHeld=new Promise(resolve=>{releaseRoster=resolve;});
 if(roster!==undefined){
  const loginMethod=rosterProvider==='google.com'?'signInWithPopup':'signInWithEmailAndPassword',originalLogin=firebase.auth[loginMethod];
  firebase.auth[loginMethod]=async()=>{
   const credential=await originalLogin();const originalClaims=credential.user.getIdTokenResult;
   credential.user.getIdTokenResult=async()=>{const result=await originalClaims();result.claims.email=rosterProvider==='google.com'?'cgjh9990001@cgjh.hcc.edu.tw':'cgjh9990001@ybslab-edu.github.io';return result;};return credential;
  };
  const originalDoc=firebase.session.db.doc;
  firebase.session.db.doc=path=>!path.includes('/roster/')?originalDoc(path):{get:async options=>{
   rosterReads.push({path,options});if(holdRoster)await rosterHeld;
   if(roster instanceof Error)throw roster;
   return {exists:roster!==null,metadata:{fromCache:!!roster?.fromCache},data:()=>roster};
  }};
 }
 const session=async()=>firebase.session,fetcher=async(url,init)=>{
  const op=new URL(url).pathname.slice(1);const call={op,body:JSON.parse(init.body),at:clock};calls.push(call);
  if(readFailure&&op==='controls')return Response.json({error:'synthetic_unavailable'},{status:503,headers:{'retry-after':'60'}});
  if(op==='context'&&throttle){throttle=false;return Response.json({error:'rate_limited'},{status:429,headers:{'retry-after':'3'}});}
  if(op==='progress'&&!readsReleased&&db.docs.get(paths.head('synthetic-a'))?.completions&&Object.keys(db.docs.get(paths.head('synthetic-a')).completions).length)await held;
  if(op==='answer'&&call.body.slot===1&&secondFailure==='resume-first')return Response.json({error:'synthetic_offline'},{status:503,headers:{'retry-after':'60'}});
  let response=await worker.fetch(new Request('https://synthetic.invalid/'+op,{...init,headers:{'content-type':'application/json',origin:ORIGIN,authorization:'Bearer fake-uid-a'}}));
  if(op==='answer'&&call.body.slot===1&&secondFailure==='lost-second'&&response.ok)response=Response.json({error:'synthetic_lost_response'},{status:503,headers:{'retry-after':'60'}});
  call.status=response.status;call.response=await response.clone().json();call.retryAfter=response.headers.get('retry-after');return response;
 };
 const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher,now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;}});
 const clientOptions={config,session,readModel:model,fetcher,shared:store(),storage:store(),now:()=>clock,events:{addEventListener(){}},schedule:()=>null,cancel:()=>{}};
 let client=createClient(clientOptions);
 const xpContext=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xpContext);const xp=vm.runInContext('YBSXP',xpContext);
 const sessionStore=store();if(restoredRound!==undefined)sessionStore.setItem(`ybs:fullrev:round:${config.firebase.projectId}:115-g9:${activityId}:fake-uid-a`,String(restoredRound));
 const body=new Element('body'),head=new Element('head'),document={body,head,visibilityState:'visible',createElement:tag=>new Element(tag),addEventListener(name,fn){events[name]=fn;}},storage=store();
 const events={};
 for(const [key,value] of Object.entries({document,window:{addEventListener(name,fn){events[name]=fn;}},matchMedia:()=>({matches:true}),ACTIVITIES:catalog,YBSXP:xp,localStorage:storage,sessionStorage:sessionStore})){
  const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
 }
 await mountActivity({client:Promise.resolve(client),cfg:activityConfig({course:'115-g9',week:activityId,title:activity.title})});
 const $=id=>body.querySelector('#'+id),button=label=>body.querySelectorAll('button').find(b=>b.textContent===label);
 const fill=answer=>{answer.forEach((value,k)=>{const field=$('stage').querySelectorAll('input').concat($('stage').querySelectorAll('select')).find(f=>String(f.dataset.answerField)===String(k));field.value=value;field.oninput();});};
 await client.login(rosterProvider==='google.com'?'google':'password','9990001','synthetic-password');
 const retry=async()=>{for(let i=0;i<8&&client.state().pending;i++){const call=calls.at(-1);clock+=Number(call.retryAfter||60)*1000;await client.retry();await tick();}};
 const probeStart=async()=>{const body={...calls.find(c=>c.op==='start').body,round:1,requestId:crypto.randomUUID()};return worker.fetch(new Request('https://synthetic.invalid/start',{method:'POST',headers:{'content-type':'application/json',origin:ORIGIN,authorization:'Bearer fake-uid-a'},body:JSON.stringify(body)}));};
 const result={probeStart,get client(){return client;},db,paths,calls,waits,$,button,fill,answer:()=>privateAnswer(db),release,sessionStore,events,retry,rosterReads,releaseRoster,recover:()=>{readFailure=false;},
  interruptSecond:mode=>{secondFailure=mode;},advance:ms=>{clock+=ms;},
  reload:async()=>{events.pagehide();secondFailure=null;client=createClient(clientOptions);await mountActivity({client:Promise.resolve(client),cfg:activityConfig({course:'115-g9',week:activityId,title:activity.title})});await until(()=>!$('g-isme').hidden);}};
 if(holdRoster){await until(()=>rosterReads.length===1);return result;}
 if(failInitialRead){await until(()=>!$('g-reread').hidden);return result;}
 await until(()=>!$('g-isme').hidden);assert.equal(calls.some(c=>c.op==='start'),false,'確認身分前不可建立作答 session');
 if(initialRound!==undefined)$('g-round').value=initialRound;
 await $('g-isme').onclick();await retry();
 await until(()=>closed?!$('activity-lock').hidden:!!$('stage').dataset.questionType);
 if(!closed)await until(()=>!!client.state().snapshot);
 return result;
}
const ownRoster={schemaVersion:1,subject:'synthetic-a',cls:917,seat:5,active:true};
test('本人單筆名冊顯示班座、同控制版本不重讀，換人清除',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{roster:ownRoster});
 assert.equal(h.$('who').textContent,'917 班 5 號');assert.equal(h.$('g-whotext').textContent,'你是 917 班 5 號，對嗎？');
 assert.deepEqual(h.rosterReads,[{path:'ybsCourses/115-g9/roster/cgjh9990001@cgjh.hcc.edu.tw',options:{source:'server'}}]);
 const count=h.calls.length;h.events.focus();await until(()=>h.calls.length>=count+3);await tick();
 assert.equal(h.rosterReads.length,1,'focus 不增加本人名冊讀取');
 h.db.docs.get(h.paths.global).gateVersion++;
 h.events.focus();await until(()=>h.rosterReads.length===2);await tick();
 assert.equal(h.$('who').textContent,'917 班 5 號','控制版本改變須重新確認班座');
 await h.client.logout();assert.equal(h.$('who').textContent,'');assert.equal(h.$('g-whotext').textContent,'');
});
test('Google 學生使用自己的學校 email 讀取班座',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{roster:ownRoster,rosterProvider:'google.com'});
 assert.equal(h.$('who').textContent,'917 班 5 號');assert.equal(h.rosterReads.length,1);
 assert.equal(h.rosterReads[0].path,'ybsCourses/115-g9/roster/cgjh9990001@cgjh.hcc.edu.tw');
 await h.client.logout();
});
test('名冊缺失、離線、快取、錯誤 subject 或班座均不顯示他人身分',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const roster of [null,Error('synthetic-offline'),{...ownRoster,fromCache:true},{...ownRoster,subject:'synthetic-other'},
  {...ownRoster,active:false},{...ownRoster,cls:'917'},{...ownRoster,seat:61}]){
  const h=await setup(t,{roster});assert.equal(h.$('who').textContent,'已登入');assert.equal(h.$('g-isme').hidden,false);
  assert.equal(h.rosterReads.length,1);await h.client.logout();
 }
});
test('本人名冊遲到回應不得在登出後回填班座',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{roster:ownRoster,holdRoster:true});
 await h.client.logout();h.releaseRoster();await tick();await tick();
 assert.equal(h.$('who').textContent,'');assert.equal(h.$('g-whotext').textContent,'');assert.equal(h.$('main').hidden,true);
});
test('u2-05 四關：真實 Worker、舊版 DOM、429 自動恢復、錯答修正、兩組確認及可信 XP',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t);assert.ok(h.waits.includes(3000));assert.equal(h.$('gate').hidden,true);assert.equal(h.$('main').hidden,false);
 assert.ok(h.$('task-instructions'));assert.equal(h.button('重試上傳').hidden,true);assert.equal(h.button('重新開始').hidden,true);
 for(let r=0;r<4;r++){
  if(r){await h.button('下一關').onclick();await h.retry();assert.equal(h.$('stage').dataset.round,r);await until(()=>h.$('stage').querySelectorAll('[data-answer-field]').length>0);}
  const inputs=h.$('stage').querySelectorAll('[data-answer-field]'),correct=h.answer(),wrong=structuredClone(correct);wrong[0]=typeof wrong[0]==='number'?wrong[0]+1:'合成錯答';
  h.fill(wrong);await h.button('送出').onclick();await h.retry();assert.equal(h.$('verdict').querySelector('h3').textContent,'還不對');assert.equal(h.$('stage').querySelectorAll('[data-answer-field]')[0],inputs[0]);assert.equal(h.button('送出').disabled,true);
  const feedback=h.calls.findLast(c=>c.op==='answer'&&c.status===200).response.feedback;
  assert.ok(feedback,'志工錯答須提供 Worker 回饋');assert.ok(h.$('verdict').textContent.includes(feedback));assert.equal(String(inputs[0].value),String(wrong[0]),'錯答後保留原輸入');assert.match(h.$('verdict').textContent,/修改答案後再送一次/);
  assert.match(h.$('hint-content').textContent,/第 1 層：方向/);assert.match(h.$('streak').textContent,/0\/2/);
  h.fill(correct);await h.button('送出').onclick();await h.retry();assert.match(h.$('verdict').textContent,/答對了！累積答對 1\/2/);assert.equal(h.button('送出').disabled,true);assert.equal(h.$('stage').dataset.slot,0);
  const firstQuestion=structuredClone(h.db.docs.get(h.paths.head('synthetic-a')).activeSession.questions[0].data);
  h.button('下一組').onclick();assert.equal(h.$('stage').dataset.slot,1);assert.notDeepEqual(h.db.docs.get(h.paths.head('synthetic-a')).activeSession.questions[1].data,firstQuestion);assert.equal(h.button('送出').disabled,true);
  h.fill(h.answer());await h.button('送出').onclick();await h.retry();await until(()=>h.$('verdict').querySelector('h3')?.textContent==='過關！');
  assert.match(h.$('verdict').textContent,/本關 XP：\+10 過關、\+5 準時/);assert.match(h.$('streak').textContent,/2\/2/);
  assert.equal([...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,r+1);
 }
 assert.match(h.$('verdict').textContent,/\+20 全過/);assert.match(h.$('verdict').textContent,/全部過關/);assert.equal(h.$('rounds').querySelectorAll('.passed').length,4);
 assert.equal(h.$('xp-total').textContent,'80 XP');assert.equal(h.calls.filter(c=>c.op==='answer'&&c.status===200).length,12);
 assert.ok(h.calls.some(c=>c.op==='answer'&&c.status===429),'須實際碰到每 subject 60 秒 6 次限制');
 console.log('u2-05 mock Worker: 4/4 rounds, 12 accepted answers, subject 6/60s -> 429 -> Retry-After -> 200, 4 validated results, 80 XP');
});
test('Worker 未開放顯示舊遮罩，F12 移除遮罩不能取得題面或過關',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{closed:true});assert.equal(h.$('main').hidden,true);assert.match(h.$('activity-lock').textContent,/這個活動還沒開放/);
 await assert.rejects(h.client.start(7,0),{code:'not-open'});assert.equal(h.calls.some(c=>c.op==='start'),false);assert.equal([...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
});
test('completed 回條尚未確認進度時不出現過關或 XP；登出後延遲讀取不能補回畫面',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{holdProgress:true});h.fill(h.answer());await h.button('送出').onclick();await h.retry();h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();await h.retry();
 await until(()=>h.calls.filter(c=>c.op==='progress').length===3);assert.notEqual(h.$('verdict').querySelector('h3')?.textContent,'過關！');assert.equal(h.$('xp-total').textContent,'0 XP');
 await h.client.logout();h.release();await tick();await tick();assert.equal(h.$('main').hidden,true);assert.equal(h.$('stage').textContent,'');assert.equal(h.$('xp-header').hidden,true);
});

test('試算表活動使用同一外框與原 renderer，不帶問卷專用文案',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{activityId:8});
 assert.equal(h.$('activity-title').textContent,MANAGED_ACTIVITIES.find(a=>a.activity===8).title);
 assert.doesNotMatch(h.$('main').textContent,/做一份可以填寫的問卷|前測完成前/);
 h.fill(h.answer());await h.button('送出').onclick();await h.retry();assert.equal(h.$('verdict').className,'verdict mid');
 h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();await h.retry();await until(()=>h.$('verdict').className==='verdict ok');
 assert.equal(h.$('xp-total').textContent,'15 XP');
});

test('問卷、試算表與媒體的備用紀錄只存本機，不送出或採計',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const activityId of [7,8,9]){
  const h=await setup(t,{activityId,...(activityId===7?{initialRound:1}:{})}),calls=h.calls.length;
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

test('未完成切關續作原關，錯答與第一組答對均不觸發 another_round_active',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t),nav=()=>h.$('rounds').querySelectorAll('button');
 const conflict=await h.probeStart();assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'another_round_active'});
 const original=h.$('stage').querySelector('[data-answer-field]');h.fill(h.answer());const filled=original.value;
 const starts=h.calls.filter(c=>c.op==='start').length;
 await nav()[2].onclick();assert.equal(original.value,filled);assert.equal(h.$('stage').dataset.round,0);assert.match(h.$('sync').textContent,/請先完成第 1 關/);
 assert.equal(h.calls.filter(c=>c.op==='start').length,starts);assert.notEqual(h.client.state().status,'restart-required');
 const wrong=structuredClone(h.answer());wrong[0]++;h.fill(wrong);await h.button('送出').onclick();await h.retry();await nav()[1].onclick();assert.equal(h.$('verdict').className,'verdict no');assert.equal(h.$('stage').querySelector('[data-answer-field]'),original);
 h.fill(h.answer());await h.button('送出').onclick();await h.retry();await nav()[1].onclick();assert.equal(h.$('stage').dataset.slot,0);assert.match(h.$('streak').textContent,/1\/2/);
 h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();await h.retry();await until(()=>h.$('verdict').className==='verdict ok');
 await nav()[2].onclick();await h.retry();assert.equal(h.$('stage').dataset.round,2);assert.ok(!h.calls.some(c=>c.response?.error==='another_round_active'));console.log('unfinished switch: raw /start 409 another_round_active reproduced; UI keeps answers and 1/2, then switches after completion without restart-required');
});
test('照片與排卡重整：待送第二槽仍須續傳同關、恢復題面與唯一可信過關',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const activityId of [1,3])for(const interruption of ['resume-first','lost-second'])await t.test(`${activityId}:${interruption}`,async t=>{
  const h=await setup(t,{activityId});
  try{
   const answer=h.answer(),starts=h.calls.filter(c=>c.op==='start').length;
   h.interruptSecond(interruption);await h.client.answer(activityId,0,answer);
   await until(()=>h.client.state().status==='pending');assert.equal(h.client.state().pending,true);
   const validated=()=>[...h.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length;
   assert.equal(validated(),interruption==='lost-second'?1:0);assert.equal(h.$('xp-total').textContent,'0 XP');
   // 作答頁待送時切關、重開或重按同關，都須保留原題面與原請求。
   const question=h.$('stage').firstChild,requests=h.calls.length;
   for(const i of [0,1])await h.$('rounds').querySelectorAll('button')[i].onclick();
   await h.button('重新開始').onclick();assert.equal(h.$('stage').firstChild,question);assert.equal(h.calls.length,requests);
   const pending=h.calls.filter(c=>c.op==='answer'&&c.body.slot===1).at(-1).body;
   await h.reload();assert.equal(h.client.state().pending,true);assert.equal(h.$('stage').textContent,'');
   h.advance(61000);await h.$('g-isme').onclick();
   assert.equal(h.$('gate').hidden,true);assert.equal(h.$('main').hidden,false);
   assert.equal(h.$('stage').dataset.questionType,'finite-bank-v1','續傳後須恢復可見題面');
   assert.ok(h.$('stage').childNodes.length>0,'題面不可只有殘留 data 屬性');
   await until(()=>h.$('verdict').querySelector('h3')?.textContent==='過關！');
   assert.equal(h.$('xp-total').textContent,'15 XP');assert.equal(validated(),1);
   assert.equal(h.calls.filter(c=>c.op==='start').length,starts,'還原待送時不可另建 session');
   const answers=h.calls.filter(c=>c.op==='answer');for(const call of answers)assert.deepEqual(call.body.answer,answer);
   assert.deepEqual(answers.filter(c=>c.body.slot===1).at(-1).body,pending,'續傳須沿用原 requestId 與答案');
   if(activityId===3)assert.equal(h.$('stage').querySelectorAll('canvas[data-photo]').length,2);
   else{const frame=h.$('stage').querySelector('[data-performance-frame]');assert.ok(frame);h.button('下一步').onclick();assert.equal(frame.dataset.performanceFrame,1);}
   await h.client.logout();assert.equal(h.$('stage').textContent,'');
  }finally{h.events.pagehide();}
 });
});
test('首次讀取耗盡後，focus 與登入區重新讀取均恢復開始鈕',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const method of ['focus','button']){
  const h=await setup(t,{failInitialRead:true});assert.deepEqual(h.waits,[60000,60000,60000]);assert.equal(h.calls.filter(c=>c.op==='controls').length,4);
  assert.equal(h.$('g-isme').hidden,true);assert.equal(h.$('main').hidden,true);assert.equal(h.$('g-reread').closest('#g-who').hidden,false);
  h.recover();if(method==='focus')h.events.focus();else await h.$('g-reread').onclick();await until(()=>!h.$('g-isme').hidden);
  assert.equal(h.$('g-reread').hidden,true);await h.$('g-isme').onclick();await h.retry();assert.equal(h.$('gate').hidden,true);assert.ok(h.$('stage').querySelector('[data-answer-field]'));
 }
});
test('暖身與成果題面保留舊版表格、圖表排列，不使用手機卡片表格',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t);assert.match(h.$('warmup').textContent,/開場暖身 3 題/);
 assert.ok(h.$('stage').querySelector('.quest-note'));assert.ok(h.$('stage').querySelector('.quest-work'));
 const chart=h.$('stage').querySelector('section[aria-label="職務第一志願比較（人）"]');assert.ok(chart);assert.equal(chart.childNodes.length,7);assert.ok(h.$('stage').querySelector('.quest-table'));
 const calls=h.calls.length;h.button('開始暖身').onclick();assert.match(h.$('warmup').textContent,/暖身 1／3/);h.button('還記得').onclick();assert.match(h.$('warmup').textContent,/暖身 2／3/);h.button('跳過暖身').onclick();assert.equal(h.$('warmup').hidden,true);assert.equal(h.calls.length,calls);
 await h.client.logout();assert.equal(h.$('warmup').hidden,false);assert.match(h.$('warmup').textContent,/開場暖身 3 題/);
});


test('公開說明逐段與舊 qCommon 相同，摺疊預設關閉，成果排列與題面版本一致',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 for(const activityId of [7,8,9]){
  const h=await setup(t,{activityId}),note=h.$('stage').querySelector('.quest-note');
  const page=await readFile(new URL(`../115-g9/u2-0${activityId-2}/index.html`,import.meta.url),'utf8');
  const old=new Element('div');old.innerHTML=page.match(/const qCommon='(.*?)';/)[1];
  assert.deepEqual(note.childNodes.map(n=>n.outerHTML??n.textContent),old.firstChild.childNodes.map(n=>n.outerHTML??n.textContent),'公開說明包含段落、既有紀錄摺疊及課堂安排');
  if(activityId===7)assert.doesNotMatch(note.textContent,/虛構|示意資料|後援會|2-13|前測|半成品|巡堂|待確認/);
  else assert.ok(!note.querySelector('details').open,'既有紀錄預設摺疊');
  assert.equal(h.$('warmup').hidden,false,'預設不得跳過暖身');
  assert.equal(h.$('activity-tools').hidden,true,'一般學生不顯示空的教師工具選單');
  assert.equal(h.$('sync').textContent,'✓ 雲端紀錄已確認');assert.equal(h.$('sync').className,'sync ok');
  assert.equal(h.$('who').textContent,'已登入','目前學生 Worker 回應無班座，不可從 subject 或 classKey 猜測');
  const session=h.db.docs.get(h.paths.head('synthetic-a')).activeSession,d=session.questions[0].data;
  const task=d.guide.match(/任務\s+(\d+-\d+)/)[1],work=h.$('stage').querySelector('.quest-work');
  assert.equal(work.firstChild.textContent,(activityId===7?'委託任務 ':'示意任務 ')+task);
  const answers=work.querySelector('.quest-answers');assert.equal(answers.querySelectorAll('label').length,d.questions.length);
  const children=work.childNodes.filter(n=>n.nodeType===1),fallback=work.querySelector('.quest-fallback');
  assert.equal(children.at(-1),answers);
  if(activityId===7)assert.equal(fallback,null,'志工第 1 關只讀表，不顯示備用素材');
  else{assert.ok(fallback);assert.equal(fallback.hidden,false);assert.equal(answers.previousElementSibling,fallback);}
  if(activityId===7){
   assert.deepEqual(children.map(n=>n.tagName),['H3','DIV','SECTION','DIV']);
   assert.equal(d.mode,'form-volunteer-summary');
   assert.equal(children[2].getAttribute('aria-label'),'職務第一志願比較（人）');
   assert.equal(children[2].childNodes.length-1,d.chartRows.length);
   assert.ok(!work.textContent.includes(d.passages.join('')),'不再重述任務目標');
  }
 }
});
test('待送且零筆過關時，focus 與切回頁面重讀仍保留待送提示',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t);
 h.fill(h.answer());await h.button('送出').onclick();await h.retry();h.button('下一組').onclick();
 h.interruptSecond('resume-first');h.fill(h.answer());await h.button('送出').onclick();
 assert.equal(h.client.state().pending,true);
 for(const event of ['focus','visibilitychange']){
  const count=h.calls.filter(c=>c.op==='progress').length;
  h.events[event]();await until(()=>h.calls.filter(c=>c.op==='progress').length>count&&h.client.state().snapshot!==null);await tick();
  assert.equal(h.client.state().snapshot.records.length,0);
  assert.equal(h.client.state().pending,true);
  assert.match(h.$('sync').textContent,/上傳中.*答案已保留/);
  assert.doesNotMatch(h.$('sync').textContent,/已確認|已上傳/);
  assert.equal(h.$('b-retry').hidden,false);
 }
 h.interruptSecond(null);await h.retry();await until(()=>h.$('verdict').className==='verdict ok');
 assert.equal(h.$('sync').textContent,'✓ 紀錄已上傳給老師');
});
test('確認過關才顯示舊版上傳成功文案，換人清除狀態與成長區',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const h=await setup(t,{holdProgress:true});
 assert.match(h.$('xp-level').textContent,/^Lv 1 /);assert.equal(h.$('xp-progress').hidden,false);
 h.fill(h.answer());await h.button('送出').onclick();await h.retry();h.button('下一組').onclick();h.fill(h.answer());await h.button('送出').onclick();await h.retry();
 await until(()=>h.calls.filter(c=>c.op==='progress').length===3);
 assert.match(h.$('sync').textContent,/上傳中/);assert.doesNotMatch(h.$('sync').textContent,/紀錄已上傳給老師/);
 h.release();await until(()=>h.$('verdict').className==='verdict ok');
 assert.equal(h.$('sync').textContent,'✓ 紀錄已上傳給老師');assert.equal(h.$('sync').className,'sync ok');
 await h.client.logout();assert.equal(h.$('sync').hidden,true);assert.equal(h.$('xp-header').hidden,true);
});
test('截圖腳本新舊均保留暖身並等待成長紀錄完成載入',async()=>{
 const source=await readFile(new URL('../tools/dev/capture-fullrev-oldlook.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/skip\.click\(|name:'跳過暖身'/);
 assert.equal(source.match(/page\.locator\('#warmup'\)\.waitFor\(\)/g).length,2);
 const mock=await readFile(new URL('../tools/dev/firebase-mock.js',import.meta.url),'utf8');
 const context=vm.createContext({sessionStorage:store(),queueMicrotask});vm.runInContext('window=globalThis',context);
 const helper=source.match(/function oldXPQueryMock\(\)\{([\s\S]*?)\n\}/)[0];
 vm.runInContext(mock+'\n'+helper+'\noldXPQueryMock();',context);
 const db=vm.runInContext('firebase.initializeApp({}).firestore()',context);
 const empty=await db.collection('ybsCourses/115-g9/attempts').where('uid','==','synthetic-a').get();
 assert.equal(empty.metadata.fromCache,false);assert.equal(empty.docs.length,0,'空紀錄也應確認載入完成');
 const documents=vm.runInContext('__firebaseMock.documents',context);
 documents.set('ybsCourses/115-g9/attempts/a',{uid:'synthetic-a'});
 documents.set('ybsCourses/115-g9/attempts/b',{uid:'synthetic-b'});
 const result=await db.collection('ybsCourses/115-g9/attempts').where('uid','==','synthetic-a').get();
 assert.equal(result.metadata.fromCache,false);assert.equal(result.docs.length,1);assert.equal(result.docs[0].data().uid,'synthetic-a');
 assert.match(source,/xp-total.*endsWith\(' XP'\)/);
});
