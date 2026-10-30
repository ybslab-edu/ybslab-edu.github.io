import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {assetReferences, htmlFiles, root, setAssetVersion} from '../tools/set-asset-version.mjs';

function versionErrors(siteRoot) {
  const versions = new Map();
  const errors = [];
  for (const file of htmlFiles(siteRoot)) {
    for (const {asset, version} of assetReferences(readFileSync(file, 'utf8'), file, siteRoot)) {
      const location = `${relative(siteRoot, file)}: ${asset}?v=${version}`;
      if (!version) errors.push(`版本為空：${location}`);
      if (!statSync(resolve(siteRoot, asset), {throwIfNoEntry:false})?.isFile()) errors.push(`檔案不存在：${location}`);
      if (!versions.has(asset)) versions.set(asset, new Map());
      const values = versions.get(asset);
      if (!values.has(version)) values.set(version, []);
      values.get(version).push(relative(siteRoot, file));
    }
  }
  assert.ok(versions.size > 0, '必須實際找到資源引用');
  for (const [asset, values] of versions) {
    if (values.size > 1) errors.push(`${asset} 版本不一致：\n${[...values].map(([v,files])=>`  ${v}: ${files.join(', ')}`).join('\n')}`);
  }
  return errors;
}

test('全站 HTML：每個 assets 資源的 ?v= 只有一個非空版本，且檔案存在', () => {
  assert.deepEqual(versionErrors(root), []);
});

test('反例：註解、inline JS 與非資源屬性的範例不被修改或誤報', t => {
  const site = mkdtempSync(join(tmpdir(), 'ybs-asset-examples-'));
  t.after(()=>rmSync(site, {recursive:true, force:true}));
  mkdirSync(join(site, 'assets'));
  writeFileSync(join(site, 'assets/login.js'), '// synthetic');
  const examples = `<!-- "assets/login.js?v=comment" <script src="assets/missing.js?v=comment"></script> -->
<script>
const url = "assets/login.js?v=inline";
const markup = '<link href="assets/missing.js?v=inline">';
</script>
<script src="assets/login.js?v=old">const url = 'assets/login.js?v=body';</script>
<div data-example="assets/missing.js?v=data" title='<script src="assets/missing.js?v=title"></script>'></div>
<textarea><link href="assets/missing.js?v=textarea"></textarea>
<style>/* <script src="assets/missing.js?v=style"></script> */</style>`;
  const real = '<SCRIPT data-src="assets/missing.js?v=data-src" SRC = assets/login.js?v=old></SCRIPT>';
  const html = examples + '\n' + real;
  const file = join(site, 'index.html');
  writeFileSync(file, html);
  assert.deepEqual(assetReferences(html, file, site).map(({asset,version})=>[asset,version]), [
    ['assets/login.js','old'], ['assets/login.js','old']
  ]);
  assert.deepEqual(versionErrors(site), [], '範例的不同版本及不存在檔案不得誤報');
  const reports = [];
  assert.equal(setAssetVersion(['login.js','new','--check'], site, line=>reports.push(line)), 1);
  assert.equal(reports.length, 2);
  assert.equal(readFileSync(file, 'utf8'), html);
  assert.equal(setAssetVersion(['login.js','new'], site, ()=>{}), 0);
  const expected = examples.replace('src="assets/login.js?v=old"', 'src="assets/login.js?v=new"') + '\n' + real.replace('SRC = assets/login.js?v=old', 'SRC = assets/login.js?v=new');
  assert.equal(readFileSync(file, 'utf8'), expected, '逐字保留註解、腳本文字及其他屬性');
  assert.deepEqual(versionErrors(site), []);
  assert.equal(setAssetVersion(['login.js','new','--check'], site, ()=>assert.fail('範例不可列入差異')), 0);
  writeFileSync(file, expected + '<script src="assets/login.js?v=other"></script>');
  assert.ok(versionErrors(site).some(error=>error.includes('版本不一致')), '真正的不同版本仍須失敗');
  writeFileSync(file, expected + '<link href="assets/missing.css?v=1">');
  assert.ok(versionErrors(site).some(error=>error.includes('檔案不存在')), '真正的缺檔仍須失敗');
});

test('資源辨識：相對／絕對路徑、JS／CSS、子目錄，忽略外站與未帶版本的引用', () => {
  const html = `<script src="../../assets/login.js?v=old"></script>
<link href='/assets/shell.css?v=2&amp;x=1#top'>
<script src="/assets/vendor/example.js?v=3"></script>
<script src="https://example.invalid/assets/login.js?v=external"></script>
<script src="//example.invalid/assets/login.js?v=external"></script>
<script src="/assets/login.js"></script>
<script src="/other/login.js?v=other"></script>`;
  const refs = assetReferences(html, resolve(root, 'course/activity/index.html'));
  assert.deepEqual(refs.map(({asset,version})=>[asset,version]), [
    ['assets/login.js','old'], ['assets/shell.css','2'], ['assets/vendor/example.js','3']
  ]);
  for (const ref of refs) assert.equal(html.slice(ref.start, ref.end), ref.version);
});

test('工具：--check 不寫入、更新僅改指定版本、重跑不變、錯誤輸入不改檔', t => {
  const site = mkdtempSync(join(tmpdir(), 'ybs-asset-versions-'));
  t.after(()=>rmSync(site, {recursive:true, force:true}));
  const put = (path, content) => {
    mkdirSync(dirname(join(site, path)), {recursive:true});
    writeFileSync(join(site, path), content);
  };
  put('assets/login.js', '// synthetic');
  put('assets/unused.js', '// synthetic');
  put('assets/shell.css', '/* synthetic */');
  const original = '\uFEFF<script src="assets/login.js?v=old&amp;x=1#top"></script>\r\n<link href="assets/shell.css?v=2">\r\n';
  const nested = "<script src='../../assets/login.js?v=old'></script><script src='/assets/login.js?v=new'></script>";
  const redirect = '<meta http-equiv="refresh" content="0;url=../u1-01/">';
  put('index.html', original);
  put('course/activity/index.html', nested);
  put('course/w01/index.html', redirect);
  const run = (...args) => {
    const output = [];
    const status = setAssetVersion(args, site, line=>output.push(line));
    return {status, stdout:output.join('\n')};
  };
  const read = path => readFileSync(join(site, path), 'utf8');
  const check = run('login.js', 'new', '--check');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /index\.html: assets\/login\.js\?v=old → new/);
  assert.equal((check.stdout.match(/→ new/g) || []).length, 2);
  assert.equal(read('index.html'), original);
  assert.equal(read('course/activity/index.html'), nested);
  const update = run('login.js', 'new');
  assert.equal(update.status, 0);
  assert.equal(read('index.html'), original.replace('?v=old', '?v=new'));
  assert.equal(read('course/activity/index.html'), nested.replace('?v=old', '?v=new'));
  assert.equal(read('course/w01/index.html'), redirect);
  const consistent = run('--check', 'login.js', 'new');
  assert.equal(consistent.status, 0);
  assert.equal(consistent.stdout, '');
  assert.equal(run('login.js', 'new').stdout, '');
  for (const args of [[], ['login.js'], ['missing.js','new'], ['unused.js','new'], ['../index.html','new'], ['login.js','bad&value'], ['login.js','new','--unknown']]) {
    assert.throws(()=>run(...args), Error, args.join(' '));
    assert.equal(read('index.html'), original.replace('?v=old', '?v=new'));
    assert.equal(read('course/activity/index.html'), nested.replace('?v=old', '?v=new'));
  }
});
