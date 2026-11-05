import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup(dir){
  const body=new Element('body');
  const context=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},TEACHER:{remembered:()=>true,remember(){}}});
  const run=s=>vm.runInContext(s,context,{timeout:1000});
  run(read('assets/shell.js')+'\n'+[...read(`115-g9/${dir}/index.html`).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,body,get:id=>body.querySelector('#'+id)};
}
test('u2-04 文字與編碼兩關：即時差異、教師答案、送出換題與原判定相容',()=>{
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
    assert.notEqual(h.run('JSON.stringify(APP.inst)'),previous);
    assert.match(h.get('streak').textContent,/累積答對 1\/2/);
    assert.match(h.body.querySelector('.compare-status').textContent,/尚未填入/);
    h.get('tb-ans').click();h.get('b-send').click();
    assert.match(h.get('verdict').textContent,/過關/);
  }
});
test('兩頁六個分類／選擇關保留原版面、提示與選項作答',()=>{
  for(const [dir,indices] of [['u2-04',[2,3]],['u2-05',[0,1,2,3]]]){
    const h=setup(dir);
    for(const index of indices){
      h.run(`APP.load(${index})`);
      assert.equal(h.body.querySelector('.compare'),null);
      assert.equal(h.run('ROUNDS[APP.ri].instruction'),undefined);
      assert.ok(h.body.querySelectorAll('.picks').length>0);
      assert.match(h.get('says').textContent,/現在.*要做到.*提示/);
      h.get('tb-ans').click();
      assert.equal(h.run('ROUNDS[APP.ri].check(APP.inst,APP.handle.get())'),true);
    }
  }
});
