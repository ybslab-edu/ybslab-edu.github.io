/* 獨立教師報告頁：沿用 YBS Firebase 工作階段，僅 owner 單次讀取。 */
(() => {
  'use strict';
  const el = id => document.getElementById(id), course = '115-g9';
  const activities = ACTIVITIES.filter(a => a.course === course).sort((a,b) => a.date.localeCompare(b.date) || a.week-b.week);
  const items = CURRICULA.find(c => c.id === 'jh').strands.flatMap(s => s.items);
  let auth, db, ready, generation = 0, busy = false, loaded = null, report = null;
  const status = text => { el('report-status').textContent = text; };
  const node = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  const percent = rate => rate === null ? '—' : (rate * 100).toFixed(1) + '%';
  function controls() {
    el('report-login').disabled = busy;
    el('report-read').disabled = busy || !auth?.currentUser || auth.currentUser.isAnonymous;
    el('report-logout').disabled = !auth?.currentUser;
    el('report-export').disabled = !report;
  }
  function clear() {
    loaded = null; report = null;
    el('report-rows').textContent = ''; el('report-summary').textContent = '';
    el('report-class').replaceChildren(node('option', '請先讀取雲端紀錄'));
    el('report-class').disabled = true; controls();
  }
  const error = e => /permission-denied/.test(e?.code || '') ? '無權限：只有此課程的擁有者可以讀取報告。'
    : /popup-closed|cancelled-popup/.test(e?.code || '') ? '登入已取消。'
    : '讀取或登入失敗，請確認網路後重試。';
  async function init() {
    ({auth, db} = await YBS.firebaseSession());
    auth.onAuthStateChanged(user => {
      generation++; clear();
      status(user && !user.isAnonymous ? '教師已登入，請讀取雲端紀錄。' : '請使用 ClassScore 課程擁有者的 Google 帳號登入。');
    });
    controls();
  }
  function render() {
    if (!loaded) return;
    report = YBSCurriculumReport.summarize({...loaded, activities, items, cls:el('report-class').value,
      isOpen:a => isActivityOpen(a, loaded.at)});
    el('report-summary').textContent = '名冊 ' + report.total + ' 人；待核對 ' + report.conflicts + ' 人（保留分母、不計達成）。略過無效名冊 ' + report.invalidRoster
      + ' 筆、格式或名冊不符紀錄 ' + report.skipped + ' 筆。資料時間：' + new Date(loaded.at).toLocaleString('zh-TW') + '。';
    const target = el('report-rows'); target.textContent = '';
    for (const row of report.rows) {
      const tr = node('tr'), title = node('th'); title.scope = 'row';
      title.append(node('div', row.code), node('div', row.text)); tr.appendChild(title);
      const cell = node('td'), list = node('ul');
      if (!row.activities.length) cell.textContent = '未安排活動';
      else {
        for (const a of row.activities) {
          const li = node('li'), link = node('a', a.title); link.href = '/' + a.href;
          li.append(link, node('small', (a.open ? '已開放' : '未開放') + ' · ' + (a.open ? a.passed + '/' + a.total + ' 人 · ' : '') + percent(a.rate)));
          list.appendChild(li);
        }
        cell.appendChild(list);
      }
      tr.appendChild(cell);
      const rate = node('td', percent(row.rate));
      rate.appendChild(node('small', row.rate === null ? (row.openCount ? '無有效名冊' : '無已開放活動') : row.passed + '/' + row.total + ' 人'));
      tr.appendChild(rate); target.appendChild(tr);
    }
    controls();
  }
  el('report-login').onclick = async () => {
    try {
      ready ||= init().catch(e => { ready = null; throw e; }); await ready;
      const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
      await auth.signInWithPopup(provider);
    } catch (e) { status(error(e)); }
  };
  el('report-read').onclick = async () => {
    if (busy || !auth?.currentUser || auth.currentUser.isAnonymous) return;
    busy = true; clear(); status('讀取名冊與登入學生過關紀錄中…');
    const token = ++generation, uid = auth.currentUser.uid;
    const active = () => token === generation && auth.currentUser?.uid === uid && !auth.currentUser.isAnonymous;
    try {
      const owner = await db.doc('ybsCourses/' + course).get({source:'server'});
      if (!active()) return;
      if (!owner.exists || owner.data().ownerUid !== uid) throw Object.assign(new Error('owner only'), {code:'permission-denied'});
      const [roster, attempts] = await Promise.all(['roster','attempts'].map(name => db.collection('ybsCourses/' + course + '/' + name).get({source:'server'})));
      if (!active()) return;
      loaded = {roster:roster.docs.map(d => ({...d.data(), email:d.id})), attempts:attempts.docs.map(d => {
        const data = d.data(); return {...data, id:d.id, passedAt:data.passedAt?.toMillis?.()};
      }), at:Date.now()};
      const all = YBSCurriculumReport.summarize({...loaded, activities, items, isOpen:a => isActivityOpen(a, loaded.at)});
      const select = el('report-class'); select.replaceChildren();
      const option = (value, text) => { const n = node('option', text); n.value = value; select.appendChild(n); };
      option('', '全部班級'); for (const cls of all.classes) option(String(cls), cls + ' 班');
      select.disabled = false; render(); status('已讀取；班級篩選與 Excel 均使用這次資料快照。');
    } catch (e) { if (active()) { clear(); status(error(e)); } }
    finally { busy = false; controls(); }
  };
  el('report-class').onchange = render;
  el('report-logout').onclick = async () => {
    generation++; clear(); status('正在登出…');
    YBS.endBrowserSession?.();
    try { await auth?.signOut(); status('已登出，報告已清除。'); }
    catch { status('登出未完成，報告已清除；請重試。'); }
  };
  el('report-export').onclick = () => {
    if (!report || !loaded) return;
    try {
      const label = el('report-class').value || '全部班級';
      const rows = YBSCurriculumReport.exportRows(report, label, new Date(loaded.at).toISOString());
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      for (let r = 2; r <= rows.length; r++) for (const col of ['G','L']) if (sheet[col+r]) sheet[col+r].z = '0.0%';
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '課綱達成報告');
      const bytes = XLSX.write(book, {bookType:'xlsx',type:'array'});
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link = node('a'); link.href = url; link.download = '課綱達成報告_115-g9_' + label + '.xlsx';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      status('已匯出目前班級篩選的課綱達成報告。');
    } catch { status('Excel 匯出失敗，請重新整理後重試。'); }
  };
  const unlockStatus = () => { el('unlock-status').textContent = TEACHER.remembered() ? '本分頁教師模式已解鎖。' : '可使用既有教師通行碼解鎖活動；雲端報告請以 Google 登入。'; };
  el('report-unlock').onclick = async () => {
    const code = prompt('教師通行碼'); if (code === null) return;
    if (await TEACHER.check(code)) { TEACHER.remember(true); unlockStatus(); }
    else el('unlock-status').textContent = '通行碼不對。';
  };
  unlockStatus(); controls();
})();
