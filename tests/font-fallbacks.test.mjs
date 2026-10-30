import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const sourceFiles = [];

async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(fullPath);
    else if (/\.(?:html|css)$/i.test(entry.name)) sourceFiles.push(fullPath);
  }
}

await collect(root);

const genericFamilies = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji',
  'math', 'fangsong'
]);

// 逗號只在引號與括號之外分隔；保留字型名稱的引號。
function splitFamilies(value) {
  const parts = [];
  let quote = '', depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\') { i++; continue; }
    if (quote) { if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return parts;
}

// 不模擬選擇器 cascade：同名定義逐一驗證，避免安全的定義掩蓋不安全覆寫。
function cyclicVariables(variables) {
  const cyclic = new Set(), done = new Set(), active = [];
  function visit(name) {
    const index = active.indexOf(name);
    if (index !== -1) { active.slice(index).forEach(key => cyclic.add(key)); return; }
    if (done.has(name)) return;
    active.push(name);
    for (const definition of variables.get(name) ?? []) {
      // CSS 循環依賴也包含 var() 的備用值；字串中的 var() 不算引用。
      for (const match of definition.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|var\s*\(\s*(--[\w-]+)/gi)) {
        if (match[1]) visit(match[1]);
      }
    }
    active.pop();
    done.add(name);
  }
  for (const name of variables.keys()) visit(name);
  return cyclic;
}

function resolveFamilies(value, variables, seen = new Set(), cyclic = cyclicVariables(variables)) {
  const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|var\s*\(/gi;
  for (let token; (token = tokens.exec(value));) {
    if (!/^var/i.test(token[0])) continue;
    let end = tokens.lastIndex, depth = 1, quote = '';
    for (; end < value.length && depth; end++) {
      const ch = value[end];
      if (ch === '\\') { end++; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    if (depth) return [null];
    const [rawName, ...fallback] = splitFamilies(value.slice(tokens.lastIndex, end - 1));
    const name = rawName.trim();
    if (!/^--[\w-]+$/.test(name)) return [null];
    const definitions = seen.has(name) || cyclic.has(name) ? undefined : variables.get(name);
    const nextSeen = new Set([...seen, name]);
    let replacements = definitions
      ? definitions.flatMap(definition => resolveFamilies(definition, variables, nextSeen, cyclic))
      : [null];
    if (fallback.length) {
      replacements = replacements.flatMap(replacement => replacement === null
        ? resolveFamilies(fallback.join(','), variables, nextSeen, cyclic) : [replacement]);
    }
    return replacements.flatMap(replacement => replacement === null ? [null]
      : resolveFamilies(value.slice(0, token.index) + replacement + value.slice(end), variables, seen, cyclic));
  }
  return [value];
}

function hasGenericFallback(value, variables = new Map()) {
  return resolveFamilies(value, variables).every(resolved => resolved !== null &&
    splitFamilies(resolved).some(name => genericFamilies.has(name.trim().toLowerCase())));
}

function declarations(source, isHtml = false) {
  const css = isHtml ? [
    ...[...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]),
    ...[...source.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(match => match[1] ?? match[2])
  ].join('\n') : source;
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+|font-family)\s*:\s*((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^;{}"'])+)/gi)]
    .map(([, name, value]) => [name, value.trim()]);
}

function fontErrors(own, context = own) {
  const variables = new Map();
  for (const [name, value] of context) {
    if (!name.startsWith('--')) continue;
    if (!variables.has(name)) variables.set(name, []);
    variables.get(name).push(value);
  }
  return own.filter(([name, value]) =>
    (name.toLowerCase() === 'font-family' || /^--f(?:-|$)/.test(name)) &&
    !hasGenericFallback(value, variables));
}

test('only unquoted generic names count, including quoted commas and escapes', () => {
  for (const value of ['"sans-serif"', "'monospace'", '"Example, sans-serif"', '"Example\\" , serif"', 'Example']) {
    assert.equal(hasGenericFallback(value), false, value);
  }
  for (const value of ['"Example, serif", sans-serif', 'Example, MONOSPACE', "'sans-serif', serif"]) {
    assert.equal(hasGenericFallback(value), true, value);
  }
});

test('var references must resolve to a generic fallback', () => {
  const variables = new Map([
    ['--good', ['"Example", sans-serif']], ['--bad', ['"sans-serif"']],
    ['--alias', ['var(--good)']], ['--loop', ['var(--loop)']],
    ['--a', ['var(--b)']], ['--b', ['var(--a)']],
    ['--self-fallback', ['var(--self-fallback, serif)']],
    ['--fallback-cycle', ['var(--good, var(--fallback-cycle))']],
    ['--overridden', ['serif', 'Example']]
  ]);
  for (const value of ['var(--bad)', 'var(--missing)', 'var(--loop)', 'var(--a)',
    'var(--missing, "sans-serif")', 'var(--bad, sans-serif)', 'var(--overridden)',
    'var(--missing), serif', 'var(--good', 'var(--self-fallback)', 'var(--fallback-cycle)']) {
    assert.equal(hasGenericFallback(value, variables), false, value);
  }
  for (const value of ['var(--alias)', 'var(--missing, sans-serif)',
    'var(--missing, var(--alias))', 'var(--missing, "Example, serif", monospace)',
    'var(--bad), serif', 'var(--self-fallback, serif)']) {
    assert.equal(hasGenericFallback(value, variables), true, value);
  }
});

test('page context checks arbitrary variable names and every font definition', () => {
  const linked = declarations(':root{--brand:Example;--safe:Example,serif}');
  const own = declarations(`<style>:root{--f-body:var(--brand)}
    body{font-family:var(--f-body)} h1{font-family:var(--safe)}</style>
    <span style="font-family:'sans-serif'">test</span>`, true);
  assert.deepEqual(fontErrors(own, [...linked, ...own]), [own[0], own[1], own[3]]);
  assert.equal(fontErrors(declarations('body{font-family:var(--safe)}')).length, 1,
    'another page must not supply a missing variable');
});

test('every declared font family has a generic fallback', async () => {
  const sources = new Map(await Promise.all(sourceFiles.map(async file => [file, await readFile(file, 'utf8')])));
  const missing = [];
  for (const [file, source] of sources) {
    const own = declarations(source, file.endsWith('.html'));
    const context = [...own];
    if (file.endsWith('.html')) {
      for (const [, href] of source.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:[?#][^"']*)?)["'][^>]*>/gi)) {
        const url = new URL(href, new URL(path.relative(root, file), 'https://local.invalid/'));
        if (url.origin !== 'https://local.invalid') continue;
        const linked = path.join(root, decodeURIComponent(url.pathname));
        assert.ok(sources.has(linked), `Missing local stylesheet: ${href}`);
        context.push(...declarations(sources.get(linked)));
      }
    }
    for (const [name, value] of fontErrors(own, context)) {
      missing.push(`${path.relative(root, file)}: ${name}: ${value}`);
    }
  }
  assert.deepEqual(missing, [], `Missing generic font fallback:\n${missing.join('\n')}`);
});

test('Google Fonts stylesheet links use display=swap', async () => {
  const missingSwap = [];
  for (const file of sourceFiles.filter((name) => name.endsWith('.html'))) {
    const source = await readFile(file, 'utf8');
    for (const [, href] of source.matchAll(/<link\b[^>]*\bhref=["']([^"']*fonts\.googleapis\.com\/css2[^"']*)["'][^>]*>/gi)) {
      if (!/[?&]display=swap(?:&|$)/i.test(href)) missingSwap.push(path.relative(root, file));
    }
  }
  assert.deepEqual(missingSwap, [], `Google Fonts links missing display=swap:\n${missingSwap.join('\n')}`);
});
