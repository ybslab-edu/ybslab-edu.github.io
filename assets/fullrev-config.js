// 唯一切換開關；PR8 核准窗口前保持 false。禁止網址／localStorage 覆寫。
const YBS_FULLREV_CONFIG = parseYbsFullrevConfig({
  enabled: false,
  studentGoogleLogin: false, // 老師另行決定開放時機。
  answerTickets: true, // 11/27 老師決定驗收期開啟；回退改 false
  courses: Object.freeze(['115-g9']), // DF 沿用舊專案；本次切換不啟用 DF 新流程。
  firebase: Object.freeze({projectId:'', apiKey:'', messagingSenderId:''}),
  workerOrigin: '',
  // PR4 受控讀取服務的同源 adapter；缺少時維持待確認、不開回 Firestore list。
  readModelModule: ''
});

// 無效設定回傳 null，讓 login.js 維持 configuration-pending；不可改成 false 而啟動舊專案。
function parseYbsFullrevConfig(config) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const placeholder = value => /replace|placeholder|your[-_]|changeme|change[-_]me|todo|<|>/i.test(value);
  try {
    if (!record(config) || ![true, false].includes(config.enabled)
        || Object.keys(config).some(key => !['enabled', 'courses', 'firebase', 'workerOrigin', 'readModelModule'].includes(key))) return null;
    const courses = config.courses === undefined ? ['115-g9'] : config.courses;
    const firebase = config.firebase;
    if (!Array.isArray(courses) || courses.length !== 1 || courses[0] !== '115-g9'
        || !record(firebase) || Object.keys(firebase).some(key => !['projectId', 'apiKey', 'messagingSenderId'].includes(key))
        || typeof firebase.projectId !== 'string' || typeof firebase.apiKey !== 'string'
        || firebase.messagingSenderId !== undefined && typeof firebase.messagingSenderId !== 'string'
        || typeof config.workerOrigin !== 'string' || typeof config.readModelModule !== 'string') return null;
    if (config.enabled) {
      if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebase.projectId)
          || /class-score|classscore|pilot|^demo-/i.test(firebase.projectId)
          || !/^[A-Za-z0-9_-]{8,256}$/.test(firebase.apiKey)
          || firebase.messagingSenderId !== undefined && !/^[0-9]{1,20}$/.test(firebase.messagingSenderId)
          || [firebase.projectId, firebase.apiKey, firebase.messagingSenderId || '', config.workerOrigin].some(placeholder)
          || config.readModelModule !== '/assets/fullrev-read-model.mjs') return null;
      const origin = new URL(config.workerOrigin);
      if (origin.protocol !== 'https:' || origin.origin !== config.workerOrigin || origin.port
          || origin.username || origin.password
          || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+workers\.dev$/.test(origin.hostname)) return null;
    }
    return Object.freeze({...config, courses: Object.freeze([...courses]), firebase: Object.freeze({...firebase})});
  } catch {
    return null;
  }
}
