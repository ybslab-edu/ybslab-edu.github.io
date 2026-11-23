import {mountGuestLogin,showGuestPending,guestCompletion,GUEST_PENDING} from './fullrev-guest.mjs';
import {mountHintExample} from './fullrev-student-support.mjs';
// 共用活動外框：正式題庫與判分由 Worker 管理；公開暖身只供不上傳的複習。
import {growth} from './fullrev-progress.mjs';
import {openTeacherQuestion,mountTeacherQuestion} from './fullrev-teacher-view.mjs';
// 短版題與原活動關卡分離；不引用過關、成績或上傳介面。
const pick = (rnd, values) => values[Math.floor(rnd() * values.length)];
// 公開暖身以第一個選項為解答；抽題後再重排，與正式判分題庫分離。
const firstOption = 0;
const choice = (prompt, options, review) => ({prompt, options, answer: firstOption, review});
const entry = (activity, id, gen) => ({course: '115-g9', activity, id: `${activity}:${id}`, gen});
const WARMUP_BANK = [
  entry('u2-01', 'pixels', rnd => choice(
    `${pick(rnd, ['背號', '照片中的字'])}模糊時，增加哪個設定通常更清楚？`,
    ['像素格子數', '檔案名稱長度', '螢幕音量'], '像素格子越多，通常能保留越多影像細節。')),
  entry('u2-01', 'colors', rnd => {const bits = pick(rnd, [1, 2, 3]); return choice(
    `每格用 ${bits} 位元，最多能表示幾種顏色？`,
    [String(2 ** bits), String(2 ** bits + 1), String(2 ** bits - 1)], '每多一個位元，可以表示的顏色數就加倍。');}),
  entry('u2-01', 'size', rnd => {const side = pick(rnd, [2, 4, 8]); return choice(
    `${side} × ${side} 的影像共有幾格像素？`,
    [String(side * side), String(side * side + 1), String(side * side - 1)], '影像的像素總數＝寬的格子數 × 高的格子數。');}),
  entry('u2-02', 'sample', rnd => choice(
    `每秒量 ${pick(rnd, [8, 16, 32])} 次聲音，描述的是哪個設定？`,
    ['取樣頻率', '影像解析度', '影片長度'], '取樣頻率就是每秒測量聲音的次數。')),
  entry('u2-02', 'frames', rnd => {const fps = pick(rnd, [2, 3, 4]), seconds = pick(rnd, [2, 3]); return choice(
    `${fps} fps 的影片，${seconds} 秒共有幾張畫面？`,
    [String(fps * seconds), String(fps * seconds + 1), String(fps * seconds - 1)], '畫面總張數＝每秒張數（fps）× 秒數。');}),
  entry('u2-02', 'storage', rnd => {const minutes = pick(rnd, [2, 3, 4]); return choice(
    `每分鐘用 10 MB，錄 ${minutes} 分鐘需要幾 MB？`,
    [String(minutes * 10), String(minutes * 10 + 10), String(minutes * 10 - 10)], '所需容量＝每分鐘的資料量 × 錄影分鐘數。');}),
  entry('u2-03', 'binary', rnd => {const high = pick(rnd, [2, 4, 8]); return choice(
    `只有代表 ${high} 和 1 的燈亮著，數字是多少？`,
    [String(high + 1), String(high), String(high + 2)], '二進位燈牌只要把亮著的燈所代表的數字加起來。');}),
  entry('u2-03', 'byte', rnd => {const bytes = pick(rnd, [1, 2, 3]); return choice(
    `${bytes * 8} 位元等於幾位元組？`,
    [String(bytes), String(bytes + 1), String(bytes * 8)], '8 位元＝1 位元組。');}),
  entry('u2-03', 'range', rnd => {const bits = pick(rnd, [1, 2, 3]); return choice(
    `${bits} 顆亮暗燈，最大能表示多少？`,
    [String(2 ** bits - 1), String(2 ** bits), String(2 ** bits + 1)], '從 0 開始計算，n 顆燈的最大數字是 2 的 n 次方減 1。');}),
  entry('u2-04', 'decode', rnd => {const code = pick(rnd, [65, 66, 67]); return choice(
    `編碼表：65→A、66→B、67→C；${code} 是哪個字？`,
    [String.fromCharCode(code), 'D', 'E'], '解碼時，要用相同編碼表把數字對回文字。');}),
  entry('u2-04', 'encode', rnd => {const code = pick(rnd, [65, 66, 67]); return choice(
    `編碼表：A→65、B→66、C→67；${String.fromCharCode(code)} 的編碼是？`,
    [String(code), '68', '69'], '文字可以依編碼表轉成數字儲存。');}),
  entry('u2-04', 'display', rnd => pick(rnd, [
    choice('存檔用 Big5，打開卻用 UTF-8，容易出現什麼？', ['亂碼', '音量變大', '容量自動加倍'], '存檔和讀取使用不同編碼，可能把文字解成亂碼。'),
    choice('編碼正確，卻顯示缺字方塊，應先檢查什麼？', ['字型是否有這個字', '滑鼠速度', '音量'], '字型提供文字的外觀，缺少字形時可能顯示方塊。')
  ])),
  entry('u2-05', 'information', rnd => choice(
    `整理${pick(rnd, ['飲料票數', '點餐紀錄'])}後，得出「最多人選紅茶，先訂紅茶」，屬於什麼？`,
    ['資訊', '尚未整理的原始資料', '電腦硬體'], '資料經整理並能幫助決定，就成為有用的資訊。')),
  entry('u2-05', 'type', rnd => pick(rnd, [
    choice('想讓同學勾選多種喜歡的飲料，用哪種題型？', ['核取方塊', '單選', '線性刻度'], '允許選多個答案時，適合用核取方塊。'),
    choice('想請同學自由寫下選擇的理由，用哪種題型？', ['簡答', '單選', '線性刻度'], '要蒐集自由表達的理由，適合用簡答。')
  ])),
  entry('u2-05', 'survey', rnd => choice(
    `問「你喜歡${pick(rnd, ['紅茶和綠茶', '唱歌和跳舞'])}嗎？」有什麼問題？`,
    ['一次問兩件事', '字數一定太少', '不能用問號'], '一題只問一件事，才能清楚知道回答的意思。'))
];


// 依日期辨認先前活動；week 是雲端活動 ID，不能拿來排序。
export function drawWarmup({current, activities, isOpen, bank = WARMUP_BANK, rnd = Math.random}) {
  if (!current?.date || typeof isOpen !== 'function') return [];
  const previous = activities.filter(a => a.course === current.course && a.date < current.date && isOpen(a))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const sources = new Map(previous.map(a => [a.href.split('/')[1], a]));
  const seen = new Set();
  const pool = bank.filter(q => {
    if (q.course !== current.course || !sources.has(q.activity) || seen.has(q.id)) return false;
    seen.add(q.id); return true;
  });
  // 有界洗牌，不以重抽迴圈處理重複或題庫不足。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(q => {
    const question = q.gen(rnd), order = question.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {...question, id: q.id, source: sources.get(q.activity).title,
      options: order.map(i => question.options[i]), answer: order.indexOf(question.answer)};
  });
}

const checkWarmup = (question, answer) => Number.isInteger(answer) && answer === question.answer;

// 僅接收活動設定與容器，不取得 shell 狀態、身分、儲存或上傳介面。
function mountWarmup({cfg, main}) {
  if (typeof ACTIVITIES === 'undefined' || typeof isActivityOpen !== 'function') return;
  const current = ACTIVITIES.find(a => a.course === cfg.course && a.week === cfg.week);
  const draw = () => drawWarmup({current, activities: ACTIVITIES, isOpen: isActivityOpen});
  let questions = draw();
  if (!questions.length) return;
  const section = document.createElement('section');
  section.className = 'warmup'; section.id = 'warmup';
  section.setAttribute('aria-labelledby', 'warmup-title');
  main.querySelector('header').insertAdjacentHTML('afterend','<div id="warmup-slot"></div>');
  main.querySelector('#warmup-slot').append(section);
  const node = (tag, text, parent = section) => {
    const el = document.createElement(tag); el.textContent = text; parent.append(el); return el;
  };
  const button = (text, action, parent = section) => {
    const el = node('button', text, parent); el.type = 'button'; el.className = 'btn'; el.onclick = action; return el;
  };
  function render() {
    section.replaceChildren();
    node('h2', `開場暖身 ${questions.length} 題`).id = 'warmup-title';
    node('p', '快速複習前幾週，可隨時跳過；不影響過關、成績或 XP，答案不上傳。');
    button('跳過暖身', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    button('開始暖身', () => showQuestion(0, []));
  }
  function showQuestion(index, results) {
    section.replaceChildren();
    const q = questions[index];
    node('h2', `暖身 ${index + 1}／${questions.length}`).id = 'warmup-title';
    node('p', `複習：${q.source}`).className = 'small';
    node('p', q.prompt);
    const options = node('div', ''); options.className = 'warmup-options';
    q.options.forEach((text, answer) => button(text, () => {
      const next = [...results, {q, answer}];
      if (index + 1 < questions.length) showQuestion(index + 1, next);
      else showResults(next);
    }, options));
    button('跳過暖身', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    section.querySelector('h2').tabIndex = -1; section.querySelector('h2').focus();
  }
  function showResults(results) {
    section.replaceChildren();
    const title = node('h2', '暖身完成，回顧一下'); title.id = 'warmup-title'; title.tabIndex = -1;
    const list = node('ol', '');
    results.forEach(({q, answer}) => {
      const item = node('li', '', list);
      node('p', `${checkWarmup(q, answer) ? '✓ 答對' : '✗ 答錯'}｜${q.prompt}`, item);
      node('p', `你的答案：${q.options[answer]}；正確答案：${q.options[q.answer]}。`, item);
      node('p', q.review, item);
    });
    button('進入活動', () => {section.hidden = true; main.querySelector('#b-send').focus();});
    title.focus();
  }
  render();
  return () => {questions = draw(); section.hidden = !questions.length; render();};
}

const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const text=value=>Array.isArray(value)?value.join(''):value||'';
const para=(host,value)=>{if(value){const p=node('p',text(value));host.append(p);return p;}};
// 舊活動公開說明的版面副本；不含題庫、答案或判題。
const outcomeNotes={
 "7": "<div class=\"quest-note\"><p>星港策展團隊委託你設計「次元交會動漫／遊戲展」志工報名表。你要讀懂招募需求，修好蒐集內容、表單結構與發布設定；本組委託附件就在任務下方。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。答對後按「下一組」繼續。</p></div>",
 "8": "<div class=\"quest-note\"><p>小洛委託你整理星港策展團隊「次元交會動漫／遊戲展」的志工回覆，找出可供排班參考的資訊。你在本頁讀取附件並作答。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。答對後按「下一組」繼續。</p></div>",
 "9": "<div class=\"quest-note\"><p>你協助虛構音樂活動團隊整理素材。全部為示意資料，不填你或別人的真實個資。本組委託附件就在任務下方，所有作答都在 YBS 網站完成。</p><p>每關答對兩組不同資料才完成；答錯可修正，不扣分。答對後按「下一組」繼續。</p><p>既有紀錄如何對應：原燈牌解壓縮、燈牌壓縮、失真判斷、格式選擇的第 1～4 關紀錄，仍保留在相同索引；舊紀錄不代表做過新版題目。</p><p><strong>今天必做第 1、2 關；第 3、4 關另排時間完成。兩支影片 2-19（6:57）、2-20（8:26）都在課內完整播放。第 33 分開始獨立後測，停止教材、e 度與同儕協助。文字轉語音由影片與配對涵蓋。</strong></p></div>"
};
// 原生燈牌／容量題面沒有 hint、guide；保留舊站公開教學提示，不含特定題目的解答。
export function questionHints(question) {
 const d=question?.data||{},type=question?.type||'';
 let direction='',steps='';
 if(type.startsWith('binary-encode')){direction='最右邊代表 1，往左每顆都是右邊的 2 倍。';steps='從最大的燈開始想：放得下就點亮，再看剩多少；最後把亮燈代表的數字加起來核對。';}
 else if(type.startsWith('binary-decode')){direction='只加亮著的燈下面的數字。';steps='先找出亮燈，再由左到右逐一相加；暗燈不加。';}
 else if(type==='minimum-bits-v1'){direction='每多一顆燈，能表示的數量就加倍。';steps='從 1 顆最大 1 開始，每多一顆就把最大值乘 2 再加 1，直到能包含題目的最大數字。';}
 else if(type==='capacity-conversion-v1'){direction='8 位元＝1 位元組；1 KiB＝1024 位元組，KB、MB、GB 每級用 1000。';steps='先確認原單位和目標單位；大單位換小單位要乘，小換大要除，最後逐欄檢查單位。';}
 else if(type==='recording-capacity-v1'){direction='1 GB＝1000 MB；所需容量＝分鐘 × 每分鐘 MB。';steps='先把卡片容量換成 MB，再比較每種畫質能否錄完整場；最多分鐘用容量除以每分鐘 MB，取整數部分。';}
 return {direction:d.hint||direction,steps:d.guide||steps};
}
export async function mountStudentLogin({client,host,onLogin,explain}){
 const form=node('form');form.className='ybs-login';form.autocomplete='off';
 form.innerHTML=`<label>帳號<input name="account" inputmode="text" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="cgjh＋學號"></label><div><label for="activity-password">密碼</label><div class="ybs-password"><input id="activity-password" name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="cgjh＋身分證字號"><input type="button" class="ybs-password-toggle" value="顯示" aria-label="顯示密碼" aria-pressed="false" aria-controls="activity-password"><svg class="ybs-password-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></div></div><button type="submit" class="btn primary">登入</button>`;
 const account=form.querySelector('[name="account"]'),password=form.querySelector('[name="password"]'),submit=form.querySelector('button'),toggle=form.querySelector('.ybs-password-toggle');
 toggle.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.value=show?'隱藏':'顯示';toggle.setAttribute('aria-label',show?'隱藏密碼':'顯示密碼');toggle.setAttribute('aria-pressed',String(show));};
 const error=node('div');error.className='gerr';error.setAttribute('role','alert');
 const secondary=node('details');secondary.className='tlogin';secondary.append(node('summary','教師登入'));const actions=[submit];
 async function run(kind,guest){
  if(submit.disabled)return;actions.forEach(b=>b.disabled=true);submit.textContent='登入中…';error.textContent='';
  try{const p=await client.login(kind,guest||account.value,password.value);password.value='';await onLogin(p);}
  catch(e){password.value='';error.textContent=/invalid-account|auth\/(?:invalid|wrong|user-not)/.test(e.code||'')?'帳號或密碼不對，請再確認；還是不行請告訴老師。':explain(e);}
  finally{actions.forEach(b=>b.disabled=false);submit.textContent='登入';}
 }
 form.onsubmit=e=>{e.preventDefault();return run('password');};
 for(const [label,kind] of [...(client.studentGoogleLogin===true?[['學生 Google 登入','google']]:[]),['教師 Google 登入','owner']]){const b=node('button',label);b.type='button';b.className='linkbtn';b.onclick=()=>run(kind);actions.push(b);secondary.append(b);}
 host.append(form,error);
 if(client.course==='115-g9')mountGuestLogin({host,login:value=>run('guest',value),disabled:()=>submit.disabled});
 host.append(secondary);
}
export async function mountActivityShell({client:promise,cfg,mountLogin,xpCore,explain}){
 const css=node('link');css.rel='stylesheet';css.href='/assets/fullrev-shell.css?v=20261123lock';document.head.append(css);
 const activity=typeof ACTIVITIES==='undefined'?null:ACTIVITIES.find(a=>a.course===cfg.course&&a.week===cfg.week);
 const week=cfg.termWeek??(activity&&typeof termWeekOf==='function'?termWeekOf(activity):null);
 const title=week?`第 ${week} 週｜${cfg.title}`:cfg.title;
 const info=()=>cfg.rounds[round];
 const gate=node('section');gate.className='gate fullrev-activity';gate.id='gate';gate.append(node('h1',title));
 const login=node('div');login.id='g-gbtn';gate.append(login);
 const identityBox=node('div');identityBox.id='g-who';identityBox.hidden=true;identityBox.innerHTML='<p id="g-whotext" aria-live="polite"></p><div class="btns" style="justify-content:center"><button type="button" class="btn" id="g-notme">不是我</button><button type="button" class="btn primary" id="g-isme" hidden>對，開始</button></div>';gate.append(identityBox);
 const main=node('div');main.className='wrap fullrev-activity';main.id='main';main.hidden=true;
 main.innerHTML=`<header class="top"><div class="activity-heading"><div class="title-rounds"><h1 id="activity-title"></h1><nav class="rounds" id="rounds" aria-label="關卡"></nav></div><div class="who-bar"><a href="../../" class="linkbtn">← YBS Lab</a><span><b id="who"></b></span><button class="linkbtn" id="b-swap" type="button">不是我？換人</button><span class="upload-status" aria-live="polite"><span class="sync" id="sync" hidden></span><button class="sync warn" id="b-retry" type="button" hidden>重試上傳</button></span><details id="activity-tools"><summary class="linkbtn">活動工具</summary></details></div></div><aside class="xp-header" id="xp-header" hidden aria-live="polite"><a href="../me/" title="查看我的成長紀錄"><b id="xp-level">成長紀錄</b><span class="xp-mono" id="xp-total">載入中…</span><progress id="xp-progress" max="1" value="0" aria-label="升級進度" hidden></progress><span class="small" id="xp-next">等待雲端紀錄</span></a></aside></header><section class="sec" id="task-instructions"><h2 class="sec-h"><span class="num">1</span>任務說明</h2><div class="order" id="says" aria-live="polite"></div></section><section class="sec"><div id="original-work"><p class="round-status" id="round-status" aria-live="polite" aria-atomic="true"></p><div class="work-heading"><h2 class="sec-h"><span class="num">2</span>動手做</h2><button class="btn" id="b-hint" type="button" title="先試著送出一次，就能看提示。" disabled>我需要提示</button></div><div id="stage"></div><div class="btns"><button class="btn primary" id="b-send" type="button" disabled>送出</button><span class="small" id="answer-status" aria-live="polite" aria-atomic="true">作答中</span><span class="streak" id="streak"></span><span class="small" id="send-hint"></span></div><section class="verdict" id="verdict" hidden aria-live="polite"></section></div><aside class="hint-ladder" id="hint-ladder" aria-label="提示階梯"><div id="hint-content" aria-live="polite" aria-atomic="true"></div></aside></section><p class="foot">© 2026 YBS Lab　<a href="../../about/#h-rights" style="color:inherit">保留所有權利，未經同意請勿轉載或改作</a></p>`;
 // 與 origin/main 的公開暖身題庫、抽題及選擇題回顧相同；不上傳、不參與過關。
 const clientWarmupReset=mountWarmup({cfg,main})||(()=>{});
 const lock=node('div');lock.id='activity-lock';lock.hidden=true;
 lock.innerHTML=`<div><h1>這個活動還沒開放</h1><p>請回到 YBS Lab 首頁，做老師這週指定的活動。</p><p><a href="/">← 回 YBS Lab 首頁</a></p><p class="activity-unlock"><button type="button" class="linkbtn">教師解鎖</button></p></div>`;
 document.body.replaceChildren(gate,main,lock);
 const $=id=>main.querySelector('#'+id),status=$('sync'),send=$('b-send'),verdict=$('verdict'),stage=$('stage'),nav=$('rounds');
 $('activity-title').textContent=title;
 para($('task-instructions'),'切換關卡或活動會放棄未完成作答，回來從第一組開始。').className='small';
 let client;try{client=await promise;}catch(e){para(login,explain(e));return;}
 let round=0,handle=null,last=null,key='',mode='loading',sentValue='',submitted=false,hint=0,identity='',revision=0,read=0,starting=false,reading=false,snapshot=null,result=null,before=null,lastLearning='',pairTimer=null,refreshAgain=false,roundWork=Promise.resolve();
 // 開始前先選關，避免先建立第 0 關的 Worker session；重整沿用本人最後一關。
 const firstRound=Math.max(0,cfg.rounds.findIndex(r=>r.managed!==false));
 const roundKey=()=>`ybs:fullrev:round:${client.project}:${cfg.course}:${cfg.week}:${client.state().profile?.uid}`;
 const chooser=node('select');chooser.id='g-round';chooser.setAttribute('aria-label','開始關卡');
 cfg.rounds.forEach((r,i)=>{if(r.managed===false)return;const option=node('option',r.name);option.value=i;chooser.append(option);});
 const chooseLabel=node('label','開始關卡：');chooseLabel.append(chooser);identityBox.append(chooseLabel);
 function restoreRound(){
  round=firstRound;
  try{const saved=sessionStorage.getItem(roundKey());const n=Number(saved);if(saved!==null&&Number.isInteger(n)&&cfg.rounds[n]&&cfg.rounds[n].managed!==false)round=n;}catch{}
  chooser.value=round;
 }
 const catalog=()=>typeof ACTIVITIES==='undefined'?[]:ACTIVITIES.filter(a=>a.course===cfg.course);
 const say=value=>{const label=client.state().pending?'上傳中，請稍候，答案已保留。':value||(guestCompletion(last)?GUEST_PENDING:'')||(last?.completed&&mode!=='passed'?'上傳中，正在確認雲端紀錄…':result?'✓ 紀錄已上傳給老師':'');status.textContent=label;status.hidden=!label;status.className='sync'+(label.startsWith('✓')?' ok':'');};
 const tool=(label,run)=>{const b=node('button',label);b.type='button';b.className='linkbtn';b.onclick=run;$('activity-tools').append(b);return b;};
 const restart=tool('重新開始',()=>start(round,true)),claims=tool('老師已核發，重新確認',async()=>{try{await client.refreshClaims();await start(round,true);}catch(e){problem(e);}}),practice=tool('本機練習／示範',()=>{
  revision++;handle?.dispose?.();handle=null;last=null;stage.replaceChildren();mode='practice';verdict.hidden=true;send.disabled=true;say('本機練習／教師示範，不送出成績。');
  stage.append(node('h3','這一關的說明'));if(typeof cfg.demonstrate==='function')cfg.demonstrate(stage);else para(stage,'請依這一關的任務說明練習。');
 });
 const reread=tool('重新讀取',()=>client.state().profile?.provider==='anonymous'?start(round,true):refresh());reread.hidden=true;
 const gateReread=node('button','重新讀取');gateReread.type='button';gateReread.className='btn';gateReread.id='g-reread';gateReread.hidden=true;gateReread.onclick=()=>refresh();identityBox.append(gateReread);
 // 每個本人／控制版本只查一次單筆名冊；不列名單、不持久保存，也不作為作答授權。
 let person=null,personKey='';
 async function readPerson(value){
  const profile=client.state().profile;
  if(!profile||profile.owner||!['google.com','password'].includes(profile.provider))return null;
  const cacheKey=JSON.stringify([profile.uid,value.subject,value.controlVersions]);
  if(cacheKey===personKey)return person;
  const {auth,db}=await client.session(),user=auth.currentUser;
  if(user?.uid!==profile.uid)return null;
  const {claims}=await user.getIdTokenResult();
  const provider=claims.firebase?.sign_in_provider;
  if(provider!==profile.provider||typeof claims.email!=='string'||provider==='google.com'&&claims.email_verified!==true)return null;
  const email=claims.email.toLowerCase();
  if(!(provider==='password'?/^cgjh\d{3,12}@ybslab-edu\.github\.io$/:/^[a-z0-9._%+-]+@cgjh\.hcc\.edu\.tw$/).test(email))return null;
  const ref=await db.doc(`ybsCourses/${cfg.course}/roster/${email.replace('@ybslab-edu.github.io','@cgjh.hcc.edu.tw')}`).get({source:'server'});
  const row=ref.exists&&!ref.metadata?.fromCache&&ref.data();
  return row?.schemaVersion===1&&row.active===true&&row.subject===value.subject
   &&Number.isInteger(row.cls)&&row.cls>=100&&row.cls<=999&&Number.isInteger(row.seat)&&row.seat>=1&&row.seat<=60
   ?{subject:row.subject,cls:row.cls,seat:row.seat}:null;
 }
 function confirmIdentity(){
  const confirm=identityBox.querySelector('#g-isme'),message=identityBox.querySelector('#g-whotext');
  const valid=!!result;confirm.hidden=!valid;gateReread.hidden=valid;
  if(!valid){message.textContent='身分尚未確認，請重新讀取或告訴老師。';return;}
  if(person){$('who').textContent=person.cls+' 班 '+person.seat+' 號';message.textContent='你是 '+person.cls+' 班 '+person.seat+' 號，對嗎？';}
  else{$('who').textContent='已登入';message.textContent='已登入，準備好開始了嗎？';}
 }
 function controls(){
  const state=client.state(),changed=handle?.get&&JSON.stringify(handle.get())!==sentValue;
  const teacher=!!state.profile?.owner;send.hidden=teacher;$('answer-status').hidden=teacher;$('streak').hidden=teacher;$('b-hint').hidden=teacher;
  send.disabled=!handle||(handle.ready&&!handle.ready())||mode!=='working'||state.pending||['sending','restart-required','stale'].includes(state.status)||starting||!changed&&submitted;
  $('send-hint').textContent=mode!=='working'?'':submitted&&!changed?'先修改答案再送出':handle&&(handle.ready&&!handle.ready())?'全部完成後才能送出。':'';
  $('answer-status').textContent=mode==='guest-pending'?GUEST_PENDING:mode==='passed'?'過關':mode==='correct'?'已送出：答對':submitted&&!changed?'已送出：還不對':'作答中';
  restart.hidden=state.status!=='restart-required';claims.hidden=state.profile?.provider==='anonymous'||mode!=='binding-pending';
  practice.hidden=!state.profile?.owner&&state.profile?.provider!=='anonymous'&&mode!=='binding-pending';
  $('b-retry').hidden=!state.pending;
  $('activity-tools').hidden=[restart,claims,practice,reread].every(b=>b.hidden);
 }
 function rounds(){
  nav.replaceChildren();cfg.rounds.forEach((r,i)=>{const passed=result?.records.some(r=>r.activity===cfg.week&&r.round===i);const b=node('button',r.name+(passed?' ✓':''));b.type='button';b.className=passed?'passed':'';b.dataset.i=i;b.setAttribute('aria-pressed',String(i===round));b.onclick=()=>start(i);nav.append(b);});
 }
 function count(n){
  $('round-status').textContent=`第 ${round+1} 關／共 ${cfg.rounds.length} 關．本關答對 ${n}/2`;
  const streak=$('streak');streak.replaceChildren();streak.textContent=`累積答對 ${n}/2 `;for(let i=0;i<2;i++){const mark=node('i');mark.className=i<n?'on':'';streak.append(mark);}
 }
 let hintDemo=null;
 function hints(){
  hintDemo?.dispose();hintDemo=null;$('original-work').hidden=false;
  const b=$('b-hint'),box=$('hint-content'),d=questionHints(last?.question);b.disabled=!submitted||hint>=3||mode!=='working';b.title=!submitted?'先試著送出一次，就能看提示。':'看提示不影響分數與經驗值。';box.replaceChildren();
  if(hint>=1){box.append(node('h3','第 1 層：方向'));para(box,d.direction);}if(hint>=2){box.append(node('h3','第 2 層：拆步驟'));para(box,d.steps);}
  if(hint>=3){
   box.append(node('h3','第 3 層：另一題示範'));
   const b=node('button','看另一題示範');b.id='b-hint-example';b.type='button';b.className='btn';
   b.onclick=()=>{const demo=node('section');box.append(demo);b.hidden=true;$('original-work').hidden=true;
    hintDemo=mountHintExample({host:demo,example:last?.hintExample,renderQuestion:cfg.renderQuestion,onClose:()=>{hints();$('b-hint-example')?.focus();}});};box.append(b);
  }
 }
 $('b-hint').onclick=()=>{if(submitted){hint=Math.min(3,hint+1);hints();}};
 function instructions(){
  $('says').replaceChildren();['現在','要做到'].forEach((label,k)=>{const span=node('span');span.className='tk';span.append(node('b',label),node('span',[info().now||last?.question?.instruction||info().name,info().goal||last?.question?.data?.task||'完成兩組不同資料。'][k]));$('says').append(span);});
 }
 function layoutOutcome(d){
  if(!d?.questions||!d.kinds)return;
  stage.classList.add('quest-outcome');
  const intro=stage.querySelector('.panel'),work=node('div');work.className='quest-work panel';
  if(intro){
   if(outcomeNotes[cfg.week]){const fragment=node('div');fragment.innerHTML=outcomeNotes[cfg.week];intro.replaceChildren(...fragment.firstChild.childNodes);}
   else{const heading=intro.querySelector('h3');if(heading)heading.hidden=true;}
   intro.className='quest-note';
  }
  const tables=stage.querySelectorAll('.fullrev-outcome-table');
  tables.forEach(wrap=>{const t=wrap.querySelector('table');t.className='quest-table';});
  let chartLabel=null;
  if(d.chartRows){
   const originalChart=stage.querySelector('[aria-label="職務第一志願比較（人）"]'),chart=node('ul');chart.className='quest-chart';
   const caption=node('p','職務第一志願比較（人）；實心為國中組，斜線為高中組。各長條共用 0～6 人刻度。');
   for(const [job,group,count] of d.chartRows){
    const row=node('li'),label=node('span',job),track=node('span'),bar=node('span');
    label.append(node('br'),node('span',group));track.className='track';bar.className='bar'+(group==='高中組'?' bar-high':'');bar.style.width=count/6*100+'%';
    track.append(bar);row.append(label,track,node('span',count+' 人'));chart.append(row);
   }
   // 保留具名 section 的 region 語意，僅替換區域內的圖表排列。
   originalChart.replaceChildren(caption,chart);
  }
  if(d.chartNames){
   const originalChart=stage.querySelector('[aria-label="人數長條圖"]'),chart=node('ul');chart.className='quest-chart';chart.setAttribute('aria-label','人數長條圖');
   stage.replaceChildren(...[...stage.childNodes].map(el=>el===originalChart?chart:el));
   const total=d.chartCounts.reduce((sum,n)=>sum+n,0);chartLabel=para(stage,'統計圖（由同一份回覆計算；單位：人）');
   d.chartNames.forEach((name,k)=>{const row=node('li'),track=node('span'),bar=node('span');row.className='quest-chart-row';track.className='track';bar.className='bar';bar.style.width=d.chartCounts[k]/total*100+'%';track.append(bar);row.append(node('span',name),track,node('span',d.chartCounts[k]+' 人'));chart.append(row);});
  }
  const children=[...stage.childNodes].filter(e=>e.nodeType===1&&e!==intro&&e.tagName!=='STYLE');
  const chart=stage.querySelector('.quest-chart');
  const summary=['form-summary','form-volunteer-summary'].includes(d.mode),volunteer=d.mode.startsWith('form-volunteer-');
  const task=text(d.guide).match(/(?:任務|讀取委託)\s+(\d+-\d+)/)?.[1];
  work.append(node('h3',task?(volunteer?'委託任務 ':'示意任務 ')+task:d.heading||info().name));
  const answers=node('div');answers.className='quest-answers';
  if(tables.length&&d.indexRows){const caption=node('caption','原始回覆（示意）');tables[0].querySelector('table').append(caption);}
  for(const el of children){
   if(el===chartLabel&&chart)continue;
   // 舊第 1 關表格後直接接統計圖，不再重述任務說明中的目標。
   if(summary&&el.tagName==='P'&&el.textContent===text(d.passages)){
    stage.replaceChildren(...[...stage.childNodes].filter(child=>child!==el));
    continue;
   }
   if(el.tagName==='LABEL'){answers.append(el);continue;}
   if(el===chart&&chartLabel)work.append(chartLabel);
   work.append(el);
  }
  work.append(answers);stage.append(work);
 }
 function showQuestion(value){
  stage.classList.remove('quest-outcome');stage.dataset.round=round;
  const carry=handle?.carry?.();handle?.dispose?.();stage.replaceChildren();handle=null;
  if(typeof cfg.renderQuestion!=='function')throw Error('renderer-pending');
  handle=cfg.renderQuestion(value.question,stage,{changed:controls,carry:value.photoAnswer||value.performanceOrder||carry,demonstration:false,shell:true});layoutOutcome(value.question.data);mode='working';sentValue='';submitted=false;verdict.hidden=true;count(value.question.slot);instructions();hints();controls();
 }
 function problem(e){
  if(e.code==='identity-changed'||!client.state().profile)return;
  if(e.code==='not-open'){lock.hidden=false;main.hidden=true;gate.hidden=true;mode='closed';}
  else{if(e.code==='binding-pending')mode='binding-pending';say(e.code==='pending'?'上傳中，請稍候，答案已保留。':explain(e));if(['retry-later','read-model-pending'].includes(e.code))reread.hidden=false;}
  controls();
 }
 async function receive(value){
  if(value.activity!==undefined&&(value.activity!==cfg.week||value.round!==round))return;
  const k=JSON.stringify([value.sid,value.nextSeq,value.completed,value.correct]);if(k===key)return;key=k;
  const old=last;last=value;starting=false;lastLearning=old?.question?.data?.learning||lastLearning;
  if(value.photo&&!handle)showQuestion({...value.photo,photoAnswer:value.photoAnswer});
  if(value.performance){if(!handle&&value.performance.question)showQuestion({question:value.performance.question});handle?.feedback?.(value.performance);}
  if(value.awaitingTeacher){mode='teacher-pending';say('等待老師確認');controls();return;}
  if(showGuestPending({value,host:verdict,next:round+1<cfg.rounds.length?()=>start(round+1):null})){mode='guest-pending';count(2);say(GUEST_PENDING);controls();return;}
  if(value.completed){mode='confirming';send.disabled=true;say('上傳中，正在確認雲端紀錄…');await refresh();return;}
  if(value.question.slot===1&&(value.photoAnswer||value.performanceOrder)){
   showQuestion(value);mode='confirming';controls();const g=revision;
   if(!pairTimer)pairTimer=setTimeout(async()=>{pairTimer=null;if(g!==revision)return;try{await receive(await client.answer(cfg.week,round,value.photoAnswer||value.performanceOrder));}catch(e){problem(e);}},0);
  }else if(value.correct===true&&value.question.slot===1){
   mode='correct';count(1);verdict.className='verdict mid';verdict.replaceChildren(node('h3','答對了！累積答對 1/2'));para(verdict,'按「下一組」挑戰不同資料，累積答對 2/2 就過關。');
   const btns=node('div'),b=node('button','下一組');btns.className='btns';b.type='button';b.className='btn primary';b.id='b-next-group';b.onclick=()=>{if(mode==='correct'){showQuestion(last);$('task-instructions').scrollIntoView?.({block:'start'});}};btns.append(b);verdict.append(btns);verdict.hidden=false;say('');
  }else if(value.correct===false&&handle&&old?.sid===value.sid&&old.question?.slot===value.question.slot){
   mode='working';submitted=true;hint=Math.min(3,hint+1);verdict.className='verdict no';verdict.replaceChildren(node('h3','還不對'));para(verdict,value.feedback||'請再核對這一組的題目與資料。');para(verdict,'修改答案後再送一次').className='small';verdict.hidden=false;hints();say('');
  }else{showQuestion(value);say('');}controls();
 }
 function passed(){
  if(client.state().pending||!last?.completed||!result?.records.some(r=>r.activity===cfg.week&&r.round===round))return;
  mode='passed';count(2);verdict.className='verdict ok';verdict.replaceChildren(node('h3','過關！'));para(verdict,info().learn||lastLearning||'你已完成這一關的兩組挑戰。');
  const item=result.activities.find(a=>a.activity===cfg.week),detail=item.rounds[round],old=before?.activities.find(a=>a.activity===cfg.week);
  if(old?.rounds[round]?.passed)para(verdict,'這關已領過 XP。');else{
   const bits=['+'+detail.passXP+' 過關'];if(detail.onTimeXP)bits.push('+'+detail.onTimeXP+' 準時');if(item.completeXP>(old?.completeXP||0))bits.push('+'+item.completeXP+' 全過');para(verdict,'本關 XP：'+bits.join('、')).className='xp-detail';
   if(before&&result.level>before.level){const card=node('div');card.className='xp-title-card';card.append(node('strong','升級！Lv '+result.level));para(card,result.title);verdict.append(card);}
  }
  const btns=node('div');btns.className='btns';if(round+1<cfg.rounds.length){const b=node('button','下一關');b.type='button';b.className='btn primary';b.onclick=()=>start(round+1);btns.append(b);}else para(btns,item.passed===cfg.rounds.length?'全部過關！':`這一關完成了！這個活動目前完成 ${item.passed}／${cfg.rounds.length} 關。`);verdict.append(btns);verdict.hidden=false;hint=0;submitted=false;hints();say('✓ 紀錄已上傳給老師');controls();
 }
 async function refresh(){
  if(!client.state().profile||client.state().profile.owner||client.state().profile.provider==='anonymous')return;if(reading){refreshAgain=true;return;}
  reading=true;const n=++read,g=revision;
  try{
   const fresh=await client.progress({activities:catalog()});const xp=await xpCore();if(n!==read||g!==revision)return;
   const cacheKey=JSON.stringify([client.state().profile.uid,fresh.subject,fresh.controlVersions]);
   const currentPerson=await readPerson(fresh).catch(()=>null);if(n!==read||g!==revision)return;
   snapshot=fresh;person=currentPerson;personKey=cacheKey;
   const value=growth(snapshot,{project:client.project,course:cfg.course,subject:snapshot.subject,provider:snapshot.provider,activities:catalog()},xp);
   result=value.state==='confirmed'?value:null;reread.hidden=!!result;
   confirmIdentity();if(!result){say(explain(value));return;}
   $('xp-header').hidden=false;$('xp-level').textContent='Lv '+result.level+' '+result.title;$('xp-total').textContent=result.totalXP+' XP';$('xp-progress').hidden=false;$('xp-progress').value=result.progress;$('xp-next').textContent=result.next===null?'已達最高等級':'下一級還差 '+result.remaining+' XP';
   rounds();if(last?.completed)passed();else say('');
  }catch(e){if(n===read&&g===revision){result=null;reread.hidden=false;confirmIdentity();problem(e);}}
  finally{if(n===read){controls();reading=false;if(refreshAgain){refreshAgain=false;refresh();}}}
 }
 async function start(i=round,reopen=false){
  // 待送時保留目前題面；重整後尚無題面，須讓 client.start 續傳同關草稿。
  if(i===round&&(starting||client.state().pending&&(handle||reopen)))return;
  // 切關沿用舊站行為：放棄未完成作答，重新進入時從第一組開始。
  round=i;chooser.value=i;
  try{sessionStorage.setItem(roundKey(),String(i));}catch{}
  const g=++revision;read++;reading=false;handle?.dispose?.();handle=null;last=null;key='';mode='loading';lastLearning='';clearTimeout(pairTimer);pairTimer=null;hint=0;submitted=false;starting=true;before=result;delete stage.dataset.questionType;delete stage.dataset.slot;delete stage.dataset.round;stage.replaceChildren();verdict.hidden=true;instructions();rounds();count(0);hints();controls();
  if(client.state().profile?.owner){
   send.hidden=true;$('answer-status').hidden=true;$('streak').hidden=true;$('b-hint').hidden=true;
   $('round-status').textContent=`教師示範：第 ${round+1} 關／共 ${cfg.rounds.length} 關`;
   say('正在取得教師題面與解答…');
   try{
    const value=await openTeacherQuestion({client,activity:cfg.week,round:i,current:()=>g===revision});
    if(!value)return;
    handle=mountTeacherQuestion({host:stage,value,renderQuestion:cfg.renderQuestion,onNew:()=>start(round,true)});
    mode='teacher';say('教師示範，不送出成績。');
   }catch(e){if(g!==revision||!client.state().profile?.owner)return;
    say(e.code==='reauth-required'?'教師驗證已逾 10 分鐘，請重新登入。':e.code==='owner-required'?'教師授權已失效，請重新登入。':'教師題面與解答尚未取得，請重試或告知老師。');
    const retry=node('button',e.code==='reauth-required'?'重新登入教師帳號':'重試教師題面');retry.type='button';retry.className='btn';
    retry.onclick=e.code==='reauth-required'?()=>client.login('owner').catch(problem):()=>start(round,true);stage.append(retry);
   }finally{if(g===revision){starting=false;controls();}}
   return;
  }
  if(info().managed===false){starting=false;mode='unmanaged';say('這一關尚待老師確認，請選其他關卡。');controls();return;}
  say('載入中…');
  // 快速連點以最後選擇為準；前一個 start 回應後才送下一關，略過已被取代的選擇。
  const work=roundWork.then(()=>g===revision?client.start(cfg.week,i,{restart:reopen}):null);
  roundWork=work.catch(()=>{});
  try{const value=await work;if(value&&g===revision)await receive(value);}
  catch(e){if(g===revision)problem(e);}finally{if(g===revision){starting=false;controls();}}
 }
 send.onclick=async()=>{
  if(send.disabled||!handle)return;sentValue=JSON.stringify(handle.get());submitted=true;const g=revision;send.disabled=true;
  try{const value=await client.answer(cfg.week,round,handle.get());if(g===revision)await receive(value);}
  catch(e){if(g===revision)problem(e);}finally{if(g===revision)controls();}
 };
 $('b-retry').onclick=async()=>{try{const values=await client.retry();if(values.length)await receive(values.at(-1));}catch(e){problem(e);}};
 $('b-swap').onclick=()=>client.logout().catch(problem);
 identityBox.querySelector('#g-notme').onclick=$('b-swap').onclick;
 identityBox.querySelector('#g-isme').onclick=()=>{gate.hidden=true;main.hidden=false;return start(Number(chooser.value)).then(refresh);};
 lock.querySelector('button').onclick=()=>{lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;login.querySelector('details').open=true;};
 function clear(){hintDemo?.dispose();hintDemo=null;hint=0;submitted=false;$('hint-content').replaceChildren();$('original-work').hidden=false;clientWarmupReset();clearTimeout(pairTimer);pairTimer=null;handle?.dispose?.();revision++;read++;reading=false;starting=false;roundWork=Promise.resolve();handle=null;last=null;key='';mode='loading';result=null;snapshot=null;person=null;personKey='';$('who').textContent='';identityBox.querySelector('#g-whotext').textContent='';before=null;stage.replaceChildren();verdict.hidden=true;$('xp-header').hidden=true;lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;say('');}
 client.subscribe(state=>{
  if(!state.profile){identity='';clear();return;}
  const id=state.profile.uid+':'+state.profile.owner;
  if(id!==identity){identity=id;restoreRound();
   $('who').textContent=state.profile.owner?'教師模式':state.profile.guest?state.profile.guest.cls+' 班 '+state.profile.guest.seat+' 號（待審）':'已登入';
   if(state.profile.owner||state.profile.provider==='anonymous'){gate.hidden=true;main.hidden=false;start(round);}
   else{
    gate.hidden=false;main.hidden=true;login.hidden=true;identityBox.hidden=false;
    const message=identityBox.querySelector('#g-whotext'),confirm=identityBox.querySelector('#g-isme');confirm.hidden=true;message.textContent='正在確認你的身分…';
    refresh();
   }
  }
  if(state.status==='stale'){clear();identity='';return;}
  if(state.readingRetry){identityBox.querySelector('#g-whotext').textContent='載入中，請稍候…';say('載入中，請稍候…（'+Math.max(1,Math.ceil((state.readingRetry.retryAt-Date.now())/1000))+' 秒後自動重試）');}
  else if(state.pending)say('上傳中，請稍候，答案已保留。');
  if(['ready','confirmation-pending','teacher-pending','guest-pending'].includes(state.status)&&state.view?.activity===cfg.week&&state.view.round===round)receive(state.view).catch(problem);
  controls();
 });
 await mountLogin({client,host:login,oldlook:true});
 try{await client.restore();}catch(e){para(login,explain(e));}
 const focus=()=>{if(client.state().profile){if(client.state().profile.owner){if(!starting)start(round,true);return;}if(mode==='closed'){lock.hidden=true;main.hidden=false;start(round,true).then(refresh);}else if(!starting)refresh();}};
 window.addEventListener('pageshow',event=>{if(event.persisted)client.restore().catch(problem);});
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')focus();});window.addEventListener('pagehide',()=>{identity='';clear();});
}
