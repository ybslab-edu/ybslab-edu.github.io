import test from 'node:test';
import assert from 'node:assert/strict';
import {openActivity,samples,tabTo,activate,fillAnswers} from './helpers/fullrev-a11y.mjs';

async function focused(page,selector,message){
 assert.equal(await page.locator(selector).evaluate(e=>e===document.activeElement),true,message);
}
async function visibleControl(page,control){
 const result=await control.evaluate(e=>{
  const r=e.getBoundingClientRect(),v=window.visualViewport;
  // Chromium 原生焦點捲動會取整到實體像素；容許不到 1 CSS px 的捨入差。
  const inside=r.left>=-1&&r.right<=innerWidth+1&&r.top>=(v?.offsetTop||0)-1&&r.bottom<=(v?.offsetTop||0)+(v?.height||innerHeight)+1;
  // 按鈕保留既有切角；檢查可操作的中央及四邊中點。
  const points=[[(r.left+r.right)/2,r.top+4],[(r.left+r.right)/2,r.bottom-4],[r.left+r.width/4,(r.top+r.bottom)/2],[r.right-r.width/4,(r.top+r.bottom)/2],[(r.left+r.right)/2,(r.top+r.bottom)/2]];
  return {inside,uncovered:points.every(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===e||e.contains(hit);}),
   outline:getComputedStyle(e).outlineStyle,control:e.outerHTML.slice(0,180),rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight}};
 });
 assert.equal(result.inside,true,'整個控制須落在可視區：'+JSON.stringify(result));assert.equal(result.uncovered,true,'控制不可被固定／浮動元素遮擋：'+JSON.stringify(result));assert.notEqual(result.outline,'none','鍵盤焦點須可見');
}

for(const sample of samples)test(`${sample.path} ${sample.kind}：360px 鍵盤錯答聚焦、訂正與兩組過關`,async t=>{
 const page=await openActivity(t,sample);
 await fillAnswers(page,sample,{wrong:true});await activate(page,'#b-send');
 await page.locator('#verdict.no').waitFor({state:'visible'});
 await focused(page,'#verdict','送出錯答後焦點須落在錯誤提示');
 assert.match(await page.locator('#verdict').innerText(),/還不對.*請重新核對/s);
 assert.equal(await page.locator('#verdict').getAttribute('tabindex'),'-1');
 assert.equal(await page.evaluate(()=>app.state.snapshot.records.some(r=>r.round===app.requests.at(-1).body.round)),false,'錯答不過關');
 await fillAnswers(page,sample);await activate(page,'#b-send');await page.locator('#b-next-group').waitFor();
 await tabTo(page,'#b-next-group');await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>document.activeElement!==document.body&&document.querySelector('#stage').contains(document.activeElement)),true,'下一組重建後焦點須進入新題目');
 assert.equal(await page.locator('#stage').getAttribute('data-slot'),'1');
 await fillAnswers(page,sample,{slot:1});await activate(page,'#b-send');
 await page.getByRole('heading',{name:'過關！',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>app.requests.filter(r=>r.url.endsWith('/answer')).map(r=>r.body.slot)),[0,0,1]);
 await tabTo(page,'#b-redo');await visibleControl(page,page.locator('#b-redo'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'整頁不得橫向溢出');
});

test('排卡放入／退回後焦點接續到可操作按鈕',async t=>{
 const page=await openActivity(t,samples.find(s=>s.kind==='order'));
 await activate(page,'[data-pool-index="1"]');
 await focused(page,'[data-pool-index="0"]','放入後焦點移到剩餘卡片');
 await activate(page,'[data-slot-index="0"]');
 await focused(page,'[data-pool-index="1"]','退回後焦點回到該卡片');
});

test('下一組替換題目後，焦點移到新題第一個控制',async t=>{
 const sample=samples.find(s=>s.kind==='number'),page=await openActivity(t,sample);
 await fillAnswers(page,sample);await activate(page,'#b-send');await page.locator('#b-next-group').waitFor();
 await activate(page,'#b-next-group');
 await focused(page,'[data-answer-field="b"]','原下一組按鈕被移除後不可遺失焦點');
});

for(const sample of samples)test(`${sample.path}：360px 與縮短至 360px 高的鍵盤視窗，Tab 控制不被遮擋`,async t=>{
 const page=await openActivity(t,sample);
 for(const height of [800,360]){
  await page.setViewportSize({width:360,height});
  const controls=page.locator('#stage input,#stage select,#stage button');
  for(const control of await controls.all()){
   await tabTo(page,control);await visibleControl(page,control);
  }
  await tabTo(page,'#send-control');await visibleControl(page,page.locator('#send-control'));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'窄螢幕不得整頁橫向溢出');
 }
});
