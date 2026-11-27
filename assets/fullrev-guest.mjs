import {fail,int,versions} from './fullrev-progress.mjs?v=20261127b3';

export const GUEST_PENDING = '已存待審，尚未採計';
export function guestScope(value) {
  const cls=String(value?.cls||'').trim(), text=String(value?.seat||'').trim(), seat=Number(text);
  if(!/^[1-9][0-9]{2}$/.test(cls)||!/^\d{1,2}$/.test(text)||!int(seat,1)||seat>60)throw fail('guest-seat-required');
  // Same public seat partition as cutover/model.mjs; the Worker checks actual membership.
  return {cls,seat,classKey:`c${cls}_${Math.ceil(seat/30)}`};
}
export const isGuestContext = c => c?.lane==='guest' && /^[1-9][0-9]{2}$/.test(c.cls)
  && int(c.seat,1)&&c.seat<=60&&c.classKey===guestScope(c).classKey&&versions(c.controlVersions)
  && ['configVersion','unitEpoch','roundEpoch','classUnitEpoch'].every((k,i)=>int(c[k],i===0?1:0));
export const guestFields = c => c?.lane==='guest'?{cls:c.cls,seat:c.seat}:{};
export const guestCompletion = value => value?.completed===true&&value.status==='pending'
  &&value.verified===false&&value.counted===false
  &&typeof value.attemptId==='string'&&/^[\w-]{1,128}_[1-9][0-9]?_[0-4]_[\w-]{43}$/.test(value.attemptId)
  &&value.resultId===undefined;

export async function readGuestContext({profile,course,project,activity,round,request,active}) {
  if(course!=='115-g9'||profile?.provider!=='anonymous'||!profile.guest)throw fail('guest-seat-required');
  const scope=guestScope(profile.guest), body={course,...scope,activity,round};
  const response=await request(body);active();
  const value=await response.json().catch(()=>null);active();
  if(!response.ok)throw fail(value?.error==='not_open'?'not-open':response.status===401?'login-required':response.status===429?'retry-later':value?.error==='not_rostered'?'guest-seat-unavailable':'read-model-pending');
  const c={...value,lane:'guest'};
  if(response.headers.get('cache-control')!=='no-store'||!isGuestContext(c)||c.schemaVersion!==1
    ||c.sourceProject!==project||c.course!==course||c.classKey!==scope.classKey||c.cls!==scope.cls
    ||c.seat!==scope.seat||c.activity!==activity||c.round!==round)throw fail('context-unconfirmed');
  return c;
}

export function mountGuestLogin({host,login,document:doc=globalThis.document,disabled=()=>false}) {
  const details=doc.createElement('details'),summary=doc.createElement('summary');
  details.className='tlogin';summary.textContent='登入不了？用班級＋座號';details.append(summary);
  const form=doc.createElement('form');form.className='ybs-login';form.autocomplete='off';
  for(const [name,title,placeholder] of [['cls','班級','例如 901'],['seat','座號','1–60']]) {
    const label=doc.createElement('label'),input=doc.createElement('input');label.textContent=title;
    input.name=name;input.type='text';input.inputMode='numeric';input.required=true;input.maxLength=name==='cls'?3:2;
    input.pattern=name==='cls'?'[1-9][0-9]{2}':'[0-9]{1,2}';input.placeholder=placeholder;
    label.append(input);form.append(label);
  }
  const note=doc.createElement('p');note.textContent='請確認班級與座號；完成後先存待審，由老師確認採計。';
  const button=doc.createElement('button');button.type='submit';button.className='btn primary';button.textContent='用班級＋座號開始';
  const error=doc.createElement('p');error.setAttribute('role','alert');
  form.append(button);form.onsubmit=async event=>{
    event.preventDefault();if(button.disabled||disabled())return;
    button.disabled=true;error.textContent='';
    try{const value=guestScope({cls:form.querySelector('[name="cls"]').value,seat:form.querySelector('[name="seat"]').value});await login(value);}
    catch(e){error.textContent=e.code==='guest-seat-required'?'請填三位數班級及 1–60 號座號。':'班座登入尚未完成，請確認班座或稍後重試。';}
    finally{button.disabled=false;}
  };
  details.append(note,form,error);host.append(details);return {details,button};
}

export function showGuestPending({value,host,next,document:doc=globalThis.document}) {
  if(!guestCompletion(value))return false;
  host.className='verdict';host.replaceChildren();
  const title=doc.createElement('h3');title.textContent=GUEST_PENDING;host.append(title);
  if(next){const b=doc.createElement('button');b.type='button';b.className='btn primary';b.textContent='下一關';b.onclick=next;host.append(b);}
  host.hidden=false;return true;
}
