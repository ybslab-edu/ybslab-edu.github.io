import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/teacher-export.mjs';
for(const raw of ['{"1-999-1":{"mask":3}}','{','null','[]',''])test('舊資料原值備份，不解析、覆寫或刪除：'+raw,async()=>{
  const stored=new Map([['it9:grades',raw],['it9:sizes','{"999":3}'],['other','keep']]),before=new Map(stored),h=setup({stored});
  assert.equal(h.get('legacy-panel').hidden,false);assert.match(h.get('legacy-msg').textContent,/未刪除/);
  h.get('b-legacy-export').onclick();
  assert.deepEqual(JSON.parse(await h.blobs[0].text()),{'it9:grades':raw,'it9:sizes':'{"999":3}'});
  assert.deepEqual(stored,before);assert.ok(h.storageCalls.every(c=>c.method==='getItem'));
  assert.equal(h.reopen().get('legacy-panel').hidden,false);
});
test('無舊鍵不顯示；儲存區封鎖及下載失敗明確提示',()=>{
  assert.equal(setup().get('legacy-panel').hidden,true);
  const blocked=setup({storageErrors:{getItem:true}});assert.match(blocked.get('legacy-msg').textContent,/無法讀取/);assert.equal(blocked.get('b-legacy-export').disabled,true);
  const h=setup({stored:new Map([['it9:grades','{']])});h.evaluate('URL.createObjectURL=()=>{throw Error("synthetic")}');h.get('b-legacy-export').onclick();assert.match(h.get('legacy-msg').textContent,/下載失敗.*未刪除/);assert.equal(h.stored.get('it9:grades'),'{');
});
