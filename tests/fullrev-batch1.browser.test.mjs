import {workerSource,workerSkip} from './helpers/worker-source.mjs';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {MANAGED_ACTIVITIES} from '../assets/fullrev-activities.mjs';
import {config} from './fixtures/fullrev.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
let browser,server,base,dir,output,current,modules;
// 全關卡驗收固定在最後一堂課之後；只改瀏覽器 Date，保留真實計時器與正式週次鎖。
const allActivitiesOpenAt=new Date('2027-07-01T00:00:00+08:00');
before(async()=>{
  if(!workerSource)return;
  const load=p=>import(pathToFileURL(resolve(workerSource,p)).href);
  const [{createFormalWorker},{MemoryFirestore},{readPath:formalPath},{batchData,privateAnswer},{ENV,CLASS_HINTS,password,paths},{EPOCH,ORIGIN}]=await Promise.all([
    load('src/formal/index.mjs'),load('src/memory-adapter.mjs'),load('src/formal/read-model.mjs'),load('tests/pr6-fixtures.mjs'),load('tests/formal-fixtures.mjs'),load('tests/fixtures.mjs')]);
  const {volunteerCheck}=await load('src/formal/volunteer-questions.mjs');
  modules={createFormalWorker,MemoryFirestore,formalPath,batchData,privateAnswer,ENV,CLASS_HINTS,password,paths,EPOCH,ORIGIN,volunteerCheck};
  dir=await mkdtemp(join(tmpdir(),'ybs-pr6-browser-'));output=join(dir,'public');await buildSite({output,config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'},workerSource});
  server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(path.startsWith('/worker/')) {
        let raw='';for await(const chunk of req)raw+=chunk;
        current.clock+=60001;current.requests.push({op:path.slice(8),body:JSON.parse(raw)});
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
          let clock=Date.now();const advance=app.advance;app.advance=(ms=60001)=>{advance(ms);clock+=ms;};
          const session=async()=>app.session,fetcher=(url,init)=>fetch('/worker'+new URL(url).pathname,init);
          const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher});
          app.client=createClient({config,session,now:()=>clock,readModel:model,shared:localStorage,storage:sessionStorage,events:window,requestId:()=>crypto.randomUUID(),fetcher});
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
async function reset(activity,round=0) {
  const m=modules,state={clock:m.EPOCH,requests:[]};
  state.db=new m.MemoryFirestore(await m.batchData(state.clock),{now:()=>state.clock,pathValidator:m.formalPath});
  if(activity===4){state.db.docs.get(m.paths.global).activities[4].rounds=[0,1,2,3];for(const member of Object.values(state.db.docs.get(m.paths.roster).members))for(let i=0;i<3;i++)member.roundEpochs[`4:${i}`]=0;}
  // 單關 renderer 驗收先備妥前關的合成舊過關紀錄；仍由真實投影驗證，不繞過關卡鎖。
  if(round){const {legacyRow}=await import(pathToFileURL(resolve(workerSource,'tests/legacy-progress-fixtures.mjs')).href),{legacyOpenAt}=await import(pathToFileURL(resolve(workerSource,'src/formal/legacy-progress.mjs')).href);for(let i=0;i<round;i++){
    const row=legacyRow(activity,i,{subject:'synthetic-a',at:legacyOpenAt(activity)+864e5});state.db.seed(row.path,row.data);
  }}
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
test('PR6 真實切換頁 × PR5 client × Worker：118 關均可錯答修正、重新整理 resume、下一組與可信過關', {timeout:420000},async t=>{
  if(workerSkip){t.skip(workerSkip);return;}
  for(const a of MANAGED_ACTIVITIES)for(const round of a.managed) {
    if(process.env.YBS_PR6_SCOPE&&!process.env.YBS_PR6_SCOPE.split(',').includes(`${a.activity}:${round}`))continue;
    await t.test(`${a.activity}:${round}`,async()=>{
    await reset(a.activity,round);const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    await page.clock.setFixedTime(allActivitiesOpenAt);
    page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    try {
      await page.goto(base+'/'+a.file);await page.getByRole('button',{name:'登入',exact:true}).waitFor();
      assert.equal(current.requests.length,0);assert.equal(await page.locator('#ybs-lock,#t-open').count(),0);
      await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');
      await page.evaluate(({activity,round})=>sessionStorage.setItem(`ybs:fullrev:round:synthetic-ybs-pr5:115-g9:${activity}:fake-uid-a`,String(round)),{activity:a.activity,round});
      await page.getByRole('button',{name:'登入',exact:true}).click();await page.locator('#g-isme').waitFor();assert.equal(await page.getByLabel('開始關卡',{exact:true}).count(),0);
      await page.setViewportSize({width:1280,height:800});
      const title=await page.locator('#gate h1').textContent();
      const sizes=await page.evaluate(()=>['g-whotext','g-notme'].map(id=>getComputedStyle(document.getElementById(id)).fontSize));
      assert.equal(sizes[0],sizes[1],'桌機確認身分文字須與不是我按鈕同大小');assert.ok(parseFloat(sizes[0])>=20);
      await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#gate h1').textContent(),title);
      await page.locator('#g-isme').click();
      await page.locator('[data-question-type]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'手機版不得橫向溢出');
      let q=current.db.docs.get(modules.paths.head('synthetic-a')).activeSession;
      const type=q.type,answer=modules.privateAnswer(current.db);
      const outcome=['form-','sheet-','media-'].some(prefix=>q.questions[0].data.mode?.startsWith(prefix));
      if(outcome&&a.activity!==7){
        // u2-06／u2-07 已全改為站內作答；逐段核對現行頁的公開說明。
        const source=await readFile(new URL('../'+a.file,import.meta.url),'utf8');
        const note=source.match(/const qCommon='<div class="quest-note">(.*?)<\/div>';/);
        assert.ok(note,'活動頁須保留公開說明');
        assert.equal(await page.locator('#stage .quest-note').evaluate(el=>el.innerHTML),note[1]);
        assert.doesNotMatch(await page.locator('#stage').innerText(),/抽查|抽看/);
        const requests=current.requests.length,session=structuredClone(q);
        assert.equal(await page.locator('[data-fallback]').count(),0);
        assert.doesNotMatch(await page.locator('#stage').innerText(),/備用素材|未實際操作|本機備用紀錄/);
        if(q.questions[0].data.backup){await page.getByRole('heading',{name:'本組委託附件',exact:true}).waitFor();assert.equal(await page.locator('.quest-attach').evaluate(el=>el.closest('details')),null);}
        assert.deepEqual(current.requests.slice(requests).filter(r=>!['controls','progress'].includes(r.op)),[]);
        assert.deepEqual(current.db.docs.get(modules.paths.head('synthetic-a')).activeSession,session);
        assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
        assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.endsWith(':fallback:v1'))),false);
        for(const file of q.questions[0].data.assets||[]){
          const link=page.locator(`[data-material="${file[0]}"]`);await link.waitFor();
          const event=page.waitForEvent('download');await link.click();const download=await event,stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
          assert.deepEqual(Buffer.concat(chunks),await readFile(new URL('../115-g9/u2-07/materials/'+file[0],import.meta.url)));
        }
        if(q.questions[0].data.mode==='media-lossy'){
          const counts=await page.locator('[data-material-image]').evaluateAll(async imgs=>{const counts=[];for(const img of imgs){await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const p=ctx.getImageData(0,80,320,1).data;let n=0,on=false;for(let x=0;x<320;x++){const dark=p[x*4]<205;if(dark&&!on)n++;on=dark;}counts.push(n);}return counts;});
          assert.deepEqual(counts,q.questions[0].data.imageGroup?[8,4]:[6,3]);
        }
        if(a.activity===8&&round===1){
          await page.evaluate(()=>window.scrollTo(0,document.querySelector('table').getBoundingClientRect().top+scrollY));
          await page.screenshot({path:'/tmp/ybs-pr6b5-sheet-mobile.png'});
        }
      }
      if(a.activity===7){
        assert.match(await page.locator('#activity-title').innerText(),/動漫／遊戲展志工招募$/);
        if(round===0){
          assert.equal(await page.getByRole('region',{name:'職務第一志願比較（人）'}).count(),1);
          assert.equal(await page.locator('[data-fallback="use"]').count(),0);
        }else{
          const requests=current.requests.length,session=structuredClone(q);
          await page.getByRole('heading',{name:'本組委託附件',exact:true}).waitFor();
          assert.equal(await page.locator('[data-fallback]').count(),0);
          assert.equal(await page.locator('.quest-attach').evaluate(el=>el.closest('details')),null);
          assert.deepEqual(current.requests.slice(requests).filter(r=>!['controls','progress'].includes(r.op)),[]);
          assert.deepEqual(current.db.docs.get(modules.paths.head('synthetic-a')).activeSession,session);
          assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0);
          assert.equal(await page.evaluate(()=>localStorage.getItem('ybs:u2-05:fallback:v1')),null);
        }
      }
      let wrong=structuredClone(answer);
      if(Array.isArray(wrong))wrong[0]=type.startsWith('binary')?1-wrong[0]:typeof wrong[0]==='number'?(wrong[0]+1)%(q.questions[0].data.options?.length||4):wrong[0]+'X';
      else if(typeof wrong==='number')wrong++;
      else if(typeof wrong==='string')wrong+='X';
      else wrong[Object.keys(wrong)[0]]++;
      // 排序錯答先交換兩張卡；單選保持在合法選項內。
      if(type==='finite-bank-v1'&&['order','chip-journey','tea-performance','memory-performance'].includes(q.questions[0].data.mode)){wrong=[...answer];[wrong[0],wrong[1]]=[wrong[1],wrong[0]];}
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='cpu-schedule')wrong=q.questions[0].data.tasks.flatMap((t,k)=>Array(t[1]).fill(k));
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='components'){wrong=structuredClone(answer);wrong[0][0]=(wrong[0][0]+1)%q.questions[0].data.inputs.length;}
      if(type==='finite-bank-v1'&&['select','scene-prompt','tree-split','knn','cluster-quality','elbow','task-manager','rps-counter'].includes(q.questions[0].data.mode))wrong=(answer+1)%q.questions[0].data.options.length;
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='wifi-router')wrong=(answer+1)%q.questions[0].data.cells.length;
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='scene-choice')wrong=(answer+1)%q.questions[0].data.scenes.length;
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='regression')wrong={...answer,line:(answer.line+1)%q.questions[0].data.lines.length};
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='route')wrong=[q.questions[0].data.from,q.questions[0].data.nodes.find(n=>n[0]!==q.questions[0].data.from&&n[0]!==q.questions[0].data.to)[0]];
      if(type==='finite-bank-v1'&&['multi','wifi-dead'].includes(q.questions[0].data.mode))wrong=[];
      if(type==='finite-bank-v1'&&q.questions[0].data.mode==='media-rle'){wrong=[...answer];wrong[0]=(answer[0][0]==='0'?'1':'0')+answer[0].slice(1);}
      if(outcome&&q.questions[0].data.kinds[0]==='s'){const choices=q.questions[0].data.questions[0].slice(1);wrong=[...answer];wrong[0]=choices.find(v=>v!==answer[0]);}
      if(q.questions[0].data.mode==='photo'){wrong=structuredClone(answer);wrong.answers[1][0]=(wrong.answers[1][0]+1)%6;}
      if(type==='recording-capacity-v1')wrong.q=(answer.q+1)%3;
      await fill(page,type,wrong);await page.getByRole('button',{name:/^(送出|拍下來傳出去)$/}).click();
      await page.getByText('修改答案後再送一次',{exact:true}).waitFor();
      if(a.activity===7)await page.getByText(modules.volunteerCheck(q.questions[0].data,wrong),{exact:true}).waitFor();
      if(a.activity===7){const value=await page.locator('[data-answer-field="0"]').inputValue();assert.equal(value,String(wrong[0]),'錯答後保留欄位');}
      if(q.questions[0].data.mode?.endsWith('-performance')){
        await page.locator('[data-performance-frame]').waitFor();
        await page.getByRole('button',{name:'下一步',exact:true}).click();
        assert.ok(Number(await page.locator('[data-performance-frame]').getAttribute('data-performance-frame'))>=0);
      }
      assert.equal(current.db.docs.get(modules.paths.head('synthetic-a')).activeSession.slot,0);
      await page.reload();await page.locator('#g-isme').waitFor();assert.equal(await page.getByLabel('開始關卡',{exact:true}).count(),0);await page.locator('#g-isme').click();await page.locator('[data-question-type]').waitFor();
      assert.ok(current.requests.some(r=>r.op==='resume'));assert.ok(current.requests.filter(r=>r.op==='start').every(r=>r.body.round===round),'不得先建立其他關卡的 session');
      await fill(page,type,answer);await page.getByRole('button',{name:/^(送出|拍下來傳出去)$/}).click();
      if(!q.questions[0].data.mode?.endsWith('-performance')&&q.questions[0].data.mode!=='photo'){
      await page.getByRole('button',{name:'下一組',exact:true}).waitFor({state:'visible'});
      assert.equal(await page.locator('[data-question-type]').getAttribute('data-slot'),'0');
      await page.getByRole('button',{name:'下一組',exact:true}).click();
      await fill(page,type,modules.privateAnswer(current.db));await page.getByRole('button',{name:/^(送出|拍下來傳出去)$/}).click();
      }
      await page.waitForFunction(count=>app.client.state().snapshot?.records.length===count,round+1);
      if(q.questions[0].data.mode?.endsWith('-performance')){
        assert.equal(current.requests.filter(r=>r.op==='answer').length,3,'錯答一次後，一次送出以同一順序驗兩槽');
        const responses=current.requests.filter(r=>r.op==='answer').slice(-2);assert.deepEqual(responses[0].body.answer,responses[1].body.answer);
        await page.locator('[data-performance-frame]').waitFor();
      }
      if(q.questions[0].data.mode==='photo'){
        assert.equal(current.requests.filter(r=>r.op==='answer').length,3);const responses=current.requests.filter(r=>r.op==='answer').slice(-2);assert.deepEqual(responses[0].body.answer,responses[1].body.answer);
        assert.equal(await page.locator('canvas[data-photo]').count(),2);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:`/tmp/ybs-pr6b7-photo-${round}-mobile.png`,fullPage:true});
      }
      const expectedXP=(round+1)*15+(round+1===a.rounds.length?20:0);
      await page.locator('#xp-total').filter({hasText:new RegExp('^'+expectedXP+' XP$')}).first().waitFor();
      assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,1);
      assert.deepEqual(errors,[]);
    }catch(error){t.diagnostic(JSON.stringify({errors,requests:current.requests,body:await page.locator('body').innerText()}));throw error;}
    finally{await context.close();}
    });
  }
});

test('照片與排卡兩槽：第一槽後重整可自動續傳，第二槽回應遺失重送不重複採計、換人停止演出',async t=>{
  if(workerSkip){t.skip(workerSkip);return;}
  for(const activity of [1,3])for(const mode of ['resume-first','lost-second'])await t.test(`${activity}:${mode}`,async()=>{
    const photo=activity===3,title=photo?'看清背號':'第 1 單';
    await reset();const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
    await page.clock.setFixedTime(allActivitiesOpenAt);
    page.setDefaultTimeout(6000);await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    try{
      await page.goto(base+(photo?'/115-g9/u2-01/':'/115-g9/u1-05/'));await page.getByLabel('帳號',{exact:true}).fill('9990001');await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'登入',exact:true}).click();await page.locator('#g-isme').click();
      await page.locator('[data-question-type]').waitFor();
      const order=modules.privateAnswer(current.db);
      if(mode==='resume-first'){
        // 先接受第一槽；第二槽確實被攔截且成為待送後，才解除攔截並重整。
        await page.route('**/worker/answer',route=>{const b=route.request().postDataJSON();return b.slot===1?route.abort():route.continue();});
        await page.evaluate(({activity,order})=>app.client.answer(activity,0,order),{activity,order});
        await page.waitForFunction(()=>app.client.state().status==='pending');
        assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,0,'第二槽尚未接受，不可已有過關紀錄');
      }else{
        current.dropSecond=true;await fill(page,'finite-bank-v1',order);
        // 第一槽送出也會顯示「上傳中」；須等到第二槽的遺失回應，才檢查已寫入的唯一成績。
        const lostResponse=page.waitForResponse(r=>r.url()===base+'/worker/answer'&&r.request().postDataJSON().slot===1&&r.status()===503);
        await page.getByRole('button',{name:/^(送出|拍下來傳出去)$/}).click();await lostResponse;
        await page.waitForFunction(()=>app.client.state().status==='pending');
        await page.getByText('上傳中，請稍候，答案已保留。',{exact:true}).waitFor();
        assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,1);
        assert.equal(await page.locator('#xp-total').filter({hasText:'15 XP'}).count(),0,'失去成功回應不可先顯示過關');
      }
      await page.unroute('**/worker/answer');await page.reload();await page.locator('#g-isme').waitFor();await page.evaluate(()=>app.advance(61000));await page.locator('#g-isme').click();await page.locator('[data-question-type]').waitFor();
      await page.waitForFunction(()=>app.client.state().snapshot?.records.length===1);
      assert.equal([...current.db.docs.keys()].filter(p=>p.includes('/validatedResults/')).length,1);
      const answers=current.requests.filter(r=>r.op==='answer');for(const a of answers)assert.deepEqual(a.body.answer,order);
      if(mode==='lost-second')assert.equal(new Set(answers.filter(r=>r.body.slot===1).map(r=>r.body.requestId)).size,1);
      if(photo){await page.locator('canvas[data-photo]').first().waitFor();assert.equal(await page.locator('canvas[data-photo]').count(),2);}
      else{await page.locator('[data-performance-frame]').waitFor();await page.getByRole('button',{name:'下一步',exact:true}).click();
      assert.equal(await page.locator('[data-performance-frame]').getAttribute('data-performance-frame'),'1');}
      await page.screenshot({path:photo?'/tmp/ybs-pr6b7-photo-resume-mobile.png':'/tmp/ybs-pr6b6-performance-mobile.png'});
      await page.evaluate(()=>app.client.logout());await page.waitForTimeout(1700);
      assert.equal(await page.locator('[data-performance-frame],canvas[data-photo]').count(),0,'登出後不得由計時器補回受保護演出');
    }finally{await context.close();}
  });
});


test('送出停用回饋：觸控、鍵盤、漏 input、格式與額度失敗恢復', {timeout:30000},async t=>{
  if(!workerSource){t.skip('須指定本機 YBS_WORKER_SOURCE');return;}
  await reset();const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),page=await context.newPage();
  t.after(()=>context.close());await page.clock.setFixedTime(allActivitiesOpenAt);page.setDefaultTimeout(6000);
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.goto(base+'/115-g9/u2-05/index.html');await page.getByLabel('帳號',{exact:true}).fill('9990001');
  await page.getByLabel('密碼',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.locator('#g-isme').click();await page.locator('[data-question-type]').waitFor();
  const send=page.locator('#b-send'),control=page.locator('#send-control'),hint=page.locator('#send-hint');
  assert.equal(await send.isDisabled(),true);assert.match(await hint.innerText(),/還有 7 格/);
  await control.tap();assert.match(await hint.innerText(),/還不能送出.*7 格/);
  await control.focus();await page.keyboard.press('Enter');assert.match(await hint.innerText(),/還不能送出/);
  assert.equal(current.requests.filter(r=>r.op==='answer').length,0);
  const answer=modules.privateAnswer(current.db);await fill(page,'finite-bank-v1',answer);
  const input=page.locator('#stage input').first();await input.fill('1人');assert.equal(await send.isDisabled(),true);assert.match(await hint.innerText(),/整數/);
  await input.evaluate(el=>{el.value='　０１　';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});
  assert.equal(await send.isDisabled(),true);assert.match(await hint.innerText(),/整數/);
  await input.evaluate(el=>{el.value='01';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});
  assert.equal(await send.isDisabled(),false);
  await input.fill('');const index=Number(await input.getAttribute('data-answer-field'));
  await input.evaluate((el,value)=>{el.value=value;},String(answer[index]));
  await page.route('**/worker/answer',route=>route.fulfill({status:503,contentType:'application/json',headers:{'retry-after':'60'},body:JSON.stringify({error:'storage_quota'})}));
  await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  assert.equal(await input.evaluate(el=>el===document.activeElement),true,'停用送出按下時保留焦點，避免失焦移除紅框提示造成按鈕位移');
  assert.equal(await page.locator('.answer-error').count(),1);
  await page.mouse.up();await page.waitForFunction(()=>document.getElementById('send-hint').textContent.includes('儲存額度不足'));
  assert.equal(await send.isDisabled(),true);assert.equal(await page.locator('#quota-old').isVisible(),true);
  await page.unroute('**/worker/answer');await page.evaluate(async()=>{app.advance(60001);await app.client.retry();});
  await page.locator('#b-next-group').waitFor();assert.match(await hint.innerText(),/下一組/);
  assert.equal(await page.locator('#quota-old').isVisible(),false);
});
