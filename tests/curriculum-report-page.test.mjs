// 真正頁面模組 + 既有小型 DOM + 合成 Firebase；可在禁止開埠的沙箱驗證流程。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {fakeCurriculumFirebase} from './fixtures/curriculum-firebase.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/report/index.html');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function setup(){
  const body=new Element('body');body.innerHTML=html;
  const downloads=[],blobs=[],remembered=new Map();
  function decorate(el){
    el.append=(...nodes)=>nodes.forEach(n=>Element.prototype.append.call(el,n));
    el.replaceChildren=(...nodes)=>{el.childNodes=[];el.append(...nodes);if(el.tagName==='SELECT')el.value=nodes[0]?.value||'';};
    el.remove=()=>{if(el.parentElement){const a=el.parentElement.childNodes;a.splice(a.indexOf(el),1);}};
    if(el.tagName==='A')el.click=()=>downloads.push(el.download);
    return el;
  }
  body.querySelectorAll('').forEach(decorate);
  for(const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g))body.querySelector('#'+match[1]).disabled=/\bdisabled\b/.test(match[0]);
  const get=id=>body.querySelector('#'+id);
  const context=vm.createContext({window:{},document:{body,getElementById:get,createElement:tag=>decorate(new Element(tag))},location:{pathname:'/115-g9/teacher/report/'},
    Date:class extends Date{static now(){return Date.parse('2026-11-05T00:00:00Z');}},
    Blob,TextEncoder,queueMicrotask,setTimeout:()=>0,prompt:()=>null,sessionStorage:{getItem:k=>remembered.get(k),setItem:(k,v)=>remembered.set(k,v)},
    URL:{createObjectURL:b=>{blobs.push(b);return'blob:synthetic';},revokeObjectURL(){}}});
  context.window=context;
  vm.runInContext(fakeCurriculumFirebase,context);
  vm.runInContext('const YBS={firebaseSession:async()=>({auth,db})};',context);
  for(const path of ['assets/teacher.js','assets/curriculum.js','assets/activities.js','assets/lock.js','assets/vendor/xlsx-0.20.3.full.min.js','assets/curriculum-report.js','115-g9/teacher/report/report.js'])vm.runInContext(read(path),context,{filename:path});
  return{get,downloads,blobs,context,evaluate:source=>vm.runInContext(source,context),async login(){await get('report-login').onclick();await settle();},read:()=>get('report-read').onclick()};
}
test('獨立頁沿用資源與 CSP；登入後 server 讀取 owner、roster、attempts，班級篩選與 Excel 同步',async()=>{
  const h=setup();assert.equal(h.get('report-read').disabled,true);assert.equal(h.get('report-export').disabled,true);
  assert.ok(html.includes('assets/teacher.js'));assert.ok(html.includes('Content-Security-Policy'));
  await h.login();await h.read();assert.match(h.get('report-summary').textContent,/名冊 3 人/);
  h.get('report-class').value='999';h.get('report-class').onchange();
  assert.match(h.get('report-summary').textContent,/名冊 2 人/);
  assert.match(h.get('report-rows').textContent,/深夜手搖店已開放 · 1\/2 人 · 50.0%/);
  assert.ok(h.get('report-rows').querySelectorAll('tr').length>20);
  h.get('report-export').onclick();assert.deepEqual(h.downloads,['課綱達成報告_115-g9_999.xlsx']);
  h.context.bytes=new Uint8Array(await h.blobs[0].arrayBuffer());
  const rows=JSON.parse(h.evaluate("JSON.stringify(XLSX.utils.sheet_to_json(XLSX.read(bytes,{type:'array'}).Sheets['課綱達成報告'],{header:1,defval:null}))"));
  const a=rows.find(r=>r[0]==='資S-IV-2'&&r[7]===1);assert.equal(a[11],.5);assert.equal(a[3],2);assert.equal(a[2],'999');
  const paths=JSON.parse(h.evaluate('JSON.stringify(__reportFake.reads)'));
  assert.deepEqual(paths.map(r=>r[0]),['ybsCourses/115-g9','ybsCourses/115-g9/roster','ybsCourses/115-g9/attempts']);
  assert.ok(paths.every(r=>r[1].source==='server'));
  await h.get('report-logout').onclick();assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-export').disabled,true);
});
test('非 owner 不列舉；網路失敗清除舊結果，重試成功',async()=>{
  const h=setup();await h.login();h.evaluate("__reportFake.owner='other'");await h.read();
  assert.match(h.get('report-status').textContent,/無權限/);assert.equal(h.evaluate('__reportFake.reads.length'),1);
  assert.equal(h.get('report-export').disabled,true);
  h.evaluate("__reportFake.owner='teacher1'");await h.read();assert.equal(h.get('report-export').disabled,false);
  h.evaluate('__reportFake.fail=true');await h.read();assert.match(h.get('report-status').textContent,/失敗/);
  assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-export').disabled,true);
  h.evaluate('__reportFake.fail=false');await h.read();assert.equal(h.get('report-export').disabled,false);
});
for(const change of ['logout','switch'])test(`讀取中 ${change} 不接受遲到結果`,async()=>{
  const h=setup();await h.login();h.evaluate('__reportFake.hold=true');const reading=h.read();await settle();
  assert.equal(h.get('report-read').disabled,true);assert.equal(h.get('report-export').disabled,true);
  if(change==='logout')await h.get('report-logout').onclick();else h.evaluate("__reportFake.switchUser('teacher2')");
  h.evaluate('__reportFake.release()');await reading;
  assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-export').disabled,true);
});
test('空名冊仍列課綱、Excel 空比率；匿名登入不能讀取；記憶教師解鎖不取代 owner 登入',async()=>{
  const h=setup();h.evaluate("TEACHER.remember(true)");assert.equal(h.evaluate('TEACHER.remembered()'),true);
  assert.equal(h.get('report-read').disabled,true);await h.login();
  h.evaluate('__reportFake.roster=[];__reportFake.attempts=[]');await h.read();
  assert.match(h.get('report-summary').textContent,/名冊 0 人/);assert.match(h.get('report-rows').textContent,/無有效名冊/);
  h.evaluate("auth.currentUser={uid:'anonymous',isAnonymous:true};notify()");await h.read();
  assert.equal(h.get('report-rows').textContent,'');assert.equal(h.get('report-read').disabled,true);
});
