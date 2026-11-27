// 全程本機 mock；外部請求一律阻擋。以本工作樹志工舊頁與 build 產生 24 張對照截圖。
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSite} from '../../tools/build-fullrev-site.mjs';
import {config} from '../../tests/fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base,dir,output,current,modules;
const workerSource=process.env.YBS_WORKER_SOURCE;
async function setup(){
  if(!workerSource)throw Error('YBS_WORKER_SOURCE is required; only local mock is allowed');
  const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);
  const [{createFormalWorker},{MemoryFirestore},{readPath:formalPath},{batchData,privateAnswer},{ENV,CLASS_HINTS,password,paths},{EPOCH,ORIGIN}]=await Promise.all([
    load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal/read-model.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
  modules={createFormalWorker,MemoryFirestore,formalPath,batchData,privateAnswer,ENV,CLASS_HINTS,password,paths,EPOCH,ORIGIN};
  dir=await mkdtemp(join(tmpdir(),'ybs-pr6-browser-'));output=join(dir,'public');await buildSite({output,config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'},workerSource});
  server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(path.startsWith('/worker/')) {
        let raw='';for await(const chunk of req)raw+=chunk;
        current.clock+=60001;current.requests.push({op:path.slice(8),body:JSON.parse(raw)});
        if(current.throttle&&path==='/worker/context'){current.throttle=false;res.writeHead(429,{'Content-Type':'application/json','retry-after':'1'}).end('{"error":"rate_limited"}');return;}
        const r=await current.worker.fetch(new Request('https://synthetic.invalid/'+path.slice(8),{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer fake-uid-a','content-type':'application/json'},body:raw}));
        if(current.dropSecond&&path==='/worker/answer'&&JSON.parse(raw).slot===1){current.dropSecond=false;res.writeHead(503,{'Content-Type':'application/json','retry-after':'60'}).end('{"error":"synthetic_lost_response"}');return;}
        res.writeHead(r.status,{'Content-Type':'application/json'}).end(await r.text());return;
      }
      if(path==='/assets/fullrev-client.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(`
        import {harness,config} from '/tests/fixtures/fullrev.mjs';
        import {createClient} from '/assets/fullrev-client-core.mjs';
        import {createReadModel} from '/assets/fullrev-read-model.mjs';
        export async function createBrowserClient(){
          const restoredProvider=sessionStorage.getItem('ybs:fullrev:synthetic-ybs-pr5:115-g9')?'password':undefined;
          const app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider,
            requestId:()=>crypto.randomUUID(),fetcher:(url,init)=>fetch('/worker'+new URL(url).pathname,init)});
          app.state.uid='fake-uid-a';app.state.owner=false;app.state.hints={'115-g9':'synthetic-class'};
          if(restoredProvider)app.auth.currentUser.uid='fake-uid-a';
          const withEmail=user=>{
            const claims=user.getIdTokenResult;
            user.getIdTokenResult=async()=>{const result=await claims();result.claims.email='cgjh9990001@ybslab-edu.github.io';return result;};
          };
          if(restoredProvider)withEmail(app.auth.currentUser);
          const signIn=app.auth.signInWithEmailAndPassword;
          app.auth.signInWithEmailAndPassword=async(...args)=>{const credential=await signIn(...args);withEmail(credential.user);return credential;};
          const doc=app.session.db.doc;
          app.session.db.doc=path=>path==='ybsCourses/115-g9/roster/cgjh9990001@cgjh.hcc.edu.tw'?{get:async()=>({exists:true,metadata:{fromCache:false},data:()=>({schemaVersion:1,subject:'synthetic-a',cls:917,seat:5,active:true})})}:doc(path);
          let clock=${modules.EPOCH};const advance=app.advance;app.advance=(ms=60001)=>{advance(ms);clock+=ms;};
          const session=async()=>app.session,fetcher=(url,init)=>fetch('/worker'+new URL(url).pathname,init);
          const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher});
          app.client=createClient({config,session,now:()=>clock,readModel:model,shared:localStorage,storage:sessionStorage,events:window,requestId:()=>crypto.randomUUID(),fetcher});
          window.app=app;return app.client;
        }`);
      if(path==='/assets/fullrev-client-core.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('../../assets/fullrev-client.mjs',import.meta.url)));
      if(path==='/tests/fixtures/fullrev.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end((await readFile(new URL('../../tests/fixtures/fullrev.mjs',import.meta.url),'utf8')).replace('../../assets/fullrev-client.mjs','/assets/fullrev-client-core.mjs'));
      const file=resolve(output,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(output+'/'))return res.writeHead(403).end();
      const content=await readFile(file);res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html; charset=utf-8':extname(file)==='.css'?'text/css':'text/javascript'}).end(content);
    }catch(e){res.writeHead(500).end('synthetic-server-failure');}
  });await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
}
async function reset() {
  const m=modules,state={clock:m.EPOCH,requests:[]};
  state.db=new m.MemoryFirestore(await m.batchData(state.clock),{now:()=>state.clock,pathValidator:m.formalPath});
  state.worker=m.createFormalWorker({env:{...m.ENV,FIREBASE_PROJECT_ID:config.firebase.projectId,YBS_PROJECT_ID:config.firebase.projectId},adapter:state.db,now:()=>state.clock,verifier:{verify:async uid=>({...m.password(uid),ybsClassKeys:m.CLASS_HINTS})}});current=state;
}
async function fill(page,type,answer) {
  if(type.startsWith('binary-encode')) {
    for(let i=0;i<answer.length;i++)if(await page.locator(`[data-bit="${i}"]`).getAttribute('aria-pressed')!==String(!!answer[i]))await page.locator(`[data-bit="${i}"]`).click();
  }else if(type==='finite-bank-v1') {
    const mode=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.questions[current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.slot].data.mode;
    if(mode==='photo'){
      const session=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession,d=session.questions[0].data;
      for(const [name,list,value] of [['格子數',d.resolutions,answer.n],['顏色數',d.depths,answer.d]])await page.getByRole('slider',{name,exact:true}).evaluate((el,index)=>{el.value=index;el.dispatchEvent(new Event('input'));},list.indexOf(value));
      for(let i=0;i<2;i++)for(let j=0;j<answer.answers[i].length;j++){const b=page.locator(`[data-photo-index="${i}"][data-photo-field="${j}"][data-choice="${answer.answers[i][j]}"]`);if(await b.getAttribute('aria-pressed')!=='true')await b.click();}
    }
    else if(mode.endsWith('-performance')){
      for(const b of await page.locator('[data-slot-index]').all())if(!await b.innerText().then(t=>t.includes('待放入')))await b.click();
      for(const index of answer)await page.locator(`[data-pool-index="${index}"]`).click();
    }
    else if(['form-','sheet-','media-'].some(prefix=>mode.startsWith(prefix))){for(let k=0;k<answer.length;k++){const field=page.locator(`[data-answer-field="${k}"]`);if(await field.evaluate(e=>e.tagName)==='SELECT')await field.selectOption(String(answer[k]));else await field.fill(String(answer[k]));}}
    else if(['means-1d','kmeans-1d','centroid-2d'].includes(mode)) {for(let k=0;k<answer.length;k++)await page.locator(`[data-answer-field="${k}"]`).fill(String(answer[k]));}
    else if(['tree-build','regression','confusion-matrix'].includes(mode)) {for(const [key,value] of Object.entries(answer)){const field=page.locator(`[data-answer-field="${key}"]`);if(await field.evaluate(e=>e.tagName)==='SELECT')await field.selectOption(String(value));else await field.fill(String(value));}}
    else if(['tree-accuracy','moore'].includes(mode))await page.locator('[data-answer-field="value"]').fill(String(answer));
    else if(mode==='cpu-schedule'){
      const session=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession,d=session.questions[session.slot].data;
      for(const k of answer)await page.locator('[data-pool-index]').filter({hasText:d.tasks[k][0]}).first().click();
    }
    else if(mode==='components'){for(let k=0;k<answer.length;k++)for(let j=0;j<2;j++)await page.locator(`[data-row="${k*2+j}"][data-choice="${answer[k][j]}"]`).click();}
    else if(mode==='scene-choice')await page.locator(`[data-scene-choice="${answer}"]`).click();
    else if(mode.startsWith('ascii-'))await page.locator('[data-answer-field="text"]').fill(Array.isArray(answer)?answer.join(' '):answer);
    else if(mode==='route'){while(Number(await page.locator('[data-route-length]').getAttribute('data-route-length'))>1)await page.getByRole('button',{name:'退一步',exact:true}).click();for(const name of answer.slice(1))await page.locator(`[data-route-node="${name}"]`).click();}
    else if(mode==='multi'||mode==='wifi-dead'){const selector=mode==='multi'?'[data-multi-index]':'[data-cell]';for(const b of await page.locator(selector).all()){const index=Number(await b.getAttribute(mode==='multi'?'data-multi-index':'data-cell'));if(await b.getAttribute('aria-pressed')!==String(answer.includes(index)))await b.click();}}
    else if(mode==='wifi-router'){const session=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession;const d=session.questions[session.slot].data;await page.locator(`[data-cell="${d.cells[answer]}"]`).first().click();}
    else if(['order','chip-journey'].includes(mode))for(const index of answer)await page.locator(`[data-pool-index="${index}"]`).click();
    else {const choices=Array.isArray(answer)?answer:[answer];for(let i=0;i<choices.length;i++) {
      const b=page.locator(`[data-row="${i}"][data-choice="${choices[i]}"]`);if(await b.getAttribute('aria-pressed')!=='true')await b.click();
    }}
  }else for(const [key,value] of Object.entries(typeof answer==='number'?{value:answer}:answer)) {
    const input=page.locator(`[data-answer-field="${key}"]`);if(await input.evaluate(e=>e.tagName)==='SELECT')await input.selectOption(String(value));else await input.fill(String(value));
  }
}
const out=process.env.YBS_LOOK_OUTPUT||join(tmpdir(),'ybs-look4');
let oldServer,oldBase,closed=false;
async function oldSetup(){
 const old=resolve(new URL('../..',import.meta.url).pathname);
 assert.match(await readFile(join(old,'115-g9/u2-05/index.html'),'utf8'),/動漫／遊戲展志工招募/);
 oldServer=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(old,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(old+'/'))return res.writeHead(403).end();
  let content=await readFile(file);
  if(path==='/assets/fullrev-config.js')content='const YBS_FULLREV_CONFIG={enabled:false};';
  if(path==='/assets/lock.js')content=content.toString().replace("if (!courseClosed && (list.includes(sub) || (a && isActivityOpen(a)))) return;",closed?'if(false)return;':'return;');
  if(path==='/assets/shell.js')content=content.toString().replace('return { get inst()', 'return window.oldShell={ get inst()');
  res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html; charset=utf-8':extname(file)==='.css'?'text/css':'text/javascript'}).end(content);
 }catch{res.writeHead(404).end();}});
 await new Promise((resolve,reject)=>{oldServer.once('error',reject);oldServer.listen(0,'127.0.0.1',resolve);});oldBase='http://127.0.0.1:'+oldServer.address().port;
}
async function capture(page,state,width,kind){
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,`${state}-${width}-${kind}.png`),fullPage:true});
}
// 共用 mock 尚無 where 與伺服器 metadata；只在本截圖補齊，讓舊 XP 完成載入。
function oldXPQueryMock(){
  const initialize=window.firebase.initializeApp;
  window.firebase.initializeApp=(...args)=>{
   const app=initialize(...args),db=app.firestore(),collection=db.collection;
   db.collection=path=>{const query=collection(path);return {...query,where(field,op,value){
    if(op!=='==')throw Error('synthetic query only supports equality');
    return {get:async()=>{const result=await query.get();return {...result,metadata:{fromCache:false},docs:result.docs.filter(doc=>doc.data()[field]===value)};}};
   }};};return app;
  };
}
async function oldRun(width,height){
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
 const mock=(await readFile(new URL('../../tools/dev/firebase-mock.js',import.meta.url),'utf8'))
  .replace(/if \(e === '[^']+' && p === '[^']+'\)/,"if(e==='cgjh9990001@ybslab-edu.github.io'&&p==='synthetic-password')")
  .replace(/path\.endsWith\('[^']*\/roster\/[^']+'\)/,"path.includes('/roster/')");
 // 單一 init script 保證先建立 mock，再補查詢功能。
 await context.addInitScript(mock+'\n;('+oldXPQueryMock.toString()+')();');
 await page.route('**/*',r=>{
  const u=r.request().url();if(u.startsWith(oldBase+'/'))return r.continue();
  if(u.startsWith('https://www.gstatic.com/firebasejs/'))return r.fulfill({body:'// mock already injected',contentType:'text/javascript'});
  return r.abort();
 });
 try{
  closed=true;await page.goto(oldBase+'/115-g9/u2-05/');await page.locator('#ybs-lock').waitFor();await capture(page,'closed',width,'old');
  closed=false;await page.reload();await page.locator('#g-gbtn input[name=a]').waitFor();await capture(page,'signed-out',width,'old');
  await page.locator('input[name=a]').fill('9990001');await page.locator('input[name=p]').fill('synthetic-password');await page.locator('#g-gbtn button[type=submit]').click();await page.locator('#g-isme').click();await page.locator('#main').waitFor();await page.locator('#warmup').waitFor();
  await page.waitForFunction(()=>document.querySelector('#xp-total')?.textContent.endsWith(' XP'));
  await capture(page,'working',width,'old');
  await page.evaluate(()=>{oldShell.handle.fill();const f=document.querySelector('#stage input');f.value=String(Number(f.value)+1);f.dispatchEvent(new Event('input'));});
  await page.locator('#b-send').click();await page.locator('#verdict.no').waitFor();await capture(page,'wrong',width,'old');
  await page.evaluate(()=>{oldShell.handle.fill();document.querySelector('#stage input').dispatchEvent(new Event('input'));});await page.locator('#b-send').click();await page.locator('#b-next-group').waitFor();await capture(page,'first-correct',width,'old');
  for(let r=0;r<4;r++){
   if(r)await page.evaluate(r=>oldShell.load(r),r);
   for(let slot=r?0:1;slot<2;slot++){
    if(slot)await page.locator('#b-next-group').click();
    await page.evaluate(()=>{oldShell.handle.fill();document.querySelector('#stage input, #stage select').dispatchEvent(new Event('input'));});await page.locator('#b-send').click();
   }
   await page.locator('#verdict.ok').waitFor();
  }
  await capture(page,'passed',width,'old');
 }finally{await context.close();}
}
async function newRun(width,height){
 await reset();const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
 const login=async()=>{await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'登入',exact:true}).click();};
 // 登入只讀取身分／進度；選關並確認後才檢查開放狀態、建立作答 session。
 const confirm=async()=>{
  await page.locator('#g-isme').waitFor();
  assert.equal(await page.locator('#g-whotext').innerText(),'你是 917 班 5 號，對嗎？');
  await page.getByLabel('開始關卡',{exact:true}).selectOption('0');
  assert.equal(current.requests.some(r=>r.op==='context'||r.op==='start'),false,'確認身分前不應開始活動');
  await page.locator('#g-isme').click();
 };
 try{
  current.db.docs.get(modules.paths.global).activities[7].opensAt=current.clock+86400000;
  await page.goto(base+'/115-g9/u2-05/');await login();await confirm();await page.locator('#activity-lock').waitFor();
  assert.equal(await page.locator('#gate').isVisible(),false);assert.equal(await page.locator('#main').isVisible(),false);
  assert.equal(current.requests.some(r=>r.op==='context'),true,'須實際檢查活動開放狀態');
  assert.equal(current.requests.some(r=>r.op==='start'),false,'未開放不得建立作答 session');
  await capture(page,'closed',width,'new');
  await context.clearCookies();await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await reset();current.throttle=true;
  await page.reload();await page.getByRole('button',{name:'登入',exact:true}).waitFor();await capture(page,'signed-out',width,'new');await login();await confirm();
  await page.locator('#stage[data-round="0"] [data-answer-field]').first().waitFor();await page.waitForFunction(()=>app.client.state().snapshot);
  await page.locator('#warmup').waitFor();
  assert.equal(await page.locator('#who').innerText(),'917 班 5 號');
  assert.equal(await page.locator('#warmup').isVisible(),true,'新舊 working 均保留預設暖身卡');
  assert.equal(current.throttle,false,'須經過 context 429 自動重試');await capture(page,'working',width,'new');
  const session=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession;
  assert.equal(session.questions[session.slot].data.mode,'form-volunteer-summary');
  const type=session.type,answer=modules.privateAnswer(current.db),wrong=structuredClone(answer);
  // 錯答仍須是可選的志工版選項，避免 selectOption 等待不存在的文字。
  wrong[0]=session.questions[session.slot].data.questions[0].slice(1).find(value=>value!==answer[0]);
  assert.notEqual(wrong[0],undefined);
  await fill(page,type,wrong);await page.locator('#b-send').click();await page.locator('#verdict.no').waitFor();await capture(page,'wrong',width,'new');
  await fill(page,type,answer);await page.locator('#b-send').click();await page.locator('#b-next-group').waitFor();await capture(page,'first-correct',width,'new');
  for(let r=0;r<4;r++){
   if(r){await page.locator('#rounds button').nth(r).click();await page.locator('#stage[data-round="'+r+'"] [data-answer-field]').first().waitFor();}
   for(let slot=r?0:1;slot<2;slot++){
    if(slot)await page.locator('#b-next-group').click();await fill(page,type,modules.privateAnswer(current.db));await page.locator('#b-send').click();
   }
   await page.locator('#verdict.ok').waitFor();
  }
  assert.equal(await page.locator('#xp-total').innerText(),'80 XP');await capture(page,'passed',width,'new');
  console.log(`${width}: mock 4/4 rounds, 429 -> 200, 80 XP; screenshots 12/12`);
 }finally{await context.close();}
}
try{
 await mkdir(out,{recursive:true});await setup();await oldSetup();
 for(const [width,height] of [[390,844],[1440,900]]){await oldRun(width,height);await newRun(width,height);}
 console.log(`A: 24 screenshots saved to ${out}`);
}finally{
 await browser?.close();for(const s of [server,oldServer])if(s?.listening)await new Promise(resolve=>s.close(resolve));if(dir)await rm(dir,{recursive:true,force:true});
}
