import {inputState,indices} from './fullrev-answer-ui.mjs';
import {highlightChangedNumbers} from './fullrev-student-support.mjs';
import {renderRecording} from './fullrev-recording.mjs';
// PR6：只包含公開導覽與 renderer；正式題面與判定均由 Worker 提供。
import {renderPhotos} from './fullrev-photos.mjs';
import {renderPerformance} from './fullrev-performance.mjs';
import {renderOutcome} from './fullrev-outcomes.mjs';
import {renderVolunteerSheet,SHEET_MODE} from './fullrev-volunteer-sheet.mjs';
const activityCourse=a=>a.course===undefined?'115-g9':a.course;
const activityKey=a=>`${activityCourse(a)}:${a.activity}`;
const nonblank=value=>typeof value==='string'&&value.trim().length>0;
// 活動公開資料只有這個來源；各批次只登記課程／ID 與納管關卡。
const ACTIVITY_METADATA=[
  {activity:4,file:'115-g9/u2-02/index.html',title:'錄滿一整場',unit:2,rounds:['聲音取樣','影像像素','影片組成','錄滿一整場']},
  {activity:5,file:'115-g9/u2-03/index.html',title:'燈牌只有亮和暗',unit:2,rounds:['點亮生日','看燈猜數字','沒有標數字的燈牌','要幾顆燈才夠','燈牌要幾個位元組']},
  {activity:16,file:'115-g9/u5-01/index.html',title:'倒數一百天的 AI',unit:5,rounds:['是不是 AI','AI 在做哪一種事','資料出了什麼問題','一個 AI 怎麼做出來']},
  {activity:17,file:'115-g9/u5-02/index.html',title:'AI 說的就對嗎',unit:5,rounds:['哪裡出了問題','可以這樣用嗎','幫 AI 查證','這是真的嗎']},
  {activity:18,file:'115-g9/u5-03/index.html',title:'寫給學弟妹的繪本',unit:5,rounds:['是不是生成式 AI','提示詞少了什麼','選出最好的提示詞','猜下一個字']},
  {activity:26,file:'115-g9/u1-01/index.html',title:'開賣倒數十秒',unit:1,rounds:['這是哪一種電腦','拆成三層','新的電腦平台','哪一層出問題']},
  {activity:30,file:'115-g9/u0-01/index.html',title:'登入，出發',unit:0,rounds:['登入因材網','電腦教室規則','成績怎麼算','這學期的故事']},
  {activity:6,file:'115-g9/u2-04/index.html',title:'傳給阿嬤的方塊',unit:2,rounds:['用編碼表解密','換成編碼','亂碼是怎麼來的','方塊還是亂碼']},
  {activity:10,file:'115-g9/u4-01/index.html',title:'馬祖斷線了',unit:4,rounds:['幫訊息找路','斷了會影響誰','選傳輸媒介','訊號要跑多久']},
  {activity:11,file:'115-g9/u4-02/index.html',title:'差一個字母的網站',unit:4,rounds:['把封包組回來','網址的真名','少了哪一包','名字換門牌']},
  {activity:12,file:'115-g9/u4-03/index.html',title:'Wi-Fi 死角在哪裡',unit:4,rounds:['選無線技術','收得到嗎','找出 Wi-Fi 死角','路由器放哪裡']},
  {activity:13,file:'115-g9/u4-04/index.html',title:'短影音怎麼猜中我',unit:4,rounds:['這是哪一種服務','猜下一支推薦','是不是物聯網','感測、連網、動作']},
  {activity:14,file:'115-g9/u4-05/index.html',title:'影片住在哪個國家',unit:4,rounds:['在手機上還是雲端','租哪一種雲','誰管哪一層','資料中心蓋在哪']},
  {activity:15,file:'115-g9/u4-06/index.html',title:'問 AI 一個問題',unit:4,rounds:['一個問題的旅程','這一步是哪一單元','雲端版和手機版','雲端算還是手機算']},
  {activity:19,file:'115-g9/u5-04/index.html',title:'繪本需要插圖',unit:5,rounds:['哪一句提示詞','改一個詞','可以放進繪本嗎','排好繪本頁']},
  {activity:20,file:'115-g9/u5-05/index.html',title:'回收分類機',unit:5,rounds:['照著樹分類','哪一題分得最乾淨','自己蓋一棵樹','考考這棵樹']},
  {activity:21,file:'115-g9/u5-06/index.html',title:'跟誰最像',unit:5,rounds:['最近的鄰居','找 3 個鄰居投票','畫一條線來預測','感知器要不要開攤']},
  {activity:22,file:'115-g9/u5-07/index.html',title:'讓資料自己分組',unit:5,rounds:['有沒有標準答案','靠近哪一個中心','把中心搬到中間','跑到不動為止']},
  {activity:23,file:'115-g9/u5-08/index.html',title:'服務台放哪裡',unit:5,rounds:['去最近的服務台','搬到正中間','哪一種分得好','要放幾個服務台']},
  {activity:24,file:'115-g9/u5-09/index.html',title:'教 AI 認手勢',unit:5,rounds:['這批照片夠好嗎','訓練和測試要分開','讀懂混淆矩陣','怎麼改進']},
  {activity:25,file:'115-g9/u5-10/index.html',title:'猜拳贏 AI',unit:5,rounds:['誰贏了','程式的順序','有把握才算數','讓 AI 會贏']},
  {activity:27,file:'115-g9/u1-02/index.html',title:'加場搶票被踢出來',unit:1,rounds:['輪流用 CPU','看懂工作管理員','有人插隊','記憶體不夠了']},
  {activity:28,file:'115-g9/u1-03/index.html',title:'為了演唱會換手機',unit:1,rounds:['倒帶時間軸','它是哪一代','晶片環遊世界','每兩年翻一倍']},
  {activity:29,file:'115-g9/u1-04/index.html',title:'演唱會倒數直播',unit:1,rounds:['收進來還是送出去','輸入、處理、輸出','幫小裝置挑零件','直播的一秒鐘']},
  {activity:7,file:'115-g9/u2-05/index.html',title:'動漫／遊戲展志工招募',unit:2,rounds:['報名回覆藏著什麼','志工資料只收必要的','讓每位報名者走對路','上線招募前最後檢查']},
  {activity:8,file:'115-g9/u2-06/index.html',title:'志工回覆整理所',unit:2,rounds:['收件截止，先保住原始回覆','顏色只提醒，你決定哪些列留下','送出時間不同，也可能是同一份回覆','哪個職務缺回覆，圖表要有依據']},
  {activity:9,file:'115-g9/u2-07/index.html',title:'影片傳到群組變糊',unit:2,rounds:['今天必做：把公告變成能修改的文字','今天必做：壓得短，還原得回來嗎','另排時間完成：少掉的細節還能接受嗎','另排時間完成：把素材打包，保住該保留的內容']},
  {activity:1,file:'115-g9/u1-05/index.html',title:'深夜手搖店 CPU',unit:1,rounds:['第 1 單','第 2 單','錢夠不夠？','班級團購']},
  {activity:2,file:'115-g9/u1-06/index.html',title:'打王前記得存檔',unit:1,rounds:['開遊戲','打王前存檔','RAM 滿了','從開機到存檔']},
  {activity:3,file:'115-g9/u2-01/index.html',title:'看台最後一排',unit:2,rounds:['看清背號','認出應援色','容量剛好夠','衛星數遊覽車']},
  {course:'115-df',activity:1,file:'115-df/a/index.html',title:'資料偵探',unit:null,rounds:['提出 H1','完成結論','完成反思']}
];
const metadata=new Map(validateActivityCatalog(ACTIVITY_METADATA.map(a=>({...a,managed:[]})))
  .map(({managed,...a})=>[activityKey(a),a]));
function activityBatch(registrations){
  const activities=registrations.map(a=>{
    if(Object.keys(a).some(key=>!['course','activity','managed'].includes(key)))throw Error('catalog_batch_metadata:'+activityKey(a));
    const source=metadata.get(activityKey(a));
    if(!source)throw Error('catalog_unknown_activity:'+activityKey(a));
    return {...source,rounds:[...source.rounds],managed:[...a.managed]};
  });
  return Object.freeze(validateActivityCatalog(activities));
}
export const BATCH1=activityBatch([
  {activity:4,managed:[3]},
  {activity:5,managed:[0,1,2,3,4]},
  {activity:16,managed:[0,1,2,3]},
  {activity:17,managed:[0,1,2,3]},
  {activity:18,managed:[0,1,2,3]},
  {activity:26,managed:[0,1,2,3]},
  {activity:30,managed:[0,1,2,3]}
]);
export const BATCH2=activityBatch([
  {activity:6,managed:[0,1,2,3]},
  {activity:10,managed:[0,1,2,3]},
  {activity:11,managed:[0,1,2,3]},
  {activity:12,managed:[0,1,2,3]},
  {activity:13,managed:[0,1,2,3]},
  {activity:14,managed:[0,1,2,3]}
]);
export const BATCH3=activityBatch([
  {activity:15,managed:[0,1,2,3]},
  {activity:19,managed:[0,1,2,3]},
  {activity:20,managed:[0,1,2,3]},
  {activity:21,managed:[0,1,2,3]},
  {activity:22,managed:[0,1,2,3]},
  {activity:23,managed:[0,1,2,3]}
]);
export const BATCH4=activityBatch([
  {activity:24,managed:[0,1,2,3]},
  {activity:25,managed:[0,1,2,3]},
  {activity:27,managed:[0,1,2,3]},
  {activity:28,managed:[0,1,2,3]},
  {activity:29,managed:[0,1,2,3]}
]);
export const BATCH5=activityBatch([
  {activity:7,managed:[0,1,2,3]},
  {activity:8,managed:[0,1,2,3]},
  {activity:9,managed:[0,1,2,3]}
]);
export const BATCH6=activityBatch([
  {activity:1,managed:[0,1,2,3]},
  {activity:2,managed:[0,1,2,3]}
]);
export const BATCH7=activityBatch([
  {activity:3,managed:[0,1,2,3]}
]);
export const BATCH8=activityBatch([
  {activity:4,managed:[0,1,2]},
  {course:'115-df',activity:1,managed:[0,1,2]}
]);
// 單份目錄的 ID 以課程區分；managed 是零起算索引，不能靠合併時去重掩蓋錯誤。
export function validateActivityCatalog(activities) {
  if(!Array.isArray(activities))throw Error('catalog_invalid');
  const keys=new Set(),files=new Set();
  for(const a of activities) {
    if(!a||typeof a!=='object'||Array.isArray(a))throw Error('catalog_invalid_entry');
    const course=activityCourse(a);
    if(!nonblank(course)||course!==course.trim())throw Error('catalog_invalid_course');
    if(!Number.isSafeInteger(a.activity)||a.activity<=0)throw Error('catalog_invalid_activity');
    const key=activityKey(a);
    if(keys.has(key))throw Error('catalog_duplicate_activity:'+key);
    keys.add(key);
    if(!nonblank(a.file)||!nonblank(a.title)||(a.unit!==null&&(!Number.isSafeInteger(a.unit)||a.unit<0)))throw Error('catalog_invalid_metadata:'+key);
    if(files.has(a.file))throw Error('catalog_duplicate_file:'+a.file);
    files.add(a.file);
    if(!Array.isArray(a.rounds)||!a.rounds.length)throw Error('catalog_invalid_rounds:'+key);
    for(const name of a.rounds)if(!nonblank(name))throw Error('catalog_invalid_rounds:'+key);
    if(!Array.isArray(a.managed))throw Error('catalog_invalid_managed:'+key);
    const managed=new Set();
    for(const round of a.managed) {
      if(!Number.isSafeInteger(round)||round<0||round>=a.rounds.length)throw Error('catalog_invalid_managed:'+key);
      if(managed.has(round))throw Error('catalog_duplicate_managed:'+key);
      managed.add(round);
    }
  }
  return activities;
}
// 同一活動可由不同批次分管關卡，但公開資料與關卡順序必須一致，且不能重複納管。
export function mergeActivityBatches(batches) {
  if(!Array.isArray(batches))throw Error('catalog_invalid_batches');
  const combined=new Map();
  for(const batch of batches)for(const a of validateActivityCatalog(batch)) {
    const key=activityKey(a),previous=combined.get(key);
    if(previous) {
      if(['file','title','unit'].some(field=>previous[field]!==a[field])||previous.rounds.length!==a.rounds.length||previous.rounds.some((name,r)=>name!==a.rounds[r]))throw Error('catalog_batch_mismatch:'+key);
      if(a.managed.some(round=>previous.managed.includes(round)))throw Error('catalog_managed_overlap:'+key);
    }
    combined.set(key,{...a,rounds:[...a.rounds],managed:[...(previous?.managed||[]),...a.managed]});
  }
  return validateActivityCatalog([...combined.values()]);
}
export const MANAGED_ACTIVITIES=Object.freeze(validateActivityCatalog([...BATCH1,...BATCH2,...BATCH3,...BATCH4,...BATCH5,...BATCH6,...BATCH7]));
const COMPLETE_ACTIVITIES=Object.freeze(mergeActivityBatches([MANAGED_ACTIVITIES,BATCH8]));
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function section(host,title,text) {
  if(!text)return;const box=node('section');box.className='panel';box.append(node('h3',title),node('p',Array.isArray(text)?text.join(''):text));host.append(box);
}
function picks(host,rows,choices,changed,{describe=false}={}) {
  const values=rows.map(()=>null),targets=[];
  const list=node('div');list.className='rows';host.append(list);
  rows.forEach((text,r)=>{
    const row=node('section'),question=node('div'),options=node('div');row.className='row';question.className='q';options.className='picks';
    const split=describe?text.indexOf('：'):-1;
    if(split>0)question.append(node('b',text.slice(0,split)),node('small',text.slice(split+1)));else question.textContent=text;
    row.append(question,options);targets.push(options);
    choices(r).forEach((label,j)=>{
      const b=node('button',label);b.type='button';b.className='pk';b.dataset.row=r;b.dataset.choice=j;b.setAttribute('aria-pressed','false');
      b.onclick=()=>{values[r]=values[r]===j?null:j;row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.choice)===values[r])));changed();};options.append(b);
    });list.append(row);
  });
  return {get:()=>[...values],ready:()=>values.every(v=>v!==null),fields:()=>targets.map((target,k)=>({target,reason:values[k]===null?'請選一項':''})),draft:()=>[...values],
    restoreDraft(v){if(!indices(v,values.length,Math.max(...rows.map((_,k)=>choices(k).length)))||v.some((x,k)=>x!==null&&x>=choices(k).length))return false;v.forEach((x,k)=>{values[k]=x;targets[k].querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(j===x)));});changed();return true;}};
}
function ordered(host,cards,changed,{ai=false}={}) {
  const layout=node('div'),pool=node('div'),slots=node('div'),values=cards.map(()=>null);layout.className='two';pool.className='picks ob-pool';slots.className='slots ob-slots';
  for(const [content,title,hint] of [[pool,ai?'步驟卡':'卡片','點一下放進右邊下一格'],[slots,ai?'做 AI 的順序':'順序','點格子裡的卡片拿回去']]){
    const box=node('section'),heading=node('div'),tip=node('span',hint);box.className='panel';heading.className='ptitle';tip.className='small';heading.append(node('h3',title),tip);box.append(heading,content);layout.append(box);
  }host.append(layout);
  function draw(){
    pool.replaceChildren();slots.replaceChildren();
    cards.forEach((text,k)=>{if(values.includes(k))return;const b=node('button',text);b.type='button';b.className='pk';b.dataset.poolIndex=k;
      b.onclick=()=>{const next=values.indexOf(null);if(next<0)return;const focused=document.activeElement===b;values[next]=k;draw();changed();if(focused)(pool.querySelector('button')||slots.querySelector(`[data-slot-index="${next}"]`))?.focus();};pool.append(b);});
    if(values.every(v=>v!==null)){const done=node('p','都排好了，按「送出」。');done.className='small';pool.append(done);}
    values.forEach((k,j)=>{const row=node('div'),number=node('span',String(j+1));row.className='slot';number.className='n';row.append(number);
      if(k===null){const empty=node('span',ai&&j===0?'最先':ai&&j===cards.length-1?'最後':'　');empty.className='empty';row.append(empty);}
      else{const b=node('button',cards[k]);b.type='button';b.className='pk';b.dataset.slotIndex=j;b.onclick=()=>{const focused=document.activeElement===b;values[j]=null;draw();changed();if(focused)pool.querySelector(`[data-pool-index="${k}"]`)?.focus();};row.append(b);}slots.append(row);});
  }draw();return {get:()=>[...values],ready:()=>values.every(v=>v!==null),fields:()=>[...slots.querySelectorAll('.slot')].map((target,k)=>({target,reason:values[k]===null?'請放入卡片':''})),draft:()=>[...values],
    restoreDraft(v){if(!indices(v,values.length,cards.length,{unique:true}))return false;values.splice(0,values.length,...v);draw();return true;}};
}
function numberFields(host,fields,changed) {
  const inputs={};for(const [key,text,options] of fields) {
    const label=node('label',text),input=node(options?'select':'input');
    if(options){input.append(node('option','請選擇'));input.firstChild.value='';for(const [value,text] of options){const o=node('option',text);o.value=value;input.append(o);}}
    else {input.type='text';input.inputMode='numeric';input.autocomplete='off';}
    input.dataset.answerField=key;input.className='num-in';label.style.display='block';label.append(input);host.append(label);input.oninput=input.onchange=changed;inputs[key]=input;
  }
  const valid=input=>input.value!==''&&/^-?\d+$/.test(input.value.trim())&&Number.isSafeInteger(Number(input.value))&&Math.abs(Number(input.value))<=1e12;
  return {...inputState(Object.values(inputs),e=>valid(e)?'':e.tagName==='SELECT'?'請選一項':!e.value.trim()?'請填數字':'請填整數（絕對值不超過 1000000000000）'),get:()=>Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,Number(input.value)])),ready:()=>Object.values(inputs).every(valid),
    readyReason:()=>{const missing=Object.values(inputs).filter(e=>!e.value.trim()).length;
      return missing?`還有 ${missing} 格沒填或沒選。`:Object.values(inputs).every(valid)?'':'請填整數（絕對值不超過 1000000000000），不含單位或小數點。';}};
}
function multi(host,options,changed) {
  const values=new Set();options.forEach((text,k)=>{
    const b=node('button',text);b.type='button';b.className='pk';b.dataset.multiIndex=k;b.setAttribute('aria-pressed','false');
    b.onclick=()=>{values.has(k)?values.delete(k):values.add(k);b.setAttribute('aria-pressed',String(values.has(k)));changed();};host.append(b);
  });return {get:()=>[...values].sort((a,b)=>a-b),ready:()=>true,draft:()=>[...values],restoreDraft(v){if(!Array.isArray(v)||!indices(v,v.length,options.length,{unique:true})||v.includes(null))return false;values.clear();v.forEach(k=>values.add(k));host.querySelectorAll('[data-multi-index]').forEach(b=>b.setAttribute('aria-pressed',String(values.has(Number(b.dataset.multiIndex)))));return true;}};
}
function network(host,d) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 430 330');svg.setAttribute('role','img');svg.setAttribute('aria-label','網路線路示意圖');svg.style.cssText='width:100%;max-width:540px';
  const el=(tag,attrs)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);svg.append(e);return e;};
  const position=n=>d.nodes.find(p=>p[0]===n).slice(1),key=(a,b)=>[a,b].sort().join('|');
  const types={sea:'海纜',land:'陸上光纖',mw:'微波',sat:'衛星'};
  for(const [a,b,t] of d.edges){const [x1,y1]=position(a),[x2,y2]=position(b),cut=d.cut.includes(key(a,b));
    const line=el('line',{x1,y1,x2,y2,stroke:cut?'#a40000':'#555','stroke-width':2,'stroke-dasharray':cut?'4 4':t==='sat'?'2 5':t==='mw'?'8 4':'none'});
    const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=`${a} ↔ ${b}：${types[t]}${cut?'（斷了）':''}`;line.append(title);
    if(cut)el('text',{x:(x1+x2)/2,y:(y1+y2)/2,fill:'#a40000'}).textContent='✕';
  }
  for(const [name,x,y] of d.nodes){el('circle',{cx:x,cy:y,r:6,fill:'#333'});el('text',{x,y:y>280?y-10:y+20,'text-anchor':'middle','font-size':14}).textContent=name;}
  host.append(svg);section(host,'線路',d.edges.map(([a,b,t])=>`${a} ↔ ${b}（${types[t]}${d.cut.includes(key(a,b))?'，斷了':''}）`).join('；'));
}
// 與舊活動相同的教學用訊號模擬；只從授權題面的牆與候選位置計算可觀察數值。
function signals(walls,ap) {
  const [vx,hy,vd,hd]=walls,x0=ap%8+.5,y0=Math.floor(ap/8)+.5;
  return Array.from({length:48},(_,i)=>{const x=i%8+.5,y=Math.floor(i/8)+.5;let n=0;
    if((x0<=vx)!==(x<=vx)&&Math.floor(y0+(vx-x0)/(x-x0)*(y-y0))!==vd)n++;
    if((y0<=hy)!==(y<=hy)&&Math.floor(x0+(hy-y0)/(y-y0)*(x-x0))!==hd)n++;
    return Math.max(-90,Math.round(-34-7*Math.hypot(x-x0,y-y0)-13*n));
  });
}
function floor(host,walls,values,{ap,cells=[],click=()=>{},pressed=()=>false}={}) {
  const [vx,hy,vd,hd]=walls,grid=node('div');grid.style.cssText='display:grid;grid-template-columns:repeat(8,minmax(0,1fr));max-width:520px;margin:12px 0';grid.setAttribute('aria-label','活動中心平面圖');
  values.forEach((v,i)=>{const x=i%8,y=Math.floor(i/8),b=node('button',`${i===ap?'📶 ':''}${cells.includes(i)?'ABCD'[cells.indexOf(i)]:v}`);b.type='button';b.dataset.cell=i;b.className='pk';
    b.style.cssText=`min-width:0;min-height:44px;margin:0;padding:2px;font-size:12px;border:1px solid #aaa;${x===vx&&y!==vd?'border-left:4px solid #333;':''}${y===hy&&x!==hd?'border-top:4px solid #333;':''}`;
    b.setAttribute('aria-label',`第 ${i+1} 格${cells.includes(i)?'，位置 '+'ABCD'[cells.indexOf(i)]:''}，${v}`);b.setAttribute('aria-pressed',String(pressed(i)));b.onclick=()=>click(i,b);grid.append(b);
  });host.append(grid);return grid;
}
function ascii(host,d,changed) {
  const compare=node('div');compare.className='compare';const target=node('section'),mine=node('section');target.className=mine.className='panel';target.append(node('h3','目標'),node('p',d.mode==='ascii-decode'?d.codes.join(' '):d.prompt));mine.append(node('h3','我的'));compare.append(target,mine);host.append(compare);
  const table=node('details');table.open=true;table.append(node('summary','ASCII 編碼表'),node('p',[...' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c=>`${c===' '?'空格':c}：${c.charCodeAt(0)}`).join('　')));target.append(table);
  const input=node('input');input.dataset.answerField='text';input.autocomplete='off';input.spellcheck=false;input.maxLength=256;input.className='txt-in';input.style.cssText='width:100%;box-sizing:border-box';
  const label=node('label',d.mode==='ascii-decode'?'暗號是：':'編碼：');label.append(input);mine.append(label);const preview=node('p'),status=node('p');status.setAttribute('aria-live','polite');mine.append(preview,status);
  const nums=()=>/^\d+(?:[\s,，、]+\d+)*$/.test(input.value.trim())?input.value.trim().split(/[\s,，、]+/).map(Number):[];
  const get=()=>d.mode==='ascii-decode'?input.value.toUpperCase().replace(/\s+/g,' ').trim():nums();
  input.oninput=()=>{const a=get(),current=typeof a==='string'?[...a].map(c=>c.charCodeAt(0)):a,target=d.codes||[...d.prompt].map(c=>c.charCodeAt(0));
    preview.textContent='目前編碼：'+current.join(' ');const different=Array.from({length:Math.max(current.length,target.length)},(_,k)=>k).filter(k=>current[k]!==target[k]);
    status.textContent=!current.length?'尚未填入有效答案':different.length?`與目標相差 ${different.length} 個位置（含缺少或多出）；第一個差異在第 ${different[0]+1} 個位置`:'與目標相同';changed();};
  return {...inputState([input],()=>get().length>0&&(d.mode==='ascii-decode'||nums().length<=32&&nums().every(n=>Number.isSafeInteger(n)&&n<=1e12))?'':!input.value.trim()?'請填答案':'請填最多 32 個整數，用空格或逗號隔開'),get,ready:()=>get().length>0&&(d.mode==='ascii-decode'||nums().length<=32&&nums().every(n=>Number.isSafeInteger(n)&&n<=1e12)),
    readyReason:()=>!input.value.trim()?'請先填入答案。':d.mode==='ascii-decode'?'':'請填最多 32 個整數（每個不超過 1000000000000），用空格或逗號隔開。'};
}
function table(host,headers,rows) {
  const wrap=node('div'),t=node('table');wrap.style.cssText='max-width:100%;overflow-x:auto';t.style.cssText='border-collapse:collapse;width:100%';
  const head=node('tr');headers.forEach(text=>{const th=node('th',text);th.scope='col';head.append(th);});t.append(head);
  rows.forEach(row=>{const tr=node('tr');row.forEach(text=>{const td=node('td',text);td.style.cssText='padding:5px;border-bottom:1px solid #aaa';tr.append(td);});t.append(tr);});wrap.append(t);host.append(wrap);
  if(rows.length>8||headers.length>4){
    wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','資料表，可左右捲動');wrap.style.maxHeight='65vh';
    const tip=node('p','表格可左右、上下滑動；頂端欄名與左側第一欄會固定，方便對照。');tip.className='small table-position-tip';host.append(tip);
    [...t.querySelectorAll('th')].forEach(th=>{th.style.position='sticky';th.style.top='0';th.style.background='var(--panel, #fff)';th.style.zIndex='2';});
    [...t.querySelectorAll('tr')].forEach(tr=>{const cell=tr.children?.[0]||tr.firstChild;if(cell){cell.style.position='sticky';cell.style.left='0';cell.style.background='var(--panel, #fff)';}});
  }
}
const colors=['#2171b5','#a64b00','#167f50'];
// 所有圖形只使用授權題面中的觀察值；不繪製私有最近鄰、最佳線或收斂結果。
function plot(host,points,{centers=[],groups=[],lines=[],max=10,xLabel='橫座標',yLabel='直座標'}={}) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 440 450');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${xLabel}與${yLabel}散布圖`);svg.style.cssText='width:100%;max-width:480px';
  const el=(tag,attrs,text)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
  const x=v=>40+v/max*360,y=v=>400-v/max*360;
  for(let i=0;i<=10;i++){const v=i*max/10;el('line',{x1:x(v),y1:y(0),x2:x(v),y2:y(max),stroke:'#ddd'});el('line',{x1:x(0),y1:y(v),x2:x(max),y2:y(v),stroke:'#ddd'});
    if(i%2===0){el('text',{x:x(v),y:420,'text-anchor':'middle','font-size':13},v);el('text',{x:32,y:y(v)+4,'text-anchor':'end','font-size':13},v);}}
  lines.forEach(([m,b],i)=>{el('line',{x1:x(0),y1:y(b),x2:x(max),y2:y(m*max+b),stroke:colors[i],'stroke-width':3});el('text',{x:x(max)-12,y:y(m*max+b)-6,fill:colors[i]},'ABC'[i]);});
  points.forEach(([vx,vy],i)=>{const c=groups[i],cx=x(vx),cy=y(vy);
    if(c===-1)el('text',{x:cx,y:cy+8,'text-anchor':'middle','font-size':28},'★');
    else {el('circle',{cx,cy,r:10,fill:colors[c]||'#555'});el('text',{x:cx,y:cy+4,'text-anchor':'middle',fill:'white','font-size':11},i+1);}});
  centers.forEach(([vx,vy],i)=>{el('rect',{x:x(vx)-12,y:y(vy)-12,width:24,height:24,fill:'none',stroke:colors[i],'stroke-width':3});el('text',{x:x(vx)+14,y:y(vy)-12,fill:colors[i]},'ABC'[i]);});
  el('text',{x:220,y:445,'text-anchor':'middle'},xLabel);el('text',{x:8,y:18},yLabel);host.append(svg);
}
function scene(s) {
  const box=node('div');box.setAttribute('role','img');box.setAttribute('aria-label',`${s[7]}，在${s[4]}，${s[0]}${s[2]}`);
  box.style.cssText=`position:relative;width:100%;max-width:260px;aspect-ratio:4/3;overflow:hidden;border:1px solid #555;background:${s[8]}`;
  const ground=node('div');ground.style.cssText=`position:absolute;inset:66% 0 0;background:${s[6]}`;box.append(ground);
  for(const [text,left,bottom,size] of [[s[5],'8%','26%',36],[s[1],'44%','12%',52],[s[3],'68%','18%',30],[s[9],'78%','72%',24]]) {
    const e=node('span',text);e.style.cssText=`position:absolute;left:${left};bottom:${bottom};font-size:${size}px`;box.append(e);
  }return box;
}
function numberLine(host,values,centers=[]) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 90');svg.setAttribute('role','img');svg.setAttribute('aria-label','每天讀書分鐘數線');svg.style.cssText='width:100%;max-width:640px';
  const el=(tag,attrs,text)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);};
  const x=v=>20+v*4;el('line',{x1:20,y1:45,x2:620,y2:45,stroke:'#555'});
  for(let t=0;t<=150;t+=30){el('line',{x1:x(t),y1:41,x2:x(t),y2:49,stroke:'#555'});el('text',{x:x(t),y:72,'text-anchor':'middle','font-size':14},t);}
  values.forEach(v=>el('circle',{cx:x(v),cy:45,r:5,fill:'#555'}));centers.forEach((v,k)=>el('text',{x:x(v),y:26,fill:colors[k],'text-anchor':'middle','font-size':18},'AB'[k]));host.append(svg);
}
function chipJourney(host,d,changed) {
  const preview=node('section');preview.className='panel';
  const xy={'美國':[700,96],'台灣':[372,150],'馬來西亞':[250,236],'印度':[88,166],'越南':[262,150],'中國':[300,84]};
  const region=p=>Object.keys(xy).find(k=>p.startsWith(k));
  const h=ordered(host,d.cards,()=>{draw();changed();});host.append(preview);
  function draw(){
    const places=h.get().filter(k=>k!==null).map(k=>region(d.places[k]));preview.replaceChildren(node('h3','照你排的順序，晶片這樣跑'),node('p',places.join(' → ')));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 280');svg.setAttribute('role','img');svg.setAttribute('aria-label','晶片旅程地圖');svg.style.cssText='width:100%;max-width:800px';
    const el=(tag,attrs,text)=>{const e=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);};
    places.forEach((p,k)=>{if(!k||p===places[k-1])return;const [x,y]=xy[places[k-1]],[tx,ty]=xy[p];el('path',{d:`M${x} ${y} Q${(x+tx)/2} ${Math.min(y,ty)-40} ${tx} ${ty}`,fill:'none',stroke:'#2171b5','stroke-width':3,'stroke-dasharray':'6 5'});});
    for(const [name,[x,y]] of Object.entries(xy)){el('circle',{cx:x,cy:y,r:places.includes(name)?9:5,fill:places.includes(name)?'#2171b5':'#aaa'});el('text',{x,y:y+30,'text-anchor':'middle','font-size':18},name);}
    places.forEach((p,k)=>{const [x,y]=xy[p],offset=places.slice(0,k).filter(v=>v===p).length;el('text',{x:x+14+offset*18,y:y-12,'font-size':18},k+1);});preview.append(svg);
  }draw();return h;
}
function platformQuestion(host,d,changed) {
  const single=()=>{const h=picks(host,['請選一個'],()=>d.options,changed);return {...h,get:()=>h.get()[0]};};
  if(d.mode==='confusion-matrix'){
    table(host,['真正 ＼ AI 猜',...d.gestures],d.matrix.map((r,k)=>[d.gestures[k],...r]));
    host.lastChild.querySelectorAll('tr').forEach((row,k)=>{if(k)row.children[k].style.background='#d9f0df';});
    section(host,'測試張數',String(d.matrix.flat().reduce((s,v)=>s+v,0)));
    return numberFields(host,[['acc','準確率（%）'],['pair','AI 最常認錯的是',d.pairs.map(([r,c],k)=>[k,`把${d.gestures[r]}認成${d.gestures[c]}`])]],changed);
  }
  if(d.mode==='rps-results')return picks(host,d.rows.map(([p,c])=>`玩家：${d.gestures[p]}；電腦：${d.gestures[c]}`),()=>d.options,changed);
  if(d.mode==='rps-confidence'){
    section(host,'信心值門檻',`最高信心值 ≥ ${d.threshold}% 才採用，否則請再出一次。`);
    return picks(host,d.rows.map(row=>row.map((v,k)=>`${d.gestures[k]} ${v}%`).join('；')),()=>d.options,changed);
  }
  if(d.mode==='rps-counter'){section(host,'玩家最近出拳（由左到右）',d.history.map(k=>d.options[k]).join(' → '));return single();}
  if(d.mode==='cpu-schedule'){
    table(host,['App','從第幾格有工作','要用 CPU 幾格','最晚第幾格完成'],d.tasks.map(([name,need,deadline,release])=>[name,release,need,deadline]));
    section(host,'CPU 時間格','一格只能給一個 App；每個 App 要排滿需要的格數，工作出現前不能先做，並且必須在時限內完成。');
    const cards=d.tasks.flatMap((t,k)=>Array(t[1]).fill(k)),h=ordered(host,cards.map(k=>d.tasks[k][0]),changed);
    return {...h,get:()=>h.get().map(k=>k===null?null:cards[k])};
  }
  if(d.mode==='task-manager'){
    table(host,['App','CPU','記憶體'],d.options.map((n,k)=>[n,d.cpu[k]+'%',d.memory[k]+' MB']));
    section(host,'比較哪一欄',d.metric==='cpu'?'找出 CPU 百分比最高的 App。':'找出記憶體占用最多的 App。');return single();
  }
  if(d.mode==='memory-lru'){
    table(host,['App','占用記憶體','上次使用'],d.rows.map(([n,size,minutes,fg])=>[n,size+' GB',fg?'正在用（前景）':minutes+' 分鐘前']));
    section(host,'記憶體',`RAM 共 ${d.capacity} GB，系統用 ${d.system} GB，剩下 ${d.capacity-d.system-d.rows.reduce((s,r)=>s+r[1],0)} GB；搶票 App 需要 ${d.need} GB。`);
    return picks(host,d.rows.map(r=>r[0]),()=>d.options,changed);
  }
  if(d.mode==='chip-journey')return chipJourney(host,d,changed);
  if(d.mode==='moore'){
    section(host,'每兩年翻一倍',`${d.yearFrom} 年有 ${d.initial} 億個電晶體，計算到 ${d.yearTo} 年。`);
    const h=numberFields(host,[['value',d.question==='x'?'變成幾倍':'大約幾億個']],changed);return {...h,get:()=>h.get().value};
  }
  if(d.mode==='components'){
    const h=picks(host,d.rows.flatMap(([name,description])=>[`${name}：${description}（輸入零件）`,`${name}：${description}（輸出零件）`]),r=>r%2?d.outputs:d.inputs,changed);
    return {...h,get:()=>d.rows.map((_,k)=>h.get().slice(k*2,k*2+2))};
  }
}
function aiQuestion(host,d,changed) {
  const single=()=>{const h=picks(host,['請選一個'],()=>d.options,changed);return {...h,get:()=>h.get()[0]};};
  const vector=labels=>{const h=numberFields(host,labels.map((label,k)=>[String(k),label]),changed);return {...h,get:()=>Object.values(h.get())};};
  const yes=v=>v?'是':'否',rowLabel=r=>`${r[0]}：${d.features.map((f,k)=>f+' '+yes(r[k+1])).join('；')}`;
  if(d.mode==='scene-prompt'){host.append(scene(d.scene));return single();}
  if(d.mode==='scene-choice'){
    section(host,'原本的提示詞',d.originalPrompt);host.append(scene(d.originalScene));section(host,'改過的提示詞',d.prompt);
    let value=null;const choices=node('div');choices.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';host.append(choices);
    d.scenes.forEach((s,k)=>{const b=node('button');b.type='button';b.dataset.sceneChoice=k;b.setAttribute('aria-label',`第 ${k+1} 張`);b.setAttribute('aria-pressed','false');b.style.cssText='min-width:0;padding:4px';b.append(scene(s));
      b.onclick=()=>{value=k;choices.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(j===k)));changed();};choices.append(b);});
    return {get:()=>value,ready:()=>value!==null,fields:()=>[{target:choices,reason:value===null?'請選一張圖片':''}],draft:()=>value,restoreDraft(v){if(!Number.isInteger(v)||v<0||v>=d.scenes.length)return v===null;choices.querySelectorAll('button')[v].click();return true;}};
  }
  if(d.mode?.startsWith('tree-')) {
    if(d.mode==='tree-follow')return picks(host,d.rows.map(rowLabel),()=>d.options,changed);
    table(host,['東西',...d.features,'標籤'],d.rows.map(r=>[r[0],...r.slice(1,4).map(yes),d.mode==='tree-split'?(r[4]?'可回收':'不可回收'):d.options[r[4]]]));
    if(d.mode==='tree-split')return single();
    if(d.mode==='tree-accuracy'){const h=numberFields(host,[['value','準確率（%）']],changed);return {...h,get:()=>h.get().value};}
    const opts=xs=>xs.map((text,k)=>[k,text]);
    const h=numberFields(host,[['q1','① 問題',opts(d.features)],['a','是 → 類別',opts(d.options)],['q2','否 → ② 問題',opts(d.features)],['b','② 是 → 類別',opts(d.options)],['c','② 否 → 類別',opts(d.options)]],changed);
    const preview=node('p');preview.setAttribute('aria-live','polite');host.append(preview);
    host.querySelectorAll('select').forEach(input=>input.addEventListener('change',()=>{if(h.ready()){const a=h.get();preview.textContent=`用你的樹分對 ${d.rows.filter(r=>(r[1+a.q1]?a.a:r[1+a.q2]?a.b:a.c)===r[4]).length}／${d.rows.length} 件`;}}));return h;
  }
  if(d.mode==='knn'){
    plot(host,[...d.points,d.query],{groups:[...d.points.map(p=>p[2]),-1],xLabel:'甜度',yLabel:'冰塊量'});
    section(host,'圖例','藍色＝奶茶派；橘色＝果茶派；★＝新同學。');table(host,['點','甜度','冰塊量','類別'],d.points.map((p,k)=>[k+1,p[0],p[1],d.options[p[2]]]).concat([['★',...d.query,'待預測']]));return single();
  }
  if(d.mode==='regression'){
    plot(host,d.points,{lines:d.lines,max:20,xLabel:'排隊人數',yLabel:'等待分鐘'});table(host,['排隊人數','等待分鐘'],d.points);
    table(host,['線','斜率','截距'],d.lines.map((l,k)=>['ABC'[k],...l]));
    return numberFields(host,[['line','最貼近的線',d.lines.map((_,k)=>[k,'ABC'[k]+' 線'])],['y',`排 ${d.x} 人時預測等待幾分鐘`]],changed);
  }
  if(d.mode==='perceptron'){
    section(host,'權重與門檻',d.names.map((n,k)=>n+'：'+d.weights[k]).join('；')+'。總分 ≥ '+d.threshold+' 就開攤。');
    return picks(host,d.rows.map(r=>d.names.map((n,k)=>(r[k]?'✔ ':'✘ ')+n).join('；')),()=>d.options,changed);
  }
  if(['nearest-1d','means-1d','kmeans-1d'].includes(d.mode)){
    numberLine(host,d.values,d.centers);
    if(d.centers)section(host,'起始中心',`A：${d.centers[0]} 分鐘；B：${d.centers[1]} 分鐘`);
    const labels=d.names.map((n,k)=>`${n}：${d.values[k]} 分鐘`);
    if(d.mode==='nearest-1d')return picks(host,labels,()=>d.options,changed);
    table(host,['同學','分鐘',...(d.groups?['組別']:[])],d.names.map((n,k)=>[n,d.values[k],...(d.groups?['AB'[d.groups[k]]]:[])]));
    return vector(d.mode==='means-1d'?['新的中心 A','新的中心 B']:['最後的中心 A','最後的中心 B']);
  }
  if(['nearest-2d','centroid-2d','cluster-quality'].includes(d.mode)) {
    if(d.mode==='cluster-quality'){
      for(const k of ['A','B']){section(host,k==='A'?'小安的分法':'小禾的分法','藍色＝A 組；橘色＝B 組。');plot(host,d.points,{centers:d['centers'+k],groups:d['groups'+k]});table(host,['攤位','橫','直','組別'],d.points.map((p,j)=>[j+1,...p,'AB'[d['groups'+k][j]]]));section(host,'服務台位置',d['centers'+k].map((c,j)=>'AB'[j]+'：('+c.join(', ')+')').join('；'));}return single();
    }
    plot(host,d.points,{centers:d.centers,groups:d.groups});
    if(d.mode==='nearest-2d'){section(host,'服務台位置',d.centers.map((c,k)=>'AB'[k]+'：('+c.join(', ')+')').join('；'));return picks(host,d.points.map((p,k)=>`攤位 ${k+1}（${p.join(', ')}）`),()=>d.options,changed);}
    section(host,'圖例','藍色＝A 組；橘色＝B 組。');table(host,['攤位','橫','直','組別'],d.points.map((p,k)=>[k+1,...p,'AB'[d.groups[k]]]));return vector(['新的 A：橫座標','新的 A：直座標']);
  }
  if(d.mode==='elbow'){table(host,['服務台數量','總距離','比上一個少了'],d.values.map((v,k)=>[k+1,v,k?d.values[k-1]-v:'—']));return single();}
}
function renderQuestionControls(q,host,api) {
  const d=q.data;host.dataset.questionType=q.type;host.dataset.slot=q.slot;
  if(q.type==='finite-bank-v1'&&d.mode===SHEET_MODE)return renderVolunteerSheet(host,d,api);
  if(!api.shell)section(host,d.heading||q.title,d.story||q.instruction);
  if(q.type==='finite-bank-v1') {
    if(!api.shell){section(host,'任務',d.task);section(host,'提示',d.hint);}
    if(d.guide&&!api.shell){const detail=node('details');detail.append(node('summary','拆成步驟'),node('p',Array.isArray(d.guide)?d.guide.join(''):d.guide));host.append(detail);}
    if(d.references)section(host,'資料卡（課本整理）',d.references.join('\n'));
    if(d.prompt&&d.mode!=='scene-choice')section(host,'目標／提示詞',d.prompt);
    if(d.mode?.startsWith('recording-'))return renderRecording(q,host,api);
    const photo=renderPhotos(host,d,api);if(photo)return photo;
    const performance=renderPerformance(host,d,api);if(performance)return performance;
    const outcome=renderOutcome(host,d,api.changed,{shell:api.shell});if(outcome)return outcome;
    const platform=platformQuestion(host,d,api.changed);if(platform)return platform;
    const ai=aiQuestion(host,d,api.changed);if(ai)return ai;
    if(d.mode.startsWith('ascii-'))return ascii(host,d,api.changed);
    if(d.mode==='route'){
      network(host,d);let path=[d.from];const text=node('p'),buttons=node('div');host.append(text,buttons);
      const draw=()=>{buttons.dataset.routeLength=path.length;text.textContent='走法：'+path.join(' → ');buttons.replaceChildren();
        for(const [name] of d.nodes){const b=node('button',name);b.type='button';b.className='pk';b.dataset.routeNode=name;b.onclick=()=>{if(name===path.at(-1)&&path.length>1)path.pop();else if(!path.includes(name))path.push(name);draw();api.changed();};buttons.append(b);}
        const back=node('button','退一步');back.type='button';back.onclick=()=>{if(path.length>1)path.pop();draw();api.changed();};buttons.append(back);
      };draw();return {get:()=>[...path],draft:()=>path.slice(1),restoreDraft(v){if(!Array.isArray(v)||v.length>d.nodes.length||v.some(n=>!d.nodes.some(([name])=>name===n))||new Set([d.from,...v]).size!==v.length+1)return false;path=[d.from,...v];draw();return true;},fields:()=>[{target:buttons,reason:path.length>1?'':'請選下一站'}],ready:()=>path.length>1,readyReason:()=>path.length>1?'':'請先選下一站，排出傳送路線。'};
    }
    if(d.mode==='multi'){if(d.edges)network(host,d);return multi(host,d.options,api.changed);}
    if(d.mode==='wifi-dead'){
      const values=new Set();const grid=floor(host,d.walls,d.grid.flat(),{ap:d.ap,click:(i,b)=>{values.has(i)?values.delete(i):values.add(i);b.setAttribute('aria-pressed',String(values.has(i)));api.changed();}});
      return {get:()=>[...values].sort((a,b)=>a-b),ready:()=>true,draft:()=>[...values],restoreDraft(v){if(!Array.isArray(v)||!indices(v,v.length,48,{unique:true})||v.includes(null))return false;values.clear();v.forEach(k=>values.add(k));grid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(values.has(Number(b.dataset.cell)))));return true;}};
    }
    if(d.mode==='wifi-router'){
      let choice=null;const simulation=node('section');
      const grid=floor(host,d.walls,Array(48).fill(''),{cells:d.cells,click:(i)=>{if(!d.cells.includes(i))return;choice=d.cells.indexOf(i);grid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.cell)===i)));simulation.replaceChildren();
        const g=signals(d.walls,i);section(simulation,'模擬',`位置 ${'ABCD'[choice]}：收得到 ${g.filter(v=>v>=-70).length}／48 格`);floor(simulation,d.walls,g,{ap:i});api.changed();}});host.append(simulation);
      return {get:()=>choice,ready:()=>choice!==null,fields:()=>[{target:grid,reason:choice===null?'請選一個位置':''}],draft:()=>choice,restoreDraft(v){if(v===null)return true;if(!Number.isInteger(v)||v<0||v>=d.cells.length)return false;grid.querySelectorAll('button')[d.cells[v]].click();return true;}};
    }
    if(d.mode==='classify')return picks(host,d.rows,()=>d.options,api.changed,{describe:true});
    if(d.mode==='select'){const h=picks(host,['請選一個'],()=>d.options,api.changed);return {...h,get:()=>h.get()[0]};}
    if(d.mode==='order')return ordered(host,d.cards,api.changed,{ai:d.heading==='一個 AI 怎麼做出來'});
    if(d.mode==='tokens'){
      const sentence=node('p');sentence.setAttribute('aria-live','polite');host.append(sentence);
      const h=picks(host,['第 1 步','第 2 步','第 3 步'],r=>d.words.slice(r*4,r*4+4).map((w,j)=>`${w}（${d.weights[r*4+j]}%）`),()=>{sentence.textContent='國中的第一天，我'+h.get().map((v,r)=>v===null?'＿＿':d.words[r*4+v]).join('');api.changed();});return h;
    }
  }
  if(/^binary-encode-(5|8)-v1$/.test(q.type)) {
    section(host,'目標數字',String(d.target));
    const values=Array(d.width).fill(0),board=node('div');board.className='board';board.setAttribute('role','group');board.setAttribute('aria-label','燈牌');
    values.forEach((_,k)=>{const weight=d.width===5?' '+2**(d.width-k-1):'',b=node('button','○'+weight);b.type='button';b.className='pk';b.dataset.bit=k;b.setAttribute('aria-label',`第 ${k+1} 顆燈${weight?'，代表'+weight:''}`);b.setAttribute('aria-pressed','false');
      b.onclick=()=>{values[k]^=1;b.setAttribute('aria-pressed',String(!!values[k]));b.textContent=(values[k]?'●':'○')+weight;api.changed();};board.append(b);});host.append(board);
    return {get:()=>[...values],ready:()=>true,draft:()=>[...values],restoreDraft(v){if(!Array.isArray(v)||v.length!==values.length||v.some(n=>n!==0&&n!==1))return false;board.querySelectorAll('button').forEach((b,k)=>{if(values[k]!==v[k])b.click();});return true;}};
  }
  if(q.type==='binary-decode-6-v1') {
    section(host,'燈牌',d.bits.map((b,k)=>`${b?'●':'○'}（${2**(d.bits.length-k-1)}）`).join('　'));
    const h=numberFields(host,[['value','燈牌上的數字是']],api.changed);return {...h,get:()=>h.get().value};
  }
  if(q.type==='minimum-bits-v1') {
    section(host,'表示範圍',`0～${d.n}`);
    if(!api.shell)section(host,'提示','從 1 顆最大 1 開始，每多一顆，最大值乘 2 再加 1。');
    return numberFields(host,[['b','最少幾顆燈'],['m','最大能顯示到多少']],api.changed);
  }
  if(q.type==='capacity-conversion-v1') {
    if(!api.shell)section(host,'提示','8 位元＝1 位元組；1 KiB＝1024 位元組。KB、MB、GB 每級用 1000。');
    return numberFields(host,[['bytes',`${d.bits} 位元＝幾位元組`],['kibBytes',`${d.kib} KiB＝幾位元組`],['capacity',`${d.amount} ${d.units[d.from]}＝幾 ${d.units[d.to]}`]],api.changed);
  }
  if(q.type==='recording-capacity-v1') {
    section(host,'本組資料',`演出 ${d.minutes} 分鐘；記憶卡 ${d.cap} GB。`);
    if(!api.shell)section(host,'提示','1 GB＝1000 MB。所需 MB＝分鐘 × 每分鐘 MB；最多分鐘取整數部分。');
    return numberFields(host,[['q','畫質',d.rates.map((rate,k)=>[k,`${['標準','高畫質','超高畫質'][k]}：${rate} MB／分鐘`])],
      ['duration','預計錄影時間',[d.minutes-15,d.minutes,d.minutes+15].map(n=>[n,`${n} 分鐘`])],['need','整場需要幾 MB'],['max','此畫質最多可錄幾分鐘']],api.changed);
  }
  throw Object.assign(Error('unsupported-question'),{code:'renderer-pending'});
}
// 原理觀察只呈現公開題面或學生正在操作的值，不保存、判分或推導正式解答。
function principleView(q,host,get) {
  const d=q.data,box=node('section');box.className='panel principle-view';
  const title=node('h3','電腦裡發生的'),detail=node('p');box.append(title,detail);
  let update;
  if(/^binary-(?:encode|decode)-/.test(q.type)) {
    update=()=>{const values=q.type.startsWith('binary-encode')?get():d.bits;
      detail.textContent='亮＝1、暗＝0：'+values.join('')+'。一顆燈就是一個位元。';
      if(q.type==='binary-encode-5-v1')detail.textContent+=' 目前亮燈代表：'+(values.map((v,k)=>v?String(2**(values.length-k-1)):null).filter(Boolean).join(' + ')||'0');
      detail.textContent+='；最右邊代表 1，往左每顆是右邊的 2 倍。';};
  } else if(q.type==='minimum-bits-v1') {
    update=()=>{detail.textContent='1 顆 → 0～1；2 顆 → 0～3；3 顆 → 0～7。每多一顆，能表示的數量加倍。';};
  } else if(q.type==='capacity-conversion-v1') {
    update=()=>{detail.textContent='8 位元＝1 位元組；1 KiB＝1024 位元組。記憶卡標示：1 KB＝1000 位元組；1 MB＝1000 KB；1 GB＝1000 MB。';};
  } else if(d.mode?.startsWith('ascii-')) {
    update=()=>{const values=d.mode==='ascii-decode'?d.codes:get();
      detail.textContent=(values.length?values.map(n=>n+' → '+(n<=255?n.toString(2).padStart(8,'0'):'超過 1 個位元組')).join('；'):'尚未填入編碼')+'。8 個位元可以存一個 ASCII 英文字。';};
  } else if(d.mode==='knn'&&d.k===3) {
    title.textContent='最近的 3 個';box.hidden=true;
    update=()=>{box.hidden=get()===null;if(box.hidden){detail.textContent='';return;}
      const distance=p=>(p[0]-d.query[0])**2+(p[1]-d.query[1])**2;
      detail.textContent=[...d.points].sort((a,b)=>distance(a)-distance(b)).slice(0,3).map(p=>`${d.options[p[2]]}（${p[0]}, ${p[1]}）`).join('、');};
  } else if(d.mode==='route') {
    update=()=>{const path=get(),types={sea:'海纜',land:'陸上光纖',mw:'微波',sat:'衛星'};
      detail.textContent=path.slice(1).map((b,k)=>{const a=path[k],edge=d.edges.find(e=>e[0]===a&&e[1]===b||e[0]===b&&e[1]===a);
        return a+' → '+b+'：'+(edge?types[edge[2]]:'沒有直接線路');}).join('；')||'先選一段路線，觀察訊息經過的傳輸媒介。';};
  } else if(['網址的真名','名字換門牌'].includes(d.heading)) {
    update=()=>{const urls=[d.prompt,...(d.rows||[])].filter(v=>typeof v==='string').flatMap(v=>v.match(/https?:\/\/[^\s「」]+/g)||[]);
      detail.textContent=urls.map(value=>{try{const url=new URL(value);return value+' → 主機名稱：'+url.hostname+'；路徑：'+url.pathname;}catch{return value;}}).join('；')||'主機名稱在通訊協定之後、第一個斜線之前；DNS 要查完全相同的主機名稱。';};
  } else if(d.mode==='order'&&d.heading==='把封包組回來') {
    update=()=>{detail.textContent=get().map(k=>k===null?'□':d.cards[k]).join('');};
  }
  if(!update)return ()=>{};
  host.append(box);update();return update;
}
export function renderQuestion(q,host,api={changed(){}}) {
  let update=()=>{};
  const handle=renderQuestionControls(q,host,{...api,changed(){update();api.changed();}});
  if(!handle.readyReason)handle.readyReason=()=>{
    if(!handle.ready||handle.ready())return '';
    const missing=value=>value==null?1:Array.isArray(value)?value.reduce((n,v)=>n+missing(v),0):0;
    const n=missing(handle.get());
    return n?`還有 ${n} 題沒選或沒排好。`:'請先完成這一題的作答。';
  };
  // 正式題面不變；故事中可能含本組假設或限制，移到操作區後方供查閱。
  if(api.shell&&q.data.mode!==SHEET_MODE&&(q.data.story||q.instruction)){
    const detail=node('details');detail.className='question-data-notes';
    const notes=(Array.isArray(q.data.story)?q.data.story.join(''):q.data.story||q.instruction).replaceAll('每關答對兩組不同資料才完成；答錯可修正，不扣分。答對後按「下一組」繼續。','').trim();
    detail.append(node('summary','查看本組資料與模擬說明'),node('p',notes));if(notes)host.append(detail);
  }
  update=principleView(q,host,handle.get);
  const restore=handle.restoreDraft;
  if(restore)handle.restoreDraft=value=>{const restored=restore(value);if(restored){update();api.changed();}return restored;};
  highlightChangedNumbers(host,q);return handle;
}
// 每關僅提供學生的當前情境與操作目標；不含題庫、答案或判分。
export const ROUND_COPY=Object.freeze({
  "1":[
    ["你接到第一筆飲料訂單，要讓 CPU 依序完成計算。","你依點單牆排好三張單子並確認輸出。"],
    ["你接到需要加料的訂單，要接續處理中間結果。","你依點單牆排好四張單子並確認輸出。"],
    ["你要依訂單計算付款金額與找零。","你選出需要的五張單子並排好計算順序。"],
    ["你要連續處理多筆飲料訂單。","你排好七張單子並核對每筆訂單的輸出。"]
  ],
  "2":[
    ["你要把儲存空間裡的遊戲載入 RAM。","你排好載入、計算與顯示分數的順序。"],
    ["你要在斷電前保住目前的遊戲進度。","你排好存檔、重新載入與接續計分的順序。"],
    ["你要在 RAM 已滿時繼續遊戲並切換通訊程式。","你釋出可用空間、完成計分並保留遊戲。"],
    ["你要從關機狀態開始玩遊戲並留下存檔。","你排好開機、載入、計分、顯示與存檔的順序。"]
  ],
  "3":[
    ["你拍到兩張背號模糊的照片，要調整取樣。","你用最少格子讓兩張照片的背號都能辨識。"],
    ["你要用有限的顏色保留照片中的應援色。","你用最少顏色讓兩張照片的成員都能辨識。"],
    ["你要讓照片符合本組傳輸容量上限。","你調整格子與顏色，在容量內辨識背號和應援色。"],
    ["你要從衛星圖辨識停車場裡的遊覽車。","你用最小的圖辨識兩個停車場的車輛數量。"]
  ],
  "4":[
    ["你要比較聲音取樣設定對波形與資料量的影響。","你比較至少兩種設定，選出符合接近度目標且資料量最小的設定。"],
    ["你要為指定用途調整影像的像素與顏色。","你比較至少兩種設定，選出符合本組需求且資料量最小的組合。"],
    ["你要比較每秒畫面張數對影片順暢度的影響。","你比較至少兩種速度，選出符合本組目標且張數最少的設定。"],
    ["你要用指定容量的記憶卡錄完整場演出。","你選出可錄完整場的最高畫質，設定時間並算出空間與最多分鐘。"]
  ],
  "5":[
    ["你要用五顆燈表示指定數字。","你點亮適當的燈，讓亮燈代表的數值加總符合目標。"],
    ["你要讀出六顆燈表示的數字。","你加總亮燈下方的數值並填入結果。"],
    ["你要用沒有標示權重的八顆燈表示指定數字。","你依各燈的位值點亮燈牌並核對目標。"],
    ["你要決定表示指定範圍所需的燈數。","你填出最少燈數及這些燈能表示的最大值。"],
    ["你要把燈牌與動畫的儲存量換成指定單位。","你完成位元、位元組、KiB 與十進位容量換算。"]
  ],
  "6":[
    ["你收到一串用數字表示的暗號。","你查 ASCII 表，把數字還原成英文字母。"],
    ["你要把回覆的英文字母換成數字編碼。","你查 ASCII 表並依序填入每個字元的編碼。"],
    ["你打開公告檔案後看到了亂碼。","你對照亂碼圖鑑，判斷造成亂碼的原因。"],
    ["你要分辨文字顯示方塊與亂碼的原因。","你將每個狀況分成缺字型或編碼不一致。"]
  ],
  "7":[
    ["你收到兩組報名回覆，要比較職務意願。","你讀表與長條圖，判斷最高職務、數量及資料與資訊。"],
    ["你要依招募目的審查報名對象與蒐集內容。","你選對對象與數據類型，判斷必要欄位及違反的原則。"],
    ["你接手的表單在同意分流與題型上有錯誤。","你修正區段、分流與題型，並計算必填題數。"],
    ["你要在發布招募表單前完成最後查核。","你判斷外觀需求與分享權限，並用指定條件計算回覆數。"]
  ],
  "8":[
    ["收件截止了，你要先保住原始回覆，再找出資料裡的問題。","你選對封存順序、找出完整的備份，再分類四個儲存格。"],
    ["你拿到原始回覆副本，要判斷哪些資料可以留下。","你標記全部資料範圍的空白、排除無效回覆，再確認指定列的全部排除原因。"],
    ["你拿到已清理的副本，要找出內容完全重複的回覆。","你設定比對欄位並執行去重，再決定同代號但內容不同的回覆如何處理。"],
    ["你拿到已清理並去重的副本，要找出指定組別與場次的補招缺口。","你篩選指定組別與時段、統計並製圖，再比較需求提出補招初步建議。"]
  ],
  "9":[
    ["你要將公告中的指定內容轉成可修改的文字。","你核對文字辨識結果，修正內容並選擇適合的轉換方式。"],
    ["你要縮短重複資料並確認能否完整還原。","你完成壓縮與還原，核對結果並比較資料量。"],
    ["你要比較有損壓縮前後的指定圖像區域。","你判斷損失的細節是否符合用途，並說明取捨。"],
    ["你要將不同用途的素材打包保存。","你依用途選擇格式與壓縮方式，保住必要內容。"]
  ],
  "10":[
    ["你要讓訊息沿可用線路抵達目的地。","你依本組起點與終點排出可通行的路線。"],
    ["你要查出有線線路中斷後失去連線的地點。","你選出所有無法再經有線線路連到台北的地點。"],
    ["你要替不同連線情境選擇傳輸媒介。","你依距離、環境與用途選出合適的媒介。"],
    ["你要估算訊號在指定路線上的單程傳播時間。","你依距離與速度換算毫秒，不計處理及排隊時間。"]
  ],
  "11":[
    ["你收到順序打亂的訊息封包。","你依封包編號排回原本的訊息。"],
    ["你要查核購票網址是否屬於官方網站。","你辨認主機名稱，判斷每個網址是否符合指定官方網域。"],
    ["你收到缺漏且含重複的封包。","你找出缺少的封包編號，請對方重送。"],
    ["你要用 DNS 查詢網址對應的 IP 位址。","你比對完整主機名稱並選出正確的 IP 位址。"]
  ],
  "12":[
    ["你要辨認不同情境使用的無線連線。","你為每個情境選出對應的無線技術。"],
    ["你要依本組參考距離判斷無線訊號是否可達。","你比較實際距離與參考距離，判斷每個位置能否收到訊號。"],
    ["你要從模擬平面圖找出 Wi-Fi 死角。","你點出所有訊號弱於 -70 的格子。"],
    ["你要比較四個候選位置的 Wi-Fi 覆蓋範圍。","你選出讓最多格訊號達到 -70 或更強的位置。"]
  ],
  "13":[
    ["你要辨認日常操作使用的網路服務。","你把每個操作分到對應的服務類型。"],
    ["你要依觀看紀錄推測下一支推薦影片。","你按照本組推薦規則選出最可能出現的影片。"],
    ["你要辨認裝置是否屬於物聯網。","你依感測與連網等特徵判斷每個例子。"],
    ["你要拆解物聯網應用的運作流程。","你把每個步驟分成感測、連網或動作。"]
  ],
  "14":[
    ["你要分辨工作是在裝置本機或雲端完成。","你判斷每個操作主要發生在本機還是雲端。"],
    ["你要為不同網站需求辨認雲端服務類型。","你把每種使用方式分成 IaaS、PaaS 或 SaaS。"],
    ["你要確認租用指定雲端服務後仍須自行管理的層次。","你選出所有需要自己管理的層次。"],
    ["你要依條件選擇資料中心的設置地點。","你比較候選地點並選出符合本組條件的位置。"]
  ],
  "15":[
    ["你要追蹤送出 AI 問題後到收到回答的過程。","你把輸入、傳輸、運算與回傳的步驟排好。"],
    ["你要把 AI 問答流程連回學過的資訊概念。","你為每個步驟選出對應的單元。"],
    ["你要比較雲端 AI 與已下載模型的離線 AI。","你判斷每個步驟是兩者共有或只屬於其中一種。"],
    ["你要依使用情境選擇雲端或離線 AI。","你比較連線、模型與搜尋需求後選出適合的版本。"]
  ],
  "16":[
    ["你要分辨 AI 與依固定規則運作的程式。","你判斷每個例子是否使用 AI。"],
    ["你要辨認 AI 正在執行哪一種工作。","你把每個工作分成辨識、預測、生成或推薦。"],
    ["你要找出造成 AI 表現不佳的資料問題。","你為每個失敗例子選出對應的資料問題。"],
    ["你要整理從零建立 AI 的流程。","你把製作 AI 的步驟排成合理順序。"]
  ],
  "17":[
    ["你要辨認 AI 使用案例中的風險。","你為每個事件選出主要的問題類型。"],
    ["你要評估不同 AI 使用方式是否合適。","你判斷每個案例的用法是否恰當。"],
    ["你要查核 AI 回答中的資訊。","你對照資料卡，判斷 AI 每句話是否正確。"],
    ["你要查核一段正在流傳的影片。","你分辨可疑線索與不足以證明真實的線索。"]
  ],
  "18":[
    ["你要分辨哪些 AI 能產生新內容。","你判斷每個例子是否屬於生成式 AI。"],
    ["你要檢查提示詞缺少的資訊。","你選出每段提示詞缺少的要素。"],
    ["你要為指定創作目標挑選提示詞。","你比較各版本，選出最符合目標的提示詞。"],
    ["你要觀察語言模型逐步接出句子的方式。","你每一步都選機率最高的詞，接出完整句子。"]
  ],
  "19":[
    ["你要從圖像反推可能使用的提示詞。","你選出最符合圖中內容的提示詞。"],
    ["你要觀察修改一個詞對生成圖像的影響。","你選出符合修改後提示詞的圖像。"],
    ["你要確認候選圖片是否適合用於作品。","你依授權與內容條件判斷每張圖能否使用。"],
    ["你要整理順序打亂的故事頁面。","你把五頁排成前後連貫的完整故事。"]
  ],
  "20":[
    ["你要依決策樹分類物品。","你沿著問題分支把每件物品分到正確類別。"],
    ["你要找出能分開兩類標記資料的問題。","你選出可將兩類例子完全分開的問題。"],
    ["你要用已標記的例子設計決策樹。","你選好兩個問題與三個答案，讓每個例子都分類正確。"],
    ["你要用未見過的資料測試決策樹。","你依樹分類並計算分對數量占全部的百分比。"]
  ],
  "21":[
    ["你要依偏好資料預測新資料所屬的類別。","你找出離星星最近的資料點，選出它的類別。"],
    ["你要改用三個最近鄰居投票預測類別。","你找出離星星最近的三個資料點，選出多數類別。"],
    ["你要從排隊紀錄預測等待時間。","你選出最貼近資料點的直線，再預測指定人數的等待時間。"],
    ["你要依權重與門檻決定是否啟動服務。","你加總各情境的分數，判斷是否達到啟動門檻。"]
  ],
  "22":[
    ["你要分辨有標準答案與沒有標準答案的學習方式。","你把每個例子分成監督式或非監督式學習。"],
    ["你要依資料值與兩個中心的距離分組。","你把每筆資料分給距離較近的中心。"],
    ["你要依目前分組更新兩個中心。","你計算各組平均值並填入新的中心位置。"],
    ["你要重複分組與移動中心直到結果穩定。","你填出中心不再移動時的兩組中心值。"]
  ],
  "23":[
    ["你要替各攤位指派最近的服務台。","你比較平面圖上的距離，判斷每個攤位歸 A 或 B。"],
    ["你要把服務台移到所屬攤位的平均位置。","你計算 A 組橫座標與直座標的平均值。"],
    ["你要比較兩種服務台分組方案。","你選出攤位到所屬服務台總距離較小的方案。"],
    ["你要在人力與移動距離之間選擇服務台數量。","你用手肘法找出再增加服務台時改善開始變小的數量。"]
  ],
  "24":[
    ["你要檢查辨識手勢用的訓練照片。","你判斷每組照片是否合適並找出資料問題。"],
    ["你要確認模型測試是否使用了獨立資料。","你判斷每種訓練與測試安排是否恰當。"],
    ["你要從混淆矩陣了解手勢辨識結果。","你計算準確率並找出最常混淆的手勢組合。"],
    ["你要針對手勢辨識錯誤提出改善方法。","你為每個問題選出最適合的改進方式。"]
  ],
  "25":[
    ["你要讓程式判斷猜拳結果。","你把每個出拳組合分成玩家贏、平手或電腦贏。"],
    ["你要整理猜拳程式的執行流程。","你把程式步驟排成正確順序。"],
    ["你要依模型信心值決定是否接受辨識結果。","你按本組門檻判斷結果或要求重新出拳。"],
    ["你要依玩家出拳紀錄選擇電腦的下一拳。","你找出玩家最常出的拳，再選出能贏它的出拳。"]
  ],
  "26":[
    ["你要辨認外觀不同的電腦裝置。","你把每個裝置分到對應的平台類別。"],
    ["你要拆解電腦的硬體與軟體層次。","你把每張卡片放進硬體、作業系統或應用程式。"],
    ["你要辨認內含處理器與軟體的新興裝置。","你把每個裝置分到對應的新興平台。"],
    ["你要查出裝置異常發生在哪一層。","你把每個問題分成硬體、作業系統或應用程式異常。"]
  ],
  "27":[
    ["你要讓多個程式輪流使用 CPU。","你安排每格時間，讓每個程式都在期限內完成。"],
    ["你要從工作管理員找出資源使用狀況。","你比較 CPU 與記憶體數據，回答本組資源問題。"],
    ["你要在新工作出現後調整 CPU 排程。","你遵守到達時間，讓每個程式都在期限內完成。"],
    ["你要在記憶體不足時保留必要程式。","你選出要關閉的背景程式，釋出足夠記憶體。"]
  ],
  "28":[
    ["你要整理電腦發展的重要事件。","你把各事件依發生時間由早到晚排好。"],
    ["你要辨認電腦四個世代的特徵。","你把每張說明卡放到對應的世代。"],
    ["你要追蹤晶片從設計到成品的旅程。","你把晶片經過的階段排成正確順序。"],
    ["你要依每兩年翻倍的假設估算晶片發展。","你依本組起始值與時間計算翻倍後的數值。"]
  ],
  "29":[
    ["你要辨認直播設備的輸入與輸出功能。","你把每個設備分成輸入、輸出或兩者兼具。"],
    ["你要拆解直播過程中電腦正在做的事。","你把每件事分成輸入、處理或輸出。"],
    ["你要為小裝置搭配感測與反應零件。","你為每個裝置各選一個輸入零件與輸出零件。"],
    ["你要追蹤直播一秒鐘內的資訊處理。","你把這一秒裡發生的步驟排成正確順序。"]
  ],
  "30":[
    ["你要熟悉因材網的登入流程。","你把登入步驟依正確順序排好。"],
    ["你要確認使用共用電腦時應遵守的規則。","你把每個狀況對應到違反的使用規則。"],
    ["你要了解學期成績的三種評量類別。","你把每件事分到認知、情意或技能評量。"],
    ["你要整理活動故事的事件順序。","你把各事件依發生先後排好。"]
  ]
});
export function activityConfig(cfg) {
  const entry=COMPLETE_ACTIVITIES.find(a=>activityCourse(a)==='115-g9'&&a.activity===cfg.week&&cfg.course==='115-g9');
  return entry?{...cfg,rounds:entry.rounds.map((name,r)=>({...cfg.rounds?.[r],name,now:ROUND_COPY[cfg.week][r][0],goal:ROUND_COPY[cfg.week][r][1],managed:entry.managed.includes(r)})),renderQuestion}:cfg;
}
