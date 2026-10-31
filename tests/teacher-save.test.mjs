// 執行實際頁面、成績碼與 Excel 程式；僅使用合成資料，無網路連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function setup(){
  const elements=new Map(), stored=new Map(), downloads=[], blobs=[];
  let failKey=null;
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
    localStorage:{getItem:key=>stored.get(key)??null,setItem(key,value){if(key===failKey)throw new Error('synthetic storage failure');stored.set(key,value);}},
    Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:()=>0,
  });
  for(const path of ['assets/vendor/xlsx-0.18.5.full.min.js','assets/codec.js','assets/curriculum.js','assets/activities.js']) vm.runInContext(read(path),context,{filename:path,timeout:3000});
  vm.runInContext(scripts,context,{filename:'115-g9/teacher/index.html',timeout:1000});
  const evaluate=source=>vm.runInContext(source,context,{timeout:1000});
  const get=id=>elements.get(id);
  const code=evaluate('CODEC.encode({week:1,cls:999,seat:1,mask:3,tries:[1,2,0,0,0,0],time:Date.UTC(2026,9,1)})');
  const add=()=>{get('paste').value=code;get('b-add').onclick();};
  const size=value=>{get('size').value=value;get('size').listeners.input({target:get('size')});};
  const clear=()=>{get('b-clear').onclick();get('c-yes').onclick();};
  return {evaluate,get,code,add,size,clear,stored,downloads,blobs,fail(key){failKey=key;}};
}
function warning(t){
  assert.equal(t.get('save-msg').hidden,false);
  assert.match(t.get('save-msg').textContent,/這台電腦沒有存下來/);
  assert.match(t.get('save-msg').textContent,/立刻.*匯出.*備份/);
  assert.match(t.get('save-msg').textContent,/請勿關閉或重新整理/);
  assert.notEqual(t.get('msg').className,'msg ok');
}
for(const key of ['it9:grades','it9:sizes']){
  test(`${key} 寫入例外：新增、更新不報成功，畫面與實際 Excel 匯出保留成績`,async()=>{
    const t=setup();t.fail(key);
    assert.equal(t.evaluate('save()'),false);
    t.add();warning(t);
    assert.equal(t.get('paste').value,t.code);
    assert.match(t.get('tbl').innerHTML,new RegExp(t.code));
    assert.equal(t.get('b-x1').disabled,false);
    t.get('b-x1').onclick();
    assert.equal(t.downloads.length,1);
    assert.match(t.downloads[0].name,/\.xlsx$/);
    assert.equal(Buffer.from(await t.blobs[0].arrayBuffer()).subarray(0,2).toString(),'PK');
    assert.equal(t.evaluate('XLSX.utils.sheet_to_json(weekSheet(1,999),{header:1})[1].includes(recs["1-999-1"].code)'),true);
    // 下載訊息與其他輸入驗證不得遮掉存檔警示。
    t.get('paste').value='';t.get('b-add').onclick();warning(t);
    t.code=t.evaluate('CODEC.encode({week:1,cls:999,seat:1,mask:7,tries:[1,2,1,0,0,0],time:Date.UTC(2026,9,2)})');
    t.get('paste').value=t.code;t.get('b-add').onclick();warning(t);
    assert.equal(t.evaluate('recs["1-999-1"].mask'),7);
    assert.match(t.get('tbl').innerHTML,new RegExp(t.code));
  });
  test(`${key} 寫入例外：班人數快取保留於畫面及匯出，重試成功解除警示`,()=>{
    const t=setup();t.add();t.fail(key);t.size('3');warning(t);
    assert.equal(t.get('size').value,3);
    assert.match(t.get('stats').innerHTML,/\/ 3/);
    assert.equal(t.evaluate('XLSX.utils.sheet_to_json(weekSheet(1,999),{header:1}).length'),4);
    t.fail(null);t.size('4');
    assert.equal(t.get('save-msg').hidden,true);
    assert.equal(JSON.parse(t.stored.get('it9:sizes'))['999'],4);
  });
  test(`${key} 寫入例外：清除也顯示警示，其他班成績仍可匯出`,()=>{
    const t=setup();t.add();
    t.get('paste').value=t.evaluate('CODEC.encode({week:1,cls:998,seat:1,mask:1,tries:[1],time:Date.UTC(2026,9,1)})');
    t.get('b-add').onclick();t.fail(key);t.clear();warning(t);
    assert.equal(t.evaluate('all().length'),1);
    assert.equal(t.evaluate('all()[0].cls'),999);
    assert.equal(t.get('b-x1').disabled,false);
    t.get('b-x1').onclick();assert.equal(t.downloads.length,1);
  });
}
test('寫入成功：回傳 true、原有 key 與成績成功提示不變，班人數和清除皆存檔',()=>{
  const t=setup();assert.equal(t.evaluate('save()'),true);
  t.add();assert.equal(t.get('msg').className,'msg ok');assert.match(t.get('msg').textContent,/新增 1 人/);
  assert.equal(t.get('paste').value,'');assert.equal(t.get('save-msg').hidden,true);
  assert.equal(JSON.parse(t.stored.get('it9:grades'))['1-999-1'].code,t.code);
  t.size('3');assert.equal(JSON.parse(t.stored.get('it9:sizes'))['999'],3);
  t.size('');assert.deepEqual(JSON.parse(t.stored.get('it9:sizes')),{});
  t.clear();assert.deepEqual(JSON.parse(t.stored.get('it9:grades')),{});
  assert.deepEqual([...t.stored.keys()].sort(),['it9:grades','it9:sizes']);
  assert.equal(t.get('save-msg').hidden,true);
});
