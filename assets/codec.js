// 成績碼：學生頁產生、教師頁解碼。改這個檔會影響所有週次，請小心。
// v2（16 碼）：班級 10 bit｜座號 6｜週次 6｜過關 6｜各關嘗試次數 6×4｜時間 18（每 5 分鐘）｜檢查碼 10
// v1（13 碼）：第 1 週試跑時用的舊格式，只解碼不產生
const CODEC = (() => {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', SALT = 'cpu-shop-2026';
  const EPOCH = Date.UTC(2025, 11, 31, 16, 0); // 2026-01-01 00:00 台北
  const fnv = s => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0 } return h };
  const chkOf = (v, salt) => BigInt(fnv(v.toString() + salt) & 0x3ff);
  const toStr = (v, n) => { let s = ''; for (let i = 0; i < n; i++) { s = A[Number(v & 31n)] + s; v >>= 5n } return s };
  const clean = str => String(str).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
  const toBig = s => { let v = 0n; for (const ch of s) { const i = A.indexOf(ch); if (i < 0) return null; v = (v << 5n) | BigInt(i) } return v };

  function encode(o) {
    const t = Math.max(0, Math.min(262143, Math.floor((o.time - EPOCH) / 300000)));
    let v = BigInt(o.cls);
    v = (v << 6n) | BigInt(o.seat);
    v = (v << 6n) | BigInt(o.week);
    v = (v << 6n) | BigInt(o.mask & 63);
    for (let i = 0; i < 6; i++) v = (v << 4n) | BigInt(Math.min(15, o.tries[i] || 0));
    v = (v << 18n) | BigInt(t);
    v = (v << 10n) | chkOf(v, SALT + ':v2');
    const s = toStr(v, 16);
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12);
  }

  function decode(str) {
    const s = clean(str);
    if (s.length === 16) {
      let v = toBig(s); if (v == null) return null;
      const chk = v & 1023n; v >>= 10n;
      if (chkOf(v, SALT + ':v2') !== chk) return null;
      const t = Number(v & 262143n); v >>= 18n;
      const tries = []; for (let i = 0; i < 6; i++) { tries.unshift(Number(v & 15n)); v >>= 4n }
      const mask = Number(v & 63n); v >>= 6n;
      const week = Number(v & 63n); v >>= 6n;
      const seat = Number(v & 63n); v >>= 6n;
      const cls = Number(v);
      if (cls < 100 || cls > 999 || seat < 1 || seat > 60 || week < 1) return null;
      return { week, cls, seat, mask, tries, time: EPOCH + t * 300000, code: s.match(/.{4}/g).join('-') };
    }
    if (s.length === 13) {
      let v = toBig(s); if (v == null) return null;
      const chk = v & 1023n; v >>= 10n;
      if (chkOf(v, SALT) !== chk) return null;
      const t = Number(v & 262143n); v >>= 18n;
      const tries = []; for (let i = 0; i < 4; i++) { tries.unshift(Number(v & 15n)); v >>= 4n }
      const mask = Number(v & 15n); v >>= 4n;
      const seat = Number(v & 63n); v >>= 6n;
      const cls = Number(v);
      if (cls < 100 || cls > 999 || seat < 1 || seat > 60) return null;
      return { week: 1, cls, seat, mask, tries: tries.concat([0, 0]), time: EPOCH + t * 300000, code: s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8) };
    }
    return null;
  }

  // 從一大段文字裡抓出所有可能的成績碼
  const PATTERN = /[0-9A-Z]{4}[-\s]?[0-9A-Z]{4}[-\s]?[0-9A-Z]{4}[-\s]?[0-9A-Z]{4}|[0-9A-Z]{4}[-\s]?[0-9A-Z]{4}[-\s]?[0-9A-Z]{5}/g;
  const extract = text => String(text).toUpperCase().match(PATTERN) || [];

  return { encode, decode, extract };
})();
