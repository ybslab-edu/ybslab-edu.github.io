// Local release acceptance only. No Git, downloads, credentials or deployment.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {closeSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const schema='ybs-release-offline-v1';
const frontPaths=['assets','115-g9','115-df','map','about','tests','tools','scripts','index.html','404.html'];
// Code only: never walk the Worker repo, env files, cutover state or credentials.
export const workerPaths=['src','tests','scripts','cutover','package.json'];
const ids=['worker-tests','front-tests','df-report','df-teacher-cloud','mock-pages'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error(message);};
function regular(path){
  if(!lstatSync(path).isFile())fail('gate_nonregular_file');
  return readFileSync(path);
}
export function sourceVersion(directory,kind){
  const files=[];
  function walk(path){
    const stat=lstatSync(path);
    if(stat.isSymbolicLink())fail('gate_source_symlink');
    if(stat.isDirectory()){
      for(const name of readdirSync(path).sort()){
        if(name.startsWith('.')||name==='node_modules'||name==='auth.json')continue;
        walk(join(path,name));
      }
    }else if(stat.isFile()){
      const name=relative(directory,path).split(sep).join('/');
      files.push([name,sha(regular(path))]);
    }else fail('gate_source_nonregular');
  }
  for(const path of kind==='front'?frontPaths:workerPaths)walk(join(directory,path));
  files.sort(([a],[b])=>a<b?-1:a>b?1:0);
  return sha(JSON.stringify(files));
}
function commits(frontCommit,workerCommit){
  if(![frontCommit,workerCommit].every(s=>/^[a-f0-9]{40}$/.test(s||'')))fail('gate_requires_SHA40');
}
export function acceptance(id,log){
  if(id==='mock-pages'){
    // Legacy teacher unlock needs a teacher secret; it is explicitly outside this mock gate.
    const optional='SKIP teacher unlock（沒有設定 YBS_TEACHER_CODE）';
    const lines=log.split(/\r?\n/),optionalCount=lines.filter(line=>line===optional).length;
    const checked=lines.filter(line=>line!==optional).join('\n');
    const passed=lines.filter(line=>/^OK\s/.test(line)).length;
    if(!passed||optionalCount!==1||/^FAIL\b|\bSKIP\b|Traceback/m.test(checked))fail('gate_pages_incomplete');
    return {tests:passed,pass:passed,fail:0,skipped:0,optionalNotRun:1,legacyTeacherUnlock:'not-run-no-secret'};
  }
  const count=key=>{
    const matches=[...log.matchAll(new RegExp(`^# ${key} (\\d+)\\s*$`,'gm'))];
    if(matches.length!==1)fail('gate_missing_test_summary:'+id);
    return Number(matches[0][1]);
  };
  const result=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(key=>[key,count(key)]));
  if(!Object.values(result).every(Number.isSafeInteger)||result.tests<1||result.pass!==result.tests
    ||['fail','cancelled','skipped','todo'].some(k=>result[k]!==0)
    ||/^\s*(?:not ok\b|Bail out!)|^\s*(?:ok|not ok)\b[^\n]*#\s*(?:SKIP|TODO)\b/im.test(log))fail('gate_tests_incomplete:'+id);
  return result;
}
function versions(front,worker){return {front:sourceVersion(front,'front'),worker:sourceVersion(worker,'worker')};}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function verifyEvidence({front=root,worker,frontCommit,workerCommit,evidence}){
  commits(frontCommit,workerCommit);
  const record=JSON.parse(regular(evidence));
  if(record.schema!==schema||record.status!=='passed')fail('gate_evidence_not_passed');
  if(record.frontCommit!==frontCommit||record.workerCommit!==workerCommit)fail('gate_commit_mismatch');
  if(!same(record.sources,versions(front,worker)))fail('gate_source_version_mismatch');
  const isolation=regular(join(dirname(evidence),'isolation.log'));
  if(record.isolation?.exitCode!==0||record.isolation.sha256!==sha(isolation))fail('gate_isolation_log_mismatch');
  if(!Array.isArray(record.steps)||!same(record.steps.map(s=>s.id),ids))fail('gate_missing_required_step');
  for(const step of record.steps){
    const log=regular(join(dirname(evidence),step.id+'.log'));
    if(step.exitCode!==0||sha(log)!==step.sha256)fail('gate_log_mismatch:'+step.id);
    if(!same(step.result,acceptance(step.id,log.toString('utf8'))))fail('gate_result_mismatch:'+step.id);
  }
  return record;
}
const pagesCode=`import os, subprocess, sys, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
with ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=os.getcwd())) as server:
    threading.Thread(target=server.serve_forever, daemon=True).start()
    env=dict(os.environ, YBS_BASE=f'http://127.0.0.1:{server.server_port}/')
    try: code=subprocess.run([sys.executable, 'tools/dev/check-pages.py'], env=env).returncode
    finally: server.shutdown()
sys.exit(code)
`;
export function gatePlan(front,worker){
  const suites=directory=>readdirSync(join(directory,'tests')).filter(s=>s.endsWith('.test.mjs')).sort().map(s=>'tests/'+s);
  const frontSuites=suites(front),workerSuites=suites(worker);
  for(const file of ['fullrev-answer-scan.test.mjs','fullrev-release.test.mjs','fullrev-csp.browser.test.mjs','fullrev-df-teacher.browser.test.mjs']){
    if(!frontSuites.includes('tests/'+file))fail('gate_missing_mandatory_suite');
  }
  if(!workerSuites.length)fail('gate_missing_worker_suites');
  return [
    {id:ids[0],cwd:front,command:'bash',args:[join(worker,'cutover/test.sh'),...workerSuites]},
    {id:ids[1],cwd:front,command:process.execPath,args:['--test','--test-concurrency=1','--test-reporter=tap',...frontSuites]},
    {id:ids[2],cwd:front,command:process.execPath,args:['--test','--test-reporter=tap','tests/df-report.test.cjs']},
    {id:ids[3],cwd:front,command:process.execPath,args:['--test','--test-reporter=tap','tests/df-teacher-cloud.test.cjs']},
    {id:ids[4],cwd:front,command:'python3',args:['-c',pagesCode]}
  ];
}
function cleanEnv(front,worker){
  const env={CI:'',YBS_WORKER_SOURCE:worker,YBS_SOURCE:front,YBS_TEST_REQUIRE_ALL:'1',YBS_TEACHER_CODE:''};
  for(const key of ['PATH','HOME','LANG','LC_ALL','TZ','JAVA_HOME','PLAYWRIGHT_MODULE','PLAYWRIGHT_BROWSERS_PATH','NODE_PATH','YBS_NODE','YBS_JAVA','YBS_FIRESTORE_JAR','YBS_TEST_NODE_MODULES']){
    if(process.env[key]!==undefined)env[key]=process.env[key];
  }
  return env;
}
// Exported runner injection is for synthetic unit tests; the CLI has no alternate test command.
export function runGate({front=root,worker,frontCommit,workerCommit,out},runner=spawnSync){
  commits(frontCommit,workerCommit);
  front=resolve(front);worker=resolve(worker);out=resolve(out);
  if([front,worker].some(p=>out===p||out.startsWith(p+sep)))fail('gate_output_must_be_outside_source');
  const plan=gatePlan(front,worker),sources=versions(front,worker),env=cleanEnv(front,worker);
  mkdirSync(out,{mode:0o700}); // Refuse reuse: a failed rerun cannot leave an old PASS.
  const evidence=join(out,'evidence.json');
  const record={schema,status:'failed',frontCommit,workerCommit,sources,steps:[]};
  const save=()=>writeFileSync(evidence,JSON.stringify(record,null,2)+'\n',{mode:0o600});
  save();
  try{
    const shots=join(out,'shots');
    mkdirSync(shots,{mode:0o700});
    // Check isolation before starting any suite. Never silently fall back to online execution.
    const probe=runner('bwrap',['--unshare-net','--ro-bind','/','/','--','/bin/true'],{env,encoding:'utf8'});
    const isolationLog=(probe.stdout||'')+(probe.stderr||'')+(probe.error?.message||'');
    writeFileSync(join(out,'isolation.log'),isolationLog,{mode:0o600});
    record.isolation={exitCode:probe.status,sha256:sha(isolationLog)};save();
    if(probe.status!==0)fail('gate_network_isolation_unavailable');
    for(const step of plan){
      const logPath=join(out,step.id+'.log'),fd=openSync(logPath,'wx',0o600);
      let result;
      try{
        // The Worker wrapper already isolates and locks its emulator run.
        const frontStage=step.id==='front-tests';
        const command=step.id==='worker-tests'?step.command:'bwrap';
        const args=step.id==='worker-tests'?step.args:['--unshare-net','--ro-bind','/','/','--tmpfs','/tmp','--ro-bind',front,front,'--ro-bind',worker,worker,'--dev','/dev','--proc','/proc',...(frontStage?['--bind',shots,shots]:[]),'--chdir',step.cwd,'--',step.command,...step.args];
        result=runner(command,args,{cwd:step.cwd,env:frontStage?{...env,YBS_TEST_SHOT_DIR:shots}:env,stdio:['ignore',fd,fd]});
      }finally{closeSync(fd);}
      const log=regular(logPath);
      const entry={id:step.id,exitCode:result.status,sha256:sha(log)};
      record.steps.push(entry);save();
      if(result.status!==0)fail('gate_command_failed:'+step.id);
      entry.result=acceptance(step.id,log.toString('utf8'));
      save();
    }
    if(!same(sources,versions(front,worker)))fail('gate_sources_changed_during_tests');
    record.status='passed';save();verifyEvidence({front,worker,frontCommit,workerCommit,evidence});
    return evidence;
  }catch(error){record.status='failed';record.error=error.message;save();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,...args]=process.argv.slice(2),options={};
    if(!['run','verify'].includes(mode))fail('用法：node tools/release-offline-gate.mjs run|verify --worker PATH --front-commit SHA40 --worker-commit SHA40 --out NEW_DIR|--evidence JSON');
    for(let i=0;i<args.length;i+=2){
      const name={'--worker':'worker','--front-commit':'frontCommit','--worker-commit':'workerCommit','--out':'out','--evidence':'evidence'}[args[i]];
      if(!name||!args[i+1]||options[name])fail('gate_invalid_arguments');options[name]=args[i+1];
    }
    if(!options.worker||!(mode==='run'?options.out:options.evidence))fail('gate_missing_arguments');
    if(mode==='run')console.log('離線 gate 通過：'+runGate(options));
    else{verifyEvidence(options);console.log('離線 gate 證據與固定來源版本一致');}
  }catch(error){console.error(error.message);process.exitCode=1;}
}
