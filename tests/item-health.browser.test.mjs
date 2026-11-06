// 沿用既有本機 UTF-8 伺服器與進場方式；SDK 完全替換為合成資料，攔截所有外部請求。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let server,browser,base;
const fake=`(() => {
  const state=window.synthetic={fail:false,empty:false,hold:false,queries:[]};
  let changed=()=>{};
  const auth={currentUser:null,onAuthStateChanged(f){changed=f;f(null)},
    async signInWithPopup(){auth.currentUser={uid:'synthetic-owner'};changed(auth.currentUser)},
    async signOut(){auth.currentUser=null;changed(null)}};
  const roster=['a','b','c','d','e'].map((email,i)=>({id:email+'@example.invalid',data:()=>({cls:i<2?998:999,seat:i<2?i+1:i-1})}));
  const attempt=(uid,email,tries,round=0)=>({id:uid+'_1_'+round,data:()=>({uid,email:email+'@example.invalid',activity:1,round,level:1,tries,passedAt:{toMillis:()=>1}})});
  const records=[attempt('a','a',2),attempt('b','b',6),attempt('c','c',4),attempt('outside','outside',999),attempt('a','a',5,1)];
  const db={doc:path=>({get:async()=>({exists:true,data:()=>({ownerUid:'synthetic-owner'})})}),
    collection:path=>({get:async()=>{
      state.queries.push(path);
      if(state.hold)await new Promise(r=>(state.release ||= []).push(r));
      if(state.fail)throw Error('synthetic');
      const name=path.split('/').at(-1);
      return {docs:state.empty?[]:name==='roster'?roster:name==='attempts'?records:[{id:'guest_1_0',data:()=>({cls:'999',seat:2,activity:1,round:0,level:1,tries:999,verified:false,passedAt:{toMillis:()=>1}})}]};
    }})};
  window.YBS={firebaseSession:async()=>({auth,db})};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{}}
  window.firebase={auth:{GoogleAuthProvider}};
})();`;
before(async()=>{
  server=createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!path.startsWith(root+sep)){res.writeHead(404).end();return}
    try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}
    catch{res.writeHead(404).end()}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
for(const width of [1440,390])test(`教師頁題目健檢 ${width}px：登入讀取、帳號統計、篩班、標紅與清除`,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>sessionStorage.setItem('ybslab:teacher','1'));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/assets/login.js'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fake});
      return url.startsWith(base)?route.continue():route.abort();
    });
    await page.goto(base+'/115-g9/teacher/');
    const rows=page.locator('#health-table tbody tr'),first=rows.first(),cells=first.locator('td');
    assert.equal(await page.locator('#health-class').isDisabled(),true);
    await page.locator('#cloud-login').click();await page.locator('#cloud-read').click();
    await page.locator('#health-status').filter({hasText:'名冊 5 人'}).waitFor();
    assert.ok(await rows.count()>100);
    assert.deepEqual((await cells.allTextContents()).slice(2),['3／5','60%','4','4','6','—']);
    assert.equal(await first.getAttribute('class'),null);
    assert.match(await rows.nth(1).getAttribute('class'),/health-warning/);
    assert.equal(await rows.nth(1).locator('td').nth(7).textContent(),'過關率低、平均次數高');
    assert.equal(await first.evaluate(e=>getComputedStyle(e.firstElementChild).color)===await rows.nth(1).evaluate(e=>getComputedStyle(e.firstElementChild).color),false);
    await page.locator('#health-class').selectOption('998');
    assert.deepEqual((await cells.allTextContents()).slice(2,7),['2／2','100%','4','4','6']);
    await page.locator('#health-class').selectOption('999');
    assert.deepEqual((await cells.allTextContents()).slice(2,7),['1／3','33.33%','4','4','4']);
    assert.match(await first.getAttribute('class'),/health-warning/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>synthetic.fail=true);await page.locator('#cloud-read').click();
    await page.locator('#cloud-status').filter({hasText:'讀取失敗'}).waitFor();assert.equal(await rows.count(),0);assert.equal(await page.locator('#health-class').isDisabled(),true);
    await page.evaluate(()=>{synthetic.fail=false;synthetic.empty=true});await page.locator('#cloud-read').click();
    await page.locator('#health-status').filter({hasText:'名冊 0 人'}).waitFor();assert.deepEqual((await cells.allTextContents()).slice(2),['0／0','—','—','—','—','—']);assert.equal(await page.locator('#health-table .health-warning').count(),0);
    await page.evaluate(()=>{synthetic.empty=false;synthetic.hold=true});await page.locator('#cloud-read').click();
    await page.waitForFunction(()=>synthetic.release?.length===3);
    await page.locator('#cloud-logout').click();await page.evaluate(()=>{synthetic.hold=false;synthetic.release.forEach(r=>r())});
    await page.locator('#cloud-read').waitFor({state:'visible'});
    assert.equal(await rows.count(),0);assert.equal(await page.locator('#health-class').isDisabled(),true);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
