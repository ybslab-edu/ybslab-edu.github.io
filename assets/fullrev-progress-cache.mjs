import {fail,sameVersions} from './fullrev-progress.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
export const roundKey=r=>`a${r.activity}_r${r.round}`;
const stamp=v=>typeof v==='string'&&/^[\w-]{43}$/.test(v);
const index=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=121
 &&Object.entries(v).every(([k,r])=>/^a(?:[1-9]|[12][0-9]|30)_r[0-4]$/.test(k)&&typeof r==='string'&&/^c_[\w-]{43}$/.test(r));
const equal=(a,b)=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(b).sort());
export function createProgressCache({storage,project,course}){
 const namespace=`progress-v2/${project}/`,prefix=namespace+course+'/',memory=new Map();
 let current=null;
 const keys=(all=false)=>{try{return Array.from({length:storage?.length||0},(_,i)=>storage.key(i)).filter(k=>k?.startsWith(all?namespace:prefix));}catch{return [];}};
 const get=k=>{if(memory.has(k))return copy(memory.get(k));try{return JSON.parse(storage?.getItem(k)||'null');}catch{return null;}};
 const put=(k,v)=>{memory.set(k,copy(v));try{storage?.setItem(k,JSON.stringify(v));}catch{}};
 const remove=k=>{memory.delete(k);try{storage?.removeItem(k);}catch{}};
 function purge(){for(const k of new Set([...keys(true),...memory.keys()]))remove(k);current=null;}
 const base=({classKey,uid,provider,subject})=>prefix+[classKey,uid,provider,subject].map(encodeURIComponent).join('/');
 const path=(b,activity)=>b+(activity===undefined?'/all':`/activity/${activity}`);
 function retain(who){
  for(const k of new Set([...keys(true),...memory.keys()])){
   let savedCourse,cls,uid,provider;try{[savedCourse,cls,uid,provider]=k.slice(namespace.length).split('/').map(decodeURIComponent);}catch{remove(k);continue;}
   if(uid!==who.uid||provider!==who.provider||savedCourse===course&&who.classKey&&cls!==who.classKey)remove(k);
  }
 }
 function find(who,activity){
  retain(who);
  const start=prefix+[who.classKey,who.uid,who.provider].map(encodeURIComponent).join('/')+'/';
  const bases=[...new Set([...keys(),...memory.keys()].filter(k=>k.startsWith(start)).map(k=>k.split('/').slice(0,7).join('/')))];
  if(bases.length!==1)return {cached:null,legacy:null};
  const b=bases[0],cached=get(path(b,activity)),legacy=get(b+'/legacy');
  // Never send a version unless its complete original projection is still present.
  if(!cached||!stamp(cached.epoch)||!index(cached.resultVersions)||!Array.isArray(cached.newRecords)||cached.newRecords.length>121
   ||!Array.isArray(cached.states)||!legacy||!stamp(legacy.version)||!Array.isArray(legacy.records)
   ||legacy.records.length>242||!equal(cached.resultVersions,Object.fromEntries(cached.newRecords.map(r=>[roundKey(r),r.resultId]))))return {cached:null,legacy:legacy&&stamp(legacy.version)&&Array.isArray(legacy.records)?legacy:null};
  return {cached,legacy};
 }
 function begin(who,activity){
  const found=find(who,activity);
  return {...found,who,activity,since:found.cached?{epoch:found.cached.epoch,results:copy(found.cached.resultVersions)}:null};
 }
 function merge(state,page){
  if(!stamp(page.epoch)||!stamp(page.resultVersion)||!index(page.resultVersions)||typeof page.replace!=='boolean'
   ||!Array.isArray(page.removed)||!page.legacy||!stamp(page.legacy.version)||!Array.isArray(page.legacy.states)
   ||page.records.some(r=>r.source!=='worker-validated'||page.resultVersions[roundKey(r)]!==r.resultId)
   ||page.removed.some(k=>!/^a(?:[1-9]|[12][0-9]|30)_r[0-4]$/.test(k)))throw fail('page-unconfirmed');
  if(state.page&&(!sameVersions(state.page.controlVersions,page.controlVersions)||state.page.epoch!==page.epoch
   ||state.page.resultVersion!==page.resultVersion||!equal(state.page.resultVersions,page.resultVersions)
   ||state.page.replace!==page.replace||state.page.legacy.version!==page.legacy.version
   ||JSON.stringify(state.page.legacy.states)!==JSON.stringify(page.legacy.states)))throw fail('control-changed');
  if(!state.page){
   if(!page.replace&&state.since?.epoch!==page.epoch)throw fail('page-unconfirmed');
   state.newRecords=new Map((page.replace?[]:state.cached?.newRecords||[]).map(r=>[roundKey(r),r]));
   state.page=copy(page);
  }
  for(const k of page.removed)state.newRecords.delete(k);
  for(const r of page.records)state.newRecords.set(roundKey(r),copy(r));
  if(page.legacy.records!==null){
   if(!Array.isArray(page.legacy.records)||page.legacy.records.length>242||page.legacy.records.some(r=>r.source!=='legacy-unverified'))throw fail('page-unconfirmed');
   state.legacy={version:page.legacy.version,records:copy(page.legacy.records)};
  }
  if(state.legacy?.version!==page.legacy.version||!Array.isArray(state.legacy.records))throw fail('legacy-unconfirmed');
 }
 function finish(state,envelope){
  const page=state.page;
  const actual=Object.fromEntries([...state.newRecords].map(([k,r])=>[k,r.resultId]));
  if(!equal(actual,page.resultVersions))throw fail('page-unconfirmed');
  const cached={epoch:page.epoch,resultVersions:actual,newRecords:[...state.newRecords.values()],states:page.legacy.states};
  return {cached,result:projectRecords(cached,state.legacy,envelope,state.activity)};
 }
 function projectRecords(cached,legacy,envelope,activity){
  const records=cached.newRecords.map(r=>({...r,validity:{...r.validity,controlVersions:envelope.controlVersions}}));
  const states=new Map(cached.states.map(s=>[roundKey(s),s]));
  for(const r of legacy.records){
   if(activity!==undefined&&r.activity!==activity)continue;
   const validity=states.get(roundKey(r));
   records.push({...r,validity:{state:validity?.state||'unknown',...(validity?.reason?{reason:validity.reason}:{}),controlVersions:envelope.controlVersions}});
  }
  return {...envelope,progressVersion:2,epoch:cached.epoch,resultVersions:copy(cached.resultVersions),records};
 }
 function commit(state,cached,envelope){
  const who={...state.who,subject:envelope.subject},b=base(who);
  if(current&&current!==b)purge();
  for(const k of new Set([...keys(),...memory.keys()]))if(!k.startsWith(b+'/'))remove(k);
  current=b;put(b+'/legacy',state.legacy);put(path(b,state.activity),cached);
 }
 function delta(who,delta,envelope){
  const state=begin(who),cached=state.cached;
  if(!cached||!delta||delta.progressVersion!==2||!stamp(delta.epoch)||!index(delta.resultVersions)||!Array.isArray(delta.records))return null;
  if(cached.epoch!==delta.epoch){
   // A changed all-scope epoch invalidates every scope for this identity.
   for(const k of new Set([...keys(),...memory.keys()]))if(!k.endsWith('/legacy'))remove(k);
   return null;
  }
  const records=new Map(cached.newRecords.map(r=>[roundKey(r),r]));
  if(delta.records.length!==Object.keys(delta.resultVersions).length||delta.records.some(r=>r.source!=='worker-validated'
   ||r.subject!==envelope.subject||r.activity!==envelope.activity||r.round!==envelope.round
   ||delta.resultVersions[roundKey(r)]!==r.resultId||!sameVersions(r.validity?.controlVersions,envelope.controlVersions)))return null;
  for(const r of delta.records)records.set(roundKey(r),copy(r));
  const next={...cached,newRecords:[...records.values()],resultVersions:{...cached.resultVersions,...delta.resultVersions}};
  return {state,cached:next,result:projectRecords(next,state.legacy,envelope)};
 }
 return {purge,retain,begin,merge,finish,commit,delta};
}
