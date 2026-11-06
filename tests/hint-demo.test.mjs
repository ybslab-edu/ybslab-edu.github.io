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

const coverage={total:0,automatic:0,manual:0};
for(const dir of dirs)test(dir+' 全關示範隔離：不同題、填答正確、返回保留原題與進度',()=>{
 const {run}=activity(dir);
 run("document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click()");
 let automatic=0,manual=0;
 const count=run('APP.rounds.length');
 for(let index=0;index<count;index++){
  const result=run(`(()=>{
   const round=APP.rounds[${index}],view=round.view;
   round.view=(inst,el,api)=>{if(el.id==='stage')globalThis.answerChanged=api.changed;return view(inst,el,api)};
   APP.load(${index});
   // fill 不保證觸發 changed；與教師填答入口一樣明確同步 ready。
   APP.handle.fill();
   if(${dir==='u0-01'&&index===0}){
    if(!document.getElementById('b-send').disabled)throw Error('排序 fill 不會自行通知 changed');
    document.getElementById('b-send').click();
    if(!document.getElementById('b-hint').disabled)throw Error('disabled 送出不應解鎖提示');
   }
   answerChanged();
   if(document.getElementById('b-send').disabled)throw Error('填答後仍無法送出');
   const r=APP.rounds[${index}],originalCheck=r.check;
   r.check=()=>false;document.getElementById('b-send').click();r.check=originalCheck;
   for(let n=0;n<3;n++)document.getElementById('b-hint').click();
   const original=APP.inst,handle=APP.handle,inst=JSON.stringify(APP.inst),answer=JSON.stringify(handle.get());
   const demoKeys=[],gen=r.gen,demoView=r.view,check=r.check,violations=[],key=i=>shellContentKey(r.questionKey?r.questionKey(i):i);
   const unchanged=phase=>{if(APP.inst!==original||APP.handle!==handle)violations.push(phase)};
   const guard=(phase,fn)=>function(...args){unchanged(phase+' 前');try{return fn.apply(this,args)}finally{unchanged(phase+' 後')}};
   r.gen=guard('gen',rnd=>{const i=gen(rnd);demoKeys.push(key(i));return i});
   r.view=guard('view',(inst,el,api)=>{
    const h=demoView(inst,el,api);
    return {...h,fill:guard('fill',()=>h.fill()),get:guard('get',()=>h.get())};
   });
   r.check=guard('check',check);
   document.getElementById('b-demo').click();
   const box=document.getElementById('demo-content'),shown=!document.getElementById('hint-demo').hidden,
     filled=!!box.querySelector('fieldset'),why=box.textContent;
   const ids=document.body.querySelectorAll('[id]').map(el=>el.id),duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
   const labelsLinked=box.querySelectorAll('[for]').every(el=>!!box.querySelector('#'+el.getAttribute('for')));
   const isolated=APP.inst===original&&APP.handle===handle&&JSON.stringify(APP.inst)===inst&&JSON.stringify(APP.handle.get())===answer;
   document.getElementById('b-send').click();unchanged('示範中送出後');
   document.getElementById('b-demo-back').click();unchanged('返回後');r.gen=gen;r.view=demoView;r.check=check;
   return {shown,filled,why,isolated,violations,duplicates,labelsLinked,different:demoKeys.some(k=>k!==key(original)),manual:!!r.manualAttempt,returned:!document.getElementById('original-work').hidden};
  })()`);
  const label=dir+' 關卡索引 '+index;
  assert.deepEqual(Array.from(result.duplicates),[],label+' 示範不可產生重複 ID');
  assert.equal(result.labelsLinked,true,label+' 示範標籤仍連結示範元件');
  assert.equal(result.shown,true,label+' 示範顯示');assert.equal(result.isolated,true,label+' 原題物件及作答不變');assert.equal(result.returned,true,label+' 返回原題');
  assert.deepEqual(Array.from(result.violations),[],label+' 各示範回呼前後都不得暫換原題物件');
  if(!result.manual){automatic++;assert.equal(result.different,true);assert.equal(result.filled,true,dir+' 關 '+index+' 示範不應降級說明：'+result.why)}
  else{manual++;assert.equal(result.filled,false);assert.equal(result.different,false);assert.equal(result.why,run(`(()=>{const r=APP.rounds[${index}],text=document.createElement('div'),txt=v=>typeof v==='function'?v(APP.inst):(v||'');text.innerHTML=r.learn||[r.now,r.goal,r.tip].map(txt).join('');return '這一關的說明'+text.textContent})()`))}
  assert.ok(result.why.length>20);
 }
 assert.equal(manual,['u1-05','u1-06','u2-01'].includes(dir)?4:0);
 assert.equal(automatic,count-manual);
 coverage.total+=count;coverage.automatic+=automatic;coverage.manual+=manual;
});

test('全站覆蓋 121 關：109 關自動示範、12 關演出說明',()=>{
 assert.deepEqual(coverage,{total:121,automatic:109,manual:12});
});

test('u5-10 信心值示範：種子 38 觸發同答案修正，包裝 gen 後仍能開啟且不改原題',()=>{
 const {run}=activity('u5-10');
 const result=run(`(()=>{
  document.getElementById('in-cls').value='999';document.getElementById('in-seat').value='1';document.getElementById('g-go').click();
  const r=APP.rounds[2],view=r.view;
  r.view=(inst,el,api)=>{if(el.id==='stage')globalThis.answerChanged=api.changed;return view(inst,el,api)};
  APP.load(2);APP.handle.fill();answerChanged();document.getElementById('b-send').click();
  for(let n=0;n<3;n++)document.getElementById('b-hint').click();
  const inst=APP.inst,handle=APP.handle,answer=JSON.stringify(handle.get()),gen=r.gen;
  // 與瀏覽器驗收相同：包裝器以一般函式呼叫原產題器。
  r.gen=rnd=>gen(rnd);state=38;calls=0;
  document.getElementById('b-demo').click();
  const shown=!document.getElementById('hint-demo').hidden,filled=!!document.getElementById('demo-content').querySelector('fieldset');
  document.getElementById('b-demo-back').click();
  return {shown,filled,same:APP.inst===inst&&APP.handle===handle&&JSON.stringify(handle.get())===answer};
 })()`);
 assert.equal(result.shown,true);assert.equal(result.filled,true);assert.equal(result.same,true);
});

test('u5-10 信心值產題有界：多種子與固定亂數皆有不同答案，正解可過、錯答不可過',()=>{
 const {run,context}=activity('u5-10');
 const validate=()=>{
  const result=run(`(()=>{
   const gen=APP.rounds[2].gen,inst=gen(testRandom),expected=inst.rows.map(p=>p.some(v=>v>=60)?p.findIndex(v=>v>=60):3);
   return {valid:inst.rows.length===4&&inst.rows.every(p=>p.length===3&&p.every(Number.isInteger)&&p.reduce((a,b)=>a+b,0)===100&&new Set(p).size===3&&Math.max(...p)!==60),
    diverse:new Set(inst.ans).size>=2,answersMatch:inst.ans.every((v,i)=>v===expected[i]),correct:APP.rounds[2].check(inst,expected),wrong:APP.rounds[2].check(inst,expected.map(v=>(v+1)%4))};
  })()`);
  assert.equal(result.valid,true);assert.equal(result.diverse,true);assert.equal(result.answersMatch,true);assert.equal(result.correct,true);assert.notEqual(result.wrong,true);
 };
 for(let seed=1;seed<=200;seed++){
  run('state='+seed+';calls=0;globalThis.testRandom=rnd');validate();
 }
 for(const value of [0,0.5,0.999999]){
  let calls=0;context.testRandom=()=>{assert.ok(++calls<=400,'固定亂數不得無限重抽');return value};validate();
 }
});
