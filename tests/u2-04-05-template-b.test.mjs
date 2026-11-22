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

test('u2-05 八版本：兩組最高者不同，expected 可由委託資料獨立推得',()=>{
  const h=setup('u2-05');
  for(let variant=0;variant<8;variant++)for(let round=0;round<4;round++){
    h.run(`globalThis.qTestInst=ROUNDS[${round}].gen(()=>${variant}/8)`);
    const i=JSON.parse(h.run('JSON.stringify(qTestInst)'));
    let answer;
    if(round===0){
      const jobs=['入口引導','遊戲體驗','舞台支援'];
      const counts=['國中組','高中組'].map(g=>jobs.map(j=>i.rows.filter(r=>r[0]===g&&r[1]===j).length));
      const winners=counts.map(c=>{assert.equal(c.filter(x=>x===Math.max(...c)).length,1);return jobs[c.indexOf(Math.max(...c))]});
      assert.notEqual(winners[0],winners[1]);
      answer=[...winners,counts[i.group][i.query],Math.abs(counts[0][i.query]-counts[1][i.query]),'資料','資訊','資訊'];
    }else if(round===1){
      const keep=i.fields.map(f=>['可到場時段','職務意願','緊急聯絡人及聯絡方式'].includes(f.name)||(f.name==='職務操作熟悉度'&&i.dataType.startsWith('職務')));
      answer=[i.audience,i.dataType,keep.filter(Boolean).length,...keep.map(x=>x?'該收':'不該收'),'告知','同意','限制蒐集'];
    }else if(round===2){
      answer=['告知與同意','提交表單',i.parent,'志工安排','簡答','選擇題','核取方塊','線性刻度','單選方格',3+Number(i.questions[3].required)+Number(i.questions[4].required)];
    }else{
      answer=['可用主題設定完成','可用主題設定完成','需改用其他方式','作答者連結','連結至試算表',i.rows.reduce((n,r)=>n+Number(r[1]===i.job&&r[2]===i.slot),0),'不會'];
      assert.ok(i.rows.some(r=>r[1]===i.job&&r[2]!==i.slot),'只比職務會誤算');
      assert.ok(i.rows.some(r=>r[1]!==i.job&&r[2]===i.slot),'只比時段會誤算');
    }
    assert.equal(h.run(`ROUNDS[${round}].check(qTestInst,${JSON.stringify(answer)})`),true);
    for(let k=0;k<answer.length;k++){
      const bad=[...answer];bad[k]=typeof bad[k]==='number'?bad[k]+1:'不符需求';
      const hint=h.run(`ROUNDS[${round}].check(qTestInst,${JSON.stringify(bad)})`);
      assert.equal(typeof hint,'string');assert.ok(hint.length>5);
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

test('u2-05 ID 與索引不變，說明移除內部備註並保留素材機制',()=>{
  const h=setup('u2-05'),html=read('115-g9/u2-05/index.html');
  assert.match(html,/week:7,termWeek:13/);
  assert.equal(h.run('ROUNDS.length'),4);
  assert.doesNotMatch(html,/虛構|示意|後援會|2-13|前測|半成品|巡堂|待確認/);
  assert.match(html,/每關答對兩組不同資料才完成；答錯可修正，不扣分/);
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
