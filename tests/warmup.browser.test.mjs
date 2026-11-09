// 真實活動頁、合成班座、隔離登入 SDK；只允許本機 UTF-8 靜態資源。
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
let browser, server, base;
before(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const path = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!path.startsWith(root + sep)) {res.writeHead(404).end(); return;}
    try {
      const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}[extname(path)];
      res.setHeader('Content-Type', (type || 'application/octet-stream') + '; charset=utf-8');
      res.end(await readFile(path));
    } catch {res.writeHead(404).end();}
  });
  await new Promise((ok, no) => {server.once('error', no); server.listen(0, '127.0.0.1', ok);});
  base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless: true});
});
after(async () => {await browser?.close(); if (server?.listening) await new Promise(ok => server.close(ok));});
async function setup(t, sub = 'u2-02') {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  t.after(() => context.close());
  const page = await context.newPage(), errors = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await context.route('**/*', route => {
    const request = route.request(), url = request.url();
    if (request.method() !== 'GET') writes.push(url);
    if (url.startsWith(base + '/assets/login.js')) return route.fulfill({contentType: 'text/javascript; charset=utf-8', body: `
      window.uploads=0;window.YBS={enabled:()=>false,status(){},submit(){window.uploads++}};`});
    return url.startsWith(base) ? route.continue() : route.abort();
  });
  await context.addInitScript(() => {Math.random = () => 0;});
  await page.goto(base + '/115-g9/' + sub + '/');
  await page.fill('#in-cls', '999'); await page.fill('#in-seat', '1');
  await page.click('#g-next'); await page.click('#g-go');
  await page.locator('#main').waitFor({state: 'visible'});
  return {page, writes};
}
const snapshot = page => page.evaluate(() => ({
  local: {...localStorage}, session: {...sessionStorage}, uploads,
  score: document.querySelector('#score').textContent,
  progress: document.querySelector('#rounds').textContent,
  streak: document.querySelector('#streak').textContent,
  instance: JSON.stringify(APP.inst), round: APP.ri
}));

test('真實班座進場、暖身全對與錯答回顧、可跳過、換人重置；不記分、不儲存、不上傳', async t => {
  const {page, writes} = await setup(t);
  await page.locator('#warmup').waitFor();
  const before = await snapshot(page);
  await page.getByRole('button', {name: '開始暖身', exact: true}).click();
  for (let i = 0; i < 3; i++) await page.locator('.warmup-options button').nth(i === 1 ? 0 : 2).click();
  assert.equal(await page.locator('#warmup li').count(), 3);
  const result = await page.locator('#warmup li').allTextContents();
  assert.equal(result.filter(s => s.includes('✓ 答對')).length, 2);
  assert.equal(result.filter(s => s.includes('✗ 答錯')).length, 1);
  assert.ok(result.every(s => s.includes('正確答案：')));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(await snapshot(page), before);
  assert.deepEqual(writes, []);
  await page.getByRole('button', {name: '進入活動', exact: true}).click();
  assert.equal(await page.locator('#warmup').isVisible(), false);
  await page.click('#b-swap');
  await page.fill('#in-cls', '999'); await page.fill('#in-seat', '2');
  await page.click('#g-next'); await page.click('#g-go');
  await page.getByRole('button', {name: '開始暖身', exact: true}).waitFor();
  assert.equal(await page.locator('#warmup li').count(), 0);
  const next = await snapshot(page);
  await page.getByRole('button', {name: '跳過暖身', exact: true}).click();
  assert.deepEqual(await snapshot(page), next);
  assert.equal(await page.locator('#task-instructions').isVisible(), true);
});

test('第一個題庫活動無先前短題時，不顯示空暖身；原關卡可操作', async t => {
  const {page} = await setup(t, 'u2-01');
  // 等待動態模組完成，再確認沒有可用題目時未插入面板。
  await page.evaluate(async () => {await import('/assets/warmup.js?v=20261105w1');});
  assert.equal(await page.locator('#warmup').count(), 0);
  assert.equal(await page.locator('#rounds button').count(), 4);
  await page.locator('#rounds button').nth(1).click();
  assert.equal(await page.evaluate(() => APP.ri), 1);
});
