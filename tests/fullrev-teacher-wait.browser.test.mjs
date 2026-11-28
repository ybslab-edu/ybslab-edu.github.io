import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const markup=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><script src="/assets/xp.js"></script></head><body><script type="module">
import {harness,activities,config,snapshot,controls} from '/tests/fixtures/fullrev.mjs';
import {createReadModel} from '/assets/fullrev-read-model.mjs';
import {mountTeacher} from '/assets/fullrev-ui.mjs';
window.ACTIVITIES=activities;window.isActivityOpen=()=>true;
window.h=await harness();await h.client.login('owner');
window.calls=[];window.mode='busy';window.busyStatus=503;window.held=[];
const model=createReadModel({session:async()=>h.session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,
 fetcher:async(url,init)=>{
  const operation=new URL(url).pathname.slice(1),body=JSON.parse(init.body);calls.push({operation,body,signal:init.signal});
  if(mode==='busy')return Response.json({error:'storage_busy'},{status:busyStatus,headers:{'retry-after':'60'}});
  if(mode==='hold'&&body.classKey==='c901')return new Promise(resolve=>held.push(()=>resolve(Response.json(controls))));
  if(mode==='groups'&&body.classKey==='c901')return Response.json({error:'class_not_found'},{status:404});
  if(mode==='groups'&&body.classKey==='c901_1')return Response.json({error:'storage_busy'},{status:503,headers:{'retry-after':'60'}});
  return Response.json(operation==='controls'?controls:snapshot([],{classKey:body.classKey,people:[{subject:'synthetic-subject',cls:Number(body.classKey.slice(1,4)),seat:1,provider:'password'}]}));
 }});
window.client=h.reopen({readModel:model,now:Date.now,events:window});await client.restore();
window.remount=()=>mountTeacher({client:Promise.resolve(client)});
await remount();window.ready=true;
</script></body></html>`;
async function pageFor(t,width=360){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:markup});
  const path=url.pathname.slice(1);
  if(!/^(assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev\.mjs)$/.test(path))return route.abort();
  return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../'+path,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-11-28T01:00:00Z')});
 await page.goto(base+'/115-g9/teacher/');await page.waitForFunction(()=>window.ready);
 t.after(()=>assert.deepEqual(errors,[]));return page;
}
const read=page=>page.getByRole('button',{name:'讀取有效紀錄',exact:true}).click();
const status=page=>page.locator('[data-fullrev-status]');

for(const [width,httpStatus] of [[360,429],[1280,503]])test(`教師 ${width}px：${httpStatus} 等待次數／倒數、稍後重查與恢復讀取`,async t=>{
 const page=await pageFor(t,width);await page.evaluate(value=>{busyStatus=value;},httpStatus);
 await page.locator('#teacher-class').fill('c901');await read(page);
 await page.waitForFunction(()=>document.querySelector('[data-fullrev-status]').textContent.includes('第 1 次重試'));
 assert.match(await status(page).innerText(),/伺服器忙.*第 1 次重試.*1 分鐘/);
 const later=page.getByRole('button',{name:'稍後重查',exact:true});assert.equal(await later.isVisible(),true);
 assert.ok(Number(await later.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=17);
 assert.ok(Number(await status(page).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=17);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.clock.fastForward(1000);assert.match(await status(page).innerText(),/59 秒/);
 if(process.env.YBS_DEBT1_SHOTS){await mkdir(process.env.YBS_DEBT1_SHOTS,{recursive:true});await page.screenshot({path:join(process.env.YBS_DEBT1_SHOTS,'teacher-wait-'+width+'.png'),fullPage:true});}
 await page.clock.fastForward(59000);
 await page.waitForFunction(()=>document.querySelector('[data-fullrev-status]').textContent.includes('第 2 次重試'));
 const count=await page.evaluate(()=>calls.length);await later.click();
 assert.match(await status(page).innerText(),/已停止.*老師.*讀取有效紀錄/);assert.equal(await later.isVisible(),false);
 assert.equal(await page.evaluate(()=>calls.every(c=>c.signal.aborted)),true);
 await page.clock.fastForward(180000);assert.equal(await page.evaluate(()=>calls.length),count);
 await page.evaluate(()=>{mode='success';});await read(page);await page.locator('.teacher-scroll').waitFor();
 assert.match(await status(page).innerText(),/已確認目前有效紀錄/);assert.equal(await later.isVisible(),false);
 assert.equal(await page.evaluate(()=>calls.length),count+3);
});

test('切班中止在途請求，舊回應晚到不查分頁、不覆蓋新班畫面',async t=>{
 const page=await pageFor(t);await page.evaluate(()=>{mode='hold';});
 await page.locator('#teacher-class').fill('c901');await read(page);await page.waitForFunction(()=>held.length===1);
 await page.locator('#teacher-class').fill('c902');assert.equal(await page.evaluate(()=>calls[0].signal.aborted),true);
 await read(page);await page.locator('.teacher-scroll').waitFor();assert.match(await page.locator('tbody th').innerText(),/902 班/);
 await page.evaluate(()=>held.splice(0).forEach(resolve=>resolve()));
 await page.waitForFunction(()=>client.state().snapshot?.classKey==='c902');
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.body.classKey==='c901').length),1);
 assert.match(await page.locator('tbody th').innerText(),/902 班/);assert.match(await status(page).innerText(),/已確認目前有效紀錄/);
});

test('分組等待切班、頁面重建及登出都停止舊重試並清除提示',async t=>{
 const page=await pageFor(t);await page.evaluate(()=>{mode='groups';});
 await page.locator('#teacher-class').fill('c901');await read(page);
 await page.waitForFunction(()=>document.querySelector('[data-fullrev-status]').textContent.includes('第 1 次重試'));
 await page.locator('#teacher-class').fill('c902');await page.clock.fastForward(180000);
 assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.body.classKey)),['c901','c901_1']);
 assert.equal(await page.getByRole('button',{name:'稍後重查',exact:true}).isVisible(),false);
 await page.evaluate(()=>{mode='busy';});await read(page);
 await page.waitForFunction(()=>client.state().readingRetry!==null);await page.evaluate(()=>remount());
 assert.equal(await page.evaluate(()=>client.state().readingRetry),null);
 await page.clock.fastForward(180000);assert.equal(await page.evaluate(()=>calls.length),3);
 await page.locator('#teacher-class').fill('c902');await read(page);await page.waitForFunction(()=>client.state().readingRetry!==null);
 await page.getByRole('button',{name:'登出／換人',exact:true}).click();await page.clock.fastForward(180000);
 assert.equal(await page.evaluate(()=>calls.length),4);assert.equal(await page.getByRole('button',{name:'稍後重查',exact:true}).isVisible(),false);
 assert.match(await status(page).innerText(),/請先登入/);assert.equal(await page.locator('.teacher-scroll').count(),0);
});
