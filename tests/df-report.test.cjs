'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {gzipSync} = require('node:zlib');
const {randomBytes} = require('node:crypto');
const R = require('../assets/df-report.js');
const html = fs.readFileSync('115-df/a/index.html','utf8');
// 只擷取公開結構及原函式，不讀儲存區、不執行頁面初始化或解密素材。
const pub = JSON.parse(html.match(/<script id="pub" type="application\/json">(.*?)<\/script>/s)[1]);
const source = (start,end) => html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const fixedTime = '2026-10-21T00:00:00.000Z';
function blank() {
  const context = vm.createContext({PUB:pub, APPV:pub.appVersion, VERSION:pub.version,
    newCid:()=> '0'.repeat(24), now:()=>fixedTime});
  vm.runInContext(source('function newSusp()', 'let S=null'),context);
  return JSON.parse(JSON.stringify(vm.runInContext("blankState('999','99')",context)));
}
function full(session, repeat=500) {
  const state = blank();
  function fill(value) {
    for (const key of Object.keys(value)) {
      if (value[key] === '') value[key] = '合成作答😀</script>'.repeat(repeat);
      else if (value[key] && typeof value[key] === 'object') fill(value[key]);
    }
  }
  fill(state);
  state.h1.submittedAt = fixedTime;
  if (session >= 2) {
    state.b2.unlockedAt = fixedTime;
    for (const id of ['E05','E07F','E08','SUP']) state.b2.ev[id] = {
      key:'合成作答'.repeat(repeat), rel:'支持', why:'合成理由'.repeat(repeat),
      exif:{time:'11:04',make:'合成',model:'合成',dim:'100',ori:'1'}
    };
    state.b2.hints = [1,2,3].map(level=>({level,at:fixedTime}));
    state.concl.doneAt = fixedTime;
  }
  if (session >= 3) {
    state.s2.unlockedAt = state.reveal.unlockedAt = state.reveal.finalAt = fixedTime;
    state.gallery.comments = Array.from({length:6},()=>({seat:'98',stance:'支持',ev:'E01',text:'合成留言'.repeat(20),at:fixedTime}));
  }
  state.log = Array.from({length:5000},()=>({t:fixedTime,e:'open',d:'E01'}));
  state.exports = [fixedTime];
  return state;
}
const packed = json => ({schemaVersion:1,encoding:'gzip-base64',payload:gzipSync(json).toString('base64')});

test('白名單逐層排除合成帳密、個人欄位、素材及未知匯入欄位，原狀態不變',()=>{
  const state = full(3,1);
  state.name = state.email = state.uid = state.password = 'synthetic-excluded';
  state.b2.pw = state.reveal.pw = 'synthetic-excluded';
  state.b2.ev.E05.image = state.timeline['11:04'].token = 'synthetic-excluded';
  state.gallery.comments[0].email = state.log[0].token = 'synthetic-excluded';
  state.ev.UNKNOWN = {fact:'synthetic-excluded'};
  state.material = {image:'synthetic-excluded'};
  const before = JSON.stringify(state);
  assert.ok(!R.serialize(state).includes('synthetic-excluded'));
  assert.equal(JSON.stringify(state),before);
  assert.equal(R.select(state).reveal.finalAt,fixedTime);
});

test('空白／一般容量、emoji 與 script 標籤可 ASCII 往返',async()=>{
  for (const state of [blank(),full(3,1)]) {
    const encoded = await R.encode(state);
    assert.equal(encoded.ok,true);
    assert.equal(encoded.encoding,'ascii-json');
    assert.match(encoded.payload,/^[ -~]+$/);
    assert.ok(!R.serialize(state).includes('</script>'));
    assert.deepEqual(await R.decode(encoded),R.select(state));
  }
});
for (const session of [1,2,3]) test(`第 ${session} 堂合成最大量壓力情境（長答＋5000 筆紀錄）`,async()=>{
  const state = full(session);
  const encoded = await R.encode(state);
  assert.equal(encoded.ok,true);
  assert.equal(encoded.encoding,'gzip-base64');
  assert.ok(encoded.payload.length <= R.MAX_PAYLOAD_BYTES);
  assert.deepEqual(await R.decode(encoded),R.select(state));
});

test('512 KiB 正好使用 ASCII，多一 byte 改 gzip；2 MiB 原文邊界',async()=>{
  const state = blank();
  const overhead = Buffer.byteLength(R.serialize(state));
  const asciiOverhead = R.serialize(state).replace(/[\u007f-\uffff]/g, ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0')).length;
  state.problem = 'a'.repeat(R.MAX_PAYLOAD_BYTES-asciiOverhead);
  assert.equal((await R.encode(state)).encoding,'ascii-json');
  assert.equal((await R.encode(state)).payload.length,R.MAX_PAYLOAD_BYTES);
  state.problem += 'a';
  assert.equal((await R.encode(state)).encoding,'gzip-base64');
  state.problem = 'a'.repeat(R.MAX_JSON_BYTES-overhead);
  assert.equal((await R.encode(state)).ok,true);
  assert.deepEqual(await R.decode(await R.encode(state)),R.select(state));
  state.problem += 'a';
  const before = JSON.stringify(state), result = await R.encode(state);
  assert.equal(result.action,'download');
  assert.equal(result.reason,'json-too-large');
  assert.equal(result.message,'報告過大，請下載報告檔交給老師');
  assert.equal(JSON.stringify(state),before);
  // 本機下載不套用雲端容量上限。
  assert.equal(JSON.parse(R.serialize(state)).problem,state.problem);
});

test('不可壓縮文字：gzip 小於 512 KiB 但 base64 膨脹超限仍改下載',async()=>{
  const state = blank();
  state.problem = randomBytes(430000).toString('base64');
  const gzip = gzipSync(R.serialize(state));
  assert.ok(gzip.length < R.MAX_PAYLOAD_BYTES);
  assert.ok(gzip.toString('base64').length > R.MAX_PAYLOAD_BYTES);
  const before = JSON.stringify(state);
  assert.equal((await R.encode(state)).action,'download');
  assert.equal(JSON.stringify(state),before);
});

test('缺少壓縮／解壓 API 時回退下載；小報告仍可處理',async()=>{
  const compression = global.CompressionStream, decompression = global.DecompressionStream;
  try {
    for (const key of ['CompressionStream','DecompressionStream']) {
      global[key] = undefined;
      assert.equal((await R.encode(full(3))).reason,'compression-unavailable');
      assert.equal((await R.encode(blank())).encoding,'ascii-json');
      global.CompressionStream = compression; global.DecompressionStream = decompression;
    }
    global.DecompressionStream = undefined;
    await assert.rejects(R.decode(packed(R.serialize(blank()))),/無法解壓/);
  } finally { global.CompressionStream = compression; global.DecompressionStream = decompression; }
});

test('解碼拒絕壓縮炸彈、損壞 gzip／base64／UTF-8／JSON 與錯誤版本',async()=>{
  await assert.rejects(R.decode(packed('a'.repeat(R.MAX_JSON_BYTES+1))),/容量/);
  await assert.rejects(R.decode(packed(Buffer.from([0xff]))));
  await assert.rejects(R.decode(packed('{')));
  for (const change of [
    {schemaVersion:2}, {encoding:'other'}, {payload:'中文'}, {payload:''},
    {payload:'a'.repeat(R.MAX_PAYLOAD_BYTES+1)},
    {encoding:'gzip-base64',payload:'!!!!'}, {encoding:'gzip-base64',payload:'AAAA'},
    {encoding:'gzip-base64',payload:'AB=='}
  ]) await assert.rejects(R.decode({...await R.encode(blank()),...change}));
  await assert.rejects(R.decode(packed('{"app":"other"}')));
});

test('解碼檢查型別、文字／陣列上界並排除未知欄位',async()=>{
  for (const mutate of [
    s=>s.log = {}, s=>s.log = [{t:fixedTime,e:'open',d:{password:'synthetic'}}],
    s=>s.h1.checks = ['true'], s=>s.problem = 123,
    s=>s.log = Array(20001).fill({t:'',e:'',d:null})
  ]) {
    const state = blank(); mutate(state);
    await assert.rejects(R.decode(packed(JSON.stringify(state))));
  }
  const state = blank(); state.unknown = {password:'synthetic'};
  assert.deepEqual(await R.decode(packed(JSON.stringify(state))),R.select(blank()));
  state.log = Array(20001).fill({t:'',e:'',d:null});
  assert.equal((await R.encode(state)).action,'download');
  assert.equal(JSON.parse(R.serialize(state)).log.length,20001);
});

async function importInPage(report) {
  const context = vm.createContext({ VERSION:pub.version, impWho:{cls:'999',seat:'99'},
    S:null, recOn:false, now:()=>fixedTime, save:()=>{}, toast:()=>{}, boot:()=>{} });
  vm.runInContext(source('async function importReport(', 'async function boot('), context);
  await context.importReport({target:{files:[{name:'synthetic.html',text:async()=>report}],value:''}});
  return JSON.parse(JSON.stringify(context.S));
}
test('原 importReport 可匯入舊 HTML 報告與新序列化報告',async()=>{
  const state = full(3,1);
  state.ev.E01.interp = '舊版解釋';
  for (const data of [JSON.stringify(state).replace(/<\//g,'<\\/'),R.serialize(state)]) {
    const restored = await importInPage(`<script id="df-report" type="application/json">${data}</script>`);
    assert.deepEqual(R.select({...restored,log:restored.log.slice(0,-1)}),R.select(state));
    assert.equal(restored.log.at(-1).e,'import');
  }
});

test('下載報告維持原格式（保留 cid、gallery.done 等全部欄位），可再匯入且維持既有答案',async()=>{
  const state = full(3,1); state.cid = 'cid-test'; state.gallery.done = true;
  const context = vm.createContext({S:state,PUB:pub,B2:null,VERSION:pub.version,
    TL_SLOTS:pub.timeline,DFReport:R,hm:()=>'',esc:s=>String(s??'')});
  vm.runInContext(source('function reportHTML()', 'function exportReport('), context);
  const report = context.reportHTML();
  const saved = JSON.parse(report.match(/<script id="df-report" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(saved.cid,'cid-test');
  assert.equal(saved.gallery.done,true);
  assert.equal(saved.b2.pw,undefined);
  assert.equal((await importInPage(report)).reveal.r1,state.reveal.r1);
  assert.ok(html.indexOf('assets/df-report.js') < html.indexOf('function reportHTML()'));
});

test('瀏覽器 script 可獨立載入；壓縮失敗回退下載且快照不隨後續編輯改變',async()=>{
  const browser = vm.createContext({TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream,btoa,atob});
  vm.runInContext(fs.readFileSync('assets/df-report.js','utf8'),browser);
  assert.equal(typeof browser.DFReport.encode,'function');
  const state = full(3), original = R.select(state);
  const pending = browser.DFReport.encode(state);
  state.problem = '稍後的新作答';
  const decoded = await browser.DFReport.decode(await pending);
  assert.deepEqual(JSON.parse(JSON.stringify(decoded)),original);
  const compression = global.CompressionStream;
  try {
    global.CompressionStream = class { constructor() { throw new Error('synthetic failure'); } };
    assert.equal((await R.encode(full(3))).reason,'compression-failed-or-too-large');
  } finally { global.CompressionStream = compression; }
});

test('紀錄筆數恰好上限可往返；超過筆數仍完整保留本機下載內容',async()=>{
  const state = blank();
  state.log = Array.from({length:20000},()=>({t:fixedTime,e:'open',d:'E01'}));
  const encoded = await R.encode(state);
  assert.equal(encoded.ok,true);
  assert.deepEqual(await R.decode(encoded),R.select(state));
  state.log.push({t:fixedTime,e:'open',d:'E01'});
  assert.equal((await R.encode(state)).action,'download');
  assert.equal(JSON.parse(R.serialize(state)).log.length,20001);
});
