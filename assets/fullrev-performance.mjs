import {indices} from './fullrev-answer-ui.mjs?v=20261124summary';
// 通用排卡與演出播放器；只顯示授權題面及 Worker 回傳的本次執行，不在前端判題。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function renderPerformance(host,d,api){
  if(!['tea-performance','memory-performance'].includes(d.mode))return;
  host.append(node('style',`.fullrev-performance button{min-height:44px;max-width:100%;white-space:normal;overflow-wrap:anywhere}.fullrev-performance .slot-row{display:flex;gap:6px;align-items:center;margin:6px 0}.fullrev-performance .slot-row>button:first-child{flex:1;min-width:0}.fullrev-performance .active{outline:3px solid var(--a,#426b79)}.fullrev-performance .machine{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.fullrev-performance .memory-row{padding:6px;border:1px solid #aaa;overflow-wrap:anywhere}`));
  const box=node('div');box.className='fullrev-performance';host.append(box);
  const pool=node('section'),slots=node('section'),stage=node('section'),controls=node('div');
  const initial=node('section');initial.className='machine';box.append(initial,pool,slots,controls,stage);
  const memory=(label,rows)=>{const e=node('section');e.append(node('h3',label));for(const [key,value] of rows){const row=node('p',`${key}：${value===''?'空格':value}`);row.className='memory-row';e.append(row);}return e;};
  if(d.cells)initial.append(memory('點單牆（RAM）',d.cells.map(([k,v])=>[`${k} ${Object.fromEntries(d.labels)[k]}`,v])));
  else{initial.append(memory(`RAM：${d.machine.cap} 格，${d.machine.power?'開機中':'關機'}`,d.ram||[['空格','']]));initial.append(memory('儲存空間',d.disk));}
  box.append(node('p','先排卡再送出，觀看店長／CPU、RAM 與輸出的演出。同一排卡會連續驗證兩組不同資料；兩組都成立才過關，錯答可修正再送出。'));
  let powerOff=false,values=Array(d.slotCount).fill(null),selected=null,timer=null,steps=[],position=0;
  if(Array.isArray(api.carry)&&api.carry.length===values.length&&api.carry.every(k=>Number.isInteger(k)&&k>=0&&k<d.cards.length))values=[...api.carry];
  const stop=()=>{clearTimeout(timer);timer=null;};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
  function edit(){stop();stage.replaceChildren();draw();api.changed();}
  function draw(){
    pool.replaceChildren(node('h3','可用的卡片'));slots.replaceChildren(node('h3','你的順序'));
    d.cards.forEach((text,k)=>{if(values.includes(k))return;const b=button(`${d.users[k]?d.users[k]+'｜':''}${text}`,()=>{const j=selected??values.indexOf(null);if(j<0)return;values[j]=k;selected=null;edit();});b.dataset.poolIndex=k;pool.append(b);});
    values.forEach((k,j)=>{const row=node('div');row.className='slot-row';const b=button(`${j+1}．${k===null?'待放入':d.cards[k]}`,()=>{if(k===null)selected=j;else{values[j]=null;selected=null;}edit();});b.dataset.slotIndex=j;b.setAttribute('aria-pressed',String(selected===j));row.append(b);
      for(const delta of [-1,1]){const move=button(delta===-1?'▲':'▼',()=>{[values[j],values[j+delta]]=[values[j+delta],values[j]];edit();});move.disabled=j+delta<0||j+delta>=values.length;move.setAttribute('aria-label',`第 ${j+1} 步往${delta===-1?'上':'下'}移`);row.append(move);}slots.append(row);});
  }
  let powerButton;
  if(d.cells)controls.append(powerButton=button('停電／開店示意',()=>{powerOff=!powerOff;initial.replaceChildren(memory(powerOff?'點單牆斷電：RAM 清空':'點單牆（RAM）',d.cells.map(([k,v])=>[`${k} ${Object.fromEntries(d.labels)[k]}`,powerOff?'':v])));edit();}));
  controls.append(button('全部拿回來',()=>{values.fill(null);selected=null;edit();}));
  function frame(){
    const s=steps[position];if(!s)return;
    stage.dataset.performanceFrame=position;stage.replaceChildren(node('h3',`第 ${(s.group??0)+1} 組，第 ${position+1}／${steps.length} 步：${d.cards[s.card]}`));
    for(const b of slots.querySelectorAll('[data-slot-index]'))b.classList.toggle('active',Number(b.dataset.slotIndex)===position);
    const views=node('div');views.className='machine';views.append(memory('RAM',s.memory));if(s.storage.length)views.append(memory('儲存空間',s.storage));stage.append(views);
    for(const text of [`使用者看到：${s.user}`,`店長／控制單元：${s.control}`,`搖飲師／CPU：${s.calculation||'—'}；手上：${s.hand}`,`出餐口／螢幕：${s.output||'—'}`,`電源：${s.power?'開':'關'}；已等 ${s.time} 秒`])stage.append(node('p',text));
    if(s.bad)stage.append(node('p','這一步卡住了，檢查依賴後修正同一題。'));
    const bar=node('div');bar.append(button('上一步',()=>{stop();position=Math.max(0,position-1);frame();}),button(timer?'暫停':'播放演出',()=>{if(timer){stop();frame();}else{if(position===steps.length-1)position=0;schedule();frame();}}),button('下一步',()=>{stop();position=Math.min(steps.length-1,position+1);frame();}));stage.append(bar);
  }
  function schedule(){stop();timer=setTimeout(()=>{timer=null;if(!host.isConnected)return;if(position<steps.length-1){position++;schedule();}frame();},matchMedia('(prefers-reduced-motion: reduce)').matches?700:1500);}
  draw();
  return {draft:()=>({values:[...values],powerOff}),restoreDraft(v){if(!v||!indices(v.values,values.length,d.cards.length,{unique:true})||typeof v.powerOff!=='boolean'||v.powerOff&&!powerButton)return false;values=[...v.values];if(powerOff!==v.powerOff)powerButton.click();else draw();return true;},
    fields:()=>[...(powerButton?[{target:powerButton,reason:powerOff?'請恢復開店':''}]:[]),...[...slots.querySelectorAll('.slot-row')].map((target,k)=>({target,reason:values[k]===null?'請放入卡片':''}))],get:()=>[...values],carry:()=>values.every(k=>k!==null)?[...values]:undefined,ready:()=>!powerOff&&values.every(k=>k!==null),dispose:stop,
    readyReason:()=>powerOff?'目前是停電示意，請先恢復開店。':values.includes(null)?`還有 ${values.filter(k=>k===null).length} 張卡沒排好。`:'',
    feedback(trace){stop();steps=trace.steps;position=0;schedule();frame();}};
}
