// 真實雙分頁的 Web Locks／localStorage／重新整理；Firebase 完全替換為合成 SDK。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {packet,key} from './fixtures/guest-firebase.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=await readFile(new URL('../assets/login.js',import.meta.url),'utf8');
const base='http://127.0.0.1',path='/115-g9/u1-05/';
const fake=`(() => {
  // 合成 SDK 的成功寫入情境固定在線上，不依賴隔離網路的主機連線訊號。
  Object.defineProperty(navigator,'onLine',{get:()=>true});
  window.YBS_FULLREV_CONFIG={enabled:false};
  const uid=new URLSearchParams(location.search).get('uid');
  sessionStorage.setItem('ybslab:guest-identity',JSON.stringify({cls:'999',seat:1,uid}));
  const state=window.__guestTest={reads:[],statuses:[]};
  const auth={currentUser:{uid,isAnonymous:true},async setPersistence(){},async signOut(){auth.currentUser=null;}};
  const app={name:'ybs',auth:()=>auth,firestore:()=>({doc(path){return{
    async set(data){await window.__guestWrite(path,data);},
    async get(){state.reads.push(path);throw Object.assign(new Error('synthetic denial'),{code:'permission-denied'});}
  };}})};
  window.firebase={apps:[app],auth:{Auth:{Persistence:{SESSION:'session'}}},
    firestore:{FieldValue:{serverTimestamp:()=> 'SERVER_TIMESTAMP'}}};
})();`;
const html='<!doctype html><html><head><meta charset="utf-8">'+
  '<script src="/synthetic-sdk.js"></script><script src="/assets/login.js"></script>'+
  '<script>YBS.status(s=>__guestTest.statuses.push(s));</script></head><body></body></html>';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});

for(const uid of ['shared-guest','another-guest'])test(`原生 Web Locks：同關雙分頁只寫一次，重新整理不重送（第二分頁 UID=${uid}）`,{timeout:15000},async t=>{
  let release,started;
  const gate=new Promise(r=>release=r),writing=new Promise(r=>started=r);
  const context=await browser.newContext({serviceWorkers:'block'}),calls=[],errors=[],outside=[];
  context.setDefaultTimeout(3000);
  t.after(async()=>{release();await context.close();});
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  await context.exposeBinding('__guestWrite',async({page},path,data)=>{
    calls.push({page,path,data});started();await gate;
  });
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===base){
      if(url.pathname===path)return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname==='/synthetic-sdk.js')return route.fulfill({contentType:'text/javascript',body:fake});
      if(url.pathname==='/assets/login.js')return route.fulfill({contentType:'text/javascript',body:source});
    }
    if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/10.14.1/'))
      return route.fulfill({contentType:'text/javascript',body:'// offline synthetic SDK already loaded'});
    outside.push(url.href);return route.abort();
  });
  const first=await context.newPage();await first.goto(base+path+'?uid=shared-guest');
  assert.equal(await first.evaluate(()=>isSecureContext&&!!navigator.locks?.request),true);
  await first.evaluate(item=>{window.__sending=YBS.submit(item);},packet());
  await writing;
  const second=await context.newPage();await second.goto(base+path+'?uid='+uid);
  const lockName='ybslab:guest-attempt:115-g9:999_1_1_0';
  await second.waitForFunction(async name=>(await navigator.locks.query()).pending.some(x=>x.name===name),lockName);
  await second.evaluate(async item=>{await YBS.submit(item);await YBS.retry();},packet({tries:9}));
  const locks=await second.evaluate(()=>navigator.locks.query());
  assert.equal(locks.held.filter(x=>x.name===lockName).length,1);
  assert.equal(locks.pending.filter(x=>x.name===lockName).length,1);
  assert.equal(calls.length,1,'第一筆尚未完成時，第二分頁不得再次寫入');
  release();await first.evaluate(()=>window.__sending);
  await second.waitForFunction(()=>__guestTest.statuses.at(-1)==='ok');
  assert.equal(calls.length,1,'第二分頁取得鎖後重讀共用佇列');
  assert.equal(calls[0].page,first);
  assert.equal(calls[0].path,'ybsCourses/115-g9/guestAttempts/shared-guest_1_0');
  assert.equal(calls[0].data.tries,2);
  const state=await second.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.deepEqual(state.queue,[]);assert.equal(state.receipts.length,1);
  for(const page of [first,second])assert.deepEqual(await page.evaluate(()=>__guestTest.reads),[]);
  await second.reload();await second.evaluate(()=>YBS.guest({cls:999,seat:1}));
  assert.equal(calls.length,1,'重新整理後仍從共用儲存讀到已完成');
  assert.deepEqual(await second.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),state);
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
});
