// 本機測試用的假 Firebase（compat 版介面的最小子集），由 tools/dev/check-pages.py 注入；不連任何正式服務。
window.__writes = []; window.__signin = [];
// plan 依 set 呼叫順序消耗：delayMs 延遲、hold 等待 release(id)、code 拋出錯誤。
// __writes 只記成功寫入；attempts 記錄所有嘗試。documents 模擬 get() 讀回既有資料。
window.__firebaseMock = (() => {
  const plan = [...(window.__firebaseWritePlan || [])], attempts = [], documents = new Map(), held = new Map();
  return {
    plan, attempts, documents,
    release(id) {
      const resume = held.get(id);
      if (!resume) throw new Error('沒有等待中的 mock 寫入：' + id);
      held.delete(id); resume();
    },
    async set(path, data) {
      const action = plan.shift() || {};
      const attempt = {id: attempts.length, path, data, state: 'waiting'};
      attempts.push(attempt);
      if (action.hold) await new Promise(resolve => held.set(attempt.id, resolve));
      if (action.delayMs) await new Promise(resolve => setTimeout(resolve, action.delayMs));
      if (action.code) {
        attempt.state = 'failed'; attempt.code = action.code;
        const error = new Error('mock write failed'); error.code = action.code; throw error;
      }
      documents.set(path, data); window.__writes.push([path, data]); attempt.state = 'written';
    }
  };
})();
window.firebase = window.firebase || (() => {
  const apps = [];
  const auth = {
    currentUser: null, setPersistence: async () => {},
    signInWithEmailAndPassword: async (e, p) => {
      __signin.push([e, p]);
      if (e === 'cgjh1100123@ybslab-edu.github.io' && p === 'cgjhA123456789') {
        auth.currentUser = {uid: 'U1', email: e}; return {user: auth.currentUser};
      }
      const err = new Error('x'); err.code = 'auth/invalid-credential'; throw err;
    },
    signOut: async () => { auth.currentUser = null; }
  };
  const fs = {doc: path => ({
    get: async () => {
      const data = path.endsWith('/roster/cgjh1100123@cgjh.hcc.edu.tw')
        ? {cls: 917, seat: 5} : __firebaseMock.documents.get(path);
      return {exists: data !== undefined, data: () => data};
    },
    set: data => __firebaseMock.set(path, data)
  })};
  return {
    apps,
    initializeApp: (o, n) => {
      const a = {name: n, auth: () => auth, firestore: () => fs}; apps.push(a); return a;
    },
    auth: {Auth: {Persistence: {SESSION: 's', NONE: 'n'}}},
    firestore: {FieldValue: {serverTimestamp: () => 'TS'}}
  };
})();
