// Release-only allowlist: never publish the repository root.
import {readFile,writeFile,mkdir,copyFile,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {activitiesJSON} from './activities-json.mjs';
import {buildBatches,PUBLIC_ACTIVITY_ASSETS} from './build-fullrev-batch1.mjs';
import {MANAGED_ACTIVITIES,BATCH8} from '../assets/fullrev-activities.mjs';
import {scanPrivateAnswers} from './scan-private-answers.mjs';
import {publicAnswerRemainder} from './public-answer-allowlist.mjs';
import {checkConfig} from '../assets/fullrev-client.mjs';
import {fullrevCsp,assertFullrevCsp} from './fullrev-csp.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const assets=[...PUBLIC_ACTIVITY_ASSETS,'activities.js','activities.json','curriculum.js','fullrev-config.js'];
// Preserve the existing DF flow; only byte-identical public content is exempt from answer scanning.
const legacyDFSources={
 '115-df/index.html':'115-df/index.html','115-df/a/index.html':'115-df/a/index.html','115-df/teacher/index.html':'115-df/teacher/index.html',
 'assets/legacy-df/login.js':'assets/login.js','assets/teacher.js':'assets/teacher.js','assets/lock.js':'assets/lock.js','assets/df-teacher-cloud.js':'assets/df-teacher-cloud.js'
};
const legacyDFHashes={
 "115-df/a/index.html": "1d209b8e1302e8c6a1eb567218a12090da84d1e02e483b4eede520429f157cb4",
 "115-df/index.html": "dda49c53adcf8913f8acf37766080302f9f2a456cfd56e26de8f30d6180615a4",
 "115-df/teacher/index.html": "77142454e9e5548112e45116d504819717c248bcf28ad1a74ad799a2497635b5",
 "assets/legacy-df/login.js": "c45cd6a0ba7db67312f0fee3519f22956bbf86e76e38d6783bd5ed4d24f89882",
 "assets/teacher.js": "c18c458e687f884db51984a9b4ef32829af251eabe4623a07fb0b62055cb5108",
 "assets/lock.js": "1de7d0d8ed42804600019a026cc50093c89e6cff858af5e1a3a5afefad0bf828",
 "assets/df-teacher-cloud.js": "f0773cb1fb757491e2ccf0a9dd129c2d21a019ae97e8856be767998d11e8a217"
};
const legacyDFConfig="const YBS_FULLREV_CONFIG=Object.freeze({enabled:false});\n";
const legacyDFPage=(s)=>s.replace(/((?:\.\.\/)*assets\/)fullrev-config\.js(?:\?[^" ]*)?/g,'/assets/legacy-df/config.js').replace(/((?:\.\.\/)*assets\/)login\.js(?:\?[^" ]*)?/g,'/assets/legacy-df/login.js');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function earlyOpenSource(source=root){
 const value=(await readFile(join(source,'assets/lock.js'),'utf8')).match(/^const OPEN = \{[\s\S]*?^\};/m)?.[0];
 if(!value)throw Error('release_early_open_missing');
 return value+'\n';
}
const copiedPages=['index.html','404.html','map/index.html','about/index.html','115-g9/index.html'];
const mountedPages={'115-g9/me/index.html':'mountGrowth','115-g9/teacher/index.html':'mountTeacher','115-g9/teacher/report/index.html':'mountTeacher'};
const extraPages=Object.keys(legacyDFSources).concat('assets/legacy-df/config.js');
export const releasePaths=()=>[...assets.map(a=>'assets/'+a),...copiedPages,...Object.keys(mountedPages),...extraPages,...new Set([...MANAGED_ACTIVITIES,...BATCH8].filter(a=>a.course!=='115-df').map(a=>a.file)),...Array.from({length:30},(_,i)=>`115-g9/w${String(i+1).padStart(2,'0')}/index.html`),'.nojekyll'].sort();
const csp=(html,config)=>html.replace(/(http-equiv="Content-Security-Policy" content=")([^"]+)(")/,(_,a,value,z)=>a+fullrevCsp(value,config)+z);
const shell=(policy,title,body)=>`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${title}｜YBS Lab</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/shell.css"></head><body>${body}</body></html>`;
const scripts=['curriculum.js','activities.js','fullrev-config.js','login.js','vendor/xlsx-0.20.3.full.min.js'].map(a=>`<script src="/assets/${a}?v=20261127gx"></script>`).join('');
function releaseConfig(config){
 checkConfig(config);
 if(config.studentGoogleLogin!==undefined&&typeof config.studentGoogleLogin!=='boolean')throw Error('release_student_google_config_invalid');
 if(config.answerTickets!==undefined&&typeof config.answerTickets!=='boolean')throw Error('release_answer_tickets_config_invalid');
 if(config.courses!==undefined&&JSON.stringify(config.courses)!==JSON.stringify(['115-g9']))throw Error('release_courses_invalid');
 if(/REPLACE_WITH_/i.test(JSON.stringify(config)))throw Error('release_placeholders_forbidden');
 if(Object.keys(config).some(k=>!['enabled','studentGoogleLogin','answerTickets','courses','firebase','workerOrigin','readModelModule'].includes(k))
  ||Object.keys(config.firebase).some(k=>!['projectId','apiKey','messagingSenderId'].includes(k))
  ||typeof config.firebase.apiKey!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(config.firebase.apiKey)
  ||config.firebase.messagingSenderId!==undefined&&typeof config.firebase.messagingSenderId!=='string'
  ||config.readModelModule!=='/assets/fullrev-read-model.mjs')throw Error('release_read_model_or_public_config_invalid');
}
export async function scanRelease({output,workerSource}){
 if(!workerSource)throw Error('worker_source_required_for_release_scan');
 const found=[],text=[];output=resolve(output);
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,e.name),s=await lstat(p);if(s.isSymbolicLink()||!s.isFile()&&!s.isDirectory())throw Error('release_nonregular_file');
  if(s.isDirectory()){if(!releasePaths().some(path=>path.startsWith(relative(output,p).split('\\').join('/')+'/')))throw Error('release_allowlist_mismatch');await walk(p);}else{const path=relative(output,p).split('\\').join('/');found.push(path);text.push({path,bytes:await readFile(p)});}
 }}await walk(output);
 const expected=releasePaths();if(JSON.stringify(found.sort())!==JSON.stringify(expected))throw Error('release_allowlist_mismatch');
 const configText=text.find(t=>t.path==='assets/fullrev-config.js')?.bytes.toString('utf8'),earlyOpen=await earlyOpenSource();
 const cfg=configText?.startsWith(earlyOpen)&&configText.slice(earlyOpen.length).match(/^const YBS_FULLREV_CONFIG=Object\.freeze\(([^\n]+)\);\n$/);
 if(!cfg)throw Error('release_config_missing');const config=JSON.parse(cfg[1]);releaseConfig(config);
 for(const file of text){
  if(file.path.endsWith('.html')&&!Object.hasOwn(legacyDFSources,file.path))assertFullrevCsp(file.bytes.toString('utf8'),config);
  if(Object.hasOwn(legacyDFSources,file.path)){
   // Pinned compatibility files are not a directory-wide exemption: any byte change fails.
   const original=await readFile(join(root,legacyDFSources[file.path]));
   if(digest(original)!==legacyDFHashes[file.path]||!file.bytes.equals(Buffer.from(file.path.endsWith('.html')?legacyDFPage(original.toString('utf8')):original)))throw Error('release_legacy_df_changed');
  }
  if(file.path==='assets/legacy-df/config.js'&&file.bytes.toString('utf8')!==legacyDFConfig)throw Error('release_legacy_df_config');
 }
 // Exempt only pinned bytes already public at gh-pages 3f132ee. New teacher code is scanned.
 const scanned=text.map(file=>({...file,bytes:publicAnswerRemainder(file.path,file.bytes)}));
 const all=scanned.map(t=>t.bytes.toString('utf8')).join('\n');
 for(const {path,bytes} of scanned){
  const legacy=Object.hasOwn(legacyDFSources,path);
  // 瀏覽器固定時鐘只能存在 tests；拒絕測試控制碼混入正式腳本或 HTML。
  if(/\b(?:setFixedTime|__YBS_TEST_CLOCK__|clock\.(?:install|setSystemTime))\b|\bDate\.now\s*=(?!=)|\b(?:window|globalThis)\.Date\s*=(?!=)/.test(bytes.toString('utf8')))throw Error('release_test_clock:'+path);
  if(/WARMUP_BANK|firstOption|checkWarmup|teacher-reference\//.test(bytes.toString('utf8')))throw Error('release_public_answer_code:'+path);
  if(!legacy&&/(?:legacy-df\/|sourceMappingURL|sourceURL=|class-score-86020|ybs-pilot|TEACHER_HASH|TEACHER\.remember|teacher\.js|lock\.js|pr6-batch\d|BEGIN PRIVATE KEY|soundBest|minimumBytes|checkRecordingAnswer|volunteer-questions|volunteerAnswer|volunteerCheck|volunteer-sheet-(?:sim|generator)|u206-sheet-v2\.mjs|u206-generator-v|\b(?:deriveSheet|sheetSolution|replaySheet|validSheetCase|configureSheet|flowOrder|titleOrder)\b|q(?:One|Two|Three|Four)Expected|qCheck|"budget"\s*:)/.test(bytes.toString('utf8')))throw Error('release_forbidden_content:'+path);
  if(!legacy&&/(?:^|\/)(?:tools|tests|fixtures|workers|backups?|\.git)(?:\/|$)|\.(?:map|bak|zip|pdf)$|(?:teacher|lock)\.js$/.test(path))throw Error('release_forbidden_path');
 }
 let cases=0;const answers=[];
 for(const bankFile of [...Array.from({length:8},(_,i)=>`pr6-batch${i+1}.mjs`),'u206-sheet-v2.mjs']){
  const file=resolve(workerSource,'src/formal/banks',bankFile);
  const {default:banks}=await import(pathToFileURL(file).href);
  if(!banks||!Object.keys(banks).length)throw Error('release_bank_missing');
  for(const [key,bundle] of Object.entries(banks)){
   if(key.startsWith('115-df:'))continue;
   if(all.includes(key)||all.includes(key.split(':')[1]))throw Error('release_private_version');
   for(const bank of Object.values(bundle.rounds))for(const c of bank.cases||[]){
    cases++;answers.push(c.answer);if([c,...(Object.keys(c.facts||{}).length?[c.facts]:[])].some(value=>all.includes(JSON.stringify(value))||all.includes(JSON.stringify(value,null,2))))throw Error('release_private_case');
    if(typeof c.facts?.image==='string'&&c.facts.image&&all.includes(c.facts.image))throw Error('release_private_image');

   }
  }
 }
 for(const name of ['pr6-batch5-materials.mjs','pr6-batch7-materials.mjs']){
  const {default:materials}=await import(pathToFileURL(resolve(workerSource,'src/formal/banks',name)).href);
  function scan(value){if(typeof value==='string'&&value.length>100){
   if(all.includes(value))throw Error('release_private_material');
   if(/^(?:H4sI|data:[^,]+;base64,)/.test(value)){const data=Buffer.from(value.replace(/^data:[^,]+;base64,/,''),'base64');
    if(data.length>64&&scanned.some(file=>file.bytes.includes(data)))throw Error('release_private_binary_material');}
  }
   if(value&&typeof value==='object')for(const v of Object.values(value))scan(v);}
  scan(materials);
 }
 if(!cases)throw Error('release_cases_missing');
 for(const f of scanned){try{scanPrivateAnswers(f.bytes.toString('utf8'),answers);}catch(e){throw Error(e.message+':'+f.path);}}
 const sha256=createHash('sha256');for(const f of text.sort((a,b)=>a.path.localeCompare(b.path))){sha256.update(f.path+'\0');sha256.update(f.bytes);}
 return {files:found.length,privateCases:cases,hits:0,sha256:sha256.digest('hex')};
}
export async function buildSite({output,config,workerSource,source=root}){
 releaseConfig(config);
 // Validate mandatory private-source dependency before writing anything.
 if(!workerSource)throw Error('worker_source_required_for_release_scan');
 config={...config,courses:['115-g9']};
 const result=await buildBatches({output,config,source,courses:['115-g9']});
 if(result.rounds!==121||result.activities!==30)throw Error('release_coverage_incomplete');
 // 新外框不載入舊遮罩與通行碼；僅帶入同一份公開 OPEN 清單。
 const configPath=join(output,'assets/fullrev-config.js');
 await writeFile(configPath,await earlyOpenSource(source)+await readFile(configPath,'utf8'));
 const login=await readFile(join(source,'assets/login.js'),'utf8');
 await writeFile(join(output,'assets/login.js'),`// Fullrev only. Missing configuration stops; there is no legacy client.\nconst YBS=ybsFullrevFacade(typeof YBS_FULLREV_CONFIG==='undefined'?null:YBS_FULLREV_CONFIG);\n`+login.slice(login.indexOf('function ybsFullrevFacade(config)')));
 await copyFile(join(source,'assets/fullrev-read-model.mjs'),join(output,'assets/fullrev-read-model.mjs'));
 for(const page of releasePaths().filter(p=>/^115-g9\/w[0-9]+\/index.html$/.test(p)))await write(page,csp(await readFile(join(output,page),'utf8'),config));
 for(const page of copiedPages)await write(page,csp(await readFile(join(source,page),'utf8'),config));
 const policy=(await readFile(join(output,'115-g9/u1-01/index.html'),'utf8')).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 for(const [page,mount] of Object.entries(mountedPages))await write(page,shell(policy,mount==='mountGrowth'?'我的成長紀錄':'教師紀錄與匯出',scripts+`<script>YBS.${mount}();</script>`));
 for(const [dest,src] of Object.entries(legacyDFSources)){
  const bytes=await readFile(join(source,src));if(digest(bytes)!==legacyDFHashes[dest])throw Error('release_legacy_df_source_changed');
  await write(dest,dest.endsWith('.html')?legacyDFPage(bytes.toString('utf8')):bytes);
 }
 await write('assets/legacy-df/config.js',legacyDFConfig);
 await write('assets/activities.json',activitiesJSON(await readFile(join(source,'assets/activities.js'),'utf8')));
 // One release tag prevents mixing cached legacy scripts/config with the release tree.
 for(const path of releasePaths().filter(p=>!Object.hasOwn(legacyDFSources,p)&&p!=='assets/legacy-df/config.js'&&/\.(?:html|m?js|css)$/.test(p))){
  let value=await readFile(join(output,path),'utf8');
    value=value.replace(/((?:assets\/)?[\w./-]+\.(?:m?js|css))\?v=[a-zA-Z0-9]+/g,'$1?v=20261127gx');
  if(/\.m?js$/.test(path))value=value.replace(/((?:from\s+|import\s*\()\s*['"])(\.[^'"]+\.mjs)(?:\?[^'"]*)?(['"])/g,'$1$2?v=20261127gx$3');
  await write(path,value);
 }
 await write('.nojekyll','');
 return {...result,scan:await scanRelease({output,workerSource})};
 async function write(file,value){await mkdir(dirname(join(output,file)),{recursive:true});await writeFile(join(output,file),value);}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2),parsed={};
 if(!['build','scan'].includes(mode)||args.length%2)throw Error('usage: build|scan --out PATH --worker-source PATH [--config PATH]');
 for(let i=0;i<args.length;i+=2){if(!['--out','--worker-source','--config'].includes(args[i])||parsed[args[i]])throw Error('invalid_arguments');parsed[args[i]]=args[i+1];}
 if(!parsed['--out'])throw Error('output_required');
 const options={output:parsed['--out'],workerSource:parsed['--worker-source']};
 console.log(mode==='scan'?await scanRelease(options):await buildSite({...options,config:JSON.parse(await readFile(parsed['--config'],'utf8'))}));
}
