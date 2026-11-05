// 執行回歸腳本實際產生的預期運算；不啟動瀏覽器、不連 Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const result = spawnSync('python3', ['-c', String.raw`
import ast, json
from pathlib import Path
from datetime import datetime
path = Path('tools/dev/check-pages.py').resolve()
tree = ast.parse(path.read_text())
names = {'REDIRECTS', 'ROOT', 'TEST_NOW', 'TIME_CASES', 'PAGES'}
nodes = [n for n in tree.body if
    isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in n.targets)
    or isinstance(n, ast.FunctionDef) and n.name in {'page_of', 'lock_expectations'}]
namespace = dict(__file__=str(path), Path=Path, datetime=datetime)
exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)
class Page:
    clock = None
    def __init__(self):
        self.clock = self
    def set_fixed_time(self, now):
        self.now = now.isoformat()
    def evaluate(self, expression, paths):
        print(json.dumps(dict(now=self.now, expression=expression, paths=paths)))
class Context:
    def new_page(self):
        return Page()
    def close(self):
        pass
namespace['ctx_of'] = lambda b: Context()
namespace['lock_expectations'](None)
for _, now, _ in namespace['TIME_CASES']:
    namespace['lock_expectations'](None, now)
`], {encoding:'utf8', cwd:new URL('..', import.meta.url)});
assert.equal(result.status, 0, result.stderr);
const cases = result.stdout.trim().split('\n').map(line => {
  const {now, expression, paths} = JSON.parse(line);
  const DateAt = class extends Date {static now(){return Date.parse(now);}};
  const calculate = vm.runInNewContext(expression, {Date:DateAt, location:{pathname:'/'}});
  return {now, expected:calculate(paths)};
});

test('回歸預期共用正式日期與 OPEN；所有舊轉址落點都有預期', () => {
  const {now, expected} = cases[0];
  assert.equal(now, '2026-11-05T12:00:00+08:00');
  for (const path of ['u0-01', 'u1-01', 'u1-02', 'u1-03', 'u1-04'])
    assert.equal(expected[`115-g9/${path}/`], false, path);
  assert.equal(expected['115-g9/u2-03/'], true);
  assert.equal(Object.keys(expected).filter(path => path.startsWith('115-g9/u')).length, 30);
  for (const path of ['', 'about/', 'map/', '115-g9/', '115-g9/teacher/', '115-df/', '115-df/a/', '115-df/teacher/'])
    assert.equal(expected[path], false, path);
});

test('回歸頁面與預期使用相同固定時鐘：台灣週日門檻前後及 OPEN 提早開放', () => {
  assert.equal(cases[1].now, '2026-11-08T23:58:59+08:00');
  assert.equal(cases[1].expected['115-g9/u2-03/'], true);
  assert.equal(cases[2].now, '2026-11-08T23:59:00+08:00');
  assert.equal(cases[2].expected['115-g9/u2-03/'], false);
  assert.equal(cases[3].now, '2026-01-01T00:00:00+08:00');
  assert.equal(cases[3].expected['115-g9/u2-02/'], false);
  assert.equal(cases[3].expected['115-g9/u0-01/'], true);
});
