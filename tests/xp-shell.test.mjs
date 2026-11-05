import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup({old,cloud,fail=false,delayed=false,teacher=false}={}){
  const body=new Element('body'),stored=new Map(),uploads=[],queries=[];
  const at=Date.now()-1000,passes=Object.fromEntries([0,1,2,3].map(i=>[i,{passedAt:at}]));
  stored.set('it9:w1:999-1',JSON.stringify({mask:15,tries:[2,2,2,2],time:at}));
  stored.set('ybs:xp:115-g9:seat:999-1',JSON.stringify({1:{passes}}));
  if(cloud)stored.set('ybs:xp:115-g9:uid:synthetic-one',JSON.stringify({2:{passes}}));
  if(old)stored.set('it9:w2:999-1',JSON.stringify(old));
  let coreScript;
  let status;
  let cloudRecords=[];
  let profile=cloud?{uid:'synthetic-one',email:'synthetic@example.invalid'}:null,resolveRead;
  const waiting=new Promise(resolve=>resolveRead=resolve);
  const db={collection:path=>{queries.push(path);return {where:(field,op,value)=>{queries.push([field,op,value]);return {get:async()=>{if(fail)throw new Error('offline');if(value!=='synthetic-one')await new Promise(()=>{});await waiting;return {docs:cloudRecords.map(data=>({data:()=>data}))}}}}}}};
  const context=vm.createContext({URL,document:{body,currentScript:delayed?{src:'https://synthetic.invalid/assets/shell.js'}:null,head:{appendChild:el=>{coreScript=el}},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},window:{},
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>teacher,remember(){}},
    ...(cloud?{YBS:{enabled:()=>true,profile:()=>profile,button(){},status:cb=>{status=cb},flush(){},guest(){},submit:x=>uploads.push(x),
      firebaseSession:async()=>({db,auth:{get currentUser(){return profile}}})}}:{}),
    ACTIVITIES:[1,2].map(week=>({course:'115-g9',week,codes:['資S-IV-1'],rounds:['甲','乙','丙','丁']})),
    activityOpenAt:()=>at-864e5,isActivityOpen:()=>true});
  vm.runInContext((delayed?'':read('assets/xp.js'))+'\n'+read('assets/shell.js')+`\nlet reply=true,n=0;const APP=SHELL({course:'115-g9',week:2,title:'合成活動',rounds:[0,1,2,3].map(i=>({name:'關'+i,lv:1,gen:()=>({n:++n}),view:()=>({get:()=>null}),check:()=>reply}))});`,context);
  const el=id=>body.querySelector('#'+id),run=code=>vm.runInContext(code,context);
  const start=(seat=1)=>{el('in-cls').value='999';el('in-seat').value=String(seat);el('g-go').click()};
  if(!teacher)start();
  return {stored,uploads,queries,el,run,start,status:st=>status(st),loadXP:()=>{run(read('assets/xp.js'));coreScript.onload()},send:()=>el('b-send').click(),pass:i=>{run('APP.load('+i+')');el('b-send').click();el('b-send').click()},
    resolve:records=>{cloudRecords=records;resolveRead()},swapProfile:()=>{profile={uid:'synthetic-two'}}};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
const records=(count=4)=>Array.from({length:count},(_,round)=>({uid:'synthetic-one',activity:1,round,passedAt:Date.now()}));
test('班座只提示登入；不存 XP，保留既有進度與作答',async()=>{
  const h=setup({old:{mask:2,tries:[3,2,0,0],time:1}});
  assert.equal(h.el('xp-link').hidden,true);
  assert.equal(h.el('xp-login-hint').hidden,false);
  assert.equal(h.el('xp-login-hint').textContent,'用帳號登入就能累積等級');
  assert.equal(h.stored.has('ybs:xp:115-g9:seat:999-1'),false);
  const before=h.stored.get('it9:w1:999-1');
  h.pass(0);await settle();
  assert.doesNotMatch(h.el('verdict').textContent,/XP|升級/);
  assert.equal(h.stored.get('it9:w1:999-1'),before);
  assert.deepEqual(Object.keys(JSON.parse(h.stored.get('it9:w2:999-1'))).sort(),['mask','time','tries']);
  assert.equal([...h.stored.keys()].some(k=>k.startsWith('ybs:xp:')),false);
});
test('帳號只讀自己的 attempts；本機過關及待送不計 XP；確認上傳後才更新',async()=>{
  const h=setup({cloud:true});
  assert.equal(h.el('xp-total').textContent,'載入中…');await settle();
  assert.deepEqual(h.queries,['ybsCourses/115-g9/attempts',['uid','==','synthetic-one']]);
  h.resolve([...records(),{uid:'other',activity:2,round:0}]);await settle();
  assert.equal(h.el('xp-total').textContent,'80 XP');
  h.pass(0);await settle();
  assert.equal(h.el('xp-total').textContent,'80 XP');
  assert.match(h.el('verdict').textContent,/XP 待雲端紀錄確認/);
  assert.equal(h.uploads.length,1);
  assert.deepEqual(Object.keys(h.uploads[0]).sort(),['activity','at','cls','course','level','mask','round','roundName','rounds','seat','termWeek','title','tries']);
  h.resolve([...records(),{uid:'synthetic-one',activity:2,round:0,passedAt:Date.now()}]);
  h.status('ok');await settle();
  assert.equal(h.el('xp-total').textContent,'95 XP');
  assert.match(h.el('verdict').textContent,/本關 XP：\+10 過關、\+5 準時/);
  assert.equal([...h.stored.keys()].some(k=>k.startsWith('ybs:xp:')),false);
});
test('雲端確認全過及升級；重做無加成',async()=>{
  const h=setup({cloud:true});h.resolve(records());await settle();
  const all=records();
  for(let i=0;i<4;i++){
    h.pass(i);all.push({uid:'synthetic-one',activity:2,round:i,passedAt:Date.now()});
    h.resolve([...all]);h.status('ok');await settle();
  }
  assert.equal(h.el('xp-total').textContent,'160 XP');
  assert.match(h.el('verdict').textContent,/\+20 全過/);
  assert.ok(h.el('verdict').querySelector('.xp-title-card'));
  h.pass(3);await settle();assert.equal(h.el('verdict').querySelector('.xp-detail'),null);
});
test('換人隔離遲到讀取；讀取失敗與未載入過關都不閃 0',async()=>{
  const h=setup({cloud:true});await settle();h.swapProfile();h.start(2);
  h.resolve(records());await settle();assert.equal(h.el('xp-total').textContent,'載入中…');
  const offline=setup({cloud:true,fail:true});await settle();
  assert.equal(offline.el('xp-total').textContent,'載入中…');
  offline.pass(0);assert.match(offline.el('verdict').textContent,/XP 待雲端紀錄確認/);
  assert.equal(offline.el('verdict').querySelector('.xp-title-card'),null);
  const loading=setup({cloud:true});loading.pass(0);loading.resolve(records(0));await settle();
  assert.equal(loading.el('xp-total').textContent,'0 XP');
  assert.match(loading.el('verdict').textContent,/XP 待雲端紀錄確認/);
});
test('核心慢載仍只用雲端；教師不顯示 XP',async()=>{
  const h=setup({cloud:true,delayed:true});h.resolve(records());await settle();
  assert.equal(h.el('xp-total').textContent,'載入中…');
  h.loadXP();await settle();assert.equal(h.el('xp-total').textContent,'80 XP');
  const teacher=setup({teacher:true}),before=[...teacher.stored];teacher.pass(0);await settle();
  assert.deepEqual([...teacher.stored],before);assert.equal(teacher.el('xp-header').hidden,true);
  assert.equal(teacher.el('verdict').querySelector('.xp-detail'),null);
});
