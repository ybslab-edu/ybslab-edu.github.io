# YBS Lab 交接（覆寫式，只留最新狀態）

最後更新：2026-10-15。新對話先讀完這份，再依「下一步」推進；不用從頭研究整個網站。

## 1. 專案與相關位置
- 網站：<https://ybslab-edu.github.io>，repo `ybslab-edu/ybslab-edu.github.io`（GitHub Pages，main 直接上線）。
- 課程總表（Claude Doc）：<https://claude.ai/code/artifact/786740a2-650d-47f2-90a4-3697cb72b7bd>
  - 主分頁：每週進度表（10/19 已登記「打王前記得存檔」）與節點表。
  - 分頁「上學期課程規劃（新版）」：21 週 3 單元＋4 條科技趨勢；子分頁「第 1 單元 系統平台」。
- 備課流程：技能 `weekly-it-lesson`（故事簡報＝Slides artifact＋分級活動頁＋登記到網站與總表）。
- 另一個專案 **ClassScore**（`hs202864-art/class-score`）有自己的交接檔，不在這裡處理。

## 2. 網站結構重點
- `assets/activities.js`：全站唯一活動登記處。`week`＝該課程第幾個活動（成績碼用，須等於活動頁 `WEEK`）；畫面上的學期週次由 `date` 算（`termWeekOf`、`termWeekLabel`）；`also` 可列重複上課日期。
- `assets/curriculum.js`：COURSES（`115-g9` 九年級必修、`115-df` 數位鑑識專題）與 TERMS。
- `assets/codec.js`：16 字元成績碼，**不要改**。
- `assets/teacher.js`：教師模式（密碼只存 SHA-256；密碼由老師保管，勿寫進 repo）。
- `assets/login.js`＋`tools/grade-upload/`：學校 Google 帳號登入＋過關自動上傳到老師的試算表。`clientId`、`endpoint` 仍空白＝未啟用，活動頁維持「班級座號＋成績碼」。
- 著作權：`LICENSE` 全權保留；頁尾與 `about/#h-rights` 寫「可瀏覽、不可轉用」。

## 3. 已上線內容
| 課程 | 活動 | 日期（學期週） | 狀態 |
| --- | --- | --- | --- |
| 115-g9 | w01 深夜手搖店 | 10/12（第 7 週） | 已上課 |
| 115-g9 | w02 打王前記得存檔 | 10/19（第 8 週） | 待上課；Slides artifact id `DRZXkw9NFTxty7SA4dzw3W`（10 張） |
| 115-df | 消失的原始資料 A 版 | 10/21、10/28、11/4（同課連上三週） | 待上課；`115-df/a/` 學生頁、`115-df/teacher/` 彙整頁 |

w02 活動頁設計（之後的活動沿用）：
- 由上而下三段：① 任務說明 ② 排出運作流程 ③ 播放看電腦怎麼跑。
- 步驟卡雙層：使用者看到的／電腦裡發生的。
- 可拖曳、可不照順序放；步驟數＝格數，只有最後一關多一張陷阱卡。
- 教師模式：顯示答案、播放中暫停、單步、點步驟跳轉。
- 四關都用窮舉驗證過可行解。

## 4. 下一步（依序）
1. **10/26（學期第 9 週）備課**：對應新版規劃表「第 7 週」——2-01～2-04 數位化（看台最後一排拍偶像／像素、取樣、量化；趨勢：AI 計算攝影與內容憑證；必修）。規劃表週次＋2＝實際學期週次。
2. **學生登入上線**：等老師完成 `tools/grade-upload/README.md` 的 A（OAuth 用戶端 ID）、B（試算表＋Apps Script，貼名單），拿到兩個值填進 `assets/login.js`，再實測一次登入與上傳。
3. **數位鑑識 B/C/D 版**：等老師提供。重建任何鑑識頁時，探測程式要保留：`if(!/^https?:$/.test(location.protocol)||/\.github\.io$/.test(location.hostname)) return;`（否則 github.io 上會一直 404 `/api/ping`）。
4. 之後：教師模式改成走登入、答案改由伺服器判定；與 ClassScore 共用 Firebase 後端（方案記在 ClassScore 交接檔 C 節，需老師核准）。

## 5. 待老師決定（沒有偏好前不動）
- 新版學期規劃是否取代主分頁的「學期規劃（草案）」。
- 段考週、國定假日。
- w01 要不要補上 w02 的新功能（拖曳、教師模式、雙層卡）。
- 是否把 w02 的新做法寫回 `weekly-it-lesson` 技能。
- 授權聯絡方式要不要放在 about 頁。

## 6. 開發注意
- 本機測試：`python3 -m http.server 8765`，Playwright（Chromium 已預裝）。
- 改活動邏輯後，用窮舉確認每關仍有解、陷阱卡不會被接受。
- commit 訊息用中文短句；直接推 main 即上線，推之前先本機看過。
