import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const dir of ['u2-03','u2-04','u2-05','u2-06','u2-07'])test(dir+' 每關多種子拆步驟使用題目內容、保留資料且不列最終答案',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nglobalThis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed,calls=0;const rnd=()=>{if(++calls>100000)throw Error('產題超過上限');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=dir==='u2-03'&&index===1?[i.t.toString(2).padStart(6,'0')]:i.members?[i.members,i.n,...i.v]:i.items?i.items.map(x=>Array.isArray(x)?x[0]:x.q):i.rows?[i.rows.length,i.rows[0].c,i.rows[0].s]:i.bits?[i.bits,i.kib,i.amount]:i.members?[i.members,i.n]:i.w?[dir==='u2-04'&&index===0?[...i.w].map(c=>c.charCodeAt(0)).join('、'):i.w]:i.s?[i.s]:i.b&&Array.isArray(i.b)?[i.b.length]:i.n?[i.n]:[i.t];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(dir==='u2-03'&&(index===0||index===2))assert.ok(!text.includes(i.t.toString(2).padStart(index===0?5:8,'0')),'不列完整亮暗答案');
  if(dir==='u2-03'&&index===1)assert.ok(!text.includes('＝'+i.t),'不列加總結果');
  if(dir==='u2-04'&&index===0)assert.ok(!text.includes(i.w),'不解出整句');
  if(dir==='u2-04'&&index===1)assert.ok(!text.includes([...i.w].map(c=>c.charCodeAt(0)).join(' ')),'不列編碼答案');
  if(dir==='u2-07'&&index===1)assert.ok(!text.includes(i.r.join(' ')),'不列壓縮答案');
 }
});

test('u4-01 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-01';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===0?[i.a,i.b,i.cut.length]:index===1?[i.cut.length]:index===2?[i.items.length]:i.kind==='fiber'?[i.dest,i.L]:i.kind==='geo'?['36000']:[i.h,i.L];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===1)for(const n of i.off)assert.ok(!text.includes(n),'不列出連不到的地方：'+n);
  if(index===3)assert.ok(!text.includes('約 '+i.ans+' 毫秒')&&!text.includes('＝'+i.ans),'不列最終毫秒數');
 }
});

test('u4-02 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-02';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===0?[i.n,i.src,i.dst]:index===1?[i.items.length]:index===2?[i.n,i.cards.length]:[i.url];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===0)assert.ok(!text.includes(i.s),'不列出組回來的訊息');
  if(index===1)for(const it of i.items)assert.ok(!text.includes(it.u),'不逐一判定網址');
  if(index===2)assert.ok(!text.includes('第 '+i.lost+' 號')&&!text.includes('重送第 '+i.lost),'不列遺失編號');
  if(index===3)assert.ok(!text.includes(i.ans),'不列答案 IP');
 }
});

test('u4-03 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-03';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===0||index===1?[i.items.length]:index===2?[i.g.length]:[i.cells.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===2)assert.ok(!text.includes(i.dead.length+' 個死角'),'不列死角數');
  if(index===3)assert.ok(!text.includes(i.cov.join('、'))&&!text.includes('第 '+(i.best+1)+' 個'),'不列最佳位置');
 }
});

test('u4-04 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-04';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===1?[i.hist.length,i.cands.length,i.hist[0].title,...i.hist[0].tags]:[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===1)for(const cand of i.cands)assert.ok(!text.includes(cand.title),'不列候選影片（避免暗示推薦）');
 }
});

test('u4-05 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-05';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===2?[i.text]:index===3?i.s.map(x=>x.km):[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===3)assert.ok(!text.includes('選'+i.s[i.best].n)&&!text.includes(i.s[i.best].n+' 最'),'不列最佳地點');
 }
});

test('u4-06 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u4-06';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===0?[i.cards.length]:[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===0)for(const card of i.cards)assert.ok(!text.includes(card.t),'不列卡片排序');
 }
});

test('u5-01 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u5-01';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;this.STEPS=STEPS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===3?[i.cards.length]:[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===3)for(const k of i.cards)assert.ok(!text.includes(c.STEPS[k]),'不列步驟卡原文');
 }
});

test('u5-02 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u5-02';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===2?[i.ref.length,i.items.length]:[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
 }
});

for(const dir of ['u5-03','u5-04'])test(dir+' 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=i.items?[i.items.length]:i.txt?[i.txt]:i.goal?[i.goal,i.opts.length]:i.S?[i.S.length,...i.S[0].p]:i.opts?[i.opts.length]:[i.cards.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(i.opts&&i.ans!=null)assert.ok(!text.includes(typeof i.opts[i.ans]==='string'?i.opts[i.ans]:'\u0000'),'不列正確選項原文');
 }
});
