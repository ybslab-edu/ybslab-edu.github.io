import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {buildSite,scanRelease,releasePaths} from '../tools/build-fullrev-site.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
const workerSource=process.env.YBS_WORKER_SOURCE;
const config={...fixtureConfig,readModelModule:'/assets/fullrev-read-model.mjs'};
test('PR8 mandatory full-tree release gate: 124 rounds, all public pages/resources; private source cannot be skipped',async t=>{
 assert.ok(workerSource,'PR8 release acceptance requires YBS_WORKER_SOURCE; no skip/fallback');
 const dir=await mkdtemp(join(tmpdir(),'ybs-pr8-release-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'site');
 await assert.rejects(buildSite({output,config}),/worker_source_required/);
 await assert.rejects(buildSite({output,config:{...config,readModelModule:''},workerSource}),/release_read_model_or_public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,privateKey:'synthetic-forbidden'},workerSource}),/public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,firebase:{...config.firebase,apiKey:'REPLACE_WITH_PUBLIC_KEY'}},workerSource}),/placeholders_forbidden/);
 const built=await buildSite({output,config,workerSource});assert.equal(built.rounds,124);assert.equal(built.activities,31);assert.equal(built.scan.hits,0);assert.equal(built.scan.files,releasePaths().length);assert.ok(built.scan.privateCases>1800);
 for(const p of ['index.html','map/index.html','about/index.html','115-g9/me/index.html','115-g9/teacher/index.html','115-g9/teacher/report/index.html','115-df/teacher/index.html','115-df/a/index.html','assets/fullrev-read-model.mjs'])assert.ok((await readFile(join(output,p))).length);
 const login=await readFile(join(output,'assets/login.js'),'utf8');assert.doesNotMatch(login,/class-score-86020|guestId\(|validGuest|\.collection\(/);
 for(const injected of ['tools/answer.js','assets/backup.json','assets/leak.map','secret.bin']){
  await mkdir(join(output,injected,'..'),{recursive:true});await writeFile(join(output,injected),'private');await assert.rejects(scanRelease({output,workerSource}),/allowlist/);await rm(join(output,injected));if(injected.startsWith('tools/'))await rm(join(output,'tools'),{recursive:true});
 }
 const file=join(output,'assets/fullrev-read-model.mjs'),original=await readFile(file);
 for(const content of ['//# sourceMappingURL=private.map','const TEACHER_HASH="synthetic";','const answers="class-score-86020";']){
  await writeFile(file,content);await assert.rejects(scanRelease({output,workerSource}),/forbidden_content/);
 }
 await writeFile(file,original);await rm(file);await symlink('/tmp',file);await assert.rejects(scanRelease({output,workerSource}),/nonregular/);await rm(file);await writeFile(file,original);
 assert.deepEqual(await scanRelease({output,workerSource}),built.scan);
 for(const value of [undefined,{enabled:false}]){
  const c=vm.createContext({console,Promise});if(value!==undefined)c.YBS_FULLREV_CONFIG=value;
  vm.runInContext(login+';globalThis.api=YBS;',c);await new Promise(r=>setImmediate(r));
  assert.equal(c.api.fullrev,true);assert.equal(c.api.submit(),false);assert.equal(c.api.flushGuest(),false);await assert.rejects(c.api.firebaseSession(),/configuration-pending/);
 }
});
test('PR8 read adapter authenticates fresh identity, never lists Firestore or falls back on 503',async()=>{
 let user={getIdToken:async()=> 'synthetic'},requests=[];
 const auth={get currentUser(){return user;}},session=async()=>({app:{options:{projectId:config.firebase.projectId}},auth});
 const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,fetcher:async(url,init)=>{requests.push({url,init});return Response.json({error:'temporarily_unavailable'},{status:503});}});
 await assert.rejects(model.context({course:'115-g9',classKey:'c901',activity:5,round:0}),{code:'read-model-pending'});
 assert.equal(requests.length,1);assert.equal(requests[0].url.pathname,'/context');assert.equal(requests[0].init.redirect,'error');
 assert.throws(()=>model.controls({course:'115-df',classKey:'c901'}),{code:'invalid-course'});assert.equal(requests.length,1);
 user=null;await assert.rejects(model.controls({course:'115-g9',classKey:'c901'}),{code:'login-required'});assert.equal(requests.length,1);
});

test('DF 60-second cooldown preserves changed draft, identical receipt is idempotent, retry after interval succeeds',async t=>{
 const {createDFReports}=await import('../assets/fullrev-df.mjs');let clock=1700000000000,writes=0;const uid='synthetic-student',docs=new Map();
 const stamp=()=>{const value=clock;return {toMillis:()=>value};};globalThis.firebase={firestore:{FieldValue:{serverTimestamp:stamp}}};t.after(()=>{delete globalThis.firebase;});
 const db={doc:path=>({path,get:async()=>({exists:true,data:()=>path.includes('/roster/')?{active:true,subject:'synthetic-subject',cls:901,seat:1}:docs.get(path)})}),runTransaction:async f=>f({get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),set:(ref,v)=>{docs.set(ref.path,v);writes++;}})};
 const api=createDFReports({course:'115-df',getSession:async()=>({db}),mark:()=>({uid}),active(){},claims:async()=>({firebase:{sign_in_provider:'password'},email:'cgjh990001@ybslab-edu.github.io'}),context:async()=>({subject:'synthetic-subject'}),fail:code=>Object.assign(Error(code),{code}),now:()=>clock});
 const encoded={schemaVersion:1,encoding:'ascii-json',payload:'{}',cls:901,seat:1,snapshotAt:clock};
 await api.submitReport(1,encoded);await api.submitReport(1,encoded);assert.equal(writes,1);
 const changed={...encoded,payload:'{"synthetic":true}'};await assert.rejects(api.submitReport(1,changed),{code:'report/rate-limited'});assert.equal(writes,1);
 clock+=60000;await api.submitReport(1,changed);assert.equal(writes,2);assert.equal(docs.values().next().value.payload,changed.payload);
});
