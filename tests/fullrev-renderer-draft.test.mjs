import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {answerValidation} from '../assets/fullrev-answer-ui.mjs';
test('全部公開 renderer：部分輸入草稿往返、必填提示、無判分結果持久化',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
 const load=p=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,p)).href);
 const [{banks},{NATIVE,projectQuestion}]=await Promise.all([load('tests/pr6-fixtures.mjs'),load('src/formal/questions.mjs')]);
 class DOM extends Element{
  get children(){return this.childNodes.filter(n=>n.nodeType===1);}
  get lastChild(){return this.childNodes.at(-1);}
  prepend(...nodes){const before=[...this.childNodes];this.replaceChildren(...nodes,...before);}
  contains(el){return this===el||this.children.some(c=>c.contains?.(el));}
 }
 for(const [key,value] of Object.entries({document:{createElement:t=>new DOM(t),createElementNS:(_,t)=>new DOM(t)},requestAnimationFrame:()=>1,cancelAnimationFrame(){},matchMedia:()=>({matches:true})})){
  const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
 }
 const questions=[...Object.values(NATIVE).map(g=>projectQuestion(g.at(0),0,g.type,'合成',''))];
 for(const bundle of Object.values(banks))for(const bank of Object.values(bundle.rounds))questions.push(projectQuestion({data:bank.cases[0].facts,answer:bank.cases[0].answer},0,bank.type,'合成',''));
 for(const data of [{mode:'recording-sound',cycles:2,phase:0},{mode:'recording-image'},{mode:'recording-movie',seconds:3}])questions.push({type:'finite-bank-v1',slot:0,data});
 const modes=new Set();
 for(const q of questions){
  const mode=q.data.mode||q.type;if(modes.has(mode))continue;modes.add(mode);
  const host=new DOM('div');let validation;const handle=renderQuestion(q,host,{shell:true,changed(){validation?.update();}});validation=answerValidation(handle,host);
  assert.equal(typeof handle.draft,'function',mode);assert.equal(typeof handle.restoreDraft,'function',mode);validation.show();
  // 模擬部分輸入，無需知道任何正解。
  const input=host.querySelectorAll('input').find(e=>e.type!=='range'),select=host.querySelector('select');
  if(input){input.value='1';input.oninput?.();}
  if(select){select.value=select.querySelectorAll('option').find(o=>o.value!=='').value;select.oninput?.();}
  if(!input&&!select){const b=host.querySelector('[data-pool-index]')||host.querySelector('[data-row]')||host.querySelector('[data-bit]')||host.querySelector('[data-scene-choice]')||host.querySelector('[data-photo-index]')||host.querySelector('[data-multi-index]');b?.click();}
  const draft=JSON.parse(JSON.stringify(handle.draft())),target=new DOM('div'),restored=renderQuestion(q,target,{shell:true,changed(){}});
  assert.doesNotMatch(JSON.stringify(draft),/"(?:question|expected|feedback|correct|performance|pixels|seed)"/,mode);
  assert.equal(restored.restoreDraft(draft),true,mode);assert.deepEqual(restored.get(),handle.get(),mode);
  const validation2=answerValidation(restored,target);validation2.show();
  if(!restored.ready())assert.ok(target.querySelectorAll('.answer-error').length,mode);
  handle.dispose?.();restored.dispose?.();
 }
 assert.ok(modes.size>=40,'題型覆蓋不得減少');console.log('Renderer draft coverage:',modes.size,'modes');
});
