// 真實 DOM + 動態核心載入；所有請求攔截於本機合成內容，不接 Firebase。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
for(const [width,reduced,dark] of [[1440,false,false],[390,false,true],[320,true,true]]){
  test(`A/B 真實 DOM：${width}px、減少動態 ${reduced}、深色 ${dark}`,async()=>{
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference',colorScheme:dark?'dark':'light'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.route('**/*',route=>{
        const path=new URL(route.request().url()).pathname;
        if(path==='/assets/xp.js')return route.fulfill({contentType:'text/javascript',body:read('assets/xp.js')});
        if(path==='/assets/shell.js')return route.fulfill({contentType:'text/javascript',body:read('assets/shell.js')});
        if(path==='/assets/shell.css')return route.fulfill({contentType:'text/css',body:read('assets/shell.css')});
        return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/shell.css"></head><body>
<script>const TEACHER={remembered:()=>false,remember(){}};
const ACTIVITIES=[1,2].map(week=>({course:'115-g9',week,codes:['資D-IV-1'],rounds:['甲','乙','丙','丁']}));
const activityOpenAt=()=>Date.now()-864e5,isActivityOpen=()=>true;
localStorage.setItem('it9:w1:999-1',JSON.stringify({mask:15,tries:[2,2,2,2],time:1}));
localStorage.setItem('ybs:xp:115-g9:seat:999-1',JSON.stringify({1:{passes:Object.fromEntries([0,1,2,3].map(i=>[i,{passedAt:Date.now()}]))}}));</script>
<script src="/assets/shell.js"></script><script>let n=0;const APP=SHELL({course:'115-g9',week:2,title:'合成手機標題列與成長紀錄',rounds:[0,1,2,3].map(i=>({name:'合成關卡'+i,lv:1,now:'目前',goal:'目標',gen:()=>({n:++n}),view:()=>({get:()=>null}),check:()=>true}))});</script></body></html>`});
      });
      await page.goto('http://synthetic.test/115-g9/u2-03/');
      await page.waitForFunction(()=>typeof YBSXP!=='undefined');
      await page.fill('#in-cls','999');await page.fill('#in-seat','1');
      // 班座驗證通過並顯示確認區後，才能按「對，開始」。
      await page.click('#g-next');
      assert.equal(await page.locator('#g-confirm').textContent(),'你是 999 班 1 號，對嗎？');
      await page.click('#g-go');
      await page.locator('#main').waitFor({state:'visible'});
      assert.equal(await page.locator('#xp-total').textContent(),'80 XP');
      const disabled=await page.locator('#xp-link').getAttribute('aria-disabled');assert.equal(disabled,'true');
      for(let i=0;i<4;i++)await page.evaluate(i=>{APP.load(i);document.getElementById('b-send').click();document.getElementById('b-send').click()},i);
      assert.equal(await page.locator('#xp-total').textContent(),'160 XP');
      assert.match(await page.locator('#verdict').textContent(),/\+10 過關、\+5 準時、\+20 全過/);
      assert.match(await page.locator('.xp-title-card').textContent(),/升級！Lv 2編碼學徒/);
      assert.equal(await page.locator('.xp-title-card').evaluate(el=>getComputedStyle(el).animationName),reduced?'none':'xp-arrive');
      const layout=await page.locator('header.top').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert.ok(layout.scroll<=layout.width+1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.equal(await page.locator('#score-value').textContent(),'100');assert.deepEqual(errors,[]);
    }finally{await page.close()}
  });
}
