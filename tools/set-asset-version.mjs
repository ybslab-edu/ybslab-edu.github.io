// 無建置步驟：node tools/set-asset-version.mjs login.js 20261030a [--check]
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function htmlFiles(dir) {
  return readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && /\.html$/i.test(entry.name) ? [path] : [];
  });
}

// 逐個讀取 HTML 標籤，略過註解與 raw text；不可將腳本內的範例當標籤。
function* resourceAttributes(html) {
  const tags = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z\d:-]*)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const urlAttributes = {script:'src', link:'href', img:'src', source:'src', audio:'src', video:'src', track:'src', input:'src', embed:'src', object:'data', iframe:'src'};
  for (let tag; (tag = tags.exec(html));) {
    if (!tag[1] || tag[0].startsWith('</')) continue;
    const name = tag[1].toLowerCase();
    const openingLength = 1 + tag[1].length;
    const attributes = tag[0].slice(openingLength, -1);
    const seen = new Set();
    for (const attr of attributes.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g)) {
      const key = attr[1].toLowerCase();
      if (seen.has(key)) continue; // HTML 同名屬性以第一個為準。
      seen.add(key);
      const raw = attr[2] ?? attr[3] ?? attr[4];
      if (key !== urlAttributes[name] || raw === undefined) continue;
      const quoted = attr[2] !== undefined || attr[3] !== undefined;
      const start = tag.index + openingLength + attr.index + attr[0].length - raw.length - Number(quoted);
      yield {raw, start};
    }
    if (name === 'plaintext') break;
    if (['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript'].includes(name)) {
      const closing = new RegExp(`</${name}(?=[\\s/>])[^>]*>`, 'gi');
      closing.lastIndex = tags.lastIndex;
      if (!closing.exec(html)) break;
      tags.lastIndex = closing.lastIndex;
    }
  }
}

// 保留原文位置；更新時不重新序列化 HTML 或 URL，以免改動其他內容。
export function assetReferences(html, file, siteRoot = root) {
  const references = [];
  const base = new URL(relative(siteRoot, file).split(sep).join('/'), 'https://local.invalid/');
  for (const reference of resourceAttributes(html)) {
    const {raw} = reference;
    if (!/^[^?#]+\?v=/.test(raw) || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)) continue;
    const url = new URL(raw, base);
    const asset = decodeURIComponent(url.pathname).slice(1);
    if (!asset.startsWith('assets/')) continue;
    const start = reference.start + raw.indexOf('?v=') + 3;
    const version = raw.slice(raw.indexOf('?v=') + 3).split(/[&#]/, 1)[0];
    references.push({asset, version, start, end:start + version.length});
  }
  return references;
}

export function setAssetVersion(args, siteRoot = root, report = console.log) {
  const check = args.includes('--check');
  const positional = args.filter(arg => arg !== '--check');
  if (positional.length !== 2 || args.length !== positional.length + Number(check)) {
    throw Error('用法：node tools/set-asset-version.mjs <資源名，如 login.js 或 vendor/example.js> <版本> [--check]');
  }
  const [name, version] = positional;
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(name) || name.split('/').some(part => part === '.' || part === '..') || !/^[\w.-]+$/.test(version)) {
    throw Error('資源名須為 assets 內的相對路徑；版本僅可含英數字、底線、點或連字號');
  }
  const asset = `assets/${name}`;
  if (!statSync(resolve(siteRoot, asset), {throwIfNoEntry:false})?.isFile()) throw Error(`資源不存在：${asset}`);
  let found = 0, changed = 0;
  for (const file of htmlFiles(siteRoot)) {
    const html = readFileSync(file, 'utf8');
    const refs = assetReferences(html, file, siteRoot).filter(ref => ref.asset === asset);
    found += refs.length;
    const mismatches = refs.filter(ref => ref.version !== version);
    for (const ref of mismatches) {
      report(`${relative(siteRoot, file)}: ${asset}?v=${ref.version} → ${version}`);
    }
    changed += mismatches.length;
    if (!check && mismatches.length) {
      let updated = html;
      for (const ref of mismatches.reverse()) updated = updated.slice(0, ref.start) + version + updated.slice(ref.end);
      writeFileSync(file, updated);
    }
  }
  if (!found) throw Error(`HTML 未引用 ${asset}?v=，未修改任何檔案`);
  return check && changed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = setAssetVersion(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
