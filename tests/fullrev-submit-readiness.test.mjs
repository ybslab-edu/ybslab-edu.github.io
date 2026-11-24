import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
function setup(t,data){
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new Element(tag)}});
 t.after(()=>original?Object.defineProperty(globalThis,'document',original):delete globalThis.document);
 const host=new Element('div');let changed=0;
 const handle=renderQuestion({type:'finite-bank-v1',slot:0,data},host,{shell:true,changed(){changed++;}});
 return {host,handle,changes:()=>changed};
}
test('每列選答以目前選取為準，取消一列會精確指出尚缺一題',t=>{
 const {host,handle}=setup(t,{mode:'classify',rows:['合成甲','合成乙'],options:['甲','乙']});
 assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/2 題/);
 host.querySelectorAll('button')[0].click();host.querySelectorAll('button')[2].click();
 assert.equal(handle.ready(),true);assert.equal(handle.readyReason(),'');
 host.querySelectorAll('button')[0].click();assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/1 題/);
});
test('排卡全部入格才能送出，拿回一張後顯示缺一題',t=>{
 const {host,handle}=setup(t,{mode:'order',cards:['合成第一步','合成第二步']});
 assert.match(handle.readyReason(),/2 題/);
 for(let i=0;i<2;i++)host.querySelector('[data-pool-index]').click();
 assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),[0,1]);
 host.querySelector('[data-slot-index]').click();assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/1 題/);
});
test('取樣設定已填滿但只觀察一組時，明示須比較兩種設定',t=>{
 const {host,handle}=setup(t,{mode:'recording-sound',cycles:2,phase:0});
 const rate=host.querySelector('#sample-rate'),levels=host.querySelector('#sample-level');
 rate.value='8';rate.onchange();levels.value='4';levels.onchange();
 assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/比較至少兩種/);
 rate.value='16';rate.oninput();assert.equal(handle.ready(),true);assert.equal(handle.readyReason(),'');handle.dispose();
});
test('排卡填滿後停電示意仍擋送出，恢復開店即可再送',t=>{
 const {host,handle}=setup(t,{mode:'tea-performance',slotCount:1,cards:['合成步驟'],users:[''],cells:[['A','1']],labels:[['A','合成欄位']]});
 host.querySelector('[data-pool-index]').click();assert.equal(handle.ready(),true);
 host.querySelectorAll('button').find(b=>b.textContent==='停電／開店示意').click();
 assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/恢復開店/);
 host.querySelectorAll('button').find(b=>b.textContent==='停電／開店示意').click();assert.equal(handle.ready(),true);handle.dispose();
});
