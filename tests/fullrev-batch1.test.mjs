import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BATCH1} from '../assets/fullrev-activities.mjs';
import {buildBatch1} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';

test('PR6 切換產物僅含 26 關外殼、公開 renderer 與既有轉址；來源及 false 開關不變',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-build-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const before=await Promise.all(BATCH1.map(a=>readFile(new URL('../'+a.file,import.meta.url),'utf8')));
  const output=join(dir,'public');assert.deepEqual(await buildBatch1({output,config}),{activities:7,rounds:26});
  await assert.rejects(buildBatch1({output,config}),/output_must_not_exist/);
  for(const a of BATCH1) {
    const html=await readFile(join(output,a.file),'utf8');
    assert.match(html,new RegExp(`"week":${a.activity}`));assert.ok(html.includes(config.workerOrigin));
    assert.match(html,new RegExp(`frame-src https://${config.firebase.projectId}.firebaseapp.com`));
    assert.doesNotMatch(html,/const ROUNDS|gen\(|check\(|fill:|teacher\.js|lock\.js|shell\.js|warmup|TEACHER|sol:|ans:/);
    assert.match(html,/YBS.mountActivity/);
  }
  const copied=await readdir(join(output,'assets'));
  for(const forbidden of ['teacher.js','lock.js','shell.js','warmup.js','warmup-bank.js','codec.js','pr6-batch1.mjs'])assert.ok(!copied.includes(forbidden));
  for(const name of copied.filter(f=>/\.(?:mjs|js)$/.test(f))) {
    const text=await readFile(join(output,'assets',name),'utf8');assert.doesNotMatch(text,/ybslab:teacher|ybslab-teacher:|privateQuestions|privateData|const DEV=|const ISAI=/);
  }
  assert.match(await readFile(new URL('../assets/fullrev-config.js',import.meta.url),'utf8'),/enabled: false/);
  assert.deepEqual(await Promise.all(BATCH1.map(a=>readFile(new URL('../'+a.file,import.meta.url),'utf8'))),before);
  const redirects=(await readdir(new URL('../115-g9/',import.meta.url))).filter(n=>/^w\d+$/.test(n));
  for(const dir of redirects)assert.equal(await readFile(join(output,'115-g9',dir,'index.html'),'utf8'),await readFile(new URL(`../115-g9/${dir}/index.html`,import.meta.url),'utf8'));
});
