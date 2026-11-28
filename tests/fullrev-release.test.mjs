import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {activitiesJSON} from '../tools/activities-json.mjs';
import {buildSite,scanRelease,releasePaths} from '../tools/build-fullrev-site.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';
import {createReadModel} from '../assets/fullrev-read-model.mjs';
const config={...fixtureConfig,answerTickets:true,courses:['115-g9'],readModelModule:'/assets/fullrev-read-model.mjs'};
test('PR8 mandatory full-tree release gate: 121 g9 rounds; DF and public warmups remain unchanged',async t=>{
 if(workerCISkip){t.skip(workerCISkip);return;}
 assert.ok(workerSource,'本機發布驗收需設定 YBS_WORKER_SOURCE');
 const dir=await mkdtemp(join(tmpdir(),'ybs-pr8-release-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'site');
 await assert.rejects(buildSite({output,config}),/worker_source_required/);
 await assert.rejects(buildSite({output,config:{...config,readModelModule:''},workerSource}),/release_read_model_or_public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,privateKey:'synthetic-forbidden'},workerSource}),/public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,answerTickets:'true'},workerSource}),/release_answer_tickets_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,firebase:{...config.firebase,apiKey:'REPLACE_WITH_PUBLIC_KEY'}},workerSource}),/placeholders_forbidden/);
 const built=await buildSite({output,config,workerSource});assert.equal(built.rounds,121);assert.equal(built.activities,30);assert.equal(built.scan.hits,0);assert.equal(built.scan.files,releasePaths().length);assert.ok(built.scan.privateCases>1800);
 const catalogPath=join(output,'assets/activities.json'),catalog=await readFile(catalogPath,'utf8');
 assert.equal(catalog,activitiesJSON(await readFile(new URL('../assets/activities.js',import.meta.url),'utf8')));
 assert.deepEqual(JSON.parse(catalog),JSON.parse(await readFile(new URL('../assets/activities.json',import.meta.url),'utf8')));
 await rm(catalogPath);await assert.rejects(scanRelease({output,workerSource}),/release_allowlist_mismatch/);await writeFile(catalogPath,catalog);
 await writeFile(catalogPath,catalog+'\n'+JSON.stringify({answer:'synthetic',qThreeExpected:[]}));
 await assert.rejects(scanRelease({output,workerSource}),/release_forbidden_content/);await writeFile(catalogPath,catalog);
 t.diagnostic(`release scan: files=${built.scan.files}; privateCases=${built.scan.privateCases}; hits=${built.scan.hits}`);
 // Every new release page, including all w01–w30 redirects, shares popup CSP.
 // The three pinned legacy DF pages retain their separate, byte-checked policy.
 for(const p of releasePaths().filter(p=>p.endsWith('.html')&&!p.startsWith('115-df/'))){
  const html=await readFile(join(output,p),'utf8');
  const directives=Object.fromEntries(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].split(';').map(s=>s.trim().split(/\s+/)).map(([name,...sources])=>[name,sources]));
  assert.ok(directives['script-src'].includes('https://apis.google.com'),p);
  assert.deepEqual(directives['script-src'],["'self'","'unsafe-inline'",'https://www.gstatic.com/firebasejs/','https://apis.google.com'],p);
  assert.deepEqual(directives['connect-src'],["'self'",'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com',config.workerOrigin],p);
  assert.deepEqual(directives['frame-src'],[`https://${config.firebase.projectId}.firebaseapp.com`],p);
 }
 const cspFile=join(output,'115-g9/u2-05/index.html'),cspOriginal=await readFile(cspFile,'utf8');
 for(const source of ['https://apis.google.com',config.workerOrigin,'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com',`https://${config.firebase.projectId}.firebaseapp.com`]){
  await writeFile(cspFile,cspOriginal.replace(' '+source,''));
  await assert.rejects(scanRelease({output,workerSource}),/release_csp_missing_source/);
 }
 await writeFile(cspFile,cspOriginal);
 assert.match(await readFile(join(output,'115-df/teacher/index.html'),'utf8'),/script-src [^;]*https:\/\/apis\.google\.com/);
 for(const p of ['index.html','map/index.html','about/index.html','115-g9/me/index.html','115-g9/teacher/index.html','115-g9/teacher/report/index.html','115-df/teacher/index.html','115-df/a/index.html','assets/fullrev-read-model.mjs','assets/fullrev-progress-cache.mjs','assets/fullrev-credit.mjs'])assert.ok((await readFile(join(output,p))).length);
 assert.match(await readFile(join(output,'assets/fullrev-progress.mjs'),'utf8'),new RegExp(`fullrev-credit\\.mjs\\?v=${built.releaseId}['"]`));
 const login=await readFile(join(output,'assets/login.js'),'utf8');assert.doesNotMatch(login,/class-score-86020|guestId\(|validGuest|\.collection\(/);
 const df=await readFile(join(output,'115-df/a/index.html'),'utf8');
 assert.match(df,/assets\/legacy-df\/login.js/);assert.match(df,/assets\/legacy-df\/config.js/);assert.doesNotMatch(df,/await YBS.loadDFContent/);
 const legacyLogin=await readFile(join(output,'assets/legacy-df/login.js'),'utf8');assert.match(legacyLogin,/project: 'class-score-86020'/);
 const dfCloud=await readFile(join(output,'assets/df-teacher-cloud.js'),'utf8');assert.match(dfCloud,/LEGACY_DF_INIT_START/);
 // An exemption is a pinned file or block, never a whole modified shell.
 const shellFile=join(output,'assets/fullrev-shell.mjs'),shellOriginal=await readFile(shellFile,'utf8');
 assert.match(shellOriginal,/function mountWarmup/);assert.match(shellOriginal,/openTeacherQuestion/);
 for(const [path,original,changed] of [
  [join(output,'115-df/a/index.html'),df,df+'\n'],
  [shellFile,shellOriginal,shellOriginal.replace('const checkWarmup =','const checkWarmup  =')]
 ]){await writeFile(path,changed);await assert.rejects(scanRelease({output,workerSource}),/public_answer_allowlist_changed|legacy_df_changed/);await writeFile(path,original);}
 const privateArrays=[],shortAnswers=[];
 for(let n=1;n<=8;n++){
  const {default:banks}=await import(new URL('file://'+resolve(workerSource,`src/formal/banks/pr6-batch${n}.mjs`)));
  for(const [key,bundle] of Object.entries(banks))for(const bank of Object.values(bundle.rounds))for(const c of bank.cases||[]){
   if(Array.isArray(c.answer))privateArrays.push(c.answer);
   if(!key.startsWith('115-df:')&&typeof c.answer==='string')shortAnswers.push(c.answer);
  }
 }
 // Teacher code and content outside the pinned warmup block remain subject to scanning.
 for(const path of [shellFile,join(output,'assets/fullrev-teacher-view.mjs')]){
  const original=await readFile(path);
  await writeFile(path,Buffer.concat([original,Buffer.from('\nconst leaked='+JSON.stringify(shortAnswers[0])+';')]));
  await assert.rejects(scanRelease({output,workerSource}),/private_text_answer/);
  await writeFile(path,original);
 }
 // 指定 Worker 的 src/formal/banks/pr6-batch1～8：逐 case 計算 Array 答案（含 DF），不計純字串答案。
 assert.equal(privateArrays.length,1361);
 t.diagnostic(`private array answers: ${privateArrays.length} (Worker pr6-batch1–8)`);
 const victim=join(output,'assets/fullrev-read-model.mjs'),clean=await readFile(victim);
 const stringifyLeaves=value=>Array.isArray(value)?value.map(stringifyLeaves):String(value);
 for(const payload of [JSON.stringify(privateArrays),JSON.stringify(privateArrays.map(stringifyLeaves)),JSON.stringify(JSON.stringify(privateArrays)),JSON.stringify(privateArrays,null,2)]){
  await writeFile(victim,Buffer.concat([clean,Buffer.from('\nconst leaked='+payload+';')]));
  await assert.rejects(scanRelease({output,workerSource}),/private_answer_array/);
 }
 for(const answer of shortAnswers){await writeFile(victim,Buffer.concat([clean,Buffer.from('\nconst leaked='+JSON.stringify(answer)+';')]));await assert.rejects(scanRelease({output,workerSource}),/private_text_answer/);}
 await writeFile(victim,clean);
 const legacyFile=join(output,'assets/legacy-df/login.js');await writeFile(legacyFile,legacyLogin+'\n// unexpected change');await assert.rejects(scanRelease({output,workerSource}),/legacy_df_changed/);await writeFile(legacyFile,legacyLogin);
 for(const injected of ['tools/answer.js','assets/backup.json','assets/leak.map','secret.bin']){
  await mkdir(join(output,injected,'..'),{recursive:true});await writeFile(join(output,injected),'private');await assert.rejects(scanRelease({output,workerSource}),/allowlist/);await rm(join(output,injected));if(injected.startsWith('tools/'))await rm(join(output,'tools'),{recursive:true});
 }
 const file=join(output,'assets/fullrev-read-model.mjs'),original=await readFile(file);
 for(const content of ['//# sourceMappingURL=private.map','const TEACHER_HASH="synthetic";','const answers="class-score-86020";','function volunteerCheck(){}','function qCheck(){}','const qThreeExpected=()=>[];']){
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
 const waits=[];
 const model=createReadModel({session,project:config.firebase.projectId,course:'115-g9',workerOrigin:config.workerOrigin,wait:async ms=>waits.push(ms),fetcher:async(url,init)=>{requests.push({url,init});return Response.json({error:'temporarily_unavailable'},{status:503});}});
 await assert.rejects(model.context({course:'115-g9',classKey:'c901',activity:5,round:0}),{code:'read-model-pending'});
 assert.equal(requests.length,4);assert.deepEqual(waits,[1000,2000,4000]);assert.equal(requests[0].url.pathname,'/context');assert.equal(requests[0].init.redirect,'error');
 assert.throws(()=>model.controls({course:'115-df',classKey:'c901'}),{code:'invalid-course'});assert.equal(requests.length,4);
 user=null;await assert.rejects(model.controls({course:'115-g9',classKey:'c901'}),{code:'login-required'});assert.equal(requests.length,4);
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
