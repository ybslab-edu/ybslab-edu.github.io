// 執行實際頁面、成績碼與 Excel 程式；僅使用合成資料，無網路連線。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
export function setup(){
  const elements=new Map(), stored=new Map(), downloads=[], blobs=[];
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
  for(const m of html.matchAll(/id="([^"]+)"/g)) elements.set(m[1],new Element());
  elements.get('save-msg').hidden=true;
  const context=vm.createContext({
    document:{getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},createElement:()=>new Element(),body:new Element()},
    localStorage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},
    Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:()=>0,
  });
  for(const path of ['assets/vendor/xlsx-0.20.3.full.min.js','assets/codec.js','assets/curriculum.js','assets/activities.js']) vm.runInContext(read(path),context,{filename:path,timeout:3000});
  vm.runInContext(scripts,context,{filename:'115-g9/teacher/index.html',timeout:1000});
  const evaluate=source=>vm.runInContext(source,context,{timeout:1000});
  const get=id=>elements.get(id);
  return {evaluate,get,stored,downloads,blobs};
}
