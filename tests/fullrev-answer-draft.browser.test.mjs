import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/assets/shell.css"><link rel="stylesheet" href="/assets/fullrev-shell.css"><body><script src="/assets/xp.js"></script><script type="module">
import {harness,response,snapshot,activities,config} from '/tests/fixtures/fullrev.mjs';
import {renderQuestion} from '/assets/fullrev-activities.mjs';
import {mountActivity} from '/assets/fullrev-ui.mjs';
window.ACTIVITIES=activities;window.isActivityOpen=()=>true;
const restoredProvider=sessionStorage.getItem('ybs:fullrev:'+config.firebase.projectId+':115-g9')?'password':undefined;
const app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider});window.app=app;
app.state.owner=false;
app.state.snapshot=snapshot([]);app.state.fetcher=async()=>Response.json(response(0,{question:{type:'minimum-bits-v1',slot:0,data:{n:15}}}));
await mountActivity({client:Promise.resolve(app.client),cfg:{course:'115-g9',week:5,title:'合成活動',rounds:[{name:'合成關卡'}],renderQuestion}});window.ready=true;
</script></body>`;
async function open(t,{tickets=false,clock=false}={}){
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:390,height:700},serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:8765')return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:tickets?html
   .replace('restoredProvider});','restoredProvider,answerTickets:true});')
   .replace('response(0,{question:','response(0,{ticketVersion:1,ticket:"ybs-answer-v1.synthetic-browser-fixture",question:'):html});
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev.mjs)$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});});
 const page=await context.newPage();page.setDefaultTimeout(6000);if(clock){await page.clock.install();await page.clock.pauseAt(new Date());}await page.goto('http://127.0.0.1:8765/synthetic/');await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>app.login());await page.locator('#g-isme').click();await page.locator('#stage input').first().waitFor();return page;
}
test('實際點擊停用送出鈕與鍵盤操作：所有欄位紅框、最上方聚焦、即時清除、深色可讀',async t=>{
 const page=await open(t);assert.equal(await page.locator('#b-send').isDisabled(),true);await page.locator('#send-control').click();
 assert.equal(await page.locator('.answer-error').count(),2);assert.equal(await page.locator('#stage input').first().evaluate(e=>e===document.activeElement),true);
 assert.equal(await page.locator('#stage input').first().getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('.answer-error').first().evaluate(e=>getComputedStyle(e).color),'rgb(255, 156, 143)');
 assert.equal(await page.locator('#stage input').first().evaluate(e=>getComputedStyle(e).outlineColor),'rgb(255, 156, 143)');
 await page.locator('#stage input').first().fill('4');assert.equal(await page.locator('.answer-error').count(),1);
 await page.locator('#send-control').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#stage input').nth(1).evaluate(e=>e===document.activeElement),true);
 await page.locator('#stage input').nth(1).pressSequentially('12x');assert.equal(await page.locator('#stage input').nth(1).inputValue(),'12x');assert.equal(await page.locator('#stage input').nth(1).evaluate(e=>e===document.activeElement),true);assert.match(await page.locator('.answer-error').innerText(),/整數/);
 await page.locator('#stage input').nth(1).fill('15');assert.equal(await page.locator('.answer-error').count(),0);assert.equal(await page.locator('#b-send').isDisabled(),false);
});
test('作答票跨重整帶回原票與草稿；過期提示原因且重新開始可恢復',async t=>{
 const page=await open(t,{tickets:true});await page.locator('#stage input').first().fill('４');
 await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#g-isme').click();
 await page.locator('#draft-notice').filter({hasText:'已恢復上次未送出的作答'}).waitFor();
 assert.equal(await page.locator('#stage input').first().inputValue(),'４');
 assert.deepEqual(await page.evaluate(()=>app.requests.map(r=>new URL(r.url).pathname)),['/ticket/resume']);
 assert.equal(await page.evaluate(()=>app.requests[0].body.ticket),'ybs-answer-v1.synthetic-browser-fixture');
 await page.locator('#stage input').first().fill('4');await page.locator('#stage input').nth(1).fill('15');
 await page.evaluate(()=>{app.state.fetcher=async()=>Response.json({error:'ticket_expired'},{status:410});});
 await page.locator('#b-send').click();await page.getByText(/作答票已過期/).first().waitFor();
 assert.equal(await page.evaluate(()=>app.client.state().pending),false);
 await page.evaluate(async()=>{const {response}=await import('/tests/fixtures/fullrev.mjs');app.state.fetcher=async()=>Response.json(response(0,{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-browser-new',question:{type:'minimum-bits-v1',slot:0,data:{n:15}}}));});
 await page.getByText('活動工具',{exact:true}).click();await page.getByRole('button',{name:'重新開始',exact:true}).click();
 await page.waitForFunction(()=>new URL(app.requests.at(-1).url).pathname==='/ticket/start');
});
test('跨重整保留未完成原文與同關題面，提示恢復；不是我清除本機草稿',async t=>{
 const page=await open(t);await page.locator('#stage input').first().fill('４');await page.reload();await page.waitForFunction(()=>window.ready);await page.locator('#g-isme').click();
 await page.locator('#draft-notice').filter({hasText:'已恢復上次未送出的作答'}).waitFor();assert.equal(await page.locator('#stage input').first().inputValue(),'４');assert.equal(await page.locator('#stage input').nth(1).inputValue(),'');
 assert.deepEqual(await page.evaluate(()=>app.requests.map(r=>new URL(r.url).pathname)),['/resume']);
 await page.locator('#account-toggle').click();await page.locator('#b-swap').click();assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('ybs:fullrev:work:')).length),0);assert.equal(await page.locator('#stage').innerText(),'');
});

for(const trigger of ['focus','timer'])test(`作答票期限到時清除活動畫面與輸入，保留登入且可重新開始（${trigger}）`,async t=>{
 const page=await open(t,{tickets:true,clock:true});
 await page.evaluate(async()=>{
  const {response,opened}=await import('/tests/fixtures/fullrev.mjs');
  app.state.fetcher=async()=>Response.json(response(0,{sid:'d'.repeat(22),expiresAt:new Date(opened+864e5+20*60000).toISOString(),
   ticketVersion:1,ticket:'ybs-answer-v1.synthetic-deadline-screen',question:{type:'minimum-bits-v1',slot:0,data:{n:15}}}));
  await app.client.start(5,0,{restart:true});
 });
 await page.locator('#stage input').first().fill('4');await page.locator('#stage input').nth(1).fill('15');
 await page.evaluate(()=>{window.oldDeadlineInput=document.querySelector('#stage input');app.advance(20*60000);});
 if(trigger==='focus')await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 else await page.clock.fastForward(20*60000);
 assert.equal(await page.evaluate(()=>app.client.state().status),'restart-required');
 assert.equal(await page.locator('#stage input').count(),0);
 assert.equal(await page.locator('#stage').innerText(),'');
 assert.equal(await page.evaluate(()=>oldDeadlineInput.isConnected),false);
 assert.equal(await page.locator('#b-send').isDisabled(),true);
 assert.equal(await page.locator('#draft-notice').innerText(),'');
 assert.equal(await page.evaluate(()=>app.client.state().profile.uid),'synthetic-student');
 assert.equal(await page.evaluate(()=>JSON.stringify([Object.values(localStorage),Object.values(sessionStorage)]).includes('synthetic-deadline-screen')),false);
 await page.evaluate(async()=>{
  const {response,opened}=await import('/tests/fixtures/fullrev.mjs');
  app.state.fetcher=async()=>Response.json(response(0,{expiresAt:new Date(opened+864e5+40*60000).toISOString(),
   ticketVersion:1,ticket:'ybs-answer-v1.synthetic-restarted-screen',question:{type:'minimum-bits-v1',slot:0,data:{n:15}}}));
 });
 await page.getByText('活動工具',{exact:true}).click();await page.getByRole('button',{name:'重新開始',exact:true}).click();
 await page.locator('#stage input').first().waitFor();
 assert.deepEqual(await page.locator('#stage input').evaluateAll(inputs=>inputs.map(input=>input.value)),['','']);
 assert.equal(await page.evaluate(()=>app.client.state().ticketTiming.state),'active');
});
