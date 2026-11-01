// 執行實際頁面、成績碼與 Excel 程式；僅使用合成資料，無網路連線。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
export function setup({stored=new Map(),storageErrors={}}={}){
  const elements=new Map(), downloads=[], blobs=[], storageCalls=[], events=new EventTarget();
  function storage(method,key,value){
    storageCalls.push({method,key});
    if(storageErrors[method]===true||storageErrors[method]===key)throw Error('synthetic storage failure');
    if(method==='getItem')return stored.get(key)??null;
    if(method==='setItem')stored.set(key,value);
    if(method==='removeItem')stored.delete(key);
  }
  class Element {
    constructor(){this.value='';this.textContent='';this.className='';this.hidden=false;this.disabled=false;this.listeners={};this.dataset={};}
    set innerHTML(value){
      this.markup=value;
      for(const m of value.matchAll(/id="([^"]+)"/g)) elements.set(m[1],new Element());
    }
    get innerHTML(){return this.markup||'';}
    querySelectorAll(){return [...this.innerHTML.matchAll(/data-v="([^"]+)"/g)].map(m=>{const el=new Element();el.dataset.v=m[1];return el;});}
    addEventListener(name,fn){this.listeners[name]=fn;}
    focus(){}
    appendChild(){}
    remove(){}
    click(){downloads.push({name:this.download,url:this.href});}
  }
  for(const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
    const el=new Element();el.hidden=/\bhidden\b/.test(m[0]);el.disabled=/\bdisabled\b/.test(m[0]);elements.set(m[1],el);
  }
  const context=vm.createContext({
    window:{addEventListener:events.addEventListener.bind(events)},
    document:{getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},createElement:()=>new Element(),body:new Element()},
    localStorage:{getItem:key=>storage('getItem',key),setItem:(key,value)=>storage('setItem',key,value),removeItem:key=>storage('removeItem',key)},
    Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:()=>0,
  });
  for(const path of ['assets/vendor/xlsx-0.20.3.full.min.js','assets/codec.js','assets/curriculum.js','assets/activities.js']) vm.runInContext(read(path),context,{filename:path,timeout:3000});
  vm.runInContext(scripts,context,{filename:'115-g9/teacher/index.html',timeout:1000});
  const evaluate=source=>vm.runInContext(source,context,{timeout:1000});
  const get=id=>elements.get(id);
  const code=evaluate('CODEC.encode({week:1,cls:999,seat:1,mask:3,tries:[1,2,0,0,0,0],time:Date.UTC(2026,9,1)})');
  const add=()=>{get('paste').value=code;get('b-add').onclick();};
  const size=value=>{get('size').value=value;get('size').listeners.input({target:get('size')});};
  const clear=()=>{get('b-clear').onclick();get('c-yes').onclick();};
  const unload=()=>{const e=new Event('beforeunload',{cancelable:true});events.dispatchEvent(e);return e;};
  return {evaluate,get,stored,downloads,blobs,storageCalls,storageErrors,code,add,size,clear,unload,reopen:()=>setup({stored,storageErrors})};
}
