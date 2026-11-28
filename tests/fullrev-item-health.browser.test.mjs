import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><body>
<script src="/assets/xp.js"></script><script>const TERMS=[],isActivityOpen=()=>true;const ACTIVITIES=[{course:'115-g9',week:5,unit:2,title:'二進位與容量',date:'2026-11-27',rounds:['位元編碼','位元解碼','最少位元','容量換算'],codes:[]},{course:'115-g9',week:6,unit:2,title:'網路資訊',date:'2026-11-26',rounds:['甲','乙','丙','丁'],codes:[]}];</script>
<script type="module">
import {harness,snapshot} from '/tests/fixtures/fullrev.mjs';
import {healthFixture} from '/tests/fixtures/fullrev-item-health.mjs';
import {mountTeacher} from '/assets/fullrev-ui.mjs';
window.healthFixture=healthFixture;window.app=await harness({shared:localStorage,storage:sessionStorage,events:window});
app.state.snapshot=snapshot([]);app.state.fetcher=async(url,init)=>Response.json(healthFixture(JSON.parse(init.body)));
window.reloadView=()=>mountTeacher({client:Promise.resolve(app.client)});await reloadView();window.ready=true;
</script></body></html>`;
before(async()=>{
 server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/health/')return res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(html);
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-item-health)?\.mjs)$/.test(path))return res.writeHead(404).end();
  try{res.writeHead(200,{'content-type':path.endsWith('.css')?'text/css':'text/javascript;charset=utf-8'}).end(await readFile(new URL('..'+path,import.meta.url)));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));});
async function pageFor(t){
 const context=await browser.newContext({viewport:{width:360,height:900},serviceWorkers:'block'});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(7000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());await page.goto(base+'/health/');await page.waitForFunction(()=>window.ready);
 await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await page.getByLabel('班級代碼').fill('c901');await page.getByLabel('活動篩選').selectOption('5');return page;
}
test('health panel: visible student label, 17px minimum, local horizontal scroll and sticky headers at 360/1280; screenshots',async t=>{
 const page=await pageFor(t);assert.equal(await page.locator('label[for="teacher-student"]').textContent(),'查閱單一學生');
 await page.getByRole('button',{name:'讀取題目健檢',exact:true}).click();await page.getByRole('region',{name:'題目健檢統計表，可橫向捲動'}).waitFor();
 assert.equal(await page.locator('.item-health tbody tr').count(),12);assert.match(await page.locator('#item-health-status').textContent(),/34 筆/);
 for(const width of [360,1280]){
  await page.setViewportSize({width,height:1000});await page.locator('.item-health').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('.item-health').evaluate(e=>[...e.querySelectorAll('p,li,button,th,td,caption')].every(n=>parseFloat(getComputedStyle(n).fontSize)>=17)),true);
  const scroll=page.getByRole('region',{name:'題目健檢統計表，可橫向捲動'});await scroll.evaluate(e=>{e.scrollTop=50;e.scrollLeft=0;});
  const before=await scroll.locator('tbody th').first().boundingBox(),head=await scroll.locator('thead th').first().boundingBox();
  await scroll.evaluate(e=>{e.scrollLeft=300;e.scrollTop=130;});const moved=await scroll.locator('tbody th').first().boundingBox(),after=await scroll.locator('thead th').first().boundingBox();
  assert.ok(Math.abs(before.x-moved.x)<2);assert.ok(Math.abs(head.y-after.y)<2);await scroll.evaluate(e=>{e.scrollLeft=0;e.scrollTop=0;});
  if(process.env.TEACHER_HEALTH_SHOTS_DIR){await mkdir(process.env.TEACHER_HEALTH_SHOTS_DIR,{recursive:true});await page.locator('.item-health').screenshot({path:join(process.env.TEACHER_HEALTH_SHOTS_DIR,`teacher-health-${width}.png`)});}
 }
});
test('filter changes, empty data, partial class error and logout clear results; late requests cannot refill',async t=>{
 const page=await pageFor(t);const read=page.getByRole('button',{name:'讀取題目健檢',exact:true});
 await read.click();await page.locator('.item-health table').waitFor();
 await page.evaluate(()=>{app.state.fetcher=()=>new Promise(r=>window.finishHealth=r);});await read.click();await page.waitForFunction(()=>typeof finishHealth==='function');
 await page.getByLabel('活動篩選').selectOption('6');await page.evaluate(()=>finishHealth(Response.json(healthFixture())));
 await page.waitForTimeout(30);assert.equal(await page.locator('.item-health table').count(),0);
 await page.evaluate(()=>{app.state.fetcher=async(url,init)=>Response.json(healthFixture({...JSON.parse(init.body),pending:3}));});
 await read.click();await page.locator('.item-health table').waitFor();assert.match(await page.locator('.item-health tbody tr').first().textContent(),/50%/);
 await page.evaluate(()=>{app.state.fetcher=async()=>Response.json({error:'health_class_incomplete'},{status:503});});await read.click();await page.getByText(/班級分組或名冊未完整確認/).waitFor();assert.equal(await page.locator('.item-health table').count(),0);
 await page.evaluate(()=>{app.state.fetcher=async(url,init)=>{const v=healthFixture(JSON.parse(init.body));v.since=null;v.rows=v.rows.map(r=>({...r,started:0,attempted:0,attempts:0,wrong:0,passed:0,pending:0,wrongPeople:0,stuck:0,firstPassRate:null,averageAttempts:null}));return Response.json(v);};});
 await read.click();await page.getByText(/目前沒有啟用後的統計/).waitFor();assert.equal(await page.locator('.item-health table').count(),0);
 await page.evaluate(()=>{app.state.fetcher=async(url,init)=>Response.json(healthFixture(JSON.parse(init.body)));});await read.click();await page.locator('.item-health table').waitFor();
 await page.getByRole('button',{name:'登出／換人',exact:true}).click();assert.equal(await page.locator('.item-health table').count(),0);assert.equal(await read.isDisabled(),true);
});
