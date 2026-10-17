// 學生以學校 Google 帳號登入，每過一關寫一筆紀錄到 ClassScore 的 Firebase（class-score-86020）。
// 資料結構與權限見 class-score repo 的 docs/YBS_FIRESTORE.md：學生只能新增自己的紀錄、一關一筆、不能改刪。
// on 為 false 或該課程沒有對應的 courseId 時不啟用：活動頁維持「班級座號＋成績碼」。
// 用戶端 ID、專案 ID 都不是密碼，放在公開網站沒有關係。
const YBS = (() => {
  const CONFIG = {
    on: false,                                    // 試點時改 true（Rules 部署、名單建好之後）
    clientId: '1078830272862-u8oeft1u88aommaj3710hi7q3m2hcq6h.apps.googleusercontent.com',
    project: 'class-score-86020',
    sdk: '10.14.1',
    domain: 'cgjh.hcc.edu.tw',
    courses: { '115-g9': '115-g9' }               // 網站課程代號 → Firestore ybsCourses 文件 ID
  };
  const courseCode = (location.pathname.split('/').filter(Boolean)[0] || '');
  const courseId = () => CONFIG.courses[courseCode] || null;
  const enabled = () => !!(CONFIG.on && CONFIG.clientId && courseId());

  let fb = null, profile = null, onLogin = null, onError = null, onStatus = () => {}, gisReady = false;
  const decode = jwt => {
    const b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - b.length % 4) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  };
  const loadScript = src => new Promise((ok, no) => {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = ok; s.onerror = () => no(new Error('無法載入登入元件，請確認網路連線。'));
    document.head.appendChild(s);
  });

  async function initFirebase() {
    if (fb) return fb;
    const base = 'https://www.gstatic.com/firebasejs/' + CONFIG.sdk;
    await loadScript(base + '/firebase-app-compat.js');
    await loadScript(base + '/firebase-auth-compat.js');
    await loadScript(base + '/firebase-firestore-compat.js');
    const r = await fetch('https://' + CONFIG.project + '.web.app/__/firebase/init.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('無法取得登入設定，請稍後再試。');
    const c = await r.json();
    const app = firebase.apps.find(a => a.name === 'ybs') || firebase.initializeApp({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId }, 'ybs');
    const auth = app.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);   // 關掉分頁就登出：電腦教室是共用機
    fb = { app, auth, db: app.firestore() };
    return fb;
  }
  async function initGis() {
    if (!(window.google && google.accounts && google.accounts.id)) await loadScript('https://accounts.google.com/gsi/client');
    if (gisReady) return;
    google.accounts.id.initialize({ client_id: CONFIG.clientId, hd: CONFIG.domain, callback: onCredential, auto_select: false, cancel_on_tap_outside: false });
    gisReady = true;
  }
  async function onCredential(r) {
    let p;
    try { p = decode(r.credential); } catch (e) { onError && onError('登入失敗，請再試一次。'); return; }
    if (p.hd !== CONFIG.domain) { onError && onError('請改用學校帳號（@' + CONFIG.domain + '）登入。'); return; }
    try {
      const { auth } = await initFirebase();
      const cred = await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(r.credential));
      profile = { email: String(cred.user.email || '').toLowerCase(), uid: cred.user.uid };
    } catch (e) { onError && onError('登入沒有完成（' + (e && e.code || '連線問題') + '），請再試一次或告訴老師。'); return; }
    onLogin && onLogin(profile);
    flush();
  }
  // 在 el 放一顆「使用 Google 帳戶登入」按鈕；登入成功呼叫 ok(profile)，失敗呼叫 bad(訊息)
  async function button(el, ok, bad) {
    onLogin = ok; onError = bad;
    try { await initGis(); } catch (e) { bad && bad(e.message); return; }
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW', width: 260 });
  }

  // 名單：ybsCourses/{courseId}/roster/{email}；回傳 { ok, student:{cls,seat} } 或 { ok:false, error }
  async function whoami() {
    if (!enabled() || !profile) return { ok: false, error: 'auth' };
    try {
      const d = await fb.db.doc('ybsCourses/' + courseId() + '/roster/' + profile.email).get();
      if (!d.exists) return { ok: false, error: 'not-listed' };
      const v = d.data(); return { ok: true, student: { cls: v.cls, seat: v.seat } };
    } catch (e) {
      return { ok: false, error: e && e.code === 'permission-denied' ? 'not-listed' : 'network' };
    }
  }

  // 待送佇列只放在這個分頁（sessionStorage），不把帳號留在共用電腦上
  const QKEY = 'ybslab:fq';
  const getQ = () => { try { return JSON.parse(sessionStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } };
  const setQ = a => { try { sessionStorage.setItem(QKEY, JSON.stringify(a)); } catch (e) {} };
  const docId = x => profile.uid + '_' + x.activity + '_' + x.round;
  let busy = false;
  async function flush() {
    if (!enabled() || !profile || busy) return;
    const mine = getQ().filter(x => x.uid === profile.uid);
    if (!mine.length) { onStatus('ok'); return; }
    if (!fb.auth.currentUser) { onStatus('relogin'); return; }
    busy = true; onStatus('sending');
    const left = [];
    for (const x of mine) {
      const ref = fb.db.doc('ybsCourses/' + courseId() + '/attempts/' + docId(x));
      const data = { uid: profile.uid, email: profile.email, activity: x.activity, round: x.round, level: x.level, tries: x.tries, passedAt: firebase.firestore.FieldValue.serverTimestamp(), app: 'ybs' };
      if (x.termWeek) data.termWeek = x.termWeek;
      try { await ref.set(data); }
      catch (e) {
        // 一關只能有一筆：已經有紀錄（例如重做同一關）就算完成
        let done = false;
        if (e && e.code === 'permission-denied') { try { done = (await ref.get()).exists; } catch (e2) {} }
        if (!done) left.push(x);
      }
    }
    setQ(getQ().filter(x => x.uid !== profile.uid || left.some(l => l.key === x.key)));
    busy = false;
    onStatus(left.length ? 'pending' : 'ok');
  }
  const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  function submit(item) {
    if (!enabled() || !profile) return;
    const x = {
      uid: profile.uid, activity: int(item.activity, 1, 99), round: int(item.round, 0, 5),
      level: item.level === '進階' || item.level === 2 ? 2 : 1, tries: int(item.tries, 1, 999),
      termWeek: item.termWeek ? int(item.termWeek, 1, 30) : 0
    };
    x.key = x.activity + '_' + x.round;
    const q = getQ().filter(y => !(y.uid === x.uid && y.key === x.key));
    q.push(x); setQ(q);
    return flush();
  }
  function logout() {
    profile = null;
    try { if (fb) fb.auth.signOut(); } catch (e) {}
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
  }
  // 舊版（Apps Script）曾把帳號存在 localStorage：清掉
  try { Object.keys(localStorage).filter(k => k.indexOf('ybslab:me:') === 0 || k === 'ybslab:queue').forEach(k => localStorage.removeItem(k)); } catch (e) {}
  setInterval(() => { if (profile) flush(); }, 60000);
  window.addEventListener('online', () => { if (profile) flush(); });
  return { CONFIG, enabled, button, submit, flush, logout, whoami, profile: () => profile, status: f => { onStatus = f; } };
})();
