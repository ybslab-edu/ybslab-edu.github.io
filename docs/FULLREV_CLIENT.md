# YBS 新流程前端接線

依據 ClassScore `docs/ybs-fullrev/data-contract.md`（含 11/20 Console 定四項）、
`identity-reset-transfer.md`、PR2 `workers/ybs-grader/FORMAL.md` 與 PR3
`firebase/ybs/README.md`。本檔說明前端介面，不新增 Firestore 集合、管理 endpoint 或採計政策。

`assets/fullrev-config.js` 的 `YBS_FULLREV_CONFIG.enabled` 是唯一切換開關，預設 `false`。
關閉時 `login.js`、SHELL、成長頁及教師匯出使用原流程，且不載入新 client／UI／讀取 adapter。
無網址、localStorage 或連線失敗 fallback 可切換來源。
開啟時只初始化具名 `ybs-fullrev` app；拒絕空設定、ClassScore、pilot 與模擬專案。
正式專案／Worker 未核准配置前不具備啟用條件。既有 CSP 保持原值；切換窗口須把
精確新 Firebase Auth frame origin、Worker connect origin 與授權網域一起核對，不能先加萬用字元。

## 身分與作答

學生 Google／password／匿名 guest 使用新專案 SESSION Auth。Google owner 另須由 server
單筆讀取確認 `ybsTeachers/{uid}.enabled`、已驗證 Google provider 與課程 ownerUid。
只有教師文件查詢的 `permission-denied` 視為非教師，學生登入／還原繼續；其他查詢錯誤仍失敗，教師入口仍須 owner。
教師示範及未核發 guest 的本機練習不呼叫判題 API、不寫過關或 XP。
claim 只讀 `ybsClassKeys[course]`；subject／版本只能由受控讀取 adapter 提供，不能自填班座授權。

`fullrev-client.mjs` 使用 PR2 精確 `/start`、`/answer`、`/resume` JSON 與 8KiB 上限。
原 requestId、sid、seq、slot、epochs 與答案保存在以 project／course／UID／subject 分隔的
分頁草稿；題面只在記憶體，沒有 token、私有答案或舊 attempts 的寫入旁路。
網斷、429／503 依 Retry-After 與有界退避重試；401 只強制刷新一次。
完成回條或 403／409／410 等不可重試回應會清除原草稿；作廢後要求重新開始，不搬用舊答案或替舊請求換版本。
八份上限只計進行中／待送草稿，還原時先剔除舊完成／作廢草稿；完成回條仍不直接新增進度或 XP。
換人同步清空畫面／草稿並廣播身分標記；舊分頁、慢登入及遲到回應不能套用到新身分。
還原也須同 UID 與同標記，題面經 resume 重新授權。pagehide 清除題面及進度投影。

PR6 以 `cfg.renderQuestion(question, host, api)` 提供純題面 renderer，回傳 `{get()}`。
本前端不呼叫既有活動的 `gen/check/fill` 當正式判題；沒有 renderer 就不開正式開始按鈕。
`cfg.demonstrate(host)` 是純本機示範接點，不傳入 client。錯答保留同題；第一組正確後
按「下一組」才呈現預載題面。completed 回條仍須 fresh progress 確認，不先加 XP 或綠勾。
DF 正式判題／報告切換介面須由對應活動／遷移流程接妥；此入口拒絕把 DF 送成 g9 過關，
也不在切換模式沿用舊 DF 教師 app 或補寫報告。

## 受控讀取 adapter

PR3 禁止瀏覽器 list roster／validatedResults，也禁止讀 private gate／head。
PR2 目前只提供判題端點；本前端不杜撰已部署的清單 API。
設定 `readModelModule` 為經審查的同源模組；該模組匯出
`createReadModel({session, project, course})`，以新專案身分連受控後端，提供下列內部函式。
未接妥時顯示待確認並停用正式作答／XP／匯出，不回退為 Firestore list。

| 函式 | 前端需要的最小資料 |
| --- | --- |
| `context({course,classKey,activity,round})` | schemaVersion=1、sourceProject、course、uid、subject、classKey、activity、round、configVersion、bindingVersion、unitEpoch、roundEpoch、classUnitEpoch、controlVersions |
| `controls({course,classKey,activity?,limit})` | 當前 gateVersion／classGateVersion；必須 fresh-read、經本人或 owner 授權 |
| `page({course,classKey,activity?,limit,cursor,controlVersions})` | 契約 §6 的有界投影；schemaVersion、sourceProject、course、classKey、state='confirmed'、controlVersions、records、complete、nextCursor；本人另給 subject，教師另給最小 people（subject／cls／seat／provider） |

以上是 adapter 的 JavaScript 介面，並非要求後端採相同 endpoint／傳輸格式。
records 保留契約結果白名單、resultId、原 xpPolicySnapshot 與 validity。
validity 使用 `{state:'effective',controlVersions}`、`{state:'excluded',reason}` 或
`{state:'unknown',reason}`；受控服務須在相同控制快照核對 subject、epoch、可接受版本及來源，
不把「可讀歷史」當有效。consumer 不自行猜 epoch0 或拿私有 gate 作學生投影。
people 在分頁間不可重複；有下一頁時 `complete:false` 及非空、不重複游標，末頁為
`complete:true,nextCursor:null`。單頁最多100結果，整批最多100頁，分頁前後重查控制版。
缺頁、碰撞、混版、換人、查詢失敗均清除採計快照並顯示待確認；確認後的空集合才可計0。

成長頁、徽章與教師 Excel 共用 `fullrev-progress.mjs` 的有效集合及 `xp.js` 同一計算核心。
Worker 結果只用 completedAt 與原 xpPolicySnapshot.openedAt，維持10／5／20及七天含端點；
重置／轉班／時窗覆寫不重開準時期限。缺快照的準時 XP 顯示待確認，不能補發或默扣5。
guest 帳號 XP、legacy XP 與人工關政策未核定，不自行升格採計；舊來源仍由關閉開關的舊流程呈現。
教師下載當下重新查完整有效快照；任何 unknown 不產生成績檔，確認空結果可匯出空進度。

## 本機驗證

只用既存 Node／Playwright／Chromium；不安裝、不下載。以 Linux 網路命名空間保證只通 loopback：

```sh
unshare --user --map-root-user --net sh -c 'ip link set lo up && node --test --test-concurrency=1 tests/*.test.mjs'
```

Playwright 非預設路徑時先設定既存 `PLAYWRIGHT_MODULE`。另依 AGENTS 執行兩組 CJS 測試。
`tests/fullrev*.test.mjs` 使用合成 Auth／投影與本機 HTTP；外部網址由 route/mock 阻擋或替身處理。
`tools/dev/check-fullrev-worker.mjs` 可在同一隔離環境，設定 `YBS_WORKER_SOURCE` 指向既存 PR2
目錄，驗真正 Worker 產生器／交易／HTTP 協定與前端的三來源×三重置、重放、失聯重送、XP重算。
它用 MemoryFirestore 與合成驗證器，不證明 Rules、正式 Auth、實際計費／CPU或完整私有題庫上線。
