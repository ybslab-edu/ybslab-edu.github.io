import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {answerValidation} from '../assets/fullrev-answer-ui.mjs';
function setup(t,q){
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)}});
 t.after(()=>original?Object.defineProperty(globalThis,'document',original):delete globalThis.document);
 const host=new Element('div');let ui;const handle=renderQuestion({slot:0,...q},host,{shell:true,changed(){ui?.update();}});ui=answerValidation(handle,host);return {host,handle,ui};
}
test('一次標出所有必填／格式錯誤，依 DOM 最上方聚焦，改好即清除且保留既有描述',t=>{
 const {host,handle,ui}=setup(t,{type:'finite-bank-v1',data:{mode:'synthetic',questions:[['選項','甲','乙'],['數字'],['文字']],kinds:['s','n','s']}});
 const [select,input,text]=host.querySelectorAll('select').concat(host.querySelectorAll('input'));const focus=[];
 select.focus=()=>focus.push('select');input.focus=()=>focus.push('input');select.setAttribute('aria-describedby','original-help');
 assert.equal(host.querySelectorAll('.answer-error').length,0);assert.equal(ui.show(),true);assert.deepEqual(focus,['select']);assert.equal(host.querySelectorAll('.answer-error').length,3);
 assert.equal(select.getAttribute('aria-invalid'),'true');assert.match(select.getAttribute('aria-describedby'),/^original-help answer-error-/);
 select.value='甲';select.oninput();assert.equal(select.getAttribute('aria-invalid'),'false');assert.equal(select.getAttribute('aria-describedby'),'original-help');assert.equal(host.querySelectorAll('.answer-error').length,2);
 input.value='1人';input.oninput();assert.match(host.querySelectorAll('.answer-error')[0].textContent,/整數/);ui.show();assert.deepEqual(focus,['select','input']);
 input.value='12';input.oninput();text.value='合成文字';text.oninput();assert.equal(ui.show(),false);assert.equal(handle.ready(),true);assert.equal(host.querySelectorAll('.answer-error').length,0);
});
test('選答與排卡每個空格個別紅框，重畫後持續檢查；部分作答可回填',t=>{
 for(const data of [{mode:'classify',rows:['甲','乙'],options:['一','二']},{mode:'order',cards:['甲','乙']}]){
  const {host,handle,ui}=setup(t,{type:'finite-bank-v1',data});ui.show();assert.equal(host.querySelectorAll('.answer-error').length,2);
  host.querySelector('button').click();const draft=handle.draft();assert.equal(host.querySelectorAll('.answer-error').length,1);
  assert.equal(handle.restoreDraft(draft),true);ui.update();assert.equal(host.querySelectorAll('.answer-error').length,1);
  if(data.mode==='order')host.querySelector('[data-pool-index]').click();else host.querySelectorAll('button')[2].click();
  assert.equal(ui.show(),false);assert.equal(handle.ready(),true);
 }
});
test('數字不把空白轉成零；草稿保留全形及未完成文字，回填後維持格式檢查',t=>{
 const {host,handle,ui}=setup(t,{type:'minimum-bits-v1',data:{n:15}});const [a,b]=host.querySelectorAll('input');a.value='３';a.oninput();
 const draft=handle.draft();assert.deepEqual(draft,['３','']);a.value='';assert.equal(handle.restoreDraft(draft),true);assert.equal(a.value,'３');assert.equal(b.value,'');ui.show();assert.equal(host.querySelectorAll('.answer-error').length,2);
});
test('取樣比較記錄及排卡停電狀態都可續作，非輸入的播放結果不進草稿',t=>{
 const a=setup(t,{type:'finite-bank-v1',data:{mode:'recording-sound',cycles:2,phase:0}});
 const rate=a.host.querySelector('#sample-rate'),levels=a.host.querySelector('#sample-level');rate.value='8';rate.oninput();levels.value='4';levels.oninput();rate.value='16';rate.oninput();const saved=a.handle.draft();
 const b=setup(t,{type:'finite-bank-v1',data:{mode:'recording-sound',cycles:2,phase:0}});assert.equal(b.handle.restoreDraft(saved),true);assert.deepEqual(b.handle.get(),a.handle.get());assert.equal(b.handle.ready(),true);
 const p=setup(t,{type:'finite-bank-v1',data:{mode:'tea-performance',slotCount:2,cards:['甲','乙'],users:['',''],cells:[['A','1']],labels:[['A','欄位']]}});p.host.querySelector('[data-pool-index]').click();p.ui.show();assert.equal(p.host.querySelectorAll('.answer-error').length,1);const d=p.handle.draft();assert.deepEqual(d,{values:[0,null],powerOff:false});assert.equal(p.handle.restoreDraft(d),true);p.ui.update();assert.equal(p.host.querySelectorAll('.answer-error').length,1);p.handle.dispose();
});

test('回填會重算由學生選擇產生的文字預覽及 change 觀察，不保存預覽內容',t=>{
 const q={type:'finite-bank-v1',data:{mode:'tokens',words:Array.from({length:12},(_,k)=>'詞'+k),weights:Array(12).fill(25)}};
 const a=setup(t,q);a.host.querySelectorAll('button')[1].click();const d=a.handle.draft();
 const b=setup(t,q);assert.equal(b.handle.restoreDraft(d),true);assert.equal(b.host.querySelector('p').textContent,a.host.querySelector('p').textContent);
 const tree={type:'finite-bank-v1',data:{mode:'tree-build',features:['甲','乙','丙'],options:['類別甲','類別乙'],rows:[['合成物件',true,false,true,0]]}};
 const x=setup(t,tree);for(const e of x.host.querySelectorAll('select')){e.value='0';e.dispatchEvent(new Event('change'));}
 const y=setup(t,tree);assert.equal(y.handle.restoreDraft(x.handle.draft()),true);assert.match(y.host.textContent,/用你的樹分對 1／1 件/);
});
