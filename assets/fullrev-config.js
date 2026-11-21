// 唯一切換開關；PR8 核准窗口前保持 false。禁止網址／localStorage 覆寫。
const YBS_FULLREV_CONFIG = Object.freeze({
  enabled: false,
  courses: Object.freeze(['115-g9']), // DF 沿用舊專案；本次切換不啟用 DF 新流程。
  firebase: Object.freeze({projectId:'', apiKey:'', messagingSenderId:''}),
  workerOrigin: '',
  // PR4 受控讀取服務的同源 adapter；缺少時維持待確認、不開回 Firestore list。
  readModelModule: ''
});
