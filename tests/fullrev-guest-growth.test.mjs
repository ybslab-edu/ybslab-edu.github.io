import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {roundFlow} from './fixtures/fullrev-round-flow.mjs';
import {opened,response} from './fixtures/fullrev.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {mountActivity,mountGrowth} from '../assets/fullrev-ui.mjs';

const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),context);
const xp=vm.runInContext('YBSXP',context),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.ok(check(),'班座成長未到預期狀態');}
async function guest(){
  const h=await roundFlow({guest:true});
  h.catalog=h.catalog.map(a=>({...a,openedAt:opened,isOpen:true,date:'2026-11-01',href:'115-g9/synthetic/',topic:'你的小挑戰'}));
  h.catalog.push({...h.catalog[0],week:6,title:'另一個合成活動',href:'115-g9/synthetic-next/'});
  h.growth=client=>(client||h.client).guestGrowth({activities:h.catalog,xp});
  return h;
}
async function complete(h,activity=5,round=0,client=h.client){
  await client.start(activity,round,{restart:true});
  await client.answer(activity,round,'合成答案');return client.answer(activity,round,'合成答案');
}

test('班座 XP 初始 Lv 1／0；只在本次兩組完成後增加，沿用準時、全過與升級規則',async()=>{
  const h=await guest();await h.login();
  assert.equal(h.growth().level,1);assert.equal(h.growth().totalXP,0);
  assert.equal(h.requests.length,0);assert.deepEqual(h.reads,[]);
  await h.client.start(5,0);
  const original=h.state.fetcher;
  h.state.fetcher=async()=>Response.json(response(0,{correct:false,nextSeq:2}));
  await h.client.answer(5,0,'合成錯答');assert.equal(h.growth().totalXP,0);
  h.state.fetcher=original;await h.client.answer(5,0,'合成答案');assert.equal(h.growth().totalXP,0);
  await h.client.answer(5,0,'合成答案');assert.equal(h.growth().totalXP,15);
  for(let round=1;round<4;round++)await complete(h,5,round);
  assert.equal(h.growth().totalXP,80);assert.equal(h.growth().activities[0].completeXP,20);
  for(let round=0;round<4;round++)await complete(h,6,round);
  assert.equal(h.growth().totalXP,160);assert.equal(h.growth().level,2);
  assert.equal(h.growth().remaining,xp.levelOf(160).remaining);
  assert.equal(h.client.state().snapshot,null);assert.deepEqual(h.growth().records,[]);
  assert.ok(h.requests.every(r=>new URL(r.url).pathname.startsWith('/guest/')));
  assert.ok(h.requests.every(r=>!Object.keys(r.body).some(k=>/xp|growth|subject|result/i.test(k))));
  assert.doesNotMatch([...h.shared.map.values()].join(''),/guestXP|"at"/);
  assert.deepEqual(h.reads,[]);
});

test('重做不重領；重整／跨頁保留本次 XP；同班座再登入及換人從 0 開始',async()=>{
  const h=await guest();await h.login();await complete(h);
  await complete(h);assert.equal(h.growth().totalXP,15);
  const restored=h.reopen();await restored.restore();const calls=h.requests.length;
  assert.equal(h.growth(restored).totalXP,15);assert.equal(h.requests.length,calls);
  assert.doesNotMatch([...h.storage.map.values()].join(''),/synthetic-token|"subject"|"question"|"resultId"/);
  await restored.logout();assert.equal(h.storage.map.size,0);
  await restored.login('guest',{cls:'901',seat:1});assert.equal(h.growth(restored).totalXP,0);
  await complete(h,5,0,restored);assert.equal(h.growth(restored).totalXP,15);
  await restored.login('guest',{cls:'902',seat:2});assert.equal(h.growth(restored).totalXP,0);
  await restored.logout();assert.throws(()=>h.growth(restored),{code:'login-required'});
});

test('本次登入前的待審 start／resume 回條不補 XP；正式 progress 仍不開放給班座',async()=>{
  const h=await guest();await h.login();const original=h.state.fetcher;
  h.state.fetcher=async(url,init)=>url.endsWith('/guest/context')?original(url,init):Response.json({
    completed:true,status:'pending',verified:false,counted:false,attemptId:'synthetic-seat_5_0_'+'x'.repeat(43)});
  await h.client.start(5,0);assert.equal(h.growth().totalXP,0);
  const calls=h.requests.length;
  await assert.rejects(h.client.progress({activities:h.catalog}),{code:'guest-pending'});
  assert.equal(h.requests.length,calls);assert.deepEqual(h.reads,[]);
});

test('遺失完成回應後重整重試，只在收到成功回條後累積一次；本機歷史零雲端請求',async()=>{
  const h=await guest();await h.login();await h.client.start(5,0);await h.client.answer(5,0,'合成答案');
  const original=h.state.fetcher;h.state.fetcher=async()=>{throw Error('synthetic-offline');};
  await assert.rejects(h.client.answer(5,0,'合成答案'),{code:'pending'});assert.equal(h.growth().totalXP,0);
  h.state.fetcher=original;h.advance();const restored=h.reopen();await restored.restore();await restored.retry();
  assert.equal(h.growth(restored).totalXP,15);const calls=h.requests.length;
  const history=await restored.history({classKey:'do-not-read',subject:'do-not-read'});
  assert.equal(history.local,true);assert.equal(history.records.length,1);assert.equal(history.records[0].validity.state,'pending');
  assert.deepEqual((await restored.history({kind:'legacy'})).records,[]);
  assert.equal(h.requests.length,calls);assert.deepEqual(h.reads,[]);
});

test('跨分頁換人使舊本機 XP 失效；正式學生不能使用班座展示 XP',async()=>{
  const h=await guest();await h.login();await complete(h);assert.equal(h.growth().totalXP,15);
  const other=h.reopen();await other.restore();await other.logout();
  assert.throws(()=>h.growth(),{code:'login-required'});assert.equal(h.client.state().profile,null);
  await h.client.login('password','9990001','synthetic-password');
  assert.throws(()=>h.growth(),{code:'guest-seat-required'});
});

class ViewElement extends Element {
  removeAttribute(key){delete this[key];}
  insertAdjacentHTML(position,html){super.insertAdjacentHTML(position,html);
    const upgrade=el=>{Object.setPrototypeOf(el,ViewElement.prototype);for(const c of el.childNodes.filter(n=>n.nodeType===1))upgrade(c);};
    for(const c of this.childNodes.filter(n=>n.nodeType===1))upgrade(c);
  }
}
async function page(t){
  const h=await guest(),body=new ViewElement('body'),head=new ViewElement('head'),events={};
  const doc={body,head,visibilityState:'visible',createElement:tag=>new ViewElement(tag),
    querySelectorAll:s=>[...head.querySelectorAll(s),...body.querySelectorAll(s)],addEventListener:(k,f)=>{events[k]=f;}};
  for(const [key,value] of Object.entries({document:doc,window:{addEventListener:(k,f)=>{events[k]=f;}},
    sessionStorage:h.storage,localStorage:h.shared,ACTIVITIES:h.catalog,YBSXP:xp,TERMS:[],termWeekOf:()=>1,
    termWeekLabel:()=> '第 1 週',activityOpenAt:a=>a.openedAt,isActivityOpen:()=>true,
    matchMedia:()=>({matches:true,addEventListener(){}}),location:{search:''}})){
    const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>old?Object.defineProperty(globalThis,key,old):delete globalThis[key]);
  }
  h.$=id=>body.querySelector('#'+id);h.body=body;h.events=events;
  await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg,now:h.now});await h.login();
  await until(()=>!!h.$('stage').querySelector('input')&&!h.$('xp-header').hidden);
  return h;
}
test('班座活動與成長同版面：初始、兩組增 XP、右上角入口、待審標記及換人歸零，無額外讀寫',async t=>{
  const h=await page(t);
  assert.equal(h.$('xp-header').hidden,false);assert.match(h.$('xp-level').textContent,/Lv 1/);assert.equal(h.$('xp-total').textContent,'0 XP');
  assert.equal(h.$('xp-header').querySelector('a').href,'../me/');assert.match(h.$('who').textContent,/（待審）/);
  for(let slot=0;slot<2;slot++){
    const input=h.$('stage').querySelector('input');input.value='合成答案';input.oninput();await h.$('b-send').onclick();
    if(slot===0){assert.equal(h.$('xp-total').textContent,'0 XP');h.$('b-next-group').onclick();}
  }
  await until(()=>h.$('xp-total').textContent==='15 XP');assert.equal(h.$('sync').textContent,'已存待審，尚未採計');
  assert.match(h.$('who').textContent,/（待審）/);assert.equal(h.$('rounds').querySelectorAll('button')[1].disabled,false);
  const calls=h.requests.length;
  h.events.pagehide();h.client=h.reopen();
  await mountGrowth({client:Promise.resolve(h.client)});
  assert.equal(h.$('growth').hidden,false);assert.equal(h.$('total').textContent,'15 XP');assert.equal(h.$('completed').textContent,'1');
  assert.match(h.body.querySelector('.page-heading h1').textContent,/（待審）/);
  assert.equal(h.$('axes').querySelectorAll('li').length,6);assert.ok(h.$('radar').querySelector('svg'));assert.ok(h.$('route').querySelector('a'));
  await h.$('retry').onclick();assert.equal(h.requests.length,calls);assert.deepEqual(h.reads,[]);
  const history=h.body.querySelectorAll('button').find(b=>b.textContent==='查閱歷史');await history.onclick();
  assert.equal(h.requests.length,calls);assert.match(h.body.textContent,/已存待審，尚未採計/);
  await h.$('logout').onclick();assert.equal(h.$('growth').hidden,true);assert.equal(h.$('total').textContent,'');
  await h.client.login('guest',{cls:'902',seat:2});await h.$('retry').onclick();
  assert.equal(h.$('total').textContent,'0 XP');assert.equal(h.$('level-number').textContent,'Lv 1');assert.equal(h.$('completed').textContent,'0');
  assert.equal(h.requests.length,calls);assert.deepEqual(h.reads,[]);
});

test('活動的「不是我？換人」清除 XP，新班座活動與成長都從 0 開始',async t=>{
  const h=await page(t);await complete(h);await h.events.focus();await until(()=>h.$('xp-total').textContent==='15 XP');
  await h.$('b-swap').onclick();assert.equal(h.$('main').hidden,true);assert.equal(h.$('xp-header').hidden,true);
  await h.client.login('guest',{cls:'902',seat:2});await until(()=>!h.$('xp-header').hidden);
  assert.equal(h.$('xp-total').textContent,'0 XP');assert.match(h.$('xp-level').textContent,/Lv 1/);
  h.events.pagehide();h.client=h.reopen();
  await mountGrowth({client:Promise.resolve(h.client)});assert.equal(h.$('growth').hidden,false);
  assert.equal(h.$('total').textContent,'0 XP');assert.equal(h.$('completed').textContent,'0');assert.equal(h.$('badge-count').textContent,'0');
});
