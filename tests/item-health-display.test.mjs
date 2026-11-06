// 實際教師頁與雲端控制器的離線 DOM 測試；全部為合成資料。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/teacher-export.mjs';
const stamp={toMillis:()=>1};
function teacher(){
  const state={fail:false,empty:false,hold:null},queries=[];
  let changed=()=>{};
  const auth={currentUser:null,onAuthStateChanged(fn){changed=fn;fn(null)},
    async signInWithPopup(){this.currentUser={uid:'owner'};changed(this.currentUser)},
    async signOut(){this.currentUser=null;changed(null)}};
  const roster=['a','b','c','d','e'].map((email,i)=>({id:email+'@example.invalid',data:()=>({cls:i<2?998:999,seat:i+1})}));
  const attempts=['a','b','c','outside'].map((uid,i)=>({id:uid+'_1_0',data:()=>({uid,email:uid+'@example.invalid',activity:1,round:0,level:1,tries:[2,6,4,999][i],passedAt:stamp})}));
  const guest={id:'guest_1_0',data:()=>({cls:'999',seat:4,activity:1,round:0,level:1,tries:999,passedAt:stamp,verified:false})};
  const db={doc:()=>({get:async()=>({exists:true,data:()=>({ownerUid:'owner'})})}),collection:path=>({get:async()=>{
    queries.push(path);if(state.hold)await state.hold;if(state.fail)throw Error('synthetic');
    return {docs:state.empty?[]:path.endsWith('/roster')?roster:path.endsWith('/attempts')?attempts:[guest]};
  }})};
  function GoogleAuthProvider(){this.setCustomParameters=()=>{}}
  const h=setup({cloud:{ybs:{firebaseSession:async()=>({auth,db})},firebase:{auth:{GoogleAuthProvider}}}});
  return {...h,state,queries,login:()=>h.get('cloud-login').onclick(),read:()=>h.get('cloud-read').onclick(),logout:()=>h.get('cloud-logout').onclick()};
}
const cells=h=>h.get('health-table').querySelectorAll('tbody tr')[0].querySelectorAll('td').map(n=>n.textContent);
test('教師頁實際查詢更新健檢，排除 guest 與名冊外；篩班與標紅',async()=>{
  const h=teacher();assert.equal(h.get('health-class').disabled,true);
  await h.login();await h.read();
  assert.deepEqual(h.queries,['ybsCourses/115-g9/attempts','ybsCourses/115-g9/guestAttempts','ybsCourses/115-g9/roster']);
  assert.deepEqual(cells(h).slice(2),['3／5','60%','4','4','6','—']);
  assert.equal(h.get('health-table').querySelectorAll('tbody tr')[0].className,undefined);
  assert.equal(h.get('health-table').querySelectorAll('tbody tr')[1].className,'health-warning');
  h.get('health-class').value='998';h.get('health-class').onchange();
  assert.deepEqual(cells(h).slice(2,7),['2／2','100%','4','4','6']);
  h.get('health-class').value='999';h.get('health-class').onchange();
  assert.deepEqual(cells(h).slice(2),['1／3','33.33%','4','4','4','過關率低']);
  assert.equal(h.get('health-table').querySelectorAll('tbody tr')[0].className,'health-warning');
  await h.login();assert.equal(h.get('health-table').textContent,'');assert.equal(h.get('health-class').disabled,true);
});
test('空名冊、讀取失敗、登出與遲到查詢不殘留健檢',async()=>{
  const h=teacher();await h.login();h.state.empty=true;await h.read();
  assert.deepEqual(cells(h).slice(2),['0／0','—','—','—','—','—']);assert.match(h.get('health-status').textContent,/名冊 0 人/);
  h.state.empty=false;await h.read();assert.match(h.get('health-status').textContent,/名冊 5 人/);
  h.state.fail=true;await h.read();assert.equal(h.get('health-table').textContent,'');assert.equal(h.get('health-class').disabled,true);
  h.state.fail=false;
  let release;h.state.hold=new Promise(r=>release=r);const pending=h.read();
  await Promise.resolve();await h.logout();release();await pending;
  assert.equal(h.get('health-table').textContent,'');assert.equal(h.get('health-class').disabled,true);assert.equal(h.get('health-class').value,'');
});
