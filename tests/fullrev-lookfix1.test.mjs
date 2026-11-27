import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {Element} from './fixtures/activity-dom.mjs';
import {renderQuestion} from '../assets/fullrev-activities.mjs';
import {renderRecording} from '../assets/fullrev-recording.mjs';
import {renderPhotos} from '../assets/fullrev-photos.mjs';

function dom(t,extras={}){
  for(const [key,value] of Object.entries({document:{createElement:tag=>new Element(tag)},...extras})){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
  }
}
test('分類名稱與描述分行，同列選項仍可取消、改答，題面字串不作 HTML',t=>{
  dom(t);const host=new Element('section');let changes=0;
  const handle=renderQuestion({type:'finite-bank-v1',slot:0,data:{mode:'classify',rows:['合成裝置：<說明>','另一裝置：描述'],options:['甲','乙','丙','丁']}},host,{changed(){changes++;},shell:true});
  const rows=host.querySelectorAll('.row');assert.equal(rows.length,2);
  assert.equal(rows[0].querySelector('.q').querySelector('b').textContent,'合成裝置');
  assert.equal(rows[0].querySelector('small').textContent,'<說明>');assert.equal(rows[0].querySelectorAll('.picks').length,1);
  const buttons=rows[0].querySelectorAll('button');assert.equal(buttons.length,4);assert.equal(handle.ready(),false);
  buttons[0].click();buttons[1].click();assert.deepEqual(handle.get(),[1,null]);assert.equal(buttons[0].getAttribute('aria-pressed'),'false');
  rows[1].querySelector('button').click();assert.equal(handle.ready(),true);
  buttons[1].click();assert.equal(handle.ready(),false);assert.deepEqual(handle.get(),[null,0]);assert.equal(changes,4);
});
test('AI 排卡顯示步驟提示與編號槽，放滿後可取回並放進第一個空槽',t=>{
  dom(t);const host=new Element('section');
  const handle=renderQuestion({type:'finite-bank-v1',slot:0,data:{mode:'order',heading:'一個 AI 怎麼做出來',cards:['合成甲','合成乙','合成丙']}},host,{changed(){},shell:true});
  for(const text of ['步驟卡','做 AI 的順序','點一下放進右邊下一格','點格子裡的卡片拿回去','最先','最後'])assert.ok(host.textContent.includes(text));
  assert.equal(host.querySelectorAll('.slot').length,3);assert.equal(host.querySelectorAll('.empty').length,3);
  for(const i of [2,0,1])host.querySelector(`[data-pool-index="${i}"]`).click();
  assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),[2,0,1]);assert.ok(host.textContent.includes('都排好了，按「送出」。'));
  host.querySelector('[data-slot-index="1"]').click();assert.equal(handle.ready(),false);assert.deepEqual(handle.get(),[2,null,1]);
  host.querySelector('[data-pool-index="0"]').click();assert.deepEqual(handle.get(),[2,0,1]);
});
test('錄音原聲與還原線有獨立可辨顏色，至少比較兩種設定；待審說明保留',t=>{
  const strokes=[],fills=[];
  const original=Element.prototype.getContext;
  Element.prototype.getContext=function(){const ctx=original.call(this);ctx.stroke=()=>strokes.push(ctx.strokeStyle);ctx.fill=()=>fills.push(ctx.fillStyle);return ctx;};
  t.after(()=>Element.prototype.getContext=original);
  dom(t,{getComputedStyle:()=>({getPropertyValue:()=>''})});
  const host=new Element('section'),handle=renderRecording({data:{mode:'recording-sound',cycles:3,phase:.5}},host,{changed(){}});
  assert.equal(host.querySelector('.lab-stat').textContent,'先選兩個設定。');assert.ok(strokes.includes('#98A2B8'));
  const set=(id,v)=>{const e=host.querySelector('#'+id);e.value=v;e.onchange();};
  set('sample-rate','8');set('sample-level','4');assert.equal(handle.ready(),false);
  set('sample-rate','16');assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),{rate:16,levels:4});
  assert.ok(strokes.includes('#F4B26A'));assert.ok(fills.includes('#F4B26A'));assert.match(host.querySelector('.lab-stat').textContent,/接近度.*資料量.*已比較 2 種/);
  assert.ok(!host.textContent.includes('等待老師確認'));handle.dispose();
});
test('照片沿用同一顆送出鈕與可信回饋，移到說明前；dispose 可還原外框且保留答案',async t=>{
  let notify,disconnected=false;
  class Observer{constructor(fn){notify=fn;}observe(){}disconnect(){disconnected=true;}}
  dom(t,{MutationObserver:Observer});
  const work=new Element('div');work.id='original-work';
  work.innerHTML='<div class="work-heading"><h2 class="sec-h"><span class="num">2</span>動手做</h2></div><div id="stage"></div><div class="btns"><button id="b-send">送出</button></div><section id="verdict" class="verdict"></section>';
  const host=work.querySelector('#stage'),send=work.querySelector('#b-send'),bar=send.parentElement,verdict=work.querySelector('#verdict');let sent=0;send.onclick=()=>sent++;
  const photo=[2,4].map(n=>[n,gzipSync(Buffer.from(new Float32Array(n*n*3).fill(120).buffer)).toString('base64')]);
  const d={mode:'photo',kind:'idol',start:[2,24],resolutions:[2,4],depths:[24],photos:[photo,photo],ask:['digit']};
  const handle=renderPhotos(host,d,{shell:true,changed(){}});
  for(let i=0;i<100&&!host.querySelector('.photo-nums').childNodes.length;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(host.querySelectorAll('.photo-frame').length,2);assert.equal(host.querySelectorAll('.photo-knob').length,2);
  assert.equal(work.querySelectorAll('#b-send').length,1);assert.equal(send.textContent,'拍下來傳出去');assert.ok(work.querySelector('.sec-h').textContent.includes('調設定，拍下來'));
  assert.ok(host.childNodes.indexOf(bar)<host.childNodes.indexOf(host.querySelector('.photo-store')));assert.equal(handle.ready(),false);
  for(const card of host.querySelectorAll('.photo-card'))card.querySelector('button').click();
  assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),{n:2,d:24,answers:[[0],[0]]});send.click();assert.equal(sent,1);
  verdict.innerHTML='<h3>還不對</h3>';verdict.className='verdict no';notify();assert.equal(verdict.textContent,'還不對');
  verdict.innerHTML='<h3>過關！</h3><p>雲端已確認</p>';verdict.className='verdict ok';notify();assert.ok(verdict.textContent.includes('朋友回訊息：「看到了！」'));
  const carry=handle.carry();handle.dispose();assert.ok(disconnected);assert.equal(bar.parentElement,work);assert.equal(verdict.parentElement,work);assert.equal(send.textContent,'送出');assert.equal(work.querySelector('.sec-h').textContent,'2動手做');
  const resumed=renderPhotos(host,d,{carry,changed(){}});assert.deepEqual(resumed.get(),carry);resumed.dispose();
});
