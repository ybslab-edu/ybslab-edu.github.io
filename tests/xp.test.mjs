import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const xp=vm.runInNewContext(read('assets/xp.js')+';YBSXP');
const open=Date.UTC(2026,10,1,15,59), day=864e5;
const activity=(extra={})=>({course:'115-g9',week:1,rounds:['甲','乙'],codes:['資A-IV-1','資P-IV-1','資A-IV-2'],openedAt:open,isOpen:true,...extra});
const record=(extra={})=>({course:'115-g9',activity:1,round:0,...extra});
test('重複過關只計首次；不修改輸入；全過加成一次',()=>{
  const a=[activity()],r=[record({passedAt:open+1}),record({passedAt:open+2}),record({round:1})];
  const before=JSON.stringify([a,r]),result=xp.calculate(a,r);
  assert.equal(result.totalXP,45);
  assert.equal(result.activities[0].completeXP,20);assert.equal(JSON.stringify([a,r]),before);
  assert.equal(xp.calculate([...a,...a],r).totalXP,45);
});
test('無時間不給準時；作答次數不影響 XP',()=>{
  for(const r of [record(),record({tries:2}),record({passedAt:null})]){
    const result=xp.calculate([activity()],[r]);assert.equal(result.totalXP,10);
    assert.equal(result.activities[0].rounds[0].onTimeXP,0);
  }
});
test('準時以共用開放時刻為起點，含 7 天邊界；不接受提前、未知或過期時間',()=>{
  for(const [at,bonus] of [[open-1,0],[open,5],[open+7*day,5],[open+7*day+1,0],[NaN,0],['bad',0]]){
    assert.equal(xp.calculate([activity()],[record({passedAt:at})]).activities[0].rounds[0].onTimeXP,bonus);
  }
  assert.equal(xp.calculate([activity({openedAt:undefined})],[record({passedAt:open})]).totalXP,10);
  assert.equal(xp.calculate([activity()],[record({passedAt:{toMillis:()=>open}})]).totalXP,15);
});
test('等級門檻每級前一點、恰到、下一點；最高等級與空資料',()=>{
  assert.equal(xp.calculate([],[]).level,1);assert.equal(xp.levelOf(0).remaining,129);
  for(let level=2;level<=10;level++){
    const at=xp.threshold(level);
    assert.equal(xp.levelOf(at-1).level,level-1);assert.equal(xp.levelOf(at).level,level);
    assert.equal(xp.levelOf(at+1).level,level);assert.equal(xp.levelOf(at).title,xp.TITLES[level-1]);
  }
  assert.equal(xp.levelOf(99999).remaining,0);assert.equal(xp.levelOf(99999).progress,1);
  const activities=vm.runInNewContext(read('assets/activities.js')+';ACTIVITIES').filter(a=>a.course==='115-g9');
  const all=activities.map(a=>({...a,openedAt:open}));
  const records=all.flatMap(a=>a.rounds.map((_,round)=>record({activity:a.week,round,passedAt:open})));
  const full=xp.calculate(all,records);
  assert.equal(full.totalXP,2415);assert.equal(full.level,10);assert.equal(xp.threshold(10),2365);
  assert.equal(xp.calculate(all,records.map(({passedAt,...r})=>r)).totalXP,1810);
});
test('六大主題探索度分母含未開放；同主題不重算；多軸與已開放完成率',()=>{
  const result=xp.calculate([activity(),activity({week:2,isOpen:false})],[record()]);
  for(const id of ['A','P']){
    const axis=result.exploration.find(a=>a.id===id);
    assert.equal(axis.total,4);assert.equal(axis.value,.25);assert.equal(axis.openValue,.5);
  }
  assert.equal(result.exploration.length,6);assert.equal(result.exploration.find(a=>a.id==='H').value,0);
  assert.equal(xp.calculate([activity()],[record({activity:99}),record({round:9}),record({course:'other'})]).totalXP,0);
});

test('離線補傳優先採有效 at；舊紀錄或無效 at 回退 passedAt',()=>{
  for(const at of [open,new Date(open).toISOString(),{toMillis:()=>open}]){
    assert.equal(xp.calculate([activity()],[record({at,passedAt:open+8*day})]).totalXP,15);
  }
  assert.equal(xp.calculate([activity()],[record({at:open+8*day,passedAt:open})]).totalXP,10);
  for(const at of [undefined,null,'bad',0,NaN]){
    assert.equal(xp.calculate([activity()],[record({at,passedAt:open})]).totalXP,15);
  }
  assert.equal(xp.calculate([activity()],[record({at:open})]).totalXP,15);
});
test('重複紀錄依有效作答時間選首次；未知時間仍不補發準時加成',()=>{
  const early=record({at:open,passedAt:open+9*day});
  const late=record({at:open+8*day,passedAt:open+8*day});
  for(const records of [[early,late],[late,early]])assert.equal(xp.calculate([activity()],records).totalXP,15);
  for(const records of [[early,record()],[record(),early]])assert.equal(xp.calculate([activity()],records).totalXP,10);
});

test('路線依日期排序；走過站實心，完整、部分、開放及未開放各自判定',()=>{
  const activities=[activity({week:9,date:'2026-12-01',isOpen:false}),
    activity({week:3,date:'2026-10-02'}),activity({week:7,date:'2026-10-03'}),
    activity({week:4,date:'2026-10-01'})];
  const records=[record({activity:4}),record({activity:4,round:1}),record({activity:3})];
  const before=JSON.stringify([activities,records]), result=xp.journey(activities,records);
  assert.deepEqual(Array.from(result.stations,a=>a.activity),[4,3,7,9]);
  assert.deepEqual(Array.from(result.stations,a=>a.state),['complete','in-progress','available','upcoming']);
  assert.deepEqual(Array.from(result.stations,a=>a.visited),[true,true,false,false]);
  assert.equal(JSON.stringify([activities,records]),before);
});
test('徽章僅給非空且全過的活動；重複、錯課程、越界紀錄都不能補滿',()=>{
  const activities=[activity(),activity({week:2}),activity({week:3,rounds:[]})];
  const result=xp.journey(activities,[record(),record(),record({round:1}),record({activity:2}),
    record({activity:2,round:2}),record({activity:2,round:1,course:'other'})]);
  assert.deepEqual(Array.from(result.badges,a=>a.activity),[1]);
  assert.equal(xp.journey(activities,[]).badges.length,0);
});
test('零關主題與尚未開放主題的完成率為有限的 0',()=>{
  const result=xp.journey([activity({isOpen:false})],[record()]);
  for(const axis of result.exploration){
    assert.equal(axis.openTotal,0);assert.equal(axis.openValue,0);
    assert.ok(Number.isFinite(axis.value));
    if(!['A','P'].includes(axis.id)){assert.equal(axis.total,0);assert.equal(axis.value,0)}
  }
});
