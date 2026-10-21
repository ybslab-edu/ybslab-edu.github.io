# DF 報告格式 v1（DF-3A）

共用程式：`assets/df-report.js`，一般 script 載入後使用 `DFReport`；Node 以 `require` 載入。無外部套件、網路、登入或儲存副作用。學生頁只讓本機 `reportHTML` 使用共用 serializer，原 `importReport` 不變。本階段沒有上傳按鈕、Firestore 或完成時自動交件；這些由 DF-3C 接續。

## API 與版本

- `select(state)`：建立獨立的白名單報告物件，不修改原狀態。
- `serialize(state)`：將白名單報告序列化為 JSON，`</` 轉成 `<\/`，可嵌入既有 `df-report` script。保留既有 `app: 'DF-investigation'`、`appVersion`、教材 `version`；不把 envelope 混入本機報告，舊匯入流程仍可直接讀取。
- `await encode(state)`：當次呼叫先同步建立 JSON 快照。成功回傳 `{ok:true, schemaVersion:1, encoding, payload}`；後續寫入只取 `schemaVersion`、`encoding`、`payload`，**不要把 `ok` 寫進 Firestore 文件**。
- 失敗回傳 `{ok:false, action:'download', reason, message:'報告過大，請下載報告檔交給老師'}`。`reason` 可為 `invalid-report`、`json-too-large`、`compression-unavailable`、`compression-failed-or-too-large`、`payload-too-large`。呼叫端依 `action` 提示既有下載方式；不能宣告交件成功，不截斷答案或 log。格式／能力問題的原因可另依 `reason` 提示。
- `await decode(envelope)`：驗證 envelope 版本、編碼、大小、ASCII，解碼及驗證白名單資料後回傳報告物件。錯誤會 throw；讀取端應個別略過並提示原因，不執行上傳的 HTML。

`schemaVersion` 為雲端 envelope 版本，與教材 `version`、應用程式 `appVersion` 分開。未支援版本直接拒絕。

後續文件仍依設計使用 `ybsCourses/115-df/reports/{uid}_s{session}`（session 1～3），每堂覆寫最新一份。`uid`、roster 驗證的整數 `cls/seat`、伺服器 `createdAt/updatedAt` 由 DF-3B／3C 處理，serializer 不採信匯入檔的登入身分，也不產生這些 envelope 欄位。本人及 owner 的讀取權限由 Rules 負責，編碼不代表加密或授權。

## 白名單與相容性

白名單明列於模組 `fields`：

| 範圍 | 保留內容 |
| --- | --- |
| 頂層 | app、appVersion、version、cls、seat、started、briefed、round2、problem |
| 第一堂 | susp 的 text/ev/want/conf、pred、s2.unlockedAt、l01、第一批六項證據的 fact/interp/exif、九個固定時間線槽、h1 |
| 第二堂 | b2 的 unlockedAt、四項第二批證據的 key/rel/why/exif、hints.level/at、h2、concl |
| 第三堂 | gallery 的 comments.seat/stance/ev/text/at 與 after、reveal 的 unlockedAt/finalAt/tlnote/r1～r4/calc |
| 過程 | exports 時間、log.t/e/d（d 僅允許純量，不接收物件） |

每層只複製已知欄位；排除 `b2.pw`、`reveal.pw`、姓名、email、帳密、Token、UID、教材、影像、解密包、未知匯入欄位，以及本機連線識別 `cid`／解答模式 `ansMode`。`cid` 在原 `boot` 會重新產生，不影響恢復作答。舊證據 `interp` 仍保留；舊檔缺少選填欄位時不擅自填值。未修改既有 `importReport` 的版本／班座檢查及舊資料補值流程。

班座、操作時間、自由作答及留言仍可能識別學生；此模組只排除結構性個人欄位，無法辨識自由文字內自行輸入的姓名或聯絡資料。後續介面仍需提醒勿填這些資料。

解碼端在 JSON 大小界限外另檢查欄位型別及陣列上限：證據引用 100、自我檢核 4、疑點／留言各 1,000、提示／下載時間／log 各 20,000 筆。這些是讀取端防護上限，不是頁面宣稱的最大作答量。encode 使用相同防護；超過則改下載。serialize 的本機下載不套用容量或筆數上限，保留全部白名單作答及紀錄。

## 容量與編碼

1. 跳脫 `</` 後的 JSON 以 UTF-8 計算，原文不得超過 2 MiB（2,097,152 bytes）。
2. 優先 `ascii-json`：將 U+007F～U+FFFF 的各 UTF-16 code unit 轉成六字元 `\uXXXX`；emoji 轉成兩個 surrogate escape。JSON 本身會跳脫控制字元，因此 payload 僅含可列印 ASCII。上限 512 KiB（524,288 bytes），等於字串長度。
3. ASCII 超限才對原 UTF-8 JSON 使用 `CompressionStream('gzip')`，標準 base64 編碼成 `gzip-base64`。依 **base64 後** 的大小檢查相同 512 KiB 上限；gzip byte 數不足以判斷能否交件。缺少壓縮／解壓 API、壓縮失敗或超限皆改下載。
4. 解碼先檢查 payload 容量及可列印 ASCII，嚴格驗證 base64，再以 `DecompressionStream('gzip')` 串流讀取。累計輸出超過 2 MiB 即取消 reader，不等到完整解壓或 JSON.parse。UTF-8 非法、損壞 gzip、JSON 錯誤或型別不符均拒絕。

Firestore 文件上限為 1 MiB；512 KiB payload 預留其餘 envelope、文件名稱等開銷，但不是完整文件大小計算器。後續 Rules 必須限制 envelope 欄位，並設定 payload 索引豁免。此模組不變更 Rules、索引或雲端設定。

## 本機驗證

執行 `node --test tests/df-report.test.cjs`，或 `node tests/df-report.test.cjs` 查看逐項結果。只用合成班座 `999/99`、固定時間及亂數文字，從公開結構擷取原 blankState／reportHTML／importReport 驗證，不讀瀏覽器儲存或解密素材。

涵蓋空白／一般資料、三堂各自長答與 5,000 筆 log 的壓力情境、512 KiB 與 2 MiB 邊界、base64 膨脹、不可壓縮文字、缺少 API、損壞資料及壓縮炸彈、白名單排除、狀態不變、舊報告與實際新 HTML 的匯入相容。原頁長答與紀錄沒有全域最大量，故不存在可枚舉的「所有最大作答」；測試另用容量與筆數上下界驗證超限策略。
