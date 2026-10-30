// 僅用合成資料與 Firebase mock，直接執行實際 login.js；不連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const entry = '  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
assert.ok(source.includes(entry));
const instrumented = source.replace(entry, `
  globalThis.queueTest = {getQ, setQ, busy: () => busy,
    login: (p, firebaseMock) => { profile = p; fb = firebaseMock; }};
${entry}`);
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
};
const item = activity => ({activity, round: 1, level: 2, tries: 3, termWeek: 5});
function setup({storageFails = false, storageWriteFails = false, write = async () => {}, exists = false, docThrows = false} = {}) {
  const stored = new Map(), calls = [], reads = [], statuses = [], timers = [], events = new Map();
  let blocked = storageFails, failDoc = docThrows;
  const storage = {
    getItem(key) { if (blocked) throw Error('storage blocked'); return stored.get(key) || null; },
    setItem(key, value) { if (blocked || storageWriteFails) throw Error('storage blocked'); stored.set(key, value); },
    removeItem(key) { stored.delete(key); }
  };
  const auth = {currentUser: {uid: 'u1'}, signOut() { this.currentUser = null; }};
  const db = {doc(path) {
    if (failDoc) throw Error('doc exception');
    return {
      set(data) { calls.push({path, data}); return write(data, path); },
      async get() { reads.push(path); return {exists}; }
    };
  }};
  const context = vm.createContext({
    location: {pathname: '/115-g9/u1-01/'}, sessionStorage: storage, localStorage: {},
    setInterval(fn, ms) { timers.push({fn, ms}); },
    window: {addEventListener(name, fn) { events.set(name, fn); }},
    firebase: {firestore: {FieldValue: {serverTimestamp: () => 'synthetic-timestamp'}}}
  });
  vm.runInContext(instrumented + '\nglobalThis.api = YBS;', context);
  const {api, queueTest: hook} = context;
  const login = uid => {
    auth.currentUser = {uid};
    hook.login({uid, email: uid + '@example.invalid'}, {auth, db});
  };
  login('u1');
  api.status(status => statuses.push(status));
  return {api, hook, calls, reads, statuses, auth, login, timers, events,
    queue: () => JSON.parse(JSON.stringify(hook.getQ())),
    blockStorage: value => { blocked = value; },
    failDoc: value => { failDoc = value; }};
}

test('第一筆卡住時加入第二筆，同次 flush 都送出且最後才回報 ok', async () => {
  const gate = deferred();
  const h = setup({write: data => data.activity === 1 ? gate.promise : Promise.resolve()});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2));
  assert.equal(h.hook.busy(), true);
  assert.equal(h.calls.length, 1);
  assert.ok(!h.statuses.includes('ok'));
  gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
  assert.equal(h.hook.busy(), false);
  assert.equal(h.calls[0].path, 'ybsCourses/115-g9/attempts/u1_1_1');
  assert.deepEqual({...h.calls[0].data}, {
    uid: 'u1', email: 'u1@example.invalid', activity: 1, round: 1,
    level: 2, tries: 3, termWeek: 5, passedAt: 'synthetic-timestamp', app: 'ybs'
  });
});

test('第二筆失敗保留並回報 pending，下次 flush 只重送失敗項目', async () => {
  const gate = deferred(); let fail = true;
  const h = setup({write: async data => {
    if (data.activity === 1) await gate.promise;
    if (data.activity === 2 && fail) throw Error('offline');
  }});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2)); gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.deepEqual(h.queue().map(x => x.activity), [2]);
  assert.equal(h.statuses.at(-1), 'pending');
  fail = false; await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2, 2]);
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('同步寫入例外後 busy 復原，online 能重試', async () => {
  let fail = true;
  const h = setup({write() { if (fail) throw Error('set exception'); }});
  await h.api.submit(item(1));
  assert.equal(h.hook.busy(), false);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.queue().length, 1);
  fail = false; await h.events.get('online')(); await h.api.flush();
  assert.equal(h.calls.length, 2);
  assert.equal(h.queue().length, 0);
});

test('建立 ref 丟例外也保留項目並復原 busy', async () => {
  const h = setup({docThrows: true});
  await h.api.submit(item(1));
  assert.equal(h.hook.busy(), false);
  assert.equal(h.queue().length, 1);
  assert.equal(h.statuses.at(-1), 'pending');
  h.failDoc(false); await h.api.flush();
  assert.equal(h.queue().length, 0);
});

for (const exists of [true, false]) test(`permission-denied，文件存在=${exists}`, async () => {
  const h = setup({exists, write() { throw {code: 'permission-denied'}; }});
  await h.api.submit(item(1));
  assert.equal(h.reads.length, 1);
  assert.equal(h.queue().length, exists ? 0 : 1);
  assert.equal(h.statuses.at(-1), exists ? 'ok' : 'pending');
  assert.equal(h.hook.busy(), false);
});

for (const mode of ['讀寫均失敗', '僅寫入失敗']) test(`sessionStorage ${mode}仍保留待送項目且能完成`, async () => {
  let fail = true;
  const h = setup({storageFails: mode === '讀寫均失敗', storageWriteFails: mode === '僅寫入失敗', write() { if (fail) throw Error('offline'); }});
  await h.api.submit(item(1));
  assert.equal(h.queue().length, 1);
  assert.equal(h.statuses.at(-1), 'pending');
  h.blockStorage(false); // 恢復後不可從舊 storage 讀回空佇列
  fail = false; await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 1]);
  assert.equal(h.queue().length, 0);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('只送目前 uid；保留其他人的項目', async () => {
  const h = setup();
  h.hook.setQ([{uid: 'u2', key: '2_1', ...item(2)}]);
  await h.api.submit(item(1));
  assert.deepEqual(h.calls.map(x => x.data.uid), ['u1']);
  assert.deepEqual(h.queue().map(x => x.uid), ['u2']);
});

test('送出期間換人，不把前一人的剩餘項目送到新帳號', async () => {
  const gate = deferred();
  const h = setup({write: data => data.activity === 1 ? gate.promise : Promise.resolve()});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2));
  h.api.logout(); h.login('u2'); await h.api.submit(item(3));
  gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => [x.data.uid, x.data.activity]), [['u1', 1], ['u2', 3]]);
  assert.deepEqual(h.queue().map(x => [x.uid, x.activity]), [['u1', 2]]);
});

test('同關在送出期間重新提交，也保留新項目接著送', async () => {
  const gate = deferred();
  const h = setup({write: () => gate.promise});
  const first = h.api.submit(item(1));
  await h.api.submit({...item(1), tries: 4}); gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => x.data.tries), [3, 4]);
  assert.equal(h.queue().length, 0);
});

test('狀態回呼丟例外，finally 仍復原 busy 且保留未送項目', async () => {
  const h = setup();
  h.api.status(() => { throw Error('status exception'); });
  await assert.rejects(h.api.submit(item(1)), /status exception/);
  assert.equal(h.hook.busy(), false);
  assert.equal(h.queue().length, 1);
  h.api.status(s => h.statuses.push(s)); await h.api.flush();
  assert.equal(h.statuses.at(-1), 'ok');
});
