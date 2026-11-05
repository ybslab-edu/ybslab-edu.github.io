import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=[...read('115-g9/u2-03/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup(){
  const body=new Element('body');
  const context=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},TEACHER:{remembered:()=>true,remember(){}}});
  vm.runInContext(read('assets/shell.js')+'\n'+script,context);
  const run=s=>vm.runInContext(s,context);
  return {run,body,round:run('ROUNDS[4]'),get:id=>body.querySelector('#'+id)};
}
function random(seed){let state=seed;return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}}
// 獨立以各單位的位元組數驗算，不呼叫頁面的答案函式。
const answer=i=>({bytes:i.bits/8,kibBytes:i.kib*2**10,capacity:i.amount*[1000,1000000,1000000000][i.from]/[1000,1000000,1000000000][i.to]});
test('第 5 關登記、兩組確認與 KiB／十進位口徑',()=>{
  const h=setup(),rounds=h.run('ROUNDS');
  assert.equal(rounds.length,5);assert.equal(h.round.name,'燈牌要幾個位元組');
  assert.equal(h.round.confirmations,undefined);
  for(const path of ['assets/activities.json']){
    const data=JSON.parse(read(path));
    assert.deepEqual(data.activities.find(a=>a.course==='115-g9'&&a.week===5).rounds,Array.from(rounds,r=>r.name));
  }
  assert.match(h.round.tip,/2 的 10 次方＝1024/);
  assert.match(h.round.tip,/1 KB＝1000 位元組、1 MB＝1000 KB、1 GB＝1000 MB/);
});
test('1000 種子產題有解、有界，涵蓋全部六種容量換算，逐欄錯答有提示',()=>{
  const {round}=setup(),directions=new Set(),questions=new Set();
  for(let seed=1;seed<=1000;seed++){
    const rnd=random(seed);let draws=0;
    // 暖機避免小種子的第一個 xorshift 值偏小。
    for(let n=0;n<8;n++)rnd();
    const i=round.gen(()=>{assert.ok(++draws<=10,'產題應有界');return rnd()}),a=answer(i);
    directions.add(i.from+':'+i.to);questions.add(JSON.stringify(i));
    assert.ok(i.bits>=8&&i.bits<=256&&i.bits%8===0);
    assert.ok(i.kib>=1&&i.kib<=8);assert.notEqual(i.from,i.to);
    assert.ok(Object.values(a).every(Number.isSafeInteger));
    assert.equal(round.check(i,a),true);
    for(const key of Object.keys(a))for(const wrong of [null,NaN,-1,a[key]+1]){
      const result=round.check(i,{...a,[key]:wrong});assert.equal(typeof result,'string');assert.ok(result.length>10);
    }
    assert.match(round.check(i,{...a,kibBytes:i.kib*1000}),/KiB.*1024/);
    assert.match(round.check(i,{...a,capacity:i.amount*1024**(i.from-i.to)}),/每級用 1000/);
    assert.match(round.goal(i),/此題每級用 1000/);
  }
  assert.equal(directions.size,6);assert.ok(questions.size>900);
  for(const value of [0,.5,.999999])assert.equal(round.check(round.gen(()=>value),answer(round.gen(()=>value))),true);
});
test('8 顆燈等於一位元組、1 KiB 等於 1024 位元組；六種方向獨立範例',()=>{
  const {round}=setup();
  for(const [from,to,amount,result] of [[0,1,3000,3],[1,0,3,3000],[1,2,4000,4],[2,1,4,4000],[0,2,5000000,5],[2,0,5,5000000]]){
    const i={bits:8,kib:1,from,to,amount};
    assert.equal(round.check(i,{bytes:1,kibBytes:1024,capacity:result}),true);
  }
});
test('實際模板 B：輸入即時更新、教師顯示答案、答錯保留累積、兩組不同資料才過關',()=>{
  const h=setup();
  h.run('APP.load(4)');
  assert.equal(h.body.querySelector('.compare-target h3').textContent,'目標');
  assert.equal(h.body.querySelector('.compare-mine h3').textContent,'我的');
  assert.equal(h.run('APP.handle.ready()'),false);
  assert.equal(h.get('b-send').disabled,true);
  h.get('cap-bytes').value='0';h.get('cap-bytes').oninput();
  assert.match(h.body.querySelector('.compare-status').textContent,/尚未填入/);
  h.get('tb-ans').click();
  assert.equal(h.run('APP.handle.ready()'),true);assert.equal(h.get('b-send').disabled,false);
  assert.doesNotMatch(h.body.querySelector('.compare-status').textContent,/尚未填入/);
  const first=h.run('JSON.stringify(APP.inst)');
  h.get('b-send').click();assert.match(h.get('streak').textContent,/累積答對 1\/2/);
  assert.notEqual(h.run('JSON.stringify(APP.inst)'),first);
  h.get('tb-ans').click();h.get('cap-kibBytes').value='1000';h.get('cap-kibBytes').oninput();
  h.get('b-send').click();assert.match(h.get('streak').textContent,/累積答對 1\/2/);
  assert.match(h.get('verdict').textContent,/KiB.*1024/);
  h.get('tb-ans').click();h.get('b-send').click();
  assert.match(h.get('streak').textContent,/累積答對 2\/2/);assert.match(h.get('verdict').textContent,/過關/);
});
