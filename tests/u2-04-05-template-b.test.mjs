import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup(dir,{teacher=true,stored=new Map()}={}){
  const body=new Element('body');
  const context=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},TEACHER:{remembered:()=>teacher,remember(){}}});
  const run=s=>vm.runInContext(s,context,{timeout:1000});
  run(read('assets/shell.js')+'\n'+[...read(`115-g9/${dir}/index.html`).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,body,get:id=>body.querySelector('#'+id)};
}
test('u2-04 文字與編碼兩關：即時差異、教師答案、下一組換題與原判定相容',()=>{
  const h=setup('u2-04');
  for(const index of [0,1]){
    h.run(`APP.load(${index})`);
    assert.equal(h.body.querySelector('.compare-target h3').textContent,'目標');
    assert.equal(h.body.querySelector('.compare-mine h3').textContent,'我的');
    assert.equal(h.body.querySelectorAll('.table').length,1);
    assert.equal(h.body.querySelector('.compare-target .table')!==null,true);
    assert.match(h.body.querySelector('.compare-status').textContent,/尚未填入/);
    assert.equal(h.get('b-send').disabled,true);
    h.get('tb-ans').click();
    assert.equal(h.body.querySelector('.compare-status').textContent,'與目標相同');
    assert.equal(h.get('b-send').disabled,false);
    const input=h.get(index===0?'t-w':'t-c');
    input.value=index===0?'WRONG':'0';input.oninput();
    assert.match(h.body.querySelector('.compare-status').textContent,/與目標相差/);
    assert.equal(h.run('ROUNDS[APP.ri].check(APP.inst,APP.handle.get())===true'),false);
    input.value=index===0?h.run('APP.inst.w.toLowerCase().replace(/ /g,"   ")'):h.run('codesOf(APP.inst.w).join("，")');
    input.oninput();
    assert.equal(h.body.querySelector('.compare-status').textContent,'與目標相同');
    assert.equal(h.run('ROUNDS[APP.ri].check(APP.inst,APP.handle.get())'),true);
    const previous=h.run('JSON.stringify(APP.inst)');
    h.get('b-send').click();
    assert.equal(h.run('JSON.stringify(APP.inst)'),previous);
    h.get('b-next-group').click();
    assert.notEqual(h.run('JSON.stringify(APP.inst)'),previous);
    assert.match(h.get('streak').textContent,/累積答對 1\/2/);
    assert.match(h.body.querySelector('.compare-status').textContent,/尚未填入/);
    h.get('tb-ans').click();h.get('b-send').click();
    assert.match(h.get('verdict').textContent,/過關/);
  }
});
test('u2-04 選擇關與 u2-05 四關保留提示、成果作答與教師填答',()=>{
  for(const [dir,indices] of [['u2-04',[2,3]],['u2-05',[0,1,2,3]]]){
    const h=setup(dir);
    for(const index of indices){
      h.run(`APP.load(${index})`);
      assert.equal(h.body.querySelector('.compare'),null);
      assert.equal(h.run('ROUNDS[APP.ri].instruction'),undefined);
      assert.ok(h.body.querySelectorAll(dir==='u2-05'?'.quest-answers':'.picks').length>0);
      assert.match(h.get('says').textContent,/現在.*要做到.*提示/);
      h.get('tb-ans').click();
      assert.equal(h.run('ROUNDS[APP.ri].check(APP.inst,APP.handle.get())'),true);
    }
  }
});


test('u2-05 全變體有解、逐項錯答被拒，內容不同且產題有界',()=>{
  const h=setup('u2-05');
  for(let round=0;round<4;round++){
    const contents=new Set();
    for(let variant=0;variant<8;variant++){
      h.run(`globalThis.qTestInst=ROUNDS[${round}].gen(()=>${variant}/8)`);
      const content=h.run('JSON.stringify({...qTestInst,t:undefined})');
      assert.ok(!contents.has(content),'版本必須有實質資料差異');contents.add(content);
      h.run(`globalThis.qTestEl=new (document.body.constructor)('div');globalThis.qTestHandle=ROUNDS[${round}].view(qTestInst,qTestEl,{changed(){}});qTestHandle.fill()`);
      assert.equal(h.run(`ROUNDS[${round}].check(qTestInst,qTestHandle.get())`),true);
      const count=h.run('qTestHandle.get().length');
      for(let k=0;k<count;k++)assert.notEqual(h.run(`(()=>{const a=qTestHandle.get();a[${k}]='錯答';return ROUNDS[${round}].check(qTestInst,a)})()`),true);
      for(const answer of ['[]','[true]','null'])assert.notEqual(h.run(`ROUNDS[${round}].check(qTestInst,${answer})`),true,'做完了或空值不能完成');
    }
    h.run(`ROUNDS[${round}].gen(()=>0)`);
  }
});

test('u2-05 第一關全部八個版本最多人選的項目皆唯一且判定正確',()=>{
  const h=setup('u2-05');
  const activities=['安可曲','燈牌展示','周邊攤位'];
  for(let variant=0;variant<8;variant++){
    h.run(`globalThis.qTestInst=ROUNDS[0].gen(()=>${variant}/8)`);
    const inst=JSON.parse(h.run('JSON.stringify(qTestInst)'));
    assert.equal(inst.t,'1-'+(variant+1));
    const counts=activities.map(activity=>inst.rows.filter(row=>row===activity).length);
    const winners=activities.filter((_,index)=>counts[index]===Math.max(...counts));
    assert.equal(winners.length,1,`${inst.t} 不得並列最多：${counts}`);
    assert.ok(inst.rows.length>=6&&inst.rows.length<=10,'維持 6～10 筆示意回覆');
    const answer=[counts[inst.query],Math.max(...counts)-Math.min(...counts),winners[0],'資料','資訊'];
    for(const activity of activities){
      answer[2]=activity;
      assert.equal(h.run(`ROUNDS[0].check(qTestInst,${JSON.stringify(answer)})===true`),activity===winners[0],`${inst.t}：${activity}`);
    }
  }
});

test('u2-05 每關兩組、錯答可修正，答對原題與重送不能加計',()=>{
  const h=setup('u2-05');
  for(let round=0;round<4;round++){
    h.run(`APP.load(${round})`);
    assert.equal(h.get('b-send').disabled,true);
    h.get('tb-ans').click();
    const field=h.body.querySelector('[data-answer="0"]');
    field.value='999';field.oninput();h.get('b-send').click();
    assert.match(h.get('verdict').textContent,/還不對/);
    assert.match(h.get('streak').textContent,/0\/2/);
    h.get('tb-ans').click();h.get('b-send').click();h.get('b-send').click();
    assert.match(h.get('streak').textContent,/1\/2/);
    const previous=h.run('JSON.stringify({...APP.inst,t:undefined})');
    h.get('b-next-group').click();
    assert.notEqual(h.run('JSON.stringify({...APP.inst,t:undefined})'),previous);
    h.get('tb-ans').click();h.get('b-send').click();
    assert.match(h.get('verdict').textContent,/過關/);
  }
});

test('u2-05 ID、索引、前測順序、題面待確認與未操作提醒',()=>{
  const h=setup('u2-05'),html=read('115-g9/u2-05/index.html');
  assert.match(html,/week:7,termWeek:13/);
  assert.equal(h.run('ROUNDS.length'),4);
  assert.match(html,/先完成前測，再於課外看 2-13／2-14/);
  assert.match(html,/第 6 題.*題面待確認/);
  assert.match(html,/原第 1～4 關依序對應現在第 1～4 關/);
  for(let round=1;round<4;round++){
    h.run(`APP.load(${round})`);
    const b=h.body.querySelector('[data-fallback="use"]');b.click();
    assert.equal(h.body.querySelector('[data-fallback="material"]').hidden,false);
    assert.match(h.body.querySelector('[data-fallback="log"]').textContent,/未實際操作/);
    assert.equal(h.get('b-send').disabled,true,'使用素材不等於答對');
  }
});


test('u2-05 舊活動 7 的四位元完成紀錄直接保留，不把舊紀錄重算成新操作',()=>{
  const stored=new Map([['it9:w7:999-1',JSON.stringify({mask:15,tries:[2,3,2,4,0,0],time:1})]]);
  const h=setup('u2-05',{teacher:false,stored});
  h.get('in-cls').value='999';h.get('in-seat').value='1';
  h.get('g-next').click();h.get('g-go').click();
  assert.equal(h.get('main').hidden,false);
  assert.equal(h.get('rounds').querySelectorAll('.passed').length,4);
  assert.equal(JSON.parse(stored.get('it9:w7:999-1')).mask,15);
  assert.equal(stored.has('ybs:u2-05:fallback:v1'),false);
});
