import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');

test('班座登入手機完成與重整續作：真實 Worker guest API，待審只顯示本機 XP',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
  const [{formalData,ENV},{EPOCH,ORIGIN},{MemoryFirestore},{createFormalWorker},{guestPath}]=await Promise.all([
    load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs'),load('src/memory-adapter.mjs'),load('src/formal/index.mjs'),load('src/formal/guest.mjs')]);
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const width of [360,390]){
    const data=await formalData();data['ybsCourses/115-g9/classGates/c901_1']=data['ybsCourses/115-g9/classGates/synthetic-class'];delete data['ybsCourses/115-g9/classGates/synthetic-class'];
    const db=new MemoryFirestore(data,{now:()=>EPOCH,pathValidator:guestPath}),calls=[];
    const worker=createFormalWorker({env:{...ENV,FIREBASE_PROJECT_ID:'synthetic-ybs-pr5',YBS_PROJECT_ID:'synthetic-ybs-pr5'},adapter:db,now:()=>EPOCH,
      verifier:{verify:async()=>({uid:'synthetic-student',provider:'anonymous'})}});
    const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});t.after(()=>context.close());
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin==='https://synthetic-pr5.workers.dev'){
        if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST','access-control-allow-headers':'authorization,content-type'}});
        calls.push(url.pathname);
        const response=await worker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json',origin:ORIGIN,authorization:'Bearer synthetic-token'},body:request.postData()}));
        return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'access-control-allow-origin':'*'},body:await response.text()});
      }
      if(url.origin!=='http://127.0.0.1:8765')return route.abort();
      if(request.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/assets/xp.js"></script><body></body></html>'});
      if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev\.mjs)$/.test(url.pathname))return route.abort();
      return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
    });
    const page=await context.newPage();await page.goto('http://127.0.0.1:8765/115-g9/synthetic/');
    await page.evaluate(async()=>{
      const {harness}=await import('/tests/fixtures/fullrev.mjs');const {mountActivity}=await import('/assets/fullrev-ui.mjs');
      window.h=await harness();h.state.hints={};h.state.fetcher=(url,init)=>fetch(url,init);
      window.cfg={course:'115-g9',week:5,title:'合成訪客活動',rounds:[{name:'第一關'}],renderQuestion(question,host,{changed}){
        const input=document.createElement('input');input.setAttribute('aria-label','合成答案');input.type='text';input.oninput=changed;host.append(input);
        return {get:()=>input.value?JSON.parse(input.value):null,ready:()=>input.value!==''};
      }};
      window.ACTIVITIES=[{course:'115-g9',week:cfg.week,date:'2026-01-01',href:'115-g9/synthetic/',rounds:['第一關']}];window.isActivityOpen=()=>true;
      window.mount=client=>mountActivity({client:Promise.resolve(client),cfg});await mount(h.client);
    });
    assert.equal(await page.getByRole('button',{name:'學生 Google 登入',exact:true}).count(),0);
    await page.getByText('登入不了？用班級＋座號',{exact:true}).click();
    await page.getByLabel('班級',{exact:true}).fill('901');await page.getByLabel('座號',{exact:true}).fill('1');
    await page.getByRole('button',{name:'用班級＋座號開始',exact:true}).click();await page.getByLabel('合成答案').waitFor();
    assert.match(await page.locator('#who').textContent(),/901 班 1 號/);
    await page.evaluate(async()=>{const restored=h.reopen();await mount(restored);window.current=restored;});
    await page.getByLabel('合成答案').waitFor();assert.ok(calls.includes('/guest/resume'));
    for(let slot=0;slot<2;slot++){
      const head=[...db.docs].find(([p])=>p.includes('/guestHeads/'))[1];
      await page.getByLabel('合成答案').fill(JSON.stringify(head.activeSession.questions[slot].answer));
      await page.getByRole('button',{name:'送出',exact:true}).click();
      if(slot===0)await page.getByRole('button',{name:'下一組',exact:true}).click();
    }
    await page.locator('#verdict h3').filter({hasText:'已存待審，尚未採計'}).waitFor();
    assert.equal(await page.locator('#xp-header').isVisible(),true);assert.equal(await page.locator('#xp-total').textContent(),'30 XP');assert.equal(await page.getByRole('heading',{name:'過關！',exact:true}).count(),0);
    assert.equal([...db.docs.keys()].filter(p=>p.includes('/guestAttempts/')).length,1);
    assert.equal([...db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
    assert.ok(['/guest/context','/guest/start','/guest/answer','/guest/resume'].every(path=>calls.includes(path)));
    assert.ok(calls.every(path=>path.startsWith('/guest/')));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#account-toggle').click();await page.getByRole('button',{name:'不是我？換人',exact:true}).click();await page.getByRole('button',{name:'登入',exact:true}).waitFor();
    assert.equal(await page.locator('#main').isVisible(),false);await context.close();
  }
});
