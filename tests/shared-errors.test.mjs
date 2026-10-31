// 合成帳號、記憶體 mock；不載入 Firebase、不發出網路請求。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = file => readFileSync(new URL('../assets/' + file, import.meta.url), 'utf8');
function setup({code, signOut, loaderFails = false} = {}) {
  const errors = [], button = {}, form = {a:{value:'9990001',focus(){}},p:{value:'synthetic-password'},querySelector:()=>button};
  const auth = {
    signInWithEmailAndPassword: async () => {
      if (code !== undefined) throw Object.assign(new Error('synthetic auth failure'), {code});
      return {user:{uid:'synthetic-user'}};
    },
    signOut: signOut || (() => Promise.resolve())
  };
  const context = vm.createContext({Error, Promise,
    location:{pathname:'/115-g9/u1-01/'}, sessionStorage:{getItem:()=>null,removeItem(){}}, localStorage:{},
    setInterval(){}, setTimeout:fn=>fn(), window:{addEventListener(){}},
    document:{getElementById:()=>form,querySelector:()=>null,createElement:()=>({}),head:{appendChild:s=>s.onerror()}}
  });
  const source = read('login.js').replace('  return { CONFIG, enabled,',
    '  globalThis.signIn = signIn; globalThis.setFB = value => { fb = value; };\n  return { CONFIG, enabled,');
  vm.runInContext(source + '\nglobalThis.api = YBS;', context);
  if (!loaderFails) context.setFB({auth});
  return {context, form, submitButton:button, errors, async button(){await context.api.button({},()=>{},msg=>errors.push(msg));},
    async submit(){await form.onsubmit({preventDefault(){}});}};
}
for (const [account, password, code, message] of [
  ['invalid', 'synthetic-password', 'auth/invalid-account', '帳號是 cgjh 加學號，例如 cgjh1100123。'],
  ['9990001', '', 'auth/missing-password', '請輸入密碼。']
]) test(`登入輸入錯誤為帶 code 的 Error：${code}`, async () => {
  const h=setup();
  await assert.rejects(h.context.signIn(account,password), e=>{
    assert.ok(e instanceof Error);assert.equal(e.code,code);assert.equal(e.message,message);assert.ok(e.stack);return true;
  });
  await h.button();h.form.a.value=account;h.form.p.value=password;await h.submit();
  assert.equal(h.errors[0],message);assert.equal(h.form.p.value,'');
});
for (const [code, expected] of [
  ...['invalid-credential','wrong-password','user-not-found','invalid-email','invalid-login'].map(c=>['auth/'+c,'帳號或密碼不對。密碼是 cgjh 加身分證字號；還是不行請告訴老師。']),
  ['auth/too-many-requests','嘗試太多次，請等幾分鐘再試，或告訴老師。'],
  ['auth/network-request-failed','連不上網路，請確認網路後再試。'],
  ['auth/other','登入沒有完成（auth/other），請再試一次或告訴老師。'],
  ['', '登入沒有完成（連線問題），請再試一次或告訴老師。']
]) test(`Firebase 登入錯誤保留 code 與提示：${code || '無 code'}`, async()=>{
  const h=setup({code});
  await assert.rejects(h.context.signIn('9990001','synthetic-password'),e=>{
    assert.ok(e instanceof Error);assert.equal(e.code,code || 'auth/login-failed');assert.equal(e.message,expected);return true;
  });
  await h.button();await h.submit();assert.equal(h.errors[0],expected);
});
test('元件載入失敗顯示 Error.message，登入表單恢復可操作',async()=>{
  const h=setup({loaderFails:true});await h.button();await h.submit();
  assert.equal(h.errors[0],'無法載入登入元件，請確認網路連線。');
  assert.equal(h.form.p.value,'');assert.equal(h.submitButton.disabled,false);assert.equal(h.submitButton.textContent,'登入');
});
for(const asyncFailure of [false,true]) test(`登出${asyncFailure?'非同步':'同步'}失敗透過原錯誤回呼提示，不改回傳格式`,async()=>{
  const h=setup({signOut(){if(asyncFailure)return Promise.reject(Error('synthetic'));throw Error('synthetic');}});
  await h.button();assert.equal(h.context.api.logout(),undefined);await Promise.resolve();
  assert.deepEqual(h.errors,['登出未完成，請重新整理後再試。']);assert.equal(h.context.api.profile(),null);
});
test('教師解鎖記憶失敗仍可操作，讀取失敗維持鎖定',()=>{
  const context=vm.createContext({sessionStorage:{setItem(){throw Error('synthetic');},removeItem(){throw Error('synthetic');},getItem(){throw Error('synthetic');}}});
  vm.runInContext(read('teacher.js')+'\nglobalThis.api=TEACHER;',context);
  assert.doesNotThrow(()=>context.api.remember(true));assert.doesNotThrow(()=>context.api.remember(false));
  assert.equal(context.api.remembered(),false);
});
