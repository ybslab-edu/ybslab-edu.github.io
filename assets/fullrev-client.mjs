import {createWorkStore,questionStamp,WORK_TTL,workExpiresAt} from './fullrev-work-store.mjs';
import {createAccountSession} from './fullrev-account-session.mjs';
import {mountTicketNotice,TICKET_WARNING_MS} from './fullrev-ticket-notice.mjs';
import {guestScope,isGuestContext,guestFields,guestCompletion,readGuestContext} from './fullrev-guest.mjs';
import {createDFReports} from './fullrev-df.mjs';
import {fail,id,int,time,versions,sameVersions,effectiveRecords} from './fullrev-progress.mjs?v=20261127b3';
import {createProgressCache} from './fullrev-progress-cache.mjs';

const scopeKey = (activity,round) => activity+':'+round;
const epochKeys = ['configVersion','bindingVersion','unitEpoch','roundEpoch','classUnitEpoch'];
const ticketErrors=new Set(['ticket_expired','ticket_invalid','ticket_not_owned','ticket_out_of_order','ticket_attempt_limit',
  'ticket_stale','ticket_replayed','tickets_disabled','ticket_secret_required','ticket_scope_not_supported']);
const ticketValid=v=>v?.ticketVersion===1&&typeof v.ticket==='string'&&v.ticket.startsWith('ybs-answer-v1.')&&v.ticket.length<=60000;
const validContext = c => isGuestContext(c) || c && id(c.subject) && /^[\w-]{1,40}$/.test(c.classKey)
  && versions(c.controlVersions) && epochKeys.every((k,i) => int(c[k],i<2?1:0));
const clone = value => JSON.parse(JSON.stringify(value));
const inProgress = d => d && !d.blocked && (d.pending || /^[\w-]{22}$/.test(d.sid)
  && int(d.nextSeq,1) && [0,1].includes(d.slot));
export function checkConfig(config) {
  const project = config?.firebase?.projectId;
  if (config?.enabled !== true || typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project)
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
  requestId=()=>crypto.randomUUID(),schedule=setTimeout,cancel=clearTimeout,requestTimeoutMs=20000,
  deadlineSchedule=setTimeout,deadlineCancel=clearTimeout}) {
  const project = checkConfig(config);
  if(!['115-g9','115-df'].includes(course))throw fail('invalid-course');
  const storageKey = 'ybs:fullrev:'+project+':'+course, signalKey = storageKey+':identity';
  const workStore=createWorkStore({shared,project,course,now});
  const progressWork=new Map(),aborters=new Set();
  let progressCache=createProgressCache({storage:shared,project,course});
  let progressActivities=null,binding=null,summaryIssue=null,legacyControlsFirst=false,legacyProgressBody=false,historyController=null;
  const abortRequests=(keep=null)=>{readModel?.cancel?.();for(const c of aborters)if(c!==keep){c.abort();aborters.delete(c);}progressWork.clear();};
  function confirmBinding(m,classKey,subject,keep){
    const changed=binding&&(binding.classKey!==classKey||binding.subject&&subject&&binding.subject!==subject);
    if(changed){
      abortRequests(keep);progressCache.purge();generation++;m.generation=generation;
      cancel(timer);timer=null;drafts={};view=null;snapshot=null;lastProgress=null;progressActivities=null;running.clear();gradingWork=Promise.resolve();save();
    }
    binding={classKey,subject:subject??(binding?.classKey===classKey?binding.subject:null)};
    if(changed)emit('binding-changed');
  }
  let profile=null, generation=0, startVersion=0, firebaseSession, sessionOpening, drafts={}, readVersion=0, signal='', timer;
  let status='signed-out', snapshot=null, lastProgress=null, view=null, readingRetry=null, guestXP=[];
  let ticketTimer=null,expiredTicket=null;
  const timingOf=(d,state)=>({state,activity:d.activity,round:d.round,expiresAt:d.expiresAt});
  function ticketTiming(){const d=Object.values(drafts).find(d=>d.ticketMode&&Number.isFinite(workExpiresAt(d)));
    return d?timingOf(d,workExpiresAt(d)-now()>TICKET_WARNING_MS?'active':'warning'):expiredTicket;}
  function checkTicketDeadline(notify=true){
    deadlineCancel(ticketTimer);ticketTimer=null;if(!profile)return;
    if(savedSignal()!==signal||firebaseSession?.auth.currentUser?.uid!==profile.uid){signal=savedSignal();clear();return;}
    let expired=false,next=Infinity;
    for(const [key,d] of Object.entries(drafts))if(d.ticketMode&&Number.isFinite(workExpiresAt(d))){
      const left=workExpiresAt(d)-now();
      if(left<=0){expiredTicket=timingOf(d,'expired');delete drafts[key];expired=true;}
      else next=Math.min(next,left>TICKET_WARNING_MS?left-TICKET_WARNING_MS:left);
    }
    if(expired){cancel(timer);timer=null;view=null;save();emit('restart-required');abortRequests();}
    else if(notify&&Number.isFinite(next))emit(status);
    if(Number.isFinite(next)){ticketTimer=deadlineSchedule(()=>checkTicketDeadline(),Math.min(next,WORK_TTL));ticketTimer?.unref?.();}
  }
  let gradingWork=Promise.resolve();
  const listeners = new Set(), running = new Map();
  // 只保留可公開的錯誤種類，不保存伺服器錯誤內容。
  const uploadIssue=()=>Object.values(drafts).find(d=>d.pending&&!d.blocked)?.issue||null;
  const startRetry=()=>{
    const d=Object.values(drafts).find(d=>d.pending?.op==='start'&&d.startRateLimited&&!d.blocked);
    return d?{activity:d.activity,round:d.round,retryAt:d.retryAt,automatic:!d.startRetryUsed}:null;
  };
  const emit = next => { status=profile&&expiredTicket?'restart-required':next; for (const f of listeners) f({profile:profile&&{...profile},status,
    pending:Object.values(drafts).some(d=>d.pending&&!d.blocked),uploadIssue:uploadIssue(),startRetry:startRetry(),snapshot,view,readingRetry,ticketTiming:ticketTiming()}); };
  readModel?.subscribeRetry?.(value=>{readingRetry=profile?value:null;emit(status);});
  const savedSignal = () => {try{return shared?.getItem(signalKey)||'';}catch{return signal;}};
  signal=savedSignal();
  function save() {try{storage?.setItem(storageKey,JSON.stringify({uid:profile?.uid,signal,drafts,guest:profile?.guest,
    ...(profile?.provider==='anonymous'?{guestXP}:{})}));}catch{emit('storage-pending');}return workStore.write(profile?.uid,drafts);}
  function purgeUID(uid){if(uid){workStore.purge(uid);
    try{const keys=Array.from({length:storage?.length||0},(_,i)=>storage.key(i));for(const k of keys)if(k?.startsWith('ybs:fullrev:'+project+':')){try{if(JSON.parse(storage.getItem(k))?.uid===uid)storage.removeItem(k);}catch{}}}catch{}
    }}
  function clear(uid=profile?.uid,{preserveShared=false}={}) {abortRequests();deadlineCancel(ticketTimer);ticketTimer=null;expiredTicket=null;
    if(preserveShared)progressCache=createProgressCache({storage:shared,project,course});else progressCache.purge();
    progressActivities=null;binding=null;summaryIssue=null;purgeUID(uid);
    cancel(timer);timer=null;generation++;readVersion++;running.clear();gradingWork=Promise.resolve();drafts={};guestXP=[];snapshot=null;lastProgress=null;view=null;readingRetry=null;profile=null;
    try{storage?.removeItem(storageKey);}catch{} emit('signed-out');}
  function broadcast() {signal=requestId();try{shared?.setItem(signalKey,signal);}catch{}}
  function active(mark) {
    if (savedSignal()!==signal) {signal=savedSignal();clear();}
    if (!profile || mark.generation!==generation || mark.uid!==profile.uid
        || mark.startVersion!==undefined&&mark.startVersion!==startVersion
        || firebaseSession?.auth.currentUser?.uid!==mark.uid) throw fail('identity-changed');
  }
  const mark = () => {if(!profile)throw fail('login-required');const m={uid:profile.uid,generation};active(m);return m;};
  events?.addEventListener('storage',event=>{if(event.key===signalKey && savedSignal()!==signal){signal=savedSignal();clear();}});
  events?.addEventListener('pagehide',()=>{abortRequests();deadlineCancel(ticketTimer);ticketTimer=null;expiredTicket=null;generation++;readVersion++;running.clear();gradingWork=Promise.resolve();snapshot=null;lastProgress=null;view=null;emit('stale');});
  events?.addEventListener('focus',()=>{if(profile)checkTicketDeadline();});
  events?.addEventListener('pageshow',()=>{if(profile)checkTicketDeadline();});
  events?.addEventListener('online',()=>{if(profile)retry({automatic:true}).catch(()=>{});});
  async function getSession() {
    if (firebaseSession) return firebaseSession;
    if (!sessionOpening) sessionOpening=Promise.resolve().then(session).then(async value=>{
      if (value.app?.options?.projectId !== project) throw fail('wrong-project');
      if(value.browserSession?.isAccount(value.auth.currentUser)&&!value.browserSession.has()){
        const uid=value.auth.currentUser.uid;value.browserSession.clear();purgeUID(uid);progressCache.purge();broadcast();await value.auth.signOut();
      }
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
  async function teacherQuestion(activity,round){
    const m=mark();if(!profile.owner)throw fail('owner-required');
    if(course!=='115-g9'||!int(activity,1)||activity>30||!int(round)||round>4)throw fail('invalid-scope');
    const bearer=await token(m);
    const response=await fetcher(config.workerOrigin+'/teacher-question',{method:'POST',credentials:'omit',cache:'no-store',
      redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({course,activity,round})});
    active(m);
    const value=await response.json();active(m);
    if(!response.ok)throw fail(value?.error==='reauth_required'?'reauth-required':response.status===401?'login-required':response.status===403?'owner-required':'teacher-content-unavailable');
    if(response.headers.get('cache-control')!=='no-store'||value.sourceProject!==project||value.uid!==m.uid
      ||value.course!==course||value.activity!==activity||value.round!==round||!value.question?.data
      ||!value.solution||!Object.hasOwn(value.solution,'answer')||!Array.isArray(value.solution.notes))throw fail('response-invalid');
    // Private teaching responses stay in this caller's memory, never drafts, view or storage.
    return value;
  }
  // 登入動作序列化；換人立即作廢舊工作，慢回應不得覆蓋下一個人。
  let authWork=Promise.resolve();
  const serialAuth = fn => {const work=authWork.then(fn);authWork=work.catch(()=>{});return work;};
  async function login(kind,account,password) {
    const guest=kind==='guest'?guestScope(account):null;
    if(guest&&course!=='115-g9')throw fail('grading-not-supported');
    firebaseSession?.browserSession?.clear();clear();broadcast();const g=generation;
    return serialAuth(async()=>{
      const {auth,googleProvider,persistence,accountPersistence,browserSession}=await getSession();
      if(g!==generation)throw fail('identity-changed');
      await auth.signOut();
      if(g!==generation)throw fail('identity-changed');
      browserSession?.clear();
      await auth.setPersistence(!['guest','google','owner'].includes(kind)?accountPersistence||persistence:persistence);
      if(g!==generation)throw fail('identity-changed');
      let credential;
      if(kind==='guest')credential=await auth.signInAnonymously();
      else if(kind==='google'||kind==='owner')credential=await auth.signInWithPopup(googleProvider());
      else {
        const name=String(account||'').trim().toLowerCase().replace(/@.*$/,'').replace(/\s+/g,'');
        const normalized=/^\d{3,12}$/.test(name)?'cgjh'+name:name;
        if(!/^cgjh\d{3,12}$/.test(normalized)||!password)throw fail('invalid-account');
        // 帳密正規化與 LOCAL＋瀏覽器 session cookie 沿用舊站。
        const text=String(password||'').trim(),match=text.match(/^cgjh([a-z][0-9a-d]\d{8})$/i);
        credential=await auth.signInWithEmailAndPassword(normalized+'@ybslab-edu.github.io',match?'cgjh'+match[1].toUpperCase():text);
      }
      if(g!==generation||savedSignal()!==signal){await auth.signOut();throw fail('identity-changed');}
      if(!['guest','google','owner'].includes(kind)&&browserSession&&!browserSession.mark()){
        await auth.signOut();throw fail('browser-cookie-required');
      }
      profile={uid:credential.user.uid,kind,...(guest?{guest}:{})};
      const m=mark(), c=await claims(m,true);
      const provider=c.firebase?.sign_in_provider;
      if(!['google.com','password','anonymous'].includes(provider))throw fail('provider-invalid');
      let owner=kind==='owner';
      if(owner)await assertOwner(m);
      else if(provider==='google.com')try{owner=await assertOwner(m);}catch(e){if(e.code!=='owner-required')throw e;}
      profile={...profile,provider,owner};
      progressCache.retain(profile);
      workStore.retain(profile.uid);if(!owner)drafts=restorable(workStore.read(profile.uid));
      save();emit('signed-in');return {...profile};
    }).catch(error=>{if(g===generation)clear();throw error;});
  }
  function restorable(value){
    const entries=Object.entries(value).filter(([key,d])=>inProgress(d)&&validContext(d.context)&&d.uid===profile.uid
          &&(!d.ticketMode||config.answerTickets===true)
          &&d.project===project&&d.course===course&&key===scopeKey(d.activity,d.round)&&int(d.activity,1)&&d.activity<=30
          &&int(d.round)&&d.round<=4&&(!d.pending||['start','answer','resume'].includes(d.pending.op)));
    for(const [,d] of entries)if(d.input&&(!Number.isFinite(d.input.savedAt)||now()-d.input.savedAt>=WORK_TTL||d.input.savedAt>now()))delete d.input;
    const live=entries.filter(([,d])=>{if(workExpiresAt(d)<=now()){if(d.ticketMode)expiredTicket=timingOf(d,'expired');return false;}return true;});
    return live.length<=8?Object.fromEntries(live):{};
  }
  async function restore() {
    const {auth}=await getSession();
    if (!auth.currentUser) {workStore.retain(null);clear();return null;}
    signal=savedSignal();
    let saved;
    try{saved=JSON.parse(storage?.getItem(storageKey)||'null');}catch{}
    if(!saved){const local=workStore.read(auth.currentUser.uid);if(Object.keys(local).length||firebaseSession.browserSession?.isAccount(auth.currentUser)&&firebaseSession.browserSession.has())saved={uid:auth.currentUser.uid,signal,drafts:local};}
    if(saved?.uid!==auth.currentUser.uid||saved.signal!==signal){
      // 舊分頁只丟棄自己的快照；目前的 LOCAL 登入、cookie 與新草稿屬於其他分頁。
      const previousUID=saved?.uid||profile?.uid;
      clear(previousUID&&previousUID!==auth.currentUser.uid?previousUID:null,{preserveShared:true});return null;
    }
    // 帳密可跨分頁還原；Google／訪客仍限分頁。持久草稿僅含加密票及輸入。
    const g=generation;
    profile={uid:auth.currentUser.uid,kind:'student',owner:false};
    const m=mark(), c=await claims(m);
    if(g!==generation)throw fail('identity-changed');
    profile.provider=c.firebase?.sign_in_provider;
    if(profile.provider==='anonymous'){try{profile.guest=guestScope(saved.guest);}catch{clear();await auth.signOut();return null;}
      guestXP=Array.isArray(saved.guestXP)&&saved.guestXP.length<=150?saved.guestXP
        .filter(r=>int(r?.activity,1)&&r.activity<=30&&int(r.round)&&r.round<=4&&Number.isFinite(r.at)&&r.at>0&&r.at<=now())
        .map(({activity,round,at})=>({activity,round,at})):[];
    }
    if(!['google.com','password','anonymous'].includes(profile.provider)){clear();throw fail('provider-invalid');}
    if(profile.provider==='google.com')try{profile.owner=await assertOwner(m);}catch(e){if(e.code!=='owner-required'){clear();throw e;}}
    try {
      if(saved?.uid===profile.uid&&saved.signal===signal&&saved.drafts) {
        drafts=restorable(saved.drafts);
      }
    }catch{} progressCache.retain(profile);workStore.retain(profile.uid);save();emit('signed-in');checkTicketDeadline();return {...profile};
  }
  function logout() {firebaseSession?.browserSession?.clear();clear(profile?.uid||firebaseSession?.auth.currentUser?.uid);broadcast();return serialAuth(async()=>{const {auth,browserSession}=await getSession();browserSession?.clear();purgeUID(auth.currentUser?.uid);await auth.signOut();});}
  async function classHint(m,force=false) {
    const c=await claims(m,force), map=c.ybsClassKeys;
    if(c.firebase?.sign_in_provider!==profile.provider){clear();throw fail('identity-changed');}
    if(!map||typeof map!=='object'||Array.isArray(map)||!/^[\w-]{1,40}$/.test(map[course]||''))throw fail('binding-pending');
    return map[course];
  }
  async function context(activity,round) {
    const m=mark();if(profile.owner)throw fail('demonstration-only');
    if(summaryIssue)throw fail(summaryIssue);
    if(profile.provider==='anonymous') {
      const controller=new AbortController();aborters.add(controller);let timeout;
      try {
        // One deadline covers token retry, fetch and the full JSON body.
        return await Promise.race([
          readGuestContext({profile,course,project,activity,round,active:()=>active(m),request:async body=>{
            let response;
            for(let refresh=0;refresh<2;refresh++){
              const bearer=await token(m,refresh===1);
              response=await fetcher(config.workerOrigin+'/guest/context',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
                headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
              active(m);if(response.status!==401)break;
            }
            return response;
          }}),
          new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(fail('identity-changed')),{once:true})),
          new Promise((_,reject)=>{timeout=setTimeout(()=>{reject(fail('request-timeout'));controller.abort();},requestTimeoutMs);})
        ]);
      } finally {clearTimeout(timeout);aborters.delete(controller);}
    }
    if(typeof readModel?.context!=='function')throw fail('read-model-pending');
    const classKey=await classHint(m);
    const saved=snapshot, hints=saved?.startContext, unit=progressActivities?.find(a=>a.course===course&&a.week===activity)?.unit;
    const cached=hints&&saved.classKey===classKey&&saved.provider===profile.provider?{
      schemaVersion:1,sourceProject:project,course,uid:m.uid,classKey,subject:saved.subject,activity,round,
      bindingVersion:hints.bindingVersion,configVersion:hints.configVersions?.[activity],
      unitEpoch:hints.unitEpochs?.[unit],roundEpoch:hints.roundEpochs?.[`${activity}:${round}`],
      classUnitEpoch:hints.classUnitEpochs?.[unit],controlVersions:saved.controlVersions}:null;
    const value=validContext(cached)?cached:await readModel.context({course,classKey,activity,round});active(m);
    if(!validContext(value)||value.schemaVersion!==1||value.sourceProject!==project||value.course!==course
      ||value.uid!==m.uid||value.classKey!==classKey||value.activity!==activity||value.round!==round)throw fail('context-unconfirmed');
    confirmBinding(m,classKey,value.subject);
    return Object.fromEntries(['schemaVersion','sourceProject','course','uid','classKey','subject','activity','round',
      ...epochKeys,'controlVersions'].map(k=>[k,clone(value[k])]));
  }
  function arm(d) {
    cancel(timer); if(d.failures>=4||d.blocked||d.startRetryUsed||d.issue==='storage-quota'||d.issue?.startsWith('summary-'))return;
    const g=generation;timer=schedule(()=>{if(g===generation)retry({automatic:true}).catch(()=>{});},Math.max(0,d.retryAt-now()));
  }
  async function send(d,m) {
    if(!['115-g9','115-df'].includes(course))throw fail('grading-not-supported');
    if(profile?.owner)throw fail('demonstration-only');
    const pending=d.pending;if(!pending)throw fail('nothing-pending');
    if(d.blocked)throw fail('restart-required');
    if(d.retryAt>now())throw fail('retry-later');
    active(m);if(d.ticketMode&&workExpiresAt(d)<=now()){checkTicketDeadline();throw fail('ticket-expired');}delete d.issue;emit('sending');
    let response;
    try {
      const body=JSON.stringify(pending.body);
      if(new TextEncoder().encode(body).length>(d.ticketMode?70000:8192))throw fail('answer-too-large');
      let data;
      for(let refresh=0;refresh<2;refresh++) {
        // 刷新後失聯時，不能把前一次 401 當成本次 HTTP 狀態。
        response=null;
        const bearer=await token(m,refresh===1);
        const controller=new AbortController();aborters.add(controller);let timeout;
        try{
          // 標頭到達後本文仍可能停住；同一個期限須涵蓋 fetch 與 JSON 讀取。
          ({response,data}=await Promise.race([
            (async()=>{
              try{response=await fetcher(config.workerOrigin+'/'+(isGuestContext(d.context)?'guest/':d.ticketMode?'ticket/':'')+pending.op,{method:'POST',credentials:'omit',cache:'no-store',
                redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body,signal:controller.signal});}catch(cause){throw Object.assign(fail('pending'),{cause});}
              active(m);
              const data=response.status===401?null:await response.json().catch(cause=>{if(response.ok)throw Object.assign(fail('response-invalid'),{cause});return null;});
              return {response,data};
            })(),
            new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(fail('identity-changed')),{once:true})),
            new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(fail('request-timeout'));},requestTimeoutMs);})
          ]));
        }finally{clearTimeout(timeout);aborters.delete(controller);}active(m);
        if(drafts[scopeKey(d.activity,d.round)]!==d)throw fail('identity-changed');
        if(response.status!==401)break;
      }
      if(!response.ok) {
        if(response.status===401)throw fail('login-required');
        if(data?.error==='not_open'){
          delete drafts[scopeKey(d.activity,d.round)];save();emit('not-open');throw fail('not-open');
        }
        if(d.ticketMode&&ticketErrors.has(data?.error)){
          if(data.error==='ticket_expired')expiredTicket=timingOf(d,'expired');
          d.blocked=true;delete drafts[scopeKey(d.activity,d.round)];save();emit('restart-required');
          throw fail(data.error.replaceAll('_','-'));
        }
        if(['summary_unconfirmed','summary_capacity'].includes(data?.error)){
          snapshot=null;lastProgress=null;summaryIssue=d.issue=data.error.replaceAll('_','-');throw fail(d.issue);
        }
        if(response.status===400&&pending.op==='answer'){
          const error=data;active(m);
          if(error?.error==='invalid_answer'){
            d.pending=null;d.failures=0;d.retryAt=0;save();emit('ready');throw fail('invalid-answer');
          }
        }
        if(data?.error==='capacity_deferred'){delete drafts[scopeKey(d.activity,d.round)];save();emit('capacity-deferred');throw fail('capacity-deferred');}
        if(response.status===429||response.status>=500) {
          const error=data;active(m);
          d.issue=error?.error==='storage_quota'||response.status===429&&!['rate_limited','storage_busy'].includes(error?.error)?'storage-quota':response.status===429?'rate-limited':'connection-failed';
          const header=response.headers.get('retry-after'), seconds=Number(header);
          const until=header && !Number.isNaN(seconds)?now()+Math.max(0,seconds)*1000:Date.parse(header||'');
          d.startRateLimited=pending.op==='start'&&response.status===429&&error?.error==='rate_limited';
          const bodyWait=d.startRateLimited&&Number.isFinite(error?.retryAfter)&&error.retryAfter>=0?now()+error.retryAfter*1000:0;
          d.retryAt=Math.max(bodyWait,Number.isFinite(until)?until:0,now()+Math.min(60000,1000*2**Math.min(d.failures||0,6))+Math.floor(random()*500));
          throw fail('pending');
        }
        d.blocked=true;delete drafts[scopeKey(d.activity,d.round)];save();emit('restart-required');throw fail('restart-required');
      }
      const value=data;active(m);
      if(!value)throw fail('response-invalid');
      if(d.ticketMode&&!value.completed&&!value.awaitingTeacher&&!ticketValid(value)
        &&!(pending.op==='start'&&value.ticketVersion===undefined&&value.ticket===undefined))throw fail('response-invalid');
      if(typeof value.completed!=='boolean'||(value.awaitingTeacher===true?value.completed||! /^[\w-]{22}$/.test(value.sid):value.completed ? (isGuestContext(d.context)?!guestCompletion(value):!id(value.resultId))
        : !/^[\w-]{22}$/.test(value.sid)||!int(value.nextSeq,1)||!value.question||![0,1].includes(value.question.slot)))throw fail('response-invalid');
      if(!value.question||d.input?.stamp!==questionStamp(value)||now()-d.input.savedAt>=WORK_TTL)delete d.input;
      d.expiresAt=value.expiresAt;d.stamp=value.question?questionStamp(value):null;
      d.pending=null;delete d.issue;summaryIssue=null;d.failures=0;d.retryAt=0;
      delete d.startRateLimited;delete d.startRetryUsed;
      d.sid=value.sid||d.sid;d.nextSeq=value.nextSeq;d.slot=value.question?.slot;
      if(ticketValid(value)){d.ticketMode=true;d.ticket=value.ticket;}
      // A pre-existing legacy session keeps its original protocol after opt-in.
      else if(pending.op==='start'){delete d.ticketMode;delete d.ticket;}
      if(value.completed||value.awaitingTeacher)delete drafts[scopeKey(d.activity,d.round)];
      const output={activity:d.activity,round:d.round,...clone(value)};
      // 完成回條的有效範圍取自此作答的已驗證 context，不信任回應自帶的欄位。
      if(guestCompletion(value))output.completionContext=clone(Object.fromEntries(
        ['configVersion','unitEpoch','roundEpoch','classUnitEpoch','controlVersions'].map(k=>[k,d.context[k]])));
      // 本次登入親自完成才累積展示 XP；start／resume 回看的舊待審回條不補發。
      // 僅存 sessionStorage，不進入 workStore、正式投影、請求 body 或雲端。
      if(isGuestContext(d.context)&&guestCompletion(value)&&pending.op==='answer'
        &&!guestXP.some(r=>r.activity===d.activity&&r.round===d.round))guestXP.push({activity:d.activity,round:d.round,at:now()});
      view=output;
      save();
      if(value.completed&&!isGuestContext(d.context))applyProgressDelta(value,d);
      emit(guestCompletion(value)?'guest-pending':value.awaitingTeacher?'teacher-pending':value.completed?'confirmation-pending':'ready');
      checkTicketDeadline(false);
      // 只有 Worker 已提交且 epoch 相符的 v2 投影可直接更新進度。
      return clone(output);
    } catch(error) {
      active(m);
      if(error?.code==='login-required'){clear();throw error;}
      if(drafts[scopeKey(d.activity,d.round)]!==d)throw expiredTicket?.activity===d.activity&&expiredTicket.round===d.round?fail('ticket-expired'):error;
      if(['invalid-answer','not-open','capacity-deferred'].includes(error.code))throw error;
      if(error.code?.startsWith('summary-')){save();emit('confirmation-pending');throw error;}
      if(d.blocked||error.code==='answer-too-large'){emit('restart-required');throw error;}
      d.issue||='connection-failed';
      d.failures=(d.failures||0)+1;
      if(!d.retryAt||d.retryAt<=now())d.retryAt=now()+Math.min(60000,1000*2**Math.min(d.failures-1,6))+Math.floor(random()*500);
      save();emit('pending');arm(d);
      const pendingError=error?.code==='pending'?error:Object.assign(fail('pending'),{cause:error});
      if(response)pendingError.status=response.status;
      throw pendingError;
    }
  }
  async function exclusive(key,fn) {
    if(running.has(key))throw fail('request-in-flight');
    const m=mark(),previous=gradingWork;
    let release;gradingWork=new Promise(resolve=>{release=resolve;});
    const lock=Symbol();running.set(key,lock);
    // A switch must reach the Worker after the previous answer, never race its commit.
    try{await previous;active(m);return await fn();}finally{release();if(running.get(key)===lock)running.delete(key);}
  }
  async function start(activity,round,{restart=false}={}) {
    // 在進入序列佇列前標記，涵蓋排隊、context、token 及回應等待。
    const key=scopeKey(activity,round),version=startVersion;
    return exclusive(key,async()=>{
      const m={...mark(),startVersion:version};active(m);if(profile.owner)throw fail('demonstration-only');
      if(!['115-g9','115-df'].includes(course))throw fail('grading-not-supported');
      if(!int(activity,1)||activity>30||!int(round)||round>4)throw fail('invalid-scope');
      expiredTicket=null;
      if(drafts[key]&&!restart){
        const d=drafts[key];
        // Older versions could restore several drafts; selecting one abandons the others too.
        drafts={[key]:d};save();
        return d.pending?send(d,m):resume(activity,round,true);
      }
      for(let refresh=0;refresh<2;refresh++){
      const summaryContext=!!snapshot?.startContext;
      const c=await context(activity,round);active(m);
      // One Worker session per course: choosing another scope abandons old work, as on the old site.
      // Cancel retries before dropping it so an offline start cannot later replace the chosen round.
      cancel(timer);timer=null;
      drafts={};
      const body={course,classKey:c.classKey,...guestFields(c),activity,round,requestId:requestId()};
      for(const name of epochKeys)if(name!=='bindingVersion'||!isGuestContext(c))body[name]=c[name];
      const d={project,course,uid:m.uid,activity,round,context:c,startRequestId:body.requestId,pending:{op:'start',body},failures:0,retryAt:0,
        ...(config.answerTickets===true&&course==='115-g9'&&!isGuestContext(c)?{ticketMode:true}:{})};
      drafts[key]=d;save();
      try{return await send(d,m);}catch(error){
        if(error.code!=='restart-required'||!summaryContext||refresh||!progressActivities)throw error;
        snapshot=null;lastProgress=null;view=null;progressCache.purge();emit('context-changed');
        await progress({activities:progressActivities});active(m);
      }
      }
    });
  }
  async function answer(activity,round,answer) {
    const key=scopeKey(activity,round);
    return exclusive(key,async()=>{
      const m=mark(),d=drafts[key];
      if(profile.owner)throw fail('demonstration-only');
      if(!d||!d.sid||d.blocked)throw fail('restart-required');
      if(d.pending)throw fail('answer-pending');
      const body={course,classKey:d.context.classKey,...guestFields(d.context),activity,round,requestId:requestId(),sid:d.sid,seq:d.nextSeq,slot:d.slot,answer:clone(answer)};
      if(new TextEncoder().encode(JSON.stringify(body)).length>8192)throw fail('answer-too-large');
      if(d.ticketMode)body.ticket=d.ticket;
      delete d.input;d.pending={op:'answer',body};save();return send(d,m);
    });
  }
  async function resume(activity,round,locked=false) {
    const work=async()=>{
      const m=mark(),d=drafts[scopeKey(activity,round)];
      if(!d||d.blocked)throw fail('restart-required');
      if(!d.pending)d.pending={op:'resume',body:{course,classKey:d.context.classKey,...guestFields(d.context),activity,round,sid:d.sid,requestId:requestId(),
        ...(d.ticketMode?{ticket:d.ticket}:{})}};
      save();return send(d,m);
    };
    return locked?work():exclusive(scopeKey(activity,round),work);
  }
  async function retry({automatic=false}={}) {
    const m=mark(), output=[];
    for(const [key,d] of Object.entries(drafts))if(d.pending&&!d.blocked&&d.retryAt<=now()&&(!automatic||!d.startRetryUsed&&!d.issue?.startsWith('summary-'))) {
      if(automatic&&d.startRateLimited)d.startRetryUsed=true;
      const attempt=d.pending.op==='start'?{...m,startVersion}:m;
      const value=await exclusive(key,()=>drafts[key]===d?send(d,attempt):null);active(attempt);
      if(value)output.push(value);
    }
    return output;
  }
  // 回看已完成關卡不建立 session，也不讓離開的 start 在背景自動重送。
  function cancelStart(){
    startVersion++;
    if(!Object.values(drafts).some(d=>d.pending?.op==='start'))return;
    cancel(timer);timer=null;
    for(const [key,d] of Object.entries(drafts))if(d.pending?.op==='start')delete drafts[key];
    view=null;save();emit('ready');
  }
  function applyProgressDelta(value,d){
    const previous=snapshot||lastProgress;snapshot=null;lastProgress=null;
    readVersion++;progressWork.clear();
    if(!previous||previous.progressVersion!==2||previous.activity!==undefined||!progressActivities
      ||!value.progressDelta?.records?.some(r=>r.resultId===value.resultId))return;
    const next=progressCache.delta({...profile,classKey:previous.classKey},value.progressDelta,
      {...previous,activity:d.activity,round:d.round});
    if(!next)return;
    delete next.result.activity;delete next.result.round;
    if(effectiveRecords(next.result,{project,course,subject:previous.subject,activities:progressActivities}).state!=='confirmed')return;
    // Reads already in flight used an older baseline; their replies cannot overwrite this receipt.
    progressCache.commit(next.state,next.cached,next.result);lastProgress=snapshot=next.result;
  }
  function guestGrowth({activities,xp}){
    mark();if(profile.provider!=='anonymous'||!profile.guest)throw fail('guest-seat-required');
    // 獨立於正式 growth／effectiveRecords，無 subject、正式結果或解鎖依據。
    return {...xp.calculate(activities,guestXP.map(r=>({...r,course}))),state:'local',local:true,records:[]};
  }
  // 分頁前後重查控制版；完整空頁也是確認後的空集合，查詢失敗絕不回傳 []。
  async function progress({activities,classKey,activity,teacher=false,signal}={}) {
    if(profile?.provider==='anonymous')throw fail('guest-pending');
    // A caller-owned query must not reuse an earlier, cancelled read of the same class.
    if(signal)return readProgress({activities,classKey,activity,teacher,signal});
    const key=JSON.stringify([profile?.uid,teacher,classKey,activity]);
    if(progressWork.has(key))return progressWork.get(key);
    const work=readProgress({activities,classKey,activity,teacher});progressWork.set(key,work);
    try{return await work;}finally{if(progressWork.get(key)===work)progressWork.delete(key);}
  }
  async function readProgress({activities,classKey,activity,teacher,signal}) {
    const m=mark(), request=++readVersion;snapshot=null;emit('confirmation-pending');
    const controller=new AbortController();aborters.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    const current=()=>{active(m);if(controller.signal.aborted||request!==readVersion)throw fail('read-superseded');};
    try {
      current();
      if(!readModel?.page||!readModel?.controls)throw fail('read-model-pending');
      if(teacher)await assertOwner(m);else classKey=await classHint(m);
      current();
      if(!/^[\w-]{1,40}$/.test(classKey||''))throw fail('invalid-class');
      const input={course,classKey,...(activity===undefined?{}:{activity}),limit:100,signal:controller.signal};
      if(!teacher&&course==='115-g9'){
        confirmBinding(m,classKey,undefined,controller);
        return await incrementalProgress({input,m,request,activities,activity,controller});
      }
      const before=await readModel.controls(input);current();
      if(!versions(before))throw fail('control-unconfirmed');
      const records=[],people=[],guestPages=new Map();let cursor=null,subject,provider,seen=new Set();
      for(let pageNumber=0;pageNumber<100;pageNumber++) {
        const page=await readModel.page({...input,cursor,controlVersions:before});current();
        if(page.schemaVersion!==1||page.sourceProject!==project||page.course!==course||page.classKey!==classKey
          ||page.state!=='confirmed'||!sameVersions(page.controlVersions,before)||!Array.isArray(page.records)
          ||page.records.length>121||typeof page.complete!=='boolean')throw fail('page-unconfirmed');
        if(!teacher){if(!id(page.subject)||subject&&subject!==page.subject)throw fail('subject-mismatch');subject=page.subject;provider=profile.provider;}
        const person=cursor?.person??0,previous=guestPages.get(person);
        if(page.guestVersion!==undefined||page.guestRecords!==undefined){
          const target=page.people?.[0]?.subject??previous?.subject??subject;
          if(!id(target)||!/^[\w-]{43}$/.test(page.guestVersion)||!Array.isArray(page.guestRecords)||page.guestRecords.length>121
            ||page.guestRecords.some(r=>r.source!=='worker-guest-approved'||r.subject!==target)
            ||new Set(page.guestRecords.map(r=>`${r.activity}:${r.round}`)).size!==page.guestRecords.length
            ||previous&&(previous.subject!==target||previous.version!==page.guestVersion||JSON.stringify(previous.records)!==JSON.stringify(page.guestRecords)))throw fail('page-unconfirmed');
          guestPages.set(person,{subject:target,version:page.guestVersion,records:clone(page.guestRecords)});
        }else if(previous)throw fail('page-unconfirmed');
        records.push(...clone(page.records));if(page.people)people.push(...clone(page.people));
        if(page.complete){if(page.nextCursor!=null)throw fail('cursor-invalid');cursor=null;break;}
        const next=JSON.stringify(page.nextCursor);
        if(!page.nextCursor||seen.has(next))throw fail('cursor-invalid');seen.add(next);cursor=page.nextCursor;
      }
      if(cursor)throw fail('page-capacity');
      const after=await readModel.controls(input);current();
      if(!sameVersions(before,after))throw fail('control-changed');
      for(const page of guestPages.values())records.push(...page.records);
      const result={schemaVersion:1,sourceProject:project,course,classKey,subject,provider,state:'confirmed',complete:true,
        controlVersions:after,records,people};
      const validity=effectiveRecords(result,{project,course,subject,activities});
      if(validity.state!=='confirmed')throw fail(validity.reason);
      snapshot=result;emit('confirmed');return clone(result);
    }catch(error){active(m);if(request===readVersion&&!controller.signal.aborted){snapshot=null;if(error.code?.startsWith('summary-')){lastProgress=null;summaryIssue=error.code;}emit('confirmation-pending');}throw error;}
    finally{aborters.delete(controller);signal?.removeEventListener('abort',abort);}
  }
  async function incrementalProgress({input,m,request,activities,activity,controller}){
    for(let attempt=0;attempt<3;attempt++)try{
      let before=legacyControlsFirst?await readModel.controls(input):null;active(m);
      if(before!==null&&!versions(before))throw fail('control-unconfirmed');
      const state=progressCache.begin({...profile,classKey:input.classKey},activity);
      const records=[];let cursor=null,subject,protocol,startContext,guestVersion,guests,seen=new Set();
      for(let pageNumber=0;pageNumber<100;pageNumber++){
        const load=()=>readModel.page({...input,cursor,controlVersions:before,...(!legacyProgressBody?{progressVersion:2,
          since:state.since,legacyVersion:state.legacy?.version??null}:{})});
        let page;
        try{page=await load();}catch(error){
          // Only explicit old-protocol rejection can select the compatibility path.
          if(cursor!==null||before!==null||!['control-changed','progress-unsupported'].includes(error.code))throw error;
          legacyControlsFirst=true;legacyProgressBody=error.code==='progress-unsupported';
          before=await readModel.controls(input);active(m);if(!versions(before))throw fail('control-unconfirmed');
          page=await load();
        }active(m);
        if(request!==readVersion)throw fail('read-superseded');
        if(before===null){if(!versions(page.controlVersions))throw fail('control-unconfirmed');before=clone(page.controlVersions);}
        else if(!sameVersions(page.controlVersions,before))throw fail('control-changed');
        if(page.schemaVersion!==1||page.sourceProject!==project||page.course!==course||page.classKey!==input.classKey
          ||page.state!=='confirmed'||!sameVersions(page.controlVersions,before)||!Array.isArray(page.records)
          ||page.records.length>121||typeof page.complete!=='boolean')throw fail('page-unconfirmed');
        if(!id(page.subject)||subject&&subject!==page.subject)throw fail('subject-mismatch');
        subject=page.subject;
        confirmBinding(m,input.classKey,subject,controller);
        const v2=page.progressVersion===2;
        if(protocol!==undefined&&protocol!==v2)throw fail('control-changed');protocol=v2;
        if(page.startContext){
          if(startContext&&JSON.stringify(startContext)!==JSON.stringify(page.startContext))throw fail('control-changed');
          startContext=clone(page.startContext);
        }
        if(v2){if(page.provider!==profile.provider)throw fail('subject-mismatch');progressCache.merge(state,page);}
        else{
          records.push(...clone(page.records));
          if(page.guestRecords!==undefined||page.guestVersion!==undefined){
            if(!/^[\w-]{43}$/.test(page.guestVersion)||!Array.isArray(page.guestRecords)||page.guestRecords.length>121
              ||page.guestRecords.some(r=>r.source!=='worker-guest-approved')
              ||guestVersion&&(guestVersion!==page.guestVersion||JSON.stringify(guests)!==JSON.stringify(page.guestRecords)))throw fail('page-unconfirmed');
            guestVersion=page.guestVersion;guests=clone(page.guestRecords);
          }else if(guestVersion)throw fail('page-unconfirmed');
        }
        if(page.complete){if(page.nextCursor!=null)throw fail('cursor-invalid');cursor=null;break;}
        const next=JSON.stringify(page.nextCursor);
        if(!page.nextCursor||seen.has(next))throw fail('cursor-invalid');seen.add(next);cursor=page.nextCursor;
      }
      if(cursor)throw fail('page-capacity');
      // v2 checks controls on every page. v1 keeps its original before/after check.
      const after=protocol?before:await readModel.controls(input);active(m);
      if(request!==readVersion)throw fail('read-superseded');
      if(!sameVersions(before,after))throw fail('control-changed');
      const envelope={schemaVersion:1,sourceProject:project,course,classKey:input.classKey,subject,provider:profile.provider,
        state:'confirmed',complete:true,controlVersions:after,people:[],...(startContext?{startContext}:{}),...(activity===undefined?{}:{activity})};
      const next=protocol?progressCache.finish(state,envelope):{result:{...envelope,...(guests?{guestRecords:guests,guestVersion}:{}),records:[...records,...(guests||[])]}};
      const validity=effectiveRecords(next.result,{project,course,subject,activities});
      if(validity.state!=='confirmed')throw fail(validity.reason);
      if(protocol)progressCache.commit(state,next.cached,envelope);else progressCache.purge();
      summaryIssue=null;progressActivities=activities;lastProgress=snapshot=next.result;emit('confirmed');return clone(snapshot);
    }catch(error){
      active(m);if(error.code!=='control-changed'||attempt===2||request!==readVersion)throw error;
    }
  }
  async function history({classKey,subject,kind='formal',after=null}={}){
    const m=mark();
    if(profile.provider==='anonymous')return {historyOnly:true,next:null,local:true,records:kind==='formal'&&!after
      ?guestXP.map(r=>({activity:r.activity,round:r.round,completedAt:new Date(r.at).toISOString(),validity:{state:'pending'}})):[]};
    if(!readModel?.history||!['formal','legacy'].includes(kind))throw fail('history-unconfirmed');
    if(profile.owner)await assertOwner(m);else{
      classKey=await classHint(m);subject=snapshot?.subject;
      if(snapshot?.classKey!==classKey)throw fail('history-unconfirmed');
    }
    if(!/^[\w-]{1,40}$/.test(classKey||'')||!id(subject))throw fail('history-unconfirmed');
    historyController?.abort();const controller=new AbortController();historyController=controller;aborters.add(controller);
    try{
      const page=await readModel.history({course,classKey,subject,kind,after,signal:controller.signal});active(m);
      if(controller.signal.aborted)throw fail('identity-changed');
      if(page?.historyOnly!==true||page.sourceProject!==project||page.course!==course||page.classKey!==classKey
        ||!versions(page.controlVersions)||!Array.isArray(page.records)||page.records.length>50
        ||page.records.some(r=>r.subject!==subject)||page.next!==null&&(!id(page.next)||page.next===after))throw fail('history-unconfirmed');
      return clone(page);
    }finally{aborters.delete(controller);if(historyController===controller)historyController=null;}
  }
  function saveInput(activity,round,value){
    mark();const d=drafts[scopeKey(activity,round)];
    if(!d||d.pending||d.blocked||!d.stamp||profile.owner||!view?.question||view.activity!==activity||view.round!==round||questionStamp(view)!==d.stamp||!(Date.parse(d.expiresAt)>now()))return false;
    const text=JSON.stringify(value);if(text===undefined||text.length>16384)return false;
    d.input={stamp:d.stamp,savedAt:now(),value:JSON.parse(text)};return save();
  }
  function loadInput(activity,round){
    mark();const d=drafts[scopeKey(activity,round)];
    return d&&!d.pending&&d.input?.stamp===d.stamp&&view?.question&&view.activity===activity&&view.round===round&&questionStamp(view)===d.stamp&&now()-d.input.savedAt<WORK_TTL&&Date.parse(d.expiresAt)>now()?clone(d.input.value):undefined;
  }
  function savedRound(activity){return Object.values(drafts).find(d=>d.activity===activity)?.round;}
  const reports=createDFReports({course,getSession,mark,active,claims,context,fail});
  async function submitManual(round){
    if(course!=='115-df'||!int(round)||round>2)throw fail('invalid-scope');
    const v=await start(1,round);
    return v.completed||v.awaitingTeacher?v:answer(1,round,{session:round+1});
  }
  async function dfContent(){
    const m=mark();if(course!=='115-df'||!readModel?.dfContent)throw fail('read-model-pending');
    if(profile.owner){
      await assertOwner(m);if(!readModel.dfPreview)throw fail('read-model-pending');
      const value=await readModel.dfPreview();active(m);
      if(value?.schemaVersion!==1||value.sourceProject!==project||value.uid!==m.uid||value.course!==course||!int(value.gateVersion,1)
       ||!value.scripts||!['pub','enc-b2','enc-rv'].every(k=>typeof value.scripts[k]==='string'))throw fail('context-unconfirmed');
      return clone(value.scripts);
    }
    const c=await context(1,0),value=await readModel.dfContent(c);active(m);
    if(!value||value.schemaVersion!==1||value.sourceProject!==project||value.uid!==m.uid||value.course!==course
      ||!sameVersions(value.controlVersions,c.controlVersions)||!value.scripts
      ||!['pub','enc-b2','enc-rv'].every(k=>typeof value.scripts[k]==='string'))throw fail('context-unconfirmed');
    return clone(value.scripts);
  }
  return Object.freeze({project,course,studentGoogleLogin:config.studentGoogleLogin===true,session:getSession,whoami:reports.whoami,submitReport:reports.submitReport,submitManual,dfContent,login,restore,logout,context,start,answer,resume,retry,cancelStart,progress,guestGrowth,history,cancelHistory:()=>historyController?.abort(),teacherQuestion,saveInput,loadInput,savedRound,
    owner:()=>assertOwner(mark()),refreshClaims:async()=>{const m=mark();await claims(m,true);return classHint(m);},
    subscribe(f){listeners.add(f);emit(status);return()=>listeners.delete(f);},
    state:()=>({profile:profile&&{...profile},status,snapshot:clone(snapshot),readingRetry,ticketTiming:ticketTiming(),uploadIssue:uploadIssue(),startRetry:startRetry(),pending:Object.values(drafts).some(d=>d.pending&&!d.blocked)})});
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
    const browserSession=createAccountSession({document,location,project});
    if(browserSession.isAccount(auth.currentUser)&&browserSession.has())await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    else if(!browserSession.isAccount(auth.currentUser))await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    return {app,auth,db:app.firestore(),persistence:firebase.auth.Auth.Persistence.SESSION,accountPersistence:firebase.auth.Auth.Persistence.LOCAL,browserSession,
      googleProvider:()=>{const p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});return p;}};
  })().catch(error=>{opening=null;throw error;});
  let readModel;
  if(config.readModelModule) {
    const url=new URL(config.readModelModule,location.href);
    if(url.origin!==location.origin)throw fail('read-model-origin');
    readModel=await (await import(url.href)).createReadModel({session,project,course,workerOrigin:config.workerOrigin});
  }
  const client=createClient({config,session,readModel,course});mountTicketNotice(client,document);return client;
}
