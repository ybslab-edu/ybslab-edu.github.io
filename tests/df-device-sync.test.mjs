import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedBackend} from './fixtures/df-shared-firebase.mjs';
import {device,until} from './fixtures/df-device-harness.mjs';
const path=(uid='u1',session=1)=>`ybsCourses/115-df/reports/${uid}_s${session}`;
const problem=doc=>JSON.parse(doc.payload).problem;

test('共享後端＋兩個獨立 JS 環境：同堂覆寫保留建立時間、異堂隔離，作答不下載',async()=>{
  const backend=sharedBackend(),a=await device(backend,'A'),b=await device(backend,'B');
  await a.send('合成 A 第一堂');await a.received();const first=structuredClone(backend.docs.get(path()));
  assert.equal(b.c.S.problem,'');
  await b.send('合成 B 第一堂');await b.received();
  assert.equal(problem(backend.docs.get(path())),'合成 B 第一堂');
  assert.equal(backend.docs.get(path()).createdAt,first.createdAt);
  assert.ok(backend.docs.get(path()).updatedAt>first.updatedAt);
  for(const session of [2,3]) {await b.send('合成第'+session+'堂',session);await b.received();}
  assert.equal(backend.docs.size,3);assert.equal(problem(backend.docs.get(path())),'合成 B 第一堂');
  assert.equal(a.c.S.problem,'合成 A 第一堂');
});

test('共享後端＋實際佇列：拒絕不丟快照，舊確認失效後重新確認才覆寫',async()=>{
  const backend=sharedBackend(),a=await device(backend,'A'),b=await device(backend,'B');
  b.setTime(backend.now-1000);
  await a.send('合成 A 新版');await a.received();
  await b.send('合成 B 舊版');await until(()=>b.queue()[0]?.phase==='conflict');
  const pending=b.queue();b.c.confirm=()=>false;b.c.retryReport(1);
  assert.deepEqual(b.queue(),pending);assert.equal(problem(backend.docs.get(path())),'合成 A 新版');
  await a.send('合成 A 更新版');await a.received();const newest=structuredClone(backend.docs.get(path()));
  b.c.confirm=()=>true;b.c.retryReport(1);await until(()=>b.queue()[0]?.overwriteAt===newest.updatedAt);
  assert.deepEqual(backend.docs.get(path()),newest);assert.equal(b.queue()[0].encoded.payload,pending[0].encoded.payload);
  b.c.retryReport(1);await b.received();assert.equal(problem(backend.docs.get(path())),'合成 B 舊版');
});

test('共享後端＋實際佇列：離線恢復保留舊快照，另一裝置更新觸發衝突',async()=>{
  const backend=sharedBackend(),a=await device(backend,'A'),b=await device(backend,'B');
  b.setTime(backend.now-1000);backend.offline.add('B');
  await b.send('合成離線快照');await until(()=>b.queue()[0]?.phase==='waiting');const pending=b.queue()[0];
  b.c.S.problem='合成尚未交件修改';await a.send('合成 A 最新');await a.received();
  backend.offline.delete('B');b.setTime(backend.now+3000);b.c.dispatchEvent(new Event('online'));
  await until(()=>b.queue()[0]?.phase==='conflict');assert.equal(b.queue()[0].encoded.payload,pending.encoded.payload);
  assert.equal(problem(backend.docs.get(path())),'合成 A 最新');
  b.c.retryReport(1);await b.received();assert.equal(problem(backend.docs.get(path())),'合成離線快照');
  assert.equal(b.c.S.problem,'合成尚未交件修改');
});

test('共享後端＋不同 UID：不恢復別人的待送，過關重交不新增亦不下載作答',async()=>{
  const backend=sharedBackend(),a=await device(backend,'A'),b=await device(backend,'B','u2');
  backend.offline.add('A');await a.send('合成 UID1 待送');await until(()=>a.queue()[0]?.phase==='waiting');
  const pending=a.queue();
  // 新開環境使用自己的身分，直接驗證正式恢復函式的 UID 過濾。
  const restored=await device(backend,'B-restored','u2',pending);assert.deepEqual(restored.queue(),[]);
  await b.send('合成 UID2');await b.received();assert.equal(backend.docs.has(path()),false);
  assert.equal(problem(backend.docs.get(path('u2'))),'合成 UID2');assert.deepEqual(a.queue(),pending);
  backend.offline.delete('A');a.setTime(backend.now+3000);a.c.dispatchEvent(new Event('online'));await a.received();
  assert.equal(problem(backend.docs.get(path())),'合成 UID1 待送');
  const other=await device(backend,'C');
  for(const client of [a,other]) await client.c.YBS.submit({activity:1,round:0,level:1,tries:2});
  assert.equal(backend.commits.filter(x=>x.path.includes('/attempts/')).length,1);
  assert.equal(other.c.S.problem,'');assert.equal(other.c.sessionStorage.getItem('ybslab:fq'),'[]');
});

test('限制重現：離線裝置時鐘超前，快照較舊仍可能直接覆寫另一裝置新版',async()=>{
  const backend=sharedBackend(),a=await device(backend,'A'),b=await device(backend,'B');
  b.setTime(backend.now+86400000);backend.offline.add('B');
  await b.send('合成 B 較早離線作答');await until(()=>b.queue()[0]?.phase==='waiting');
  await a.send('合成 A 後來新版');await a.received();
  assert.equal(problem(backend.docs.get(path())),'合成 A 後來新版');
  let prompts=0;b.c.confirm=()=>{prompts++;return false;};
  backend.offline.delete('B');b.setTime(backend.now+86403000);b.c.dispatchEvent(new Event('online'));
  await b.received();assert.equal(prompts,0);
  assert.equal(problem(backend.docs.get(path())),'合成 B 較早離線作答');
});
