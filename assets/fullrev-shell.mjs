import {answerValidation} from './fullrev-answer-ui.mjs';
import {mountGuestLogin,showGuestPending,guestCompletion,GUEST_PENDING} from './fullrev-guest.mjs';
import {mountHintExample} from './fullrev-student-support.mjs';
// 共用活動外框：正式題庫與判分由 Worker 管理；公開暖身只供不上傳的複習。
import {growth,int,versions,sameVersions} from './fullrev-progress.mjs';
import {WORK_TTL} from './fullrev-work-store.mjs';

export function roundAccess(index,{owner=false,completed=[]}={}){
 const locked=!owner&&index>0&&!completed.includes(index-1);
 return {locked,reason:locked?`你要先完成第 ${index} 關，才能進入這一關。`:''};
}
export function startWaitMessage(retry,now=Date.now(),sending=false){
 const seconds=Math.max(0,Math.ceil((retry.retryAt-now)/1000));
 return seconds?`切換太快，請等 ${seconds} 秒`:retry.automatic||sending?'等待結束，正在重新載入題目…':'你可以按「重試上傳」繼續，答案已保留。';
}

// 切窗事件共用一次請求；已確認進度（含過關回條）後 60 秒內不自動重讀。
export function createFocusRefresh(refresh,{now=Date.now,intervalMs=60000}={}){
 let last=-Infinity,inflight=null;
 const run=()=>{
  if(inflight)return inflight;
  if(now()-last<intervalMs)return Promise.resolve();last=now();
  const work=Promise.resolve().then(refresh);inflight=work;
  return work.finally(()=>{if(inflight===work)inflight=null;});
 };
 run.touch=()=>{last=now();};
 run.reset=()=>{last=-Infinity;inflight=null;};return run;
}
import {openTeacherQuestion,mountTeacherQuestion} from './fullrev-teacher-view.mjs';
// 短版題與原活動關卡分離；不引用過關、成績或上傳介面。
function warmupRandom(rnd) {
  if (typeof rnd !== 'function') throw new TypeError('暖身 rnd 必須是函式');
  const value = rnd();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new RangeError('暖身亂數必須是 0（含）到 1（不含）的有限數字');
  return value;
}
const pick = (rnd, values) => values[Math.floor(warmupRandom(rnd) * values.length)];
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
  const random = () => warmupRandom(rnd);
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
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map(q => {
    const question = q.gen(random), order = question.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
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
// 原生燈牌／容量題面沒有 hint、guide；保留舊站公開教學提示，不含特定題目的解答。
export function questionHints(question) {
 const d=question?.data||{},type=question?.type||'';
 if(d.mode==='form-volunteer-sheet-v2')return {
  direction:['你先確認收件截止後的處理順序，再核對完整副本與指定案例。','你把標記與排除分開看；選填空白與有效重複不等於無效回覆。','你從初始副本比較所選欄位，核對欄名、保留順序與衝突回覆。','你先核對目前篩選，再逐職務數回覆；圖表與補招建議要使用同一份統計。'][d.round],
  steps:['先看資料規格與原始表，再核對備份的三個查核項目，最後分類指定儲存格或列對。','先套用格式，逐列核對同意、必填與期待程度，再勾選排除；指定列可以同時有多個原因。','改設定後重新執行，再查看保留與移除區；同代號但內容不同的回覆需要另外核對。','套用篩選後填寫並記錄統計，選來源與標題重新製圖，再讀百分比並比較需求缺口。'][d.round]};
 let direction='',steps='';
 if(type.startsWith('binary-encode')){direction='最右邊代表 1，往左每顆都是右邊的 2 倍。';steps='從最大的燈開始想：放得下就點亮，再看剩多少；最後把亮燈代表的數字加起來核對。';}
 else if(type.startsWith('binary-decode')){direction='只加亮著的燈下面的數字。';steps='先找出亮燈，再由左到右逐一相加；暗燈不加。';}
 else if(type==='minimum-bits-v1'){direction='每多一顆燈，能表示的數量就加倍。';steps='從 1 顆最大 1 開始，每多一顆就把最大值乘 2 再加 1，直到能包含題目的最大數字。';}
 else if(type==='capacity-conversion-v1'){direction='8 位元＝1 位元組；1 KiB＝1024 位元組，KB、MB、GB 每級用 1000。';steps='先確認原單位和目標單位；大單位換小單位要乘，小換大要除，最後逐欄檢查單位。';}
 else if(type==='recording-capacity-v1'){direction='1 GB＝1000 MB；所需容量＝分鐘 × 每分鐘 MB。';steps='先把卡片容量換成 MB，再比較每種畫質能否錄完整場；最多分鐘用容量除以每分鐘 MB，取整數部分。';}
 return {direction:d.hint||direction,steps:d.guide||steps};
}
export async function mountStudentLogin({client,host,onLogin,explain,active=()=>true}){
 const form=node('form');form.className='ybs-login';form.autocomplete='off';
 form.innerHTML=`<label>帳號<input name="account" inputmode="text" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="cgjh＋學號"></label><div><label for="activity-password">密碼</label><div class="ybs-password"><input id="activity-password" name="password" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="cgjh＋身分證字號"><input type="button" class="ybs-password-toggle" value="顯示" aria-label="顯示密碼" aria-pressed="false" aria-controls="activity-password"><svg class="ybs-password-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></div></div><button type="submit" class="btn primary">登入</button>`;
 const account=form.querySelector('[name="account"]'),password=form.querySelector('[name="password"]'),submit=form.querySelector('button'),toggle=form.querySelector('.ybs-password-toggle');
 toggle.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.value=show?'隱藏':'顯示';toggle.setAttribute('aria-label',show?'隱藏密碼':'顯示密碼');toggle.setAttribute('aria-pressed',String(show));};
 const error=node('div');error.className='gerr';error.setAttribute('role','alert');
 const secondary=node('div');secondary.className='tlogin';secondary.setAttribute('role','group');secondary.setAttribute('aria-label','其他登入方式');const actions=[submit];
 async function run(kind,guest){
  if(!active()||submit.disabled)return;actions.forEach(b=>b.disabled=true);submit.textContent='登入中…';error.textContent='';
  try{const p=await client.login(kind,guest||account.value,password.value);if(!active())return;password.value='';await onLogin(p);}
  catch(e){if(!active())return;password.value='';error.textContent=/invalid-account|auth\/(?:invalid|wrong|user-not)/.test(e.code||'')?'帳號或密碼不對，請再確認；還是不行請告訴老師。':explain(e);}
  finally{if(active()){actions.forEach(b=>b.disabled=false);submit.textContent='登入';}}
 }
 form.onsubmit=e=>{e.preventDefault();return run('password');};
 for(const [label,kind] of [...(client.studentGoogleLogin===true?[['學生 Google 登入','google']]:[]),['教師 Google 登入','owner']]){const b=node('button',label);b.type='button';b.className='linkbtn';if(kind==='owner')b.dataset.teacherLogin='';b.onclick=()=>run(kind);actions.push(b);secondary.append(b);}
 host.append(form,error,secondary);
 if(client.course==='115-g9')mountGuestLogin({host,login:value=>run('guest',value),disabled:()=>submit.disabled});
}
export async function mountActivityShell({client:promise,cfg,mountLogin,xpCore,explain,now=Date.now}){
 const css=node('link');css.rel='stylesheet';css.href='/assets/fullrev-shell.css?v=20261127sheet';document.head.append(css);
 const activity=typeof ACTIVITIES==='undefined'?null:ACTIVITIES.find(a=>a.course===cfg.course&&a.week===cfg.week);
 const courseClosed=()=>typeof COURSES!=='undefined'&&COURSES.some(c=>c.id===cfg.course&&!c.open);
 // OPEN 由舊站共用清單提供；日期與台灣週日邊界沿用 activities.js。
 const scheduleLocked=()=>courseClosed()||!activity||typeof isActivityOpen!=='function'||!isActivityOpen(activity);
 const week=cfg.termWeek??(activity&&typeof termWeekOf==='function'?termWeekOf(activity):null);
 const info=()=>cfg.rounds[round];
 const gate=node('section');gate.className='gate fullrev-activity';gate.id='gate';
 const login=node('div');login.id='g-gbtn';gate.append(login);
 const identityBox=node('div');identityBox.id='g-who';identityBox.hidden=true;identityBox.innerHTML='<p id="g-whotext" aria-live="polite"></p><div class="btns" style="justify-content:center"><button type="button" class="btn" id="g-notme">不是我</button><button type="button" class="btn primary" id="g-isme" hidden>對，開始</button></div>';gate.append(identityBox);
 const main=node('div');main.className='wrap fullrev-activity'+(cfg.course==='115-g9'&&cfg.week===8?' fullrev-sheet-activity':'');main.id='main';main.hidden=true;
 main.innerHTML=`<header class="top" id="activity-header"><div class="header-bar"><a href="../../" class="header-back">← YBS Lab</a><div class="header-account"><aside class="xp-header" id="xp-header" hidden aria-live="polite"><a href="../me/" title="查看我的成長紀錄"><b id="xp-level">成長紀錄</b><span class="xp-wide xp-separator" aria-hidden="true"> · </span><span class="xp-wide xp-mono" id="xp-total"></span></a></aside><details class="account" id="account"><summary id="account-toggle" aria-label="帳號選單"><span class="account-avatar" id="account-avatar" aria-hidden="true">生</span><span class="account-name" id="account-name">尚未登入</span></summary><div class="account-menu"><div class="account-info"><b id="who">尚未登入</b><p id="account-info">請先登入或填班級座號。</p></div><div id="xp-detail"><progress id="xp-progress" max="1" value="0" aria-label="升級進度" hidden></progress><span class="small" id="xp-next"></span></div><a class="account-action" id="account-growth" href="../me/">成長紀錄</a><button class="account-action" id="b-swap" type="button">不是我？換人</button><button class="account-action" id="b-logout" type="button">登出</button></div></details></div></div><div class="activity-week" id="activity-week"></div><h1 id="activity-title"></h1><p class="activity-subtitle" id="activity-subtitle" aria-live="polite"></p><nav class="rounds" id="rounds" aria-label="關卡"></nav><p id="round-unlock-hint" class="small" hidden>完成目前關卡後解鎖下一關</p><span class="upload-status" aria-live="polite"><span class="sync" id="sync" hidden></span><button class="sync warn" id="b-retry" type="button" hidden>重試上傳</button></span><details id="activity-tools"><summary class="linkbtn">活動工具</summary></details></header><section class="sec" id="task-instructions"><h2 class="sec-h"><span class="num">1</span>任務說明</h2><div class="order" id="says" aria-live="polite"></div></section><section class="sec"><div id="original-work"><p class="round-status" id="round-status" aria-live="polite" aria-atomic="true"></p><div class="work-heading"><h2 class="sec-h"><span class="num">2</span>動手做</h2><button class="btn" id="b-hint" type="button" title="先試著送出一次，就能看提示。" disabled>我需要提示</button></div><p id="draft-notice" class="small" role="status" aria-live="polite"></p><div id="stage"></div><div class="btns"><span id="send-control" class="send-control" role="group" aria-label="送出"><button class="btn primary" id="b-send" type="button" aria-describedby="send-hint" disabled>送出</button></span><span class="small" id="answer-status" aria-live="polite" aria-atomic="true">作答中</span><span class="streak" id="streak"></span><span class="small" id="send-hint" role="status" aria-live="polite" aria-atomic="true"></span><a id="quota-old" class="linkbtn" href="/ybs-old/" hidden>改用舊站</a></div><section class="verdict" id="verdict" hidden aria-live="polite"></section></div><aside class="hint-ladder" id="hint-ladder" aria-label="提示階梯"><div id="hint-content" aria-live="polite" aria-atomic="true"></div></aside></section><footer class="foot">© 2026 YBS Lab　<a href="../../about/#h-rights" style="color:inherit">保留所有權利，未經同意請勿轉載或改作</a></footer>`;
 // 與 origin/main 的公開暖身題庫、抽題及選擇題回顧相同；不上傳、不參與過關。
 const clientWarmupReset=mountWarmup({cfg,main})||(()=>{});
 const lock=node('div');lock.id='activity-lock';lock.hidden=true;
 lock.innerHTML=`<div><h1>這個活動還沒開放</h1><p>請回到 YBS Lab 首頁，做老師這週指定的活動。</p><p><a href="/">← 回 YBS Lab 首頁</a></p><p class="activity-unlock"><button type="button" class="linkbtn">教師解鎖</button></p></div>`;
 lock.querySelector('h1').textContent=courseClosed()?'本學年未開設這門課':'這個活動還沒開放';
 lock.hidden=!scheduleLocked();gate.hidden=!lock.hidden;
 const header=main.querySelector('header'),headerWrap=node('div');headerWrap.className='wrap shell-header-wrap fullrev-activity';headerWrap.append(header);
 document.body.replaceChildren(headerWrap,gate,main,lock);
 const $=id=>header.querySelector('#'+id)||main.querySelector('#'+id),status=$('sync'),send=$('b-send'),verdict=$('verdict'),stage=$('stage'),nav=$('rounds');
 $('activity-title').textContent=cfg.title;
 $('activity-week').textContent=week?`第 ${week} 週`:'';
 $('activity-subtitle').textContent=`第 1 關　${cfg.rounds[0].name}`;
 const account=$('account'),toggle=$('account-toggle');
 const closeAccount=(focus=false)=>{account.open=false;if(focus)toggle.focus();};
 document.body.addEventListener('keydown',e=>{if(e.key==='Escape'&&account.open){e.preventDefault();closeAccount(true);}});
 document.body.addEventListener('click',e=>{if(!account.contains(e.target))closeAccount();});
 para(main.querySelector('.foot'),'你要先完成這一關，再前往下一關。你可以回看已完成的關卡；想重做時，請按「再做一次」。').className='small';
 let client;try{client=await promise;}catch(e){para(login,explain(e));return;}
 let round=0,handle=null,last=null,key='',mode='loading',sentValue='',submitted=false,hint=0,identity='',revision=0,read=0,starting=false,reading=false,snapshot=null,result=null,before=null,lastLearning='',pairTimer=null,refreshWork=null,roundWork=Promise.resolve();
 let teacherLogin=false,scheduleBlocked=false,loadProblem='',validation=null,restoringInput=false;
 let waitTimer=null,waitMessage='',guestStorageKey='',guestRestore=null;const guestCompleted=new Map();
 const guestEpochs=['configVersion','unitEpoch','roundEpoch','classUnitEpoch'];
 const validGuestSummary=c=>versions(c?.controlVersions)&&guestEpochs.every((k,i)=>int(c[k],i===0?1:0));
 function saveGuestCompleted(savedAt=now()){try{
  if(!guestStorageKey)return;
  if(!guestCompleted.size){sessionStorage.removeItem(guestStorageKey);return;}
  sessionStorage.setItem(guestStorageKey,JSON.stringify({savedAt,rounds:[...guestCompleted].map(([i,v])=>[i,Object.fromEntries(['completed','status','verified','counted','attemptId','completionContext'].map(k=>[k,v[k]]))])}));
 }catch{}}
 async function restoreGuestCompleted(){
  guestCompleted.clear();guestStorageKey=client.state().profile?.provider==='anonymous'?roundKey()+':guest-completed':'';
  if(!guestStorageKey)return;
  const storageKey=guestStorageKey,g=revision,uid=client.state().profile.uid,confirmed=new Map();let controls=null,controlChanged=false;
  const current=()=>g===revision&&storageKey===guestStorageKey&&uid===client.state().profile?.uid;
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey));if(!Number.isFinite(saved?.savedAt)||saved.savedAt>now()||now()-saved.savedAt>=WORK_TTL||!Array.isArray(saved.rounds)){sessionStorage.removeItem(storageKey);return;}
   // 重整先向受控 context 核對；未核對、舊版缺版本或失效摘要都不能解鎖。
   for(const [i,v] of saved.rounds)if(Number.isInteger(i)&&cfg.rounds[i]&&guestCompletion(v)&&validGuestSummary(v.completionContext)){
    try{const c=await client.context(cfg.week,i);if(!current())return;
     if(controls&&!sameVersions(controls,c.controlVersions))controlChanged=true;
     controls=c.controlVersions;
     if(sameVersions(c.controlVersions,v.completionContext.controlVersions)&&guestEpochs.every(k=>c[k]===v.completionContext[k]))confirmed.set(i,v);
    }catch{if(!current())return;}
   }
   if(!current())return;
   if(!controlChanged)for(const [i,v] of confirmed)guestCompleted.set(i,v);
   saveGuestCompleted(saved.savedAt);
  }catch{}
 }
 const completedRounds=()=>[...new Set([...(result?.records||[]).filter(r=>r.activity===cfg.week&&r.provider!=='anonymous').map(r=>r.round),...guestCompleted.keys()])];
 const access=i=>roundAccess(i,{owner:!!client.state().profile?.owner,completed:completedRounds()});
 function startWait(){
  clearTimeout(waitTimer);waitTimer=null;
  const state=client.state(),retry=state.startRetry;
  if(!retry||retry.activity!==cfg.week||retry.round!==round||mode==='review'){waitMessage='';$('start-wait')?.remove();return;}
  waitMessage=startWaitMessage(retry,now(),state.status==='sending');
  let box=$('start-wait');if(!box){box=node('p');box.id='start-wait';box.setAttribute('role','status');stage.append(box);}
  box.textContent=waitMessage;
  if(retry.retryAt>now())waitTimer=setTimeout(()=>{startWait();controls();},Math.min(1000,retry.retryAt-now()));
 }
 function changed(){validation?.update();controls();if(!restoringInput&&mode==='working'&&!client.state().pending&&client.state().status!=='sending'&&handle?.draft){try{if(client.saveInput?.(cfg.week,round,handle.draft())===false)$('draft-notice').textContent='本機暫存目前無法使用，請保持此頁開啟。';}catch{}}}
 function checkSchedule(){
  if(client.state().profile?.owner||!scheduleLocked())return false;
  lock.querySelector('h1').textContent=courseClosed()?'本學年未開設這門課':'這個活動還沒開放';
  scheduleBlocked=true;
  lock.hidden=teacherLogin;gate.hidden=!teacherLogin;main.hidden=true;send.disabled=true;mode='closed';
  return true;
 }
 // 從預設關卡開始；重整沿用本人最後一關，不先建立其他關卡的 Worker session。
 const firstRound=Math.max(0,cfg.rounds.findIndex(r=>r.managed!==false));
 const roundKey=()=>`ybs:fullrev:round:${client.project}:${cfg.course}:${cfg.week}:${client.state().profile?.uid}`;
 function restoreRound(){
  guestRestore=restoreGuestCompleted();
  const work=guestRestore;work.finally(()=>{if(guestRestore===work)guestRestore=null;});
  round=firstRound;
  const local=client.savedRound?.(cfg.week);if(Number.isInteger(local)&&cfg.rounds[local]?.managed!==false&&cfg.rounds[local]){round=local;return;}
  try{const saved=sessionStorage.getItem(roundKey());const n=Number(saved);if(saved!==null&&Number.isInteger(n)&&cfg.rounds[n]&&cfg.rounds[n].managed!==false)round=n;}catch{}
 }
 const catalog=()=>typeof ACTIVITIES==='undefined'?[]:ACTIVITIES.filter(a=>a.course===cfg.course)
  .map(a=>({...a,openedAt:typeof activityOpenAt==='function'?activityOpenAt(a):a.openedAt}));
 const explainProblem=e=>{const state=client.state();return explain(e,{...state,answerState:state.pending?undefined:handle?'page':undefined});};
 const pendingMessage=()=>{const state=client.state();return state.status==='sending'?'上傳中，請稍候，你的答案已保留。':state.uploadIssue?.startsWith('summary-')||state.uploadIssue==='storage-quota'?explainProblem({code:state.uploadIssue}):state.uploadIssue==='rate-limited'?'送出太密集，答案已保留；你可以稍候按「重試上傳」。':state.uploadIssue?'連線失敗，答案已保留；你可以稍候按「重試上傳」。':'上傳中，請稍候，你的答案已保留。';};
 // 頁首沿用待送摘要；按鈕旁另列連線、流量或額度的具體原因。
 const say=value=>{const label=client.state().pending?'上傳中，請稍候，答案已保留。':value||(guestCompletion(last)?GUEST_PENDING:'')||(last?.completed&&mode!=='passed'?'上傳中，正在確認雲端紀錄…':result&&!result.local?'✓ 紀錄已上傳給老師':'');status.textContent=label;status.hidden=!label;status.className='sync'+(label.startsWith('✓')?' ok':'');};
 const tool=(label,run)=>{const b=node('button',label);b.type='button';b.className='linkbtn';b.onclick=run;$('activity-tools').append(b);return b;};
 const restart=tool('重新開始',()=>start(round,true)),claims=tool('老師已核發，重新確認',async()=>{try{await client.refreshClaims();await start(round,true);}catch(e){problem(e);}}),practice=tool('本機練習／示範',()=>{
  revision++;handle?.dispose?.();handle=null;last=null;stage.replaceChildren();mode='practice';verdict.hidden=true;send.disabled=true;say('本機練習／教師示範，不送出成績。');
  controls();stage.append(node('h3','這一關的說明'));if(typeof cfg.demonstrate==='function')cfg.demonstrate(stage);else para(stage,'請依這一關的任務說明練習。');
 });
 const reread=tool('重新讀取',()=>!handle&&mode==='loading'?start(round):client.state().profile?.provider==='anonymous'?start(round,true):refresh());reread.hidden=true;
 const gateReread=node('button','重新讀取');gateReread.type='button';gateReread.className='btn';gateReread.id='g-reread';gateReread.hidden=true;gateReread.onclick=async()=>{gateReread.disabled=true;try{await client.refreshClaims();await refresh();}catch(e){confirmIdentity();problem(e);}finally{gateReread.disabled=false;}};identityBox.append(gateReread);
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
  const teacher=!!state.profile?.owner;send.hidden=teacher;$('send-control').hidden=teacher;$('send-hint').hidden=teacher;$('answer-status').hidden=teacher;$('streak').hidden=teacher;$('b-hint').hidden=teacher;
  const modeReason={loading:loadProblem||'題目載入中，請稍候。',review:'你正在回看這一關；想重做時，請按「再做一次」。',closed:'這個活動還沒開放。',practice:'目前是本機練習，不送出成績。',teacher:'目前是教師示範。',unmanaged:'這一關尚待老師確認，請選其他關卡。','binding-pending':'身分尚待老師確認，請告訴老師。','teacher-pending':'已送出，等待老師確認。','guest-pending':GUEST_PENDING,confirming:loadProblem||'正在確認雲端紀錄，請稍候。',correct:'這組已答對，請按「下一組」。',passed:'這關已過關，可選下一關。'};
  const reason=state.status==='restart-required'?loadProblem||explainProblem({code:'restart-required'})
   :state.status==='stale'?'請重新登入，再繼續作答。'
   :waitMessage?waitMessage
   :state.pending||state.status==='sending'?pendingMessage()
   :starting?'題目載入中，請稍候。'
   :mode!=='working'?modeReason[mode]||'請重新讀取題目。'
   :!handle?'題目尚未準備好，請重新讀取。'
   :handle.ready&&!handle.ready()?handle.readyReason?.()||'請先完成所有小題。'
   :!changed&&submitted?'先修改答案再送出':'';
  send.disabled=!!reason;send.setAttribute('aria-disabled',String(!!reason));send.title=reason;
  const hint=$('send-hint');if(hint.textContent!==reason)hint.textContent=reason;
  const control=$('send-control');control.tabIndex=reason?0:-1;control.setAttribute('aria-label',reason?'送出：'+reason:'送出');control.title=reason;
  $('quota-old').hidden=teacher||!(state.uploadIssue==='storage-quota'||loadProblem.includes('額度'));
  $('answer-status').textContent=mode==='review'?'回看紀錄':mode==='guest-pending'?GUEST_PENDING:mode==='passed'?'過關':mode==='correct'?'已送出：答對':submitted&&!changed?'已送出：還不對':'作答中';
  restart.hidden=state.status!=='restart-required';claims.hidden=state.profile?.provider==='anonymous'||mode!=='binding-pending';
  practice.hidden=!state.profile?.owner&&state.profile?.provider!=='anonymous'&&mode!=='binding-pending';
  $('b-retry').hidden=!state.pending;
  $('b-retry').disabled=!!state.startRetry&&state.startRetry.retryAt>now();
  const profile=state.profile;
  $('account-name').textContent=$('who').textContent||'尚未登入';
  $('account-avatar').textContent=teacher?'師':profile?.provider==='anonymous'?'訪':'生';
  $('account-info').textContent=teacher?'教師示範：不送出成績':profile?.provider==='anonymous'?'班座訪客：作答需老師審核':profile?'已登入':'請先登入或填班級座號。';
  $('b-swap').hidden=$('b-logout').hidden=!profile;$('account-growth').hidden=!profile||teacher;
  $('activity-tools').hidden=[restart,claims,practice,reread].every(b=>b.hidden);
 }
 // 原生 disabled 不會收到 click；外層承接滑鼠／觸控及鍵盤提示。
 const sendControl=$('send-control');
 // 停用時保留輸入焦點，避免按下到放開之間因失焦驗證移除錯誤文字，讓按鈕位移而漏接 click。
 // click／鍵盤處理仍讀取現值並完整驗證；可送出時沿用原生按鈕的焦點行為。
 sendControl.onpointerdown=event=>{if(send.disabled)event.preventDefault();};
 const explainDisabled=()=>{controls();if(!send.disabled){send.click();return;}
  if(mode==='working'&&!starting&&!client.state().pending&&client.state().status!=='restart-required')validation?.show();
  const message=$('send-hint').textContent;$('send-hint').replaceChildren(node('span','還不能送出：'+message));};
 sendControl.onclick=event=>{if(event.target!==send)explainDisabled();};
 sendControl.onkeydown=event=>{if(event.target===sendControl&&['Enter',' '].includes(event.key)){event.preventDefault();explainDisabled();}};
 // 補接選單 change、輸入法組字結束與失焦；重算時讀取現值，不靠事件累計。
 for(const event of ['input','change','compositionend','focusout'])stage.addEventListener(event,changed);
 function rounds(){
  nav.style.cssText=`--round-count:${cfg.rounds.length}`;nav.dataset.count=cfg.rounds.length;
  $('activity-subtitle').textContent=`第 ${round+1} 關　${info().name}`;
  $('round-unlock-hint').hidden=!cfg.rounds.some((_,i)=>access(i).locked);
  nav.replaceChildren();cfg.rounds.forEach((r,i)=>{
   const pending=guestCompleted.has(i)||result?.pendingRecords?.some(r=>r.activity===cfg.week&&r.round===i),passed=completedRounds().includes(i),{locked,reason}=access(i);
   const label=`第 ${i+1} 關：${r.name}`+(locked?'（尚未解鎖）':pending?'（待老師確認）':passed?'（已過關）':'');
   const b=node('button',`第 ${i+1} 關`);b.type='button';b.className=passed?'passed':'';b.dataset.i=i;b.disabled=locked;b.title=label+(reason?'；'+reason:'');b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(i===round));b.onclick=()=>start(i);
   {const depth=node('span');depth.className='round-depth';depth.setAttribute('aria-hidden','true');b.append(depth);}
   b.onpointerdown=e=>{if(b.disabled||e.button!==0)return;b.classList.add('is-pressing');b.setPointerCapture?.(e.pointerId);};
   const release=()=>b.classList.remove('is-pressing');b.onpointerup=b.onpointercancel=b.onpointerleave=b.onlostpointercapture=release;
   nav.append(b);
  });
 }
 function redo(host){const b=node('button','再做一次');b.id='b-redo';b.type='button';b.className='btn';b.onclick=()=>start(round,true);host.append(b);}
 function review(){
  mode='review';starting=false;client.cancelStart?.();count(2);stage.append(node('h3',guestCompleted.has(round)?'你已完成這一關的兩組挑戰': '你已過關，可以回看這一關'));
  para(stage,info().learn||'你已完成兩組不同資料的挑戰。');
  para(stage,guestCompleted.has(round)?GUEST_PENDING:'你正在回看過關摘要，這次不計作答次數。');
  const btns=node('div');btns.className='btns';redo(btns);
  if(round+1<cfg.rounds.length&&!access(round+1).locked){const b=node('button','下一關');b.type='button';b.className='btn primary';b.onclick=()=>start(round+1);btns.append(b);}
  stage.append(btns);hints();say(guestCompleted.has(round)?GUEST_PENDING:'你已完成這一關。');controls();
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
   if(!last?.hintExample){para(box,['本關不提供示範']);return;}
   const b=node('button','看另一題示範');b.id='b-hint-example';b.type='button';b.className='btn';
   b.onclick=()=>{const demo=node('section');box.append(demo);b.hidden=true;$('original-work').hidden=true;
    hintDemo=mountHintExample({host:demo,example:last?.hintExample,renderQuestion:cfg.renderQuestion,onClose:()=>{hints();$('b-hint-example')?.focus();}});};box.append(b);
  }
 }
 $('b-hint').onclick=()=>{if(submitted){hint=Math.min(3,hint+1);hints();}};
 function instructions(){
  const d=last?.question?.data;
  const now=info().now||last?.question?.instruction||info().name;
  const goal=info().goal||(typeof d?.task==='string'?d.task:'完成兩組不同資料。');
  $('says').replaceChildren();['現在','要做到'].forEach((label,k)=>{const span=node('span');span.className='tk';span.append(node('b',label),node('span',[now,goal][k]));$('says').append(span);});
 }
 function layoutOutcome(d){
  if(d?.mode==='form-volunteer-sheet-v2')return;
  if(!d?.questions||!d.kinds)return;
  stage.classList.add('quest-outcome');
  const intro=stage.querySelector('.panel'),work=node('div');work.className='quest-work panel';
  if(intro){
   const heading=intro.querySelector('h3');if(heading)heading.hidden=true;
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
  stage.classList.remove('quest-outcome');stage.classList.toggle('quest-sheet',value.question.data?.mode==='form-volunteer-sheet-v2');stage.dataset.round=round;
  const carry=handle?.carry?.();handle?.dispose?.();stage.replaceChildren();handle=null;
  if(typeof cfg.renderQuestion!=='function')throw Error('renderer-pending');
  validation=null;$('draft-notice').textContent='';
  handle=cfg.renderQuestion(value.question,stage,{changed,carry:value.photoAnswer||value.performanceOrder||carry,demonstration:false,shell:true});layoutOutcome(value.question.data);validation=answerValidation(handle,stage);mode='working';loadProblem='';sentValue='';submitted=false;verdict.hidden=true;count(value.question.slot);instructions();hints();controls();
  const draft=client.loadInput?.(cfg.week,round);
  if(draft!==undefined&&handle.restoreDraft){restoringInput=true;try{if(handle.restoreDraft(draft))$('draft-notice').textContent='已恢復上次未送出的作答';}finally{restoringInput=false;}controls();}
 }
 function problem(e){
  if(e.code==='identity-changed'||!client.state().profile)return;
  loadProblem=explainProblem(e);
  if(!handle&&mode==='loading')reread.hidden=false;
  if(e.code==='not-open'){lock.hidden=false;main.hidden=true;gate.hidden=true;mode='closed';}
  else{if(e.code==='binding-pending')mode='binding-pending';say(e.code==='pending'?pendingMessage():loadProblem);if(['retry-later','read-model-pending'].includes(e.code))reread.hidden=false;}
  controls();
 }
 async function receive(value){
  if(checkSchedule())return;
  if(mode==='review')return;
  if(value.activity!==undefined&&(value.activity!==cfg.week||value.round!==round))return;
  const k=JSON.stringify([value.sid,value.nextSeq,value.completed,value.correct]);if(k===key)return;key=k;
  const old=last;last=value;starting=false;loadProblem='';lastLearning=old?.question?.data?.learning||lastLearning;
  if(value.photo&&!handle)showQuestion({...value.photo,photoAnswer:value.photoAnswer});
  if(value.performance){if(!handle&&value.performance.question)showQuestion({question:value.performance.question});handle?.feedback?.(value.performance);}
  if(value.awaitingTeacher){mode='teacher-pending';say('等待老師確認');controls();return;}
  if(showGuestPending({value,host:verdict,next:round+1<cfg.rounds.length?()=>start(round+1):null})){guestCompleted.set(round,value);saveGuestCompleted();mode='guest-pending';rounds();count(2);redo(verdict);say(GUEST_PENDING);controls();await refresh();return;}
  if(value.completed){mode='confirming';send.disabled=true;say('上傳中，正在確認雲端紀錄…');await refresh(client.state().snapshot,{force:true});return;}
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
  if(client.state().pending||!last?.completed||!result?.records.some(r=>r.activity===cfg.week&&r.round===round&&r.provider!=='anonymous'))return;
  mode='passed';count(2);verdict.className='verdict ok';verdict.replaceChildren(node('h3','過關！'));para(verdict,info().learn||lastLearning||'你已完成這一關的兩組挑戰。');
  const item=result.activities.find(a=>a.activity===cfg.week),detail=item.rounds[round],old=before?.activities.find(a=>a.activity===cfg.week);
  if(old?.rounds[round]?.passed)para(verdict,'這關已領過 XP。');else{
   const bits=['+'+detail.passXP+' 過關'];if(detail.onTimeXP)bits.push('+'+detail.onTimeXP+' 準時');if(item.completeXP>(old?.completeXP||0))bits.push('+'+item.completeXP+' 全過');para(verdict,'本關 XP：'+bits.join('、')).className='xp-detail';
   if(before&&result.level>before.level){const card=node('div');card.className='xp-title-card';card.append(node('strong','升級！Lv '+result.level));para(card,result.title);verdict.append(card);}
  }
  const btns=node('div');btns.className='btns';if(round+1<cfg.rounds.length){const b=node('button','下一關');b.type='button';b.className='btn primary';b.onclick=()=>start(round+1);btns.append(b);}else para(btns,item.passed===cfg.rounds.length?'全部過關！':`這一關完成了！這個活動目前完成 ${item.passed}／${cfg.rounds.length} 關。`);redo(btns);verdict.append(btns);verdict.hidden=false;hint=0;submitted=false;hints();say('✓ 紀錄已上傳給老師');controls();
 }
 async function refresh(fresh=null,{force=false}={}){
  if(checkSchedule())return;
  if(!client.state().profile||client.state().profile.owner)return;
  if(client.state().profile.provider==='anonymous'){
   const uid=client.state().profile.uid,shownIdentity=identity;
   try{const xp=await xpCore();if(shownIdentity!==identity||client.state().profile?.uid!==uid||client.state().profile.provider!=='anonymous')return;
    result=client.guestGrowth({activities:catalog(),xp});renderXP();rounds();
   }catch(e){problem(e);}return;
  }
  if(reading&&!fresh&&!force)return refreshWork;
  const work=renderProgress(fresh);refreshWork=work;try{return await work;}finally{if(refreshWork===work)refreshWork=null;}
 }
 function renderXP(){
  $('xp-header').hidden=result.totalXP===null;$('xp-level').textContent='Lv '+result.level+' ';const xpTitle=node('span',result.title);xpTitle.className='xp-wide';$('xp-level').append(xpTitle);$('xp-total').textContent=result.totalXP+' XP';$('xp-progress').hidden=false;$('xp-progress').value=result.progress;$('xp-next').textContent=result.next===null?'已達最高等級':'下一級還差 '+result.remaining+' XP';
 }
 async function renderProgress(fresh){
  reading=true;const n=++read,g=revision;
  try{
   fresh||=await client.progress({activities:catalog()});const xp=await xpCore();if(n!==read||g!==revision)return;
   const cacheKey=JSON.stringify([client.state().profile.uid,fresh.subject,fresh.controlVersions]);
   const currentPerson=await readPerson(fresh).catch(()=>null);if(n!==read||g!==revision)return;
   snapshot=fresh;person=currentPerson;personKey=cacheKey;
   const value=growth(snapshot,{project:client.project,course:cfg.course,subject:snapshot.subject,provider:snapshot.provider,activities:catalog()},xp);
   result=value.state==='confirmed'?value:value.reason==='guest-xp-policy-pending'?value:null;reread.hidden=!!result;
   confirmIdentity();if(!result){$('xp-header').hidden=true;rounds();say(explain(value));return;}loadProblem='';
   focusRefresh?.touch();
   renderXP();
   rounds();if(last?.completed)passed();else if(result.reason==='guest-xp-policy-pending')say('訪客紀錄待老師確認；其餘進度已顯示。');else say('');
  }catch(e){if(n===read&&g===revision){result=null;snapshot=null;$('xp-header').hidden=true;rounds();reread.hidden=false;confirmIdentity();problem(e);}}
  finally{if(n===read){controls();reading=false;}}
 }
 async function start(i=round,reopen=false){
  if(guestRestore){const restoredAt=revision;await guestRestore;if(restoredAt!==revision)return;}
  if(!client.state().profile)return;
  if(checkSchedule())return;
  if(!cfg.rounds[i])return;
  if(access(i).locked){
   // 重整可能留下尚未解鎖的舊選擇；先回到可做的第一關。
   if(i===round&&!handle&&!last)i=firstRound;else return;
   if(access(i).locked)return;
  }
  lock.hidden=true;teacherLogin=false;scheduleBlocked=false;
  // 待送時保留目前題面；重整後尚無題面，須讓 client.start 續傳同關草稿。
  if(i===round&&(starting||client.state().pending&&(handle||reopen)))return;
  // 已完成關卡只回看；明確重做才要求新作答，未完成的本人草稿仍由 client 續作。
  round=i;
  try{sessionStorage.setItem(roundKey(),String(i));}catch{}
  const g=++revision;read++;reading=false;clearTimeout(waitTimer);waitTimer=null;waitMessage='';handle?.dispose?.();handle=null;validation=null;$('draft-notice').textContent='';last=null;key='';mode='loading';loadProblem='';lastLearning='';clearTimeout(pairTimer);pairTimer=null;hint=0;submitted=false;starting=true;before=result;delete stage.dataset.questionType;delete stage.dataset.slot;delete stage.dataset.round;stage.replaceChildren();verdict.replaceChildren();verdict.hidden=true;instructions();rounds();count(0);hints();controls();
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
  if(!reopen&&completedRounds().includes(i)&&!(client.state().pending&&client.savedRound?.(cfg.week)===i)){review();return;}
  if(info().managed===false){starting=false;mode='unmanaged';say('這一關尚待老師確認，請選其他關卡。');controls();return;}
  say('載入中…');
  // 快速連點以最後選擇為準；前一個 start 回應後才送下一關，略過已被取代的選擇。
  const work=roundWork.then(()=>g===revision?client.start(cfg.week,i,{restart:reopen}):null);
  roundWork=work.catch(()=>{});
  try{const value=await work;if(value&&g===revision)await receive(value);}
  catch(e){if(g===revision){startWait();problem(e);}}finally{if(g===revision){starting=false;controls();}}
 }
 send.onclick=async()=>{
  controls();if(send.disabled||!handle){explainDisabled();return;}if(validation?.show())return;sentValue=JSON.stringify(handle.get());submitted=true;const g=revision;send.disabled=true;controls();
  try{const value=await client.answer(cfg.week,round,handle.get());if(g===revision)await receive(value);}
  catch(e){if(g===revision){if(!client.state().pending&&!['invalid-answer','answer-too-large'].includes(e.code))submitted=false;problem(e);}}finally{if(g===revision)controls();}
 };
 $('b-retry').onclick=async()=>{try{const values=await client.retry();if(values.length)await receive(values.at(-1));else if(client.state().pending){say(pendingMessage());controls();}}catch(e){problem(e);}};
 $('b-swap').onclick=$('b-logout').onclick=()=>{closeAccount();return client.logout().catch(problem);};
 identityBox.querySelector('#g-notme').onclick=$('b-swap').onclick;
 identityBox.querySelector('#g-isme').onclick=()=>{gate.hidden=true;main.hidden=false;return start(round);};
 lock.querySelector('button').onclick=()=>{teacherLogin=true;lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;login.querySelector('[data-teacher-login]')?.focus();};
 let focusRefresh;
 function clear(){clearTimeout(waitTimer);waitTimer=null;waitMessage='';guestCompleted.clear();focusRefresh?.reset();refreshWork=null;hintDemo?.dispose();hintDemo=null;hint=0;submitted=false;$('hint-content').replaceChildren();$('original-work').hidden=false;clientWarmupReset();clearTimeout(pairTimer);pairTimer=null;handle?.dispose?.();validation=null;$('draft-notice').textContent='';revision++;read++;reading=false;starting=false;roundWork=Promise.resolve();handle=null;last=null;key='';mode='loading';result=null;snapshot=null;person=null;personKey='';$('who').textContent='';identityBox.querySelector('#g-whotext').textContent='';identityBox.querySelector('#g-isme').hidden=true;before=null;stage.replaceChildren();verdict.hidden=true;$('xp-header').hidden=true;lock.hidden=true;main.hidden=true;gate.hidden=false;login.hidden=false;identityBox.hidden=true;say('');closeAccount();controls();}
 focusRefresh=createFocusRefresh(()=>{if(checkSchedule())return;if(scheduleBlocked){scheduleBlocked=false;identity='';lock.hidden=true;gate.hidden=false;return client.restore().catch(problem);}if(client.state().profile){if(client.state().profile.owner){if(!starting)return start(round,true);return;}if(mode==='closed'){lock.hidden=true;main.hidden=false;return start(round,true).then(()=>refresh());}else if(!starting)return refresh();}else{lock.hidden=true;gate.hidden=false;}},{now});
 client.subscribe(state=>{
  if(!state.profile){try{if(guestStorageKey)sessionStorage.removeItem(guestStorageKey);}catch{}guestStorageKey='';identity='';clear();checkSchedule();return;}
  // 離頁通知先清畫面，不能讓舊外框先還原身分而啟動 context／start。
  if(state.status==='stale'){clear();identity='';return;}
  if(checkSchedule())return;
  if(state.status==='restart-required'&&state.ticketTiming?.state==='expired'&&!state.view){
   // 期限已由 client 清空題面；同步卸載輸入及回呼，避免舊操作留在活動畫面。
   revision++;starting=false;clearTimeout(pairTimer);pairTimer=null;handle?.dispose?.();handle=null;validation=null;
   hintDemo?.dispose();hintDemo=null;hint=0;submitted=false;sentValue='';last=null;key='';lastLearning='';mode='loading';
   stage.replaceChildren();verdict.replaceChildren();verdict.hidden=true;$('draft-notice').textContent='';
   loadProblem=explainProblem({code:'ticket-expired'});instructions();hints();count(0);say(loadProblem);
  }
  if(['binding-changed','context-changed'].includes(state.status)){try{if(guestStorageKey)sessionStorage.removeItem(guestStorageKey);}catch{}clear();identity='';}
  const id=state.profile.uid+':'+state.profile.owner;
  if(id!==identity){identity=id;restoreRound();
   $('who').textContent=state.profile.owner?'教師模式':state.profile.guest?state.profile.guest.cls+' 班 '+state.profile.guest.seat+' 號（待審）':'已登入';
   if(state.profile.owner||state.profile.provider==='anonymous'){gate.hidden=true;main.hidden=false;start(round);if(state.profile.provider==='anonymous')refresh();}
   else{
    gate.hidden=false;main.hidden=true;login.hidden=true;identityBox.hidden=false;
    const message=identityBox.querySelector('#g-whotext'),confirm=identityBox.querySelector('#g-isme');confirm.hidden=true;message.textContent='正在確認你的身分…';
    refresh();
   }
  }
  if(state.readingRetry){identityBox.querySelector('#g-whotext').textContent='載入中，請稍候…';say('載入中，請稍候…（'+Math.max(1,Math.ceil((state.readingRetry.retryAt-Date.now())/1000))+' 秒後自動重試）');}
  else{if(result&&!result.local)confirmIdentity();if(state.pending)say('上傳中，請稍候，答案已保留。');}
  if(['ready','confirmation-pending','teacher-pending','guest-pending'].includes(state.status)&&state.view?.activity===cfg.week&&state.view.round===round)receive(state.view).catch(problem);
  startWait();
  controls();
 });
 rounds();controls();
 await mountLogin({client,host:login,oldlook:true});
 try{await client.restore();}catch(e){para(login,explain(e));}
 const focus=()=>focusRefresh().catch(problem);
 window.addEventListener('pageshow',event=>{if(event.persisted)client.restore().catch(problem);});
 window.addEventListener('focus',focus);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')focus();});window.addEventListener('pagehide',()=>{identity='';clear();});
}
