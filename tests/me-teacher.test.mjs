import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URLSearchParams});
for (const file of ['assets/xp.js','115-g9/me/me-teacher.js']) vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
const helper=vm.runInContext('YBSMeTeacher',context);
test('所有教師 Google 彈出登入頁皆允許必要腳本與 Auth iframe，成長頁只加 gapi 來源',()=>{
  const pages=['115-g9/me/index.html','115-g9/teacher/report/index.html','115-df/teacher/index.html','115-g9/teacher/index.html'];
  for(const path of pages) {
    const html=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    const directives=Object.fromEntries(policy.split(';').filter(s=>s.trim()).map(s=>{
      const [name,...sources]=s.trim().split(/\s+/);return [name,sources];
    }));
    assert.ok(directives['script-src'].includes('https://apis.google.com'),path);
    assert.ok(directives['script-src'].includes('https://www.gstatic.com/firebasejs/'),path);
    assert.deepEqual(directives['frame-src'],['https://class-score-86020.firebaseapp.com'],path);
    if(path==='115-g9/me/index.html') {
      assert.deepEqual(directives['script-src'],["'self'",'https://www.gstatic.com/firebasejs/','https://apis.google.com']);
      assert.deepEqual(directives['connect-src'],["'self'",'https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com']);
    }
  }
});
test('教師目標參數完整且唯一，無參數維持學生模式',()=>{
  assert.equal(helper.target(''),null);
  assert.equal(JSON.stringify(helper.target('?cls=999&seat=1')),'{"cls":999,"seat":1}');
  assert.equal(helper.target('?cls=999&seat=01').seat,1);
  for(const search of ['?cls=999','?seat=1','?cls=999&seat=0','?cls=999&seat=61','?cls=999&seat=1&seat=2','?cls=x&seat=1']) assert.equal(helper.target(search).invalid,true);
});
test('各關時間沿用 at 優先，7 天邊界、補做與未知時間',()=>{
  const open=Date.parse('2026-10-01T00:00:00Z'),window=7*864e5;
  const text=(r,o=open)=>helper.round(r.map(data=>({activity:1,round:0,...data})),1,0,o);
  assert.match(text([{at:open+window}]),/準時$/);
  assert.match(text([{at:open+window+1}]),/補做$/);
  assert.match(text([{at:open,passedAt:{toMillis:()=>open+window+1}}]),/準時$/);
  assert.match(text([{passedAt:{toMillis:()=>open+window+1}}]),/補做$/);
  assert.match(text([{at:open-1}]),/提早完成$/);
  assert.match(text([{at:open}],NaN),/無法判定補做$/);
  assert.match(text([{at:open},{}]),/時間不明/);
  assert.equal(text([]),'尚未過關');
});
function fixture({uid='owner',ownerUid='owner',active=true,cache=false,duplicates=false}={}) {
  const reads=[]; const email='synthetic@example.invalid';
  const auth={currentUser:{uid}};
  const record={uid:'student',email,activity:1,round:0};
  const db={doc:path=>({get:async options=>{reads.push([path,options]);return {exists:true,data:()=>({ownerUid})}}}),collection:path=>({
    get:async options=>{reads.push([path,options]);return {docs:Array.from({length:duplicates?2:1},()=>({id:email,data:()=>({cls:999,seat:1})}))}},
    where:(...query)=>({get:async options=>{reads.push([path,options,query]);return {metadata:{fromCache:cache},docs:[{id:'student_1_0',data:()=>record},{id:'invalid',data:()=>record},{id:'other_1_0',data:()=>({...record,email:'other@example.invalid'})}]}}})})};
  return {db,auth,reads,run:()=>helper.read(db,auth,{cls:999,seat:1},()=>active)};
}
test('只允許擁有者依名冊 email 查詢，篩除錯誤 ID 與其他學生',async()=>{
  const f=fixture();const records=await f.run();assert.equal(records.length,1);
  assert.equal(records[0].uid,'student');
  assert.deepEqual(f.reads.map(r=>r[0]),['ybsCourses/115-g9','ybsCourses/115-g9/roster','ybsCourses/115-g9/attempts']);
  assert.ok(f.reads.every(r=>r[1].source==='server'));
  assert.equal(JSON.stringify(f.reads[2][2]),'["email","==","synthetic@example.invalid"]');
});
test('拒絕非擁有者、過期請求、重複名冊與快取',async()=>{
  for(const [options,code,count] of [[{uid:'student'},'teacher',1],[{active:false},'stale',1],[{duplicates:true},'duplicate',2],[{cache:true},'cache',3]]) {
    const f=fixture(options);await assert.rejects(f.run(),e=>e.code===code);assert.equal(f.reads.length,count);
  }
});
