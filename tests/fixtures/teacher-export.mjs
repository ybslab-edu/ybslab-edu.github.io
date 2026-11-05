// 執行實際頁面、成績碼與 Excel 程式；僅使用合成資料，無網路連線。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './activity-dom.mjs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
export function setup({stored=new Map(),storageErrors={},cloud}={}){
  const elements=new Map(), downloads=[], blobs=[], storageCalls=[], events=new EventTarget();
  function storage(method,key,value){
    storageCalls.push({method,key});
    if(storageErrors[method]===true||storageErrors[method]===key)throw Error('synthetic storage failure');
    if(method==='getItem')return stored.get(key)??null;
    if(method==='setItem')stored.set(key,value);
    if(method==='removeItem')stored.delete(key);
  }
  const body=new Element('body'); body.innerHTML=html;
  const get=id=>body.querySelector('#'+id);
  for(const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){const el=get(m[1]);if(el){el.hidden=/\bhidden\b/.test(m[0]);el.disabled=/\bdisabled\b/.test(m[0]);}}
  const create=tag=>{const el=new Element(tag); el.remove=()=>{}; if(tag==='a')el.click=()=>downloads.push({name:el.download,url:el.href});return el;};
  const context=vm.createContext({
    window:{addEventListener:events.addEventListener.bind(events)},
    document:{getElementById:get,createElement:create,body},
    localStorage:{getItem:key=>storage('getItem',key),setItem:(key,value)=>storage('setItem',key,value),removeItem:key=>storage('removeItem',key)},
    Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:()=>0,
    YBS:cloud?.ybs, firebase:cloud?.firebase,
  });
  for(const path of ['assets/vendor/xlsx-0.20.3.full.min.js','assets/curriculum.js','assets/activities.js','assets/item-health.js']) vm.runInContext(read(path),context,{filename:path,timeout:3000});
  if(cloud)vm.runInContext(read('assets/guest-teacher.js'),context,{filename:'assets/guest-teacher.js'});
  vm.runInContext(scripts,context,{filename:'115-g9/teacher/index.html',timeout:1000});
  const evaluate=source=>vm.runInContext(source,context,{timeout:1000});
  return {evaluate,get,body,stored,downloads,blobs,storageCalls,storageErrors,reopen:()=>setup({stored,storageErrors})};
}
