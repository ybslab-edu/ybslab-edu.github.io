// 學生用帳號密碼登入（cgjh學號／cgjh身分證字號），每過一關寫一筆紀錄到 ClassScore 的 Firebase（class-score-86020）。
// 資料結構與權限見 class-score repo 的 docs/YBS_FIRESTORE.md：學生只能新增自己的紀錄、一關一筆、不能改刪。
// on 為 false 或該課程沒有對應的 courseId 時不啟用：活動頁維持「班級座號＋成績碼」。
// 專案 ID、網頁金鑰都是公開識別碼，不是密碼，放在公開網站沒有關係。
const YBS = (() => {
  const CONFIG = {
    on: true,                                     // false：關閉登入，活動頁只用「班級座號＋成績碼」
    project: 'class-score-86020',
    apiKey: 'AIzaSyAooTgTdo8xiaFn6Tl2dLHLwFDlyn0frIQ',   // Firebase 網頁金鑰是公開識別碼，不是密碼
    sender: '1078830272862',
    sdk: '10.14.1',
    domain: 'cgjh.hcc.edu.tw',                    // 名單上的學校信箱網域
    courses: { '115-g9': '115-g9', '115-df': '115-df' }   // 網站課程代號 → Firestore ybsCourses 文件 ID
  };
  const courseCode = (location.pathname.split('/').filter(Boolean)[0] || '');
  const courseId = () => CONFIG.courses[courseCode] || null;
  const enabled = () => !!(CONFIG.on && courseId());

  let fb = null, profile = null, onLogin = null, onError = null, onStatus = () => {};
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
    // 設定直接寫在這裡：ClassScore 的 init.json 不允許跨站讀取（CORS）
    const app = firebase.apps.find(a => a.name === 'ybs') || firebase.initializeApp({ apiKey: CONFIG.apiKey, authDomain: CONFIG.project + '.firebaseapp.com', projectId: CONFIG.project, messagingSenderId: CONFIG.sender }, 'ybs');
    const auth = app.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);   // 關掉分頁就登出：電腦教室是共用機
    fb = { app, auth, db: app.firestore() };
    return fb;
  }
  // 帳號密碼登入：帳號 cgjh＋學號、密碼 cgjh＋身分證字號（老師在 ClassScore「YBS Lab 連線」第 7 區建立）。
  // 登入用的信箱是 cgjh學號@ybslab-edu.github.io（不寄信，只是識別），對應到名單上的學校信箱 cgjh學號@cgjh.hcc.edu.tw。
  const ACCT_DOMAIN = 'ybslab-edu.github.io';
  const normAccount = v => { const t = String(v || '').trim().toLowerCase().replace(/@.*$/, '').replace(/\s+/g, ''); return /^\d{3,12}$/.test(t) ? 'cgjh' + t : t; };
  const normPassword = v => { const t = String(v || '').trim(); const m = t.match(/^cgjh([a-z][0-9a-d]\d{8})$/i); return m ? 'cgjh' + m[1].toUpperCase() : t; };
  async function signIn(account, password) {
    const acct = normAccount(account);
    if (!/^cgjh\d{3,12}$/.test(acct)) throw { msg: '帳號是 cgjh 加學號，例如 cgjh1100123。' };
    if (!password) throw { msg: '請輸入密碼。' };
    const { auth } = await initFirebase();
    let cred;
    try { cred = await auth.signInWithEmailAndPassword(acct + '@' + ACCT_DOMAIN, normPassword(password)); }
    catch (e) {
      const c = e && e.code || '';
      if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) throw { msg: '帳號或密碼不對。密碼是 cgjh 加身分證字號；還是不行請告訴老師。' };
      if (/too-many-requests/.test(c)) throw { msg: '嘗試太多次，請等幾分鐘再試，或告訴老師。' };
      if (/network/.test(c)) throw { msg: '連不上網路，請確認網路後再試。' };
      throw { msg: '登入沒有完成（' + (c || '連線問題') + '），請再試一次或告訴老師。' };
    }
    profile = { email: acct + '@' + CONFIG.domain, account: acct, uid: cred.user.uid };
    return profile;
  }
  // 在 el 放「帳號、密碼、登入」表單；登入成功呼叫 ok(profile)，失敗呼叫 bad(訊息)
  async function button(el, ok, bad) {
    onLogin = ok; onError = bad;
    const id = 'ybs' + Math.random().toString(36).slice(2, 7);
    const box = 'display:block;width:100%;box-sizing:border-box;font:inherit;font-size:18px;padding:10px 12px;border-radius:10px;border:1px solid #4b5563;background:#0f1218;color:#e8eaee';
    el.innerHTML = '<form id="' + id + '" autocomplete="off" style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:320px;margin:0 auto;text-align:left">'
      + '<label style="font-size:15px">帳號<input name="a" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="cgjh＋學號" style="' + box + '"></label>'
      + '<label style="font-size:15px">密碼<input name="p" type="password" autocapitalize="off" spellcheck="false" placeholder="cgjh＋身分證字號" style="' + box + '"></label>'
      + '<button type="submit" class="btn primary" style="width:100%">登入</button></form>';
    const f = document.getElementById(id), btn = f.querySelector('button');
    f.onsubmit = async ev => {
      ev.preventDefault(); if (btn.disabled) return;
      btn.disabled = true; btn.textContent = '登入中…';
      try { const p = await signIn(f.a.value, f.p.value); f.p.value = ''; onLogin && onLogin(p); flush(); }
      catch (e) { f.p.value = ''; onError && onError(e && e.msg || '登入失敗，請再試一次。'); }
      finally { btn.disabled = false; btn.textContent = '登入'; }
    };
    setTimeout(() => { try { f.a.focus(); } catch (e) {} }, 0);
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
  // 首次讀取後以分頁記憶體為準；儲存空間受限時也不會丟掉待送紀錄。
  let queue = null;
  const queueInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const validQueueItem = x => x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.uid === 'string' && x.uid.length > 0 && x.uid.length <= 128 && !x.uid.includes('/')
    && queueInt(x.activity, 1, 99) && queueInt(x.round, 0, 5)
    && (x.level === 1 || x.level === 2) && queueInt(x.tries, 1, 999)
    && (x.termWeek === undefined || queueInt(x.termWeek, 0, 30))
    && (x.key === undefined || x.key === x.activity + '_' + x.round);
  const getQ = () => {
    if (queue === null) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(QKEY) || '[]');
        queue = Array.isArray(stored) ? stored.filter(validQueueItem).map(x => ({
          ...x, key: x.activity + '_' + x.round
        })) : [];
      }
      catch (e) { queue = []; }
    }
    return queue;
  };
  const setQ = a => {
    queue = a;
    try { sessionStorage.setItem(QKEY, JSON.stringify(a)); } catch (e) {}
  };
  let busy = false;
  async function flush() {
    if (!enabled() || !profile || busy) return;
    if (!getQ().some(x => x.uid === profile.uid)) { onStatus('ok'); return; }
    if (!fb.auth.currentUser || fb.auth.currentUser.uid !== profile.uid) { onStatus('relogin'); return; }
    busy = true;
    // 每筆在本次 flush 最多嘗試一次；失敗留給 60 秒／online 重試。
    const attempted = new Set();
    try {
      onStatus('sending');
      while (enabled() && profile) {
        const me = profile;
        if (!fb.auth.currentUser || fb.auth.currentUser.uid !== me.uid) break;
        const x = getQ().find(x => x.uid === me.uid && !attempted.has(x));
        if (!x) break;
        attempted.add(x);
        let ref, done = false;
        try {
          ref = fb.db.doc('ybsCourses/' + courseId() + '/attempts/' + me.uid + '_' + x.activity + '_' + x.round);
          const data = { uid: me.uid, email: me.email, activity: x.activity, round: x.round, level: x.level, tries: x.tries, passedAt: firebase.firestore.FieldValue.serverTimestamp(), app: 'ybs' };
          if (x.termWeek) data.termWeek = x.termWeek;
          await ref.set(data);
          done = true;
        } catch (e) {
          // 一關只能有一筆：已經有紀錄（例如重做同一關）就算完成
          if (ref && e && e.code === 'permission-denied') { try { done = (await ref.get()).exists; } catch (e2) {} }
        }
        // 只刪除實際完成的物件，保留途中新增（包含同關重新提交）的項目。
        if (done) setQ(getQ().filter(y => y !== x));
      }
    } finally {
      busy = false;
      if (profile) {
        const pending = getQ().some(x => x.uid === profile.uid);
        onStatus(pending ? (!fb.auth.currentUser || fb.auth.currentUser.uid !== profile.uid ? 'relogin' : 'pending') : 'ok');
      }
    }
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
  }
  // 舊版（Apps Script）曾把帳號存在 localStorage：清掉
  try { Object.keys(localStorage).filter(k => k.indexOf('ybslab:me:') === 0 || k === 'ybslab:queue').forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('ybslab:login'); } catch (e) {}
  setInterval(() => { if (profile) flush(); }, 60000);
  window.addEventListener('online', () => { if (profile) flush(); });

  // DF 報告專用 API：不公開 db，也不沿用 attempts 的佇列或「已存在就成功」判斷。
  let reportAuthObserved = false, reportAuthUid = null, reportAuthGeneration = 0;
  async function submitReport(session, encoded) {
    const fail = (code, message, extra) => Object.assign(new Error(message), {code}, extra);
    if (!enabled() || courseId() !== '115-df') throw fail('report/course', '此課程不開放報告交件');
    if (!Number.isInteger(session) || session < 1 || session > 3) throw fail('report/session', '堂次不正確');
    if (!profile || !fb || !fb.auth.currentUser || fb.auth.currentUser.uid !== profile.uid) {
      throw fail('report/auth', '請先登入並確認班級座號');
    }
    if (!encoded || encoded.schemaVersion !== 1 || !['ascii-json','gzip-base64'].includes(encoded.encoding)
        || typeof encoded.payload !== 'string' || !encoded.payload.length || /[^\x20-\x7e]/.test(encoded.payload)) {
      throw fail('report/format', '報告格式不正確，請下載報告檔交給老師');
    }
    if (encoded.payload.length > 524288) throw fail('report/too-large', '報告過大，請下載報告檔交給老師');
    const me = {...profile}, db = fb.db, auth = fb.auth;
    const packet = {schemaVersion:1, encoding:encoded.encoding, payload:encoded.payload};
    const snapshotAt = encoded.snapshotAt, overwriteAt = encoded.overwriteAt;
    if (!Number.isFinite(snapshotAt) || snapshotAt <= 0) throw fail('report/format', '報告快照時間不正確');
    if (!reportAuthObserved) {
      reportAuthObserved = true;
      reportAuthUid = auth.currentUser.uid;
      auth.onAuthStateChanged(user => {
        const uid = user?.uid || null;
        if (uid !== reportAuthUid) { reportAuthUid = uid; reportAuthGeneration++; }
        window.dispatchEvent(new CustomEvent('ybs-report-auth', {detail:{uid}}));
      });
    }
    const generation = reportAuthGeneration;
    const sameUser = () => {
      if (!profile || profile.uid !== me.uid || auth.currentUser?.uid !== me.uid || generation !== reportAuthGeneration) {
        throw fail('report/auth', '登入身分已變更，請重新登入後交件');
      }
    };
    const course = await db.doc('ybsCourses/115-df').get({source:'server'});
    sameUser();
    if (!course.exists || course.data().open !== true) throw fail('report/closed', '課程已停止收件，請找老師');
    const roster = await db.doc('ybsCourses/115-df/roster/' + me.email).get({source:'server'});
    sameUser();
    if (!roster.exists) throw fail('report/not-listed', '你不在課程名單，請找老師');
    const {cls,seat} = roster.data();
    if (!Number.isInteger(cls) || cls < 100 || cls > 999 || !Number.isInteger(seat) || seat < 1 || seat > 60) {
      throw fail('report/not-listed', '課程名單的班級座號不正確，請找老師');
    }
    // 班座採用剛從名單讀到的整數；若和學生確認的作答身分不同，不能代換後上傳。
    if (Number(encoded.cls) !== cls || Number(encoded.seat) !== seat) throw fail('report/identity', '班級座號已變更，請重新登入並確認作答屬於你');
    const ref = db.doc('ybsCourses/115-df/reports/' + me.uid + '_s' + session);
    await db.runTransaction(async tx => {
      sameUser();
      const previous = await tx.get(ref);
      sameUser();
      const old = previous.exists ? previous.data() : null;
      const updatedAt = old?.updatedAt?.toMillis();
      if (old && updatedAt > snapshotAt && old.payload !== packet.payload && overwriteAt !== updatedAt) {
        throw fail('report/conflict', '老師已有較新的報告，請確認後再覆寫', {updatedAt});
      }
      const stamp = firebase.firestore.FieldValue.serverTimestamp();
      tx.set(ref, {uid:me.uid, session, cls, seat, ...packet,
        createdAt:old ? old.createdAt : stamp, updatedAt:stamp});
    });
    sameUser();
    // transaction 只有伺服器接受後才完成；再讀伺服器交件時間，不把本機離線待寫當作成功。
    const received = await ref.get({source:'server'});
    sameUser();
    const report = received.exists && received.data();
    const updatedAt = report && report.updatedAt?.toMillis();
    if (!Number.isFinite(updatedAt)) throw fail('unavailable', '尚未取得伺服器交件時間，請重試');
    if (report.payload !== packet.payload || report.encoding !== packet.encoding) {
      throw fail('report/conflict', '老師已有較新的報告，請確認後再覆寫', {updatedAt});
    }
    return {courseId:'115-df', uid:me.uid, session, cls, seat, updatedAt};
  }
  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport, profile: () => profile, status: f => { onStatus = f; } };
})();
