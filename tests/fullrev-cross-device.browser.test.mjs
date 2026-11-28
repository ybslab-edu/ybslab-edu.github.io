import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {snapshot,record,response} from './fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765',notice='這題還沒送出，換電腦前先按送出';
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"><body><script src="/assets/xp.js"></script><script type="module">
import {harness,activities} from '/tests/fixtures/fullrev.mjs';
import {renderQuestion} from '/assets/fullrev-activities.mjs';
import {mountActivity} from '/assets/fullrev-ui.mjs';
window.ACTIVITIES=activities;window.isActivityOpen=()=>true;
window.h=await harness({shared:localStorage,storage:sessionStorage,events:window,requestId:()=>crypto.randomUUID()});h.state.owner=false;
h.model.page=async()=>{const value=await (await fetch('/synthetic-cloud/progress')).json();h.state.snapshot=value;return value;};
h.state.fetcher=(url,init)=>fetch('/synthetic-cloud'+new URL(url).pathname,{method:'POST',body:init.body});
await mountActivity({client:Promise.resolve(h.client),cfg:{course:'115-g9',week:5,title:'合成換裝置活動',rounds:activities[0].rounds.map(name=>({name})),renderQuestion}});
window.ready=true;
</script></body></html>`;
// 兩個 context 共用的合成雲端；沒有將瀏覽器 storage 複製到另一部裝置。
async function fixture(t){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const cloud={records:[],requests:[],reads:0,awards:0,sessions:new Map(),delay:null,offline:false};
 const question=slot=>({type:'minimum-bits-v1',slot,data:{n:15}});
 async function device(width=390){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});t.after(()=>context.close());
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
   if(url.pathname==='/synthetic-cloud/progress'){cloud.reads++;return route.fulfill({json:snapshot(cloud.records)});}
   if(url.pathname.startsWith('/synthetic-cloud/')){
    const op=url.pathname.slice('/synthetic-cloud'.length),body=route.request().postDataJSON();cloud.requests.push({op,body});
    if(op==='/start'){
     const sid=String(cloud.sessions.size+1).padStart(22,'s');cloud.sessions.set(sid,{round:body.round,slot:0});
     return route.fulfill({json:response(0,{sid,question:question(0)})});
    }
    if(op==='/resume'){
     const session=cloud.sessions.get(body.sid);assert.equal(session.round,body.round);
     return route.fulfill({json:response(session.slot,{sid:body.sid,question:question(session.slot)})});
    }
    if(op==='/answer'){
     if(cloud.offline)return route.abort();
     if(cloud.delay)await cloud.delay;
     const session=cloud.sessions.get(body.sid);assert.equal(session.round,body.round);assert.equal(session.slot,body.slot);
     if(body.answer.b!==4||body.answer.m!==15)return route.fulfill({json:response(body.slot,{sid:body.sid,correct:false,nextSeq:body.seq+1,question:question(body.slot)})});
     session.slot++;
     if(session.slot===1)return route.fulfill({json:response(1,{sid:body.sid,correct:true,nextSeq:body.seq+1,question:question(1)})});
     if(!cloud.records.some(r=>r.round===body.round)){cloud.records.push(record(body.round));cloud.awards++;}
     return route.fulfill({json:{completed:true,resultId:record(body.round).resultId}});
    }
    assert.fail('非預期合成請求：'+op);
   }
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
   if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev\.mjs)$/.test(url.pathname))return route.abort();
   return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
  await page.goto(base+'/115-g9/synthetic/');await page.waitForFunction(()=>window.ready);return page;
 }
 return {cloud,device};
}
async function login(page){
 await page.locator('input[name="account"]').fill('9990001');await page.locator('input[name="password"]').fill('synthetic-password');
 await page.getByRole('button',{name:'登入',exact:true}).click();await page.locator('#g-isme').click();
}
const inputs=page=>page.locator('#stage input');
async function answer(page,bits='4',max='15'){
 await inputs(page).nth(0).fill(bits);await inputs(page).nth(1).fill(max);await page.locator('#b-send').click();
}
async function complete(page){
 await answer(page);await page.locator('#b-next-group').click();await answer(page);await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();
}
for(const reset of ['清除 sessionStorage','全新瀏覽器 context'])test(`${reset} 後同一合成學生由雲端確認進度續作，無草稿搬移或重複計分`,async t=>{
 const {cloud,device}=await fixture(t);const first=await device();await login(first);await complete(first);
 const xp=await first.locator('#xp-total').innerText();assert.equal(cloud.awards,1);
 await first.getByRole('button',{name:'下一關',exact:true}).click();await inputs(first).first().fill('４');
 const count=cloud.requests.length,reads=cloud.reads;
 let next;
 if(reset==='清除 sessionStorage'){
  await first.evaluate(()=>sessionStorage.clear());assert.equal(await first.evaluate(()=>sessionStorage.length),0);
  await first.reload();await first.waitForFunction(()=>window.ready);next=first;
 }else{
  next=await device();assert.deepEqual(await next.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
 }
 await login(next);assert.ok(cloud.reads>reads);assert.equal(await next.evaluate(()=>h.client.state().profile.uid),'synthetic-student');
 assert.equal(await next.locator('#xp-total').innerText(),xp);assert.equal(await next.locator('#rounds button').nth(1).isDisabled(),false);assert.equal(await next.locator('#rounds button').nth(2).isDisabled(),true);
 await next.getByText('你正在回看過關摘要，這次不計作答次數。',{exact:true}).waitFor();
 assert.equal(cloud.requests.length,count);assert.equal(await next.getByText(notice,{exact:true}).isVisible(),false);
 await next.getByRole('button',{name:'下一關',exact:true}).click();await inputs(next).first().waitFor();
 assert.deepEqual(await inputs(next).evaluateAll(items=>items.map(e=>e.value)),['','']);
 assert.equal(await next.locator('#draft-notice').innerText(),'');
 assert.equal(cloud.requests.at(-1).body.round,1);assert.ok(cloud.requests.slice(count).every(r=>r.body.round===1));
 assert.equal(cloud.awards,1);assert.equal(await next.locator('#xp-total').innerText(),xp);
 await complete(next);assert.equal(cloud.awards,2);assert.deepEqual(cloud.records.map(r=>r.round),[0,1]);
});
test('只有尚未確認的答案顯示換電腦提示；部分填答、待送、錯答確認、修改與過關',async t=>{
 const {cloud,device}=await fixture(t);const page=await device();await login(page);await inputs(page).first().waitFor();
 const hint=page.locator('#unsent-notice');assert.equal(await hint.isVisible(),false);
 await inputs(page).first().fill('4');await hint.waitFor();assert.equal(await hint.innerText(),notice);assert.equal(await page.locator('#b-send').isDisabled(),true);
 await inputs(page).nth(1).fill('14');assert.equal(await page.locator('#b-send').isDisabled(),false);
 let release;cloud.delay=new Promise(resolve=>{release=resolve;});t.after(()=>release());
 await page.locator('#b-send').click();await page.waitForFunction(()=>h.client.state().pending);
 assert.equal(await hint.isVisible(),true);release();cloud.delay=null;
 await page.getByRole('heading',{name:'還不對',exact:true}).waitFor();assert.equal(await hint.isVisible(),false);
 await inputs(page).nth(1).fill('15');assert.equal(await hint.isVisible(),true);
 await page.locator('#b-send').click();await page.locator('#b-next-group').waitFor();assert.equal(await hint.isVisible(),false);
 await page.locator('#b-next-group').click();assert.equal(await hint.isVisible(),false);
 cloud.offline=true;await answer(page);await page.locator('#send-hint').filter({hasText:'連線失敗'}).waitFor();assert.equal(await hint.isVisible(),true);
 cloud.offline=false;await page.evaluate(()=>h.advance());await page.locator('#b-retry').click();
 await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();assert.equal(await hint.isVisible(),false);
 await page.locator('#rounds button').first().click();assert.equal(await hint.isVisible(),false);
});
for(const width of [360,1280])test(`${width}px 提示至少 17px、無橫向溢出、不擋送出；截圖`,async t=>{
 const {device}=await fixture(t);const page=await device(width);await login(page);await inputs(page).first().fill('4');
 const hint=page.locator('#unsent-notice');await hint.waitFor();assert.equal(await hint.innerText(),notice);
 assert.ok(await hint.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=17));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await inputs(page).nth(1).fill('15');assert.equal(await page.locator('#b-send').isDisabled(),false);
 if(process.env.YBS_CROSS_DEVICE_SHOTS_DIR){await mkdir(process.env.YBS_CROSS_DEVICE_SHOTS_DIR,{recursive:true});await hint.scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.YBS_CROSS_DEVICE_SHOTS_DIR,`cross-device-${width}.png`),fullPage:true});}
 await page.locator('#b-send').click();await page.locator('#b-next-group').waitFor();assert.equal(await hint.isVisible(),false);
});
