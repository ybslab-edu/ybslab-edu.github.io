import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const source=readFileSync(new URL('../assets/shell.js',import.meta.url),'utf8');
function setup({teacher=false,reduced=false,actual=false}={}){
  const textNode=text=>({nodeType:3,textContent:String(text)});
  class Node extends Element{
    insertBefore(node,reference){this.childNodes.splice(this.childNodes.indexOf(reference),0,node);return node}
    scrollIntoView(options){scrolls.push({id:this.id,...options})}
  }
  // HTML parser 產生的元素沿用相同操作。
  Element.prototype.insertBefore=Node.prototype.insertBefore;
  const body=new Node('body'),stored=new Map(),scrolls=[];
  stored.set('it9:w99:999-1',JSON.stringify({mask:2,tries:[3,4,0,0,0,0],time:1}));
  const context=vm.createContext({document:{body,createTextNode:textNode,createElement:t=>new Node(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},matchMedia:()=>({matches:reduced}),TEACHER:{remembered:()=>teacher,remember(){}},
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)}});
  // scrollIntoView 由 HTML parser 產生的 section 同樣記錄。
  Element.prototype.scrollIntoView=function(options){scrolls.push({id:this.id,...options})};
  const actualScript=actual?[...readFileSync(new URL('../115-g9/u2-03/index.html',import.meta.url),'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'):null;
  vm.runInContext(source+(actualScript??`\nlet n=0,reply=true;const APP=SHELL({week:99,title:'合成活動',rounds:[1,2].map(i=>({lv:1,name:'合成'+i,
    now:i=>'固定 5，目標 <b>'+i.n+'</b>，小數 '+i.n+'.5',goal:'累積答對 2/2',gen:()=>({n:++n}),
    tip:i=>'方向 '+i.n,steps:i=>'拆步驟 '+i.n,learn:'合成規則',view:(i,el)=>{el.innerHTML='<button data-changed="target">目標 '+i.n+'</button>';el.querySelector('button').onclick=()=>globalThis.clicked=true;return {get:()=>null}},check:()=>reply}))});`),context);
  const get=id=>body.querySelector('#'+id),run=code=>vm.runInContext(code,context);
  // 隱藏的按鈕或隱藏祖先內的按鈕無法取得焦點。
  for(const button of body.querySelectorAll('button'))button.focus=function(){
    if(this.disabled)return;
    for(let el=this;el;el=el.parentElement)if(el.hidden)return;
    context.document.activeElement=this;
  };
  if(!teacher){get('in-cls').value='999';get('in-seat').value='1';get('g-go').click()}
  return {get,run,stored,scrolls,active:()=>context.document.activeElement,send:()=>get('b-send').click()};
}

test('提示層級：未送出鎖定、錯一次升一層、同關換題保留且更新內容、過關與換關重設',()=>{
  const h=setup();
  assert.equal(h.get('b-hint').disabled,true);h.get('b-hint').click();
  assert.equal(h.get('hint-content').textContent,'');
  h.run('reply=false');h.send();
  assert.match(h.get('hint-content').textContent,/第 1 層/);
  assert.doesNotMatch(h.get('hint-content').textContent,/第 2 層/);
  h.send();assert.match(h.get('hint-content').textContent,/拆步驟 3/);
  h.run('APP.load(0)');assert.match(h.get('hint-content').textContent,/拆步驟 4/);
  h.send();assert.match(h.get('hint-content').textContent,/第 3 層/);
  h.get('b-demo').click();assert.equal(h.get('original-work').hidden,true);
  const inst=h.run('APP.inst.n');h.send();assert.equal(h.run('APP.inst.n'),inst,'示範中不能送原題');
  h.get('b-demo-back').click();assert.equal(h.get('original-work').hidden,false);
  h.run('reply=true');h.send();h.send();assert.equal(h.get('hint-content').textContent,'');
  assert.equal(h.get('b-hint').disabled,true);
  h.run('APP.load(1)');assert.equal(h.get('hint-content').textContent,'');
});
test('沒有 steps 跳過第 2 層；答對後也能自行求助；教師工具保持可用',()=>{
  const h=setup();h.run('delete APP.rounds[0].steps');h.send();
  assert.equal(h.get('b-hint').disabled,false);
  h.get('b-hint').click();assert.match(h.get('hint-content').textContent,/第 1 層/);
  h.get('b-hint').click();assert.match(h.get('hint-content').textContent,/第 3 層/);
  assert.doesNotMatch(h.get('hint-content').textContent,/第 2 層/);
  const t=setup({teacher:true});assert.equal(t.get('hint-ladder').hidden,true);
});
test('三層上限與跳層純規則',()=>{
 const c=vm.createContext({});vm.runInContext(source,c);
 for(const steps of [false,true]){
 c.round=steps?{steps(){}}:{};
 assert.equal(vm.runInContext('shellHintNext(0,round)',c),1);
 assert.equal(vm.runInContext('shellHintNext(1,round)',c),steps?2:3);
 assert.equal(vm.runInContext('shellHintNext(2,round)',c),3);
 assert.equal(vm.runInContext('shellHintNext(3,round)',c),3);
 }
});

test('開啟示範聚焦返回鈕；返回原題先顯示示範鈕再還原焦點',()=>{
 const h=setup();h.run('reply=false');h.send();h.get('b-hint').click();h.get('b-hint').click();
 h.get('b-demo').focus();h.get('b-demo').click();
 assert.equal(h.active()===h.get('b-demo-back'),true,'開啟示範的焦點');
 h.get('b-demo-back').click();
 assert.equal(h.get('b-demo').hidden,false);
 assert.equal(h.active()===h.get('b-demo'),true,'返回原題的焦點');
});

test('示範保留原題與作答：另一題填答、說明、進度欄位及次數不變',()=>{
 const h=setup();
 h.run(`APP.rounds[0].view=(inst,el,api)=>{el.innerHTML='<input id="synthetic-answer">';const inp=el.querySelector('input');return {get:()=>inp.value,fill:()=>{inp.value=inst.n;api.changed();api.attempt()}}};APP.load(0);reply=false`);
 h.send();h.get('b-hint').click();h.get('b-hint').click();
 h.run("APP.handle.fill();globalThis.originalInst=APP.inst;globalThis.originalHandle=APP.handle;reply=true");
 const original=h.run('JSON.stringify(APP.inst)'),answer=h.run('APP.handle.get()'),stored=[...h.stored];
 h.get('b-demo').click();
 assert.ok(h.get('demo-content').querySelector('fieldset'));
 assert.match(h.get('demo-content').textContent,/拆步驟 4/);
 assert.equal(h.run('APP.inst===originalInst&&APP.handle===originalHandle'),true);
 assert.equal(h.run('JSON.stringify(APP.inst)'),original);assert.equal(h.run('APP.handle.get()'),answer);
 assert.deepEqual([...h.stored],stored,'示範的 changed/attempt 不記次、不存檔');
 h.get('b-demo-back').click();assert.equal(h.run('APP.handle.get()'),answer);
 assert.equal(h.get('original-work').hidden,false);
});
test('不能自動填答、無法抽出不同題、填答失敗時顯示 learn；重抽有上限',()=>{
 for(const mode of ['no-fill','constant','bad-fill']){
  const h=setup();h.run('reply=false');h.send();h.get('b-hint').click();h.get('b-hint').click();
  if(mode==='constant')h.run('globalThis.draws=0;APP.rounds[0].gen=()=>{draws++;return {...APP.inst}};APP.handle.fill=()=>{}');
  if(mode==='bad-fill')h.run('APP.handle.fill=()=>{};APP.rounds[0].view=()=>({get:()=>null,fill(){throw Error("合成失敗")}})');
  const original=h.run('JSON.stringify(APP.inst)');
  h.get('b-demo').click();assert.match(h.get('demo-content').textContent,/合成規則/);
  assert.equal(h.get('demo-content').querySelector('fieldset'),null);
  assert.equal(h.run('JSON.stringify(APP.inst)'),original);
  if(mode==='constant')assert.equal(h.run('draws'),20);
 }
});
