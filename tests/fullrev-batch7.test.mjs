import {workerSource,workerSkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {BATCH7} from '../assets/fullrev-activities.mjs';
import {quantize} from '../assets/fullrev-photos.mjs';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';
test('PR6 第 7 批保留活動 ID、原雙照片來源；量化與原頁一致',async()=>{
  const a=BATCH7[0],html=await readFile(new URL('../'+a.file,import.meta.url),'utf8');assert.match(html,/WEEK=3/);assert.match(html,/confirmations:1,manualAttempt:true/);for(const name of a.rounds)assert.ok(html.includes(name));
  const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function quant('));
  const ctx=vm.createContext({});vm.runInContext(script.slice(script.indexOf('function quant('),script.indexOf('const cache='))+';globalThis.q=quant;',ctx);
  for(const bits of [1,3,6,12,24])for(let k=0;k<300;k++){const px=[k*.9%256,k*3.1%256,k*7.3%256];assert.deepEqual(quantize(px,bits),JSON.parse(JSON.stringify(ctx.q(px,bits))));}
});
test('PR6 第 7 批切換產物無私有照片、答案、門檻、產生器、教師碼或遮罩',{skip:workerSkip},async t=>{
  const load=p=>import(pathToFileURL(resolve(workerSource,p)).href),[{default:banks},{default:materials}]=await Promise.all([load('src/formal/banks/pr6-batch7.mjs'),load('src/formal/banks/pr6-batch7-materials.mjs')]);
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-b7-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'public');await buildBatches({output,config});
  const scan=async dir=>{let all='';for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())all+=await scan(path);else{assert.doesNotMatch(e.name,/\.map$|pr6-batch\d|(?:photo|performance|outcome|platform|ai)-questions|fixture|\.test\./);all+=await readFile(path,'utf8');}}return all;};
  const text=await scan(output);assert.doesNotMatch(text,/function drawIdol|function drawLot|function lotPlan|checkPhotoAnswer|function judge\(|sol:|"minimum"\s*:|"identity"\s*:|teacher\.js|lock\.js|阿晴|莓莓|米米|柚柚|海海|小葡/);
  for(const [key,bundle] of Object.entries(banks)){assert.ok(!text.includes(key.split(':')[1]));for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){assert.ok(!text.includes(JSON.stringify(c)));assert.ok(!text.includes(c.facts.image));}}
  for(const material of Object.values(materials))for(const [n,gzip] of material)assert.ok(!text.includes(gzip));
  assert.match(await readFile(join(output,'assets/login.js'),'utf8'),/fullrev-ui\.mjs\?v=20261120b8/);
});
