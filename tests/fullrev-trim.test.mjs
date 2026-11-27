import test from 'node:test';
import assert from 'node:assert/strict';
import {MANAGED_ACTIVITIES,BATCH8,ROUND_COPY,activityConfig,renderQuestion} from '../assets/fullrev-activities.mjs';
import {questionHints} from '../assets/fullrev-shell.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {sheetQuestion} from './fixtures/fullrev-u206-sheet.mjs';
function dom(t){const saved=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});t.after(()=>saved?Object.defineProperty(globalThis,'document',saved):delete globalThis.document);}
test('30 活動 121 關皆覆寫靜態／缺漏說明，保留關卡順序、納管與其他設定',()=>{
 assert.equal(MANAGED_ACTIVITIES.length,30);let rounds=0;
 for(const a of MANAGED_ACTIVITIES){
  const original={course:'115-g9',week:a.activity,title:a.title,custom:'retain',rounds:a.rounds.map(()=>({now:'舊故事',goal:'舊目標',learn:'retain',custom:'retain'}))},before=structuredClone(original),cfg=activityConfig(original);
  assert.equal(cfg.custom,'retain');assert.deepEqual(original,before);assert.equal(cfg.rounds.length,a.rounds.length);
  assert.equal(ROUND_COPY[a.activity].length,a.rounds.length);
  cfg.rounds.forEach((r,i)=>{rounds++;assert.equal(r.name,a.rounds[i]);assert.equal(r.managed,a.managed.includes(i)||BATCH8.some(b=>b.activity===a.activity&&b.course===undefined&&b.managed.includes(i)));assert.equal(r.learn,'retain');assert.equal(r.custom,'retain');
   for(const text of [r.now,r.goal]){assert.match(text,/你/);assert.equal((text.match(/。/g)||[]).length,1);assert.doesNotMatch(text,/老師|同學|學校|園遊會|學務處|小安|小禾|提示：|兩組不同資料/);}
  });
 }
 assert.equal(rounds,121);const other={course:'other',week:7};assert.equal(activityConfig(other),other);
});
test('正式操作區直接顯示控制，必要假設折疊保留，Worker 題面與提示均不改寫',t=>{
 dom(t);const q={type:'finite-bank-v1',slot:0,title:'標題',instruction:'共用指示',data:{mode:'select',heading:'重複標題',story:['你要做選擇。','所有資料都是模擬值。'],task:'選出一項。',hint:'原提示甲。',guide:['先比較。','再作答。'],options:['甲','乙']}};
 const before=structuredClone(q),hints=questionHints(q),host=new Element('div'),handle=renderQuestion(q,host,{shell:true,changed(){}});
 assert.equal(host.firstChild.className,'rows');assert.equal(host.querySelectorAll('.panel').length,0);
 const detail=host.querySelector('.question-data-notes');assert.equal(detail.tagName,'DETAILS');assert.ok(!detail.open);assert.ok(detail.textContent.includes(q.data.story.join('')));
 assert.deepEqual(questionHints(q),hints);assert.equal(hints.direction,q.data.hint);assert.deepEqual(hints.steps,q.data.guide);assert.deepEqual(q,before);
 host.querySelector('button').click();assert.equal(handle.get(),0);assert.equal(handle.ready(),true);
});
test('原生提示留在提示按鈕來源，動態數值保留於控制區標籤',t=>{
 dom(t);const q={type:'capacity-conversion-v1',slot:0,instruction:'容量任務',data:{bits:80,kib:3,amount:2000,units:['KB','MB','GB'],from:0,to:1}},host=new Element('div');
 const hint=questionHints(q);renderQuestion(q,host,{shell:true,changed(){}});
 assert.match(host.textContent,/80 位元＝幾位元組/);assert.match(host.textContent,/3 KiB＝幾位元組/);assert.match(host.textContent,/2000 KB＝幾 MB/);
 assert.deepEqual(host.querySelectorAll('h3').map(e=>e.textContent),['電腦裡發生的']);assert.match(hint.direction,/8 位元＝1 位元組/);assert.match(hint.direction,/1 KiB＝1024 位元組/);assert.match(hint.direction,/每級用 1000/);
});
test('u206 四關直接進操作，聲明位於預設收合的資料規格內',t=>{
 dom(t);for(let round=0;round<4;round++){
  const host=new Element('div');renderQuestion(sheetQuestion(round),host,{shell:true,changed(){}});
  const root=host.querySelector('.volunteer-sheet');const operation=root.querySelector('section');assert.match(operation.textContent,/A\./);assert.doesNotMatch(operation.textContent,/你協助星港|收件已截止|你拿到已清理/);
  const rules=host.querySelectorAll('details').find(e=>e.firstChild.textContent==='查看共用資料規格與紀錄說明');assert.ok(rules);assert.ok(!rules.open);assert.match(rules.textContent,/虛構示意資料/);assert.match(rules.textContent,/不需開啟其他工具/);assert.match(rules.textContent,/獨立副本/);
 }
});

test('取樣門檻與遊戲計分目標隨授權題面顯示，改寫短句不會遮掉每組操作條件',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 dom(t);for(const key of ['requestAnimationFrame','cancelAnimationFrame']){const saved=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value:()=>1});t.after(()=>saved?Object.defineProperty(globalThis,key,saved):delete globalThis[key]);}
 const {resolve}=await import('node:path'),{pathToFileURL}=await import('node:url'),load=file=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,'src/formal',file)).href);
 const {projectQuestion}=await load('questions.mjs');let checked=0;
 for(const file of ['banks/pr6-batch8.mjs','banks/pr6-batch6.mjs']){
  const {default:banks}=await load(file);
  for(const bundle of Object.values(banks))for(const bank of Object.values(bundle.rounds)){
   const c=bank.cases[0],q=projectQuestion({data:c.facts,answer:c.answer},0,bank.type,'',bank.instruction),d=q.data;
   if(!d.mode?.startsWith('recording-')&&d.mode!=='memory-performance')continue;
   const before=structuredClone(q),host=new Element('div'),h=renderQuestion(q,host,{shell:true,changed(){}});
   if(d.mode==='recording-sound')assert.match(host.textContent,new RegExp(`至少 ${d.target}%`));
   if(d.mode==='recording-image'){assert.ok(host.textContent.includes(d.use));assert.ok(host.textContent.includes(`${d.minRes} × ${d.minRes} 像素、${d.minColors} 色`));}
   if(d.mode==='recording-movie')assert.ok(host.textContent.includes(`至少 ${d.target} fps`));
   if(d.mode==='memory-performance')assert.ok(host.textContent.includes(d.task.replaceAll('小安','你')));
   assert.deepEqual(q,before);h.dispose?.();checked++;
  }
 }
 assert.equal(checked,7);
});
