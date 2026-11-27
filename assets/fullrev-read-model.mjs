// Only authenticated Worker projections; no direct list or private-control reads.
import {fail} from './fullrev-progress.mjs';
export function createReadModel({session,project,course,workerOrigin,fetcher=globalThis.fetch}){
 const origin=new URL(workerOrigin);
 if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev')||origin.origin!==workerOrigin)throw fail('configuration-pending');
 async function call(operation,body){
  const {app,auth}=await session(),user=auth.currentUser;
  if(app.options.projectId!==project||!user)throw fail('login-required');
  const token=await user.getIdToken();
  if(auth.currentUser!==user)throw fail('identity-changed');
  let response;
  try{response=await fetcher(new URL(operation+'',origin),{method:'POST',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});}
  catch{throw fail('read-model-pending');}
  if(auth.currentUser!==user)throw fail('identity-changed');
  let data,unreadable=false;
  try{data=await response.json();}catch{unreadable=true;}
  if(auth.currentUser!==user)throw fail('identity-changed');
  if(!response.ok)throw fail(data?.error==='control_changed'?'control-changed':response.status===429?'retry-later':'read-model-pending');
  if(unreadable)throw fail('read-model-pending');
  return data;
 }
 const scope=b=>{if(b.course!==course)throw fail('invalid-course');return {course,classKey:b.classKey};};
 return Object.freeze({
  roster:()=>call('df-roster',{course}),
  dfPreview:()=>call('df-preview',{course}),
  context:b=>call('context',{...scope(b),activity:b.activity,round:b.round}),
  controls:b=>call('controls',scope(b)),
  page:b=>call('progress',{...scope(b),controlVersions:b.controlVersions,cursor:b.cursor??null,...(b.activity===undefined?{}:{activity:b.activity})}),
  dfContent:b=>call('df-content',scope(b))
 });
}
