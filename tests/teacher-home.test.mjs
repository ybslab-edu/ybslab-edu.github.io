import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {setup as teacher} from './fixtures/teacher-export.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('115-g9/teacher/index.html');
test('教師首頁四類保留既有工具、首頁連結及本機正式工具入口',()=>{
  for(const [id,title] of [['student-records','學生紀錄'],['questions-activities','題目與活動'],['course-settings','課程設定'],['other-tools','其他工具']]){
    assert.match(html,new RegExp('href="#'+id+'"'));
    assert.match(html,new RegExp('id="'+id+'"[\\s\\S]*?<h2[^>]*>'+title+'</h2>'));
  }
  for(const id of ['cloud-login','cloud-read','cloud-logout','cloud-export','cloud-status','cloud-class','cloud-table','health-class','health-status','health-table','legacy-panel','legacy-msg','b-legacy-export','dlmsg'])assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
  for(const href of ['../../','../../115-df/teacher/','https://class-score-86020.web.app'])assert.ok(html.includes('href="'+href+'"'));
  assert.ok(existsSync(new URL('../115-df/teacher/index.html',import.meta.url)));
  assert.ok(read('lab/login-test/index.html').includes('https://class-score-86020.web.app'));
  assert.ok(!html.includes('../me/me.css'));
  assert.doesNotMatch(html,/<(?:input|button)[^>]*(?:switch|checkbox)/);
});
test('開放摘要沿用設定與日期，課程未開設優先於提早開放',()=>{
  const context=vm.createContext({location:{pathname:'/115-g9/teacher/'}});
  for(const path of ['assets/curriculum.js','assets/activities.js','assets/lock.js'])vm.runInContext(read(path),context);
  const data=vm.runInContext(`COURSES.map(c=>({id:c.id,open:c.open,count:ACTIVITIES.filter(a=>a.course===c.id&&c.open&&isActivityOpen(a,0)).length}))`,context);
  assert.equal(data[0].count,4);assert.equal(data[1].open,false);assert.equal(data[1].count,0);
  const script=read('assets/teacher-home.js');
  assert.match(script,/course.open && isActivityOpen/);
  assert.match(script,/DOMContentLoaded/);
  assert.doesNotMatch(script,/fetch\(|firebase|localStorage|\.open\s*=/);
});

for(const closed of [false,true])test(closed?'未開設課程即使活動可開放，首頁仍顯示零開放':'沒有課程時清空首頁摘要，不保留舊卡片',()=>{
  class SummaryElement extends Element {
    append(...nodes){for(const node of nodes)super.append(node);}
    replaceChildren(...nodes){this.innerHTML='';this.append(...nodes);}
  }
  const courses=new SummaryElement('div'),activities=new SummaryElement('div');
  courses.textContent='舊課程';activities.textContent='舊活動';
  const context=vm.createContext({
    document:{readyState:'complete',getElementById:id=>({'teacher-courses':courses,'teacher-activities':activities})[id],createElement:tag=>new SummaryElement(tag)},
    COURSES:closed?[{id:'synthetic',name:'合成課程',open:false}]:[],
    ACTIVITIES:[{course:'synthetic',title:'合成活動',href:'synthetic/',date:'2026-11-01'}],
    isActivityOpen:()=>true,
  });
  vm.runInContext(read('assets/teacher-home.js'),context);
  if(!closed){assert.equal(courses.textContent,'');assert.equal(activities.textContent,'');return;}
  assert.equal(courses.querySelectorAll('article').length,1);
  assert.equal(courses.querySelector('.muted').textContent,'課程未開設');
  assert.match(courses.textContent,/已開放 0 ／ 1 個活動/);
  assert.equal(activities.querySelector('span').textContent,'課程未開設');
  assert.equal(activities.querySelector('a').href,'../../synthetic/');
  assert.doesNotMatch(courses.textContent+activities.textContent,/舊課程|舊活動/);
});

// 執行實際首頁 inline script、雲端控制器與健檢；Firebase 完全以記憶體替代。
function home(){
  const state={initFail:false,fail:false,empty:false,hold:null},queries=[];
  let changed=()=>{},sessions=0;
  const auth={currentUser:null,onAuthStateChanged(fn){changed=fn;fn(this.currentUser);},
    async signInWithPopup(){this.currentUser={uid:'synthetic-owner',isAnonymous:false};changed(this.currentUser);}};
  const stamp={toMillis:()=>Date.UTC(2026,10,5)};
  const docs={guestAttempts:[],roster:[{id:'synthetic@example.invalid',data:()=>({cls:999,seat:1})}],
    attempts:[{id:'synthetic_1_0',data:()=>({uid:'synthetic',email:'synthetic@example.invalid',activity:1,round:0,level:1,tries:2,passedAt:stamp})}]};
  const db={doc:path=>({get:async()=>{queries.push(path);return {exists:true,data:()=>({ownerUid:'synthetic-owner'})};}}),
    collection:path=>({get:async()=>{queries.push(path);if(state.hold)await state.hold;if(state.fail)throw Error('synthetic unavailable');return {docs:state.empty?[]:docs[path.split('/').at(-1)]};}})};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{};}
  const h=teacher({cloud:{ybs:{firebaseSession:async()=>{sessions++;if(state.initFail)throw Error('synthetic SDK failure');return {auth,db};}},firebase:{auth:{GoogleAuthProvider}}}});
  return {...h,state,queries,sessions:()=>sessions,login:()=>h.get('cloud-login').onclick(),read:()=>h.get('cloud-read').onclick()};
}
test('首頁初始化載入失敗可重新登入，成功後恢復讀取且清除錯誤訊息',async()=>{
  const h=home();h.state.initFail=true;await h.login();
  assert.equal(h.get('cloud-status').textContent,'雲端讀取失敗，請確認網路後重試。');
  assert.equal(h.get('cloud-login').disabled,false);
  assert.equal(h.get('cloud-read').disabled,true);
  assert.equal(h.get('cloud-export').disabled,true);
  assert.equal(h.queries.length,0);
  h.state.initFail=false;await h.login();
  assert.equal(h.sessions(),2);
  assert.equal(h.get('cloud-status').textContent,'教師已登入，請讀取雲端紀錄。');
  assert.equal(h.get('cloud-read').disabled,false);
  await h.read();assert.match(h.get('cloud-status').textContent,/^已讀取 1 列；略過 0 筆/);
  assert.equal(h.get('cloud-export').disabled,false);
});
test('首頁成功顯示資料後直接延遲重讀，等待期間立即清除舊表格與健檢',async()=>{
  const h=home();await h.login();await h.read();
  for(const id of ['cloud-class','health-class']){h.get(id).value='999';h.get(id).onchange();}
  for(const id of ['cloud-table','health-table'])assert.ok(h.get(id).querySelectorAll('tbody tr').length>0,id);
  assert.equal(h.get('cloud-export').disabled,false);
  assert.match(h.get('health-status').textContent,/999 班：名冊 1 人/);
  let release;h.state.hold=new Promise(resolve=>release=resolve);
  const pending=h.read();
  try {
    assert.equal(h.get('cloud-status').textContent,'讀取帳號與班座紀錄中…');
    for(const id of ['cloud-table','health-table'])assert.equal(h.get(id).textContent,'',id);
    for(const id of ['cloud-class','health-class'])assert.equal(h.get(id).value,'',id);
    for(const id of ['cloud-login','cloud-read','cloud-export','cloud-class','health-class'])assert.equal(h.get(id).disabled,true,id);
    assert.equal(h.get('health-status').textContent,'請先登入並讀取雲端紀錄。');
    await new Promise(resolve=>setImmediate(resolve)); // 確認查詢已進入受控等待點。
    assert.equal(h.get('cloud-status').textContent,'讀取帳號與班座紀錄中…');
  } finally { release();await pending;h.state.hold=null; }
  assert.match(h.get('cloud-status').textContent,/^已讀取 1 列；略過 0 筆/);
  assert.equal(h.get('cloud-export').disabled,false);
  assert.match(h.get('health-status').textContent,/全部班級：名冊 1 人/);
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);
});
test('首頁已有資料後讀取失敗，重試期間停用操作；空結果與再次成功皆重建狀態',async()=>{
  const h=home();await h.login();await h.read();
  for(const id of ['cloud-class','health-class']){h.get(id).value='999';h.get(id).onchange();}
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);
  assert.match(h.get('health-status').textContent,/999 班：名冊 1 人/);
  h.state.fail=true;await h.read();
  assert.match(h.get('cloud-status').textContent,/讀取失敗/);
  assert.equal(h.get('cloud-read').disabled,false);
  for(const id of ['cloud-table','health-table'])assert.equal(h.get(id).textContent,'');
  for(const id of ['cloud-class','health-class']){assert.equal(h.get(id).disabled,true);assert.equal(h.get(id).value,'');}
  assert.equal(h.get('cloud-export').disabled,true);
  assert.equal(h.get('health-status').textContent,'請先登入並讀取雲端紀錄。');

  h.state.fail=false;h.state.empty=true;
  let release;h.state.hold=new Promise(resolve=>release=resolve);
  const pending=h.read();
  assert.equal(h.get('cloud-status').textContent,'讀取帳號與班座紀錄中…');
  for(const id of ['cloud-login','cloud-read','cloud-export','cloud-class','health-class'])assert.equal(h.get(id).disabled,true,id);
  await new Promise(resolve=>setImmediate(resolve)); // 讓 VM 查詢進入受控等待點，無需計時延遲。
  const count=h.queries.length;await h.read();assert.equal(h.queries.length,count,'忙碌時不重複查詢');
  release();await pending;h.state.hold=null;
  assert.match(h.get('cloud-status').textContent,/^已讀取 0 列；略過 0 筆/);
  assert.equal(h.get('cloud-table').textContent,'');
  assert.equal(h.get('cloud-export').disabled,true);
  assert.equal(h.get('cloud-class').querySelectorAll('option').length,1);
  assert.equal(h.get('health-class').querySelectorAll('option').length,1);
  assert.match(h.get('health-status').textContent,/全部班級：名冊 0 人。無名冊學生/);
  for(const id of ['cloud-login','cloud-read','cloud-class','health-class'])assert.equal(h.get(id).disabled,false,id);

  h.state.empty=false;await h.read();
  assert.match(h.get('cloud-status').textContent,/^已讀取 1 列；略過 0 筆/);
  assert.equal(h.get('cloud-export').disabled,false);
  for(const id of ['cloud-class','health-class']){assert.equal(h.get(id).value,'');assert.equal(h.get(id).querySelectorAll('option').length,2);}
  h.get('cloud-class').value='999';h.get('cloud-class').onchange();
  assert.equal(h.get('cloud-table').querySelectorAll('tbody tr').length,1);
  assert.match(h.get('health-status').textContent,/全部班級：名冊 1 人/);
});
