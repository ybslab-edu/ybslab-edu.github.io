// 全程僅讀本機；教師通行碼與 Firebase 均為合成資料。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fakeFirebase} from './fixtures/df-firebase.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let browser,server,base;
before(async()=>{
  server=createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!path.startsWith(root+sep)){res.writeHead(404).end();return;}
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok));});
async function setup(t,width=1440,{dfOpen=false,g9Closed=false}={}){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Taipei'});
  t.after(()=>context.close());
  const errors=[];
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith(base+'/assets/curriculum.js')){
      let source=await readFile(resolve(root,'assets/curriculum.js'),'utf8');
      if(dfOpen)source=source.replace('open: false','open: true');
      if(g9Closed)source=source.replace('year: 115, open: true','year: 115, open: false');
      return route.fulfill({contentType:'text/javascript',body:source});
    }
    if(url.startsWith(base+'/assets/teacher.js')){
      const hash=createHash('sha256').update('ybslab-teacher:synthetic-course-code').digest('hex');
      return route.fulfill({contentType:'text/javascript',body:(await readFile(resolve(root,'assets/teacher.js'),'utf8')).replace(/const HASH = '[a-f0-9]+'/,`const HASH = '${hash}'`)});
    }
    if(url.startsWith(base+'/'))return route.continue();
    if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:url.includes('app-compat')?fakeFirebase:''});
    return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  t.after(()=>assert.deepEqual(errors,[]));
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+08:00'));
  return page;
}
for(const width of [1440,390])test(`首頁與地圖只顯示開設課程，${width}px 截圖`,async t=>{
  const page=await setup(t,width);
  await page.goto(base+'/');
  assert.deepEqual(await page.locator('#grid .rowname').allTextContents(),['資訊科技九年級']);
  assert.equal(await page.locator('a[href*="115-df/"]').count(),0);
  assert.ok(await page.locator('#grid a[href^="115-g9/"]').count()>0);
  await page.locator('[data-t="115-2"]').click();
  assert.deepEqual(await page.locator('#grid .rowname').allTextContents(),['資訊科技九年級']);
  await page.locator('[data-t="115-1"]').click();
  await mkdir('/tmp/ybs-course-enable-shots',{recursive:true});
  await page.locator('#progress').screenshot({path:`/tmp/ybs-course-enable-shots/home-progress-${width}.png`});
  await page.goto(base+'/map/#D-IV-1');
  assert.equal(await page.locator('a[href*="115-df/"]').count(),0);
  assert.equal(await page.evaluate(()=>Object.values(byCode).flat().some(a=>a.course==='115-df')),false);
  assert.equal(await page.evaluate(()=>Object.values(byCode).flat().some(a=>a.course==='115-g9')),true);
});
test('未開設活動鎖定；合成教師通行碼可解鎖，教師頁與九年級照常',async t=>{
  const page=await setup(t);
  await page.goto(base+'/115-df/a/');
  assert.equal(await page.locator('#ybs-lock h1').textContent(),'本學年未開設這門課');
  page.once('dialog',d=>d.accept('synthetic-course-code'));
  await page.click('#ybs-unlock');
  await page.waitForFunction(()=>sessionStorage.getItem('ybslab:teacher')==='1');
  await page.waitForLoadState('load');
  await page.locator('#ybs-lock').waitFor({state:'detached'});
  await page.reload();assert.equal(await page.locator('#ybs-lock').count(),0);
  await page.evaluate(()=>sessionStorage.removeItem('ybslab:teacher'));
  await page.goto(base+'/115-df/teacher/');
  assert.equal(await page.locator('#ybs-lock').count(),0);
  assert.equal(await page.locator('#cloud-login').isVisible(),true);
  await page.goto(base+'/115-g9/u2-02/');
  assert.equal(await page.locator('#ybs-lock').count(),0);
});
test('只改 open 即恢復專題入口與活動；九年級關閉也優先於提早開放',async t=>{
  const page=await setup(t,1440,{dfOpen:true});
  await page.goto(base+'/');assert.equal(await page.locator('#grid .rowname').count(),2);
  await page.goto(base+'/map/#D-IV-1');
  assert.equal(await page.evaluate(()=>Object.values(byCode).flat().some(a=>a.course==='115-df')),true);
  await page.goto(base+'/115-df/a/');assert.equal(await page.locator('#ybs-lock').count(),0);
  const closed=await setup(t,1440,{g9Closed:true});
  for(const path of ['115-g9/u1-05/','115-g9/u1-06/','115-g9/u2-02/']){
    await closed.goto(base+'/'+path);
    assert.equal(await closed.locator('#ybs-lock h1').textContent(),'本學年未開設這門課');
  }
});
