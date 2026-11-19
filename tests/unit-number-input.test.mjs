import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';

// 直接載入活動的產題、輸入處理與判定；不啟動登入、不連網。
function activity(dir) {
  const html = readFileSync(new URL(`../115-g9/${dir}/index.html`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const shell = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(shell.slice(shell.indexOf('// 常用小工具')) + '\nconst SHELL=cfg=>cfg;\n' + scripts.join('\n'), context);
  return context;
}

for (const dir of ['u2-04']) {
  test(`${dir}：數字串錯答不可因忽略負號或文字而通過`, () => {
    const c = activity(dir);
    const inst = dir === 'u2-04' ? {w:'LOVE'} : {b:[...Array(12).fill(1), ...Array(12).fill(0)], r:[12,12]};
    const numbers = dir === 'u2-04' ? [76,79,86,69] : inst.r;
    c.inst = inst;
    // 用活動原本的 view/get/ready/check 路徑，以共用 DOM 替身保留比較卡結構。
    c.el = new Element('div');
    vm.runInContext('const R=APP.rounds[1], handle=R.view(inst,el,{changed(){},esc:s=>String(s)});', c);
    c.input = c.el.querySelector('input');
    for (const text of [numbers.join(' '), numbers.join('\n'), numbers.join('，'), '  '+numbers.join(' ')+'  ']) {
      c.input.value = text;
      assert.equal(vm.runInContext('handle.ready() && R.check(inst,handle.get()) === true', c), true, text);
    }
    for (const text of ['', numbers.map(n=>'-'+n).join(' '), numbers.join('abc'), numbers.join('.'), numbers.join(' ')+'xyz', 'Infinity', numbers.slice(1).join(' '), numbers.map((n,i)=>i===0?n+1:n).join(' ')]) {
      c.input.value = text;
      assert.equal(vm.runInContext('R.check(inst,handle.get()) === true', c), false, text);
    }
    for (let seed=1;seed<=200;seed++) {
      c.seed = seed;
      const result = vm.runInContext(`(() => {
        let state=seed, calls=0;
        const rnd=()=>{if(++calls>100000)throw Error('產題未收斂');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
        const i=R.gen(rnd), answer=${dir === 'u2-04' ? 'codesOf(i.w)' : 'i.r'};
        const wrong=[...answer];wrong[0]++;
        return [R.check(i,parseNums(answer.join(' ')))===true,R.check(i,wrong)!==true${dir === 'u2-07' ? ',unruns(i.r).join()===i.b.join()' : ''}];
      })()`, c, {timeout:1000});
      assert.ok(result.every(Boolean), `seed ${seed}`);
    }
  });
}

// u2-07 改為合併燈牌關：保留完整還原與編碼兩個答案，檢查編碼輸入容錯。
test('u2-07 合併燈牌關：合法分隔保留，負號、小數、垃圾字元不通過',()=>{
 const c=activity('u2-07');c.el=new Element('div');
 vm.runInContext("const R=APP.rounds[1],inst=R.gen(()=>0.2),handle=R.view(inst,el,{changed(){}});handle.fill();",c);
 c.input=c.el.querySelector('[data-answer="1"]');
 const numbers=vm.runInContext('qRun(inst.encode)',c);
 for(const text of [numbers.join(' '),numbers.join('\n'),numbers.join('，'),'  '+numbers.join(' ')+'  ']){c.input.value=text;assert.equal(vm.runInContext('R.check(inst,handle.get())',c),true)}
 for(const text of ['',numbers.map(n=>'-'+n).join(' '),numbers.join('abc'),numbers.join('.'),numbers.join(' ')+'xyz','Infinity',numbers.slice(1).join(' ')]){c.input.value=text;assert.notEqual(vm.runInContext('R.check(inst,handle.get())',c),true)}
});
