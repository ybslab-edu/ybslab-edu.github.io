import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {MANAGED_ACTIVITIES} from '../assets/fullrev-activities.mjs';
import {config} from './fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base,dir,output,current,modules;
const workerSource=process.env.YBS_WORKER_SOURCE;
before(async()=>{
  if(!workerSource)return;
  const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);
  const [{createFormalWorker},{MemoryFirestore},{formalPath},{batchData,privateAnswer},{ENV,CLASS_HINTS,password,paths},{EPOCH,ORIGIN}]=await Promise.all([
    load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal-contract.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
  modules={createFormalWorker,MemoryFirestore,formalPath,batchData,privateAnswer,ENV,CLASS_HINTS,password,paths,EPOCH,ORIGIN};
  dir=await mkdtemp(join(tmpdir(),'ybs-pr6-browser-'));output=join(dir,'public');await buildBatches({output,config});
  server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(path.startsWith('/worker/')) {
        let raw='';for await(const chunk of req)raw+=chunk;
        current.clock+=60001;current.requests.push({op:path.slice(8),body:JSON.parse(raw)});
        const r=await current.worker.fetch(new Request('https://synthetic.invalid/'+path.slice(8),{method:'POST',headers:{origin:ORIGIN,authorization:'Bearer fake-uid-a','content-type':'application/json'},body:raw}));
        res.writeHead(r.status,{'Content-Type':'application/json'}).end(await r.text());return;
      }
      if(path==='/synthetic/progress') {
        const records=[...current.db.docs].filter(([p])=>p.includes('/validatedResults/')).map(([p,r])=>({...r,resultId:p.split('/').at(-1),
          completedAt:new Date(r.completedAt).toISOString(),xpPolicySnapshot:{...r.xpPolicySnapshot,openedAt:r.xpPolicySnapshot.openedAt.toISOString()},validity:{state:'effective',controlVersions:{gateVersion:1,classGateVersion:1}}}));
        return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({schemaVersion:1,sourceProject:config.firebase.projectId,course:'115-g9',classKey:'synthetic-class',
          subject:'synthetic-a',provider:'password',state:'confirmed',complete:true,controlVersions:{gateVersion:1,classGateVersion:1},records}));
      }
      if(path==='/assets/fullrev-client.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(`
        import {harness} from '/tests/fixtures/fullrev.mjs';
        export async function createBrowserClient(){
          const restoredProvider=sessionStorage.getItem('ybs:fullrev:synthetic-ybs-pr5:115-g9')?'password':undefined;
          const app=await harness({shared:localStorage,storage:sessionStorage,events:window,restoredProvider,
            requestId:()=>crypto.randomUUID(),fetcher:(url,init)=>fetch('/worker'+new URL(url).pathname,init)});
          app.state.uid='fake-uid-a';app.state.owner=false;app.state.hints={'115-g9':'synthetic-class'};
          if(restoredProvider)app.auth.currentUser.uid='fake-uid-a';
          app.model.page=async()=>{const r=await fetch('/synthetic/progress');return r.json();};
          window.app=app;return app.client;
        }`);
      if(path==='/assets/fullrev-client-core.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(new URL('../assets/fullrev-client.mjs',import.meta.url)));
      if(path==='/tests/fixtures/fullrev.mjs')return res.writeHead(200,{'Content-Type':'text/javascript'}).end((await readFile(new URL('./fixtures/fullrev.mjs',import.meta.url),'utf8')).replace('../../assets/fullrev-client.mjs','/assets/fullrev-client-core.mjs'));
      const file=resolve(output,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(output+'/'))return res.writeHead(403).end();
      const content=await readFile(file);res.writeHead(200,{'Content-Type':extname(file)==='.html'?'text/html; charset=utf-8':extname(file)==='.css'?'text/css':'text/javascript'}).end(content);
    }catch(e){res.writeHead(500).end('synthetic-server-failure');}
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));if(dir)await rm(dir,{recursive:true,force:true});});
async function reset() {
  const m=modules,state={clock:m.EPOCH,requests:[]};
  state.db=new m.MemoryFirestore(await m.batchData(state.clock),{now:()=>state.clock,pathValidator:m.formalPath});
  state.worker=m.createFormalWorker({env:m.ENV,adapter:state.db,now:()=>state.clock,verifier:{verify:async uid=>({...m.password(uid),ybsClassKeys:m.CLASS_HINTS})}});current=state;
}
async function fill(page,type,answer) {
  if(type.startsWith('binary-encode')) {
    for(let i=0;i<answer.length;i++)if(await page.locator(`[data-bit="${i}"]`).getAttribute('aria-pressed')!==String(!!answer[i]))await page.locator(`[data-bit="${i}"]`).click();
  }else if(type==='finite-bank-v1') {
    const mode=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.questions[current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.slot].data.mode;
    if(mode.startsWith('ascii-'))await page.locator('[data-answer-field="text"]').fill(Array.isArray(answer)?answer.join(' '):answer);
    else if(mode==='route'){while(Number(await page.locator('[data-route-length]').getAttribute('data-route-length'))>1)await page.getByRole('button',{name:'退一步',exact:true}).click();for(const name of answer.slice(1))await page.locator(`[data-route-node="${name}"]`).click();}
    else if(mode==='multi'||mode==='wifi-dead'){const selector=mode==='multi'?'[data-multi-index]':'[data-cell]';for(const b of await page.locator(selector).all()){const index=Number(await b.getAttribute(mode==='multi'?'data-multi-index':'data-cell'));if(await b.getAttribute('aria-pressed')!==String(answer.includes(index)))await b.click();}}
    else if(mode==='wifi-router'){const session=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession;const d=session.questions[session.slot].data;await page.locator(`[data-cell="${d.cells[answer]}"]`).first().click();}
    else if(mode==='order')for(const index of answer)await page.locator(`[data-pool-index="${index}"]`).click();
    else {const choices=Array.isArray(answer)?answer:[answer];for(let i=0;i<choices.length;i++) {
      const b=page.locator(`[data-row="${i}"][data-choice="${choices[i]}"]`);if(await b.getAttribute('aria-pressed')!=='true')await b.click();
    }}
  }else for(const [key,value] of Object.entries(typeof answer==='number'?{value:answer}:answer)) {
    const input=page.locator(`[data-answer-field="${key}"]`);if(await input.evaluate(e=>e.tagName)==='SELECT')await input.selectOption(String(value));else await input.fill(String(value));
  }
}
test('PR6 真實切換頁 × PR5 client × Worker：50 關均可錯答修正、重新整理 resume、下一組與可信過關', {timeout:300000},async t=>{
  if(!workerSource){t.skip('跨 repo 驗收須指定本機 YBS_WORKER_SOURCE；不下載依賴');return;}
  for(const a of MANAGED_ACTIVITIES)for(const round of a.managed) {
    if(process.env.YBS_PR6_SCOPE&&process.env.YBS_PR6_SCOPE!==`${a.activity}:${round}`)continue;
    await t.test(`${a.activity}:${round}`,async()=>{
    await reset();const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    try {
      await page.goto(base+'/'+a.file);await page.getByRole('button',{name:'帳號登入',exact:true}).waitFor();
      assert.equal(current.requests.length,0);assert.equal(await page.locator('#ybs-lock,#t-open').count(),0);
      await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');
      await page.getByRole('button',{name:'帳號登入',exact:true}).click();await page.getByRole('button',{name:a.rounds[round],exact:true}).click();
      await page.locator('[data-question-type]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'手機版不得橫向溢出');
      let q=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession;
      const type=q.type,answer=modules.privateAnswer(current.db);
      let wrong=structuredClone(answer);
      if(Array.isArray(wrong))wrong[0]=type.startsWith('binary')?1-wrong[0]:(wrong[0]+1)%(q.questions[0].data.options?.length||4);
      else if(typeof wrong==='number')wrong++;
      else if(typeof wrong==='string')wrong+='X';
      else wrong[Object.keys(wrong)[0]]++;
      // 排序錯答先交換兩張卡；單選保持在合法選項內。
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='order'){wrong=[...answer];[wrong[0],wrong[1]]=[wrong[1],wrong[0]];}
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='select')wrong=(answer+1)%q.questions[0].data.options.length;
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='route')wrong=[q.questions[0].data.from,q.questions[0].data.nodes.find(n=>n[0]!==q.questions[0].data.from&&n[0]!==q.questions[0].data.to)[0]];
      if(type==='finite-bank-v1'&&['multi','wifi-dead'].includes(q.questions[0].data.mode))wrong=[];
      if(type==='recording-capacity-v1')wrong.q=(answer.q+1)%3;
      await fill(page,type,wrong);await page.getByRole('button',{name:'送出',exact:true}).click();
      await page.getByText('再修改同一題，不扣分。',{exact:true}).waitFor();
      assert.equal(current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.slot,0);
      await page.reload();await page.getByRole('button',{name:a.rounds[round],exact:true}).click();await page.locator('[data-question-type]').waitFor();
      assert.ok(current.requests.some(r=>r.op==='resume'));
      await fill(page,type,answer);await page.getByRole('button',{name:'送出',exact:true}).click();
      await page.getByRole('button',{name:'下一組',exact:true}).waitFor({state:'visible'});
      assert.equal(await page.locator('[data-question-type]').getAttribute('data-slot'),'0');
      await page.getByRole('button',{name:'下一組',exact:true}).click();
      await fill(page,type,modules.privateAnswer(current.db));await page.getByRole('button',{name:'送出',exact:true}).click();
      await page.waitForFunction(()=>app.client.state().snapshot?.records.length===1);
      await page.getByText(/· 15 XP$/).first().waitFor();
      assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,1);
      assert.deepEqual(errors,[]);
    }catch(error){t.diagnostic(JSON.stringify({errors,requests:current.requests,body:await page.locator('body').innerText()}));throw error;}
    finally{await context.close();}
    });
  }
});
