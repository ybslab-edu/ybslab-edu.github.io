// PR8 切換用的已納管批次公開產物；只產生外殼與 renderer，絕不複製舊活動程式。
// 本批產物用於驗收，所有批次完成前不得取代整站發布目錄。
import {readFile,writeFile,mkdir,readdir,copyFile,stat} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8} from '../assets/fullrev-activities.mjs';
import {checkConfig} from '../assets/fullrev-client.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export const buildBatch1=options=>buildBatches({...options,batches:[1]});
export async function buildBatches({output,config,source=root,batches=[1,2,3,4,5,6,7,8]}) {
  if(!Array.isArray(batches)||!batches.length||batches.some(n=>![1,2,3,4,5,6,7,8].includes(n))||new Set(batches).size!==batches.length)throw Error('invalid_batches');
  const combined=new Map();
  for(const a of batches.flatMap(n=>[null,BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8][n])){
    const key=(a.course||'115-g9')+':'+a.activity,previous=combined.get(key);
    combined.set(key,{...a,managed:[...new Set([...(previous?.managed||[]),...a.managed])]});
  }
  const activities=[...combined.values()];
  checkConfig(config);output=resolve(output);source=resolve(source);
  if(output===source||!relative(source,output).startsWith('..'))throw Error('output_must_be_outside_source');
  if(await stat(output).catch(()=>null))throw Error('output_must_not_exist');
  const assets=['fullrev-client.mjs','fullrev-df.mjs','df-report.js','fullrev-recording.mjs','fullrev-ui.mjs','fullrev-progress.mjs','fullrev-activities.mjs','fullrev-outcomes.mjs','fullrev-performance.mjs','fullrev-photos.mjs',
    'login.js','xp.js','shell.css','favicon.svg','vendor/xlsx-0.20.3.full.min.js'];
  await mkdir(join(output,'assets'),{recursive:true});
  for(const asset of assets){await mkdir(dirname(join(output,'assets',asset)),{recursive:true});await copyFile(join(source,'assets',asset),join(output,'assets',asset));}
  const loginFile=join(output,'assets/login.js');
  await writeFile(loginFile,(await readFile(loginFile,'utf8')).replace(/(?:fullrev-client|fullrev-activities|fullrev-ui)\.mjs\?v=[a-z0-9]+/g,match=>match.replace(/v=[a-z0-9]+$/,'v=20261120b8')));
  await writeFile(join(output,'assets/fullrev-config.js'),`const YBS_FULLREV_CONFIG=Object.freeze(${JSON.stringify(config)});\n`);
  // 僅擴充這份切換產物的精確目的地主機，不修改開關關閉時的 CSP。
  for(const a of activities) {
    const original=await readFile(join(source,a.file),'utf8');
    const csp=original.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    if(!csp)throw Error('csp_missing');
    const policy=csp.split(';').map(s=>s.trim()).filter(Boolean).map(s=>s.startsWith('connect-src ')?`${s} ${config.workerOrigin}`:
      s.startsWith('frame-src ')?`frame-src https://${config.firebase.projectId}.firebaseapp.com`:s).join('; ');
    const scripts=['fullrev-config.js','login.js'].map(name=>`<script src="/assets/${name}?v=20261120b8"></script>`).join('\n');
    const cfg={week:a.activity,course:a.course||'115-g9',unit:a.unit,title:a.title,rounds:a.rounds.map(name=>({name}))};
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
