import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {questionHints} from '../assets/fullrev-shell.mjs';
function dom(t){
 const original=globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 t.after(()=>{if(original)globalThis.document=original;else delete globalThis.document;});
}
test('六種原生題型的兩層提示均有內容；授權題面提示優先，未知題不捏造內容',()=>{
 for(const type of ['binary-encode-5-v1','binary-encode-8-v1','binary-decode-6-v1','minimum-bits-v1','capacity-conversion-v1','recording-capacity-v1']){
  const hints=questionHints({type,data:{}});assert.ok(hints.direction.length>10,type);assert.ok(hints.steps.length>10,type);
 }
 assert.deepEqual(questionHints({type:'binary-encode-5-v1',data:{hint:'合成方向',guide:['合成步驟']}}),{direction:'合成方向',steps:['合成步驟']});
 assert.deepEqual(questionHints({type:'future'}),{direction:'',steps:''});
});
test('燈牌原理隨學生操作更新，不把目標填成答案，不改送出值',t=>{
 dom(t);const host=new Element('div');let changes=0;
 const handle=renderQuestion({type:'binary-encode-5-v1',data:{width:5,target:23}},host,{changed(){changes++;}});
 const view=host.querySelector('.principle-view');assert.match(view.textContent,/00000/);assert.deepEqual(handle.get(),[0,0,0,0,0]);
 host.querySelector('[data-bit="0"]').click();host.querySelector('[data-bit="4"]').click();
 assert.match(view.textContent,/10001/);assert.match(view.textContent,/16 \+ 1/);assert.deepEqual(handle.get(),[1,0,0,0,1]);assert.equal(changes,2);
});
test('無權重燈牌只顯示位元觀察，容量與最少位元保留通用原理',t=>{
 dom(t);
 for(const q of [{type:'binary-encode-8-v1',data:{width:8,target:201}},{type:'binary-decode-6-v1',data:{bits:[1,0,1,0,0,1]}},
  {type:'minimum-bits-v1',data:{n:29}},{type:'capacity-conversion-v1',data:{bits:40,kib:3,amount:2,from:0,to:1,units:['KB','MB','GB']}}]){
  const host=new Element('div');renderQuestion(q,host,{changed(){}});assert.ok(host.querySelector('.principle-view').textContent.length>30);
  if(q.type==='binary-encode-8-v1')assert.doesNotMatch(host.querySelector('.principle-view').textContent,/目前亮燈代表/);
 }
});
test('ASCII 原理只顯示公開碼或目前輸入，錯誤數字保留並可同題修正',t=>{
 dom(t);const host=new Element('div'),handle=renderQuestion({type:'finite-bank-v1',data:{mode:'ascii-encode',prompt:'Z'}},host,{changed(){},shell:true});
 const input=host.querySelector('input'),view=host.querySelector('.principle-view');
 input.value='65 300';input.oninput();assert.deepEqual(handle.get(),[65,300]);assert.match(view.textContent,/65 → 01000001/);assert.match(view.textContent,/300 → 超過/);
 input.value='90';input.oninput();assert.deepEqual(handle.get(),[90]);assert.match(view.textContent,/90 → 01011010/);
});
test('路線原理反映所選媒介與無直接線路，不改路徑或自行通過',t=>{
 dom(t);const host=new Element('div'),handle=renderQuestion({type:'finite-bank-v1',data:{mode:'route',from:'甲',to:'丙',nodes:[['甲',20,20],['乙',80,80],['丙',120,100]],edges:[['甲','乙','sea']],cut:[]}},host,{changed(){},shell:true});
 host.querySelector('[data-route-node="乙"]').click();assert.match(host.querySelector('.principle-view').textContent,/甲 → 乙：海纜/);
 host.querySelector('[data-route-node="丙"]').click();assert.match(host.querySelector('.principle-view').textContent,/乙 → 丙：沒有直接線路/);assert.deepEqual(handle.get(),['甲','乙','丙']);
});
test('有權重燈牌切換亮暗仍保留標值，無標值關不提前露出權重',t=>{
 dom(t);
 for(const width of [5,8]){
  const host=new Element('div');renderQuestion({type:`binary-encode-${width}-v1`,data:{width,target:23}},host,{changed(){}});
  const b=host.querySelector('[data-bit="0"]');b.click();
  assert.equal(b.textContent,width===5?'● 16':'●');b.click();assert.equal(b.textContent,width===5?'○ 16':'○');
  assert.equal(b.getAttribute('aria-pressed'),'false');assert.equal(b.getAttribute('aria-label').includes('代表'),width===5);
 }
});
test('網址觀察保留完整主機與路徑，不把路徑中的網域當主機、不解析 HTML',t=>{
 dom(t);const host=new Element('div');renderQuestion({type:'finite-bank-v1',data:{mode:'classify',heading:'網址的真名',rows:['https://fake.test/tixstar.com.tw','https://ticket.test.fake.test/login'],options:['甲','乙']}},host,{changed(){},shell:true});
 assert.match(host.querySelector('.principle-view').textContent,/主機名稱：fake.test；路徑：\/tixstar.com.tw/);
 assert.match(host.querySelector('.principle-view').textContent,/主機名稱：ticket.test.fake.test/);
});
test('封包觀察依學生排卡順序更新，空槽不被自動補成正解',t=>{
 dom(t);const host=new Element('div'),handle=renderQuestion({type:'finite-bank-v1',data:{mode:'order',heading:'把封包組回來',cards:['合成乙','合成甲']}},host,{changed(){},shell:true});
 const view=host.querySelector('.principle-view');assert.match(view.textContent,/□□/);
 host.querySelector('[data-pool-index="1"]').click();assert.match(view.textContent,/合成甲□/);assert.deepEqual(handle.get(),[1,null]);
 host.querySelector('[data-pool-index="0"]').click();assert.match(view.textContent,/合成甲合成乙/);assert.deepEqual(handle.get(),[1,0]);
 host.querySelector('[data-slot-index="0"]').click();assert.match(view.textContent,/□合成乙/);assert.deepEqual(handle.get(),[null,0]);
});
