// 短版題與原活動關卡分離；不引用過關、成績或上傳介面。
const pick = (rnd, values) => values[Math.floor(rnd() * values.length)];
const choice = (prompt, options, review) => ({prompt, options, answer: 0, review});
const entry = (activity, id, gen) => ({course: '115-g9', activity, id: `${activity}:${id}`, gen});
export const WARMUP_BANK = [
  entry('u2-01', 'pixels', rnd => choice(
    `${pick(rnd, ['背號', '照片中的字'])}模糊時，增加哪個設定通常更清楚？`,
    ['像素格子數', '檔案名稱長度', '螢幕音量'], '像素格子越多，通常能保留越多影像細節。')),
  entry('u2-01', 'colors', rnd => {const bits = pick(rnd, [1, 2, 3]); return choice(
    `每格用 ${bits} 位元，最多能表示幾種顏色？`,
    [String(2 ** bits), String(2 ** bits + 1), String(2 ** bits - 1)], '每多一個位元，可以表示的顏色數就加倍。');}),
  entry('u2-01', 'size', rnd => {const side = pick(rnd, [2, 4, 8]); return choice(
    `${side} × ${side} 的影像共有幾格像素？`,
    [String(side * side), String(side * side + 1), String(side * side - 1)], '影像的像素總數＝寬的格子數 × 高的格子數。');}),
  entry('u2-02', 'sample', rnd => choice(
    `每秒量 ${pick(rnd, [8, 16, 32])} 次聲音，描述的是哪個設定？`,
    ['取樣頻率', '影像解析度', '影片長度'], '取樣頻率就是每秒測量聲音的次數。')),
  entry('u2-02', 'frames', rnd => {const fps = pick(rnd, [2, 3, 4]), seconds = pick(rnd, [2, 3]); return choice(
    `${fps} fps 的影片，${seconds} 秒共有幾張畫面？`,
    [String(fps * seconds), String(fps * seconds + 1), String(fps * seconds - 1)], '畫面總張數＝每秒張數（fps）× 秒數。');}),
  entry('u2-02', 'storage', rnd => {const minutes = pick(rnd, [2, 3, 4]); return choice(
    `每分鐘用 10 MB，錄 ${minutes} 分鐘需要幾 MB？`,
    [String(minutes * 10), String(minutes * 10 + 10), String(minutes * 10 - 10)], '所需容量＝每分鐘的資料量 × 錄影分鐘數。');}),
  entry('u2-03', 'binary', rnd => {const high = pick(rnd, [2, 4, 8]); return choice(
    `只有代表 ${high} 和 1 的燈亮著，數字是多少？`,
    [String(high + 1), String(high), String(high + 2)], '二進位燈牌只要把亮著的燈所代表的數字加起來。');}),
  entry('u2-03', 'byte', rnd => {const bytes = pick(rnd, [1, 2, 3]); return choice(
    `${bytes * 8} 位元等於幾位元組？`,
    [String(bytes), String(bytes + 1), String(bytes * 8)], '8 位元＝1 位元組。');}),
  entry('u2-03', 'range', rnd => {const bits = pick(rnd, [1, 2, 3]); return choice(
    `${bits} 顆亮暗燈，最大能表示多少？`,
    [String(2 ** bits - 1), String(2 ** bits), String(2 ** bits + 1)], '從 0 開始計算，n 顆燈的最大數字是 2 的 n 次方減 1。');}),
  entry('u2-04', 'decode', rnd => {const code = pick(rnd, [65, 66, 67]); return choice(
    `編碼表：65→A、66→B、67→C；${code} 是哪個字？`,
    [String.fromCharCode(code), 'D', 'E'], '解碼時，要用相同編碼表把數字對回文字。');}),
  entry('u2-04', 'encode', rnd => {const code = pick(rnd, [65, 66, 67]); return choice(
    `編碼表：A→65、B→66、C→67；${String.fromCharCode(code)} 的編碼是？`,
    [String(code), '68', '69'], '文字可以依編碼表轉成數字儲存。');}),
  entry('u2-04', 'display', rnd => pick(rnd, [
    choice('存檔用 Big5，打開卻用 UTF-8，容易出現什麼？', ['亂碼', '音量變大', '容量自動加倍'], '存檔和讀取使用不同編碼，可能把文字解成亂碼。'),
    choice('編碼正確，卻顯示缺字方塊，應先檢查什麼？', ['字型是否有這個字', '滑鼠速度', '音量'], '字型提供文字的外觀，缺少字形時可能顯示方塊。')
  ])),
  entry('u2-05', 'information', rnd => choice(
    `整理${pick(rnd, ['飲料票數', '點餐紀錄'])}後，得出「最多人選紅茶，先訂紅茶」，屬於什麼？`,
    ['資訊', '尚未整理的原始資料', '電腦硬體'], '資料經整理並能幫助決定，就成為有用的資訊。')),
  entry('u2-05', 'type', rnd => pick(rnd, [
    choice('想讓同學勾選多種喜歡的飲料，用哪種題型？', ['核取方塊', '單選', '線性刻度'], '允許選多個答案時，適合用核取方塊。'),
    choice('想請同學自由寫下選擇的理由，用哪種題型？', ['簡答', '單選', '線性刻度'], '要蒐集自由表達的理由，適合用簡答。')
  ])),
  entry('u2-05', 'survey', rnd => choice(
    `問「你喜歡${pick(rnd, ['紅茶和綠茶', '唱歌和跳舞'])}嗎？」有什麼問題？`,
    ['一次問兩件事', '字數一定太少', '不能用問號'], '一題只問一件事，才能清楚知道回答的意思。'))
];
