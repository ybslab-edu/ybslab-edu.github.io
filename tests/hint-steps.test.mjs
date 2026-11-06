import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
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

for(const dir of ['u5-05','u5-06'])test(dir+' 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=i.th!=null?[i.th,...i.w]:i.cand?[i.cand.length,i.qx]:i.pts?[i.pts.length]:i.items?[i.items.length]:[i.rows.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(i.acc!=null)assert.ok(!text.includes(i.acc+'%')&&!text.includes(i.acc+' %'),'不列正確率');
  if(i.qy!=null)assert.ok(!text.includes(i.qy+' 分'),'不列預測分鐘');
 }
});

for(const dir of ['u5-07','u5-08'])test(dir+' 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=i.items?[i.items.length]:i.v?[i.v.join('、')]:i.cs?[i.pts.length,i.pts[0].join(', ')]:i.fin?[i.c[0],i.c[1]]:i.m&&i.vals?[i.g.filter(x=>x===0).length]:i.m?[i.g.filter(x=>x===0).length]:i.c?[i.c[0],i.c[1],i.vals[0]]:[i.pts.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(i.k!=null)assert.ok(!text.includes('放 '+i.k+' 個')&&!text.includes('手肘是 '+i.k),'不列手肘答案');
  if(i.fin)for(const f of i.fin)assert.ok(!text.includes('最後是 '+f),'不列收斂中心');
 }
});

for(const dir of ['u5-09','u5-10'])test(dir+' 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=i.items?[i.items.length]:i.tot?[i.tot]:i.cards?[i.cards.length]:i.rows?[i.rows.length]:[i.h.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(i.acc!=null)assert.ok(!text.includes(i.acc+'%')&&!text.includes(i.acc+' %'),'不列準確率');
 }
});

test('u2-02 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u2-02';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=index===0?[i.target]:index===1?[i.use,i.minRes,i.minColors]:index===2?[i.target,i.seconds]:[i.cap,i.minutes];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  if(index===2)assert.ok(!text.includes('＝'+i.target*i.seconds)&&!text.includes(' '+i.target*i.seconds+' 張'),'不列總張數');
 }
});

test('u1-01 每關多種子拆步驟使用題目內容且不列最終答案',()=>{
 const dir='u1-01';
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 vm.runInContext(read('assets/shell.js').slice(read('assets/shell.js').indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);
  assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const inputs=i.dev?[i.dev,i.items.length]:[i.items.length];
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
 }
});

for(const dir of ['u0-01','u1-02','u1-03','u1-04','u1-05','u1-06','u2-01'])test(dir+' 每關 30 種子拆步驟含題目內容、保留資料且不洩漏答案（含演出型）',()=>{
 // 演出型的 gen 保留既有 DOM 節點；只提供空節點，不執行 view 或連線。
 const node={hidden:false,innerHTML:'',onclick(){},append(){},addEventListener(){},insertAdjacentHTML(){},classList:{toggle(){}},setAttribute(){}};
 node.querySelector=()=>node;node.previousElementSibling=node;
 const document={getElementById:()=>node,addEventListener(){},body:node};
 const c=vm.createContext({SHELL:cfg=>cfg,console,document});
 const shell=read('assets/shell.js');
 vm.runInContext(shell.slice(shell.indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=APP.rounds;this.originals=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed,calls=0;const rnd=()=>{if(++calls>100000)throw Error('產題超過上限');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  assert.equal(typeof r.steps,'function',r.name+' 缺少 steps');
  const i=r.gen(rnd);
  if(dir==='u2-01'){
   c.seededRandom=rnd;
   vm.runInContext('Math.random=seededRandom;ri='+index+';setRes='+((seed-1)%5)+';setDep='+((seed-1)%5)+';newPhotos();this.photoState=()=>({photos,answers,setRes,setDep});this.settings=()=>({n:curRes(),d:curDep(),ground:GROUND});',c);
  }
  const snapshot=()=>JSON.stringify({i,rounds:c.originals,photo:dir==='u2-01'?c.photoState():null});
  const before=snapshot(),text=r.steps(i);
  assert.equal(snapshot(),before,r.name+' 不得改題目資料');
  assert.ok(text.length>35);assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  let inputs=[];
  if(dir==='u0-01')inputs=i.items?[i.items.length,i.items[0][0]]:[i.cards.length];
  if(dir==='u1-02')inputs=i.t?[i.t.length,i.cards.length,i.t[0].n,i.t[0].need,i.t[0].dl,...(index===2?[i.t[0].rel]:[])]:i.rows?[i.cap,i.fg,i.need,i.rows.length]:[i.n.length,...(i.q==='cpu'?i.cpu.map(v=>v+'%'):i.mem.map(v=>v+' MB'))];
  if(dir==='u1-03')inputs=index===0?[i.items.length,i.items[0][1]]:index===1?[i.items.length,i.items[0][0]]:index===2?[i.cards.length,...i.cards.map(x=>x[0])]:[i.y1,i.y2,i.n];
  if(dir==='u1-04')inputs=i.items?[i.items.length,i.items[0][0]]:i.g?[i.g.length,...i.g.flatMap(g=>[g[0],g[1]])]:[i.name,i.cards.length];
  if(dir==='u1-05')inputs=Object.values(c.originals[index].tests[0]).filter(v=>v!==null);
  if(dir==='u1-06'){const r0=c.originals[index],t=r0.tests[0];inputs=[t.order.drink,t.order.qty,t.order.price,...(t.sales!=null?[t.sales]:[]),...(t.ledger!=null?[t.ledger]:[]),...(index!==1?[r0.cap]:[])];}
  if(dir==='u2-01'){const s=c.settings();inputs=[s.n,s.d,2,...(index===2?[c.originals[index].cap/8]:index===3?[s.ground,s.ground/s.n]:[])];}
  for(const input of inputs)assert.ok(text.includes(String(input)),`${r.name}: 缺少實際題目 ${input}`);
  // 改掉隱藏解答仍應產生相同提示，防止把解答欄位變成提示來源。
  const hidden=new Set(['sol','ans','c','m','digit','buses']);
  const guard=value=>value&&typeof value==='object'?new Proxy(value,{get(target,key){if(hidden.has(key))throw Error(r.name+' 讀取隱藏解答 '+key);return guard(Reflect.get(target,key));}}):value;
  c.guardAnswers=guard;
  vm.runInContext('this.savedRounds=ROUNDS.slice();ROUNDS.forEach((r,k)=>{ROUNDS[k]=guardAnswers(r)});'+(dir==='u2-01'?'this.savedPhotos=photos;photos=guardAnswers(photos);':''),c);
  try{assert.equal(r.steps(guard(i)),text);}finally{
   vm.runInContext('savedRounds.forEach((r,k)=>{ROUNDS[k]=r});'+(dir==='u2-01'?'photos=savedPhotos;':''),c);
  }
  assert.equal(snapshot(),before);
  if(i.sol){
   const solution=i.sol.map(k=>i.cards?i.cards[k]:i.items[k][1]);
   assert.ok(!text.includes(solution.join(' → '))&&!text.includes(i.sol.join(',')),'不列完整排序答案');
  }
  if(dir==='u1-03'&&index===3)assert.ok(!text.includes('＝'+i.ans)&&!text.includes(' '+i.ans+(i.q==='x'?' 倍':' 億個')),'不列最後倍數或數量');
  if(dir==='u1-05'){
   const t=c.originals[index].tests[0],total=index===0?t[11]+t[12]:index===3?t[11]*t[12]+t[13]*t[14]:t[11]*t[12]+t[13];
   assert.ok(!text.includes(total+' 元'),'不列總價');
   if(index===2)assert.doesNotMatch(text,/錢不夠|錢夠了/);
  }
  if(dir==='u1-06'){
   const t=c.originals[index].tests[0],points=t.order.qty*t.order.price;
   if(points!==t.order.price)assert.ok(!text.includes(points+' 分'),'不列本次得分');
   if(t.sales!=null)assert.ok(!text.includes((t.sales+points)+' 分'),'不列更新後進度');
  }
  if(dir==='u2-01')assert.doesNotMatch(text,/背號是|成員是|有 [2-5] 台遊覽車|64 色才|一格 2 公尺時/);
  if(dir==='u0-01'&&index===1)for(const label of ['依照號碼入座','不飲食','認真上課學習','尊重同學','離開前收好'])assert.ok(text.includes(label));
  if(dir==='u0-01'&&index===2)for(const label of ['認知（30%）','情意（30%）','技能（40%）'])assert.ok(text.includes(label));
  if(dir==='u1-04'&&index===0)assert.ok(text.includes('輸入也輸出'));
  if(dir==='u1-02'&&index===3)for(const label of ['留著','關掉'])assert.ok(text.includes(label));
  if(r.manualAttempt)assert.ok(text.length>35,'演出型關卡也能取得第 2 層');
 }
});


// 從分類元件取得畫面項目、類別及示範填答；不碰 DOM、Firebase 或正式資料。
const plain=text=>String(text).replace(/<[^>]*>/g,'').replace(/\s+/g,'');
function assertClassificationSteps(text,items,labels,answers){
 const hint=plain(text);
 // 題目文字本身可能含類別名（例如「台北」）；先移除每項的一次引用，
 // 避免把重述題目誤認為額外提供分類答案。
 let guidance=hint;
 for(const item of [...items].sort((a,b)=>plain(b.html).length-plain(a.html).length))
  guidance=guidance.replace(plain(item.html),'');
 assert.ok(!(items.every(item=>hint.includes(plain(item.html)))&&answers.every(k=>guidance.includes(plain(labels[k])))),
  '不得同時列出所有分類項目與其正解類別');
}
function assertOrderSteps(text){
 // 即使階段名稱全被同義改寫，也不能用箭頭串出三個以上階段。
 for(const clause of text.split(/[。！？；\n]|<\/li>/))
  assert.ok((clause.match(/→|⇒|➜|->/g)||[]).length<=1,'不得以箭頭串接超過兩個階段');
}
function assertImageSettings(text,values){
 for(const value of values)
  assert.doesNotMatch(text,new RegExp('(?:調到|設為|設成|設定為|選定)\\s*'+value+'(?![0-9])'),'不得直接指定正確設定值');
}

for(const dir of readdirSync(new URL('../115-g9/',import.meta.url)).filter(d=>/^u\d+-\d+$/.test(d)))
 test(dir+' 分類與排序提示不可列完整解答（30 種子及洩漏注入）',()=>{
  const node={innerHTML:'',hidden:false,append(){},addEventListener(){},insertAdjacentHTML(){},setAttribute(){},classList:{toggle(){}}};
  node.querySelector=()=>node;node.querySelectorAll=()=>[];node.previousElementSibling=node;
  const c=vm.createContext({SHELL:cfg=>cfg,console,document:{getElementById:()=>node,addEventListener(){},body:node}});
  const shell=read('assets/shell.js');
  vm.runInContext(shell.slice(shell.indexOf('const PICK ='))+'\n'+[...read('115-g9/'+dir+'/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=APP.rounds;',c);
  let captured;
  c.captureClassify=(_el,items,labels)=>{
   captured={items,labels};let answers=items.map(()=>null);
   return {get:()=>answers,fill:a=>{answers=a;captured.answers=a},ready:()=>true};
  };
  vm.runInContext('CLASSIFY=captureClassify;',c);
  for(const r of c.rounds)for(let seed=1;seed<=30;seed++){
   const view=String(r.view);
   const classification=/\bCLASSIFY\(/.test(view),ordering=/\b(?:ORDERBOX|ORDER|scheduleView)\(/.test(view);
   if(!classification&&!ordering)continue;
   let state=seed,calls=0;const rnd=()=>{if(++calls>100000)throw Error('產題超過上限');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
   const i=r.gen(rnd),text=r.steps(i);
   if(ordering){
    assertOrderSteps(text);
    assert.throws(()=>assertOrderSteps(text+'先有資料 → 幫資料標答案 → 拿來訓練 → 測試準不準 → 上線給大家用。'),/箭頭串接/);
   }
   if(classification){
    captured=null;
    const ui=r.view(i,node,{esc:String,changed(){}});ui.fill();
    assert.ok(captured,r.name+' 應取得分類元件');
    // 單選與已揭示的分組圖不是待作答的逐項分類。
    if(captured.labels.length<2)continue;
    assert.ok(captured.answers,r.name+' 應取得示範分類答案');
    // 分組比較關的元件只展示已知分組，check 檢查的是另一個單選答案。
    if(dir==='u5-07'&&r.name==='把中心搬到中間')continue;
    assert.equal(r.check(i,captured.answers),true,r.name+' 分類示範答案須能通過判定');
    const {items,labels,answers}=captured;
    assertClassificationSteps(text,items,labels,answers);
    const leaked=items.map((item,k)=>plain(item.html)+'：'+labels[answers[k]]).join('；');
    assert.throws(()=>assertClassificationSteps(text+'。'+leaked,items,labels,answers),/正解類別/);
   }
  }
 });

test('影像與 fps 提示會攔截直接指定正解值，仍允許引用題目要求',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg,console});
 const shell=read('assets/shell.js');
 vm.runInContext(shell.slice(shell.indexOf('const PICK ='))+'\n'+[...read('115-g9/u2-02/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n')+'\nthis.rounds=ROUNDS;',c);
 for(const index of [1,2])for(let seed=1;seed<=30;seed++){
  let state=seed;const rnd=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296};
  const r=c.rounds[index],i=r.gen(rnd),text=r.steps(i),values=index===1?[i.minRes,i.minColors]:[i.target];
  assertImageSettings(text,values);
  assert.match(text,/兩種/,'引導學生實際比較兩種設定');
  for(const value of values)for(const verb of ['調到','設為','設成','設定為','選定'])
   assert.throws(()=>assertImageSettings(text+'。'+verb+' '+value,values),/正確設定值/);
 }
});
