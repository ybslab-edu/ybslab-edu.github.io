import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {sessionFirebase} from './fixtures/login-session.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><body>
<script src="/assets/xp.js"></script><script src="/assets/vendor/xlsx-0.20.3.full.min.js"></script><script>const ACTIVITIES=[{course:'115-g9',week:5,unit:2,title:'合成活動',rounds:['甲','乙','丙','丁'],codes:[]}];</script>
<script type="module">
import {harness,snapshot,record,response} from '/tests/fixtures/fullrev.mjs';
import {mountActivity,mountGrowth,mountTeacher} from '/assets/fullrev-ui.mjs';
const app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider:window.syntheticProvider,requestId:()=>crypto.randomUUID()});
window.app=app;window.snapshot=snapshot;window.record=record;window.response=response;
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
    if(path==='/115-g9/u2-03/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(await readFile(new URL('../115-g9/u2-03/index.html',import.meta.url)));
    if(path==='/assets/vendor/xlsx-0.20.3.full.min.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url)));
    if(/^\/assets\/[\w.-]+\.(?:js|css|svg)$/.test(path)) {
      try{return res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript'}).end(await readFile(new URL('..'+path,import.meta.url)));}catch{return res.writeHead(404).end();}
    }
    if(!/^\/(assets\/(fullrev-(?:client|ui|progress)\.mjs|xp\.js)|tests\/fixtures\/fullrev\.mjs)$/.test(path))return res.writeHead(404).end();
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
async function login(page) {await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'帳號登入',exact:true}).click();}
test('真實活動頁載入預設 false，仍顯示既有登入／教師入口，不載新 client 或呼叫 Worker',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());const requests=[];
  await page.route('**/*',route=>{
    const url=route.request().url();requests.push(url);
    if(url.startsWith(base+'/'))return route.continue();
    if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app-compat.js')?sessionFirebase:'// offline mock'});
    return route.abort();
  });
  await page.goto(base+'/115-g9/u2-03/');await page.locator('.ybs-login').waitFor();
  assert.equal(await page.evaluate(()=>YBS_FULLREV_CONFIG.enabled),false);
  assert.equal(await page.evaluate(()=>YBS.fullrev),undefined);
  assert.equal(await page.evaluate(()=>YBS.CONFIG.project),'class-score-86020');
  assert.equal(await page.locator('#t-open').isVisible(),true);
  assert.equal(requests.some(url=>url.includes('fullrev-client')||url.includes('fullrev-ui')||url.includes('workers.dev')),false);
});
test('新活動：錯答同題、下一組才換題、回條不先給分、重置後清除舊進度',async t=>{
  const page=await pageFor(t);await login(page);
  await page.getByRole('button',{name:'開始這一關',exact:true}).click();await page.getByLabel('合成答案').fill('0');
  await page.evaluate(()=>app.state.fetcher=async()=>Response.json(response(0,{nextSeq:2,correct:false})));
  await page.getByRole('button',{name:'送出',exact:true}).click();await page.getByText('再修改同一題，不扣分。',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);assert.equal(await page.getByLabel('合成答案').inputValue(),'0');
  await page.evaluate(()=>app.state.fetcher=async()=>Response.json(response(1,{nextSeq:3,correct:true})));
  await page.getByRole('button',{name:'送出',exact:true}).click();await page.getByRole('button',{name:'下一組',exact:true}).waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);assert.equal(await page.getByRole('button',{name:'送出',exact:true}).isEnabled(),false);
  const sent=await page.evaluate(()=>app.requests.length);
  await page.getByLabel('合成答案').fill('8');
  assert.equal(await page.getByRole('button',{name:'送出',exact:true}).isEnabled(),false);
  await page.getByRole('button',{name:'送出',exact:true}).evaluate(button=>button.click());
  assert.equal(await page.evaluate(()=>app.requests.length),sent);assert.deepEqual(await page.evaluate(()=>seenQuestions),[0]);
  await page.getByRole('button',{name:'下一組',exact:true}).click();assert.deepEqual(await page.evaluate(()=>seenQuestions),[0,1]);
  assert.equal(await page.getByLabel('合成答案').inputValue(),'');
  await page.evaluate(()=>app.state.fetcher=async()=>Response.json({completed:true,resultId:'c_done'}));
  await page.getByRole('button',{name:'送出',exact:true}).click();await page.getByText('Lv 1 位元見習生 · 0 XP',{exact:true}).waitFor();
  // 成長頁從同一有效集合重算，取消的過關與徽章可減少。
  const growth=await pageFor(t,'?growth');await login(growth);
  await growth.evaluate(()=>app.state.snapshot=snapshot([0,1,2,3].map(i=>record(i))));
  await growth.getByRole('button',{name:'重新讀取',exact:true}).click();await growth.getByText('Lv 1 位元見習生 · 80 XP',{exact:true}).waitFor();
  await growth.evaluate(()=>app.state.snapshot=snapshot([0,1,2].map(i=>record(i))));
  await growth.getByRole('button',{name:'重新讀取',exact:true}).click();await growth.getByText('Lv 1 位元見習生 · 45 XP',{exact:true}).waitFor();
  assert.equal(await growth.getByText(/已獲得徽章/).count(),0);
});
test('傳送中與斷線待送時修改答案不會啟用送出或覆寫原請求',async t=>{
  const page=await pageFor(t);await login(page);
  const input=page.getByLabel('合成答案'),send=page.getByRole('button',{name:'送出',exact:true});
  await page.getByRole('button',{name:'開始這一關',exact:true}).click();await input.fill('7');
  await page.evaluate(()=>app.state.fetcher=()=>new Promise(resolve=>window.releaseAnswer=resolve));
  await send.click();await page.waitForFunction(()=>typeof releaseAnswer==='function');
  const sent=await page.evaluate(()=>app.requests.length);
  await input.fill('8');assert.equal(await send.isEnabled(),false);
  await send.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>app.requests.length),sent);
  assert.equal(await page.evaluate(()=>app.requests.at(-1).body.answer),7);
  await page.evaluate(()=>releaseAnswer(Response.json(response(0,{nextSeq:2,correct:false}))));
  await page.getByText('再修改同一題，不扣分。',{exact:true}).waitFor();
  assert.equal(await send.isEnabled(),true);assert.equal(await input.inputValue(),'8');
  await page.evaluate(()=>app.state.fetcher=async()=>{throw Error('synthetic-offline');});
  await send.click();await page.getByText('尚未確認，答案已保留，稍後可重試。',{exact:true}).waitFor();
  const original=await page.evaluate(()=>app.requests.at(-1).body);
  await input.fill('9');assert.equal(await send.isEnabled(),false);
  await send.evaluate(button=>button.click());assert.equal(await page.evaluate(()=>app.requests.length),sent+1);
  await page.evaluate(()=>{app.advance();app.state.fetcher=async()=>Response.json(response(0,{nextSeq:3,correct:false}));});
  await page.getByRole('button',{name:'重試送出',exact:true}).click();
  await page.getByText('再修改同一題，不扣分。',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>app.requests.at(-1).body),original);
  await input.fill('10');assert.equal(await send.isEnabled(),true);
});
test('Google 學生的教師文件被拒仍可登入作答；實際重新整理後還原同一草稿',async t=>{
  const page=await pageFor(t);
  await page.evaluate(()=>app.state.readErrors['ybsTeachers/synthetic-student']=Object.assign(Error('synthetic-denied'),{code:'permission-denied'}));
  await page.getByRole('button',{name:'學生 Google 登入',exact:true}).click();
  await page.getByRole('button',{name:'開始這一關',exact:true}).click();await page.getByLabel('合成答案').waitFor();
  assert.equal(await page.evaluate(()=>app.client.state().profile.owner),false);
  await page.addInitScript(()=>{window.syntheticProvider='google.com';window.syntheticTeacherError='permission-denied';});
  await page.reload();await page.waitForFunction(()=>window.ready);
  assert.equal(await page.evaluate(()=>app.client.state().profile.owner),false);
  await page.getByRole('button',{name:'開始這一關',exact:true}).click();await page.getByLabel('合成答案').waitFor();
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
test('實際重新整理保留八份進行中草稿及離線原答案，完成一份才可開始第九關',async t=>{
  const page=await pageFor(t);await login(page);
  const original=await page.evaluate(async()=>{
    for(let activity=1;activity<=8;activity++)await app.client.start(activity,0);
    app.state.fetcher=async()=>{throw Error('synthetic-offline');};
    try{await app.client.answer(8,0,7);}catch(e){if(e.code!=='pending')throw e;}
    return app.requests.at(-1).body;
  });
  await page.addInitScript(()=>{window.syntheticProvider='password';});await page.reload();await page.waitForFunction(()=>window.ready);
  assert.equal(await page.evaluate(async()=>{try{await app.client.start(9,0);}catch(e){return e.code;}}),'draft-capacity');
  const retried=await page.evaluate(async()=>{
    app.state.fetcher=async()=>Response.json({completed:true,resultId:'c_first'});await app.client.answer(1,0,7);
    app.state.fetcher=async()=>Response.json(response());await app.client.start(9,0);
    app.advance();await app.client.retry();return app.requests.at(-1).body;
  });
  assert.deepEqual(retried,original);
});
test('斷線答案待確認；換人及其他分頁登出清空題面與待送',async t=>{
  const context=await browser.newContext();t.after(()=>context.close());const first=await pageFor(t,'',context);await login(first);
  await first.getByRole('button',{name:'開始這一關',exact:true}).click();await first.getByLabel('合成答案').fill('7');
  await first.evaluate(()=>app.state.fetcher=async()=>{throw Error('offline');});
  await first.getByRole('button',{name:'送出',exact:true}).click();await first.getByText('尚未確認，答案已保留，稍後可重試。',{exact:true}).waitFor();
  const second=await pageFor(t,'',context);await login(second);
  await first.getByRole('button',{name:'帳號登入',exact:true}).waitFor({state:'visible'});
  assert.equal(await first.getByLabel('合成答案').count(),0);assert.equal(await first.evaluate(()=>app.client.state().pending),false);
  assert.equal(await first.evaluate(()=>app.client.state().snapshot),null);
});
test('owner 示範無請求、非owner不能匯出；未知投影不下載',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>app.state.owner=true);
  await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await page.getByText('教師示範不送成績。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'本機練習／示範',exact:true}).click();assert.equal(await page.evaluate(()=>app.requests.length),0);
  assert.equal(await page.getByRole('button',{name:'開始這一關',exact:true}).isEnabled(),false);
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
