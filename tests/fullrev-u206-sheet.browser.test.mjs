import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
async function open(t,{round=3,width=1280,teacher=false,tickets=false}={}){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});t.after(()=>context.close());
 const external=[];await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base){external.push(url.origin);return route.abort();}
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><link rel="stylesheet" href="/assets/fullrev-shell.css"><script src="/assets/xp.js"></script><body></body></html>'});
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-u206-sheet|-round-flow|-teacher)?\.mjs)$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.clock.install({time:new Date('2026-11-27T00:00:00Z')});await page.goto(base+'/115-g9/synthetic/');
 // fixture 的登入、Worker 回應、身分及 localStorage 全為本機合成；外部請求一律阻擋。
 await page.evaluate(async({round,teacher,tickets})=>{
  const {harness,response,snapshot,activities,config}=await import('/tests/fixtures/fullrev.mjs');
  const {sheetQuestion,syntheticSolution}=await import('/tests/fixtures/fullrev-u206-sheet.mjs');
  const {renderQuestion}=await import('/assets/fullrev-activities.mjs'),{mountActivity}=await import('/assets/fullrev-ui.mjs');
  window.fixture={sheetQuestion,syntheticSolution,response,renderQuestion,mountActivity};window.options={round,teacher,tickets};window.ACTIVITIES=activities.map(a=>({...a,week:8}));window.isActivityOpen=()=>true;
  async function mount(){
   const old=window.app;const restoredProvider=sessionStorage.getItem('ybs:fullrev:'+config.firebase.projectId+':115-g9')?'password':undefined;
   window.app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider,answerTickets:tickets});app.state.owner=teacher;app.state.snapshot=snapshot([]);
   const cfg={week:8,course:'115-g9',title:'合成志工回覆整理所',rounds:[{name:'合成整理任務'}],renderQuestion};
   app.state.fail=true;app.state.offline=false;
   app.state.fetcher=async(url,init)=>{
    const body=JSON.parse(init.body);if(url.endsWith('/teacher-question'))return Response.json({sourceProject:config.firebase.projectId,uid:app.state.uid,course:body.course,activity:body.activity,round:body.round,question:sheetQuestion(round),solution:{answer:syntheticSolution(sheetQuestion(round)),notes:['合成教學說明']}},{headers:{'cache-control':'no-store'}});
    if(app.state.offline)throw Error('synthetic offline');
    const slot=body.slot||0,q=sheetQuestion(round,slot),extra=tickets?{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-u206-ticket'}:{};
    if(url.endsWith('/answer')){
     if(app.state.fail)return Response.json(response(slot,{...extra,nextSeq:body.seq+1,correct:false,feedback:'請重新核對你的設定。',question:q}));
     return Response.json(response(1,{...extra,correct:true,nextSeq:body.seq+1,question:sheetQuestion(round,1)}));
    }
    return Response.json(response(0,{...extra,question:sheetQuestion(round)}));
   };
   await mountActivity({client:Promise.resolve(app.client),cfg});if(!restoredProvider){if(teacher)await app.client.login('owner');else await app.login();}
   window.mountAgain=mount;window.oldApp=old;
  }await mount();
 },{round,teacher,tickets});
 if(!teacher)await page.locator('#g-isme').click();await page.locator('.volunteer-sheet').waitFor();return page;
}
async function choose(page,label,value){await page.getByLabel(label,{exact:true}).selectOption(value);}
async function capture(page,name){if(process.env.YBS_U206_CAPTURE_DIR){await mkdir(process.env.YBS_U206_CAPTURE_DIR,{recursive:true});await page.screenshot({path:join(process.env.YBS_U206_CAPTURE_DIR,name+'.png'),fullPage:true});}}
async function chart(page,counts=['2','3','2']){
 await choose(page,'組別等於','動漫組');await choose(page,'可到場時段包含','下午');await page.getByRole('button',{name:'套用篩選',exact:true}).click();
 for(const [k,j] of ['入口引導','遊戲體驗','舞台支援'].entries())await page.getByLabel(j+'有效回覆筆數',{exact:true}).fill(counts[k]);
 await page.getByRole('button',{name:'記錄統計',exact:true}).click();await choose(page,'圖表資料來源','filtered');await choose(page,'圖表標題','1');await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();
}
test('360／768／1280px：四關表格只在容器水平捲動，控制可達，空白與標記可讀',async t=>{
 for(const width of [360,768,1280])for(const round of [0,1,2,3]){
  const page=await open(t,{round,width});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} round ${round}`);
  const scroll=page.locator('.sheet-scroll').first();assert.ok(await scroll.evaluate(e=>e.scrollWidth>e.clientWidth));await scroll.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.quest-outcome').count(),0);assert.equal(await page.locator('[aria-label="空白儲存格"]').count()>0,true);
  if(round===1){await choose(page,'套用範圍','0');await choose(page,'格式規則','empty');await page.getByRole('button',{name:'套用格式',exact:true}).click();assert.ok(await page.locator('.sheet-mark').count()>0);assert.match(await page.locator('.sheet-mark').first().innerText(),/已標記/);}
  assert.equal(await page.locator('.round-depth').count(),1);assert.ok(await page.locator('#rounds button').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=17));
  await capture(page,`round-${round+1}-${width}`);
  await page.context().browser().close();
 }
});
test('條件式格式、選列排除、逐列恢復、全部復原、原始快照及鍵盤焦點',async t=>{
 const page=await open(t,{round:1,width:360});await page.locator('#send-control').focus();await page.keyboard.press('Enter');await page.locator('.answer-error').first().waitFor();assert.equal(await page.getByLabel('套用範圍',{exact:true}).evaluate(e=>e===document.activeElement),true);
 await choose(page,'套用範圍','2');await choose(page,'格式規則','empty');await page.getByRole('button',{name:'套用格式',exact:true}).click();assert.equal(await page.locator('.sheet-mark').count(),10);
 await page.getByLabel('選取原第 2 列',{exact:true}).check();await page.getByLabel('選取原第 3 列',{exact:true}).check();await page.getByRole('button',{name:'排除所選資料',exact:true}).click();await page.getByText('查看已排除區與不可改寫的原始快照',{exact:true}).click();
 await page.getByRole('button',{name:'恢復原第 2 列',exact:true}).click();assert.equal(await page.getByLabel('選取原第 2 列',{exact:true}).count(),1);assert.equal(await page.getByLabel('選取原第 3 列',{exact:true}).count(),0);
 const original=page.getByRole('table',{name:'不可改寫的原始快照',exact:true});assert.equal(await original.locator('tbody tr').count(),10);
 await page.getByRole('button',{name:'全部復原',exact:true}).click();assert.equal(await page.getByLabel('選取原第 3 列',{exact:true}).count(),1);
});
test('去重全欄／B～J 真實結果、未勾欄位提示與復原',async t=>{
 const page=await open(t,{round:2});await page.getByRole('button',{name:'執行移除重複資料',exact:true}).click();await page.getByText(/移除 0 筆／剩餘 10 筆/).waitFor();
 await page.getByLabel('A 送出時間',{exact:true}).uncheck();await page.getByRole('button',{name:'執行移除重複資料',exact:true}).click();await page.getByText(/移除 2 筆／剩餘 8 筆/).waitFor();
 await page.getByRole('button',{name:'復原',exact:true}).click();await page.getByText(/移除 0 筆／剩餘 10 筆/).waitFor();await page.getByRole('button',{name:'取消全選',exact:true}).click();await page.getByRole('button',{name:'執行移除重複資料',exact:true}).click();await page.locator('.sheet-status').filter({hasText:'請至少選一個比對欄位'}).waitFor();
});
test('圖由輸入生成、0 類別／0 合計、上游修改與改回使圖表和分析清空，摘要不能製圖',async t=>{
 const page=await open(t);assert.equal(await page.getByLabel('入口引導有效回覆筆數',{exact:true}).inputValue(),'');await chart(page,['1','2','2']);assert.match(await page.locator('canvas').getAttribute('aria-label'),/入口引導 1 筆 20.0%/);
 await capture(page,'round-4-chart-1280');
 const percent=page.getByLabel('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。',{exact:true});await percent.fill('20.0');await choose(page,'你會優先補招哪個職務？','0');await choose(page,'你採用什麼理由？','demandGap');
 await choose(page,'圖表標題','2');await choose(page,'圖表標題','1');assert.equal(await page.locator('canvas').count(),0);assert.equal(await percent.inputValue(),'');assert.equal(await page.getByLabel('你會優先補招哪個職務？',{exact:true}).inputValue(),'');
 await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();await page.locator('canvas').waitFor();await page.getByLabel('遊戲體驗有效回覆筆數',{exact:true}).fill('0');assert.equal(await page.locator('canvas').count(),0);
 await page.getByRole('button',{name:'記錄統計',exact:true}).click();await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();assert.match(await page.locator('canvas').getAttribute('aria-label'),/遊戲體驗 0 筆 0.0%/);
 await choose(page,'圖表資料來源','originalSummary');await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();assert.equal(await page.locator('canvas').count(),0);await page.locator('.sheet-status').filter({hasText:'本題沒有提供原始表單摘要'}).waitFor();
 for(const job of ['入口引導','遊戲體驗','舞台支援'])await page.getByLabel(job+'有效回覆筆數',{exact:true}).fill('0');await page.getByRole('button',{name:'記錄統計',exact:true}).click();await choose(page,'圖表資料來源','filtered');await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();await page.getByText('合計 0 筆，沒有可繪製的比例。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'清除篩選',exact:true}).click();assert.equal(await page.getByRole('table',{name:'目前可見的有效回覆',exact:true}).locator('tbody tr').count(),10);
});
test('錯答保留狀態與圖表；下一組清空操作與輸入並更換 datasetToken',async t=>{
 const page=await open(t);await chart(page);await page.getByLabel('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。',{exact:true}).fill('28.6');await choose(page,'你會優先補招哪個職務？','0');await choose(page,'你採用什麼理由？','demandGap');
 await page.locator('#b-send').click();await page.getByRole('heading',{name:'還不對',exact:true}).waitFor();assert.equal(await page.locator('canvas').count(),1);assert.equal(await page.getByLabel('入口引導有效回覆筆數',{exact:true}).inputValue(),'2');
 await page.evaluate(()=>{app.state.fail=false;});await page.getByLabel('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。',{exact:true}).fill('28.5');await page.locator('#b-send').click();await page.locator('#b-next-group').waitFor();assert.equal(await page.locator('canvas').count(),1);
 await page.locator('#b-next-group').click();assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.getByLabel('入口引導有效回覆筆數',{exact:true}).inputValue(),'');assert.equal(await page.locator('[data-slot="1"]').count(),1);
});
test('一般／票草稿跨重建 resume，網路重試保留操作',async t=>{
 for(const tickets of [false,true]){
  const page=await open(t,{round:1,tickets});await choose(page,'套用範圍','0');await choose(page,'格式規則','empty');await page.getByRole('button',{name:'套用格式',exact:true}).click();await page.getByLabel('選取原第 2 列',{exact:true}).check();await page.getByRole('button',{name:'排除所選資料',exact:true}).click();
  await page.evaluate(async()=>{dispatchEvent(new Event('pagehide'));await mountAgain();});await page.locator('#g-isme').click();await page.locator('#draft-notice').filter({hasText:'已恢復上次未送出的作答'}).waitFor();assert.equal(await page.getByLabel('選取原第 2 列',{exact:true}).count(),0);assert.ok(await page.locator('.sheet-mark').count()>0);
  await page.evaluate(()=>{app.state.offline=true;});await page.locator('#b-send').click();await page.waitForFunction(()=>app.client.state().status==='pending');assert.ok(await page.locator('.sheet-mark').count()>0);
  const failed=await page.evaluate(()=>({count:app.requests.length,body:app.requests.at(-1).body}));
  // harness 的 now 不隨瀏覽器時間前進；先走完第一次斷線的 1 秒退避，再按重試。
  await page.evaluate(()=>{app.state.offline=false;app.advance(1000);});await page.locator('#b-retry').click();await page.getByRole('heading',{name:'還不對',exact:true}).waitFor();assert.equal(await page.getByLabel('選取原第 2 列',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>app.requests.length),failed.count+1);assert.deepEqual(await page.evaluate(()=>app.requests.at(-1).body),failed.body);
  await page.context().browser().close();
 }
});
test('教師套入四關操作與圖表，只使用 teacher-question，不寫本機草稿或成績',async t=>{
 for(const round of [0,1,2,3]){
  const page=await open(t,{round,teacher:true});await page.getByRole('button',{name:'套入解答操作',exact:true}).click();assert.doesNotMatch(await page.locator('#teacher-solution').innerText(),/\[object Object\]/);
  if(round===3)assert.equal(await page.locator('canvas').count(),1);
  assert.equal(await page.evaluate(()=>app.requests.every(r=>r.url.endsWith('/teacher-question'))),true);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ybs:fullrev:work:')).length),0);await page.context().browser().close();
 }
});
test('作答票過期保留查閱狀態，明確重新開始清空舊操作與列 ID',async t=>{
 const page=await open(t,{round:1,tickets:true});await choose(page,'套用範圍','0');await choose(page,'格式規則','empty');await page.getByRole('button',{name:'套用格式',exact:true}).click();await page.getByLabel('選取原第 2 列',{exact:true}).check();await page.getByRole('button',{name:'排除所選資料',exact:true}).click();
 await page.evaluate(()=>{app.state.fetcher=async()=>Response.json({error:'ticket_expired'},{status:410});});await page.locator('#b-send').click();await page.getByText(/作答票已過期/).first().waitFor();assert.ok(await page.locator('.sheet-mark').count()>0);
 await page.evaluate(()=>{const {response,sheetQuestion}=fixture;app.state.fetcher=async()=>Response.json(response(0,{sid:'t'.repeat(22),ticketVersion:1,ticket:'ybs-answer-v1.synthetic-new-ticket',question:{...sheetQuestion(1,1),slot:0}}));});
 await page.getByText('活動工具',{exact:true}).click();await page.getByRole('button',{name:'重新開始',exact:true}).click();await page.waitForFunction(()=>app.requests.at(-1).url.endsWith('/ticket/start'));
 assert.equal(await page.locator('.sheet-mark').count(),0);assert.equal(await page.getByLabel('選取原第 2 列',{exact:true}).count(),1);assert.equal(await page.getByLabel('套用範圍',{exact:true}).inputValue(),'');
});

test('D12：錯標題不製圖、舊圖與分析清空，改正後可重新製圖',async t=>{
 const page=await open(t);await chart(page);assert.equal(await page.locator('canvas').count(),1);
 const percent=page.getByLabel('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。',{exact:true});
 await percent.fill('28.6');await choose(page,'你會優先補招哪個職務？','0');await choose(page,'你採用什麼理由？','demandGap');
 for(const title of ['0','2']){
  await choose(page,'圖表標題',title);await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();
  assert.equal(await page.locator('canvas').count(),0);assert.match(await page.locator('.sheet-status').innerText(),/標題須符合/);
  assert.equal(await percent.inputValue(),'');assert.equal(await page.getByLabel('你會優先補招哪個職務？',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('你採用什麼理由？',{exact:true}).inputValue(),'');
 }
 await choose(page,'圖表標題','1');await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();assert.equal(await page.locator('canvas').count(),1);
 await choose(page,'組別等於','遊戲組');await page.getByRole('button',{name:'套用篩選',exact:true}).click();
 for(const job of ['入口引導','遊戲體驗','舞台支援'])await page.getByLabel(job+'有效回覆筆數',{exact:true}).fill('0');
 await page.getByRole('button',{name:'記錄統計',exact:true}).click();await choose(page,'圖表標題','0');await page.getByRole('button',{name:'產生圓餅圖',exact:true}).click();assert.equal(await page.locator('canvas').count(),0);assert.match(await page.locator('.sheet-status').innerText(),/標題須符合/);
});
