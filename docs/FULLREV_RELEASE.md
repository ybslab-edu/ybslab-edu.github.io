# 新版完整發布產物

正式發布只能使用 `tools/build-fullrev-site.mjs` 的新目錄，不發布 repo root。現有 source 開關保持 false，切換 enabled:true 的兩站 patch 與操作順序在 ClassScore `docs/ybs-fullrev/cutover-runbook.md`；先填正式公開值再核准切換。設定不存在即停止，只有明確 false 走舊模式。正式產物的 login.js 僅保留新版 facade，連 false 也不能回舊專案。

```sh
flock /home/teacher/.cache/ybs-heavy-test.lock node tools/build-fullrev-site.mjs build --config /tmp/ybs-public-config.json --out /tmp/ybs-release --worker-source /path/to/classscore/workers/ybs-grader
flock /home/teacher/.cache/ybs-heavy-test.lock node tools/build-fullrev-site.mjs scan --out /tmp/ybs-release --worker-source /path/to/classscore/workers/ybs-grader
```

公開 config JSON 需 `enabled:true`、`firebase:{projectId,apiKey,messagingSenderId}`、HTTPS workers.dev `workerOrigin`（無結尾斜線）、固定 `readModelModule:"/assets/fullrev-read-model.mjs"`。ClassScore／pilot／demo／REPLACE 專案均拒建；缺 read model 或 Worker 私有來源直接失敗。輸出路徑必須不存在且在 source 外。

新站 g9 產物含全部 30 活動／121 關、首頁、學習地圖、關於、404、課程入口、30 個舊 wNN 轉址、成長、教師匯出與 DF 師生頁及必要資源；前端教師碼、遮罩與舊自報 client 不在發布樹。現行 DF 師生頁與指定 legacy 資源由 builder 按固定來源雜湊保留相容流程，DF 頁使用獨立 legacy login／停用新版設定；不能把通用 DF 預覽分支當作現行正式入口。`/ybs-old/` 是另外維護的舊站，整站產物不能佔用該路徑。

read model 同源模組只呼叫同一 grader Worker 的 context／controls／progress／df-content／df-roster／df-preview，帶新專案當前登入的 ID token。後端每次重查綁定、subject、期限與控制版本，分頁前後版本不一致就待確認；不直接 list 私有 gates 或結果、不猜空集合。DF 教師名冊由 owner-only 最小班座投影取得；owner 預覽題面仍重查新專案 teacher／course owner，示範不送成績。DF 每 UID／堂槽的改稿更新冷卻 60 秒，冪等相同 payload 不重寫；失敗保留待送與下載檔。

全樹 scanner 對精確檔案白名單、symlink、map／備份／工具、舊服務／教師碼、全部八批私有版本與 1,817 題例、私有照片／素材作強制比對。回報檔數、零命中與 tree SHA-256；發布下載後重掃並核對摘要相等，不能掃一棵樹再發布另一棵。公開教材舊版本與 Git 歷史無法收回；沿用現有題目仍須教師現場抽查。

現行流程由 Console 將這份產物發布至 `gh-pages /`；`main` 僅保存來源，推送或合併不會更新正式站。不更改 Pages 設定或 workflow。Console 發布器位於主控台的 `tasks/ybs-newsite-20261123/publish-next.sh.draft`；營運與回退順序沿用 ClassScore `docs/ybs-fullrev/cutover-runbook.md`，不要把主控台當日操作清單複製到本 repo。

## 前端 CI 與本機跨 repo 驗收

`.github/workflows/ci.yml` 沿用 main 的公開前端驗收，只 checkout 本 repo，不讀取私人 `ybslab-edu/classscore`，也不設定 `YBS_WORKER_SOURCE`。公開 repo 的 `GITHUB_TOKEN` 無權讀取該私人來源；不新增 secret／PAT、不擴大權限。

未設定 `YBS_WORKER_SOURCE` 時，CI（`CI=1`）沿用 main 的略過語意：batch1 的 Worker 瀏覽器流程、batch2～7 的私有產物掃描、legacy-progress 的兩項 Worker 整合，以及 answer-scan、fullrev-release、fullrev-csp、fullrev-df-teacher 需要私有來源的驗收會列出 skip；同檔不依賴 Worker 的測試照常執行。

本機未設定來源時，answer-scan、fullrev-release、fullrev-csp 與 fullrev-df-teacher 四項必要驗收仍失敗；原本允許略過的 batch／legacy 測試維持 skip，TAP 會列出設定方式。明確設定來源後，CI 與本機都會檢查必要檔案；來源不存在或不完整均失敗。

發布前在固定、已審查的前端 checkout 執行單一離線入口（現有 Node 24、Python Playwright；Worker wrapper 另需既有 Node 22、Java 21、Firestore JAR 與可用 bwrap，不安裝或下載）：

```sh
node tools/release-offline-gate.mjs run --worker /path/to/fixed-classscore/workers/ybs-grader \
  --front-commit FRONT_SHA40 --worker-commit WORKER_SHA40 --out /tmp/ybs-offline-NEW
node tools/release-offline-gate.mjs verify --worker /path/to/fixed-classscore/workers/ybs-grader \
  --front-commit FRONT_SHA40 --worker-commit WORKER_SHA40 --evidence /tmp/ybs-offline-NEW/evidence.json
```

入口按順序執行既有 Worker `cutover/test.sh` 全部 tests、前端 `tests/*.test.mjs`（序列，包含四項必要私有來源驗收）、兩份 DF CJS 及 `tools/dev/check-pages.py` 全站 mock 回歸。Worker wrapper 沿用既有共用鎖；執行時不要併跑其他重測試。前端與 mock 回歸也在離線網路命名空間執行，HTTP 只 bind loopback。清除 CI／測試跳過開關，只用合成資料；缺件或任何必要測項 skip／todo／失敗均無通過證據。舊站教師通行碼解鎖是原腳本明示的選用項，本入口不提供 secret，僅此項列未驗，不作發布功能通過聲明。ClassScore 的整站品質 gate、審查、正式部署與人工冒煙仍照營運手冊另外驗收。

每次使用全新輸出目錄，保留 `evidence.json`、`isolation.log`、各階段完整 log、exit code 與測試統計。證據記錄前端／Worker commit 及固定程式、測試、gate 的 SHA-256 指紋；不讀 Git 或 credential。commit 標籤由操作者提供，發布器再以相同固定 commit 的 archive 實際內容核對，不能把任意 checkout 的通過證據套上另一版。測試中來源有變也會失敗。隔離失敗或套件未完成時只留下 failed 證據；未執行階段不得視為通過。

Console 發布器的 dry-run 與 apply 都必填 `--offline-evidence /tmp/ybs-offline-NEW/evidence.json`，在建置與 stage 前驗證兩個固定來源及原始 log，並將證據與完整 log 複製至該次發布目錄重驗；缺跑、failed、缺紀錄或版本不同即拒絕。SHA 或來源有更新須重跑；公開 CI 通過只能代表不依賴私有來源的驗收通過，不能取代此 gate 或發布核准。
