import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {store} from './fixtures/fullrev.mjs';
import {formalFeedback} from './fixtures/fullrev-formal-feedback.mjs';
import {mountActivity} from '../assets/fullrev-ui.mjs';

async function until(check){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setImmediate(r));}assert.ok(check(),'正式過關畫面未到預期狀態');}
async function setup(t,options) {
  const h=await formalFeedback(options),events={},document={body:new Element('body'),head:new Element('head'),createElement:t=>new Element(t),addEventListener:(n,f)=>{events[n]=f;}};
  const xp=vm.createContext({});vm.runInContext(await readFile(new URL('../assets/xp.js',import.meta.url),'utf8'),xp);
  for(const [key,value] of Object.entries({document,window:{addEventListener:(n,f)=>{events[n]=f;}},ACTIVITIES:h.catalog,YBSXP:vm.runInContext('YBSXP',xp),isActivityOpen:()=>true,localStorage:store(),sessionStorage:store(),matchMedia:()=>({matches:true})})) {
    const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key];});
  }
  await mountActivity({client:Promise.resolve(h.client),cfg:h.cfg,now:h.now});await h.login();
  const $=id=>document.body.querySelector('#'+id),button=text=>document.body.querySelectorAll('button').find(b=>b.textContent===text);
  await until(()=>!$('g-isme').hidden);await $('g-isme').onclick();
  for(let slot=0;slot<2;slot++) {
    await until(()=>!!$('stage').querySelector('input'));
    const input=$('stage').querySelector('input');input.value='7';input.oninput();await $('b-send').onclick();
    if(slot===0){assert.match($('verdict').textContent,/累積答對 1\/2/);button('下一組').onclick();}
  }
  return {...h,$,button,events};
}
for(const guestActivity of [5,6])test(`活動 ${guestActivity} 訪客紀錄待確認仍顯示另一正式關卡過關、XP 明細及下一關`,async t=>{
  const h=await setup(t,{guestActivity});await until(()=>h.$('verdict').querySelector('h3')?.textContent==='過關！');
  assert.match(h.$('verdict').textContent,/本關 XP：\+10 過關、\+5 準時/);
  assert.equal(h.$('sync').textContent,'✓ 紀錄已上傳給老師');assert.equal(h.$('b-send').disabled,true);
  assert.equal(h.$('xp-header').hidden,true,'訪客 XP 未核定，仍不顯示總 XP');
  assert.equal(h.button('下一關').hidden,false);
  if(guestActivity===5)assert.match(h.$('rounds').textContent,/待老師確認/);
  const reads=h.state.progressReads;h.advance();await h.events.focus();assert.equal(h.state.progressReads,reads+1);
  assert.equal(h.$('verdict').querySelector('h3').textContent,'過關！');
  const requested=Promise.withResolvers(),release=Promise.withResolvers(),fetcher=h.state.fetcher;
  h.state.fetcher=async(url,init)=>{
    if(url.endsWith('/start')&&JSON.parse(init.body).round===1){requested.resolve();await release.promise;}
    return fetcher(url,init);
  };
  const next=h.button('下一關').onclick();await requested.promise;
  assert.equal(h.$('round-status').textContent,'第 2 關／共 4 關．本關答對 0/2');
  assert.equal(h.$('stage').querySelector('input'),null);
  release.resolve();await next;assert.ok(h.$('stage').querySelector('input'));
  await h.client.logout();assert.equal(h.$('main').hidden,true);
});
test('同關只有訪客待確認紀錄時，不得當成正式過關證明',async t=>{
  const h=await setup(t,{guestRound:0,confirmFormal:false});
  assert.notEqual(h.$('verdict').querySelector('h3')?.textContent,'過關！');
  assert.equal(h.button('下一關'),undefined);assert.equal(h.$('xp-header').hidden,true);
  assert.match(h.$('sync').textContent,/正在確認雲端紀錄/);await h.client.logout();
});
