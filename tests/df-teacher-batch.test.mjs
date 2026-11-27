// 只在記憶體模擬 Firebase；執行實際刪除事件，不載入 SDK 或建立網路連線。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/df-teacher-cloud.js',import.meta.url),'utf8');
async function setup(total,{failAt=0,accept=true,decode,queryFailure,commitHook,failAfterApply=false}={}){
  const nodes=new Map(),get=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'2',disabled:false,textContent:''});
    return nodes.get(id);
  };
  // 不同堂次的哨兵也全為合成文件；不得被目前堂次的刪除帶走。
  const docs=Array.from({length:total},(_,i)=>({id:`synthetic-${i}_s2`,session:2}));
  docs.push({id:'synthetic-other_s1',session:1});
  const commits=[],queries=[],checks=[],confirmations=[],resets=[],rows=[];
  let observer,batchNumber=0,failure=failAt;
  const auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:cb=>{observer=cb;cb(null)},
    signInWithPopup:async()=>{auth.currentUser={uid:'synthetic-owner'};await observer(auth.currentUser)}};
  const db={doc:path=>({get:async options=>{checks.push({path,options});return {exists:true,data:()=>({ownerUid:'synthetic-owner'})}}}),
    collection:path=>({get:async()=>({docs:[]}),where:(field,op,n)=>({get:async options=>{
      queries.push({path,field,op,n,options});
      if(queryFailure)throw queryFailure;
      return {docs:docs.filter(d=>d.session===n).map(d=>({id:d.id,ref:{id:d.id},data:()=>({uid:d.id.split('_s')[0],session:d.session,cls:701,seat:1,updatedAt:{toDate:()=>new Date('2026-10-21T00:00:00Z')}})}))};
    }})}),batch:()=>{
      const pending=[],number=++batchNumber;
      return {delete:ref=>pending.push(ref.id),commit:async()=>{
        commits.push({number,ids:[...pending],failed:number===failure});
        await commitHook?.(number);
        if(number===failure&&!failAfterApply)throw new Error('synthetic batch failure');
        for(const id of pending){const i=docs.findIndex(d=>d.id===id);assert.notEqual(i,-1);docs.splice(i,1)}
        if(number===failure&&failAfterApply)throw new Error('synthetic acknowledgement failure');
      }};
    }};
  const app={name:'df-teacher',auth:()=>auth,firestore:()=>db};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{}}
  const context=vm.createContext({DFReport:{decode},document:{getElementById:get,createElement:()=>({}),head:{append:s=>s.onload()}},
    firebase:{apps:[app],auth:{GoogleAuthProvider,Auth:{Persistence:{SESSION:'session'}}}},
    confirm:text=>{confirmations.push(text);return accept}});
  context.window=context;
  vm.runInContext(source,context,{timeout:1000});
  context.DFTeacherCloud({reset:()=>{resets.push(true);rows.length=0},render(){},ingest(d,meta){rows.push({d,meta})}});
  await get('cloud-login').onclick();
  assert.equal(get('cloud-delete').disabled,false);
  return {get,docs,commits,queries,checks,confirmations,resets,rows,read:()=>get('cloud-read').onclick(),retry:()=>{failure=0},remove:()=>get('cloud-delete').onclick()};
}
for(const total of [400,401])test(`${total} 筆：每批最多 400，完整且不重複刪除，保留其他堂次`,async()=>{
  const h=await setup(total);await h.remove();
  assert.deepEqual(h.commits.map(c=>c.ids.length),total===400?[400]:[400,1]);
  const ids=h.commits.flatMap(c=>c.ids);
  assert.equal(new Set(ids).size,total);
  assert.deepEqual(ids,Array.from({length:total},(_,i)=>`synthetic-${i}_s2`));
  assert.deepEqual(h.docs,[{id:'synthetic-other_s1',session:1}]);
  assert.equal(h.confirmations.length,1);
  assert.match(h.confirmations[0],new RegExp(`115-df.*第 2 堂.*${total} 份`));
  assert.match(h.get('cloud-status').textContent,new RegExp(`已刪除 ${total} 份`));
  assert.equal(h.get('cloud-delete').disabled,false);assert.equal(h.get('cloud-read').disabled,false);
  assert.deepEqual(h.queries.map(q=>[q.path,q.field,q.op,q.n,q.options.source]),[['ybsCourses/115-df/reports','session','==',2,'server']]);
  assert.equal(h.checks.length,3,'登入、查詢前及確認後重新核對 owner');
});

test('中途第二批失敗：只計成功的 400 筆、停止後續批次、重試只刪剩餘',async()=>{
  const h=await setup(801,{failAt:2}),before=h.resets.length;
  await h.remove();
  assert.deepEqual(h.commits.map(c=>[c.ids.length,c.failed]),[[400,false],[400,true]]);
  assert.equal(h.docs.filter(d=>d.session===2).length,401);
  assert.match(h.get('cloud-status').textContent,/已刪除 400 份。雲端操作失敗.*重新操作刪除剩餘/);
  assert.doesNotMatch(h.get('cloud-status').textContent,/已刪除 801/);
  assert.equal(h.resets.length,before+1,'失敗後清除舊彙整畫面');
  assert.equal(h.get('cloud-delete').disabled,false);
  h.retry();await h.remove();
  assert.deepEqual(h.commits.slice(2).map(c=>c.ids.length),[400,1]);
  assert.equal(h.commits[2].ids[0],'synthetic-400_s2');
  assert.deepEqual(h.docs,[{id:'synthetic-other_s1',session:1}]);
  assert.match(h.confirmations[1],/401 份/);assert.match(h.get('cloud-status').textContent,/已刪除 401 份/);
});

test('首批失敗不計刪除；401 筆取消確認不建立批次',async()=>{
  const failed=await setup(401,{failAt:1});await failed.remove();
  assert.equal(failed.docs.length,402);assert.equal(failed.commits.length,1);
  assert.match(failed.get('cloud-status').textContent,/已刪除 0 份.*失敗/);
  const cancelled=await setup(401,{accept:false});await cancelled.remove();
  assert.equal(cancelled.commits.length,0);assert.equal(cancelled.docs.length,402);
  assert.equal(cancelled.get('cloud-delete').disabled,false);
});

test('逐筆讀取收到 null 拒絕值仍保留成功項、文件索引並繼續後續報告',async()=>{
  const decoded=[];
  const h=await setup(3,{decode:async envelope=>{
    decoded.push(envelope.uid);
    if(envelope.uid==='synthetic-1')throw null;
    return {synthetic:true};
  }});
  await h.read();
  assert.match(h.get('cloud-status').textContent,/已讀取 2 份.*略過 1 份.*synthetic-1_s2：解碼失敗/);
  assert.deepEqual(decoded,['synthetic-0','synthetic-1','synthetic-2']);
  assert.deepEqual(h.rows.map(r=>r.meta.uid),['synthetic-0','synthetic-2']);
  assert.equal(h.get('cloud-read').disabled,false);
  assert.equal(h.commits.length,0);
});

for(const failAt of [1,2,3])test(`第 ${failAt} 批失敗保留批次範圍；重試不重送成功項`,async()=>{
  const h=await setup(801,{failAt});
  await h.remove();
  const first=(failAt-1)*400+1,last=Math.min(failAt*400,801);
  assert.match(h.get('cloud-status').textContent,new RegExp(`第 ${failAt} 批（第 ${first}–${last} 份）`));
  const succeeded=new Set(h.commits.filter(c=>!c.failed).flatMap(c=>c.ids));
  assert.equal(succeeded.size,first-1);
  assert.equal(h.commits.length,failAt,'失敗後不繼續送出後續批次');
  h.retry();await h.remove();
  const retried=h.commits.slice(failAt).flatMap(c=>c.ids);
  assert.equal(retried.length,801-succeeded.size);
  assert.equal(retried.some(id=>succeeded.has(id)),false);
  assert.deepEqual(h.docs,[{id:'synthetic-other_s1',session:1}]);
});

test('刪除查詢失敗保留錯誤、沒有批次索引或寫入；空結果不確認',async()=>{
  const h=await setup(1,{queryFailure:{code:'permission-denied'}});
  await h.remove();
  assert.match(h.get('cloud-status').textContent,/已刪除 0 份。無權限/);
  assert.doesNotMatch(h.get('cloud-status').textContent,/第 .* 批/);
  assert.equal(h.commits.length,0);assert.equal(h.confirmations.length,0);
  assert.equal(h.get('cloud-delete').disabled,false);
  const empty=await setup(0);await empty.remove();
  assert.equal(empty.commits.length,0);assert.equal(empty.confirmations.length,0);
});

test('批次提交尚未完成時重按刪除不重送',async()=>{
  let release,started;
  const pending=new Promise(resolve=>{started=resolve});
  const h=await setup(401,{commitHook:async number=>{
    if(number===1)await new Promise(resolve=>{release=resolve;started()});
  }});
  const deleting=h.remove();await pending;
  try{
    await h.remove();
    assert.equal(h.queries.length,1);assert.equal(h.commits.length,1);
    assert.equal(h.get('cloud-delete').disabled,true);
  }finally{release();await deleting}
  assert.deepEqual(h.commits.map(c=>c.ids.length),[400,1]);
});


test('伺服器已刪除但提交回覆失敗：手動重試重新查詢，不重送已套用項',async()=>{
  const h=await setup(801,{failAt:2,failAfterApply:true});
  await h.remove();
  assert.equal(h.commits.length,2);
  assert.equal(h.docs.filter(d=>d.session===2).length,1);
  assert.match(h.get('cloud-status').textContent,/已刪除 400 份.*第 2 批（第 401–800 份）/);
  h.retry();await h.remove();
  assert.deepEqual(h.commits.slice(2).map(c=>c.ids),[['synthetic-800_s2']]);
  assert.equal(h.queries.length,2);
  assert.match(h.confirmations[1],/共 1 份/);
  assert.deepEqual(h.docs,[{id:'synthetic-other_s1',session:1}]);
});
