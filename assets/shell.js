// 活動頁共用外框（第 2 單元起）。各週頁面只要寫關卡，填班級座號、分頁、教師模式、上傳都在這裡。
// 用法：SHELL({week, termWeek, title, course, unit, rounds:[…]})
// 每一關：{ name, lv:1|2, now, goal, tip（字串或 inst=>字串）, steps(inst)（選填拆步驟）, learn（過關說明）,
//   gen(rnd) → inst（一組題目資料，rnd() 回傳 0～1）,
//   questionKey(inst)（可省略）→ 用於判斷同題的資料；預設比對完整 inst，
//   view(inst, el, api) → { get()（學生目前的答案）, fill()（教師：填好答案）, ready()（可以送出了嗎，可省略） },
//   check(inst, ans) → true 或 一句「哪裡不對」的純文字提示（不解析 HTML）,
//   peek(inst, ans)（可省略）→ 第 3 部分「電腦裡發生的」HTML }
// 相容既有演出型活動：round.confirmations=1 表示 check 已自行檢查兩組資料；
// round.manualAttempt=true 時，由 view 的 api.attempt() 在演出開始時記次。
// cfg.progressLength（預設 6）、rememberIdentity（預設 false）保留舊頁儲存形狀。
// 過關規則：累積答對兩組不同的資料。答錯不歸零；未過關時送出後換新題。
// 活動頁與教師頁共用計分；不寫入既有過關紀錄或雲端欄位。
const activityScore = (passed, total) => passed <= 0 || total <= 0 ? 0
  : Math.max(0, 100 - 10 * Math.max(0, total - passed));
const shellTitle = cfg => {
  const activity = typeof ACTIVITIES !== 'undefined' ? ACTIVITIES.find(a => a.course === cfg.course && a.week === cfg.week) : null;
  const week = cfg.termWeek ?? (activity && typeof termWeekOf === 'function' ? termWeekOf(activity) : null);
  return week ? `第 ${week} 週｜${cfg.title}` : cfg.title;
};
// 從 shell 同目錄載入核心，沿用靜態頁 CSP；HTML 只需更新 shell 快取版本。
const shellXPReady = (() => {
  if (typeof YBSXP !== 'undefined') return Promise.resolve();
  const src = typeof document !== 'undefined' && document.currentScript?.src;
  if (!src) return Promise.resolve();
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = new URL('xp.js?v=20261109f', src).href;
    script.onload = script.onerror = resolve;
    document.head.appendChild(script);
  });
})();
const SHELL = (cfg) => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const loginEnabled = () => typeof YBS !== 'undefined' && YBS.enabled();
  // 每次呼叫各自保存狀態，供同檔案的內部功能共用。
  const s = { cfg, $, esc, loginEnabled, R: cfg.rounds, level: 1, ri: 0,
    inst: null, handle: null, streak: 0, teacher: false, done: new Set(), previousKey: null, ident: null };
  shellCreateInterface(s);
  if (typeof document.createElement === 'function') import('/assets/warmup.js?v=20261105w1').then(m => m.mountWarmup({cfg, main: $('main')})).catch(() => {});
  s.prog = { mask: 0, tries: Array(cfg.progressLength ?? 6).fill(0), time: Date.now() };
  Object.assign(s, shellCreateHints(s));
  Object.assign(s, shellCreateRoundFlow(s), shellCreateJudging(s), shellCreateProgress(s));
  s.xp = shellCreateXP(s);
  shellBindIdentityForm(s);
  Object.assign(s, shellCreateIdentity(s), shellCreateTeacher(s), shellCreateLogin(s), shellCreateSync(s));
  if (TEACHER.remembered()) s.enterTeacher(); else if (loginEnabled()) s.showLogin(); else { $('g-login').hidden = true; $('g-form').hidden = false; $('in-cls').focus(); }
  // 測試用：讓自動檢查可以拿到目前這一組資料與答案
  return { get inst() { return s.inst }, get handle() { return s.handle }, load: s.load, setLevel: s.setLevel, get ri() { return s.ri }, rounds: s.R };
};

// 建立登入與班座入口的原有介面。
const shellGateHTML = (cfg, esc) => {
  return `
<section class="gate" id="gate">
  <h1>${esc(shellTitle(cfg))}</h1>
  <div id="g-login" style="display:flex;flex-direction:column;gap:12px;align-items:center">
    <div id="g-gbtn" style="min-height:44px;display:flex;justify-content:center"></div>
    <div class="gerr" id="g-lerr" role="alert"></div>
    <button class="linkbtn" id="g-manual" type="button">登入不了？改填班級座號</button>
  </div>
  <div id="g-who" hidden style="display:flex;flex-direction:column;gap:12px;align-items:center">
    <p id="g-whotext" style="color:var(--ink);font-size:20px"></p>
    <div class="btns" style="justify-content:center" id="g-whobtns"><button class="btn" id="g-notme" type="button">不是我</button><button class="btn primary" id="g-isme" type="button">對，開始</button></div>
  </div>
  <div id="g-form" hidden style="display:flex;flex-direction:column;gap:14px">
    <p id="g-me" class="g-me" hidden></p>
    <p>開始前先填班級和座號，只能填數字。</p>
    <div class="field"><label for="in-cls">班級</label><input id="in-cls" inputmode="numeric" autocomplete="off" maxlength="3" placeholder="例如 901"><span class="hint">三位數字，例如 901</span></div>
    <div class="field"><label for="in-seat">座號</label><input id="in-seat" inputmode="numeric" autocomplete="off" maxlength="2" placeholder="例如 12"><span class="hint">1～60</span></div>
    <div class="gerr" id="gerr" role="alert"></div>
    <div class="btns" id="g-step1"><button class="btn primary" id="g-next" style="width:100%">下一步</button></div>
    <div id="g-step2" hidden style="display:flex;flex-direction:column;gap:10px">
      <p style="color:var(--ink);font-size:20px" id="g-confirm"></p>
      <div class="btns" style="justify-content:center"><button class="btn" id="g-back">我填錯了</button><button class="btn primary" id="g-go">對，開始</button></div>
    </div>
  </div>
  <div class="tlogin">
    <button class="linkbtn" id="t-open" type="button">教師登入</button>
    <div id="t-box" hidden class="field">
      <label for="in-tcode">教師通行碼</label>
      <input id="in-tcode" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40">
      <button class="linkbtn" id="t-show" type="button" style="align-self:flex-start">顯示通行碼</button>
      <div class="btns"><button class="btn primary" id="t-go" type="button" style="width:100%">進入教師模式</button></div>
      <span class="gerr" id="terr" role="alert"></span>
    </div>
  </div>
</section>
`;
};

// 建立活動、教師工具與進度的介面。
const shellMainHTML = (cfg, esc) => {
  return `<div class="wrap" id="main" hidden>
  <header class="top">
    <div class="activity-heading">
      <div class="title-rounds"><h1>${esc(shellTitle(cfg))}</h1><nav class="rounds" id="rounds" aria-label="關卡"></nav></div>
      <div class="who-bar"><a href="../../" class="linkbtn">← YBS Lab</a><span><b id="who"></b></span><button class="linkbtn" id="b-swap" type="button">不是我？換人</button><span class="upload-status" aria-live="polite"><span class="sync" id="sync" hidden></span><button class="sync warn" id="b-retry" type="button" hidden>重試上傳</button></span></div>
    </div>
    <aside class="xp-header" id="xp-header" hidden aria-live="polite">
      <a href="../me/" id="xp-link" title="查看我的成長紀錄">
        <b id="xp-level"></b><span class="xp-mono" id="xp-total"></span>
        <progress id="xp-progress" max="1" value="0" aria-label="升級進度"></progress>
        <span class="small" id="xp-next"></span>
      </a>
      <p class="small xp-login-hint" id="xp-login-hint" hidden>用帳號登入就能累積等級</p>
    </aside>
  </header>
  <section class="sec" id="task-instructions">
    <h2 class="sec-h"><span class="num">1</span>任務說明</h2>
    <div class="order" id="says" aria-live="polite"></div>
  </section>
  <section class="sec">
    <div id="original-work"><div class="work-heading"><h2 class="sec-h"><span class="num">2</span>動手做</h2><button class="btn" id="b-hint" type="button" title="先試著送出一次，就能看提示。" disabled>我需要提示</button></div>
    <div id="stage"></div>
    <div class="btns"><button class="btn primary" id="b-send" type="button">送出</button><span class="streak" id="streak"></span><span class="small" id="send-hint"></span></div>
    <section class="verdict" id="verdict" hidden aria-live="polite"></section></div>
    <aside class="hint-ladder" id="hint-ladder" aria-label="提示階梯">
      <div id="hint-content" aria-live="polite" aria-atomic="true"></div>
      <button class="btn" id="b-demo" type="button" hidden>看一題示範</button>
      <section id="hint-demo" hidden aria-label="另一題示範">
        <div id="demo-content" aria-live="polite"></div>
        <button class="btn" id="b-demo-back" type="button">回原題自己做</button>
      </section>
    </aside>
  </section>
  <section class="sec" id="sec3" hidden>
    <h2 class="sec-h"><span class="num">3</span>電腦裡發生的</h2>
    <div id="peek"></div>
  </section>
  <div class="tbar" id="tbar" hidden role="toolbar" aria-label="教師工具">
    <span class="tlabel">教師模式</span>
    <button class="btn" id="tb-ans" type="button">顯示答案</button>
    <button class="btn" id="tb-new" type="button">換一組資料</button>
    <span class="thint">教師模式僅供示範；「顯示答案」直接填好這一組的答案，按「送出」可以示範過關畫面。</span>
  </div>
  <p class="foot">© 2026 YBS Lab　<a href="../../about/#h-rights" style="color:inherit">保留所有權利，未經同意請勿轉載或改作</a></p>
</div>`;
};

// 插入共用介面。
const shellCreateInterface = (s) => {
  const { cfg, esc } = s;
  document.body.insertAdjacentHTML('afterbegin', shellGateHTML(cfg, esc) + shellMainHTML(cfg, esc));
};

// 提示只存在本次操作的記憶體，不加入進度、成績或上傳欄位。
const shellHintNext = (level, round) => level >= 3 ? 3 : level === 1 && !round.steps ? 3 : level + 1;
const shellContentKey = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const shellCreateHints = s => {
  const { $, esc, R } = s;
  let level = 0, submitted = false, demonstrating = false;
  const txt = (v, i) => typeof v === 'function' ? v(i) : (v || '');
  function closeDemo(focus = false) {
    demonstrating = false;
    $('hint-demo').hidden = true; $('demo-content').innerHTML = '';
    $('original-work').hidden = false;
    if (focus) { s.changed(); renderHints(); $('b-demo').focus(); }
  }
  function renderHints() {
    const r = R[s.ri];
    $('hint-ladder').hidden = s.teacher;
    $('b-hint').disabled = !submitted || level >= 3 || demonstrating;
    $('b-hint').hidden = s.teacher;
    $('b-hint').title = !submitted ? '先試著送出一次，就能看提示。' : level >= 3 ? '已解鎖全部提示。看提示不影響分數與經驗值。' : '看提示不影響分數與經驗值。';
    $('hint-content').innerHTML = (level >= 1 ? '<h3>第 1 層：方向</h3><div>' + txt(r.tip, s.inst) + '</div>' : '') +
      (level >= 2 && r.steps ? '<h3>第 2 層：拆步驟</h3><div>' + txt(r.steps, s.inst) + '</div>' : '') +
      (level >= 3 ? '<h3>第 3 層：看一題示範</h3><p>用另一組資料練習，再回原題自己做。</p>' : '');
    $('b-demo').hidden = level < 3 || demonstrating;
  }
  function resetHints() { closeDemo(); level = 0; submitted = false; renderHints(); }
  function hintSubmitted(wrong) {
    if (s.teacher) return;
    submitted = true;
    if (wrong) level = shellHintNext(level, R[s.ri]);
    renderHints();
  }
  $('b-hint').onclick = () => {
    if (!submitted || demonstrating || s.teacher) return;
    level = shellHintNext(level, R[s.ri]); renderHints();
  };
  $('b-demo').onclick = () => {
    if (level < 3 || demonstrating || s.teacher) return;
    const r = R[s.ri], box = document.createElement('div');
    $('demo-content').innerHTML = '';
    // 演出型活動的 fill 只排卡片，尚未完成演出，改用 learn 說明。
    let example = null;
    if (typeof s.handle.fill === 'function' && !r.manualAttempt) {
      const key = i => shellContentKey(r.questionKey ? r.questionKey(i) : i);
      const originalKey = key(s.inst);
      for (let draw = 0; draw < 20; draw++) {
        const candidate = r.gen(Math.random);
        if (key(candidate) !== originalKey) { example = candidate; break; }
      }
    }
    if (example) {
      try {
        const field = document.createElement('fieldset');
        field.innerHTML = '<legend>另一題示範（已填好）</legend><div class="demo-question">' +
          (r.instruction ? txt(r.instruction, example) : txt(r.now, example) + '<br>' + txt(r.goal, example)) + '</div><div class="demo-stage"></div>';
        const handle = r.view(example, field.querySelector('.demo-stage'), {changed() {}, attempt() {}, esc});
        handle.fill();
        if (r.check(example, handle.get()) !== true) throw new Error('此關無法自動完成');
        field.disabled = true; box.appendChild(field);
        box.insertAdjacentHTML('beforeend', '<div class="demo-why"><h3>為什麼這樣做</h3>' +
          (r.steps ? txt(r.steps, example) : '') + '<p>' + esc(r.learn || '依照本關規則完成上面的操作。') + '</p>' +
          (r.peek ? r.peek(example, handle.get()) : '') + '</div>');
      } catch (e) { example = null; box.innerHTML = ''; }
    }
    if (!example) box.innerHTML = '<h3>這一關的說明</h3>' + (r.learn ? '<p>' + esc(r.learn) + '</p>' : '<p>' + txt(r.now, s.inst) + '</p><p>' + txt(r.goal, s.inst) + '</p><p>' + txt(r.tip, s.inst) + '</p>');
    // view/fill/get 完成後才改 ID，避免破壞活動內的選取器；掛入頁面前與原題隔離。
    const demoIds = new Map();
    box.querySelectorAll('[id]').forEach((el, index) => {
      const id = 'hint-example-' + index;
      demoIds.set(el.id, id); el.id = id;
    });
    for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
      box.querySelectorAll('[' + attr + ']').forEach(el => {
        el.setAttribute(attr, el.getAttribute(attr).split(/\s+/).map(id => demoIds.get(id) || id).join(' '));
      });
    }
    $('demo-content').appendChild(box);
    demonstrating = true; $('original-work').hidden = true; $('sec3').hidden = true;
    $('hint-demo').hidden = false; renderHints(); $('b-demo-back').focus();
  };
  $('b-demo-back').onclick = () => closeDemo(true);
  return { renderHints, resetHints, hintSubmitted, closeDemo, isHintDemo: () => demonstrating };
};

// 任務說明自動比對數字；活動可用 data-changed="穩定名稱" 標記額外題目區域。
// 只包住改變的文字數字，不改屬性、輸入值或事件；首次出題與跨關不標示。
const shellQuestionRegions = $ => [$('says'), ...$('stage').querySelectorAll('[data-changed]')];
const shellNumberPattern = /[-−]?\d+(?:[,，]\d{3})*(?:\.\d+)?/g;
const shellQuestionNumbers = $ => shellQuestionRegions($).map(el => (el.textContent || '').match(shellNumberPattern) || []);
const shellHighlightQuestion = ($, previous) => {
  if (!previous || typeof document.createTextNode !== 'function') return;
  shellQuestionRegions($).forEach((el, region) => {
    let index = 0;
    const visit = parent => [...parent.childNodes].forEach(node => {
      if (node.nodeType === 1) {
        if (!['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName)) visit(node);
      } else if (node.nodeType === 3) {
        const text = node.textContent;
        let start = 0;
        for (const match of text.matchAll(shellNumberPattern)) {
          const changed = previous[region]?.[index++] !== match[0];
          if (!changed) continue;
          parent.insertBefore(document.createTextNode(text.slice(start, match.index)), node);
          const mark = document.createElement('span');
          mark.className = 'question-changed'; mark.textContent = match[0];
          parent.insertBefore(mark, node); start = match.index + match[0].length;
        }
        if (start) node.textContent = text.slice(start);
      }
    });
    visit(el);
  });
};

// 成長紀錄只採用目前登入帳號的雲端 attempts，不另存本機 XP 資料。
const shellCreateXP = s => {
  const {cfg, $, esc} = s;
  let owner = null, cloud = [], ready = false, generation = 0, readGeneration = 0;
  const pending = new Map();
  const course = cfg.course || '115-g9';
  const catalog = () => typeof ACTIVITIES === 'undefined' ? [] : ACTIVITIES.filter(a => a.course === course).map(a => ({...a,
    openedAt:typeof activityOpenAt === 'function' ? activityOpenAt(a) : NaN,
    isOpen:typeof isActivityOpen === 'function' && isActivityOpen(a)}));
  const snapshot = records => typeof YBSXP !== 'undefined' ? YBSXP.calculate(catalog(), records) : null;
  function render() {
    const header = $('xp-header');
    if (!header || !s.ident || s.teacher) { if (header) header.hidden = true; return; }
    header.hidden = false;
    $('xp-link').hidden = !owner;
    $('xp-login-hint').hidden = !!owner;
    if (!owner) return;
    const result = ready && snapshot(cloud);
    $('xp-level').textContent = result ? 'Lv ' + result.level + ' ' + result.title : '成長紀錄';
    $('xp-total').textContent = result ? result.totalXP + ' XP' : '載入中…';
    $('xp-progress').hidden = !result;
    if (result) $('xp-progress').value = result.progress;
    $('xp-next').textContent = result ? (result.next === null ? '已達最高等級' : '下一級還差 ' + result.remaining + ' XP') : '等待雲端紀錄';
  }
  function renderPass() {
    const item = pending.get(s.ri), el = $('xp-pending');
    if (!item || !el || !ready || typeof YBSXP === 'undefined') return;
    if (!cloud.some(r => r.activity === cfg.week && r.round === s.ri)) return;
    if (!item.before) { el.textContent = '雲端紀錄已確認，XP 已更新。'; return; }
    const before = snapshot(item.before), after = snapshot(cloud);
    const detail = after.activities.find(a => a.activity === cfg.week), round = detail.rounds[s.ri];
    if (item.before.some(r => r.activity === cfg.week && r.round === s.ri)) { el.textContent = '這關已領過 XP。'; return; }
    const bits = ['+' + round.passXP + ' 過關'];
    if (round.onTimeXP) bits.push('+' + round.onTimeXP + ' 準時');
    if (detail.completeXP > (before.activities.find(a => a.activity === cfg.week)?.completeXP || 0)) bits.push('+' + detail.completeXP + ' 全過');
    const card = after.level > before.level
      ? '<div class="xp-title-card"><strong>升級！Lv ' + after.level + '</strong><p>' + esc(after.title) + '</p></div>' : '';
    el.innerHTML = '<p class="xp-detail">本關 XP：' + bits.join('、') + '</p>' + card;
  }
  function stop() {
    generation++; readGeneration++; owner = null; ready = false; cloud = []; pending.clear();
    if ($('xp-header')) $('xp-header').hidden = true;
  }
  async function refresh() {
    if (!owner || typeof YBS.firebaseSession !== 'function') return;
    const uid = owner, current = generation, request = ++readGeneration;
    try {
      const {db, auth} = await YBS.firebaseSession();
      if (current !== generation || auth.currentUser?.uid !== uid) return;
      // 僅查目前帳號自己的 attempts；不用教師路徑或 guestAttempts。
      const result = await db.collection('ybsCourses/' + course + '/attempts').where('uid', '==', uid).get();
      if (current !== generation || request !== readGeneration || !s.ident || s.teacher || YBS.profile()?.uid !== uid || auth.currentUser?.uid !== uid) return;
      // 預設 get 離線時可回傳空快取；僅伺服器確認後才更新 XP。
      if (result.metadata?.fromCache !== false) return;
      cloud = result.docs.map(d => ({...d.data(), course})).filter(r => r.uid === uid);
      s.restoreCloudProgress(cloud);
      ready = true; render(); renderPass();
    } catch { /* 讀取失敗保留已確認紀錄；首次讀取仍等待雲端，不顯示假 0。 */ }
  }
  function start() {
    stop();
    if (!s.ident || s.teacher) return;
    const current = generation;
    owner = s.loginEnabled() && typeof YBS.profile === 'function' ? YBS.profile()?.uid || null : null;
    // 清除舊版 XP 專用快取；it9 進度與登入待送佇列保持原樣。
    try {
      localStorage.removeItem('ybs:xp:' + course + ':seat:' + s.ident.cls + '-' + s.ident.seat);
      if (owner) localStorage.removeItem('ybs:xp:' + course + ':uid:' + owner);
    } catch { /* 儲存空間不可用不影響作答。 */ }
    render();
    shellXPReady.then(() => { if (current === generation) { render(); renderPass(); } });
    refresh();
  }
  function pass() {
    if (!owner || !s.ident || s.teacher || s.done.has(s.ri)) return '';
    if (!catalog().some(a => a.week === cfg.week)) return '';
    pending.set(s.ri, {before:ready ? [...cloud] : null});
    return '<div id="xp-pending" class="small">XP 待雲端紀錄確認。</div>';
  }
  return {start, stop, pass, render, refresh};
};

// 管理關卡切換、題目重抽與作答狀態。
const shellCreateRoundFlow = (s) => {
  const { $, esc, R } = s;
  const txt = (v, inst) => typeof v === 'function' ? v(inst) : (v || '');
  const seed = () => { let s = (Math.random() * 2 ** 31) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } };
  // 按原順序顯示所有關卡與已完成標記。
  function renderRounds() {
    $('rounds').innerHTML = R.map((r, i) => '<button type="button" class="' + (s.done.has(i) ? 'passed' : '') + '" data-i="' + i + '" aria-pressed="' + (i === s.ri) + '">' + esc(r.name) + (s.done.has(i) ? ' <span class="done" aria-hidden="true">✓</span><span class="shell-sr-only"> 已過關</span>' : '') + '</button>').join('');
    $('rounds').querySelectorAll('button').forEach(b => b.onclick = () => load(+b.dataset.i));
  }
  // 顯示累積答對的組數；保留 streak 名稱相容舊計數。
  function renderStreak() { $('streak').innerHTML = '累積答對 ' + Math.min(s.streak, 2) + '/2 ' + [0, 1].map(i => '<i class="' + (i < s.streak ? 'on' : '') + '"></i>').join(''); }
  // 同步送出狀態與電腦內部說明。
  function changed() {
    const ok = !s.handle.ready || s.handle.ready();
    $('b-send').disabled = !ok; $('send-hint').textContent = ok ? '' : '全部完成後才能送出。';
    if (R[s.ri].peek) { $('sec3').hidden = false; $('peek').innerHTML = R[s.ri].peek(s.inst, s.handle.get()); } else $('sec3').hidden = true;
  }
  // 在 view 可能改動資料前保存內容；物件鍵序不影響比對，陣列順序仍有意義。
  const contentKey = shellContentKey;
  // 共用換題入口：送出、教師換題及重載同關皆排除前題。
  function fresh(afterSubmit = false) {
    s.closeDemo?.();
    const r = R[s.ri], rnd = seed();
    const previousNumbers = s.previousKey === null ? null : shellQuestionNumbers($);
    let key;
    // 最多抽 20 次；單一題庫或一直抽到同題時仍可繼續操作。
    for (let draw = 0; draw < 20; draw++) {
      s.inst = r.gen(rnd);
      key = contentKey(r.questionKey ? r.questionKey(s.inst) : s.inst);
      if (key !== s.previousKey) break;
    }
    s.previousKey = key;
    $('says').innerHTML = r.instruction ? txt(r.instruction, s.inst) : '<span class="tk"><b>現在</b><span>' + txt(r.now, s.inst) + '</span></span><span class="tk"><b>要做到</b><span>' + txt(r.goal, s.inst) + '</span></span>' + (s.teacher && r.tip ? '<span class="tk tip"><b>提示</b><span>' + txt(r.tip, s.inst) + '</span></span>' : '');
    $('stage').innerHTML = ''; s.handle = r.view(s.inst, $('stage'), { changed: () => changed(), attempt, esc });
    shellHighlightQuestion($, previousNumbers);
    renderStreak(); changed(); s.renderHints?.();
    if (afterSubmit) $('task-instructions')?.scrollIntoView?.({behavior: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
  }
  // 切換關卡並重設累積答對狀態。
  function load(i) { if (s.ri !== i) { s.previousKey = null; s.resetHints?.(); } s.ri = i; s.streak = 0; $('verdict').hidden = true; renderRounds(); fresh(); }
  // 保留既有測試／頁面使用的入口；等級不再影響關卡顯示。
  function setLevel(l) { const i = R.findIndex(r => r.lv === l); load(i >= 0 ? i : 0); }

  // 自行演出的活動可在開始演出時記次；預設仍由送出按鈕記次。
  function attempt() {
    if (!s.teacher && !s.done.has(s.ri)) { s.prog.tries[s.ri] = Math.min(15, s.prog.tries[s.ri] + 1); s.saveProg(); }
  }
  $('b-send').onclick = () => s.submit();
  return { renderRounds, renderStreak, fresh, load, setLevel, attempt, changed };
};

// 沿用判題、累積確認與過關呈現流程。
const shellCreateJudging = (s) => {
  const { cfg, $, esc, R } = s;
  const NEED = 2;
  // 依原判題結果更新累積確認與過關紀錄。
  function submit() {
    if (s.isHintDemo?.()) return;
    const r = R[s.ri], res = r.check(s.inst, s.handle.get()), v = $('verdict');
    if (!r.manualAttempt) s.attempt();
    s.hintSubmitted?.(res !== true);
    if (res !== true) {
      v.className = 'verdict no'; v.innerHTML = '<h3>還不對</h3><p></p><p class="small">' + (r.manualAttempt ? '調整後再演出一次。' : '已換新題；答錯不歸零，累積答對 2/2 就過關。') + '</p>';
      v.querySelector('p').textContent = res; v.hidden = false;
      // 演出型活動自行檢查固定雙組資料，須保留播放、斷電及逐步示範狀態。
      if (!r.manualAttempt) s.fresh(true);
      return;
    }
    s.streak += r.confirmations === 1 ? 2 : 1;
    if (s.streak < (r.confirmations ?? NEED)) {
      v.className = 'verdict mid'; v.innerHTML = '<h3>答對了！再一組確認</h3><p>已經換成一組新的資料，再做一次，累積答對 2/2 就過關。</p>'; v.hidden = false;
      s.fresh(true); return;
    }
    const xpMessage = s.xp?.pass() || '';
    if (!s.teacher && !s.done.has(s.ri)) { s.done.add(s.ri); s.prog.mask |= 1 << s.ri; s.prog.time = Date.now(); s.saveProg(); s.upload(s.ri); }
    s.resetHints?.();
    const next = R.findIndex((x, i) => i > s.ri);
    v.className = 'verdict ok';
    v.innerHTML = '<h3>過關！</h3>' + (r.learn ? '<p>' + esc(r.learn) + '</p>' : '') + xpMessage + '<div class="btns">' +
      (next >= 0 ? '<button class="btn primary" id="b-next">下一關</button>' : endMsg()) + '</div>';
    v.hidden = false; s.renderStreak(); s.renderRounds();
    if ($('b-next')) $('b-next').onclick = () => s.load(next);
  }
  // 最後一關過了，不代表整個活動完成：照實際過了幾關說（教師模式示範時直接顯示結語）
  function endMsg() {
    const got = R.filter((_, i) => s.done.has(i)).length;
    if (s.teacher || got === R.length) return '<p><strong>' + esc(cfg.finale || '全部完成！') + '</strong></p>';
    return '<p>這一關完成了！這個活動目前完成 ' + got + '／' + R.length + ' 關，還沒過的：' + R.filter((_, i) => !s.done.has(i)).map(r => esc(r.name)).join('、') + '。</p>';
  }
  return { submit };
};

// 保存既有進度。
const shellCreateProgress = (s) => {
  const { cfg, $ } = s;
  const KEY = () => 'it9:w' + cfg.week + ':' + s.ident.cls + '-' + s.ident.seat;
  // 保存班座進度。
  function saveProg() { try { localStorage.setItem(KEY(), JSON.stringify(s.prog)); localStorage.setItem('it9:last', JSON.stringify(cfg.rememberIdentity ? s.ident : { cls: s.ident.cls, seat: s.ident.seat })) } catch (e) { $('sync').hidden = false; $('sync').className = 'sync warn'; $('sync').textContent = '這台電腦沒辦法存下進度（瀏覽器不允許）。重新整理後過關紀錄可能遺失，請保留頁面並重試上傳，確認老師已收到。' } }
  return { progressKey: KEY, saveProg };
};

// 綁定班座輸入與確認步驟。
const shellBindIdentityForm = (s) => {
  const { $ } = s;
  const start = id => s.start(id);
  const digits = el => { const f = () => { const v = el.value.replace(/\D/g, ''); if (v !== el.value) el.value = v }; el.addEventListener('input', f); el.addEventListener('compositionend', f); el.addEventListener('blur', f) };
  digits($('in-cls')); digits($('in-seat'));
  // 驗證手動輸入的班級與座號。
  function checkId() {
    const c = $('in-cls').value, s = $('in-seat').value;
    if (!/^[1-9]\d{2}$/.test(c)) return '班級要填三位數字，例如 901。';
    if (!/^\d{1,2}$/.test(s) || +s < 1 || +s > 60) return '座號要填 1～60 的數字。';
    return null;
  }
  $('g-next').onclick = () => {
    const e = checkId(); $('gerr').textContent = e || ''; if (e) return;
    $('g-confirm').textContent = '你是 ' + $('in-cls').value + ' 班 ' + (+$('in-seat').value) + ' 號，對嗎？';
    $('g-step1').hidden = true; $('g-step2').hidden = false; $('in-cls').disabled = true; $('in-seat').disabled = true; $('g-go').focus();
  };
  ['in-cls', 'in-seat'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('g-next').click() }));
  $('g-back').onclick = () => { $('g-step1').hidden = false; $('g-step2').hidden = true; $('in-cls').disabled = false; $('in-seat').disabled = false; $('in-cls').focus() };
  $('g-go').onclick = () => start({ cls: +$('in-cls').value, seat: +$('in-seat').value });
};

// 還原班座進度並處理開始與換人。
const shellCreateIdentity = (s) => {
  const { cfg, $, R, loginEnabled } = s;
  // 共用 XP 已確認的本人雲端紀錄，只補上本活動過關位元，不動本機待送與作答次數。
  function restoreCloudProgress(records) {
    const before = s.prog.mask;
    for (const r of records) {
      if (r.activity !== cfg.week || !Number.isInteger(r.round) || r.round < 0 || r.round >= R.length) continue;
      s.prog.mask |= 1 << r.round;
      s.done.add(r.round);
    }
    if (s.prog.mask !== before) { s.saveProg(); s.renderRounds(); }
  }
  // 還原既有進度並進入活動。
  function start(id) {
    s.resetHints?.();
    s.ident = id; $('sync').textContent = ''; $('sync').hidden = true; $('b-retry').hidden = true; $('b-retry').disabled = false; s.prog = { mask: 0, tries: Array(cfg.progressLength ?? 6).fill(0), time: Date.now() };
    try { const p = JSON.parse(localStorage.getItem(s.progressKey()) || 'null'); if (p && Number.isInteger(p.mask) && p.mask >= 0 && p.mask < 2 ** R.length
      && Array.isArray(p.tries) && p.tries.length >= R.length && p.tries.length <= 6
      && p.tries.every(n => Number.isInteger(n) && n >= 0 && n <= 15)
      && Number.isFinite(p.time) && p.time >= 0 && p.time <= 8640000000000000) s.prog = p } catch (e) { }
    s.done.clear(); for (let i = 0; i < R.length; i++) if (s.prog.mask & (1 << i)) s.done.add(i);
    $('who').textContent = id.cls + ' 班 ' + id.seat + ' 號' + (id.name ? ' ' + id.name : '');
    if (loginEnabled() && YBS.profile()) { try { sessionStorage.setItem('ybslab:me:' + YBS.profile().email, JSON.stringify({ cls: id.cls, seat: id.seat })) } catch (e) { } $('sync').hidden = false; YBS.flush() }
    else if (loginEnabled()) { $('sync').hidden = false; YBS.guest(id); }
    $('gate').hidden = true; $('main').hidden = false;
    s.xp?.start();
    s.setLevel(1);
  }
  $('b-swap').onclick = () => {
    if (s.teacher) { s.teacher = false; TEACHER.remember(false); $('tbar').hidden = true; $('b-swap').textContent = '不是我？換人'; $('who').textContent = '' }
    s.xp?.stop();
    s.ident = null; if (loginEnabled()) { if (YBS.profile()) YBS.logout(); else YBS.leaveGuest(); s.showLogin() }
    $('sync').hidden = true; $('main').hidden = true; $('gate').hidden = false; $('g-back').click(); $('in-cls').value = ''; $('in-seat').value = ''; $('gerr').textContent = '';
  };
  return { start, restoreCloudProgress };
};

// 綁定教師登入、填答與換題操作。
const shellCreateTeacher = (s) => {
  const { $ } = s;
  // 進入不記分的教師示範模式。
  function enterTeacher() {
    s.xp?.stop();
    s.teacher = true; TEACHER.remember(true); s.ident = null; s.done.clear();
    $('who').textContent = '教師模式'; $('b-swap').textContent = '登出教師模式';
    $('sync').hidden = true; $('b-retry').hidden = true; $('tbar').hidden = false; $('gate').hidden = true; $('main').hidden = false;
    s.setLevel(1);
  }
  $('t-show').onclick=()=>{const i=$('in-tcode'),s=i.type==='password';i.type=s?'text':'password';$('t-show').textContent=s?'隱藏通行碼':'顯示通行碼'};
  $('t-open').onclick = () => { $('t-box').hidden = !$('t-box').hidden; if (!$('t-box').hidden) $('in-tcode').focus() };
  const tryTeacher = async () => { $('terr').textContent = ''; if (await TEACHER.check($('in-tcode').value)) { $('in-tcode').value = ''; enterTeacher() } else $('terr').textContent = '通行碼不對。' };
  $('t-go').onclick = tryTeacher;
  $('in-tcode').addEventListener('keydown', e => { if (e.key === 'Enter') tryTeacher() });
  // 教師程式填答不一定觸發 input；示範入口負責同步送出狀態與內部說明。
  $('tb-ans').onclick = () => { s.handle.fill(); s.changed(); };
  $('tb-new').onclick = () => { $('verdict').hidden = true; s.fresh(); };
  return { enterTeacher };
};

// 整合帳號登入、名單確認與手動登入。
const shellCreateLogin = (s) => {
  const { $ } = s;
  const start = id => s.start(id);
  let generation = 0;
  // 確認登入名單或切回手動班座輸入。
  function showLogin() {
    const current = ++generation;
    $('g-login').hidden = false; $('g-form').hidden = true; $('g-lerr').textContent = ''; $('g-who').hidden = true;
    YBS.button($('g-gbtn'), async me => {
      if (current !== generation) return;
      $('g-login').hidden = true; $('g-who').hidden = false; $('g-whobtns').hidden = true; $('g-whotext').textContent = '正在確認你的身分…';
      const r = await YBS.whoami();
      if (current !== generation) return;
      if (r.ok && r.student && /^[1-9]\d{2}$/.test(String(r.student.cls)) && /^\d{1,2}$/.test(String(r.student.seat)) && +r.student.seat >= 1 && +r.student.seat <= 60) { const st = r.student; $('g-whotext').textContent = '你是 ' + st.cls + ' 班 ' + st.seat + ' 號，對嗎？'; $('g-whobtns').hidden = false; $('g-isme').focus(); $('g-isme').onclick = () => { if (current === generation) start({ cls: st.cls, seat: st.seat, name: st.name }); }; return }
      if (!r.ok && r.error === 'not-listed') { $('g-who').hidden = true; YBS.logout(); showLogin(); $('g-lerr').textContent = '名單上找不到這個帳號（' + (me.account || me.email) + '），請改用自己的帳號，或告訴老師。'; return }
      $('g-who').hidden = true; $('g-form').hidden = false;
      $('g-me').hidden = false; $('g-me').textContent = '已登入：' + (me.account || me.email) + (r.ok ? '（名單上沒有你，請填班級座號並告訴老師）' : '');
      try { const s = JSON.parse(sessionStorage.getItem('ybslab:me:' + me.email) || 'null'); if (s) { $('in-cls').value = s.cls; $('in-seat').value = s.seat } } catch (e) { }
      $('in-cls').focus();
    }, msg => { if (current === generation) $('g-lerr').textContent = msg });
  }
  $('g-notme').onclick = () => { YBS.logout(); showLogin() };
  $('g-manual').onclick = () => { generation++; YBS.logout({keepAnonymous:true}); $('g-login').hidden = true; $('g-who').hidden = true; $('g-form').hidden = false; $('g-me').hidden = false; $('g-me').textContent = '班座紀錄會自動上傳；班座尚未驗證，離開前請確認已上傳。'; $('in-cls').focus() };
  return { showLogin };
};

// 維持上傳欄位並同步顯示上傳狀態。
const shellCreateSync = (s) => {
  const { cfg, $, R, loginEnabled } = s;
  // 沿用既有欄位上傳本關紀錄。
  function upload(r) {
    if (!loginEnabled() || !s.ident) return;
    YBS.submit({ course: cfg.course, activity: cfg.week, termWeek: cfg.termWeek, title: cfg.title, round: r, roundName: R[r].name, level: R[r].lv === 1 ? '基礎' : '進階', rounds: R.map(x => x.name), tries: s.prog.tries[r], mask: s.prog.mask, cls: s.ident.cls, seat: s.ident.seat, at: new Date().toISOString() });
  }
  let state = null, identity = null, nodes = [];
  const retryUpload = () => { if (s.ident && loginEnabled()) return YBS.retry(); };
  function renderStatus() {
    const current = [$('sync'), $('b-retry')]; nodes = current;
    const [el, retry] = current;
    if (retry) { retry.onclick = retryUpload; retry.hidden = !s.ident || !loginEnabled() || identity !== s.ident || !state || ['ok', 'sending', 'relogin'].includes(state); retry.disabled = state === 'sending' && identity === s.ident; }
    if (!s.ident || identity !== s.ident || !state) {
      if (el) { el.hidden = true; el.textContent = ''; }
      return;
    }
    const text = state === 'ok' ? '✓ 紀錄已上傳給老師' : state === 'sending' ? '上傳中…'
      : state === 'guest-storage' ? '儲存空間不足，請保留頁面並重試上傳；離開頁面可能遺失待送紀錄。'
      : state === 'guest-pending' ? '還沒上傳成功，紀錄暫存在本機，稍後自動上傳；也可按重試上傳'
      : state === 'relogin' ? '登入過期，請按右上角重新登入才能上傳' : '還沒上傳成功，會自動重試';
    const cls = 'sync' + (state === 'ok' ? ' ok' : state === 'sending' ? '' : ' warn');
    if (el) {
      el.hidden = false; el.className = cls;
      if (state === 'relogin') { el.innerHTML = '登入過期，重新登入才能上傳 <span id="sync-btn"></span>'; YBS.button($('sync-btn'), () => {}, msg => { el.textContent = msg; }); }
      else el.textContent = text;
    }
  }
  if (typeof YBS !== 'undefined') YBS.status(st => { if (!s.ident) return; state = st; identity = s.ident; renderStatus(); if (st === 'ok') s.xp?.refresh(); });
  // 元素延後建立或被重建時重綁按鈕及還原目前身分的提示；不依賴首次查找成功。
  if (window.MutationObserver) new window.MutationObserver(() => {
    const current = [$('sync'), $('b-retry')];
    if (current.some((el, i) => el !== nodes[i])) renderStatus();
  }).observe(document.body, {childList:true, subtree:true});
  renderStatus();
  return { upload };
};

// 常用小工具：亂數挑選
const PICK = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const SHUF = (rnd, arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a };
const SAMPLE = (rnd, arr, n) => SHUF(rnd, arr).slice(0, n);
const RINT = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const FMT = n => Number(n).toLocaleString('en-US');
// 「每列選一個」的分類元件：items=[{html}], opts=[標籤]；回傳 {get, fill(answers), ready}
function CLASSIFY(el, items, opts, api, onChange) {
  const ans = items.map(() => null);
  el.insertAdjacentHTML('beforeend', '<div class="rows">' + items.map((it, i) => '<div class="row"><div class="q">' + it.html + '</div><div class="picks" data-i="' + i + '">' + opts.map((o, j) => '<button type="button" class="pk" data-j="' + j + '" aria-pressed="false">' + o + '</button>').join('') + '</div></div>').join('') + '</div>');
  const sync = () => el.querySelectorAll('.picks[data-i]').forEach(p => p.querySelectorAll('.pk').forEach(b => b.setAttribute('aria-pressed', +b.dataset.j === ans[+p.dataset.i])));
  el.querySelectorAll('.picks[data-i]').forEach(p => p.querySelectorAll('.pk').forEach(b => b.onclick = () => { const i = +p.dataset.i, j = +b.dataset.j; ans[i] = ans[i] === j ? null : j; sync(); onChange && onChange(); api.changed() }));
  return { get: () => [...ans], fill: a => { a.forEach((v, i) => ans[i] = v); sync(); onChange && onChange() }, ready: () => ans.every(v => v != null) };
}
// ===== 第 5 單元起的共用元件 =====
// 排順序：labels 是卡片（可含 HTML）；點左邊放進右邊下一格，點格子裡的拿回去
function ORDERBOX(el, labels, api, o = {}) {
  const n = labels.length, slots = Array(n).fill(null);
  el.insertAdjacentHTML('beforeend', '<div class="two"><section class="panel"><div class="ptitle"><h3>' + (o.pool || '卡片') + '</h3><span class="small">點一下放進右邊下一格</span></div><div class="picks ob-pool"></div></section>' +
    '<section class="panel"><div class="ptitle"><h3>' + (o.slots || '順序') + '</h3><span class="small">點格子裡的卡片拿回去</span></div><div class="slots ob-slots"></div></section></div>');
  const P = el.querySelector('.ob-pool'), S = el.querySelector('.ob-slots');
  const draw = () => {
    P.innerHTML = labels.map((l, i) => slots.includes(i) ? '' : '<button type="button" class="pk" data-i="' + i + '">' + l + '</button>').join('') || '<p class="small">都排好了，按「送出」。</p>';
    S.innerHTML = slots.map((k, j) => '<div class="slot"><span class="n">' + (j + 1) + '</span>' + (k == null ? '<span class="empty">' + (j === 0 && o.first ? o.first : j === n - 1 && o.last ? o.last : '　') + '</span>' : '<button type="button" class="pk" data-s="' + j + '">' + labels[k] + '</button>') + '</div>').join('');
    P.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const j = slots.indexOf(null); if (j < 0) return; slots[j] = +b.dataset.i; draw(); api.changed() });
    S.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { slots[+b.dataset.s] = null; draw(); api.changed() });
  };
  draw();
  return { get: () => [...slots], fill: a => { a.forEach((v, i) => slots[i] = v); draw() }, ready: () => slots.every(v => v != null) };
}
// 單選：labels 一排按鈕
function PICKONE(el, labels, api, ans, o = {}) {
  el.insertAdjacentHTML('beforeend', '<div class="picks" style="margin-top:10px">' + labels.map((t, j) => '<button type="button" class="pk" data-o="' + j + '" aria-pressed="false"' + (o.mono ? ' style="font-family:var(--f-mono)"' : '') + '>' + t + '</button>').join('') + '</div>');
  let v = null; const sync = () => el.querySelectorAll('[data-o]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.o === v));
  el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { v = +b.dataset.o; sync(); api.changed() });
  return { get: () => v, fill: () => { v = typeof ans === 'function' ? ans() : ans; sync() }, ready: () => v != null };
}
// 只接受整串都是數字（可有小數、負號依 o 設定）；不合格回傳 null
const NUMOK = (s, o = {}) => { const t = String(s).trim().replace(/[,，]/g, ''); const re = o.neg ? (o.dec ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/) : (o.dec ? /^\d+(\.\d+)?$/ : /^\d+$/); return re.test(t) ? Number(t) : null };
// 分類題的標準檢查（每列一個答案）
const CHECKROWS = (items, a, hint) => { const w = items.map((x, i) => a[i] === x[1] ? 0 : i + 1).filter(Boolean); return w.length ? '第 ' + w.join('、') + ' 項' + (hint || '再想想。') : true };
