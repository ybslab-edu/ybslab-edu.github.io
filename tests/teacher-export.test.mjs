// 合成班座與成績；執行實際教師頁、codec 和固定版本 SheetJS，不連網。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/teacher-export.mjs';
const time=Date.UTC(2026,9,1);
const record=(overrides={})=>({week:1,cls:999,seat:1,mask:3,tries:[2,3,4,5,6,7],time,...overrides});
function add(h,records){
  h.get('paste').value=records.map(r=>typeof r==='string'?r:h.evaluate(`CODEC.encode(${JSON.stringify(r)})`)).join('\n');
  h.get('b-add').onclick();
}
const json=(h,source)=>JSON.parse(h.evaluate(`JSON.stringify(${source})`));
// 依舊版規格獨立建立的固定 golden：999 班 2 號、mask=5、tries=[2,3,4,5]、時間格 1000。
const legacy='FKGJ-J6H8-0Z82M';

test('成績彙整：同班座去重、時間較新優先、同時刻過關較多優先及班週隔離',()=>{
  const h=setup();
  add(h,[record(),record(),record({mask:1,time:time-300000}),record({mask:7}),record({cls:998}),record({week:2})]);
  assert.equal(h.evaluate('all().length'),3);
  assert.equal(h.evaluate('recs["1-999-1"].mask'),7);
  assert.match(h.get('msg').textContent,/新增 3 人、更新 1 人、2 筆.*略過/);
  add(h,[record({mask:1,time:time+300000})]);
  assert.equal(h.evaluate('recs["1-999-1"].mask'),1,'時間較新可取代較多過關的舊資料');
  add(h,[record({mask:15,time:time+300000})]);
  assert.equal(h.evaluate('recs["1-999-1"].mask'),15);
  assert.deepEqual(json(h,'weeks()'),[1,2]);
  assert.deepEqual(json(h,'classes(1)'),[998,999]);
  assert.deepEqual(json(h,'classes(2)'),[999]);
  assert.equal(Object.keys(JSON.parse(h.stored.get('it9:grades'))).length,3);
});

test('舊 13 碼可與 16 碼混貼；舊碼補零、較舊跳過、驗證錯誤不入表',()=>{
  const h=setup();
  add(h,[legacy,record()]);
  assert.deepEqual(json(h,'recs["1-999-2"]'),{week:1,cls:999,seat:2,mask:5,tries:[2,3,4,5,0,0],time:Date.UTC(2025,11,31,16)+300000000,code:legacy});
  assert.equal(h.evaluate('all().length'),2);
  add(h,[record({seat:2,mask:15})]);
  add(h,[legacy,legacy.slice(0,-1)+'N']);
  assert.equal(h.evaluate('recs["1-999-2"].mask'),15);
  assert.match(h.get('msg').textContent,/1 筆.*舊.*略過.*1 筆驗證不過/);
  assert.equal(h.evaluate('all().length'),2);
});

function fixture(){
  const h=setup();
  add(h,[record({seat:3,mask:63}),record({cls:998}),record({week:2,mask:1}),legacy]);
  h.evaluate('sizes={999:4,998:2};curW=1;curC=999;render()');
  return h;
}

test('每週資料列：座號排序、未交補列、實際關數遮罩、嘗試合計及日期型別',()=>{
  const h=fixture();
  assert.deepEqual(json(h,'rowsFor(1,999).map(r=>[r.seat,!!r.missing])'),[[1,true],[2,false],[3,false],[4,true]]);
  const sheet=h.evaluate('weekSheet(1,999)'),rows=h.evaluate('XLSX.utils.sheet_to_json(weekSheet(1,999),{header:1,defval:""})');
  assert.equal(rows.length,5);
  assert.equal(rows[0].length,15);
  assert.deepEqual(Array.from(rows[1]),[999,1,...Array(12).fill(''),'未交']);
  assert.deepEqual(Array.from(rows[2].slice(0,12)),[999,2,1,0,1,0,2,2,3,4,5,14]);
  assert.deepEqual(Array.from(rows[3].slice(0,12)),[999,3,1,1,1,1,4,2,3,4,5,14]);
  // SheetJS 0.20 以 UTC 欄位保存本地時鐘；實際檔案值已比對與 0.18.5 相同。
  assert.equal(sheet.M4.t,'d');assert.equal(sheet.M4.v.getTime(),time-new Date(time).getTimezoneOffset()*60000);
  assert.equal(rows[2][13],legacy);
  assert.equal(rows[4].at(-1),'未交');
  assert.match(h.get('stats').innerHTML,/已交 <b>2<\/b> \/ 4/);
  assert.match(h.get('stats').innerHTML,/全部過關 <b>1<\/b>/);
});

test('學期資料列：跨週合計、未交留空、班人數與其他班隔離',()=>{
  const h=fixture();
  assert.deepEqual(json(h,'XLSX.utils.sheet_to_json(termSheet(999).ws,{header:1,defval:""}).slice(1)'),[
    [999,1,'',1,1,8],[999,2,2,'',2,8],[999,3,4,'',4,8],[999,4,'','',0,8]
  ]);
  assert.deepEqual(json(h,'termSheet(999).ws_'),[1,2]);
  assert.deepEqual(json(h,'XLSX.utils.sheet_to_json(termSheet(998).ws,{header:1,defval:""}).slice(1)'),[[998,1,2,2,4],[998,2,'',0,4]]);
});

for(const [button,names] of [['b-x1',['999班']],['b-x2',['998班','999班']],['b-x3',['總表','第7週','第8週']]]){
  test(`${button}：點擊匯出實際 xlsx，重新讀取工作表與資料列`,async()=>{
    const h=fixture();h.get(button).onclick();
    assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/\.xlsx$/);
    const bytes=Buffer.from(await h.blobs[0].arrayBuffer());
    assert.equal(bytes.subarray(0,2).toString(),'PK');
    // XLSX.read 留在同一 VM，避免跨 realm ArrayBuffer 型別影響解析。
    h.evaluate(`globalThis.exported=XLSX.read(new Uint8Array(${JSON.stringify([...bytes])}),{type:'array',cellDates:true})`);
    assert.deepEqual(json(h,'exported.SheetNames'),names);
    const actual=json(h,'XLSX.utils.sheet_to_json(exported.Sheets[exported.SheetNames[0]],{header:1,defval:""})');
    const expected=json(h,button==='b-x3'?'XLSX.utils.sheet_to_json(termSheet(999).ws,{header:1,defval:""})':`XLSX.utils.sheet_to_json(weekSheet(1,${button==='b-x2'?998:999}),{header:1,defval:""})`);
    // Excel 浮點日期重新讀取可能差 1ms；以顯示格式的秒精度比較。
    const normalize=rows=>rows.map(row=>row.map(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)?Math.round(Date.parse(v)/1000):v));
    assert.deepEqual(normalize(actual),normalize(expected));
    assert.equal(h.get('dlmsg').className,'msg ok');
  });
}
