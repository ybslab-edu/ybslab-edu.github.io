// 題面及解答只接受教師授權回應；不載入公開舊教材、不持久保存。
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export async function openTeacherQuestion({client,activity,round,current=()=>true}){
 const profile=client.state().profile;if(!profile?.owner)return null;
 const value=await client.teacherQuestion(activity,round);
 if(!current()||!client.state().profile?.owner||client.state().profile.uid!==profile.uid)return null;
 return value;
}
export function mountTeacherQuestion({host,value,renderQuestion,onNew}){
 const tools=node('div'),stage=node('section'),solution=node('section');tools.id='tbar';solution.id='teacher-solution';solution.hidden=true;
 let disposed=false;
 const button=(id,text,run)=>{const b=node('button',text);b.id=id;b.type='button';b.className='btn';b.onclick=run;tools.append(b);return b;};
 const reveal=button('tb-ans','顯示解答',()=>{solution.hidden=!solution.hidden;reveal.textContent=solution.hidden?'顯示解答':'隱藏解答';});
 button('tb-new','換一組',onNew);
 tools.append(node('p','教師示範，不送出成績。'));
 host.replaceChildren(tools,stage,solution);
 const handle=renderQuestion(value.question,stage,{changed(){},demonstration:true,shell:false,originals:value.originals});
 if(value.originals?.length===value.question.data.photos?.length&&handle.setOriginal){
  let showing=false;const original=button('tb-orig','對照原圖',()=>{showing=!showing;handle.setOriginal(showing);original.setAttribute('aria-pressed',String(showing));});original.setAttribute('aria-pressed','false');
 }
 const {answer,notes,performance}=value.solution,d=value.question.data;
 solution.append(node('h3','本組解答與說明'));
 const sheet=typeof handle.applyTeacherSolution==='function';
 const answers=sheet?[]:Array.isArray(answer)?answer:answer&&typeof answer==='object'?Object.values(answer):[answer];
 const keys=answer&&typeof answer==='object'&&!Array.isArray(answer)?Object.keys(answer):[];
 const describe=(v,k)=>{
  if(d.questions?.[k])return `${d.questions[k][0]}：${v}`;
  if(d.cards&&Number.isInteger(v))return `第 ${k+1} 步：${d.cards[v]}`;
  if(d.options&&Number.isInteger(v))return `${k+1}．${d.options[v]??v}`;
  return `${keys[k]||'第 '+(k+1)+' 項'}：${Array.isArray(v)?v.join('、'):String(v)}`;
 };
 answers.forEach((v,k)=>solution.append(node('p',describe(v,k))));
 notes.forEach(text=>solution.append(node('p',text)));
 if(sheet){
  solution.append(node('p','按「套入解答操作」可對照工作副本、有效操作紀錄與圖表。'));
  button('tb-fill','套入解答操作',()=>{if(handle.applyTeacherSolution(answer)){solution.hidden=false;reveal.textContent='隱藏解答';}});
 }
 // 成果題與數值題沿用既有欄位，解答由 Worker 提供，不在前端推算。
 const fields=[...stage.querySelectorAll('[data-answer-field]')];
 if(!sheet&&fields.length)button('tb-fill','填入解答',()=>{
  // ASCII 編碼共用單一文字欄，Worker 的陣列須轉為可讀回的編碼序列。
  for(const input of fields){const k=input.dataset.answerField;const v=d.mode==='ascii-encode'&&k==='text'&&Array.isArray(answer)?answer.join(' '):answer&&typeof answer==='object'?answer[k]:answer;
   if(v!==undefined){input.value=String(v);input.oninput?.();}}
  solution.hidden=false;reveal.textContent='隱藏解答';
 });
 if(performance)button('tb-play','播放解答演出',()=>handle.feedback?.(performance));
 return {dispose(){if(disposed)return;disposed=true;handle?.dispose?.();host.replaceChildren();value=null;}};
}
