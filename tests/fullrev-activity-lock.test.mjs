// 合成身分、時鐘與 DOM；不連網、不使用正式教師資料。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mountActivityShell} from '../assets/fullrev-shell.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,store} from './fixtures/fullrev.mjs';
import {teacherPayload} from './fixtures/fullrev-teacher.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const before='2026-11-08T23:58:59+08:00',boundary='2026-11-08T23:59:00+08:00';
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
async function setup(t,{now=before,sub='u2-03',courseOpen=true,missing=false,actualWeek}={}){
 let clock=Date.parse(now);
 const ctx=vm.createContext({Date:class extends Date{static now(){return clock;}},location:{pathname:'/'}});
 vm.runInContext(read('assets/lock.js')+'\n'+read('assets/activities.js')+'\n'+read('assets/xp.js'),ctx);
 const isOpen=vm.runInContext('isActivityOpen',ctx),xp=vm.runInContext('YBSXP',ctx);
 const activity=actualWeek===undefined?{course:'115-g9',week:5,unit:2,title:'合成活動',date:'2026-11-09',href:`115-g9/${sub}/`,codes:[],rounds:['甲']}:vm.runInContext(`ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===${actualWeek})`,ctx);
 const body=new Element('body'),head=new Element('head'),events={};
 const document={body,head,visibilityState:'visible',createElement:tag=>new Element(tag),addEventListener:(key,fn)=>{events[key]=fn;}};
 for(const [key,value] of Object.entries({document,window:{addEventListener:(key,fn)=>{events[key]=fn;}},ACTIVITIES:missing?[]:[activity],COURSES:[{id:'115-g9',open:courseOpen}],isActivityOpen:isOpen,sessionStorage:store()})){
  const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);
 }
 const h=await harness();h.state.owner=false;h.state.snapshot.records=[];
 const cfg={course:'115-g9',week:activity.week,title:activity.title,rounds:[{name:'甲'}],renderQuestion(q,host){host.append(new Element('input'));return {get:()=>7,ready:()=>true};}};
 const mountLogin=async({host})=>{const b=new Element('button');b.dataset.teacherLogin='';b.onclick=()=>h.client.login('owner');host.append(b);};
 await mountActivityShell({client:Promise.resolve(h.client),cfg,mountLogin,xpCore:async()=>xp,explain:e=>e.message});
 return {...h,$:id=>body.querySelector('#'+id),events,advance:()=>{clock=Date.parse(boundary);}};
}
test('未到週次：未登入、學生及匿名身分均鎖；移除遮罩、按開始也不送 start',async t=>{
 const h=await setup(t);
 assert.equal(h.$('activity-lock').hidden,false);assert.equal(h.$('gate').hidden,true);
 assert.match(h.$('activity-lock').textContent,/這個活動還沒開放.*請回到 YBS Lab 首頁，做老師這週指定的活動。.*← 回 YBS Lab 首頁.*教師解鎖/);
 await h.login();await settle();assert.equal(h.$('main').hidden,true);
 h.$('activity-lock').hidden=true;await h.$('g-isme').onclick();await settle();
 assert.equal(h.$('activity-lock').hidden,false);assert.equal(h.requests.length,0);assert.equal(h.$('stage').textContent,'');
 h.$('activity-lock').querySelector('button').click();await h.login();await h.$('g-isme').onclick();assert.equal(h.requests.length,0);
 await h.client.login('guest',{cls:901,seat:1});await settle();assert.equal(h.$('main').hidden,true);assert.equal(h.requests.length,0);
});
test('台灣週日 23:59 起已開放：確認學生身分後才取得題面',async t=>{
 const h=await setup(t,{now:boundary});assert.equal(h.$('activity-lock').hidden,true);
 await h.login();await settle();assert.equal(h.$('g-isme').hidden,false);assert.equal(h.requests.length,0);
 await h.$('g-isme').onclick();await settle();assert.equal(h.$('main').hidden,false);assert.ok(h.$('stage').querySelector('input'));
 assert.equal(h.requests.filter(r=>r.url.endsWith('/start')).length,1);
});
test('實際活動日期：11/24 已開放活動 7 可確認身分並開始，活動 8 仍鎖定',async t=>{
 for(const actualWeek of [7,8]){
  const h=await setup(t,{now:'2026-11-24T12:00:00+08:00',actualWeek});
  await h.login();await settle();
  assert.equal(h.$('activity-lock').hidden,actualWeek===7);assert.equal(h.requests.length,0);
  if(actualWeek===7){
   assert.equal(h.$('g-isme').hidden,false);assert.equal(h.$('main').hidden,true);
   await h.$('g-isme').onclick();await settle();assert.equal(h.$('main').hidden,false);
   assert.equal(h.requests.filter(r=>r.url.endsWith('/start')).length,1);
  }else assert.equal(h.$('gate').hidden,true);
 }
});
test('停留頁面跨越台灣週日邊界：focus 解除鎖定，仍須確認學生身分',async t=>{
 const h=await setup(t);await h.login();h.advance();h.events.focus();await settle();
 assert.equal(h.$('activity-lock').hidden,true);assert.equal(h.$('main').hidden,true);assert.equal(h.$('g-isme').hidden,false);assert.equal(h.requests.length,0);
 await h.$('g-isme').onclick();assert.equal(h.requests.filter(r=>r.url.endsWith('/start')).length,1);
});
test('沿用舊 OPEN 提早開放；課程未開設優先；缺少活動資料保持鎖定',async t=>{
 for(const [options,locked,title] of [[{sub:'u2-02'},false],[{sub:'u2-02',courseOpen:false},true,'本學年未開設這門課'],[{missing:true},true,'這個活動還沒開放']]){
  const h=await setup(t,options);assert.equal(h.$('activity-lock').hidden,!locked);if(title)assert.equal(h.$('activity-lock').querySelector('h1').textContent,title);
 }
});
test('教師解鎖須登入 owner 示範；未開設與未到日期皆可示範，登出重新鎖定',async t=>{
 for(const courseOpen of [true,false]){
  const h=await setup(t,{courseOpen});h.state.owner=true;
  h.state.fetcher=async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});
  h.$('activity-lock').querySelector('button').click();assert.equal(h.$('gate').hidden,false);
  await h.client.login('owner');await settle();assert.equal(h.$('activity-lock').hidden,true);assert.equal(h.$('main').hidden,false);assert.ok(h.$('tbar'));
  assert.deepEqual(h.requests.map(r=>r.url.split('/').at(-1)),['teacher-question']);
  await h.client.logout();assert.equal(h.$('activity-lock').hidden,false);assert.equal(h.$('main').hidden,true);assert.equal(h.$('tbar'),null);
 }
});
