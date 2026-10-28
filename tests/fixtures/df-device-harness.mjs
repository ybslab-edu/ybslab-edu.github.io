// 無 socket／Chromium 的補充驗證；真實雙 context 測試另見 browser suite。
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import R from '../../assets/df-report.js';
import {sharedFirebase,injectSyntheticLogin} from './df-shared-firebase.mjs';
const html=readFileSync(new URL('../../115-df/a/index.html',import.meta.url),'utf8');
const manager=html.slice(html.indexOf('/* ---------- report hand-in'),html.indexOf('/* ---------- generic bind helpers'));
const login=injectSyntheticLogin(readFileSync(new URL('../../assets/login.js',import.meta.url),'utf8'));
class Element {
  constructor(){this.childNodes=[];this.dataset={};this.text='';}
  set textContent(value){this.text=value;this.childNodes=[];}
  get textContent(){return this.text+this.childNodes.map(x=>x.textContent).join('');}
  appendChild(child){this.childNodes.push(child);return child;}
  replaceChildren(){this.text='';this.childNodes=[];}
}
function storage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
export async function until(check) {
  for(let i=0;i<100;i++){if(check()) return;await new Promise(ok=>setImmediate(ok));}
  assert.fail('等待實際交件程式完成逾時');
}
export async function device(backend,id,uid='u1',stored=[]) {
  let now=backend.now+1000;const events=new EventTarget();
  const elements=new Map(['#report-send','#report-panel'].map(key=>[key,new Element()]));
  const c=vm.createContext({
    TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream,btoa,atob,queueMicrotask,
    Date:class extends Date {static now(){return now;}},
    setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,
    Event,CustomEvent:class extends Event {constructor(type,options){super(type);this.detail=options.detail;}},
    addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),
    location:{pathname:'/115-df/a/'},localStorage:storage(),sessionStorage:storage(),
    document:{querySelector:()=>null,createElement:()=>new Element(),head:{appendChild:el=>queueMicrotask(()=>el.onload())}},
    $:selector=>elements.get(selector),toast:()=>{},confirm:()=>true,newCid:()=>Math.random().toString(),DFReport:R,
    recOn:true,impWho:{cls:'999',seat:uid==='u2'?'2':'1'},
    S:{app:'DF-investigation',appVersion:'1.0',version:'A',cls:'999',seat:uid==='u2'?'2':'1',problem:'',b2:{},h1:{},concl:{},reveal:{}},
    __sharedFirebase:(user,op,args)=>backend.request(id,user,op,args)
  });
  c.window=c;vm.runInContext(sharedFirebase,c);vm.runInContext(login+'\nglobalThis.YBS=YBS;',c);vm.runInContext(manager,c);
  await c.YBS.__testLogin(uid);
  if(stored.length) c.sessionStorage.setItem('ybslab:reports:115-df',JSON.stringify(stored));
  c.resumeReports();
  return {c,setTime:value=>now=value,
    queue:()=>JSON.parse(c.sessionStorage.getItem('ybslab:reports:115-df')||'[]'),
    text:()=>elements.get('#report-panel').textContent,
    send:async(answer,session=1)=>{c.S.problem=answer;await c.queueReport(session);},
    received:async()=>until(()=>elements.get('#report-panel').textContent.includes('老師已收到')&&!c.sessionStorage.getItem('ybslab:reports:115-df'))};
}
