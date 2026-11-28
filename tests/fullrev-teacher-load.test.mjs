import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element} from './fixtures/activity-dom.mjs';
import {activities,snapshot,config} from './fixtures/fullrev.mjs';
import {mountTeacherPanel} from '../assets/fullrev-teacher-page.mjs';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',context);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function panel(t,{teacherSnapshots,xpCore=async()=>context.xp}={}){
 const previous=new Map(['document','localStorage','XLSX'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let downloads=0,subscriber,profile={uid:'synthetic-owner'};const cleanup=[];
 globalThis.document={head:new Element('head'),createElement:tag=>{const el=new Element(tag);if(tag==='a')el.click=()=>{downloads++;};return el;}};
 globalThis.localStorage={getItem:()=>null,setItem(){}};
 globalThis.XLSX={utils:{book_new:()=>({}),book_append_sheet(){},aoa_to_sheet:rows=>rows},write:()=>new Uint8Array([0])};
 const p={root:new Element('main'),tools:new Element('div'),status:new Element('p'),content:new Element('div'),
  client:{project:config.firebase.projectId,course:'115-g9',state:()=>({profile})},active:()=>true,
  cleanup:fn=>cleanup.push(fn),subscribe:(_client,fn)=>{subscriber=fn;}};
 mountTeacherPanel(p,{catalog:()=>activities,xpCore,teacherSnapshots,mountHistory:()=>({clear(){}}),eventsRefresh(){},explain:e=>e.message});
 t.after(()=>{cleanup.forEach(fn=>fn());for(const [key,value] of previous)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];});
 const buttons=p.tools.querySelectorAll('button');
 return {p,read:buttons[0],download:buttons[1],later:buttons[2],classKey:p.tools.querySelector('input'),downloads:()=>downloads,
  emit:state=>subscriber({profile,...state}),logout(){profile=null;subscriber({profile});}};
}
test('同班連點讀取／下載共用同一 Promise、一次整班結果與一次匯出；投影期間仍停用',async t=>{
 const held=deferred(),xp=deferred();let calls=0;
 const h=panel(t,{teacherSnapshots:()=>{calls++;return held.promise;},xpCore:()=>xp.promise});
 h.classKey.value='c901';const first=h.read.onclick(),second=h.read.onclick(),download=h.download.onclick();
 assert.equal(h.read.disabled,true);assert.equal(h.download.disabled,true);
 assert.equal(first,second);assert.equal(first,download);assert.equal(calls,1);
 assert.match(h.p.status.textContent,/正在確認/);assert.equal(h.later.hidden,false);
 held.resolve([snapshot()]);await Promise.resolve();assert.equal(h.read.disabled,true);
 xp.resolve(context.xp);await first;
 assert.equal(h.downloads(),1);assert.equal(h.p.content.querySelectorAll('tbody tr').length,1);
 assert.equal(h.read.disabled,false);assert.equal(h.download.disabled,false);assert.equal(h.later.hidden,true);
});
test('同班重複操作保留 #106 倒數與稍後重查；取消後可以重新查詢',async t=>{
 const held=deferred();let signal,calls=0;
 const h=panel(t,{teacherSnapshots:(_c,_key,_a,options)=>{calls++;signal=options.signal;return calls===1?held.promise:Promise.resolve([snapshot()]);}});
 h.classKey.value='c901';const old=h.read.onclick();
 h.emit({readingRetry:{classKey:'c901',operation:'controls',attempt:1,retryAt:Date.now()+60000}});
 const message=h.p.status.textContent;assert.match(message,/第 1 次重試/);
 assert.equal(h.download.onclick(),old);assert.equal(h.p.status.textContent,message);assert.equal(calls,1);
 h.later.onclick();assert.equal(signal.aborted,true);assert.equal(h.read.disabled,false);assert.equal(h.download.disabled,false);
 const fresh=h.read.onclick();held.resolve([snapshot()]);await old;await fresh;
 assert.equal(calls,2);assert.equal(h.downloads(),0);assert.match(h.p.status.textContent,/已確認/);
});
for(const failure of [false,true])test(`切班後晚到的舊${failure?'失敗':'成功'}不覆蓋新班、匯出或提前解鎖新查詢`,async t=>{
  const first=deferred(),next=deferred(),signals=[];
  const h=panel(t,{teacherSnapshots:(_c,key,_a,options)=>{signals.push(options.signal);return key==='c901'?first.promise:next.promise;}});
  h.classKey.value='c901';const old=h.download.onclick();
  h.classKey.value='c902';h.classKey.oninput();assert.equal(signals[0].aborted,true);
  const current=h.read.onclick();failure?first.reject(Error('舊錯誤')):first.resolve([snapshot()]);await old;
  assert.equal(h.read.disabled,true);assert.match(h.p.status.textContent,/正在確認/);assert.equal(h.p.content.childNodes.length,0);
  next.resolve([snapshot([],{classKey:'c902',people:[{subject:'synthetic-subject',cls:902,seat:1,provider:'password'}]})]);await current;
  assert.match(h.p.content.textContent,/902 班/);assert.equal(h.downloads(),0);assert.equal(h.read.disabled,false);
});
test('失敗與登出均清除忙碌狀態，舊結果不顯示或下載',async t=>{
 const held=deferred();let calls=0;
 const h=panel(t,{teacherSnapshots:()=>++calls===1?Promise.reject(Error('合成讀取失敗')):held.promise});
 await h.read.onclick();assert.match(h.p.status.textContent,/合成讀取失敗/);assert.equal(h.read.disabled,false);assert.equal(h.download.disabled,false);
 const pending=h.download.onclick();h.logout();assert.equal(h.read.disabled,false);assert.equal(h.later.hidden,true);
 held.resolve([snapshot()]);await pending;assert.equal(h.p.content.childNodes.length,0);assert.equal(h.downloads(),0);
});
