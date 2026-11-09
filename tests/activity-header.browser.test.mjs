// 只讀本機頁面；略過登入 SDK，以合成教師示範模式檢查排版，不接觸 Firebase。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
let server,browser,base;
before(async()=>{
  server=createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!path.startsWith(root+sep)){res.writeHead(404).end();return}
    try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path))}
    catch{res.writeHead(404).end()}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
for(const width of [1280,390])test(`30 活動共用標題與關卡切換，${width}px 排版及示範比較卡`,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await context.addInitScript(()=>sessionStorage.setItem('ybslab:teacher','1'));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/assets/login.js'))return route.fulfill({contentType:'text/javascript',body:'// 離線排版測試不載入登入 SDK'});
      return url.startsWith(base)?route.continue():route.abort();
    });
    let count=0;
    for(const dir of await readdir(resolve(root,'115-g9'))){
      if(!/^u\d+-\d+$/.test(dir))continue;
      const html=await readFile(resolve(root,'115-g9',dir,'index.html'),'utf8');
      if(!html.includes('assets/shell.js'))continue;
      count++;
      await page.goto(base+'/115-g9/'+dir+'/');
      await page.locator('#main').waitFor({state:'visible'});
      assert.match(await page.locator('#main h1').textContent(),/^第 \d+ 週｜/);
      assert.equal(await page.locator('nav.unit, [role=tablist]').count(),0);
      const rounds=dir==='u2-03'?5:4;
      assert.equal(await page.locator('#rounds button').count(),rounds);
      const header=await page.locator('header.top').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,width:el.clientWidth}));
      assert.ok(header.left>=0&&header.right<=width&&header.scroll<=header.width+1,dir+' 標題列不溢出');
      for(let i=0;i<rounds;i++){
        await page.locator('#rounds button').nth(i).click();
        assert.equal(await page.evaluate(()=>APP.ri),i,dir+' 切換至關卡 '+i);
        for(const id of ['report','score','score-value','rep-note','sync2'])assert.equal(await page.locator('#'+id).count(),0);
        for(const id of ['b-retry','b-hint'])assert.equal(await page.locator('#'+id).isVisible(),false,dir+' 教師模式隱藏按鈕');
        const layout=await page.locator('header.top').evaluate(el=>{
          const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};
          return {title:rect(el.querySelector('h1')),buttons:[...el.querySelectorAll('#rounds button')].map(rect),
            pageWidth:document.documentElement.scrollWidth};
        });
        assert.ok(layout.buttons.every(b=>b.top>=layout.title.bottom&&b.left>=0&&b.right<=width),dir+' 所有關卡都在標題下一列且不溢出');
        assert.ok(layout.pageWidth<=width,dir+' 整頁無水平捲動');
        if(dir==='u2-03'){
          const target=await page.locator('.compare-target').boundingBox(),mine=await page.locator('.compare-mine').boundingBox();
          assert.ok(width<560?mine.y>=target.y+target.height:mine.x>=target.x+target.width,'比較卡依螢幕並排／上下排');
          assert.ok(mine.x+mine.width<=width,'我的卡片不溢出');
          await page.locator('#tb-ans').click();
          assert.ok(!(await page.locator('.compare-status').textContent()).includes('尚未填入'));
        }
      }
    }
    assert.equal(count,30);assert.deepEqual(errors,[]);
  }finally{await context.close()}
});

// 真實活動頁與合成上傳狀態；所有請求只放行本機，截圖不進 repo。
for(const width of [1280,390])test(`提示標題列、頁首重試與成功截圖：${width}px`,async()=>{
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  try{
    page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base+'/assets/login.js'))return route.fulfill({contentType:'text/javascript',body:`
        window.retryCount=0;window.YBS={enabled:()=>true,button(){},logout(){},profile:()=>null,
          status(fn){window.uploadStatus=fn},guest(){uploadStatus('ok')},
          retry(){retryCount++;uploadStatus('sending');setTimeout(()=>uploadStatus('ok'),30)},submit(){}};`});
      return url.startsWith(base)?route.continue():route.abort();
    });
    await page.clock.setFixedTime(new Date('2026-11-09T08:00:00+08:00'));
    await page.goto(base+'/115-g9/u2-03/');
    await page.click('#g-manual');
    await page.fill('#in-cls','999');await page.fill('#in-seat','1');
    await page.click('#g-next');await page.click('#g-go');
    await page.locator('#main').waitFor({state:'visible'});
    assert.equal(await page.locator('#report, #score, #score-value, #sync2, #rep-note, #hint-status').count(),0);
    assert.equal(await page.locator('.work-heading #b-hint').count(),1);
    assert.equal(await page.locator('#b-hint').isDisabled(),true);
    assert.match(await page.locator('#b-hint').getAttribute('title'),/先試著送出一次/);
    assert.equal(await page.locator('#hint-content').textContent(),'');
    const heading=await page.locator('.work-heading').evaluate(el=>{
      const h=el.querySelector('h2').getBoundingClientRect(),b=el.querySelector('button').getBoundingClientRect();
      return b.left>=h.right&&b.top<h.bottom&&b.bottom>h.top;
    });assert.equal(heading,true);
    await page.locator('#stage button').first().click();
    await page.click('#b-send');
    assert.equal(await page.locator('#b-hint').isDisabled(),false);
    await page.click('#b-hint');assert.match(await page.locator('#hint-content').textContent(),/第 1 層/);
    assert.equal(await page.locator('#b-retry').isVisible(),false);
    await mkdir('/tmp/ybs-trim-shots',{recursive:true});
    for(const state of ['ok','pending','guest-pending','guest-storage','sending','relogin']){
      await page.evaluate(st=>uploadStatus(st),state);
      const retry=['pending','guest-pending','guest-storage'].includes(state);
      assert.equal(await page.locator('#b-retry').isVisible(),retry);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(state==='ok'||state==='pending'){
        if(retry){
          const layout=await page.locator('.upload-status').evaluate(el=>{
            const a=el.querySelector('#sync'),b=el.querySelector('#b-retry'),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),x=getComputedStyle(a),y=getComputedStyle(b);
            return {order:a.nextElementSibling===b,space:br.left>=ar.right||br.top>=ar.bottom,font:x.fontSize===y.fontSize,border:x.borderWidth===y.borderWidth,radius:x.borderRadius===y.borderRadius};
          });assert.deepEqual(layout,{order:true,space:true,font:true,border:true,radius:true});
        }
        await page.screenshot({path:`/tmp/ybs-trim-shots/${width}-${state==='ok'?'success':'retry'}.png`,fullPage:true});
      }
    }
    await page.evaluate(()=>uploadStatus('pending'));await page.click('#b-retry');
    await page.waitForFunction(()=>document.querySelector('#sync').textContent.includes('已上傳'));
    assert.equal(await page.evaluate(()=>retryCount),1);assert.equal(await page.locator('#b-retry').isVisible(),false);
    assert.deepEqual(errors,[]);
  }finally{await context.close()}
});
