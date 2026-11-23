// 離線執行實際活動與 CSS；只用合成教師模式，不載入 Firebase。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
for(const width of [360,390,559,560,1440])test(`u2-04／05 各關版面、即時差異及換題標示 ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body></html>'}));
    for(const dir of ['u2-04','u2-05']){
      await page.goto('http://127.0.0.1/'+dir);
      const html=read(`115-g9/${dir}/index.html`);
      await page.addStyleTag({content:read('assets/shell.css').replace(/^@import.*$/gm,'')});
      for(const [,content] of html.matchAll(/<style>([\s\S]*?)<\/style>/g))await page.addStyleTag({content});
      await page.evaluate(()=>window.TEACHER={remembered:()=>true,remember(){}});
      await page.addScriptTag({content:read('assets/shell.js')});
      await page.addScriptTag({content:[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')});
      for(let index=0;index<4;index++){
        await page.evaluate(i=>{APP.load(i===0?1:0);APP.load(i)},index);
        const compare=dir==='u2-04'&&index<2;
        assert.equal(await page.locator('.compare').count(),compare?1:0);
        if(compare){
          assert.equal(await page.locator('#says .tk').count(),0,'任務說明只留一行');
          const target=await page.locator('.compare-target').boundingBox(),mine=await page.locator('.compare-mine').boundingBox();
          assert.ok(width<560?mine.y>=target.y+target.height:mine.x>=target.x+target.width,'560px 分界');
          assert.ok(mine.x+mine.width<=width);
          assert.equal(await page.locator('.question-changed').count(),0,'首次／跨關不標示');
          await page.locator('#tb-ans').click();
          assert.equal(await page.locator('.compare-status').textContent(),'與目標相同');
          await page.locator(index===0?'#t-w':'#t-c').fill(index===0?'WRONG':'0');
          assert.match(await page.locator('.compare-status').textContent(),/與目標相差/);
          // 固定兩組原題庫中的暗號，避免隨機換題無法穩定重現。
          await page.evaluate(()=>{ROUNDS[APP.ri].gen=()=>({w:'LOVE'});document.getElementById('tb-new').click()});
          await page.locator('#tb-ans').click();
          await page.evaluate(()=>ROUNDS[APP.ri].gen=()=>({w:'ENCORE'}));
          await page.locator('#b-send').click();
          assert.match(await page.locator('#streak').textContent(),/累積答對 1\/2/);
          await page.locator('#b-next-group').click();
          const marks=page.locator('.target-content .question-changed');
          assert.ok(await marks.count()>0,'數字及純英文目標換題都標示');
          assert.equal(await marks.first().evaluate(el=>getComputedStyle(el).animationDuration),'2s');
          await page.locator('#tb-ans').click();
          assert.equal(await page.locator('.compare-status').textContent(),'與目標相同');
        }else{
          assert.ok(await page.locator('#says .tk').count()>0);
          await page.locator('#tb-ans').click();
          assert.equal(await page.locator('#b-send').isDisabled(),false);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'各關不水平溢出');
      }
    }
    assert.deepEqual(errors,[]);
  }finally{await page.close()}
});


test('u2-05 委託附件直接顯示、同題修正、重送不加計及鍵盤焦點',async()=>{
 const page=await browser.newPage({viewport:{width:360,height:900}}),outside=[];
 try{
  await page.route('**/*',r=>{
   if(new URL(r.request().url()).hostname!=='127.0.0.1'){outside.push(r.request().url());return r.abort()}
   return r.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body></body></html>'});
  });
  await page.goto('http://127.0.0.1/u2-05');
  const html=read('115-g9/u2-05/index.html');
  await page.addStyleTag({content:read('assets/shell.css').replace(/^@import.*$/gm,'')});
  for(const [,content] of html.matchAll(/<style>([\s\S]*?)<\/style>/g))await page.addStyleTag({content});
  await page.evaluate(()=>window.TEACHER={remembered:()=>true,remember(){}});
  await page.addScriptTag({content:read('assets/shell.js')});
  await page.addScriptTag({content:[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')});
  for(let round=1;round<4;round++){
   await page.evaluate(i=>APP.load(i),round);
   assert.equal(await page.locator('.quest-attach').isVisible(),true);
   assert.equal(await page.locator('[data-fallback]').count(),0);
   assert.equal(await page.locator('#b-send').isDisabled(),true);
   await page.locator('#tb-ans').click();
   await page.locator('.quest-answers input[type="number"]').first().fill('999');
   await page.locator('#b-send').click();
   assert.match(await page.locator('#verdict').textContent(),/還不對/);
   await page.locator('#tb-ans').click();await page.locator('#b-send').click();
   await page.evaluate(()=>document.getElementById('b-send').click());
   assert.match(await page.locator('#streak').textContent(),/1\/2/);
   await page.locator('#b-next-group').click();await page.locator('#tb-ans').click();await page.locator('#b-send').click();
   assert.match(await page.locator('#verdict').textContent(),/過關/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.evaluate(()=>APP.load(0));await page.locator('[data-answer="0"]').focus();await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'));
  assert.deepEqual(outside,[]);
 }finally{await page.close()}
});
