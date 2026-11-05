// 真正的活動、判題、localStorage 與 login.js；只以 DOM/Firebase 替身隔離網路。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {setup as firebase,settle,key,error} from './fixtures/guest-firebase.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup({loginDisabled=false,whoami=async()=>({ok:true,student:{cls:'999',seat:1}}),...options}={}){
  const fb=firebase(options),body=new Element('body'),stored=fb.stored;
  const context=vm.createContext({YBS:fb.api,document:{body,addEventListener(){},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,matchMedia:()=>({matches:true})});
  // 登入表單由既有獨立測試涵蓋；此處進入真實手動班座、判題與上傳流程。
  let onLogin;
  const ybs={...fb.api,button(_,callback){onLogin=callback;},whoami};
  if(loginDisabled)ybs.enabled=()=>false;
  context.YBS=ybs;
  const html=read('115-g9/u2-02/index.html'),inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(read('assets/shell.js')+'\n'+inline,context,{timeout:3000});
  const run=source=>vm.runInContext(source,context,{timeout:3000}),el=id=>body.querySelector('#'+id);
  // 本案例的送出按鈕比照瀏覽器：disabled 時 click 不會觸發判題。
  const send=el('b-send'),click=send.click.bind(send);send.click=()=>{if(!send.disabled)click();};
  const start=(seat=1)=>{el('g-manual').click();el('in-cls').value='999';el('in-seat').value=String(seat);el('g-next').click();el('g-go').click();};
  const pass=()=>{for(let i=0;i<2;i++){run('APP.handle.fill()');el('sample-rate').onchange();el('b-send').click();}};
  const startAccount=async()=>{await fb.account();await onLogin(fb.api.profile());el('g-isme').click();};
  const login=async()=>{const me=await fb.signIn();await onLogin(me);};
  return{...fb,run,el,start,pass,startAccount,login};
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
  assert.equal(h.run('JSON.parse(localStorage.getItem("it9:w4:999-1")).mask'),0);
  assert.equal(h.calls.length,0,'第一組不應上傳');
  assert.notEqual(h.run('JSON.stringify(APP.inst)'),first);
  assert.equal(h.el('b-send').disabled,true,'新一組資料須重新填答');
  const second=h.run('JSON.stringify(APP.inst)');
  h.run('APP.handle.fill()');h.el('sample-rate').onchange();h.el('b-send').click();await settle();
  assert.match(h.el('verdict').textContent,/過關！/);assert.equal(h.el('verdict').className,'verdict ok');
  const progress=JSON.parse(h.stored.get('it9:w4:999-1'));
  assert.equal(progress.mask,1);assert.equal(progress.tries[0],2);assert.equal(h.el('code'),null);
  assert.equal(h.run('JSON.parse(localStorage.getItem("it9:w4:999-1")).mask'),1);
  assert.equal(h.run('JSON.stringify(APP.inst)'),second,'第二組過關不再換題');
  assert.equal(h.el('streak').querySelectorAll('.on').length,2,'過關同步顯示累積答對 2/2');
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
test('手動班座真實兩組過關：localStorage 與本機進度保留、正確寫 guestAttempts',async()=>{
  const h=setup();h.start();await settle();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.equal(h.el('code'),null);
  assert.equal(JSON.parse(h.stored.get('it9:w4:999-1')).mask,1);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'ybsCourses/115-g9/guestAttempts/guest1_4_0');
  assert.match(h.el('sync').textContent,/已上傳/);assert.equal(h.queue().length,0);
});
test('雲端失敗不擋過關與本機進度；換人後新班座使用新匿名 UID',async()=>{
  let fail=true;const h=setup({write:async()=>{if(fail)throw error('unavailable');}});
  h.start();await settle();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.equal(h.el('code'),null);assert.match(h.el('sync').textContent,/紀錄暫存在本機/);
  assert.equal(JSON.parse(h.stored.get(key)).queue.length,1);
  fail=false;h.advance();await h.online();h.el('b-swap').click();h.start(2);await settle();h.pass();await settle();
  assert.deepEqual(h.authCalls,['anonymous','signOut','anonymous']);assert.equal(h.calls.at(-1).data.seat,2);assert.equal(h.calls.at(-1).uid,'guest2');
});
test('匿名登入失敗仍可完成作答，不顯示登入錯誤對話框',async()=>{
  const h=setup({authFailure:'auth/network-request-failed'});h.start();h.pass();await settle();
  assert.match(h.el('verdict').textContent,/過關/);assert.equal(h.el('code'),null);assert.equal(h.queue().length,1);
});
test('帳密登入等待中改填班座：遲到登入取消並登出，班座過關只寫 guestAttempts',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const h=setup({accountLogin:()=>gate});
  const login=h.login();const cancelled=assert.rejects(login,{code:'auth/login-cancelled'});
  await settle();assert.deepEqual(h.authCalls,['password']);
  h.start(2);h.pass();await settle();
  assert.equal(h.calls.length,0,'帳密回應尚未完成，班座紀錄先留待送');
  release();await cancelled;await settle();
  assert.equal(h.api.profile(),null);assert.equal(h.auth.currentUser.isAnonymous,true);
  assert.equal(h.calls.length,1);assert.match(h.calls[0].path,/guestAttempts\/guest1_4_0$/);
  assert.equal(h.calls[0].data.seat,2);assert.equal(h.calls[0].uid,'guest1');
  assert.equal(h.el('g-who').hidden,true);assert.equal(h.el('main').hidden,false);
  assert.ok(h.authCalls.indexOf('signOut')>h.authCalls.indexOf('password'));
  h.el('b-swap').click();await h.login();h.el('g-isme').click();h.pass();await settle();
  assert.equal(h.auth.currentUser.isAnonymous,false);
  assert.match(h.calls.at(-1).path,/attempts\/account1_4_0$/);assert.equal(h.calls.at(-1).uid,'account1');
});
test('帳號名單查詢等待中改填班座，遲到名單不能復原舊入口或身分',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const h=setup({whoami:()=>gate});const login=h.login();await settle();
  assert.equal(h.el('g-who').hidden,false);h.start(2);await settle();
  release({ok:true,student:{cls:'998',seat:3}});await login;h.pass();await settle();
  assert.equal(h.el('g-who').hidden,true);assert.equal(h.el('g-whobtns').hidden,true);
  assert.equal(h.run('JSON.parse(localStorage.getItem("it9:w4:999-2")) && 2'),2);assert.equal(h.api.profile(),null);
  assert.equal(h.calls.length,1);assert.match(h.calls[0].path,/guestAttempts\//);assert.equal(h.calls[0].data.seat,2);
});
test('同班座重新開頁改填班座入口仍沿用 session 匿名 UID',async()=>{
  const first=setup();first.start();await settle();
  const next=setup({stored:first.stored,session:first.session,user:first.auth.currentUser});
  next.start();await settle();next.pass();await settle();
  assert.deepEqual(next.authCalls,[]);assert.equal(next.calls[0].uid,'guest1');
});
test('重試上傳立即略過退避，失敗與成功同步顯示於兩處，換人不送前人待送',async()=>{
  let fail=true;const h=setup({write:async()=>{if(fail)throw error('unavailable');}});
  h.start();await settle();h.pass();await settle();
  assert.equal(h.el('b-retry').hidden,false);assert.match(h.el('sync2').textContent,/還沒上傳成功/);
  fail=false;await h.el('b-retry').onclick();await settle();
  assert.equal(h.queue().length,0);assert.match(h.el('sync2').textContent,/已上傳/);
  fail=true;await h.api.submit({activity:4,round:1,cls:999,seat:1,tries:2,level:1});await settle();assert.equal(h.queue().length,1);
  h.el('b-swap').click();h.start(2);await settle();const before=h.calls.length;
  fail=false;await h.el('b-retry').onclick();await settle();assert.equal(h.calls.length,before);assert.equal(h.queue()[0].seat,1);
});
test('帳號上傳失敗可從按鈕重送，登出後按鈕不送出',async()=>{
  let fail=true;const h=setup({write:async()=>{if(fail)throw error('unavailable');}});await h.startAccount();h.pass();await settle();
  assert.match(h.el('sync2').textContent,/還沒上傳成功/);assert.equal(h.calls.length,1);
  fail=false;await h.el('b-retry').onclick();assert.equal(h.calls.length,2);assert.match(h.el('sync2').textContent,/已上傳/);
  h.el('b-swap').click();await h.el('b-retry').onclick();assert.equal(h.calls.length,2);
});
