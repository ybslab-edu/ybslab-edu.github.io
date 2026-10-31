// 執行實際頁面的下載、匯入及 localStorage 還原函式；只用記憶體內合成資料，無網路／Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const pageHTML=readFileSync(new URL('../115-df/a/index.html',import.meta.url),'utf8');
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
  const context=vm.createContext({PUB:pub,APPV:pub.appVersion,VERSION:pub.version,
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
    for(const path of textPaths) setPath(state,path,`${path}：${sample.raw}`);
    for(const path of ['b2.hints.0.level','susp.0.conf','b2.ev.E05.rel','h2.decision','gallery.comments.0.stance']) setPath(state,path,sample.raw);
    await load(context,state,origin);
    const before=JSON.stringify(context.S),report=context.reportHTML();
    assertSafe(report,context.S);
    assert.ok(visibleHTML(report).includes('第 未知 級'),'匯入或儲存的惡意提示級別不能進入 HTML');
    assert.equal(JSON.stringify(context.S),before,'產生報告不改寫作答');
    for(const path of textPaths) assert.ok(visibleHTML(report).includes(`${path}：${sample.escaped}`),`${origin} ${path} 保留原文且跳脫`);
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
    for(const path of textPaths) setPath(state,path,`${path}：${sample.raw}`);
    state.b2.hints[0].level=sample.raw;
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
