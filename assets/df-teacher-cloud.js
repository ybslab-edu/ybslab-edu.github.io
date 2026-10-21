/* 老師雲端報告：只使用單次伺服器查詢，不啟用持久化或即時監聽。 */
'use strict';
window.DFTeacherCloud = function ({ ingest, reset, render }) {
  const el = id => document.getElementById(id);
  const courseId = '115-df';
  let auth, db, owner = null, generation = 0, busy = false, ready;
  const session = () => Number(el('cloud-session').value);
  const message = text => { el('cloud-status').textContent = text; };
  function controls() {
    el('cloud-login').disabled = busy;
    el('cloud-logout').disabled = !auth?.currentUser;
    for (const id of ['cloud-read', 'cloud-delete']) el(id).disabled = busy || !owner;
  }
  function clear() { reset(); el('cloud-roster').textContent = ''; }
  function error(e) {
    return /permission-denied/.test(e?.code || '') ? '無權限：僅課程 owner 本人可以讀取或刪除。'
      : /popup-closed|cancelled-popup/.test(e?.code || '') ? '登入已取消。'
      : '雲端操作失敗，請確認網路後手動重試。';
  }
  async function checkOwner() {
    const user = auth.currentUser;
    if (!user) throw { code: 'permission-denied' };
    const course = await db.doc('ybsCourses/' + courseId).get({ source: 'server' });
    if (!course.exists || course.data().ownerUid !== user.uid || auth.currentUser?.uid !== user.uid) {
      throw { code: 'permission-denied' };
    }
    return user.uid;
  }
  function active(token, uid, n) {
    return generation === token && auth.currentUser?.uid === uid && session() === n;
  }
  function query(n) {
    return db.collection('ybsCourses/' + courseId + '/reports').where('session', '==', n).get({ source: 'server' });
  }
  function identity(d, id, n) {
    if (typeof d.uid !== 'string' || !d.uid || id !== d.uid + '_s' + n || d.session !== n
        || !Number.isInteger(d.cls) || d.cls < 100 || d.cls > 999
        || !Number.isInteger(d.seat) || d.seat < 1 || d.seat > 60
        || typeof d.updatedAt?.toDate !== 'function') throw new Error('交件身分或時間格式不正確');
    const date = d.updatedAt.toDate();
    if (!Number.isFinite(date.getTime())) throw new Error('交件時間格式不正確');
    return date.toISOString();
  }
  async function read() {
    if (busy || !owner) return;
    busy = true; controls(); clear(); message('讀取雲端報告中…');
    const token = ++generation, n = session(), uid = owner;
    try {
      await checkOwner();
      if (!active(token, uid, n)) return;
      const [reports, roster] = await Promise.all([
        query(n), db.collection('ybsCourses/' + courseId + '/roster').get({ source: 'server' })
      ]);
      if (!active(token, uid, n)) return;
      const counts = new Map(), failed = [];
      let good = 0;
      for (const doc of reports.docs) {
        try {
          const envelope = doc.data(), at = identity(envelope, doc.id, n);
          const d = await DFReport.decode(envelope);
          if (!active(token, uid, n)) return;
          ingest(d, { source: '雲端', uid: envelope.uid, session: n, cls: envelope.cls, seat: envelope.seat, at });
          const k = envelope.cls + '-' + envelope.seat;
          counts.set(k, (counts.get(k) || 0) + 1); good++;
        } catch (e) { failed.push(doc.id + '：' + (e.message || '解碼失敗')); }
      }
      if (!active(token, uid, n)) return;
      const missing = [], conflicts = [];
      for (const doc of roster.docs) {
        const d = doc.data(), k = d.cls + '-' + d.seat, count = counts.get(k) || 0;
        if (!count) missing.push(k);
      }
      for (const [k, count] of counts) if (count > 1) conflicts.push(k);
      el('cloud-roster').textContent = '未交（含無法解碼）：' + ([...new Set(missing)].sort().join('、') || '無')
        + '；重複班座待查：' + (conflicts.sort().join('、') || '無');
      message(`第 ${n} 堂：已讀取 ${good} 份雲端報告，略過 ${failed.length} 份。` + (failed.length ? ' ' + failed.join('；') : ''));
      render();
    } catch (e) { if (generation === token) { clear(); message(error(e)); } }
    finally { busy = false; controls(); }
  }
  async function remove() {
    if (busy || !owner) return;
    busy = true; controls();
    const token = ++generation, n = session(), uid = owner;
    let deleted = 0;
    try {
      await checkOwner();
      if (!active(token, uid, n)) return;
      const snapshot = await query(n);
      if (!active(token, uid, n)) return;
      const total = snapshot.docs.length;
      message(`課程 ${courseId}，第 ${n} 堂，共 ${total} 份雲端報告。`);
      if (!total || !window.confirm(`課程 ${courseId}，第 ${n} 堂，共 ${total} 份雲端報告。確定永久刪除？`)) return;
      await checkOwner();
      for (let i = 0; i < total; i += 400) {
        if (!active(token, uid, n)) return;
        const batch = db.batch(), chunk = snapshot.docs.slice(i, i + 400);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit(); deleted += chunk.length;
      }
      if (active(token, uid, n)) { clear(); message(`第 ${n} 堂：已刪除 ${deleted} 份雲端報告。請手動更新未交名單。`); }
    } catch (e) {
      if (generation === token) { clear(); message(`已刪除 ${deleted} 份。` + error(e) + ' 可重新操作刪除剩餘報告。'); }
    } finally { busy = false; controls(); }
  }
  function script(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.append(s);
    });
  }
  async function init() {
    const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
    await script(base + 'firebase-app-compat.js');
    await script(base + 'firebase-auth-compat.js');
    await script(base + 'firebase-firestore-compat.js');
    const app = firebase.apps.find(a => a.name === 'df-teacher') || firebase.initializeApp({
      apiKey: 'AIzaSyAooTgTdo8xiaFn6Tl2dLHLwFDlyn0frIQ', authDomain: 'class-score-86020.firebaseapp.com',
      projectId: 'class-score-86020', messagingSenderId: '1078830272862'
    }, 'df-teacher');
    auth = app.auth(); db = app.firestore();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    auth.onAuthStateChanged(async user => {
      const token = ++generation; owner = null; clear(); controls();
      if (!user) { message('請使用 ClassScore 課程老師的 Google 帳號登入。'); return; }
      message('核對課程 owner 中…');
      try {
        const uid = await checkOwner();
        if (generation !== token) return;
        owner = uid; message('教師已登入，請選擇堂次並讀取雲端報告。');
      } catch (e) { if (generation === token) message(error(e)); }
      controls();
    });
  }
  el('cloud-login').onclick = async () => {
    try {
      ready ||= init().catch(e => { ready = null; throw e; });
      await ready;
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
    } catch (e) { message(error(e)); }
  };
  el('cloud-logout').onclick = async () => {
    generation++; owner = null; clear(); controls(); message('已清除畫面，正在登出…');
    try { await auth.signOut(); message('已登出，記憶體報告已清除。'); }
    catch (e) { message('登出未完成，請重試登出。'); }
    controls();
  };
  el('cloud-session').onchange = () => { generation++; clear(); message('堂次已切換，請手動讀取雲端報告。'); };
  el('cloud-read').onclick = read;
  el('cloud-delete').onclick = remove;
  controls();
};
