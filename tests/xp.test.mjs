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
