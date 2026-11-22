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
const config={...fixtureConfig,courses:['115-g9'],readModelModule:'/assets/fullrev-read-model.mjs'};
test('PR8 mandatory full-tree release gate: 121 g9 rounds; DF remains legacy',async t=>{
 if(!workerSource&&process.env.CI){t.skip('略過：需私有來源，由 Console 發布前在本機執行');return;}
 assert.ok(workerSource,'本機發布驗收需設定 YBS_WORKER_SOURCE');
 const dir=await mkdtemp(join(tmpdir(),'ybs-pr8-release-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'site');
 await assert.rejects(buildSite({output,config}),/worker_source_required/);
 await assert.rejects(buildSite({output,config:{...config,readModelModule:''},workerSource}),/release_read_model_or_public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,privateKey:'synthetic-forbidden'},workerSource}),/public_config_invalid/);
 await assert.rejects(buildSite({output,config:{...config,firebase:{...config.firebase,apiKey:'REPLACE_WITH_PUBLIC_KEY'}},workerSource}),/placeholders_forbidden/);
 const built=await buildSite({output,config,workerSource});assert.equal(built.rounds,121);assert.equal(built.activities,30);assert.equal(built.scan.hits,0);assert.equal(built.scan.files,releasePaths().length);assert.ok(built.scan.privateCases>1800);
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
 for(const p of ['index.html','map/index.html','about/index.html','115-g9/me/index.html','115-g9/teacher/index.html','115-g9/teacher/report/index.html','115-df/teacher/index.html','115-df/a/index.html','assets/fullrev-read-model.mjs'])assert.ok((await readFile(join(output,p))).length);
 const login=await readFile(join(output,'assets/login.js'),'utf8');assert.doesNotMatch(login,/class-score-86020|guestId\(|validGuest|\.collection\(/);
 const df=await readFile(join(output,'115-df/a/index.html'),'utf8');
 assert.match(df,/assets\/legacy-df\/login.js/);assert.match(df,/assets\/legacy-df\/config.js/);assert.doesNotMatch(df,/await YBS.loadDFContent/);
 const legacyLogin=await readFile(join(output,'assets/legacy-df/login.js'),'utf8');assert.match(legacyLogin,/project: 'class-score-86020'/);
 const dfCloud=await readFile(join(output,'assets/df-teacher-cloud.js'),'utf8');assert.match(dfCloud,/LEGACY_DF_INIT_START/);
 const privateArrays=[],shortAnswers=[];
 for(let n=1;n<=8;n++){
  const {default:banks}=await import(new URL('file://'+resolve(workerSource,`src/formal/banks/pr6-batch${n}.mjs`)));
  for(const [key,bundle] of Object.entries(banks))for(const bank of Object.values(bundle.rounds))for(const c of bank.cases||[]){
   if(Array.isArray(c.answer))privateArrays.push(c.answer);
   if(!key.startsWith('115-df:')&&typeof c.answer==='string')shortAnswers.push(c.answer);
  }
 }
 assert.equal(privateArrays.length,1361);
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
