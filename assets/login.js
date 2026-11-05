// 學生用帳號密碼登入（cgjh學號／cgjh身分證字號），每過一關寫一筆紀錄到 ClassScore 的 Firebase（class-score-86020）。
// 資料結構與權限見 class-score repo 的 docs/YBS_FIRESTORE.md：學生只能新增自己的紀錄、一關一筆、不能改刪。
// on 為 false 或該課程沒有對應的 courseId 時不啟用：活動頁維持「班級座號與本機進度」。
// 專案 ID、網頁金鑰都是公開識別碼，不是密碼，放在公開網站沒有關係。
const YBS = (() => {
  const CONFIG = {
    on: true,                                     // false：關閉登入，活動頁只用「班級座號與本機進度」
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

  let fb = null, initializing = null, profile = null, accountGeneration = 0, onLogin = null, onError = null, onStatus = () => {};
  // 帳號登入、登出與匿名換人依序執行，避免較慢的登入覆蓋新身分。
  let authWork = Promise.resolve();
  const withAuth = fn => { const next = authWork.then(fn); authWork = next.catch(() => {}); return next; };
  const loadScript = src => new Promise((ok, no) => {
    if (document.querySelector('script[src="' + src + '"]')) return ok();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = ok; s.onerror = () => { s.remove?.(); no(new Error('無法載入登入元件，請確認網路連線。')); };
    document.head.appendChild(s);
  });

  async function initFirebase() {
    if (fb) return fb;
    if (initializing) return initializing;
    initializing = initializeFirebase().finally(() => { initializing = null; });
    return initializing;
  }
  async function initializeFirebase() {
    const base = 'https://www.gstatic.com/firebasejs/' + CONFIG.sdk;
    await loadScript(base + '/firebase-app-compat.js');
    await loadScript(base + '/firebase-auth-compat.js');
    await loadScript(base + '/firebase-firestore-compat.js');
    // 設定直接寫在這裡：ClassScore 的 init.json 不允許跨站讀取（CORS）
    const app = firebase.apps.find(a => a.name === 'ybs') || firebase.initializeApp({ apiKey: CONFIG.apiKey, authDomain: CONFIG.project + '.firebaseapp.com', projectId: CONFIG.project, messagingSenderId: CONFIG.sender }, 'ybs');
    const auth = app.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);   // 關掉分頁就登出：電腦教室是共用機
    if (auth.onAuthStateChanged) await new Promise((ok, no) => {
      const unsubscribe = auth.onAuthStateChanged(() => { ok(); Promise.resolve().then(() => unsubscribe()); }, no);
    });
    fb = { app, auth, db: app.firestore() };
    return fb;
  }
  // 帳號密碼登入：帳號 cgjh＋學號、密碼 cgjh＋身分證字號（老師在 ClassScore「YBS Lab 連線」第 7 區建立）。
  // 登入用的信箱是 cgjh學號@ybslab-edu.github.io（不寄信，只是識別），對應到名單上的學校信箱 cgjh學號@cgjh.hcc.edu.tw。
  const ACCT_DOMAIN = 'ybslab-edu.github.io';
  const normAccount = v => { const t = String(v || '').trim().toLowerCase().replace(/@.*$/, '').replace(/\s+/g, ''); return /^\d{3,12}$/.test(t) ? 'cgjh' + t : t; };
  const normPassword = v => { const t = String(v || '').trim(); const m = t.match(/^cgjh([a-z][0-9a-d]\d{8})$/i); return m ? 'cgjh' + m[1].toUpperCase() : t; };
  const loginError = (code, message) => Object.assign(new Error(message), { code });
  async function signIn(account, password) {
    const acct = normAccount(account);
    if (!/^cgjh\d{3,12}$/.test(acct)) throw loginError('auth/invalid-account', '帳號是 cgjh 加學號，例如 cgjh1100123。');
    if (!password) throw loginError('auth/missing-password', '請輸入密碼。');
    const generation = ++accountGeneration;
    profile = null;
    leaveGuest();
    const { auth } = await initFirebase();
    try { return await withAuth(async () => {
      const cancelled = () => loginError('auth/login-cancelled', '登入已取消，請重新登入。');
      if (generation !== accountGeneration) throw cancelled();
      const cred = await auth.signInWithEmailAndPassword(acct + '@' + ACCT_DOMAIN, normPassword(password));
      if (generation !== accountGeneration) {
        // 必須在釋放 Auth 序列前清掉遲到的帳號，後續匿名登入才不會混用。
        await auth.signOut();
        throw cancelled();
      }
      if (cred.user.isAnonymous || auth.currentUser?.uid !== cred.user.uid) throw cancelled();
      profile = { email: acct + '@' + CONFIG.domain, account: acct, uid: cred.user.uid };
      return profile;
    }); }
    catch (e) {
      const c = e && e.code || '';
      if (c === 'auth/login-cancelled') throw e;
      if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login/.test(c)) throw loginError(c, '帳號或密碼不對。密碼是 cgjh 加身分證字號；還是不行請告訴老師。');
      if (/too-many-requests/.test(c)) throw loginError(c, '嘗試太多次，請等幾分鐘再試，或告訴老師。');
      if (/network/.test(c)) throw loginError(c, '連不上網路，請確認網路後再試。');
      throw loginError(c || 'auth/login-failed', '登入沒有完成（' + (c || '連線問題') + '），請再試一次或告訴老師。');
    }
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
      catch (e) { f.p.value = ''; if (e?.code !== 'auth/login-cancelled') onError && onError(e && e.message || '登入失敗，請再試一次。'); }
      finally { btn.disabled = false; btn.textContent = '登入'; }
    };
    setTimeout(() => { try { f.a.focus(); } catch (e) { /* 自動聚焦僅方便輸入，失敗仍可手動點選。 */ } }, 0);
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
      catch (e) { queue = []; /* 無法讀取舊佇列時，仍接受本次分頁的新紀錄。 */ }
    }
    return queue;
  };
  const setQ = a => {
    queue = a;
    try { sessionStorage.setItem(QKEY, JSON.stringify(a)); } catch (e) { /* 已保留記憶體佇列，送出狀態仍以伺服器結果為準。 */ }
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
          if (ref && e && e.code === 'permission-denied') { try { done = (await ref.get()).exists; } catch (e2) { /* 無法確認既有紀錄，保留待送並回報 pending。 */ } }
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
    if (!enabled()) return;
    if (!profile) return submitGuest(item);
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
  function logout({keepAnonymous = false} = {}) {
    accountGeneration++;
    profile = null;
    leaveGuest();
    const failed = () => { onError && onError('登出未完成，請重新整理後再試。'); };
    return withAuth(async () => {
      // 手動入口會作廢待完成帳密登入，但同班座可保留既有匿名 SESSION。
      if (fb && (!keepAnonymous || (fb.auth.currentUser && !fb.auth.currentUser.isAnonymous))) await fb.auth.signOut();
    }).catch(failed);
  }
  // 班座紀錄獨立存 localStorage；不放帳號、答案或密碼。SDK 只沿用上面的設定。
  const GKEY = 'ybslab:guest:' + courseCode, GIDENT = 'ybslab:guest-identity';
  const GUEST_RECEIPT_LIMIT = 200, GUEST_BATCH_LIMIT = 10;
  let guestState = { queue: [], receipts: [] }, guestStorageFailed = false;
  let guestIdentity = null, guestBinding = null, guestGeneration = 0, guestBusy = false, guestAgain = false;
  let guestFailures = 0, guestRetryAt = 0;
  const guestWarn = e => console.warn('[YBS guestAttempts]', e?.code || 'local-or-network-error');
  const guestStatus = state => { try { onStatus(state === 'guest-pending' && guestStorageFailed ? 'guest-storage' : state); } catch (e) { guestWarn(e); } };
  const identity = x => x && /^[1-9]\d{2}$/.test(String(x.cls)) && queueInt(x.seat, 1, 60)
    ? {cls: String(x.cls), seat: x.seat} : null;
  const sameIdentity = (a, b) => !!a && !!b && a.cls === b.cls && a.seat === b.seat;
  const validGuest = x => identity(x) && typeof x.cls === 'string'
    && queueInt(x.activity, 1, 31) && queueInt(x.round, 0, 5)
    && queueInt(x.level, 1, 2) && queueInt(x.tries, 1, 999)
    && (x.termWeek === undefined || queueInt(x.termWeek, 1, 30))
    && (x.uid === undefined || (typeof x.uid === 'string' && /^[^/]{1,128}$/.test(x.uid)));
  const guestKey = x => [x.cls, x.seat, x.activity, x.round].join('_');
  const receiptKey = x => JSON.stringify([courseId(), x.cls, x.seat, x.uid, x.activity, x.round]);
  const trimReceipts = receipts => [...new Set(receipts.filter(x => typeof x === 'string' && x.length <= 256))].slice(-GUEST_RECEIPT_LIMIT);
  // 開頁只還原這個分頁最後確認的班座，不從其他人的待送紀錄猜身分。
  try { guestBinding = JSON.parse(sessionStorage.getItem(GIDENT) || 'null'); guestIdentity = identity(guestBinding); }
  catch (e) { guestWarn(e); }
  function readGuest() {
    // 儲存失敗時記憶體仍是最新版本；正常時重新讀取，以容納其他分頁的新增。
    if (!guestStorageFailed) try {
      const stored = JSON.parse(localStorage.getItem(GKEY) || '{"queue":[],"receipts":[]}');
      if (!Array.isArray(stored.queue) || !Array.isArray(stored.receipts)) throw new Error('invalid queue');
      guestState = {queue: stored.queue.filter(validGuest), receipts: trimReceipts(stored.receipts)};
      if (stored.receipts.length !== guestState.receipts.length) saveGuest(guestState);
    } catch (e) { guestWarn(e); guestStorageFailed = true; }
    return guestState;
  }
  function saveGuest(state) {
    guestState = {...state, receipts:trimReceipts(state.receipts)};
    // 額滿時依序捨棄最舊成功證據，把空間優先留給待送；絕不刪除待送換空間。
    for (;;) {
      try { localStorage.setItem(GKEY, JSON.stringify(guestState)); guestStorageFailed = false; return; }
      catch (e) {
        if (guestState.receipts.length) { guestState.receipts.shift(); continue; }
        guestStorageFailed = true; guestWarn(e); return;
      }
    }
  }
  function guestData(x) {
    if (!validGuest(x)) throw new Error('invalid guest attempt');
    const data = {activity:x.activity, round:x.round, level:x.level, tries:x.tries,
      cls:x.cls, seat:x.seat, verified:false, app:'ybs', passedAt:firebase.firestore.FieldValue.serverTimestamp()};
    if (x.termWeek !== undefined) data.termWeek = x.termWeek;
    return data;
  }
  function leaveGuest() { guestIdentity = null; guestGeneration++; guestFailures = 0; guestRetryAt = 0; }
  async function ensureGuest(id, generation, manual = false) {
    return withAuth(async () => {
      const {auth} = await initFirebase();
      if (generation !== guestGeneration || profile) return null;
      // 已還原的 Google／password 帳號不能被背景匿名登入取代。
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        if (!manual) return null;
        // 只有學生明確以手動班座開始，才登出還原的舊帳號；背景重送不換帳號。
        await auth.signOut();
      }
      if (!guestBinding) try { guestBinding = JSON.parse(sessionStorage.getItem(GIDENT) || 'null'); } catch (e) { guestWarn(e); }
      if (auth.currentUser && (!sameIdentity(id, guestBinding) || guestBinding.uid !== auth.currentUser.uid)) {
        await auth.signOut();
      }
      if (generation !== guestGeneration || profile) return null;
      if (!auth.currentUser) await auth.signInAnonymously();
      if (generation !== guestGeneration || profile) {
        if (auth.currentUser?.isAnonymous) await auth.signOut();
        return null;
      }
      if (!auth.currentUser?.isAnonymous) return null;
      guestBinding = {...id, uid:auth.currentUser.uid};
      try { sessionStorage.setItem(GIDENT, JSON.stringify(guestBinding)); } catch (e) { guestWarn(e); }
      return auth.currentUser.uid;
    });
  }
  function guest(id) {
    if (!enabled() || profile) return;
    const next = identity(id); if (!next) return;
    if (!sameIdentity(next, guestIdentity)) { guestGeneration++; guestFailures = 0; guestRetryAt = 0; }
    guestIdentity = next;
    const generation = guestGeneration;
    // 不等待網路；換班座時仍先完成 signOut，再匿名登入。
    return ensureGuest(next, generation, true).then(() => flushGuest()).catch(e => { guestWarn(e); guestStatus('guest-pending'); });
  }
  function submitGuest(item) {
    const id = identity(item);
    const x = id && {...id, activity:item.activity, round:item.round,
      level:item.level === '進階' ? 2 : item.level === '基礎' ? 1 : item.level, tries:item.tries};
    if (x && item.termWeek) x.termWeek = item.termWeek;
    if (!validGuest(x)) { guestWarn({code:'invalid-attempt'}); return; }
    const state = readGuest();
    // 同班座同關只留最早的待送紀錄；送出期間的重做不會刪掉別人的項目。
    if (!state.queue.some(y => guestKey(y) === guestKey(x))) saveGuest({...state, queue:[...state.queue, x]});
    if (!sameIdentity(id, guestIdentity)) { guestIdentity = id; guestGeneration++; guestFailures = 0; guestRetryAt = 0; }
    return flushGuest();
  }
  async function flushGuest() {
    if (!enabled() || profile || !guestIdentity) return;
    if (guestBusy) { guestAgain = true; return; }
    if (!readGuest().queue.some(x => sameIdentity(x, guestIdentity))) return;
    if (Date.now() < guestRetryAt) { guestStatus('guest-pending'); return; }
    if (guestStorageFailed) saveGuest(guestState);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { guestStatus('guest-pending'); return; }
    guestBusy = true; guestAgain = false;
    const generation = guestGeneration, id = guestIdentity, attempted = new Set();
    let failed = false;
    try {
      guestStatus('sending');
      while (generation === guestGeneration && !profile && attempted.size < GUEST_BATCH_LIMIT) {
        const x = readGuest().queue.find(y => sameIdentity(y, id) && !attempted.has(guestKey(y)));
        if (!x) break;
        attempted.add(guestKey(x));
        try {
          const uid = await ensureGuest(id, generation);
          if (!uid || generation !== guestGeneration || profile) break;
          x.uid = uid;
          const state = readGuest(), current = state.queue.find(y => guestKey(y) === guestKey(x));
          if (!current) continue;
          current.uid = uid;
          // 送出前移至隊尾並保存；跨輪及重新開頁都讓後續項目輪到，不被持續失敗的前十筆擋住。
          state.queue = state.queue.filter(y => y !== current);
          state.queue.push(current); saveGuest(state);
          const proof = receiptKey(x);
          let done = state.receipts.includes(proof);
          if (!done) try {
            await fb.db.doc('ybsCourses/' + courseId() + '/guestAttempts/' + uid + '_' + x.activity + '_' + x.round).set(guestData(x));
            done = true;
          } catch (e) {
            // 匿名者不能 get；permission-denied 也可能是關課，不能無證據當成功。
            done = /^(?:firestore\/)?already-exists$/.test(e?.code || '') || readGuest().receipts.includes(proof);
            if (!done) { failed = true; guestWarn(e); }
          }
          if (done) {
            const latest = readGuest();
            saveGuest({queue:latest.queue.filter(y => !(guestKey(y) === guestKey(x) && y.uid === uid)),
              receipts:[...latest.receipts.filter(y => y !== proof), proof]});
          }
        } catch (e) { failed = true; guestWarn(e); break; }
      }
    } finally {
      guestBusy = false;
      if (!profile && generation === guestGeneration) {
        if (failed) {
          guestFailures = Math.min(guestFailures + 1, 5);
          guestRetryAt = Date.now() + Math.min(60000 * 2 ** (guestFailures - 1), 900000);
        } else { guestFailures = 0; guestRetryAt = 0; }
        const pending = readGuest().queue.some(x => sameIdentity(x, id));
        guestStatus(pending ? 'guest-pending' : 'ok');
      }
      if (guestAgain && !profile) {
        guestAgain = false;
        // 已達單輪上限留待下個觸發點；換人仍可立即處理新身分。
        if (generation !== guestGeneration || attempted.size < GUEST_BATCH_LIMIT) void flushGuest();
      }
    }
  }
  // 只有有待送紀錄才在開頁時載入 SDK；教師頁不背景匿名登入。
  const guestPage = !/\/teacher(?:\/|$)/.test(location.pathname);
  if (enabled() && guestPage && readGuest().queue.length) Promise.resolve().then(flushGuest).catch(guestWarn);
  setInterval(() => { if (guestPage && !profile) void flushGuest(); }, 60000);
  window.addEventListener('online', () => { if (guestPage && !profile) return flushGuest(); });
  window.addEventListener('offline', () => {
    if (guestPage && !profile && readGuest().queue.length) guestStatus('guest-pending');
  });
  // 舊版（Apps Script）曾把帳號存在 localStorage：清掉
  try { Object.keys(localStorage).filter(k => k.indexOf('ybslab:me:') === 0 || k === 'ybslab:queue').forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem('ybslab:login'); } catch (e) { /* 舊版快取清理不影響目前的分頁登入。 */ }
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
  function retry() { guestRetryAt = 0; return profile ? flush() : flushGuest(); }
  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport, guest, leaveGuest, flushGuest,
    retry, firebaseSession: initFirebase, profile: () => profile, status: f => { onStatus = f; } };
})();
