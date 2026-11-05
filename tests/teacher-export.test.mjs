import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup} from './fixtures/teacher-export.mjs';
test('教師頁停用貼碼、週班匯出、人數及 codec，保留原始備份與雲端明細入口',()=>{
  const html=readFileSync(new URL('../115-g9/teacher/index.html',import.meta.url),'utf8'),h=setup();
  assert.doesNotMatch(html,/codec\.js|CODEC|id="(?:paste|size|b-x1|b-x2|b-x3)"/);
  for(const id of ['cloud-class','cloud-export','b-legacy-export'])assert.ok(h.get(id));
});
test('Excel 真實寫檔可讀回，保留來源、UID 及各關嘗試明細',async()=>{
  const h=setup();h.evaluate(`saveBook('synthetic.xlsx',[['明細',XLSX.utils.aoa_to_sheet([['來源','UID','各關嘗試次數'],['未驗證','synthetic1','2 / 0']])]])`);
  assert.equal(h.downloads[0].name,'synthetic.xlsx');
  const bytes=[...new Uint8Array(await h.blobs[0].arrayBuffer())];
  const rows=h.evaluate(`JSON.stringify(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(${JSON.stringify(bytes)}),{type:'array'}).Sheets['明細'],{header:1}))`);
  assert.deepEqual(JSON.parse(rows),[['來源','UID','各關嘗試次數'],['未驗證','synthetic1','2 / 0']]);
});
