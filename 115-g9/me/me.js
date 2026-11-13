// 顯示本人或課程擁有者指定學生的已確認 attempts；不提交作答、不保存 XP。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const course = '115-g9';
  const teacherTarget = YBSMeTeacher.target(location.search);
  let teacherAuth;
  let generation = 0, request = 0, owner = null;
  const mobile = matchMedia('(max-width:700px)');
  const panels = ['exploration','route'];
  let selectedPanel = 'exploration', scope = 'open', confirmed = null;
  function syncTabs() {
    $('growth-tabs').hidden = !mobile.matches;
    for (const name of panels) {
      const selected = name === selectedPanel, tab = $(name + '-tab'), panel = $(name + '-panel');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = mobile.matches && !selected;
      panel.setAttribute('aria-labelledby', name + (mobile.matches ? '-tab' : '-title'));
      if (mobile.matches) { panel.setAttribute('role','tabpanel'); panel.tabIndex = 0; }
      else { panel.removeAttribute('role'); panel.removeAttribute('tabindex'); }
    }
  }
  for (const name of panels) {
    const tab = $(name + '-tab');
    tab.onclick = () => { selectedPanel = name; syncTabs(); };
    tab.onkeydown = event => {
      let next;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) next = panels[1 - panels.indexOf(name)];
      else if (event.key === 'Home') next = panels[0];
      else if (event.key === 'End') next = panels[1];
      else return;
      event.preventDefault(); selectedPanel = next; syncTabs(); $(next + '-tab').focus();
    };
  }
  mobile.addEventListener('change', syncTabs);
  syncTabs();

  // lock.js 同時含 OPEN 資料和活動守門副作用。此頁不是活動，僅讀取
  // 該課程的字串清單，不執行守門、不複製提早開放名單、不使用 eval。
  async function catalog() {
    const response = await fetch('../../assets/lock.js', {cache:'no-store'});
    if (!response.ok) throw new Error('open-list');
    const source = await response.text();
    const list = /'115-g9'\s*:\s*\[([^\]]*)\]/.exec(source)?.[1];
    if (list === undefined) throw new Error('open-list');
    const early = [...list.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
    return ACTIVITIES.filter(a => a.course === course).map(a => ({...a, openedAt:activityOpenAt(a),
      isOpen:early.includes(a.href.split('/')[1]) || isActivityOpen(a)}));
  }

  function radar(result) {
    const opened = scope === 'open';
    const stations = result.stations.filter(a => !opened || a.isOpen);
    const passed = stations.reduce((n,a) => n + a.passed,0), total = stations.reduce((n,a) => n + a.rounds.length,0);
    const axes = result.exploration.map(a => ({...a, count:opened ? a.openPassed : a.passed,
      denominator:opened ? a.openTotal : a.total, ratio:opened ? a.openValue : a.value}));
    const scopeLabel = opened ? '已開放部分' : '全學期';
    const percent = v => Math.round(v * 100);
    $('completion-rate').innerHTML = percent(total ? passed / total : 0) + '<span>%</span>';
    $('completion-label').textContent = scopeLabel + '完成率';
    $('completion-detail').innerHTML = '<span class="mono">' + passed + ' / ' + total + '</span> 關完成<br><span class="muted">'
      + (opened ? '目前開放 ' + stations.length + ' 個活動；還有 ' + (total-passed) + ' 關未完成。' : '全學期 ' + stations.length + ' 個活動；包含尚未開放內容。') + '</span>';
    const point = (i,v) => [150 + Math.sin(i*Math.PI/3)*103*v,140 - Math.cos(i*Math.PI/3)*103*v];
    const shape = v => axes.map((_,i) => point(i,v).join(',')).join(' ');
    const plot = axes.map((a,i) => point(i,a.ratio).join(',')).join(' ');
    $('radar').innerHTML = '<svg class="radar" viewBox="0 0 300 280" role="img" aria-labelledby="radar-title radar-desc">'
      + '<title id="radar-title">' + scopeLabel + '的探索六邊形</title><desc id="radar-desc">'
      + axes.map(a => a.id + ' ' + a.name + '：' + (a.denominator ? a.count + '/' + a.denominator + ' 關，' + percent(a.ratio) + '%' : '尚無關卡')).join('；') + '。各主題可重複計關。</desc>'
      + '<polygon class="plot-fill" points="' + plot + '"/>'
      + [.25,.5,.75,1].map(v => '<polygon class="gridline" points="' + shape(v) + '"/>').join('')
      + axes.map((_,i) => '<line class="spoke" x1="150" y1="140" x2="' + point(i,1)[0] + '" y2="' + point(i,1)[1] + '"/>').join('')
      + '<polygon class="plot-outline" points="' + plot + '"/>'
      + axes.map((a,i) => { const p=point(i,a.ratio),t=point(i,1.23); return '<circle class="plot-dot" r="3.5" cx="' + p[0] + '" cy="' + p[1] + '"/><text x="' + t[0] + '" y="' + t[1] + '" text-anchor="middle" dominant-baseline="middle" font-size="15">' + a.id + '</text>'; }).join('') + '</svg>';
    $('axes').innerHTML = axes.map(a => '<li data-axis="' + a.id + '"><span class="axis-title"><i class="axis-color axis-' + a.id + '" aria-hidden="true"></i><b class="mono axis-key">' + a.id + '</b>' + a.name + '</span><span class="axis-value">'
      + (a.denominator ? '<span class="mono">' + percent(a.ratio) + '%</span><span class="muted"><span class="mono">' + a.count + ' / ' + a.denominator + '</span> 關</span>' : '<span class="muted">' + (opened ? '尚未開放' : '未安排關卡') + '</span>') + '</span></li>').join('');
    $('chart-note').textContent = '以各主題「' + (opened ? '已開放' : '全學期') + '關數」為分母；同一關可對應多個主題，主題關次不等於總過關數。';
    document.querySelectorAll('[data-scope]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.scope === scope)));
  }
  document.querySelectorAll('[data-scope]').forEach(button => button.onclick = () => { scope = button.dataset.scope; if (confirmed) radar(confirmed); });

  // 徽章以課綱主題軸區分；多主題活動同時顯示各軸，仍只計一枚活動徽章。
  const glyphs = {
    A:'<path d="M5 5h22v7H5zM16 12v6M5 22h8v6H5zM19 22h8v6h-8zM9 22v-4h14v4"/>',
    P:'<path d="m11 7-8 9 8 9m10-18 8 9-8 9M18 4l-4 24"/>',
    S:'<path d="m4 9 12-5 12 5-12 5ZM4 15l12 5 12-5M4 21l12 5 12-5"/>',
    D:'<rect x="4" y="4" width="9" height="9"/><rect x="19" y="4" width="9" height="9"/><rect x="4" y="19" width="9" height="9"/><path d="M19 19h9v9h-9zM23.5 19v9M19 23.5h9"/>',
    T:'<rect x="4" y="5" width="24" height="18" rx="2"/><path d="M11 28h10M16 23v5M9 11h14M9 16h9"/>',
    H:'<path d="m16 3 11 5v8c0 7-11 13-11 13S5 23 5 16V8zM10 16l4 4 8-9"/>'
  };
  const weekLabel = a => { const term = TERMS.find(t => a.date >= t.begin && a.date <= t.end); return (term?.name || '') + ' · ' + (termWeekLabel(a) || '未排定週次'); };
  function render(activities, records) {
    const result = YBSXP.journey(activities, records);
    const roundInfo = (a,r) => teacherTarget ? '<br><span class="teacher-round">' + esc(YBSMeTeacher.round(records,a.activity,r.round,activities.find(source => source.week === a.activity)?.openedAt)) + '</span>' : '';
    // UI 所需中繼資料直接由活動登記處補入，不改 XP 核心或雲端格式。
    result.stations = result.stations.map(a => {
      const source = activities.find(source => source.week === a.activity);
      return {...a, topic:source.topic,
        themes:[...new Set((source.codes || []).map(c => /^資([APSDTH])-/.exec(c)?.[1]).filter(Boolean))]};
    });
    confirmed = result;
    const current = result.stations.findLast(a => a.isOpen && a.visited && !a.complete)
      || result.stations.findLast(a => a.isOpen && !a.complete);
    $('current-title').textContent = current?.title || '已完成所有已開放活動';
    $('current-week').textContent = current ? 'W' + String(termWeekOf(current)).padStart(2,'0') : '';
    $('current-description').textContent = current ? '已完成 ' + current.passed + ' / ' + current.rounds.length + ' 關，接著挑戰「' + current.rounds.find(r => !r.passed).name + '」。' : '每走過一站，都算自己的進步。新的活動開放後再來探索。';
    $('continue-action').hidden = !!teacherTarget || !current;
    if (current) { $('remaining').textContent = current.rounds.length-current.passed; $('continue-link').href = '../../' + current.href; }
    else $('continue-link').removeAttribute('href');
    $('level').textContent = result.title;
    $('level-number').textContent = 'Lv ' + result.level;
    $('total').textContent = $('xp-total').textContent = result.totalXP + ' XP';
    $('progress').value = result.progress;
    $('progress').setAttribute('aria-label','Lv ' + result.level + ' 升級進度 ' + Math.round(result.progress * 100) + '%');
    $('next').innerHTML = result.next === null ? '已達最高等級，繼續探索吧！' : '再累積 <b class="mono">' + result.remaining + ' XP</b><br>成為「' + YBSXP.TITLES[result.level] + '」。';
    $('mobile-level').innerHTML = '<b class="mono">Lv ' + result.level + '</b> ' + result.title;
    $('mobile-next').innerHTML = result.next === null ? '已達最高等級' : '差 <b class="mono">' + result.remaining + ' XP</b> 升級';
    $('floor').textContent = result.floor + ' XP'; $('ceiling').textContent = result.next === null ? '最高等級' : result.next + ' XP';
    $('completed').textContent = result.stations.reduce((n,a) => n + a.passed,0);
    $('badge-count').textContent = result.badges.length;
    radar(result);
    const badge = a => '<span class="badges">' + (a.themes.length ? a.themes.map(id => '<span class="badge route-badge theme-' + id + '" aria-label="' + YBSXP.THEMES[id] + '：已獲得徽章"><svg viewBox="0 0 32 32" aria-hidden="true">' + glyphs[id] + '</svg><span>已獲得徽章<small>' + YBSXP.THEMES[id] + '</small></span></span>').join('') : '<span class="badge route-badge">已獲得徽章<small>開學導覽</small></span>') + '</span>';
    const title = a => a.isOpen && !teacherTarget ? '<a href="../../' + esc(a.href) + '">' + esc(a.title) + '</a>' : esc(a.title);
    const stationHTML = (a,i) => '<li class="station ' + (a.complete ? 'complete' : !a.isOpen ? 'locked' : 'current') + (a.visited ? ' visited' : '') + ((i+1)%3===0 ? ' row-end' : '') + '" data-activity="' + a.activity + '" data-state="' + a.state + '"' + (a === current ? ' aria-current="step"' : '') + '><div class="week-line"><i class="route-node" aria-hidden="true">' + (a.complete ? '<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>' : '') + '</i><b class="week-label mono" aria-label="' + esc(weekLabel(a)) + '">W' + String(termWeekOf(a)).padStart(2,'0') + '<span>' + esc(a.date.slice(5).replace('-','.')) + '</span></b><span class="station-state">' + (a.complete ? '已完成' : !a.isOpen ? '待開放' : a === current ? '目前活動' : '探索中') + '</span></div><div class="station-body"><h3>' + title(a) + '</h3><p class="learned"><span class="topic-label">' + (a.complete ? '學會了什麼' : '學習主題') + '</span>' + esc(a.topic) + '</p><div class="station-bottom">' + (a.complete ? badge(a) : a.isOpen && !teacherTarget ? '<a href="../../' + esc(a.href) + '" class="route-continue">繼續挑戰 ↗</a>' : '<span class="muted">' + (a.isOpen ? '唯讀檢視' : '尚未開放') + '</span>') + '<span class="station-count mono">' + a.passed + ' / ' + a.rounds.length + ' 關</span></div></div></li>';
    const timeline = items => '<div class="timeline"><ol class="stations">' + items.map((a,i) => (i > 0 && i%3===0 ? '<li class="row-break" aria-hidden="true">↳ 下一列由左至右</li>' : '') + stationHTML(a,i)).join('') + '</ol></div>';
    const next = result.stations.find(a => !a.isOpen);
    const nextWeek = next && weekLabel(next);
    const shown = result.stations.filter(a => a.visited || a === current || (!a.isOpen && weekLabel(a) === nextWeek));
    const available = result.stations.filter(a => a.isOpen && !shown.includes(a));
    const future = new Map();
    for (const a of result.stations.filter(a => !a.isOpen && !shown.includes(a))) { const week=weekLabel(a); if(!future.has(week))future.set(week,[]); future.get(week).push(a); }
    $('route').innerHTML = timeline(shown)
      + (available.length ? '<details class="available-weeks" id="available-weeks"><summary>已開放、尚未開始 <span>' + available.length + ' 個活動</span></summary><ul>' + available.map(a => '<li data-activity="' + a.activity + '"><span class="mono">W' + String(termWeekOf(a)).padStart(2,'0') + '</span>' + title(a) + '<span class="muted">' + a.rounds.length + ' 關</span></li>').join('') + '</ul></details>' : '')
      + (future.size ? '<details id="future-weeks" class="collapsed-group"><summary>還有 ' + future.size + ' 週待開放</summary>' + [...future].map(([week,items]) => '<section class="route-week"><h3>' + esc(week) + '</h3>' + timeline(items) + '</section>').join('') + '</details>' : '');
    const xpHTML = a => '<details class="xp-item"><summary><span>' + esc(a.title) + '</span><b class="mono">+' + a.totalXP + ' XP</b><span class="expand-icon" aria-hidden="true"></span></summary><dl class="xp-breakdown"><div><dt>首次過關</dt><dd class="mono">' + a.rounds.reduce((n,r) => n+r.passXP,0) + '</dd></div><div><dt>準時加成</dt><dd class="mono">' + a.rounds.reduce((n,r) => n+r.onTimeXP,0) + '</dd></div><div><dt>活動全過</dt><dd class="mono">' + a.completeXP + '</dd></div></dl><ul class="xp-rounds">' + a.rounds.map(r => '<li>' + esc(r.name) + '：' + (r.passed ? '過關 +' + r.passXP + '、準時 +' + r.onTimeXP : '尚未過關 · 0 XP') + roundInfo(a,r) + '</li>').join('') + '</ul></details>';
    const untouched = result.stations.filter(a => a.totalXP === 0);
    $('details').innerHTML = result.stations.filter(a => a.totalXP > 0).map(xpHTML).join('') + (untouched.length ? '<details id="zero-xp" class="collapsed-group"><summary>尚未過關 ' + untouched.length + ' 項</summary>' + untouched.map(xpHTML).join('') + '</details>' : '');
    $('growth').hidden = false;
  }

  async function refresh() {
    if (!owner) return;
    const uid = owner, current = generation, read = ++request;
    const valid = () => generation === current && request === read && (teacherTarget ? teacherAuth?.currentUser?.uid === uid : YBS.profile()?.uid === uid);
    $('status').textContent = teacherTarget ? '正在確認教師權限與該生雲端紀錄…' : '正在確認自己的雲端紀錄…';
    $('retry').hidden = true;
    try {
      const {db,auth} = await (teacherTarget ? YBSMeTeacher.session() : YBS.firebaseSession());
      if (!valid()) return;
      if (auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) throw new Error('auth');
      if (teacherTarget) {
        const [activities, records] = await Promise.all([catalog(), YBSMeTeacher.read(db,auth,teacherTarget,valid)]);
        if (!valid()) return;
        render(activities,records);
        $('status').textContent = '教師唯讀檢視・已確認該生雲端紀錄。各關時間與補做狀態見 XP 明細（開放後超過 7 天為補做）。';
        $('retry').hidden = false;
        return;
      }
      const [activities, snapshot] = await Promise.all([catalog(),
        db.collection('ybsCourses/' + course + '/attempts').where('uid','==',uid).get()]);
      if (!valid()) return;
      if (auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) throw new Error('auth');
      if (snapshot.metadata?.fromCache !== false) throw new Error('cache');
      const records = snapshot.docs.map(d => ({...d.data(),course})).filter(r => r.uid === uid);
      render(activities,records);
      $('status').textContent = '已確認自己的雲端紀錄。';
      $('retry').hidden = false;
    } catch (error) {
      if (!valid()) return;
      if (teacherTarget && ['teacher','permission-denied','missing','duplicate'].includes(error.code)) {
        signedOut();
        $('status').textContent = error.code === 'missing' ? '找不到該班座的學生。' : error.code === 'duplicate' ? '該班座有重複名冊，請先核對。' : '需教師登入：只有此課程擁有者可以檢視該生紀錄。';
        return;
      }
      $('status').textContent = $('growth').hidden ? '雲端紀錄尚未確認，請確認網路後重新讀取。' : '更新尚未完成，目前保留上次已確認的紀錄。';
      $('retry').hidden = false;
    }
  }

  function signedIn(profile) {
    generation++; request++;
    confirmed = null; scope = 'open'; $('xp-details').open = false;
    selectedPanel = 'exploration'; syncTabs();
    owner = profile?.uid || null;
    $('growth').hidden = true;
    $('signin').hidden = !!owner;
    $('logout').hidden = !owner;
    if (owner) void refresh();
  }
  $('retry').onclick = refresh;
  function signedOut() {
    generation++; request++; owner = null; confirmed = null;
    const current = generation;
    $('growth').hidden = true;
    // 換人時清空 DOM，尚未完成的舊請求也不能重新顯示資料。
    for (const id of ['level','level-number','mobile-level','mobile-next','floor','ceiling','total','xp-total','next','completed','radar','axes','route','badge-count','details','current-title','current-week','current-description','remaining','completion-rate','completion-label','completion-detail','chart-note']) $(id).textContent = '';
    $('progress').value = 0; $('progress').setAttribute('aria-label','升級進度'); $('continue-link').removeAttribute('href'); $('xp-details').open = false;
    $('signin').hidden = false; $('logout').hidden = true; $('retry').hidden = true;
    $('status').textContent = '用帳號登入就能累積等級';
    return current;
  }
  $('logout').onclick = () => {
    if (!teacherTarget && typeof ybsLogoutPending === 'function' && ybsLogoutPending($('status'))) return;
    const current = signedOut();
    Promise.resolve(teacherTarget ? teacherAuth?.signOut() : YBS.logout()).catch(() => {
      if (generation === current) $('status').textContent = '登出尚未完成，請重新整理後登入。';
    });
  };
  const today = new Date().toLocaleDateString('sv-SE');
  const term = TERMS.find(t => today >= t.begin && today <= t.end);
  $('term').textContent = term?.name || '115 學年度';
  if (teacherTarget) {
    document.querySelector('h1').textContent = teacherTarget.invalid ? '教師檢視' : '教師檢視：' + teacherTarget.cls + '班' + teacherTarget.seat + '號';
    $('signin-title').textContent = '需教師登入';
    $('signin').querySelector('p').textContent = '請使用此課程擁有者的 Google 帳號登入，唯讀查看指定學生的成長紀錄。';
    const mount = () => {
      const host = $('login');
      if (host && !host.querySelector('[data-teacher-login]')) {
        const button = document.createElement('button');
        button.dataset.teacherLogin = ''; button.textContent = '教師 Google 登入';
        button.disabled = !teacherAuth || teacherTarget.invalid;
        host.replaceChildren(button);
      }
    };
    new MutationObserver(mount).observe($('signin'), {childList:true,subtree:true});
    mount();
    document.addEventListener('click', async event => {
      if (!event.target.closest('[data-teacher-login]') || !teacherAuth) return;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({prompt:'select_account'});
        await teacherAuth.signInWithPopup(provider);
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : '';
        const detail = code ? '（' + code + '）' : '';
        $('status').textContent = ['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(code)
          ? '教師登入已取消' + detail + '，可再次點選登入。'
          : '教師登入未完成' + detail + '，請重試。';
      }
    });
    if (teacherTarget.invalid) { $('status').textContent = '班級或座號參數無效。'; return; }
    $('status').textContent = '需教師登入：請使用此課程擁有者帳號。';
    YBSMeTeacher.session().then(({auth}) => {
      teacherAuth = auth;
      document.querySelectorAll('[data-teacher-login]').forEach(button => { button.disabled = false; });
      auth.onAuthStateChanged(user => {
        signedOut();
        if (user && !user.isAnonymous) {
          owner = user.uid; $('logout').hidden = false; $('signin').hidden = true; void refresh();
        } else $('status').textContent = '需教師登入：請使用此課程擁有者帳號。';
      });
    }).catch(() => { $('status').textContent = '教師登入尚未就緒，請重新整理後重試。'; });
    return;
  }
  // 學生入口才載入原登入模組；教師入口不執行班座重送的初始化副作用。
  const loginScript = document.createElement('script');
  loginScript.src = '../../assets/login.js?v=20261113a';
  loginScript.onload = () => {
    YBS.button($('login'), signedIn, message => { $('status').textContent = message; });
    YBS.status(state => { if (state === 'relogin' && owner) signedOut(); else if (state === 'ok' && owner) void refresh(); });
    if (YBS.profile()?.uid) signedIn(YBS.profile());
  };
  loginScript.onerror = () => { $('status').textContent = '登入元件載入失敗，請重新整理後重試。'; };
  document.head.appendChild(loginScript);
})();
