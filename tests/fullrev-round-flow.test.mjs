import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {roundAccess,startWaitMessage} from '../assets/fullrev-shell.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {roundFlow} from './fixtures/fullrev-round-flow.mjs';
import {harness,store,response,config} from './fixtures/fullrev.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}assert.ok(check(),'未到預期狀態');}
async function open(t,options={}){
 const h=await roundFlow(options),body=new Element('body'),events={};
 const xp=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xp);
 const roundStorage=store();if(options.savedRound!==undefined)roundStorage.setItem(`ybs:fullrev:round:${config.firebase.projectId}:115-g9:5:synthetic-student`,String(options.savedRound));
 for(const [key,value] of Object.entries({document:{body,head:new Element('head'),createElement:tag=>new Element(tag),addEventListener:(k,f)=>{events[k]=f;}},window:{addEventListener:(k,f)=>{events[k]=f;options.events?.addEventListener(k,f);}},sessionStorage:roundStorage,localStorage:store(),ACTIVITIES:h.catalog,isActivityOpen:()=>true,YBSXP:vm.runInContext('YBSXP',xp)})){
  const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);
 }
 const $=id=>body.querySelector('#'+id);
 await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg,now:h.now});
 await h.login();if(options.guest)await until(()=>!!$('stage').querySelector('input'));else{await until(()=>!$('g-isme').hidden);await $('g-isme').onclick();}
 t.after(()=>h.client.logout());
 return {...h,$,events,round:i=>$('rounds').querySelectorAll('button')[i]};
}
test('順序判定只看前一關，教師可任選；鎖定原因對你說話',()=>{
 assert.equal(roundAccess(0).locked,false);
 assert.deepEqual(roundAccess(2,{completed:[0]}),{locked:true,reason:'你要先完成第 2 關，才能進入這一關。'});
 assert.equal(roundAccess(2,{completed:[1]}).locked,false);
 assert.equal(roundAccess(3,{owner:true}).locked,false);
});
test('倒數向上取整，結束區分自動重試與手動重試',()=>{
 assert.equal(startWaitMessage({retryAt:2100,automatic:true},1000),'切換太快，請等 2 秒');
 assert.match(startWaitMessage({retryAt:2000,automatic:true},2000),/正在重新載入/);
 assert.match(startWaitMessage({retryAt:2000,automatic:false},2000),/重試上傳/);
});
test('未解鎖點擊不發 start，過關即解鎖下一關；已過回看零請求，重做才 start',async t=>{
 const h=await open(t);assert.equal(h.round(1).disabled,true);assert.match(h.round(1).getAttribute('aria-label'),/你要先完成第 1 關/);assert.equal(h.round(1).textContent,'第 2 關');assert.equal(h.$('round-unlock-hint').hidden,false);
 const n=h.requests.length;await h.round(1).onclick();assert.equal(h.requests.length,n);
 for(let slot=0;slot<2;slot++){
  const input=h.$('stage').querySelector('input');input.value='合成答案';input.oninput();await h.$('b-send').onclick();
  if(slot===0)h.$('b-next-group').onclick();
 }
 await until(()=>h.$('verdict').textContent.includes('過關！'));assert.equal(h.round(1).disabled,false);
 await h.round(1).onclick();assert.equal(h.requests.at(-1).body.round,1);
 const before=h.requests.length;await h.round(0).onclick();assert.equal(h.requests.length,before);assert.match(h.$('stage').textContent,/回看過關摘要/);assert.equal(h.$('b-send').disabled,true);
 await h.$('b-redo').onclick();assert.equal(h.requests.length,before+1);assert.ok(h.requests.at(-1).url.endsWith('/start'));
});
test('登入既有過關結果直接回看，換人即清畫面',async t=>{
 const h=await open(t,{passed:[0,1]});assert.equal(h.requests.length,0);assert.match(h.$('stage').textContent,/你已完成第 1 關/);
 await h.round(1).onclick();assert.equal(h.requests.length,0);assert.match(h.$('stage').textContent,/第 2 關/);
 await h.client.logout();assert.equal(h.$('stage').textContent,'');assert.equal(h.$('main').hidden,true);
});
test('舊選擇未解鎖時回第一關；教師可直接選第四關且不發學生 start',async t=>{
 const h=await open(t,{savedRound:3,owner:true});assert.equal(h.requests.at(-1).body.round,0);assert.equal(h.round(3).disabled,true);
 await h.client.login('owner');await until(()=>h.$('stage').querySelector('#tbar'));
 assert.equal(h.round(3).disabled,false);await h.round(3).onclick();assert.equal(h.requests.at(-1).body.round,3);assert.ok(h.requests.at(-1).url.endsWith('/teacher-question'));
 assert.equal(h.requests.filter(r=>r.url.endsWith('/start')).length,1);
});
test('start 429 採 retryAfter，原 requestId 自動重試一次；連續限速停止自動重送',async()=>{
 const h=await roundFlow({startLimits:3,retryAfter:3});await h.login();
 await assert.rejects(h.client.start(5,0),{code:'pending'});const first=h.requests[0].body;
 assert.equal(h.client.state().startRetry.automatic,true);assert.equal(h.timers.at(-1).ms,3000);
 assert.deepEqual(await h.client.retry({automatic:true}),[]);assert.equal(h.requests.length,1);
 h.advance(3000);await h.timers[0].fn();await until(()=>h.requests.length===2&&h.client.state().status==='pending');
 assert.deepEqual(h.requests[1].body,first);assert.equal(h.client.state().startRetry.automatic,false);assert.equal(h.timers.length,1);
 h.advance(60000);assert.deepEqual(await h.client.retry({automatic:true}),[]);assert.equal(h.requests.length,2);
 await assert.rejects(h.client.retry(),{code:'pending'});assert.equal(h.requests.length,3);
 h.advance();await h.client.retry();assert.equal(h.client.state().startRetry,null);assert.equal(h.client.state().pending,false);
});
test('start 限速等待可見且回看取消待送 start，不在背景重送',async t=>{
 const h=await open(t,{passed:[0],startLimits:1,retryAfter:3});await h.round(1).onclick();assert.match(h.$('start-wait').textContent,/切換太快，請等 3 秒/);
 const before=h.requests.length;await h.round(0).onclick();assert.equal(h.$('start-wait'),null);assert.equal(h.client.state().pending,false);
 h.advance();for(const timer of h.timers)await timer.fn();await tick();assert.equal(h.requests.length,before);
});
test('倒數結束 client 自動恢復題面，隨後輸入仍可暫存；沒有額外 start',async t=>{
 const h=await open(t,{startLimits:1,retryAfter:2});assert.equal(h.$('start-wait').textContent,'切換太快，請等 2 秒');
 const original=h.requests[0].body;h.advance(2000);await h.timers[0].fn();await until(()=>!!h.$('stage').querySelector('input'));
 assert.equal(h.$('start-wait'),null);assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1].body,original);
 const input=h.$('stage').querySelector('input');input.value='恢復後保留的作答';input.oninput();assert.equal(h.client.loadInput(5,0),'恢復後保留的作答');
});
test('回看取消尚未回應的 start，晚到 429 不重新排程',async()=>{
 const h=await roundFlow();await h.login();let release;h.state.fetcher=()=>new Promise(resolve=>{release=resolve;});
 const work=h.client.start(5,0);await until(()=>!!release);h.client.cancelStart();release(Response.json({error:'rate_limited',retryAfter:3},{status:429}));
 await assert.rejects(work,{code:'identity-changed'});assert.equal(h.client.state().pending,false);assert.equal(h.timers.length,0);h.advance();assert.deepEqual(await h.client.retry(),[]);
});
for(const phase of ['context','token','queue'])test(`取消涵蓋 start 的 ${phase} 等待階段，不發 start、不破壞其他作答`,async()=>{
 const h=await roundFlow();await h.login();let release;let waiting;
 if(phase==='queue'){
  await h.client.start(5,0);h.state.fetcher=()=>new Promise(resolve=>{release=()=>resolve(Response.json(response(1,{correct:true})));});
  waiting=h.client.answer(5,0,'合成答案');await until(()=>!!release);
 }else if(phase==='context'){
  const original=h.model.context;h.model.context=input=>new Promise(resolve=>{release=async()=>resolve(await original(input));});
 }else h.auth.currentUser.getIdToken=()=>new Promise(resolve=>{release=()=>resolve('synthetic-token');});
 const before=h.requests.length,work=h.client.start(5,1),rejected=assert.rejects(work,{code:'identity-changed'});
 await until(()=>!!release);h.client.cancelStart();assert.equal(h.requests.length,before);await release();if(waiting)await waiting;await rejected;
 assert.equal(h.requests.length,before);assert.equal(h.client.state().pending,false);assert.equal(h.timers.length,0);
 if(phase==='queue')assert.equal(h.client.savedRound(5),0);
 else{await tick();assert.equal(h.client.savedRound(5),undefined);}
 // 取消只影響已開始的流程；之後明確重做仍可取得題目。
 h.state.fetcher=async()=>Response.json(response());h.auth.currentUser.getIdToken=async()=> 'synthetic-token';
 if(phase==='context')h.model.context=async input=>({schemaVersion:1,sourceProject:config.firebase.projectId,uid:h.state.uid,subject:'synthetic-subject',...input,configVersion:1,bindingVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:{gateVersion:1,classGateVersion:1}});
 await h.client.start(5,1);assert.equal(h.requests.length,before+1);
});
async function finishGuest(h){
 for(let slot=0;slot<2;slot++){const input=h.$('stage').querySelector('input');input.value='合成答案';input.oninput();await h.$('b-send').onclick();if(slot===0)h.$('b-next-group').onclick();}
 assert.equal(h.round(1).disabled,false);assert.match(h.$('verdict').textContent,/已存待審，尚未採計/);
}
test('多次離頁含 client stale 通知，舊外框不得在身分初始化時多發 context',async t=>{
 const events=new EventTarget(),h=await open(t,{guest:true,events});await finishGuest(h);
 const remount=async()=>{
  const count=h.requests.length;events.dispatchEvent(new Event('pagehide'));
  h.client=h.reopen({events});
  await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg,now:h.now});return count;
 };
 const valid=await remount();await until(()=>!!h.$('b-redo'));
 assert.equal(h.round(1).disabled,false);
 assert.deepEqual(h.requests.slice(valid).map(r=>new URL(r.url).pathname),['/guest/context']);
 h.state.guestVersions.roundEpoch++;h.state.guestVersions.controlVersions.classGateVersion++;
 const reset=await remount();await until(()=>!!h.$('stage').querySelector('input'));
 assert.equal(h.round(1).disabled,true);assert.equal(h.$('b-redo'),null);
 assert.deepEqual(h.requests.slice(reset).map(r=>new URL(r.url).pathname),['/guest/context','/guest/context','/guest/start']);
 assert.equal(h.requests.at(-1).body.roundEpoch,1);assert.equal(h.requests.at(-1).body.round,0);
});
test('傳送、斷線待送與重送途中改答案均不能再送，原請求確認後才恢復',async t=>{
 const h=await open(t),input=h.$('stage').querySelector('input'),send=h.$('b-send');
 const fill=value=>{input.value=value;input.oninput();};let release;
 fill('原答案');h.state.fetcher=()=>new Promise(resolve=>{release=resolve;});
 const sending=send.onclick();await until(()=>!!release);const sent=h.requests.length;
 fill('第一次修改');assert.equal(send.disabled,true);await send.onclick();assert.equal(h.requests.length,sent);
 assert.equal(h.requests.at(-1).body.answer,'原答案');
 release(Response.json(response(0,{nextSeq:2,correct:false})));await sending;
 assert.equal(send.disabled,false);assert.equal(input.value,'第一次修改');
 h.state.fetcher=async()=>{throw Error('synthetic-offline');};await send.onclick();
 assert.equal(h.client.state().status,'pending');const original=h.requests.at(-1).body;
 fill('第二次修改');assert.equal(send.disabled,true);await send.onclick();assert.equal(h.requests.length,sent+1);
 h.advance();release=null;h.state.fetcher=()=>new Promise(resolve=>{release=resolve;});
 const retry=h.$('b-retry').onclick();await until(()=>!!release);
 assert.match(h.$('verdict').textContent,/修改答案後再送一次/,'舊提示不能作為重送已完成的證據');
 assert.deepEqual(h.requests.at(-1).body,original);
 fill('第三次修改');assert.equal(send.disabled,true);await send.onclick();assert.equal(h.requests.length,sent+2);
 release(Response.json(response(0,{nextSeq:3,correct:false})));await retry;
 assert.equal(h.client.state().status,'ready');assert.equal(h.client.state().pending,false);
 assert.equal(input.value,'第三次修改');assert.equal(send.disabled,false);
});
for(const [change,extra] of Object.entries({configVersion:{configVersion:2},unitEpoch:{unitEpoch:1},roundEpoch:{roundEpoch:1},classUnitEpoch:{classUnitEpoch:1},gateVersion:{controlVersions:{gateVersion:2,classGateVersion:1}},classGateVersion:{controlVersions:{gateVersion:1,classGateVersion:2}}}))test(`班座完成後教師重設 ${change}，重整不能沿用舊摘要或解鎖`,async t=>{
 const h=await open(t,{guest:true});await finishGuest(h);const count=h.requests.length;
 Object.assign(h.state.guestVersions,extra);h.events.pagehide();const restored=h.reopen();t.after(()=>restored.logout());
 await mountActivity({client:Promise.resolve(restored),cfg:h.cfg,now:h.now});await until(()=>!!h.$('stage').querySelector('input')||!!h.$('b-redo'));
 assert.equal(h.round(1).disabled,true);assert.equal(h.$('b-redo'),null);assert.doesNotMatch(h.$('stage').textContent,/已存待審|回看/);
 assert.deepEqual(h.requests.slice(count).map(r=>new URL(r.url).pathname),['/guest/context','/guest/context','/guest/start']);
 assert.equal(h.requests.at(-1).body.round,0);assert.equal(h.requests.at(-1).body.configVersion,h.state.guestVersions.configVersion);
 assert.equal([...sessionStorage.map.keys()].some(k=>k.endsWith(':guest-completed')),false);
});
test('班座有效摘要重整先等 context 核對，回看零 start 且不保存題面／答案',async t=>{
 const h=await open(t,{guest:true});await finishGuest(h);const count=h.requests.length;let release;
 const savedAt=h.now();h.advance(1000);
 const original=h.state.fetcher;h.state.fetcher=(url,init)=>new Promise(resolve=>{release=async()=>resolve(await original(url,init));});
 h.events.pagehide();const restored=h.reopen();t.after(()=>restored.logout());await mountActivity({client:Promise.resolve(restored),cfg:h.cfg,now:h.now});
 await until(()=>!!release);assert.equal(h.$('b-redo'),null);assert.doesNotMatch(h.$('stage').textContent,/已存待審/);
 assert.ok(h.$('rounds').querySelectorAll('button').every(b=>Number(b.dataset.i)===0||b.disabled));await release();await until(()=>!!h.$('b-redo'));
 assert.equal(h.round(1).disabled,false);assert.deepEqual(h.requests.slice(count).map(r=>new URL(r.url).pathname),['/guest/context']);
 const saved=JSON.parse([...sessionStorage.map].find(([k])=>k.endsWith(':guest-completed'))[1]);
 assert.equal(saved.savedAt,savedAt,'核對不延長摘要的有效期限');
 assert.deepEqual(saved.rounds[0][1].completionContext,h.state.guestVersions);assert.doesNotMatch(JSON.stringify(saved),/"question"|"answer"|synthetic-token/);
});
test('多關摘要核對期間控制版本變動，先核對的舊摘要也不得解鎖',async t=>{
 const h=await open(t,{guest:true});await finishGuest(h);await h.round(1).onclick();await finishGuest(h);
 const count=h.requests.length,original=h.state.fetcher;let contexts=0;
 h.state.fetcher=(url,init)=>{if(url.endsWith('/guest/context')&&++contexts===2)h.state.guestVersions.controlVersions.classGateVersion++;return original(url,init);};
 h.events.pagehide();const restored=h.reopen();t.after(()=>restored.logout());await mountActivity({client:Promise.resolve(restored),cfg:h.cfg,now:h.now});
 await until(()=>!!h.$('stage').querySelector('input'));assert.equal(h.round(1).disabled,true);assert.equal(h.round(2).disabled,true);assert.equal(h.$('b-redo'),null);
 assert.deepEqual(h.requests.slice(count).map(r=>[new URL(r.url).pathname,r.body.round]),[['/guest/context',0],['/guest/context',1],['/guest/context',0],['/guest/start',0]]);
});
test('班座摘要核對失敗不視為完成；舊版無版本摘要也不得解鎖',async t=>{
 const h=await open(t,{guest:true});await finishGuest(h);let fail=true;
 const original=h.state.fetcher;h.state.fetcher=(url,init)=>fail&&url.endsWith('/guest/context')?Response.json({error:'not_open'},{status:403}):original(url,init);
 const count=h.requests.length;h.events.pagehide();const restored=h.reopen();t.after(()=>restored.logout());await mountActivity({client:Promise.resolve(restored),cfg:h.cfg,now:h.now});
 await until(()=>h.requests.length===count+2);await tick();assert.equal(h.round(1).disabled,true);assert.equal(h.$('b-redo'),null);assert.equal(h.requests.slice(count).some(r=>r.url.endsWith('/start')),false);
 fail=false;const summaryKey=`ybs:fullrev:round:${config.firebase.projectId}:115-g9:5:synthetic-student:guest-completed`;
 sessionStorage.setItem(summaryKey,JSON.stringify({savedAt:h.now(),rounds:[[0,{completed:true,status:'pending',verified:false,counted:false,attemptId:'synthetic-seat_5_0_'+'x'.repeat(43)}]]}));
 h.events.pagehide();const legacy=h.reopen();t.after(()=>legacy.logout());await mountActivity({client:Promise.resolve(legacy),cfg:h.cfg,now:h.now});await until(()=>!!h.$('stage').querySelector('input'));
 assert.equal(h.round(1).disabled,true);assert.equal(h.$('b-redo'),null);assert.ok(h.requests.at(-1).url.endsWith('/guest/start'));
});
test('班座完成兩組仍待審且可續下一關；重整回看不 start，換人清除暫存摘要',async t=>{
 const h=await open(t);await h.client.logout();h.state.hints={};
 h.state.fetcher=async(url,init)=>{
  const b=JSON.parse(init.body);
  if(url.endsWith('/guest/context'))return Response.json({...b,schemaVersion:1,sourceProject:config.firebase.projectId,configVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:{gateVersion:1,classGateVersion:1}},{headers:{'cache-control':'no-store'}});
  if(url.endsWith('/answer'))return Response.json(b.slot===0?response(1,{correct:true}):{completed:true,status:'pending',verified:false,counted:false,attemptId:'synthetic-seat_5_0_'+'x'.repeat(43)});
  return Response.json(response());
 };
 await h.client.login('guest',{cls:'901',seat:1});await until(()=>!!h.$('stage').querySelector('input'));
 for(let slot=0;slot<2;slot++){const input=h.$('stage').querySelector('input');input.value='合成答案';input.oninput();await h.$('b-send').onclick();if(slot===0)h.$('b-next-group').onclick();}
 assert.match(h.$('verdict').textContent,/已存待審，尚未採計/);assert.equal(h.round(1).disabled,false);assert.equal(h.$('xp-header').hidden,false);assert.equal(h.$('xp-total').textContent,'10 XP');
 await h.round(1).onclick();const draft=h.$('stage').querySelector('input');draft.value='未送出的合成答案';draft.oninput();const count=h.requests.length;await h.round(0).onclick();assert.equal(h.requests.length,count);
 h.events.pagehide();const restored=h.reopen();await mountActivity({client:Promise.resolve(restored),cfg:h.cfg,now:h.now});
 await until(()=>!!h.$('stage').querySelector('input'));assert.equal(h.requests.length,count+2);assert.deepEqual(h.requests.slice(count).map(r=>new URL(r.url).pathname),['/guest/context','/guest/resume']);assert.equal(h.$('stage').querySelector('input').value,'未送出的合成答案');
 const resumed=h.requests.length;await h.round(0).onclick();assert.equal(h.requests.length,resumed,'還原本人的待審摘要也不發 start');assert.match(h.$('stage').textContent,/已存待審，尚未採計/);
 await restored.logout();assert.equal([...sessionStorage.map.keys()].some(k=>k.endsWith(':guest-completed')),false);
});
test('answer 429 保留答案／原請求且不顯示切關倒數；其他 429 與斷線分類維持',async()=>{
 for(const error of ['rate_limited','storage_busy','storage_quota','unknown']){
  const h=await harness();await h.login();await h.client.start(5,0);
  h.state.fetcher=async()=>Response.json({error,retryAfter:9},{status:429,headers:{'retry-after':'3'}});
  await assert.rejects(h.client.answer(5,0,'保留合成答案'),{code:'pending'});assert.equal(h.client.state().startRetry,null);
  const original=h.requests.at(-1).body;assert.equal(original.answer,'保留合成答案');h.advance();h.state.fetcher=async()=>Response.json(response());await h.client.retry();assert.deepEqual(h.requests.at(-1).body,original);
 }
 for(const error of ['storage_busy','storage_quota','unknown','offline']){
  const h=await roundFlow({otherError:error});await h.login();await assert.rejects(h.client.start(5,0),{code:'pending'});assert.equal(h.client.state().startRetry,null);
  assert.equal(h.client.state().uploadIssue,error==='storage_busy'?'rate-limited':error==='offline'?'connection-failed':'storage-quota');
 }
});
