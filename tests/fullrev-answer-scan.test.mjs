import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {scanPrivateAnswers} from '../tools/scan-private-answers.mjs';
import {buildSite} from '../tools/build-fullrev-site.mjs';
import {config} from './fixtures/fullrev.mjs';
test('release command always requires private sources even when CI acceptance is skipped',async()=>{
 await assert.rejects(buildSite({output:'/tmp/unused-pr8',config:{...config,readModelModule:'/assets/fullrev-read-model.mjs'}}),/worker_source_required/);
});
test('normalized private arrays catch numeric/string elements, whitespace and serialized arrays',()=>{
 const answers=[[17,29,43,61],[7,19],'短答案',37];
 for(const value of ['const leaked=[17,29,43,61]','const leaked=["17", "29", "43", "61"]',"const leaked=['17', '29', '43', '61']",'const leaked="[17,29,43,61]"','const answers=[7,19]','const leaked="短答案"','const answer=37']){
  assert.throws(()=>scanPrivateAnswers(value,answers),/release_private/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('const size=[7,19]; const seats=[1,2,3]; const title="第 37 題"; const label="短";',answers));
});
test('static template literals decode escapes and serialized arrays without evaluating interpolation',()=>{
 const answers=['合成短答案', '含`反引號${文字}',[17,29,43,61]];
 for(const source of ['const leaked=`合成短答案`;','const leaked=`\\u5408成短答案`;','const leaked=`含\\`反引號\\${文字}`;','const leaked=`[17,29,43,61]`;','const leaked=[`17`,`29`,`43`,`61`];']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('const label=`合成短答案${suffix}`;',answers));
});
test('HTML text and quoted/unquoted attributes decode entities and compare complete values',()=>{
 const answers=['合成短答案','含<&"字'];
 for(const source of ['<p> 合成短答案 </p>','<p title="合成短答案">提示</p>',"<p title='合成短答案'>提示</p>",'<input value=合成短答案>','<p>&#x5408;&#25104;短答案</p>','<input title="含&lt;&amp;&quot;字">']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('<p>請輸入合成短答案</p><input title="合成短答案提示">',answers));
});
test('all nine private string answer types are blocked in templates, HTML text and attributes',async t=>{
 const workerSource=process.env.YBS_WORKER_SOURCE;
 if(!workerSource&&process.env.CI){t.skip('略過：需私有來源，由 Console 發布前在本機執行');return;}
 assert.ok(workerSource,'本機答案掃描驗收需設定 YBS_WORKER_SOURCE');
 const answers=[];
 for(let n=1;n<=8;n++){
  const {default:banks}=await import(pathToFileURL(resolve(workerSource,`src/formal/banks/pr6-batch${n}.mjs`)).href);
  for(const [key,bundle] of Object.entries(banks))if(!key.startsWith('115-df:'))for(const bank of Object.values(bundle.rounds))for(const c of bank.cases||[])if(typeof c.answer==='string')answers.push(c.answer);
 }
 assert.equal(new Set(answers).size,9);assert.equal(answers.length,9);
 const escapeHTML=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const [index,answer] of answers.entries())await t.test(`private string type ${index+1}`,()=>{
  const template='const leaked=`'+answer.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${')+'`;';
  // Never include private answer contents in assertion diagnostics.
  for(const source of [template,'<p>'+escapeHTML(answer)+'</p>','<input title="'+escapeHTML(answer)+'">'])assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/);
  assert.doesNotThrow(()=>scanPrivateAnswers('const label=`請輸入答案`; <button title="下一組">開始作答</button><p>尚未完成</p>',answers));
 });
});
