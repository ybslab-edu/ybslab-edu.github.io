import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  chmodSync, closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const gate = fileURLToPath(new URL('../scripts/review-gate.sh', import.meta.url));

// File-backed stdio：沙箱不需 child-process pipe，子程序 log 也不進測試輸出。
function capture(command, args, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ybs-review-process-'));
  const out = join(directory, 'stdout'), err = join(directory, 'stderr');
  const stdoutFd = openSync(out, 'w'), stderrFd = openSync(err, 'w');
  try {
    const result = spawnSync(command, args, {...options, stdio: ['ignore', stdoutFd, stderrFd]});
    return {...result, stdout: readFileSync(out, 'utf8'), stderr: readFileSync(err, 'utf8')};
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
    rmSync(directory, {recursive: true, force: true});
  }
}

const fixtureEnv = {...process.env};
for (const key of Object.keys(fixtureEnv)) {
  if (key.startsWith('GIT_')) delete fixtureEnv[key];
}
Object.assign(fixtureEnv, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Review Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Review Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid'
});

function fixture(t, {scope = '**\n', files = {}} = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'ybs-review-gate-'));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const repo = join(temporary, 'repo');
  mkdirSync(repo);
  const write = (path, content) => {
    mkdirSync(dirname(join(repo, path)), {recursive: true});
    writeFileSync(join(repo, path), content);
  };
  const git = (...args) => {
    const result = capture('git', args, {cwd: repo, env: fixtureEnv});
    assert.equal(result.status, 0, '暫存 Git 操作失敗');
    return result.stdout.trim();
  };
  git('init', '--quiet', '--initial-branch=work');
  write('scripts/review-gate.sh', '');
  copyFileSync(gate, join(repo, 'scripts/review-gate.sh'));
  for (const [path, content] of Object.entries(files)) write(path, content);
  // 僅在暫存 repo 用 plumbing 建立歷史；不執行 git commit / push，不讀使用者身分。
  const snapshot = () => {
    git('add', '--all');
    const tree = git('write-tree');
    const head = capture('git', ['rev-parse', '--verify', 'HEAD'], {cwd: repo, env: fixtureEnv});
    const parent = head.status === 0 ? ['-p', head.stdout.trim()] : [];
    const sha = git('commit-tree', tree, ...parent, '-m', 'temporary fixture');
    git('update-ref', 'refs/heads/work', sha);
    return sha;
  };
  git('update-ref', 'refs/heads/base', snapshot());
  const scopeFile = join(temporary, 'scope.txt');
  writeFileSync(scopeFile, scope);
  const run = ({env = {}, args = ['base', scopeFile], cwd = repo, steps = false} = {}) => {
    const script = join(repo, 'scripts/review-gate.sh');
    // 所有子程序一律 skip=1。編排測試僅載入函式，使用隔離 command stubs；
    // 不進正式入口、不遞迴呼叫真實 Node / 全站測試，也沒有可繞過 gate 的環境開關。
    const commandArgs = steps
      ? ['-c', 'source "$1"; setup_gate "$2" "$3"; run_test_steps; review_diff; finish_gate',
        'stub-orchestration', script, ...args]
      : [script, ...args];
    const result = capture('bash', commandArgs, {
      cwd, timeout: 30000,
      env: {...fixtureEnv, ...env, REVIEW_GATE_SKIP_TESTS: '1'}
    });
    assert.ifError(result.error);
    return result;
  };
  return {repo, temporary, write, git, snapshot, scopeFile, run};
}

function summary(result, status = 1, conclusion = '需要審查') {
  assert.equal(result.status, status);
  assert.equal(result.stderr, '', '完整 log 不可寫到 stderr');
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 9, '摘要固定 9 行，符合 10 行上限');
  assert.equal(lines.at(-1), conclusion);
  assert.ok(lines.slice(0, 7).every(line => /^(通過|異常|略過) /.test(line)));
  assert.ok(lines.at(-2).startsWith('log：'));
  const logDir = lines.at(-2).slice('log：'.length);
  assert.ok(existsSync(logDir));
  assert.equal(readFileSync(join(logDir, 'summary.log'), 'utf8'), result.stdout);
  return {lines, logDir};
}

test('skip 必需審查；scope 註解、空行、精確路徑、*、**；log 不產生未追蹤檔', t => {
  const f = fixture(t, {scope: '# 說明\n\nallowed/*.txt\n./nested/**/?.md\nexact.txt\n'});
  for (const path of ['allowed/one.txt', 'nested/a.md', 'nested/deep/b.md', 'exact.txt']) {
    f.write(path, 'safe\n');
  }
  const before = f.git('status', '--porcelain', '--untracked-files=all');
  const {lines, logDir} = summary(f.run());
  assert.ok(lines.slice(0, 5).every(line => line.startsWith('通過')));
  assert.ok(lines.slice(5, 7).every(line => line.startsWith('略過')));
  assert.ok(logDir.startsWith(join(f.repo, '.git/review-gate') + '/'));
  assert.ok(existsSync(join(logDir, 'run.log')));
  assert.equal(f.git('status', '--porcelain', '--untracked-files=all'), before);
  assert.equal(readdirSync(join(f.repo, '.git/review-gate')).length, 1);
});

// 五類異常各自驗證；secret 另以所有規則的合成資料獨立驗證。
for (const [name, path, rule, scope] of [
  ['超出範圍', 'outside/file.txt', 'scope', 'allowed/**\n'],
  ['Firestore Rules', 'firestore.rules', 'firestore-rules', '**\n'],
  ['套件清單', 'package.json', 'package-files', '**\n'],
  ['套件鎖定檔', 'nested/package-lock.json', 'package-files', '**\n'],
  ['workflow', '.github/workflows/fixture.yml', 'workflows', '**\n']
]) {
  test(`${name} 必須標異常`, t => {
    const f = fixture(t, {scope});
    f.write(path, 'safe fixture\n');
    const {lines} = summary(f.run());
    assert.ok(lines.some(line => line.startsWith(`異常 [${rule}]`) && line.includes(path)));
  });
}

test('既存及忽略的 firestore.rules 出現即異常', t => {
  const f = fixture(t, {files: {'firestore.rules': 'safe\n'}});
  assert.match(summary(f.run()).lines[1], /^異常 \[firestore-rules\]/);
  rmSync(join(f.repo, 'firestore.rules'));
  f.snapshot();
  f.write('.git/info/exclude', 'firestore.rules\n');
  f.write('firestore.rules', 'ignored fixture\n');
  assert.match(summary(f.run()).lines[1], /^異常 \[firestore-rules\]/);
});

test('secret 所有規則標異常；stdout、stderr、摘要及 diff 報告皆不洩漏內容', t => {
  const f = fixture(t);
  // 全為合成資料；分段組合，避免測試原始碼本身看起來像憑證。
  const examples = [
    ['private-key-header', ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join('')],
    ['private-key-header', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
    ['google-api-key', ['AI', 'za', 'x'.repeat(35)].join('')],
    ['github-token', ['gh', 'p_', 'x'.repeat(36)].join('')],
    ['github-token', ['github_', 'pat_', 'x'.repeat(40)].join('')],
    ['openai-key', ['sk', '-', 'x'.repeat(40)].join('')],
    ['aws-access-key', ['AK', 'IA', 'X'.repeat(16)].join('')],
    ['json-private-key', JSON.stringify({[['private', 'key'].join('_')]: 'synthetic fixture value'})],
    ...['password', 'token', 'secret', 'API_TOKEN', 'clientSecret'].map(name =>
      ['credential-assignment', `${name} = "${'x'.repeat(24)}"`]),
    ['credential-assignment', `TOKEN=${'x'.repeat(24)}`],
    ['openai-key', ['++sk', '-', 'z'.repeat(30)].join('')]
  ];
  for (const [index, [, content]] of examples.entries()) f.write(`allowed/key-${index}.txt`, `${content}\n`);
  const result = f.run();
  const {lines, logDir} = summary(result);
  const secretLine = lines.find(line => line.startsWith('異常 [secrets]'));
  assert.ok(secretLine);
  for (const [index, [rule, content]] of examples.entries()) {
    assert.ok(secretLine.includes(`"allowed/key-${index}.txt" [${rule}]`));
    for (const output of [result.stdout, result.stderr,
      readFileSync(join(logDir, 'summary.log'), 'utf8'), readFileSync(join(logDir, 'diff.log'), 'utf8')]) {
      assert.equal(output.includes(content), false, '不可洩漏合成 secret');
    }
  }
});

test('分支 diff、staged、unstaged、未追蹤、刪除與改名均檢查', t => {
  const f = fixture(t, {scope: 'allowed/**\n', files: {
    'staged.txt': 'before\n', 'unstaged.txt': 'before\n', 'deleted.txt': 'before\n',
    'firestore.rules': 'safe fixture\n'
  }});
  f.write('branch.txt', 'committed fixture\n');
  f.snapshot();
  f.write('staged.txt', 'staged fixture\n');
  f.git('add', 'staged.txt');
  f.write('unstaged.txt', 'unstaged fixture\n');
  f.write('untracked.txt', 'untracked fixture\n');
  rmSync(join(f.repo, 'deleted.txt'));
  mkdirSync(join(f.repo, 'allowed'));
  f.git('mv', 'firestore.rules', 'allowed/moved.txt');
  const {lines} = summary(f.run());
  const scopeLine = lines.find(line => line.startsWith('異常 [scope]'));
  for (const path of ['branch.txt', 'staged.txt', 'unstaged.txt', 'untracked.txt', 'deleted.txt', 'firestore.rules']) {
    assert.ok(scopeLine.includes(`"${path}"`), path);
  }
  assert.ok(lines.some(line => line.startsWith('異常 [firestore-rules]')));
});

test('使用三點 diff，基準分支獨有的變更不算 HEAD 變更', t => {
  const f = fixture(t, {scope: 'allowed/**\n'});
  const original = f.git('rev-parse', 'HEAD');
  f.write('base-only.txt', 'base branch fixture\n');
  const base = f.snapshot();
  f.git('update-ref', 'refs/heads/base', base);
  f.git('reset', '--hard', original);
  f.write('allowed/head.txt', 'head fixture\n');
  f.snapshot();
  assert.equal(summary(f.run()).lines[0], '通過 [scope]');
});

test('分開掃描三層新增行，不被相反修改、binary 或 Git 色彩掩蓋', t => {
  const f = fixture(t, {files: {'allowed/change.txt': 'before\n'}});
  const synthetic = ['sk', '-', 'z'.repeat(32)].join('');
  f.write('allowed/branch.txt', `${synthetic}\n`);
  f.snapshot();
  f.write('allowed/change.txt', `${synthetic}\n`);
  f.git('add', 'allowed/change.txt');
  f.write('allowed/change.txt', 'before\n');
  f.write('allowed/binary.dat', Buffer.from(`\0${synthetic}\n`));
  f.git('add', 'allowed/binary.dat');
  f.git('config', 'color.ui', 'always');
  const {lines} = summary(f.run());
  for (const path of ['allowed/branch.txt', 'allowed/change.txt', 'allowed/binary.dat']) {
    assert.ok(lines[4].includes(`"${path}" [openai-key]`));
  }
  assert.equal(lines.join('\n').includes(synthetic), false);
});

test('既有及刪除 secret 不算新增；* 不跨目錄；特殊檔名保持單行', t => {
  const oldValue = ['sk', '-', 'z'.repeat(32)].join('');
  const f = fixture(t, {scope: 'allowed/*.txt\n', files: {
    'allowed/old.txt': `${oldValue}\nbefore\n`, 'allowed/delete.txt': `${oldValue}\n`
  }});
  f.write('allowed/old.txt', `${oldValue}\nafter\n`);
  rmSync(join(f.repo, 'allowed/delete.txt'));
  f.write('allowed/deep/no.txt', 'safe\n');
  f.write('outside/line\nbreak\x1b.txt', 'safe\n');
  const {lines} = summary(f.run());
  assert.match(lines[0], /^異常 \[scope\].*allowed\/deep\/no\.txt/);
  assert.ok(lines[0].includes('outside/line\\nbreak\\u001b.txt'));
  assert.equal(lines[4], '通過 [secrets]');
});

test('未追蹤 symlink 只讀取 link 本身', t => {
  const f = fixture(t);
  const external = join(f.temporary, 'external.txt');
  writeFileSync(external, ['sk', '-', 'z'.repeat(32)].join(''));
  symlinkSync(external, join(f.repo, 'external-link'));
  assert.equal(summary(f.run()).lines[4], '通過 [secrets]');
});

test('參數缺少、過多、基準分支或範圍檔不存在：用法與 exit 2', t => {
  const f = fixture(t);
  for (const args of [[], ['base'], ['missing-base', f.scopeFile],
    ['base', join(f.temporary, 'missing-scope')], ['base', f.repo], ['base', f.scopeFile, 'extra']]) {
    const result = f.run({args});
    assert.equal(result.status, 2);
    assert.match(result.stderr, /用法：scripts\/review-gate\.sh <基準分支> <範圍檔>/);
    assert.equal(result.stdout, '');
  }
  assert.equal(existsSync(join(f.repo, '.git/review-gate')), false);
});

test('diff 失敗需審查，錯誤只留在 log', t => {
  const f = fixture(t);
  writeFileSync(f.scopeFile, Buffer.from([0xff]));
  const {lines, logDir} = summary(f.run());
  assert.ok(lines.slice(0, 5).every(line => line.startsWith('異常') && line.includes('[diff-scan]')));
  assert.equal(readFileSync(join(logDir, 'diff-errors.log'), 'utf8'), 'diff-scan failed\n');
});

test('缺少 Python 不可把 diff 檢查當通過，診斷只留在 log', t => {
  const f = fixture(t, {files: {'fixture-bin/python3': '#!/bin/sh\necho synthetic-runtime-missing >&2\nexit 127\n'}});
  chmodSync(join(f.repo, 'fixture-bin/python3'), 0o755);
  const result = f.run({env: {PATH: `${join(f.repo, 'fixture-bin')}:${process.env.PATH}`}});
  const {lines, logDir} = summary(result);
  assert.ok(lines.slice(0, 5).every(line => line.startsWith('異常') && line.includes('[diff-scan]')));
  assert.equal(result.stdout.includes('synthetic-runtime-missing'), false);
  assert.ok(readFileSync(join(logDir, 'diff-errors.log'), 'utf8').includes('synthetic-runtime-missing'));
});

const pythonResult = capture('python3', ['-I', '-c', 'import sys; print(sys.executable)']);
assert.equal(pythonResult.status, 0, '測試需要既有 Python 3');
const python = pythonResult.stdout.trim();

function runnerFixtures() {
  const common = `#!${python}
import json, os, sys
from pathlib import Path
config = json.loads(Path('.git/fixture.json').read_text())
def trace(name):
    with Path('.git/trace').open('a') as out:
        out.write(name + '\\n')
def clean_environment(browser=False):
    for name in ('NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'PYTHONPATH', 'YBS_INJECTED_FLAG', 'HTTPS_PROXY'):
        assert name not in os.environ, name
    assert os.environ['REVIEW_GATE_SKIP_TESTS'] == '1'
    assert os.environ['YBS_TEACHER_CODE'] == ''
    assert os.environ['PLAYWRIGHT_MODULE'] == '/fixture/playwright/index.mjs'
    assert os.environ['PLAYWRIGHT_BROWSERS_PATH'] == '/fixture/browsers'
    if not browser:
        assert 'YBS_BASE' not in os.environ
def logs():
    print(config['privateLog'])
    print(config['privateLog'], file=sys.stderr)
`;
  return {
    'index.html': 'fixture root',
    'tests/fixture.test.mjs': 'stub only; must never be executed by real Node\n',
    'fixture-bin/node': `${common}
clean_environment()
args = sys.argv[1:]
if args == ['--test', 'tests/fixture.test.mjs']:
    name = 'node-tests'
elif args == ['tests/df-report.test.cjs']:
    name = 'df-report'
elif args == ['tests/df-teacher-cloud.test.cjs']:
    name = 'df-teacher-cloud'
else:
    raise AssertionError('unexpected Node command')
trace(name)
logs()
sys.exit(config.get(name, 0))
`,
    'fixture-bin/python3': `${common}
import signal, time
args = sys.argv[1:]
if args and args[0] == '-u':
    args = args[1:]
if len(args) == 3 and args[0] == '-' and args[1].endswith('/server.port') and config['fakeHttp']:
    port = Path(args[1])
    if Path(args[2]).is_dir():
        clean_environment()
        if config.get('server-failure'):
            logs()
            sys.exit(7)
        port.with_suffix('.pid').write_text(str(os.getpid()))
        port.write_text('49123')
        signal.pause()
    else:
        for _ in range(50):
            try:
                os.kill(int(args[2]), 0)
                print(int(port.read_text()))
                sys.exit(0)
            except (OSError, ValueError):
                time.sleep(0.01)
        sys.exit(1)
elif args == ['tools/dev/check-pages.py']:
    clean_environment(browser=True)
    trace('check-pages')
    logs()
    url = os.environ['YBS_BASE']
    assert url.startswith('http://127.0.0.1:') and url.endswith('/')
    assert 0 < int(url.rsplit(':', 1)[1][:-1]) < 65536
    if not config['fakeHttp']:
        from urllib.request import urlopen
        with urlopen(url) as response:
            assert response.read() == b'fixture root'
    Path('.git/preview-url').write_text(url)
    if config.get('interrupt'):
        os.kill(os.getppid(), signal.SIGTERM)
    sys.exit(config.get('check-pages', 0))
else:
    os.execv(sys.executable, [sys.executable, *sys.argv[1:]])
`
  };
}

function orchestration(t, settings = {}) {
  const f = fixture(t, {files: runnerFixtures()});
  for (const name of ['node', 'python3']) chmodSync(join(f.repo, 'fixture-bin', name), 0o755);
  // 權限屬於測試 fixture，先納入暫存歷史，避免影響工作目錄乾淨檢查。
  f.snapshot();
  const privateLog = ['synthetic private log ', 'z'.repeat(40)].join('');
  f.write('.git/fixture.json', JSON.stringify({privateLog, fakeHttp: true, ...settings}));
  const env = {
    PATH: `${join(f.repo, 'fixture-bin')}:${process.env.PATH}`,
    NODE_OPTIONS: '--unhandled-rejections=warn', NODE_TEST_CONTEXT: 'child-v8',
    PYTHONPATH: '/fixture/unneeded', YBS_INJECTED_FLAG: '1', HTTPS_PROXY: 'https://fixture.invalid',
    YBS_BASE: 'https://fixture.invalid/', YBS_TEACHER_CODE: 'synthetic teacher fixture',
    PLAYWRIGHT_MODULE: '/fixture/playwright/index.mjs', PLAYWRIGHT_BROWSERS_PATH: '/fixture/browsers'
  };
  return {...f, privateLog, env};
}

function assertServerStopped(logDir, fakeHttp = true) {
  if (fakeHttp) {
    const pid = Number(readFileSync(join(logDir, 'server.pid'), 'ascii'));
    assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'}, '服務必須已清理');
  } else {
    const port = readFileSync(join(logDir, 'server.port'), 'ascii');
    const result = capture(python, ['-I', '-c',
      'import socket, sys; s = socket.socket(); s.settimeout(0.5); sys.exit(0 if s.connect_ex(("127.0.0.1", int(sys.argv[1]))) != 0 else 1)', port]);
    assert.equal(result.status, 0, 'HTTP 服務必須已清理');
  }
}

for (const [name, settings, node, browser] of [
  ['全過', {}, '通過', '通過'],
  ['Node acceptance 失敗', {'node-tests': 7}, '異常', '通過'],
  ['報告格式失敗', {'df-report': 8}, '異常', '通過'],
  ['教師雲端失敗', {'df-teacher-cloud': 9}, '異常', '通過'],
  ['Node 環境缺少', {'node-tests': 127, 'df-report': 127, 'df-teacher-cloud': 127}, '異常', '通過'],
  ['瀏覽器失敗', {'check-pages': 10}, '通過', '異常'],
  ['瀏覽器環境缺少', {'check-pages': 127}, '通過', '異常']
]) {
  test(`stub 編排：${name}；完整 log 留存、摘要不洩漏、服務清理`, t => {
    const f = orchestration(t, settings);
    const before = f.git('status', '--porcelain', '--untracked-files=all');
    const result = f.run({steps: true, env: f.env});
    const passed = node === '通過' && browser === '通過';
    const {lines, logDir} = summary(result, passed ? 0 : 1, passed ? '可開 PR' : '需要審查');
    assert.ok(lines.slice(0, 5).every(line => line.startsWith('通過')));
    assert.deepEqual(lines.slice(5, 7).map(line => line.split(' ')[0]), [node, browser]);
    for (const output of [result.stdout, result.stderr, readFileSync(join(logDir, 'summary.log'), 'utf8')]) {
      assert.equal(output.includes(f.privateLog), false, '失敗摘要也不可洩漏 log 內容');
    }
    for (const file of ['node-tests.log', 'df-report.log', 'df-teacher-cloud.log', 'browser.log']) {
      assert.ok(readFileSync(join(logDir, file), 'utf8').includes(f.privateLog));
    }
    assert.deepEqual(readFileSync(join(f.repo, '.git/trace'), 'utf8').trim().split('\n'),
      ['node-tests', 'df-report', 'df-teacher-cloud', 'check-pages']);
    assert.equal(f.git('status', '--porcelain', '--untracked-files=all'), before);
    assertServerStopped(logDir);
  });
}

test('HTTP server 啟動失敗必須異常，log 不外洩', t => {
  const f = orchestration(t, {'server-failure': true});
  const result = f.run({steps: true, env: f.env});
  const {lines, logDir} = summary(result);
  assert.match(lines[6], /^異常 瀏覽器/);
  assert.equal(result.stdout.includes(f.privateLog), false);
  assert.ok(readFileSync(join(logDir, 'server.log'), 'utf8').includes(f.privateLog));
  assert.equal(existsSync(join(f.repo, '.git/preview-url')), false);
});

test('執行中收到 TERM 時，由 EXIT trap 清理服務', t => {
  const f = orchestration(t, {interrupt: true});
  const result = f.run({steps: true, env: f.env});
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '異常 執行中斷 [signal]');
  assert.equal(lines.at(-1), '需要審查');
  const logDir = lines[1].slice('log：'.length);
  assert.equal(readFileSync(join(logDir, 'summary.log'), 'utf8'), result.stdout);
  assertServerStopped(logDir);
});

test('正式入口 skip=1 即使 stub 全過也必須略過並需要審查', t => {
  const f = orchestration(t);
  const {lines} = summary(f.run({env: f.env}));
  assert.ok(lines.slice(5, 7).every(line => line.startsWith('略過')));
  assert.equal(existsSync(join(f.repo, '.git/trace')), false);
});

const httpProbe = capture(python, ['-I', '-c', 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); s.close()']);
test('環境允許時以真實 http.server 驗證隨機埠、repo 根目錄與服務清理', {
  skip: httpProbe.status === 0 ? false : '沙箱禁止本機 socket binding；真實瀏覽器由派工視窗實測'
}, t => {
  const f = orchestration(t, {fakeHttp: false});
  const {logDir} = summary(f.run({steps: true, env: f.env}), 0, '可開 PR');
  assertServerStopped(logDir, false);
});

test('無法建立 log 必須異常', t => {
  const f = fixture(t);
  f.write('.git/review-gate', 'obstruction');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '異常 完整 log [log-storage]\n需要審查\n');
  assert.equal(result.stderr, '');
});

test('linked worktree 的 log 存共用 Git 目錄，子目錄可傳入相對範圍檔', t => {
  const f = fixture(t);
  const linked = join(f.temporary, 'linked');
  f.git('worktree', 'add', '--detach', linked, 'HEAD');
  const {logDir} = summary(f.run({cwd: join(linked, 'scripts'), args: ['base', '../../scope.txt']}));
  assert.ok(logDir.startsWith(join(f.repo, '.git/review-gate') + '/'));
  assert.equal(f.git('-C', linked, 'status', '--porcelain'), '');
});
