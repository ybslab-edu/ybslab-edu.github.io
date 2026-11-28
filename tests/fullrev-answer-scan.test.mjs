import {workerSource,workerCISkip} from './helpers/worker-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile,mkdtemp,writeFile,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {scanPrivateAnswers,privateAnswerHits,parseAcceptedHits,readAcceptedHits,scanPrivateAnswerFiles} from '../tools/scan-private-answers.mjs';
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
 assert.throws(()=>scanPrivateAnswers('const size=[7,19]; const seats=[1,2,3]; const title="第 37 題"; const label="短";',answers),/release_private_answer_array_pending/);
 assert.doesNotThrow(()=>scanPrivateAnswers('const size=[7,23]; const seats=[1,2,3]; const title="第 37 題"; const label="短";',answers));
});
test('static template literals decode escapes and serialized arrays without evaluating interpolation',()=>{
 const answers=['合成短答案', '含`反引號${文字}',[17,29,43,61]];
 for(const source of ['const leaked=`合成短答案`;','const leaked=`\\u5408成短答案`;','const leaked=`含\\`反引號\\${文字}`;','const leaked=`[17,29,43,61]`;','const leaked=[`17`,`29`,`43`,`61`];']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('const label=`合成短答案${suffix}`;',answers));
});
test('private object answers are blocked in literals and serialized JSON, including reordered numeric strings',()=>{
 const answers=[{rate:173,levels:29},{fps:37,one:37,total:111,parts:1}];
 for(const source of ['const leaked={rate:173,levels:29};','const leaked={"levels":"29","rate":"173"};',
  'const leaked="{\\"rate\\":173,\\"levels\\":29}";','const leaked=`{"parts":1,"total":111,"one":37,"fps":37}`;']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_object/);
 }
 assert.doesNotThrow(()=>scanPrivateAnswers('const labels={rate:"取樣",levels:"量化"}; const input={rate:null,levels:null};',answers));
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
test('unlabelled matching dimensions and index arrays remain pending and block release',()=>{
 const answers=[[7,19],[11,23],[0,1,2,3],[1,2,3,4],37];
 const pending=[
  ['one dimension array','const size=[7,19];'],
  ['same dimension array twice','const width=[7,19]; const height=["7","19"];'],
  ['both index conventions','const zeroBased=[0,1,2,3]; const oneBased=[1,2,3,4];']
 ];
 for(const [name,source] of pending)assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_array_pending/,name);
 const allowed=[
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
 // Each matching source blocks independently; unrelated dimensions stay allowed.
 assert.throws(()=>scanPrivateAnswers('const width=[7,19];',answers),/release_private_answer_array_pending/);
 assert.throws(()=>scanPrivateAnswers('const height=[11,23];',answers),/release_private_answer_array_pending/);
 assert.doesNotThrow(()=>scanPrivateAnswers('const width=[7,23];',answers));
});
// Same invented answer and partial escape as scanner-reject-encoded-answer*.sh.
// The quote characters inside this public regex used to desynchronize later strings.
const syntheticDrillAnswer='SYNTHETIC_PRIVATE_7f98_pr6-batch1.mjs';
const syntheticRegexPrefix=String.raw`const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`;
test('synthetic drill escaped answer is rejected after a regex containing both quote delimiters',()=>{
 const injection=String.raw`const syntheticAnswer="SYNTHETIC_PRIVATE_7f98_pr6-\u0062atch1.mjs";`;
 for(const prefix of [syntheticRegexPrefix,'// public "quote\n','/* public " and \' quotes */']){
  for(const separator of ['','\n'])assert.throws(()=>scanPrivateAnswers(prefix+separator+injection,[syntheticDrillAnswer]),/release_private_text_answer/);
 }
});
for(const [name,encode,html] of [
 ['JS unicode escape',c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'),false],
 ['JS code point escape',c=>'\\u{'+c.codePointAt(0).toString(16)+'}',false],
 ['JS hexadecimal escape',c=>'\\x'+c.charCodeAt(0).toString(16).padStart(2,'0'),false],
 ['HTML decimal entity',c=>'&#'+c.codePointAt(0)+';',true],
 ['HTML hexadecimal entity',c=>'&#x'+c.codePointAt(0).toString(16)+';',true]
]){
 test(`synthetic artifact rejects a complete answer encoded with ${name}`,()=>{
  const encoded=[...syntheticDrillAnswer].map(encode).join('');
  const artifacts=html?[
   '<script>'+syntheticRegexPrefix+'</script><p>'+encoded+'</p>',
   '<input value="'+encoded+'">',"<input value='"+encoded+"'>",'<input value='+encoded+'>'
  ]:['"',"'",'`'].map(quote=>syntheticRegexPrefix+'\nconst syntheticAnswer='+quote+encoded+quote+';');
  for(const artifact of artifacts)assert.throws(()=>scanPrivateAnswers(artifact,[syntheticDrillAnswer]),/release_private_text_answer/);
 });
}
for(const [name,decoded] of [['amp','&'],['lt','<'],['gt','>'],['quot','"'],['apos',"'"],['nbsp',' ']]){
 test(`synthetic HTML values decode the supported named entity &${name}; once`,()=>{
  const answer='SYNTH'+decoded+'ANSWER',value='SYNTH&'+name+';ANSWER';
  for(const source of ['<p>'+value+'</p>','<input value="'+value+'">',"<input value='"+value+"'>",'<input value='+value+'>']){
   assert.throws(()=>scanPrivateAnswers(source,[answer]),/release_private_text_answer/);
  }
  assert.doesNotThrow(()=>scanPrivateAnswers('<p>SYNTH&amp;'+name+';ANSWER</p>',[answer]));
 });
}
test('synthetic answers match original string and HTML values as well as decoded values',()=>{
 const cases=[
  [String.raw`const value="\u0053YNTH-ANSWER";`,String.raw`\u0053YNTH-ANSWER`],
  [String.raw`const value='\x53YNTH-ANSWER';`,String.raw`\x53YNTH-ANSWER`],
  ['const value=`\\u{53}YNTH-ANSWER`;',String.raw`\u{53}YNTH-ANSWER`],
  ['<p>SYNTH&amp;ANSWER</p>','SYNTH&amp;ANSWER'],
  ['<input value="SYNTH&amp;ANSWER">','SYNTH&amp;ANSWER']
 ];
 for(const [source,answer] of cases)assert.throws(()=>scanPrivateAnswers(source,[answer]),/release_private_text_answer/);
});
test('synthetic regex ranges remain allowed and cannot hide subsequent answer literals',()=>{
 const answers=['SYNTH-ANSWER',[17,29,43,61]];
 const ranges=[
  String.raw`const range=/[\u0053-\u0059\u{41}-\u{5a}\x41-\x5a]/u;`,
  String.raw`const range=/["']\u0053YNTH-ANSWER["']/;`,
  'const range=/[17,29,43,61]/;',
  'const range=/("SYNTH-ANSWER")/;',
  'if (visible) /("SYNTH-ANSWER")/.test(input);',
  'const range=/[\\/"\']/g;'
 ];
 for(const source of ranges){
  assert.doesNotThrow(()=>scanPrivateAnswers(source,answers),source);
  assert.throws(()=>scanPrivateAnswers(source+'const leaked="SYNTH-ANSWER";',answers),/release_private_text_answer/);
 }
 // Slashes used for division must not consume a real string operand as a regex.
 for(const source of ['const ratio=total/"SYNTH-ANSWER"/scale;','const ratio=(total)/"SYNTH-ANSWER"/scale;',
  'const ratio={}/"SYNTH-ANSWER"/scale;','const ratio=entry.return/"SYNTH-ANSWER"/scale;']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_text_answer/);
 }
});
const slashContextCases=[
 // name, public synthetic source, expected old result, expected new result.
 ['HTTPS in HTML text','<p>https://example.invalid</p><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['HTTP in HTML text','<p>http://example.invalid</p><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['HTTP in unquoted attribute','<a href=http://example.invalid>公開</a><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['HTTPS in double-quoted attribute','<a href="https://example.invalid">公開</a><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['HTTP in single-quoted attribute',"<a href='http://example.invalid'>公開</a><script>const value=\"SYNTH-ANSWER\";</script>",'block','block'],
 ['block-comment marker in HTML text','<p>/* 公開提示</p><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['URL in style content','<style>p{background:url(https://example.invalid/image)}</style><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['line comment ends at script boundary','<script>// public comment</script><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['script end tag with ignored attribute','<script>// public comment</script ignored><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['custom element is not a script','<script-label>https://example.invalid</script-label><script>const value="SYNTH-ANSWER";</script>','block','block'],
 ['script comparison and tag-like string','<p>https://example.invalid</p><script>if(a<b) log("<p>");const value="SYNTH-ANSWER";</script>','block','block'],
 ['HTML comment literal remains public','<!-- https://example.invalid "SYNTH-ANSWER" -->','block','block'],
 ['property if call division','const value=obj.if(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['property while call division','const value=obj.while(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['property for call division','const value=obj.for(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['property switch call division','const value=obj.switch(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['property catch call division','const value=obj.catch(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['property return call division','const value=obj.return(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['optional property if call division','const value=obj?.if(x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['commented property call division','const value=obj /* public */ . if /* public */ (x)/"SYNTH-ANSWER"/scale;','block','block'],
 ['nested property call division','const value=obj.if(check(x))/"SYNTH-ANSWER"/scale;','block','block'],
 ['closing parenthesis division','const value=(total)/"SYNTH-ANSWER"/scale;','block','block'],
 ['closing bracket division','const value=items[0]/"SYNTH-ANSWER"/scale;','block','block'],
 ['identifier division','const value=total/"SYNTH-ANSWER"/scale;','block','block'],
 ['property return division','const value=obj.return/"SYNTH-ANSWER"/scale;','block','block'],
 ['plain string','const value="SYNTH-ANSWER";','block','block'],
 ['Unicode escape',String.raw`const value="\u0053YNTH-ANSWER";`,'block','block'],
 ['code point escape',String.raw`const value="\u{53}YNTH-ANSWER";`,'block','block'],
 ['hexadecimal escape',String.raw`const value="\x53YNTH-ANSWER";`,'block','block'],
 ['HTML decimal entity','<p>&#83;YNTH-ANSWER</p>','block','block'],
 ['HTML hexadecimal entity','<input value="&#x53;YNTH-ANSWER">','block','block'],
 ['similar HTML text','<p>https://example.invalid</p><script>const value="SYNTH-ANSWERS";</script>','allow','allow'],
 ['similar division operand','const value=obj.if(x)/"SYNTH-ANSWERS"/scale;','allow','allow'],
 ['control statement regex','if(visible) /SYNTH-ANSWER/.test(input);','allow','allow'],
 ['control statement regex before leak','if(visible) /public/.test(input);const value="SYNTH-ANSWER";','block','block'],
 ['regex character range','const range=/[SYNTH-ANSWER]/;','allow','allow'],
 ['literal backslash',String.raw`const value="\\u0053YNTH-ANSWER";`,'allow','allow'],
 ['double HTML encoding','<p>&amp;#83;YNTH-ANSWER</p>','allow','allow'],
 ['partial concatenation','const value="SYNTH-"+"ANSWER";','allow','allow']
];
test('HTML URL cannot hide a complete answer in a later script on the same line',()=>{
 assert.throws(()=>scanPrivateAnswers(slashContextCases[0][1],['SYNTH-ANSWER']),/release_private_text_answer/);
});
test('property if call division cannot hide its complete string operand',()=>{
 assert.throws(()=>scanPrivateAnswers('const value=obj.if(x)/"SYNTH-ANSWER"/scale;',['SYNTH-ANSWER']),/release_private_text_answer/);
});
test('slash contexts meet every explicit new-scanner expectation',async t=>{
 for(const [name,source,,expected] of slashContextCases)await t.test(`${name}: expected ${expected}`,()=>{
  if(expected==='block')assert.throws(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']),/release_private_text_answer/);
  else assert.doesNotThrow(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']));
 });
});
test('fixed old scanner and new scanner compare the same synthetic slash contexts',async t=>{
 const file=process.env.YBS_OLD_ANSWER_SCANNER;
 if(!file){t.skip('需 Console 固定的舊版唯讀 scanner，設定 YBS_OLD_ANSWER_SCANNER');return;}
 assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),'cceee2f19e8d8cb1928c4c04297fba6d4f1901c4ad207da2e300adae1bc120db','fixed origin/main f5aaa39 scanner bytes');
 const {scanPrivateAnswers:oldScan}=await import(pathToFileURL(resolve(file)).href);
 const outcome=(scan,source)=>{try{scan(source,['SYNTH-ANSWER']);return 'allow';}catch(error){assert.match(error.message,/^release_private_/);return 'block';}};
 let regressions=0;
 for(const [name,source,expectedOld,expectedNew] of slashContextCases)await t.test(`${name}: old=${expectedOld}, new=${expectedNew}`,()=>{
  const old=outcome(oldScan,source),current=outcome(scanPrivateAnswers,source);
  if(old==='block'&&current==='allow')regressions++;
  assert.equal(old,expectedOld,'fixed old scanner');assert.equal(current,expectedNew,'new scanner');
 });
 t.diagnostic(`cases=${slashContextCases.length}; old-block/new-miss=${regressions}`);
 assert.equal(regressions,0);
});
test('HTML regions preserve complete container values and original UTF-8 script offsets',()=>{
 const answers=[[17,29,43,61],{rate:173,levels:29}];
 for(const source of [
  '<input value="[17,29,43,61]">',
  "<input value='{\"rate\":173,\"levels\":29}'>",
  '<p>[17,29,43,61]</p>',
  '<p>{rate:173,levels:29}</p>'
 ])assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_(?:array|object)/);
 assert.equal(privateAnswerHits('<p>[17,29,43,61]</p>',answers).length,1,'one source array is one hit');
 const source='<p>合成 https://example.invalid</p><script>const value="SYNTH-ANSWER";</script>';
 const at=source.indexOf('"SYNTH-ANSWER"');
 assert.deepEqual(privateAnswerHits(source,['SYNTH-ANSWER']),[{type:'text_answer',at,byteOffset:Buffer.byteLength(source.slice(0,at))}]);
});
test('release HTML files use HTML context even when their first text node is a URL',()=>{
 const list={schemaVersion:1,groups:[{id:'risk-accepted',label:'使用者 11/28 接受風險',entries:[]},{id:'public-baseline-a',label:'已判 A、與公開基準逐位元組相同',entries:[]}]};
 const files=[{path:'assets/synthetic.html',bytes:Buffer.from('https://example.invalid<script>const value="SYNTH-ANSWER";</script>')}];
 assert.throws(()=>scanPrivateAnswerFiles(files,['SYNTH-ANSWER'],Buffer.from(JSON.stringify(list))),/release_private_text_answer/);
});
test('comments and regex literals are recognized within each script context',()=>{
 for(const source of [
  '// "SYNTH-ANSWER"\nconst publicValue="next";',
  '/* "SYNTH-ANSWER" */ const publicValue="next";',
  '<p>https://example.invalid</p><script>// "SYNTH-ANSWER"\nconst publicValue="next";</script>',
  '<input value="http://example.invalid"><script>if(visible) /("SYNTH-ANSWER")/.test(input);</script>',
  'const markup="<script>";const publicValue="next";'
 ])assert.doesNotThrow(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']));
 for(const source of [
  'const markup="<script>";const value="SYNTH-ANSWER";',
  '<script>/* public "quote */ const value="SYNTH-ANSWER";</script>',
  '<script>if(visible) /["\']/.test(input);const value="SYNTH-ANSWER";</script>'
 ])assert.throws(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']),/release_private_text_answer/);
});
test('synthetic literal backslashes and double encodings are allowed without recursive decoding',()=>{
 const cases=[
  String.raw`const value="\\u0053YNTH-ANSWER";`,
  String.raw`const value='\\x53YNTH-ANSWER';`,
  'const value=`\\\\u{53}YNTH-ANSWER`;',
  String.raw`const value="\u005cu0053YNTH-ANSWER";`,
  '<p>&amp;#83;YNTH-ANSWER</p>',
  '<p>&#38;#x53;YNTH-ANSWER</p>',
  '<input value="&amp;#x53;YNTH-ANSWER">',
  '<p>&unsupported;YNTH-ANSWER</p>',
  'const value="SYNTH-"+"ANSWER";',
  'const value="U1lOVEgtQU5TV0VS";',
  'const value=`SYNTH-${suffix}`;'
 ];
 for(const source of cases)assert.doesNotThrow(()=>scanPrivateAnswers(source,['SYNTH-ANSWER']),source);
});
test('real public minified xlsx stays allowed with unrelated synthetic answers',async()=>{
 const vendor=await readFile(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8');
 const answers=['測甲',['SYNTH-A'],['SYNTH-A','SYNTH-B'],[701,907],[701,907,1103,1301]];
 // Read the public fixture independently of private banks; never copy a matching
 // private answer or a section chosen by its position into regression fixtures.
 assert.doesNotThrow(()=>scanPrivateAnswers(vendor,answers),'public xlsx with synthetic answers');
});
test('real minified xlsx cannot exempt injected short answers or small answer arrays',async()=>{
 const vendor=await readFile(new URL('../assets/vendor/xlsx-0.20.3.full.min.js',import.meta.url),'utf8');
 const answers=['測甲',['SYNTH-A'],['SYNTH-A','SYNTH-B'],[701,907]];
 for(const answer of answers)for(const name of ['answer','value']){
  const injected=vendor+'\nconst '+name+'='+JSON.stringify(answer)+';';
  assert.throws(()=>scanPrivateAnswers(injected,[answer]),/release_private/,'synthetic injection after public xlsx');
 }
 // An unlabelled complete match remains blocking even beside public code.
 const vector=[701,907,1103,1301];
 assert.throws(()=>scanPrivateAnswers(vendor+'\nconst value='+JSON.stringify(vector)+';',[vector]),/release_private_answer_array_pending@\d+$/);
});
test('optional computed access is not an array but cannot hide real short arrays',()=>{
 const answers=[[701],[701,907]];
 for(const source of ['const value=data?.[701];','const value=data?. [701,907];','const value=data?. /* public comment */ [701];']){
  assert.doesNotThrow(()=>scanPrivateAnswers(source,answers));
  assert.throws(()=>scanPrivateAnswers(source+'const leaked=[701];',answers),/release_private_answer_array_pending/);
 }
 for(const source of ['const value=data?.[[701]];','const value=visible?[701]:other;','const value=()=>[701,907];']){
  assert.throws(()=>scanPrivateAnswers(source,answers),/release_private_answer_array_pending/);
 }
});
test('all nine private string answer types are blocked in templates, HTML text and attributes',async t=>{
 if(workerCISkip){t.skip(workerCISkip);return;}
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

test('volunteer private mixed answer vectors are detected in literal, stringified and numeric-string forms',async t=>{
 const workerSource=process.env.YBS_WORKER_SOURCE;
 if(!workerSource&&process.env.CI){t.skip('需本機私有來源');return;}
 assert.ok(workerSource,'志工答案掃描需設定 YBS_WORKER_SOURCE');
 const {default:banks}=await import(pathToFileURL(resolve(workerSource,'src/formal/banks/pr6-batch5.mjs')).href);
 const bundle=Object.entries(banks).find(([key])=>key.startsWith('7:'))[1];let count=0;
 for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){
  assert.ok(c.facts.mode.startsWith('form-volunteer-'));assert.ok(c.answer.some(v=>typeof v==='number'));assert.ok(c.answer.some(v=>typeof v==='string'));
  for(const value of [JSON.stringify(c.answer),JSON.stringify(c.answer.map(String)),JSON.stringify(JSON.stringify(c.answer)),'`'+JSON.stringify(c.answer)+'`']){
   assert.throws(()=>scanPrivateAnswers('const leaked='+value+';',[c.answer]),/release_private_answer_array/);
  }count++;
 }
 assert.equal(count,32);t.diagnostic('volunteer private answer vectors: 32; injection forms: 128 detected');
});

const publicDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
function acceptedFixture({section='function publicCase(){\r\n return [701,907];\r\n}',literal='[701,907]',answers=[[701,907]]}={}){
 const prefix='// 合成公開來源\n',path='assets/synthetic.mjs',bytes=Buffer.from(prefix+section+'\n');
 const entry={path,type:'answer_array_pending',section:{startByte:Buffer.byteLength(prefix),endByte:Buffer.byteLength(prefix+section),sha256:publicDigest(Buffer.from(section))},hitByteOffset:Buffer.byteLength(prefix+section.slice(0,section.indexOf(literal))),expectedHits:1,reports:[{path:'tasks/batch-20261127-eve/scanhits.md',line:3,hit:1},{path:'tasks/batch-20261127-eve/scanhits2.md',line:3,hit:1}]};
 const list={schemaVersion:1,groups:[{id:'risk-accepted',label:'使用者 11/28 接受風險',entries:[entry]},{id:'public-baseline-a',label:'已判 A、與公開基準逐位元組相同',entries:[]}]};
 const files=[{path,bytes}],serialize=()=>Buffer.from(JSON.stringify(list));
 return {files,entry,list,answers,serialize,scan:()=>scanPrivateAnswerFiles(files,answers,serialize())};
}
test('synthetic accepted pending hit is bound to UTF-8 location and complete raw public section',()=>{
 const f=acceptedFixture(),result=f.scan();
 assert.equal(result.knownAcceptedHits,1);assert.equal(result.knownAcceptedStatus,'已知放行');
 assert.equal(result.acceptedHitsSha256,publicDigest(f.serialize()));
 assert.deepEqual(result.knownAcceptedGroups.map(g=>[g.id,g.hits]),[['risk-accepted',1],['public-baseline-a',0]]);
 assert.equal(privateAnswerHits(f.files[0].bytes.toString('utf8'),f.answers)[0].byteOffset,f.entry.hitByteOffset);
 // A different list serialization is a different audited input, even if JSON is equivalent.
 const changed=Buffer.from(JSON.stringify(f.list,null,2)+'\n');
 const rescanned=scanPrivateAnswerFiles(f.files,f.answers,changed);
 assert.equal(rescanned.knownAcceptedHits,1);assert.notEqual(rescanned.acceptedHitsSha256,result.acceptedHitsSha256);
 // Unchanged accepted code does not exempt the remainder of the file.
 f.files[0].bytes=Buffer.concat([f.files[0].bytes,Buffer.from('// unrelated public comment\n')]);
 assert.equal(f.scan().knownAcceptedHits,1);
});
test('synthetic one-character, newline and normalization-equivalent section changes block',()=>{
 for(const change of [s=>s.replace('publicCase','publicXase'),s=>s.replace('\r\n','\n'),s=>s.replace('701','７０１')]){
  const f=acceptedFixture();f.files[0].bytes=Buffer.from(change(f.files[0].bytes.toString('utf8')));
  assert.throws(f.scan,/release_accepted_hits_section_changed|release_accepted_hits_section_missing/);
 }
});
test('synthetic new hit inside an accepted section blocks even with a refreshed section digest',()=>{
 const section='function publicCase(){const first=[701,907];const second=[701,907];return first;}',f=acceptedFixture({section});
 // Only the original location is approved; a reviewed region is never a blanket exemption.
 assert.throws(f.scan,/release_private_answer_array_pending/);
 const original=acceptedFixture();original.files[0].bytes=Buffer.from(original.files[0].bytes.toString('utf8').replace('return [701,907];','const second=[701,907];return [701,907];'));
 assert.throws(original.scan,/release_accepted_hits_section_changed/);
});
test('synthetic unlisted hits in the same file, another file or a moved location block',()=>{
 for(const otherFile of [false,true]){
  const f=acceptedFixture(),extra=Buffer.from('\nconst value=[701,907];');
  if(otherFile)f.files.push({path:'assets/other.mjs',bytes:extra});else f.files[0].bytes=Buffer.concat([f.files[0].bytes,extra]);
  assert.throws(f.scan,/release_private_answer_array_pending/);
 }
 const f=acceptedFixture();f.files[0].path='assets/renamed.mjs';
 assert.throws(f.scan,/release_accepted_hits_section_missing/);
 const moved=acceptedFixture();moved.files[0].bytes=Buffer.concat([Buffer.from(' '),moved.files[0].bytes]);
 assert.throws(moved.scan,/release_accepted_hits_section_changed/);
});
test('synthetic duplicate list locations, source regions, files and actual hits all block',()=>{
 const duplicate=acceptedFixture();duplicate.list.groups[0].entries.push(structuredClone(duplicate.entry));
 assert.throws(duplicate.scan,/release_accepted_hits_duplicate_location/);
 const crossGroup=acceptedFixture(),entry=structuredClone(crossGroup.entry);entry.reports=[{path:'tasks/batch-20261127-eve/scanhits.md',line:7,hit:5}];crossGroup.list.groups[1].entries.push(entry);
 assert.throws(crossGroup.scan,/release_accepted_hits_duplicate_location/);
 const region=acceptedFixture();region.files[0].bytes=Buffer.concat([region.files[0].bytes,region.files[0].bytes.subarray(region.entry.section.startByte,region.entry.section.endByte)]);
 assert.throws(region.scan,/release_accepted_hits_ambiguous_section/);
 const file=acceptedFixture();file.files.push(file.files[0]);assert.throws(file.scan,/release_accepted_hits_duplicate_file/);
 const hits=acceptedFixture({section:'const value="[[701,907],[701,907]]";',literal:'"'});
 assert.equal(privateAnswerHits(hits.files[0].bytes.toString('utf8'),hits.answers).length,2);
 assert.throws(hits.scan,/release_accepted_hits_duplicate_hit/);
});
test('synthetic other hit types cannot use a pending-hit acceptance at the same location',()=>{
 for(const [section,literal,answers,type] of [
  ['const answer=[701,907];','[701,907]',[[701,907]],'answer_array'],
  ['const value="SYNTH-ANSWER";','"SYNTH-ANSWER"',['SYNTH-ANSWER'],'text_answer'],
  ['const value={size:701};','{size:701}',[{size:701}],'answer_object'],
  ['const answer=701;','701',[701],'numeric_answer']
 ]){
  const f=acceptedFixture({section,literal,answers});
  assert.throws(f.scan,new RegExp('release_private_'+type));
 }
});
test('synthetic missing expected matches and incorrect counts block',()=>{
 const f=acceptedFixture();assert.throws(()=>scanPrivateAnswerFiles(f.files,[],f.serialize()),/release_accepted_hits_count_mismatch/);
 const badCount=acceptedFixture();badCount.entry.expectedHits=2;assert.throws(badCount.scan,/release_accepted_hits_format/);
 const missing=acceptedFixture();missing.files.length=0;assert.throws(missing.scan,/release_accepted_hits_section_missing/);
});
test('synthetic malformed lists, unsafe paths and altered section hashes block',()=>{
 for(const bytes of [Buffer.from('{'),Buffer.from('null'),Buffer.from('{}'),Buffer.from('[]')]){
  assert.throws(()=>parseAcceptedHits(bytes),/release_accepted_hits_format/);
 }
 for(const change of [
  f=>f.list.schemaVersion=2,f=>f.list.groups.pop(),f=>f.list.groups[1]=structuredClone(f.list.groups[0]),
  f=>f.list.groups[0].label='unreviewed',f=>f.list.groups[0].id=['risk-accepted'],
  f=>f.entry.path='../outside.mjs',f=>f.entry.path='assets/../outside.mjs',f=>f.entry.path='/assets/synthetic.mjs',
  f=>f.entry.type='answer_array',f=>f.entry.expectedHits=0,f=>f.entry.hitByteOffset+=0.5,
  f=>f.entry.section.startByte=-1,f=>f.entry.section.endByte=f.entry.section.startByte,
  f=>f.entry.hitByteOffset=f.entry.section.endByte,f=>f.entry.section.sha256='not-a-digest',
  f=>f.entry.extra='disallowed',f=>f.entry.reports=[],f=>f.entry.reports[0].line=0,
  f=>f.entry.reports[0].hit=5,f=>f.list.groups[1].entries.push({...structuredClone(f.entry),reports:[{path:'tasks/batch-20261127-eve/scanhits2.md',line:7,hit:5}]})
 ]){const f=acceptedFixture();change(f);assert.throws(f.scan,/release_accepted_hits_format/);}
 const hash=acceptedFixture();hash.entry.section.sha256='0'.repeat(64);assert.throws(hash.scan,/release_accepted_hits_section_changed/);
});
test('synthetic missing, malformed, nonregular and unreadable list inputs fail closed',async()=>{
 const dir=await mkdtemp('/tmp/ybs-accepted-read-'),file=dir+'/list.json';
 await assert.rejects(readAcceptedHits(file),/release_accepted_hits_unreadable/);
 await assert.rejects(readAcceptedHits(dir),/release_accepted_hits_unreadable/);
 await assert.rejects(readAcceptedHits(file+'\0'),/release_accepted_hits_unreadable/);
 await writeFile(file,'{');await assert.rejects(readAcceptedHits(file),/release_accepted_hits_format/);
 const f=acceptedFixture();await writeFile(file,f.serialize());assert.deepEqual(await readAcceptedHits(file),f.serialize());
 await symlink(file,dir+'/link.json');await assert.rejects(readAcceptedHits(dir+'/link.json'),/release_accepted_hits_unreadable/);
});
test('checked-in list keeps four risk acceptances separate from five public-baseline A entries',async()=>{
 const bytes=await readAcceptedHits(),list=parseAcceptedHits(bytes);
 assert.deepEqual(list.groups.map(g=>[g.id,g.entries.length]),[['risk-accepted',4],['public-baseline-a',5]]);
 for(const entry of list.groups[0].entries){assert.ok(!entry.path.includes('/vendor/'));assert.equal(entry.reports.length,2);}
 for(const entry of list.groups[1].entries){assert.equal(entry.path,'assets/vendor/xlsx-0.20.3.full.min.js');assert.equal(entry.reports.length,1);}
});
