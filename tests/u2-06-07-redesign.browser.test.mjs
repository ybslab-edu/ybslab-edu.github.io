// 實際頁面與素材只由 127.0.0.1 提供；登入、教師與鎖為合成替身。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname),outside=[];
let server,browser,base;
before(async()=>{
 server=createServer((req,res)=>{try{let path=new URL(req.url,'http://127.0.0.1').pathname;if(path.endsWith('/'))path+='index.html';let data=readFileSync(resolve(root,'.'+path));const ext=extname(path);
 if(ext==='.html')data=Buffer.from(data.toString().replace(/<link[^>]+https:\/\/fonts\.googleapis\.com[^>]*>/g,''));
 if(path==='/assets/shell.css')data=Buffer.from(data.toString().replace(/^@import.*$/gm,''));
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf','.zip':'application/zip'})[ext]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end()}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done)});base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));assert.deepEqual(outside,[],'無對外請求')});
async function pageFor(width,dir){
 // 下一組會捲回任務說明；關閉平滑捲動，避免長表格尚在移動時點擊教師填答。
 const page=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block',reducedMotion:'reduce'});
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());if(u.origin!==base){outside.push(u.origin);return r.abort()}
  if(u.pathname==='/assets/teacher.js')return r.fulfill({contentType:'text/javascript',body:'window.TEACHER={remembered:()=>true,remember(){}};'});
  if(['/assets/login.js','/assets/lock.js'].includes(u.pathname))return r.fulfill({contentType:'text/javascript',body:'// offline synthetic boundary'});
  return r.continue();
 });
 await page.goto(base+'/115-g9/'+dir+'/');await page.waitForSelector('#stage .quest-answers');return page;
}
for(const width of [360,560,1280])test(`兩單元四關 ${width}px：成果、空答、錯答修正、兩組、素材與鍵盤焦點`,async()=>{
 for(const dir of ['u2-06','u2-07']){
  const page=await pageFor(width,dir),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   for(let r=0;r<4;r++){
    await page.evaluate(i=>APP.load(i),r);
    assert.equal(await page.locator('#b-send').isDisabled(),true);
    if(dir==='u2-07'){assert.match(await page.locator('.quest-note').textContent(),/今天必做第 1、2 關/);assert.match(await page.locator('#says').textContent(),/你/)}
    assert.equal(await page.locator('.quest-attach').isVisible(),true);
    assert.match(await page.locator('.quest-attach').textContent(),/本組委託附件/);
    assert.equal(await page.locator('[data-fallback],details').count(),0);
    assert.doesNotMatch(await page.locator('#stage').textContent(),/備用素材|未實際操作/);
    assert.equal(await page.evaluate(d=>localStorage.getItem('ybs:'+d+':fallback:v1'),dir),null);
    assert.equal(await page.locator('#b-send').isDisabled(),true);
    await page.locator('#tb-ans').click();
    if(dir==='u2-06'){const wrong=await page.locator('[data-answer="0"] option').last().getAttribute('value');await page.locator('[data-answer="0"]').selectOption(wrong)}else await page.locator('[data-answer="0"]').fill('999');
    await page.locator('#b-send').click();
    assert.match(await page.locator('#verdict').textContent(),/還不對/);
    await page.locator('#tb-ans').click();await page.locator('#b-send').click();
    await page.evaluate(()=>document.getElementById('b-send').onclick());assert.match(await page.locator('#streak').textContent(),/1\/2/);
    const prior=await page.evaluate(()=>JSON.stringify(ROUNDS[APP.ri].questionKey(APP.inst)));
    const priorImages=await page.locator('#stage img').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src')));
    await page.locator('#b-next-group').click();assert.notEqual(await page.evaluate(()=>JSON.stringify(ROUNDS[APP.ri].questionKey(APP.inst))),prior);
    if(dir==='u2-07'&&r===2)assert.notDeepEqual(await page.locator('#stage img').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src'))),priorImages,'第 3 關第二組必須換圖像與指定區域');
    await page.locator('#tb-ans').click();await page.locator('#b-send').click();assert.match(await page.locator('#verdict').textContent(),/過關/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'不可水平溢出');
   }
   await page.evaluate(()=>APP.load(0));await page.locator('[data-answer="0"]').focus();await page.keyboard.press('Tab');
   assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');
   if(width===360)await page.screenshot({path:'/tmp/'+dir+'-360.png',fullPage:true});
   assert.deepEqual(errors,[]);
  }finally{await page.close()}
 }
});
test('u2-07 實際圖像逐像素分段，JPEG 較小；所有 PDF、ZIP 本機路徑存在',async()=>{
 const page=await pageFor(360,'u2-07');
 try{
  for(let n=0;n<2;n++){
   const results=await page.evaluate(async n=>{
    const results=[];
    for(const ext of ['png','jpg']){
     const img=new Image();img.src='materials/lines-'+n+'.'+ext;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
     const pixels=ctx.getImageData(0,80,320,1).data;let count=0,active=false;for(let x=0;x<320;x++){const dark=pixels[x*4]<205;if(dark&&!active)count++;active=dark}results.push(count);
    }return results;
   },n);
   assert.deepEqual(results,n===0?[6,3]:[8,4]);
   assert.ok(readFileSync(resolve(root,`115-g9/u2-07/materials/lines-${n}.jpg`)).length<readFileSync(resolve(root,`115-g9/u2-07/materials/lines-${n}.png`)).length);
  }
  for(let n=1;n<=8;n++)for(const ext of ['pdf','zip']){
   const response=await page.request.get(base+`/115-g9/u2-07/materials/${ext==='pdf'?'notice':'pack'}-${n}.${ext}`);assert.equal(response.status(),200);
  }
 }finally{await page.close()}
});
