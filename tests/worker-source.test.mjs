import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,openSync,closeSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const root=new URL('../',import.meta.url);
function run(file,extra={}){
  const env={...process.env};delete env.CI;delete env.YBS_WORKER_SOURCE;delete env.NODE_TEST_CONTEXT;
  const dir=mkdtempSync(join(tmpdir(),'ybs-worker-check-'));
  const out=join(dir,'stdout'),err=join(dir,'stderr');
  const stdout=openSync(out,'w'),stderr=openSync(err,'w');
  try{
    const result=spawnSync(process.execPath,['--test','--test-isolation=none','--test-reporter=tap',file],{cwd:root,env:{...env,...extra},stdio:['ignore',stdout,stderr]});
    return {...result,stdout:readFileSync(out,'utf8'),stderr:readFileSync(err,'utf8')};
  }finally{closeSync(stdout);closeSync(stderr);rmSync(dir,{recursive:true,force:true});}
}
test('batch／legacy 缺 Worker：本機明示 skip 原因，CI 直接失敗',()=>{
  for(const file of ['tests/fullrev-batch2.test.mjs','tests/fullrev-legacy-progress.test.mjs']){
    const local=run(file);
    assert.equal(local.status,0,local.stdout+local.stderr);
    assert.match(local.stdout,/# SKIP 缺少 ClassScore Worker/);
    const ci=run(file,{CI:'true'});
    assert.notEqual(ci.status,0);
    assert.match(ci.stdout+ci.stderr,/CI 不允許跳過核心測試/);
    assert.doesNotMatch(ci.stdout,/# SKIP/);
  }
});
test('四項必要驗收缺 Worker：本機與 CI 均失敗，不得略過',async t=>{
  for(const [file,reason] of [
    ['tests/fullrev-answer-scan.test.mjs','本機答案掃描驗收需設定 YBS_WORKER_SOURCE'],
    ['tests/fullrev-release.test.mjs','本機發布驗收需設定 YBS_WORKER_SOURCE'],
    ['tests/fullrev-csp.browser.test.mjs','本機 CSP 驗收需設定 YBS_WORKER_SOURCE'],
    ['tests/fullrev-df-teacher.browser.test.mjs','本機 DF 教師驗收需設定 YBS_WORKER_SOURCE']
  ])for(const ci of [false,true])await t.test(`${file} (${ci?'CI':'local'})`,()=>{
    const result=run(file,ci?{CI:'true'}:{});
    assert.equal(result.status,1,result.stdout+result.stderr);
    assert.match(result.stdout+result.stderr,new RegExp(ci?'CI 不允許跳過核心測試':reason));
    assert.doesNotMatch(result.stdout,/# SKIP/);
  });
});
test('設定了空目錄也不能讓 CI 或本機跳過 Worker 驗收',t=>{
  const dir=mkdtempSync(join(tmpdir(),'ybs-worker-source-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  for(const extra of [{},{CI:'true'}]){
    const result=run('tests/fullrev-batch2.test.mjs',{...extra,YBS_WORKER_SOURCE:dir});
    assert.notEqual(result.status,0);
    assert.match(result.stdout+result.stderr,/YBS_WORKER_SOURCE 無效或不完整/);
    assert.doesNotMatch(result.stdout,/# SKIP/);
  }
});
