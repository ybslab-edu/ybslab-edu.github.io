# YBS Lab 交接（覆寫式，只留最新狀態）

最後更新：2026-10-21（依 10/19 之後的 git log 與 YBS／ClassScore 程式核對）。新對話先讀完這份，再依「下一步」推進；不用從頭研究整個網站。

> **目前狀態**：YBS × ClassScore 過關紀錄串接已上線。115-df 的活動 a 已開放；登入後依名單確認班座，每堂完成點寫入過關紀錄。報告採三堂流程：DF-3A 定義格式，YBS 學生端 DF-3C 交件，教師端 DF-3D 讀取；Firestore Rules 與模擬器測試由 ClassScore 的 DF-3B 維護。數資班在 ClassScore 的班級代號為 `724`。每週開新關卡須更新 `assets/lock.js` 的 `OPEN`。

## 1. 專案與相關位置
- 網站：<https://ybslab-edu.github.io>，repo `ybslab-edu/ybslab-edu.github.io`（GitHub Pages，main 直接上線）。
- 課程總表（Claude Doc）：<https://claude.ai/code/artifact/786740a2-650d-47f2-90a4-3697cb72b7bd>
  - 主分頁：每週進度表（已登記到 1/18）與節點表（第 2、4 單元節點都已填活動）。
  - 分頁「上學期課程規劃（新版）」：21 週 3 單元＋4 條科技趨勢；子分頁「第 1 單元 系統平台」。規劃表週次＋2＝實際學期週次。
- 備課流程：技能 `weekly-it-lesson`（故事簡報＝Slides artifact＋分級活動頁＋登記到網站與總表）。
- 另一個專案 **ClassScore**（`hs202864-art/class-score`，私人 repo）有自己的交接檔（在 Draft PR #85 的分支 `docs/classscore-release-main-verification-blocked`，不在 main）。兩站的串接由**這個視窗主導**，但 ClassScore 程式改在它的 repo；**class-score 任何合併到 main 都會觸發正式發布**，合併前一律要老師核准。

## 2. 網站結構重點
- 頁面：`index.html`＝學期進度（首頁）、`map/`＝課綱學習地圖、`about/`＝關於。舊的 `/#S-IV-2` 連結會轉到 `map/#S-IV-2`。
- `assets/activities.js`：全站唯一活動登記處。`week`＝該課程第幾個活動（成績碼用，須等於活動頁的 week）；`unit`＝第幾單元（活動頁頂端的單元進度條用）；畫面上的學期週次由 `date` 算；`also` 可列重複上課日期（學期進度會合併成一格）。
- `assets/curriculum.js`：COURSES（`115-g9` 資訊科技／九年級、`115-df` 專題研究／數資班七八年級；`short` 課名、`who` 上課對象、`name` 全名）與 TERMS。
- **`assets/shell.js`＋`shell.css`：第 2 單元起的活動頁共用外框**（w04～w09 用）。填班級座號、基礎／進階分頁、單元進度條、成績碼、教師模式（顯示答案、換一組資料）、帳號密碼登入與上傳都在裡面；各週頁面只寫關卡：`{name, lv, now, goal, tip, learn, gen(rnd), view(inst, el, api), check(inst, ans), peek?}`。過關規則：**連續答對兩組不同的資料**；答錯留在同一組修正，答對才換新的一組。注意 curriculum.js 有全域 `N`、`DESC`，頁面變數不要撞名。
- `assets/codec.js`：16 字元成績碼，**不要改**。
- `assets/teacher.js`：教師模式（通行碼只存 SHA-256；10/19 已換新、可含英文，輸入框有「顯示通行碼」；通行碼由老師保管，勿寫進 repo）。檔案有版本號（`?v=`），換雜湊後要一起改版本號，否則瀏覽器會沿用舊檔。
- `assets/login.js`：學生帳號密碼登入（Firebase 密碼登入，見 3.7）。`CONFIG.on=false` 可整站關閉登入（活動頁回到只用「班級座號＋成績碼」）。Google 登入與 `?login=1` 試點開關已移除（YBS PR #4）。`tools/grade-upload/`（Apps Script）是舊方案、不再使用。
- `assets/lock.js`：活動上鎖。`OPEN` 清單列出開放的資料夾（九年級目前 `w01`、`w02`、`w03`；數資班 `[]`），其他活動頁蓋「還沒開放」，老師點「教師解鎖」輸入通行碼可進（只在該分頁有效）。**每週開新活動要把資料夾名加進 `OPEN`。** 這是前端鎖，懂程式的學生可繞過（只會提早看到題目答案）。
- `assets/activities.json`（PR #2 新增）：由 `node tools/activities-json.mjs` 從 activities.js 產生的公開清單，ClassScore 讀它算「過關數÷關卡數」。**新增或改活動後都要重跑一次。**
- `lab/login-test/`：階段 0 的學生帳號登入測試頁（noindex、不連結、不寫資料），已上線，留著方便之後再測。
- 著作權：`LICENSE` 全權保留；頁尾與 `about/#h-rights` 寫「可瀏覽、不可轉用」。

## 3. 已上線內容
| 課程 | 活動 | 日期（學期週） | 類別 | 簡報 Slides artifact id |
| --- | --- | --- | --- | --- |
| 115-g9 | 第 1 週課程導覽「資訊科技學什麼」（課綱、教室規則、評量；前測用 Wayground，沒有活動頁） | 8/31（第 1 週，補登） | — | `J1DGDQuBoTUV2sYqWoNeXB` |
| 115-g9 | w30 登入，出發（因材網與 YBS Lab 登入、規則、評量、故事線） | 9/7（第 2 週，補登） | 必修 | `KSSJmr1A7YsMrcYqdkgS2U` |
| 115-g9 | w26 開賣倒數十秒 | 9/14（第 3 週，補登） | 必修 | `EbKpwbTFsZG2hWm87Lqpw9` |
| 115-g9 | w27 加場搶票被踢出來 | 9/21（第 4 週，補登） | 必修 | `1T3aUMDk9ELQQAoxDa5LsS` |
| 115-g9 | w28 為了演唱會換手機 | 9/28（第 5 週，補登） | 必修 | `KSnYNh2u4c5LQGq5kuEdQ2` |
| 115-g9 | w29 演唱會倒數直播 | 10/5（第 6 週，補登） | 必修 | `NFsQcJZjAHqeBtSEeAbh7Q` |
| 115-g9 | w01 深夜手搖店 | 10/12（第 7 週） | 必修 | `WSy6rrBzDqDnQuA4nZpQRi` |
| 115-g9 | w02 打王前記得存檔 | 10/19（第 8 週） | 必修 | `DRZXkw9NFTxty7SA4dzw3W` |
| 115-g9 | w03 看台最後一排 | 10/26（第 9 週） | 必修 | `TR3HXGv3m328h4RTppFkPV`（11 張） |
| 115-g9 | w04 錄滿一整場 | 11/2（第 10 週） | 選修 | `5JPJE8AuH2uNQmwS57zUcn` |
| 115-g9 | w05 燈牌只有亮和暗 | 11/9（第 11 週） | 必修 | `7pU6bHKjzsR1WPM2jnxSby` |
| 115-g9 | w06 傳給阿嬤的方塊 | 11/16（第 12 週） | 必修 | `426smtEmwJcmchmSXRoqhi` |
| 115-g9 | w07 後援會問卷 | 11/23（第 13 週） | 必修 | `TSvkQu1AcGjqc8GRNK48wK` |
| 115-g9 | w08 問卷回來一團亂 | 11/30（第 14 週） | 選修 | `TVZGUNmQ5DZ7kveziFtw1o` |
| 115-g9 | w09 影片傳到群組變糊 | 12/7（第 15 週） | 選修 | `7cQXv64ooEd56dany7NiYm` |
| 115-g9 | w10 馬祖斷線了 | 12/14（第 16 週） | 必修 | `Mknn4RcE3gQ5ZKcYKqRLuH` |
| 115-g9 | w11 差一個字母的網站 | 12/21（第 17 週） | 必修 | `XkDW6PE8ExotAxaHaetUDn` |
| 115-g9 | w12 Wi-Fi 死角在哪裡 | 12/28（第 18 週） | 選修 | `WCyV9dDoPkTkLWUrrJt8rd` |
| 115-g9 | w13 短影音怎麼猜中我 | 1/4（第 19 週） | 必修 | `3GbabnjJ5bQxnnSSoKMM6R` |
| 115-g9 | w14 影片住在哪個國家 | 1/11（第 20 週） | 必修 | `WgMgVWxyK2YiosMmrKwTcx` |
| 115-g9 | w15 問 AI 一個問題（學期統整） | 1/18（第 21 週） | 必修 | `LW3kNdwJXqwiZ1ZrpXmiD3` |
| 115-g9 | w16 倒數一百天的 AI | 2/15（下學期第 2 週） | 必修 | `9PTBcRrFtbw9FnzbutoLFP` |
| 115-g9 | w17 AI 說的就對嗎 | 2/22（第 3 週） | 必修 | `2GrLDA9eSVw39gZBrD5SMH` |
| 115-g9 | w18 寫給學弟妹的繪本 | 3/8（第 5 週） | 必修 | `PKF3XpXgSukghmEMbwLd1A` |
| 115-g9 | w19 繪本需要插圖 | 3/15（第 6 週） | 選修 | `E6WXsMEVY3ZdoHXfc9SJ1E` |
| 115-g9 | w20 回收分類機 | 3/22（第 7 週） | 必修 | `JFdDrjji6HfC3xJ4p1aokq` |
| 115-g9 | w21 跟誰最像 | 3/29（第 8 週） | 選修 | `4Y9juegtNdogRP5mPZhdZd` |
| 115-g9 | w22 讓資料自己分組 | 4/12（第 10 週） | 必修 | `SVeKFtC6WtgF99yPfJAXLy` |
| 115-g9 | w23 服務台放哪裡 | 4/19（第 11 週） | 選修 | `K568b5jj4SdnbgiJFf1gca` |
| 115-g9 | w24 教 AI 認手勢 | 4/26（第 12 週） | 必修 | `3wiwyvzPbaZvWjoSZeEWoS` |
| 115-g9 | w25 猜拳贏 AI | 5/3（第 13 週） | 必修 | `XAY77HokRMn4BPeGZM4QSq` |
| 115-df | 消失的原始資料 A 版 | 10/21、10/28、11/4（同課連上三週） | 必修 | —（`115-df/a/` 學生頁、`115-df/teacher/` 彙整頁） |

第 1 單元前段（w26～w29，2026-10-16 補登，節點 1-01～1-08）：
- 活動序號接在 w25 後面（成績碼用），日期排在學期第 3～6 週。第 1、2 週是開學導覽：w30（unit 0、codes 空陣列，首頁圖例已略過沒有 codes 的活動）。評量方式與教室規則照老師 W01 簡報：認知 30%（期末紙筆，題庫 50 抽 25）、情意 30%（學習態度、學習互助）、技能 40%（課堂作業）。
- 故事：小安搶六連星第一場演唱會（開賣倒數十秒 → 加場搶票 → 換手機 → 直播倒數），w01 手搖店、w02 打王存檔是插曲，w03 看台最後一排就是這場演唱會當天（w03 簡報 seat 頁已改成接續語氣）。
- 簡報單元地圖是六站（第 3～8 週）；10/16 已補到 w01（第 5 站，sum-mem 後）與 w02（第 6 站，單元結束版，sum-flow 後），六份簡報一致。
- 原始檔與測試在當時工作階段的 scratchpad（u1/wNN.js、u1/test.py、decks/mk_unit1.py），新環境看不到。

第 2 單元（w03～w09）的連貫設計，老師會整單元一起測：
- 同一條故事線：小安加入「六連星」後援會，準備 12/31 跨年演唱會；每週一件後援會的事。規劃表第 11、12 週原本的「畢旅問卷」改成「後援會問卷」，讓整單元在同一個故事世界。
- 每份簡報都有同一張「單元流程線」（七站：數位化→有多大→數字怎麼存→文字怎麼存→蒐集資料→整理成資訊→傳出去），本週那一站亮起來；w09 的簡報是單元結束版。
- 跨週呼應：w04 算出跨年 4K 約 47 GB → w09 跨年夜；w05 的燈牌 → w06 每個英文字＝8 顆燈 → w09 燈牌壓縮；w07 問卷 → w08 清理同一份問卷。
- 每週出場券最後都預告下週故事。

第 4 單元（w10～w15，網路技術與服務＋學期統整）的連貫設計：
- 延續六連星後援會：跨年後後援會擴大到馬祖、金門、東京、美國。副會長小澄住馬祖南竿（2023 年 2 月台馬二號、三號海纜相繼中斷的真實事件；2025 年再斷時微波已擴到 12.6 Gbps，幾乎無感）。購票網站「星票網 tixstar.com.tw」是虛構的。
- 每份簡報的單元地圖是六站：走哪條線 → 怎麼寄 → 最後一段 → 用來做什麼 → 存在哪裡 → 串起來；w15 是單元與學期結束版。
- 跨週呼應：w10 海纜 → w14 資料中心選址要靠近海纜登陸站；w11 封包、IP → w15 一個問題的旅程；w14「誰管哪一層」接第 1 單元的硬體／作業系統／應用程式三層；w15 把第 1、2、4 單元串成一條路，並回扣第 1 單元的 NPU、第 10 週的模型大小。
- 排法：規劃表第 14～19 週直接放進學期第 16～21 週，原規劃的第 20、21 週緩衝拿掉；w15 本身也可當緩衝週。老師尚未提供段考週，若 1/18 是期末考要再調。

第 5 單元（w16～w25，人工智慧，下學期會考前）的連貫設計：
- 換新故事世界（老師指定不延續六連星）：九年三班畢業倒數，小安、班長小禾、環保股長阿哲、導師林老師；目標是畢業園遊會的「猜拳贏 AI」攤位，w25 攤位上線。
- 每份簡報的單元地圖是十站（兩排各五站），本週那站亮起；w25 是單元結束版。
- 跨週呼應：w17 查證 → w18 生成文字 → w19 生成圖片（版權）；w20 決策樹（有標準答案）→ w22 分群（沒有標準答案）；w21 KNN／感知器、w23 二維分群都是選修延伸；w24 收手勢照片、混淆矩陣 → w25 信心值門檻與預測玩家習慣。
- 生成器：w17 宣稱題、w21 感知器、w23 手肘法都改過「保證有唯一答案」的產生方式；獨立參考解在 scratchpad ind/u5.py、ind/u5_w23.py。
- 頁面由 scratchpad u5/mk.py 從 wNN.js＋wNN.css 組成（標頭註解 `// TITLE:`、`// TERMWEEK:`）；共用外框新增 ORDERBOX、PICKONE、NUMOK、CHECKROWS。
- 排法假設：3/1（和平紀念日補假）、4/5（兒童節／清明）停課；5/10 緩衝；會考假設 5 月中旬，5/17～6/7 做第 3 單元畢業影片（尚未備課）。

活動頁兩種型別：
- 排順序型（w02）：① 任務說明 ② 排出運作流程 ③ 播放看電腦怎麼跑；步驟卡雙層；可拖曳；教師模式可暫停、單步。
- 調設定型（w03）：拉格子數／顏色數、回答兩張照片；過關＝答對且設定正好是「看得出來的最小值」。照片全由程式畫，不用真人照片。
- w04～w15 走共用外框（見第 2 節），每關的產生器都跑過 300 次確認不會卡住，正確答案 40 組都會過、改掉一處的答案 40 組都不會過。w06 的亂碼樣本是用 Python 真的編碼轉換產生的。

## 3.5 2026-10-16 依外部檢查報告修正（報告檔：老師上傳的「YBS Lab 網站設計、活動適切性與 Bug 檢查報告 20261015」）
- 已修：B01 w08 重複填寫（改用獨立的 `cleanKeep()` 只看表上欄位判定）、B02 w04 整分鐘精確相等、B03 w04 數字欄位整串驗證、B04 w01 順序格滿了不能再放、B05 最後一關過了只說「完成 X／4 關」（shell 與 w01～w03 的 `endMsg`）、B06 專題 EXIF 要年月日時分都對（`sameShot()`，改欄位會清掉通過狀態）。
- 教材：C01 w04 改用國際標準 1 GB＝1000 MB，1024 倍寫成 KiB／MiB／GiB 只當對照（跨年兩小時 4K 改成約 48 GB，簡報同步）；C02 w09 燈牌改 24 顆，壓縮前後都用位元比（每個數字 5 位元），會顯示變小或變大；C03 w13 物聯網定義改成「能感測或控制實體世界＋連網」；C04 w15 加上「本題雲端版可搜尋／本題手機版完全離線」前提，晶片寫成「常用 NPU」；C05 w07 期待程度題加上研究目的；C06 w11 網域解釋與「先去掉 https://」；C07 各處加註本題假設或模擬值（w01、w02、w03、w10、w12、w14 備份要先確認）。
- 專題 A 版改成三堂：第一堂步驟 1～4、第二堂 5～6（第二批密碼為界）、第三堂 7～8（原「第二堂密碼」改稱第三堂密碼，雜湊值未變）。
- 測試方式改成「獨立參考解」：只讀學生看得到的題目資料，用 Python 自己算答案再交給 `check()`（腳本在工作階段 scratchpad 的 ind/all.py，涵蓋 w04、w08～w14 的計算型關卡）；分類題仍是題庫對照，需人工校對知識。
- 刻意沒做、待老師決定：D01「本週活動」區塊（老師 10/15 要求拿掉本週卡片，與報告建議衝突）、D02 手機版改清單、D05 認色替代題、D07 未過關草稿保存、D09 EXIF 非 Windows 步驟、R01 localStorage 加學年度命名空間（需要遷移舊進度）。R02 已做：存不了進度時會提示抄成績碼。

## 3.6 2026-10-16 全站安全排查
- 已修：
  - Code.gs 學生送來的文字開頭是 = + - @ 時補 `'`（防試算表公式注入、外傳名單）、每帳號 10 分鐘 60 次的頻率限制、錯誤只回 `server` 不回內部細節。尚未部署，老師貼程式時用新版即可。
  - login.js `auto_select:false`（共用電腦不自動沿用上一位的 Google 登入）；「帳號→班級座號」改存 sessionStorage，並清掉舊的 localStorage `ybslab:me:*`。
  - Excel 元件改用 repo 內的 `assets/vendor/xlsx-0.18.5.full.min.js`（不再從 CDN 載入；只用來寫檔，已知漏洞在讀檔端）。
  - 專題彙整台 CSV 以 = + - @ 開頭的儲存格補 `'`；專題學生頁證物代號 `lbl()` 改為跳脫（匯入惡意報告檔可執行腳本，已實測修好）；`115-df/teacher/` 加 noindex。
  - 全站 39 頁加 meta CSP。**之後新增外部來源（字型、CDN、iframe、API）要同步改每頁的 CSP**，否則會被擋。
  - 快取版本：main 上 `login.js?v=20261016s`、`shell.js?v=5`；PR #2 分支是 `login.js?v=20261016f`、`shell.js?v=6`。`activities.js` 仍是 `?v=20261016d`。
- 待老師決定：
  - 成績碼可被偽造：老師已決定改走帳號登入、成績碼只當登入失敗時的備案（見 3.7）。Firebase 版的過關仍由前端判定（學生只能替自己造假），長期可加 Apps Script 伺服器判題（免計費）。
  - 教師通行碼：10/19 已換成 13 字英數通行碼（只存雜湊 `sha256("ybslab-teacher:"+通行碼)`）。
  - `115-g9/teacher/` 沒有門檻、成績存在瀏覽器：只在老師自己的電腦使用。

## 3.7 YBS × ClassScore 串接（已上線，主導在這個視窗）
**架構**：兩站獨立前端、共用 ClassScore 的 Firebase `class-score-86020`（**免費 Spark 方案，老師決定不升級**）。Firestore 交換區 `ybsTeachers/{uid}`、`ybsCourses/{課程}`、`…/roster/{學校email}`、`…/attempts/{uid}_{活動}_{關卡}`；老師私人區 `users/{uid}/…` 不動。YBS 只寫過關紀錄；名單由 ClassScore 送（班級、座號、學號，**不送姓名**）；成績只在 ClassScore 由老師確認後匯入（過關數÷關卡數×100）。細節：class-score `docs/YBS_FIRESTORE.md`。

**登入方式（10/19 老師決定）**：學校 Google 帳號的 SSO 10/19 故障（Google 錯誤頁「無法驗證您的認證」，網址停在 `accounts.google.com/a/cgjh.hcc.edu.tw/acs`），老師不想每次找資訊組，改用**自建帳號**：
- 帳號 `cgjh`＋學號、密碼 `cgjh`＋身分證字號（學校慣例；身分證字號英文字母大小寫都可）。**學生不能改密碼。不保留 Google 登入。**
- Firebase 內部信箱 `cgjh學號@ybslab-edu.github.io`（不寄信），Rules 用 `rosterEmail()` 對應到名單上的 `cgjh學號@cgjh.hcc.edu.tw`；過關紀錄的 `email` 欄位也記學校信箱，所以 ClassScore 匯入不用改。
- 帳號由老師在 ClassScore「YBS Lab 連線」**第 7 區**建立：貼上或選 CSV「學號、身分證字號」，只在老師瀏覽器記憶體處理，不存 IndexedDB／雲端、畫面遮蔽、完成即清除。**身分證字號不能經過 AI 對話或 repo**（老師曾想直接給名單，已婉拒）。
- Firebase 免費方案每 IP 每小時約 100 個新帳號：第 7 區碰到上限會自動等 61 分鐘接續（頁面要開著）；名單照貼上順序建立，急用的班放前面；換網路（手機熱點）就是新額度。已存在的帳號會跳過、**不會更新密碼**：身分證字號打錯要到主控台 Authentication 刪掉該帳號再重建。
- 10/19 中午老師已把全部任教班帳號建好；名單已送 229 人（914～922 等任教班）。

**ClassScore 已上線（10/19）**：#104 第 6 區每格顯示「✓ 全過／最後」過關時間（給提早完成加分）；#105 深色模式補漏（theme.js 加自動補色保護）；#106 Rules 接受自建帳號＋第 7 區建帳號；#107 自動接續；#108 貼上名單；#109 同一學生兩個帳號重複同一關時不重複計算嘗試次數。全部已合併發布。

**YBS 已上線（10/19）**：PR #2 系列（9 個 commit 為趕 917 課直接推 main，已在 PR #2 留言補記）＋ PR #3 帳號密碼登入。登入畫面有「登入不了？改填班級座號」備案（走成績碼）；成績碼下方也顯示上傳狀態。PR #4 清掉 Google 登入殘留、CSP 收斂、上鎖集中到 lock.js（已合併）。PR #5 交接檔。

**Rules**：10/19 老師在主控台發布含 `ybsAccount()`／`rosterEmail()` 的版本（= class-score main 的 `firestore.rules`）。class-score 的 GitHub Actions「Bootstrap Firestore」（改 rules 會自動部署）自 10/16 起**job 起不來（0 steps）**，所以 Rules 一律由老師手動貼上發布。tests/ybs-rules.emulator.mjs 已加 10 個自建帳號案例，但這裡的環境裝不到 `@firebase/rules-unit-testing`（npm 403），**還沒實際跑過**。

**10/19 試點紀錄**：Google SSO 故障時部分學生改用成績碼；測試帳號曾留下測試紀錄，需由老師在 Firebase 主控台清理。之後班級改用帳號密碼。

**規則**：YBS 與 class-score 的改動都先開 Draft PR（**一個功能一個 PR，趕課也一樣**），合併與發布要老師核准；class-score 合併 main＝正式發布；PR CI 走 CircleCI `fallback-pr-ci`，要在 `.circleci/config.yml` 加暫時分支白名單、合併前移除。CircleCI `auth-preflight-sts` 10/19 失敗一次，不擋部署（獨立的 credentials-only workflow）。不得操作正式教師資料。

**開學簡報四項假設（10/16 確認）**：w30 帳密頁只寫規則（帳號 cgjh＋學號，密碼口頭說明）；前測不計分；Wayground 每班不同連結；技能 40%＝YBS 實作過關紀錄（登入失敗交成績碼）。

## 3.8 2026-10-21 交件與 ClassScore 現況
- **115-df 開放**：`assets/lock.js` 的 `OPEN['115-df']` 含 `a`。`assets/login.js` 的 `courses` 將 `115-g9`、`115-df` 分別對應到相同 Firestore 課程 ID。學生登入後以雲端名單確認班座；活動 a 的三堂完成點各寫一筆過關紀錄。
- **DF-1／DF-2**：完成反思的紀錄時機改為下載最終報告時；匯入報告前必須先登入。
- **DF-3A／3B／3C／3D**：DF-3A 在本 repo 的 `docs/DF_REPORT_FORMAT.md` 與 `assets/df-report.js` 定義白名單格式、編碼與解碼；DF-3C 在 `assets/login.js` 提供學生交件；DF-3D 在 `115-df/teacher/` 提供教師讀取。Firestore 權限、名單／班座與報告資料驗證屬 ClassScore 的 DF-3B（見其 `docs/YBS_FIRESTORE.md`），不要把 Rules 當作 YBS 頁面程式。
- **ClassScore 串接**：第 6 區支援 `115-df`，使用班級代號 `724`。ClassScore #110 增加依完成先後顯示的 YBS 過關區塊及評分操作；#111 擴充為跨班／課程彙整並顯示個人平均。DF-3B 已合併為 #118；YBS 第 6 區成績碼匯入與雲端紀錄合併由 ClassScore 的後續變更提供。這次本機 git log／交接資料未能確認 #113 的主題，勿推測其內容；需要時再查原 PR。以各 repo 最新程式及交接文件確認發布狀態，不沿用舊待辦快照。
- **每週開關卡**：改 `assets/lock.js` 中對應課程的 `OPEN` 清單，加入活動資料夾名稱（例如九年級 `w03` 或數資班 `a`）；新增／修改活動後執行 `node tools/activities-json.mjs`，並同步更新本機回歸測試使用的開放清單。

## 4. 下一步（依序）
1. **依部署證據確認 DF-3B Rules 與 DF-3C／DF-3D 交件流程**：Rules 的模擬器測試在 ClassScore `bash scripts/ybs-rules-emulator.sh`；測試與部署狀態以 ClassScore 最新交接及 Actions 為準，不操作正式教師資料。
2. **每週開新活動**：`assets/lock.js` 的 `OPEN` 加資料夾名；改 `assets/activities.js` 後跑 `node tools/activities-json.mjs`，並同步本機回歸測試的開放清單。
3. **登入相關**：規劃隔離的學生測試帳號方便每週課前自測；需要時再做「登入檢查」頁。不得把真實名單、帳密或識別資料放入文件、repo 或對話。
4. **老師測試第 2、4、5 單元的連貫性**，依回饋調整 w03～w25。
5. **第 3 單元影音專題（畢業影片）**、**確認段考週與會考日期**、**專題 B/C/D 版**（重建調查頁時保留 github.io 探測守門那一行）。
6. 之後：防偽（學生可用開發者工具送假的過關紀錄，匯入時看時間與嘗試次數；長期可讓 ClassScore 只收已開放週次）；`weekly-it-lesson` 技能加上「開放週次要改 lock.js」「改 activities.js 後跑 activities-json」。D01 等報告項目老師沒表態前不要動。

## 5. 待老師決定（沒有偏好前不動）
- 新版學期規劃是否取代主分頁的「學期規劃（草案）」。
- 段考週、會考日期、國定假日（上學期排到 1/18，下學期第 5 單元排到 5/3）。
- w01、w02 要不要改用共用外框（目前各自是獨立頁面，功能相同）。
- 是否把 w02 的新做法、共用外框寫回 `weekly-it-lesson` 技能。
- 授權聯絡方式要不要放在 about 頁。
- 是否升級 Firebase Blaze（目前決定不升級；升級後可用 Cloud Function 一鍵重設密碼）。
- 教師通行碼 10/19 換新時明碼曾出現在對話紀錄，老師可自行決定是否再換。

## 6. 開發注意
- 本機測試：`python3 -m http.server 8765`，Playwright（Chromium 已預裝）。共用外框的頁面可以在 console 用 `APP.load(i)`、`APP.handle.fill()`、`APP.rounds[i].check(APP.inst, …)` 做自動檢查。
- 改活動邏輯後，用窮舉或大量隨機資料確認每關仍有解、錯的答案不會被接受、產生器不會無限迴圈。
- commit 訊息用中文短句，結尾兩行署名（`Co-Authored-By` 與該對話的 `Claude-Session` 網址）；直接推 main 即上線，推之前先本機看過。
- **本機回歸測試（已放進 repo）**：`python3 -m http.server 8765` 後執行 `python3 tools/dev/check-pages.py`。它用 `tools/dev/firebase-mock.js` 假的 Firebase，檢查 13 個頁面的上鎖狀態、JS 錯誤、CSP 違規，以及帳密登入→身分確認→上傳寫入路徑與 email。教師解鎖要設環境變數 `YBS_TEACHER_CODE`（通行碼不要寫進 repo）。**改了 lock.js 的 OPEN 也要同步改腳本裡的 OPEN。** 雲端環境連不到正式網站與 Firebase，只能本機測。
- 單機版（停網備案）：把活動頁的 `../../assets/*.js` 內嵌成一個 HTML、移除 CSP，因為路徑不是課程資料夾，登入與上鎖都會自動停用。10/19 做過 w02 版給老師。
- 簡報（Slides artifact）發布若被拒「沒看過最新版本」：先用 Artifact read 重讀 deck 再發布，內容沒變就直接重送。發布後不要自行打開檢查。
- 推新分支後，本機 clone 可能沒有遠端追蹤 ref，stop hook 會誤報「未推送」：用 `git fetch origin <branch>:refs/remotes/origin/<branch>` 後 `git branch --set-upstream-to` 即可。

## 7. 移轉到 Claude Code（10/19 15:00）
老師把專案從 claude.ai 對話移到 Claude Code 接續，原對話視窗會刪除；這份交接檔＋ repo 是唯一的延續來源。
- **工作都已收尾**：YBS、ClassScore 兩個 repo 今天的改動全部合併上線，沒有進行中的分支。ClassScore 自己的交接檔仍在它的 Draft PR #85 分支（`docs/classscore-release-main-verification-blocked`），不在 main。
- **10/19 合併清單**：YBS #2（含 9 個直接推 main 的 commit，見 PR #2 留言）、#3、#4、#5、#6（本次交接＋`CLAUDE.md`＋`tools/dev/`）；ClassScore #104～#109。
- **claude.ai 專屬的東西**：故事簡報是 claude.ai 的 Slides artifact（id 在第 3 節表格，網址 `https://claude.ai/artifact/<id>`，列表在 `https://claude.ai/code/artifacts`）；課程總表是 Claude Doc（第 1 節）。Claude Code 不一定能編輯它們，備課技能 `weekly-it-lesson` 也不一定在；要做簡報或改總表時先確認工具，做不到就請老師回 claude.ai 處理。
- **環境限制（雲端工作階段）**：連不到 `ybslab-edu.github.io`、`class-score-86020.web.app`、Firebase、CircleCI 網站；npm 的 `@firebase/rules-unit-testing` 會被 403 擋；GitHub 用 `gh api`（REST），GraphQL 不能用；Draft PR 轉 ready 用 `POST /repos/{o}/{r}/pulls/{n}/ccr/ready_for_review`。class-score 的部署狀態看 commit status（`ci/circleci: deploy-production`）。
- **老師的工作方式**：繁體中文、簡潔，選項用互動式選單；常在上課前趕時間，先給停損點與備案（成績碼、單機版）；任何合併／發布都要老師明確說「合併」。
