import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,response,snapshot,store,activities,config} from './fixtures/fullrev.mjs';
import {sheetQuestion,syntheticSolution} from './fixtures/fullrev-u206-sheet.mjs';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let k=0;k<200;k++){if(check())return;await tick();}assert.ok(check(),'未到預期狀態');}
async function open(t,{tickets=false,round=3,teacher=false}={}){
 const h=await harness({answerTickets:tickets}),body=new Element('body'),events={};h.state.owner=teacher;h.state.snapshot=snapshot([]);h.state.correct=false;h.state.fail=false;h.state.expired=false;
 const extra=tickets?{ticketVersion:1,ticket:'ybs-answer-v1.synthetic-sheet-ticket'}:{};
 h.state.fetcher=async(url,init)=>{
  const b=JSON.parse(init.body);
  if(url.endsWith('/teacher-question'))return Response.json({sourceProject:config.firebase.projectId,uid:h.state.uid,...b,question:sheetQuestion(round),solution:{answer:syntheticSolution(sheetQuestion(round)),notes:['合成教學說明']}},{headers:{'cache-control':'no-store'}});
  if(h.state.fail)throw Error('synthetic offline');if(h.state.expired&&url.endsWith('/answer'))return Response.json({error:'ticket_expired'},{status:410});
  const slot=h.state.correct&&url.endsWith('/answer')?1:b.slot||0;
  return Response.json(response(slot,{...extra,nextSeq:url.endsWith('/answer')?b.seq+1:slot+1,...(url.endsWith('/answer')?{correct:h.state.correct,feedback:'請核對本組設定。'}:{}),question:sheetQuestion(round,slot)}));
 };
 const xp=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xp);
 for(const [key,value] of Object.entries({document:{body,head:new Element('head'),createElement:tag=>new Element(tag),addEventListener:(k,f)=>events[k]=f},window:{addEventListener:(k,f)=>events[k]=f},sessionStorage:store(),localStorage:store(),ACTIVITIES:activities,isActivityOpen:()=>true,YBSXP:vm.runInContext('YBSXP',xp)})){
  const saved=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>saved?Object.defineProperty(globalThis,key,saved):delete globalThis[key]);
 }
 const cfg={course:'115-g9',week:5,title:'合成志工回覆整理所',rounds:[{name:'合成整理任務'}],renderQuestion};
 await mountActivity({client:Promise.resolve(h.client),cfg});const $=id=>body.querySelector('#'+id);
 if(teacher)await h.client.login('owner');else{await h.login();await until(()=>!$('g-isme').hidden);await $('g-isme').onclick();}await until(()=>!!body.querySelector('.volunteer-sheet'));
 const label=text=>{const l=body.querySelectorAll('label').find(el=>el.textContent===text);return l?body.querySelector('#'+l.getAttribute('for')):null;};
 const input=(text,value)=>{const el=label(text);assert.ok(el,text);el.value=value;el.oninput();};
 const action=key=>body.querySelectorAll('button').find(el=>el.dataset.sheetAction===key)?.click();
 t.after(()=>h.client.logout());return {...h,body,$,input,action,label,events};
}
function fill(h){
 h.input('組別等於','動漫組');h.input('可到場時段包含','下午');h.action('filter');
 for(const [k,j] of ['入口引導','遊戲體驗','舞台支援'].entries())h.input(j+'有效回覆筆數',String([2,3,2][k]));
 h.action('counts');h.input('圖表資料來源','filtered');h.input('圖表標題','1');h.action('pie');h.input('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。','28.6');h.input('你會優先補招哪個職務？','0');h.input('你採用什麼理由？','demandGap');
}
test('真實 shell：物件 answer、錯答保留同一 renderer／圖、下一組才清空 token 與草稿',async t=>{
 const h=await open(t);assert.doesNotMatch(h.$('says').textContent,/\[object Object\]/);assert.match(h.$('says').textContent,/記錄統計/);assert.equal(h.$('stage').classList? h.$('stage').className.includes('quest-outcome'):false,false);
 fill(h);const original=h.body.querySelector('.volunteer-sheet'),canvas=h.body.querySelector('canvas');assert.ok(canvas);assert.equal(h.$('b-send').disabled,false);
 await h.$('b-send').onclick();await until(()=>h.$('answer-status').textContent==='已送出：還不對');assert.equal(h.body.querySelector('.volunteer-sheet'),original);assert.equal(h.body.querySelector('canvas'),canvas);
 const a=h.requests.at(-1).body.answer;assert.equal(a.schemaVersion,2);assert.equal(a.state.percentTenths,286);assert.equal(a.ops.length,3);assert.equal(a.datasetToken,'A'.repeat(22));
 h.state.correct=true;h.input('入口引導占有效回覆百分之幾？四捨五入到小數 1 位。','28.5');await h.$('b-send').onclick();await until(()=>!!h.$('b-next-group'));assert.equal(h.body.querySelector('.volunteer-sheet'),original);assert.ok(h.body.querySelector('canvas'));
 h.$('b-next-group').click();assert.notEqual(h.body.querySelector('.volunteer-sheet'),original);assert.equal(h.body.querySelector('canvas'),null);assert.equal(h.label('入口引導有效回覆筆數').value,'');assert.equal(h.$('stage').dataset.slot,1);assert.equal(h.client.loadInput(5,0),undefined);
});
test('一般／作答票：斷線保留原操作，retry 送相同物件，不重排／加總答案',async t=>{
 for(const tickets of [false,true])await t.test(String(tickets),async t=>{
  const h=await open(t,{tickets});fill(h);h.state.fail=true;await h.$('b-send').onclick();await until(()=>!!h.client.state().pending);
  const a=structuredClone(h.requests.at(-1).body),count=h.requests.length,chart=h.body.querySelector('canvas');assert.ok(chart);assert.match(new URL(h.requests.at(-1).url).pathname,tickets?/ticket\/answer/:/^\/answer$/);
  h.state.fail=false;await h.$('b-retry').onclick();assert.equal(h.requests.length,count,'退避期未到不可重送');assert.equal(h.$('verdict').querySelector('h3'),null);
  h.advance(1000);await h.$('b-retry').onclick();await until(()=>h.$('verdict').querySelector('h3')?.textContent==='還不對');assert.equal(h.$('answer-status').textContent,'已送出：還不對');assert.equal(h.requests.length,count+1);assert.equal(h.client.state().pending,false);assert.deepEqual(h.requests.at(-1).body,a);assert.equal(h.body.querySelector('canvas'),chart);
 });
});
test('票過期不會延長期限；重新開始清除舊操作與表格狀態',async t=>{
 const h=await open(t,{tickets:true});fill(h);h.state.expired=true;await h.$('b-send').onclick();await until(()=>h.client.state().status==='restart-required');assert.ok(h.body.querySelector('canvas'));
 h.state.expired=false;const restart=h.body.querySelectorAll('button').find(b=>b.textContent==='重新開始');assert.ok(restart);await restart.onclick();await until(()=>h.client.state().status!=='restart-required'&&!h.body.querySelector('canvas'));
 assert.equal(h.label('入口引導有效回覆筆數').value,'');assert.equal(h.client.loadInput(5,0),undefined);
});
test('教師身分載入四關並套入操作，只取教師題面且不寫草稿或成績',async t=>{
 for(const round of [0,1,2,3])await t.test(String(round),async t=>{
  const h=await open(t,{round,teacher:true});assert.equal(h.client.state().profile.owner,true);
  h.$('tb-fill').click();assert.equal(h.$('teacher-solution').hidden,false);assert.doesNotMatch(h.$('teacher-solution').textContent,/\[object Object\]/);
  if(round===3)assert.ok(h.body.querySelector('canvas'));
  assert.deepEqual(h.requests.map(r=>new URL(r.url).pathname),['/teacher-question']);assert.equal(h.client.loadInput(5,0),undefined);
  assert.equal([...h.shared.map.keys()].some(k=>k.startsWith('ybs:fullrev:work:')),false);
 });
});
