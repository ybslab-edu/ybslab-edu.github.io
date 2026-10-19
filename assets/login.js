// 學生用帳號密碼登入（cgjh學號／cgjh身分證字號），每過一關寫一筆紀錄到 ClassScore 的 Firebase（class-score-86020）。
// 資料結構與權限見 class-score repo 的 docs/YBS_FIRESTORE.md：學生只能新增自己的紀錄、一關一筆、不能改刪。
// on 為 false 或該課程沒有對應的 courseId 時不啟用：活動頁維持「班級座號＋成績碼」。
// 用戶端 ID、專案 ID 都不是密碼，放在公開網站沒有關係。
const YBS = (() => {
  const CONFIG = {
    on: true,                                     // false 關閉；'pilot' 只在網址加 ?login=1 的分頁啟用；true 全面啟用
    clientId: '1078830272862-u8oeft1u88aommaj3710hi7q3m2hcq6h.apps.googleusercontent.com',
    project: 'class-score-86020',
    apiKey: 'AIzaSyAooTgTdo8xiaFn6Tl2dLHLwFDlyn0frIQ',   // Firebase 網頁金鑰是公開識別碼，不是密碼
    sender: '1078830272862',
    sdk: '10.14.1',
    domain: 'cgjh.hcc.edu.tw',
    courses: { '115-g9': '115-g9' }               // 網站課程代號 → Firestore ybsCourses 文件 ID
  };
  const courseCode = (location.pathname.split('/').filter(Boolean)[0] || '');
  const courseId = () => CONFIG.courses[courseCode] || null;
  // 試點：網址帶 ?login=1 才啟用，記在這個分頁（關掉分頁就失效）；?login=0 取消
  const pilot = (() => {
    const q = location.search;
    try {
      if (/[?&]login=1(&|$)/.test(q)) sessionStorage.setItem('ybslab:login', '1');
      if (/[?&]login=0(&|$)/.test(q)) sessionStorage.removeItem('ybslab:login');
      return sessionStorage.getItem('ybslab:login') === '1';
    } catch (e) { return /[?&]login=1(&|$)/.test(q); }
  })();
  const enabled = () => !!((CONFIG.on === true || (CONFIG.on === 'pilot' && pilot)) && CONFIG.clientId && courseId());

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
  }
  // 舊版（Apps Script）曾把帳號存在 localStorage：清掉
  try { Object.keys(localStorage).filter(k => k.indexOf('ybslab:me:') === 0 || k === 'ybslab:queue').forEach(k => localStorage.removeItem(k)); } catch (e) {}
  setInterval(() => { if (profile) flush(); }, 60000);
  window.addEventListener('online', () => { if (profile) flush(); });
  return { CONFIG, enabled, button, submit, flush, logout, whoami, profile: () => profile, status: f => { onStatus = f; } };
})();

// 上鎖：只開放 OPEN 裡的週次；其他週次蓋一層「還沒開放」，老師輸入通行碼可解鎖（只在這個分頁有效）
(() => {
  const OPEN = { '115-g9': ['w01', 'w02'] };       // 開新的一週就把資料夾名加進來
  const seg = location.pathname.split('/').filter(Boolean);
  const list = OPEN[seg[0]], wk = seg[1] || '';
  if (!list || !/^w\d{2}$/.test(wk) || list.includes(wk)) return;
  const T = typeof TEACHER !== 'undefined' ? TEACHER : null;   // const 宣告不會掛在 window 上
  if (T && T.remembered()) return;
  const show = () => {
    const d = document.createElement('div');
    d.id = 'ybs-lock';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:#14161b;color:#e8eaee;font:18px/1.6 system-ui,"Noto Sans TC",sans-serif;text-align:center';
    d.innerHTML = '<div style="max-width:420px"><div style="font-size:44px">🔒</div><h1 style="font-size:26px;margin:8px 0">這個活動還沒開放</h1>'
      + '<p style="color:#a9b0bb;margin:0 0 20px">請回到 YBS Lab 首頁，做老師這週指定的活動。</p>'
      + '<p><a href="/" style="color:#8ab4f8">← 回 YBS Lab 首頁</a></p>'
      + '<p style="margin-top:28px"><button type="button" id="ybs-unlock" style="background:none;border:0;color:#6b7280;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer">教師解鎖</button></p></div>';
    document.body.appendChild(d);
    document.getElementById('ybs-unlock').onclick = async () => {
      const code = prompt('教師通行碼');
      if (code == null) return;
      if (T && await T.check(code)) { T.remember(true); location.reload(); }
      else alert('通行碼不對。');
    };
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
