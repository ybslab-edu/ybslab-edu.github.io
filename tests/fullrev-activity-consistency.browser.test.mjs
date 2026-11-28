import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import {buildSite,releasePaths} from '../tools/build-fullrev-site.mjs';
import {MANAGED_ACTIVITIES,ROUND_COPY} from '../assets/fullrev-activities.mjs';
import {config} from './fixtures/fullrev.mjs';

// 本機：YBS_WORKER_SOURCE=/path/to/workers/ybs-grader node --test tests/fullrev-activity-consistency.browser.test.mjs
// 使用真正的 release HTML/CSS/renderer；只有登入、紀錄和題目回應使用合成 fixture。
// 不讀 Git ref、不連 Firebase/Worker；Google Fonts 回空 CSS，固定驗證系統備援字型。
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8765';
const exceptions={
 '115-g9/u2-03/index.html':{rounds:5,reason:'二進位燈牌有五個教學步驟，保留五關與等寬單列 B 版按鍵。'},
 '115-g9/u2-06/index.html':{mode:'form-volunteer-sheet-v2',reason:'四關工作單使用獨立副本及操作紀錄；表格可在容器內橫捲，頁面仍不得溢出。'}
};
let browser,output;
const questions=new Map(),allowed=new Set(releasePaths().map(p=>'/'+p));
before(async()=>{
 if(workerCISkip)return;
 assert.ok(workerSource,'本機必要驗收：請設定 YBS_WORKER_SOURCE，不能略過 30 活動檢查');
 const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);
 const {NATIVE,projectQuestion}=await load('src/formal/questions.mjs');
 const {configureSheet}=await load('src/formal/volunteer-sheet-sim.mjs');
 for(const [key,bank] of Object.entries(NATIVE))questions.set(key,projectQuestion(bank.at(0),0,bank.type,'合成題面','請依題面作答。'));
 // 後批覆蓋早批的同關題型：活動 4 改錄音模擬，活動 8 改 v2 工作單。
 for(const name of [...Array.from({length:8},(_,i)=>`pr6-batch${i+1}.mjs`),'u206-sheet-v2.mjs']){
  const {default:banks}=await load('src/formal/banks/'+name);
  for(const [key,bundle] of Object.entries(banks)){
   if(key.startsWith('115-df:'))continue;
   const activity=Number(key.split(':')[0]);
   for(const [round,bank] of Object.entries(bundle.rounds)){
    const c=bank.cases[0];
    // 正式 grader 保留活動 4 第四關的原生容量輸入介面。
    const type=activity===4&&round==='3'?'recording-capacity-v1':bank.type;
    questions.set(`${activity}:${round}`,projectQuestion(configureSheet({data:structuredClone(c.facts),answer:c.answer}),0,type,'合成題面',bank.instruction));
   }
  }
 }
 assert.equal(MANAGED_ACTIVITIES.length,30);
 assert.equal(MANAGED_ACTIVITIES.reduce((n,a)=>n+a.rounds.length,0),121);
 for(const file of Object.keys(exceptions))assert.ok(MANAGED_ACTIVITIES.some(a=>a.file===file),'白名單活動不存在：'+file);
 for(const a of MANAGED_ACTIVITIES){
  assert.equal(a.rounds.length,exceptions[a.file]?.rounds??4,a.file+' 未登記的關卡數差異');
  for(let round=0;round<a.rounds.length;round++){
   const q=questions.get(`${a.activity}:${round}`);assert.ok(q,`${a.file} 第 ${round+1} 關缺題面`);
   if(exceptions[a.file]?.mode)assert.equal(q.data.mode,exceptions[a.file].mode,a.file+' 工作單版本');
   else assert.notEqual(q.data?.mode,'form-volunteer-sheet-v2',a.file+' 未登記的工作單差異');
  }
 }
 const dir=await mkdtemp(join(tmpdir(),'ybs-activity-consistency-'));output=join(dir,'public');
 await buildSite({output,config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'},workerSource});
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();});

async function open(a,round,width){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 const errors=[],external=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.origin==='https://fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
  if(url.origin!==base){external.push(url.origin+path);return route.abort();}
  const js=body=>route.fulfill({contentType:'text/javascript',body});
  if(path==='/assets/fullrev-client.mjs')return js(`
   import {harness,record,snapshot,response} from '/tests/fixtures/fullrev.mjs';
   export async function createBrowserClient(){
    const app=await harness({shared:localStorage,storage:sessionStorage,events:window});
    app.state.owner=false;
    app.state.snapshot=snapshot(Array.from({length:${round}},(_,r)=>record(r,{activity:${a.activity},unit:${a.unit}})));
    app.state.fetcher=async()=>Response.json(response(0,{activity:${a.activity},round:${round},question:${JSON.stringify(questions.get(`${a.activity}:${round}`))}}));
    sessionStorage.setItem('ybs:fullrev:round:synthetic-ybs-pr5:115-g9:${a.activity}:synthetic-student','${round}');
    window.app=app;return app.client;
   }`);
  if(path==='/tests/fixtures/fullrev.mjs')return js((await readFile(new URL('./fixtures/fullrev.mjs',import.meta.url),'utf8')).replace('../../assets/fullrev-client.mjs','/assets/fullrev-client-core.mjs'));
  if(path==='/assets/fullrev-client-core.mjs')return js(await readFile(new URL('../assets/fullrev-client.mjs',import.meta.url),'utf8'));
  if(!allowed.has(path)){external.push('未允許的本機路徑 '+path);return route.abort();}
  return route.fulfill({contentType:extname(path)==='.html'?'text/html; charset=utf-8':extname(path)==='.css'?'text/css':extname(path)==='.svg'?'image/svg+xml':'text/javascript',body:await readFile(join(output,path))});
 });
 const page=await context.newPage();page.setDefaultTimeout(7000);
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push('console.error: '+msg.text());});
 await page.clock.setFixedTime(new Date('2027-07-01T00:00:00+08:00'));
 return {context,page,errors,external};
}

async function metrics(page){
 return page.evaluate(()=>{
  const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible'&&e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true});
  const label=e=>`${e.tagName.toLowerCase()}${e.id?'#'+e.id:''}${typeof e.className==='string'&&e.className?'.'+e.className.trim().replaceAll(' ','.'):''}`;
  const small=[];
  for(const e of document.body.querySelectorAll('*')){
   if(!visible(e))continue;
   const direct=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
   const control=e.matches('input:not([type=hidden]),textarea,select');
   if((direct||control)&&parseFloat(getComputedStyle(e).fontSize)<17)small.push(`${label(e)} ${getComputedStyle(e).fontSize}: ${(e.textContent||e.value||e.placeholder||'').trim().slice(0,70)}`);
   for(const pseudo of ['::before','::after']){
    const s=getComputedStyle(e,pseudo);
    if(s.content&&!['none','normal','""'].includes(s.content)&&parseFloat(s.fontSize)<17)small.push(`${label(e)}${pseudo} ${s.fontSize}: ${s.content}`);
   }
   if(control&&e.placeholder&&!e.value&&parseFloat(getComputedStyle(e,'::placeholder').fontSize)<17)small.push(`${label(e)}::placeholder ${getComputedStyle(e,'::placeholder').fontSize}`);
  }
  const normalize=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'');
  const prose=selector=>[...document.querySelectorAll(selector+' *')].filter(visible).filter(e=>e.matches('p,li,label,summary,h3')||[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>e.textContent);
  // 比完整句子；忽略標點、空白及不足 8 字的共用操作短標，不豁免任何活動的重複段落。
  const instructions=prose('#task-instructions').flatMap(s=>s.split(/[。！？!?；;\n]+/)).map(normalize).filter(s=>s.length>=8);
  const work=prose('#stage').map(normalize);
  const duplicates=instructions.filter(s=>work.some(w=>w.includes(s)));
  const keys=[...document.querySelectorAll('#rounds button')].map(e=>{
   const r=e.getBoundingClientRect(),s=getComputedStyle(e),front=getComputedStyle(e,'::before'),depth=e.querySelector('.round-depth');
   const range=document.createRange();range.selectNode(e.firstChild);const text=range.getBoundingClientRect();
   return {text:e.firstChild.textContent,pressed:e.getAttribute('aria-pressed'),label:e.getAttribute('aria-label'),title:e.title,width:r.width,top:r.top,
    bStyle:!!depth&&depth.getAttribute('aria-hidden')==='true'&&front.content==='""'&&front.backgroundImage.includes('linear-gradient')&&getComputedStyle(depth).filter.includes('drop-shadow')&&s.borderRadius==='0px'&&s.fontStyle==='normal',
    fits:text.left>=r.left+parseFloat(s.borderLeftWidth)-.5&&text.right<=r.right-parseFloat(s.borderRightWidth)+.5};
  });
  const overflow=document.documentElement.scrollWidth>innerWidth;
  const protruding=overflow?[...document.body.querySelectorAll('*')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left< -1;}).slice(0,8).map(label):[];
  return {small,duplicates,keys,overflow,protruding};
 });
}

for(const width of [360,1280])test(`${width}px：30 活動 121 關一致性`,{timeout:420000,skip:workerCISkip},async t=>{
 for(const [file,entry] of Object.entries(exceptions))t.diagnostic(`白名單 ${file}：${entry.reason}`);
 let checked=0;
 for(const a of MANAGED_ACTIVITIES)for(let round=0;round<a.rounds.length;round++)await t.test(`${a.file} 第 ${round+1} 關（${a.rounds[round]}） ${width}px`,async()=>{
  const {context,page,errors,external}=await open(a,round,width);
  try{
   await page.goto(base+'/'+a.file);
   await page.getByRole('button',{name:'登入',exact:true}).waitFor();
   assert.equal(await page.locator('#activity-header').isVisible(),true,'未登入新版頁首');
   const gate=await metrics(page);assert.deepEqual(gate.small,[],'未登入可見文字低於 17px');assert.equal(gate.overflow,false,'未登入水平溢出');
   await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');
   await page.getByRole('button',{name:'登入',exact:true}).click();await page.locator('#g-isme').click();
   await page.locator(`[data-question-type][data-round="${round}"]`).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('#activity-header').isVisible(),true,'作答新版頁首');
   assert.equal(await page.locator('#activity-title').textContent(),a.title);
   assert.match(await page.locator('#activity-week').textContent(),/^第 \d+ 週$/);
   assert.ok((await page.locator('#activity-subtitle').textContent()).startsWith(`第 ${round+1} 關`),'頁首同步關卡');
   assert.deepEqual(await page.locator('#says .tk > span').allTextContents(),ROUND_COPY[a.activity][round],'任務說明採核准短句');
   const m=await metrics(page),issues=[];
   if(m.small.length)issues.push('可見文字低於 17px：'+m.small.join('；'));
   if(m.duplicates.length)issues.push('任務說明／動手做重複：'+m.duplicates.join('；'));
   if(m.overflow)issues.push('水平溢出：'+m.protruding.join('；'));
   if(m.keys.length!==a.rounds.length)issues.push('關卡按鈕數不符');
   m.keys.forEach((k,i)=>{
    if(!k.bStyle||!k.fits||k.text!==`第 ${i+1} 關`||!k.label?.startsWith(`第 ${i+1} 關：${a.rounds[i]}`)||!k.title)issues.push(`第 ${i+1} 關按鈕不符 B 版／完整短標：${JSON.stringify(k)}`);
    if(Math.abs(k.width-m.keys[0].width)>1||Math.abs(k.top-m.keys[0].top)>1)issues.push(`第 ${i+1} 關按鈕未等寬單列`);
    if(k.pressed!==String(i===round))issues.push(`第 ${i+1} 關選取狀態錯誤`);
   });
   if(errors.length)issues.push(...errors);if(external.length)issues.push('非本機／未允許請求：'+external.join('；'));
   if(process.env.YBS_CONSISTENCY_CAPTURE_DIR&&[4,5,8].includes(a.activity)){
    await mkdir(process.env.YBS_CONSISTENCY_CAPTURE_DIR,{recursive:true});
    await page.screenshot({path:join(process.env.YBS_CONSISTENCY_CAPTURE_DIR,`${a.file.split('/')[1]}-round-${round+1}-${width}.png`),fullPage:true});
   }
   assert.deepEqual(issues,[],'不符合項目');checked++;
  }catch(error){
   const body=await page.locator('body').innerText({timeout:1000}).catch(()=>'(無法讀取頁面)');
   throw new Error(`${a.file} 第 ${round+1} 關 ${width}px：${error.message}\n瀏覽器錯誤：${JSON.stringify(errors)}；外部請求：${JSON.stringify(external)}；頁面：${body.slice(0,600)}`,{cause:error});
  }finally{await context.close();}
 });
 t.diagnostic(`實際完成 ${checked}/121 關、${width}px；不符合活動與關卡列於失敗子測試。`);
});
