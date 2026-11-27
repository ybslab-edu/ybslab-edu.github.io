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

test('數值、ISO 時區與 Timestamp 的準時窗皆含兩端；Worker 只採完成時間與快照',()=>{
  const formats=[n=>n,n=>new Date(n).toISOString(),n=>new Date(n+8*36e5).toISOString().replace('Z','+08:00'),n=>({toMillis:()=>n})];
  for(const worker of [false,true])for(const encodeOpen of formats)for(const encodeTime of formats){
    for(const [delta,bonus] of [[-1,0],[0,5],[7*day,5],[7*day+1,0]]){
      const at=encodeTime(open+delta),openedAt=encodeOpen(open);
      const r=worker?record({completedAt:at,xpPolicySnapshot:{openedAt},at:open+8*day,passedAt:open+8*day}):record({at});
      const result=xp.calculate([activity({openedAt:worker?open+8*day:openedAt})],[r],{worker});
      assert.equal(result.activities[0].rounds[0].onTimeXP,bonus);
      if(worker)assert.equal(result.activities[0].rounds[0].onTimeState,'confirmed');
    }
  }
});
test('非法時間不給準時；學生端回退 passedAt，Worker 維持 unknown 與舊紀錄規則',()=>{
  const invalid=[undefined,null,NaN,Infinity,-Infinity,0,-1,8.64e15+1,1e100,true,false,{},[],
    '', 'bad','0','123','2026-11-01','2026-11-01T15:59:00','2026/11/01 15:59:00',
    '2026-02-30T15:59:00Z','2026-02-29T15:59:00Z','2026-04-31T23:59:00+08:00',
    '2026-13-01T15:59:00Z','2026-11-01T25:00:00Z',
    {toMillis:()=>NaN},{toMillis:()=>8.64e15+1},{toMillis:()=>String(open)},
    {toMillis:()=>{throw new RangeError('synthetic-invalid-timestamp')}}];
  for(const at of invalid){
    assert.equal(xp.calculate([activity()],[record({at})]).totalXP,10);
    assert.equal(xp.calculate([activity()],[record({at,passedAt:open})]).totalXP,15);
    assert.equal(xp.calculate([activity()],[record({passedAt:at})]).totalXP,10);
    assert.equal(xp.calculate([activity({openedAt:at})],[record({at:open})]).totalXP,10);
    const r=record({completedAt:at,xpPolicySnapshot:{openedAt:open},at:open,passedAt:open});
    const current=xp.calculate([activity()],[r],{worker:true}).activities[0].rounds[0];
    assert.equal(current.totalXP,10);assert.equal(current.onTimeState,'unknown');
    const legacy=xp.calculate([activity()],[{...r,source:'legacy-unverified'}],{worker:true}).activities[0].rounds[0];
    assert.equal(legacy.totalXP,10);assert.equal(legacy.onTimeState,'confirmed');
    const missingOpen=xp.calculate([activity()],[{...r,completedAt:open,xpPolicySnapshot:{openedAt:at}}],{worker:true}).activities[0].rounds[0];
    assert.equal(missingOpen.totalXP,10);assert.equal(missingOpen.onTimeState,'unknown');
  }
});
test('不存在的日期不得滾動成有效日期；合法閏日、跨日時差與日期上限仍有效',()=>{
  for(const [at,openedAt] of [
    ['2026-02-30T15:59:00Z','2026-03-02T15:59:00Z'],
    ['2026-02-29T15:59:00Z','2026-03-01T15:59:00Z'],
    ['2026-04-31T23:59:00+08:00','2026-05-01T15:59:00Z']
  ]){
    assert.equal(xp.calculate([activity({openedAt:Date.parse(openedAt)})],[record({at})]).totalXP,10);
    assert.equal(xp.calculate([activity({openedAt:at})],[record({at:Date.parse(openedAt)})]).totalXP,10);
  }
  for(const [at,openedAt] of [
    ['2028-02-29T23:59:00+08:00','2028-02-29T15:59:00Z'],
    ['2028-03-01T00:00:00+08:00','2028-02-29T16:00:00Z'],
    [8.64e15,8.64e15],['+275760-09-13T00:00:00.000Z',8.64e15]
  ])assert.equal(xp.calculate([activity({openedAt})],[record({at})]).totalXP,15);
  assert.equal(xp.calculate([activity({openedAt:1e100})],[record({at:1e100})]).totalXP,10);
});
test('重複紀錄調換順序不改首次加成；無效時間優先、有效回退仍可比較',()=>{
  const permutations=items=>items.length?items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest])):[[]];
  for(const worker of [false,true]){
    const timed=at=>record(worker?{completedAt:at,xpPolicySnapshot:{openedAt:open}}:{at});
    for(const [records,total] of [
      [[timed(open),timed(open+7*day),timed(open+7*day+1)],15],
      [[timed(open-1),timed(open),timed(open+7*day+1)],10],
      [[timed(open),timed('2026-02-30T15:59:00Z'),timed(open+7*day+1)],10],
      [[timed(open),timed(undefined),timed(open+7*day+1)],10]
    ])for(const order of permutations(records))assert.equal(xp.calculate([activity()],order,{worker}).totalXP,total);
  }
  const fallback=record({at:'2026-02-30T15:59:00Z',passedAt:open});
  for(const order of permutations([fallback,record({at:open+8*day}),record({at:open+1})])){
    assert.equal(xp.calculate([activity()],order).totalXP,15);
  }
});
test('跨 UTC、台灣與夏令時間時區，七天端點及非法日期計算一致',()=>{
  const openedAt=Date.UTC(2026,9,30,15,59),a=activity({openedAt});
  const times=[openedAt-1,openedAt,openedAt+7*day,openedAt+7*day+1,
    '2026-10-30T23:59:00+08:00','2026-10-30T15:59:00','2026-11-01','2026-10-32T15:59:00Z'];
  const previousTZ=process.env.TZ;
  try{
    for(const TZ of ['UTC','Asia/Taipei','America/New_York']){
      process.env.TZ=TZ;
      assert.deepEqual(times.map(at=>xp.calculate([a],[record({at})]).totalXP),[10,15,15,10,15,10,10,10],TZ);
    }
  }finally{
    if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ;
  }
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
