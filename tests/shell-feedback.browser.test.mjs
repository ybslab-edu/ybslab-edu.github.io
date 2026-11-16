// 本機 HTTP、合成題目；外部請求一律攔截，不載入登入或 Firebase。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
let server,browser,base;
before(async()=>{
  server=createServer((req,res)=>{
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="zh-Hant"><body></body></html>');
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok)});
  base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(ok=>server.close(ok))});
async function setup(t,options={}){
  const page=await browser.newPage({viewport:{width:390,height:700}});
  t.after(()=>page.close());
  await page.route('**/*',r=>r.request().url()===base+'/'?r.continue():r.abort());
  await page.goto(base+'/');
  await page.addStyleTag({content:read('assets/shell.css').replace(/@import[^;]+;/g,'')});
  await page.evaluate(()=>{
    window.TEACHER={remembered:()=>false};window.scrolls=[];
    Element.prototype.scrollIntoView=function(){scrolls.push(this.id)};
  });
  await page.addScriptTag({content:read('assets/shell.js')});
  await page.evaluate(options=>{
    let generation=0;
    window.checks=0;window.draws=0;
    window.APP=SHELL({week:99,title:'合成活動',rounds:[1,2].map(n=>({
      name:'合成關'+n,lv:1,...options,
      now:i=>'合成資料 '+i.n,goal:'答對兩組',tip:'合成方向',steps:'合成步驟',learn:'合成說明',
      gen:()=>{draws++;return {n:options.constant?1:++generation}},
      view:(i,el,api)=>{
        el.innerHTML='<label>合成答案<input id="answer"></label><button id="perform">演出</button>';
        const input=el.querySelector('input');input.oninput=api.changed;
        el.querySelector('button').onclick=()=>{api.attempt();input.value='正確';api.changed()};
        return {get:()=>({value:input.value}),ready:()=>input.value!=='',fill:()=>{input.value='正確'}};
      },
      check:(i,a)=>{checks++;return a.value==='正確'||'檢查合成答案';}
    }))});
    document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click();
  },options);
  return page;
}
const tries=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('it9:w99:999-1'))?.tries[0]??0);
test('連續五次輸入相同作答狀態只寫入 aria-live 一次',async t=>{
  const page=await setup(t);
  await page.fill('#answer','錯誤');await page.click('#b-send');
  const result=await page.evaluate(async()=>{
    const status=document.getElementById('answer-status'),writes=[];
    const observer=new MutationObserver(records=>writes.push(...records));
    observer.observe(status,{childList:true,characterData:true,subtree:true});
    const input=document.getElementById('answer');
    for(let i=1;i<=5;i++){
      input.value='修改'+i;input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    await Promise.resolve();observer.disconnect();
    return {writes:writes.length,text:status.textContent};
  });
  assert.deepEqual(result,{writes:1,text:'作答中'});
});
test('錯答留題與答案、修改才可重送、同題改對只算一組、下一組後過關及換關清除',async t=>{
  const page=await setup(t);
  const question=await page.locator('#says').innerText();
  assert.equal(await page.locator('#round-status').innerText(),'第 1 關／共 2 關．本關答對 0/2');
  for(const id of ['round-status','answer-status'])assert.equal(await page.locator('#'+id).getAttribute('aria-live'),'polite');
  assert.equal(await page.locator('#answer-status').innerText(),'作答中');
  await page.fill('#answer','錯誤');await page.click('#b-send');
  assert.equal(await page.inputValue('#answer'),'錯誤');
  assert.equal(await page.locator('#says').innerText(),question);
  assert.equal(await page.locator('#b-send').isDisabled(),true);
  assert.equal(await page.locator('#send-hint').innerText(),'先修改答案再送出');
  assert.equal(await page.locator('#answer-status').innerText(),'已送出：還不對');
  assert.match(await page.locator('#verdict').innerText(),/還不對.*檢查合成答案.*修改答案後再送一次/s);
  assert.match(await page.locator('#hint-content').innerText(),/第 1 層/);
  await page.evaluate(()=>document.getElementById('b-send').onclick());
  assert.equal(await tries(page),1,'同答案連直接呼叫都不重算');
  await page.fill('#answer','修改中');assert.equal(await page.locator('#b-send').isDisabled(),false);
  await page.fill('#answer','錯誤');assert.equal(await page.locator('#b-send').isDisabled(),true,'改回送出內容仍停用');
  await page.fill('#answer','正確');await page.click('#b-send');
  assert.equal(await tries(page),2,'每次有效送出照常記次');
  assert.equal(await page.locator('#answer-status').innerText(),'已送出：答對');
  assert.match(await page.locator('#verdict').innerText(),/答對了！累積答對 1\/2/);
  assert.match(await page.locator('#round-status').innerText(),/本關答對 1\/2/);
  assert.equal(await page.locator('#says').innerText(),question);
  assert.equal(await page.inputValue('#answer'),'正確');
  assert.equal(await page.locator('#b-next-group').isVisible(),true);
  await page.fill('#answer','其他');await page.evaluate(()=>document.getElementById('b-send').onclick());
  assert.equal(await page.evaluate(()=>checks),2,'已答對題無法再次判題');
  assert.deepEqual(await page.evaluate(()=>scrolls),[],'錯答與答對皆不捲動');
  await page.click('#b-next-group');
  assert.notEqual(await page.locator('#says').innerText(),question);
  assert.equal(await page.inputValue('#answer'),'');
  assert.equal(await page.locator('#answer-status').innerText(),'作答中');
  assert.equal(await page.locator('#verdict').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>scrolls),['task-instructions']);
  await page.fill('#answer','正確');await page.click('#b-send');
  assert.equal(await page.locator('#answer-status').innerText(),'過關');
  assert.match(await page.locator('#round-status').innerText(),/本關答對 2\/2/);
  assert.match(await page.locator('#verdict').innerText(),/過關！/);
  assert.equal(await tries(page),3);
  await page.click('#b-next');
  assert.equal(await page.locator('#round-status').innerText(),'第 2 關／共 2 關．本關答對 0/2');
  assert.equal(await page.locator('#answer-status').innerText(),'作答中');
  assert.equal(await page.locator('#send-hint').innerText(),'全部完成後才能送出。');
  assert.equal(await page.locator('#verdict').isVisible(),false);
  assert.equal(await page.locator('#b-next-group').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});
test('抽題 20 次仍同資料時，不會把同組計為第二組',async t=>{
  const page=await setup(t,{constant:true});
  await page.fill('#answer','正確');await page.click('#b-send');await page.click('#b-next-group');
  assert.equal(await page.evaluate(()=>draws),21,'單一題庫有重抽上限');
  await page.fill('#answer','正確');await page.click('#b-send');
  assert.match(await page.locator('#streak').innerText(),/累積答對 1\/2/);
  assert.equal(await page.locator('#verdict.ok').count(),0);
  assert.equal(await page.locator('#b-next-group').isVisible(),true);
});
test('manualAttempt 演出與 confirmations=1 保留原判題、記次與換題流程',async t=>{
  for(const options of [{manualAttempt:true,confirmations:1},{confirmations:1},{manualAttempt:true}]){
    const page=await setup(t,options);
    const first=await page.evaluate(()=>APP.inst.n);
    await page.fill('#answer','錯誤');await page.click('#b-send');
    assert.equal(await page.locator('#b-send').isDisabled(),!options.manualAttempt,'演出不鎖同答案；單次確認維持換題後 ready 限制');
    assert.equal(await page.evaluate(()=>APP.inst.n),options.manualAttempt?first:first+1);
    assert.equal(await tries(page),options.manualAttempt?0:1);
    if(options.manualAttempt){await page.click('#perform');assert.equal(await tries(page),1)}
    else await page.fill('#answer','正確');
    await page.click('#b-send');
    assert.equal(await tries(page),options.manualAttempt?1:2);
    if(options.confirmations===1)assert.match(await page.locator('#verdict').innerText(),/過關！/);
    else {assert.equal(await page.evaluate(()=>APP.inst.n),first+1);assert.match(await page.locator('#verdict').innerText(),/再一組確認/)}
  }
});
