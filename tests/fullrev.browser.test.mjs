import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {sessionFirebase} from './fixtures/login-session.mjs';
import {MANAGED_ACTIVITIES,BATCH8} from '../assets/fullrev-activities.mjs';
const coursePages=[...new Set([...MANAGED_ACTIVITIES,...BATCH8].map(a=>'/'+a.file)),
  '/115-g9/me/index.html','/115-g9/teacher/index.html','/115-g9/teacher/report/index.html','/115-df/teacher/index.html'];
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><body>
<script src="/assets/xp.js"></script><script src="/assets/vendor/xlsx-0.20.3.full.min.js"></script><script>const TERMS=[{name:'合成學期',begin:'2026-01-01',end:'2026-12-31'}],termWeekOf=()=>1,termWeekLabel=()=>'第 1 週',isActivityOpen=()=>true;const ACTIVITIES=[{course:'115-g9',week:5,unit:2,title:'合成活動',href:'115-g9/synthetic/',date:'2026-09-15',topic:'合成主題',rounds:['甲','乙','丙','丁'],codes:[]}];</script>
<script type="module">
import {harness,snapshot,record,response} from '/tests/fixtures/fullrev.mjs';
import {teacherPayload} from '/tests/fixtures/fullrev-teacher.mjs';
import {mountActivity,mountGrowth,mountTeacher} from '/assets/fullrev-ui.mjs';
const app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider:window.syntheticProvider,studentGoogleLogin:location.search.includes('student-google'),requestId:()=>crypto.randomUUID()});
window.app=app;window.snapshot=snapshot;window.record=record;window.response=response;window.teacherPayload=teacherPayload;
app.state.snapshot=snapshot([]);app.state.owner=false;
if(window.syntheticTeacherError)app.state.readErrors['ybsTeachers/synthetic-student']=Object.assign(Error('synthetic-teacher-read'),{code:window.syntheticTeacherError});
window.seenQuestions=[];
const cfg={course:'115-g9',week:5,title:'合成活動',rounds:ACTIVITIES[0].rounds.map(name=>({name})),
 renderQuestion(q,host,{changed}){seenQuestions.push(q.slot);const label=document.createElement('label');label.textContent='合成答案';const input=document.createElement('input');input.type='number';input.oninput=changed;label.append(input);host.append(label);return{get:()=>Number(input.value)};},
 demonstrate(host){host.textContent='合成示範';}};
window.reloadView=async()=>{
  if(location.search.includes('teacher')){app.state.owner=true;await mountTeacher({client:Promise.resolve(app.client)});}
  else if(location.search.includes('growth'))await mountGrowth({client:Promise.resolve(app.client)});
  else await mountActivity({client:Promise.resolve(app.client),cfg});
};
await reloadView();window.ready=true;
</script></body></html>`;
before(async()=>{
  server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/115-g9/synthetic/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
    if(coursePages.includes(path))return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(await readFile(new URL('..'+path,import.meta.url)));
    if(/^\/115-g9\/me\/(?:me|me-teacher)\.js$/.test(path))return res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('..'+path,import.meta.url)));
    if(path==='/assets/vendor/xlsx-0.20.3.full.min.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url)));
    if(/^\/assets\/[\w.-]+\.(?:m?js|css|svg)$/.test(path)) {
      try{return res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript'}).end(await readFile(new URL('..'+path,import.meta.url)));}catch{return res.writeHead(404).end();}
    }
    if(!/^\/tests\/fixtures\/fullrev(?:-teacher)?\.mjs$/.test(path))return res.writeHead(404).end();
    try{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'}).end(await readFile(new URL('..'+path,import.meta.url)));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function pageFor(t,suffix='',context) {
  const page=await(context||browser).newPage({viewport:{width:390,height:844}});t.after(()=>page.close());
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto(base+'/115-g9/synthetic/'+suffix);await page.waitForFunction(()=>window.ready);return page;
}
async function confirmActivity(page) {await page.locator('#g-isme').click();await page.getByLabel('合成答案').waitFor();}
async function login(page) {await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:await page.locator('.ybs-login').count()?'登入':'帳號登入',exact:true}).click();}
test('全部 35 個現行課程頁：預設 false 保留舊登入／教師入口，零新版模組或 Worker 流量',async t=>{
  assert.equal(coursePages.length,35);
  for(const path of coursePages)await t.test(path,async()=>{
    const context=await browser.newContext({serviceWorkers:'block'}),requests=[],errors=[];
    try{
      const page=await context.newPage();page.setDefaultTimeout(5000);
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{
        const url=route.request().url();requests.push(url);
        if(url.startsWith(base+'/'))return route.continue();
        if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app-compat.js')?sessionFirebase:'// offline mock'});
        return route.abort();
      });
      // Use the real on-disk config; no injected switch or replacement client.
      assert.equal((await page.goto(base+path)).status(),200);
      await page.waitForFunction(()=>typeof YBS!=='undefined'&&typeof YBS.button==='function');
      assert.equal(await page.evaluate(()=>YBS_FULLREV_CONFIG.enabled),false);
      assert.equal(await page.evaluate(()=>YBS.fullrev),undefined);
      assert.equal(await page.evaluate(()=>YBS.CONFIG.project),'class-score-86020');
      if(/^\/115-g9\/u/.test(path)){
        await page.locator('.ybs-login').waitFor();
        assert.equal(await page.locator('#t-open').isVisible(),true);
      }
      assert.equal(requests.some(url=>/fullrev-(?:client|ui|read-model)|workers\.dev/.test(url)),false);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
});
test('新活動：錯答同題、下一組才換題、回條不先給分、重置後清除舊進度',async t=>{
  const page=await pageFor(t);await login(page);
  await confirmActivity(page);await page.getByLabel('合成答案').fill('0');
  await page.evaluate(()=>app.state.fetcher=async()=>Response.json(response(0,{nextSeq:2,correct:false})));
  await page.getByRole('button',{name:'送出',exact:true}).click();await page.getByText('修改答案後再送一次',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);assert.equal(await page.getByLabel('合成答案').inputValue(),'0');
  await page.evaluate(()=>app.state.fetcher=async()=>Response.json(response(1,{nextSeq:3,correct:true})));
  await page.getByLabel('合成答案').fill('7');await page.getByRole('button',{name:'送出',exact:true}).click();await page.getByRole('button',{name:'下一組',exact:true}).waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);assert.equal(await page.getByRole('button',{name:'送出',exact:true}).isEnabled(),false);
  const sent=await page.evaluate(()=>app.requests.length);
  await page.getByLabel('合成答案').fill('8');
  assert.equal(await page.getByRole('button',{name:'送出',exact:true}).isEnabled(),false);
  await page.getByRole('button',{name:'送出',exact:true}).evaluate(button=>button.click());
  assert.equal(await page.evaluate(()=>app.requests.length),sent);assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);
  await page.getByRole('button',{name:'下一組',exact:true}).click();assert.deepEqual(await page.evaluate(()=>seenQuestions),[0,1]);
  assert.equal(await page.getByLabel('合成答案').inputValue(),'');
  await page.evaluate(()=>{
    // 題面只透過訂閱事件提供；state() 不暴露 view。
    window.completedReceipt=null;
    app.client.subscribe(state=>{if(state.view?.completed)window.completedReceipt=state.view;});
    app.state.fetcher=async()=>Response.json({completed:true,resultId:'c_done'});
  });
  await page.getByLabel('合成答案').fill('7');await page.getByRole('button',{name:'送出',exact:true}).click();
  await page.waitForFunction(()=>completedReceipt?.resultId==='c_done'&&app.client.state().status==='confirmed'&&app.client.state().snapshot?.records.length===0);
  await page.locator('#xp-total').getByText('0 XP',{exact:true}).waitFor({state:'attached'});
  assert.equal(await page.locator('#xp-total').textContent(),'0 XP');assert.equal(await page.getByText('過關！',{exact:true}).count(),0);
  // 成長頁從同一有效集合重算，取消的過關與徽章可減少。
  const growth=await pageFor(t,'?growth');await login(growth);
  await growth.evaluate(()=>app.state.snapshot=snapshot([0,1,2,3].map(i=>record(i))));
  // 手機版隱藏等級面板的累積經驗，XP 明細摘要仍可見。
  await growth.getByRole('button',{name:'重新讀取',exact:true}).click();await growth.locator('#xp-total').getByText('80 XP',{exact:true}).waitFor();
  assert.equal(await growth.locator('#total').textContent(),'80 XP');
  assert.equal(await growth.locator('#badge-count').textContent(),'1');
  await growth.evaluate(()=>app.state.snapshot=snapshot([0,1,2].map(i=>record(i))));
  await growth.getByRole('button',{name:'重新讀取',exact:true}).click();await growth.locator('#xp-total').getByText('45 XP',{exact:true}).waitFor();
  assert.equal(await growth.locator('#total').textContent(),'45 XP');
  assert.equal(await growth.locator('#badge-count').textContent(),'0');
  assert.equal(await growth.getByText(/已獲得徽章/).count(),0);
});
test('傳送中與斷線待送時修改答案不會啟用送出或覆寫原請求',async t=>{
  const page=await pageFor(t);await login(page);
  const input=page.getByLabel('合成答案'),send=page.getByRole('button',{name:'送出',exact:true});
  await confirmActivity(page);await input.fill('7');
  await page.evaluate(()=>app.state.fetcher=()=>new Promise(resolve=>window.releaseAnswer=resolve));
  await send.click();await page.waitForFunction(()=>typeof releaseAnswer==='function');
  const sent=await page.evaluate(()=>app.requests.length);
  await input.fill('8');assert.equal(await send.isEnabled(),false);
  await send.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>app.requests.length),sent);
  assert.equal(await page.evaluate(()=>app.requests.at(-1).body.answer),7);
  await page.evaluate(()=>releaseAnswer(Response.json(response(0,{nextSeq:2,correct:false}))));
  await page.getByText('修改答案後再送一次',{exact:true}).waitFor();
  assert.equal(await send.isEnabled(),true);assert.equal(await input.inputValue(),'8');
  await page.evaluate(()=>app.state.fetcher=async()=>{throw Error('synthetic-offline');});
  await send.click();await page.getByText('上傳中，請稍候，答案已保留。',{exact:true}).waitFor();
  await page.waitForFunction(()=>app.client.state().status==='pending');
  const original=await page.evaluate(()=>app.requests.at(-1).body);
  await input.fill('9');assert.equal(await send.isEnabled(),false);
  await send.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>app.requests.length),sent+1);
  await page.evaluate(()=>{app.advance();app.state.fetcher=()=>new Promise(resolve=>window.releaseRetry=resolve);});
  await page.getByRole('button',{name:'重試上傳',exact:true}).click();
  await page.waitForFunction(()=>typeof releaseRetry==='function');
  // 舊錯答提示仍在，不能拿它當重送完成訊號；回應未到前仍不可重送。
  assert.deepEqual(await page.evaluate(()=>app.requests.at(-1).body),original);
  await input.fill('10');assert.equal(await send.isEnabled(),false);
  await send.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>app.requests.length),sent+2);
  await page.evaluate(()=>releaseRetry(Response.json(response(0,{nextSeq:3,correct:false}))));
  await page.waitForFunction(()=>app.client.state().status==='ready'&&!app.client.state().pending);
  await page.getByText('修改答案後再送一次',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'10');assert.equal(await send.isEnabled(),true);
});
test('Google 學生的教師文件被拒仍可登入作答；實際重新整理後還原同一草稿',async t=>{
  // 預設入口維持隱藏；只有此情境明確模擬老師開放 Google 學生登入。
  const page=await pageFor(t,'?student-google');
  await page.evaluate(()=>app.state.readErrors['ybsTeachers/synthetic-student']=Object.assign(Error('synthetic-denied'),{code:'permission-denied'}));
  await page.getByRole('button',{name:'學生 Google 登入',exact:true}).click();
  await confirmActivity(page);await page.getByLabel('合成答案').waitFor();
  assert.equal(await page.evaluate(()=>app.client.state().profile.owner),false);
  await page.addInitScript(()=>{window.syntheticProvider='google.com';window.syntheticTeacherError='permission-denied';});
  await page.reload();await page.waitForFunction(()=>window.ready);
  assert.equal(await page.evaluate(()=>app.client.state().profile.owner),false);
  await confirmActivity(page);await page.getByLabel('合成答案').waitFor();
  assert.deepEqual(await page.evaluate(()=>app.requests.map(r=>new URL(r.url).pathname)),['/resume']);
});
test('累積十二個完成關卡不占八份草稿額度，第八關後實際重新整理仍可繼續',async t=>{
  const page=await pageFor(t);await login(page);
  const complete=async(first,last)=>page.evaluate(async({first,last})=>{
    for(let activity=first;activity<=last;activity++) {
      app.state.fetcher=async()=>Response.json(response());await app.client.start(activity,0);
      app.state.fetcher=async()=>Response.json(response(1,{correct:true}));await app.client.answer(activity,0,7);
      app.state.fetcher=async()=>Response.json({completed:true,resultId:'c_'+activity});await app.client.answer(activity,0,7);
    }
    return Object.keys(JSON.parse(sessionStorage.getItem('ybs:fullrev:synthetic-ybs-pr5:115-g9')).drafts);
  },{first,last});
  assert.deepEqual(await complete(1,8),[]);
  await page.addInitScript(()=>{window.syntheticProvider='password';});await page.reload();await page.waitForFunction(()=>window.ready);
  assert.equal(await page.evaluate(()=>app.client.state().profile.provider),'password');
  assert.deepEqual(await complete(9,12),[]);assert.equal(await page.evaluate(()=>app.client.state().snapshot),null);
});
test('跨活動超過八關仍可切換；實際重整保留當關離線原答案，切關後不再補送',async t=>{
  const page=await pageFor(t);await login(page);
  const original=await page.evaluate(async()=>{
    for(let activity=1;activity<=12;activity++)await app.client.start(activity,0);
    app.state.fetcher=async()=>{throw Error('synthetic-offline');};
    try{await app.client.answer(12,0,7);}catch(e){if(e.code!=='pending')throw e;}
    return app.requests.at(-1).body;
  });
  await page.addInitScript(()=>{window.syntheticProvider='password';});await page.reload();await page.waitForFunction(()=>window.ready);
  const retried=await page.evaluate(async()=>{
    app.state.fetcher=async()=>Response.json(response());app.advance();await app.client.start(12,0);return app.requests.at(-1).body;
  });
  assert.deepEqual(retried,original);
  assert.deepEqual(await page.evaluate(async()=>{
    app.state.fetcher=async()=>{throw Error('synthetic-offline');};
    try{await app.client.answer(12,0,8);}catch(e){if(e.code!=='pending')throw e;}
    app.state.fetcher=async()=>Response.json(response());await app.client.start(13,0);
    app.advance();const count=app.requests.length;await app.client.retry();
    return {count:app.requests.length-count,keys:Object.keys(JSON.parse(sessionStorage.getItem('ybs:fullrev:synthetic-ybs-pr5:115-g9')).drafts)};
  }),{count:0,keys:['13:0']});
});
test('學生未完成與上傳待送仍鎖住下一關，保留原答案同關修正',async t=>{
  const page=await pageFor(t);await login(page);await confirmActivity(page);
  const count=await page.evaluate(()=>app.requests.length);
  await page.getByLabel('合成答案').fill('7');assert.equal(await page.locator('#rounds button').nth(2).isDisabled(),true);
  await page.locator('#rounds button').nth(2).evaluate(b=>b.click());assert.equal(await page.evaluate(()=>app.requests.length),count);
  assert.match(await page.locator('#streak').textContent(),/0\/2/);
  await page.evaluate(()=>app.state.fetcher=async()=>{throw Error('synthetic-offline');});
  await page.getByRole('button',{name:'送出',exact:true}).click();await page.waitForFunction(()=>app.client.state().status==='pending');
  const original=await page.evaluate(()=>app.requests.at(-1).body);await page.getByLabel('合成答案').fill('8');
  await page.locator('#rounds button').nth(1).evaluate(b=>b.click());assert.equal(await page.evaluate(()=>app.requests.length),count+1);assert.equal(await page.getByLabel('合成答案').inputValue(),'8');
  await page.evaluate(()=>{app.advance();app.state.fetcher=async()=>Response.json(response(0,{nextSeq:2,correct:false}));});
  await page.locator('#b-retry').click();await page.getByText('修改答案後再送一次',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>app.requests.at(-1).body),original);assert.equal(await page.getByLabel('合成答案').inputValue(),'8');
  assert.equal(await page.locator('#rounds button').nth(1).isDisabled(),true);
});
test('斷線答案待確認；換人及其他分頁登出清空題面與待送',async t=>{
  const context=await browser.newContext();t.after(()=>context.close());const first=await pageFor(t,'',context);await login(first);
  await confirmActivity(first);await first.getByLabel('合成答案').fill('7');
  await first.evaluate(()=>app.state.fetcher=async()=>{throw Error('offline');});
  await first.getByRole('button',{name:'送出',exact:true}).click();await first.getByText('上傳中，請稍候，答案已保留。',{exact:true}).waitFor();
  const second=await pageFor(t,'',context);await login(second);
  await first.getByRole('button',{name:'登入',exact:true}).waitFor({state:'visible'});
  assert.equal(await first.getByLabel('合成答案').count(),0);assert.equal(await first.evaluate(()=>app.client.state().pending),false);
  assert.equal(await first.evaluate(()=>app.client.state().snapshot),null);
});
test('owner 示範僅授權取題、不送成績或保存解答；非owner不能匯出、未知投影不下載',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>{
    app.state.owner=true;
    app.state.fetcher=async(url,init)=>Response.json(teacherPayload(JSON.parse(init.body)),{headers:{'cache-control':'no-store'}});
  });
  await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await page.locator('#tbar').waitFor({state:'visible'});
  await page.getByRole('button',{name:'顯示解答',exact:true}).click();
  await page.getByText('合成教師解說',{exact:true}).waitFor();
  async function assertTeacherReadOnly(){
    // 教師以解答工具示範；送出鈕仍在 DOM，但隱藏後不在角色查詢範圍。
    assert.equal(await page.locator('#b-send').isVisible(),false);
    assert.equal(await page.locator('#b-send').isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>app.requests.map(r=>new URL(r.url).pathname)),['/teacher-question']);
    assert.equal(await page.evaluate(()=>app.client.state().pending),false);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ybs:fullrev:synthetic-ybs-pr5:115-g9')).drafts),{});
    assert.equal(await page.evaluate(()=>[...Object.values(sessionStorage),...Object.values(localStorage)].some(v=>v.includes('合成教師解說')||v.includes('合成示範答案'))),false);
  }
  await assertTeacherReadOnly();
  await page.locator('#activity-tools summary').click();
  await page.getByRole('button',{name:'本機練習／示範',exact:true}).click();assert.equal(await page.evaluate(()=>app.requests.length),1);
  await page.getByText('合成示範',{exact:true}).waitFor();
  await assertTeacherReadOnly();
  const teacher=await pageFor(t,'?teacher');await teacher.evaluate(()=>app.state.owner=false);
  await teacher.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await teacher.getByText('只有此課程擁有者可以使用。',{exact:true}).waitFor();
  await teacher.evaluate(()=>app.state.owner=true);await teacher.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
  await teacher.getByLabel('班級代碼').fill('c901');await teacher.evaluate(()=>app.state.snapshot=snapshot([],{state:'unknown'}));
  const downloads=[];teacher.on('download',d=>downloads.push(d));await teacher.getByRole('button',{name:'重新確認並下載 Excel',exact:true}).click();
  await teacher.getByText('尚未完成，請重新讀取或找老師。',{exact:true}).waitFor();assert.equal(downloads.length,0);
});
test('教師 Excel 下載當下重查版本與有效集合，真實檔案讀回為取消後45XP',async t=>{
  const page=await pageFor(t,'?teacher');await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
  await page.getByLabel('班級代碼').fill('c901');
  await page.evaluate(()=>app.state.snapshot=snapshot([0,1,2,3].map(i=>record(i))));
  await page.getByRole('button',{name:'讀取有效紀錄',exact:true}).click();await page.locator('table').waitFor();
  assert.match(await page.locator('table').textContent(),/80/);
  await page.evaluate(()=>{
    const controlVersions={gateVersion:1,classGateVersion:2};
    app.state.snapshot=snapshot([0,1,2].map(i=>record(i,{validity:{state:'effective',controlVersions}})),{controlVersions});
  });
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'重新確認並下載 Excel',exact:true}).click();
  const download=await downloadPromise,bytes=await readFile(await download.path());
  assert.equal(download.suggestedFilename(),'YBS_有效紀錄.xlsx');
  const rows=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets['有效紀錄'],{header:1});},[...bytes]);
  assert.equal(rows.at(-1)[6],45);assert.equal(rows[4][4],'尚未過關');
});
test('教師整班分組各自驗版，Excel 下載重讀兩組且保留取消後的 80／45 XP',async t=>{
  const page=await pageFor(t,'?teacher');await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
  await page.getByLabel('班級代碼').fill('c901');
  await page.evaluate(()=>{
    window.teacherGateReads=[];
    window.teacherGateSnapshots=Object.fromEntries(['c901_1','c901_2'].map((classKey,i)=>{
      const subject='synthetic-group-'+i,controlVersions={gateVersion:1,classGateVersion:i+1};
      return [classKey,snapshot([0,1,2,3].map(round=>record(round,{subject,classKeyAtPass:classKey,
        resultId:'c_synthetic_group_'+i+'_'+round,validity:{state:'effective',controlVersions}})),
        {classKey,controlVersions,people:[{subject,cls:901,seat:i*30+1,provider:'password'}]})];
    }));
    app.model.controls=async({classKey})=>{
      teacherGateReads.push('controls:'+classKey);
      if(classKey==='c901')throw Object.assign(Error('class-not-found'),{code:'class-not-found'});
      return {...teacherGateSnapshots[classKey].controlVersions};
    };
    app.model.page=async({classKey})=>{teacherGateReads.push('page:'+classKey);return structuredClone(teacherGateSnapshots[classKey]);};
  });
  await page.getByRole('button',{name:'讀取有效紀錄',exact:true}).click();await page.locator('table').waitFor();
  assert.equal(await page.locator('table tr').count(),11);
  assert.deepEqual(await page.locator('table tr').filter({hasText:'合計'}).locator('td:nth-child(7)').allTextContents(),['80','80']);
  await page.evaluate(()=>{
    const gate=teacherGateSnapshots.c901_2,controlVersions={gateVersion:1,classGateVersion:3};
    gate.controlVersions=controlVersions;
    gate.records=gate.records.filter(r=>r.round!==3).map(r=>({...r,validity:{state:'effective',controlVersions}}));
  });
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'重新確認並下載 Excel',exact:true}).click();
  const download=await downloadPromise,bytes=await readFile(await download.path());
  const rows=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets['有效紀錄'],{header:1});},[...bytes]);
  assert.equal(rows.length,11);assert.deepEqual(rows.filter(r=>r[2]==='合計').map(r=>r[6]),[80,45]);
  assert.equal(rows[9][4],'尚未過關');
  assert.deepEqual(await page.evaluate(()=>teacherGateReads),Array(2).fill([
    'controls:c901','controls:c901_1','page:c901_1','controls:c901_1','controls:c901_2','page:c901_2','controls:c901_2']).flat());
});
