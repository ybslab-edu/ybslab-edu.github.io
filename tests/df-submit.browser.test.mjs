// 只用合成資料、假的 Firebase；不連正式服務，也不需要安裝新套件。
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --test tests/df-submit.browser.test.mjs
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let browser, server, base;
import {fakeFirebase} from './fixtures/df-firebase.mjs';

before(async()=>{
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!path.startsWith(root+sep) || !['.js','.html'].includes(extname(path))){res.writeHead(404).end();return;}
    try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':'text/html');res.end(await readFile(path));}
    catch{res.writeHead(404).end();}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server) await new Promise(ok=>server.close(ok));});

async function pageFor(t){
  const context=await browser.newContext({viewport:{width:1100,height:900}}), page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base)) return route.continue();
    if(url.startsWith('https://www.gstatic.com/firebasejs/')) return route.fulfill({contentType:'text/javascript',body:url.includes('app-compat')?fakeFirebase:''});
    return route.abort();
  });
  t.after(async()=>{await context.close();assert.deepEqual(errors,[],'沒有瀏覽器 JS 錯誤');});
  await page.goto(base+'/115-df/a/');
  await page.locator('#yl-manual').waitFor();
  return page;
}
async function login(page,account='9990001',confirm=true){
  await page.fill('#yl-btn input[name=a]',account);
  await page.fill('#yl-btn input[name=p]','synthetic-test-password');
  await page.click('#yl-btn button');
  await page.locator('#yw-yes').waitFor({state:'visible'});
  if(confirm){await page.click('#yw-yes');await page.locator('#report-send').waitFor();}
}
async function waitQueue(page,phase,retries=undefined){
  await page.waitForFunction(({phase,retries})=>{
    const q=JSON.parse(sessionStorage.getItem('ybslab:reports:115-df')||'[]');
    return q[0]?.phase===phase && (retries===undefined || q[0].retries===retries);
  },{phase,retries});
}
async function received(page,n=1){
  await page.waitForFunction(n=>document.querySelector('#report-panel').textContent.includes('第 '+n+' 堂：老師已收到（'),n);
}
async function freezeClock(page){
  await page.clock.install({time:new Date('2026-10-21T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-21T12:00:01Z'));
}

test('成功／覆寫：伺服器確認前停用按鈕，欄位與路徑受限，保留 createdAt',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{S.problem='合成作答😀';S.name='synthetic-excluded';S.b2.pw='synthetic-excluded';__fake.hold='receipt';});
  await page.click('#report-send');
  await page.waitForFunction(()=>__fake.commits.length===1 && __fake.release);
  assert.match(await page.textContent('#report-panel'),/交件中/);
  assert.equal(await page.locator('#report-send').isDisabled(),true);
  assert.equal((await page.textContent('#report-panel')).includes('老師已收到'),false);
  await page.evaluate(()=>__fake.release());await received(page);
  const first=await page.evaluate(()=>__fake.commits[0]);
  assert.equal(first.path,'ybsCourses/115-df/reports/u1_s1');
  assert.deepEqual(Object.keys(first.data).sort(),['uid','session','cls','seat','schemaVersion','encoding','payload','createdAt','updatedAt'].sort());
  assert.equal(first.data.cls,999);assert.equal(first.data.seat,1);
  assert.match(first.data.payload,/^[ -~]+$/);assert.ok(!first.data.payload.includes('synthetic-excluded'));
  assert.equal(JSON.parse(first.data.payload).problem,'合成作答😀');
  await page.evaluate(()=>{S.problem='合成第二份';});
  await page.click('#report-send');await page.waitForFunction(()=>__fake.commits.length===2);await received(page);
  const second=await page.evaluate(()=>__fake.commits[1]);
  assert.equal(second.data.createdAt,first.data.createdAt);
  assert.ok(second.data.updatedAt>=first.data.updatedAt);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ybslab:reports:115-df')),null);
  assert.equal(await page.evaluate(()=>__fake.attempts.length),0);
});

test('斷線依 2／5／15 秒退避，三次後停止；手動重試仍送原快照',async t=>{
  const page=await pageFor(t);await login(page);await freezeClock(page);
  await page.evaluate(()=>{S.problem='點擊當下的答案';__fake.failures=Array(4).fill('unavailable');});
  await page.click('#report-send');await waitQueue(page,'waiting',1);
  for(const [i,delay] of [2000,5000,15000].entries()){
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ybslab:reports:115-df'))[0].nextAt-Date.now()),delay);
    await page.evaluate(()=>{S.problem='稍後修改的答案';});
    await page.clock.fastForward(delay-1);assert.equal(await page.evaluate(()=>__fake.transactions),i+1);
    await page.clock.fastForward(1);await waitQueue(page,i===2?'failed':'waiting',Math.min(i+2,3));
  }
  await page.clock.fastForward(60000);assert.equal(await page.evaluate(()=>__fake.transactions),4);
  await page.click('[data-report-retry="1"]');await received(page);
  assert.equal(await page.evaluate(()=>JSON.parse(__fake.commits[0].data.payload).problem),'點擊當下的答案');
});

test('online 恢復處理待送；同堂新快照取代尚未送出的舊快照',async t=>{
  const page=await pageFor(t);await login(page);await freezeClock(page);
  await page.evaluate(()=>{S.problem='舊答案';__fake.failures=['unavailable'];});
  await page.click('#report-send');await waitQueue(page,'waiting',1);
  await page.evaluate(()=>{S.problem='新答案';});await page.click('#report-send');await received(page);
  await page.clock.fastForward(30000);await page.evaluate(()=>dispatchEvent(new Event('online')));
  assert.equal(await page.evaluate(()=>__fake.commits.length),1);
  assert.equal(await page.evaluate(()=>JSON.parse(__fake.commits[0].data.payload).problem),'新答案');
});

test('已送中的舊快照先完成，再交新快照，不丟失新待送資料',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{S.problem='正在送的答案';__fake.hold='beforeRead';});
  await page.click('#report-send');await page.waitForFunction(()=>__fake.release);
  await page.evaluate(()=>{S.problem='最新答案';queueReport(1);});
  await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('ybslab:reports:115-df'))[0]?.phase==='ready');
  await page.evaluate(()=>__fake.release());await received(page);
  assert.deepEqual(await page.evaluate(()=>__fake.commits.map(x=>JSON.parse(x.data.payload).problem)),['正在送的答案','最新答案']);
});

for(const failure of ['permission-denied','closed','not-listed','roster-changed']) test(`${failure}：不自動重送、不誤報成功`,async t=>{
  const page=await pageFor(t);await login(page);await freezeClock(page);
  await page.evaluate(failure=>{
    if(failure==='closed') __fake.open=false;
    else if(failure==='not-listed') __fake.roster=false;
    else if(failure==='roster-changed') __fake.rosterSeat=3;
    else __fake.failures=[failure];
  },failure);
  await page.click('#report-send');await waitQueue(page,'blocked');
  assert.match(await page.textContent('#report-panel'),/請找老師/);
  const calls=await page.evaluate(()=>__fake.transactions);
  await page.clock.fastForward(60000);await page.evaluate(()=>dispatchEvent(new Event('online')));
  assert.equal(await page.evaluate(()=>__fake.transactions),calls);
  assert.equal(await page.evaluate(()=>__fake.commits.length),0);
});

test('未登入、改填班座：可下載，只提示先登入而不交件',async t=>{
  const page=await pageFor(t);await page.click('#yl-manual');
  await page.fill('#lf-cls','999');await page.fill('#lf-seat','3');await page.click('#lf button[type=submit]');
  await page.click('#report-send');assert.match(await page.textContent('#report-panel'),/請先.*登入/);
  await page.click('#dl');
  assert.equal(await page.evaluate(()=>typeof __fake==='undefined'?0:__fake.transactions),0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ybslab:reports:115-df')),null);
});

test('容量超限：提示下載，作答完整保留，受限 API 也拒絕非 ASCII／超量',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{S.problem='a'.repeat(2*1024*1024);});
  await page.click('#report-send');await page.waitForFunction(()=>document.querySelector('#report-panel').textContent.includes('報告過大'));
  assert.equal(await page.evaluate(()=>S.problem.length),2*1024*1024);
  const codes=await page.evaluate(async()=>{
    const packet={schemaVersion:1,encoding:'ascii-json',snapshotAt:Date.now(),cls:999,seat:1};
    const codes=[];for(const payload of ['a'.repeat(524289),'中文']){
      try{await YBS.submitReport(1,{...packet,payload});}catch(e){codes.push(e.code);}
    }return codes;
  });
  assert.deepEqual(codes,['report/too-large','report/format']);
  assert.equal(await page.evaluate(()=>__fake.transactions),0);
});

test('登出換人：清除佇列，下一位 UID 不會收到前一人的答案',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{S.problem='第一人的答案';__fake.failures=['unavailable'];});
  await page.click('#report-send');await waitQueue(page,'waiting');
  const queued=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ybslab:reports:115-df'))[0]);
  assert.equal(queued.courseId,'115-df');assert.equal(queued.uid,'u1');assert.equal(queued.session,1);
  await page.click('#out');await page.click('#x2');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ybslab:reports:115-df')),null);
  await login(page,'9990002');await page.evaluate(()=>{S.problem='第二人的答案';});
  await page.click('#report-send');await received(page);
  assert.deepEqual(await page.evaluate(()=>__fake.commits.map(x=>[x.path,JSON.parse(x.data.payload).problem])),[['ybsCourses/115-df/reports/u2_s1','第二人的答案']]);
});

test('送出中 Auth 換人：停止舊交易、清除佇列，不用新 UID 寫舊答案',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{__fake.hold='beforeRead';});await page.click('#report-send');
  await page.waitForFunction(()=>__fake.release);
  await page.evaluate(()=>{__fake.setUser('u2');__fake.release();});
  await page.waitForFunction(()=>document.querySelector('#report-panel').textContent.includes('已清除待送報告'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ybslab:reports:115-df')),null);
  assert.equal(await page.evaluate(()=>__fake.commits.length),0);
});

test('重新開頁保留本人快照；遇較新雲端報告需確認，取消不覆寫',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{S.problem='先前待送答案';__fake.failures=['unavailable'];});
  await page.click('#report-send');await waitQueue(page,'waiting');
  page.once('dialog',dialog=>dialog.accept());await page.reload();await login(page,'9990001',false);
  await page.evaluate(()=>__fake.cloud(1,Date.now()+1000));
  await page.click('#yw-yes');await waitQueue(page,'conflict');
  page.once('dialog',dialog=>dialog.dismiss());await page.click('[data-report-retry="1"]');
  assert.equal(await page.evaluate(()=>__fake.commits.length),0);
  page.once('dialog',dialog=>dialog.accept());await page.click('[data-report-retry="1"]');await received(page);
  assert.equal(await page.evaluate(()=>JSON.parse(__fake.commits[0].data.payload).problem),'先前待送答案');
});

test('三個完成按鈕自動交對應堂次；一般下載／下載換人不新增報告，attempts 照舊',async t=>{
  const page=await pageFor(t);await login(page);
  await page.evaluate(()=>{
    S.h1={cause:'合成發生的原因',effect:'合成觀察的結果',ev:['E01','E02'],unsure:'還不能確定發生原因',checks:[true,true,true,true],submittedAt:null};
    for(const d of ['E01','E02']) S.log.push({t:now(),e:'open',d});step=4;render();
  });
  await page.click('#h1go');await page.click('#h1yes');await received(page,1);
  await page.evaluate(()=>{
    B2={batch2:[]};S.b2.unlockedAt=now();S.h2={decision:'修改',reason:'合成理由',ev:['E01','E02'],now:'合成作答完整的解釋句子'};
    S.concl.can='能證明合成觀察的結果';S.concl.cannot='不能證明合成原因的細節';step=6;render();
  });
  await page.click('#cgo');await page.click('#cy');await received(page,2);
  await page.evaluate(()=>{
    S.reveal.unlockedAt=now();S.reveal.r1='合成反思答案';RV={title:'合成揭露',facts:[],timeline:[],method:'',inclusion:'',questions:['合成問題'],calc:{prompt:'',rows:[],answers:[],discuss:''}};
    step=8;render();
  });
  await page.click('#fin');await received(page,3);
  assert.deepEqual(await page.evaluate(()=>__fake.commits.map(x=>x.data.session)),[1,2,3]);
  assert.deepEqual(await page.evaluate(()=>__fake.attempts.map(x=>x.path)),[0,1,2].map(n=>'ybsCourses/115-df/attempts/u1_1_'+n));
  await page.click('#dl');await page.click('#out');await page.click('#x1');await page.locator('#yl-manual').waitFor();
  assert.equal(await page.evaluate(()=>__fake.commits.length),3);
});
