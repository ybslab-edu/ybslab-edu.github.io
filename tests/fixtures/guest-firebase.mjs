// 只在 VM 內執行真正的 login.js；所有班座與 Firebase 行為都是合成資料。
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../assets/login.js',import.meta.url),'utf8');
const entry='  return { CONFIG, enabled, button, submit, flush, logout, whoami, submitReport,';
const instrumented=source.replace(entry,'  globalThis.accountProfile = value => { profile=value; };\n  globalThis.accountSignIn = signIn;\n'+entry);
export const key='ybslab:guest:115-g9';
export const packet=(extra={})=>({cls:999,seat:1,activity:1,round:0,level:1,tries:2,termWeek:7,...extra});
export const error=code=>Object.assign(new Error('synthetic failure'),{code});
export const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
export function setup({stored=new Map(),session=new Map(),user=null,write=async()=>{},accountLogin=async()=>{},anonymousLogin=async()=>{},authFailure=null,storageFails=false,storageLimit=Infinity,pathname='/115-g9/u1-05/'}={}){
  const calls=[],reads=[],authCalls=[],statuses=[],warnings=[],events=new Map(),scripts=new Map(),timers=[];
  let sequence=0, blocked=storageFails, loginFailure=authFailure, now=Date.now();
  const observers=new Set();
  const auth={currentUser:user,setPersistence:async()=>{},
    onAuthStateChanged(fn){observers.add(fn);queueMicrotask(()=>{if(observers.has(fn))fn(auth.currentUser);});return()=>observers.delete(fn);},
    async signInAnonymously(){authCalls.push('anonymous');if(loginFailure)throw error(loginFailure);await anonymousLogin();auth.currentUser={uid:'guest'+(++sequence),isAnonymous:true};observers.forEach(f=>f(auth.currentUser));return{user:auth.currentUser};},
    async signInWithEmailAndPassword(){authCalls.push('password');await accountLogin();auth.currentUser={uid:'account1',isAnonymous:false};observers.forEach(f=>f(auth.currentUser));return{user:auth.currentUser};},
    async signOut(){authCalls.push('signOut');auth.currentUser=null;observers.forEach(f=>f(null));}};
  const db={doc(path){return{async set(data){calls.push({path,data,uid:auth.currentUser?.uid});await write(data,path);},async get(){reads.push(path);throw error('permission-denied');}};}};
  const app={name:'ybs',auth:()=>auth,firestore:()=>db};
  const storage=(map,canFail)=>({getItem(k){if(canFail&&blocked)throw Error('synthetic storage');return map.get(k)??null;},setItem(k,v){if(canFail&&(blocked||v.length>storageLimit))throw Error('synthetic storage');map.set(k,v);},removeItem(k){map.delete(k);}});
  const context=vm.createContext({location:{pathname},Date:class extends Date{static now(){return now;}},console:{warn(...args){warnings.push(args);}},
    localStorage:storage(stored,true),sessionStorage:storage(session,false),
    setInterval(fn,ms){timers.push({fn,ms});},setTimeout,queueMicrotask,
    window:{addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);}},
    document:{cookie:user && !user.isAnonymous ? 'ybslab_browser=1' : '',querySelector(selector){return scripts.get(selector)||null;},createElement(){return{remove(){scripts.delete('script[src="'+this.src+'"]');}};},head:{appendChild(s){scripts.set('script[src="'+s.src+'"]',s);queueMicrotask(()=>s.onload());}}},
    firebase:{apps:[app],auth:{Auth:{Persistence:{SESSION:'session',LOCAL:'local'}}},firestore:{FieldValue:{serverTimestamp:()=> 'SERVER_TIMESTAMP'}}}});
  vm.runInContext(instrumented+'\nglobalThis.api=YBS;',context,{filename:'assets/login.js'});
  context.api.status(state=>statuses.push(state));
  return {api:context.api,auth,stored,session,calls,reads,authCalls,statuses,warnings,timers,
    queue:()=>JSON.parse(stored.get(key)||'{"queue":[],"receipts":[]}').queue,
    state:()=>JSON.parse(stored.get(key)||'{"queue":[],"receipts":[]}'),
    blockStorage(value){blocked=value;},
    limitStorage(value){storageLimit=value;},advance(ms=60000){now+=ms;},
    failLogin(code){loginFailure=code;},
    signIn:()=>context.accountSignIn('9990001','synthetic-test-password'),
    async online(){await Promise.all((events.get('online')||[]).map(f=>f()));await settle();},
    async account(uid='google1'){await context.api.firebaseSession();auth.currentUser={uid,isAnonymous:false};context.accountProfile({uid,email:'synthetic@example.invalid'});}};
}
