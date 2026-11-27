import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRecording} from '../assets/fullrev-recording.mjs';
import {Element} from './fixtures/activity-dom.mjs';

// 只替代 DOM、畫布與 RAF；執行實際 renderer，不載入瀏覽器或雲端。
function setup(t){
  const pending=new Map(),callbacks=new Map(),requested=[],cancelled=[],draws=[],handles=[],originals=new Map();
  let nextId=0,drawError=null,changes=0;
  const context={
    clearRect(){},stroke(){},beginPath(){},moveTo(){},lineTo(){},fill(){},
    fillRect(){if(drawError)throw drawError;},
    arc(...args){draws.push(args);}
  };
  t.mock.method(Element.prototype,'getContext',()=>context);
  const globals={
    document:{createElement:tag=>new Element(tag)},
    getComputedStyle:()=>({getPropertyValue:()=>''}),
    requestAnimationFrame(callback){
      const id=nextId++;requested.push(id);pending.set(id,callback);callbacks.set(id,callback);return id;
    },
    cancelAnimationFrame(id){cancelled.push(id);pending.delete(id);}
  };
  for(const [key,value] of Object.entries(globals)){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    originals.set(key,descriptor);
  }
  t.after(()=>{
    try{for(const handle of handles)handle.dispose();}
    finally{for(const [key,descriptor] of originals){
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }}
  });
  const host=new Element('section');
  function render(mode='recording-movie'){
    const handle=renderRecording({data:{mode,seconds:2,cycles:2,phase:0}},host,{changed(){changes++;}});
    const canvas=host.querySelector('canvas');
    Object.defineProperty(canvas,'isConnected',{get(){
      for(let node=canvas;node;node=node.parentElement)if(node===host)return true;
      return false;
    }});
    handles.push(handle);
    return {handle,canvas};
  }
  function step(time){
    assert.equal(pending.size,1,'每個作用中影片只能有一個待執行回呼');
    const [id,callback]=pending.entries().next().value;
    pending.delete(id); // 瀏覽器在呼叫 RAF 前先移除已消耗的請求。
    callback(time);
    return id;
  }
  function set(id,value){const el=host.querySelector('#'+id);el.value=value;el.oninput();}
  return {host,render,step,set,pending,callbacks,requested,cancelled,draws,
    failDrawing(error){drawError=error;},get changes(){return changes;}};
}

test('影片正常排程維持單一 RAF，未選 fps 不重畫，同一影格不重畫',t=>{
  const h=setup(t),{handle}=h.render();
  assert.equal(h.draws.length,1,'初始畫面立即繪製');
  assert.deepEqual(h.requested,[0],'RAF ID 為 0 仍是有效請求');
  assert.equal(handle.ready(),false);
  h.step(0);h.step(100);
  assert.equal(h.draws.length,1);
  h.set('movie-fps','4');
  h.step(250);
  assert.equal(h.draws.length,2);
  assert.equal(h.draws.at(-1)[0],98.75,'依實際時間與 fps 計算小球位置');
  h.step(300);
  assert.equal(h.draws.length,2);
  h.step(500);
  assert.equal(h.draws.length,3);
  h.set('movie-fps','8');
  h.step(625);
  assert.equal(h.draws.length,4);
  assert.equal(h.pending.size,1);
  handle.dispose();
  assert.equal(h.pending.size,0);
});

test('首個 RAF 執行前 dispose 會取消 ID 0，重複 dispose 與晚到回呼不再排程或繪圖',t=>{
  const h=setup(t),{handle}=h.render();
  h.set('movie-fps','12');
  const callback=h.callbacks.get(0);
  handle.dispose();handle.dispose();
  assert.ok(h.cancelled.includes(0));
  assert.equal(h.pending.size,0);
  callback(0);callback(1000);
  h.set('movie-fps','24');
  assert.deepEqual(h.requested,[0]);
  assert.equal(h.draws.length,1);
  assert.equal(h.pending.size,0);
});

test('連續播放後 dispose 取消最新 RAF，已消耗或已取消的回呼晚到也無法復活',t=>{
  const h=setup(t),{handle}=h.render();
  h.set('movie-fps','12');
  for(const time of [0,100,200,300])h.step(time);
  const latest=h.requested.at(-1),count=h.requested.length,drawCount=h.draws.length;
  handle.dispose();
  assert.equal(h.cancelled.at(-1),latest);
  assert.equal(h.pending.size,0);
  h.callbacks.get(0)(400);
  h.callbacks.get(latest)(500);
  assert.equal(h.requested.length,count);
  assert.equal(h.draws.length,drawCount);
});

for(const playing of [false,true])test(`canvas 卸載停止排程（${playing?'播放後':'首個回呼前'}），重新掛載及輸入不自動重啟`,t=>{
  const h=setup(t),{handle,canvas}=h.render();
  h.set('movie-fps','12');
  if(playing){h.step(0);h.step(100);}
  const count=h.requested.length,drawCount=h.draws.length;
  const fps=h.host.querySelector('#movie-fps');
  h.host.innerHTML='';
  assert.equal(canvas.isConnected,false);
  h.step(200);
  assert.equal(h.pending.size,0);
  assert.equal(h.requested.length,count);
  assert.equal(h.draws.length,drawCount);
  h.host.append(canvas);
  assert.equal(canvas.isConnected,true);
  fps.value='24';fps.oninput();
  assert.equal(h.pending.size,0);
  handle.dispose();handle.dispose();
  assert.equal(h.requested.length,count);
});

test('停止後修改與修正輸入保留既有 ready/get 行為，且不重新排程',t=>{
  const h=setup(t),{handle}=h.render();
  handle.dispose();
  h.set('movie-fps','12');h.set('movie-fps','12');
  h.set('movie-one','24');h.set('movie-total','48');h.set('movie-parts','1');
  assert.equal(handle.ready(),false,'相同設定不算兩次比較');
  h.set('movie-fps','24');h.set('movie-one','24.0');
  assert.equal(handle.ready(),false);
  assert.match(h.host.textContent,/整數/);
  assert.equal(h.host.querySelector('#movie-one').value,'24.0');
  h.set('movie-one','24');
  assert.equal(handle.ready(),true);
  assert.deepEqual(handle.get(),{fps:24,one:24,total:48,parts:1});
  assert.equal(h.changes,8);
  assert.equal(h.pending.size,0);
  assert.deepEqual(h.requested,[0]);
});

test('繪圖失敗不留下後續 RAF，dispose 後晚到回呼不再繪圖或拋出',t=>{
  const h=setup(t),{handle}=h.render();
  h.set('movie-fps','12');
  const error=new Error('synthetic canvas failure');
  h.failDrawing(error);
  assert.throws(()=>h.step(0),e=>e===error);
  assert.equal(h.pending.size,0);
  assert.deepEqual(h.requested,[0]);
  handle.dispose();
  assert.doesNotThrow(()=>h.callbacks.get(0)(1000));
  assert.deepEqual(h.requested,[0]);
});

test('舊影片停止與卸載後重建，新影片獨立播放且不受舊 dispose 影響',t=>{
  const h=setup(t),old=h.render();
  old.handle.dispose();h.host.innerHTML='';
  const fresh=h.render();
  h.set('movie-fps','8');h.step(0);
  const count=h.requested.length,drawCount=h.draws.length,latest=h.requested.at(-1);
  old.handle.dispose();h.callbacks.get(0)(1000);
  assert.deepEqual([...h.pending.keys()],[latest]);
  assert.equal(h.requested.length,count);
  assert.equal(h.draws.length,drawCount);
  h.step(250);
  assert.equal(h.draws.length,drawCount+1);
  fresh.handle.dispose();
  assert.equal(h.pending.size,0);
});

for(const mode of ['recording-sound','recording-image'])test(`${mode} 不建立動畫，重複 dispose 安全`,t=>{
  const h=setup(t),{handle}=h.render(mode);
  handle.dispose();handle.dispose();
  assert.deepEqual(h.requested,[]);
  assert.deepEqual(h.cancelled,[]);
  assert.equal(h.pending.size,0);
});
