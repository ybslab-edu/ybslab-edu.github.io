import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import {snapshotReleaseSource} from './helpers/release-source.mjs';
import {config as fixtureConfig} from './fixtures/fullrev.mjs';
const exec=promisify(execFile),builder=fileURLToPath(new URL('../tools/build-fullrev-site.mjs',import.meta.url));

test('offline dry-runs: identical inputs give identical release/tree; one source or public flag changes the release',async t=>{
 if(workerCISkip){t.skip(workerCISkip);return;}
 assert.ok(workerSource,'本機版本驗收需設定 YBS_WORKER_SOURCE');
 const dir=await mkdtemp('/tmp/ybs-release-version-');t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=await snapshotReleaseSource(join(dir,'source'));
 const config={...fixtureConfig,answerTickets:true,readModelModule:'/assets/fullrev-read-model.mjs'},configPath=join(dir,'public.json');
 const build=async name=>{
  const {stdout}=await exec(process.execPath,[builder,'dry-run','--out',join(dir,name),'--config',configPath,'--worker-source',workerSource,'--source',source],{maxBuffer:1024*1024});
  return JSON.parse(stdout);
 };
 await writeFile(configPath,JSON.stringify(config));const a=await build('a');
 await writeFile(configPath,JSON.stringify(Object.fromEntries(Object.entries(config).reverse())));const b=await build('b');
 assert.match(a.releaseId,/^[a-f0-9]{64}$/);assert.equal(a.releaseId,b.releaseId);assert.deepEqual(a.scan,b.scan);
 await appendFile(join(source,'assets/fullrev-read-model.mjs'),'\n// synthetic release change\n');const c=await build('c');
 assert.notEqual(a.releaseId,c.releaseId);assert.notEqual(a.scan.sha256,c.scan.sha256);
 await writeFile(configPath,JSON.stringify({...config,answerTickets:false}));const d=await build('d');
 assert.notEqual(c.releaseId,d.releaseId);
 for(const result of [a,b,c,d]){
  const resource=result.scan.resources.find(r=>r.path==='assets/fullrev-read-model.mjs');
  assert.equal(resource.url,`/assets/fullrev-read-model.mjs?v=${result.releaseId}`);
  assert.ok(result.scan.resources.some(r=>r.url===`/assets/shell.css?v=${result.releaseId}`));
  assert.equal(result.scan.hits,0);
 }
 t.diagnostic(`dry-run A=${a.releaseId}\ndry-run B=${b.releaseId}\none-file C=${c.releaseId}\nconfig D=${d.releaseId}\ntree A=B: ${a.scan.sha256}; files=${a.scan.files}; privateCases=${a.scan.privateCases}; hits=${a.scan.hits}; resourceURLs=${a.scan.resources.length}`);
});
