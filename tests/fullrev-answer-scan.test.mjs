import {workerSource} from './helpers/worker-source.mjs';
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
test('HTML answer values normalize whitespace and Unicode in text and each attribute form',()=>{
 const answers=['SYNTH-ANSWER','合成 答案'];
 const cases=[
  ['leading text','合成\n\t答案<section>公開提示</section>'],
  ['trailing text','<section>公開提示</section> 合成\r\n答案 '],
  ['nested text node','<main><p>合成&nbsp;&#9;答案</p></main>'],
  ['double-quoted attribute','<input title=" 合成\n\t答案 ">'],
  ['single-quoted attribute',"<input title='合成&#160;答案'>"],
  ['unquoted encoded whitespace','<input value=合成&#x20;答案>'],
  ['mixed-case tag and attribute','<INPUT TITLE = "ＳＹＮＴＨ－ＡＮＳＷＥＲ">'],
  ['later attribute','<input aria-label="公開提示" data-value="合成 答案" disabled>'],
  ['unquoted value before another attribute','<input value=SYNTH-ANSWER disabled>']
 ];
 for(const [name,source] of cases)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/,name);
});
test('HTML named and numeric entities expose complete answers with punctuation',()=>{
 const answers=['合成<&>"\'答案'];
 const cases=[
  ['named entities in text','<p>合成&lt;&amp;&gt;&quot;&apos;答案</p>'],
  ['decimal entities in text','<p>合成&#60;&#38;&#62;&#34;&#39;答案</p>'],
  ['hexadecimal entities in text','<p>合成&#x3C;&#x26;&#x3E;&#x22;&#x27;答案</p>'],
  ['double-quoted attribute','<input value="合成&lt;&amp;&gt;&quot;&apos;答案">'],
  ['single-quoted attribute',"<input value='合成&lt;&amp;&gt;&quot;&apos;答案'>"],
  ['unquoted attribute','<input value=合成&#60;&#38;&#62;&#34;&#39;答案>'],
  ['literal angle brackets in quoted attribute','<input value="合成<&>&quot;\'答案">']
 ];
 for(const [name,source] of cases)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/,name);
});
test('similar public HTML values remain allowed and entities decode only once',()=>{
 const answers=['SYNTH-ANSWER','合成 答案','合成<答案'];
 const cases=[
  ['text prefix','<p>請輸入SYNTH-ANSWER</p>'],
  ['text suffix','<p>SYNTH-ANSWER提示</p>'],
  ['double-quoted attribute prefix','<input title="請輸入SYNTH-ANSWER">'],
  ['single-quoted attribute suffix',"<input title='SYNTH-ANSWER提示'>"],
  ['unquoted attribute suffix','<input value=SYNTH-ANSWER提示>'],
  ['case difference','<p>synth-answer</p>'],
  ['missing internal space','<p>合成答案</p>'],
  ['different character','<p>SYNTH-ANSWERS</p>'],
  ['double-encoded text','<p>合成&amp;lt;答案</p>'],
  ['double-encoded attribute','<input title="合成&amp;lt;答案">'],
  ['unknown entity','<p>合成&synthetic;答案</p>']
 ];
 for(const [name,source] of cases)assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),name);
 assert.throws(()=>scanPrivateAnswers('<p>合成&lt;答案</p>',answers),/release_private_text_answer/);
});
test('quoted string escapes expose complete normalized answers without decoding twice',()=>{
 const answers=['合成 答案','合成"答案',"合成'答案",'合成\\答案','SYNTH-ANSWER'];
 const blocked=[
  ['double-quoted Unicode',String.raw`const value="\u5408\u6210\u0020\u7b54\u6848";`],
  ['single-quoted Unicode',String.raw`const value='\u5408\u6210\u0020\u7b54\u6848';`],
  ['double-quoted control escapes',String.raw`const value="合成\r\n\t答案";`],
  ['single-quoted control escapes',String.raw`const value='合成\t\n答案';`],
  ['escaped double quote',String.raw`const value="合成\"答案";`],
  ['escaped single quote',String.raw`const value='合成\'答案';`],
  ['escaped backslash',String.raw`const value="合成\\答案";`],
  ['Unicode compatibility normalization','const value="ＳＹＮＴＨ－ＡＮＳＷＥＲ";']
 ];
 for(const [name,source] of blocked)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/,name);
 const allowed=[
  ['escaped Unicode prefix',String.raw`const value="提示\u5408\u6210 答案";`],
  ['escaped Unicode suffix',String.raw`const value='合成 答案\u63d0\u793a';`],
  ['literal Unicode escape text',String.raw`const value="\\u5408\\u6210 答案";`],
  ['different punctuation','const value="SYNTH_ANSWER";']
 ];
 for(const [name,source] of allowed)assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),name);
});
test('static templates decode hexadecimal, code point and line-continuation escapes',()=>{
 const answers=['SYNTH-ANSWER','合成 答案','含`反引號${文字}'];
 const cases=[
  ['hexadecimal escape','const value=`\\x53YNTH-ANSWER`;'],
  ['code point escape','const value=`\\u{53}YNTH-ANSWER`;'],
  ['LF continuation','const value=`SYNTH-\\\nANSWER`;'],
  ['CRLF continuation','const value=`SYNTH-\\\r\nANSWER`;'],
  ['literal CRLF','const value=`合成\r\n答案`;'],
  ['escaped whitespace','const value=`合成\\t\\n答案`;'],
  ['escaped backtick and interpolation delimiter','const value=`含\\`反引號\\${文字}`;'],
  ['encoded interpolation delimiter','const value=`含\\u0060反引號\\u0024{文字}`;']
 ];
 for(const [name,source] of cases)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/,name);
});
// These legal JavaScript string forms have the same value as the templates above.
for(const [name,body] of [
 ['hexadecimal escape',String.raw`\x53YNTH-ANSWER`],
 ['code point escape',String.raw`\u{53}YNTH-ANSWER`],
 ['line continuation','SYNTH-\\\nANSWER']
]){
 for(const [quoteName,quote] of [['double','"'],['single',"'"]]){
  test(`${quoteName}-quoted ${name} cannot hide a complete text answer`,()=>{
   const source='const value='+quote+body+quote+';';
   assert.throws(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']),/release_private_text_answer/);
  });
 }
}
test('interpolated templates remain allowed and their expressions are never executed',()=>{
 const answers=['SYNTH-ANSWER','含`反引號${文字}',[17,29,43,61]];
 const cases=[
  ['suffix interpolation','const label=`SYNTH-ANSWER${suffix}`;'],
  ['prefix interpolation','const label=`${prefix}SYNTH-ANSWER`;'],
  ['empty interpolation','const label=`SYNTH-ANSWER${""}`;'],
  ['array interpolation','const label=`[17,${value},43,61]`;'],
  ['backtick before interpolation','const label=`含\\`反引號${文字}`;'],
  ['longer static value','const label=`SYNTH-ANSWER提示`;'],
  ['literal backslash before Unicode escape','const label=`\\\\u0053YNTH-ANSWER`;']
 ];
 for(const [name,source] of cases)assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),name);
 // The marker is synthetic and is removed even if the assertion fails.
 const marker='__ybsAnswerScanSyntheticMarker';
 assert.equal(Object.hasOwn(globalThis,marker),false);
 try{
  const source='const label=`${globalThis.__ybsAnswerScanSyntheticMarker = true}SYNTH-ANSWER`;';
  assert.doesNotThrow(()=>scanPrivateAnswers(source,answers));
  assert.equal(Object.hasOwn(globalThis,marker),false,'scanning must not execute template expressions');
 }finally{delete globalThis[marker];}
});
test('escaped and serialized arrays compare the complete ordered answer',()=>{
 const answers=[[17,29,43,61],[[17,29],[43,61]]];
 const blocked=[
  ['escaped numeric strings',String.raw`const value=["\u0031\u0037","29","43","61"];`],
  ['serialized string elements',String.raw`const value="[\"17\",\"29\",\"43\",\"61\"]";`],
  ['template with encoded brackets','const value=`\\x5b17,29,43,61\\x5d`;'],
  ['nested array','const value=[[17,29],[43,61]];'],
  ['serialized nested array','const value="[[17,29],[43,61]]";']
 ];
 for(const [name,source] of blocked)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_array/,name);
 const allowed=[
  ['individual elements','const labels=[17,29]; const count=43; const label="61";'],
  ['reordered elements','const value=[61,43,29,17];'],
  ['missing element','const value=[17,29,43];'],
  ['extra element','const value=[17,29,43,61,79];'],
  ['changed element','const value=[17,29,43,62];'],
  ['different nesting','const value=[[17],[29,43,61]];']
 ];
 for(const [name,source] of allowed)assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),name);
});
test('public dimensions and index arrays keep their exceptions until answer evidence is present',()=>{
 const answers=[[7,19],[11,23],[0,1,2,3],[1,2,3,4],37];
 const allowed=[
  ['one dimension array','const size=[7,19];'],
  ['same dimension array twice','const width=[7,19]; const height=["7","19"];'],
  ['both index conventions','const zeroBased=[0,1,2,3]; const oneBased=[1,2,3,4];'],
  ['unlabelled number','const count=37; const title="第 37 題";'],
  ['array elements as HTML text','<p>7</p><span>19</span>']
 ];
 for(const [name,source] of allowed)assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),name);
 const blocked=[
  ['two distinct dimensions','const width=[7,19]; const height=[11,23];'],
  ['labelled dimensions','const answer=[7,19];'],
  ['labelled zero-based indices','const solution=[0,1,2,3];'],
  ['labelled one-based indices','const correct=[1,2,3,4];']
 ];
 for(const [name,source] of blocked)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_array/,name);
 for(const source of ['const answer=37;','const solution="37";','const correct=`37`;']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_numeric_answer/);
 }
 // Evidence belongs to one source; earlier scans must not taint later scans.
 assert.doesNotThrow(()=>scanPrivateAnswers('const width=[7,19];',answers));
 assert.doesNotThrow(()=>scanPrivateAnswers('const height=[11,23];',answers));
});
test('all nine private string answer types are blocked in templates, HTML text and attributes',async t=>{
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
