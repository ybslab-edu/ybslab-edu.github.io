# YBS Lab：AI 工作指引

## 專案與入口
- 本檔是唯一 AI 入口；以繁體中文簡潔回覆，不在 repo 維護交接快照、進度或待辦。
- `ybslab-edu/ybslab-edu.github.io` 是教學靜態網站，提供課堂活動、成績碼與報告交件。
- 網站：<https://ybslab-edu.github.io/>；HTML、CSS、JavaScript 直接提供服務，無建置步驟或套件安裝需求。
- ClassScore 位於 `ybslab-edu/class-score`；兩站共用 Firebase，跨站資料規格見該 repo 的 `docs/YBS_FIRESTORE.md`。

## 主要目錄
- `index.html`：學期進度；`map/`：課綱學習地圖；`about/`：關於與著作權。
- `115-g9/`：九年級活動與教師成績彙整；活動資料夾 `uU-NN/`＝單元＋該單元第幾個活動；`115-df/`：專題學生頁及教師報告彙整。
- `assets/activities.js`：唯一活動登記處；`assets/curriculum.js`：課綱、課程與學期。
- `assets/shell.js`、`assets/shell.css`：活動共用外框；過關須連續答對兩組不同資料。
- `assets/codec.js`：共用成績碼；`assets/teacher.js`：教師模式；`assets/lock.js`：活動開放清單。
- `assets/login.js`：學生帳號密碼登入、過關紀錄與報告交件；登入失敗可改用班座及成績碼。
- `assets/df-report.js`：報告白名單與編解碼；`assets/df-teacher-cloud.js`：教師雲端報告操作。
- `docs/DF_REPORT_FORMAT.md`：報告格式規格；`tests/`：合成資料測試；`tools/dev/`：本機回歸及 Firebase mock。
- `lab/login-test/`：隔離的登入測試頁；`assets/vendor/`：固定版本的第三方程式庫。

## 建置、產生資料與測試
- 在 repo 根目錄執行；需要 Node.js、Python 3。瀏覽器測試另需已安裝的 Playwright 與 Chromium。
- 修改 `assets/activities.js` 後執行：
  ```sh
  node tools/activities-json.mjs
  ```
- 驗收完整指令（第一項也會執行瀏覽器測試）：
  ```sh
  node --test tests/*.test.mjs
  node tests/df-report.test.cjs
  node tests/df-teacher-cloud.test.cjs
  ```
- 若 Playwright 不在預設模組路徑，先將 `PLAYWRIGHT_MODULE` 設為既有 `playwright/index.mjs` 的絕對路徑，再執行上述指令；缺少依賴時如實回報，不為文件整理新增套件。
- 本機全站回歸：在一個終端機啟動伺服器，另一個終端機執行檢查（Python 環境需有 Playwright）：
  ```sh
  python3 -m http.server 8765 --bind 127.0.0.1
  ```
  ```sh
  python3 tools/dev/check-pages.py
  ```
- 全站回歸用 `tools/dev/firebase-mock.js`，不連正式 Firebase；教師解鎖檢查由教師在本機安全提供 `YBS_TEACHER_CODE`，未提供時跳過。
- 活動邏輯變更須驗證有解、錯答不會通過、產生器不會無限迴圈；測試只用合成資料。

## 維護規則與部署
- 活動 `week` 須與活動頁的 `WEEK` 活動序號一致（成績碼用），與資料夾 `uU-NN/` 無關，改名不能改動；學期週次依 `date` 計算，不可混用。舊 `wNN/` 是轉址頁，勿刪。
- 每週開放活動須修改 `assets/lock.js` 的 `OPEN`，並同步 `tools/dev/check-pages.py` 的開放預期；前端鎖不具授權保護能力。
- 新增外部字型、CDN、iframe 或 API 時，須同步檢查各頁 CSP；更換教師通行碼雜湊時同步更新引用的快取版本。
- 一個功能一個 Draft PR；合併與發布須先取得老師明確核准。
- 本 repo 的 `main` 更新即由 GitHub Pages 上線（純文件也會）；ClassScore 的 Hosting 要手動觸發 workflow 才發布。
- ClassScore 的 `firestore.rules` 變更會自動部署 Rules，YBS 共用這份 Rules；權限與模擬器測試維護在 ClassScore，不再要求手動發布。
- commit 用中文短句，結尾依工作階段附正確的 `Co-Authored-By` 署名。

## 禁止事項
- 不收學生姓名；身分證字號絕不能經過 AI 對話、檔案或 repo；不得寫入 secret、真實名單、帳密或其他個資。
- 帳號由教師在 ClassScore 第 7 區的瀏覽器流程建立；教師通行碼只存雜湊，明碼由老師保管。
- 不得操作正式教師資料（Firestore `users/{uid}/…`）；測試不得對正式資料讀寫或清理。
- 不得擅改資料結構、Firestore 路徑、報告白名單及版本；格式以既有規格與測試為準。
- `assets/codec.js` 的成績碼格式不要改，須維持既有成績碼相容性。
- 網站不出現「數位鑑識」；首頁不放「本週」卡片。
- 重建專題活動頁時保留 github.io 探測守門；共用課綱有全域 `N`、`DESC`，活動頁避免撞名。
- 不擅自升級 Firebase Spark 方案；不得擅自放寬 CSP、雲端權限或著作權；`LICENSE` 為全權保留，可瀏覽、不可轉用。
