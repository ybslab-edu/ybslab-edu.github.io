import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><script src="/assets/xp.js"></script><body><script type="module">
import {roundFlow} from '/tests/fixtures/fullrev-round-flow.mjs';
import {mountActivity,mountGrowth} from '/assets/fullrev-ui.mjs';
window.h=await roundFlow({guest:true,realTimers:true});
window.ACTIVITIES=h.catalog.map(a=>({...a,date:'2026-11-26',href:'115-g9/synthetic/',topic:'你的小挑戰',openedAt:Date.now()-86400000,isOpen:true}));
window.isActivityOpen=()=>true;window.activityOpenAt=a=>a.openedAt;window.TERMS=[];
window.termWeekOf=()=>1;window.termWeekLabel=()=> '第 1 週';
if(sessionStorage.getItem('ybs:fullrev:'+h.client.project+':115-g9'))await h.auth.signInAnonymously();
h.client=h.reopen({storage:sessionStorage,shared:localStorage,events:window,now:Date.now,schedule:setTimeout,cancel:clearTimeout});
if(location.pathname.includes('/me/'))await mountGrowth({client:Promise.resolve(h.client)});
else await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg});
</script></body></html>`;
async function open(t,width=390){
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});t.after(()=>context.close());
  const blocked=[];
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base){blocked.push(url.origin);return route.abort();}
    if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
    if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-round-flow|-teacher)?\.mjs)$/.test(url.pathname))return route.abort();
    return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  t.after(()=>{assert.deepEqual(errors,[]);assert.ok(blocked.every(origin=>origin==='https://fonts.googleapis.com'));});
  await page.clock.install({time:new Date('2026-11-27T00:00:00Z')});await page.goto(base+'/115-g9/synthetic/');
  await login(page);return page;
}
async function login(page,cls='901',seat='1'){
  if(!await page.locator('details.tlogin').evaluate(el=>el.open))await page.getByText('登入不了？用班級＋座號',{exact:true}).click();
  await page.getByLabel('班級',{exact:true}).fill(cls);await page.getByLabel('座號',{exact:true}).fill(seat);
  await page.getByRole('button',{name:'用班級＋座號開始',exact:true}).click();
  await page.getByLabel('合成答案').waitFor();await page.locator('#xp-total').getByText('0 XP',{exact:true}).waitFor({state:'attached'});
}
async function complete(page){
  for(let slot=0;slot<2;slot++){
    await page.getByLabel('合成答案').fill('合成答案');await page.locator('#b-send').click();
    if(slot===0){assert.equal(await page.locator('#xp-total').textContent(),'0 XP');await page.locator('#b-next-group').click();}
  }
  await page.getByRole('heading',{name:'已存待審，尚未採計',exact:true}).waitFor();
  const promise=page.locator('#verdict p').filter({hasText:'老師核可後會存到你的帳號'});
  assert.equal(await promise.isVisible(),true);assert.ok(await promise.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=17);
  await page.locator('#xp-total').getByText('15 XP',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.locator('#xp-header').isVisible(),true);
  assert.equal(await page.locator('#xp-total').textContent(),'15 XP');
}
async function growthXP(page,value){
  // 手機版收起等級面板；等待可見摘要，再核對面板的同一份 XP。
  await page.locator('#growth').waitFor();
  await page.locator('#xp-total').getByText(value+' XP',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.locator('#total').textContent(),value+' XP');
}
test('班座 360／1280：Lv 1、0 XP，可由右上角進同版成長，探索與徽章從 0 開始且無雲端查詢',async t=>{
  for(const width of [360,1280])await t.test(String(width),async t=>{
    const page=await open(t,width);assert.match(await page.locator('#xp-level').textContent(),/Lv 1/);
    assert.match(await page.locator('#who').textContent(),/（待審）/);
    assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),true);
    await page.locator('#xp-header a').click();await page.locator('#growth').waitFor();
    assert.equal(await page.locator('#level-number').textContent(),'Lv 1');assert.equal(await page.locator('#total').textContent(),'0 XP');
    assert.equal(await page.locator('#completed').textContent(),'0');assert.equal(await page.locator('#badge-count').textContent(),'0');
    assert.equal(await page.locator('#axes li').count(),6);assert.equal(await page.locator('#radar svg').count(),1);
    assert.match(await page.locator('.page-heading h1').textContent(),/（待審）/);
    await page.locator('#retry').click();await page.getByRole('button',{name:'查閱歷史',exact:true}).click();
    assert.equal(await page.evaluate(()=>h.requests.length),0);assert.deepEqual(await page.evaluate(()=>h.reads),[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  });
});
test('班座兩組完成增本機 XP，跨頁及重整保留，待審狀態與送出內容不帶 XP',async t=>{
  const page=await open(t);await complete(page);
  assert.equal(await page.locator('#sync').textContent(),'已存待審，尚未採計');assert.match(await page.locator('#who').textContent(),/（待審）/);
  assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),false);
  assert.deepEqual(await page.evaluate(()=>h.requests.map(r=>new URL(r.url).pathname)),['/guest/context','/guest/start','/guest/answer','/guest/answer']);
  assert.equal(await page.evaluate(()=>h.requests.every(r=>!Object.keys(r.body).some(k=>/xp|growth|subject|result/i.test(k)))),true);
  assert.deepEqual(await page.evaluate(()=>h.reads),[]);
  await page.locator('#xp-header a').click();await growthXP(page,15);
  assert.equal(await page.locator('#completed').textContent(),'1');assert.equal(await page.evaluate(()=>h.requests.length),0);
  await page.reload();await growthXP(page,15);
  await page.getByRole('button',{name:'查閱歷史',exact:true}).click();assert.equal(await page.evaluate(()=>h.requests.length),0);
  assert.match(await page.locator('#status').textContent(),/已存待審，尚未採計/);
  await page.locator('#logout').click();await page.locator('#signin').waitFor();
  await page.getByText('登入不了？用班級＋座號',{exact:true}).click();await page.getByLabel('班級',{exact:true}).fill('901');
  await page.getByLabel('座號',{exact:true}).fill('1');await page.getByRole('button',{name:'用班級＋座號開始',exact:true}).click();
  await growthXP(page,0);assert.equal(await page.locator('#completed').textContent(),'0');
  assert.equal(await page.evaluate(()=>h.requests.length),0);
});
test('班座按「不是我？換人」歸零；新班座成長仍為 0 且不讀前一人的資料',async t=>{
  const page=await open(t);await complete(page);await page.locator('#account-toggle').click();await page.locator('#b-swap').click();
  await page.locator('#g-gbtn').waitFor();assert.equal(await page.locator('#xp-header').isVisible(),false);
  await login(page,'902','2');assert.match(await page.locator('#who').textContent(),/902 班 2 號（待審）/);
  await page.locator('#xp-header a').click();await growthXP(page,0);
  assert.equal(await page.locator('#level-number').textContent(),'Lv 1');assert.equal(await page.locator('#completed').textContent(),'0');
  assert.equal(await page.evaluate(()=>h.requests.length),0);assert.deepEqual(await page.evaluate(()=>h.reads),[]);
});
