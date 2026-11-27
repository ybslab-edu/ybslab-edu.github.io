// 僅用合成資料與 Firebase mock，直接執行實際 login.js；不連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import DFReport from '../assets/df-report.js';
import {fakeFirebase} from './fixtures/df-firebase.mjs';

const source = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const entry = '  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
assert.ok(source.includes(entry));
const instrumented = source.replace(entry, `
  globalThis.queueTest = {getQ, setQ, busy: () => busy,
    login: (p, firebaseMock) => { profile = p; fb = firebaseMock; }};
${entry}`);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
  return {promise, resolve, reject};
};
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await tick(); }
  assert.fail('等待合成非同步工作完成逾時');
}
const item = activity => ({activity, round: 1, level: 2, tries: 3, termWeek: 5});
function setup({storageFails = false, storageWriteFails = false, write = async () => {}, exists = false,
  read = async () => ({exists}), docThrows = false, initialStorage = [], webLocks = false} = {}) {
  const stored = new Map(initialStorage), calls = [], reads = [], statuses = [], timers = [], events = new Map();
  const lockRequests = [], lockReleases = [];
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
      async get() { reads.push(path); return read(path); }
    };
  }};
  const context = vm.createContext({YBS_FULLREV_CONFIG:{enabled:false},
    location: {pathname: '/115-g9/u1-01/'}, sessionStorage: storage, localStorage: {},
    navigator: webLocks ? {locks: {async request(name, callback) {
      lockRequests.push(name);
      try { return await callback(); }
      finally { lockReleases.push(name); }
    }}} : undefined,
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
  return {api, hook, calls, reads, statuses, auth, login, timers, events, stored, lockRequests, lockReleases,
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

test('第一筆持續失敗不擋後續項目，每次觸發最多重送該筆一次並釋放 busy', async () => {
  const h = setup({write: async data => {
    if (data.activity === 1) throw Error('synthetic permanent failure');
  }});
  const other = {uid: 'u2', key: '3_1', ...item(3)};
  h.hook.setQ([other, ...[1, 2].map(activity => ({uid: 'u1', key: activity + '_1', ...item(activity)}))]);
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.deepEqual(h.queue().map(x => [x.uid, x.activity]), [['u2', 3], ['u1', 1]]);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  assert.equal(h.timers.at(-1).ms, 60000);
  for (const trigger of [() => h.api.flush(), () => h.events.get('online')(),
    () => h.timers.at(-1).fn(), () => h.api.retry()]) {
    const before = h.calls.length;
    await trigger();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, before + 1);
    assert.equal(h.hook.busy(), false);
    assert.equal(h.statuses.at(-1), 'pending');
  }
  await h.api.submit(item(4));
  assert.deepEqual(h.calls.slice(-2).map(x => x.data.activity), [1, 4]);
  assert.equal(h.queue().length, 2);
});

test('失敗期間同關重新提交留待下次重試，不在同輪重複嘗試新物件', async () => {
  const gate = deferred(); let fail = true;
  const h = setup({write: async data => {
    if (data.activity === 1 && fail) { await gate.promise; throw Error('synthetic permanent failure'); }
  }});
  const first = h.api.submit(item(1));
  await h.api.submit({...item(1), tries: 4});
  await h.api.submit(item(2));
  gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.deepEqual(h.queue().map(x => [x.activity, x.tries]), [[1, 4]]);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  fail = false; await h.api.retry();
  assert.deepEqual(h.calls.map(x => [x.data.activity, x.data.tries]), [[1, 3], [2, 3], [1, 4]]);
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('Web Locks 查詢持續失敗時同關重提不在同輪重試，後續項目仍送出並釋放 busy', async () => {
  const gate = deferred(); let fail = true;
  const path = 'ybsCourses/115-g9/attempts/u1_1_1';
  const lock = 'ybslab:attempt:115-g9:u1:';
  const h = setup({webLocks: true, read: async currentPath => {
    if (currentPath === path && fail) { await gate.promise; throw Error('synthetic permanent read failure'); }
    return {exists: false};
  }});
  const first = h.api.submit(item(1));
  await h.api.submit({...item(1), tries: 4});
  await h.api.submit(item(2));
  assert.deepEqual(h.reads, [path]);
  assert.equal(h.calls.length, 0, '查詢尚未完成時不得寫入');
  assert.deepEqual(h.lockReleases, []);
  assert.equal(h.hook.busy(), true);
  gate.resolve(); await first;
  assert.deepEqual(h.reads, [path, 'ybsCourses/115-g9/attempts/u1_2_1']);
  assert.deepEqual(h.calls.map(x => x.data.activity), [2]);
  assert.deepEqual(h.queue().map(x => [x.activity, x.tries]), [[1, 4]]);
  assert.deepEqual(h.lockRequests, [lock + '1_1', lock + '2_1']);
  assert.deepEqual(h.lockReleases, h.lockRequests);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  await h.api.retry();
  assert.deepEqual(h.reads, [path, 'ybsCourses/115-g9/attempts/u1_2_1', path]);
  assert.deepEqual(h.calls.map(x => x.data.activity), [2]);
  assert.deepEqual(h.queue().map(x => [x.activity, x.tries]), [[1, 4]]);
  assert.deepEqual(h.lockRequests, [lock + '1_1', lock + '2_1', lock + '1_1']);
  assert.deepEqual(h.lockReleases, h.lockRequests);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  fail = false; await h.api.retry();
  assert.deepEqual(h.calls.map(x => [x.data.activity, x.data.tries]), [[2, 3], [1, 4]]);
  assert.deepEqual(h.queue(), []);
  assert.deepEqual(h.lockRequests, [lock + '1_1', lock + '2_1', lock + '1_1', lock + '1_1']);
  assert.deepEqual(h.lockReleases, h.lockRequests);
  assert.equal(h.statuses.at(-1), 'ok');
  assert.equal(h.hook.busy(), false);
});

test('Web Locks 同 UID 同活動第一關持續失敗，仍送出不同 round 並釋放 busy', async () => {
  const h = setup({webLocks: true, write: async data => {
    if (data.round === 1) throw Error('synthetic permanent write failure');
  }});
  h.hook.setQ([1, 2].map(round => ({uid: 'u1', ...item(1), round, key: '1_' + round})));
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => [x.data.uid, x.data.activity, x.data.round]), [['u1', 1, 1], ['u1', 1, 2]]);
  assert.deepEqual(h.queue().map(x => [x.uid, x.activity, x.round]), [['u1', 1, 1]]);
  assert.deepEqual(h.lockRequests, ['ybslab:attempt:115-g9:u1:1_1', 'ybslab:attempt:115-g9:u1:1_2']);
  assert.deepEqual(h.lockReleases, h.lockRequests);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.round), [1, 2, 1]);
  assert.deepEqual(h.queue().map(x => x.round), [1]);
  assert.deepEqual(h.lockReleases, h.lockRequests);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
});

test('同 uid 同關重複待送且持續被拒，每輪只嘗試一次並保留後續項目的機會', async () => {
  const h = setup({write() { throw {code: 'permission-denied'}; }});
  h.hook.setQ([1, 1, 1, 2].map(activity => ({uid: 'u1', key: activity + '_1', ...item(activity)})));
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.equal(h.reads.length, 2);
  assert.equal(h.queue().length, 4, '未確認成功的項目不得移除');
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2, 1, 2]);
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

test('permission-denied 後確認紀錄也失敗，保留待送且不阻擋後續項目', async () => {
  const h = setup({write: async data => {
    if (data.activity === 1) throw {code: 'permission-denied'};
  }, read() { throw Error('synthetic read failure'); }});
  h.hook.setQ([1, 2].map(activity => ({uid: 'u1', key: activity + '_1', ...item(activity)})));
  await h.api.flush();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.equal(h.reads.length, 1);
  assert.deepEqual(h.queue().map(x => x.activity), [1]);
  assert.equal(h.statuses.at(-1), 'pending');
  assert.equal(h.hook.busy(), false);
  await h.api.submit(item(3));
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2, 1, 3]);
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
  await h.api.logout(); h.login('u2'); await h.api.submit(item(3));
  gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => [x.data.uid, x.data.activity]), [['u1', 1], ['u2', 3]]);
  assert.deepEqual(h.queue(), [], '明確換人清除前一人的待送，不留給下一位');
});

test('前一人同關失敗，不阻擋送出期間換人的新帳號', async () => {
  const gate = deferred();
  const h = setup({write: async data => {
    if (data.uid === 'u1') { await gate.promise; throw Error('synthetic permanent failure'); }
  }});
  const first = h.api.submit(item(1));
  await h.api.logout(); h.login('u2'); await h.api.submit(item(1));
  gate.resolve(); await first;
  assert.deepEqual(h.calls.map(x => [x.data.uid, x.data.activity]), [['u1', 1], ['u2', 1]]);
  assert.deepEqual(h.queue(), []);
  assert.equal(h.statuses.at(-1), 'ok');
  assert.equal(h.hook.busy(), false);
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

test('flush、retry、online 與定時器並行觸發時，同一筆只送一次', async () => {
  const gate = deferred();
  const h = setup({write: data => data.activity === 1 ? gate.promise : Promise.resolve()});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2));
  await Promise.all([h.api.flush(), h.api.retry(), h.events.get('online')()]);
  for (const timer of h.timers) timer.fn();
  assert.equal(h.calls.length, 1);
  assert.equal(h.api.hasPending(), true);
  assert.ok(!h.statuses.includes('ok'));
  gate.resolve(); await first;
  await h.api.retry();
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 2]);
  assert.equal(h.api.hasPending(), false);
  assert.equal(h.statuses.at(-1), 'ok');
});

for (const outcome of ['成功', '失敗']) test(`登出後舊請求${outcome}，不刪除新 UID 的同關紀錄`, async () => {
  const gate = deferred();
  const h = setup({write: data => data.uid === 'u1' ? gate.promise : Promise.resolve(),
    initialStorage: [['ybslab:reports:115-df', '[{"uid":"u1","payload":"synthetic draft"}]']]});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2));
  await h.api.logout();
  assert.equal(h.api.profile(), null);
  assert.equal(h.api.hasPending(), false);
  assert.equal(h.stored.has('ybslab:fq'), false);
  assert.equal(h.stored.has('ybslab:reports:115-df'), false);
  h.login('u2');
  await h.api.submit({...item(1), tries: 8});
  assert.equal(h.calls.length, 1, '舊請求完成前不另啟上傳');
  assert.equal(h.api.hasPending(), true);
  if (outcome === '成功') gate.resolve(); else gate.reject(Error('synthetic offline'));
  await first;
  assert.deepEqual(h.calls.map(x => [x.path, x.data.uid, x.data.email, x.data.tries]), [
    ['ybsCourses/115-g9/attempts/u1_1_1', 'u1', 'u1@example.invalid', 3],
    ['ybsCourses/115-g9/attempts/u2_1_1', 'u2', 'u2@example.invalid', 8]
  ]);
  assert.equal(h.api.hasPending(), false);
  assert.deepEqual(JSON.parse(h.stored.get('ybslab:fq')), []);
  assert.equal(h.statuses.at(-1), 'ok');
});

for (const uid of [null, 'u2']) test(`送出途中 Auth 變成 ${uid}，剩餘紀錄等原 UID 恢復才重試`, async () => {
  const gate = deferred();
  const h = setup({write: data => data.activity === 1 ? gate.promise : Promise.resolve()});
  const first = h.api.submit(item(1));
  await h.api.submit(item(2));
  h.auth.currentUser = uid ? {uid} : null;
  gate.resolve(); await first;
  assert.equal(h.calls.length, 1);
  assert.equal(h.api.hasPending(), true);
  assert.equal(h.statuses.at(-1), 'relogin');
  await h.api.retry();
  assert.equal(h.calls.length, 1, '身分不符時重試也不能寫入');
  h.auth.currentUser = {uid: 'u1'};
  await h.api.retry();
  assert.deepEqual(h.calls.map(x => [x.data.uid, x.data.activity]), [['u1', 1], ['u1', 2]]);
  assert.equal(h.api.hasPending(), false);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('permission-denied 後查證也斷線，保留原紀錄並能以公開 retry 恢復', async () => {
  let fail = true;
  const h = setup({
    write() { if (fail) throw {code: 'permission-denied'}; },
    read() { throw Error('synthetic read offline'); }
  });
  await h.api.submit(item(1));
  assert.equal(h.reads.length, 1);
  assert.equal(h.api.hasPending(), true);
  assert.equal(h.statuses.at(-1), 'pending');
  fail = false; await h.api.retry();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.calls[1], h.calls[0], '恢復後仍送相同 UID、路徑與內容');
  assert.equal(h.api.hasPending(), false);
  assert.equal(h.statuses.at(-1), 'ok');
});

test('儲存空間恢復後不復活舊待送紀錄，完成結果也寫回儲存空間', async () => {
  let fail = true;
  const h = setup({storageFails: true,
    initialStorage: [['ybslab:fq', JSON.stringify([{uid: 'u1', key: '2_1', ...item(2)}])]],
    write() { if (fail) throw Error('synthetic offline'); }
  });
  await h.api.submit(item(1));
  assert.equal(h.api.hasPending(), true);
  h.blockStorage(false); fail = false;
  await h.api.submit(item(3));
  assert.deepEqual(h.calls.map(x => x.data.activity), [1, 1, 3]);
  assert.equal(h.api.hasPending(), false);
  assert.deepEqual(JSON.parse(h.stored.get('ybslab:fq')), []);
});

// 執行實際報告佇列與未插樁的 login.js；只替代 DOM、時鐘、儲存空間與 Firebase。
const reportHTML = readFileSync(new URL('../115-df/a/index.html', import.meta.url), 'utf8');
const reportStart = reportHTML.indexOf('/* ---------- report hand-in');
const reportEnd = reportHTML.indexOf('/* ---------- generic bind helpers', reportStart);
assert.ok(reportStart >= 0 && reportEnd > reportStart);
const reportManager = reportHTML.slice(reportStart, reportEnd);
const REPORT_KEY = 'ybslab:reports:115-df';
class ReportElement {
  constructor() { this.childNodes = []; this.dataset = {}; this.disabled = false; this.text = ''; }
  set textContent(value) { this.text = value; this.childNodes = []; }
  get textContent() { return this.text + this.childNodes.map(x => x.textContent).join(''); }
  appendChild(child) { this.childNodes.push(child); return child; }
  replaceChildren() { this.text = ''; this.childNodes = []; }
}
async function setupReports({encode = DFReport.encode, stored = new Map()} = {}) {
  let time = 1792598400000, nextId = 0;
  const timers = new Map(), events = new EventTarget();
  const storage = map => ({getItem: k => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k)});
  const form = {a: {value: '', focus() {}}, p: {value: ''}, querySelector: () => new ReportElement()};
  const panel = new ReportElement(), button = new ReportElement();
  const c = vm.createContext({YBS_FULLREV_CONFIG: {enabled: false}, queueMicrotask,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [time])); }
      static now() { return time; }
    },
    setInterval() {},
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, {fn, at: time + ms}); return id; },
    clearTimeout: id => timers.delete(id),
    Event, CustomEvent: class extends Event {
      constructor(type, options) { super(type); this.detail = options.detail; }
    },
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    location: {pathname: '/115-df/a/'}, sessionStorage: storage(stored), localStorage: storage(new Map()),
    document: {querySelector: () => null, getElementById: () => form, createElement: () => new ReportElement(),
      head: {appendChild: script => queueMicrotask(() => script.onload())}},
    $: selector => ({'#report-panel': panel, '#report-send': button})[selector],
    toast() {}, confirm: () => true, newCid: () => 'synthetic-' + ++nextId,
    DFReport: {...DFReport, encode}, recOn: true, impWho: {cls: '999', seat: '1'},
    S: {app: 'DF-investigation', appVersion: '1.0', version: 'A', cls: '999', seat: '1',
      problem: '合成原答案', h1: {}, b2: {}, concl: {}, reveal: {}}
  });
  c.window = c;
  vm.runInContext(fakeFirebase, c);
  vm.runInContext(source + '\nglobalThis.YBS = YBS;', c);
  vm.runInContext(reportManager, c);
  const signIn = async (account = '9990001') => {
    await c.YBS.button(new ReportElement(), () => {}, message => assert.fail(message));
    form.a.value = account; form.p.value = 'synthetic-test-password';
    await form.onsubmit({preventDefault() {}});
    c.S.seat = account === '9990002' ? '2' : '1';
    c.impWho = {cls: '999', seat: c.S.seat};
  };
  await signIn();
  const advance = async ms => {
    const end = time + ms;
    for (let count = 0; ; count++) {
      assert.ok(count < 100, '合成時鐘不得無限排程');
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn(); await tick();
    }
    time = end; await tick();
  };
  return {c, stored, signIn, advance, button, queue: () => JSON.parse(stored.get(REPORT_KEY) || '[]'),
    text: () => panel.textContent, online: () => c.dispatchEvent(new Event('online'))};
}

test('同堂並行準備快照，較慢完成的舊快照不能取代新快照', async () => {
  const gate = deferred();
  const h = await setupReports({encode: async snapshot => {
    if (snapshot.problem === '合成原答案') await gate.promise;
    return DFReport.encode(snapshot);
  }});
  const first = h.c.queueReport(1);
  h.c.S.problem = '合成最新答案'; h.c.__fake.hold = 'beforeRead';
  await h.c.queueReport(1);
  await until(() => h.c.__fake.release);
  gate.resolve(); await first;
  assert.equal(h.c.__fake.transactions, 1);
  assert.equal(JSON.parse(h.queue()[0].encoded.payload).problem, '合成最新答案');
  h.c.__fake.release();
  await until(() => h.queue().length === 0);
  assert.deepEqual(Array.from(h.c.__fake.commits, x => JSON.parse(x.data.payload).problem), ['合成最新答案']);
  assert.match(h.text(), /老師已收到/);
});

for (const outcome of ['成功', '失敗']) test(`報告編碼未完成就登出，舊編碼${outcome}不影響新 UID 的同堂快照`, async () => {
  const gate = deferred();
  const h = await setupReports({encode: async snapshot => {
    if (snapshot.problem === '合成原答案') await gate.promise;
    return DFReport.encode(snapshot);
  }});
  const first = h.c.queueReport(1);
  await h.c.YBS.logout();
  await h.signIn('9990002');
  h.c.S.problem = '合成第二人答案'; h.c.__fake.hold = 'beforeRead';
  await h.c.queueReport(1);
  await until(() => h.c.__fake.release);
  if (outcome === '成功') gate.resolve(); else gate.reject(Error('synthetic encode failure'));
  await first;
  assert.deepEqual(h.queue().map(x => [x.uid, x.seat, JSON.parse(x.encoded.payload).problem]), [
    ['u2', '2', '合成第二人答案']
  ]);
  assert.equal(h.button.disabled, true);
  assert.equal(h.c.__fake.commits.length, 0);
  h.c.__fake.release();
  await until(() => h.queue().length === 0);
  assert.deepEqual(Array.from(h.c.__fake.commits, x => [x.path, x.data.uid, x.data.seat]), [
    ['ybsCourses/115-df/reports/u2_s1', 'u2', 2]
  ]);
  assert.match(h.text(), /老師已收到/);
  assert.equal(h.c.__fake.attempts.length, 0);
});

for (const stage of ['beforeRead', 'receipt']) test(`報告停在 ${stage} 時換人，舊請求完成才續送新 UID`, async () => {
  const h = await setupReports();
  h.c.__fake.hold = stage;
  await h.c.queueReport(1);
  await until(() => h.c.__fake.release);
  await h.c.YBS.logout();
  assert.equal(h.stored.has(REPORT_KEY), false);
  await h.signIn('9990002'); h.c.S.problem = '合成第二人答案';
  await h.c.queueReport(1);
  assert.equal(h.c.__fake.transactions, 1, '舊請求未結束時新報告只排隊');
  assert.deepEqual(h.queue().map(x => x.uid), ['u2']);
  assert.ok(!h.text().includes('老師已收到'));
  h.c.__fake.release();
  await until(() => h.queue().length === 0);
  const commits = Array.from(h.c.__fake.commits, x => [x.path, x.data.uid, x.data.seat, JSON.parse(x.data.payload).problem]);
  const old = ['ybsCourses/115-df/reports/u1_s1', 'u1', 1, '合成原答案'];
  const current = ['ybsCourses/115-df/reports/u2_s1', 'u2', 2, '合成第二人答案'];
  assert.deepEqual(commits, stage === 'receipt' ? [old, current] : [current]);
  assert.equal(h.c.__fake.transactions, 2);
  assert.match(h.text(), /老師已收到/);
  assert.equal(h.stored.has(REPORT_KEY), false);
});

test('報告失敗後手動重試與 online 並行，仍送原快照且收據確認後才清理', async () => {
  const h = await setupReports();
  h.c.__fake.failures = ['unavailable'];
  await h.c.queueReport(1);
  await until(() => h.queue()[0]?.phase === 'waiting');
  const original = h.queue()[0];
  h.c.S.problem = '合成稍後修改'; h.c.__fake.hold = 'receipt';
  h.c.retryReport(1); h.online(); h.c.retryReport(1); h.online();
  await until(() => h.c.__fake.release);
  assert.equal(h.c.__fake.transactions, 2);
  assert.equal(h.queue().length, 1);
  assert.equal(h.queue()[0].snapshotAt, original.snapshotAt);
  assert.ok(!h.text().includes('老師已收到'));
  h.c.__fake.release();
  await until(() => h.queue().length === 0);
  assert.deepEqual(Array.from(h.c.__fake.commits, x => [x.data.uid, JSON.parse(x.data.payload).problem]), [
    ['u1', '合成原答案']
  ]);
  assert.equal(h.stored.has(REPORT_KEY), false);
  assert.match(h.text(), /老師已收到/);
  await h.advance(60000); h.online(); await tick();
  assert.equal(h.c.__fake.transactions, 2, '成功後舊退避計時器不得再送');
});

test('重新開頁淘汰異身分及損壞草稿，只恢復本人的送出中報告', async () => {
  const first = await setupReports();
  first.c.__fake.failures = ['unavailable'];
  await first.c.queueReport(1);
  await until(() => first.queue()[0]?.phase === 'waiting');
  const original = first.queue()[0];
  const invalid = [{uid: 'u2'}, {courseId: '115-g9'}, {cls: '998'}, {seat: '2'},
    {session: 0}, {session: 4}, {retries: -1}, {retries: 4}, {snapshotAt: null},
    {id: null}, {encoded: {schemaVersion: 2}}].map(change => ({...original, ...change}));
  const valid = {...original, session: 2, phase: 'sending', nextAt: 0};
  const h = await setupReports({stored: new Map([[REPORT_KEY, JSON.stringify([...invalid, valid])]])});
  h.c.__fake.hold = 'receipt';
  h.c.resumeReports();
  await until(() => h.c.__fake.release);
  assert.deepEqual(h.queue().map(x => [x.uid, x.session, x.cls, x.seat]), [['u1', 2, '999', '1']]);
  assert.equal(h.c.__fake.transactions, 1);
  h.c.__fake.release();
  await until(() => h.queue().length === 0);
  assert.deepEqual(Array.from(h.c.__fake.commits, x => [x.path, x.data.payload]), [
    ['ybsCourses/115-df/reports/u1_s2', original.encoded.payload]
  ]);
  const leave = new Event('beforeunload', {cancelable: true}); h.c.dispatchEvent(leave);
  assert.equal(leave.defaultPrevented, false, '完成且淘汰舊草稿後不再提示待送');
  assert.equal(h.stored.has(REPORT_KEY), false);
});

for (const value of ['{', 'null', '{}']) test(`損毀報告草稿 ${value} 清除後仍能交新報告`, async () => {
  const h = await setupReports({stored: new Map([[REPORT_KEY, value]])});
  h.c.resumeReports();
  assert.equal(h.stored.has(REPORT_KEY), false);
  assert.equal(h.c.__fake.transactions, 0);
  await h.c.queueReport(1);
  await until(() => h.queue().length === 0);
  assert.equal(h.c.__fake.commits.length, 1);
  assert.equal(h.c.__fake.commits[0].path, 'ybsCourses/115-df/reports/u1_s1');
  assert.match(h.text(), /老師已收到/);
});
