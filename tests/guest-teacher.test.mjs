import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup as teacher} from './fixtures/teacher-export.mjs';
import {settle,error} from './fixtures/guest-firebase.mjs';
const stamp={toMillis:()=>Date.UTC(2026,10,5)};
const guest=(id,extra={})=>({id,data:()=>({cls:'999',seat:1,activity:1,round:0,level:1,tries:2,verified:false,passedAt:stamp,...extra})});
function setup({owner='teacher1',guests=[guest('anon1_1_0'),guest('anon1_1_1',{round:1}),guest('anon2_1_0')],hold,fail=false,roster=[{id:'student@example.invalid',data:()=>({cls:999,seat:1})}],attempts=[{id:'real1_1_0',data:()=>({uid:'real1',email:'student@example.invalid',activity:1,round:0,level:1,tries:3,passedAt:stamp})}]}={}){
  const queries=[],observers=[];
  const auth={currentUser:null,onAuthStateChanged(fn){observers.push(fn);queueMicrotask(()=>fn(this.currentUser));return()=>{};},
    async signInWithPopup(){auth.currentUser={uid:'teacher1'};observers.forEach(f=>f(auth.currentUser));},
    async signOut(){auth.currentUser=null;observers.forEach(f=>f(null));}};
  const docs={guestAttempts:guests,roster,attempts};
  const db={doc(path){return{async get(options){queries.push([path,options]);return{exists:true,data:()=>({ownerUid:owner})};}};},
    collection(path){return{async get(options){queries.push([path,options]);if(hold)await hold;if(fail)throw error('unavailable');return{docs:docs[path.split('/').at(-1)]};}};}};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{};}
  const h=teacher({cloud:{ybs:{firebaseSession:async()=>({auth,db})},firebase:{auth:{GoogleAuthProvider}}}});
  return {...h,queries,auth,async login(){await h.get('cloud-login').onclick();await settle();},read:()=>h.get('cloud-read').onclick(),logout:()=>h.get('cloud-logout').onclick()};
}
const json=(h,source)=>JSON.parse(h.evaluate(`JSON.stringify(${source})`));
test('owner 同時讀 attempts、guestAttempts 與 roster；未驗證明細完整保留',async()=>{
  const h=setup();await h.login();await h.read();
  assert.deepEqual(h.queries.map(x=>x[0]),['ybsCourses/115-g9','ybsCourses/115-g9/attempts','ybsCourses/115-g9/guestAttempts','ybsCourses/115-g9/roster']);
  assert.ok(h.queries.every(x=>x[1].source==='server'));
  assert.match(h.get('cloud-status').textContent,/3 列/);h.get('cloud-export').onclick();
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
  const rows=json(h,'XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:""})');
  assert.deepEqual(rows[0],['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳','各關首次過關（台灣時間）','各關狀態','準時關數','補做關數','未判定關數','等級','XP']);
  assert.equal(rows.filter(r=>r[4]==='未驗證').length,2);assert.equal(rows.find(r=>r[5]==='anon1')[6],2);
  assert.equal(rows.find(r=>r[5]==='real1')[4],'帳號名單');
});
test('非 owner 拒絕列舉；無法讀到 guestAttempts',async()=>{
  const h=setup({owner:'other'});await h.login();await h.read();
  assert.equal(h.queries.length,1);assert.equal(h.get('cloud-export').disabled,true);assert.match(h.get('cloud-status').textContent,/只有此課程/);
});
test('異常雲端欄位、班座型別、docId 與未驗證旗標不入表',async()=>{
  const h=setup({guests:[guest('bad'),guest('x_1_0',{verified:true}),guest('y_1_0',{cls:999}),guest('z_1_0',{round:6}),guest('html_1_0',{cls:'<script>'})]});
  await h.login();await h.read();assert.match(h.get('cloud-status').textContent,/1 列；略過 5 筆/);
});
test('登出期間的遲到查詢不能重現前教師紀錄',async()=>{
  let release;const gate=new Promise(r=>release=r);const h=setup({hold:gate});await h.login();const reading=h.read();await settle();
  await h.logout();release();await reading;
  assert.equal(h.get('cloud-export').disabled,true);assert.equal(h.get('cloud-table').textContent,'');assert.match(h.get('cloud-status').textContent,/已登出/);
});
test('查詢失敗清除雲端表',async()=>{
  const h=setup({fail:true});await h.login();await h.read();
  assert.equal(h.get('cloud-export').disabled,true);assert.match(h.get('cloud-status').textContent,/讀取失敗/);
});
test('同匿名 UID 的不同班座不得合併過關數',async()=>{
  const h=setup({guests:[guest('same_1_0'),guest('same_1_1',{round:1,seat:2})]});await h.login();await h.read();
  assert.match(h.get('cloud-status').textContent,/3 列/);
});
test('教師 Google 彈出登入沿用 DF 教師頁既有 CSP 來源，避免廣泛放寬',()=>{
  const policy=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const current=policy('115-g9/teacher/index.html'),existing=policy('115-df/teacher/index.html');
  assert.equal(current,existing);assert.match(current,/script-src[^;]*https:\/\/apis\.google\.com(?:;|\s)/);
  assert.ok(!current.includes("'unsafe-eval'"));assert.ok(!current.includes('*'));
});

test('先選班，名冊每座號一列、每活動一欄；多 UID 不混算，名冊外收詳細資料',async()=>{
  const h=setup({roster:[1,2,3].map(seat=>({id:'student'+seat+'@example.invalid',data:()=>({cls:'999',seat})})),attempts:[]});
  await h.login();await h.read();assert.equal(h.get('cloud-table').textContent,'');
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  const rows=h.get('cloud-table').querySelectorAll('tbody tr');assert.equal(rows.length,3);
  assert.equal(rows[0].querySelectorAll('td')[1].textContent,'待核對');
  assert.match(rows[0].querySelector('details').textContent,/anon1/);assert.match(rows[0].querySelector('details').textContent,/anon2/);
  assert.match(rows[1].querySelectorAll('td')[1].textContent,/^0 分（0\//);
  await h.logout();assert.equal(h.get('cloud-class').value,'');assert.equal(h.get('cloud-table').textContent,'');
});
test('單一來源顯示過關數，全過顯示勾號，保留未驗證標記',async()=>{
  const h=setup({attempts:[],guests:[0,1,2,3].map(round=>guest('only_1_'+round,{round}))});await h.login();await h.read();
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  const cell=h.get('cloud-table').querySelectorAll('tbody tr')[0].querySelectorAll('td')[1];assert.match(cell.textContent,/^100 分（✓）（未驗證）第 1 關：/);
});
// 模擬 details 的可見文字；textContent 會包含摺疊內容，無法抓到此回歸。
function visibleText(node){
  if(node.hidden)return '';
  if(node.nodeType===3)return node.textContent;
  if(node.tagName==='DETAILS'&&!node.open)return visibleText(node.querySelector('summary'));
  return node.childNodes.map(visibleText).join('');
}
test('選班後來源提示常駐可見；先展開名冊外紀錄仍看得到班內兩種來源',async()=>{
  const h=setup({guests:[guest('anon1_1_0'),guest('outside_1_0',{seat:2}),guest('other_1_0',{cls:'998'})],
    roster:[{id:'student@example.invalid',data:()=>({cls:999,seat:1})},{id:'empty@example.invalid',data:()=>({cls:997,seat:1})}]});
  await h.login();await h.read();
  const table=h.get('cloud-table');
  assert.doesNotMatch(visibleText(table),/本班紀錄來源/);
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.match(visibleText(table),/本班紀錄來源：帳號名單、未驗證/);
  assert.equal(table.querySelectorAll('tbody tr').length,1);
  assert.equal(table.querySelectorAll('tbody td')[1].textContent,'待核對');
  const first=table.querySelector('details');
  assert.match(first.querySelector('summary').textContent,/待核對：名冊外紀錄/);
  first.open=true;
  assert.match(visibleText(table),/帳號名單/);assert.match(visibleText(table),/未驗證/);
  assert.doesNotMatch(visibleText(table),/UID：real1/,'名冊列詳細資料仍摺疊');
  h.get('cloud-class').value='997';h.get('cloud-class').onchange();
  assert.doesNotMatch(visibleText(table),/本班紀錄來源|帳號名單|未驗證/,'切到無紀錄班級不可殘留前班提示');
  h.get('cloud-class').value='';h.get('cloud-class').onchange();
  assert.doesNotMatch(visibleText(table),/本班紀錄來源/);
  await h.logout();assert.equal(visibleText(table),'');
});
for(const roster of [[],[{id:'student@example.invalid',data:()=>({cls:999,seat:1})}]]){
  test((roster.length?'名冊有其他班級':'空名冊')+'時，名冊外紀錄不必選班即可展開並逐筆顯示班座',async()=>{
    const h=setup({roster,attempts:[],guests:[guest('outside1_1_0',{cls:'998',seat:2}),guest('outside2_1_0',{cls:'997',seat:3})]});
    await h.login();await h.read();
    const check=()=>{
      const box=h.get('cloud-table').querySelector('details');assert.ok(box);
      assert.match(box.querySelector('summary').textContent,/待核對：名冊外紀錄（2 列，不計入表格）/);
      box.open=true;
      const records=box.querySelectorAll('p');assert.equal(records.length,2);
      assert.match(records[0].textContent,/班級：997・座號：3・.+・未驗證・UID：outside2・1\/4・分數：70 分・各關嘗試：2/);
      assert.match(records[1].textContent,/班級：998・座號：2・.+・未驗證・UID：outside1・1\/4・分數：70 分・各關嘗試：2/);
    };
    assert.equal(h.get('cloud-class').value,'');check();
    assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,0);
    if(roster.length){
      h.get('cloud-class').value='999';h.get('cloud-class').onchange();check();
      assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);
      h.get('cloud-class').value='';h.get('cloud-class').onchange();check();
      assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,0);
    }
    await h.logout();assert.equal(h.get('cloud-table').textContent,'');
  });
}
test('跨班座共用 UID 及名冊重複均待核對，名冊外不擠進學生列',async()=>{
  const h=setup({attempts:[],guests:[guest('same_1_0'),guest('same_1_1',{round:1,seat:2})]});await h.login();await h.read();
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);assert.match(h.get('cloud-table').textContent,/待核對.*名冊外/);
});
test('同座號名冊重複列為待核對；單一未全過顯示分數',async()=>{
  const roster=[1,2].map(seat=>({id:'s'+seat+'@example.invalid',data:()=>({cls:999,seat:1})}));
  const h=setup({roster,attempts:[],guests:[guest('only_1_0')]});await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);assert.equal(h.get('cloud-table').querySelectorAll('tbody td')[1].textContent,'待核對');
  const single=setup({attempts:[],guests:[guest('only_1_0')]});await single.login();await single.read();single.get('cloud-class').value='999';single.get('cloud-class').onchange();assert.match(single.get('cloud-table').querySelectorAll('tbody td')[1].textContent,/^70 分（1\/4）（未驗證）第 1 關：/);
});
test('教師 Auth 換人立即清空選班及學生表',async()=>{
  const h=setup();await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.ok(h.get('cloud-table').textContent);await h.login();
  assert.equal(h.get('cloud-table').textContent,'');assert.equal(h.get('cloud-class').value,'');assert.equal(h.get('cloud-export').disabled,true);
});

for(const [total,expected] of [[4,[0,70,80,90,100]],[5,[0,60,70,80,90,100]],[6,[0,50,60,70,80,90,100]]]){
  test(`${total} 關：教師彙整與班座明細逐關使用活動計分；Excel 原欄位、型別與值不變`,async()=>{
    for(let passed=0;passed<=total;passed++){
      const h=setup({attempts:[],guests:Array.from({length:passed},(_,round)=>guest('synthetic_1_'+round,{round}))});
      // 關卡數只取活動登記資料，使用合成的 4／5／6 關配置。
      h.evaluate(`W[1]={...W[1],rounds:Array.from({length:${total}},(_,i)=>'合成關'+i)}`);
      await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
      const cell=h.get('cloud-table').querySelectorAll('tbody td')[1];
      assert.equal(cell.childNodes[0].textContent,`${expected[passed]} 分（${passed===total?'✓':passed+'/'+total}）${passed?'（未驗證）':''}`);
      assert.equal(h.evaluate(`activityScore(${passed},${total})`),expected[passed]);
      if(!passed){assert.equal(h.get('cloud-export').disabled,true);continue;}
      assert.match(h.get('cloud-table').querySelector('details').textContent,new RegExp('分數：'+expected[passed]+' 分'));
      h.get('cloud-export').onclick();
      assert.equal(h.downloads[0].name,'資訊科技_雲端紀錄_115-g9.xlsx');
      const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
      h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
      assert.deepEqual(json(h,'book.SheetNames'),['帳號與未驗證班座']);
      const rows=json(h,'XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:""})');
      assert.deepEqual(rows[0],['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳','各關首次過關（台灣時間）','各關狀態','準時關數','補做關數','未判定關數','等級','XP']);
      assert.deepEqual(rows[1].slice(0,10),[999,1,1,h.evaluate('W[1].title'),'未驗證','synthetic',passed,total,Array.from({length:total},(_,i)=>i<passed?2:0).join(' / '),new Date(stamp.toMillis()).toISOString()]);
      assert.equal(h.evaluate("book.Sheets[book.SheetNames[0]].J2.t"),'d');
    }
  });
}

// 合成時間與既有 activityOpenAt 規則；不讀寫正式資料。
for(const [label,offset,expected] of [['截止前',-1,'準時'],['截止當下',0,'準時'],['截止後',1,'補做'],['無開放日期',0,'未判定']]){
  test(label+'：依首次過關判斷並匯出台灣時間',async()=>{
    const h=setup({attempts:[],guests:[]});
    const date='2026-11-02';
    const open=h.evaluate(`activityOpenAt({date:'${date}'})`);
    const at=open+7*864e5+offset;
    const timed=setup({attempts:[{id:'real1_1_0',data:()=>({uid:'real1',email:'student@example.invalid',activity:1,round:0,level:1,tries:3,passedAt:{toMillis:()=>at}})}],guests:[]});
    timed.evaluate(`W[1]={...W[1],date:${label==='無開放日期'?"''":JSON.stringify(date)}}`);
    await timed.login();await timed.read();timed.get('cloud-class').value='999';timed.get('cloud-class').onchange();
    const cell=timed.get('cloud-table').querySelectorAll('tbody td')[1];
    const formatted=new Date(at+8*36e5).toISOString().slice(5,16).replace('-','/').replace('T',' ');
    assert.ok(cell.textContent.includes('第 1 關：'+formatted+' '+expected));
    const summary=timed.get('cloud-table').querySelectorAll('tbody td').at(-3).textContent;
    assert.ok(summary.includes('準時 '+(expected==='準時'?1:0)+' 關、補做 '+(expected==='補做'?1:0)+' 關'));
    if(expected==='未判定')assert.match(summary,/未判定 1 關/);
    timed.get('cloud-export').onclick();
    const bytes=[...new Uint8Array(await timed.blobs[0].arrayBuffer())];
    timed.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
    const row=json(timed,'XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1})')[1];
    assert.equal(row[10].split(' / ')[0],formatted);assert.equal(row[11].split(' / ')[0],expected);
    assert.deepEqual(row.slice(12,15),[expected==='準時'?1:0,expected==='補做'?1:0,expected==='未判定'?1:0]);
  });
}
test('同關多筆取最早，其他關較晚的時間不會將準時關改成補做',async()=>{
  const probe=setup();const cutoff=probe.evaluate("activityOpenAt({date:'2026-11-02'})")+7*864e5;
  for(const times of [[cutoff+60000,cutoff],[cutoff,cutoff+60000]]){
    const h=setup({attempts:[],guests:[...times.map(at=>guest('only_1_0',{passedAt:{toMillis:()=>at}})),guest('only_1_1',{round:1,passedAt:{toMillis:()=>cutoff+60000}})]});
    h.evaluate("W[1]={...W[1],date:'2026-11-02'}");
    await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
    const cells=h.get('cloud-table').querySelectorAll('tbody td');
    assert.match(cells[1].textContent,/第 1 關：11\/08 23:59 準時第 2 關：11\/09 00:00 補做/);
    assert.equal(cells.at(-3).textContent,'準時 1 關、補做 1 關');
  }
});
test('補做截止視窗與 XP 維持七天一致',()=>{
  const xp=readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8');
  assert.match(xp,/windowMs:7 \* 864e5/);
});


test('教師與學生以同一組全帳號 attempts 計算 XP；跨活動、UID、重複關卡及時間回退一致',async()=>{
  const probe=setup(), open=probe.evaluate("activityOpenAt(W[1])");
  const records=[
    ...Array.from({length:4},(_,round)=>({uid:'old',email:'student@example.invalid',activity:1,round,level:1,tries:2,at:new Date(open+1000).toISOString(),passedAt:{toMillis:()=>open+8*864e5}})),
    {uid:'new',email:'student@example.invalid',activity:1,round:0,level:1,tries:1,passedAt:{toMillis:()=>open+9*864e5}},
    {uid:'new',email:'student@example.invalid',activity:2,round:0,level:1,tries:1,passedAt:{toMillis:()=>open}},
    {uid:'new',email:'student@example.invalid',activity:3,round:0,level:1,tries:1},
  ];
  const h=setup({guests:[],attempts:records.map(d=>({id:d.uid+'_'+d.activity+'_'+d.round,data:()=>d}))});
  await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  const expected=json(h,`YBSXP.calculate(Object.values(W).map(a=>({...a,openedAt:activityOpenAt(a)})),${JSON.stringify(records.map(d=>({...d,course:'115-g9',passedAt:d.passedAt?.toMillis()})))})`);
  assert.equal(expected.totalXP,100,'全過 80、另兩關 20；重複不計，無時間不加成');
  const cell=h.get('cloud-table').querySelector('.cloud-xp');
  assert.equal(cell.textContent,'Lv '+expected.level+' '+expected.title+expected.totalXP+' XP');
  h.get('cloud-export').onclick();
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
  const rows=json(h,'XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1})');
  assert.ok(rows.slice(1).every(r=>r[15]===expected.level&&r[16]===expected.totalXP));
});
test('班座來源的等級與匯出皆為破折號；無紀錄帳號顯示 Lv 1；座號排序不受 XP 影響',async()=>{
  const h=setup({roster:[3,1,2].map(seat=>({id:'s'+seat+'@example.invalid',data:()=>({cls:999,seat})})),
    guests:[guest('guest_1_0')],attempts:[{id:'account_1_0',data:()=>({uid:'account',email:'s3@example.invalid',activity:1,round:0,level:1,tries:1,passedAt:stamp})}]});
  await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  const rows=h.get('cloud-table').querySelectorAll('tbody tr');
  assert.deepEqual(rows.map(r=>r.querySelector('td').textContent),['1','2','3']);
  assert.equal(rows[0].querySelector('.cloud-xp').textContent,'—');
  assert.equal(rows[1].querySelector('.cloud-xp').textContent,'Lv 1 位元見習生0 XP');
  assert.match(rows[2].querySelector('.cloud-xp').textContent,/10 XP$/);
  h.get('cloud-export').onclick();
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
  const exported=json(h,'XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1})');
  assert.deepEqual(exported[1].slice(-2),['—','—']);
});

test('成長紀錄隨延遲讀取、切班及重讀重建；空紀錄帳號仍有連結，名冊外不加',async()=>{
  let release;const hold=new Promise(r=>release=r);
  const h=setup({hold,roster:[{id:'one@example.invalid',data:()=>({cls:'998',seat:3})},{id:'empty@example.invalid',data:()=>({cls:999,seat:2})}],attempts:[]});
  await h.login();const reading=h.read();await settle();
  assert.equal(h.get('cloud-table').querySelectorAll('a').length,0);
  release();await reading;
  for(const [cls,seat] of [[998,3],[999,2],[998,3]]){
    h.get('cloud-class').value=String(cls);h.get('cloud-class').onchange();
    const links=h.get('cloud-table').querySelectorAll('a');
    assert.equal(links.length,1);assert.equal(links[0].getAttribute('href'),'../me/?cls='+cls+'&seat='+seat);
    assert.equal(links[0].textContent,'成長紀錄');
  }
  await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('a').length,1);
  await h.logout();assert.equal(h.get('cloud-table').querySelectorAll('a').length,0);
});
