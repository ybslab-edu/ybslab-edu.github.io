// PR6 第 1 批：只包含公開導覽與 renderer；正式題面與判定均由 Worker 提供。
export const BATCH1=Object.freeze([
  {activity:4,file:'115-g9/u2-02/index.html',title:'錄滿一整場',unit:2,rounds:['聲音取樣','影像像素','影片組成','錄滿一整場'],managed:[3]},
  {activity:5,file:'115-g9/u2-03/index.html',title:'燈牌只有亮和暗',unit:2,rounds:['點亮生日','看燈猜數字','沒有標數字的燈牌','要幾顆燈才夠','燈牌要幾個位元組'],managed:[0,1,2,3,4]},
  {activity:16,file:'115-g9/u5-01/index.html',title:'倒數一百天的 AI',unit:5,rounds:['是不是 AI','AI 在做哪一種事','資料出了什麼問題','一個 AI 怎麼做出來'],managed:[0,1,2,3]},
  {activity:17,file:'115-g9/u5-02/index.html',title:'AI 說的就對嗎',unit:5,rounds:['哪裡出了問題','可以這樣用嗎','幫 AI 查證','這是真的嗎'],managed:[0,1,2,3]},
  {activity:18,file:'115-g9/u5-03/index.html',title:'寫給學弟妹的繪本',unit:5,rounds:['是不是生成式 AI','提示詞少了什麼','選出最好的提示詞','猜下一個字'],managed:[0,1,2,3]},
  {activity:26,file:'115-g9/u1-01/index.html',title:'開賣倒數十秒',unit:1,rounds:['這是哪一種電腦','拆成三層','新的電腦平台','哪一層出問題'],managed:[0,1,2,3]},
  {activity:30,file:'115-g9/u0-01/index.html',title:'登入，出發',unit:0,rounds:['登入因材網','電腦教室規則','成績怎麼算','這學期的故事'],managed:[0,1,2,3]}
]);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function section(host,title,text) {
  if(!text)return;const box=node('section');box.className='panel';box.append(node('h3',title),node('p',text));host.append(box);
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
export function renderQuestion(q,host,api={changed(){}}) {
  const d=q.data;host.dataset.questionType=q.type;host.dataset.slot=q.slot;
  section(host,d.heading||q.title,d.story||q.instruction);
  if(q.type==='finite-bank-v1') {
    section(host,'任務',d.task);section(host,'提示',d.hint);
    if(d.guide){const detail=node('details');detail.append(node('summary','拆成步驟'),node('p',d.guide));host.append(detail);}
    if(d.references)section(host,'資料卡（課本整理）',d.references.join('\n'));
    if(d.prompt)section(host,'目標／提示詞',d.prompt);
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
  const entry=BATCH1.find(a=>a.activity===cfg.week&&cfg.course==='115-g9');
  return entry?{...cfg,rounds:entry.rounds.map((name,r)=>({name,managed:entry.managed.includes(r)})),renderQuestion}:cfg;
}
