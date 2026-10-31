import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('115-g9/u1-05/index.html');
const page=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const decode = text => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({amp:'&', lt:'<', gt:'>', quot:'"'}[name]));
const textNode = text => ({nodeType:3, textContent:String(text)});

// 純 Node 的小型 DOM：innerHTML 會建元素，textContent 只建文字節點。
// 只支援外框用到的標記與選取器，不載入瀏覽器、登入或 Firebase。
class Element {
  constructor(tag) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = [];
    this.classList = {add:(c)=>{this.className=[...new Set(((this.className||'')+' '+c).split(' '))].join(' ')},remove:(c)=>{this.className=(this.className||'').split(' ').filter(x=>x!==c).join(' ')},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};
    this.dataset = {}; this.value = ''; this.hidden = false;
  }
  set textContent(text) { this.childNodes = [textNode(text)]; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set innerHTML(html) { this.childNodes = []; this.insertAdjacentHTML('beforeend', html); }
  insertAdjacentHTML(position, html) {
    assert.ok(['afterbegin', 'beforeend'].includes(position));
    const root = new Element('fragment'), stack = [root];
    for (const token of String(html).match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi) || []) {
      if (token.startsWith('<!--')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      const tag = token.match(/^<([a-z][\w-]*)/i)?.[1];
      if (tag) {
        const el = new Element(tag);
        for (const [, key, value] of token.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(key, decode(value));
        stack.at(-1).childNodes.push(el);
        if (!['br', 'hr', 'img', 'input'].includes(tag)) stack.push(el);
      } else stack.at(-1).childNodes.push(textNode(decode(token)));
    }
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
      if (selector.startsWith('#') ? el.id === selector.slice(1) : selector.startsWith('.') ? (el.className||'').split(' ').includes(selector.slice(1)) : el.tagName === selector.toUpperCase()) result.push(el);
      visit(el);
    });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get outerHTML() { return '<'+this.tagName.toLowerCase()+(this.id?' id="'+this.id+'"':'')+(this.className?' class="'+this.className+'"':'')+'>'+this.childNodes.map(n=>n.outerHTML??n.textContent).join('')+'</'+this.tagName.toLowerCase()+'>'; }
  addEventListener(type,fn) { (this.listeners??={})[type]??=[];this.listeners[type].push(fn); }
  focus() {}
}

function setup({old,failSave=false,teacher=false,random=0.5,source=page}={}) {
  const body=new Element('body'), stored=new Map();
  if(old)stored.set('it9:w1:999-1',JSON.stringify(old));
  const uploads=[];
  const document={body,getElementById:id=>body.querySelector('#'+id)};
  const context=vm.createContext({document,window:{},Math:Object.assign(Object.create(Math),{random:()=>random}),
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>{if(failSave)throw Error('synthetic quota');stored.set(k,v)}},
    sessionStorage:{setItem(){}},TEACHER:{remembered:()=>teacher,remember(){}},
    YBS:{enabled:()=>true,profile:()=>({email:'synthetic@example.invalid'}),flush(){},button(){},status(){},submit:x=>uploads.push(x)},
    setTimeout:f=>{f()},matchMedia:()=>({matches:true})});
  vm.runInContext(read('assets/codec.js')+'\n'+read('assets/shell.js')+'\n'+source,context,{timeout:1000});
  const get=id=>document.getElementById(id), evaluate=s=>vm.runInContext(s,context,{timeout:1000});
  if(!teacher){get('in-cls').value='999';get('in-seat').value='1';get('g-go').onclick()}
  return {context,evaluate,get,stored,uploads,progress:()=>JSON.parse(stored.get('it9:w1:999-1')),
    async play(seq){if(seq)evaluate('slots='+JSON.stringify(seq));else evaluate('APP.handle.fill()');await evaluate('play()')}};
}

test('四關順序、兩組資料及解答固定；所有排列依實際 check 判斷，產生器有界',()=>{
  const h=setup(),rounds=h.evaluate('ROUNDS');
  assert.deepEqual(Array.from(rounds,r=>r.name),['第 1 單','第 2 單','錢夠不夠？','班級團購']);
  assert.deepEqual(Array.from(rounds,r=>r.lv),[1,1,2,2]);
  function* permutations(pool,n,prefix=[]){if(!n){yield prefix;return}for(const x of pool)yield* permutations(pool.filter(y=>y!==x),n-1,[...prefix,x])}
  for(let i=0;i<4;i++){
    h.evaluate('APP.load('+i+')');
    const r=rounds[i], cfg=h.evaluate('APP.rounds['+i+']');
    assert.equal(cfg.check(cfg.gen(),{seq:r.sol,powerOff:false}),true);
    assert.notEqual(cfg.check(cfg.gen(),{seq:r.sol,powerOff:true}),true);
    let wrong=0;
    for(const seq of permutations(Array.from(r.cards.keys()),r.sol.length)){
      // 獨立算式預期，避免測試只重複呼叫 check 本身。
      const expected=r.tests.every(t=>{
        const outs=h.evaluate('run('+JSON.stringify(seq)+','+JSON.stringify(t)+').outs');
        const price=i===0?t[11]+t[12]:i===1?t[11]*t[12]+t[13]:i===2?(t[11]*t[12]+t[13]>t[14]?'錢不夠':t[11]*t[12]+t[13]):t[11]*t[12]+t[13]*t[14];
        return JSON.stringify(outs)===JSON.stringify([price]);
      });
      assert.equal(cfg.check(cfg.gen(),{seq,powerOff:false})===true,expected);
      if(!expected)wrong++;
    }
    assert.ok(wrong>0);
  }
  for(const random of [0,0.5,0.999999]){
    const x=setup({random});
    for(let i=0;i<4;i++)for(let k=0;k<40;k++){
      x.evaluate('APP.load('+i+')');
      assert.equal(x.evaluate('order.length===ROUNDS[ri].cards.length && new Set(order).size===order.length && order.some((v,i)=>v!==i)'),true);
    }
  }
});

test('一次演出檢查雙資料、錯答與斷電不過；記次、上傳、舊進度與成績碼相容',async()=>{
  const old={mask:2,tries:[3,4,0,0],time:1790000000000},h=setup({old});
  assert.deepEqual(h.progress(),old);
  assert.equal(h.evaluate('CODEC.decode(document.getElementById("code").textContent).mask'),2);
  await h.play([2,1,0]);assert.equal(h.progress().mask,2);assert.equal(h.progress().tries[0],4);assert.equal(h.uploads.length,0);
  h.get('b-off').onclick();await h.play();assert.equal(h.progress().mask,2);assert.equal(h.progress().tries[0],4);
  assert.match(h.get('verdict').textContent,/店裡停電了/);
  h.get('b-on').onclick();await h.play();
  assert.equal(h.progress().mask,3);assert.equal(h.progress().tries[0],5);assert.equal(h.uploads.length,1);
  assert.deepEqual(JSON.parse(h.stored.get('it9:last')),{cls:999,seat:1});
  const decoded=h.evaluate('CODEC.decode(document.getElementById("code").textContent)');
  assert.equal(decoded.week,1);assert.equal(decoded.mask,3);assert.equal(decoded.tries[0],5);
  assert.equal(h.uploads[0].activity,1);assert.equal(h.uploads[0].termWeek,7);assert.equal(h.uploads[0].round,0);assert.equal(h.uploads[0].tries,5);
  await h.play();assert.equal(h.progress().tries[0],5);
  for(const i of [2,3]){h.evaluate('APP.setLevel(2);APP.load('+i+')');await h.play();assert.ok(h.progress().mask&(1<<i))}
});

test('儲存失敗沿用 shell 提示；教師示範不儲存也不上傳',async()=>{
  const h=setup({failSave:true});await h.play();
  assert.match(h.get('rep-note').textContent,/這台電腦沒辦法存下進度/);
  assert.equal(h.evaluate('CODEC.decode(document.getElementById("code").textContent).mask'),1);
  const t=setup({teacher:true});await t.play();
  assert.equal(t.stored.size,0);assert.equal(t.uploads.length,0);assert.equal(t.get('report').hidden,true);
});


test('其餘 27 頁均未啟用新選項，沿用兩次送出、錯答重置與六格進度',()=>{
  let count=0;
  for(const dir of readdirSync(new URL('../115-g9/',import.meta.url))){
    if(dir==='u1-05'||!/^u\d+-\d+$/.test(dir))continue;
    const source=read('115-g9/'+dir+'/index.html');
    if(!source.includes('assets/shell.js?'))continue;
    const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
    const context=vm.createContext({});
    vm.runInContext(read('assets/shell.js').replace('const SHELL =','const sharedShell =')+
      '\nconst SHELL=cfg=>{globalThis.config=cfg};\n'+scripts,context,{timeout:1000});
    const cfg=context.config;
    assert.equal(cfg.progressLength,undefined,dir);assert.equal(cfg.rememberIdentity,undefined,dir);
    for(const r of cfg.rounds){assert.equal(r.confirmations,undefined,dir);assert.equal(r.manualAttempt,undefined,dir)}
    // 使用實際頁面的設定與關卡名稱，注入合成作答來驗證 shell 預設流程。
    const fixture=JSON.stringify({...cfg,rounds:cfg.rounds.map(r=>({name:r.name,lv:r.lv}))});
    const h=setup({source:`let reply=true;const cfg=${fixture};
      cfg.rounds=cfg.rounds.map(r=>({...r,gen:()=>({}),view:()=>({get:()=>null}),check:()=>reply}));
      const APP=SHELL(cfg);`});
    const key='it9:w'+cfg.week+':999-1',send=()=>h.get('b-send').onclick();
    send();assert.equal(h.get('verdict').className,'verdict mid',dir);
    h.evaluate('reply="合成錯答"');send();assert.equal(h.get('verdict').className,'verdict no',dir);
    h.evaluate('reply=true');send();assert.equal(h.get('verdict').className,'verdict mid',dir);
    send();assert.equal(h.get('verdict').className,'verdict ok',dir);
    const progress=JSON.parse(h.stored.get(key));
    assert.equal(progress.mask,1,dir);assert.deepEqual(progress.tries,[4,0,0,0,0,0],dir);
    assert.equal(h.uploads.length,1,dir);assert.equal(h.uploads[0].tries,4,dir);
    count++;
  }
  assert.equal(count,27);
});


test('演出期間 running 阻止換關、換人與清空；結束後解除限制',async()=>{
  const h=setup();h.evaluate('APP.handle.fill()');
  const pending=h.evaluate('play()');
  assert.equal(h.evaluate('running'),true);
  for(const id of ['tab-2','b-swap','b-clear','tb-new','tb-ans']){
    let canceled=false;
    const event={preventDefault(){canceled=true},stopImmediatePropagation(){}};
    h.get('main').listeners.click[0](event);
    if(!canceled)h.get(id).onclick();
    assert.equal(canceled,true,id);
    assert.equal(h.evaluate('ri'),0,id);
    assert.equal(h.evaluate('slots.length'),3,id);
  }
  await pending;assert.equal(h.evaluate('running'),false);
  let canceled=false;h.get('main').listeners.click[0]({preventDefault(){canceled=true},stopImmediatePropagation(){}});
  assert.equal(canceled,false);
});
