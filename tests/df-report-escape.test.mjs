import {createRequire} from 'node:module';
// 執行實際頁面的下載、匯入及 localStorage 還原函式；只用記憶體內合成資料，無網路／Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';

const pageHTML=readFileSync(new URL('../115-df/a/index.html',import.meta.url),'utf8');
const DFReport=createRequire(import.meta.url)('../assets/df-report.js');
const publicData=JSON.parse(pageHTML.match(/<script id="pub" type="application\/json">(.*?)<\/script>/s)[1]);
const pub={version:publicData.version,appVersion:publicData.appVersion,timeline:publicData.timeline,
  batch1:publicData.batch1.map(({id,title,type})=>({id,title,type}))};
const fixedTime='2026-10-21T00:00:00.000Z';
const batch2=['E05','E07F','E08','SUP'].map(id=>({id,title:`合成證據 ${id}`,type:'photo'}));
const samples=[
  {raw:'<img src=x onerror="globalThis.__dfReportInjected=1">',
    escaped:'&lt;img src=x onerror=&quot;globalThis.__dfReportInjected=1&quot;&gt;'},
  {raw:'<script>globalThis.__dfReportInjected=1</script>',
    escaped:'&lt;script&gt;globalThis.__dfReportInjected=1&lt;/script&gt;'},
  {raw:'</title></td><img src=x onerror="globalThis.__dfReportInjected=1"></ScRiPt >',
    escaped:'&lt;/title&gt;&lt;/td&gt;&lt;img src=x onerror=&quot;globalThis.__dfReportInjected=1&quot;&gt;&lt;/ScRiPt &gt;'},
  {raw:'<!--<script>',escaped:'&lt;!--&lt;script&gt;'},
  {raw:'合成中文😀\n第二行 "雙引號" \'單引號\' & < >\n原文 &lt;img&gt;',
    escaped:'合成中文😀\n第二行 &quot;雙引號&quot; &#39;單引號&#39; &amp; &lt; &gt;\n原文 &amp;lt;img&amp;gt;'}
];
const source=(start,end)=>{
  const from=pageHTML.indexOf(start),to=pageHTML.indexOf(end,from);
  assert.ok(from>=0 && to>from,`找到實際頁面程式：${start}`);
  return pageHTML.slice(from,to);
};
const reportSource=source('function reportHTML()', '/* ---------- glossary');
const jsonBlock=report=>{
  const match=report.match(/<script id="df-report" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match,'保留原本的 df-report JSON 區塊');
  return match[1];
};
const visibleHTML=report=>report.slice(0,report.indexOf('<script id="df-report"'));
const plain=value=>JSON.parse(JSON.stringify(value));
function setPath(state,path,value){
  const keys=path.split('.'),last=keys.pop();
  let target=state;
  for(const key of keys) target=target[key];
  target[last]=value;
}
function fixture(){
  const stored=new Map(),downloads=[];
  const context=vm.createContext({DFReport,TextEncoder,PUB:pub,APPV:pub.appVersion,VERSION:pub.version,
    B2:{batch2},S:null,ANS:null,impWho:null,recOn:false,Blob,
    Date:class extends Date {
      constructor(...args){super(...(args.length?args:[fixedTime]));}
      static now(){return Date.parse(fixedTime);}
    },
    newCid:()=> 'synthetic-cid',save:()=>{},boot:()=>{},toast:()=>{},
    localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,String(value))},
    download:(name,blob)=>downloads.push({name,blob})});
  vm.runInContext([
    source('const esc = ', 'function toast('),
    source('function newSusp()', 'let S=null'),
    source('function lsGet(', 'function save('),
    source('function log(e,d)', 'function opened('),
    source('function startAs(', '// 學校帳號登入'),
    source('async function importReport(', 'async function boot('),
    reportSource
  ].join('\n'),context);
  const state=plain(context.blankState('999','99'));
  state.ev.E01.interp='';
  for(const {id} of batch2) state.b2.ev[id]={key:'',rel:'支持',why:'',
    exif:{time:'',make:'',model:'',dim:'',ori:''}};
  state.h1.submittedAt=state.b2.unlockedAt=state.concl.doneAt=fixedTime;
  state.b2.hints=[{level:1,at:fixedTime}];
  state.h2.decision='修改 H1';
  state.susp[0].conf='3';
  state.gallery.comments=[{seat:'98',stance:'我有補充',ev:'E01',text:'',at:fixedTime}];
  state.gallery.done=true;
  state.log=[{t:fixedTime,e:'open',d:'E01'}];
  return {context,state,downloads};
}
async function load(context,state,origin){
  if(origin==='作答') context.S=state;
  if(origin==='匯入'){
    const file='<script id="df-report" type="application/json">'+
      JSON.stringify(state).replace(/</g,'\\u003c')+'</script>';
    await context.importReport({target:{files:[{name:'synthetic.html',text:async()=>file}],value:''}});
  }
  if(origin==='localStorage'){
    context.localStorage.setItem(`df-${pub.version}-999-99`,JSON.stringify(state));
    context.startAs('999','99');
  }
  assert.ok(context.S,'透過實際頁面函式取得作答');
}
const exifPaths=base=>['time','make','model','dim','ori'].map(key=>`${base}.exif.${key}`);
// 每個會顯示的自由欄位使用不同標記，避免另一個已跳脫的欄位掩蓋漏測。
const textPaths=[
  'cls','seat','problem','susp.0.text','susp.0.ev.0','susp.0.want','pred.t','pred.f',
  ...pub.batch1.flatMap(e=>[`ev.${e.id}.fact`,...(e.type==='photo'?exifPaths(`ev.${e.id}`):[])]),
  'ev.E01.interp',
  ...pub.timeline.flatMap(t=>[`timeline.${t}.text`,`timeline.${t}.src.0`]),
  'h1.cause','h1.effect','h1.ev.0','h1.unsure',
  ...batch2.flatMap(e=>[`b2.ev.${e.id}.key`,`b2.ev.${e.id}.why`,...exifPaths(`b2.ev.${e.id}`)]),
  'h2.reason','h2.ev.0','h2.now',
  ...['best','ev.0','can','cannot','cbecause','misled','want','wantWhy'].map(key=>`concl.${key}`),
  'gallery.comments.0.seat','gallery.comments.0.ev','gallery.comments.0.text','gallery.after',
  ...['r1','r2','r3','r4','calc.t','calc.i','calc.s'].map(key=>`reveal.${key}`),
  'log.0.e','log.0.d'
];
function assertSafe(report,state){
  const body=visibleHTML(report),json=jsonBlock(report);
  assert.doesNotMatch(body,/<(?:img|script|iframe|svg)\b/i,'輸入不能變成 HTML 元素');
  assert.equal((report.match(/<script\b/gi)||[]).length,1,'僅有原本的 JSON script');
  assert.ok(!json.includes('<'),'JSON 內的 < 一律使用 JSON 跳脫');
  const expected=plain(state);
  delete expected.b2.pw;delete expected.reveal.pw;
  assert.deepEqual(JSON.parse(json),expected,'資料欄位、列舉原值與版本完整保留');
}

for(const origin of ['作答','匯入','localStorage']) test(`${origin}：實際報告逐欄跳脫 img／script、中文、換行、引號`,async()=>{
  for(const sample of samples){
    const {context,state}=fixture();
    // 匯入與本機進度的班座不合格式時整份拒絕，見下方專項測試。
    const paths=origin==='作答'?textPaths:textPaths.filter(path=>path!=='cls'&&path!=='seat');
    for(const path of paths) setPath(state,path,`${path}：${sample.raw}`);
    // 匯入與本機進度的提示等級不合型別時整份拒絕，見下方專項測試。
    for(const path of ['susp.0.conf','b2.ev.E05.rel','h2.decision','gallery.comments.0.stance']) setPath(state,path,sample.raw);
    if(origin==='作答') setPath(state,'b2.hints.0.level',sample.raw);
    await load(context,state,origin);
    const before=JSON.stringify(context.S),report=context.reportHTML();
    assertSafe(report,context.S);
    if(origin==='作答') assert.ok(visibleHTML(report).includes('第 未知 級'),'惡意提示級別不能進入 HTML');
    assert.equal(JSON.stringify(context.S),before,'產生報告不改寫作答');
    for(const path of paths) assert.ok(visibleHTML(report).includes(`${path}：${sample.escaped}`),`${origin} ${path} 保留原文且跳脫`);
  }
});

test('提示級別等列舉只接受白名單；數字及字串級別相容，原始 JSON 不變',()=>{
  const {context,state}=fixture();context.S=state;
  const specs=[
    {path:'b2.hints.0.level',allowed:[1,2,3,'1','2','3'],
      contains:value=>`第 ${value} 級`,fallback:'第 未知 級'},
    {path:'susp.0.conf',allowed:[1,2,3,4,5,'1','2','3','4','5'],
      contains:value=>`信心：${value}`,fallback:'信心：<span class="na">（未填）</span>'},
    {path:'b2.ev.E05.rel',allowed:['支持','反對','不確定'],
      contains:value=>`關係：<b>${value}</b>`,fallback:'關係：<b><span class="na">（未填）</span></b>'},
    {path:'h2.decision',allowed:['維持 H1','修改 H1','否定 H1'],
      contains:value=>`<th>決定</th><td>${value}</td>`,fallback:'<th>決定</th><td><span class="na">（未填）</span></td>'},
    {path:'gallery.comments.0.stance',allowed:['我同意','我想質疑','我有補充'],
      contains:value=>`98 號 · ${value}</th>`,fallback:'98 號 · </th>'}
  ];
  for(const spec of specs){
    for(const value of spec.allowed){
      setPath(state,spec.path,value);
      assert.ok(visibleHTML(context.reportHTML()).includes(spec.contains(value)),`${spec.path} 接受 ${value}`);
    }
    for(const value of [...samples.map(x=>x.raw),0,99,-1,'01','1e0','constructor',null,{},[],true]){
      setPath(state,spec.path,value);
      const report=context.reportHTML();assertSafe(report,state);
      assert.ok(visibleHTML(report).includes(spec.fallback),`${spec.path} 拒絕非白名單 ${JSON.stringify(value)}`);
    }
  }
});

for(const [name,path,value] of [['提示等級不是數字','b2.hints.0.level',samples[0].raw],['班級不合格式','cls',samples[0].raw]]) {
  test(`匯入：${name}時整份不採用`,async()=>{
    const {context,state}=fixture();
    setPath(state,path,value);
    await assert.rejects(load(context,state,'匯入'),/透過實際頁面函式取得作答/);
    assert.equal(context.S,null);
  });
}
test('localStorage：提示等級不是數字時回到預設進度',async()=>{
  const {context,state}=fixture();
  setPath(state,'b2.hints.0.level',samples[0].raw);
  await load(context,state,'localStorage');
  assert.equal(context.S.b2.hints.length,0);
});

test('匯入時間值經實際日期格式化及跳脫，不會成為 HTML',async()=>{
  for(const sample of samples.slice(0,4)){
    const {context,state}=fixture();
    for(const path of ['started','h1.submittedAt','b2.unlockedAt','concl.doneAt','b2.hints.0.at','log.0.t']) setPath(state,path,sample.raw);
    await load(context,state,'匯入');
    const report=context.reportHTML();assertSafe(report,context.S);
    assert.ok(!visibleHTML(report).includes(sample.raw),'時間不會直接插入原始輸入');
  }
});

test('實際下載 Blob 可原樣再匯入；保留全部既有欄位並排除兩處密碼',async()=>{
  const {context,state,downloads}=fixture();
  state.problem=samples.map(x=>x.raw).join('\n');
  state.b2.pw=state.reveal.pw='synthetic-excluded';
  state.unknown={text:'合成舊欄位 <!--<script> </script>'};
  await load(context,state,'localStorage');context.exportReport(true);
  assert.equal(downloads.length,1);assert.equal(downloads[0].name,`999班99號_專題研究報告_${pub.version}.html`);
  assert.equal(downloads[0].blob.type,'text/html');
  const report=await downloads[0].blob.text();assertSafe(report,context.S);
  assert.doesNotMatch(report,/synthetic-excluded/);
  const saved=JSON.parse(jsonBlock(report));
  assert.equal(saved.log.at(-1).e,'export');assert.equal(saved.log.at(-1).d,'final');
  assert.equal(saved.exports.at(-1),fixedTime);
  const restored=fixture().context;
  await restored.importReport({target:{files:[{name:'synthetic.html',text:async()=>report}],value:''}});
  const imported=plain(restored.S);assert.equal(imported.log.pop().e,'import');
  assert.deepEqual(imported,saved,'原始欄位、中文、換行、引號及所有 < 字元完整往返');
});

const asciiEnvelope=payload=>({schemaVersion:1,encoding:'ascii-json',payload});
const gzipEnvelope=bytes=>({schemaVersion:1,encoding:'gzip-base64',
  payload:gzipSync(bytes).toString('base64')});

test('公開編解碼：控制字元、Unicode、反斜線及標籤原文完整往返',async()=>{
  const values=[
    Array.from({length:32},(_,i)=>String.fromCharCode(i)).join('')+'\u007f',
    '合成😀\u0085\u2028\u2029\ufeff e\u0301 與 é',
    '\ud800 合成孤立高代理字元 / 合成孤立低代理字元 \udfff',
    String.raw`合成路徑 C:\synthetic\report；字面 \n \u003c &lt; &#39;`,
    ...samples.map(sample=>sample.raw)
  ];
  for(const value of values){
    const {state}=fixture();
    state.problem=value;state.ev.E01.interp=value;
    state.gallery.comments[0].text=value;state.log[0].d=value;
    const before=plain(state),serialized=DFReport.serialize(state);
    assert.doesNotMatch(serialized,/<\/script\b/i,'序列化文字不能提前結束 JSON script');
    const parsed=JSON.parse(serialized);
    for(const actual of [parsed.problem,parsed.ev.E01.interp,parsed.gallery.comments[0].text,parsed.log[0].d]){
      assert.equal(actual,value,'序列化後保留原始字元，不重複解碼或正規化');
    }
    const encoded=await DFReport.encode(state);
    assert.equal(encoded.ok,true);assert.equal(encoded.encoding,'ascii-json');
    assert.match(encoded.payload,/^[\x20-\x7e]+$/,'雲端 payload 只有可列印 ASCII');
    // 先檢查具體欄位原文，再比較兩條解碼路徑，避免編解碼同時遺失資料而通過。
    assert.deepEqual(await DFReport.decode(encoded),parsed);
    assert.deepEqual(await DFReport.decode(gzipEnvelope(serialized)),parsed);
    assert.deepEqual(state,before,'編解碼不更動來源作答');
  }
});

test('實際 HTML 的控制字元保留於 JSON；危險標籤仍逐欄跳脫',async()=>{
  const controls='\0\b\t\n\v\f\r\u001f\u007f\u2028\u2029';
  for(const origin of ['作答','匯入','localStorage']){
    const {context,state}=fixture();
    const paths=textPaths.filter(path=>path!=='cls'&&path!=='seat');
    for(const path of paths) setPath(state,path,`${path}：${controls}${samples[0].raw}`);
    await load(context,state,origin);
    const before=plain(context.S),report=context.reportHTML();
    assertSafe(report,context.S);
    assert.doesNotMatch(jsonBlock(report),/[\x00-\x1f]/,'JSON 不含未跳脫的 C0 控制字元');
    for(const path of paths){
      assert.ok(visibleHTML(report).includes(`${path}：${controls}${samples[0].escaped}`),`${origin} ${path}`);
    }
    assert.deepEqual(plain(context.S),before);
  }
});

test('舊合法格式：空字串、nullable 時間、純量空值及缺少選填欄位可往返',async()=>{
  const {state}=fixture();
  state.problem='';delete state.ev.E01.interp;delete state.reveal.tlnote;
  for(const path of ['s2.unlockedAt','h1.submittedAt','b2.unlockedAt','concl.doneAt','reveal.unlockedAt','reveal.finalAt']){
    setPath(state,path,null);
  }
  state.log=[null,'',false,0].map(d=>({t:fixedTime,e:'synthetic',d}));
  const expected=plain(state);delete expected.cid;delete expected.ansMode;
  delete expected.b2.pw;delete expected.reveal.pw;
  assert.deepEqual(JSON.parse(DFReport.serialize(state)),expected);
  const encoded=await DFReport.encode(state);assert.equal(encoded.ok,true);
  assert.deepEqual(await DFReport.decode(encoded),expected);
  assert.deepEqual(await DFReport.decode(gzipEnvelope(JSON.stringify(expected))),expected);
  const {context}=fixture();await load(context,state,'匯入');
  const report=context.reportHTML();assertSafe(report,context.S);
  assert.ok(visibleHTML(report).includes('<th>研究問題</th><td><span class="na">（未填）</span></td>'));
  assert.ok(visibleHTML(report).includes('H1（未送出）'));
  const imported=plain(context.S);assert.equal(imported.log.pop().e,'import');
  assert.deepEqual(imported,state,'舊檔的空值及缺少欄位不被改寫');
});

test('舊 HTML 跳脫、公開 serializer 與 ASCII JSON 均可經實際匯入再輸出',async()=>{
  const {state}=fixture();
  state.problem=samples.map(sample=>sample.raw).join('\n');
  state.ev.E01.interp='合成舊版解釋 & < > " \' \\';
  const encoded=await DFReport.encode(state);assert.equal(encoded.ok,true);
  for(const json of [JSON.stringify(state).replace(/<\//g,'<\\/'),DFReport.serialize(state),encoded.payload]){
    const {context}=fixture();
    await context.importReport({target:{files:[{name:'synthetic-legacy.html',text:async()=>
      `<script id="df-report" type="application/json">${json}</script>`}],value:''}});
    assert.ok(context.S,'合法舊格式可匯入');
    const imported=plain(context.S);assert.equal(imported.log.pop().e,'import');
    assert.deepEqual(DFReport.select(imported),DFReport.select(state),'保留合法報告全部白名單作答');
    assertSafe(context.reportHTML(),context.S);
  }
});

test('公開編解碼：錯誤欄位型別拒絕交件及解碼，來源不變',async()=>{
  for(const [path,value] of [
    ['problem',null],['problem',0],['problem',{}],['problem',[]],
    ['h1.submittedAt',false],['b2.hints',null],['b2.hints.0.level','1'],
    ['gallery.comments.0.text',null],['log.0.d',{}],['log.0.d',[]],['h1.checks.0','true']
  ]){
    const {state}=fixture();setPath(state,path,value);const before=plain(state);
    assert.throws(()=>DFReport.serialize(state),/報告格式不正確/,path);
    assert.deepEqual(await DFReport.encode(state),{
      ok:false,action:'download',reason:'invalid-report',message:DFReport.DOWNLOAD_MESSAGE
    },path);
    await assert.rejects(DFReport.decode(gzipEnvelope(JSON.stringify(state))),/報告格式不正確/,path);
    assert.deepEqual(state,before,path);
  }
});

test('解碼拒絕空值、錯誤 envelope 與非可列印 ASCII payload',async()=>{
  const valid=await DFReport.encode(fixture().state);assert.equal(valid.ok,true);
  for(const envelope of [null,undefined,false,0,'',[],{},
    ...[{schemaVersion:'1'},{schemaVersion:2},{encoding:'ASCII-JSON'},
      {encoding:null},{payload:null},{payload:123},{payload:{}},{payload:''},
      ...['\0','\t','\n','\r','\u001f','\u007f','中','😀'].map(char=>({payload:valid.payload+char}))
    ].map(change=>({...valid,...change}))
  ]){
    await assert.rejects(DFReport.decode(envelope),/報告格式不正確/,JSON.stringify(envelope));
  }
});

test('解碼拒絕畸形 JSON、base64、gzip 與非法 UTF-8',async()=>{
  for(const json of ['{','null','[]','{}','{"app":"other"}',
    '{"app":"DF-investigation","problem":"\\x00"}',
    '{"app":"DF-investigation",}', '{"app":"DF-investigation"} trailing'
  ]){
    await assert.rejects(DFReport.decode(asciiEnvelope(json)),`ASCII JSON：${json}`);
    await assert.rejects(DFReport.decode(gzipEnvelope(json)),`gzip JSON：${json}`);
  }
  for(const payload of ['!!!!','A','AAA','AA=','A===','AA==AAAA','AA-_','AA==\n',' AA==','AB==','AAB=','AAAA']){
    await assert.rejects(DFReport.decode({schemaVersion:1,encoding:'gzip-base64',payload}),payload);
  }
  const validGzip=gzipSync(DFReport.serialize(fixture().state));
  const corrupt=Buffer.from(validGzip);corrupt[corrupt.length-8]^=0xff;
  for(const bytes of [validGzip.subarray(0,10),validGzip.subarray(0,-1),corrupt]){
    await assert.rejects(DFReport.decode({schemaVersion:1,encoding:'gzip-base64',payload:bytes.toString('base64')}));
  }
  // 非法 byte 放在原本有效的 JSON 字串中，確保不是只因 JSON 語法錯誤而拒絕。
  for(const bytes of [[0xff],[0xc3,0x28],[0xc0,0xaf],[0xed,0xa0,0x80]]){
    const json=Buffer.concat([Buffer.from('{"app":"DF-investigation","appVersion":"synthetic","version":"synthetic","problem":"'),
      Buffer.from(bytes),Buffer.from('"}')]);
    // 公開解碼介面統一格式錯誤，仍須拒絕非法 UTF-8，不依賴串流原生例外型別。
    await assert.rejects(DFReport.decode(gzipEnvelope(json)),{name:'Error',message:'報告格式不正確'});
  }
});

test('匯入畸形 JSON 或錯誤型別時保留既有作答',async()=>{
  for(const payload of ['{','null','[]',
    ...[['problem',null],['log',{}],['h1.checks.0','true']].map(([path,value])=>{
      const {state}=fixture();setPath(state,path,value);return JSON.stringify(state);
    })
  ]){
    const {context,state}=fixture();context.S=state;const before=plain(state);
    const report=`<script id="df-report" type="application/json">${payload}</script>`;
    await context.importReport({target:{files:[{name:'synthetic-invalid.html',text:async()=>report}],value:''}});
    assert.equal(context.S,state,'拒絕匯入不能取代既有作答');
    assert.deepEqual(state,before,'拒絕匯入不能新增紀錄或更動答案');
  }
});

test('瀏覽器開啟實際下載內容：無注入執行，文字顯示與 JSON 可讀',async t=>{
  let chromium;
  try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'));}
  catch(error){
    if(error.code!=='ERR_MODULE_NOT_FOUND') throw error;
    t.skip('未安裝可載入的 Playwright；CI 補跑瀏覽器驗證');return;
  }
  let browser;
  try{browser=await chromium.launch({headless:true});}
  catch(error){t.skip(`Chromium 無法啟動（${error.message.includes('Operation not permitted')?'沙箱拒絕':error.message.split('\n')[0]}）；CI 補跑`);return;}
  t.after(()=>browser.close());
  const browserContext=await browser.newContext({serviceWorkers:'block'});
  await browserContext.route('**/*',route=>route.abort());
  const page=await browserContext.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const sample of samples){
    const {context,state,downloads}=fixture();
    const paths=textPaths.filter(path=>path!=='cls'&&path!=='seat');
    for(const path of paths) setPath(state,path,`${path}：${sample.raw}`);
    await load(context,state,'匯入');context.exportReport(false);
    await page.setContent(await downloads[0].blob.text());
    assert.equal(await page.evaluate(()=>globalThis.__dfReportInjected),undefined);
    assert.equal(await page.locator('img,iframe,svg').count(),0);
    assert.equal(await page.locator('script').count(),1);
    assert.equal(await page.locator('#df-report').getAttribute('type'),'application/json');
    const displayed=await page.evaluate(()=>[...document.querySelectorAll('tr')]
      .find(row=>row.querySelector('th')?.textContent==='研究問題').querySelector('td').textContent);
    assert.equal(displayed,`problem：${sample.raw}`,'中文字、換行、引號及 HTML 字樣原樣顯示');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(document.querySelector('#df-report').textContent)),JSON.parse(jsonBlock(context.reportHTML())));
  }
  assert.deepEqual(errors,[]);
});
