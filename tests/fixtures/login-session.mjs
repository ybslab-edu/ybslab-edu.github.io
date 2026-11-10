// 僅供離線測試：LOCAL 跨分頁同步，SESSION 僅限同分頁，延後初始 Auth。
export const sessionFirebase = String.raw`
window.firebase = (() => {
  const state = window.__sessionMock = {persistence:[],signins:[],signouts:0,reads:[],writes:[]};
  const observers = new Set();
  let user = null, mode = 'local';
  const saved = () => JSON.parse(localStorage.getItem('mock:session-user') || sessionStorage.getItem('mock:session-user') || 'null');
  const changed = next => {
    user = next;
    (mode === 'local' ? localStorage : sessionStorage).setItem('mock:session-user', JSON.stringify(next));
    observers.forEach(cb => cb(user));
  };
  window.addEventListener('storage', event => {
    if (mode === 'local' && event.key === 'mock:session-user') {
      user = JSON.parse(event.newValue || 'null'); observers.forEach(cb => cb(user));
    }
  });
  const auth = {
    get currentUser() { return user; },
    async setPersistence(next) {
      state.persistence.push(next);mode = next;
      const storage = next === 'local' ? localStorage : sessionStorage;
      const other = next === 'local' ? sessionStorage : localStorage;
      if (user) storage.setItem('mock:session-user', JSON.stringify(user));
      other.removeItem('mock:session-user');
    },
    onAuthStateChanged(cb) {
      observers.add(cb);
      const restore = () => {
        user = saved();
        if (observers.has(cb)) cb(user);
      };
      if (window.__holdSessionAuth) state.releaseAuth = restore;
      else queueMicrotask(restore);
      return () => observers.delete(cb);
    },
    async signInWithEmailAndPassword(email) {
      state.signins.push(email);
      changed({uid:email.includes('9990002') ? 'session-two' : 'session-one',email,isAnonymous:false});
      return {user};
    },
    async signOut() { state.signouts++; changed(null); }
  };
  auth.signInWithPopup = async () => {changed({uid:'teacher',isAnonymous:false});return {user};};
  const db = {
    doc(path) { return {
      async get() {
        state.reads.push(path);
        if (path.includes('/attempts/')) {
          if (state.holdAttemptRead) await new Promise(resolve => {state.releaseAttemptRead = resolve;});
          const data = JSON.parse(localStorage.getItem('mock:doc:' + path) || 'null');
          if (!data) throw Object.assign(Error('synthetic missing document'),{code:'permission-denied'});
          return {exists:!!data,data:() => data};
        }
        if (path === 'ybsCourses/115-df') return {exists:true,data:() => ({ownerUid:'teacher'})};
        if (!/^ybsCourses\/115-g9\/roster\/cgjh999000[12]@cgjh\.hcc\.edu\.tw$/.test(path)) throw Error('unexpected document');
        return {exists:true,data:() => ({cls:999,seat:path.includes('9990002') ? 2 : 1})};
      },
      async set(data) {
        state.writes.push({path,data});
        localStorage.setItem('mock:doc:' + path, JSON.stringify(data));
        localStorage.setItem('mock:write-count', String(Number(localStorage.getItem('mock:write-count') || 0) + 1));
      }
    }; },
    collection(path) { return {where(field,op,uid) {
      if (path !== 'ybsCourses/115-g9/attempts' || field !== 'uid' || op !== '==' || uid !== user?.uid) throw Error('unexpected query');
      return {async get() {
        state.reads.push({path,uid});
        return {metadata:{fromCache:false},docs:uid === 'session-one' ? [{data:() => ({uid,activity:3,round:0})}] : []};
      }};
    }}; }
  };
  const app = {name:'ybs',auth:() => auth,firestore:() => db};
  state.auth = auth;
  return {apps:[app],initializeApp:(_,name) => ({...app,name}),
    auth:{Auth:{Persistence:{SESSION:'session',LOCAL:'local'}},GoogleAuthProvider:class {setCustomParameters(){}}},
    firestore:{FieldValue:{serverTimestamp:() => 'synthetic-timestamp'}}};
})();`;
