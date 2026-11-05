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
    view:(i,el)=>{el.innerHTML='<button data-changed="target">目標 '+i.n+'</button>';el.querySelector('button').onclick=()=>globalThis.clicked=true;return {get:()=>null}},check:()=>reply}))});`),context);
  const get=id=>body.querySelector('#'+id),run=code=>vm.runInContext(code,context);
  if(!teacher){get('in-cls').value='999';get('in-seat').value='1';get('g-go').click()}
  return {get,run,stored,scrolls,send:()=>get('b-send').click()};
}
test('累積計數與舊進度：答對、錯答不歸零、答對過關；教師不存檔',()=>{
  for(const teacher of [false,true]){
    const h=setup({teacher});
    h.send();h.run('reply=false');h.send();
    assert.match(h.get('streak').textContent,/累積答對 1\/2/);assert.equal(h.run('APP.inst.n'),3);
    h.run('reply=true');h.send();assert.equal(h.get('verdict').className,'verdict ok');
    assert.match(h.get('streak').textContent,/累積答對 2\/2/);
    const p=JSON.parse(h.stored.get('it9:w99:999-1'));
    assert.equal(p.mask,teacher?2:3);assert.deepEqual(p.tries,teacher?[3,4,0,0,0,0]:[6,4,0,0,0,0]);
    assert.deepEqual(Object.keys(p).sort(),['mask','time','tries'],'保留舊存檔格式');
    h.run('APP.load(1)');assert.match(h.get('streak').textContent,/累積答對 0\/2/);
  }
});
test('送出換題捲動選項：正確、錯誤各一次，過關及切關不捲動',()=>{
  for(const reduced of [false,true]){
    const h=setup({reduced});assert.equal(h.scrolls.length,0);
    h.send();h.run('reply=false');h.send();
    assert.equal(h.scrolls.length,2);
    for(const options of h.scrolls){assert.equal(options.id,'task-instructions');assert.equal(options.behavior,reduced?'auto':'smooth');assert.equal(options.block,'start')}
    h.run('reply=true');h.send();h.run('APP.load(1)');assert.equal(h.scrolls.length,2);
  }
});
test('共用數字標示：固定值不標，整數與小數變值標示，保留按鈕事件',()=>{
  const h=setup();assert.equal(h.get('says').querySelectorAll('.question-changed').length,0);
  h.send();
  assert.deepEqual(h.get('says').querySelectorAll('.question-changed').map(n=>n.textContent),['2','2.5']);
  assert.deepEqual(h.get('stage').querySelectorAll('.question-changed').map(n=>n.textContent),['2']);
  h.get('stage').querySelector('button').click();assert.equal(h.run('clicked'),true);
  h.run('APP.load(1)');assert.equal(h.get('says').querySelectorAll('.question-changed').length,0);
});
test('舊 streak 計數可直接延續為累積次數',()=>{
  const c=vm.createContext({});vm.runInContext(source,c);
  const state={cfg:{},$:()=>({querySelector:()=>({})}),R:[{check:()=>false}],ri:0,inst:{},handle:{get:()=>null},streak:1,
    attempt(){},fresh(){},renderStreak(){}};
  c.state=state;vm.runInContext('shellCreateJudging(state).submit()',c);assert.equal(state.streak,1);
});

test('u2-03 實際題目：生日、八燈、最少燈數與容量的任務數字及目標卡同步標示',()=>{
  const h=setup({teacher:true,actual:true});
  for(const i of [0,2,3,4]){
    h.run(`APP.load(${i===0?1:0})`);
    h.run(`{globalThis.draws=0;ROUNDS[${i}].gen=()=>{const draw=++draws,n=draw<=3?1:2;return ${i}===0?{who:'合成角色',t:3+n}:${i}===2?{t:130+n,why:'合成目標'}:${i}===3?{n:100+n,b:7,max:127,what:'合成編號'+draw}:{bits:8*n,kib:n,from:1,to:0,amount:n}};APP.load(${i})}`);
    assert.equal(h.run('draws'),1);
    const first=h.run('JSON.stringify(APP.inst)');
    if(i>=3)assert.equal(h.get('b-send').disabled,true);
    h.get('tb-ans').click();
    assert.equal(h.get('b-send').disabled,false,'教師顯示答案後必須啟用送出');
    h.send();
    assert.equal(h.get('verdict').hidden,false);
    assert.match(h.get('streak').textContent,/累積答對 1\/2/);
    assert.notEqual(h.run('JSON.stringify(APP.inst)'),first);
    assert.equal(h.run('draws'),4,'排除重複數值，不能只改情境文字');
    assert.ok(h.get('says').querySelectorAll('.question-changed').length>0);
    assert.ok(h.get('stage').querySelector('.target-content').querySelectorAll('.question-changed').length>0);
    h.get('tb-ans').click();h.send();assert.equal(h.get('verdict').className,'verdict ok');
  }
});
