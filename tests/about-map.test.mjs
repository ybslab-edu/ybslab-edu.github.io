// 執行實際地圖腳本；DOM／儲存空間使用替身，不連網路或 Firebase。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const about=read('about/index.html'),map=read('map/index.html');
const script=[...map.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function load({saved=null,hash='',blocked=false,stored=new Map()}={}){
  if(saved!==null)stored.set('ybs:cur',saved);
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{
      innerHTML:'',hidden:false,textContent:'',attributes:{},
      classList:{add(){}},style:{setProperty(){}},querySelectorAll:()=>[],querySelector:()=>({}),
      setAttribute(k,v){this.attributes[k]=String(v)},getAttribute(k){return this.attributes[k]??null},
      scrollIntoView(){},focus(){}
    });
    return elements.get(id);
  }
  const location={hash,pathname:'/map/'};
  const context=vm.createContext({
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,
      createElement(){throw Error('synthetic canvas unavailable')}},
    localStorage:{getItem(k){if(blocked)throw Error('synthetic storage failure');return stored.get(k)??null},
      setItem(k,v){if(blocked)throw Error('synthetic storage failure');stored.set(k,v)}},
    location,history:{replaceState(_a,_b,url){location.hash=url.startsWith('#')?url:''}},
    innerWidth:1100,requestAnimationFrame(){},matchMedia:()=>({matches:true})
  });
  vm.runInContext(read('assets/curriculum.js')+'\n'+read('assets/activities.js')+'\n'+script,context);
  return {run:source=>vm.runInContext(source,context),elements,stored};
}

test('作者教學理念為 whY／Because／So，保留字母 span 與底線樣式',()=>{
  const beats=about.match(/<ul class="beats">([\s\S]*?)<\/ul>/)[1];
  assert.deepEqual([...beats.matchAll(/<b>(.*?)<\/b>/g)].map(m=>m[1]),
    ['wh<span>Y</span>','<span>B</span>ecause','<span>S</span>o']);
  assert.match(about,/\.beats b span\{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:4px\}/);
  for(const html of [about,map]){
    assert.match(html,/<span class="k s">S<\/span>o<\/span>/);
    assert.doesNotMatch(html,/<\/span>o\./);
  }
});

for(const saved of [null,'jh','sh','adv','invalid'])test(`無明確連結時預設國中（舊記憶：${saved}）`,()=>{
  const page=load({saved});
  assert.equal(page.run('cur.id'),'jh');
  assert.match(page.elements.get('radial').innerHTML,/國中/);
  page.run("setCur('sh')");
  assert.equal(page.run('cur.id'),'sh');
  assert.equal(load({stored:page.stored}).run('cur.id'),'jh');
});

test('儲存空間不可用或網址代碼無效時仍預設國中',()=>{
  for(const blocked of [false,true])for(const hash of ['', '#invalid', '#%E0%A4%A', '#missing-V-999']){
    assert.equal(load({saved:'sh',hash,blocked}).run('cur.id'),'jh');
  }
});

for(const id of ['jh','sh','adv'])test(`明確課綱連結優先切換至 ${id} 並開啟項目`,()=>{
  const data=load();
  const code=data.run(`CURRICULA.find(c=>c.id==='${id}').strands[0].items[0].code`);
  for(const blocked of [false,true]){
    const page=load({saved:id==='jh'?'sh':'jh',hash:'#'+encodeURIComponent(code.replace('資','')),blocked});
    assert.equal(page.run('cur.id'),id);
    assert.equal(page.elements.get('nd-'+code.replace('資','')).attributes['aria-pressed'],'true');
    assert.equal(page.elements.get('pn-radial').hidden,false);
  }
});
