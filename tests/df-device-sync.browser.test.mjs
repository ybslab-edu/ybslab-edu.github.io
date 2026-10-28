// 執行：PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --test tests/df-device-sync.browser.test.mjs
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sharedBackend,sharedFirebase,injectSyntheticLogin} from './fixtures/df-shared-firebase.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let browser,server,base;
// 只在測試回應中提供已登入狀態注入點；正式檔案完全不改、不執行帳密流程。
const loginSource=await readFile(new URL('../assets/login.js',import.meta.url),'utf8');
const testLogin=injectSyntheticLogin(loginSource);
before(async()=>{
  server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const path=resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
    if(!path.startsWith(root+sep)||!['.html','.js','.css'].includes(extname(path))) return res.writeHead(404).end();
    try {
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]);
      res.end(path===resolve(root,'assets/login.js')?testLogin:await readFile(path));
    } catch {res.writeHead(404).end();}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server) await new Promise(ok=>server.close(ok));});

async function activate(page,uid) {
  await page.locator('#yl-manual').waitFor();
  await page.evaluate(async uid=>{
    await YBS.__testLogin(uid);
    recOn=true;impWho={cls:'999',seat:uid==='u2'?'2':'1'};startAs(impWho.cls,impWho.seat);
  },uid);
  await page.locator('#report-send').waitFor();
}

async function pair(t,uidB='u1') {
  const backend=sharedBackend();
  async function device(id,uid) {
    const context=await browser.newContext({serviceWorkers:'block'}),errors=[];
    await context.exposeBinding('__sharedFirebase',(_,user,op,args)=>backend.request(id,user,op,args));
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===base) return route.continue();
      if(url.origin==='https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
        return route.fulfill({contentType:'text/javascript',body:url.pathname.endsWith('/firebase-app-compat.js')?sharedFirebase:''});
      return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
    await page.clock.install({time:new Date(backend.now+1000)});
    await page.clock.pauseAt(new Date(backend.now+1001));
    await page.goto(base+'/115-df/a/');await page.locator('#yl-manual').waitFor();
    await activate(page,uid);
    return page;
  }
  return {backend,a:await device('A','u1'),b:await device('B',uidB)};
}
const path=(uid='u1',session=1)=>`ybsCourses/115-df/reports/${uid}_s${session}`;
const problem=doc=>JSON.parse(doc.payload).problem;
const queue=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('ybslab:reports:115-df')||'[]'));
async function phase(page,value) {
  await page.waitForFunction(value=>JSON.parse(sessionStorage.getItem('ybslab:reports:115-df')||'[]')[0]?.phase===value,value);
}
async function send(page,answer,session=1) {
  await page.evaluate(async({answer,session})=>{S.problem=answer;flushSave();await queueReport(session);},{answer,session});
}
async function received(page,session=1) {
  await page.waitForFunction(session=>document.querySelector('#report-panel').textContent.includes(`第 ${session} 堂：老師已收到（`),session);
  assert.deepEqual(await queue(page),[]);
}
async function choose(page,accept,session=1) {
  const dialog=new Promise(resolve=>page.once('dialog',async d=>{assert.equal(d.type(),'confirm');await (accept?d.accept():d.dismiss());resolve();}));
  await page.click(`[data-report-retry="${session}"]`);await dialog;
}

test('雙裝置同堂交件：B 取代 A、保留 createdAt、更新 updatedAt；作答與收件狀態不自動同步',async t=>{
  const {a,b,backend}=await pair(t);
  await send(a,'合成 A 報告');await received(a);const first=structuredClone(backend.docs.get(path()));
  assert.equal(await b.evaluate(()=>S.problem),'');
  assert.equal(await b.evaluate(()=>Object.values(localStorage).some(value=>value.includes('合成 A 報告'))),false);
  await send(b,'合成 B 報告');await received(b);
  const second=backend.docs.get(path());assert.equal(problem(second),'合成 B 報告');
  assert.equal(second.createdAt,first.createdAt);assert.ok(second.updatedAt>first.updatedAt);
  assert.equal(await a.evaluate(()=>S.problem),'合成 A 報告');
  assert.ok((await a.textContent('#report-panel')).includes('老師已收到'));
  assert.equal(backend.commits.length,2);
});

test('A 較新報告遇 B 舊快照：拒絕覆寫完整保留待送與本機答案；同意後才取代',async t=>{
  const {a,b,backend}=await pair(t);
  await b.clock.setSystemTime(new Date(backend.now-1000));
  await send(a,'合成雲端新版');await received(a);const first=structuredClone(backend.docs.get(path()));
  await send(b,'合成本機舊版');await phase(b,'conflict');const pending=await queue(b);
  await choose(b,false);
  assert.deepEqual(await queue(b),pending);assert.deepEqual(backend.docs.get(path()),first);
  assert.equal(await b.evaluate(()=>S.problem),'合成本機舊版');
  assert.ok(await b.evaluate(()=>Object.values(localStorage).some(value=>value.includes('合成本機舊版'))));
  await choose(b,true);await received(b);
  assert.equal(problem(backend.docs.get(path())),'合成本機舊版');
  assert.equal(backend.docs.get(path()).createdAt,first.createdAt);
  assert.ok(backend.docs.get(path()).updatedAt>first.updatedAt);
});

test('確認前 A 再交新版：B 的舊確認時間不能授權覆蓋另一份新報告',async t=>{
  const {a,b,backend}=await pair(t);await b.clock.setSystemTime(new Date(backend.now-1000));
  await send(a,'合成 A 第一版');await received(a);
  await send(b,'合成 B 待送');await phase(b,'conflict');const pending=(await queue(b))[0];
  await send(a,'合成 A 第二版');await received(a);const newest=structuredClone(backend.docs.get(path()));
  await choose(b,true);await phase(b,'conflict');
  assert.deepEqual(backend.docs.get(path()),newest);
  assert.equal((await queue(b))[0].encoded.payload,pending.encoded.payload);
  assert.equal((await queue(b))[0].overwriteAt,newest.updatedAt);
  await choose(b,true);await received(b);assert.equal(problem(backend.docs.get(path())),'合成 B 待送');
});

test('不同堂交件分開存放，A 更新第一堂不改 B 的第二、三堂',async t=>{
  const {a,b,backend}=await pair(t);
  await send(a,'合成第一堂',1);await received(a,1);
  for(const session of [2,3]) {await send(b,'合成第'+session+'堂',session);await received(b,session);}
  const others=[2,3].map(session=>structuredClone(backend.docs.get(path('u1',session))));
  await send(a,'合成第一堂修訂');await received(a);
  assert.deepEqual([2,3].map(session=>backend.docs.get(path('u1',session))),others);
  assert.equal(problem(backend.docs.get(path())),'合成第一堂修訂');
  assert.equal(backend.docs.size,3);
});

test('兩個 UID 與裝置 storage 隔離：A 離線待送不進入 B 的佇列或報告',async t=>{
  const {a,b,backend}=await pair(t,'u2');backend.offline.add('A');
  await send(a,'合成 UID1 待送');await phase(a,'waiting');const pending=await queue(a);
  assert.equal(pending[0].uid,'u1');assert.deepEqual(await queue(b),[]);
  // 即使錯把 A 的待送備份帶進 B，重開頁也不能以 u2 接受或重送。
  await b.evaluate(pending=>sessionStorage.setItem('ybslab:reports:115-df',JSON.stringify(pending)),pending);
  await b.reload();await activate(b,'u2');assert.deepEqual(await queue(b),[]);
  await send(b,'合成 UID2 報告');await received(b);
  assert.deepEqual(await queue(a),pending);assert.equal(backend.docs.has(path()),false);
  assert.equal(problem(backend.docs.get(path('u2'))),'合成 UID2 報告');
  backend.offline.delete('A');await a.clock.fastForward(2000);
  await a.evaluate(()=>dispatchEvent(new Event('online')));await received(a);
  assert.equal(problem(backend.docs.get(path())),'合成 UID1 待送');
  assert.deepEqual(backend.commits.map(c=>[c.device,c.data.uid,c.data.seat]),[['B','u2',2],['A','u1',1]]);
});

test('B 離線快照恢復後遇 A 最新報告，online 只重試原快照並要求覆寫',async t=>{
  const {a,b,backend}=await pair(t);await b.clock.setSystemTime(new Date(backend.now-1000));
  backend.offline.add('B');await send(b,'合成離線原快照');await phase(b,'waiting');
  const pending=(await queue(b))[0];
  await b.evaluate(()=>{S.problem='合成未交件的新修改';flushSave();});
  await send(a,'合成 A 最新報告');await received(a);const newest=structuredClone(backend.docs.get(path()));
  backend.offline.delete('B');await b.clock.fastForward(2000);
  await b.evaluate(()=>dispatchEvent(new Event('online')));await phase(b,'conflict');
  assert.equal((await queue(b))[0].encoded.payload,pending.encoded.payload);
  assert.equal((await queue(b))[0].snapshotAt,pending.snapshotAt);
  await choose(b,false);assert.deepEqual(backend.docs.get(path()),newest);
  await choose(b,true);await received(b);
  assert.equal(problem(backend.docs.get(path())),'合成離線原快照');
  assert.equal(await b.evaluate(()=>S.problem),'合成未交件的新修改');
});

test('既有過關上傳：同 UID 同關跨裝置僅一筆，不還原另一裝置的作答',async t=>{
  const {a,b,backend}=await pair(t);
  const submit=page=>page.evaluate(()=>YBS.submit({activity:1,round:0,level:1,tries:2}));
  await a.evaluate(()=>{S.problem='合成 A 私有進度';flushSave();});
  await submit(a);const first=structuredClone([...backend.docs.values()][0]);
  await submit(b);
  assert.equal(backend.docs.size,1);assert.equal(backend.commits.length,1);
  assert.deepEqual([...backend.docs.values()][0],first);
  assert.equal(await b.evaluate(()=>S.problem),'');
  for(const page of [a,b]) assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ybslab:fq')||'[]')),[]);
  assert.ok(backend.calls.some(c=>c.device==='B'&&c.op==='get'&&c.args.path.endsWith('/attempts/u1_1_0')));
});

// 明確記錄現況限制，避免把時間比較誤當成不受裝置時鐘影響的版本保護。
test('限制重現：B 時鐘超前一天，恢復離線待送會直接覆寫 A 後來交件',async t=>{
  const {a,b,backend}=await pair(t);
  await b.clock.setSystemTime(new Date(backend.now+86400000));
  backend.offline.add('B');await send(b,'合成 B 較早離線作答');await phase(b,'waiting');
  await send(a,'合成 A 後來新版');await received(a);
  let prompts=0;b.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
  backend.offline.delete('B');await b.clock.fastForward(2000);
  await b.evaluate(()=>dispatchEvent(new Event('online')));await received(b);
  assert.equal(prompts,0);assert.equal(problem(backend.docs.get(path())),'合成 B 較早離線作答');
});
