import {createClient} from '../../assets/fullrev-client.mjs';
export const config={enabled:true,firebase:{projectId:'synthetic-ybs-pr5',apiKey:'synthetic-public-key'},workerOrigin:'https://synthetic-pr5.workers.dev'};
export const opened=Date.parse('2026-11-01T00:00:00Z');
export const controls={gateVersion:1,classGateVersion:1};
export const activities=[{course:'115-g9',week:5,unit:2,title:'合成活動',rounds:['甲','乙','丙','丁'],codes:[],openedAt:opened+20*864e5}];
export const record=(round=0,extra={})=>({schemaVersion:1,source:'worker-validated',resultId:'c_synthetic_'+round,
  uid:'synthetic-student',subject:'synthetic-subject',provider:'password',classKeyAtPass:'c901',sid:'synthetic-sid',
  activity:5,round,unit:2,configVersion:1,contentVersion:'v1',contentHash:'a'.repeat(64),graderVersion:'synthetic-v1',bindingVersion:1,
  unitEpoch:0,roundEpoch:0,completedAt:new Date(opened+864e5).toISOString(),xpPolicySnapshot:{openedAt:new Date(opened).toISOString()},
  validity:{state:'effective',controlVersions:{...controls}},...extra});
export const snapshot=(records=[0,1,2,3].map(r=>record(r)),extra={})=>({schemaVersion:1,sourceProject:config.firebase.projectId,course:'115-g9',
  classKey:'c901',subject:'synthetic-subject',provider:'password',state:'confirmed',complete:true,controlVersions:{...controls},records,
  people:[{subject:'synthetic-subject',cls:901,seat:1,provider:'password'}],...extra});
export const store=(map=new Map())=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map});
export const response=(slot=0,extra={})=>({sid:'s'.repeat(22),nextSeq:slot+1,completed:false,expiresAt:'2026-12-01T00:00:00Z',
  question:{slot,type:'synthetic',title:'合成',instruction:'請輸入數值',data:{value:7}},...extra});
export async function harness(options={}) {
  let clock=opened+864e5, serial=0, provider=options.restoredProvider||'password';const requests=[],reads=[],timers=[],observers=new Set(),eventHandlers=new Map();
  const shared=options.shared||store(),storage=options.storage||store();
  const state={snapshot:snapshot(),context:null,hints:{'115-g9':'c901'},owner:true,enabledTeacher:true,readErrors:{},force:[],uid:'synthetic-student',fetcher:options.fetcher};
  const user=()=>({uid:state.uid,isAnonymous:provider==='anonymous',
    getIdToken:async force=>{state.force.push(force);return 'synthetic-token';},
    getIdTokenResult:async()=>({claims:{firebase:{sign_in_provider:provider},email_verified:true,ybsClassKeys:state.hints}})});
  const changed=v=>{auth.currentUser=v;for(const f of observers)f(v);};
  const auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:f=>{observers.add(f);return()=>observers.delete(f);},
    signOut:async()=>changed(null),signInWithEmailAndPassword:async()=>{provider='password';changed(user());return{user:auth.currentUser};},
    signInWithPopup:async()=>{provider='google.com';changed(user());return{user:auth.currentUser};},
    signInAnonymously:async()=>{provider='anonymous';changed(user());return{user:auth.currentUser};}};
  const session={app:{options:{projectId:config.firebase.projectId}},auth,persistence:'session',googleProvider:()=>({}),
    db:{doc:path=>({get:async()=>{reads.push(path);if(state.readErrors[path])throw state.readErrors[path];if(path.startsWith('ybsTeachers/'))return{exists:state.enabledTeacher,data:()=>({schemaVersion:1,enabled:state.enabledTeacher})};
      if(path==='ybsCourses/115-g9')return{exists:true,data:()=>({schemaVersion:1,ownerUid:state.owner?state.uid:'someone-else'})};throw Error('forbidden path');}}),
      collection:()=>{throw Error('list forbidden');}}};
  const model={controls:async()=>({...state.snapshot.controlVersions}),
    context:async input=>state.context||({schemaVersion:1,sourceProject:config.firebase.projectId,uid:state.uid,subject:'synthetic-subject',...input,
      configVersion:1,bindingVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:{...controls}}),
    page:async()=>({...state.snapshot})};
  if(options.restoredProvider)auth.currentUser=user();
  const clientOptions={requestTimeoutMs:options.requestTimeoutMs??20000,config:{...config,studentGoogleLogin:options.studentGoogleLogin===true},course:options.course||'115-g9',session:async()=>session,readModel:options.noModel?undefined:model,
    shared,storage,now:()=>clock,requestId:options.requestId||(()=>('synthetic-request-'+(++serial))),random:()=>0,
    events:options.events||{addEventListener:(key,fn)=>eventHandlers.set(key,fn)},schedule:(fn,ms)=>{timers.push({fn,ms});return timers.length;},cancel:()=>{},
    fetcher:async(url,init)=>{requests.push({url,...init,body:JSON.parse(init.body)});return state.fetcher?state.fetcher(url,init):Response.json(response());}};
  const client=createClient(clientOptions);
  return {client,reopen:()=>createClient(clientOptions),state,session,auth,requests,reads,model,storage,shared,timers,events:eventHandlers,
    advance:(ms=60001)=>{clock+=ms;},login:()=>client.login('password','9990001','synthetic-password'),changed};
}
