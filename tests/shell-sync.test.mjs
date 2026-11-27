import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element} from './fixtures/activity-dom.mjs';
test('狀態先到、元素延後出現及重建都可重試；換人不能復原舊狀態',()=>{
  const body=new Element('body');let observer,status,retries=0;
  const s={cfg:{},R:[],ident:{cls:999,seat:1},loginEnabled:()=>true,$:id=>body.querySelector('#'+id)};
  const context=vm.createContext({document:{body},window:{MutationObserver:class{constructor(fn){observer=fn;}observe(){}}},YBS:{status(fn){status=fn;},retry(){retries++;}}});
  vm.runInContext(readFileSync(new URL('../assets/shell.js',import.meta.url),'utf8')+'\nglobalThis.sync=shellCreateSync;',context);context.sync(s);
  status('guest-pending');
  body.innerHTML='<span id="sync"></span><button id="b-retry"></button>';observer();
  assert.match(s.$('sync').textContent,/還沒上傳成功/);assert.equal(s.$('b-retry').hidden,false);s.$('b-retry').click();assert.equal(retries,1);
  status('sending');assert.equal(s.$('b-retry').hidden,true);assert.equal(s.$('b-retry').disabled,true);
  body.innerHTML='<span id="sync"></span><button id="b-retry"></button>';observer();
  assert.match(s.$('sync').textContent,/上傳中/);assert.equal(s.$('b-retry').disabled,true);
  status('ok');assert.equal(s.$('b-retry').hidden,true);assert.match(s.$('sync').textContent,/已上傳/);s.$('b-retry').click();assert.equal(retries,2);
  s.ident={cls:999,seat:2};body.innerHTML='<span id="sync"></span><button id="b-retry"></button>';observer();
  assert.equal(s.$('sync').hidden,true);assert.equal(s.$('sync').textContent,'');s.ident=null;s.$('b-retry').click();assert.equal(retries,2);
});

function setupSync({observe = true, login = true} = {}) {
  const body = new Element('body'), observers = [], callbacks = [], uploads = [];
  const counts = {retries:0, refreshes:0, resets:0, logins:0, renders:0};
  const s = {cfg:{}, R:[], ident:{cls:999, seat:1}, loginEnabled:() => login,
    $:id => { if (id === 'sync') counts.renders++; return body.querySelector('#' + id); },
    xp:{refresh:() => counts.refreshes++}, resetIdentity:() => { counts.resets++; s.ident = null; },
    showLogin:() => counts.logins++};
  const window = observe ? {MutationObserver:class {
    constructor(fn) { this.callback = fn; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }} : {};
  const context = vm.createContext({document:{body}, window,
    YBS:{status(fn) { callbacks.push(fn); }, retry() { counts.retries++; }, submit(record) { uploads.push(record); }}});
  vm.runInContext(readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8') + '\nglobalThis.sync = shellCreateSync;', context);
  const mount = () => { body.innerHTML = '<span id="sync"></span><button id="b-retry"></button>'; };
  const mutate = () => observers.filter(o => o.active).forEach(o => o.callback());
  const status = st => callbacks.at(-1)(st); // YBS.status 是覆寫單一回呼，並非訂閱陣列。
  return {body, s, counts, observers, callbacks, uploads, mount, mutate, status, init:(state = s) => context.sync(state)};
}

test('同步重複初始化保留狀態且只建立一個觀察器；重建後一次重試與一次 XP 更新', () => {
  const h = setupSync(); h.mount();
  const binding = h.init(); h.status('guest-pending');
  for (let i = 0; i < 5; i++) assert.equal(h.init(), binding);
  assert.equal(h.observers.filter(o => o.active).length, 1);
  assert.equal(h.callbacks.length, 1);
  assert.equal(h.s.$('b-retry').hidden, false);
  const detached = h.s.$('b-retry');
  h.mount(); h.mutate();
  assert.equal(detached.onclick, null, '元素被重建後解除舊按鈕');
  h.s.$('b-retry').click(); assert.equal(h.counts.retries, 1);
  h.status('ok'); assert.equal(h.counts.refreshes, 1);
  assert.match(h.s.$('sync').textContent, /已上傳/);
  assert.equal(h.s.$('b-retry').hidden, true);
});

test('新同步外框接手時清理舊觀察器、回呼與按鈕；清理可重複執行並可重新初始化', () => {
  const h = setupSync(); h.mount();
  const old = h.init(); h.status('guest-pending');
  const staleStatus = h.callbacks.at(-1), staleObserver = h.observers[0], retry = h.s.$('b-retry').onclick;
  const next = {...h.s, ident:{cls:999, seat:2}};
  const current = h.init(next); h.status('sending');
  assert.equal(staleObserver.active, false);
  const before = {...h.counts};
  staleStatus('ok'); staleStatus('relogin'); staleObserver.callback(); retry(); old.disposeSync();
  assert.deepEqual(h.counts, before, '遲到的舊事件不更新狀態、XP 或重試');
  h.mount(); h.mutate();
  assert.match(h.s.$('sync').textContent, /上傳中/);
  current.disposeSync(); current.disposeSync();
  assert.equal(h.observers.filter(o => o.active).length, 0);
  assert.equal(h.s.$('b-retry').onclick, null);
  const disposed = {...h.counts};
  h.status('relogin'); h.observers.at(-1).callback();
  assert.deepEqual(h.counts, disposed);
  assert.notEqual(h.init(next), current);
  h.status('guest-pending'); h.s.$('b-retry').click();
  assert.equal(h.counts.retries, 1);
  h.status('relogin');
  assert.equal(h.counts.resets, 1); assert.equal(h.counts.logins, 1);
});

test('沒有 MutationObserver 仍可冪等初始化與清理；未登入不能重試', () => {
  const h = setupSync({observe:false, login:false}); h.mount();
  const binding = h.init(); assert.equal(h.init(), binding);
  h.status('guest-pending');
  assert.equal(h.s.$('b-retry').hidden, true);
  h.s.$('b-retry').click(); assert.equal(h.counts.retries, 0);
  binding.disposeSync(); binding.disposeSync();
  assert.equal(h.s.$('b-retry').onclick, null);
});

test('清理後舊 binding 不再上傳，新 binding 保留既有上傳欄位', () => {
  const h = setupSync(); h.mount();
  Object.assign(h.s, {
    cfg:{course:'synthetic', week:99, termWeek:3, title:'合成活動'},
    R:[{name:'合成基礎', lv:1}, {name:'合成進階', lv:2}],
    prog:{tries:[2,4], mask:3}
  });
  const old = h.init();
  const next = {...h.s, ident:{cls:999, seat:2}};
  const current = h.init(next);
  old.upload(0);
  assert.equal(h.uploads.length, 0, '被接手的舊 binding 不送出');
  for (const round of [0,1]) {
    current.upload(round);
    const record = h.uploads.at(-1);
    assert.ok(Number.isFinite(Date.parse(record.at)));
    assert.deepEqual(JSON.parse(JSON.stringify(record)), {
      course:'synthetic', activity:99, termWeek:3, title:'合成活動',
      round, roundName:next.R[round].name, level:round === 0 ? '基礎' : '進階',
      rounds:['合成基礎','合成進階'], tries:next.prog.tries[round], mask:3,
      cls:999, seat:2, at:record.at
    });
  }
  assert.equal(h.uploads.length, 2);
  current.disposeSync(); current.upload(1);
  assert.equal(h.uploads.length, 2, '明確清理後也不送出');
});
