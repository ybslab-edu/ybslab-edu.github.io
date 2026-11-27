import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const url = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const bankURL = url(read('assets/warmup-bank.js'));
const {WARMUP_BANK} = await import(bankURL);
const warmupSource = read('assets/warmup.js');
const {drawWarmup, checkWarmup} = await import(url(warmupSource.replace("'./warmup-bank.js?v=20261125w1'", JSON.stringify(bankURL))));
const ctx = vm.createContext({});
vm.runInContext(read('assets/activities.js'), ctx);
const activities = vm.runInContext('ACTIVITIES', ctx);
const activity = sub => activities.find(a => a.href === `115-g9/${sub}/`);
const random = seed => () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32;};
const draw = overrides => drawWarmup({current: activity('u2-05'), activities, isOpen: () => true, ...overrides});

test('新版暖身避開缺少 warmupRandom 匯出的舊題庫快取', async () => {
  const cachedBank = url('export const WARMUP_BANK = [];');
  const loadWithCache = source => import(url(source.replace(
    /'\.\/warmup-bank\.js\?v=([^']+)'/,
    (_, version) => JSON.stringify(version === '20261105w1' ? cachedBank : bankURL)
  )));
  await assert.rejects(loadWithCache(warmupSource.replace('20261125w1', '20261105w1')),
    {name: 'SyntaxError', message: /warmupRandom/});
  const {drawWarmup} = await loadWithCache(warmupSource);
  assert.equal(drawWarmup({current: activity('u2-05'), activities, isOpen: () => true, rnd: () => 0}).length, 3);
});

test('只抽同課程已開放的先前最近三個活動，依日期而非活動 ID 排序；不重複', () => {
  const eligible = ['u2-01', 'u2-02', 'u2-03'];
  for (let seed = 0; seed < 300; seed++) {
    const qs = draw({isOpen: a => eligible.some(sub => a.href.includes(sub)), rnd: random(seed)});
    assert.equal(qs.length, 3); assert.equal(new Set(qs.map(q => q.id)).size, 3);
    assert.ok(qs.every(q => eligible.includes(q.id.split(':')[0])));
  }
  const shuffled = [activity('u2-01'), activity('u2-02'), activity('u2-03'), activity('u2-04')]
    .map((a, i) => ({...a, week: 100 - i}));
  const qs = draw({activities: shuffled, rnd: () => 0});
  assert.ok(qs.every(q => !q.id.startsWith('u2-01:')), '只取最近三個，舊題不納入');
  assert.deepEqual(draw({isOpen: () => false}), []);
  assert.deepEqual(draw({current: activity('u2-01')}), []);
  assert.deepEqual(draw({current: {...activity('u2-05'), course: 'other'}}), []);
  assert.deepEqual(draw({current: null}), []);
});

test('遵循自動開放與 OPEN 提早開放，不以教師解鎖放入未開放題；不足三題及重複 ID 正常', () => {
  const now = Date.parse('2026-11-05T00:00:00+08:00');
  vm.runInContext("const OPEN={'115-g9':['u2-04']}", ctx);
  const qs = draw({isOpen: a => vm.runInContext(`isActivityOpen(${JSON.stringify(a)}, ${now})`, ctx), rnd: () => .5});
  assert.ok(qs.every(q => ['u2-01', 'u2-02', 'u2-04'].includes(q.id.split(':')[0])));
  const q = WARMUP_BANK.find(q => q.activity === 'u2-04');
  assert.equal(draw({bank: [q, q]}).length, 1);
  assert.equal(draw({bank: WARMUP_BANK.filter(q => q.activity === 'u2-04').slice(0, 2)}).length, 2);
  assert.deepEqual(draw({bank: []}), []);
});

test('重複 ID 與不足題數只產生現有唯一題目，不重抽；空題庫不使用亂數', () => {
  const entry = WARMUP_BANK.find(q => q.activity === 'u2-04');
  let generated = 0, draws = 0;
  const first = {...entry, gen: rnd => {generated++; return entry.gen(rnd);}};
  const duplicate = {...entry, gen: () => assert.fail('重複 ID 不應產生題目')};
  const rnd = () => {assert.ok(++draws <= 3, '一題只需一次取值與兩次選項洗牌'); return 0;};
  const qs = draw({bank: [first, ...Array(100).fill(duplicate)], rnd});
  assert.equal(qs.length, 1);
  assert.equal(generated, 1);
  assert.equal(draws, 3);
  assert.equal(qs[0].options[qs[0].answer], 'A');
  assert.deepEqual(draw({bank: [], rnd: () => assert.fail('空題庫不應抽題')}), []);
});

test('不合法亂數在題目洗牌、題目取值及選項洗牌立即明確失敗，不重試', () => {
  const entry = WARMUP_BANK.find(q => q.activity === 'u2-04');
  for (const value of [-1, -Number.MIN_VALUE, 1, Infinity, -Infinity, NaN, undefined, null, '0.5']) {
    for (const {bank, validCalls} of [
      {bank: WARMUP_BANK, validCalls: 0},
      {bank: [entry], validCalls: 0},
      {bank: [entry], validCalls: 1}
    ]) {
      let calls = 0;
      assert.throws(() => draw({bank, rnd: () => ++calls <= validCalls ? 0 : value}),
        {name: 'RangeError', message: '暖身亂數必須是 0（含）到 1（不含）的有限數字'});
      assert.equal(calls, validCalls + 1, '遇到不合法值即停止');
    }
    // 題庫產生器也可被直接呼叫，不能回傳含 undefined 的題目。
    for (const entry of WARMUP_BANK) {
      assert.throws(() => entry.gen(() => value),
        {name: 'RangeError', message: '暖身亂數必須是 0（含）到 1（不含）的有限數字'});
    }
  }
  for (const rnd of [null, 0, 'random']) {
    assert.throws(() => draw({bank: [entry], rnd}),
      {name: 'TypeError', message: '暖身 rnd 必須是函式'});
    assert.throws(() => entry.gen(rnd),
      {name: 'TypeError', message: '暖身 rnd 必須是函式'});
  }
});

// 獨立驗算短題答案，而非直接相信產生器提供的 answer。
function expected(q) {
  const n = q.prompt.match(/\d+/g)?.map(Number), id = q.id.split(':')[1];
  switch (id) {
    case 'pixels': return '像素格子數';
    case 'colors': return String(2 ** n[0]);
    case 'size': return String(n[0] * n[1]);
    case 'sample': return '取樣頻率';
    case 'frames': return String(n[0] * n[1]);
    case 'storage': return String(n[0] * n[1]);
    case 'binary': return String(n[0] + n[1]);
    case 'byte': return String(n[0] / 8);
    case 'range': return String(2 ** n[0] - 1);
    case 'decode': return String.fromCharCode(n.at(-1));
    case 'encode': return String(q.prompt.match(/；([ABC])/)[1].charCodeAt(0));
    case 'display': return q.prompt.includes('Big5') ? '亂碼' : '字型是否有這個字';
    case 'information': return '資訊';
    case 'type': return q.prompt.includes('勾選') ? '核取方塊' : '簡答';
    case 'survey': return '一次問兩件事';
    default: assert.fail(q.id);
  }
}

test('五週 15 個短版產生器：500 種子及極端常數亂數有界、獨立正解與所有錯答驗證', () => {
  assert.equal(WARMUP_BANK.length, 15);
  for (const entry of WARMUP_BANK) {
    const answers = new Set();
    const edges = [0, .5, .999999, -0, Number.MIN_VALUE, 1 - Number.EPSILON / 2];
    for (let seed = 0; seed < 500 + edges.length; seed++) {
      const rng = seed < 500 ? random(seed) : () => edges[seed - 500];
      let draws = 0;
      const q = draw({bank: [entry], current: {...activity('u2-05'), date: '2026-12-01'},
        activities: [activity(entry.activity)], rnd: () => {assert.ok(++draws < 30); return rng();}})[0];
      assert.equal(q.options.length, new Set(q.options).size);
      assert.equal(q.options[q.answer], expected(q));
      assert.ok(q.prompt.length < 70); assert.ok(q.review.length > 5);
      for (const answer of [0, 1, 2, -1, 3, null, undefined, '', NaN, String(q.answer)])
        assert.equal(checkWarmup(q, answer), answer === q.answer);
      answers.add(q.answer);
    }
    assert.equal(answers.size, 3, entry.id + ' 答案位置應打散');
  }
});
