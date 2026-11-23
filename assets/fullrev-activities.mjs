import {renderRecording} from './fullrev-recording.mjs';
// PR6：只包含公開導覽與 renderer；正式題面與判定均由 Worker 提供。
import {renderPhotos} from './fullrev-photos.mjs';
import {renderPerformance} from './fullrev-performance.mjs';
import {renderOutcome} from './fullrev-outcomes.mjs';
export const BATCH1=Object.freeze([
  {activity:4,file:'115-g9/u2-02/index.html',title:'錄滿一整場',unit:2,rounds:['聲音取樣','影像像素','影片組成','錄滿一整場'],managed:[3]},
  {activity:5,file:'115-g9/u2-03/index.html',title:'燈牌只有亮和暗',unit:2,rounds:['點亮生日','看燈猜數字','沒有標數字的燈牌','要幾顆燈才夠','燈牌要幾個位元組'],managed:[0,1,2,3,4]},
  {activity:16,file:'115-g9/u5-01/index.html',title:'倒數一百天的 AI',unit:5,rounds:['是不是 AI','AI 在做哪一種事','資料出了什麼問題','一個 AI 怎麼做出來'],managed:[0,1,2,3]},
  {activity:17,file:'115-g9/u5-02/index.html',title:'AI 說的就對嗎',unit:5,rounds:['哪裡出了問題','可以這樣用嗎','幫 AI 查證','這是真的嗎'],managed:[0,1,2,3]},
  {activity:18,file:'115-g9/u5-03/index.html',title:'寫給學弟妹的繪本',unit:5,rounds:['是不是生成式 AI','提示詞少了什麼','選出最好的提示詞','猜下一個字'],managed:[0,1,2,3]},
  {activity:26,file:'115-g9/u1-01/index.html',title:'開賣倒數十秒',unit:1,rounds:['這是哪一種電腦','拆成三層','新的電腦平台','哪一層出問題'],managed:[0,1,2,3]},
  {activity:30,file:'115-g9/u0-01/index.html',title:'登入，出發',unit:0,rounds:['登入因材網','電腦教室規則','成績怎麼算','這學期的故事'],managed:[0,1,2,3]}
]);
export const BATCH2=Object.freeze([
  {activity:6,file:'115-g9/u2-04/index.html',title:'傳給阿嬤的方塊',unit:2,rounds:['用編碼表解密','換成編碼','亂碼是怎麼來的','方塊還是亂碼'],managed:[0,1,2,3]},
  {activity:10,file:'115-g9/u4-01/index.html',title:'馬祖斷線了',unit:4,rounds:['幫訊息找路','斷了會影響誰','選傳輸媒介','訊號要跑多久'],managed:[0,1,2,3]},
  {activity:11,file:'115-g9/u4-02/index.html',title:'差一個字母的網站',unit:4,rounds:['把封包組回來','網址的真名','少了哪一包','名字換門牌'],managed:[0,1,2,3]},
  {activity:12,file:'115-g9/u4-03/index.html',title:'Wi-Fi 死角在哪裡',unit:4,rounds:['選無線技術','收得到嗎','找出 Wi-Fi 死角','路由器放哪裡'],managed:[0,1,2,3]},
  {activity:13,file:'115-g9/u4-04/index.html',title:'短影音怎麼猜中我',unit:4,rounds:['這是哪一種服務','猜下一支推薦','是不是物聯網','感測、連網、動作'],managed:[0,1,2,3]},
  {activity:14,file:'115-g9/u4-05/index.html',title:'影片住在哪個國家',unit:4,rounds:['在手機上還是雲端','租哪一種雲','誰管哪一層','資料中心蓋在哪'],managed:[0,1,2,3]}
]);
export const BATCH3=Object.freeze([
  {activity:15,file:'115-g9/u4-06/index.html',title:'問 AI 一個問題',unit:4,rounds:['一個問題的旅程','這一步是哪一單元','雲端版和手機版','雲端算還是手機算'],managed:[0,1,2,3]},
  {activity:19,file:'115-g9/u5-04/index.html',title:'繪本需要插圖',unit:5,rounds:['哪一句提示詞','改一個詞','可以放進繪本嗎','排好繪本頁'],managed:[0,1,2,3]},
  {activity:20,file:'115-g9/u5-05/index.html',title:'回收分類機',unit:5,rounds:['照著樹分類','哪一題分得最乾淨','自己蓋一棵樹','考考這棵樹'],managed:[0,1,2,3]},
  {activity:21,file:'115-g9/u5-06/index.html',title:'跟誰最像',unit:5,rounds:['最近的鄰居','找 3 個鄰居投票','畫一條線來預測','感知器要不要開攤'],managed:[0,1,2,3]},
  {activity:22,file:'115-g9/u5-07/index.html',title:'讓資料自己分組',unit:5,rounds:['有沒有標準答案','靠近哪一個中心','把中心搬到中間','跑到不動為止'],managed:[0,1,2,3]},
  {activity:23,file:'115-g9/u5-08/index.html',title:'服務台放哪裡',unit:5,rounds:['去最近的服務台','搬到正中間','哪一種分得好','要放幾個服務台'],managed:[0,1,2,3]}
]);
export const BATCH4=Object.freeze([
  {activity:24,file:'115-g9/u5-09/index.html',title:'教 AI 認手勢',unit:5,rounds:['這批照片夠好嗎','訓練和測試要分開','讀懂混淆矩陣','怎麼改進'],managed:[0,1,2,3]},
  {activity:25,file:'115-g9/u5-10/index.html',title:'猜拳贏 AI',unit:5,rounds:['誰贏了','程式的順序','有把握才算數','讓 AI 會贏'],managed:[0,1,2,3]},
  {activity:27,file:'115-g9/u1-02/index.html',title:'加場搶票被踢出來',unit:1,rounds:['輪流用 CPU','看懂工作管理員','有人插隊','記憶體不夠了'],managed:[0,1,2,3]},
  {activity:28,file:'115-g9/u1-03/index.html',title:'為了演唱會換手機',unit:1,rounds:['倒帶時間軸','它是哪一代','晶片環遊世界','每兩年翻一倍'],managed:[0,1,2,3]},
  {activity:29,file:'115-g9/u1-04/index.html',title:'演唱會倒數直播',unit:1,rounds:['收進來還是送出去','輸入、處理、輸出','幫小裝置挑零件','直播的一秒鐘'],managed:[0,1,2,3]}
]);
export const BATCH5=Object.freeze([
  {activity:7,file:'115-g9/u2-05/index.html',title:'動漫／遊戲展志工招募',unit:2,rounds:['報名回覆藏著什麼','志工資料只收必要的','讓每位報名者走對路','上線招募前最後檢查'],managed:[0,1,2,3]},
  {activity:8,file:'115-g9/u2-06/index.html',title:'把報名回覆變成排班依據',unit:2,rounds:['收件截止，先保住原始回覆','顏色只提醒，你決定哪些列留下','送出時間不同，也可能是同一份回覆','哪個職務缺回覆，圖表要有依據'],managed:[0,1,2,3]},
  {activity:9,file:'115-g9/u2-07/index.html',title:'影片傳到群組變糊',unit:2,rounds:['今天必做：把公告變成能修改的文字','今天必做：壓得短，還原得回來嗎','另排時間完成：少掉的細節還能接受嗎','另排時間完成：把素材打包，保住該保留的內容'],managed:[0,1,2,3]}
]);
export const BATCH6=Object.freeze([
  {activity:1,file:'115-g9/u1-05/index.html',title:'深夜手搖店 CPU',unit:1,rounds:['第 1 單','第 2 單','錢夠不夠？','班級團購'],managed:[0,1,2,3]},
  {activity:2,file:'115-g9/u1-06/index.html',title:'打王前記得存檔',unit:1,rounds:['開遊戲','打王前存檔','RAM 滿了','從開機到存檔'],managed:[0,1,2,3]}
]);
export const BATCH7=Object.freeze([{activity:3,file:'115-g9/u2-01/index.html',title:'看台最後一排',unit:2,rounds:['看清背號','認出應援色','容量剛好夠','衛星數遊覽車'],managed:[0,1,2,3]}]);
export const BATCH8=Object.freeze([{...BATCH1[0],managed:[0,1,2]},{course:'115-df',activity:1,file:'115-df/a/index.html',title:'資料偵探',unit:null,rounds:['提出 H1','完成結論','完成反思'],managed:[0,1,2]}]);
export const MANAGED_ACTIVITIES=Object.freeze([...BATCH1,...BATCH2,...BATCH3,...BATCH4,...BATCH5,...BATCH6,...BATCH7]);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function section(host,title,text) {
  if(!text)return;const box=node('section');box.className='panel';box.append(node('h3',title),node('p',Array.isArray(text)?text.join(''):text));host.append(box);
}
function picks(host,rows,choices,changed) {
  const values=rows.map(()=>null);
  rows.forEach((text,r)=>{
    const row=node('section');row.className='row';row.append(node('p',text));
    choices(r).forEach((label,j)=>{
      const b=node('button',label);b.type='button';b.className='pk';b.dataset.row=r;b.dataset.choice=j;b.setAttribute('aria-pressed','false');
      b.onclick=()=>{values[r]=values[r]===j?null:j;row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(Number(x.dataset.choice)===values[r])));changed();};row.append(b);
    });host.append(row);
  });
  return {get:()=>[...values],ready:()=>values.every(v=>v!==null)};
}
function ordered(host,cards,changed) {
  const pool=node('section'),slots=node('section'),values=cards.map(()=>null);pool.append(node('h3','卡片'));slots.append(node('h3','順序'));
  host.append(pool,slots);
  function draw(){
    pool.replaceChildren(node('h3','卡片'));slots.replaceChildren(node('h3','順序'));
    cards.forEach((text,k)=>{if(values.includes(k))return;const b=node('button',text);b.type='button';b.className='pk';b.dataset.poolIndex=k;
      b.onclick=()=>{values[values.indexOf(null)]=k;draw();changed();};pool.append(b);});
    values.forEach((k,j)=>{const b=node('button',`${j+1}．${k===null?'待放入':cards[k]}`);b.type='button';b.className='slot';b.dataset.slotIndex=j;
      b.onclick=()=>{values[j]=null;draw();changed();};slots.append(b);});
  }draw();return {get:()=>[...values],ready:()=>values.every(v=>v!==null)};
}
function numberFields(host,fields,changed) {
  const inputs={};for(const [key,text,options] of fields) {
    const label=node('label',text),input=node(options?'select':'input');
    if(options){input.append(node('option','請選擇'));input.firstChild.value='';for(const [value,text] of options){const o=node('option',text);o.value=value;input.append(o);}}
    else {input.type='text';input.inputMode='numeric';input.autocomplete='off';}
    input.dataset.answerField=key;input.className='num-in';label.style.display='block';label.append(input);host.append(label);input.oninput=input.onchange=changed;inputs[key]=input;
  }
  const valid=input=>input.value!==''&&/^-?\d+$/.test(input.value.trim())&&Number.isSafeInteger(Number(input.value))&&Math.abs(Number(input.value))<=1e12;
  return {get:()=>Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,Number(input.value)])),ready:()=>Object.values(inputs).every(valid)};
}
function multi(host,options,changed) {
  const values=new Set();options.forEach((text,k)=>{
    const b=node('button',text);b.type='button';b.className='pk';b.dataset.multiIndex=k;b.setAttribute('aria-pressed','false');
    b.onclick=()=>{values.has(k)?values.delete(k):values.add(k);b.setAttribute('aria-pressed',String(values.has(k)));changed();};host.append(b);
  });return {get:()=>[...values].sort((a,b)=>a-b),ready:()=>true};
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
  return {get,ready:()=>get().length>0&&(d.mode==='ascii-decode'||nums().length<=32&&nums().every(n=>Number.isSafeInteger(n)&&n<=1e12))};
}
function table(host,headers,rows) {
  const wrap=node('div'),t=node('table');wrap.style.cssText='max-width:100%;overflow-x:auto';t.style.cssText='border-collapse:collapse;width:100%';
  const head=node('tr');headers.forEach(text=>{const th=node('th',text);th.scope='col';head.append(th);});t.append(head);
  rows.forEach(row=>{const tr=node('tr');row.forEach(text=>{const td=node('td',text);td.style.cssText='padding:5px;border-bottom:1px solid #aaa';tr.append(td);});t.append(tr);});wrap.append(t);host.append(wrap);
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
    return {get:()=>value,ready:()=>value!==null};
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
export function renderQuestion(q,host,api={changed(){}}) {
  const d=q.data;host.dataset.questionType=q.type;host.dataset.slot=q.slot;
  section(host,d.heading||q.title,d.story||q.instruction);
  if(q.type==='finite-bank-v1') {
    if(!api.shell){section(host,'任務',d.task);section(host,'提示',d.hint);}
    if(d.guide&&!api.shell){const detail=node('details');detail.append(node('summary','拆成步驟'),node('p',Array.isArray(d.guide)?d.guide.join(''):d.guide));host.append(detail);}
    if(d.references)section(host,'資料卡（課本整理）',d.references.join('\n'));
    if(d.prompt&&d.mode!=='scene-choice')section(host,'目標／提示詞',d.prompt);
    if(d.mode?.startsWith('recording-'))return renderRecording(q,host,api);
    const photo=renderPhotos(host,d,api);if(photo)return photo;
    const performance=renderPerformance(host,d,api);if(performance)return performance;
    const outcome=renderOutcome(host,d,api.changed);if(outcome)return outcome;
    const platform=platformQuestion(host,d,api.changed);if(platform)return platform;
    const ai=aiQuestion(host,d,api.changed);if(ai)return ai;
    if(d.mode.startsWith('ascii-'))return ascii(host,d,api.changed);
    if(d.mode==='route'){
      network(host,d);let path=[d.from];const text=node('p'),buttons=node('div');host.append(text,buttons);
      const draw=()=>{buttons.dataset.routeLength=path.length;text.textContent='走法：'+path.join(' → ');buttons.replaceChildren();
        for(const [name] of d.nodes){const b=node('button',name);b.type='button';b.className='pk';b.dataset.routeNode=name;b.onclick=()=>{if(name===path.at(-1)&&path.length>1)path.pop();else if(!path.includes(name))path.push(name);draw();api.changed();};buttons.append(b);}
        const back=node('button','退一步');back.type='button';back.onclick=()=>{if(path.length>1)path.pop();draw();api.changed();};buttons.append(back);
      };draw();return {get:()=>[...path],ready:()=>path.length>1};
    }
    if(d.mode==='multi'){if(d.edges)network(host,d);return multi(host,d.options,api.changed);}
    if(d.mode==='wifi-dead'){
      const values=new Set();floor(host,d.walls,d.grid.flat(),{ap:d.ap,click:(i,b)=>{values.has(i)?values.delete(i):values.add(i);b.setAttribute('aria-pressed',String(values.has(i)));api.changed();}});
      return {get:()=>[...values].sort((a,b)=>a-b),ready:()=>true};
    }
    if(d.mode==='wifi-router'){
      let choice=null;const simulation=node('section');
      const grid=floor(host,d.walls,Array(48).fill(''),{cells:d.cells,click:(i)=>{if(!d.cells.includes(i))return;choice=d.cells.indexOf(i);grid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.cell)===i)));simulation.replaceChildren();
        const g=signals(d.walls,i);section(simulation,'模擬',`位置 ${'ABCD'[choice]}：收得到 ${g.filter(v=>v>=-70).length}／48 格`);floor(simulation,d.walls,g,{ap:i});api.changed();}});host.append(simulation);
      return {get:()=>choice,ready:()=>choice!==null};
    }
    if(d.mode==='classify')return picks(host,d.rows,()=>d.options,api.changed);
    if(d.mode==='select'){const h=picks(host,['請選一個'],()=>d.options,api.changed);return {...h,get:()=>h.get()[0]};}
    if(d.mode==='order')return ordered(host,d.cards,api.changed);
    if(d.mode==='tokens'){
      const sentence=node('p');sentence.setAttribute('aria-live','polite');host.append(sentence);
      const h=picks(host,['第 1 步','第 2 步','第 3 步'],r=>d.words.slice(r*4,r*4+4).map((w,j)=>`${w}（${d.weights[r*4+j]}%）`),()=>{sentence.textContent='國中的第一天，我'+h.get().map((v,r)=>v===null?'＿＿':d.words[r*4+v]).join('');api.changed();});return h;
    }
  }
  if(/^binary-encode-(5|8)-v1$/.test(q.type)) {
    section(host,'任務',`把燈點亮，拼出 ${d.target}。亮＝1、暗＝0；最右邊代表 1，往左每顆是右邊的兩倍。`);
    const values=Array(d.width).fill(0),board=node('div');board.className='board';board.setAttribute('aria-label','燈牌');
    values.forEach((_,k)=>{const b=node('button',d.width===5?String(2**(d.width-k-1)):'○');b.type='button';b.className='pk';b.dataset.bit=k;b.setAttribute('aria-label',`第 ${k+1} 顆燈`);b.setAttribute('aria-pressed','false');
      b.onclick=()=>{values[k]^=1;b.setAttribute('aria-pressed',String(!!values[k]));b.textContent=values[k]?'●':'○';api.changed();};board.append(b);});host.append(board);
    return {get:()=>[...values],ready:()=>true};
  }
  if(q.type==='binary-decode-6-v1') {
    section(host,'燈牌',d.bits.map((b,k)=>`${b?'●':'○'}（${2**(d.bits.length-k-1)}）`).join('　'));
    const h=numberFields(host,[['value','燈牌上的數字是']],api.changed);return {...h,get:()=>h.get().value};
  }
  if(q.type==='minimum-bits-v1') {
    section(host,'任務',`顯示 0～${d.n}，最少要幾顆燈？這麼多顆燈最大能表示多少？`);
    section(host,'提示','從 1 顆最大 1 開始，每多一顆，最大值乘 2 再加 1。');
    return numberFields(host,[['b','最少幾顆燈'],['m','最大能顯示到多少']],api.changed);
  }
  if(q.type==='capacity-conversion-v1') {
    section(host,'任務',`${d.bits} 位元要幾個位元組？${d.kib} KiB 要幾個位元組？${d.amount} ${d.units[d.from]}＝幾 ${d.units[d.to]}？`);
    section(host,'提示','8 位元＝1 位元組；1 KiB＝1024 位元組。KB、MB、GB 每級用 1000。');
    return numberFields(host,[['bytes','燈牌需要的位元組'],['kibBytes','KiB 換成位元組'],['capacity','動畫換算結果']],api.changed);
  }
  if(q.type==='recording-capacity-v1') {
    section(host,'任務',`演出長 ${d.minutes} 分鐘，記憶卡有 ${d.cap} GB。選能錄完整場的最高畫質，再計算空間與最多分鐘。`);
    section(host,'提示','1 GB＝1000 MB。所需 MB＝分鐘 × 每分鐘 MB；最多分鐘取整數部分。');
    return numberFields(host,[['q','畫質',d.rates.map((rate,k)=>[k,`${['標準','高畫質','超高畫質'][k]}：${rate} MB／分鐘`])],
      ['duration','預計錄影時間',[d.minutes-15,d.minutes,d.minutes+15].map(n=>[n,`${n} 分鐘`])],['need','整場需要幾 MB'],['max','此畫質最多可錄幾分鐘']],api.changed);
  }
  throw Object.assign(Error('unsupported-question'),{code:'renderer-pending'});
}
export function activityConfig(cfg) {
  let entry=MANAGED_ACTIVITIES.find(a=>a.activity===cfg.week&&cfg.course==='115-g9');
  if(cfg.course==='115-g9'&&cfg.week===4)entry={...entry,managed:[0,1,2,3]};
  return entry?{...cfg,rounds:entry.rounds.map((name,r)=>({...cfg.rounds?.[r],name,managed:entry.managed.includes(r)})),renderQuestion}:cfg;
}
