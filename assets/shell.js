// 活動頁共用外框（第 2 單元起）。各週頁面只要寫關卡，填班級座號、分頁、成績碼、教師模式、上傳都在這裡。
// 用法：SHELL({week, termWeek, title, course, unit, rounds:[…]})
// 每一關：{ name, lv:1|2, now, goal, tip（字串或 inst=>字串）, learn（過關說明）,
//   gen(rnd) → inst（一組題目資料，rnd() 回傳 0～1）,
//   view(inst, el, api) → { get()（學生目前的答案）, fill()（教師：填好答案）, ready()（可以送出了嗎，可省略） },
//   check(inst, ans) → true 或 一句「哪裡不對」的提示,
//   peek(inst, ans)（可省略）→ 第 3 部分「電腦裡發生的」HTML }
// 過關規則：連續答對兩組不同的資料。答錯留在同一組讓學生修正，答對才換新的一組。
const SHELL = (cfg) => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NEED = 2, R = cfg.rounds;
  const txt = (v, inst) => typeof v === 'function' ? v(inst) : (v || '');

  document.body.insertAdjacentHTML('afterbegin', `
<section class="gate" id="gate">
  <h1>${esc(cfg.title)}</h1>
  <div id="g-login" hidden style="display:flex;flex-direction:column;gap:12px;align-items:center">
    <p>先登入：帳號是 cgjh＋學號，密碼是 cgjh＋身分證字號。每過一關，紀錄會自動交給老師。</p>
    <div id="g-gbtn" style="min-height:44px;display:flex;justify-content:center"></div>
    <div class="gerr" id="g-lerr" role="alert"></div>
    <button class="linkbtn" id="g-manual" type="button">登入不了？改填班級座號</button>
  </div>
  <div id="g-who" hidden style="display:flex;flex-direction:column;gap:12px;align-items:center">
    <p id="g-whotext" style="color:var(--ink);font-size:20px"></p>
    <div class="btns" style="justify-content:center" id="g-whobtns"><button class="btn" id="g-notme" type="button">不是我</button><button class="btn primary" id="g-isme" type="button">對，開始</button></div>
  </div>
  <div id="g-form" style="display:flex;flex-direction:column;gap:14px">
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
<div class="wrap" id="main" hidden>
  <header class="top">
    <div style="display:flex;flex-direction:column;gap:4px">
      <h1>${esc(cfg.title)}</h1>
      <div class="who-bar"><a href="../../" class="linkbtn">← YBS Lab</a><span><b id="who"></b></span><button class="linkbtn" id="b-swap" type="button">不是我？換人</button><span class="sync" id="sync" hidden></span></div>
    </div>
    <div class="tabs" role="tablist" aria-label="等級"><button id="tab-1" role="tab" aria-selected="true">基礎關</button><button id="tab-2" role="tab" aria-selected="false">進階關</button></div>
  </header>
  <nav class="unit" id="unit" aria-label="本單元進度" hidden></nav>
  <div class="rounds" id="rounds"></div>
  <section class="sec">
    <h2 class="sec-h"><span class="num">1</span>任務說明</h2>
    <div class="order" id="says" aria-live="polite"></div>
  </section>
  <section class="sec">
    <h2 class="sec-h"><span class="num">2</span>動手做</h2>
    <div id="stage"></div>
    <div class="btns"><button class="btn primary" id="b-send" type="button">送出</button><span class="streak" id="streak"></span><span class="small" id="send-hint"></span></div>
    <section class="verdict" id="verdict" hidden aria-live="polite"></section>
  </section>
  <section class="sec" id="sec3" hidden>
    <h2 class="sec-h"><span class="num">3</span>電腦裡發生的</h2>
    <div id="peek"></div>
  </section>
  <div class="tbar" id="tbar" hidden role="toolbar" aria-label="教師工具">
    <span class="tlabel">教師模式</span>
    <button class="btn" id="tb-ans" type="button">顯示答案</button>
    <button class="btn" id="tb-new" type="button">換一組資料</button>
    <span class="thint">教師模式不產生成績碼；「顯示答案」直接填好這一組的答案，按「送出」可以示範過關畫面。</span>
  </div>
  <section class="report" id="report" aria-live="polite">
    <h2>我的成績碼</h2>
    <div class="prog" id="prog"></div>
    <span class="code" id="code"></span>
    <button class="btn" id="b-copy" type="button">複製成績碼</button>
    <span class="copied" id="copied"></span>
    <p class="small" style="width:100%" id="rep-note">每過一關成績碼都會更新。做完後把<strong>最新的</strong>成績碼交給老師。</p>
    <p class="sync" id="sync2" hidden style="margin:0"></p>
  </section>
  <p class="foot">© 2026 YBS Lab　<a href="../../about/#h-rights" style="color:inherit">保留所有權利，未經同意請勿轉載或改作</a></p>
</div>`);

  // ===== 單元進度條 =====
  if (cfg.unit && typeof ACTIVITIES !== 'undefined') {
    const list = ACTIVITIES.filter(a => a.course === cfg.course && a.unit === cfg.unit).sort((a, b) => a.date.localeCompare(b.date));
    if (list.length > 1) {
      $('unit').hidden = false;
      $('unit').innerHTML = '<span class="lbl">第 ' + cfg.unit + ' 單元</span>' + list.map(a => {
        const w = typeof termWeekOf === 'function' ? termWeekOf(a) : null, now = a.week === cfg.week;
        return '<' + (now ? 'span class="now" aria-current="page"' : 'a href="../../' + esc(a.href) + '"') + '><b>' + esc(a.title) + '</b>' + (w ? '第 ' + w + ' 週' : '') + (a.track === '選修' ? '・選修' : '') + '</' + (now ? 'span' : 'a') + '>';
      }).join('');
    }
  }

  // ===== 關卡 =====
  let level = 1, ri = 0, inst = null, handle = null, streak = 0, teacher = false;
  const done = new Set();
  const seed = () => { let s = (Math.random() * 2 ** 31) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 } };
  function renderRounds() {
    $('rounds').innerHTML = R.map((r, i) => r.lv !== level ? '' : '<button type="button" data-i="' + i + '" aria-pressed="' + (i === ri) + '">' + esc(r.name) + (done.has(i) ? ' <span class="done">✓</span>' : '') + '</button>').join('');
    $('rounds').querySelectorAll('button').forEach(b => b.onclick = () => load(+b.dataset.i));
  }
  function renderStreak() { $('streak').innerHTML = '連續答對兩組才過關 ' + [0, 1].map(i => '<i class="' + (i < streak ? 'on' : '') + '"></i>').join(''); }
  function changed() {
    const ok = !handle.ready || handle.ready();
    $('b-send').disabled = !ok; $('send-hint').textContent = ok ? '' : '全部完成後才能送出。';
    if (R[ri].peek) { $('sec3').hidden = false; $('peek').innerHTML = R[ri].peek(inst, handle.get()); } else $('sec3').hidden = true;
  }
  function fresh() {
    const r = R[ri]; inst = r.gen(seed());
    $('says').innerHTML = '<span class="tk"><b>現在</b><span>' + txt(r.now, inst) + '</span></span><span class="tk"><b>要做到</b><span>' + txt(r.goal, inst) + '</span></span>' + (r.tip ? '<span class="tk tip"><b>提示</b><span>' + txt(r.tip, inst) + '</span></span>' : '');
    $('stage').innerHTML = ''; handle = r.view(inst, $('stage'), { changed: () => changed(), esc });
    renderStreak(); changed();
  }
  function load(i) { ri = i; streak = 0; $('verdict').hidden = true; renderRounds(); fresh(); }
  function setLevel(l) { level = l; $('tab-1').setAttribute('aria-selected', l === 1); $('tab-2').setAttribute('aria-selected', l === 2); load(R.findIndex(r => r.lv === l)); }
  $('tab-1').onclick = () => setLevel(1); $('tab-2').onclick = () => setLevel(2);

  $('b-send').onclick = () => {
    const r = R[ri], res = r.check(inst, handle.get()), v = $('verdict');
    if (!teacher && !done.has(ri)) { prog.tries[ri] = Math.min(15, prog.tries[ri] + 1); saveProg(); }
    if (res !== true) {
      streak = 0; renderStreak();
      v.className = 'verdict no'; v.innerHTML = '<h3>還不對</h3><p>' + res + '</p><p class="small">修改後再送出一次。</p>'; v.hidden = false; return;
    }
    streak++;
    if (streak < NEED) {
      v.className = 'verdict mid'; v.innerHTML = '<h3>答對了！再一組確認</h3><p>已經換成一組新的資料，再做一次，連續答對兩組就過關。</p>'; v.hidden = false;
      fresh(); return;
    }
    if (!teacher) { done.add(ri); prog.mask |= 1 << ri; prog.time = Date.now(); saveProg(); upload(ri); }
    const next = R.findIndex((x, i) => i > ri && x.lv === level);
    v.className = 'verdict ok';
    v.innerHTML = '<h3>過關！</h3>' + (r.learn ? '<p>' + r.learn + '</p>' : '') + '<div class="btns">' +
      (next >= 0 ? '<button class="btn primary" id="b-next">下一關</button>' : level === 1 ? '<button class="btn primary" id="b-lv2">挑戰進階關</button>' : endMsg()) + '</div>';
    v.hidden = false; renderRounds();
    if ($('b-next')) $('b-next').onclick = () => load(next);
    if ($('b-lv2')) $('b-lv2').onclick = () => setLevel(2);
  };

  // 最後一關過了，不代表整個活動完成：照實際過了幾關說（教師模式示範時直接顯示結語）
  function endMsg() {
    const got = R.filter((_, i) => done.has(i)).length;
    if (teacher || got === R.length) return '<p><strong>' + esc(cfg.finale || '全部完成！') + '</strong></p>';
    return '<p>這一關完成了！這個活動目前完成 ' + got + '／' + R.length + ' 關，還沒過的：' + R.filter((_, i) => !done.has(i)).map(r => esc(r.name)).join('、') + '。</p>';
  }
  // ===== 班級座號與進度 =====
  let ident = null, prog = { mask: 0, tries: [0, 0, 0, 0, 0, 0], time: Date.now() };
  const KEY = () => 'it9:w' + cfg.week + ':' + ident.cls + '-' + ident.seat;
  function saveProg() { try { localStorage.setItem(KEY(), JSON.stringify(prog)); localStorage.setItem('it9:last', JSON.stringify({ cls: ident.cls, seat: ident.seat })) } catch (e) { $('rep-note').innerHTML = '<strong>這台電腦沒辦法存下進度</strong>（瀏覽器不允許）。重新整理後過關紀錄會不見，請現在就把最新的成績碼抄下來交給老師。' } renderReport(); }
  function renderReport() {
    if (!ident) return;
    $('prog').innerHTML = R.map((r, i) => '<span class="' + (prog.mask & (1 << i) ? 'ok' : '') + '">' + (r.lv === 1 ? '基礎' : '進階') + '・' + esc(r.name) + (prog.mask & (1 << i) ? ' ✓' : '') + '</span>').join('');
    $('code').textContent = CODEC.encode({ week: cfg.week, cls: ident.cls, seat: ident.seat, mask: prog.mask, tries: prog.tries, time: prog.time });
    $('copied').textContent = '';
  }
  $('b-copy').onclick = () => {
    const t = $('code').textContent;
    const sel = () => { const r = document.createRange(); r.selectNodeContents($('code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('copied').textContent = '已選取，按 Ctrl+C 複製' };
    try { navigator.clipboard.writeText(t).then(() => { $('copied').textContent = '已複製' }, sel) } catch (e) { sel() }
  };
  const digits = el => { const f = () => { const v = el.value.replace(/\D/g, ''); if (v !== el.value) el.value = v }; el.addEventListener('input', f); el.addEventListener('compositionend', f); el.addEventListener('blur', f) };
  digits($('in-cls')); digits($('in-seat'));
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
  function start(id) {
    ident = id; prog = { mask: 0, tries: [0, 0, 0, 0, 0, 0], time: Date.now() };
    try { const p = JSON.parse(localStorage.getItem(KEY()) || 'null'); if (p && Array.isArray(p.tries)) prog = p } catch (e) { }
    done.clear(); for (let i = 0; i < R.length; i++) if (prog.mask & (1 << i)) done.add(i);
    $('who').textContent = id.cls + ' 班 ' + id.seat + ' 號' + (id.name ? ' ' + id.name : '');
    if (YBS.enabled() && YBS.profile()) { try { sessionStorage.setItem('ybslab:me:' + YBS.profile().email, JSON.stringify({ cls: id.cls, seat: id.seat })) } catch (e) { } $('sync').hidden = false; $('rep-note').innerHTML = '每過一關會<strong>自動上傳</strong>給老師；上傳失敗時會自動重試，也可以把成績碼交給老師當備份。'; YBS.flush() }
    $('gate').hidden = true; $('main').hidden = false;
    setLevel(1); renderReport();
  }
  $('b-swap').onclick = () => {
    if (teacher) { teacher = false; TEACHER.remember(false); $('tbar').hidden = true; $('report').hidden = false; $('b-swap').textContent = '不是我？換人'; $('who').textContent = '' }
    ident = null; if (YBS.enabled()) { YBS.logout(); showLogin() }
    $('sync').hidden = true; $('main').hidden = true; $('gate').hidden = false; $('g-back').click(); $('in-cls').value = ''; $('in-seat').value = ''; $('gerr').textContent = '';
  };
  // ===== 教師模式 =====
  function enterTeacher() {
    teacher = true; TEACHER.remember(true); ident = null; done.clear();
    $('who').textContent = '教師模式'; $('b-swap').textContent = '登出教師模式';
    $('report').hidden = true; $('tbar').hidden = false; $('gate').hidden = true; $('main').hidden = false;
    setLevel(1);
  }
  $('t-show').onclick=()=>{const i=$('in-tcode'),s=i.type==='password';i.type=s?'text':'password';$('t-show').textContent=s?'隱藏通行碼':'顯示通行碼'};
  $('t-open').onclick = () => { $('t-box').hidden = !$('t-box').hidden; if (!$('t-box').hidden) $('in-tcode').focus() };
  const tryTeacher = async () => { $('terr').textContent = ''; if (await TEACHER.check($('in-tcode').value)) { $('in-tcode').value = ''; enterTeacher() } else $('terr').textContent = '通行碼不對。' };
  $('t-go').onclick = tryTeacher;
  $('in-tcode').addEventListener('keydown', e => { if (e.key === 'Enter') tryTeacher() });
  $('tb-ans').onclick = () => { handle.fill(); changed(); };
  $('tb-new').onclick = () => { $('verdict').hidden = true; fresh(); };
  // ===== 學校帳號登入與自動上傳（assets/login.js 設定好才啟用） =====
  function showLogin() {
    $('g-login').hidden = false; $('g-form').hidden = true; $('g-lerr').textContent = ''; $('g-who').hidden = true;
    YBS.button($('g-gbtn'), async me => {
      $('g-login').hidden = true; $('g-who').hidden = false; $('g-whobtns').hidden = true; $('g-whotext').textContent = '正在確認你的身分…';
      const r = await YBS.whoami();
      if (r.ok && r.student) { const st = r.student; $('g-whotext').textContent = '你是 ' + st.cls + ' 班 ' + st.seat + ' 號，對嗎？'; $('g-whobtns').hidden = false; $('g-isme').focus(); $('g-isme').onclick = () => start({ cls: st.cls, seat: st.seat, name: st.name }); return }
      if (!r.ok && r.error === 'not-listed') { $('g-who').hidden = true; YBS.logout(); showLogin(); $('g-lerr').textContent = '名單上找不到這個帳號（' + (me.account || me.email) + '），請改用自己的帳號，或告訴老師。'; return }
      $('g-who').hidden = true; $('g-form').hidden = false;
      $('g-me').hidden = false; $('g-me').textContent = '已登入：' + (me.account || me.email) + (r.ok ? '（名單上沒有你，請填班級座號並告訴老師）' : '');
      try { const s = JSON.parse(sessionStorage.getItem('ybslab:me:' + me.email) || 'null'); if (s) { $('in-cls').value = s.cls; $('in-seat').value = s.seat } } catch (e) { }
      $('in-cls').focus();
    }, msg => { $('g-lerr').textContent = msg });
  }
  $('g-notme').onclick = () => { YBS.logout(); showLogin() };
  $('g-manual').onclick = () => { YBS.logout(); $('g-login').hidden = true; $('g-who').hidden = true; $('g-form').hidden = false; $('g-me').hidden = false; $('g-me').textContent = '這次不登入：過關後請把成績碼交給老師。'; $('in-cls').focus() };
  function upload(r) {
    if (!YBS.enabled() || !ident) return;
    YBS.submit({ course: cfg.course, activity: cfg.week, termWeek: cfg.termWeek, title: cfg.title, round: r, roundName: R[r].name, level: R[r].lv === 1 ? '基礎' : '進階', rounds: R.map(x => x.name), tries: prog.tries[r], mask: prog.mask, cls: ident.cls, seat: ident.seat, code: $('code').textContent, at: new Date().toISOString() });
  }
  YBS.status(st => {
    const el = $('sync'); if (!ident) return;
    el.className = 'sync' + (st === 'ok' ? ' ok' : st === 'sending' ? '' : ' warn');
    if (st === 'relogin') { el.innerHTML = '登入過期，重新登入才能上傳 <span id="sync-btn"></span>'; YBS.button($('sync-btn'), () => { }, msg => { el.textContent = msg }) }
    else el.textContent = st === 'ok' ? '✓ 紀錄已上傳給老師' : st === 'sending' ? '上傳中…' : '還沒上傳成功，會自動重試';
  });
  (()=>{const a=document.getElementById('sync'),b=document.getElementById('sync2');if(!a||!b||!window.MutationObserver)return;const f=()=>{b.hidden=a.hidden;b.className=a.className;b.textContent=a.querySelector('#sync-btn')?'登入過期，請按右上角重新登入才能上傳':a.textContent};new MutationObserver(f).observe(a,{attributes:true,childList:true,subtree:true,characterData:true});f()})();
  if (TEACHER.remembered()) enterTeacher(); else if (YBS.enabled()) showLogin(); else $('in-cls').focus();

  // 測試用：讓自動檢查可以拿到目前這一組資料與答案
  return { get inst() { return inst }, get handle() { return handle }, load, setLevel, get ri() { return ri }, rounds: R };
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
