// 合成共享後端：由 Node 持有資料；每個瀏覽器 context 只有 SDK 與自己的 Auth。
// 僅模擬本測試使用的 Firestore API，不代表 Rules／正式 SDK 驗證。
export function sharedBackend() {
  const docs=new Map(), versions=new Map(), offline=new Set(), calls=[], commits=[];
  let now=Date.parse('2026-10-21T12:00:10Z');
  const copy=value=>value===undefined?null:structuredClone(value);
  return {docs,offline,calls,commits,get now(){return now;},
    async request(device,uid,op,args) {
      calls.push({device,uid,op,args:copy(args)});
      if(offline.has(device)) return {error:'unavailable'};
      if(op==='get') {
        const {path}=args;
        if(path==='ybsCourses/115-df') return {data:{open:true}};
        if(path.includes('/roster/')) return {data:{cls:999,seat:uid==='u2'?2:1}};
        return {data:copy(docs.get(path)),version:versions.get(path)||0};
      }
      if(op==='commit') {
        if(args.reads.some(([path,version])=>(versions.get(path)||0)!==version)) return {retry:true};
      } else if(op==='set') {
        // 過關紀錄只准新增；重交既有紀錄時，既有 API 會讀回確認。
        if(docs.has(args.path)) return {error:'permission-denied'};
        args={writes:[args]};
      } else return {error:'unsupported-mock-operation'};
      const at=++now;
      for(const {path,data} of args.writes) {
        const stored=copy(data);
        for(const key of Object.keys(stored)) if(stored[key]?.__serverTimestamp) stored[key]=at;
        docs.set(path,stored);versions.set(path,(versions.get(path)||0)+1);
        commits.push({device,uid,path,data:copy(stored)});
      }
      return {ok:true};
    }
  };
}

export const sharedFirebase=String.raw`
window.firebase=(()=>{
  let current=null;const observers=[];
  const rpc=async(op,args)=>{
    const result=await window.__sharedFirebase(current?.uid,op,args);
    if(result.error) throw Object.assign(new Error('synthetic shared backend'),{code:result.error});
    return result;
  };
  const snap=result=>({exists:!!result.data,data:()=>{
    const data={...result.data};
    for(const key of ['createdAt','updatedAt']) if(typeof data[key]==='number') {
      const at=data[key];data[key]={toMillis:()=>at,toJSON:()=>at};
    }
    return data;
  }});
  const auth={setPersistence:async()=>{},get currentUser(){return current;},
    onAuthStateChanged:cb=>{observers.push(cb);queueMicrotask(()=>cb(current));return()=>{};},
    signOut:async()=>window.__setSyntheticUser(null)};
  window.__setSyntheticUser=uid=>{current=uid?{uid}:null;observers.forEach(cb=>cb(current));};
  const db={doc:path=>({path,get:async options=>snap(await rpc('get',{path,options})),
    set:async data=>rpc('set',{path,data})}),
    runTransaction:async callback=>{
      for(let attempt=0;attempt<5;attempt++) {
        const reads=[],writes=[];
        await callback({get:async ref=>{const result=await rpc('get',{path:ref.path});reads.push([ref.path,result.version]);return snap(result);},
          set:(ref,data)=>writes.push({path:ref.path,data:Object.fromEntries(Object.entries(data).map(([key,value])=>[key,typeof value?.toMillis==='function'?value.toMillis():value]))})});
        const result=await rpc('commit',{reads,writes});if(!result.retry) return;
      }
      throw Object.assign(new Error('synthetic contention'),{code:'aborted'});
    }};
  const app={name:'ybs',auth:()=>auth,firestore:()=>db};
  const fb={apps:[],initializeApp:()=>{fb.apps.push(app);return app;},
    auth:{Auth:{Persistence:{SESSION:'session'}}},
    firestore:{FieldValue:{serverTimestamp:()=>({__serverTimestamp:true})}}};
  return fb;
})();`;

// 測試專用：只注入合成已登入狀態，不經過帳密表單，也不改 production 檔案。
export function injectSyntheticLogin(source) {
  const seam='return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
  if(source.split(seam).length!==2) throw new Error('登入狀態注入點必須唯一');
  return source.replace(seam,`return { __testLogin: async uid => {
    await initFirebase(); window.__setSyntheticUser(uid);
    profile={uid,email:'synthetic-'+uid+'@example.invalid',account:'synthetic-'+uid};
  }, CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,`);
}
