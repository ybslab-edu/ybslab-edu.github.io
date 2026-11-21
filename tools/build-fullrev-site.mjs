// Release-only allowlist: never publish the repository root.
import {readFile,writeFile,mkdir,copyFile,readdir,lstat} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildBatches} from './build-fullrev-batch1.mjs';
import {MANAGED_ACTIVITIES,BATCH8} from '../assets/fullrev-activities.mjs';
import {checkConfig} from '../assets/fullrev-client.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const assets=['df-teacher-cloud.js','fullrev-client.mjs','fullrev-read-model.mjs','fullrev-df.mjs','df-report.js','fullrev-recording.mjs','fullrev-ui.mjs','fullrev-progress.mjs','fullrev-activities.mjs','fullrev-outcomes.mjs','fullrev-performance.mjs','fullrev-photos.mjs','login.js','xp.js','shell.css','favicon.svg','vendor/xlsx-0.20.3.full.min.js','activities.js','curriculum.js','fullrev-config.js'];
const copiedPages=['index.html','404.html','map/index.html','about/index.html','115-g9/index.html','115-df/index.html'];
const mountedPages={'115-g9/me/index.html':'mountGrowth','115-g9/teacher/index.html':'mountTeacher','115-g9/teacher/report/index.html':'mountTeacher'};
const extraPages=['115-df/teacher/index.html'];
export const releasePaths=()=>[...assets.map(a=>'assets/'+a),...copiedPages,...Object.keys(mountedPages),...extraPages,...new Set([...MANAGED_ACTIVITIES,...BATCH8].map(a=>a.file)),...Array.from({length:30},(_,i)=>`115-g9/w${String(i+1).padStart(2,'0')}/index.html`),'.nojekyll'].sort();
const csp=(html,config)=>html.replace(/(http-equiv="Content-Security-Policy" content=")([^"]+)(")/,(_,a,value,z)=>a+value.split(';').map(v=>v.trim()).filter(Boolean).map(v=>v.startsWith('connect-src ')?v+' '+config.workerOrigin:v.startsWith('frame-src ')?'frame-src https://'+config.firebase.projectId+'.firebaseapp.com':v).join('; ')+z);
const shell=(policy,title,body)=>`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${title}｜YBS Lab</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/shell.css"></head><body>${body}</body></html>`;
const scripts=['curriculum.js','activities.js','fullrev-config.js','login.js','vendor/xlsx-0.20.3.full.min.js'].map(a=>`<script src="/assets/${a}?v=20261121pr8"></script>`).join('');
function releaseConfig(config){
 checkConfig(config);
 if(/REPLACE_WITH_/i.test(JSON.stringify(config)))throw Error('release_placeholders_forbidden');
 if(Object.keys(config).some(k=>!['enabled','firebase','workerOrigin','readModelModule'].includes(k))
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
 const cfg=text.find(t=>t.path==='assets/fullrev-config.js')?.bytes.toString('utf8').match(/^const YBS_FULLREV_CONFIG=Object\.freeze\(([^\n]+)\);\n$/);
 if(!cfg)throw Error('release_config_missing');releaseConfig(JSON.parse(cfg[1]));
 const all=text.map(t=>t.bytes.toString('utf8')).join('\n');
 for(const {path,bytes} of text){
  if(/(?:sourceMappingURL|sourceURL=|class-score-86020|ybs-pilot|TEACHER_HASH|TEACHER\.remember|teacher\.js|lock\.js|pr6-batch\d|BEGIN PRIVATE KEY|soundBest|minimumBytes|checkRecordingAnswer|"budget"\s*:)/.test(bytes.toString('utf8')))throw Error('release_forbidden_content:'+path);
  if(/(?:^|\/)(?:tools|tests|fixtures|workers|backups?|\.git)(?:\/|$)|\.(?:map|bak|zip|pdf)$|(?:teacher|lock)\.js$/.test(path))throw Error('release_forbidden_path');
 }
 let cases=0;
 for(let n=1;n<=8;n++){
  const file=resolve(workerSource,`src/formal/banks/pr6-batch${n}.mjs`);
  const {default:banks}=await import(pathToFileURL(file).href);
  if(!banks||!Object.keys(banks).length)throw Error('release_bank_missing');
  for(const [key,bundle] of Object.entries(banks)){
   if(all.includes(key)||all.includes(key.split(':')[1]))throw Error('release_private_version');
   for(const bank of Object.values(bundle.rounds))for(const c of bank.cases||[]){
    cases++;if(all.includes(JSON.stringify(c))||all.includes(JSON.stringify(c,null,2)))throw Error('release_private_case');
    if(typeof c.facts?.image==='string'&&c.facts.image&&all.includes(c.facts.image))throw Error('release_private_image');
    if(typeof c.answer==='string'&&c.answer.length>=12&&all.includes(c.answer))throw Error('release_private_text_answer');
   }
  }
 }
 for(const name of ['pr6-batch5-materials.mjs','pr6-batch7-materials.mjs']){
  const {default:materials}=await import(pathToFileURL(resolve(workerSource,'src/formal/banks',name)).href);
  function scan(value){if(typeof value==='string'&&value.length>100){
   if(all.includes(value))throw Error('release_private_material');
   if(/^(?:H4sI|data:[^,]+;base64,)/.test(value)){const data=Buffer.from(value.replace(/^data:[^,]+;base64,/,''),'base64');
    if(data.length>64&&text.some(file=>file.bytes.includes(data)))throw Error('release_private_binary_material');}
  }
   if(value&&typeof value==='object')for(const v of Object.values(value))scan(v);}
  scan(materials);
 }
 if(!cases)throw Error('release_cases_missing');
 const sha256=createHash('sha256');for(const f of text.sort((a,b)=>a.path.localeCompare(b.path))){sha256.update(f.path+'\0');sha256.update(f.bytes);}
 return {files:found.length,privateCases:cases,hits:0,sha256:sha256.digest('hex')};
}
export async function buildSite({output,config,workerSource,source=root}){
 releaseConfig(config);
 // Validate mandatory private-source dependency before writing anything.
 if(!workerSource)throw Error('worker_source_required_for_release_scan');
 const result=await buildBatches({output,config,source});
 if(result.rounds!==124||result.activities!==31)throw Error('release_coverage_incomplete');
 const login=await readFile(join(source,'assets/login.js'),'utf8');
 await writeFile(join(output,'assets/login.js'),`// Fullrev only. Missing configuration stops; there is no legacy client.\nconst YBS=ybsFullrevFacade(typeof YBS_FULLREV_CONFIG==='undefined'?null:YBS_FULLREV_CONFIG);\n`+login.slice(login.indexOf('function ybsFullrevFacade(config)')));
 await copyFile(join(source,'assets/fullrev-read-model.mjs'),join(output,'assets/fullrev-read-model.mjs'));
 for(const page of releasePaths().filter(p=>/^115-g9\/w[0-9]+\/index.html$/.test(p)))await write(page,csp(await readFile(join(output,page),'utf8'),config));
 let dfPage=await readFile(join(output,'115-df/a/index.html'),'utf8');
 dfPage=dfPage.replace(/\/\* ---------- teacher answer mode[\s\S]*?(?=async function importReport)/,'');
 await write('115-df/a/index.html',dfPage);
 for(const page of copiedPages)await write(page,csp(await readFile(join(source,page),'utf8'),config));
 const policy=(await readFile(join(output,'115-g9/u1-01/index.html'),'utf8')).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 for(const [page,mount] of Object.entries(mountedPages))await write(page,shell(policy,mount==='mountGrowth'?'我的成長紀錄':'教師紀錄與匯出',scripts+`<script>YBS.${mount}();</script>`));
 // The existing DF owner page already uses Google owner authorization and fixed report slots.
 // It contains no teacher-code/answer loader. Keep offline report import and print/export features.
 let dfTeacher=csp(await readFile(join(source,'115-df/teacher/index.html'),'utf8'),config)
  .replace(/<div class="gate" id="gate"[^\n]+\n/,'')
  .replace(/async function tapi[\s\S]*?(?=\$\('#files'\))/, '');
 for(const name of ['df-teacher-cloud.js']){
  await write('assets/'+name,(await readFile(join(source,'assets',name),'utf8')).replace(/    \/\/ LEGACY_DF_INIT_START[\s\S]*?    \/\/ LEGACY_DF_INIT_END/,'      throw new Error(\'configuration-pending\');'));
 }
 await write('115-df/teacher/index.html',dfTeacher);
 // DF cloud module is an explicit required resource, listed by releasePaths below.
 // One release tag prevents mixing cached legacy scripts/config with the release tree.
 for(const path of releasePaths().filter(p=>/\.(?:html|m?js|css)$/.test(p))){
  let value=await readFile(join(output,path),'utf8');
  value=value.replace(/((?:assets\/)?[\w./-]+\.(?:m?js|css))\?v=[a-zA-Z0-9]+/g,'$1?v=20261121pr8');
  if(/\.m?js$/.test(path))value=value.replace(/((?:from\s+|import\s*\()\s*['"])(\.[^'"]+\.mjs)(?:\?[^'"]*)?(['"])/g,'$1$2?v=20261121pr8$3');
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
