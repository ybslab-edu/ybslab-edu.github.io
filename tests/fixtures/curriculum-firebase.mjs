// 僅供離線瀏覽器測試；所有資料均為合成，沒有正式 Firebase 連線。
export const fakeCurriculumFirebase = `
const state = window.__reportFake = {owner:'teacher1',fail:false,reads:[],hold:false,release:null};
const observers = new Set();
const notify = () => observers.forEach(fn=>fn(auth.currentUser));
const auth = {currentUser:null,setPersistence:async()=>{},
  onAuthStateChanged(fn){observers.add(fn);queueMicrotask(()=>{if(observers.has(fn))fn(auth.currentUser)});return()=>observers.delete(fn)},
  async signInWithPopup(){auth.currentUser={uid:'teacher1',isAnonymous:false};notify()},
  async signOut(){auth.currentUser=null;notify()}};
state.switchUser = uid => {auth.currentUser=uid?{uid,isAnonymous:false}:null;notify()};
state.roster = [1,2].map(seat=>({id:'s'+seat+'@example.invalid',data:()=>({cls:999,seat})}));
state.roster.push({id:'s3@example.invalid',data:()=>({cls:998,seat:1})});
state.attempts = [0,1,2,3].map(round=>({id:'student1_1_'+round,data:()=>({uid:'student1',email:'s1@example.invalid',activity:1,round,level:1,tries:2,passedAt:{toMillis:()=>1000}})}));
const db = {
 doc(path){return{async get(options){state.reads.push([path,options]);return{exists:true,data:()=>({ownerUid:state.owner})}}}},
 collection(path){return{async get(options){state.reads.push([path,options]);
  if(state.hold)await new Promise(ok=>{(state.resolvers ||= []).push(ok);state.release=()=>{state.resolvers.splice(0).forEach(fn=>fn());state.hold=false}});
  if(state.fail)throw Object.assign(Error('synthetic failure'),{code:'unavailable'});
  return{docs:state[path.split('/').pop()]};}}}
};
const app={name:'ybs',auth:()=>auth,firestore:()=>db};
window.firebase={apps:[app],auth:{Auth:{Persistence:{SESSION:'session',LOCAL:'local'}},GoogleAuthProvider:class{setCustomParameters(){}}}};
`;
