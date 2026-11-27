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

## 前端 CI 的跨 repo 驗收

`.github/workflows/ci.yml` 使用既有官方 `actions/checkout@v6` 讀取 `ybslab-edu/classscore`，固定 P3 版本 `d604038e58a1efaa937b27adebd5b6975ab11c66`，只 checkout `workers/ybs-grader`，移至 runner 暫存目錄後設定 `YBS_WORKER_SOURCE`。權限維持 `contents: read`，不保存 Git 憑證、不部署、不上傳 Worker artifact。更換 SHA 時須重新執行跨 repo 驗收。

CI 在安裝瀏覽器前檢查 Worker 必要檔案；所有依賴 Worker 的核心測試也共用同一檢查。未設定來源、來源不存在或不完整均失敗，不能以 skip 換取綠燈。本機未設定來源時，answer-scan、fullrev-release、fullrev-csp 與 fullrev-df-teacher 四項必要驗收仍失敗；原本允許略過的 batch／legacy 測試維持 skip，TAP 會列出設定方式。明確設定錯誤路徑則失敗。

老師需確認來源 repo 的可見性與上述 SHA 可讀（離線作業無法查證）：

- 若來源公開且 SHA 可讀：不需設定 secret 或增加權限。
- 若來源私人：公開前端 repo 的 `GITHUB_TOKEN` 不能讀取其他私人 repo，這份 CI 會在 checkout 失敗。不要公開包含答案的 Worker，也不要擴大公開 workflow 的權限。
- 不需額外 secret 的替代方式：老師在私人 ClassScore repo 新增跨 repo 驗收 workflow；以該 repo 自己的 `contents: read` token checkout 上述固定 ClassScore SHA，再 checkout 公開前端待驗收的完整 SHA 到另一目錄，設定 `YBS_WORKER_SOURCE` 指向前者的 `workers/ybs-grader`，沿用前端 CI 的 Node／Python／Playwright 安裝及驗收指令，在前端目錄執行。前端版本同樣必須釘完整 SHA，並由老師核對私人驗收結果與 PR head 一致。此方式的結果不會自動回寫公開 PR check；公開 CI 仍會失敗，須由老師另行決定檢查配置，不能宣稱已取得跨 repo 綠燈。本次未新增或觸發私人 workflow。
