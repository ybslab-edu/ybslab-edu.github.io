// 唯一切換開關；PR8 核准窗口前保持 false。禁止網址／localStorage 覆寫。
const YBS_FULLREV_CONFIG = Object.freeze({
  enabled: false,
  firebase: Object.freeze({projectId:'', apiKey:'', messagingSenderId:''}),
  workerOrigin: '',
  // PR4 受控讀取服務的同源 adapter；缺少時維持待確認、不開回 Firestore list。
  readModelModule: ''
});
