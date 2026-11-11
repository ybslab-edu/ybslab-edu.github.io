// 只替換 Firebase SDK：教師入口的初始化、Google 登入與登入模組均用正式程式。
export const teacherFirebase = `window.firebase = (() => {
  const state = window.meTeacherMock = {
    reads:[],writes:[],persistence:[],popups:[],signouts:[],pending:[],mode:'ok',ownerUid:'synthetic-owner',auths:new Map(),
    roster:[{id:'student@example.invalid',data:()=>({cls:999,seat:1})},{id:'student-two@example.invalid',data:()=>({cls:999,seat:2})}],
    login(uid){this.auths.get('ybs-me-teacher').change(uid?{uid,isAnonymous:uid==='anonymous'}:null)}
  };
  const records=[0,1,2,3].map(round=>({uid:'synthetic-student',email:'student@example.invalid',activity:1,round,at:Date.parse(round===0?'2026-10-12T01:00:00Z':'2026-11-01T01:00:00Z')}));
  records.push({uid:'synthetic-student',email:'student@example.invalid',activity:2,round:0});
  records.push({uid:'synthetic-student-two',email:'student-two@example.invalid',activity:1,round:0});
  const authFor=name=>{
    let persistence='local'; const listeners=new Set(), key='mock:auth:'+name;
    let user=JSON.parse(localStorage.getItem(key)||sessionStorage.getItem(key)||'null');
    if(!user && name==='ybs-me-teacher' && new URLSearchParams(location.search).get('restored')==='owner')user={uid:'synthetic-owner'};
    const change=next=>{
      user=next;const storage=persistence==='local'?localStorage:sessionStorage;
      if(user)storage.setItem(key,JSON.stringify(user));else storage.removeItem(key);
      listeners.forEach(fn=>fn(user));
    };
    window.addEventListener('storage',event=>{
      if(persistence==='local' && (event.key===key || event.key===null)){
        user=JSON.parse(localStorage.getItem(key)||'null');listeners.forEach(fn=>fn(user));
      }
    });
    const auth={get currentUser(){return user},change,
      async setPersistence(next){state.persistence.push({name,value:next});persistence=next;
        if(user)(next==='local'?localStorage:sessionStorage).setItem(key,JSON.stringify(user));
        (next==='local'?sessionStorage:localStorage).removeItem(key)},
      onAuthStateChanged(fn){listeners.add(fn);queueMicrotask(()=>{if(listeners.has(fn))fn(user)});return()=>listeners.delete(fn)},
      async signInWithPopup(){state.popups.push(name);change({uid:'synthetic-owner',email:'teacher@example.invalid',providerData:[{providerId:'google.com'}]});return {user}},
      async signOut(){state.signouts.push(name);change(null)}
    };
    state.auths.set(name,auth);return auth;
  };
  const db={doc:path=>({get:async options=>{state.reads.push({path,options});return {exists:true,data:()=>({ownerUid:state.ownerUid})}},
    set:async data=>{state.writes.push({path,data})}}),
    collection:path=>({get:async options=>{state.reads.push({path,options});return {docs:state.roster}},
      where:(field,op,value)=>({get:async options=>{
        state.reads.push({path,field,op,value,options});const mode=state.mode;
        if(mode==='wait')await new Promise(resolve=>state.pending.push(resolve));
        if(mode==='error')throw Error('offline');
        return {metadata:{fromCache:mode==='cache'},docs:records.concat([{uid:'other',email:'other@example.invalid',activity:3,round:0}]).map(r=>({id:r.uid+'_'+r.activity+'_'+r.round,data:()=>r}))};
      }})})};
  const apps=[];
  return {apps,initializeApp:(_config,name)=>{const auth=authFor(name),app={name,auth:()=>auth,firestore:()=>db};apps.push(app);return app},
    auth:{Auth:{Persistence:{SESSION:'session',LOCAL:'local'}},GoogleAuthProvider:class {setCustomParameters(){}}},
    firestore:{FieldValue:{serverTimestamp:()=>Date.now()}}};
})();`;
