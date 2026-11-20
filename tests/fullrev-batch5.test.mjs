import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BATCH5} from '../assets/fullrev-activities.mjs';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';
test('PR6 第 5 批沿用現行 11/19 關名及 ID，關閉模式不改頁面與素材',async()=>{
  for(const a of BATCH5){const html=await readFile(new URL('../'+a.file,import.meta.url),'utf8');assert.match(html,new RegExp(`week:${a.activity}`));for(const name of a.rounds)assert.ok(html.includes(name));assert.ok(html.includes('未實際操作'));}
});
test('PR6 第 5 批私有題面、答案、素材、判題與版本不在公開產物',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const load=file=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,'src/formal/banks',file)).href);
  const {default:banks}=await load('pr6-batch5.mjs'),{default:materials}=await load('pr6-batch5-materials.mjs');
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-batch5-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'public');await buildBatches({output,config});
  async function scan(dir){const texts=[];for(const f of await readdir(dir,{withFileTypes:true})){
    assert.doesNotMatch(f.name,/\.map$|pr6-batch\d|(?:ai|platform|outcome)-questions|fixture|\.test\.|materials|\.(?:pdf|zip|png|jpg)$/);
    const p=join(dir,f.name);if(f.isDirectory())texts.push(...await scan(p));else texts.push(await readFile(p,'utf8'));
  }return texts;}
  const text=(await scan(output)).join('\n');
  for(const [key,bundle] of Object.entries(banks)){
    assert.ok(!text.includes(key.split(':')[1]));
    for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){assert.ok(!text.includes(JSON.stringify(c)));assert.ok(!text.includes(JSON.stringify(c.facts)));assert.ok(!text.includes(JSON.stringify(c.answer)));}
  }
  for(const m of Object.values(materials)){assert.ok(!text.includes(m.gzip));assert.ok(!text.includes(m.digest));}
  assert.doesNotMatch(text,/MUSIC-1[1-8]|qOneExpected|qExpected|qTwoExpected|qRun\(|qBits\(/);
  const login=await readFile(join(output,'assets/login.js'),'utf8');assert.match(login,/fullrev-activities\.mjs\?v=20261120b8/);
});
