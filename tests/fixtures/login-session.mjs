// 僅供離線測試：延後還原 Auth，並以 sessionStorage 模擬同分頁換頁。
export const sessionFirebase = String.raw`
window.firebase = (() => {
  const state = window.__sessionMock = {persistence:[],signins:[],signouts:0,reads:[],writes:[]};
  const observers = new Set();
  let user = null;
  const saved = () => JSON.parse(sessionStorage.getItem('mock:session-user') || 'null');
  const changed = next => {
    user = next;
    sessionStorage.setItem('mock:session-user', JSON.stringify(next));
    observers.forEach(cb => cb(user));
  };
  const auth = {
    get currentUser() { return user; },
    async setPersistence(mode) { state.persistence.push(mode); },
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
  const db = {
    doc(path) { return {
      async get() {
        state.reads.push(path);
        if (!/^ybsCourses\/115-g9\/roster\/cgjh999000[12]@cgjh\.hcc\.edu\.tw$/.test(path)) throw Error('unexpected document');
        return {exists:true,data:() => ({cls:999,seat:path.includes('9990002') ? 2 : 1})};
      },
      async set(data) { state.writes.push({path,data}); }
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
  return {apps:[app],auth:{Auth:{Persistence:{SESSION:'session'}}},
    firestore:{FieldValue:{serverTimestamp:() => 'synthetic-timestamp'}}};
})();`;
