// 僅用合成資料，執行實際教師頁、成績碼與固定版本 SheetJS；不連網。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/teacher-export.mjs';

test('離開提醒：空彙整不攔截，新增或更新會提醒，匯出及清空後解除',()=>{
  const h=setup();
  assert.equal(h.unload().defaultPrevented,false);
  h.get('paste').value='invalid';h.get('b-add').onclick();
  assert.equal(h.unload().defaultPrevented,false);
  h.add();assert.equal(h.unload().defaultPrevented,true);
  h.get('b-x1').onclick();assert.equal(h.unload().defaultPrevented,false);
  h.add();assert.equal(h.unload().defaultPrevented,false,'重複或較舊成績不造成未匯出狀態');
  h.get('paste').value=h.evaluate('CODEC.encode({week:1,cls:999,seat:1,mask:7,tries:[1,2,1],time:Date.UTC(2026,9,2)})');
  h.get('b-add').onclick();assert.equal(h.unload().defaultPrevented,true);
  h.size('3');h.clear();
  assert.equal(h.unload().defaultPrevented,false,'清空後即使留有班級人數也不提醒');
});

test('離開提醒：人數變動須重新匯出，相同人數與舊資料備份不會誤解除',()=>{
  const h=setup();h.add();h.get('b-x1').onclick();
  h.size('3');assert.equal(h.unload().defaultPrevented,true);
  h.get('b-legacy-export').onclick();assert.equal(h.unload().defaultPrevented,true);
  h.get('b-x1').onclick();assert.equal(h.unload().defaultPrevented,false);
  h.size('03');assert.equal(h.unload().defaultPrevented,false);
  h.size('');assert.equal(h.unload().defaultPrevented,true);
});

test('離開提醒：三種匯出只解除所含班週，其他班週繼續提醒',()=>{
  const h=setup();h.add();
  for(const data of ['{week:1,cls:998,seat:1,mask:1,tries:[1]}','{week:2,cls:999,seat:1,mask:1,tries:[1]}']){
    h.get('paste').value=h.evaluate('CODEC.encode({...'+data+',time:Date.UTC(2026,9,1)})');h.get('b-add').onclick();
  }
  h.evaluate('curW=1;curC=999;render()');
  h.get('b-x1').onclick();assert.equal(h.unload().defaultPrevented,true);
  h.get('b-x2').onclick();assert.equal(h.unload().defaultPrevented,true,'另週尚未匯出');
  h.get('b-x3').onclick();assert.equal(h.unload().defaultPrevented,false);
  h.size('2');assert.equal(h.unload().defaultPrevented,true,'人數變動影響該班所有週');
  h.get('b-x1').onclick();assert.equal(h.unload().defaultPrevented,true);
  h.evaluate('curW=2;render()');h.clear();assert.equal(h.unload().defaultPrevented,false);
});

for(const failure of ['XLSX.write=()=>{throw Error("synthetic write failure")}','URL.createObjectURL=()=>{throw Error("synthetic download failure")}','document.createElement=()=>({click(){throw Error("synthetic click failure")}})']){
  test('離開提醒：匯出失敗保留未匯出狀態（'+failure.split('=')[0]+'）',()=>{
    const h=setup();h.add();h.evaluate(failure);
    assert.throws(()=>h.get('b-x1').onclick());assert.equal(h.unload().defaultPrevented,true);
  });
}

test('記憶體彙整：新增、更新、人數與清除不讀寫儲存區，重開不還原',()=>{
  const h=setup();
  assert.equal(h.get('legacy-panel').hidden,true);
  const initialCalls=h.storageCalls.length;
  h.add();h.size('3');
  assert.equal(h.get('paste').value,'');assert.match(h.get('msg').textContent,/新增 1 人.*僅暫存.*請先匯出/);
  assert.equal(h.evaluate('all().length'),1);assert.equal(h.evaluate('sizes[999]'),3);
  assert.equal(h.evaluate('rowsFor(1,999).length'),3);
  h.get('paste').value=h.evaluate('CODEC.encode({week:1,cls:999,seat:1,mask:7,tries:[1,2,1,0,0,0],time:Date.UTC(2026,9,2)})');
  h.get('b-add').onclick();assert.equal(h.evaluate('all()[0].mask'),7);
  const reopened=h.reopen();
  assert.equal(reopened.evaluate('all().length'),0);assert.equal(reopened.evaluate('Object.keys(sizes).length'),0);
  assert.equal(reopened.get('b-x1').disabled,true);
  h.size('');assert.equal(h.evaluate('Object.keys(sizes).length'),0);
  h.clear();assert.equal(h.evaluate('all().length'),0);
  assert.equal(h.storageCalls.length,initialCalls,'日常彙整不再讀取或寫入 localStorage');
  assert.equal(h.stored.size,0);
});

test('儲存區被封鎖：提示檢查失敗，記憶體彙整、人數及 Excel 下載仍可用',async()=>{
  const h=setup({storageErrors:{getItem:true,setItem:true,removeItem:true}});
  assert.match(h.get('legacy-msg').textContent,/無法讀取/);
  assert.equal(h.get('b-legacy-export').disabled,true);
  h.add();h.size('2');h.get('b-x1').onclick();
  assert.equal(h.evaluate('all().length'),1);assert.equal(h.evaluate('sizes[999]'),2);
  assert.equal(Buffer.from(await h.blobs[0].arrayBuffer()).subarray(0,2).toString(),'PK');
  assert.equal(h.storageCalls.some(c=>c.method!=='getItem'),false);
});

function legacyStore(){
  const seed=setup();seed.add();
  return new Map([
    ['it9:grades',seed.evaluate('JSON.stringify(recs)')],
    ['it9:sizes','{"999":3,"998":1000000,"damaged":null}'],
    ['synthetic:unrelated','keep'],
  ]);
}
for(const [label,entries] of [
  ['合法成績及混合損毀人數',()=>legacyStore()],
  ['無法解析的兩鍵',()=>new Map([['it9:grades','{'],['it9:sizes','not JSON']])],
  ['空字串與非物件根節點',()=>new Map([['it9:grades',''],['it9:sizes','null']])],
  ['僅有成績鍵',()=>new Map([['it9:grades','[]']])],
  ['僅有人數鍵',()=>new Map([['it9:sizes','{"999":2}']])],
])test(`舊資料（${label}）：不還原、明示匯出原值、取消不刪、確認才完整移除`,async()=>{
  const stored=entries(),before=new Map(stored),h=setup({stored});
  assert.equal(h.evaluate('all().length'),0);assert.equal(h.evaluate('Object.keys(sizes).length'),0);
  assert.equal(h.get('legacy-panel').hidden,false);assert.equal(h.get('legacy-confirm').hidden,true);
  assert.match(h.get('legacy-msg').textContent,/尚未載入.*未刪除/);
  assert.equal(h.get('b-legacy-clear').disabled,true);
  h.get('legacy-yes').onclick();assert.deepEqual(stored,before,'不能略過備份及確認步驟');
  h.add();h.size('2');
  assert.deepEqual(stored,before,'新增彙整與人數不能覆寫舊鍵');
  const reopened=h.reopen();assert.equal(reopened.evaluate('all().length'),0);
  assert.equal(reopened.evaluate('Object.keys(sizes).length'),0);
  assert.equal(h.downloads.length,0,'偵測不自動下載');
  h.get('b-legacy-export').onclick();
  assert.equal(h.downloads.length,1);assert.match(h.downloads[0].name,/^資訊科技_舊瀏覽器資料_\d{8}\.json$/);
  assert.deepEqual(JSON.parse(await h.blobs[0].text()),{'it9:grades':before.get('it9:grades')??null,'it9:sizes':before.get('it9:sizes')??null});
  assert.deepEqual(stored,before,'下載仍不刪除');
  h.get('legacy-yes').onclick();assert.deepEqual(stored,before,'下載後仍須開啟確認');
  h.get('b-legacy-clear').onclick();assert.equal(h.get('legacy-confirm').hidden,false);
  h.get('legacy-no').onclick();assert.equal(h.get('legacy-confirm').hidden,true);
  assert.deepEqual(stored,before,'取消保留完整舊資料');
  h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.equal(stored.has('it9:grades'),false);assert.equal(stored.has('it9:sizes'),false);
  assert.deepEqual(stored,new Map([...before].filter(([k])=>!['it9:grades','it9:sizes'].includes(k))));
  assert.deepEqual(h.storageCalls.filter(c=>c.method==='removeItem').map(c=>c.key),['it9:grades','it9:sizes']);
  assert.equal(h.evaluate('all().length'),1);assert.equal(h.evaluate('sizes[999]'),2,'目前記憶體彙整不受清除影響');
  assert.equal(h.get('legacy-panel').hidden,true);
  assert.match(h.get('dlmsg').textContent,/已完整清除.*關閉前請先匯出/);
  assert.equal(h.reopen().get('legacy-panel').hidden,true);
});

test('清除目前班週只改記憶體；其他班仍可匯出，舊鍵不變',()=>{
  const stored=legacyStore(),before=new Map(stored),h=setup({stored});h.add();
  h.get('paste').value=h.evaluate('CODEC.encode({week:1,cls:998,seat:1,mask:1,tries:[1],time:Date.UTC(2026,9,1)})');
  h.get('b-add').onclick();h.clear();
  assert.equal(h.evaluate('all().length'),1);assert.equal(h.evaluate('all()[0].cls'),999);
  h.get('b-x1').onclick();assert.equal(h.downloads.length,1);
  assert.deepEqual(stored,before);assert.equal(h.get('legacy-panel').hidden,false);
});

test('其他分頁在備份後變動舊資料：拒絕清除，重新備份及確認後才刪',()=>{
  const h=setup({stored:legacyStore()});h.get('b-legacy-export').onclick();
  h.stored.set('it9:grades','synthetic changed data');
  h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.equal(h.stored.get('it9:grades'),'synthetic changed data');
  assert.equal(h.storageCalls.some(c=>c.method==='removeItem'),false);
  assert.match(h.get('legacy-msg').textContent,/已變動.*未清除.*重新下載/);
  assert.equal(h.get('b-legacy-clear').disabled,true);
  h.get('b-legacy-export').onclick();h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.equal(h.stored.has('it9:grades'),false);assert.equal(h.stored.has('it9:sizes'),false);
});

test('備份下載失敗：保留兩鍵且不允許清除',()=>{
  const stored=legacyStore(),before=new Map(stored),h=setup({stored});
  h.evaluate('URL.createObjectURL=()=>{throw Error("synthetic download failure")}');
  h.get('b-legacy-export').onclick();h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.deepEqual(stored,before);assert.equal(h.get('b-legacy-clear').disabled,true);
  assert.match(h.get('legacy-msg').textContent,/下載失敗.*未刪除/);
});

for(const key of ['it9:grades','it9:sizes'])test(`清除 ${key} 失敗：仍嘗試另一鍵、如實提示，再次備份確認可清乾淨`,()=>{
  const h=setup({stored:legacyStore(),storageErrors:{removeItem:key}});
  h.get('b-legacy-export').onclick();h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.equal(h.stored.has(key),true);
  assert.equal(h.stored.has(key==='it9:grades'?'it9:sizes':'it9:grades'),false);
  assert.equal(h.get('legacy-panel').hidden,false);assert.match(h.get('legacy-msg').textContent,/部分.*未能清除/);
  assert.equal(h.get('b-legacy-clear').disabled,true);
  delete h.storageErrors.removeItem;
  h.get('b-legacy-export').onclick();h.get('b-legacy-clear').onclick();h.get('legacy-yes').onclick();
  assert.equal(h.stored.has('it9:grades'),false);assert.equal(h.stored.has('it9:sizes'),false);
});

test('SheetJS 0.20.3：三種教師匯出保留欄位、成績、缺交、日期、欄寬及工作表順序',async()=>{
  const t=setup();t.add();t.size('3');
  assert.equal(t.evaluate('XLSX.version'),'0.20.3');
  assert.equal(t.evaluate('typeof XLSX.writeFile'),'function');
  for(const data of [
    '{week:1,cls:998,seat:2,mask:5,tries:[2,0,3,0,0,0],time:Date.UTC(2026,9,2)}',
    '{week:2,cls:999,seat:1,mask:1,tries:[4,0,0,0,0,0],time:Date.UTC(2026,9,3)}'
  ]){t.get('paste').value=t.evaluate('CODEC.encode('+data+')');t.get('b-add').onclick();}
  t.evaluate('curW=1;curC=999');
  const roundHead=['第1單','第2單','錢夠不夠','班級團購'];
  const header=['班級','座號',...roundHead.map(x=>x+'（1=過）'),'過關數',...roundHead.map(x=>x+' 嘗試次數'),'總嘗試次數','最後更新','成績碼','備註'];
  const termHeader=['班級','座號','第7週 過關數（共4關）','第8週 過關數（共4關）','合計過關數','合計關卡數'];
  for(const [button,names] of [
    ['b-x1',['999班']],['b-x2',['998班','999班']],['b-x3',['總表','第7週','第8週']]
  ]){
    t.get(button).onclick();
    assert.match(t.downloads.at(-1).name,/^資訊科技_.*\.xlsx$/);
    const bytes=Array.from(new Uint8Array(await t.blobs.at(-1).arrayBuffer()));
    const book=t.evaluate('XLSX.read('+JSON.stringify(bytes)+',{type:"array",cellStyles:true})');
    assert.deepEqual(Array.from(book.SheetNames),names);
    const weekly=book.Sheets[button==='b-x3'?'第7週':'999班'];
    assert.deepEqual(Array.from({length:15},(_,i)=>weekly[String.fromCharCode(65+i)+'1'].v),header);
    assert.deepEqual(Array.from({length:12},(_,i)=>weekly[String.fromCharCode(65+i)+'2'].v),[999,1,1,1,0,0,2,1,2,0,0,3]);
    assert.equal(weekly.N2.v,t.code);assert.equal(weekly.O3.v,'未交');assert.equal(weekly.O4.v,'未交');
    assert.equal(weekly.M2.t,'n');assert.equal(weekly.M2.z,'yyyy/mm/dd hh:mm');
    const date=new Date(Date.UTC(2026,9,1));
    assert.ok(Math.abs(weekly.M2.v-(25569+(date.getTime()-date.getTimezoneOffset()*60000)/86400000))<1e-8);
    assert.deepEqual(Array.from(weekly['!cols'],x=>x.wch),header.map(h=>Math.max(8,Math.min(20,h.length*2))));
    if(button==='b-x2')assert.deepEqual(['A2','B2','C2','D2','E2','F2','G2','H2','I2','J2','K2','L2'].map(k=>book.Sheets['998班'][k].v),[998,2,1,0,1,0,2,2,0,3,0,5]);
    if(button==='b-x3'){
      const total=book.Sheets['總表'];
      assert.deepEqual(Array.from({length:6},(_,i)=>total[String.fromCharCode(65+i)+'1'].v),termHeader);
      assert.deepEqual(Array.from({length:6},(_,i)=>total[String.fromCharCode(65+i)+'2'].v),[999,1,2,1,3,8]);
      assert.equal(total.E3.v,0);assert.equal(total.F3.v,8);
      assert.equal(book.Sheets['第8週'].H2.v,4);
    }
  }
});
