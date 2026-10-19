// 本機測試用的假 Firebase（compat 版介面的最小子集），由 tools/dev/check-pages.py 注入；不連任何正式服務。
window.__writes=[];window.__signin=[];
window.firebase=window.firebase||(()=>{const apps=[];
 const auth={currentUser:null,setPersistence:async()=>{},signInWithEmailAndPassword:async(e,p)=>{__signin.push([e,p]);if(e==='cgjh1100123@ybslab-edu.github.io'&&p==='cgjhA123456789'){auth.currentUser={uid:'U1',email:e};return{user:auth.currentUser}}const err=new Error('x');err.code='auth/invalid-credential';throw err},signOut:async()=>{auth.currentUser=null}};
 const fs={doc:path=>({get:async()=>path.endsWith('/roster/cgjh1100123@cgjh.hcc.edu.tw')?{exists:true,data:()=>({cls:917,seat:5})}:{exists:false},set:async d=>{__writes.push([path,d])}})};
 const f={apps,initializeApp:(o,n)=>{const a={name:n,auth:()=>auth,firestore:()=>fs};apps.push(a);return a},auth:{Auth:{Persistence:{SESSION:'s',NONE:'n'}}},firestore:{FieldValue:{serverTimestamp:()=>'TS'}}};
 f.auth.Auth={Persistence:{SESSION:'s',NONE:'n'}};return f})();
