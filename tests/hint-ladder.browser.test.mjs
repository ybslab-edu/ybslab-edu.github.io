// 比照既有標題列測試：本機 UTF-8 HTTP、封鎖外網、合成班座進場。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let server,browser,base;
before(async()=>{
 server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
  if(!path.startsWith(root+sep)){res.writeHead(404).end();return}
  try{res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}catch{res.writeHead(404).end()}
 });
 await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
test('全站 121 關提示：不同示範題、自動填答與說明、保留原題作答、進度、教師與鍵盤',async()=>{
 const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{
   const url=r.request().url();
   if(/\/assets\/(login|lock)\.js/.test(url))return r.fulfill({contentType:'text/javascript; charset=utf-8',body:'// 離線提示測試'});
   return url.startsWith(base)?r.continue():r.abort();
  });
  let count=0,automatic=0,manual=0;
  for(const dir of await readdir(resolve(root,'115-g9'))){
   if(!/^u\d+-\d+$/.test(dir))continue;
   if(!(await readFile(resolve(root,'115-g9',dir,'index.html'),'utf8')).includes('assets/shell.js'))continue;
   await page.goto(base+'/115-g9/'+dir+'/');
   await page.fill('#in-cls','999');await page.fill('#in-seat','1');await page.click('#g-next');await page.click('#g-go');
   const length=await page.evaluate(()=>APP.rounds.length);
   for(let i=0;i<length;i++){
    count++;
    const label=dir+' 關卡索引 '+i;
    // 保留活動 view 與 ready；只記住正常互動使用的 changed 通知。
    await page.evaluate(index=>{
     const r=APP.rounds[index],view=r.view;
     r.view=(inst,el,api)=>{if(el.id==='stage')window.answerChanged=api.changed;return view(inst,el,api)};
     APP.load(index);
    },i);
    assert.equal(await page.locator('#b-hint').isDisabled(),true,label+' 初始提示鎖定');
    // 首次送出沿用活動正解及既有換題流程，不變更 check。
    await page.evaluate(()=>APP.handle.fill());
    if(dir==='u0-01'&&i===0){
     assert.equal(await page.locator('#b-send').isDisabled(),true,label+' 重現原失敗：fill 未通知 changed');
     await page.evaluate(()=>document.getElementById('b-send').click());
     assert.equal(await page.locator('#b-hint').isDisabled(),true,label+' disabled 送出不應解鎖提示');
    }
    await page.evaluate(()=>answerChanged());
    assert.equal(await page.locator('#b-send').isDisabled(),false,label+' 填答後可送出');
    await page.evaluate(()=>document.getElementById('b-send').click());
    await page.evaluate(()=>{for(let n=0;n<3;n++)document.getElementById('b-hint').click()});
    // 演出型關卡可能已過關，重設後用一次錯答解鎖；不呼叫演出或雲端。
    if(await page.evaluate(()=>!!APP.rounds[APP.ri].manualAttempt)){
     await page.evaluate(()=>{APP.handle.fill();answerChanged();const r=APP.rounds[APP.ri],check=r.check;r.check=()=>false;document.getElementById('b-send').click();r.check=check;for(let n=0;n<3;n++)document.getElementById('b-hint').click()});
    }
    assert.equal(await page.locator('#b-demo').isVisible(),true,label+' 示範已解鎖');
    const before=await page.evaluate(()=>{
     // 送出已可能換題；以此刻原題為基準，並讓參照留在閉包內。
     const originalInst=APP.inst,originalHandle=APP.handle,originalRound=APP.ri;
     const r=APP.rounds[APP.ri],gen=r.gen,demoInputs=[];
     window.demoSnapshot=()=>({same:originalInst===APP.inst&&originalHandle===APP.handle,
      sameInst:originalInst===APP.inst,sameHandle:originalHandle===APP.handle,round:APP.ri,originalRound,
      inst:JSON.stringify(APP.inst),answer:JSON.stringify(APP.handle.get()),stored:JSON.stringify({...localStorage})});
     window.demoInputs=demoInputs;window.restoreGen=gen;
     r.gen=rnd=>{const inst=gen(rnd);demoInputs.push(JSON.stringify(r.questionKey?r.questionKey(inst):inst));return inst};
     return demoSnapshot();
    });
    const assertOriginal=(snapshot,phase)=>{
     const detail=label+' '+phase+' '+JSON.stringify({sameInst:snapshot.sameInst,sameHandle:snapshot.sameHandle,round:snapshot.round,originalRound:snapshot.originalRound});
     assert.equal(snapshot.same,true,detail);
     assert.equal(snapshot.round,before.originalRound,label+' '+phase+' 關卡不變');
     assert.equal(snapshot.inst,before.inst,label+' '+phase+' 題目內容不變');
     assert.equal(snapshot.answer,before.answer,label+' '+phase+' 作答不變');
     assert.equal(snapshot.stored,before.stored,label+' '+phase+' 儲存不變');
    };
    await page.locator('#b-demo').focus();
    assertOriginal(await page.evaluate(()=>demoSnapshot()),'開啟前（聚焦後）');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#hint-demo').isVisible(),true,label);
    assert.equal(await page.locator('#b-demo-back').evaluate(el=>document.activeElement===el),true,label+' 開啟示範後鍵盤焦點');
    const result=await page.evaluate(()=>{
     const r=APP.rounds[APP.ri],key=JSON.stringify(r.questionKey?r.questionKey(APP.inst):APP.inst);
     const ids=[...document.querySelectorAll('[id]')].map(el=>el.id),box=document.getElementById('demo-content');
     return {...demoSnapshot(),duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),labelsLinked:[...box.querySelectorAll('label[for]')].every(el=>box.contains(el.control)),different:demoInputs.some(v=>v!==key),manual:!!r.manualAttempt,filled:!!box.querySelector('fieldset'),explanation:box.textContent};
    });
    assert.deepEqual(result.duplicates,[],label+' 示範不可產生重複 ID');
    assert.equal(result.labelsLinked,true,label+' 示範標籤仍連結示範元件');
    assertOriginal(result,'示範顯示中');
    // 即使直接觸發隱藏的送出按鈕，也不能判題或換題。
    await page.evaluate(()=>document.getElementById('b-send').click());
    assertOriginal(await page.evaluate(()=>demoSnapshot()),'示範中送出後');
    if(!result.manual){automatic++;assert.equal(result.different,true,label+' 不同題');assert.equal(result.filled,true,label+' 自動示範');}
    else{manual++;assert.equal(result.filled,false,label+' 演出關卡只顯示說明');assert.equal(result.different,false,label+' 演出關卡不產示範題');assert.equal(result.explanation,await page.evaluate(()=>{const r=APP.rounds[APP.ri],text=document.createElement('div'),txt=v=>typeof v==='function'?v(APP.inst):(v||'');text.innerHTML=r.learn||[r.now,r.goal,r.tip].map(txt).join('');return '這一關的說明'+text.textContent}),label+' 演出說明');}
    assert.ok(result.explanation.length>20,label+' 示範說明');
    await page.locator('#b-demo-back').focus(); // 返回操作前明確定位鍵盤焦點
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#original-work').isVisible(),true,label+' 返回原題');
    assertOriginal(await page.evaluate(()=>demoSnapshot()),'返回後');
    assert.equal(await page.locator('#b-demo').evaluate(el=>document.activeElement===el),true,label+' 返回原題後鍵盤焦點');
    await page.evaluate(()=>{APP.rounds[APP.ri].gen=restoreGen});
   }
  }
  assert.equal(count,121);assert.equal(automatic,109);assert.equal(manual,12);assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
