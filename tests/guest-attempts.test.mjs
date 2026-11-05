import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,packet,error,settle,key} from './fixtures/guest-firebase.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));

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
