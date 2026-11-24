import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BATCH5} from '../assets/fullrev-activities.mjs';
import {buildBatches} from '../tools/build-fullrev-batch1.mjs';
import {config} from './fixtures/fullrev.mjs';
import {renderOutcome} from '../assets/fullrev-outcomes.mjs';
import {Element} from './fixtures/activity-dom.mjs';
test('PR6 第 5 批沿用現行 11/19 關名及 ID，關閉模式不改頁面與素材',async()=>{
  for(const a of BATCH5){const html=await readFile(new URL('../'+a.file,import.meta.url),'utf8');assert.match(html,new RegExp(`week:${a.activity}`));for(const name of a.rounds)assert.ok(html.includes(name));assert.ok(html.includes('本組委託附件'));assert.doesNotMatch(html,/備用素材|未實際操作/);}
});
test('PR6 第 5 批私有題面、答案、素材、判題與版本不在公開產物',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const load=file=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,'src/formal/banks',file)).href);
  const {default:banks}=await load('pr6-batch5.mjs'),{default:materials}=await load('pr6-batch5-materials.mjs');
  const dir=await mkdtemp(join(tmpdir(),'ybs-pr6-batch5-scan-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'public');await buildBatches({output,config});
  async function scan(dir){const texts=[];for(const f of await readdir(dir,{withFileTypes:true})){
    assert.doesNotMatch(f.name,/\.map$|pr6-batch\d|(?:ai|platform|outcome)-questions|fixture|\.test\.|materials|\.(?:pdf|zip|png|jpg)$/);
    const p=join(dir,f.name);if(f.isDirectory())texts.push(...await scan(p));else texts.push(await readFile(p,'utf8'));
  }return texts;}
  const text=(await scan(output)).join('\n');
  for(const [key,bundle] of Object.entries(banks)){
    assert.ok(!text.includes(key.split(':')[1]));
    for(const bank of Object.values(bundle.rounds))for(const c of bank.cases){assert.ok(!text.includes(JSON.stringify(c)));assert.ok(!text.includes(JSON.stringify(c.facts)));assert.ok(!text.includes(JSON.stringify(c.answer)));}
  }
  for(const m of Object.values(materials)){assert.ok(!text.includes(m.gzip));assert.ok(!text.includes(m.digest));}
  assert.doesNotMatch(text,/MUSIC-1[1-8]|qOneExpected|qExpected|qTwoExpected|qRun\(|qBits\(/);
  const login=await readFile(join(output,'assets/login.js'),'utf8');assert.match(login,/fullrev-activities\.mjs\?v=20261120b8/);
});

test('兩活動志工四關 64 組授權題面只渲染觀察、附件與作答欄，保留數字原文',{skip:!process.env.YBS_WORKER_SOURCE},async t=>{
  const load=file=>import(pathToFileURL(resolve(process.env.YBS_WORKER_SOURCE,file)).href);
  const [{default:banks},{projectQuestion}]=await Promise.all([load('src/formal/banks/pr6-batch5.mjs'),load('src/formal/questions.mjs')]);
  class DOMElement extends Element{append(...children){for(const child of children)super.append(child);}}
  const saved=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:tag=>new DOMElement(tag)}});
  t.after(()=>{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;});
  const bundles=Object.entries(banks).filter(([key])=>/^[78]:/.test(key));let count=0;
  for(const [key,bundle] of bundles)
  for(const [round,bank] of Object.entries(bundle.rounds))for(const c of bank.cases){
    const data=projectQuestion({data:c.facts,answer:c.answer},0,bank.type,'志工招募','').data;
    assert.ok(!('model' in data));assert.ok(!('feedback' in data));
    const host=new DOMElement('section'),handle=renderOutcome(host,data,()=>{});
    assert.deepEqual(Object.keys(handle).sort(),['dispose','draft','fields','get','ready','readyReason','restoreDraft']);assert.equal(handle.ready(),false);
    const fields=host.querySelectorAll('label').map(label=>label.childNodes.at(-1));assert.equal(fields.length,c.answer.length);
    fields.forEach((field,k)=>{field.value=String(c.answer[k]);});
    assert.equal(handle.ready(),true);assert.deepEqual(handle.get(),c.answer.map(String));
    const numeric=data.kinds.indexOf('n');fields[numeric].value='01';assert.equal(handle.get()[numeric],'01');
    fields[numeric].value='1e0';assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/整數/);
    for(const value of ['０１',' 01 ','　０１　']){fields[numeric].value=value;assert.equal(handle.ready(),false);assert.equal(handle.get()[numeric],value);assert.match(handle.readyReason(),/整數/);}
    fields[numeric].value='　';assert.equal(handle.ready(),false);assert.match(handle.readyReason(),/還有 1 格/);
    if(round==='0'&&key.startsWith('7:')){
      const chart=host.querySelector('section[aria-label="職務第一志願比較（人）"]');assert.ok(chart);
      assert.equal(chart.childNodes.length,7);assert.equal(host.querySelectorAll('button').length,0);
    }else assert.ok(host.textContent.includes('本組委託附件'));
    assert.equal(host.querySelectorAll('button').length,0);
    assert.equal(host.querySelector('[data-fallback]'),null);
    assert.doesNotMatch(host.textContent,/備用素材|未實際操作/);
    if(key.startsWith('8:')){
      for(const block of data.attachment){
        if(block.text)assert.ok(host.textContent.includes(block.text));
        if(block.rows)for(const row of block.rows)for(const value of row)assert.ok(host.textContent.includes(value));
      }
      assert.equal(host.querySelectorAll('figure').length,round==='3'?3:0);
    }
    handle.dispose();assert.equal(host.childNodes.length,0);
    count++;
  }
  assert.equal(count,64);
});
