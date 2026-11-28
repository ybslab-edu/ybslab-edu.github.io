// 僅 localhost 與合成登入替身；其餘請求全部阻擋。
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const before='2026-11-08T23:58:59+08:00',boundary='2026-11-08T23:59:00+08:00';
test('日期鎖攔截作答；台灣週日邊界恢復開始；owner 示範與登出重鎖',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({serviceWorkers:'block',timezoneId:'America/Los_Angeles'});t.after(()=>context.close());
 const earlyOpen=(await readFile(new URL('../assets/lock.js',import.meta.url),'utf8')).split('(() =>')[0];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><script>${earlyOpen}</script><script src="/assets/activities.js"></script><script src="/assets/xp.js"></script><script type="module">
   import {harness} from '/tests/fixtures/fullrev.mjs';
   import {teacherPayload} from '/tests/fixtures/fullrev-teacher.mjs';
   import {mountActivityShell,mountStudentLogin} from '/assets/fullrev-shell.mjs';
   window.COURSES=[{id:'115-g9',open:true}];
   window.h=await harness();h.state.owner=false;h.state.snapshot.records=[];
   const cfg={course:'115-g9',week:5,title:'合成日期鎖',rounds:[{name:'甲'}],renderQuestion(q,host){const p=document.createElement('p');p.textContent='合成題目';host.append(p);return {get:()=>7,ready:()=>true};}};
   await mountActivityShell({client:Promise.resolve(h.client),cfg,mountLogin:o=>mountStudentLogin({...o,onLogin(){},explain:e=>e.message}),xpCore:async()=>YBSXP,explain:e=>e.message});
   window.teacher=()=>{h.state.owner=true;h.state.fetcher=async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});return h.client.login('owner');};
   window.ready=true;
  </script></html>`});
  const path=url.pathname.slice(1);
  if(!/^(assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-teacher)?\.mjs)$/.test(path))return route.abort();
  return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../'+path,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date(before)});
 await page.goto(base+'/115-g9/u2-03/');await page.waitForFunction(()=>window.ready);
 const lock=page.locator('#activity-lock');await lock.waitFor({state:'visible'});
 assert.equal(await page.locator('#gate').isVisible(),false);
 await page.evaluate(()=>h.login());assert.equal(await lock.isVisible(),true);assert.equal(await page.evaluate(()=>h.requests.length),0);
 await page.clock.setFixedTime(new Date(boundary));await page.evaluate(()=>dispatchEvent(new Event('focus')));
 await page.locator('#g-isme').waitFor({state:'visible'});assert.equal(await page.locator('#main').isVisible(),false);
 await page.locator('#g-isme').click();await page.getByText('合成題目',{exact:true}).waitFor({state:'visible'});
 assert.equal(await lock.isVisible(),false);assert.equal(await page.evaluate(()=>h.requests.filter(r=>r.url.endsWith('/start')).length),1);
 await page.clock.setFixedTime(new Date(before));await page.reload();await page.waitForFunction(()=>window.ready);await lock.waitFor({state:'visible'});
 await page.getByRole('button',{name:'教師解鎖',exact:true}).click();
 assert.equal(await page.locator('[data-teacher-login]').evaluate(el=>el===document.activeElement),true);
 await page.evaluate(()=>teacher());await page.locator('#tbar').waitFor({state:'visible'});
 assert.equal(await lock.isVisible(),false);assert.deepEqual(await page.evaluate(()=>h.requests.map(r=>r.url.split('/').at(-1))),['teacher-question']);
 await page.locator('#account-toggle').click();await page.locator('#b-swap').click();await lock.waitFor({state:'visible'});assert.equal(await page.locator('#stage').textContent(),'');assert.deepEqual(errors,[]);
});
