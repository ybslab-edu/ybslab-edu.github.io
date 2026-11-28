import {growth,exportRows} from './fullrev-progress.mjs?v=20261127b3';
import {mountItemHealth} from './fullrev-item-health.mjs';
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);return el;};
const button=(text,run)=>{const el=node('button',text);el.type='button';el.className='btn';el.onclick=run;return el;};
const time=value=>value?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'時間未留存';
export const teacherCSS=`
.teacher-page{font-size:17px;line-height:1.65;min-width:0}
.teacher-page :is(input,select,button,summary,th,td,p,a,label,caption){font-size:17px}
.teacher-page :is(input,select,button){font-family:inherit;min-height:44px;max-width:100%;box-sizing:border-box}
.teacher-page label{display:block;margin-top:12px}.teacher-page button{margin:6px 6px 6px 0;padding:8px 12px}
.teacher-page select{display:block;width:100%;max-width:540px}.teacher-page input{width:100%;max-width:320px}
.teacher-page .teacher-scroll{overflow:auto;max-height:70vh;max-width:100%;isolation:isolate;border:1px solid #adb4be}
.teacher-page table{border-collapse:separate;border-spacing:0;width:100%}
.teacher-page :is(th,td){padding:12px;border-bottom:1px solid #adb4be;text-align:left;vertical-align:top;min-width:220px}
.teacher-page thead th{position:sticky;top:0;z-index:2;background:var(--surface,#fff);color:var(--ink,#211b17)}
.teacher-page tbody th,.teacher-page thead th:first-child{position:sticky;left:0;min-width:100px;background:var(--surface,#fff);color:var(--ink,#211b17);z-index:1;box-shadow:1px 0 #adb4be}
.teacher-page thead th:first-child{z-index:3}.teacher-page caption{text-align:left;padding:10px}
.teacher-page summary{cursor:pointer;min-height:44px}.teacher-page details p{white-space:normal;min-width:220px}
.teacher-page a{display:inline-flex;align-items:center;min-height:44px}
.teacher-page .item-health{margin-top:32px;min-width:0}.teacher-page .item-health :is(th,td){min-width:110px}
.teacher-page .item-health :is(tbody th,thead th:first-child){min-width:180px;max-width:220px}
.teacher-page .item-health li{font-size:17px;overflow-wrap:anywhere}
.teacher-page :focus-visible{outline:3px solid #7a4ea8;outline-offset:-3px}
`;
// Reuse the strict export validation and XP core; activity filtering is display-only.
export function teacherOverview(snapshots,options,xp){
 const rows=[],people=[];
 for(const snapshot of snapshots){
  const table=exportRows(snapshot,options,xp);if(!rows.length)rows.push(table[0]);rows.push(...table.slice(1));
  const stride=options.activities.reduce((n,a)=>n+a.rounds.length,1);
  for(const [index,person] of snapshot.people.entries()){
   const own={...snapshot,records:snapshot.records.filter(r=>r.subject===person.subject)};
   const result=growth(own,{...options,subject:person.subject,provider:person.provider},xp);
   people.push({...person,classKey:snapshot.classKey,result,rows:table.slice(1+index*stride,1+(index+1)*stride)});
  }
 }
 return {rows,people:people.sort((a,b)=>a.cls-b.cls||a.seat-b.seat||a.classKey.localeCompare(b.classKey))};
}
export function teacherGrowthURL(person){
 const query=new URLSearchParams({classKey:person.classKey,subject:person.subject,cls:String(person.cls),seat:String(person.seat)});
 return '/115-g9/me/?'+query;
}
export function teacherTarget(search){
 const q=new URLSearchParams(search);
 if(!q.has('subject')&&!q.has('classKey'))return null;
 const value=Object.fromEntries(['classKey','subject','cls','seat'].map(k=>[k,q.get(k)||'']));
 if(!/^[\w-]{1,128}$/.test(value.classKey)||!/^[\w-]{1,128}$/.test(value.subject)||! /^[1-9][0-9]{2}$/.test(value.cls)||! /^(?:[1-9]|[1-5][0-9]|60)$/.test(value.seat))throw Error('invalid-teacher-target');
 return value;
}
export function mountTeacherPanel(p,{catalog,xpCore,teacherSnapshots,mountHistory,eventsRefresh,explain}){
 p.root.classList.add('teacher-page');const style=node('style',teacherCSS);document.head.append(style);p.cleanup(()=>style.remove());
 const classKey=node('input');classKey.id='teacher-class';classKey.placeholder='例如 c901';classKey.setAttribute('aria-label','班級代碼');classKey.setAttribute('aria-describedby','teacher-class-help');
 const classLabel=node('label','班級代碼');classLabel.htmlFor=classKey.id;
 const help=node('p','輸入三位數班級代碼，例如 c901。若該班分組，會讀取 c901_1／c901_2；也可直接輸入分組代碼，只查該組。');help.id='teacher-class-help';
 const activity=node('select');activity.id='teacher-activity';activity.setAttribute('aria-label','活動篩選');
 const activityLabel=node('label','活動篩選');activityLabel.htmlFor=activity.id;
 const activities=catalog(),ordered=[...activities].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||b.week-a.week);
 const all=node('option','全部活動');all.value='';activity.append(all);
 for(const a of ordered){const option=node('option',a.title);option.value=String(a.week);activity.append(option);}
 const filterKey='ybslab:fullrev-activity-filter:'+p.client.course;
 let selected=String(ordered.find(a=>typeof isActivityOpen==='function'&&isActivityOpen(a))?.week||'');
 try{const saved=localStorage.getItem(filterKey);if(saved===''||ordered.some(a=>String(a.week)===saved))selected=saved;}catch{}
 activity.value=selected;
 const subject=node('select');subject.id='teacher-student';subject.setAttribute('aria-label','查閱歷史的學生');
 const subjectLabel=node('label','查閱單一學生');subjectLabel.htmlFor=subject.id;
 p.tools.append(classLabel,classKey,help,activityLabel,activity,subjectLabel,subject);
 const health=mountItemHealth(p,{classKey,activity,activities,explain});
 const history=mountHistory({client:p.client,host:p.tools,scope:()=>({classKey:subject.selectedOptions?.[0]?.dataset.classKey||classKey.value.trim(),subject:subject.value.trim()}),life:p});
 subject.oninput=history.clear;
 let reading=0,view=null,query=null,retry=null,retryTimer=null,shownUID=p.client.state().profile?.uid;
 const later=button('稍後重查',()=>{clear();p.status.textContent='已停止這次讀取。老師方便時，請按「讀取有效紀錄」重新查詢。';});later.hidden=true;
 const load=button('讀取有效紀錄',()=>refresh()),download=button('重新確認並下載 Excel',()=>refresh(true));
 function busy(value){load.disabled=value;download.disabled=value;p.content.setAttribute('aria-busy',String(value));}
 busy(false);
 function stopRetry(){clearInterval(retryTimer);retryTimer=null;retry=null;}
 function showRetry(){
  if(!query||!retry||!p.active())return;
  const seconds=Math.max(0,Math.ceil((retry.retryAt-Date.now())/1000)),minutes=Math.floor(seconds/60),rest=seconds%60;
  const wait=seconds===0?'即將':minutes?`${minutes} 分鐘${rest?' '+rest+' 秒':''}後`:`${seconds} 秒後`;
  p.status.textContent=`伺服器忙，第 ${retry.attempt} 次重試；預計${wait}再查詢。老師可按「稍後重查」停止這次讀取。`;
 }
 function clear(){reading++;const old=query;query=null;stopRetry();later.hidden=true;old?.controller.abort();busy(false);view=null;history.clear();subject.replaceChildren();p.content.replaceChildren();health.clear();}
 function render(){
  p.content.replaceChildren();if(!view)return;
  const table=node('table'),head=node('thead'),tr=node('tr');
  table.append(node('caption','每生 × 活動總覽；可展開各關狀態、完成時間與 XP。XP 不代表技能分數。'));
  const shown=activities.filter(a=>!activity.value||String(a.week)===activity.value);
  for(const title of ['班級／座號',...shown.map(a=>a.title),'等級／總 XP','成長紀錄']){const th=node('th',title);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
  const body=node('tbody');
  for(const person of view.people){
   const row=node('tr'),seat=node('th',`${person.cls} 班 ${person.seat} 號`);seat.scope='row';row.append(seat);
   for(const a of shown){
    const detail=person.result.activities.find(v=>v.activity===a.week),cell=node('td'),box=node('details');
    const pending=detail.rounds.filter(r=>r.teacherPending).length;
    box.append(node('summary',`${detail.passed}／${detail.rounds.length} 關${pending?'（'+pending+' 關待老師確認）':''} · ${person.result.totalXP===null?'XP 待確認':detail.totalXP+' XP'}`));
    const offset=activities.slice(0,activities.indexOf(a)).reduce((n,a)=>n+a.rounds.length,0);
    for(const [i,r] of detail.rounds.entries()){
     const source=person.rows[offset+i];
     box.append(node('p',`${r.name}：${r.teacherPending?'訪客紀錄待老師確認':source[4]} · ${source[5]?time(source[5]):r.passed?'時間未留存':'尚無完成時間'} · ${source[6]} XP`));
    }
    box.append(node('p',`活動全過加成：${person.result.totalXP===null?'待確認':detail.completeXP+' XP'}`));
    cell.append(box);row.append(cell);
   }
   row.append(node('td',person.result.totalXP===null?'待老師確認':`Lv ${person.result.level} · ${person.result.totalXP} XP`));
   const cell=node('td'),link=node('a','唯讀成長紀錄');link.href=teacherGrowthURL(person);link.setAttribute('aria-label',`${person.cls} 班 ${person.seat} 號唯讀成長紀錄`);cell.append(link);row.append(cell);body.append(row);
  }
  table.append(body);const scroll=node('div');scroll.className='teacher-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','有效紀錄表');scroll.append(table);p.content.append(scroll);
 }
 function refresh(download=false){
  if(!p.active())return;
  if(query){query.download ||= download;return query.promise;}
  clear();const n=reading,controller=new AbortController(),request={controller,download,promise:null};query=request;
  busy(true);later.hidden=false;p.status.textContent='正在確認班級有效紀錄…';
  request.promise=(async()=>{
  try{
   const snapshots=await teacherSnapshots(p.client,classKey.value.trim(),activities,{signal:controller.signal});
   if(!p.active()||n!==reading||!p.client.state().profile)return;
   const xp=await xpCore();if(!p.active()||n!==reading||!p.client.state().profile)return;
   view=teacherOverview(snapshots,{project:p.client.project,course:p.client.course,activities},xp);
   for(const person of view.people){const option=node('option',`${person.cls} 班 ${person.seat} 號（${person.classKey}）`);option.value=person.subject;option.dataset.classKey=person.classKey;subject.append(option);}
   render();p.status.textContent=view.people.length?'已確認目前有效紀錄。':'已確認班級，目前沒有學生紀錄。';
   if(request.download){
    if(typeof XLSX==='undefined')throw Error('xlsx-unavailable');
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(view.rows),'有效紀錄');
    const url=URL.createObjectURL(new Blob([XLSX.write(book,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=node('a');a.href=url;a.download='YBS_有效紀錄.xlsx';a.click();let revoked=false;const revoke=()=>{if(!revoked){revoked=true;URL.revokeObjectURL(url);}};const timer=setTimeout(revoke,1000);p.cleanup(()=>{clearTimeout(timer);revoke();});
   }
  }catch(e){if(p.active()&&n===reading){clear();p.status.textContent=(e.classKey?`${e.classKey} 讀取失敗；未顯示或匯出部分班級資料。`:'')+explain(e);}}
  finally{if(n===reading){query=null;stopRetry();later.hidden=true;busy(false);}}
  })();
  return request.promise;
 }
 p.tools.append(load,download,later);
 activity.onchange=()=>{try{localStorage.setItem(filterKey,activity.value);}catch{}render();health.clear();};
 classKey.oninput=()=>{clear();p.status.textContent='請重新讀取所選班級。';};
 p.subscribe(p.client,state=>{
  if(!state.profile||state.profile.uid!==shownUID||['stale','binding-changed','context-changed'].includes(state.status))clear();shownUID=state.profile?.uid;
  if(!query)return;
  const waiting=state.readingRetry,key=classKey.value.trim();
  const matches=waiting&&(waiting.classKey===key||/^c[1-9][0-9]{2}$/.test(key)&&[key+'_1',key+'_2'].includes(waiting.classKey));
  if(matches&&['controls','progress'].includes(waiting.operation)){
   retry=waiting;showRetry();if(retryTimer===null)retryTimer=setInterval(showRetry,1000);
  }else if(retry){stopRetry();p.status.textContent='正在確認班級有效紀錄…';}
 });
 p.cleanup(clear);eventsRefresh(p,()=>{clear();p.status.textContent='請重新確認紀錄後匯出。';});
 return p.dispose;
}
