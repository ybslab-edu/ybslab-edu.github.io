// 僅使用合成資料與儲存／DOM 替身；執行實際程式，禁止任何網路連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const DFReport=createRequire(import.meta.url)('../assets/df-report.js');
const plain=v=>JSON.parse(JSON.stringify(v));
const run=(c,s)=>vm.runInContext(s,c,{timeout:1000});
function dom(){
  const elements=new Map();
  const get=id=>{if(!elements.has(id)) elements.set(id,new Element());return elements.get(id);};
  class Element{
    constructor(){this.value='';this.hidden=false;this.textContent='';this.dataset={};this.listeners={};}
    set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))get(m[1]);}
    get innerHTML(){return this.html||'';}
    insertAdjacentHTML(pos,v){this.innerHTML=this.innerHTML+v;}
    addEventListener(ev,f){this.listeners[ev]=f;}
    querySelectorAll(){return [];}
    querySelector(selector){return selector.startsWith('#')?null:new Element();}
    setAttribute(k,v){this[k]=v;}
    focus(){} appendChild(){} remove(){}
  }
  return {get,document:{getElementById:get,createElement:()=>new Element(),body:new Element()}};
}
const df=read('115-df/a/index.html');
function dfSetup(){
  const notices=[],stored=new Map();
  const c=vm.createContext({DFReport,TextEncoder,notices,stored,
    PUB:{batch1:['E01','E02','E03','E04','E06','E07'].map(id=>({id})),timeline:['11:04','11:08','11:16','11:22–11:23','11:26','11:32','11:35','11:38','11:50']},
    VERSION:'synthetic-v1',APPV:'synthetic-app',ANS:null,impWho:null,recOn:false,
    now:()=> '2026-10-31T00:00:00.000Z',newCid:()=> 'synthetic-cid',toast:m=>notices.push(m),
    lsGet:k=>stored.get(k),save(){},boot(){},
  });
  // 原始函式整段執行；只替換 DOM／儲存／boot 邊界，未複製驗證實作。
  run(c,df.slice(df.indexOf('function newSusp()'),df.indexOf('/* ---------- network')));
  run(c,df.slice(df.indexOf('function startAs('),df.indexOf('// 學校帳號登入從名單')));
  run(c,df.slice(df.indexOf('async function importReport('),df.indexOf('async function boot(')));
  const valid=()=>plain(run(c,"blankState('999','1')"));
  const importData=async(data,extra={})=>{
    c.event={target:{value:'synthetic-file',files:[{size:100,name:'synthetic.html',text:async()=>'<script id="df-report" type="application/json">'+JSON.stringify(data)+'</script>',...extra}]}};
    await run(c,'importReport(event)');
  };
  return {c,notices,stored,valid,importData,state:()=>plain(run(c,'S'))};
}
test('學生匯入：合法新舊資料可接續、缺 cid 仍可讀',async()=>{
  const h=dfSetup(),data=h.valid();
  for(const path of ['cid','briefed','round2','susp','pred','s2'])delete data[path];
  delete data.concl.can;delete data.concl.cbecause;delete data.reveal.tlnote;
  data.problem='合成舊版研究問題';data.gallery.after='合成作答';
  await h.importData(data);
  assert.equal(h.state().gallery.after,'合成作答');
  assert.equal(h.state().log.at(-1).e,'import');
  assert.match(h.notices.at(-1),/已匯入/);
});
test('學生匯入：缺必要欄位、錯型別、壞陣列項目與容量過大皆拒絕且保留目前進度',async()=>{
  const h=dfSetup();await h.importData(h.valid());const before=h.state();
  const mutations=[
    d=>delete d.log,d=>delete d.concl,d=>delete d.ev.E01.exif,d=>delete d.h1.ev,
    d=>d.log=null,d=>d.log=[null],d=>d.log=[{t:'now',e:'open'}],
    d=>d.h1.checks=[false],d=>d.h1.ev=[{}],d=>d.gallery.comments=[{seat:1}],
    d=>d.ev.E01.fact=5,d=>d.b2.hints=[null],d=>d.b2.ev.E05={why:'incomplete'},
    d=>d.pred=[],d=>d.susp={},d=>d.cls={},d=>d.started=3,
    d=>d.exports=Array(20001).fill(''),d=>d.problem='文'.repeat(DFReport.MAX_JSON_BYTES/2),
  ];
  for(const mutate of mutations){const d=h.valid();mutate(d);await h.importData(d);assert.deepEqual(h.state(),before);assert.match(h.notices.at(-1),/不接受/);}
  for(const data of [null,[],{},5]){await h.importData(data);assert.deepEqual(h.state(),before);}
  let readCalled=false;
  await h.importData(h.valid(),{size:32*1024*1024+1,text:async()=>{readCalled=true;return '';}});
  assert.equal(readCalled,false);assert.match(h.notices.at(-1),/過大/);
  await h.importData(h.valid(),{text:async()=>{throw Error('synthetic read error');}});
  assert.match(h.notices.at(-1),/無法讀取/);
});
test('專題 localStorage：損毀回預設，換人不沿用前人的記憶體進度，合法舊資料仍讀取',()=>{
  const h=dfSetup(),key='df-synthetic-v1-999-1';
  for(const value of ['{','null','[]','{}',JSON.stringify({...h.valid(),log:null})]){
    h.stored.set(key,value);run(h.c,"startAs('999','1')");assert.equal(h.state().log[0].e,'start');
  }
  const data=h.valid();data.problem='合成舊作答';delete data.cid;
  h.stored.set(key,JSON.stringify(data));run(h.c,"startAs('999','1')");assert.equal(h.state().problem,'合成舊作答');
  run(h.c,"startAs('998','2')");assert.equal(h.state().cls,'998');assert.equal(h.state().problem,'');
});
function queueSetup(value){
  const sent=[],stored=new Map([['ybslab:fq',value]]);
  const source=read('assets/login.js'),entry='  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
  assert.ok(source.includes(entry));
  const c=vm.createContext({location:{pathname:'/115-g9/u1-01/'},window:{addEventListener(){}},setInterval(){},localStorage:{},
    sessionStorage:{getItem:k=>stored.get(k),removeItem(){},setItem:(k,v)=>stored.set(k,v)},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=> 'synthetic-time'}}},
    mock:{auth:{currentUser:{uid:'synthetic-1'}},db:{doc:path=>({set:async data=>sent.push({path,...data})})}},
  });
  run(c,source.replace(entry,"  globalThis.hook={getQ,login:()=>{profile={uid:'synthetic-1',email:'synthetic@example.invalid'};fb=mock;}};\n"+entry)+'\nglobalThis.api=YBS;');
  run(c,'hook.login()');return {c,sent,queue:()=>plain(run(c,'hook.getQ()'))};
}
const queueItem={uid:'synthetic-1',activity:1,round:0,level:1,tries:1,key:'1_0',termWeek:0};
test('上傳佇列：非陣列、壞 JSON 安全忽略',async()=>{
  for(const value of ['{','{}','null','42','"text"']){const h=queueSetup(value);await h.c.api.flush();assert.deepEqual(h.queue(),[]);assert.equal(h.sent.length,0);}
});
test('上傳佇列：逐筆捨棄壞項目，合法項目及其他 uid 不受影響，舊版缺選填欄位可送',async()=>{
  const old={...queueItem};delete old.key;delete old.termWeek;
  const bad=[null,[],{},false,...[
    ['uid','bad/path'],['activity',0],['activity','1'],['round',6],['tries',-1],['tries',null],['level',3],['termWeek',31],['key','wrong']
  ].map(([k,v])=>({...queueItem,[k]:v}))];
  const h=queueSetup(JSON.stringify([old,...bad,{...queueItem,uid:'synthetic-2'}]));
  await h.c.api.flush();assert.equal(h.sent.length,1);assert.equal(h.sent[0].activity,1);
  assert.equal(h.queue().length,1);assert.equal(h.queue()[0].uid,'synthetic-2');
  await h.c.api.submit({activity:2,round:1,level:2,tries:3});assert.equal(h.sent.length,2);assert.equal(h.queue().length,1);
});
function teacherSetup(grades,sizes='{}'){
  const d=dom(),stored=new Map([['it9:grades',grades],['it9:sizes',sizes]]);
  const c=vm.createContext({document:d.document,localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},setTimeout(){}});
  for(const p of ['assets/codec.js','assets/curriculum.js','assets/activities.js'])run(c,read(p));
  run(c,[...read('115-g9/teacher/index.html').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {...d,c,stored};
}
function grade(){
  const c=vm.createContext({});run(c,read('assets/codec.js'));
  return plain(run(c,'CODEC.decode(CODEC.encode({week:1,cls:999,seat:1,mask:3,tries:[1,2,0,0,0,0],time:Date.UTC(2026,9,1)}))'));
}
test('教師快取：逐筆驗範圍／型別，n1 不會卡死，提示且保存其餘成績與壞資料原值',()=>{
  const good=grade(),data={'1-999-1':good};
  const changes=[['mask',-1],['mask',64],['mask',2**32],['mask',1.5],['mask','3'],['seat',1000000],['tries',[null]],['time',null],['code',{}],['week',0]];
  changes.forEach(([k,v],i)=>{const r={...good,cls:800+i,[k]:v};data[`1-${800+i}-1`]=r;});
  data.bad=null;
  const h=teacherSetup(JSON.stringify(data),'{"999":60,"998":1000000}');
  assert.equal(run(h.c,'all().length'),1);assert.equal(run(h.c,'sizes[999]'),60);assert.equal(run(h.c,'sizes[998]'),undefined);
  assert.equal(h.get('cache-msg').hidden,false);assert.match(h.get('cache-msg').textContent,/略過.*原始成績快取保留/);
  assert.equal(run(h.c,'n1(-1)'),32);assert.equal(run(h.c,'n1(63)'),6);
  assert.equal(run(h.c,'save()'),true);assert.deepEqual(JSON.parse(h.stored.get('it9:grades')),data);
  h.get('paste').value=good.code;h.get('b-add').onclick();assert.equal(run(h.c,'all().length'),1);
  assert.equal(h.get('cache-msg').hidden,false);
});
test('教師快取：根節點壞掉不可覆寫；sizes 解析失敗不影響合法成績；舊成績照常顯示',()=>{
  for(const raw of ['{','null','[]','42']){const h=teacherSetup(raw);assert.equal(run(h.c,'all().length'),0);assert.equal(run(h.c,'save()'),false);assert.equal(h.stored.get('it9:grades'),raw);}
  const good=grade();const h=teacherSetup(JSON.stringify({'1-999-1':good}),'{');
  assert.equal(run(h.c,'all().length'),1);assert.match(h.get('tbl').innerHTML,new RegExp(good.code));
});
function shellSetup(value){
  const d=dom(),stored=new Map([['it9:w1:999-1',value]]),packets=[];
  const c=vm.createContext({document:d.document,window:{},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
    TEACHER:{remembered:()=>false},CODEC:{encode:p=>{packets.push(plain(p));return 'synthetic-code';}}});
  run(c,read('assets/shell.js')+'\nglobalThis.makeShell=SHELL;');
  const round={name:'合成關卡',lv:1,gen:()=>({}),view:()=>({get:()=>'',ready:()=>true}),check:()=>false};
  c.makeShell({week:1,title:'合成活動',rounds:Array.from({length:4},()=>({...round})),progressLength:4});
  d.get('in-cls').value='999';d.get('in-seat').value='1';d.get('g-go').onclick();
  return {...d,packets,send:()=>d.get('b-send').onclick()};
}
test('活動進度：壞資料回預設且可繼續作答；合法 4／6 關儲存形狀均保留',()=>{
  const good={mask:3,tries:[1,2,0,0],time:Date.UTC(2026,9,1)};
  for(const bad of [null,[],{}, {...good,mask:-1},{...good,mask:16},{...good,mask:'3'},{...good,tries:[1]},{...good,tries:[-1,0,0,0]},{...good,tries:[null,0,0,0]},{...good,time:'now'}]){
    const h=shellSetup(JSON.stringify(bad));assert.equal(h.packets.at(-1).mask,0);assert.deepEqual(h.packets.at(-1).tries,[0,0,0,0]);
    h.send();assert.equal(h.packets.at(-1).tries[0],1);assert.equal(h.get('verdict').className,'verdict no');
  }
  const corrupt=shellSetup('{');assert.equal(corrupt.packets.at(-1).mask,0);
  for(const tries of [[1,2,0,0],[1,2,0,0,0,0]]){const h=shellSetup(JSON.stringify({...good,tries}));assert.equal(h.packets.at(-1).mask,3);assert.deepEqual(h.packets.at(-1).tries,tries);}
});
