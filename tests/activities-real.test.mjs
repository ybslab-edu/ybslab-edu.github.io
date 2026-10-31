// 實際頁面 + 共用 shell，只有 DOM/儲存是替身；不載入登入或網路。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('assets/shell.js');
const seeds=[1,7,42,2026,0x12345678,0x7fffffff,0x80000000,0xffffffff];
function activity(dir){
  const html=read(`115-g9/${dir}/index.html`),body=new Element('body');
  const context=vm.createContext({document:{body,addEventListener(){},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},
    window:{},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>false,remember(){}},setTimeout:()=>0,clearTimeout(){},
    matchMedia:()=>({matches:true})});
  const run=(source,timeout=1000)=>vm.runInContext(source,context,{timeout});
  // 控制 Math.random（自訂活動也會用到），同時限制傳入 gen 的 rnd 呼叫數。
  run(`let state=1,calls=0;function rnd(){if(++calls>100000)throw Error('產題亂數超過 100000 次');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296}Math.random=rnd;`);
  run(read('assets/codec.js')+'\n'+shell+'\n'+[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,context};
}
const dirs=readdirSync(new URL('../115-g9/',import.meta.url)).filter(d=>/^u\d+-\d+$/.test(d)&&read(`115-g9/${d}/index.html`).includes('assets/shell.js'));
test('使用 shell 活動清單完整（新增活動會自動納入）',()=>assert.equal(dirs.length,30));
for(const dir of dirs){
  test(`${dir}：所有實際 gen/view/fill/get/check，多種子有界產題、正解與錯答`,()=>{
    const {run,context}=activity(dir);
    const count=run('APP.rounds.length');
    assert.equal(count,4,dir+' 關卡數；合計 30 活動 × 4 關 = 120 關');
    for(let index=0;index<count;index++)for(const seed of seeds){
      context.index=index;context.seed=seed;
      const result=run(`(()=>{
        state=seed;calls=0;const r=APP.rounds[index],inst=r.gen(rnd),el=document.getElementById('stage');el.innerHTML='';
        const h=r.view(inst,el,{changed(){},attempt(){},esc:s=>String(s)});
        if(typeof h.fill!=='function')throw Error('無通用解答：缺 fill');
        h.fill();const answer=h.get();
        const good=r.check(inst,answer)===true;
        // 排序改成反向排列；其他答案改為負值／錯字。集合題移除一項，避免只是換序仍正確。
        const wrong=v=>Array.isArray(v)?(v.length>1&&new Set(v).size===v.length?[...v].reverse():v.map(wrong)):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k==='powerOff'?x:wrong(x)])):typeof v==='number'?-999999:typeof v==='boolean'?!v:'明顯錯答';
        const badAnswer=(('${dir}'==='u4-01'&&index===1)||('${dir}'==='u4-03'&&index===2)||('${dir}'==='u4-05'&&index===2))?answer.slice(1):wrong(answer);
        return {good,bad:r.check(inst,badAnswer)===true,ready:!h.ready||h.ready(),calls};
      })()`);
      assert.equal(result.good,true,`${dir} 關 ${index+1} seed ${seed} 教師正解`);
      assert.equal(result.ready,true,`${dir} 關 ${index+1} seed ${seed} 正解可送出`);
      assert.equal(result.bad,false,`${dir} 關 ${index+1} seed ${seed} 錯答`);
      assert.ok(result.calls<=100000);
    }
  });
}

// rnd 的契約只有 [0,1)，固定 0 是可重現的退化來源；不是一般種子一定卡住的宣稱。
test('u1-01 第一關在固定亂數 0 時有重抽上限',()=>{
  activity('u1-01').run('APP.rounds[0].gen(()=>0)',50);
});
