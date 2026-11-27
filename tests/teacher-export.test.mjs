import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/teacher-export.mjs';
test('教師頁停用貼碼、週班匯出、人數及 codec，保留原始備份與雲端明細入口',()=>{
  const html=readFileSync(new URL('../115-g9/teacher/index.html',import.meta.url),'utf8'),h=setup();
  assert.doesNotMatch(html,/codec\.js|CODEC|id="(?:paste|size|b-x1|b-x2|b-x3)"/);
  for(const id of ['cloud-class','cloud-export','b-legacy-export'])assert.ok(h.get(id));
});
test('Excel 真實寫檔可讀回，保留來源、UID 及各關嘗試明細',async()=>{
  const h=setup();h.evaluate(`saveBook('synthetic.xlsx',[['明細',XLSX.utils.aoa_to_sheet([['來源','UID','各關嘗試次數'],['未驗證','synthetic1','2 / 0']])]])`);
  assert.equal(h.downloads[0].name,'synthetic.xlsx');
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  const rows=h.evaluate(`JSON.stringify(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array'}).Sheets['明細'],{header:1}))`);
  assert.deepEqual(JSON.parse(rows),[['來源','UID','各關嘗試次數'],['未驗證','synthetic1','2 / 0']]);
});
test('Excel 特殊字元維持文字，空值不影響後續欄位與零值',async()=>{
  const h=setup();
  const texts=['合成：逗號,雙引號"與換行\n第二行','<&>\'"','繁體中文 😀','=1+1','+SUM(1,2)','-1','@synthetic'];
  const input=[['合成文字','空值','零值','尾欄'],...texts.map(text=>[text,null,0,'保留'])];
  h.evaluate(`saveBook('synthetic-special.xlsx',[['明細',XLSX.utils.aoa_to_sheet(${JSON.stringify(input)})]])`);
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array'})`);
  const rows=JSON.parse(h.evaluate(`JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets['明細'],{header:1,defval:''}))`));
  assert.equal(h.downloads[0].name,'synthetic-special.xlsx');
  assert.deepEqual(rows,[input[0],...texts.map(text=>[text,'',0,'保留'])]);
  for(let row=2;row<=input.length;row++){
    assert.equal(h.evaluate(`book.Sheets['明細'].A${row}.t`),'s');
    assert.equal(h.evaluate(`book.Sheets['明細'].A${row}.f`),undefined);
    assert.equal(h.evaluate(`book.Sheets['明細'].C${row}.t`),'n');
  }
});
test('舊資料 JSON 備份保留特殊字元、空字串與不存在鍵的 null',async()=>{
  for(const raw of ['',JSON.stringify({synthetic:'合成, "引號"\n<&> 😀',empty:null})]){
    const stored=new Map([['it9:grades',raw]]),h=setup({stored});
    h.get('b-legacy-export').onclick();
    assert.match(h.downloads[0].name,/^資訊科技_舊瀏覽器資料_\d{8}\.json$/);
    assert.equal(h.blobs[0].type,'application/json;charset=utf-8');
    assert.deepEqual(JSON.parse(await h.blobs[0].text()),{'it9:grades':raw,'it9:sizes':null});
    assert.deepEqual(stored,new Map([['it9:grades',raw]]));
    assert.ok(h.storageCalls.every(call=>call.method==='getItem'));
  }
});
test('空雲端集合停用匯出，直接呼叫也不產生空活頁簿',async()=>{
  const queries=[];
  const auth={currentUser:{uid:'synthetic-teacher'},onAuthStateChanged(fn){fn(this.currentUser);},async signInWithPopup(){}};
  const db={
    doc(path){return {async get(){queries.push(path);return {exists:true,data:()=>({ownerUid:'synthetic-teacher'})};}};},
    collection(path){return {async get(){queries.push(path);return {docs:[]};}};},
  };
  function GoogleAuthProvider(){this.setCustomParameters=()=>{};}
  const h=setup({cloud:{ybs:{firebaseSession:async()=>({auth,db})},firebase:{auth:{GoogleAuthProvider}}}});
  await h.get('cloud-login').onclick();
  await h.get('cloud-read').onclick();
  assert.deepEqual(queries,['ybsCourses/115-g9','ybsCourses/115-g9/attempts','ybsCourses/115-g9/guestAttempts','ybsCourses/115-g9/roster']);
  assert.match(h.get('cloud-status').textContent,/已讀取 0 列；略過 0 筆/);
  assert.equal(h.get('cloud-export').disabled,true);
  h.get('cloud-export').onclick();
  assert.equal(h.downloads.length,0);
  assert.equal(h.blobs.length,0);
});
test('特殊字元經雲端按鈕匯出保留原值，重讀空集合清除舊資料與匯出狀態',async()=>{
  const title='合成：逗號,雙引號"與換行\n<&> 繁體中文 😀';
  const uids=['合成,雙引號"',"<&>'\"",'繁體中文 😀','=1+1','+SUM(1,2)','-1','@synthetic'];
  const docs={
    attempts:[],
    guestAttempts:uids.map(uid=>({id:uid+'_1_0',data:()=>({cls:'999',seat:1,activity:1,round:0,level:1,tries:2,verified:false,passedAt:{toMillis:()=>Date.UTC(2026,10,5)}})})),
    roster:[{id:'synthetic@example.invalid',data:()=>({cls:999,seat:1})}],
  };
  const auth={currentUser:{uid:'synthetic-teacher'},onAuthStateChanged(fn){fn(this.currentUser);},async signInWithPopup(){}};
  const db={
    doc(){return {async get(){return {exists:true,data:()=>({ownerUid:'synthetic-teacher'})};}};},
    collection(path){return {async get(){return {docs:docs[path.split('/').at(-1)]};}};},
  };
  function GoogleAuthProvider(){this.setCustomParameters=()=>{};}
  const h=setup({cloud:{ybs:{firebaseSession:async()=>({auth,db})},firebase:{auth:{GoogleAuthProvider}}}});
  h.evaluate(`W[1]={...W[1],title:${JSON.stringify(title)}}`);
  await h.get('cloud-login').onclick();
  await h.get('cloud-read').onclick();
  assert.match(h.get('cloud-status').textContent,/已讀取 7 列；略過 0 筆/);
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.ok(h.get('cloud-table').textContent);
  assert.equal(h.get('cloud-export').disabled,false);
  h.get('cloud-export').onclick();
  assert.equal(h.downloads[0].name,'資訊科技_雲端紀錄_115-g9.xlsx');
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  h.evaluate(`globalThis.book=XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array',cellDates:true})`);
  const rows=JSON.parse(h.evaluate(`JSON.stringify(XLSX.utils.sheet_to_json(book.Sheets['帳號與未驗證班座'],{header:1,defval:''}))`));
  assert.equal(rows.length,uids.length+1);
  assert.deepEqual(rows.slice(1).map(row=>row[5]).sort(),[...uids].sort());
  for(let index=1;index<rows.length;index++){
    assert.equal(rows[index][3],title);
    assert.deepEqual(rows[index].slice(6,9),[1,4,'2 / 0 / 0 / 0']);
    for(const column of ['D','F']){
      assert.equal(h.evaluate(`book.Sheets['帳號與未驗證班座'].${column}${index+1}.t`),'s');
      assert.equal(h.evaluate(`book.Sheets['帳號與未驗證班座'].${column}${index+1}.f`),undefined);
    }
  }
  for(const name of Object.keys(docs))docs[name]=[];
  await h.get('cloud-read').onclick();
  assert.match(h.get('cloud-status').textContent,/已讀取 0 列；略過 0 筆/);
  assert.equal(h.get('cloud-table').textContent,'');
  assert.equal(h.get('cloud-class').value,'');
  assert.equal(h.get('cloud-class').querySelectorAll('option').length,1);
  assert.equal(h.get('cloud-export').disabled,true);
  h.get('cloud-export').onclick();
  assert.equal(h.downloads.length,1);
  assert.equal(h.blobs.length,1);
});
