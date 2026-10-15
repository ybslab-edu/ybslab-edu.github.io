// 所有課堂活動，全站只在這裡登記一次。新活動加在最前面。
// codes：對應的課綱代碼（學習地圖）　date：上課日期（學期進度）　also：同一活動重複上課的其他日期（選填，學期進度每一週都會列出）
// week：該課程第幾個活動（成績碼用），要和活動頁的 WEEK 一致；畫面上的「第幾週」用 termWeekOf() 依 date 算學期週次　rounds：關卡名稱，順序同活動頁（最多 6 關，教師專區用）
// track：必修 或 選修。選修是延伸實作或課綱選教項目，進度落後的班級可以跳過，改補看因材網影片。
// why / because / so：這個活動的引起動機、發展活動、綜合活動，各一句。
const ACTIVITIES = [
  {
    title: '看台最後一排',
    course: '115-g9',
    week: 3,
    track: '必修',
    date: '2026-10-26',
    href: '115-g9/w03/',
    codes: ['資D-IV-1'],
    node: '因材網 D-IV-1-901-2-01～04',
    rounds: ['看清背號', '認出應援色', '容量剛好夠', '衛星數遊覽車'],
    topic: '資料數位化：取樣與量化（影像、聲音、視訊）',
    why: '坐在看台最後一排拍偶像，放大後只剩一團馬賽克；朋友的新手機拍得超清楚，臉卻像被「畫」上去。照片到底存了什麼？',
    because: '照片被切成一格一格的像素（取樣），每格的顏色變成一個數字（量化）；格子越多、每格位元越多，越清楚，檔案也越大。',
    so: '放大不會多出格子，所以只會更糊；AI 計算攝影是把沒拍到的細節「猜」回去，內容憑證幫你查照片怎麼來的。'
  },
  {
    title: '消失的原始資料',
    course: '115-df',
    week: 1,
    track: '必修',
    date: '2026-10-21',
    also: ['2026-10-28', '2026-11-04'],
    href: '115-df/a/',
    codes: ['資T-IV-1', '資H-IV-1'],
    node: '數位鑑識專題 A 版（兩堂，個人作答）',
    topic: '數位鑑識：從證據提出假設、找反證、說清楚能證明與不能證明的事',
    why: '專題小組封存成果時發現：原始資料和簡報裡的圖表對不上。資料是被刪掉了，還是有人動了手腳？',
    because: '照片的 EXIF、門禁與電腦紀錄、檔案版本歷程交叉比對，先提出假設，再用第二批證據找反證、修正假設。',
    so: '帳號、門禁、照片都不能自動等於「某人做了某事」；好的結論要寫出能證明什麼、不能證明什麼。'
  },
  {
    title: '打王前記得存檔',
    course: '115-g9',
    week: 2,
    track: '必修',
    date: '2026-10-19',
    href: '115-g9/w02/',
    codes: ['資S-IV-2'],
    node: '因材網 S-IV-2-901-1-11、-12',
    rounds: ['開遊戲', '打王前存檔', 'RAM 滿了', '從開機到存檔'],
    topic: '輔助記憶體與電腦硬體運作流程',
    why: '遊戲下載到一半空間不足、永遠在載入中、切回來又重載、打王打到一半沒電只回到存檔點。這四件倒楣事是同一個原因嗎？',
    because: '儲存空間（輔助記憶體）是遊戲和存檔住的地方，斷電不會忘；RAM（主記憶體）是正在玩的地方，CPU 只拿得到 RAM 裡的東西。',
    so: '手機規格表上的兩個 GB，一個是 RAM、一個是儲存空間；載入中是搬上 RAM，存檔是寫回儲存空間。'
  },
  {
    title: '深夜手搖店',
    course: '115-g9',
    week: 1,
    track: '必修',
    date: '2026-10-12',
    href: '115-g9/w01/',
    codes: ['資S-IV-2'],
    node: '因材網 S-IV-2-901-1-09、-10',
    rounds: ['第1單', '第2單', '錢夠不夠', '班級團購'],
    topic: '算術邏輯單元、控制單元與主記憶體',
    why: '店長從不搖飲料，搖飲師只會算和比，牆上的單子一關燈就消失。這間店怎麼了？',
    because: '店長是控制單元，搖飲師是算術邏輯單元，點單牆是主記憶體。',
    so: '這間每秒處理三十億張單的店，就開在你手上的手機裡。'
  }
];

// 學期第幾週：由活動的 date 和 curriculum.js 的 TERMS 算出（week 欄位只是第幾個活動）
function termWeekOf(a) {
  if (typeof TERMS === 'undefined' || !a || !a.date) return null;
  const DAY = 864e5, d = new Date(a.date + 'T00:00:00');
  for (const t of TERMS) {
    const w = Math.floor((d - new Date(t.start + 'T00:00:00')) / DAY / 7) + 1;
    if (w >= 1 && w <= t.weeks) return w;
  }
  return null;
}

// 活動的所有上課日期（date 加上 also），以及學習地圖上顯示的週次文字，例如「第 8 週」或「第 8–10 週」
const datesOf = a => [a.date, ...(a.also || [])].filter(Boolean).sort();
function termWeekLabel(a) {
  const ws = datesOf(a).map(d => termWeekOf({ date: d })).filter(Boolean);
  if (!ws.length) return '';
  const lo = Math.min(...ws), hi = Math.max(...ws);
  return lo === hi ? '第 ' + lo + ' 週' : '第 ' + lo + '–' + hi + ' 週';
}
