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
