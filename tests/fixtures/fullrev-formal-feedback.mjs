import {harness,activities,record,response,snapshot} from './fullrev.mjs';

// A signed-in student has a guest record whose XP still requires teacher confirmation.
export async function formalFeedback({guestActivity=5,guestRound=1,confirmFormal=true}={}) {
  const h=await harness();h.state.owner=false;
  let clock=0;h.state.progressReads=0;
  const page=h.model.page;h.model.page=async input=>{h.state.progressReads++;return page(input);};
  const guest=record(guestRound,{activity:guestActivity,source:'worker-guest-approved',provider:'anonymous',approvalId:'synthetic-approval'});
  h.state.snapshot=snapshot([guest]);
  h.state.fetcher=async(url,init)=>{
    const body=JSON.parse(init.body);
    if(url.endsWith('/answer')) {
      if(body.slot===0)return Response.json(response(1,{correct:true}));
      if(confirmFormal)h.state.snapshot=snapshot([guest,record(body.round)]);
      return Response.json({completed:true,resultId:record(body.round).resultId});
    }
    return Response.json(response());
  };
  const catalog=[{...activities[0],href:'115-g9/synthetic/'},
    {...activities[0],week:6,title:'另一合成活動',href:'115-g9/synthetic-other/'}];
  const cfg={course:'115-g9',week:5,title:'合成正式過關',rounds:activities[0].rounds.map(name=>({name})),
    renderQuestion(question,host,{changed}) {
      const input=document.createElement('input');input.setAttribute('aria-label','合成答案');input.oninput=changed;host.append(input);
      return {get:()=>Number(input.value),ready:()=>input.value!==''};
    }};
  return {...h,catalog,cfg,now:()=>clock,advance(ms=60001){h.advance(ms);clock+=ms;}};
}
