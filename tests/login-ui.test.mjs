// 執行實際表單程式；DOM 為離線替身，不載入 Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const login = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');

test('登入入口移除指定說明，教師碼預設隱藏且未加入學生眼睛按鈕', () => {
  const context = vm.createContext({document:{}});
  vm.runInContext(shell, context);
  const html = vm.runInContext('shellGateHTML({title:"合成活動",termWeek:11}, s=>s)', context);
  assert.doesNotMatch(html, /先登入：|每過一關，紀錄會自動交給老師/);
  assert.match(html, /id="in-tcode" type="password"/);
  assert.doesNotMatch(html, /ybs-password-toggle/);
});

test('學生密碼持續顯示直到再次點擊，更新無障礙狀態且不送出', async () => {
  const host = new Element('div');
  const context = vm.createContext({
    location:{pathname:'/115-g9/u2-01/'},
    localStorage:{}, sessionStorage:{removeItem(){}},
    window:{addEventListener(){}}, setTimeout(){}, setInterval(){},
    document:{getElementById(id){
      const form = host.querySelector('#'+id);
      form.a = form.querySelector('input[name="a"]');
      form.p = form.querySelector('input[name="p"]');
      return form;
    }}, host
  });
  vm.runInContext(login, context);
  await vm.runInContext('YBS.button(host)', context);
  const form = host.querySelector('form'), eye = form.querySelector('.ybs-password-toggle');
  const submit = form.querySelector('button[type="submit"]');
  assert.equal(eye.type, 'button');
  assert.equal(form.p.type, 'password');
  assert.equal(eye.getAttribute('aria-pressed'), 'false');
  assert.equal(eye.getAttribute('aria-label'), '顯示密碼');
  assert.equal(eye.getAttribute('aria-controls'), form.p.id);
  form.p.value = 'synthetic-test-password';
  let submits = 0;
  form.onsubmit = () => submits++;
  eye.click();
  await Promise.resolve();
  assert.equal(form.p.type, 'text');
  assert.equal(eye.getAttribute('aria-pressed'), 'true');
  assert.equal(eye.getAttribute('aria-label'), '隱藏密碼');
  assert.equal(eye.querySelector('span').textContent, '隱藏');
  assert.equal(submit.textContent, '登入');
  eye.click();
  assert.equal(form.p.type, 'password');
  assert.equal(eye.getAttribute('aria-pressed'), 'false');
  assert.equal(eye.getAttribute('aria-label'), '顯示密碼');
  assert.equal(eye.querySelector('span').textContent, '顯示');
  assert.equal(form.p.value, 'synthetic-test-password');
  assert.equal(submits, 0);
});
