// 教師唯讀查詢；學生紀錄僅留在記憶體，先驗證課程擁有者再讀名冊。
const YBSMeTeacher = (() => {
  // 教師使用獨立 Firebase App；學生帳號的 LOCAL Auth 與待送佇列不載入、不切換。
  const sdk = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const script = src => new Promise((resolve,reject) => {
    const element = document.createElement('script');
    element.src = sdk + src;
    element.onload = resolve;
    element.onerror = () => reject(new Error('firebase-sdk'));
    document.head.appendChild(element);
  });
  let opening;
  function session() {
    return opening ||= (async () => {
      for (const name of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-firestore-compat.js']) await script(name);
      const app = firebase.apps.find(a => a.name === 'ybs-me-teacher') || firebase.initializeApp({
        apiKey: 'AIzaSyAooTgTdo8xiaFn6Tl2dLHLwFDlyn0frIQ', authDomain:'class-score-86020.firebaseapp.com',
        projectId:'class-score-86020', messagingSenderId:'1078830272862'
      }, 'ybs-me-teacher');
      const auth = app.auth();
      // 同一瀏覽器的教師分頁共用登入，直到登出或清除瀏覽器資料。
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      // 等待 Auth 還原，避免初始 null 回呼蓋掉已存在的教師 LOCAL 狀態。
      if (auth.onAuthStateChanged) await new Promise((resolve,reject) => {
        const unsubscribe = auth.onAuthStateChanged(() => {resolve();Promise.resolve().then(unsubscribe);},reject);
      });
      return {auth,db:app.firestore()};
    })().catch(error => {opening = null;throw error;});
  }
  function target(search) {
    const p = new URLSearchParams(search);
    if (!p.has('cls') && !p.has('seat')) return null;
    return /^[1-9]\d{2}$/.test(p.get('cls')) && /^\d{1,2}$/.test(p.get('seat')) && Number(p.get('seat')) >= 1 && Number(p.get('seat')) <= 60
      && p.getAll('cls').length === 1 && p.getAll('seat').length === 1
      ? {cls:Number(p.get('cls')), seat:Number(p.get('seat'))} : {invalid:true};
  }
  const failure = code => Object.assign(new Error(code), {code});
  async function read(db, auth, person, active) {
    const uid = auth.currentUser?.uid;
    if (!uid || auth.currentUser.isAnonymous) throw failure('teacher');
    const current = () => active() && auth.currentUser?.uid === uid && !auth.currentUser.isAnonymous;
    const course = await db.doc('ybsCourses/115-g9').get({source:'server'});
    if (!current()) throw failure('stale');
    if (!course.exists || course.data().ownerUid !== uid) throw failure('teacher');
    const roster = await db.collection('ybsCourses/115-g9/roster').get({source:'server'});
    if (!current()) throw failure('stale');
    const found = roster.docs.filter(d => Number(d.data().cls) === person.cls && d.data().seat === person.seat);
    if (found.length !== 1) throw failure(found.length ? 'duplicate' : 'missing');
    const email = found[0].id;
    const snapshot = await db.collection('ybsCourses/115-g9/attempts').where('email','==',email).get({source:'server'});
    if (!current()) throw failure('stale');
    if (snapshot.metadata?.fromCache !== false) throw failure('cache');
    return snapshot.docs.filter(d => {
      const r = d.data();
      return r.email === email && typeof r.uid === 'string' && r.uid && d.id === r.uid + '_' + r.activity + '_' + r.round;
    }).map(d => ({...d.data(), course:'115-g9'}));
  }
  const time = value => {
    if (value == null) return NaN;
    const n = typeof value.toMillis === 'function' ? value.toMillis() : typeof value === 'string' ? Date.parse(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : NaN;
  };
  function round(records, activity, index, openedAt) {
    const times = records.filter(r => r.activity === activity && r.round === index).map(r => Number.isFinite(time(r.at)) ? time(r.at) : time(r.passedAt));
    if (!times.length) return '尚未過關';
    const at = times.every(Number.isFinite) ? Math.min(...times) : NaN;
    if (!Number.isFinite(at)) return '過關時間不明・無法判定補做';
    const date = new Date(at).toLocaleString('zh-TW', {timeZone:'Asia/Taipei', hour12:false});
    return date + '（台灣時間）・' + (!Number.isFinite(openedAt) ? '無法判定補做' : at > openedAt + YBSXP.RULES.windowMs ? '補做' : at < openedAt ? '提早完成' : '準時');
  }
  return Object.freeze({target, session, read, round});
})();
