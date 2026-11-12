// 課程須先由 curriculum.js 的 open 開設；活動依 date 前最近的週日 23:59（台灣時間）開放。
// OPEN 只讓已開設課程的活動提早開放，不會覆蓋課程開關。
// 教師解鎖只在這個分頁有效；課程首頁、教師頁（teacher）不受影響。
const OPEN = {
  '115-g9': ['u1-05', 'u1-06', 'u2-01', 'u2-02'],
  '115-df': ['a']                                  // 數資班專題活動提早開放（仍須課程 open: true）
};
(() => {
  const seg = location.pathname.split('/').filter(Boolean);
  const list = OPEN[seg[0]], sub = seg[1] || '';
  if (!list || !sub || sub === 'teacher' || /\.html$/.test(sub)) return;
  const T = typeof TEACHER !== 'undefined' ? TEACHER : null;
  if (T && T.remembered()) return;
  const show = () => {
    const courseClosed = typeof COURSES !== 'undefined' && COURSES.some(c => c.id === seg[0] && !c.open);
    // 多數活動頁稍後才載入 activities.js，等 DOM 完成後再讀取共用日期判斷。
    const a = typeof ACTIVITIES !== 'undefined'
      ? ACTIVITIES.find(a => a.course === seg[0] && a.href.split('/')[1] === sub) : null;
    if (!courseClosed && (list.includes(sub) || (a && isActivityOpen(a)))) return;
    const d = document.createElement('div');
    d.id = 'ybs-lock';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;--void:#12151C;--panel:#1C212C;--panel-hi:#252C3A;--edge:#3B455C;--text:#E6E9EF;--dim:#98A2B8;--ember:#FF6B3D;--on-ember:#12151C;--cut:14px;--slant:10px;background:var(--void);color:var(--text);font:18px/1.6 "Noto Sans TC",system-ui,sans-serif;text-align:center;color-scheme:dark';
    d.innerHTML = '<div style="max-width:480px;min-width:0;padding:32px 24px;background:var(--panel);border:2px solid var(--edge);clip-path:polygon(0 0,calc(100% - var(--cut)) 0,100% var(--cut),100% 100%,var(--cut) 100%,0 calc(100% - var(--cut)))"><div style="display:none">🔒</div><h1 style="font-size:26px;font-weight:900;margin:8px 0">' + (courseClosed ? '本學年未開設這門課' : '這個活動還沒開放') + '</h1>'
      + '<p style="color:var(--dim);margin:0 0 20px">請回到 YBS Lab 首頁，做老師這週指定的活動。</p>'
      + '<p><a href="/" style="display:inline-block;max-width:100%;padding:10px 24px;background:var(--ember);color:var(--on-ember);font-weight:700;text-decoration:none;outline-offset:-4px;clip-path:polygon(var(--slant) 0,100% 0,calc(100% - var(--slant)) 100%,0 100%)">← 回 YBS Lab 首頁</a></p>'
      + '<p style="margin-top:28px"><button type="button" id="ybs-unlock" style="background:none;border:0;color:var(--dim);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer">教師解鎖</button></p></div>';
    document.body.appendChild(d);
    document.getElementById('ybs-unlock').onclick = async () => {
      const code = prompt('教師通行碼');
      if (code == null) return;
      if (T && await T.check(code)) { T.remember(true); location.reload(); }
      else alert('通行碼不對。');
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
