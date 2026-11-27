import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import {Element} from './fixtures/activity-dom.mjs';

const source=await readFile(new URL('../assets/fullrev-photos.mjs',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const completed={n:8,d:3,answers:[[1],[2]]};
const gzip=bytes=>gzipSync(bytes).toString('base64');

function photoData() {
  const colors=[[[255,0,128],[0,255,0]],[[0,255,255],[255,0,0]]];
  return {mode:'photo',kind:'synthetic',start:[8,3],resolutions:[8,16],depths:[3,6],ask:['digit'],
    photos:colors.map(levels=>[8,16].map((n,i)=>{
      const raw=new Float32Array(n*n*3);
      for(let k=0;k<n*n;k++)raw.set(levels[i],k*3);
      return [n,gzip(Buffer.from(raw.buffer))];
    }))};
}

class PhotoElement extends Element {
  append(...children) {for(const child of children)super.append(child);}
  replaceChildren(...children) {
    this.childNodes.forEach(child=>child.parentElement=null);this.childNodes=[];this.append(...children);
  }
  getContext(type) {
    assert.equal(type,'2d');
    return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:image=>{(this.frames??=[]).push(Array.from(image.data));}};
  }
}

// 記下完整樹、控制項及畫布內容，連卸載後對舊節點的更新也必須被偵測。
function snapshot(el) {
  if(el.nodeType===3)return el.textContent;
  return {tag:el.tagName,style:{...el.style},dataset:{...el.dataset},value:el.value,
    disabled:el.disabled,width:el.width,height:el.height,
    label:el.getAttribute('aria-label'),pressed:el.getAttribute('aria-pressed'),
    frames:el.frames?.map(frame=>[...frame]),children:el.childNodes.map(snapshot)};
}

function harness(t) {
  const requests=[],caches=new Set(),mounts=[];
  let decoded=0;
  class PixelBuffer extends Float32Array {
    static get [Symbol.species]() {return Float32Array;}
    constructor(buffer) {super(buffer);decoded++;}
  }
  class DelayedResponse extends Response {
    arrayBuffer() {
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      // 真正執行 gzip 解壓；成功與失敗均先接住，再由測試決定何時交回元件。
      const result=super.arrayBuffer().then(buffer=>({buffer}),error=>({error}));
      requests.push({release:async()=>{release();await result;await flush();}});
      return result.then(async outcome=>{
        await gate;
        if(outcome.error)throw outcome.error;
        return outcome.buffer;
      });
    }
  }
  const context=vm.createContext({document:{createElement:tag=>new PhotoElement(tag)},
    Response:DelayedResponse,Blob,DecompressionStream,atob,Uint8Array,Float32Array:PixelBuffer,Map,
    observeCache:cache=>caches.add(cache)});
  // 隔離觀察持有像素 Map 的陣列，確認 dispose 釋放暫存；不新增正式測試介面。
  const renderPhotos=vm.runInContext(`
    const originalPush=Array.prototype.push;
    Array.prototype.push=function(...items){
      if(items.some(item=>item instanceof Map))observeCache(this);
      return Reflect.apply(originalPush,this,items);
    };
    ${source.replace(/^export /gm,'')}
    renderPhotos;
  `,context);
  const drain=async()=>{for(const request of requests)await request.release();};
  t.after(async()=>{mounts.forEach(m=>m.handle?.dispose());await drain();});
  return {requests,caches,drain,get decoded(){return decoded;},
    mount(data=photoData(),carry,host=new PhotoElement('main')) {
      const changes=[];
      const handle=renderPhotos(host,data,{carry,changed:()=>changes.push('changed')});
      const mounted={host,handle,changes};mounts.push(mounted);return mounted;
    }};
}

const cacheSizes=h=>[...h.caches].map(cache=>Array.from(cache,levels=>levels.size));
const answer=(host,photo,choice)=>host.querySelectorAll('button').find(b=>
  b.dataset.photoIndex===photo&&b.dataset.photoField===0&&b.dataset.choice===choice).click();

test('非照片模式不建立 DOM、解壓工作或暫存',t=>{
  const h=harness(t),{host,handle,changes}=h.mount({mode:'other'});
  assert.equal(handle,undefined);assert.deepEqual(host.childNodes,[]);
  assert.equal(h.requests.length,0);assert.equal(h.caches.size,0);assert.deepEqual(changes,[]);
});

test('正常載入等待全部照片與解析度，沿用等待期間的設定並要求兩張答案',async t=>{
  const h=harness(t),{host,handle,changes}=h.mount();
  assert.match(host.textContent,/照片準備中/);assert.equal(handle.ready(),false);
  assert.deepEqual(structuredClone(handle.get()),{n:8,d:3,answers:[[null],[null]]});
  assert.deepEqual(cacheSizes(h),[[0]]);
  const sliders=host.querySelectorAll('input');
  for(const input of sliders){input.value=1;input.oninput();}
  assert.match(host.textContent,/16 × 16 格 × 6 位元 = 192 位元組/);
  for(let i=0;i<3;i++) {
    await h.requests[i].release();
    assert.equal(handle.ready(),false);assert.equal(changes.length,2);
    assert.ok(host.querySelectorAll('canvas').every(c=>!c.frames));
  }
  assert.deepEqual(cacheSizes(h),[[2,1]]);
  await h.requests[3].release();
  assert.equal(h.requests.length,4);assert.equal(h.decoded,4);
  assert.deepEqual(cacheSizes(h),[[2,2]]);assert.equal(changes.length,3);
  assert.match(host.textContent,/兩張照片的問題都回答後/);
  for(const [i,canvas] of host.querySelectorAll('canvas').entries()) {
    assert.equal(canvas.width,16);assert.equal(canvas.height,16);assert.equal(canvas.frames.length,1);
    assert.deepEqual(canvas.frames[0],Array.from({length:16*16},()=>i?[255,0,0,255]:[0,255,0,255]).flat());
  }
  assert.equal(host.querySelectorAll('span').length,48);
  assert.equal(host.querySelector('span').textContent,'00 11 00');
  assert.equal(handle.ready(),false);
  answer(host,0,1);assert.equal(handle.ready(),false);
  answer(host,1,2);assert.equal(handle.ready(),true);
  const expected={n:16,d:6,answers:[[1],[2]]};
  assert.deepEqual(structuredClone(handle.get()),expected);
  assert.deepEqual(structuredClone(handle.carry()),expected);
  handle.get().answers[0][0]=9;handle.carry().answers[1][0]=9;
  assert.deepEqual(structuredClone(handle.get()),expected);
  answer(host,0,1);assert.equal(handle.ready(),false);
  answer(host,0,1);assert.equal(handle.ready(),true);
});

test('還原設定與答案須等照片完成，卸載後不可用且重複卸載不留暫存',async t=>{
  const h=harness(t),carry={n:16,d:6,answers:[[1],[2]]};
  const {host,handle,changes}=h.mount(photoData(),carry);
  carry.answers[0][0]=9;
  assert.equal(handle.ready(),false);
  await h.drain();
  assert.equal(handle.ready(),true);assert.equal(changes.length,1);
  assert.equal(host.querySelectorAll('button').filter(b=>b.getAttribute('aria-pressed')==='true').length,2);
  const before=snapshot(host),saved=structuredClone(handle.carry());
  handle.dispose();
  assert.deepEqual(cacheSizes(h),[[]]);
  assert.equal(handle.ready(),false);
  handle.dispose();await flush();
  assert.deepEqual(cacheSizes(h),[[]]);assert.deepEqual(snapshot(host),before);
  assert.equal(changes.length,1);assert.deepEqual(structuredClone(handle.get()),saved);
});

for(const [label,bad,failedIndex] of [
  ['無效 base64','!',0],
  ['解壓失敗',Buffer.from('synthetic invalid gzip').toString('base64'),2],
  ['Float32 緩衝位元組未對齊',gzip(Buffer.from([1,2,3])),2]
])test(`${label}顯示重讀提示、不繪圖、不變成可用；卸載釋放部分暫存`,async t=>{
  const h=harness(t),data=photoData();
  data.photos[Math.floor(failedIndex/2)][failedIndex%2][1]=bad;
  const {host,handle,changes}=h.mount(data,completed);
  await h.drain();await flush();
  assert.match(host.textContent,/照片尚未取得，請重新讀取這一關/);
  assert.equal(handle.ready(),false);assert.deepEqual(changes,[]);
  assert.ok(host.querySelectorAll('canvas').every(c=>!c.frames));
  assert.equal(h.requests.length,failedIndex===0?0:failedIndex+1);
  assert.equal(h.decoded,failedIndex);
  assert.deepEqual(cacheSizes(h),[failedIndex===0?[0]:[2,0]]);
  handle.dispose();assert.deepEqual(cacheSizes(h),[[]]);assert.equal(handle.ready(),false);
});

for(const outcome of ['成功','失敗'])for(let pending=0;pending<4;pending++)
  test(`第 ${pending+1} 次解壓等待時卸載，延遲${outcome}不改 DOM、不回報可用、不重建暫存`,async t=>{
    const h=harness(t),data=photoData();
    if(outcome==='失敗')data.photos[Math.floor(pending/2)][pending%2][1]=Buffer.from('synthetic invalid gzip').toString('base64');
    const {host,handle,changes}=h.mount(data,completed);
    for(let i=0;i<pending;i++)await h.requests[i].release();
    assert.equal(h.requests.length,pending+1);assert.equal(h.decoded,pending);
    assert.equal([...h.caches][0].reduce((n,levels)=>n+levels.size,0),pending);
    assert.equal(handle.ready(),false);
    const before=snapshot(host),saved=structuredClone(handle.carry());
    handle.dispose();handle.dispose();
    assert.deepEqual(cacheSizes(h),[[]]);assert.equal(handle.ready(),false);
    await h.requests[pending].release();
    assert.deepEqual(snapshot(host),before);assert.deepEqual(changes,[]);
    assert.equal(handle.ready(),false);assert.deepEqual(structuredClone(handle.get()),saved);
    assert.equal(h.requests.length,pending+1);assert.equal(h.decoded,pending);
    assert.deepEqual(cacheSizes(h),[[]]);
  });

test('同一 host 掛載新元件後，舊照片延遲解壓不影響新元件或舊節點',async t=>{
  const h=harness(t),old=h.mount(photoData(),completed);
  await h.requests[0].release();await h.requests[1].release();
  const oldNodes=[...old.host.childNodes],before=oldNodes.map(snapshot);
  old.handle.dispose();old.host.replaceChildren();
  const current=h.mount(photoData(),completed,old.host),fresh=snapshot(current.host);
  await h.requests[2].release();
  assert.deepEqual(snapshot(current.host),fresh);assert.deepEqual(oldNodes.map(snapshot),before);
  assert.deepEqual(old.changes,[]);assert.deepEqual(current.changes,[]);
  assert.equal(old.handle.ready(),false);assert.equal(current.handle.ready(),false);
  assert.deepEqual(cacheSizes(h),[[],[0]]);
  await h.drain();
  assert.equal(current.handle.ready(),true);assert.equal(old.handle.ready(),false);
  assert.deepEqual(old.changes,[]);assert.equal(current.changes.length,1);
  assert.deepEqual(oldNodes.map(snapshot),before);assert.deepEqual(cacheSizes(h),[[],[2,2]]);
});
