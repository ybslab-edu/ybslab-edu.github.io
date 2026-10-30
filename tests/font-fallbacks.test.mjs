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

test('every declared font family has a generic fallback', async () => {
  const missing = [];
  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    const declarations = [
      ...source.matchAll(/font-family\s*:\s*([^;}]+)/gi),
      ...source.matchAll(/--f-[\w-]+\s*:\s*([^;}]+)/gi),
      ...source.matchAll(/--f\s*:\s*([^;}]+)/gi)
    ];
    for (const [, value] of declarations) {
      if (/var\s*\(/i.test(value)) continue;
      const families = value.split(',').map((name) => name.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
      if (!families.some((name) => genericFamilies.has(name))) {
        missing.push(`${path.relative(root, file)}: ${value.trim()}`);
      }
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
