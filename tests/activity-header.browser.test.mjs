// 只讀本機頁面；略過登入 SDK，以合成教師示範模式檢查排版，不接觸 Firebase。
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
for(const width of [1440,390])test(`30 活動共用標題與關卡切換，${width}px 排版及示範比較卡`,async()=>{
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
        assert.equal(await page.evaluate(()=>APP.ri),i);
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
