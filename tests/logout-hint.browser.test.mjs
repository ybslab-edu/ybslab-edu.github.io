// 真實頁面與原有合成 Firebase；所有外部請求在瀏覽器內攔截。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sessionFirebase} from './fixtures/login-session.mjs';
import {fakeFirebase} from './fixtures/df-firebase.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../',import.meta.url));
const curriculum = (await readFile(resolve(root,'assets/curriculum.js'),'utf8')).replace('open: false','open: true');
let browser,server,base;
before(async () => {
  server = createServer(async (req,res) => {
    const name = new URL(req.url,'http://127.0.0.1').pathname;
    const path = resolve(root,'.' + (name.endsWith('/') ? name + 'index.html' : name));
    if (!path.startsWith(resolve(root) + sep)) return res.writeHead(404).end();
    try {
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)] + '; charset=utf-8');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0,'127.0.0.1',ok));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true});
});
after(async () => {await browser?.close();if(server?.listening) await new Promise(ok=>server.close(ok));});
const entries = [
  {name:'活動',path:'/115-g9/u2-02/',button:'#b-swap',notice:'#sync',signedOut:'#g-login'},
  {name:'活動確認頁換人',path:'/115-g9/u2-02/',button:'#g-notme',notice:'#g-whotext',signedOut:'#g-login',confirm:false},
  {name:'專題確認頁換人',path:'/115-df/a/',button:'#yw-no',notice:'#toast',signedOut:'#yl',confirm:false},
  {name:'成長頁',path:'/115-g9/me/',button:'#logout',notice:'#status',signedOut:'#signin'},
  {name:'專題直接登出',path:'/115-df/a/',button:'#x2',notice:'#toast',signedOut:'#yl'},
  {name:'專題下載後登出',path:'/115-df/a/',button:'#x1',notice:'#toast',signedOut:'#yl'}
];
async function pageFor(t,entry) {
  const df = entry.path.startsWith('/115-df/');
  const context = await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
  context.setDefaultTimeout(5000);
  t.after(()=>context.close());
  const errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(base+'/assets/curriculum.js')) return route.fulfill({contentType:'text/javascript',body:curriculum});
    if(url.startsWith(base+'/')) return route.continue();
    if(url.startsWith('https://www.gstatic.com/firebasejs/10.14.1/')) return route.fulfill({contentType:'text/javascript',body:url.endsWith('/firebase-app-compat.js') ? (df ? fakeFirebase : sessionFirebase) : '// offline mock'});
    return route.abort();
  });
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-11-10T04:00:00Z'));
  await page.goto(base+entry.path);
  await page.locator('.ybs-login input[name=a]').fill('9990001');
  await page.locator('.ybs-login input[name=p]').fill('synthetic-test-password');
  await page.locator('.ybs-login button[type=submit]').click();
  if(entry.confirm===false) await page.locator(df ? '#yw-yes' : '#g-isme').waitFor({state:'visible'});
  else if(df) {await page.locator('#yw-yes').click();await page.locator('#out').waitFor();await page.click('#out');}
  else if(entry.name==='活動') await page.locator('#g-isme').click();
  else await page.locator('#growth').waitFor({state:'visible'});
  await page.waitForFunction(()=>YBS.profile() && !YBS.hasPending());
  t.after(()=>assert.deepEqual(errors,[]));
  return page;
}
async function pending(page) {
  await page.evaluate(async()=>{
    await YBS.firebaseSession();
    const db=firebase.apps[0].firestore(), doc=db.doc.bind(db);
    db.doc=path=>{
      const ref=doc(path);
      if(path.includes('/attempts/')) {
        const set=ref.set.bind(ref);
        ref.set=async data=>{
          await new Promise(resolve=>{window.__hintRelease=resolve;});
          await set(data);window.__hintWriteDone=true;
        };
      }
      return ref;
    };
    void YBS.submit({activity:4,round:0,level:1,tries:1});
  });
  await page.waitForFunction(()=>window.__hintRelease && YBS.hasPending());
}
async function out(page,entry) {
  await page.waitForFunction(()=>!YBS.profile());
  await page.locator(entry.signedOut).waitFor({state:'visible'});
  await page.waitForFunction(()=>!firebase.apps[0].auth().currentUser);
}
for(const entry of entries) {
  test(`${entry.name}：待送先提示、送完清提示、再次登出且紀錄已寫入`,async t=>{
    const page=await pageFor(t,entry);await pending(page);
    const uid=await page.evaluate(()=>YBS.profile().uid);
    await page.click(entry.button);
    assert.equal(await page.evaluate(()=>YBS.profile().uid),uid);
    assert.match(await page.locator(entry.notice).innerText(),/紀錄上傳中，請稍候再登出.*再按一次/);
    assert.equal(await page.evaluate(()=>firebase.apps[0].auth().currentUser.uid),uid);
    if(process.env.LOGOUT_HINT_SCREENSHOT && entry.name==='活動') await page.screenshot({path:process.env.LOGOUT_HINT_SCREENSHOT});
    await page.evaluate(()=>__hintRelease());
    await page.waitForFunction(()=>window.__hintWriteDone && !YBS.hasPending());
    await page.waitForFunction(selector=>!document.querySelector(selector).textContent.includes('再按一次可直接登出'),entry.notice);
    assert.equal(await page.evaluate(()=>YBS.profile().uid),uid,'送完不自動登出');
    const writes=await page.evaluate(()=>window.__sessionMock?.writes || window.__fake.attempts);
    assert.equal(writes.length,1);
    assert.match(writes[0].path,new RegExp('/attempts/'+uid+'_4_0$'));
    assert.equal(writes[0].data.uid,uid);
    await page.click(entry.button);await out(page,entry);
  });
  test(`${entry.name}：待送連按兩次可直接登出`,async t=>{
    const page=await pageFor(t,entry);await pending(page);
    await page.click(entry.button);
    assert.match(await page.locator(entry.notice).innerText(),/再按一次/);
    await page.click(entry.button);await out(page,entry);
    assert.equal(await page.evaluate(()=>window.__hintWriteDone),undefined,'沒有等待卡住的上傳');
    await page.evaluate(()=>__hintRelease());
    await page.waitForFunction(()=>window.__hintWriteDone);
  });
  test(`${entry.name}：空佇列沿用原流程`,async t=>{
    const page=await pageFor(t,entry);
    if(entry.name!=='專題下載後登出') {
      assert.equal(await page.evaluate(selector=>{
        document.querySelector(selector).click();return YBS.profile()===null;
      },entry.button),true,'原流程同步撤銷本機身分');
    } else await page.click(entry.button); // 原本下載入口就有 400ms 延遲。
    await out(page,entry);
    assert.equal(await page.getByText('紀錄上傳中，請稍候再登出',{exact:false}).count(),0);
  });
}
