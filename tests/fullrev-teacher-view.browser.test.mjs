import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
async function activityContext(t,browser){
 const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  const path=url.pathname.slice(1);
  if(route.request().isNavigationRequest()){
   const activity=Number(url.searchParams.get('activity'));
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><script type="module">
    import {harness,activities} from '/tests/fixtures/fullrev.mjs';
    import {teacherPayload} from '/tests/fixtures/fullrev-teacher.mjs';
    import {mountActivity} from '/assets/fullrev-ui.mjs';
    import {activityConfig} from '/assets/fullrev-activities.mjs';
    window.ACTIVITIES=[{...activities[0],week:${activity},date:'2026-01-01',href:'115-g9/${activity}/'}];
    window.isActivityOpen=()=>true;
    window.h=await harness({fetcher:async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}})});
    // 本頁測活動 7～9；fixture 預設的活動 5 紀錄不屬於本頁活動目錄。
    h.state.snapshot.records=[];
    window.contextReads=0;
    // 正式 read model 在活動未開放時，於建立作答 context 前拒絕。
    h.model.context=async()=>{contextReads++;throw Object.assign(new Error('not-open'),{code:'not-open'});};
    await mountActivity({client:Promise.resolve(h.client),cfg:activityConfig({course:'115-g9',week:${activity},title:'合成教師測試'})});
    window.ready=true;
   </script></html>`});
  }
  if(!/^(assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-teacher)?\.mjs)$/.test(path))return route.abort();
  try{return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../'+path,import.meta.url))});}catch{return route.abort();}
 });
 return context;
}
test('教師授權題面與解答只在教師出現；學生不取題、登出清除，換題／關卡不送成績',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await activityContext(t,browser);
 for(const [activity,dir] of [[7,'u2-05'],[8,'u2-06'],[9,'u2-07']]){
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/115-g9/${dir}/?activity=${activity}`);await page.waitForFunction(()=>window.ready);
  await page.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('/fullrev-shell.css')));
  assert.equal(await page.getByRole('button',{name:'教師 Google 登入',exact:true}).isVisible(),true);
  assert.equal(await page.locator('#g-gbtn details').count(),1,'只保留班座登入收合區');
  assert.equal(await page.locator('#activity-lock').evaluate(el=>getComputedStyle(el).display),'none');
  assert.equal(await page.getByRole('button',{name:'學生 Google 登入',exact:true}).count(),0);
  assert.equal(await page.locator('#tbar').count(),0);
  await page.evaluate(()=>h.login());assert.equal(await page.locator('#tbar').count(),0);
  assert.equal(await page.evaluate(()=>h.requests.length),0);
  await page.evaluate(()=>h.client.login('owner'));await page.locator('#tbar').waitFor({state:'visible'});
  await page.locator('#tb-ans').click();assert.equal(await page.locator('#teacher-solution').isVisible(),true);
  await page.locator('#tb-fill').click();assert.deepEqual(await page.locator('[data-answer-field]').evaluateAll(es=>es.map(e=>e.value)),['合成示範答案','42']);
  assert.equal(await page.locator('#b-send').isVisible(),false);
  await page.locator('#tb-new').click();await page.waitForFunction(()=>h.requests.length===2&&document.querySelector('#tbar'));
  await page.locator('#rounds button').nth(1).click();await page.waitForFunction(()=>h.requests.at(-1).body.round===1&&document.querySelector('#tbar'));
  assert.equal(await page.evaluate(()=>h.requests.every(r=>r.url.endsWith('/teacher-question'))),true);
  await page.locator('#b-swap').click();assert.equal(await page.locator('#tbar').count(),0);
  assert.equal(await page.locator('#stage').textContent(),'');assert.deepEqual(errors,[]);
  await page.close();
 }
});
test('學生登入不被隱藏遮罩攔截；未開放遮罩保留攔截，教師解鎖可返回登入',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await activityContext(t,browser),page=await context.newPage();
 await page.goto(`${base}/115-g9/u2-06/?activity=8`);await page.waitForFunction(()=>window.ready);
 await page.getByRole('button',{name:'顯示密碼',exact:true}).click();
 assert.equal(await page.locator('#activity-password').getAttribute('type'),'text');
 await page.locator('[name="account"]').fill('9990001');
 await page.locator('[name="password"]').fill('synthetic-password');
 await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.locator('#g-isme').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>contextReads),0,'確認身分只讀進度，不建立作答 context');
 assert.equal(await page.locator('#activity-lock').isVisible(),false);
 await page.locator('#g-isme').click();
 const lock=page.locator('#activity-lock');await lock.waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>contextReads),1);
 assert.equal(await lock.evaluate(el=>getComputedStyle(el).display),'flex');
 assert.equal(await page.locator('#main').isVisible(),false);
 assert.equal(await page.locator('#gate').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.elementFromPoint(10,10)?.id),'activity-lock');
 await page.getByRole('button',{name:'教師解鎖',exact:true}).click();
 assert.equal(await lock.isVisible(),false);
 assert.equal(await lock.evaluate(el=>getComputedStyle(el).display),'none');
 assert.equal(await page.locator('[data-teacher-login]').evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
 await page.locator('#tb-ans').click();
 assert.equal(await page.locator('#teacher-solution').isVisible(),true);
 await page.locator('#tb-ans').click();
 assert.equal(await page.locator('#teacher-solution').isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>h.requests.map(r=>r.url.split('/').at(-1))),['teacher-question']);
});
