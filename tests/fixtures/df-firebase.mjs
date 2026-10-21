// DF 交件測試共用，所有帳號、作答及時戳均為合成資料。
export const fakeFirebase=String.raw`
window.firebase=(()=>{
  let current=null; const observers=[];
  const stamp=ms=>({toMillis:()=>ms});
  const error=code=>Object.assign(new Error('synthetic failure'),{code});
  const f=window.__fake={reports:{},commits:[],attempts:[],gets:[],transactions:0,failures:[],open:true,
    hold:null,release:null,roster:true,rosterSeat:null,readError:null};
  f.setUser=uid=>{current=uid?{uid}:null; observers.forEach(cb=>cb(current));};
  f.cloud=(session,at,payload='newer')=>{
    f.reports['ybsCourses/115-df/reports/u1_s'+session]={uid:'u1',session,cls:999,seat:1,
      schemaVersion:1,encoding:'ascii-json',payload,createdAt:stamp(at-100),updatedAt:stamp(at)};
  };
  const pause=async stage=>{if(f.hold===stage){f.hold=null;await new Promise(r=>f.release=r);f.release=null;}};
  const snapshot=data=>({exists:!!data,data:()=>data});
  const auth={setPersistence:async()=>{},get currentUser(){return current;},
    onAuthStateChanged:cb=>{observers.push(cb);queueMicrotask(()=>cb(current));return()=>{};},
    signOut:async()=>f.setUser(null),
    signInWithEmailAndPassword:async email=>{const uid=email.includes('9990002')?'u2':'u1';f.setUser(uid);return{user:current};}};
  const db={doc:path=>({path,set:async data=>f.attempts.push({path,data}),get:async options=>{
    f.gets.push({path,source:options?.source});
    if(path==='ybsCourses/115-df') {if(f.readError) throw error(f.readError);return snapshot({open:f.open});}
    if(path.includes('/roster/')) return snapshot(f.roster?{cls:999,seat:f.rosterSeat || (path.includes('9990002')?2:1)}:null);
    await pause('receipt');return snapshot(f.reports[path]);
  }}),runTransaction:async callback=>{
    f.transactions++; const failure=f.failures.shift();if(failure) throw error(failure);
    await pause('beforeRead'); const writes=[];
    const tx={get:async ref=>snapshot(f.reports[ref.path]),set:(ref,data)=>writes.push({ref,data})};
    await callback(tx); await pause('beforeCommit');
    for(const {ref,data} of writes){
      const time=Date.now(); for(const k of ['createdAt','updatedAt']) if(data[k]?.server) data[k]=stamp(time);
      f.reports[ref.path]=data; f.commits.push({path:ref.path,data:{...data,createdAt:data.createdAt.toMillis(),updatedAt:data.updatedAt.toMillis()}});
    }
  }};
  const app={name:'ybs',auth:()=>auth,firestore:()=>db};
  const fb={apps:[],initializeApp:()=>{fb.apps.push(app);return app;},
    auth:{Auth:{Persistence:{SESSION:'session'}}},firestore:{FieldValue:{serverTimestamp:()=>({server:true})}}};
  return fb;
})();`;
