// 合成時鐘與 DOM；不連 Firebase，也不使用教師真實通行碼。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const activities = read('assets/activities.js');
const lock = read('assets/lock.js');
const before = '2026-11-08T23:58:59+08:00';
const boundary = '2026-11-08T23:59:00+08:00';
function setup({path='/115-g9/u2-03/', now=before, remembered=false, accepted=false, loadActivities=true, loading=true}={}) {
  const elements=[], events={}, button={};
  let reloads=0, saved=false;
  const context=vm.createContext({
    Date:class extends Date {static now(){return Date.parse(now);}},
    location:{pathname:path,reload(){reloads++;}},
    TEACHER:{remembered:()=>remembered,check:async()=>accepted,remember(value){saved=value;}},
    prompt:()=>'synthetic-code',alert(){},
    document:{readyState:loading?'loading':'complete',body:{appendChild:e=>elements.push(e)},
      createElement:()=>({style:{}}),getElementById:()=>button,
      addEventListener:(name,fn)=>{events[name]=fn;}}
  });
  vm.runInContext(read('assets/curriculum.js'),context);
  if(loadActivities && !loading) vm.runInContext(activities,context);
  vm.runInContext(lock,context); // HTML 解析期間和實際活動頁一樣，lock 先載入
  if(loadActivities && loading) vm.runInContext(activities,context);
  events.DOMContentLoaded?.();
  return {context,elements,button,reloads:()=>reloads,saved:()=>saved,
    open:href=>vm.runInContext(`isActivityOpen(ACTIVITIES.find(a=>a.href===${JSON.stringify(href)}))`,context)};
}
test('u2-03 台灣 11/8 23:58:59 鎖、23:59:00 開，日期判斷與遮罩一致',()=>{
  for(const [now,expected] of [[before,false],[boundary,true]]){
    const h=setup({now});
    assert.equal(h.open('115-g9/u2-03/'),expected);
    assert.equal(h.elements.length,expected?0:1);
  }
});
test('裝置時區 UTC、台北、洛杉磯、東京結果相同（獨立程序）',()=>{
  const script=activities+`\nconst a=ACTIVITIES.find(a=>a.href==='115-g9/u2-03/');
    if (isActivityOpen(a,Date.parse('${before}')) !== false || isActivityOpen(a,Date.parse('${boundary}')) !== true) process.exit(1);`;
  for(const TZ of ['UTC','Asia/Taipei','America/Los_Angeles','Asia/Tokyo']){
    const r=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ},encoding:'utf8'});
    assert.equal(r.status,0,TZ + ': ' + r.stderr);
  }
});
test('週一到週六用同一個最近週日；週日上課用前一週日',()=>{
  const {context}=setup();
  for(const date of ['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']){
    assert.equal(vm.runInContext(`activityOpenAt({date:'${date}'})`,context),Date.parse(boundary),date);
  }
  assert.equal(vm.runInContext("activityOpenAt({date:'2027-01-01'})",context),Date.parse('2026-12-27T23:59:00+08:00'));
});
test('已過上課日期、學期結束後保持開放；also 不使活動重新上鎖',()=>{
  for(const now of [boundary,'2026-11-10T00:00:00+08:00','2028-01-01T00:00:00Z']){
    const h=setup({now});assert.equal(h.open('115-g9/u2-03/'),true);assert.equal(h.elements.length,0);
  }
  const {context}=setup();
  assert.equal(vm.runInContext(`isActivityOpen({date:'2026-10-21',also:['2026-11-04'],href:'synthetic/a/'},Date.parse('2026-10-25T00:00:00Z'))`,context),true);
});
test('OPEN 手動清單可在上課前提早開放，未登記或日期無效仍鎖',()=>{
  const h=setup({path:'/115-g9/u2-02/',now:'2026-01-01T00:00:00Z'});
  assert.equal(h.open('115-g9/u2-02/'),true);assert.equal(h.elements.length,0);
  assert.equal(setup({path:'/115-df/a/',loadActivities:false}).elements.length,1);
  assert.equal(setup({path:'/115-g9/unknown/'}).elements.length,1);
  for(const date of ['', 'bad', '2026-02-30']){
    h.context.badDate=date;
    assert.equal(vm.runInContext("isActivityOpen({date:badDate,href:'115-g9/unknown/',course:'115-g9'})",h.context),false);
  }
});
test('已記憶的教師解鎖、課程首頁、teacher 頁不受影響',()=>{
  assert.equal(setup({remembered:true}).elements.length,0);
  for(const path of ['/','/115-g9/','/115-g9/teacher/','/115-df/teacher/','/115-g9/index.html']){
    assert.equal(setup({path,loadActivities:false}).elements.length,0,path);
  }
});
test('教師解鎖成功保留原本記憶與重新整理流程，失敗不解鎖',async()=>{
  for(const accepted of [false,true]){
    const h=setup({accepted});assert.equal(h.elements.length,1);
    await h.button.onclick();assert.equal(h.saved(),accepted);assert.equal(h.reloads(),accepted?1:0);
  }
});
test('未載入活動資料時保持鎖定；DOM 完成後載入 lock 仍可判斷',()=>{
  assert.equal(setup({loadActivities:false}).elements.length,1);
  assert.equal(setup({loading:false}).elements.length,1);
  assert.equal(setup({loading:false,now:boundary}).elements.length,0);
});

test('未開設課程優先於 OPEN 及日期，教師仍可解鎖與回訪',async()=>{
  for(const now of ['2026-01-01T00:00:00Z','2028-01-01T00:00:00Z']){
    const h=setup({path:'/115-df/a/',now,accepted:true});
    assert.match(h.elements[0].innerHTML,/本學年未開設這門課/);
    await h.button.onclick();assert.equal(h.saved(),true);assert.equal(h.reloads(),1);
    assert.equal(setup({path:'/115-df/a/',now,remembered:true}).elements.length,0);
  }
});
