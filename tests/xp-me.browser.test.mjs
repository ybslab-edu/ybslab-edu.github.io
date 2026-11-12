// 全部為合成資料；禁止任何本機伺服器以外的網路請求。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {teacherFirebase} from './fixtures/me-teacher.mjs';
import {sessionFirebase} from './fixtures/login-session.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base;
const mock=`(() => {
  let profile=null;
  window.meMock={reads:[],mode:'ok',pending:[],login:null};
  const records=[0,1,2,3].map(round=>({uid:'synthetic-one',activity:1,round,at:Date.parse('2026-10-12T01:00:00Z')}));
  records.push({uid:'synthetic-one',activity:2,round:0});
  meMock.records=records;
  window.YBS={enabled:()=>true,whoami:async()=>({ok:true,student:{cls:999,seat:1}}),flush(){},submit(){},guest(){},profile:()=>profile, status:cb=>{meMock.status=cb},
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
    if(['/115-g9/me/','/115-g9/u2-03/'].includes(path))path+='index.html';
    const allowed=['/115-g9/me/index.html','/115-g9/me/me.js','/115-g9/me/me-teacher.js','/115-g9/me/me.css','/assets/login.js','/assets/xp.js','/assets/curriculum.js','/assets/activities.js','/assets/lock.js','/assets/favicon.svg','/115-g9/u2-03/index.html','/assets/shell.js','/assets/shell.css','/assets/teacher.js','/assets/warmup.js','/assets/warmup-bank.js'];
    if(!allowed.includes(path))return res.writeHead(404).end();
    const type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});
    const source=path==='/assets/login.js' && !req.headers.referer?.endsWith('?real-login') && !req.headers.referer?.includes('cls=') ? mock : await readFile(new URL('..'+path,import.meta.url),'utf8');
    res.end(['/115-g9/u2-03/index.html','/115-g9/me/index.html'].includes(path) ? source.replace(/<link[^>]+https:\/\/fonts\.googleapis\.com[^>]*>/g,'') : source);
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  await mkdir('/tmp/ybs-me-impl-shots',{recursive:true});
  await mkdir('/tmp/ybs-me-teacher-shots',{recursive:true});
  await mkdir('/tmp/ybs-me-icon-shots',{recursive:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
async function pageFor(t,options={},suffix='',context){
  if(!context){context=await browser.newContext({...options,serviceWorkers:'block'});t.after(()=>context.close());}
  const page=await context.newPage();t.after(()=>page.close());
  const errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.route('**/*',r=>{
    if(r.request().url().startsWith(base+'/'))return r.continue();
    // 真正登入入口會主動還原 Auth；SDK 由離線替身提供，支援 LOCAL 跨分頁同步。
    if(r.request().url().startsWith('https://www.gstatic.com/firebasejs/10.14.1/'))return r.fulfill({contentType:'text/javascript',body:r.request().url().endsWith('/firebase-app-compat.js')?(page.url().includes('cls=')?teacherFirebase:sessionFirebase):'// offline mock'});
    // 新外框透過 CSS import 載入字型；離線驗證提供空樣式，不對外下載。
    if(new URL(r.request().url()).hostname==='fonts.googleapis.com')return r.fulfill({contentType:'text/css',body:'/* offline font fallback */'});
    outside.push(r.request().url());return r.abort();
  });
  await page.clock.setFixedTime(new Date('2026-11-09T04:00:00Z'));
  await page.goto(base+'/115-g9/me/'+suffix);
  if(suffix.includes('cls=') && !suffix.includes('seat=61'))await page.waitForFunction(()=>window.meTeacherMock?.auths.has('ybs-me-teacher'));
  t.after(()=>{assert.deepEqual(errors,[]);assert.deepEqual(outside,[])});
  return page;
}
for(const width of [1440,390]){
  test(`未登入密碼眼睛圖示維持小尺寸：${width}px`,async t=>{
    const page=await pageFor(t,{viewport:{width,height:width===390?844:1000}},'?real-login');
    assert.equal(await page.locator('#growth').isVisible(),false);
    const icon=page.locator('svg.ybs-password-icon');
    assert.equal(await icon.count(),1);
    const box=await icon.boundingBox();
    assert.ok(box && box.width>0 && box.width<=24 && box.height>0 && box.height<=24,
      `密碼眼睛圖示尺寸：${JSON.stringify(box)}`);
    await page.screenshot({path:`/tmp/ybs-me-icon-shots/signin-${width===390?'390':'desktop'}.png`,fullPage:true});
  });
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
for(const [width,colorScheme,reducedMotion] of [[1440,'light','no-preference'],[1440,'dark','reduce'],[390,'light','no-preference']]){
  test(`C3 正式成長頁、本人紀錄與截圖：${width}px、${colorScheme}`,async t=>{
    const page=await pageFor(t,{viewport:{width,height:width===390?844:1000},colorScheme,reducedMotion});
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.evaluate(()=>meMock.reads.length),0);
    await page.click('#mock-login');
    await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
    assert.equal(await page.locator('.station, #available-weeks li').count(),30);
    assert.equal(await page.locator('.station.visited').count(),2);
    assert.equal(await page.locator('.station[data-state="complete"]').count(),1);
    assert.equal(await page.locator('.route-badge').count(),1);
    assert.equal(await page.locator('#badge-count').textContent(),'1');
    assert.equal(await page.locator('.route-badge.theme-S').count(),1);
    assert.equal(await page.locator('.station:not([data-state="complete"]) .route-badge').count(),0);
    assert.match(await page.locator('.station[data-state="complete"] .learned').textContent(),/學會了什麼/);
    const source=await page.evaluate(()=>ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===1));
    assert.equal(await page.locator('.station[data-activity="1"] .learned').textContent(),'學會了什麼'+source.topic);
    const current=await page.evaluate(()=>ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===2));
    assert.equal(await page.locator('#continue-link').getAttribute('href'),'../../'+current.href);
    assert.equal(await page.locator('.station[aria-current="step"] .route-continue').getAttribute('href'),'../../'+current.href);
    assert.equal(await page.locator('#current-week').textContent(),await page.evaluate(a=>'W'+String(termWeekOf(a)).padStart(2,'0'),current));
    assert.equal(await page.locator('#axes li').count(),6);
    assert.equal(await page.locator('svg .plot-outline').count(),1);
    const radar=await page.locator('#radar svg').boundingBox();
    assert.ok(radar && radar.width>=280 && radar.width<=(width===390?300:340),`六邊形寬度：${radar?.width}px`);
    assert.equal(await page.locator('#xp-details').getAttribute('open'),null);
    assert.equal(await page.locator('#details').isVisible(),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    // 任務日誌主題只做深色：不論系統偏好，底色都是同一個
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(18, 21, 28)');
    const name=colorScheme==='dark'?'dark':width===390?'mobile':'desktop';
    await page.screenshot({path:'/tmp/ybs-me-impl-shots/'+name+'.png',fullPage:true});
    await page.click('#xp-details > summary');
    const xpSummary=page.locator('#details > .xp-item > summary').filter({hasText:'深夜手搖店'});
    await xpSummary.click();
    const breakdown=page.locator('#details > .xp-item[open] .xp-breakdown');
    assert.deepEqual(await breakdown.locator('dd').allTextContents(),['40','20','20']);
    await xpSummary.click();await page.click('#xp-details > summary');
    if(width===390){
      await page.click('#route-tab');
      await page.screenshot({path:'/tmp/ybs-me-impl-shots/mobile-route.png',fullPage:true});
    }
    await page.click('#logout');
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.locator('#total').textContent(),'');
    assert.equal(await page.locator('#continue-link').getAttribute('href'),null);
    await page.evaluate(()=>meMock.login('synthetic-two'));
    await page.waitForFunction(()=>document.getElementById('total').textContent==='0 XP');
    assert.equal(await page.locator('.route-badge').count(),0);
    assert.equal(await page.locator('#badge-count').textContent(),'0');
  });
}
test('未開放週、已開放未開始及 XP 明細均可收合',async t=>{
  const page=await pageFor(t);
  await page.click('#mock-login');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
  const future=page.locator('#future-weeks'), zero=page.locator('#zero-xp');
  assert.equal(await future.getAttribute('open'),null);
  const count=await future.locator('.route-week').count();
  assert.equal(await future.locator(':scope > summary').textContent(),'還有 '+count+' 週待開放');
  assert.ok(count>0);
  assert.match(await page.locator('#route > .timeline .station.locked').textContent(),/11.16/);
  assert.equal(await future.locator('.route-week').first().isVisible(),false);
  await future.locator(':scope > summary').click();
  assert.equal(await future.locator('.route-week').first().isVisible(),true);
  await future.locator(':scope > summary').click();
  assert.equal(await page.locator('#available-weeks').getAttribute('open'),null);
  await page.click('#available-weeks > summary');
  assert.equal(await page.locator('#available-weeks li').first().isVisible(),true);
  await page.click('#xp-details > summary');
  assert.equal(await zero.getAttribute('open'),null);
  assert.equal(await zero.locator(':scope > summary').textContent(),'尚未過關 28 項');
  assert.equal(await page.locator('#details > .xp-item').count(),2);
  assert.equal(await zero.locator('.xp-item').first().isVisible(),false);
  await zero.locator(':scope > summary').click();
  assert.equal(await zero.locator('.xp-item').count(),28);
  assert.equal(await zero.locator('.xp-item').first().isVisible(),true);
});
test('已開放／全學期切換同步完成率、關數、圖形、軸值與 ARIA',async t=>{
  const page=await pageFor(t);
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
  await page.click('#mock-login');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
  // 加入未開放活動紀錄，已開放範圍不能錯用全學期的分子。
  await page.evaluate(()=>meMock.records.push({uid:'synthetic-one',activity:8,round:0}));
  await page.click('#retry');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='100 XP');
  const openPlot=await page.locator('.plot-outline').getAttribute('points');
  assert.match(await page.locator('#completion-detail').textContent(),/^5 \/ 16 關完成/);
  assert.equal(await page.locator('#completion-rate').textContent(),'31%');
  assert.match(await page.locator('#axes [data-axis="S"]').textContent(),/5 \/ 8/);
  await page.click('[data-scope="term"]');
  assert.equal(await page.locator('[data-scope="term"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-scope="open"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#completion-label').textContent(),'全學期完成率');
  assert.match(await page.locator('#completion-detail').textContent(),/^6 \/ 121 關完成/);
  assert.equal(await page.locator('#completion-rate').textContent(),'5%');
  assert.match(await page.locator('#axes [data-axis="D"]').textContent(),/1 \/ /);
  assert.notEqual(await page.locator('.plot-outline').getAttribute('points'),openPlot);
  assert.match(await page.locator('#radar-desc').textContent(),/D 資料處理：1\//);
  await page.click('[data-scope="open"]');
  assert.equal(await page.locator('.plot-outline').getAttribute('points'),openPlot);
  assert.match(await page.locator('#chart-note').textContent(),/已開放關數/);
  assert.equal(await page.locator('#total').textContent(),'100 XP');
});
test('手機分頁支援鍵盤及 C3 的 700px 邊界；桌面回復、縮回保留選擇',async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844}});
  await page.click('#mock-login');
  await page.waitForFunction(()=>document.getElementById('total').textContent==='90 XP');
  const exploration=page.locator('#exploration-tab'),route=page.locator('#route-tab');
  assert.equal(await exploration.getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#exploration-panel').isVisible(),true);
  assert.equal(await page.locator('#route-panel').isVisible(),false);
  await exploration.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await route.getAttribute('aria-selected'),'true');
  assert.equal(await route.evaluate(el=>el===document.activeElement),true);
  assert.equal(await exploration.getAttribute('tabindex'),'-1');
  assert.equal(await page.locator('#exploration-panel').isVisible(),false);
  assert.equal(await page.locator('#route-panel').isVisible(),true);
  assert.equal(await page.locator('#route-panel').getAttribute('role'),'tabpanel');
  assert.equal(await page.locator('#route-panel').getAttribute('aria-labelledby'),'route-tab');
  await page.keyboard.press('Home');assert.equal(await exploration.getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await route.getAttribute('aria-selected'),'true');
  await page.keyboard.press('ArrowLeft');assert.equal(await exploration.getAttribute('aria-selected'),'true');
  await page.click('#route-tab');
  await page.setViewportSize({width:700,height:844});
  assert.equal(await page.locator('#growth-tabs').isVisible(),true);
  await page.setViewportSize({width:701,height:844});
  await page.waitForFunction(()=>document.getElementById('growth-tabs').hidden);
  assert.equal(await page.locator('#exploration-panel').isVisible(),true);
  assert.equal(await page.locator('#route-panel').isVisible(),true);
  assert.equal(await page.locator('#route-panel').getAttribute('role'),null);
  assert.equal(await page.locator('#route-panel').getAttribute('aria-labelledby'),'route-title');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.getElementById('growth-tabs').hidden);
  assert.equal(await page.locator('#route-panel').isVisible(),true);
  assert.equal(await page.locator('#exploration-panel').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
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
  assert.equal(await page.locator('.station h3 a, #available-weeks li a').count(),4);
  assert.equal(await page.locator('.station[data-state="upcoming"]').count(),26);
  assert.match(await page.locator('.station[data-activity="1"] .week-label').getAttribute('aria-label'),/第 7 週/);
});

test('真實活動頁 C3 標題列、等級條與成長連結；本機截圖',async t=>{
  const page=await pageFor(t,{viewport:{width:1440,height:1000}});
  await page.goto(base+'/115-g9/u2-03/');
  await page.click('#mock-login');await page.click('#g-isme');
  await page.waitForFunction(()=>document.getElementById('xp-total').textContent==='90 XP');
  assert.equal(await page.locator('#xp-link').getAttribute('href'),'../me/');
  // 任務日誌經驗條為 10px、面板灰邊與斜體窄數字，沿用新主題的字型後備。
  assert.equal(await page.locator('#xp-progress').evaluate(el=>getComputedStyle(el).height),'10px');
  assert.equal(await page.locator('header.top').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(59, 69, 92)');
  assert.equal(await page.locator('#xp-total').evaluate(el=>getComputedStyle(el).fontFamily.includes('Barlow Condensed')),true);
  await page.locator('header.top').screenshot({path:'/tmp/ybs-me-impl-shots/activity-header.png'});
});

test('全過與多主題徽章：最高等級、無待挑戰活動及換人重設',async t=>{
  const page=await pageFor(t,{viewport:{width:320,height:844},colorScheme:'dark'});
  await page.clock.setFixedTime(new Date('2027-07-01T00:00:00Z'));
  await page.evaluate(()=>{
    meMock.records.splice(0,meMock.records.length,...ACTIVITIES.filter(a=>a.course==='115-g9').flatMap(a=>a.rounds.map((_,round)=>({uid:'synthetic-one',activity:a.week,round,at:activityOpenAt(a)}))));
    meMock.login('synthetic-one');
  });
  await page.waitForFunction(()=>document.getElementById('total').textContent==='2415 XP');
  assert.equal(await page.locator('#level-number').textContent(),'Lv 10');
  assert.equal(await page.locator('#badge-count').textContent(),'30');
  assert.equal(await page.locator('#continue-action').isVisible(),false);
  assert.equal(await page.locator('#continue-link').getAttribute('href'),null);
  assert.equal(await page.locator('#completion-rate').textContent(),'100%');
  await page.click('#route-tab');
  const multi=page.locator('.station[data-activity="17"]');
  assert.equal(await multi.locator('.route-badge').count(),2);
  assert.equal(await multi.locator('.theme-H').count(),1);
  assert.equal(await multi.locator('.theme-T').count(),1);
  assert.equal(await multi.locator('.learned').textContent(),await page.evaluate(()=> '學會了什麼'+ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===17).topic));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>meMock.login('synthetic-two'));
  await page.waitForFunction(()=>document.getElementById('total').textContent==='0 XP');
  assert.equal(await page.locator('#exploration-tab').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#continue-link').getAttribute('href'),await page.evaluate(()=> '../../'+ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===25).href));
});

// 合成 attempts 僅用於本機截圖，活動、週次、topic 與 XP 計算仍走正式程式。
for(const [width,colorScheme] of [[1440,'light'],[1440,'dark'],[390,'light']]){
  test(`C3 多站路線截圖：${width}px、${colorScheme}`,async t=>{
    const page=await pageFor(t,{viewport:{width,height:width===390?844:1000},colorScheme});
    await page.evaluate(()=>{
      const state=[[26,4,4],[27,4,4],[28,4,1],[29,4,0],[3,4,0],[5,3,0]];
      meMock.records.splice(0,meMock.records.length,...state.flatMap(([activity,passed,timely])=>{
        const a=ACTIVITIES.find(a=>a.course==='115-g9'&&a.week===activity);
        return Array.from({length:passed},(_,round)=>({uid:'synthetic-one',activity,round,...(round<timely?{at:activityOpenAt(a)+864e5}:{})}));
      }));
      meMock.login('synthetic-one');
    });
    await page.waitForFunction(()=>document.getElementById('total').textContent==='375 XP');
    assert.equal(await page.locator('#level-number').textContent(),'Lv 3');
    assert.equal(await page.locator('#current-week').textContent(),'W11');
    assert.equal(await page.locator('#continue-link').getAttribute('href'),'../../115-g9/u2-03/');
    assert.equal(await page.locator('#badge-count').textContent(),'5');
    assert.equal(await page.locator('#route > .timeline .station.complete').count(),5);
    assert.ok(await page.locator('.row-break').count()>0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const name=colorScheme==='dark'?'dark':width===390?'mobile':'desktop';
    await page.screenshot({path:'/tmp/ybs-me-impl-shots/'+name+'.png',fullPage:true});
    if(width===390){
      await page.click('#route-tab');
      assert.equal(await page.locator('#route > .timeline .row-break').first().isVisible(),false);
      await page.screenshot({path:'/tmp/ybs-me-impl-shots/mobile-route.png',fullPage:true});
    }
  });
}

test('教師 Google 登入所需 gapi 腳本通過成長頁 CSP（離線替身）',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  await page.route('https://apis.google.com/js/api.js',r=>r.fulfill({contentType:'text/javascript',body:'window.meGapiLoaded = true;'}));
  await page.evaluate(()=>{
    const auth=meTeacherMock.auths.get('ybs-me-teacher'),original=auth.signInWithPopup;
    auth.signInWithPopup=async(...args)=>{
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';
        script.onload=resolve;script.onerror=()=>reject({code:'auth/internal-error'});
        document.head.append(script);
      });
      return original(...args);
    };
  });
  await page.click('[data-teacher-login]');
  await page.waitForFunction(()=>window.meGapiLoaded || document.getElementById('status').textContent.includes('未完成'));
  assert.equal(await page.evaluate(()=>window.meGapiLoaded),true);
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
});
test('教師登入失敗顯示錯誤碼，無錯誤碼仍可重試且不讀寫雲端',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  for(const error of [{code:'auth/internal-error'},{code:'auth/network-request-failed'},{code:'auth/popup-blocked'},{message:'synthetic failure'},null]) {
    await page.evaluate(error=>{
      const auth=meTeacherMock.auths.get('ybs-me-teacher'),original=auth.signInWithPopup;
      auth.signInWithPopup=async()=>{auth.signInWithPopup=original;throw error};
    },error);
    await page.click('[data-teacher-login]');
    const expected='教師登入未完成'+(error?.code?'（'+error.code+'）':'')+'，請重試。';
    await page.waitForFunction(expected=>document.getElementById('status').textContent===expected,expected);
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.locator('[data-teacher-login]').isEnabled(),true);
    assert.deepEqual(await page.evaluate(()=>({reads:meTeacherMock.reads,writes:meTeacherMock.writes})),{reads:[],writes:[]});
  }
  await page.click('[data-teacher-login]');
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
});
test('教師關閉或取消登入有友善訊息與錯誤碼，仍可再次登入',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  for(const code of ['auth/popup-closed-by-user','auth/cancelled-popup-request']) {
    await page.evaluate(code=>{
      const auth=meTeacherMock.auths.get('ybs-me-teacher'),original=auth.signInWithPopup;
      auth.signInWithPopup=async()=>{auth.signInWithPopup=original;throw {code}};
    },code);
    await page.click('[data-teacher-login]');
    await page.waitForFunction(code=>document.getElementById('status').textContent==='教師登入已取消（'+code+'），可再次點選登入。',code);
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>meTeacherMock.reads),[]);
  }
  await page.click('[data-teacher-login]');
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
});

for (const width of [1440,390]) {
  test(`教師唯讀成長頁與截圖：${width}px`,async t=>{
    const page=await pageFor(t,{viewport:{width,height:1000}},'?cls=999&seat=1');
    assert.equal(await page.evaluate(()=>meTeacherMock.reads.length),0);
    assert.equal(await page.locator('script[src*="assets/login.js"]').count(),0);
    await page.click('[data-teacher-login]');
    await page.waitForFunction(()=>!document.getElementById('growth').hidden);
    assert.equal(await page.locator('h1').textContent(),'教師檢視：999班1號');
    assert.equal(await page.locator('#total').textContent(),'75 XP');
    const reads=await page.evaluate(()=>meTeacherMock.reads);
    assert.deepEqual(reads.map(r=>r.path),['ybsCourses/115-g9','ybsCourses/115-g9/roster','ybsCourses/115-g9/attempts']);
    assert.ok(reads.every(r=>r.options.source==='server'));
    assert.equal(reads[2].field,'email'); assert.equal(reads[2].value,'student@example.invalid');
    assert.equal(await page.locator('#continue-action').isVisible(),false);
    await page.locator('#xp-details > summary').click();
    await page.locator('.xp-item > summary').first().click();
    assert.match(await page.locator('.teacher-round').first().textContent(),/2026.*台灣時間.*準時/);
    assert.match(await page.locator('.teacher-round').nth(1).textContent(),/補做/);
    assert.match(await page.locator('.teacher-round').nth(4).textContent(),/時間不明/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/tmp/ybs-me-teacher-shots/teacher-'+(width===1440?'desktop':'mobile')+'.png',fullPage:true});
    await page.evaluate(()=>meTeacherMock.login(null));
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.locator('#details').textContent(),'');
    assert.equal(await page.locator('#progress').getAttribute('aria-label'),'升級進度');
  });
}
test('非擁有者與學生帶參數皆拒絕，不讀名冊或他人 attempts',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  for(const uid of ['anonymous','synthetic-student','synthetic-stranger']) {
    await page.evaluate(uid=>meTeacherMock.login(uid),uid);
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('需教師登入'));
    assert.equal(await page.locator('#growth').isVisible(),false);
  }
  assert.ok((await page.evaluate(()=>meTeacherMock.reads)).every(r=>r.path==='ybsCourses/115-g9'));
  await page.screenshot({path:'/tmp/ybs-me-teacher-shots/denied.png',fullPage:true});
});
test('教師名冊查無班座與重複班座均有明確訊息',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  await page.evaluate(()=>{meTeacherMock.roster=[];meTeacherMock.login('synthetic-owner')});
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('找不到該班座'));
  await page.evaluate(()=>{meTeacherMock.roster=[1,2].map(i=>({id:i+'@example.invalid',data:()=>({cls:999,seat:1})}));meTeacherMock.login('synthetic-owner')});
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('重複名冊'));
  assert.equal((await page.evaluate(()=>meTeacherMock.reads)).some(r=>r.path.endsWith('attempts')),false);
});
test('教師登入元素延後出現及重建仍可操作；慢回應在換人後丟棄',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  await page.evaluate(()=>document.getElementById('login').remove());
  await page.evaluate(()=>{const host=document.createElement('div');host.id='login';document.getElementById('signin').append(host)});
  await page.waitForSelector('[data-teacher-login]');
  await page.evaluate(()=>document.getElementById('login').replaceChildren());
  await page.waitForSelector('[data-teacher-login]');
  await page.evaluate(()=>{meTeacherMock.mode='wait'});
  await page.click('[data-teacher-login]');
  await page.waitForFunction(()=>meTeacherMock.pending.length===1);
  await page.evaluate(()=>{meTeacherMock.login('synthetic-stranger');meTeacherMock.pending[0]()});
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('需教師登入'));
  assert.equal(await page.locator('#growth').isVisible(),false);
  assert.equal(await page.locator('#details').textContent(),'');
});
test('教師離線快取不顯示假零，已確認資料在暫時讀取失敗時保留',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  await page.evaluate(()=>{meTeacherMock.mode='cache';meTeacherMock.login('synthetic-owner')});
  await page.waitForFunction(()=>!document.getElementById('retry').hidden);
  assert.equal(await page.locator('#growth').isVisible(),false);
  await page.evaluate(()=>{meTeacherMock.mode='ok'}); await page.click('#retry');
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
  await page.evaluate(()=>{meTeacherMock.mode='error'}); await page.click('#retry');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('保留上次'));
  assert.equal(await page.locator('#total').textContent(),'75 XP');
});

test('既有教師 LOCAL Auth 可直接進入；重建明細後時間與補做仍存在，學生紀錄不持久化',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1&restored=owner');
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
  await page.evaluate(()=>document.getElementById('details').replaceChildren());
  await page.click('#retry');
  await page.waitForFunction(()=>document.querySelectorAll('.teacher-round').length>0);
  assert.match(await page.locator('.teacher-round').nth(1).textContent(),/補做/);
  assert.deepEqual(await page.evaluate(()=>meTeacherMock.persistence),[{name:'ybs-me-teacher',value:'local'}]);
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['mock:auth:ybs-me-teacher']);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mock:auth:ybs-me-teacher')).uid),'synthetic-owner');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('mock:auth:ybs-me-teacher')),null);
});
test('教師 LOCAL 登入一次，新分頁切換學生、重新整理及關頁重開均直接顯示',async t=>{
  const first=await pageFor(t,{},'?cls=999&seat=1');
  const context=first.context();
  await first.click('[data-teacher-login]');
  await first.locator('#growth').waitFor({state:'visible'});
  assert.deepEqual(await first.evaluate(()=>meTeacherMock.popups),['ybs-me-teacher']);
  const second=await pageFor(t,{},'?cls=999&seat=2',context);
  await second.locator('#growth').waitFor({state:'visible'});
  assert.equal(await second.locator('h1').textContent(),'教師檢視：999班2號');
  assert.equal(await second.locator('#total').textContent(),'10 XP');
  assert.deepEqual(await second.evaluate(()=>meTeacherMock.popups),[]);
  assert.equal(await second.evaluate(()=>meTeacherMock.reads.find(r=>r.field==='email').value),'student-two@example.invalid');
  assert.equal(await first.locator('#total').textContent(),'75 XP');
  await second.reload();
  await second.locator('#growth').waitFor({state:'visible'});
  assert.equal(await second.locator('#total').textContent(),'10 XP');
  assert.deepEqual(await second.evaluate(()=>meTeacherMock.popups),[]);
  await first.close();await second.close();
  const reopened=await pageFor(t,{},'?cls=999&seat=1',context);
  await reopened.locator('#growth').waitFor({state:'visible'});
  assert.equal(await reopened.locator('#total').textContent(),'75 XP');
  assert.deepEqual(await reopened.evaluate(()=>meTeacherMock.popups),[]);
});
test('教師登出撤銷全部已開分頁、清空資料，慢回應不回填，新分頁需重新登入',async t=>{
  const first=await pageFor(t,{},'?cls=999&seat=1');
  const context=first.context();
  await first.click('[data-teacher-login]');
  await first.locator('#growth').waitFor({state:'visible'});
  const second=await pageFor(t,{},'?cls=999&seat=2',context);
  await second.locator('#growth').waitFor({state:'visible'});
  await second.evaluate(()=>{meTeacherMock.mode='wait'});
  await second.click('#retry');
  await second.waitForFunction(()=>meTeacherMock.pending.length===1);
  await first.click('#logout');
  for(const page of [first,second]){
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('需教師登入'));
    assert.equal(await page.locator('#growth').isVisible(),false);
    assert.equal(await page.locator('[data-teacher-login]').isVisible(),true);
    assert.equal(await page.locator('#logout').isVisible(),false);
    assert.deepEqual(await page.locator('#total, #route, #details, #radar, #axes').allTextContents(),['','','','','']);
    assert.equal(await page.locator('#progress').getAttribute('aria-label'),'升級進度');
    assert.equal(await page.evaluate(()=>meTeacherMock.auths.get('ybs-me-teacher').currentUser),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('mock:auth:ybs-me-teacher')),null);
  }
  assert.deepEqual(await first.evaluate(()=>meTeacherMock.signouts),['ybs-me-teacher']);
  assert.deepEqual(await second.evaluate(()=>meTeacherMock.signouts),[]);
  await second.evaluate(()=>{meTeacherMock.mode='ok';meTeacherMock.pending[0]()});
  assert.equal(await second.locator('#growth').isVisible(),false);
  assert.equal(await second.locator('#details').textContent(),'');
  const signedOut=await pageFor(t,{},'?cls=999&seat=2',context);
  await signedOut.locator('[data-teacher-login]').waitFor({state:'visible'});
  assert.equal(await signedOut.locator('#growth').isVisible(),false);
  assert.deepEqual(await signedOut.evaluate(()=>meTeacherMock.reads),[]);
  assert.deepEqual(await signedOut.evaluate(()=>meTeacherMock.popups),[]);
  await signedOut.click('[data-teacher-login]');
  await first.locator('#growth').waitFor({state:'visible'});
  await second.locator('#growth').waitFor({state:'visible'});
  assert.equal(await first.locator('#total').textContent(),'75 XP');
  assert.equal(await second.locator('#total').textContent(),'10 XP');
});
test('教師 LOCAL 與無班座參數的真正學生入口互不借用身分或登出',async t=>{
  const teacher=await pageFor(t,{},'?cls=999&seat=1');
  await teacher.click('[data-teacher-login]');
  await teacher.locator('#growth').waitFor({state:'visible'});
  const student=await pageFor(t,{},'?real-login',teacher.context());
  await student.locator('.ybs-login input[name="a"]').waitFor({state:'visible'});
  await student.evaluate(()=>YBS.firebaseSession());
  assert.equal(await student.evaluate(()=>YBS.profile()),null);
  assert.equal(await student.evaluate(()=>__sessionMock.auth.currentUser),null);
  assert.equal(await student.locator('#growth').isVisible(),false);
  assert.deepEqual(await student.evaluate(()=>firebase.apps.map(app=>app.name)),['ybs']);
  assert.deepEqual(await student.evaluate(()=>__sessionMock.reads),[]);
  assert.equal(await student.locator('[data-teacher-login]').count(),0);
  await student.locator('.ybs-login input[name="a"]').fill('9990001');
  await student.locator('.ybs-login input[name="p"]').fill('synthetic-test-password');
  await student.locator('.ybs-login button[type="submit"]').click();
  await student.locator('#growth').waitFor({state:'visible'});
  assert.equal(await student.locator('#total').textContent(),'10 XP');
  const savedStudent=await student.evaluate(()=>localStorage.getItem('mock:session-user'));
  await teacher.click('#logout');
  assert.equal(await student.evaluate(()=>YBS.profile()?.uid),'session-one');
  assert.equal(await student.evaluate(()=>localStorage.getItem('mock:session-user')),savedStudent);
  assert.equal(await student.locator('#growth').isVisible(),true);
  await teacher.click('[data-teacher-login]');
  await teacher.locator('#growth').waitFor({state:'visible'});
  const savedTeacher=await teacher.evaluate(()=>localStorage.getItem('mock:auth:ybs-me-teacher'));
  await student.click('#logout');
  await student.waitForFunction(()=>YBS.profile()===null);
  assert.equal(await teacher.evaluate(()=>localStorage.getItem('mock:auth:ybs-me-teacher')),savedTeacher);
  assert.equal(await teacher.evaluate(()=>meTeacherMock.auths.get('ybs-me-teacher').currentUser.uid),'synthetic-owner');
  assert.equal(await teacher.locator('#growth').isVisible(),true);
});
test('教師目標參數無效時不初始化 Auth 或讀取雲端',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=61');
  assert.match(await page.locator('#status').textContent(),/參數無效/);
  assert.equal(await page.locator('#growth').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.meTeacherMock),undefined);
  assert.equal(await page.locator('script[src*="firebase-app-compat.js"]').count(),0);
});

test('教師模式有班座綁定與待送紀錄時不載入學生模組或寫入',async t=>{
  const page=await pageFor(t,{},'?cls=999&seat=1');
  await page.evaluate(()=>{
    sessionStorage.setItem('ybslab:guest-identity',JSON.stringify({cls:'999',seat:1,uid:'guest-synthetic'}));
    localStorage.setItem('ybslab:guest:115-g9',JSON.stringify({queue:[{cls:'999',seat:1,activity:1,round:0,level:1,tries:1}],receipts:[]}));
    localStorage.setItem('mock:auth:ybs',JSON.stringify({uid:'synthetic-student',providerData:[{providerId:'password'}]}));
  });
  await page.reload();
  await page.waitForFunction(()=>window.meTeacherMock?.auths.has('ybs-me-teacher'));
  await page.click('[data-teacher-login]');
  await page.waitForFunction(()=>!document.getElementById('growth').hidden);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('script[src*="assets/login.js"]').count(),0);
  assert.deepEqual(await page.evaluate(()=>meTeacherMock.writes),[]);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mock:auth:ybs-me-teacher')).uid),'synthetic-owner');
  assert.ok(await page.evaluate(()=>localStorage.getItem('mock:auth:ybs')));
  assert.ok(await page.evaluate(()=>localStorage.getItem('ybslab:guest:115-g9')));
});
