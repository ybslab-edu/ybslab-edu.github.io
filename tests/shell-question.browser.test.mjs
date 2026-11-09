// 真實 DOM、合成題目與本機存檔；不載入登入或任何網路服務。
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let browser;
before(async()=>{browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
async function setup(t,{teacher=false,reduced=false,actual=false,mask=2}={}){
  const page=await browser.newPage({viewport:{width:390,height:700},reducedMotion:reduced?'reduce':'no-preference'});
  t.after(()=>page.close());
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('http://synthetic.test/');
  await page.addStyleTag({content:read('assets/shell.css')});
  if(actual)for(const [,content] of read('115-g9/u2-03/index.html').matchAll(/<style>([\s\S]*?)<\/style>/g))await page.addStyleTag({content});
  await page.evaluate(({teacher,mask})=>{
    window.TEACHER={remembered:()=>teacher,remember(){}};
    window.scrolls=[];
    const scroll=Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,...options});scroll.call(this,options)};
    localStorage.setItem('it9:w99:999-1',JSON.stringify({mask,tries:[3,4,0,0,0,0],time:1}));
  },{teacher,mask});
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
    if(!teacher)assert.match(await page.locator('#rounds button.passed').innerText(),/合成關2 ✓/);
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

test('u2-03 實際頁面：生日、八燈、最少燈數與容量換題標示，目標卡與說明皆生效',async t=>{
  const page=await setup(t,{teacher:true,actual:true});
  for(const index of [0,2,3,4]){
    await page.evaluate(i=>{
      APP.load(i===0?1:0); // 跨關清除前題，避免初始隨機題影響合成抽題次數。
      window.draws=0;
      ROUNDS[i].gen=()=>{
        const draw=++window.draws,n=draw<=3?1:2;
        return i===0?{who:'合成角色',t:3+n}:i===2?{t:130+n,why:'合成目標'}:i===3?{n:100+n,b:7,max:127,what:'合成編號'+draw}:{bits:8*n,kib:n,from:1,to:0,amount:n};
      };
      APP.load(i);
    },index);
    assert.equal(await page.evaluate(()=>window.draws),1);
    const first=await page.evaluate(()=>JSON.stringify(APP.inst));
    if(index>=3)assert.equal(await page.locator('#b-send').isDisabled(),true);
    await page.locator('#tb-ans').click();
    assert.equal(await page.locator('#b-send').isDisabled(),false,'教師顯示答案後必須啟用送出');
    await page.evaluate(()=>document.getElementById('b-send').click());
    assert.equal(await page.locator('#verdict').isVisible(),true);
    assert.match(await page.locator('#streak').innerText(),/累積答對 1\/2/);
    assert.notEqual(await page.evaluate(()=>JSON.stringify(APP.inst)),first);
    assert.equal(await page.evaluate(()=>window.draws),4,'同題與僅情境不同的計算題皆須重抽，採用第一個不同題');
    assert.ok(await page.locator('#says .question-changed').count()>0);
    assert.ok(await page.locator('.target-content .question-changed').count()>0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
});

const contrast=(a,b)=>{
  const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};
test('過關按鈕深淺色 AA、選中外框；上傳旁分數在桌面及手機可換行且不重疊',async t=>{
  for(const theme of ['light','dark'])for(const width of [1280,390]){
    const page=await setup(t);
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme=>{
      document.documentElement.dataset.theme=theme;
      const sync=document.getElementById('sync2');sync.hidden=false;sync.textContent='✓ 紀錄已上傳給老師';
    },theme);
    assert.equal(await page.locator('#prog').count(),0);
    assert.doesNotMatch(await page.locator('#main').innerText(),/我的過關進度|滿分 100|每少過一關/);
    assert.equal(await page.locator('header #score').count(),0);
    assert.equal(await page.locator('.report-status > #score').count(),1);
    assert.equal(await page.locator('#score-value').textContent(),'90');
    await page.evaluate(()=>{document.getElementById('b-send').click();document.getElementById('b-send').click();APP.load(1)});
    assert.equal(await page.locator('#score-value').textContent(),'100');
    assert.equal(await page.locator('#rounds button.passed').count(),2);
    // 選中與鍵盤焦點是獨立狀態；先移除殘留焦點，再檢查選中外框。
    await page.evaluate(()=>document.activeElement?.blur());
    const styles=await page.locator('#rounds button').evaluateAll(buttons=>buttons.map(el=>{
      const s=getComputedStyle(el),mark=getComputedStyle(el.querySelector('.done'));
      return {color:s.color,bg:s.backgroundColor,mark:mark.color,outline:s.outlineWidth,outlineStyle:s.outlineStyle,selected:el.getAttribute('aria-pressed'),focused:el.matches(':focus'),text:el.textContent};
    }));
    for(const s of styles){assert.match(s.text,/已過關/);assert.match(s.text,/✓/);assert.ok(contrast(s.color,s.bg)>=4.5);assert.ok(contrast(s.mark,s.bg)>=4.5)}
    assert.equal(styles[0].selected,'false');assert.equal(styles[0].focused,false);assert.equal(styles[1].focused,false);
    // Chromium 在 outline-style:none 時仍可能回報 medium（3px）；以樣式判斷是否繪製外框。
    assert.equal(styles[1].selected,'true');assert.equal(styles[1].outline,'2px');assert.equal(styles[1].outlineStyle,'solid');assert.equal(styles[0].outlineStyle,'none');
    // 用鍵盤移回未選中的關卡，仍須顯示可見焦點框。
    await page.locator('#rounds button').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const focus=await page.locator('#rounds button').first().evaluate(el=>({
      selected:el.getAttribute('aria-pressed'),visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineWidth
    }));
    assert.deepEqual(focus,{selected:'false',visible:true,outline:'3px'});
    const layout=await page.locator('.report-status').evaluate(el=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
      return {sync:rect(el.querySelector('#sync2')),score:rect(el.querySelector('#score')),width:document.documentElement.scrollWidth};
    });
    assert.ok(layout.score.left>=layout.sync.right||layout.score.top>=layout.sync.bottom);
    if(width===1280)assert.ok(layout.score.left>=layout.sync.right,'桌面分數在上傳狀態右側');
    assert.ok(layout.width<=width);assert.ok(layout.score.right<=width);
  }
});

for(const width of [1280,390])for(const teacher of [false,true])test(`分數真實可見性與截圖：${width}px，${teacher?'教師':'學生'}，零關及部分過關`,async t=>{
  const page=await setup(t,{teacher,mask:0});
  await page.setViewportSize({width,height:1000});
  for(const passed of [0,1]){
    if(passed)await page.evaluate(()=>{document.getElementById('b-send').click();document.getElementById('b-send').click()});
    assert.equal(await page.locator('#score').isVisible(),true);
    assert.equal(await page.locator('#score-value').textContent(),passed&&!teacher?'90':'0');
    assert.equal(await page.locator('#rep-note').isVisible(),!teacher);
    if(passed)assert.match(await page.locator('#verdict').innerText(),/過關/);
    if(passed&&!teacher){
      assert.equal(await page.getByRole('button',{name:'合成關1 已過關',exact:true}).count(),1);
      assert.equal(await page.locator('#rounds .done').getAttribute('aria-hidden'),'true');
      const hidden=await page.locator('#rounds .shell-sr-only').evaluate(el=>({width:el.offsetWidth,height:el.offsetHeight,clip:getComputedStyle(el).clipPath}));
      assert.deepEqual(hidden,{width:1,height:1,clip:'inset(50%)'});
    }
    if(teacher){
      assert.equal(await page.locator('#rounds button.passed').count(),0,'教師示範不記錄過關');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w99:999-1')).mask),0,'教師示範不寫入學生進度');
    }
    await page.screenshot({path:new URL(`../.shots/ybs-progress-${width}-${teacher?'teacher':'student'}-${passed}.png`,import.meta.url).pathname,fullPage:true});
  }
  if(teacher){
    await page.click('#b-swap');
    // 此合成頁未載入 login.js；沿用 setup 的班座進場方式，只驗證退出示範後的顯示。
    await page.evaluate(()=>{document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click()});
    assert.equal(await page.locator('#score').isVisible(),true);
    assert.equal(await page.locator('#rep-note').isVisible(),true,'退出教師模式後恢復上傳說明');
  }
});
