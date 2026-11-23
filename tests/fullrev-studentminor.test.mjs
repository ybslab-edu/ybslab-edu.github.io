import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {mountHintExample} from '../assets/fullrev-student-support.mjs';
import {mountTeacherQuestion} from '../assets/fullrev-teacher-view.mjs';
function dom(t){
 class E extends Element{get lastChild(){return this.childNodes.at(-1)}get children(){return this.childNodes.filter(n=>n.nodeType===1)}prepend(...nodes){this.replaceChildren(...nodes,...this.childNodes)}}
 const old=globalThis.document;globalThis.document={createElement:t=>new E(t),createElementNS:(_,t)=>new E(t)};
 t.after(()=>{if(old)globalThis.document=old;else delete globalThis.document;});return new E('div');
}
const q=(data)=>({type:'finite-bank-v1',slot:0,data});
test('最近三個只在選答後顯示；取消選答會收起，不改答案',t=>{
 const host=dom(t),handle=renderQuestion(q({mode:'knn',k:3,points:[[1,1,0],[8,8,1],[2,1,1],[1,2,0]],query:[0,0],options:['奶茶派','果茶派']}),host,{changed(){},shell:true});
 const view=host.querySelector('.principle-view');assert.equal(view.hidden,true);assert.equal(handle.get(),null);
 const b=host.querySelector('button');b.click();assert.equal(view.hidden,false);assert.match(view.textContent,/最近的 3 個/);
 assert.match(view.textContent,/奶茶派（1, 1）/);assert.doesNotMatch(view.textContent,/8, 8/);assert.equal(handle.get(),0);
 b.click();assert.equal(view.hidden,true);assert.equal(handle.get(),null);
});
test('換組只標示有變數字；長表格固定欄頭與第一欄並保留作答',t=>{
 const host=dom(t);const data={mode:'knn',k:1,points:Array.from({length:9},(_,i)=>[i,i,0]),query:[1,1],options:['甲','乙']};
 renderQuestion(q(data),host,{changed(){},shell:true});assert.equal(host.querySelectorAll('mark').length,0);
 host.replaceChildren();const handle=renderQuestion(q({...data,points:data.points.map((p,i)=>i===2?[20,30,1]:p)}),host,{changed(){},shell:true});
 assert.ok(host.querySelectorAll('mark').some(m=>m.textContent==='20'));assert.equal(handle.get(),null);
 assert.match(host.querySelector('.table-position-tip').textContent,/欄名與左側第一欄/);assert.equal(host.querySelector('th').style.position,'sticky');
});
test('示範只顯示另一題與授權解答，原題作答獨立且離開會清除',t=>{
 const host=dom(t),stage=document.createElement('section');let closed=0;
 const original=renderQuestion({type:'binary-encode-5-v1',data:{width:5,target:23}},stage,{changed(){}});stage.querySelector('button').click();
 const h=mountHintExample({host,example:{question:{type:'binary-encode-5-v1',data:{width:5,target:0}},answer:[0,0,0,0,0],notes:['合成說明']},renderQuestion,onClose(){closed++;}});
 assert.match(host.textContent,/另一題示範/);assert.match(host.textContent,/拼出 0/);assert.doesNotMatch(host.textContent,/拼出 23/);
 assert.deepEqual(host.querySelectorAll('[data-bit]').map(b=>b.getAttribute('aria-pressed')),['false','false','false','false','false']);
 assert.ok(host.querySelectorAll('[data-bit]').every(b=>b.disabled));
 assert.deepEqual(original.get(),[1,0,0,0,0]);host.querySelectorAll('button').find(b=>b.textContent==='回原題繼續做').click();assert.equal(closed,1);
 h.dispose();assert.equal(host.textContent,'');
});
const material=[[2,gzipSync(Buffer.from(new Float32Array(12).buffer)).toString('base64')]];
const photo=q({mode:'photo',start:[2,3],resolutions:[2],depths:[3],ask:['digit'],photos:[material],kind:'idol',palette:[]});
test('只有教師示範可開原圖，預設收起；學生 renderer 即使收到素材仍不建立原圖',async t=>{
 const host=dom(t),value={question:photo,solution:{answer:[2,3,1],notes:[]},originals:['data:image/png;base64,AAAA']};
 const h=mountTeacherQuestion({host,value,renderQuestion,onNew(){}});
 const b=host.querySelector('#tb-orig'),image=host.querySelector('img');assert.ok(b);assert.equal(image.hidden,true);
 b.click();assert.equal(image.hidden,false);assert.equal(b.getAttribute('aria-pressed'),'true');b.click();assert.equal(image.hidden,true);h.dispose();
 const student=document.createElement('div'),s=renderQuestion(photo,student,{changed(){},shell:true,originals:value.originals});assert.equal(student.querySelector('img'),null);s.dispose();
 await new Promise(resolve=>setImmediate(resolve));
});
test('沒有隔離示範時明示本關不提供示範，仍可回原題',t=>{
 const host=dom(t);let closed=false;const h=mountHintExample({host,example:null,renderQuestion,onClose(){closed=true;}});
 assert.match(host.textContent,/本關不提供示範/);assert.doesNotMatch(host.textContent,/示範解答|尚未取得/);host.querySelector('button').click();assert.equal(closed,true);h.dispose();
});
