// 真正活動頁 ↔ me 頁；SDK 全由 route.fulfill 提供合成替身，禁止外部網路。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sessionFirebase} from './fixtures/login-session.mjs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('../',import.meta.url)));
let browser,server,base;
before(async () => {
  server = createServer(async (req,res) => {
    const name = new URL(req.url,'http://127.0.0.1').pathname;
    const path = resolve(root,'.' + (name.endsWith('/') ? name + 'index.html' : name));
    if (!path.startsWith(root + sep)) return res.writeHead(404).end();
    try {
      res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)] + '; charset=utf-8');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(ok => server.listen(0,'127.0.0.1',ok));
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true});
});
after(async () => {await browser?.close();if (server?.listening) await new Promise(ok => server.close(ok));});
async function pageFor(t,{hold = false} = {}) {
  const context = await browser.newContext({serviceWorkers:'block'});
  context.setDefaultTimeout(3000);
  t.after(() => context.close());
  const errors = [], outside = [];
  context.on('page',page => page.on('pageerror',e => errors.push(e.message)));
  await context.route('**/*',route => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url.startsWith('https://www.gstatic.com/firebasejs/10.14.1/')) return route.fulfill({contentType:'text/javascript',body:url.endsWith('/firebase-app-compat.js') ? sessionFirebase : '// offline mock'});
    if (url.startsWith('https://fonts.googleapis.com/css2?')) return route.fulfill({contentType:'text/css',body:'/* offline system fonts */'});
    outside.push(url);return route.abort();
  });
  if (hold) await context.addInitScript(() => {window.__holdSessionAuth = true;});
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  await page.clock.setFixedTime(new Date('2026-11-10T04:00:00Z'));
  t.after(() => {assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);});
  return {page,context};
}
async function login(page,account = '9990001',seat = 1) {
  await page.locator('.ybs-login input[name="a"]').fill(account);
  await page.locator('.ybs-login input[name="p"]').fill('synthetic-test-password');
  await page.locator('.ybs-login button[type="submit"]').click();
  await confirmStudent(page,seat);
}
async function confirmStudent(page,seat = 1) {
  await page.locator('#g-isme').waitFor({state:'visible'});
  assert.ok((await page.locator('#g-whotext').textContent()).includes('999 班 ' + seat + ' 號'));
  await page.click('#g-isme');
  await page.locator('#main').waitFor({state:'visible'});
}
async function assertCarried(page) {
  assert.equal(await page.evaluate(() => YBS.profile()?.uid), 'session-one');
  assert.deepEqual(await page.evaluate(() => __sessionMock.signins), []);
  assert.equal(await page.evaluate(() => __sessionMock.signouts), 0);
  assert.deepEqual(await page.evaluate(() => __sessionMock.persistence), ['local']);
}
test('活動換另一週、返回活動及重新整理，都沿用同分頁帳號', async t => {
  const {page} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  for (const path of ['/115-g9/u2-02/','/115-g9/u2-01/']) {
    await page.goto(base + path);await confirmStudent(page);await assertCarried(page);
    assert.equal(await page.locator('#g-login').isVisible(), false);
  }
  await page.reload();await confirmStudent(page);await assertCarried(page);
});
test('點活動標題列等級條進 me、自動讀本人紀錄，再點路線回活動', async t => {
  const {page} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  await page.locator('#xp-link').click();
  await page.locator('#growth').waitFor({state:'visible'});
  assert.equal(await page.locator('#signin').isVisible(), false);
  assert.equal(await page.locator('#total').textContent(), '10 XP');
  await assertCarried(page);
  assert.deepEqual(await page.evaluate(() => __sessionMock.reads), [{path:'ybsCourses/115-g9/attempts',uid:'session-one'}]);
  await page.locator('#route a[href="../../115-g9/u2-02/"]').click();
  await confirmStudent(page);await assertCarried(page);
});
test('登入後新分頁、關活動分頁後重開均沿用；me 登出後新分頁也登出', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  const separate = await context.newPage();
  await separate.goto(base + '/115-g9/me/');
  await separate.locator('#growth').waitFor({state:'visible'});await assertCarried(separate);
  const marker = (await context.cookies()).find(c => c.name === 'ybslab_browser');
  assert.ok(marker);assert.equal(marker.expires, -1);assert.equal(marker.path, '/');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(base + '/115-g9/me/');
  await reopened.locator('#growth').waitFor({state:'visible'});await assertCarried(reopened);
  await reopened.click('#logout');
  const signedOut = await context.newPage();
  await signedOut.goto(base + '/115-g9/u2-02/');
  await signedOut.waitForFunction(() => window.__sessionMock?.persistence.length > 0);
  assert.equal(await signedOut.evaluate(() => YBS.profile()), null);
  assert.equal(await signedOut.locator('#g-login').isVisible(), true);
  await separate.waitForFunction(() => YBS.profile() === null);
  assert.equal(await separate.locator('#growth').isVisible(), false);
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'), false);
});
test('延後 Auth 還原期間改填班座，不會被遲到的帳號恢復打斷', async t => {
  const {page} = await pageFor(t,{hold:true});
  await page.goto(base + '/115-g9/u2-01/');
  await page.evaluate(() => {
    document.cookie = 'ybslab_browser=1; Path=/; SameSite=Lax';
    localStorage.setItem('mock:session-user', JSON.stringify({uid:'session-one',email:'cgjh9990001@ybslab-edu.github.io',isAnonymous:false,providerData:[{providerId:'password'}]}));
  });
  await page.waitForFunction(() => typeof window.__sessionMock?.releaseAuth === 'function');
  await page.click('#g-manual');
  await page.evaluate(() => __sessionMock.releaseAuth());
  await page.locator('#g-form').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => YBS.profile()), null);
  assert.equal(await page.locator('#g-who').isVisible(), false);
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('mock:session-user')));
});
test('LOCAL 還在但沒有 cookie 時自動登出，不讀雲端並清帳號暫存', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  await page.evaluate(() => {
    sessionStorage.setItem('ybslab:fq','[]');sessionStorage.setItem('ybslab:reports:115-df','[]');
    sessionStorage.setItem('ybslab:me:synthetic@example.invalid','{}');
    localStorage.setItem('ybslab:guest:115-g9',JSON.stringify({queue:[],receipts:[]}));
  });
  await context.clearCookies();
  await page.goto(base + '/115-g9/me/');
  await page.waitForFunction(() => window.__sessionMock?.signouts === 1);
  assert.equal(await page.evaluate(() => YBS.profile()), null);
  assert.equal(await page.locator('#growth').isVisible(), false);
  assert.deepEqual(await page.evaluate(() => __sessionMock.reads), []);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('ybslab:me:') || ['ybslab:fq','ybslab:reports:115-df'].includes(k))), []);
  assert.ok(await page.evaluate(() => localStorage.getItem('ybslab:guest:115-g9')));
});
test('不是我換人後，新分頁沒有登入與舊帳號 cookie', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  await page.click('#b-swap');
  const other = await context.newPage();await other.goto(base + '/115-g9/me/');
  await other.waitForFunction(() => window.__sessionMock?.persistence.length > 0);
  assert.equal(await other.evaluate(() => YBS.profile()), null);
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'), false);
});
test('window.open 複製待送佇列：兩分頁同時重送同關只寫一次', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  await page.evaluate(() => sessionStorage.setItem('ybslab:fq',JSON.stringify([{uid:'session-one',activity:4,round:1,level:1,tries:2}])));
  const popupPromise = context.waitForEvent('page');
  await page.evaluate(() => window.open('/115-g9/u2-02/','_blank'));
  const popup = await popupPromise;
  await Promise.all([page.reload(),popup.waitForLoadState()]);
  await Promise.all([confirmStudent(page),confirmStudent(popup)]);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('ybslab:fq') || '[]').length === 0);
  await popup.waitForFunction(() => JSON.parse(sessionStorage.getItem('ybslab:fq') || '[]').length === 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('mock:write-count')), '1');
});
test('去重查詢尚未回應就登出：遲到回應不寫出舊帳號的待送', async t => {
  const {page} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  await page.evaluate(() => {__sessionMock.holdAttemptRead = true;void YBS.submit({activity:4,round:1,level:1,tries:2});});
  await page.waitForFunction(() => typeof __sessionMock.releaseAttemptRead === 'function');
  await page.evaluate(async () => {await YBS.logout();__sessionMock.releaseAttemptRead();});
  await page.waitForFunction(() => !sessionStorage.getItem('ybslab:fq'));
  assert.deepEqual(await page.evaluate(() => __sessionMock.writes), []);
});
for (const [path,signin,signout] of [
  ['/115-g9/teacher/','#cloud-login','#cloud-logout'],
  ['/115-g9/teacher/report/','#report-login','#report-logout'],
  ['/115-df/teacher/','#cloud-login','#cloud-logout']
]) test(`教師登出清除學生瀏覽器標記：${path}`, async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'), true);
  await page.goto(base + path);await page.click(signin);
  await page.locator(signout).waitFor({state:'visible'});await page.click(signout);
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'), false);
  const other = await context.newPage();await other.goto(base + '/115-g9/me/');
  await other.waitForFunction(() => window.__sessionMock?.persistence.length > 0);
  assert.equal(await other.evaluate(() => YBS.profile()), null);
});
test('跨分頁撤銷 A：清除活動班座與作答；B 重新確認班座後僅更新 B 進度', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-02/');await login(page);
  await page.evaluate(() => {
    APP.handle.fill();document.querySelector('#sample-rate').dispatchEvent(new Event('change'));
    document.querySelector('#b-send').click();
    window.progressA = localStorage.getItem('it9:w4:999-1');
  });
  const other = await context.newPage();await other.goto(base + '/115-g9/me/');
  await other.locator('#growth').waitFor({state:'visible'});await other.click('#logout');
  await page.waitForFunction(() => YBS.profile() === null);
  assert.equal(await page.locator('#main').isVisible(),false,'撤銷必須離開 A 的活動');
  assert.equal(await page.locator('#gate').isVisible(),true);
  assert.equal(await page.locator('#who').textContent(),'');
  assert.equal(await page.locator('#in-cls').inputValue(),'');
  assert.equal(await page.locator('#in-seat').inputValue(),'');
  assert.equal(await page.locator('#stage').textContent(),'');
  assert.equal(await page.evaluate(() => APP.handle),null);
  await page.locator('#g-gbtn input[name="a"]').fill('9990002');
  await page.locator('#g-gbtn input[name="p"]').fill('synthetic-test-password');
  await page.locator('#g-gbtn button[type="submit"]').click();
  await page.locator('#g-isme').waitFor({state:'visible'});
  assert.match(await page.locator('#g-whotext').textContent(),/999 班 2 號/);
  assert.equal(await page.locator('#main').isVisible(),false,'B 尚未確認班座，不能進活動');
  await page.click('#g-isme');
  assert.match(await page.locator('#who').textContent(),/999 班 2 號/);
  await page.evaluate(() => {
    for (let i = 0; i < 2; i++) {
      APP.handle.fill();document.querySelector('#sample-rate').dispatchEvent(new Event('change'));
      document.querySelector('#b-send').click();
    }
  });
  await page.waitForFunction(() => __sessionMock.writes.length === 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('it9:w4:999-1') === progressA),true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('it9:w4:999-2')).mask),1);
  assert.equal(await page.evaluate(() => __sessionMock.writes[0].data.uid),'session-two');
});
test('已記憶教師模式登出：清 cookie、廣播撤銷，不恢復舊學生帳號', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-02/');await login(page);
  const other = await context.newPage();await other.goto(base + '/115-g9/me/');
  await other.locator('#growth').waitFor({state:'visible'});
  await page.evaluate(() => sessionStorage.setItem('ybslab:teacher','1'));
  await page.reload();
  await page.locator('#tbar').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => YBS.profile()),null,'記憶教師模式沒有建立學生 profile');
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'),true);
  await page.click('#b-swap');
  assert.equal((await context.cookies()).some(c => c.name === 'ybslab_browser'),false);
  assert.ok(await page.evaluate(() => localStorage.getItem('ybslab:account-logout')));
  await other.waitForFunction(() => YBS.profile() === null);
  await page.waitForFunction(() => window.__sessionMock?.persistence.length > 0);
  assert.equal(await page.evaluate(() => YBS.profile()),null);
  assert.equal(await page.locator('#g-login').isVisible(),true);
  assert.equal(await page.locator('#g-who').isVisible(),false);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('ybslab:teacher')),null);
});
test('教師 Google SESSION 重新載入與學生撤銷廣播不受學生 cookie 限制', async t => {
  const {page} = await pageFor(t);
  await page.goto(base + '/115-g9/teacher/report/');await page.click('#report-login');
  await page.waitForFunction(() => !document.querySelector('#report-read').disabled);
  assert.equal(await page.evaluate(() => __sessionMock.auth.currentUser.uid),'teacher');
  await page.reload();
  // 沿用原教師入口啟動 SDK，單獨檢查 restore，不再呼叫 popup 重新登入。
  await page.evaluate(() => {void YBS.firebaseSession();});
  await page.waitForFunction(() => window.__sessionMock?.persistence.length > 0);
  assert.equal(await page.evaluate(() => __sessionMock.auth.currentUser?.uid),'teacher');
  assert.equal(await page.evaluate(() => __sessionMock.signouts),0);
  assert.deepEqual(await page.evaluate(() => __sessionMock.persistence),['session']);
  await page.evaluate(() => dispatchEvent(new StorageEvent('storage',{key:'ybslab:account-logout',newValue:'synthetic-revoke'})));
  // 讓撤銷的 Auth 序列完成後再檢查，避免只驗到同步的 currentUser。
  await page.evaluate(() => YBS.firebaseSession());
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => __sessionMock.auth.currentUser?.uid),'teacher');
});
for (const activity of ['u1-05','u1-06']) test(`演出中的活動收到撤銷會取消舊演出，B 可重新確認班座：${activity}`, async t => {
  const {page,context} = await pageFor(t);
  await page.clock.install();
  await page.goto(base + '/115-g9/' + activity + '/');await login(page);
  await page.evaluate(() => {APP.handle.fill();void play();});
  assert.equal(await page.evaluate(() => running),true);
  const other = await context.newPage();await other.goto(base + '/115-g9/me/');
  await other.locator('#growth').waitFor({state:'visible'});await other.click('#logout');
  await page.waitForFunction(() => YBS.profile() === null);
  assert.equal(await page.locator('#main').isVisible(),false);
  await page.clock.fastForward(20000);
  assert.equal(await page.evaluate(() => running),false);
  assert.equal(await page.evaluate(() => APP.handle),null);
  assert.equal(await page.locator('#verdict').count(),1,'清作答時保留共用判定節點');
  assert.deepEqual(await page.evaluate(() => __sessionMock.writes),[]);
  await login(page,'9990002',2);
  assert.match(await page.locator('#who').textContent(),/999 班 2 號/);
  assert.equal(await page.locator('#verdict').count(),1);
});
