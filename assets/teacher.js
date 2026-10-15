// 教師模式通行碼：只存 SHA-256 雜湊，所有活動頁共用。
// 網站是公開的靜態網頁，答案邏輯本來就在頁面原始碼裡；通行碼只是避免學生隨手點開，不是帳號安全機制。
// 換通行碼：把下面的 HASH 換成 sha256("ybslab-teacher:" + 新通行碼) 的十六進位字串。
const TEACHER = (() => {
  const HASH = '9be5ecded36dff395356266728323afa06a53682a3a20db84f986e21c0fb45dd';
  async function check(code) {
    if (!(window.crypto && crypto.subtle)) return false;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ybslab-teacher:' + String(code)));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') === HASH;
  }
  const KEY = 'ybslab:teacher';
  const remember = on => { try { on ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY) } catch (e) {} };
  const remembered = () => { try { return sessionStorage.getItem(KEY) === '1' } catch (e) { return false } };
  return { check, remember, remembered };
})();
