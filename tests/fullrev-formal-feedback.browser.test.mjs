import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

test('手機正式過關不受同活動或其他活動的訪客待確認紀錄阻斷',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const [width,guestActivity,confirmFormal,guestRound] of [[390,5,true,1],[1280,6,true,1],[390,5,false,0]]) {
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});t.after(()=>context.close());
    const errors=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:8765')return route.abort();
      if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/assets/xp.js"></script><body></body></html>'});
      if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-formal-feedback)?\.mjs)$/.test(url.pathname))return route.abort();
      return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8765/115-g9/synthetic/');
    await page.evaluate(async options=>{
      const {formalFeedback}=await import('/tests/fixtures/fullrev-formal-feedback.mjs');const {mountActivity}=await import('/assets/fullrev-ui.mjs');
      window.h=await formalFeedback(options);window.ACTIVITIES=h.catalog;window.isActivityOpen=()=>true;
      await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg,now:h.now});await h.login();
    },{guestActivity,guestRound,confirmFormal});
    await page.locator('#g-isme').click();
    for(let slot=0;slot<2;slot++) {
      await page.getByLabel('合成答案').fill('7');await page.getByRole('button',{name:'送出',exact:true}).click();
      if(slot===0)await page.getByRole('button',{name:'下一組',exact:true}).click();
    }
    if(confirmFormal) {
      await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();
      assert.match(await page.locator('#verdict').textContent(),/本關 XP：\+10 過關、\+5 準時/);
      assert.equal(await page.locator('#sync').textContent(),'✓ 紀錄已上傳給老師');
      assert.equal(await page.locator('#xp-header').isVisible(),false);
      if(guestActivity===5)assert.match(await page.locator('#rounds button').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label')).join(' ')),/待老師確認/);
      const reads=await page.evaluate(()=>h.state.progressReads);
      await page.evaluate(()=>{h.advance();dispatchEvent(new Event('focus'));});
      await page.waitForFunction(reads=>h.state.progressReads===reads+1,reads);
      assert.equal(await page.getByRole('heading',{name:'過關！',exact:true}).isVisible(),true);
      // A new round updates its heading before its async start response arrives.
      // Hold that response so the test must wait for the actual question.
      await page.evaluate(()=>{
        const fetcher=h.state.fetcher;
        h.state.fetcher=async(url,init)=>{
          if(url.endsWith('/start')&&JSON.parse(init.body).round===1)
            await new Promise(resolve=>{window.releaseNextRound=resolve;});
          return fetcher(url,init);
        };
      });
      await page.getByRole('button',{name:'下一關',exact:true}).click();
      await page.locator('#round-status').filter({hasText:'第 2 關／共 4 關'}).waitFor();
      await page.waitForFunction(()=>typeof window.releaseNextRound==='function');
      assert.equal(await page.getByLabel('合成答案').count(),0);
      await page.evaluate(()=>window.releaseNextRound());
      await page.getByLabel('合成答案').waitFor({state:'visible'});
      assert.equal(await page.getByLabel('合成答案').isVisible(),true);
    } else {
      // click 不等待非同步 onclick；先等 Worker 完成回條，才檢查待確認畫面。
      await page.waitForFunction(()=>!h.client.state().pending);
      await page.locator('#sync').filter({hasText:'正在確認雲端紀錄'}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'過關！',exact:true}).count(),0);
      assert.equal(await page.getByRole('button',{name:'下一關',exact:true}).count(),0);
      assert.equal(await page.locator('#xp-header').isVisible(),false);
      assert.match(await page.locator('#sync').textContent(),/正在確認雲端紀錄/);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
});
