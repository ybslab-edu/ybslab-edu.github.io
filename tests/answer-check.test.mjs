import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const shell = readFileSync(new URL('../assets/shell.js', import.meta.url), 'utf8');
function activity(dir) {
  const html = readFileSync(new URL(`../115-g9/${dir}/index.html`, import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const c = vm.createContext({});
  vm.runInContext(shell.slice(shell.indexOf('// 常用小工具')) + '\nconst SHELL=cfg=>cfg;\n' + scripts.join('\n'), c);
  return c;
}

// 執行原頁 view/oninput/get/check；DOM 只替代輸入元件，不改判題程式。
for (const [dir, index, inst, answer] of [
  ['u2-03', 1, {t:42}, [42]],
  ['u2-03', 3, {n:100, b:7, max:127}, [7,127]],
  ['u2-06', 2, {rows:[], clean:[4,2,0], raw:[5,3,1]}, [4,2,0]]
]) test(`${dir} 關卡 ${index + 1}：整串作答、教師填答與合成產題`, () => {
  const c = activity(dir);
  const inputs = answer.map(() => ({value:''}));
  c.inst = inst;
  c.el = {insertAdjacentHTML(){}, querySelectorAll:() => dir === 'u2-06' ? inputs : [],
    querySelector:selector => inputs[selector === '#n-m' ? 1 : 0]};
  vm.runInContext(`const r=APP.rounds[${index}], h=r.view(inst,el,{changed(){}});`, c);
  const check = () => vm.runInContext('r.check(inst,h.get()) === true', c);
  const enter = values => values.forEach((value,i) => {inputs[i].value=String(value); inputs[i].oninput();});
  enter(answer); assert.equal(check(), true);
  enter(answer.map(n => `  ${n}  `)); assert.equal(check(), true, '保留前後空白');
  for (let i=0; i<answer.length; i++) {
    for (const bad of ['', `-${answer[i]}`, `x${answer[i]}`, `${answer[i]}x`, `${answer[i]}.0`, `+${answer[i]}`, `${answer[i]}e0`, `0x${answer[i].toString(16)}`, `${answer[i]} 0`]) {
      enter(answer); inputs[i].value=bad; inputs[i].oninput();
      assert.equal(inputs[i].value,bad,'不刪除非法字元');
      assert.equal(check(),false,`欄 ${i}：${bad}`);
    }
  }
  vm.runInContext('h.fill()', c); assert.equal(check(),true,'教師填答仍有解');
  for (let seed=1; seed<=100; seed++) {
    c.seed=seed;
    const result=vm.runInContext(`(() => {
      let state=seed, calls=0;
      const rnd=()=>{if(++calls>100000)throw Error('產題未收斂');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
      const i=r.gen(rnd), a=${index === 1 ? '[i.t]' : dir === 'u2-03' ? '[i.b,i.max]' : '[...i.clean]'};
      const good=${index === 1 ? 'a[0]' : dir === 'u2-03' ? '({b:a[0],m:a[1]})' : 'a'};
      const ok=r.check(i,good)===true; a[0]++;
      return ok && r.check(i,${index === 1 ? 'a[0]' : dir === 'u2-03' ? '({b:a[0],m:a[1]})' : 'a'})!==true;
    })()`,c,{timeout:1000});
    assert.equal(result,true,`seed ${seed}`);
  }
});

// 完整執行共用外框與送出事件，只有 DOM、儲存及編碼為合成替身，無登入／網路。
function setup(gen, options={}) {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id,{value:'',hidden:false,innerHTML:'',textContent:'',
      addEventListener(){},setAttribute(){},focus(){},querySelectorAll:()=>[],querySelector:()=>({})});
    return nodes.get(id);
  };
  const c=vm.createContext({document:{body:{insertAdjacentHTML(){}},getElementById:get},window:{},
    TEACHER:{remembered:()=>false},CODEC:{encode:()=> 'synthetic'},localStorage:{getItem:()=>null,setItem(){}}});
  vm.runInContext(shell+'\nglobalThis.makeShell=SHELL;',c);
  let correct=true;
  const round={lv:1,name:'合成關卡',gen,view:()=>({get:()=>null}),check:()=>correct,...options};
  const app=c.makeShell({week:1,title:'合成活動',rounds:[round,{...round,lv:2}]});
  get('in-cls').value='999';get('in-seat').value='1';get('g-go').onclick();
  return {app,get,send:()=>get('b-send').onclick(),reply:v=>{correct=v;}};
}

test('第二組依內容排除重複（含不同鍵序），錯答留原題，兩組才過關',()=>{
  let calls=0;
  const h=setup(()=>++calls===1 ? {a:1,b:[2]} : calls<4 ? {b:[2],a:1} : {a:1,b:[3]});
  h.reply(false);h.send();assert.equal(calls,1);
  h.reply(true);h.send();assert.equal(calls,4);assert.equal(h.get('verdict').className,'verdict mid');
  assert.equal(h.app.inst.b[0],3);
  h.send();assert.equal(h.get('verdict').className,'verdict ok');assert.equal(calls,4);
});

test('題庫僅一組或連續抽同題：最多抽 20 次後照常出題',()=>{
  for (const gen of [()=>({id:1}),()=>({id:1,nested:[{n:2}]})]) {
    let calls=0; const h=setup(()=>{calls++;assert.ok(calls<=21,'不得無限重抽');return gen();});
    h.send();assert.equal(calls,21);assert.equal(h.get('verdict').className,'verdict mid');
    h.send();assert.equal(h.get('verdict').className,'verdict ok');
  }
});

test('最後一次抽到不同題仍採用；保存 view 改動前的題目內容',()=>{
  let calls=0;
  const h=setup(()=>({id:++calls<=20?1:2}),{view:i=>{i.touched=true;return {get:()=>null};}});
  h.send();assert.equal(calls,21);assert.equal(h.app.inst.id,2);
});

test('教師換題也避開前題；不同關卡不互相比對，單次確認關卡維持原規則',()=>{
  let calls=0;
  const h=setup(()=>({id:++calls<3?1:2}));
  h.get('tb-new').onclick();assert.equal(calls,3);assert.equal(h.app.inst.id,2);
  h.app.setLevel(2);assert.equal(calls,4);
  let singleCalls=0;const single=setup(()=>({id:++singleCalls}),{confirmations:1});
  single.send();assert.equal(singleCalls,1);assert.equal(single.get('verdict').className,'verdict ok');
});

test('生日題實際產題：連抽同組後會換成另一組內容',()=>{
  const c=activity('u2-03'), round=vm.runInContext('APP.rounds[0]',c);
  let calls=0;
  const h=setup(()=>round.gen(()=>++calls<=3?0:1/12));
  const first=JSON.stringify(h.app.inst);h.send();
  assert.equal(calls,4);assert.notEqual(JSON.stringify(h.app.inst),first);
});

test('保留既有容錯：前後空白、千分位、數列分隔與文字空白／大小寫',()=>{
  const c=activity('u2-02');
  assert.equal(vm.runInContext("intVal(' 1,234 ')",c),1234);
  assert.equal(vm.runInContext("numVal(' 1，234.5 ')",c),1234.5);
  assert.equal(vm.runInContext("NUMOK(' 1，234 ')",c),1234);
  for (const dir of ['u2-04','u2-07']) {
    const a=activity(dir);
    assert.equal(vm.runInContext("parseNums(' 12，13、14\\n15 ').join(',')",a),'12,13,14,15');
  }
  const a=activity('u2-04');
  assert.equal(vm.runInContext("APP.rounds[0].check({w:'LOVE'}, ' love ') === true",a),true);
});
