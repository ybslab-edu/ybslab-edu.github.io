import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {teacherOverview,teacherTarget,teacherGrowthURL} from '../assets/fullrev-teacher-page.mjs';
import {teacherSnapshots} from '../assets/fullrev-ui.mjs';
import {snapshot,record,activities,config} from './fixtures/fullrev.mjs';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../assets/xp.js',import.meta.url),'utf8')+';globalThis.xp=YBSXP;',context);
const options={project:config.firebase.projectId,course:'115-g9',activities};
test('老師摘要沿用有效集合、全過加成，重置後降為 45 XP，匯出仍為逐關格式',()=>{
 const first=teacherOverview([snapshot()],options,context.xp);
 assert.equal(first.people[0].result.activities[0].totalXP,80);assert.equal(first.rows.length,6);
 const next=teacherOverview([snapshot([0,1,2].map(i=>record(i)))],options,context.xp);
 assert.equal(next.people[0].result.activities[0].passed,3);assert.equal(next.people[0].result.totalXP,45);assert.equal(next.rows[4][4],'尚未過關');
 assert.throws(()=>teacherOverview([snapshot([],{state:'unknown'})],options,context.xp),{code:'export-unconfirmed'});
});
test('分組失敗保留實際組別與錯誤碼，不回傳半班',async()=>{
 for(const bad of ['c901_1','c901_2']){
 const calls=[],client={course:'115-g9',progress:async({classKey})=>{calls.push(classKey);if(classKey==='c901')throw Object.assign(Error('missing'),{code:'class-not-found'});if(classKey===bad)throw Object.assign(Error('offline'),{code:'request-timeout'});return snapshot();}};
 await assert.rejects(teacherSnapshots(client,'c901',activities),{classKey:bad,code:'request-timeout',message:'offline'});
 assert.ok(calls.includes(bad));
 await assert.rejects(teacherSnapshots(client,bad,activities),{classKey:bad,code:'request-timeout'});
 }
});
test('訪客 XP 維持待確認，舊紀錄標示未驗證；不把 XP 當技能分數',()=>{
 const guest=record(0,{source:'worker-guest-approved',approvalId:'synthetic-approval'});
 const data=teacherOverview([snapshot([guest])],options,context.xp);
 assert.equal(data.people[0].result.totalXP,null);assert.equal(data.people[0].result.activities[0].rounds[0].teacherPending,true);
 const legacy=record(0,{source:'legacy-unverified',resultId:'l_'+'b'.repeat(64),displayPolicy:'migration-initial-epochs-v1',completedAt:null});
 const old=teacherOverview([snapshot([legacy])],options,context.xp);
 assert.equal(old.rows[1][4],'舊紀錄過關（未驗證）');assert.equal(old.people[0].result.totalXP,10);
});
test('唯讀成長連結保留精確主體與分組，拒絕不合法目標',()=>{
 const person={classKey:'c901_2',subject:'synthetic-group-2',cls:901,seat:31};
 const value=teacherTarget(new URL(teacherGrowthURL(person),'http://127.0.0.1').search);
 assert.deepEqual(value,{...person,cls:'901',seat:'31'});
 assert.equal(teacherTarget('?cls=901&seat=1'),null);
 assert.throws(()=>teacherTarget('?subject=x&classKey=c901&cls=901&seat=61'));
});
