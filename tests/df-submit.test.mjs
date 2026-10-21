// 沙箱不允許啟動 Chromium／HTTP server 時，仍能執行實際 API 與佇列程式。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import R from '../assets/df-report.js';
import {fakeFirebase} from './fixtures/df-firebase.mjs';
const html=readFileSync(new URL('../115-df/a/index.html',import.meta.url),'utf8');
const loginJS=readFileSync(new URL('../assets/login.js',import.meta.url),'utf8');
const manager=html.slice(html.indexOf('/* ---------- report hand-in'),html.indexOf('/* ---------- generic bind helpers'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<100;i++){if(check()) return;await tick();}assert.fail('等待程式完成逾時');}
class Element {
  constructor(){this.childNodes=[];this.dataset={};this.value='';this.disabled=false;this.text='';}
  set textContent(value){this.text=value;this.childNodes=[];}
  get textContent(){return this.text+this.childNodes.map(x=>x.textContent).join('');}
  appendChild(child){this.childNodes.push(child);return child;}
  replaceChildren(){this.text='';this.childNodes=[];}
}
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
async function setup({manual=false,course='115-df'}={}){
  let time=1792598400000,id=0;const timers=new Map(),events=new EventTarget();
  const form={a:{value:'9990001',focus(){}},p:{value:'synthetic-test-password'},querySelector:()=>new Element()};
  const elements=new Map(['#report-send','#report-panel'].map(key=>[key,new Element()]));
  const c=vm.createContext({
    console,TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream,btoa,atob,queueMicrotask,
    Date:class extends Date {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}},
    setInterval:()=>0,setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:time+ms});return key;},clearTimeout:key=>timers.delete(key),
    Event,CustomEvent:class extends Event {constructor(type,options){super(type);this.detail=options.detail;}},
    addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    location:{pathname:'/'+course+'/a/'},localStorage:storage(),sessionStorage:storage(),
    document:{querySelector:()=>null,getElementById:()=>form,createElement:()=>new Element(),head:{appendChild:el=>queueMicrotask(()=>el.onload())}},
    $:selector=>elements.get(selector),toast:()=>{},confirm:()=>true,newCid:()=>String(++id),DFReport:R,
    recOn:!manual,impWho:manual?null:{cls:'999',seat:'1'},S:{app:'DF-investigation',appVersion:'1.0',version:'A',cls:'999',seat:'1',problem:'合成原答案',b2:{},h1:{},concl:{},reveal:{}}
  });
  c.window=c;vm.runInContext(fakeFirebase,c);vm.runInContext(loginJS+'\nglobalThis.YBS=YBS;',c);vm.runInContext(manager,c);
  const signIn=async(account='9990001')=>{
    form.a.value=account;form.p.value='synthetic-test-password';
    await c.YBS.button(new Element(),()=>{},message=>assert.fail(message));await form.onsubmit({preventDefault(){}});
  };
  if(!manual) await signIn();
  const queue=()=>JSON.parse(c.sessionStorage.getItem('ybslab:reports:115-df')||'[]');
  const text=()=>elements.get('#report-panel').textContent;
  const advance=async ms=>{
    const end=time+ms;
    while(true){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next) break;
      time=next[1].at;timers.delete(next[0]);next[1].fn();await tick();}
    time=end;await tick();
  };
  return {c,queue,text,advance,signIn,elements,now:()=>time};
}

test('完整頁面與 login.js 語法正確',()=>{
  new vm.Script(loginJS);
  const script=html.match(/<script>\s*"use strict";([\s\S]*)<\/script>\s*<\/body>/)[1];
  new vm.Script(script);
});
test('實際 API 成功、覆寫保留 createdAt，收到時間取自伺服器',async()=>{
  const {c,text,advance}=await setup();c.__fake.hold='receipt';await c.queueReport(1);
  await until(()=>c.__fake.release);assert.match(text(),/交件中/);assert.ok(!text().includes('老師已收到'));
  c.__fake.release();await until(()=>text().includes('老師已收到'));
  const first=c.__fake.commits[0];assert.equal(first.path,'ybsCourses/115-df/reports/u1_s1');
  assert.deepEqual(Object.keys(first.data).sort(),['uid','session','cls','seat','schemaVersion','encoding','payload','createdAt','updatedAt'].sort());
  await advance(50);c.S.problem='合成新答案';await c.queueReport(1);await until(()=>c.__fake.commits.length===2);
  assert.equal(c.__fake.commits[1].data.createdAt,first.data.createdAt);
  assert.equal(c.__fake.commits[1].data.updatedAt,first.data.updatedAt+50);
  assert.equal(c.__fake.attempts.length,0);
});
test('2／5／15 秒自動三次後停止；手動重試不改原快照',async()=>{
  const {c,queue,advance,now}=await setup();c.__fake.failures=Array(4).fill('unavailable');await c.queueReport(1);
  await until(()=>queue()[0]?.phase==='waiting');
  for(const [index,delay] of [2000,5000,15000].entries()){
    assert.equal(queue()[0].nextAt-now(),delay);c.S.problem='稍後更改';
    await advance(delay-1);assert.equal(c.__fake.transactions,index+1);await advance(1);
    await until(()=>queue()[0]?.phase===(index===2?'failed':'waiting'));
  }
  await advance(60000);assert.equal(c.__fake.transactions,4);
  c.retryReport(1);await until(()=>c.__fake.commits.length===1);
  assert.equal(JSON.parse(c.__fake.commits[0].data.payload).problem,'合成原答案');
});
for(const failure of ['permission-denied','closed','not-listed','roster-changed']) test(failure+' 不反覆重送',async()=>{
  const {c,queue,advance,text}=await setup();
  if(failure==='closed') c.__fake.open=false;else if(failure==='not-listed') c.__fake.roster=false;
  else if(failure==='roster-changed') c.__fake.rosterSeat=3;else c.__fake.failures=[failure];
  await c.queueReport(1);await until(()=>queue()[0]?.phase==='blocked');assert.match(text(),/請找老師/);
  const calls=c.__fake.transactions;await advance(60000);c.dispatchEvent(new Event('online'));await tick();
  assert.equal(c.__fake.transactions,calls);assert.equal(c.__fake.commits.length,0);
});
test('未登入／手填班座與超量不寫入；作答保留',async()=>{
  const manual=await setup({manual:true});await manual.c.queueReport(1);assert.match(manual.text(),/請先.*登入/);
  assert.equal(manual.c.__fake.transactions,0);assert.equal(manual.queue().length,0);
  const {c,text,queue}=await setup();c.S.problem='a'.repeat(2*1024*1024);await c.queueReport(1);
  assert.match(text(),/報告過大.*下載/);assert.equal(c.S.problem.length,2*1024*1024);assert.equal(queue().length,0);assert.equal(c.__fake.transactions,0);
});
test('受限 API 拒絕跨課程、錯堂次、非 ASCII 與超量',async()=>{
  const {c}=await setup();const packet={schemaVersion:1,encoding:'ascii-json',payload:'{}',snapshotAt:c.Date.now(),cls:999,seat:1};
  await assert.rejects(c.YBS.submitReport(0,packet),e=>e.code==='report/session');
  await assert.rejects(c.YBS.submitReport(1,{...packet,payload:'中文'}),e=>e.code==='report/format');
  await assert.rejects(c.YBS.submitReport(1,{...packet,payload:'a'.repeat(524289)}),e=>e.code==='report/too-large');
  const other=await setup({course:'115-g9'});await assert.rejects(other.c.YBS.submitReport(1,packet),e=>e.code==='report/course');
  assert.equal(c.__fake.transactions,0);
});
test('已送中的先完成；同堂僅保留最新待送快照',async()=>{
  const {c,text,advance}=await setup();c.__fake.hold='beforeRead';await c.queueReport(1);await until(()=>c.__fake.release);
  c.S.problem='合成最新答案';await c.queueReport(1);await advance(100);c.__fake.release();await until(()=>text().includes('老師已收到'));
  assert.deepEqual(Array.from(c.__fake.commits,x=>JSON.parse(x.data.payload).problem),['合成原答案','合成最新答案']);
});
test('Auth 換人清除佇列且中止尚未寫入的舊交易',async()=>{
  const {c,queue,text}=await setup();c.__fake.hold='beforeRead';await c.queueReport(1);await until(()=>c.__fake.release);
  c.__fake.setUser('u2');c.__fake.release();await tick();assert.equal(queue().length,0);assert.match(text(),/已清除待送報告/);assert.equal(c.__fake.commits.length,0);
});
test('登出後新帳號不帶前一人的快照，UID 與班座重新驗證',async()=>{
  const {c,queue,signIn,text}=await setup();c.__fake.failures=['unavailable'];await c.queueReport(1);await until(()=>queue()[0]?.phase==='waiting');
  c.clearReports();c.YBS.logout();await signIn('9990002');c.impWho={cls:'999',seat:'2'};c.S.seat='2';c.S.problem='合成第二人答案';
  await c.queueReport(1);await until(()=>text().includes('老師已收到'));
  assert.equal(c.__fake.commits.length,1);assert.equal(c.__fake.commits[0].path,'ybsCourses/115-df/reports/u2_s1');
  assert.equal(JSON.parse(c.__fake.commits[0].data.payload).problem,'合成第二人答案');
});
test('較新雲端報告需確認；拒絕覆寫後仍保留待送快照',async()=>{
  const {c,queue,now,text}=await setup();c.__fake.cloud(1,now()+100);await c.queueReport(1);await until(()=>queue()[0]?.phase==='conflict');
  c.confirm=()=>false;c.retryReport(1);await tick();assert.equal(c.__fake.commits.length,0);
  c.confirm=()=>true;c.retryReport(1);await until(()=>text().includes('老師已收到'));assert.equal(c.__fake.commits.length,1);
});
test('離開前提醒備份；恢復佇列只接受本課程、本 UID、本班座',async()=>{
  const {c,queue}=await setup();c.__fake.failures=['unavailable'];await c.queueReport(1);await until(()=>queue()[0]?.phase==='waiting');
  const event=new Event('beforeunload',{cancelable:true});c.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  const stored=queue()[0];c.clearReports();c.sessionStorage.setItem('ybslab:reports:115-df',JSON.stringify([
    {...stored,uid:'u2'}, {...stored,courseId:'115-g9'}, {...stored,seat:2}, {...stored,phase:'failed'}
  ]));c.resumeReports();assert.equal(queue().length,1);assert.equal(queue()[0].phase,'failed');
});
