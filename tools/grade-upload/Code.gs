/**
 * YBS Lab 成績上傳：貼到老師的 Google 試算表（擴充功能 → Apps Script），
 * 部署成「網頁應用程式」（執行身分：我；誰可以存取：任何人）。
 * 活動頁送來學生的 Google 登入憑證，這裡向 Google 驗證後才回應或寫入，
 * 所以學生只能用自己的帳號、只能查到自己、只能替自己上傳。
 *
 * 工作表（按一次上方的「執行 setup」會先建好；沒建也會在第一次使用時自動建立）：
 *   「名單」：老師貼上 學校帳號｜班級｜座號｜姓名，學生登入後自動帶出，不用自己填
 *   「成績總表」：每位學生每個活動一列，各關是否過關、嘗試次數
 *   「上傳紀錄」：每過一關一列，留存原始紀錄
 * 名單只存在這個試算表裡，不會放到公開網站上。
 */
const CLIENT_ID = '';                 // 和網站 assets/login.js 的 clientId 相同
const DOMAIN = 'cgjh.hcc.edu.tw';     // 只接受這個網域的帳號；學生用的是一般 @gmail.com 時改成 ''（此時只接受名單上的帳號）
const ALLOW_UNLISTED = true;          // 本校網域但不在名單上的帳號，可自己填班級座號上傳（姓名欄會標「不在名單」）

const ROSTER = '名單', LOG = '上傳紀錄', SUM = '成績總表', MAX_ROUNDS = 6;
const ROSTER_HEAD = ['學校帳號', '班級', '座號', '姓名'];

function setup() {
  sheet_(ROSTER, ROSTER_HEAD);
  sheet_(SUM, sumHead_());
  sheet_(LOG, logHead_());
}

function doGet() {
  return out_({ ok: true, service: 'ybslab-grade-upload', ready: !!CLIENT_ID });
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const who = verify_(d.token);
    if (!who) return out_({ ok: false, error: 'auth' });
    const me = lookup_(who.email);
    const listedOnly = !DOMAIN || !ALLOW_UNLISTED;
    if (d.action === 'whoami') {
      if (!me && listedOnly) return out_({ ok: false, error: 'not-listed' });
      return out_({ ok: true, student: me ? { cls: me.cls, seat: me.seat, name: me.name } : null });
    }
    if (!me && listedOnly) return out_({ ok: false, error: 'not-listed' });
    const rec = clean_(d, me);
    if (!rec) return out_({ ok: false, error: 'data' });
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      write_(who.email, rec);
    } finally {
      lock.releaseLock();
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

// 向 Google 確認登入憑證：發給本站、帳號已驗證、（有設定時）屬於本校網域、尚未過期
function verify_(token) {
  if (!token || !CLIENT_ID) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  const p = JSON.parse(r.getContentText());
  if (p.aud !== CLIENT_ID) return null;
  if (String(p.email_verified) !== 'true') return null;
  if (DOMAIN && p.hd !== DOMAIN) return null;
  if (Number(p.exp) * 1000 < Date.now()) return null;
  return { email: String(p.email).trim().toLowerCase() };
}

// 從「名單」找這個帳號
function lookup_(email) {
  const sh = sheet_(ROSTER, ROSTER_HEAD);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  const r = rows.find(v => String(v[0]).trim().toLowerCase() === email);
  if (!r) return null;
  const cls = Number(r[1]), seat = Number(r[2]);
  if (!Number.isInteger(cls) || !Number.isInteger(seat)) return null;
  return { cls, seat, name: String(r[3]).trim() };
}

// 只收合理範圍的資料；名單上有的人，班級座號以名單為準
function clean_(d, me) {
  const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
  const txt = (v, n) => String(v == null ? '' : v).slice(0, n);
  const rec = {
    course: txt(d.course, 20), activity: int(d.activity, 1, 63), termWeek: int(d.termWeek, 1, 30),
    title: txt(d.title, 60), round: int(d.round, 0, MAX_ROUNDS - 1), roundName: txt(d.roundName, 30), level: txt(d.level, 10),
    rounds: Array.isArray(d.rounds) ? d.rounds.slice(0, MAX_ROUNDS).map(x => txt(x, 30)) : [],
    tries: int(d.tries, 0, 99), code: txt(d.code, 24),
    cls: me ? me.cls : int(d.cls, 100, 999), seat: me ? me.seat : int(d.seat, 1, 60),
    name: me ? me.name : '（不在名單）'
  };
  if ([rec.activity, rec.round, rec.cls, rec.seat].some(v => v == null) || !rec.course) return null;
  return rec;
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const top = sh.getRange(1, 1, 1, header.length);
    top.setValues([header]);
    top.setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function logHead_() { return ['時間', '學校帳號', '班級', '座號', '姓名', '課程', '學期週次', '活動', '關卡', '等級', '嘗試次數', '成績碼']; }
function sumHead_() {
  const head = ['學期週次', '活動', '班級', '座號', '姓名', '學校帳號'];
  for (let i = 1; i <= MAX_ROUNDS; i++) head.push('第' + i + '關');
  head.push('過關數', '最後更新', '課程', '活動編號');
  return head;
}

function write_(email, r) {
  const now = new Date();
  sheet_(LOG, logHead_())
    .appendRow([now, email, r.cls, r.seat, r.name, r.course, r.termWeek, r.title, r.roundName, r.level, r.tries, r.code]);

  const head = sumHead_();
  const sh = sheet_(SUM, head);
  const C = name => head.indexOf(name) + 1;
  const last = sh.getLastRow();
  let row = 0;
  if (last > 1) {
    const keys = sh.getRange(2, 1, last - 1, head.length).getValues();
    const k = keys.findIndex(v => String(v[C('學校帳號') - 1]).toLowerCase() === email && String(v[C('課程') - 1]) === r.course && Number(v[C('活動編號') - 1]) === r.activity);
    if (k >= 0) row = k + 2;
  }
  if (!row) {
    row = sh.getLastRow() + 1;
    const init = head.map(() => '');
    init[C('過關數') - 1] = 0;
    sh.getRange(row, 1, 1, head.length).setValues([init]);
  }
  sh.getRange(row, C('學期週次')).setValue(r.termWeek);
  sh.getRange(row, C('活動')).setValue(r.title);
  sh.getRange(row, C('班級')).setValue(r.cls);
  sh.getRange(row, C('座號')).setValue(r.seat);
  sh.getRange(row, C('姓名')).setValue(r.name);
  sh.getRange(row, C('學校帳號')).setValue(email);
  sh.getRange(row, C('課程')).setValue(r.course);
  sh.getRange(row, C('活動編號')).setValue(r.activity);
  const label = (r.rounds[r.round] || r.roundName) + ' ✓（試 ' + r.tries + ' 次）';
  sh.getRange(row, C('第' + (r.round + 1) + '關')).setValue(label);
  const cells = sh.getRange(row, C('第1關'), 1, MAX_ROUNDS).getValues()[0];
  sh.getRange(row, C('過關數')).setValue(cells.filter(v => String(v).indexOf('✓') >= 0).length);
  sh.getRange(row, C('最後更新')).setValue(now);
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
