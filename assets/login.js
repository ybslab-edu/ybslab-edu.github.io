// 學生以學校 Google 帳號登入，過關紀錄自動上傳到老師的 Google 試算表（Apps Script）。
// 設定：clientId 是 Google Cloud 的 OAuth 用戶端 ID（網頁應用程式，同意畫面設為「內部」）；
//       endpoint 是 Apps Script 網頁應用程式的網址（tools/成績上傳/ 有程式與步驟）。
// 兩個都留空時不啟用：活動頁維持原本「班級座號＋成績碼」的做法。
const YBS = (() => {
  const CONFIG = {
    clientId: '',
    endpoint: '',
    domain: 'cgjh.hcc.edu.tw'   // 學生用一般 @gmail.com 時改成 ''（試算表端也要改），此時只有名單上的帳號能用
  };
  const enabled = () => !!(CONFIG.clientId && CONFIG.endpoint);
  let token = null, profile = null, inited = false, onLogin = null, onError = null, onStatus = () => {};

  function decode(jwt) {
    const b = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - b.length % 4) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  }
  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.id) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('無法載入 Google 登入，請確認網路連線。'));
      document.head.appendChild(s);
    });
  }
  function handle(r) {
    let p;
    try { p = decode(r.credential); } catch (e) { onError && onError('登入失敗，請再試一次。'); return; }
    if (CONFIG.domain && p.hd !== CONFIG.domain) { onError && onError('請改用學校帳號（@' + CONFIG.domain + '）登入。'); return; }
    token = r.credential; profile = { email: p.email, exp: p.exp };
    onLogin && onLogin(profile);
    flush();
  }
  async function init() {
    await loadGis();
    if (inited) return;
    google.accounts.id.initialize({ client_id: CONFIG.clientId, ...(CONFIG.domain ? { hd: CONFIG.domain } : {}), callback: handle, auto_select: true, cancel_on_tap_outside: false });
    inited = true;
  }
  // 在 el 放一顆「使用 Google 帳戶登入」按鈕；登入成功呼叫 ok(profile)，失敗呼叫 bad(訊息)
  async function button(el, ok, bad) {
    onLogin = ok; onError = bad;
    try { await init(); } catch (e) { bad && bad(e.message); return; }
    el.innerHTML = '';
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh-TW', width: 260 });
  }
  const expired = () => !profile || Date.now() / 1000 > profile.exp - 60;

  // 上傳佇列：先存在這台電腦，連線或登入有問題時下次自動重試；只送目前登入者自己的紀錄
  const QKEY = 'ybslab:queue';
  const getQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } };
  const setQ = a => { try { localStorage.setItem(QKEY, JSON.stringify(a)); } catch (e) {} };
  let busy = false;
  async function flush() {
    if (!enabled() || !profile || busy) return;
    const all = getQ(), mine = all.filter(x => x.email === profile.email);
    if (!mine.length) { onStatus('ok'); return; }
    if (expired()) { onStatus('relogin'); return; }
    busy = true; onStatus('sending');
    const left = [];
    let needLogin = false;
    for (const item of mine) {
      try {
        const r = await fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...item, token }) });
        const j = await r.json();
        if (!j.ok) { left.push(item); if (j.error === 'auth') needLogin = true; }
      } catch (e) { left.push(item); }
    }
    setQ(getQ().filter(x => x.email !== profile.email || left.some(l => l.id === x.id)));
    busy = false;
    onStatus(needLogin ? 'relogin' : left.length ? 'pending' : 'ok');
  }
  function submit(item) {
    if (!enabled() || !profile) return;
    const a = getQ();
    a.push({ ...item, email: profile.email, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    setQ(a); return flush();
  }
  // 問試算表「我是誰」：回傳 { ok, student:{cls,seat,name}|null } 或 { ok:false, error }
  async function whoami() {
    if (!enabled() || !token) return { ok: false, error: 'auth' };
    try {
      const r = await fetch(CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'whoami', token }) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'network' }; }
  }
  function logout() {
    token = null; profile = null;
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch (e) {}
  }
  setInterval(() => { if (profile) flush(); }, 60000);
  return { CONFIG, enabled, button, submit, flush, logout, whoami, profile: () => profile, status: f => { onStatus = f; } };
})();
