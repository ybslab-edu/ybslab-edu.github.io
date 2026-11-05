/* 教師雲端成績：單次伺服器查詢，僅 owner 可讀；不寫入、刪除或持久化教師資料。 */
'use strict';
window.YBSGuestTeacher = function ({course, activities, saveBook}) {
  const el = id => document.getElementById(id);
  let auth, db, ready, generation = 0, busy = false, rows = [];
  const message = text => { el('cloud-status').textContent = text; };
  function controls() {
    el('cloud-login').disabled = busy;
    el('cloud-read').disabled = busy || !auth?.currentUser || auth.currentUser.isAnonymous;
    el('cloud-logout').disabled = !auth?.currentUser;
    el('cloud-export').disabled = !rows.length;
  }
  function clear() { rows = []; el('cloud-table').textContent = ''; controls(); }
  function error(e) {
    return /permission-denied/.test(e?.code || '') ? '無權限：只有此課程的擁有者可以讀取雲端成績。'
      : /popup-closed|cancelled-popup/.test(e?.code || '') ? '登入已取消。'
      : '雲端讀取失敗，請確認網路後重試。';
  }
  async function init() {
    ({auth, db} = await YBS.firebaseSession());
    auth.onAuthStateChanged(user => {
      generation++; clear();
      message(user && !user.isAnonymous ? '教師已登入，請讀取雲端紀錄。' : '請使用 ClassScore 課程擁有者的 Google 帳號登入。');
    });
    controls();
  }
  async function read() {
    if (busy || !auth?.currentUser) return;
    busy = true; clear(); message('讀取帳號與班座紀錄中…');
    const token = ++generation, uid = auth.currentUser.uid;
    const active = () => generation === token && auth.currentUser?.uid === uid;
    try {
      const doc = await db.doc('ybsCourses/' + course).get({source:'server'});
      if (!active()) return;
      if (!doc.exists || doc.data().ownerUid !== uid || auth.currentUser.isAnonymous) {
        throw Object.assign(new Error('owner only'), {code:'permission-denied'});
      }
      const [attempts, guests, roster] = await Promise.all(['attempts', 'guestAttempts', 'roster'].map(name =>
        db.collection('ybsCourses/' + course + '/' + name).get({source:'server'})));
      if (!active()) return;
      const listed = new Map(roster.docs.map(d => [d.id, d.data()]));
      const grouped = new Map(); let skipped = 0;
      const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      for (const [snapshot, guest] of [[attempts, false], [guests, true]]) for (const doc of snapshot.docs) {
        const d = doc.data(), n = activities[d.activity]?.rounds?.length;
        const match = doc.id.match(/^(.+)_(\d+)_(\d+)$/), id = match?.[1];
        const person = guest ? d : listed.get(d.email);
        const cls = guest ? (/^[1-9]\d{2}$/.test(d.cls) && typeof d.cls === 'string' ? Number(d.cls) : NaN) : person?.cls;
        const seat = person?.seat, at = d.passedAt?.toMillis?.();
        if (!integer(d.activity, 1, guest ? 31 : 99) || !integer(d.round, 0, 5) || !n || d.round >= n
            || !integer(d.level, 1, 2) || !integer(d.tries, 1, 999)
            || !integer(cls, 100, 999) || !integer(seat, 1, 60) || !Number.isFinite(at) || at <= 0
            || !id || id.length > 128 || doc.id !== id + '_' + d.activity + '_' + d.round
            || (guest ? d.verified !== false : d.uid !== id)) { skipped++; continue; }
        // 不同來源與 UID 分列；同班座多個匿名 UID 不自動算作同一人。
        const key = JSON.stringify([guest, id, d.activity, cls, seat]);
        let row = grouped.get(key);
        if (!row) { row = {cls, seat, activity:d.activity, uid:id, source:guest ? '未驗證' : '帳號名單', mask:0, tries:Array(n).fill(0), at:0}; grouped.set(key, row); }
        row.mask |= 1 << d.round; row.tries[d.round] = d.tries; row.at = Math.max(row.at, at);
      }
      rows = [...grouped.values()].sort((a,b) => a.cls-b.cls || a.seat-b.seat || a.activity-b.activity || a.source.localeCompare(b.source) || a.uid.localeCompare(b.uid));
      render(); message('已讀取 ' + rows.length + ' 列；略過 ' + skipped + ' 筆格式或名單不符紀錄。班座來源「未驗證」，重複班座請核對，未併入成績碼總表。');
    } catch (e) { if (active()) { clear(); message(error(e)); } }
    finally { busy = false; controls(); }
  }
  const headers = ['班級','座號','活動序號','活動','來源','UID','過關數','關卡數','各關嘗試次數','最後上傳'];
  const count = mask => { let n=0; while(mask){n+=mask&1;mask>>>=1;} return n; };
  const values = r => [r.cls,r.seat,r.activity,activities[r.activity].title,r.source,r.uid,count(r.mask),r.tries.length,r.tries.join(' / '),new Date(r.at)];
  function render() {
    el('cloud-table').textContent = '';
    const table = document.createElement('table'), head = document.createElement('tr');
    for (const title of headers) { const th = document.createElement('th'); th.textContent=title; head.appendChild(th); }
    const thead=document.createElement('thead');thead.appendChild(head);table.appendChild(thead);
    const tbody=document.createElement('tbody');
    for(const row of rows){const tr=document.createElement('tr');for(const v of values(row)){const td=document.createElement('td');td.textContent=v instanceof Date?v.toLocaleString('zh-TW'):String(v);tr.appendChild(td);}tbody.appendChild(tr);}
    table.appendChild(tbody);el('cloud-table').appendChild(table);
  }
  el('cloud-login').onclick = async () => {
    try {
      ready ||= init().catch(e => { ready=null; throw e; }); await ready;
      const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
      await auth.signInWithPopup(provider);
    } catch (e) { message(error(e)); }
  };
  el('cloud-read').onclick = read;
  el('cloud-logout').onclick = async () => {
    generation++; clear(); message('正在登出…');
    try { if(auth) await auth.signOut(); message('已登出，雲端成績已清除。'); }
    catch(e){message('登出未完成，雲端成績已清除；請重試。');}
  };
  el('cloud-export').onclick = () => {
    if(!rows.length)return;
    const sheet=XLSX.utils.aoa_to_sheet([headers,...rows.map(values)],{cellDates:true,dateNF:'yyyy/mm/dd hh:mm'});
    saveBook('資訊科技_雲端紀錄_'+course+'.xlsx',[['帳號與未驗證班座',sheet]]);
  };
  controls();
};
