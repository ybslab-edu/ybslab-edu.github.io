import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,key,packet,settle} from './fixtures/guest-firebase.mjs';

test('待送查詢唯讀：目前帳號、送完、登出',async()=>{
  let release;
  const env=setup({write:()=>new Promise(resolve=>{release=resolve;})});
  await env.account();
  assert.equal(env.api.hasPending(),false);
  const sent=env.api.submit(packet());await settle();
  const storage=JSON.stringify([...env.session]);
  assert.equal(env.api.hasPending(),true);
  assert.equal(JSON.stringify([...env.session]),storage);
  assert.equal(env.calls.length,1,'查詢不另外上傳');
  release();await sent;
  assert.equal(env.api.hasPending(),false);
  await env.api.logout();
  assert.equal(env.api.hasPending(),false);
});

test('班座待送查詢唯讀，不整理收據或改寫儲存',async()=>{
  const env=setup();
  await env.api.guest({cls:999,seat:1});
  const data={queue:[packet({cls:'999'})],receipts:Array.from({length:205},(_,i)=>({synthetic:i}))};
  env.stored.set(key,JSON.stringify(data));
  const before=JSON.stringify([...env.stored]);
  assert.equal(env.api.hasPending(),true);
  assert.equal(JSON.stringify([...env.stored]),before);
  assert.equal(env.calls.length,0);
  env.stored.set(key,JSON.stringify({...data,queue:[packet({cls:'999',seat:2})]}));
  assert.equal(env.api.hasPending(),false,'其他班座待送不算目前身分');
  env.stored.set(key,JSON.stringify({...data,queue:[]}));
  assert.equal(env.api.hasPending(),false);
});
