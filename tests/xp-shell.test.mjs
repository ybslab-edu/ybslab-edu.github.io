import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './fixtures/activity-dom.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup({old,cloud,fail=false,delayed=false,teacher=false}={}){
  const body=new Element('body'),stored=new Map(),uploads=[],queries=[];
  const at=Date.now()-1000,passes=Object.fromEntries([0,1,2,3].map(i=>[i,{passedAt:at,wrongAnswers:0}]));
  stored.set('it9:w1:999-1',JSON.stringify({mask:15,tries:[2,2,2,2],time:at}));
  stored.set('ybs:xp:115-g9:seat:999-1',JSON.stringify({1:{wrong:[0,0,0,0],passes}}));
  if(old)stored.set('it9:w2:999-1',JSON.stringify(old));
  let coreScript;
  let profile=cloud?{uid:'synthetic-one',email:'synthetic@example.invalid'}:null,resolveRead;
  const waiting=new Promise(resolve=>resolveRead=resolve);
  const db={collection:path=>{queries.push(path);return {where:(field,op,value)=>{queries.push([field,op,value]);return {get:()=>fail?Promise.reject(new Error('offline')):waiting}}}}};
  const context=vm.createContext({URL,document:{body,currentScript:delayed?{src:'https://synthetic.invalid/assets/shell.js'}:null,head:{appendChild:el=>{coreScript=el}},createElement:t=>new Element(t),getElementById:id=>body.querySelector('#'+id)},window:{},
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{setItem(){}},
    TEACHER:{remembered:()=>teacher,remember(){}},
    ...(cloud?{YBS:{enabled:()=>true,profile:()=>profile,button(){},status(){},flush(){},guest(){},submit:x=>uploads.push(x),
      firebaseSession:async()=>({db,auth:{get currentUser(){return profile}}})}}:{}),
    ACTIVITIES:[1,2].map(week=>({course:'115-g9',week,codes:['資S-IV-1'],rounds:['甲','乙','丙','丁']})),
    activityOpenAt:()=>at-864e5,isActivityOpen:()=>true});
  vm.runInContext((delayed?'':read('assets/xp.js'))+'\n'+read('assets/shell.js')+`\nlet reply=true,n=0;const APP=SHELL({course:'115-g9',week:2,title:'合成活動',rounds:[0,1,2,3].map(i=>({name:'關'+i,lv:1,gen:()=>({n:++n}),view:()=>({get:()=>null}),check:()=>reply}))});`,context);
  const el=id=>body.querySelector('#'+id),run=code=>vm.runInContext(code,context);
  const start=(seat=1)=>{el('in-cls').value='999';el('in-seat').value=String(seat);el('g-go').click()};
  if(!teacher)start();
  return {stored,uploads,queries,el,run,start,loadXP:()=>{run(read('assets/xp.js'));coreScript.onload()},send:()=>el('b-send').click(),pass:i=>{run('APP.load('+i+')');el('b-send').click();el('b-send').click()},
    resolve:records=>resolveRead({docs:records.map(data=>({data:()=>data}))}),swapProfile:()=>{profile={uid:'synthetic-two'}}};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
test('A/B：總 XP、明細、全過、升級卡；重做無加成；上傳與舊進度欄位不變',async()=>{
  const h=setup();assert.equal(h.el('xp-total').textContent,'100 XP');
  assert.equal(h.el('xp-link')['aria-disabled'],'true');assert.equal(h.el('xp-link').href,'../me/');
  h.pass(0);assert.match(h.el('verdict').textContent,/\+10 過關、\+5 一次答對、\+5 準時/);
  for(const i of [1,2,3])h.pass(i);await settle();
  assert.equal(h.el('xp-total').textContent,'200 XP');assert.match(h.el('xp-level').textContent,/Lv 2 編碼學徒/);
  assert.match(h.el('verdict').textContent,/\+20 全過/);assert.ok(h.el('verdict').querySelector('.xp-title-card'));
  assert.deepEqual(Object.keys(JSON.parse(h.stored.get('it9:w2:999-1'))).sort(),['mask','time','tries']);
  h.pass(3);await settle();assert.equal(h.el('xp-total').textContent,'200 XP');assert.equal(h.el('verdict').querySelector('.xp-detail'),null);
  h.start(2);assert.equal(h.el('xp-total').textContent,'0 XP');
  h.start(1);assert.equal(h.el('xp-total').textContent,'200 XP');
});
test('新錯答跨重載保留；舊缺時間／錯答不猜，重做舊關不補時間',async()=>{
  const h=setup({old:{mask:2,tries:[3,2,0,0],time:1}});
  assert.equal(h.el('xp-total').textContent,'110 XP');
  h.pass(1);assert.equal(JSON.parse(h.stored.get('ybs:xp:115-g9:seat:999-1'))[2].passes[1],undefined);
  h.pass(0);assert.doesNotMatch(h.el('verdict').textContent,/一次答對/);
  h.run('APP.load(2);reply=false');h.send();h.start();h.run('APP.load(2);reply=true');h.send();h.send();
  assert.doesNotMatch(h.el('verdict').textContent,/一次答對/);await settle();
  const meta=JSON.parse(h.stored.get('ybs:xp:115-g9:seat:999-1'));
  assert.equal(meta[2].passes[2].wrongAnswers,1);assert.ok(meta[2].passes[2].passedAt>0);
});
test('帳號只讀自己的 attempts；雲端無錯答數不猜；本機其他身分進度不混入',async()=>{
  const h=setup({cloud:true});assert.match(h.el('xp-total').textContent,/尚未取得/);await settle();
  assert.deepEqual(h.queries,['ybsCourses/115-g9/attempts',['uid','==','synthetic-one']]);
  h.resolve([{uid:'synthetic-one',activity:1,round:0,tries:2,passedAt:{toMillis:()=>Date.now()}}]);await settle();
  assert.equal(h.el('xp-total').textContent,'15 XP');
  h.pass(0);await settle();assert.match(h.el('verdict').textContent,/一次答對/);
  assert.equal(h.uploads.length,1);assert.equal('wrongAnswers' in h.uploads[0],false);assert.equal('xp' in h.uploads[0],false);
  assert.deepEqual(Object.keys(h.uploads[0]).sort(),['activity','at','cls','course','level','mask','round','roundName','rounds','seat','termWeek','title','tries']);
});
test('換人隔離遲到讀取；網路失敗不顯示假 0 XP',async()=>{
  const h=setup({cloud:true});await settle();h.swapProfile();h.start(2);h.resolve([{uid:'synthetic-one',activity:1,round:0}]);await settle();
  assert.notEqual(h.el('xp-total').textContent,'10 XP');
  const offline=setup({cloud:true,fail:true});await settle();assert.match(offline.el('xp-total').textContent,/尚未取得/);
  offline.pass(0);assert.match(offline.el('verdict').textContent,/XP 待雲端紀錄確認/);assert.equal(offline.el('verdict').querySelector('.xp-title-card'),null);
});

test('核心慢載仍補過關 XP；教師示範不記錄、不顯示 XP',async()=>{
  const h=setup({delayed:true});h.pass(0);assert.ok(h.el('xp-pending'));
  h.loadXP();await settle();assert.match(h.el('verdict').textContent,/\+10 過關、\+5 一次答對、\+5 準時/);
  assert.equal(h.el('xp-total').textContent,'120 XP');
  const teacher=setup({teacher:true});const before=[...teacher.stored];teacher.pass(0);await settle();
  assert.deepEqual([...teacher.stored],before);assert.equal(teacher.el('xp-header').hidden,true);
  assert.equal(teacher.el('verdict').querySelector('.xp-detail'),null);
});
