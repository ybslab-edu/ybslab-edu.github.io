import test from 'node:test';
import assert from 'node:assert/strict';
import {versionResources,releaseResources} from '../tools/release-resources.mjs';

const releaseId='a'.repeat(64),pinned=new Set(['assets/fixed.js']);
const file=(path,text='')=>({path,bytes:Buffer.from(text)});
const files=()=>[
 file('index.html',`<link rel="stylesheet" href="/assets/shell.css"><script src="assets/entry.js"></script>`),
 file('assets/entry.js',`import './client.mjs'; const css='/assets/extra.css'; import('./lazy.mjs');`),
 file('assets/client.mjs'),file('assets/lazy.mjs'),file('assets/fixed.js'),
 file('assets/shell.css',`@import './extra.css'; .icon{background:url('./icon.svg#mark')}`),
 file('assets/extra.css'),file('assets/icon.svg')
];
const versioned=()=>files().map(f=>file(f.path,versionResources(f.path,f.bytes.toString(),releaseId,pinned)));
const scan=fs=>releaseResources(fs,{releaseId,pinned});

test('release URLs cover HTML, static/dynamic modules, runtime CSS, CSS imports and images',()=>{
 const resources=scan(versioned());
 for(const path of ['entry.js','client.mjs','lazy.mjs','shell.css','extra.css','icon.svg'])assert.ok(resources.some(r=>r.url===`/assets/${path}?v=${releaseId}`),path);
 assert.ok(resources.some(r=>r.url==='/'));
 assert.ok(resources.some(r=>r.url==='/index.html'));
 const html=`<script src="/assets/entry.js?mode=x&amp;v=old#part"></script>`;
 const updated=versionResources('index.html',html,releaseId,pinned);
 assert.equal(updated,`<script src="/assets/entry.js?mode=x&amp;v=${releaseId}#part"></script>`);
 assert.deepEqual(scan([file('index.html',updated),file('assets/entry.js')]).find(r=>r.path==='assets/entry.js'),{url:`/assets/entry.js?mode=x&v=${releaseId}`,path:'assets/entry.js'});
 assert.equal(versionResources('assets/entry.js',`load(base + '/firebase-app-compat.js');`,releaseId,pinned),`load(base + '/firebase-app-compat.js');`);
});

test('scanner rejects unversioned mutable references in each resource context',()=>{
 for(const path of ['index.html','assets/entry.js','assets/shell.css']){
  const mutated=versioned().map(f=>f.path===path?file(path,f.bytes.toString().replaceAll('?v='+releaseId,'')):f);
  assert.throws(()=>scan(mutated),/release_resource_version/,path);
 }
 assert.throws(()=>scan([file('index.html',`<script src="/assets/missing.js?v=${releaseId}"></script>`)]),/release_resource_missing/);
 assert.throws(()=>scan([file('assets/entry.js',`import('./'+name+'.mjs')`)]),/release_dynamic_resource_unknown/);
 assert.throws(()=>scan([file('assets/entry.js','import(`./${name}.mjs`)')]),/release_dynamic_resource_unknown/);
 assert.throws(()=>scan([file('assets/entry.js','import(url.href)')]),/release_dynamic_resource_unknown/);
});

test('runtime read model uses the validated release URL and only exact fixed files are exempt',()=>{
 const text='const url=new URL(config.readModelModule,location.href); await import(url.href);';
 const fs=[file('assets/fullrev-client.mjs',text),file('assets/fullrev-read-model.mjs')];
 const readModelModule=`/assets/fullrev-read-model.mjs?v=${releaseId}`;
 assert.deepEqual(releaseResources(fs,{releaseId,readModelModule}),[{url:readModelModule,path:'assets/fullrev-read-model.mjs'}]);
 assert.throws(()=>releaseResources(fs,{releaseId,readModelModule:'/assets/fullrev-read-model.mjs'}),/release_resource_version/);
 assert.equal(versionResources('assets/fixed.js',`import('./old.mjs')`,releaseId,pinned),`import('./old.mjs')`);
 assert.throws(()=>scan([file('assets/new.js',`import './client.mjs'`),file('assets/client.mjs')]),/release_resource_version/);
});
