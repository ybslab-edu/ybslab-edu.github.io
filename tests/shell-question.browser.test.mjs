// 真實 DOM、合成題目與本機存檔；不載入登入或任何網路服務。
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function setup(t,{teacher=false,reduced=false,actual=false}={}){
  const page=await browser.newPage({viewport:{width:390,height:700},reducedMotion:reduced?'reduce':'no-preference'});
  t.after(()=>page.close());
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('http://synthetic.test/');
  await page.addStyleTag({content:read('assets/shell.css')});
  if(actual)for(const [,content] of read('115-g9/u2-03/index.html').matchAll(/<style>([\s\S]*?)<\/style>/g))await page.addStyleTag({content});
  await page.evaluate(({teacher})=>{
    window.TEACHER={remembered:()=>teacher,remember(){}};
    window.scrolls=[];
    const scroll=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,...options});scroll.call(this,options)};
    localStorage.setItem('it9:w99:999-1',JSON.stringify({mask:2,tries:[3,4,0,0,0,0],time:1}));
  },{teacher});
  await page.addScriptTag({content:read('assets/shell.js')});
  const source=actual?[...read('115-g9/u2-03/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'):`
    let generation=0, reply=true;
    const APP=SHELL({week:99,title:'合成活動',rounds:[1,2].map(n=>({lv:1,name:'合成關'+n,
      now:i=>'固定 5，目標 <b>'+i.n+'</b>，小數 '+i.n+'.5',goal:'累積答對 2/2',
      gen:()=>({n:++generation}),view:(i,el)=>{el.innerHTML='<button data-changed="target">目標 '+i.n+'</button>';el.querySelector('button').onclick=()=>window.clicked=true;return {get:()=>null}},check:()=>reply}))});`;
  await page.addScriptTag({content:source});
  if(!teacher)await page.evaluate(()=>{document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click()});
  return page;
}

test('累積計數：答對、答錯換題、答對即過關；舊存檔、換關與教師模式相容',async t=>{
  for(const teacher of [false,true]){
    const page=await setup(t,{teacher});
    assert.equal(await page.locator('.question-changed').count(),0);
    if(!teacher)assert.match(await page.locator('#prog').innerText(),/合成關2 ✓/);
    await page.click('#b-send');
    assert.match(await page.locator('#streak').innerText(),/累積答對 1\/2/);
    await page.evaluate(()=>{reply='合成錯答';document.getElementById('b-send').click()});
    assert.equal(await page.evaluate(()=>APP.inst.n),3);
    assert.match(await page.locator('#streak').innerText(),/累積答對 1\/2/);
    await page.evaluate(()=>{reply=true;document.getElementById('b-send').click()});
    assert.match(await page.locator('#streak').innerText(),/累積答對 2\/2/);
    assert.match(await page.locator('#verdict').innerText(),/過關/);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w99:999-1')));
    assert.equal(stored.mask,teacher?2:3);assert.equal(stored.tries[0],teacher?3:6);
    await page.evaluate(()=>APP.load(1));
    assert.match(await page.locator('#streak').innerText(),/累積答對 0\/2/);
    assert.doesNotMatch(await page.locator('#main').innerText(),/連續/);
    assert.equal(await page.locator('.question-changed').count(),0,'跨關不比對');
  }
});

test('送出換題捲至任務說明；遵守 reduced motion；過關、首次及手動換關不捲',async t=>{
  for(const reduced of [false,true]){
    const page=await setup(t,{reduced});
    assert.equal(await page.evaluate(()=>scrolls.length),0);
    await page.evaluate(()=>document.getElementById('b-send').click());
    await page.evaluate(()=>{reply=false;document.getElementById('b-send').click()});
    const scrolls=await page.evaluate(()=>window.scrolls);
    assert.deepEqual(scrolls,Array(2).fill({id:'task-instructions',behavior:reduced?'auto':'smooth',block:'start'}));
    await page.evaluate(()=>{reply=true;document.getElementById('b-send').click();APP.load(1)});
    assert.equal(await page.evaluate(()=>scrolls.length),2);
  }
});

test('共用數字比對：只標示變值，保留 DOM 事件，兩秒淡出且手機不溢出',async t=>{
  const page=await setup(t);
  await page.evaluate(()=>document.getElementById('b-send').click());
  assert.deepEqual(await page.locator('#says .question-changed').allTextContents(),['2','2.5']);
  assert.deepEqual(await page.locator('#stage .question-changed').allTextContents(),['2']);
  await page.locator('#stage button').click();assert.equal(await page.evaluate(()=>clicked),true);
  assert.equal(await page.locator('.question-changed').first().evaluate(el=>getComputedStyle(el).animationDuration),'2s');
  await page.waitForTimeout(2100);
  assert.equal(await page.locator('.question-changed').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('u2-03 實際頁面：生日、八燈目標與最大值換題標示，目標卡與說明皆生效',async t=>{
  const page=await setup(t,{teacher:true,actual:true});
  for(const index of [0,2,3]){
    await page.evaluate(i=>{let draw=0;ROUNDS[i].gen=()=>{const n=++draw;return i===0?{who:'合成角色',t:3+n}:i===2?{t:130+n,why:'合成目標'}:{n:100+n,b:7,max:127,what:'合成編號'}};APP.load(i)},index);
    const first=await page.evaluate(()=>JSON.stringify(APP.inst));
    await page.evaluate(()=>{APP.handle.fill();document.getElementById('b-send').click()});
    assert.notEqual(await page.evaluate(()=>JSON.stringify(APP.inst)),first);
    assert.ok(await page.locator('#says .question-changed').count()>0);
    assert.ok(await page.locator('.target-content .question-changed').count()>0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
});
