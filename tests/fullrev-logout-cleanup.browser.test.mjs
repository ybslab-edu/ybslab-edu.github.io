import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><script src="/assets/xp.js"></script><body><script type="module">
import {roundFlow} from '/tests/fixtures/fullrev-round-flow.mjs';
import {mountActivity,mountGrowth,mountLogin} from '/assets/fullrev-ui.mjs';
const q=new URLSearchParams(location.search),guest=q.has('guest');
window.h=await roundFlow({guest,owner:true});
const saved=JSON.parse(sessionStorage.getItem('ybs:fullrev:'+h.client.project+':115-g9')||'null');
if(saved?.guest)await h.auth.signInAnonymously();
h.client=h.reopen({storage:sessionStorage,shared:localStorage,events:window,requestId:()=>crypto.randomUUID(),now:Date.now,schedule:setTimeout,cancel:clearTimeout});
h.cfg.week=Number(q.get('activity')||5);
window.ACTIVITIES=[5,6].map(week=>({...h.catalog[0],week,date:'2026-01-01',href:'115-g9/synthetic/',topic:'合成',openedAt:Date.now()-86400000}));
window.isActivityOpen=()=>true;window.activityOpenAt=a=>a.openedAt;window.termWeekOf=()=>1;window.termWeekLabel=()=> '第 1 週';window.TERMS=[];
if(location.pathname.includes('/me/')){history.replaceState({synthetic:'keep'},'',location.href);await mountGrowth({client:Promise.resolve(h.client)});}
else if(location.pathname.includes('/generic/')){
 await mountActivity({client:Promise.resolve(h.client),cfg:{...h.cfg,course:undefined}});
}else await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg});
window.ready=true;
</script></body></html>`;
async function contextFor(t){
 const context=await browser.newContext({serviceWorkers:'block'});t.after(()=>context.close());
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==base)return route.abort();
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:html});
  if(!/^\/(?:assets\/[\w.-]+\.(?:m?js|css)|tests\/fixtures\/fullrev(?:-round-flow|-teacher)?\.mjs)$/.test(url.pathname))return route.abort();
  return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(new URL('..'+url.pathname,import.meta.url))});
 });return context;
}
async function open(t,context,path='/activity/'){
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
 t.after(()=>assert.deepEqual(errors,[]));await page.goto(base+path);await page.waitForFunction(()=>window.ready);return page;
}
async function formState(page){return page.evaluate(()=>({
 values:[...document.querySelectorAll('input')].filter(el=>['account','password','cls','seat'].includes(el.name)).map(el=>el.value),
 password:document.querySelector('[name=password]').type,
 errors:[...document.querySelectorAll('[role=alert]')].map(el=>el.textContent),
 toggle:[...document.querySelectorAll('.ybs-password-toggle')].map(el=>[el.value,el.getAttribute('aria-label'),el.getAttribute('aria-pressed')])
}));}
async function assertClean(page){const state=await formState(page);
 assert.ok(state.values.every(v=>v===''),JSON.stringify(state));assert.equal(state.password,'password');assert.ok(state.errors.every(v=>v===''));
 if(state.toggle.length)assert.deepEqual(state.toggle,[['顯示','顯示密碼','false']]);
}
for(const path of ['/activity/','/generic/'])test(`${path} 合成帳號顯示密碼→登入→登出→換人，成功與身分清除都重設表單`,async t=>{
 const page=await open(t,await contextFor(t),path);
 await page.locator('[name=account]').fill('9990001');await page.locator('[name=password]').fill('synthetic-password');
 if(path==='/activity/')await page.getByRole('button',{name:'顯示密碼',exact:true}).click();
 await page.evaluate(()=>{for(const el of document.querySelectorAll('[name=cls],[name=seat]'))el.value='9';});
 await page.locator('form').first().locator('button[type=submit]').click();await page.waitForFunction(()=>h.client.state().profile);
 await assertClean(page);
 // 身分有效時仍可能有隱藏欄位殘值；登出也必須清。
 await page.evaluate(()=>{for(const el of document.querySelectorAll('input[name]'))el.value='synthetic-leftover';
  document.querySelector('[name=password]').type='text';for(const el of document.querySelectorAll('[role=alert]'))el.textContent='合成舊錯誤';});
 if(path==='/activity/')await page.locator('#g-notme').click();else await page.getByRole('button',{name:'登出／換人',exact:true}).click();
 await page.waitForFunction(()=>!h.client.state().profile);await assertClean(page);
 await page.evaluate(()=>{h.state.uid='synthetic-next';});
 await page.locator('[name=account]').fill('9990002');await page.locator('[name=password]').fill('synthetic-next-password');
 await page.locator('form').first().locator('button[type=submit]').click();await page.waitForFunction(()=>h.client.state().profile?.uid==='synthetic-next');await assertClean(page);
});
for(const path of ['/activity/','/generic/'])for(const guest of [false,true])test(`${path} ${guest?'訪客':'帳密'}另一分頁登出後，登入表單與所有活動 round key 同步清除`,async t=>{
 const context=await contextFor(t),a=await open(t,context,path);await a.evaluate(guest=>guest?h.client.login('guest',{cls:'901',seat:1}):h.client.login('password','9990001','synthetic-password'),guest);
 await a.evaluate(()=>{const prefix='ybs:fullrev:round:'+h.client.project+':115-g9:';
  sessionStorage.setItem(prefix+'6:synthetic-student:guest-completed','{"savedAt":1}');
  for(const el of document.querySelectorAll('input[name]'))el.value='synthetic-leftover';
  document.querySelector('[name=password]').type='text';for(const el of document.querySelectorAll('[role=alert]'))el.textContent='合成舊錯誤';});
 const b=await open(t,context);await b.evaluate(()=>h.client.logout());await a.waitForFunction(()=>h.client.state().profile===null);
 await assertClean(a);assert.equal(await a.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('ybs:fullrev:round:'))),false);
});
test('帳密登入失敗→顯示密碼→成功：錯誤、帳密、班座與 toggle aria 全部重設',async t=>{
 const page=await open(t,await contextFor(t));
 await page.locator('[name=account]').fill('invalid-synthetic-account');await page.locator('[name=password]').fill('synthetic-password');
 await page.locator('form').first().locator('button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('[role=alert]').textContent.includes('帳號或密碼不對'));
 await page.locator('[name=account]').fill('9990001');await page.locator('[name=password]').fill('synthetic-password');
 await page.getByRole('button',{name:'顯示密碼',exact:true}).click();
 await page.evaluate(()=>{document.querySelector('[name=cls]').value='901';document.querySelector('[name=seat]').value='1';});
 await page.locator('form').first().locator('button[type=submit]').click();await page.waitForFunction(()=>h.client.state().profile);await assertClean(page);
});
test('訪客完成多活動→登出：其他活動及過期摘要全清，舊站與相似 UID 保留',async t=>{
 const page=await open(t,await contextFor(t),'/activity/?guest&activity=5');
 await page.getByText('登入不了？用班級＋座號',{exact:true}).click();
 await page.locator('[name=cls]').fill('901');await page.locator('[name=seat]').fill('1');
 await page.getByRole('button',{name:'用班級＋座號開始',exact:true}).click();
 const complete=async()=>{await page.getByLabel('合成答案').waitFor();
  for(let slot=0;slot<2;slot++){await page.getByLabel('合成答案').fill('合成答案');await page.locator('#b-send').click();if(slot===0)await page.locator('#b-next-group').click();}
  await page.getByRole('heading',{name:'已存待審，尚未採計',exact:true}).waitFor();};
 await complete();await assertClean(page);
 await page.goto(base+'/activity/?guest&activity=6');await page.waitForFunction(()=>window.ready);await complete();
 const before=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.endsWith(':guest-completed')));assert.equal(before.length,2);
 await page.evaluate(()=>{const p='ybs:fullrev:round:'+h.client.project+':115-g9:';
  sessionStorage.setItem(p+'30:synthetic-student:guest-completed','{"savedAt":1}');
  sessionStorage.setItem(p+'5:synthetic-student-other','synthetic-keep');sessionStorage.setItem('ybs-old:round','synthetic-old');
  localStorage.setItem('ybs-old:progress','synthetic-old');});
 await page.locator('#account-toggle').click();await page.locator('#b-logout').click();await page.locator('#g-gbtn').waitFor();await assertClean(page);
 assert.deepEqual(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('ybs:fullrev:round:'))),['ybs:fullrev:round:synthetic-ybs-pr5:115-g9:5:synthetic-student-other']);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('ybs-old:round')),'synthetic-old');assert.equal(await page.evaluate(()=>localStorage.getItem('ybs-old:progress')),'synthetic-old');
});
for(const reason of ['登出','身分失效','跨分頁登出'])test(`老師查閱→${reason}：清頁首班座與 URL 查閱參數，保留其他 query／hash／history state`,async t=>{
 const context=await contextFor(t),page=await open(t,context,'/115-g9/me/?classKey=c901&subject=synthetic-subject&cls=901&seat=1&keep=1#safe');
 await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await page.locator('#growth').waitFor();
 assert.match(await page.locator('.page-heading h1').textContent(),/901 班 1 號/);
 const length=await page.evaluate(()=>history.length);
 if(reason==='身分失效')await page.evaluate(()=>h.changed(null));
 else if(reason==='跨分頁登出'){const other=await open(t,context);await other.evaluate(()=>h.client.logout());}
 else await page.locator('#logout').click();
 await page.locator('#signin').waitFor();assert.doesNotMatch(await page.locator('.page-heading h1').textContent(),/901|1 號/);
 const url=new URL(page.url());assert.equal(url.search,'?keep=1');assert.equal(url.hash,'#safe');
 assert.equal(await page.evaluate(()=>history.length),length);assert.deepEqual(await page.evaluate(()=>history.state),{synthetic:'keep'});
 assert.equal(await page.locator('#growth').isVisible(),false);
 await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
 assert.equal(await page.evaluate(()=>h.reads.filter(p=>p.includes('/validated')).length),0);
 assert.match(await page.locator('#status').textContent(),/重新選擇學生/);
});
test('教師授權失效：重新查閱拒絕後清頁首與 URL，重新登入也不能沿用舊目標',async t=>{
 const page=await open(t,await contextFor(t),'/115-g9/me/?classKey=c901&subject=synthetic-subject&cls=901&seat=1&keep=1#safe');
 await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();await page.locator('#growth').waitFor();
 await page.evaluate(()=>{h.state.owner=false;});await page.locator('#retry').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('只有此課程擁有者'));
 assert.equal(await page.locator('.page-heading h1').textContent(),'學生成長紀錄（唯讀）');
 assert.equal(new URL(page.url()).search,'?keep=1');assert.equal(await page.locator('#growth').isVisible(),false);
 await page.evaluate(()=>{h.state.owner=true;});await page.locator('#retry').click();
 assert.match(await page.locator('#status').textContent(),/重新選擇學生/);
 await page.locator('#logout').click();await page.getByRole('button',{name:'教師 Google 登入',exact:true}).click();
 assert.match(await page.locator('#status').textContent(),/重新選擇學生/);
});
