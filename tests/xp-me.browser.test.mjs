// 全部為合成資料；禁止任何本機伺服器以外的網路請求。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base;
const mock=`(() => {
  let profile=null;
  window.meMock={reads:[],mode:'ok',pending:[],login:null};
  const records=[0,1,2,3].map(round=>({uid:'synthetic-one',activity:1,round,at:Date.parse('2026-10-12T01:00:00Z')}));
  records.push({uid:'synthetic-one',activity:2,round:0});
  window.YBS={profile:()=>profile, status:cb=>{meMock.status=cb},
    button:(el,ok)=>{meMock.login=uid=>{profile={uid};ok(profile)};el.innerHTML='<button id="mock-login">登入合成帳號</button>';el.firstChild.onclick=()=>meMock.login('synthetic-one')},
    logout:()=>{profile=null},firebaseSession:async()=>({auth:{get currentUser(){return profile}},db:{collection:path=>({where:(field,op,uid)=>({get:async()=>{
      if(path!=='ybsCourses/115-g9/attempts'||field!=='uid'||op!=='=='||uid!==profile.uid)throw Error('unexpected query');
      meMock.reads.push({path,field,op,uid});
      const mode=meMock.mode;
      if(mode==='wait')await new Promise(resolve=>meMock.pending.push(resolve));
      if(mode==='error')throw Error('synthetic offline');
      return {metadata:{fromCache:mode==='cache'},docs:(uid==='synthetic-one'?records:[]).concat([{uid:'synthetic-other',activity:3,round:0}]).map(r=>({data:()=>r}))};
    }})})}})};
})();`;
before(async()=>{
  server=createServer(async(req,res)=>{
    let path=new URL(req.url,'http://127.0.0.1').pathname;
    if(path==='/115-g9/me/')path+='index.html';
    const allowed=['/115-g9/me/index.html','/115-g9/me/me.js','/115-g9/me/me.css','/assets/login.js','/assets/xp.js','/assets/curriculum.js','/assets/activities.js','/assets/lock.js','/assets/favicon.svg'];
    if(!allowed.includes(path))return res.writeHead(404).end();
    const type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});
    res.end(path==='/assets/login.js' && !req.headers.referer?.endsWith('?real-login') ? mock : await readFile(new URL('..'+path,import.meta.url)));
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  await mkdir('/tmp/ybs-xp-p2-shots',{recursive:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
async function pageFor(t,options={},suffix=''){
  const page=await browser.newPage(options);t.after(()=>page.close());
  const errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route('**/*',r=>{
    if(r.request().url().startsWith(base+'/'))return r.continue();
    outside.push(r.request().url());return r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-11-09T04:00:00Z'));
  await page.goto(base+'/115-g9/me/'+suffix);
  t.after(()=>{assert.deepEqual(errors,[]);assert.deepEqual(outside,[])});
  return page;
}
test('沿用真正登入元件；未登入及班座本機紀錄不觸發雲端或顯示 XP',async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},colorScheme:'dark'},'?real-login');
  assert.equal(await page.locator('.ybs-login input[name="a"]').count(),1);
  assert.equal(await page.locator('.ybs-login input[type="password"]').count(),1);
  await page.evaluate(()=>{
    localStorage.setItem('it9:w1:999-1',JSON.stringify({mask:15,tries:[2,2,2,2],time:1}));
    localStorage.setItem('ybs:xp:115-g9:seat:999-1',JSON.stringify({totalXP:9999}));
  });
  await page.reload();
  assert.equal(await page.locator('#growth').isVisible(),false);
  assert.match(await page.locator('#signin').textContent(),/用帳號登入就能累積等級/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
for(const [width,colorScheme,reducedMotion] of [[1440,'light','no-preference'],[390,'dark','reduce']]){
  test(`個人成長頁：未登入、本人紀錄、${width}px、${colorScheme}`,async t=>{
    const page=await pageFor(t,{viewport:{width,height:1000},colorScheme,reducedMotion});
    assert.equal(await page.locator('#signin-title').textContent(),'用帳號登入就能累積等級');
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.evaluate(()=>meMock.reads.length),0);
    await page.click('#mock-login');
    await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
    assert.equal(await page.locator('.station').count(),30);
    assert.equal(await page.locator('.station.visited').count(),2);
    assert.equal(await page.locator('.station[data-state="complete"]').count(),1);
    assert.equal(await page.locator('.badge.earned').count(),1);
    assert.match(await page.locator('#route h3').first().textContent(),/第 \d+ 週/);
    const weeks=await page.locator('#route h3').allTextContents();
    assert.ok(weeks.some(w=>w.includes('上學期')));
    assert.ok(weeks.some(w=>w.includes('下學期')));
    assert.equal(await page.locator('#axes li').count(),6);
    assert.equal(await page.locator('svg .area').count(),1);
    assert.match(await page.locator('#axes').textContent(),/已開放.*完成率/);
    await page.locator('#details summary').filter({hasText:'深夜手搖店'}).click();
    assert.match(await page.locator('#details details[open]').textContent(),/過關 40＋準時 20＋全過 20/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(colorScheme==='dark')assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 29, 27)');
    await page.screenshot({path:'/tmp/ybs-xp-p2-shots/'+(width===390?'mobile-dark':'desktop')+'.png',fullPage:true});
    await page.click('#logout');
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.locator('#total').textContent(),'');
    assert.match(await page.locator('#status').textContent(),/用帳號登入/);
    await page.evaluate(()=>meMock.login('synthetic-two'));
    await page.waitForFunction(()=>document.getElementById('total').textContent==='0 XP');
    assert.equal(await page.locator('.badge.earned').count(),0);
  });
}
test('離線快取及錯誤不顯示假零；重試成功，更新失敗保留已確認紀錄',async t=>{
  const page=await pageFor(t);
  await page.evaluate(()=>{meMock.mode='cache';meMock.login('synthetic-one')});
  await page.waitForFunction(()=>!document.getElementById('retry').hidden);
  assert.equal(await page.locator('#growth').isVisible(),false);
  await page.evaluate(()=>{meMock.mode='error'});await page.click('#retry');
  await page.waitForFunction(()=>!document.getElementById('retry').hidden);
  assert.equal(await page.locator('#growth').isVisible(),false);
  await page.evaluate(()=>{meMock.mode='ok'});await page.click('#retry');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
  await page.evaluate(()=>{meMock.mode='error'});await page.click('#retry');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('保留上次'));
  assert.equal(await page.locator('#total').textContent(),'90 XP');
});
test('舊帳號慢回應在登出換人後丟棄',async t=>{
  const page=await pageFor(t);
  await page.evaluate(()=>{meMock.mode='wait';meMock.login('synthetic-one')});
  await page.waitForFunction(()=>meMock.pending.length===1);
  await page.click('#logout');
  await page.evaluate(()=>{meMock.mode='ok';meMock.login('synthetic-two')});
  await page.waitForFunction(()=>document.getElementById('total').textContent==='0 XP');
  await page.evaluate(()=>meMock.pending[0]());
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#total').textContent(),'0 XP');
  assert.equal(await page.locator('.station.visited').count(),0);
});
test('提早開放清單與共同日期規則皆納入；路線週次由 date 計算',async t=>{
  const page=await pageFor(t);
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
  await page.click('#mock-login');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
  assert.equal(await page.locator('.station a').count(),4);
  assert.equal(await page.locator('.station[data-state="upcoming"]').count(),26);
  assert.match(await page.locator('#route').textContent(),/第 7 週/);
});
