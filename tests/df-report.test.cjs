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
const asciiPacked = json => ({schemaVersion:1,encoding:'ascii-json',payload:json.replace(/[\u007f-\uffff]/g,
  ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'))});
const minimal = () => ({app:'DF-investigation',appVersion:'synthetic',version:'synthetic',cls:'999',seat:'99'});
function stateAt(path,value) {
  const state = minimal();
  let parent = state;
  for (let i=0; i<path.length-1; i++) parent = parent[path[i]] = typeof path[i+1] === 'number' ? [] : {};
  parent[path.at(-1)] = value;
  return state;
}

test('解碼拒絕非物件 envelope，包括附有合法欄位的陣列與函式',async()=>{
  const encoded = asciiPacked(JSON.stringify(minimal()));
  assert.deepEqual(await R.decode(encoded),minimal());
  for (const value of [undefined,null,false,true,0,1,'synthetic',[],
    Object.assign([],encoded),Object.assign(()=>{},encoded)]) {
    await assert.rejects(R.decode(value),/報告格式不正確/);
  }
});

test('白名單陣列的空洞不得編碼成解碼端拒絕的 null 項目',async()=>{
  for (const extra of [{exports:Array(1)},{log:Array(1)},{h1:{checks:Array(4)}},
    {susp:[{ev:Array(1)}]}]) {
    const state = {...minimal(),...extra};
    assert.equal((await R.encode(state)).reason,'invalid-report');
    await assert.rejects(R.decode(asciiPacked(JSON.stringify(state))),/報告格式不正確/);
  }
});

test('兩種編碼均拒絕截斷 JSON；合法 base64 包裝的每個 gzip 截斷位置也拒絕',async()=>{
  const state = {...minimal(),problem:'合成😀"\\\n'};
  const json = JSON.stringify(state), ascii = asciiPacked(json), gzip = gzipSync(json);
  assert.deepEqual(await R.decode(ascii),state);
  assert.deepEqual(await R.decode(packed(json)),state);
  for (let end=0; end<ascii.payload.length; end++) {
    await assert.rejects(R.decode({...ascii,payload:ascii.payload.slice(0,end)}),`JSON 截斷於 ${end}`);
  }
  for (let end=0; end<gzip.length; end++) {
    await assert.rejects(R.decode({schemaVersion:1,encoding:'gzip-base64',
      payload:gzip.subarray(0,end).toString('base64')}),`gzip 截斷於 ${end}`);
  }
  // 完整 gzip 容器內的 JSON 截斷，不能只靠 gzip 校驗擋下。
  for (const end of [1,json.indexOf('problem'),json.length-1]) {
    await assert.rejects(R.decode(packed(json.slice(0,end))));
  }
  for (const offset of [0,gzip.length-8,gzip.length-4]) {
    const corrupt = Buffer.from(gzip); corrupt[offset] ^= 1;
    await assert.rejects(R.decode({schemaVersion:1,encoding:'gzip-base64',payload:corrupt.toString('base64')}));
  }
});

test('gzip 內文字的 UTF-8 截斷、錯誤接續、過長編碼與 surrogate 均拒絕',async()=>{
  const [before,after] = JSON.stringify({...minimal(),problem:'marker'}).split('marker');
  for (const bytes of [[0xc3],[0xe2,0x82],[0xf0,0x9f,0x98],[0xc3,0x28],
    [0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80]]) {
    await assert.rejects(R.decode(packed(Buffer.concat([Buffer.from(before),Buffer.from(bytes),Buffer.from(after)]))));
  }
});

test('兩種編碼均檢查白名單欄位型別，保留選填欄位與合法純量相容性',async()=>{
  const cases = [
    [['problem'],[null,123,false,{},[]]],
    [['briefed'],[null,0,'false',{},[]]],
    [['h1'],[null,0,false,'synthetic',[]]],
    [['exports'],[null,0,false,'synthetic',{}]],
    [['exports',0],[null,123,false,{},[]]],
    [['susp',0],[null,123,false,'synthetic',[]]],
    [['h1','checks',0],[null,0,'false',{},[]]],
    [['ev','E01','exif','time'],[null,123,false,{},[]]],
    [['timeline','11:04','src',0],[null,123,false,{},[]]],
    [['s2','unlockedAt'],[123,false,{},[]]],
    [['b2','hints',0,'level'],[null,'1',true,{},[]]],
    [['log',0,'d'],[{},[]]]
  ];
  for (const wrap of [asciiPacked,packed]) {
    for (const value of [null,[],true,1,'synthetic',{}]) {
      await assert.rejects(R.decode(wrap(JSON.stringify(value))),/報告格式不正確/);
    }
    for (const [path,values] of cases) for (const value of values) {
      await assert.rejects(R.decode(wrap(JSON.stringify(stateAt(path,value)))),/報告格式不正確/,path.join('.'));
    }
    await assert.rejects(R.decode(wrap(JSON.stringify(stateAt(['b2','hints'],[{level:1}]))
      .replace('"level":1','"level":1e400'))),/報告格式不正確/);
    assert.deepEqual(await R.decode(wrap(JSON.stringify(minimal()))),minimal());
    for (const value of [null,true,false,0,0.5,'synthetic']) {
      const state = {...minimal(),cls:value,seat:value,gallery:{comments:[{seat:value}]},
        log:[{d:value}],s2:{unlockedAt:null},reveal:{finalAt:fixedTime}};
      assert.deepEqual(await R.decode(wrap(JSON.stringify(state))),state);
    }
  }
});

test('兩種編碼均接受各白名單陣列恰好上限，並拒絕多一筆',async()=>{
  const cases = [
    [['susp'],1000,{text:''}], [['susp',0,'ev'],100,'E01'],
    [['timeline','11:04','src'],100,'E01'], [['h1','ev'],100,'E01'],
    [['h1','checks'],4,false], [['h2','ev'],100,'E01'], [['concl','ev'],100,'E01'],
    [['gallery','comments'],1000,{seat:'99',text:''}],
    [['b2','hints'],20000,{level:1,at:''}], [['exports'],20000,''],
    [['log'],20000,{t:'',e:'',d:null}]
  ];
  for (const [path,max,item] of cases) {
    const list = Array(max).fill(item), state = stateAt(path,list);
    for (const wrap of [asciiPacked,packed]) {
      assert.deepEqual(await R.decode(wrap(JSON.stringify(state))),state,path.join('.'));
    }
    list.push(item);
    for (const wrap of [asciiPacked,packed]) {
      await assert.rejects(R.decode(wrap(JSON.stringify(state))),/報告格式不正確/,path.join('.'));
    }
  }
});

test('ASCII 與 gzip 的 512 KiB payload 邊界可解碼',async()=>{
  const state = {...minimal(),problem:''};
  state.problem = 'a'.repeat(R.MAX_PAYLOAD_BYTES-JSON.stringify(state).length);
  const ascii = asciiPacked(JSON.stringify(state));
  assert.equal(ascii.payload.length,R.MAX_PAYLOAD_BYTES);
  assert.deepEqual(await R.decode(ascii),state);

  // 使用 gzip 標準 FCOMMENT 欄位精確補足位元組，避免依賴壓縮率或亂數。
  const gzip = gzipSync(JSON.stringify(minimal())), header = Buffer.from(gzip.subarray(0,10));
  header[3] |= 0x10;
  const padded = Buffer.concat([header,Buffer.alloc(R.MAX_PAYLOAD_BYTES/4*3-gzip.length-1,0x61),
    Buffer.from([0]),gzip.subarray(10)]);
  const envelope = {schemaVersion:1,encoding:'gzip-base64',payload:padded.toString('base64')};
  assert.equal(envelope.payload.length,R.MAX_PAYLOAD_BYTES);
  assert.deepEqual(await R.decode(envelope),minimal());
});

test('非字串、非可列印 ASCII、非標準 base64 及超界 payload 在解壓前拒絕',async()=>{
  let starts = 0;
  const browser = vm.createContext({TextEncoder,TextDecoder,Blob,btoa,atob,
    DecompressionStream:class { constructor() { starts++; throw new Error('不應開始解壓'); } }});
  vm.runInContext(fs.readFileSync('assets/df-report.js','utf8'),browser);
  for (const encoding of ['ascii-json','gzip-base64']) {
    for (const payload of [undefined,null,0,true,{},[],new String('{}'),'',
      '\t','\n','\r','\x00','\x1f','\x7f','中文','😀','a'.repeat(R.MAX_PAYLOAD_BYTES+1)]) {
      await assert.rejects(browser.DFReport.decode({schemaVersion:1,encoding,payload}),/報告格式不正確/);
    }
  }
  for (const payload of ['A','AAA','AAAA=','AA===','A=AA','AA==AAAA','_w==','-w==',
    'AB==','AAB=',' AAAA','AAAA ','AA AA','AAAA\n']) {
    await assert.rejects(browser.DFReport.decode({schemaVersion:1,encoding:'gzip-base64',payload}),/報告格式不正確/);
  }
  assert.equal(starts,0);
});

test('解壓後以 UTF-8 bytes 檢查 2 MiB 邊界，超過一 byte 即拒絕',async()=>{
  const state = {...minimal(),problem:''}, room = R.MAX_JSON_BYTES-Buffer.byteLength(JSON.stringify(state));
  state.problem = '文'.repeat(Math.floor(room/3))+'a'.repeat(room%3);
  const json = JSON.stringify(state);
  assert.ok(json.length < R.MAX_JSON_BYTES);
  assert.equal(Buffer.byteLength(json),R.MAX_JSON_BYTES);
  assert.deepEqual(await R.decode(packed(json)),state);
  state.problem += 'a';
  await assert.rejects(R.decode(packed(JSON.stringify(state))),/容量上限/);
});

test('解壓串流超過 2 MiB 時取消讀取並釋放鎖，不進入 UTF-8 或 JSON 解碼',async()=>{
  let reads = 0, cancels = 0, parses = 0, decodes = 0;
  const stream = new ReadableStream({
    pull(controller) {
      reads++;
      assert.ok(reads <= 2,'不讀取超限後的第三塊資料');
      controller.enqueue(new Uint8Array(reads === 1 ? R.MAX_JSON_BYTES : 1));
    },
    cancel() { cancels++; }
  },{highWaterMark:0});
  const browser = vm.createContext({TextEncoder,btoa,atob,
    TextDecoder:class { decode() { decodes++; return '{}'; } },
    JSON:{parse(json) { parses++; return JSON.parse(json); }},
    Blob:class { stream() { return {pipeThrough:()=>stream}; } },
    DecompressionStream:class {}});
  vm.runInContext(fs.readFileSync('assets/df-report.js','utf8'),browser);
  await assert.rejects(browser.DFReport.decode(packed('{}')),/容量上限/);
  assert.equal(reads,2);
  assert.equal(cancels,1);
  assert.equal(stream.locked,false);
  assert.equal(decodes,0);
  assert.equal(parses,0);
});
const ascii = payload => ({schemaVersion:1,encoding:'ascii-json',payload});
const formatError = error => error instanceof Error && error.message === '報告格式不正確';

test('截斷 JSON、錯誤 escape 與錯誤資料型別均回報一致格式錯誤',async()=>{
  const json = R.serialize({app:'DF-investigation',appVersion:'1',version:'A'});
  for (const value of [json.slice(0,-1), '{', '{"problem":"\\uZZZZ"}',
    '{"problem":"\\x20"}', json+' trailing', 'null', '[]', '123',
    JSON.stringify({...blank(),problem:123})]) {
    for (const envelope of [ascii(value),packed(value)]) {
      await assert.rejects(R.decode(envelope),formatError);
    }
  }
});

test('截斷／損壞 gzip、非法 UTF-8 與非標準 base64 均回報一致格式錯誤',async()=>{
  const gzip = gzipSync(R.serialize(blank()));
  const corrupted = Buffer.from(gzip); corrupted[corrupted.length-8] ^= 1;
  for (const bytes of [gzip.subarray(0,1),gzip.subarray(0,10),gzip.subarray(0,-1),corrupted]) {
    await assert.rejects(R.decode({schemaVersion:1,encoding:'gzip-base64',payload:bytes.toString('base64')}),formatError);
  }
  for (const bytes of [[0xff],[0xc3],[0xc0,0xaf],[0xed,0xa0,0x80]]) {
    await assert.rejects(R.decode(packed(Buffer.from(bytes))),formatError);
  }
  for (const payload of ['!!!!','A','AAA','AAAA=','A===','AA=A','AB==','AAB=','AA-_','AA==\n']) {
    await assert.rejects(R.decode({schemaVersion:1,encoding:'gzip-base64',payload}),formatError);
  }
});

test('接近 512 KiB 的合法 base64 可往返，等長損壞資料穩定回報格式錯誤',async()=>{
  // 固定的合成位元組避免亂數壓縮率導致邊界測試不穩定。
  let seed = 1;
  const bytes = Buffer.alloc(380000);
  for (let i=0;i<bytes.length;i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    bytes[i] = seed & 255;
  }
  const state = blank(); state.problem = bytes.toString('base64');
  const envelope = packed(R.serialize(state));
  assert.ok(envelope.payload.length > R.MAX_PAYLOAD_BYTES * 0.95);
  assert.ok(envelope.payload.length <= R.MAX_PAYLOAD_BYTES);
  assert.deepEqual(await R.decode(envelope),R.select(state));
  await assert.rejects(R.decode({...envelope,payload:'A'.repeat(R.MAX_PAYLOAD_BYTES)}),formatError);
});

test('多份報告同時解碼時，損壞報告不影響有效報告或後續重試',async()=>{
  const state = blank(); state.problem = '合成作答😀';
  const valid = packed(R.serialize(state));
  const results = await Promise.allSettled([
    R.decode(valid),R.decode(packed('{')),R.decode(packed(Buffer.from([0xff]))),R.decode(valid)
  ]);
  for (const index of [0,3]) {
    assert.equal(results[index].status,'fulfilled');
    assert.deepEqual(results[index].value,R.select(state));
  }
  for (const index of [1,2]) {
    assert.equal(results[index].status,'rejected');
    assert.ok(formatError(results[index].reason));
  }
  assert.deepEqual(await R.decode(valid),R.select(state));
});

test('既有陣列上限內可往返，超限一筆固定回報格式錯誤且 encode 改下載',async()=>{
  for (const [path,max,item] of [
    [['susp'],1000,{text:'',ev:[],want:'',conf:''}],
    [['gallery','comments'],1000,{seat:'99',stance:'',ev:'',text:'',at:''}],
    [['h1','ev'],100,'E01'], [['h1','checks'],4,true],
    [['b2','hints'],20000,{level:1,at:''}],
    [['exports'],20000,''], [['log'],20000,{t:'',e:'',d:null}]
  ]) {
    const state = blank();
    const key = path.at(-1), parent = path.slice(0,-1).reduce((value,key)=>value[key],state);
    parent[key] = Array(max).fill(item);
    const encoded = await R.encode(state);
    assert.equal(encoded.ok,true,path.join('.'));
    assert.deepEqual(await R.decode(encoded),R.select(state));
    parent[key].push(item);
    await assert.rejects(R.decode(packed(JSON.stringify(state))),formatError);
    assert.equal((await R.encode(state)).reason,'invalid-report');
    const saved = JSON.parse(R.serialize(state));
    assert.equal(path.reduce((value,key)=>value[key],saved).length,max+1);
    assert.equal(parent[key].length,max+1);
  }
});

test('envelope 錯誤與 payload 超限使用格式錯誤，解壓超限仍保留容量提示',async()=>{
  const valid = await R.encode(blank());
  for (const envelope of [null,undefined,{},...[
    {schemaVersion:2},{encoding:'other'},{payload:123},{payload:''},
    {payload:'中文'},{payload:'\u001f'},{payload:'\u007f'},
    {payload:'a'.repeat(R.MAX_PAYLOAD_BYTES+1)}
  ].map(change=>({...valid,...change}))]) {
    await assert.rejects(R.decode(envelope),formatError);
  }
  await assert.rejects(R.decode(packed('a'.repeat(R.MAX_JSON_BYTES+1))),
    error=>error.message === '報告解碼超過容量上限');
});

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
    PUB:pub, APPV:pub.appVersion, DFReport:R, TextEncoder, newCid:()=>'synthetic-cid',
    recOn:false, now:()=>fixedTime, save:()=>{}, toast:()=>{}, boot:()=>{} });
  vm.runInContext(source('function newSusp()', '/* ---------- network'), context);
  vm.runInContext(source('async function importReport(', 'async function boot('), context);
  await context.importReport({target:{files:[{size:Buffer.byteLength(report),name:'synthetic.html',text:async()=>report}],value:''}});
  return JSON.parse(JSON.stringify(vm.runInContext('S',context)));
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
  state.problem = '文'.repeat(R.MAX_JSON_BYTES/2);
  state.log = Array.from({length:20001},()=>({t:fixedTime,e:'open',d:'E01'}));
  const context = vm.createContext({S:state,PUB:pub,B2:null,VERSION:pub.version,
    TL_SLOTS:pub.timeline,DFReport:R,hm:()=>'',esc:s=>String(s??'')});
  vm.runInContext(source('function reportHTML()', 'function exportReport('), context);
  const report = context.reportHTML();
  const saved = JSON.parse(report.match(/<script id="df-report" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(saved.cid,'cid-test');
  assert.equal(saved.gallery.done,true);
  assert.equal(saved.b2.pw,undefined);
  const restored = await importInPage(report);
  assert.equal(restored.reveal.r1,state.reveal.r1);
  assert.deepEqual({...restored,log:restored.log.slice(0,-1)},saved);
  assert.equal(restored.log.at(-1).e,'import');
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
