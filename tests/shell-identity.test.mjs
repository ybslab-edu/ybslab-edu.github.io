// 真正 shell 的身分、確認、作答與進度流程；僅用合成帳號及離線 DOM。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const shell = readFileSync(new URL('../assets/shell.js',import.meta.url),'utf8');
const tick = async () => {for(let i=0;i<8;i++) await Promise.resolve();};
function setup({teacher=false}={}) {
  const stored = new Map(), body = new Element('body'), writes = [], apis = [];
  let profile = teacher ? null : {uid:'synthetic-a',email:'a@example.invalid'}, saved = {uid:'synthetic-a',email:'a@example.invalid'};
  let status, login, logouts = 0, remembered = teacher;
  const context = vm.createContext({
    document:{body,getElementById:id => body.querySelector('#'+id),createElement:tag => new Element(tag)},
    window:{},setTimeout(){},matchMedia:() => ({matches:true}),
    localStorage:{getItem:k => stored.get(k) ?? null,setItem:(k,v) => stored.set(k,v)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:() => remembered,remember:value => {remembered=value;}},
    YBS:{enabled:() => true,profile:() => profile,status:fn => {status=fn;},
      button(_,ok){login=ok;if(saved)queueMicrotask(() => {profile=saved;ok(profile);});},
      whoami:async () => ({ok:true,student:{cls:999,seat:profile.uid==='synthetic-a'?1:2}}),
      logout(){logouts++;profile=null;saved=null;return Promise.resolve();},leaveGuest(){},flush(){},
      submit:item => writes.push({...item,uid:profile.uid})},
    capture:api => apis.push(api)
  });
  const instrumented = shell.replace('  shellCreateInterface(s);','  globalThis.identityState = s;\n  shellCreateInterface(s);');
  assert.notEqual(instrumented,shell);
  vm.runInContext(instrumented + `
    let draw=0;
    const APP=SHELL({course:'115-g9',week:4,title:'合成活動',rounds:[{name:'合成關卡',lv:1,
      gen:()=>({n:++draw}),check:()=>true,view:(inst,el,api)=>{capture(api);el.textContent='合成作答';return {get:()=>inst.n,ready:()=>true};}}]});`,context);
  const el=id => body.querySelector('#'+id);
  return {stored,writes,apis,el,state:context.identityState,logouts:() => logouts,remembered:() => remembered,
    revoke(){profile=null;saved=null;status('relogin');},
    async loginB(){profile=saved={uid:'synthetic-b',email:'b@example.invalid'};await login(profile);},
    send(){el('b-send').click();}};
}
test('撤銷清除活動身分；舊確認與遲到 view 回呼不能更新 A 或 B 的進度',async()=>{
  const h=setup();await tick();
  const oldConfirm=h.el('g-isme').onclick;h.el('g-isme').click();
  h.send();const beforeA=h.stored.get('it9:w4:999-1'),oldApi=h.apis.at(-1);
  h.revoke();await tick();
  assert.equal(h.state.ident,null);
  assert.equal(h.state.handle,null);
  assert.equal(h.state.inst,null);
  assert.equal(h.state.streak,0);
  assert.equal(h.state.prog.mask,0);
  assert.ok(h.state.prog.tries.every(n=>n===0));
  assert.equal(h.el('who').textContent,'');
  assert.equal(h.el('stage').textContent,'');
  await h.loginB();oldConfirm();
  assert.equal(h.state.ident,null,'A 的舊確認按鈕不能跳過 B 班座確認');
  assert.match(h.el('g-whotext').textContent,/999 班 2 號/);
  h.el('g-isme').click();
  oldApi.attempt();oldApi.changed();
  assert.ok(h.state.prog.tries.every(n=>n===0),'A 的遲到 view 不得記入 B 作答次數');
  h.send();h.send();
  assert.equal(h.stored.get('it9:w4:999-1'),beforeA);
  assert.equal(JSON.parse(h.stored.get('it9:w4:999-2')).mask,1);
  assert.deepEqual(h.writes.map(x=>[x.uid,x.cls,x.seat]),[['synthetic-b',999,2]]);
});
test('記憶教師模式沒有 profile 仍必須登出 Auth，不能恢復原學生',async()=>{
  const h=setup({teacher:true});
  assert.equal(h.el('b-swap').textContent,'登出教師模式');
  h.el('b-swap').click();await tick();
  assert.equal(h.logouts(),1);
  assert.equal(h.remembered(),false);
  assert.equal(h.el('g-login').hidden,false);
  assert.equal(h.el('g-who').hidden,true);
  assert.equal(h.state.ident,null);
});
