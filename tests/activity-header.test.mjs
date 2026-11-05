import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('assets/shell.js');
const score=vm.runInNewContext(source+'\nshellScore');
for(const [total,expected] of [[4,[0,70,80,90,100]],[5,[0,60,70,80,90,100]],[6,[0,50,60,70,80,90,100]]]){
  test(`${total} 關：逐關計分`,()=>expected.forEach((value,passed)=>assert.equal(score(passed,total),value)));
}
function setup(){
  const body=new Element('body'),stored=new Map(),uploads=[];
  const c=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},YBS:{enabled:()=>true,button(){},status(){},guest(){},submit:x=>uploads.push(x),profile:()=>null}});
  const run=s=>vm.runInContext(s,c,{timeout:2000});
  const html=read('115-g9/u2-03/index.html');run(source+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  const el=id=>body.querySelector('#'+id);
  const start=seat=>{el('in-cls').value='999';el('in-seat').value=String(seat);el('g-go').click()};
  start(1);
  return {body,el,run,start,uploads};
}
test('標題、所有關卡、任意順序計分、重做不加分、還原／換人、雲端相容',()=>{
  const h=setup();
  assert.equal(h.body.querySelector('#main h1').textContent,'第 11 週｜燈牌只有亮和暗');
  assert.equal(h.el('unit'),null);assert.equal(h.el('tab-1'),null);
  assert.equal(h.el('rounds').querySelectorAll('button').length,5);
  const pass=i=>{h.run(`APP.load(${i})`);for(let n=0;n<2;n++){h.el('tb-ans').click();h.el('b-send').click()}};
  for(const [i,expected] of [[2,60],[0,70],[3,80],[2,80],[1,90],[4,100]]){
    pass(i);assert.equal(+h.el('score-value').textContent,expected);
    assert.match(h.el('rounds').querySelectorAll('button')[i].textContent,/✓/);
  }
  assert.equal(h.uploads[0].level,'進階');assert.equal(h.uploads[1].level,'基礎');
  assert.equal(h.uploads[0].activity,5);assert.equal(h.uploads[0].termWeek,11);
  assert.equal('score' in h.uploads[0],false);
  h.start(2);assert.equal(+h.el('score-value').textContent,0);
  h.start(1);assert.equal(+h.el('score-value').textContent,100);
});
test('示範頁五關都有比較卡，燈泡及輸入即時更新，原判定與兩組過關保留',()=>{
  const h=setup();
  for(let i=0;i<5;i++){
    h.run(`APP.load(${i})`);
    assert.equal(h.body.querySelector('.compare-target h3').textContent,'目標');
    assert.equal(h.body.querySelector('.compare-mine h3').textContent,'我的');
    assert.equal(h.el('says').querySelector('.tk'),null);
    if(i===0){h.body.querySelector('.my-controls button').click();assert.match(h.body.querySelector('.compare-status').textContent,/目前值：16；比目標/)}
    if(i===1){h.el('n-v').value='0';h.el('n-v').oninput();assert.match(h.body.querySelector('.compare-status').textContent,/目前值：0；比目標少/)}
    h.el('tb-ans').click();assert.equal(h.run('ROUNDS[APP.ri].check(APP.inst,APP.handle.get())'),true);
    h.el('b-send').click();assert.match(h.el('verdict').textContent,/再一組確認/);
    h.el('tb-ans').click();h.el('b-send').click();assert.match(h.el('verdict').textContent,/過關/);
    if(i===1){assert.equal(h.el('b-next').textContent,'下一關');h.el('b-next').click();assert.equal(h.run('APP.ri'),2)}
  }
});
test('未提供 termWeek 時以課程與活動 ID 找登記資料，使用 termWeekOf',()=>{
  const title=vm.runInNewContext(source+'\nshellTitle',{ACTIVITIES:[{course:'115-g9',week:5,date:'合成日期'}],termWeekOf:()=>11});
  assert.equal(title({course:'115-g9',week:5,title:'合成活動'}),'第 11 週｜合成活動');
});
