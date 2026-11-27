# rf-front 審查修正進度

2026-11-27：依本次明確要求記錄進度，保留工作樹既有變更。

- 審查：兩項 P2，無 P0／P1。
- P2-1 已完成：start 在排隊前記錄獨立版本，取消即作廢；context、token、回應及重試階段均檢查。補測等待 context、排隊、取 token 期間取消，以及取消後可重新開始。
- P2-2 已完成：班座最小摘要保存完成時控制版本／configVersion／三種 epoch；重整先讀受控 context 核對，有效後才顯示完成與解鎖。核對不延長原期限；舊版缺版本、核對失敗或版本不符就清除，多關核對途中版本變動亦撤銷舊摘要。
- 測試新增 12 項，流程共 `23 / 23`；真實 Worker 外框 `43 / 43`；班座整合 `2 / 2`，包含 MemoryFirestore 教師退回及 reset-round 後重整、精確請求序列、下一關重新鎖定及原資料不變。未放寬斷言。
- 純 Node 85 檔逐檔獨立程序：`files 85 / pass 85 / fail 0`；實際案例 `tests 860 / pass 858 / fail 0 / cancelled 0 / skipped 2`。輸出 `/tmp/rf-front-review-isolated.log`、`/tmp/rf-front-review-unit.TRDDfe/`。2 項為原有 Playwright 路徑／socket 沙箱環境 skip，未新增 skip。
- CJS：df-report `14 / 14`，df-teacher-cloud `2 / 2`；輸出 `/tmp/rf-front-review-df-report.log`、`/tmp/rf-front-review-df-cloud.log`。發布掃描、版本、產生器已納入全套通過；語法及 diff 檢查通過。
- 曾將全套放在同一 Node 程序試跑，受既有全域 document 設定互相干擾而失敗；改逐檔獨立程序後通過，未修改相關斷言。先前分組測試的合成 admin operationId 缺漏亦已修正並通過真實 Worker 重設測試。
- 瀏覽器 7 項均在 Chromium 啟動時受限：`sandbox_host_linux.cc:41 ... Operation not permitted (1)`；`df-teacher-cloud.test.mjs` 同樣受限。輸出 `/tmp/rf-front-review-browser.log`、`/tmp/rf-front-review-df-browser.log`，不宣稱通過。
- 唯一待補驗證：在 Console 執行 `/home/teacher/projects/console/tasks/ybs-newsite-20261123/night/rf-front-console-rerun.sh`。腳本逐檔獨立程序、提供既有 Playwright 路徑、隔離外網、僅用 loopback／合成資料，已 `bash -n` 通過。
- 已更新 night/rf-front-pr.md，保留預覽與 gh-pages 既有發布流程位置；其餘原有未提交變更保留。Rules 無需修改，未修改 Worker、雲端資料結構或正式環境。
- 行為差異：教師退回／重設或舊版摘要缺版本時，重整清除摘要並按現行鎖定規則重新取題；有效回看仍零 start。正式已過關重抽題仍受既有 Worker 完成回條協定限制，需另案確認。
- 重測試全部使用 `/home/teacher/.cache/ybs-heavy-test.lock`；沒有執行 cutover/test.sh 或任何正式 cutover／回填／遷移。
- 限制：不連外、不讀 secret、不 commit、不推送、不部署、不執行 cutover／回填／遷移、不新增套件。
