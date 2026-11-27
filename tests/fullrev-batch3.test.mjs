import {workerSource,workerSkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';

test('PR6 第 3 批私有包、版本與文字答案不在任何公開產物內',{skip:workerSkip},async t=>{
  const {default:banks}=await import(pathToFileURL(resolve(workerSource,'src/formal/banks/pr6-batch3.mjs')).href);
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-batch3-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const output=join(dir,'public');await buildBatches({output,config});
  async function scan(dir){const texts=[];for(const f of await readdir(dir,{withFileTypes:true})){
    const p=join(dir,f.name);if(f.isDirectory())texts.push(...await scan(p));else{
      assert.doesNotMatch(f.name,/\.map$|pr6-batch[123]\.mjs|ai-questions\.mjs|fixture|\.test\./);
      texts.push(await readFile(p,'utf8'));
    }
  }return texts;}
  const publicText=(await scan(output)).join('\n');
  for(const [key,bundle] of Object.entries(banks)) {
    assert.ok(!publicText.includes(key.split(':')[1]),'不可包含私有題庫版本或題庫');
    for(const bank of Object.values(bundle.rounds))for(const c of bank.cases) {
      assert.ok(!publicText.includes(JSON.stringify(c)),'不可包含私有實例');
      assert.ok(!publicText.includes(JSON.stringify(c.facts)),'不可包含受保護題面');
      if(typeof c.answer==='string')assert.ok(!publicText.includes(c.answer),'不可包含私有文字答案');
    }
  }
});
