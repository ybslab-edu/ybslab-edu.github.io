// 本機續作：session／版本、加密作答票及學生輸入；不保存明文私有題組或題解。
export const WORK_TTL=20*60*1000;
export const workExpiresAt=d=>Date.parse(d?.expiresAt);
export function questionStamp(value){
 const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 const text=JSON.stringify(stable(value.question));let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
 return [value.sid,value.question.slot,(a>>>0).toString(16)+(b>>>0).toString(16)].join(':');
}
export function createWorkStore({shared,project,course,now}){
 const prefix=`ybs:fullrev:work:${project}:`,coursePrefix=prefix+course+':';
 const keys=()=>{try{return Array.from({length:shared?.length||0},(_,i)=>shared.key(i)).filter(k=>k?.startsWith(prefix));}catch{return [];}};
 const remove=k=>{try{shared?.removeItem(k);}catch{}};
 function entries(){return keys().flatMap(key=>{try{const v=JSON.parse(shared.getItem(key));if(v?.v!==1||!Number.isFinite(v.savedAt)||v.savedAt>now()||now()-v.savedAt>=WORK_TTL||workExpiresAt(v.d)<=now()){remove(key);return [];}return [[key,v]];}catch{remove(key);return [];}});}
 return {
  read(uid){return Object.fromEntries(entries().filter(([key,v])=>key.startsWith(coursePrefix)&&v.d?.uid===uid).map(([,v])=>[v.d.activity+':'+v.d.round,v.d]));},
  write(uid,drafts){if(!uid||!shared?.setItem)return false;
   const previous=entries().filter(([key,v])=>key.startsWith(coursePrefix)&&v.d?.uid===uid),kept=new Set();
   try{for(const d of Object.values(drafts)){const key=`${coursePrefix}${d.activity}:${d.round}:${uid}`;shared.setItem(key,JSON.stringify({v:1,savedAt:now(),d}));kept.add(key);}
    for(const [key] of previous)if(!kept.has(key))remove(key);return true;}catch{return false;}},
  purge(uid){for(const [key,v] of entries())if(v.d?.uid===uid)remove(key);},
  retain(uid){for(const [key,v] of entries())if(v.d?.uid!==uid)remove(key);}
 };
}
