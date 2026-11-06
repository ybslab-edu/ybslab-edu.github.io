import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/teacher-export.mjs';
const activities={1:{title:'合成活動',rounds:['關一','關二']},9:{title:'另一活動',rounds:['關一']}};
const person=(email,cls=999,seat=1)=>({email,cls,seat});
const record=(email,tries,extra={})=>({email,uid:email,activity:1,round:0,tries,at:1,...extra});
function summarize(data){
  const h=setup();return JSON.parse(h.evaluate(`JSON.stringify(window.YBSItemHealth.summarize(${JSON.stringify({activities,...data})}))`));
}
test('0 人：各關仍顯示，率與次數無資料，不誤標紅；有名冊但無過關為 0%',()=>{
  const rows=summarize({});assert.equal(rows.length,3);
  for(const r of rows){assert.equal(r.total,0);assert.equal(r.passed,0);for(const k of ['rate','average','median','max'])assert.equal(r[k],null);assert.equal(r.lowRate,false);assert.equal(r.highTries,false);}
  const [r]=summarize({roster:[person('s1')]});assert.equal(r.rate,0);assert.equal(r.lowRate,true);assert.equal(r.average,null);
});
test('單人：過關只影響該活動該關，平均與中位數等於自身次數',()=>{
  const [r,next,other]=summarize({roster:[person('s1')],records:[record('s1',5)]});
  assert.equal(r.passed,1);assert.equal(r.total,1);assert.equal(r.rate,1);assert.equal(r.average,5);assert.equal(r.median,5);assert.equal(r.max,5);assert.equal(r.highTries,true);assert.equal(r.lowRate,false);
  assert.equal(next.passed,0);assert.equal(other.passed,0);
});
test('多班篩選、奇偶中位數、精確門檻 60% 與平均 4 不標紅',()=>{
  const roster=[person('a',998),person('b',998,2),person('c',999),person('d',999,2),person('e',999,3)];
  const records=[record('a',2),record('b',6),record('c',4)];
  const [all]=summarize({roster,records});assert.equal(all.total,5);assert.equal(all.passed,3);assert.equal(all.rate,.6);assert.equal(all.average,4);assert.equal(all.median,4);assert.equal(all.max,6);assert.equal(all.lowRate,false);assert.equal(all.highTries,false);
  const [one]=summarize({roster,records,cls:'998'});assert.equal(one.total,2);assert.equal(one.median,4);assert.equal(one.average,4);assert.equal(one.passed,2);
  const [two]=summarize({roster,records,cls:'999'});assert.equal(two.total,3);assert.equal(two.passed,1);assert.equal(two.lowRate,true);
  assert.equal(summarize({roster,records,cls:'997'})[0].total,0);
});
test('以名冊帳號去重、排除名冊外與異常值；同帳號不同 UID 取最後上傳且不受順序影響',()=>{
  const roster=[person('a'),person('a'),person('b',998),person('invalid',999,0)];
  const records=[record('a',2),record('a',7,{uid:'new',at:2}),record('b',4),record('outside',999),
    record('invalid',9),record('a',0,{at:3}),record('a',1000,{at:4}),record('a',2,{round:8}),record('a',3,{activity:99}),record('a',2,{at:0})];
  const [r]=summarize({roster,records});assert.equal(r.total,2);assert.equal(r.passed,2);assert.equal(r.average,5.5);assert.equal(r.median,5.5);assert.equal(r.max,7);
  assert.deepEqual(summarize({roster,records}),summarize({roster,records:[...records].reverse()}));
});
