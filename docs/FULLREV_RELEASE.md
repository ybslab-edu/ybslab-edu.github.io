# 新版完整發布產物

正式發布只能使用 `tools/build-fullrev-site.mjs` 的新目錄，不發布 repo root。現有 source 開關保持 false，切換 enabled:true 的兩站 patch 與操作順序在 ClassScore `docs/ybs-fullrev/cutover-runbook.md`；先填正式公開值再核准切換。設定不存在即停止，只有明確 false 走舊模式。正式產物的 login.js 僅保留新版 facade，連 false 也不能回舊專案。

```sh
flock /home/teacher/.cache/ybs-heavy-test.lock node tools/build-fullrev-site.mjs build --config /tmp/ybs-public-config.json --out /tmp/ybs-release --worker-source /path/to/classscore/workers/ybs-grader
flock /home/teacher/.cache/ybs-heavy-test.lock node tools/build-fullrev-site.mjs scan --out /tmp/ybs-release --worker-source /path/to/classscore/workers/ybs-grader
```

公開 config JSON 需 `enabled:true`、`firebase:{projectId,apiKey,messagingSenderId}`、HTTPS workers.dev `workerOrigin`（無結尾斜線）、固定 `readModelModule:"/assets/fullrev-read-model.mjs"`。ClassScore／pilot／demo／REPLACE 專案均拒建；缺 read model 或 Worker 私有來源直接失敗。輸出路徑必須不存在且在 source 外。

產物含全部 31 活動／124 關、首頁、學習地圖、關於、404、課程入口、30 個舊 wNN 轉址、成長、教師匯出與 DF 師生頁及必要資源；前端教師碼、遮罩與舊自報 client 不在發布樹。DF 題面 scripts 由受控 API 讀取，不在公開 HTML；正式 contents 的 data.scripts 應由使用者核准工具準備，`pub`／`enc-b2`／`enc-rv` 與 contentHash 對齊，不上傳 teacher ANS。

read model 同源模組只呼叫同一 grader Worker 的 context／controls／progress／df-content／df-roster／df-preview，帶新專案當前登入的 ID token。後端每次重查綁定、subject、期限與控制版本，分頁前後版本不一致就待確認；不直接 list 私有 gates 或結果、不猜空集合。DF 教師名冊由 owner-only 最小班座投影取得；owner 預覽題面仍重查新專案 teacher／course owner，示範不送成績。DF 每 UID／堂槽的改稿更新冷卻 60 秒，冪等相同 payload 不重寫；失敗保留待送與下載檔。

全樹 scanner 對精確檔案白名單、symlink、map／備份／工具、舊服務／教師碼、全部八批私有版本與 1,817 題例、私有照片／素材作強制比對。回報檔數、零命中與 tree SHA-256；發布下載後重掃並核對摘要相等，不能掃一棵樹再發布另一棵。公開教材舊版本與 Git 歷史無法收回；沿用現有題目仍須教師現場抽查。

Pages 建議改為 Actions 發布這份 artifact；也可由 Console 決定獨立產物分支。root main 仍不能當新版安全發布。

## 前端 CI 與本機跨 repo 驗收

`.github/workflows/ci.yml` 沿用 main 的公開前端驗收，只 checkout 本 repo，不讀取私人 `ybslab-edu/classscore`，也不設定 `YBS_WORKER_SOURCE`。公開 repo 的 `GITHUB_TOKEN` 無權讀取該私人來源；不新增 secret／PAT、不擴大權限。

未設定 `YBS_WORKER_SOURCE` 時，CI（`CI=1`）沿用 main 的略過語意：batch1 的 Worker 瀏覽器流程、batch2～7 的私有產物掃描、legacy-progress 的兩項 Worker 整合，以及 answer-scan、fullrev-release、fullrev-csp、fullrev-df-teacher 需要私有來源的驗收會列出 skip；同檔不依賴 Worker 的測試照常執行。

本機未設定來源時，answer-scan、fullrev-release、fullrev-csp 與 fullrev-df-teacher 四項必要驗收仍失敗；原本允許略過的 batch／legacy 測試維持 skip，TAP 會列出設定方式。明確設定來源後，CI 與本機都會檢查必要檔案；來源不存在或不完整均失敗。

發布前須在本機指定既有 Worker 套件目錄，取消 `CI`，執行完整驗收並核對前端與 Worker 的 commit。公開 CI 通過只代表不依賴私有來源的驗收通過，不能取代本機跨 repo 驗收或發布核准。
