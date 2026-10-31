// 測試專用 DOM，沿用 u2-01-shell 的離線替身；不替代活動邏輯。
import assert from 'node:assert/strict';
const decode = text => text.replace(/&(amp|lt|gt|quot);/g, (_, name) => ({amp:'&', lt:'<', gt:'>', quot:'"'}[name]));
const textNode = text => ({nodeType:3, textContent:String(text)});

// 純 Node 的小型 DOM：innerHTML 會建元素，textContent 只建文字節點。
// 只支援外框用到的標記與選取器，不載入瀏覽器、登入或 Firebase。
export class Element {
  constructor(tag) {
    this.parentElement=null; this.nodeType = 1; this.tagName = tag.toUpperCase(); this.childNodes = [];
    this.classList = {add:(c)=>{this.className=[...new Set(((this.className||'')+' '+c).split(' '))].join(' ')},remove:(c)=>{this.className=(this.className||'').split(' ').filter(x=>x!==c).join(' ')},toggle:(c,on)=>on?this.classList.add(c):this.classList.remove(c)};
    this.style={}; this.dataset = {}; this.value = ''; this.hidden = false;
  }
  set value(value){this._value=String(value)}
  get value(){return this._value??''}
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
    if(selector.includes('>')){const parts=selector.split('>');return this.matches(parts.pop().trim())&&!!this.parentElement?.matches(parts.join('>').trim())}
    if(selector.includes(' ')){const parts=selector.split(' ');return this.matches(parts.pop())&&!!this.parentElement?.closest(parts.join(' '))}
    const attrs=[...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
    if(!attrs.every(([,k,v])=>this[k]!==undefined&&(v===undefined||this[k]===v)))return false;
    selector=selector.replace(/\[[^\]]+\]/g,'');
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    if(selector.startsWith('.'))return selector.slice(1).split('.').every(c=>(this.className||'').split(' ').includes(c));
    return !selector||this.tagName===selector.toUpperCase();
  }
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null}
  appendChild(el){this.append(el);return el}
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
