# 班座過關紀錄

九年級 `115-g9/u*/` 的共用作答外框支援班座作答自動上傳。帳號登入仍寫原本的 `attempts`；班座作答背景使用 Firebase 匿名登入，寫 `ybsCourses/{courseId}/guestAttempts/{uid}_{activity}_{round}`。共用同一份 `assets/login.js` Firebase 設定、10.14.1 compat SDK 與 SESSION 登入持續方式。DF 報告交件仍依既有報告流程。

資料契約以 ClassScore `docs/YBS_FIRESTORE.md` 的 guestAttempts 章節及 `firestore.rules` 為準。

## 學生與待送

- 作答、localStorage 進度與既有成績碼先照常完成；匿名登入或寫入失敗不阻擋過關，提示「紀錄暫存在本機，稍後自動上傳」。主控台只記固定前綴與錯誤代碼，不記班座、帳號或憑證。
- 寫入欄位只有 `activity`（整數 1–31）、`round`（0–5）、`level`（1–2）、`tries`（1–999）、`cls`（首位非零的三位數字字串）、`seat`（整數 1–60）、`verified:false`、`app:'ybs'`、`passedAt:serverTimestamp()`；`termWeek` 有值才送（1–30）。不送 UID 欄位、email、答案或成績碼。
- `localStorage` 的 `ybslab:guest:{課程}` 保存 `queue` 與 `receipts`，包含班座、關卡與匿名 UID 等必要識別資料。這些不是匿名化資料。開頁、下一次過關、恢復連線及每 60 秒重送；成功才移除待送，同班座同關去重。不同班座的待送依序重送，各自先建立正確的匿名身分。
- 成功證據按課程、班級、座號、UID、活動與關卡完整比對；已確認成功的同關重做不重寫。明確 `already-exists` 可當成功。**無成功證據的 `permission-denied` 保留待送**：匿名端不能 get／list，拒絕也可能代表課程關閉，不能據此宣稱已收到；重新開放後可重送。
- `sessionStorage` 的 `ybslab:guest-identity` 綁定當前匿名 UID 與班座。換班或換座號先 `signOut()`，成功後才重新匿名登入；同班座重新整理沿用原 UID。帳號登入不走匿名寫入。
- SESSION 遺失後重新匿名登入會產生新 UID，可能出現同班座重複紀錄，由老師核對。儲存空間不可用時只能暫存分頁記憶體，重新整理可能遺失待送，學生仍可用成績碼備份。

## 教師讀取

`115-g9/teacher/` 新增教師 Google 登入及「讀取雲端紀錄」。先以伺服器查詢確認 `ownerUid`，再單次讀取 `attempts`、`guestAttempts` 與 `roster`，不開持久化或即時監聽。教師頁不背景匿名登入。

此頁的 `script-src` 比照既有 DF 教師頁允許 `https://apis.google.com`，供 Firebase Google 彈出登入載入必要 SDK；其他 CSP 指令沿用既有範圍。

雲端表同時顯示帳號名單來源與「未驗證」班座來源，依來源、UID、活動與班座分列；不把不同 UID 或衝突班座的過關數自動相加。未知活動、格式異常及找不到名單的帳號紀錄略過並顯示筆數。所有雲端文字以 `textContent` 顯示。登出或 Auth 換人即清除雲端表，遲到回應不能恢復舊資料。

「下載雲端紀錄」另存包含來源與 UID 的 Excel，供老師檢查冒填及重複班座。原有成績碼表、每週／學期 Excel 的欄位與計算方式不變。ClassScore 原有技能匯入仍只讀原本 `attempts`，本段不把未驗證紀錄匯入技能成績。

## 本機驗收

只用合成資料及 mock，不對正式 Firebase 登入或讀寫。

```sh
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
# 使用環境既有 Playwright；若不在預設位置，設定其 index.mjs 的絕對路徑。
export PLAYWRIGHT_MODULE=/path/to/existing/playwright/index.mjs
node --test tests/*.test.mjs
node tests/df-report.test.cjs
node tests/df-teacher-cloud.test.cjs
```

純離線重點測試：`node --test tests/guest-attempts.test.mjs tests/guest-shell.test.mjs tests/guest-teacher.test.mjs tests/login-queue.test.mjs tests/shared-errors.test.mjs tests/asset-versions.test.mjs`。

完整瀏覽器流程：一個終端執行 `python3 -m http.server 8765 --bind 127.0.0.1`，另一個執行 `python3 tools/dev/check-pages.py`。它攔截 Firebase SDK 並封鎖其他外站，新增 `guest/cycle` 情境會走真實兩組作答、失敗待送、開頁重送、同班座沿用 UID、換班座登出、教師合併表／匯出、非 owner 拒絕。教師通行碼檢查未提供代碼則跳過，不需讀取任何 secret。

Console 可在已含第 1 段的 ClassScore 工作區補跑既有 Rules 關卡（需 Node、Java 21、既有鎖定依賴與 emulator；腳本會 `npm ci --ignore-scripts`）：

```sh
cd ~/projects/class-score
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"
bash scripts/ybs-rules-emulator.sh
```

預期 `YBS_RULES_EMULATOR_PASS`，只使用 `demo-classscore-ybs`，不部署。此關卡驗證 guestAttempts 欄位、權限與既有資料回歸；YBS 的上述單元測試另外驗證實際前端組裝資料及佇列／身分生命週期。
