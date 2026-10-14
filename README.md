# YBS Lab｜Why · Because · So

個人教學網站：課堂活動、作品集與教學紀錄。每門課每週一個 45 分鐘課堂活動。學生免登入，填班級座號後開始，過關後產生成績碼；老師在教師專區貼上成績碼，依週次與班級匯出 Excel。

## 網站結構

| 路徑 | 內容 |
| --- | --- |
| `index.html` | 首頁：學期進度（依日期捲到本週）、課綱學習地圖（國中／高中必修／高中選修三個分頁，放射地圖或路線清單） |
| `assets/curriculum.js` | 課綱資料 `CURRICULA`：國中、高中必修、高中加深加廣「進階程式設計」的學習內容、年級、細項與附錄三說明（依 107 年 9 月科技領域課綱）；另有開設中的課程 `COURSES`、學期 `TERMS` |
| `assets/activities.js` | 所有課堂活動，用 `codes` 掛到地圖車站、用 `date` 排進學期進度 |
| `about/` | 關於頁：網站來歷、關於作者、資料來源與 AI 協作 |
| `assets/codec.js` | 成績碼編碼與解碼，所有課程共用 |
| `115-g9/` | 115 學年九年級資訊科技（學生入口） |
| `115-g9/weeks.js` | 該課程的週次清單：標題、主題、關卡名稱 |
| `115-g9/w01/` … | 每週活動頁 |
| `115-g9/teacher/` | 該課程的教師成績彙整（資料只存在老師自己的瀏覽器） |

新的學年或課程：複製一個課程資料夾（例如 `116-g8/`），清空週次，並在 `assets/curriculum.js` 的 `COURSES` 加一筆。

## 第一次上線（GitHub Pages）

1. 把這個資料夾推到組織 `ybslab-edu`（YBS Lab for Education）底下、名為 `ybslab-edu.github.io` 的公開儲存庫，`main` 分支。
2. 到儲存庫的 Settings → Pages，Source 選「Deploy from a branch」，分支選 `main`、資料夾選 `/ (root)`，按 Save。
3. 約一分鐘後，網址會出現在同一頁，網址為 `https://ybslab-edu.github.io/`。

## 每週新增一課

1. 在課程資料夾新增 `w02/`，放入 `index.html`，頁面開頭設定 `const WEEK=2;`，並載入 `../../assets/codec.js`。
2. 在課程的 `weeks.js` 最後加一筆，`rounds` 的順序要和活動頁的關卡順序一致（最多 6 關）。
3. 在 `assets/activities.js` 最前面加一筆，填上對應的課綱代碼 `codes` 與上課日期 `date`，地圖和學期進度會自動更新。
4. 推上 `main`，網站自動更新。

## 成績碼

- 16 碼（例如 `E2K5-H7W2-FZFX-3M1A`），包含班級、座號、週次、各關是否過關、各關嘗試次數、時間與檢查碼。
- 學生改動任何一碼都會驗證失敗。
- 第 1 週試跑時發出的 13 碼舊格式，教師專區仍可讀取。
- 不含姓名或其他個資。
