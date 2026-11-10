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
async function login(page) {
  await page.locator('.ybs-login input[name="a"]').fill('9990001');
  await page.locator('.ybs-login input[name="p"]').fill('synthetic-test-password');
  await page.locator('.ybs-login button[type="submit"]').click();
  await confirmStudent(page);
}
async function confirmStudent(page) {
  await page.locator('#g-isme').waitFor({state:'visible'});
  assert.match(await page.locator('#g-whotext').textContent(), /999 班 1 號/);
  await page.click('#g-isme');
  await page.locator('#main').waitFor({state:'visible'});
}
async function assertCarried(page) {
  assert.equal(await page.evaluate(() => YBS.profile()?.uid), 'session-one');
  assert.deepEqual(await page.evaluate(() => __sessionMock.signins), []);
  assert.equal(await page.evaluate(() => __sessionMock.signouts), 0);
  assert.deepEqual(await page.evaluate(() => __sessionMock.persistence), ['session']);
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
test('me 頁登出後換頁仍未登入；獨立新分頁與關分頁後重開均不沿用', async t => {
  const {page,context} = await pageFor(t);
  await page.goto(base + '/115-g9/u2-01/');await login(page);
  const separate = await context.newPage();
  await separate.goto(base + '/115-g9/me/');
  await separate.waitForFunction(() => typeof __sessionMock !== 'undefined' && __sessionMock.persistence.length === 1);
  assert.equal(await separate.evaluate(() => YBS.profile()), null);
  assert.equal(await separate.locator('#growth').isVisible(), false);
  await separate.close();
  await page.click('#xp-link');await page.locator('#growth').waitFor({state:'visible'});
  await page.click('#logout');
  await page.goto(base + '/115-g9/u2-02/');
  await page.waitForFunction(() => typeof __sessionMock !== 'undefined' && __sessionMock.persistence.length === 1);
  assert.equal(await page.evaluate(() => YBS.profile()), null);
  assert.equal(await page.locator('#g-login').isVisible(), true);
  await login(page);await page.close();
  const reopened = await context.newPage();
  await reopened.goto(base + '/115-g9/me/');
  await reopened.waitForFunction(() => typeof __sessionMock !== 'undefined' && __sessionMock.persistence.length === 1);
  assert.equal(await reopened.evaluate(() => YBS.profile()), null);
  assert.equal(await reopened.locator('#growth').isVisible(), false);
});
test('延後 Auth 還原期間改填班座，不會被遲到的帳號恢復打斷', async t => {
  const {page} = await pageFor(t,{hold:true});
  await page.goto(base + '/115-g9/u2-01/');
  await page.evaluate(() => sessionStorage.setItem('mock:session-user', JSON.stringify({uid:'session-one',email:'cgjh9990001@ybslab-edu.github.io',isAnonymous:false})));
  await page.waitForFunction(() => typeof window.__sessionMock?.releaseAuth === 'function');
  await page.click('#g-manual');
  await page.evaluate(() => __sessionMock.releaseAuth());
  await page.locator('#g-form').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => YBS.profile()), null);
  assert.equal(await page.locator('#g-who').isVisible(), false);
  await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('mock:session-user')) === null);
});
