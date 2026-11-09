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
  const records=[attempt('a','a',2),attempt('a','a',5,1)];
  records.forEach((doc,i)=>{const original=doc.data;doc.data=()=>({...original(),passedAt:{toMillis:()=>Date.parse('2026-11-08T15:59:00Z')+i*60000}})});
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

for(const width of [1440,390])test(`教師補做標示 ${width}px：台灣時間、顏色文字、彙總、匯出及登出`,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'America/New_York'});
  const page=await context.newPage(),errors=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>sessionStorage.setItem('ybslab:teacher','1'));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/assets/login.js'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fake});
      return url.startsWith(base+'/')?route.continue():route.abort();
    });
    await page.goto(base+'/115-g9/teacher/');
    await page.evaluate(()=>{W[1]={...W[1],date:'2026-11-02'}});
    await page.locator('#cloud-login').click();await page.locator('#cloud-read').click();
    await page.locator('#cloud-class').selectOption('998');
    const row=page.locator('#cloud-table tbody tr').first(),cell=row.locator('td').nth(1);
    assert.match(await cell.innerText(),/第 1 關：11\/08 23:59 準時/);
    assert.match(await cell.innerText(),/第 2 關：11\/09 00:00 補做/);
    assert.match(await row.innerText(),/準時 1 關、補做 1 關/);
    assert.notEqual(await cell.locator('.cloud-late').evaluate(e=>getComputedStyle(e).color),await cell.locator('.cloud-on-time').evaluate(e=>getComputedStyle(e).color));
    assert.match(await page.locator('body').innerText(),/開放後 7 天內/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#cloud-export').click()]);
    assert.match(download.suggestedFilename(),/雲端紀錄/);
    await page.locator('#cloud-logout').click();assert.equal(await page.locator('#cloud-table').innerText(),'');
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
