# YBS Lab — 給 Claude 的工作指引

**開始任何工作前，先讀 `docs/AI_HANDOFF.md`**（覆寫式交接檔，只留最新狀態），用幾句話向老師確認目前進度與下一步，再等指示。

## 必守規則
- 一律用**繁體中文**回覆，簡潔；有選項時用互動式選單問。
- 這個 repo 推上 main 就直接上線（GitHub Pages）。**一個功能一個 Draft PR**，趕課也一樣；合併前要老師明確核准。
- 相關的 ClassScore repo（`hs202864-art/class-score`）合併 main＝正式發布；它的 PR CI 要在 `.circleci/config.yml` 加暫時分支白名單、合併前移除。Firestore Rules 由老師在主控台手動發布。
- **個資**：不收學生姓名；**身分證字號絕不能經過對話、檔案或 repo**（學生帳號只在 ClassScore 第 7 區、老師的瀏覽器裡建立）。教師通行碼只存雜湊，不寫進 repo。
- 不得操作正式教師資料（Firestore `users/…`）。
- 網站不出現「數位鑑識」；首頁不放「本週」卡片。
- commit 訊息：中文短句，結尾兩行署名（`Co-Authored-By` 與該工作階段的 `Claude-Session` 網址）。

## 常用
- 改 `assets/activities.js` 後執行 `node tools/activities-json.mjs`。
- 每週開放新活動：改 `assets/lock.js` 的 `OPEN`（並同步 `tools/dev/check-pages.py`）。
- 本機回歸測試：`python3 -m http.server 8765` ＋ `python3 tools/dev/check-pages.py`。
- 成績碼格式在 `assets/codec.js`，**不要改**。
