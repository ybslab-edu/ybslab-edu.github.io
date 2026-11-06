import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const {summarize,exportRows} = createRequire(import.meta.url)('../assets/curriculum-report.js');
const activities = [
  {week:28,title:'合成活動甲',href:'115-g9/u1-03/',rounds:['甲','乙'],codes:['A','B']},
  {week:1,title:'合成活動乙',href:'115-g9/u1-05/',rounds:['甲'],codes:['A']},
  {week:3,title:'合成活動丙',href:'115-g9/u2-01/',rounds:['甲'],codes:['A','C']}
];
const items = ['A','B','C','D'].map(code => ({code,text:'合成項目'+code}));
const roster = [{email:'a@example.invalid',cls:999,seat:1},{email:'b@example.invalid',cls:'999',seat:2},{email:'c@example.invalid',cls:998,seat:1}];
const attempt = (email,uid,activity,round=0,extra={}) => ({email,uid,activity,round,id:`${uid}_${activity}_${round}`,level:1,tries:2,passedAt:1000,...extra});
const attempts = [attempt(roster[0].email,'a',28,0),attempt(roster[0].email,'a',28,1),attempt(roster[0].email,'a',1),attempt(roster[1].email,'b',28,0)];
const report = (extra={}) => summarize({activities,items,roster,attempts,isOpen:a=>a.week!==3,cls:'999',...extra});

test('課綱對應多活動與多代碼：活動序號不是日期週次；全關完成才過關；未開放不列分母',()=>{
  const r=report();assert.equal(r.total,2);assert.deepEqual(r.classes,[998,999]);
  assert.deepEqual(r.rows[0].activities.map(a=>a.week),[28,1,3]);
  assert.equal(r.rows[0].passed,1);assert.equal(r.rows[0].rate,.5);
  assert.equal(r.rows[1].rate,.5);assert.equal(r.rows[2].rate,null);
  assert.equal(r.rows[3].rate,null);assert.deepEqual(r.rows[3].activities,[]);
  assert.equal(r.rows[0].activities[2].open,false);assert.equal(r.rows[0].activities[2].rate,null);
  assert.equal(report({isOpen:()=>true}).rows[0].rate,0);
});
test('名冊含無紀錄者，篩選班級、全部班級、空名冊與無活動皆不產生 NaN',()=>{
  assert.equal(report({cls:''}).rows[0].rate,1/3);
  assert.equal(report({cls:'998'}).rows[0].rate,0);
  assert.equal(report({roster:[]}).rows[0].rate,null);
  assert.equal(report({attempts:[]}).rows[0].rate,0);
  assert.equal(report({activities:[]}).rows[0].rate,null);
  assert.equal(report({cls:'997'}).total,0);
});
test('不合併重複關卡、UID 或 email；忽略名冊外及格式錯誤紀錄',()=>{
  const first=attempts[0];
  const bad=[{...first,id:'bad'}, {...first,round:20}, {...first,level:3}, {...first,tries:0}, {...first,passedAt:NaN}, {...first,email:'outside@example.invalid'}, {...first,uid:''}, {...first,activity:88}];
  const r=report({attempts:[...attempts,...bad,first]});
  assert.equal(r.skipped,bad.length);assert.equal(r.rows[0].rate,.5);
  const conflict=report({attempts:[...attempts,attempt(roster[0].email,'other',1)]});
  assert.equal(conflict.conflicts,1);assert.equal(conflict.rows[0].rate,0);assert.equal(conflict.total,2);
  const shared=report({attempts:[...attempts,attempt(roster[1].email,'a',1)]});
  assert.equal(shared.conflicts,2);assert.equal(shared.rows[1].rate,0);
});
test('重複班座列為待核對且保留一人分母；無效名冊不計人數',()=>{
  const r=report({roster:[...roster,{email:'d@example.invalid',cls:999,seat:1},{email:'bad@example.invalid',cls:999,seat:61}]});
  assert.equal(r.total,2);assert.equal(r.conflicts,1);assert.equal(r.invalidRoster,1);assert.equal(r.rows[0].rate,0);
});
test('匯出保留無活動項目、未開放狀態、比率數值與快照；不含帳號、UID 或座號',()=>{
  const rows=exportRows(report(),'999','2026-11-05T00:00:00Z');
  assert.equal(rows.length,7);assert.equal(rows[1][6],.5);assert.equal(rows[3][9],'未開放');
  assert.equal(rows.at(-1)[8],'未安排活動');assert.equal(rows.at(-1)[6],null);
  assert.ok(!JSON.stringify(rows).includes('@example.invalid'));
  assert.equal(rows[1][12],'2026-11-05T00:00:00Z');
});
test('真實活動與課綱：僅 115-g9、全部國中項目、開放清單與台灣日期沿用共用函式',()=>{
  const ctx=vm.createContext({location:{pathname:'/115-g9/teacher/report/'}});
  for(const name of ['curriculum','activities','lock']) vm.runInContext(readFileSync(new URL(`../assets/${name}.js`,import.meta.url),'utf8'),ctx);
  ctx.summarize=summarize;
  const r=vm.runInContext(`summarize({activities:ACTIVITIES.filter(a=>a.course==='115-g9'),items:CURRICULA.find(c=>c.id==='jh').strands.flatMap(s=>s.items),roster:[],attempts:[],isOpen:a=>isActivityOpen(a,Date.parse('2026-11-05T00:00:00Z'))})`,ctx);
  assert.ok(r.rows.length>20);assert.ok(r.rows.some(r=>r.activities.some(a=>a.open)));
  assert.ok(r.rows.some(r=>r.activities.some(a=>!a.open)));
  assert.ok(r.rows.every(r=>r.activities.every(a=>a.href.startsWith('115-g9/'))));
});
