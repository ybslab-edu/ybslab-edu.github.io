import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('115-g9/u2-01/index.html');
const page=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
const decode = text => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({amp:'&', lt:'<', gt:'>', quot:'"'}[name]));
const textNode = text => ({nodeType:3, textContent:String(text)});

// 純 Node 的小型 DOM：innerHTML 會建元素，textContent 只建文字節點。
// 只支援外框用到的標記與選取器，不載入瀏覽器、登入或 Firebase。
class Element {
  constructor(tag) {
    this.parentElement=null; this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = [];
    this.classList = {add:(c)=>{this.className=[...new Set(((this.className||'')+' '+c).split(' '))].join(' ')},remove:(c)=>{this.className=(this.className||'').split(' ').filter(x=>x!==c).join(' ')},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};
    this.style={}; this.dataset = {}; this.value = ''; this.hidden = false;
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
  get parentNode(){return this.parentElement}
  getContext(){
    // 畫布只替代像素 I/O；照片產生、取樣、量化、UI 與判定仍執行頁面原碼。
    const noop=()=>{}, gradient=()=>({addColorStop:noop});
    return {createLinearGradient:gradient,createRadialGradient:gradient,
      fillRect:noop,beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,fill:noop,arc:noop,drawImage:noop,putImageData:noop,
      getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})};
  }
  scrollIntoView(){}
  click(){this.onclick?.()}
  focus() {}
}

function setup({old,failSave=false,teacher=false,random}={}){
  const body=new Element('body'),stored=new Map(),uploads=[],session=new Map();let status,login,loggedOut=0,flushed=0;
  if(old)stored.set('it9:w3:999-1',JSON.stringify(old));
  const document={body,createElement:tag=>new Element(tag),getElementById:id=>body.querySelector('#'+id)};
  const context=vm.createContext({document,window:{},Math:Object.assign(Object.create(Math),random===undefined?{}:{random:()=>random}),
    localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>{if(failSave)throw Error('synthetic quota');stored.set(k,v)}},
    sessionStorage:{setItem:(k,v)=>session.set(k,v)},TEACHER:{remembered:()=>teacher,remember(){}},
    YBS:{enabled:()=>true,profile:()=>({email:'synthetic@example.invalid'}),flush(){flushed++},logout(){loggedOut++},
      button:(el,cb)=>{login=cb},status:cb=>{status=cb},submit:x=>uploads.push(x)}});
  vm.runInContext(read('assets/codec.js')+'\n'+read('assets/shell.js')+'\n'+page,context,{timeout:3000});
  const get=id=>document.getElementById(id),evaluate=(s,timeout=3000)=>vm.runInContext(s,context,{timeout});
  if(!teacher){get('in-cls').value='999';get('in-seat').value='1';get('g-go').onclick()}
  return {evaluate,get,stored,uploads,session,status,login,flushed:()=>flushed,loggedOut:()=>loggedOut,
    progress:()=>JSON.parse(stored.get('it9:w3:999-1')||'null'),
    shoot(){get('b-shot').onclick()},fill(){evaluate('APP.handle.fill()')},load:i=>evaluate('APP.setLevel(ROUNDS['+i+'].lv);APP.load('+i+')')};
}

test('四關順序與設定不變；窮舉所有設定和單一錯答，使用實際頁面判定',()=>{
  const h=setup();
  assert.deepEqual(Array.from(h.evaluate('ROUNDS'),r=>[r.name,r.lv,r.sol.res,r.sol.dep]),
    [['看清背號',1,32,24],['認出應援色',1,48,6],['容量剛好夠',2,32,6],['衛星數遊覽車',2,32,24]]);
  h.evaluate(`
    for(let i=0;i<4;i++){
      APP.load(i);const r=ROUNDS[i],a=photos.map(p=>Object.fromEntries(r.ask.map(k=>[k,truth(p,k)])));
      let solutions=0,failures=0;
      for(const n of r.fixRes?[r.fixRes]:resList(r))for(const d of r.fixDep?[r.fixDep]:DEP){
        const expected=n===r.sol.res&&d===r.sol.dep;
        const answer={n,d,answers:a,photos};
        if((APP.rounds[i].check(APP.inst,answer)===true)!==expected)throw Error('設定判定不同 '+i+':'+n+','+d);
        expected?solutions++:failures++;
        for(let p=0;p<2;p++)for(const k of r.ask)for(let v=0;v<(k==='digit'||k==='count'?10:6);v++){
          if(v===a[p][k])continue;
          const wrong=a.map(x=>({...x}));wrong[p][k]=v;
          if(APP.rounds[i].check(APP.inst,{...answer,answers:wrong})===true)throw Error('錯答通過');
        }
      }
      if(solutions!==1||!failures)throw Error('必須恰有一個最小設定且包含錯誤設定');
    }`,15000);
});

test('產生器在常數亂數及各種種子下有界，照片不同、停車場數量與空間正確',()=>{
  for(const random of [0,0.5,0.999999]){
    const h=setup({random});
    h.evaluate(`for(let i=0;i<4;i++){
      APP.load(i);for(let j=0;j<100;j++){
        newPhotos();const r=ROUNDS[i];
        if(photos.length!==2||answers.some(a=>Object.keys(a).length))throw Error('雙照片或清空失敗');
        if(r.kind==='sat'){
          if(photos[0].buses===photos[1].buses)throw Error('兩張數量相同');
          for(const p of photos){
            if(p.buses<2||p.buses>5||p.plan.flat().filter(x=>x==='B').length!==p.buses)throw Error('遊覽車數量不同');
            if(p.plan.some(row=>row.reduce((s,x)=>s+({B:13.4,W:15.9,C:5.7}[x]),0)>57))throw Error('超出停車場');
          }
        }else if(photos[0].m===photos[1].m||(!r.noDigit&&photos[0].digit===photos[1].digit))throw Error('雙照片資料相同');
      }
    }
    for(let seed=1;seed<=1000;seed++)for(let buses=2;buses<=5;buses++){
      const plan=lotPlan(seed,buses);if(plan.flat().filter(x=>x==='B').length!==buses)throw Error('種子產生失敗');
    }`,10000);
  }
});

test('實際拍照保留所有判定分支、清空答案與照片更換時機',()=>{
  const h=setup();
  // 答案不足時送出停用；按鈕可選取、取消，旋鈕變動保留已選答案。
  assert.equal(h.get('b-shot').disabled,true);
  const button=h.get('photos').querySelector('.pk');button.click();
  assert.equal(h.evaluate('answers[0].digit'),0);button.click();assert.equal(h.evaluate('answers[0].digit'),undefined);
  h.fill();h.get('res-dn').click();assert.equal(h.get('b-shot').disabled,false);
  const lowPhotos=h.evaluate('photos');h.shoot();
  assert.match(h.get('verdict').textContent,/答對了，可是有點靠運氣/);
  assert.notEqual(h.evaluate('photos'),lowPhotos);assert.equal(h.get('b-shot').disabled,true);
  h.fill();h.evaluate('answers[1].digit=(answers[1].digit+1)%10');
  const wrongPhotos=h.evaluate('photos');h.shoot();assert.match(h.get('verdict').textContent,/朋友看錯了/);
  assert.notEqual(h.evaluate('photos'),wrongPhotos);assert.equal(h.progress().mask,0);
  h.fill();h.get('res-up').click();const bigPhotos=h.evaluate('photos');h.shoot();
  assert.match(h.get('verdict').textContent,/看得很清楚！但還能更小/);assert.equal(h.evaluate('photos'),bigPhotos);
  h.fill();h.shoot();assert.match(h.get('verdict').textContent,/朋友回訊息：「看到了！」/);
  assert.match(h.get('verdict').textContent,/取樣/);assert.equal(h.progress().mask,1);assert.equal(h.progress().tries[0],4);
  assert.equal(h.get('rounds').querySelector('button').textContent.includes('✓'),true);
  h.get('b-next').click();assert.equal(h.evaluate('ri'),1);assert.equal(h.get('res').disabled,true);
  h.fill();h.shoot();h.get('b-lv2').click();assert.equal(h.evaluate('ri'),2);
  h.fill();h.get('res-up').click();const capPhotos=h.evaluate('photos');h.shoot();
  assert.match(h.get('verdict').textContent,/傳不出去！/);assert.equal(h.evaluate('photos'),capPhotos);assert.equal(h.progress().mask,3);
  h.fill();h.shoot();h.get('b-next').click();assert.equal(h.evaluate('ri'),3);assert.equal(h.get('dep').disabled,true);
  h.fill();h.shoot();assert.equal(h.progress().mask,15);assert.match(h.get('verdict').textContent,/全部完成！/);
});

test('舊進度、week=3、it9:last、成績碼及四關上傳欄位相容，完成關不再記次',()=>{
  const old={mask:2,tries:[2,3,0,0],time:1234567890000},h=setup({old});
  assert.deepEqual(h.progress(),old);assert.equal(h.flushed(),1);
  const decoded=()=>h.evaluate('CODEC.decode(document.getElementById("code").textContent)');
  assert.equal(decoded().week,3);assert.equal(decoded().mask,2);
  for(let i=0;i<4;i++){
    h.load(i);h.fill();h.shoot();const u=h.uploads[i];
    assert.deepEqual([u.course,u.activity,u.termWeek,u.title,u.round,u.cls,u.seat],['115-g9',3,9,'看台最後一排',i,999,1]);
    assert.equal(u.roundName,h.evaluate('ROUNDS['+i+'].name'));assert.equal(u.level,i<2?'基礎':'進階');
    assert.equal(u.tries,i===0||i===1?3:1);assert.equal(u.mask,h.progress().mask);assert.equal(u.code,h.get('code').textContent);
    assert.deepEqual(Array.from(u.rounds),['看清背號','認出應援色','容量剛好夠','衛星數遊覽車']);
  }
  assert.deepEqual(JSON.parse(h.stored.get('it9:last')),{cls:999,seat:1});
  const before=h.progress().tries;h.shoot();assert.deepEqual(h.progress().tries,before);
  assert.equal(decoded().mask,15);assert.deepEqual(Array.from(decoded().tries).slice(0,4),before);
  h.status('sending');assert.match(h.get('sync').textContent,/上傳中/);
  h.status('pending');assert.match(h.get('sync').textContent,/自動重試/);
  h.status('ok');assert.match(h.get('sync').textContent,/已上傳/);
  h.status('relogin');assert.match(h.get('sync').textContent,/登入過期/);
  h.get('b-swap').click();assert.equal(h.loggedOut(),1);assert.equal(h.get('main').hidden,true);assert.equal(h.get('g-login').hidden,false);
  h.get('g-manual').click();assert.equal(h.get('g-form').hidden,false);
});

test('儲存失敗使用 shell 提示，仍產生成績碼與上傳；最後關不誤報全部完成',()=>{
  const h=setup({failSave:true});h.fill();h.shoot();
  assert.match(h.get('rep-note').textContent,/這台電腦沒辦法存下進度/);assert.match(h.get('rep-note').textContent,/最新的成績碼/);
  assert.equal(h.uploads.length,1);assert.ok(h.get('code').textContent);
  const partial=setup();partial.load(3);partial.fill();partial.shoot();
  assert.match(partial.get('verdict').textContent,/目前完成 1／4 關/);assert.doesNotMatch(partial.get('verdict').textContent,/全部完成！/);
});

test('教師填答案、原圖對照、換照片與切關、登出狀態維持；無成績碼、儲存或上傳',()=>{
  const h=setup({teacher:true});assert.equal(h.get('report').hidden,true);
  h.get('tb-orig').click();assert.equal(h.evaluate('showOrig'),true);
  h.get('tb-ans').click();assert.equal(h.get('b-shot').disabled,false);h.shoot();
  assert.match(h.get('verdict').textContent,/朋友回訊息/);
  const photos=h.evaluate('photos');h.get('tb-new').click();assert.notEqual(h.evaluate('photos'),photos);
  assert.equal(h.get('verdict').hidden,true);assert.equal(h.get('b-shot').disabled,true);
  h.get('b-next')?.click();h.load(1);assert.equal(h.get('tb-orig')['aria-pressed'],'true');
  h.load(3);h.fill();h.shoot();assert.match(h.get('verdict').textContent,/全部完成！/);
  assert.equal(h.stored.size,0);assert.equal(h.uploads.length,0);assert.equal(h.get('code').textContent,'');
  h.get('b-swap').click();assert.equal(h.evaluate('showOrig'),false);assert.equal(h.get('report').hidden,false);
});
