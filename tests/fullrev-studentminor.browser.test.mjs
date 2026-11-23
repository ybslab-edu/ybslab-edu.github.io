import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
test('手機長表格可捲動，換組高亮與第三層示範不改原題',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:8765')return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body><div id="stage"></div><aside id="demo"></aside></body>'});
  if(!/^\/assets\/[\w.-]+\.mjs$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });
 const page=await context.newPage();await page.goto('http://127.0.0.1:8765/synthetic');
 await page.evaluate(async()=>{
  const {renderQuestion}=await import('/assets/fullrev-activities.mjs');const {mountHintExample}=await import('/assets/fullrev-student-support.mjs');
  const host=document.querySelector('#stage'),data={mode:'knn',k:3,points:Array.from({length:12},(_,i)=>[i,i,0]),query:[0,1],options:['甲','乙']};
  const q={type:'finite-bank-v1',data};window.h=renderQuestion(q,host,{changed(){},shell:true});
  document.querySelector('#stage button').click();window.before=h.get();
  mountHintExample({host:document.querySelector('#demo'),example:{question:{type:'binary-encode-5-v1',data:{width:5,target:0}},answer:[0,0,0,0,0]},renderQuestion,onClose(){document.querySelector('#demo').replaceChildren();}});
 });
 // 原題與另一題示範各有自己的原理觀察，不可用全頁選取器混為重複掛載。
 assert.equal(await page.locator('#stage .principle-view').count(),1);assert.equal(await page.locator('#demo .principle-view').count(),1);
 assert.equal(await page.locator('#stage .principle-view').isVisible(),true);assert.equal(await page.locator('#demo .principle-view').isVisible(),true);
 assert.equal(await page.locator('.table-position-tip').isVisible(),true);
 assert.equal(await page.locator('th').first().evaluate(e=>getComputedStyle(e).position),'sticky');
 await page.getByRole('button',{name:'回原題繼續做'}).click();assert.equal(await page.evaluate(()=>h.get()===before),true);
 assert.equal(await page.locator('#demo .principle-view').count(),0);assert.equal(await page.locator('#stage .principle-view').count(),1);
 await page.evaluate(async()=>{const {mountHintExample}=await import('/assets/fullrev-student-support.mjs');mountHintExample({host:document.querySelector('#demo'),example:null,renderQuestion(){throw Error('不得建立未隔離示範');},onClose(){document.querySelector('#demo').replaceChildren();}});});
 assert.equal(await page.getByText('本關不提供示範',{exact:true}).isVisible(),true);
 assert.equal(await page.locator('#demo [data-bit]').count(),0);assert.equal(await page.evaluate(()=>h.get()===before),true);
 await page.getByRole('button',{name:'回原題繼續做'}).click();assert.equal(await page.locator('#demo').textContent(),'');
 await page.evaluate(async()=>{const {renderQuestion}=await import('/assets/fullrev-activities.mjs');const host=document.querySelector('#stage');host.replaceChildren();renderQuestion({type:'finite-bank-v1',data:{mode:'knn',k:3,points:Array.from({length:12},(_,i)=>[i+20,i,0]),query:[0,1],options:['甲','乙']}},host,{changed(){},shell:true});});
 assert.ok(await page.locator('mark.changed-number').count()>0);
});
