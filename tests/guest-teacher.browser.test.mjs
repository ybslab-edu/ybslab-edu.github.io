// 沿用既有本機 UTF-8 伺服器與進場方式；SDK 完全替換為合成資料，攔截所有外部請求。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
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
    assert.equal(await row.locator('.cloud-xp').innerText(),'Lv 1 位元見習生\n25 XP');
    assert.equal(await page.locator('#cloud-table th').filter({hasText:'等級／XP'}).count(),1);
    assert.deepEqual(await page.locator('#cloud-table tbody tr td:first-child').allTextContents(),['1','2']);
    const shots='/tmp/ybs-xp-p3-shots'; await mkdir(shots,{recursive:true});
    await page.screenshot({path:shots+'/teacher-'+width+'-overview.png',fullPage:true});
    await row.locator('.cloud-xp').scrollIntoViewIfNeeded();
    await page.screenshot({path:shots+'/teacher-'+width+'-xp.png',fullPage:true});
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#cloud-export').click()]);
    assert.match(download.suggestedFilename(),/雲端紀錄/);
    const bytes=[...await readFile(await download.path())];
    const exported=await page.evaluate(bytes=>{
      const book=XLSX.read(new Uint8Array(bytes),{type:'array',cellDates:true});
      return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
    },bytes);
    assert.deepEqual(exported[0].slice(-2),['等級','XP']);
    assert.deepEqual(exported[1].slice(-2),[1,25]);
    assert.deepEqual(exported.at(-1).slice(-2),['—','—']);
    await page.locator('#cloud-class').selectOption('999');
    assert.equal(await page.locator('#cloud-table tbody tr').nth(1).locator('.cloud-xp').innerText(),'—');
    await page.locator('#cloud-logout').click();assert.equal(await page.locator('#cloud-table').innerText(),'');
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});

for(const [width,colorScheme] of [[1440,'light'],[390,'light'],[1440,'dark']])test(`教師首頁四類、唯讀狀態、鍵盤與截圖 ${width}px ${colorScheme}`,async()=>{
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme});
  const page=await context.newPage(), errors=[],external=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/assets/login.js'))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fake});
      if(url.startsWith(base+'/'))return route.continue();
      external.push(url);return route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-11-10T04:00:00Z'));
    await page.goto(base+'/115-g9/teacher/');
    assert.deepEqual(await page.locator('.category h2').allTextContents(),['學生紀錄','題目與活動','課程設定','其他工具']);
    assert.equal(await page.locator('.category-nav a').count(),4);
    for(const href of ['../../','../../115-df/teacher/','https://class-score-86020.web.app'])assert.ok(await page.locator(`a[href="${href}"]`).count()>0);
    assert.equal(await page.locator('#teacher-courses article').count(),2);
    assert.match(await page.locator('#teacher-courses article').nth(1).innerText(),/課程未開設\s+已開放 0/);
    assert.equal(await page.locator('#course-settings button, #course-settings input, #course-settings select').count(),0);
    assert.equal(await page.locator('#teacher-activities a').count(),await page.evaluate(()=>ACTIVITIES.length));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),colorScheme==='dark'?'rgb(17, 22, 27)':'rgb(245, 247, 249)');
    await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Enter');assert.equal(await page.locator('#student-records').evaluate(e=>e===document.activeElement),true);
    const summary=page.locator('.activity-catalog > summary');await summary.focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#teacher-activities').isVisible(),true);
    assert.ok(await page.locator('#teacher-activities li .state-open').count()>0);
    assert.equal(await page.locator('#teacher-activities section').nth(1).locator('.state-open').count(),0);
    await page.keyboard.press('Enter');
    await page.locator('h1').click();await page.evaluate(()=>scrollTo(0,0));
    const shots='/tmp/ybs-teacher-home-shots';await mkdir(shots,{recursive:true});
    const name=colorScheme==='dark'?'dark':width===390?'mobile':'desktop';
    await page.screenshot({path:shots+'/'+name+'.png',fullPage:true});
    await page.locator('#cloud-login').click();
    await page.evaluate(()=>synthetic.hold=true);
    await page.locator('#cloud-read').click();
    await page.waitForFunction(()=>synthetic.release?.length===3);
    assert.equal(await page.locator('#cloud-table a').count(),0);
    await page.evaluate(()=>{synthetic.hold=false;synthetic.release.forEach(r=>r())});
    await page.waitForFunction(()=>!document.getElementById('cloud-class').disabled);
    for(const cls of ['998','999','998']){
      await page.locator('#cloud-class').selectOption(cls);
      const links=page.locator('#cloud-table tbody tr a');
      assert.equal(await links.count(),cls==='998'?2:3);
      for(let i=0;i<await links.count();i++)assert.equal(await links.nth(i).getAttribute('href'),'../me/?cls='+cls+'&seat='+(i+1));
    }
    // 讀取會清空並重建表格，不能留下重複或失效連結。
    await page.locator('#cloud-read').click();
    await page.locator('#cloud-class').selectOption('998');
    assert.equal(await page.locator('#cloud-table tbody tr a').count(),2);
    const link=page.locator('#cloud-table tbody tr a').first();await link.focus();
    assert.equal(await link.evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('ArrowRight');
    await link.scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===1440&&colorScheme==='light')await page.locator('[aria-label="雲端過關紀錄"]').screenshot({path:shots+'/cloud-table.png'});
    await page.locator('#cloud-logout').click();assert.equal(await page.locator('#cloud-table a').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  }finally{await context.close()}
});
