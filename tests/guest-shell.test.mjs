// 真正的活動、判題、localStorage、成績碼與 login.js；只以 DOM/Firebase 替身隔離網路。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {setup as firebase,settle,key,error} from './fixtures/guest-firebase.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup({loginDisabled=false,...options}={}){
  const fb=firebase(options),body=new Element('body'),stored=fb.stored;
  const context=vm.createContext({YBS:fb.api,document:{body,addEventListener(){},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,matchMedia:()=>({matches:true})});
  // 登入表單由既有獨立測試涵蓋；此處進入真實手動班座、判題與上傳流程。
  let onLogin;
  const ybs={...fb.api,button(_,callback){onLogin=callback;},whoami:async()=>({ok:true,student:{cls:'999',seat:1}})};
  if(loginDisabled)ybs.enabled=()=>false;
  context.YBS=ybs;
  const html=read('115-g9/u2-02/index.html'),inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(read('assets/codec.js')+'\n'+read('assets/shell.js')+'\n'+inline,context,{timeout:3000});
  const run=source=>vm.runInContext(source,context,{timeout:3000}),el=id=>body.querySelector('#'+id);
  // 本案例的送出按鈕比照瀏覽器：disabled 時 click 不會觸發判題。
  const send=el('b-send'),click=send.click.bind(send);send.click=()=>{if(!send.disabled)click();};
  const start=(seat=1)=>{el('g-manual').click();el('in-cls').value='999';el('in-seat').value=String(seat);el('g-next').click();el('g-go').click();};
  const pass=()=>{for(let i=0;i<2;i++){run('APP.handle.fill()');el('sample-rate').onchange();el('b-send').click();}};
  const startAccount=async()=>{await fb.account();await onLogin(fb.api.profile());el('g-isme').click();};
  return{...fb,run,el,start,pass,startAccount};
}
for(const [mode,options] of [
  ['班座成功',{}],['班座寫入 unavailable',{write:async()=>{throw error('unavailable');}}],
  ['匿名登入失敗',{authFailure:'auth/network-request-failed'}],['帳號登入',{}],['停用登入',{loginDisabled:true}],
])test(`${mode}：兩組才過關；過關保留當題與送出狀態，下一關才重設`,async()=>{
  const h=setup(options);if(mode==='帳號登入')await h.startAccount();else h.start();await settle();
  assert.equal(h.el('b-send').disabled,true);
  h.run('APP.handle.fill()');
  assert.equal(h.run('APP.handle.ready()'),true);
  assert.equal(h.el('b-send').disabled,true,'fill 不會自動同步送出按鈕');
  h.el('b-send').click();
  assert.equal(h.el('streak').querySelectorAll('.on').length,0,'disabled click 不應判題');
  assert.equal(h.el('verdict').hidden,true);
  const first=h.run('JSON.stringify(APP.inst)');
  h.el('sample-rate').onchange();h.el('b-send').click();
  assert.equal(h.el('streak').querySelectorAll('.on').length,1);
  assert.match(h.el('verdict').textContent,/再一組確認/);
  assert.equal(h.el('b-next'),null,'第一組尚不可進下一關');
  assert.equal(JSON.parse(h.stored.get('it9:w4:999-1')).mask,0);
  assert.equal(h.run('CODEC.decode(document.getElementById("code").textContent).mask'),0);
  assert.equal(h.calls.length,0,'第一組不應上傳');
  assert.notEqual(h.run('JSON.stringify(APP.inst)'),first);
  assert.equal(h.el('b-send').disabled,true,'新一組資料須重新填答');
  const second=h.run('JSON.stringify(APP.inst)');
  h.run('APP.handle.fill()');h.el('sample-rate').onchange();h.el('b-send').click();await settle();
  assert.match(h.el('verdict').textContent,/過關！/);assert.equal(h.el('verdict').className,'verdict ok');
  const progress=JSON.parse(h.stored.get('it9:w4:999-1'));
  assert.equal(progress.mask,1);assert.equal(progress.tries[0],2);assert.ok(h.el('code').textContent);
  assert.equal(h.run('CODEC.decode(document.getElementById("code").textContent).mask'),1);
  assert.equal(h.run('JSON.stringify(APP.inst)'),second,'第二組過關不再換題');
  assert.equal(h.el('streak').querySelectorAll('.on').length,1,'過關不重繪燈號，不能拿燈號當內部連對數');
  assert.equal(h.el('b-send').disabled,false,'既有過關畫面保留可按的送出按鈕');
  if(mode==='帳號登入'){
    assert.equal(h.calls[0].path,'ybsCourses/115-g9/attempts/google1_4_0');assert.deepEqual(h.authCalls,[]);
  }else if(mode==='班座寫入 unavailable'){
    assert.equal(h.queue().length,1);assert.match(h.el('sync').textContent,/紀錄暫存在本機/);
  }
  h.el('b-next').click();
  assert.equal(h.run('APP.ri'),1);assert.equal(h.el('streak').querySelectorAll('.on').length,0);
  assert.equal(h.el('b-send').disabled,true);assert.equal(h.el('verdict').hidden,true);
});
test('手動班座真實兩組過關：localStorage 與成績碼保留、正確寫 guestAttempts',async()=>{
  const h=setup();h.start();await settle();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.ok(h.el('code').textContent);
  assert.equal(JSON.parse(h.stored.get('it9:w4:999-1')).mask,1);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'ybsCourses/115-g9/guestAttempts/guest1_4_0');
  assert.match(h.el('sync').textContent,/已上傳/);assert.equal(h.queue().length,0);
});
test('雲端失敗不擋過關與成績碼；換人後新班座使用新匿名 UID',async()=>{
  let fail=true;const h=setup({write:async()=>{if(fail)throw error('unavailable');}});
  h.start();await settle();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.ok(h.el('code').textContent);assert.match(h.el('sync').textContent,/紀錄暫存在本機/);
  assert.equal(JSON.parse(h.stored.get(key)).queue.length,1);
  fail=false;await h.online();h.el('b-swap').click();h.start(2);await settle();h.pass();await settle();
  assert.deepEqual(h.authCalls,['anonymous','signOut','anonymous']);assert.equal(h.calls.at(-1).data.seat,2);assert.equal(h.calls.at(-1).uid,'guest2');
});
test('匿名登入失敗仍可完成作答，不顯示登入錯誤對話框',async()=>{
  const h=setup({authFailure:'auth/network-request-failed'});h.start();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.ok(h.el('code').textContent);assert.equal(h.queue().length,1);
});
