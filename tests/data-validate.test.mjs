// 僅使用合成資料與儲存／DOM 替身；執行實際程式，禁止任何網路連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const DFReport=createRequire(import.meta.url)('../assets/df-report.js');
const plain=v=>JSON.parse(JSON.stringify(v));
const run=(c,s)=>vm.runInContext(s,c,{timeout:10000});
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
    const report='<script id="df-report" type="application/json">'+JSON.stringify(data)+'</script>';
    c.event={target:{value:'synthetic-file',files:[{size:Buffer.byteLength(report),name:'synthetic.html',text:async()=>report,...extra}]}};
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
    d=>d.exports=[{}],d=>d.problem='文'.repeat(32*1024*1024/3),
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
test('學生匯入：超過雲端容量與筆數的合法下載報告完整保留',async()=>{
  for(const text of ['a'.repeat(DFReport.MAX_JSON_BYTES+1),'文'.repeat(DFReport.MAX_JSON_BYTES/2)]){
    const h=dfSetup(),data=h.valid();data.problem=text;
    data.log=Array.from({length:20001},()=>({t:'synthetic-time',e:'open',d:null}));
    data.exports=Array(20001).fill('synthetic-time');
    assert.ok(new TextEncoder().encode(JSON.stringify(data)).length>DFReport.MAX_JSON_BYTES);
    const before=plain(data);
    await h.importData(data);
    const restored=h.state();
    assert.equal(restored.log.at(-1).e,'import');
    restored.log.pop();assert.deepEqual(restored,before);
    assert.match(h.notices.at(-1),/已匯入/);
    assert.equal((await DFReport.encode(data)).action,'download');
  }
});
test('專題 localStorage：大型舊進度與 20,001 筆 log 可接續，異常容量仍拒絕',()=>{
  const h=dfSetup(),data=h.valid(),key='df-synthetic-v1-999-1';
  delete data.cid;delete data.susp;delete data.pred;delete data.concl.can;
  data.problem='文'.repeat(DFReport.MAX_JSON_BYTES/2);
  data.log=Array.from({length:20001},()=>({t:'synthetic-time',e:'open',d:null}));
  h.stored.set(key,JSON.stringify(data));run(h.c,"startAs('999','1')");
  assert.deepEqual(h.state(),{...data,cid:'synthetic-cid'});
  assert.match(h.notices.at(-1),/已接續/);
  data.problem='文'.repeat(32*1024*1024/3);
  h.stored.set(key,JSON.stringify(data));run(h.c,"startAs('999','1')");
  assert.equal(h.state().problem,'');assert.equal(h.state().log[0].e,'start');
  assert.match(h.notices.at(-1),/損毀/);
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
function shellSetup(value){
  const d=dom(),stored=new Map([['it9:w1:999-1',value]]),packets=[];
  const c=vm.createContext({document:d.document,window:{},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
    TEACHER:{remembered:()=>false}});
  run(c,read('assets/shell.js').replace('shellBindIdentityForm(s);','globalThis.shellState=s; shellBindIdentityForm(s);')+'\nglobalThis.makeShell=SHELL;');
  const round={name:'合成關卡',lv:1,gen:()=>({}),view:()=>({get:()=>'',ready:()=>true}),check:()=>false};
  c.makeShell({week:1,title:'合成活動',rounds:Array.from({length:4},()=>({...round})),progressLength:4});
  d.get('in-cls').value='999';d.get('in-seat').value='1';d.get('g-go').onclick();
  packets.push(plain(run(c,'shellState.prog')));
  return {...d,packets,send:()=>{d.get('b-send').onclick();packets.push(JSON.parse(stored.get('it9:w1:999-1')));}};
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
