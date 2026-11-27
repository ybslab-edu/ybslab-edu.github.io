import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
async function open(t,options={}){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><script src="/assets/xp.js"></script><body></body></html>'});
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-round-flow|-teacher)?\.mjs)$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.clock.install({time:new Date('2026-11-27T00:00:00Z')});await page.goto(base+'/115-g9/synthetic/');
 await page.evaluate(async options=>{
  const {roundFlow}=await import('/tests/fixtures/fullrev-round-flow.mjs'),{mountActivity}=await import('/assets/fullrev-ui.mjs');
  window.h=await roundFlow({...options,realTimers:true});window.ACTIVITIES=h.catalog;window.isActivityOpen=()=>true;
  await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg});await h.login();
 },options);
 if(options.guest)await page.getByLabel('合成答案').waitFor();else await page.locator('#g-isme').click();return page;
}
test('手機按鎖定關卡零請求、過關解鎖、回看零請求、明確重做才 start',async t=>{
 const page=await open(t);await page.getByLabel('合成答案').waitFor();
 assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),true);
 assert.match(await page.locator('.round-locked').first().innerText(),/你要先完成第 1 關/);
 const n=await page.evaluate(()=>h.requests.length);await page.locator('#rounds button').nth(1).evaluate(e=>e.click());assert.equal(await page.evaluate(()=>h.requests.length),n);
 for(let slot=0;slot<2;slot++){
  await page.getByLabel('合成答案').fill('合成答案');await page.locator('#b-send').click();
  if(slot===0)await page.locator('#b-next-group').click();
 }
 await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),false);
 await page.getByRole('button',{name:'下一關',exact:true}).click();await page.getByLabel('合成答案').waitFor();
 const before=await page.evaluate(()=>h.requests.length);await page.locator('#rounds button').first().click();
 await page.getByText('你正在回看過關摘要，這次不計作答次數。',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>h.requests.length),before);
 await page.locator('#b-redo').click();await page.getByLabel('合成答案').waitFor();assert.equal(await page.evaluate(()=>h.requests.length),before+1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('既有過關結果直接回看；教師可跳到第四關且只讀教師題面',async t=>{
 const page=await open(t,{passed:[0,1],owner:true});await page.locator('#b-redo').waitFor();assert.equal(await page.evaluate(()=>h.requests.length),0);
 await page.locator('#rounds button').nth(1).click();assert.equal(await page.evaluate(()=>h.requests.length),0);
 await page.evaluate(()=>h.client.login('owner'));await page.locator('#tbar').waitFor();
 await page.locator('#rounds button').nth(3).click();await page.waitForFunction(()=>h.requests.at(-1).body.round===3&&document.querySelector('#tbar'));
 assert.equal(await page.evaluate(()=>h.requests.every(r=>r.url.endsWith('/teacher-question'))),true);
});
test('start 429 於動手做顯示倒數，結束自動重試一次且 requestId 相同',async t=>{
 const page=await open(t,{startLimits:1});await page.locator('#start-wait').filter({hasText:'切換太快，請等 2 秒'}).waitFor();
 await page.clock.runFor(1000);assert.equal(await page.locator('#start-wait').textContent(),'切換太快，請等 1 秒');assert.equal(await page.evaluate(()=>h.requests.length),1);
 await page.clock.runFor(1000);await page.getByLabel('合成答案').waitFor();assert.equal(await page.evaluate(()=>h.requests.length),2);
 assert.deepEqual(await page.evaluate(()=>h.requests[0].body),await page.evaluate(()=>h.requests[1].body));
 await page.getByLabel('合成答案').fill('保留合成答案');await page.clock.runFor(60000);assert.equal(await page.getByLabel('合成答案').inputValue(),'保留合成答案');assert.equal(await page.evaluate(()=>h.requests.length),2);
});
test('連續限速不循環重送；回看及換人會停止舊倒數',async t=>{
 const page=await open(t,{passed:[0],startLimits:3});await page.locator('#rounds button').nth(1).click();await page.locator('#start-wait').waitFor();
 await page.clock.runFor(2000);await page.waitForFunction(()=>h.requests.length===2&&h.client.state().status==='pending');
 await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>h.requests.length),2);assert.match(await page.locator('#start-wait').textContent(),/重試上傳/);
 await page.locator('#rounds button').first().click();await page.locator('#b-redo').waitFor();await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>h.requests.length),2);
 await page.locator('#rounds button').nth(1).click();await page.locator('#start-wait').waitFor();await page.locator('#b-swap').click();await page.clock.runFor(60000);
 assert.equal(await page.locator('#stage').textContent(),'');assert.equal(await page.evaluate(()=>h.requests.length),3);
});
test('answer 429 沿用原訊息，保留原答案且不顯示切關倒數',async t=>{
 const page=await open(t);await page.getByLabel('合成答案').fill('保留合成答案');
 await page.evaluate(()=>{h.state.fetcher=async()=>Response.json({error:'rate_limited',retryAfter:2},{status:429,headers:{'retry-after':'2'}});});
 await page.locator('#b-send').click();await page.locator('#send-hint').filter({hasText:'送出太密集，答案已保留'}).waitFor();assert.equal(await page.locator('#start-wait').count(),0);assert.equal(await page.getByLabel('合成答案').inputValue(),'保留合成答案');
 const before=await page.evaluate(()=>h.requests.at(-1).body);await page.evaluate(async()=>{const {response}=await import('/tests/fixtures/fullrev.mjs');h.state.fetcher=async()=>Response.json(response(1,{correct:true}));});
 await page.clock.runFor(2000);await page.locator('#b-next-group').waitFor();assert.deepEqual(await page.evaluate(()=>h.requests.at(-1).body),before);
});
test('等待 context 時回看會取消 start，context 晚到也不建立 session',async t=>{
 const page=await open(t,{passed:[0]});await page.locator('#b-redo').waitFor();
 await page.evaluate(()=>{const original=h.model.context;h.model.context=input=>new Promise(resolve=>{window.releaseContext=async()=>resolve(await original(input));});});
 await page.locator('#rounds button').nth(1).click();await page.waitForFunction(()=>!!window.releaseContext);
 await page.locator('#rounds button').first().click();await page.locator('#b-redo').waitFor();
 assert.equal(await page.evaluate(()=>h.requests.length),0);await page.evaluate(()=>window.releaseContext());await page.clock.runFor(60000);
 assert.equal(await page.evaluate(()=>h.requests.length),0);assert.equal(await page.evaluate(()=>h.client.state().pending),false);
 await page.getByText('你正在回看過關摘要，這次不計作答次數。',{exact:true}).waitFor();
});
test('班座摘要重整先核對 context；有效時零 start，教師重設後重新鎖定',async t=>{
 const page=await open(t,{guest:true});
 for(let slot=0;slot<2;slot++){await page.getByLabel('合成答案').fill('合成答案');await page.locator('#b-send').click();if(slot===0)await page.locator('#b-next-group').click();}
 await page.getByRole('heading',{name:'已存待審，尚未採計',exact:true}).waitFor();assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),false);
 const remount=async()=>page.evaluate(async()=>{
  const {mountActivity}=await import('/assets/fullrev-ui.mjs');window.dispatchEvent(new Event('pagehide'));
  const count=h.requests.length;h.client=h.reopen({schedule:setTimeout,cancel:clearTimeout,now:Date.now,events:window});
  await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg});return count;
 });
 const valid=await remount();await page.locator('#b-redo').waitFor();assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),false);
 assert.deepEqual(await page.evaluate(count=>h.requests.slice(count).map(r=>new URL(r.url).pathname),valid),['/guest/context']);
 await page.evaluate(()=>{h.state.guestVersions.roundEpoch++;h.state.guestVersions.controlVersions.classGateVersion++;});
 const reset=await remount();await page.getByLabel('合成答案').waitFor();assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),true);assert.equal(await page.locator('#b-redo').count(),0);
 assert.deepEqual(await page.evaluate(count=>h.requests.slice(count).map(r=>new URL(r.url).pathname),reset),['/guest/context','/guest/context','/guest/start']);
 assert.equal(await page.evaluate(()=>h.requests.at(-1).body.roundEpoch),1);assert.equal(await page.evaluate(()=>h.requests.at(-1).body.round),0);
});
