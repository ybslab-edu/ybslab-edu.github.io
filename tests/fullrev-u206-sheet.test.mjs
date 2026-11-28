import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Element} from './fixtures/activity-dom.mjs';
import {sheetQuestion,syntheticSolution} from './fixtures/fullrev-u206-sheet.mjs';
import {createSheetModel,markedCells,dedupeRows,filterRows,percentTenths,demandGaps} from '../assets/fullrev-volunteer-sheet.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {mountTeacherQuestion} from '../assets/fullrev-teacher-view.mjs';
import {buildSite,scanRelease,releasePaths} from '../tools/build-fullrev-site.mjs';
import {config} from './fixtures/fullrev.mjs';
const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
const vectors=JSON.parse(await readFile(new URL('./fixtures/u206-sheet-v2-vectors.json',import.meta.url),'utf8'));
function dom(t){const saved=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});t.after(()=>saved?Object.defineProperty(globalThis,'document',saved):delete globalThis.document);}
test('Worker 共用契約向量：實際標記、A～J／B／B～J 去重、AND 篩選、時段正規化、百分比與缺口',async()=>{
 for(const v of vectors.format)assert.deepEqual(markedCells(vectors.rows,v),v.marked);
 for(const v of vectors.dedupe)assert.deepEqual(dedupeRows(vectors.rows,v.columns),{kept:v.kept,removed:v.removed});
 assert.deepEqual(filterRows(vectors.rows,vectors.filter.group,vectors.filter.slot),vectors.filter.visible);
 assert.equal(percentTenths(vectors.analysis.counts,vectors.analysis.query),vectors.analysis.percentTenths);
 assert.deepEqual(demandGaps(vectors.analysis.demand,vectors.analysis.counts),vectors.analysis.gaps);
 const a=[...vectors.rows[0]],b=[...a];a[7]=vectors.slotNormalization.left;b[7]=vectors.slotNormalization.right;
 assert.deepEqual(dedupeRows([a,b],[...'BCDEFGHIJ']),{kept:[0],removed:[1]});
 if(process.env.YBS_WORKER_SOURCE)assert.equal(await readFile(new URL('./fixtures/u206-sheet-v2-vectors.json',import.meta.url),'utf8'),await readFile(resolve(process.env.YBS_WORKER_SOURCE,'tests/fixtures/u206-sheet-v2-vectors.json'),'utf8'));
});
test('四關教師操作、工作副本、不可變快照、草稿重播與跨組拒收',t=>{
 dom(t);
 for(let round=0;round<4;round++){
  const q=sheetQuestion(round),before=structuredClone(q),m=createSheetModel(q.data),answer=syntheticSolution(q);
  assert.equal(m.applyTeacherSolution(answer),true,'round '+round);assert.deepEqual(m.get(),answer);assert.deepEqual(q,before);assert.ok(Object.isFrozen(m.data.rows[0].cells));
  const copy=createSheetModel(q.data);assert.equal(copy.restoreDraft(m.draft()),true);assert.deepEqual(copy.get(),answer);
  assert.equal(createSheetModel(sheetQuestion(round,1).data).restoreDraft(m.draft()),false);
  const host=new Element('div'),h=renderQuestion(q,host,{changed(){},shell:true,demonstration:true});assert.equal(h.applyTeacherSolution(answer),true);assert.equal(h.ready(),true);assert.deepEqual(h.get(),answer);
  // 選單的可存取名稱只來自欄位文字，選項不能成為 label 的子節點。
  for(const select of host.querySelectorAll('select')){
   const labels=host.querySelectorAll('label').filter(l=>l.getAttribute('for')===select.id);
   assert.equal(labels.length,1);assert.equal(labels[0].childNodes.every(n=>n.nodeType===3),true);assert.equal(select.closest('label'),null);
  }
  assert.equal(h.draft(),null);assert.equal(h.restoreDraft(m.draft()),false);
  const c=m.controls(),inputValues=round===3?{count0:c.counts[0],count1:c.counts[1],count2:c.counts[2],percent:c.percent}:{};
  const target=new Element('div'),other=renderQuestion(q,target,{changed(){},shell:true});assert.equal(other.applyTeacherSolution,undefined);assert.equal(other.restoreDraft({...m.draft(),selectedRowIds:[],inputValues}),true);assert.deepEqual(other.get(),answer);
  assert.doesNotMatch(JSON.stringify(other.draft()),/"(?:rows|cells|question|expected|seed|solution|correct|feedback)"/);
  h.dispose();assert.equal(host.childNodes.length,0);other.dispose();
 }
});
test('格式真實套用、排除與逐列／全部復原，不自動排除選填空白或有效重複',()=>{
 const q=sheetQuestion(1),m=createSheetModel(q.data),range={fromColumn:'G',toColumn:'H',fromRow:2,toRow:11};
 assert.match(m.execute('format'),/範圍/);m.set('range',range);m.set('rule','empty');m.execute('format');assert.equal(m.results().marked.length,2);
 m.set('range',{...range,fromColumn:'J',toColumn:'J'});m.execute('format');assert.equal(m.results().marked.length,10);assert.equal(m.results().excludedRowIds.length,0);
 m.set('range',{...range,fromColumn:'A',toColumn:'J'});m.set('rule','numberGreaterThan5');m.execute('format');assert.deepEqual(m.results().marked,[[2,8]]);
 const ids=q.data.rows.map(r=>r.id);m.execute('exclude',[ids[2],ids[5]]);m.execute('exclude',[ids[0]]);assert.deepEqual(m.results().excludedRowIds,[ids[0],ids[2],ids[5]]);
 m.execute('restore',[ids[2]]);assert.deepEqual(m.results().excludedRowIds,[ids[0],ids[5]]);m.execute('restore');assert.equal(m.results().keptRowIds.length,10);assert.equal(m.get().ops.length,1);
 for(let k=0;k<100;k++){m.execute('exclude',[ids[k%10]]);m.execute('restore');m.execute('format');}assert.equal(m.get().ops.length,1);
 assert.equal(q.data.rows.length,10);assert.equal(q.data.rows[5].cells[9],'');
});
test('去重設定改變即失效，錯誤設定顯示其真實結果，每次從初始副本重算',()=>{
 const m=createSheetModel(sheetQuestion(2).data);m.execute('dedupe');assert.equal(m.results().removedRowIds.length,0);
 m.set('columns',['B']);assert.equal(m.operation('dedupe'),null);m.execute('dedupe');assert.equal(m.results().removedRowIds.length,3);
 m.set('columns',[...'BCDEFGHIJ']);m.execute('dedupe');assert.equal(m.results().removedRowIds.length,2);
 m.execute('undoDedupe');assert.equal(m.results().keptRowIds.length,10);m.set('columns',[]);assert.match(m.execute('dedupe'),/至少/);
});
test('篩選與圖表依賴、統計不預填、來源／標題改回也失效、0 圖與四捨五入',t=>{
 dom(t);const q=sheetQuestion(3),m=createSheetModel(q.data);
 assert.deepEqual(m.controls().counts,['','','']);assert.match(m.execute('counts'),/篩選/);
 assert.equal(m.applyTeacherSolution(syntheticSolution(q)),true);
 for(const [key,value] of [['group','遊戲組'],['slot','上午'],['counts',['3','2','2']],['sourceChoice','originalSummary'],['titleChoice',2]]){
  const a=syntheticSolution(q);assert.equal(m.applyTeacherSolution(a),true);const original=m.controls()[key];m.set(key,value);m.set(key,original);assert.equal(m.get().state.chart,null);assert.equal(m.controls().percent,'');assert.equal(m.controls().priorityJob,'');assert.equal(m.controls().priorityReason,'');
 }
 m.set('sourceChoice','originalSummary');assert.match(m.execute('pie'),/沒有提供/);m.execute('clearFilter');assert.equal(m.results().visibleRowIds.length,10);
 m.set('group',q.data.task.group);m.set('slot',q.data.task.slot);m.execute('filter');m.set('counts',['0','0','0']);m.execute('counts');m.set('sourceChoice','filtered');m.set('titleChoice',1);assert.equal(m.execute('pie'),'');assert.equal(percentTenths([0,0,0],1),0);
 assert.equal(percentTenths([1,1,1],0),333);assert.deepEqual(demandGaps([1,2,1],[2,2,0]),[0,0,1]);
 const host=new Element('div'),h=renderQuestion(q,host,{changed(){},demonstration:true});const a=syntheticSolution(q);a.ops[1].values=[0,0,0];a.state.counts=[0,0,0];a.state.chart.counts=[0,0,0];a.state.percentTenths=0;assert.equal(h.applyTeacherSolution(a),true);assert.match(host.textContent,/合計 0 筆/);assert.equal(host.querySelectorAll('canvas').length,0);
});
test('草稿僅接受本組有界控制值與有效操作，不接受跨列 ID、偽造版本／依賴或額外資料',()=>{
 const q=sheetQuestion(3),m=createSheetModel(q.data);m.applyTeacherSolution(syntheticSolution(q));const valid=m.draft();
 const bad=[v=>v.version=3,v=>v.extra=true,v=>v.controls.extra=true,v=>v.ops[0].rev=1.5,v=>v.ops[1].filterRev=999,v=>v.ops[2].countsRev=999,v=>v.ops.push(v.ops[0]),v=>v.ops[0].group='任意公式',v=>v.controls.counts=['NaN','1','2'],v=>v.controls.percent='100.1'];
 for(const mutate of bad){const v=structuredClone(valid);mutate(v);assert.equal(m.restoreDraft(v),false);assert.deepEqual(m.draft(),valid);}
 const clean=createSheetModel(sheetQuestion(1).data);clean.applyTeacherSolution(syntheticSolution(sheetQuestion(1)));const draft=clean.draft();draft.ops[1].rowIds=['foreign-row'];assert.equal(clean.restoreDraft(draft),false);
 assert.throws(()=>createSheetModel({...q.data,taskVersion:'unknown'}),/unsupported/);
});
test('部分輸入、非法數字、未送出的選列可續作，完整性驗證不以舊值送出',t=>{
 dom(t);const q=sheetQuestion(3),host=new Element('div'),h=renderQuestion(q,host,{changed(){},demonstration:true});h.applyTeacherSolution(syntheticSolution(q));
 const number=host.querySelector('input[type="number"]');number.value='1.5';number.oninput();assert.equal(h.ready(),false);assert.equal(h.get().state.chart,null);
 const m=createSheetModel(q.data);m.applyTeacherSolution(syntheticSolution(q));m.set('counts',['','3','2']);const draft={...m.draft(),selectedRowIds:[],inputValues:{count0:'1.5',count1:'3',count2:'2',percent:''}};
 const target=new Element('div'),other=renderQuestion(q,target,{changed(){}});assert.equal(other.restoreDraft(draft),true);assert.equal(other.ready(),false);assert.equal(target.querySelector('input[type="number"]').value,'1.5');
 assert.ok(other.fields().length);const snapshot=other.draft();snapshot.datasetToken='B'.repeat(22);assert.equal(other.restoreDraft(snapshot),false);
 const mismatched=other.draft();mismatched.inputValues.count0='4';assert.equal(other.restoreDraft(mismatched),false);
 const findBox=host=>host.querySelectorAll('input').find(el=>el.getAttribute('aria-label')==='選取原第 2 列');
 const p=new Element('div'),clean=renderQuestion(sheetQuestion(1),p,{changed(){}}),box=findBox(p);box.checked=true;box.onchange();const target2=new Element('div'),clean2=renderQuestion(sheetQuestion(1),target2,{changed(){}});assert.equal(clean2.restoreDraft(clean.draft()),true);assert.equal(findBox(target2).checked,true);
});
test('教師專用套入整個狀態，不印出巢狀物件，不送成績',t=>{
 dom(t);const host=new Element('div'),q=sheetQuestion(3);const h=mountTeacherQuestion({host,value:{question:q,solution:{answer:syntheticSolution(q),notes:['合成教學說明']}},renderQuestion,onNew(){}});
 assert.doesNotMatch(host.textContent,/\[object Object\]/);host.querySelector('#tb-fill').click();assert.equal(host.querySelectorAll('canvas').length,1);assert.match(host.textContent,/合成教學說明/);h.dispose();assert.equal(host.childNodes.length,0);
});
test('Worker 32 個候選：授權解答經前端套入／草稿往返，提交格式可重播判分',{skip:!process.env.YBS_WORKER_SOURCE},async()=>{
 const [{default:banks},worker]=await Promise.all([load('src/formal/banks/u206-sheet-v2.mjs'),load('src/formal/volunteer-sheet-sim.mjs')]);let total=0;
 for(const bundle of Object.values(banks))for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){
  const q=worker.configureSheet({data:c.facts}),d=worker.projectSheet(q.data),m=createSheetModel(d),a=worker.sheetSolution(q.data);
  assert.equal(m.applyTeacherSolution(a),true);assert.deepEqual(m.get(),a);assert.equal(worker.replaySheet(q.data,m.get()).correct,true);
  const restored=createSheetModel(d);assert.equal(restored.restoreDraft(m.draft()),true);assert.deepEqual(worker.replaySheet(q.data,restored.get()),{correct:true});assert.ok(Buffer.byteLength(JSON.stringify(m.get()))<=6144);total++;
 }assert.equal(total,32);console.log('u206 Worker contract round trips:',total);
});
test('release allowlist 含公開模組與樣式，掃描新版私有答案、版本、generator 與排列索引',{skip:!process.env.YBS_WORKER_SOURCE},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'u206-front-release-')),output=join(dir,'site'),workerSource=process.env.YBS_WORKER_SOURCE;
 const built=await buildSite({output,config:{...config,answerTickets:true,courses:['115-g9'],readModelModule:'/assets/fullrev-read-model.mjs'},workerSource});
 assert.equal(built.scan.hits,0);assert.ok(releasePaths().includes('assets/fullrev-volunteer-sheet.mjs'));assert.ok(releasePaths().includes('assets/fullrev-volunteer-sheet.css'));
 const file=join(output,'assets/fullrev-volunteer-sheet.mjs'),original=await readFile(file,'utf8'),{default:banks}=await load('src/formal/banks/u206-sheet-v2.mjs'),[key,bundle]=Object.entries(banks)[0],a=Object.values(bundle.rounds)[0].cases[0].answer;
 for(const leak of [JSON.stringify(a),JSON.stringify(key),'function deriveSheet(){}','const flowOrder=[0,1,2];','const titleOrder=[0,1,2];','import x from "./volunteer-sheet-generator.mjs";']){
  await writeFile(file,original+'\nconst leak='+leak+';');await assert.rejects(scanRelease({output,workerSource}),/private_answer_object|private_version|forbidden_content/);
 }await writeFile(file,original);assert.deepEqual(await scanRelease({output,workerSource}),built.scan);console.log('u206 release scan:',JSON.stringify(built.scan));
});

test('D12：錯標題與錯篩選均不製圖，清除舊圖及分析並拒收舊的錯標題草稿',t=>{
 dom(t);const q=sheetQuestion(3),m=createSheetModel(q.data),answer=syntheticSolution(q);
 for(const titleChoice of [0,2]){
  assert.equal(m.applyTeacherSolution(answer),true);m.set('titleChoice',titleChoice);
  m.set('percent','20.0');m.set('priorityJob',0);m.set('priorityReason','demandGap');
  assert.match(m.execute('pie'),/標題須符合/);assert.equal(m.get().state.chart,null);assert.equal(m.operation('pie'),null);
  assert.equal(m.controls().percent,'');assert.equal(m.controls().priorityJob,'');assert.equal(m.controls().priorityReason,'');
 }
 // 標題符合目前篩選，卻不符合任務，仍須阻擋。
 m.set('group','遊戲組');m.set('slot','下午');m.execute('filter');m.set('counts',['1','2','3']);m.execute('counts');m.set('titleChoice',0);
 assert.match(m.execute('pie'),/標題須符合/);assert.equal(m.get().state.chart,null);
 // 標題符合任務，卻不符合實際套用的篩選，也須阻擋。
 m.set('titleChoice',1);assert.match(m.execute('pie'),/標題須符合/);assert.equal(m.get().state.chart,null);
 const old=createSheetModel(q.data);old.applyTeacherSolution(answer);const draft=old.draft();draft.controls.titleChoice=0;draft.ops[2].titleChoice=0;
 assert.equal(m.restoreDraft(draft),false);
 // 實際 UI 先有圖，改錯標題後圖與分析欄位清空，按製圖仍不畫圖。
 const host=new Element('div'),h=renderQuestion(q,host,{changed(){},shell:true,demonstration:true});h.applyTeacherSolution(answer);
 assert.equal(host.querySelectorAll('canvas').length,1);
 const field=host.querySelectorAll('select').find(e=>e.id.endsWith('titleChoice'));field.value='0';field.oninput();
 host.querySelector('[data-sheet-action="pie"]').click();assert.equal(host.querySelectorAll('canvas').length,0);assert.match(host.querySelector('.sheet-status').textContent,/標題須符合/);
 assert.equal(h.get().state.percentTenths,null);assert.equal(h.get().state.priorityJob,'');assert.equal(h.get().state.priorityReason,'');
 field.value='1';field.oninput();host.querySelector('[data-sheet-action="pie"]').click();assert.equal(host.querySelectorAll('canvas').length,1);
});
