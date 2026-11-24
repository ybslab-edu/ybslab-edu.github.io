// Only authenticated Worker projections; no direct list or private-control reads.
import {fail} from './fullrev-progress.mjs';
export function createReadModel({session,project,course,workerOrigin,fetcher=globalThis.fetch,
 now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),requestTimeoutMs=20000}){
 const origin=new URL(workerOrigin);
 if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev')||origin.origin!==workerOrigin)throw fail('configuration-pending');
 const listeners=new Set(),waiting=new Map(),controllers=new Set();let generation=0,quotaUntil=0;
 const notify=()=>{const value=[...waiting.values()].sort((a,b)=>a.retryAt-b.retryAt)[0]||null;for(const f of listeners)f(value);};
 async function call(operation,body,signal){
  const g=generation;
  if(signal?.aborted)throw fail('identity-changed');
  if(now()<quotaUntil)throw fail('storage-quota');
  const {app,auth}=await session(),user=auth.currentUser;
  if(app.options.projectId!==project||!user)throw fail('login-required');
  const key=Symbol(),payload=JSON.stringify(body);let waited=0;
  const controller=new AbortController();controllers.add(controller);
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});
  const stop=()=>rejectAbort(fail('identity-changed'));controller.signal.addEventListener('abort',stop,{once:true});
  const active=()=>{if(g!==generation||signal?.aborted||controller.signal.aborted||auth.currentUser!==user)throw fail('identity-changed');};
  try{for(let attempt=0;attempt<4;attempt++){
   active();const token=await Promise.race([user.getIdToken(),aborted]);active();let response,data,timeout;
   const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{reject(fail('read-model-pending'));controller.abort();},requestTimeoutMs);});
   try{response=await Promise.race([
    fetcher(new URL(operation,origin),{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
     headers:{'content-type':'application/json',authorization:'Bearer '+token},body:payload,signal:controller.signal}),
    deadline,aborted
   ]);data=await Promise.race([response.json().catch(()=>null),deadline,aborted]);}
   catch(error){if(error.code==='read-model-pending')throw error;active();throw fail('read-model-pending');}
   finally{clearTimeout(timeout);}
   active();
   // 額度不足與短暫流量限制不同；立即說明原因，交由老師決定替代入口。
   if(!response.ok&&(data?.error==='storage_quota'||response.status===429&&!['rate_limited','storage_busy'].includes(data?.error))){quotaUntil=now()+300000;throw fail('storage-quota');}
   if(!response.ok&&operation==='progress'&&body.controlVersions===null&&response.status===400&&data?.error==='invalid_body')throw fail('progress-unsupported');
   if(!response.ok&&operation==='controls'&&response.status===404&&data?.error==='class_not_found')throw fail('class-not-found');
   if(!response.ok&&['summary_unconfirmed','summary_capacity'].includes(data?.error))throw fail(data.error.replaceAll('_','-'));
   if([429,503].includes(response.status)&&attempt<3){
    const header=response.headers.get('retry-after'),seconds=header?.trim()?Number(header):NaN;
    const delay=Number.isFinite(seconds)?Math.max(0,seconds*1000):Date.parse(header||'')-now();
    const ms=Number.isFinite(delay)?Math.max(0,delay):1000*2**attempt;
    // 最多重試三次、總等待三分鐘；較長窗口交回手動讀取，不提早打擾服務。
    if(waited+ms<=180000){
     waited+=ms;waiting.set(key,{operation,retryAt:now()+ms});notify();
     await Promise.race([wait(ms),aborted]);active();waiting.delete(key);notify();continue;
    }
   }
   if(!response.ok)throw fail(data?.error==='not_open'?'not-open':data?.error==='control_changed'?'control-changed':response.status===429?'retry-later':'read-model-pending');
   if(!data)throw fail('read-model-pending');return data;
  }}finally{controllers.delete(controller);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',stop);if(waiting.delete(key))notify();}
 }
 const scope=b=>{if(b.course!==course)throw fail('invalid-course');return {course,classKey:b.classKey};};
 return Object.freeze({
  subscribeRetry(f){listeners.add(f);return()=>listeners.delete(f);},
  cancel(){generation++;for(const c of controllers)c.abort();controllers.clear();waiting.clear();notify();},
  roster:()=>call('df-roster',{course}),
  dfPreview:()=>call('df-preview',{course}),
  context:b=>call('context',{...scope(b),activity:b.activity,round:b.round},b.signal),
  controls:b=>call('controls',scope(b),b.signal),
  page:b=>call('progress',{...scope(b),controlVersions:b.controlVersions,cursor:b.cursor??null,...(b.activity===undefined?{}:{activity:b.activity}),
   ...(b.progressVersion===2?{progressVersion:2,since:b.since??null,legacyVersion:b.legacyVersion??null}:{})},b.signal),
  history:b=>call('history',{...scope(b),subject:b.subject,kind:b.kind,after:b.after??null},b.signal),
  dfContent:b=>call('df-content',scope(b))
 });
}
