import test from 'node:test';
import assert from 'node:assert/strict';
import {mountActivity} from '../assets/fullrev-ui.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {harness,response} from './fixtures/fullrev.mjs';

class UIElement extends Element {
  append(...children) { for(const child of children)super.append(child); }
  replaceChildren(...children) {
    this.childNodes.forEach(child=>child.parentElement=null);this.childNodes=[];this.append(...children);
  }
}
const view=(slot=0,extra={})=>response(slot,{question:{slot,type:'binary-decode-6-v1',data:{bits:[0,0,0,1,1,1]}},...extra});
async function activity(t) {
  const body=new UIElement('body');
  for(const [key,value] of Object.entries({document:{body,createElement:tag=>new UIElement(tag),addEventListener(){}},window:{addEventListener(){}}})) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  }
  const h=await harness({fetcher:async()=>Response.json(view())});
  await mountActivity({client:Promise.resolve(h.client),cfg:{week:5,title:'合成活動',rounds:[{name:'合成關卡'}],renderQuestion}});
  await h.login();
  const button=text=>body.querySelectorAll('button').find(el=>el.textContent===text);
  await button('開始這一關').onclick();
  const input=()=>body.querySelectorAll('input').find(el=>el.dataset.answerField==='value');
  const fill=value=>{input().value=value;input().oninput();};
  fill('7');assert.equal(button('送出').disabled,false);
  return {...h,button,input,fill,body};
}

test('第一組答對後修改舊答案不能送到第二組，按下一組並填妥才可送出',async t=>{
  const h=await activity(t),send=h.button('送出'),next=h.button('下一組'),oldInput=h.input();
  h.state.fetcher=async()=>Response.json(view(1,{correct:true}));await send.onclick();
  assert.equal(next.hidden,false);
  for(const value of ['', '8']) {
    h.fill(value);assert.equal(send.disabled,true);
    await send.onclick();assert.equal(h.requests.length,2);
  }
  assert.equal(h.input(),oldInput);
  await next.onclick();assert.equal(next.hidden,true);assert.notEqual(h.input(),oldInput);
  assert.equal(h.input().value,'');assert.equal(send.disabled,true);
  h.fill('7');assert.equal(send.disabled,false);
  h.state.fetcher=async()=>Response.json(view(1,{nextSeq:3,correct:false}));await send.onclick();
  assert.equal(h.requests.at(-1).body.slot,1);assert.equal(h.requests.at(-1).body.answer,7);
});

test('傳送中修改答案仍停用送出，錯答回應後可在同題修正',async t=>{
  const h=await activity(t),send=h.button('送出'),oldInput=h.input();
  let release;
  const requested=new Promise(resolve=>{h.state.fetcher=()=>new Promise(done=>{release=done;resolve();});});
  const sending=send.onclick();await requested;
  assert.equal(h.client.state().pending,true);
  h.fill('8');assert.equal(send.disabled,true);
  await send.onclick();assert.equal(h.requests.length,2);
  release(Response.json(view(0,{nextSeq:2,correct:false})));await sending;
  assert.equal(h.input(),oldInput);assert.equal(h.input().value,'8');assert.equal(send.disabled,false);
});

test('斷線待送時修改答案不會取代原答案，重試成功後恢復同題作答',async t=>{
  const h=await activity(t),send=h.button('送出');
  h.state.fetcher=async()=>{throw Error('synthetic-offline');};await send.onclick();
  const original=h.requests.at(-1).body;
  h.fill('8');assert.equal(send.disabled,true);
  await send.onclick();assert.equal(h.requests.length,2);
  h.advance();h.state.fetcher=async()=>Response.json(view(0,{nextSeq:2,correct:false}));
  await h.button('重試送出').onclick();assert.deepEqual(h.requests.at(-1).body,original);
  h.fill('9');assert.equal(send.disabled,false);
});

test('Worker 錯答提示顯示為文字並保留同題答案',async t=>{
  const h=await activity(t),oldInput=h.input();
  const feedback='合成提示：請重新核對觀察表 <不作 HTML>。';
  h.state.fetcher=async()=>Response.json(view(0,{nextSeq:2,correct:false,feedback}));
  await h.button('送出').onclick();
  assert.equal(h.input(),oldInput);assert.equal(h.input().value,'7');assert.equal(h.button('送出').disabled,false);
  assert.ok(h.body.textContent.includes(feedback));
});
