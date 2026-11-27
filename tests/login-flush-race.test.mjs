// 合成帳號、DOM、Firebase 與事件；直接執行 login.js，以閘門控制競態順序，不連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {sessionFirebase} from './fixtures/login-session.mjs';

const source = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const entry = '  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
assert.ok(source.includes(entry));
const instrumented = source.replace(entry, `
  globalThis.flushRaceTest = {getQ, setQ, busy: () => busy};
${entry}`);
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
  return {promise, resolve, reject};
};
const denied = () => Object.assign(Error('synthetic denied'), {code:'permission-denied'});
const item = (activity = 1, extra = {}) => ({activity, round:0, level:1, tries:2, ...extra});
const queued = (activity = 1, extra = {}) => ({uid:'session-one', ...item(activity), key:activity + '_0', ...extra});

async function setup({write = () => Promise.resolve(), read = () => Promise.resolve({exists:false}), lock} = {}) {
  const stored = new Map(), shared = new Map(), calls = [], reads = [], locks = [], statuses = [], timers = [], events = new Map();
  let storageBlocked = false, cookie = 'ybslab_browser=1';
  shared.set('mock:session-user', JSON.stringify({uid:'session-one', email:'cgjh9990001@ybslab-edu.github.io',
    isAnonymous:false, providerData:[{providerId:'password'}]}));
  const storageFor = map => ({
    getItem(key) { if (map === stored && storageBlocked) throw Error('synthetic storage blocked'); return map.get(key) ?? null; },
    setItem(key, value) { if (map === stored && storageBlocked) throw Error('synthetic storage blocked'); map.set(key, value); },
    removeItem(key) { map.delete(key); }
  });
  const host = new Element('div');
  const context = vm.createContext({YBS_FULLREV_CONFIG:{enabled:false},
    location:{pathname:'/115-g9/u2-02/'},
    localStorage:storageFor(shared), sessionStorage:storageFor(stored), queueMicrotask,
    setTimeout(){}, setInterval(fn, ms) { timers.push({fn, ms}); },
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); },
    document:{querySelector:() => null, createElement:() => ({}), head:{appendChild:s => queueMicrotask(() => s.onload())},
      getElementById(id) {
        const form = host.querySelector('#' + id);
        form.a = form.querySelector('input[name="a"]');
        form.p = form.querySelector('input[name="p"]');
        return form;
      }}
  });
  context.window = context;
  Object.defineProperty(context.document, 'cookie', {get:() => cookie, set:value => { cookie = value.split(';')[0]; }});
  vm.runInContext(sessionFirebase, context);
  const {auth} = context.__sessionMock, db = context.firebase.apps[0].firestore(), originalDoc = db.doc;
  db.doc = path => !path.includes('/attempts/') ? originalDoc(path) : {
    set(data) { const call = {path, data:plain(data), uid:auth.currentUser?.uid}; calls.push(call); return write(call); },
    get(options) { const call = {path, options:options && plain(options), uid:auth.currentUser?.uid}; reads.push(call); return read(call); }
  };
  if (lock) context.navigator = {locks:{request(name, fn) { locks.push(name); return lock(name, fn); }}};
  vm.runInContext(instrumented + '\nglobalThis.api = YBS;', context);
  const {api, flushRaceTest:hook} = context;
  api.status(state => statuses.push(state));
  await api.button(host, () => {});
  const emit = (name, event = {}) => { for (const fn of events.get(name) || []) fn(event); };
  const timer = () => { for (const {fn, ms} of timers) { assert.equal(ms, 60000); fn(); } };
  return {api, hook, auth, stored, calls, reads, locks, statuses, emit, timer,
    queue:() => plain(hook.getQ()),
    blockStorage:value => { storageBlocked = value; },
    async login(account = '9990001') {
      const form = host.querySelector('form');
      form.a.value = account; form.p.value = 'synthetic-test-password';
      await form.onsubmit({preventDefault(){}});
      assert.equal(api.profile()?.account, 'cgjh' + account);
    },
    pulse() { timer(); emit('online'); emit('storage', {key:'ybslab:fq', newValue:'[]'}); }
  };
}

for (const locked of [false, true]) test(`timer、online 與無關 storage 重疊只送一次，邊界資料與其他 UID 保留：Web Locks=${locked}`, async () => {
  const gate = deferred();
  const h = await setup({lock:locked ? (_, fn) => fn() : undefined,
    write:call => call.data.activity === 1 ? gate.promise : Promise.resolve()});
  h.hook.setQ([queued(1, {tries:1}), queued(1, {uid:'session-two'}),
    queued(99, {round:5, key:'99_5', level:2, tries:999, termWeek:30})]);
  h.timer(); await tick();
  h.pulse(); h.pulse(); await h.api.flush();
  assert.equal(h.hook.busy(), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.locks.length, locked ? 1 : 0);
  assert.equal(h.queue().length, 3);
  gate.resolve(); await tick();
  assert.equal(h.hook.busy(), false);
  assert.deepEqual(h.calls.map(x => x.path), ['ybsCourses/115-g9/attempts/session-one_1_0', 'ybsCourses/115-g9/attempts/session-one_99_5']);
  assert.deepEqual(h.calls[0].data, {uid:'session-one', email:'cgjh9990001@cgjh.hcc.edu.tw',
    activity:1, round:0, level:1, tries:1, passedAt:'synthetic-timestamp', app:'ybs'});
  assert.deepEqual(h.calls[1].data, {uid:'session-one', email:'cgjh9990001@cgjh.hcc.edu.tw',
    activity:99, round:5, level:2, tries:999, termWeek:30, passedAt:'synthetic-timestamp', app:'ybs'});
  assert.deepEqual(h.queue(), [queued(1, {uid:'session-two'})]);
  assert.deepEqual(JSON.parse(h.stored.get('ybslab:fq')), h.queue());
  assert.equal(h.statuses.at(-1), 'ok');
});

test('空佇列不寫入；Auth UID 不符保留本人待送並要求重新登入', async () => {
  const h = await setup();
  h.pulse(); await h.api.flush();
  assert.equal(h.calls.length, 0);
  h.hook.setQ([queued()]);
  // Auth observer 正常會清帳號；用 currentUser getter 模擬 observer 通知前的短暫不一致。
  Object.defineProperty(h.auth, 'currentUser', {get:() => ({uid:'session-two'})});
  h.pulse(); await h.api.flush();
  assert.equal(h.hook.busy(), false);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.queue(), [queued()]);
  assert.equal(h.statuses.at(-1), 'relogin');
});

test('同關在等待寫入時重新提交，舊回應不會刪掉新物件，並接續送出', async () => {
  const first = deferred(), second = deferred();
  const h = await setup({write:call => call.data.tries === 2 ? first.promise : second.promise});
  const flushing = h.api.submit(item());
  await h.api.submit(item(1, {tries:9})); h.pulse();
  first.resolve(); await tick();
  assert.deepEqual(h.calls.map(x => x.data.tries), [2, 9]);
  assert.deepEqual(h.queue(), [queued(1, {tries:9, termWeek:0})]);
  assert.notEqual(h.statuses.at(-1), 'ok');
  second.resolve(); await flushing;
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('多個觸發重疊時失敗項目每輪只試一次，其他項目仍送出，下一輪可重試', async () => {
  const gate = deferred(); let fail = true;
  const h = await setup({write:call => call.data.activity === 1 && fail ? gate.promise : Promise.resolve()});
  h.hook.setQ([queued(), queued(2)]);
  const flushing = h.api.flush(); h.pulse(); await h.api.flush();
  gate.reject(Error('synthetic offline')); await flushing;
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.deepEqual(h.queue(), [queued()]);
  assert.equal(h.hook.busy(), false);
  assert.equal(h.statuses.at(-1), 'pending');
  fail = false; h.emit('online'); await tick();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2, 1]);
  assert.deepEqual(h.queue(), []);
});

test('儲存空間失敗時保留記憶體待送，恢復後重疊事件不讀回舊快照', async () => {
  let fail = true;
  const h = await setup({write() { if (fail) throw Error('synthetic offline'); }});
  h.blockStorage(true);
  await h.api.submit(item());
  assert.equal(h.queue().length, 1);
  assert.equal(h.hook.busy(), false);
  h.blockStorage(false); fail = false;
  h.pulse(); await tick();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.queue(), []);
  assert.deepEqual(JSON.parse(h.stored.get('ybslab:fq')), []);
});

test('Web Lock 同步例外保留待送並釋放 busy，timer 可以重試', async () => {
  let fail = true;
  const h = await setup({lock(_, fn) { if (fail) throw Error('synthetic lock failure'); return fn(); }});
  h.hook.setQ([queued()]);
  await h.api.flush();
  assert.equal(h.calls.length, 0);
  assert.equal(h.hook.busy(), false);
  assert.deepEqual(h.queue(), [queued()]);
  assert.equal(h.statuses.at(-1), 'pending');
  fail = false; h.timer(); await tick();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.queue(), []);
});

for (const phase of ['lock', 'read-missing', 'read-denied']) test(`storage 撤銷後同 UID 重新登入，等待中的舊工作不再寫入：${phase}`, async () => {
  const gate = deferred(); let firstLock = true, firstRead = true;
  const h = await setup({
    async lock(_, fn) {
      if (firstLock) { firstLock = false; if (phase === 'lock') await gate.promise; }
      return fn();
    },
    async read() {
      if (firstRead) {
        firstRead = false;
        if (phase !== 'lock') await gate.promise;
        if (phase === 'read-denied') throw denied();
      }
      return {exists:false};
    }
  });
  const flushing = h.api.submit(item()); await tick();
  h.pulse(); h.emit('storage', {key:'ybslab:account-logout'});
  assert.equal(h.api.profile(), null);
  assert.deepEqual(h.queue(), []);
  await h.login(); await h.api.submit(item(1, {tries:9})); h.pulse();
  assert.equal(h.calls.length, 0);
  gate.resolve(); await flushing;
  assert.deepEqual(h.calls.map(x => x.data.tries), [9], '只送重新登入後的新項目，不送舊快照');
  assert.deepEqual(h.queue(), []);
  assert.equal(h.hook.busy(), false);
  assert.equal(h.statuses.at(-1), 'ok');
});

for (const account of ['9990001', '9990002']) {
  for (const outcome of ['success', 'denied']) test(`舊寫入 ${outcome} 遲到，storage 撤銷及登入 ${account} 後不清新待送或查舊文件`, async () => {
    const old = deferred(), current = deferred();
    const h = await setup({write:call => call.data.tries === 2 ? old.promise : current.promise});
    const flushing = h.api.submit(item());
    h.pulse(); h.emit('storage', {key:'ybslab:account-logout'});
    await h.login(account); await h.api.submit(item(1, {tries:9})); h.pulse();
    const expected = h.queue();
    assert.equal(h.calls.length, 1);
    if (outcome === 'success') old.resolve(); else old.reject(denied());
    await tick();
    assert.equal(h.reads.length, 0, '新登入不能替舊世代查詢 permission-denied 的文件');
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].data.uid, account === '9990001' ? 'session-one' : 'session-two');
    assert.deepEqual(h.queue(), expected);
    assert.deepEqual(JSON.parse(h.stored.get('ybslab:fq')), expected);
    assert.notEqual(h.statuses.at(-1), 'ok');
    current.resolve(); await flushing;
    assert.deepEqual(h.queue(), []);
    assert.equal(h.hook.busy(), false);
    assert.equal(h.statuses.at(-1), 'ok');
  });
}

for (const phase of ['write', 'exists', 'fallback']) test(`登出後舊 ${phase} 成功回應不重建已清除的帳號佇列`, async () => {
  const gate = deferred();
  const h = await setup({
    lock:phase === 'exists' ? (_, fn) => fn() : undefined,
    write:() => phase === 'fallback' ? Promise.reject(denied()) : gate.promise,
    read:() => gate.promise
  });
  const flushing = h.api.submit(item()); await tick();
  await h.api.logout(); h.pulse();
  assert.equal(h.stored.has('ybslab:fq'), false);
  gate.resolve({exists:true}); await flushing;
  assert.equal(h.api.profile(), null);
  assert.deepEqual(h.queue(), []);
  assert.equal(h.stored.has('ybslab:fq'), false);
  assert.equal(h.hook.busy(), false);
});

test('同 UID 直接重新登入也作廢舊讀取；保留待送至下一輪確認', async () => {
  const gate = deferred(); let first = true;
  const h = await setup({lock:(_, fn) => fn(), read() {
    if (first) { first = false; return gate.promise; }
    return Promise.resolve({exists:true});
  }});
  h.hook.setQ([queued()]);
  const flushing = h.api.flush(); await tick();
  await h.login();
  gate.resolve({exists:true}); await flushing;
  assert.deepEqual(h.queue(), [queued()], '舊登入的完成通知不可移除新世代保留的資料');
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.calls.length, 0);
  h.timer(); await tick();
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
});
