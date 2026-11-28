import test from 'node:test';
import assert from 'node:assert/strict';
import {lstatSync,mkdirSync,mkdtempSync,readFileSync,renameSync,writeFileSync,writeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {acceptance,gatePlan,runGate,sourceVersion,verifyEvidence,workerPaths} from '../tools/release-offline-gate.mjs';

const frontCommit='a'.repeat(40),workerCommit='b'.repeat(40);
const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
function fixture(){
  const dir=mkdtempSync('/tmp/ybs-offline-unit-'),front=join(dir,'front'),worker=join(dir,'worker');
  const put=(base,path,value='synthetic')=>{const file=join(base,path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,value);};
  for(const p of ['assets','115-g9','115-df','map','about','tests','tools','scripts'])put(front,p+'/fixture.mjs');
  for(const p of ['index.html','404.html'])put(front,p);
  for(const p of ['fullrev-answer-scan.test.mjs','fullrev-release.test.mjs','fullrev-csp.browser.test.mjs','fullrev-df-teacher.browser.test.mjs'])put(front,'tests/'+p);
  for(const p of workerPaths)put(worker,p==='package.json'?p:p+'/fixture.mjs');
  put(worker,'tests/formal-answer-ticket.test.mjs');
  const options={front,worker,frontCommit,workerCommit,out:join(dir,'gate')};
  let calls=0;
  const runner=(command,args,opts)=>{
    calls++;
    assert.equal(opts.env.CI,'');assert.equal(opts.env.YBS_WORKER_SOURCE,worker);
    assert.equal(opts.env.NODE_OPTIONS,undefined);assert.equal(opts.env.YBS_TEACHER_CODE,'');
    if(!opts.stdio)return {status:0,stdout:'',stderr:''};
    writeSync(opts.stdio[1],args.includes('python3')?'OK   synthetic mock\nSKIP teacher unlock（沒有設定 YBS_TEACHER_CODE）\n':tap);
    return {status:0};
  };
  const verify=evidence=>verifyEvidence({...options,evidence});
  // Fixtures contain only synthetic code and logs; leave them in /tmp for review.
  return {dir,put,options,runner,verify,calls:()=>calls};
}
test('single entry runs every required stage and verifies version-bound evidence',()=>{
  const f=fixture(),evidence=runGate(f.options,f.runner),record=f.verify(evidence);
  assert.equal(record.status,'passed');assert.equal(f.calls(),6);
  const plan=gatePlan(f.options.front,f.options.worker);
  assert.equal(plan[0].command,'bash');assert.ok(plan[0].args.some(s=>s.endsWith('cutover/test.sh')));
  for(const p of plan.slice(1,4))assert.ok(p.args.includes('--test-reporter=tap'));
  assert.throws(()=>runGate(f.options,f.runner),/EEXIST/);
});
test('frontend mounts only fresh screenshots writable, keeps sources and evidence read-only and fixes the shot environment',()=>{
  const f=fixture(),shots=join(f.options.out,'shots'),calls=[];
  const previous=process.env.YBS_TEST_SHOT_DIR;
  process.env.YBS_TEST_SHOT_DIR=join(f.options.front,'assets');
  try{
    const evidence=runGate(f.options,(command,args,opts)=>{
      calls.push({command,args,env:opts.env});
      return f.runner(command,args,opts);
    });
    assert.equal(f.verify(evidence).status,'passed');
  }finally{
    if(previous===undefined)delete process.env.YBS_TEST_SHOT_DIR;
    else process.env.YBS_TEST_SHOT_DIR=previous;
  }
  const stat=lstatSync(shots);
  assert.equal(stat.isDirectory(),true);assert.equal(stat.isSymbolicLink(),false);
  assert.equal(stat.mode&0o777,0o700);
  assert.deepEqual(calls[0].args,['--unshare-net','--ro-bind','/','/','--','/bin/true']);
  const plan=gatePlan(f.options.front,f.options.worker);
  for(const [i,step] of plan.entries()){
    const call=calls[i+1],frontend=step.id==='front-tests';
    assert.equal(call.env.YBS_TEST_SHOT_DIR,frontend?shots:undefined);
    assert.equal(call.env.YBS_SOURCE,f.options.front);assert.equal(call.env.YBS_TEST_REQUIRE_ALL,'1');
    if(i===0){assert.equal(call.command,step.command);assert.deepEqual(call.args,step.args);continue;}
    assert.equal(call.command,'bwrap');
    assert.deepEqual(call.args,['--unshare-net','--ro-bind','/','/','--tmpfs','/tmp',
      '--ro-bind',f.options.front,f.options.front,'--ro-bind',f.options.worker,f.options.worker,
      '--dev','/dev','--proc','/proc',...(frontend?['--bind',shots,shots]:[]),
      '--chdir',step.cwd,'--',step.command,...step.args]);
  }
});
test('screenshot mount failure stops without fallback and leaves evidence that verification rejects',()=>{
  for(const exitCode of [1,null]){
    const f=fixture(),calls=[];
    assert.throws(()=>runGate(f.options,(command,args,opts)=>{
      calls.push(command);
      if(opts.env.YBS_TEST_SHOT_DIR){
        assert.equal(command,'bwrap');assert.ok(args.includes('--bind'));
        writeSync(opts.stdio[1],'synthetic screenshot mount denied\n');
        return {status:exitCode,error:exitCode===null?new Error('synthetic spawn failure'):undefined};
      }
      return f.runner(command,args,opts);
    }),/gate_command_failed:front-tests/);
    assert.deepEqual(calls,['bwrap','bash','bwrap']);
    const evidence=join(f.options.out,'evidence.json'),record=JSON.parse(readFileSync(evidence));
    assert.equal(record.status,'failed');assert.equal(record.error,'gate_command_failed:front-tests');
    assert.deepEqual(record.steps.map(s=>[s.id,s.exitCode]),[['worker-tests',0],['front-tests',exitCode]]);
    assert.throws(()=>f.verify(evidence),/gate_evidence_not_passed/);
  }
});
test('missing evidence, failed or skipped tests never satisfy the publisher',()=>{
  const f=fixture();assert.throws(()=>f.verify(join(f.dir,'missing.json')),/ENOENT/);
  for(const log of ['',tap.replace('# skipped 0','# skipped 1'),tap.replace('# pass 2','# pass 1'),tap.replace('# fail 0','# fail 1'),tap.replace('# todo 0','# todo 1')]){
    assert.throws(()=>acceptance('front-tests',log),/gate_missing_test_summary|gate_tests_incomplete/);
  }
  assert.throws(()=>acceptance('mock-pages','OK   one\nSKIP another necessary check\n'),/gate_pages_incomplete/);
  assert.throws(()=>acceptance('mock-pages','OK   one\n'),/gate_pages_incomplete/);
  assert.throws(()=>acceptance('mock-pages','OK   one\nSKIP teacher unlock（沒有設定 YBS_TEACHER_CODE） plus required check\n'),/gate_pages_incomplete/);
  for(const directive of ['ok 1 - required # SKIP','ok 1 - required # TODO','not ok 1 - required','Bail out!']){
    assert.throws(()=>acceptance('front-tests',directive+'\n'+tap),/gate_tests_incomplete/);
  }
});
test('commit, frontend, Worker, test and gate source changes invalidate acceptance',()=>{
  for(const [kind,path] of [['front','assets/fixture.mjs'],['front','tests/fullrev-release.test.mjs'],['front','tools/fixture.mjs'],['worker','src/fixture.mjs'],['worker','cutover/fixture.mjs']]){
    const f=fixture(),evidence=runGate(f.options,f.runner);
    assert.throws(()=>verifyEvidence({...f.options,evidence,workerCommit:'c'.repeat(40)}),/gate_commit_mismatch/);
    f.put(f.options[kind],path,'changed');assert.throws(()=>f.verify(evidence),/gate_source_version_mismatch/);
  }
});
test('missing stages, incomplete status and changed logs are rejected',()=>{
  for(const change of ['log','isolation','stage','status','summary']){
    const f=fixture(),evidence=runGate(f.options,f.runner),record=JSON.parse(readFileSync(evidence));
    if(change==='log')writeFileSync(join(f.options.out,'front-tests.log'),tap+'modified');
    if(change==='isolation')writeFileSync(join(f.options.out,'isolation.log'),'modified');
    if(change==='stage')record.steps.pop();
    if(change==='status')record.status='failed';
    if(change==='summary')record.steps[0].result.skipped=1;
    writeFileSync(evidence,JSON.stringify(record));
    assert.throws(()=>f.verify(evidence),/gate_log_mismatch|gate_isolation_log_mismatch|gate_missing_required_step|gate_evidence_not_passed|gate_result_mismatch/);
  }
});
test('every missing raw log and hash-consistent skipped, failed or cancelled results are rejected',()=>{
  const sample=fixture(),ids=gatePlan(sample.options.front,sample.options.worker).map(s=>s.id);
  for(const id of ['isolation',...ids]){
    const f=fixture(),evidence=runGate(f.options,f.runner);
    renameSync(join(f.options.out,id+'.log'),join(f.options.out,id+'.saved-log'));
    assert.throws(()=>f.verify(evidence),/ENOENT/);
  }
  for(const kind of ['skipped','fail','cancelled']){
    const f=fixture(),evidence=runGate(f.options,f.runner),record=JSON.parse(readFileSync(evidence));
    const log=tap.replace(`# ${kind} 0`,`# ${kind} 1`).replace('# pass 2','# pass 1');
    writeFileSync(join(f.options.out,'front-tests.log'),log);
    record.steps[1].sha256=createHash('sha256').update(log).digest('hex');
    record.steps[1].result={tests:2,pass:1,fail:0,cancelled:0,skipped:0,todo:0,[kind]:1};
    writeFileSync(evidence,JSON.stringify(record));
    assert.throws(()=>f.verify(evidence),/gate_tests_incomplete/);
  }
});
test('runner errors, skips, isolation failure and source drift leave failed evidence',()=>{
  for(const fault of ['exit','skip','isolation','drift']){
    const f=fixture();let stage=0;
    assert.throws(()=>runGate(f.options,(command,args,opts)=>{
      if(!opts.stdio)return fault==='isolation'?{status:1,stderr:'synthetic isolation denied'}:f.runner(command,args,opts);
      stage++;
      if(fault==='exit')return {status:1};
      if(fault==='skip'){writeSync(opts.stdio[1],tap.replace('# skipped 0','# skipped 1'));return {status:0};}
      if(fault==='drift'&&stage===5)f.put(f.options.front,'assets/fixture.mjs','drift');
      return f.runner(command,args,opts);
    }),/gate_command_failed|gate_tests_incomplete|gate_network_isolation_unavailable|gate_sources_changed/);
    const evidence=join(f.options.out,'evidence.json');assert.equal(JSON.parse(readFileSync(evidence)).status,'failed');
    assert.throws(()=>f.verify(evidence),/gate_evidence_not_passed/);
  }
});
test('fingerprints ignore Git and credential locations; missing required sources fail',()=>{
  const f=fixture(),before=sourceVersion(f.options.front,'front');
  f.put(f.options.front,'assets/auth.json','must not read');
  f.put(f.options.front,'assets/.env','must not read');
  assert.equal(sourceVersion(f.options.front,'front'),before);
  assert.throws(()=>sourceVersion(f.dir,'worker'),/ENOENT/);
});
