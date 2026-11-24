// 只擷取輸入值；不擷取題面、觀察結果、正解或判分回應。
export function inputState(inputs,reason=e=>e.value.trim()?'':e.tagName==='SELECT'?'請選一項':'請填答案'){
 return {fields:()=>inputs.map((target,k)=>({target,reason:reason(target,k)})),draft:()=>inputs.map(e=>e.value),
  restoreDraft(values){if(!Array.isArray(values)||values.length!==inputs.length||values.some(v=>typeof v!=='string'||v.length>1024))return false;
   if(inputs.some((e,k)=>e.tagName==='SELECT'&&![...e.querySelectorAll('option')].some(o=>o.value===values[k])))return false;
   inputs.forEach((e,k)=>{e.value=values[k];});
   for(const e of inputs){if(e.dispatchEvent){e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}else e.oninput?.();}return true;}};
}
export const indices=(value,length,max,{unique=false}={})=>Array.isArray(value)&&value.length===length&&value.every(v=>v===null||Number.isInteger(v)&&v>=0&&v<max)&&(!unique||new Set(value.filter(v=>v!==null)).size===value.filter(v=>v!==null).length);
let serial=0;
export function answerValidation(handle,host){
 let shown=false,marked=[];const prefix='answer-error-'+(++serial)+'-';
 const remove=e=>e.remove();
 function update(focus=false){
  if(!shown)return false;
  for(const {target,error,described} of marked){target.classList.remove('answer-invalid');target.setAttribute('aria-invalid','false');target.setAttribute('aria-describedby',described);remove(error);}marked=[];
  let fields=handle.fields?.()||[];
  if(!fields.some(f=>f.reason)&&handle.ready&&!handle.ready())fields=[...fields,{target:host,reason:handle.readyReason?.()||'請完成作答'}];
  fields.filter(f=>f.reason).forEach(({target,reason},k)=>{
   if(!target)return;const error=document.createElement('span');error.id=prefix+k;error.className='answer-error';error.textContent=reason;
   const described=target.getAttribute('aria-describedby')||'';
   target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',[described,error.id].filter(Boolean).join(' '));target.classList.add('answer-invalid');
   if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(target.tagName))target.parentElement.append(error);
   else{target.append(error);if(!target.getAttribute('role'))target.setAttribute('role','group');target.tabIndex=-1;}
   marked.push({target,error,described});
  });
  if(focus&&marked.length){const targets=host.querySelectorAll('[aria-invalid="true"]'),first=host.getAttribute('aria-invalid')==='true'?host:targets[0];
   first?.scrollIntoView?.({block:'center',behavior:'auto'});first?.focus?.({preventScroll:true});}
  return marked.length>0;
 }
 return {update,show(){shown=true;return update(true);}};
}
