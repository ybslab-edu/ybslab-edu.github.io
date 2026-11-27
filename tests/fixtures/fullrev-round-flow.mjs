import {harness,activities,response,snapshot,record,opened} from './fullrev.mjs';
import {teacherPayload} from './fullrev-teacher.mjs';

// 全部為合成題面、身分與過關紀錄；不呼叫外部服務。
export async function roundFlow({passed=[],owner=false,startLimits=0,retryAfter=2,otherError=null,realTimers=false,guest=false}={}){
 const h=await harness();h.state.owner=owner;h.state.snapshot=snapshot(passed.map(r=>record(r)));
 let clock=opened+864e5;const advance=h.advance;h.advance=(ms=60001)=>{clock+=ms;advance(ms);};h.now=realTimers?Date.now:()=>clock;
 h.state.startLimits=startLimits;h.state.otherError=otherError;
 h.state.guestVersions={configVersion:1,unitEpoch:0,roundEpoch:0,classUnitEpoch:0,controlVersions:{gateVersion:1,classGateVersion:1}};
 h.state.fetcher=async(url,init)=>{
  const body=JSON.parse(init.body);
  if(url.endsWith('/guest/context'))return Response.json({...body,schemaVersion:1,sourceProject:h.client.project,...h.state.guestVersions},{headers:{'cache-control':'no-store'}});
  if(url.endsWith('/teacher-question'))return Response.json(teacherPayload(body),{headers:{'cache-control':'no-store'}});
  if(url.endsWith('/start')){
   if(h.state.startLimits-->0)return Response.json({error:'rate_limited',retryAfter},{status:429});
   if(h.state.otherError==='offline')throw Error('synthetic offline');
   if(h.state.otherError)return Response.json({error:h.state.otherError,retryAfter},{status:429});
  }
  if(url.endsWith('/answer')){
   if(body.slot===0)return Response.json(response(1,{correct:true}));
   if(guest)return Response.json({completed:true,status:'pending',verified:false,counted:false,attemptId:`synthetic-seat_5_${body.round}_`+'x'.repeat(43)});
   h.state.snapshot=snapshot([...h.state.snapshot.records,record(body.round)]);
   return Response.json({completed:true,resultId:record(body.round).resultId});
  }
  return Response.json(response());
 };
 if(realTimers)h.client=h.reopen({schedule:setTimeout,cancel:clearTimeout,now:Date.now,events:window});
 h.login=()=>guest?h.client.login('guest',{cls:'901',seat:1}):h.client.login('password','9990001','synthetic-password');
 const cfg={course:'115-g9',week:5,title:'合成關卡流程',rounds:activities[0].rounds.map((name,i)=>({name,learn:`你已完成第 ${i+1} 關的挑戰。`})),
  renderQuestion(question,host,{changed}){
   const input=document.createElement('input');input.setAttribute('aria-label','合成答案');input.oninput=changed;host.append(input);
   return {get:()=>input.value,ready:()=>input.value!=='',draft:()=>input.value,restoreDraft:value=>{input.value=value;return true;}};
  }};
 return {...h,cfg,catalog:activities};
}
