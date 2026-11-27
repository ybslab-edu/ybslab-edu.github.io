import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,MANAGED_ACTIVITIES} from '../assets/fullrev-activities.mjs';
import {buildBatch1,buildBatches,presentationRounds} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';

test('關卡說明只解碼靜態字串，不執行原活動程式',()=>{
 const source=String.raw`throw Error('不得執行');const rounds=[{name:'合成甲',now:'換行\n引號\'反斜線\\',goal:"\u4e00\x32\u{1f600}",learn:'\t完成'},{name:'合成乙',now:'下一關'}];`;
 assert.deepEqual(presentationRounds(source,['合成甲','合成乙']),[
  {name:'合成甲',now:"換行\n引號'反斜線\\",goal:'一2😀',learn:'\t完成'},
  {name:'合成乙',now:'下一關'}
 ]);
});

for(const [label,activities,build,result] of [['第1批',BATCH1,buildBatch1,{activities:7,rounds:26}],['第1、2批',[...BATCH1,...BATCH2],options=>buildBatches({...options,batches:[1,2]}),{activities:13,rounds:50}],['第1～3批',[...BATCH1,...BATCH2,...BATCH3],options=>buildBatches({...options,batches:[1,2,3]}),{activities:19,rounds:74}],['第4批',BATCH4,options=>buildBatches({...options,batches:[4]}),{activities:5,rounds:20}],['第1～4批',[...BATCH1,...BATCH2,...BATCH3,...BATCH4],options=>buildBatches({...options,batches:[1,2,3,4]}),{activities:24,rounds:94}],['第5批',BATCH5,options=>buildBatches({...options,batches:[5]}),{activities:3,rounds:12}],['第1～5批',[...BATCH1,...BATCH2,...BATCH3,...BATCH4,...BATCH5],o=>buildBatches({...o,batches:[1,2,3,4,5]}),{activities:27,rounds:106}],['第6批',BATCH6,o=>buildBatches({...o,batches:[6]}),{activities:2,rounds:8}],['第1～6批',[...BATCH1,...BATCH2,...BATCH3,...BATCH4,...BATCH5,...BATCH6],o=>buildBatches({...o,batches:[1,2,3,4,5,6]}),{activities:29,rounds:114}],['第7批',BATCH7,o=>buildBatches({...o,batches:[7]}),{activities:1,rounds:4}],['第1～7批',MANAGED_ACTIVITIES,o=>buildBatches({...o,batches:[1,2,3,4,5,6,7]}),{activities:30,rounds:118}]])test(`PR6 ${label}切換產物僅含外殼、公開 renderer 與既有轉址；來源及 false 開關不變`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-build-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const before=await Promise.all(activities.map(a=>readFile(new URL('../'+a.file,import.meta.url),'utf8')));
  const output=join(dir,'public');assert.deepEqual(await build({output,config}),result);
  await assert.rejects(build({output,config}),/output_must_not_exist/);
  for(const a of activities) {
    const html=await readFile(join(output,a.file),'utf8');
    assert.match(html,new RegExp(`"week":${a.activity}`));assert.ok(html.includes(config.workerOrigin));
    assert.match(html,new RegExp(`frame-src https://${config.firebase.projectId}.firebaseapp.com`));
    const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.ok(policy.split(';').find(s=>s.trim().startsWith('script-src ')).split(/\s+/).includes('https://apis.google.com'),a.file);
    assert.doesNotMatch(html,/const ROUNDS|gen\(|check\(|fill:|teacher\.js|lock\.js|shell\.js|warmup|TEACHER|sol:|ans:/);
    assert.match(html,/YBS.mountActivity/);
  }
  const copied=await readdir(join(output,'assets'));
  for(const forbidden of ['teacher.js','lock.js','shell.js','warmup.js','warmup-bank.js','codec.js','pr6-batch1.mjs','pr6-batch2.mjs','pr6-batch3.mjs','pr6-batch4.mjs','platform-questions.mjs','outcome-questions.mjs','pr6-batch5.mjs','pr6-batch5-materials.mjs','performance-questions.mjs','pr6-batch6.mjs','pr6-batch7.mjs','pr6-batch7-materials.mjs','photo-questions.mjs'])assert.ok(!copied.includes(forbidden));
  for(const name of copied.filter(f=>/\.(?:mjs|js)$/.test(f))) {
    const text=await readFile(join(output,'assets',name),'utf8');assert.doesNotMatch(text,/ybslab:teacher|ybslab-teacher:|privateQuestions|privateData|const DEV=|const ISAI=/);
    for(const [,specifier] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]((?:\.\/|\/assets\/)[^'"]+)['"]/g)){
      const target=new URL(specifier,new URL('assets/'+name,'file://'+output+'/'));
      target.search='';await assert.doesNotReject(readFile(target),`${name} 缺少公開相依模組 ${specifier}`);
    }
  }
  assert.match(await readFile(new URL('../assets/fullrev-config.js',import.meta.url),'utf8'),/enabled: false/);
  assert.deepEqual(await Promise.all(activities.map(a=>readFile(new URL('../'+a.file,import.meta.url),'utf8'))),before);
  const redirects=(await readdir(new URL('../115-g9/',import.meta.url))).filter(n=>/^w\d+$/.test(n));
  for(const dir of redirects)assert.equal(await readFile(join(output,'115-g9',dir,'index.html'),'utf8'),await readFile(new URL(`../115-g9/${dir}/index.html`,import.meta.url),'utf8'));
});
