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
  const body = new Element('body'), stored = new Map();
  const document = {body, createElement:tag => new Element(tag), getElementById:id => body.querySelector('#' + id)};
  const context = vm.createContext({
    document, window:{}, localStorage:{getItem:key => stored.get(key) ?? null, setItem:(key, value) => stored.set(key, value)},
    TEACHER:{remembered:() => false}, CODEC:{encode:() => 'synthetic-code'}
  });
  let result = true, generation = 0;
  const round = {
    name:'合成關卡', lv:1, now:'合成題目', goal:'合成目標', learn:'合成過關說明',
    gen:() => ({id:++generation}), view:() => ({get:() => '合成作答', ready:() => true}), check:() => result
  };
  vm.runInContext(shell + '\nglobalThis.makeShell = SHELL;', context, {filename:'assets/shell.js'});
  const app = context.makeShell({week:1, title:'合成活動', rounds:[round, {...round, lv:2}]});
  const get = id => document.getElementById(id);
  get('in-cls').value = '999'; get('in-seat').value = '1'; get('g-go').onclick();
  return {app, get, round, reply:value => { result = value; }, send:() => get('b-send').onclick()};
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

test('一般回饋完整顯示，錯答仍須重新連續答對兩組才過關', () => {
  const h = setup(), verdict = h.get('verdict');
  h.send(); assert.equal(verdict.className, 'verdict mid');
  const message = '第 2 項再想想：A & B，3 < 5，8 > 6，「引號」。';
  h.reply(message); h.send();
  assert.equal(verdict.querySelector('h3').textContent, '還不對');
  assert.equal(verdict.querySelector('p').textContent, message);
  assert.equal(verdict.querySelectorAll('p')[1].textContent, '修改後再送出一次。');
  assert.equal(verdict.className, 'verdict no');
  h.reply(true); const previous = h.app.inst.id;
  h.send(); assert.equal(verdict.className, 'verdict mid');
  assert.notEqual(h.app.inst.id, previous, '第一組答對後換新資料');
  h.send(); assert.equal(verdict.className, 'verdict ok');
  assert.equal(verdict.querySelector('p').textContent, '合成過關說明');
  assert.equal(h.get('prog').querySelectorAll('span')[0].className, 'ok');
});

test('過關說明也以純文字顯示', () => {
  const h = setup(), message = '<img src=x onerror="syntheticAttack()"> & 合成說明';
  h.round.learn = message; h.send(); h.send();
  assert.equal(h.get('verdict').querySelector('p').textContent, message);
  assert.equal(h.get('verdict').querySelectorAll('img').length, 0);
});
