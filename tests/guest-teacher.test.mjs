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
  assert.deepEqual(rows[0],['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳']);
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
  assert.match(rows[1].querySelectorAll('td')[1].textContent,/^0\//);
  await h.logout();assert.equal(h.get('cloud-class').value,'');assert.equal(h.get('cloud-table').textContent,'');
});
test('單一來源顯示過關數，全過顯示勾號，保留未驗證標記',async()=>{
  const h=setup({attempts:[],guests:[0,1,2,3].map(round=>guest('only_1_'+round,{round}))});await h.login();await h.read();
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  const cell=h.get('cloud-table').querySelectorAll('tbody tr')[0].querySelectorAll('td')[1];assert.equal(cell.textContent,'✓（未驗證）');
});
test('跨班座共用 UID 及名冊重複均待核對，名冊外不擠進學生列',async()=>{
  const h=setup({attempts:[],guests:[guest('same_1_0'),guest('same_1_1',{round:1,seat:2})]});await h.login();await h.read();
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);assert.match(h.get('cloud-table').textContent,/待核對.*名冊外/);
});
test('同座號名冊重複列為待核對；單一未全過顯示分數',async()=>{
  const roster=[1,2].map(seat=>({id:'s'+seat+'@example.invalid',data:()=>({cls:999,seat:1})}));
  const h=setup({roster,attempts:[],guests:[guest('only_1_0')]});await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);assert.equal(h.get('cloud-table').querySelectorAll('tbody td')[1].textContent,'待核對');
  const single=setup({attempts:[],guests:[guest('only_1_0')]});await single.login();await single.read();single.get('cloud-class').value='999';single.get('cloud-class').onchange();assert.equal(single.get('cloud-table').querySelectorAll('tbody td')[1].textContent,'1/4（未驗證）');
});
test('教師 Auth 換人立即清空選班及學生表',async()=>{
  const h=setup();await h.login();await h.read();h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.ok(h.get('cloud-table').textContent);await h.login();
  assert.equal(h.get('cloud-table').textContent,'');assert.equal(h.get('cloud-class').value,'');assert.equal(h.get('cloud-export').disabled,true);
});
