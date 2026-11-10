// 只顯示本人已由伺服器確認的 attempts；此頁不提交作答、不保存 XP。
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const course = '115-g9';
  const labels = {complete:'✓ 全過', 'in-progress':'探索中', available:'已開放', upcoming:'尚未開放'};
  let generation = 0, request = 0, owner = null;
  const mobile = matchMedia('(max-width:640px)');
  const panels = ['exploration','route'];
  let selectedPanel = 'exploration';
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

  function radar(axes) {
    const point = (i, value) => {
      const angle = i * Math.PI / 3 - Math.PI / 2;
      return [180 + Math.cos(angle) * 112 * value, 155 + Math.sin(angle) * 112 * value];
    };
    const polygon = value => axes.map((_, i) => point(i, value).join(',')).join(' ');
    $('radar').innerHTML = '<svg viewBox="0 0 360 320" role="img" aria-labelledby="radar-title radar-desc">'
      + '<title id="radar-title">全學期探索度</title><desc id="radar-desc">六個主題的過關比例，完整數值列於圖下。</desc>'
      + [.25,.5,.75,1].map(v => '<polygon class="grid" points="' + polygon(v) + '"/>').join('')
      + axes.map((_, i) => '<line class="spoke" x1="180" y1="155" x2="' + point(i,1)[0] + '" y2="' + point(i,1)[1] + '"/>').join('')
      + '<polygon class="area" points="' + axes.map((a,i) => point(i,a.value).join(',')).join(' ') + '"/>'
      + axes.map((a,i) => {
        const [x,y] = point(i,1.29), [cx,cy] = point(i,a.value);
        return '<circle r="3" cx="' + cx + '" cy="' + cy + '"/><text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="middle">' + esc(a.name) + '</text>';
      }).join('') + '</svg>';
    const percent = value => Math.round(value * 100) + '%';
    $('axes').innerHTML = axes.map(a => '<li><b>' + esc(a.name) + '</b>'
      + (a.total ? '全學期 ' + a.passed + '/' + a.total + ' 關 · ' + percent(a.value) : '全學期尚無關卡')
      + '<br>' + (a.openTotal ? '已開放 ' + a.openPassed + '/' + a.openTotal + ' 關 · 完成率 ' + percent(a.openValue) : '已開放部分：尚無關卡') + '</li>').join('');
  }

  function render(activities, records) {
    const result = YBSXP.journey(activities, records);
    $('level').textContent = 'Lv ' + result.level + ' ' + result.title;
    $('total').textContent = result.totalXP + ' XP';
    $('progress').value = result.progress;
    $('next').textContent = result.next === null ? '已達最高等級，繼續探索吧！' : '下一級還差 ' + result.remaining + ' XP';
    $('completed').textContent = '已過 ' + result.stations.reduce((n,a) => n + a.passed,0) + ' 關 · 全過 ' + result.badges.length + ' 個活動';
    $('badge-count').textContent = '已獲得 ' + result.badges.length + ' 枚徽章';
    radar(result.exploration);
    const groups = new Map();
    for (const a of result.stations) {
      const term = TERMS.find(t => a.date >= t.begin && a.date <= t.end);
      const week = (term ? term.name + ' · ' : '') + (termWeekLabel(a) || '未排定週次');
      if (!groups.has(week)) groups.set(week,[]);
      groups.get(week).push(a);
    }
    // 路徑全來自本機活動登記處；未開放站點保留進度顯示，不提供活動連結。
    const title = a => a.isOpen ? '<a href="../../' + esc(a.href) + '">' + esc(a.title) + '</a>' : esc(a.title);
    const weeks = [...groups];
    const nextWeek = weeks.findLastIndex(([,items]) => items.some(a => a.isOpen)) + 1;
    const visibleWeeks = [], futureWeeks = [];
    weeks.forEach((week,index) => (week[1].some(a => a.isOpen) || index === nextWeek ? visibleWeeks : futureWeeks).push(week));
    const weekHTML = ([week,items]) => '<div class="route-week"><h3>' + esc(week) + '</h3><ul class="stations">'
      + items.map(a => '<li class="station ' + (a.visited ? 'visited' : '') + '" data-state="' + a.state + '">' + title(a)
        + (a.complete ? '<span class="route-badge"><span aria-hidden="true">✦</span> 已獲得徽章</span>' : '')
        + '<small>' + esc(a.date) + ' · ' + labels[a.state] + ' · ' + a.passed + '/' + a.rounds.length + ' 關</small></li>').join('') + '</ul></div>';
    $('route').innerHTML = visibleWeeks.map(weekHTML).join('') + (futureWeeks.length
      ? '<details id="future-weeks" class="collapsed-group"><summary>還有 ' + futureWeeks.length + ' 週</summary>' + futureWeeks.map(weekHTML).join('') + '</details>' : '');
    const xpHTML = a => '<details class="xp-item"><summary>' + esc(a.title) + ' · <strong>' + a.totalXP + ' XP</strong><br>過關 ' + a.rounds.reduce((n,r) => n+r.passXP,0) + '＋準時 ' + a.rounds.reduce((n,r) => n+r.onTimeXP,0) + '＋全過 ' + a.completeXP + '</summary><ul>'
      + a.rounds.map(r => '<li>' + esc(r.name) + '：' + (r.passed ? '過關 +' + r.passXP + '、準時 +' + r.onTimeXP : '尚未過關 · 0 XP') + '</li>').join('') + '</ul></details>';
    const untouched = result.stations.filter(a => a.totalXP === 0);
    $('details').innerHTML = result.stations.filter(a => a.totalXP > 0).map(xpHTML).join('') + (untouched.length
      ? '<details id="zero-xp" class="collapsed-group"><summary>尚未過關 ' + untouched.length + ' 項</summary>' + untouched.map(xpHTML).join('') + '</details>' : '');
    $('growth').hidden = false;
  }

  async function refresh() {
    if (!owner) return;
    const uid = owner, current = generation, read = ++request;
    const valid = () => generation === current && request === read && YBS.profile()?.uid === uid;
    $('status').textContent = '正在確認自己的雲端紀錄…';
    $('retry').hidden = true;
    try {
      const {db,auth} = await YBS.firebaseSession();
      if (!valid()) return;
      if (auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) throw new Error('auth');
      const [activities, snapshot] = await Promise.all([catalog(),
        db.collection('ybsCourses/' + course + '/attempts').where('uid','==',uid).get()]);
      if (!valid()) return;
      if (auth.currentUser?.uid !== uid || auth.currentUser?.isAnonymous) throw new Error('auth');
      if (snapshot.metadata?.fromCache !== false) throw new Error('cache');
      const records = snapshot.docs.map(d => ({...d.data(),course})).filter(r => r.uid === uid);
      render(activities,records);
      $('status').textContent = '已確認自己的雲端紀錄。';
      $('retry').hidden = false;
    } catch {
      if (!valid()) return;
      $('status').textContent = $('growth').hidden ? '雲端紀錄尚未確認，請確認網路後重新讀取。' : '更新尚未完成，目前保留上次已確認的紀錄。';
      $('retry').hidden = false;
    }
  }

  function signedIn(profile) {
    generation++; request++;
    selectedPanel = 'exploration'; syncTabs();
    owner = profile?.uid || null;
    $('growth').hidden = true;
    $('signin').hidden = !!owner;
    $('logout').hidden = !owner;
    if (owner) void refresh();
  }
  $('retry').onclick = refresh;
  function signedOut() {
    generation++; request++; owner = null;
    const current = generation;
    $('growth').hidden = true;
    // 換人時清空 DOM，尚未完成的舊請求也不能重新顯示資料。
    for (const id of ['level','total','next','completed','radar','axes','route','badge-count','details']) $(id).textContent = '';
    $('progress').value = 0;
    $('signin').hidden = false; $('logout').hidden = true; $('retry').hidden = true;
    $('status').textContent = '用帳號登入就能累積等級';
    return current;
  }
  $('logout').onclick = () => {
    const current = signedOut();
    Promise.resolve(YBS.logout()).catch(() => {
      if (generation === current) $('status').textContent = '登出尚未完成，請重新整理後登入。';
    });
  };
  YBS.button($('login'), signedIn, message => { $('status').textContent = message; });
  YBS.status(state => { if (state === 'relogin' && owner) signedOut(); else if (state === 'ok' && owner) void refresh(); });
  if (YBS.profile()?.uid) signedIn(YBS.profile());
})();
