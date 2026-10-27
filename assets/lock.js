// 活動上鎖：只開放 OPEN 裡的資料夾，其他活動頁蓋一層「還沒開放」，老師輸入通行碼可解鎖（只在這個分頁有效）。
// 開新的一週：把資料夾名加進對應課程的清單，例如九年級加 'u2-01'。課程首頁、教師頁（teacher）不受影響。
(() => {
  const OPEN = {
    '115-g9': ['u1-05', 'u1-06', 'u2-01', 'u2-02'],
    '115-df': ['a']                                  // 數資班專題：要開放就加 'a'
  };
  const seg = location.pathname.split('/').filter(Boolean);
  const list = OPEN[seg[0]], sub = seg[1] || '';
  if (!list || !sub || sub === 'teacher' || /\.html$/.test(sub) || list.includes(sub)) return;
  const T = typeof TEACHER !== 'undefined' ? TEACHER : null;
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
