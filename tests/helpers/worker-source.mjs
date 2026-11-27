import {statSync} from 'node:fs';
import {resolve} from 'node:path';

export const workerSource=process.env.YBS_WORKER_SOURCE;
const missing='缺少 ClassScore Worker：請設定 YBS_WORKER_SOURCE 指向 workers/ybs-grader；本機不自動下載，CI 不允許跳過核心測試。';
if(!workerSource&&process.env.CI)throw new Error(missing);
if(workerSource){
  for(const file of ['src/formal/index.mjs','src/formal-contract.mjs','src/memory-adapter.mjs','tests/formal-fixtures.mjs']){
    try{if(!statSync(resolve(workerSource,file)).isFile())throw new Error('not a file');}
    catch{throw new Error(`YBS_WORKER_SOURCE 無效或不完整：缺少 ${file}`);}
  }
}
export const workerSkip=workerSource?false:missing;
