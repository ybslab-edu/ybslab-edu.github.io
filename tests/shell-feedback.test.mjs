import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const shell = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');
const decode = text => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({amp:'&', lt:'<', gt:'>', quot:'"'}[name]));
const textNode = text => ({nodeType:3, textContent:String(text)});

// 純 Node 的小型 DOM：innerHTML 會建元素，textContent 只建文字節點。
// 只支援外框用到的標記與選取器，不載入瀏覽器、登入或 Firebase。
class Element {
  constructor(tag) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = [];
    this.dataset = {}; this.value = ''; this.hidden = false;
  }
  set textContent(text) { this.childNodes = [textNode(text)]; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set innerHTML(html) { this.childNodes = []; this.insertAdjacentHTML('beforeend', html); }
  insertAdjacentHTML(position, html) {
    assert.ok(['afterbegin', 'beforeend'].includes(position));
    const root = new Element('fragment'), stack = [root];
    for (const token of String(html).match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi) || []) {
      if (token.startsWith('<!--')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([a-z][\w-]*)/i)?.[1];
      if (tag) {
        const el = new Element(tag);
        for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(key, decode(value));
        stack.at(-1).childNodes.push(el);
        if (!['br', 'hr', 'img', 'input'].includes(tag)) stack.push(el);
      } else stack.at(-1).childNodes.push(textNode(decode(token)));
    }
    if (position === 'afterbegin') this.childNodes.unshift(...root.childNodes);
    else this.childNodes.push(...root.childNodes);
  }
  setAttribute(key, value) {
    this[key === 'class' ? 'className' : key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = parent => parent.childNodes.filter(n => n.nodeType === 1).forEach(el => {
      if (selector.startsWith('#') ? el.id === selector.slice(1) : el.tagName === selector.toUpperCase()) result.push(el);
      visit(el);
    });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener() {}
  focus() {}
}

function setup() {
  const body = new Element('body'), stored = new Map(), apis = [];
  const counts = {writes:0, peeks:0, disposals:0};
  const document = {body, createElement:tag => new Element(tag), getElementById:id => body.querySelector('#' + id)};
  const context = vm.createContext({
    document, window:{}, localStorage:{getItem:key => stored.get(key) ?? null, setItem:(key, value) => { counts.writes++; stored.set(key, value); }},
    TEACHER:{remembered:() => false}
  });
  let result = true, generation = 0, answer = 0;
  const round = {
    name:'合成關卡', lv:1, now:'合成題目', goal:'合成目標', learn:'合成過關說明',
    gen:() => ({id:++generation}),
    view:(inst, el, api) => {
      apis.push(api);
      return {get:() => answer, ready:() => true, dispose:() => { counts.disposals++; api.changed(); api.attempt(); }};
    },
    peek:() => { counts.peeks++; return '合成說明'; }, check:() => result
  };
  vm.runInContext(shell + '\nglobalThis.makeShell = SHELL;', context, {filename:'assets/shell.js'});
  const app = context.makeShell({week:1, title:'合成活動', rounds:[round, {...round, lv:2}]});
  const get = id => document.getElementById(id);
  get('in-cls').value = '999'; get('in-seat').value = '1'; get('g-go').onclick();
  return {app, get, round, apis, counts, stored, reply:value => { result = value; answer++; }, send:() => get('b-send').onclick()};
}

test('check 回饋含 img/onerror 或跳脫段落標記時，只建立文字節點', () => {
  const probe = new Element('div');
  probe.innerHTML = '<p>合成訊息</p><img src=x onerror="syntheticAttack()">';
  assert.equal(probe.querySelectorAll('img').length, 1, '確認 DOM 替身能偵測 innerHTML 建立的元素');
  const h = setup(), verdict = h.get('verdict');
  for (const message of ['<img src=x onerror="syntheticAttack()">', '</p><img src=x onerror="syntheticAttack()"><p>']) {
    h.reply(message); h.send();
    const feedback = verdict.querySelector('p');
    assert.equal(feedback.textContent, message);
    assert.ok(feedback.childNodes.every(n => n.nodeType === 3));
    assert.equal(verdict.querySelectorAll('img').length, 0);
    assert.equal(verdict.querySelectorAll('p').length, 2);
    assert.equal(verdict.hidden, false);
    assert.equal(verdict.className, 'verdict no');
  }
});

test('一般回饋完整顯示，錯答保留累積次數與原題，兩組即過關', () => {
  const h = setup(), verdict = h.get('verdict');
  h.send(); assert.equal(verdict.className, 'verdict mid');
  h.get('b-next-group').onclick();
  const message = '第 2 項再想想：A & B，3 < 5，8 > 6，「引號」。';
  h.reply(message); h.send();
  assert.equal(verdict.querySelector('h3').textContent, '還不對');
  assert.equal(verdict.querySelector('p').textContent, message);
  assert.equal(verdict.querySelectorAll('p')[1].textContent, '修改答案後再送一次');
  assert.equal(verdict.className, 'verdict no');
  h.reply(true); const previous = h.app.inst.id;
  h.send(); assert.equal(verdict.className, 'verdict ok');
  assert.equal(h.app.inst.id, previous, '累積第二次答對後保留當題');
  assert.match(h.get('streak').textContent, /累積答對 2\/2/);
  assert.equal(verdict.querySelector('p').textContent, '合成過關說明');
  assert.equal(h.get('rounds').querySelectorAll('button')[0].className, 'passed');
});

test('過關說明也以純文字顯示', () => {
  const h = setup(), message = '<img src=x onerror="syntheticAttack()"> & 合成說明';
  h.round.learn = message; h.send(); h.get('b-next-group').onclick(); h.send();
  assert.equal(h.get('verdict').querySelector('p').textContent, message);
  assert.equal(h.get('verdict').querySelectorAll('img').length, 0);
});

test('反覆重載同關與切關後，舊題回呼不能重繪或記次，當題操作仍只執行一次', () => {
  const h = setup();
  for (const i of [0, 0, 1, 1, 0]) {
    const old = [...h.apis], previous = {...h.counts};
    h.app.load(i);
    assert.equal(h.counts.writes, previous.writes, 'dispose 回呼不能記次');
    assert.equal(h.counts.peeks, previous.peeks + 1, '新題只重繪一次，dispose 回呼不能重繪');
    assert.equal(h.counts.disposals, previous.disposals + 1, '換題清理前一題 handle');
    const before = {...h.counts};
    for (const api of old) { api.changed(); api.attempt(); }
    assert.deepEqual(h.counts, before, '包含 dispose 中的遲到回呼都不應留下作用');
    h.apis.at(-1).changed();
    assert.equal(h.counts.peeks, before.peeks + 1, '當題回饋只重繪一次');
    h.apis.at(-1).attempt();
    assert.equal(h.counts.writes, before.writes + 2, '一次記次只保存進度與最後班座各一次');
    const progress = JSON.parse(h.stored.get('it9:w1:999-1'));
    assert.equal(progress.tries.reduce((a, b) => a + b, 0), h.apis.length - 1);
  }
  const before = h.counts.writes;
  h.send(); h.send();
  assert.equal(h.counts.writes, before + 2, '答對同題重送不重複記次');
  const old = h.apis.at(-1), previous = {...h.counts};
  h.get('b-next-group').onclick();
  assert.equal(h.counts.disposals, previous.disposals + 1, '下一組只清理前題一次');
  assert.equal(h.counts.writes, previous.writes, '下一組清理前題不記次');
  assert.equal(h.counts.peeks, previous.peeks + 1, '下一組只重繪新題一次');
  const current = {...h.counts};
  old.changed(); old.attempt();
  assert.deepEqual(h.counts, current, '下一組後前題回呼不能重繪或記次');
  h.reply('合成錯答'); h.send();
  const wrong = h.counts.writes;
  h.send(); assert.equal(h.counts.writes, wrong, '未修改的錯答不重複記次');
  h.reply(true); h.send();
  assert.equal(h.get('verdict').className, 'verdict ok');
});
