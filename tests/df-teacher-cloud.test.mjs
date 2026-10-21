// 合成 Firebase；測試伺服器只服務此工作目錄，不連正式 Firebase。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL('/home/teacher/projects/class-score/codex-tmp/node_modules/playwright/index.mjs').href);
const root = resolve(import.meta.dirname, '..');
const fake = `window.firebase=(()=>{
  window.testState={uid:'owner',queries:[],deletes:[],roster:[{cls:701,seat:1},{cls:701,seat:2},{cls:701,seat:3}],reports:[]};
  const s=window.testState;let callback=()=>{};
  const auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:f=>{callback=f;f(null)},
    signInWithPopup:async()=>{auth.currentUser={uid:s.uid};await callback(auth.currentUser)},
    signOut:async()=>{auth.currentUser=null;await callback(null)}};
  s.changeUser=async uid=>{auth.currentUser=uid?{uid}:null;await callback(auth.currentUser)};
  function docs(items){return items.map((d,i)=>({id:d.id||String(i),ref:{id:d.id},data:()=>({...d,updatedAt:{toDate:()=>new Date('2026-10-21T12:34:00Z')}})}))}
  const db={doc:path=>({get:async opts=>{s.queries.push({path,opts});return{exists:true,data:()=>({ownerUid:'owner',open:false})}}}),
    collection:path=>({get:async opts=>{s.queries.push({path,opts});return{docs:docs(s.roster)}},
      where:(field,op,n)=>({get:async opts=>{s.queries.push({path,field,op,n,opts});
        if(s.delay)await new Promise(r=>{s.release=r});return{docs:docs(s.reports.filter(d=>d.session===n))}}})}),
    batch:()=>{const pending=[];return{delete:ref=>pending.push(ref.id),commit:async()=>{s.deletes.push(...pending);s.reports=s.reports.filter(d=>!pending.includes(d.id))}}}};
  const app={name:'df-teacher',auth:()=>auth,firestore:()=>db};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{}}
  return{apps:[],initializeApp:()=>app,auth:{GoogleAuthProvider,Auth:{Persistence:{SESSION:'session'}}}};
})();`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('http://df-teacher.test/**', async route => {
    try {
      let path = new URL(route.request().url()).pathname;
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, '.' + path);
      if (!file.startsWith(root + '/')) throw new Error('path');
      await route.fulfill({contentType:extname(file)==='.js'?'text/javascript':'text/html',body:await readFile(file)});
    } catch { await route.fulfill({status:404,body:''}); }
  });
  await context.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({contentType:'text/javascript',body:r.request().url().includes('app-compat')?fake:''}));
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({body:''}));
  const page = await context.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://df-teacher.test/115-df/teacher/');
  await page.click('#cloud-login');
  await page.waitForFunction(()=>!document.getElementById('cloud-read').disabled);
  const state={app:'DF-investigation',appVersion:'1.0',version:'A',cls:999,seat:60,log:[],problem:'<img src=x onerror="window.XSS=1">',exports:['2099-01-01']};
  const envelope=(uid,session,seat,payload=JSON.stringify(state))=>({id:uid+'_s'+session,uid,session,cls:701,seat,schemaVersion:1,encoding:'ascii-json',payload});
  await page.evaluate(reports=>{testState.reports=reports},[
    envelope('u1',1,1),envelope('u2',2,2),envelope('bad',1,2,'{broken'),envelope('duplicate',1,1)
  ]);
  await page.click('#cloud-read');
  await page.waitForFunction(()=>document.getElementById('cloud-status').textContent.includes('已讀取 2'));
  assert.equal(await page.locator('tbody tr').count(),2);
  assert.match(await page.textContent('#tablebox'),/701-1/);
  assert.doesNotMatch(await page.textContent('#tablebox'),/999-60/);
  assert.match(await page.textContent('#tablebox'),/雲端.*2026/);
  assert.match(await page.textContent('#tablebox'),/同班座/);
  assert.match(await page.textContent('#cloud-status'),/略過 1.*bad_s1/);
  assert.match(await page.textContent('#cloud-roster'),/701-2、701-3.*待查：701-1/);
  await page.locator('tbody tr').first().click();
  assert.equal(await page.locator('#drawer img').count(),0);
  assert.equal(await page.evaluate(()=>window.XSS),undefined);
  const local={...state,cls:701,seat:1,exports:['2099-01-01']};
  await page.setInputFiles('#files',{name:'synthetic.html',mimeType:'text/html',buffer:Buffer.from('<script id="df-report" type="application/json">'+JSON.stringify(local)+'</script>')});
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===3);
  assert.match(await page.textContent('#tablebox'),/本機檔案/);
  assert.equal(await page.locator('tbody tr').count(),3,'local must not replace cloud');
  await page.selectOption('#cloud-session','2');
  assert.equal(await page.locator('tbody tr').count(),0);
  assert.equal(await page.locator('#drawer').isHidden(),true);
  await page.click('#cloud-read');
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1);
  assert.match(await page.textContent('#tablebox'),/701-2/);
  const queries=await page.evaluate(()=>testState.queries);
  assert.deepEqual(queries.filter(q=>q.field).map(q=>[q.field,q.op,q.n,q.opts.source]),[['session','==',1,'server'],['session','==',2,'server']]);
  console.log('PASS owner 分堂單次讀取、伺服器時間、身分覆寫、解碼失敗、未交名單、衝突、XSS、本機匯入');
  let confirmation='';
  page.once('dialog',async d=>{confirmation=d.message();await d.dismiss()});
  await page.click('#cloud-delete');
  await page.waitForFunction(()=>!document.getElementById('cloud-delete').disabled);
  assert.match(confirmation,/115-df.*第 2 堂.*1 份/);
  assert.deepEqual(await page.evaluate(()=>testState.deletes),[]);
  page.once('dialog',d=>d.accept());
  await page.click('#cloud-delete');
  await page.waitForFunction(()=>document.getElementById('cloud-status').textContent.includes('已刪除 1'));
  assert.deepEqual(await page.evaluate(()=>testState.deletes),['u2_s2']);
  assert.equal(await page.evaluate(()=>testState.reports.filter(d=>d.session===1).length),3);
  console.log('PASS 刪除先列筆數、取消無刪除、確認只刪選定堂次（關課 owner 仍可操作）');
  await page.evaluate(()=>testState.changeUser('other'));
  assert.match(await page.textContent('#cloud-status'),/無權限/);
  assert.equal(await page.locator('#cloud-read').isDisabled(),true);
  assert.equal(await page.locator('#cloud-delete').isDisabled(),true);
  assert.equal(await page.locator('tbody tr').count(),0);
  const before=await page.evaluate(()=>testState.queries.filter(q=>q.field).length);
  await page.evaluate(()=>document.getElementById('cloud-read').onclick());
  assert.equal(await page.evaluate(()=>testState.queries.filter(q=>q.field).length),before);
  console.log('PASS 非 owner 被拒，無 reports 查詢');
  await page.evaluate(()=>testState.changeUser('owner'));
  await page.selectOption('#cloud-session','1');
  await page.evaluate(()=>{testState.delay=true});
  await page.click('#cloud-read');
  await page.waitForFunction(()=>!!testState.release);
  await page.click('#cloud-logout');
  await page.evaluate(()=>{testState.delay=false;testState.release()});
  await page.waitForFunction(()=>!document.getElementById('cloud-login').disabled);
  assert.equal(await page.locator('tbody tr').count(),0);
  assert.equal(await page.locator('#drawer').isHidden(),true);
  assert.match(await page.textContent('#cloud-status'),/已登出/);
  assert.deepEqual(errors,[]);
  console.log('PASS 登出清除資料，未完成查詢不會回填，無 JavaScript 錯誤');
} finally {
  await browser?.close();
}
