// 僅接收 Worker 的另一題投影；不產生或推算目前題目的答案。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const previous=new WeakMap();
export function highlightChangedNumbers(host,q){
 const key=q.type+':'+(q.data.mode||'')+':'+(q.data.heading||''),old=previous.get(host);
 const elements=[...host.querySelectorAll('p'),...host.querySelectorAll('td'),...host.querySelectorAll('th')];
 const texts=elements.map(e=>e.textContent);previous.set(host,{key,texts});
 if(!old||old.key!==key)return;
 elements.forEach((e,i)=>{
  // 只處理純文字題面，保留互動欄位與圖形。
  if(e.childNodes.length!==1||e.firstChild.nodeType!==3||old.texts[i]===texts[i])return;
  const before=(old.texts[i]||'').match(/\d+(?:\.\d+)?/g)||[];let n=0;
  const parts=texts[i].split(/(\d+(?:\.\d+)?)/g);e.replaceChildren();
  parts.forEach((part,j)=>{const el=node(j%2&&part!==before[n++]?'mark':'span',part);
   if(el.tagName==='MARK'){el.className='changed-number';el.setAttribute('title','這組的新數值');el.style.cssText='background:var(--highlight,#fff0ad);color:var(--ink,#211b17);border-bottom:2px solid currentColor;padding:0 2px';}e.append(el);});
 });
}
export function mountHintExample({host,example,renderQuestion,onClose=()=>{}}){
 host.replaceChildren();
 if(!example?.question?.data||!Object.hasOwn(example,'answer')){const back=node('button','回原題繼續做');back.type='button';back.className='btn';back.onclick=onClose;host.append(node('p','這一關的另一題示範尚未取得，請先依步驟練習。'),back);return {dispose(){host.replaceChildren();}};}
 host.append(node('h3','第 3 層：另一題示範'),node('p','用另一組資料練習，再回原題自己做。'));
 const stage=node('section'),answer=node('p'),back=node('button','回原題繼續做');back.type='button';back.className='btn';back.onclick=onClose;
 host.append(stage,answer,back);
 const d=example.question.data,a=example.answer;
 const carry=d.mode==='photo'&&Array.isArray(a)?{n:a[0],d:a[1],answers:[a.slice(2)]}:undefined;
 const handle=renderQuestion(example.question,stage,{changed(){},demonstration:true,shell:false,carry});
 // 用另一題的授權解答填示範欄位，再停用操作；不觸發原題的 changed／送出。
 for(const input of stage.querySelectorAll('[data-answer-field]')){
  const k=input.dataset.answerField,v=d.mode==='ascii-encode'&&Array.isArray(a)?a.join(' '):a&&typeof a==='object'?a[k]:a;
  if(v!==undefined){input.value=String(v);input.oninput?.();}
 }
 for(const b of stage.querySelectorAll('[data-bit]'))if(a?.[Number(b.dataset.bit)]===1)b.click();
 if(d.cards&&Array.isArray(a))for(const k of a)stage.querySelector(`[data-pool-index="${k}"]`)?.click();
 for(const b of stage.querySelectorAll('[data-choice]')){
  if(b.dataset.row===undefined)continue;
  const v=Array.isArray(a)?a[Number(b.dataset.row)]:a;if(Number(b.dataset.choice)===v)b.click();
 }
 for(const b of stage.querySelectorAll('[data-multi-index]'))if(Array.isArray(a)&&a.includes(Number(b.dataset.multiIndex)))b.click();
 for(const b of [...stage.querySelectorAll('button'),...stage.querySelectorAll('input'),...stage.querySelectorAll('select')])b.disabled=true;
 // 解答獨立顯示；不改原題的 handle、已填內容、送出與進度。
 const describe=v=>Array.isArray(v)?v.map(describe).join('、'):v&&typeof v==='object'?Object.entries(v).map(([k,x])=>k+'：'+describe(x)).join('；'):d.cards&&Number.isInteger(v)?d.cards[v]??String(v):d.options&&Number.isInteger(v)?d.options[v]??String(v):String(v);
 answer.textContent='示範解答：'+describe(example.answer);
 if(example.performance&&handle.feedback){const play=node('button','播放這題示範');play.type='button';play.className='btn';play.onclick=()=>handle.feedback(example.performance);host.append(play);}
 for(const text of example.notes||[])host.append(node('p',text));
 return {dispose(){handle?.dispose?.();host.replaceChildren();}};
}
