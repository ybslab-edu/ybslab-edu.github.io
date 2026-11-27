import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {sessionFirebase} from './fixtures/login-session.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let server,browser,base;
const project='synthetic-fullrev-login',cookie='ybs_fullrev_browser_synthetic_fullrev_login';
// Same offline LOCAL/SESSION mock as the legacy login tests; attach token methods in memory only.
const sdk=sessionFirebase.replace('get currentUser() { return user; },',`get currentUser() { return user && {...user,
 getIdToken:async()=> 'synthetic-token',getIdTokenResult:async()=>({claims:{firebase:{sign_in_provider:user.providerData[0].providerId},ybsClassKeys:{'115-g9':'c901'}}})}; },`)
 .replace('initializeApp:(_,name) => ({...app,name}),','initializeApp:(options,name) => ({...app,options,name}),');
const model=`export function createReadModel(){return {context:async({activity,round})=>({schemaVersion:1,sourceProject:'${project}',course:'115-g9',uid:firebase.apps[0]?.auth().currentUser?.uid||__sessionMock.auth.currentUser.uid,
 classKey:'c901',subject:'synthetic-subject',activity,round,configVersion:1,bindingVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:{gateVersion:1,classGateVersion:1}})};}`;
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body><p>合成測試頁</p>
<script type="module">import {createBrowserClient} from '/assets/fullrev-client.mjs';
window.client=await createBrowserClient({enabled:true,answerTickets:true,firebase:{projectId:'${project}',apiKey:'synthetic-public-key'},workerOrigin:'https://synthetic-login.workers.dev',readModelModule:'/model.mjs'});
window.restored=await client.restore();window.ready=true;</script></body></html>`;
before(async()=>{
 server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/115-g9/synthetic/')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);
  if(path==='/model.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(model);
  if(!/^\/assets\/[\w.-]+\.mjs$/.test(path))return res.writeHead(404).end();
  try{res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('..'+path,import.meta.url)));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function contextFor(t){
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});t.after(()=>context.close());
 await context.route('**/*',route=>{
  const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app-compat.js')?sdk:'// offline mock'});
  if(url.startsWith('https://synthetic-login.workers.dev/')){
   return route.fulfill({json:{sid:'s'.repeat(22),nextSeq:1,completed:false,ticketVersion:1,ticket:'ybs-answer-v1.synthetic-browser-ticket',
    expiresAt:'2026-11-27T12:20:01Z',question:{slot:0,type:'synthetic',data:{value:7}}}});
  }
  return route.abort();
 });return context;
}
async function open(t,context){const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.clock.install({time:new Date('2026-11-27T12:00:00Z')});await page.clock.pauseAt(new Date('2026-11-27T12:00:01Z'));await page.goto(base+'/115-g9/synthetic/');await page.waitForFunction(()=>window.ready);return page;}
const login=(page,account='9990001')=>page.evaluate(account=>client.login('password',account,'synthetic-password'),account);

test('actual browser client: LOCAL account survives independent tabs and closing the last page, even with no drafts',async t=>{
 const context=await contextFor(t),a=await open(t,context);await login(a);
 assert.equal(await a.evaluate(()=>__sessionMock.persistence.at(-1)),'local');
 const marker=(await context.cookies()).find(c=>c.name===cookie);assert.equal(marker.value,'1');assert.equal(marker.expires,-1);
 const b=await open(t,context);assert.equal(await b.evaluate(()=>restored.uid),'session-one');assert.equal(await b.evaluate(()=>__sessionMock.signins.length),0);
 await a.close();await b.close();const reopened=await open(t,context);assert.equal(await reopened.evaluate(()=>restored.uid),'session-one');
 assert.equal(await reopened.evaluate(()=>__sessionMock.signins.length),0);
});

test('logout/switch purges ticket, input, session and other-course drafts across tabs; next student sees none',async t=>{
 const context=await contextFor(t),a=await open(t,context);await login(a);
 await a.evaluate(async()=>{await client.start(5,0);client.saveInput(5,0,['合成前一位草稿']);
  const key=Object.keys(localStorage).find(k=>k.startsWith('ybs:fullrev:work:'));const v=JSON.parse(localStorage.getItem(key));v.d.course='115-df';localStorage.setItem(key.replace(':115-g9:',':115-df:'),JSON.stringify(v));});
 const b=await open(t,context);assert.equal(await b.evaluate(()=>restored.uid),'session-one');
 await b.evaluate(()=>client.logout());await a.waitForFunction(()=>client.state().profile===null);
 assert.equal((await context.cookies()).some(c=>c.name===cookie),false);
 for(const page of [a,b])assert.equal(await page.evaluate(()=>JSON.stringify([Object.values(localStorage),Object.values(sessionStorage)]).includes('合成前一位草稿')),false);
 assert.equal(await a.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('ybs:fullrev:work:'))),false);
 await login(b,'9990002');assert.equal(await b.evaluate(()=>client.state().profile.uid),'session-two');assert.equal(await b.evaluate(()=>client.savedRound(5)),undefined);
 const next=await open(t,context);assert.equal(await next.evaluate(()=>restored.uid),'session-two');
});

test('missing browser-session cookie signs out restored LOCAL account and purges drafts before exposing identity',async t=>{
 const context=await contextFor(t),a=await open(t,context);await login(a);
 await a.evaluate(async()=>{await client.start(5,0);client.saveInput(5,0,['合成舊瀏覽器草稿']);});
 // Simulate ending the browser session: LOCAL state remains, session cookies do not.
 const state=await context.storageState();state.cookies=[];await a.close();
 const fresh=await browser.newContext({storageState:state,serviceWorkers:'block'});t.after(()=>fresh.close());
 await fresh.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith(base+'/'))return route.continue();
  if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({contentType:'text/javascript',body:url.endsWith('firebase-app-compat.js')?sdk:'// offline mock'});
  return route.abort();
 });
 const b=await open(t,fresh);assert.equal(await b.evaluate(()=>restored),null);
 assert.equal(await b.evaluate(()=>__sessionMock.auth.currentUser),null);assert.ok(await b.evaluate(()=>__sessionMock.signouts>0));
 assert.equal(await b.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('ybs:fullrev:work:'))),false);
});

test('warning appears at 18 minutes, is at least 17px, and expiry stops retries and explains restart',async t=>{
 const context=await contextFor(t),page=await open(t,context);await login(page);await page.evaluate(async()=>{await client.start(5,0);client.saveInput(5,0,['合成到期草稿']);});
 await page.clock.fastForward(18*60000-1);assert.equal(await page.locator('#fullrev-ticket-notice:visible').count(),0);
 await page.clock.fastForward(1);const notice=page.locator('#fullrev-ticket-notice');await notice.waitFor({state:'visible'});
 assert.match(await notice.textContent(),/你的.*2 分鐘/);assert.ok(await notice.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=17);
 await page.clock.fastForward(2*60000);assert.match(await notice.textContent(),/你的作答票已過期.*重新開始/);
 assert.equal(await page.evaluate(()=>client.state().status),'restart-required');assert.equal(await page.evaluate(()=>client.savedRound(5)),undefined);
 assert.equal(await page.evaluate(()=>JSON.stringify([Object.values(localStorage),Object.values(sessionStorage)]).includes('合成到期草稿')),false);
});
