import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {checkConfig} from '../assets/fullrev-client.mjs';

const source = readFileSync(new URL('../assets/fullrev-config.js', import.meta.url), 'utf8');
const login = readFileSync(new URL('../assets/login.js', import.meta.url), 'utf8');
const context = vm.createContext({URL});
vm.runInContext(source + ';globalThis.parse = parseYbsFullrevConfig;globalThis.config = YBS_FULLREV_CONFIG;', context);
const parse = context.parse;
const valid = () => ({
  enabled: true,
  courses: ['115-g9'],
  firebase: {projectId: 'synthetic-ybs-guard', apiKey: 'synthetic-public-key', messagingSenderId: '1234567890'},
  workerOrigin: 'https://synthetic-guard.account.workers.dev',
  readModelModule: '/assets/fullrev-read-model.mjs'
});
const json = value => JSON.parse(JSON.stringify(value));
const rejects = value => {
  assert.equal(parse(value), null, JSON.stringify(value));
  assert.throws(() => checkConfig(parse(value)), {code: 'configuration-pending'});
};

test('預設開關及空白部署值保持不變，URL 與儲存區不能覆寫', () => {
  const c = vm.createContext({
    location: {href: 'https://synthetic.invalid/?fullrev=true', search: '?fullrev=true'},
    get localStorage() { throw Error('不得讀取儲存區'); },
    get sessionStorage() { throw Error('不得讀取儲存區'); }
  });
  vm.runInContext(source + ';globalThis.config = YBS_FULLREV_CONFIG;', c);
  assert.deepEqual(json(c.config), {
    enabled: false, studentGoogleLogin: false, answerTickets: true, courses: ['115-g9'], firebase: {projectId: '', apiKey: '', messagingSenderId: ''},
    workerOrigin: '', readModelModule: ''
  });
  assert.ok(Object.isFrozen(c.config));
  assert.ok(Object.isFrozen(c.config.courses));
  assert.ok(Object.isFrozen(c.config.firebase));
  assert.throws(() => checkConfig(c.config), {code: 'configuration-pending'});
});

test('正常公開設定可啟用，複製並凍結巢狀欄位，不修改輸入', () => {
  const input = valid(), result = parse(input);
  assert.deepEqual(json(result), input);
  assert.equal(checkConfig(result), input.firebase.projectId);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.firebase));
  assert.ok(Object.isFrozen(result.courses));
  input.firebase.projectId = 'changed-project'; input.courses[0] = '115-df';
  assert.equal(result.firebase.projectId, 'synthetic-ybs-guard');
  assert.deepEqual(json(result.courses), ['115-g9']);
  for (const key of ['studentGoogleLogin', 'answerTickets']) {
    for (const value of [true, false]) assert.equal(parse({...valid(), [key]: value})[key], value);
    for (const value of [null, 0, 1, 'true', 'false', {}]) rejects({...valid(), [key]: value});
  }
  const optional = valid(); delete optional.courses; delete optional.firebase.messagingSenderId;
  assert.deepEqual(json(parse(optional).courses), ['115-g9']);
  for (const apiKey of ['a'.repeat(8), 'a'.repeat(256)]) {
    assert.ok(parse({...valid(), firebase: {...valid().firebase, apiKey}}));
  }
  for (const projectId of ['a1234b', 'a' + 'b'.repeat(28) + 'c']) {
    assert.ok(parse({...valid(), firebase: {...valid().firebase, projectId}}));
  }
  assert.ok(parse({...valid(), workerOrigin: 'https://synthetic.workers.dev'}));
});

test('缺漏、型別、非嚴格布林與額外欄位 fail closed', () => {
  for (const input of [undefined, null, true, '', [], {}, {enabled: false}]) rejects(input);
  for (const enabled of [undefined, null, 0, 1, 'true', 'false', {}]) rejects({...valid(), enabled});
  for (const field of ['firebase', 'workerOrigin', 'readModelModule']) {
    for (const value of [undefined, null, '', 42, true, [], {}]) rejects({...valid(), [field]: value});
  }
  for (const field of ['projectId', 'apiKey']) {
    for (const value of [undefined, null, '', 42, true, [], {}]) rejects({...valid(), firebase: {...valid().firebase, [field]: value}});
  }
  rejects({...valid(), privateKey: 'synthetic-forbidden'});
  rejects({...valid(), firebase: {...valid().firebase, privateKey: 'synthetic-forbidden'}});
  const disabled = {...valid(), enabled: false};
  assert.deepEqual(json(parse(disabled)), disabled);
});

test('專案、公開金鑰與 sender 佔位值及邊界拒絕', () => {
  for (const projectId of ['class-score-86020', 'classscore-test', 'synthetic-pilot', 'demo-synthetic', 'replace-project',
    'placeholder-project', 'your-project', 'changeme-project', 'todo-project', 'a123b', 'a'.repeat(31), 'Uppercase-project', '-synthetic', 'synthetic-', ' synthetic-ybs']) {
    rejects({...valid(), firebase: {...valid().firebase, projectId}});
  }
  for (const apiKey of ['REPLACE_WITH_PUBLIC_KEY', 'replace_with_public_key', 'PLACEHOLDER', 'YOUR_API_KEY', 'CHANGE_ME', 'changeme',
    'TODO_KEY', '<public-key>', 'a'.repeat(7), 'a'.repeat(257), ' key-with-space', 'key.with.dot']) {
    rejects({...valid(), firebase: {...valid().firebase, apiKey}});
  }
  for (const messagingSenderId of ['', null, 123, true, {}, 'REPLACE_WITH_SENDER_ID', '123abc', ' 123', '1'.repeat(21)]) {
    rejects({...valid(), firebase: {...valid().firebase, messagingSenderId}});
  }
  for (const messagingSenderId of ['0', '1'.repeat(20)]) assert.ok(parse({...valid(), firebase: {...valid().firebase, messagingSenderId}}));
});

test('Worker 必須是無路徑、驗證資訊或連接埠的標準 HTTPS workers.dev origin', () => {
  for (const workerOrigin of [
    'http://synthetic.workers.dev', '//synthetic.workers.dev', 'https://workers.dev', 'https://evil.invalid',
    'https://synthetic.workers.dev.evil.invalid', 'https://evilworkers.dev',
    'https://synthetic.workers.dev/', 'https://synthetic.workers.dev/path', 'https://synthetic.workers.dev/..',
    'https://synthetic.workers.dev?x=1', 'https://synthetic.workers.dev?', 'https://synthetic.workers.dev#x', 'https://synthetic.workers.dev#',
    'https://user:pass@synthetic.workers.dev', 'https://user@synthetic.workers.dev',
    'https://synthetic.workers.dev:443', 'https://synthetic.workers.dev:8443',
    'https://SYNTHETIC.workers.dev', ' https://synthetic.workers.dev', 'https://synthetic.workers.dev\n',
    'https://synthetic.workers.dev.', 'https://bad_label.workers.dev', 'https://-bad.workers.dev',
    'https://bad-.workers.dev', 'https://bad..workers.dev', 'https://' + 'a'.repeat(64) + '.workers.dev',
    'https://REPLACE_WITH_WORKER.workers.dev', 'https://placeholder.workers.dev', 'https://your-worker.workers.dev'
  ]) rejects({...valid(), workerOrigin});
});

test('課程只接受單一 115-g9；讀取 adapter 固定同源模組', () => {
  for (const courses of [null, '115-g9', {}, [], ['115-df'], ['unsupported'], ['115-g9', '115-df'], ['115-g9', '115-g9'], ['115-G9'], [null]]) {
    rejects({...valid(), courses});
  }
  for (const readModelModule of ['', 'https://synthetic.invalid/assets/fullrev-read-model.mjs', '//synthetic.invalid/adapter.mjs',
    '/assets/other.mjs', '/assets/fullrev-read-model.mjs?x=1', '/assets/../assets/fullrev-read-model.mjs']) rejects({...valid(), readModelModule});
});

test('只翻開預設開關仍然拒絕；無效設定不啟動舊登入或雲端', async () => {
  const c = vm.createContext({URL, Promise, location: {pathname: '/115-g9/'}});
  vm.runInContext(source.replace('enabled: false', 'enabled: true') + ';globalThis.config = YBS_FULLREV_CONFIG;', c);
  assert.equal(c.config, null);
  vm.runInContext(login + ';globalThis.api = YBS;', c);
  assert.equal(c.api.fullrev, true);
  assert.equal(c.api.submit(), false);
  assert.equal(c.api.flushGuest(), false);
  await assert.rejects(c.api.firebaseSession(), {code: 'configuration-pending'});
});
