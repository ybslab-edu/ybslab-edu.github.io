// 實際頁面 + 共用 shell，只有 DOM/儲存是替身；不載入登入或網路。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/shell.js');
const seeds=[1,7,42,2026,0x12345678,0x7fffffff,0x80000000,0xffffffff];
function activity(dir){
  const html=read(`115-g9/${dir}/index.html`),body=new Element('body');
  const context=vm.createContext({document:{body,addEventListener(){},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,
    matchMedia:()=>({matches:true})});
  const run=(source,timeout=1000)=>vm.runInContext(source,context,{timeout});
  // 控制 Math.random（自訂活動也會用到），同時限制傳入 gen 的 rnd 呼叫數。
  run(`let state=1,calls=0;function rnd(){if(++calls>100000)throw Error('產題亂數超過 100000 次');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}Math.random=rnd;`);
  run(shell+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,context};
}
const dirs=readdirSync(new URL('../115-g9/',import.meta.url)).filter(d=>/^u\d+-\d+$/.test(d)&&read(`115-g9/${d}/index.html`).includes('assets/shell.js'));

for(const dir of dirs)test(dir+' 全關示範隔離：不同題、填答正確、返回保留原題與進度',()=>{
 const {run}=activity(dir);
 run("document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click()");
 const count=run('APP.rounds.length');
 for(let index=0;index<count;index++){
  const result=run(`(()=>{
   APP.load(${index});
   const r=APP.rounds[${index}],originalCheck=r.check;
   r.check=()=>false;document.getElementById('b-send').click();r.check=originalCheck;
   for(let n=0;n<3;n++)document.getElementById('b-hint').click();
   const original=APP.inst,handle=APP.handle,inst=JSON.stringify(APP.inst),answer=JSON.stringify(handle.get());
   const demoKeys=[],gen=r.gen,key=i=>shellContentKey(r.questionKey?r.questionKey(i):i);
   r.gen=rnd=>{const i=gen(rnd);demoKeys.push(key(i));return i};
   document.getElementById('b-demo').click();
   const box=document.getElementById('demo-content'),shown=!document.getElementById('hint-demo').hidden,
     filled=!!box.querySelector('fieldset'),why=box.textContent;
   const isolated=APP.inst===original&&APP.handle===handle&&JSON.stringify(APP.inst)===inst&&JSON.stringify(APP.handle.get())===answer;
   document.getElementById('b-demo-back').click();r.gen=gen;
   return {shown,filled,why,isolated,different:demoKeys.some(k=>k!==key(original)),manual:!!r.manualAttempt,returned:!document.getElementById('original-work').hidden};
  })()`);
  assert.equal(result.shown,true);assert.equal(result.isolated,true);assert.equal(result.returned,true);
  if(!result.manual){assert.equal(result.different,true);assert.equal(result.filled,true,dir+' 關 '+index+' 示範不應降級說明：'+result.why)}
  assert.ok(result.why.length>20);
 }
});
