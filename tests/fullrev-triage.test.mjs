import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {teacherSnapshots} from '../assets/fullrev-ui.mjs';
import {exportRows} from '../assets/fullrev-progress.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
import {harness,activities,config,snapshot,record} from './fixtures/fullrev.mjs';

const missing=()=>Object.assign(Error('class-not-found'),{code:'class-not-found'});
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',context);
const options={project:config.firebase.projectId,course:'115-g9',activities};

test('c901 完整 gate 不改查分組；實際 client 匯出重讀後由 80 降為 45 XP',async()=>{
 const h=await harness();await h.client.login('owner');
 const reads=[];h.model.page=async input=>{reads.push(input.classKey);return {...h.state.snapshot};};
 let values=await teacherSnapshots(h.client,'c901',activities);
 assert.equal(values.length,1);assert.equal(exportRows(values[0],options,context.xp).at(-1)[6],80);
 const controlVersions={gateVersion:1,classGateVersion:2};
 h.state.snapshot=snapshot([0,1,2].map(i=>record(i,{validity:{state:'effective',controlVersions}})),{controlVersions});
 values=await teacherSnapshots(h.client,'c901',activities);
 const rows=exportRows(values[0],options,context.xp);
 assert.equal(rows.at(-1)[6],45);assert.equal(rows[4][4],'尚未過關');
 assert.deepEqual(reads,['c901','c901']);
});

test('c901 教師讀取兩 gate，保留各自控制版本；明確分組及 DF 不擴展',async()=>{
 const calls=[],client={course:'115-g9',progress:async input=>{calls.push(input);if(input.classKey==='c901'&&client.course==='115-g9')throw missing();return {classKey:input.classKey,controlVersions:{classGateVersion:calls.length-1}};}};
 const values=await teacherSnapshots(client,'c901',[]);
 assert.deepEqual(calls.map(c=>c.classKey),['c901','c901_1','c901_2']);
 assert.deepEqual(values.map(v=>v.controlVersions.classGateVersion),[1,2]);
 calls.length=0;await teacherSnapshots(client,'c901_2',[]);assert.equal(calls.length,1);
 calls.length=0;client.course='115-df';await teacherSnapshots(client,'c901',[]);assert.equal(calls[0].classKey,'c901');
});
test('實際 read model 與 client 經明確 404 合併兩組，分別重讀控制版本與取消後 XP',async()=>{
 const h=await harness(),gates=Object.fromEntries(['c901_1','c901_2'].map((classKey,i)=>{
  const subject='synthetic-group-'+i,controlVersions={gateVersion:1,classGateVersion:i+1};
  return [classKey,snapshot([0,1,2,3].map(round=>record(round,{subject,classKeyAtPass:classKey,
   validity:{state:'effective',controlVersions}})),{classKey,controlVersions,people:[{subject,cls:901,seat:i*30+1,provider:'password'}]})];
 }));
 const model=createReadModel({session:async()=>h.session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,
  fetcher:async(url,init)=>{
   const {classKey}=JSON.parse(init.body);
   if(classKey==='c901')return Response.json({error:'class_not_found'},{status:404});
   return Response.json(String(url).endsWith('/controls')?gates[classKey].controlVersions:gates[classKey]);
  }});
 const client=h.reopen({readModel:model});await client.login('owner');
 let values=await teacherSnapshots(client,'c901',activities);
 assert.deepEqual(values.map(v=>exportRows(v,options,context.xp).at(-1)[6]),[80,80]);
 const gate=gates.c901_2,controlVersions={gateVersion:1,classGateVersion:3};gate.controlVersions=controlVersions;
 gate.records=gate.records.filter(r=>r.round!==3).map(r=>({...r,validity:{state:'effective',controlVersions}}));
 values=await teacherSnapshots(client,'c901',activities);
 assert.deepEqual(values.map(v=>v.controlVersions.classGateVersion),[1,3]);
 assert.deepEqual(values.map(v=>exportRows(v,options,context.xp).at(-1)[6]),[80,45]);
 gates.c901_2={...gate,classKey:'c902_2'};
 await assert.rejects(teacherSnapshots(client,'c901',activities),{code:'page-unconfirmed'});
});
test('其中一組讀取失敗不得匯出半班',async()=>{
 const client={course:'115-g9',progress:async({classKey})=>{if(classKey==='c901')throw missing();if(classKey.endsWith('_2'))throw Error('offline');return {};}};
 await assert.rejects(teacherSnapshots(client,'c901',[]),/offline/);
});
test('原 gate 回應班級不符、控制資料未知或連線失敗均不得改查分組',async()=>{
 const h=await harness();await h.client.login('owner');
 const calls=[];h.model.page=async input=>{calls.push(input.classKey);return snapshot([],{classKey:'c902'});};
 await assert.rejects(teacherSnapshots(h.client,'c901',activities),{code:'page-unconfirmed'});
 assert.deepEqual(calls,['c901']);
 for(const code of ['control-unconfirmed','control-changed','read-model-pending','summary-unconfirmed','storage-quota','owner-required']){
  const keys=[],client={course:'115-g9',progress:async({classKey})=>{keys.push(classKey);throw Object.assign(Error(code),{code});}};
  await assert.rejects(teacherSnapshots(client,'c901',[]),{code});assert.deepEqual(keys,['c901']);
 }
});
test('新站工作指引維持獨立專案與名冊教師確認',()=>{
 const text=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
 assert.match(text,/獨立 Firebase 專案 `ybs-lab`/);assert.match(text,/差異核對＋教師確認/);
 assert.doesNotMatch(text,/兩站共用 Firebase|YBS 共用這份 Rules/);
});
