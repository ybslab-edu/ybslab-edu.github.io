// 沿用已通過頁面測試的本機進場與教師 session；只用合成 Firebase。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {fakeCurriculumFirebase} from './fixtures/curriculum-firebase.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let server,browser,base;
before(async()=>{
  server=createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}
    try{
      const type=({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream';
      res.setHeader('Content-Type',type);res.end(await readFile(path));
    }catch{res.writeHead(404).end();}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok));});
async function pageFor(t,width=1100,remember=true){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-05T00:00:00Z'));
  if(remember)await context.addInitScript(()=>sessionStorage.setItem('ybslab:teacher','1'));
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base))return route.continue();
    if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:url.includes('app-compat')?fakeCurriculumFirebase:''});
    return route.abort();
  });
  t.after(async()=>{await context.close();assert.deepEqual(errors,[])});
  await page.goto(base+'/115-g9/teacher/report/');
  await page.locator('#report-login').waitFor();return page;
}
async function login(page){await page.click('#report-login');await page.waitForFunction(()=>!document.querySelector('#report-read').disabled);}
async function read(page){await page.click('#report-read');await page.waitForFunction(()=>!document.querySelector('#report-export').disabled);}
for(const width of [1440,390])test(`教師進場、課綱活動與班級篩選、Excel 實際內容（${width}px）`,async t=>{
  const page=await pageFor(t,width);
  assert.equal(await page.locator('#report-read').isDisabled(),true);
  assert.match(await page.textContent('#unlock-status'),/已解鎖/);
  await login(page);await read(page);
  assert.match(await page.textContent('#report-summary'),/名冊 3 人/);
  assert.ok(await page.locator('#report-rows tr').count()>20);
  await page.selectOption('#report-class','999');
  assert.match(await page.textContent('#report-summary'),/名冊 2 人/);
  const row=page.locator('#report-rows tr').filter({has:page.locator('th',{hasText:'資S-IV-2'})});
  assert.match(await row.textContent(),/深夜手搖店已開放 · 1\/2 人 · 50.0%/);
  assert.match(await row.locator('td').last().textContent(),/0.0%/);
  assert.ok((await page.textContent('#report-rows')).includes('未開放'));
  assert.ok((await page.textContent('#report-rows')).includes('未安排活動'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const downloadPromise=page.waitForEvent('download');await page.click('#report-export');const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),'課綱達成報告_115-g9_999.xlsx');
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const bytes=[...Buffer.concat(chunks)];
  const exported=await page.evaluate(bytes=>{
    const wb=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null});
  },bytes);
  const activity=exported.find(r=>r[0]==='資S-IV-2'&&r[7]===1);
  assert.equal(activity[2],'999');assert.equal(activity[3],2);assert.equal(activity[10],1);assert.equal(activity[11],.5);
  assert.ok(!JSON.stringify(exported).includes('@example.invalid'));
  const reads=await page.evaluate(()=>__reportFake.reads);
  assert.deepEqual(reads.map(r=>r[0]),['ybsCourses/115-g9','ybsCourses/115-g9/roster','ybsCourses/115-g9/attempts']);
  assert.ok(reads.every(r=>r[1].source==='server'));
  await page.selectOption('#report-class','998');assert.match(await page.textContent('#report-summary'),/名冊 1 人/);
  assert.match(await row.textContent(),/0\/1 人 · 0.0%/);
  await page.click('#report-logout');assert.equal(await page.locator('#report-rows tr').count(),0);assert.equal(await page.locator('#report-export').isDisabled(),true);
});
test('非 owner、讀取失敗均清除畫面；可重試；不讀取 guestAttempts 或私人資料',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>__reportFake.owner='other');await page.click('#report-read');
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('無權限'));
  assert.equal(await page.evaluate(()=>__reportFake.reads.length),1);
  assert.equal(await page.locator('#report-export').isDisabled(),true);
  await page.evaluate(()=>{__reportFake.owner='teacher1';__reportFake.fail=true;});await page.click('#report-read');
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('失敗'));
  await page.evaluate(()=>__reportFake.fail=false);await read(page);
  await page.evaluate(()=>__reportFake.fail=true);await page.click('#report-read');
  await page.waitForFunction(()=>document.querySelector('#report-status').textContent.includes('失敗'));
  assert.equal(await page.locator('#report-rows tr').count(),0);assert.equal(await page.locator('#report-export').isDisabled(),true);
});
for(const action of ['logout','switch'])test(`讀取中 ${action}：遲到回應不恢復報告`,async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>__reportFake.hold=true);await page.click('#report-read');await page.waitForFunction(()=>__reportFake.release);
  if(action==='logout')await page.click('#report-logout');else await page.evaluate(()=>__reportFake.switchUser('teacher2'));
  await page.evaluate(()=>__reportFake.release());await page.waitForFunction(()=>!document.querySelector('#report-login').disabled);
  assert.equal(await page.locator('#report-rows tr').count(),0);assert.equal(await page.locator('#report-export').isDisabled(),true);
});
test('空名冊、空紀錄保留課綱與無分母提示；教師通行碼取消／錯誤不解鎖',async t=>{
  const page=await pageFor(t,1100,false);
  page.once('dialog',d=>d.dismiss());await page.click('#report-unlock');
  assert.equal(await page.evaluate(()=>TEACHER.remembered()),false);
  page.once('dialog',d=>d.accept('synthetic-wrong-code'));await page.click('#report-unlock');
  await page.waitForFunction(()=>document.querySelector('#unlock-status').textContent.includes('通行碼不對'));
  assert.equal(await page.evaluate(()=>TEACHER.remembered()),false);
  await login(page);await page.evaluate(()=>{__reportFake.roster=[];__reportFake.attempts=[];});await read(page);
  assert.match(await page.textContent('#report-summary'),/名冊 0 人/);assert.match(await page.textContent('#report-rows'),/無有效名冊/);
});
