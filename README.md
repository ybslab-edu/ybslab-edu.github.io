# YBS Lab｜Why · Because · So

個人教學網站：課堂活動、作品集與教學紀錄。每門課每週一個 45 分鐘課堂活動。學生以帳號密碼登入並確認班級座號，過關紀錄寫入 ClassScore；登入失敗時可改填班座並使用成績碼。老師可在教師專區彙整成績或讀取專題報告。開發與測試指引見 [AGENTS.md](AGENTS.md)。

## 網站結構

| 路徑 | 內容 |
| --- | --- |
| `index.html` | 首頁：學期進度（依日期捲到本週，同一活動連上多週會合併成一格） |
| `map/` | 課綱學習地圖（國中／高中必修／高中選修三個分頁，放射地圖或路線清單）；舊的 `/#S-IV-2` 連結會自動轉到 `map/#S-IV-2` |
| `assets/activities.json` | 由 `activities.js` 產生的公開清單（課程、活動序號、標題、關卡），ClassScore 讀它計算「過關數 ÷ 關卡數」。**改過 activities.js 後要執行 `node tools/activities-json.mjs`** |
| `assets/curriculum.js` | 課綱資料 `CURRICULA`：國中、高中必修、高中加深加廣「進階程式設計」的學習內容、年級、細項與附錄三說明（依 107 年 9 月科技領域課綱）；另有開設中的課程 `COURSES`、學期 `TERMS`（填開學日與休業式，週次自動計算） |
| `assets/activities.js` | 所有課堂活動（全站唯一登記處）：`codes` 對應學習地圖、`date` 排進學期進度、`rounds` 給教師專區 |
| `404.html` | 網址打錯時顯示的頁面 |
| `assets/favicon.svg`、`assets/og.png` | 瀏覽器分頁小圖示、分享到社群時的預覽圖 |
| `about/` | 關於頁：緣起、作者、資料來源與 AI 協作；頁尾有教師專區入口 |
| `assets/shell.js`、`assets/shell.css` | 活動頁共用外框（第 2 單元起）：填班級座號、基礎／進階分頁、單元進度條、成績碼、教師模式；各週頁面只寫關卡，過關要連續答對兩組不同的資料 |
| `assets/codec.js` | 成績碼編碼與解碼，所有課程共用 |
| `assets/teacher.js` | 教師模式通行碼（只存雜湊）。活動頁載入後，起始畫面有「教師登入」：可一鍵顯示答案、暫停播放、上一步／下一步、點步驟跳過去；教師模式不產生成績碼。通行碼只防學生隨手點開，不是帳號安全機制 |
| `assets/login.js` | 學生以帳號密碼登入，每過一關寫一筆紀錄到 ClassScore 的 Firebase（`class-score-86020`，結構見 class-score repo 的 `docs/YBS_FIRESTORE.md`）；`on` 為 false 時不啟用（維持班級座號＋成績碼） |
| `assets/vendor/` | 第三方程式庫的固定版本（教師專區匯出 Excel 用的 SheetJS），不從 CDN 載入 |
| `115-g9/w01/` … | 115 學年九年級的每週活動頁（`115-g9/index.html` 只是轉回首頁） |
| `115-g9/teacher/` | 該課程的教師成績彙整，入口在關於頁頁尾（資料只存在老師自己的瀏覽器） |
| `115-df/` | 數理資優班專題研究（七、八年級）：`a/` 是 A 版學生頁（單檔，第二批與揭露內容加密），`teacher/` 是老師彙整台（讀本機報告檔及雲端交件）。教材生成原始檔、密碼明碼與教師解答版不放這個公開儲存庫 |

新的學年或課程：新增課程資料夾（例如 `116-g8/`），複製 `teacher/` 並把裡面的 `COURSE` 改成新課程代號，再在 `assets/curriculum.js` 的 `COURSES` 加一筆。

## 部署

網站位於 `ybslab-edu/ybslab-edu.github.io`，`main` 更新即由 GitHub Pages 發布至 <https://ybslab-edu.github.io/>。一個功能一個 Draft PR，合併與發布前須取得老師明確核准。

## 每週新增一課

1. 在課程資料夾新增 `w02/`，放入 `index.html`，頁面開頭設定 `const WEEK=2;`，並載入 `../../assets/codec.js`。`w02`、`WEEK`、activities.js 的 `week` 都是「第幾個活動」（成績碼用）；分頁標題寫學期週次（例如第 8 週），首頁與教師專區會依 `date` 自動換算週次。
2. 在 `assets/activities.js` 最前面加一筆（全站只登記這一處），再執行 `node tools/activities-json.mjs` 更新 `assets/activities.json`：課綱代碼 `codes`、上課日期 `date`、週次 `week`、關卡名稱 `rounds`、`track`（必修或選修；選修是進度落後的班級可以跳過的活動）。學習地圖、學期進度、教師專區都會自動更新。
3. 每週開放活動時，更新 `assets/lock.js` 的 `OPEN` 並同步 `tools/dev/check-pages.py` 的開放預期。完成本機測試後開 Draft PR，經老師核准合併至 `main` 才會上線。

## 成績碼

- 16 碼（例如 `E2K5-H7W2-FZFX-3M1A`），包含班級、座號、週次、各關是否過關、各關嘗試次數、時間與檢查碼。
- 學生改動任何一碼都會驗證失敗。
- 第 1 週試跑時發出的 13 碼舊格式，教師專區仍可讀取。
- 不含姓名；班級、座號與操作時間仍可能識別學生，不得當成匿名資料。

## 安全注意

- 每頁 `<head>` 有一行 Content-Security-Policy；要新增外部字型、CDN、內嵌框或 API 時，記得一起改所有頁面的這一行。
- 成績碼、教師通行碼都在公開原始碼裡運作，只能防君子：成績碼可被會寫程式的學生偽造，教師模式也可以被繞過。重要成績請搭配課堂抽查。
- 九年級教師彙整的成績保存在老師的瀏覽器；專題教師端另可讀取雲端報告。請只在自己的電腦上操作。
