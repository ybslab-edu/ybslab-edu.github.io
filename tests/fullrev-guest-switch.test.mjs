import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { harness, config } from './fixtures/fullrev.mjs';

async function fixture() {
  const load = p => import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE, p)).href);
  const [{ setup, paths, ENV, solve }, { ORIGIN }, { createFormalWorker }, { guestPath }] = await Promise.all([
    load('tests/formal-fixtures.mjs'), load('tests/fixtures.mjs'), load('src/formal/index.mjs'), load('src/formal/guest.mjs')]);
  const backend = await setup(); backend.db.pathValidator = guestPath;
  backend.db.seed('ybsCourses/115-g9/classGates/c901_1', backend.db.docs.get(paths.roster));
  const worker = createFormalWorker({ env: { ...ENV, FIREBASE_PROJECT_ID: config.firebase.projectId, YBS_PROJECT_ID: config.firebase.projectId },
    adapter: backend.db, now: backend.now, verifier: { verify: async () => ({ uid: 'synthetic-student', provider: 'anonymous' }) } });
  const h = await harness({ noModel: true }); h.state.hints = {};
  let offline = false;
  h.state.fetcher = (url, init) => {
    if (offline && url.endsWith('/guest/answer')) throw Error('synthetic-offline');
    return worker.fetch(new Request(url, { ...init, headers: {
      'content-type': 'application/json', origin: ORIGIN, authorization: 'Bearer synthetic-token' } }));
  };
  await h.client.login('guest', { cls: '901', seat: 1 });
  return { ...h, backend, solve, offline: value => { offline = value; },
    advance() { h.advance(); backend.advance(); },
    head: () => [...backend.db.docs].find(([p]) => p.includes('/guestHeads/'))[1],
    pending: () => [...backend.db.docs.keys()].filter(p => p.includes('/guestAttempts/')),
    raw: (op, body) => backend.call(`guest/${op}`, body, { instance: worker }) };
}

for (const phase of ['unfinished', 'wrong', 'first-correct']) test(`guest ${phase}: real Worker switches and returns to group one; reload resumes the same round`,
  { skip: !process.env.YBS_WORKER_SOURCE }, async () => {
    const h = await fixture(), first = await h.client.start(5, 1);
    let v = first;
    if (phase !== 'unfinished') v = await h.client.answer(5, 1, h.solve(v) + (phase === 'wrong' ? 1 : 0));
    const restored = h.reopen(); await restored.restore(); v = await restored.start(5, 1);
    assert.equal(v.sid, first.sid); assert.equal(v.question.slot, phase === 'first-correct' ? 1 : 0);
    h.advance();
    const next = await restored.start(5, 2);
    assert.notEqual(next.sid, first.sid); assert.equal(next.question.slot, 0); assert.equal(next.nextSeq, 1);
    const old = { course: '115-g9', classKey: 'c901_1', cls: '901', seat: 1,
      activity: 5, round: 1, sid: first.sid, requestId: 'obsolete-resume-0001' };
    assert.equal((await h.raw('resume', old)).status, 403);
    assert.equal((await h.raw('answer', { ...old, requestId: 'obsolete-answer-0001', seq: v.nextSeq, slot: v.question.slot, answer: h.solve(v) })).status, 403);
    h.advance(); const back = await restored.start(5, 1);
    assert.notEqual(back.sid, first.sid); assert.equal(back.question.slot, 0); assert.equal(back.nextSeq, 1);
    assert.deepEqual(h.pending(), []); assert.deepEqual(h.backend.results(), []);
    assert.equal(h.head().guestWindows, undefined);
    let current = back;
    for (let i = 0; i < 2; i++) current = await restored.answer(5, 1, h.solve(current));
    assert.equal(current.counted, false); assert.equal(current.status, 'pending');
    assert.equal(restored.state().snapshot, null); assert.equal(h.pending().length, 1); assert.deepEqual(h.backend.results(), []);
    assert.ok(h.requests.every(r => new URL(r.url).pathname.startsWith('/guest/')));
  });

test('guest switch abandons an offline answer; retries cannot restore old work or create formal credit',
  { skip: !process.env.YBS_WORKER_SOURCE }, async () => {
    const h = await fixture(), first = await h.client.start(5, 1);
    h.offline(true);
    await assert.rejects(h.client.answer(5, 1, h.solve(first)), { code: 'pending' });
    assert.equal(h.client.state().pending, true);
    const pending = h.requests.at(-1).body;
    h.advance(); const next = await h.client.start(5, 2);
    assert.equal(next.round, 2); assert.equal(next.question.slot, 0); assert.equal(h.client.state().pending, false);
    h.offline(false); h.advance(); const calls = h.requests.length; await h.client.retry();
    assert.equal(h.requests.length, calls);
    assert.equal(h.requests.filter(r => r.body.requestId === pending.requestId).length, 1);
    assert.equal(h.head().activeSession.sid, next.sid); assert.deepEqual(h.pending(), []); assert.deepEqual(h.backend.results(), []);
  });

test('guest visiting a completed pending round abandons another round; old SID is rejected and return starts at group one',
  { skip: !process.env.YBS_WORKER_SOURCE }, async () => {
    const h=await fixture();let b=await h.client.start(5,2);
    for(let i=0;i<2;i++)b=await h.client.answer(5,2,h.solve(b));
    assert.equal(b.status,'pending');assert.equal(h.pending().length,1);h.advance();
    const first=await h.client.start(5,1),half=await h.client.answer(5,1,h.solve(first));
    assert.equal(half.question.slot,1);
    const completed=await h.client.start(5,2);assert.equal(completed.status,'pending');assert.equal(h.head().activeSession,null);h.advance();
    const old={course:'115-g9',classKey:'c901_1',cls:'901',seat:1,activity:5,round:1,sid:first.sid,requestId:'completed-obsolete-0001'};
    assert.equal((await h.raw('answer',{...old,seq:half.nextSeq,slot:half.question.slot,answer:h.solve(half)})).status,403);
    assert.equal((await h.raw('resume',old)).status,403);h.advance();
    const back=await h.client.start(5,1);assert.notEqual(back.sid,first.sid);assert.equal(back.question.slot,0);assert.equal(back.nextSeq,1);
    assert.equal(h.pending().length,1);assert.deepEqual(h.backend.results(),[]);
    assert.equal(h.head().guestWindows,undefined);
  });
