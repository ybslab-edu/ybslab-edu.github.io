import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8,MANAGED_ACTIVITIES,
  validateActivityCatalog,mergeActivityBatches,activityConfig,renderQuestion
} from '../assets/fullrev-activities.mjs';

const fixture=(extra={})=>({activity:1,file:'115-g9/fixture/index.html',title:'合成活動',unit:0,
  rounds:['合成首關','合成中關','合成末關'],managed:[0,2],...extra});
const batches=[BATCH1,BATCH2,BATCH3,BATCH4,BATCH5,BATCH6,BATCH7,BATCH8];
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};

test('目錄接受首末索引、空 managed、單關、最大安全 ID 及不同課程的相同 ID',()=>{
  const catalog=[fixture(),fixture({course:'115-df',file:'115-df/fixture/index.html',unit:null,managed:[]}),
    fixture({activity:Number.MAX_SAFE_INTEGER,file:'115-g9/last/index.html',rounds:['唯一關卡'],managed:[0]})];
  assert.equal(validateActivityCatalog(catalog),catalog);
  assert.deepEqual(validateActivityCatalog([]),[]);
  assert.deepEqual(mergeActivityBatches([]),[]);
  assert.deepEqual(mergeActivityBatches([[],[]]),[]);
});

test('目錄拒絕非陣列、非活動物件及稀疏項目',()=>{
  for(const value of [undefined,null,{},'catalog',new Set()])assert.throws(()=>validateActivityCatalog(value),/^Error: catalog_invalid$/);
  for(const value of [undefined,null,1,'activity',[]])assert.throws(()=>validateActivityCatalog([value]),/catalog_invalid_entry/);
  assert.throws(()=>validateActivityCatalog(Array(1)),/catalog_invalid_entry/);
});

test('活動 ID 必須是正安全整數；課程不得是空字串或非字串',()=>{
  for(const activity of [undefined,null,0,-1,1.5,'1',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>validateActivityCatalog([fixture({activity})]),/catalog_invalid_activity/,String(activity));
  }
  for(const course of [null,'',' ',' 115-g9','115-g9 ',1,false]){
    assert.throws(()=>validateActivityCatalog([fixture({course})]),/catalog_invalid_course/,String(course));
  }
});

test('重複 ID 不受省略課程、不同檔案或不相交 managed 掩蓋；檔案也不可共用',()=>{
  const a=fixture();
  for(const course of [undefined,'115-g9']){
    assert.throws(()=>validateActivityCatalog([a,fixture({course,file:'115-g9/other/index.html',managed:[1]})]),/catalog_duplicate_activity:115-g9:1/);
  }
  for(const extra of [{activity:2},{course:'115-df'}]){
    assert.throws(()=>validateActivityCatalog([a,fixture(extra)]),/catalog_duplicate_file/);
  }
});

test('目錄拒絕缺漏公開資料、空關卡名稱與稀疏 rounds',()=>{
  for(const extra of [{file:''},{file:null},{title:' '},{title:1},{unit:undefined},{unit:-1},{unit:0.5},{unit:'0'},{unit:NaN},{unit:Infinity}]){
    assert.throws(()=>validateActivityCatalog([fixture(extra)]),/catalog_invalid_metadata/);
  }
  for(const rounds of [undefined,null,{},'rounds',[],[''],[' '],[null],[1],Array(1)]){
    assert.throws(()=>validateActivityCatalog([fixture({rounds})]),/catalog_invalid_rounds/);
  }
});

test('managed 必須是無重複的安全整數索引，包含長度等於上界時拒絕',()=>{
  for(const managed of [undefined,null,{},'0',Array(1)]){
    assert.throws(()=>validateActivityCatalog([fixture({managed})]),/catalog_invalid_managed/);
  }
  for(const round of [-1,3,4,0.5,'0',null,undefined,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>validateActivityCatalog([fixture({managed:[round]})]),/catalog_invalid_managed/,String(round));
  }
  for(const managed of [[0,0],[2,2],[0,-0]]){
    assert.throws(()=>validateActivityCatalog([fixture({managed})]),/catalog_duplicate_managed/);
  }
});

test('跨批次依課程與 ID 合併，保留活動與索引順序，不修改輸入或共用輸出陣列',()=>{
  const a=fixture({managed:[2]}),b=fixture({course:'115-g9',managed:[0,1]});
  const input=freeze([[a],[],[fixture({course:'115-df',file:'115-df/fixture/index.html',unit:null})],[b]]);
  const before=structuredClone(input),merged=mergeActivityBatches(input);
  assert.deepEqual(merged,[{...b,managed:[2,0,1]},input[2][0]]);
  assert.deepEqual(input,before);
  merged[0].rounds[0]='輸出副本';merged[0].managed.push(99);merged[0].title='輸出標題';
  merged[1].rounds.push('輸出副本');merged[1].managed.push(99);
  assert.deepEqual(input,before);
  const reverse=mergeActivityBatches([[b],[a]]);
  assert.deepEqual(reverse[0].managed,[0,1,2]);
  assert.deepEqual([...reverse[0].managed].sort(),[...mergeActivityBatches([[a],[b]])[0].managed].sort());
});

test('跨批次先驗證各份目錄，不讓 Set 去重或後一批覆寫隱藏無效資料',()=>{
  for(const value of [undefined,null,{},'batches'])assert.throws(()=>mergeActivityBatches(value),/catalog_invalid_batches/);
  for(const value of [undefined,null,{}])assert.throws(()=>mergeActivityBatches([[],value]),/^Error: catalog_invalid$/);
  assert.throws(()=>mergeActivityBatches(Array(1)),/^Error: catalog_invalid$/);
  assert.throws(()=>mergeActivityBatches([[fixture(),fixture({managed:[1]})]]),/catalog_duplicate_activity/);
  assert.throws(()=>mergeActivityBatches([[fixture({managed:[0,0]})]]),/catalog_duplicate_managed/);
  assert.throws(()=>mergeActivityBatches([[fixture({managed:[0]})],[fixture({managed:[3]})]]),/catalog_invalid_managed/);
  assert.throws(()=>mergeActivityBatches([[fixture({managed:[3]})],[fixture({managed:[0]})]]),/catalog_invalid_managed/);
  assert.throws(()=>mergeActivityBatches([[fixture()],[fixture({activity:2})]]),/catalog_duplicate_file/);
  assert.throws(()=>mergeActivityBatches([[fixture()],[fixture({course:'115-df'})]]),/catalog_duplicate_file/);
});

test('跨批次相同 ID 的檔案、標題、單元、關卡數、名稱與順序漂移皆拒絕',()=>{
  const a=fixture({managed:[0]});
  for(const extra of [{file:'115-g9/moved/index.html'},{title:'另一標題'},{unit:1},{unit:null},
    {rounds:['合成首關','合成中關']},{rounds:['合成首關','合成中關','合成末關','新增關卡']},
    {rounds:['合成首關','合成中關','另一末關']},{rounds:['合成末關','合成中關','合成首關']}]){
    const b=fixture({...extra,managed:[1]});
    assert.throws(()=>mergeActivityBatches([[a],[b]]),/catalog_batch_mismatch:115-g9:1/);
    assert.throws(()=>mergeActivityBatches([[b],[a]]),/catalog_batch_mismatch:115-g9:1/);
  }
});

test('跨批次同關重複納管與第三批重複納管皆拒絕',()=>{
  const a=fixture({managed:[0]}),b=fixture({managed:[1]});
  for(const input of [[[a],[a]],[[a],[fixture({course:'115-g9',managed:[0,2]})]],[[a],[b],[fixture({managed:[1,2]})]]]){
    assert.throws(()=>mergeActivityBatches(input),/catalog_managed_overlap:115-g9:1/);
  }
});

test('既有七批維持 30 活動／118 關，第八批合法合併為 31 活動／124 關',()=>{
  const base=batches.slice(0,7).flat(),before=structuredClone(batches),all=mergeActivityBatches(batches);
  assert.deepEqual(MANAGED_ACTIVITIES,base);
  assert.deepEqual(base.map(a=>a.activity).sort((a,b)=>a-b),Array.from({length:30},(_,i)=>i+1));
  assert.equal(base.reduce((sum,a)=>sum+a.managed.length,0),118);
  assert.equal(all.length,31);
  assert.equal(all.reduce((sum,a)=>sum+a.managed.length,0),124);
  assert.equal(all.filter(a=>a.course!=='115-df').reduce((sum,a)=>sum+a.managed.length,0),121);
  assert.deepEqual(base.find(a=>a.activity===4).managed,[3]);
  assert.deepEqual(all.find(a=>a.activity===4).managed,[3,0,1,2]);
  assert.deepEqual(all.find(a=>a.course==='115-df'),BATCH8[1]);
  assert.deepEqual(batches,before);
});

test('activityConfig 維持全部九年級活動映射，活動 4 由合法合併納管四關',()=>{
  for(const a of MANAGED_ACTIVITIES){
    const cfg=freeze({course:'115-g9',week:a.activity,title:'保留頁面標題',unit:a.unit,rounds:[{name:'頁面原始關卡'}],confirmations:2});
    const configured=activityConfig(cfg);
    assert.notEqual(configured,cfg);
    assert.deepEqual(configured,{...cfg,rounds:a.rounds.map(name=>({name,managed:true})),renderQuestion});
    assert.deepEqual(cfg.rounds,[{name:'頁面原始關卡'}]);
  }
  for(const cfg of [{course:'115-df',week:1},{course:'unknown',week:4},{week:4},
    {course:'115-g9',week:0},{course:'115-g9',week:31},{course:'115-g9',week:'4'}]){
    assert.equal(activityConfig(cfg),cfg);
  }
});

test('模組載入即拒絕基礎目錄重複、越界 managed 及第八批合併漂移',async()=>{
  const url=new URL('../assets/fullrev-activities.mjs',import.meta.url);
  const source=(await readFile(url,'utf8')).replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,url).href}'`);
  for(const [from,to,error] of [
    ['export const BATCH2=Object.freeze([','export const BATCH2=Object.freeze([{...BATCH1[0]},',/catalog_duplicate_activity:115-g9:4/],
    ['...BATCH1[0],managed:[0,1,2]','...BATCH1[0],managed:[0,1,4]',/catalog_invalid_managed:115-g9:4/],
    ['...BATCH1[0],managed:[0,1,2]',"...BATCH1[0],title:'合成漂移',managed:[0,1,2]",/catalog_batch_mismatch:115-g9:4/],
    ['...BATCH1[0],managed:[0,1,2]','...BATCH1[0],managed:[0,1,2,3]',/catalog_managed_overlap:115-g9:4/]
  ]){
    assert.ok(source.includes(from),'載入用目錄 fixture 必須命中替換位置');
    const fixtureSource=source.replace(from,to);
    await assert.rejects(import('data:text/javascript;base64,'+Buffer.from(fixtureSource).toString('base64')),error);
  }
});
