import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BATCH6} from '../assets/fullrev-activities.mjs';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';
test('PR6 第 6 批沿用排卡活動 ID、關名、兩組及舊演出來源',async()=>{
  for(const a of BATCH6){const html=await readFile(new URL('../'+a.file,import.meta.url),'utf8');assert.match(html,new RegExp(`WEEK=${a.activity}`));for(const name of a.rounds)assert.ok(html.includes(name));assert.match(html,/confirmations:1,manualAttempt:true/);}
});
test('PR6 第 6 批切換產物不含指令、解答、測資、判題模擬器或私有版本',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const {default:banks}=await import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,'src/formal/banks/pr6-batch6.mjs')).href);
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-b6-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'public');await buildBatches({output,config});
  async function scan(dir){const texts=[];for(const f of await readdir(dir,{withFileTypes:true})){const path=join(dir,f.name);if(f.isDirectory())texts.push(...await scan(path));else{assert.doesNotMatch(f.name,/\.map$|pr6-batch\d|(?:performance|ai|platform|outcome)-questions|fixture|\.test\./);texts.push(await readFile(path,'utf8'));}}return texts;}
  const text=(await scan(output)).join('\n');
  for(const [key,bundle] of Object.entries(banks)){
    assert.ok(!text.includes(key.split(':')[1]));
    for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){
      for(const data of [c,c.facts,c.facts.actions,c.facts.cells||c.facts.machine])assert.ok(!text.includes(JSON.stringify(data)));
    }
  }
  assert.doesNotMatch(text,/function runTea|function runMemory|checkPerformanceAnswer|checkAnswer\(|sol:|"plan"\s*:/);
  const login=await readFile(join(output,'assets/login.js'),'utf8');assert.match(login,/fullrev-ui\.mjs\?v=20261120b8/);
});
