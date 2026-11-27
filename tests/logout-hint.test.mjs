import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
import {setup,key,packet,settle,error} from './fixtures/guest-firebase.mjs';

// 提示執行原碼，DOM 與 200ms 計時器離線替代，手動推進且不等待時鐘。
const source=readFileSync(new URL('../assets/login.js',import.meta.url),'utf8');
const hintSource=source.slice(source.indexOf('const ybsLogoutPending ='));
assert.ok(hintSource.startsWith('const ybsLogoutPending ='));
function hintFor(api) {
  const head=new Element('head'),timers=new Map(),el=new Element('p');
  el.textContent='合成上傳狀態';el.hidden=true;el.isConnected=true;
  el.replaceChildren=(...nodes)=>{el.childNodes=nodes;};
  const context=vm.createContext({YBS:api,document:{head,
    getElementById:id=>head.querySelector('#'+id),createElement:tag=>new Element(tag),
    createTextNode:text=>({nodeType:3,textContent:text})},
    setInterval(fn,ms){assert.equal(ms,200);const id={};timers.set(id,fn);return id;},
    clearInterval:id=>timers.delete(id)});
  vm.runInContext(hintSource+'\nglobalThis.hint=ybsLogoutPending;',context);
  return {el,timers,show:()=>context.hint(el),tick:()=>[...timers.values()].forEach(fn=>fn())};
}

test('待送查詢唯讀：目前帳號、送完、登出',async()=>{
  let release;
  const env=setup({write:()=>new Promise(resolve=>{release=resolve;})});
  await env.account();
  assert.equal(env.api.hasPending(),false);
  const sent=env.api.submit(packet());await settle();
  const storage=JSON.stringify([...env.session]);
  assert.equal(env.api.hasPending(),true);
  assert.equal(JSON.stringify([...env.session]),storage);
  assert.equal(env.calls.length,1,'查詢不另外上傳');
  release();await sent;
  assert.equal(env.api.hasPending(),false);
  await env.api.logout();
  assert.equal(env.api.hasPending(),false);
});

test('班座待送查詢唯讀，不整理收據或改寫儲存',async()=>{
  const env=setup();
  await env.api.guest({cls:999,seat:1});
  const data={queue:[packet({cls:'999'})],receipts:Array.from({length:205},(_,i)=>({synthetic:i}))};
  env.stored.set(key,JSON.stringify(data));
  const before=JSON.stringify([...env.stored]);
  assert.equal(env.api.hasPending(),true);
  assert.equal(JSON.stringify([...env.stored]),before);
  assert.equal(env.calls.length,0);
  env.stored.set(key,JSON.stringify({...data,queue:[packet({cls:'999',seat:2})]}));
  assert.equal(env.api.hasPending(),false,'其他班座待送不算目前身分');
  env.stored.set(key,JSON.stringify({...data,queue:[]}));
  assert.equal(env.api.hasPending(),false);
});

for (const mode of ['同步拋錯','非同步拒絕']) {
  test(`上傳${mode}後提示保留，重送成功清提示且不自動登出`,async t=>{
    t.mock.method(Date,'now',()=>Date.parse('2026-11-10T04:00:00Z'));
    let failing=true,reject;
    const env=setup();
    await env.account();
    const {db}=await env.api.firebaseSession(),doc=db.doc.bind(db);
    t.mock.method(db,'doc',path=>{
      const ref=doc(path),set=ref.set.bind(ref);
      // 不經過 fixture 的 async set，保留直接同步拋錯的呼叫邊界。
      ref.set=data=>{
        if (!failing) return set(data);
        env.calls.push({path,data,uid:env.auth.currentUser?.uid});
        if (mode==='同步拋錯') throw error('unavailable');
        return new Promise((_,no)=>{reject=no;});
      };
      return ref;
    });
    const sent=env.api.submit(packet());
    const hint=hintFor(env.api);
    assert.equal(env.api.hasPending(),true);
    assert.equal(hint.show(),true);
    assert.match(hint.el.textContent,/紀錄上傳中，請稍候再登出\n再按一次/);
    await settle();
    if (mode==='非同步拒絕') {
      assert.equal(typeof reject,'function');
      reject(error('unavailable'));
    }
    await sent;
    hint.tick();
    assert.equal(env.api.hasPending(),true,'上傳失敗仍保留待送紀錄');
    assert.match(hint.el.textContent,/紀錄上傳中，請稍候再登出\n再按一次/);
    assert.equal(hint.timers.size,1);
    assert.equal(env.calls.length,1,'提示輪詢不重送失敗紀錄');
    failing=false;
    await env.api.retry();hint.tick();
    assert.equal(env.calls.length,2);
    assert.equal(env.api.hasPending(),false);
    assert.equal(hint.el.textContent,'合成上傳狀態');
    assert.equal(hint.el.hidden,true);
    assert.equal(hint.el.matches('.ybs-logout-pending'),false);
    assert.equal(hint.timers.size,0);
    assert.equal(env.api.profile().uid,'google1');
    assert.equal(env.auth.currentUser.uid,'google1');
    assert.deepEqual(env.authCalls,[]);
  });

  test(`登出${mode}仍清本機身分，重複登出後可重新登入並重新提示`,async t=>{
    t.mock.method(Date,'now',()=>Date.parse('2026-11-10T04:00:00Z'));
    const env=setup({write:()=>{throw error('unavailable');}});
    await env.account();
    await env.api.submit(packet());
    env.session.set('ybslab:reports:115-df','synthetic report cache');
    env.session.set('ybslab:login','synthetic login cache');
    const guestData=JSON.stringify({queue:[packet({cls:'999'})],receipts:[]});
    env.stored.set(key,guestData);
    const hint=hintFor(env.api),signOut=env.auth.signOut;
    let reject,attempts=0;
    env.auth.signOut=()=>{
      attempts++;
      if (mode==='同步拋錯') throw error('auth/network-request-failed');
      return new Promise((_,no)=>{reject=no;});
    };
    assert.equal(hint.show(),true);
    assert.equal(hint.show(),false,'第二次按下允許直接登出');
    const leaving=env.api.logout();
    assert.equal(env.api.profile(),null,'不等待 Auth 成功才清身分');
    assert.equal(env.api.hasPending(),false);
    for (const key of ['ybslab:fq','ybslab:reports:115-df','ybslab:login']) {
      assert.equal(env.session.has(key),false,`${key} 已清除`);
    }
    assert.equal(env.stored.get(key),guestData,'保留獨立的班座待送資料');
    await settle();
    assert.equal(attempts,1);
    assert.equal(env.auth.currentUser.uid,'google1','Auth 失敗仍可能留有舊使用者');
    // 非同步失敗尚未回應時排入第二次登出與登入，驗證 Auth 序列能恢復。
    env.auth.signOut=signOut;
    const again=env.api.logout(),login=env.signIn();
    if (mode==='非同步拒絕') {
      assert.equal(typeof reject,'function');
      await settle();
      assert.deepEqual(env.authCalls,[],'後續登出與登入不得超越尚未完成的 Auth');
      reject(error('auth/network-request-failed'));
    }
    await Promise.all([leaving,again,login]);
    assert.deepEqual(env.authCalls,['signOut','password']);
    assert.equal(env.api.profile().uid,'account1');
    assert.equal(env.auth.currentUser.uid,'account1');
    assert.equal(env.api.hasPending(),false,'重新登入不恢復前人的帳號待送');
    assert.equal(hint.timers.size,0);
    await env.api.submit(packet({activity:2}));
    assert.equal(env.calls.at(-1).uid,'account1');
    assert.equal(env.api.hasPending(),true);
    assert.equal(hint.show(),true,'新登入第一次登出仍須顯示提示');
    assert.equal(hint.show(),false);
    assert.equal(hint.timers.size,0);
    assert.equal(hint.el.textContent,'合成上傳狀態');
    assert.equal(hint.el.hidden,true);
    assert.equal(hint.el.matches('.ybs-logout-pending'),false);
  });
}
