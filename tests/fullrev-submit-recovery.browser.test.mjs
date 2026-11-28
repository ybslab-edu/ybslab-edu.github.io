import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import {config} from './fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
async function capture(page,name){
 for(const width of [360,1280]){
  await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.YBS_DEBT2_SHOTS){await mkdir(process.env.YBS_DEBT2_SHOTS,{recursive:true});await page.screenshot({path:resolve(process.env.YBS_DEBT2_SHOTS,`${name}-${width}.png`),fullPage:true});}
 }
}
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><body><script src="/assets/xp.js"></script><script type="module">
import {harness,config,activities} from '/tests/fixtures/fullrev.mjs';
import {mountActivity} from '/assets/fullrev-ui.mjs';
import {createReadModel} from '/assets/fullrev-read-model.mjs';
window.ACTIVITIES=activities;window.isActivityOpen=()=>true;
const restoredProvider=sessionStorage.getItem('ybs:fullrev:'+config.firebase.projectId+':115-g9')?'password':undefined;
const h=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider,answerTickets:true,requestId:()=>crypto.randomUUID(),
 fetcher:async(url,init)=>{const reply=await window.workerFetch(url,init.body);if(reply.lost)throw Error('synthetic-response-lost');return Response.json(reply.body,{status:reply.status});}});
window.h=h;h.state.owner=false;h.state.uid='fake-uid-a';h.state.hints={'115-g9':'synthetic-class'};
h.client.subscribe(state=>{window.lastView=state.view;});
if(restoredProvider)h.auth.currentUser.uid='fake-uid-a';
Object.assign(h.model,createReadModel({session:async()=>h.session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,
 fetcher:async(url,init)=>{const reply=await window.workerRead(new URL(url).pathname.slice(1),JSON.parse(init.body));return Response.json(reply.body,{status:reply.status});}}));
await mountActivity({client:Promise.resolve(h.client),cfg:{course:'115-g9',week:5,title:'合成作答恢復',rounds:activities[0].rounds.map(name=>({name,learn:'請依題面填入合成答案。'})),
 renderQuestion(question,host,{changed}){const input=document.createElement('input');input.setAttribute('aria-label','合成答案');input.oninput=changed;host.append(input);
 return {get:()=>input.value?JSON.parse(input.value):null,ready:()=>input.value!=='',draft:()=>input.value,restoreDraft:value=>{input.value=value;return true;}};}}});
window.ready=true;
</script></body></html>`;

async function open(t,{tickets=true,contextError=false}={}){
 assert.ok(workerSource,'請設定 YBS_WORKER_SOURCE；這些案例必須驗證真實 Worker 的計分');
 const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);
 const [{ticketHarness},{solve,paths}]=await Promise.all([load('tests/ticket-fixtures.mjs'),load('tests/formal-fixtures.mjs')]);
 const worker=await ticketHarness(),calls=[];let holdSlot=null,release,loseSlot=null;
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});t.after(()=>context.close());
 await context.exposeFunction('workerRead',async(op,body)=>{
  const reply=await worker.call(op,body,{instance:worker.instance});
  return {status:reply.status,body:{...reply.body,sourceProject:config.firebase.projectId}};
 });
 await context.exposeFunction('workerFetch',async(url,raw)=>{
  const body=JSON.parse(raw),op=new URL(url).pathname.slice(1);calls.push({op,body});
  const reply=await worker.call(op,body,{instance:tickets?worker.instance:worker.worker});
  if(op.endsWith('answer')&&body.slot===holdSlot){holdSlot=null;await new Promise(resolve=>{release=resolve;});}
  if(op.endsWith('answer')&&body.slot===loseSlot){loseSlot=null;return {lost:true};}
  return {status:reply.status,body:reply.body};
 });
 let navigations=0;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest()){
   let body=tickets?html:html.replace('answerTickets:true','answerTickets:false');
   if(navigations++===0&&contextError)body=body.replace('await mountActivity','const readPage=h.model.page;h.model.page=async input=>{const value=await readPage(input);delete value.startContext;return value;};h.model.context=async()=>{throw {code:"private-synthetic-code",message:"private-detail"};};\nawait mountActivity');
   return route.fulfill({contentType:'text/html',body});
  }
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev.mjs)$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.clock.install({time:new Date('2026-11-27T00:00:00Z')});await page.goto(base+'/115-g9/synthetic/');await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>h.login());await page.locator('#g-isme').click();if(!contextError)await page.getByLabel('合成答案').waitFor();
 const fill=async()=>page.getByLabel('合成答案').fill(JSON.stringify(solve(await page.evaluate(()=>window.lastView))));
 const counts=()=>({results:worker.results().length,completions:Object.keys(worker.db.docs.get(paths.head('synthetic-a'))?.completions||{}).length});
 return {page,worker,calls,fill,counts,hold:slot=>{holdSlot=slot;},release:()=>release(),lose:slot=>{loseSlot=slot;},waiting:()=>!!release};
}

for(const tickets of [false,true]){
 test(`慢回應連按只接受一份原答案，兩組完成只計一次（${tickets?'作答票':'session'}）`,{skip:workerCISkip},async t=>{
  const h=await open(t,{tickets}),{page}=h;h.hold(0);await h.fill();const answer=await page.getByLabel('合成答案').inputValue();
  await page.locator('#b-send').click();await page.waitForFunction(()=>h.client.state().status==='sending');
  await page.getByLabel('合成答案').fill('123');
  await page.locator('#b-send').evaluate(async button=>{for(let i=0;i<8;i++){button.click();await button.onclick();}});
  await page.locator('#send-control').click();await page.locator('#send-control').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#b-send').isDisabled(),true);assert.match(await page.locator('#send-hint').innerText(),/上傳中.*答案已保留/);
  assert.equal(h.calls.filter(c=>c.op.endsWith('answer')).length,1);assert.deepEqual(h.calls.at(-1).body.answer,JSON.parse(answer));assert.deepEqual(h.counts(),{results:0,completions:0});
  if(tickets)await capture(page,'sending');
  assert.equal(h.waiting(),true);h.release();await page.locator('#b-next-group').click();await h.fill();await page.locator('#b-send').click();
  await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();assert.deepEqual(h.counts(),{results:1,completions:1});
  assert.equal(h.calls.filter(c=>c.op.endsWith('answer')).length,2);
 });
 test(`伺服器接受第一組但回應遺失，立即重整沿用原請求並能續作（${tickets?'作答票':'session'}）`,{skip:workerCISkip},async t=>{
  const h=await open(t,{tickets}),{page}=h;h.lose(0);await h.fill();await page.locator('#b-send').click();
  await page.locator('#send-hint').filter({hasText:'連線失敗，答案已保留'}).waitFor();
  const original=structuredClone(h.calls.at(-1)),before=h.calls.length;assert.deepEqual(h.counts(),{results:0,completions:0});
  if(tickets)await capture(page,'response-lost');
  await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#g-isme').click();
  await page.locator('#send-hint').filter({hasText:'答案已保留'}).waitFor();await page.evaluate(()=>h.advance(1000));await page.locator('#b-retry').click();await page.locator('#b-next-group').waitFor();
  assert.equal(h.calls.length,before+1);assert.deepEqual(h.calls.at(-1),original);
  await page.locator('#b-next-group').click();await h.fill();await page.locator('#b-send').click();await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();
  assert.deepEqual(h.counts(),{results:1,completions:1});assert.equal(h.calls.filter(c=>c.op.endsWith('answer')&&c.body.slot===1).length,1);
 });
 test(`伺服器已計分但完成回應遺失，立即重整維持一筆計分且能做下一關（${tickets?'作答票':'session'}）`,{skip:workerCISkip},async t=>{
  const h=await open(t,{tickets}),{page}=h;await h.fill();await page.locator('#b-send').click();await page.locator('#b-next-group').click();
  h.lose(1);await h.fill();await page.locator('#b-send').click();await page.locator('#send-hint').filter({hasText:'連線失敗，答案已保留'}).waitFor();
  assert.deepEqual(h.counts(),{results:1,completions:1});const before=structuredClone(h.worker.results()),original=structuredClone(h.calls.at(-1));
  await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#g-isme').click();
  await page.locator('#send-hint').filter({hasText:'答案已保留'}).waitFor();await page.evaluate(()=>h.advance(1000));await page.locator('#b-retry').click();
  await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();assert.deepEqual(h.calls.at(-1),original);
  assert.deepEqual(h.worker.results(),before);assert.deepEqual(h.counts(),{results:1,completions:1});
  await page.locator('#rounds button').nth(1).click();await page.getByLabel('合成答案').waitFor();
  assert.equal(h.calls.at(-1).body.round,1);assert.deepEqual(h.worker.results(),before);
 });
}

test('未知錯誤與作答票失效的答案狀態、操作指引在 360／1280 寬可讀',{skip:workerCISkip},async t=>{
 const h=await open(t,{contextError:true}),{page}=h;
 await page.locator('#send-hint').filter({hasText:'你的答案是否保留尚未確認'}).waitFor();
 assert.doesNotMatch(await page.locator('body').innerText(),/private-synthetic|private-detail/);
 await capture(page,'unknown-error');
 // 同一合成帳號重新開始後，讓真實 client 處理票錯誤的清除及停送流程。
 await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#g-isme').click();await page.getByLabel('合成答案').waitFor();
 await h.fill();const input=await page.getByLabel('合成答案').inputValue();
 await page.evaluate(()=>{h.state.fetcher=async()=>Response.json({error:'invalid_answer'},{status:400});});
 await page.locator('#b-send').click();await page.locator('#sync').filter({hasText:'你填的答案仍在本頁'}).waitFor();
 assert.equal(await page.getByLabel('合成答案').inputValue(),input);await capture(page,'invalid-answer');
 await page.evaluate(()=>{h.state.fetcher=async()=>Response.json({error:'ticket_expired'},{status:410});});
 await page.getByLabel('合成答案').fill('123');
 await page.locator('#b-send').click();await page.locator('#send-hint').filter({hasText:'你的答案無法接續'}).waitFor();await capture(page,'ticket-expired');
});
