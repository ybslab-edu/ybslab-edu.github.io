// PR6：只包含公開導覽與 renderer；正式題面與判定均由 Worker 提供。
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
export const MANAGED_ACTIVITIES=Object.freeze([...BATCH1,...BATCH2]);
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
export function renderQuestion(q,host,api={changed(){}}) {
  const d=q.data;host.dataset.questionType=q.type;host.dataset.slot=q.slot;
  section(host,d.heading||q.title,d.story||q.instruction);
  if(q.type==='finite-bank-v1') {
    section(host,'任務',d.task);section(host,'提示',d.hint);
    if(d.guide){const detail=node('details');detail.append(node('summary','拆成步驟'),node('p',Array.isArray(d.guide)?d.guide.join(''):d.guide));host.append(detail);}
    if(d.references)section(host,'資料卡（課本整理）',d.references.join('\n'));
    if(d.prompt)section(host,'目標／提示詞',d.prompt);
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
  const entry=MANAGED_ACTIVITIES.find(a=>a.activity===cfg.week&&cfg.course==='115-g9');
  return entry?{...cfg,rounds:entry.rounds.map((name,r)=>({name,managed:entry.managed.includes(r)})),renderQuestion}:cfg;
}
