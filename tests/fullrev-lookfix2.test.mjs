import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {drawWarmup} from '../assets/fullrev-shell.mjs';
import {mountGrowth,growthActivities,growthJourney} from '../assets/fullrev-ui.mjs';
import {growth} from '../assets/fullrev-progress.mjs';
import {Element} from './fixtures/activity-dom.mjs';
import {config,snapshot,record} from './fixtures/fullrev.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
// 以 git show origin/main:<路徑> 取得的指紋固定舊版基準，避免跟著工作樹變動。
const legacyHashes={
  'assets/warmup-bank.js':'f9c1d4568bde89a3f47f78451bd56bd1095fab9cc2f31fa55221f39b20d90c6f',
  'assets/warmup.js':'e938b0db7332efbf72bc2cadae5f030aaec1a6609cf2b7f1fe4df14b79656779',
  '115-g9/me/index.html':'c767476b7a638c9b88134144349f46ff42fe250b1569dc710253ce8b3f442a52',
  '115-g9/me/me.css':'9629d89589365d805a7cab7f5b1387d66f1d58a87ef0b1cc020c813fe619ca41'
};
const old=async path=>{const source=await read(path);assert.equal(createHash('sha256').update(source).digest('hex'),legacyHashes[path],path+' 舊版基準已變動');return source;};
async function globals(t,extras={}) {
  const context=vm.createContext({});
  vm.runInContext(await read('assets/curriculum.js')+'\n'+await read('assets/activities.js')+'\n'+await read('assets/xp.js'),context);
  const data=vm.runInContext('({ACTIVITIES,TERMS,termWeekOf,termWeekLabel,activityOpenAt,isActivityOpen,YBSXP})',context);
  for(const [key,value] of Object.entries({...data,...extras})){
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});
  }
  return data;
}
test('暖身與 origin/main 同題庫同抽法；沒有實際題庫時不顯示',async t=>{
  const {ACTIVITIES}=await globals(t);
  const source=(await old('assets/warmup-bank.js')).replace(/export /g,'')+'\n'+(await old('assets/warmup.js')).replace(/^import[^\n]*\n/,'').replace(/export /g,'');
  const legacy=vm.createContext({});vm.runInContext(source+'\nglobalThis.draw=drawWarmup;',legacy);
  for(const href of ['u1-01','u2-01','u2-02','u2-06']){
    const current=ACTIVITIES.find(a=>a.href==='115-g9/'+href+'/');assert.ok(current);
    for(const isOpen of [()=>true,()=>false]){
      const options={current,activities:ACTIVITIES,isOpen,rnd:()=>0.3};
      assert.deepEqual(JSON.parse(JSON.stringify(drawWarmup(options))),JSON.parse(JSON.stringify(legacy.draw(options))));
    }
    if(['u1-01','u2-01'].includes(href))assert.equal(drawWarmup({current,activities:ACTIVITIES,isOpen:()=>true}).length,0);
  }
});
class ViewElement extends Element {
  removeAttribute(key){delete this[key];}
  insertAdjacentHTML(position,html){
    super.insertAdjacentHTML(position,html);
    const upgrade=el=>{Object.setPrototypeOf(el,ViewElement.prototype);for(const child of el.childNodes.filter(n=>n.nodeType===1))upgrade(child);};
    for(const child of this.childNodes.filter(n=>n.nodeType===1))upgrade(child);
  }
}
async function page(t,width=390) {
  const body=new ViewElement('body'),head=new ViewElement('head'),media={matches:width<=700,addEventListener(name,fn){this.change=fn;}};
  const document={body,head,createElement:tag=>new ViewElement(tag),querySelectorAll:selector=>[...head.querySelectorAll(selector),...body.querySelectorAll(selector)],addEventListener(){}};
  await globals(t,{document,window:{addEventListener(){}},matchMedia:()=>media,location:{search:''}});
  const listeners=[];let profile={uid:'synthetic-student',provider:'password'},value=snapshot([]),held=null,error=null;
  const client={project:config.firebase.projectId,course:'115-g9',state:()=>({profile}),subscribe(fn){listeners.push(fn);fn({profile});},
    restore:async()=>{},progress:async()=>{if(error)throw error;return held?await held:value;},
    logout:async()=>{profile=null;listeners.forEach(fn=>fn({profile,status:'signed-out'}));}};
  await mountGrowth({client:Promise.resolve(client)});
  const $=id=>body.querySelector('#'+id);
  return {$,body,head,media,client,set:valueIn=>{value=valueIn;},hold:promise=>{held=promise;},
    fail:()=>{error=Error('synthetic-offline');},
    identity:uid=>{profile={uid,provider:'password'};listeners.forEach(fn=>fn({profile}));}};
}
test('成長頁 390／1280 恢復原視圖、範圍切換、路線、XP 與登出清除',async t=>{
  for(const width of [390,1280])await t.test(String(width),async t=>{
    const p=await page(t,width);
    assert.equal(p.$('status').textContent,'已確認自己的雲端紀錄。');
    assert.equal(p.$('total').textContent,'0 XP');assert.equal(p.$('level-number').textContent,'Lv 1');
    assert.ok(p.body.querySelector('.brand'));assert.ok(p.body.querySelector('footer'));
    assert.ok(p.$('login').querySelector('.ybs-login'));
    assert.equal(p.$('axes').querySelectorAll('li').length,6);assert.ok(p.$('radar').querySelector('svg'));
    assert.ok(p.$('continue-link').href.endsWith('/'));assert.ok(p.$('route').querySelector('a'));
    assert.equal(p.$('growth-tabs').hidden,width>700);assert.equal(p.$('route-panel').hidden,width<=700);
    p.$('route-tab').onclick();assert.equal(p.$('route-panel').hidden,false);assert.equal(p.$('exploration-panel').hidden,width<=700);
    let prevented=false;p.$('route-tab').onkeydown({key:'Home',preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(p.$('exploration-tab').getAttribute('aria-selected'),'true');
    p.media.matches=!p.media.matches;p.media.change();assert.equal(p.$('growth-tabs').hidden,width<=700);
    assert.equal(p.$('route-panel').hidden,width>700);p.media.matches=!p.media.matches;p.media.change();
    p.body.querySelector('[data-scope="term"]').onclick();assert.equal(p.$('completion-label').textContent,'全學期完成率');
    assert.ok(p.$('details').querySelector('#zero-xp'));
    const a=ACTIVITIES.find(a=>a.week===5),records=a.rounds.map((_,round)=>record(round,{unit:a.unit}));
    p.set(snapshot(records));await p.$('retry').onclick();
    assert.equal(p.$('total').textContent,(a.rounds.length*15+20)+' XP');assert.equal(p.$('completed').textContent,String(a.rounds.length));assert.equal(p.$('badge-count').textContent,'1');
    assert.ok(p.$('route').querySelector('.complete'));assert.ok(p.$('details').querySelector('.xp-rounds'));
    assert.equal(p.$('details').querySelector('.xp-breakdown').textContent,'首次過關'+a.rounds.length*10+'準時加成'+a.rounds.length*5+'活動全過20');
    const activities=growthActivities(),result=growth(snapshot(records),{project:p.client.project,course:p.client.course,subject:'synthetic-subject',provider:'password',activities},YBSXP);
    assert.equal(growthJourney(result,activities).totalXP,result.totalXP,'呈現不可改算分');
    let release;p.hold(new Promise(resolve=>{release=resolve;}));const updating=p.$('retry').onclick();
    await p.$('logout').onclick();release(snapshot(records));await updating;
    assert.equal(p.$('growth').hidden,true);assert.equal(p.$('route').textContent,'');assert.equal(p.$('total').textContent,'');
  });
});
test('成長頁沿用 origin/main 原版 HTML 與 CSS，資料未確認時不顯示零分',async t=>{
  const source=await read('assets/fullrev-ui.mjs');
  const markup=source.match(/const growthMarkup=String.raw`([\s\S]*?)`;/)[1];
  const css=source.match(/const growthCSS=String.raw`([\s\S]*?)`;/)[1];
  assert.equal(markup,(await old('115-g9/me/index.html')).split('<body>')[1].split('</body>')[0]);
  assert.equal(css,await old('115-g9/me/me.css'));
  const p=await page(t);p.set(snapshot([],{complete:false}));await p.$('retry').onclick();
  assert.equal(p.$('growth').hidden,true);assert.equal(p.$('total').textContent,'');
});
test('成長頁讀取失敗與直接換身分均清除舊紀錄，重試可恢復',async t=>{
  const p=await page(t);assert.equal(p.$('growth').hidden,false);
  p.identity('synthetic-other');assert.equal(p.$('growth').hidden,true);assert.equal(p.$('route').textContent,'');
  await p.$('retry').onclick();assert.equal(p.$('growth').hidden,false);
  p.fail();await p.$('retry').onclick();assert.equal(p.$('growth').hidden,true);assert.equal(p.$('total').textContent,'');
  assert.equal(p.$('retry').hidden,false);
});
test('成果表格保留每格欄名，手機樣式在桌面覆寫之後還原逐筆顯示',async()=>{
  const css=await read('assets/fullrev-shell.css');
  const mobile=css.slice(css.lastIndexOf('@media(max-width:559px)'));
  assert.match(mobile,/thead\{position:absolute/);assert.match(mobile,/tr\{display:block/);
  assert.match(mobile,/td\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\)/);
  assert.match(mobile,/td::before\{content:attr\(data-label\)/);
  const {renderOutcome}=await import('../assets/fullrev-outcomes.mjs');
  const original=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const host=new Element('section');renderOutcome(host,{mode:'form-volunteer-backup',questions:[],kinds:[],headers:['欄甲','欄乙'],rows:[['值甲','值乙']]},()=>{});
    assert.deepEqual(host.querySelectorAll('td').map(e=>e.dataset.label),['欄甲','欄乙']);
  }finally{if(original)globalThis.document=original;else delete globalThis.document;}
});
