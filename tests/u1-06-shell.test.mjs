import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('115-g9/u1-06/index.html');
const page=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const decode = text => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({amp:'&', lt:'<', gt:'>', quot:'"'}[name]));
const textNode = text => ({nodeType:3, textContent:String(text)});

// 純 Node 的小型 DOM：innerHTML 會建元素，textContent 只建文字節點。
// 只支援外框用到的標記與選取器，不載入瀏覽器、登入或 Firebase。
class Element {
  constructor(tag) {
    this.parentElement=null; this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = [];
    this.classList = {add:(c)=>{this.className=[...new Set(((this.className||'')+' '+c).split(' '))].join(' ')},remove:(c)=>{this.className=(this.className||'').split(' ').filter(x=>x!==c).join(' ')},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};
    this.dataset = {}; this.value = ''; this.hidden = false;
  }
  set textContent(text) { this.childNodes = [textNode(text)]; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set innerHTML(html) { this.childNodes.forEach(n=>n.parentElement=null);this.childNodes = []; this.insertAdjacentHTML('beforeend', html); }
  insertAdjacentHTML(position, html) {
    assert.ok(['afterbegin', 'beforeend', 'afterend'].includes(position));
    const root = new Element('fragment'), stack = [root];
    for (const token of String(html).match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi) || []) {
      if (token.startsWith('<!--')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([a-z][\w-]*)/i)?.[1];
      if (tag) {
        const el = new Element(tag);
        for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(key, decode(value));
        el.parentElement=stack.at(-1);stack.at(-1).childNodes.push(el);
        if (!token.endsWith('/>')&&!['br', 'hr', 'img', 'input'].includes(tag)) stack.push(el);
      } else stack.at(-1).childNodes.push(textNode(decode(token)));
    }
    root.childNodes.forEach(n=>n.parentElement=this);
    if (position === 'afterend') {const parent=this.parentElement;const i=parent.childNodes.indexOf(this);root.childNodes.forEach(n=>n.parentElement=parent);parent.childNodes.splice(i+1,0,...root.childNodes);return;}
    if (position === 'afterbegin') this.childNodes.unshift(...root.childNodes);
    else this.childNodes.push(...root.childNodes);
  }
  setAttribute(key, value) {
    this[key === 'class' ? 'className' : key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
  }
  querySelectorAll(selector) {
    const result = [];
    const visit = parent => parent.childNodes.filter(n => n.nodeType === 1).forEach(el => {
      if(el.matches(selector))result.push(el);
      visit(el);
    });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get outerHTML() { return '<'+this.tagName.toLowerCase()+(this.id?' id="'+this.id+'"':'')+(this.className?' class="'+this.className+'"':'')+'>'+this.childNodes.map(n=>n.outerHTML??n.textContent).join('')+'</'+this.tagName.toLowerCase()+'>'; }
  addEventListener(type,fn) { (this.listeners??={})[type]??=[];this.listeners[type].push(fn); }
  matches(selector){
    if(selector.includes(' ')){const parts=selector.split(' ');return this.matches(parts.pop())&&!!this.parentElement?.closest(parts.join(' '))}
    const attrs=[...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
    if(!attrs.every(([,k,v])=>this[k]!==undefined&&(v===undefined||this[k]===v)))return false;
    selector=selector.replace(/\[[^\]]+\]/g,'');
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return selector.slice(1).split('.').every(c=>(this.className||'').split(' ').includes(c));
    return !selector||this.tagName===selector.toUpperCase();
  }
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null}
  append(el){if(el.parentElement){const a=el.parentElement.childNodes;a.splice(a.indexOf(el),1)}el.parentElement=this;this.childNodes.push(el)}
  get previousElementSibling(){const a=this.parentElement.childNodes.filter(n=>n.nodeType===1);return a[a.indexOf(this)-1]}
  scrollIntoView(){}
  click(){this.onclick?.()}
  focus() {}
}

function setup({old,failSave=false,teacher=false,random=0.5}={}){
  const body=new Element('body'),stored=new Map(),uploads=[],timers=new Map();let timer=0;
  if(old)stored.set('it9:w2:999-1',JSON.stringify(old));
  stored.set('it9:last',JSON.stringify({cls:999,seat:1}));
  const document={body,activeElement:{tagName:'BODY'},getElementById:id=>body.querySelector('#'+id),addEventListener(type,fn){(this.listeners??={})[type]=fn}};
  const context=vm.createContext({document,window:{},Math:Object.assign(Object.create(Math),{random:()=>random}),
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>{if(failSave)throw Error('synthetic quota');stored.set(k,v)}},
    sessionStorage:{setItem(){}},TEACHER:{remembered:()=>teacher,remember(){}},
    YBS:{enabled:()=>true,profile:()=>({email:'synthetic@example.invalid'}),flush(){},button(){},status(){},submit:x=>uploads.push(x)},
    setTimeout:f=>{timers.set(++timer,f);return timer},clearTimeout:id=>timers.delete(id),matchMedia:()=>({matches:true})});
  vm.runInContext(read('assets/codec.js')+'\n'+read('assets/shell.js')+'\n'+page,context,{timeout:1000});
  const get=id=>document.getElementById(id),evaluate=(s,timeout=1000)=>vm.runInContext(s,context,{timeout});
  if(!teacher){get('in-cls').value='999';get('in-seat').value='1';get('g-go').onclick()}
  const drain=()=>{let n=0;while(timers.size){assert.ok(n++<100,'播放必須有界');const [id,fn]=timers.entries().next().value;timers.delete(id);fn()}};
  return {evaluate,get,stored,uploads,document,drain,progress:()=>JSON.parse(stored.get('it9:w2:999-1')),
    play(seq){if(seq)evaluate('slots='+JSON.stringify(seq));else evaluate('APP.handle.fill()');evaluate('play()');drain()}};
}

test('四關順序、固定雙組資料、所有排卡的實際判定與獨立目標一致；亂數出題有界',()=>{
  const h=setup();
  assert.deepEqual(Array.from(h.evaluate('ROUNDS'),r=>[r.name,r.lv]),[['開遊戲',1],['打王前存檔',1],['RAM 滿了',2],['從開機到存檔',2]]);
  // 獨立列出每關的數值及最終儲存狀態；窮舉全部排列，包含最後一關陷阱卡。
  h.evaluate(`
    function* perms(pool,n,p=[]){if(!n){yield p;return}for(const k of pool)yield* perms(pool.filter(x=>x!==k),n-1,[...p,k])}
    function oracle(g,t,i){
      if(g.err)return false;
      const score=t.order.qty*t.order.price;
      const outs=i===0?[score]:i===1?[t.sales+score]:i===2?['LINE 打開了']:[score];
      if(JSON.stringify(g.outs)!==JSON.stringify(outs))return false;
      if(i===1)return true; // 原關卡只比螢幕，保留合法的其他存檔時機。
      const prog='（程式）';
      const disk=i===0?{'遊戲':prog}:i===2?{'遊戲':prog,LINE:prog}:{'作業系統':prog,'遊戲':prog,'存檔':t.ledger+score};
      const ram=i===0?{'遊戲':prog}:i===2?{'遊戲':prog,'目前進度':t.sales+score,LINE:prog}:{'作業系統':prog,'遊戲':prog,'這次分數':score};
      const normalize=o=>JSON.stringify(Object.entries(o).filter(([k])=>k!=='這次指令').sort(([a],[b])=>a.localeCompare(b)));
      return normalize(g.ram)===normalize(ram)&&normalize(g.disk)===normalize(disk);
    }
    for(let i=0;i<4;i++){
      APP.load(i);const r=ROUNDS[i],c=APP.rounds[i],inst=c.gen();let good=0,bad=0;
      for(const seq of perms(r.cards.map((_,k)=>k),r.sol.length)){
        const expected=r.tests.every(t=>oracle(run(seq,t,r),t,i));
        if((c.check(inst,seq)===true)!==expected)throw Error('判定不同 '+i+':'+seq);
        expected?good++:bad++;
      }
      if(!good||!bad)throw Error('必須有解亦有錯答 '+i);
      if(c.check(inst,r.sol)!==true)throw Error('標準解失敗');
    }`,30000);
  for(const random of [0,0.5,0.999999]){
    const x=setup({random});
    x.evaluate(`for(let i=0;i<4;i++)for(let k=0;k<40;k++){APP.load(i);if(order.length!==ROUNDS[i].cards.length||new Set(order).size!==order.length||order.every((v,i)=>v===i))throw Error('出題不完整')}`,10000);
  }
});

test('錯答不過、播放開始記次、一次雙資料過關、四關上傳與舊進度/成績碼相容',()=>{
  const old={mask:2,tries:[3,4,0,0],time:1790000000000},h=setup({old});
  assert.deepEqual(h.progress(),old);
  assert.equal(h.evaluate('CODEC.decode(document.getElementById("code").textContent).mask'),2);
  h.play([1,0,2,3]);assert.equal(h.progress().mask,2);assert.equal(h.progress().tries[0],4);assert.equal(h.uploads.length,0);
  h.play();assert.equal(h.progress().mask,3);assert.equal(h.progress().tries[0],5);assert.equal(h.uploads.length,1);
  assert.match(h.get('verdict').textContent,/換一個情況/);
  assert.deepEqual(JSON.parse(h.stored.get('it9:last')),{cls:999,seat:1});
  for(const i of [1,2,3]){h.evaluate('APP.load('+i+')');h.play();assert.ok(h.progress().mask&(1<<i))}
  const decoded=h.evaluate('CODEC.decode(document.getElementById("code").textContent)');
  assert.equal(decoded.week,2);assert.equal(decoded.mask,15);assert.deepEqual(Array.from(decoded.tries).slice(0,4),[5,4,1,1]);
  assert.deepEqual(h.uploads.map(x=>[x.activity,x.termWeek,x.round,x.tries]),[[2,8,0,5],[2,8,1,4],[2,8,2,1],[2,8,3,1]]);
  h.play();assert.equal(h.progress().tries[3],1);
});

test('儲存失敗顯示 shell 提示；教師暫停、前後步、跳步、停止、鍵盤且不記分',()=>{
  const h=setup({failSave:true});h.play();assert.match(h.get('rep-note').textContent,/這台電腦沒辦法存下進度/);
  assert.equal(h.evaluate('CODEC.decode(document.getElementById("code").textContent).mask'),1);
  const t=setup({teacher:true});t.evaluate('APP.handle.fill();play()');
  t.get('tb-play').onclick();assert.equal(t.evaluate('pb.paused'),true);
  t.get('tb-next').onclick();assert.equal(t.evaluate('pb.i'),1);
  t.get('tb-prev').onclick();assert.equal(t.evaluate('pb.i'),0);
  t.evaluate('jumpTo(2)');assert.equal(t.evaluate('pb.i'),2);
  t.document.listeners.keydown({key:'ArrowLeft'});assert.equal(t.evaluate('pb.i'),1);
  t.get('tb-stop').onclick();assert.equal(t.evaluate('pb'),null);assert.equal(t.evaluate('running'),false);
  t.play();assert.equal(t.stored.size,1);assert.equal(t.uploads.length,0);assert.equal(t.get('report').hidden,true);
});

test('選格、點卡、拿回、上下移動、清空與拖曳（取代、插入、取消）狀態保留',()=>{
  const h=setup();
  h.get('slots').querySelector('[data-e="2"]').onclick();
  h.get('pool').querySelector('[data-k="0"]').onclick();
  assert.equal(h.evaluate('slots[2]'),0);
  h.get('slots').querySelector('[data-mv="-1"][data-s="2"]').onclick();assert.equal(h.evaluate('slots[1]'),0);
  h.get('slots').querySelector('.card').onclick();assert.equal(h.evaluate('filled()'),0);
  h.evaluate(`slots=[0,1,2,null];drag={id:1,on:true,src:'slot',i:0,t:2};endDrag({pointerId:1},false)`);
  assert.deepEqual(Array.from(h.evaluate('slots')),[1,2,0,null]);
  h.evaluate(`drag={id:1,on:true,src:'pool',k:3,t:1};endDrag({pointerId:1},false)`);
  assert.deepEqual(Array.from(h.evaluate('slots')),[1,3,0,null]);
  h.evaluate(`drag={id:1,on:true,src:'slot',i:1,t:3};endDrag({pointerId:1},true)`);
  assert.deepEqual(Array.from(h.evaluate('slots')),[1,3,0,null]);
  h.evaluate(`drag={id:1,on:true,src:'slot',i:1,t:3};endDrag({pointerId:1},false)`);
  assert.deepEqual(Array.from(h.evaluate('slots')),[1,null,0,3]);
  h.get('b-clear').onclick();assert.equal(h.evaluate('filled()'),0);
  h.evaluate('APP.handle.fill();play()');
  let canceled=false;h.get('main').listeners.click[0]({target:h.get('tab-2'),preventDefault(){canceled=true},stopImmediatePropagation(){}});
  assert.equal(canceled,true);
  canceled=false;h.get('main').listeners.click[0]({target:h.get('b-copy'),preventDefault(){canceled=true},stopImmediatePropagation(){}});
  assert.equal(canceled,false,'播放時仍可複製成績碼');
  h.drain();assert.equal(h.evaluate('running'),false);
  const t=setup({teacher:true});t.evaluate('APP.handle.fill();play()');
  t.get('main').listeners.click[0]({target:t.get('b-swap')});
  assert.equal(t.evaluate('running'),false);assert.equal(t.evaluate('pb'),null);
  assert.equal(t.document.body.className.includes('teacher'),false);

});
