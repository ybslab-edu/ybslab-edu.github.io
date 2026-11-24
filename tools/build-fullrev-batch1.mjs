// PR8 切換用的已納管批次公開產物；只產生外殼與 renderer，絕不複製舊活動程式。
// 本批產物用於驗收，所有批次完成前不得取代整站發布目錄。
import {readFile,writeFile,mkdir,readdir,copyFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8} from '../assets/fullrev-activities.mjs';
import {checkConfig} from '../assets/fullrev-client.mjs';
import {fullrevCsp} from './fullrev-csp.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
// 批次驗收與正式產物共用同一份公開模組清單。
export const PUBLIC_ACTIVITY_ASSETS=Object.freeze(['fullrev-answer-ui.mjs','fullrev-work-store.mjs','fullrev-guest.mjs','fullrev-client.mjs','fullrev-read-model.mjs','fullrev-progress-cache.mjs','fullrev-df.mjs','df-report.js','fullrev-recording.mjs','fullrev-ui.mjs','fullrev-shell.mjs','fullrev-teacher-view.mjs','fullrev-student-support.mjs','fullrev-shell.css','fullrev-progress.mjs','fullrev-activities.mjs','fullrev-outcomes.mjs','fullrev-performance.mjs','fullrev-photos.mjs',
 'login.js','xp.js','shell.css','favicon.svg','vendor/xlsx-0.20.3.full.min.js']);
// 僅解碼靜態字串，避免為每個欄位啟動 VM watchdog，在整套驗收並行時耗盡排程。
function presentationText(literal){
 const escapes={b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','0':'\0'};
 return literal.slice(1,-1).replace(/\\(u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|\r\n|[\s\S])/g,(_,escape)=>{
  if(escape.startsWith('u{'))return String.fromCodePoint(parseInt(escape.slice(2,-1),16));
  if(/^[ux][\da-fA-F]+$/.test(escape))return String.fromCharCode(parseInt(escape.slice(1),16));
  if(escape==='\n'||escape==='\r'||escape==='\r\n')return '';
  return escapes[escape]??escape;
 });
}
// 只取舊頁各關的靜態說明字串；不執行活動腳本或複製 gen/check/fill。
export function presentationRounds(original,names){
 const fields=[...original.matchAll(/\b(name|now|goal|learn)\s*:\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")\s*(?=[,}])/g)];
 const values=fields.map(field=>[field[1],presentationText(field[2])]);
 return names.map(name=>{
  let active=false;const info={name};
  for(const [key,value] of values){
   if(key==='name'){if(active)break;active=value===name;}
   else if(active)info[key]=value;
  }
  return info;
 });
}
export const buildBatch1=options=>buildBatches({...options,batches:[1]});
export async function buildBatches({output,config,source=root,batches=[1,2,3,4,5,6,7,8],courses=['115-g9','115-df']}) {
  if(!Array.isArray(batches)||!batches.length||batches.some(n=>![1,2,3,4,5,6,7,8].includes(n))||new Set(batches).size!==batches.length)throw Error('invalid_batches');
  const combined=new Map();
  for(const a of batches.flatMap(n=>[null,BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8][n])){
    const key=(a.course||'115-g9')+':'+a.activity,previous=combined.get(key);
    combined.set(key,{...a,managed:[...new Set([...(previous?.managed||[]),...a.managed])]});
  }
  const activities=[...combined.values()].filter(a=>courses.includes(a.course||'115-g9'));
  checkConfig(config);output=resolve(output);source=resolve(source);
  const outside=(base,path)=>{const r=relative(base,path);return r==='..'||r.startsWith('..'+sep);};
  if(!outside(source,output))throw Error('output_must_be_outside_source');
  let parent=dirname(output);while(!await stat(parent).catch(()=>null))parent=dirname(parent);
  if(!outside(await realpath(source),await realpath(parent)))throw Error('output_must_be_outside_source');
  if(await stat(output).catch(()=>null))throw Error('output_must_not_exist');
  await mkdir(join(output,'assets'),{recursive:true});
  for(const asset of PUBLIC_ACTIVITY_ASSETS){await mkdir(dirname(join(output,'assets',asset)),{recursive:true});await copyFile(join(source,'assets',asset),join(output,'assets',asset));}
  const loginFile=join(output,'assets/login.js');
  await writeFile(loginFile,(await readFile(loginFile,'utf8')).replace(/(?:fullrev-client|fullrev-activities|fullrev-ui)\.mjs\?v=[a-z0-9]+/g,match=>match.replace(/v=[a-z0-9]+$/,'v=20261120b8')));
  await writeFile(join(output,'assets/fullrev-config.js'),`const YBS_FULLREV_CONFIG=Object.freeze(${JSON.stringify(config)});\n`);
  // 僅擴充這份切換產物的精確目的地主機，不修改開關關閉時的 CSP。
  for(const a of activities) {
    const original=await readFile(join(source,a.file),'utf8');
    const csp=original.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    if(!csp)throw Error('csp_missing');
    const policy=fullrevCsp(csp,config);
    const scripts=['fullrev-config.js','login.js'].map(name=>`<script src="/assets/${name}?v=20261120b8"></script>`).join('\n');
    const cfg={week:a.activity,course:a.course||'115-g9',unit:a.unit,title:a.title,rounds:presentationRounds(original,a.rounds)};
    // 不保留舊 inline script、gen/check/fill、題庫、暖身答案、教師雜湊或遮罩。
    let html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${a.title}｜YBS Lab</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/shell.css?v=20261116fb"></head><body>${scripts}<script>YBS.mountActivity(${JSON.stringify(cfg)});</script></body></html>\n`;
    if(a.course==='115-df'){
      html=original.replace(/<script src="[^" ]*assets\/(?:teacher|lock)\.js[^" ]*"><\/script>/g,'')
        .replace(/(<script id="(?:pub|enc-b2|enc-rv)" type="application\/json">)[\s\S]*?<\/script>/g,'$1null</script>')
        .replace(/(<script id="ans" type="application\/json">)[\s\S]*?<\/script>/g,'$1null</script>')
        .replace(/<script>\s*"use strict";/,'<script type="module">await YBS.loadDFContent();\n"use strict";')
        .replace(csp,policy).replace(/(?:fullrev-config|login)\.js\?v=[a-z0-9]+/g,m=>m.replace(/v=[a-z0-9]+$/,'v=20261120b8'));
    }
    await mkdir(dirname(join(output,a.file)),{recursive:true});await writeFile(join(output,a.file),html);
  }
  // 舊 wNN 轉址逐字保留；活動 ID 與資料夾改名無關。
  for(const dir of await readdir(join(source,'115-g9'),{withFileTypes:true}))if(dir.isDirectory()&&/^w\d+$/.test(dir.name)) {
    await mkdir(join(output,'115-g9',dir.name),{recursive:true});await copyFile(join(source,'115-g9',dir.name,'index.html'),join(output,'115-g9',dir.name,'index.html'));
  }
  // 成長／XP 仍從 PR5 的有效集合與既有活動登記處計算。
  await copyFile(join(source,'assets/activities.js'),join(output,'assets/activities.js'));
  await copyFile(join(source,'assets/curriculum.js'),join(output,'assets/curriculum.js'));
  for(const a of activities) {
    const file=join(output,a.file);let html=await readFile(file,'utf8');
    // DF 保留既有課綱 script；同份 classic script 再載入會重複宣告 N／DESC。
    const shared=['curriculum.js?v=20261110a','activities.js?v=20261105m'].filter(asset=>
      !new RegExp('<script\\b[^>]*\\bsrc="[^" ]*/'+asset.split('?')[0].replace('.', '\\.')+'(?:\\?[^" ]*)?"').test(html));
    html=html.replace('<body>','<body>'+shared.map(asset=>`<script src="/assets/${asset}"></script>`).join(''));await writeFile(file,html);
  }
  await writeFile(join(output,'index.html'),'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>PR6 已納管批次驗收</title><h1>已納管批次驗收</h1>'+activities.map(a=>`<p><a href="/${a.file}">${a.title}</a></p>`).join('')+'</html>');
  return {activities:activities.length,rounds:activities.reduce((sum,a)=>sum+a.managed.length,0)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--config'||args[2]!=='--out')throw Error('usage: node tools/build-fullrev-batch1.mjs --config /path/public-config.json --out /tmp/new-output');
  const config=JSON.parse(await readFile(resolve(args[1]),'utf8'));
  console.log(await buildBatches({output:args[3],config}));
}
