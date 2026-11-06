// 實際活動與 shell；只用離線 DOM 及合成資料，不載入登入或 Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function activity(dir){
  const body=new Element('body');
  const context=vm.createContext({document:{body,createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},window:{},TEACHER:{remembered:()=>true,remember(){}}});
  const run=s=>vm.runInContext(s,context,{timeout:1000});
  run(read('assets/shell.js')+'\n'+[...read(`115-g9/${dir}/index.html`).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
  return {run,round:name=>run('ROUNDS').find(r=>r.name===name)};
}
function random(seed){
  let state=seed,calls=0;
  const rnd=()=>{assert.ok(++calls<=5000,'產題亂數呼叫應有界');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  for(let n=0;n<8;n++)rnd();
  return rnd;
}
test('收得到嗎：題目、提示與判定包含剛好等於參考距離',()=>{
  const h=activity('u4-03'),r=h.round('收得到嗎');
  assert.match(r.goal,/不超過參考距離就收得到/);
  assert.match(r.tip,/剛好等於也算/);
  assert.match(r.steps({items:[]}),/剛好等於也算/);
  const rows=h.run('DIST');
  for(const [tech,distance] of [['NFC','4 公分'],['藍牙','10 公尺'],['Wi-Fi','40 公尺']]){
    const row=rows.find(x=>x[0]===tech&&x[1]===distance);
    assert.ok(row,`${tech} 等號題庫`);
    const i={items:[row]};
    assert.equal(r.check(i,[0]),true);
    assert.notEqual(r.check(i,[1]),true);
    const el=new Element('div'),v=r.view(i,el,{changed(){}});v.fill();
    assert.equal(v.get()[0],0);
  }
});
test('訊號要跑多久：2000 種子涵蓋所有情境，固定四個不重複選項且僅一正解',()=>{
  const r=activity('u4-01').round('訊號要跑多久'),kinds=new Set(),leo=new Set();
  for(let seed=1;seed<=2000;seed++){
    const i=r.gen(random(seed));kinds.add(i.kind);
    if(i.kind==='leo')leo.add(i.h+':'+i.L);
    const expected=i.kind==='fiber'?i.L/200:i.kind==='geo'?240:2*i.h/300+i.L/200;
    assert.equal(i.ans,expected);
    assert.equal(i.opts.length,4);assert.equal(new Set(i.opts).size,4);
    assert.ok(i.opts.every(v=>Number.isFinite(v)&&v>0));
    for(let n=0;n<4;n++)assert.equal(r.check(i,n)===true,i.opts[n]===expected);
  }
  assert.equal(kinds.size,3);assert.equal(leo.size,16);
  for(const value of [0,.5,.999999])assert.equal(r.gen(()=>value).opts.length,4);
});
test('網址的真名：子網域邊界、冒充前綴與路徑均依主機名稱判斷',()=>{
  const h=activity('u4-02'),r=h.round('網址的真名');
  for(const text of [r.tip,r.steps({items:[]})]){
    assert.match(text,/前面要有點/);assert.match(text,/not-tixstar\.com\.tw 不算/);
  }
  // 獨立用 URL 解析題庫，驗證既有標籤；未把標籤當作預期答案。
  const official=u=>{const host=new URL(u).hostname;return host==='tixstar.com.tw'||host.endsWith('.tixstar.com.tw')};
  const real=h.run('REAL'),fake=h.run('FAKE');
  assert.ok(fake.some(([host])=>host==='not-tixstar.com.tw'));
  for(const host of real)assert.equal(official('https://'+host+'/login'),true);
  for(const [host] of fake)assert.equal(official('https://'+host+'/login'),false);
  const seen=new Set();
  for(let seed=1;seed<=1000;seed++){
    const i=r.gen(random(seed)),answer=i.items.map(x=>{seen.add(new URL(x.u).hostname);return official(x.u)?0:1});
    assert.equal(r.check(i,answer),true);
    for(let n=0;n<answer.length;n++){
      const wrong=[...answer];wrong[n]=1-wrong[n];assert.notEqual(r.check(i,wrong),true);
    }
  }
  assert.ok(seen.has('not-tixstar.com.tw'));
});
test('猜下一個字：1000 種子各列四個機率總和 100%，正解唯一，固定亂數也會結束',()=>{
  const r=activity('u5-03').round('猜下一個字');
  const verify=i=>{
    const answer=i.S.map(s=>{
      assert.equal(s.p.length,4);assert.equal(s.w.length,4);
      assert.equal(s.p.reduce((a,b)=>a+b,0),100);
      assert.ok(s.p.every(v=>Number.isInteger(v)&&v>=5&&v<100));
      const max=Math.max(...s.p);assert.equal(s.p.filter(p=>p===max).length,1);
      return s.p.indexOf(max);
    });
    assert.equal(r.check(i,answer),true);
    for(let n=0;n<answer.length;n++){
      const wrong=[...answer];wrong[n]=(wrong[n]+1)%4;assert.notEqual(r.check(i,wrong),true);
    }
  };
  for(let seed=1;seed<=1000;seed++)verify(r.gen(random(seed)));
  for(const value of [0,.5,.999999]){
    let calls=0;verify(r.gen(()=>{assert.ok(++calls<1000);return value}));
  }
});
test('考考這棵樹：準確率依實際題數計算，含不足十題的合成資料',()=>{
  const h=activity('u5-05'),r=h.round('考考這棵樹');
  const expected=i=>i.items.filter(x=>(x[1]?3:x[2]?2:x[3]?0:1)===x[4]).length/i.items.length*100;
  const verify=i=>{
    assert.equal(i.acc,expected(i));assert.equal(r.check(i,i.acc),true);
    assert.notEqual(r.check(i,i.acc+1),true);
    const el=new Element('div'),v=r.view(i,el,{changed(){}});v.fill();
    assert.equal(v.get(),i.acc);assert.equal(v.ready(),true);
  };
  for(let seed=1;seed<=1000;seed++)verify(r.gen(random(seed)));
  for(const count of [5,8]){
    // 故意縮短測試題庫，確保產題器使用抽樣後的實際長度。
    h.run(`TEST.splice(0,TEST.length,...Array.from({length:${count}},(_,n)=>['合成題'+n,0,1,0,n<${count===5?4:6}?2:0]))`);
    const i=r.gen(random(count));assert.equal(i.items.length,count);verify(i);
  }
});
