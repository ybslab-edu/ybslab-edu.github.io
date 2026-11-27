import test from 'node:test';
import assert from 'node:assert/strict';
import {mountActivity,mountGrowth,mountTeacher} from '../assets/fullrev-ui.mjs';
import {Element} from './fixtures/activity-dom.mjs';

class Target {
  listeners=new Map();
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  fire(type,event={}){for(const fn of [...(this.listeners.get(type)||[])])fn(event);}
  count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
class DOM extends Element {
  append(...children){for(const child of children)super.append(child);}
  replaceChildren(...children){for(const child of this.childNodes)child.parentElement=null;this.childNodes=[];this.append(...children);}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const view=(extra={})=>({activity:5,round:0,sid:'synthetic',nextSeq:1,question:{slot:0,data:{}},...extra});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function fixture(t){
  const window=new Target(),document=Object.assign(new Target(),{body:new DOM('body'),head:new DOM('head'),visibilityState:'visible',createElement:tag=>new DOM(tag)});
  const timers=new Map(),revoked=[];let timerId=0;
  const globals={URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>revoked.push(url)},XLSX:{utils:{book_new:()=>({}),book_append_sheet(){},aoa_to_sheet:rows=>rows},write:()=>new Uint8Array()},window,document,location:{search:''},YBSXP:{},setTimeout:fn=>{const id=timerId++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  const saved=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  let dispose;
  t.after(()=>{dispose?.();for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const listeners=new Set(),renders=[],calls={progress:0,answer:0};
  let state={profile:{uid:'synthetic',provider:'password'},status:'ready'};
  const client={state:()=>state,subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},restore:async()=>{},
    progress:async()=>{calls.progress++;return {state:'unknown'};},start:async()=>view(),answer:async()=>{calls.answer++;return view();},retry:async()=>[],refreshClaims:async()=>{}};
  const cfg={week:5,title:'合成活動',rounds:[{name:'關卡一'},{name:'關卡二'}],renderQuestion(question,host,api){
    const render={api,disposed:0,ready:true};renders.push(render);host.append(new DOM('input'));
    return {get:()=>7,ready:()=>render.ready,dispose(){render.disposed++;}};
  }};
  const mount=async(kind=mountActivity,source=client)=>{dispose=await kind({client:source,cfg});return dispose;};
  const button=text=>document.body.querySelectorAll('button').find(el=>el.textContent===text);
  const emit=change=>{state={...state,...change};for(const fn of [...listeners])fn(state);};
  return {window,document,timers,revoked,listeners,renders,calls,client,cfg,mount,button,emit};
}

test('重建與重複卸載解除所有全域 listener 和 client 訂閱',async t=>{
  const f=fixture(t);const old=await f.mount();await f.button('開始這一關').onclick();
  assert.equal(f.listeners.size,2);assert.equal(f.window.count(),2);assert.equal(f.document.count(),1);
  const oldRoot=f.document.body.childNodes[0];await f.mount();const text=oldRoot.textContent;
  assert.equal(f.renders[0].disposed,1);assert.equal(f.listeners.size,2);assert.equal(f.window.count(),2);
  const count=f.calls.progress;f.window.fire('focus');f.document.fire('visibilitychange');await flush();assert.equal(f.calls.progress,count+2);
  assert.equal(oldRoot.textContent,text);old();old();assert.equal(f.listeners.size,2);
  f.window.fire('pagehide');f.window.fire('pagehide');assert.equal(f.listeners.size,0);assert.equal(f.window.count(),0);assert.equal(f.document.count(),0);
});

test('切題、錯答保留、下一組及完成都維持 renderer 正確生命週期',async t=>{
  const f=fixture(t);await f.mount();await f.button('開始這一關').onclick();const first=f.renders[0];
  f.client.answer=async()=>view({correct:false,nextSeq:2});await f.button('送出').onclick();assert.equal(first.disposed,0);assert.equal(f.renders.length,1);
  f.client.answer=async()=>view({correct:true,nextSeq:3,question:{slot:1,data:{}}});await f.button('送出').onclick();
  first.api.changed();assert.equal(f.button('送出').disabled,true);
  await f.button('下一組').onclick();assert.equal(first.disposed,1);
  f.renders[1].ready=false;f.renders[1].api.changed();assert.equal(f.button('送出').disabled,true);
  f.renders[1].ready=true;first.api.changed();assert.equal(f.button('送出').disabled,true);
  f.emit({pending:false});f.renders[1].api.changed();assert.equal(f.button('送出').disabled,false);
  f.client.answer=async()=>view({completed:true,nextSeq:4});await f.button('送出').onclick();assert.equal(f.renders[1].disposed,1);
  first.api.changed();assert.equal(f.button('送出').disabled,true);
});

for(const failure of [false,true])test(`切題後忽略舊 start ${failure?'失敗':'成功'}回應`,async t=>{
  const f=fixture(t);await f.mount();const pending=deferred();f.client.start=()=>pending.promise;
  const old=f.button('開始這一關').onclick();f.client.start=async()=>view({round:1,sid:'new'});await f.button('關卡二').onclick();
  const text=f.document.body.textContent;failure?pending.reject(Error('synthetic')):pending.resolve(view());await old;
  assert.equal(f.renders.length,1);assert.equal(f.document.body.textContent,text);
});

for(const failure of [false,true])test(`配對計時器取消且執行中的${failure?'失敗':'成功'}回應不回填示範`,async t=>{
  const f=fixture(t);await f.mount();f.client.start=async()=>view({performanceOrder:[0],question:{slot:1,data:{}}});
  await f.button('開始這一關').onclick();assert.equal(f.timers.size,1);
  await f.button('本機練習／示範').onclick();assert.equal(f.timers.size,0);
  await f.button('開始這一關').onclick();const pending=deferred();f.client.answer=()=>pending.promise;
  const [id,callback]=[...f.timers][0];f.timers.delete(id);const running=callback();
  await f.button('本機練習／示範').onclick();const text=f.document.body.textContent;
  failure?pending.reject(Error('synthetic')):pending.resolve(view());await running;
  assert.equal(f.document.body.textContent,text);assert.equal(f.timers.size,0);
});

for(const kind of [mountGrowth,mountTeacher])test(`${kind.name} 卸載後不處理事件、訂閱或晚到查詢`,async t=>{
  const f=fixture(t);const dispose=await f.mount(kind);const pending=deferred();f.client.progress=()=>pending.promise;
  const running=kind===mountTeacher?f.button('讀取有效紀錄').onclick():f.button('重新讀取').onclick();
  dispose();const text=f.document.body.textContent;pending.reject(Error('synthetic'));await running;
  f.window.fire('focus');f.document.fire('visibilitychange');f.emit({profile:null});
  assert.equal(f.document.body.textContent,text);assert.equal(f.listeners.size,0);assert.equal(f.window.count(),0);assert.equal(f.document.count(),0);
});

test('等待 client 時重建頁面，不替舊頁註冊；初始化失敗也清理',async t=>{
  const f=fixture(t),pending=deferred();const old=f.mount(mountActivity,pending.promise);await f.mount();pending.resolve(f.client);await old;
  assert.equal(f.listeners.size,2);f.window.fire('pagehide');
  await f.mount(mountActivity,Promise.reject(Error('synthetic')));assert.equal(f.listeners.size,0);assert.equal(f.window.count(),0);
});

test('正常配對只排一次，包含 timer ID 為 0，第二組完成後保持停用',async t=>{
  const f=fixture(t);await f.mount();const pair=view({performanceOrder:[0],question:{slot:1,data:{}}});f.client.start=async()=>pair;
  await f.button('開始這一關').onclick();assert.ok(f.timers.has(0));
  f.emit({view:{...pair,nextSeq:2}});await flush();assert.equal(f.timers.size,1);
  f.client.answer=async(activity,round,answer)=>{f.calls.answer++;assert.deepEqual(answer,[0]);return view({completed:true,nextSeq:3});};
  const [id,callback]=[...f.timers][0];f.timers.delete(id);await callback();
  assert.equal(f.calls.answer,1);assert.equal(f.timers.size,0);assert.equal(f.button('送出').disabled,true);
});

for(const failure of [false,true])test(`離頁後忽略等待中的作答${failure?'失敗':'成功'}，舊 changed 也失效`,async t=>{
  const f=fixture(t);await f.mount();await f.button('開始這一關').onclick();
  const pending=deferred();f.client.answer=()=>pending.promise;const send=f.button('送出'),running=send.onclick();
  f.window.fire('pagehide');const text=f.document.body.textContent;assert.equal(f.renders[0].disposed,1);
  failure?pending.reject(Error('synthetic')):pending.resolve(view({nextSeq:2}));await running;f.renders[0].api.changed();
  assert.equal(f.document.body.textContent,text);assert.equal(send.disabled,true);assert.equal(f.renders.length,1);
});

for(const unloadFirst of [false,true])test(`Excel URL ${unloadFirst?'卸載時':'正常延遲'}釋放一次並取消殘留計時器`,async t=>{
  const f=fixture(t);f.client.project='synthetic';f.client.course='115-g9';
  f.client.progress=async()=>({schemaVersion:1,sourceProject:'synthetic',course:'115-g9',state:'confirmed',complete:true,
    controlVersions:{gateVersion:1,classGateVersion:1},records:[],people:[]});
  const dispose=await f.mount(mountTeacher);await f.button('重新確認並下載 Excel').onclick();assert.equal(f.timers.size,1);
  if(!unloadFirst){const [id,callback]=[...f.timers][0];f.timers.delete(id);callback();}
  dispose();dispose();assert.equal(f.timers.size,0);assert.deepEqual(f.revoked,['blob:synthetic']);
});

for(const failure of [false,true])test(`頁面重建後登入${failure?'失敗':'成功'}不觸發舊登入回呼`,async t=>{
  const f=fixture(t);await f.mount();const pending=deferred();f.client.login=()=>pending.promise;
  const running=f.button('學生 Google 登入').onclick(),oldRoot=f.document.body.childNodes[0];
  await f.mount();const oldText=oldRoot.textContent,newText=f.document.body.textContent,reads=f.calls.progress;
  failure?pending.reject(Error('synthetic')):pending.resolve({uid:'synthetic',provider:'password'});await running;
  assert.equal(oldRoot.textContent,oldText);assert.equal(f.document.body.textContent,newText);assert.equal(f.calls.progress,reads);
});

test('BFCache 返回後保留按鈕與訂閱，真正離頁才卸載',async t=>{
  const f=fixture(t);await f.mount();await f.button('開始這一關').onclick();
  const root=f.document.body.childNodes[0],renderer=f.renders[0];
  f.window.fire('pagehide',{persisted:true});f.window.fire('pageshow',{persisted:true});
  assert.equal(f.document.body.childNodes[0],root);assert.equal(renderer.disposed,0);assert.equal(f.listeners.size,2);
  let starts=0;f.client.start=async()=>{starts++;return view({sid:'returned'});};
  await f.button('開始這一關').onclick();assert.equal(starts,1);assert.equal(renderer.disposed,1);
  f.emit({profile:null});assert.equal(f.button('登出／換人').hidden,true);
  f.window.fire('pagehide',{persisted:false});assert.equal(f.listeners.size,0);assert.equal(f.window.count(),0);assert.equal(f.document.count(),0);
});

for(const kind of [mountActivity,mountGrowth])test(`${kind.name} 還原登入暫時失敗後仍可手動登入`,async t=>{
  const f=fixture(t);f.emit({profile:null});f.client.restore=async()=>{throw Error('synthetic-offline');};
  let logins=0;f.client.login=async()=>{logins++;const profile={uid:'synthetic',provider:'google'};f.emit({profile});return profile;};
  const dispose=await f.mount(kind);assert.equal(typeof dispose,'function');
  assert.equal(!!f.button('學生 Google 登入').disabled,false);
  await f.button('學生 Google 登入').onclick();
  assert.equal(logins,1);assert.equal(f.calls.progress,1);assert.equal(f.button('登出／換人').hidden,false);
  if(kind===mountActivity){await f.button('開始這一關').onclick();assert.equal(f.renders.length,1);}
  dispose();assert.equal(f.listeners.size,0);assert.equal(f.window.count(),0);assert.equal(f.document.count(),0);
});
