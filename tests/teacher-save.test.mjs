import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setup} from './fixtures/teacher-export.mjs';

// cbc46a7 已移除教師頁的 localStorage 存檔；d61c505 再移除貼碼與人數設定。
// 0721683 加入唯讀課程摘要。指定版本沒有非同步設定儲存入口；
// 以下驗證實際唯讀頁面、同步分頁記憶與備份，不作為設定儲存競態已修正的證據。
// 合成 digest 結果只替代 Web Crypto，不使用或推算真實教師通行碼。
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const teacherSource=readFileSync(new URL('../assets/teacher.js',import.meta.url),'utf8');
const hash=teacherSource.match(/const HASH = '([0-9a-f]{64})'/)[1];
const digestResult=accepted=>Uint8Array.from(accepted?hash.match(/../g).map(v=>parseInt(v,16)):Array(32).fill(0)).buffer;
const teacherKey='ybslab:teacher';
function teacherSetup({stored=new Map(),storageErrors={},cryptoAvailable=true,subtleAvailable=true}={}){
  const storageCalls=[],requests=[];
  const storage=(method,key,value)=>{
    storageCalls.push({method,key,value});
    if(storageErrors[method])throw storageErrors[method];
    if(method==='getItem')return stored.get(key)??null;
    if(method==='setItem')stored.set(key,value);
    if(method==='removeItem')stored.delete(key);
  };
  const crypto=cryptoAvailable?{subtle:subtleAvailable?{digest(algorithm,bytes){
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    requests.push({algorithm,input:new TextDecoder().decode(bytes),resolve,reject});
    return promise;
  }}:undefined}:undefined;
  const context=vm.createContext({window:{crypto},crypto,TextEncoder,
    sessionStorage:{getItem:key=>storage('getItem',key),setItem:(key,value)=>storage('setItem',key,value),removeItem:key=>storage('removeItem',key)}});
  vm.runInContext(teacherSource+'\nglobalThis.api=TEACHER;',context,{filename:'assets/teacher.js'});
  return {api:context.api,stored,storageErrors,storageCalls,requests};
}

for(const online of [true,false])test('教師課程設定'+(online?'連線':'離線')+'時僅供查閱，重繪不寫入設定或舊資料',async()=>{
  const stored=new Map([['it9:grades','synthetic-old'],['it9:sizes','{'],['other','keep']]),before=new Map(stored);
  const h=setup({stored,storageErrors:{setItem:true,removeItem:true}});
  // 既有小型 DOM 的 append 僅接受單一節點，於此補上摘要渲染需要的 DOM 方法。
  h.evaluate(`
    const createElement=document.createElement;
    document.createElement=tag=>{
      const element=createElement(tag),append=element.append.bind(element);
      element.append=(...children)=>children.forEach(append);
      return element;
    };
    for(const id of ['teacher-courses','teacher-activities']){
      const element=document.getElementById(id);
      element.replaceChildren=()=>{element.innerHTML='';};
    }
    globalThis.location={pathname:'/115-g9/teacher/'};
    globalThis.navigator={onLine:${online}};
    globalThis.sideEffects=[];
    globalThis.fetch=(...args)=>{sideEffects.push('fetch');throw Error('synthetic network blocked');};
    globalThis.firebase=globalThis.sessionStorage=new Proxy({}, {get(target,key){
      sideEffects.push(String(key));throw Error('synthetic access blocked');
    }});
  `);
  h.evaluate(read('assets/lock.js'));
  const settings=h.get('course-settings'),render=()=>h.evaluate(read('assets/teacher-home.js'));
  const config=h.evaluate('JSON.stringify({courses:COURSES,activities:ACTIVITIES,open:OPEN})');
  const storageCalls=h.storageCalls.slice();
  render();
  assert.match(settings.textContent,/唯讀/);assert.match(settings.textContent,/僅供查閱/);
  assert.ok(h.get('teacher-courses').querySelectorAll('article').length>0,'執行實際摘要渲染');
  assert.match(h.get('teacher-courses').textContent,/課程已開設/);
  assert.match(h.get('teacher-courses').textContent,/課程未開設/);
  const rendered=settings.textContent;
  for(let i=0;i<3;i++)render();
  await Promise.resolve();
  assert.equal(settings.textContent,rendered,'重繪不累加卡片或變更設定');
  for(const tag of ['form','input','textarea','select','button'])assert.equal(settings.querySelector(tag),null,'唯讀設定沒有 '+tag+' 提交入口');
  assert.equal(settings.querySelector('[contenteditable]'),null);
  assert.equal(h.evaluate('JSON.stringify({courses:COURSES,activities:ACTIVITIES,open:OPEN})'),config);
  assert.deepEqual(h.storageCalls,storageCalls);assert.deepEqual(stored,before);
  assert.equal(h.evaluate('JSON.stringify(sideEffects)'),'[]');
});

test('分頁記憶只接受字串 1；快速重複切換立即保留最後狀態',async()=>{
  for(const raw of [undefined,'','0','true','1']){
    const stored=new Map([['other','keep']]);if(raw!==undefined)stored.set(teacherKey,raw);
    const h=teacherSetup({stored});
    assert.equal(h.api.remembered(),raw==='1');
    for(const on of [true,true,false,false,true,false]){
      assert.equal(h.api.remember(on),undefined);
      assert.equal(h.api.remembered(),on);
      assert.equal(stored.get(teacherKey),on?'1':undefined);
    }
    await Promise.resolve();
    assert.equal(h.api.remembered(),false);assert.deepEqual(stored,new Map([['other','keep']]));
    assert.ok(h.storageCalls.every(c=>c.key===teacherKey));
  }
});
for(const name of ['QuotaExceededError','SecurityError'])test('分頁記憶寫入遭 '+name+' 拒絕不假記住，恢復後可重試',()=>{
  const storageErrors={setItem:Object.assign(Error('synthetic storage failure'),{name})};
  const h=teacherSetup({storageErrors,stored:new Map([['other','keep']])});
  assert.doesNotThrow(()=>h.api.remember(true));assert.equal(h.api.remembered(),false);
  assert.deepEqual(h.stored,new Map([['other','keep']]));
  delete storageErrors.setItem;
  h.api.remember(true);assert.equal(h.api.remembered(),true);
  assert.deepEqual(h.stored,new Map([['other','keep'],[teacherKey,'1']]));
});
test('分頁記憶讀取失敗維持鎖定且不清資料；移除失敗後可重試',()=>{
  const storageErrors={getItem:Error('synthetic read failure'),removeItem:Error('synthetic remove failure')};
  const h=teacherSetup({storageErrors,stored:new Map([[teacherKey,'1'],['other','keep']])});
  assert.equal(h.api.remembered(),false);assert.equal(h.stored.get(teacherKey),'1');
  assert.ok(h.storageCalls.every(c=>c.method==='getItem'));
  delete storageErrors.getItem;assert.equal(h.api.remembered(),true);
  assert.doesNotThrow(()=>h.api.remember(false));assert.equal(h.api.remembered(),true);
  delete storageErrors.removeItem;
  h.api.remember(false);assert.equal(h.api.remembered(),false);
  assert.deepEqual(h.stored,new Map([['other','keep']]));
});
test('非同步通行碼驗證只回傳結果，不自動寫入分頁記憶',async()=>{
  for(const accepted of [false,true]){
    const h=teacherSetup(),checking=h.api.check('synthetic-code');
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].algorithm,'SHA-256');
    assert.equal(h.requests[0].input,'ybslab-teacher:synthetic-code');assert.deepEqual(h.storageCalls,[]);
    h.requests[0].resolve(digestResult(accepted));assert.equal(await checking,accepted);
    assert.deepEqual(h.storageCalls,[]);assert.deepEqual(h.stored,new Map());
  }
});
test('缺少 Web Crypto 或 subtle 時驗證失敗，不改記憶',async()=>{
  for(const options of [{cryptoAvailable:false},{subtleAvailable:false}]){
    const h=teacherSetup(options);
    assert.equal(await h.api.check('synthetic-code'),false);
    assert.deepEqual(h.requests,[]);assert.deepEqual(h.storageCalls,[]);
  }
});
test('驗證拒絕不當成功，不留下寫入或阻塞後續重試',async()=>{
  const h=teacherSetup(),failure=Error('synthetic digest failure');
  const failed=assert.rejects(h.api.check('synthetic-code'),e=>e===failure);
  h.requests[0].reject(failure);await failed;
  assert.deepEqual(h.storageCalls,[]);assert.equal(h.api.remembered(),false);
  const retry=h.api.check('synthetic-code');
  h.requests[1].resolve(digestResult(true));assert.equal(await retry,true);
  assert.equal(h.api.remembered(),false);
  h.api.remember(true);assert.equal(h.api.remembered(),true);
});
for(const raw of ['{"1-999-1":{"mask":3}}','{','null','[]',''])test('舊資料原值備份，不解析、覆寫或刪除：'+raw,async()=>{
  const stored=new Map([['it9:grades',raw],['it9:sizes','{"999":3}'],['other','keep']]),before=new Map(stored),h=setup({stored});
  assert.equal(h.get('legacy-panel').hidden,false);assert.match(h.get('legacy-msg').textContent,/未刪除/);
  h.get('b-legacy-export').onclick();
  assert.deepEqual(JSON.parse(await h.blobs[0].text()),{'it9:grades':raw,'it9:sizes':'{"999":3}'});
  assert.deepEqual(stored,before);assert.ok(h.storageCalls.every(c=>c.method==='getItem'));
  assert.equal(h.reopen().get('legacy-panel').hidden,false);
});
test('無舊鍵不顯示；儲存區封鎖及下載失敗明確提示',()=>{
  assert.equal(setup().get('legacy-panel').hidden,true);
  const blocked=setup({storageErrors:{getItem:true}});assert.match(blocked.get('legacy-msg').textContent,/無法讀取/);assert.equal(blocked.get('b-legacy-export').disabled,true);
  const h=setup({stored:new Map([['it9:grades','{']])});h.evaluate('URL.createObjectURL=()=>{throw Error("synthetic")}');h.get('b-legacy-export').onclick();assert.match(h.get('legacy-msg').textContent,/下載失敗.*未刪除/);assert.equal(h.stored.get('it9:grades'),'{');
});
test('備份讀取拒絕後保留原資料與重試入口，重試讀取最新原值',async()=>{
  const stored=new Map([['it9:grades','synthetic-old'],['it9:sizes','{'],['other','keep']]),h=setup({stored});
  h.storageErrors.getItem='it9:sizes';h.get('b-legacy-export').onclick();
  assert.match(h.get('legacy-msg').textContent,/下載失敗.*未刪除.*重試/);
  assert.equal(h.get('b-legacy-export').disabled,false);assert.equal(h.downloads.length,0);assert.equal(h.blobs.length,0);
  assert.deepEqual(stored,new Map([['it9:grades','synthetic-old'],['it9:sizes','{'],['other','keep']]));
  delete h.storageErrors.getItem;stored.set('it9:grades','synthetic-new');h.get('b-legacy-export').onclick();
  assert.equal(h.downloads.length,1);assert.match(h.get('legacy-msg').textContent,/已送出.*未刪除/);
  assert.deepEqual(JSON.parse(await h.blobs[0].text()),{'it9:grades':'synthetic-new','it9:sizes':'{'});
  assert.ok(h.storageCalls.every(c=>c.method==='getItem'));
});
test('備份下載失敗後快速重試不殘留成功訊息，也不以舊快照覆寫資料',async()=>{
  const stored=new Map([['it9:grades','synthetic-old'],['other','keep']]),h=setup({stored});
  h.get('b-legacy-export').onclick();assert.match(h.get('legacy-msg').textContent,/已送出/);
  h.evaluate('globalThis.originalURL=URL.createObjectURL;URL.createObjectURL=()=>{throw Error("synthetic download failure")}');
  h.get('b-legacy-export').onclick();assert.match(h.get('legacy-msg').textContent,/下載失敗.*重試/);
  assert.equal(h.downloads.length,1);assert.equal(h.get('b-legacy-export').disabled,false);
  stored.set('it9:grades','synthetic-new');h.evaluate('URL.createObjectURL=originalURL');
  h.get('b-legacy-export').onclick();h.get('b-legacy-export').onclick();
  assert.equal(h.downloads.length,3);assert.match(h.get('legacy-msg').textContent,/已送出/);
  const backups=await Promise.all(h.blobs.map(async blob=>JSON.parse(await blob.text())));
  assert.deepEqual(backups,[{'it9:grades':'synthetic-old','it9:sizes':null},
    {'it9:grades':'synthetic-new','it9:sizes':null},{'it9:grades':'synthetic-new','it9:sizes':null}]);
  assert.deepEqual(stored,new Map([['it9:grades','synthetic-new'],['other','keep']]));
  assert.ok(h.storageCalls.every(c=>c.method==='getItem'));
});
