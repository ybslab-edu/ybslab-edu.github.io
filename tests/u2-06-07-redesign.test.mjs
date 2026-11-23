import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup(dir){
 const body=new Element('body'),stored=new Map();
 const c=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},TEACHER:{remembered:()=>true,remember(){}}});
 const run=s=>vm.runInContext(s,c,{timeout:5000});
 run(read('assets/shell.js')+'\n'+[...read(`115-g9/${dir}/index.html`).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'));
 return {run,body,get:id=>body.querySelector('#'+id)};
}
const plain=x=>JSON.parse(JSON.stringify(x));
// 獨立計算成果，不呼叫頁面的 qExpected／清理工具。
function expected(dir,i){
 if(dir==='u2-06'){
  const reasons=r=>[...(r[3]!=='同意'||r[4]==='未滿18歲'&&r[5]!=='已取得'?['未取得所需同意']:[]),...(!r[6]||!r[7]||i.expectRequired&&r[8]===''?['必填缺失']:[]),...(r[8]!==''&&(r[8]<1||r[8]>i.max)?['刻度超界']:[])];
  const kept=i.rows.filter(r=>!reasons(r).length),seen=new Set(),unique=kept.filter(r=>{const k=JSON.stringify(r.slice(1));if(seen.has(k))return false;seen.add(k);return true});
  if(i.round===0)return ['停止接受回應 → 複製原始回覆到新試算表備份 → 在工作副本清理',['甲','乙','丙'][i.backup],i.max,'必填缺失','數值異常','完全重複','可保留的選填空白',i.rows.length];
  if(i.round===1){const r=i.rows.find(r=>r[8]>i.max);return ['格式 → 條件式格式設定；範圍 A2:J'+(i.rows.length+1),...i.rows.map(r=>reasons(r).length?'排除':'保留'),...['未取得所需同意','必填缺失','刻度超界'].map(x=>reasons(r).includes(x)?'有':'沒有'),kept.length]}
  if(i.round===2){const seen=new Set();return ['B～J 全部業務欄位，不比對 A 送出時間',...i.rows.map(r=>{const k=JSON.stringify(r.slice(1));if(seen.has(k))return '移除完全重複列';seen.add(k);return '保留'}),'兩列保留並交窗口核對',i.rows.length-unique.length,unique.length,unique.filter(r=>r[6]===i.query).length]}
  const jobs=['入口引導','遊戲體驗','舞台支援'],filtered=i.rows.filter(r=>r[2]===i.group&&r[7].split('、').includes(i.slot)),counts=jobs.map(j=>filtered.filter(r=>r[6]===j).length),gaps=counts.map((c,k)=>Math.max(i.demand[k]-c,0));
  assert.equal(gaps.filter(x=>x===Math.max(...gaps)).length,1,'補招職務不可並列');
  return ['篩選器，同時設定組別與包含指定時段',...counts,filtered.length,counts[jobs.indexOf(i.query)]/filtered.length*100,...gaps,jobs[gaps.indexOf(Math.max(...gaps))],['甲','乙','丙'][i.backup],'使用清理後試算表的篩選及圖表工具'];
 }
 if(i.round===0)return [i.a+i.add+i.b,i.a+i.add,i.voice,'可編輯文字','校正後文字','可播放語音'];
 if(i.round===1){let runs=[0],on=1;for(const bit of i.encode){if(bit!==on){runs.push(0);on=bit}runs[runs.length-1]++}return [i.decode.join(''),runs.join(' '),runs.length*5,runs.length*5<24?'變小':runs.length*5===24?'相同':'變大','可以逐顆完全還原']}
 if(i.round===2)return [i.n%2?8:6,i.n%2?4:3,i.precise?'原圖':'壓縮圖',i.precise?'不能接受':'可以接受'];
 return [3+i.n%2,60+i.n*3,'MUSIC-'+(i.n+11),'PNG','ZIP'];
}
for(const dir of ['u2-06','u2-07']){
 test(`${dir} 四關全版本：獨立驗算、每欄錯答與空答拒絕，資料有差異且產題有界`,()=>{
  const h=setup(dir);
  assert.equal(h.run('APP.rounds.length'),4);
  for(let r=0;r<4;r++){
   const count=dir==='u2-07'&&r===2?4:8,contents=new Set(),answers=new Set();
   for(let n=0;n<count;n++){
    h.run(`globalThis.inst=ROUNDS[${r}].gen(()=>${n}/${count});globalThis.el=new (document.body.constructor)('div');globalThis.handle=ROUNDS[${r}].view(inst,el,{changed(){}})`);
    const i=plain(h.run('inst')),a=expected(dir,i);answers.add(JSON.stringify(a));
    const content=dir==='u2-06'?i.rows: r===0?[i.a,i.b,i.add,i.voice]:r===1?[i.decode,i.encode]:r===2?[i.lines,i.kept,i.precise]:[i.files,i.capacity,i.code];
    assert.ok(!contents.has(JSON.stringify(content)));contents.add(JSON.stringify(content));
    assert.equal(h.run(`ROUNDS[${r}].check(inst,${JSON.stringify(a)})`),true);
    h.run('handle.fill()');assert.equal(h.run(`ROUNDS[${r}].check(inst,handle.get())`),true);
    for(let k=0;k<a.length;k++)for(const bad of ['',typeof a[k]==='number'?a[k]+1:'明顯錯答']){
     const wrong=[...a];wrong[k]=bad;assert.notEqual(h.run(`ROUNDS[${r}].check(inst,${JSON.stringify(wrong)})`),true,`第 ${r+1} 關版本 ${n} 欄 ${k}`);
    }
    assert.notEqual(h.run(`ROUNDS[${r}].check(inst,[])`),true);
    for(let k=0;k<a.length;k++)if(typeof a[k]==='number')for(const bad of ['-'+a[k],a[k]+'.0','+'+a[k],a[k]+'e0','0x'+a[k].toString(16),a[k]+'xyz']){
     const wrong=[...a];wrong[k]=bad;assert.notEqual(h.run(`ROUNDS[${r}].check(inst,${JSON.stringify(wrong)})`),true,'數字不可忽略非法字元');
    }
   }
   assert.ok(contents.size>=2);if(dir==='u2-06')assert.equal(answers.size,8,'每版須至少一項不同正解');
  }
 });
 test(`${dir} 實際外框：空答、錯答留題、重送不加計、同資料不同標籤不過關、兩組完成及附件呈現`,()=>{
  const h=setup(dir);
  for(let r=0;r<4;r++){
   h.run(`APP.load(${r})`);assert.equal(h.get('b-send').disabled,true);
   const key=h.run('JSON.stringify(APP.inst)');h.run('document.getElementById("b-send").onclick()');assert.match(h.get('streak').textContent,/0\/2/);
   h.run('APP.handle.fill();APP.handle.get=()=>["明顯錯答"];document.getElementById("b-send").onclick()');assert.equal(h.run('JSON.stringify(APP.inst)'),key);
   h.run(`APP.load(${r})`);
   assert.match(h.body.querySelector('.quest-attach').textContent,/本組委託附件/);
   assert.equal(h.body.querySelector('[data-fallback="use"]'),null);
   assert.equal(h.get('b-send').disabled,true);
   h.run('APP.handle.fill();document.getElementById("b-send").onclick();document.getElementById("b-send").onclick()');assert.match(h.get('streak').textContent,/1\/2/);
   h.run('globalThis.originalGen=ROUNDS[APP.ri].gen;globalThis.same=APP.inst;ROUNDS[APP.ri].gen=()=>({...same,t:same.t+"-另一標籤"})');
   h.get('b-next-group').click();h.run('APP.handle.fill();document.getElementById("b-send").onclick()');assert.match(h.get('streak').textContent,/1\/2/);
   h.run('ROUNDS[APP.ri].gen=originalGen');h.get('b-next-group').click();h.run('APP.handle.fill();document.getElementById("b-send").onclick()');assert.match(h.get('verdict').textContent,/過關/);
  }
 });
}
test('u2-07 四關附件直接顯示，公告與解壓清單完整，無工具操作或本機紀錄',()=>{
 const html=read('115-g9/u2-07/index.html'),h=setup('u2-07');
 assert.doesNotMatch(html,/備用素材|未實際操作|localStorage|qReadLog|data-fallback|<details|download|Google 雲端硬碟|工具 → 語音輸入/);
 for(let r=0;r<4;r++)for(let n=0;n<(r===2?4:8);n++){
  const count=r===2?4:8;
  h.run(`globalThis.inst=ROUNDS[${r}].gen(()=>${n}/${count});globalThis.el=new (document.body.constructor)('div');ROUNDS[${r}].view(inst,el,{changed(){}})`);
  const attachment=h.run('el').querySelector('.quest-attach'),i=plain(h.run('inst'));
  assert.ok(attachment);assert.equal(attachment.hidden,false);assert.match(attachment.textContent,/本組委託附件/);
  if(r===0)for(const line of [`第一場名額 ${i.a}`,`第二場名額 ${i.b}`,`指定語音：第二場增設體驗區 ${i.voice} 個名額`,`模擬辨識：第二場增設體驗區 ${i.voice} 個明額`])assert.ok(attachment.textContent.includes(line));
  if(r===1)assert.match(attachment.textContent,/24/);
  if(r===2)assert.ok(attachment.textContent.includes(i.kept+' 組，每組兩條細線'));
  if(r===3){
   assert.equal(attachment.querySelectorAll('tbody tr').length,i.files);
   for(const line of ['notice.txt','公告名額 '+i.capacity,'mark.txt',i.code,'badge.png','透明背景圖像',...(i.n%2?['readme.txt','示意使用說明']:[])])assert.ok(attachment.textContent.includes(line));
  }
 }
});
test('u2-07 第 3 關：相同圖像換用途不加計，必須換圖像才能完成兩組',()=>{
 for(const n of [0,1,2,3]){
  const h=setup('u2-07');
  h.run(`globalThis.originalGen=ROUNDS[2].gen;ROUNDS[2].gen=()=>originalGen(()=>${n}/4);APP.load(2)`);
  const images=()=>h.body.querySelectorAll('#stage img').map(img=>img.getAttribute('src'));
  const first=images();
  assert.equal(first.length,2);
  h.run('APP.handle.fill();document.getElementById("b-send").onclick()');
  assert.match(h.get('streak').textContent,/1\/2/);
  h.run(`globalThis.draws=0;ROUNDS[2].gen=()=>{draws++;return originalGen(()=>${n^2}/4)}`);
  h.get('b-next-group').click();
  assert.equal(h.run('draws'),20,'同圖反覆抽取仍有界');
  assert.deepEqual(images(),first,'只換用途，圖像與指定區域相同');
  h.run('APP.handle.fill();document.getElementById("b-send").onclick()');
  assert.match(h.get('streak').textContent,/1\/2/);
  assert.doesNotMatch(h.get('verdict').querySelector('h3').textContent,/過關/);
  h.run(`ROUNDS[2].gen=()=>originalGen(()=>${n^1}/4)`);
  h.get('b-next-group').click();
  assert.notDeepEqual(images(),first,'第二組須使用另一組圖像與指定區域');
  h.run('APP.handle.fill();document.getElementById("b-send").onclick()');
  assert.match(h.get('verdict').textContent,/過關/);
 }
});
test('u2-06 人工基準、選填空白、多重問題、同代號不同內容與禁用字',()=>{
 const h=setup('u2-06');
 for(let n=0;n<8;n++){
  const d=plain(h.run(`qDataset(${n})`)),raw=d.rows;
  const clean=raw.filter(r=>r[3]==='同意'&&(r[4]!=='未滿18歲'||r[5]==='已取得')&&r[6]&&r[7]&&(r[8]===''?!d.expectRequired:r[8]>=1&&r[8]<=d.max));
  const unique=clean.filter((r,k,a)=>a.findIndex(x=>JSON.stringify(x.slice(1))===JSON.stringify(r.slice(1)))===k);
  assert.equal(raw.length,n%2?14:12);assert.equal(clean.length,n%2?10:8);assert.equal(unique.length,n%2?8:6);
  assert.ok(unique.some(r=>r[9]===''));assert.ok(unique.some(r=>r[7]==='上午、下午'));
  assert.equal(unique.filter(r=>r[1]==='V1').length,2,'同代號時段不同保留');
  if(n%2){assert.ok(unique.some(r=>r[8]===''),'選填期待空白保留');const bad=raw.find(r=>r[8]>d.max);assert.equal(bad[7],'','同列同時必填缺失及刻度超界')}
  if(n<2){const f=unique.filter(r=>r[2]===d.group&&r[7].includes(d.slot));assert.deepEqual(['入口引導','遊戲體驗','舞台支援'].map(j=>f.filter(r=>r[6]===j).length),n?[1,2,2]:[2,1,1])}
  for(let r=0;r<4;r++){
   h.run(`globalThis.inst=ROUNDS[${r}].gen(()=>${n}/8);globalThis.el=new (document.body.constructor)('div');ROUNDS[${r}].view(inst,el,{changed(){}})`);
   assert.doesNotMatch(h.run('el.textContent'),/虛構|示意|後援會|2-(?:1[3-9]|20)|前測|半成品|巡堂|待確認|備用素材/);
  }
 }
});
// ZIP local headers + deflate：直接驗證實體包，而非只驗證頁面預期值。
function unzip(buf){let pos=0,out={};while(buf.readUInt32LE(pos)===0x04034b50){const method=buf.readUInt16LE(pos+8),size=buf.readUInt32LE(pos+18),nameSize=buf.readUInt16LE(pos+26),extra=buf.readUInt16LE(pos+28),name=buf.subarray(pos+30,pos+30+nameSize).toString(),start=pos+30+nameSize+extra;out[name]=method===8?inflateRawSync(buf.subarray(start,start+size)):buf.subarray(start,start+size);pos=start+size}return out}
test('u2-07 PDF、實際素材包內容與版本一致；完整燈位錯序不可只憑加總通過',()=>{
 const h=setup('u2-07');
 for(let n=0;n<8;n++){
  const root=`../115-g9/u2-07/materials/`,files=unzip(readFileSync(new URL(root+`pack-${n+1}.zip`,import.meta.url)));
  assert.equal(Object.keys(files).length,3+n%2);assert.match(files['notice.txt'].toString(),new RegExp('名額 '+(60+n*3)+'\\n'));assert.equal(files['mark.txt'].toString().trim(),'MUSIC-'+(n+11));assert.equal(files['badge.png'].subarray(1,4).toString(),'PNG');
  const pdf=readFileSync(new URL(root+`notice-${n+1}.pdf`,import.meta.url),'ascii');
  for(const line of [`第一場名額 ${30+n*2}`,`第二場名額 ${20+n}`,`指定語音：第二場增設體驗區 ${12+n} 個名額`])assert.ok(pdf.includes(Buffer.from(line,'utf16le').swap16().toString('hex')));
  h.run(`globalThis.i=ROUNDS[1].gen(()=>${n}/8);globalThis.a=qExpected(i)`);
  assert.notEqual(h.run('a[0]=a[0][0]==="0"?"1"+a[0].slice(1):"0"+a[0].slice(1);ROUNDS[1].check(i,a)'),true);
 }
});

// 舊紀錄仍走同一個活動鍵與 mask 四個位元；以合成班座測試，不連雲端。
for(const [dir,week] of [['u2-06',8],['u2-07',9]])test(dir+' 舊版紀錄保留，mask 與活動鍵相容',()=>{
 const body=new Element('body'),key='it9:w'+week+':999-1',old={mask:15,tries:[1,2,3,4,0,0],time:1},stored=new Map([[key,JSON.stringify(old)]]);
 const c=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},TEACHER:{remembered:()=>false,remember(){}}});
 vm.runInContext(read('assets/shell.js')+'\n'+[...read(`115-g9/${dir}/index.html`).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'),c);
 body.querySelector('#in-cls').value='999';body.querySelector('#in-seat').value='1';body.querySelector('#g-go').click();
 assert.equal(JSON.parse(stored.get(key)).mask,15);assert.equal(body.querySelectorAll('#rounds .passed').length,4);
 if(dir==='u2-07'){assert.match(body.querySelector('.quest-note').textContent,/舊紀錄|舊版/);assert.match(body.querySelector('.quest-note').textContent,/不代表/)}
});
