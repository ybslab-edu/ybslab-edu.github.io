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
  let count=0;
  for(const dir of await readdir(resolve(root,'115-g9'))){
   if(!/^u\d+-\d+$/.test(dir))continue;
   if(!(await readFile(resolve(root,'115-g9',dir,'index.html'),'utf8')).includes('assets/shell.js'))continue;
   await page.goto(base+'/115-g9/'+dir+'/');
   await page.fill('#in-cls','999');await page.fill('#in-seat','1');await page.click('#g-next');await page.click('#g-go');
   const length=await page.evaluate(()=>APP.rounds.length);
   for(let i=0;i<length;i++){
    count++;
    await page.evaluate(index=>APP.load(index),i);
    assert.equal(await page.locator('#b-hint').isDisabled(),true);
    // 首次送出沿用活動正解及既有換題流程，不變更 check。
    await page.evaluate(()=>{APP.handle.fill();document.getElementById('b-send').click()});
    await page.evaluate(()=>{for(let n=0;n<3;n++)document.getElementById('b-hint').click()});
    // 演出型關卡可能已過關，重設後用一次錯答解鎖；不呼叫演出或雲端。
    if(await page.locator('#b-demo').isHidden()){
     await page.evaluate(()=>{const r=APP.rounds[APP.ri],check=r.check;r.check=()=>false;document.getElementById('b-send').click();r.check=check;for(let n=0;n<3;n++)document.getElementById('b-hint').click()});
    }
    const before=await page.evaluate(()=>{window.originalInst=APP.inst;window.originalHandle=APP.handle;window.originalCheck=APP.rounds[APP.ri].check;window.demoInputs=[];const r=APP.rounds[APP.ri],gen=r.gen;window.restoreGen=gen;r.gen=rnd=>{const inst=gen(rnd);demoInputs.push(JSON.stringify(r.questionKey?r.questionKey(inst):inst));return inst};return {inst:JSON.stringify(APP.inst),answer:JSON.stringify(APP.handle.get()),stored:JSON.stringify({...localStorage})}});
    await page.locator('#b-demo').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#hint-demo').isVisible(),true,dir+' '+i);
    const result=await page.evaluate(()=>{
     const r=APP.rounds[APP.ri],key=JSON.stringify(r.questionKey?r.questionKey(APP.inst):APP.inst);
     return {same:originalInst===APP.inst&&originalHandle===APP.handle,inst:JSON.stringify(APP.inst),answer:JSON.stringify(APP.handle.get()),stored:JSON.stringify({...localStorage}),different:demoInputs.some(v=>v!==key),manual:!!r.manualAttempt,filled:!!document.querySelector('#demo-content fieldset'),explanation:document.querySelector('#demo-content').textContent};
    });
    assert.equal(result.same,true);assert.equal(result.inst,before.inst);assert.equal(result.answer,before.answer);assert.equal(result.stored,before.stored);
    if(!result.manual){assert.equal(result.different,true,dir+' '+i+' 不同題');assert.equal(result.filled,true,dir+' '+i+' 自動示範');}
    assert.ok(result.explanation.length>20);
    assert.equal(await page.locator('#b-demo-back').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#original-work').isVisible(),true);
    assert.equal(await page.locator('#b-demo').evaluate(el=>document.activeElement===el),true);
    await page.evaluate(()=>{APP.rounds[APP.ri].gen=restoreGen});
   }
  }
  assert.equal(count,121);assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
