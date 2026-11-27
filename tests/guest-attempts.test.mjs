import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setup,packet,error,settle,key} from './fixtures/guest-firebase.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));

// 分頁各有 VM、Auth 與 sessionStorage；只共用 localStorage 及合成的 Web Locks。
function guestTabs(write) {
  const source=readFileSync(new URL('../assets/login.js',import.meta.url),'utf8');
  const stored=new Map(),tails=new Map(),requests=[];
  let locksRejected=false;
  const locks={request(name,callback){
    requests.push(name);
    if(locksRejected)return Promise.reject(error('synthetic-lock-rejected'));
    const next=(tails.get(name)||Promise.resolve()).catch(()=>{}).then(callback);
    tails.set(name,next);return next;
  }};
  return {stored,requests,rejectLocks(value){locksRejected=value;},
    queue:()=>JSON.parse(stored.get(key)).queue,tab(uid='shared-guest',{storageWriteFails=false}={}){
    const storage=(map,shared=false)=>({getItem:k=>map.get(k)??null,setItem(k,v){
      if(shared&&storageWriteFails&&k===key)throw Error('synthetic storage write failure');
      map.set(k,v);
    },removeItem:k=>map.delete(k)});
    const calls=[],reads=[],statuses=[];
    const auth={currentUser:{uid,isAnonymous:true},setPersistence:async()=>{},signOut:async()=>{auth.currentUser=null;}};
    const session=new Map([['ybslab:guest-identity',JSON.stringify({cls:'999',seat:1,uid})]]);
    const app={name:'ybs',auth:()=>auth,firestore:()=>({doc(path){return{
      async set(data){calls.push({path,data,uid:auth.currentUser?.uid});await write(data,path);},
      async get(){reads.push(path);throw error('permission-denied');}
    };}})};
    const context=vm.createContext({YBS_FULLREV_CONFIG:{enabled:false},location:{pathname:'/115-g9/u1-05/'},
      navigator:{onLine:true,locks},localStorage:storage(stored,true),sessionStorage:storage(session),
      console:{warn(){}},setInterval(){},queueMicrotask,window:{addEventListener(){}},
      document:{cookie:'',querySelector:()=>null,createElement:()=>({}),head:{appendChild:s=>queueMicrotask(()=>s.onload())}},
      firebase:{apps:[app],auth:{Auth:{Persistence:{SESSION:'session'}}},firestore:{FieldValue:{serverTimestamp:()=> 'SERVER_TIMESTAMP'}}}});
    vm.runInContext(source+'\nglobalThis.api=YBS;',context,{filename:'assets/login.js'});
    context.api.status(s=>statuses.push(s));
    return {api:context.api,auth,calls,reads,statuses,blockGuestWrites(value){storageWriteFails=value;}};
  }};
}

test('Rules 白名單、型別、serverTimestamp 與固定 docId；不讀任何文件',async()=>{
  const h=setup();await h.api.submit(packet({email:'excluded',uid:'excluded',answer:'excluded',verified:true}));
  assert.equal(h.calls[0].path,'ybsCourses/115-g9/guestAttempts/guest1_1_0');
  assert.deepEqual(plain(h.calls[0].data),{activity:1,round:0,level:1,tries:2,cls:'999',seat:1,verified:false,app:'ybs',passedAt:'SERVER_TIMESTAMP',termWeek:7});
  assert.deepEqual(h.reads,[]);assert.deepEqual(h.queue(),[]);assert.equal(h.statuses.at(-1),'ok');
});
test('Rules 上下限與選填 termWeek',async()=>{
  const h=setup();await h.api.submit(packet({cls:'100',seat:60,activity:31,round:5,level:2,tries:999,termWeek:30}));
  assert.equal(h.calls[0].path,'ybsCourses/115-g9/guestAttempts/guest1_31_5');
  await h.api.submit(packet({cls:100,seat:60,termWeek:0}));
  assert.ok(!('termWeek' in h.calls[1].data));
});
test('班級數字與中文等級正規化；全形數字不自動轉成有效過關',async t=>{
  t.mock.method(Date,'now',()=>Date.UTC(2026,10,5));
  const h=setup();
  await h.api.submit(packet({level:'基礎'}));
  await h.api.submit(packet({cls:'999',round:1,level:'進階'}));
  assert.deepEqual(h.calls.map(x=>[x.data.cls,x.data.seat,x.data.level]),[['999',1,1],['999',1,2]]);
  for(const extra of [{cls:'９９９'},{seat:'１'},{activity:'１'},{round:'０'},{level:'１'},{tries:'２'},{termWeek:'７'}]){
    const invalid=setup();await invalid.api.submit(packet(extra));
    assert.equal(invalid.calls.length,0,JSON.stringify(extra));
    assert.deepEqual(invalid.queue(),[]);assert.deepEqual(invalid.authCalls,[]);
    assert.deepEqual(invalid.warnings,[['[YBS guestAttempts]','invalid-attempt']]);
  }
});
test('缺少必填欄位或錯型別不入待送；省略 termWeek 仍可上傳',async t=>{
  t.mock.method(Date,'now',()=>Date.UTC(2026,10,5));
  for(const field of ['cls','seat','activity','round','level','tries']){
    const missing=packet();delete missing[field];
    // 字串數值也不能代替關卡等整數欄位；班級另允許數字及字串。
    const values=field==='cls'?[null,false,{},[]]:[null,false,{},[],String(packet()[field])];
    for(const item of [missing,...values.map(value=>packet({[field]:value}))]){
      const h=setup();await h.api.submit(item);
      assert.equal(h.calls.length,0,field+': '+JSON.stringify(item));
      assert.deepEqual(h.queue(),[]);assert.deepEqual(h.authCalls,[]);
      assert.deepEqual(h.warnings,[['[YBS guestAttempts]','invalid-attempt']]);
    }
  }
  const h=setup(), item=packet();delete item.termWeek;await h.api.submit(item);
  assert.equal(h.calls.length,1);assert.ok(!('termWeek' in h.calls[0].data));
});
test('termWeek 錯型別依既有行為拒絕或省略，不轉成有效週次',async t=>{
  t.mock.method(Date,'now',()=>Date.UTC(2026,10,5));
  for(const termWeek of ['7','0',true,{},[],[7]]){
    const h=setup();await h.api.submit(packet({termWeek}));
    assert.equal(h.calls.length,0,JSON.stringify(termWeek));
    assert.deepEqual(h.queue(),[]);assert.deepEqual(h.authCalls,[]);
    assert.deepEqual(h.warnings,[['[YBS guestAttempts]','invalid-attempt']]);
  }
  // 選填欄位的假值沿用省略行為，不視為有效週次。
  for(const termWeek of [undefined,null,false,'',NaN]){
    const h=setup();await h.api.submit(packet({termWeek}));
    assert.equal(h.calls.length,1);assert.ok(!('termWeek' in h.calls[0].data));
    assert.deepEqual(h.queue(),[]);assert.deepEqual(h.warnings,[]);
    assert.equal(h.state().receipts.length,1);
  }
});
test('正規化後的重複班座同關保留首筆內容，未知活動不污染待送',async t=>{
  t.mock.method(Date,'now',()=>Date.UTC(2026,10,5));
  const h=setup({authFailure:'auth/network-request-failed'});
  await h.api.submit(packet({level:'基礎'}));
  await h.api.submit(packet({cls:'999',level:'進階',tries:9,termWeek:8}));
  const expected={cls:'999',seat:1,activity:1,round:0,level:1,tries:2,termWeek:7};
  assert.deepEqual(h.queue(),[expected]);
  await h.api.submit(packet({activity:'unknown'}));
  assert.deepEqual(h.queue(),[expected]);assert.equal(h.calls.length,0);
  assert.deepEqual(h.warnings.at(-1),['[YBS guestAttempts]','invalid-attempt']);
  h.failLogin(null);h.advance();await h.api.flushGuest();
  assert.equal(h.calls.length,1);
  assert.deepEqual(plain(h.calls[0].data),{...expected,verified:false,app:'ybs',passedAt:'SERVER_TIMESTAMP'});
  assert.deepEqual(h.queue(),[]);assert.equal(h.state().receipts.length,1);
});
for(const extra of [{activity:0},{activity:32},{activity:1.5},{round:-1},{round:6},{level:0},{level:3},{tries:0},{tries:1000},{tries:1.5},{cls:'099'},{cls:'<x>'},{seat:0},{seat:61},{seat:'1'},{termWeek:31},{termWeek:-1}]){
  test('拒絕超出 Rules 範圍 '+JSON.stringify(extra),async()=>{
    const h=setup();await h.api.submit(packet(extra));assert.equal(h.calls.length,0);assert.equal(h.queue().length,0);
  });
}
test('寫入失敗保留 localStorage，online 重送成功才移除',async()=>{
  let fail=true;const h=setup({write:async()=>{if(fail)throw error('unavailable');}});
  await h.api.submit(packet());assert.equal(h.queue().length,1);assert.equal(h.statuses.at(-1),'guest-pending');
  fail=false;h.advance();await h.online();assert.equal(h.calls.length,2);assert.equal(h.queue().length,0);assert.equal(h.state().receipts.length,1);
});
test('下次開頁自動重送，同班座保留 session 匿名 UID',async()=>{
  const h=setup({write:async()=>{throw error('unavailable');}});await h.api.submit(packet());
  const next=setup({stored:h.stored,session:h.session,user:h.auth.currentUser});await settle();
  assert.equal(next.calls.length,1);assert.deepEqual(next.authCalls,[]);assert.equal(next.queue().length,0);
});
test('下次過關重送舊項目，失敗項目不阻擋後續關卡',async()=>{
  let fail=true;const h=setup({write:async d=>{if(fail&&d.round===0)throw error('unavailable');}});
  await h.api.submit(packet());fail=false;h.advance();await h.api.submit(packet({round:1}));
  assert.deepEqual(h.calls.map(x=>x.data.round),[0,0,1]);assert.equal(h.queue().length,0);
});
test('匿名登入失敗也先保存；online 可重送',async()=>{
  const h=setup({authFailure:'auth/network-request-failed'});await h.api.submit(packet());
  assert.equal(h.queue().length,1);assert.equal(h.calls.length,0);assert.equal(h.statuses.at(-1),'guest-pending');
  h.failLogin(null);h.advance();await h.online();assert.equal(h.calls.length,1);assert.equal(h.queue().length,0);
});
test('同班座不重登；換班或座號先 signOut 再匿名登入',async()=>{
  const h=setup();await h.api.guest({cls:999,seat:1});await h.api.guest({cls:'999',seat:1});
  assert.deepEqual(h.authCalls,['anonymous']);
  await h.api.guest({cls:999,seat:2});await h.api.submit(packet({seat:2}));
  await h.api.guest({cls:998,seat:2});await h.api.submit(packet({cls:998,seat:2}));
  assert.deepEqual(h.authCalls,['anonymous','signOut','anonymous','signOut','anonymous']);
  assert.deepEqual(h.calls.map(x=>[x.uid,x.data.cls,x.data.seat]),[['guest2','999',2],['guest3','998',2]]);
});
test('缺少身分綁定時不沿用來路不明匿名 UID',async()=>{
  const h=setup({user:{uid:'old',isAnonymous:true}});await h.api.submit(packet());
  assert.deepEqual(h.authCalls,['signOut','anonymous']);
});
test('同班座重新整理且沒有待送項目，也不重登',async()=>{
  const h=setup();await h.api.guest({cls:999,seat:1});
  const next=setup({stored:h.stored,session:h.session,user:h.auth.currentUser});await next.api.guest({cls:999,seat:1});
  assert.deepEqual(next.authCalls,[]);assert.equal(next.auth.currentUser.uid,'guest1');
});
test('signOut 失敗不能用舊 UID 寫新班座；恢復後才重試',async()=>{
  const h=setup();await h.api.guest({cls:999,seat:1});const signOut=h.auth.signOut;
  h.auth.signOut=async()=>{throw error('auth/network-request-failed');};
  await h.api.submit(packet({seat:2}));assert.equal(h.calls.length,0);assert.equal(h.queue().length,1);
  h.auth.signOut=signOut;h.advance();await h.api.flushGuest();assert.equal(h.calls[0].uid,'guest2');assert.equal(h.calls[0].data.seat,2);
});
test('送出等待中換班座：新 UID 不會寫前一位資料，也不遺失待送',async()=>{
  let release;const gate=new Promise(r=>release=r);let first=true;
  const h=setup({write:async()=>{if(first){first=false;await gate;}}});
  const writing=h.api.submit(packet());await settle();await h.api.guest({cls:999,seat:2});await h.api.submit(packet({seat:2}));
  release();await writing;await settle();
  assert.deepEqual(h.calls.map(x=>[x.uid,x.data.seat]),[['guest1',1],['guest2',2]]);assert.equal(h.queue().length,0);
});
test('Google／password 仍走 attempts，不匿名登入',async()=>{
  const h=setup();await h.account();await h.api.submit(packet());
  assert.equal(h.calls[0].path,'ybsCourses/115-g9/attempts/google1_1_0');assert.deepEqual(h.authCalls,[]);
});
test('還原的非匿名登入不被背景取代，班座待送保留',async()=>{
  const h=setup({user:{uid:'real',isAnonymous:false}});await h.api.submit(packet());
  assert.equal(h.calls.length,0);assert.deepEqual(h.authCalls,[]);assert.equal(h.queue().length,1);
});
test('明確改用手動班座時，可先登出還原的舊帳號再匿名登入',async()=>{
  const h=setup({user:{uid:'oldAccount',isAnonymous:false}});await h.api.guest({cls:999,seat:1});await h.api.submit(packet());
  assert.deepEqual(h.authCalls,['signOut','anonymous']);assert.equal(h.calls[0].uid,'guest1');
});
test('無成功證據的 permission-denied 保留，不嘗試匿名 get',async()=>{
  const h=setup({write:async()=>{throw error('permission-denied');}});await h.api.submit(packet());
  assert.equal(h.queue().length,1);assert.equal(h.statuses.at(-1),'guest-pending');assert.deepEqual(h.reads,[]);
});
test('明確 already-exists 可移除；成功後同身分重做不再寫入',async()=>{
  const h=setup({write:async()=>{throw error('already-exists');}});await h.api.submit(packet());
  assert.equal(h.queue().length,0);await h.api.submit(packet({tries:3}));
  assert.equal(h.calls.length,1);assert.equal(h.queue().length,0);
});
test('成功證據必須連課程、班座、UID、活動及關卡都相同',async()=>{
  for(const index of [0,1,2,3,4,5]){
    const proof=['115-g9','999',1,'guest1',1,0];proof[index]=index===2||index===4||index===5?2:'different';
    const stored=new Map([[key,JSON.stringify({queue:[],receipts:[JSON.stringify(proof)]})]]);
    const h=setup({stored,write:async()=>{throw error('permission-denied');}});await h.api.submit(packet());
    assert.equal(h.calls.length,1);assert.equal(h.queue().length,1);
  }
});
test('寫入等待期間加新關卡；同關去重且成功才移除',async()=>{
  let release;const waiting=new Promise(r=>release=r);
  const h=setup({write:async d=>{if(d.round===0)await waiting;}});
  const first=h.api.submit(packet());await settle();await h.api.submit(packet({round:1}));await h.api.submit(packet({tries:9}));
  assert.equal(h.queue().length,2);release();await first;await settle();
  assert.deepEqual(h.calls.map(x=>x.data.round),[0,1]);assert.equal(h.queue().length,0);
});
for(const rejected of [false,true])test(`既有同關重複項目只留最早待送；成功才清除（寫入失敗=${rejected}）`,async()=>{
  const first=packet({cls:'999'}),other=packet({cls:'998',seat:2});
  const stored=new Map([[key,JSON.stringify({queue:[first,packet({cls:'999',tries:9}),
    packet({cls:'999',uid:'old-guest',tries:8}),other,packet({cls:'999',round:1})],receipts:[]})]]);
  const h=setup({stored,write:async d=>{if(rejected&&d.round===0)throw error('unavailable');}});
  await h.api.guest({cls:999,seat:1});await settle();
  assert.deepEqual(h.calls.map(x=>[x.data.round,x.data.tries]),[[0,2],[1,2]]);
  assert.deepEqual(h.queue().filter(x=>x.cls==='998'),[other]);
  assert.equal(h.queue().filter(x=>x.cls==='999').length,rejected?1:0);
  assert.equal(h.state().receipts.length,rejected?1:2);
  if(rejected){
    h.advance();await h.api.flushGuest();
    assert.deepEqual(h.calls.map(x=>[x.data.round,x.data.tries]),[[0,2],[1,2],[0,2]]);
  }
});
for(const uid of ['shared-guest','another-guest'])test(`兩分頁同時重送同一筆待送只寫一次（第二分頁 UID=${uid}）`,async()=>{
  let release;const gate=new Promise(r=>release=r);
  const tabs=guestTabs(()=>gate),first=tabs.tab();
  const sending=first.api.submit(packet());await settle();
  const second=tabs.tab(uid);await settle();
  // 兩分頁同時遇到重試與同關重做，仍應共用該筆待送的鎖。
  await second.api.submit(packet({tries:9}));await second.api.retry();await settle();
  const during=first.calls.length+second.calls.length;
  release();await sending;await settle();
  assert.equal(during,1,'前一筆尚未完成時不得再次寫入');
  assert.equal(first.calls.length+second.calls.length,1,'取得鎖後須重讀佇列與成功證據');
  assert.deepEqual(tabs.queue(),[]);assert.equal(JSON.parse(tabs.stored.get(key)).receipts.length,1);
  assert.deepEqual([...first.reads,...second.reads],[],'匿名上傳仍不讀雲端文件');
  assert.ok(tabs.requests.length>=2,'使用共用 Web Locks 排隊');
  assert.equal(second.statuses.at(-1),'ok');
});
test('Web Locks 請求拒絕仍保留待送並退避，忙碌狀態復原後可手動重試',async()=>{
  const tabs=guestTabs(async()=>{}),h=tabs.tab();tabs.rejectLocks(true);
  await h.api.submit(packet());
  assert.equal(h.calls.length,0);assert.equal(tabs.requests.length,1);
  assert.deepEqual(tabs.queue(),[packet({cls:'999'})]);
  assert.deepEqual(JSON.parse(tabs.stored.get(key)).receipts,[]);
  assert.equal(h.api.hasPending(),true);assert.equal(h.statuses.at(-1),'guest-pending');
  await h.api.flushGuest();assert.equal(tabs.requests.length,1,'背景觸發仍須遵守退避');
  tabs.rejectLocks(false);await h.api.retry();
  assert.equal(tabs.requests.length,2);assert.equal(h.calls.length,1);
  assert.deepEqual(h.statuses,['sending','guest-pending','guest-pending','sending','ok']);
  assert.deepEqual(tabs.queue(),[]);assert.equal(JSON.parse(tabs.stored.get(key)).receipts.length,1);
  assert.equal(h.api.hasPending(),false);assert.deepEqual(h.reads,[]);
});
for(const rejected of [false,true])test(`Web Locks 仍互斥，但儲存寫入失敗無法跨分頁去重（雲端失敗=${rejected}）`,async()=>{
  let release,fail=rejected,active=0,maxActive=0;const gate=new Promise(r=>release=r);
  const tabs=guestTabs(async()=>{
    active++;maxActive=Math.max(maxActive,active);
    try {await gate;if(fail)throw error('unavailable');}finally{active--;}
  });
  const pending=packet({cls:'999'});
  tabs.stored.set(key,JSON.stringify({queue:[pending],receipts:[]}));
  const first=tabs.tab('shared-guest',{storageWriteFails:true});await settle();
  const second=tabs.tab('another-guest',{storageWriteFails:true});await settle();
  assert.equal(first.calls.length,1);assert.equal(second.calls.length,0);
  assert.equal(tabs.requests.length,2,'第二分頁已排隊等鎖');
  release();await settle();
  assert.equal(maxActive,1,'Web Locks 仍避免同時寫入');
  assert.equal(first.calls.length+second.calls.length,2,'無法共享佇列清理與成功證據，可能依序重寫');
  assert.deepEqual(tabs.queue(),[pending],'持久佇列無法更新，仍保留原待送');
  assert.deepEqual(JSON.parse(tabs.stored.get(key)).receipts,[]);
  for(const h of [first,second]){
    assert.equal(h.api.hasPending(),rejected);
    assert.equal(h.statuses.at(-1),rejected?'guest-storage':'ok');
    assert.deepEqual(h.reads,[]);
  }
  if(rejected){
    fail=false;
    for(const h of [first,second]){
      h.blockGuestWrites(false);await h.api.retry();
      assert.equal(h.calls.length,2,'儲存恢復後記憶體待送仍可重試');
      assert.equal(h.api.hasPending(),false);assert.equal(h.statuses.at(-1),'ok');
    }
    assert.deepEqual(tabs.queue(),[]);
  }
});
for(const cancel of ['logout','auth-change'])test(`等待跨分頁鎖時身分失效，不送出舊紀錄（${cancel}）`,async()=>{
  let release;const gate=new Promise(r=>release=r);
  const tabs=guestTabs(async()=>{await gate;throw error('unavailable');}),first=tabs.tab();
  const sending=first.api.submit(packet());await settle();
  const second=tabs.tab();await settle();
  if(cancel==='logout')await second.api.logout({keepAnonymous:true});
  else second.auth.currentUser={uid:'replacement-account',isAnonymous:false};
  release();await sending;await settle();
  assert.equal(second.calls.length,0);assert.equal(tabs.queue().length,1);
  assert.equal(JSON.parse(tabs.stored.get(key)).receipts.length,0);
});
test('取得跨分頁鎖後使用最新待送快照，失敗不清掉途中新增的紀錄',async()=>{
  let release;const gate=new Promise(r=>release=r);let fail=true;
  const tabs=guestTabs(async()=>{if(fail){await gate;fail=false;throw error('unavailable');}}),first=tabs.tab();
  const sending=first.api.submit(packet());await settle();
  const second=tabs.tab();await settle();
  const other=packet({cls:'998',seat:2});
  tabs.stored.set(key,JSON.stringify({queue:[packet({cls:'999',tries:9}),other],receipts:[]}));
  release();await sending;await settle();
  assert.deepEqual(second.calls.map(x=>x.data.tries),[9]);
  assert.deepEqual(tabs.queue(),[other]);assert.equal(JSON.parse(tabs.stored.get(key)).receipts.length,1);
});
for(const rejected of [false,true])test(`同頁並行重送只處理同一待送一次，失敗仍遵守退避（寫入失敗=${rejected}）`,async()=>{
  let release,fail=rejected,active=0,peak=0;const gate=new Promise(r=>release=r);
  const h=setup({write:async()=>{
    active++;peak=Math.max(peak,active);
    try{await gate;if(fail)throw error('unavailable');}finally{active--;}
  }});
  const first=h.api.submit(packet());await settle();
  try{
    assert.equal(h.calls.length,1);
    await Promise.all([h.api.flushGuest(),h.online(),h.api.retry(),h.api.submit(packet({tries:9})),
      ...h.timers.map(t=>t.fn())]);
    assert.equal(h.calls.length,1,'寫入未完成前不可重送同一筆');
    assert.equal(h.queue().length,1);assert.equal(h.queue()[0].tries,2);
    assert.equal(h.state().receipts.length,0);
  }finally{release();await first;await settle();}
  assert.equal(peak,1);assert.equal(h.calls.length,1,'合併的重送請求不可再送已處理項目');
  assert.equal(h.queue().length,rejected?1:0);assert.equal(h.state().receipts.length,rejected?0:1);
  assert.equal(h.statuses.at(-1),rejected?'guest-pending':'ok');
  assert.equal(h.statuses.filter(s=>s==='sending').length,1);
  if(rejected){
    fail=false;h.advance(59999);await h.online();assert.equal(h.calls.length,1);
    h.advance(1);await Promise.all([h.api.flushGuest(),h.online(),h.api.flushGuest()]);await settle();
    assert.equal(peak,1);assert.equal(h.calls.length,2);assert.equal(h.queue().length,0);
    assert.equal(h.state().receipts.length,1);assert.equal(h.statuses.at(-1),'ok');
  }
  assert.deepEqual(h.authCalls,['anonymous']);
});
for(const rejected of [false,true])test(`匿名登入等待期間的並行重送不重複登入或寫入，失敗遵守退避（登入失敗=${rejected}）`,async()=>{
  let release,fail=rejected;const gate=new Promise(r=>release=r);
  const h=setup({anonymousLogin:async()=>{await gate;if(fail)throw error('auth/network-request-failed');}});
  const first=h.api.submit(packet());await settle();
  try{
    assert.deepEqual(h.authCalls,['anonymous']);assert.equal(h.calls.length,0);
    await Promise.all([h.api.flushGuest(),h.online(),h.api.retry(),h.api.submit(packet({tries:9})),
      ...h.timers.map(t=>t.fn())]);
    assert.deepEqual(h.authCalls,['anonymous'],'登入尚未完成時不可再排匿名登入');
    assert.equal(h.calls.length,0);assert.deepEqual(h.queue(),[packet({cls:'999'})]);
    assert.equal(h.state().receipts.length,0);
  }finally{release();await first;await settle();}
  assert.deepEqual(h.authCalls,['anonymous'],'合併的重送請求不可追加匿名登入');
  assert.equal(h.calls.length,rejected?0:1);assert.equal(h.queue().length,rejected?1:0);
  assert.equal(h.state().receipts.length,rejected?0:1);
  assert.equal(h.statuses.filter(s=>s==='sending').length,1);
  assert.equal(h.statuses.at(-1),rejected?'guest-pending':'ok');
  if(rejected){
    fail=false;h.advance(59999);
    await Promise.all([h.api.flushGuest(),h.online(),...h.timers.map(t=>t.fn())]);
    assert.deepEqual(h.authCalls,['anonymous']);assert.equal(h.calls.length,0);
    assert.deepEqual(h.queue(),[packet({cls:'999'})]);
    h.advance(1);await Promise.all([h.api.flushGuest(),h.online(),h.api.flushGuest()]);await settle();
    assert.deepEqual(h.authCalls,['anonymous','anonymous']);assert.equal(h.calls.length,1);
    assert.equal(h.queue().length,0);assert.equal(h.state().receipts.length,1);
    assert.equal(h.statuses.at(-1),'ok');
  }
  assert.equal(h.calls[0].data.tries,2);
});
for(const failure of ['無','部分','全部'])test(`同頁並行重送不追加批次，單輪仍只送十筆（寫入失敗=${failure}）`,async()=>{
  let release,fail=true;const gate=new Promise(r=>release=r);
  const rejects=activity=>failure==='全部'||(failure==='部分'&&activity%2===0);
  const queue=Array.from({length:24},(_,i)=>packet({cls:'999',activity:i+1}));
  const failedActivities=queue.slice(0,10).filter(x=>rejects(x.activity)).map(x=>x.activity);
  const stored=new Map([[key,JSON.stringify({queue,receipts:[]})]]);
  const h=setup({stored,write:async d=>{await gate;if(fail&&rejects(d.activity))throw error('unavailable');}});
  const first=h.api.guest({cls:999,seat:1});await settle();
  try{
    assert.equal(h.calls.length,1);
    await Promise.all([h.api.flushGuest(),h.online(),h.api.retry(),...h.timers.map(t=>t.fn())]);
    assert.equal(h.calls.length,1);
  }finally{release();await first;await settle();}
  assert.deepEqual(h.calls.map(x=>x.data.activity),[1,2,3,4,5,6,7,8,9,10]);
  assert.deepEqual(h.queue().map(x=>x.activity),[...queue.slice(10).map(x=>x.activity),...failedActivities]);
  assert.equal(h.state().receipts.length,10-failedActivities.length);
  assert.equal(h.statuses.filter(s=>s==='sending').length,1);assert.equal(h.statuses.at(-1),'guest-pending');
  if(failedActivities.length){
    await h.online();h.advance(59999);
    await Promise.all([h.api.flushGuest(),h.online(),...h.timers.map(t=>t.fn())]);
    assert.equal(h.calls.length,10,'部分或全部失敗都須遵守一分鐘退避');
    assert.equal(h.statuses.filter(s=>s==='sending').length,1);
    fail=false;h.advance(1);await Promise.all([h.api.flushGuest(),h.online(),h.api.flushGuest()]);await settle();
    assert.equal(h.calls.length,20,'退避結束後單輪仍只送十筆');
    assert.deepEqual(h.calls.slice(10).map(x=>x.data.activity),[11,12,13,14,15,16,17,18,19,20]);
    assert.deepEqual(h.queue().map(x=>x.activity),[21,22,23,24,...failedActivities]);
    assert.equal(h.state().receipts.length,20-failedActivities.length);
    assert.equal(h.statuses.at(-1),'guest-pending');
  }
  assert.deepEqual(h.authCalls,['anonymous']);
});
test('舊班座寫入遲到失敗不覆寫新班座狀態或退避，也不重複排程',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const h=setup({write:async d=>{if(d.seat===1){await gate;throw error('unavailable');}}});
  const first=h.api.submit(packet());await settle();
  try{
    await h.api.guest({cls:999,seat:2});await h.api.submit(packet({seat:2}));
    await Promise.all([h.api.flushGuest(),h.online(),h.api.retry()]);
    assert.equal(h.calls.length,1);assert.equal(h.queue().length,2);
  }finally{release();await first;await settle();}
  assert.deepEqual(h.calls.map(x=>[x.uid,x.data.seat]),[['guest1',1],['guest2',2]]);
  assert.deepEqual(h.queue().map(x=>[x.uid,x.seat]),[['guest1',1]]);
  assert.deepEqual(h.statuses,['sending','sending','ok']);assert.equal(h.state().receipts.length,1);
  await h.api.submit(packet({seat:2,round:1}));
  assert.deepEqual(h.calls.map(x=>[x.uid,x.data.seat,x.data.round]),[['guest1',1,0],['guest2',2,0],['guest2',2,1]]);
  assert.equal(h.queue().length,1);assert.equal(h.statuses.at(-1),'ok');
});
test('localStorage 不可用仍可作答上傳；失敗留記憶體重試',async()=>{
  let fail=true;const h=setup({storageFails:true,write:async()=>{if(fail)throw error('unavailable');}});
  await h.api.submit(packet());fail=false;h.blockStorage(false);h.advance();await h.api.flushGuest();
  assert.equal(h.calls.length,2);assert.equal(h.statuses.at(-1),'ok');
});
test('教師頁開啟及定時器不啟動背景匿名登入',async()=>{
  const stored=new Map([[key,JSON.stringify({queue:[packet({cls:'999'})],receipts:[]})]]);
  const h=setup({stored,pathname:'/115-g9/teacher/'});await settle();for(const t of h.timers)await t.fn();await h.online();
  assert.deepEqual(h.authCalls,[]);assert.equal(h.calls.length,0);
});
test('兩班座持續被拒：背景只重送目前班座，退避期間不寫入、不增加 UID',async()=>{
  const h=setup({write:async()=>{throw error('permission-denied');}});
  await h.api.guest({cls:999,seat:1});await h.api.submit(packet());
  await h.api.guest({cls:999,seat:2});await h.api.submit(packet({seat:2}));
  const initial=h.calls.length;
  for(let i=0;i<3;i++){await h.online();await h.api.flushGuest();}
  assert.equal(h.calls.length,initial,'失敗後立即觸發 online／flush 也須退避');
  h.advance();await h.online();assert.equal(h.calls.length,initial+1);
  h.advance();await h.online();assert.equal(h.calls.length,initial+1,'第二次失敗至少退避兩分鐘');
  h.advance();await h.online();assert.equal(h.calls.length,initial+2);
  assert.equal(h.authCalls.filter(x=>x==='anonymous').length,2);
  assert.equal(h.authCalls.filter(x=>x==='signOut').length,1);
  assert.ok(h.calls.slice(1).every(x=>x.data.seat===2));assert.equal(h.queue().length,2);
  const next=setup({stored:h.stored,session:h.session,user:h.auth.currentUser,write:async()=>{throw error('permission-denied');}});await settle();
  assert.deepEqual(next.authCalls,[]);assert.ok(next.calls.every(x=>x.data.seat===2));
  await next.api.guest({cls:999,seat:1});assert.equal(next.calls.at(-1).data.seat,1);
});
test('沒有目前班座的開頁重送不從待送猜身分、不建立 UID',async()=>{
  const stored=new Map([[key,JSON.stringify({queue:[packet({cls:'999'}),packet({cls:'999',seat:2})],receipts:[]})]]);
  const h=setup({stored});await settle();await h.online();
  assert.deepEqual(h.authCalls,[]);assert.equal(h.calls.length,0);assert.equal(h.queue().length,2);
});
test('匿名登入等待中改用帳號：作廢遲到匿名身分，帳號過關只寫 attempts',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const h=setup({anonymousLogin:()=>gate});const guest=h.api.guest({cls:999,seat:1});await settle();
  const login=h.signIn();release();await guest;await login;await h.api.submit(packet());
  assert.equal(h.api.profile().uid,'account1');assert.equal(h.auth.currentUser.isAnonymous,false);
  assert.equal(h.calls.length,1);assert.match(h.calls[0].path,/attempts\/account1_1_0$/);
  assert.deepEqual(h.authCalls,['anonymous','signOut','password']);
});
for(const rejected of [false,true])test(`單輪最多重送十筆（持續被拒=${rejected}），後續輪繼續保留項目`,async()=>{
  const queue=Array.from({length:24},(_,i)=>packet({cls:'999',activity:i+1}));
  const stored=new Map([[key,JSON.stringify({queue,receipts:[]})]]);
  const h=setup({stored,write:async()=>{if(rejected)throw error('permission-denied');}});await h.api.guest({cls:999,seat:1});await settle();
  assert.equal(h.calls.length,10);assert.equal(h.queue().length,rejected?24:14);
  h.advance();await h.api.flushGuest();assert.equal(h.calls.length,20);assert.equal(h.queue().length,rejected?24:4);
  assert.equal(h.authCalls.filter(x=>x==='anonymous').length,1);
});
for(const reload of [false,true])test(`前十筆持續被拒仍跨輪嘗試後續項目（重新開頁=${reload}）`,async()=>{
  const other=packet({cls:'998',seat:2});
  const queue=[other,...Array.from({length:24},(_,i)=>packet({cls:'999',activity:i+1}))];
  const stored=new Map([[key,JSON.stringify({queue,receipts:[]})]]);
  const write=async d=>{if(d.activity<=10)throw error('permission-denied');};
  let h=setup({stored,write});await h.api.guest({cls:999,seat:1});await settle();
  const attempts=[...h.calls];
  assert.deepEqual(attempts.map(x=>x.data.activity),[1,2,3,4,5,6,7,8,9,10]);
  await h.online();h.advance(59999);await h.api.flushGuest();
  assert.equal(h.calls.length,10,'輪替仍須遵守一分鐘退避');
  h.advance(1);
  if(reload){
    h=setup({stored:h.stored,session:h.session,user:h.auth.currentUser,write});await settle();
    attempts.push(...h.calls);
  }else{
    await h.online();attempts.push(...h.calls.slice(10));
  }
  assert.deepEqual(attempts.slice(10).map(x=>x.data.activity),[11,12,13,14,15,16,17,18,19,20],
    '第二輪須送到被前十筆擋住的項目，且單輪最多十筆');
  const before=h.calls.length;await h.api.flushGuest();
  attempts.push(...h.calls.slice(before));
  assert.equal(h.calls.length-before,10,'成功輪之後仍維持每輪上限');
  assert.deepEqual(attempts.slice(20).map(x=>x.data.activity),[21,22,23,24,1,2,3,4,5,6]);
  assert.ok(attempts.every(x=>x.data.cls==='999'&&x.data.seat===1&&x.uid==='guest1'));
  assert.deepEqual(h.authCalls,reload?[]:['anonymous'],'背景輪替不得增加 UID');
  assert.deepEqual(h.queue().find(x=>x.cls==='998'),other,'其他班座保留且不送出');
  assert.deepEqual(h.queue().filter(x=>x.cls==='999').map(x=>x.activity).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(h.state().receipts.length,14);assert.equal(h.statuses.at(-1),'guest-pending');
  await h.online();h.advance(59999);await h.api.flushGuest();
  assert.equal(h.calls.length,before+10,'第三輪失敗後仍須退避');
});
const proof=i=>JSON.stringify(['115-g9','999',1,'old'+i,1,0]);
test('既有 receipts 清至最近兩百筆，新成功證據也維持上限',async()=>{
  const receipts=Array.from({length:260},(_,i)=>proof(i));
  const stored=new Map([[key,JSON.stringify({queue:[],receipts})]]);const h=setup({stored});await settle();
  assert.deepEqual(h.state().receipts,receipts.slice(-200));
  await h.api.submit(packet());assert.equal(h.state().receipts.length,200);
  assert.equal(h.state().receipts[0],receipts[61]);assert.match(h.state().receipts.at(-1),/guest1/);
});
test('quota 額滿先清最舊 receipts，待送優先持久保存且重新開頁仍存在',async()=>{
  const receipts=[proof(1),proof(2),proof(3)];
  const stored=new Map([[key,JSON.stringify({queue:[],receipts})]]);const h=setup({stored});
  const pending=packet({cls:'999'});
  h.limitStorage(JSON.stringify({queue:[pending],receipts:receipts.slice(-1)}).length);
  h.blockStorage(false);h.failLogin('auth/network-request-failed');await h.api.submit(packet());
  assert.equal(h.queue().length,1);assert.equal(h.state().receipts.length,1);assert.equal(h.state().receipts[0],receipts[2]);
  const next=setup({stored});await settle();assert.equal(next.queue().length,1);
});
test('quota 連純待送都存不下時明確提示，儲存恢復後可重新持久保存',async()=>{
  const h=setup({storageLimit:1,authFailure:'auth/network-request-failed'});await h.api.submit(packet());
  assert.equal(h.statuses.at(-1),'guest-storage');
  h.limitStorage(Infinity);h.advance();await h.api.flushGuest();
  assert.equal(h.queue().length,1);assert.equal(h.statuses.at(-1),'guest-pending');
});

const storedGuest=(queue,receipts=[])=>new Map([[key,JSON.stringify({queue,receipts})]]);
// 同時涵蓋 online、公開 flush 與定時器；時間只由 fixture 的虛擬時鐘推進。
async function backgroundTriggers(h){
  await h.online();await h.api.flushGuest();
  for(const timer of h.timers)timer.fn();
  await settle();
}

for(const count of [10,11,61])test(`批次容量邊界 ${count} 筆：逐輪送完目前班座，其他班座完整保留`,async()=>{
  const mine=Array.from({length:count},(_,i)=>packet({cls:'999',activity:Math.floor(i/6)+1,round:i%6}));
  const others=[packet({cls:'998'}),packet({cls:'999',seat:2})];
  const queue=[others[0],...mine.slice(0,5),others[1],...mine.slice(5)];
  const h=setup({stored:storedGuest(queue)});
  await h.api.guest({cls:999,seat:1});await settle();
  for(let sent=10;;sent+=10){
    const done=Math.min(sent,count);
    assert.deepEqual(h.calls.map(x=>[x.data.activity,x.data.round]),mine.slice(0,done).map(x=>[x.activity,x.round]));
    assert.equal(h.queue().length,count-done+others.length);
    assert.deepEqual(h.queue().filter(x=>x.cls!=='999'||x.seat!==1),others);
    assert.equal(h.state().receipts.length,done);
    assert.equal(h.api.hasPending(),done<count);
    assert.equal(h.statuses.at(-1),done<count?'guest-pending':'ok');
    if(done===count)break;
    await h.api.flushGuest();await settle();
  }
  await backgroundTriggers(h);
  assert.equal(h.calls.length,count,'只剩其他班座時不自動換人上傳');
  assert.ok(h.calls.every(x=>x.uid==='guest1'&&x.data.cls==='999'&&x.data.seat===1));
  assert.deepEqual(h.authCalls,['anonymous']);assert.deepEqual(h.reads,[]);
});

test('手動重試略過退避仍限十筆；持續失敗跨隊尾輪替且不遺失項目',async()=>{
  const queue=Array.from({length:25},(_,i)=>packet({cls:'999',activity:i+1}));
  const h=setup({stored:storedGuest(queue),write:async()=>{throw error('permission-denied');}});
  await h.api.guest({cls:999,seat:1});await settle();
  assert.deepEqual(h.calls.map(x=>x.data.activity),[1,2,3,4,5,6,7,8,9,10]);
  await h.api.retry();await settle();
  assert.deepEqual(h.calls.slice(10).map(x=>x.data.activity),[11,12,13,14,15,16,17,18,19,20]);
  h.advance(119999);await backgroundTriggers(h);
  assert.equal(h.calls.length,20,'手動重試失敗後，背景仍須遵守第二次退避');
  h.advance(1);await h.online();
  assert.deepEqual(h.calls.slice(20).map(x=>x.data.activity),[21,22,23,24,25,1,2,3,4,5]);
  h.advance(239999);await backgroundTriggers(h);assert.equal(h.calls.length,30);
  h.advance(1);await h.api.flushGuest();
  assert.deepEqual(h.calls.slice(30).map(x=>x.data.activity),[6,7,8,9,10,11,12,13,14,15]);
  assert.deepEqual(h.queue().map(({uid,...x})=>x).sort((a,b)=>a.activity-b.activity),queue);
  assert.ok(h.calls.every(x=>x.uid==='guest1'));assert.deepEqual(h.authCalls,['anonymous']);
  assert.deepEqual(h.state().receipts,[]);assert.deepEqual(h.reads,[]);
  assert.equal(h.api.hasPending(),true);assert.equal(h.statuses.at(-1),'guest-pending');
});

test('背景退避精確遵守一、二、四、八、十五分鐘上限；成功後恢復一分鐘',async()=>{
  let fail=true;
  const h=setup({write:async()=>{if(fail)throw error('unavailable');}});
  await h.api.submit(packet());
  for(const delay of [60000,120000,240000,480000,900000,900000]){
    const before=h.calls.length;
    await backgroundTriggers(h);await h.api.guest({cls:999,seat:1});
    assert.equal(h.calls.length,before,'重複觸發與確認同班座不能提前重送');
    h.advance(delay-1);await backgroundTriggers(h);
    assert.equal(h.calls.length,before,`${delay}ms 退避到期前一毫秒不得寫入`);
    h.advance(1);await h.online();
    assert.equal(h.calls.length,before+1,`${delay}ms 到期即可重送一次`);
    assert.equal(h.queue().length,1);assert.equal(h.statuses.at(-1),'guest-pending');
  }
  fail=false;h.advance(900000);await h.api.flushGuest();
  assert.deepEqual(h.queue(),[]);assert.equal(h.state().receipts.length,1);
  assert.equal(h.statuses.at(-1),'ok');assert.equal(h.api.hasPending(),false);
  fail=true;await h.api.submit(packet({activity:2}));
  const before=h.calls.length;
  h.advance(59999);await backgroundTriggers(h);assert.equal(h.calls.length,before);
  h.advance(1);await h.online();assert.equal(h.calls.length,before+1,'成功後的新失敗重新從一分鐘退避開始');
  assert.ok(h.calls.every(x=>x.uid==='guest1'));assert.deepEqual(h.authCalls,['anonymous']);
  assert.deepEqual(h.reads,[]);
});

test('同輪混合成功與失敗：後續成功不消除失敗退避，下一輪仍繼續後段',async()=>{
  const queue=Array.from({length:12},(_,i)=>packet({cls:'999',activity:i+1}));
  const h=setup({stored:storedGuest(queue),write:async d=>{if(d.activity===1||d.activity===11)throw error('unavailable');}});
  await h.api.guest({cls:999,seat:1});await settle();
  assert.deepEqual(h.calls.map(x=>x.data.activity),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(h.state().receipts.length,9);
  h.advance(59999);await backgroundTriggers(h);assert.equal(h.calls.length,10);
  h.advance(1);await h.online();
  assert.deepEqual(h.calls.slice(10).map(x=>x.data.activity),[11,12,1]);
  assert.deepEqual(h.queue().map(x=>x.activity),[11,1]);assert.equal(h.state().receipts.length,10);
  h.advance(119999);await backgroundTriggers(h);assert.equal(h.calls.length,13);
  h.advance(1);await h.online();
  assert.deepEqual(h.calls.slice(13).map(x=>x.data.activity),[11,1]);
  assert.equal(h.state().receipts.length,10);assert.equal(h.statuses.at(-1),'guest-pending');
  assert.deepEqual(h.authCalls,['anonymous']);assert.deepEqual(h.reads,[]);
});

test('多筆待送造成 quota 額滿：只淘汰舊收據，重新開頁後可分批送完目前班座',async()=>{
  const mine=Array.from({length:12},(_,i)=>packet({cls:'999',activity:i+1}));
  const other=packet({cls:'998',seat:2});
  const receipts=Array.from({length:200},(_,i)=>proof(i));
  const pending=packet({cls:'999',activity:13});
  const queue=[other,...mine,pending];
  const h=setup({stored:storedGuest([other,...mine],receipts),authFailure:'auth/network-request-failed'});
  h.limitStorage(JSON.stringify({queue,receipts:receipts.slice(-2)}).length);
  await h.api.submit(pending);
  assert.deepEqual(h.queue(),queue);assert.deepEqual(h.state().receipts,receipts.slice(-2));
  assert.equal(h.calls.length,0);assert.equal(h.statuses.at(-1),'guest-pending');
  const next=setup({stored:h.stored});await settle();
  assert.deepEqual(next.queue(),queue);assert.deepEqual(next.authCalls,[]);
  await next.api.guest({cls:999,seat:1});await settle();
  assert.equal(next.calls.length,10);assert.equal(next.queue().length,4);
  await next.api.flushGuest();
  assert.deepEqual(next.calls.map(x=>x.data.activity),mine.concat(pending).map(x=>x.activity));
  assert.deepEqual(next.queue(),[other]);assert.equal(next.state().receipts.length,15);
  assert.equal(next.statuses.at(-1),'ok');assert.equal(next.api.hasPending(),false);
  assert.deepEqual(next.authCalls,['anonymous']);assert.deepEqual(next.reads,[]);
});

test('純待送也存不下：多班座與同關去重留在記憶體，恢復儲存後完整持久保存再上傳',async()=>{
  const h=setup({storageLimit:1,authFailure:'auth/network-request-failed'});
  const first=[packet({cls:'999'}),packet({cls:'999',activity:2})];
  const second=[packet({cls:'999',seat:2}),packet({cls:'999',seat:2,activity:2}),packet({cls:'999',seat:2,activity:3})];
  for(const item of first)await h.api.submit(item);
  await h.api.submit({...first[0],tries:9});
  for(const item of second)await h.api.submit(item);
  await h.api.submit({...second[0],tries:9});
  assert.equal(h.stored.has(key),false);assert.equal(h.api.hasPending(),true);
  assert.equal(h.statuses.at(-1),'guest-storage');assert.equal(h.calls.length,0);
  h.limitStorage(Infinity);h.advance();await h.api.flushGuest();
  assert.deepEqual(h.queue(),[...first,...second],'所有待送均恢復保存，同關保留最早資料');
  assert.equal(h.statuses.at(-1),'guest-pending');assert.equal(h.calls.length,0);
  const next=setup({stored:h.stored});await settle();
  assert.deepEqual(next.queue(),[...first,...second]);assert.deepEqual(next.authCalls,[]);
  await next.api.guest({cls:999,seat:2});
  assert.deepEqual(next.queue(),first);assert.equal(next.api.hasPending(),false);
  await next.api.guest({cls:999,seat:1});
  assert.deepEqual(next.calls.map(x=>[x.uid,x.data.seat,x.data.activity,x.data.tries]),[
    ['guest1',2,1,2],['guest1',2,2,2],['guest1',2,3,2],['guest2',1,1,2],['guest2',1,2,2]
  ]);
  assert.deepEqual(next.queue(),[]);assert.equal(next.state().receipts.length,5);
  assert.equal(next.statuses.at(-1),'ok');assert.deepEqual(next.authCalls,['anonymous','signOut','anonymous']);
  assert.deepEqual(next.reads,[]);
});

test('收據超過兩百筆後：保留的成功不重寫，已淘汰的成功可用 already-exists 重新確認',async()=>{
  const oldest=JSON.stringify(['115-g9','999',1,'guest1',1,0]);
  const retained=JSON.stringify(['115-g9','999',1,'guest1',2,0]);
  const receipts=[oldest,...Array.from({length:198},(_,i)=>proof(i)),retained];
  const h=setup({stored:storedGuest([],receipts),write:async d=>{if(d.activity===1)throw error('firestore/already-exists');}});
  await h.api.submit(packet({activity:3}));
  assert.equal(h.state().receipts.length,200);assert.ok(!h.state().receipts.includes(oldest));
  await h.api.submit(packet({activity:2}));
  assert.deepEqual(h.calls.map(x=>x.data.activity),[3],'仍有同 UID 成功收據時不重寫');
  await h.api.submit(packet());await h.api.submit(packet({tries:9}));
  assert.deepEqual(h.calls.map(x=>x.data.activity),[3,1]);assert.deepEqual(h.queue(),[]);
  assert.equal(h.state().receipts.length,200);assert.ok(h.state().receipts.includes(oldest));
  assert.ok(h.state().receipts.includes(retained));assert.equal(h.statuses.at(-1),'ok');
  assert.deepEqual(h.authCalls,['anonymous']);assert.deepEqual(h.reads,[]);
});

for(const nextId of [{cls:'999',seat:2},{cls:'998',seat:1}])test(`多筆送出中換班座 ${JSON.stringify(nextId)}：舊請求失敗不阻擋新人，返回時才送舊待送`,async t=>{
  let release;const gate=new Promise(r=>release=r);t.after(()=>release());
  const original=[packet({cls:'999'}),packet({cls:'999',activity:2})];
  const nextItems=[packet(nextId),packet({...nextId,activity:2})];
  const other=packet({cls:'997',seat:3});
  let first=true;
  const h=setup({stored:storedGuest([original[0],nextItems[0],other,original[1],nextItems[1]]),write:async()=>{
    if(first){first=false;await gate;throw error('unavailable');}
  }});
  const starting=h.api.guest({cls:999,seat:1});await settle();
  assert.equal(h.calls.length,1);assert.equal(h.state().receipts.length,0);
  await h.api.guest(nextId);await h.api.submit(packet({...nextId,activity:3}));
  await backgroundTriggers(h);
  assert.equal(h.calls.length,1,'舊請求未結束時不平行啟動另一輪');
  release();await starting;await settle();
  assert.deepEqual(h.calls.map(x=>[x.uid,x.data.cls,x.data.seat,x.data.activity]),[
    ['guest1','999',1,1],['guest2',nextId.cls,nextId.seat,1],
    ['guest2',nextId.cls,nextId.seat,2],['guest2',nextId.cls,nextId.seat,3]
  ]);
  assert.deepEqual(h.queue().map(({uid,...x})=>x).filter(x=>x.cls==='999'&&x.seat===1).sort((a,b)=>a.activity-b.activity),original);
  assert.deepEqual(h.queue().find(x=>x.cls==='997'),other);
  assert.equal(h.state().receipts.length,3);assert.equal(h.api.hasPending(),false);
  assert.equal(h.statuses.at(-1),'ok');
  await h.api.guest({cls:999,seat:1});
  assert.deepEqual(h.calls.slice(4).map(x=>[x.uid,x.data.activity]),[['guest3',2],['guest3',1]]);
  assert.deepEqual(h.queue(),[other]);assert.equal(h.state().receipts.length,5);
  assert.deepEqual(h.authCalls,['anonymous','signOut','anonymous','signOut','anonymous']);
  assert.deepEqual(h.reads,[]);
});

test('離開訪客身分後 online、定時器與手動重試都不送出；重新確認同班座才恢復',async()=>{
  let fail=true;
  const mine=[packet({cls:'999'}),packet({cls:'999',activity:2})];
  const other=packet({cls:'998',seat:2});
  const h=setup({stored:storedGuest([...mine,other]),write:async()=>{if(fail)throw error('unavailable');}});
  await h.api.guest({cls:999,seat:1});await settle();assert.equal(h.calls.length,2);
  assert.equal(h.api.hasPending(),true);h.api.leaveGuest();
  const snapshot=h.stored.get(key);assert.equal(h.api.hasPending(),false);
  fail=false;h.advance(900000);await backgroundTriggers(h);await h.api.retry();
  assert.equal(h.calls.length,2);assert.equal(h.stored.get(key),snapshot);
  assert.deepEqual(h.authCalls,['anonymous']);
  await h.api.guest({cls:999,seat:1});
  assert.deepEqual(h.calls.slice(2).map(x=>[x.uid,x.data.activity]),[['guest1',1],['guest1',2]]);
  assert.deepEqual(h.queue(),[other]);assert.equal(h.state().receipts.length,2);
  assert.equal(h.api.hasPending(),false);assert.equal(h.statuses.at(-1),'ok');
  assert.deepEqual(h.authCalls,['anonymous']);assert.deepEqual(h.reads,[]);
});
