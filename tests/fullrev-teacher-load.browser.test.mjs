import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const markup=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><script src="/assets/xp.js"></script></head><body><main class="wrap"><h1>教師紀錄與匯出（合成測試）</h1><div id="tools"></div><p id="status" role="status"></p><div id="content"></div></main><script type="module">
import {teacherLoadFixture} from '/tests/fixtures/fullrev-teacher-load.mjs';
import {config} from '/tests/fixtures/fullrev.mjs';
import {teacherOverview,mountTeacherPanel} from '/assets/fullrev-teacher-page.mjs';
const {activities,snapshots}=teacherLoadFixture();
const options={project:config.firebase.projectId,course:'115-g9',activities};
window.fixture={activities,snapshots};window.project=()=>teacherOverview(snapshots,options,YBSXP);
const content=document.querySelector('#content');window.builds=[];let started;
const replace=content.replaceChildren.bind(content),append=content.append.bind(content);
content.replaceChildren=(...args)=>{started=performance.now();replace(...args);};
content.append=(...args)=>{append(...args);void content.offsetHeight;builds.push(performance.now()-started);};
const p={root:document.querySelector('main'),tools:document.querySelector('#tools'),status:document.querySelector('#status'),content,
 client:{project:options.project,course:options.course,state:()=>({profile:{uid:'synthetic-owner'}})},active:()=>true,cleanup(){},subscribe(){}};
mountTeacherPanel(p,{catalog:()=>activities,xpCore:async()=>YBSXP,teacherSnapshots:async()=>snapshots,mountHistory:()=>({clear(){}}),eventsRefresh(){},explain:e=>e.message});
window.ready=true;
</script></body></html>`;
async function pageFor(t,width=1280){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:markup});
  const path=url.pathname.slice(1);
  if(!/^(assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-teacher-load)?\.mjs)$/.test(path))return route.abort();
  return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('../'+path,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/115-g9/teacher/');await page.waitForFunction(()=>window.ready);
 t.after(()=>assert.deepEqual(errors,[]));return page;
}
test('30×30 純合成效能基準：投影、首次呈現、DOM 建立、活動篩選與節點數',async t=>{
 const page=await pageFor(t);
 const metrics=await page.evaluate(async()=>{
  document.querySelector('#teacher-class').value='c901';
  const start=performance.now();await [...document.querySelectorAll('button')].find(b=>b.textContent==='讀取有效紀錄').onclick();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const firstPresentationMs=performance.now()-start,domBuildMs=builds.at(-1);
  const content=document.querySelector('#content'),cells=content.querySelectorAll('details').length,elements=content.querySelectorAll('*').length;
  const walker=document.createTreeWalker(content,NodeFilter.SHOW_ALL);let nodes=0;while(walker.nextNode())nodes++;
  const projectionStart=performance.now(),view=project(),projectionMs=performance.now()-projectionStart;
  const activity=document.querySelector('#teacher-activity'),filterStart=performance.now();activity.value='1';activity.dispatchEvent(new Event('change'));
  void content.offsetHeight;const activityFilterMs=performance.now()-filterStart;
  return {people:view.people.length,activities:fixture.activities.length,rounds:fixture.activities.reduce((n,a)=>n+a.rounds.length,0),exportRows:view.rows.length,
   projectionMs,firstPresentationMs,domBuildMs,activityFilterMs,elements,nodes,cells};
 });
 t.diagnostic(JSON.stringify(metrics));assert.equal(metrics.people,30);assert.equal(metrics.activities,30);assert.equal(metrics.rounds,121);assert.equal(metrics.exportRows,3661);
 assert.equal(metrics.cells,900);assert.ok(metrics.firstPresentationMs<1000,JSON.stringify(metrics));
 assert.ok(metrics.elements<=6000,JSON.stringify(metrics));assert.ok(metrics.nodes<=6000,JSON.stringify(metrics));
 assert.ok(metrics.activityFilterMs<250,JSON.stringify(metrics));
});
for(const width of [360,1280])test(`教師 ${width}px：詳情首次展開才建、快速篩選隨活動切換且不影響匯出`,async t=>{
 const page=await pageFor(t,width);await page.locator('#teacher-class').fill('c901');await page.getByRole('button',{name:'讀取有效紀錄',exact:true}).click();
 await page.locator('.teacher-scroll').waitFor();assert.equal(await page.locator('details').count(),900);
 assert.equal(await page.locator('details p').count(),0);
 const detail=page.locator('details').first();await detail.locator('summary').click();
 await detail.locator('p').first().waitFor();assert.equal(await detail.locator('p').count(),6);
 assert.match(await detail.innerText(),/合成關卡 1：已確認過關/);assert.match(await detail.innerText(),/活動全過加成/);
 await detail.locator('summary').click();await detail.locator('summary').click();assert.equal(await detail.locator('p').count(),6);
 assert.equal(await page.locator('details').nth(1).locator('p').count(),0);
 const quick=page.getByRole('checkbox',{name:'只看待確認／未完成',exact:true});
 const quickFilterMs=await quick.evaluate(el=>{const start=performance.now();el.click();void document.querySelector('#content').offsetHeight;return performance.now()-start;});
 await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===20);
 t.diagnostic(`width=${width}; quickFilterMs=${quickFilterMs}`);assert.ok(quickFilterMs<250,`quick filter: ${quickFilterMs}ms`);
 assert.equal(await page.locator('details p').count(),0);
 await page.locator('#teacher-activity').selectOption('1');assert.equal(await page.locator('tbody tr').count(),10);
 assert.match(await page.locator('tbody').innerText(),/待老師確認/);
 await page.locator('#teacher-activity').selectOption('2');assert.equal(await page.locator('tbody tr').count(),0);
 assert.match(await page.locator('#content').innerText(),/沒有待確認或未完成/);
 await page.locator('#teacher-activity').selectOption('30');assert.equal(await page.locator('tbody tr').count(),10);
 await page.addScriptTag({content:await readFile(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8')});
 const pendingDownload=page.waitForEvent('download');await page.getByRole('button',{name:'重新確認並下載 Excel',exact:true}).click();
 const download=await pendingDownload,bytes=await readFile(await download.path());assert.equal(download.suggestedFilename(),'YBS_有效紀錄.xlsx');
 const exported=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets['有效紀錄'],{header:1});},[...bytes]);
 assert.deepEqual(exported,await page.evaluate(()=>project().rows));assert.equal(exported.length,3661);
 await quick.uncheck();assert.equal(await page.locator('tbody tr').count(),30);
 await page.locator('#teacher-activity').selectOption('');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.ok(await quick.evaluate(el=>el.getBoundingClientRect().height)>=44);
 if(process.env.YBS_DEBT4_SHOTS){await mkdir(process.env.YBS_DEBT4_SHOTS,{recursive:true});await page.screenshot({path:join(process.env.YBS_DEBT4_SHOTS,`teacher-overview-${width}.png`),fullPage:true});
  await quick.check();await page.locator('#teacher-activity').selectOption('1');await page.locator('details').first().locator('summary').click();
  await page.locator('details p').first().waitFor();await page.screenshot({path:join(process.env.YBS_DEBT4_SHOTS,`teacher-filter-detail-${width}.png`),fullPage:true});}
});
