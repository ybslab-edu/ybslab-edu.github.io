import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {fakeCurriculumFirebase} from './fixtures/curriculum-firebase.mjs';
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

test('缺損名冊列與紀錄逐筆略過，不影響其他有效資料',()=>{
  const invalidPeople=[null,undefined,{},[],{...roster[0],email:0},{...roster[0],cls:null},{...roster[0],cls:{toString:()=> '999'}},
    {...roster[0],seat:Infinity},{...roster[0],seat:'1'}];
  const invalidAttempts=[null,undefined,{},[],...Object.keys(attempts[0]).map(key=>({...attempts[0],[key]:undefined}))];
  const r=report({roster:[...invalidPeople,...roster],attempts:[...invalidAttempts,...attempts]});
  assert.equal(r.invalidRoster,invalidPeople.length);assert.equal(r.skipped,invalidAttempts.length);
  assert.equal(r.total,2);assert.equal(r.rows[0].rate,.5);assert.equal(r.conflicts,0);
});
test('非有限數值、數字字串與越界欄位不當作有效過關',()=>{
  const bad=[];
  for(const field of ['activity','round','level','tries','passedAt'])for(const value of [NaN,Infinity,-Infinity,null,'1',1.5,{toString:null}]){
    if(field==='passedAt'&&value===1.5)continue; // 時間只要求正有限數值。
    bad.push({...attempts[0],[field]:value});
  }
  for(const [field,value] of [['round',-1],['round',2],['level',0],['level',3],['tries',0],['tries',1000],['passedAt',0],['passedAt',-1]])bad.push({...attempts[0],[field]:value});
  const r=report({attempts:bad});assert.equal(r.skipped,bad.length);assert.equal(r.rows[0].rate,0);
  const valid=report({attempts:[attempt(roster[0].email,'a',1,0,{level:2,tries:999,passedAt:1.5})]});
  assert.equal(valid.skipped,0);assert.equal(valid.rows[0].activities[1].rate,.5);
});
test('缺失或未載入的集合明確拒絕，合法空集合仍可計算',()=>{
  for(const field of ['activities','items','roster','attempts'])for(const value of [undefined,null,{},'']){
    assert.throws(()=>report({[field]:value}),{name:'TypeError',message:/Invalid curriculum report/});
  }
  for(const value of [undefined,null,{}])assert.throws(()=>summarize(value),{name:'TypeError',message:/Invalid curriculum report/});
  const r=report({activities:[],items:[],roster:[],attempts:[]});
  assert.deepEqual(r,{rows:[],total:0,classes:[],conflicts:0,invalidRoster:0,skipped:0});
  assert.equal(exportRows(r,'全部班級','synthetic').length,1);
});
test('不完整或重複活動設定停止報告，避免漏算活動與空關卡誤判完成',()=>{
  for(const value of [null,{}, {...activities[0],rounds:undefined},{...activities[0],rounds:[]},
    {...activities[0],rounds:'甲乙'},{...activities[0],codes:undefined},{...activities[0],codes:'A'},
    ...[undefined,NaN,Infinity,-Infinity,'28',0,1.5].map(week=>({...activities[0],week}))]){
    assert.throws(()=>report({activities:[value]}),{name:'TypeError',message:/Invalid curriculum report/});
  }
  assert.throws(()=>report({activities:[...activities,activities[0]]}),{name:'TypeError',message:/Invalid curriculum report/});
  for(const value of [null,{}, {code:NaN}])assert.throws(()=>report({items:[value]}),{name:'TypeError',message:/Invalid curriculum report/});
  for(const isOpen of [undefined,null,()=>undefined,()=>NaN,()=>Promise.resolve(true)]){
    assert.throws(()=>report({isOpen}),{name:'TypeError',message:/Invalid curriculum report/});
  }
  const failure=new Error('synthetic open failure');
  assert.throws(()=>report({isOpen:()=>{throw failure;}}),e=>e===failure);
});
test('空集合、無對應班級及無效資料的摘要與匯出只有有限數值或空比率',()=>{
  for(const extra of [{},{roster:[]},{attempts:[]},{activities:[]},{items:[]},{cls:'997'},
    {roster:[null],attempts:[null]},{isOpen:()=>false}]){
    const r=report(extra);
    for(const row of r.rows)for(const value of [row,...row.activities]){
      assert.ok(Number.isInteger(value.passed)&&value.passed>=0&&value.passed<=value.total);
      assert.ok(value.rate===null||(Number.isFinite(value.rate)&&value.rate>=0&&value.rate<=1));
    }
    for(const row of exportRows(r,'合成班級','synthetic'))for(const value of row)if(typeof value==='number')assert.ok(Number.isFinite(value));
  }
  for(const cls of [null,NaN,Infinity,{},'999x'])assert.throws(()=>report({cls}),{name:'TypeError'});
});

test('課綱對應多活動與多代碼：活動序號不是日期週次；全關完成才過關；未開放不列分母',()=>{
  const r=report();assert.equal(r.total,2);assert.deepEqual(r.classes,[998,999]);
  assert.deepEqual(r.rows[0].activities.map(a=>a.week),[28,1,3]);
  assert.equal(r.rows[0].passed,1);assert.equal(r.rows[0].rate,.5);
  assert.equal(r.rows[1].rate,.5);assert.equal(r.rows[2].rate,null);
  assert.equal(r.rows[3].rate,null);assert.deepEqual(r.rows[3].activities,[]);
  assert.equal(r.rows[0].activities[2].open,false);assert.equal(r.rows[0].activities[2].rate,null);
  assert.equal(report({isOpen:()=>true}).rows[0].rate,0);
});
test('同一活動對應多課綱仍只判定一次開放狀態；彙整與匯出結果相同且匯出不重讀',()=>{
  const reads=new Map(),expected=report();
  const actual=report({isOpen:a=>{reads.set(a.week,(reads.get(a.week)||0)+1);return a.week!==3;}});
  const once=new Map(activities.map(a=>[a.week,1]));
  assert.deepEqual(reads,once);
  assert.deepEqual(actual,expected);
  const snapshot='2026-11-05T00:00:00Z';
  assert.deepEqual(exportRows(actual,'999',snapshot),exportRows(expected,'999',snapshot));
  assert.deepEqual(reads,once);
});
test('開放狀態只共用於單次彙整；下一次彙整重新判定並保留前次結果',()=>{
  const reads=new Map();let closedWeek=3;
  const isOpen=a=>{reads.set(a.week,(reads.get(a.week)||0)+1);return a.week!==closedWeek;};
  const first=report({isOpen});
  closedWeek=28;
  const second=report({isOpen});
  assert.deepEqual(reads,new Map(activities.map(a=>[a.week,2])));
  assert.deepEqual(first,report());
  assert.deepEqual(second,report({isOpen:a=>a.week!==28}));
  assert.equal(first.rows[1].rate,.5);assert.equal(second.rows[1].rate,null);
});
test('名冊含無紀錄者，篩選班級、全部班級、空名冊與無活動皆不產生 NaN',()=>{
  assert.equal(report({cls:''}).rows[0].rate,1/3);
  assert.equal(report({cls:'998'}).rows[0].rate,0);
  assert.equal(report({roster:[]}).rows[0].rate,null);
  assert.equal(report({attempts:[]}).rows[0].rate,0);
  assert.equal(report({activities:[]}).rows[0].rate,null);
  assert.equal(report({cls:'997'}).total,0);
});
test('空課程回傳空彙整與僅含標頭的匯出；保留課綱時各項目無分母',()=>{
  const empty=report({activities:[],items:[],roster:[],attempts:[]});
  assert.deepEqual(empty,{rows:[],total:0,classes:[],conflicts:0,invalidRoster:0,skipped:0});
  assert.equal(exportRows(empty,'全部班級','2026-11-05T00:00:00Z').length,1);
  const r=report({activities:[],roster:[],attempts:[]});
  assert.deepEqual(r.rows,items.map(item=>({...item,activities:[],openCount:0,passed:0,total:0,rate:null})));
});
test('同一活動重複課綱代碼不重複列入活動、開放數或匯出',()=>{
  const baseline=report();
  const r=report({activities:activities.map(a=>({...a,codes:[...a.codes,...a.codes]}))});
  assert.deepEqual(r,baseline);
  assert.deepEqual(exportRows(r,'999','2026-11-05T00:00:00Z'),exportRows(baseline,'999','2026-11-05T00:00:00Z'));
});
test('未知課綱代碼與無對照活動不新增項目或影響已對照項目的達成率',()=>{
  const r=report({
    activities:[{...activities[0],codes:['A','UNKNOWN']},{...activities[1],codes:[]}],
    attempts:attempts.filter(a=>a.activity===28)
  });
  assert.deepEqual(r.rows.map(row=>row.code),['A','B','C','D']);
  assert.deepEqual(r.rows[0].activities.map(a=>a.week),[28]);
  assert.equal(r.rows[0].openCount,1);assert.equal(r.rows[0].passed,1);assert.equal(r.rows[0].rate,.5);
  assert.deepEqual(r.rows.slice(1),items.slice(1).map(item=>({...item,activities:[],openCount:0,passed:0,total:2,rate:null})));
  const rows=exportRows(r,'999','2026-11-05T00:00:00Z');
  assert.equal(rows.length,5);assert.equal(rows[1][7],28);
  assert.ok(rows.slice(2).every(row=>row[8]==='未安排活動'&&row[6]===null&&row[11]===null));
});
test('有名冊與已開放活動但無完成紀錄時，項目及活動的零完成率匯出仍為數值零',()=>{
  const r=report({attempts:[]});
  assert.equal(r.total,2);
  for(const row of r.rows.slice(0,2)){
    assert.equal(row.passed,0);assert.equal(row.rate,0);
    for(const a of row.activities.filter(a=>a.open)){
      assert.equal(a.passed,0);assert.equal(a.total,2);assert.equal(a.rate,0);
    }
  }
  const rows=exportRows(r,'999','2026-11-05T00:00:00Z').slice(1);
  const openedRows=rows.filter(row=>row[9]==='已開放');
  assert.deepEqual(openedRows.map(row=>[row[0],row[7]]),[['A',28],['A',1],['B',28]]);
  for(const row of openedRows){
    assert.equal(row[5],0);assert.equal(row[6],0);assert.equal(row[10],0);assert.equal(row[11],0);
  }
  const noRateRows=rows.filter(row=>row[0]==='C'||row[0]==='D');
  assert.deepEqual(noRateRows.map(row=>[row[0],row[7]]),[['C',3],['D','']]);
  assert.ok(noRateRows.every(row=>row[6]===null&&row[11]===null));
});
test('缺值時間戳略過且不影響有效紀錄；空分母與無活動匯出保留空比率',()=>{
  const missing=[undefined,null].map(passedAt=>({...attempts[0],passedAt}));
  const r=report({attempts:[...attempts,...missing]});
  assert.equal(r.skipped,2);assert.deepEqual(r.rows,report().rows);
  const empty=report({roster:[],attempts:[]});
  assert.ok(exportRows(empty,'全部班級','snapshot').slice(1).every(row=>row[6]===null&&row[11]===null));
  const unassigned=exportRows(report({activities:[],attempts:[]}),'999','snapshot').slice(1);
  assert.equal(unassigned.length,items.length);
  assert.ok(unassigned.every(row=>row[8]==='未安排活動'&&row[6]===null&&row[11]===null));
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
test('全部未開放但已有過關紀錄：保留活動人數，項目不計達成，所有匯出比率皆為空值',()=>{
  const r=report({isOpen:()=>false});
  assert.equal(r.total,2);
  assert.ok(r.rows.every(row=>row.openCount===0 && row.passed===0 && row.total===2 && row.rate===null));
  const rows=exportRows(r,'999','synthetic-snapshot').slice(1);
  assert.ok(rows.every(row=>row[3]===2 && row[5]===0 && row[6]===null && row[11]===null));
  const closed=rows.find(row=>row[0]==='B' && row[7]===28);
  assert.equal(closed[9],'未開放');assert.equal(closed[10],1);
  const unlinked=rows.find(row=>row[0]==='D');
  assert.equal(unlinked[10],'');assert.equal(unlinked[11],null);
});
test('重複嘗試與高 tries 不增加人數或替代缺少關卡；匯出沿用班座分母並保留待核對者',()=>{
  const duplicate=attempt(roster[1].email,'b',28,0,{tries:999});
  const r=report({
    roster:[...roster,{email:'d@example.invalid',cls:999,seat:3},{email:'e@example.invalid',cls:999,seat:3}],
    attempts:[...attempts,...attempts,duplicate,duplicate]
  });
  assert.equal(r.skipped,0);assert.equal(r.conflicts,1);assert.equal(r.total,3);
  assert.equal(r.rows[0].passed,1);assert.equal(r.rows[0].rate,1/3);
  const rows=exportRows(r,'999','synthetic-snapshot').slice(1);
  assert.ok(rows.every(row=>row[3]===3 && row[4]===1));
  const activity=rows.find(row=>row[0]==='B' && row[7]===28);
  assert.equal(activity[5],1);assert.equal(activity[6],1/3);
  assert.equal(activity[10],1);assert.equal(activity[11],1/3);
  // 補齊第二人的不同關卡後才增加過關人數；仍須完成活動乙才達成項目 A。
  const completed=report({attempts:[...attempts,duplicate,attempt(roster[1].email,'b',28,1)]});
  assert.equal(completed.rows[1].passed,2);assert.equal(completed.rows[1].rate,1);
  assert.equal(completed.rows[0].passed,1);assert.equal(completed.rows[0].rate,.5);
});
test('空班級與空名冊即使傳入其他班紀錄，項目及活動皆為零人且 Excel 比率為空值',()=>{
  for(const extra of [{cls:'997'},{roster:[]}]){
    const r=report(extra);
    assert.equal(r.total,0);assert.equal(r.conflicts,0);
    assert.ok(r.rows.every(row=>row.total===0 && row.passed===0 && row.rate===null));
    assert.ok(r.rows.flatMap(row=>row.activities).every(a=>a.total===0 && a.passed===0 && a.rate===null));
    const rows=exportRows(r,'合成空班級','synthetic-snapshot').slice(1);
    assert.ok(rows.every(row=>row[3]===0 && row[4]===0 && row[5]===0 && row[6]===null && row[11]===null));
    assert.ok(rows.filter(row=>row[7]!=='').every(row=>row[10]===0));
  }
});
test('所有班座皆待核對：完整紀錄仍不計達成，保留班座分母與已開放活動的數值零比率',()=>{
  // 兩個不同班座共用 UID，且各自都有全部活動的完整紀錄。
  const r=report({attempts:roster.slice(0,2).flatMap(p=>activities.flatMap(a=>
    a.rounds.map((_,round)=>attempt(p.email,'shared',a.week,round))))});
  assert.equal(r.skipped,0);assert.equal(r.total,2);assert.equal(r.conflicts,2);
  assert.ok(r.rows.every(row=>row.total===2 && row.passed===0 && row.rate===(row.openCount ? 0 : null)));
  assert.ok(r.rows.flatMap(row=>row.activities).every(a=>a.total===2 && a.passed===0 && a.rate===(a.open ? 0 : null)));
  const rows=exportRows(r,'999','synthetic-snapshot').slice(1);
  assert.ok(rows.every(row=>row[3]===2 && row[4]===2 && row[5]===0));
  const opened=rows.filter(row=>row[9]==='已開放');
  assert.ok(opened.length>0);
  assert.ok(opened.every(row=>row[6]===0 && row[10]===0 && row[11]===0));
});
test('XLSX 寫出讀回：無開放活動、空班級及空名冊的比率儲存格保持空值，數值零不變空值',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(readFileSync(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8'),ctx);
  for(const extra of [{isOpen:()=>false},{cls:'997'},{roster:[]},{attempts:[]}]){
    const rows=exportRows(report(extra),'合成班級','synthetic-snapshot');
    ctx.rows=rows;
    const actual=JSON.parse(vm.runInContext(`
      var book=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'課綱達成報告');
      var bytes=XLSX.write(book,{bookType:'xlsx',type:'array'});
      var sheet=XLSX.read(bytes,{type:'array'}).Sheets['課綱達成報告'];
      JSON.stringify(XLSX.utils.sheet_to_json(sheet,{header:1,defval:null}));
    `,ctx));
    assert.deepEqual(actual,rows);
    for(let i=1;i<rows.length;i++)for(const column of [6,11]){
      ctx.address=(column===6?'G':'L')+(i+1);
      const cell=vm.runInContext('sheet[address]',ctx);
      if(rows[i][column]===null)assert.equal(cell?.v,undefined);
      else {assert.equal(cell.t,'n');assert.equal(cell.v,rows[i][column]);}
    }
  }
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

// 真實頁面讀取／清除流程；只用記憶體 DOM 與合成 Firebase，不連網。
async function reportPage(){
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const body=new Element('body');body.innerHTML=read('115-g9/teacher/report/index.html');
  function decorate(el){
    el.append=(...nodes)=>nodes.forEach(n=>Element.prototype.append.call(el,n));
    el.replaceChildren=(...nodes)=>{el.childNodes=[];el.append(...nodes);if(el.tagName==='SELECT')el.value=nodes[0]?.value||'';};
    return el;
  }
  body.querySelectorAll('').forEach(decorate);
  const get=id=>body.querySelector('#'+id);
  const context=vm.createContext({window:{},document:{getElementById:get,createElement:tag=>decorate(new Element(tag))},
    location:{pathname:'/115-g9/teacher/report/'},
    Date:class extends Date{static now(){return Date.parse('2026-11-05T00:00:00Z');}},
    queueMicrotask,TEACHER:{remembered:()=>false}});
  context.window=context;
  vm.runInContext(fakeCurriculumFirebase,context);
  vm.runInContext('const YBS={firebaseSession:async()=>({auth,db})};',context);
  for(const path of ['assets/curriculum','assets/activities','assets/lock','assets/curriculum-report','115-g9/teacher/report/report']){
    vm.runInContext(read(path+'.js'),context,{filename:path+'.js'});
  }
  await get('report-login').onclick();
  return{get,evaluate:source=>vm.runInContext(source,context),read:()=>get('report-read').onclick()};
}
for(const failed of ['roster','attempts'])test(`部分 ${failed} 讀取失敗清除舊報告；重試後忽略另一集合的遲到回應`,async()=>{
  const h=await reportPage();await h.read();assert.equal(h.get('report-export').disabled,false);
  h.evaluate(`
    const originalCollection=db.collection;
    db.collection=path=>({async get(options){
      const snapshot=await originalCollection(path).get(options);
      if(path.endsWith('/${failed}'))throw Error('synthetic partial failure');
      return new Promise(resolve=>{__reportFake.finishLate=()=>resolve(snapshot)});
    }});
  `);
  await h.read();
  assert.match(h.get('report-status').textContent,/失敗/);
  assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-export').disabled,true);
  assert.equal(h.get('report-class').disabled,true);
  h.evaluate('db.collection=originalCollection;__reportFake.roster=[];__reportFake.attempts=[]');
  await h.read();assert.match(h.get('report-summary').textContent,/名冊 0 人/);
  const summary=h.get('report-summary').textContent,rows=h.get('report-rows').textContent;
  h.evaluate('__reportFake.finishLate()');await new Promise(r=>setImmediate(r));
  assert.equal(h.get('report-summary').textContent,summary);assert.equal(h.get('report-rows').textContent,rows);
  assert.equal(h.get('report-export').disabled,false);
});
test('缺欄位資料不造成頁面例外；活動設定失敗由既有讀取流程攔截且可重試',async()=>{
  const h=await reportPage();
  h.evaluate(`__reportFake.roster.push({id:'invalid@example.invalid',data:()=>({})});
    __reportFake.attempts.push({id:'invalid',data:()=>({})});`);
  await h.read();assert.match(h.get('report-summary').textContent,/無效名冊 1 筆.*紀錄 1 筆/);
  h.get('report-class').value='999';assert.doesNotThrow(()=>h.get('report-class').onchange());
  assert.doesNotMatch(h.get('report-rows').textContent,/NaN|Infinity|undefined/);
  h.evaluate('const savedRounds=ACTIVITIES[0].rounds;ACTIVITIES[0].rounds=[]');
  await h.read();assert.match(h.get('report-status').textContent,/失敗/);
  assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-export').disabled,true);
  h.evaluate('ACTIVITIES[0].rounds=savedRounds');await h.read();assert.equal(h.get('report-export').disabled,false);
});
