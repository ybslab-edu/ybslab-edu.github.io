// 執行真正的 login.js 與表單；只有 DOM、Firebase、儲存空間為合成替身。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {sessionFirebase} from './fixtures/login-session.mjs';
const source = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const student = {uid:'session-one',email:'cgjh9990001@ybslab-edu.github.io',isAnonymous:false};
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({user = student,hold = false,storage = new Map(),cookie = true,cookiesBlocked = false} = {}) {
  const shared = new Map([['mock:session-user', JSON.stringify(user)]]);
  let cookieValue = cookie ? 'ybslab_browser=1' : '';
  const storageFor = map => ({getItem:k => map.get(k) ?? null,setItem:(k,v) => map.set(k,v),removeItem:k => map.delete(k)});
  const host = new Element('div');
  const context = vm.createContext({
    location:{pathname:'/115-g9/u2-02/'},
    localStorage:storageFor(shared),sessionStorage:storageFor(storage),
    queueMicrotask,setInterval(){},setTimeout(){},addEventListener(){},__holdSessionAuth:hold,
    document:{querySelector:() => null,createElement:() => ({}),head:{appendChild:s => queueMicrotask(() => s.onload())},
      getElementById(id) {
        const form = host.querySelector('#' + id);
        form.a = form.querySelector('input[name="a"]');
        form.p = form.querySelector('input[name="p"]');
        return form;
      }}
  });
  context.window = context;
  Object.defineProperty(context.document,'cookie',{get:() => cookieValue,set:value => {if (!cookiesBlocked) cookieValue = value.split(';')[0];}});
  vm.runInContext(sessionFirebase, context);
  vm.runInContext(source + '\nglobalThis.api = YBS;', context);
  return {api:context.api,mock:context.__sessionMock,host,storage,shared,cookie:() => cookieValue};
}
const plain = value => JSON.parse(JSON.stringify(value));
test('同分頁換頁：等待初始 Auth，再由登入信箱恢復 roster profile 並通知入口', async () => {
  const h = setup({hold:true}), received = [];
  const restoring = h.api.button(h.host, p => received.push(plain(p)));
  await tick();
  assert.equal(h.api.profile(), null);
  assert.equal(received.length, 0);
  assert.equal(typeof h.mock.releaseAuth, 'function', '登入入口必須主動等待 Auth 初始狀態');
  h.mock.releaseAuth();
  await restoring;
  assert.deepEqual(received, [{uid:'session-one',account:'cgjh9990001',email:'cgjh9990001@cgjh.hcc.edu.tw'}]);
  assert.deepEqual(plain(h.api.profile()), received[0]);
  assert.deepEqual(plain(await h.api.whoami()), {ok:true,student:{cls:999,seat:1}});
  assert.deepEqual(plain(h.mock.persistence), ['local']);
  assert.equal(h.mock.signins.length, 0);
  assert.equal(h.mock.signouts, 0);
});
test('沿用帳號後只重送本人待送紀錄，保留其他 UID 的項目', async () => {
  const storage = new Map([['ybslab:fq', JSON.stringify(['session-one','session-two'].map(uid => ({uid,activity:4,round:0,level:1,tries:2})))]]);
  const h = setup({storage});
  await h.api.button(h.host, () => {});
  await tick();
  assert.deepEqual(plain(h.mock.writes).map(x => [x.path,x.data.email]), [['ybsCourses/115-g9/attempts/session-one_4_0','cgjh9990001@cgjh.hcc.edu.tw']]);
  assert.deepEqual(JSON.parse(storage.get('ybslab:fq')).map(x => x.uid), ['session-two']);
});
for (const user of [null,{uid:'guest',isAnonymous:true},
  {uid:'teacher',email:'teacher@example.invalid',isAnonymous:false},
  {uid:'other',email:'cgjh9990001@example.invalid',isAnonymous:false}]) {
  test(`未登入、匿名及非學生帳號不恢復學生身分：${user?.uid || 'null'}`, async () => {
    const h = setup({user});let received = 0;
    await h.api.button(h.host, () => received++);
    assert.equal(h.api.profile(), null);
    assert.equal(received, 0);
    assert.equal(h.mock.signouts, 0);
  });
}
for (const keepAnonymous of [false,true]) test(`初始化較慢時登出／改填班座不會被舊帳號恢復覆蓋：${keepAnonymous}`, async () => {
  const h = setup({hold:true});let received = 0;
  const restoring = h.api.button(h.host, () => received++);
  await tick();
  const logout = h.api.logout({keepAnonymous});
  h.mock.releaseAuth?.();
  await Promise.all([restoring,logout]);
  assert.equal(h.api.profile(), null);
  assert.equal(received, 0);
  assert.equal(h.mock.auth.currentUser, null, '必須清除仍在初始化的帳號，避免下次換頁又恢復舊帳號');
});
test('手動登入較慢時，自動恢復不可把舊帳號送給入口', async () => {
  const h = setup({hold:true}), received = [];
  const restoring = h.api.button(h.host, p => received.push(p.uid));
  const form = h.host.querySelector('form');
  form.a.value = '9990002';form.p.value = 'synthetic-test-password';
  const signingIn = form.onsubmit({preventDefault(){}});
  await tick();h.mock.releaseAuth();
  await Promise.all([restoring,signingIn]);
  assert.deepEqual(received, ['session-two']);
  assert.equal(h.api.profile().uid, 'session-two');
});
test('初始 Auth 出錯仍能手動登入重試', async () => {
  const h = setup();let callbacks = 0;
  const observe = h.mock.auth.onAuthStateChanged;
  h.mock.auth.onAuthStateChanged = (ok,bad) => {queueMicrotask(() => bad(Error('synthetic offline')));return () => {};};
  await h.api.button(h.host, () => callbacks++);
  assert.equal(h.api.profile(), null);
  h.mock.auth.onAuthStateChanged = observe;
  const form = h.host.querySelector('form');
  form.a.value = '9990002';form.p.value = 'synthetic-test-password';
  await form.onsubmit({preventDefault(){}});
  assert.equal(h.api.profile().uid, 'session-two');
  assert.equal(callbacks, 1);
});
test('LOCAL 帳號存在但瀏覽器 cookie 消失：登出並清帳號暫存，保留班座資料', async () => {
  const storage = new Map([['ybslab:fq','[]'],['ybslab:reports:115-df','[]'],['ybslab:guest-identity','synthetic guest binding']]);
  const h = setup({cookie:false,storage});let received = 0;
  await h.api.button(h.host, () => received++);
  assert.equal(h.mock.signouts, 1);
  assert.equal(h.mock.auth.currentUser, null);
  assert.equal(h.api.profile(), null);
  assert.equal(received, 0);
  assert.equal(storage.has('ybslab:fq'), false);
  assert.equal(storage.has('ybslab:reports:115-df'), false);
  assert.equal(storage.get('ybslab:guest-identity'), 'synthetic guest binding');
});
test('真正帳密登入建立瀏覽器 cookie，明確登出移除 cookie', async () => {
  const h = setup({user:null,cookie:false});
  await h.api.button(h.host, () => {});
  const form = h.host.querySelector('form');
  form.a.value = '9990001';form.p.value = 'synthetic-test-password';
  await form.onsubmit({preventDefault(){}});
  assert.equal(h.cookie(), 'ybslab_browser=1');
  assert.equal(h.mock.persistence.at(-1), 'local');
  await h.api.logout();
  assert.equal(h.cookie(), 'ybslab_browser=');
});
test('cookie 遭封鎖時不留下無標記的 LOCAL 帳號，保留班座替代入口', async () => {
  const h = setup({user:null,cookie:false,cookiesBlocked:true}), errors = [];
  await h.api.button(h.host, () => assert.fail('不應登入成功'), message => errors.push(message));
  const form = h.host.querySelector('form');
  form.a.value = '9990001';form.p.value = 'synthetic-test-password';
  await form.onsubmit({preventDefault(){}});
  assert.equal(h.api.profile(), null);
  assert.equal(h.mock.auth.currentUser, null);
  assert.match(errors[0], /cookie.*班座/);
});
test('瀏覽器重開清理舊帳號時，已輸入的新帳密只需登入一次', async () => {
  const h = setup({cookie:false,hold:true}), received = [], errors = [];
  const restoring = h.api.button(h.host, p => received.push(p.uid), message => errors.push(message));
  const form = h.host.querySelector('form');
  form.a.value = '9990002';form.p.value = 'synthetic-test-password';
  const signingIn = form.onsubmit({preventDefault(){}});
  await tick();h.mock.releaseAuth();
  await Promise.all([restoring,signingIn]);
  assert.deepEqual(received,['session-two']);
  assert.deepEqual(errors,[]);
  assert.equal(h.api.profile()?.uid,'session-two');
  assert.equal(h.mock.signouts,1);
});
