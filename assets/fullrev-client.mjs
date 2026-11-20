import {createDFReports} from './fullrev-df.mjs';
import {fail,id,int,time,versions,sameVersions,effectiveRecords} from './fullrev-progress.mjs?v=20261120a';

const scopeKey = (activity,round) => activity+':'+round;
const epochKeys = ['configVersion','bindingVersion','unitEpoch','roundEpoch','classUnitEpoch'];
const validContext = c => c && id(c.subject) && /^[\w-]{1,40}$/.test(c.classKey)
  && versions(c.controlVersions) && epochKeys.every((k,i) => int(c[k],i<2?1:0));
const clone = value => JSON.parse(JSON.stringify(value));
const inProgress = d => d && !d.blocked && (d.pending || /^[\w-]{22}$/.test(d.sid)
  && int(d.nextSeq,1) && [0,1].includes(d.slot));
export function checkConfig(config) {
  const project = config.firebase?.projectId;
  if (config.enabled !== true || typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)
      || /class-score|classscore|pilot|^demo-|replace/i.test(project) || !config.firebase.apiKey) throw fail('configuration-pending');
  let origin;
  try { origin = new URL(config.workerOrigin); } catch { throw fail('configuration-pending'); }
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.workers.dev') || origin.origin !== config.workerOrigin
      || origin.username || origin.password) throw fail('configuration-pending');
  return project;
}

// readModel 為 PR4 受控服務的 adapter；沒有 adapter 不猜版本、不直接 list／讀 gate。
export function createClient({config,session,readModel,course='115-g9',fetcher=globalThis.fetch,storage=globalThis.sessionStorage,
  shared=globalThis.localStorage,events=globalThis.window,now=Date.now,random=Math.random,
  requestId=()=>crypto.randomUUID(),schedule=setTimeout,cancel=clearTimeout}) {
  const project = checkConfig(config);
  if(!['115-g9','115-df'].includes(course))throw fail('invalid-course');
  const storageKey = 'ybs:fullrev:'+project+':'+course, signalKey = storageKey+':identity';
  let profile=null, generation=0, firebaseSession, sessionOpening, drafts={}, readVersion=0, signal='', timer;
  let status='signed-out', snapshot=null, view=null;
  const listeners = new Set(), running = new Map();
  const emit = next => { status=next; for (const f of listeners) f({profile:profile&&{...profile},status,
    pending:Object.values(drafts).some(d=>d.pending&&!d.blocked),snapshot,view}); };
  const savedSignal = () => {try{return shared?.getItem(signalKey)||'';}catch{return signal;}};
  signal=savedSignal();
  function save() {try{storage?.setItem(storageKey,JSON.stringify({uid:profile?.uid,signal,drafts}));}catch{emit('storage-pending');}}
  function clear() {cancel(timer);timer=null;generation++;readVersion++;running.clear();drafts={};snapshot=null;view=null;profile=null;
    try{storage?.removeItem(storageKey);}catch{} emit('signed-out');}
  function broadcast() {signal=requestId();try{shared?.setItem(signalKey,signal);}catch{}}
  function active(mark) {
    if (savedSignal()!==signal) {signal=savedSignal();clear();}
    if (!profile || mark.generation!==generation || mark.uid!==profile.uid
        || firebaseSession?.auth.currentUser?.uid!==mark.uid) throw fail('identity-changed');
  }
  const mark = () => {if(!profile)throw fail('login-required');const m={uid:profile.uid,generation};active(m);return m;};
  events?.addEventListener('storage',event=>{if(event.key===signalKey && savedSignal()!==signal){signal=savedSignal();clear();}});
  events?.addEventListener('pagehide',()=>{generation++;readVersion++;running.clear();snapshot=null;view=null;emit('stale');});
  events?.addEventListener('online',()=>{if(profile)retry().catch(()=>{});});
  async function getSession() {
    if (firebaseSession) return firebaseSession;
    if (!sessionOpening) sessionOpening=Promise.resolve().then(session).then(value=>{
      if (value.app?.options?.projectId !== project) throw fail('wrong-project');
      firebaseSession=value;
      value.auth.onAuthStateChanged?.(user=>{if(profile && user?.uid!==profile.uid)clear();});
      return value;
    }).finally(()=>{sessionOpening=null;});
    return sessionOpening;
  }
  async function token(m,force=false) {
    active(m); const value=await firebaseSession.auth.currentUser.getIdToken(force);active(m);return value;
  }
  async function claims(m,force=false) {
    active(m);const value=await firebaseSession.auth.currentUser.getIdTokenResult(force);active(m);return value.claims;
  }
  async function assertOwner(m) {
    const c=await claims(m);
    if(c.firebase?.sign_in_provider!=='google.com'||c.email_verified!==true)throw fail('owner-required');
    const db=firebaseSession.db;
    let teacher;
    try{teacher=await db.doc('ybsTeachers/'+m.uid).get({source:'server'});}
    catch(error){active(m);if(error.code==='permission-denied')throw fail('owner-required');throw error;}
    active(m);
    if(teacher.metadata?.fromCache || !teacher.exists || teacher.data().schemaVersion!==1 || teacher.data().enabled!==true)throw fail('owner-required');
    const meta=await db.doc('ybsCourses/'+course).get({source:'server'});active(m);
    if(meta.metadata?.fromCache || !meta.exists || meta.data().schemaVersion!==1 || meta.data().ownerUid!==m.uid)throw fail('owner-required');
    return true;
  }
  // 登入動作序列化；換人立即作廢舊工作，慢回應不得覆蓋下一個人。
  let authWork=Promise.resolve();
  const serialAuth = fn => {const work=authWork.then(fn);authWork=work.catch(()=>{});return work;};
  async function login(kind,account,password) {
    clear();broadcast();const g=generation;
    return serialAuth(async()=>{
      const {auth,googleProvider,persistence}=await getSession();
      if(g!==generation)throw fail('identity-changed');
      await auth.signOut();
      if(g!==generation)throw fail('identity-changed');
      await auth.setPersistence(persistence);
      if(g!==generation)throw fail('identity-changed');
      let credential;
      if(kind==='guest')credential=await auth.signInAnonymously();
      else if(kind==='google'||kind==='owner')credential=await auth.signInWithPopup(googleProvider());
      else {
        const name=String(account||'').trim().toLowerCase().replace(/@.*$/,'');
        const normalized=/^\d{3,12}$/.test(name)?'cgjh'+name:name;
        if(!/^cgjh\d{3,12}$/.test(normalized)||!password)throw fail('invalid-account');
        credential=await auth.signInWithEmailAndPassword(normalized+'@ybslab-edu.github.io',password);
      }
      if(g!==generation||savedSignal()!==signal){await auth.signOut();throw fail('identity-changed');}
      profile={uid:credential.user.uid,kind};
      const m=mark(), c=await claims(m,true);
      const provider=c.firebase?.sign_in_provider;
      if(!['google.com','password','anonymous'].includes(provider))throw fail('provider-invalid');
      let owner=kind==='owner';
      if(owner)await assertOwner(m);
      else if(provider==='google.com')try{owner=await assertOwner(m);}catch(e){if(e.code!=='owner-required')throw e;}
      profile={...profile,provider,owner};
      save();emit('signed-in');return {...profile};
    }).catch(error=>{if(g===generation)clear();throw error;});
  }
  async function restore() {
    const {auth}=await getSession();
    if (!auth.currentUser) return null;
    let saved;
    try{saved=JSON.parse(storage?.getItem(storageKey)||'null');}catch{}
    if(saved?.uid!==auth.currentUser.uid||saved.signal!==signal){clear();await auth.signOut();return null;}
    // SESSION 只還原此分頁。持久草稿不含題面／token，仍須重新確認投影與 Worker。
    const g=generation;
    profile={uid:auth.currentUser.uid,kind:'student',owner:false};
    const m=mark(), c=await claims(m);
    if(g!==generation)throw fail('identity-changed');
    profile.provider=c.firebase?.sign_in_provider;
    if(!['google.com','password','anonymous'].includes(profile.provider)){clear();throw fail('provider-invalid');}
    if(profile.provider==='google.com')try{profile.owner=await assertOwner(m);}catch(e){if(e.code!=='owner-required'){clear();throw e;}}
    try {
      if(saved?.uid===profile.uid&&saved.signal===signal&&saved.drafts) {
        const entries=Object.entries(saved.drafts).filter(([key,d])=>inProgress(d)&&validContext(d.context)&&d.uid===profile.uid
          &&d.project===project&&d.course===course&&key===scopeKey(d.activity,d.round)&&int(d.activity,1)&&d.activity<=30
          &&int(d.round)&&d.round<=4&&(!d.pending||['start','answer','resume'].includes(d.pending.op)));
        if(entries.length<=8)drafts=Object.fromEntries(entries);
      }
    }catch{} save();emit('signed-in');return {...profile};
  }
  function logout() {clear();broadcast();return serialAuth(async()=>{const {auth}=await getSession();await auth.signOut();});}
  async function classHint(m,force=false) {
    const c=await claims(m,force), map=c.ybsClassKeys;
    if(!map||typeof map!=='object'||Array.isArray(map)||!/^[\w-]{1,40}$/.test(map[course]||''))throw fail('binding-pending');
    return map[course];
  }
  async function context(activity,round) {
    const m=mark();if(profile.owner)throw fail('demonstration-only');
    if(typeof readModel?.context!=='function')throw fail('read-model-pending');
    const classKey=await classHint(m);
    const value=await readModel.context({course,classKey,activity,round});active(m);
    if(!validContext(value)||value.schemaVersion!==1||value.sourceProject!==project||value.course!==course
      ||value.uid!==m.uid||value.classKey!==classKey||value.activity!==activity||value.round!==round)throw fail('context-unconfirmed');
    return Object.fromEntries(['schemaVersion','sourceProject','course','uid','classKey','subject','activity','round',
      ...epochKeys,'controlVersions'].map(k=>[k,clone(value[k])]));
  }
  function arm(d) {
    cancel(timer); if(d.failures>=4||d.blocked)return;
    const g=generation;timer=schedule(()=>{if(g===generation)retry().catch(()=>{});},Math.max(0,d.retryAt-now()));
  }
  async function send(d,m) {
    if(!['115-g9','115-df'].includes(course))throw fail('grading-not-supported');
    if(profile?.owner)throw fail('demonstration-only');
    const pending=d.pending;if(!pending)throw fail('nothing-pending');
    if(d.blocked)throw fail('restart-required');
    if(d.retryAt>now())throw fail('retry-later');
    active(m);emit('sending');
    try {
      const body=JSON.stringify(pending.body);
      if(new TextEncoder().encode(body).length>8192)throw fail('answer-too-large');
      let response;
      for(let refresh=0;refresh<2;refresh++) {
        const bearer=await token(m,refresh===1);
        response=await fetcher(config.workerOrigin+'/'+pending.op,{method:'POST',credentials:'omit',cache:'no-store',
          redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body});active(m);
        if(response.status!==401)break;
      }
      if(!response.ok) {
        if(response.status===401){clear();throw fail('login-required');}
        if(response.status===429||response.status>=500) {
          const header=response.headers.get('retry-after'), seconds=Number(header);
          const until=header && !Number.isNaN(seconds)?now()+Math.max(0,seconds)*1000:Date.parse(header||'');
          d.retryAt=Math.max(Number.isFinite(until)?until:0,now()+Math.min(60000,1000*2**Math.min(d.failures||0,6))+Math.floor(random()*500));
          throw fail('pending');
        }
        d.blocked=true;delete drafts[scopeKey(d.activity,d.round)];save();emit('restart-required');throw fail('restart-required');
      }
      const value=await response.json();active(m);
      if(typeof value.completed!=='boolean'||(value.awaitingTeacher===true?value.completed||! /^[\w-]{22}$/.test(value.sid):value.completed ? !id(value.resultId)
        : !/^[\w-]{22}$/.test(value.sid)||!int(value.nextSeq,1)||!value.question||![0,1].includes(value.question.slot)))throw fail('response-invalid');
      d.pending=null;d.failures=0;d.retryAt=0;
      d.sid=value.sid||d.sid;d.nextSeq=value.nextSeq;d.slot=value.question?.slot;
      if(value.completed||value.awaitingTeacher)delete drafts[scopeKey(d.activity,d.round)];
      view={activity:d.activity,round:d.round,...clone(value)};
      save();snapshot=null;emit(value.awaitingTeacher?'teacher-pending':value.completed?'confirmation-pending':'ready');
      // 題面只回傳到記憶體；completed 回條不直接新增進度／XP。
      return {activity:d.activity,round:d.round,...clone(value)};
    } catch(error) {
      active(m);
      if(d.blocked||error.code==='answer-too-large'){emit('restart-required');throw error;}
      d.failures=(d.failures||0)+1;
      if(!d.retryAt||d.retryAt<=now())d.retryAt=now()+Math.min(60000,1000*2**Math.min(d.failures-1,6))+Math.floor(random()*500);
      save();emit('pending');arm(d);throw fail('pending');
    }
  }
  async function exclusive(key,fn) {
    if(running.has(key))throw fail('request-in-flight');
    const lock=Symbol();running.set(key,lock);
    try{return await fn();}finally{if(running.get(key)===lock)running.delete(key);}
  }
  async function start(activity,round,{restart=false}={}) {
    const key=scopeKey(activity,round);
    return exclusive(key,async()=>{
      const m=mark();if(profile.owner)throw fail('demonstration-only');
      if(!['115-g9','115-df'].includes(course))throw fail('grading-not-supported');
      if(!int(activity,1)||activity>30||!int(round)||round>4)throw fail('invalid-scope');
      if(drafts[key]&&!restart){
        const d=drafts[key];
        return d.pending?send(d,m):resume(activity,round,true);
      }
      const c=await context(activity,round);active(m);
      if(Object.keys(drafts).length>=8&&!drafts[key])throw fail('draft-capacity');
      const body={course,classKey:c.classKey,activity,round,requestId:requestId()};
      for(const name of epochKeys)body[name]=c[name];
      const d={project,course,uid:m.uid,activity,round,context:c,startRequestId:body.requestId,pending:{op:'start',body},failures:0,retryAt:0};
      drafts[key]=d;save();return send(d,m);
    });
  }
  async function answer(activity,round,answer) {
    const key=scopeKey(activity,round);
    return exclusive(key,async()=>{
      const m=mark(),d=drafts[key];
      if(profile.owner)throw fail('demonstration-only');
      if(!d||!d.sid||d.blocked)throw fail('restart-required');
      if(d.pending)throw fail('answer-pending');
      const body={course,classKey:d.context.classKey,activity,round,requestId:requestId(),sid:d.sid,seq:d.nextSeq,slot:d.slot,answer:clone(answer)};
      if(new TextEncoder().encode(JSON.stringify(body)).length>8192)throw fail('answer-too-large');
      d.pending={op:'answer',body};save();return send(d,m);
    });
  }
  async function resume(activity,round,locked=false) {
    const work=async()=>{
      const m=mark(),d=drafts[scopeKey(activity,round)];
      if(!d||d.blocked)throw fail('restart-required');
      if(!d.pending)d.pending={op:'resume',body:{course,classKey:d.context.classKey,activity,round,sid:d.sid,requestId:requestId()}};
      save();return send(d,m);
    };
    return locked?work():exclusive(scopeKey(activity,round),work);
  }
  async function retry() {
    const m=mark(), output=[];
    for(const [key,d] of Object.entries(drafts))if(d.pending&&!d.blocked&&d.retryAt<=now()) {
      output.push(await exclusive(key,()=>send(d,m)));active(m);
    }
    return output;
  }
  // 分頁前後重查控制版；完整空頁也是確認後的空集合，查詢失敗絕不回傳 []。
  async function progress({activities,classKey,activity,teacher=false}={}) {
    const m=mark(), request=++readVersion;snapshot=null;emit('confirmation-pending');
    try {
      if(!readModel?.page||!readModel?.controls)throw fail('read-model-pending');
      if(teacher)await assertOwner(m);else classKey=await classHint(m);
      if(!/^[\w-]{1,40}$/.test(classKey||''))throw fail('invalid-class');
      const input={course,classKey,...(activity===undefined?{}:{activity}),limit:100};
      const before=await readModel.controls(input);active(m);
      if(!versions(before))throw fail('control-unconfirmed');
      const records=[],people=[];let cursor=null,subject,provider,seen=new Set();
      for(let pageNumber=0;pageNumber<100;pageNumber++) {
        const page=await readModel.page({...input,cursor,controlVersions:before});active(m);
        if(request!==readVersion)throw fail('read-superseded');
        if(page.schemaVersion!==1||page.sourceProject!==project||page.course!==course||page.classKey!==classKey
          ||page.state!=='confirmed'||!sameVersions(page.controlVersions,before)||!Array.isArray(page.records)
          ||page.records.length>100||typeof page.complete!=='boolean')throw fail('page-unconfirmed');
        if(!teacher){if(!id(page.subject)||subject&&subject!==page.subject)throw fail('subject-mismatch');subject=page.subject;provider=profile.provider;}
        records.push(...clone(page.records));if(page.people)people.push(...clone(page.people));
        if(page.complete){if(page.nextCursor!=null)throw fail('cursor-invalid');cursor=null;break;}
        const next=JSON.stringify(page.nextCursor);
        if(!page.nextCursor||seen.has(next))throw fail('cursor-invalid');seen.add(next);cursor=page.nextCursor;
      }
      if(cursor)throw fail('page-capacity');
      const after=await readModel.controls(input);active(m);
      if(request!==readVersion)throw fail('read-superseded');
      if(!sameVersions(before,after))throw fail('control-changed');
      const result={schemaVersion:1,sourceProject:project,course,classKey,subject,provider,state:'confirmed',complete:true,
        controlVersions:after,records,people};
      const validity=effectiveRecords(result,{project,course,subject,activities});
      if(validity.state!=='confirmed')throw fail(validity.reason);
      snapshot=result;emit('confirmed');return clone(result);
    }catch(error){active(m);if(request===readVersion){snapshot=null;emit('confirmation-pending');}throw error;}
  }
  const reports=createDFReports({course,getSession,mark,active,claims,context,fail});
  async function submitManual(round){
    if(course!=='115-df'||!int(round)||round>2)throw fail('invalid-scope');
    const v=await start(1,round);
    return v.completed||v.awaitingTeacher?v:answer(1,round,{session:round+1});
  }
  async function dfContent(){
    const m=mark();if(course!=='115-df'||!readModel?.dfContent)throw fail('read-model-pending');
    const c=await context(1,0),value=await readModel.dfContent(c);active(m);
    if(!value||value.schemaVersion!==1||value.sourceProject!==project||value.uid!==m.uid||value.course!==course
      ||!sameVersions(value.controlVersions,c.controlVersions)||!value.scripts
      ||!['pub','enc-b2','enc-rv'].every(k=>typeof value.scripts[k]==='string'))throw fail('context-unconfirmed');
    return clone(value.scripts);
  }
  return Object.freeze({project,course,session:getSession,whoami:reports.whoami,submitReport:reports.submitReport,submitManual,dfContent,login,restore,logout,context,start,answer,resume,retry,progress,
    owner:()=>assertOwner(mark()),refreshClaims:async()=>{const m=mark();await claims(m,true);return classHint(m);},
    subscribe(f){listeners.add(f);emit(status);return()=>listeners.delete(f);},
    state:()=>({profile:profile&&{...profile},status,snapshot:clone(snapshot),pending:Object.values(drafts).some(d=>d.pending&&!d.blocked)})});
}

export async function createBrowserClient(config) {
  const project=checkConfig(config);
  const course=location.pathname.split('/').filter(Boolean)[0];
  const script=src=>new Promise((resolve,reject)=>{
    const element=document.createElement('script');element.src=src;element.onload=resolve;
    element.onerror=()=>{element.remove();reject(fail('sdk-unavailable'));};document.head.appendChild(element);
  });
  let opening;
  const session=()=>opening||=(async()=>{
    for(const name of ['app','auth','firestore'])await script('https://www.gstatic.com/firebasejs/10.14.1/firebase-'+name+'-compat.js');
    const app=firebase.apps.find(a=>a.name==='ybs-fullrev')||firebase.initializeApp({...config.firebase,authDomain:project+'.firebaseapp.com'},'ybs-fullrev');
    const auth=app.auth();
    await new Promise((resolve,reject)=>{const off=auth.onAuthStateChanged(()=>{resolve();Promise.resolve().then(off);},reject);});
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    return {app,auth,db:app.firestore(),persistence:firebase.auth.Auth.Persistence.SESSION,
      googleProvider:()=>{const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});return p;}};
  })().catch(error=>{opening=null;throw error;});
  let readModel;
  if(config.readModelModule) {
    const url=new URL(config.readModelModule,location.href);
    if(url.origin!==location.origin)throw fail('read-model-origin');
    readModel=await (await import(url.href)).createReadModel({session,project,course});
  }
  return createClient({config,session,readModel,course});
}
